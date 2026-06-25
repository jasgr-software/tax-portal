/**
 * packages/ui/src/components/NotificationFeed.tsx — Shared notification feed + unread badge
 *
 * CS-TS-003: ONE shared implementation for both apps/portal (CLIENT feed) and
 *   apps/admin (ACCOUNTANT feed — TASK-016-006). Do NOT fork; both surfaces import this.
 *
 * DECISION (TASK-016-005): The feed + badge live in packages/ui as the shared platform
 *   component. Both apps pass NotificationItem[] props (server-fetched under their own
 *   SESSION_CONTEXT) and the same component renders the feed. The only per-surface
 *   difference is how the items are fetched and how linked-item links are routed — those
 *   are caller-level concerns, not component-level. // CS-TS-003 // ADR-006
 *
 * This is a PURE render-layer component:
 *   - It accepts pre-fetched notifications as props (no DB calls here — CS-TS-001).
 *   - It renders the list, badge, and optional linked-item link.
 *   - Mark-read-on-view is the CALLER's responsibility (invoked when the linked item is viewed,
 *     NOT a dismiss button in this component — AC-MSG-015-03).
 *   - Real-time badge updates are handled by the per-app client wrapper (e.g.
 *     NotificationBadgeClient in apps/portal) which renders this component with an
 *     updated count derived from the live subscription — not by this component directly.
 *
 * No dismiss button — AC-MSG-015-03: "no separate dismiss step."
 * No "mark all read" button — out of scope for this task.
 *
 * Props:
 *   notifications  — the principal's notifications (RLS-scoped, server-fetched by caller)
 *   unreadCount    — override for the badge (defaults to counting readAt===null in notifications)
 *                    Used by the real-time client wrapper to show a live-updated count.
 *
 * AC-MSG-007-03: the feed contains every entitled notification — verified by its presence here.
 * AC-MSG-017-01: badge visible from any area — caller mounts this in navigation (layout).
 * AC-MSG-017-02: badge shows unread count (count prop or derived).
 * AC-MSG-017-03: badge updates on read/arrival — caller supplies updated unreadCount.
 * AC-MSG-015-02/-03: no dismiss button; mark-read fires on linked-item view (caller's concern).
 *
 * ADR-006 / CS-TS-003: consumed identically by apps/portal (CLIENT) and apps/admin (ACCOUNTANT).
 * ADR-023: real-time subscription is the caller's concern; this component is stateless.
 * CS-GEN-001: no PII or secret values rendered in logs or data-attributes — notification title/body
 *   rendered as React text nodes (React default-escapes, XSS-safe).
 * CS-GEN-003: governing keys cited throughout. // CS-GEN-003
 */

// DECISION (TASK-016-005): This component avoids importing from @tax-portal/db to keep
// packages/ui free of DB dependencies. It accepts a minimal NotificationFeedItem shape
// (the caller maps NotificationItem to it). This keeps the UI package dependency-lean
// and lets TASK-016-006 (admin) use it without pulling in portal-only server actions.
// The type is declared here (not re-exported from db). // CS-TS-003

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Minimal notification data required by the feed renderer.
 * Maps to NotificationItem from @tax-portal/db — callers adapt their repository type.
 *
 * DECISION (TASK-016-005): kept independent of @tax-portal/db to avoid a DB dependency
 * in packages/ui. The subset matches the fields this component actually renders.
 * // CS-TS-003 // ADR-006
 */
export interface NotificationFeedItem {
  id: string;
  type: string;
  title: string;
  body: string | null;
  /** null = unread */
  readAt: Date | null;
  createdAt: Date;
  /** Optional linked-item type — used to generate the follow-link href */
  linkedItemType: string | null;
  /** Optional linked-item id — used to generate the follow-link href */
  linkedItemId: string | null;
  /** Optional fallback FK (legacy EPIC-003) */
  engagementRequestId: string | null;
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface NotificationFeedProps {
  /**
   * The principal's notifications (already RLS-scoped by the server action caller).
   * Ordered newest-first (the repository's default ordering).
   */
  notifications: NotificationFeedItem[];

  /**
   * Override for the unread badge count.
   * When supplied (e.g. by the real-time client wrapper), this takes precedence over
   * the derived count from notifications.readAt — allows the badge to update on
   * real-time arrival before a re-fetch. // AC-MSG-017-03
   *
   * Defaults to undefined; component falls back to deriving from notifications array.
   */
  unreadCount?: number;

  /**
   * Optional: function that resolves a href for a notification's linked item.
   *
   * DECISION (TASK-016-005): link resolution is caller-supplied so portal (CLIENT) and
   * admin (ACCOUNTANT) can route to the correct surface without forking the component.
   * If not supplied, no link is rendered for the item. // ADR-010 // CS-TS-003
   *
   * @param item  The notification item.
   * @returns     The href string, or null/undefined to render no link.
   */
  resolveHref?: (item: NotificationFeedItem) => string | null | undefined;

  /**
   * Optional: empty state message (defaults to "No notifications").
   */
  emptyMessage?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * NotificationFeed — shared notification feed + unread badge renderer.
 *
 * Stateless pure renderer. Real-time updates are handled by the caller's client wrapper.
 * Mark-read fires when the linked item is viewed (caller's concern, not this component).
 *
 * AC-MSG-007-03: feed presence is the authoritative notification record.
 * AC-MSG-017-01/-02/-03: badge visible from any area, shows count, updates via prop.
 * AC-MSG-015-02/-03: no dismiss button — mark-read-on-view is the caller's concern.
 * CS-GEN-001: title/body as React text nodes (default-escaped — XSS-safe). // CS-GEN-001
 * CS-GEN-003: governing keys cited. // CS-GEN-003
 * CS-TS-003: shared across portal and admin. // CS-TS-003
 * ADR-006: consumed by both surfaces. // ADR-006
 */
export function NotificationFeed({
  notifications,
  unreadCount: unreadCountProp,
  resolveHref,
  emptyMessage = "No notifications",
}: NotificationFeedProps) {
  // Derive unread count from notifications if not supplied by real-time wrapper.
  // AC-MSG-017-02: badge shows the count of unread notifications.
  const derivedUnreadCount = notifications.filter((n) => n.readAt === null).length;
  const unreadCount = unreadCountProp ?? derivedUnreadCount;

  return (
    <div
      className="relative"
      data-testid="notification-feed"
      aria-label={`Notifications: ${unreadCount} unread`}
    >
      {/* Unread badge + label — AC-MSG-017-01/-02: visible from any area, shows count */}
      <div className="flex items-center gap-1">
        <span className="text-gray-600 text-sm font-medium">Notifications</span>
        {unreadCount > 0 && (
          <span
            className="inline-flex items-center justify-center rounded-full bg-red-500 text-white text-xs font-bold min-w-[1.25rem] h-5 px-1"
            data-testid="unread-badge"
            aria-label={`${unreadCount} unread notification${unreadCount === 1 ? "" : "s"}`}
            // AC-MSG-017-02: badge shows the client's unread count
            data-unread-count={unreadCount}
          >
            {unreadCount}
          </span>
        )}
      </div>

      {/* Notification list */}
      {notifications.length > 0 ? (
        <ul
          className="mt-2 space-y-2"
          data-testid="notification-list"
          aria-label="Notifications"
        >
          {notifications.map((notif) => {
            const href = resolveHref?.(notif);

            return (
              <li
                key={notif.id}
                className={`rounded border p-3 text-sm ${
                  notif.readAt === null
                    ? "border-blue-200 bg-blue-50"
                    : "border-gray-200 bg-white"
                }`}
                data-testid={`notification-item-${notif.id}`}
                data-notification-type={notif.type}
                data-read={notif.readAt !== null}
                // AC-MSG-015-01: notification references its triggering item
                data-linked-item-type={notif.linkedItemType ?? undefined}
                data-linked-item-id={notif.linkedItemId ?? undefined}
              >
                {/*
                 * Notification title.
                 * CS-GEN-001: rendered as React text (default-escaped — XSS-safe). // CS-GEN-001
                 */}
                <p
                  className={`font-medium ${notif.readAt === null ? "text-blue-800" : "text-gray-700"}`}
                >
                  {notif.title}
                </p>

                {/* Notification body — optional richer detail */}
                {notif.body && (
                  <p
                    className="mt-1 text-xs text-gray-600"
                    data-testid={`notification-body-${notif.id}`}
                  >
                    {notif.body}
                  </p>
                )}

                {/*
                 * Linked-item follow link — AC-MSG-015-01: notification references its triggering item.
                 * Clicking navigates to the linked item; the page-view fires mark-read-on-view.
                 * There is NO dismiss button — AC-MSG-015-03 (no separate dismiss step).
                 * ADR-010: href may cross apps (caller supplies the correct surface URL).
                 */}
                {href && (
                  <a
                    href={href}
                    className="mt-1 inline-block text-xs text-blue-600 underline hover:text-blue-800"
                    data-testid={`notification-link-${notif.id}`}
                  >
                    View
                  </a>
                )}

                {/* Timestamp */}
                <p className="mt-1 text-xs text-gray-400">
                  {notif.createdAt.toLocaleString()}
                </p>
              </li>
            );
          })}
        </ul>
      ) : (
        <p
          className="mt-2 text-sm text-gray-400"
          data-testid="no-notifications"
        >
          {emptyMessage}
        </p>
      )}
    </div>
  );
}
