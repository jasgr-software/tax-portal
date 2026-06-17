# TASK-003-004: Request inbox UI (admin) — list all requests by state + view submitted details

**Brief**: BRIEF-003
**Status**: backlog
**Assigned to**: webapp-developer
**Updated-by**: —
**Depends on**: TASK-003-001
**Impl**: developer
**E2e-required**: no
**Started-at**: —
**Completed-at**: —
**Complexity-estimate**: —
**Complexity-actual**: —

**Acceptance criteria:** AC-DASH-011-01 (view all engagement requests from the admin UI), AC-DASH-011-02 (distinguishable by state: pending/accepted/declined), AC-DASH-011-03 (identify which are pending a decision), AC-DOOR-006-01 (view each pending request and its submitted details)
**Upstream refs:** REQ-DASH-011, REQ-DOOR-006, ADR-006 (admin-only surface), ADR-003 (SESSION_CONTEXT — reads via the request pool under accountant identity)
**Introduces-gate:** no

---

## Quality Gates

- [ ] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [ ] **Submission gate** — lint + type-check + build + `pnpm --filter admin test`
- [N/A] **Targeted e2e** — e2e lands in TASK-003-006
- [ ] **Security review** — the inbox is reachable only by an authenticated ACCOUNTANT (`requireRole`); reads go through the request pool (`db`, SESSION_CONTEXT); the route is NOT reachable from `apps/portal` (ADR-006); request PII rendered server-side, no leakage to client beyond what the accountant may see
- [ ] **SDET Review** — approved

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

- [ ] `AC-DASH-011-01 — inbox lists all requests` — expected: every request shown
- [ ] `AC-DASH-011-02 — requests show pending/accepted/declined state` — expected: distinct state badges
- [ ] `AC-DASH-011-03 — pending requests are identifiable` — expected: pending visually/queryably distinguishable
- [ ] `AC-DOOR-006-01 — request detail shows submitted details` — expected: name, email, phone, services, message rendered

## Implementation Notes

- Reuse the EPIC-002 admin shell + `_components` convention. Keep `RequestDetail` decision-action-agnostic — TASK-003-005 wires the accept/decline forms into it.
- The route must live under `apps/admin` only (ADR-006); do not add any requests route to `apps/portal`.

## Work Log
