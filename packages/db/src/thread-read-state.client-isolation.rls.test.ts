/**
 * packages/db/src/thread-read-state.client-isolation.rls.test.ts
 *
 * TIER-3 INTEGRATION TEST — requires real SQL Server (ADR-005 §6, HARD GATE)
 *
 * Tests the sec.pol_ThreadReadState security policy (BRIEF-017 / TASK-017-001).
 * CS-SQL-001: HARD requirement — per-viewer own-row isolation test. Both-ways mandatory.
 *
 * DECISION-017-A: per-viewer last-read watermark, own-row scoped.
 *   A viewer reads only their own (thread, userId) row.
 *   Another participant in the SAME thread cannot read a different viewer's read state.
 *   This prevents read-state leakage (activity pattern exposure across viewers).
 *
 * Coverage matrix per ADR-005 §6 (HARD requirement — BOTH WAYS):
 *   [POSITIVE]  viewer A reads their own read-state row
 *   [NEGATIVE]  viewer B cannot read viewer A's read-state row (same thread) — isolation HARD
 *   [NEGATIVE]  null SESSION_CONTEXT reads ZERO — fail-closed (ADR-003 §5)
 *   [POSITIVE]  ACCOUNTANT reads all read-state rows
 *   [POSITIVE]  viewer A reads only their own row (not viewer B's) in the same thread
 *
 * Gate Authoring Evidence (ENGINE.md § Gate Authoring Rules — introduces_gate: yes):
 *   1. Run marker: packages/db/src/thread-read-state.client-isolation.rls.test.ts (this file).
 *      Specific test names (exact):
 *        "[DECISION-017-A][POSITIVE] viewer A reads their own read-state row"
 *        "[DECISION-017-A][NEGATIVE] viewer B cannot read viewer A's read-state (same thread) — isolation HARD"
 *        "[ADR-005][NEGATIVE] null SESSION_CONTEXT reads ZERO — fail-closed"
 *        "[ADR-005][POSITIVE] ACCOUNTANT reads all read-state rows"
 *        "[DECISION-017-A][POSITIVE] viewer A reads only their own row — not viewer B's"
 *      Actual output recorded in TASK-017-001 Work Log.
 *   2. Named code path: sec.fn_thread_read_state_access in db/policies/0017-thread-read-state-policy.sql.
 *      The FILTER PREDICATE on dbo.ThreadReadState (STATE = ON, SCHEMABINDING = ON).
 *      Specifically the CLIENT own-row branch:
 *        OR EXISTS (SELECT 1 FROM [dbo].[User] u
 *          WHERE u.[clerkId] = CAST(SESSION_CONTEXT(N'clerk_user_id') AS NVARCHAR(64))
 *            AND u.[id] = @readStateUserId)
 *   3. Counterfactual: removing the FILTER PREDICATE from pol_ThreadReadState would cause the
 *      negative isolation test to fail (viewer B reads viewer A's row — 1 instead of 0).
 *      Removing the CLIENT own-row EXISTS branch causes the positive test to return 0 rows
 *      (viewer A cannot read their own read state).
 *      Removing the @readStateUserId scoping (u.[id] = @readStateUserId) would allow any
 *      authenticated CLIENT to read any other viewer's read state — a privacy violation.
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

/** Two viewers for the same thread (to test own-row isolation both ways). */
let viewerAUserId: string;
let viewerBUserId: string;

let engagementId: string;
let engagementRequestId: string;
let threadId: string;

/** ThreadReadState rows for viewer A and viewer B (same thread). */
let viewerAReadStateId: string;
let viewerBReadStateId: string;

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
  const viewerAResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[User] ([clerkId], [email], [role], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'trs_rls_viewer_a', N'trs-rls-viewer-a@example.com', N'CLIENT', SYSDATETIMEOFFSET())`
  );
  viewerAUserId = viewerAResult.recordset[0]?.id ?? "";

  const viewerBResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[User] ([clerkId], [email], [role], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'trs_rls_viewer_b', N'trs-rls-viewer-b@example.com', N'CLIENT', SYSDATETIMEOFFSET())`
  );
  viewerBUserId = viewerBResult.recordset[0]?.id ?? "";

  // ─── Seed: EngagementRequest + Engagement ─────────────────────────────────
  const reqResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[EngagementRequest] ([firstName], [lastName], [email], [status], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'TRS', N'RLSViewer', N'trs-rls-viewer-req@example.com', N'accepted', SYSDATETIMEOFFSET())`
  );
  engagementRequestId = reqResult.recordset[0]?.id ?? "";

  const engResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[Engagement]
       ([engagementRequestId], [clientUserId], [status], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES ('${engagementRequestId}', '${viewerAUserId}', N'New', SYSDATETIMEOFFSET())`
  );
  engagementId = engResult.recordset[0]?.id ?? "";

  // ─── Seed: Thread ─────────────────────────────────────────────────────────
  const threadResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[Thread]
       ([kind], [engagementId], [clientUserId], [status], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'engagement', '${engagementId}', NULL, N'active', SYSDATETIMEOFFSET())`
  );
  threadId = threadResult.recordset[0]?.id ?? "";

  // ─── Seed: ThreadReadState rows (both viewers for the same thread) ─────────
  // DECISION-017-A: @@unique([threadId, userId]) — one watermark per (thread, viewer)
  const viewerAReadResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[ThreadReadState]
       ([threadId], [userId], [lastReadAt], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES ('${threadId}', '${viewerAUserId}', SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET())`
  );
  viewerAReadStateId = viewerAReadResult.recordset[0]?.id ?? "";

  const viewerBReadResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[ThreadReadState]
       ([threadId], [userId], [lastReadAt], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES ('${threadId}', '${viewerBUserId}', SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET())`
  );
  viewerBReadStateId = viewerBReadResult.recordset[0]?.id ?? "";
}, 30000);

afterAll(async () => {
  for (const id of [viewerAReadStateId, viewerBReadStateId]) {
    if (id) await adminPool.request().query(`DELETE FROM [dbo].[ThreadReadState] WHERE [id] = '${id}'`).catch(() => { /* ignore */ });
  }
  if (threadId) await adminPool.request().query(`DELETE FROM [dbo].[Thread] WHERE [id] = '${threadId}'`).catch(() => { /* ignore */ });
  if (engagementId) await adminPool.request().query(`DELETE FROM [dbo].[Engagement] WHERE [id] = '${engagementId}'`).catch(() => { /* ignore */ });
  if (engagementRequestId) await adminPool.request().query(`DELETE FROM [dbo].[EngagementRequest] WHERE [id] = '${engagementRequestId}'`).catch(() => { /* ignore */ });
  for (const id of [viewerAUserId, viewerBUserId]) {
    if (id) await adminPool.request().query(`DELETE FROM [dbo].[User] WHERE [id] = '${id}'`).catch(() => { /* ignore */ });
  }
  await adminPool.close().catch(() => { /* ignore */ });
  await requestPool.close().catch(() => { /* ignore */ });
}, 30000);

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe("sec.pol_ThreadReadState — per-viewer own-row isolation (DECISION-017-A / HARD GATE)", () => {

  /**
   * [DECISION-017-A][POSITIVE] Viewer A reads their own read-state row.
   * Named code path: fn_thread_read_state_access — CLIENT own-row EXISTS branch.
   *   clerkId='trs_rls_viewer_a' → User.id = viewerAUserId = ThreadReadState.userId
   *   → EXISTS passes → 1 row returned.
   * // CS-SQL-001 // CS-SQL-003 // ADR-005 // DECISION-017-A
   */
  it("[DECISION-017-A][POSITIVE] viewer A reads their own read-state row", async () => {
    const result = await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = N'trs_rls_viewer_a', @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = N'CLIENT', @read_only = 0;
       SELECT [id] FROM [dbo].[ThreadReadState]
       WHERE [id] = '${viewerAReadStateId}';`
    );
    const recordsets = result.recordsets as Array<Array<{ id?: string }>>;
    const rows = recordsets[recordsets.length - 1];
    await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = NULL, @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = NULL, @read_only = 0;`
    );
    expect(rows).toHaveLength(1);
    expect(rows?.[0]?.id).toBe(viewerAReadStateId);
  });

  /**
   * [DECISION-017-A][NEGATIVE] Viewer B cannot read viewer A's read-state (same thread) — isolation HARD.
   * Named code path: fn_thread_read_state_access — CLIENT own-row EXISTS branch fails:
   *   clerkId='trs_rls_viewer_b' → User.id = viewerBUserId ≠ viewerAReadState.userId → EXISTS empty.
   * → predicate empty → FILTER removes row → 0 rows (fail-closed).
   * This is the bidirectional isolation proof: another participant in the SAME thread
   * cannot read a different viewer's read-state (activity pattern leak prevention).
   * // CS-SQL-001 // CS-SQL-003 // ADR-005 // DECISION-017-A
   */
  it("[DECISION-017-A][NEGATIVE] viewer B cannot read viewer A's read-state (same thread) — isolation HARD", async () => {
    const result = await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = N'trs_rls_viewer_b', @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = N'CLIENT', @read_only = 0;
       SELECT [id] FROM [dbo].[ThreadReadState]
       WHERE [id] = '${viewerAReadStateId}';`
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
   * ADR-003 §5: null identity → CLIENT EXISTS empty → 0 rows.
   * // CS-SQL-003 // ADR-003 §5
   */
  it("[ADR-005][NEGATIVE] null SESSION_CONTEXT reads ZERO — fail-closed", async () => {
    const result = await requestPool.request().query(
      `SELECT COUNT(*) AS cnt FROM [dbo].[ThreadReadState]
       WHERE [id] IN ('${viewerAReadStateId}', '${viewerBReadStateId}')`
    );
    const cnt = (result.recordset as Array<{ cnt?: number }>)[0]?.cnt ?? -1;
    expect(cnt).toBe(0);
  });

  /**
   * [ADR-005][POSITIVE] ACCOUNTANT reads all read-state rows.
   * ACCOUNTANT branch passes unconditionally (needed for admin / aggregate queries).
   * // CS-SQL-003
   */
  it("[ADR-005][POSITIVE] ACCOUNTANT reads all read-state rows", async () => {
    const result = await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = N'trs_rls_accountant', @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = N'ACCOUNTANT', @read_only = 0;
       SELECT [id] FROM [dbo].[ThreadReadState]
       WHERE [id] IN ('${viewerAReadStateId}', '${viewerBReadStateId}');`
    );
    const recordsets = result.recordsets as Array<Array<{ id?: string }>>;
    const rows = recordsets[recordsets.length - 1];
    await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = NULL, @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = NULL, @read_only = 0;`
    );
    expect(rows).toHaveLength(2);
    const ids = (rows ?? []).map((r) => r.id);
    expect(ids).toContain(viewerAReadStateId);
    expect(ids).toContain(viewerBReadStateId);
  });

  /**
   * [DECISION-017-A][POSITIVE] Viewer A reads only their own row — not viewer B's.
   * When querying both rows, viewer A sees ONLY their own (not both).
   * Named code path: fn_thread_read_state_access — CLIENT own-row EXISTS.
   *   clerkId='trs_rls_viewer_a' → User.id = viewerAUserId
   *   = viewerAReadState.userId (pass) ≠ viewerBReadState.userId (fail).
   * → 1 row visible (only viewerA's), 1 row hidden (viewerB's).
   * // CS-SQL-001 // CS-SQL-003 // ADR-005 // DECISION-017-A
   */
  it("[DECISION-017-A][POSITIVE] viewer A reads only their own row — not viewer B's", async () => {
    const result = await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = N'trs_rls_viewer_a', @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = N'CLIENT', @read_only = 0;
       SELECT [id] FROM [dbo].[ThreadReadState]
       WHERE [id] IN ('${viewerAReadStateId}', '${viewerBReadStateId}');`
    );
    const recordsets = result.recordsets as Array<Array<{ id?: string }>>;
    const rows = recordsets[recordsets.length - 1];
    await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = NULL, @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = NULL, @read_only = 0;`
    );
    // Viewer A sees ONLY their own row (1), not viewer B's row (0 hidden)
    expect(rows).toHaveLength(1);
    expect(rows?.[0]?.id).toBe(viewerAReadStateId);
  });

});

// ─── Admin pool sanity check ──────────────────────────────────────────────────

describe("admin pool sanity check — RLS-exempt reads + uniqueness", () => {

  /**
   * [POSITIVE] Admin pool reads both seeded ThreadReadState rows — RLS-exempt.
   */
  it("[POSITIVE] admin pool reads both ThreadReadState rows — RLS-exempt", async () => {
    const result = await adminPool.request().query<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM [dbo].[ThreadReadState]
       WHERE [id] IN ('${viewerAReadStateId}', '${viewerBReadStateId}')`
    );
    expect(result.recordset[0]?.cnt).toBe(2);
  });

  /**
   * [DECISION-017-A] @@unique([threadId, userId]) enforced at DB level.
   * Inserting a duplicate (threadId, userId) pair must fail.
   */
  it("[DECISION-017-A] @@unique([threadId, userId]) enforced — duplicate row rejected", async () => {
    let insertError: Error | null = null;
    try {
      await adminPool.request().query(
        `INSERT INTO [dbo].[ThreadReadState]
           ([threadId], [userId], [lastReadAt], [updatedAt])
         VALUES ('${threadId}', '${viewerAUserId}', SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET())`
      );
    } catch (err) {
      insertError = err as Error;
    }
    // Cleanup just in case
    await adminPool.request().query(
      `DELETE FROM [dbo].[ThreadReadState]
       WHERE [threadId] = '${threadId}' AND [userId] = '${viewerAUserId}'
         AND [id] <> '${viewerAReadStateId}'`
    ).catch(() => { /* ignore */ });

    expect(insertError).not.toBeNull();
    expect(insertError?.message).toMatch(/unique|duplicate|violation/i);
  });

});
