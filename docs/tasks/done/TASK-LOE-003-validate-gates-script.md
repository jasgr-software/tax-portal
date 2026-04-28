# TASK-LOE-003: scripts/validate-gates.sh + pre-push hook

**Epic**: chore/lights-out-enablement
**Status**: done
**Assigned to**: devops
**Updated-by**: devops
**Depends on**: none (independent of TASK-LOE-001 — the script is the backstop, not a CI consumer)
**E2e-required**: no
**Started-at**: 2026-04-26T12:00:00Z
**Completed-at**: 2026-04-27T09:15:00Z
**Complexity-estimate**: 3
**Complexity-actual**: 3
**Affected flows:** none (justification: chore touches CI/git infrastructure, not user-facing behavior)
**Affected requirements:** none (justification: chore touches workflow infrastructure, not SRS requirements)
**Introduces-gate:** yes
**Relevant ADRs:** none

---

## Quality Gates

- [x] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [x] **Submission gate** — `pnpm lint` N/A (no package.json yet — pre-scaffold state, same as TASK-LOE-001); script self-test via `bash scripts/validate-gates.sh` passes green against real repo; all 7 fixture tests pass
- [N/A] **Targeted e2e** — N/A (script + git hook, no UI)
- [x] **Security review** — PASS: no `eval`, no `curl | sh`; no unsanitized variable expansion (all variables quoted or via grep -F fixed-string); pre-push hook only invokes validate-gates.sh and prints exit messages — no task content read or transmitted
- [x] **SDET Review** — approved

## SDET Review focus areas

- **Gate Authoring Rules evidence** is mandatory because `Introduces-gate: yes`. The pre-push hook addition is explicitly enumerated in `.claude/agent-stack.md` § Gate Authoring Rules § Scope. Work Log must contain:
  1. **Run URL or local-CI log path + line marker** — for the pre-push case, demonstrate the script catching a real violation. Create a deliberately-broken test fixture (e.g., a fake task file with empty `Complexity-actual` flipped to `done`), run the script, capture the rejection. Then fix the fixture, re-run, capture the green. This is the In-flight regression exception's red-then-green pattern (`.claude/agent-stack.md` § Gate Authoring Rules § Exceptions).
  2. **Named code path** — name the specific check in `validate-gates.sh` that produces the rejection (e.g., `validate-gates.sh:check_completed_metadata()` line N).
  3. **Counterfactual** — name one concrete change to the named function that would let a real violation slip past (e.g., "if `check_completed_metadata` were changed from `grep -q 'Complexity-actual: [1-5]'` to `grep -q 'Complexity-actual:'`, an unfilled `Complexity-actual: —` would pass — that's what the regex specificity is guarding against").
- Verify the script is **idempotent** — running it twice with no changes produces no diff to repo state.
- Verify the script **fails closed** — exits non-zero on any check failure, exits zero only on full pass. No "warning, but allow" branches.
- Verify the pre-push hook is **bypassable only via `--no-verify`** (which is already off-limits per `.claude/agent-stack.md` § Autonomy Ceiling item 2). The hook itself must not parse `--no-verify` or otherwise allow bypass.
- Verify the PR-body quad-review-verdict check correctly identifies "workflow-file PRs" — branch detection by reading the diff's path list, not by branch-name convention.

## Context

`.claude/agent-stack.md` § Programmatic Gate Validation already references `scripts/validate-gates.sh` as the independent backstop:

> `scripts/validate-gates.sh` is the independent backstop that catches what agent discipline might miss. It verifies: task file gate completion, BUG file existence, PROGRESS.md structure, gated-path accountability, Work Log content, Playwright test artifacts, and CI run evidence. Run it before pushing or as a CI check.

The script does not yet exist — this task creates it. It is also predicate (c) for the Autonomy Ceiling item-3 graduation: PR-merge auto-on-green requires the backstop exists.

The PR-body quad-review-verdict check is a project-specific addition: workflow-file PRs (anything touching `.claude/agent-stack.md` or `agents/*.md`) require `[sa]`, `[ra]`, `[sdet]`, `[overwatch]` verdict markers per `.claude/agent-stack.md` § Main Session Rules (quad review). The script greps the PR description for those markers and rejects if any are missing on a workflow-file PR.

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `scripts/validate-gates.sh` | Create | devops |
| `scripts/hooks/pre-push` | Create | devops |
| `scripts/hooks/install.sh` | Create (or extend if exists) | devops |
| `package.json` | Add `scripts.gates:validate` running `bash scripts/validate-gates.sh` | devops |

## Tests to Write First

- [ ] **Fixture: clean repo state** — script exits 0 with no output beyond a summary.
- [ ] **Fixture: task file with `Status: done` but empty `Complexity-actual`** — script exits non-zero, names the offending file in the output.
- [ ] **Fixture: task file with `Status: done` but no Work Log entries** — script exits non-zero.
- [ ] **Fixture: PROGRESS.md missing the `## Awaiting PR merge` section header** — script exits non-zero (PROGRESS.md structure contract violation per `.claude/agent-stack.md`).
- [ ] **Fixture: gated-path file changed but no task file in `docs/tasks/` references it** — script exits non-zero (gated-path accountability check).
- [ ] **Fixture: workflow-file PR description missing `[sa]` verdict marker** — script exits non-zero in PR-body mode.
- [ ] **Fixture: non-workflow-file PR description missing `[sa]` verdict marker** — script exits 0 (PR-body verdict check applies only to workflow-file PRs).
- [ ] **Pre-push hook integration:** trigger a push attempt with a broken fixture, verify push is blocked.

Self-test fixtures live in `scripts/__test_fixtures__/validate-gates/` (script reads them via a `--fixture-dir` flag for testing). Real repo invocation uses default paths.

## Implementation Notes

### Script architecture

`scripts/validate-gates.sh` is a single bash file (POSIX-ish, but `bash` shebang is fine — runners are Linux/macOS). Each check is a function returning 0 or non-zero:

```
check_task_file_completion()        # all done tasks have all 4 metadata fields filled
check_bug_files_present_for_done()  # any task that flipped done after rejection has its BUG file referenced
check_progress_md_structure()       # 5 sections per .claude/agent-stack.md § PROGRESS.md structure contract
check_gated_path_accountability()   # any change in apps/, packages/, infra/, .github/workflows/, scripts/ has a task file
check_work_log_content()            # every done task has at least one "Starting implementation" + one "review" breadcrumb
check_playwright_artifacts()        # E2e-required: yes tasks have e2e output in Work Log
check_ci_evidence()                 # required: yes Introduces-gate tasks have run URL + named path + counterfactual
check_pr_body_quad_review()         # only when --pr-body <file> passed; greps for [sa]/[ra]/[sdet]/[overwatch] verdicts on workflow-file PRs
```

`main()` collects results, prints a summary table, exits non-zero if any check failed.

### Pre-push hook

`scripts/hooks/pre-push` is the git hook script. It calls `bash scripts/validate-gates.sh`. If the script exits non-zero, the hook prints the script output and exits non-zero (blocking the push).

`scripts/hooks/install.sh` is the installer that symlinks `.git/hooks/pre-push -> ../../scripts/hooks/pre-push`. Document in the script: "Run this once after cloning the repo." Add a one-line note to `CLAUDE.md` § Local Development Setup pointing at the install command — call this out in the Work Log so SDET can verify the doc update happened.

### CI integration

The CI workflow from TASK-LOE-001 should add a step in the `lint-and-typecheck` job: `bash scripts/validate-gates.sh`. **Do not block this task on TASK-LOE-001 landing first** — the CI step can be added in a follow-up if TASK-LOE-001 is mid-review when this task completes. Note in the Work Log if the CI step was added or deferred.

### `--pr-body` mode (workflow-file PR check)

When called with `--pr-body <file>` and a list of changed file paths via stdin or `--changed-files <file>`:

1. Detect if the changed file list includes any of: `.claude/agent-stack.md`, `agents/*.md`. If none, skip this check (exit 0 for this check).
2. If yes, grep the PR body for the four verdict markers (`[sa]`, `[ra]`, `[sdet]`, `[overwatch]`) — each marker must appear at least once.
3. Missing any marker → exit non-zero, print which markers are missing.

This mode is intended for use by a future GitHub Actions step (out of scope for this chore — the script just needs to support the mode for when it's wired up).

### Why this is `Introduces-gate: yes`

The pre-push hook itself is a new blocking gate: any push that fails the script is blocked. This is exactly the "pre-push hook addition in `scripts/hooks/`" enumerated in `.claude/agent-stack.md` § Gate Authoring Rules § Scope. The Work Log evidence requirement applies (red-then-green per the In-flight regression exception is the natural shape — the test fixtures provide the red, the green run after fixing them provides the green).

## Definition of Done

- [ ] `scripts/validate-gates.sh` exists with all 8 check functions in § Implementation Notes
- [ ] `scripts/hooks/pre-push` exists and invokes the script
- [ ] `scripts/hooks/install.sh` exists; instructions added to CLAUDE.md § Local Development Setup
- [ ] All 8 fixture tests pass (Work Log shows red-then-green for each fixture)
- [ ] `package.json` has `scripts.gates:validate` invoking the script
- [ ] Script runs clean against the current repo state (Work Log captures the green run)
- [ ] Gate Authoring Rules evidence in Work Log per § SDET Review focus areas
- [ ] CLAUDE.md § Local Development Setup has the one-line install hook command

---

## Work Log

- 2026-04-26 [devops] Starting implementation — create `scripts/validate-gates.sh` (8 check functions), `scripts/hooks/pre-push`, `scripts/hooks/install.sh`, fixture tests under `scripts/__test_fixtures__/validate-gates/`, add `gates:validate` to package.json, update CLAUDE.md § Local Development Setup | What's next: create `scripts/validate-gates.sh` | Blockers: none

- 2026-04-26 [devops] Implementation complete — all 8 check functions created, 7 fixture tests pass, real-repo run clean, pre-push hook installed and verified, Gate Authoring Rules evidence captured below. Status flipping to review.

  **Files created:**
  - `scripts/validate-gates.sh` — 8 check functions (check_task_file_completion, check_bug_files_present_for_done, check_progress_md_structure, check_gated_path_accountability, check_work_log_content, check_playwright_artifacts, check_ci_evidence, check_pr_body_quad_review)
  - `scripts/hooks/pre-push` — git pre-push hook, calls validate-gates.sh, exits non-zero to block push on failure
  - `scripts/hooks/install.sh` — symlink installer; runs once after clone
  - `scripts/__test_fixtures__/validate-gates/clean/` — clean fixture (exits 0)
  - `scripts/__test_fixtures__/validate-gates/done-missing-complexity/` — TASK with Status: done + Complexity-actual: — (exits 1)
  - `scripts/__test_fixtures__/validate-gates/done-no-worklog/` — TASK with Status: done + empty Work Log (exits 1)
  - `scripts/__test_fixtures__/validate-gates/progress-missing-section/` — PROGRESS.md missing ## Awaiting PR merge (exits 1)
  - `scripts/__test_fixtures__/validate-gates/gated-no-task/` — .changed_files lists apps/ path with no task reference (exits 1)
  - `scripts/__test_fixtures__/validate-gates/pr-body-workflow-missing-verdict/` — PR body with agents/*.md changed but [sa] missing (exits 1)
  - `scripts/__test_fixtures__/validate-gates/pr-body-non-workflow-ok/` — PR body with non-workflow changed files, no quad-review markers needed (exits 0)

  **Files modified:**
  - `CLAUDE.md` § Local Development Setup — added `bash scripts/hooks/install.sh` as first step
  - `.github/workflows/ci.yml` — added `validate-gates.sh` step to `lint-and-typecheck` job
  - `package.json` — created with `scripts.gates:validate: "bash scripts/validate-gates.sh"` (minimal root package.json; pre-scaffold, no deps)

  **Submission gate:**
  - `pnpm lint`: N/A — no `package.json` existed before this task; package.json now exists but workspace not scaffolded (same pre-scaffold state as TASK-LOE-001). Flag per task spec: note in Work Log, proceed.
  - `pnpm type-check`: same reason. N/A.
  - Script self-test: `bash scripts/validate-gates.sh` — ALL CHECKS PASSED, EXIT_CODE: 0 (captured live — real repo run with current task files)
  - All 7 fixture tests: PASS (each described below in fixture self-test section)

  **Fixture self-test results (red-then-green per § Gate Authoring Rules Exceptions / In-flight regression):**

  | Fixture | Expected exit | Actual exit | Failing check |
  |---|---|---|---|
  | clean | 0 | 0 | — |
  | done-missing-complexity | 1 | 1 | check_task_file_completion: Complexity-actual missing or not 1-5 |
  | done-no-worklog | 1 | 1 | check_work_log_content: Work Log missing 'Starting implementation' entry |
  | progress-missing-section | 1 | 1 | check_progress_md_structure: Missing section '## Awaiting PR merge' |
  | gated-no-task | 1 | 1 | check_gated_path_accountability: apps/portal/src/some-new-file.ts not referenced in any task file |
  | pr-body-workflow-missing-verdict | 1 | 1 | check_pr_body_quad_review: PR body missing verdict marker: [sa] |
  | pr-body-non-workflow-ok | 0 | 0 | — (quad-review check skipped for non-workflow PR) |

  **Pre-push hook deliberate-bad-push test:**
  - Created `docs/tasks/done/TASK-TEST-BAD.md` with `Status: done` and `Complexity-actual: —`
  - Ran `bash scripts/hooks/pre-push` (the hook calls validate-gates.sh)
  - Hook output: `[pre-push] Push BLOCKED — one or more gate checks failed.` + check_task_file_completion FAIL → PRE_PUSH_EXIT: 1
  - Removed bad fixture. Re-ran hook: `[pre-push] All gate checks passed — push allowed.` PRE_PUSH_EXIT: 0

  **CI integration:** `validate-gates.sh` step added to `lint-and-typecheck` job in `.github/workflows/ci.yml` (TASK-LOE-001 is in review, spec says CI step can land alongside — added it). TASK-LOE-001 spec is consistent with this addition.

  **CLAUDE.md update:** `bash scripts/hooks/install.sh` added as the first line of Local Development Setup code block. Per task spec requirement that SDET can verify the doc update happened.

  **Gate Authoring Rules evidence (§ Introduces-gate: yes):**

  **Gate: pre-push hook blocking on validate-gates.sh failure**

  1. **Run URL + job/step + local log:** Local run evidence (no CI URL — pre-push hooks are local gates). Evidence documented as red-then-green local run per § Gate Authoring Rules § Evidence requirement, form: local execution output captured in this Work Log entry.
     - RED: `bash scripts/hooks/pre-push` with `docs/tasks/done/TASK-TEST-BAD.md` (Status: done, Complexity-actual: —) present → PRE_PUSH_EXIT: 1, output: `[pre-push] Push BLOCKED`
     - GREEN: Remove bad fixture, re-run → PRE_PUSH_EXIT: 0, output: `[pre-push] All gate checks passed — push allowed.`
     - Named job/step: `scripts/hooks/pre-push` step "invoke validate-gates.sh" (line 27: `if ! bash "$SCRIPT"; then`)

  2. **Named code path:** `scripts/validate-gates.sh:check_task_file_completion()` — specifically the regex at the line `if ! grep -qE "^\*\*Complexity-actual\*\*: [1-5]$" "$f"; then` (checks 4 done-task metadata fields; `Complexity-actual: [1-5]` is the specific guard for the demonstrated failure mode).

  3. **Counterfactual:** If `check_task_file_completion()` were changed from `grep -qE "^\*\*Complexity-actual\*\*: [1-5]$"` to `grep -qE "^\*\*Complexity-actual\*\*:"` (removing the `[1-5]` range constraint), then `Complexity-actual: —` (a placeholder dash) would satisfy the pattern — a done task with no actual estimate would silently pass. That is exactly what the regex specificity is guarding against: the guard proves that only a numeric 1–5 value satisfies the constraint, not a placeholder.

  What's next: SDET review | Blockers: none

- 2026-04-27 [sdet] Review complete — REJECT. Hard blocking bug: `check_ci_evidence` grep pattern `^\*\*Introduces-gate\*\*: yes` does not match `**Introduces-gate:** yes` (colon placement differs — colon inside bold in task files, pattern expects colon outside bold). Real-repo run shows "no Introduces-gate done tasks" — TASK-LOE-001 silently skipped. Filed BUG-000-001. Fix: change grep to `^\*\*Introduces-gate:\*\* yes` in `check_ci_evidence()`, re-run real repo to confirm TASK-LOE-001 found and passes evidence checks, re-submit. All other checklist items pass. Status returned to in-progress. | What's next: devops applies one-line fix and re-submits | Blockers: none

- 2026-04-27 [devops] Re-dispatch — fixing BUG-000-001 (check_ci_evidence regex format) | What's next: edit scripts/validate-gates.sh:456 | Blockers: none
  Re-dispatched-at: 2026-04-27T01:17:47Z
  Complexity-actual-revised: 3 (single-line fix in correctness-critical code, but required full audit of all grep patterns in script to confirm no other colon-placement bugs)

- 2026-04-27 [devops] BUG-000-001 fixed. Changed `scripts/validate-gates.sh:456` from `^\*\*Introduces-gate\*\*: yes` to `^\*\*Introduces-gate:\*\* yes`. Off-by-2 line reference corrected in Work Log (line 29 → line 27 for pre-push hook `if ! bash "$SCRIPT"; then`).

  **Pattern audit results** — no other colon-placement bugs found:
  - `^\*\*Status\*\*: done` (line 113, 188, 355, 404, 453) — `**Status**: done` format confirmed correct in all task files
  - `^\*\*E2e-required\*\*: yes` (line 407) — `**E2e-required**: no` confirmed in all task headers; pattern correct
  - `^\*\*Started-at\*\*:`, `^\*\*Completed-at\*\*:`, `^\*\*Complexity-estimate\*\*:`, `^\*\*Complexity-actual\*\*:` (lines 137, 143, 149, 155) — all use colon-after-`**` format in task files; patterns correct
  - `^\*\*Decision\*\*:` (line 192) — colon-after-`**` format in SDET Review sections; correct
  - `^\*\*Introduces-gate:\*\* yes` (line 456, now fixed) — colon-inside-`**` format confirmed in task files

  **Verification:**
  - `grep -c "^\*\*Introduces-gate:\*\* yes" docs/tasks/done/TASK-LOE-001-ci-workflow.md` → 1 (was 0)
  - `bash scripts/validate-gates.sh` output: `check_ci_evidence  PASS` (no longer "no Introduces-gate done tasks")
  - Full output: `ALL CHECKS PASSED (0 failures)` — EXIT_CODE: 0
  - TASK-LOE-001 confirmed visible: has `Status: done` + `Introduces-gate: yes`; all three evidence items confirmed present (run URL 24971165581, named code path ci.yml lines 35–49/157–184, counterfactual documented)

  Status flipping to review. | What's next: SDET re-review of TASK-LOE-003 | Blockers: none

- 2026-04-27 [sdet] Re-review ACCEPT — BUG-000-001 fix verified: `scripts/validate-gates.sh:456` now `^\*\*Introduces-gate:\*\* yes`; live run exits 0, `check_ci_evidence PASS` with TASK-LOE-001 found; `grep -c` returns 1 (was 0); all three Gate Authoring Rules evidence items confirmed present; pattern audit accurate (all other field greps correct); pre-push hook line 27 confirmed; backtick noise on line 470 is cosmetic/non-blocking. Status → done. | What's next: BUG-000-001 closure, dispatch TASK-LOE-005 | Blockers: none

<!-- Format: - YYYY-MM-DD [role] What was done | What's next | Blockers -->

## Attempt Log

**Attempt count**: 0

## SDET Review

**Decision**: approved
**Notes**: Re-review after BUG-000-001 fix. One-line regex change at `scripts/validate-gates.sh:456` confirmed correct (`^\*\*Introduces-gate:\*\* yes`). Live `bash scripts/validate-gates.sh` run: `check_ci_evidence PASS` (TASK-LOE-001 found and all three evidence items verified), exit 0. `grep -c "^\*\*Introduces-gate:\*\* yes" docs/tasks/done/TASK-LOE-001-ci-workflow.md` returns 1 (was 0). Pattern audit claim verified — all other field greps (`Status`, `E2e-required`, `Started-at`, `Completed-at`, `Complexity-estimate`, `Complexity-actual`, `Decision`) use colon-after-`**` format and their patterns are correct. Pre-push hook line 27 confirmed (`if ! bash "$SCRIPT"; then`). Advisory: line 470 has cosmetic stderr noise from backtick expansion in the named-code-path grep regex, but does not produce false PASSes — first alternative catches all real path references correctly. All items from original SDET review (fixtures, idempotency, fail-closed behavior, hook bypass, PR quad-review check, install.sh, CLAUDE.md, CI integration, gates:validate package.json, Gate Authoring Rules evidence) previously passed and are unaffected by the one-line fix.
