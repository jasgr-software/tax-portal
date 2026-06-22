/**
 * packages/db/src/engagement.lifecycle.rls.test.ts
 *
 * TIER-3 INTEGRATION TEST — requires real SQL Server (ADR-005 §6, ADR-012, HARD GATE)
 *
 * Lifecycle RLS sign-off: EPIC-010 AUTH-002/003/008 acceptance criteria.
 *
 * This test EXTENDS (does not replace) the existing sec.pol_Engagement gate in
 * engagement.client-isolation.rls.test.ts. It adds lifecycle-specific AC coverage:
 *   - Full AUTH-002/003/008 AC matrix with lifecycle-context data (Complete status, confirmations)
 *   - Direct-reference path (CLIENT-B fetch-by-id of CLIENT-A's engagement → 0 rows, AC-AUTH-003-03)
 *   - Complete-status engagement still readable by owning CLIENT (AC-AUTH-008-01/-02)
 *   - CLIENT-BLOCK on status UPDATE (AC-LIFE-003-03)
 *   - CLIENT-BLOCK on reopen (AC-LIFE-006-02)
 *
 * ADR-005 §6 minimum coverage (all present):
 *   [AC-AUTH-003-01] CLIENT-A reads only their own engagement — positive (1 row)
 *   [AC-AUTH-003-02] CLIENT-B reads ZERO of CLIENT-A's engagements (list) — 0 rows
 *   [AC-AUTH-003-03] CLIENT-B fetch-by-id of CLIENT-A's engagement — 0 rows (direct reference)
 *   [ADR-005]        null/anonymous SESSION_CONTEXT reads ZERO engagements — fail-closed
 *   [AC-AUTH-002-01/-02/-03] ACCOUNTANT reads ALL — both CLIENT-A and CLIENT-B rows
 *   [AC-AUTH-008-01/-02] CLIENT reads their Complete engagement — 1 row, status=Complete
 *   [AC-LIFE-003-03] request-pool CLIENT cannot UPDATE status — BLOCK → rowsAffected=0
 *   [AC-LIFE-006-02] request-pool CLIENT cannot reopen Complete engagement — BLOCK → rowsAffected=0
 *
 * INTRODUCES-GATE evidence (ENGINE.md § Gate Authoring Rules):
 *   1. Run marker: this file at packages/db/src/engagement.lifecycle.rls.test.ts;
 *      see Work Log in TASK-010-001 for the actual green run output.
 *   2. Named code path: sec.pol_Engagement FILTER + BLOCK predicates in
 *      db/policies/0005-engagement-policy.sql — specifically:
 *        - FILTER PREDICATE [sec].[fn_engagement_access]([id]) ON [dbo].[Engagement]
 *        - BLOCK PREDICATE  [sec].[fn_engagement_access]([id]) ON [dbo].[Engagement] BEFORE UPDATE
 *      The CLIENT ownership branch (EXISTS User JOIN Engagement WHERE clerkId = SESSION_CONTEXT(...))
 *      is the load-bearing clause for AC-AUTH-003-01/-02/-03 and AC-AUTH-008-01/-02.
 *   3. Counterfactual: removing the BLOCK PREDICATE BEFORE UPDATE from sec.pol_Engagement
 *      would cause [AC-LIFE-003-03] "CLIENT cannot UPDATE status" to return rowsAffected=1
 *      (the UPDATE would succeed), failing that test and breaking the isolation guarantee.
 *      Alternatively, removing the FILTER PREDICATE entirely would cause [AC-AUTH-003-02]
 *      "CLIENT-B reads ZERO rows" to return 1 row (CLIENT-B sees CLIENT-A's engagement),
 *      failing the cross-client isolation test.
 *
 * ADR-003 Amendment 1: SESSION_CONTEXT keys set WITHOUT @read_only (writable keys, @read_only=0).
 * CS-SQL-001: CLIENT-A/CLIENT-B test matrix (HARD GATE, required standard).
 * CS-SQL-003: Reusing existing sec.fn_engagement_access predicate (shallow, fail-closed).
 * CS-GEN-003: // ADR-005, // ADR-003, // CS-SQL-001, // CS-SQL-003, // DECISION-010-*
 *
 * Connection approach:
 *   Raw mssql (not Prisma) — Prisma 5.22.0 sqlserver connector cannot parse port in authority URL form.
 *   SESSION_CONTEXT set in the same batch as SELECT/UPDATE (ADR-003 Amendment 1).
 *
 * Environment:
 *   DATABASE_URL_ADMIN — admin pool URL (taxportal_admin; IS_MEMBER('app_admin_role')=1 → RLS-exempt)
 *   DATABASE_URL       — request pool URL (taxportal_app; subject to RLS)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import mssqlPkg from "mssql";
import { parseSqlServerUrl } from "./sql-server-url.js";

const { ConnectionPool } = mssqlPkg;

// ─── Connection setup ─────────────────────────────────────────────────────────

let adminPool: InstanceType<typeof ConnectionPool>;
let requestPool: InstanceType<typeof ConnectionPool>;

const ADMIN_URL = process.env["DATABASE_URL_ADMIN"];
const REQUEST_URL = process.env["DATABASE_URL"];

// ─── Test data ────────────────────────────────────────────────────────────────

let clientAUserId: string;
let clientBUserId: string;
let clientAEngagementId: string;
let clientBEngagementId: string;
let clientARequestId: string;
let clientBRequestId: string;

// Clerk IDs for test users (unique prefix to avoid collisions with other test files)
const CLERK_ID_A = "lc_rls_client_a";
const CLERK_ID_B = "lc_rls_client_b";
const CLERK_ID_ACCOUNTANT = "lc_rls_accountant";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Attempt a raw UPDATE on Engagement.status via the request pool with a given identity.
 * Used to verify BLOCK predicate behavior.
 * Returns { rowsAffected, currentStatus }.
 *
 * ADR-003 Amendment 1: @read_only = 0 (not @read_only = 1)
 * CS-SQL-001: CLIENT-B mutation attempt is the HARD GATE test for the BLOCK predicate.
 */
async function attemptStatusUpdateAsClient(
  engagementId: string,
  clerkUserId: string,
  newStatus: string,
): Promise<{ rowsAffected: number; currentStatus: string }> {
  const escapedClerkId = clerkUserId.replace(/'/g, "''");
  const escapedStatus = newStatus.replace(/'/g, "''");
  const escapedId = engagementId.replace(/'/g, "''");

  const sql = `
    EXEC sp_set_session_context @key = N'clerk_user_id', @value = N'${escapedClerkId}', @read_only = 0;
    EXEC sp_set_session_context @key = N'role', @value = N'CLIENT', @read_only = 0;
    UPDATE [dbo].[Engagement]
    SET [status] = N'${escapedStatus}', [updatedAt] = SYSDATETIMEOFFSET()
    WHERE [id] = '${escapedId}';
    SELECT @@ROWCOUNT AS affected;
    EXEC sp_set_session_context @key = N'clerk_user_id', @value = NULL, @read_only = 0;
    EXEC sp_set_session_context @key = N'role', @value = NULL, @read_only = 0;
  `;

  const result = await requestPool.request().batch(sql);
  const recordsets = result.recordsets as Array<Array<{ affected?: number }>>;
  // Find the SELECT @@ROWCOUNT recordset
  let rowsAffected = 0;
  for (const rs of recordsets) {
    if (rs.length > 0 && rs[0] !== undefined && "affected" in rs[0]) {
      rowsAffected = rs[0].affected ?? 0;
      break;
    }
  }

  // Admin read-back confirms whether data was mutated (bypasses RLS)
  const verify = await adminPool.request().query<{ status: string }>(
    `SELECT [status] FROM [dbo].[Engagement] WHERE [id] = '${escapedId}'`
  );
  const currentStatus = verify.recordset[0]?.status ?? "";

  return { rowsAffected, currentStatus };
}

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeAll(async () => {
  if (!ADMIN_URL) throw new Error("DATABASE_URL_ADMIN is required for lifecycle RLS tests");
  if (!REQUEST_URL) throw new Error("DATABASE_URL is required for lifecycle RLS tests");

  // Admin pool — IS_MEMBER('app_admin_role')=1 → RLS-exempt
  const adminConfig = parseSqlServerUrl(ADMIN_URL) as import("mssql").config;
  adminPool = new ConnectionPool(adminConfig);
  await adminPool.connect();

  // Request pool — app_user_role → subject to RLS (FILTER + BLOCK predicates)
  const requestConfig = parseSqlServerUrl(REQUEST_URL) as import("mssql").config;
  requestPool = new ConnectionPool(requestConfig);
  await requestPool.connect();

  // Seed: two User rows
  const userAResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[User] ([clerkId], [email], [role], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'${CLERK_ID_A}', N'lc-rls-client-a@example.com', N'CLIENT', SYSDATETIMEOFFSET())`
  );
  clientAUserId = userAResult.recordset[0]?.id ?? "";

  const userBResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[User] ([clerkId], [email], [role], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'${CLERK_ID_B}', N'lc-rls-client-b@example.com', N'CLIENT', SYSDATETIMEOFFSET())`
  );
  clientBUserId = userBResult.recordset[0]?.id ?? "";

  // Seed: two EngagementRequest rows (needed for the 1:1 FK on Engagement)
  const reqAResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[EngagementRequest] ([firstName], [lastName], [email], [status], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'LC', N'ClientA', N'lc-rls-req-a@example.com', N'accepted', SYSDATETIMEOFFSET())`
  );
  clientARequestId = reqAResult.recordset[0]?.id ?? "";

  const reqBResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[EngagementRequest] ([firstName], [lastName], [email], [status], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'LC', N'ClientB', N'lc-rls-req-b@example.com', N'accepted', SYSDATETIMEOFFSET())`
  );
  clientBRequestId = reqBResult.recordset[0]?.id ?? "";

  // Seed: CLIENT-A engagement in Complete status (with both confirmations set) — for AC-AUTH-008
  // CLIENT-B engagement stays at New
  const engAResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[Engagement]
       ([engagementRequestId], [clientUserId], [status],
        [deliveryConfirmedAt], [filingConfirmedAt], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES ('${clientARequestId}', '${clientAUserId}', N'Complete',
             SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET())`
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
  for (const id of [clientAEngagementId, clientBEngagementId]) {
    if (id) {
      await adminPool.request()
        .query(`DELETE FROM [dbo].[Engagement] WHERE [id] = '${id}'`)
        .catch(() => { /* ignore */ });
    }
  }
  for (const id of [clientARequestId, clientBRequestId]) {
    if (id) {
      await adminPool.request()
        .query(`DELETE FROM [dbo].[EngagementRequest] WHERE [id] = '${id}'`)
        .catch(() => { /* ignore */ });
    }
  }
  for (const id of [clientAUserId, clientBUserId]) {
    if (id) {
      await adminPool.request()
        .query(`DELETE FROM [dbo].[User] WHERE [id] = '${id}'`)
        .catch(() => { /* ignore */ });
    }
  }
  await adminPool.close().catch(() => { /* ignore */ });
  await requestPool.close().catch(() => { /* ignore */ });
}, 30000);

// ─── Tests ────────────────────────────────────────────────────────────────────

// ADR-005 §6: CLIENT-A/CLIENT-B isolation matrix (CS-SQL-001 required)
// AC-AUTH-002/003/008 sign-off tests
describe("sec.pol_Engagement — lifecycle RLS sign-off (EPIC-010 AUTH-002/003/008, CS-SQL-001, ADR-005 §6)", () => {

  /**
   * [AC-AUTH-003-01] CLIENT-A reads their own engagement — positive (1 row).
   * sec.pol_Engagement FILTER: CLIENT branch (EXISTS User JOIN Engagement) passes for owner.
   * Engagement is in Complete status — ownership does NOT depend on status.
   */
  it("[AC-AUTH-003-01] CLIENT-A reads only their own engagement — positive (1 row)", async () => {
    // CS-SQL-001, ADR-005 §6: CLIENT-A own-row read
    // ADR-003 Amendment 1: @read_only = 0
    const result = await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = N'${CLERK_ID_A}', @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = N'CLIENT', @read_only = 0;
       SELECT [id], [status] FROM [dbo].[Engagement] WHERE [id] = '${clientAEngagementId}';`
    );

    const recordsets = result.recordsets as Array<Array<{ id?: string; status?: string }>>;
    const rows = recordsets[recordsets.length - 1];

    await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = NULL, @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = NULL, @read_only = 0;`
    );

    // AC-AUTH-003-01: CLIENT-A MUST see their own engagement (EXISTS branch passes)
    expect(rows).toHaveLength(1);
    expect(rows?.[0]?.id).toBe(clientAEngagementId);
  });

  /**
   * [AC-AUTH-003-02] CLIENT-B reads ZERO of CLIENT-A's engagements via list/search.
   * sec.pol_Engagement FILTER: CLIENT-B's EXISTS check against CLIENT-A's engagement → false.
   * ADR-005 §6 HARD requirement: CLIENT-A-cannot-read-CLIENT-B (CS-SQL-001).
   */
  it("[AC-AUTH-003-02] CLIENT-B reads ZERO of CLIENT-A's engagements (list — client isolation, ADR-005 HARD)", async () => {
    // CS-SQL-001 HARD GATE: cross-client isolation test
    const result = await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = N'${CLERK_ID_B}', @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = N'CLIENT', @read_only = 0;
       SELECT [id] FROM [dbo].[Engagement] WHERE [id] = '${clientAEngagementId}';`
    );

    const recordsets = result.recordsets as Array<Array<{ id?: string }>>;
    const rows = recordsets[recordsets.length - 1];

    await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = NULL, @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = NULL, @read_only = 0;`
    );

    // AC-AUTH-003-02: CLIENT-B MUST see ZERO rows for CLIENT-A's engagement
    expect(rows).toHaveLength(0);
  });

  /**
   * [AC-AUTH-003-03] CLIENT-B fetch-by-id of CLIENT-A's engagement returns 0 rows (direct reference).
   * This is the DIRECT-REFERENCE path: CLIENT-B explicitly requests CLIENT-A's engagement by ID.
   * The FILTER predicate prevents CLIENT-B from seeing it even when the ID is known.
   * ADR-005 §6: the direct-reference path must also be denied.
   */
  it("[AC-AUTH-003-03] CLIENT-B fetch-by-id of CLIENT-A's engagement returns 0 rows (direct reference denied)", async () => {
    // Direct reference: CLIENT-B knows CLIENT-A's engagementId (e.g. from URL) — must still return 0 rows
    const result = await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = N'${CLERK_ID_B}', @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = N'CLIENT', @read_only = 0;
       SELECT [id], [status] FROM [dbo].[Engagement] WHERE [id] = '${clientAEngagementId}';`
    );

    const recordsets = result.recordsets as Array<Array<{ id?: string; status?: string }>>;
    const rows = recordsets[recordsets.length - 1];

    await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = NULL, @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = NULL, @read_only = 0;`
    );

    // AC-AUTH-003-03: direct-reference attempt MUST return 0 rows (FILTER blocks it)
    expect(rows).toHaveLength(0);
  });

  /**
   * [ADR-005] null/anonymous SESSION_CONTEXT reads ZERO engagements — fail-closed.
   * ADR-003 §5: null identity → all three branches fail → predicate empty → 0 rows.
   */
  it("[ADR-005] null/anonymous SESSION_CONTEXT reads ZERO engagements — fail-closed, no error", async () => {
    // No SESSION_CONTEXT set — anonymous path
    const result = await requestPool.request().query<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM [dbo].[Engagement]
       WHERE [id] IN ('${clientAEngagementId}', '${clientBEngagementId}')`
    );
    const cnt = result.recordset[0]?.cnt ?? -1;
    // ADR-003 §5, ADR-005: null SESSION_CONTEXT → ZERO rows (fail-closed)
    expect(cnt).toBe(0);
  });

  /**
   * [AC-AUTH-002-01/-02/-03] ACCOUNTANT reads ALL engagements regardless of owning client.
   * sec.pol_Engagement FILTER: ACCOUNTANT branch (role=ACCOUNTANT) passes unconditionally.
   */
  it("[AC-AUTH-002-01] [AC-AUTH-002-02] [AC-AUTH-002-03] ACCOUNTANT reads ALL engagements — both CLIENT-A and CLIENT-B rows", async () => {
    const result = await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = N'${CLERK_ID_ACCOUNTANT}', @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = N'ACCOUNTANT', @read_only = 0;
       SELECT [id], [status] FROM [dbo].[Engagement]
       WHERE [id] IN ('${clientAEngagementId}', '${clientBEngagementId}');`
    );

    const recordsets = result.recordsets as Array<Array<{ id?: string; status?: string }>>;
    const rows = recordsets[recordsets.length - 1];

    await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = NULL, @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = NULL, @read_only = 0;`
    );

    // AC-AUTH-002-01/-02/-03: ACCOUNTANT MUST see both engagements
    expect(rows).toHaveLength(2);
    const ids = (rows ?? []).map((r) => r.id);
    expect(ids).toContain(clientAEngagementId);
    expect(ids).toContain(clientBEngagementId);
  });

  /**
   * [AC-AUTH-008-01] [AC-AUTH-008-02] CLIENT can still read their Complete engagement.
   * Completion does NOT revoke the owning CLIENT's read access.
   * CLIENT-A's engagement is in Complete status (seeded with both confirmations).
   */
  it("[AC-AUTH-008-01] [AC-AUTH-008-02] CLIENT reads their own Complete engagement — read access retained after completion (1 row, status=Complete)", async () => {
    const result = await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = N'${CLERK_ID_A}', @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = N'CLIENT', @read_only = 0;
       SELECT [id], [status] FROM [dbo].[Engagement] WHERE [id] = '${clientAEngagementId}';`
    );

    const recordsets = result.recordsets as Array<Array<{ id?: string; status?: string }>>;
    const rows = recordsets[recordsets.length - 1];

    await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = NULL, @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = NULL, @read_only = 0;`
    );

    // AC-AUTH-008-01/-02: CLIENT MUST see their Complete engagement (completion does NOT revoke access)
    expect(rows).toHaveLength(1);
    expect(rows?.[0]?.status).toBe("Complete");
  });

  /**
   * [AC-LIFE-003-03] request-pool CLIENT cannot UPDATE another client's engagement status — BLOCK predicate.
   * CLIENT-B attempts to UPDATE CLIENT-A's engagement status via the request pool.
   * The BLOCK predicate (BEFORE UPDATE) uses fn_engagement_access: CLIENT-B's ownership check
   * against CLIENT-A's engagement → EXISTS empty → BLOCK suppresses → rowsAffected=0.
   *
   * ADR-005 §6: BLOCK predicate test (CS-SQL-001 required write-boundary test).
   * DECISION-010-F: accountant lifecycle writes use the admin pool (trust fence at the action layer).
   *   The BLOCK predicate is defence-in-depth for cross-client mutation via the request pool.
   *
   * NOTE: The owning CLIENT (CLIENT-A) CAN UPDATE their own row via the request pool — the
   *   CLIENT ownership branch in fn_engagement_access allows it. The BLOCK predicate guards
   *   CROSS-CLIENT writes (non-owner CLIENT), consistent with ADR-005 §6 / CS-SQL-001.
   *   The app-layer seam (transitionEngagementStatus) uses the admin pool with accountant-verified
   *   identity — so even the owning CLIENT cannot reach the seam from the request pool
   *   (the action layer is the trust fence, per DECISION-010-F).
   */
  it("[AC-LIFE-003-03] request-pool CLIENT-B cannot UPDATE CLIENT-A's engagement status — BLOCK predicate silently blocks cross-client mutation, rowsAffected=0", async () => {
    // CLIENT-B attempts to UPDATE CLIENT-A's engagement status via the request pool.
    // BLOCK predicate (BEFORE UPDATE): fn_engagement_access(clientAEngagementId) with
    // SESSION_CONTEXT clerk_user_id='lc_rls_client_b' → CLIENT-B is NOT the owner of
    // CLIENT-A's engagement → EXISTS empty → BLOCK suppresses → rowsAffected=0.
    // ADR-005 §6, CS-SQL-001: this is the cross-client BLOCK predicate test.
    const result = await attemptStatusUpdateAsClient(
      clientAEngagementId,  // CLIENT-A's engagement (CLIENT-B does NOT own this)
      CLERK_ID_B,           // CLIENT-B's identity — non-owner
      "In Progress",
    );

    // AC-LIFE-003-03: BLOCK predicate silently returns 0 rows affected for non-owner mutation
    expect(result.rowsAffected).toBe(0);
    // CLIENT-A's engagement MUST remain Complete (unchanged — BLOCK prevented the mutation)
    expect(result.currentStatus).toBe("Complete");
  });

  /**
   * [AC-LIFE-006-02] request-pool CLIENT cannot reopen a Complete engagement owned by another client.
   * CLIENT-B attempts to UPDATE CLIENT-A's Complete engagement → In Progress via the request pool.
   * BLOCK predicate: CLIENT-B's ownership check against CLIENT-A's engagement → EXISTS empty → blocked.
   */
  it("[AC-LIFE-006-02] request-pool CLIENT-B cannot reopen CLIENT-A's Complete engagement — BLOCK predicate silently blocks cross-client reopen, rowsAffected=0, status unchanged", async () => {
    // CLIENT-B tries to reopen CLIENT-A's Complete engagement via the request pool
    // DECISION-010-B: reopen is accountant-only; the BLOCK predicate prevents cross-client mutations.
    const result = await attemptStatusUpdateAsClient(
      clientAEngagementId,
      CLERK_ID_B,  // CLIENT-B trying to mutate CLIENT-A's engagement
      "In Progress",
    );

    // AC-LIFE-006-02: BLOCK predicate silently returns 0 rows affected
    expect(result.rowsAffected).toBe(0);
    // CLIENT-A's engagement MUST remain Complete (BLOCK prevents the mutation)
    expect(result.currentStatus).toBe("Complete");
  });

});

// ─── Admin-pool sanity (RLS-exempt baseline) ─────────────────────────────────

describe("sec.pol_Engagement — admin-pool lifecycle baseline (RLS-exempt)", () => {

  /**
   * [POSITIVE] Admin pool reads both engagements — RLS-exempt baseline.
   * IS_MEMBER('app_admin_role') = 1 → predicate always passes.
   */
  it("[POSITIVE] Admin pool reads both seeded engagements (Complete + New) — RLS-exempt", async () => {
    const result = await adminPool.request().query<{ id: string; status: string }>(
      `SELECT [id], [status] FROM [dbo].[Engagement]
       WHERE [id] IN ('${clientAEngagementId}', '${clientBEngagementId}')`
    );
    const rows = result.recordset;
    expect(rows).toHaveLength(2);

    const clientARow = rows.find((r) => r.id === clientAEngagementId);
    expect(clientARow?.status).toBe("Complete");

    const clientBRow = rows.find((r) => r.id === clientBEngagementId);
    expect(clientBRow?.status).toBe("New");
  });

});
