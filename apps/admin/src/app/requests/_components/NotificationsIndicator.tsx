/**
 * apps/admin/src/app/requests/_components/NotificationsIndicator.tsx
 *
 * Accountant-surface element that surfaces in-portal notifications
 * and links to the specific request/engagement/document for review.
 *
 * EPIC-016 / TASK-016-006: Generalized from the EPIC-003 minimal indicator into the
 * persistent dual-role feed + badge shape. CS-GEN-002 additive — no existing behavior changed.
 *
 * AC-DOOR-005-02: Each new-request notification leads the accountant to the specific
 *   request (link uses engagementRequestId — the detail page is TASK-003-004).
 * AC-MSG-013-01:  Surfaces notifications of type 'new_engagement_request'.
 * AC-ONBD-007-01/AC-MSG-013-04: Surfaces notifications of type 'onboarding_completed'
 *   (added by TASK-008-001; rendered here by TASK-008-003 — D6).
 * AC-ONBD-007-02: The rendered onboarding-complete notification identifies the
 *   engagement and its client (engine denormalizes the client name into title/body).
 * AC-MSG-013-03: Surfaces notifications of type 'document_uploaded' — added by TASK-016-006.
 *   The document-upload notification links to the engagement documents area.
 * AC-MSG-013-02: Surfaces notifications of type 'new_message' — added by TASK-017-012.
 *   The new-message notification links to the engagement messages area (engagement thread)
 *   or the general-thread messages area (general thread).
 *   BUG-017-002 (Option A): emission encodes kind in linkedItemType:
 *     linkedItemType='engagement' → engagement thread → /engagements/<engagementId>/messages
 *     linkedItemType='thread'     → general thread    → /messages/<threadId>
 *   CS-GEN-002: additive — no existing types removed. // CS-GEN-002
 *   CS-TS-003: mirrors the portal feed render for new_message (cross-surface parity). // CS-TS-003
 *   BUG-017-002 // ADR-005 // ADR-006 // EPIC-016
 *
 * // DECISION (TASK-003-003): This component shows a count badge for unread notifications
 * // and a list of notifications, each linking to the relevant item. The full inbox page
 * // is TASK-003-004.
 *
 * // DECISION (TASK-016-006 / CS-GEN-002): The known-type filter from TASK-008-003 is
 * // EXTENDED to include 'document_uploaded'. The filter is now an open-ended set of
 * // ACCOUNTANT_KNOWN_TYPES — a constant that can be extended additively as new types land.
 * // A notification with an unknown type is NOT rendered implicitly.
 * // "Review request" link: rendered for any notification carrying engagementRequestId.
 * // "View document" link: rendered for document_uploaded notifications carrying linkedItemType='document'.
 * // "View messages" link: rendered for new_message notifications carrying linkedItemId (engagementId).
 * // The unread badge counts unread items across ALL known types.
 * // CS-GEN-002: additive — no existing assertion or behavior changed. // CS-GEN-002
 *
 * // DECISION (TASK-017-012 / CS-GEN-002): ACCOUNTANT_KNOWN_TYPES extended to include
 * // 'new_message' so the accountant sees new-message notifications rendered in the feed.
 * // This is the "through the EPIC-016 feed" contract of AC-MSG-013-02.
 * // CS-GEN-002: additive — existing types + assertions unchanged. // CS-GEN-002
 * // CS-TS-003: cross-surface parity with the portal feed (which already rendered new_message). // CS-TS-003
 * // ADR-006: admin-only component. // ADR-006
 * // EPIC-016: notification feed pattern. // EPIC-016
 *
 * // DECISION (BUG-017-002 / Option A): new_message link routing is kind-dependent.
 * // The renderer is row-only (no thread lookup). The emission (packages/db message.ts)
 * // encodes the kind in linkedItemType:
 * //   linkedItemType='engagement' → engagement thread → /engagements/<engagementId>/messages
 * //   linkedItemType='thread'     → general thread    → /messages/<threadId>
 * // The 'engagement' branch already existed (TASK-017-012). The 'thread' branch is NEW
 * // (BUG-017-002 additive). CS-GEN-002: additive — existing link logic unchanged. // CS-GEN-002
 * // ADR-005: row-only resolution matches document_uploaded precedent. // ADR-005
 * // BUG-017-002 // AC-MSG-013-02 // ADR-005 // ADR-006 // EPIC-016 // CS-GEN-003
 *
 * ADR-005: Renders only what listNotifications() returns (RLS-scoped, accountant-only
 *   via sec.pol_Notification 0004). No new policy added — render-layer change only.
 * ADR-006: Lives in apps/admin only — not accessible from apps/portal. // ADR-006
 * ADR-003: Data is fetched server-side via getNotificationsAction() (request pool,
 *           accountant SESSION_CONTEXT). This component is a Server Component. // ADR-003
 * CS-GEN-002: EPIC-003 indicator generalized additively — no existing types removed. // CS-GEN-002
 * CS-GEN-003: cite governing authority. // CS-GEN-003
 * CS-TS-003: admin feed mirrors portal feed for new_message (cross-surface parity). // CS-TS-003
 *
 * Usage: rendered in the admin shell (layout or nav). Accepts pre-fetched notifications
 * so the parent server component can call getNotificationsAction() and pass data down.
 */

import type { NotificationItem } from "@tax-portal/db";
import {
  NOTIFICATION_TYPE_NEW_REQUEST,
  NOTIFICATION_TYPE_ONBOARDING_COMPLETE,
} from "@tax-portal/db";

// ─── Known notification types ──────────────────────────────────────────────────

/**
 * The 'document_uploaded' notification type (EPIC-016 / TASK-016-006 — AC-MSG-013-03).
 *
 * DECISION (TASK-016-006 / CS-GEN-002): Defined here as a local constant rather than
 * exported from @tax-portal/db because it is a render-layer concern — the DB layer uses
 * the string literal directly in emitAndPublishNotification() calls. If a package-level
 * constant is added later, this local const can be replaced additivley. // CS-GEN-002
 */
const NOTIFICATION_TYPE_DOCUMENT_UPLOADED = "document_uploaded" as const;

/**
 * The 'new_message' notification type (EPIC-017 / TASK-017-012 — AC-MSG-013-02).
 *
 * DECISION (TASK-017-012 / CS-GEN-002): Defined here as a local constant.
 * The DB layer (packages/db/src/repositories/message.ts) uses the string literal
 * directly in appendMessage(). Adding this to ACCOUNTANT_KNOWN_TYPES ensures the
 * accountant sees the "new message from client" notification rendered in her feed.
 * CS-GEN-002: additive — no existing type removed. // CS-GEN-002
 * CS-TS-003: mirrors the portal feed which already renders new_message. // CS-TS-003
 * AC-MSG-013-02: "through the EPIC-016 feed" — the brief's literal contract. // AC-MSG-013-02
 * ADR-006: admin surface only. // ADR-006
 * EPIC-016: notification feed pattern. // EPIC-016
 */
const NOTIFICATION_TYPE_NEW_MESSAGE = "new_message" as const;

/**
 * The complete set of known accountant-scoped notification types (as strings).
 *
 * DECISION (TASK-016-006 / CS-GEN-002): Replaces the inline two-type filter from TASK-008-003.
 * This Set is the single source of truth for "which types the accountant indicator renders."
 * Extend this Set to add new types — do not scatter per-type if/else checks. // CS-GEN-002
 *
 * Typed as Set<string> to accept n.type (string from NotificationItem) at the .has() call.
 * The constants above provide the canonical string values. // DECISION-016-006-SET
 *
 * AC-MSG-013-01: new_engagement_request — new engagement request from a prospect.
 * AC-MSG-013-04: onboarding_completed — client completed onboarding.
 * AC-MSG-013-03: document_uploaded — client uploaded a document. (TASK-016-006)
 * AC-MSG-013-02: new_message — client sent a message. (TASK-017-012 — additive, CS-GEN-002)
 */
const ACCOUNTANT_KNOWN_TYPES: Set<string> = new Set([
  NOTIFICATION_TYPE_NEW_REQUEST,
  NOTIFICATION_TYPE_ONBOARDING_COMPLETE,
  NOTIFICATION_TYPE_DOCUMENT_UPLOADED,
  NOTIFICATION_TYPE_NEW_MESSAGE, // AC-MSG-013-02 — TASK-017-012 additive, CS-GEN-002
]);

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
 *   - A count badge for unread notifications of known types (readAt === null)
 *   - A list of known-type notifications:
 *       new_engagement_request — links to /requests/<engagementRequestId> (AC-DOOR-005-02)
 *       onboarding_completed  — shows title/body identifying the engagement + client
 *                               (AC-ONBD-007-01/-02, AC-MSG-013-04); links to request if FK present
 *       document_uploaded     — shows document upload notification; links to engagement docs
 *                               (AC-MSG-013-03 — TASK-016-006 additive)
 *       new_message           — shows new-message notification; links to engagement messages
 *                               (AC-MSG-013-02 — TASK-017-012 additive, CS-GEN-002, CS-TS-003)
 *   - Empty state when there are no known-type notifications
 *
 * AC-DOOR-005-02: "leads the accountant to review it" — new-request notifications link
 *   to /requests/<engagementRequestId>.
 * AC-ONBD-007-01/AC-MSG-013-04: onboarding-complete notifications appear in the feed.
 * AC-ONBD-007-02: Title/body identify the engagement + client (denormalized by the engine).
 * AC-MSG-013-03: document_uploaded notifications appear in the feed (TASK-016-006).
 * AC-MSG-013-02: new_message notifications appear in the feed (TASK-017-012 — additive).
 * CS-GEN-002: EPIC-003 indicator generalized additively — existing rendering unchanged. // CS-GEN-002
 * CS-TS-003: admin feed now mirrors portal feed for new_message (cross-surface parity). // CS-TS-003
 */
export function NotificationsIndicator({
  notifications,
}: NotificationsIndicatorProps) {
  // DECISION (TASK-016-006 / CS-GEN-002): Filter to the ACCOUNTANT_KNOWN_TYPES set.
  // Unknown/future types are not rendered implicitly.
  // CS-GEN-002: extended from 2 types to 3 — no existing assertions changed. // CS-GEN-002
  const knownNotifs = notifications.filter((n) => ACCOUNTANT_KNOWN_TYPES.has(n.type));

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

              {/* Link to the specific item.
                  DECISION (TASK-016-006 / CS-GEN-002): render type-appropriate link.
                  - document_uploaded (AC-MSG-013-03): link to engagement docs area if linkedItemId available.
                    linkedItemType='document', linkedItemId=documentId; link to engagement docs via
                    engagementRequestId (the FK reuse pattern — same as D4 for onboarding).
                    If engagementRequestId is present, link to /engagements/<requestId>/documents.
                    If only linkedItemId: not enough context for a link (render title-only card).
                  - new_message (AC-MSG-013-02 — TASK-017-012 / BUG-017-002 Option A):
                    BUG-017-002: the emission encodes thread kind in linkedItemType:
                      linkedItemType='engagement' → engagement thread → /engagements/<engagementId>/messages
                      linkedItemType='thread'     → general thread    → /messages/<threadId>
                    CS-GEN-002: additive — 'thread' branch is NEW; 'engagement' branch unchanged. // CS-GEN-002
                    CS-TS-003: mirrors portal feed new_message render. // CS-TS-003
                    ADR-006: admin-only routes. // ADR-006
                  - new_engagement_request / onboarding_completed: link to /requests/<id> (AC-DOOR-005-02).
                  CS-GEN-002: existing link for new_engagement_request / onboarding_completed unchanged. */}
              {notif.type === NOTIFICATION_TYPE_NEW_MESSAGE && notif.linkedItemType === "engagement" && notif.linkedItemId ? (
                // Engagement-thread new_message — link to engagement messages area.
                // AC-MSG-013-02: leads the accountant to the engagement thread ("through the EPIC-016 feed").
                // BUG-017-002: emission sets linkedItemType='engagement', linkedItemId=engagementId for engagement threads.
                // CS-TS-003: mirrors portal new_message feed link pattern. // CS-TS-003
                // ADR-006: admin route /engagements/<id>/messages. // ADR-006
                <a
                  href={`/engagements/${notif.linkedItemId}/messages`}
                  className="mt-1 inline-block text-xs text-blue-600 underline hover:text-blue-800"
                  data-testid={`notification-link-${notif.id}`}
                  data-linked-item-id={notif.linkedItemId}
                >
                  View messages
                </a>
              ) : notif.type === NOTIFICATION_TYPE_NEW_MESSAGE && notif.linkedItemType === "thread" && notif.linkedItemId ? (
                // General-thread new_message — link to general thread messages area.
                // BUG-017-002 (Option A): emission sets linkedItemType='thread', linkedItemId=threadId for general threads.
                // AC-MSG-013-02: actionable link satisfies "through the EPIC-016 feed" for general threads.
                // CS-GEN-002: additive — new 'thread' branch does not change existing 'engagement' branch. // CS-GEN-002
                // CS-TS-003: mirrors portal new_message general-thread link pattern. // CS-TS-003
                // ADR-006: admin route /messages/<threadId>. // ADR-006
                <a
                  href={`/messages/${notif.linkedItemId}`}
                  className="mt-1 inline-block text-xs text-blue-600 underline hover:text-blue-800"
                  data-testid={`notification-link-${notif.id}`}
                  data-linked-item-id={notif.linkedItemId}
                >
                  View messages
                </a>
              ) : notif.type === NOTIFICATION_TYPE_DOCUMENT_UPLOADED && notif.linkedItemType === "engagement" && notif.linkedItemId ? (
                // Document uploaded with engagement linkage — link to engagement documents area.
                // AC-MSG-013-03: leads the accountant to the uploaded document's engagement.
                <a
                  href={`/engagements/${notif.linkedItemId}/documents`}
                  className="mt-1 inline-block text-xs text-blue-600 underline hover:text-blue-800"
                  data-testid={`notification-link-${notif.id}`}
                  data-linked-item-id={notif.linkedItemId}
                >
                  View documents
                </a>
              ) : notif.engagementRequestId ? (
                // new_engagement_request / onboarding_completed — link to request detail (AC-DOOR-005-02).
                <a
                  href={`/requests/${notif.engagementRequestId}`}
                  className="mt-1 inline-block text-xs text-blue-600 underline hover:text-blue-800"
                  data-testid={`notification-link-${notif.id}`}
                  data-engagement-request-id={notif.engagementRequestId}
                >
                  Review request
                </a>
              ) : null}

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
