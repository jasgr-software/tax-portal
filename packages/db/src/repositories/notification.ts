/**
 * packages/db/src/repositories/notification.ts
 *
 * Data-access functions for Notification.
 *
 * EPIC-003 (TASK-003-003): Original accountant-only notification feed.
 *   - listNotifications (request pool, SESSION_CONTEXT gated)
 *   - markNotificationRead (request pool)
 *
 * EPIC-016 / TASK-016-002: Generalized for dual-role (CLIENT + ACCOUNTANT) receipt.
 *   - NotificationItem extended with recipientType, recipientUserId, linkedItemType, linkedItemId
 *   - listNotifications updated to return new fields
 *   - countUnreadNotifications (derived unread count — AC-MSG-017-02)
 *   - markNotificationsReadByLinkedItem (per-principal idempotent mark-read — AC-MSG-015-02/-03)
 *   - emitNotification (admin-pool INSERT helper — used by TASK-016-004 source events)
 *
 * EPIC-016 / TASK-016-004: Source-event wiring.
 *   - emitAndPublishNotification (convenience wrapper: emit + real-time publish — ADR-023)
 *
 * Architecture:
 *   - READ operations (listNotifications, countUnreadNotifications):
 *       request pool (db / SESSION_CONTEXT) → RLS enforced by sec.pol_Notification (ADR-005).
 *   - MARK-READ operations (markNotificationRead, markNotificationsReadByLinkedItem):
 *       request pool (db / SESSION_CONTEXT) → BLOCK predicate allows only entitled principal.
 *   - EMIT operation (emitNotification):
 *       admin pool (mssql) → IS_MEMBER('app_admin_role')=1 → BLOCK predicate exempt.
 *       Bypasses the BLOCK predicate correctly — server-authoritative INSERT.
 *       ADR-003 §7: admin-pool write, no SESSION_CONTEXT needed.
 *
 * DECISION: No WHERE recipientUserId = … in request-pool reads.
 *   The repository does not add its own WHERE clause on top of RLS.
 *   sec.pol_Notification is the sole enforcement boundary (ADR-005 §3).
 *   Adding a WHERE clause here would mask a policy regression.
 *   DECISION-016-002-A
 *
 * ADR-003: SESSION_CONTEXT identity propagation via db wrapper / withClerkIdentity. // ADR-003
 * ADR-005: sec.pol_Notification is the sole read enforcement boundary. // ADR-005
 * ADR-023: real-time publish via getNotificationTransport() selector. // ADR-023
 * CS-TS-001: all request-pool reads/writes go through the db wrapper. // CS-TS-001
 * CS-TS-002: admin pool via getAdminPool() inside this module only. // CS-TS-002
 * CS-GEN-001: no PII in notification titles or transport payload. // CS-GEN-001
 * CS-GEN-002: additive generalization — no existing export removed or narrowed. // CS-GEN-002
 * CS-GEN-003: governing keys cited throughout. // CS-GEN-003
 *
 * NOTE: createNotification was removed — TASK-003-003 inlined the INSERT directly into
 * createEngagementRequest (packages/db/src/repositories/engagement-request.ts) using the
 * admin pool there. No external call sites exist for a standalone createNotification function.
 *
 * No @read_only on SESSION_CONTEXT (ADR-003 Amendment 1 — BUG-002-003).
 */

import { db } from "../client.js";
import { getAdminPool } from "../admin-connection.js";
import mssqlPkg from "mssql";

const { Request: MssqlRequest } = mssqlPkg;

// ─── NotificationItem ─────────────────────────────────────────────────────────

/**
 * NotificationItem — generalized for dual-role (ACCOUNTANT + CLIENT) feeds.
 *
 * EPIC-003 fields (preserved — CS-GEN-002):
 *   id, type, title, body, readAt, engagementRequestId, createdAt.
 *
 * EPIC-016 additive fields (TASK-016-002 / BRIEF-016):
 *   recipientType   — 'ACCOUNTANT' | 'CLIENT' discriminator (AC-MSG-007-01/-02)
 *   recipientUserId — nullable FK → User.id — non-null for CLIENT notifications
 *   linkedItemType  — optional linked-item type (AC-MSG-015-01)
 *   linkedItemId    — optional linked-item id (AC-MSG-015-01)
 *
 * CS-GEN-002: no existing field removed or narrowed; new fields added as optional. // CS-GEN-002
 * AC-MSG-007-01/-02: the authoritative feed shape each principal sees under RLS.
 */
export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string | null;
  /** null = unread; non-null = timestamp when the recipient marked it read */
  readAt: Date | null;
  engagementRequestId: string | null;
  createdAt: Date;
  /** 'ACCOUNTANT' | 'CLIENT' — recipient type discriminator (EPIC-016 / TASK-016-001) */
  recipientType: string;
  /** Nullable FK → User.id — non-null when recipientType='CLIENT' (EPIC-016 / TASK-016-001) */
  recipientUserId: string | null;
  /** Optional linked-item type (e.g. 'document', 'engagement', 'request') — AC-MSG-015-01 */
  linkedItemType: string | null;
  /** Optional linked-item id (UNIQUEIDENTIFIER as string) — AC-MSG-015-01 */
  linkedItemId: string | null;
}

// ─── emitNotification input type ─────────────────────────────────────────────

/**
 * Input for emitNotification — the server-side admin-pool INSERT helper.
 *
 * Called by TASK-016-004 (source-event wiring). All fields are server-authoritative;
 * recipientUserId MUST come from server-verified identity, never from client input.
 *
 * AC-MSG-007-01/-02: the recipient is scoped by recipientType + recipientUserId.
 * ADR-003 §7: admin pool write — bypasses BLOCK predicate (IS_MEMBER('app_admin_role')=1).
 */
export interface EmitNotificationInput {
  /** 'ACCOUNTANT' | 'CLIENT' — recipient type discriminator */
  recipientType: "ACCOUNTANT" | "CLIENT";
  /** FK → User.id — required when recipientType='CLIENT'; null for 'ACCOUNTANT' */
  recipientUserId?: string | null;
  /** Notification type discriminator (e.g. 'document_uploaded', 'new_engagement_request') */
  type: string;
  /** Short display title shown in the notification feed */
  title: string;
  /** Optional richer detail text */
  body?: string | null;
  /** Optional linked-item type (e.g. 'document', 'engagement') — AC-MSG-015-01 */
  linkedItemType?: string | null;
  /** Optional linked-item id (UNIQUEIDENTIFIER string) — AC-MSG-015-01 */
  linkedItemId?: string | null;
  /** Optional FK → EngagementRequest — retained for EPIC-003 back-compat */
  engagementRequestId?: string | null;
}

/** Result of emitNotification */
export interface EmitNotificationResult {
  /** The newly inserted Notification id (UNIQUEIDENTIFIER as string) */
  id: string;
}

// ─── listNotifications (request pool — subject to RLS) ────────────────────────

/**
 * Lists notifications visible to the current SESSION_CONTEXT identity.
 *
 * Under sec.pol_Notification (TASK-016-001):
 *   - ACCOUNTANT sees all accountant-scoped notifications (ordered newest-first).
 *   - CLIENT sees only their own client-scoped notifications (recipientUserId match).
 *   - null SESSION_CONTEXT sees ZERO rows (fail-closed, ADR-003 §5).
 *
 * DECISION: No WHERE clause added — the repository leans entirely on sec.pol_Notification
 * as the enforcement boundary. Adding a WHERE recipientUserId = … clause here would mask a
 * policy regression (the policy is the gate; the repository is not belt-and-suspenders here).
 * // ADR-005 // ADR-003 // DECISION-016-002-A
 *
 * Must be called within a withRequestContext() / withClerkIdentity() scope.
 * Ordering: createdAt DESC (newest first).
 *
 * AC-MSG-007-01/-02: feed is authoritative and complete per viewing principal.
 * AC-MSG-016-01/-02: ≥90-day-old notifications are returned (no purge filter applied).
 *
 * // CS-TS-001 // ADR-003 // ADR-005
 */
export async function listNotifications(): Promise<NotificationItem[]> {
  // DECISION: use db (the Prisma $extends wrapped request client) for reads.
  // The $extends middleware sets SESSION_CONTEXT before each query, enforcing
  // the RLS predicate context (ADR-003 §2, ADR-005).
  // CS-TS-001: request pool read goes through the db wrapper. // CS-TS-001
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
        recipientType: string;
        recipientUserId: string | null;
        linkedItemType: string | null;
        linkedItemId: string | null;
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
    recipientType: row.recipientType,
    recipientUserId: row.recipientUserId ?? null,
    linkedItemType: row.linkedItemType ?? null,
    linkedItemId: row.linkedItemId ?? null,
  }));
}

// ─── markNotificationRead (request pool — subject to RLS BLOCK predicate) ────

/**
 * Marks a single notification as read by id, setting readAt to now.
 *
 * DECISION: Uses the request pool (db) — the viewing principal's SESSION_CONTEXT means
 * sec.pol_Notification's BLOCK BEFORE UPDATE predicate allows the update for entitled
 * principals. A non-entitled SESSION_CONTEXT would be blocked (fail-closed).
 *
 * If the notification is already read, this is idempotent (readAt is updated to most recent).
 *
 * Returns the id of the notification that was marked read.
 * Throws if the notification doesn't exist or isn't visible (RLS returns 0 rows).
 *
 * // CS-TS-001 // ADR-003 // ADR-005 // DECISION-016-002-B (mark-read by id — kept for back-compat)
 */
export async function markNotificationRead(notificationId: string): Promise<{ id: string }> {
  // CS-TS-001: request pool via db wrapper (SESSION_CONTEXT set by middleware). // CS-TS-001
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

// ─── countUnreadNotifications (request pool — derived count) ─────────────────

/**
 * Returns the count of unread notifications visible to the current SESSION_CONTEXT identity.
 *
 * Derived from readAt IS NULL rows filtered by RLS — NOT a stored counter (AC-MSG-017-02).
 * Consistent with the client's visible feed (no WHERE clause beyond RLS — DECISION-016-002-A).
 *
 * Must be called within a withRequestContext() / withClerkIdentity() scope.
 *
 * AC-MSG-017-02: unread count is derived (readAt IS NULL), not a stored counter.
 * // CS-TS-001 // ADR-003 // ADR-005 // DECISION-016-002-A
 */
export async function countUnreadNotifications(): Promise<number> {
  // CS-TS-001: request pool via db wrapper (SESSION_CONTEXT set by middleware). // CS-TS-001
  const count = await (db as unknown as {
    notification: {
      count: (args: {
        where: { readAt: null };
      }) => Promise<number>;
    };
  }).notification.count({
    where: { readAt: null },
  });

  return count;
}

// ─── markNotificationsReadByLinkedItem (request pool — linked-item mark-read) ─

/**
 * Input for markNotificationsReadByLinkedItem.
 *
 * DECISION-016-002-B: mark-read is keyed on the linked-item pair (linkedItemType + linkedItemId),
 * not on a notification id, so a single UI view event marks all unread notifications for that item.
 */
export interface MarkReadByLinkedItemInput {
  /** Linked-item type (e.g. 'document', 'engagement', 'request') — AC-MSG-015-01 */
  linkedItemType: string;
  /** Linked-item id (UNIQUEIDENTIFIER string) — AC-MSG-015-01 */
  linkedItemId: string;
}

/**
 * Marks all unread notifications for the given linked item as read (readAt = now).
 *
 * Scoped by SESSION_CONTEXT identity — each principal marks only their own notifications
 * (the BLOCK predicate on the request pool enforces this per ADR-005).
 *
 * Idempotent: already-read notifications are overwritten with the latest readAt timestamp
 * (effectively a no-op for the unread state, consistent across calls).
 *
 * DECISION-016-002-B: keyed on linked-item pair so a single view marks all related notifs.
 * // CS-TS-001 // ADR-003 // ADR-005 // AC-MSG-015-02 // AC-MSG-015-03
 */
export async function markNotificationsReadByLinkedItem(
  input: MarkReadByLinkedItemInput,
): Promise<{ markedCount: number }> {
  // CS-TS-001: request pool via db wrapper (SESSION_CONTEXT enforces RLS). // CS-TS-001
  const result = await (db as unknown as {
    notification: {
      updateMany: (args: {
        where: {
          linkedItemType: string;
          linkedItemId: string;
          readAt: null;
        };
        data: { readAt: Date };
      }) => Promise<{ count: number }>;
    };
  }).notification.updateMany({
    where: {
      linkedItemType: input.linkedItemType,
      linkedItemId: input.linkedItemId,
      readAt: null,
    },
    data: { readAt: new Date() },
  });

  return { markedCount: result.count };
}

// ─── emitNotification (admin pool — server-authoritative INSERT) ──────────────

/**
 * Inserts a Notification row via the admin pool (bypasses RLS BLOCK predicate).
 *
 * Called by TASK-016-004 source-event hooks (completeUpload, transitionEngagementStatus,
 * confirmDelivery, acceptRequest, declineRequest) to emit a feed notification after the
 * source transaction commits.
 *
 * The admin pool INSERT is IS_MEMBER('app_admin_role')=1 → BLOCK predicate exempt.
 * No SESSION_CONTEXT needed (ADR-003 §7: admin-pool write).
 *
 * CS-TS-002: admin pool via getAdminPool() inside packages/db only — not exported. // CS-TS-002
 * CS-GEN-001: caller is responsible for no-PII in title/body/payload. // CS-GEN-001
 * ADR-003 §7: admin pool write. // ADR-003
 * ADR-005: BLOCK-exempt via IS_MEMBER('app_admin_role'). // ADR-005
 */
export async function emitNotification(
  input: EmitNotificationInput,
): Promise<EmitNotificationResult> {
  // CS-TS-002: admin pool via getAdminPool() — only inside packages/db. // CS-TS-002
  const pool = await getAdminPool();
  const req = new MssqlRequest(pool);

  req.input("type", mssqlPkg.NVarChar(50), input.type);
  req.input("title", mssqlPkg.NVarChar(200), input.title);
  req.input("body", mssqlPkg.NVarChar(mssqlPkg.MAX), input.body ?? null);
  req.input("recipientType", mssqlPkg.NVarChar(16), input.recipientType);
  req.input("recipientUserId", mssqlPkg.UniqueIdentifier, input.recipientUserId ?? null);
  req.input("linkedItemType", mssqlPkg.NVarChar(50), input.linkedItemType ?? null);
  req.input("linkedItemId", mssqlPkg.UniqueIdentifier, input.linkedItemId ?? null);
  req.input("engagementRequestId", mssqlPkg.UniqueIdentifier, input.engagementRequestId ?? null);

  const result = await req.query<{ id: string }>(
    `INSERT INTO [dbo].[Notification]
       ([type], [title], [body], [recipientType], [recipientUserId],
        [linkedItemType], [linkedItemId], [engagementRequestId])
     OUTPUT INSERTED.[id]
     VALUES
       (@type, @title, @body, @recipientType, @recipientUserId,
        @linkedItemType, @linkedItemId, @engagementRequestId)`,
  );

  const id = result.recordset[0]?.id;
  if (!id) throw new Error("emitNotification: INSERT did not return an id");

  return { id };
}

// ─── emitAndPublishNotification (emit + real-time publish wrapper) ────────────

/**
 * Convenience wrapper: inserts a Notification row AND publishes to the real-time transport.
 *
 * Introduced by TASK-016-004 (source-event wiring) for the five source-event hooks.
 * Keeps the emit-then-publish pattern co-located so source files only import one function.
 *
 * Publish is fire-and-not-blocking — it happens after commit (additive, post-transaction)
 * so the source mutation is atomic while the notification arrives reliably post-commit.
 * The transport is resolved via the ADR-023 port selector (mock | real).
 *
 * Channel convention:
 *   ACCOUNTANT → "accountant:notifications"
 *   CLIENT     → "user:<recipientUserId>"
 *
 * Payload shape (CS-GEN-001 — no PII):
 *   { notificationId: string, notificationType: string }
 *   No user ids, email addresses, names, or linked-item content.
 *
 * ADR-003: admin pool write (emitNotification). // ADR-003
 * ADR-005: BLOCK-exempt via IS_MEMBER('app_admin_role'). // ADR-005
 * ADR-023: transport selected via getNotificationTransport() — mock | real. // ADR-023
 * CS-GEN-001: payload carries only notificationId + notificationType — no PII. // CS-GEN-001
 * CS-GEN-002: new additive export — emitNotification unchanged. // CS-GEN-002
 * CS-GEN-003: governing keys cited above and in callers. // CS-GEN-003
 */
export async function emitAndPublishNotification(
  input: EmitNotificationInput,
): Promise<EmitNotificationResult> {
  // 1. Admin-pool INSERT (atomic with the source transaction on the caller side)
  const result = await emitNotification(input);

  // 2. Publish via the real-time transport (post-commit notification delivery)
  //    Dynamic import keeps the realtime package out of critical-path cold-start.
  //    ADR-023: selector resolves to mock (test/dev) or real provider (prod). // ADR-023
  const { getNotificationTransport } = await import("@tax-portal/realtime");
  const transport = getNotificationTransport();

  // Channel convention: ACCOUNTANT → shared channel; CLIENT → per-user channel
  const channel =
    input.recipientType === "CLIENT" && input.recipientUserId
      ? `user:${input.recipientUserId}`
      : "accountant:notifications";

  // CS-GEN-001: payload MUST NOT contain PII — only opaque identifiers. // CS-GEN-001
  await transport.publish(channel, {
    type: "notification.created",
    payload: {
      notificationId: result.id,
      notificationType: input.type,
    },
  });

  return result;
}
