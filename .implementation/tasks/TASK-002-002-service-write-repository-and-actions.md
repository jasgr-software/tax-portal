# TASK-002-002: Service write repository + admin server actions (create / update / deactivate) through the request-scoped wrapper + persistence tier-3 test

**Brief**: BRIEF-002
**Brief-type**: feature
**Brief-deploys**: no
**Status**: backlog
**Assigned to**: webapp-developer
**Updated-by**: io
**Depends on**: TASK-002-001
**Impl**: developer
**E2e-required**: no <!-- this task is the server-side write path + tier-3 persistence test; the e2e journeys are TASK-002-004 -->
**Started-at**: —
**Completed-at**: —
**Complexity-estimate**: —
**Complexity-actual**: —

**Acceptance criteria:** AC-DOOR-002-01, AC-DOOR-002-02, AC-DOOR-002-03 (capability: add / edit / deactivate persist), and the server-side enforcement half of AC-DOOR-002-05 (writes run under the authenticated accountant identity)
**Upstream refs:** ADR-003 (SESSION_CONTEXT via the packages/db request wrapper), ADR-002/ADR-004 (Prisma single-track entity persistence on real SQL Server), ADR-005 (write boundary), REQ-DOOR-002 (reversible deactivation)
**Introduces-gate:** no

---

## Quality Gates

- [ ] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [ ] **Submission gate** — lint + type-check + build + `pnpm --filter @tax-portal/db test` + `pnpm --filter admin test` pass
- [N/A] **Targeted e2e** — server actions + repository + tier-3 persistence test; the e2e journeys are TASK-002-004
- [ ] **Security review** — no direct Prisma in handlers (ADR-003); role/identity from the verified session only (never client-asserted); input validation on name/description/sortOrder
- [ ] **SDET Review** — approved

## SDET Review focus areas

- **ADR-003 convention compliance (HARD):** every write must go through the `packages/db` request-scoped
  wrapper (`db` via `withRequestContext`) that sets SESSION_CONTEXT before the first real query — **no direct
  `requestDb`/Prisma in the route handlers or server actions**, no `adminDb` for catalog writes. The ESLint
  import boundary should already flag `requestDb`; verify by inspection that `adminDb` is not used for writes.
- **Persistence is tier-3 against real SQL Server** (not in-memory) and survives a re-read (ADR-002/-004).
- **Reversible deactivation:** deactivate sets `active = false`, never `DELETE` (REQ-DOOR-002 note —
  `EngagementRequestService` references must survive). Reject any hard-delete path.
- **Identity provenance:** the role written to SESSION_CONTEXT comes from `getIdentity()` (verified session),
  never request body/header/query — mirrors the apps/admin/src/app/page.tsx pattern.

## Context

The brief's write side: the accountant adds, edits, and deactivates services, persisted to the **existing**
Prisma `Service` entity (reuse — do not create a parallel model), through the `packages/db` request-scoped
wrapper so the write runs under the authenticated accountant identity (ADR-003) and is authorized at the
security policy from TASK-002-001 (ADR-005). This task delivers the server-side write path + a tier-3
persistence test; TASK-002-003 builds the UI on top, TASK-002-004 the e2e journeys.

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `packages/db/src/repositories/service.ts` | Modify | Add write functions: `createService`, `updateService`, `deactivateService` (and optionally `reactivateService`/`listAllServices` for the admin list). Writes go through the request-scoped `db` wrapper inside the caller's `withRequestContext` — NOT the admin pool, NOT raw mssql. List-for-admin returns active + inactive. |
| `packages/db/src/index.ts` | Modify | Export the new write functions + their input/result types from the barrel. |
| `packages/db/src/service.persistence.test.ts` | Create | Tier-3: add/edit/deactivate persist to real SQL Server and survive a re-read, run under an ACCOUNTANT `withClerkIdentity` context. Model on `engagement-request.persistence.test.ts`. |
| `apps/admin/src/app/services/actions.ts` | Create | Next.js server actions `createServiceAction` / `updateServiceAction` / `deactivateServiceAction` — resolve verified identity via `getIdentity()`, call the repository inside `withRequestContext(identity.clerkUserId, identity.role, …)`, validate input, `revalidatePath` the catalog route. |

## Tests to Write First

- [ ] `[AC-DOOR-002-01] createService persists a new active service and it is re-readable` — expected: row exists, active=true
- [ ] `[AC-DOOR-002-02] updateService changes name/description and the change survives a re-read` — expected: updated fields persisted
- [ ] `[AC-DOOR-002-03] deactivateService sets active=false (row NOT deleted)` — expected: row exists, active=false
- [ ] `listAllServices returns both active and inactive rows for the admin list` — expected: inactive included

## Implementation Notes

- Reuse the `Service` model exactly (`id`, `name`, `description`, `active`, `sortOrder`, `createdAt`,
  `updatedAt`). Prefer no schema change; if the admin list needs ordering only, use the existing `sortOrder`.
  Any schema touch goes through `pnpm prisma migrate dev` (Track A) — surface it to the IO first if needed.
- Server actions resolve identity exactly like apps/admin/src/app/page.tsx (getIdentity → withRequestContext).
- // DECISION: writes use the request-scoped `db` wrapper so SESSION_CONTEXT carries the accountant role to
  the TASK-002-001 write predicate — this is the runtime half of AC-DOOR-002-05.

## Definition of Done

- [ ] add / edit / deactivate persist to real SQL Server and survive a re-read (tier-3 green; output in Work Log)
- [ ] all writes go through the request-scoped wrapper (no direct Prisma / no adminDb in handlers)
- [ ] deactivate is reversible (`active=false`, no delete)
- [ ] Lint + type-check + build pass; `pnpm --filter @tax-portal/db test` + `pnpm --filter admin test` green

---

## Work Log

## Attempt Log
