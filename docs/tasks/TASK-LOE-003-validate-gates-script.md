# TASK-LOE-003: scripts/validate-gates.sh + pre-push hook

**Epic**: chore/lights-out-enablement
**Status**: backlog
**Assigned to**: devops
**Updated-by**: sa
**Depends on**: none (independent of TASK-LOE-001 — the script is the backstop, not a CI consumer)
**E2e-required**: no
**Started-at**: —
**Completed-at**: —
**Complexity-estimate**: —
**Complexity-actual**: —
**Affected flows:** none (justification: chore touches CI/git infrastructure, not user-facing behavior)
**Affected requirements:** none (justification: chore touches workflow infrastructure, not SRS requirements)
**Introduces-gate:** yes
**Relevant ADRs:** none

---

## Quality Gates

- [ ] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [ ] **Submission gate** — `pnpm lint` (shellcheck if configured) + script-self-test must pass
- [N/A] **Targeted e2e** — N/A (script + git hook, no UI)
- [ ] **Security review** — verify no `eval`, no unsanitized variable expansion, no `curl | sh` patterns; verify the pre-push hook does not exfiltrate task content
- [ ] **SDET Review** — approved

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

<!-- Format: - YYYY-MM-DD [role] What was done | What's next | Blockers -->

## Attempt Log

**Attempt count**: 0

## SDET Review

**Decision**: pending
**Notes**:
