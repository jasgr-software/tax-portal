# TASK-003-003: New-request notification — generation on submission (portal) + accountant read/surface (admin)

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

**Acceptance criteria:** AC-DOOR-005-01 (submission generates an in-portal notification for the accountant), AC-DOOR-005-02 (notification identifies the new request and leads to it), AC-MSG-013-01 (accountant receives a notification when a new service request is submitted)
**Upstream refs:** REQ-DOOR-005, REQ-MSG-013, ADR-003 (SESSION_CONTEXT), ADR-005 (notification read boundary — TASK-003-001), ADR-006 (cross-surface — generation on portal, consumption on admin)
**Introduces-gate:** no

---

## Quality Gates

- [ ] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [ ] **Submission gate** — lint + type-check + build + `pnpm --filter portal test` + `pnpm --filter admin test` + `pnpm --filter @tax-portal/db test`
- [N/A] **Targeted e2e** — e2e lands in TASK-003-006
- [ ] **Security review** — notification carries no client-assertable recipient; accountant-only read enforced by RLS (TASK-003-001); generation runs under the sanctioned admin-pool submission path (no identity leak)
- [ ] **SDET Review** — approved

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

## Work Log
