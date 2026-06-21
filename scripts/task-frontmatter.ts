#!/usr/bin/env tsx
/**
 * scripts/task-frontmatter.ts — Task / bug front-matter schema + verify library
 *
 * Phase 0 of the scripted-bookkeeping initiative (PROPOSAL-scripted-bookkeeping.md §5 Phase 0).
 *
 * Provides:
 *   - FIELD_MAP      — authoritative bold-header → front-matter-key + type table
 *   - parseFrontMatter(text)         — extract key/value pairs from a YAML front-matter block
 *   - serializeFrontMatter(fm)       — emit a deterministic YAML front-matter block (stable order)
 *   - verifyFrontMatter(fm, filePath) → Violation[]  — schema + business-rule checks
 *
 * Zero runtime npm dependencies: hand-rolled scalar/list serializer+parser — matching the
 * zero-dep ethos of db-migrate.ts and db-seed.ts.
 *
 * Independently importable (no CLI side-effects) — consumed by:
 *   - scripts/migrate-task-frontmatter.ts  (Phase 0 one-shot migration)
 *   - scripts/validate-gates.sh delegate   (Phase 0b — TASK-LOE-010-002)
 *
 * CLI usage (when executed directly):
 *   tsx scripts/task-frontmatter.ts --verify <dir>
 *     Scans all TASK-*.md and BUG-*.md files under <dir> (recursively),
 *     parses their front matter, runs verifyFrontMatter() on each, and
 *     prints VIOLATION lines to stdout with exit code 1 if any violations
 *     are found, or a PASS: summary line and exit code 0 if clean.
 *
 *   Output format (one line per violation):
 *     VIOLATION: <file>: <rule>: <message>
 *   Summary on success:
 *     PASS: <n> files verified, 0 violations
 *   Summary on failure:
 *     FAIL: <n> files verified, <m> violations
 */

// ─── Node.js imports (used only by CLI verify mode — tree-shaken when imported as library) ──

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join as joinPath, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";

// ─── Types ─────────────────────────────────────────────────────────────────────

export type FieldType = "scalar" | "list" | "enum";

export interface FieldDef {
  /** The bold-header key(s) as they appear in markdown (without ** markers or trailing : ) */
  boldKeys: string[];
  /** The front-matter key name (snake_case) */
  fmKey: string;
  /** Storage type */
  type: FieldType;
  /** Allowed enum values (only for type=enum) */
  enumValues?: string[];
}

export interface FrontMatter {
  [key: string]: string | string[] | undefined;
}

export interface Violation {
  /** The rule that was violated */
  rule: string;
  /** Human-readable message, naming the file and the offending values */
  message: string;
}

// ─── Field mapping table (§5 Phase 0b / binding reference in task spec) ────────
//
// Order here defines the stable emission order for deterministic diffs.
// Both bold-punctuation shapes are listed in the parser:
//   colon outside bold: **Status**: done
//   colon inside bold:  **Introduces-gate:** yes  /  **Acceptance criteria:** …
//
// DECISION: unknown header keys (not in this table) are preserved verbatim as
// scalar front-matter entries under their snake_case form (lowercased, spaces→_,
// hyphens preserved) so no data is silently dropped. The migration prints a
// warning for any unmapped key found in practice.

export const FIELD_MAP: FieldDef[] = [
  // ── Core lifecycle (tasks + bugs) ───────────────────────────────────────────
  {
    boldKeys: ["Brief"],
    fmKey: "brief",
    type: "scalar",
  },
  {
    boldKeys: ["Epic"], // legacy only (old LOE/pre-brief tasks)
    fmKey: "epic",
    type: "scalar",
  },
  {
    boldKeys: ["Status"],
    fmKey: "status",
    type: "enum",
    enumValues: [
      "backlog",
      "in-progress",
      "review",
      "done",
      "needs-user-direction",
      // Legacy bug status values
      "closed",
      "open",
    ],
  },
  {
    boldKeys: ["Assigned to"],
    fmKey: "assigned_to",
    type: "scalar",
  },
  {
    boldKeys: ["Updated-by"],
    fmKey: "updated_by",
    type: "scalar",
  },
  {
    boldKeys: ["Depends on"],
    fmKey: "depends_on",
    type: "scalar",
  },
  {
    boldKeys: ["Impl"],
    fmKey: "impl",
    type: "enum",
    enumValues: ["developer", "io"],
  },
  {
    boldKeys: ["E2e-required"],
    fmKey: "e2e_required",
    type: "scalar",
  },
  {
    boldKeys: ["Started-at"],
    fmKey: "started_at",
    type: "scalar",
  },
  {
    boldKeys: ["Completed-at"],
    fmKey: "completed_at",
    type: "scalar",
  },
  {
    boldKeys: ["Complexity-estimate"],
    fmKey: "complexity_estimate",
    type: "scalar",
  },
  {
    boldKeys: ["Complexity-actual"],
    fmKey: "complexity_actual",
    type: "scalar",
  },
  // ── Brief metadata ──────────────────────────────────────────────────────────
  {
    boldKeys: ["Brief-type"],
    fmKey: "brief_type",
    type: "enum",
    enumValues: ["feature", "quality", "document", "hotfix"],
  },
  {
    boldKeys: ["Brief-deploys"],
    fmKey: "brief_deploys",
    type: "scalar",
  },
  // ── Gate / test metadata ────────────────────────────────────────────────────
  {
    boldKeys: ["Introduces-gate"],
    fmKey: "introduces_gate",
    type: "enum",
    enumValues: ["yes", "no", "advisory"],
  },
  {
    boldKeys: ["Acceptance criteria"],
    fmKey: "acceptance_criteria",
    type: "list",
  },
  {
    boldKeys: ["Upstream refs"],
    fmKey: "upstream_refs",
    type: "scalar",
  },
  {
    boldKeys: ["Code standards"],
    fmKey: "code_standards",
    type: "scalar",
  },
  // ── Bug-specific fields ─────────────────────────────────────────────────────
  {
    boldKeys: ["Found in"],
    fmKey: "found_in",
    type: "scalar",
  },
  {
    boldKeys: ["Category"],
    fmKey: "category",
    type: "scalar",
  },
  {
    boldKeys: ["Severity"],
    fmKey: "severity",
    type: "enum",
    enumValues: [
      "critical",
      "major",
      "minor",
      // Legacy severity values found in corpus
      "high",
      "blocking",
      "blocker",
    ],
  },
  // ── Legacy fields (pre-Brief era) ───────────────────────────────────────────
  {
    boldKeys: ["Affected flows"],
    fmKey: "affected_flows",
    type: "scalar",
  },
  {
    boldKeys: ["Affected requirements"],
    fmKey: "affected_requirements",
    type: "scalar",
  },
  {
    boldKeys: ["Relevant ADRs"],
    fmKey: "relevant_adrs",
    type: "scalar",
  },
  // ── Other header fields found in corpus survey ───────────────────────────────
  // DECISION: Preserve these as scalars; they appear in the header block of specific files.
  {
    boldKeys: ["Task"],
    fmKey: "task",
    type: "scalar",
  },
  {
    boldKeys: ["Fixes"],
    fmKey: "fixes",
    type: "scalar",
  },
  {
    boldKeys: ["Reviewer"],
    fmKey: "reviewer",
    type: "scalar",
  },
  {
    boldKeys: ["Quad-review"],
    fmKey: "quad_review",
    type: "scalar",
  },
  // Bug-specific filing/tracking fields found in corpus
  {
    boldKeys: ["Found by", "Filed by"],
    fmKey: "found_by",
    type: "scalar",
  },
  {
    boldKeys: ["Found during"],
    fmKey: "found_during",
    type: "scalar",
  },
  {
    boldKeys: ["Raised by"],
    fmKey: "raised_by",
    type: "scalar",
  },
  {
    boldKeys: ["Raised at"],
    fmKey: "raised_at",
    type: "scalar",
  },
  {
    boldKeys: ["Filed at"],
    fmKey: "filed_at",
    type: "scalar",
  },
  {
    boldKeys: ["Blocks"],
    fmKey: "blocks",
    type: "scalar",
  },
  {
    boldKeys: ["Owner"],
    fmKey: "owner",
    type: "scalar",
  },
  {
    boldKeys: ["Reported by"],
    fmKey: "reported_by",
    type: "scalar",
  },
  {
    boldKeys: ["Resolved by"],
    fmKey: "resolved_by",
    type: "scalar",
  },
  {
    boldKeys: ["Fixed-by"],
    fmKey: "fixed_by",
    type: "scalar",
  },
  {
    boldKeys: ["Files changed"],
    fmKey: "files_changed",
    type: "scalar",
  },
  // Fields from BUG-008-001 header block (corpus survey)
  {
    boldKeys: ["Origin"],
    fmKey: "origin",
    type: "scalar",
  },
  {
    boldKeys: ["Disposition"],
    fmKey: "disposition",
    type: "scalar",
  },
];

// Build lookup map: boldKey (lowercase) → FieldDef
const boldKeyMap = new Map<string, FieldDef>();
for (const def of FIELD_MAP) {
  for (const k of def.boldKeys) {
    boldKeyMap.set(k.toLowerCase(), def);
  }
}

// Build lookup map: fmKey → FieldDef
const fmKeyMap = new Map<string, FieldDef>();
for (const def of FIELD_MAP) {
  fmKeyMap.set(def.fmKey, def);
}

/** Return the FieldDef for a bold-header key (case-insensitive, ignoring trailing colon). */
export function lookupByBoldKey(key: string): FieldDef | undefined {
  return boldKeyMap.get(key.toLowerCase().replace(/:$/, "").trim());
}

/** Return the FieldDef for a front-matter key. */
export function lookupByFmKey(fmKey: string): FieldDef | undefined {
  return fmKeyMap.get(fmKey);
}

// ─── Hand-rolled YAML front-matter parser ──────────────────────────────────────
//
// Understands:
//   key: scalar value          →  string
//   key: [a, b, c]             →  string[] (inline list)
//   key:                       →  "" (empty)
//   key: "quoted string"       →  string (strips outer quotes)
//
// Does NOT implement full YAML — only the subset the migration emits.

function unquote(s: string): string {
  const t = s.trim();
  if (
    (t.startsWith('"') && t.endsWith('"')) ||
    (t.startsWith("'") && t.endsWith("'"))
  ) {
    return t.slice(1, -1);
  }
  return t;
}

function parseInlineList(s: string): string[] {
  // s is the bracket content, e.g. 'a, b, c' or '"a b", "c d"'
  const items: string[] = [];
  let current = "";
  let inQuote = false;
  let quoteChar = "";
  for (const ch of s) {
    if (inQuote) {
      if (ch === quoteChar) {
        inQuote = false;
      } else {
        current += ch;
      }
    } else if (ch === '"' || ch === "'") {
      inQuote = true;
      quoteChar = ch;
    } else if (ch === ",") {
      const trimmed = current.trim();
      if (trimmed) items.push(trimmed);
      current = "";
    } else {
      current += ch;
    }
  }
  const trimmed = current.trim();
  if (trimmed) items.push(trimmed);
  return items;
}

/**
 * Parse a YAML front-matter block (the text between the two `---` markers,
 * not including the markers themselves).
 *
 * Returns a FrontMatter object. Values are strings (scalars) or string[] (lists).
 */
export function parseFrontMatter(yamlText: string): FrontMatter {
  const fm: FrontMatter = {};
  for (const line of yamlText.split("\n")) {
    // Skip blank lines and YAML comments
    const stripped = line.trim();
    if (!stripped || stripped.startsWith("#")) continue;

    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;

    const key = line.slice(0, colonIdx).trim();
    const rest = line.slice(colonIdx + 1).trim();

    if (!key) continue;

    // Inline list: key: [a, b, c]
    if (rest.startsWith("[") && rest.endsWith("]")) {
      const inner = rest.slice(1, -1).trim();
      fm[key] = inner ? parseInlineList(inner) : [];
    } else {
      // Scalar (may be empty)
      fm[key] = unquote(rest);
    }
  }
  return fm;
}

/**
 * Extract the front-matter block from a file's full text.
 * Returns { found: true, fm, fmText, bodyAfterFm } if the file starts with `---`.
 * Returns { found: false } otherwise.
 */
export function extractFrontMatter(fileText: string): {
  found: false;
} | {
  found: true;
  fm: FrontMatter;
  fmText: string;
  bodyAfterFm: string;
} {
  if (!fileText.startsWith("---")) {
    return { found: false };
  }

  const afterFirst = fileText.slice(3);
  const closingIdx = afterFirst.indexOf("\n---");
  if (closingIdx === -1) {
    return { found: false };
  }

  const fmText = afterFirst.slice(0, closingIdx);
  const bodyAfterFm = afterFirst.slice(closingIdx + 4); // skip \n---
  // bodyAfterFm starts with either \n or end-of-file
  const body = bodyAfterFm.startsWith("\n") ? bodyAfterFm.slice(1) : bodyAfterFm;

  return {
    found: true,
    fm: parseFrontMatter(fmText),
    fmText,
    bodyAfterFm: body,
  };
}

// ─── Hand-rolled YAML front-matter serializer ─────────────────────────────────
//
// Emits keys in the stable FIELD_MAP order, then any extra keys in insertion order.
// Scalar values: key: value  (no quotes unless value contains `:` or `#` or leading space)
// List values: key: [a, b, c]  (inline)
// Empty values: key: (empty string)
//
// DECISION: inline-comment hints (<!-- ... -->) attached to template fields are dropped
// during migration — they document the field for human authors; front-matter is the
// machine layer where such hints are not meaningful. The body prose remains.

function needsQuoting(value: string): boolean {
  if (!value) return false;
  // Quote if: starts/ends with whitespace, contains inline comment marker, is a YAML reserved word.
  // DECISION: pure integers (e.g. "3" for complexity) are emitted unquoted — they round-trip
  // cleanly and the parseFrontMatter() unquote() call handles either form.
  return (
    value.startsWith(" ") ||
    value.endsWith(" ") ||
    value.includes(" #") ||
    value.startsWith("#") ||
    value === "true" ||
    value === "false" ||
    value === "null"
  );
}

/**
 * Serialize a FrontMatter object to a `---\n...\n---\n` YAML front-matter block.
 *
 * Keys are emitted in FIELD_MAP order, then any extras in insertion order.
 * Values are scalars or inline lists.
 */
export function serializeFrontMatter(fm: FrontMatter): string {
  const lines: string[] = ["---"];

  const emittedKeys = new Set<string>();

  // Emit in FIELD_MAP order
  for (const def of FIELD_MAP) {
    const val = fm[def.fmKey];
    if (val === undefined) continue; // key not present in this file
    emittedKeys.add(def.fmKey);
    lines.push(serializeField(def.fmKey, val));
  }

  // Emit any extra keys (unknown fields preserved verbatim)
  for (const [k, v] of Object.entries(fm)) {
    if (emittedKeys.has(k) || v === undefined) continue;
    lines.push(serializeField(k, v));
  }

  lines.push("---");
  return lines.join("\n") + "\n";
}

function serializeField(key: string, value: string | string[]): string {
  if (Array.isArray(value)) {
    if (value.length === 0) return `${key}: []`;
    const items = value.map((v) => {
      // Quote items containing commas or brackets
      if (v.includes(",") || v.includes("[") || v.includes("]") || v.includes('"')) {
        return `"${v.replace(/"/g, '\\"')}"`;
      }
      return v;
    });
    return `${key}: [${items.join(", ")}]`;
  }
  // Scalar
  if (value === "") return `${key}:`;
  // Pure dashes (sentinel values like —) are safe unquoted
  if (needsQuoting(value)) {
    return `${key}: "${value.replace(/"/g, '\\"')}"`;
  }
  return `${key}: ${value}`;
}

// ─── File collection helper (for CLI verify mode) ─────────────────────────────

/**
 * Collect all TASK-*.md and BUG-*.md files under a directory tree.
 * Matches the same predicate used in migrate-task-frontmatter.ts.
 */
function collectTaskFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const results: string[] = [];
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = joinPath(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectTaskFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      if (/^TASK-/i.test(entry.name) || /^BUG-/i.test(entry.name)) {
        results.push(fullPath);
      }
    }
  }
  return results.sort();
}

// ─── Schema verify ─────────────────────────────────────────────────────────────

const STATUS_ENUM = new Set([
  "backlog",
  "in-progress",
  "review",
  "done",
  "needs-user-direction",
  "closed",  // legacy bug status
  "open",    // legacy bug status
]);

const INTRODUCES_GATE_ENUM = new Set(["yes", "no", "advisory"]);
const IMPL_ENUM = new Set(["developer", "io"]);
const BRIEF_TYPE_ENUM = new Set(["feature", "quality", "document", "hotfix"]);

/** ISO 8601 UTC date-time: YYYY-MM-DDTHH:MM:SSZ or YYYY-MM-DDThh:mm:ss.sssZ */
const ISO8601_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

function isIso8601(s: string): boolean {
  return ISO8601_RE.test(s);
}

function isEmptyOrDash(s: string | undefined): boolean {
  return s === undefined || s === "" || s === "—" || s === "-";
}

function parseComplexity(s: string | undefined): number | null {
  if (isEmptyOrDash(s)) return null;
  const n = parseInt(s as string, 10);
  if (isNaN(n)) return NaN;
  return n;
}

/**
 * Validate a parsed front-matter object against the Phase-0 schema.
 *
 * @param fm       - The parsed front-matter object
 * @param filePath - File path for diagnostic messages (named in violations)
 * @returns Array of violations. Empty array = passes all checks.
 */
export function verifyFrontMatter(fm: FrontMatter, filePath: string = "<unknown>"): Violation[] {
  const violations: Violation[] = [];

  // ── Status enum ─────────────────────────────────────────────────────────────
  const status = fm["status"] as string | undefined;
  if (status !== undefined && !isEmptyOrDash(status)) {
    if (!STATUS_ENUM.has(status)) {
      violations.push({
        rule: "status.enum",
        message: `${filePath}: illegal status "${status}" — must be one of: ${[...STATUS_ENUM].join(", ")}`,
      });
    }
  }

  // ── Introduces-gate enum ────────────────────────────────────────────────────
  const gate = fm["introduces_gate"] as string | undefined;
  if (gate !== undefined && !isEmptyOrDash(gate)) {
    // Strip inline comment (anything after #)
    const gateClean = gate.split("#")[0]?.trim() ?? "";
    if (gateClean && !INTRODUCES_GATE_ENUM.has(gateClean)) {
      violations.push({
        rule: "introduces_gate.enum",
        message: `${filePath}: illegal introduces_gate "${gateClean}" — must be one of: yes, no, advisory`,
      });
    }
  }

  // ── Impl enum ───────────────────────────────────────────────────────────────
  const impl = fm["impl"] as string | undefined;
  if (impl !== undefined && !isEmptyOrDash(impl)) {
    if (!IMPL_ENUM.has(impl)) {
      violations.push({
        rule: "impl.enum",
        message: `${filePath}: illegal impl "${impl}" — must be one of: developer, io`,
      });
    }
  }

  // ── Brief-type enum ─────────────────────────────────────────────────────────
  const briefType = fm["brief_type"] as string | undefined;
  if (briefType !== undefined && !isEmptyOrDash(briefType)) {
    if (!BRIEF_TYPE_ENUM.has(briefType)) {
      violations.push({
        rule: "brief_type.enum",
        message: `${filePath}: illegal brief_type "${briefType}" — must be one of: ${[...BRIEF_TYPE_ENUM].join(", ")}`,
      });
    }
  }

  // ── Complexity estimate ∈ 1..5 ──────────────────────────────────────────────
  const estimate = fm["complexity_estimate"] as string | undefined;
  const estimateN = parseComplexity(estimate);
  if (estimateN !== null) {
    if (isNaN(estimateN) || estimateN < 1 || estimateN > 5) {
      violations.push({
        rule: "complexity_estimate.range",
        message: `${filePath}: complexity_estimate "${estimate}" is out of range — must be 1..5 or empty`,
      });
    }
  }

  // ── Complexity actual ∈ 1..5 ────────────────────────────────────────────────
  const actual = fm["complexity_actual"] as string | undefined;
  const actualN = parseComplexity(actual);
  if (actualN !== null) {
    if (isNaN(actualN) || actualN < 1 || actualN > 5) {
      violations.push({
        rule: "complexity_actual.range",
        message: `${filePath}: complexity_actual "${actual}" is out of range — must be 1..5 or empty`,
      });
    }
  }

  // ── started_at format ───────────────────────────────────────────────────────
  const startedAt = fm["started_at"] as string | undefined;
  if (!isEmptyOrDash(startedAt) && startedAt) {
    if (!isIso8601(startedAt)) {
      violations.push({
        rule: "started_at.format",
        message: `${filePath}: started_at "${startedAt}" is not a valid ISO 8601 UTC timestamp (YYYY-MM-DDTHH:MM:SSZ)`,
      });
    }
  }

  // ── completed_at format ─────────────────────────────────────────────────────
  const completedAt = fm["completed_at"] as string | undefined;
  if (!isEmptyOrDash(completedAt) && completedAt) {
    if (!isIso8601(completedAt)) {
      violations.push({
        rule: "completed_at.format",
        message: `${filePath}: completed_at "${completedAt}" is not a valid ISO 8601 UTC timestamp (YYYY-MM-DDTHH:MM:SSZ)`,
      });
    }
  }

  // ── Clock inversion: completed_at >= started_at ──────────────────────────────
  // This catches the known TASK-006-002 bug: completed_at 20:06:28Z < started_at 20:15:00Z
  if (
    !isEmptyOrDash(startedAt) &&
    !isEmptyOrDash(completedAt) &&
    startedAt &&
    completedAt &&
    isIso8601(startedAt) &&
    isIso8601(completedAt)
  ) {
    const startTs = new Date(startedAt).getTime();
    const doneTs = new Date(completedAt).getTime();
    if (doneTs < startTs) {
      violations.push({
        rule: "clock.inversion",
        message: `${filePath}: clock inversion — completed_at (${completedAt}) is BEFORE started_at (${startedAt})`,
      });
    }
  }

  // ── Lifecycle: done tasks must have all 4 metadata fields filled ─────────────
  // Mirrors the pre-migration validate-gates.sh _check_done_metadata obligation:
  // any task with status=done must have started_at, completed_at,
  // complexity_estimate, and complexity_actual filled (not empty/dash).
  // This preserves the identical-verdict guarantee (AC-LOE-010-04).
  const isDone = status === "done";
  if (isDone) {
    if (isEmptyOrDash(startedAt)) {
      violations.push({
        rule: "done.started_at.required",
        message: `${filePath}: done task missing started_at — must be ISO 8601 UTC timestamp`,
      });
    }
    if (isEmptyOrDash(completedAt)) {
      violations.push({
        rule: "done.completed_at.required",
        message: `${filePath}: done task missing completed_at — must be ISO 8601 UTC timestamp`,
      });
    }
    if (isEmptyOrDash(estimate) || estimateN === null) {
      violations.push({
        rule: "done.complexity_estimate.required",
        message: `${filePath}: done task missing complexity_estimate — must be 1..5`,
      });
    }
    if (isEmptyOrDash(actual) || actualN === null) {
      violations.push({
        rule: "done.complexity_actual.required",
        message: `${filePath}: done task missing complexity_actual — must be 1..5`,
      });
    }
  }

  return violations;
}

// ─── CLI entrypoint (--verify <dir>) ──────────────────────────────────────────
//
// DECISION: Added as a thin direct-run guard here (mirroring the
// import.meta.url === path.resolve(process.argv[1]) pattern from
// migrate-task-frontmatter.ts) rather than a separate wrapper script.
// Rationale: keeps the schema + verify logic and the CLI delegate
// co-located; avoids an extra module for validate-gates.sh to discover.
// bash invokes: tsx scripts/task-frontmatter.ts --verify <dir>
// and consumes exit code (0 = clean, 1 = violations found / error).
//
// validate-gates.sh passes the tasks directory so the check is confined
// to the repo-controlled task tree — no untrusted input paths.

function cliVerify(dir: string): void {
  const files = collectTaskFiles(dir);
  let totalViolations = 0;

  for (const filePath of files) {
    let text: string;
    try {
      text = readFileSync(filePath, "utf8");
    } catch (err) {
      console.log(`VIOLATION: ${filePath}: io: cannot read file`);
      totalViolations++;
      continue;
    }

    const result = extractFrontMatter(text);
    if (!result.found) {
      // File has no front matter — this is a violation in the migrated world
      console.log(`VIOLATION: ${filePath}: front_matter.missing: file has no YAML front-matter block`);
      totalViolations++;
      continue;
    }

    const violations = verifyFrontMatter(result.fm, filePath);
    for (const v of violations) {
      console.log(`VIOLATION: ${filePath}: ${v.rule}: ${v.message}`);
      totalViolations++;
    }
  }

  if (totalViolations === 0) {
    console.log(`PASS: ${files.length} files verified, 0 violations`);
    process.exit(0);
  } else {
    console.log(`FAIL: ${files.length} files verified, ${totalViolations} violations`);
    process.exit(1);
  }
}

// Run when executed directly (tsx scripts/task-frontmatter.ts --verify <dir>)
const isMain =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === resolvePath(process.argv[1]);

if (isMain) {
  const args = process.argv.slice(2);
  const verifyIdx = args.indexOf("--verify");
  if (verifyIdx === -1 || !args[verifyIdx + 1]) {
    console.error("Usage: tsx scripts/task-frontmatter.ts --verify <dir>");
    process.exit(1);
  }
  const targetDir = args[verifyIdx + 1];
  cliVerify(targetDir);
}
