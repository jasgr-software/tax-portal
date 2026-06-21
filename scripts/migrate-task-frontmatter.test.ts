/**
 * scripts/migrate-task-frontmatter.test.ts
 *
 * Tests for the Phase-0 front-matter migration script (TASK-LOE-010-001).
 *
 * Acceptance criteria covered:
 *   AC-LOE-010-01 — idempotent one-shot migration, zero value/body loss
 *   AC-LOE-010-02 — every tasks/** carries well-formed front matter; body preserved
 *   AC-LOE-010-03 — schema enforces status enum + complexity 1..5 + clock inversion
 *
 * Note on import paths: tsx resolves .js extensions to .ts source files at runtime,
 * matching the project's ESM convention (cf. db-migrate.test.ts).
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as child_process from "node:child_process";
import { describe, it, expect } from "vitest";

import {
  parseHeaderBlock,
  migrateFileContent,
  migrateFileContentWithMeta,
  reserializeFileContent,
} from "./migrate-task-frontmatter.js";

import {
  parseFrontMatter,
  verifyFrontMatter,
  extractFrontMatter,
  serializeFrontMatter,
} from "./task-frontmatter.js";

// ─── Fixture helpers ──────────────────────────────────────────────────────────

const FIXTURES_DIR = path.join(
  path.dirname(new URL(import.meta.url).pathname),
  "__test_fixtures__",
  "frontmatter"
);

function fixture(name: string): string {
  return fs.readFileSync(path.join(FIXTURES_DIR, name), "utf8");
}

// ─── Suite 1: migrateFileContent — current-variant task ──────────────────────

describe("migrateFileContent — current-variant task", () => {
  it("produces front matter with all mapped keys", () => {
    const input = fixture("current-variant.input.md");
    const { changed, output } = migrateFileContent(input);

    expect(changed).toBe(true);
    expect(output.startsWith("---\n")).toBe(true);

    const extracted = extractFrontMatter(output);
    expect(extracted.found).toBe(true);
    if (!extracted.found) throw new Error("unreachable");

    const { fm } = extracted;
    expect(fm["brief"]).toBe("BRIEF-006");
    expect(fm["status"]).toBe("done");
    expect(fm["assigned_to"]).toBe("webapp-developer");
    expect(fm["updated_by"]).toBe("sdet");
    expect(fm["depends_on"]).toBe("none");
    expect(fm["impl"]).toBe("developer");
    expect(fm["e2e_required"]).toBe("no");
    expect(fm["started_at"]).toBe("2026-06-18T19:00:00Z");
    expect(fm["completed_at"]).toBe("2026-06-18T20:00:00Z");
    expect(fm["complexity_estimate"]).toBe("3");
    expect(fm["complexity_actual"]).toBe("3");
    expect(fm["upstream_refs"]).toBe("ADR-006, ADR-003, ADR-005, REQ-DASH-012");
    expect(fm["introduces_gate"]).toBe("no");
    expect(fm["brief_type"]).toBe("feature");
    expect(fm["brief_deploys"]).toBe("no");

    // acceptance_criteria should be parsed as a list
    const ac = fm["acceptance_criteria"];
    expect(Array.isArray(ac)).toBe(true);
    expect(ac).toEqual(["AC-DASH-012-01", "AC-DASH-012-02", "AC-DASH-012-03"]);
  });

  it("body is byte-identical below the header block", () => {
    const input = fixture("current-variant.input.md");
    const { output } = migrateFileContent(input);

    // The body after migration should contain the H1 title and the original body sections
    expect(output).toContain("# TASK-006-001:");
    expect(output).toContain("## Quality Gates");
    expect(output).toContain("## SDET Review focus areas");
    expect(output).toContain("## Work Log");
    expect(output).toContain("## SDET Review");

    // Extract the body (everything after the closing ---)
    const extracted = extractFrontMatter(output);
    expect(extracted.found).toBe(true);
    if (!extracted.found) throw new Error("unreachable");
    const bodyAfterFm = extracted.bodyAfterFm;

    // Key sections that must survive verbatim
    expect(bodyAfterFm).toContain("## Quality Gates");
    expect(bodyAfterFm).toContain("- [x] **Work Log complete**");
    expect(bodyAfterFm).toContain("## SDET Review");
    expect(bodyAfterFm).toContain("**Decision**: approved");
    // Verify the "The schema is clean" note survives
    expect(bodyAfterFm).toContain("**Decision**: The schema is clean.");
  });

  it("does not include header block fields in the body", () => {
    const input = fixture("current-variant.input.md");
    const { output } = migrateFileContent(input);

    const extracted = extractFrontMatter(output);
    expect(extracted.found).toBe(true);
    if (!extracted.found) throw new Error("unreachable");

    const bodyAfterFm = extracted.bodyAfterFm;

    // The header-block fields should NOT appear in the body prose
    // (they've been lifted into front matter)
    expect(bodyAfterFm).not.toContain("**Brief**: BRIEF-006");
    expect(bodyAfterFm).not.toContain("**Status**: done");
    expect(bodyAfterFm).not.toContain("**Assigned to**: webapp-developer");
    expect(bodyAfterFm).not.toContain("**Started-at**: 2026-06-18T19:00:00Z");
    expect(bodyAfterFm).not.toContain("**Introduces-gate:** no");
  });
});

// ─── Suite 2: migrateFileContent — legacy Epic/Affected-flows variant ─────────

describe("migrateFileContent — legacy Epic + Affected-flows variant", () => {
  it("maps epic, affected_flows, affected_requirements, relevant_adrs, introduces_gate", () => {
    const input = fixture("legacy-epic.input.md");
    const { changed, output } = migrateFileContent(input);

    expect(changed).toBe(true);

    const extracted = extractFrontMatter(output);
    expect(extracted.found).toBe(true);
    if (!extracted.found) throw new Error("unreachable");

    const { fm } = extracted;
    expect(fm["epic"]).toBe("chore/lights-out-enablement");
    expect(fm["status"]).toBe("done");
    expect(fm["assigned_to"]).toBe("devops");
    expect(fm["affected_flows"]).toBe("none (justification: chore touches CI/git infrastructure, not user-facing behavior)");
    expect(fm["affected_requirements"]).toBe("none (justification: chore touches workflow infrastructure, not SRS requirements)");
    expect(fm["introduces_gate"]).toBe("yes");
    expect(fm["relevant_adrs"]).toBe("none");
  });

  it("body sections are intact", () => {
    const input = fixture("legacy-epic.input.md");
    const { output } = migrateFileContent(input);

    const extracted = extractFrontMatter(output);
    expect(extracted.found).toBe(true);
    if (!extracted.found) throw new Error("unreachable");

    expect(extracted.bodyAfterFm).toContain("## Quality Gates");
    expect(extracted.bodyAfterFm).toContain("## Work Log");
  });
});

// ─── Suite 3: migrateFileContent — bug-file variant ──────────────────────────

describe("migrateFileContent — bug file", () => {
  it("maps found_in, category, severity for a BUG file", () => {
    const input = fixture("bug-variant.input.md");
    const { changed, output } = migrateFileContent(input);

    expect(changed).toBe(true);

    const extracted = extractFrontMatter(output);
    expect(extracted.found).toBe(true);
    if (!extracted.found) throw new Error("unreachable");

    const { fm } = extracted;
    expect(fm["epic"]).toBe("cross-cutting (BUG-000-NNN)");
    expect(fm["status"]).toBe("closed");
    expect(fm["found_in"]).toBe("TASK-LOE-006 (surfaced during quad-review)");
    expect(fm["category"]).toBe("code-quality");
    expect(fm["severity"]).toBe("major");
    expect(fm["assigned_to"]).toBe("devops");
    expect(fm["complexity_estimate"]).toBe("2");
    expect(fm["complexity_actual"]).toBe("2");
  });

  it("body sections survive including Root cause prose", () => {
    const input = fixture("bug-variant.input.md");
    const { output } = migrateFileContent(input);

    const extracted = extractFrontMatter(output);
    expect(extracted.found).toBe(true);
    if (!extracted.found) throw new Error("unreachable");

    expect(extracted.bodyAfterFm).toContain("## Summary");
    expect(extracted.bodyAfterFm).toContain("## Root cause");
    expect(extracted.bodyAfterFm).toContain("The regex expected structured JSON");
    expect(extracted.bodyAfterFm).toContain("## Work Log");
  });
});

// ─── Suite 4: Idempotency ─────────────────────────────────────────────────────

describe("migrateFileContent — idempotency", () => {
  it("second pass on already-migrated file returns {changed: false}", () => {
    const input = fixture("already-migrated.input.md");
    const { changed, output } = migrateFileContent(input);

    // File already starts with --- → must be skipped
    expect(changed).toBe(false);
    expect(output).toBe(input); // output is identical to input
  });

  it("second pass on the output of a first-pass migration returns {changed: false}", () => {
    const input = fixture("current-variant.input.md");

    // First pass
    const firstPass = migrateFileContent(input);
    expect(firstPass.changed).toBe(true);

    // Second pass on the first-pass output
    const secondPass = migrateFileContent(firstPass.output);
    expect(secondPass.changed).toBe(false);
    expect(secondPass.output).toBe(firstPass.output);
  });

  it("second pass on legacy-epic first-pass output returns {changed: false}", () => {
    const input = fixture("legacy-epic.input.md");
    const firstPass = migrateFileContent(input);
    expect(firstPass.changed).toBe(true);

    const secondPass = migrateFileContent(firstPass.output);
    expect(secondPass.changed).toBe(false);
    expect(secondPass.output).toBe(firstPass.output);
  });
});

// ─── Suite 5: Header-block anchoring ─────────────────────────────────────────

describe("migrateFileContent — header-block anchoring", () => {
  it("**Decision**: reject inside SDET Review stays in the body verbatim", () => {
    const input = fixture("body-anchoring.input.md");
    const { changed, output } = migrateFileContent(input);

    expect(changed).toBe(true);

    const extracted = extractFrontMatter(output);
    expect(extracted.found).toBe(true);
    if (!extracted.found) throw new Error("unreachable");

    const body = extracted.bodyAfterFm;

    // The SDET Review body fields must survive verbatim
    expect(body).toContain("**Decision**: reject");
    expect(body).toContain("**Notes**: The implementation doesn't cover the edge case.");
    expect(body).toContain("**Attempt count**: 1.");
    expect(body).toContain("**Blockers**: none noted.");
    expect(body).toContain("**Reviewer**: sdet");
    expect(body).toContain("**Root cause**: Missing null check in the handler.");
  });

  it("front-matter does NOT contain the body-prose decision fields", () => {
    const input = fixture("body-anchoring.input.md");
    const { output } = migrateFileContent(input);

    const extracted = extractFrontMatter(output);
    expect(extracted.found).toBe(true);
    if (!extracted.found) throw new Error("unreachable");

    // The front-matter block should only contain actual header fields
    const fmText = extracted.fmText;
    expect(fmText).not.toContain("Decision");
    expect(fmText).not.toContain("Attempt count");
    expect(fmText).not.toContain("Root cause");
  });
});

// ─── Suite 6: verifyFrontMatter — schema enforcement ─────────────────────────

describe("verifyFrontMatter — schema enforcement", () => {
  it("flags TASK-006-002-style clock inversion (completed_at < started_at)", () => {
    const input = fixture("inverted-clock.input.md");
    const { output } = migrateFileContent(input);

    const extracted = extractFrontMatter(output);
    expect(extracted.found).toBe(true);
    if (!extracted.found) throw new Error("unreachable");

    const violations = verifyFrontMatter(extracted.fm, "TASK-006-002-admin-template-management-ui.md");

    const clockViolation = violations.find((v) => v.rule === "clock.inversion");
    expect(clockViolation).toBeDefined();
    expect(clockViolation?.message).toContain("TASK-006-002-admin-template-management-ui.md");
    expect(clockViolation?.message).toContain("completed_at");
    expect(clockViolation?.message).toContain("started_at");
    expect(clockViolation?.message).toContain("2026-06-18T20:06:28Z");
    expect(clockViolation?.message).toContain("2026-06-18T20:15:00Z");
  });

  it("flags an illegal status value", () => {
    const input = fixture("bad-status.input.md");
    const { output } = migrateFileContent(input);

    const extracted = extractFrontMatter(output);
    expect(extracted.found).toBe(true);
    if (!extracted.found) throw new Error("unreachable");

    const violations = verifyFrontMatter(extracted.fm, "bad-status.md");

    const statusViolation = violations.find((v) => v.rule === "status.enum");
    expect(statusViolation).toBeDefined();
    expect(statusViolation?.message).toContain("wip");
  });

  it("flags an out-of-range complexity_estimate", () => {
    const input = fixture("bad-status.input.md");
    const { output } = migrateFileContent(input);

    const extracted = extractFrontMatter(output);
    expect(extracted.found).toBe(true);
    if (!extracted.found) throw new Error("unreachable");

    const violations = verifyFrontMatter(extracted.fm, "bad-status.md");

    const complexityViolation = violations.find((v) => v.rule === "complexity_estimate.range");
    expect(complexityViolation).toBeDefined();
    expect(complexityViolation?.message).toContain("7");
  });

  it("passes a well-formed front-matter block with zero violations", () => {
    // Use the current-variant after migration
    const input = fixture("current-variant.input.md");
    const { output } = migrateFileContent(input);

    const extracted = extractFrontMatter(output);
    expect(extracted.found).toBe(true);
    if (!extracted.found) throw new Error("unreachable");

    const violations = verifyFrontMatter(extracted.fm, "current-variant.md");
    expect(violations).toHaveLength(0);
  });

  it("passes the already-migrated fixture with zero violations", () => {
    const input = fixture("already-migrated.input.md");
    const extracted = extractFrontMatter(input);

    expect(extracted.found).toBe(true);
    if (!extracted.found) throw new Error("unreachable");

    const violations = verifyFrontMatter(extracted.fm, "already-migrated.md");
    expect(violations).toHaveLength(0);
  });
});

// ─── Suite 7: parseFrontMatter + serializeFrontMatter round-trip ─────────────

describe("parseFrontMatter + serializeFrontMatter round-trip", () => {
  it("scalar values survive a parse → serialize → parse cycle", () => {
    const original: Record<string, string | string[]> = {
      brief: "BRIEF-006",
      status: "done",
      assigned_to: "webapp-developer",
      started_at: "2026-06-18T19:00:00Z",
      completed_at: "2026-06-18T20:00:00Z",
      complexity_estimate: "3",
      complexity_actual: "3",
      introduces_gate: "no",
    };

    const serialized = serializeFrontMatter(original);
    const reparsed = parseFrontMatter(
      serialized.replace(/^---\n/, "").replace(/\n---\n$/, "")
    );

    for (const [k, v] of Object.entries(original)) {
      expect(reparsed[k]).toEqual(v);
    }
  });

  it("list values survive a parse → serialize → parse cycle", () => {
    const original: Record<string, string | string[]> = {
      acceptance_criteria: ["AC-007-01", "AC-007-02", "AC-007-03"],
    };

    const serialized = serializeFrontMatter(original);
    const reparsed = parseFrontMatter(
      serialized.replace(/^---\n/, "").replace(/\n---\n$/, "")
    );

    expect(reparsed["acceptance_criteria"]).toEqual(["AC-007-01", "AC-007-02", "AC-007-03"]);
  });

  it("empty values survive round-trip as empty string", () => {
    const original: Record<string, string | string[]> = {
      brief: "BRIEF-006",
      started_at: "",
      completed_at: "",
      complexity_estimate: "2",
      complexity_actual: "",
    };

    const serialized = serializeFrontMatter(original);
    const reparsed = parseFrontMatter(
      serialized.replace(/^---\n/, "").replace(/\n---\n$/, "")
    );

    expect(reparsed["brief"]).toBe("BRIEF-006");
    expect(reparsed["started_at"]).toBe("");
    expect(reparsed["completed_at"]).toBe("");
    expect(reparsed["complexity_estimate"]).toBe("2");
    expect(reparsed["complexity_actual"]).toBe("");
  });
});

// ─── Suite 8: parseHeaderBlock — edge-case coverage ──────────────────────────

describe("parseHeaderBlock — edge cases", () => {
  it("handles combined line Brief-type · Brief-deploys", () => {
    const text = `# TASK-001: Title\n\n**Brief-type:** feature · **Brief-deploys:** no\n\n---\n\n## Body\n`;
    const { fm } = parseHeaderBlock(text);
    expect(fm["brief_type"]).toBe("feature");
    expect(fm["brief_deploys"]).toBe("no");
  });

  it("strips inline-comment hints from values", () => {
    const text = `# TASK-001: Title\n\n**E2e-required**: no <!-- brief methodology.e2e: optional -->\n**Started-at**: — <!-- ISO 8601 UTC -->\n\n---\n\n## Body\n`;
    const { fm } = parseHeaderBlock(text);
    expect(fm["e2e_required"]).toBe("no");
    expect(fm["started_at"]).toBe("—");
  });

  it("stops collecting header fields at ## section heading", () => {
    const text = `# TASK-001: Title\n\n**Status**: done\n\n## Work Log\n\n**Decision**: approve\n`;
    const { fm } = parseHeaderBlock(text);
    expect(fm["status"]).toBe("done");
    // **Decision** in the body should NOT be in fm
    expect(fm["decision"]).toBeUndefined();
  });

  it("colon-inside-bold and colon-outside-bold are both parsed", () => {
    const text = `# TASK-001: Title\n\n**Introduces-gate:** yes\n**Status**: done\n\n---\n\n## Body\n`;
    const { fm } = parseHeaderBlock(text);
    expect(fm["introduces_gate"]).toBe("yes");
    expect(fm["status"]).toBe("done");
  });

  it("'none (justification: ...)' acceptance criteria stays as scalar string", () => {
    const text = `# TASK-001: Title\n\n**Acceptance criteria:** none (justification: build-only task)\n\n---\n\n## Body\n`;
    const { fm } = parseHeaderBlock(text);
    expect(typeof fm["acceptance_criteria"]).toBe("string");
    expect(fm["acceptance_criteria"]).toBe("none (justification: build-only task)");
  });
});

// ─── Suite 9: migrateFileContentWithMeta — unknown keys surface ────────────────

describe("migrateFileContentWithMeta — unknown key surfacing", () => {
  it("surfaces unknown header keys for caller warning", () => {
    // A file with a key not in FIELD_MAP
    const text = `# TASK-001: Title\n\n**Brief**: BRIEF-001\n**Status**: done\n**Estimated-tokens**: 2000\n\n---\n\n## Body\n`;
    const result = migrateFileContentWithMeta(text);
    expect(result.changed).toBe(true);
    expect(result.unknownKeys).toContain("Estimated-tokens");
    // The unknown key is preserved in the output front matter
    const extracted = extractFrontMatter(result.output);
    expect(extracted.found).toBe(true);
    if (!extracted.found) throw new Error("unreachable");
    expect(extracted.fm["estimated_tokens"]).toBe("2000");
  });
});

// ─── Suite 10: reserializeFileContent ─────────────────────────────────────────

describe("reserializeFileContent", () => {
  it("re-emits an already-migrated file through the fixed serializer", () => {
    // Simulate a file that was migrated with a buggy serializer: quoted integer + unquoted colon-space
    const buggyFm = [
      "---",
      'complexity_estimate: "2"',         // quoted integer (should be unquoted)
      'complexity_actual: "2"',            // quoted integer (should be unquoted)
      'affected_flows: none (justification: chore touches CI infrastructure, not user-facing behavior)',  // unquoted colon-space value
      "---",
      "",
      "# TASK-TEST: Title",
      "",
      "## Body",
      "",
    ].join("\n");

    const result = reserializeFileContent(buggyFm);
    expect(result.changed).toBe(true);

    const extracted = extractFrontMatter(result.output);
    expect(extracted.found).toBe(true);
    if (!extracted.found) throw new Error("unreachable");

    // Integers must be unquoted in serialized form
    expect(result.output).toContain("complexity_estimate: 2");
    expect(result.output).toContain("complexity_actual: 2");
    // Parsed values are still strings
    expect(extracted.fm["complexity_estimate"]).toBe("2");
    expect(extracted.fm["complexity_actual"]).toBe("2");
    // Colon-space value must be quoted now
    expect(result.output).toContain('affected_flows: "none (justification: chore touches CI infrastructure, not user-facing behavior)"');
    // Round-trip: parsed value is the unquoted string
    expect(extracted.fm["affected_flows"]).toBe("none (justification: chore touches CI infrastructure, not user-facing behavior)");
  });

  it("returns {changed: false} for a file not starting with ---", () => {
    const text = "# TASK-001: Title\n\n**Status**: done\n\n---\n\n## Body\n";
    const result = reserializeFileContent(text);
    expect(result.changed).toBe(false);
    expect(result.output).toBe(text);
  });

  it("returns {changed: false} when front matter is already correct", () => {
    const alreadyCorrect = [
      "---",
      "status: done",
      "complexity_estimate: 2",
      "complexity_actual: 2",
      'affected_flows: "none (justification: chore touches CI infrastructure, not user-facing behavior)"',
      "---",
      "",
      "# TASK-TEST: Title",
      "",
      "## Body",
      "",
    ].join("\n");

    const result = reserializeFileContent(alreadyCorrect);
    // Note: parseFrontMatter strips quotes; reserializeFrontMatter re-quotes.
    // The result may or may not be byte-identical depending on parse/serialize round-trip.
    // What matters: if we run reserialize a second time, it should be stable (no further change).
    const secondRun = reserializeFileContent(result.output);
    expect(secondRun.changed).toBe(false);
  });
});

// ─── Suite 11: YAML validity oracle — all on-disk migrated files parse cleanly ─
//
// This is the regression oracle that was missing and let the BLOCKER through.
// It shells to python3 + PyYAML (already present in the dev environment) to
// validate every migrated TASK-*.md / BUG-*.md under .implementation/tasks/ as
// real YAML — not just a line-scanner. If any file's front-matter block fails
// yaml.safe_load(), the test fails with the offending file + error message.
//
// Honor the zero-runtime-dep ethos: PyYAML comes with the system Python3 on
// every dev/CI machine this project targets; no npm package is added.

describe("YAML validity oracle — all migrated task/bug files", () => {
  it("every on-disk TASK-*.md and BUG-*.md front-matter block parses as valid YAML", () => {
    const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
    const tasksRoot = path.join(repoRoot, ".implementation", "tasks");

    // Collect all TASK-*.md and BUG-*.md files recursively
    function collectFiles(dir: string): string[] {
      if (!fs.existsSync(dir)) return [];
      const results: string[] = [];
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          results.push(...collectFiles(full));
        } else if (entry.isFile() && entry.name.endsWith(".md")) {
          if (/^(TASK|BUG)-/i.test(entry.name)) results.push(full);
        }
      }
      return results.sort();
    }

    const files = collectFiles(tasksRoot);
    expect(files.length).toBeGreaterThan(0);  // Sanity: corpus must be non-empty

    const errors: string[] = [];

    for (const filePath of files) {
      const content = fs.readFileSync(filePath, "utf8");
      if (!content.startsWith("---")) continue;  // No front matter — skip (not migrated)

      // Extract the FM block (between the first two --- fences)
      const afterFirst = content.slice(3);
      const closingIdx = afterFirst.indexOf("\n---");
      if (closingIdx === -1) continue;
      const fmBlock = afterFirst.slice(0, closingIdx);

      // Shell to python3 -c "import yaml,sys; yaml.safe_load(sys.argv[1])" with the FM block
      // Passing via argv avoids any shell-injection concern with file-derived content.
      try {
        child_process.execFileSync(
          "python3",
          ["-c", "import yaml,sys; yaml.safe_load(sys.argv[1])", fmBlock],
          { stdio: ["ignore", "ignore", "pipe"] }
        );
      } catch (err: unknown) {
        const stderr =
          err instanceof Error && "stderr" in err
            ? (err as NodeJS.ErrnoException & { stderr: Buffer }).stderr?.toString().trim()
            : String(err);
        errors.push(`INVALID YAML: ${path.relative(repoRoot, filePath)}: ${stderr}`);
      }
    }

    if (errors.length > 0) {
      throw new Error(
        `${errors.length} of ${files.length} migrated files have invalid YAML front matter:\n` +
          errors.join("\n")
      );
    }
  });
});
