/**
 * apps/portal/src/app/api/notifications/stream/route.ts — SSE bridge for mock real-time transport
 *
 * This route bridges the in-process MockNotificationTransport into an HTTP SSE stream
 * that the browser can subscribe to. It is the server half of the browser-reachable mock
 * binding introduced in TASK-016-005b (BUG-016-001 fix).
 *
 * DECISION-016-005b-RT (TASK-016-005b / ADR-023):
 *   The browser-variant SseBrowserMockTransport (packages/realtime/src/bindings/sse-browser.ts)
 *   opens an EventSource to this route. This route:
 *     1. Resolves the caller's identity from the request cookie (CS-TS-004).
 *     2. Looks up the caller's DB User.id via the admin pool (CS-TS-001/-002).
 *     3. Derives the caller's subscription channel from the server-verified session + DB lookup.
 *        Channel = "user:<User.id>" — matching the channel emitAndPublishNotification() publishes to.
 *        The channel is NEVER taken from a query param or client-supplied header
 *        (AC-MSG-014-07 entitlement boundary — a client must not subscribe to another user's
 *        channel). // DECISION-016-005b-RT
 *     4. Subscribes to the server-side getNotificationTransport() (the in-process mock)
 *        on the caller's own channel.
 *     5. Writes each incoming event as an SSE message to the response stream.
 *     6. Cleans up the subscription when the client disconnects (AbortSignal).
 *
 * Channel convention (UNCHANGED from TASK-016-003 / notification.ts):
 *   CLIENT  → "user:<User.id>"         (DB UUID from the Notification.recipientUserId column)
 *   ACCOUNTANT → "accountant:notifications" (handled by apps/admin SSE route — TASK-016-006)
 *
 * This route subscribes to "user:<User.id>" — exactly the channel emitAndPublishNotification()
 * publishes to (notification.ts:402-404). The channel is NOT "user:<clerkUserId>".
 *
 * ADR-023 §1/§2/§6 — mock seam: This route is the mock binding's server-side bridge.
 *   The SSE here is an implementation detail of making the mock reachable from the browser —
 *   NOT the system's real-time transport choice (Phase 5). Do not author a transport ADR here.
 *   // ADR-023
 *
 * ADR-003 — SESSION_CONTEXT: identity resolution mirrors getClientIdentity() in
 *   apps/portal/src/app/notifications/actions.ts (CS-TS-004). The DB lookup (User.id by
 *   clerkId) uses the admin pool (CS-TS-001/-002) — the request pool is not used here
 *   because the SSE connection is long-lived; using the request pool for a blocking lookup
 *   before the stream starts is acceptable but the admin pool is safer for startup reads.
 *   // ADR-003
 *
 * ADR-006 — monorepo: This route is CLIENT-facing (apps/portal). TASK-016-006 (admin)
 *   creates the equivalent route for the ACCOUNTANT surface (channel "accountant:notifications").
 *   // ADR-006 // CS-TS-003
 *
 * CS-TS-001/-002 — DB access only through packages/db wrapper or admin pool; never import raw pools
 *   outside packages/db. The getAdminPool() import is the only admin-pool import allowed here —
 *   it is the packages/db-exported admin pool. // CS-TS-001 // CS-TS-002
 * CS-TS-004 — identity resolved from cookie before any operation. // CS-TS-004
 * CS-GEN-001 — the channel string and the event payload are NOT logged. // CS-GEN-001
 * CS-GEN-003 — cite governing authority in comments. // CS-GEN-003
 */

import { getNotificationTransport } from "@tax-portal/realtime";
import type { NotificationEvent } from "@tax-portal/realtime";
// F5: identity helpers extracted to shared _lib to eliminate verbatim duplication
// between stream/route.ts and emit-test/route.ts. // CS-TS-004 // CS-TS-001 // CS-TS-002
import { resolveClientIdentity, lookupUserDbId } from "../_lib/notification-identity.js";

// ─── SSE Route handler ────────────────────────────────────────────────────────

/**
 * GET /api/notifications/stream — SSE bridge for the mock real-time transport.
 *
 * Establishes a server-sent event stream for the authenticated CLIENT.
 * The channel is derived from the session cookie + DB User.id lookup — NOT from query params.
 *
 * ADR-023 // DECISION-016-005b-RT // CS-TS-001 // CS-TS-002 // CS-TS-004 // CS-GEN-001
 */
export async function GET(request: Request): Promise<Response> {
  // CS-TS-004: resolve identity from cookie before any operation.
  const identity = await resolveClientIdentity();
  if (!identity) {
    // Unauthenticated or non-CLIENT session — do not open a stream.
    // Return 401 immediately; the browser EventSource will stop connecting.
    return new Response("Unauthorized", { status: 401 });
  }

  // DECISION-016-005b-RT: look up the DB User.id so the subscription channel matches
  // what emitAndPublishNotification() publishes to ("user:<User.id>", not "user:<clerkId>").
  // CS-TS-001: DB access via getAdminPool from @tax-portal/db. // CS-TS-001
  // CS-GEN-001: userDbId is NOT logged. // CS-GEN-001
  const userDbId = await lookupUserDbId(identity.clerkUserId);
  if (!userDbId) {
    // User not in DB (not yet invited/onboarded) — no valid channel to subscribe to.
    return new Response("User not found", { status: 404 });
  }

  // SECURITY — channel from server session + DB lookup ONLY (AC-MSG-014-07 entitlement boundary):
  // The channel is "user:<User.id>" — the DB UUID. This matches the channel that
  // emitAndPublishNotification() publishes to (notification.ts:402-404).
  // The channel is derived entirely server-side — NEVER from a URL parameter or
  // client-supplied header. A CLIENT can only receive events for their own channel.
  // DECISION-016-005b-RT // ADR-023 // CS-GEN-001 (channel not logged)
  const channel = `user:${userDbId}`;

  // Subscribe to the in-process MockNotificationTransport for this channel.
  // The server-side mock is the singleton that emitAndPublishNotification() publishes to.
  // ADR-023: getNotificationTransport() returns the active binding (in-process mock in e2e). // ADR-023
  const transport = getNotificationTransport();

  // Create the SSE response stream.
  // ReadableStream with a TransformStream allows us to push events asynchronously.
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  /**
   * Write an SSE message to the stream.
   * CS-GEN-001: event.payload is forwarded opaquely — NOT logged here. // CS-GEN-001
   */
  function writeEvent(event: NotificationEvent): void {
    // SSE format: each message is "data: <json>\n\n"
    // The event shape matches NotificationEvent (port.ts) — UNCHANGED.
    const line = `data: ${JSON.stringify(event)}\n\n`;
    writer.write(encoder.encode(line)).catch(() => {
      // Stream closed (client disconnected) — the unsubscribe (below) handles cleanup.
    });
  }

  // Subscribe to the in-process mock on the caller's channel.
  // The unsubscribe function is stored and called on stream close.
  // ADR-023: subscribe returns UnsubscribeFn — MUST be called on cleanup. // ADR-023
  const unsubscribe = transport.subscribe(channel, writeEvent);

  // Cleanup on client disconnect (AbortSignal fires when the EventSource closes).
  // ADR-023: the port contract requires calling UnsubscribeFn on cleanup. // ADR-023
  const signal = request.signal;
  signal.addEventListener(
    "abort",
    () => {
      unsubscribe();
      writer.close().catch(() => {
        // Already closed — ignore.
      });
    },
    { once: true },
  );

  // Return the SSE response with appropriate headers.
  // Content-Type: text/event-stream — the standard SSE MIME type.
  // Cache-Control: no-cache, no-store — prevent caching of the SSE stream.
  // Connection: keep-alive — the connection must remain open for event delivery.
  // X-Accel-Buffering: no — disables Nginx proxy buffering for SSE proxied through Nginx.
  return new Response(readable, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-store",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
