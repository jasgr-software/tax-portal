---
id: BUG-016-001
brief: BRIEF-016
task: TASK-016-005
status: resolved
resolved_at: 2026-06-25T00:00:00Z
resolved_by: TASK-016-005b (SDET-approved)
severity: blocking
introduced_by: TASK-016-005
rejection_reason: AC-MSG-012-03 has no passing real-time assertion — NotificationBadgeClient degrades to server-fetched count (transport throws in browser bundle), violating ADR-023 §6 behavior-faithful mock requirement.
---

> **RESOLUTION (2026-06-25):** Fixed by **TASK-016-005b** (browser-reachable mock realtime SSE bridge,
> `fixes: BUG-016-001`). The fix realized the mock transport as an SSE bridge (`SseBrowserMockTransport`
> → `/api/notifications/stream`) reachable from the browser bundle, plus a push-without-navigation
> regression assertion (notification-feed.spec.ts test 56). SDET-approved on an independent Docker e2e
> run: tests 50–56 all pass; test 56 (AC-MSG-012-03) increments the badge without reload in ~702ms.
> TASK-016-007's independent isolated-stack re-run further confirmed 11/11 portal + 6/6 admin
> notification-feed specs pass. AC-MSG-012-03 is proven. This BUG is closed.

# BUG-016-001: AC-MSG-012-03 unproven — browser transport throws, badge degrades to server-fetch only

## What failed

**AC-MSG-012-03** ("The unread-count badge reflects real-time arrival of new notifications") has **no
passing e2e assertion** that a push-without-navigation event increments the badge. The six portal e2e
tests (50–55) do NOT include a test where:
  - the page is open and idle (no navigation),
  - a notification is emitted server-side, and
  - the badge count increments without a manual refresh or navigation.

The spec itself documents the gap at line 22–26 and the Note block at line 441–443:
> "DECISION-016-005-RT: Real-time badge increment/decrement via the browser subscription is NOT
>  verifiable end-to-end without a real SSE/WebSocket provider (Phase 5 scope)."

This is not a graceful degradation the brief permits — see § Root cause below.

## Root cause

`REALTIME_PROVIDER` and `ALLOW_MOCK_REALTIME` are set as **server-side** environment variables in
`docker-compose.yml` (no `NEXT_PUBLIC_` prefix). Next.js does NOT inline server-only env vars into the
browser bundle at build time.

At runtime in the browser:
  - `process.env["REALTIME_PROVIDER"]` → `undefined`
  - selector defaults to `"supabase-realtime"`
  - `ALLOW_MOCK_REALTIME` → `undefined` (falsy)
  - No contradiction guard fires (correct behavior)
  - `getNotificationTransport()` returns `SupabaseRealtimeTransport` (stub)
  - `transport.subscribe(...)` throws `RealtimeBindingNotAvailableError`
  - `NotificationBadgeClient`'s try/catch catches the throw → **no subscription, no push handling**

The badge renders the server-fetched `initialUnreadCount` (correct) but never increments on arrival
(violates AC-MSG-012-03, AC-MSG-017-03's real-time path, AC-MSG-012-01/-02).

## Why this is a rejection (not a deferred limitation)

**ADR-023 §6** is explicit: "A mock must be deterministic and faithful to the port's *behavior* (same
shapes, same success/failure outcomes the real provider yields at the seam)." A transport that throws
at `subscribe()` time is not behavior-faithful to the seam — the real Supabase Realtime transport does
NOT throw at subscription time; it establishes a subscription and delivers events.

**The brief's extra_gates** (front matter) explicitly state, as a HARD tier-6 gate:
> "Tier-6 e2e real-time arrival, BOTH surfaces (ADR-023 mock seam / ADR-006 / ADR-012): with the
>  portal open, an entitled event surfaces in the feed and increments the badge without a manual
>  refresh (AC-MSG-012-01/-02/-03, AC-MSG-017-01/-02/-03). Delivered behind the mockable real-time
>  transport seam (ADR-023); real provider → Phase 5."

This gate specifies the **mock seam** as the realization — not a deferred Phase 5 obligation.

**The brief's § Scope cap. 4** says: "A new notification is delivered to an open portal in real time —
it surfaces in the feed and increments the badge without a manual refresh. Real-time transport is
consumed behind a mockable provider seam (ADR-023); the **mock realization** is what this slice
verifies."

**The IO dispositioned DECISION-016-005-RT as Option (a): in-scope, must be fixed** before this
task can be approved.

## What IS passing and can stand

The following ACs are proven by the passing tests and may remain done once the fix lands:

- **AC-MSG-017-01** (badge present in nav from any area) — test 50 passes.
- **AC-MSG-017-02** (badge shows unread count) — test 50 passes.
- **AC-MSG-007-03** (feed is the authoritative record; notifications appear) — test 52 passes.
- **AC-MSG-015-02** (viewing linked item marks notification read) — test 54 passes; the View link test 55 passes.
- **AC-MSG-015-03** (no dismiss button) — test 53 passes.
- **AC-MSG-017-03** (badge reflects read state after mark-read via server re-fetch) — test 54's post-navigate count check passes (server-side path only).

## What MUST be fixed

**AC-MSG-012-03** requires a new e2e assertion that proves: **page open, no navigation, event fired
server-side → badge count increments in the browser**.

The fix requires making `REALTIME_PROVIDER` and `ALLOW_MOCK_REALTIME` reachable in the browser bundle.
Two viable approaches:

### Option A (preferred): Use `NEXT_PUBLIC_` prefix for the transport selector env vars

In `apps/portal/next.config.mjs` (and `apps/admin/next.config.mjs`), expose:
  - `NEXT_PUBLIC_REALTIME_PROVIDER`
  - `NEXT_PUBLIC_ALLOW_MOCK_REALTIME`

In `packages/realtime/src/select.ts`, read `NEXT_PUBLIC_REALTIME_PROVIDER` (and fall back to
`REALTIME_PROVIDER` for the server-side path). Update docker-compose to set both variants.

Add a new e2e test (e.g. test 56) that:
  1. Seeds a client user + fixture notification + sets the session.
  2. Navigates to the portal home and captures the initial badge count.
  3. **Without navigating**, calls a server action (or direct DB insert via admin pool) to emit a
     new notification for this user.
  4. Waits (using Playwright's `expect.poll` or a locator auto-wait) for the badge count to increment.
  5. Asserts the badge count increased without a page reload.

### Option B: Use an SSE / polling endpoint the browser can subscribe to

If `NEXT_PUBLIC_*` env var approach is architecturally undesirable, an alternative is a Next.js
route handler that returns an SSE stream; `NotificationBadgeClient` subscribes to the SSE endpoint
rather than to `getNotificationTransport()` directly. However, this is a more invasive change and
may warrant an IO architectural decision before implementation.

**Recommendation: Option A.** The `NEXT_PUBLIC_` approach is minimal, follows the mock-seam pattern,
and keeps the ADR-023 port consistent.

## Steps to reproduce

1. Start the docker-compose stack with `REALTIME_PROVIDER=mock` + `ALLOW_MOCK_REALTIME=true` set
   in the server environment (not `NEXT_PUBLIC_`).
2. Open the portal in a browser (authenticated as a CLIENT with 1 unread notification).
3. Observe: badge shows the server-fetched count.
4. Trigger a new notification server-side (via a direct DB INSERT or a source-event action).
5. Observe: badge does NOT increment. The badge only updates on navigation or page reload.

In the browser devtools console, no subscription is established; the catch block in
`NotificationBadgeClient.tsx` line 144 fires silently.

## Expected behavior (per AC-MSG-012-03 and the brief)

With the portal page open (no navigation), the badge increments within the same page load when a
new notification is published by the server via the mock transport. The mock transport is
behavior-faithful (ADR-023 §6): subscribe → receive push events → badge reacts.

## Actual behavior

The badge renders the server-fetched count at page load and never changes during the same page
load. The mock transport is unreachable in the browser bundle because `REALTIME_PROVIDER` is a
server-only env var.

## Fix task

This fix rides **TASK-016-005b** (browser-reachable mock binding + a real push-without-navigation
e2e assertion). The fix task should scope to:
1. Making `REALTIME_PROVIDER` and `ALLOW_MOCK_REALTIME` browser-reachable (via `NEXT_PUBLIC_` or
   equivalent).
2. Adding a Playwright test asserting push-without-navigation arrival increments the badge.
3. Confirming `NotificationBadgeClient` successfully subscribes in the browser (no thrown exception
   on subscribe).

All other TASK-016-005 ACs (017-01, 017-02, 007-03, 015-02, 015-03, 017-03 server path) remain
passing and do not need re-work.

## Testability

A regression test IS required (ENGINE.md § Bug Fixes). The fix task must include the
push-without-navigation e2e assertion (point 2 above). No testability escape-hatch applies.
