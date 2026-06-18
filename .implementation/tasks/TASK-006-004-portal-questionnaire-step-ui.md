# TASK-006-004: Portal questionnaire step UI (render correct template behind the letter gate)

**Brief**: BRIEF-006
**Status**: backlog
**Assigned to**: webapp-developer
**Depends on**: TASK-006-003
**Impl**: developer
**E2e-required**: no <!-- portal questionnaire e2e consolidated in TASK-006-006 -->
**Updated-by**: —
**Started-at**: —
**Completed-at**: —
**Complexity-estimate**: —
**Complexity-actual**: —

**Acceptance criteria:** AC-ONBD-003-01 (UI: correct questionnaire shown), AC-ONBD-003-03 (UI: step not satisfied until submit — renders unsatisfied/submitted affordance)
**Upstream refs:** ADR-006, ADR-001, ADR-005, REQ-ONBD-003
**Introduces-gate:** no

**Brief-type:** feature
**Brief-deploys:** no

---

## Quality Gates

- [ ] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [ ] **Submission gate** — lint + type-check + build + brief-mandated tests pass (commands in CLAUDE.md)
- [N/A] **Targeted e2e** — N/A (consolidated in TASK-006-006)
- [ ] **Security review** — gate not weakened; no client-derived gate logic; question content escaped
- [ ] **SDET Review** — approved

## SDET Review focus areas

- **Behind the EPIC-005 letter gate (brief constraint)** — the questionnaire step renders only when accessible (`letterSignedAt != null`). Verify the component consumes the EPIC-005 read model's `accessible`/`done` for the `intake-questionnaire` step and does NOT re-derive gate logic in the client. A letter-unsigned engagement must show the step locked/refused, not the questionnaire form.
- **No client-supplied ids (ADR-001/ADR-005)** — the page resolves the questionnaire via the no-arg `getMyQuestionnaire()` (TASK-006-003); the client never passes serviceId/templateId/engagementId.
- **Question content rendering** — accountant-authored prompts auto-escaped (no `dangerouslySetInnerHTML`).
- **Cross-surface fence (ADR-006)** — questionnaire completion is `apps/portal` only.

## Context

AC-ONBD-003-01 (UI surface) + AC-ONBD-003-03 (UI affordance): within the existing onboarding sequence (`apps/portal/src/app/onboarding/`), the client at step 2 — having passed the letter gate — is shown the questionnaire bound to their engagement's service type, can fill it, and sees that the step is unsatisfied until they submit (the submit wiring is TASK-006-005; this task renders the form + state). Mirror the EPIC-005 `LetterSignStep.tsx` / `OnboardingSequence.tsx` patterns.

## Design contract (binding)

- **Component:** `apps/portal/src/app/onboarding/_components/QuestionnaireStep.tsx` — rendered by `OnboardingSequence.tsx` when the active step is `intake-questionnaire` and it is `accessible`.
- **Data:** consume a no-arg `getMyQuestionnaireAction()` (TASK-006-005 wires the action; this task may stub/coordinate) returning `{ template, serviceName, alreadySubmitted, existingAnswers }`. Render each `QuestionDef` as a labeled input (`text` → input, `textarea` → textarea); mark required fields.
- **Gate honor:** read the EPIC-005 `OnboardingReadModel` step state. If the `intake-questionnaire` step is `accessible: false` (letter unsigned), render the locked affordance (reuse the EPIC-005 locked-step presentation) — do NOT render the form. This task must NOT weaken the EPIC-005 gate.
- **Submit-state affordance (AC-ONBD-003-03 UI):** before submit → "not yet submitted" + an enabled Submit button (when all required answered); after submit → a satisfied/read-only state. The authoritative satisfaction is server-side (TASK-006-005); the UI reflects it.
- **Absent template:** if `template: null` (no questionnaire authored for the service type yet), render an "awaiting questionnaire" empty state — not a broken form, not a crash.
- **`data-*` hooks** for e2e/demo: `data-step="intake-questionnaire"`, `data-question-id`, `data-questionnaire-submitted`, `data-testid="questionnaire-form"`, submit button.

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `apps/portal/src/app/onboarding/_components/QuestionnaireStep.tsx` | Create | Client component — renders the resolved template's questions + submit affordance |
| `apps/portal/src/app/onboarding/_components/OnboardingSequence.tsx` | Modify | Wire the questionnaire step component into the sequence at the `intake-questionnaire` slot (behind the gate) |
| `apps/portal/src/app/onboarding/questionnaire-step.test.tsx` | Create | Component test — renders questions, locked state when unsigned, submitted state, empty state |

## Tests to Write First

- [ ] `[AC-ONBD-003-01] renders the questions of the resolved template` — expected: each QuestionDef rendered
- [ ] `[AC-ONBD-003-03] step shows unsatisfied before submit` — expected: not-submitted affordance + Submit enabled when complete
- [ ] `[AC-ONBD-002-01 honored] questionnaire form NOT rendered when letter unsigned (step locked)` — expected: locked affordance, no form
- [ ] `[edge] absent template → awaiting-questionnaire empty state` — expected: empty state, no crash

## Implementation Notes

- Mirror `LetterSignStep.tsx` (the EPIC-005 step component) for structure + locked-state handling, and `OnboardingSequence.tsx` for the slot wiring. Do NOT re-derive gate logic — consume the read model.
- The submit action is owned by TASK-006-005 (`submitQuestionnaireAction`); coordinate the import. This task renders the form and calls the action; TASK-006-005 implements its server-side satisfaction + recording.

## Definition of Done

- [ ] Questionnaire step renders the resolved template behind the letter gate
- [ ] Locked/empty/submitted states correct
- [ ] No client-derived gate logic; no client-supplied ids
- [ ] Component tests pass; `pnpm --filter portal test` green; lint + type-check + build pass

---

## Work Log

## Attempt Log

**Attempt count**: 0

## SDET Review

**Decision**: pending
**Notes**:
