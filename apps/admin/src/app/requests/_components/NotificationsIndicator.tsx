/**
 * apps/admin/src/app/requests/_components/NotificationsIndicator.tsx
 *
 * Minimal accountant-surface element that surfaces in-portal notifications
 * and links to the specific request for review.
 *
 * AC-DOOR-005-02: Each new-request notification leads the accountant to the specific
 *   request (link uses engagementRequestId — the detail page is TASK-003-004).
 * AC-MSG-013-01:  Surfaces notifications of type 'new_engagement_request'.
 * AC-ONBD-007-01/AC-MSG-013-04: Surfaces notifications of type 'onboarding_completed'
 *   (added by TASK-008-001; rendered here by TASK-008-003 — D6).
 * AC-ONBD-007-02: The rendered onboarding-complete notification identifies the
 *   engagement and its client (engine denormalizes the client name into title/body).
 *
 * // DECISION (TASK-003-003): This component is intentionally minimal — it shows a
 * // count badge for unread notifications and a dropdown list of notifications,
 * // each linking to /requests/<engagementRequestId>. The full inbox page (list + details)
 * // is TASK-003-004. The link target (/requests/<id>) is a forward reference — the
 * // indicator uses a plain <a> href so it works as a navigation seam even before the
 * // detail page lands (the browser will receive a 404 until TASK-003-004, which is
 * // expected and acceptable per the task spec).
 *
 * // DECISION (TASK-008-003 / D6): Renders ONLY the two known notification types:
 * //   - NOTIFICATION_TYPE_NEW_REQUEST      ("new_engagement_request")
 * //   - NOTIFICATION_TYPE_ONBOARDING_COMPLETE ("onboarding_completed")
 * // A filter to the known set is deliberate — unknown/future types are not rendered
 * // implicitly. The unread badge counts unread items across both known types.
 * // The "Review request" link is rendered for onboarding_completed notifications that
 * // carry an engagementRequestId (the engine reuses the FK per D4); if absent, the
 * // notification renders as a title/body card without a link (acceptable per task spec).
 *
 * ADR-005: Renders only what listNotifications() returns (RLS-scoped, accountant-only
 *   via sec.pol_Notification 0004). No new policy added — render-layer change only.
 * ADR-006: Lives in apps/admin only — not accessible from apps/portal.
 * ADR-003: Data is fetched server-side via getNotificationsAction() (request pool,
 *           accountant SESSION_CONTEXT). This component is a Server Component.
 *
 * Usage: rendered in the admin shell (layout or nav). Accepts pre-fetched notifications
 * so the parent server component can call getNotificationsAction() and pass data down,
 * or this component can be used as a standalone async server component.
 */

import type { NotificationItem } from "@tax-portal/db";
import {
  NOTIFICATION_TYPE_NEW_REQUEST,
  NOTIFICATION_TYPE_ONBOARDING_COMPLETE,
} from "@tax-portal/db";

// ─── Types ────────────────────────────────────────────────────────────────────

interface NotificationsIndicatorProps {
  /** Pre-fetched notifications from getNotificationsAction() */
  notifications: NotificationItem[];
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * NotificationsIndicator — shows unread notification count and list.
 *
 * Renders:
 *   - A count badge for unread notifications of the two known types (readAt === null)
 *   - A list of known-type notifications:
 *       new_engagement_request — links to /requests/<engagementRequestId> (AC-DOOR-005-02)
 *       onboarding_completed  — shows title/body identifying the engagement + client
 *                               (AC-ONBD-007-01/-02, AC-MSG-013-04); links to request if FK present
 *   - Empty state when there are no known-type notifications
 *
 * AC-DOOR-005-02: "leads the accountant to review it" — new-request notifications link
 *   to /requests/<engagementRequestId>.
 * AC-ONBD-007-01/AC-MSG-013-04: onboarding-complete notifications appear in the feed.
 * AC-ONBD-007-02: Title/body identify the engagement + client (denormalized by the engine).
 */
export function NotificationsIndicator({
  notifications,
}: NotificationsIndicatorProps) {
  // DECISION (TASK-008-003 / D6): Filter to the set of two known types only.
  // Unknown/future types are not rendered implicitly — kept minimal per SDET focus area.
  const knownNotifs = notifications.filter(
    (n) =>
      n.type === NOTIFICATION_TYPE_NEW_REQUEST ||
      n.type === NOTIFICATION_TYPE_ONBOARDING_COMPLETE,
  );

  // Unread = readAt === null, across both known types
  const unreadCount = knownNotifs.filter((n) => n.readAt === null).length;

  return (
    <div
      className="relative"
      data-testid="notifications-indicator"
      aria-label={`Notifications: ${unreadCount} unread`}
    >
      {/* Bell icon + unread badge */}
      <div className="flex items-center gap-1">
        <span className="text-gray-600 text-sm font-medium">Notifications</span>
        {unreadCount > 0 && (
          <span
            className="inline-flex items-center justify-center rounded-full bg-red-500 text-white text-xs font-bold min-w-[1.25rem] h-5 px-1"
            data-testid="unread-count"
            aria-label={`${unreadCount} unread notification${unreadCount === 1 ? "" : "s"}`}
          >
            {unreadCount}
          </span>
        )}
      </div>

      {/* Notification list — known-type notifications */}
      {knownNotifs.length > 0 ? (
        <ul
          className="mt-2 space-y-2"
          data-testid="notification-list"
          aria-label="Notifications"
        >
          {knownNotifs.map((notif) => (
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
            >
              {/* Notification title — React default-escaped (XSS-safe, no dangerouslySetInnerHTML) */}
              <p
                className={`font-medium ${notif.readAt === null ? "text-blue-800" : "text-gray-700"}`}
              >
                {notif.title}
              </p>

              {/* Notification body — rendered as text for AC-ONBD-007-02 (engagement + client name) */}
              {notif.body && (
                <p
                  className="mt-1 text-xs text-gray-600"
                  data-testid={`notification-body-${notif.id}`}
                >
                  {notif.body}
                </p>
              )}

              {/* Link to the specific request — present for both types when engagementRequestId is set.
                  new_engagement_request: links for AC-DOOR-005-02.
                  onboarding_completed: links when the engine stored engagementRequestId (D4 / FK reuse). */}
              {notif.engagementRequestId && (
                <a
                  href={`/requests/${notif.engagementRequestId}`}
                  className="mt-1 inline-block text-xs text-blue-600 underline hover:text-blue-800"
                  data-testid={`notification-link-${notif.id}`}
                  data-engagement-request-id={notif.engagementRequestId}
                >
                  Review request
                </a>
              )}

              {/* Timestamp */}
              <p className="mt-1 text-xs text-gray-400">
                {notif.createdAt.toLocaleString()}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p
          className="mt-2 text-sm text-gray-400"
          data-testid="no-notifications"
        >
          No new requests
        </p>
      )}
    </div>
  );
}
