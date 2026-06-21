---
brief: BRIEF-003
status: done
assigned_to: webapp-developer
updated_by: webapp-developer
depends_on: TASK-003-001
impl: developer
e2e_required: no
started_at: 2026-06-17T11:39:13Z
completed_at: 2026-06-17T06:50:00Z
complexity_estimate: "3"
complexity_actual: "3"
introduces_gate: no
acceptance_criteria: [AC-DASH-011-01 (view all engagement requests from the admin UI), AC-DASH-011-02 (distinguishable by state: pending/accepted/declined), AC-DASH-011-03 (identify which are pending a decision), AC-DOOR-006-01 (view each pending request and its submitted details)]
upstream_refs: REQ-DASH-011, REQ-DOOR-006, ADR-006 (admin-only surface), ADR-003 (SESSION_CONTEXT — reads via the request pool under accountant identity)
---

# TASK-003-004: Request inbox UI (admin) — list all requests by state + view submitted details

---

## Quality Gates

- [x] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [x] **Submission gate** — lint + type-check + build + `pnpm --filter admin test`
- [N/A] **Targeted e2e** — e2e lands in TASK-003-006
- [x] **Security review** — the inbox is reachable only by an authenticated ACCOUNTANT (`requireRole`); reads go through the request pool (`db`, SESSION_CONTEXT); the route is NOT reachable from `apps/portal` (ADR-006); request PII rendered server-side, no leakage to client beyond what the accountant may see
- [x] **SDET Review** — approved

## SDET Review focus areas

- **Route guard** — `apps/admin/src/app/requests` must require ACCOUNTANT (mirror the EPIC-002 `services` route guard); a CLIENT/anon hitting it is redirected/403 per ADR-010.
- **Read path** — list + detail read via `db` (request pool, accountant SESSION_CONTEXT), NOT `adminDb`. RLS already restricts to the accountant (EPIC-001 `pol_EngagementRequest`).
- **State distinguishability** — pending / accepted / declined visually distinct; pending identifiable (AC-DASH-011-03). Detail view shows submitted details: name, email, phone, selected services, message (AC-DOOR-006-01).
- Mirror the EPIC-002 admin pattern (`app/services/{page.tsx, _components/}`).

## Context

The accountant needs one place to review engagement requests, see what awaits her, and review past decisions (REQ-DASH-011). This task delivers the **read** side of the inbox: the list (all requests, state-distinguished, pending identifiable) and the request detail view (submitted details). The accept/decline **actions** are TASK-003-005 (this task lays the UI they hang off).

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `apps/admin/src/app/requests/page.tsx` | Create | Server component: ACCOUNTANT-guarded; lists all requests via the request pool; state badges; pending-first/identifiable. |
| `apps/admin/src/app/requests/_components/RequestList.tsx` | Create | List rows with state badge (pending/accepted/declined) + link to detail. |
| `apps/admin/src/app/requests/_components/RequestDetail.tsx` | Create | Submitted details (name/email/phone/services/message) + decision affordances (wired in TASK-003-005). |
| `apps/admin/src/app/requests/[id]/page.tsx` | Create | Request detail route (ACCOUNTANT-guarded). |
| `packages/db/src/repositories/engagement-request.ts` | Modify | Add `listEngagementRequests()` + `getEngagementRequest(id)` request-pool reads (with selected services). |
| `apps/admin/src/app/requests/inbox.test.tsx` | Create | Component tests: list renders states; pending identifiable; detail renders submitted fields. |

## Tests to Write First

- [x] `AC-DASH-011-01 — inbox lists all requests` — expected: every request shown
- [x] `AC-DASH-011-02 — requests show pending/accepted/declined state` — expected: distinct state badges
- [x] `AC-DASH-011-03 — pending requests are identifiable` — expected: pending visually/queryably distinguishable
- [x] `AC-DOOR-006-01 — request detail shows submitted details` — expected: name, email, phone, services, message rendered

## Implementation Notes

- Reuse the EPIC-002 admin shell + `_components` convention. Keep `RequestDetail` decision-action-agnostic — TASK-003-005 wires the accept/decline forms into it.
- The route must live under `apps/admin` only (ADR-006); do not add any requests route to `apps/portal`.

## Work Log

### 2026-06-17 [webapp-developer] Starting implementation — request inbox UI (admin): list all requests + detail view | What's next: add listEngagementRequests/getEngagementRequest to packages/db, create RequestList + RequestDetail components, page.tsx + [id]/page.tsx routes, inbox.test.tsx component tests | Blockers: none

### 2026-06-17 [webapp-developer] Implementation complete — all gates passed

**What was done:**

1. `packages/db/src/repositories/engagement-request.ts` — Added `listEngagementRequests()` and `getEngagementRequest(id)` request-pool reads via `db` (Prisma $extends wrapped client, SESSION_CONTEXT-aware). Both include the `services` relation (join table → Service) for the detail view (AC-DOOR-006-01). Added `EngagementRequestItem` and `EngagementRequestServiceItem` types.
2. `packages/db/src/index.ts` — Exported new types and functions from the barrel.
3. `apps/admin/src/app/requests/_components/RequestList.tsx` — List component with StatusBadge (pending=amber/action-required, accepted=green, declined=red), `data-status` attributes on both badges and rows (AC-DASH-011-02/-03), pending-first sort (stable), View link per row to `/requests/<id>`.
4. `apps/admin/src/app/requests/_components/RequestDetail.tsx` — Detail component rendering all submitted fields: firstName, lastName, email (mailto link), phone (or "Not provided"), services (chips), message (or "No message provided"). Decline reason shown for declined requests (AC-DOOR-008-04 display). `decisionSlot` prop forward-reference for TASK-003-005.
5. `apps/admin/src/app/requests/page.tsx` — ACCOUNTANT-guarded server component; fetches requests + notifications in parallel via `withRequestContext`; renders `RequestList` + `NotificationsIndicator` in the top nav.
6. `apps/admin/src/app/requests/[id]/page.tsx` — ACCOUNTANT-guarded detail route; fetches single request by ID via `withRequestContext(getEngagementRequest)`; `notFound()` when absent; renders `RequestDetail` with `decisionSlot={null}` (TASK-003-005 slot).
7. `apps/admin/src/app/requests/inbox.test.tsx` — 30 component tests covering all 4 ACs.

**Gate evidence:**

- `pnpm lint` — PASS (zero warnings)
- `pnpm type-check` — PASS (zero errors; db package built first to update dist/)
- `pnpm --filter admin build` — PASS (7 routes compiled clean)
- `pnpm --filter admin test` — **82 tests passed (5 test files)** including 30 new inbox tests
- `pnpm --filter @tax-portal/db test` — **50 tests passed (10 test files)** — all existing db tests unaffected
- `pnpm -r test` — **324 tests passed** across all workspace packages (auth 124, email 39, db 50, admin 82, portal 29)

**// DECISION (TASK-003-004):** `listEngagementRequests` and `getEngagementRequest` use the `db` (Prisma request-pool) wrapper via the `dbAsClient()` cast pattern from `service.ts` (TASK-002-002). This is correct: both functions MUST run inside `withRequestContext` (called by the pages), which sets SESSION_CONTEXT so `pol_EngagementRequest` FILTER predicate restricts visibility to ACCOUNTANT only. Using `adminDb`/admin pool would bypass RLS entirely — violation of ADR-003/ADR-005.

**// DECISION (TASK-003-004):** Pending-first sort in `RequestList` is a stable client-side sort applied after the server delivers newest-first rows from DB. This avoids a second DB query or a complex ORDER BY. The sort is pure (no mutation of original array).

**// DECISION (TASK-003-004):** `decisionSlot` in `RequestDetail` is typed as `React.ReactNode | null`. When null, the decision card is not rendered. TASK-003-005 will pass the accept/decline forms as the `decisionSlot` prop value to this page — zero changes to `RequestDetail` needed.

**What's next:** SDET review. TASK-003-005 (accept/decline actions) can now proceed — the `RequestDetail` decision slot is ready.

**Blockers:** none

### 2026-06-17 [sdet] APPROVED — TASK-003-004 request inbox UI | Verdict: approved, Status: done, Completed-at: 2026-06-17T06:50:00Z

## SDET Review

**Decision**: approved

**Notes:**

- All mandatory rejection checks passed: `Complexity-actual: 3` in range 1–5; `Started-at: 2026-06-17T11:39:13Z` non-sentinel; `Complexity-estimate: 3` present; pre-implementation breadcrumb ("Starting implementation") precedes the completion entry; no tool-hygiene violations; all required spec fields (`**Acceptance criteria:**`, `**Upstream refs:**`, `**Introduces-gate:** no`) present.
- Route guard verified on BOTH routes: `requests/page.tsx` and `requests/[id]/page.tsx` each independently call `provider.getIdentity()` and check `identity.role !== "ACCOUNTANT"`, returning an auth-error UI if the check fails. Defense-in-depth pattern mirrors `services/page.tsx` (EPIC-002). ADR-010 satisfied.
- Read path (ADR-003/ADR-005): `listEngagementRequests()` and `getEngagementRequest()` use `dbAsClient()` (the `$extends` request-pool wrapper) called exclusively inside `withRequestContext(...)`. `adminDb`/`getAdminPool` confirmed absent from both functions (only present in `createEngagementRequest`, the sanctioned anonymous write). `adminDb` in `requests/page.tsx` is comment-only. ADR-003 Amendment 1 honored — no `@read_only` in new code.
- `getEngagementRequest` returns `null` when RLS hides the row; `[id]/page.tsx` calls `notFound()` on a null result — the accountant (or any caller with wrong SESSION_CONTEXT) gets a 404 rather than an error page.
- ADR-006 compliance: `apps/portal/src/app` has no `/requests` directory. The portal's `/request` path is the EPIC-001 anonymous submission form — a different thing entirely.
- AC coverage independently verified:
  - AC-DASH-011-01 (list all): 5 tests in `[AC-DASH-011-01]` describe block — render all names, emails, View links, empty state, all row testids.
  - AC-DASH-011-02 (state distinguishable): 5 tests — distinct amber/green/red badges with `data-status` attributes and distinct text content.
  - AC-DASH-011-03 (pending identifiable): 5 tests — row `data-status=pending`, aria-label "awaiting decision", pending-first sort, multiple pending rows, non-pending rows confirmed absent.
  - AC-DOOR-006-01 (detail fields): 15 tests — first name, last name, email (with mailto href), phone (present and null), services (chips by testid and "None listed"), message (present and null), status badge on detail view, decline reason (shown/not shown per status), decision slot (rendered/absent).
  - Total: 30 tests, all tagged with AC ids in describe/it labels.
- `decisionSlot={null}` in `[id]/page.tsx` confirms TASK-003-005 scope is not pre-built — the decision card is absent when null.
- Security: no `dangerouslySetInnerHTML` in either component; all PII (firstName, lastName, email, phone, message, declineReason) rendered via JSX expressions — auto-escaped. Identity resolved server-side from cookie header via `getIdentity()`; not from URL params or client-supplied values (ADR-005). No PII leaked to client bundle.
- Independently ran `pnpm --filter admin test -- src/app/requests/inbox.test.tsx` → 30/30. Full suite `pnpm --filter admin test` → 82/82 (5 files). `pnpm --filter @tax-portal/db test` → 50/50 (10 files). Gate evidence in Work Log consistent with actual run.
