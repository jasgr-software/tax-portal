# TASK-LOE-008: Extend `scripts/validate-gates.sh` with condition-(d) verifier

**Epic**: chore/validate-gates-condition-d-check (post-PR-#13 follow-up item 1)
**Status**: backlog
**Assigned to**: devops
**Updated-by**: —
**Depends on**: none (script is the consumer; no other tasks land first)
**E2e-required**: no
**Started-at**: —
**Completed-at**: —
**Complexity-estimate**: —
**Complexity-actual**: —
**Affected flows:** none (justification: chore touches CI/gate validation infrastructure, not user-facing behavior)
**Affected requirements:** none (justification: chore extends validate-gates.sh — a pre-push and CI gate script — not SRS requirements)
**Introduces-gate:** yes
**Relevant ADRs:** none

---

## Quality Gates

- [ ] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [ ] **Submission gate** — `bash scripts/validate-gates.sh` passes against the real repo (existing check); all new fixture tests pass; `pnpm lint` / `pnpm type-check` N/A (pre-scaffold; same precedent as TASK-LOE-003)
- [N/A] **Targeted e2e** — N/A (bash script + fixtures, no UI)
- [ ] **Security review** — no `eval`, no `curl | sh`, all variables quoted, no unsanitized PR-body or PROGRESS.md content fed to grep without `-F` or anchored regex
- [ ] **SDET Review** — approved

## SDET Review focus areas

- **Gate Authoring Rules evidence** is mandatory because `Introduces-gate: yes`. The new check `check_pr_awaiting_merge_gate_verdicts` is a new SDET review-focus reject-on-fail criterion (the script is the verifier the SDET runs at PR review for epic-closing PRs) — explicitly enumerated under § Gate Authoring Rules § Scope as "SDET review-focus bullets that introduce a new reject-on-fail criterion." The Work Log must contain all three evidence items (run URL or local-log path + named step, named code path, counterfactual) in the red-then-green local-execution form documented for TASK-LOE-003.
- Verify all five fixture cases are present and produce the expected exit codes (see § Tests to Write First).
- Verify the **counterfactual fixture** is genuinely counterfactual: the fixture must fail the check by exercising the production code path (one of the regex/anchor/parser branches), not by simply omitting the file the script needs. A fixture that fails by skipping setup proves nothing about the check's specificity.
- Verify the new check **does not regress existing fixtures** — run all existing fixture cases (`clean`, `done-missing-complexity`, `done-no-worklog`, `progress-missing-section`, `gated-no-task`, `pr-body-non-workflow-ok`, `pr-body-workflow-missing-verdict`, `ci-evidence-prose-pass`, `ci-evidence-prose-fail`) and confirm exit codes unchanged.
- Verify the `--pr-body` mode invocation continues to work end-to-end (the new check piggybacks on the existing `--pr-body` argument; no new CLI flag is introduced unless the implementer judges it cleaner).
- Verify the **task ID regex** matches the project's actual TASK ID convention as observed in `docs/tasks/` and `docs/tasks/done/`: `TASK-LOE-001` through `TASK-LOE-008` exist; `BUG-000-001` and `BUG-000-002` exist. Acceptable structured forms are `TASK-[A-Z][A-Z0-9]*-\d{3,}` (matching `TASK-LOE-001` and future `TASK-001-001`-style tasks). The placeholder literal `TASK-XXX` (uppercase X repeated) **must be rejected** — the carve-out documents "TASK-XXX" as a syntactic placeholder for a real task ID, not as a valid value.
- Verify the script's `main()` calls the new check function explicitly by name (no wildcard / no "discover all `check_*` functions and run them" — the named-code-path evidence requires `check_pr_awaiting_merge_gate_verdicts` to appear by name in the run path).
- Verify cross-surface scope: vacuously satisfied (script-only change; `apps/portal` and `apps/admin` not yet scaffolded).
- Verify no contradiction with `.claude/agent-stack.md` § Autonomy Ceiling item 3 condition (d) text — the script enforces the rule as written, not a stricter or looser variant.

## Context

`.claude/agent-stack.md` § Autonomy Ceiling item 3 condition (d) (added in PR #13, refined in PR #14):

> **(d) Epic-closing PRs require pre-merge epic gates recorded in PROGRESS.md.** A PR is an **epic-closing PR** when it appears in `docs/tasks/PROGRESS.md` `## Awaiting PR merge`. For epic-closing PRs, auto-merge additionally requires that the entry in `## Awaiting PR merge` records pass verdicts for the pre-merge epic gates: **Container Smoke gate** (gate 5), **RA Validation gate** (gate 6), **SDET CI gate** (gate 7), and **SDET Quality Parity audit** (gate 8). Detection: `scripts/validate-gates.sh` is the verifier — the script reads the limbo entry and confirms the four pass-verdict markers are present before the auto-merge mechanism fires.

PR #14 added the hotfix carve-out paragraph immediately following condition (d):

> **Hotfix mini-epic carve-out for condition (d):** A PR that closes a hotfix mini-epic per `agent-phases.md` § Post-Close Protocol may legitimately have abbreviated gates 5–8 markers per § Gate Authoring Rules § Exceptions: Hotfix urgency. The hotfix-close PR's `## Awaiting PR merge` entry records the abbreviation as `(deferred per hotfix urgency: TASK-XXX)` rather than `PASS` for the affected gates, where `TASK-XXX` is the follow-up task that backfills the abbreviated gate. The verifier (`scripts/validate-gates.sh`, once extended to actually check condition (d) — see post-PR-#13 follow-up batch) treats both `PASS` markers and explicit `(deferred per hotfix urgency: ...)` annotations as satisfying condition (d). When an `## Awaiting PR merge` entry leaves any of gates 5–8 simply pending (no `PASS`, no `(deferred ...)` annotation), condition (d) refuses regardless of `Epic-type`. The hotfix exception is the explicit-annotation case; silent omission is not equivalent.

The script does not currently implement this check. SDET independent quad review of PR #13 confirmed: `check_progress_md_structure` only verifies the section *header* exists, not its content; no other check reads `## Awaiting PR merge` entries for gate 5–8 markers. The cite is aspirational. Auto-merge for routine PRs is live (PR #9 went through Stage 1 branch protection 2026-04-28); the first epic-closing PR could auto-merge today without the cite being verified.

This task closes that gap by introducing the verifier check. It also closes the additional surface flagged by SDET independent quad review of PR #14: validate that `(deferred per hotfix urgency: TASK-XXX)` annotations match a structured task-ID format (e.g. `TASK-LOE-001`, `TASK-001-001`), not freeform text — silent freeform `TASK-XXX` text is the "just-because" bypass surface that must be closed.

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `scripts/validate-gates.sh` | Modify — add `check_pr_awaiting_merge_gate_verdicts` function and call it from `main()` | devops |
| `scripts/__test_fixtures__/validate-gates/awaiting-merge-all-pass/` | Create — fixture: PROGRESS.md with all 4 gate verdicts marked PASS | devops |
| `scripts/__test_fixtures__/validate-gates/awaiting-merge-missing-marker/` | Create — fixture: PROGRESS.md with one of the 4 markers absent (no PASS, no deferred annotation) | devops |
| `scripts/__test_fixtures__/validate-gates/awaiting-merge-hotfix-deferred-valid/` | Create — fixture: PROGRESS.md with valid `(deferred per hotfix urgency: TASK-LOE-008)` annotation on one or more of the 4 markers; remaining markers PASS | devops |
| `scripts/__test_fixtures__/validate-gates/awaiting-merge-hotfix-deferred-malformed/` | Create — fixture: PROGRESS.md with malformed `(deferred per hotfix urgency: TASK-XXX)` annotation (placeholder literal, not a real task ID) | devops |
| `scripts/__test_fixtures__/validate-gates/awaiting-merge-empty/` | (Optional) — fixture: empty `## Awaiting PR merge` section (no PR entries to check); script must skip the check, exit 0 for that check. Existing `clean` fixture already exercises this case — only add if existing coverage is insufficient. | devops |

## Tests to Write First

The TDD-mandated fixture set (one per branch of the new check):

- [ ] **Fixture: `awaiting-merge-all-pass`** — `## Awaiting PR merge` entry contains pass verdicts for all four gates (gate 5 / Container Smoke, gate 6 / RA Validation, gate 7 / SDET CI, gate 8 / SDET Quality Parity). Script exits 0; `check_pr_awaiting_merge_gate_verdicts: PASS`.
- [ ] **Fixture: `awaiting-merge-missing-marker`** — same PROGRESS.md structure but one of the four gate markers is absent (no `PASS`, no `(deferred ...)` annotation — the silent-omission case). Script exits 1; the check names the missing gate.
- [ ] **Fixture: `awaiting-merge-hotfix-deferred-valid`** — one or more gates carry the `(deferred per hotfix urgency: TASK-LOE-008)` annotation with a real, format-valid task ID; remaining gates carry `PASS`. Script exits 0; `check_pr_awaiting_merge_gate_verdicts: PASS`.
- [ ] **Fixture: `awaiting-merge-hotfix-deferred-malformed`** — one gate carries `(deferred per hotfix urgency: TASK-XXX)` with the literal placeholder `TASK-XXX` (no structured task ID); remaining gates carry `PASS`. Script exits 1; the check rejects the malformed annotation by name and identifies the offending gate.
- [ ] **Counterfactual cross-check (no new fixture required)**: in the implementation, comment out the regex anchor that distinguishes `TASK-XXX` from `TASK-LOE-008` and confirm that `awaiting-merge-hotfix-deferred-malformed` flips to passing — that is the counterfactual demonstrating the regex is load-bearing. Restore the anchor before committing. Document the experiment in the Work Log (red-then-green form).

Each fixture follows the existing pattern: a directory under `scripts/__test_fixtures__/validate-gates/<name>/` containing `docs/tasks/PROGRESS.md` (and any other files the check requires).

**Real-repo regression check:** after the new check lands, `bash scripts/validate-gates.sh` against the live repo must continue to exit 0. The current PROGRESS.md `## Awaiting PR merge` entry is for PR #8 (merged) — the script must either skip the check when no entries are present or correctly evaluate the entry as it stands. The implementer chooses; document the choice in the Work Log.

## Implementation Notes

### Where the check fits in the script

`scripts/validate-gates.sh` follows a "one function per check, named explicitly in `main()`" pattern. Add `check_pr_awaiting_merge_gate_verdicts` as the ninth check, placed in source order after `check_pr_body_quad_review` (Check 8) — both checks read PR-context content, so they are sibling checks. Update `main()` to call the new function explicitly by name.

### What the check reads

The canonical source of `## Awaiting PR merge` content for **a PR being merged** is the PR's own copy of `docs/tasks/PROGRESS.md` at HEAD — not a separate PR-body section. The auto-merge flow runs the script against the working tree (which contains the merge commit's view of PROGRESS.md after the SA's Close-prep edit), and the script reads `PROGRESS_MD` (the existing variable, already set by `--fixture-dir` or default). There is no `--pr-body` parameter needed for this check — it operates on PROGRESS.md directly.

Rationale: the SA writes the `## Awaiting PR merge` entry into PROGRESS.md during Close-prep before raising the PR. The PR diff includes that PROGRESS.md edit. When the auto-merge mechanism is about to fire, the verifier reads the PR's tree (working tree of the merge commit) — same file the existing `check_progress_md_structure` reads.

### Parsing the entry

Each `## Awaiting PR merge` entry the SA writes has this rough shape (see PR #8 entry currently in `docs/tasks/PROGRESS.md` for a real example):

```
## Awaiting PR merge

- **PR #N — branch-name** (opened YYYY-MM-DD). [free-form prose summarizing the epic, listing tasks, etc.] Quad-review verdicts in PR body: SA APPROVE / RA APPROVE / SDET APPROVE / Overwatch APPROVE.
```

For epic-closing PRs the SA must include gate 5–8 verdicts inline. The exact shape is not yet codified in `agent-phases.md` § Close-prep — the SA's existing entry for PR #8 does not contain the four gate markers because PR #8 was a chore, not an epic-close. The first epic-closing PR (Epic 001 close) will be the first real test. This task should pick a parsing convention that works for the natural shape of an SA-authored entry; suggested shape (subject to SA discretion):

```
- **PR #N — branch-name** (opened YYYY-MM-DD). … Quality gates 5–8: Container Smoke PASS, RA Validation PASS, SDET CI PASS, SDET Quality Parity PASS. …
```

Or, for hotfix carve-out:

```
- **PR #N — branch-name** (opened YYYY-MM-DD). … Quality gates 5–8: Container Smoke PASS, RA Validation (deferred per hotfix urgency: TASK-EEE-NNN-backfill-ra-validation), SDET CI PASS, SDET Quality Parity (deferred per hotfix urgency: TASK-EEE-NNN-backfill-quality-parity). …
```

The implementer chooses the parser approach that matches an SA's natural Close-prep authoring. Suggested approach: for each gate (5/Container Smoke, 6/RA Validation, 7/SDET CI, 8/SDET Quality Parity), search the entry text for **either** `<gate-name>(\s*PASS|\s+passed)` **or** `<gate-name>\s*\(deferred per hotfix urgency:\s*<task-id>\)`. The exact gate name strings to search for must be locked down in this task — pick: `Container Smoke`, `RA Validation`, `SDET CI`, `SDET Quality Parity` (case-sensitive). If a future SA writes an entry with different wording, that SA's entry is responsible for matching the verifier's pattern (the verifier is the load-bearing artifact; SA discipline aligns to it).

### Task ID regex

Acceptable structured task ID forms (validated by the regex in the new check):

- `TASK-[A-Z][A-Z0-9]*-\d{3,}` — covers `TASK-LOE-001` through `TASK-LOE-999`, plus future `TASK-001-001`-style tasks (where `001` is the epic number; the first segment is treated as alphanumeric so that both alphabetic prefixes like `LOE` and numeric prefixes like `001` work).
- `BUG-[A-Z0-9][A-Z0-9]*-\d{3,}` — same shape for bug fixes (`BUG-000-001`, `BUG-EEE-NNN`, etc.).
- The literal placeholder `TASK-XXX` (uppercase `X`) is **explicitly rejected** by the regex. This is the placeholder used in rule text to mean "a real task ID"; finding it in actual PROGRESS.md content is a sign of an unfilled template. The "just-because" bypass surface SDET flagged is exactly this — a freeform `TASK-XXX` annotation lets a non-hotfix SA satisfy the check without committing to a real follow-up task.

### When `## Awaiting PR merge` is empty (or `_None._`)

Skip the check (`pass` with reason "no PR entries to check"). The check applies only when an epic-closing or hotfix-closing PR is in limbo and the script is being run as the auto-merge precondition verifier.

### Why this is `Introduces-gate: yes`

The check is a new SDET review-focus reject-on-fail criterion: when an epic-closing PR is in `## Awaiting PR merge`, the SDET runs `bash scripts/validate-gates.sh` as part of pre-merge verification, and the check failing rejects the merge. This is exactly the "SDET review-focus bullets that introduce a new reject-on-fail criterion" item enumerated in `.claude/agent-stack.md` § Gate Authoring Rules § Scope. The red-then-green local-execution evidence form per § In-flight regression exception applies — fixtures provide the red (`awaiting-merge-missing-marker` and `awaiting-merge-hotfix-deferred-malformed` exit non-zero), the all-pass and hotfix-deferred-valid fixtures provide the green.

## Definition of Done

- [ ] `scripts/validate-gates.sh` contains `check_pr_awaiting_merge_gate_verdicts` function, called by name from `main()`.
- [ ] All 4 (or 5, if `awaiting-merge-empty` added) new fixtures present with expected exit codes.
- [ ] All existing fixtures continue to produce their existing exit codes — no regressions.
- [ ] Real-repo `bash scripts/validate-gates.sh` exits 0 (current state with PR #8 in `## Awaiting PR merge` is preserved or correctly evaluated as the implementer chose; the choice is documented in the Work Log).
- [ ] Gate Authoring Rules evidence in Work Log per § SDET Review focus areas (red-then-green local-execution form, named code path, counterfactual).
- [ ] No regression in `--pr-body` mode operation (existing `pr-body-workflow-missing-verdict` and `pr-body-non-workflow-ok` fixtures still produce expected exit codes).

---

## Work Log

<!-- Format: - YYYY-MM-DD [role] What was done | What's next | Blockers -->

## Attempt Log

**Attempt count**: 0

## SDET Review

**Decision**: pending
**Notes**:
