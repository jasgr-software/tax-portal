/**
 * packages/db/src/service.rls.test.ts
 *
 * TIER-3 INTEGRATION TEST — requires real SQL Server (ADR-005 §6, ADR-012 tier 3, HARD GATE)
 *
 * Tests the sec.pol_Service security policy after the read/write split introduced by TASK-002-001.
 * The policy has TWO predicates:
 *   - FILTER PREDICATE    → sec.fn_service_access       (reads: CLIENT allowed)
 *   - BLOCK PREDICATE ×4  → sec.fn_service_write_access (writes: CLIENT NOT allowed — fail-closed)
 *
 * ADR-005 §6 minimum coverage for this policy:
 *   [AC-DOOR-002-05][POSITIVE]  ACCOUNTANT INSERT/UPDATE/DELETE succeeds
 *   [AC-DOOR-002-05][NEGATIVE]  CLIENT INSERT rejected by block predicate (error 33504)
 *   [AC-DOOR-002-05][NEGATIVE]  CLIENT UPDATE rejected by block predicate (error 33504)
 *   [AC-DOOR-002-05][NEGATIVE]  CLIENT DELETE rejected by block predicate (error 33504)
 *   [AC-DOOR-002-05][NEGATIVE]  Null SESSION_CONTEXT write rejected (fail-closed)
 *   [AC-DOOR-002-05][POSITIVE]  CLIENT SELECT of active services returns rows (read boundary regression guard)
 *
 * Gate Authoring Evidence (ENGINE.md § Gate Authoring Rules):
 *   1. Run marker: this file (packages/db/src/service.rls.test.ts) + test names listed above
 *      + actual execution output recorded in TASK-002-001 Work Log.
 *   2. Named code path: sec.fn_service_write_access in db/policies/0002-service-readable.sql —
 *      specifically the BLOCK PREDICATEs on dbo.Service (AFTER INSERT / BEFORE UPDATE /
 *      AFTER UPDATE / BEFORE DELETE) that reference fn_service_write_access (STATE = ON,
 *      SCHEMABINDING = ON). This is the function that lacks a CLIENT branch, causing error 33504
 *      for any CLIENT or null-SESSION_CONTEXT write attempt.
 *   3. Counterfactual: adding a CLIENT branch to fn_service_write_access —
 *        OR CAST(SESSION_CONTEXT(N'role') AS NVARCHAR(16)) = N'CLIENT'
 *      — would cause all three CLIENT write tests to PASS rather than throw, failing this gate.
 *      The gate is green if and only if no CLIENT branch exists in the write predicate.
 *
 * Tagged AC IDs:
 *   AC-DOOR-002-05 — only the accountant may change the catalog; CLIENT + anonymous are rejected
 *                    at the trust boundary, not merely hidden in the UI.
 *
 * Connection approach:
 *   Uses raw mssql (not Prisma) for both pools. Rationale: Prisma 5.22.0 sqlserver connector
 *   cannot parse port in the authority URL form (P1013) nor in the semicolon-param form when
 *   the password contains special chars. The mssql driver parses both forms correctly.
 *   This is the documented workaround (see engagement-request.rls.test.ts for precedent).
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

/** Service rows inserted by this test run — cleaned up in afterAll */
const seededServiceIds: string[] = [];

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Set SESSION_CONTEXT on the request pool for a given role.
 * Uses @read_only = 0 — matching the application, which also uses @read_only = 0 per
 * ADR-003 Amendment 1 (BUG-002-003 dropped @read_only = 1 as incompatible with Prisma's
 * connection pooling — error 15664 on cross-request reuse). Tests set/clear context freely.
 */
async function setSessionContext(
  pool: InstanceType<typeof ConnectionPool>,
  clerkUserId: string | null,
  role: string | null,
): Promise<void> {
  if (clerkUserId !== null && role !== null) {
    await pool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = N'${clerkUserId.replace(/'/g, "''")}', @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = N'${role.replace(/'/g, "''")}', @read_only = 0;`
    );
  }
  // If null: do not set SESSION_CONTEXT — tests the fail-closed path
}

/**
 * Clear SESSION_CONTEXT on the request pool between cases so a stale identity never
 * leaks into the next test (test-isolation hygiene). NB: ADR-003's reset-on-release
 * pool hygiene was retired in Amendment 1 (BUG-002-003) — this clear is test-side only.
 */
async function clearSessionContext(
  pool: InstanceType<typeof ConnectionPool>,
): Promise<void> {
  await pool.request().batch(
    `EXEC sp_set_session_context @key = N'clerk_user_id', @value = NULL, @read_only = 0;
     EXEC sp_set_session_context @key = N'role', @value = NULL, @read_only = 0;`
  );
}

/**
 * Count Service rows visible to the given pool (after optionally setting SESSION_CONTEXT).
 */
async function countVisibleServiceRows(
  pool: InstanceType<typeof ConnectionPool>,
  clerkUserId: string | null,
  role: string | null,
): Promise<number> {
  await setSessionContext(pool, clerkUserId, role);
  const result = await pool.request().query(
    "SELECT COUNT(*) AS cnt FROM [dbo].[Service]"
  );
  const cnt = ((result.recordset[0] as { cnt?: number } | undefined)?.cnt) ?? 0;
  await clearSessionContext(pool);
  return cnt;
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
}, 30000);

afterAll(async () => {
  // Cleanup: delete seeded Service rows via admin pool (bypasses RLS)
  for (const id of seededServiceIds) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[Service] WHERE [id] = '${id}'`
    ).catch(() => { /* ignore — best-effort cleanup */ });
  }
  await adminPool.close().catch(() => { /* ignore */ });
  await requestPool.close().catch(() => { /* ignore */ });
}, 30000);

// ─── Tests: Write boundary (BLOCK predicates) ─────────────────────────────────

describe("sec.pol_Service — write boundary (BLOCK predicates, HARD GATE — AC-DOOR-002-05)", () => {

  /**
   * [AC-DOOR-002-05][POSITIVE] ACCOUNTANT INSERT succeeds.
   * Predicate branch: CAST(SESSION_CONTEXT(N'role') AS NVARCHAR(16)) = N'ACCOUNTANT'
   * Named code path: sec.fn_service_write_access — ACCOUNTANT branch passes the BLOCK predicate.
   */
  it("[AC-DOOR-002-05][POSITIVE] ACCOUNTANT INSERT on Service succeeds", async () => {
    await setSessionContext(requestPool, "user_accountant_test", "ACCOUNTANT");
    let id: string;
    try {
      const result = await requestPool.request().query<{ id: string }>(
        `INSERT INTO [dbo].[Service] ([name], [active], [sortOrder], [updatedAt])
         OUTPUT INSERTED.[id]
         VALUES (N'RLS Write Test — ACCOUNTANT INSERT', 1, 99, SYSDATETIMEOFFSET())`
      );
      id = result.recordset[0]?.id ?? "";
    } finally {
      await clearSessionContext(requestPool);
    }
    expect(id, "[AC-DOOR-002-05] ACCOUNTANT INSERT should succeed and return an id").toBeTruthy();
    seededServiceIds.push(id);
  });

  /**
   * [AC-DOOR-002-05][POSITIVE] ACCOUNTANT UPDATE succeeds.
   * Uses a row seeded by admin to ensure the row exists before the update.
   */
  it("[AC-DOOR-002-05][POSITIVE] ACCOUNTANT UPDATE on Service succeeds", async () => {
    // Seed a row via admin pool (bypasses RLS)
    const seedResult = await adminPool.request().query<{ id: string }>(
      `INSERT INTO [dbo].[Service] ([name], [active], [sortOrder], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES (N'RLS Write Test — ACCOUNTANT UPDATE seed', 1, 99, SYSDATETIMEOFFSET())`
    );
    const seedId = seedResult.recordset[0]?.id ?? "";
    seededServiceIds.push(seedId);

    await setSessionContext(requestPool, "user_accountant_test", "ACCOUNTANT");
    let rowsAffected: number;
    try {
      const result = await requestPool.request().query(
        `UPDATE [dbo].[Service]
         SET [name] = N'RLS Write Test — ACCOUNTANT UPDATE (updated)', [updatedAt] = SYSDATETIMEOFFSET()
         WHERE [id] = '${seedId}'`
      );
      rowsAffected = result.rowsAffected?.[0] ?? 0;
    } finally {
      await clearSessionContext(requestPool);
    }
    expect(rowsAffected, "[AC-DOOR-002-05] ACCOUNTANT UPDATE should affect 1 row").toBe(1);
  });

  /**
   * [AC-DOOR-002-05][POSITIVE] ACCOUNTANT DELETE succeeds.
   * Uses a row seeded by admin to ensure the row exists before the delete.
   */
  it("[AC-DOOR-002-05][POSITIVE] ACCOUNTANT DELETE on Service succeeds", async () => {
    // Seed a row via admin pool (bypasses RLS)
    const seedResult = await adminPool.request().query<{ id: string }>(
      `INSERT INTO [dbo].[Service] ([name], [active], [sortOrder], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES (N'RLS Write Test — ACCOUNTANT DELETE seed', 1, 99, SYSDATETIMEOFFSET())`
    );
    const seedId = seedResult.recordset[0]?.id ?? "";
    // Note: we try to delete this; if delete succeeds it won't be in DB, but push it anyway
    // so that afterAll can attempt cleanup (no-op if already deleted — caught and ignored)
    seededServiceIds.push(seedId);

    await setSessionContext(requestPool, "user_accountant_test", "ACCOUNTANT");
    let rowsAffected: number;
    try {
      const result = await requestPool.request().query(
        `DELETE FROM [dbo].[Service] WHERE [id] = '${seedId}'`
      );
      rowsAffected = result.rowsAffected?.[0] ?? 0;
    } finally {
      await clearSessionContext(requestPool);
    }
    expect(rowsAffected, "[AC-DOOR-002-05] ACCOUNTANT DELETE should affect 1 row").toBe(1);
  });

  /**
   * [AC-DOOR-002-05][NEGATIVE] CLIENT INSERT rejected by the BLOCK predicate.
   * SQL Server block predicate violation raises error 33504.
   * Named code path: sec.fn_service_write_access — NO CLIENT branch → write fails closed.
   * Counterfactual: adding a CLIENT branch would cause this test to PASS (write succeeds), failing the gate.
   */
  it("[AC-DOOR-002-05][NEGATIVE] CLIENT INSERT is rejected by sec.fn_service_write_access block predicate (error 33504)", async () => {
    await setSessionContext(requestPool, "user_client_test", "CLIENT");
    let caughtError: unknown = null;
    try {
      await requestPool.request().query(
        `INSERT INTO [dbo].[Service] ([name], [active], [sortOrder], [updatedAt])
         VALUES (N'RLS CLIENT INSERT attempt — should be blocked', 1, 99, SYSDATETIMEOFFSET())`
      );
    } catch (err) {
      caughtError = err;
    } finally {
      await clearSessionContext(requestPool);
    }
    expect(caughtError, "[AC-DOOR-002-05] CLIENT INSERT should be rejected by the block predicate").not.toBeNull();
    // SQL Server block predicate violation: error number 33504 (or surfaced via mssql as a message)
    const errMsg = String((caughtError as { message?: string })?.message ?? "");
    // The error will contain reference to the security policy violation (33504 or policy name).
    // SQL Server raises: "The attempted operation failed because the target object 'tax_portal.dbo.Service'
    // has a block predicate that conflicts with this operation."
    const errMsgLower = errMsg.toLowerCase();
    const isBlockPredicateError =
      errMsg.includes("33504") ||
      errMsgLower.includes("block predicate") ||
      errMsgLower.includes("blocked by") ||
      errMsg.includes("pol_Service") ||
      errMsgLower.includes("security policy");
    expect(
      isBlockPredicateError,
      `[AC-DOOR-002-05] Expected block predicate error (33504) but got: ${errMsg}`
    ).toBe(true);
  });

  /**
   * [AC-DOOR-002-05][NEGATIVE] CLIENT UPDATE rejected by the BLOCK predicate.
   * Seeds a row via admin, then attempts UPDATE as CLIENT — must be rejected.
   */
  it("[AC-DOOR-002-05][NEGATIVE] CLIENT UPDATE is rejected by sec.fn_service_write_access block predicate (error 33504)", async () => {
    // Seed a row via admin pool so there is something for the CLIENT to attempt to update
    const seedResult = await adminPool.request().query<{ id: string }>(
      `INSERT INTO [dbo].[Service] ([name], [active], [sortOrder], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES (N'RLS CLIENT UPDATE target — should block CLIENT', 1, 99, SYSDATETIMEOFFSET())`
    );
    const seedId = seedResult.recordset[0]?.id ?? "";
    seededServiceIds.push(seedId);

    await setSessionContext(requestPool, "user_client_test", "CLIENT");
    let caughtError: unknown = null;
    try {
      await requestPool.request().query(
        `UPDATE [dbo].[Service]
         SET [name] = N'CLIENT UPDATE attempt — should be blocked', [updatedAt] = SYSDATETIMEOFFSET()
         WHERE [id] = '${seedId}'`
      );
    } catch (err) {
      caughtError = err;
    } finally {
      await clearSessionContext(requestPool);
    }
    expect(caughtError, "[AC-DOOR-002-05] CLIENT UPDATE should be rejected by the block predicate").not.toBeNull();
    const errMsg = String((caughtError as { message?: string })?.message ?? "");
    const errMsgLower = errMsg.toLowerCase();
    const isBlockPredicateError =
      errMsg.includes("33504") ||
      errMsgLower.includes("block predicate") ||
      errMsgLower.includes("blocked by") ||
      errMsg.includes("pol_Service") ||
      errMsgLower.includes("security policy");
    expect(
      isBlockPredicateError,
      `[AC-DOOR-002-05] Expected block predicate error (33504) but got: ${errMsg}`
    ).toBe(true);
  });

  /**
   * [AC-DOOR-002-05][NEGATIVE] CLIENT DELETE rejected by the BLOCK predicate.
   * Seeds a row via admin, then attempts DELETE as CLIENT — must be rejected.
   */
  it("[AC-DOOR-002-05][NEGATIVE] CLIENT DELETE is rejected by sec.fn_service_write_access block predicate (error 33504)", async () => {
    // Seed a row via admin pool so there is something for the CLIENT to attempt to delete
    const seedResult = await adminPool.request().query<{ id: string }>(
      `INSERT INTO [dbo].[Service] ([name], [active], [sortOrder], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES (N'RLS CLIENT DELETE target — should block CLIENT', 1, 99, SYSDATETIMEOFFSET())`
    );
    const seedId = seedResult.recordset[0]?.id ?? "";
    seededServiceIds.push(seedId);

    await setSessionContext(requestPool, "user_client_test", "CLIENT");
    let caughtError: unknown = null;
    try {
      await requestPool.request().query(
        `DELETE FROM [dbo].[Service] WHERE [id] = '${seedId}'`
      );
    } catch (err) {
      caughtError = err;
    } finally {
      await clearSessionContext(requestPool);
    }
    expect(caughtError, "[AC-DOOR-002-05] CLIENT DELETE should be rejected by the block predicate").not.toBeNull();
    const errMsg = String((caughtError as { message?: string })?.message ?? "");
    const errMsgLower = errMsg.toLowerCase();
    const isBlockPredicateError =
      errMsg.includes("33504") ||
      errMsgLower.includes("block predicate") ||
      errMsgLower.includes("blocked by") ||
      errMsg.includes("pol_Service") ||
      errMsgLower.includes("security policy");
    expect(
      isBlockPredicateError,
      `[AC-DOOR-002-05] Expected block predicate error (33504) but got: ${errMsg}`
    ).toBe(true);
  });

  /**
   * [AC-DOOR-002-05][NEGATIVE] Null SESSION_CONTEXT write is rejected (fail-closed).
   * When no identity is set, fn_service_write_access returns empty → BLOCK predicate fires.
   * ADR-003 §5: null identity → both predicate branches fail → write is blocked.
   */
  it("[AC-DOOR-002-05][NEGATIVE] Null SESSION_CONTEXT INSERT is rejected — fail-closed (no identity set)", async () => {
    // Do NOT set SESSION_CONTEXT — tests the null-identity fail-closed path
    // (requestPool already cleared after previous test via clearSessionContext)
    let caughtError: unknown = null;
    try {
      await requestPool.request().query(
        `INSERT INTO [dbo].[Service] ([name], [active], [sortOrder], [updatedAt])
         VALUES (N'RLS null SESSION_CONTEXT INSERT attempt — should be blocked', 1, 99, SYSDATETIMEOFFSET())`
      );
    } catch (err) {
      caughtError = err;
    }
    expect(caughtError, "[AC-DOOR-002-05] Null SESSION_CONTEXT INSERT should be rejected (fail-closed)").not.toBeNull();
    const errMsg = String((caughtError as { message?: string })?.message ?? "");
    const errMsgLower = errMsg.toLowerCase();
    const isBlockPredicateError =
      errMsg.includes("33504") ||
      errMsgLower.includes("block predicate") ||
      errMsgLower.includes("blocked by") ||
      errMsg.includes("pol_Service") ||
      errMsgLower.includes("security policy");
    expect(
      isBlockPredicateError,
      `[AC-DOOR-002-05] Expected block predicate error (33504) for null SESSION_CONTEXT but got: ${errMsg}`
    ).toBe(true);
  });

});

// ─── Tests: Read boundary regression guard (FILTER predicate) ─────────────────

describe("sec.pol_Service — read boundary regression guard (FILTER predicate, AC-DOOR-002-05)", () => {

  /**
   * [AC-DOOR-002-05][POSITIVE] CLIENT SELECT of active services still returns rows.
   * This is the regression guard: the read boundary must be UNCHANGED by TASK-002-001.
   * The FILTER PREDICATE still references fn_service_access which still has a CLIENT branch.
   * Seeds a row via admin, then reads as CLIENT — must see it (active=1).
   *
   * Counterfactual for this test: removing the CLIENT branch from fn_service_access would cause
   * this test to FAIL (zero rows), which would be a read regression — the fix must not break
   * public service catalog reads.
   */
  it("[AC-DOOR-002-05][POSITIVE] CLIENT SELECT of active Service rows — read boundary unchanged (regression guard)", async () => {
    // Seed a Service row via admin pool
    const seedResult = await adminPool.request().query<{ id: string }>(
      `INSERT INTO [dbo].[Service] ([name], [active], [sortOrder], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES (N'RLS CLIENT READ regression guard — active service', 1, 99, SYSDATETIMEOFFSET())`
    );
    const seedId = seedResult.recordset[0]?.id ?? "";
    seededServiceIds.push(seedId);

    // Read as CLIENT — should see rows (FILTER PREDICATE allows CLIENT)
    const count = await countVisibleServiceRows(requestPool, "user_client_test", "CLIENT");
    expect(count, "[AC-DOOR-002-05] CLIENT must be able to SELECT active Service rows (read boundary unchanged)").toBeGreaterThanOrEqual(1);
  });

  /**
   * [POSITIVE] Admin pool reads all Service rows — RLS-exempt.
   * IS_MEMBER('app_admin_role') = 1 → FILTER predicate passes unconditionally.
   */
  it("[POSITIVE] Admin pool (app_admin_role) reads all Service rows — RLS-exempt", async () => {
    const count = await adminPool.request().query(
      "SELECT COUNT(*) AS cnt FROM [dbo].[Service]"
    ).then((r) => ((r.recordset[0] as { cnt?: number } | undefined)?.cnt) ?? 0);
    expect(count, "[AC-DOOR-002-05] Admin pool should see all Service rows").toBeGreaterThanOrEqual(1);
  });

  /**
   * [NEGATIVE] Null SESSION_CONTEXT SELECT returns ZERO rows — fail-closed.
   * ADR-003 §5: null identity → fn_service_access CLIENT branch fails to match → zero rows.
   * No error — just empty result set (read fail-closed is always silent, not an error).
   */
  it("[NEGATIVE] Null SESSION_CONTEXT SELECT returns ZERO Service rows — fail-closed, no error", async () => {
    const count = await countVisibleServiceRows(requestPool, null, null);
    expect(count, "[AC-DOOR-002-05] Null SESSION_CONTEXT must see ZERO Service rows (fail-closed)").toBe(0);
  });

});
