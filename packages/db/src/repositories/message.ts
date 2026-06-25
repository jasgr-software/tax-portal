/**
 * packages/db/src/repositories/message.ts
 *
 * Data-access functions for Message (EPIC-017 / TASK-017-002 + TASK-017-003).
 *
 * TASK-017-002: appendMessage — admin-pool INSERT of a Message row with verbatim body.
 * TASK-017-003: post-write recipient notification.
 *   After appendMessage commits, this module resolves the non-sender participant(s)
 *   server-authoritatively (admin-pool participation lookup) and calls
 *   emitAndPublishNotification for each recipient — fire-and-not-blocking, additive.
 *
 *   AC-MSG-013-02: when a CLIENT sends, the ACCOUNTANT receives a notification.
 *   AC-MSG-014-01: when the ACCOUNTANT sends, the CLIENT(s) receive a notification.
 *   The sender is NEVER self-notified (recipient-only entitlement).
 *
 * Notification linkedItemType encoding (BUG-017-002 / Option A — row-only renderer):
 *   The feed renderer is row-only (builds URL from linkedItemType + linkedItemId alone,
 *   no thread lookup — matching the document_uploaded precedent). To enable zero-lookup
 *   URL construction, the emission encodes the appropriate item type per thread kind:
 *   - Engagement thread → linkedItemType:'engagement', linkedItemId:thread.engagementId
 *     (renderer reuses the existing engagement-link branch → /engagements/<id>/messages)
 *   - General thread → linkedItemType:'thread', linkedItemId:threadId
 *     (renderer has a new 'thread' branch → /messages/<threadId>)
 *
 * // BUG-017-002 // AC-MSG-013-02 // AC-MSG-014-01 // ADR-005 // ADR-006 // EPIC-016
 * // CS-GEN-002 // CS-GEN-003 // CS-TS-003
 *
 * Recipient resolution is SERVER-AUTHORITATIVE (admin-pool lookup — never client-supplied):
 *   For an engagement thread (kind='engagement'):
 *     Recipients = (Engagement.clientUserId + EngagementParticipant user ids + accountant sentinel)
 *               MINUS the sender's clerkId.
 *     In practice: if sender is the accountant (senderClerkId not matched to any CLIENT
 *     user id), notify all CLIENT users (clientUserId + participants).
 *     If sender is a CLIENT user, notify the accountant (one notification, recipientType=ACCOUNTANT).
 *   For a general thread (kind='general'):
 *     Recipients = (Thread.clientUserId + accountant sentinel) MINUS sender.
 *
 * DECISION-017-003-C: The accountant is identified by elimination — if the sender's clerkId
 *   matches any resolved CLIENT userId → clerkId mapping, the sender is CLIENT, otherwise
 *   the sender is ACCOUNTANT.
 *
 * Pool strategy:
 *   appendMessage: ADMIN POOL (app_admin_role, RLS-exempt).
 *   resolveNotificationRecipients (internal): ADMIN POOL — server-authoritative lookup.
 *   emitAndPublishNotification (from notification.ts): ADMIN POOL — exempt.
 *
 * Plain-text body guarantee (AC-MSG-003-01/-02 / REQ-MSG-003):
 *   The body is stored EXACTLY as received — byte-verbatim — no server-side transform.
 *   Rendering-side verbatim proof is deferred to TASK-017-006/-007.
 *
 * Attachment seam:
 *   The appendMessage signature returns both the message id and threadId so the later
 *   attachment task (TASK-017-004) can relate MessageAttachment rows to this Message.
 *   Attachment storage / AV scan is NOT in scope for this task.
 *
 * CS-GEN-001: message bodies must NEVER be logged — not in this module, not in callers.
 *   Logging a body would expose client PII and violate the no-PII-in-logs constraint. // CS-GEN-001
 * CS-GEN-002: notification emission is additive — appendMessage signature unchanged. // CS-GEN-002
 *
 * ADR-003: admin pool write. // ADR-003
 * ADR-005: BLOCK predicate on request pool prevents CLIENT from calling this path directly. // ADR-005
 * ADR-006: consumed by both portal + admin action layers (shared package). // ADR-006
 * ADR-023: real-time publish via getNotificationTransport() selector inside emitAndPublishNotification. // ADR-023
 * CS-TS-001: no request-pool read here — this file is write-only. // CS-TS-001
 * CS-TS-002: admin pool via getAdminPool() inside this module only. // CS-TS-002
 * CS-GEN-003: governing keys cited throughout. // CS-GEN-003
 */

import mssqlPkg from "mssql";
import { getAdminPool } from "../admin-connection.js";
import { emitAndPublishNotification } from "./notification.js";

const { Request: MssqlRequest } = mssqlPkg;

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Input for appendMessage.
 *
 * All fields are server-authoritative — resolved from verified session/server state.
 * The body is stored verbatim (AC-MSG-003-01/-02).
 *
 * CS-GEN-001: do not log body or senderClerkId in error messages. // CS-GEN-001
 * AC-MSG-002-01/-02: a message has a sender, a thread, and a plain-text body.
 */
export interface AppendMessageInput {
  /** The Thread.id to append to (server-resolved — never client-supplied). */
  threadId: string;
  /**
   * The Clerk ID of the sender (CLIENT or ACCOUNTANT).
   * Must be resolved from the verified server session — never from client-supplied data.
   */
  senderClerkId: string;
  /**
   * The plain-text message body.
   *
   * AC-MSG-003-01/-02 / REQ-MSG-003: stored VERBATIM — byte-identical to what is received.
   * No server-side sanitisation, HTML escaping-into-storage, Markdown interpretation, or
   * any other transformation is applied at this layer.
   *
   * CS-GEN-001: NEVER log this value. // CS-GEN-001
   */
  body: string;
}

/**
 * Result of appendMessage.
 *
 * The message id and threadId are both returned so the attachment task (TASK-017-004)
 * can INSERT a MessageAttachment row referencing the message.
 */
export interface AppendMessageResult {
  /** The newly inserted Message.id (UNIQUEIDENTIFIER as string). */
  id: string;
  /** The Thread.id the message was appended to. */
  threadId: string;
}

// ─── Internal: participation resolution (admin pool — server-authoritative) ───

/**
 * Thread row shape returned by the admin-pool participation lookup.
 * Internal to this module — not exported.
 */
interface ThreadParticipation {
  kind: "engagement" | "general";
  engagementId: string | null;
  clientUserId: string | null;
}

/**
 * Client recipient resolved by the participation query.
 * A recipient has a User.id (for recipientUserId) and optionally their clerkId.
 */
interface ClientRecipient {
  /** The User.id (UNIQUEIDENTIFIER) — used as recipientUserId in the notification. */
  userId: string;
  /** The User.clerkId — used to check if this user is the sender. */
  clerkId: string;
}

/**
 * Resolves the thread's participation shape (kind, engagementId, clientUserId) via admin pool.
 *
 * CS-TS-002: admin pool via getAdminPool() — internal to packages/db. // CS-TS-002
 * ADR-003 §7: admin-pool read; no SESSION_CONTEXT needed. // ADR-003
 */
async function resolveThreadParticipation(threadId: string): Promise<ThreadParticipation | null> {
  const pool = await getAdminPool();
  const req = new MssqlRequest(pool);
  req.input("threadId", mssqlPkg.UniqueIdentifier, threadId);
  const result = await req.query<{
    kind: string;
    engagementId: string | null;
    clientUserId: string | null;
  }>(`
    SELECT [kind], [engagementId], [clientUserId]
    FROM   [dbo].[Thread]
    WHERE  [id] = @threadId
  `);
  const row = result.recordset[0];
  if (!row) return null;
  return {
    kind: row.kind as "engagement" | "general",
    engagementId: row.engagementId ?? null,
    clientUserId: row.clientUserId ?? null,
  };
}

/**
 * Resolves all CLIENT User records that participate in an engagement thread.
 *
 * Returns the set of (userId, clerkId) pairs for:
 *   - Engagement.clientUserId (the primary client — may be NULL for new-prospect path)
 *   - EngagementParticipant.userId (additional participants)
 *
 * DECISION-017-003-C: deduplication is done in-SQL via UNION (no duplicate User rows).
 *
 * CS-TS-002: admin pool via getAdminPool() — internal to packages/db. // CS-TS-002
 * ADR-003 §7: admin-pool read; no SESSION_CONTEXT needed. // ADR-003
 * CS-GEN-001: only userId + clerkId returned — no PII. // CS-GEN-001
 */
async function resolveEngagementClientRecipients(engagementId: string): Promise<ClientRecipient[]> {
  const pool = await getAdminPool();
  const req = new MssqlRequest(pool);
  req.input("engagementId", mssqlPkg.UniqueIdentifier, engagementId);

  // UNION of engagement owner + EngagementParticipant users.
  // DECISION-017-003-C: deduplication via UNION (implicit DISTINCT).
  const result = await req.query<{ userId: string; clerkId: string }>(`
    SELECT u.[id] AS userId, u.[clerkId]
    FROM   [dbo].[Engagement] e
    JOIN   [dbo].[User] u ON u.[id] = e.[clientUserId]
    WHERE  e.[id] = @engagementId
      AND  e.[clientUserId] IS NOT NULL

    UNION

    SELECT u.[id] AS userId, u.[clerkId]
    FROM   [dbo].[EngagementParticipant] ep
    JOIN   [dbo].[User] u ON u.[id] = ep.[userId]
    WHERE  ep.[engagementId] = @engagementId
  `);

  return result.recordset.map((row) => ({ userId: row.userId, clerkId: row.clerkId }));
}

/**
 * Resolves the CLIENT User record associated with a general thread.
 *
 * Returns null when Thread.clientUserId IS NULL (should not happen for kind='general',
 * but handled defensively).
 *
 * CS-TS-002: admin pool via getAdminPool() — internal to packages/db. // CS-TS-002
 * ADR-003 §7: admin-pool read; no SESSION_CONTEXT needed. // ADR-003
 */
async function resolveGeneralThreadClientRecipient(
  clientUserId: string,
): Promise<ClientRecipient | null> {
  const pool = await getAdminPool();
  const req = new MssqlRequest(pool);
  req.input("clientUserId", mssqlPkg.UniqueIdentifier, clientUserId);

  const result = await req.query<{ userId: string; clerkId: string }>(`
    SELECT [id] AS userId, [clerkId]
    FROM   [dbo].[User]
    WHERE  [id] = @clientUserId
  `);

  const row = result.recordset[0];
  if (!row) return null;
  return { userId: row.userId, clerkId: row.clerkId };
}

/**
 * Emits new-message notifications to all non-sender participants.
 *
 * AC-MSG-013-02: sender is CLIENT → exactly one ACCOUNTANT notification.
 * AC-MSG-014-01: sender is ACCOUNTANT → one CLIENT notification per non-sender client.
 * Sender is NEVER self-notified.
 * Multi-participant: each non-sender client is notified individually.
 *
 * DECISION-017-003-C: "sender is CLIENT" is determined by whether the senderClerkId
 *   matches any resolved client recipient's clerkId.
 *   If senderClerkId matches → sender is CLIENT → notify ACCOUNTANT only.
 *   If senderClerkId does NOT match any client → sender is ACCOUNTANT → notify all CLIENTs.
 *
 * CS-GEN-001: no PII (message body, user email, name) in notification title or payload. // CS-GEN-001
 * CS-GEN-002: additive post-write call; appendMessage signature unchanged. // CS-GEN-002
 * ADR-023: emitAndPublishNotification handles real-time publish. // ADR-023
 *
 * Fire-and-not-blocking: notification emit failures are logged but do NOT throw.
 * The message is already persisted; notification is delivery-best-effort.
 *
 * @internal — called only by appendMessage in this module.
 */
async function emitNewMessageNotifications(
  threadId: string,
  senderClerkId: string,
): Promise<void> {
  // Resolve thread participation (kind, engagementId, clientUserId)
  // CS-TS-002: admin pool — internal to packages/db. // CS-TS-002
  const participation = await resolveThreadParticipation(threadId);
  if (!participation) {
    // Thread not found — cannot resolve recipients. This is unexpected post-INSERT.
    // CS-GEN-001: do NOT log the threadId or senderClerkId at level ERROR. // CS-GEN-001
    console.warn("[message.ts] emitNewMessageNotifications: thread not found after INSERT");
    return;
  }

  // Resolve all CLIENT recipients for this thread.
  // CS-TS-002: admin pool — internal to packages/db. // CS-TS-002
  let clientRecipients: ClientRecipient[] = [];

  if (participation.kind === "engagement" && participation.engagementId) {
    clientRecipients = await resolveEngagementClientRecipients(participation.engagementId);
  } else if (participation.kind === "general" && participation.clientUserId) {
    const single = await resolveGeneralThreadClientRecipient(participation.clientUserId);
    if (single) clientRecipients = [single];
  }

  // DECISION-017-003-C: determine sender role by clerkId matching.
  // If senderClerkId matches any client recipient → sender is CLIENT.
  // Otherwise → sender is ACCOUNTANT.
  const senderIsClient = clientRecipients.some((r) => r.clerkId === senderClerkId);

  // Build the notification list — each non-sender participant gets one notification.
  // AC-MSG-013-02 / AC-MSG-014-01: sender-not-notified; recipient-only.
  const emitPromises: Promise<void>[] = [];

  // BUG-017-002 / Option A: encode kind-dependent linkedItemType so the feed renderer
  // can build the correct URL from the Notification row alone (zero thread lookup).
  // Engagement thread → linkedItemType:'engagement', linkedItemId:engagementId
  //   (renderer: existing engagement branch → /engagements/<id>/messages)
  // General thread   → linkedItemType:'thread',     linkedItemId:threadId
  //   (renderer: new 'thread' branch → /messages/<threadId>)
  // CS-GEN-002: additive — emission for other notification types unchanged. // CS-GEN-002
  // CS-TS-003: consistent encoding on both admin + portal surfaces. // CS-TS-003
  // ADR-005: renderer is row-only (no N+1 thread lookup); matches document_uploaded precedent. // ADR-005
  // ADR-006: consumed by both portal + admin (shared packages/db). // ADR-006
  // EPIC-016: notification feed pattern. // EPIC-016
  const linkedItemType =
    participation.kind === "engagement" && participation.engagementId
      ? "engagement"
      : "thread";
  const linkedItemId =
    participation.kind === "engagement" && participation.engagementId
      ? participation.engagementId
      : threadId;

  if (senderIsClient) {
    // Sender is CLIENT → notify the ACCOUNTANT (recipientType=ACCOUNTANT, no recipientUserId).
    // AC-MSG-013-02: exactly one ACCOUNTANT notification. // AC-MSG-013-02
    emitPromises.push(
      emitAndPublishNotification({
        recipientType: "ACCOUNTANT",
        recipientUserId: null,
        type: "new_message",
        title: "You have a new message",
        linkedItemType, // BUG-017-002: 'engagement' for engagement threads, 'thread' for general
        linkedItemId,   // BUG-017-002: engagementId or threadId per thread kind
      }).then(() => undefined),
    );
  } else {
    // Sender is ACCOUNTANT → notify each non-sender CLIENT participant.
    // AC-MSG-014-01: one notification per non-sender client. // AC-MSG-014-01
    // Multi-participant: each non-sender CLIENT is notified individually (no cross-client leak).
    for (const client of clientRecipients) {
      // Sender is ACCOUNTANT, so no CLIENT will match senderClerkId — all are recipients.
      // (If somehow a client id equals senderClerkId, skip — belt-and-suspenders.)
      if (client.clerkId === senderClerkId) continue; // defensive; should not occur here

      emitPromises.push(
        emitAndPublishNotification({
          recipientType: "CLIENT",
          recipientUserId: client.userId,
          type: "new_message",
          title: "You have a new message",
          linkedItemType, // BUG-017-002: 'engagement' for engagement threads, 'thread' for general
          linkedItemId,   // BUG-017-002: engagementId or threadId per thread kind
        }).then(() => undefined),
      );
    }
  }

  // Fire all emits concurrently — post-write, not blocking the message persistence.
  // CS-GEN-002: additive post-write; failures logged but do not propagate. // CS-GEN-002
  await Promise.allSettled(emitPromises).then((results) => {
    for (const r of results) {
      if (r.status === "rejected") {
        // CS-GEN-001: log at warn level — do not include PII. // CS-GEN-001
        console.warn("[message.ts] emitNewMessageNotifications: notification emit failed:", r.reason);
      }
    }
  });
}

// ─── Write: appendMessage (admin pool — server-authoritative) ─────────────────

/**
 * Appends a new Message row to the given thread, then emits recipient-only new-message
 * notifications to all non-sender participants.
 *
 * Server-authoritative: uses the admin pool (IS_MEMBER('app_admin_role')=1 → BLOCK-exempt).
 * Identity validation (who may send to which thread) is enforced in the action layer
 * (TASK-017-003/-004) before this function is called.
 *
 * Plain-text body (AC-MSG-003-01/-02 / REQ-MSG-003):
 *   The body is INSERT-ed EXACTLY as supplied — no transform, no escaping-into-storage.
 *   The parameterised mssql INSERT prevents SQL injection. The body value stored is the
 *   parameter value as supplied — byte-verbatim at the SQL Server NVarChar(Max) column level.
 *
 * Post-write notification (TASK-017-003 / AC-MSG-013-02 / AC-MSG-014-01):
 *   After the INSERT succeeds, resolves the non-sender participant(s) via an admin-pool
 *   lookup and calls emitAndPublishNotification for each recipient.
 *   Notification emit is FIRE-AND-NOT-BLOCKING — a notification failure does NOT roll back
 *   or fail the send. The message is already durably persisted.
 *   CS-GEN-002: additive; appendMessage signature unchanged. // CS-GEN-002
 *   ADR-023: real-time publish via getNotificationTransport() selector. // ADR-023
 *
 * CS-GEN-001: body is NOT logged — not even on error. // CS-GEN-001
 * CS-TS-002: admin pool via getAdminPool() — only inside packages/db. // CS-TS-002
 * ADR-003 §7: admin pool write; no SESSION_CONTEXT needed. // ADR-003
 * ADR-005: BLOCK predicate on the request pool blocks CLIENT direct INSERT; admin pool is exempt. // ADR-005
 *
 * @returns AppendMessageResult — id + threadId of the newly created Message.
 * @throws if the INSERT does not return a row (unexpected SQL Server behavior).
 *
 * AC-MSG-002-01/-02: message appended to the specified thread with sender + body.
 * AC-MSG-003-01/-02: body stored verbatim — the appended message is the stored value.
 * AC-MSG-013-02: CLIENT sender → ACCOUNTANT notified; sender not notified. // AC-MSG-013-02
 * AC-MSG-014-01: ACCOUNTANT sender → CLIENT(s) notified; sender not notified. // AC-MSG-014-01
 */
export async function appendMessage(
  input: AppendMessageInput,
): Promise<AppendMessageResult> {
  // CS-TS-002: admin pool via getAdminPool() — only inside packages/db. // CS-TS-002
  const pool = await getAdminPool();
  const req = new MssqlRequest(pool);

  req.input("threadId", mssqlPkg.UniqueIdentifier, input.threadId);
  req.input("senderClerkId", mssqlPkg.NVarChar(64), input.senderClerkId);
  // AC-MSG-003-01/-02 / REQ-MSG-003: body stored verbatim — no transform applied.
  // The NVarChar(Max) parameter stores exactly the bytes supplied.
  req.input("body", mssqlPkg.NVarChar(mssqlPkg.MAX), input.body);

  const result = await req.query<{ id: string; threadId: string }>(
    `INSERT INTO [dbo].[Message]
       ([threadId], [senderClerkId], [body], [updatedAt])
     OUTPUT
       INSERTED.[id],
       INSERTED.[threadId]
     VALUES
       (@threadId, @senderClerkId, @body, SYSDATETIMEOFFSET())`,
  );

  const row = result.recordset[0];
  if (!row) {
    // CS-GEN-001: do NOT include body, senderClerkId, or threadId in the error message. // CS-GEN-001
    throw new Error("appendMessage: INSERT did not return a row — unexpected SQL Server behavior");
  }

  const appendResult: AppendMessageResult = { id: row.id, threadId: row.threadId };

  // TASK-017-003: Post-write recipient-only new-message notification.
  // Fire-and-not-blocking: emit after the INSERT commits, additive.
  // CS-GEN-002: additive post-write; appendMessage signature and return value unchanged. // CS-GEN-002
  // ADR-023: emitAndPublishNotification handles real-time publish inside. // ADR-023
  // AC-MSG-013-02 / AC-MSG-014-01: sender-not-notified, recipient-only. // AC-MSG-013-02 // AC-MSG-014-01
  await emitNewMessageNotifications(appendResult.threadId, input.senderClerkId);

  return appendResult;
}
