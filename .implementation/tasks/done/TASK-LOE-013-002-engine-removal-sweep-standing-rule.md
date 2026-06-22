---
brief: BRIEF-LOE-013
status: done
assigned_to: devops
updated_by: sdet
depends_on: TASK-LOE-013-001
impl: developer
e2e_required: "no"
started_at: 2026-06-22T17:26:11.232Z
completed_at: 2026-06-22T17:29:48.476Z
complexity_estimate: 1
complexity_actual: 1
brief_type: quality
brief_deploys: "no"
introduces_gate: "no"
acceptance_criteria: [AC-LOE-013-06]
upstream_refs: none
code_standards: CS-GEN-003 (recommended)
reviewer: sdet
---

# TASK-LOE-013-002: Document the removal-sweep standing rule in ENGINE.md (closes retro-012-017)

---

## Quality Gates

- [x] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [N/A] **Submission gate** — documentation-only change to `.implementation/ENGINE.md` (a quad-review workflow file); no lint/type-check/build/test applies. The consistency check is: the rule references the gate name exactly as TASK-LOE-013-001 implemented it (`check_removed_artifact_orphans`) and the allowlist file path.
- [N/A] **Targeted e2e** — documentation-only; no UI
- [N/A] **Security review** — documentation-only
- [x] **SDET Review** — approved

## SDET Review focus areas

- **Workflow-file change = quad review + user-LGTM merge gate (HARD).** This task edits `.implementation/ENGINE.md` — a quad-review workflow file (ENGINE § Main Session Rules). Per Autonomy Ceiling 3(c), the slice PR (which carries this edit) **MUST NOT auto-merge** without an explicit user `LGTM` comment. ALSO: because the PR now changes `.implementation/ENGINE.md`, `validate-gates.sh` check 8 (`check_pr_body_quad_review`) requires the PR body to carry all four verdict markers `[sa] [ra] [sdet] [overwatch]`. The SDET flags BOTH obligations at Close-prep so the PR is composed correctly and does not auto-merge.
- **Rule accuracy (no drift from TASK-001).** The standing rule must name the gate EXACTLY as implemented (`check_removed_artifact_orphans`, part of the existing `validate-gates.sh` CI run — no separate CI wiring) and cite the allowlist file (`.implementation/removal-sweep-allow.txt`) and the reason-mandatory rule. A rule that names a non-existent check or mis-states the allowlist contract is a rejection. Cross-check against the as-merged TASK-001 source.
- **Scope: cross-layer, not just the owning layer.** The rule must state that a removal task must re-point every executable consumer across EVERY layer (not just the owning layer's docs) — this is the precise lesson of retro-012-017 (the `.orchestration/` consumers were missed because the sweep was scoped to `.implementation/`). Verify the wording captures cross-layer scope.
- **closes retro-012-017.** The rule text (or its commit) should note it closes retro-012-017. Verify the retro item is dispositioned.
- **Model-behavior lens (workflow-file quad-review obligation).** Evaluate whether the new standing rule is load-bearing against a known failure mode (a removal task that forgets the cross-layer sweep) — the rule + the gate together must make the failure un-silent. Finding is advisory unless it demonstrates a concrete gate gap.

## Context

AC-LOE-013-06: the removal-sweep obligation must be documented as a STANDING RULE so future removal tasks are bound by it, not just protected by the gate. Isolated from TASK-LOE-013-001 because it is a workflow-file edit (`.implementation/ENGINE.md`) that triggers quad review + the user-LGTM merge gate (Autonomy Ceiling 3(c)) — keeping it separate from the gate-implementation task makes the workflow-file blast radius explicit and the merge-lane obligations unambiguous. Depends on TASK-LOE-013-001 (the rule references the check that -001 creates; -001 must be `done` first so the rule names the as-implemented check).

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `.implementation/ENGINE.md` | Modify | Add a standing rule (in § Bug Fixes neighborhood, or a dedicated § Removal Sweep, or extend the removal-task Definition-of-Done guidance) stating: any task REMOVING a shared artifact (a file) must (1) pass `check_removed_artifact_orphans` (part of the existing `validate-gates.sh` run — no separate CI wiring), (2) re-point every EXECUTABLE consumer across EVERY layer (not just the owning layer's docs), and (3) record any intentional retained executable reference in `.implementation/removal-sweep-allow.txt` with a mandatory reason. Note that doc-only (`.md`) references are allowed by rule. State it closes retro-012-017. |

## Tests to Write First

<!-- Documentation-only; no executable tests. The verification is a consistency cross-check against the as-implemented check name + allowlist contract from TASK-LOE-013-001. -->

- [x] (consistency check, not a unit test) the rule names `check_removed_artifact_orphans` and `.implementation/removal-sweep-allow.txt` exactly as TASK-001 implemented them
- [x] (consistency check) the rule states cross-layer executable re-pointing + reason-mandatory allowlist + doc-only-allowed

## Implementation Notes

- **Land in the SAME PR/branch as TASK-001 (one slice).** The split is task-level (clean review boundaries + DoD), not separate PRs. Both tasks ride `brief-LOE-013-removal-sweep-gate`.
- **Name the check exactly.** After TASK-001 is `done`, read the as-implemented check name and allowlist path from the merged source and use those verbatim — no drift.
- **Workflow-file merge obligations (flag at Close-prep, do not auto-merge).** This edit makes the slice PR a workflow-file PR: (a) quad review (IO + SDET + Overwatch, two lenses); (b) `check_pr_body_quad_review` requires `[sa] [ra] [sdet] [overwatch]` markers in the PR body; (c) user-LGTM gate before merge (Autonomy Ceiling 3(c)). The IO/SDET surface all three at Close-prep.
- **Cite authority (CS-GEN-003).** Reference retro-012-017 / BRIEF-LOE-013 in the rule text.

## Definition of Done

- [x] ENGINE.md carries the removal-sweep standing rule: pass `check_removed_artifact_orphans`; re-point cross-layer executable consumers; allowlist intentional retentions with a reason; doc-only allowed (AC-LOE-013-06)
- [x] The rule names the as-implemented check + allowlist file exactly (no drift from TASK-001)
- [x] The rule states it closes retro-012-017
- [x] SDET flagged the workflow-file quad-review + user-LGTM + PR-body-quad-marker obligations for Close-prep

---

## Work Log

<!-- Format: - YYYY-MM-DD [role] What was done | What's next | Blockers -->

- 2026-06-22 [sdet] Marking done — Approved: no drift from TASK-001 implementation — check name, check number (10), allowlist path, format, empty-reason-fail, and doc-only-allowed all match as-implemented source exactly. Cross-layer scope explicitly captured. Closes retro-012-017 stated. ENGINE.md-only scope confirmed. validate-gates.sh ALL CHECKS PASSED (check_removed_artifact_orphans SKIP — expected for doc-only). Workflow-file merge obligations flagged for Close-prep: quad review required, check_pr_body_quad_review requires [sa][ra][sdet][overwatch] markers in PR body, user-LGTM gate (Autonomy Ceiling 3c) — no auto-merge. | What's next: archive | Blockers: none
- 2026-06-22 [devops] Marking as review — Added § Removal Sweep standing rule to ENGINE.md after § Bug Fixes. Named check_removed_artifact_orphans + .implementation/removal-sweep-allow.txt exactly. States cross-layer scope, reason-mandatory, doc-only allowed. Closes retro-012-017. validate-gates.sh ALL CHECKS PASSED. Workflow-file edit: triggers quad review + check_pr_body_quad_review + user-LGTM gate (Autonomy Ceiling 3c) — flagged for IO/SDET at Close-prep. | What's next: SDET review | Blockers: none
- 2026-06-22 [devops] Starting implementation — task TASK-LOE-013-002 | What's next: implement and run gates | Blockers: none
## Attempt Log

**Attempt count**: 0

## SDET Review

**Decision**: approved

**Notes**:

No-drift cross-check passed on all dimensions:
- Check name `check_removed_artifact_orphans` — exact match to `scripts/validate-gates.sh` function (line 761) and heading (Check 10, line 694).
- Allowlist path `.implementation/removal-sweep-allow.txt` — exact match (validate-gates.sh line 829).
- Allowlist format `<removed-path> | <consumer-path> | <mandatory reason>` — exact match (validate-gates.sh line 749 comment, line 844 parse comment).
- Empty-reason-fails-gate rule — confirmed (validate-gates.sh lines 857–860, 868).
- Doc-only (`.md`) allowed by rule, no allowlist entry needed — confirmed (validate-gates.sh lines 875, 968–972).
- Cross-layer scope — ENGINE.md paragraph 2 explicitly names all repo layers (`.implementation/`, `.orchestration/`, `.planning/`, `apps/`, `packages/`, `scripts/`, `.github/`, etc.). Captures the retro-012-017 failure mode exactly.
- Closes retro-012-017 — stated in the rule body (ENGINE.md line 474).
- CS-GEN-003 tag present (`<!-- CS-GEN-003: retro-012-017 / BRIEF-LOE-013 -->`).
- Scope discipline — only `.implementation/ENGINE.md` changed by this task; `validate-gates.sh`, `validate-gates.test.ts`, `state.json` changes belong to TASK-LOE-013-001.
- `validate-gates.sh ALL CHECKS PASSED` — check_removed_artifact_orphans SKIP (no removed files in diff; expected for doc-only).

Workflow-file merge obligations flagged for Close-prep (HARD — do not auto-merge):
(a) Quad review required: `[sa] [ra] [sdet] [overwatch]` markers must appear in the PR body (check 8 `check_pr_body_quad_review`).
(b) User-LGTM gate required before merge (Autonomy Ceiling 3(c)) — no autonomous merge allowed.
(c) PR body must carry all four verdict markers or check 8 will fail the gate.

Both BRIEF-LOE-013 tasks (`TASK-LOE-013-001` and `TASK-LOE-013-002`) are now `done` — IO may proceed to Close-prep.
