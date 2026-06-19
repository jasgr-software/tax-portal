# TASK-008-002: Portal completion triggers — invoke the completion seam from the two completing onboarding actions

**Brief**: BRIEF-008
**Status**: backlog
**Assigned to**: webapp-developer
**Updated-by**: —
**Depends on**: TASK-008-001
**Impl**: developer
**E2e-required**: no
**Started-at**: —
**Completed-at**: —
**Complexity-estimate**: —
**Complexity-actual**: —

**Acceptance criteria:** AC-ONBD-006-01, AC-ONBD-006-02, AC-ONBD-007-01
**Upstream refs:** REQ-ONBD-006, REQ-ONBD-007; ADR-003, ADR-006
**Introduces-gate:** no

<!-- Brief-type: feature · Brief-deploys: no -->

---

## Quality Gates

- [ ] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [ ] **Submission gate** — lint + type-check + build + brief-mandated tests pass (commands in CLAUDE.md)
- [N/A] **Targeted e2e** — the full e2e path is TASK-008-004; this task's behavior is covered by portal integration/unit tests
- [ ] **Security review** — the completing actions still server-resolve the engagement (no client-supplied id); the EPIC-005 letter gate is not weakened; completion processing does not leak across engagements
- [ ] **SDET Review** — approved

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

- [ ] `submitQuestionnaireAction` success → calls `processOnboardingCompletion(engagement.id)` — **AC-ONBD-006-01/-007-01 (path)**
- [ ] `completeUploadAction` success → calls `processOnboardingCompletion(engagement.id)` — **AC-ONBD-006-01/-007-01 (path)**
- [ ] a thrown error from `processOnboardingCompletion` is caught/logged and the action still returns its
      success result (error containment, D5)
- [ ] letter-sign action does NOT call `processOnboardingCompletion` (scope discipline; steps 2/3 still pending)

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

- [ ] Both completing actions invoke `processOnboardingCompletion(engagement.id)` after success
- [ ] Letter-sign action unchanged (no completion call)
- [ ] Error containment verified
- [ ] Lint + type-check + build pass; portal unit/integration tests pass

---

## Work Log

## Attempt Log

**Attempt count**: 0

## SDET Review

**Decision**: pending
**Notes**:
