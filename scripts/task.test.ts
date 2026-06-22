/**
 * scripts/task.test.ts
 *
 * Vitest suite for scripts/task.ts (TASK-LOE-011-001 + TASK-LOE-011-002).
 *
 * Acceptance criteria covered:
 *   AC-LOE-011-01 — write subcommands are idempotent, atomic, use task-frontmatter.ts
 *   AC-LOE-011-02 — CLI owns format/timestamp/breadcrumb/ordering
 *   AC-LOE-011-03 — transition legality enforced from on-disk state
 *   AC-LOE-011-04 — --role required + roster-validated
 *   AC-LOE-011-05 — metrics self-report parity vs real log-task-edit.py hook
 *   AC-LOE-011-06 — read/query projections (show/list/next/summary/progress/brief-context)
 *   AC-LOE-011-07 — done never invents complexity_actual (the judgment line)
 *
 * Design: CS-GEN-003 — cite governing proposal section in test comments.
 * Independent oracle: metrics parity test feeds the post-write file through
 * the REAL log-task-edit.py hook (not a re-implementation) per RETRO-LOE-010
 * lesson and BRIEF-LOE-011 Notes.
 *
 * Read-projection oracle discipline (TASK-LOE-011-002 / Phase-0 lesson nudge):
 * The `progress` test projects the REAL PROGRESS-fixture.md content via
 * extractCurrentInitiativeSection — NOT a hand-rebuilt copy in the test.
 * Tests assert against the output of the REAL projection function,
 * not a re-implemented oracle.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";

import {
  cmdStart,
  cmdReview,
  cmdDone,
  cmdReject,
  cmdLog,
  cmdArchive,
  cmdVerify,
  // Read/query subcommands (AC-LOE-011-06 / TASK-LOE-011-002)
  cmdShow,
  cmdList,
  cmdNext,
  cmdSummary,
  cmdProgress,
  cmdBriefContext,
  extractCurrentInitiativeSection,
  renderShow,
  renderList,
  renderNext,
  renderSummary,
  renderProgress,
  renderBriefContext,
  validateRole,
  parseComplexity,
  isEmptyField,
  atomicWriteFile,
  deriveTaskId,
  formatBreadcrumb,
  appendToWorkLog,
  resolveTaskFile,
  TaskCliError,
  VALID_ROLES,
  // State-store subcommands (BRIEF-LOE-012 / TASK-LOE-012-002)
  cmdPhaseTransition,
  cmdMergeCheckpoint,
  cmdPostMerge,
  cmdTrace,
  cmdReport,
  renderTrace,
  type MergeCheckpointShims,
} from "./task.js";

import { extractFrontMatter, verifyFrontMatter } from "./task-frontmatter.js";

// ─── Test infrastructure ──────────────────────────────────────────────────────

const REPO_ROOT = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  ".."
);

const FIXTURES_SRC = path.join(
  path.dirname(new URL(import.meta.url).pathname),
  "__test_fixtures__",
  "task"
);

const HOOK_SCRIPT = path.join(
  REPO_ROOT,
  ".claude",
  "hooks",
  "log-task-edit.py"
);

/**
 * Create a temp directory that mirrors a minimal repo structure:
 *   .implementation/tasks/          ← active tasks
 *   .implementation/tasks/done/     ← archived tasks
 *
 * The fixture files are COPIED (not used in place) so each test is isolated.
 * Returns the path to the temp dir.
 */
function makeTempRepo(): string {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "task-test-"));
  const tasksDir = path.join(tmpDir, ".implementation", "tasks");
  const doneDir = path.join(tasksDir, "done");
  fs.mkdirSync(tasksDir, { recursive: true });
  fs.mkdirSync(doneDir, { recursive: true });
  return tmpDir;
}

/**
 * Copy a fixture file into the temp repo's tasks directory.
 */
function copyFixture(tmpRepo: string, fixtureName: string): string {
  const src = path.join(FIXTURES_SRC, fixtureName);
  const dst = path.join(tmpRepo, ".implementation", "tasks", fixtureName);
  fs.copyFileSync(src, dst);
  return dst;
}

/**
 * Read the front matter from a file path.
 */
function readFm(filePath: string): Record<string, string | string[] | undefined> {
  const raw = fs.readFileSync(filePath, "utf8");
  const extracted = extractFrontMatter(raw);
  if (!extracted.found) throw new Error(`No front matter in ${filePath}`);
  return extracted.fm as Record<string, string | string[] | undefined>;
}

/**
 * Read the full content of a file.
 */
function readContent(filePath: string): string {
  return fs.readFileSync(filePath, "utf8");
}

/**
 * Fixed "now" function for deterministic timestamps in tests.
 * Returns a valid ISO 8601 UTC timestamp.
 */
function fixedNow(ts: string = "2026-06-21T15:00:00Z"): () => string {
  return () => ts;
}

// ─── Role validation (AC-LOE-011-04) ─────────────────────────────────────────

describe("Role validation (AC-LOE-011-04)", () => {
  it("accepts all valid roles", () => {
    for (const role of VALID_ROLES) {
      expect(validateRole(role)).toBe(true);
    }
  });

  it("rejects unknown role 'bogus'", () => {
    expect(validateRole("bogus")).toBe(false);
  });

  it("rejects empty role", () => {
    expect(validateRole("")).toBe(false);
  });

  it("rejects undefined role", () => {
    expect(validateRole(undefined)).toBe(false);
  });
});

// ─── start subcommand (AC-LOE-011-01, -02, -03) ───────────────────────────────

describe("cmdStart — backlog → in-progress", () => {
  let tmpRepo: string;

  beforeEach(() => {
    tmpRepo = makeTempRepo();
  });

  afterEach(() => {
    fs.rmSync(tmpRepo, { recursive: true, force: true });
  });

  it("starts a backlog task: flips in-progress, sets started_at, complexity_estimate, updated_by, appends breadcrumb", () => {
    copyFixture(tmpRepo, "TASK-TST-001-backlog-fixture.md");

    const result = cmdStart({
      taskId: "TASK-TST-001",
      role: "devops",
      complexityEstimate: 3,
      note: "test start",
      repoRoot: tmpRepo,
      nowFn: fixedNow("2026-06-21T15:00:00Z"),
    });

    expect(result.changed).toBe(true);

    const fm = readFm(result.filePath);
    expect(fm["status"]).toBe("in-progress");
    expect(fm["started_at"]).toBe("2026-06-21T15:00:00Z");
    expect(fm["complexity_estimate"]).toBe("3");
    expect(fm["updated_by"]).toBe("devops");

    // Breadcrumb must contain "Starting implementation" substring
    // (validate-gates.sh check 5 greps for this)
    const content = readContent(result.filePath);
    expect(content).toContain("Starting implementation");
    expect(content).toContain("[devops]");
  });

  it("started_at is a valid ISO 8601 UTC timestamp (not a sentinel)", () => {
    copyFixture(tmpRepo, "TASK-TST-001-backlog-fixture.md");

    const before = Date.now();
    const result = cmdStart({
      taskId: "TASK-TST-001",
      role: "devops",
      complexityEstimate: 2,
      repoRoot: tmpRepo,
    });
    const after = Date.now();

    const fm = readFm(result.filePath);
    const startedAt = fm["started_at"] as string;

    // Must match ISO 8601 UTC pattern
    expect(startedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/);

    // Must be a real clock value (not midnight sentinel)
    const ts = new Date(startedAt).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it("IDEMPOTENCY: re-running start on an already-in-progress task with breadcrumb is a clean no-op (exit 0)", () => {
    copyFixture(tmpRepo, "TASK-TST-002-inprogress-fixture.md");

    const contentBefore = readContent(
      path.join(tmpRepo, ".implementation", "tasks", "TASK-TST-002-inprogress-fixture.md")
    );

    const result = cmdStart({
      taskId: "TASK-TST-002",
      role: "devops",
      complexityEstimate: 3,
      repoRoot: tmpRepo,
    });

    // Must be no-op (changed=false)
    expect(result.changed).toBe(false);

    // File content must not change (no duplicate breadcrumb)
    const contentAfter = readContent(result.filePath);
    expect(contentAfter).toBe(contentBefore);
  });

  it("IDEMPOTENCY: double-start does not add a duplicate Work Log breadcrumb", () => {
    copyFixture(tmpRepo, "TASK-TST-001-backlog-fixture.md");

    // First start
    cmdStart({
      taskId: "TASK-TST-001",
      role: "devops",
      complexityEstimate: 3,
      repoRoot: tmpRepo,
      nowFn: fixedNow("2026-06-21T15:00:00Z"),
    });

    const contentAfterFirst = readContent(
      path.join(tmpRepo, ".implementation", "tasks", "TASK-TST-001-backlog-fixture.md")
    );

    // Second start (idempotent)
    const result = cmdStart({
      taskId: "TASK-TST-001",
      role: "devops",
      complexityEstimate: 3,
      repoRoot: tmpRepo,
      nowFn: fixedNow("2026-06-21T15:30:00Z"),
    });

    expect(result.changed).toBe(false);

    const contentAfterSecond = readContent(result.filePath);
    expect(contentAfterSecond).toBe(contentAfterFirst);

    // Count "Starting implementation" occurrences — must be exactly 1
    const matches = contentAfterSecond.match(/Starting implementation/g);
    expect(matches?.length).toBe(1);
  });

  it("rejects unknown role (non-zero exit)", () => {
    copyFixture(tmpRepo, "TASK-TST-001-backlog-fixture.md");

    expect(() =>
      cmdStart({
        taskId: "TASK-TST-001",
        role: "bogus-role" as never,
        complexityEstimate: 3,
        repoRoot: tmpRepo,
      })
    ).toThrowError(/bogus-role/);
  });

  it("rejects task not in backlog/in-progress (illegal transition)", () => {
    copyFixture(tmpRepo, "TASK-TST-003-review-fixture.md");

    expect(() =>
      cmdStart({
        taskId: "TASK-TST-003",
        role: "devops",
        complexityEstimate: 3,
        repoRoot: tmpRepo,
      })
    ).toThrow(TaskCliError);
  });
});

// ─── review subcommand (AC-LOE-011-01, -02, -03) ──────────────────────────────

describe("cmdReview — in-progress → review", () => {
  let tmpRepo: string;

  beforeEach(() => {
    tmpRepo = makeTempRepo();
  });

  afterEach(() => {
    fs.rmSync(tmpRepo, { recursive: true, force: true });
  });

  it("flips status to review, sets complexity_actual", () => {
    copyFixture(tmpRepo, "TASK-TST-002-inprogress-fixture.md");

    const result = cmdReview({
      taskId: "TASK-TST-002",
      role: "devops",
      complexityActual: 3,
      note: "gates pass",
      repoRoot: tmpRepo,
    });

    expect(result.changed).toBe(true);
    const fm = readFm(result.filePath);
    expect(fm["status"]).toBe("review");
    expect(fm["complexity_actual"]).toBe("3");
    expect(fm["updated_by"]).toBe("devops");
  });

  it("rejects if status is not in-progress", () => {
    copyFixture(tmpRepo, "TASK-TST-001-backlog-fixture.md");

    expect(() =>
      cmdReview({
        taskId: "TASK-TST-001",
        role: "devops",
        complexityActual: 3,
        repoRoot: tmpRepo,
      })
    ).toThrow(TaskCliError);
  });

  it("IDEMPOTENCY: re-running review with same complexity_actual is a no-op", () => {
    copyFixture(tmpRepo, "TASK-TST-003-review-fixture.md");

    const result = cmdReview({
      taskId: "TASK-TST-003",
      role: "devops",
      complexityActual: 3, // same as fixture
      repoRoot: tmpRepo,
    });

    expect(result.changed).toBe(false);
  });
});

// ─── done subcommand — THE JUDGMENT LINE (AC-LOE-011-07) ──────────────────────

describe("cmdDone — the judgment line (AC-LOE-011-07)", () => {
  let tmpRepo: string;

  beforeEach(() => {
    tmpRepo = makeTempRepo();
  });

  afterEach(() => {
    fs.rmSync(tmpRepo, { recursive: true, force: true });
  });

  it("succeeds on a review fixture with complexity_actual set (role sdet)", () => {
    copyFixture(tmpRepo, "TASK-TST-003-review-fixture.md");

    const result = cmdDone({
      taskId: "TASK-TST-003",
      role: "sdet",
      note: "approved",
      repoRoot: tmpRepo,
      nowFn: fixedNow("2026-06-21T16:00:00Z"),
    });

    expect(result.changed).toBe(true);
    const fm = readFm(result.filePath);
    expect(fm["status"]).toBe("done");
    expect(fm["completed_at"]).toBe("2026-06-21T16:00:00Z");
    expect(fm["updated_by"]).toBe("sdet");
  });

  it("completed_at >= started_at", () => {
    copyFixture(tmpRepo, "TASK-TST-003-review-fixture.md");

    const result = cmdDone({
      taskId: "TASK-TST-003",
      role: "sdet",
      repoRoot: tmpRepo,
    });

    const fm = readFm(result.filePath);
    const started = new Date(fm["started_at"] as string).getTime();
    const completed = new Date(fm["completed_at"] as string).getTime();
    expect(completed).toBeGreaterThanOrEqual(started);
  });

  it("JUDGMENT LINE: rejects done when complexity_actual is empty (never invents it)", () => {
    // TASK-TST-004 has status: review but complexity_actual: —
    copyFixture(tmpRepo, "TASK-TST-004-review-no-complexity-fixture.md");

    expect(() =>
      cmdDone({
        taskId: "TASK-TST-004",
        role: "sdet",
        repoRoot: tmpRepo,
      })
    ).toThrow(TaskCliError);

    // File must be unchanged (never partial-write)
    const fm = readFm(
      path.join(tmpRepo, ".implementation", "tasks", "TASK-TST-004-review-no-complexity-fixture.md")
    );
    expect(fm["status"]).toBe("review");
    expect(isEmptyField(fm["complexity_actual"] as string)).toBe(true);
  });

  it("JUDGMENT LINE: rejects done when complexity_actual is out of range (7)", () => {
    // TASK-TST-005 has complexity_actual: 7
    copyFixture(tmpRepo, "TASK-TST-005-review-bad-complexity-fixture.md");

    expect(() =>
      cmdDone({
        taskId: "TASK-TST-005",
        role: "sdet",
        repoRoot: tmpRepo,
      })
    ).toThrow(TaskCliError);

    // File unchanged
    const fm = readFm(
      path.join(tmpRepo, ".implementation", "tasks", "TASK-TST-005-review-bad-complexity-fixture.md")
    );
    expect(fm["status"]).toBe("review");
  });

  it("IDEMPOTENCY: done on an already-done task is a clean no-op", () => {
    copyFixture(tmpRepo, "TASK-TST-007-done-fixture.md");

    const result = cmdDone({
      taskId: "TASK-TST-007",
      role: "sdet",
      repoRoot: tmpRepo,
    });

    expect(result.changed).toBe(false);
  });

  it("rejects done if status is not review", () => {
    copyFixture(tmpRepo, "TASK-TST-002-inprogress-fixture.md");

    expect(() =>
      cmdDone({
        taskId: "TASK-TST-002",
        role: "sdet",
        repoRoot: tmpRepo,
      })
    ).toThrow(TaskCliError);
  });
});

// ─── reject subcommand (AC-LOE-011-03) ────────────────────────────────────────

describe("cmdReject — review → in-progress", () => {
  let tmpRepo: string;

  beforeEach(() => {
    tmpRepo = makeTempRepo();
  });

  afterEach(() => {
    fs.rmSync(tmpRepo, { recursive: true, force: true });
  });

  it("wires BUG reference, back to in-progress", () => {
    copyFixture(tmpRepo, "TASK-TST-003-review-fixture.md");

    const result = cmdReject({
      taskId: "TASK-TST-003",
      role: "sdet",
      bugId: "BUG-LOE-011-001",
      note: "missing test coverage",
      repoRoot: tmpRepo,
    });

    expect(result.changed).toBe(true);

    const fm = readFm(result.filePath);
    expect(fm["status"]).toBe("in-progress");

    const content = readContent(result.filePath);
    expect(content).toContain("BUG-LOE-011-001");
  });

  it("rejects if task is not in review", () => {
    copyFixture(tmpRepo, "TASK-TST-002-inprogress-fixture.md");

    expect(() =>
      cmdReject({
        taskId: "TASK-TST-002",
        role: "sdet",
        bugId: "BUG-LOE-011-001",
        repoRoot: tmpRepo,
      })
    ).toThrow(TaskCliError);
  });

  it("IDEMPOTENCY: reject with same bug on already-in-progress task is no-op", () => {
    copyFixture(tmpRepo, "TASK-TST-002-inprogress-fixture.md");
    // The fixture already has "Starting implementation" but no bug ref yet;
    // we need a task that's in-progress AND already has the bug ref
    const filePath = path.join(
      tmpRepo,
      ".implementation",
      "tasks",
      "TASK-TST-002-inprogress-fixture.md"
    );
    // Manually add the bug ref to the work log
    const existing = fs.readFileSync(filePath, "utf8");
    fs.writeFileSync(filePath, existing + "\n- 2026-06-21 [sdet] Rejected: BUG-TST-001 | What's next: fix | Blockers: none\n");

    // Now reject again with same bug
    const result = cmdReject({
      taskId: "TASK-TST-002",
      role: "sdet",
      bugId: "BUG-TST-001",
      repoRoot: tmpRepo,
    });

    expect(result.changed).toBe(false);
  });
});

// ─── log subcommand (AC-LOE-011-02) ───────────────────────────────────────────

describe("cmdLog — append Work Log breadcrumb", () => {
  let tmpRepo: string;

  beforeEach(() => {
    tmpRepo = makeTempRepo();
  });

  afterEach(() => {
    fs.rmSync(tmpRepo, { recursive: true, force: true });
  });

  it("appends a breadcrumb with [role] prefix, no status change", () => {
    copyFixture(tmpRepo, "TASK-TST-002-inprogress-fixture.md");

    const result = cmdLog({
      taskId: "TASK-TST-002",
      role: "devops",
      did: "implemented feature X",
      next: "run tests",
      blockers: "none",
      repoRoot: tmpRepo,
    });

    expect(result.changed).toBe(true);

    const content = readContent(result.filePath);
    expect(content).toContain("[devops] implemented feature X");
    expect(content).toContain("What's next: run tests");

    // Status must be unchanged
    const fm = readFm(result.filePath);
    expect(fm["status"]).toBe("in-progress");
  });

  it("breadcrumb has canonical YYYY-MM-DD format prefix", () => {
    copyFixture(tmpRepo, "TASK-TST-002-inprogress-fixture.md");

    const result = cmdLog({
      taskId: "TASK-TST-002",
      role: "devops",
      did: "test",
      next: "more",
      repoRoot: tmpRepo,
    });

    const content = readContent(result.filePath);
    // Must contain a date prefix in YYYY-MM-DD format
    expect(content).toMatch(/- \d{4}-\d{2}-\d{2} \[devops\]/);
  });
});

// ─── archive subcommand (AC-LOE-011-03) ───────────────────────────────────────

describe("cmdArchive — move done tasks to tasks/done/", () => {
  let tmpRepo: string;

  beforeEach(() => {
    tmpRepo = makeTempRepo();
  });

  afterEach(() => {
    fs.rmSync(tmpRepo, { recursive: true, force: true });
  });

  it("moves status: done tasks, leaves open tasks in place", () => {
    copyFixture(tmpRepo, "TASK-TST-007-done-fixture.md");       // status: done → should move
    copyFixture(tmpRepo, "TASK-TST-002-inprogress-fixture.md"); // status: in-progress → stay

    const result = cmdArchive({
      repoRoot: tmpRepo,
    });

    expect(result.errors).toHaveLength(0);
    expect(result.moved).toContain("TASK-TST-007-done-fixture.md");
    expect(result.moved).not.toContain("TASK-TST-002-inprogress-fixture.md");

    // Done task must now be in tasks/done/
    const doneDir = path.join(tmpRepo, ".implementation", "tasks", "done");
    expect(fs.existsSync(path.join(doneDir, "TASK-TST-007-done-fixture.md"))).toBe(true);

    // In-progress task must stay in tasks/
    const tasksDir = path.join(tmpRepo, ".implementation", "tasks");
    expect(fs.existsSync(path.join(tasksDir, "TASK-TST-002-inprogress-fixture.md"))).toBe(true);
  });

  it("--brief filter scopes archive to matching tasks", () => {
    copyFixture(tmpRepo, "TASK-TST-007-done-fixture.md"); // TASK-TST-007 → brief=TST-001 pattern

    // Add a second done task from a different brief
    const otherFixture = path.join(
      tmpRepo,
      ".implementation",
      "tasks",
      "TASK-OTHER-001-done-other.md"
    );
    fs.writeFileSync(
      otherFixture,
      `---
brief: BRIEF-OTHER
status: done
assigned_to: devops
updated_by: sdet
started_at: 2026-06-21T10:00:00Z
completed_at: 2026-06-21T11:00:00Z
complexity_estimate: 1
complexity_actual: 1
introduces_gate: no
---

# TASK-OTHER-001: Other fixture

## Work Log
- 2026-06-21 [sdet] Done | What's next: N/A | Blockers: none
`
    );

    // Archive only TST brief
    const result = cmdArchive({
      brief: "TST",
      repoRoot: tmpRepo,
    });

    expect(result.moved).toContain("TASK-TST-007-done-fixture.md");
    expect(result.moved).not.toContain("TASK-OTHER-001-done-other.md");

    // The OTHER task must still be in tasks/
    expect(
      fs.existsSync(path.join(tmpRepo, ".implementation", "tasks", "TASK-OTHER-001-done-other.md"))
    ).toBe(true);
  });
});

// ─── verify subcommand (AC-LOE-011-01 — delegates to verifyFrontMatter) ───────

describe("cmdVerify — delegates to verifyFrontMatter", () => {
  let tmpRepo: string;

  beforeEach(() => {
    tmpRepo = makeTempRepo();
  });

  afterEach(() => {
    fs.rmSync(tmpRepo, { recursive: true, force: true });
  });

  it("exit 0 on clean fixture", () => {
    // Use a valid done fixture
    copyFixture(tmpRepo, "TASK-TST-007-done-fixture.md");

    const result = cmdVerify({ repoRoot: tmpRepo });
    expect(result.violations).toHaveLength(0);
    expect(result.fileCount).toBe(1);
  });

  it("non-zero violations on malformed front matter (delegates to verifyFrontMatter)", () => {
    copyFixture(tmpRepo, "TASK-TST-006-malformed-fixture.md");

    const result = cmdVerify({ repoRoot: tmpRepo });
    expect(result.violations.length).toBeGreaterThan(0);

    // Violation must be detected by verifyFrontMatter (not re-implemented logic)
    // The malformed fixture has: bad status, bad timestamp, out-of-range complexity
    const ruleNames = result.violations.map((v) => v.rule);
    expect(ruleNames.some((r) => r.includes("status") || r.includes("started_at") || r.includes("complexity"))).toBe(true);
  });

  it("--brief filter scopes verification", () => {
    copyFixture(tmpRepo, "TASK-TST-007-done-fixture.md");
    copyFixture(tmpRepo, "TASK-TST-006-malformed-fixture.md");

    // Verify only TST-007 (clean) → should pass
    const result = cmdVerify({ brief: "TST-007", repoRoot: tmpRepo });
    // No files match "TASK-TST-007-*" with brief="TST-007" (brief filter = "TST-007" → looks for TASK-TST-007-*)
    // TASK-TST-007-done-fixture.md starts with "TASK-TST-007-" ← matches
    expect(result.violations).toHaveLength(0);
    expect(result.fileCount).toBe(1);
  });
});

// ─── Atomic write (AC-LOE-011-01) ─────────────────────────────────────────────

describe("atomicWriteFile — temp + rename, no partial write", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "atomic-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("writes file content correctly", () => {
    const target = path.join(tmpDir, "test.md");
    const content = "hello world\n";
    atomicWriteFile(target, content);
    expect(fs.readFileSync(target, "utf8")).toBe(content);
  });

  it("leaves the original intact if write fails due to permissions", () => {
    // DECISION: We test atomicity by simulating a write failure in a controlled way.
    // A forced failure during temp write leaves the original untouched because
    // renameSync is never called. This tests the "never partial-write" guarantee.
    // We use a non-writable directory to force the temp-file creation to fail.
    const readonlyDir = path.join(tmpDir, "readonly");
    fs.mkdirSync(readonlyDir);
    const readonlyTarget = path.join(readonlyDir, "test.md");
    const originalContent = "original content\n";
    fs.writeFileSync(readonlyTarget, originalContent);

    // Verify original content before making directory read-only
    expect(fs.readFileSync(readonlyTarget, "utf8")).toBe(originalContent);

    // Make directory read-only (prevents creating the temp file)
    fs.chmodSync(readonlyDir, 0o555);

    try {
      // atomicWriteFile must throw (can't write temp file in read-only dir)
      expect(() => atomicWriteFile(readonlyTarget, "new content\n")).toThrow();
    } finally {
      // Restore permissions for cleanup
      fs.chmodSync(readonlyDir, 0o755);
    }

    // After restoring permissions, original must be intact
    expect(fs.readFileSync(readonlyTarget, "utf8")).toBe(originalContent);
  });

  it("no temp file left behind after successful write", () => {
    const target = path.join(tmpDir, "task.md");
    atomicWriteFile(target, "content\n");

    const entries = fs.readdirSync(tmpDir);
    const tmpFiles = entries.filter((e) => e.startsWith(".tmp-"));
    expect(tmpFiles).toHaveLength(0);
  });
});

// ─── appendToWorkLog — closed-comment skip (correctness: minor) ──────────────
//
// Finding 2: the while-loop precedence fix ensures the bounds check governs BOTH
// the blank-line branch and the closed-comment branch, so a Work Log header
// followed immediately by a <!-- ... --> comment does not misplace the breadcrumb.
// CS-GEN-003: AC-LOE-011-02

describe("appendToWorkLog — breadcrumb insertion with closed <!-- --> comment", () => {
  it("inserts entry below a closed <!-- --> comment that follows ## Work Log", () => {
    // This is the real fixture shape used in the project task files:
    //   ## Work Log
    //   <!-- entries newest-first -->
    //   - prior entry
    const content = [
      "---",
      "status: in-progress",
      "---",
      "",
      "# Task",
      "",
      "## Work Log",
      "<!-- entries newest-first -->",
      "- 2026-06-20 [devops] Prior entry | What's next: more | Blockers: none",
    ].join("\n");

    const breadcrumb = "- 2026-06-21 [sdet] New entry | What's next: done | Blockers: none";
    const result = appendToWorkLog(content, breadcrumb);
    const lines = result.split("\n");

    // The breadcrumb must appear after the closed comment, before the prior entry
    const commentIdx = lines.findIndex((l) => l.includes("<!-- entries newest-first -->"));
    const breadcrumbIdx = lines.findIndex((l) => l === breadcrumb);
    const priorIdx = lines.findIndex((l) => l.includes("Prior entry"));

    expect(commentIdx).toBeGreaterThanOrEqual(0);
    expect(breadcrumbIdx).toBeGreaterThan(commentIdx);
    expect(breadcrumbIdx).toBeLessThan(priorIdx);
  });

  it("does not skip a partial (unclosed) <!-- comment (only skips closed ones)", () => {
    // An unclosed <!-- comment should NOT be skipped — breadcrumb goes before it
    const content = [
      "---",
      "status: in-progress",
      "---",
      "",
      "## Work Log",
      "<!-- entries newest-first",
      "- 2026-06-20 [devops] Prior | What's next: more | Blockers: none",
    ].join("\n");

    const breadcrumb = "- 2026-06-21 [sdet] New | What's next: done | Blockers: none";
    const result = appendToWorkLog(content, breadcrumb);
    const lines = result.split("\n");

    // The unclosed comment is NOT a blank line, so the breadcrumb should appear
    // immediately after the ## Work Log header (insertIdx stays at workLogIdx+1)
    const workLogIdx = lines.findIndex((l) => l.trim() === "## Work Log");
    const breadcrumbIdx = lines.findIndex((l) => l === breadcrumb);
    expect(breadcrumbIdx).toBe(workLogIdx + 1);
  });
});

// ─── cmdDone — completed_at >= started_at enforcement (correctness: minor) ────
//
// Finding 3: cmdDone now rejects a nowTs that precedes started_at. This test
// exercises the guard by injecting a nowFn that returns a timestamp earlier than
// the fixture's started_at field, confirming the error fires.
// CS-GEN-003: AC-LOE-011-02 / TASK-006-002 metric-integrity principle

describe("cmdDone — completed_at >= started_at enforced", () => {
  let tmpRepo: string;

  beforeEach(() => {
    tmpRepo = makeTempRepo();
  });

  afterEach(() => {
    fs.rmSync(tmpRepo, { recursive: true, force: true });
  });

  it("rejects done when nowFn returns a timestamp before started_at (clock skew)", () => {
    // TASK-TST-003 has started_at: 2026-06-21T10:00:00Z; inject a nowFn that
    // returns an earlier timestamp so completed_at < started_at.
    copyFixture(tmpRepo, "TASK-TST-003-review-fixture.md");

    expect(() =>
      cmdDone({
        taskId: "TASK-TST-003",
        role: "sdet",
        repoRoot: tmpRepo,
        nowFn: () => "2026-06-21T09:00:00Z", // before started_at
      })
    ).toThrow(/before started_at|clock skew/i);

    // File must be unchanged (never partial-write on error)
    const fm = readFm(
      path.join(tmpRepo, ".implementation", "tasks", "TASK-TST-003-review-fixture.md")
    );
    expect(fm["status"]).toBe("review");
  });

  it("accepts done when nowFn returns exactly started_at (boundary condition: >=)", () => {
    // started_at: 2026-06-21T10:00:00Z; nowFn returns the same timestamp → OK
    copyFixture(tmpRepo, "TASK-TST-003-review-fixture.md");

    const result = cmdDone({
      taskId: "TASK-TST-003",
      role: "sdet",
      repoRoot: tmpRepo,
      nowFn: () => "2026-06-21T10:00:00Z", // equal to started_at → valid
    });

    expect(result.changed).toBe(true);
    const fm = readFm(result.filePath);
    expect(fm["status"]).toBe("done");
    expect(fm["completed_at"]).toBe("2026-06-21T10:00:00Z");
  });
});

// ─── resolveTaskFile — path-traversal confinement regression (security: minor) ─
//
// Finding 4: lock the confinement invariant — resolveTaskFile must return null
// for any attempt to escape the allowed root (absolute paths, ../ traversal,
// --brief-style traversal args). No production change; these tests prevent
// accidental future regressions. CS-GEN-003: security confinement, task.ts:122-138

describe("resolveTaskFile — path-traversal confinement", () => {
  let tmpRepo: string;

  beforeEach(() => {
    tmpRepo = makeTempRepo();
    // Place a real task fixture so we know the resolve machinery works normally
    copyFixture(tmpRepo, "TASK-TST-003-review-fixture.md");
  });

  afterEach(() => {
    fs.rmSync(tmpRepo, { recursive: true, force: true });
  });

  it("returns null for ../../../etc/passwd traversal attempt", () => {
    const result = resolveTaskFile("../../../etc/passwd", tmpRepo);
    expect(result).toBeNull();
  });

  it("returns null for absolute /etc/passwd path attempt", () => {
    const result = resolveTaskFile("/etc/passwd", tmpRepo);
    expect(result).toBeNull();
  });

  it("returns null for ../../scripts/task traversal", () => {
    const result = resolveTaskFile("../../scripts/task", tmpRepo);
    expect(result).toBeNull();
  });

  it("still resolves a legitimate task ID after checking traversal inputs", () => {
    // Confirm normal resolution still works — confinement must not break happy path
    const result = resolveTaskFile("TASK-TST-003", tmpRepo);
    expect(result).not.toBeNull();
    expect(result).toContain("TASK-TST-003");
  });
});

describe("cmdArchive and cmdList — traversal task ID / brief args match nothing", () => {
  let tmpRepo: string;

  beforeEach(() => {
    tmpRepo = makeTempRepo();
    copyFixture(tmpRepo, "TASK-TST-007-done-fixture.md");
    copyFixture(tmpRepo, "TASK-TST-003-review-fixture.md");
  });

  afterEach(() => {
    fs.rmSync(tmpRepo, { recursive: true, force: true });
  });

  it("cmdArchive with --brief '../foo' matches nothing (no traversal escape)", () => {
    const result = cmdArchive({ brief: "../foo", repoRoot: tmpRepo });
    // No task file starts with TASK-../FOO- so nothing is moved
    expect(result.moved).toHaveLength(0);
    // The done task must still be in the active directory (not moved)
    expect(
      fs.existsSync(path.join(tmpRepo, ".implementation", "tasks", "TASK-TST-007-done-fixture.md"))
    ).toBe(true);
  });

  it("cmdList with brief '/etc' returns no tasks (absolute traversal matches nothing)", () => {
    // cmdList filters by brief prefix; no task has TASK-/ETC- prefix
    const result = cmdList({ brief: "/etc", repoRoot: tmpRepo });
    expect(result.entries).toHaveLength(0);
  });
});

// ─── Metrics parity — independent oracle test (AC-LOE-011-05) ────────────────
//
// DESIGN: The brief Notes + RETRO-LOE-010 lesson require that the metrics-parity
// test compare the CLI's emitted record against the output of the REAL
// log-task-edit.py hook for the same post-write file — NOT a re-implementation.
// This is the independent oracle.
//
// Option A fix (BUG-LOE-011-001): stage the fixture under the REAL
// .implementation/tasks/ directory with a pid-unique name so the hook's
// allowed_root confinement check passes and it writes a REAL record.
// The fallback (re-implementation) path has been REMOVED — a zero-delta must
// hard-fail, never silently degrade.
//
// CS-GEN-003: Design principle from PROPOSAL-scripted-bookkeeping.md §4

// Real tasks dir path — used for fixture staging so hook confinement passes
const REAL_TASKS_DIR = path.join(REPO_ROOT, ".implementation", "tasks");
// Real metrics file path — hook always writes here (gitignored)
const REAL_METRICS_PATH = path.join(REPO_ROOT, ".claude", "metrics", "tasks.jsonl");

describe("Metrics self-report parity vs real log-task-edit.py hook (AC-LOE-011-05)", () => {
  let tmpRepo: string;
  let cliMetricsPath: string;
  // Pid-unique task id — avoids collision with real task files and enables
  // surgical cleanup of the metrics line (strips only our record, not others).
  //
  // DECISION (BUG-LOE-011-001 Option A): The hook's TASK_ID_RE requires the
  // pattern ^TASK-\d{3}-\d{3} (exactly 3 digits, dash, 3 digits). Split the
  // last 6 digits of process.pid into two 3-digit segments to satisfy both
  // TASK_PATH_RE (\.implementation/tasks/([^/]+\.md)$) and TASK_ID_RE.
  // Real task IDs use letter segments (TASK-LOE-NNN, TASK-TST-NNN), so
  // TASK-NNN-NNN (all-numeric) will not collide with real task files.
  const pidSegA = String(process.pid).slice(-6, -3).padStart(3, "0");
  const pidSegB = String(process.pid).slice(-3).padStart(3, "0");
  const parityTaskIdActual = `TASK-${pidSegA}-${pidSegB}`;
  const parityStagedFilename = `${parityTaskIdActual}-parity.md`;
  let realTaskStagedPath: string;
  // Track pre-run metrics line count to isolate our hook record via delta
  let metricsLineCountBefore: number;

  beforeEach(() => {
    tmpRepo = makeTempRepo();
    const metricsDir = fs.mkdtempSync(path.join(os.tmpdir(), "metrics-test-"));
    cliMetricsPath = path.join(metricsDir, "cli-tasks.jsonl");
    // Stage the fixture under the REAL .implementation/tasks/ so allowed_root passes
    realTaskStagedPath = path.join(REAL_TASKS_DIR, parityStagedFilename);
    // Capture pre-run line count so we can strip only our record in afterEach
    metricsLineCountBefore = fs.existsSync(REAL_METRICS_PATH)
      ? fs.readFileSync(REAL_METRICS_PATH, "utf8").trim().split("\n").filter(Boolean).length
      : 0;
  });

  afterEach(() => {
    fs.rmSync(tmpRepo, { recursive: true, force: true });
    // Clean up staged real-path fixture (must not survive into commits)
    try { fs.unlinkSync(realTaskStagedPath); } catch { /* ignore if not created */ }
    // Clean up CLI metrics temp dir
    try {
      fs.unlinkSync(cliMetricsPath);
      fs.rmdirSync(path.dirname(cliMetricsPath));
    } catch { /* ignore */ }
    // Strip our test record from the real metrics file (identified by parityTaskIdActual)
    // so the file is not left inflated by the test run.
    if (fs.existsSync(REAL_METRICS_PATH)) {
      const allLines = fs.readFileSync(REAL_METRICS_PATH, "utf8").trim().split("\n").filter(Boolean);
      const stripped = allLines.filter((line) => {
        try {
          const rec = JSON.parse(line) as Record<string, unknown>;
          return rec["task_id"] !== parityTaskIdActual;
        } catch { return true; }
      });
      if (stripped.length !== allLines.length) {
        const newContent = stripped.length > 0 ? stripped.join("\n") + "\n" : "";
        fs.writeFileSync(REAL_METRICS_PATH, newContent, "utf8");
      }
    }
  });

  it("CLI metrics record matches the real log-task-edit.py hook record for all 9 keys", () => {
    // If hook script is missing, hard-fail immediately — no graceful skip
    // (the hook is a required part of the production system under test)
    if (!fs.existsSync(HOOK_SCRIPT)) {
      throw new Error(`Hook script not found at ${HOOK_SCRIPT} — cannot run parity test`);
    }

    // Step 1: Copy fixture into tmpRepo under the expected task id name, then
    // run cmdStart so the CLI writes the post-mutated file and emits a CLI
    // metrics record to cliMetricsPath.
    //
    // We use a fixture named with the pid-suffix task id so that:
    //   - tmpRepo side: CLI reads/writes this file normally (repoRoot=tmpRepo)
    //   - real-tasks side: we copy the POST-write file there for the hook
    const tmpFixtureName = `${parityTaskIdActual}-parity.md`;
    const tmpFixturePath = path.join(tmpRepo, ".implementation", "tasks", tmpFixtureName);
    // Copy the backlog fixture as our pid-unique task
    fs.copyFileSync(
      path.join(FIXTURES_SRC, "TASK-TST-001-backlog-fixture.md"),
      tmpFixturePath
    );

    const result = cmdStart({
      taskId: parityTaskIdActual,
      role: "devops",
      complexityEstimate: 3,
      note: "parity test",
      repoRoot: tmpRepo,
      metricsPath: cliMetricsPath,
      nowFn: fixedNow("2026-06-21T15:00:00Z"),
    });

    expect(result.changed).toBe(true);
    expect(fs.existsSync(cliMetricsPath)).toBe(true);

    // Parse the CLI metrics record
    const cliLine = fs.readFileSync(cliMetricsPath, "utf8").trim().split("\n").pop()!;
    const cliRecord = JSON.parse(cliLine) as Record<string, unknown>;

    // Sanity: CLI record must have a task_id and file_path
    expect(cliRecord["task_id"]).toBeDefined();
    expect(typeof cliRecord["task_id"]).toBe("string");

    // Step 2: Copy the post-write file to the REAL .implementation/tasks/ directory
    // under the pid-unique name so the hook's allowed_root confinement passes.
    // The hook reads this file when fed its real path via stdin JSON.
    fs.copyFileSync(result.filePath, realTaskStagedPath);

    // Step 3: Invoke the REAL log-task-edit.py hook with the staged real path.
    // The hook input mirrors what Claude Code sends: {"tool_response": {"filePath": "<path>"}}
    const hookInput = JSON.stringify({
      tool_response: { filePath: realTaskStagedPath },
      tool_input: { file_path: realTaskStagedPath },
    });

    const hookResult = spawnSync(
      "python3",
      [HOOK_SCRIPT],
      {
        input: hookInput,
        encoding: "utf8",
        timeout: 10_000,
      }
    );

    // Hook always exits 0 (by design — never disrupts Claude Code)
    expect(hookResult.status).toBe(0);

    // Step 4: Assert the hook actually wrote a NEW record (line-count delta must be 1).
    // A delta of 0 means the hook silently skipped — this is a hard test failure,
    // never a fallback. The old fallback path (comparing against extractFrontMatter)
    // has been REMOVED per BUG-LOE-011-001 fix requirements.
    expect(
      fs.existsSync(REAL_METRICS_PATH),
      "Hook did not create metrics file — confinement or path check failed"
    ).toBe(true);

    const allLinesAfter = fs.readFileSync(REAL_METRICS_PATH, "utf8")
      .trim()
      .split("\n")
      .filter(Boolean);

    const newLines = allLinesAfter.slice(metricsLineCountBefore);
    expect(
      newLines.length,
      `Hook wrote ${newLines.length} new lines (expected exactly 1). ` +
      `Staged path: ${realTaskStagedPath}. ` +
      `Hook stderr: ${hookResult.stderr ?? "(none)"}`
    ).toBe(1);

    // Guard against vacuous assertion: if the record parses to an empty object,
    // that is also a test failure.
    const hookRecord = JSON.parse(newLines[0]!) as Record<string, unknown>;
    expect(
      Object.keys(hookRecord).length,
      "Hook record parsed to empty object — malformed JSONL line"
    ).toBeGreaterThan(0);

    // Step 5: Compare all 9 keys.
    //
    // Key set must match exactly (same 9 snake_case keys on both records).
    const expectedKeys = [
      "ts", "task_id", "file_path", "status",
      "complexity_estimate", "complexity_actual",
      "started_at", "completed_at", "assigned_to",
    ];
    expect(Object.keys(cliRecord).sort()).toEqual(expectedKeys.sort());
    expect(Object.keys(hookRecord).sort()).toEqual(expectedKeys.sort());

    // 8 semantic-value keys must match exactly.
    // DECISION (BUG-LOE-011-001 Option A): file_path legitimately differs —
    // cliRecord["file_path"] is the tmpRepo path (CLI wrote/read tmpRepo),
    // hookRecord["file_path"] is realTaskStagedPath (hook read the staged copy).
    // Assert each side's file_path is its own expected path, then compare the
    // 7 remaining semantic-value keys (task_id, status, complexity_*, *_at, assigned_to).
    expect(cliRecord["file_path"]).toBe(result.filePath);
    expect(hookRecord["file_path"]).toBe(realTaskStagedPath);

    const semanticKeys = [
      "task_id", "status",
      "complexity_estimate", "complexity_actual",
      "started_at", "completed_at", "assigned_to",
    ];
    for (const key of semanticKeys) {
      // Guard against undefined on either side (absent key is a test failure, not a skip)
      expect(
        cliRecord[key] !== undefined,
        `CLI record missing key "${key}"`
      ).toBe(true);
      expect(
        hookRecord[key] !== undefined,
        `Hook record missing key "${key}"`
      ).toBe(true);
      expect(cliRecord[key]).toBe(hookRecord[key]);
    }

    // ts: must be valid ISO-8601 UTC on both; equality NOT required (different clocks).
    // CLI emits "…Z" (JS toISOString()); hook emits "…+00:00" (Python isoformat()).
    // Both are valid ISO-8601 UTC representations — accept either form.
    const isoUtcRe = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]00:00)$/;
    expect(String(cliRecord["ts"])).toMatch(isoUtcRe);
    expect(String(hookRecord["ts"])).toMatch(isoUtcRe);
  });
});

// ─── Integration: full lifecycle (AC-LOE-011-09 groundwork) ───────────────────
//
// A mini end-to-end slice driven entirely through the CLI functions:
//   start → log → review → done → archive
// Demonstrates the task is well-formed after each step.

describe("End-to-end lifecycle: start → log → review → done → archive", () => {
  let tmpRepo: string;

  beforeEach(() => {
    tmpRepo = makeTempRepo();
  });

  afterEach(() => {
    fs.rmSync(tmpRepo, { recursive: true, force: true });
  });

  it("full lifecycle leaves task well-formed at each step", () => {
    copyFixture(tmpRepo, "TASK-TST-001-backlog-fixture.md");

    // Step 1: start
    const startResult = cmdStart({
      taskId: "TASK-TST-001",
      role: "devops",
      complexityEstimate: 2,
      note: "e2e test",
      repoRoot: tmpRepo,
      nowFn: fixedNow("2026-06-21T10:00:00Z"),
    });
    expect(startResult.changed).toBe(true);
    let fm = readFm(startResult.filePath);
    expect(fm["status"]).toBe("in-progress");

    // Step 2: log
    cmdLog({
      taskId: "TASK-TST-001",
      role: "devops",
      did: "implemented feature",
      next: "run tests",
      repoRoot: tmpRepo,
    });

    // Step 3: review
    const reviewResult = cmdReview({
      taskId: "TASK-TST-001",
      role: "devops",
      complexityActual: 2,
      note: "tests pass",
      repoRoot: tmpRepo,
    });
    expect(reviewResult.changed).toBe(true);
    fm = readFm(reviewResult.filePath);
    expect(fm["status"]).toBe("review");
    expect(fm["complexity_actual"]).toBe("2");

    // Step 4: done (as SDET)
    const doneResult = cmdDone({
      taskId: "TASK-TST-001",
      role: "sdet",
      note: "approved",
      repoRoot: tmpRepo,
      nowFn: fixedNow("2026-06-21T12:00:00Z"),
    });
    expect(doneResult.changed).toBe(true);
    fm = readFm(doneResult.filePath);
    expect(fm["status"]).toBe("done");
    expect(fm["completed_at"]).toBe("2026-06-21T12:00:00Z");

    // Verify well-formed (no violations)
    const extracted = extractFrontMatter(readContent(doneResult.filePath));
    if (!extracted.found) throw new Error("No FM after done");
    const violations = verifyFrontMatter(extracted.fm, doneResult.filePath);
    expect(violations).toHaveLength(0);

    // Step 5: archive
    const archiveResult = cmdArchive({
      repoRoot: tmpRepo,
    });
    expect(archiveResult.moved).toContain("TASK-TST-001-backlog-fixture.md");

    // Task must now be in done/
    const doneDir = path.join(tmpRepo, ".implementation", "tasks", "done");
    expect(fs.existsSync(path.join(doneDir, "TASK-TST-001-backlog-fixture.md"))).toBe(true);

    // Work Log must contain "Starting implementation" (validate-gates.sh check 5)
    const finalContent = readContent(path.join(doneDir, "TASK-TST-001-backlog-fixture.md"));
    expect(finalContent).toContain("Starting implementation");
    expect(finalContent).toContain("review");
  });
});

// ─── formatBreadcrumb utility ──────────────────────────────────────────────────

describe("formatBreadcrumb", () => {
  it("produces YYYY-MM-DD [role] did | What's next: next | Blockers: none", () => {
    const bc = formatBreadcrumb("devops", "did something", "do next", "none");
    expect(bc).toMatch(/^- \d{4}-\d{2}-\d{2} \[devops\] did something \| What's next: do next \| Blockers: none$/);
  });

  it("defaults blockers to none", () => {
    const bc = formatBreadcrumb("io", "did x", "do y");
    expect(bc).toContain("Blockers: none");
  });
});

// ─── deriveTaskId ─────────────────────────────────────────────────────────────

describe("deriveTaskId", () => {
  it("extracts TASK-LOE-011-001 from full path", () => {
    expect(deriveTaskId("/path/to/TASK-LOE-011-001-write-cli.md")).toBe("TASK-LOE-011-001");
  });

  it("extracts BUG-000-001 from path", () => {
    expect(deriveTaskId("/path/BUG-000-001-something.md")).toBe("BUG-000-001");
  });

  it("extracts TASK-TST-001 from three-segment ID", () => {
    expect(deriveTaskId("/path/TASK-TST-001-backlog-fixture.md")).toBe("TASK-TST-001");
  });
});

// ─── parseComplexity ──────────────────────────────────────────────────────────

describe("parseComplexity", () => {
  it("returns null for empty string", () => {
    expect(parseComplexity("")).toBeNull();
  });

  it("returns null for dash sentinel", () => {
    expect(parseComplexity("—")).toBeNull();
  });

  it("returns null for undefined", () => {
    expect(parseComplexity(undefined)).toBeNull();
  });

  it("returns number for valid '3'", () => {
    expect(parseComplexity("3")).toBe(3);
  });

  it("returns NaN for non-numeric 'abc'", () => {
    expect(parseComplexity("abc")).toBeNaN();
  });

  it("returns 7 for '7' (caller validates range)", () => {
    expect(parseComplexity("7")).toBe(7);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// READ/QUERY SUBCOMMANDS (AC-LOE-011-06 / TASK-LOE-011-002)
//
// Design: PROPOSAL-scripted-bookkeeping.md §8.2 / §10 Q5
//   - Strictly read-only: no mutations, no metrics writes
//   - Default: compact text/tables; --json opt-in
//   - brief-context: paste-ready markdown bundle by default
//   - CS-GEN-003: cite governing authority in test comments
//
// Oracle discipline (Phase-0/-001 lesson nudge):
//   The `progress` test asserts against the REAL extractCurrentInitiativeSection
//   output on the REAL fixture content — not a hand-rebuilt copy in the test.
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Set up a temp repo with the multi-status RD-001 fixtures.
 * Returns the tmp dir. Each test is responsible for cleanup.
 */
function makeReadTestRepo(): string {
  const tmpRepo = makeTempRepo();

  // Copy the 3-task BRIEF-RD-001 fixture set (backlog, in-progress, review)
  for (const f of [
    "TASK-RD-001-001-backlog-read-fixture.md",
    "TASK-RD-001-002-inprogress-read-fixture.md",
    "TASK-RD-001-003-review-read-fixture.md",
  ]) {
    const src = path.join(FIXTURES_SRC, f);
    const dst = path.join(tmpRepo, ".implementation", "tasks", f);
    fs.copyFileSync(src, dst);
  }

  return tmpRepo;
}

// ─── cmdShow (AC-LOE-011-06) ──────────────────────────────────────────────────

describe("cmdShow — bounded field projection (AC-LOE-011-06)", () => {
  let tmpRepo: string;

  beforeEach(() => {
    tmpRepo = makeTempRepo();
    copyFixture(tmpRepo, "TASK-TST-003-review-fixture.md");
  });

  afterEach(() => {
    fs.rmSync(tmpRepo, { recursive: true, force: true });
  });

  it("default (no --fields) returns lifecycle block fields, not the whole file", () => {
    const result = cmdShow({ taskId: "TASK-TST-003", repoRoot: tmpRepo });
    expect(result.taskId).toBe("TASK-TST-003");

    // Lifecycle fields should be present
    expect("status" in result.fields).toBe(true);
    expect(result.fields["status"]).toBe("review");
    expect("complexity_estimate" in result.fields).toBe(true);
    expect("started_at" in result.fields).toBe(true);

    // Non-lifecycle fields should NOT be in the result (bounded projection)
    // The task spec body is NOT included — no ## Quality Gates, no ## Work Log prose
    // We verify the field count matches LIFECYCLE_FIELDS
    const fieldCount = Object.keys(result.fields).length;
    expect(fieldCount).toBeLessThanOrEqual(8); // LIFECYCLE_FIELDS has 8 entries
  });

  it("--fields subsetting returns ONLY the requested fields", () => {
    const result = cmdShow({
      taskId: "TASK-TST-003",
      fields: ["status", "complexity_actual"],
      repoRoot: tmpRepo,
    });

    // Only the two requested fields should be present
    expect(Object.keys(result.fields)).toHaveLength(2);
    expect(result.fields["status"]).toBe("review");
    expect(result.fields["complexity_actual"]).toBe("3");

    // Other fields must NOT be in the result (bounded, not full dump)
    expect("started_at" in result.fields).toBe(false);
    expect("updated_by" in result.fields).toBe(false);
    expect("brief" in result.fields).toBe(false);
  });

  it("--fields with hyphenated name (complexity-actual) is normalized to snake_case", () => {
    const result = cmdShow({
      taskId: "TASK-TST-003",
      fields: ["complexity-actual", "status"],
      repoRoot: tmpRepo,
    });

    expect(result.fields["complexity_actual"]).toBe("3");
    expect(result.fields["status"]).toBe("review");
    expect(Object.keys(result.fields)).toHaveLength(2);
  });

  it("renders compact text by default (not JSON)", () => {
    const result = cmdShow({ taskId: "TASK-TST-003", fields: ["status"], repoRoot: tmpRepo });
    const output = renderShow(result, false);

    expect(output).toContain("TASK-TST-003");
    expect(output).toContain("status: review");
    // Must NOT be JSON
    expect(output.trim().startsWith("{")).toBe(false);
  });

  it("renders JSON when json=true", () => {
    const result = cmdShow({ taskId: "TASK-TST-003", fields: ["status", "complexity_actual"], repoRoot: tmpRepo });
    const output = renderShow(result, true);

    const parsed = JSON.parse(output) as Record<string, unknown>;
    expect(parsed["task_id"]).toBe("TASK-TST-003");
    expect((parsed["fields"] as Record<string, unknown>)["status"]).toBe("review");
    expect((parsed["fields"] as Record<string, unknown>)["complexity_actual"]).toBe("3");
  });

  it("throws TaskCliError for a non-existent task ID", () => {
    expect(() => cmdShow({ taskId: "TASK-NONEXIST-999", repoRoot: tmpRepo }))
      .toThrow(TaskCliError);
  });
});

// ─── cmdList (AC-LOE-011-06) ──────────────────────────────────────────────────

describe("cmdList — compact table by brief (AC-LOE-011-06)", () => {
  let tmpRepo: string;

  beforeEach(() => {
    tmpRepo = makeReadTestRepo();
  });

  afterEach(() => {
    fs.rmSync(tmpRepo, { recursive: true, force: true });
  });

  it("lists all tasks for a brief without status filter", () => {
    const result = cmdList({ brief: "RD-001", repoRoot: tmpRepo });

    expect(result.brief).toBe("RD-001");
    expect(result.entries).toHaveLength(3);
    expect(result.filtered).toBe(false);

    const taskIds = result.entries.map(e => e.taskId);
    expect(taskIds).toContain("TASK-RD-001-001");
    expect(taskIds).toContain("TASK-RD-001-002");
    expect(taskIds).toContain("TASK-RD-001-003");
  });

  it("--status filter returns only matching tasks", () => {
    const result = cmdList({
      brief: "RD-001",
      statuses: ["backlog"],
      repoRoot: tmpRepo,
    });

    expect(result.filtered).toBe(true);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]!.taskId).toBe("TASK-RD-001-001");
    expect(result.entries[0]!.status).toBe("backlog");
  });

  it("--status filter for in-progress returns only in-progress tasks", () => {
    const result = cmdList({
      brief: "RD-001",
      statuses: ["in-progress"],
      repoRoot: tmpRepo,
    });

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]!.taskId).toBe("TASK-RD-001-002");
    expect(result.entries[0]!.status).toBe("in-progress");
  });

  it("--status multi-value filter returns union of matching statuses", () => {
    const result = cmdList({
      brief: "RD-001",
      statuses: ["backlog", "review"],
      repoRoot: tmpRepo,
    });

    expect(result.entries).toHaveLength(2);
    const statuses = result.entries.map(e => e.status);
    expect(statuses).toContain("backlog");
    expect(statuses).toContain("review");
    expect(statuses).not.toContain("in-progress");
  });

  it("renders compact table by default (not JSON) — contains IDs and status", () => {
    const result = cmdList({ brief: "RD-001", repoRoot: tmpRepo });
    const output = renderList(result, false);

    // Table must have a header + separator + rows
    expect(output).toContain("TASK-ID");
    expect(output).toContain("STATUS");
    expect(output).toContain("TASK-RD-001-001");
    expect(output).toContain("backlog");
    expect(output).toContain("in-progress");
    expect(output).toContain("review");
    // Must NOT be JSON
    expect(output.trim().startsWith("{")).toBe(false);
  });

  it("renders JSON when json=true — valid parseable JSON with structural parity", () => {
    const result = cmdList({ brief: "RD-001", repoRoot: tmpRepo });
    const output = renderList(result, true);

    const parsed = JSON.parse(output) as Record<string, unknown>;
    expect(parsed["brief"]).toBe("RD-001");
    expect(Array.isArray(parsed["entries"])).toBe(true);

    const entries = parsed["entries"] as Array<Record<string, unknown>>;
    expect(entries).toHaveLength(3);
    // Each entry must have task_id and status keys (structural parity with compact text)
    for (const entry of entries) {
      expect("task_id" in entry).toBe(true);
      expect("status" in entry).toBe(true);
    }
  });

  it("returns empty result (not error) when no tasks match the brief", () => {
    const result = cmdList({ brief: "NONEXISTENT-999", repoRoot: tmpRepo });
    expect(result.entries).toHaveLength(0);
  });
});

// ─── cmdNext (AC-LOE-011-06) ──────────────────────────────────────────────────

describe("cmdNext — single actionable task (AC-LOE-011-06)", () => {
  let tmpRepo: string;

  beforeEach(() => {
    tmpRepo = makeReadTestRepo();
  });

  afterEach(() => {
    fs.rmSync(tmpRepo, { recursive: true, force: true });
  });

  it("returns the backlog task first (priority: backlog > in-progress > review)", () => {
    // Our RD-001 fixture has backlog, in-progress, review
    const result = cmdNext({ brief: "RD-001", repoRoot: tmpRepo });

    expect(result.taskId).toBe("TASK-RD-001-001");
    expect(result.scope).toBeDefined();
    expect(result.scope).not.toBeNull();
    // Scope should be the H1 title line (stripped of #)
    expect(result.scope).toContain("Read projection fixture");
    expect(result.reason).toContain("backlog");
  });

  it("returns a single item — taskId + scope (one-line)", () => {
    const result = cmdNext({ brief: "RD-001", repoRoot: tmpRepo });

    expect(result.taskId).not.toBeNull();
    expect(typeof result.taskId).toBe("string");
    expect(result.scope).not.toBeNull();
    // Scope must be a single line (no newlines — it comes from the H1 title)
    expect(result.scope).not.toContain("\n");
  });

  it("returns next in-progress when no backlog exists for the brief", () => {
    // Remove the backlog fixture, leaving only in-progress and review
    const backlogFile = path.join(
      tmpRepo,
      ".implementation",
      "tasks",
      "TASK-RD-001-001-backlog-read-fixture.md"
    );
    fs.unlinkSync(backlogFile);

    const result = cmdNext({ brief: "RD-001", repoRoot: tmpRepo });
    expect(result.taskId).toBe("TASK-RD-001-002");
    expect(result.reason).toContain("in-progress");
  });

  it("returns null taskId when all tasks are done or no tasks exist", () => {
    // Empty repo — no tasks
    const emptyRepo = makeTempRepo();
    try {
      const result = cmdNext({ brief: "RD-001", repoRoot: emptyRepo });
      expect(result.taskId).toBeNull();
      expect(result.scope).toBeNull();
    } finally {
      fs.rmSync(emptyRepo, { recursive: true, force: true });
    }
  });

  it("renders compact text by default (single line: 'next: <ID> — scope')", () => {
    const result = cmdNext({ brief: "RD-001", repoRoot: tmpRepo });
    const output = renderNext(result, false);

    expect(output).toContain("next:");
    expect(output).toContain("TASK-RD-001-001");
    expect(output.trim().startsWith("{")).toBe(false);
  });

  it("renders JSON when json=true", () => {
    const result = cmdNext({ brief: "RD-001", repoRoot: tmpRepo });
    const output = renderNext(result, true);

    const parsed = JSON.parse(output) as Record<string, unknown>;
    expect("task_id" in parsed).toBe(true);
    expect("scope" in parsed).toBe(true);
    expect("reason" in parsed).toBe(true);
    expect(parsed["task_id"]).toBe("TASK-RD-001-001");
  });
});

// ─── cmdSummary (AC-LOE-011-06) ───────────────────────────────────────────────

describe("cmdSummary — computed rollup (AC-LOE-011-06)", () => {
  let tmpRepo: string;

  beforeEach(() => {
    tmpRepo = makeReadTestRepo();
  });

  afterEach(() => {
    fs.rmSync(tmpRepo, { recursive: true, force: true });
  });

  it("counts by status correctly (1 backlog, 1 in-progress, 1 review)", () => {
    const result = cmdSummary({ brief: "RD-001", repoRoot: tmpRepo });

    expect(result.brief).toBe("RD-001");
    expect(result.total).toBe(3);
    expect(result.byStatus["backlog"]).toBe(1);
    expect(result.byStatus["in-progress"]).toBe(1);
    expect(result.byStatus["review"]).toBe(1);
  });

  it("detects open gates correctly (backlog + in-progress have unchecked gates)", () => {
    const result = cmdSummary({ brief: "RD-001", repoRoot: tmpRepo });

    // Backlog fixture has "- [ ] **Work Log complete**" etc. (open gates)
    // In-progress fixture has open gates too
    // Review fixture has only "- [ ] **SDET Review**" open
    expect(result.openGates.length).toBeGreaterThan(0);
    expect(result.openGates).toContain("TASK-RD-001-001");
    expect(result.openGates).toContain("TASK-RD-001-002");
  });

  it("detects missing metadata for non-backlog tasks without started_at", () => {
    // Backlog task has started_at: — (should NOT flag as missing for backlog)
    // In-progress task HAS started_at set — should NOT flag
    // Review task HAS started_at set — should NOT flag
    const result = cmdSummary({ brief: "RD-001", repoRoot: tmpRepo });

    // None of our fixtures have legitimately missing metadata for their statuses
    // (backlog fixture is exempt, in-progress has started_at, review has complexity_actual)
    expect(result.missingMetadata).toHaveLength(0);
  });

  it("flags missing complexity_actual for review tasks that lack it", () => {
    // Reuse TST-004 fixture which has status: review + complexity_actual: —
    const reviewNoComplexity = path.join(tmpRepo, ".implementation", "tasks", "TASK-RD-001-004-review-no-ca.md");
    fs.writeFileSync(reviewNoComplexity, `---
brief: BRIEF-RD-001
status: review
assigned_to: devops
updated_by: devops
started_at: 2026-06-21T12:00:00Z
completed_at: —
complexity_estimate: 2
complexity_actual: —
introduces_gate: no
acceptance_criteria: [AC-RD-001-01]
upstream_refs: none
---

# TASK-RD-001-004: Missing complexity_actual fixture

## Work Log
- 2026-06-21 [devops] test | What's next: more | Blockers: none
`);

    const result = cmdSummary({ brief: "RD-001", repoRoot: tmpRepo });
    expect(result.missingMetadata.some(m => m.includes("TASK-RD-001-004"))).toBe(true);
    expect(result.missingMetadata.some(m => m.includes("complexity_actual"))).toBe(true);
  });

  it("renders compact text by default (counts visible, not JSON)", () => {
    const result = cmdSummary({ brief: "RD-001", repoRoot: tmpRepo });
    const output = renderSummary(result, false);

    expect(output).toContain("brief: RD-001");
    expect(output).toContain("by status:");
    expect(output).toContain("backlog: 1");
    expect(output).toContain("in-progress: 1");
    expect(output.trim().startsWith("{")).toBe(false);
  });

  it("renders JSON when json=true — structural parity with compact text", () => {
    const result = cmdSummary({ brief: "RD-001", repoRoot: tmpRepo });
    const output = renderSummary(result, true);

    const parsed = JSON.parse(output) as Record<string, unknown>;
    expect(parsed["brief"]).toBe("RD-001");
    expect(typeof parsed["total"]).toBe("number");
    expect("by_status" in parsed).toBe(true);
    expect("open_gates" in parsed).toBe(true);
    expect("missing_metadata" in parsed).toBe(true);

    const byStatus = parsed["by_status"] as Record<string, unknown>;
    expect(byStatus["backlog"]).toBe(1);
    expect(byStatus["in-progress"]).toBe(1);
    expect(byStatus["review"]).toBe(1);
  });
});

// ─── cmdProgress (AC-LOE-011-06) ──────────────────────────────────────────────
//
// Oracle discipline (Phase-0/-001 lesson nudge, TASK-LOE-011-002 dispatch):
// The `progress` test must assert against the REAL extracted content from the
// REAL PROGRESS-fixture.md via extractCurrentInitiativeSection — NOT a
// hand-rebuilt copy. This ensures we are testing the actual projection function,
// not re-implementing it in the test.
// CS-GEN-003: cite the extract function that IS the real projection.

describe("cmdProgress — projects ## Current initiative only (AC-LOE-011-06)", () => {
  let tmpRepo: string;

  beforeEach(() => {
    tmpRepo = makeTempRepo();
    // Copy the PROGRESS fixture into the expected location
    const src = path.join(FIXTURES_SRC, "PROGRESS-fixture.md");
    const progressDir = path.join(tmpRepo, ".implementation", "tasks");
    fs.copyFileSync(src, path.join(progressDir, "PROGRESS.md"));
  });

  afterEach(() => {
    fs.rmSync(tmpRepo, { recursive: true, force: true });
  });

  it("projects only ## Current initiative, excludes the session-entry tail (below ---)", () => {
    // Use injectable progressPath to point at the fixture
    const progressPath = path.join(tmpRepo, ".implementation", "tasks", "PROGRESS.md");
    const result = cmdProgress({ progressPath });

    // The hotState MUST contain ## Current initiative content
    expect(result.hotState).toContain("## Current initiative");
    expect(result.hotState).toContain("BRIEF-RD-001");

    // The hotState MUST NOT contain session-entry tail content (below ---)
    expect(result.hotState).not.toContain("IO Plan");
    expect(result.hotState).not.toContain("IO Dispatch");
    expect(result.hotState).not.toContain("should NOT appear in progress output");
    expect(result.hotState).not.toContain("must NOT appear");

    // The hotState MUST NOT contain the --- separator itself
    // (the separator is the stop signal, not part of the projection)
    expect(result.hotState).not.toContain("\n---");
  });

  it("projection is bounded — does NOT include ## Awaiting PR merge or other sections", () => {
    const progressPath = path.join(tmpRepo, ".implementation", "tasks", "PROGRESS.md");
    const result = cmdProgress({ progressPath });

    // Section headers below ## Current initiative must NOT be in the projection
    expect(result.hotState).not.toContain("## Awaiting PR merge");
    expect(result.hotState).not.toContain("## Active bugs");
    expect(result.hotState).not.toContain("## Open retro action items");
  });

  it("REAL oracle: projection output == extractCurrentInitiativeSection on the real fixture", () => {
    // CS-GEN-003: This is the anti-re-implementation oracle.
    // We run the REAL extractCurrentInitiativeSection on the fixture content
    // and assert the cmdProgress result matches it — no hand-built comparison.
    const progressPath = path.join(tmpRepo, ".implementation", "tasks", "PROGRESS.md");
    const fixtureContent = fs.readFileSync(progressPath, "utf8");

    // Real projection (the actual function under test)
    const realProjection = extractCurrentInitiativeSection(fixtureContent);

    // cmdProgress must produce exactly the same result
    const result = cmdProgress({ progressPath });
    expect(result.hotState).toBe(realProjection);

    // Anti-vacuity: the real projection must be non-empty (not a no-op pass)
    expect(realProjection.length).toBeGreaterThan(0);
    expect(realProjection).toContain("## Current initiative");
  });

  it("renders compact text by default (section content as-is)", () => {
    const progressPath = path.join(tmpRepo, ".implementation", "tasks", "PROGRESS.md");
    const result = cmdProgress({ progressPath });
    const output = renderProgress(result, false);

    expect(output).toContain("## Current initiative");
    expect(output).not.toContain("IO Plan");
    expect(output.trim().startsWith("{")).toBe(false);
  });

  it("renders JSON when json=true — current_initiative key contains the projection", () => {
    const progressPath = path.join(tmpRepo, ".implementation", "tasks", "PROGRESS.md");
    const result = cmdProgress({ progressPath });
    const output = renderProgress(result, true);

    const parsed = JSON.parse(output) as Record<string, unknown>;
    expect("current_initiative" in parsed).toBe(true);
    expect(typeof parsed["current_initiative"]).toBe("string");
    expect((parsed["current_initiative"] as string)).toContain("## Current initiative");
    // Session tail must NOT be in JSON output either
    expect((parsed["current_initiative"] as string)).not.toContain("IO Plan");
  });

  it("throws TaskCliError when PROGRESS.md is missing", () => {
    expect(() =>
      cmdProgress({ progressPath: "/tmp/nonexistent-progress-file-task-loe-011.md" })
    ).toThrow(TaskCliError);
  });
});

// ─── extractCurrentInitiativeSection unit tests ────────────────────────────────

describe("extractCurrentInitiativeSection — section extraction from PROGRESS.md", () => {
  it("extracts only ## Current initiative, stops at next ## heading", () => {
    const content = [
      "# Progress",
      "",
      "## Current initiative",
      "",
      "Active work here.",
      "",
      "## Awaiting PR merge",
      "",
      "_Empty._",
      "",
      "---",
      "",
      "### Session entry",
    ].join("\n");

    const extracted = extractCurrentInitiativeSection(content);
    expect(extracted).toContain("## Current initiative");
    expect(extracted).toContain("Active work here.");
    expect(extracted).not.toContain("## Awaiting PR merge");
    expect(extracted).not.toContain("Session entry");
  });

  it("stops at --- separator even without a next ## heading", () => {
    const content = [
      "## Current initiative",
      "",
      "Hot state content.",
      "",
      "---",
      "",
      "### Session entry (must not appear)",
    ].join("\n");

    const extracted = extractCurrentInitiativeSection(content);
    expect(extracted).toContain("Hot state content.");
    expect(extracted).not.toContain("Session entry");
    expect(extracted).not.toContain("---");
  });

  it("returns empty string when ## Current initiative is absent", () => {
    const content = "# Progress\n\n## Other section\n\nContent.\n";
    const extracted = extractCurrentInitiativeSection(content);
    expect(extracted).toBe("");
  });
});

// ─── cmdBriefContext (AC-LOE-011-06) ─────────────────────────────────────────

describe("cmdBriefContext — bounded bundle for subagent spawn (AC-LOE-011-06)", () => {
  let tmpRepo: string;

  beforeEach(() => {
    tmpRepo = makeTempRepo();
    // Copy a task fixture
    copyFixture(tmpRepo, "TASK-RD-001-001-backlog-read-fixture.md");
    // Copy the brief fixture into .implementation/briefs/
    const briefsDir = path.join(tmpRepo, ".implementation", "briefs");
    fs.mkdirSync(briefsDir, { recursive: true });
    fs.copyFileSync(
      path.join(FIXTURES_SRC, "BRIEF-RD-001-read-projection-test.md"),
      path.join(briefsDir, "BRIEF-RD-001-read-projection-test.md")
    );
    // Copy the CS standard files from the real repo into a mirrored structure
    const csDir = path.join(tmpRepo, ".code-standards", "standards", "infra");
    const csGenDir = path.join(tmpRepo, ".code-standards", "standards", "cross-cutting");
    fs.mkdirSync(csDir, { recursive: true });
    fs.mkdirSync(csGenDir, { recursive: true });
    fs.copyFileSync(
      path.join(REPO_ROOT, ".code-standards", "standards", "infra", "CS-INFRA-004-zero-dep-engine-scripts.md"),
      path.join(csDir, "CS-INFRA-004-zero-dep-engine-scripts.md")
    );
    fs.copyFileSync(
      path.join(REPO_ROOT, ".code-standards", "standards", "cross-cutting", "CS-GEN-003-cite-governing-key-in-comments.md"),
      path.join(csGenDir, "CS-GEN-003-cite-governing-key-in-comments.md")
    );
  });

  afterEach(() => {
    fs.rmSync(tmpRepo, { recursive: true, force: true });
  });

  it("default output is paste-ready markdown bundle (not JSON)", () => {
    const result = cmdBriefContext({ taskId: "TASK-RD-001-001", repoRoot: tmpRepo });
    const output = renderBriefContext(result, false);

    // Must be markdown, not JSON
    expect(output.trim().startsWith("{")).toBe(false);
    // Must contain the task ID
    expect(output).toContain("TASK-RD-001-001");
    // Must contain a markdown heading
    expect(output).toContain("## Task:");
  });

  it("includes the task spec body (bounded: no re-serialized FM block)", () => {
    const result = cmdBriefContext({ taskId: "TASK-RD-001-001", repoRoot: tmpRepo });

    // taskSpec is the body (without FM)
    expect(result.taskSpec).toContain("# TASK-RD-001-001");
    // Must NOT be a full file dump with the ---...--- block
    expect(result.taskSpec.startsWith("---")).toBe(false);
  });

  it("includes cited AC IDs from the task FM", () => {
    const result = cmdBriefContext({ taskId: "TASK-RD-001-001", repoRoot: tmpRepo });

    expect(result.citedAcs).toContain("AC-RD-001-01");
    expect(result.citedAcs).toContain("AC-RD-001-02");
  });

  it("includes AC texts resolved from the brief file", () => {
    const result = cmdBriefContext({ taskId: "TASK-RD-001-001", repoRoot: tmpRepo });

    expect(result.acTexts["AC-RD-001-01"]).toBeDefined();
    expect(typeof result.acTexts["AC-RD-001-01"]).toBe("string");
    expect(result.acTexts["AC-RD-001-01"]).toContain("show command");
  });

  it("includes cited CS-* IDs from the task FM", () => {
    const result = cmdBriefContext({ taskId: "TASK-RD-001-001", repoRoot: tmpRepo });

    expect(result.citedCs).toContain("CS-INFRA-004");
    expect(result.citedCs).toContain("CS-GEN-003");
  });

  it("includes CS standard text resolved from .code-standards/", () => {
    const result = cmdBriefContext({ taskId: "TASK-RD-001-001", repoRoot: tmpRepo });

    expect(result.csTexts["CS-INFRA-004"]).toBeDefined();
    // The ## Rule section of CS-INFRA-004 describes importing only Node.js built-ins
    expect(result.csTexts["CS-INFRA-004"]).toContain("Node.js built-in modules");
  });

  it("--json renders a structured object with all required keys", () => {
    const result = cmdBriefContext({ taskId: "TASK-RD-001-001", repoRoot: tmpRepo });
    const output = renderBriefContext(result, true);

    const parsed = JSON.parse(output) as Record<string, unknown>;
    expect(parsed["task_id"]).toBe("TASK-RD-001-001");
    expect("front_matter" in parsed).toBe(true);
    expect("cited_acs" in parsed).toBe(true);
    expect("ac_texts" in parsed).toBe(true);
    expect("cited_cs" in parsed).toBe(true);
    expect("cs_texts" in parsed).toBe(true);
    expect("task_spec" in parsed).toBe(true);

    // cited_acs must be the same as citedAcs in the result
    const citedAcs = parsed["cited_acs"] as string[];
    expect(citedAcs).toContain("AC-RD-001-01");
  });

  it("markdown bundle includes both AC and CS sections", () => {
    const result = cmdBriefContext({ taskId: "TASK-RD-001-001", repoRoot: tmpRepo });
    const output = renderBriefContext(result, false);

    expect(output).toContain("### Acceptance Criteria");
    expect(output).toContain("AC-RD-001-01");
    expect(output).toContain("### Code Standards");
    expect(output).toContain("CS-INFRA-004");
  });
});

// ─── Read-only invariant (AC-LOE-011-06) ──────────────────────────────────────
//
// DESIGN: Any read command run twice must NOT mutate any file and must NOT
// write any metrics record. This is the hard read-only invariant.
// We capture mtimes and content hashes before/after to verify no mutation.
// CS-GEN-003: invariant derived from AC-LOE-011-06 "Read commands never mutate."

describe("Read-only invariant — read commands never mutate (AC-LOE-011-06)", () => {
  let tmpRepo: string;

  beforeEach(() => {
    tmpRepo = makeReadTestRepo();
  });

  afterEach(() => {
    fs.rmSync(tmpRepo, { recursive: true, force: true });
  });

  /**
   * Capture a snapshot of all file mtimes in a directory (recursive).
   */
  function captureMtimes(dir: string): Map<string, number> {
    const result = new Map<string, number>();
    if (!fs.existsSync(dir)) return result;

    function walk(d: string): void {
      for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
        const full = path.join(d, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (entry.isFile()) {
          result.set(full, fs.statSync(full).mtimeMs);
        }
      }
    }
    walk(dir);
    return result;
  }

  /**
   * Capture the current metrics file line count (to detect any new writes).
   */
  function captureMetricsLineCount(metricsPath: string): number {
    if (!fs.existsSync(metricsPath)) return 0;
    return fs.readFileSync(metricsPath, "utf8").trim().split("\n").filter(Boolean).length;
  }

  it("cmdShow run twice: no file mutation, no metrics write", () => {
    const metricsPath = path.join(tmpRepo, ".claude", "metrics", "tasks.jsonl");
    const tasksDir = path.join(tmpRepo, ".implementation", "tasks");

    const mtimesBefore = captureMtimes(tasksDir);
    const metricsBefore = captureMetricsLineCount(metricsPath);

    // Run twice
    cmdShow({ taskId: "TASK-RD-001-001", repoRoot: tmpRepo });
    cmdShow({ taskId: "TASK-RD-001-001", repoRoot: tmpRepo });

    const mtimesAfter = captureMtimes(tasksDir);
    const metricsAfter = captureMetricsLineCount(metricsPath);

    // No file must have changed mtime
    for (const [filePath, mtimeBefore] of mtimesBefore) {
      expect(
        mtimesAfter.get(filePath),
        `File was mutated by read command: ${filePath}`
      ).toBe(mtimeBefore);
    }
    // No new metrics records
    expect(metricsAfter).toBe(metricsBefore);
  });

  it("cmdList run twice: no file mutation, no metrics write", () => {
    const metricsPath = path.join(tmpRepo, ".claude", "metrics", "tasks.jsonl");
    const tasksDir = path.join(tmpRepo, ".implementation", "tasks");

    const mtimesBefore = captureMtimes(tasksDir);
    const metricsBefore = captureMetricsLineCount(metricsPath);

    cmdList({ brief: "RD-001", repoRoot: tmpRepo });
    cmdList({ brief: "RD-001", statuses: ["backlog"], repoRoot: tmpRepo });

    const mtimesAfter = captureMtimes(tasksDir);
    const metricsAfter = captureMetricsLineCount(metricsPath);

    for (const [filePath, mtime] of mtimesBefore) {
      expect(mtimesAfter.get(filePath), `File mutated: ${filePath}`).toBe(mtime);
    }
    expect(metricsAfter).toBe(metricsBefore);
  });

  it("cmdNext + cmdSummary run twice: no file mutation, no metrics write", () => {
    const metricsPath = path.join(tmpRepo, ".claude", "metrics", "tasks.jsonl");
    const tasksDir = path.join(tmpRepo, ".implementation", "tasks");

    const mtimesBefore = captureMtimes(tasksDir);
    const metricsBefore = captureMetricsLineCount(metricsPath);

    cmdNext({ brief: "RD-001", repoRoot: tmpRepo });
    cmdNext({ brief: "RD-001", repoRoot: tmpRepo });
    cmdSummary({ brief: "RD-001", repoRoot: tmpRepo });
    cmdSummary({ brief: "RD-001", repoRoot: tmpRepo });

    const mtimesAfter = captureMtimes(tasksDir);
    const metricsAfter = captureMetricsLineCount(metricsPath);

    for (const [filePath, mtime] of mtimesBefore) {
      expect(mtimesAfter.get(filePath), `File mutated: ${filePath}`).toBe(mtime);
    }
    expect(metricsAfter).toBe(metricsBefore);
  });

  it("cmdProgress run twice: no file mutation, no metrics write", () => {
    const progressPath = path.join(tmpRepo, ".implementation", "tasks", "PROGRESS.md");
    // Write the PROGRESS fixture into the repo
    fs.copyFileSync(path.join(FIXTURES_SRC, "PROGRESS-fixture.md"), progressPath);

    const metricsPath = path.join(tmpRepo, ".claude", "metrics", "tasks.jsonl");
    const tasksDir = path.join(tmpRepo, ".implementation", "tasks");

    const mtimesBefore = captureMtimes(tasksDir);
    const metricsBefore = captureMetricsLineCount(metricsPath);

    cmdProgress({ progressPath });
    cmdProgress({ progressPath });

    const mtimesAfter = captureMtimes(tasksDir);
    const metricsAfter = captureMetricsLineCount(metricsPath);

    for (const [filePath, mtime] of mtimesBefore) {
      expect(mtimesAfter.get(filePath), `File mutated: ${filePath}`).toBe(mtime);
    }
    expect(metricsAfter).toBe(metricsBefore);
  });

  it("cmdBriefContext run twice: no file mutation, no metrics write (read-only invariant)", () => {
    // AC-LOE-011-06: "Read commands never mutate."
    // CS-GEN-003: invariant from PROPOSAL-scripted-bookkeeping.md §8.2 — cmdBriefContext
    // is the only read command not yet covered by the read-only invariant describe block.
    // Setup: brief fixture + CS files must be present in tmpRepo (reuse makeReadTestRepo structure)
    const briefsDir = path.join(tmpRepo, ".implementation", "briefs");
    fs.mkdirSync(briefsDir, { recursive: true });
    fs.copyFileSync(
      path.join(FIXTURES_SRC, "BRIEF-RD-001-read-projection-test.md"),
      path.join(briefsDir, "BRIEF-RD-001-read-projection-test.md")
    );
    const csDir = path.join(tmpRepo, ".code-standards", "standards", "infra");
    const csGenDir = path.join(tmpRepo, ".code-standards", "standards", "cross-cutting");
    fs.mkdirSync(csDir, { recursive: true });
    fs.mkdirSync(csGenDir, { recursive: true });
    fs.copyFileSync(
      path.join(REPO_ROOT, ".code-standards", "standards", "infra", "CS-INFRA-004-zero-dep-engine-scripts.md"),
      path.join(csDir, "CS-INFRA-004-zero-dep-engine-scripts.md")
    );
    fs.copyFileSync(
      path.join(REPO_ROOT, ".code-standards", "standards", "cross-cutting", "CS-GEN-003-cite-governing-key-in-comments.md"),
      path.join(csGenDir, "CS-GEN-003-cite-governing-key-in-comments.md")
    );

    const metricsPath = path.join(tmpRepo, ".claude", "metrics", "tasks.jsonl");
    const tasksDir = path.join(tmpRepo, ".implementation", "tasks");

    const mtimesBefore = captureMtimes(tasksDir);
    const metricsBefore = captureMetricsLineCount(metricsPath);

    cmdBriefContext({ taskId: "TASK-RD-001-001", repoRoot: tmpRepo });
    cmdBriefContext({ taskId: "TASK-RD-001-001", repoRoot: tmpRepo });

    const mtimesAfter = captureMtimes(tasksDir);
    const metricsAfter = captureMetricsLineCount(metricsPath);

    for (const [filePath, mtime] of mtimesBefore) {
      expect(mtimesAfter.get(filePath), `File mutated: ${filePath}`).toBe(mtime);
    }
    expect(metricsAfter).toBe(metricsBefore);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// AC-LOE-011-09: End-to-end CLI-driven slice integration test
//
// Design: PROPOSAL-scripted-bookkeeping.md §5 Phase 1 step 5
//   "Run a full slice through the new path; confirm validate-gates.sh still
//   passes and .claude/metrics/ still populates."
//
// BRIEF-LOE-011 Notes requirement: "assert with scripts/validate-gates.sh
// --fixture-dir <tree> (exit 0 / ALL CHECKS PASSED) over the mutated fixture
// tree." This is the INDEPENDENT gate — NOT the CLI's own `verify` (which
// would assert against its own output — the exact RETRO-LOE-010 trap).
//
// The fixture task (TASK-E2E-001-e2e-slice-fixture.md) is driven entirely
// through the CLI across developer and SDET roles:
//   1. start  (--role devops)     → backlog → in-progress
//   2. log    (--role devops)     → breadcrumb appended
//   3. review (--role devops)     → in-progress → review, complexity_actual set
//   4. done   (--role sdet)       → review → done, completed_at stamped
//   5. archive                    → task moves to tasks/done/
//
// Then the independent gate: validate-gates.sh --fixture-dir <tree>
// Then the metrics assertion: test-scoped metrics file populated with records
// for each write step (self-reported by the CLI, per AC-LOE-011-05).
//
// CS-GEN-003: cite governing proposal section / AC id in comments
// CS-INFRA-004: no new dependencies — only Node built-ins + sibling scripts
// ═══════════════════════════════════════════════════════════════════════════════

describe("AC-LOE-011-09: End-to-end CLI-driven slice verified by validate-gates.sh", () => {
  let fixtureTreeDir: string;
  let metricsPath: string;

  // AC-LOE-011-09: The fixture tree lives under a temp dir so it is fully
  // self-contained and does not touch the real tasks/ directory.
  // PROPOSAL-scripted-bookkeeping.md §5 Phase 1 step 5 — fixture approach.
  beforeEach(() => {
    fixtureTreeDir = fs.mkdtempSync(path.join(os.tmpdir(), "e2e-ac09-"));

    // Build the fixture tree structure:
    //   <fixtureTreeDir>/.implementation/tasks/          ← active tasks
    //   <fixtureTreeDir>/.implementation/tasks/done/     ← archived tasks
    const tasksDir = path.join(fixtureTreeDir, ".implementation", "tasks");
    const doneDir = path.join(tasksDir, "done");
    fs.mkdirSync(tasksDir, { recursive: true });
    fs.mkdirSync(doneDir, { recursive: true });

    // Copy the dedicated e2e slice fixture task into the tree
    fs.copyFileSync(
      path.join(FIXTURES_SRC, "TASK-E2E-001-e2e-slice-fixture.md"),
      path.join(tasksDir, "TASK-E2E-001-e2e-slice-fixture.md")
    );

    // Copy the e2e PROGRESS.md fixture (kept for reference; no longer read by validate-gates.sh
    // after TASK-LOE-012-003 re-pointed check 3/9 from PROGRESS.md to state.json).
    fs.copyFileSync(
      path.join(FIXTURES_SRC, "PROGRESS-e2e-fixture.md"),
      path.join(tasksDir, "PROGRESS.md")
    );

    // Write a well-formed state.json for check 3 (check_state_json_schema) +
    // check 9 (check_awaiting_merge_records). Required after TASK-LOE-012-003
    // re-pointed checks 3 & 9 from PROGRESS.md markdown to the state.json schema oracle.
    // CS-GEN-003: AC-LOE-012-07 / TASK-LOE-012-003
    const implDir = path.join(fixtureTreeDir, ".implementation");
    const wellFormedStateJson = JSON.stringify({
      schemaVersion: "1.0",
      lastUpdated: "2026-06-22T12:00:00.000Z",
      currentBrief: "BRIEF-LOE-011",
      currentPhase: "Dispatch",
      currentSliceDescription: "e2e fixture slice for task.test.ts (TASK-LOE-011)",
      currentBranch: "brief-LOE-011-task-cli",
      awaitingMerge: [],
      openRetroItems: [],
    }, null, 2) + "\n";
    fs.writeFileSync(path.join(implDir, "state.json"), wellFormedStateJson, "utf8");

    // Create a .changed_files manifest for check 4 (gated-path accountability).
    // We have no gated-path changes in the fixture tree, so the file is empty.
    // validate-gates.sh check 4 passes vacuously when changed_files is empty.
    // PROPOSAL-scripted-bookkeeping.md §5 Phase 1 step 5 / BRIEF-LOE-011 Notes.
    fs.writeFileSync(path.join(fixtureTreeDir, ".changed_files"), "", "utf8");

    // Test-scoped metrics path (never touches the real .claude/metrics/tasks.jsonl)
    // AC-LOE-011-05 / PROPOSAL-scripted-bookkeeping.md §4
    const metricsDir = fs.mkdtempSync(path.join(os.tmpdir(), "e2e-metrics-"));
    metricsPath = path.join(metricsDir, "tasks.jsonl");
  });

  afterEach(() => {
    fs.rmSync(fixtureTreeDir, { recursive: true, force: true });
    try {
      fs.unlinkSync(metricsPath);
      fs.rmdirSync(path.dirname(metricsPath));
    } catch { /* ignore if already gone */ }
  });

  it("drives start→log→review→done→archive; validate-gates.sh exits 0; metrics populated (AC-LOE-011-09)", () => {
    // ─── Step 1: start (developer role = devops) ──────────────────────────────
    // PROPOSAL-scripted-bookkeeping.md §3.1 — task start
    // AC-LOE-011-09: driven across developer and SDET roles
    const startResult = cmdStart({
      taskId: "TASK-E2E-001",
      role: "devops",
      complexityEstimate: 2,
      note: "AC-09 e2e slice start",
      repoRoot: fixtureTreeDir,
      metricsPath,
      nowFn: fixedNow("2026-06-21T14:00:00Z"),
    });

    expect(startResult.changed).toBe(true);
    const fmAfterStart = readFm(startResult.filePath);
    expect(fmAfterStart["status"]).toBe("in-progress");
    expect(fmAfterStart["started_at"]).toBe("2026-06-21T14:00:00Z");
    expect(fmAfterStart["complexity_estimate"]).toBe("2");
    expect(fmAfterStart["updated_by"]).toBe("devops");
    expect(readContent(startResult.filePath)).toContain("Starting implementation");

    // ─── Step 2: log (developer breadcrumb) ───────────────────────────────────
    // PROPOSAL-scripted-bookkeeping.md §3.1 — task log
    const logResult = cmdLog({
      taskId: "TASK-E2E-001",
      role: "devops",
      did: "implemented the feature slice",
      next: "run submission gate",
      blockers: "none",
      repoRoot: fixtureTreeDir,
      metricsPath,
    });

    expect(logResult.changed).toBe(true);
    expect(readContent(logResult.filePath)).toContain("[devops] implemented the feature slice");
    expect(readContent(logResult.filePath)).toContain("What's next: run submission gate");

    // ─── Step 3: review (developer submits for SDET) ──────────────────────────
    // PROPOSAL-scripted-bookkeeping.md §3.1 — task review
    // AC-LOE-011-03: transition legality (must be in-progress)
    const reviewResult = cmdReview({
      taskId: "TASK-E2E-001",
      role: "devops",
      complexityActual: 2,
      note: "all gates pass",
      repoRoot: fixtureTreeDir,
      metricsPath,
    });

    expect(reviewResult.changed).toBe(true);
    const fmAfterReview = readFm(reviewResult.filePath);
    expect(fmAfterReview["status"]).toBe("review");
    expect(fmAfterReview["complexity_actual"]).toBe("2");
    expect(readContent(reviewResult.filePath)).toContain("review");

    // ─── Step 4: done (SDET role) ─────────────────────────────────────────────
    // PROPOSAL-scripted-bookkeeping.md §3.1 — task done
    // AC-LOE-011-07: done requires complexity_actual; never invents it
    // AC-LOE-011-09: "across developer and SDET roles"
    const doneResult = cmdDone({
      taskId: "TASK-E2E-001",
      role: "sdet",
      note: "approved",
      repoRoot: fixtureTreeDir,
      metricsPath,
      nowFn: fixedNow("2026-06-21T16:00:00Z"),
    });

    expect(doneResult.changed).toBe(true);
    const fmAfterDone = readFm(doneResult.filePath);
    expect(fmAfterDone["status"]).toBe("done");
    expect(fmAfterDone["completed_at"]).toBe("2026-06-21T16:00:00Z");
    expect(fmAfterDone["updated_by"]).toBe("sdet");

    // Verify well-formed via task-frontmatter.ts (AC-LOE-011-01 / task-frontmatter oracle)
    const extracted = extractFrontMatter(readContent(doneResult.filePath));
    expect(extracted.found).toBe(true);
    if (!extracted.found) return; // discriminant guard — narrows to { found: true; fm: FrontMatter; ... }
    const violations = verifyFrontMatter(extracted.fm, doneResult.filePath);
    expect(violations).toHaveLength(0);

    // ─── Step 5: archive ──────────────────────────────────────────────────────
    // PROPOSAL-scripted-bookkeeping.md §3.1 — task archive (move done → tasks/done/)
    const archiveResult = cmdArchive({
      repoRoot: fixtureTreeDir,
    });

    expect(archiveResult.errors).toHaveLength(0);
    expect(archiveResult.moved).toContain("TASK-E2E-001-e2e-slice-fixture.md");

    // Task must now be in tasks/done/ (the fixture tree's done dir)
    const doneDir = path.join(fixtureTreeDir, ".implementation", "tasks", "done");
    const archivedPath = path.join(doneDir, "TASK-E2E-001-e2e-slice-fixture.md");
    expect(fs.existsSync(archivedPath)).toBe(true);

    // Must NOT still exist in active tasks/ (it was moved, not copied)
    const activeTasksDir = path.join(fixtureTreeDir, ".implementation", "tasks");
    expect(fs.existsSync(path.join(activeTasksDir, "TASK-E2E-001-e2e-slice-fixture.md"))).toBe(false);

    // ─── INDEPENDENT GATE: validate-gates.sh --fixture-dir ────────────────────
    //
    // AC-LOE-011-09: "assert with scripts/validate-gates.sh --fixture-dir <tree>
    // (exit 0 / ALL CHECKS PASSED) over the mutated fixture tree."
    //
    // This is the INDEPENDENT gate — not the CLI's own `verify`. The CLI's verify
    // would assert against its own output (the RETRO-LOE-010 trap). validate-gates.sh
    // is an independent bash script that knows nothing about task.ts internals.
    //
    // BRIEF-LOE-011 Notes: "the validation oracle must be independent of the
    // code under test."
    //
    // CS-GEN-003: cite governing authority — AC-LOE-011-09
    const validateGatesScript = path.join(REPO_ROOT, "scripts", "validate-gates.sh");
    const gatesResult = spawnSync(
      "bash",
      [validateGatesScript, "--fixture-dir", fixtureTreeDir],
      {
        encoding: "utf8",
        timeout: 30_000,
      }
    );

    // The gate must exit 0 and emit "ALL CHECKS PASSED"
    expect(
      gatesResult.status,
      `validate-gates.sh exited ${gatesResult.status} (expected 0).\n` +
      `stdout:\n${gatesResult.stdout ?? "(none)"}\n` +
      `stderr:\n${gatesResult.stderr ?? "(none)"}`
    ).toBe(0);

    expect(
      gatesResult.stdout ?? "",
      "validate-gates.sh stdout did not contain 'ALL CHECKS PASSED'"
    ).toContain("ALL CHECKS PASSED");

    // ─── METRICS ASSERTION ────────────────────────────────────────────────────
    //
    // AC-LOE-011-05 / AC-LOE-011-09: ".claude/metrics/ populated with the
    // self-reported records for each write in the slice."
    //
    // The CLI self-reports to metricsPath for every write command (start, log,
    // review, done). archive does not mutate task front matter and does not need
    // a metrics record (it is a file-move, not a field write).
    //
    // CS-GEN-003: PROPOSAL-scripted-bookkeeping.md §4 — self-report parity
    expect(
      fs.existsSync(metricsPath),
      "CLI did not create the metrics file — self-report not working"
    ).toBe(true);

    const metricsLines = fs.readFileSync(metricsPath, "utf8")
      .trim()
      .split("\n")
      .filter(Boolean);

    // 4 write steps: start, log, review, done → 4 metrics records
    expect(
      metricsLines.length,
      `Expected 4 metrics records (start+log+review+done), got ${metricsLines.length}`
    ).toBe(4);

    // Each record must be valid JSON with the expected keys (AC-LOE-011-05)
    const expectedKeys = [
      "ts", "task_id", "file_path", "status",
      "complexity_estimate", "complexity_actual",
      "started_at", "completed_at", "assigned_to",
    ];

    for (const [i, line] of metricsLines.entries()) {
      const record = JSON.parse(line) as Record<string, unknown>;

      // All 9 keys must be present
      expect(
        Object.keys(record).sort(),
        `Metrics record ${i + 1} missing keys`
      ).toEqual(expectedKeys.sort());

      // task_id must match the fixture task
      expect(record["task_id"]).toBe("TASK-E2E-001");

      // ts must be a valid ISO-8601 UTC timestamp
      const isoRe = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]00:00)$/;
      expect(String(record["ts"])).toMatch(isoRe);
    }

    // Status progression in the metrics records must match the lifecycle
    // Record 0: start → status should be "in-progress"
    // Record 1: log → status should be "in-progress" (log doesn't change status)
    // Record 2: review → status should be "review"
    // Record 3: done → status should be "done"
    const statuses = metricsLines.map((line) => {
      const r = JSON.parse(line) as Record<string, unknown>;
      return r["status"] as string;
    });
    expect(statuses[0]).toBe("in-progress");
    expect(statuses[1]).toBe("in-progress");
    expect(statuses[2]).toBe("review");
    expect(statuses[3]).toBe("done");
  });
});

// ─── State-store subcommands (BRIEF-LOE-012 / TASK-LOE-012-002) ──────────────
//
// Tests cover AC-LOE-012-02..06.
// CS-GEN-003: PROPOSAL-scripted-bookkeeping-phase2.md §8 judgment line.
// CS-INFRA-004: zero third-party deps — Node built-ins only.

/** Build a minimal temp repo with .implementation/ structure for state-store tests */
function makeTempStateRepo(): string {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "state-test-"));
  fs.mkdirSync(path.join(tmpDir, ".implementation", "tasks"), { recursive: true });
  return tmpDir;
}

/** Build a well-formed StateStore fixture for test repos */
function seedStateJson(repoRoot: string, overrides: Partial<{
  currentPhase: string | null;
  currentBrief: string | null;
  awaitingMerge: unknown[];
}> = {}): void {
  const state = {
    schemaVersion: "1.0",
    lastUpdated: "2026-06-22T12:00:00.000Z",
    currentBrief: overrides.currentBrief !== undefined ? overrides.currentBrief : "BRIEF-LOE-012",
    currentPhase: overrides.currentPhase !== undefined ? overrides.currentPhase : "Dispatch",
    currentSliceDescription: "test state",
    currentBranch: "brief-test",
    awaitingMerge: overrides.awaitingMerge ?? [],
    openRetroItems: [],
  };
  fs.writeFileSync(
    path.join(repoRoot, ".implementation", "state.json"),
    JSON.stringify(state, null, 2) + "\n",
    "utf8"
  );
}

/** Read state.json from a temp repo */
function readStateJson(repoRoot: string): Record<string, unknown> {
  const raw = fs.readFileSync(
    path.join(repoRoot, ".implementation", "state.json"),
    "utf8"
  );
  return JSON.parse(raw) as Record<string, unknown>;
}

/** Read events.jsonl from a temp repo (returns array of parsed events) */
function readEventsJsonl(repoRoot: string): Array<Record<string, unknown>> {
  const eventsPath = path.join(repoRoot, ".implementation", "events.jsonl");
  if (!fs.existsSync(eventsPath)) return [];
  return fs.readFileSync(eventsPath, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

// ─── phase-transition (AC-LOE-012-02) ────────────────────────────────────────

describe("cmdPhaseTransition — AC-LOE-012-02", () => {
  let tmpRepo: string;

  beforeEach(() => {
    tmpRepo = makeTempStateRepo();
  });

  afterEach(() => {
    fs.rmSync(tmpRepo, { recursive: true, force: true });
  });

  it("sets currentPhase + appends a phase-transition event atomically", () => {
    // AC-LOE-012-02: sets phase + appends event atomically
    seedStateJson(tmpRepo, { currentPhase: "Plan" });

    const result = cmdPhaseTransition({
      to: "Dispatch",
      role: "io",
      repoRoot: tmpRepo,
      nowFn: () => "2026-06-22T14:00:00.000Z",
    });

    expect(result.changed).toBe(true);

    const state = readStateJson(tmpRepo);
    expect(state["currentPhase"]).toBe("Dispatch");
    expect(state["lastUpdated"]).toBe("2026-06-22T14:00:00.000Z");

    const events = readEventsJsonl(tmpRepo);
    expect(events).toHaveLength(1);
    expect(events[0]!["type"]).toBe("phase-transition");
    expect(events[0]!["phase"]).toBe("Dispatch");
    expect(events[0]!["role"]).toBe("io");
  });

  it("rejects an unknown/illegal phase with non-zero exit", () => {
    // AC-LOE-012-02: rejects illegal phase
    seedStateJson(tmpRepo);

    expect(() =>
      cmdPhaseTransition({
        to: "NotAPhase",
        role: "devops",
        repoRoot: tmpRepo,
      })
    ).toThrow(TaskCliError);

    // Nothing was written
    const state = readStateJson(tmpRepo);
    expect(state["currentPhase"]).toBe("Dispatch"); // unchanged
    expect(readEventsJsonl(tmpRepo)).toHaveLength(0);
  });

  it("re-run to the same settled phase = clean no-op (exit 0)", () => {
    // AC-LOE-012-02: idempotency — settled re-run
    seedStateJson(tmpRepo, { currentPhase: "Dispatch" });

    const result = cmdPhaseTransition({
      to: "Dispatch",
      role: "io",
      repoRoot: tmpRepo,
    });

    expect(result.changed).toBe(false);
    expect(result.message).toContain("no-op");
    // No events appended
    expect(readEventsJsonl(tmpRepo)).toHaveLength(0);
  });

  it("--dry-run prints diff and writes nothing", () => {
    // AC-LOE-012-02: --dry-run
    seedStateJson(tmpRepo, { currentPhase: "Plan" });
    const stateBefore = readStateJson(tmpRepo);

    const result = cmdPhaseTransition({
      to: "Dispatch",
      role: "io",
      repoRoot: tmpRepo,
      dryRun: true,
    });

    expect(result.changed).toBe(false);
    // State unchanged
    const stateAfter = readStateJson(tmpRepo);
    expect(stateAfter["currentPhase"]).toBe(stateBefore["currentPhase"]);
    // No events appended
    expect(readEventsJsonl(tmpRepo)).toHaveLength(0);
  });

  it("rejects invalid role (roster validation)", () => {
    // AC-LOE-012-02: --role required + roster-validated
    seedStateJson(tmpRepo);
    expect(() =>
      cmdPhaseTransition({
        to: "Dispatch",
        role: "not-a-role" as "io",
        repoRoot: tmpRepo,
      })
    ).toThrow(TaskCliError);
  });
});

// ─── merge-checkpoint (AC-LOE-012-03) ────────────────────────────────────────

/**
 * Fake shim: PR URL + SHA come from the shim output, NOT from flags.
 * This is the prove-derive-from-source test.
 * AC-LOE-012-03 / CS-GEN-003: §11 derive-from-source precedent
 */
function makeFakeShims(prUrl: string, sha: string): MergeCheckpointShims {
  return {
    ghPrViewUrl: (_prNumber: number) => prUrl,
    gitRevParse: () => sha,
  };
}

describe("cmdMergeCheckpoint — AC-LOE-012-03", () => {
  let tmpRepo: string;
  const FAKE_URL = "https://github.com/test-org/tax-portal/pull/42";
  const FAKE_SHA = "abc1234def567890abc1234def567890abc12345";

  beforeEach(() => {
    tmpRepo = makeTempStateRepo();
    seedStateJson(tmpRepo);
  });

  afterEach(() => {
    fs.rmSync(tmpRepo, { recursive: true, force: true });
  });

  it("DERIVE-FROM-SOURCE: URL + SHA come from gh/git shim, not agent flags", () => {
    // AC-LOE-012-03 HARD gate: values come from the tool, not a transcribed flag
    const result = cmdMergeCheckpoint({
      pr: 42,
      role: "sdet",
      repoRoot: tmpRepo,
      nowFn: () => "2026-06-22T14:00:00.000Z",
      shims: makeFakeShims(FAKE_URL, FAKE_SHA),
    });

    expect(result.changed).toBe(true);

    const state = readStateJson(tmpRepo);
    const awaitingMerge = state["awaitingMerge"] as Array<Record<string, unknown>>;
    expect(awaitingMerge).toHaveLength(1);

    // Derived from shim, NOT from any flag the agent supplied
    expect(awaitingMerge[0]!["prUrl"]).toBe(FAKE_URL);
    expect(awaitingMerge[0]!["squashSha"]).toBe(FAKE_SHA);
    expect(awaitingMerge[0]!["pr"]).toBe(42);
  });

  it("gate verdicts are recorded verbatim from agent input (judgment line)", () => {
    // AC-LOE-012-03: gate verdicts recorded verbatim — CLI RECORDS, NEVER DECIDES
    // CS-GEN-003: §8 judgment line
    // DECISION: the CLI stores what the agent says; it never computes or validates the verdict content
    const result = cmdMergeCheckpoint({
      pr: 42,
      role: "sdet",
      repoRoot: tmpRepo,
      shims: makeFakeShims(FAKE_URL, FAKE_SHA),
      gateVerdicts: {
        containerSmoke: "PASS — smoke suite green",
        sdetValidation: "PASS — all AC verified",
        sdetCiGate: "PASS — CI green",
        sdetQualityAudit: "PASS — no violations",
      },
    });

    expect(result.changed).toBe(true);
    const awaitingMerge = (readStateJson(tmpRepo)["awaitingMerge"] as Array<Record<string, unknown>>);
    const verdicts = awaitingMerge[0]!["gateVerdicts"] as Record<string, unknown>;
    expect(verdicts["containerSmoke"]).toBe("PASS — smoke suite green");
    expect(verdicts["sdetValidation"]).toBe("PASS — all AC verified");
    expect(verdicts["sdetCiGate"]).toBe("PASS — CI green");
    expect(verdicts["sdetQualityAudit"]).toBe("PASS — no violations");
  });

  it("idempotent: re-run for same PR = clean no-op", () => {
    // AC-LOE-012-03: idempotency
    const shims = makeFakeShims(FAKE_URL, FAKE_SHA);
    cmdMergeCheckpoint({ pr: 42, role: "sdet", repoRoot: tmpRepo, shims });
    const result2 = cmdMergeCheckpoint({ pr: 42, role: "sdet", repoRoot: tmpRepo, shims });

    expect(result2.changed).toBe(false);
    expect(result2.message).toContain("no-op");
    // Still only one record
    const state = readStateJson(tmpRepo);
    expect((state["awaitingMerge"] as unknown[]).length).toBe(1);
  });

  it("--dry-run prints diff and writes nothing", () => {
    // AC-LOE-012-03: --dry-run
    const stateBefore = readStateJson(tmpRepo);

    cmdMergeCheckpoint({
      pr: 42,
      role: "sdet",
      repoRoot: tmpRepo,
      dryRun: true,
      shims: makeFakeShims(FAKE_URL, FAKE_SHA),
    });

    const stateAfter = readStateJson(tmpRepo);
    expect(stateAfter["awaitingMerge"]).toEqual(stateBefore["awaitingMerge"]);
    expect(readEventsJsonl(tmpRepo)).toHaveLength(0);
  });

  it("rejects invalid role (roster validation)", () => {
    expect(() =>
      cmdMergeCheckpoint({
        pr: 42,
        role: "bogus" as "io",
        repoRoot: tmpRepo,
        shims: makeFakeShims(FAKE_URL, FAKE_SHA),
      })
    ).toThrow(TaskCliError);
  });

  it("rejects non-integer PR number", () => {
    expect(() =>
      cmdMergeCheckpoint({
        pr: -1,
        role: "devops",
        repoRoot: tmpRepo,
        shims: makeFakeShims(FAKE_URL, FAKE_SHA),
      })
    ).toThrow(TaskCliError);
  });
});

// ─── post-merge (AC-LOE-012-04) ───────────────────────────────────────────────

describe("cmdPostMerge — AC-LOE-012-04", () => {
  let tmpRepo: string;
  const FAKE_URL = "https://github.com/test-org/tax-portal/pull/55";
  const FAKE_SHA = "deadbeef123456789012345678901234deadbeef";

  beforeEach(() => {
    tmpRepo = makeTempStateRepo();
    seedStateJson(tmpRepo);
    // Seed an awaiting-merge record for PR 55
    const state = readStateJson(tmpRepo) as {
      schemaVersion: string;
      lastUpdated: string;
      currentBrief: string | null;
      currentPhase: string | null;
      currentSliceDescription: string | null;
      currentBranch: string | null;
      awaitingMerge: Array<Record<string, unknown>>;
      openRetroItems: unknown[];
    };
    state.awaitingMerge = [{
      pr: 55,
      prUrl: FAKE_URL,
      squashSha: FAKE_SHA,
      createdAt: "2026-06-22T12:00:00.000Z",
      gateVerdicts: {
        containerSmoke: "PASS",
        sdetValidation: "PASS",
        sdetCiGate: "PASS",
        sdetQualityAudit: "PASS",
      },
      note: null,
    }];
    fs.writeFileSync(
      path.join(tmpRepo, ".implementation", "state.json"),
      JSON.stringify(state, null, 2) + "\n",
      "utf8"
    );
  });

  afterEach(() => {
    fs.rmSync(tmpRepo, { recursive: true, force: true });
  });

  it("PASS branch: clears the awaiting-merge record", () => {
    // AC-LOE-012-04: pass branch clears the record
    // DECISION: agent decides to pass; CLI records it and clears the record
    // CS-GEN-003: §8 judgment line
    const result = cmdPostMerge({
      pr: 55,
      role: "sdet",
      repoRoot: tmpRepo,
      nowFn: () => "2026-06-22T15:00:00.000Z",
    });

    expect(result.changed).toBe(true);
    expect(result.message).toContain("PASS");

    const state = readStateJson(tmpRepo);
    expect((state["awaitingMerge"] as unknown[]).length).toBe(0);

    const events = readEventsJsonl(tmpRepo);
    expect(events).toHaveLength(1);
    expect(events[0]!["type"]).toBe("post-merge");
    expect((events[0]!["payload"] as Record<string, unknown>)["result"]).toBe("pass");
  });

  it("FAIL branch: scaffolds BUG file via task-frontmatter.ts AND keeps the record", () => {
    // AC-LOE-012-04: fail branch scaffolds BUG AND keeps record
    // DECISION: agent decides to fail + supplies description; CLI records and scaffolds
    // CS-GEN-003: §8 judgment line; bug scaffold THROUGH task-frontmatter.ts, not re-impl
    const result = cmdPostMerge({
      pr: 55,
      role: "devops",
      bug: "Post-merge flake: DB connection dropped after deploy",
      repoRoot: tmpRepo,
      nowFn: () => "2026-06-22T15:00:00.000Z",
    });

    expect(result.changed).toBe(true);
    expect(result.message).toContain("FAIL");
    expect(result.bugFilePath).toBeDefined();

    // BUG file must exist and be valid YAML front matter
    const bugContent = fs.readFileSync(result.bugFilePath!, "utf8");
    const extracted = extractFrontMatter(bugContent);
    expect(extracted.found).toBe(true);
    if (!extracted.found) return; // discriminant guard — narrows to { found: true; fm: FrontMatter; ... }
    expect(extracted.fm["status"]).toBe("open");
    expect(extracted.fm["category"]).toBe("post-merge-regression");

    // BUG description present in body
    expect(bugContent).toContain("Post-merge flake");

    // The awaiting-merge record must STILL be there (fail = keep)
    const state = readStateJson(tmpRepo);
    expect((state["awaitingMerge"] as unknown[]).length).toBe(1);

    // Event appended with fail payload
    const events = readEventsJsonl(tmpRepo);
    expect(events).toHaveLength(1);
    expect((events[0]!["payload"] as Record<string, unknown>)["result"]).toBe("fail");
    expect((events[0]!["payload"] as Record<string, unknown>)["recordKept"]).toBe(true);
  });

  it("--dry-run PASS: prints diff, writes nothing", () => {
    // AC-LOE-012-04: --dry-run on pass
    const stateBefore = readStateJson(tmpRepo);

    const result = cmdPostMerge({
      pr: 55,
      role: "sdet",
      repoRoot: tmpRepo,
      dryRun: true,
    });

    expect(result.changed).toBe(false);
    const stateAfter = readStateJson(tmpRepo);
    expect(stateAfter["awaitingMerge"]).toEqual(stateBefore["awaitingMerge"]);
    expect(readEventsJsonl(tmpRepo)).toHaveLength(0);
  });

  it("--dry-run FAIL: prints diff, writes nothing (no BUG file)", () => {
    // AC-LOE-012-04: --dry-run on fail
    const result = cmdPostMerge({
      pr: 55,
      role: "devops",
      bug: "Connection pool exhausted",
      repoRoot: tmpRepo,
      dryRun: true,
    });

    expect(result.changed).toBe(false);
    // BUG file must NOT have been created
    if (result.bugFilePath) {
      expect(fs.existsSync(result.bugFilePath)).toBe(false);
    }
    expect(readEventsJsonl(tmpRepo)).toHaveLength(0);
  });

  it("errors when no awaiting-merge record found for the PR", () => {
    // AC-LOE-012-04: guards missing record
    expect(() =>
      cmdPostMerge({
        pr: 999,
        role: "sdet",
        repoRoot: tmpRepo,
      })
    ).toThrow(TaskCliError);
  });

  it("rejects invalid role", () => {
    expect(() =>
      cmdPostMerge({
        pr: 55,
        role: "bogus" as "io",
        repoRoot: tmpRepo,
      })
    ).toThrow(TaskCliError);
  });
});

// ─── trace (AC-LOE-012-05) ────────────────────────────────────────────────────

describe("cmdTrace — AC-LOE-012-05", () => {
  const TRACE_FIXTURES_DIR = path.join(
    path.dirname(new URL(import.meta.url).pathname),
    "__test_fixtures__",
    "trace"
  );

  it("tallies @AC-* tags into a per-AC tier map (unit vs e2e)", () => {
    // AC-LOE-012-05: builds tier map from @AC-* tags in test files
    const result = cmdTrace({
      brief: "LOE-012",
      scanRoots: [TRACE_FIXTURES_DIR],
    });

    // unit-file.test.ts has @AC-LOE-012-02 (×2), @AC-LOE-012-03, @AC-LOE-012-05
    // e2e/e2e-file.spec.ts has @AC-LOE-012-02, @AC-LOE-012-06
    expect(result.brief).toBe("LOE-012");
    expect(result.filesScanned).toBeGreaterThan(0);
    expect(result.totalTags).toBeGreaterThan(0);

    // AC-LOE-012-02 should appear in both unit and e2e buckets
    expect(result.acMap["AC-LOE-012-02"]).toBeDefined();
    expect(result.acMap["AC-LOE-012-02"]!.unit.length).toBeGreaterThan(0);
    expect(result.acMap["AC-LOE-012-02"]!.e2e.length).toBeGreaterThan(0);

    // AC-LOE-012-06 should appear in e2e bucket only
    expect(result.acMap["AC-LOE-012-06"]).toBeDefined();
    expect(result.acMap["AC-LOE-012-06"]!.e2e.length).toBeGreaterThan(0);
  });

  it("does NOT compute an adequacy verdict (judgment line)", () => {
    // AC-LOE-012-05 HARD gate: judgment line — trace BUILDS the table, NEVER decides adequacy
    // CS-GEN-003: §8 judgment line
    // DECISION: the CLI tallies; the agent decides. The result has no 'adequate', 'pass', or 'fail' fields.
    const result = cmdTrace({
      brief: "LOE-012",
      scanRoots: [TRACE_FIXTURES_DIR],
    });

    // The result must NOT carry any verdict field
    const resultKeys = Object.keys(result);
    expect(resultKeys).not.toContain("adequate");
    expect(resultKeys).not.toContain("verdict");
    expect(resultKeys).not.toContain("pass");
    expect(resultKeys).not.toContain("fail");
    expect(resultKeys).not.toContain("sufficient");
  });

  it("renderTrace compact text contains tier table with NOTE line (no adequacy verdict in output)", () => {
    // AC-LOE-012-05: rendered output must include the NOTE that adequacy is agent-supplied
    const result = cmdTrace({
      brief: "LOE-012",
      scanRoots: [TRACE_FIXTURES_DIR],
    });
    const output = renderTrace(result, false);
    expect(output).toContain("NOTE: adequacy verdict stays agent-supplied");
  });

  it("renderTrace --json produces structured ac_map", () => {
    // AC-LOE-012-05: --json output is structured
    const result = cmdTrace({
      brief: "LOE-012",
      scanRoots: [TRACE_FIXTURES_DIR],
    });
    const json = JSON.parse(renderTrace(result, true)) as Record<string, unknown>;
    expect(json["ac_map"]).toBeDefined();
    expect(typeof json["files_scanned"]).toBe("number");
  });

  it("returns empty acMap when no @AC-* tags match the brief", () => {
    // AC-LOE-012-05: brief filter works
    const result = cmdTrace({
      brief: "NOMATCH-999",
      scanRoots: [TRACE_FIXTURES_DIR],
    });
    expect(result.acMap).toEqual({});
    expect(result.totalTags).toBe(0);
  });
});

// ─── report (AC-LOE-012-06) ───────────────────────────────────────────────────

describe("cmdReport — AC-LOE-012-06", () => {
  let tmpRepo: string;

  beforeEach(() => {
    tmpRepo = makeTempStateRepo();
    seedStateJson(tmpRepo);
  });

  afterEach(() => {
    fs.rmSync(tmpRepo, { recursive: true, force: true });
  });

  it("renders state as compact text — writes NOTHING to the repo", () => {
    // AC-LOE-012-06: report renders on demand; output never committed, never read back as truth
    // DECISION: cmdReport is strictly read-only — no fs.writeFile, no rename, no metrics.
    // CS-GEN-003: §9 generated view is never a source of truth
    const implDir = path.join(tmpRepo, ".implementation");
    const filesBefore = fs.readdirSync(implDir).sort();

    const output = cmdReport({ repoRoot: tmpRepo });

    const filesAfter = fs.readdirSync(implDir).sort();
    // No new files written
    expect(filesAfter).toEqual(filesBefore);

    // Output is human-readable narrative
    expect(output).toContain("BRIEF-LOE-012");
    expect(output).not.toHaveLength(0);
  });

  it("renders state as markdown with --md flag — writes NOTHING to the repo", () => {
    // AC-LOE-012-06: --md renders markdown; still writes nothing
    const implDir = path.join(tmpRepo, ".implementation");
    const filesBefore = fs.readdirSync(implDir).sort();

    const output = cmdReport({ repoRoot: tmpRepo, md: true });

    const filesAfter = fs.readdirSync(implDir).sort();
    expect(filesAfter).toEqual(filesBefore);

    // Markdown headers present
    expect(output).toContain("## Current initiative");
    expect(output).toContain("## Awaiting PR merge");
    expect(output).toContain("BRIEF-LOE-012");
  });

  it("report includes events when events.jsonl exists", () => {
    // AC-LOE-012-06: reads events.jsonl
    const eventsPath = path.join(tmpRepo, ".implementation", "events.jsonl");
    const event = JSON.stringify({
      ts: "2026-06-22T12:00:00.000Z",
      type: "phase-transition",
      brief: "BRIEF-LOE-012",
      phase: "Dispatch",
      role: "io",
      pr: null,
      note: "test event",
      payload: null,
    });
    fs.writeFileSync(eventsPath, event + "\n", "utf8");

    const output = cmdReport({ repoRoot: tmpRepo });
    // Events section should mention the event
    expect(output).toContain("phase-transition");
  });

  it("returns placeholder when no state.json exists", () => {
    // AC-LOE-012-06: graceful no-state placeholder
    const emptyRepo = makeTempStateRepo();
    const output = cmdReport({ repoRoot: emptyRepo });
    expect(output).toContain("no state.json");
    fs.rmSync(emptyRepo, { recursive: true, force: true });
  });
});
