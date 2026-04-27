# BUG-000-001: validate-gates.sh check_ci_evidence grep pattern does not match Introduces-gate field format

**Epic**: cross-cutting (BUG-000-NNN)
**Status**: fixed
**Severity**: high — the gate that checks Gate Authoring Rules evidence for `Introduces-gate: yes` tasks silently passes with zero tasks inspected on the real repo
**Assigned to**: devops
**Found by**: sdet
**Found during**: TASK-LOE-003 review (2026-04-27)
**Blocks**: TASK-LOE-003 cannot move to done until this is fixed and re-reviewed

---

## Summary

`check_ci_evidence()` in `scripts/validate-gates.sh` uses the grep pattern:

```
grep -q "^\*\*Introduces-gate\*\*: yes"
```

This pattern expects the format `**Introduces-gate**: yes` (colon **after** the closing `**`).

All task files in the repo use the format `**Introduces-gate:** yes` (colon **inside** the bold span, **before** the closing `**`):

```
**Introduces-gate:** yes
```

These two patterns are distinct in plain text. The grep returns 0 matches for every real task file, causing `check_ci_evidence` to report "no Introduces-gate done tasks" and exit 0 — a false PASS. The gate provides no protection.

## Reproduction Steps

1. Confirm `docs/tasks/done/TASK-LOE-001-ci-workflow.md` has `Status: done` and `Introduces-gate: yes`:
   ```
   grep "Introduces-gate" docs/tasks/done/TASK-LOE-001-ci-workflow.md
   # Output: **Introduces-gate:** yes
   ```
2. Run the current grep pattern:
   ```
   grep -c "^\*\*Introduces-gate\*\*: yes" docs/tasks/done/TASK-LOE-001-ci-workflow.md
   # Output: 0   ← BUG: should be 1
   ```
3. Run `bash scripts/validate-gates.sh` against the real repo:
   - `check_ci_evidence (no Introduces-gate done tasks) PASS` ← false PASS

## Expected Behavior

`check_ci_evidence` should find TASK-LOE-001 (and TASK-LOE-003 once it's `done`), confirm both have all three Gate Authoring Rules evidence items, and report a PASS backed by real task inspection — not "no tasks found."

## Root Cause

The grep pattern was authored with the wrong field format. The project convention for `**Introduces-gate:**` places the colon before the closing `**` (consistent with `**Affected flows:**`, `**Affected requirements:**`). The pattern used the other convention (`**Field**: value` with colon after `**`), which applies to `**Status**`, `**E2e-required**`, `**Started-at**`, etc. — but not `Introduces-gate`.

## Fix

In `scripts/validate-gates.sh`, `check_ci_evidence()`, change:

```bash
if ! grep -q "^\*\*Introduces-gate\*\*: yes" "$f" 2>/dev/null; then
```

to:

```bash
if ! grep -q "^\*\*Introduces-gate:\*\* yes" "$f" 2>/dev/null; then
```

**Verification after fix:**
1. `grep -c "^\*\*Introduces-gate:\*\* yes" docs/tasks/done/TASK-LOE-001-ci-workflow.md` must return 1.
2. `bash scripts/validate-gates.sh` must report `check_ci_evidence PASS` (with a named task, not "no tasks").
3. The task must also have all three evidence items present — the fix exposes the check; confirm TASK-LOE-001 passes all three items (it does — its Work Log contains run URLs, named code paths, and counterfactuals).

**Also audit** the `check_playwright_artifacts` pattern `^\*\*E2e-required\*\*: yes` — task files use `**E2e-required**: yes` (colon after `**`), so that pattern appears correct. Confirm `grep -c "^\*\*E2e-required\*\*: yes"` returns the expected count on a known E2e-required task.

## Work Log

- 2026-04-27 [sdet] Bug filed during TASK-LOE-003 review. Root cause confirmed via `grep -c` against live TASK-LOE-001 file. Fix is a one-line change in `check_ci_evidence()`. | What's next: devops fixes and re-submits TASK-LOE-003 for SDET review | Blockers: none

- 2026-04-27 [devops] Fixed in branch `chore/port-j4j-agent-stack-hardening` — re-dispatch of TASK-LOE-003. One-line change at `scripts/validate-gates.sh:456`: `^\*\*Introduces-gate\*\*: yes` → `^\*\*Introduces-gate:\*\* yes`. Verification: `grep -c "^\*\*Introduces-gate:\*\* yes" docs/tasks/done/TASK-LOE-001-ci-workflow.md` returns 1 (was 0 with old pattern). `bash scripts/validate-gates.sh` now reports `check_ci_evidence PASS` — TASK-LOE-001 found and all three evidence items verified (run URL, named code path, counterfactual). No other field-pattern grep bugs found during audit: `**E2e-required**: yes` (colon after `**`) matches the `^\*\*E2e-required\*\*: yes` pattern correctly; all other grepped fields (`Status`, `Started-at`, `Completed-at`, `Complexity-estimate`, `Complexity-actual`, `Decision`) use `**Field**: value` format and their patterns are correct. | What's next: SDET re-review of TASK-LOE-003 | Blockers: none
