/**
 * packages/db/src/onboarding-completion.ts — Onboarding completion engine
 *
 * Delivers the EPIC-008 completion evaluation + privileged fire-once transition seam.
 *
 * AC-ONBD-005-01: isOnboardingComplete returns true iff all three step `done` flags are true.
 * AC-ONBD-005-02: isOnboardingComplete returns false when any one step is not done.
 * AC-ONBD-006-01: processOnboardingCompletion transitions New → In Progress on completion.
 * AC-ONBD-006-02: The transition occurs without manual accountant action (system-initiated).
 * AC-ONBD-006-03: The transition occurs only once; already-In-Progress engagements → no-op.
 * AC-ONBD-007-01: On completion, an accountant-only in-portal notification is created.
 * AC-ONBD-007-02: The notification identifies the engagement and its client.
 * AC-MSG-013-04:  The accountant receives a notification when onboarding is completed.
 *
 * ADR-003: Completion writes run under the ADMIN POOL (privileged, server-authoritative).
 *          The client cannot directly write engagement status or insert notifications.
 *          ADR-003 Amendment 1 honored: no @read_only on sp_set_session_context.
 * ADR-005: The notification uses the existing sec.pol_Notification (0004-notification-policy.sql)
 *          accountant-only FILTER. No new policy added. Admin pool bypasses the BLOCK predicate
 *          on INSERT (IS_MEMBER('app_admin_role') = 1), same pattern as EPIC-003.
 * ADR-019: The transition is recorded via recordAuthEvent + withAuditTransaction (INSERT-only).
 *          No parallel audit path introduced.
 * ADR-012: isOnboardingComplete is a pure function (tier-2); processOnboardingCompletion
 *          is tested tier-3 against the real SQL Server container.
 *
 * DESIGN:
 *   - No marker column / no migration: completion is derived; the fire-once persistent record
 *     is `status='In Progress'` (D1 from IO Plan DECISIONS).
 *   - fire-once guard: UPDATE WHERE status='New' + @@ROWCOUNT check (D2).
 *   - allRequiredProvided: an admin-pool read of DocumentRequest + Document resolves the
 *     checklist vacuously satisfied when zero requests exist (mirrors resolveChecklist semantics
 *     but over the admin pool, since no CLIENT SESSION_CONTEXT is required at transition time).
 *
 * DECISION (actor source): The audit actor for the system-initiated transition uses a
 *   synthetic system actor `{ clerkUserId: 'system', role: 'ACCOUNTANT' }`. Rationale:
 *   (1) The transition is initiated by the system (completion evaluation), not a user action.
 *   (2) There is no logged-in user context available at the completion evaluation seam.
 *   (3) The action label 'engagement.transition' combined with sourceSurface='portal'
 *       identifies the originating surface; 'system' in clerkUserId is the closest consistent
 *       approach to the existing admin-pool system writes (createEngagementRequest, accept flow).
 *   (4) The accountant did NOT initiate this (AC-ONBD-006-02); recording it as ACCOUNTANT
 *       role with a 'system' clerkUserId correctly captures the rule that this is an automated
 *       transition, not an accountant-driven one. The role='ACCOUNTANT' reflects the privileged
 *       context (admin pool) rather than a specific user.
 *   Alternative considered: using the completing client's clerkUserId if available. Rejected:
 *   the completion seam is called server-side by the system AFTER step completion; the client's
 *   identity is not reliably available at this layer without threading it through, and the
 *   audit record is about the system action (the transition), not the client's step completion
 *   (which was recorded at step-completion time). This is consistent with how EPIC-003 handles
 *   system-initiated notifications (admin pool, no user SESSION_CONTEXT).
 */

import mssqlPkg from "mssql";
import { getAdminPool } from "./admin-connection.js";
import { resolveOnboarding } from "./onboarding.js";
import { recordAuthEvent, withAuditTransaction } from "./audit.js";
import type { OnboardingReadModel } from "./onboarding.js";

const { Request: MssqlRequest } = mssqlPkg;

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Notification type for onboarding completion (AC-ONBD-007-01, AC-MSG-013-04).
 * Mirrors NOTIFICATION_TYPE_NEW_REQUEST from engagement-request.ts.
 * Imported by TASK-008-003 for the admin notification feed.
 */
export const NOTIFICATION_TYPE_ONBOARDING_COMPLETE = "onboarding_completed" as const;

/**
 * Audit action for the automatic engagement status transition (ADR-019).
 * Imported by downstream callers if they need to filter audit rows by action.
 */
export const ENGAGEMENT_TRANSITION_ACTION = "engagement.transition" as const;

// ─── Types ────────────────────────────────────────────────────────────────────

/** Shape of the engagement + client row loaded under the admin pool for completion evaluation. */
interface EngagementWithClient {
  id: string;
  engagementRequestId: string;
  status: string;
  letterSignedAt: Date | null;
  questionnaireSubmittedAt: Date | null;
  /** From EngagementRequest 1:1 join */
  clientFirstName: string;
  clientLastName: string;
}

// ─── Pure predicate ───────────────────────────────────────────────────────────

/**
 * Pure predicate — true iff all three onboarding step `done` flags are true.
 *
 * Consumes the existing OnboardingReadModel (produced by resolveOnboarding) —
 * does NOT re-derive per-step satisfaction logic.
 *
 * AC-ONBD-005-01: true when all three steps are done (letter, questionnaire, document-upload).
 * AC-ONBD-005-02: false when any one of the three steps is not done.
 *
 * @param model — the read model produced by resolveOnboarding().
 */
export function isOnboardingComplete(model: OnboardingReadModel): boolean {
  return model.steps.every((step) => step.done === true);
}

// ─── Privileged completion seam ───────────────────────────────────────────────

/**
 * Privileged, server-authoritative, fire-once onboarding completion seam (ADR-003).
 *
 * Evaluates whether onboarding is complete for the given engagement and, if so,
 * atomically transitions it to 'In Progress', creates the accountant notification,
 * and records the audit event — all in ONE transaction.
 *
 * Fire-once: guarded by `UPDATE WHERE status='New'` + `@@ROWCOUNT` check so a
 * concurrent or duplicate call for an already-In-Progress engagement is a guaranteed
 * no-op (no duplicate notification, no second audit row).
 *
 * ADR-003: Runs under the admin pool (server-authoritative). The client cannot call
 *   this directly — it is invoked by the server action after the last onboarding step.
 * ADR-005: The accountant notification uses the existing sec.pol_Notification (0004)
 *   accountant-only FILTER. Admin pool bypasses the BLOCK predicate on INSERT.
 * ADR-019: Transition is recorded via recordAuthEvent + withAuditTransaction.
 * ADR-012: Tested at tier-3 against the real SQL Server container.
 *
 * @param engagementId — the server-resolved engagement id. NEVER from client-supplied input.
 * @returns { transitioned: true }  — onboarding was complete, engagement is now In Progress.
 * @returns { transitioned: false } — onboarding incomplete, already In Progress, or race lost.
 */
export async function processOnboardingCompletion(
  engagementId: string,
): Promise<{ transitioned: boolean }> {
  // STEP 1: Load the engagement + client name under the admin pool.
  // DECISION: Admin pool read here because:
  //   (a) No CLIENT SESSION_CONTEXT is available at the completion evaluation seam.
  //   (b) The admin pool sees all rows (RLS-exempt) — correct for a system-side check.
  //   (c) This mirrors EPIC-007 ADR-009 step-2d admin-pool write pattern.
  const pool = await getAdminPool();

  const engReq = new MssqlRequest(pool);
  engReq.input("engagementId", engagementId);

  const engResult = await engReq.query<{
    id: string;
    engagementRequestId: string;
    status: string;
    letterSignedAt: Date | null;
    questionnaireSubmittedAt: Date | null;
    clientFirstName: string;
    clientLastName: string;
  }>(
    `SELECT
       e.[id],
       e.[engagementRequestId],
       e.[status],
       e.[letterSignedAt],
       e.[questionnaireSubmittedAt],
       er.[firstName] AS clientFirstName,
       er.[lastName]  AS clientLastName
     FROM [dbo].[Engagement] e
     JOIN [dbo].[EngagementRequest] er ON er.[id] = e.[engagementRequestId]
     WHERE e.[id] = @engagementId`
  );

  const engRow = engResult.recordset[0];
  if (!engRow) {
    // Engagement not found — cannot transition (caller should guard, but be defensive)
    return { transitioned: false };
  }

  const engagement: EngagementWithClient = {
    id: engRow.id,
    engagementRequestId: engRow.engagementRequestId,
    status: engRow.status,
    letterSignedAt: engRow.letterSignedAt,
    questionnaireSubmittedAt: engRow.questionnaireSubmittedAt,
    clientFirstName: engRow.clientFirstName,
    clientLastName: engRow.clientLastName,
  };

  // STEP 2: Guard — if already transitioned, return false immediately (no writes).
  // This is an early short-circuit; the true fire-once guard is the UPDATE WHERE status='New'.
  if (engagement.status !== "New") {
    return { transitioned: false };
  }

  // STEP 3: Resolve the document checklist allRequiredProvided using admin pool reads.
  // Mirrors resolveChecklist semantics: vacuously satisfied when zero DocumentRequests exist.
  // Uses admin pool because there is no CLIENT SESSION_CONTEXT at this point.
  const checklistReq = new MssqlRequest(pool);
  checklistReq.input("engagementId", engagementId);

  const checklistResult = await checklistReq.query<{
    totalRequests: number;
    fulfilledRequests: number;
  }>(
    `SELECT
       COUNT(DISTINCT dr.[id]) AS totalRequests,
       COUNT(DISTINCT CASE WHEN d.[status] = N'active' THEN dr.[id] END) AS fulfilledRequests
     FROM [dbo].[DocumentRequest] dr
     LEFT JOIN [dbo].[Document] d
       ON d.[documentRequestId] = dr.[id]
     WHERE dr.[engagementId] = @engagementId`
  );

  const checklistRow = checklistResult.recordset[0];
  // AC-ONBD-004-04: zero requests → vacuously satisfied (allRequiredProvided = true)
  const totalRequests = checklistRow?.totalRequests ?? 0;
  const fulfilledRequests = checklistRow?.fulfilledRequests ?? 0;
  const allRequiredProvided =
    totalRequests === 0 || fulfilledRequests === totalRequests;

  // STEP 4: Build the onboarding read model and evaluate completion.
  // DECISION: Re-evaluate here — do NOT trust a caller-passed completeness flag.
  // This is the EPIC-007 M1 lesson: the server must be the authoritative evaluator.
  // We construct an EngagementItem-compatible shape from what we loaded.
  const engagementItem = {
    id: engagement.id,
    engagementRequestId: engagement.engagementRequestId,
    clientUserId: null, // not needed for completion evaluation
    status: engagement.status,
    letterSignedAt: engagement.letterSignedAt,
    letterSignatureEvidence: null,
    letterTemplateSnapshot: null,
    questionnaireSubmittedAt: engagement.questionnaireSubmittedAt,
    createdAt: new Date(), // not needed for completion evaluation
    updatedAt: new Date(), // not needed for completion evaluation
  };

  const readModel = resolveOnboarding(engagementItem, allRequiredProvided);
  const complete = isOnboardingComplete(readModel);

  // STEP 5: If not complete → no writes, return false.
  if (!complete) {
    return { transitioned: false };
  }

  // STEP 6: Complete AND status === 'New' → attempt the atomic transition.
  // All writes (UPDATE + INSERT Notification + AuditEvent) happen in ONE transaction.
  const result = await withAuditTransaction(async (txn) => {
    // 6a. UPDATE engagement status: fire-once guard via WHERE status='New'.
    // If a concurrent caller already transitioned it, @@ROWCOUNT = 0 → we lose the race.
    const updateReq = new MssqlRequest(txn);
    updateReq.input("id", engagementId);

    const updateResult = await updateReq.query<{ rowsAffected: number }>(
      `UPDATE [dbo].[Engagement]
       SET [status] = N'In Progress',
           [updatedAt] = SYSDATETIMEOFFSET()
       WHERE [id] = @id
         AND [status] = N'New';
       SELECT @@ROWCOUNT AS rowsAffected;`
    );

    const rowsAffected =
      (updateResult.recordset as Array<{ rowsAffected: number }>)[0]?.rowsAffected ?? 0;

    if (rowsAffected === 0) {
      // Concurrent caller won the race — this is the fire-once guard in action.
      // Return false WITHOUT inserting a notification or audit row.
      // withAuditTransaction will commit the no-op transaction.
      return { transitioned: false };
    }

    // 6b. INSERT accountant Notification (AC-ONBD-007-01/-02, AC-MSG-013-04).
    // Admin pool bypasses sec.pol_Notification BLOCK predicate (IS_MEMBER('app_admin_role')=1).
    // Mirror the EPIC-003 pattern in engagement-request.ts.
    const clientFullName = `${engagement.clientFirstName} ${engagement.clientLastName}`.trim();
    const notifTitle = `Onboarding complete for ${clientFullName}`;
    const notifBody = `${clientFullName} has completed all onboarding steps. Their engagement is now in progress.`;

    const notifReq = new MssqlRequest(txn);
    notifReq.input("type", NOTIFICATION_TYPE_ONBOARDING_COMPLETE);
    notifReq.input("title", notifTitle);
    notifReq.input("body", notifBody);
    notifReq.input("engagementRequestId", engagement.engagementRequestId);

    await notifReq.query(
      `INSERT INTO [dbo].[Notification]
         ([type], [title], [body], [engagementRequestId])
       VALUES (@type, @title, @body, @engagementRequestId)`
    );

    // 6c. Record audit event (ADR-019).
    // DECISION: Actor is the system actor (see file-level DECISION comment for rationale).
    await recordAuthEvent({
      actor: {
        // DECISION: system-initiated transition uses a synthetic 'system' clerkUserId.
        // See the file-level DECISION comment for the full rationale.
        clerkUserId: "system",
        role: "ACCOUNTANT",
      },
      action: ENGAGEMENT_TRANSITION_ACTION,
      targetType: "Engagement",
      targetId: engagementId,
      sourceSurface: "portal",
      outcome: "success",
      transaction: txn,
    });

    return { transitioned: true };
  });

  return result;
}
