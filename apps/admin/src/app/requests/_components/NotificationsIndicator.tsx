/**
 * apps/admin/src/app/requests/_components/NotificationsIndicator.tsx
 *
 * Minimal accountant-surface element that surfaces new-request notifications
 * and links to the specific request for review.
 *
 * AC-DOOR-005-02: Each notification leads the accountant to the specific request
 *   (link uses engagementRequestId — the detail page is TASK-003-004).
 * AC-MSG-013-01:  Surfaces notifications of type 'new_engagement_request'.
 *
 * // DECISION (TASK-003-003): This component is intentionally minimal — it shows a
 * // count badge for unread notifications and a dropdown list of new-request notifications,
 * // each linking to /requests/<engagementRequestId>. The full inbox page (list + details)
 * // is TASK-003-004. The link target (/requests/<id>) is a forward reference — the
 * // indicator uses a plain <a> href so it works as a navigation seam even before the
 * // detail page lands (the browser will receive a 404 until TASK-003-004, which is
 * // expected and acceptable per the task spec).
 *
 * ADR-006: Lives in apps/admin only — not accessible from apps/portal.
 * ADR-003: Data is fetched server-side via getNotificationsAction() (request pool,
 *           accountant SESSION_CONTEXT). This component is a Server Component.
 *
 * Usage: rendered in the admin shell (layout or nav). Accepts pre-fetched notifications
 * so the parent server component can call getNotificationsAction() and pass data down,
 * or this component can be used as a standalone async server component.
 */

import type { NotificationItem } from "@tax-portal/db";
import { NOTIFICATION_TYPE_NEW_REQUEST } from "@tax-portal/db";

// ─── Types ────────────────────────────────────────────────────────────────────

interface NotificationsIndicatorProps {
  /** Pre-fetched notifications from getNotificationsAction() */
  notifications: NotificationItem[];
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * NotificationsIndicator — shows unread new-request notification count and list.
 *
 * Renders:
 *   - A count badge for unread notifications (readAt === null)
 *   - A list of new-request notifications, each linking to the request detail page
 *     (/requests/<engagementRequestId>) — AC-DOOR-005-02
 *   - Empty state when there are no new-request notifications
 *
 * AC-DOOR-005-02: "leads the accountant to review it" — each notification is a link
 *   to /requests/<engagementRequestId> so she can navigate directly to the request.
 */
export function NotificationsIndicator({
  notifications,
}: NotificationsIndicatorProps) {
  // Filter to new-request notifications only (AC-MSG-013-01)
  const newRequestNotifs = notifications.filter(
    (n) => n.type === NOTIFICATION_TYPE_NEW_REQUEST,
  );

  // Unread = readAt === null
  const unreadCount = newRequestNotifs.filter((n) => n.readAt === null).length;

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

      {/* Notification list — new-request notifications with links */}
      {newRequestNotifs.length > 0 ? (
        <ul
          className="mt-2 space-y-2"
          data-testid="notification-list"
          aria-label="New engagement request notifications"
        >
          {newRequestNotifs.map((notif) => (
            <li
              key={notif.id}
              className={`rounded border p-3 text-sm ${
                notif.readAt === null
                  ? "border-blue-200 bg-blue-50"
                  : "border-gray-200 bg-white"
              }`}
              data-testid={`notification-item-${notif.id}`}
              data-read={notif.readAt !== null}
            >
              {/* Notification title */}
              <p
                className={`font-medium ${notif.readAt === null ? "text-blue-800" : "text-gray-700"}`}
              >
                {notif.title}
              </p>

              {/* Link to the specific request — AC-DOOR-005-02 */}
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
