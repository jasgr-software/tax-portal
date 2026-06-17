/**
 * packages/db/src/notification.rls.test.ts
 *
 * TIER-3 INTEGRATION TEST — requires real SQL Server (ADR-005 §6, HARD GATE)
 * Tests the sec.pol_Notification security policy against the real engine.
 *
 * INTRODUCES-GATE: yes — this is the required tier-3 evidence for sec.pol_Notification.
 *
 * ADR-005 §6 minimum coverage per policy:
 *   [POSITIVE]  ACCOUNTANT reads all notifications          — returns rows
 *   [NEGATIVE]  Null SESSION_CONTEXT (anonymous) reads      — zero rows, no error (fail-closed)
 *   [NEGATIVE]  CLIENT role reads                           — zero rows
 *   [POSITIVE]  Admin principal (app_admin_role) reads all  — RLS-exempt
 *
 * Gate Authoring Evidence (ENGINE.md § Gate Authoring Rules — three-item evidence):
 *   1. Run marker: this file at path packages/db/src/notification.rls.test.ts;
 *      test names: "[POSITIVE] ACCOUNTANT role reads all notifications",
 *      "[NEGATIVE] Null SESSION_CONTEXT (anonymous) reads ZERO rows — fail-closed, no error",
 *      "[NEGATIVE] CLIENT role reads ZERO notifications",
 *      "[POSITIVE] Admin pool (app_admin_role) reads all notifications — RLS-exempt".
 *      Actual output recorded in TASK-003-001 Work Log.
 *   2. Named code path: sec.fn_notification_access in
 *      db/policies/0004-notification-policy.sql — specifically the FILTER PREDICATE
 *      on dbo.Notification (STATE = ON, SCHEMABINDING = ON). The predicate's two
 *      branches: IS_MEMBER('app_admin_role') = 1 (positive/admin path) and
 *      CAST(SESSION_CONTEXT(N'role') AS NVARCHAR(16)) = N'ACCOUNTANT' (positive/accountant path).
 *   3. Counterfactual: removing the
 *      "OR CAST(SESSION_CONTEXT(N'role') AS NVARCHAR(16)) = N'ACCOUNTANT'"
 *      branch from fn_notification_access would cause the ACCOUNTANT-positive test to
 *      return 0 rows instead of 1+, failing this gate. Removing the IS_MEMBER branch
 *      would cause the admin-bypass test to return 0 rows, failing the admin test.
 *
 * Tagged AC IDs (test titles reference AC ids):
 *   AC-DOOR-005-03 — notification delivered to accountant only, not to clients or anonymous
 *
 * Connection approach:
 *   Uses raw mssql (not Prisma) for both pools. Rationale: Prisma 5.22.0 sqlserver connector
 *   cannot parse port in the authority URL form (P1013) nor in the semicolon-param form when
 *   the password contains special chars. The mssql driver parses both forms correctly.
 *   This is the TASK-002-documented workaround for the port-14330 environment.
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

let seededRequestId: string;
let seededNotificationId: string;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Count Notification rows visible to the given pool (after setting SESSION_CONTEXT).
 * Uses a fresh request on the pool to avoid context pollution between tests.
 *
 * AC-DOOR-005-03: ACCOUNTANT sees rows; CLIENT/null sees zero (fail-closed).
 */
async function countVisibleNotifications(
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
    "SELECT COUNT(*) AS cnt FROM [dbo].[Notification]"
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

  // Seed: insert an EngagementRequest + Notification via admin pool (bypasses RLS)
  const requestResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[EngagementRequest]
       ([firstName], [lastName], [email], [status], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'Notif', N'RLSTest', N'notif-rls-test@example.com', N'pending', SYSDATETIMEOFFSET())`
  );
  seededRequestId = requestResult.recordset[0]?.id ?? "";

  const notifResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[Notification]
       ([type], [title], [body], [engagementRequestId])
     OUTPUT INSERTED.[id]
     VALUES (N'new_engagement_request', N'New request from Notif RLSTest', NULL, '${seededRequestId}')`
  );
  seededNotificationId = notifResult.recordset[0]?.id ?? "";
}, 30000);

afterAll(async () => {
  // Cleanup seeded data via admin pool (bypasses RLS)
  if (seededNotificationId) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[Notification] WHERE [id] = '${seededNotificationId}'`
    ).catch(() => { /* ignore */ });
  }
  if (seededRequestId) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[EngagementRequest] WHERE [id] = '${seededRequestId}'`
    ).catch(() => { /* ignore */ });
  }
  await adminPool.close();
  await requestPool.close();
}, 30000);

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("sec.pol_Notification — RLS integration (HARD GATE, ADR-005 §6, AC-DOOR-005-03)", () => {

  /**
   * [POSITIVE] ACCOUNTANT reads all notifications.
   * Predicate branch: CAST(SESSION_CONTEXT(N'role') AS NVARCHAR(16)) = N'ACCOUNTANT'
   * Tagged: AC-DOOR-005-03 — notification delivered to accountant only (positive proof)
   */
  it("AC-DOOR-005-03 — [POSITIVE] ACCOUNTANT role reads all notifications", async () => {
    const count = await countVisibleNotifications(requestPool, "user_accountant_test", "ACCOUNTANT");
    // Must see at least the seeded notification
    expect(count).toBeGreaterThanOrEqual(1);
  });

  /**
   * [NEGATIVE] Null SESSION_CONTEXT reads ZERO notifications — fail-closed, no error.
   * ADR-003 §5: null identity → predicate returns empty → zero rows, not an error.
   * Tagged: AC-DOOR-005-03 — anonymous/null context reads zero (fail-closed)
   */
  it("AC-DOOR-005-03 — [NEGATIVE] Null SESSION_CONTEXT (anonymous) reads ZERO notifications — fail-closed, no error", async () => {
    const count = await countVisibleNotifications(requestPool, null, null);
    expect(count).toBe(0);
  });

  /**
   * [NEGATIVE] CLIENT role reads ZERO notifications via request pool.
   * Tagged: AC-DOOR-005-03 — CLIENT reads zero (not delivered to clients)
   */
  it("AC-DOOR-005-03 — [NEGATIVE] CLIENT role reads ZERO notifications (not delivered to clients)", async () => {
    const count = await countVisibleNotifications(requestPool, "user_client_test", "CLIENT");
    expect(count).toBe(0);
  });

  /**
   * [POSITIVE] Admin pool (connected as sa / app_admin_role-member) reads all rows — RLS-exempt.
   * IS_MEMBER('app_admin_role') = 1 → predicate passes unconditionally.
   * Verifies the seeded notification exists with the correct type and title.
   * Tagged: AC-DOOR-005-03 — admin bypass verified
   */
  it("AC-DOOR-005-03 — [POSITIVE] Admin pool (app_admin_role) reads all notifications — RLS-exempt", async () => {
    const rows = await adminPool.request().query<{
      id: string;
      type: string;
      title: string;
      engagementRequestId: string;
    }>(
      `SELECT [id], [type], [title], [engagementRequestId]
       FROM [dbo].[Notification]
       WHERE [id] = '${seededNotificationId}'`
    );
    expect(rows.recordset).toHaveLength(1);
    expect(rows.recordset[0]?.type).toBe("new_engagement_request");
    expect(rows.recordset[0]?.title).toBe("New request from Notif RLSTest");
    expect(rows.recordset[0]?.engagementRequestId).toBe(seededRequestId);
  });

});
