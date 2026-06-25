---
id: BUG-016-002
brief: BRIEF-016
task: TASK-016-005b
status: resolved
resolved_at: 2026-06-25T00:00:00Z
resolved_by: TASK-016-005b fix pass (SDET-approved)
severity: blocking
introduced_by: TASK-016-005b
rejection_reason: |
  (1) AC-MSG-012-03 push-without-navigation still fails in the SDET's independent Docker run —
  the emit-test endpoint is intercepted by the portal middleware and redirected to /sign-in
  because the e2e test calls it from the standalone `request` API context (no session cookie).
  The transport.publish() is never reached; the badge never increments.
  (2) Security: emit-test accepts a caller-supplied `channel` from the request body with no
  server-identity derivation — violates the review mandate for test-only endpoints.
---

# BUG-016-002: AC-MSG-012-03 push-without-navigation still fails — emit-test route auth gap + caller-supplied channel

> **RESOLUTION (2026-06-25):** Fixed in the **TASK-016-005b** fix pass. Two surgical fixes: (1) the
> auth gap — test 56 now calls `/api/notifications/emit-test` via `page.evaluate(async () => fetch(...))`
> so the browser's session cookie is carried (the standalone `request` fixture was removed); (2) the
> security finding — `emit-test/route.ts` no longer accepts a caller-supplied `channel`; it derives
> `channel = user:<User.id>` server-side from the authenticated session via `resolveClientIdentity()` +
> `lookupUserDbId()` (mirroring the stream route). SDET-approved on an independent Docker e2e run: test 56
> passes in ~702ms, badge increments via SSE without reload; CS-GEN-001 (no channel/userId in logs) and
> the fail-closed posture confirmed. This BUG is closed.

## What failed

The SDET's independent Docker e2e run (pnpm --filter portal e2e:run, notification-feed.spec.ts:566:5)
produced the following failure for the load-bearing regression test (test 56):

```
Error: [AC-MSG-012-03] Badge count must increment after push — no page reload.
If this fails, the SSE bridge (SseBrowserMockTransport → /api/notifications/stream)
is not delivering events to the browser. DECISION-016-005b-RT. // ADR-023 §6

Expected: > 1
Received:   1

- Timeout 10000ms exceeded while waiting on the predicate
```

Suite result: 71 passed / 20 failed (including test 56). The developer's Work Log claimed 75 passed /
19 failed with test 56 passing ("badge increments in 689ms"). The independent run contradicts this.

Tests 50–55 (the -005 non-regression ACs) all PASS. Only test 56 (AC-MSG-012-03) fails.

## Root cause — finding 1: middleware intercepts emit-test (auth gap)

The `/api/notifications/emit-test` endpoint is protected by the portal middleware
(`apps/portal/src/middleware.ts` → `applyPortalAuth()`). It is NOT on the public allow-list
and NOT an infra path. When an unauthenticated request hits it, the middleware redirects to
`/sign-in?redirect_url=...`.

The e2e test (notification-feed.spec.ts test 56) calls `request.post(...)` using the Playwright
`APIRequestContext` fixture (`{ page, request }` → standalone `request`). `setupClientSession()`
adds the session cookie to `page.context()` only — NOT to the standalone `request` context. So
`request.post(PORTAL_URL + "/api/notifications/emit-test", ...)` is sent WITHOUT a session cookie.

The middleware redirects to `/sign-in` (302 → 200 HTML). Playwright's `APIRequestContext`
follows redirects and returns a 200 OK (the sign-in HTML page). The test's `emitResponse.ok()`
returns true (status 200), so the assertion at step 4 passes. But `transport.publish()` was
never called — the route handler was never reached. The mock transport has no subscriber event
to fan out, the SSE bridge delivers nothing, and the badge stays at 1.

The `expect.poll()` waits 10s, the badge never increments, the test fails.

### Evidence (SDET curl test)

```bash
curl -sf -X POST -H "Content-Type: application/json" \
  -d '{"channel":"user:test","event":{"type":"notification.created","payload":{}}}' \
  http://localhost:3000/api/notifications/emit-test
# Returns: http://localhost:3000/sign-in?redirect_url=%2Fapi%2Fnotifications%2Femit-test
```

Without a session cookie, the endpoint is unreachable (redirected to sign-in).

## Root cause — finding 2: emit-test accepts caller-supplied channel (security)

`apps/portal/src/app/api/notifications/emit-test/route.ts` lines 72-90 accept
`{ channel: string, event: {...} }` from the request body and call
`transport.publish(channel, event)` with the caller-supplied `channel`.

The SDET review mandate is explicit: "It **cannot emit to a caller-supplied recipient channel.**
The emitted notification's recipient/channel must be derived from the **server-verified session
identity** (cookie), never from a request body/query param the caller controls.
If it accepts a caller-supplied recipient, that is a rejection."

Even though the endpoint is gated behind `ALLOW_MOCK_REALTIME=true`, the channel should be
derived from the authenticated session, not from the caller-controlled body. In the e2e
context, the correct channel to publish to is `user:<fixture.userId>` — but the server should
derive this from the authenticated session, not accept it from the body.

## What IS passing and can stand

- Tests 50–55 (notification-feed.spec.ts): AC-MSG-017-01/-02, AC-MSG-017-01 (unauthenticated),
  AC-MSG-007-03, AC-MSG-015-03, AC-MSG-015-02/03 + AC-MSG-017-03 (mark-read), AC-MSG-015-02
  (View link) — all PASS in the independent run.
- SSE stream route (`/api/notifications/stream`): identity correctly from cookie, no PII in
  logs, UnsubscribeFn cleanup on abort. No changes needed to this route.
- `SseBrowserMockTransport` barrel exclusion: confirmed NOT in `packages/realtime/src/index.ts`.
- Fail-closed posture (ADR-023 §4): real/default still binds the stub; no silent mock fallback.
- `NotificationBadgeClient.tsx`: silent-catch correctly narrowed to `RealtimeBindingNotAvailableError`.
- `packages/realtime/src/select.ts`: selector correctly reads `NEXT_PUBLIC_*` as browser fallback.
- inventory.md: updated with new env vars and SSE routes.
- Docker container: NEXT_PUBLIC_REALTIME_PROVIDER=mock + NEXT_PUBLIC_ALLOW_MOCK_REALTIME=true
  correctly baked in (verified via `docker exec tax-portal-portal env`).

## What MUST be fixed

### Fix 1 (blocking): emit-test must bypass the portal middleware AND derive channel from session

**Option A — Add emit-test to the portal middleware allow-list OR add a custom middleware
exemption:**

In `packages/auth/src/redirect.ts` (or the portal middleware), add `/api/notifications/emit-test`
to the allow-list (or a separate test-only pass-through guarded by `ALLOW_MOCK_REALTIME`). This
allows the unauthenticated Playwright `request` fixture to reach the route handler.

However, this means the endpoint is reachable without ANY auth — only the `isMockRealtimeActive()`
guard controls it. This is acceptable for a test-only endpoint since in production
`ALLOW_MOCK_REALTIME` is unset (endpoint returns 404).

**Option B (preferred for the channel security fix) — Derive channel from session, require auth:**

Instead of accepting `channel` from the body, require an authenticated session and derive the
channel from the server-verified session (`resolveClientIdentity()` + DB lookup, same as the
stream route). The e2e test would then call the endpoint with the page's session context
(via `page.request()` or a properly-shared cookie jar), not the standalone `request` context.

Implementation:
1. Add a session-aware identity resolution to `emit-test/route.ts` (mirrors `stream/route.ts`).
2. Derive the channel from `user:<User.id>` (or support a query param for the channel TYPE,
   e.g. `?channel=client` → resolved server-side to `user:<User.id>`).
3. Update the e2e test (test 56) to use `page.request()` (the page-context-aware API client
   that shares the browser session) instead of the standalone `request` fixture.

**Option C — Use `page.evaluate()` to call the endpoint from within the browser context:**

The browser page already has the session cookie. Use `page.evaluate()` to make the fetch
from inside the browser, which carries the session cookies:

```typescript
await page.evaluate(async (params) => {
  const res = await fetch('/api/notifications/emit-test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error(`emit-test returned ${res.status}`);
}, { channel: emitChannel, event: { type: 'notification.created', payload: {...} } });
```

This avoids needing to change the middleware or route handler. The browser's session cookie
is automatically included in the fetch. The route handler still needs the `channel` field
from the body (or derive it from the session — see Option B for the cleaner approach).

**Recommended fix: Option C for the auth gap + Option B channel derivation for the security fix.**

The cleanest approach:
1. Use `page.evaluate()` for the e2e call (fixes the auth gap without touching middleware).
2. Have `emit-test/route.ts` resolve the channel from the authenticated session (like
   `stream/route.ts`) — removes the caller-supplied channel security concern.
3. The endpoint body changes to `{ event: { type, payload } }` (no `channel` field needed).

### Fix 2 (required): Remove caller-supplied `channel` from emit-test body

The `channel` field must be removed from the accepted body. The route should resolve the
channel from the session (same cookie→identity→DB-lookup path as `stream/route.ts`).

If the test needs to publish to a specific test fixture's channel, the route can:
- Derive the channel from the authenticated session (cleanest).
- OR accept a `channelType` enum (`"user"` | `"accountant"`) and resolve the actual channel
  server-side from the session identity.

Never accept a raw channel string from the caller.

## Steps to reproduce

1. Start the docker-compose stack (portal container with ALLOW_MOCK_REALTIME=true, NEXT_PUBLIC_* baked in).
2. Run: `pnpm --filter portal e2e:run -- --grep notification-feed`
3. Observe test 56 fails with "Expected: > 1, Received: 1, Timeout 10000ms exceeded".
4. Curl verify: `curl -sf -X POST -H "Content-Type: application/json" -d '{"channel":"user:test","event":{"type":"notification.created","payload":{}}}' http://localhost:3000/api/notifications/emit-test` → returns the sign-in page HTML (middleware redirect).

## Expected behavior (per AC-MSG-012-03 and the brief)

With the portal page open (no navigation), the badge increments within the same page load when
a new notification is published by the server via the mock transport. Test 56 must pass.

## Actual behavior

The badge stays at 1. The `transport.publish()` is never called because the emit-test route
handler is never reached — the middleware redirects the unauthenticated request to sign-in.

## Testability

A regression test IS required and WAS authored (test 56 in notification-feed.spec.ts). The
test is correct in structure but broken in execution because the `request` fixture does not
carry the session cookie. Fix the test to use `page.evaluate()` or `page.request()` and fix
the route to derive the channel from the session.

## SDET Notes — other findings (non-blocking for this BUG, but to address in the fix)

- The `isMockRealtimeActive()` guard in emit-test also reads `NEXT_PUBLIC_ALLOW_MOCK_REALTIME`
  from `process.env`. In server context, this is set. In production, neither var is set →
  returns false → 404. Gate is server-evaluated. Not a security hole, but redundant — the
  `NEXT_PUBLIC_` variant is for browser bundle inlining, not server-side reads. Worth cleaning
  up in the fix.
