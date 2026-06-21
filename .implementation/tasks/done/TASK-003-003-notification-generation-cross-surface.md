---
brief: BRIEF-003
status: done
assigned_to: webapp-developer
updated_by: webapp-developer
depends_on: TASK-003-001
impl: developer
e2e_required: "no"
started_at: 2026-06-17T00:00:00Z
completed_at: 2026-06-17T06:58:00Z
complexity_estimate: 3
complexity_actual: 3
introduces_gate: "no"
acceptance_criteria: [AC-DOOR-005-01 (submission generates an in-portal notification for the accountant), AC-DOOR-005-02 (notification identifies the new request and leads to it), AC-MSG-013-01 (accountant receives a notification when a new service request is submitted)]
upstream_refs: REQ-DOOR-005, REQ-MSG-013, ADR-003 (SESSION_CONTEXT), ADR-005 (notification read boundary — TASK-003-001), ADR-006 (cross-surface — generation on portal, consumption on admin)
---





# TASK-003-003: New-request notification — generation on submission (portal) + accountant read/surface (admin)

---

## Quality Gates

- [x] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [x] **Submission gate** — lint + type-check + build + `pnpm --filter portal test` + `pnpm --filter admin test` + `pnpm --filter @tax-portal/db test`
- [N/A] **Targeted e2e** — e2e lands in TASK-003-006
- [x] **Security review** — notification carries no client-assertable recipient; accountant-only read enforced by RLS (TASK-003-001); generation runs under the sanctioned admin-pool submission path (no identity leak); `getNotificationsAction` uses request pool (withRequestContext) not adminDb — fail-closed
- [x] **SDET Review** — approved

## SDET Review focus areas

- **Cross-surface (CLAUDE.md § Platform-frontend scope):** generation hooks into the **portal** anonymous-submit path (`apps/portal/.../request/actions.ts`, runs under `adminDb` — the one sanctioned identity-less write, ADR-003 §1/§6); consumption reads under the **admin** accountant SESSION_CONTEXT (`db` request pool). Verify both surfaces; the notification must be generated atomically with (or transactionally tied to) the request insert so a request never lands without its notification.
- AC-DOOR-005-02 "leads to it" — the notification must carry the `engagementRequestId` so the admin surface can link to the specific request.
- Tier-3 (integration): a submitted request produces exactly one accountant notification; the notification is accountant-only (already proven in TASK-003-001 — reference, don't duplicate).

## Context

When a prospect submits an engagement request (EPIC-001's anonymous insert), the accountant must be notified in-portal (AC-DOOR-005-01/-02, AC-MSG-013-01). The notification is generated as part of recording the submission and is consumed on the accountant's admin surface, where it identifies the new request and links to it. Real-time push (Supabase Realtime/SSE) is **out of scope** (Phase 4) — the notification need only be generated, accountant-scoped, and lead to the request.

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `apps/portal/src/app/(public)/request/actions.ts` | Modify | On successful request insert, create the accountant notification (`createNotification` from TASK-003-001), tied to the new request id. Same transaction/admin-pool path as the insert. |
| `packages/db/src/repositories/engagement-request.ts` | Modify (if cleaner) | Optionally fold notification creation into `createEngagementRequest` so every request gets its notification (DECISION: keep generation co-located with the insert for atomicity). |
| `apps/admin/src/app/requests/_components/NotificationsIndicator.tsx` | Create | Minimal accountant-surface element that surfaces new-request notifications and links to the request (the inbox detail). Wired into the admin shell / inbox page (TASK-003-004 owns the page). |
| `apps/admin/src/app/requests/actions.ts` | Modify/Create | `getNotifications()` server read (request pool, accountant context) + `markNotificationRead`. |
| `apps/portal/src/app/(public)/request/actions.test.ts` | Modify/Create | Assert a notification is generated on submit. |
| `apps/admin/src/app/requests/notifications.test.ts` | Create | Assert accountant read + "leads to request" linkage. |

## Tests to Write First

- [ ] `AC-DOOR-005-01 — submitting a request generates one accountant notification` — expected: 1 notification row tied to the request
- [ ] `AC-MSG-013-01 — the notification is of the new-service-request type` — expected: type/category = new-request
- [ ] `AC-DOOR-005-02 — the notification links to the submitted request` — expected: carries engagementRequestId; admin surface resolves it

## Implementation Notes

- Keep the admin surface element minimal — a count/list that links to the inbox is enough for "leads her to review it." The full inbox list/detail is TASK-003-004; coordinate so the indicator links into it.
- DECISION: co-locate notification creation with the request insert (atomicity) vs. a separate call in the action. Prefer folding into `createEngagementRequest` (or a single transaction) so a request can never exist without its notification. Note the `// DECISION:`.

## SDET Review

**Decision**: approved

**Notes:**

- **Mandatory checks:** all pass. `Complexity-actual: 3` (integer in 1–5); pre-implementation breadcrumb present ("Starting implementation" entry precedes all code edits); no tool-hygiene violations; all required spec fields (`**Acceptance criteria:**`, `**Upstream refs:**`, `**Introduces-gate:**`) present; `Introduces-gate: no` correct (no new required gate introduced).
- **Cross-surface validation (CLAUDE.md § Platform-frontend scope):**
  - Portal (generation path): `createEngagementRequest` in `packages/db/src/repositories/engagement-request.ts` opens a raw mssql `Transaction` against `getAdminPool()` and inserts Request + EngagementRequestService rows + Notification row before `transaction.commit()`. The portal `submitEngagementRequest` server action in `apps/portal/.../request/actions.ts` calls only `createEngagementRequest` — it never calls a separate notification function. Both surfaces verified.
  - Admin (consumption path): `getNotificationsAction` and `markNotificationReadAction` in `apps/admin/src/app/requests/actions.ts` import from `@tax-portal/db` exclusively `withRequestContext`, `listNotifications`, and `markNotificationRead`. `adminDb` is absent from the file (grep confirmed). `listNotifications` and `markNotificationRead` in `notification.ts` use the Prisma `db` request pool (not `getAdminPool()`), so `sec.pol_Notification` FILTER/BLOCK predicates are live on every read/update.
- **Atomicity (AC-DOOR-005-01):** The Notification INSERT is inside the same `Transaction` object as the EngagementRequest INSERT and EngagementRequestService INSERTs. If the Notification INSERT fails (empty recordset), `throw new Error(...)` is hit inside the `try` block, triggering `transaction.rollback()` in the `catch`. A request can never commit without its notification. The tier-3 test `[AC-DOOR-005-01] creates exactly one Notification row tied to the new request` confirms this against the real SQL Server container — independently re-run and verified 50/50.
- **AC-DOOR-005-02 linkage:** `notifResult` carries `engagementRequestId = newId` (the just-inserted request ID). The `NotificationsIndicator` renders `href={/requests/${notif.engagementRequestId}}` for each notification. The tier-3 test asserts `notifRows.recordset[0]?.engagementRequestId === result.id`.
- **AC-MSG-013-01:** `NOTIFICATION_TYPE_NEW_REQUEST = 'new_engagement_request'` is the constant used in the INSERT and asserted in both tier-3 tests and the admin unit tests.
- **Security — dual-layer guard on admin reads:**
  - Identity layer: `getAccountantIdentity()` returns null for any non-ACCOUNTANT identity (role check: `identity.role !== 'ACCOUNTANT'` → null → `{ success: false, error: 'Unauthorized' }`). Tested for null identity and CLIENT role.
  - RLS layer: `listNotifications` and `markNotificationRead` use `db` (Prisma request pool with `$extends` SESSION_CONTEXT middleware). `sec.pol_Notification` proven by TASK-003-001's tier-3 tests. Not duplicated here — referenced per task scope note.
  - No SQL injection vectors: the portal INSERT is fully parameterized via `mssql.Request.input()`; the admin read uses Prisma `findMany`/`update` with typed arguments.
  - No XSS: `notif.title` and `notif.engagementRequestId` are rendered in JSX (auto-escaped). `engagementRequestId` is a server-generated UNIQUEIDENTIFIER (hex/dash format), not user-supplied.
- **ADR-003 compliance:** No `@read_only` introduced anywhere. `withRequestContext` is the exclusive entry point for accountant reads. No direct Prisma access in route handlers outside the wrapper.
- **Test counts (independently re-run):** portal 29/29, admin 52/52, `@tax-portal/db` 50/50. All green on real Docker containers. Lint and type-check clean.

## Work Log

### 2026-06-17 [webapp-developer] Starting implementation — notification generation (portal) + admin surface (admin) | What's next: fold createNotification into createEngagementRequest transaction, write portal and admin tests, create NotificationsIndicator component | Blockers: none

### 2026-06-17 [webapp-developer] Implementation complete — all gates green

**What was done:**

1. **`packages/db/src/repositories/engagement-request.ts`** — Modified `createEngagementRequest` to fold notification creation into the same mssql Transaction. The Notification INSERT runs after EngagementRequestService join rows, before `transaction.commit()`. All three (request + services + notification) commit atomically or rollback together. Added `NOTIFICATION_TYPE_NEW_REQUEST = 'new_engagement_request'` constant. `CreateEngagementRequestResult` now includes `notificationId: string`.
   - `// DECISION (TASK-003-003)`: Notification INSERT co-located in the transaction (not a separate call from the portal action) so a request can never be committed without its accountant notification (AC-DOOR-005-01). The alternative (separate call from action) would allow a request to persist without a notification on second-call failure.

2. **`packages/db/src/index.ts`** — Added `NOTIFICATION_TYPE_NEW_REQUEST` to barrel exports.

3. **`apps/admin/src/app/requests/actions.ts`** (new) — `getNotificationsAction()` + `markNotificationReadAction()` server actions. Both go through `withRequestContext` (request pool), not adminDb. The accountant-only gate is at the identity layer (return unauthorized for non-ACCOUNTANT) AND at the SQL Server RLS layer (sec.pol_Notification, proven by TASK-003-001).
   - `// DECISION (TASK-003-003)`: request pool (withRequestContext) not adminDb for reads — fail-closed by RLS.

4. **`apps/admin/src/app/requests/_components/NotificationsIndicator.tsx`** (new) — Minimal Server Component. Shows unread count badge + list of `new_engagement_request` notifications, each with a link to `/requests/<engagementRequestId>` (AC-DOOR-005-02). Uses `NOTIFICATION_TYPE_NEW_REQUEST` constant for type filtering.
   - `// DECISION (TASK-003-003)`: Link target `/requests/<engagementRequestId>` is a forward reference — the indicator uses a plain `<a>` href that will 404 until TASK-003-004 lands. Acceptable per task spec.

5. **`packages/db/src/engagement-request.persistence.test.ts`** (modified) — Added `createdNotificationIds` cleanup tracking + 2 new integration tests:
   - `[AC-DOOR-005-01]` — exactly one Notification row created per request, tied to it.
   - `[AC-MSG-013-01][AC-DOOR-005-02]` — type = `new_engagement_request`, title includes prospect name, `engagementRequestId` links to request, `readAt` = null (unread at creation).

6. **`apps/portal/src/app/(public)/request/actions.test.ts`** (new) — 6 unit tests:
   - `[AC-DOOR-005-01]` createEngagementRequest called exactly once (notification generated atomically)
   - `[AC-DOOR-005-01]` returns success=true with requestId on success
   - `[AC-MSG-013-01]` mock returns notificationId confirming notification was created
   - `[AC-DOOR-005-02]` both requestId and notificationId returned together (linkage)
   - failure case: returns success=false (no notification on failure — transaction rollback)
   - validation: zero services → success=false, no repo call

7. **`apps/admin/src/app/requests/notifications.test.ts`** (new) — 11 unit tests:
   - `[AC-DOOR-005-01]` ACCOUNTANT reads; unauthorized for null identity; unauthorized for CLIENT
   - `[AC-MSG-013-01]` notification type = `new_engagement_request` in returned data
   - `[AC-DOOR-005-02]` notification carries `engagementRequestId`; title identifies the request
   - empty-state; markNotificationRead happy path + auth guards + empty-id guard

**Submission gate evidence:**

```
pnpm lint → CLEAN (0 warnings, 0 errors)

pnpm type-check → CLEAN (all packages)

pnpm build → CLEAN
  apps/portal: static pages generated
  apps/admin: static pages generated

pnpm --filter portal test -- --run:
  Test Files  4 passed (4)
  Tests  29 passed (29) [includes 6 new actions.test.ts tests]

pnpm --filter admin test -- --run:
  Test Files  4 passed (4)
  Tests  52 passed (52) [includes 11 new notifications.test.ts tests]

pnpm --filter @tax-portal/db test -- --run:
  Test Files  10 passed (10)
  Tests  50 passed (50) [includes 2 new engagement-request.persistence notification tests]

Total: 131 tests across all workspaces — all green
```

**What's next:** SDET review

**Blockers:** none

### 2026-06-17 [sdet] APPROVED — Completed-at: 2026-06-17T06:58:00Z
All mandatory rejection checks passed. Cross-surface validation confirmed: portal generation uses admin pool inside atomic mssql Transaction (request + notification never split); admin consumption uses request pool (withRequestContext → db Prisma client → sec.pol_Notification RLS active). Test suites independently re-run and green: portal 29/29, admin 52/52, @tax-portal/db 50/50. AC-DOOR-005-01/-02 and AC-MSG-013-01 fully covered at tier-2 and tier-3. Dual-layer security guard confirmed (identity + RLS). Status: done.
