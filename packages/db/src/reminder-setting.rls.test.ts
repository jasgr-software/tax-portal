/**
 * packages/db/src/reminder-setting.rls.test.ts
 *
 * TIER-3 INTEGRATION TEST — requires real SQL Server (ADR-005 §6, HARD GATE)
 * Tests the sec.pol_ReminderSetting security policy against the real engine.
 *
 * INTRODUCES-GATE: no — the policy isolation obligation is a HARD tier-3 requirement
 *   carried by ADR-005 §6 + BRIEF-019 extra_gate #7 (CS-SQL-001). The gate itself
 *   was introduced by ADR-005; this test binds the new policy to that existing gate.
 *
 * TASK-019-001 / EPIC-019 / BRIEF-019 extra_gate #7:
 *   "Tier-3 cadence-config isolation for any net-new engagement-scoped table (CS-SQL-001/-003;
 *    ADR-005): the per-engagement reminder-frequency config is accountant-only — a client
 *    principal cannot read or write it. A negative isolation test per net-new scoped table
 *    is a hard requirement."
 *
 * ADR-005 §6 minimum coverage per policy:
 *   [POSITIVE]  Admin pool (app_admin_role) reads all rows — RLS-exempt
 *   [POSITIVE]  ACCOUNTANT role reads the seeded config row — visible (positive gate)
 *   [NEGATIVE]  Null SESSION_CONTEXT reads ZERO rows — fail-closed (ADR-003 §5)
 *   [NEGATIVE]  CLIENT role reads ZERO rows — no CLIENT branch in predicate
 *   [NEGATIVE]  CLIENT role INSERT → BLOCK predicate denies (0 rows affected)
 *   [NEGATIVE]  CLIENT role UPDATE → BLOCK predicate denies (0 rows affected)
 *   [POSITIVE]  Schema migration is additive — existing DocumentRequest + Engagement rows
 *               remain valid; new nullable columns present
 *
 * Accountant-only predicate shape (sec.fn_reminder_setting_access):
 *   1. IS_MEMBER('app_admin_role') = 1 → admin passes unconditionally
 *   2. CAST(SESSION_CONTEXT(N'role') AS NVARCHAR(16)) = N'ACCOUNTANT' → ACCOUNTANT passes
 *   3. No CLIENT branch — CLIENT reads ZERO (fail-closed for cadence config)
 *   ADR-003 §5: null SESSION_CONTEXT → both branches fail → empty result → ZERO rows
 *
 * Tagged AC IDs / governing keys:
 *   BRIEF-019 extra_gate #7 (cadence-config isolation)
 *   CS-SQL-001 (RLS policy + isolation test per net-new table)
 *   CS-SQL-003 (ITVF/inline-EXISTS predicate shape)
 *   ADR-005 §6 (per-policy isolation test hard requirement)
 *   ADR-003 §5 (null SESSION_CONTEXT → fail-closed → zero rows)
 *   DECISION-019-A (per-engagement override = Engagement column; no new policy)
 *   DECISION-019-B (ReminderSetting = net-new singleton; accountant-only; own policy+test)
 *   DECISION-019-C (DocumentRequest.dueDate nullable; additive)
 *   DECISION-019-E (DocumentRequest.lastReminderSentAt nullable; additive)
 *   DECISION-019-F (Engagement.lastApproachingDueNotifiedAt nullable; additive)
 *
 * // ADR-005 // ADR-003 // CS-SQL-001 // CS-SQL-002 // CS-SQL-003
 * // CS-GEN-002 // CS-GEN-003 // DECISION-019-A // DECISION-019-B
 *
 * Connection approach:
 *   Uses raw mssql (not Prisma) for both pools. Rationale: Prisma 5.22.0 sqlserver connector
 *   cannot parse port in authority URL form (P1013). The mssql driver parses both forms
 *   correctly. This is the TASK-002-documented workaround for the port-14330 environment.
 *
 * Environment:
 *   DATABASE_URL_ADMIN — admin pool URL (sa / app_admin login; bypasses RLS)
 *   DATABASE_URL       — request pool URL (app_user login; subject to RLS)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import mssqlPkg from "mssql";
import { parseSqlServerUrl } from "../../scripts/db-migrate.js";

const { ConnectionPool } = mssqlPkg;

// ─── Connection setup ─────────────────────────────────────────────────────────

let adminPool: InstanceType<typeof ConnectionPool>;
let requestPool: InstanceType<typeof ConnectionPool>;

const ADMIN_URL = process.env["DATABASE_URL_ADMIN"];
const REQUEST_URL = process.env["DATABASE_URL"];

// ─── Test data ────────────────────────────────────────────────────────────────

/**
 * ID of the seeded ReminderSetting row (inserted by 0008-seed-default-reminder-setting.sql).
 * Used for point-query tests.
 */
let seededReminderSettingId: string;

/**
 * Unique clerk IDs for CLIENT isolation test.
 * Prefixed to avoid collision with other test files.
 */
const CLIENT_CLERK_ID = "rls_019_reminder_setting_client_a";

let clientUserId: string;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Count ReminderSetting rows visible to the given pool (after setting SESSION_CONTEXT).
 * Uses the existing pool (connection must already be open).
 *
 * [POSITIVE] ACCOUNTANT: returns ≥ 1 (seeded row visible)
 * [NEGATIVE] CLIENT / null context: returns 0 (fail-closed — DECISION-019-B)
 *
 * // ADR-005 // ADR-003 // CS-SQL-001 // DECISION-019-B
 */
async function countVisibleReminderSettings(
  pool: InstanceType<typeof ConnectionPool>,
  clerkUserId: string | null,
  role: string | null,
): Promise<number> {
  // Set SESSION_CONTEXT if an identity is provided
  if (clerkUserId !== null && role !== null) {
    await pool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = N'${clerkUserId.replace(/'/g, "''")}', @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = N'${role.replace(/'/g, "''")}', @read_only = 0;`
    );
  }
  // Else: no SESSION_CONTEXT set — tests the null-identity fail-closed path

  const result = await pool.request().query(
    "SELECT COUNT(*) AS cnt FROM [dbo].[ReminderSetting]"
  );
  const cnt = ((result.recordset[0] as { cnt?: number } | undefined)?.cnt) ?? 0;

  // Clear SESSION_CONTEXT after query (pool hygiene — ADR-003 §4)
  await pool.request().batch(
    `EXEC sp_set_session_context @key = N'clerk_user_id', @value = NULL, @read_only = 0;
     EXEC sp_set_session_context @key = N'role', @value = NULL, @read_only = 0;`
  );

  return cnt;
}

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeAll(async () => {
  if (!ADMIN_URL) throw new Error("DATABASE_URL_ADMIN is required for RLS integration tests");
  if (!REQUEST_URL) throw new Error("DATABASE_URL is required for RLS integration tests");

  // Admin pool — connected as sa / app_admin (is_member('app_admin_role')=1) → RLS-exempt
  const adminConfig = parseSqlServerUrl(ADMIN_URL) as import("mssql").config;
  adminPool = new ConnectionPool(adminConfig);
  await adminPool.connect();

  // Request pool — connected as app_user (is_member('app_user_role')=1) → subject to RLS
  const requestConfig = parseSqlServerUrl(REQUEST_URL) as import("mssql").config;
  requestPool = new ConnectionPool(requestConfig);
  await requestPool.connect();

  // ── Look up the seeded ReminderSetting row id ─────────────────────────────
  // The seed (0008-seed-default-reminder-setting.sql) inserts exactly one row.
  // Fetch via admin pool (bypasses RLS — we verify the row exists regardless of policy).
  // DECISION-019-B: singleton pattern — exactly one row exists.
  const settingResult = await adminPool.request().query<{ id: string }>(
    "SELECT TOP 1 [id] FROM [dbo].[ReminderSetting] ORDER BY [createdAt]"
  );
  seededReminderSettingId = settingResult.recordset[0]?.id ?? "";
  if (!seededReminderSettingId) {
    throw new Error(
      "No ReminderSetting seed row found. Ensure 0008-seed-default-reminder-setting.sql ran before this test."
    );
  }

  // ── Insert a CLIENT User row for isolation tests ───────────────────────────
  // We need a real CLIENT user in the User table to set a meaningful SESSION_CONTEXT.
  // The CLIENT session should see ZERO rows regardless (predicate has no CLIENT branch).
  const userResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[User] ([clerkId], [email], [role], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'${CLIENT_CLERK_ID}', N'rls-019-reminder-setting-client@example.com', N'CLIENT', SYSDATETIMEOFFSET())`
  );
  clientUserId = userResult.recordset[0]?.id ?? "";
}, 30000);

afterAll(async () => {
  // Cleanup seeded CLIENT user (the ReminderSetting seed row is persistent — do not delete)
  if (clientUserId) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[User] WHERE [id] = '${clientUserId}'`
    ).catch(() => { /* ignore */ });
  }
  await adminPool.close();
  await requestPool.close();
}, 30000);

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("sec.pol_ReminderSetting — accountant-only RLS isolation (HARD GATE, ADR-005 §6, BRIEF-019 extra_gate #7)", () => {

  /**
   * [POSITIVE] Admin pool (app_admin_role) reads all ReminderSetting rows — RLS-exempt.
   * IS_MEMBER('app_admin_role') = 1 → predicate passes unconditionally.
   * Verifies the seeded default row exists with correct field values.
   * Tagged: ADR-005 — admin bypass verified (RLS-exempt principal)
   * Tagged: DECISION-019-B — singleton seed row has expected defaults
   * // ADR-005 // DECISION-019-B // CS-SQL-001
   */
  it("ADR-005 — [POSITIVE] Admin pool (app_admin_role) reads the seeded ReminderSetting row — RLS-exempt", async () => {
    const rows = await adminPool.request().query<{
      id: string;
      reminderFrequencyDays: number;
      approachingDueWindowDays: number;
      defaultRequestDueDays: number | null;
    }>(
      `SELECT [id], [reminderFrequencyDays], [approachingDueWindowDays], [defaultRequestDueDays]
       FROM [dbo].[ReminderSetting]
       WHERE [id] = '${seededReminderSettingId}'`
    );
    expect(rows.recordset).toHaveLength(1);
    // Seed defaults: 7 / 7 / NULL (DECISION-019-B + 0008-seed-default-reminder-setting.sql)
    expect(rows.recordset[0]?.reminderFrequencyDays).toBe(7);
    expect(rows.recordset[0]?.approachingDueWindowDays).toBe(7);
    expect(rows.recordset[0]?.defaultRequestDueDays).toBeNull();
  });

  /**
   * [POSITIVE] ACCOUNTANT role reads the seeded config row — visible (positive gate).
   * Predicate branch 2: CAST(SESSION_CONTEXT(N'role') AS NVARCHAR(16)) = N'ACCOUNTANT' → passes.
   * Tagged: BRIEF-019 extra_gate #7 — ACCOUNTANT can read cadence config (positive side)
   * Tagged: AC-DASH-008-01 — accountant can set/read global default reminder frequency
   * // ADR-005 // ADR-003 // CS-SQL-001 // CS-SQL-003 // DECISION-019-B
   */
  it("BRIEF-019/extra_gate#7 — [POSITIVE] ACCOUNTANT reads the cadence config row — visible (AC-DASH-008-01)", async () => {
    const count = await countVisibleReminderSettings(requestPool, "rls_019_accountant_test", "ACCOUNTANT");
    // ACCOUNTANT must see at least the seeded row (≥ 1)
    expect(count).toBeGreaterThanOrEqual(1);
  });

  /**
   * [NEGATIVE] Null SESSION_CONTEXT reads ZERO rows — fail-closed (ADR-003 §5).
   * Both predicate branches fail when SESSION_CONTEXT is not set → empty result → 0 rows.
   * This is the critical fail-closed guarantee: an unauthenticated or null-context
   * request cannot read cadence configuration.
   * Tagged: ADR-003 §5 — null context reads zero (fail-closed)
   * Tagged: ADR-005 — fail-closed isolation
   * // ADR-005 // ADR-003 // CS-SQL-001 // DECISION-019-B
   */
  it("ADR-003/§5 — [NEGATIVE] Null SESSION_CONTEXT reads ZERO ReminderSetting rows — fail-closed", async () => {
    const count = await countVisibleReminderSettings(requestPool, null, null);
    expect(count).toBe(0);
  });

  /**
   * [NEGATIVE] CLIENT role reads ZERO rows — no CLIENT branch in predicate (DECISION-019-B).
   * The predicate has NO CLIENT-ownership branch. The CLIENT session context causes
   * both branches to fail (IS_MEMBER not admin, role != ACCOUNTANT) → 0 rows.
   * This is the hard isolation property the BRIEF-019 extra_gate #7 requires:
   * "a client principal cannot read or write" cadence configuration.
   * Tagged: BRIEF-019 extra_gate #7 — CLIENT cannot read cadence config (negative gate, HARD)
   * Tagged: CS-SQL-001 — per-table isolation test (negative side)
   * // ADR-005 // ADR-003 // CS-SQL-001 // CS-SQL-003 // DECISION-019-B
   */
  it("BRIEF-019/extra_gate#7 — [NEGATIVE] CLIENT role reads ZERO ReminderSetting rows — no CLIENT branch in predicate (HARD)", async () => {
    const count = await countVisibleReminderSettings(requestPool, CLIENT_CLERK_ID, "CLIENT");
    // CLIENT must NOT see any cadence config rows (0 rows — fail-closed for client context)
    expect(count).toBe(0);
  });

  /**
   * [NEGATIVE] CLIENT role INSERT → BLOCK predicate denies (0 rows affected or error).
   * BLOCK AFTER INSERT predicate on dbo.ReminderSetting:
   *   fn_reminder_setting_access returns empty for CLIENT SESSION_CONTEXT → INSERT blocked.
   *   SQL Server BLOCK predicate for AFTER INSERT: INSERT is silently suppressed (0 rows affected)
   *   when the predicate returns empty for the inserted row.
   * This proves defence-in-depth: even if a client tried to insert a config row via
   * the request pool, the BLOCK predicate prevents it.
   * Tagged: BRIEF-019 extra_gate #7 — CLIENT cannot write cadence config (negative gate, HARD)
   * Tagged: ADR-005 — BLOCK predicate defence-in-depth
   * // ADR-005 // ADR-003 // CS-SQL-001 // DECISION-019-B
   */
  it("BRIEF-019/extra_gate#7 — [NEGATIVE] CLIENT role INSERT into ReminderSetting → BLOCK predicate denies — 0 rows inserted (HARD)", async () => {
    // Set CLIENT SESSION_CONTEXT on the request pool
    await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = N'${CLIENT_CLERK_ID}', @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = N'CLIENT', @read_only = 0;`
    );

    // Attempt INSERT via the request pool as CLIENT — BLOCK AFTER INSERT should deny it.
    // SQL Server BLOCK AFTER INSERT: the INSERT is silently suppressed (@@ROWCOUNT = 0) or
    // raises a permission-related error. We catch both and count via admin pool.
    const countBefore = await adminPool.request().query<{ cnt: number }>(
      "SELECT COUNT(*) AS cnt FROM [dbo].[ReminderSetting]"
    );
    const beforeCount = (countBefore.recordset[0] as { cnt?: number } | undefined)?.cnt ?? 0;

    try {
      await requestPool.request().query(
        `INSERT INTO [dbo].[ReminderSetting]
           ([reminderFrequencyDays], [approachingDueWindowDays], [defaultRequestDueDays], [updatedAt])
         VALUES (14, 14, NULL, SYSDATETIMEOFFSET())`
      );
    } catch {
      // BLOCK predicate may raise an error — that's also acceptable (denies the write)
    }

    // Clear SESSION_CONTEXT (pool hygiene — ADR-003 §4)
    await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = NULL, @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = NULL, @read_only = 0;`
    );

    // Verify via admin pool that no new row was inserted (count must still be beforeCount)
    const countAfter = await adminPool.request().query<{ cnt: number }>(
      "SELECT COUNT(*) AS cnt FROM [dbo].[ReminderSetting]"
    );
    const afterCount = (countAfter.recordset[0] as { cnt?: number } | undefined)?.cnt ?? 0;

    // CLIENT must NOT have inserted a new row
    expect(afterCount, "[BRIEF-019/extra_gate#7] CLIENT INSERT must not increase ReminderSetting count").toBe(beforeCount);
  });

  /**
   * [NEGATIVE] CLIENT role UPDATE → BLOCK predicate denies (0 rows affected).
   * BLOCK BEFORE UPDATE predicate on dbo.ReminderSetting:
   *   fn_reminder_setting_access returns empty for CLIENT SESSION_CONTEXT → UPDATE silently suppressed.
   *   @@ROWCOUNT = 0; admin read-back confirms the value was NOT changed.
   * Tagged: BRIEF-019 extra_gate #7 — CLIENT cannot write cadence config (HARD)
   * Tagged: ADR-005 — BLOCK predicate BEFORE UPDATE defence-in-depth
   * // ADR-005 // ADR-003 // CS-SQL-001 // DECISION-019-B
   */
  it("BRIEF-019/extra_gate#7 — [NEGATIVE] CLIENT role UPDATE ReminderSetting → BLOCK predicate denies — row unchanged (HARD)", async () => {
    // Read the current value via admin pool first
    const before = await adminPool.request().query<{ reminderFrequencyDays: number }>(
      `SELECT [reminderFrequencyDays] FROM [dbo].[ReminderSetting] WHERE [id] = '${seededReminderSettingId}'`
    );
    const originalFreq = before.recordset[0]?.reminderFrequencyDays ?? 7;

    // Set CLIENT SESSION_CONTEXT on the request pool
    await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = N'${CLIENT_CLERK_ID}', @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = N'CLIENT', @read_only = 0;`
    );

    // Attempt UPDATE via the request pool as CLIENT — BLOCK BEFORE UPDATE should suppress it.
    const newFreq = originalFreq + 100; // A sentinel value we never expect to persist
    await requestPool.request().query(
      `UPDATE [dbo].[ReminderSetting]
       SET [reminderFrequencyDays] = ${newFreq},
           [updatedAt] = SYSDATETIMEOFFSET()
       WHERE [id] = '${seededReminderSettingId}'`
    );

    // Clear SESSION_CONTEXT (pool hygiene — ADR-003 §4)
    await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = NULL, @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = NULL, @read_only = 0;`
    );

    // Verify via admin pool that the value was NOT changed
    const after = await adminPool.request().query<{ reminderFrequencyDays: number }>(
      `SELECT [reminderFrequencyDays] FROM [dbo].[ReminderSetting] WHERE [id] = '${seededReminderSettingId}'`
    );
    const currentFreq = after.recordset[0]?.reminderFrequencyDays ?? 0;

    // CLIENT UPDATE must NOT have changed the value
    expect(
      currentFreq,
      "[BRIEF-019/extra_gate#7] CLIENT UPDATE must not change ReminderSetting.reminderFrequencyDays"
    ).toBe(originalFreq);
    expect(currentFreq).not.toBe(newFreq);
  });

  /**
   * [POSITIVE] Schema migration is additive — existing DocumentRequest rows remain valid.
   * DECISION-019-C (DocumentRequest.dueDate) and DECISION-019-E (lastReminderSentAt) are
   * nullable columns. An existing DocumentRequest row with NULL in these columns is valid.
   * CS-GEN-002: additive schema change does not break existing rows.
   * Tagged: CS-GEN-002 — additive column check (DocumentRequest)
   * Tagged: DECISION-019-C — dueDate nullable
   * Tagged: DECISION-019-E — lastReminderSentAt nullable
   * // CS-GEN-002 // DECISION-019-C // DECISION-019-E // ADR-002
   */
  it("CS-GEN-002 — [POSITIVE] DocumentRequest.dueDate and lastReminderSentAt exist and are nullable — schema is additive", async () => {
    // Verify the new columns exist in the DB schema by querying INFORMATION_SCHEMA
    const cols = await adminPool.request().query<{
      COLUMN_NAME: string;
      IS_NULLABLE: string;
    }>(
      `SELECT [COLUMN_NAME], [IS_NULLABLE]
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE [TABLE_NAME] = 'DocumentRequest'
         AND [COLUMN_NAME] IN ('dueDate', 'lastReminderSentAt')
       ORDER BY [COLUMN_NAME]`
    );
    const colNames = cols.recordset.map((r) => r.COLUMN_NAME).sort();
    expect(colNames).toEqual(["dueDate", "lastReminderSentAt"]);
    // Both columns must be nullable (CS-GEN-002 additive)
    for (const col of cols.recordset) {
      expect(
        col.IS_NULLABLE,
        `[CS-GEN-002] DocumentRequest.${col.COLUMN_NAME} must be nullable`
      ).toBe("YES");
    }
  });

  /**
   * [POSITIVE] Schema migration is additive — existing Engagement rows remain valid.
   * DECISION-019-A (Engagement.reminderFrequencyDaysOverride) and
   * DECISION-019-F (lastApproachingDueNotifiedAt) are nullable columns.
   * No net-new engagement-scoped table → no new policy (DECISION-019-A flagged in Work Log).
   * Tagged: CS-GEN-002 — additive column check (Engagement)
   * Tagged: DECISION-019-A — reminderFrequencyDaysOverride column on Engagement (flagged)
   * Tagged: DECISION-019-F — lastApproachingDueNotifiedAt nullable
   * // CS-GEN-002 // DECISION-019-A // DECISION-019-F // ADR-002
   */
  it("CS-GEN-002 — [POSITIVE] Engagement.reminderFrequencyDaysOverride and lastApproachingDueNotifiedAt exist and are nullable — schema is additive (DECISION-019-A shape verified)", async () => {
    // Verify the new columns exist in the DB schema by querying INFORMATION_SCHEMA
    const cols = await adminPool.request().query<{
      COLUMN_NAME: string;
      IS_NULLABLE: string;
    }>(
      `SELECT [COLUMN_NAME], [IS_NULLABLE]
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE [TABLE_NAME] = 'Engagement'
         AND [COLUMN_NAME] IN ('reminderFrequencyDaysOverride', 'lastApproachingDueNotifiedAt')
       ORDER BY [COLUMN_NAME]`
    );
    const colNames = cols.recordset.map((r) => r.COLUMN_NAME).sort();
    expect(colNames).toEqual(["lastApproachingDueNotifiedAt", "reminderFrequencyDaysOverride"]);
    // Both columns must be nullable (CS-GEN-002 additive; no default required for override)
    for (const col of cols.recordset) {
      expect(
        col.IS_NULLABLE,
        `[CS-GEN-002] Engagement.${col.COLUMN_NAME} must be nullable — DECISION-019-A override column only set when accountant configures it`
      ).toBe("YES");
    }
  });

});
