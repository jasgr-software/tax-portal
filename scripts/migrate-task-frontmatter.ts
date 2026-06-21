#!/usr/bin/env tsx
/**
 * scripts/migrate-task-frontmatter.ts — One-shot, idempotent task front-matter migration
 *
 * Phase 0 of the scripted-bookkeeping initiative (PROPOSAL-scripted-bookkeeping.md §5 Phase 0a).
 *
 * Converts task/bug files from the inline markdown bold-field format:
 *
 *   # TASK-006-002: Title
 *   **Status**: done
 *   **Brief**: BRIEF-006
 *   ...
 *
 * to YAML front matter:
 *
 *   ---
 *   brief: BRIEF-006
 *   status: done
 *   ...
 *   ---
 *
 *   # TASK-006-002: Title
 *   ...body...
 *
 * Exports pure functions for testing (no side-effects on import).
 * The CLI main() is guarded by an ESM import.meta.url check.
 *
 * Idempotency: files already starting with `---` (YAML front matter) are detected and skipped.
 * Atomic writes: write to <file>.tmp then fs.renameSync — no partial in-place rewrites.
 * Stable key order: FIELD_MAP order (deterministic, reviewable diff).
 *
 * Safety: only writes to the allowed roots (.implementation/tasks/, _templates/).
 *         Refuses to touch files outside those roots.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as url from "node:url";

import {
  FIELD_MAP,
  lookupByBoldKey,
  serializeFrontMatter,
  type FrontMatter,
} from "./task-frontmatter.js";

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface MigrateResult {
  /** true if the file was changed, false if it was skipped (already migrated or no header block) */
  changed: boolean;
  /** The output text (always set) */
  output: string;
}

export interface ParsedHeaderBlock {
  /** Front-matter key/value pairs extracted from the bold-field header block */
  fm: FrontMatter;
  /** The original lines of the header block (for diagnostic use) */
  headerLines: string[];
  /** Any unknown keys found (not in FIELD_MAP) */
  unknownKeys: string[];
}

// ─── Header block parser ───────────────────────────────────────────────────────
//
// The "header block" is the contiguous run of **Key**: value lines that appears
// BETWEEN the H1 title (# TASK-... / # BUG-...) and the first `---` separator
// or `## ` section heading.
//
// Critical correctness contract: only parse the LEADING header block. Do NOT
// sweep **Key**: patterns that appear inside the body (Work Log, SDET Review,
// Attempt Log, etc.). This is enforced by stopping at the first `---` or `## `.
//
// Both bold-punctuation shapes are handled:
//   **Status**: done    (colon outside the bold span)
//   **Introduces-gate:** yes  (colon inside the bold span)

// Matches: **Key**: value  OR  **Key:** value
// Group 1 = key text (including any trailing colon inside bold)
// Group 2 = value (may be empty)
const BOLD_FIELD_RE = /^\*\*([^*]+?):?\*\*:?\s*(.*)/;

// Inline-comment hint: <!-- ... -->
const INLINE_COMMENT_RE = /<!--[^>]*-->/g;

/** Strip inline-comment hints from a value string. */
function stripInlineComments(s: string): string {
  return s.replace(INLINE_COMMENT_RE, "").trim();
}

/**
 * Strip a trailing inline comment from a raw value field, preserving meaningful
 * value content. Also strips surrounding `<!-- … -->` from the value itself.
 *
 * e.g. "no <!-- e2e: optional -->" → "no"
 *      "done <!-- backlog | ... -->" → "done"
 *      "— <!-- ISO 8601 UTC … -->" → "—"
 */
function cleanValue(raw: string): string {
  return stripInlineComments(raw).trim();
}

/**
 * Parse the acceptance_criteria value into a list when it looks like a comma-separated
 * list of AC IDs. Keeps "none — <justification>" as a single scalar.
 *
 * e.g. "AC-007-01, AC-007-03" → ["AC-007-01", "AC-007-03"]
 *      "none (justification: ...)" → "none (justification: ...)"  (stays scalar)
 */
function parseAcceptanceCriteria(raw: string): string | string[] {
  const cleaned = cleanValue(raw);
  // If it starts with "none" treat as scalar
  if (/^none\b/i.test(cleaned)) return cleaned;
  // Split on comma (or comma-space) — each token should match AC-*
  const parts = cleaned.split(/,\s*/).map((s) => s.trim()).filter(Boolean);
  if (parts.length <= 1) return cleaned; // single AC or free text — keep scalar
  return parts;
}

/**
 * Handle lines where two fields appear on the same line separated by ` · `:
 *   **Brief-type:** feature · **Brief-deploys:** no
 * Returns an array of {key, value} pairs.
 */
function parseCombinedLine(line: string): Array<{ key: string; value: string }> {
  // Split on · separating multiple bold fields
  // Pattern: end of one **field** then ` · ` then start of next **field**
  const segments = line.split(/\s*·\s*(?=\*\*)/);
  const results: Array<{ key: string; value: string }> = [];
  for (const seg of segments) {
    const m = BOLD_FIELD_RE.exec(seg.trim());
    if (m) {
      const rawKey = (m[1] ?? "").replace(/:$/, "").trim();
      const rawVal = m[2] ?? "";
      results.push({ key: rawKey, value: rawVal });
    }
  }
  return results;
}

/**
 * Parse the leading header block from a file's text.
 *
 * @returns ParsedHeaderBlock — extracted field map, original lines, and unknown keys
 */
export function parseHeaderBlock(text: string): ParsedHeaderBlock {
  const lines = text.split("\n");
  const fm: FrontMatter = {};
  const headerLines: string[] = [];
  const unknownKeys: string[] = [];

  // Start scanning after the H1 title line
  let foundH1 = false;
  for (const line of lines) {
    // Skip the H1 title line itself
    if (!foundH1) {
      if (/^# /.test(line)) {
        foundH1 = true;
      }
      // Also skip blank lines before the H1 (shouldn't occur but defensive)
      continue;
    }

    // Stop at the first `---` separator or `## ` section heading
    if (line.trim() === "---" || /^## /.test(line)) {
      break;
    }

    // Skip blank lines within the header block
    if (!line.trim()) continue;

    // Only process lines starting with **
    if (!line.startsWith("**")) continue;

    headerLines.push(line);

    // Handle combined lines (e.g. **Brief-type:** feature · **Brief-deploys:** no)
    const pairs = parseCombinedLine(line);
    for (const { key, value } of pairs) {
      const def = lookupByBoldKey(key);
      const cleanedValue = cleanValue(value);

      if (!def) {
        // Unknown key — preserve as a scalar under auto-derived fm key
        const fmKey = key.toLowerCase().replace(/ /g, "_").replace(/-/g, "_");
        fm[fmKey] = cleanedValue;
        unknownKeys.push(key);
      } else if (def.fmKey === "acceptance_criteria") {
        // Special handling: parse into list when it's a comma-separated AC list
        fm[def.fmKey] = parseAcceptanceCriteria(cleanedValue);
      } else {
        fm[def.fmKey] = cleanedValue;
      }
    }
  }

  return { fm, headerLines, unknownKeys };
}

/**
 * Build the new file content with YAML front matter prepended.
 *
 * The body is:
 *   - The H1 title line
 *   - Everything BELOW the header block (from the first `---` or `## ` onward)
 */
function buildBodyAfterHeaderBlock(text: string): string {
  const lines = text.split("\n");
  let foundH1 = false;
  let inHeaderBlock = false;
  let bodyStart = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";

    if (!foundH1) {
      if (/^# /.test(line)) {
        foundH1 = true;
        inHeaderBlock = true;
      }
      continue;
    }

    if (inHeaderBlock) {
      // End of header block
      if (line.trim() === "---" || /^## /.test(line)) {
        bodyStart = i;
        break;
      }
    }
  }

  if (bodyStart === -1) {
    // No header block found — return text as-is (after H1 line + blank)
    // This handles files with no header fields.
    return text;
  }

  // Body = H1 title line + everything from bodyStart onward
  const h1Line = lines.find((l) => /^# /.test(l)) ?? "";
  const bodyLines = lines.slice(bodyStart);

  return h1Line + "\n\n" + bodyLines.join("\n");
}

/**
 * Migrate a single file's text content:
 *
 * 1. If the file already starts with `---` → skip (idempotent)
 * 2. Parse the leading header block
 * 3. Serialize the extracted fields as YAML front matter (stable FIELD_MAP order)
 * 4. Build the new body (H1 title + everything below the header block)
 * 5. Return { changed: true, output: newText }
 *
 * If no header fields are found, returns { changed: false, output: text }.
 */
export function migrateFileContent(text: string): MigrateResult {
  // Idempotency check: already has front matter
  if (text.startsWith("---")) {
    return { changed: false, output: text };
  }

  const { fm, headerLines, unknownKeys } = parseHeaderBlock(text);

  // If nothing was extracted, nothing to do
  if (Object.keys(fm).length === 0 && headerLines.length === 0) {
    return { changed: false, output: text };
  }

  // Build the YAML front-matter block
  const fmBlock = serializeFrontMatter(fm);

  // Build the body (H1 + everything below the header block)
  const body = buildBodyAfterHeaderBlock(text);

  // Compose: front matter block + body
  const output = fmBlock + "\n" + body;

  // Normalize trailing newline
  const normalizedOutput = output.endsWith("\n") ? output : output + "\n";

  return {
    changed: true,
    output: normalizedOutput,
    // Expose unknownKeys for callers that want to warn
    ...({ unknownKeys } as { unknownKeys: string[] }),
  };
}

// Re-export unknownKeys from migrateFileContent result
export interface MigrateResultWithMeta extends MigrateResult {
  unknownKeys?: string[];
}

/** Version of migrateFileContent that returns unknown keys too. */
export function migrateFileContentWithMeta(text: string): MigrateResultWithMeta {
  if (text.startsWith("---")) {
    return { changed: false, output: text, unknownKeys: [] };
  }

  const { fm, headerLines, unknownKeys } = parseHeaderBlock(text);

  if (Object.keys(fm).length === 0 && headerLines.length === 0) {
    return { changed: false, output: text, unknownKeys: [] };
  }

  const fmBlock = serializeFrontMatter(fm);
  const body = buildBodyAfterHeaderBlock(text);
  const output = fmBlock + "\n" + body;
  const normalizedOutput = output.endsWith("\n") ? output : output + "\n";

  return { changed: true, output: normalizedOutput, unknownKeys };
}

// ─── File walker ───────────────────────────────────────────────────────────────

/**
 * Returns true if a markdown filename is a task/bug lifecycle file (should be migrated).
 *
 * Includes:
 *   TASK-*.md   — task files (any format: TASK-001, TASK-LOE-003, TASK-006-002, etc.)
 *   BUG-*.md    — bug files
 *   task.md     — _templates/task.md
 *   bug.md      — _templates/bug.md
 *
 * Excludes:
 *   RETRO-*.md, HANDOFF-*.md, PROGRESS*.md — support docs without lifecycle headers
 *   build-brief.md, README.md, etc. — non-lifecycle docs
 *
 * DECISION: RETRO and HANDOFF files are excluded because they contain bold fields in
 * body prose (not a lifecycle header block), so the header parser cannot safely extract
 * lifecycle fields from them. They have no lifecycle status/timestamps to migrate.
 */
function isMigratableFile(filename: string): boolean {
  return (
    /^TASK-/i.test(filename) ||
    /^BUG-/i.test(filename) ||
    filename === "task.md" ||
    filename === "bug.md"
  );
}

/**
 * Collect all migratable .md files under a directory (recursive).
 */
function collectMdFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectMdFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".md") && isMigratableFile(entry.name)) {
      results.push(fullPath);
    }
  }
  return results.sort();
}

// ─── Allowed roots (safety: refuses to write outside these) ───────────────────

const ALLOWED_ROOT_SUFFIXES = [
  path.join(".implementation", "tasks"),
  path.join(".implementation", "_templates"),
];

function isAllowedPath(filePath: string, repoRoot: string): boolean {
  const resolved = path.resolve(filePath);
  return ALLOWED_ROOT_SUFFIXES.some((suffix) => {
    const allowedDir = path.resolve(path.join(repoRoot, suffix));
    return resolved.startsWith(allowedDir + path.sep) || resolved === allowedDir;
  });
}

// ─── Atomic write ─────────────────────────────────────────────────────────────

function atomicWrite(filePath: string, content: string): void {
  const tmpPath = filePath + ".tmp";
  try {
    fs.writeFileSync(tmpPath, content, "utf8");
    fs.renameSync(tmpPath, filePath);
  } catch (err) {
    // Clean up tmp file on error
    try {
      fs.unlinkSync(tmpPath);
    } catch {
      // ignore cleanup error
    }
    throw err;
  }
}

// ─── CLI entry point ──────────────────────────────────────────────────────────

export async function runMigration(opts: {
  repoRoot?: string;
  dryRun?: boolean;
  verbose?: boolean;
}): Promise<{ changed: number; skipped: number; warnings: string[] }> {
  const repoRoot =
    opts.repoRoot ??
    path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..");

  const roots = ALLOWED_ROOT_SUFFIXES.map((suffix) =>
    path.join(repoRoot, suffix)
  );

  const allFiles: string[] = [];
  for (const root of roots) {
    allFiles.push(...collectMdFiles(root));
  }

  let changed = 0;
  let skipped = 0;
  const warnings: string[] = [];

  for (const filePath of allFiles) {
    if (!isAllowedPath(filePath, repoRoot)) {
      warnings.push(`SAFETY: refusing to touch ${filePath} (outside allowed roots)`);
      continue;
    }

    const text = fs.readFileSync(filePath, "utf8");
    const result = migrateFileContentWithMeta(text);

    if (result.unknownKeys && result.unknownKeys.length > 0) {
      for (const k of result.unknownKeys) {
        warnings.push(`UNKNOWN KEY "${k}" in ${path.relative(repoRoot, filePath)}`);
      }
    }

    if (!result.changed) {
      skipped++;
      if (opts.verbose) {
        console.log(`  ~ ${path.relative(repoRoot, filePath)} (skipped — already migrated or no header)`);
      }
      continue;
    }

    if (!opts.dryRun) {
      atomicWrite(filePath, result.output);
    }
    changed++;
    console.log(`  + ${path.relative(repoRoot, filePath)}`);
  }

  return { changed, skipped, warnings };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const verbose = args.includes("--verbose") || args.includes("-v");

  console.log("=== task front-matter migration ===");
  if (dryRun) console.log("Mode: DRY RUN (no files written)");

  const { changed, skipped, warnings } = await runMigration({ dryRun, verbose });

  if (warnings.length > 0) {
    console.log("\n[WARNINGS]");
    for (const w of warnings) {
      console.warn(`  ! ${w}`);
    }
  }

  console.log("\n[Summary]");
  console.log(`  Changed: ${changed}`);
  console.log(`  Skipped: ${skipped}`);
  if (dryRun) console.log("  (DRY RUN — no files written)");
  console.log("\n=== migration complete ===");
}

// Run when executed directly (tsx scripts/migrate-task-frontmatter.ts)
const isMain =
  process.argv[1] !== undefined &&
  url.fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  main().catch((err) => {
    console.error("\n[ERROR]", err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
