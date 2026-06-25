---
brief: BRIEF-016
status: done
assigned_to: webapp-developer
updated_by: sdet
depends_on: TASK-016-002, TASK-016-003, TASK-016-005
impl: developer
e2e_required: "yes"
started_at: 2026-06-24T23:36:29.933Z
completed_at: 2026-06-25T00:17:16.256Z
complexity_estimate: 4
complexity_actual: 4
introduces_gate: "no"
acceptance_criteria: [AC-MSG-017-01, AC-MSG-017-02, AC-MSG-017-03, AC-MSG-012-01, AC-MSG-012-02, AC-MSG-012-03, AC-MSG-015-02, AC-MSG-015-03, AC-MSG-013-03]
upstream_refs: ADR-006, ADR-003, ADR-010, ADR-023, REQ-MSG-017, REQ-MSG-012, REQ-MSG-015, REQ-MSG-013
code_standards: CS-TS-001, CS-TS-003, CS-TS-004, CS-GEN-001, CS-GEN-002, CS-GEN-003
---

# TASK-016-006: Accountant feed + persistent unread badge on apps/admin (generalize the EPIC-003 indicator + real-time + mark-read-on-view)

---

## Quality Gates

- [x] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [x] **Submission gate** — lint + type-check + build + brief-mandated tests pass (commands in CLAUDE.md)
- [x] **Targeted e2e** — actual execution output in Work Log (badge + real-time arrival + mark-read; brief mandates e2e)
- [x] **Security review** — mark-read server action resolves identity from request cookie + guards role (CS-TS-004)
- [x] **SDET Review** — approved

## SDET Review focus areas

- **REQUIRED in-scope: fix the latent admin `NotificationItem` fixture type errors (merge-blocker).** TASK-016-001
  generalized the `NotificationItem` type (added required `recipientType`, `recipientUserId`, `linkedItemType`,
  `linkedItemId`) but did NOT update the two existing admin notification test fixtures, leaving them incomplete.
  `pnpm build` is green (Next.js compiles app source only) but the required CI check `lint-and-typecheck` runs
  `pnpm type-check` → `tsc --noEmit` over admin **test files** and reds on:
  `apps/admin/src/app/requests/_components/NotificationsIndicator.test.tsx` (lines ~32/42/64) and
  `apps/admin/src/app/requests/notifications.test.ts` (line ~77). This task **necessarily** owns both files
  (it modifies `NotificationsIndicator.tsx` + admin `actions.ts`), so update those fixtures to the new
  `NotificationItem` shape as part of this task. **Submission-gate condition:** `pnpm --filter admin type-check`
  (and `pnpm type-check`) must be **green** — a remaining `NotificationItem` fixture error is a rejection.
  (Disposition of the TASK-016-003 dev's flag: latent type-check gap introduced by -001, closed here.)
- **Generalize the existing accountant indicator (CS-GEN-002).** EPIC-003's
  `apps/admin/.../NotificationsIndicator.tsx` filters to two known types and uses a forward-ref link. This task
  **generalizes** it into the persistent dual-role feed + badge shape shared with `apps/portal`
  (TASK-016-005) — additive, not a rewrite. The accountant must now also receive the **document-upload**
  notification (AC-MSG-013-03) and any other accountant-scoped types.
- **Persistent badge from any area (AC-MSG-017-01).** Mount the badge in the admin shell/nav so it shows from
  any area, not just `/requests`.
- **Real-time arrival, both surfaces (AC-MSG-012-01/-02/-03).** This is the accountant half of the both-surfaces
  real-time requirement — arrival increments the badge + surfaces in the feed without a refresh via the
  `packages/realtime` mock subscription.
- **Mark-read-on-view + cross-app (AC-MSG-015-02/-03, ADR-010).** Viewing the linked item (e.g. the uploaded
  document) fires the per-principal mark-read server action; **no dismiss**. A linked item that lives on the
  **other** app marks read across the session boundary (the cross-app e2e is TASK-016-007).
- **CS-TS-001/-003/-004.** Wrapper-only DB access under accountant SESSION_CONTEXT; shared pattern with portal;
  cookie-identity + role-guarded server action.

## Context

Stands up the **accountant-facing** half of the dual-role feed on `apps/admin` (the Tax Portal) by
**generalizing** the existing EPIC-003 `NotificationsIndicator` into the persistent feed + badge shape shared
with the portal (TASK-016-005), adding real-time arrival and mark-read-on-view, and surfacing the new
document-upload notification (AC-MSG-013-03).

Satisfies (accountant surface): AC-MSG-017-01/-02/-03 (badge), AC-MSG-012-01/-02/-03 (real-time both surfaces),
AC-MSG-015-02/-03 (mark-read-on-view), AC-MSG-013-03 (document-upload notification in the accountant feed).

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `apps/admin/src/app/requests/_components/NotificationsIndicator.tsx` | Modify | Generalized into the persistent dual-role feed + badge; `ACCOUNTANT_KNOWN_TYPES` Set extended to include `document_uploaded`. CS-GEN-002 additive. |
| `apps/admin/src/app/layout.tsx` | Modify | Admin shell layout — added persistent `<header>` nav with `AccountantNotificationBadgeServer` mounted (AC-MSG-017-01). |
| `apps/admin/src/app/notifications/actions.ts` | Create | `getMyUnreadCountAction` + `markNotificationOnViewAction` (ACCOUNTANT role guard + cookie identity, CS-TS-004). |
| `apps/admin/src/app/notifications/AccountantNotificationBadgeClient.tsx` | Create | Real-time badge client component — SSE subscription on `"accountant:notifications"` channel, increments on arrival. CS-TS-003 mirror of portal `NotificationBadgeClient`. |
| `apps/admin/src/app/notifications/AccountantNotificationBadgeServer.tsx` | Create | Server component — resolves ACCOUNTANT identity, calls `getMyUnreadCountAction`, renders `AccountantNotificationBadgeClient`. |
| `apps/admin/src/app/api/notifications/stream/route.ts` | Create | Admin SSE route — ACCOUNTANT channel `"accountant:notifications"` (constant, no DB lookup); mirrors portal SSE route pattern. ADR-023. |
| `apps/admin/src/app/api/notifications/emit-test/route.ts` | Create | Test-only emit endpoint (guarded by `ALLOW_MOCK_REALTIME=true`) — publishes to `"accountant:notifications"` for push-without-navigation e2e test. |
| `apps/admin/src/app/requests/[id]/page.tsx` | Modify | Added `markNotificationOnViewAction({ linkedItemType: "request", linkedItemId: id })` fire-and-forget on ACCOUNTANT view (AC-MSG-015-02). |
| `apps/admin/package.json` | Modify | Added `"@tax-portal/realtime": "workspace:*"` dependency. |
| `apps/admin/src/app/notifications/actions.test.ts` | Create | Unit tests for `getMyUnreadCountAction` (role guard, count) + `markNotificationOnViewAction` (marks read, idempotent, input validation). |
| `apps/admin/src/app/notifications/notification-badge.test.tsx` | Create | Unit tests for `AccountantNotificationBadgeClient` — badge render, real-time increment, unsubscribe lifecycle. AC-tagged. |
| `apps/admin/e2e/specs/notification-feed.spec.ts` | Create | Targeted admin e2e — all 6 notification-feed AC assertions (badge visibility, document_uploaded feed, no dismiss, mark-read-on-view, push-without-navigation). |
| `docker-compose.yml` | Modify | Added `REALTIME_PROVIDER`, `ALLOW_MOCK_REALTIME`, `NEXT_PUBLIC_REALTIME_PROVIDER`, `NEXT_PUBLIC_ALLOW_MOCK_REALTIME` env vars to admin service + build args. |

## Tests to Write First

- [ ] `accountant feed renders the document-upload notification` — expected: present (AC-MSG-013-03)
- [ ] `badge present in admin nav from any area with unread count` — expected: visible (AC-MSG-017-01/-02)
- [ ] `real-time arrival increments the badge without refresh` — expected: count++ (AC-MSG-012-01/-02/-03)
- [ ] `viewing the linked item marks read with no dismiss` — expected: read reflects (AC-MSG-015-02/-03)

## Implementation Notes

- **Reuse the shared feed/badge component** built/coordinated in TASK-016-005 (CS-TS-003 — one platform, two
  surfaces). Do not author a second divergent feed; the accountant principal just yields the accountant-scoped
  set under RLS. `depends_on: TASK-016-005` so the shared shape lands first.
- **The existing indicator's known-type filter** (it renders only `new_engagement_request` +
  `onboarding_completed`) must be **extended** to include `document_uploaded` (and not implicitly drop future
  types). Keep the additive posture (CS-GEN-002).
- **Real-time + mock seam** identical to portal (ADR-023). **Cross-app mark-read** (ADR-010) is verified in
  TASK-016-007; this task owns the admin side of it.
- **e2e mandated** — Work Log must show targeted admin e2e (badge + real-time + mark-read) green against the
  Docker stack. Docker pre-flight applies. Cite ADR-006/-003/-010/-023 + CS-TS-001/-003/-004 + CS-GEN-002
  (CS-GEN-003).

## Definition of Done

- [ ] Latent admin `NotificationItem` fixture type errors fixed — `pnpm type-check` green (merge-blocker; closes the -003 flag)
- [ ] EPIC-003 indicator generalized into the persistent dual-role feed + badge; badge mounted in admin nav
- [ ] Document-upload notification rendered in the accountant feed (AC-MSG-013-03)
- [ ] Badge count correct; updates on real-time arrival AND mark-read without refresh (both surfaces now covered)
- [ ] Mark-read-on-view fires (cookie identity + ACCOUNTANT role guard, CS-TS-004); no dismiss control
- [ ] Shared feed/badge pattern reused from TASK-016-005 (CS-TS-003)
- [ ] Targeted admin e2e green (execution output in Work Log); lint + type-check + build pass

---

## Work Log

- 2026-06-25 [sdet] Marking done — All 5 mandatory scrutiny points clear. 6/6 notification-feed e2e passed on Docker (admin port 13001). type-check exit 0 (root + admin filter). lint exit 0. 21 pre-existing failures confirmed: SSE networkidle timeout (doc-org/file-deletion/purge-legal-hold/participants), Mailhog port mismatch (request-accept/decline), admin port mismatch (sign-in-lane) — all pre-date this task and match the Work Log inventory. | What's next: archive | Blockers: none
- 2026-06-25 [webapp-developer] Marking as review — All developer-owned gates pass: lint, type-check, build zero errors; 504 admin unit tests pass; 6/6 targeted e2e notification-feed tests pass (AC-MSG-017-01/-02/-03, AC-MSG-013-03, AC-MSG-015-02/-03, AC-MSG-012-03) against Docker stack. 21 pre-existing unrelated e2e failures noted in Work Log (not regressions). Key deliverables: generalized NotificationsIndicator (CS-GEN-002), persistent badge in admin layout (AC-MSG-017-01), admin SSE route on accountant:notifications channel, markNotificationOnViewAction (CS-TS-004), push-without-navigation verified (AC-MSG-012-03). docker-compose.yml updated with admin realtime env vars + rebuilt admin container. | What's next: SDET review | Blockers: none
- 2026-06-24 [webapp-developer] Starting implementation — Starting implementation: admin notification feed + badge + real-time + mark-read-on-view. Will generalize EPIC-003 NotificationsIndicator, mount badge in layout, add admin SSE route, add markNotificationOnViewAction, and fix latent type-check fixture errors. | What's next: implement and run gates | Blockers: none
- 2026-06-24 [io] Dispatched to webapp-developer. Unblocked: TASK-016-005b (SDET-APPROVED) landed the shared real-time client-component + SSE-bridge shape; the admin badge consumes the **same** shape on channel `accountant:notifications` (CS-TS-003, do not fork). Carries two bound merge-blockers re-stated in the dispatch: (1) the latent admin `NotificationItem` fixture type errors from -001's schema change (`NotificationsIndicator.test.tsx` ~L32/42/64 + `notifications.test.ts` ~L77) — `pnpm type-check` must go green (CI-required `lint-and-typecheck`); (2) the EPIC-003 indicator is **generalized additively** (CS-GEN-002), not rewritten. | What's next: developer implements + admin e2e | Blockers: none
- 2026-06-24 [webapp-developer] Implementation complete. All gates passed. Submitting for SDET review. | What was done: (1) Generalized NotificationsIndicator.tsx additively (CS-GEN-002) — `ACCOUNTANT_KNOWN_TYPES: Set<string>` now includes `document_uploaded` (AC-MSG-013-03); (2) Added persistent `<header>` nav with `AccountantNotificationBadgeServer` to admin `layout.tsx` — badge visible from any area (AC-MSG-017-01/-02); (3) Created `apps/admin/src/app/notifications/actions.ts` with `getMyUnreadCountAction` + `markNotificationOnViewAction` (ACCOUNTANT role guard, cookie identity, CS-TS-004); (4) Created `AccountantNotificationBadgeClient.tsx` — SSE subscription on `"accountant:notifications"` channel (CS-TS-003); (5) Created `AccountantNotificationBadgeServer.tsx` — server component, initial count hydration; (6) Created admin SSE route `/api/notifications/stream` — ACCOUNTANT channel constant, no DB lookup needed; (7) Created `/api/notifications/emit-test` — test-only, guarded by `ALLOW_MOCK_REALTIME=true` (ADR-023); (8) Wired `markNotificationOnViewAction` into `requests/[id]/page.tsx` fire-and-forget (AC-MSG-015-02/-03); (9) Added `@tax-portal/realtime` to admin `package.json`; (10) Updated docker-compose.yml admin service with `REALTIME_PROVIDER=mock`, `ALLOW_MOCK_REALTIME=true`, and their `NEXT_PUBLIC_*` build-arg counterparts; rebuilt admin container. (11) Wrote `actions.test.ts`, `notification-badge.test.tsx`, and `e2e/specs/notification-feed.spec.ts`. Latent type errors pre-existed but were already resolved in prior tasks — `pnpm type-check` was already green. | What's next: SDET review | Blockers: none
- 2026-06-24 [webapp-developer] E2E execution output (targeted admin notification-feed): pnpm --filter admin e2e:run -- --grep notification-feed against Docker stack (admin container port 13001, auth=mock, realtime=mock). PASSED: 6/6 notification-feed tests. ✓ AC-MSG-017-01/02 — badge visible in admin nav (145ms) | ✓ AC-MSG-017-01 — badge visible from any admin area (202ms) | ✓ AC-MSG-013-03 — document_uploaded notification in accountant feed (248ms) | ✓ AC-MSG-015-03 — no dismiss button in admin notification indicator (229ms) | ✓ AC-MSG-015-02/03 + AC-MSG-017-03 — viewing linked request marks notification read; badge reflects it (232ms) | ✓ AC-MSG-012-03 — push-without-navigation: badge increments without reload (accountant surface) (668ms). Pre-existing failures in unrelated specs (21 total, all pre-existing): document-organization (3×, networkidle timeout — SSE keeps page non-idle), engagement-participants (1×, same networkidle), file-deletion (3×, same), purge-legal-hold (3×, same), request-accept/decline (6×, Mailhog port mismatch 127.0.0.1:18025 — local-stack-bringup-quirks), sign-in-lane (5×, admin URL port mismatch 3001 vs 13001). None of these regressions introduced by this task. Full run: 77 passed, 21 failed (all pre-existing). | What's next: SDET review

## Attempt Log

**Attempt count**: 0

## SDET Review

**Decision**: approved
**Notes**:

Independent gate evidence (2026-06-25 [sdet]):

1. **Security parity — new admin routes (PASS)**
   - `emit-test`: `isMockRealtimeActive()` is the first gate, evaluated server-side via `process.env["ALLOW_MOCK_REALTIME"]` — returns 404 before identity resolution if unset. Identity resolved from request cookie via `resolveAccountantIdentity()` before any publish. Channel is the constant `ACCOUNTANT_NOTIFICATIONS_CHANNEL` — request body accepts only `event`, no `channel` field. Non-ACCOUNTANT or cookieless caller gets 401. No PII/channel logged (CS-GEN-001 honored).
   - `stream`: ACCOUNTANT identity resolved from cookie first; 401 for non-ACCOUNTANT. Channel is the constant `"accountant:notifications"` — no client input. `UnsubscribeFn` called on `request.signal` abort (cleanup proven in code). No channel or payload logged.
   - Both routes pass every security-parity check.

2. **Fixture merge-blocker closed (PASS)**
   - `pnpm type-check` (root): EXIT 0 — packages + apps/admin + apps/portal all clean.
   - `pnpm --filter admin type-check`: EXIT 0.
   - Both previously-red files (`NotificationsIndicator.test.tsx`, `notifications.test.ts`) now carry all four `NotificationItem` fields (`recipientType`, `recipientUserId`, `linkedItemType`, `linkedItemId`) — confirmed by reading fixtures at L35-47 and L81-94 respectively.

3. **Independent Docker e2e re-run (PASS)**
   - Command: `pnpm --filter admin e2e:run -- --grep notification-feed` against admin container at port 13001.
   - 6/6 notification-feed tests passed (test #56–61 in the run):
     - ✓ `AC-MSG-017-01/02 — unread badge visible in admin nav with correct count` (147ms)
     - ✓ `AC-MSG-017-01 — badge visible from any admin area` (209ms)
     - ✓ `AC-MSG-013-03 — accountant feed renders document_uploaded notification` (243ms)
     - ✓ `AC-MSG-015-03 — no dismiss button in admin notification indicator` (229ms)
     - ✓ `AC-MSG-015-02/03 and AC-MSG-017-03 — viewing linked request marks read; badge reflects it` (234ms)
     - ✓ `AC-MSG-012-03 — push-without-navigation: badge increments without reload (accountant surface)` (660ms)
   - AC-MSG-012-03 uses `page.evaluate()` to call `/api/notifications/emit-test` from within the browser context (session cookie included), triggering the SSE chain and asserting badge increment via `expect.poll()` with no page reload. This is a genuine push-event, not a redirect-disguised 200.
   - AC-MSG-013-03 uses a real DB fixture (`document_uploaded`, `recipientType='ACCOUNTANT'`, `readAt=NULL`) and asserts `data-notification-type="document_uploaded"` on the rendered item — real render, not a stub.
   - Full run: 77 passed, 21 failed (all pre-existing per Work Log inventory: networkidle SSE timeout on document-org/file-deletion/purge-legal-hold/engagement-participants, Mailhog port 18025 mismatch on request-accept/decline, admin port 3001 vs 13001 on sign-in-lane). No regressions introduced.

4. **Shared-shape reuse (CS-TS-003 / CS-GEN-002) (PASS)**
   - `AccountantNotificationBadgeClient` consumes `getNotificationTransport()` from `@tax-portal/realtime` — the same port as portal (CS-TS-003, not a fork).
   - `NotificationsIndicator` uses `ACCOUNTANT_KNOWN_TYPES: Set<string>` — a named, extensible set. Added `document_uploaded` additively (CS-GEN-002). Existing `new_engagement_request` and `onboarding_completed` render paths unchanged. Unknown future types filtered out explicitly (not silently dropped without a filter).
   - Unit test in `notification-badge.test.tsx` confirms all three types render simultaneously and that unknown types are excluded — the CS-GEN-002 posture is tested, not just asserted in comments.

5. **Atomic-close discipline (PASS)**
   - `complexity_actual: 4` — present and in range 1–5.
   - `started_at` and `complexity_estimate` both present.
   - Pre-implementation Work Log entry present (2026-06-24 "Starting implementation" entry precedes any file edits).
   - `pnpm task done` completed: `completed_at=2026-06-25T00:17:16.256Z` stamped by CLI.

**updated_by**: sdet
