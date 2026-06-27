/**
 * packages/db/src/repositories/reminder-engine.ts
 *
 * Detection + reminder engine for BRIEF-019 / EPIC-019 (TASK-019-003).
 *
 * runReminderEngine({ now }) — admin-pool batch (mirrors dispatchDailyDigest):
 *   1. Load the global default cadence from ReminderSetting (DECISION-019-B).
 *   2. Query all overdue unfulfilled DocumentRequests:
 *        overdue = unfulfilled AND effective due date < now (DECISION-019-C/-D, ADR-018)
 *   3. For each overdue request, resolve cadence via resolveReminderCadence
 *        (per-engagement override ?? global default — DECISION-019-G).
 *      Raise a reminder iff lastReminderSentAt IS NULL OR elapsed >= resolvedIntervalDays
 *        (DECISION-019-E).
 *      On raise: emitNotification ACCOUNTANT request_overdue (AC-MSG-013-05) +
 *        set DocumentRequest.lastReminderSentAt = now.
 *   4. Query all engagements approaching their due date (within approachingDueWindowDays,
 *        not past, lastApproachingDueNotifiedAt null or stale — DECISION-019-F).
 *   5. For each approaching engagement: emitNotification ACCOUNTANT
 *        engagement_due_date_approaching (AC-MSG-013-06) + set
 *        Engagement.lastApproachingDueNotifiedAt = now.
 *   6. Return EngineRunResult — counts only, no PII (CS-GEN-001).
 *
 * Architecture:
 *   - Admin pool throughout (app_admin_role; RLS-exempt; IS_MEMBER='app_admin_role'
 *     bypasses BLOCK predicate — ADR-003 §7, ADR-005). // ADR-003 // ADR-005
 *   - No SESSION_CONTEXT needed for admin-pool ops. // ADR-003 §7
 *   - emitNotification is admin-pool INSERT (reuse, no new policy — DECISION-019-J). // ADR-005
 *   - Per-item try/continue: failure for one request/engagement does not corrupt others
 *     (mirrors DECISION-018-003-A in email-digest). // CS-GEN-002
 *
 * Governed by:
 *   ADR-023: time-injectable seam — now defaults to new Date() in prod only. // ADR-023
 *   ADR-018: overdue is DERIVED from the existing dueDate lifecycle attr (no new clock). // ADR-018
 *   ADR-005: accountant notifications reuse sec.pol_Notification (recipientType='ACCOUNTANT'). // ADR-005
 *   ADR-003: admin-pool batch — no SESSION_CONTEXT needed. // ADR-003
 *   CS-TS-001: no request-pool paths in this module. // CS-TS-001
 *   CS-TS-002: admin pool via getAdminPool() inside packages/db only. // CS-TS-002
 *   CS-SQL-001: accountant notifications reuse sec.pol_Notification — no new policy. // CS-SQL-001
 *   CS-GEN-001: no client identity / request detail / engagement detail in logs or result. // CS-GEN-001
 *   CS-GEN-002: additive — new module; no existing export removed or narrowed. // CS-GEN-002
 *   CS-GEN-003: governing keys cited throughout. // CS-GEN-003
 *   DECISION-019-C: effective due date = explicit dueDate ?? createdAt + defaultRequestDueDays. // DECISION-019-C
 *   DECISION-019-D: unfulfilled = no non-soft-deleted active Document with documentRequestId. // DECISION-019-D
 *   DECISION-019-E: cadence cap on lastReminderSentAt watermark. // DECISION-019-E
 *   DECISION-019-F: approaching-due watermark on lastApproachingDueNotifiedAt. // DECISION-019-F
 *   DECISION-019-G: resolvedDays = overrideDays ?? globalDefaultDays (PURE via resolveReminderCadence). // DECISION-019-G
 *   DECISION-019-H: runReminderEngine({ now }) admin-pool batch; mirrors dispatchDailyDigest. // DECISION-019-H
 *   DECISION-019-J: no new email path; notifications ride EPIC-018 digest. // DECISION-019-J
 *
 * AC-FILE-012-01: system identifies document requests that are overdue. // AC-FILE-012-01
 * AC-FILE-012-03: detection without the accountant initiating the check. // AC-FILE-012-03
 * AC-FILE-012-04: overdue based on due date (only past-due are overdue). // AC-FILE-012-04
 * AC-MSG-018-01: system automatically identifies overdue requests. // AC-MSG-018-01
 * AC-MSG-018-02: overdue request results in a reminder being raised. // AC-MSG-018-02
 * AC-MSG-013-05: accountant notified when a request becomes overdue. // AC-MSG-013-05
 * AC-MSG-013-06: accountant notified when an engagement is approaching its due date. // AC-MSG-013-06
 */

import { getAdminPool } from "../admin-connection.js";
import mssqlPkg from "mssql";
import {
  getGlobalDefaultCadence,
  resolveReminderCadence,
} from "./reminder-cadence.js";
import { emitNotification } from "./notification.js";

// CS-TS-002: admin pool via getAdminPool() inside packages/db only. // CS-TS-002
const { Request: MssqlRequest } = mssqlPkg;

// ─── Result type ──────────────────────────────────────────────────────────────

/**
 * Counts-only result from runReminderEngine.
 *
 * CS-GEN-001: carries no client identity, request detail, or engagement detail — counts only. // CS-GEN-001
 * AC-FILE-012-01 / AC-MSG-018-01: overdueRequestsFound reflects the detection result. // AC-FILE-012-01 // AC-MSG-018-01
 * AC-MSG-018-02 / AC-MSG-013-05: remindersRaised reflects reminder dispatch. // AC-MSG-018-02 // AC-MSG-013-05
 * AC-MSG-013-06: approachingDueNotificationsSent reflects approaching-due notifications. // AC-MSG-013-06
 */
export interface EngineRunResult {
  /** Number of overdue unfulfilled DocumentRequests found in this run. */
  overdueRequestsFound: number;
  /** Number of reminder notifications emitted in this run (cadence cap honored). */
  remindersRaised: number;
  /** Number of engagements found approaching their due date in this run. */
  approachingDueEngagementsFound: number;
  /** Number of approaching-due-date notifications emitted in this run. */
  approachingDueNotificationsSent: number;
}

// ─── Internal row shapes ──────────────────────────────────────────────────────

interface OverdueRequestRow {
  requestId: string;
  engagementId: string;
  dueDate: Date | null;
  lastReminderSentAt: Date | null;
  createdAt: Date;
  reminderFrequencyDaysOverride: number | null;
}

interface ApproachingEngagementRow {
  engagementId: string;
  dueDate: Date;
  lastApproachingDueNotifiedAt: Date | null;
}

// ─── runReminderEngine ────────────────────────────────────────────────────────

/**
 * Server-side detection + reminder engine.
 *
 * Called with an injected `now` for deterministic testing (ADR-023).
 * In production, `now` defaults to `new Date()` (wall-clock) and is driven
 * by a scheduler (Phase 5). Do NOT wire a real cron here (ADR-023). // ADR-023
 *
 * CS-TS-002: admin pool via getAdminPool() inside packages/db only. // CS-TS-002
 * CS-GEN-001: no client identity / PII in any log line. // CS-GEN-001
 * ADR-003 §7: admin pool write — no SESSION_CONTEXT needed. // ADR-003
 * ADR-023: now is the injected clock seam. // ADR-023
 *
 * @param opts.now Override the engine clock (optional; defaults to `new Date()`).
 */
export async function runReminderEngine(
  opts?: { now?: Date },
): Promise<EngineRunResult> {
  // ADR-023: time-injectable seam — now defaults to wall-clock only in prod. // ADR-023
  const now = opts?.now ?? new Date();

  // CS-TS-002: admin pool via getAdminPool() inside packages/db only. // CS-TS-002
  const pool = await getAdminPool();

  // Load global default cadence settings (DECISION-019-B). // DECISION-019-B
  // Includes: reminderFrequencyDays, approachingDueWindowDays, defaultRequestDueDays.
  const globalDefault = await getGlobalDefaultCadence();

  // ─── Phase 1: Overdue detection (DECISION-019-C/-D, ADR-018) ─────────────────

  // Query all overdue unfulfilled DocumentRequests.
  //
  // Unfulfilled (DECISION-019-D): no non-soft-deleted active Document with
  //   documentRequestId = request.id (deletedAt IS NULL AND status = 'active').
  //   Documents that are 'pending' or 'infected' do NOT count as fulfilled. // DECISION-019-D
  //
  // Effective due date (DECISION-019-C):
  //   - explicit DocumentRequest.dueDate if set (DATE column)
  //   - else if ReminderSetting.defaultRequestDueDays present:
  //       CAST(dr.createdAt AS DATE) + defaultRequestDueDays days
  //   - else none → never overdue (row excluded) // DECISION-019-C
  //
  // ADR-018: derived from existing lifecycle attributes — no new stored clock. // ADR-018
  // CS-GEN-001: query returns only opaque IDs and timestamps — no PII selected. // CS-GEN-001
  // CS-TS-002: admin pool — RLS-exempt; IS_MEMBER='app_admin_role' bypasses BLOCK. // CS-TS-002
  const overdueReq = new MssqlRequest(pool);
  overdueReq.input("now", mssqlPkg.DateTimeOffset, now);
  // Pass defaultRequestDueDays as INT (NULL when not set — SQL IS NOT NULL check handles it).
  // DECISION-019-C: null defaultRequestDueDays → the fallback branch is excluded. // DECISION-019-C
  overdueReq.input(
    "defaultRequestDueDays",
    mssqlPkg.Int,
    globalDefault.defaultRequestDueDays ?? null,
  );

  const overdueResult = await overdueReq.query<OverdueRequestRow>(
    `SELECT
         dr.[id]                                AS requestId,
         dr.[engagementId],
         dr.[dueDate],
         dr.[lastReminderSentAt],
         dr.[createdAt],
         e.[reminderFrequencyDaysOverride]
     FROM [dbo].[DocumentRequest] dr
     INNER JOIN [dbo].[Engagement] e ON e.[id] = dr.[engagementId]
     WHERE
         -- DECISION-019-D: unfulfilled = no non-soft-deleted active Document references this request // DECISION-019-D
         NOT EXISTS (
             SELECT 1 FROM [dbo].[Document] d
             WHERE d.[documentRequestId] = dr.[id]
               AND d.[deletedAt] IS NULL
               AND d.[status] = N'active'
         )
         -- DECISION-019-C: effective due date < now (either explicit or computed) // DECISION-019-C
         AND (
             -- Case 1: explicit dueDate is set and has passed
             (dr.[dueDate] IS NOT NULL AND dr.[dueDate] < CAST(@now AS DATE))
             OR
             -- Case 2: no explicit dueDate + defaultRequestDueDays set → computed fallback
             (    dr.[dueDate] IS NULL
                  AND @defaultRequestDueDays IS NOT NULL
                  AND DATEADD(day, @defaultRequestDueDays, CAST(dr.[createdAt] AS DATE))
                          < CAST(@now AS DATE)
             )
         )`,
  );

  const overdueRequests = overdueResult.recordset;
  const overdueRequestsFound = overdueRequests.length;
  let remindersRaised = 0;

  // ─── Phase 2: Reminder raise for each overdue request (DECISION-019-E/-G) ─────

  for (const request of overdueRequests) {
    try {
      // Resolve cadence: per-engagement override ?? global default (DECISION-019-G). // DECISION-019-G
      // AC-MSG-018-04: per-engagement frequency takes precedence. // AC-MSG-018-04
      const resolvedIntervalDays = resolveReminderCadence({
        overrideDays: request.reminderFrequencyDaysOverride,
        globalDefaultDays: globalDefault.reminderFrequencyDays,
      });

      // Cadence cap: raise iff lastReminderSentAt IS NULL OR elapsed >= resolvedIntervalDays.
      // DECISION-019-E: cap enforced on the lastReminderSentAt watermark, not by tick coincidence. // DECISION-019-E
      // ADR-023: now is the injected clock. // ADR-023
      if (!shouldRaiseReminder(now, request.lastReminderSentAt, resolvedIntervalDays)) {
        continue;
      }

      // Raise: emit ACCOUNTANT request_overdue notification into the EPIC-016 feed.
      // AC-MSG-013-05: accountant notified when a request becomes overdue. // AC-MSG-013-05
      // AC-MSG-018-02: overdue request results in a reminder being raised. // AC-MSG-018-02
      // ADR-005: reuses sec.pol_Notification (recipientType='ACCOUNTANT', recipientUserId=null). // ADR-005
      // DECISION-019-J: no new email path — rides EPIC-018 digest. // DECISION-019-J
      // CS-GEN-001: title carries no PII (no request label / client identity). // CS-GEN-001
      // linkedItemType/linkedItemId: set for feed navigation (DECISION-019-H). // DECISION-019-H
      await emitNotification({
        recipientType: "ACCOUNTANT",
        recipientUserId: null,
        type: "request_overdue",
        title: "A document request is overdue",
        body: null,
        linkedItemType: "request",
        linkedItemId: request.requestId,
      });

      // Watermark: set DocumentRequest.lastReminderSentAt = now (DECISION-019-E). // DECISION-019-E
      // CS-TS-002: admin pool update inside packages/db. // CS-TS-002
      // ADR-003 §7: admin pool write — no SESSION_CONTEXT needed. // ADR-003
      const watermarkReq = new MssqlRequest(pool);
      watermarkReq.input("now", mssqlPkg.DateTimeOffset, now);
      watermarkReq.input("requestId", mssqlPkg.UniqueIdentifier, request.requestId);
      await watermarkReq.query(
        `UPDATE [dbo].[DocumentRequest]
         SET    [lastReminderSentAt] = @now,
                [updatedAt]         = SYSDATETIMEOFFSET()
         WHERE  [id] = @requestId`,
      );

      remindersRaised += 1;
    } catch (err) {
      // Per-item try/continue: one failed raise does not corrupt the watermark for others.
      // CS-GEN-001: log category-only — no request identity / PII in log args. // CS-GEN-001
      console.error(
        "[reminder-engine] reminder raise failed for one request (detail suppressed per CS-GEN-001)",
        (err as Error | null)?.constructor?.name ?? "unknown",
      );
      // Intentionally skip the watermark update on failure so the next run retries.
    }
  }

  // ─── Phase 3: Approaching-due-date detection (DECISION-019-F) ─────────────────

  // Query all engagements approaching their due date.
  //
  // Approaching (DECISION-019-F):
  //   - Engagement.dueDate IS NOT NULL
  //   - dueDate >= CAST(now AS DATE) (not past)
  //   - DATEDIFF(day, today, dueDate) <= approachingDueWindowDays (within the window)
  //   - lastApproachingDueNotifiedAt IS NULL OR stale (calendar-day UTC comparison — mirrors EPIC-018).
  //
  // ADR-018: dueDate consumed from EPIC-011 (no new lifecycle attribute). // ADR-018
  // CS-GEN-001: query returns only opaque IDs and timestamps. // CS-GEN-001
  // CS-TS-002: admin pool — RLS-exempt. // CS-TS-002
  const approachReq = new MssqlRequest(pool);
  approachReq.input("now", mssqlPkg.DateTimeOffset, now);
  approachReq.input(
    "approachingDueWindowDays",
    mssqlPkg.Int,
    globalDefault.approachingDueWindowDays,
  );

  const approachResult = await approachReq.query<ApproachingEngagementRow>(
    `SELECT
         e.[id]                             AS engagementId,
         e.[dueDate],
         e.[lastApproachingDueNotifiedAt]
     FROM [dbo].[Engagement] e
     WHERE
         e.[dueDate] IS NOT NULL
         -- Not past (due date is today or in the future)
         AND e.[dueDate] >= CAST(@now AS DATE)
         -- Within the approaching-due window
         AND DATEDIFF(day, CAST(@now AS DATE), e.[dueDate]) <= @approachingDueWindowDays
         -- Null or stale watermark: has not been notified today (UTC calendar day)
         AND (
             e.[lastApproachingDueNotifiedAt] IS NULL
             OR CAST(e.[lastApproachingDueNotifiedAt] AS DATE) < CAST(@now AS DATE)
         )`,
  );

  const approachingEngagements = approachResult.recordset;
  const approachingDueEngagementsFound = approachingEngagements.length;
  let approachingDueNotificationsSent = 0;

  // ─── Phase 4: Approaching-due notification for each qualifying engagement ──────

  for (const engagement of approachingEngagements) {
    try {
      // Emit ACCOUNTANT engagement_due_date_approaching notification (AC-MSG-013-06). // AC-MSG-013-06
      // ADR-005: reuses sec.pol_Notification (recipientType='ACCOUNTANT'). // ADR-005
      // DECISION-019-J: no new email path — rides EPIC-018 digest. // DECISION-019-J
      // CS-GEN-001: title carries no PII (no engagement detail / client name). // CS-GEN-001
      // linkedItemType/linkedItemId: set for feed navigation. // DECISION-019-H
      await emitNotification({
        recipientType: "ACCOUNTANT",
        recipientUserId: null,
        type: "engagement_due_date_approaching",
        title: "An engagement is approaching its due date",
        body: null,
        linkedItemType: "engagement",
        linkedItemId: engagement.engagementId,
      });

      // Watermark: set Engagement.lastApproachingDueNotifiedAt = now (DECISION-019-F). // DECISION-019-F
      // CS-TS-002: admin pool update inside packages/db. // CS-TS-002
      const watermarkReq = new MssqlRequest(pool);
      watermarkReq.input("now", mssqlPkg.DateTimeOffset, now);
      watermarkReq.input("engagementId", mssqlPkg.UniqueIdentifier, engagement.engagementId);
      await watermarkReq.query(
        `UPDATE [dbo].[Engagement]
         SET    [lastApproachingDueNotifiedAt] = @now,
                [updatedAt]                   = SYSDATETIMEOFFSET()
         WHERE  [id] = @engagementId`,
      );

      approachingDueNotificationsSent += 1;
    } catch (err) {
      // Per-item try/continue: one failed notification does not corrupt others.
      // CS-GEN-001: log category-only — no engagement identity / PII in log args. // CS-GEN-001
      console.error(
        "[reminder-engine] approaching-due notification failed for one engagement (detail suppressed per CS-GEN-001)",
        (err as Error | null)?.constructor?.name ?? "unknown",
      );
    }
  }

  // CS-GEN-001: return only counts — no client identity / request / engagement detail. // CS-GEN-001
  return {
    overdueRequestsFound,
    remindersRaised,
    approachingDueEngagementsFound,
    approachingDueNotificationsSent,
  };
}

// ─── Internal: cadence-cap helper ────────────────────────────────────────────

/**
 * Returns true iff a reminder should be raised for an overdue request now.
 *
 * Raise iff:
 *   - lastReminderSentAt IS NULL (never raised), OR
 *   - the elapsed time since last raise >= resolvedIntervalDays
 *
 * DECISION-019-E: cap enforced on the lastReminderSentAt watermark. // DECISION-019-E
 * ADR-023: `now` is the injected clock (never wall-clock in tests). // ADR-023
 * AC-MSG-018-03: reminders are raised at the resolved frequency — NOT more often. // AC-MSG-018-03
 *
 * @param now         The injected clock (ADR-023 seam).
 * @param lastSentAt  The last-reminder watermark (null = never raised).
 * @param intervalDays The resolved cadence interval in days (override ?? global default).
 */
function shouldRaiseReminder(
  now: Date,
  lastSentAt: Date | null,
  intervalDays: number,
): boolean {
  // Null = no prior reminder → always raise on the first pass for an overdue request.
  if (!lastSentAt) return true;

  // Elapsed time in milliseconds → days. Use continuous comparison so the exact tick
  // of "interval elapsed" is not required — any clock advance >= interval raises. // ADR-023
  const elapsedMs = now.getTime() - lastSentAt.getTime();
  const elapsedDays = elapsedMs / (1000 * 60 * 60 * 24);
  return elapsedDays >= intervalDays;
}
