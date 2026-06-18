# TASK-006-005: Submit action (record answers + satisfy step) + onboarding read-model extension (tier-3)

**Brief**: BRIEF-006
**Status**: backlog
**Assigned to**: webapp-developer
**Depends on**: TASK-006-001, TASK-006-003, TASK-006-004
**Impl**: developer
**E2e-required**: no <!-- e2e consolidated in TASK-006-006; server-side behavior proven at tier-3 here -->
**Updated-by**: —
**Started-at**: —
**Completed-at**: —
**Complexity-estimate**: —
**Complexity-actual**: —

**Acceptance criteria:** AC-ONBD-003-03 (step satisfied only on submit — server-side), AC-ONBD-003-04 (answers recorded against the engagement), AC-ONBD-003-01 (submit only against the resolved correct template)
**Upstream refs:** ADR-003 (+Amendment 1), ADR-005, ADR-012, REQ-ONBD-003
**Introduces-gate:** no

**Brief-type:** feature
**Brief-deploys:** no

---

## Quality Gates

- [ ] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [ ] **Submission gate** — lint + type-check + build + brief-mandated tests pass (commands in CLAUDE.md)
- [N/A] **Targeted e2e** — N/A (consolidated in TASK-006-006; tier-3 here)
- [ ] **Security review** — owner-only BLOCK-governed write; gate honored; no satisfaction without submit
- [ ] **SDET Review** — approved

## SDET Review focus areas

- **Server-side satisfaction (AC-ONBD-003-03)** — the questionnaire step must become satisfied ONLY on a successful submit, evaluated in the EPIC-005 read model (`packages/db/src/onboarding.ts`), NOT merely reflected in the UI. Verify the read model's `intake-questionnaire` step `done` flag derives from `Engagement.questionnaireSubmittedAt` (DECISION-I). A viewing-but-not-submitted client → step NOT satisfied.
- **Owner-only BLOCK-governed write (ADR-005)** — the submit write runs under the CLIENT principal via the request pool, BLOCK-governed (mirror `recordLetterSignatureAsClient`). A non-owner / null-SESSION_CONTEXT write → `rowsAffected = 0` → refusal, no recording, no satisfaction. Verify fail-closed.
- **Gate honored (brief constraint)** — submit must be refused server-side when the letter is unsigned (`checkStepAccessibility(engagement, 'intake-questionnaire')` returns a refusal). The questionnaire step stays unreachable until the EPIC-005 letter gate is passed; this task does NOT weaken it.
- **Recorded against the engagement (AC-ONBD-003-04)** — answers row written with the right `engagementId` + `templateId`; `questionnaireSubmittedAt` set on the engagement in the same logical submit.
- **ADR-003 Amendment 1** — no `@read_only` reintroduced.

## Context

The behavioral heart of the slice: on submit, the client's answers are recorded against the engagement (AC-ONBD-003-04) and ONLY THEN is the questionnaire step satisfied (AC-ONBD-003-03), evaluated server-side in the EPIC-005 read model. This task wires the submit action + extends `packages/db/src/onboarding.ts` so `resolveOnboarding` derives the `intake-questionnaire` step's `done` from `questionnaireSubmittedAt`.

## Design contract (binding)

### Read-model extension (`packages/db/src/onboarding.ts`)
- `resolveOnboarding(engagement)` currently hard-codes the `intake-questionnaire` step `done: false` (EPIC-005 comment: "EPIC-006 owns the done flag for this step"). Change it to `done: engagement.questionnaireSubmittedAt != null`.
- This requires `questionnaireSubmittedAt` on the `EngagementItem` type + `mapRow` (TASK-006-001 added the column; ensure the repository selects + maps it). The `intake-questionnaire` step's `accessible` is UNCHANGED (still gated by `letterSignedAt`, EPIC-005). Update `currentStep`/`remaining` derivation naturally follows from the existing first-non-done logic.
- Preserve EPIC-005 behavior: `document-upload` step `done` stays `false` (EPIC-007 owns it).

### Submit primitive (`packages/db` — from TASK-006-001 `submitQuestionnaireAsClient`)
- Request pool, BLOCK-governed, in-batch SESSION_CONTEXT (mirror `recordLetterSignatureAsClient`). In one logical operation: INSERT/UPSERT the `QuestionnaireAnswer` row (engagementId, templateId, answers JSON) AND set `Engagement.questionnaireSubmittedAt = SYSDATETIMEOFFSET()`. Both must be governed by the BLOCK predicate (the answer-row policy + the engagement policy) so a non-owner is denied. Returns `{ rowsAffected }`; `0` = denied.
  - Coordinate the two writes so a non-owner cannot set `questionnaireSubmittedAt` without an owned answer row. Document the coordination as a `// DECISION:` (analogous to the EPIC-005 two-pool note).

### Submit action (`apps/portal/src/app/onboarding/actions.ts`)
- `submitQuestionnaireAction(answers)` (`"use server"`):
  1. `getClientIdentity()` → must be CLIENT.
  2. Resolve the engagement + its correct template via `getMyQuestionnaire()` (TASK-006-003) under `withRequestContext(CLIENT)`.
  3. **Gate check:** `checkStepAccessibility(engagement, 'intake-questionnaire')` — if refused (letter unsigned), return refusal, no write.
  4. Validate `answers` against the resolved template's required questions (server-side — the client cannot submit against a template they didn't resolve; the templateId is server-derived, not client-supplied).
  5. `submitQuestionnaireAsClient({ engagementId, templateId, answers, clerkUserId, role: 'CLIENT' })`. `rowsAffected = 0` → refusal (not the owner), no satisfaction.
  6. (Optional, consistent with EPIC-005) audit the submission via `recordAuthEvent('engagement.questionnaire_submitted')` AFTER the owner-confirmed write — fail-closed, no audit for a non-event.
  7. `revalidatePath('/onboarding')`; return the updated read model.
- Also add the no-arg `getMyQuestionnaireAction()` the portal page (TASK-006-004) consumes: returns the resolved template + `alreadySubmitted` + `existingAnswers` for the owning client.

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `packages/db/src/onboarding.ts` | Modify | Derive `intake-questionnaire` step `done` from `questionnaireSubmittedAt` |
| `packages/db/src/repositories/engagement.ts` | Modify | Add `questionnaireSubmittedAt` to `EngagementItem` + `mapRow` + the SELECT column list |
| `packages/db/src/repositories/questionnaire-answer.ts` | Modify | Finalize `submitQuestionnaireAsClient` (answer row + `questionnaireSubmittedAt` set, BLOCK-governed) |
| `apps/portal/src/app/onboarding/actions.ts` | Modify | Add `getMyQuestionnaireAction` + `submitQuestionnaireAction` (gate-checked, owner-only) |
| `packages/db/src/onboarding-questionnaire.rls.test.ts` | Create | Tier-3: satisfaction only after submit; owner-only write; gate refusal when unsigned |
| `apps/portal/src/app/onboarding/actions.test.ts` | Modify | Unit: submit action gate check, refusal on non-owner, satisfaction reflected |

## Tests to Write First

- [ ] `[AC-ONBD-003-03] step is NOT satisfied while letterSigned but questionnaire not submitted` — expected: `done: false`
- [ ] `[AC-ONBD-003-03] step becomes satisfied after a successful submit` — expected: `done: true` after `questionnaireSubmittedAt` set
- [ ] `[AC-ONBD-003-04] submit records the answer row against the engagement` — expected: row present with engagementId+templateId+answers
- [ ] `[ADR-005] non-owner submit → rowsAffected=0, no recording, no satisfaction` — expected: refused, column unchanged
- [ ] `[gate honored] submit refused when letter unsigned` — expected: StepRefusal, no write

## Implementation Notes

- Mirror `recordLetterSignatureAsClient` (request pool + in-batch SESSION_CONTEXT + BLOCK) for `submitQuestionnaireAsClient`, and `signEngagementLetterAction` for the action structure (identity → load under FILTER → gate check → owner-only write → audit → revalidate → return read model).
- The read-model change is small but load-bearing — keep the EPIC-005 `accessible` derivation untouched; only the `done` flag for `intake-questionnaire` changes.

## Definition of Done

- [ ] Read model satisfies the questionnaire step only when `questionnaireSubmittedAt` is set
- [ ] Submit records answers against the engagement, owner-only (BLOCK-governed), gate-honored
- [ ] Tier-3 + unit tests pass against the real container DB; lint + type-check + build pass

---

## Work Log

## Attempt Log

**Attempt count**: 0

## SDET Review

**Decision**: pending
**Notes**:
