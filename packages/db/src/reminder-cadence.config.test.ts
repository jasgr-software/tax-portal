/**
 * packages/db/src/reminder-cadence.config.test.ts
 *
 * TIER-3 INTEGRATION TEST — requires real SQL Server (ADR-012 § Tier 3)
 *
 * Tests the cadence configuration data layer (TASK-019-002 / BRIEF-019 / EPIC-019).
 *
 * Acceptance criteria covered:
 *   AC-DASH-008-01: accountant can set global default frequency; it is recorded. // AC-DASH-008-01
 *   AC-DASH-008-02: accountant can set per-engagement frequency; engagement carries its own. // AC-DASH-008-02
 *   AC-MSG-018-03: reminder frequency configuration round-trips correctly. // AC-MSG-018-03
 *
 * Tests:
 *   1. getGlobalDefaultCadence() → returns the seeded default row (≥1 row from seed).
 *   2. setGlobalDefaultCadence() then getGlobalDefaultCadence() → round-trips the set value.
 *   3. setEngagementCadenceOverride() then getEngagementCadenceOverride() → engagement carries its own freq.
 *   4. setEngagementCadenceOverride(null) → clears the override; resolveReminderCadence falls back to global.
 *
 * Architecture notes:
 *   - All DB setup / teardown use the admin pool (bypasses RLS — ADR-003 §1).
 *   - getGlobalDefaultCadence / setGlobalDefaultCadence / getEngagementCadenceOverride /
 *     setEngagementCadenceOverride all use the admin pool internally.
 *   - resolveReminderCadence is a pure function; its precedence is proven in the separate
 *     reminder-cadence.precedence.test.ts file.
 *   - Tests run against the real seeded ReminderSetting row (0008-seed-default-reminder-setting.sql).
 *   - We restore the global default after modification (test hygiene — ADR-003 pool reuse).
 *
 * CS-TS-002: admin pool not imported outside packages/db; tests use the exported functions. // CS-TS-002
 * CS-GEN-002: additive — new test file; no existing test modified. // CS-GEN-002
 * CS-GEN-003: governing keys cited throughout. // CS-GEN-003
 * ADR-003: admin pool is correct for tests that go through the exported repository functions. // ADR-003
 * DECISION-019-A: per-engagement override = Engagement.reminderFrequencyDaysOverride. // DECISION-019-A
 * DECISION-019-B: global default = singleton ReminderSetting row. // DECISION-019-B
 * DECISION-019-G: resolvedDays = overrideDays ?? globalDefaultDays (proven via pure function here). // DECISION-019-G
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import mssqlPkg from "mssql";
import { parseSqlServerUrl } from "./sql-server-url.js";
import {
  getGlobalDefaultCadence,
  setGlobalDefaultCadence,
  getEngagementCadenceOverride,
  setEngagementCadenceOverride,
  resolveReminderCadence,
} from "./repositories/reminder-cadence.js";

const { ConnectionPool } = mssqlPkg;

// ─── Connection setup ─────────────────────────────────────────────────────────

/** Admin pool for test setup / teardown — bypasses RLS (ADR-003 §1). */
let adminPool: InstanceType<typeof ConnectionPool>;

const ADMIN_URL = process.env["DATABASE_URL_ADMIN"];

// ─── Test data ────────────────────────────────────────────────────────────────

/**
 * A scratch Engagement row created for the per-engagement override tests.
 * We insert it at beforeAll and delete it at afterAll.
 */
let testEngagementId: string;

/**
 * Original global default frequency — restored after modification.
 * Prevents this test suite from permanently changing the seeded default.
 */
let originalGlobalFrequency: number;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * IDs for cleanup in FK dependency order.
 * Engagement → EngagementRequest (Engagement.engagementRequestId FK ON DELETE NoAction).
 */
let testEngagementRequestId: string;

/**
 * A minimal Engagement row for test purposes.
 * We need a real FK-valid Engagement to exercise reminderFrequencyDaysOverride.
 * Engagement.engagementRequestId is NOT NULL and UNIQUE, so we create an EngagementRequest first.
 * Uses the admin pool to INSERT directly (bypasses RLS for test setup).
 */
async function insertTestEngagementWithRequest(): Promise<string> {
  // Insert an EngagementRequest (required FK parent for Engagement).
  // Minimal required fields: firstName, lastName, email, status, updatedAt.
  const suffix = Date.now();
  const reqResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[EngagementRequest]
       ([firstName], [lastName], [email], [status], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'Test', N'Cadence', N'test-cadence-${suffix}@example.com', N'accepted', SYSDATETIMEOFFSET())`
  );
  const reqId = reqResult.recordset[0]?.id;
  if (!reqId) throw new Error("Failed to insert test EngagementRequest row");
  testEngagementRequestId = reqId;

  // Insert an Engagement linked to the EngagementRequest.
  // DECISION-019-A: Engagement.reminderFrequencyDaysOverride is the column under test.
  const engResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[Engagement]
       ([engagementRequestId], [status], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES ('${reqId}', N'New', SYSDATETIMEOFFSET())`
  );
  const engId = engResult.recordset[0]?.id;
  if (!engId) throw new Error("Failed to insert test Engagement row");
  return engId;
}

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeAll(async () => {
  if (!ADMIN_URL) throw new Error("DATABASE_URL_ADMIN is required for integration tests");

  const adminConfig = parseSqlServerUrl(ADMIN_URL) as import("mssql").config;
  adminPool = new ConnectionPool(adminConfig);
  await adminPool.connect();

  // Read the current global default so we can restore it after modification.
  const current = await getGlobalDefaultCadence();
  originalGlobalFrequency = current.reminderFrequencyDays;

  // Create a scratch Engagement row (with its required EngagementRequest parent) for override tests.
  testEngagementId = await insertTestEngagementWithRequest();
}, 30000);

afterAll(async () => {
  // Restore the global default frequency to avoid side-effects on other test suites.
  await setGlobalDefaultCadence({ reminderFrequencyDays: originalGlobalFrequency });

  // Clean up in FK dependency order: Engagement first, then EngagementRequest.
  if (testEngagementId) {
    await adminPool
      .request()
      .query(`DELETE FROM [dbo].[Engagement] WHERE [id] = '${testEngagementId}'`)
      .catch(() => { /* ignore */ });
  }
  if (testEngagementRequestId) {
    await adminPool
      .request()
      .query(`DELETE FROM [dbo].[EngagementRequest] WHERE [id] = '${testEngagementRequestId}'`)
      .catch(() => { /* ignore */ });
  }

  await adminPool.close();
}, 30000);

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("Cadence configuration data layer — round-trip tests (AC-DASH-008-01/-02, AC-MSG-018-03)", () => {

  /**
   * [AC-DASH-008-01] getGlobalDefaultCadence() returns the seeded row.
   *
   * The seed (0008-seed-default-reminder-setting.sql) inserts exactly one ReminderSetting row
   * with reminderFrequencyDays=7. This test verifies the repository returns that row.
   * The seeded default must be present for subsequent set/get round-trip tests to work.
   *
   * DECISION-019-B: singleton pattern — exactly one row expected. // DECISION-019-B
   * AC-DASH-008-01: the recorded global default is readable. // AC-DASH-008-01
   */
  it("[AC-DASH-008-01] getGlobalDefaultCadence() returns the seeded default row (reminderFrequencyDays=7)", async () => {
    // AC-DASH-008-01: global default is recorded (readable). // AC-DASH-008-01
    const cadence = await getGlobalDefaultCadence();

    // The seeded default is 7 days (0008-seed-default-reminder-setting.sql / DECISION-019-B).
    expect(cadence).toBeDefined();
    expect(cadence.id).toBeTruthy();
    expect(cadence.reminderFrequencyDays).toBe(7);
    expect(cadence.approachingDueWindowDays).toBe(7);
  });

  /**
   * [AC-DASH-008-01] setGlobalDefaultCadence then getGlobalDefaultCadence → round-trips the set value.
   *
   * The accountant sets a new global default (14 days). The next read must return 14.
   * This proves the global default is recorded and applies where no override exists.
   *
   * AC-DASH-008-01: global default is recorded and readable. // AC-DASH-008-01
   * AC-MSG-018-03: overdue reminders raised at this frequency by default. // AC-MSG-018-03
   * DECISION-019-B: UPDATE the singleton row. // DECISION-019-B
   */
  it("[AC-DASH-008-01] [AC-MSG-018-03] setGlobalDefaultCadence() then get → round-trips the set value", async () => {
    const NEW_FREQUENCY = 14;

    // AC-DASH-008-01: set the global default. // AC-DASH-008-01
    const setResult = await setGlobalDefaultCadence({ reminderFrequencyDays: NEW_FREQUENCY });
    expect(setResult.updated).toBe(true);

    // AC-MSG-018-03: read it back — must return the new value. // AC-MSG-018-03
    const readBack = await getGlobalDefaultCadence();
    expect(readBack.reminderFrequencyDays).toBe(NEW_FREQUENCY);

    // Restore to the original value for subsequent tests.
    await setGlobalDefaultCadence({ reminderFrequencyDays: originalGlobalFrequency });
  });

  /**
   * [AC-DASH-008-02] setEngagementCadenceOverride then getEngagementCadenceOverride → engagement carries its own freq.
   *
   * The accountant sets a per-engagement override (21 days). Reading it back must return 21.
   * This proves the engagement carries its own reminder frequency independently.
   *
   * AC-DASH-008-02: per-engagement frequency is recorded. // AC-DASH-008-02
   * DECISION-019-A: override lives in Engagement.reminderFrequencyDaysOverride. // DECISION-019-A
   */
  it("[AC-DASH-008-02] setEngagementCadenceOverride() then get → engagement carries its own freq", async () => {
    const PER_ENGAGEMENT_FREQ = 21;

    // AC-DASH-008-02: set the per-engagement override. // AC-DASH-008-02
    const setResult = await setEngagementCadenceOverride({
      engagementId: testEngagementId,
      reminderFrequencyDays: PER_ENGAGEMENT_FREQ,
    });
    expect(setResult.updated).toBe(true);

    // Read it back — must return 21.
    const readBack = await getEngagementCadenceOverride(testEngagementId);
    expect(readBack.engagementId).toBe(testEngagementId);
    expect(readBack.reminderFrequencyDaysOverride).toBe(PER_ENGAGEMENT_FREQ);
  });

  /**
   * [AC-DASH-008-03] [AC-MSG-018-04] setEngagementCadenceOverride(null) → override cleared; falls back to global default.
   *
   * After a per-engagement override is set, passing null must clear it.
   * Once cleared, resolveReminderCadence must fall back to the global default.
   * This is the "clearing override" path of DECISION-019-A.
   *
   * AC-DASH-008-03: per-engagement takes precedence; clearing it reverts to global. // AC-DASH-008-03
   * AC-MSG-018-04: per-engagement override takes precedence when set. // AC-MSG-018-04
   * DECISION-019-A: null clears the override. // DECISION-019-A
   * DECISION-019-G: null overrideDays → falls back to globalDefaultDays. // DECISION-019-G
   */
  it("[AC-DASH-008-03] [AC-MSG-018-04] setEngagementCadenceOverride(null) → override cleared; resolveReminderCadence falls back to global default", async () => {
    // Setup: ensure an override exists first.
    await setEngagementCadenceOverride({
      engagementId: testEngagementId,
      reminderFrequencyDays: 30,
    });
    const withOverride = await getEngagementCadenceOverride(testEngagementId);
    expect(withOverride.reminderFrequencyDaysOverride).toBe(30);

    // Clear the override.
    // DECISION-019-A: null clears Engagement.reminderFrequencyDaysOverride. // DECISION-019-A
    const clearResult = await setEngagementCadenceOverride({
      engagementId: testEngagementId,
      reminderFrequencyDays: null,
    });
    expect(clearResult.updated).toBe(true);

    // Read back — must be null (no override).
    const afterClear = await getEngagementCadenceOverride(testEngagementId);
    expect(afterClear.reminderFrequencyDaysOverride).toBeNull();

    // Now resolve — must fall back to global default.
    // DECISION-019-G: null overrideDays → globalDefaultDays. // DECISION-019-G
    // AC-MSG-018-04: per-engagement override absent → global default applies. // AC-MSG-018-04
    const globalDefault = await getGlobalDefaultCadence();
    const resolved = resolveReminderCadence({
      overrideDays: afterClear.reminderFrequencyDaysOverride, // null
      globalDefaultDays: globalDefault.reminderFrequencyDays,
    });
    expect(resolved).toBe(globalDefault.reminderFrequencyDays);
  });

  /**
   * [AC-DASH-008-03] resolveReminderCadence with DB values — override present takes precedence.
   *
   * With a real global default from the DB and a real per-engagement override set in the DB,
   * resolveReminderCadence must return the override value.
   * This is the combined DB + pure-function integration proof.
   *
   * AC-DASH-008-03: per-engagement takes precedence over global default. // AC-DASH-008-03
   * DECISION-019-G: overrideDays ?? globalDefaultDays. // DECISION-019-G
   */
  it("[AC-DASH-008-03] resolveReminderCadence with real DB values — override present → returns override, not global default", async () => {
    // Set global default to a known value.
    await setGlobalDefaultCadence({ reminderFrequencyDays: 7 });

    // Set per-engagement override to a different value.
    const PER_ENGAGEMENT_FREQ = 21;
    await setEngagementCadenceOverride({
      engagementId: testEngagementId,
      reminderFrequencyDays: PER_ENGAGEMENT_FREQ,
    });

    // Read both from DB.
    const globalDefault = await getGlobalDefaultCadence();
    const override = await getEngagementCadenceOverride(testEngagementId);

    // Resolve using the pure function.
    // DECISION-019-G: override (21) takes precedence over global default (7). // DECISION-019-G
    const resolved = resolveReminderCadence({
      overrideDays: override.reminderFrequencyDaysOverride,
      globalDefaultDays: globalDefault.reminderFrequencyDays,
    });

    expect(resolved).toBe(PER_ENGAGEMENT_FREQ);
    expect(resolved).not.toBe(globalDefault.reminderFrequencyDays);

    // Restore.
    await setGlobalDefaultCadence({ reminderFrequencyDays: originalGlobalFrequency });
    await setEngagementCadenceOverride({ engagementId: testEngagementId, reminderFrequencyDays: null });
  });

});
