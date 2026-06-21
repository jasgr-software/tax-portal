---
brief: BRIEF-008
status: done
assigned_to: webapp-developer
updated_by: webapp-developer (2026-06-19)
depends_on: TASK-008-001 (done — `bac39eb`)
impl: developer
e2e_required: no
started_at: 2026-06-19T22:09:59Z
completed_at: 2026-06-19T17:17:00Z
complexity_estimate: "2"
complexity_actual: "1"
introduces_gate: no
acceptance_criteria: [AC-ONBD-006-01, AC-ONBD-006-02, AC-ONBD-007-01]
upstream_refs: REQ-ONBD-006, REQ-ONBD-007; ADR-003, ADR-006
---

# TASK-008-002: Portal completion triggers — invoke the completion seam from the two completing onboarding actions

---

## Quality Gates

- [x] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [x] **Submission gate** — lint + type-check + build + brief-mandated tests pass (commands in CLAUDE.md)
- [N/A] **Targeted e2e** — the full e2e path is TASK-008-004; this task's behavior is covered by portal integration/unit tests
- [x] **Security review** — the completing actions still server-resolve the engagement (no client-supplied id); the EPIC-005 letter gate is not weakened; completion processing does not leak across engagements
- [x] **SDET Review** — approved

## SDET Review focus areas

- **Trigger correctness (D5):** `processOnboardingCompletion(engagement.id)` is invoked from
  `submitQuestionnaireAction` AND `completeUploadAction` (the two actions that can be the *completing* step),
  using the **server-resolved** `engagement.id` — never a client-supplied id. It is NOT invoked from
  letter-sign (steps 2/3 are still pending after the letter).
- **Non-regression:** each action's existing success/refusal behavior, revalidation, and the EPIC-005 letter
  hard gate are preserved. The completion call is additive, after the step's own commit.
- **Error containment (D5):** a failure inside completion processing is logged and does NOT roll back or fail
  the step's own already-committed success (the TASK-008-001 fire-once guard makes a later retry idempotent).
  Verify the action still returns its success result if completion processing throws.
- **ADR-003:** the completion call runs server-side (the action is a Next server action); no client identity is
  trusted.

## Context

The engine (TASK-008-001) must be triggered when onboarding can become complete. The letter is always the
first step, so the *completing* step is always either the questionnaire submit or the document-upload complete.
This task wires `processOnboardingCompletion` into exactly those two portal actions (AC-ONBD-006-01/-02 path,
AC-ONBD-007-01 path). The fire-once guard (TASK-008-001 D2) makes double-invocation safe.

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `apps/portal/src/app/onboarding/actions.ts` | Modify | After success in `submitQuestionnaireAction` and `completeUploadAction`, call `processOnboardingCompletion(engagement.id)` (best-effort; log on error; do not fail the step) |
| `apps/portal/src/app/onboarding/actions.test.ts` | Modify | Assert each completing action invokes the completion seam with the server-resolved engagement id; assert a thrown completion error does not fail the step's success |

## Tests to Write First

- [x] `submitQuestionnaireAction` success → calls `processOnboardingCompletion(engagement.id)` — **AC-ONBD-006-01/-007-01 (path)**
- [x] `completeUploadAction` success → calls `processOnboardingCompletion(engagement.id)` — **AC-ONBD-006-01/-007-01 (path)**
- [x] a thrown error from `processOnboardingCompletion` is caught/logged and the action still returns its
      success result (error containment, D5)
- [x] letter-sign action does NOT call `processOnboardingCompletion` (scope discipline; steps 2/3 still pending)

## Implementation Notes

- Import `processOnboardingCompletion` from `@tax-portal/db`. Call it with the **already server-resolved**
  `engagement.id` (both actions already resolve the engagement server-side — reuse that, do not re-accept a
  client id).
- Wrap the call in try/catch; on error, log server-side (no client leak) and continue to return the existing
  success result. Add a `// DECISION:` noting the best-effort-after-commit rationale + the fire-once retry
  safety.
- Do not change the EPIC-005 letter gate, the questionnaire submit logic, or the upload pipeline — purely
  additive.

## Definition of Done

- [x] Both completing actions invoke `processOnboardingCompletion(engagement.id)` after success
- [x] Letter-sign action unchanged (no completion call)
- [x] Error containment verified
- [x] Lint + type-check + build pass; portal unit/integration tests pass

---

## Work Log

**2026-06-19T22:09:59Z** — Status → in-progress. Starting implementation (TDD): write tests first in actions.test.ts, then wire processOnboardingCompletion into submitQuestionnaireAction and completeUploadAction. Complexity-estimate: 2 (additive trigger-wiring only, no new DB layer). Next: add mocks + tests, then implement.

**2026-06-19T22:22:00Z** — Status → review. Implementation complete.
- TDD: wrote 4 failing tests first (3 failed, 1 passed immediately for scope discipline); then implemented.
- Added `processOnboardingCompletion` import from `@tax-portal/db` to `actions.ts`.
- Wired call into `submitQuestionnaireAction` (after revalidatePath, inside try/catch, DECISION comment) — AC-ONBD-006-01 / AC-ONBD-007-01 path.
- Wired call into `completeUploadAction` (after revalidatePath, inside try/catch, DECISION comment) — AC-ONBD-006-01 / AC-ONBD-007-01 path.
- `signEngagementLetterAction` left unchanged (scope discipline).
- All 55 targeted tests pass; all 172 portal tests pass; lint and type-check zero errors.
- Gate results: `pnpm lint` clean; `pnpm type-check` clean; `pnpm --filter portal test` 172/172 passed.
- Complexity-actual: 1 (additive wiring only — import + two try/catch blocks + tests).

## Attempt Log

**Attempt count**: 0

## SDET Review

**Decision**: approved
**Notes**: All four binding focus areas confirmed clean. (1) Server-resolved id: both `submitQuestionnaireAction` (L614) and `completeUploadAction` (L1105) pass `engagement.id` — the object resolved via `withRequestContext` + `getMyEngagement()`, never a client-supplied value — satisfying ADR-003. (2) Best-effort containment (D5): each call is inside `try/catch` placed strictly after `revalidatePath` and the action's own success return path; the D5 containment test forces a real `mockRejectedValue` throw and asserts the action still returns `success: true`, with the `console.error` output confirming the catch fired — this is a real counterfactual, not a smoke screen. (3) Scope discipline: `signEngagementLetterAction` has zero calls to `processOnboardingCompletion`; `packages/db` is untouched (confirmed by `git diff`); the EPIC-005 letter gate and questionnaire/upload pipeline internals are unchanged. (4) AC-path test tags: all four required tests present in `describe("TASK-008-002 — completion trigger wiring")` with `toHaveBeenCalledWith(ENGAGEMENT_ID)` assertions on the server-resolved id constant in both success-path tests. Metadata contract: `Complexity-actual: 1` valid; `Completed-at` correctly blank until this close. Independent gate evidence: `pnpm lint` clean; `pnpm type-check` clean; targeted 55/55 PASS; full portal 172/172 PASS, zero regressions.

**SDET breadcrumb (2026-06-19T17:17:00Z):** Approved. Lint clean, type-check clean, 55/55 targeted, 172/172 full portal. Server-resolved id confirmed on both trigger paths; D5 containment test forces real throw and asserts success unchanged; `signEngagementLetterAction` scope-discipline test confirms no call. Diff: only `actions.ts` + `actions.test.ts` (application files) plus task/PROGRESS — zero `packages/` changes.
