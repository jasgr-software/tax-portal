/**
 * packages/db/src/engagement-request.decide-boundary.rls.test.ts
 *
 * TIER-3 INTEGRATION TEST — requires real SQL Server (ADR-005 §6, ADR-012)
 * Tests the BLOCK predicate of sec.pol_EngagementRequest against the real engine —
 * specifically proves the DB-layer "only-the-accountant-decides" boundary.
 *
 * This test does NOT recreate the existing engagement_request read policy.
 * It only adds the test that proves the existing BLOCK predicates stop a CLIENT
 * from deciding (updating status on) a request — the DB layer of AC-DOOR-006-04.
 *
 * Policy under test: sec.pol_EngagementRequest (0001-engagement-request-policy.sql)
 *   BLOCK PREDICATE BEFORE UPDATE — the predicate is evaluated on the row before the update.
 *   If CLIENT/null context → predicate returns empty table → row is "invisible" to the UPDATE
 *   → UPDATE affects 0 rows (no error thrown; SQL Server behavior for BLOCK predicates is
 *   to silently suppress the write, returning @@ROWCOUNT = 0 rather than raising an error).
 *
 * DECISION: SQL Server BLOCK predicate for BEFORE UPDATE (and AFTER UPDATE) does NOT throw
 * an error — it returns 0 rows affected. The assertion is @@ROWCOUNT === 0 for blocked
 * updates and @@ROWCOUNT === 1 for permitted updates. Data is also verified via admin-pool
 * read-back to confirm no mutation occurred.
 *
 * Gate Authoring Evidence (ENGINE.md § Gate Authoring Rules — three-item evidence):
 *   NOTE: This test exercises an EXISTING gate (sec.pol_EngagementRequest with BLOCK
 *   predicates, introduced in EPIC-001). The three-item evidence is provided here because
 *   this test is the first to explicitly exercise the UPDATE BLOCK path; prior tests
 *   (engagement-request.rls.test.ts) only exercised the FILTER (read) predicate.
 *
 *   1. Run marker: this file at packages/db/src/engagement-request.decide-boundary.rls.test.ts;
 *      test names:
 *        "AC-DOOR-006-04 — [NEGATIVE] CLIENT context UPDATE returns 0 rows (BLOCK predicate — silent suppress)"
 *        "AC-DOOR-006-04 — [NEGATIVE] Null SESSION_CONTEXT UPDATE returns 0 rows (BLOCK predicate — fail-closed)"
 *        "AC-DOOR-006-04 — [POSITIVE] ACCOUNTANT context UPDATE returns 1 row (BLOCK predicate passes)"
 *      Actual output recorded in TASK-003-001 Work Log.
 *   2. Named code path: sec.fn_engagement_request_access in
 *      db/policies/0001-engagement-request-policy.sql — specifically the BLOCK PREDICATE
 *      BEFORE UPDATE on dbo.EngagementRequest. The CLIENT branch is absent from the predicate,
 *      so CLIENT SESSION_CONTEXT returns an empty table from the predicate → the BLOCK
 *      predicate marks the row as "invisible to this UPDATE" → @@ROWCOUNT = 0; data unchanged.
 *      Verified by admin-pool read-back confirming status is still 'pending' after the attempt.
 *   3. Counterfactual: if the BLOCK PREDICATE were removed from pol_EngagementRequest
 *      (or fn_engagement_request_access were changed to admit CLIENT), the CLIENT context
 *      UPDATE would affect 1 row and the data would be mutated — failing the
 *      "status still pending" assertion in the [NEGATIVE] tests.
 *
 * Tagged AC IDs:
 *   AC-DOOR-006-04 — Each request can be decided (accepted or declined) by the accountant only.
 *                    DB layer: the BLOCK predicate on EngagementRequest prevents CLIENT writes.
 *
 * Connection approach:
 *   Uses raw mssql (not Prisma) for both pools. Same workaround as other RLS tests.
 *   SESSION_CONTEXT set in a single .batch() call with the UPDATE, ensuring the context is
 *   active on the same logical connection/batch when the BLOCK predicate evaluates it.
 *
 * Environment:
 *   DATABASE_URL_ADMIN — admin pool URL (RLS-exempt)
 *   DATABASE_URL       — request pool URL (subject to RLS)
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

/** EngagementRequest seeded for the decide-boundary tests. */
let seededRequestId: string;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Attempt to UPDATE EngagementRequest.status via the request pool with a given identity.
 *
 * SQL Server BLOCK predicate behavior for UPDATE:
 *   - The predicate is evaluated on the row BEFORE/AFTER the update.
 *   - If the predicate returns empty (caller cannot "see" the row), the UPDATE is
 *     silently suppressed → @@ROWCOUNT = 0, no error thrown.
 *   - If the predicate passes (caller can see the row), the UPDATE proceeds → @@ROWCOUNT = 1.
 *
 * SESSION_CONTEXT is set in the same batch as the UPDATE to ensure it is active when
 * the BLOCK predicate evaluates SESSION_CONTEXT(N'role').
 *
 * Returns: { rowsAffected: number; currentStatus: string }
 *   rowsAffected: @@ROWCOUNT from the UPDATE statement (0 = blocked, 1 = passed)
 *   currentStatus: read back from admin pool after the attempt (unchanged = blocked)
 */
async function attemptStatusUpdate(
  pool: InstanceType<typeof ConnectionPool>,
  clerkUserId: string | null,
  role: string | null,
  newStatus: string,
): Promise<{ rowsAffected: number; currentStatus: string }> {
  const setContextSql = clerkUserId !== null && role !== null
    ? `EXEC sp_set_session_context @key = N'clerk_user_id', @value = N'${clerkUserId.replace(/'/g, "''")}', @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = N'${role.replace(/'/g, "''")}', @read_only = 0;`
    : "";
  // Include SELECT @@ROWCOUNT in the same batch to capture actual rows affected
  const sql = `${setContextSql}
    UPDATE [dbo].[EngagementRequest]
    SET [status] = '${newStatus.replace(/'/g, "''")}', [updatedAt] = SYSDATETIMEOFFSET()
    WHERE [id] = '${seededRequestId}';
    SELECT @@ROWCOUNT AS affected;`;

  const result = await pool.request().batch(sql);
  // rowsAffected is an array of rowcounts per statement; the UPDATE is the first DML stmt.
  // SELECT @@ROWCOUNT returns a recordset — use that as the definitive count.
  const firstRecordset = (result.recordsets as Array<Array<{ affected?: number }>>)[0];
  const rowsAffected = firstRecordset?.[0]?.affected ?? 0;

  // Clear SESSION_CONTEXT after the attempt (pool hygiene — ADR-003 §4)
  await pool.request().batch(
    `EXEC sp_set_session_context @key = N'clerk_user_id', @value = NULL, @read_only = 0;
     EXEC sp_set_session_context @key = N'role', @value = NULL, @read_only = 0;`
  );

  // Read-back via admin pool (RLS-exempt) to confirm whether data was mutated
  const verify = await adminPool.request().query<{ status: string }>(
    `SELECT [status] FROM [dbo].[EngagementRequest] WHERE [id] = '${seededRequestId}'`
  );
  const currentStatus = verify.recordset[0]?.status ?? "";

  return { rowsAffected, currentStatus };
}

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeAll(async () => {
  if (!ADMIN_URL) throw new Error("DATABASE_URL_ADMIN is required for RLS integration tests");
  if (!REQUEST_URL) throw new Error("DATABASE_URL is required for RLS integration tests");

  // Admin pool — connected as sa / app_admin (IS_MEMBER('app_admin_role')=1) → RLS-exempt
  const adminConfig = parseSqlServerUrl(ADMIN_URL) as import("mssql").config;
  adminPool = new ConnectionPool(adminConfig);
  await adminPool.connect();

  // Request pool — connected as app_user (IS_MEMBER('app_user_role')=1) → subject to RLS
  const requestConfig = parseSqlServerUrl(REQUEST_URL) as import("mssql").config;
  requestPool = new ConnectionPool(requestConfig);
  await requestPool.connect();

  // Seed: insert an EngagementRequest via admin pool (bypasses RLS BLOCK predicates)
  const requestResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[EngagementRequest]
       ([firstName], [lastName], [email], [status], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'DecideBoundary', N'Test', N'decide-boundary-rls@example.com', N'pending', SYSDATETIMEOFFSET())`
  );
  seededRequestId = requestResult.recordset[0]?.id ?? "";
}, 30000);

afterAll(async () => {
  // Cleanup seeded data via admin pool
  if (seededRequestId) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[EngagementRequest] WHERE [id] = '${seededRequestId}'`
    ).catch(() => { /* ignore */ });
  }
  await adminPool.close();
  await requestPool.close();
}, 30000);

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("sec.pol_EngagementRequest BLOCK predicate — decide-write-boundary (ADR-005 §6, AC-DOOR-006-04)", () => {

  /**
   * [NEGATIVE] CLIENT context: UPDATE is silently blocked by BLOCK PREDICATE (BEFORE UPDATE).
   * The CLIENT branch is absent from fn_engagement_request_access.
   * CLIENT SESSION_CONTEXT → predicate empty → BLOCK fires → @@ROWCOUNT = 0; no error thrown;
   * data unchanged (status still 'pending' — confirmed via admin-pool read-back).
   * Tagged: AC-DOOR-006-04 — DB layer: CLIENT cannot decide a request.
   */
  it("AC-DOOR-006-04 — [NEGATIVE] CLIENT context UPDATE returns 0 rows affected (BLOCK predicate — silent suppress, data unchanged)", async () => {
    const result = await attemptStatusUpdate(
      requestPool,
      "user_client_test_decide",
      "CLIENT",
      "accepted",
    );
    // BLOCK predicate silently returns 0 rows affected (no error — SQL Server UPDATE behavior)
    expect(result.rowsAffected).toBe(0);
    // Data must be unchanged — the row is still 'pending'
    expect(result.currentStatus).toBe("pending");
  });

  /**
   * [NEGATIVE] Null SESSION_CONTEXT (anonymous): UPDATE is silently blocked (fail-closed).
   * Both branches in fn_engagement_request_access fail → predicate empty → BLOCK fires.
   * Tagged: AC-DOOR-006-04 — fail-closed: anonymous cannot decide a request.
   */
  it("AC-DOOR-006-04 — [NEGATIVE] Null SESSION_CONTEXT UPDATE returns 0 rows affected (fail-closed, data unchanged)", async () => {
    const result = await attemptStatusUpdate(
      requestPool,
      null,
      null,
      "declined",
    );
    expect(result.rowsAffected).toBe(0);
    expect(result.currentStatus).toBe("pending");
  });

  /**
   * [POSITIVE] ACCOUNTANT context: UPDATE passes the BLOCK predicate → @@ROWCOUNT = 1.
   * ACCOUNTANT branch passes fn_engagement_request_access → predicate non-empty → BLOCK allows.
   * Tagged: AC-DOOR-006-04 — ACCOUNTANT can decide a request.
   *
   * Note: this test mutates the seeded row to 'awaiting_review'. The afterAll teardown
   * deletes the row, so status restoration is not needed.
   */
  it("AC-DOOR-006-04 — [POSITIVE] ACCOUNTANT context UPDATE returns 1 row affected (BLOCK predicate passes, status mutated)", async () => {
    const result = await attemptStatusUpdate(
      requestPool,
      "user_accountant_test",
      "ACCOUNTANT",
      "awaiting_review",
    );
    // BLOCK predicate passes → UPDATE affects exactly 1 row
    expect(result.rowsAffected).toBe(1);
    // Data was mutated — confirmed via admin-pool read-back
    expect(result.currentStatus).toBe("awaiting_review");
  });

});
