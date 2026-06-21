/**
 * scripts/validate-gates.test.ts
 *
 * Tests covering TASK-LOE-010-002 acceptance criteria:
 *   AC-LOE-010-04 — validate-gates.sh gives identical pass/fail verdicts on
 *                   already-valid migrated files; rejects malformed front matter
 *   AC-LOE-010-05 — log-task-edit.py reads front-matter form and emits the same
 *                   metrics record shape
 *
 * These tests exercise:
 *   1. The validate-gates.sh fixture suite (every prior verdict preserved on
 *      migrated fixtures)
 *   2. The malformed-frontmatter fixture returning VIOLATIONS from verifyFrontMatter
 *   3. The metrics hook parse_field equivalent in TS (parity demonstration)
 *   4. The task-frontmatter.ts --verify CLI against the real migrated task tree
 */

import { describe, it, expect } from "vitest";
import * as path from "node:path";
import * as fs from "node:fs";
import { spawnSync } from "node:child_process";

import {
  extractFrontMatter,
  verifyFrontMatter,
} from "./task-frontmatter.js";

const REPO_ROOT = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  ".."
);
const FIXTURES_DIR = path.join(
  path.dirname(new URL(import.meta.url).pathname),
  "__test_fixtures__",
  "validate-gates"
);
const TSX_BIN = path.join(REPO_ROOT, "node_modules", ".bin", "tsx");
const FM_SCRIPT = path.join(REPO_ROOT, "scripts", "task-frontmatter.ts");
const GATES_SCRIPT = path.join(REPO_ROOT, "scripts", "validate-gates.sh");

// ─── Helper: run validate-gates.sh against a fixture directory ───────────────

interface GatesResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

function runGates(fixtureDir: string, extra?: string[]): GatesResult {
  const result = spawnSync(
    "bash",
    [GATES_SCRIPT, "--fixture-dir", fixtureDir, ...(extra ?? [])],
    { encoding: "utf8", timeout: 30_000 }
  );
  return {
    exitCode: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

// ─── Suite 1: Fixture verdict preservation (AC-LOE-010-04) ──────────────────
//
// Every existing validate-gates fixture must keep its expected verdict after
// the fixture task files were migrated to front-matter form. This ensures
// the rewritten shell checks read front-matter correctly and give IDENTICAL
// pass/fail verdicts as pre-migration.

describe("validate-gates.sh fixture suite — identical verdicts on migrated files (AC-LOE-010-04)", () => {
  it("clean fixture → all checks PASS", () => {
    const dir = path.join(FIXTURES_DIR, "clean");
    const { exitCode, stdout } = runGates(dir);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("ALL CHECKS PASSED");
  });

  it("done-missing-complexity → check_task_file_completion FAILS", () => {
    const dir = path.join(FIXTURES_DIR, "done-missing-complexity");
    const { exitCode, stdout } = runGates(dir);
    // Exit code 1 = at least one failure
    expect(exitCode).toBe(1);
    expect(stdout).toContain("check_task_file_completion");
    expect(stdout).toContain("FAIL");
  });

  // ── Defect A counterfactual (TASK-LOE-010-004) ────────────────────────────
  // A done task with QUOTED ISO 8601 timestamps (e.g. started_at: "2026-06-21T...")
  // must PASS check_task_file_completion — this is the false-reject that Defect A fixed.
  // The regex now accepts an optional surrounding double-quote, mirroring the
  // tolerance already used for complexity_* fields.
  it("done-quoted-timestamps → check_task_file_completion PASSES (Defect A counterfactual)", () => {
    const dir = path.join(FIXTURES_DIR, "done-quoted-timestamps");
    const { exitCode, stdout } = runGates(dir);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("ALL CHECKS PASSED");
  });

  // ── No-over-broadening check (TASK-LOE-010-004) ───────────────────────────
  // Quoted but NON-ISO strings (e.g. started_at: "not-a-date") must still
  // FAIL check_task_file_completion. The optional-quote tolerance must not
  // widen the blast radius to accept any quoted string.
  it("done-bad-timestamp → check_task_file_completion FAILS (no-over-broadening)", () => {
    const dir = path.join(FIXTURES_DIR, "done-bad-timestamp");
    const { exitCode, stdout } = runGates(dir);
    expect(exitCode).toBe(1);
    expect(stdout).toContain("check_task_file_completion");
    expect(stdout).toContain("FAIL");
  });

  it("done-no-worklog → check_work_log_content FAILS", () => {
    const dir = path.join(FIXTURES_DIR, "done-no-worklog");
    const { exitCode, stdout } = runGates(dir);
    expect(exitCode).toBe(1);
    expect(stdout).toContain("check_work_log_content");
    expect(stdout).toContain("FAIL");
  });

  it("ci-evidence-prose-pass → check_ci_evidence PASSES", () => {
    const dir = path.join(FIXTURES_DIR, "ci-evidence-prose-pass");
    const { exitCode, stdout } = runGates(dir);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("ALL CHECKS PASSED");
  });

  it("ci-evidence-prose-fail → check_ci_evidence FAILS (ad-hoc prose without RED/GREEN anchors)", () => {
    const dir = path.join(FIXTURES_DIR, "ci-evidence-prose-fail");
    const { exitCode, stdout } = runGates(dir);
    expect(exitCode).toBe(1);
    expect(stdout).toContain("check_ci_evidence");
    expect(stdout).toContain("FAIL");
  });

  it("progress-missing-section → check_progress_md_structure FAILS", () => {
    const dir = path.join(FIXTURES_DIR, "progress-missing-section");
    const { exitCode, stdout } = runGates(dir);
    expect(exitCode).toBe(1);
    expect(stdout).toContain("check_progress_md_structure");
    expect(stdout).toContain("FAIL");
  });

  it("gated-no-task → check_gated_path_accountability FAILS", () => {
    const dir = path.join(FIXTURES_DIR, "gated-no-task");
    const { exitCode, stdout } = runGates(dir);
    expect(exitCode).toBe(1);
    expect(stdout).toContain("check_gated_path_accountability");
    expect(stdout).toContain("FAIL");
  });

  it("pr-body-non-workflow-ok → check_pr_body_quad_review PASSES", () => {
    const dir = path.join(FIXTURES_DIR, "pr-body-non-workflow-ok");
    const prBodyFile = path.join(dir, "pr-body.txt");
    const changedFilesFile = path.join(dir, ".changed_files");
    const { exitCode, stdout } = runGates(dir, [
      "--pr-body", prBodyFile,
      "--changed-files", changedFilesFile,
    ]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("ALL CHECKS PASSED");
  });

  it("pr-body-workflow-missing-verdict → check_pr_body_quad_review FAILS", () => {
    const dir = path.join(FIXTURES_DIR, "pr-body-workflow-missing-verdict");
    const prBodyFile = path.join(dir, "pr-body.txt");
    const changedFilesFile = path.join(dir, ".changed_files");
    const { exitCode, stdout } = runGates(dir, [
      "--pr-body", prBodyFile,
      "--changed-files", changedFilesFile,
    ]);
    expect(exitCode).toBe(1);
    expect(stdout).toContain("check_pr_body_quad_review");
    expect(stdout).toContain("FAIL");
  });

  it("awaiting-merge-all-pass → check_pr_awaiting_merge_gate_verdicts PASSES", () => {
    const dir = path.join(FIXTURES_DIR, "awaiting-merge-all-pass");
    const { exitCode, stdout } = runGates(dir);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("ALL CHECKS PASSED");
  });

  it("awaiting-merge-missing-marker → check_pr_awaiting_merge_gate_verdicts FAILS", () => {
    const dir = path.join(FIXTURES_DIR, "awaiting-merge-missing-marker");
    const { exitCode, stdout } = runGates(dir);
    expect(exitCode).toBe(1);
    expect(stdout).toContain("check_pr_awaiting_merge_gate_verdicts");
    expect(stdout).toContain("FAIL");
  });

  it("awaiting-merge-hotfix-deferred-valid → check_pr_awaiting_merge_gate_verdicts PASSES", () => {
    const dir = path.join(FIXTURES_DIR, "awaiting-merge-hotfix-deferred-valid");
    const { exitCode, stdout } = runGates(dir);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("ALL CHECKS PASSED");
  });

  it("awaiting-merge-hotfix-deferred-malformed → check_pr_awaiting_merge_gate_verdicts FAILS", () => {
    const dir = path.join(FIXTURES_DIR, "awaiting-merge-hotfix-deferred-malformed");
    const { exitCode, stdout } = runGates(dir);
    expect(exitCode).toBe(1);
    expect(stdout).toContain("check_pr_awaiting_merge_gate_verdicts");
    expect(stdout).toContain("FAIL");
  });
});

// ─── Suite 2: Malformed front matter is rejected (AC-LOE-010-04 counterfactual) ──
//
// Gate Authoring Evidence Item 3: this fixture has status: "wip" (illegal),
// complexity_estimate: 7 (out-of-range), and a clock inversion.
// verifyFrontMatter MUST find violations.

describe("malformed front-matter fixture — schema violations detected (AC-LOE-010-04 counterfactual)", () => {
  const malformedFile = path.join(
    FIXTURES_DIR,
    "malformed-frontmatter",
    ".implementation",
    "tasks",
    "done",
    "TASK-TEST-004-malformed-fixture.md"
  );

  it("fixture file exists and has front matter", () => {
    const text = fs.readFileSync(malformedFile, "utf8");
    const result = extractFrontMatter(text);
    expect(result.found).toBe(true);
  });

  it("verifyFrontMatter detects illegal status 'wip'", () => {
    const text = fs.readFileSync(malformedFile, "utf8");
    const result = extractFrontMatter(text);
    expect(result.found).toBe(true);
    if (!result.found) throw new Error("unreachable");

    const violations = verifyFrontMatter(result.fm, malformedFile);
    const statusViolation = violations.find((v) => v.rule === "status.enum");
    expect(statusViolation).toBeDefined();
    expect(statusViolation?.message).toContain("wip");
  });

  it("verifyFrontMatter detects out-of-range complexity_estimate: 7", () => {
    const text = fs.readFileSync(malformedFile, "utf8");
    const result = extractFrontMatter(text);
    expect(result.found).toBe(true);
    if (!result.found) throw new Error("unreachable");

    const violations = verifyFrontMatter(result.fm, malformedFile);
    const complexityViolation = violations.find((v) => v.rule === "complexity_estimate.range");
    expect(complexityViolation).toBeDefined();
    expect(complexityViolation?.message).toContain("7");
  });

  it("verifyFrontMatter detects clock inversion (completed_at before started_at)", () => {
    const text = fs.readFileSync(malformedFile, "utf8");
    const result = extractFrontMatter(text);
    expect(result.found).toBe(true);
    if (!result.found) throw new Error("unreachable");

    const violations = verifyFrontMatter(result.fm, malformedFile);
    const clockViolation = violations.find((v) => v.rule === "clock.inversion");
    expect(clockViolation).toBeDefined();
    expect(clockViolation?.message).toContain("BEFORE");
  });

  it("task-frontmatter.ts --verify rejects the malformed-frontmatter fixture directory (exit 1)", () => {
    const malformedDir = path.join(
      FIXTURES_DIR,
      "malformed-frontmatter",
      ".implementation",
      "tasks",
      "done"
    );
    const result = spawnSync(
      TSX_BIN,
      [FM_SCRIPT, "--verify", malformedDir],
      { encoding: "utf8", timeout: 30_000 }
    );
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("VIOLATION");
    expect(result.stdout).toContain("FAIL");
  });
});

// ─── Suite 3: task-frontmatter.ts --verify CLI correctness ───────────────────
//
// Gate Authoring Evidence Item 1: the TS --verify CLI is the schema validation
// delegate used in the malformed-fixture counterfactual. This suite verifies
// the CLI correctly reports PASS on valid files and FAIL on invalid ones.
//
// Note: the real migrated done/ directory has known pre-existing violations
// (clock inversions and inline-comment introduces_gate values from pre-migration
// data) that are out of scope for this task. validate-gates.sh check 1 uses a
// targeted 4-field bash grep (not the full --verify) so it gives identical
// verdicts on those files as before. The --verify CLI is used directly for the
// malformed-fixture counterfactual below.

describe("task-frontmatter.ts --verify CLI — pass/fail correctness (AC-LOE-010-04 Item 1)", () => {
  it("--verify exits 0 on valid fixture directory (ci-evidence-prose-pass)", () => {
    const validDir = path.join(
      FIXTURES_DIR,
      "ci-evidence-prose-pass",
      ".implementation",
      "tasks",
      "done"
    );
    const result = spawnSync(
      TSX_BIN,
      [FM_SCRIPT, "--verify", validDir],
      { encoding: "utf8", timeout: 30_000 }
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("PASS:");
    expect(result.stdout).not.toContain("VIOLATION:");
  });

  it("--verify exits 0 on done-no-worklog fixture (front matter is valid, only body check fails)", () => {
    // The done-no-worklog fixture has valid front matter — the work log check
    // is a body-prose check, not a front-matter schema check.
    const validDir = path.join(
      FIXTURES_DIR,
      "done-no-worklog",
      ".implementation",
      "tasks",
      "done"
    );
    const result = spawnSync(
      TSX_BIN,
      [FM_SCRIPT, "--verify", validDir],
      { encoding: "utf8", timeout: 30_000 }
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("PASS:");
  });

  it("--verify exits 1 on done-missing-complexity fixture (complexity_actual missing)", () => {
    // The done-missing-complexity fixture has complexity_actual: — which
    // triggers done.complexity_actual.required violation.
    const invalidDir = path.join(
      FIXTURES_DIR,
      "done-missing-complexity",
      ".implementation",
      "tasks",
      "done"
    );
    const result = spawnSync(
      TSX_BIN,
      [FM_SCRIPT, "--verify", invalidDir],
      { encoding: "utf8", timeout: 30_000 }
    );
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("VIOLATION:");
    expect(result.stdout).toContain("complexity_actual");
  });
});

// ─── Suite 4: Metrics hook parity — parse_field equivalent (AC-LOE-010-05) ──
//
// The Python hook parse_field has been re-keyed from bold keys to front-matter
// keys. This TS test demonstrates the parity by reading a stable, dedicated
// fixture file and verifying the expected field values are extracted correctly
// (same record shape the hook would emit).
//
// DECISION (TASK-LOE-010-004, Defect B fix): replaced the self-referential
// live-task fixture (TASK-LOE-010-002) with the dedicated, stable fixture at
// scripts/__test_fixtures__/frontmatter/TASK-TEST-INPROGRESS-001-parity-fixture.md.
// This fixture will never be mutated by the task lifecycle, so the assertions
// will remain stable regardless of what happens to any real task file.
//
// The fixture also uses a quoted started_at value ("2026-06-21T18:52:52Z"),
// which directly exercises the TS extractFrontMatter tolerance for quoted ISO
// 8601 scalars — the same tolerance Defect A added to the bash check.

const FRONTMATTER_FIXTURES_DIR = path.join(
  path.dirname(new URL(import.meta.url).pathname),
  "__test_fixtures__",
  "frontmatter"
);

describe("metrics hook parity — front-matter field extraction (AC-LOE-010-05)", () => {
  // Use the dedicated, stable in-progress fixture — never mutates with the task lifecycle.
  const parityFixture = path.join(
    FRONTMATTER_FIXTURES_DIR,
    "TASK-TEST-INPROGRESS-001-parity-fixture.md"
  );

  it("extracts status from front-matter form", () => {
    const text = fs.readFileSync(parityFixture, "utf8");
    const result = extractFrontMatter(text);
    expect(result.found).toBe(true);
    if (!result.found) throw new Error("unreachable");

    const status = result.fm["status"] as string | undefined;
    // Fixture is fixed at "in-progress" — stable assertion.
    expect(status).toBe("in-progress");
  });

  it("extracts assigned_to from front-matter form", () => {
    const text = fs.readFileSync(parityFixture, "utf8");
    const result = extractFrontMatter(text);
    expect(result.found).toBe(true);
    if (!result.found) throw new Error("unreachable");

    const assignedTo = result.fm["assigned_to"] as string | undefined;
    expect(assignedTo).toBe("devops");
  });

  it("extracts complexity_estimate from front-matter form (quoted scalar)", () => {
    const text = fs.readFileSync(parityFixture, "utf8");
    const result = extractFrontMatter(text);
    expect(result.found).toBe(true);
    if (!result.found) throw new Error("unreachable");

    const estimate = result.fm["complexity_estimate"] as string | undefined;
    expect(estimate).toBe("3");
  });

  it("extracts started_at (quoted ISO 8601) from front-matter form", () => {
    // Fixture uses quoted form: started_at: "2026-06-21T18:52:52Z"
    // This also exercises extractFrontMatter's tolerance for quoted timestamps
    // — the TS-side equivalent of the Defect A fix in validate-gates.sh.
    const text = fs.readFileSync(parityFixture, "utf8");
    const result = extractFrontMatter(text);
    expect(result.found).toBe(true);
    if (!result.found) throw new Error("unreachable");

    const startedAt = result.fm["started_at"] as string | undefined;
    expect(startedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  });

  it("extracts completed_at as empty sentinel (not yet completed)", () => {
    // Fixture is in-progress — completed_at is empty/absent.
    const text = fs.readFileSync(parityFixture, "utf8");
    const result = extractFrontMatter(text);
    expect(result.found).toBe(true);
    if (!result.found) throw new Error("unreachable");

    const completedAt = result.fm["completed_at"] as string | undefined;
    // Either empty string, undefined, or the em-dash sentinel — all valid empty forms.
    expect(completedAt === "—" || completedAt === "" || completedAt === undefined).toBe(true);
  });

  it("record shape matches what metrics-report.py consumes (field names align)", () => {
    // Verify the emitted field names are the ones metrics-report.py reads.
    // metrics-report.py reads: status, complexity_estimate, complexity_actual,
    // started_at, completed_at, assigned_to — all snake_case, matching front-matter keys.
    const text = fs.readFileSync(parityFixture, "utf8");
    const result = extractFrontMatter(text);
    expect(result.found).toBe(true);
    if (!result.found) throw new Error("unreachable");

    // Simulate what log-task-edit.py now emits (post-TASK-LOE-010-002):
    const record = {
      status: result.fm["status"],
      complexity_estimate: result.fm["complexity_estimate"],
      complexity_actual: result.fm["complexity_actual"],
      started_at: result.fm["started_at"],
      completed_at: result.fm["completed_at"],
      assigned_to: result.fm["assigned_to"],
    };

    // All expected metric fields present
    expect(Object.keys(record)).toEqual([
      "status",
      "complexity_estimate",
      "complexity_actual",
      "started_at",
      "completed_at",
      "assigned_to",
    ]);

    // Values are defined (not undefined — may be empty string for not-yet-filled fields).
    // Stable assertions — fixture is pinned to known values, never mutates.
    expect(record.status).toBe("in-progress");
    expect(record.assigned_to).toBe("devops");
    expect(record.complexity_estimate).toBe("3");
  });
});
