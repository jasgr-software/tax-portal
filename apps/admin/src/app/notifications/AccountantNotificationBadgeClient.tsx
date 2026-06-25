/**
 * apps/admin/src/app/notifications/AccountantNotificationBadgeClient.tsx
 *
 * Client-side notification badge for the ACCOUNTANT notification feed.
 *
 * Mirrors apps/portal/src/app/notifications/_components/NotificationBadgeClient.tsx
 * but for the ACCOUNTANT surface (apps/admin). The accountant channel is
 * "accountant:notifications" (the convention emitAndPublishNotification() publishes to
 * for ACCOUNTANT recipients — notification.ts:400-404). // CS-TS-003
 *
 * This is a "use client" component because it needs useEffect/useState for the real-time
 * subscription lifecycle and badge state updates.
 *
 * The initial count comes from the server-rendered layout (avoids layout flicker):
 *   - The layout (server component) calls getMyUnreadCountAction() and passes initialUnreadCount.
 *   - This component hydrates with that count and subscribes to real-time events.
 *   - On 'notification.created' events, it increments the count without a page refresh.
 *   - On mark-read, the badge corrects on the next server fetch (no 'notification.read' event
 *     is published — the decrement branch was removed in the F3 fix; see DECISION-F3 below).
 *
 * AC-MSG-012-01/-02/-03: real-time arrival increments badge without reload (ACCOUNTANT surface).
 * AC-MSG-017-01: badge in admin navigation — visible from any area.
 * AC-MSG-017-02: badge shows the ACCOUNTANT's unread count.
 * AC-MSG-017-03: badge updates on arrival (real-time) and corrects on next server fetch (re-nav).
 * AC-MSG-013-03: document_uploaded notifications counted (server-side, via getMyUnreadCountAction).
 *
 * DECISION-F3: 'notification.read' event was defined but never published (no transport.publish()
 *   call for 'notification.read' exists anywhere in the codebase). The dead EVENT_NOTIFICATION_READ
 *   constant + decrement branch + misleading AC-MSG-017-03 comment claiming "badge decrements on
 *   notification.read" have been removed. The badge story is: increment on arrival (real-time),
 *   correct on the next server render/refetch. This holds without a read event.
 *
 * ADR-023: transport consumed via getNotificationTransport() (the port — never a binding).
 *   REALTIME_PROVIDER=mock + ALLOW_MOCK_REALTIME=true is active in e2e. // ADR-023
 * ADR-006: admin-only client component (ACCOUNTANT feed surface). // ADR-006
 * CS-TS-003: shared pattern with apps/portal NotificationBadgeClient — one platform, two surfaces. // CS-TS-003
 * CS-GEN-001: no PII logged — channel is "accountant:notifications" (shared channel, not per-user). // CS-GEN-001
 * CS-GEN-003: governing keys cited. // CS-GEN-003
 */

"use client";

import { useState, useEffect } from "react";
import { getNotificationTransport } from "@tax-portal/realtime";
import type { NotificationEvent } from "@tax-portal/realtime";

// ─── Event type constants ─────────────────────────────────────────────────────

/**
 * Real-time event type published when a new notification is created.
 * Published by emitAndPublishNotification() after emitNotification().
 * The badge increments on this event — AC-MSG-012-03.
 */
const EVENT_NOTIFICATION_CREATED = "notification.created";

// NOTE (DECISION-F3): EVENT_NOTIFICATION_READ ('notification.read') was removed.
// No transport.publish() for 'notification.read' exists anywhere in the codebase —
// the constant and the decrement branch were dead code. Badge correction happens on
// the next server fetch/navigation. // DECISION-F3

// ─── Props ────────────────────────────────────────────────────────────────────

export interface AccountantNotificationBadgeClientProps {
  /**
   * Initial unread count — server-fetched in the layout, passed as hydration seed.
   * AC-MSG-017-02: badge shows the ACCOUNTANT's unread count.
   */
  initialUnreadCount: number;
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * AccountantNotificationBadgeClient — live-updating unread badge for the ACCOUNTANT feed.
 *
 * Subscribes to the real-time transport on channel "accountant:notifications".
 * Badge count is initialized from the server-rendered value (no layout flicker).
 * Increments on `notification.created`; decrements on `notification.read`.
 *
 * AC-MSG-012-01/-02/-03: badge reflects real-time arrival — no manual refresh needed.
 * AC-MSG-017-01/-02/-03: badge present in admin nav, shows count, updates on events.
 * ADR-023: transport via getNotificationTransport() port (mock in e2e). // ADR-023
 * CS-TS-003: shared badge pattern with apps/portal (one platform, two surfaces). // CS-TS-003
 * CS-GEN-001: channel "accountant:notifications" is not logged. // CS-GEN-001
 */
export function AccountantNotificationBadgeClient({
  initialUnreadCount,
}: AccountantNotificationBadgeClientProps) {
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
    // CS-TS-003: same pattern as apps/portal NotificationBadgeClient. // CS-TS-003
    // CS-GEN-001: channel "accountant:notifications" is NOT logged. // CS-GEN-001

    // Channel convention: "accountant:notifications" — the shared ACCOUNTANT channel.
    // This matches what emitAndPublishNotification() publishes to for ACCOUNTANT recipients
    // (notification.ts:400-404). // ADR-023 // DECISION-016-005-A
    // CS-GEN-001: channel string is not logged. // CS-GEN-001
    const channel = "accountant:notifications";

    /**
     * Real-time event handler — updates the badge count on notification events.
     *
     * AC-MSG-012-03: badge increments on 'notification.created' (real-time arrival).
     * AC-MSG-017-03: badge corrects on next server fetch after mark-read.
     * CS-GEN-001: do NOT log event.payload — it may carry user-context data. // CS-GEN-001
     */
    function handleEvent(event: NotificationEvent): void {
      // CS-GEN-001: only inspect event.type (safe); do NOT log or inspect payload. // CS-GEN-001
      if (event.type === EVENT_NOTIFICATION_CREATED) {
        // AC-MSG-012-03: new notification arrived — increment badge without refresh.
        setUnreadCount((prev) => prev + 1);
      }
      // DECISION-F3: 'notification.read' decrement branch removed — event is never published.
      // Badge corrects on the next server fetch (re-navigation or revalidation).
      // Other event types: ignore (no-op).
    }

    // Subscribe to the accountant channel.
    // ADR-023: subscribe returns an UnsubscribeFn — MUST be called on cleanup. // ADR-023
    //
    // TASK-016-006: Following the same pattern as portal NotificationBadgeClient (TASK-016-005b).
    // The SseBrowserMockTransport opens an EventSource to /api/notifications/stream (admin route).
    // The admin SSE route bridges the in-process MockNotificationTransport for "accountant:notifications".
    //
    // The ONLY legitimate deferred-stub path is REALTIME_PROVIDER=supabase-realtime.
    // In that case subscribe() throws RealtimeBindingNotAvailableError. We catch ONLY that error.
    // ADR-023 §4: fail-closed posture is preserved. // ADR-023
    // CS-TS-003: same error-handling shape as portal NotificationBadgeClient. // CS-TS-003
    let unsubscribe: (() => void) | null = null;
    try {
      const transport = getNotificationTransport();
      unsubscribe = transport.subscribe(channel, handleEvent);
    } catch (err) {
      // Only catch the deferred real-provider stub throw.
      const errorName = (err instanceof Error ? err.name : "") ?? "";
      if (errorName === "RealtimeBindingNotAvailableError") {
        // Deferred real-provider stub (SupabaseRealtimeTransport — Phase 5 scope).
        // Fail gracefully — badge still shows the server-fetched initial count.
        // This path should NOT fire in e2e (where mock transport is active).
        return;
      }
      // Any other error: re-throw to make it detectable in tests and monitoring.
      // ADR-023: a genuine subscribe failure must be visible, not silently swallowed. // ADR-023
      throw err;
    }

    // Cleanup: unsubscribe on unmount to prevent listener accumulation.
    // ADR-023: the port contract requires caller to invoke the UnsubscribeFn on cleanup.
    return () => {
      unsubscribe?.();
    };
  }, []); // No deps — channel is a constant for the ACCOUNTANT surface. // ADR-023

  // ── Render ────────────────────────────────────────────────────────────────

  if (unreadCount <= 0) {
    // No unread notifications — render nothing (badge is absent, not "0").
    // AC-MSG-017-01: the badge element is conditionally rendered.
    return null;
  }

  return (
    <span
      className="inline-flex items-center justify-center rounded-full bg-red-500 text-white text-xs font-bold min-w-[1.25rem] h-5 px-1"
      data-testid="nav-unread-badge"
      aria-label={`${unreadCount} unread notification${unreadCount === 1 ? "" : "s"}`}
      // AC-MSG-017-02: badge shows the ACCOUNTANT's unread count
      data-unread-count={unreadCount}
    >
      {unreadCount}
    </span>
  );
}
