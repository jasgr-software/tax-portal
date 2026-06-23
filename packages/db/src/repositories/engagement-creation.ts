/**
 * packages/db/src/repositories/engagement-creation.ts
 *
 * Data-layer seams for the two engagement-creation paths (EPIC-012 / TASK-012-002).
 *
 * DECISION-A (creation envelope — BRIEF-012 / REQ-DOOR-009, REQ-DOOR-010):
 *   Both creation paths reuse the existing EngagementRequest machinery:
 *     (1) Returning-client request → EngagementRequest status='pending'; contact resolved
 *         from the caller's on-file User + existing EngagementRequest (no re-entry — AC-DOOR-009-03).
 *     (2) Accountant-initiated → EngagementRequest pre-'accepted' + Engagement created immediately
 *         + primary client linked as EngagementParticipant, all in one withAuditTransaction.
 *   This keeps engagementRequestId non-null and reuses tested code.
 *
 * DECISION-C (duplicate guard — BRIEF-012 / REQ-LIFE-011):
 *   findDuplicateEngagements is a QUERY, NOT a DB unique constraint. The application-layer
 *   duplicate guard allows the override path (AC-LIFE-011-03 sanctioned override).
 *
 * DECISION-E (contact resolution for returning-client path):
 *   The User table carries only id/clerkId/email/role (no firstName/lastName — the User model
 *   is minimal per ADR auth-deferred posture). For the returning-client path we resolve the
 *   caller's existing EngagementRequest (via User.id → Engagement.clientUserId → EngagementRequest)
 *   to copy the on-file firstName/lastName/email. This satisfies AC-DOOR-009-03 (contact NOT
 *   re-entered) without adding firstName/lastName to the User model in this slice.
 *   If the user has no prior engagement (newly signed-up client with no prior request), the
 *   seam throws a UserContactNotFoundError; the UI task (TASK-012-003) must handle this case.
 *   <!-- DECISION: BRIEF-012 / REQ-DOOR-009 / AC-DOOR-009-03 -->
 *
 * Pool strategy — mirrors EPIC-003/005/010/011 patterns:
 *   - createReturningClientRequest:        ADMIN POOL write (same sanctioned pattern as
 *                                          createEngagementRequest — one of the two allowed
 *                                          identity-less writes, ADR-003 §1/§6).
 *   - createAccountantInitiatedEngagement: ADMIN POOL inside withAuditTransaction (ADR-003 §7,
 *                                          DECISION-010-F pattern — accountant-initiated write).
 *   - findDuplicateEngagements:            ADMIN POOL read (RLS-exempt for accountant-surface
 *                                          duplicate detection; production caller is the admin
 *                                          action — accountant identity already verified at the
 *                                          action layer).
 *   - addEngagementParticipant:            ADMIN POOL inside withAuditTransaction (ADR-003 §7).
 *
 * No raw pool import outside packages/db (CS-TS-001 / CS-TS-002).
 * Audit rows record ids + action only — NO contact PII (CS-GEN-001 / ADR-019).
 * All governing keys cited in function-level comments below (CS-GEN-003).
 *
 * // CS-TS-001 // CS-TS-002 // CS-GEN-001 // CS-GEN-003 // ADR-003 // ADR-019
 */

import mssqlPkg from "mssql";
import { getAdminPool } from "../admin-connection.js";
import { withAuditTransaction, recordAuthEvent } from "../audit.js";
import type { AuditActor } from "../audit.js";
import { NOTIFICATION_TYPE_NEW_REQUEST } from "./engagement-request.js";

const { Request: MssqlRequest, Transaction } = mssqlPkg;

// ─── Error types ──────────────────────────────────────────────────────────────

/**
 * Thrown by createReturningClientRequest when the clerkUserId cannot be resolved
 * to a User row in the database.
 *
 * This should not occur in normal operation — the caller (portal action) has already
 * verified the Clerk session. Treat as a fatal data-integrity error.
 *
 * @deprecated MAJOR-002 (PR #93 review): the second-round-trip guard that could exclusively
 *   trigger this error has been removed from resolveCallerContact. The class is kept exported
 *   so the portal actions.ts catch arm compiles; callers may remove the catch arm in a follow-up.
 *   UserContactNotFoundError is now the single error thrown by resolveCallerContact on any
 *   empty-join outcome (clerkId not found OR no prior engagement) — both collapse to the same
 *   caller action (surface "no contact on file").
 */
export class UserNotFoundError extends Error {
  constructor(clerkUserId: string) {
    super(
      `[engagement-creation] createReturningClientRequest: ` +
        `no User row found for clerkUserId='${clerkUserId}'. ` +
        `The caller must verify the Clerk session before invoking this seam.`,
    );
    this.name = "UserNotFoundError";
  }
}

/**
 * Thrown by resolveCallerContact / createReturningClientRequest when the on-file contact
 * (firstName/lastName) cannot be resolved for the caller — i.e., they have no prior
 * EngagementRequest linked to their engagement (or the clerkId/userId is unknown).
 *
 * DECISION-E: contact resolution requires a prior accepted engagement → prior EngagementRequest.
 * MAJOR-002 (PR #93 review): the second DB round-trip that distinguished UserNotFoundError from
 *   UserContactNotFoundError has been removed — both outcomes collapse to UserContactNotFoundError
 *   since both map to the same caller action (surface "no contact on file" to the UI).
 * If the caller has no prior engagement, the UI must handle this case separately.
 */
export class UserContactNotFoundError extends Error {
  constructor(userId: string) {
    super(
      `[engagement-creation] createReturningClientRequest: ` +
        `no prior EngagementRequest found for userId='${userId}'. ` +
        `The caller's contact details cannot be resolved from on-file data (DECISION-E, AC-DOOR-009-03).`,
    );
    this.name = "UserContactNotFoundError";
  }
}

// ─── Input / Result types ─────────────────────────────────────────────────────

/**
 * Input for the returning-client engagement request path.
 *
 * DECISION-A / AC-DOOR-009-03: contact fields (firstName, lastName, email) are intentionally
 * ABSENT from this input — they are resolved from the caller's on-file data (DECISION-E).
 * Never accept them as caller inputs; that is what proves AC-DOOR-009-03.
 *
 * // CS-GEN-003 // ADR-003 // AC-DOOR-009-03 // DECISION-A // DECISION-E
 */
export interface CreateReturningClientRequestInput {
  /** The signed-in client's Clerk user ID (from server-verified session — ADR-003). */
  clerkUserId: string;
  /** One or more service IDs the client is interested in (at least one required). */
  serviceIds: string[];
}

/** Returned from createReturningClientRequest. */
export interface CreateReturningClientRequestResult {
  /** The newly created EngagementRequest id. */
  requestId: string;
  /** Always 'pending' at creation. */
  status: string;
  /** The accountant notification id routed to the inbox. */
  notificationId: string;
}

/**
 * Input for the accountant-initiated engagement-creation path.
 *
 * DECISION-A: the EngagementRequest is created pre-'accepted' (no accept/decline step).
 * The engagement and the primary-participant link are created in the same audit transaction.
 *
 * // CS-GEN-003 // ADR-003 // DECISION-A // AC-DOOR-010-04
 */
export interface CreateAccountantInitiatedEngagementInput {
  /**
   * The internal User.id of the chosen client (server-resolved — never client-supplied).
   * Used to set Engagement.clientUserId + EngagementParticipant.userId.
   */
  clientUserId: string;
  /** One or more service IDs for the engagement (at least one required). */
  serviceIds: string[];
  /**
   * The tax year for this engagement (AC-LIFE-010-01 / DECISION-B).
   * Set at creation; NOT a DB unique constraint (DECISION-C).
   */
  taxYear: number;
  /**
   * The accountant's identity from server-verified session (ADR-003, ADR-019 §2).
   * CS-GEN-001: actor is stored in audit rows, NOT the client contact PII.
   */
  actor: AuditActor;
}

/** Returned from createAccountantInitiatedEngagement. */
export interface CreateAccountantInitiatedEngagementResult {
  /** The newly created Engagement id. */
  engagementId: string;
  /** The newly created EngagementRequest id (pre-accepted). */
  requestId: string;
  /** Always 'New' at creation. */
  engagementStatus: string;
}

/**
 * Input for the duplicate-detect query.
 *
 * DECISION-C: findDuplicateEngagements is a QUERY — NOT a DB unique constraint.
 * The caller decides whether to block or allow (override path for AC-LIFE-011-03).
 *
 * // CS-GEN-003 // DECISION-C // AC-LIFE-011-01 // AC-LIFE-011-02
 */
export interface FindDuplicateEngagementsInput {
  /** The client User.id to check for duplicate engagements. */
  clientUserId: string;
  /**
   * One or more service IDs to check for intersection.
   * A match is returned if the existing engagement's services overlap ANY of these.
   */
  serviceIds: string[];
  /** The tax year to check for duplicates. */
  taxYear: number;
}

/** A duplicate engagement match returned by findDuplicateEngagements. */
export interface DuplicateEngagementMatch {
  /** The existing Engagement id. */
  engagementId: string;
  /** The existing Engagement status. */
  status: string;
  /** The tax year on the existing engagement. */
  taxYear: number | null;
  /** The services that overlap with the proposed serviceIds. */
  overlappingServiceIds: string[];
}

/**
 * Input for adding a participant to an engagement.
 *
 * Idempotent on the @@unique([engagementId, userId]) constraint.
 * AC-LIFE-012-01: link an additional participant.
 *
 * // CS-GEN-003 // ADR-003 // AC-LIFE-012-01
 */
export interface AddEngagementParticipantInput {
  /** The Engagement.id to link the participant to (server-resolved — never client-supplied). */
  engagementId: string;
  /** The User.id of the participant to add (server-resolved — never client-supplied). */
  userId: string;
  /**
   * The actor performing the action (from server-verified session — ADR-003, ADR-019 §2).
   * CS-GEN-001: actor ids stored in audit; NO contact PII.
   */
  actor: AuditActor;
}

/** Returned from addEngagementParticipant. */
export interface AddEngagementParticipantResult {
  /**
   * 'linked'      — new EngagementParticipant row created.
   * 'already_linked' — participant already existed (idempotent; no new row).
   */
  outcome: "linked" | "already_linked";
  /** The EngagementParticipant id (new or existing). */
  participantId: string;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Resolve a User's on-file contact info (firstName/lastName/email) from an existing
 * EngagementRequest linked to their engagement.
 *
 * DECISION-E: The User table has only id/clerkId/email/role (no firstName/lastName).
 * Contact details are stored on the EngagementRequest that originated the invite.
 *
 * Supports two lookup modes (MAJOR-003 fix — PR #93 review):
 *   - { by: 'clerkId', value: clerkUserId } — for the returning-client path
 *     (User → Engagement → EngagementRequest, keyed by User.clerkId)
 *   - { by: 'userId', value: userId }       — for the accountant-initiated path
 *     (Engagement → EngagementRequest, keyed by Engagement.clientUserId)
 * Both paths JOIN through Engagement.clientUserId, so the JOIN structure is identical;
 * only the WHERE predicate column differs.
 *
 * MAJOR-002 (PR #93 review): the second DB round-trip that distinguished UserNotFoundError
 *   from UserContactNotFoundError has been removed. Both outcomes — clerkId not found AND
 *   userId with no prior engagement — collapse to UserContactNotFoundError, since both map
 *   to the same caller action ("no contact on file").
 *
 * Throws UserContactNotFoundError when the join returns empty (no prior EngagementRequest).
 *
 * Uses the admin pool (or the supplied transaction) — helper for admin-pool write paths.
 *
 * // DECISION-E // ADR-003 // AC-DOOR-009-03 // CS-TS-002
 */
async function resolveCallerContact(
  lookup: { by: "clerkId"; value: string } | { by: "userId"; value: string },
  transaction?: InstanceType<typeof Transaction>,
): Promise<{
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
}> {
  let req: InstanceType<typeof MssqlRequest>;
  if (transaction) {
    req = new MssqlRequest(transaction);
  } else {
    const pool = await getAdminPool();
    req = new MssqlRequest(pool);
  }

  // CS-TS-002: admin pool only through getAdminPool() (via withAuditTransaction or direct).
  // Parameters bound safely — no string interpolation.

  let queryText: string;
  if (lookup.by === "clerkId") {
    // Returning-client path: join via User.clerkId
    req.input("lookupValue", mssqlPkg.NVarChar(64), lookup.value);
    // DECISION-E: Join User → Engagement → EngagementRequest to resolve first/last/email.
    // TOP 1 + ORDER BY e.createdAt ASC = use the earliest (original) accepted engagement.
    queryText = `
      SELECT TOP 1
        u.[id]         AS userId,
        er.[firstName],
        er.[lastName],
        er.[email]
      FROM [dbo].[User] u
      INNER JOIN [dbo].[Engagement] e   ON e.[clientUserId] = u.[id]
      INNER JOIN [dbo].[EngagementRequest] er ON er.[id] = e.[engagementRequestId]
      WHERE u.[clerkId] = @lookupValue
      ORDER BY e.[createdAt] ASC
    `;
  } else {
    // Accountant-initiated path: join via Engagement.clientUserId directly (no User row needed)
    req.input("lookupValue", mssqlPkg.NVarChar(50), lookup.value);
    // MAJOR-003: replaces the inline contact JOIN in createAccountantInitiatedEngagement.
    queryText = `
      SELECT TOP 1
        e.[clientUserId] AS userId,
        er.[firstName],
        er.[lastName],
        er.[email]
      FROM [dbo].[Engagement] e
      INNER JOIN [dbo].[EngagementRequest] er ON er.[id] = e.[engagementRequestId]
      WHERE e.[clientUserId] = @lookupValue
      ORDER BY e.[createdAt] ASC
    `;
  }

  const result = await req.query<{
    userId: string;
    firstName: string;
    lastName: string;
    email: string;
  }>(queryText);

  const row = result.recordset[0];
  if (!row) {
    // MAJOR-002: single error for empty join — both "clerkId not found" and "no prior engagement"
    // collapse to UserContactNotFoundError since both require the same caller response.
    // The second DB round-trip to distinguish them has been removed (it was dead complexity).
    throw new UserContactNotFoundError(lookup.value);
  }

  return {
    userId: row.userId,
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email,
  };
}

// ─── Write: createReturningClientRequest (admin pool) ────────────────────────

/**
 * Creates a pending EngagementRequest + EngagementRequestService join rows
 * + accountant notification for a returning (signed-in) client.
 *
 * AC-DOOR-009-03: The caller's on-file contact (firstName, lastName, email) is used —
 *   contact fields are NEVER accepted as inputs (proven by the interface shape, which
 *   has only clerkUserId + serviceIds). DECISION-E resolves the contact from the
 *   User's existing EngagementRequest.
 *
 * DECISION-A (BRIEF-012 / REQ-DOOR-009): reuses the createEngagementRequest pattern.
 *   Status = 'pending'; routed to accountant inbox via new_engagement_request Notification.
 *
 * DECISION (ADR-003 §1/§6): admin pool write — mirrors createEngagementRequest's
 *   rationale. The write runs in a single mssql Transaction (all-or-nothing atomicity).
 *
 * CS-GEN-001: audit rows record only ids + action — NO contact PII.
 * CS-TS-001:  admin-pool write (not through the request-scoped db wrapper).
 * CS-TS-002:  admin pool only through getAdminPool().
 * ADR-019:    DECISION (no explicit audit event on this path): the returning-client
 *   request mirrors the anonymous createEngagementRequest path (EPIC-003) which does NOT
 *   record a separate audit event (the Notification row is the inbox-routing artifact;
 *   the AuditEvent is recorded when the accountant accepts/declines — same pattern as EPIC-003).
 *   This is consistent with the established EPIC-003 pattern and is DECISION-tagged here.
 *
 * @throws UserNotFoundError if clerkUserId cannot be resolved to a User row.
 * @throws UserContactNotFoundError if the User has no prior EngagementRequest (DECISION-E).
 * @throws Error if serviceIds is empty.
 */
export async function createReturningClientRequest(
  input: CreateReturningClientRequestInput,
): Promise<CreateReturningClientRequestResult> {
  // CS-GEN-003 // ADR-003 // DECISION-A // DECISION-E // AC-DOOR-009-03
  if (input.serviceIds.length === 0) {
    throw new Error("At least one service must be selected");
  }

  const pool = await getAdminPool(); // CS-TS-002: only through getAdminPool()
  const transaction = new Transaction(pool);
  await transaction.begin();

  try {
    // DECISION-E: resolve caller's on-file contact — proves AC-DOOR-009-03
    // (no contact args accepted from the caller — interface has only clerkUserId + serviceIds).
    // MAJOR-003: resolveCallerContact now takes a lookup discriminator {by, value}.
    const contact = await resolveCallerContact(
      { by: "clerkId", value: input.clerkUserId },
      transaction,
    );

    // INSERT EngagementRequest — status='pending' (DECISION-A)
    const insertReq = new MssqlRequest(transaction);
    // CS-GEN-001: no PII in audit rows. PII is stored on EngagementRequest (TDE at rest — ADR-020).
    insertReq.input("firstName", mssqlPkg.NVarChar(100), contact.firstName);
    insertReq.input("lastName", mssqlPkg.NVarChar(100), contact.lastName);
    insertReq.input("email", mssqlPkg.NVarChar(254), contact.email.trim().toLowerCase());

    const insertResult = await insertReq.query<{ id: string; status: string }>(
      `INSERT INTO [dbo].[EngagementRequest]
         ([firstName], [lastName], [email], [status], [updatedAt])
       OUTPUT INSERTED.[id], INSERTED.[status]
       VALUES
         (@firstName, @lastName, @email, N'pending', SYSDATETIMEOFFSET())`,
    );

    const newRequest = insertResult.recordset[0];
    if (!newRequest) {
      throw new Error("EngagementRequest INSERT did not return a row");
    }
    const requestId = newRequest.id;

    // INSERT EngagementRequestService join rows (one per service)
    for (const serviceId of input.serviceIds) {
      const joinReq = new MssqlRequest(transaction);
      joinReq.input("engagementRequestId", mssqlPkg.NVarChar(50), requestId);
      joinReq.input("serviceId", mssqlPkg.NVarChar(50), serviceId);
      await joinReq.query(
        `INSERT INTO [dbo].[EngagementRequestService]
           ([engagementRequestId], [serviceId])
         VALUES (@engagementRequestId, @serviceId)`,
      );
    }

    // INSERT accountant Notification (inbox-routing — mirrors EPIC-003 createEngagementRequest pattern)
    // DECISION (TASK-003-003 pattern): co-located in the same transaction for atomicity.
    // CS-GEN-001: notification title uses firstName + lastName for UI clarity — this is acceptable
    //             (the notification lives on [dbo].[Notification], NOT in AuditEvent).
    const fullName = `${contact.firstName} ${contact.lastName}`.trim();
    const notifTitle = `New engagement request from ${fullName}`;
    const notifReq = new MssqlRequest(transaction);
    notifReq.input("type", mssqlPkg.NVarChar(50), NOTIFICATION_TYPE_NEW_REQUEST);
    notifReq.input("title", mssqlPkg.NVarChar(200), notifTitle);
    notifReq.input("engagementRequestId", mssqlPkg.NVarChar(50), requestId);

    const notifResult = await notifReq.query<{ id: string }>(
      `INSERT INTO [dbo].[Notification]
         ([type], [title], [body], [engagementRequestId])
       OUTPUT INSERTED.[id]
       VALUES (@type, @title, NULL, @engagementRequestId)`,
    );

    const newNotif = notifResult.recordset[0];
    if (!newNotif) {
      throw new Error("Notification INSERT did not return a row");
    }

    await transaction.commit();

    // ADR-019 DECISION: no separate AuditEvent on this path (mirrors EPIC-003 pattern —
    // the audit trail is established when the accountant accepts/declines).
    return { requestId, status: "pending", notificationId: newNotif.id };
  } catch (err) {
    await transaction.rollback().catch(() => {
      // Ignore rollback errors (connection may already be closed)
    });
    throw err;
  }
}

// ─── Write: createAccountantInitiatedEngagement (admin pool, withAuditTransaction) ──

/**
 * Creates, in a single audit transaction:
 *   1. An EngagementRequest pre-'accepted' (no accept/decline step — DECISION-A).
 *   2. An Engagement linked to that request, with clientUserId + taxYear set.
 *   3. An EngagementParticipant row for the primary client (AC-DOOR-010-04).
 *
 * AC-DOOR-010-04: The engagement is tied to the chosen client (clientUserId set);
 *   the primary client is immediately linked as a participant.
 *
 * DECISION-A (BRIEF-012 / REQ-DOOR-010):
 *   The EngagementRequest is created with status='accepted' — no pending→accept transition.
 *   This keeps engagementRequestId non-null and reuses the established data shape.
 *
 * AC-LIFE-010-01: clientUserId + taxYear set at creation; NOT a DB unique constraint (DECISION-C).
 * AC-LIFE-012-01: the primary client is linked as the first EngagementParticipant.
 *
 * Note: The accountant's contact info for the EngagementRequest (firstName/lastName/email)
 *   is resolved from the chosen client's User record → existing EngagementRequest (DECISION-E).
 *   If the client has no prior EngagementRequest, this seam throws UserContactNotFoundError.
 *   Production callers will have a clientUserId derived from an accepted invitation, so this
 *   case should be rare. The UI task (TASK-012-004) must handle it.
 *
 * ADR-003 §7: admin pool inside withAuditTransaction — accountant-initiated write.
 * ADR-019:    One audit event 'engagement.created_by_accountant' in the same transaction.
 * CS-GEN-001: audit row records engagementId + actor only — NO contact PII.
 * CS-TS-001:  admin-pool write (not through the request-scoped db wrapper).
 * CS-TS-002:  admin pool only through getAdminPool() (via withAuditTransaction).
 * CS-GEN-003: // ADR-003 // ADR-019 // CS-GEN-001 // DECISION-A // DECISION-C // AC-DOOR-010-04
 *
 * @returns { engagementId, requestId, engagementStatus }.
 * @throws UserContactNotFoundError if clientUserId cannot be resolved to on-file contact.
 */
export async function createAccountantInitiatedEngagement(
  input: CreateAccountantInitiatedEngagementInput,
): Promise<CreateAccountantInitiatedEngagementResult> {
  // CS-GEN-003 // ADR-003 // ADR-019 // DECISION-A // AC-DOOR-010-04
  if (input.serviceIds.length === 0) {
    throw new Error("At least one service must be selected");
  }

  return withAuditTransaction(async (txn) => {
    // ── Step 1: Resolve the client's on-file contact (DECISION-E) ────────────
    // We need firstName/lastName/email for the EngagementRequest row.
    // MAJOR-003 (PR #93 review): replaced inline contact JOIN with resolveCallerContact helper
    // (lookup by userId — Engagement.clientUserId). Deduplicates the JOIN that was previously
    // inlined here and in the returning-client path.
    // Throws UserContactNotFoundError if the client has no prior EngagementRequest (DECISION-E).
    const contact = await resolveCallerContact(
      { by: "userId", value: input.clientUserId },
      txn,
    );

    // ── Step 2: INSERT EngagementRequest (pre-'accepted') ────────────────────
    // DECISION-A: created directly as 'accepted' — no pending→accept step.
    const reqInsert = new MssqlRequest(txn);
    reqInsert.input("firstName", mssqlPkg.NVarChar(100), contact.firstName);
    reqInsert.input("lastName", mssqlPkg.NVarChar(100), contact.lastName);
    reqInsert.input("email", mssqlPkg.NVarChar(254), contact.email.trim().toLowerCase());

    const reqResult = await reqInsert.query<{ id: string }>(
      `INSERT INTO [dbo].[EngagementRequest]
         ([firstName], [lastName], [email], [status], [decidedAt], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES
         (@firstName, @lastName, @email, N'accepted', SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET())`,
    );

    const newReqRow = reqResult.recordset[0];
    if (!newReqRow) {
      throw new Error("EngagementRequest INSERT did not return a row");
    }
    const requestId = newReqRow.id;

    // ── Step 3: INSERT EngagementRequestService join rows ────────────────────
    for (const serviceId of input.serviceIds) {
      const joinReq = new MssqlRequest(txn);
      joinReq.input("engagementRequestId", mssqlPkg.NVarChar(50), requestId);
      joinReq.input("serviceId", mssqlPkg.NVarChar(50), serviceId);
      await joinReq.query(
        `INSERT INTO [dbo].[EngagementRequestService]
           ([engagementRequestId], [serviceId])
         VALUES (@engagementRequestId, @serviceId)`,
      );
    }

    // ── Step 4: INSERT Engagement (linked to request + client + taxYear) ─────
    // AC-LIFE-010-01: taxYear set at creation (DECISION-B).
    // AC-DOOR-010-04: clientUserId set immediately (not deferred DECISION-A from EPIC-005).
    const engInsert = new MssqlRequest(txn);
    engInsert.input("engagementRequestId", mssqlPkg.NVarChar(50), requestId);
    engInsert.input("clientUserId", mssqlPkg.NVarChar(50), input.clientUserId);
    engInsert.input("taxYear", mssqlPkg.Int, input.taxYear);

    const engResult = await engInsert.query<{ id: string; status: string }>(
      `INSERT INTO [dbo].[Engagement]
         ([engagementRequestId], [clientUserId], [taxYear], [updatedAt])
       OUTPUT INSERTED.[id], INSERTED.[status]
       VALUES (@engagementRequestId, @clientUserId, @taxYear, SYSDATETIMEOFFSET())`,
    );

    const newEngRow = engResult.recordset[0];
    if (!newEngRow) {
      throw new Error("Engagement INSERT did not return a row");
    }
    const engagementId = newEngRow.id;
    const engagementStatus = newEngRow.status;

    // ── Step 5: INSERT EngagementParticipant for the primary client ───────────
    // AC-LIFE-012-01 / AC-DOOR-010-04: primary client linked as participant immediately.
    // The @@unique([engagementId, userId]) ensures idempotency for the ON CONFLICT equivalent.
    const partInsert = new MssqlRequest(txn);
    partInsert.input("engagementId", mssqlPkg.NVarChar(50), engagementId);
    partInsert.input("userId", mssqlPkg.NVarChar(50), input.clientUserId);

    await partInsert.query(
      `INSERT INTO [dbo].[EngagementParticipant]
         ([engagementId], [userId], [role])
       VALUES (@engagementId, @userId, N'CLIENT')`,
    );

    // ── Step 6: Audit event (ADR-019) ─────────────────────────────────────────
    // CS-GEN-001: targetId = engagementId; NO contact PII (no firstName/lastName/email in audit).
    // ADR-019: same transaction as the INSERT operations.
    await recordAuthEvent({
      actor: input.actor,
      action: "engagement.created_by_accountant", // DECISION: new audit action for this path
      targetType: "Engagement",
      targetId: engagementId,
      sourceSurface: "admin",
      outcome: "success",
      transaction: txn,
    });

    return { engagementId, requestId, engagementStatus };
  });
}

// ─── Read: findDuplicateEngagements (admin pool — RLS-exempt) ────────────────

/**
 * Returns existing Engagements for the same client + tax year whose request-services
 * intersect the proposed serviceIds.
 *
 * DECISION-C (BRIEF-012 / REQ-LIFE-011):
 *   This is a QUERY — NOT a DB unique constraint. The caller decides whether to block or
 *   allow the duplicate (the override path — AC-LIFE-011-03 sanctioned override — must work).
 *   No unique index or constraint was introduced by this task (per Definition of Done).
 *
 * AC-LIFE-011-01: an overlap is detected for the same client + service + tax year.
 * AC-LIFE-011-02: the existing engagement is returned as the match.
 *
 * ADR-003 §7: admin pool — accountant-surface read; no request-pool SESSION_CONTEXT needed.
 * CS-TS-001:  admin-pool read (not through the request-scoped db wrapper).
 * CS-TS-002:  admin pool only through getAdminPool().
 * CS-GEN-003: // ADR-003 // DECISION-C // AC-LIFE-011-01 // AC-LIFE-011-02
 *
 * @param input.clientUserId — the User.id to check (server-resolved, never client-supplied).
 * @param input.serviceIds   — the proposed service IDs to intersect against.
 * @param input.taxYear      — the proposed tax year to match against.
 * @returns Array of DuplicateEngagementMatch (empty when no duplicates found).
 */
export async function findDuplicateEngagements(
  input: FindDuplicateEngagementsInput,
): Promise<DuplicateEngagementMatch[]> {
  // DECISION-C: query only — no DB constraint (override path must work).
  // CS-TS-002: admin pool via getAdminPool() only.
  if (input.serviceIds.length === 0) {
    return [];
  }

  const pool = await getAdminPool();
  const req = new MssqlRequest(pool);

  req.input("clientUserId", mssqlPkg.NVarChar(50), input.clientUserId);
  req.input("taxYear", mssqlPkg.Int, input.taxYear);

  // Build the IN list for serviceIds using individual parameters (SQL injection safe).
  // Each serviceId is bound as a separate named parameter (@svc_0, @svc_1, etc.).
  const svcParams = input.serviceIds.map((id, i) => {
    req.input(`svc_${i}`, mssqlPkg.NVarChar(50), id);
    return `@svc_${i}`;
  });
  const inList = svcParams.join(", ");

  // Join Engagement → EngagementRequest (for clientUserId match) → EngagementRequestService
  // (for service overlap). Return distinct Engagement rows whose services overlap.
  // DECISION-C: taxYear NULL on existing engagements does NOT match (NULL ≠ any integer).
  const result = await req.query<{
    engagementId: string;
    status: string;
    taxYear: number | null;
    overlappingServiceId: string;
  }>(`
    SELECT DISTINCT
      e.[id]          AS engagementId,
      e.[status]      AS status,
      e.[taxYear]     AS taxYear,
      ers.[serviceId] AS overlappingServiceId
    FROM [dbo].[Engagement] e
    INNER JOIN [dbo].[EngagementRequestService] ers
      ON ers.[engagementRequestId] = e.[engagementRequestId]
    WHERE e.[clientUserId] = @clientUserId
      AND e.[taxYear]      = @taxYear
      AND ers.[serviceId]  IN (${inList})
    ORDER BY e.[id]
  `);

  // Group by engagementId (one row per overlapping service → aggregate)
  const matchMap = new Map<
    string,
    { engagementId: string; status: string; taxYear: number | null; overlappingServiceIds: string[] }
  >();

  for (const row of result.recordset) {
    const existing = matchMap.get(row.engagementId);
    if (existing) {
      existing.overlappingServiceIds.push(row.overlappingServiceId);
    } else {
      matchMap.set(row.engagementId, {
        engagementId: row.engagementId,
        status: row.status,
        taxYear: row.taxYear,
        overlappingServiceIds: [row.overlappingServiceId],
      });
    }
  }

  return Array.from(matchMap.values());
}

// ─── Write: addEngagementParticipant (admin pool, withAuditTransaction) ──────

/**
 * Links a User as a participant on an Engagement (INSERT EngagementParticipant).
 *
 * Idempotent on the @@unique([engagementId, userId]) constraint:
 *   - If the participant already exists, returns { outcome: 'already_linked', participantId }.
 *   - If new, returns { outcome: 'linked', participantId }.
 *
 * AC-LIFE-012-01: an engagement can have more than one participant linked.
 * AC-AUTH-007-01: a single engagement may have multiple CLIENT participants.
 *
 * DECISION: idempotency is implemented by checking for an existing row before INSERT.
 *   SQL Server does not support INSERT ... ON CONFLICT DO NOTHING natively (unlike PostgreSQL).
 *   IF NOT EXISTS pattern is used instead.
 *
 * ADR-003 §7: admin pool inside withAuditTransaction — accountant-initiated write.
 * ADR-019:    Audit event 'engagement.participant_added' recorded in the same transaction.
 *             When already_linked, no audit event is recorded (no actual state change).
 * CS-GEN-001: audit row records engagementId + userId (ids) — NO contact PII.
 * CS-TS-001:  admin-pool write (not through the request-scoped db wrapper).
 * CS-TS-002:  admin pool only through getAdminPool() (via withAuditTransaction).
 * CS-GEN-003: // ADR-003 // ADR-019 // CS-GEN-001 // AC-LIFE-012-01 // AC-AUTH-007-01
 *
 * @returns AddEngagementParticipantResult.
 */
export async function addEngagementParticipant(
  input: AddEngagementParticipantInput,
): Promise<AddEngagementParticipantResult> {
  // CS-GEN-003 // ADR-003 // ADR-019 // CS-GEN-001 // AC-LIFE-012-01
  return withAuditTransaction(async (txn) => {
    // Check if already linked (idempotency check before INSERT)
    const checkReq = new MssqlRequest(txn);
    checkReq.input("engagementId", mssqlPkg.NVarChar(50), input.engagementId);
    checkReq.input("userId", mssqlPkg.NVarChar(50), input.userId);

    const existingResult = await checkReq.query<{ id: string }>(
      `SELECT TOP 1 [id] FROM [dbo].[EngagementParticipant]
       WHERE [engagementId] = @engagementId AND [userId] = @userId`,
    );

    const existing = existingResult.recordset[0];
    if (existing) {
      // Already linked — idempotent return (no new INSERT, no audit event for a no-op)
      return { outcome: "already_linked", participantId: existing.id };
    }

    // INSERT new participant link
    const insertReq = new MssqlRequest(txn);
    insertReq.input("engagementId", mssqlPkg.NVarChar(50), input.engagementId);
    insertReq.input("userId", mssqlPkg.NVarChar(50), input.userId);

    const insertResult = await insertReq.query<{ id: string }>(
      `INSERT INTO [dbo].[EngagementParticipant]
         ([engagementId], [userId], [role])
       OUTPUT INSERTED.[id]
       VALUES (@engagementId, @userId, N'CLIENT')`,
    );

    const newPart = insertResult.recordset[0];
    if (!newPart) {
      throw new Error("EngagementParticipant INSERT did not return a row");
    }
    const participantId = newPart.id;

    // ADR-019: audit event in the same transaction
    // CS-GEN-001: targetId = engagementId; metadata = userId (internal id, not contact PII)
    await recordAuthEvent({
      actor: input.actor,
      action: "engagement.participant_added", // DECISION: audit action for participant link
      targetType: "Engagement",
      targetId: input.engagementId, // CS-GEN-001: engagement id — no contact PII
      sourceSurface: "admin",
      outcome: "success",
      transaction: txn,
    });

    return { outcome: "linked", participantId };
  });
}
