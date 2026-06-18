# TASK-006-004: Portal questionnaire step UI (render correct template behind the letter gate)

**Brief**: BRIEF-006
**Status**: done
**Assigned to**: webapp-developer
**Depends on**: TASK-006-003
**Impl**: developer
**E2e-required**: no <!-- portal questionnaire e2e consolidated in TASK-006-006 -->
**Updated-by**: webapp-developer
**Started-at**: 2026-06-18T20:27:00Z
**Completed-at**: 2026-06-18T20:38:52Z
**Complexity-estimate**: 3
**Complexity-actual**: 3

**Acceptance criteria:** AC-ONBD-003-01 (UI: correct questionnaire shown), AC-ONBD-003-03 (UI: step not satisfied until submit — renders unsatisfied/submitted affordance)
**Upstream refs:** ADR-006, ADR-001, ADR-005, REQ-ONBD-003
**Introduces-gate:** no

**Brief-type:** feature
**Brief-deploys:** no

---

## Quality Gates

- [x] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [x] **Submission gate** — lint + type-check + build + brief-mandated tests pass (commands in CLAUDE.md)
- [N/A] **Targeted e2e** — N/A (consolidated in TASK-006-006)
- [x] **Security review** — gate not weakened; no client-derived gate logic; question content escaped
- [x] **SDET Review** — approved

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

- [x] `[AC-ONBD-003-01] renders the questions of the resolved template` — expected: each QuestionDef rendered
- [x] `[AC-ONBD-003-03] step shows unsatisfied before submit` — expected: not-submitted affordance + Submit enabled when complete
- [x] `[AC-ONBD-002-01 honored] questionnaire form NOT rendered when letter unsigned (step locked)` — expected: locked affordance, no form
- [x] `[edge] absent template → awaiting-questionnaire empty state` — expected: empty state, no crash

## Implementation Notes

- Mirror `LetterSignStep.tsx` (the EPIC-005 step component) for structure + locked-state handling, and `OnboardingSequence.tsx` for the slot wiring. Do NOT re-derive gate logic — consume the read model.
- The submit action is owned by TASK-006-005 (`submitQuestionnaireAction`); coordinate the import. This task renders the form and calls the action; TASK-006-005 implements its server-side satisfaction + recording.

## Definition of Done

- [x] Questionnaire step renders the resolved template behind the letter gate
- [x] Locked/empty/submitted states correct
- [x] No client-derived gate logic; no client-supplied ids
- [x] Component tests pass; `pnpm --filter portal test` green; lint + type-check + build pass

---

## Work Log

### 2026-06-18 [webapp-developer] Starting implementation — QuestionnaireStep.tsx + OnboardingSequence.tsx wiring + tests
**What was done:** Dispatch checkpoint recorded. Surveyed LetterSignStep.tsx, OnboardingSequence.tsx, actions.ts, packages/db questionnaire-template.ts and questionnaire-answer.ts. Confirmed QuestionDef, QuestionnaireForEngagement, getMyQuestionnaire all exported from @tax-portal/db. Identified action-seam design: thin wrapper getMyQuestionnaireAction() in actions.ts (calls getMyQuestionnaire() via withRequestContext) + typed stub submitQuestionnaireAction (TASK-006-005 fills body).
**What's next:** Write tests first (TDD: required), then QuestionnaireStep.tsx, update actions.ts seam, wire OnboardingSequence.tsx.
**Blockers:** none

### 2026-06-18 [webapp-developer] Implementation complete — marking review
**What was done:**
- Created `apps/portal/src/app/onboarding/questionnaire-step.test.tsx` — 27 tests (TDD-first), all pass
- Created `apps/portal/src/app/onboarding/_components/QuestionnaireStep.tsx` — 4-state component
- Modified `apps/portal/src/app/onboarding/actions.ts` — added getMyQuestionnaireAction() seam + submitQuestionnaireAction stub + GetMyQuestionnaireResult/SubmitQuestionnaireResult types
- Modified `apps/portal/src/app/onboarding/_components/OnboardingSequence.tsx` — extended props (questionnaire, alreadySubmitted, existingAnswers), wired QuestionnaireStep in intake-questionnaire slot
- Modified `apps/portal/src/app/onboarding/page.tsx` — parallel fetch getMyOnboardingAction + getMyQuestionnaireAction; questionnaire data non-blocking
- Modified `apps/portal/src/app/onboarding/onboarding-sequence.test.tsx` — added new required props to all existing OnboardingSequence renders (questionnaire=null, alreadySubmitted=false, existingAnswers=null)

**TASK-006-005 seam decision:** `submitQuestionnaireAction(answersJson: string)` is the stub; TASK-006-005 replaces the body entirely. `getMyQuestionnaireAction()` is a thin wrapper around `getMyQuestionnaire()` via `withRequestContext`; TASK-006-005 adds alreadySubmitted + existingAnswers from `getMyQuestionnaireAnswer()`.

**Gate results:**
- `pnpm --filter portal test`: 102 tests passed (8 files), 0 failures
- `pnpm lint`: 0 errors, 0 warnings
- `pnpm type-check`: 0 errors
- `pnpm --filter portal build`: exit 0, /onboarding at 2.63 kB

**What's next:** SDET review. TASK-006-005 implements submitQuestionnaireAction body + extends getMyQuestionnaireAction with alreadySubmitted/existingAnswers.
**Blockers:** none

### 2026-06-18 [sdet] APPROVED — TASK-006-004
Independent re-run: `pnpm --filter portal test -- questionnaire-step.test.tsx` → 27/27 PASS; full suite 102/102 PASS. `pnpm lint` → 0 errors/warnings. `pnpm type-check` → 0 errors. All mandatory focus areas verified: EPIC-005 gate not weakened (accessible consumed from read model, not re-derived); no client-supplied ids (no-arg getMyQuestionnaire via withRequestContext); no dangerouslySetInnerHTML; ADR-006 fence clean (zero questionnaire completion code in apps/admin); stub clearly marked with DECISION comments; all 4 states + all data-* hooks present and tested. Status: done. `Completed-at: 2026-06-18T20:38:52Z`.

## Attempt Log

**Attempt count**: 0

## SDET Review

**Decision**: approved
**Notes**: All mandatory rejection checks passed. Pre-implementation dispatch-checkpoint entry present (real clock `Started-at: 2026-06-18T20:27:00Z`). `Complexity-actual: 3` (∈ 1–5). All required task-spec fields present. Gate evidence independently verified: `pnpm --filter portal test` → 27/27 questionnaire-step tests live, 102/102 full suite; `pnpm lint` → 0 errors/warnings; `pnpm type-check` → 0 errors. Tool hygiene: no violations in Work Log.

EPIC-005 gate not weakened: `QuestionnaireStep.tsx` consumes `stepState.accessible` from the `OnboardingReadModel` and never re-derives it. When `accessible: false`, QuestionnaireLockedState is rendered immediately — confirmed by the `[security] gate NOT weakened` test (accessible=false + template present → locked, no form). ADR-001/ADR-005: `getMyQuestionnaireAction()` is a thin no-arg wrapper around `getMyQuestionnaire()` via `withRequestContext`; `submitQuestionnaireAction(answersJson)` takes only the answers blob (no client-supplied ids). No `dangerouslySetInnerHTML` anywhere in the new or modified files — question prompts rendered as auto-escaped JSX text nodes; XSS test confirms `<script>` prompt appears as text. ADR-006 fence: `apps/admin/src` has zero references to `QuestionnaireStep`, `getMyQuestionnaire`, or `submitQuestionnaire`; portal completion files confined to `apps/portal/src/app/onboarding/`. All four required states present and tested: locked (accessible:false), awaiting (template:null), submitted (read-only), active form. All `data-*` hooks verified: `data-step="intake-questionnaire"`, `data-question-id`, `data-questionnaire-submitted`, `data-testid="questionnaire-form"`, `data-testid="questionnaire-submit-button"`. TASK-006-005 seam is clearly documented with `// DECISION (TASK-006-004/005)` coordination comments; stub returns an explicit not-yet-implemented error rather than silently mis-wiring. Gherkin prose-bind: behavior of all 4 states matches the brief's scenario contract for AC-ONBD-003-01 and AC-ONBD-003-03.

Carry-forward note for TASK-006-005 (from TASK-006-001 SDET review): in `submitQuestionnaireAsClient` (`packages/db/src/repositories/questionnaire-answer.ts`), `SELECT @@ROWCOUNT` follows the `UPDATE [Engagement]` so it captures the UPDATE rowcount, not the INSERT's. Functionally correct for v1 (deny-case both 0, success-case both 1; mirrors `recordLetterSignatureAsClient`) — but glance at it when TASK-006-005 wires the production submit action.
