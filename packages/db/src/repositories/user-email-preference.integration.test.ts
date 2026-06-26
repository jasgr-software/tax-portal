/**
 * packages/db/src/repositories/user-email-preference.integration.test.ts
 *
 * TIER-3 INTEGRATION TEST — requires real SQL Server (ADR-012 § Tier 3)
 *
 * Tests the User.emailNudgeEnabled / User.lastNudgeSentAt schema columns
 * (TASK-018-001 / BRIEF-018 / EPIC-018).
 *
 * Acceptance criteria covered:
 *
 *   AC-MSG-011-01 — A newly created client account has the email fallback nudge enabled
 *                   by default. No opt-in step is required.
 *     Test: inserting a User row (without specifying emailNudgeEnabled) produces a row
 *           with emailNudgeEnabled=true and lastNudgeSentAt=null on read-back.
 *     Proves: the DB-level DEFAULT 1 on the BIT column satisfies AC-MSG-011-01 for
 *             every INSERT that omits the column — seed, sign-up, e2e fixture, etc.
 *
 * Architecture notes:
 *   - All reads use the admin pool directly (admin pool bypasses RLS — ADR-003 §1).
 *   - The insert mirrors the real sign-up path (required columns only; no emailNudgeEnabled
 *     in the INSERT statement → DB default fires → true on read-back).
 *   - emailNudgeEnabled is stored as BIT (0|1) in SQL Server; the mssql driver maps BIT→boolean.
 *   - lastNudgeSentAt is DATETIMEOFFSET NULL; newly created rows have NULL (never nudged).
 *   - No SESSION_CONTEXT needed for admin pool reads (ADR-003 §1/§7).
 *
 * ADR-002: DATETIMEOFFSET for lastNudgeSentAt; BIT DEFAULT 1 for emailNudgeEnabled. // ADR-002
 * REQ-MSG-010: opt-out preference column — emailNudgeEnabled. // REQ-MSG-010
 * REQ-MSG-011: client default-on — AC-MSG-011-01 satisfied by DB DEFAULT 1. // REQ-MSG-011
 *
 * CS-GEN-002: additive — new test file, no existing test modified. // CS-GEN-002
 * CS-GEN-003: governing keys cited throughout. // CS-GEN-003
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import mssqlPkg from "mssql";
import { parseSqlServerUrl } from "../sql-server-url.js";

const { ConnectionPool } = mssqlPkg;

// ─── Connection setup ─────────────────────────────────────────────────────────

let adminPool: InstanceType<typeof ConnectionPool>;

const ADMIN_URL = process.env["DATABASE_URL_ADMIN"];

// ─── Test data ────────────────────────────────────────────────────────────────

/**
 * Test-unique clerk ID — avoids collision with other integration test seeds.
 * Prefix chosen to identify this test file in post-run cleanup if needed.
 */
const TEST_CLERK_ID = "nudge_pref_018_001_client";

let testUserId: string;

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeAll(async () => {
  if (!ADMIN_URL) throw new Error("DATABASE_URL_ADMIN is required for integration tests");

  const adminConfig = parseSqlServerUrl(ADMIN_URL) as import("mssql").config;
  adminPool = new ConnectionPool(adminConfig);
  await adminPool.connect();
}, 30000);

afterAll(async () => {
  // Clean up the test row. Ignore errors (e.g., if the row was already deleted by a failed test).
  if (testUserId) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[User] WHERE [id] = '${testUserId}'`
    ).catch(() => { /* ignore */ });
  }
  // Belt-and-suspenders: clean up by clerkId in case testUserId was never populated.
  await adminPool.request().query(
    `DELETE FROM [dbo].[User] WHERE [clerkId] = N'${TEST_CLERK_ID}'`
  ).catch(() => { /* ignore */ });

  await adminPool.close().catch(() => { /* ignore */ });
}, 30000);

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("User email preference columns — emailNudgeEnabled + lastNudgeSentAt (TASK-018-001)", () => {

  /**
   * AC-MSG-011-01: A newly created client account has the email fallback nudge enabled by default.
   *
   * Given a new User row is inserted with only the required columns
   *   (clerkId, email, role, updatedAt — no emailNudgeEnabled specified),
   * When the row is read back from the database via the admin pool,
   * Then emailNudgeEnabled is true (DB DEFAULT 1 fired with no opt-in step),
   * And lastNudgeSentAt is null (the user has never been nudged).
   *
   * Proves: the DB-level DEFAULT 1 constraint is in place and fires automatically for
   * every INSERT that omits the column — seed rows, sign-up rows, and e2e fixture rows
   * all inherit the correct default without any app-layer opt-in step.
   *
   * This is the definitive proof of AC-MSG-011-01: no opt-in step, DB-level default-on.
   *
   * // AC-MSG-011-01 // REQ-MSG-010 // REQ-MSG-011 // ADR-002 // CS-GEN-002 // CS-GEN-003
   */
  it(
    "AC-MSG-011-01 — inserting a new User row yields emailNudgeEnabled = true with no opt-in step",
    async () => {
      // ── GIVEN ────────────────────────────────────────────────────────────────
      // Insert a User row omitting emailNudgeEnabled (and lastNudgeSentAt).
      // The insert mirrors the real sign-up path: only required columns are provided.
      // The DB BIT DEFAULT 1 constraint fires, so the new row is nudge-enabled automatically.
      // REQ-MSG-011 // AC-MSG-011-01: no opt-in step; default fires at the DB level.
      const insertResult = await adminPool.request().query<{ id: string }>(
        `INSERT INTO [dbo].[User] ([clerkId], [email], [role], [updatedAt])
         OUTPUT INSERTED.[id]
         VALUES (
           N'${TEST_CLERK_ID}',
           N'nudge-pref-018-001@example.com',
           N'CLIENT',
           SYSDATETIMEOFFSET()
         )`
      );

      testUserId = insertResult.recordset[0]?.id ?? "";
      expect(testUserId, "INSERT must return a non-empty id").toBeTruthy();

      // ── WHEN ─────────────────────────────────────────────────────────────────
      // Read back the newly created row from the admin pool.
      // Admin pool bypasses RLS → we see the row regardless of SESSION_CONTEXT (ADR-003 §1).
      const readResult = await adminPool.request().query<{
        emailNudgeEnabled: boolean;
        lastNudgeSentAt: Date | null;
      }>(
        `SELECT [emailNudgeEnabled], [lastNudgeSentAt]
         FROM [dbo].[User]
         WHERE [id] = '${testUserId}'`
      );

      expect(readResult.recordset, "Row must exist after insert").toHaveLength(1);
      const row = readResult.recordset[0];

      // ── THEN ─────────────────────────────────────────────────────────────────
      // AC-MSG-011-01: emailNudgeEnabled must be true — no opt-in step was performed.
      // The DB-level DEFAULT 1 (BIT NOT NULL) satisfies this: every INSERT that omits
      // the column gets 1 (true) automatically. The mssql driver maps SQL Server BIT→boolean.
      // REQ-MSG-011 // AC-MSG-011-01 // ADR-002
      expect(
        row?.emailNudgeEnabled,
        "[AC-MSG-011-01] emailNudgeEnabled must be true for a freshly-created User row " +
          "with no opt-in step — DB DEFAULT 1 must have fired"
      ).toBe(true);

      // lastNudgeSentAt must be null — the user has never been nudged (no dispatcher has run).
      // NULL = never nudged. Written only by the dispatcher (TASK-018-003).
      // ADR-002: DATETIMEOFFSET NULL column. // ADR-002
      expect(
        row?.lastNudgeSentAt,
        "[AC-MSG-011-01] lastNudgeSentAt must be null for a freshly-created User row " +
          "(the dispatcher has not run yet)"
      ).toBeNull();
    }
  );

  /**
   * Additive-migration guard: existing User rows (pre-TASK-018-001) should also have
   * emailNudgeEnabled=true (from the ALTER TABLE DEFAULT) and lastNudgeSentAt=null.
   *
   * This test reads the first User row that was NOT inserted by this test (using a
   * different clerkId prefix) and confirms the same column contract applies.
   *
   * Not tagged with AC-MSG-011-01 because it checks the migration's additive nature
   * (CS-GEN-002), not the default-on requirement itself — the first test covers that.
   *
   * // CS-GEN-002 // ADR-002
   */
  it(
    "CS-GEN-002 — migration is additive: existing User rows have emailNudgeEnabled=true and lastNudgeSentAt=null",
    async () => {
      // Read any existing User row NOT created by this test run.
      // We use clerkId NOT LIKE to exclude the test row inserted above.
      const existingResult = await adminPool.request().query<{
        id: string;
        emailNudgeEnabled: boolean;
        lastNudgeSentAt: Date | null;
      }>(
        `SELECT TOP 1 [id], [emailNudgeEnabled], [lastNudgeSentAt]
         FROM [dbo].[User]
         WHERE [clerkId] NOT LIKE N'nudge_pref_018_%'
         ORDER BY [createdAt] ASC`
      );

      if (existingResult.recordset.length === 0) {
        // No pre-existing rows in a clean DB — the additive test is vacuously satisfied.
        // This is expected in a freshly initialized CI database.
        return;
      }

      const existing = existingResult.recordset[0];

      // Existing rows should have emailNudgeEnabled=true (DEFAULT 1 applied at ALTER TABLE time).
      // SQL Server applies DEFAULT to existing NULL columns when the DEFAULT constraint is added
      // with NOT NULL (which is the case here: BIT NOT NULL DEFAULT 1).
      // CS-GEN-002: no existing data destroyed or changed in an unexpected way. // CS-GEN-002
      expect(
        existing?.emailNudgeEnabled,
        "[CS-GEN-002] Existing User rows must have emailNudgeEnabled=true after the additive migration"
      ).toBe(true);

      // Existing rows should have lastNudgeSentAt=null (nullable additive column — no back-fill).
      expect(
        existing?.lastNudgeSentAt,
        "[CS-GEN-002] Existing User rows must have lastNudgeSentAt=null after the additive migration"
      ).toBeNull();
    }
  );

});
