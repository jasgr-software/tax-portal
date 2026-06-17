/**
 * packages/db/src/repositories/notification.ts
 *
 * Data-access functions for Notification.
 *
 * AC-DOOR-005-03: Notifications are delivered to the accountant only.
 * AC-MSG-013-01:  Accountant receives a notification when a new service request is submitted.
 *
 * DECISION: Three operations, two pools:
 *   - createNotification: uses admin pool (app_admin_role, RLS-exempt).
 *     Rationale: notifications are generated as part of recording an anonymous submission
 *     (TASK-003-003 will call this from the portal submit action, which runs under the
 *     admin pool — the one sanctioned identity-less write pattern per ADR-003 §1/§6).
 *     The admin pool bypasses sec.pol_Notification's BLOCK predicates, so the INSERT
 *     succeeds. The request pool would fail the BLOCK predicate in any case.
 *   - listNotifications / markNotificationRead: use the request pool (db / SESSION_CONTEXT).
 *     Rationale: reads are accountant-context operations; sec.pol_Notification FILTER
 *     predicate enforces accountant-only visibility — a CLIENT or null SESSION_CONTEXT
 *     context sees ZERO rows (ADR-005, ADR-003).
 *
 * No @read_only on SESSION_CONTEXT (ADR-003 Amendment 1 — BUG-002-003).
 *
 * Implementation note: uses raw mssql via getAdminPool() for createNotification, and
 * the Prisma `db` extended client for reads, consistent with the patterns in this package.
 * The Prisma client for reads is used here because Notification reads are always within
 * an authenticated request context (withRequestContext() / withClerkIdentity() in tests).
 */

import mssqlPkg from "mssql";
import { getAdminPool } from "../admin-connection.js";
import { db } from "../client.js";

const { Request: MssqlRequest } = mssqlPkg;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CreateNotificationInput {
  /** Notification type discriminator (e.g. 'new_engagement_request') — AC-MSG-013-01 */
  type: string;
  /** Short display title for the notification feed */
  title: string;
  /** Optional richer detail text */
  body?: string | undefined;
  /** FK → EngagementRequest (nullable for future non-request notification types) */
  engagementRequestId?: string | undefined;
}

export interface CreateNotificationResult {
  /** The newly created notification ID (UNIQUEIDENTIFIER as string) */
  id: string;
}

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

// ─── createNotification (admin pool — RLS-exempt INSERT) ───────────────────────

/**
 * Creates a new Notification row.
 *
 * DECISION: Uses admin pool (app_admin_role, RLS-exempt) because notifications are
 * generated during anonymous engagement request submissions (TASK-003-003) — the one
 * sanctioned identity-less write path (ADR-003 §1/§6).
 *
 * The sec.pol_Notification BLOCK predicate guards AFTER INSERT on the request pool;
 * the admin pool bypasses it (IS_MEMBER('app_admin_role') = 1 branch).
 *
 * Returns {id} of the new notification row.
 */
export async function createNotification(
  input: CreateNotificationInput,
): Promise<CreateNotificationResult> {
  const pool = await getAdminPool();
  const req = new MssqlRequest(pool);
  req.input("type", input.type);
  req.input("title", input.title);
  req.input("body", input.body ?? null);
  req.input("engagementRequestId", input.engagementRequestId ?? null);

  const result = await req.query<{ id: string }>(
    `INSERT INTO [dbo].[Notification]
       ([type], [title], [body], [engagementRequestId])
     OUTPUT INSERTED.[id]
     VALUES (@type, @title, @body, @engagementRequestId)`,
  );

  const newNotification = result.recordset[0];
  if (!newNotification) {
    throw new Error("createNotification: INSERT did not return a row — unexpected SQL Server behavior");
  }

  return { id: newNotification.id };
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
