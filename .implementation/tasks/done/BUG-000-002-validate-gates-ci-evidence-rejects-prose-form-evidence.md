---
epic: cross-cutting (BUG-000-NNN)
status: closed
assigned_to: devops
updated_by: devops
started_at: 2026-04-27T11:02:14Z
completed_at: 2026-04-27T12:45:00Z
complexity_estimate: 2
complexity_actual: 2
found_in: TASK-LOE-006 (surfaced during quad-review against the chore branch; affects TASK-LOE-003 also)
category: code-quality
severity: major — `lint-and-typecheck` CI job fails on the lights-out enablement chore PR; blocks the chore from shipping with green CI
---





# BUG-000-002: validate-gates.sh check_ci_evidence Item 1 regex rejects prose-form red-then-green evidence authorized by Gate Authoring Rules

---

## Quality Gates

- [x] **Reproduction confirmed** — documented in Reproduction / Evidence section below
- [x] **Regression test added** — proves the bug does not recur (fixture coverage in `scripts/validate-gates/fixtures/`)
- [x] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [N/A] **Submission gate** — N/A (bash script change; no `pnpm lint` / `type-check` / domain tests apply at this stage of pre-scaffold; live `bash scripts/validate-gates.sh` is the substitute submission gate)
- [N/A] **Targeted e2e** — N/A (bash script + git hook surface, no UI)
- [x] **Security review** — new Item 1 prose-form branch uses two `grep -qE` calls with no `eval`, no `$()` command substitution, all file references via `"$f"` (double-quoted variable, no word-split risk). Item 2 fix switches from double-quoted to single-quoted regex string — eliminates the bash command-substitution interpretation of backticks; no semantic change to the matched pattern (confirmed by spot-check: `` `ci.yml` `` and `ci.yml:35` both still match). No new unquoted variable expansions introduced.
- [x] **SDET Review** — approved
- [N/A] **Post-merge verification** — N/A (no deployed surface)

## SDET Review focus areas

- The fix must accept prose-form red-then-green evidence as authorized by `.claude/agent-stack.md` § Gate Authoring Rules § In-flight regression exception, **without** weakening the existing CI-run-URL or local-log-path branches. The third regex branch must require enough specificity that "I ran a thing and it failed then passed" can't trivially false-PASS — at minimum, both a "before" and "after" indicator must be present (e.g., `RED:` + `GREEN:`, or `pre-rule` + `post-rule`, or `red-then-green`).
- The line-470 backtick stderr noise must be eliminated. The fix is quoting (use `'...'` for the regex string, or escape the backticks). The matched patterns must remain identical in behavior — verify by spot-checking against the existing TASK-LOE-001 entry (which currently passes Item 2 with `ci.yml lines 35–49` and `ci.yml lines 157–184` — but those use the colon-prefixed form, not the backtick form. Confirm neither form's matching changes.)
- Live `bash scripts/validate-gates.sh` must report `check_ci_evidence PASS` (exit 0) against the real repo after the fix.
- Fixture suite (`scripts/validate-gates/fixtures/`) must include at least one new fixture exercising the prose-form-evidence branch — for the regression-test gate.

## Description

`scripts/validate-gates.sh:464` (Item 1 regex in `check_ci_evidence`) currently requires either a GitHub Actions run URL (`https://github.com/.../actions/runs/[0-9]+`) or a `/tmp/*.log` path. This excludes the **prose-form red-then-green evidence pattern** explicitly authorized by `.claude/agent-stack.md` § Gate Authoring Rules § In-flight regression exception:

> **In-flight regression exception:** When a gate cannot produce a CI run URL because it has no CI manifestation (e.g. a pre-push git hook, an agent-spec startup checklist rule), evidence may take the form of red-then-green prose at the Work Log level — one entry showing the failure mode pre-rule, one entry showing the rule firing as expected post-rule.

Two `Introduces-gate: yes` tasks in the lights-out enablement chore depend on this exception:
- **TASK-LOE-003** (validate-gates.sh + pre-push hook) — pre-push hook is local-only; uses `RED: ... PRE_PUSH_EXIT: 1` / `GREEN: ... PRE_PUSH_EXIT: 0` prose form.
- **TASK-LOE-006** (workflow file edits — Stuck-Loop Killswitch) — agent-spec rule with no CI manifestation; uses contrived 3-attempt scenario showing pre-rule context burn vs. post-rule halt.

Both tasks were SDET-accepted at task-review time on the basis of the In-flight regression exception. The script's regex does not implement the exception — it rejects both tasks at gate-validation time, producing a false FAIL on the chore's `lint-and-typecheck` CI job.

**Secondary issue (cosmetic, same fix surface):** `scripts/validate-gates.sh:470` (Item 2 regex) contains literal backticks inside a double-quoted regex string. Bash interprets the backticks as command substitution, producing repeated `command substitution: line 470: syntax error near unexpected token 'sh'` stderr noise on every script invocation. Result is correct (no false PASSes/FAILs observed) but the noise pollutes CI logs.

---

## Expected Behavior

After the fix:

1. **Item 1 regex accepts prose-form red-then-green evidence** as a third branch alongside the existing CI-run-URL and local-log-path branches. The new branch requires enough specificity that ad-hoc "it worked" prose cannot false-PASS — at minimum, both a "red" indicator and a "green" indicator must be present in the same task file.
2. **Live `bash scripts/validate-gates.sh` against the real repo exits 0** with `check_ci_evidence PASS` — both TASK-LOE-003 and TASK-LOE-006 satisfy all three evidence items.
3. **Line-470 stderr noise is gone** — no `command substitution` errors emitted on any invocation. The matched patterns continue to recognize colon-prefixed file references (`ci.yml:35`) and remain compatible with backtick-quoted file references in markdown (the original intent of the broken branch).
4. **Fixture suite extended** with a new fixture exercising the prose-form-evidence branch (red-then-green pass; ad-hoc-prose fail).

---

## Files Involved

| File              | Issue                               |
| ----------------- | ----------------------------------- |
| `scripts/validate-gates.sh` | Line 464: Item 1 regex missing prose-form branch. Line 470: Item 2 regex has unquoted backticks producing bash command-substitution errors. |
| `scripts/validate-gates/fixtures/` | New fixture needed for prose-form-evidence regression coverage. |

---

## Reproduction / Evidence

```
$ bash scripts/validate-gates.sh
...
  check_ci_evidence                                    FAIL
    → TASK-LOE-003-validate-gates-script.md: Introduces-gate done task missing run URL or local log path
/home/jasgr/repos/tax-portal/scripts/validate-gates.sh: command substitution: line 470: syntax error near unexpected token `sh'
/home/jasgr/repos/tax-portal/scripts/validate-gates.sh: command substitution: line 470: `[a-zA-Z0-9_./-]+\.(sh|yml|yaml|ts|tsx|js|json)'
  check_ci_evidence                                    FAIL
    → TASK-LOE-006-workflow-file-edits.md: Introduces-gate done task missing run URL or local log path
...
  Summary: 2 check(s) FAILED
```

Both task files have prose-form red-then-green evidence per the In-flight regression exception:

- `docs/tasks/done/TASK-LOE-003-validate-gates-script.md` Work Log: `RED: bash scripts/hooks/pre-push with docs/tasks/done/TASK-TEST-BAD.md ... → PRE_PUSH_EXIT: 1` / `GREEN: Remove bad fixture, re-run → PRE_PUSH_EXIT: 0`
- `docs/tasks/done/TASK-LOE-006-workflow-file-edits.md` Work Log: contrived 3-attempt `pnpm type-check` scenario showing pre-rule context burn vs. post-rule halt-at-attempt-3 with all four mandatory steps.

---

## Work Log

<!-- Format: - YYYY-MM-DD [role] What was done | What's next | Blockers -->

- 2026-04-27 [main] Bug filed during chore quad-review against `chore/lights-out-enablement`. Root cause confirmed via live `bash scripts/validate-gates.sh` invocation (output above). SDET predicted the LOE-006 failure during quad-review (Lens A advisory CONCERN); LOE-003 failure was not predicted but stems from the same regex gap. | What's next: devops fixes regex (Item 1 prose-form branch + line-470 quoting) and re-runs validate-gates.sh against real repo | Blockers: none

- 2026-04-27 [devops] Starting implementation — regex fixes in check_ci_evidence (Item 1 prose-form branch + line-470 quoting) | What's next: edit scripts/validate-gates.sh, add fixture, verify against real repo | Blockers: none

- 2026-04-27 [devops] Implementation complete — two regex fixes applied, two fixtures added, real-repo run passes.

  **Fix A (scripts/validate-gates.sh lines 463–470, Item 1 prose-form branch):**
  Added a third alternative to the Item 1 check using two `grep` calls joined with `&&`:
  - First grep: `(RED:|Pre-rule)` matches either `RED:` (LOE-003 form) or `Pre-rule` (LOE-006 form)
  - Second grep: `(GREEN:|Post-rule)` matches either `GREEN:` (LOE-003 form) or `Post-rule` (LOE-006 form)
  Both anchors must be present in the same file. A file with only `RED:` or only `GREEN:` fails — prevents
  single-sentence "I tested it" prose from false-PASSing. The prose branch is only taken when the
  CI-run-URL and local-log-path branches both miss.

  **Fix B (scripts/validate-gates.sh line 474, Item 2 quoting):**
  Switched the outer quotes from double to single (`'...'`). In bash, single-quoted strings do not
  interpret backticks as command substitution. The regex is semantically identical: first alternative
  `\.(sh|yml|yaml|ts|tsx|js|json|md):[0-9]+` matches colon-prefixed file refs (e.g., `ci.yml:35`);
  second alternative `` `[a-zA-Z0-9_./-]+\.(sh|yml|yaml|ts|tsx|js|json)` `` matches backtick-quoted
  file refs in markdown (e.g., `` `ci.yml` ``). No stderr noise from command substitution.

  **Fixtures added:**
  - `scripts/__test_fixtures__/validate-gates/ci-evidence-prose-pass/` — TASK-TEST-002 with `Introduces-gate: yes`,
    RED:/GREEN: prose form, named code path (`validate-gates.sh:142`), counterfactual → exits 0
  - `scripts/__test_fixtures__/validate-gates/ci-evidence-prose-fail/` — TASK-TEST-003 with `Introduces-gate: yes`,
    only ad-hoc prose ("I ran a thing and it worked"), no RED/GREEN anchors → exits 1 on Item 1

  **Spot-checks (pattern parity):**
  - TASK-LOE-001 still passes Item 2: matches via `` `package.json` `` and `` `.github/workflows/ci.yml` `` backtick form
  - TASK-LOE-003 now passes Item 1: `RED:` + `GREEN:` anchors both present → prose branch satisfied
  - TASK-LOE-006 now passes Item 1: `**Pre-rule (red):**` + `**Post-rule (green):**` anchors both present → prose branch satisfied

  **Real-repo live run (substitute submission gate):**
  ```
  validate-gates.sh — tax-portal gate validation backstop
  =========================================================
    Mode: real repo (/home/jasgr/repos/tax-portal)

  Results:
    check_task_file_completion                           PASS
    check_bug_files_present_for_done                     PASS
    check_progress_md_structure                          PASS
    check_gated_path_accountability                      PASS
    check_work_log_content                               PASS
    check_playwright_artifacts (no E2e-required done tasks) PASS
    check_ci_evidence                                    PASS
    check_pr_body_quad_review                            SKIP  (--pr-body not supplied)

    Summary: ALL CHECKS PASSED (0 failures)
  ```
  Exit code: 0. No stderr noise.

  **All fixture results:**
  | Fixture | Expected exit | Actual exit | Check failing |
  |---|---|---|---|
  | clean | 0 | 0 | — |
  | done-missing-complexity | 1 | 1 | check_task_file_completion |
  | done-no-worklog | 1 | 1 | check_work_log_content |
  | progress-missing-section | 1 | 1 | check_progress_md_structure |
  | gated-no-task | 1 | 1 | check_gated_path_accountability |
  | pr-body-workflow-missing-verdict | 0* | 0 | — (SKIP, no --pr-body flag in fixture mode) |
  | pr-body-non-workflow-ok | 0 | 0 | — |
  | ci-evidence-prose-pass | 0 | 0 | — (new: prose RED/GREEN passes) |
  | ci-evidence-prose-fail | 1 | 1 | check_ci_evidence Item 1 (new: ad-hoc prose rejected) |

  What's next: SDET review | Blockers: none

- 2026-04-27 [sdet] Re-review ACCEPT — fix verified live; fixtures behave as expected; LOE-003 + LOE-006 + LOE-001 all pass check_ci_evidence; no stderr noise. Status → closed.

## SDET Review

**Decision**: approved
**Notes**: Fix A correctness confirmed — Item 1 prose branch uses two independent grep calls joined with `&&`; both anchors (`RED:`+`GREEN:` or `Pre-rule`+`Post-rule`) must hit separately, preventing single-sentence "I tested it" prose from false-PASSing. Anchor strings verified present in both real LOE-003 and LOE-006 Work Logs via grep. Fix B correctness confirmed — outer quotes changed to single-quotes at line 474; backticks inside the regex are now bash-literal; both colon-form and backtick-form file refs still match. Live real-repo run exits 0 with zero stderr lines. Fixture ci-evidence-prose-pass exits 0 (PASS); fixture ci-evidence-prose-fail exits 1 with check_ci_evidence failing on Item 1 exactly as expected. TASK-LOE-001 continues to pass via CI run URL form (no regression). Required metadata present: Started-at, Complexity-estimate: 2, Complexity-actual: 2, Updated-by: devops. Pre-implementation Work Log entry ("Starting implementation") precedes review-shaped entry. Advisory: the `RED:`/`GREEN:` anchor bar is low enough that a task mentioning CSS red/green color names could theoretically false-PASS — judged acceptable given the anchor strings are contextually unusual outside red-then-green test evidence.
