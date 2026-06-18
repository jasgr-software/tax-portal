# TASK-006-003: Engagement → service-type resolution + correct-questionnaire-for-service-type read (tier-3)

**Brief**: BRIEF-006
**Status**: done
**Assigned to**: webapp-developer
**Depends on**: TASK-006-001
**Impl**: developer
**E2e-required**: no <!-- correctness proven at tier-3; e2e in TASK-006-006 -->
**Updated-by**: sdet
**Started-at**: 2026-06-18T20:10:28Z
**Completed-at**: 2026-06-18T20:23:09Z
**Complexity-estimate**: 3
**Complexity-actual**: 3

**Acceptance criteria:** AC-ONBD-003-01 (service-type match resolved server-side)
**Upstream refs:** ADR-003, ADR-005, ADR-012, REQ-ONBD-003
**Introduces-gate:** no

**Brief-type:** feature
**Brief-deploys:** no

---

## Quality Gates

- [x] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [x] **Submission gate** — lint + type-check + build + brief-mandated tests pass (commands in CLAUDE.md)
- [N/A] **Targeted e2e** — N/A (tier-3 correctness here; e2e in TASK-006-006)
- [x] **Security review** — no client-supplied serviceId/templateId; resolution server-side under FILTER
- [x] **SDET Review** — approved

## SDET Review focus areas

- **Server-side resolution (AC-ONBD-003-01)** — the questionnaire shown derives from the *engagement's* service type, NOT from any client-supplied serviceId/templateId. Verify the resolver reads the engagement under `withRequestContext(CLIENT)` (FILTER-governed) and resolves the service type from `Engagement → EngagementRequest → EngagementRequestService → Service` — the client never passes the id.
- **Deterministic multi-service resolution (DECISION-F)** — a request may select multiple services. Verify the "primary service type" tiebreak is deterministic (`sortOrder` then `id`) and documented as a `// DECISION:`.
- **Absent-template handling** — an engagement whose primary service type has no template yet must resolve cleanly (return a "no template" state), not throw. Verify.
- **Tier-3 against real container DB** (ADR-012) — the resolution + correct-template match is a tier-3 integration obligation, run against the SQL Server container, not a mock.

## Context

AC-ONBD-003-01 — "the intake questionnaire a client completes corresponds to the service type of their engagement." This task delivers the **server-side resolution** from an engagement to its bound questionnaire template, proven at tier-3. The portal UI (TASK-006-004) and submit path (TASK-006-005) consume it; the e2e (TASK-006-006) exercises it end-to-end.

## Design contract (binding) — DECISION-F

- **Resolution path:** `Engagement.engagementRequestId → EngagementRequest → EngagementRequestService (join) → Service`. A request may select **multiple** services (many-to-many — confirmed in `prisma/schema.prisma` `EngagementRequestService`).
- **DECISION-F (primary service type):** v1 keys one questionnaire to one service type. Resolve the engagement's **primary** service type as the **first selected service ordered by `Service.sortOrder` ASC, then `Service.id` ASC** (deterministic). Record this as a `// DECISION:` in code. (Multi-service-type onboarding questionnaires are a later concern — fence it.)
- **Resolver:** `getQuestionnaireForEngagement(engagementId)` in `packages/db` (request pool, FILTER-governed so the caller only resolves their OWN engagement; mirror `getEngagementForClient`). Steps:
  1. Load the engagement under the request pool (FILTER) — if not visible, return `null` (fail-closed; non-owner sees nothing).
  2. Resolve the primary `serviceId` via the join (DECISION-F tiebreak). Reuse the admin-pool catalog read for the service rows if RLS makes the join awkward under the request pool — but the **engagement visibility gate** must run under the client FILTER first (the client must own the engagement before any template is resolved).
  3. `getTemplateForService(primaryServiceId)` (admin-pool read — the template is accountant-owned, DECISION-G).
  4. Return `{ engagementId, serviceId, serviceName, template: QuestionnaireTemplateItem | null }`. `template: null` = no template authored for this service type yet (acceptable starting state).
- **No client-supplied ids** — `engagementId` is server-resolved (the portal page calls `getMyEngagement()` first, per TASK-006-004; or expose a no-arg `getMyQuestionnaire()` mirroring `getMyEngagement`). The service type and template id are never client-supplied.

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `packages/db/src/repositories/questionnaire-template.ts` | Modify | Add `getQuestionnaireForEngagement(engagementId)` + `getMyQuestionnaire()` (no-arg, FILTER-governed) resolvers; `QuestionnaireForEngagement` type |
| `packages/db/src/index.ts` | Modify | Barrel-export the resolver(s) + type |
| `packages/db/src/questionnaire-resolution.rls.test.ts` | Create | Tier-3: correct template for the engagement's service type; multi-service tiebreak; absent-template null; non-owner sees null |

## Tests to Write First

- [x] `[AC-ONBD-003-01] resolves the template bound to the engagement's primary service type` — expected: the right template
- [x] `[AC-ONBD-003-01] multi-service request resolves a deterministic primary service type (sortOrder, then id)` — expected: stable choice
- [x] `[AC-ONBD-003-01] engagement whose service type has no template → template: null (no throw)` — expected: clean null
- [x] `[ADR-005] a non-owning CLIENT resolving another's engagement → null (FILTER fail-closed)` — expected: null

## Implementation Notes

- The engagement-ownership gate is the load-bearing security boundary — run the engagement read under `withRequestContext(CLIENT)` so `sec.pol_Engagement` FILTER governs. Only after the engagement is confirmed visible do you resolve its service type + template.
- Mirror `getMyEngagement()` for the no-arg, FILTER-governed entry the portal page uses.
- Tier-3 test harness: mirror `engagement.client-isolation.rls.test.ts` / `onboarding-gate.rls.test.ts` setup (two clients, real pools).

## Definition of Done

- [x] `getQuestionnaireForEngagement` + `getMyQuestionnaire` resolve correctly and fail-closed for non-owners
- [x] Multi-service tiebreak deterministic + documented as `// DECISION-F`
- [x] Absent-template returns null cleanly
- [x] Tier-3 test passes against the real container DB; lint + type-check + build pass

---

## Work Log

### 2026-06-18 [webapp-developer] Starting implementation — getQuestionnaireForEngagement + getMyQuestionnaire resolver + tier-3 test | What's next: write test file first (TDD), then implement resolver in questionnaire-template.ts, barrel-export in index.ts | Blockers: none

### 2026-06-18 [webapp-developer] Implementation complete — submission gate passed | What was done: (1) Wrote tier-3 test file `packages/db/src/questionnaire-resolution.rls.test.ts` first (6 tests covering all 4 spec cases: correct-template, multi-service tiebreak, absent-template null, non-owner null). (2) Implemented `getQuestionnaireForEngagement(engagementId)` + `getMyQuestionnaire()` in `packages/db/src/repositories/questionnaire-template.ts` — request-pool engagement visibility gate first, then admin-pool service join (DECISION-F ORDER BY sortOrder ASC, id ASC), then admin-pool template read. (3) Added `QuestionnaireForEngagement` type. (4) Barrel-exported new type + functions from `packages/db/src/index.ts`. | Gate results: `pnpm lint` PASS (0 warnings), `pnpm type-check` PASS (0 errors), `pnpm build` PASS (all apps + packages), `pnpm --filter @tax-portal/db test -- questionnaire-resolution.rls.test.ts`: 6/6 passed (including FILTER fail-closed for non-owner, absent-template null, DECISION-F tiebreak), full DB suite: 107/107 passed (17 test files), portal: 75/75, admin: 184/184. | What's next: SDET review | Blockers: none

**Tier-3 test output (questionnaire-resolution.rls.test.ts):**
```
 ✓ src/questionnaire-resolution.rls.test.ts (6 tests) 346ms
   ✓ getQuestionnaireForEngagement — service-type resolution (tier-3 integration) > [AC-ONBD-003-01] resolves the template bound to the engagement's primary service type 62ms
   ✓ getQuestionnaireForEngagement — service-type resolution (tier-3 integration) > [AC-ONBD-003-01] multi-service request resolves a deterministic primary service type (DECISION-F: sortOrder ASC, then id ASC) 6ms
   ✓ getQuestionnaireForEngagement — service-type resolution (tier-3 integration) > [AC-ONBD-003-01] engagement whose service type has no template → template: null (no throw) 6ms
   ✓ getQuestionnaireForEngagement — service-type resolution (tier-3 integration) > [ADR-005] non-owning CLIENT resolving another's engagement → null (FILTER fail-closed) 2ms
   ✓ getMyQuestionnaire — no-arg FILTER-governed resolver (tier-3 integration) > [AC-ONBD-003-01] getMyQuestionnaire resolves the caller's engagement questionnaire (no client-supplied id) 15ms
   ✓ getMyQuestionnaire — no-arg FILTER-governed resolver (tier-3 integration) > [ADR-005] client with no visible engagement → getMyQuestionnaire returns null (fail-closed) 2ms
 Test Files  1 passed (1) | Tests  6 passed (6)
```

### 2026-06-18 [sdet] APPROVED — all gates pass | What was done: Independent tier-3 run 6/6 PASS (live SQL Server); lint PASS; type-check PASS; security gate order verified (FILTER first, admin pool after); DECISION-F determinism verified live; absent-template null verified live; ADR-006 fence clean; barrel exports complete; metadata contract complete | What's next: IO dispatches TASK-006-004 | Blockers: none

## Attempt Log

**Attempt count**: 0

## SDET Review

**Decision**: approved
**Notes**: All mandatory checks passed. Docker pre-flight: PASS (v29.4.1). Independent gate run: `pnpm --filter @tax-portal/db test -- questionnaire-resolution.rls.test.ts` → 6/6 PASS (confirmed live against real SQL Server container; results identical to developer-reported output). `pnpm lint` → zero warnings/errors. `pnpm type-check` → zero errors.

Security gate order verified in code: Step 1 is the request-pool `findUnique` under `sec.pol_Engagement` FILTER (fail-closed before any admin-pool call); only after the engagement is confirmed visible does the resolver proceed to Step 2 (admin-pool service join) and Step 3 (admin-pool template read). Non-owner case (`clientBClerkId` resolving `clientAEngagementId`) returns `null` — FILTER fail-closed proven live.

DECISION-F tiebreak (`sortOrder ASC, id ASC`) present as both a `// DECISION:` comment in the JSDoc and inline in the SQL `ORDER BY` clause. Multi-service test seeds two services with sortOrder 5 and 10, asserts lower-sortOrder wins — determinism verified live.

Absent-template case: `serviceSameSortLowerId` has no `QuestionnaireTemplate` row; resolver returns `{ ..., template: null }` without throwing — live test confirms.

ADR-006 fence: no portal-only or admin-only coupling in `packages/db`; `dbAsEngagementClientForQuestionnaire` and all resolver logic are shared-package concerns only.

Barrel exports: `QuestionnaireForEngagement` (type), `getQuestionnaireForEngagement`, `getMyQuestionnaire` all exported from `packages/db/src/index.ts`; `dbAsEngagementClientForQuestionnaire` (internal cast helper) correctly NOT exported.

Metadata contract: `Started-at: 2026-06-18T20:10:28Z` (real clock, not midnight sentinel), `Complexity-estimate: 3`, `Complexity-actual: 3` — all present. Pre-implementation dispatch-checkpoint Work Log entry present and precedes all other file edits. `Introduces-gate: no` — Gate Authoring Rules three-item check N/A.

`getMyQuestionnaire` double-FILTER behavior (`findFirst` then `getQuestionnaireForEngagement` → `findUnique`) is labeled belt-and-suspenders in code comments; both run under the same `SESSION_CONTEXT` / `withClerkIdentity` scope — safe redundancy, not a security gap.

No `$()`, no `cd &&`, no `sudo`, no `| tail`, no heredoc-over-Write, no `claude -p` in Work Log. Tool hygiene clean.
