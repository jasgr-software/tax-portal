/**
 * apps/admin/src/app/api/notifications/stream/route.ts — SSE bridge for accountant real-time
 *
 * EPIC-016 / TASK-016-006 — Mirrors apps/portal/src/app/api/notifications/stream/route.ts
 * but for the ACCOUNTANT surface (apps/admin).
 *
 * This route bridges the in-process MockNotificationTransport into an HTTP SSE stream
 * that the browser can subscribe to. It is the server half of the browser-reachable mock
 * binding for the accountant surface.
 *
 * DECISION-016-006-SSE (TASK-016-006 / ADR-023):
 *   The browser-variant SseBrowserMockTransport (packages/realtime/src/bindings/sse-browser.ts)
 *   opens an EventSource to /api/notifications/stream on the admin origin (same-origin request).
 *   This route:
 *     1. Resolves the caller's identity from the request cookie (CS-TS-004).
 *     2. Guards the ACCOUNTANT role — 401 for non-ACCOUNTANT.
 *     3. Subscribes to the server-side getNotificationTransport() (in-process mock) on
 *        the "accountant:notifications" channel (the shared channel for all ACCOUNTANT events).
 *     4. Writes each incoming event as an SSE message to the response stream.
 *     5. Cleans up the subscription when the client disconnects (AbortSignal).
 *
 *   Channel convention: ACCOUNTANT → "accountant:notifications" (shared channel).
 *   This is the channel emitAndPublishNotification() publishes to for ACCOUNTANT recipients.
 *   (notification.ts:400-404: ACCOUNTANT_NOTIFICATIONS_CHANNEL = "accountant:notifications").
 *
 *   Unlike the portal stream route (which derives a per-user channel from User.id),
 *   the ACCOUNTANT channel is a shared singleton channel — no DB lookup needed.
 *   All ACCOUNTANT notifications are published to the same shared channel. // DECISION-016-006-SSE
 *
 * ADR-023 §1/§2/§6 — mock seam: This route is the mock binding's server-side bridge.
 *   The SSE here is an implementation detail of making the mock reachable from the browser —
 *   NOT the system's real-time transport choice (Phase 5). Do not author a transport ADR here.
 *   // ADR-023
 *
 * ADR-006 — monorepo: This route is ACCOUNTANT-facing (apps/admin). The CLIENT equivalent
 *   lives in apps/portal/src/app/api/notifications/stream/route.ts. // ADR-006 // CS-TS-003
 *
 * ADR-003 — SESSION_CONTEXT: identity resolution mirrors getAccountantIdentity() in
 *   apps/admin/src/app/notifications/actions.ts (CS-TS-004). // ADR-003
 *
 * ADR-010 — no public routes on apps/admin. The middleware guarantees ACCOUNTANT, but
 *   this route adds defense-in-depth (mirrors the pattern in requests/actions.ts). // ADR-010
 *
 * CS-TS-001: DB access via getAdminPool from @tax-portal/db (only for identity pattern;
 *   the accountant channel is a constant — no DB lookup needed here). // CS-TS-001
 * CS-TS-004: identity resolved from cookie before any subscription. // CS-TS-004
 * CS-GEN-001: no PII in logs — channel and event payload are NOT logged. // CS-GEN-001
 * CS-GEN-003: cite governing authority in comments. // CS-GEN-003
 */

import { getNotificationTransport } from "@tax-portal/realtime";
import type { NotificationEvent } from "@tax-portal/realtime";
// F5: identity helper extracted to shared _lib to eliminate verbatim duplication
// between stream/route.ts and emit-test/route.ts. // CS-TS-004 // ADR-010
import { resolveAccountantIdentity } from "../_lib/notification-identity";

// ─── Channel constant ─────────────────────────────────────────────────────────

/**
 * The shared ACCOUNTANT notifications channel.
 *
 * This is the channel emitAndPublishNotification() publishes to for ACCOUNTANT recipients.
 * notification.ts:400-404 defines the convention: ACCOUNTANT → "accountant:notifications".
 * Unlike the CLIENT channel ("user:<User.id>"), the ACCOUNTANT channel is a shared singleton
 * — no per-user discrimination needed for the single accountant user.
 *
 * DECISION-016-006-SSE: No DB lookup needed for the ACCOUNTANT channel — it is a constant.
 *   This is a simplification over the portal route (which needs a User.id lookup).
 *   The channel is derived entirely server-side from the role guard — no client input.
 */
const ACCOUNTANT_NOTIFICATIONS_CHANNEL = "accountant:notifications";

// ─── SSE Route handler ────────────────────────────────────────────────────────

/**
 * GET /api/notifications/stream — SSE bridge for the mock real-time transport (ACCOUNTANT).
 *
 * Establishes a server-sent event stream for the authenticated ACCOUNTANT.
 * The channel is "accountant:notifications" (a constant derived from the ACCOUNTANT role guard).
 *
 * DECISION-016-006-SSE // ADR-023 // CS-TS-004 // CS-GEN-001
 */
export async function GET(request: Request): Promise<Response> {
  // CS-TS-004: resolve ACCOUNTANT identity from cookie before any operation.
  const identity = await resolveAccountantIdentity();
  if (!identity) {
    // Unauthenticated or non-ACCOUNTANT session — do not open a stream.
    // Return 401 immediately; the browser EventSource will stop connecting.
    // ADR-010: ACCOUNTANT-only route. // ADR-010
    return new Response("Unauthorized", { status: 401 });
  }

  // DECISION-016-006-SSE: the ACCOUNTANT channel is a constant — no DB lookup needed.
  // The channel is "accountant:notifications" — the shared channel for all ACCOUNTANT events.
  // CS-GEN-001: channel is not logged. // CS-GEN-001
  const channel = ACCOUNTANT_NOTIFICATIONS_CHANNEL;

  // Subscribe to the in-process MockNotificationTransport for the accountant channel.
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
    const line = `data: ${JSON.stringify(event)}\n\n`;
    writer.write(encoder.encode(line)).catch(() => {
      // Stream closed (client disconnected) — the unsubscribe (below) handles cleanup.
    });
  }

  // Subscribe to the in-process mock on the accountant channel.
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
