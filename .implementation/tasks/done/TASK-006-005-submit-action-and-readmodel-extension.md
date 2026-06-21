---
brief: BRIEF-006
status: done
assigned_to: webapp-developer
updated_by: webapp-developer (2026-06-18T21:00:00Z)
depends_on: TASK-006-001, TASK-006-003, TASK-006-004
impl: developer
e2e_required: no
started_at: 2026-06-18T20:44:42Z
completed_at: 2026-06-18T22:15:00Z
complexity_estimate: "4"
complexity_actual: "4"
brief_type: feature
brief_deploys: no
introduces_gate: no
acceptance_criteria: [AC-ONBD-003-03 (step satisfied only on submit — server-side), AC-ONBD-003-04 (answers recorded against the engagement), AC-ONBD-003-01 (submit only against the resolved correct template)]
upstream_refs: ADR-003 (+Amendment 1), ADR-005, ADR-012, REQ-ONBD-003
---

# TASK-006-005: Submit action (record answers + satisfy step) + onboarding read-model extension (tier-3)

---

## Quality Gates

- [x] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [x] **Submission gate** — lint + type-check + build + brief-mandated tests pass (commands in CLAUDE.md)
- [N/A] **Targeted e2e** — N/A (consolidated in TASK-006-006; tier-3 here)
- [x] **Security review** — owner-only BLOCK-governed write; gate honored; no satisfaction without submit
- [x] **SDET Review** — approved

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

- [x] Read model satisfies the questionnaire step only when `questionnaireSubmittedAt` is set
- [x] Submit records answers against the engagement, owner-only (BLOCK-governed), gate-honored
- [x] Tier-3 + unit tests pass against the real container DB; lint + type-check + build pass

---

## Work Log

### 2026-06-18 [webapp-developer] Starting implementation — submit action + read-model extension + tier-3 tests | What's next: read existing files (onboarding.ts, engagement.ts, questionnaire-answer.ts, actions.ts) then write tests first per TDD mandate | Blockers: none

### 2026-06-18 [webapp-developer] Implementation complete — submitting for review

**What was done:**

1. **Read model (`packages/db/src/onboarding.ts`)** — Already complete from TASK-006-001. DECISION-I (`questionnaireDone = engagement.questionnaireSubmittedAt != null`) was already in place. `accessible` for `intake-questionnaire` is unchanged (still gated by `letterSignedAt`). `document-upload done: false` preserved (EPIC-007 owns it).

2. **`EngagementItem` type + `mapRow` + SELECT (`packages/db/src/repositories/engagement.ts`)** — Already complete from TASK-006-001. `questionnaireSubmittedAt` was already on the type, the internal row type, and `mapRow`.

3. **`submitQuestionnaireAsClient` (`packages/db/src/repositories/questionnaire-answer.ts`)** — Finalized with a critical fix: `sec.pol_QuestionnaireAnswer` uses **AFTER INSERT BLOCK** (not BEFORE UPDATE), which throws SQL error 33504 on denial rather than silently returning `@@ROWCOUNT = 0`. Added try/catch to catch error 33504 and map it to `{ rowsAffected: 0 }`, maintaining the same API contract as `recordLetterSignatureAsClient`. Updated header comment to document AFTER INSERT BLOCK behavior. The two writes (INSERT `QuestionnaireAnswer` + UPDATE `Engagement.questionnaireSubmittedAt`) remain in one batch; AFTER INSERT BLOCK fires before UPDATE runs on the deny path — no partial-write masking possible.

4. **`@@ROWCOUNT` glance-item verified:** On deny path, AFTER INSERT BLOCK throws before the Engagement UPDATE runs — `@@ROWCOUNT` is irrelevant (never reached). On allow path, `SELECT @@ROWCOUNT` follows the UPDATE → captures UPDATE rowcount = 1. The tier-3 non-owner test asserts `rowsAffected = 0` AND confirms no answer row and no `questionnaireSubmittedAt` set. No partial write can occur.

5. **`getMyQuestionnaireAction` (`apps/portal/src/app/onboarding/actions.ts`)** — Replaced stub body: now calls `getMyQuestionnaire()` + `getMyQuestionnaireAnswer()` in the same `withRequestContext` callback. Returns `alreadySubmitted: true` and `existingAnswers` when an answer row exists.

6. **`submitQuestionnaireAction` (`apps/portal/src/app/onboarding/actions.ts`)** — Replaced stub body with full implementation: identity guard → resolve engagement + questionnaire under `withRequestContext` → `checkStepAccessibility` gate check → parse + validate `answers` JSON server-side (required questions checked) → `submitQuestionnaireAsClient` (BLOCK-governed) → `rowsAffected = 0` → refusal, no audit → audit via `recordAuthEvent('engagement.questionnaire_submitted')` AFTER owner-confirmed write → `revalidatePath('/onboarding')`.

7. **Tier-3 test (`packages/db/src/onboarding-questionnaire.rls.test.ts`)** — Created: 5 pure-function tests (DECISION-I, read-model behavior), 3 DB tests (owner submit, non-owner BLOCK denial, null SESSION_CONTEXT denial), 1 full-cycle integration test. All 10 pass.

8. **Unit tests (`apps/portal/src/app/onboarding/actions.test.ts`)** — Added 16 tests for `submitQuestionnaireAction` (success, refusal, gate honored, non-owner, missing required question, malformed JSON, no template, audit fail-closed) and 4 tests for `getMyQuestionnaireAction`. Total: 29 portal action tests, all pass.

**What's next:** SDET review.

**Blockers:** none.

**Test execution evidence:**
- `pnpm --filter @tax-portal/db test -- onboarding-questionnaire.rls.test.ts`: 10 passed (1 test file)
- `pnpm --filter portal test`: 121 passed (8 test files, includes 29 onboarding action tests)
- `pnpm --filter admin test`: 184 passed (10 test files, no regressions)
- `pnpm lint`: zero errors
- `pnpm type-check`: zero errors
- `pnpm build`: clean

## Attempt Log

**Attempt count**: 0

## SDET Review

**Decision**: approved
**Notes**: All mandatory checks pass. Live gate counts (independently re-run against real SQL Server container, Docker v29.4.1):
- `pnpm --filter @tax-portal/db test -- onboarding-questionnaire.rls.test.ts`: **10/10 PASS** (5 pure-function + 3 DB-tier BLOCK tests + 1 full-cycle integration test; 536ms)
- `pnpm --filter @tax-portal/db test -- questionnaire-answer.client-isolation.rls.test.ts` (TASK-006-001 regression): **7/7 PASS** — no regression from this task's edits to `questionnaire-answer.ts`
- `pnpm --filter portal test`: **121/121 PASS** (8 files, incl. 29 onboarding action tests for `submitQuestionnaireAction` + `getMyQuestionnaireAction`)
- `pnpm --filter admin test`: **184/184 PASS** (10 files; zero cross-surface regression)
- `pnpm lint`: zero errors; `pnpm type-check`: zero errors

**33504-catch scoping verdict — PASS.** The catch block in `submitQuestionnaireAsClient` gates on `mssqlErr.number === 33504` (primary) OR `mssqlErr.message.includes("block predicate")` (secondary defensive check). The secondary string match is gated on the block predicate message being present — not on any arbitrary message string. Connection failures (e.g. `ETIMEOUT`, `ECONNREFUSED`), FK violations, constraint errors, and deadlocks have distinct error numbers and messages that do not contain "block predicate". All non-33504 paths fall through to `throw err`. Scoping is correct; no real failures are silently masked.

**TASK-006-001 regression — PASS.** 7/7 isolation tests re-run live against the real container; no regression from this task's finalization of `submitQuestionnaireAsClient`.

**AC-ONBD-003-03 (server-side satisfaction only) — VERIFIED.** `resolveOnboarding` derives `intake-questionnaire` step `done` from `engagement.questionnaireSubmittedAt != null` (DECISION-I). Viewing-but-not-submitted client → `done: false` proven by pure-function test. The `accessible` flag remains gated by `letterSignedAt` (unchanged).

**EPIC-005 letter gate not weakened — VERIFIED.** `checkStepAccessibility(engagement, 'intake-questionnaire')` is called in `submitQuestionnaireAction` before any write. Letter-unsigned refusal path: `mockSubmitQuestionnaireAsClient` not called (unit test "[gate honored] submit refused when letter unsigned"). Tier-3 pure-function test confirms `accessible: false` when unsigned.

**AC-ONBD-003-04 (recorded against engagement) — VERIFIED.** `submitQuestionnaireAsClient` inserts answer row with `engagementId + templateId + answers` AND sets `Engagement.questionnaireSubmittedAt` in one atomic batch. Tier-3 DB test confirms via admin read-back: answer row present with correct `engagementId`, `templateId`, answers content; `questionnaireSubmittedAt` non-null.

**AC-ONBD-003-01 (server-derived templateId) — VERIFIED.** `submitQuestionnaireAction` derives `templateId` from `questionnaire.template.id` (server-resolved via `getMyQuestionnaire()` under `withRequestContext`). Client supplies only `answersJson`. Unit test asserts `arg.templateId === MOCK_QUESTIONNAIRE_TEMPLATE.id` and `mockGetMyQuestionnaire` was called.

**ADR-005 owner-only enforcement — VERIFIED.** CLIENT-B submitting CLIENT-A's engagement → tier-3 DB test: `rowsAffected = 0`, answer count = 0, `questionnaireSubmittedAt` null (admin read-back). Null SESSION_CONTEXT → AFTER INSERT BLOCK fires error 33504 (caught), same read-back result. No partial write possible: AFTER INSERT BLOCK throws before UPDATE runs.

**ADR-003 Amendment 1 — VERIFIED.** All `sp_set_session_context` calls in `submitQuestionnaireAsClient` use `@read_only = 0`. No `@read_only = 1` introduced.

**ADR-019 audit ordering — VERIFIED.** `recordAuthEvent('engagement.questionnaire_submitted')` fires only AFTER `submitResult.rowsAffected === 1`. Non-owner path (`rowsAffected = 0`) returns early; audit call is never reached. Unit tests "[ADR-019]" scenarios assert `mockRecordAuthEvent` not called on denial and gate-refusal paths.

**`@@ROWCOUNT` carry-forward — RESOLVED.** `SELECT @@ROWCOUNT` follows `UPDATE [Engagement]` and captures UPDATE rowcount. On deny path, AFTER INSERT BLOCK throws before UPDATE runs → never reached. On allow path, UPDATE rowcount = 1. Functionally correct; no issue.

**Security:** `answers` bound via `req.input("answers", mssql.NVarChar(mssql.MAX), ...)` — parameterized, not interpolated. `sp_set_session_context` args are server-derived + single-quote-escaped. No client-supplied `engagementId`, `templateId`, or `serviceId` enters the submit path anywhere.

### Work Log approval breadcrumb
2026-06-18 [sdet] APPROVED — all live gate counts match developer-reported output; 33504-catch correctly scoped; EPIC-005 gate not weakened; AC-ONBD-003-03/-04/-01 covered by tier-3 DB tests + unit tests. Completed-at: 2026-06-18T22:15:00Z.
