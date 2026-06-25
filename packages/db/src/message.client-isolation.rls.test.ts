/**
 * packages/db/src/message.client-isolation.rls.test.ts
 *
 * TIER-3 INTEGRATION TEST — requires real SQL Server (ADR-005 §6, HARD GATE)
 *
 * Tests the sec.pol_Message security policy (BRIEF-017 / TASK-017-001).
 * CS-SQL-001: HARD requirement — CLIENT-A-cannot-read-CLIENT-B isolation test for every
 *   new client-owned-rows security policy. Both-ways isolation is mandatory (SDET trap).
 *
 * Acceptance criteria covered:
 *   AC-MSG-002-02 — messages visible only to thread participants (policy substrate)
 *
 * Coverage matrix per ADR-005 §6 (HARD requirement — BOTH WAYS):
 *   [POSITIVE]  engagement-thread participant reads messages in the thread
 *   [NEGATIVE]  non-participant CLIENT reads ZERO — isolation (ADR-005 HARD)
 *   [NEGATIVE]  null SESSION_CONTEXT reads ZERO — fail-closed (ADR-003 §5)
 *   [POSITIVE]  ACCOUNTANT reads all messages
 *   [POSITIVE]  general-thread: associated client reads their thread's messages
 *   [NEGATIVE]  general-thread: unrelated client reads ZERO
 *
 * Gate Authoring Evidence (ENGINE.md § Gate Authoring Rules — introduces_gate: yes):
 *   1. Run marker: packages/db/src/message.client-isolation.rls.test.ts (this file).
 *      Specific test names (exact):
 *        "[AC-MSG-002-02][POSITIVE] engagement-thread participant reads messages in thread"
 *        "[AC-MSG-002-02][NEGATIVE] non-participant CLIENT reads ZERO — isolation HARD"
 *        "[ADR-005][NEGATIVE] null SESSION_CONTEXT reads ZERO — fail-closed"
 *        "[ADR-005][POSITIVE] ACCOUNTANT reads all messages"
 *        "[AC-MSG-002-02][POSITIVE] general-thread: associated client reads messages"
 *        "[AC-MSG-002-02][NEGATIVE] general-thread: unrelated client reads ZERO"
 *      Actual output recorded in TASK-017-001 Work Log.
 *   2. Named code path: sec.fn_message_access in db/policies/0015-message-policy.sql.
 *      The FILTER PREDICATE on dbo.Message (STATE = ON, SCHEMABINDING = ON).
 *      Specifically the 3a-owner EXISTS branch:
 *        OR EXISTS (SELECT 1 FROM [dbo].[Thread] t
 *          JOIN [dbo].[Engagement] e ON e.[id] = t.[engagementId]
 *          JOIN [dbo].[User] u ON u.[id] = e.[clientUserId]
 *          WHERE t.[id] = @messageThreadId
 *            AND u.[clerkId] = CAST(SESSION_CONTEXT(N'clerk_user_id') AS NVARCHAR(64)))
 *   3. Counterfactual: removing the FILTER PREDICATE from pol_Message (or removing all CLIENT
 *      EXISTS branches from fn_message_access) would cause the negative isolation tests to fail:
 *      the non-participant client would read 1 row instead of 0.
 *      Removing branch 3a-owner causes the positive owner test to return 0 rows.
 *      Removing branch 3b causes the general-thread positive test to return 0 rows.
 *
 * Connection approach:
 *   Uses raw mssql (not Prisma). SESSION_CONTEXT set in same batch as SELECT.
 *
 * // CS-SQL-001 // CS-SQL-002 // CS-SQL-003 // CS-GEN-002 // CS-GEN-003
 * // ADR-005 // ADR-003 // ADR-002 // DECISION-017-A
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import mssqlPkg from "mssql";
import { parseSqlServerUrl } from "./sql-server-url.js";

const { ConnectionPool } = mssqlPkg;

let adminPool: InstanceType<typeof ConnectionPool>;
let requestPool: InstanceType<typeof ConnectionPool>;

const ADMIN_URL = process.env["DATABASE_URL_ADMIN"];
const REQUEST_URL = process.env["DATABASE_URL"];

// ─── Test data ────────────────────────────────────────────────────────────────

let ownerUserId: string;
let unrelatedClientUserId: string;
let generalClientUserId: string;

let sharedEngagementId: string;
let sharedEngagementRequestId: string;

let engagementThreadId: string;
let generalThreadId: string;

/** Message rows */
let engagementMessageId: string;
let generalMessageId: string;

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeAll(async () => {
  if (!ADMIN_URL) throw new Error("DATABASE_URL_ADMIN is required for RLS integration tests");
  if (!REQUEST_URL) throw new Error("DATABASE_URL is required for RLS integration tests");

  const adminConfig = parseSqlServerUrl(ADMIN_URL) as import("mssql").config;
  adminPool = new ConnectionPool(adminConfig);
  await adminPool.connect();

  const requestConfig = parseSqlServerUrl(REQUEST_URL) as import("mssql").config;
  requestPool = new ConnectionPool(requestConfig);
  await requestPool.connect();

  // ─── Seed: Users ─────────────────────────────────────────────────────────
  const ownerResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[User] ([clerkId], [email], [role], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'msg_rls_owner', N'msg-rls-owner@example.com', N'CLIENT', SYSDATETIMEOFFSET())`
  );
  ownerUserId = ownerResult.recordset[0]?.id ?? "";

  const unrelatedResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[User] ([clerkId], [email], [role], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'msg_rls_unrelated', N'msg-rls-unrelated@example.com', N'CLIENT', SYSDATETIMEOFFSET())`
  );
  unrelatedClientUserId = unrelatedResult.recordset[0]?.id ?? "";

  const genClientResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[User] ([clerkId], [email], [role], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'msg_rls_gen_client', N'msg-rls-gen-client@example.com', N'CLIENT', SYSDATETIMEOFFSET())`
  );
  generalClientUserId = genClientResult.recordset[0]?.id ?? "";

  // ─── Seed: EngagementRequest + Engagement ─────────────────────────────────
  const reqResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[EngagementRequest] ([firstName], [lastName], [email], [status], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'Msg', N'RLSOwner', N'msg-rls-owner-req@example.com', N'accepted', SYSDATETIMEOFFSET())`
  );
  sharedEngagementRequestId = reqResult.recordset[0]?.id ?? "";

  const engResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[Engagement]
       ([engagementRequestId], [clientUserId], [status], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES ('${sharedEngagementRequestId}', '${ownerUserId}', N'New', SYSDATETIMEOFFSET())`
  );
  sharedEngagementId = engResult.recordset[0]?.id ?? "";

  // ─── Seed: Threads ────────────────────────────────────────────────────────
  const engThreadResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[Thread]
       ([kind], [engagementId], [clientUserId], [status], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'engagement', '${sharedEngagementId}', NULL, N'active', SYSDATETIMEOFFSET())`
  );
  engagementThreadId = engThreadResult.recordset[0]?.id ?? "";

  const genThreadResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[Thread]
       ([kind], [engagementId], [clientUserId], [status], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'general', NULL, '${generalClientUserId}', N'active', SYSDATETIMEOFFSET())`
  );
  generalThreadId = genThreadResult.recordset[0]?.id ?? "";

  // ─── Seed: Messages ───────────────────────────────────────────────────────
  const engMsgResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[Message]
       ([threadId], [senderClerkId], [body], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES ('${engagementThreadId}', N'msg_rls_owner', N'Hello from engagement thread', SYSDATETIMEOFFSET())`
  );
  engagementMessageId = engMsgResult.recordset[0]?.id ?? "";

  const genMsgResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[Message]
       ([threadId], [senderClerkId], [body], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES ('${generalThreadId}', N'msg_rls_gen_client', N'Hello from general thread', SYSDATETIMEOFFSET())`
  );
  generalMessageId = genMsgResult.recordset[0]?.id ?? "";
}, 30000);

afterAll(async () => {
  // Cleanup in reverse dependency order
  for (const id of [engagementMessageId, generalMessageId]) {
    if (id) await adminPool.request().query(`DELETE FROM [dbo].[Message] WHERE [id] = '${id}'`).catch(() => { /* ignore */ });
  }
  for (const id of [engagementThreadId, generalThreadId]) {
    if (id) await adminPool.request().query(`DELETE FROM [dbo].[Thread] WHERE [id] = '${id}'`).catch(() => { /* ignore */ });
  }
  if (sharedEngagementId) await adminPool.request().query(`DELETE FROM [dbo].[Engagement] WHERE [id] = '${sharedEngagementId}'`).catch(() => { /* ignore */ });
  if (sharedEngagementRequestId) await adminPool.request().query(`DELETE FROM [dbo].[EngagementRequest] WHERE [id] = '${sharedEngagementRequestId}'`).catch(() => { /* ignore */ });
  for (const id of [ownerUserId, unrelatedClientUserId, generalClientUserId]) {
    if (id) await adminPool.request().query(`DELETE FROM [dbo].[User] WHERE [id] = '${id}'`).catch(() => { /* ignore */ });
  }
  await adminPool.close().catch(() => { /* ignore */ });
  await requestPool.close().catch(() => { /* ignore */ });
}, 30000);

// ─── Tests: engagement-thread message isolation ────────────────────────────────

describe("sec.pol_Message — engagement-thread message isolation (AC-MSG-002-02 / HARD GATE)", () => {

  /**
   * [AC-MSG-002-02][POSITIVE] Engagement-thread participant reads messages in thread.
   * Named code path: fn_message_access — 3a-owner EXISTS branch.
   * // CS-SQL-001 // CS-SQL-003 // ADR-005 // DECISION-017-A
   */
  it("[AC-MSG-002-02][POSITIVE] engagement-thread participant reads messages in thread", async () => {
    const result = await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = N'msg_rls_owner', @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = N'CLIENT', @read_only = 0;
       SELECT [id] FROM [dbo].[Message]
       WHERE [id] = '${engagementMessageId}';`
    );
    const recordsets = result.recordsets as Array<Array<{ id?: string }>>;
    const rows = recordsets[recordsets.length - 1];
    await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = NULL, @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = NULL, @read_only = 0;`
    );
    expect(rows).toHaveLength(1);
    expect(rows?.[0]?.id).toBe(engagementMessageId);
  });

  /**
   * [AC-MSG-002-02][NEGATIVE] Non-participant CLIENT reads ZERO — isolation HARD.
   * unrelatedClient has no access to the shared engagement's thread.
   * // CS-SQL-001 // CS-SQL-003 // ADR-005
   */
  it("[AC-MSG-002-02][NEGATIVE] non-participant CLIENT reads ZERO — isolation HARD", async () => {
    const result = await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = N'msg_rls_unrelated', @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = N'CLIENT', @read_only = 0;
       SELECT [id] FROM [dbo].[Message]
       WHERE [id] = '${engagementMessageId}';`
    );
    const recordsets = result.recordsets as Array<Array<{ id?: string }>>;
    const rows = recordsets[recordsets.length - 1];
    await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = NULL, @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = NULL, @read_only = 0;`
    );
    expect(rows).toHaveLength(0);
  });

  /**
   * [ADR-005][NEGATIVE] Null SESSION_CONTEXT reads ZERO — fail-closed.
   * // CS-SQL-003 // ADR-003 §5
   */
  it("[ADR-005][NEGATIVE] null SESSION_CONTEXT reads ZERO — fail-closed", async () => {
    const result = await requestPool.request().query(
      `SELECT COUNT(*) AS cnt FROM [dbo].[Message]
       WHERE [id] = '${engagementMessageId}'`
    );
    const cnt = (result.recordset as Array<{ cnt?: number }>)[0]?.cnt ?? -1;
    expect(cnt).toBe(0);
  });

  /**
   * [ADR-005][POSITIVE] ACCOUNTANT reads all messages.
   * // CS-SQL-003
   */
  it("[ADR-005][POSITIVE] ACCOUNTANT reads all messages", async () => {
    const result = await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = N'msg_rls_accountant', @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = N'ACCOUNTANT', @read_only = 0;
       SELECT [id] FROM [dbo].[Message]
       WHERE [id] IN ('${engagementMessageId}', '${generalMessageId}');`
    );
    const recordsets = result.recordsets as Array<Array<{ id?: string }>>;
    const rows = recordsets[recordsets.length - 1];
    await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = NULL, @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = NULL, @read_only = 0;`
    );
    expect(rows).toHaveLength(2);
    const ids = (rows ?? []).map((r) => r.id);
    expect(ids).toContain(engagementMessageId);
    expect(ids).toContain(generalMessageId);
  });

  /**
   * [AC-MSG-002-02][POSITIVE] General-thread: associated client reads their thread's messages.
   * Named code path: fn_message_access — 3b general-thread EXISTS branch.
   * // CS-SQL-001 // CS-SQL-003 // ADR-005 // DECISION-017-A
   */
  it("[AC-MSG-002-02][POSITIVE] general-thread: associated client reads messages", async () => {
    const result = await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = N'msg_rls_gen_client', @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = N'CLIENT', @read_only = 0;
       SELECT [id] FROM [dbo].[Message]
       WHERE [id] = '${generalMessageId}';`
    );
    const recordsets = result.recordsets as Array<Array<{ id?: string }>>;
    const rows = recordsets[recordsets.length - 1];
    await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = NULL, @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = NULL, @read_only = 0;`
    );
    expect(rows).toHaveLength(1);
    expect(rows?.[0]?.id).toBe(generalMessageId);
  });

  /**
   * [AC-MSG-002-02][NEGATIVE] General-thread: unrelated client reads ZERO.
   * unrelatedClient is not the Thread.clientUserId for the general thread.
   * // CS-SQL-001 // CS-SQL-003 // ADR-005 // DECISION-017-A
   */
  it("[AC-MSG-002-02][NEGATIVE] general-thread: unrelated client reads ZERO", async () => {
    const result = await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = N'msg_rls_unrelated', @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = N'CLIENT', @read_only = 0;
       SELECT [id] FROM [dbo].[Message]
       WHERE [id] = '${generalMessageId}';`
    );
    const recordsets = result.recordsets as Array<Array<{ id?: string }>>;
    const rows = recordsets[recordsets.length - 1];
    await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = NULL, @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = NULL, @read_only = 0;`
    );
    expect(rows).toHaveLength(0);
  });

});
