/**
 * packages/db/src/engagement.client-isolation.rls.test.ts
 *
 * TIER-3 INTEGRATION TEST — requires real SQL Server (ADR-005 §6, HARD GATE)
 * Tests the sec.pol_Engagement security policy — the FIRST client-owned-rows policy.
 *
 * This is the load-bearing isolation test for EPIC-005 / TASK-005-001.
 * Per ADR-005 §6, a CLIENT-A-cannot-read-CLIENT-B test is a HARD requirement for every
 * new security policy that introduces client-owned rows.
 *
 * ADR-005 §6 minimum coverage per policy (all present below):
 *   [AC-ONBD-002-04][POSITIVE]  CLIENT-A reads only their own engagement (CLIENT-A can see it)
 *   [AC-ONBD-002-04][NEGATIVE]  CLIENT-A reads CLIENT-B's engagement — returns ZERO rows
 *   [ADR-005][NEGATIVE]         Anonymous / null SESSION_CONTEXT reads ZERO engagements (fail-closed)
 *   [ADR-005][POSITIVE]         ACCOUNTANT role reads all engagements (both clients' rows)
 *   [ADR-005][NEGATIVE]         CLIENT cannot UPDATE another client's engagement — BLOCK predicate
 *                               → rowsAffected = 0; admin read-back confirms no mutation
 *
 * Gate Authoring Evidence (ENGINE.md § Gate Authoring Rules — INTRODUCES-GATE: yes):
 *   1. Run marker: this file at packages/db/src/engagement.client-isolation.rls.test.ts;
 *      test names:
 *        "[AC-ONBD-002-04] CLIENT-A reads only their own engagement — positive"
 *        "[AC-ONBD-002-04] CLIENT-B sees ZERO rows for CLIENT-A's engagement — client isolation"
 *        "[ADR-005] anonymous / null SESSION_CONTEXT reads ZERO engagements — fail-closed"
 *        "[ADR-005] ACCOUNTANT reads all engagements — both CLIENT-A and CLIENT-B rows"
 *        "[ADR-005] CLIENT cannot UPDATE another client's engagement — BLOCK predicate silent suppress"
 *      Actual output recorded in TASK-005-001 Work Log.
 *   2. Named code path: sec.fn_engagement_access in db/policies/0005-engagement-policy.sql —
 *      specifically the FILTER PREDICATE on dbo.Engagement (STATE = ON, SCHEMABINDING = ON) and
 *      the BLOCK PREDICATE BEFORE UPDATE on dbo.Engagement. The CLIENT-ownership branch:
 *        OR EXISTS (
 *          SELECT 1 FROM [dbo].[User] u
 *          JOIN [dbo].[Engagement] e ON e.[clientUserId] = u.[id]
 *          WHERE u.[clerkId] = CAST(SESSION_CONTEXT(N'clerk_user_id') AS NVARCHAR(64))
 *            AND e.[id] = @engagementId
 *        )
 *   3. Counterfactual: removing the CLIENT-ownership EXISTS branch from fn_engagement_access
 *      would cause "[AC-ONBD-002-04] CLIENT-A reads only their own engagement — positive" to
 *      return 0 rows instead of 1, failing that test. Alternatively, removing the FILTER
 *      PREDICATE entirely would cause "[ADR-005] CLIENT-B sees ZERO rows" to return rows
 *      (CLIENT-B would see CLIENT-A's engagement), failing the isolation test.
 *
 * ADR-003 Amendment 1: SESSION_CONTEXT keys set WITHOUT @read_only (writable keys).
 * No @read_only is introduced anywhere in this test.
 *
 * Connection approach:
 *   Uses raw mssql (not Prisma) for pool setup/control. Rationale: Prisma 5.22.0 sqlserver
 *   connector cannot parse port in authority URL form (P1013). The mssql driver parses both
 *   forms correctly. SESSION_CONTEXT is set in the same batch as the SELECT/UPDATE to ensure
 *   it is active when the predicate evaluates it.
 *
 * Environment:
 *   DATABASE_URL_ADMIN — admin pool URL (taxportal_admin; IS_MEMBER('app_admin_role')=1 → RLS-exempt)
 *   DATABASE_URL       — request pool URL (taxportal_app; subject to RLS)
 *
 * Tagged AC IDs:
 *   AC-ONBD-002-04 — Signed engagement letter recorded against the engagement (substrate — this
 *                    test verifies the client-isolation policy that makes the engagement visible
 *                    to the owning client only).
 *   ADR-005 §6     — Hard requirement: CLIENT-A-cannot-read-CLIENT-B integration test for every
 *                    new client-owned-rows security policy.
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

/** Two test users for CLIENT-A and CLIENT-B isolation testing. */
let clientAUserId: string;
let clientBUserId: string;
/** Engagements owned by CLIENT-A and CLIENT-B respectively. */
let clientAEngagementId: string;
let clientBEngagementId: string;
/** The EngagementRequests needed for the 1:1 FK. */
let clientARequestId: string;
let clientBRequestId: string;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Attempt to UPDATE an Engagement's status via the request pool with a given identity.
 * Returns { rowsAffected, currentStatus } — used to verify BLOCK predicate behavior.
 *
 * SQL Server BLOCK predicate for BEFORE UPDATE:
 *   Predicate empty → UPDATE silently suppressed → @@ROWCOUNT = 0, no error.
 *   Predicate passes → UPDATE proceeds → @@ROWCOUNT = 1.
 */
async function attemptStatusUpdate(
  engagementId: string,
  clerkUserId: string | null,
  role: string | null,
  newStatus: string,
): Promise<{ rowsAffected: number; currentStatus: string }> {
  const setContextSql =
    clerkUserId !== null && role !== null
      ? `EXEC sp_set_session_context @key = N'clerk_user_id', @value = N'${clerkUserId.replace(/'/g, "''")}', @read_only = 0;
         EXEC sp_set_session_context @key = N'role', @value = N'${role.replace(/'/g, "''")}', @read_only = 0;`
      : "";

  const sql = `${setContextSql}
    UPDATE [dbo].[Engagement]
    SET [status] = '${newStatus.replace(/'/g, "''")}', [updatedAt] = SYSDATETIMEOFFSET()
    WHERE [id] = '${engagementId}';
    SELECT @@ROWCOUNT AS affected;`;

  const result = await requestPool.request().batch(sql);
  const firstRecordset = (result.recordsets as Array<Array<{ affected?: number }>>)[0];
  const rowsAffected = firstRecordset?.[0]?.affected ?? 0;

  // Clear SESSION_CONTEXT after the attempt (pool hygiene)
  await requestPool.request().batch(
    `EXEC sp_set_session_context @key = N'clerk_user_id', @value = NULL, @read_only = 0;
     EXEC sp_set_session_context @key = N'role', @value = NULL, @read_only = 0;`
  );

  // Admin read-back confirms whether data was mutated (bypasses RLS, IS_MEMBER('app_admin_role')=1)
  const verify = await adminPool.request().query<{ status: string }>(
    `SELECT [status] FROM [dbo].[Engagement] WHERE [id] = '${engagementId}'`
  );
  const currentStatus = verify.recordset[0]?.status ?? "";

  return { rowsAffected, currentStatus };
}

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeAll(async () => {
  if (!ADMIN_URL) throw new Error("DATABASE_URL_ADMIN is required for RLS integration tests");
  if (!REQUEST_URL) throw new Error("DATABASE_URL is required for RLS integration tests");

  // Admin pool — IS_MEMBER('app_admin_role')=1 → RLS-exempt
  const adminConfig = parseSqlServerUrl(ADMIN_URL) as import("mssql").config;
  adminPool = new ConnectionPool(adminConfig);
  await adminPool.connect();

  // Request pool — app_user_role → subject to RLS
  const requestConfig = parseSqlServerUrl(REQUEST_URL) as import("mssql").config;
  requestPool = new ConnectionPool(requestConfig);
  await requestPool.connect();

  // Seed: two User rows (CLIENT-A and CLIENT-B) via admin pool
  const userAResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[User] ([clerkId], [email], [role], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'eng_rls_client_a', N'eng-rls-client-a@example.com', N'CLIENT', SYSDATETIMEOFFSET())`
  );
  clientAUserId = userAResult.recordset[0]?.id ?? "";

  const userBResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[User] ([clerkId], [email], [role], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'eng_rls_client_b', N'eng-rls-client-b@example.com', N'CLIENT', SYSDATETIMEOFFSET())`
  );
  clientBUserId = userBResult.recordset[0]?.id ?? "";

  // Seed: two EngagementRequest rows (needed for the 1:1 FK on Engagement)
  const reqAResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[EngagementRequest] ([firstName], [lastName], [email], [status], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'RLS', N'ClientA', N'eng-rls-req-a@example.com', N'accepted', SYSDATETIMEOFFSET())`
  );
  clientARequestId = reqAResult.recordset[0]?.id ?? "";

  const reqBResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[EngagementRequest] ([firstName], [lastName], [email], [status], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'RLS', N'ClientB', N'eng-rls-req-b@example.com', N'accepted', SYSDATETIMEOFFSET())`
  );
  clientBRequestId = reqBResult.recordset[0]?.id ?? "";

  // Seed: two Engagement rows via admin pool (bypasses BLOCK predicate — IS_MEMBER admin branch)
  // CLIENT-A owns engagementA; CLIENT-B owns engagementB
  const engAResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[Engagement]
       ([engagementRequestId], [clientUserId], [status], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES ('${clientARequestId}', '${clientAUserId}', N'New', SYSDATETIMEOFFSET())`
  );
  clientAEngagementId = engAResult.recordset[0]?.id ?? "";

  const engBResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[Engagement]
       ([engagementRequestId], [clientUserId], [status], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES ('${clientBRequestId}', '${clientBUserId}', N'New', SYSDATETIMEOFFSET())`
  );
  clientBEngagementId = engBResult.recordset[0]?.id ?? "";
}, 30000);

afterAll(async () => {
  // Cleanup via admin pool (bypasses RLS BLOCK predicates)
  if (clientAEngagementId) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[Engagement] WHERE [id] = '${clientAEngagementId}'`
    ).catch(() => { /* ignore */ });
  }
  if (clientBEngagementId) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[Engagement] WHERE [id] = '${clientBEngagementId}'`
    ).catch(() => { /* ignore */ });
  }
  if (clientARequestId) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[EngagementRequest] WHERE [id] = '${clientARequestId}'`
    ).catch(() => { /* ignore */ });
  }
  if (clientBRequestId) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[EngagementRequest] WHERE [id] = '${clientBRequestId}'`
    ).catch(() => { /* ignore */ });
  }
  if (clientAUserId) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[User] WHERE [id] = '${clientAUserId}'`
    ).catch(() => { /* ignore */ });
  }
  if (clientBUserId) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[User] WHERE [id] = '${clientBUserId}'`
    ).catch(() => { /* ignore */ });
  }
  await adminPool.close().catch(() => { /* ignore */ });
  await requestPool.close().catch(() => { /* ignore */ });
}, 30000);

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("sec.pol_Engagement — client-isolation RLS (HARD GATE, ADR-005 §6, EPIC-005 FIRST client-owned rows)", () => {

  /**
   * [AC-ONBD-002-04][POSITIVE] CLIENT-A reads their own engagement.
   * Predicate branch: CLIENT EXISTS (clerkId → User.id = Engagement.clientUserId)
   * CLIENT-A's SESSION_CONTEXT → fn_engagement_access EXISTS branch → 1 row returned.
   */
  it("[AC-ONBD-002-04] CLIENT-A reads only their own engagement — positive", async () => {
    // CLIENT-A should see exactly their own engagement (and no more in this test scope)
    // We use a targeted SELECT to verify clientAEngagementId is visible
    const result = await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = N'eng_rls_client_a', @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = N'CLIENT', @read_only = 0;
       SELECT [id] FROM [dbo].[Engagement] WHERE [id] = '${clientAEngagementId}';`
    );

    const recordsets = result.recordsets as Array<Array<{ id?: string }>>;
    const selectRecordset = recordsets[recordsets.length - 1];

    // Clear context
    await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = NULL, @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = NULL, @read_only = 0;`
    );

    // CLIENT-A MUST see their own engagement (EXISTS branch passes)
    expect(selectRecordset).toHaveLength(1);
    expect(selectRecordset?.[0]?.id).toBe(clientAEngagementId);
  });

  /**
   * [AC-ONBD-002-04][NEGATIVE] CLIENT-B reads CLIENT-A's engagement — ZERO rows.
   * This is the CLIENT-A-cannot-read-CLIENT-B test (ADR-005 §6 HARD requirement).
   * CLIENT-B's SESSION_CONTEXT → fn_engagement_access EXISTS branch checks
   * User(clerkId='eng_rls_client_b').id ≠ Engagement.clientUserId (which is CLIENT-A's id)
   * → EXISTS empty → predicate empty → FILTER removes row → 0 rows.
   */
  it("[AC-ONBD-002-04] CLIENT-B sees ZERO rows for CLIENT-A's engagement — client isolation (ADR-005 HARD)", async () => {
    const result = await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = N'eng_rls_client_b', @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = N'CLIENT', @read_only = 0;
       SELECT [id] FROM [dbo].[Engagement] WHERE [id] = '${clientAEngagementId}';`
    );

    const recordsets = result.recordsets as Array<Array<{ id?: string }>>;
    const selectRecordset = recordsets[recordsets.length - 1];

    // Clear context
    await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = NULL, @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = NULL, @read_only = 0;`
    );

    // CLIENT-B MUST NOT see CLIENT-A's engagement (isolation — fail-closed for non-owner)
    expect(selectRecordset).toHaveLength(0);
  });

  /**
   * [ADR-005][NEGATIVE] Null SESSION_CONTEXT reads ZERO rows — fail-closed, no error.
   * ADR-003 §5: null identity → all three branches fail → predicate empty → 0 rows.
   * Both CLIENT-A and CLIENT-B engagements should be invisible.
   */
  it("[ADR-005] anonymous / null SESSION_CONTEXT reads ZERO engagements — fail-closed, no error", async () => {
    // Count without setting any SESSION_CONTEXT (anonymous path)
    const result = await requestPool.request().query(
      `SELECT COUNT(*) AS cnt FROM [dbo].[Engagement]
       WHERE [id] IN ('${clientAEngagementId}', '${clientBEngagementId}')`
    );

    const cnt = (result.recordset as Array<{ cnt?: number }>)[0]?.cnt ?? -1;
    // Null SESSION_CONTEXT → predicate empty → FILTER removes all rows → 0 rows (fail-closed)
    expect(cnt).toBe(0);
  });

  /**
   * [ADR-005][POSITIVE] ACCOUNTANT role reads all engagements.
   * Predicate branch: CAST(SESSION_CONTEXT(N'role') AS NVARCHAR(16)) = N'ACCOUNTANT'
   * ACCOUNTANT sees both CLIENT-A and CLIENT-B engagement rows.
   */
  it("[ADR-005] ACCOUNTANT reads all engagements — both CLIENT-A and CLIENT-B rows", async () => {
    const result = await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = N'eng_rls_accountant', @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = N'ACCOUNTANT', @read_only = 0;
       SELECT [id] FROM [dbo].[Engagement]
       WHERE [id] IN ('${clientAEngagementId}', '${clientBEngagementId}');`
    );

    const recordsets = result.recordsets as Array<Array<{ id?: string }>>;
    const selectRecordset = recordsets[recordsets.length - 1];

    // Clear context
    await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = NULL, @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = NULL, @read_only = 0;`
    );

    // ACCOUNTANT MUST see both engagements (ACCOUNTANT branch passes unconditionally)
    expect(selectRecordset).toHaveLength(2);
    const ids = (selectRecordset ?? []).map((r) => r.id);
    expect(ids).toContain(clientAEngagementId);
    expect(ids).toContain(clientBEngagementId);
  });

  /**
   * [ADR-005][NEGATIVE] CLIENT cannot UPDATE another client's engagement — BLOCK predicate.
   * CLIENT-B attempts to UPDATE CLIENT-A's engagement status.
   * BLOCK PREDICATE BEFORE UPDATE: fn_engagement_access(@engagementId) evaluates CLIENT-B's
   * ownership of CLIENT-A's engagement → EXISTS empty → BLOCK suppresses → @@ROWCOUNT = 0.
   * Data unchanged — confirmed via admin-pool read-back.
   *
   * This is the write-boundary test (mirrors the decide-boundary pattern from 0001).
   */
  it("[ADR-005] CLIENT cannot UPDATE another client's engagement — BLOCK predicate silent suppress, data unchanged", async () => {
    const result = await attemptStatusUpdate(
      clientAEngagementId,
      "eng_rls_client_b",
      "CLIENT",
      "In Progress",
    );

    // BLOCK predicate silently returns 0 rows affected (SQL Server BEFORE UPDATE behavior)
    expect(result.rowsAffected).toBe(0);
    // Data MUST be unchanged — CLIENT-A's engagement is still 'New'
    expect(result.currentStatus).toBe("New");
  });

});

// ─── Additional countVisibleEngagements sanity tests ─────────────────────────

describe("sec.pol_Engagement — COUNT-based sanity checks", () => {

  /**
   * [POSITIVE] Admin pool reads both engagements — RLS-exempt.
   * IS_MEMBER('app_admin_role') = 1 → predicate always passes.
   */
  it("[POSITIVE] Admin pool (app_admin_role) reads both seeded engagements — RLS-exempt", async () => {
    const result = await adminPool.request().query<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM [dbo].[Engagement]
       WHERE [id] IN ('${clientAEngagementId}', '${clientBEngagementId}')`
    );
    const cnt = result.recordset[0]?.cnt ?? 0;
    // Admin pool bypasses RLS → sees both
    expect(cnt).toBe(2);
  });

});
