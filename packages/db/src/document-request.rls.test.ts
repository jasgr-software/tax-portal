/**
 * packages/db/src/document-request.rls.test.ts
 *
 * TIER-3 INTEGRATION TEST — requires real SQL Server (ADR-005 §6)
 * Tests the sec.pol_DocumentRequest security policy (PART 2 of 0007-document-policy.sql).
 *
 * DocumentRequest is ACCOUNTANT-AUTHORED but CLIENT-READABLE:
 *   - FILTER: CLIENT reads own engagement's DocumentRequests (via request pool)
 *   - BLOCK: accountant-only writes — NO CLIENT branch in fn_document_request_write_access
 *
 * This differs from QuestionnaireTemplate (0006 PART 2 — NO FILTER, admin-pool-only read).
 * Here clients READ requests via the REQUEST POOL, so a FILTER predicate is required.
 *
 * Coverage per AC/ADR:
 *   [AC-FILE-007-02?][POSITIVE]  CLIENT reads own engagement's DocumentRequests — visible
 *   [AC-FILE-007-02?][NEGATIVE]  CLIENT cannot see engagement B's DocumentRequests — ZERO
 *   [ADR-005][NEGATIVE]          Anonymous / null SESSION_CONTEXT reads ZERO requests
 *   [ADR-005][POSITIVE]          ACCOUNTANT reads all DocumentRequests
 *   [ADR-005][NEGATIVE]          CLIENT cannot INSERT a DocumentRequest — BLOCK (no CLIENT branch)
 *   [ADR-005][NEGATIVE]          CLIENT cannot UPDATE a DocumentRequest — BLOCK (no CLIENT branch)
 *
 * ADR-003 Amendment 1: SESSION_CONTEXT keys set WITHOUT @read_only (writable keys).
 *
 * Connection approach:
 *   Uses raw mssql (not Prisma). Rationale: same as other tier-3 RLS tests.
 *   SESSION_CONTEXT is set in the same batch as the query for predicate evaluation.
 *
 * Environment:
 *   DATABASE_URL_ADMIN — admin pool (IS_MEMBER('app_admin_role')=1 → RLS-exempt)
 *   DATABASE_URL       — request pool (subject to RLS)
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
/** DocumentRequest in engagement A (CLIENT-A's). */
let docRequestAId: string;
/** DocumentRequest in engagement B (CLIENT-B's). */
let docRequestBId: string;

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

  // Seed: two User rows
  const userAResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[User] ([clerkId], [email], [role], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'docreq_rls_client_a', N'docreq-rls-client-a@example.com', N'CLIENT', SYSDATETIMEOFFSET())`
  );
  clientAUserId = userAResult.recordset[0]?.id ?? "";

  const userBResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[User] ([clerkId], [email], [role], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'docreq_rls_client_b', N'docreq-rls-client-b@example.com', N'CLIENT', SYSDATETIMEOFFSET())`
  );
  clientBUserId = userBResult.recordset[0]?.id ?? "";

  // Seed: two EngagementRequest rows (1:1 FK on Engagement)
  const reqAResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[EngagementRequest] ([firstName], [lastName], [email], [status], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'DocReqRLS', N'ClientA', N'docreq-rls-req-a@example.com', N'accepted', SYSDATETIMEOFFSET())`
  );
  clientARequestId = reqAResult.recordset[0]?.id ?? "";

  const reqBResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[EngagementRequest] ([firstName], [lastName], [email], [status], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'DocReqRLS', N'ClientB', N'docreq-rls-req-b@example.com', N'accepted', SYSDATETIMEOFFSET())`
  );
  clientBRequestId = reqBResult.recordset[0]?.id ?? "";

  // Seed: two Engagement rows (admin pool — bypasses BLOCK)
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

  // Seed: DocumentRequest rows (admin pool — bypasses BLOCK write predicate)
  // Accountant creates document requests via admin pool (fn_document_request_write_access
  // allows IS_MEMBER('app_admin_role')=1 — admin branch passes).
  const drAResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[DocumentRequest]
       ([engagementId], [label], [createdBy], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES ('${clientAEngagementId}', N'Please upload your W-2 form', N'docreq_rls_accountant', SYSDATETIMEOFFSET())`
  );
  docRequestAId = drAResult.recordset[0]?.id ?? "";

  const drBResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[DocumentRequest]
       ([engagementId], [label], [createdBy], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES ('${clientBEngagementId}', N'Please upload your 1099 form', N'docreq_rls_accountant', SYSDATETIMEOFFSET())`
  );
  docRequestBId = drBResult.recordset[0]?.id ?? "";
}, 30000);

afterAll(async () => {
  // Cleanup via admin pool — reverse dependency order
  if (docRequestAId) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[DocumentRequest] WHERE [id] = '${docRequestAId}'`
    ).catch(() => { /* ignore */ });
  }
  if (docRequestBId) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[DocumentRequest] WHERE [id] = '${docRequestBId}'`
    ).catch(() => { /* ignore */ });
  }
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

describe("sec.pol_DocumentRequest — FILTER (client reads own) + BLOCK (accountant-only write)", () => {

  /**
   * [POSITIVE] CLIENT reads own engagement's DocumentRequests — FILTER allows it.
   * fn_document_request_access: CLIENT EXISTS branch (clerkId → Engagement ownership).
   * CLIENT-A sees their own engagement's requests; CLIENT-B's are invisible.
   */
  it("[AC-FILE-007-02] CLIENT reads own engagement's DocumentRequests — visible via FILTER", async () => {
    const result = await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = N'docreq_rls_client_a', @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = N'CLIENT', @read_only = 0;
       SELECT [id], [label] FROM [dbo].[DocumentRequest]
       WHERE [engagementId] = '${clientAEngagementId}';`
    );

    const recordsets = result.recordsets as Array<Array<{ id?: string; label?: string }>>;
    const selectRecordset = recordsets[recordsets.length - 1];

    // Clear context
    await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = NULL, @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = NULL, @read_only = 0;`
    );

    // CLIENT-A MUST see their own engagement's request (FILTER allows CLIENT read via EXISTS branch)
    expect(selectRecordset).toHaveLength(1);
    expect(selectRecordset?.[0]?.id).toBe(docRequestAId);
    expect(selectRecordset?.[0]?.label).toBe("Please upload your W-2 form");
  });

  /**
   * [NEGATIVE] CLIENT cannot see engagement B's DocumentRequests — cross-engagement isolation.
   * CLIENT-A reads engagement B's requests — should return ZERO (FILTER blocks).
   * fn_document_request_access: EXISTS branch checks Engagement.clientUserId = clientAUserId
   *   for engagementId = clientBEngagementId — no match → EXISTS empty → 0 rows.
   */
  it("[AC-FILE-007-02] CLIENT cannot see another engagement's DocumentRequests — ZERO rows", async () => {
    const result = await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = N'docreq_rls_client_a', @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = N'CLIENT', @read_only = 0;
       SELECT [id] FROM [dbo].[DocumentRequest]
       WHERE [engagementId] = '${clientBEngagementId}';`
    );

    const recordsets = result.recordsets as Array<Array<{ id?: string }>>;
    const selectRecordset = recordsets[recordsets.length - 1];

    // Clear context
    await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = NULL, @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = NULL, @read_only = 0;`
    );

    // CLIENT-A MUST NOT see CLIENT-B's requests (cross-engagement FILTER)
    expect(selectRecordset).toHaveLength(0);
  });

  /**
   * [NEGATIVE] Null SESSION_CONTEXT reads ZERO DocumentRequests — fail-closed.
   * ADR-003 §5: all three branches fail → FILTER removes all rows → 0 rows.
   */
  it("[ADR-005] anonymous / null SESSION_CONTEXT reads ZERO DocumentRequests — fail-closed", async () => {
    const result = await requestPool.request().query(
      `SELECT COUNT(*) AS cnt FROM [dbo].[DocumentRequest]
       WHERE [id] IN ('${docRequestAId}', '${docRequestBId}')`
    );

    const cnt = (result.recordset as Array<{ cnt?: number }>)[0]?.cnt ?? -1;
    // Null SESSION_CONTEXT → FILTER empty → 0 rows (fail-closed)
    expect(cnt).toBe(0);
  });

  /**
   * [POSITIVE] ACCOUNTANT reads all DocumentRequests — ACCOUNTANT branch passes.
   * Both CLIENT-A's and CLIENT-B's engagement requests visible to the accountant.
   */
  it("[ADR-005] ACCOUNTANT reads all DocumentRequests — both engagement A and B rows", async () => {
    const result = await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = N'docreq_rls_accountant', @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = N'ACCOUNTANT', @read_only = 0;
       SELECT [id] FROM [dbo].[DocumentRequest]
       WHERE [id] IN ('${docRequestAId}', '${docRequestBId}');`
    );

    const recordsets = result.recordsets as Array<Array<{ id?: string }>>;
    const selectRecordset = recordsets[recordsets.length - 1];

    // Clear context
    await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = NULL, @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = NULL, @read_only = 0;`
    );

    // ACCOUNTANT MUST see both requests (ACCOUNTANT branch passes unconditionally)
    expect(selectRecordset).toHaveLength(2);
    const ids = (selectRecordset ?? []).map((r) => r.id);
    expect(ids).toContain(docRequestAId);
    expect(ids).toContain(docRequestBId);
  });

  /**
   * [NEGATIVE] CLIENT cannot INSERT a DocumentRequest — BLOCK predicate (no CLIENT branch).
   * fn_document_request_write_access has NO CLIENT branch → fails closed.
   * Mirrors fn_service_write_access (0002) and fn_questionnaire_template_write_access (0006).
   * Expected: the INSERT is blocked (error 33504 or zero rows OUTPUT).
   */
  it("[ADR-005] CLIENT cannot INSERT a DocumentRequest — BLOCK predicate (no CLIENT branch)", async () => {
    let wasBlocked = false;
    let insertedId: string | null = null;

    try {
      const result = await requestPool.request().batch(
        `EXEC sp_set_session_context @key = N'clerk_user_id', @value = N'docreq_rls_client_a', @read_only = 0;
         EXEC sp_set_session_context @key = N'role', @value = N'CLIENT', @read_only = 0;
         INSERT INTO [dbo].[DocumentRequest]
           ([engagementId], [label], [updatedAt])
         OUTPUT INSERTED.[id]
         VALUES ('${clientAEngagementId}', N'Client self-inserted request', SYSDATETIMEOFFSET());`
      );

      // If no error, check if any rows were actually inserted (BLOCK predicate suppresses)
      const recordsets = result.recordsets as Array<Array<{ id?: string }>>;
      const insertRecordset = recordsets[recordsets.length - 1];
      if (insertRecordset && insertRecordset.length > 0) {
        insertedId = insertRecordset[0]?.id ?? null;
      } else {
        wasBlocked = true;
      }
    } catch {
      // BLOCK predicate AFTER INSERT raises error 33504
      wasBlocked = true;
    } finally {
      await requestPool.request().batch(
        `EXEC sp_set_session_context @key = N'clerk_user_id', @value = NULL, @read_only = 0;
         EXEC sp_set_session_context @key = N'role', @value = NULL, @read_only = 0;`
      ).catch(() => { /* ignore */ });
    }

    // Admin read-back: confirm no rogue request was inserted into engagement A
    // (there should be exactly one row — the one seeded in beforeAll)
    const verify = await adminPool.request().query<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM [dbo].[DocumentRequest]
       WHERE [engagementId] = '${clientAEngagementId}'`
    );
    const currentCount = verify.recordset[0]?.cnt ?? -1;

    // If an id was returned, clean it up (should not happen)
    if (insertedId) {
      await adminPool.request().query(
        `DELETE FROM [dbo].[DocumentRequest] WHERE [id] = '${insertedId}'`
      ).catch(() => { /* ignore */ });
    }

    // BLOCK must have fired — either error OR zero OUTPUT rows
    // AND admin read-back confirms exactly 1 row (the seeded one)
    expect(currentCount).toBe(1);
    expect(wasBlocked || insertedId === null).toBe(true);
  });

  /**
   * [NEGATIVE] CLIENT cannot UPDATE a DocumentRequest — BLOCK predicate (no CLIENT branch).
   * CLIENT-A attempts to UPDATE their own engagement's DocumentRequest label.
   * fn_document_request_write_access: NO CLIENT branch → BLOCK fires.
   *
   * SQL Server BLOCK predicate behavior for BEFORE UPDATE:
   *   Predicate empty → UPDATE is blocked. The result depends on whether the FILTER
   *   predicate also hides the row:
   *     - If FILTER hides the row too (as here — CLIENT can read their own request, but
   *       the WRITE predicate has NO CLIENT branch): SQL Server raises error 33504 for
   *       the UPDATE because the write predicate fails even though the filter allows reading.
   *   Either way (error thrown OR rowsAffected = 0), the write is blocked.
   *   Admin read-back confirms data is unchanged in either case.
   */
  it("[ADR-005] CLIENT cannot UPDATE a DocumentRequest — BLOCK predicate (no CLIENT branch)", async () => {
    let rowsAffected = 0;
    let wasBlocked = false;

    try {
      const setContextSql =
        `EXEC sp_set_session_context @key = N'clerk_user_id', @value = N'docreq_rls_client_a', @read_only = 0;
         EXEC sp_set_session_context @key = N'role', @value = N'CLIENT', @read_only = 0;`;

      const sql = `${setContextSql}
        UPDATE [dbo].[DocumentRequest]
        SET [label] = N'CLIENT mutated label',
            [updatedAt] = SYSDATETIMEOFFSET()
        WHERE [id] = '${docRequestAId}';
        SELECT @@ROWCOUNT AS affected;`;

      const result = await requestPool.request().batch(sql);
      const firstRecordset = (result.recordsets as Array<Array<{ affected?: number }>>)[0];
      rowsAffected = firstRecordset?.[0]?.affected ?? 0;
    } catch {
      // BLOCK predicate raises error 33504 — the update was blocked
      wasBlocked = true;
    } finally {
      await requestPool.request().batch(
        `EXEC sp_set_session_context @key = N'clerk_user_id', @value = NULL, @read_only = 0;
         EXEC sp_set_session_context @key = N'role', @value = NULL, @read_only = 0;`
      ).catch(() => { /* ignore */ });
    }

    // Admin read-back: confirm label is unchanged regardless of error vs suppression
    const verify = await adminPool.request().query<{ label: string }>(
      `SELECT [label] FROM [dbo].[DocumentRequest] WHERE [id] = '${docRequestAId}'`
    );
    const currentLabel = verify.recordset[0]?.label ?? "";

    // BLOCK must have fired — either error thrown OR @@ROWCOUNT = 0
    expect(wasBlocked || rowsAffected === 0).toBe(true);
    // Data MUST be unchanged — the label is still the original value
    expect(currentLabel).toBe("Please upload your W-2 form");
  });

});

// ─── Admin pool sanity ────────────────────────────────────────────────────────

describe("sec.pol_DocumentRequest — admin pool sanity check", () => {

  /**
   * [POSITIVE] Admin pool reads both seeded DocumentRequests — RLS-exempt.
   */
  it("[POSITIVE] Admin pool (app_admin_role) reads both seeded DocumentRequests — RLS-exempt", async () => {
    const result = await adminPool.request().query<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM [dbo].[DocumentRequest]
       WHERE [id] IN ('${docRequestAId}', '${docRequestBId}')`
    );
    const cnt = result.recordset[0]?.cnt ?? 0;
    // Admin pool bypasses RLS → sees both
    expect(cnt).toBe(2);
  });

});
