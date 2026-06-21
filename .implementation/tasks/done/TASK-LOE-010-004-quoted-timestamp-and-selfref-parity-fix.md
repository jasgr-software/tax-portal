---
brief: BRIEF-LOE-010
epic: chore/lights-out-enablement
status: done
assigned_to: devops
updated_by: sdet
depends_on: TASK-LOE-010-002
impl: developer
e2e_required: no
started_at: 2026-06-21T19:17:47Z
completed_at: 2026-06-21T21:45:00Z
complexity_estimate: 2
complexity_actual: 2
introduces_gate: no
acceptance_criteria: [AC-LOE-010-04, AC-LOE-010-05]
upstream_refs: none (fix-forward task created at IO Review/Smoke design scan)
code_standards: none (brief `code_standards: []`)
---

# TASK-LOE-010-004: fix backstop quoted-timestamp false-reject + self-referential metrics-parity test

---

## Why this task exists (fix-forward — IO Review/Smoke design scan)

The IO design scan re-ran the two backstop gates over the integrated tree and surfaced **two defects** that
the per-task SDET review did not catch (the SDET ran the suite mid-review, *before* its own atomic close edit
populated `completed_at` on -002, and the quoted-timestamp form lives only on -003 which was reviewed in the
same batch). Both are real, both red the backstops, both are in gated `scripts/`. Per `PHASES.md` Review, the
IO **fixes forward** with a dispatched fix task (no revert of completed tasks). Batched into one task per the
engine's "batch similar fixes" rule.

**Neither defect changes any contract semantics.** This is a correctness fix to the gate-reader's tolerance and
to a test fixture's stability — both squarely inside AC-LOE-010-04 (identical verdicts / no false reject) and
AC-LOE-010-05 (metrics parity).

### Defect A — `validate-gates.sh` check 1 false-rejects the quoted-timestamp scalar form

`_check_done_metadata_fm()` matches `started_at`/`completed_at` with `grep -qE "^started_at: [0-9]{4}-..."`,
which does **not** tolerate the quoted form `started_at: "2026-06-21T18:52:52Z"`. The -001 migration legitimately
emits quoted scalars for some values (the bash check **already** tolerates quoted `complexity_*` via
`"?[1-5]"?`, and the TS `verifyFrontMatter()` schema accepts quoted timestamps) — so the gate must give the
**identical verdict** on the quoted form. Today `bash scripts/validate-gates.sh` exits **1** with
`TASK-LOE-010-003-...: started_at missing or not ISO 8601` because -003 carries a quoted `started_at`. This is
an AC-LOE-010-04 violation: a well-formed migrated file is false-rejected by the backstop.

**Reproduce:**
```
bash scripts/validate-gates.sh   # exit 1; FAIL check_task_file_completion on TASK-LOE-010-003 started_at
```

### Defect B — self-referential metrics-parity test pins to a live, now-`done` task

`scripts/validate-gates.test.ts` (the "metrics hook parity — front-matter field extraction (AC-LOE-010-05)"
describe block) uses **TASK-LOE-010-002 itself** as the parity fixture, with the comment "it is in-progress at
test time, so we know the expected values." That assumption is now false: the SDET's correct atomic close edit
flipped -002 to `status: done` and wrote `completed_at: 2026-06-21T21:15:00Z`. The test
`extracts completed_at as dash sentinel (not yet completed)` now fails (`expected false to be true`), and the
sibling assertions (`status` = in-progress, `complexity_estimate` = "3", `completed_at` empty) are equally
brittle — they pin to a live, mutating lifecycle file. A parity test must read a **stable, dedicated fixture**.

**Reproduce:**
```
npx vitest run scripts/validate-gates.test.ts   # 1 failed | 26 passed; the dash-sentinel assertion reds
```

## Quality Gates

- [x] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [x] **Submission gate** — `pnpm lint` + `pnpm type-check` + `pnpm build` + `pnpm test`; AND
  `bash scripts/validate-gates.sh` exits 0 (ALL CHECKS PASSED) over the real migrated tree; AND the full
  `scripts/` vitest suite green (the previously-failing parity test now green on a stable fixture).
- [N/A] **Targeted e2e** — N/A (script + test, no UI)
- [x] **Security review** — preserve `set -euo pipefail` + quoted-expansion discipline; no new shell-out;
  the regex broadening must not widen the blast radius beyond "tolerate an optional surrounding double-quote".
- [x] **SDET Review** — approved

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `scripts/validate-gates.sh` | modify | `_check_done_metadata_fm()`: broaden the `started_at`/`completed_at` (and any sibling ISO-8601) grep to tolerate an **optional surrounding double-quote** — e.g. `^started_at: "?[0-9]{4}-[0-9]{2}-[0-9]{2}T`. Mirror exactly the quoted-tolerance pattern already used for `complexity_*` (`"?[1-5]"?`). Do not relax the ISO-8601 shape itself; only allow the optional quote. |
| `scripts/validate-gates.test.ts` | modify | Replace the **self-referential** parity fixture (TASK-LOE-010-002 itself) with a **dedicated, stable in-tree fixture** representing an in-progress task (empty/dash `completed_at`), so the parity assertions no longer depend on a live mutating task's lifecycle. Keep the AC-LOE-010-05 coverage intent (status, complexity_estimate, started_at present; completed_at empty-sentinel; record-shape field-name alignment). Add/point at a fixture under `scripts/__test_fixtures__/` rather than a live `tasks/` file. |
| `scripts/__test_fixtures__/frontmatter/**` (or `__test_fixtures__/validate-gates/**`) | create (if needed) | A small stable in-progress fixture file for the parity test (quoted **and** unquoted timestamp coverage is a plus — directly exercises Defect A's tolerance from the TS side too). |

## Tests to Write First

- [ ] A `validate-gates.sh` (or fixture-suite) assertion that a `done` task with a **quoted** `started_at`/
      `completed_at` PASSES check 1 (the Defect-A counterfactual — would have caught -003's false-reject).
- [ ] The migrated/real tree drives `bash scripts/validate-gates.sh` to **exit 0** (capture to a log; grep
      `ALL CHECKS PASSED`).
- [ ] The metrics-parity test reads the **dedicated fixture** (not a live task) and asserts the in-progress
      record shape — green and stable regardless of any real task's lifecycle.

## Definition of Done

- [ ] Defect A fixed: `bash scripts/validate-gates.sh` exits 0 over the real migrated tree; quoted-timestamp
      tasks pass check 1; the broadened regex still rejects a non-ISO / missing value (no over-broadening).
- [ ] Defect B fixed: the parity test uses a stable dedicated fixture; full `scripts/` vitest suite green.
- [ ] No contract semantics changed; PROGRESS.md format untouched; no scope creep beyond `scripts/`
      (+ a fixture file).
- [ ] AC-LOE-010-04 + AC-LOE-010-05 still satisfied (now without the false-reject and the brittle test).

---

## Work Log

<!-- Format: - YYYY-MM-DD [role] What was done | What's next | Blockers -->
- 2026-06-21 [devops] Starting implementation — fix Defect A (quoted-timestamp grep tolerance in validate-gates.sh) + Defect B (self-referential parity test fixture replacement). Complexity estimate 2. | What's next: (1) broaden started_at/completed_at grep patterns in _check_done_metadata_fm; (2) create stable in-progress fixture under scripts/__test_fixtures__/; (3) update Suite 4 in validate-gates.test.ts to point at fixture; (4) run submission gate | Blockers: none
- 2026-06-21 [devops] Implementation complete — marking as review. Gate evidence below. | What's next: SDET review | Blockers: none
- 2026-06-21 [sdet] SDET review complete — approved. validate-gates.sh exit 0 / ALL CHECKS PASSED (SDET-run, /tmp/validate-gates-loe010-004-sdet.log); 75/75 scripts/ vitest tests green; Defect A counterfactual confirmed (done-quoted-timestamps PASS, done-bad-timestamp FAIL); Suite 4 decoupled from live task, reads TASK-TEST-INPROGRESS-001-parity-fixture.md. | What's next: IO close-prep | Blockers: none

  **Defect A fix** (`scripts/validate-gates.sh` `_check_done_metadata_fm()`):
  - Broadened `started_at`/`completed_at` grep from `^started_at: [0-9]{4}-` to `^started_at: "?[0-9]{4}-[0-9]{2}-[0-9]{2}T` (optional leading double-quote, same pattern as `complexity_*` fields).
  - `set -euo pipefail` preserved; no new shell-out introduced; no regex blast-radius widening.

  **Defect B fix** (`scripts/validate-gates.test.ts` Suite 4 + fixture):
  - Created stable fixture: `scripts/__test_fixtures__/frontmatter/TASK-TEST-INPROGRESS-001-parity-fixture.md` (in-progress, quoted started_at, empty completed_at, complexity_estimate "3", assigned_to devops).
  - Suite 4 now reads the stable fixture — assertions are fully decoupled from any live task file lifecycle.
  - Fixture uses quoted started_at ("2026-06-21T18:52:52Z") — exercises TS `extractFrontMatter` tolerance for quoted ISO 8601 scalars from the TS side too.

  **New fixtures added to Suite 1**:
  - `done-quoted-timestamps` fixture: done task with all timestamps quoted → check_task_file_completion PASSES (Defect A counterfactual).
  - `done-bad-timestamp` fixture: done task with quoted non-ISO strings → check_task_file_completion FAILS (no-over-broadening proof).

  **Gate evidence:**

  `pnpm lint` — PASS (0 warnings, 0 errors)
  `pnpm type-check` — PASS (0 errors)
  `pnpm build` — PASS (portal + admin both compiled successfully)
  `pnpm test` — PASS: 3 test files, 75 tests, 0 failures

  `bash scripts/validate-gates.sh` output:
  ```
  validate-gates.sh — tax-portal gate validation backstop
  =========================================================
    Mode: real repo (/home/ccox/repos/tax-portal)

  Results:
    check_task_file_completion                           PASS
    check_bug_files_present_for_done                     PASS
    check_progress_md_structure                          PASS
    check_gated_path_accountability                      PASS
    check_work_log_content                               PASS
    check_playwright_artifacts                           PASS
    check_ci_evidence                                    PASS
    check_pr_body_quad_review                            SKIP  (--pr-body not supplied)
    check_pr_awaiting_merge_gate_verdicts (no PR entries to check) PASS

    Summary: ALL CHECKS PASSED (0 failures)
  ```
  Exit code: 0

## Attempt Log

**Attempt count**: 0

## SDET Review

**Decision**: approved

**Notes**: Both defects verified resolved. Defect A: `_check_done_metadata_fm()` now uses `^started_at: "?[0-9]{4}-[0-9]{2}-[0-9]{2}T` and `^completed_at: "?[0-9]{4}-[0-9]{2}-[0-9]{2}T` — the optional-quote broadening exactly mirrors the `complexity_*` `"?[1-5]"?` pattern. The ISO-8601 prefix anchor is preserved; the broadening does not over-accept. SDET-run `bash scripts/validate-gates.sh` exited 0 / ALL CHECKS PASSED including `check_task_file_completion PASS`. Defect-A counterfactual: `done-quoted-timestamps` fixture exits 0 (PASS); `done-bad-timestamp` fixture exits 1 (FAIL) — confirming no over-broadening. Defect B: Suite 4 reads `scripts/__test_fixtures__/frontmatter/TASK-TEST-INPROGRESS-001-parity-fixture.md` exclusively — no live `tasks/` file pinned anywhere in active assertions. AC-LOE-010-05 coverage intent intact: status, complexity_estimate, started_at, completed_at empty-sentinel, and record-shape field-name alignment all asserted. Full scripts/ vitest suite: 75/75 passed, 0 failed (3 files). One advisory note: the Gate Authoring comment at line 111 of validate-gates.sh still describes the old unquoted pattern (`^started_at: [0-9]{4}-...`), which is now stale documentation. `introduces_gate: no` so this is not a rejection criterion; flagging for the IO as a follow-up advisory comment update.
