/**
 * packages/db/src/message-attachment.client-isolation.rls.test.ts
 *
 * TIER-3 INTEGRATION TEST — requires real SQL Server (ADR-005 §6, HARD GATE)
 *
 * Tests the sec.pol_MessageAttachment security policy (BRIEF-017 / TASK-017-001).
 * CS-SQL-001: HARD requirement — both-ways isolation is mandatory (SDET trap).
 *
 * Coverage matrix per ADR-005 §6 (HARD requirement — BOTH WAYS):
 *   [POSITIVE]  engagement-thread participant reads their thread's message attachments
 *   [NEGATIVE]  non-participant CLIENT reads ZERO — isolation (ADR-005 HARD)
 *   [NEGATIVE]  null SESSION_CONTEXT reads ZERO — fail-closed (ADR-003 §5)
 *   [POSITIVE]  ACCOUNTANT reads all attachments
 *   [POSITIVE]  general-thread: associated client reads their attachments
 *   [NEGATIVE]  general-thread: unrelated client reads ZERO
 *
 * Gate Authoring Evidence (ENGINE.md § Gate Authoring Rules — introduces_gate: yes):
 *   1. Run marker: packages/db/src/message-attachment.client-isolation.rls.test.ts (this file).
 *      Specific test names (exact):
 *        "[POSITIVE] engagement-thread participant reads their thread's message attachments"
 *        "[NEGATIVE] non-participant CLIENT reads ZERO — isolation HARD"
 *        "[ADR-005][NEGATIVE] null SESSION_CONTEXT reads ZERO — fail-closed"
 *        "[ADR-005][POSITIVE] ACCOUNTANT reads all attachments"
 *        "[POSITIVE] general-thread: associated client reads their attachments"
 *        "[NEGATIVE] general-thread: unrelated client reads ZERO"
 *      Actual output recorded in TASK-017-001 Work Log.
 *   2. Named code path: sec.fn_message_attachment_access in db/policies/0016-message-attachment-policy.sql.
 *      The FILTER PREDICATE on dbo.MessageAttachment (STATE = ON, SCHEMABINDING = ON).
 *      Specifically the 3a-owner EXISTS branch:
 *        OR EXISTS (SELECT 1 FROM [dbo].[Message] m
 *          JOIN [dbo].[Thread] t ON t.[id] = m.[threadId]
 *          JOIN [dbo].[Engagement] e ON e.[id] = t.[engagementId]
 *          JOIN [dbo].[User] u ON u.[id] = e.[clientUserId]
 *          WHERE m.[id] = @attachmentMessageId
 *            AND u.[clerkId] = CAST(SESSION_CONTEXT(N'clerk_user_id') AS NVARCHAR(64)))
 *   3. Counterfactual: removing the FILTER PREDICATE from pol_MessageAttachment would cause
 *      the negative isolation tests to fail (non-participant reads 1 row instead of 0).
 *      Removing 3a-owner branch causes the positive engagement-thread test to return 0 rows.
 *      Removing 3b branch causes the positive general-thread test to return 0 rows.
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
let engagementMessageId: string;
let generalMessageId: string;

/** Attachment rows */
let engagementAttachmentId: string;
let generalAttachmentId: string;

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
     VALUES (N'att_rls_owner', N'att-rls-owner@example.com', N'CLIENT', SYSDATETIMEOFFSET())`
  );
  ownerUserId = ownerResult.recordset[0]?.id ?? "";

  const unrelatedResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[User] ([clerkId], [email], [role], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'att_rls_unrelated', N'att-rls-unrelated@example.com', N'CLIENT', SYSDATETIMEOFFSET())`
  );
  unrelatedClientUserId = unrelatedResult.recordset[0]?.id ?? "";

  const genClientResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[User] ([clerkId], [email], [role], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'att_rls_gen_client', N'att-rls-gen-client@example.com', N'CLIENT', SYSDATETIMEOFFSET())`
  );
  generalClientUserId = genClientResult.recordset[0]?.id ?? "";

  // ─── Seed: EngagementRequest + Engagement ─────────────────────────────────
  const reqResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[EngagementRequest] ([firstName], [lastName], [email], [status], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'Att', N'RLSOwner', N'att-rls-owner-req@example.com', N'accepted', SYSDATETIMEOFFSET())`
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
     VALUES ('${engagementThreadId}', N'att_rls_owner', N'Engagement thread message', SYSDATETIMEOFFSET())`
  );
  engagementMessageId = engMsgResult.recordset[0]?.id ?? "";

  const genMsgResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[Message]
       ([threadId], [senderClerkId], [body], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES ('${generalThreadId}', N'att_rls_gen_client', N'General thread message', SYSDATETIMEOFFSET())`
  );
  generalMessageId = genMsgResult.recordset[0]?.id ?? "";

  // ─── Seed: MessageAttachments ─────────────────────────────────────────────
  const engAttResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[MessageAttachment]
       ([messageId], [storageKey], [originalFilename], [contentType], [sizeBytes], [status], [uploadedBy], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES ('${engagementMessageId}', N'threads/eng/messages/engmsg/file.pdf',
             N'file.pdf', N'application/pdf', 1024, N'pending', N'att_rls_owner', SYSDATETIMEOFFSET())`
  );
  engagementAttachmentId = engAttResult.recordset[0]?.id ?? "";

  const genAttResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[MessageAttachment]
       ([messageId], [storageKey], [originalFilename], [contentType], [sizeBytes], [status], [uploadedBy], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES ('${generalMessageId}', N'threads/gen/messages/genmsg/file.pdf',
             N'file.pdf', N'application/pdf', 2048, N'pending', N'att_rls_gen_client', SYSDATETIMEOFFSET())`
  );
  generalAttachmentId = genAttResult.recordset[0]?.id ?? "";
}, 30000);

afterAll(async () => {
  for (const id of [engagementAttachmentId, generalAttachmentId]) {
    if (id) await adminPool.request().query(`DELETE FROM [dbo].[MessageAttachment] WHERE [id] = '${id}'`).catch(() => { /* ignore */ });
  }
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

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe("sec.pol_MessageAttachment — engagement-thread attachment isolation (HARD GATE)", () => {

  /**
   * [POSITIVE] Engagement-thread participant reads their thread's message attachments.
   * Named code path: fn_message_attachment_access — 3a-owner EXISTS branch.
   * // CS-SQL-001 // CS-SQL-003 // ADR-005 // DECISION-017-A
   */
  it("[POSITIVE] engagement-thread participant reads their thread's message attachments", async () => {
    const result = await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = N'att_rls_owner', @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = N'CLIENT', @read_only = 0;
       SELECT [id] FROM [dbo].[MessageAttachment]
       WHERE [id] = '${engagementAttachmentId}';`
    );
    const recordsets = result.recordsets as Array<Array<{ id?: string }>>;
    const rows = recordsets[recordsets.length - 1];
    await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = NULL, @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = NULL, @read_only = 0;`
    );
    expect(rows).toHaveLength(1);
    expect(rows?.[0]?.id).toBe(engagementAttachmentId);
  });

  /**
   * [NEGATIVE] Non-participant CLIENT reads ZERO — isolation HARD.
   * // CS-SQL-001 // CS-SQL-003 // ADR-005
   */
  it("[NEGATIVE] non-participant CLIENT reads ZERO — isolation HARD", async () => {
    const result = await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = N'att_rls_unrelated', @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = N'CLIENT', @read_only = 0;
       SELECT [id] FROM [dbo].[MessageAttachment]
       WHERE [id] = '${engagementAttachmentId}';`
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
      `SELECT COUNT(*) AS cnt FROM [dbo].[MessageAttachment]
       WHERE [id] = '${engagementAttachmentId}'`
    );
    const cnt = (result.recordset as Array<{ cnt?: number }>)[0]?.cnt ?? -1;
    expect(cnt).toBe(0);
  });

  /**
   * [ADR-005][POSITIVE] ACCOUNTANT reads all attachments.
   * // CS-SQL-003
   */
  it("[ADR-005][POSITIVE] ACCOUNTANT reads all attachments", async () => {
    const result = await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = N'att_rls_accountant', @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = N'ACCOUNTANT', @read_only = 0;
       SELECT [id] FROM [dbo].[MessageAttachment]
       WHERE [id] IN ('${engagementAttachmentId}', '${generalAttachmentId}');`
    );
    const recordsets = result.recordsets as Array<Array<{ id?: string }>>;
    const rows = recordsets[recordsets.length - 1];
    await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = NULL, @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = NULL, @read_only = 0;`
    );
    expect(rows).toHaveLength(2);
    const ids = (rows ?? []).map((r) => r.id);
    expect(ids).toContain(engagementAttachmentId);
    expect(ids).toContain(generalAttachmentId);
  });

  /**
   * [POSITIVE] General-thread: associated client reads their attachments.
   * Named code path: fn_message_attachment_access — 3b general-thread EXISTS branch.
   * // CS-SQL-001 // CS-SQL-003 // ADR-005 // DECISION-017-A
   */
  it("[POSITIVE] general-thread: associated client reads their attachments", async () => {
    const result = await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = N'att_rls_gen_client', @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = N'CLIENT', @read_only = 0;
       SELECT [id] FROM [dbo].[MessageAttachment]
       WHERE [id] = '${generalAttachmentId}';`
    );
    const recordsets = result.recordsets as Array<Array<{ id?: string }>>;
    const rows = recordsets[recordsets.length - 1];
    await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = NULL, @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = NULL, @read_only = 0;`
    );
    expect(rows).toHaveLength(1);
    expect(rows?.[0]?.id).toBe(generalAttachmentId);
  });

  /**
   * [NEGATIVE] General-thread: unrelated client reads ZERO.
   * // CS-SQL-001 // CS-SQL-003 // ADR-005 // DECISION-017-A
   */
  it("[NEGATIVE] general-thread: unrelated client reads ZERO", async () => {
    const result = await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = N'att_rls_unrelated', @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = N'CLIENT', @read_only = 0;
       SELECT [id] FROM [dbo].[MessageAttachment]
       WHERE [id] = '${generalAttachmentId}';`
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
