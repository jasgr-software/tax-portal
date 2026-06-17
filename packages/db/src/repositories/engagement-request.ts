/**
 * packages/db/src/repositories/engagement-request.ts
 *
 * Data-access functions for EngagementRequest.
 *
 * AC-DOOR-004-03: Request persisted in pending/awaiting-review state.
 * AC-DOOR-004-04: No account/User row created at submission.
 * AC-DOOR-005-01: Submitting a request generates an in-portal accountant notification.
 * AC-MSG-013-01:  Notification type = 'new_engagement_request' (accountant notified on submit).
 *
 * DECISION: createEngagementRequest uses the admin pool (app_admin_role, RLS-exempt) because
 * this is the ONE sanctioned identity-less write in the system — an anonymous prospect
 * submitting a request without a Clerk identity. Citing:
 *   - ADR-003 §1/§6: "anonymous paths ... must use the admin pool, never the request pool"
 *   - ADR-005 § Tables-in-scope: "public/anon submits run under admin principal"
 *
 * The operation is INSERT-ONLY — no read-back of other rows, returns only {id, status}.
 * PII (name, email, phone) is stored under TDE at-rest posture (ADR-020).
 * No User/account row is created at submission (AC-DOOR-004-04).
 *
 * // DECISION (TASK-003-003): Notification creation is folded INTO createEngagementRequest
 * // within the same mssql Transaction rather than being a separate call in the portal
 * // action. This guarantees atomicity: a request can never be committed without its
 * // accountant notification (AC-DOOR-005-01). The alternative — a separate call from
 * // the portal action — would allow a request to persist without a notification if the
 * // second call fails. Co-location in the transaction (one commit) is the correct pattern.
 * // The admin pool bypasses sec.pol_Notification's BLOCK predicate for the INSERT
 * // (IS_MEMBER('app_admin_role') = 1) — consistent with TASK-003-001's DECISION.
 *
 * Implementation note: uses raw mssql via getAdminPool() as a pragmatic workaround for the
 * Prisma 5.22.0 sqlserver connector's port-parsing limitation in dev/test environments
 * (TASK-002 documented limitation). Uses OUTPUT INSERTED to get the generated ID back
 * (ADR-002 § Known Prisma + SQL Server rough edges — NEWSEQUENTIALID() PKs via OUTPUT clause).
 */

import mssqlPkg from "mssql";
import { getAdminPool } from "../admin-connection.js";

const { Transaction, Request: MssqlRequest } = mssqlPkg;

/** Notification type constant for new engagement request submissions (AC-MSG-013-01) */
export const NOTIFICATION_TYPE_NEW_REQUEST = "new_engagement_request" as const;

export interface CreateEngagementRequestInput {
  /** Prospect first name — PII, stored under TDE at-rest posture (ADR-020) */
  firstName: string;
  /** Prospect last name — PII, stored under TDE at-rest posture (ADR-020) */
  lastName: string;
  /**
   * Prospect email — PII, normalized (.trim().toLowerCase()) per ADR-002.
   * Normalization is enforced at the data layer within this function.
   */
  email: string;
  /** Prospect phone (optional) — PII, stored under TDE at-rest posture (ADR-020) */
  phone?: string | undefined;
  /** Optional message from the prospect */
  message?: string | undefined;
  /** One or more service IDs the prospect is interested in (at least one required) */
  serviceIds: string[];
}

export interface CreateEngagementRequestResult {
  /** The newly created engagement request ID (UNIQUEIDENTIFIER as string) */
  id: string;
  /** Always 'pending' at creation — AC-DOOR-004-03 */
  status: string;
  /** The newly created accountant notification ID — AC-DOOR-005-01, AC-MSG-013-01 */
  notificationId: string;
}

/**
 * Creates a new EngagementRequest, its EngagementRequestService join rows, and
 * the corresponding accountant Notification — all in a single atomic transaction.
 *
 * DECISION: Uses admin pool (app_admin_role, RLS-exempt) — the one sanctioned
 * identity-less write. Citing ADR-003 §1/§6 + ADR-005 §Tables-in-scope.
 *
 * // DECISION (TASK-003-003): Notification INSERT is co-located in this transaction
 * // so a request can never be committed without its accountant notification (AC-DOOR-005-01).
 * // The alternative (a separate call from the portal action) would allow a request to
 * // persist without a notification if the second call fails. One transaction = one commit.
 * // The admin pool bypasses sec.pol_Notification's BLOCK predicate for the INSERT
 * // (IS_MEMBER('app_admin_role') = 1) — consistent with the DECISION in notification.ts.
 *
 * Insert-only: no read-back of other rows; returns {id, status, notificationId}.
 * No User/account row created (AC-DOOR-004-04).
 * Email normalized to .trim().toLowerCase() before insert (ADR-002 § CITEXT equivalent).
 *
 * Transaction: EngagementRequest + EngagementRequestService + Notification rows inserted
 * atomically (ADR-004 § Transaction discipline). All three or none.
 */
export async function createEngagementRequest(
  input: CreateEngagementRequestInput,
): Promise<CreateEngagementRequestResult> {
  if (input.serviceIds.length === 0) {
    throw new Error("At least one service must be selected");
  }

  // Normalize email at the data layer (ADR-002 § CITEXT equivalent)
  const normalizedEmail = input.email.trim().toLowerCase();

  const pool = await getAdminPool();
  const transaction = new Transaction(pool);
  await transaction.begin();

  try {
    // INSERT EngagementRequest, get the generated ID back via OUTPUT INSERTED
    // (ADR-002 § Known rough edges: NEWSEQUENTIALID() PKs, ID returned via OUTPUT clause)
    const insertReq = new MssqlRequest(transaction);
    insertReq.input("firstName", input.firstName);
    insertReq.input("lastName", input.lastName);
    insertReq.input("email", normalizedEmail);
    insertReq.input("phone", input.phone ?? null);
    insertReq.input("message", input.message ?? null);

    const insertResult = await insertReq.query<{ id: string; status: string }>(
      `INSERT INTO [dbo].[EngagementRequest]
         ([firstName], [lastName], [email], [phone], [message], [status], [updatedAt])
       OUTPUT INSERTED.[id], INSERTED.[status]
       VALUES
         (@firstName, @lastName, @email, @phone, @message, N'pending', SYSDATETIMEOFFSET())`
    );

    const newRequest = insertResult.recordset[0];
    if (!newRequest) {
      throw new Error("INSERT did not return a row — unexpected SQL Server behavior");
    }

    const newId = newRequest.id;
    const newStatus = newRequest.status;

    // INSERT EngagementRequestService join rows (one per selected service) within the transaction
    for (const serviceId of input.serviceIds) {
      const joinReq = new MssqlRequest(transaction);
      joinReq.input("engagementRequestId", newId);
      joinReq.input("serviceId", serviceId);
      await joinReq.query(
        `INSERT INTO [dbo].[EngagementRequestService] ([engagementRequestId], [serviceId])
         VALUES (@engagementRequestId, @serviceId)`
      );
    }

    // INSERT accountant Notification for the new request — AC-DOOR-005-01, AC-MSG-013-01.
    // DECISION (TASK-003-003): Co-located in the same transaction for atomicity.
    // The notification title uses the prospect's firstName + lastName for UI clarity.
    // engagementRequestId FK is set so the admin surface can link to the specific request
    // (AC-DOOR-005-02). The type = NOTIFICATION_TYPE_NEW_REQUEST = 'new_engagement_request'.
    const fullName = `${input.firstName} ${input.lastName}`.trim();
    const notifTitle = `New engagement request from ${fullName}`;
    const notifReq = new MssqlRequest(transaction);
    notifReq.input("type", NOTIFICATION_TYPE_NEW_REQUEST);
    notifReq.input("title", notifTitle);
    notifReq.input("engagementRequestId", newId);

    const notifResult = await notifReq.query<{ id: string }>(
      `INSERT INTO [dbo].[Notification]
         ([type], [title], [body], [engagementRequestId])
       OUTPUT INSERTED.[id]
       VALUES (@type, @title, NULL, @engagementRequestId)`
    );

    const newNotification = notifResult.recordset[0];
    if (!newNotification) {
      throw new Error("Notification INSERT did not return a row — unexpected SQL Server behavior");
    }

    const notificationId = newNotification.id;

    await transaction.commit();

    // Return {id, status, notificationId} — no read-back of other rows (ADR-003 §7)
    return { id: newId, status: newStatus, notificationId };
  } catch (err) {
    await transaction.rollback().catch(() => {
      // Ignore rollback errors (connection may already be closed)
    });
    throw err;
  }
}
