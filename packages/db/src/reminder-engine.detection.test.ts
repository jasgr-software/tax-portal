/**
 * packages/db/src/reminder-engine.detection.test.ts
 *
 * HARD TIER-3 INTEGRATION TESTS — requires real SQL Server (ADR-012 § Tier 3)
 *
 * BRIEF-019 / EPIC-019 / TASK-019-003: Detection + reminder engine — overdue detection.
 *
 * These tests prove overdue detection via the TIME-INJECTABLE ENGINE (ADR-023 seam).
 * Detection is invoked by the engine pass — NOT by any accountant-initiated / manual call.
 * Asserting overdue only after a manual call is a REJECTION per the brief's extra_gates.
 *
 * Gherkin acceptance scenarios satisfied (BRIEF-019 § Acceptance scenarios):
 *   AC-FILE-012-01: Given a document request whose due date has passed and that is unfulfilled,
 *                   When the system evaluates document requests,
 *                   Then that request is identified as overdue.
 *   AC-FILE-012-03: Given a document request becomes overdue,
 *                   When no one has initiated an overdue check,
 *                   Then the system still identifies it as overdue on its own.
 *   AC-FILE-012-04: Given two document requests, one past its due date and one not,
 *                   When overdue is evaluated,
 *                   Then only the one past its due date is treated as overdue.
 *   AC-MSG-018-01:  Given unfulfilled document requests with elapsed due dates,
 *                   When the reminder engine runs without the accountant initiating it,
 *                   Then it identifies the overdue requests automatically.
 *
 * HARD tier-3 gates covered:
 *   #1 — injected clock past an unfulfilled request's due date → engine identifies it overdue
 *         with NO manual call (AC-FILE-012-01/-03, AC-MSG-018-01; ADR-023).
 *   #2 — two unfulfilled requests, one past-due one not → ONLY the past-due is overdue;
 *         a FULFILLED request past its due date is NOT overdue (AC-FILE-012-04, both directions).
 *
 * Architecture notes:
 *   - All DB setup/teardown via admin pool (bypasses RLS — ADR-003 §1).
 *   - runReminderEngine({ now }) is called with an injected clock — ADR-023 seam.
 *   - Detection is AUTOMATIC: the test calls only runReminderEngine, no manual overdue mark.
 *   - Notifications are verified via admin-pool query on the Notification table.
 *   - Test data is uniquified by timestamp suffix to avoid cross-run interference.
 *   - Cleanup in FK dependency order in afterAll.
 *
 * // ADR-023 // ADR-018 // ADR-005 // ADR-003 // ADR-012
 * // AC-FILE-012-01 // AC-FILE-012-03 // AC-FILE-012-04
 * // AC-MSG-018-01
 * // CS-GEN-001 // CS-GEN-003
 * // DECISION-019-C // DECISION-019-D // DECISION-019-E // DECISION-019-H
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import mssqlPkg from "mssql";
import { parseSqlServerUrl } from "./sql-server-url.js";
import { runReminderEngine } from "./repositories/reminder-engine.js";

const { ConnectionPool } = mssqlPkg;

// ─── Environment ──────────────────────────────────────────────────────────────

const ADMIN_URL = process.env["DATABASE_URL_ADMIN"];

// ─── Shared admin pool ────────────────────────────────────────────────────────

let adminPool: InstanceType<typeof ConnectionPool>;

// ─── Test data IDs ────────────────────────────────────────────────────────────

/** Suffix to make all test rows unique across parallel/sequential test runs. */
const SUFFIX = `det_${Date.now()}`;

// EngagementRequest IDs
let erPastDueId: string;          // parent request for the past-due engagement
let erFutureId: string;           // parent request for the not-yet-due engagement
let erFulfilledId: string;        // parent request for the fulfilled (active doc) engagement

// Engagement IDs (one per DocumentRequest for FK dependency)
let engPastDueId: string;
let engFutureId: string;
let engFulfilledId: string;

// DocumentRequest IDs
let drPastDueId: string;          // past due, unfulfilled → OVERDUE
let drFutureId: string;           // future due, unfulfilled → NOT overdue
let drFulfilledId: string;        // past due, but FULFILLED → NOT overdue

// Document ID (for the fulfilled case)
let docFulfilledId: string;

// Notification IDs created by the engine (tracked for cleanup)
const notificationIdsToClean: string[] = [];

// ─── Fixed clock for all detection tests ──────────────────────────────────────

/**
 * ADR-023: injected clock used for all detection tests.
 * We pick a fixed point in the past so due dates can be set relative to it.
 */
const TEST_NOW = new Date("2026-06-20T12:00:00.000Z"); // fixed injected clock

// Due dates relative to TEST_NOW:
const PAST_DUE_DATE = "2026-06-01";   // 19 days before TEST_NOW → overdue
const FUTURE_DUE_DATE = "2026-12-31"; // far future → not overdue

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  if (!ADMIN_URL) {
    throw new Error("DATABASE_URL_ADMIN is required for reminder-engine detection integration tests");
  }

  const adminConfig = parseSqlServerUrl(ADMIN_URL) as import("mssql").config;
  adminPool = new ConnectionPool(adminConfig);
  await adminPool.connect();

  // ─── Create three engagement request → engagement → document-request chains ──

  // 1. Past-due unfulfilled request
  const erPastDueRes = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[EngagementRequest]
       ([firstName], [lastName], [email], [status], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'Test', N'EngDet', N'det-past-${SUFFIX}@example.com', N'accepted', SYSDATETIMEOFFSET())`
  );
  erPastDueId = erPastDueRes.recordset[0]!.id;

  const engPastDueRes = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[Engagement]
       ([engagementRequestId], [status], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES ('${erPastDueId}', N'In Progress', SYSDATETIMEOFFSET())`
  );
  engPastDueId = engPastDueRes.recordset[0]!.id;

  const drPastDueRes = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[DocumentRequest]
       ([engagementId], [label], [dueDate], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES ('${engPastDueId}', N'Upload tax docs (det-past-${SUFFIX})', '${PAST_DUE_DATE}', SYSDATETIMEOFFSET())`
  );
  drPastDueId = drPastDueRes.recordset[0]!.id;

  // 2. Future-due unfulfilled request (NOT overdue)
  const erFutureRes = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[EngagementRequest]
       ([firstName], [lastName], [email], [status], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'Test', N'EngDet', N'det-future-${SUFFIX}@example.com', N'accepted', SYSDATETIMEOFFSET())`
  );
  erFutureId = erFutureRes.recordset[0]!.id;

  const engFutureRes = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[Engagement]
       ([engagementRequestId], [status], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES ('${erFutureId}', N'In Progress', SYSDATETIMEOFFSET())`
  );
  engFutureId = engFutureRes.recordset[0]!.id;

  const drFutureRes = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[DocumentRequest]
       ([engagementId], [label], [dueDate], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES ('${engFutureId}', N'Upload tax docs (det-future-${SUFFIX})', '${FUTURE_DUE_DATE}', SYSDATETIMEOFFSET())`
  );
  drFutureId = drFutureRes.recordset[0]!.id;

  // 3. Past-due FULFILLED request (NOT overdue because document uploaded)
  const erFulfilledRes = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[EngagementRequest]
       ([firstName], [lastName], [email], [status], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'Test', N'EngDet', N'det-fulfilled-${SUFFIX}@example.com', N'accepted', SYSDATETIMEOFFSET())`
  );
  erFulfilledId = erFulfilledRes.recordset[0]!.id;

  const engFulfilledRes = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[Engagement]
       ([engagementRequestId], [status], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES ('${erFulfilledId}', N'In Progress', SYSDATETIMEOFFSET())`
  );
  engFulfilledId = engFulfilledRes.recordset[0]!.id;

  const drFulfilledRes = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[DocumentRequest]
       ([engagementId], [label], [dueDate], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES ('${engFulfilledId}', N'Upload tax docs (det-fulfilled-${SUFFIX})', '${PAST_DUE_DATE}', SYSDATETIMEOFFSET())`
  );
  drFulfilledId = drFulfilledRes.recordset[0]!.id;

  // Insert a non-soft-deleted active Document that fulfills the request.
  // DECISION-019-D: fulfilled = ≥1 active (deletedAt IS NULL, status='active') Document
  //   with documentRequestId = drFulfilledId. // DECISION-019-D
  const docFulfilledRes = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[Document]
       ([engagementId], [documentRequestId], [storageKey], [originalFilename],
        [contentType], [sizeBytes], [status], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES
       ('${engFulfilledId}', '${drFulfilledId}',
        N'engagements/${engFulfilledId}/documents/fulfilled-det-${SUFFIX}.pdf',
        N'fulfilled-det.pdf', N'application/pdf', 1024, N'active', SYSDATETIMEOFFSET())`
  );
  docFulfilledId = docFulfilledRes.recordset[0]!.id;
}, 30000);

// ─── Teardown ─────────────────────────────────────────────────────────────────

afterAll(async () => {
  // Clean notifications emitted by the engine for our test requests.
  for (const id of notificationIdsToClean) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[Notification] WHERE [id] = '${id}'`
    ).catch(() => { /* ignore */ });
  }
  // Also sweep by linkedItemId for any we missed (robustness).
  for (const requestId of [drPastDueId, drFutureId, drFulfilledId].filter(Boolean)) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[Notification] WHERE [linkedItemId] = '${requestId}'`
    ).catch(() => { /* ignore */ });
  }

  // Clean in FK dependency order: Document → DocumentRequest → Engagement → EngagementRequest
  for (const id of [docFulfilledId].filter(Boolean)) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[Document] WHERE [id] = '${id}'`
    ).catch(() => { /* ignore */ });
  }
  for (const id of [drPastDueId, drFutureId, drFulfilledId].filter(Boolean)) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[DocumentRequest] WHERE [id] = '${id}'`
    ).catch(() => { /* ignore */ });
  }
  for (const id of [engPastDueId, engFutureId, engFulfilledId].filter(Boolean)) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[Engagement] WHERE [id] = '${id}'`
    ).catch(() => { /* ignore */ });
  }
  for (const id of [erPastDueId, erFutureId, erFulfilledId].filter(Boolean)) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[EngagementRequest] WHERE [id] = '${id}'`
    ).catch(() => { /* ignore */ });
  }

  await adminPool.close();
}, 30000);

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Reminder engine — overdue detection (HARD tier-3 #1 and #2, AC-FILE-012-01/-03/-04, AC-MSG-018-01)", () => {

  /**
   * HARD tier-3 #1 — Auto-detection behind the time-injectable seam, NO manual trigger.
   *
   * Given a document request whose due date has passed and that is unfulfilled,
   * When the engine runs (injected clock past the due date — ADR-023 seam),
   * Then the engine identifies it as overdue WITHOUT any accountant-initiated/manual call.
   *
   * This test calls ONLY runReminderEngine({ now }) — no separate "mark overdue" function.
   * The engine pass is the detection trigger (AC-FILE-012-03 / AC-MSG-018-01).
   *
   * AC-FILE-012-01: system identifies document requests that are overdue. // AC-FILE-012-01
   * AC-FILE-012-03: detection without the accountant initiating the check. // AC-FILE-012-03
   * AC-MSG-018-01: system auto-identifies overdue requests (engine pass = trigger). // AC-MSG-018-01
   * ADR-023: now is the injected clock — not wall-clock. // ADR-023
   * ADR-018: overdue derived from existing dueDate — no new stored clock. // ADR-018
   * DECISION-019-C: explicit dueDate ('2026-06-01') < now ('2026-06-20') → overdue. // DECISION-019-C
   * DECISION-019-D: no active Document → unfulfilled. // DECISION-019-D
   * DECISION-019-H: engine pass is the trigger; no manual call. // DECISION-019-H
   *
   * HARD — asserting overdue only after a manual call is a REJECTION.
   */
  it("[AC-FILE-012-01] [AC-FILE-012-03] [AC-MSG-018-01] injected clock past due date → engine identifies overdue with NO manual trigger [HARD tier-3 #1]", async () => {
    // ADR-023: inject a specific clock value (not wall-clock) that is past drPastDueId's dueDate.
    // drPastDue.dueDate = '2026-06-01'; TEST_NOW = '2026-06-20' → 19 days overdue. // ADR-023
    const result = await runReminderEngine({ now: TEST_NOW });

    // AC-FILE-012-01: the engine must have found the overdue request. // AC-FILE-012-01
    // We assert >= 1 because other test data from the DB may also be overdue.
    expect(result.overdueRequestsFound).toBeGreaterThanOrEqual(1);
    // AC-MSG-018-01: at least one reminder was raised (the engine raised it, not a manual call). // AC-MSG-018-01
    expect(result.remindersRaised).toBeGreaterThanOrEqual(1);

    // Verify: a request_overdue notification was emitted for our specific drPastDueId.
    // AC-MSG-013-05: accountant notified when a request becomes overdue. // AC-MSG-013-05
    const notifResult = await adminPool.request().query<{ id: string; type: string; recipientType: string }>(
      `SELECT [id], [type], [recipientType]
       FROM [dbo].[Notification]
       WHERE [linkedItemId] = '${drPastDueId}'
         AND [type] = N'request_overdue'`
    );

    // The engine must have emitted the notification (not a manual send). // AC-FILE-012-03
    expect(notifResult.recordset.length).toBeGreaterThanOrEqual(1);
    // Must be an ACCOUNTANT notification (not CLIENT). // ADR-005
    for (const row of notifResult.recordset) {
      expect(row.recipientType).toBe("ACCOUNTANT");
      notificationIdsToClean.push(row.id);
    }

    // Also verify that lastReminderSentAt was set on the request (watermark written). // DECISION-019-E
    const drResult = await adminPool.request().query<{ lastReminderSentAt: Date | null }>(
      `SELECT [lastReminderSentAt] FROM [dbo].[DocumentRequest] WHERE [id] = '${drPastDueId}'`
    );
    expect(drResult.recordset[0]?.lastReminderSentAt).not.toBeNull();
  });

  /**
   * HARD tier-3 #2 — Overdue is determined by the due date (BOTH directions).
   *
   * AC-FILE-012-04: Given two document requests, one past its due date and one not,
   *                 When overdue is evaluated,
   *                 Then only the one past its due date is treated as overdue.
   *
   * Direction 1 (positive): drPastDueId (dueDate = '2026-06-01') < now ('2026-06-20') → OVERDUE.
   * Direction 2 (negative): drFutureId (dueDate = '2026-12-31') > now → NOT overdue.
   * Direction 3 (fulfilled): drFulfilledId has an active Document → NOT overdue (fulfilled).
   *
   * AC-FILE-012-04: only requests past their due date are treated as overdue. // AC-FILE-012-04
   * DECISION-019-C: effective due date = explicit dueDate for this test. // DECISION-019-C
   * DECISION-019-D: unfulfilled = no active Document (drFulfilledId has one). // DECISION-019-D
   */
  it("[AC-FILE-012-04] two unfulfilled requests: past-due one IS overdue, future-due one is NOT; fulfilled past-due request is NOT overdue [HARD tier-3 #2, both directions]", async () => {
    // ADR-023: use the same injected clock as test #1. // ADR-023
    // Note: test #1 already ran and set lastReminderSentAt on drPastDueId.
    // For this test, we verify the presence/absence of notifications by linkedItemId.

    // ─── Direction 1: past-due unfulfilled request IS identified as overdue ────

    // We already ran the engine in test #1; drPastDueId has a notification.
    const pastDueNotif = await adminPool.request().query<{ id: string }>(
      `SELECT [id] FROM [dbo].[Notification]
       WHERE [linkedItemId] = '${drPastDueId}'
         AND [type] = N'request_overdue'`
    );
    // AC-FILE-012-04 direction 1: past-due request MUST be overdue. // AC-FILE-012-04
    expect(pastDueNotif.recordset.length).toBeGreaterThanOrEqual(1);

    // ─── Direction 2: future-due unfulfilled request is NOT overdue ───────────

    const futureNotif = await adminPool.request().query<{ id: string }>(
      `SELECT [id] FROM [dbo].[Notification]
       WHERE [linkedItemId] = '${drFutureId}'
         AND [type] = N'request_overdue'`
    );
    // AC-FILE-012-04 direction 2: future-due request must NOT be identified as overdue. // AC-FILE-012-04
    expect(futureNotif.recordset.length).toBe(0);

    // ─── Direction 3: fulfilled past-due request is NOT overdue ───────────────

    const fulfilledNotif = await adminPool.request().query<{ id: string }>(
      `SELECT [id] FROM [dbo].[Notification]
       WHERE [linkedItemId] = '${drFulfilledId}'
         AND [type] = N'request_overdue'`
    );
    // DECISION-019-D: fulfilled request (has active Document) is NOT overdue. // DECISION-019-D
    // AC-FILE-012-04: fulfilled request must NOT be treated as overdue. // AC-FILE-012-04
    expect(fulfilledNotif.recordset.length).toBe(0);

    // Verify: drFutureId's lastReminderSentAt must still be NULL (no reminder raised).
    const drFutureRow = await adminPool.request().query<{ lastReminderSentAt: Date | null }>(
      `SELECT [lastReminderSentAt] FROM [dbo].[DocumentRequest] WHERE [id] = '${drFutureId}'`
    );
    // DECISION-019-E: watermark is only set when a reminder is raised. // DECISION-019-E
    expect(drFutureRow.recordset[0]?.lastReminderSentAt).toBeNull();

    // Verify: drFulfilledId's lastReminderSentAt must also be NULL (no reminder raised).
    const drFulfilledRow = await adminPool.request().query<{ lastReminderSentAt: Date | null }>(
      `SELECT [lastReminderSentAt] FROM [dbo].[DocumentRequest] WHERE [id] = '${drFulfilledId}'`
    );
    expect(drFulfilledRow.recordset[0]?.lastReminderSentAt).toBeNull();
  });

});
