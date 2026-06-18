# TASK-006-003: Engagement → service-type resolution + correct-questionnaire-for-service-type read (tier-3)

**Brief**: BRIEF-006
**Status**: backlog
**Assigned to**: webapp-developer
**Depends on**: TASK-006-001
**Impl**: developer
**E2e-required**: no <!-- correctness proven at tier-3; e2e in TASK-006-006 -->
**Updated-by**: —
**Started-at**: —
**Completed-at**: —
**Complexity-estimate**: —
**Complexity-actual**: —

**Acceptance criteria:** AC-ONBD-003-01 (service-type match resolved server-side)
**Upstream refs:** ADR-003, ADR-005, ADR-012, REQ-ONBD-003
**Introduces-gate:** no

**Brief-type:** feature
**Brief-deploys:** no

---

## Quality Gates

- [ ] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [ ] **Submission gate** — lint + type-check + build + brief-mandated tests pass (commands in CLAUDE.md)
- [N/A] **Targeted e2e** — N/A (tier-3 correctness here; e2e in TASK-006-006)
- [ ] **Security review** — no client-supplied serviceId/templateId; resolution server-side under FILTER
- [ ] **SDET Review** — approved

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

- [ ] `[AC-ONBD-003-01] resolves the template bound to the engagement's primary service type` — expected: the right template
- [ ] `[AC-ONBD-003-01] multi-service request resolves a deterministic primary service type (sortOrder, then id)` — expected: stable choice
- [ ] `[AC-ONBD-003-01] engagement whose service type has no template → template: null (no throw)` — expected: clean null
- [ ] `[ADR-005] a non-owning CLIENT resolving another's engagement → null (FILTER fail-closed)` — expected: null

## Implementation Notes

- The engagement-ownership gate is the load-bearing security boundary — run the engagement read under `withRequestContext(CLIENT)` so `sec.pol_Engagement` FILTER governs. Only after the engagement is confirmed visible do you resolve its service type + template.
- Mirror `getMyEngagement()` for the no-arg, FILTER-governed entry the portal page uses.
- Tier-3 test harness: mirror `engagement.client-isolation.rls.test.ts` / `onboarding-gate.rls.test.ts` setup (two clients, real pools).

## Definition of Done

- [ ] `getQuestionnaireForEngagement` + `getMyQuestionnaire` resolve correctly and fail-closed for non-owners
- [ ] Multi-service tiebreak deterministic + documented as `// DECISION-F`
- [ ] Absent-template returns null cleanly
- [ ] Tier-3 test passes against the real container DB; lint + type-check + build pass

---

## Work Log

## Attempt Log

**Attempt count**: 0

## SDET Review

**Decision**: pending
**Notes**:
