/**
 * packages/db/src/document.client-isolation.rls.test.ts
 *
 * TIER-3 INTEGRATION TEST — requires real SQL Server (ADR-005 §6, HARD GATE)
 * Tests the sec.pol_Document security policy — the THIRD client-owned-rows policy.
 *
 * This is the load-bearing isolation test for EPIC-007 / TASK-007-003.
 * Per ADR-005 §6, a CLIENT-A-cannot-read-CLIENT-B test is a HARD requirement for every
 * new security policy that introduces client-owned rows.
 *
 * ADR-005 §6 minimum coverage per policy (all present below + extra cases):
 *   [AC-FILE-001-05][NEGATIVE]  Document in engagement A unreadable from engagement B (CLIENT-B reads ZERO)
 *   [AC-FILE-003-02][POSITIVE]  CLIENT reads own engagement's documents (authorization check at data layer)
 *   [ADR-005][NEGATIVE]         Anonymous / null SESSION_CONTEXT reads ZERO documents (fail-closed)
 *   [ADR-005][POSITIVE]         ACCOUNTANT role reads all documents (both clients' rows)
 *   [ADR-005][NEGATIVE]         CLIENT cannot UPDATE another client's document — BLOCK predicate
 *                               → rowsAffected = 0; admin read-back confirms no mutation
 *
 * Gate Authoring Evidence (ENGINE.md § Gate Authoring Rules — INTRODUCES-GATE: yes):
 *   1. Run marker: this file at packages/db/src/document.client-isolation.rls.test.ts;
 *      test names (exact):
 *        "[AC-FILE-001-05] Document in engagement A unreadable from engagement B — CLIENT-B reads ZERO (ADR-005 HARD)"
 *        "[AC-FILE-003-02] CLIENT reads own engagement's Documents — positive (authorization gate at data layer)"
 *        "[ADR-005] anonymous / null SESSION_CONTEXT reads ZERO Documents — fail-closed"
 *        "[ADR-005] ACCOUNTANT reads all Documents — both CLIENT-A and CLIENT-B rows"
 *        "[ADR-005] CLIENT cannot UPDATE another client's Document — BLOCK predicate silent suppress"
 *      Actual output recorded in TASK-007-003 Work Log.
 *   2. Named code path: sec.fn_document_access in db/policies/0007-document-policy.sql —
 *      specifically the FILTER PREDICATE on dbo.Document (STATE = ON, SCHEMABINDING = ON)
 *      and the BLOCK PREDICATE BEFORE UPDATE on dbo.Document. The CLIENT-ownership branch:
 *        OR EXISTS (
 *          SELECT 1 FROM [dbo].[User] u
 *          JOIN [dbo].[Engagement] e ON e.[clientUserId] = u.[id]
 *          WHERE u.[clerkId] = CAST(SESSION_CONTEXT(N'clerk_user_id') AS NVARCHAR(64))
 *            AND e.[id] = @documentEngagementId
 *        )
 *   3. Counterfactual: removing the CLIENT-ownership EXISTS branch from fn_document_access
 *      would cause "[AC-FILE-003-02] CLIENT reads own engagement's Documents — positive" to
 *      return 0 rows instead of 1, failing that test. Alternatively, removing the FILTER PREDICATE
 *      entirely would cause "[AC-FILE-001-05] Document in engagement A unreadable from engagement B"
 *      to return 1 row (CLIENT-B would see CLIENT-A's document), failing the isolation test.
 *      Both counterfactuals were verified by temporary local edit and restore (see Work Log).
 *
 * ADR-003 Amendment 1: SESSION_CONTEXT keys set WITHOUT @read_only (writable keys).
 * No @read_only is introduced anywhere in this test.
 *
 * Connection approach:
 *   Uses raw mssql (not Prisma) for pool setup/control. Rationale: same as TASK-005-001
 *   (Prisma 5.22.0 sqlserver connector cannot parse port in authority URL form — P1013).
 *   SESSION_CONTEXT is set in the same batch as the SELECT/UPDATE to ensure it is active
 *   when the predicate evaluates it.
 *
 * Environment:
 *   DATABASE_URL_ADMIN — admin pool URL (taxportal_admin; IS_MEMBER('app_admin_role')=1 → RLS-exempt)
 *   DATABASE_URL       — request pool URL (taxportal_user; subject to RLS)
 *
 * Tagged AC IDs:
 *   AC-FILE-001-05 — A file in engagement A is NOT exposed to other engagements.
 *                    This test proves the isolation at the data layer via the RLS FILTER predicate.
 *   AC-FILE-003-02 — Retrieval requires an authorization check.
 *                    The RLS FILTER predicate IS that check — this test verifies it gates reads.
 *   ADR-005 §6     — Hard requirement: CLIENT-A-cannot-read-CLIENT-B integration test for every
 *                    new client-owned-rows security policy (THIRD policy — after 0005/0006).
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

/** Two test users for CLIENT-A and CLIENT-B isolation testing. */
let clientAUserId: string;
let clientBUserId: string;
/** Engagements owned by CLIENT-A and CLIENT-B. */
let clientAEngagementId: string;
let clientBEngagementId: string;
/** EngagementRequests needed for the 1:1 FK on Engagement. */
let clientARequestId: string;
let clientBRequestId: string;
/** CLIENT-A's Document row. */
let clientADocumentId: string;
/** CLIENT-B's Document row. */
let clientBDocumentId: string;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Attempt to UPDATE a Document's status via the request pool with a given identity.
 * Returns { rowsAffected, currentStatus } — used to verify BLOCK predicate behavior.
 *
 * SQL Server BLOCK predicate for BEFORE UPDATE:
 *   Predicate empty → UPDATE silently suppressed → @@ROWCOUNT = 0, no error.
 *   Predicate passes → UPDATE proceeds → @@ROWCOUNT = 1.
 */
async function attemptDocumentStatusUpdate(
  documentId: string,
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
    UPDATE [dbo].[Document]
    SET [status] = '${newStatus.replace(/'/g, "''")}',
        [updatedAt] = SYSDATETIMEOFFSET()
    WHERE [id] = '${documentId}';
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
    `SELECT [status] FROM [dbo].[Document] WHERE [id] = '${documentId}'`
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
     VALUES (N'doc_rls_client_a', N'doc-rls-client-a@example.com', N'CLIENT', SYSDATETIMEOFFSET())`
  );
  clientAUserId = userAResult.recordset[0]?.id ?? "";

  const userBResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[User] ([clerkId], [email], [role], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'doc_rls_client_b', N'doc-rls-client-b@example.com', N'CLIENT', SYSDATETIMEOFFSET())`
  );
  clientBUserId = userBResult.recordset[0]?.id ?? "";

  // Seed: two EngagementRequest rows (needed for the 1:1 FK on Engagement)
  const reqAResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[EngagementRequest] ([firstName], [lastName], [email], [status], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'DocRLS', N'ClientA', N'doc-rls-req-a@example.com', N'accepted', SYSDATETIMEOFFSET())`
  );
  clientARequestId = reqAResult.recordset[0]?.id ?? "";

  const reqBResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[EngagementRequest] ([firstName], [lastName], [email], [status], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'DocRLS', N'ClientB', N'doc-rls-req-b@example.com', N'accepted', SYSDATETIMEOFFSET())`
  );
  clientBRequestId = reqBResult.recordset[0]?.id ?? "";

  // Seed: two Engagement rows via admin pool (bypasses BLOCK predicate — IS_MEMBER admin branch)
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

  // Seed: Document rows for CLIENT-A and CLIENT-B (admin pool bypasses BLOCK)
  // BLOCK predicate allows admin pool (IS_MEMBER('app_admin_role')=1) to insert.
  const docAResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[Document]
       ([engagementId], [storageKey], [originalFilename], [contentType], [sizeBytes],
        [status], [version], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (
       '${clientAEngagementId}',
       N'engagements/${clientAEngagementId}/documents/dummy-id/v1/test-doc-a.pdf',
       N'test-doc-a.pdf',
       N'application/pdf',
       12345,
       N'pending',
       1,
       SYSDATETIMEOFFSET()
     )`
  );
  clientADocumentId = docAResult.recordset[0]?.id ?? "";

  const docBResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[Document]
       ([engagementId], [storageKey], [originalFilename], [contentType], [sizeBytes],
        [status], [version], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (
       '${clientBEngagementId}',
       N'engagements/${clientBEngagementId}/documents/dummy-id/v1/test-doc-b.pdf',
       N'test-doc-b.pdf',
       N'application/pdf',
       67890,
       N'pending',
       1,
       SYSDATETIMEOFFSET()
     )`
  );
  clientBDocumentId = docBResult.recordset[0]?.id ?? "";
}, 30000);

afterAll(async () => {
  // Cleanup via admin pool (bypasses RLS BLOCK predicates) — reverse dependency order
  if (clientADocumentId) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[Document] WHERE [id] = '${clientADocumentId}'`
    ).catch(() => { /* ignore */ });
  }
  if (clientBDocumentId) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[Document] WHERE [id] = '${clientBDocumentId}'`
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

describe("sec.pol_Document — client-isolation RLS (HARD GATE, ADR-005 §6, EPIC-007 THIRD client-owned rows)", () => {

  /**
   * [AC-FILE-001-05][NEGATIVE] Document in engagement A unreadable from engagement B.
   * This is the CLIENT-A-cannot-read-CLIENT-B test (ADR-005 §6 HARD requirement).
   * CLIENT-B's SESSION_CONTEXT → fn_document_access EXISTS checks
   *   User(clerkId='doc_rls_client_b').id = clientBUserId ≠ clientAEngagementId's clientUserId
   * → EXISTS empty → predicate empty → FILTER removes row → 0 rows.
   */
  it("[AC-FILE-001-05] Document in engagement A unreadable from engagement B — CLIENT-B reads ZERO (ADR-005 HARD)", async () => {
    const result = await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = N'doc_rls_client_b', @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = N'CLIENT', @read_only = 0;
       SELECT [id] FROM [dbo].[Document]
       WHERE [engagementId] = '${clientAEngagementId}';`
    );

    const recordsets = result.recordsets as Array<Array<{ id?: string }>>;
    const selectRecordset = recordsets[recordsets.length - 1];

    // Clear context
    await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = NULL, @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = NULL, @read_only = 0;`
    );

    // CLIENT-B MUST NOT see CLIENT-A's documents (cross-engagement isolation — ADR-005 §6 HARD)
    expect(selectRecordset).toHaveLength(0);
  });

  /**
   * [AC-FILE-003-02][POSITIVE] CLIENT reads own engagement's Documents.
   * Named code path: fn_document_access CLIENT-ownership EXISTS branch.
   * CLIENT-A's SESSION_CONTEXT → fn_document_access EXISTS branch
   *   (clerkId='doc_rls_client_a' → User.id = clientAUserId → Engagement.id = clientAEngagementId)
   * → 1 row returned (CLIENT-A sees their own document).
   *
   * This is the data-layer authorization gate: the FILTER predicate IS the authorization check.
   */
  it("[AC-FILE-003-02] CLIENT reads own engagement's Documents — positive (authorization gate at data layer)", async () => {
    const result = await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = N'doc_rls_client_a', @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = N'CLIENT', @read_only = 0;
       SELECT [id], [originalFilename] FROM [dbo].[Document]
       WHERE [engagementId] = '${clientAEngagementId}';`
    );

    const recordsets = result.recordsets as Array<Array<{ id?: string; originalFilename?: string }>>;
    const selectRecordset = recordsets[recordsets.length - 1];

    // Clear context
    await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = NULL, @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = NULL, @read_only = 0;`
    );

    // CLIENT-A MUST see exactly their own document (EXISTS branch passes for matching engagement)
    expect(selectRecordset).toHaveLength(1);
    expect(selectRecordset?.[0]?.id).toBe(clientADocumentId);
    expect(selectRecordset?.[0]?.originalFilename).toBe("test-doc-a.pdf");
  });

  /**
   * [ADR-005][NEGATIVE] Null SESSION_CONTEXT reads ZERO rows — fail-closed, no error.
   * ADR-003 §5: null identity → all three branches fail → predicate empty → 0 rows.
   * Both CLIENT-A and CLIENT-B documents should be invisible.
   */
  it("[ADR-005] anonymous / null SESSION_CONTEXT reads ZERO Documents — fail-closed", async () => {
    // Count without setting any SESSION_CONTEXT (anonymous path)
    const result = await requestPool.request().query(
      `SELECT COUNT(*) AS cnt FROM [dbo].[Document]
       WHERE [id] IN ('${clientADocumentId}', '${clientBDocumentId}')`
    );

    const cnt = (result.recordset as Array<{ cnt?: number }>)[0]?.cnt ?? -1;
    // Null SESSION_CONTEXT → predicate empty → FILTER removes all rows → 0 rows (fail-closed)
    expect(cnt).toBe(0);
  });

  /**
   * [ADR-005][POSITIVE] ACCOUNTANT role reads all Documents.
   * Predicate branch: CAST(SESSION_CONTEXT(N'role') AS NVARCHAR(16)) = N'ACCOUNTANT'
   * ACCOUNTANT sees both CLIENT-A and CLIENT-B document rows.
   */
  it("[ADR-005] ACCOUNTANT reads all Documents — both CLIENT-A and CLIENT-B rows", async () => {
    const result = await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = N'doc_rls_accountant', @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = N'ACCOUNTANT', @read_only = 0;
       SELECT [id] FROM [dbo].[Document]
       WHERE [id] IN ('${clientADocumentId}', '${clientBDocumentId}');`
    );

    const recordsets = result.recordsets as Array<Array<{ id?: string }>>;
    const selectRecordset = recordsets[recordsets.length - 1];

    // Clear context
    await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = NULL, @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = NULL, @read_only = 0;`
    );

    // ACCOUNTANT MUST see both document rows (ACCOUNTANT branch passes unconditionally)
    expect(selectRecordset).toHaveLength(2);
    const ids = (selectRecordset ?? []).map((r) => r.id);
    expect(ids).toContain(clientADocumentId);
    expect(ids).toContain(clientBDocumentId);
  });

  /**
   * [ADR-005][NEGATIVE] CLIENT cannot UPDATE another client's Document — BLOCK predicate.
   * CLIENT-B attempts to UPDATE CLIENT-A's document status.
   * BLOCK PREDICATE BEFORE UPDATE: fn_document_access(engagementId) evaluates CLIENT-B's
   * ownership of CLIENT-A's document → EXISTS empty → BLOCK suppresses → @@ROWCOUNT = 0.
   * Data unchanged — confirmed via admin-pool read-back.
   */
  it("[ADR-005] CLIENT cannot UPDATE another client's Document — BLOCK predicate silent suppress", async () => {
    const originalStatus = "pending";
    const mutatedStatus = "active"; // CLIENT-B tries to mark CLIENT-A's doc as active

    const result = await attemptDocumentStatusUpdate(
      clientADocumentId,
      "doc_rls_client_b",
      "CLIENT",
      mutatedStatus,
    );

    // BLOCK predicate silently returns 0 rows affected (SQL Server BEFORE UPDATE behavior)
    expect(result.rowsAffected).toBe(0);
    // Data MUST be unchanged — CLIENT-A's document is still 'pending'
    expect(result.currentStatus).toBe(originalStatus);
  });

});

// ─── Additional sanity tests ──────────────────────────────────────────────────

describe("sec.pol_Document — admin pool sanity check", () => {

  /**
   * [POSITIVE] Admin pool reads both document rows — RLS-exempt.
   * IS_MEMBER('app_admin_role') = 1 → predicate always passes.
   */
  it("[POSITIVE] Admin pool (app_admin_role) reads both seeded documents — RLS-exempt", async () => {
    const result = await adminPool.request().query<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM [dbo].[Document]
       WHERE [id] IN ('${clientADocumentId}', '${clientBDocumentId}')`
    );
    const cnt = result.recordset[0]?.cnt ?? 0;
    // Admin pool bypasses RLS → sees both
    expect(cnt).toBe(2);
  });

});

// ─── Document status CHECK constraint tests ────────────────────────────────────

describe("sec.pol_Document — status CHECK constraint (ADR-009 Track B)", () => {

  /**
   * [ADR-009][NEGATIVE] Document.status CHECK constraint rejects invalid values.
   * Track B adds: CHECK ([status] IN (N'pending', N'active', N'infected')).
   * Attempting to insert a Document with an invalid status must fail.
   */
  it("[ADR-009] Document.status CHECK constraint rejects invalid status values", async () => {
    let insertBlocked = false;

    try {
      await adminPool.request().query(
        `INSERT INTO [dbo].[Document]
           ([engagementId], [storageKey], [originalFilename], [contentType], [sizeBytes],
            [status], [version], [updatedAt])
         VALUES (
           '${clientAEngagementId}',
           N'engagements/${clientAEngagementId}/documents/dummy-id/v1/invalid-status.pdf',
           N'invalid-status.pdf',
           N'application/pdf',
           100,
           N'quarantined',
           1,
           SYSDATETIMEOFFSET()
         )`
      );
    } catch {
      // Expected: CHECK constraint violation
      insertBlocked = true;
    }

    // CHECK constraint must have rejected the invalid status value
    expect(insertBlocked).toBe(true);
  });

  /**
   * [ADR-009][POSITIVE] Document.status CHECK constraint allows valid values.
   * 'pending', 'active', and 'infected' are the three valid status values.
   */
  it("[ADR-009] Document.status CHECK constraint allows 'pending', 'active', 'infected'", async () => {
    let testDocId: string | null = null;

    // Insert with 'pending' (default — should succeed)
    const insertResult = await adminPool.request().query<{ id: string }>(
      `INSERT INTO [dbo].[Document]
         ([engagementId], [storageKey], [originalFilename], [contentType], [sizeBytes],
          [status], [version], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES (
         '${clientAEngagementId}',
         N'engagements/${clientAEngagementId}/documents/dummy-id/v1/check-test.pdf',
         N'check-test.pdf',
         N'application/pdf',
         200,
         N'pending',
         1,
         SYSDATETIMEOFFSET()
       )`
    );
    testDocId = insertResult.recordset[0]?.id ?? null;
    expect(testDocId).not.toBeNull();

    if (testDocId) {
      // Update to 'active' — must succeed
      await adminPool.request().query(
        `UPDATE [dbo].[Document] SET [status] = N'active', [updatedAt] = SYSDATETIMEOFFSET()
         WHERE [id] = '${testDocId}'`
      );

      // Update to 'infected' — must succeed
      await adminPool.request().query(
        `UPDATE [dbo].[Document] SET [status] = N'infected', [updatedAt] = SYSDATETIMEOFFSET()
         WHERE [id] = '${testDocId}'`
      );

      // Verify final state via read-back
      const verify = await adminPool.request().query<{ status: string }>(
        `SELECT [status] FROM [dbo].[Document] WHERE [id] = '${testDocId}'`
      );
      expect(verify.recordset[0]?.status).toBe("infected");

      // Cleanup
      await adminPool.request().query(
        `DELETE FROM [dbo].[Document] WHERE [id] = '${testDocId}'`
      );
    }
  });

});
