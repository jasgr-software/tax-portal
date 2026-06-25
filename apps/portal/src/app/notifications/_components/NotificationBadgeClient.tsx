/**
 * apps/portal/src/app/notifications/_components/NotificationBadgeClient.tsx
 *
 * Client-side notification badge that:
 *   1. Renders the initial unread count (server-fetched and passed as prop)
 *   2. Subscribes to the real-time transport for live notification arrival
 *   3. Increments the badge count when a new notification arrives — no manual refresh
 *   4. Decrements the badge count when a notification is marked read (via real-time event)
 *
 * This is a "use client" component because it needs useEffect/useState for the real-time
 * subscription lifecycle and badge state updates.
 *
 * The initial count comes from the server-rendered layout (avoids layout flicker):
 *   - The layout (server component) calls getMyUnreadCountAction() and passes initialCount.
 *   - This component hydrates with that count and subscribes to real-time events.
 *   - On 'notification.created' events, it increments the count without a page refresh.
 *   - On 'notification.read' events, it decrements the count.
 *
 * AC-MSG-012-03: unread-count badge reflects real-time arrival — this component is the
 *   mechanism that makes the badge increment without a manual refresh.
 * AC-MSG-017-01: badge is in navigation (mounted by layout) — visible from any area.
 * AC-MSG-017-02: badge shows the CLIENT's unread count.
 * AC-MSG-017-03: badge updates on read (real-time event) AND on arrival (real-time event).
 *
 * ADR-023: transport consumed via getNotificationTransport() (the port — never a binding).
 *   REALTIME_PROVIDER=mock + ALLOW_MOCK_REALTIME=true is active in e2e. // ADR-023
 * ADR-006: portal-only client component (CLIENT feed surface). // ADR-006
 * CS-GEN-001: no PII logged — channel uses clerkUserId (session-derived); event payload
 *   treated as opaque at this layer. // CS-GEN-001
 * CS-GEN-003: governing keys cited. // CS-GEN-003
 */

"use client";

import { useState, useEffect } from "react";
import { getNotificationTransport } from "@tax-portal/realtime";
import type { NotificationEvent } from "@tax-portal/realtime";

// ─── Event type constants ─────────────────────────────────────────────────────

/**
 * Real-time event type published when a new notification is created.
 * Published by TASK-016-004 (source-event wiring) after emitNotification().
 * The badge increments on this event — AC-MSG-012-03.
 */
const EVENT_NOTIFICATION_CREATED = "notification.created";

/**
 * Real-time event type published when a notification is marked read.
 * Published by the server action (markNotificationOnViewAction) after the DB write.
 * The badge decrements on this event — AC-MSG-017-03.
 */
const EVENT_NOTIFICATION_READ = "notification.read";

// ─── Props ────────────────────────────────────────────────────────────────────

export interface NotificationBadgeClientProps {
  /**
   * Initial unread count — server-fetched in the layout, passed as hydration seed.
   * AC-MSG-017-02: badge shows the CLIENT's unread count.
   */
  initialUnreadCount: number;

  /**
   * The CLIENT's Clerk user ID — used to construct the subscription channel.
   * SECURITY: this comes from the server-verified session (ADR-003 trust fence),
   *   never from the browser. The layout reads it from getMyUnreadCountAction() context.
   *   CS-GEN-001: do not log this value. // CS-GEN-001
   */
  clerkUserId: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * NotificationBadgeClient — live-updating unread badge for the CLIENT notification feed.
 *
 * Subscribes to the real-time transport on channel "user:<clerkUserId>".
 * Badge count is initialized from the server-rendered value (no layout flicker).
 * Increments on `notification.created`; decrements on `notification.read`.
 *
 * AC-MSG-012-03: badge reflects real-time arrival — no manual refresh needed.
 * AC-MSG-017-01/-02/-03: badge present in nav, shows count, updates on events.
 * ADR-023: transport via getNotificationTransport() port (mock in e2e). // ADR-023
 * CS-GEN-001: channel string "user:<clerkUserId>" is not logged. // CS-GEN-001
 */
export function NotificationBadgeClient({
  initialUnreadCount,
  clerkUserId,
}: NotificationBadgeClientProps) {
  // Badge state — seeded from server (ADR-003 identity) then updated by real-time events.
  // AC-MSG-017-02: this count is what the badge displays.
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);

  // ── Real-time subscription ────────────────────────────────────────────────

  useEffect(() => {
    // ADR-023: get the transport via the port (never import a binding directly). // ADR-023
    // In e2e: NEXT_PUBLIC_REALTIME_PROVIDER=mock + NEXT_PUBLIC_ALLOW_MOCK_REALTIME=true
    //   → selector detects browser context (REALTIME_PROVIDER is undefined) → SseBrowserMockTransport.
    // SseBrowserMockTransport.subscribe() opens an EventSource to /api/notifications/stream.
    // The SSE route bridges the in-process MockNotificationTransport into the HTTP stream.
    // DECISION-016-005b-RT: the silent-swallowing try/catch is replaced by a narrowly-scoped
    //   catch that only swallows RealtimeBindingNotAvailableError (the deferred real-provider stub).
    //   subscribe() must NOT throw silently in e2e — BUG-016-001 was caused by exactly that.
    // CS-GEN-001: do not log the channel or clerkUserId. // CS-GEN-001

    // Channel convention: "user:<clerkUserId>" — per-user subscription scope.
    // CS-GEN-001: do NOT log the channel string (it encodes a user identity). // CS-GEN-001
    // DECISION (TASK-016-005): channel = "user:<clerkUserId>" matches the publish path
    // in TASK-016-004 source-event wiring. The same convention is used by apps/admin
    // (TASK-016-006) for the ACCOUNTANT channel. // ADR-023 // DECISION-016-005-A
    const channel = `user:${clerkUserId}`;

    /**
     * Real-time event handler — updates the badge count on notification events.
     *
     * AC-MSG-012-03: badge increments on 'notification.created' (real-time arrival).
     * AC-MSG-017-03: badge decrements on 'notification.read' (mark-read on view).
     *
     * CS-GEN-001: do NOT log event.payload — it may carry user-context data. // CS-GEN-001
     */
    function handleEvent(event: NotificationEvent): void {
      // CS-GEN-001: only inspect event.type (safe); do NOT log or inspect payload. // CS-GEN-001
      if (event.type === EVENT_NOTIFICATION_CREATED) {
        // AC-MSG-012-03: new notification arrived — increment badge without refresh.
        setUnreadCount((prev) => prev + 1);
      } else if (event.type === EVENT_NOTIFICATION_READ) {
        // AC-MSG-017-03: notification marked read — decrement badge (floor at 0).
        setUnreadCount((prev) => Math.max(0, prev - 1));
      }
      // Other event types: ignore (no-op).
    }

    // Subscribe to the per-user channel.
    // ADR-023: subscribe returns an UnsubscribeFn — MUST be called on cleanup. // ADR-023
    //
    // TASK-016-005b (BUG-016-001 fix):
    // The blanket silent try/catch has been REMOVED. With the SseBrowserMockTransport
    // (packages/realtime/src/bindings/sse-browser.ts) active in e2e/local dev, subscribe()
    // opens an EventSource and does NOT throw. A genuine subscribe failure will now
    // propagate to the caller and be visible in the e2e test (the badge will not update,
    // causing the push-without-navigation assertion to fail — making regressions detectable).
    //
    // The ONLY legitimate deferred-stub path is REALTIME_PROVIDER=supabase-realtime (the
    // real production provider, Phase 5). In that case subscribe() throws
    // RealtimeBindingNotAvailableError. We catch ONLY that error and degrade gracefully
    // to the server-fetched count. All other errors propagate.
    //
    // ADR-023 §4: fail-closed posture is preserved — real/default config binds the stub,
    //   which still throws. Only the mock opt-in path (REALTIME_PROVIDER=mock +
    //   ALLOW_MOCK_REALTIME=true) reaches SseBrowserMockTransport in the browser. // ADR-023
    // CS-GEN-001: do not log the channel or clerkUserId. // CS-GEN-001
    // DECISION-016-005b-RT // ADR-023
    let unsubscribe: (() => void) | null = null;
    try {
      const transport = getNotificationTransport();
      unsubscribe = transport.subscribe(channel, handleEvent);
    } catch (err) {
      // Only catch the deferred real-provider stub throw.
      // If the error is NOT the expected stub error, re-throw so it's visible.
      const errorName = (err instanceof Error ? err.name : "") ?? "";
      if (errorName === "RealtimeBindingNotAvailableError") {
        // Deferred real-provider stub (SupabaseRealtimeTransport — Phase 5 scope).
        // Fail gracefully — badge still shows the server-fetched initial count.
        // This path should NOT fire in e2e (where mock transport is active).
        // CS-GEN-001: do not log the channel or clerkUserId. // CS-GEN-001
        return;
      }
      // Any other error: re-throw to make it detectable in tests and monitoring.
      // DECISION-016-005b-RT: this ensures a genuine subscribe failure is NOT silently
      // swallowed — the e2e push-without-navigation test will catch it. // ADR-023
      throw err;
    }

    // Cleanup: unsubscribe on unmount to prevent listener accumulation.
    // ADR-023: the port contract requires caller to invoke the UnsubscribeFn on cleanup.
    return () => {
      unsubscribe?.();
    };
  }, [clerkUserId]);

  // ── Render ────────────────────────────────────────────────────────────────

  if (unreadCount <= 0) {
    // No unread notifications — render nothing (badge is absent, not "0").
    // AC-MSG-017-01: the badge element is conditionally rendered (absent when 0 is valid UX).
    return null;
  }

  return (
    <span
      className="inline-flex items-center justify-center rounded-full bg-red-500 text-white text-xs font-bold min-w-[1.25rem] h-5 px-1"
      data-testid="nav-unread-badge"
      aria-label={`${unreadCount} unread notification${unreadCount === 1 ? "" : "s"}`}
      // AC-MSG-017-02: badge shows the CLIENT's unread count
      data-unread-count={unreadCount}
    >
      {unreadCount}
    </span>
  );
}
