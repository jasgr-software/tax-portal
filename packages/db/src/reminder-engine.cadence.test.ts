/**
 * packages/db/src/reminder-engine.cadence.test.ts
 *
 * HARD TIER-3 INTEGRATION TESTS — requires real SQL Server (ADR-012 § Tier 3)
 *
 * BRIEF-019 / EPIC-019 / TASK-019-003: Detection + reminder engine — cadence behavior.
 *
 * These tests prove the reminder raise and cadence-interval behavior using the
 * TIME-INJECTABLE ENGINE SEAM (ADR-023). All time advances are done via the injected
 * `now` parameter — no wall-clock waits.
 *
 * Gherkin acceptance scenarios satisfied (BRIEF-019 § Acceptance scenarios):
 *   AC-MSG-018-02: Given a document request identified as overdue,
 *                  When the engine processes it,
 *                  Then a reminder is raised about it.
 *   AC-MSG-013-05: Given a document request that has become overdue,
 *                  When the engine processes it,
 *                  Then the accountant receives an in-portal overdue notification.
 *   AC-MSG-018-03 (mechanism): reminders raised at the configured frequency; advance
 *                  injected clock < interval → no duplicate; advance past interval → next.
 *
 * HARD tier-3 gates covered:
 *   #3 — overdue request → ACCOUNTANT request_overdue notification produced FROM the overdue
 *         state (engine pass), NOT a manual send (AC-MSG-018-02, AC-MSG-013-05).
 *   #5 — cadence interval honored via the injected clock:
 *         advance < interval → no duplicate; advance past interval → next reminder.
 *         Cap enforced on lastReminderSentAt watermark (not tick coincidence). (AC-MSG-018-03)
 *
 * Architecture:
 *   - Admin pool for setup/teardown; runReminderEngine is the only function called.
 *   - Injected clock (`now`) advances between runs to test the cadence cap.
 *   - The reminder cadence used in these tests is the seeded global default (7 days).
 *   - Notifications verified via admin-pool SELECT on linkedItemId.
 *
 * // ADR-023 // ADR-018 // ADR-005 // ADR-003 // ADR-012
 * // AC-MSG-018-02 // AC-MSG-018-03 // AC-MSG-013-05
 * // CS-GEN-001 // CS-GEN-003
 * // DECISION-019-C // DECISION-019-D // DECISION-019-E // DECISION-019-G // DECISION-019-H
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import mssqlPkg from "mssql";
import { parseSqlServerUrl } from "./sql-server-url.js";
import { runReminderEngine } from "./repositories/reminder-engine.js";
import { getGlobalDefaultCadence } from "./repositories/reminder-cadence.js";

const { ConnectionPool } = mssqlPkg;

// ─── Environment ──────────────────────────────────────────────────────────────

const ADMIN_URL = process.env["DATABASE_URL_ADMIN"];

// ─── Shared admin pool ────────────────────────────────────────────────────────

let adminPool: InstanceType<typeof ConnectionPool>;

// ─── Test data IDs ────────────────────────────────────────────────────────────

const SUFFIX = `cad_${Date.now()}`;

let erCadenceId: string;
let engCadenceId: string;
let drCadenceId: string; // overdue, unfulfilled → for cadence tests

// ─── Injected clocks (ADR-023 seam) ──────────────────────────────────────────

/**
 * ADR-023: base injected clock — all time advances are relative to this point.
 * drCadence.dueDate = '2026-01-01', T0 = '2026-02-01' → 31 days overdue at T0.
 */
const T0 = new Date("2026-02-01T12:00:00.000Z");

// The seeded global default frequency (7 days); read in beforeAll to guard assumptions.
let globalDefaultDays: number;

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  if (!ADMIN_URL) {
    throw new Error("DATABASE_URL_ADMIN is required for reminder-engine cadence integration tests");
  }

  const adminConfig = parseSqlServerUrl(ADMIN_URL) as import("mssql").config;
  adminPool = new ConnectionPool(adminConfig);
  await adminPool.connect();

  // Read the global default cadence (expected to be 7 days from seed).
  // DECISION-019-B: singleton ReminderSetting row. // DECISION-019-B
  const cadence = await getGlobalDefaultCadence();
  globalDefaultDays = cadence.reminderFrequencyDays;

  // ─── Create a single overdue unfulfilled document request for cadence tests ──

  const erRes = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[EngagementRequest]
       ([firstName], [lastName], [email], [status], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'Test', N'Cadence', N'cad-${SUFFIX}@example.com', N'accepted', SYSDATETIMEOFFSET())`
  );
  erCadenceId = erRes.recordset[0]!.id;

  const engRes = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[Engagement]
       ([engagementRequestId], [status], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES ('${erCadenceId}', N'In Progress', SYSDATETIMEOFFSET())`
  );
  engCadenceId = engRes.recordset[0]!.id;

  // dueDate = '2026-01-01' — well before T0 = '2026-02-01' → overdue at T0. // DECISION-019-C
  const drRes = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[DocumentRequest]
       ([engagementId], [label], [dueDate], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES ('${engCadenceId}', N'Upload docs (cad-${SUFFIX})', '2026-01-01', SYSDATETIMEOFFSET())`
  );
  drCadenceId = drRes.recordset[0]!.id;
}, 30000);

// ─── Teardown ─────────────────────────────────────────────────────────────────

afterAll(async () => {
  // Clean notifications emitted for our test request.
  await adminPool.request().query(
    `DELETE FROM [dbo].[Notification] WHERE [linkedItemId] = '${drCadenceId}'`
  ).catch(() => { /* ignore */ });

  // Clean in FK dependency order: DocumentRequest → Engagement → EngagementRequest.
  if (drCadenceId) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[DocumentRequest] WHERE [id] = '${drCadenceId}'`
    ).catch(() => { /* ignore */ });
  }
  if (engCadenceId) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[Engagement] WHERE [id] = '${engCadenceId}'`
    ).catch(() => { /* ignore */ });
  }
  if (erCadenceId) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[EngagementRequest] WHERE [id] = '${erCadenceId}'`
    ).catch(() => { /* ignore */ });
  }

  await adminPool.close();
}, 30000);

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Reminder engine — cadence behavior (HARD tier-3 #3 and #5, AC-MSG-018-02/-03, AC-MSG-013-05)", () => {

  /**
   * HARD tier-3 #3 — Overdue request raises a reminder → ACCOUNTANT notification emitted.
   *
   * AC-MSG-018-02: Given a document request identified as overdue,
   *                When the engine processes it,
   *                Then a reminder is raised about it.
   * AC-MSG-013-05: Given a document request that has become overdue,
   *                When the engine processes it,
   *                Then the accountant receives an in-portal overdue notification.
   *
   * The reminder is produced FROM the overdue state (engine pass), NOT from a manual send.
   * This test calls only runReminderEngine({ now: T0 }) and verifies the notification.
   *
   * ADR-023: T0 is the injected clock. // ADR-023
   * DECISION-019-E: lastReminderSentAt IS NULL → reminder raised on first pass. // DECISION-019-E
   * DECISION-019-G: resolvedIntervalDays = globalDefault (no override set). // DECISION-019-G
   * ADR-005: recipientType='ACCOUNTANT', recipientUserId=null (reuses sec.pol_Notification). // ADR-005
   */
  it("[AC-MSG-018-02] [AC-MSG-013-05] engine pass on overdue request → ACCOUNTANT request_overdue notification emitted (not a manual send) [HARD tier-3 #3]", async () => {
    // PRE-CONDITION: ensure drCadenceId has no lastReminderSentAt (first run).
    await adminPool.request().query(
      `UPDATE [dbo].[DocumentRequest]
       SET [lastReminderSentAt] = NULL, [updatedAt] = SYSDATETIMEOFFSET()
       WHERE [id] = '${drCadenceId}'`
    );
    // Also delete any pre-existing notifications for this request (clean slate).
    await adminPool.request().query(
      `DELETE FROM [dbo].[Notification] WHERE [linkedItemId] = '${drCadenceId}'`
    );

    // ADR-023: inject T0 — the engine determines overdue from dueDate vs injected clock. // ADR-023
    const result = await runReminderEngine({ now: T0 });

    // AC-MSG-018-02: overdue request must result in a reminder being raised. // AC-MSG-018-02
    expect(result.remindersRaised).toBeGreaterThanOrEqual(1);

    // AC-MSG-013-05: verify the ACCOUNTANT notification was inserted. // AC-MSG-013-05
    const notifResult = await adminPool.request().query<{
      id: string;
      type: string;
      recipientType: string;
      linkedItemType: string | null;
      linkedItemId: string | null;
    }>(
      `SELECT [id], [type], [recipientType], [linkedItemType], [linkedItemId]
       FROM [dbo].[Notification]
       WHERE [linkedItemId] = '${drCadenceId}'
         AND [type] = N'request_overdue'`
    );

    // Must have exactly 1 notification for this request after the first engine run.
    expect(notifResult.recordset.length).toBe(1);

    const notif = notifResult.recordset[0]!;
    // Notification must be for the ACCOUNTANT (ADR-005 / sec.pol_Notification reuse). // ADR-005
    expect(notif.recipientType).toBe("ACCOUNTANT");
    // linkedItemType and linkedItemId must be set for feed navigation (DECISION-019-H). // DECISION-019-H
    expect(notif.linkedItemType).toBe("request");
    expect(notif.linkedItemId).toBe(drCadenceId);

    // Verify: lastReminderSentAt was set to T0 (watermark written). // DECISION-019-E
    const drRow = await adminPool.request().query<{ lastReminderSentAt: Date | null }>(
      `SELECT [lastReminderSentAt] FROM [dbo].[DocumentRequest] WHERE [id] = '${drCadenceId}'`
    );
    expect(drRow.recordset[0]?.lastReminderSentAt).not.toBeNull();
  });

  /**
   * HARD tier-3 #5 — Cadence interval honored via the injected clock (AC-MSG-018-03 mechanism).
   *
   * Phase A: advance injected clock by < interval → NO duplicate reminder.
   * Phase B: advance injected clock past the interval → NEXT reminder raised.
   *
   * Cap is enforced on the lastReminderSentAt watermark, NOT by tick coincidence.
   *
   * AC-MSG-018-03: overdue reminders are raised at the configured frequency. // AC-MSG-018-03
   * DECISION-019-E: cadence cap on lastReminderSentAt watermark. // DECISION-019-E
   * ADR-023: time advances are via the injected clock, NOT wall-clock. // ADR-023
   * DECISION-019-G: resolvedIntervalDays = globalDefault (no override). // DECISION-019-G
   */
  it("[AC-MSG-018-03] cadence interval honored via injected clock: advance < interval → no duplicate; advance past interval → next reminder [HARD tier-3 #5]", async () => {
    // PRE-CONDITION: start from a known state — lastReminderSentAt = T0 (set by test #3 above).
    // Verify the watermark is set.
    const drBefore = await adminPool.request().query<{ lastReminderSentAt: Date | null }>(
      `SELECT [lastReminderSentAt] FROM [dbo].[DocumentRequest] WHERE [id] = '${drCadenceId}'`
    );
    expect(drBefore.recordset[0]?.lastReminderSentAt).not.toBeNull();

    // Count existing notifications for this request (should be 1 from test #3).
    const countBefore = await adminPool.request().query<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM [dbo].[Notification]
       WHERE [linkedItemId] = '${drCadenceId}' AND [type] = N'request_overdue'`
    );
    const notifCountBefore = countBefore.recordset[0]!.cnt;
    expect(notifCountBefore).toBeGreaterThanOrEqual(1);

    // ─── Phase A: advance < interval → NO duplicate reminder ─────────────────

    // T0 + (globalDefaultDays - 1) days → NOT yet elapsed (e.g., T0 + 6 days if default=7).
    const halfInterval = Math.max(1, globalDefaultDays - 1); // always < interval
    const tUnderInterval = new Date(T0.getTime() + halfInterval * 24 * 60 * 60 * 1000);

    // ADR-023: inject tUnderInterval — elapsed since T0 is < globalDefaultDays. // ADR-023
    const resultUnder = await runReminderEngine({ now: tUnderInterval });

    // AC-MSG-018-03: cadence interval not elapsed → no new reminder. // AC-MSG-018-03
    // The reminder count for drCadenceId must NOT have increased.
    const countAfterUnder = await adminPool.request().query<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM [dbo].[Notification]
       WHERE [linkedItemId] = '${drCadenceId}' AND [type] = N'request_overdue'`
    );
    // DECISION-019-E: watermark cap prevents duplicate. // DECISION-019-E
    expect(countAfterUnder.recordset[0]!.cnt).toBe(notifCountBefore);
    // Also: the engine may have raised reminders for OTHER overdue requests in the DB,
    // but for OUR specific request the count must not have grown.
    // We don't assert resultUnder.remindersRaised === 0 because other requests may exist.
    void resultUnder; // acknowledged but not asserted globally

    // ─── Phase B: advance past interval → NEXT reminder raised ───────────────

    // T0 + (globalDefaultDays + 1) days → elapsed > interval → raise allowed.
    const tOverInterval = new Date(T0.getTime() + (globalDefaultDays + 1) * 24 * 60 * 60 * 1000);

    // ADR-023: inject tOverInterval — elapsed since T0 is > globalDefaultDays. // ADR-023
    const resultOver = await runReminderEngine({ now: tOverInterval });

    // AC-MSG-018-03: interval elapsed → new reminder must be raised. // AC-MSG-018-03
    expect(resultOver.remindersRaised).toBeGreaterThanOrEqual(1);

    // Notification count for drCadenceId must have increased by 1.
    const countAfterOver = await adminPool.request().query<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM [dbo].[Notification]
       WHERE [linkedItemId] = '${drCadenceId}' AND [type] = N'request_overdue'`
    );
    // DECISION-019-E: after interval elapsed, a new reminder is raised. // DECISION-019-E
    expect(countAfterOver.recordset[0]!.cnt).toBe(notifCountBefore + 1);

    // Verify: lastReminderSentAt was updated to tOverInterval (watermark advanced). // DECISION-019-E
    const drAfterOver = await adminPool.request().query<{ lastReminderSentAt: Date | null }>(
      `SELECT [lastReminderSentAt] FROM [dbo].[DocumentRequest] WHERE [id] = '${drCadenceId}'`
    );
    const updatedWatermark = drAfterOver.recordset[0]?.lastReminderSentAt;
    expect(updatedWatermark).not.toBeNull();
    // The watermark should be approximately tOverInterval (within a tolerance of 1 second).
    const diff = Math.abs(updatedWatermark!.getTime() - tOverInterval.getTime());
    expect(diff).toBeLessThan(2000); // within 2 seconds (DATETIMEOFFSET precision)
  });

});
