/**
 * apps/portal/src/app/notifications/page.tsx — Client notification feed page
 *
 * Renders the CLIENT's full notification feed as a protected route.
 * The persistent nav badge links here (AC-MSG-017-01).
 *
 * Server component — fetches notifications server-side via getMyNotificationsAction()
 * under the CLIENT's SESSION_CONTEXT (ADR-003). No client-supplied ids.
 *
 * AC-MSG-007-01/-02/-03: feed is the authoritative record; every entitled notification
 *   appears here; presence verified by the feed rendering.
 * AC-MSG-017-01: the nav badge links here so the client can view the feed from any area.
 *
 * ADR-003: notifications fetched server-side under CLIENT SESSION_CONTEXT.
 * ADR-005: sec.pol_Notification FILTER scopes to this CLIENT's notifications.
 * ADR-006: /notifications is apps/portal only (client-facing). // ADR-006
 * CS-TS-001: DB access via getMyNotificationsAction → withRequestContext. // CS-TS-001
 * CS-GEN-003: governing keys cited. // CS-GEN-003
 */

import type { Metadata } from "next";
import { getMyNotificationsAction } from "./actions";
import { NotificationFeed } from "@tax-portal/ui";
import type { NotificationFeedItem } from "@tax-portal/ui";
import type { NotificationItem } from "@tax-portal/db";

export const metadata: Metadata = {
  title: "Notifications",
  description: "Your notifications.",
};

// ─── Adapter ──────────────────────────────────────────────────────────────────

/**
 * Adapt NotificationItem (packages/db shape) to NotificationFeedItem (packages/ui shape).
 * AC-MSG-015-01: notification references its triggering item via linkedItemType/Id.
 */
function adaptToFeedItem(n: NotificationItem): NotificationFeedItem {
  return {
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body,
    readAt: n.readAt,
    createdAt: n.createdAt,
    linkedItemType: n.linkedItemType,
    linkedItemId: n.linkedItemId,
    engagementRequestId: n.engagementRequestId,
  };
}

// ─── Link resolver ────────────────────────────────────────────────────────────

/**
 * Resolve the href for a notification's linked item.
 *
 * DECISION (TASK-016-005): portal-side link routing. The CLIENT's linked items live on
 *   apps/portal (engagements, documents). Cross-app links (admin items) are handled by
 *   TASK-016-007. For this task, portal-known item types are routed here. Unknown types
 *   return null (no link rendered). // ADR-010 // DECISION-016-005-B
 */
function resolvePortalHref(item: NotificationFeedItem): string | null {
  if (!item.linkedItemId) return null;

  switch (item.linkedItemType) {
    case "engagement":
      // Link to the engagement detail page
      return `/engagements/${item.linkedItemId}`;
    case "document":
      // DECISION: document links need the engagement id context; for now, link to
      // the engagement page (the document list is there). Future EPIC-017 can refine.
      // DECISION-016-005-C: document notifications link to engagement page for v1.
      return null; // refined in TASK-016-007 (cross-app) or future engagement-doc routing
    case "request":
      // Engagement requests live on admin — cross-app (TASK-016-007 scope)
      return null;
    default:
      return null;
  }
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function NotificationsPage() {
  // CS-TS-001: server-side fetch via the db wrapper under CLIENT SESSION_CONTEXT. // CS-TS-001
  // ADR-003: getMyNotificationsAction → withRequestContext → listNotifications.
  // ADR-005: FILTER scopes to this CLIENT's notifications.
  const result = await getMyNotificationsAction();

  const notifications: NotificationFeedItem[] = result.success
    ? result.notifications.map(adaptToFeedItem)
    : [];

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900 mb-2">
          Notifications
        </h1>
        <p className="text-gray-600">
          Your activity and updates.
        </p>
      </div>

      {!result.success && (
        <div
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
          data-testid="notifications-error"
        >
          Unable to load notifications. Please sign in and try again.
        </div>
      )}

      {/* AC-MSG-007-01/-02/-03: the feed is the authoritative, complete record. */}
      {/* AC-MSG-017-01: feed page reachable from the nav badge (any area). */}
      {/* CS-TS-003: NotificationFeed shared with apps/admin (TASK-016-006). */}
      <NotificationFeed
        notifications={notifications}
        resolveHref={resolvePortalHref}
        emptyMessage="You have no notifications yet."
      />
    </div>
  );
}
