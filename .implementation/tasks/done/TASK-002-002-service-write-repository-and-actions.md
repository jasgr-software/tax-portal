---
brief: BRIEF-002
status: done
assigned_to: webapp-developer
updated_by: webapp-developer
depends_on: TASK-002-001
impl: developer
e2e_required: no
started_at: 2026-06-16T12:57:28Z
completed_at: 2026-06-16T13:15:00Z
complexity_estimate: "3"
complexity_actual: "3"
brief_type: feature
brief_deploys: no
introduces_gate: no
acceptance_criteria: [AC-DOOR-002-01, AC-DOOR-002-02, AC-DOOR-002-03 (capability: add / edit / deactivate persist), and the server-side enforcement half of AC-DOOR-002-05 (writes run under the authenticated accountant identity)]
upstream_refs: ADR-003 (SESSION_CONTEXT via the packages/db request wrapper), ADR-002/ADR-004 (Prisma single-track entity persistence on real SQL Server), ADR-005 (write boundary), REQ-DOOR-002 (reversible deactivation)
---

# TASK-002-002: Service write repository + admin server actions (create / update / deactivate) through the request-scoped wrapper + persistence tier-3 test

---

## Quality Gates

- [x] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [x] **Submission gate** — lint + type-check + build + `pnpm --filter @tax-portal/db test` + `pnpm --filter admin test` pass
- [N/A] **Targeted e2e** — server actions + repository + tier-3 persistence test; the e2e journeys are TASK-002-004
- [x] **Security review** — no direct Prisma in handlers (ADR-003); role/identity from the verified session only (never client-asserted); input validation on name/description/sortOrder
- [x] **SDET Review** — approved

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

- [x] `[AC-DOOR-002-01] createService persists a new active service and it is re-readable` — expected: row exists, active=true
- [x] `[AC-DOOR-002-02] updateService changes name/description and the change survives a re-read` — expected: updated fields persisted
- [x] `[AC-DOOR-002-03] deactivateService sets active=false (row NOT deleted)` — expected: row exists, active=false
- [x] `listAllServices returns both active and inactive rows for the admin list` — expected: inactive included

## Implementation Notes

- Reuse the `Service` model exactly (`id`, `name`, `description`, `active`, `sortOrder`, `createdAt`,
  `updatedAt`). Prefer no schema change; if the admin list needs ordering only, use the existing `sortOrder`.
  Any schema touch goes through `pnpm prisma migrate dev` (Track A) — surface it to the IO first if needed.
- Server actions resolve identity exactly like apps/admin/src/app/page.tsx (getIdentity → withRequestContext).
- // DECISION: writes use the request-scoped `db` wrapper so SESSION_CONTEXT carries the accountant role to
  the TASK-002-001 write predicate — this is the runtime half of AC-DOOR-002-05.

## Definition of Done

- [x] add / edit / deactivate persist to real SQL Server and survive a re-read (tier-3 green; output in Work Log)
- [x] all writes go through the request-scoped wrapper (no direct Prisma / no adminDb in handlers)
- [x] deactivate is reversible (`active=false`, no delete)
- [x] Lint + type-check + build pass; `pnpm --filter @tax-portal/db test` + `pnpm --filter admin test` green

---

## Work Log

### 2026-06-16 [webapp-developer] Starting implementation
**What was done:** Dispatch checkpoint — read ENGINE.md, developer.md, task spec, existing service.ts repository, index.ts barrel, engagement-request.persistence.test.ts (model), context.ts, client.ts, page.tsx (pattern), service.rls.test.ts, session-context.propagation.test.ts.
**Scope:** Add createService/updateService/deactivateService/listAllServices to packages/db/src/repositories/service.ts using request-scoped `db` wrapper; export from barrel; create service.persistence.test.ts tier-3; create apps/admin/src/app/services/actions.ts server actions.
**What's next:** Implement repository write functions, then test, then actions, then submission gate.
**Blockers:** None — DATABASE_URL in authority form (sqlserver://localhost:14330;...) which Prisma connector parses correctly per task spec note.

### 2026-06-16 [webapp-developer] Implementation complete — submission gate passed

**Files changed:**
- `packages/db/src/repositories/service.ts` — added `createService`, `updateService`, `deactivateService`, `reactivateService`, `listAllServices` using request-scoped `db` wrapper (SESSION_CONTEXT-aware); kept `getActiveServices` via admin pool for the anonymous path. Added `ServiceItem`, `CreateServiceInput`, `UpdateServiceInput` types.
- `packages/db/src/index.ts` — exported the new write functions and types.
- `packages/db/src/service.persistence.test.ts` (new) — tier-3 integration test against real SQL Server, 4 cases:
  - `[AC-DOOR-002-01]` createService persists a new active service
  - `[AC-DOOR-002-02]` updateService changes name/description — survives re-read
  - `[AC-DOOR-002-03]` deactivateService sets active=false (row NOT deleted)
  - `listAllServices` returns active + inactive rows
- `apps/admin/src/app/services/actions.ts` (new) — `createServiceAction`, `updateServiceAction`, `deactivateServiceAction`. Identity from `getIdentity()` (verified session), writes inside `withRequestContext`, input validation, `revalidatePath('/services')`.
- `apps/admin/src/app/services/actions.test.ts` (new) — 16 unit tests: AC-tagged happy paths, unauthorized identity (null + CLIENT), input validation edge cases.

**Key DECISION notes:**
- `requestDb()` helper in repository casts `db as unknown as PrismaClient` to access model methods — safe since `db` at runtime IS an extended PrismaClient; SESSION_CONTEXT middleware still fires via `$allOperations`.
- `deactivateService` uses `UPDATE active=false`, never `DELETE` — REQ-DOOR-002 FK references preserved.
- UUID case normalization: raw mssql returns uppercase UUIDs; Prisma returns lowercase. Test seeds use `.toLowerCase()` before comparisons.
- `vi.hoisted()` required in actions.test.ts to declare mock functions before the hoisted `vi.mock()` factory executes.

**Submission gate results:**
```
pnpm lint                       → PASSED (0 errors, 0 warnings)
pnpm type-check                 → PASSED (0 errors)
pnpm build                      → PASSED (exit code 0)
pnpm --filter @tax-portal/db test → 39 passed (7 test files) — includes new service.persistence.test.ts (4 tests) + service.rls.test.ts (10 tests, no regressions)
pnpm --filter admin test        → 16 passed (2 test files) — includes new actions.test.ts (15 tests) + route.test.ts (1 test)
```

**Test output (packages/db):**
```
 ✓ src/service.persistence.test.ts (4 tests) 248ms
 ✓ src/audit-event.rls.test.ts (9 tests) 231ms
 ✓ src/engagement-request.persistence.test.ts (5 tests) 192ms
 ✓ src/service.rls.test.ts (10 tests) 134ms
 ✓ src/session-context.propagation.test.ts (4 tests) 84ms
 ✓ src/services.query.test.ts (3 tests) 82ms
 ✓ src/engagement-request.rls.test.ts (4 tests) 64ms
 Test Files  7 passed (7) | Tests  39 passed (39)
```

**Test output (admin):**
```
 ✓ src/app/services/actions.test.ts (15 tests) 9ms
 ✓ src/app/healthz/route.test.ts (1 test) 4ms
 Test Files  2 passed (2) | Tests  16 passed (16)
```

**What's next:** SDET review.
**Blockers:** None.

## SDET Review

**Decision**: approved

**Verified items:**

1. **Request-scoped wrapper (HARD — AC-DOOR-002-05 runtime):** Confirmed by code inspection and live test execution. `requestDb()` in `packages/db/src/repositories/service.ts` (line 106–108) is `db as unknown as PrismaClient` where `db` is the `$extends`-wrapped client exported from `client.ts`. The `db` Proxy resolves to `getDb()`, which returns a `PrismaClient.$extends` instance whose `$allOperations` middleware calls `sp_set_session_context` before every real query (lines 150–180 of `client.ts`). All five write functions (`createService`, `updateService`, `deactivateService`, `reactivateService`, `listAllServices`) exclusively use `requestDb()`. The `getAdminPool()` import is used only in `getActiveServices()` (the anonymous public read — pre-existing, explicitly sanctioned by ADR-003 §1/§6). No `adminDb` usage, no direct `PrismaClient` instantiation, no raw mssql in write path. The `requestDb` name in the repository is a **local function** — not the forbidden barrel import (the barrel does not export `requestDb`; confirmed by `index.ts` and `client.ts`). ESLint import boundary enforced at the barrel level; the local cast is an internal TypeScript workaround for `$extends` inference, not a boundary escape.

2. **Identity/role provenance (ADR-005):** `actions.ts` resolves identity exclusively through `getAccountantIdentity()` → `getAuthProvider().getIdentity(syntheticRequest)` using `next/headers` cookies. The role is never read from request body, form data, query param, or action argument. Guards: `identity === null` or `identity.role !== 'ACCOUNTANT'` both return `{ success: false }` before any write is attempted. Unit tests verify null-identity and CLIENT-role are rejected (both suites confirmed).

3. **Reversible deactivation (REQ-DOOR-002):** `deactivateService` uses `requestDb().service.update({ data: { active: false } })` — never `delete`. The comment explicitly documents the rationale (EngagementRequestService FK references must survive). Tier-3 test `[AC-DOOR-002-03]` verifies row still exists with `active=false` after deactivation via admin pool re-read. No hard-delete path exists in any write function.

4. **Prisma model reuse — no schema change:** `git diff --name-only HEAD` and `git status` show no changes to `prisma/schema.prisma` or `prisma/migrations/`. The task reuses the existing `Service` model exactly as specified.

5. **AC↔test traceability (tier-3, real SQL Server):** All four mandated cases present and passing against live SQL Server (confirmed by independent re-execution):
   - `[AC-DOOR-002-01]` creates row with `active=true`, re-reads via admin pool — PASS
   - `[AC-DOOR-002-02]` updates name/description, re-reads via admin pool to confirm persistence — PASS
   - `[AC-DOOR-002-03]` deactivates, admin pool re-read shows row exists with `active=false` — PASS
   - `listAllServices` returns both active and inactive rows — PASS
   All tests run under `withClerkIdentity('user_acct_write_test', 'ACCOUNTANT', fn)` — the genuine SESSION_CONTEXT path through `$extends`, not the admin pool.

6. **service.rls.test.ts no regression:** All 10/10 pass (CLIENT writes still rejected at DB boundary by `sec.fn_service_write_access`).

7. **Work Log count inconsistency resolved:** The Work Log text says "16 unit tests" in one place and "15 tests" in another. Independent re-execution of `pnpm --filter admin test` → **16 passed (16)** across 2 files (actions.test.ts: 15, route.test.ts: 1). The final summary line ("16 passed") was correct. The "15" was a typo in the prose description.

8. **Input validation present:** `validateName` (type check, trim, empty guard, 200-char max) and `validateSortOrder` (integer, INT range bounds) applied in all three server actions before any write. Repo also validates at its layer as defense-in-depth.

9. **Mandatory rejection checks all clear:** Dispatch Checkpoint present ("Starting implementation" entry precedes all other edits); `Started-at: 2026-06-16T12:57:28Z`, `Complexity-estimate: 3`, `Complexity-actual: 3` — all set and in range; all required spec fields present; `Introduces-gate: no` → Gate Authoring evidence not required; all dev-owned Quality Gate boxes ticked; no tool-hygiene violations.

---

### 2026-06-16 [sdet] SDET Review approved — TASK-002-002

**What was done:** Independent re-execution of `pnpm --filter @tax-portal/db test` → **39/39 PASS** (7 files, including service.persistence.test.ts 4/4 + service.rls.test.ts 10/10). Independent re-execution of `pnpm --filter admin test` → **16/16 PASS** (2 files). Docker pre-flight: `tax-portal-sqlserver` healthy on host:14330. Code inspection confirmed: `requestDb()` is the genuine `$extends`-wrapped `db` (SESSION_CONTEXT fires via `$allOperations`), not `adminDb` or a raw admin-pool path. Identity from `getIdentity()` only. Deactivate is `UPDATE active=false`, never DELETE. No schema changes. All AC↔test traceability confirmed.
**What's next:** Main-session commit of TASK-002-002 to `brief-002-services-catalog-management`; IO to dispatch TASK-002-003 (admin catalog management UI).
**Blockers:** None.

## Attempt Log
