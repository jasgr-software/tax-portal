/**
 * packages/db/src/engagement-request.rls.test.ts
 *
 * TIER-3 INTEGRATION TEST — requires real SQL Server (ADR-005 §6, HARD GATE)
 * Tests the sec.pol_EngagementRequest security policy against the real engine.
 *
 * ADR-005 §6 minimum coverage per policy:
 *   [POSITIVE]  ACCOUNTANT reads all requests  — returns rows
 *   [NEGATIVE]  Null SESSION_CONTEXT reads      — zero rows, no error (fail-closed)
 *   [NEGATIVE]  CLIENT role reads               — zero rows (no client rows at this stage)
 *   [POSITIVE]  Admin principal (app_admin_role) reads all rows — RLS-exempt
 *
 * Gate Authoring Evidence (ENGINE.md § Gate Authoring Rules):
 *   1. Run marker: this test file + test names + actual output recorded in TASK-003 Work Log.
 *   2. Named code path: sec.fn_engagement_request_access in
 *      db/policies/0001-engagement-request-policy.sql — specifically the FILTER PREDICATE
 *      on dbo.EngagementRequest (STATE = ON, SCHEMABINDING = ON).
 *   3. Counterfactual: removing the
 *      "OR CAST(SESSION_CONTEXT(N'role') AS NVARCHAR(16)) = N'ACCOUNTANT'"
 *      branch from fn_engagement_request_access would cause the ACCOUNTANT-positive test
 *      to return 0 rows instead of 1+, failing this gate.
 *
 * Tagged AC IDs:
 *   sec.pol_EngagementRequest accountant-only-read behavior
 *   Implicitly covers: AC-DOOR-004-03 (row persisted in pending state — verified by positive test)
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

let seededServiceId: string;
let seededRequestId: string;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Execute a parameterised query as a specific pool and return the first recordset.
 */
async function queryAs(
  pool: InstanceType<typeof ConnectionPool>,
  sql: string,
): Promise<Array<Record<string, unknown>>> {
  const result = await pool.request().query(sql);
  return (result.recordset ?? []) as Array<Record<string, unknown>>;
}

/**
 * Execute a DDL/DML batch as a specific pool.
 */
async function executeAs(
  pool: InstanceType<typeof ConnectionPool>,
  sql: string,
): Promise<void> {
  // Split on GO for multi-batch SQL (predicate/policy SQL uses GO)
  const batches = sql.split(/^\s*GO\s*$/im).map((b) => b.trim()).filter((b) => b.length > 0);
  for (const batch of batches) {
    await pool.request().batch(batch);
  }
}

/**
 * Count EngagementRequest rows visible to the given pool (after setting SESSION_CONTEXT).
 * Uses a fresh request on the pool to avoid context pollution from previous tests.
 */
async function countVisibleRows(
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
  // Else: no SESSION_CONTEXT — tests the null-identity fail-closed path

  const result = await pool.request().query(
    "SELECT COUNT(*) AS cnt FROM [dbo].[EngagementRequest]"
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

  // Seed: insert a Service and an EngagementRequest via admin pool (bypasses RLS)
  const serviceResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[Service] ([name], [active], [sortOrder], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'RLS Test Service', 1, 99, SYSDATETIMEOFFSET())`
  );
  seededServiceId = serviceResult.recordset[0]?.id ?? "";

  const requestResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[EngagementRequest]
       ([firstName], [lastName], [email], [status], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'Test', N'Prospect', N'rls-test@example.com', N'pending', SYSDATETIMEOFFSET())`
  );
  seededRequestId = requestResult.recordset[0]?.id ?? "";

  // Insert join row
  await adminPool.request().query(
    `INSERT INTO [dbo].[EngagementRequestService] ([engagementRequestId], [serviceId])
     VALUES ('${seededRequestId}', '${seededServiceId}')`
  );
}, 30000);

afterAll(async () => {
  // Cleanup seeded data via admin pool (bypasses RLS)
  if (seededRequestId) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[EngagementRequest] WHERE [id] = '${seededRequestId}'`
    ).catch(() => { /* ignore */ });
  }
  if (seededServiceId) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[Service] WHERE [id] = '${seededServiceId}'`
    ).catch(() => { /* ignore */ });
  }
  await adminPool.close();
  await requestPool.close();
}, 30000);

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("sec.pol_EngagementRequest — RLS integration (HARD GATE, ADR-005 §6)", () => {
  /**
   * [POSITIVE] ACCOUNTANT reads all engagement requests.
   * Predicate branch: CAST(SESSION_CONTEXT(N'role') AS NVARCHAR(16)) = N'ACCOUNTANT'
   * Tagged: sec.pol_EngagementRequest, AC-DOOR-004-03
   */
  it("[POSITIVE] ACCOUNTANT role reads all engagement requests", async () => {
    const count = await countVisibleRows(requestPool, "user_accountant_test", "ACCOUNTANT");
    // Must see at least the seeded row
    expect(count).toBeGreaterThanOrEqual(1);
  });

  /**
   * [NEGATIVE] Null SESSION_CONTEXT reads ZERO rows — fail-closed, no error.
   * ADR-003 §5: null identity → predicate returns empty → zero rows, not an error.
   * Tagged: sec.pol_EngagementRequest
   */
  it("[NEGATIVE] Null SESSION_CONTEXT (anonymous) reads ZERO rows — fail-closed, no error", async () => {
    const count = await countVisibleRows(requestPool, null, null);
    expect(count).toBe(0);
  });

  /**
   * [NEGATIVE] CLIENT role reads ZERO rows via request pool.
   * Epic-003 will extend the predicate; for now no CLIENT rows are accessible.
   * Tagged: sec.pol_EngagementRequest
   */
  it("[NEGATIVE] CLIENT role reads ZERO rows (no client ownership at this stage)", async () => {
    const count = await countVisibleRows(requestPool, "user_client_test", "CLIENT");
    expect(count).toBe(0);
  });

  /**
   * [POSITIVE] Admin pool (connected as sa / app_admin_role-member) reads all rows — RLS-exempt.
   * IS_MEMBER('app_admin_role') = 1 → predicate passes unconditionally.
   * Verifies the seeded row exists with status='pending' (AC-DOOR-004-03).
   * Tagged: sec.pol_EngagementRequest
   */
  it("[POSITIVE] Admin pool (app_admin_role) reads all rows — RLS-exempt, status=pending", async () => {
    const rows = await queryAs(
      adminPool,
      `SELECT [id], [status], [email] FROM [dbo].[EngagementRequest]
       WHERE [id] = '${seededRequestId}'`
    );
    expect(rows).toHaveLength(1);
    expect((rows[0] as { status?: string })?.status).toBe("pending"); // AC-DOOR-004-03
    expect((rows[0] as { email?: string })?.email).toBe("rls-test@example.com");
  });
});
