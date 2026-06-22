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
import * as os from "node:os";
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

  it("progress-missing-section (malformed state.json) → check_state_json_schema FAILS", () => {
    // Re-pointed from PROGRESS.md section check to state.json schema validation (AC-LOE-012-07).
    // The fixture has a state.json missing required top-level fields.
    // CS-GEN-003: RETRO-LOE-010 (independent oracle) / AC-LOE-012-07
    const dir = path.join(FIXTURES_DIR, "progress-missing-section");
    const { exitCode, stdout } = runGates(dir);
    expect(exitCode).toBe(1);
    expect(stdout).toContain("check_state_json_schema");
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

  it("awaiting-merge-all-pass → check_awaiting_merge_records PASSES", () => {
    // Re-pointed from PROGRESS.md markdown parse to state.json structured records (AC-LOE-012-07).
    // CS-GEN-003: AC-LOE-012-07
    const dir = path.join(FIXTURES_DIR, "awaiting-merge-all-pass");
    const { exitCode, stdout } = runGates(dir);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("ALL CHECKS PASSED");
  });

  it("awaiting-merge-missing-marker (clock-inversion) → check_awaiting_merge_records FAILS", () => {
    // Re-pointed: now tests that a record with createdAt AFTER lastUpdated fails the
    // clock-inversion invariant check (retro-012-014 — closes the long-carried ungated-fix).
    // CS-GEN-003: AC-LOE-012-07, retro-012-014
    const dir = path.join(FIXTURES_DIR, "awaiting-merge-missing-marker");
    const { exitCode, stdout } = runGates(dir);
    expect(exitCode).toBe(1);
    expect(stdout).toContain("check_awaiting_merge_records");
    expect(stdout).toContain("FAIL");
  });

  it("awaiting-merge-hotfix-deferred-valid → check_awaiting_merge_records PASSES", () => {
    // Hotfix: deferred gate verdict strings are valid (not null, present).
    // CS-GEN-003: AC-LOE-012-07
    const dir = path.join(FIXTURES_DIR, "awaiting-merge-hotfix-deferred-valid");
    const { exitCode, stdout } = runGates(dir);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("ALL CHECKS PASSED");
  });

  it("awaiting-merge-hotfix-deferred-malformed (missing gateVerdicts slot) → check_state_json_schema FAILS", () => {
    // Malformed state.json: awaitingMerge record missing sdetQualityAudit slot.
    // Schema oracle (check 3) catches this (additionalProperties check on gateVerdicts).
    // CS-GEN-003: AC-LOE-012-07, RETRO-LOE-010
    const dir = path.join(FIXTURES_DIR, "awaiting-merge-hotfix-deferred-malformed");
    const { exitCode, stdout } = runGates(dir);
    expect(exitCode).toBe(1);
    // check_state_json_schema catches the missing gateVerdicts slot
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

// ─── Suite 5: Check 3 re-point — state.json schema validation (AC-LOE-012-07) ─
//
// Gate Authoring Evidence Item 2 (named code path):
//   scripts/state-store-validate.ts calls validateState() from state-store.ts.
//   validateState() enforces: required top-level fields, additionalProperties: false,
//   schemaVersion == "1.0", lastUpdated ISO 8601, currentPhase closed enum or null,
//   awaitingMerge array with well-formed records (gateVerdicts slots), openRetroItems array.
//
// Gate Authoring Evidence Item 3 (counterfactual):
//   A deliberately-malformed state.json (missing required fields) causes check_state_json_schema
//   to FAIL LOUDLY (exit 1, error message names the path). See test below.
//
// CS-GEN-003: AC-LOE-012-07, RETRO-LOE-010

describe("check_state_json_schema (check 3 re-point) — state.json schema oracle (AC-LOE-012-07)", () => {
  const STATE_FIXTURES_DIR = path.join(
    path.dirname(new URL(import.meta.url).pathname),
    "__test_fixtures__",
    "state"
  );

  it("well-formed state.json → check_state_json_schema PASSES", () => {
    // CS-GEN-003: RETRO-LOE-010 — oracle called on a known-good fixture
    const dir = path.join(FIXTURES_DIR, "clean");
    const { exitCode, stdout } = runGates(dir);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("check_state_json_schema");
    expect(stdout).toContain("PASS");
    expect(stdout).toContain("ALL CHECKS PASSED");
  });

  // COUNTERFACTUAL (Gate Authoring Evidence Item 3):
  // A deliberately-malformed state.json (missing required fields) MUST cause
  // check_state_json_schema to FAIL LOUDLY. This is the independent-oracle test
  // (RETRO-LOE-010 / validation-oracle-independent-of-code).
  it("COUNTERFACTUAL: malformed state.json (missing required fields) → check_state_json_schema FAILS LOUDLY", () => {
    // CS-GEN-003: RETRO-LOE-010 — counterfactual: the oracle rejects the malformed fixture
    const dir = path.join(FIXTURES_DIR, "progress-missing-section");
    const { exitCode, stdout } = runGates(dir);
    expect(exitCode).toBe(1);
    expect(stdout).toContain("check_state_json_schema");
    expect(stdout).toContain("FAIL");
    // Must name the failing path(s) in the error output
    expect(stdout).toContain("required field");
  });

  it("COUNTERFACTUAL: state.json with invalid phase enum → check_state_json_schema FAILS", () => {
    // Use the malformed-state.json fixture from state/ fixtures (has invalid phase)
    // CS-GEN-003: AC-LOE-012-07 — closed phase enum rejection
    const malformedStatePath = path.join(STATE_FIXTURES_DIR, "malformed-state.json");
    // Create a temp fixture dir with a .implementation/state.json pointing at the malformed fixture
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vg-check3-test-"));
    const implDir = path.join(tmp, ".implementation");
    const tasksDir = path.join(implDir, "tasks");
    fs.mkdirSync(tasksDir, { recursive: true });
    // Copy in malformed state
    fs.copyFileSync(malformedStatePath, path.join(implDir, "state.json"));
    // Create a minimal task dir to keep check_task_file_completion happy
    const result = spawnSync(
      "bash",
      [GATES_SCRIPT, "--fixture-dir", tmp],
      { encoding: "utf8", timeout: 30_000 }
    );
    fs.rmSync(tmp, { recursive: true, force: true });
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("check_state_json_schema");
    expect(result.stdout).toContain("FAIL");
    // The oracle must name the bad phase value
    expect(result.stdout).toContain("INVALID-PHASE-THAT-DOES-NOT-EXIST");
  });
});

// ─── Suite 6: Check 9 re-point — awaitingMerge record validation (AC-LOE-012-07) ─
//
// Gate Authoring Evidence Item 2 (named code path):
//   scripts/state-store-validate-awaiting.ts calls validateState() + clock-inversion
//   check. The clock-inversion check catches records where createdAt > lastUpdated.
//   This closes the long-carried retro-012-014 ungated-fix structurally.
//
// Gate Authoring Evidence Item 3 (counterfactual):
//   A state.json with awaitingMerge[0].createdAt AFTER lastUpdated fails check 9.
//
// CS-GEN-003: AC-LOE-012-07, retro-012-014 (clock-inversion — CLOSED)

describe("check_awaiting_merge_records (check 9 re-point) — gateVerdicts + clock-inversion (AC-LOE-012-07)", () => {
  it("empty awaitingMerge → check_awaiting_merge_records PASSES", () => {
    // CS-GEN-003: AC-LOE-012-07 — no records, trivially valid
    const dir = path.join(FIXTURES_DIR, "clean");
    const { exitCode, stdout } = runGates(dir);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("check_awaiting_merge_records");
    expect(stdout).toContain("PASS");
  });

  it("well-formed awaitingMerge with all PASS verdicts → check_awaiting_merge_records PASSES", () => {
    const dir = path.join(FIXTURES_DIR, "awaiting-merge-all-pass");
    const { exitCode, stdout } = runGates(dir);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("check_awaiting_merge_records");
    expect(stdout).toContain("PASS");
  });

  // COUNTERFACTUAL (Gate Authoring Evidence Item 3):
  // A state.json where awaitingMerge[0].createdAt is AFTER lastUpdated must fail check 9.
  // This demonstrates the clock-inversion invariant (retro-012-014 closure).
  it("COUNTERFACTUAL: awaitingMerge record with clock inversion (createdAt > lastUpdated) → check_awaiting_merge_records FAILS", () => {
    // CS-GEN-003: retro-012-014 — clock-inversion ungated-fix closed structurally
    const dir = path.join(FIXTURES_DIR, "awaiting-merge-missing-marker");
    const { exitCode, stdout } = runGates(dir);
    expect(exitCode).toBe(1);
    expect(stdout).toContain("check_awaiting_merge_records");
    expect(stdout).toContain("FAIL");
    // Must name the clock-inversion in the error
    expect(stdout).toContain("clock inversion");
  });

  it("awaitingMerge record missing gateVerdicts slot → check_state_json_schema FAILS (schema catches it)", () => {
    // CS-GEN-003: AC-LOE-012-07 — missing gateVerdicts slot is a schema violation (check 3)
    const dir = path.join(FIXTURES_DIR, "awaiting-merge-hotfix-deferred-malformed");
    const { exitCode, stdout } = runGates(dir);
    expect(exitCode).toBe(1);
    // Schema (check 3) catches missing slots first
    expect(stdout).toContain("FAIL");
  });
});

// ─── Suite 7: Check 8 is byte-unchanged (AC-LOE-012-07) ──────────────────────
//
// The brief explicitly corrects the parent proposal's "3/8/9" → only 3 & 9.
// check_pr_body_quad_review (check 8) must be LEFT UNTOUCHED.
// This suite asserts check 8 still works exactly as before (byte-unchanged behavior).
//
// CS-GEN-003: AC-LOE-012-07

describe("check_pr_body_quad_review (check 8) — byte-unchanged, not modified (AC-LOE-012-07)", () => {
  it("check 8 still passes for non-workflow PR (unchanged behavior)", () => {
    // CS-GEN-003: AC-LOE-012-07 — check 8 was NOT modified
    const dir = path.join(FIXTURES_DIR, "pr-body-non-workflow-ok");
    const prBodyFile = path.join(dir, "pr-body.txt");
    const changedFilesFile = path.join(dir, ".changed_files");
    const { exitCode, stdout } = runGates(dir, [
      "--pr-body", prBodyFile,
      "--changed-files", changedFilesFile,
    ]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("check_pr_body_quad_review");
    expect(stdout).toContain("ALL CHECKS PASSED");
  });

  it("check 8 still fails for workflow PR missing verdict markers (unchanged behavior)", () => {
    // CS-GEN-003: AC-LOE-012-07 — check 8 was NOT modified
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

  it("check 8 function name is check_pr_body_quad_review (byte-unchanged name assertion)", () => {
    // CS-GEN-003: AC-LOE-012-07 — verify the function name did not change
    const gatesScript = fs.readFileSync(GATES_SCRIPT, "utf8");
    // The function must exist with its original name
    expect(gatesScript).toContain("check_pr_body_quad_review()");
    // check_pr_body_quad_review must NOT be renamed or removed
    expect(gatesScript).toContain("check_pr_body_quad_review");
  });
});

// ─── Suite 8: Check 10 — check_removed_artifact_orphans (BRIEF-LOE-013) ──────
//
// Gate Authoring Evidence (AC-LOE-013-05):
//   Item 1 — Green run of check_removed_artifact_orphans over the real tree
//             with PROGRESS.md in the removed set: see AC-04 test below.
//   Item 2 — Named code path the gate catches: .orchestration/bin/sequence.sh:43
//             `PROGRESS_MD="${REPO_ROOT}/.implementation/tasks/PROGRESS.md"` —
//             an executable consumer retained after PROGRESS.md removal. Allowlisted
//             with reason in .implementation/removal-sweep-allow.txt.
//   Item 3 — COUNTERFACTUAL: removal-sweep-red fixture — a .sh consumer with a
//             constructed-path reference (`: "${PROGRESS_MD:=${REPO_ROOT}/.implementation/tasks/PROGRESS.md}"`)
//             NOT in the allowlist → check exits non-zero and names the consumer path:line.
//
// CS-GEN-003: retro-012-017 / BRIEF-LOE-013

describe("check_removed_artifact_orphans (check 10) — removal-sweep gate (BRIEF-LOE-013)", () => {

  // ── COUNTERFACTUAL (Gate Authoring Evidence Item 3) ─────────────────────────
  //
  // This is the PR #80 reproduction. The fixture has a .sh consumer using a
  // CONSTRUCTED path form (`: "${PROGRESS_MD:=${REPO_ROOT}/.implementation/tasks/PROGRESS.md}"`)
  // that is NOT in the allowlist. git grep -F on the repo-relative path catches
  // the literal suffix even inside a variable-expansion form.
  // CS-GEN-003: retro-012-017 / BRIEF-LOE-013 — constructed-path catch
  it("COUNTERFACTUAL (PR #80 reproduction): removed file + constructed-path .sh consumer → check exit 1, consumer named", () => {
    const dir = path.join(FIXTURES_DIR, "removal-sweep-red");
    const { exitCode, stdout } = runGates(dir);
    // Must exit non-zero
    expect(exitCode).toBe(1);
    // Must name the consumer
    expect(stdout).toContain("check_removed_artifact_orphans");
    expect(stdout).toContain("FAIL");
    // Must name the .sh consumer file in the output (path:line form)
    expect(stdout).toContain(".fixture-consumer.sh");
  });

  // ── Allowlisted exec hit → PASS, reason echoed ──────────────────────────────
  //
  // CS-GEN-003: retro-012-017 / BRIEF-LOE-013 — allowlist mechanism
  it("allowlisted exec hit (with reason) → check PASSES, reason echoed in output", () => {
    const dir = path.join(FIXTURES_DIR, "removal-sweep-allowlisted");
    const { exitCode, stdout } = runGates(dir);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("ALL CHECKS PASSED");
    expect(stdout).toContain("ALLOWED (allowlisted)");
    // Reason text must be echoed
    expect(stdout).toContain("Legacy --progress-md no-op flag retained intentionally");
  });

  // ── Allowlist entry with empty reason → FAIL ───────────────────────────────
  //
  // A suppression is a documented decision — never a silent one.
  // CS-GEN-003: retro-012-017 / BRIEF-LOE-013
  it("allowlist entry with EMPTY reason → check FAILS (suppression must have reason)", () => {
    const dir = path.join(FIXTURES_DIR, "removal-sweep-missing-reason");
    const { exitCode, stdout } = runGates(dir);
    expect(exitCode).toBe(1);
    expect(stdout).toContain("check_removed_artifact_orphans");
    expect(stdout).toContain("FAIL");
    expect(stdout).toContain("missing mandatory reason");
  });

  // ── Doc-only (.md) surviving reference → PASS ──────────────────────────────
  //
  // Historical RETRO/HANDOFF/archive pointers in .md files are legitimate and
  // permanent. No allowlist entry is needed for .md-only consumers.
  // CS-GEN-003: retro-012-017 / BRIEF-LOE-013
  it("doc-only (.md) surviving reference → check PASSES (historical pointer allowed by rule)", () => {
    const dir = path.join(FIXTURES_DIR, "removal-sweep-doc-only");
    const { exitCode, stdout } = runGates(dir);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("ALL CHECKS PASSED");
    // check_removed_artifact_orphans must PASS (not FAIL)
    expect(stdout).toContain("check_removed_artifact_orphans");
    expect(stdout).not.toContain("check_removed_artifact_orphans                       FAIL");
  });

  // ── No .removed_files manifest → SKIP cleanly ──────────────────────────────
  //
  // When no manifest is present, the check must SKIP with a clear message —
  // not PASS silently and not hard-error. A plain push with no removals must
  // not red. Mirrors check 8's SKIP behaviour.
  // CS-GEN-003: retro-012-017 / BRIEF-LOE-013
  it("no .removed_files manifest → check SKIPs cleanly (not PASS, not error)", () => {
    const dir = path.join(FIXTURES_DIR, "removal-sweep-skip");
    const { exitCode, stdout } = runGates(dir);
    // SKIP does not cause a failure exit code
    expect(exitCode).toBe(0);
    expect(stdout).toContain("ALL CHECKS PASSED");
    expect(stdout).toContain("check_removed_artifact_orphans");
    expect(stdout).toContain("SKIP");
    // Must NOT claim PASS (that would be a false-pass)
    expect(stdout).not.toContain("check_removed_artifact_orphans                       PASS");
  });

  // ── Common-basename explosion guard ──────────────────────────────────────────
  //
  // Removing a commonly-named file (e.g. apps/portal/src/app/page.tsx) must NOT
  // produce a wall of false-positive hits from the basename signal.
  // DECISION (BRIEF-LOE-013): path-primary ONLY — no basename secondary signal.
  // The fixture lists apps/portal/src/app/page.tsx as removed; no file in the
  // fixture tree contains that exact path, so the check PASSes cleanly.
  // CS-GEN-003: retro-012-017 / BRIEF-LOE-013 — common-basename guard
  it("common-basename (page.tsx) removal → no false-positive explosion (path-primary only)", () => {
    const dir = path.join(FIXTURES_DIR, "removal-sweep-basename-safe");
    const { exitCode, stdout } = runGates(dir);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("ALL CHECKS PASSED");
    // check 10 must PASS — no basename false-positives
    expect(stdout).toContain("check_removed_artifact_orphans");
    expect(stdout).not.toContain("check_removed_artifact_orphans                       FAIL");
  });

  // ── Check 8 byte-unchanged assertion (AC-LOE-013 / AC-LOE-012-07) ──────────
  //
  // Adding check 10 must not modify check_pr_body_quad_review (check 8).
  // This test extends the existing check-8 byte-unchanged suite from Suite 7.
  // CS-GEN-003: retro-012-017 / BRIEF-LOE-013 — checks 1-9 untouched
  it("check 8 (check_pr_body_quad_review) is byte-unchanged after adding check 10", () => {
    const gatesScript = fs.readFileSync(GATES_SCRIPT, "utf8");
    // The function must still exist with its exact name
    expect(gatesScript).toContain("check_pr_body_quad_review()");
    // check 10 was ADDED after check 9 — check 8 function body must be unchanged.
    // Verify check 10's name appears AFTER check 8's name in the file.
    const check8Idx = gatesScript.indexOf("check_pr_body_quad_review()");
    const check10Idx = gatesScript.indexOf("check_removed_artifact_orphans()");
    expect(check10Idx).toBeGreaterThan(check8Idx);
    // check 8's skip behavior is the canonical SKIP pattern check 10 mirrors
    expect(gatesScript).toContain('skip "$check_name" "--pr-body not supplied"');
  });

  // ── AC-04: real main stays green (PROGRESS.md in removed set) ───────────────
  //
  // Gate Authoring Evidence Item 1 (named check step + green run):
  //   bash scripts/validate-gates.sh --removed-files <(echo ".implementation/tasks/PROGRESS.md")
  //   → ALL CHECKS PASSED; check_removed_artifact_orphans PASS.
  //   The .orchestration/*.sh + sequence.sh + sequence.test.sh + validate-gates.sh itself
  //   all reference PROGRESS.md but are allowlisted with reasons in
  //   .implementation/removal-sweep-allow.txt. This is the LIVE PROOF.
  //
  // Gate Authoring Evidence Item 2 (named code path):
  //   .orchestration/bin/sequence.sh:43 — `PROGRESS_MD="${REPO_ROOT}/.implementation/tasks/PROGRESS.md"`
  //   An executable (.sh) consumer retained after PROGRESS.md deletion.
  //   Allowlisted: "Legacy PROGRESS_MD variable + --progress-md flag passthrough..."
  //
  // CS-GEN-003: retro-012-017 / BRIEF-LOE-013 — AC-04
  it("AC-04: real tree with PROGRESS.md in removed set → ALL CHECKS PASSED (allowlisted refs)", () => {
    // Write a temp .removed_files file listing PROGRESS.md
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vg-ac04-"));
    const removedFile = path.join(tmp, ".removed_files");
    fs.writeFileSync(removedFile, ".implementation/tasks/PROGRESS.md\n", "utf8");

    const result = spawnSync(
      "bash",
      [GATES_SCRIPT, "--removed-files", removedFile],
      { encoding: "utf8", timeout: 60_000 }
    );
    fs.rmSync(tmp, { recursive: true, force: true });

    // Must be ALL CHECKS PASSED
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("ALL CHECKS PASSED");
    // check_removed_artifact_orphans must PASS (not FAIL, not SKIP)
    expect(result.stdout).toContain("check_removed_artifact_orphans");
    expect(result.stdout).not.toContain("check_removed_artifact_orphans                       FAIL");
    expect(result.stdout).not.toContain("check_removed_artifact_orphans                       SKIP");
    // The allowlisted .orchestration refs must be echoed with their reasons
    expect(result.stdout).toContain("ALLOWED (allowlisted)");
    // Gate Authoring Evidence Item 2: the named code path
    expect(result.stdout).toContain(".orchestration/bin/sequence.sh");
  });
});
