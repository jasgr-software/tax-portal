/**
 * packages/realtime/src/bindings/sse-browser.ts — SSE-backed browser-variant mock binding
 *
 * DECISION-016-005b-RT (TASK-016-005b): This is the browser reachability layer for
 * the mock real-time transport. The in-process MockNotificationTransport is a per-process
 * singleton; the browser is a separate process and cannot reach the server's mock instance.
 * This binding bridges the gap by opening an EventSource to the portal SSE route, which
 * bridges the in-process mock into an HTTP stream the browser can receive.
 *
 * ADR-023 §1 — port + bindings + selector: This is a binding variant; it satisfies the
 *   same NotificationTransport port contract as MockNotificationTransport. Apps depend on
 *   the port only (getNotificationTransport()); they never import this class directly.
 *   The SSE route is the mock binding's transport for the POC — an implementation detail of
 *   making the mock reachable from the browser — NOT the system's chosen real-time provider.
 *   Do not author a transport ADR here (BRIEF-016 § Notes is explicit). // ADR-023
 *
 * ADR-023 §2 — mock-first: This binding is the browser-facing half of the mock realization.
 *   The server-facing half remains MockNotificationTransport (unchanged, CS-GEN-002 additive).
 *   The real-provider binding (the deferred Phase-5 enablement) would replace this. // ADR-023
 *
 * ADR-023 §4 — fail-closed: This binding is only reachable under the mock opt-in
 *   (NEXT_PUBLIC_ALLOW_MOCK_REALTIME=true). A real/default config still binds the throwing
 *   SupabaseRealtimeTransport stub. No silent mock fallback. // ADR-023
 *
 * ADR-006 / CS-TS-003 — shared shape: The SSE route path and this binding are designed
 *   so that TASK-016-006 (admin badge) can consume the same pattern for the accountant
 *   channel (accountant:notifications). // ADR-006 // CS-TS-003
 *
 * CS-GEN-001 — no PII in logs: the channel string (which encodes a user identity) is NOT
 *   logged. // CS-GEN-001
 *
 * CS-GEN-002 — additive: MockNotificationTransport is not rewritten. This is a NEW class
 *   that lives alongside it. // CS-GEN-002
 *
 * CS-GEN-003 — cite governing authority. // CS-GEN-003
 *
 * IMPORTANT: This file is intentionally NOT exported from index.ts barrel.
 *   Binding classes must not leak into the public API (ADR-023 §1 / barrel leak-check).
 */

import type {
  NotificationTransport,
  NotificationChannel,
  NotificationEvent,
  NotificationSubscriber,
  UnsubscribeFn,
} from "../port.js";

// ─── SSE route path ───────────────────────────────────────────────────────────

/**
 * The SSE route this binding connects to.
 *
 * Path: /api/notifications/stream
 *
 * The route lives on the same origin as the calling app (portal or admin).
 * The server side bridges the in-process MockNotificationTransport into the stream.
 * Channel is derived from the cookie-verified session on the server — NOT from a
 * query param supplied by this client (AC-MSG-014-07 entitlement boundary). // ADR-023
 *
 * DECISION-016-005b-RT: The route is app-local (same origin) — the browser can reach
 * it without CORS configuration. TASK-016-006 (admin) creates the same route on admin.
 */
const SSE_ROUTE_PATH = "/api/notifications/stream";

// ─── SseBrowserMockTransport ──────────────────────────────────────────────────

/**
 * SseBrowserMockTransport — Browser-variant mock real-time transport.
 *
 * In the browser, `subscribe()` opens an EventSource to the SSE bridge route.
 * The server side of that route subscribes to the in-process MockNotificationTransport
 * and writes events to the stream. This makes the in-process mock's fan-out reachable
 * in the browser without a real SSE/WebSocket provider.
 *
 * `publish()` is NOT implemented (N/A in the browser — publication is server-side).
 *   If called from the browser, it throws a descriptive error. Production code must
 *   never call publish() from a browser context — that is a server-side concern.
 *
 * This class satisfies the NotificationTransport port: it does not throw at subscribe()
 * time (unlike SupabaseRealtimeTransport which throws at call-time — the BUG-016-001
 * root cause). // ADR-023 §6 — behavior-faithful: subscribe → receive push → no throw.
 *
 * DECISION-016-005b-RT: The SSE bridge is the mock binding's browser reachability.
 *   It is NOT a new provider and NOT the system's real-time transport choice (Phase 5).
 */
export class SseBrowserMockTransport implements NotificationTransport {
  /**
   * publish() is a server-side concern.
   *
   * This binding exists for browser-side subscribe(). If publish() is ever called
   * from the browser, it throws a descriptive error so the caller can diagnose the
   * misconfiguration.
   *
   * ADR-023 §6: the browser does NOT publish notifications — that is the server-side
   * emit path (emitAndPublishNotification in packages/db). // ADR-023
   */
  async publish(_channel: NotificationChannel, _event: NotificationEvent): Promise<void> {
    throw new Error(
      "[SseBrowserMockTransport] publish() must not be called from the browser. " +
        "Notification publication is server-side only (emitAndPublishNotification, packages/db). " +
        "DECISION-016-005b-RT / ADR-023 §1.",
    );
  }

  /**
   * Subscribe to notification events by opening an EventSource to the SSE route.
   *
   * The channel parameter is accepted for interface compliance but is NOT sent to the
   * server as a query parameter — the server derives the channel from the cookie-verified
   * session only (AC-MSG-014-07 entitlement boundary, CS-TS-004). The server subscribes
   * to the caller's own channel. // ADR-023 // CS-TS-004
   *
   * CS-GEN-001: the channel string (which encodes a user identity) is NOT logged. // CS-GEN-001
   *
   * Returns an UnsubscribeFn that closes the EventSource on cleanup. The caller MUST
   * invoke it on component unmount to prevent resource leaks. // ADR-023
   *
   * @param _channel    Accepted for port compliance. Not sent to the server (security boundary).
   * @param subscriber  Callback invoked on each incoming notification event.
   * @returns           UnsubscribeFn — closes the EventSource and stops event delivery.
   */
  subscribe(_channel: NotificationChannel, subscriber: NotificationSubscriber): UnsubscribeFn {
    // Open EventSource to the SSE bridge route.
    // The server derives the channel from the cookie-verified session — NOT from a URL param.
    // DECISION-016-005b-RT: same-origin request; no CORS needed. // ADR-023
    const eventSource = new EventSource(SSE_ROUTE_PATH);

    // Handle incoming SSE messages: parse the JSON event and invoke the subscriber.
    // CS-GEN-001: do NOT log the event payload (it may carry user-context data). // CS-GEN-001
    eventSource.onmessage = (msgEvent: MessageEvent) => {
      try {
        const parsed: unknown = JSON.parse(msgEvent.data as string);
        if (
          parsed !== null &&
          typeof parsed === "object" &&
          "type" in parsed &&
          typeof (parsed as { type: unknown }).type === "string"
        ) {
          // Deliver the event to the subscriber in the same shape the in-process mock delivers.
          // ADR-023 §6: behavior-faithful — same event shape as server-side publish(). // ADR-023
          subscriber(parsed as NotificationEvent);
        }
        // Malformed events: silently skip — do not throw (defensive; the server controls the shape).
      } catch {
        // JSON parse error: malformed SSE data — silently skip.
        // CS-GEN-001: do not log the raw data (it may carry user-context data). // CS-GEN-001
      }
    };

    // Return cleanup function — closes the EventSource on component unmount.
    // ADR-023: the port contract requires caller to invoke UnsubscribeFn on cleanup. // ADR-023
    return () => {
      eventSource.close();
    };
  }
}
