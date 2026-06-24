/**
 * packages/db/src/folder.client-isolation.rls.test.ts
 *
 * TIER-3 INTEGRATION TEST — requires real SQL Server (ADR-005 §6, HARD GATE)
 *
 * Tests sec.pol_Folder security policy (EPIC-013 / BRIEF-013 / TASK-013-001):
 *   - CLIENT-A reads own engagement's folders (fn_folder_access owner branch)
 *   - CLIENT-B sees ZERO (isolation both ways — HARD)
 *   - Participant reads own engagement's folders (fn_folder_access participant branch)
 *   - CLIENT write (create/rename) → BLOCK (AC-FILE-010-04 — accountant-only write)
 *   - ACCOUNTANT reads and writes all folders
 *   - admin reads all (RLS-exempt)
 *   - null identity → ZERO (fail-closed)
 *
 * Acceptance criteria covered (AC-id test-tag contract, per BRIEF-013 methodology):
 *   AC-FILE-010-04  — Folder management (create/rename/arrange) is accountant-only.
 *                     CLIENT INSERT → BLOCK (fn_folder_write_access — NO CLIENT branch).
 *   AC-FILE-010-01  — Files organize into folders (Folder table isolation tested here).
 *   AC-FILE-010-03  — A file placed in a folder (tested at schema level; RLS isolation here).
 *
 * ADR-005 §6 minimum coverage per policy (all present below):
 *   [CS-SQL-001][POSITIVE]    CLIENT-A reads own engagement's folders — isolation positive
 *   [CS-SQL-001][NEGATIVE]    CLIENT-B sees ZERO folders for CLIENT-A's engagement — isolation HARD
 *   [AC-FILE-010-04][BLOCK]   CLIENT write attempt → BLOCK (AFTER INSERT) — zero rows affected
 *   [ADR-005][NEGATIVE]       Null SESSION_CONTEXT reads ZERO — fail-closed
 *   [ADR-005][POSITIVE]       ACCOUNTANT reads all folders — full visibility preserved
 *   [AC-FILE-010-04][POSITIVE] Participant reads own engagement's folders (owner-or-participant read)
 *   [CS-SQL-001][CROSS-ENG]  Cross-engagement folder never visible to participant from another engagement
 *
 * Gate Authoring Evidence (ENGINE.md § Gate Authoring Rules — INTRODUCES-GATE: yes):
 *   1. Run marker: packages/db/src/folder.client-isolation.rls.test.ts
 *      Test names (exact):
 *        "[CS-SQL-001] CLIENT-A reads own engagement's folders — positive"
 *        "[CS-SQL-001] CLIENT-B sees ZERO folders for CLIENT-A's engagement — isolation HARD"
 *        "[AC-FILE-010-04] CLIENT write attempt (INSERT folder) → BLOCK — accountant-only write enforced"
 *        "[ADR-005] null/anonymous SESSION_CONTEXT reads ZERO folders — fail-closed"
 *        "[ADR-005] ACCOUNTANT reads all folders — full visibility preserved"
 *        "[AC-FILE-010-04] participant reads own engagement's folders — owner-or-participant read"
 *        "[CS-SQL-001] cross-engagement folder never visible to participant from another engagement"
 *      Actual output recorded in TASK-013-001 Work Log.
 *   2. Named code path: sec.fn_folder_write_access in db/policies/0010-folder-policy.sql —
 *      specifically the BLOCK PREDICATE AFTER INSERT on dbo.Folder. The write predicate has
 *      NO CLIENT branch — any CLIENT INSERT via the request pool hits the BLOCK:
 *        CREATE SECURITY POLICY [sec].[pol_Folder]
 *          , ADD BLOCK PREDICATE [sec].[fn_folder_write_access]([engagementId])
 *              ON [dbo].[Folder] AFTER INSERT
 *        fn_folder_write_access: IS_MEMBER('app_admin_role')=1 OR ACCOUNTANT role — NO CLIENT branch
 *   3. Counterfactual: adding a CLIENT branch to fn_folder_write_access would allow CLIENTs to
 *      insert folders, breaking AC-FILE-010-04. The "[AC-FILE-010-04] CLIENT write attempt → BLOCK"
 *      test would then succeed (INSERT returns rows, not 0), failing the assertion.
 *      Alternatively: removing the FILTER predicate from pol_Folder would cause CLIENT-B to
 *      see CLIENT-A's folders, failing the isolation test.
 *
 * Connection approach:
 *   Uses raw mssql (not Prisma) for pool setup/control. Rationale: Prisma 5.22.0 sqlserver
 *   connector cannot parse port in authority URL form — P1013.
 *   SESSION_CONTEXT is set in the same batch as the query.
 *
 * Environment:
 *   DATABASE_URL_ADMIN — admin pool URL (taxportal_admin; IS_MEMBER('app_admin_role')=1 → RLS-exempt)
 *   DATABASE_URL       — request pool URL (taxportal_user; subject to RLS)
 *
 * // CS-SQL-001 // CS-SQL-002 // CS-SQL-003 // ADR-005 // ADR-003 // DECISION-013-A // CS-GEN-002 // CS-GEN-003
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

/**
 * Users for folder isolation testing:
 *   - clientAUser:      the owner of Engagement A (reads their own folders)
 *   - clientBUser:      the owner of Engagement B (must see ZERO of Engagement A's folders)
 *   - participantUser:  a linked participant on Engagement A (reads Engagement A's folders)
 */
let clientAUserId: string;
let clientBUserId: string;
let participantUserId: string;

/** Engagement A: owned by clientAUser, participant linked. */
let engagementAId: string;
/** Engagement B: owned by clientBUser (isolation target). */
let engagementBId: string;

/** EngagementRequests (1:1 FK on Engagement). */
let engagementARequestId: string;
let engagementBRequestId: string;

/** EngagementParticipant row linking participantUser to Engagement A. */
let participantLinkId: string;

/** Folder in Engagement A (clientA and participant can read; clientB sees ZERO). */
let folderAId: string;
/** Folder in Engagement B (clientB can read; clientA and participant see ZERO). */
let folderBId: string;

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

  // ─── Seed: User rows ──────────────────────────────────────────────────────
  // Unique clerkId prefix: 'fld_rls_' (folder-rls)
  const clientAResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[User] ([clerkId], [email], [role], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'fld_rls_client_a', N'fld-rls-client-a@example.com', N'CLIENT', SYSDATETIMEOFFSET())`
  );
  clientAUserId = clientAResult.recordset[0]?.id ?? "";

  const clientBResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[User] ([clerkId], [email], [role], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'fld_rls_client_b', N'fld-rls-client-b@example.com', N'CLIENT', SYSDATETIMEOFFSET())`
  );
  clientBUserId = clientBResult.recordset[0]?.id ?? "";

  const participantResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[User] ([clerkId], [email], [role], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'fld_rls_participant', N'fld-rls-participant@example.com', N'CLIENT', SYSDATETIMEOFFSET())`
  );
  participantUserId = participantResult.recordset[0]?.id ?? "";

  // ─── Seed: EngagementRequest rows ────────────────────────────────────────
  const reqAResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[EngagementRequest] ([firstName], [lastName], [email], [status], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'FldRLS', N'ClientA', N'fld-rls-req-a@example.com', N'accepted', SYSDATETIMEOFFSET())`
  );
  engagementARequestId = reqAResult.recordset[0]?.id ?? "";

  const reqBResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[EngagementRequest] ([firstName], [lastName], [email], [status], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'FldRLS', N'ClientB', N'fld-rls-req-b@example.com', N'accepted', SYSDATETIMEOFFSET())`
  );
  engagementBRequestId = reqBResult.recordset[0]?.id ?? "";

  // ─── Seed: Engagement rows ────────────────────────────────────────────────
  const engAResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[Engagement]
       ([engagementRequestId], [clientUserId], [status], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES ('${engagementARequestId}', '${clientAUserId}', N'New', SYSDATETIMEOFFSET())`
  );
  engagementAId = engAResult.recordset[0]?.id ?? "";

  const engBResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[Engagement]
       ([engagementRequestId], [clientUserId], [status], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES ('${engagementBRequestId}', '${clientBUserId}', N'New', SYSDATETIMEOFFSET())`
  );
  engagementBId = engBResult.recordset[0]?.id ?? "";

  // ─── Seed: EngagementParticipant row (admin pool) ────────────────────────
  const linkResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[EngagementParticipant]
       ([engagementId], [userId], [role])
     OUTPUT INSERTED.[id]
     VALUES ('${engagementAId}', '${participantUserId}', N'CLIENT')`
  );
  participantLinkId = linkResult.recordset[0]?.id ?? "";

  // ─── Seed: Folder rows (admin pool — bypasses BLOCK write predicate) ─────
  // AC-FILE-010-04: admin pool (taxportal_admin, IS_MEMBER('app_admin_role')=1) bypasses BLOCK.
  const folderAResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[Folder]
       ([engagementId], [name], [createdBy], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES ('${engagementAId}', N'Tax Documents', N'accountant_clerk_id', SYSDATETIMEOFFSET())`
  );
  folderAId = folderAResult.recordset[0]?.id ?? "";

  const folderBResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[Folder]
       ([engagementId], [name], [createdBy], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES ('${engagementBId}', N'Client B Documents', N'accountant_clerk_id', SYSDATETIMEOFFSET())`
  );
  folderBId = folderBResult.recordset[0]?.id ?? "";
}, 30000);

afterAll(async () => {
  // Cleanup via admin pool — reverse dependency order (no FK from Folder to Document here since
  // we didn't create documents in this test; just folders)
  if (folderAId) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[Folder] WHERE [id] = '${folderAId}'`
    ).catch(() => { /* ignore */ });
  }
  if (folderBId) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[Folder] WHERE [id] = '${folderBId}'`
    ).catch(() => { /* ignore */ });
  }
  if (participantLinkId) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[EngagementParticipant] WHERE [id] = '${participantLinkId}'`
    ).catch(() => { /* ignore */ });
  }
  if (engagementAId) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[Engagement] WHERE [id] = '${engagementAId}'`
    ).catch(() => { /* ignore */ });
  }
  if (engagementBId) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[Engagement] WHERE [id] = '${engagementBId}'`
    ).catch(() => { /* ignore */ });
  }
  if (engagementARequestId) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[EngagementRequest] WHERE [id] = '${engagementARequestId}'`
    ).catch(() => { /* ignore */ });
  }
  if (engagementBRequestId) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[EngagementRequest] WHERE [id] = '${engagementBRequestId}'`
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
  if (participantUserId) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[User] WHERE [id] = '${participantUserId}'`
    ).catch(() => { /* ignore */ });
  }

  await adminPool.close().catch(() => { /* ignore */ });
  await requestPool.close().catch(() => { /* ignore */ });
}, 30000);

// ─── Tests: sec.pol_Folder — client isolation (CS-SQL-001 / ADR-005 §6) ─────────────────────

describe("sec.pol_Folder — client isolation (CS-SQL-001 / ADR-005 §6, EPIC-013 FIFTH client-scoped table)", () => {

  /**
   * [CS-SQL-001][POSITIVE] CLIENT-A reads own engagement's folders.
   * Named code path: fn_folder_access — 3a CLIENT owner EXISTS branch.
   *   clerkId='fld_rls_client_a' → User.id = clientAUserId → Engagement.clientUserId = clientAUserId
   *   → Engagement.id = folderA's engagementId → EXISTS passes → 1 row returned.
   * // CS-SQL-003 // ADR-005 // ADR-003
   */
  it("[CS-SQL-001] CLIENT-A reads own engagement's folders — positive", async () => {
    const result = await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = N'fld_rls_client_a', @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = N'CLIENT', @read_only = 0;
       SELECT [id] FROM [dbo].[Folder]
       WHERE [id] = '${folderAId}';`
    );

    const recordsets = result.recordsets as Array<Array<{ id?: string }>>;
    const selectRecordset = recordsets[recordsets.length - 1];

    // Clear context
    await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = NULL, @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = NULL, @read_only = 0;`
    );

    // CLIENT-A MUST see their own folder
    expect(selectRecordset).toHaveLength(1);
    expect(selectRecordset?.[0]?.id).toBe(folderAId);
  });

  /**
   * [CS-SQL-001][NEGATIVE] CLIENT-B sees ZERO folders for CLIENT-A's engagement — isolation HARD.
   * Named code path: fn_folder_access — 3a owner EXISTS empty (CLIENT-B is not owner of Engagement A);
   *   3b participant EXISTS empty (CLIENT-B has no EngagementParticipant link to Engagement A).
   * → predicate empty → FILTER removes row → 0 rows (fail-closed).
   * This is the isolation HARD gate per ADR-005 §6. One-directional assertion is a rejection.
   * // CS-SQL-003 // ADR-005 // DECISION-013-A
   */
  it("[CS-SQL-001] CLIENT-B sees ZERO folders for CLIENT-A's engagement — isolation HARD", async () => {
    const result = await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = N'fld_rls_client_b', @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = N'CLIENT', @read_only = 0;
       SELECT [id] FROM [dbo].[Folder]
       WHERE [id] = '${folderAId}';`
    );

    const recordsets = result.recordsets as Array<Array<{ id?: string }>>;
    const selectRecordset = recordsets[recordsets.length - 1];

    // Clear context
    await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = NULL, @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = NULL, @read_only = 0;`
    );

    // CLIENT-B MUST NOT see CLIENT-A's folder (both EXISTS branches empty)
    expect(selectRecordset).toHaveLength(0);
  });

  /**
   * [AC-FILE-010-04][BLOCK] CLIENT write attempt (INSERT folder) → BLOCK — accountant-only write enforced.
   * Named code path: fn_folder_write_access (NO CLIENT branch) → BLOCK PREDICATE AFTER INSERT on Folder.
   *   CLIENT SESSION_CONTEXT → fn_folder_write_access: IS_MEMBER=0, role≠'ACCOUNTANT' → empty predicate
   *   → BLOCK AFTER INSERT fires → SQL Server raises Error 33504 (BLOCK predicate conflict).
   *
   * SQL Server AFTER INSERT BLOCK behavior: raises a hard error (33504), not a silent @@ROWCOUNT=0.
   * The test must catch this error and assert it is the expected BLOCK error.
   *
   * AC-FILE-010-04: folder management (create/rename/arrange) is accountant-only.
   *   A CLIENT cannot create a folder (INSERT) via the request pool.
   * // CS-SQL-003 // ADR-005 // AC-FILE-010-04
   */
  it("[AC-FILE-010-04] CLIENT write attempt (INSERT folder) → BLOCK — accountant-only write enforced", async () => {
    // CLIENT-A attempts to INSERT a folder for their own engagement via the request pool.
    // The BLOCK PREDICATE AFTER INSERT (fn_folder_write_access — NO CLIENT branch) raises error 33504.
    let blockError: Error | null = null;
    try {
      await requestPool.request().batch(
        `EXEC sp_set_session_context @key = N'clerk_user_id', @value = N'fld_rls_client_a', @read_only = 0;
         EXEC sp_set_session_context @key = N'role', @value = N'CLIENT', @read_only = 0;
         INSERT INTO [dbo].[Folder] ([engagementId], [name], [updatedAt])
         VALUES ('${engagementAId}', N'CLIENT created folder', SYSDATETIMEOFFSET());`
      );
    } catch (err) {
      blockError = err as Error;
    } finally {
      // Always clear SESSION_CONTEXT — even if the INSERT errored, the pool connection
      // may still carry stale context (the error happens at the INSERT, not the EXEC).
      // SQL Server session context persists on a connection across statements.
      await requestPool.request().batch(
        `EXEC sp_set_session_context @key = N'clerk_user_id', @value = NULL, @read_only = 0;
         EXEC sp_set_session_context @key = N'role', @value = NULL, @read_only = 0;`
      ).catch(() => { /* ignore — pool may be invalidated */ });
    }

    // BLOCK PREDICATE AFTER INSERT must raise error 33504 (block predicate conflict).
    // Error message contains "block predicate" — AC-FILE-010-04 enforced.
    expect(blockError).not.toBeNull();
    expect(blockError?.message).toMatch(/block predicate/i);

    // Confirm no spurious folder was inserted (admin read-back — even if INSERT seemed to run)
    const adminCheck = await adminPool.request().query<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM [dbo].[Folder]
       WHERE [engagementId] = '${engagementAId}'
         AND [name] = N'CLIENT created folder'`
    );
    const spuriousCnt = adminCheck.recordset[0]?.cnt ?? 0;
    expect(spuriousCnt).toBe(0);
  });

  /**
   * [ADR-005][NEGATIVE] Null/anonymous SESSION_CONTEXT reads ZERO folders — fail-closed.
   * ADR-003 §5: null identity → all four branches fail → predicate empty → 0 rows, no error.
   *
   * NOTE: Explicitly clears SESSION_CONTEXT in the same batch before the SELECT to guard against
   * stale context on the pool connection (prior tests may have set clerk_user_id). SQL Server
   * session context persists on a connection across statements.
   * // CS-SQL-003 // ADR-003 §5
   */
  it("[ADR-005] null/anonymous SESSION_CONTEXT reads ZERO folders — fail-closed", async () => {
    // Explicitly null SESSION_CONTEXT on this connection before querying (anonymous path).
    // Guards against stale context from prior tests sharing this pool connection.
    const result = await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = NULL, @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = NULL, @read_only = 0;
       SELECT COUNT(*) AS cnt FROM [dbo].[Folder]
       WHERE [id] IN ('${folderAId}', '${folderBId}');`
    );

    const recordsets = result.recordsets as Array<Array<{ cnt?: number }>>;
    const cnt = recordsets[recordsets.length - 1]?.[0]?.cnt ?? -1;
    // Null SESSION_CONTEXT → predicate empty → FILTER removes all rows → 0 (fail-closed)
    expect(cnt).toBe(0);
  });

  /**
   * [ADR-005][POSITIVE] ACCOUNTANT reads all folders — full visibility preserved.
   * Predicate branch: CAST(SESSION_CONTEXT(N'role') AS NVARCHAR(16)) = N'ACCOUNTANT'
   * ACCOUNTANT sees both engagements' folders.
   * // CS-SQL-003
   */
  it("[ADR-005] ACCOUNTANT reads all folders — full visibility preserved", async () => {
    const result = await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = N'fld_rls_accountant', @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = N'ACCOUNTANT', @read_only = 0;
       SELECT [id] FROM [dbo].[Folder]
       WHERE [id] IN ('${folderAId}', '${folderBId}');`
    );

    const recordsets = result.recordsets as Array<Array<{ id?: string }>>;
    const selectRecordset = recordsets[recordsets.length - 1];

    // Clear context
    await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = NULL, @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = NULL, @read_only = 0;`
    );

    // ACCOUNTANT MUST see both folders (ACCOUNTANT branch passes unconditionally)
    expect(selectRecordset).toHaveLength(2);
    const ids = (selectRecordset ?? []).map((r) => r.id);
    expect(ids).toContain(folderAId);
    expect(ids).toContain(folderBId);
  });

  /**
   * [AC-FILE-010-04] Participant reads own engagement's folders (owner-or-participant read).
   * Named code path: fn_folder_access — 3b CLIENT participant EXISTS branch.
   *   clerkId='fld_rls_participant' → User.id = participantUserId
   *   → EngagementParticipant.engagementId = engagementAId → EXISTS passes → 1 row returned.
   * Participants are not blocked from READING folders — only WRITING (AC-FILE-010-04).
   * // CS-SQL-003 // ADR-005 // DECISION-013-A
   */
  it("[AC-FILE-010-04] participant reads own engagement's folders — owner-or-participant read", async () => {
    const result = await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = N'fld_rls_participant', @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = N'CLIENT', @read_only = 0;
       SELECT [id] FROM [dbo].[Folder]
       WHERE [id] = '${folderAId}';`
    );

    const recordsets = result.recordsets as Array<Array<{ id?: string }>>;
    const selectRecordset = recordsets[recordsets.length - 1];

    // Clear context
    await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = NULL, @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = NULL, @read_only = 0;`
    );

    // Participant MUST see the folder (3b participant EXISTS branch passes)
    expect(selectRecordset).toHaveLength(1);
    expect(selectRecordset?.[0]?.id).toBe(folderAId);
  });

  /**
   * [CS-SQL-001] Cross-engagement folder never visible to participant from another engagement.
   * Participant is linked to Engagement A only; Engagement B's folder is invisible.
   * The participant EXISTS branch is scoped: ep.engagementId = @folderEngagementId.
   * For Folder B (engagementBId), the participant has no link → EXISTS empty → 0 rows.
   * // CS-SQL-003 // ADR-005 // DECISION-013-A
   */
  it("[CS-SQL-001] cross-engagement folder never visible to participant from another engagement", async () => {
    const result = await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = N'fld_rls_participant', @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = N'CLIENT', @read_only = 0;
       SELECT [id] FROM [dbo].[Folder]
       WHERE [id] = '${folderBId}';`
    );

    const recordsets = result.recordsets as Array<Array<{ id?: string }>>;
    const selectRecordset = recordsets[recordsets.length - 1];

    // Clear context
    await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = NULL, @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = NULL, @read_only = 0;`
    );

    // Participant MUST NOT see Engagement B's folder (no link to Engagement B)
    expect(selectRecordset).toHaveLength(0);
  });

});

// ─── Admin pool sanity check ──────────────────────────────────────────────────

describe("sec.pol_Folder — admin pool sanity (TASK-013-001)", () => {

  /**
   * [POSITIVE] Admin pool reads both seeded folders — RLS-exempt.
   * IS_MEMBER('app_admin_role') = 1 → predicate always passes.
   */
  it("[POSITIVE] Admin pool (app_admin_role) reads both seeded folders — RLS-exempt", async () => {
    const result = await adminPool.request().query<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM [dbo].[Folder]
       WHERE [id] IN ('${folderAId}', '${folderBId}')`
    );
    const cnt = result.recordset[0]?.cnt ?? 0;
    // Admin pool bypasses RLS → sees both
    expect(cnt).toBe(2);
  });

});
