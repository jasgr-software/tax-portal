/**
 * packages/db/src/repositories/notification.ts
 *
 * Data-access functions for Notification.
 *
 * AC-DOOR-005-03: Notifications are delivered to the accountant only.
 * AC-MSG-013-01:  Accountant receives a notification when a new service request is submitted.
 *
 * DECISION: Two operations, one pool:
 *   - listNotifications / markNotificationRead: use the request pool (db / SESSION_CONTEXT).
 *     Rationale: reads are accountant-context operations; sec.pol_Notification FILTER
 *     predicate enforces accountant-only visibility — a CLIENT or null SESSION_CONTEXT
 *     context sees ZERO rows (ADR-005, ADR-003).
 *
 * NOTE: createNotification was removed — TASK-003-003 inlined the INSERT directly into
 * createEngagementRequest (packages/db/src/repositories/engagement-request.ts) using the
 * admin pool there. No external call sites exist for a standalone createNotification function.
 *
 * No @read_only on SESSION_CONTEXT (ADR-003 Amendment 1 — BUG-002-003).
 */

import { db } from "../client.js";

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string | null;
  /** null = unread; non-null = timestamp when accountant marked it read */
  readAt: Date | null;
  engagementRequestId: string | null;
  createdAt: Date;
}

// ─── listNotifications (request pool — subject to RLS) ────────────────────────

/**
 * Lists notifications visible to the current SESSION_CONTEXT identity.
 *
 * Under sec.pol_Notification:
 *   - ACCOUNTANT sees all notifications (ordered newest-first).
 *   - CLIENT / null SESSION_CONTEXT sees ZERO rows (fail-closed, AC-DOOR-005-03).
 *
 * Must be called within a withRequestContext() / withClerkIdentity() scope.
 * Ordering: createdAt DESC (newest first — most relevant to the accountant first).
 *
 * AC-DOOR-005-03: notification delivered to accountant only.
 */
export async function listNotifications(): Promise<NotificationItem[]> {
  // DECISION: use db (the Prisma $extends wrapped request client) for reads.
  // The $extends middleware sets SESSION_CONTEXT before each query, enforcing
  // the RLS predicate context (ADR-003 §2, ADR-005).
  // Prisma's type for the Notification model returns Date | null for nullable dates.
  const rows = await (db as unknown as {
    notification: {
      findMany: (args: {
        orderBy: { createdAt: "desc" };
      }) => Promise<Array<{
        id: string;
        type: string;
        title: string;
        body: string | null;
        readAt: Date | null;
        engagementRequestId: string | null;
        createdAt: Date;
      }>>;
    };
  }).notification.findMany({
    orderBy: { createdAt: "desc" },
  });

  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    readAt: row.readAt,
    engagementRequestId: row.engagementRequestId,
    createdAt: row.createdAt,
  }));
}

// ─── markNotificationRead (request pool — subject to RLS BLOCK predicate) ────

/**
 * Marks a notification as read by setting readAt to now.
 *
 * DECISION: Uses the request pool (db) — the accountant's session context means
 * sec.pol_Notification's BLOCK BEFORE UPDATE predicate allows the update
 * (ACCOUNTANT branch passes). A CLIENT or null SESSION_CONTEXT would be blocked
 * (BLOCK predicate returns empty → update blocked).
 *
 * If the notification is already read, this is a no-op (readAt is overwritten
 * with the most recent read timestamp — idempotent).
 *
 * Returns the id of the notification that was marked read.
 * Throws if the notification doesn't exist or isn't visible (RLS returns 0 rows).
 */
export async function markNotificationRead(notificationId: string): Promise<{ id: string }> {
  // DECISION: use db (Prisma request pool) for the UPDATE so SESSION_CONTEXT is set
  // and the RLS BLOCK predicate is exercised (fail-closed for non-ACCOUNTANT callers).
  const updated = await (db as unknown as {
    notification: {
      update: (args: {
        where: { id: string };
        data: { readAt: Date };
        select: { id: boolean };
      }) => Promise<{ id: string }>;
    };
  }).notification.update({
    where: { id: notificationId },
    data: { readAt: new Date() },
    select: { id: true },
  });

  return { id: updated.id };
}
