/**
 * packages/db/src/reminder-engine.approaching.test.ts
 *
 * HARD TIER-3 INTEGRATION TEST — requires real SQL Server (ADR-012 § Tier 3)
 *
 * BRIEF-019 / EPIC-019 / TASK-019-003: Detection + reminder engine — approaching-due notification.
 *
 * This test proves the approaching-due-date accountant notification via the
 * TIME-INJECTABLE ENGINE SEAM (ADR-023). No manual trigger — only runReminderEngine({ now }).
 *
 * Gherkin acceptance scenario satisfied (BRIEF-019 § Acceptance scenarios):
 *   AC-MSG-013-06: Given an engagement approaching its due date,
 *                  When the engine evaluates upcoming deadlines,
 *                  Then the accountant receives an in-portal due-date-approaching notification.
 *
 * HARD tier-3 gate covered:
 *   #8 — engagement within the approaching window via injected clock → ACCOUNTANT
 *         due-date-approaching notification, no manual trigger. (AC-MSG-013-06)
 *
 * Architecture:
 *   - Admin pool for setup/teardown.
 *   - Engagement.dueDate set within the seeded approachingDueWindowDays (7 days).
 *   - Injected clock (`now`) is set so that `dueDate - now` is within the window.
 *   - The engine is invoked once (no manual trigger); the notification is verified via DB.
 *   - Watermark (lastApproachingDueNotifiedAt) verified after the run.
 *   - Second run on the same calendar day → no duplicate (watermark idempotency).
 *
 * // ADR-023 // ADR-018 // ADR-005 // ADR-003 // ADR-012
 * // AC-MSG-013-06
 * // CS-GEN-001 // CS-GEN-003
 * // DECISION-019-F // DECISION-019-H
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

const SUFFIX = `appr_${Date.now()}`;

let erApproachingId: string;
let engApproachingId: string;   // engagement approaching its due date

// ─── Clocks and dates ─────────────────────────────────────────────────────────

/**
 * ADR-023: base injected clock for approaching-due tests.
 * We use a fixed point in time. // ADR-023
 */
const T_NOW = new Date("2026-03-10T12:00:00.000Z");

// The seeded approachingDueWindowDays (expected 7). Read in beforeAll.
let approachingDueWindowDays: number;

// Engagement due date: T_NOW + 5 days (within the default 7-day window).
// Format: 'YYYY-MM-DD' (DATE column — mirrors Engagement.dueDate @db.Date).
// DECISION-019-F: dueDate must be >= T_NOW AND DATEDIFF(day, T_NOW, dueDate) <= windowDays. // DECISION-019-F
const T_DUE_DATE = "2026-03-15"; // T_NOW + 5 days → within the 7-day window

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  if (!ADMIN_URL) {
    throw new Error("DATABASE_URL_ADMIN is required for reminder-engine approaching integration tests");
  }

  const adminConfig = parseSqlServerUrl(ADMIN_URL) as import("mssql").config;
  adminPool = new ConnectionPool(adminConfig);
  await adminPool.connect();

  // Read the approaching window days from the seeded global default.
  // DECISION-019-B: singleton ReminderSetting row. // DECISION-019-B
  const cadence = await getGlobalDefaultCadence();
  approachingDueWindowDays = cadence.approachingDueWindowDays;

  // ─── Create engagement approaching its due date ──────────────────────────────

  const erRes = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[EngagementRequest]
       ([firstName], [lastName], [email], [status], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'Test', N'Approaching', N'appr-${SUFFIX}@example.com', N'accepted', SYSDATETIMEOFFSET())`
  );
  erApproachingId = erRes.recordset[0]!.id;

  // Engagement with dueDate = T_DUE_DATE (5 days after T_NOW → within approachingDueWindowDays=7).
  // lastApproachingDueNotifiedAt = NULL → not yet notified (DECISION-019-F). // DECISION-019-F
  const engRes = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[Engagement]
       ([engagementRequestId], [status], [dueDate], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES ('${erApproachingId}', N'In Progress', '${T_DUE_DATE}', SYSDATETIMEOFFSET())`
  );
  engApproachingId = engRes.recordset[0]!.id;
}, 30000);

// ─── Teardown ─────────────────────────────────────────────────────────────────

afterAll(async () => {
  // Clean notifications emitted for our test engagement.
  if (engApproachingId) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[Notification] WHERE [linkedItemId] = '${engApproachingId}'`
    ).catch(() => { /* ignore */ });
  }

  // Clean in FK dependency order: Engagement → EngagementRequest.
  if (engApproachingId) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[Engagement] WHERE [id] = '${engApproachingId}'`
    ).catch(() => { /* ignore */ });
  }
  if (erApproachingId) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[EngagementRequest] WHERE [id] = '${erApproachingId}'`
    ).catch(() => { /* ignore */ });
  }

  await adminPool.close();
}, 30000);

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Reminder engine — approaching-due-date (HARD tier-3 #8, AC-MSG-013-06)", () => {

  /**
   * HARD tier-3 #8 — Engagement within the approaching window → ACCOUNTANT notification.
   *
   * AC-MSG-013-06: Given an engagement approaching its due date,
   *                When the engine evaluates upcoming deadlines,
   *                Then the accountant receives an in-portal due-date-approaching notification.
   *
   * The notification is produced by the engine (not a manual trigger).
   * The injected clock (T_NOW) is set so that:
   *   dueDate - T_NOW = 5 days ≤ approachingDueWindowDays (7 days, from seed).
   *
   * ADR-023: T_NOW is the injected clock. // ADR-023
   * ADR-018: dueDate consumed from Engagement (EPIC-011); no new lifecycle attribute. // ADR-018
   * DECISION-019-F: lastApproachingDueNotifiedAt IS NULL → notification raised. // DECISION-019-F
   * ADR-005: recipientType='ACCOUNTANT', recipientUserId=null (reuses sec.pol_Notification). // ADR-005
   */
  it("[AC-MSG-013-06] engagement within approaching window via injected clock → ACCOUNTANT due-date-approaching notification (no manual trigger) [HARD tier-3 #8]", async () => {
    // Verify the precondition: approachingDueWindowDays >= 5 (our test uses 5 days from now).
    // The seed value is 7; this guard ensures the test is coherent if the seed changes.
    expect(approachingDueWindowDays).toBeGreaterThanOrEqual(5);

    // PRE-CONDITION: ensure lastApproachingDueNotifiedAt is NULL (first run for this engagement).
    await adminPool.request().query(
      `UPDATE [dbo].[Engagement]
       SET [lastApproachingDueNotifiedAt] = NULL, [updatedAt] = SYSDATETIMEOFFSET()
       WHERE [id] = '${engApproachingId}'`
    );
    // Clean any pre-existing notifications.
    await adminPool.request().query(
      `DELETE FROM [dbo].[Notification] WHERE [linkedItemId] = '${engApproachingId}'`
    );

    // ADR-023: inject T_NOW — engine evaluates upcoming deadlines with the injected clock. // ADR-023
    // dueDate = '2026-03-15', T_NOW = '2026-03-10' → 5 days away (within 7-day window). // DECISION-019-F
    const result = await runReminderEngine({ now: T_NOW });

    // AC-MSG-013-06: engine must have found the approaching engagement. // AC-MSG-013-06
    expect(result.approachingDueEngagementsFound).toBeGreaterThanOrEqual(1);
    expect(result.approachingDueNotificationsSent).toBeGreaterThanOrEqual(1);

    // Verify: ACCOUNTANT engagement_due_date_approaching notification was inserted.
    const notifResult = await adminPool.request().query<{
      id: string;
      type: string;
      recipientType: string;
      linkedItemType: string | null;
      linkedItemId: string | null;
    }>(
      `SELECT [id], [type], [recipientType], [linkedItemType], [linkedItemId]
       FROM [dbo].[Notification]
       WHERE [linkedItemId] = '${engApproachingId}'
         AND [type] = N'engagement_due_date_approaching'`
    );

    // Must have exactly 1 notification for this engagement after the first engine run.
    expect(notifResult.recordset.length).toBe(1);

    const notif = notifResult.recordset[0]!;
    // Must be ACCOUNTANT-scoped (ADR-005 / sec.pol_Notification reuse). // ADR-005
    expect(notif.recipientType).toBe("ACCOUNTANT");
    // linkedItemType/linkedItemId must be set for feed navigation. // DECISION-019-H
    expect(notif.linkedItemType).toBe("engagement");
    expect(notif.linkedItemId).toBe(engApproachingId);

    // Verify: lastApproachingDueNotifiedAt was set (watermark written). // DECISION-019-F
    const engRow = await adminPool.request().query<{ lastApproachingDueNotifiedAt: Date | null }>(
      `SELECT [lastApproachingDueNotifiedAt]
       FROM [dbo].[Engagement]
       WHERE [id] = '${engApproachingId}'`
    );
    expect(engRow.recordset[0]?.lastApproachingDueNotifiedAt).not.toBeNull();
  });

  /**
   * Idempotency: second engine run on the same calendar day → no duplicate notification.
   *
   * After the first run sets lastApproachingDueNotifiedAt = T_NOW, a second run with
   * the same T_NOW must NOT emit another notification (calendar-day idempotency gate).
   *
   * DECISION-019-F: stale check = CAST(lastApproachingDueNotifiedAt AS DATE) < CAST(now AS DATE). // DECISION-019-F
   * A same-day second run: CAST(T_NOW AS DATE) < CAST(T_NOW AS DATE) = FALSE → excluded.
   * This is consistent with the EPIC-018 digest daily-cap pattern (DECISION-018-002-A).
   *
   * AC-MSG-013-06: supports the "not spammed" behavior of the approaching notification. // AC-MSG-013-06
   */
  it("[DECISION-019-F] same-day second engine run → no duplicate approaching-due notification (idempotency)", async () => {
    // Count notifications before the second run (should be 1 from the first test).
    const countBefore = await adminPool.request().query<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM [dbo].[Notification]
       WHERE [linkedItemId] = '${engApproachingId}'
         AND [type] = N'engagement_due_date_approaching'`
    );
    const notifsBefore = countBefore.recordset[0]!.cnt;
    expect(notifsBefore).toBeGreaterThanOrEqual(1);

    // ADR-023: same injected clock (T_NOW) — same calendar day as the first run. // ADR-023
    // DECISION-019-F: lastApproachingDueNotifiedAt = T_NOW; CAST(T_NOW AS DATE) < CAST(T_NOW AS DATE) = FALSE.
    // The engagement is excluded from the query → no notification. // DECISION-019-F
    await runReminderEngine({ now: T_NOW });

    // Notification count must NOT have increased.
    const countAfter = await adminPool.request().query<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM [dbo].[Notification]
       WHERE [linkedItemId] = '${engApproachingId}'
         AND [type] = N'engagement_due_date_approaching'`
    );
    expect(countAfter.recordset[0]!.cnt).toBe(notifsBefore);
  });

  /**
   * Engagement PAST its due date → NOT in the approaching window.
   *
   * An engagement whose dueDate has already passed is excluded (dueDate >= now fails).
   * This prevents "approaching" notifications from being re-emitted for overdue engagements.
   *
   * DECISION-019-F: condition is dueDate >= CAST(now AS DATE) (not past). // DECISION-019-F
   */
  it("[DECISION-019-F] engagement PAST its due date → NOT identified as approaching", async () => {
    // Inject a clock PAST the dueDate (T_DUE_DATE = '2026-03-15', inject '2026-04-01').
    // dueDate < CAST(tAfterDue AS DATE) → dueDate IS past → excluded from approaching query.
    const tAfterDue = new Date("2026-04-01T12:00:00.000Z");

    // Reset the watermark so the engagement would be eligible if the query were wrong.
    await adminPool.request().query(
      `UPDATE [dbo].[Engagement]
       SET [lastApproachingDueNotifiedAt] = NULL, [updatedAt] = SYSDATETIMEOFFSET()
       WHERE [id] = '${engApproachingId}'`
    );

    const notifCountBefore = (await adminPool.request().query<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM [dbo].[Notification]
       WHERE [linkedItemId] = '${engApproachingId}'
         AND [type] = N'engagement_due_date_approaching'`
    )).recordset[0]!.cnt;

    // ADR-023: inject tAfterDue — dueDate is now past, not approaching. // ADR-023
    await runReminderEngine({ now: tAfterDue });

    // Must NOT have emitted an approaching-due notification (dueDate is past). // DECISION-019-F
    const notifCountAfter = (await adminPool.request().query<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM [dbo].[Notification]
       WHERE [linkedItemId] = '${engApproachingId}'
         AND [type] = N'engagement_due_date_approaching'`
    )).recordset[0]!.cnt;

    expect(notifCountAfter).toBe(notifCountBefore);
  });

});
