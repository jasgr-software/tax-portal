/**
 * packages/db/src/thread.client-isolation.rls.test.ts
 *
 * TIER-3 INTEGRATION TEST — requires real SQL Server (ADR-005 §6, HARD GATE)
 *
 * Tests the sec.pol_Thread security policy (BRIEF-017 / TASK-017-001).
 * CS-SQL-001: HARD requirement — CLIENT-A-cannot-read-CLIENT-B isolation test for every
 *   new client-owned-rows security policy. Both-ways isolation is mandatory (SDET trap).
 *
 * Acceptance criteria covered:
 *   AC-MSG-001-01 — one Thread per engagement (@@unique[engagementId])
 *   AC-MSG-001-02 — engagement thread visible only to participants (policy substrate)
 *   AC-MSG-001-04 — both parties read + contribute in the engagement thread
 *   AC-MSG-006-01 — general thread per client↔accountant (kind='general')
 *   AC-MSG-006-02 — general thread visible only to that client + accountant
 *
 * Coverage matrix per ADR-005 §6 (HARD requirement — BOTH WAYS):
 *   [POSITIVE]  engagement-thread owner reads their thread
 *   [NEGATIVE]  non-participant CLIENT reads ZERO — isolation (ADR-005 HARD)
 *   [NEGATIVE]  null SESSION_CONTEXT reads ZERO — fail-closed (ADR-003 §5)
 *   [POSITIVE]  ACCOUNTANT reads all threads
 *   [POSITIVE]  multi-participant (≥2 participants): EVERY participant reads the shared engagement thread
 *               (TASK-017-012 Finding 2 — seeds participantA + participantB, asserts both read)
 *   [NEGATIVE]  client on a DIFFERENT engagement reads ZERO — cross-engagement zero
 *   [POSITIVE]  general-thread: associated client reads their thread
 *   [NEGATIVE]  general-thread: unrelated client reads ZERO
 *   [POSITIVE]  general-thread: ACCOUNTANT reads the general thread
 *
 * Gate Authoring Evidence (ENGINE.md § Gate Authoring Rules — introduces_gate: yes):
 *   1. Run marker: packages/db/src/thread.client-isolation.rls.test.ts (this file).
 *      Specific test names (exact):
 *        "[AC-MSG-001-02][POSITIVE] engagement-thread owner reads their thread"
 *        "[AC-MSG-001-02][NEGATIVE] non-participant CLIENT reads ZERO — isolation HARD"
 *        "[ADR-005][NEGATIVE] null SESSION_CONTEXT reads ZERO — fail-closed"
 *        "[ADR-005][POSITIVE] ACCOUNTANT reads all threads"
 *        "[AC-MSG-001-02][POSITIVE] multi-participant (≥2): participantA reads the shared engagement thread"
 *        "[AC-MSG-001-02][POSITIVE] multi-participant (≥2): participantB reads the shared engagement thread"
 *        "[AC-MSG-001-02][POSITIVE] multi-participant (≥2): both participantA and participantB read the shared engagement thread"
 *        "[AC-MSG-001-02][NEGATIVE] client on different engagement reads ZERO — cross-engagement isolation"
 *        "[AC-MSG-006-02][POSITIVE] general-thread: associated client reads their thread"
 *        "[AC-MSG-006-02][NEGATIVE] general-thread: unrelated client reads ZERO"
 *        "[AC-MSG-006-02][POSITIVE] general-thread: ACCOUNTANT reads all"
 *      Actual output recorded in TASK-017-001 Work Log.
 *      TASK-017-012 Finding 2: ≥2-participant test now seeds participantA + participantB,
 *        asserts both read (not just participantA alone). // CS-SQL-001 // AC-MSG-001-04
 *   2. Named code path: sec.fn_thread_access in db/policies/0014-thread-policy.sql.
 *      The FILTER PREDICATE on dbo.Thread (STATE = ON, SCHEMABINDING = ON).
 *      Specifically:
 *        3a-owner EXISTS branch (engagement thread owner):
 *          OR EXISTS (SELECT 1 FROM [dbo].[User] u JOIN [dbo].[Engagement] e ON e.[clientUserId] = u.[id]
 *            WHERE u.[clerkId] = CAST(SESSION_CONTEXT(N'clerk_user_id') AS NVARCHAR(64))
 *              AND e.[id] = @threadEngagementId)
 *        3a-participant EXISTS branch (engagement thread participant):
 *          OR EXISTS (SELECT 1 FROM [dbo].[User] u JOIN [dbo].[EngagementParticipant] ep ON ep.[userId] = u.[id]
 *            WHERE u.[clerkId] = CAST(SESSION_CONTEXT(N'clerk_user_id') AS NVARCHAR(64))
 *              AND ep.[engagementId] = @threadEngagementId)
 *        3b EXISTS branch (general thread associated client):
 *          OR EXISTS (SELECT 1 FROM [dbo].[User] u
 *            WHERE u.[clerkId] = CAST(SESSION_CONTEXT(N'clerk_user_id') AS NVARCHAR(64))
 *              AND u.[id] = @threadClientUserId)
 *   3. Counterfactual: removing the FILTER PREDICATE from pol_Thread (or removing all CLIENT
 *      EXISTS branches from fn_thread_access) would cause the negative isolation tests to fail:
 *      the non-participant client and unrelated client would read 1 row instead of 0.
 *      Removing branch 3a-owner causes "[POSITIVE] engagement-thread owner reads their thread"
 *      to return 0 rows (owner access breaks).
 *      Removing branch 3b causes "[POSITIVE] general-thread: associated client reads their thread"
 *      to return 0 rows (general thread access breaks).
 *
 * Connection approach:
 *   Uses raw mssql (not Prisma) for pool setup/control. Rationale: Prisma 5.22.0 sqlserver
 *   connector cannot parse port in authority URL form — P1013.
 *   SESSION_CONTEXT is set in the same batch as the SELECT to ensure it is active
 *   when the predicate evaluates it.
 *
 * Environment:
 *   DATABASE_URL_ADMIN — admin pool URL (taxportal_admin; IS_MEMBER('app_admin_role')=1 → RLS-exempt)
 *   DATABASE_URL       — request pool URL (taxportal_user; subject to RLS)
 *
 * // CS-SQL-001 // CS-SQL-002 // CS-SQL-003 // CS-GEN-002 // CS-GEN-003
 * // ADR-005 // ADR-003 // ADR-002 // DECISION-017-A
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
 * Users for multi-scenario isolation testing:
 *   - ownerUser:         the clientUserId owner of the shared engagement
 *   - participantA:     a linked participant via EngagementParticipant (first participant)
 *   - participantB:     a second linked participant via EngagementParticipant (TASK-017-012 Finding 2)
 *                       — seeds ≥2 EngagementParticipant rows to prove the "every participant reads" contract
 *   - unrelatedClient:  a CLIENT with no link to the shared engagement
 *   - generalClient:    the associated client of a general thread
 *   - otherClient:      a CLIENT unrelated to the general thread
 *
 * // CS-SQL-001 // AC-MSG-001-02 // AC-MSG-001-04 // TASK-017-012-Finding-2
 */
let ownerUserId: string;
let participantAUserId: string;
/** Second participant — TASK-017-012 Finding 2: ≥2 participants both must read. // CS-SQL-001 */
let participantBUserId: string;
let unrelatedClientUserId: string;
let generalClientUserId: string;

/** The shared engagement (engagement thread). */
let sharedEngagementId: string;
let sharedEngagementRequestId: string;

/** A second engagement (different owner — cross-engagement isolation test). */
let otherEngagementId: string;
let otherEngagementRequestId: string;

/** EngagementParticipant links. */
let participantALinkId: string;
/** Second participant link — TASK-017-012 Finding 2. // CS-SQL-001 */
let participantBLinkId: string;

/** Thread rows. */
let engagementThreadId: string;
let generalThreadId: string;

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

  // ─── Seed: User rows ──────────────────────────────────────────────────────
  // Owner: clientUserId of the shared engagement
  const ownerResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[User] ([clerkId], [email], [role], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'thr_rls_owner', N'thr-rls-owner@example.com', N'CLIENT', SYSDATETIMEOFFSET())`
  );
  ownerUserId = ownerResult.recordset[0]?.id ?? "";

  // Participant A: linked via EngagementParticipant to the shared engagement (first participant)
  const participantAResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[User] ([clerkId], [email], [role], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'thr_rls_participant_a', N'thr-rls-participant-a@example.com', N'CLIENT', SYSDATETIMEOFFSET())`
  );
  participantAUserId = participantAResult.recordset[0]?.id ?? "";

  // Participant B: second participant linked via EngagementParticipant to the same shared engagement.
  // TASK-017-012 Finding 2: seeds ≥2 EngagementParticipant rows to prove the "every participant reads"
  // contract — the brief's named SDET trap (martha-and-james scenario). // CS-SQL-001 // AC-MSG-001-04
  const participantBResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[User] ([clerkId], [email], [role], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'thr_rls_participant_b', N'thr-rls-participant-b@example.com', N'CLIENT', SYSDATETIMEOFFSET())`
  );
  participantBUserId = participantBResult.recordset[0]?.id ?? "";

  // Unrelated client: no link to the shared engagement (isolation gate)
  const unrelatedResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[User] ([clerkId], [email], [role], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'thr_rls_unrelated', N'thr-rls-unrelated@example.com', N'CLIENT', SYSDATETIMEOFFSET())`
  );
  unrelatedClientUserId = unrelatedResult.recordset[0]?.id ?? "";

  // General-thread client: the associated client of a general thread
  const generalClientResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[User] ([clerkId], [email], [role], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'thr_rls_general_client', N'thr-rls-general-client@example.com', N'CLIENT', SYSDATETIMEOFFSET())`
  );
  generalClientUserId = generalClientResult.recordset[0]?.id ?? "";

  // ─── Seed: EngagementRequest rows (1:1 FK required) ──────────────────────
  const sharedReqResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[EngagementRequest] ([firstName], [lastName], [email], [status], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'Thr', N'RLSOwner', N'thr-rls-owner-req@example.com', N'accepted', SYSDATETIMEOFFSET())`
  );
  sharedEngagementRequestId = sharedReqResult.recordset[0]?.id ?? "";

  const otherReqResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[EngagementRequest] ([firstName], [lastName], [email], [status], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'Thr', N'RLSOther', N'thr-rls-other-req@example.com', N'accepted', SYSDATETIMEOFFSET())`
  );
  otherEngagementRequestId = otherReqResult.recordset[0]?.id ?? "";

  // ─── Seed: Engagement rows ────────────────────────────────────────────────
  // Shared engagement: owned by ownerUser, participant A linked
  const sharedEngResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[Engagement]
       ([engagementRequestId], [clientUserId], [status], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES ('${sharedEngagementRequestId}', '${ownerUserId}', N'New', SYSDATETIMEOFFSET())`
  );
  sharedEngagementId = sharedEngResult.recordset[0]?.id ?? "";

  // Other engagement: owned by unrelatedClient (cross-engagement isolation test)
  const otherEngResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[Engagement]
       ([engagementRequestId], [clientUserId], [status], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES ('${otherEngagementRequestId}', '${unrelatedClientUserId}', N'New', SYSDATETIMEOFFSET())`
  );
  otherEngagementId = otherEngResult.recordset[0]?.id ?? "";

  // ─── Seed: EngagementParticipant rows (≥2 — TASK-017-012 Finding 2) ─────────
  // Link participant A to the SHARED engagement (first participant)
  const linkAResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[EngagementParticipant]
       ([engagementId], [userId], [role])
     OUTPUT INSERTED.[id]
     VALUES ('${sharedEngagementId}', '${participantAUserId}', N'CLIENT')`
  );
  participantALinkId = linkAResult.recordset[0]?.id ?? "";

  // Link participant B to the SAME shared engagement (second participant).
  // TASK-017-012 Finding 2: proves the "every participant reads" contract (≥2 participants).
  // fn_thread_access 3a-participant branch: EXISTS (SELECT 1 FROM EngagementParticipant ep
  //   WHERE ep.userId = User.id AND ep.engagementId = Thread.engagementId)
  // — must pass for BOTH participant A and participant B. // CS-SQL-001 // AC-MSG-001-04
  const linkBResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[EngagementParticipant]
       ([engagementId], [userId], [role])
     OUTPUT INSERTED.[id]
     VALUES ('${sharedEngagementId}', '${participantBUserId}', N'CLIENT')`
  );
  participantBLinkId = linkBResult.recordset[0]?.id ?? "";

  // ─── Seed: Thread rows ────────────────────────────────────────────────────
  // Engagement thread: kind='engagement', engagementId=sharedEngagementId
  const engThreadResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[Thread]
       ([kind], [engagementId], [clientUserId], [status], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'engagement', '${sharedEngagementId}', NULL, N'active', SYSDATETIMEOFFSET())`
  );
  engagementThreadId = engThreadResult.recordset[0]?.id ?? "";

  // General thread: kind='general', clientUserId=generalClientUserId
  const genThreadResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[Thread]
       ([kind], [engagementId], [clientUserId], [status], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'general', NULL, '${generalClientUserId}', N'active', SYSDATETIMEOFFSET())`
  );
  generalThreadId = genThreadResult.recordset[0]?.id ?? "";

  // NOTE: unrelatedClient owns otherEngagement but has NO link to the shared engagement's thread.
}, 30000);

afterAll(async () => {
  // Cleanup via admin pool (bypasses RLS BLOCK predicates) — reverse dependency order

  // Thread rows
  if (engagementThreadId) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[Thread] WHERE [id] = '${engagementThreadId}'`
    ).catch(() => { /* ignore */ });
  }
  if (generalThreadId) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[Thread] WHERE [id] = '${generalThreadId}'`
    ).catch(() => { /* ignore */ });
  }

  // EngagementParticipant rows (A + B — TASK-017-012 Finding 2)
  if (participantALinkId) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[EngagementParticipant] WHERE [id] = '${participantALinkId}'`
    ).catch(() => { /* ignore */ });
  }
  if (participantBLinkId) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[EngagementParticipant] WHERE [id] = '${participantBLinkId}'`
    ).catch(() => { /* ignore */ });
  }

  // Engagement rows
  if (sharedEngagementId) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[Engagement] WHERE [id] = '${sharedEngagementId}'`
    ).catch(() => { /* ignore */ });
  }
  if (otherEngagementId) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[Engagement] WHERE [id] = '${otherEngagementId}'`
    ).catch(() => { /* ignore */ });
  }

  // EngagementRequest rows
  if (sharedEngagementRequestId) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[EngagementRequest] WHERE [id] = '${sharedEngagementRequestId}'`
    ).catch(() => { /* ignore */ });
  }
  if (otherEngagementRequestId) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[EngagementRequest] WHERE [id] = '${otherEngagementRequestId}'`
    ).catch(() => { /* ignore */ });
  }

  // User rows (includes participantB — TASK-017-012 Finding 2)
  for (const uid of [ownerUserId, participantAUserId, participantBUserId, unrelatedClientUserId, generalClientUserId]) {
    if (uid) {
      await adminPool.request().query(
        `DELETE FROM [dbo].[User] WHERE [id] = '${uid}'`
      ).catch(() => { /* ignore */ });
    }
  }

  await adminPool.close().catch(() => { /* ignore */ });
  await requestPool.close().catch(() => { /* ignore */ });
}, 30000);

// ─── Tests: engagement-thread isolation (sec.pol_Thread) ─────────────────────

describe("sec.pol_Thread — engagement-thread isolation (AC-MSG-001-02 / HARD GATE)", () => {

  /**
   * [AC-MSG-001-02][POSITIVE] Engagement-thread owner reads their thread.
   * Named code path: fn_thread_access — 3a-owner CLIENT EXISTS branch.
   *   clerkId='thr_rls_owner' → User.id = ownerUserId → Engagement.clientUserId = ownerUserId
   *   → Engagement.id = engagementThreadId.engagementId → 1 row returned.
   * // CS-SQL-001 // CS-SQL-003 // ADR-005 // DECISION-017-A
   */
  it("[AC-MSG-001-02][POSITIVE] engagement-thread owner reads their thread", async () => {
    const result = await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = N'thr_rls_owner', @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = N'CLIENT', @read_only = 0;
       SELECT [id] FROM [dbo].[Thread]
       WHERE [id] = '${engagementThreadId}';`
    );
    const recordsets = result.recordsets as Array<Array<{ id?: string }>>;
    const rows = recordsets[recordsets.length - 1];
    await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = NULL, @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = NULL, @read_only = 0;`
    );
    expect(rows).toHaveLength(1);
    expect(rows?.[0]?.id).toBe(engagementThreadId);
  });

  /**
   * [AC-MSG-001-02][NEGATIVE] Non-participant CLIENT reads ZERO — isolation HARD gate.
   * Named code path: fn_thread_access — 3a-owner EXISTS empty (unrelated is not owner);
   *   3a-participant EXISTS empty (no EngagementParticipant row for unrelated user);
   *   3b EXISTS empty (engagementThread.clientUserId IS NULL).
   * → predicate empty → FILTER removes row → 0 rows (fail-closed).
   * // CS-SQL-001 // CS-SQL-003 // ADR-005 // DECISION-017-A
   */
  it("[AC-MSG-001-02][NEGATIVE] non-participant CLIENT reads ZERO — isolation HARD", async () => {
    const result = await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = N'thr_rls_unrelated', @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = N'CLIENT', @read_only = 0;
       SELECT [id] FROM [dbo].[Thread]
       WHERE [id] = '${engagementThreadId}';`
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
   * [ADR-005][NEGATIVE] Null SESSION_CONTEXT reads ZERO — fail-closed (ADR-003 §5).
   * All branches require non-null SESSION_CONTEXT; null → all EXISTS empty → 0 rows.
   * // CS-SQL-003 // ADR-003 §5
   */
  it("[ADR-005][NEGATIVE] null SESSION_CONTEXT reads ZERO — fail-closed", async () => {
    const result = await requestPool.request().query(
      `SELECT COUNT(*) AS cnt FROM [dbo].[Thread]
       WHERE [id] = '${engagementThreadId}'`
    );
    const cnt = (result.recordset as Array<{ cnt?: number }>)[0]?.cnt ?? -1;
    expect(cnt).toBe(0);
  });

  /**
   * [ADR-005][POSITIVE] ACCOUNTANT reads all threads — full visibility preserved.
   * Predicate branch: CAST(SESSION_CONTEXT(N'role') AS NVARCHAR(16)) = N'ACCOUNTANT'
   * // CS-SQL-003
   */
  it("[ADR-005][POSITIVE] ACCOUNTANT reads all threads", async () => {
    const result = await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = N'thr_rls_accountant', @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = N'ACCOUNTANT', @read_only = 0;
       SELECT [id] FROM [dbo].[Thread]
       WHERE [id] IN ('${engagementThreadId}', '${generalThreadId}');`
    );
    const recordsets = result.recordsets as Array<Array<{ id?: string }>>;
    const rows = recordsets[recordsets.length - 1];
    await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = NULL, @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = NULL, @read_only = 0;`
    );
    expect(rows).toHaveLength(2);
    const ids = (rows ?? []).map((r) => r.id);
    expect(ids).toContain(engagementThreadId);
    expect(ids).toContain(generalThreadId);
  });

  /**
   * [AC-MSG-001-02][POSITIVE] Multi-participant (≥2): participantA reads the shared engagement thread.
   * TASK-017-012 Finding 2: ≥2 EngagementParticipant rows seeded; both must read.
   * Named code path: fn_thread_access — 3a-participant CLIENT EXISTS branch.
   *   clerkId='thr_rls_participant_a' → User.id = participantAUserId
   *   → EngagementParticipant.engagementId = sharedEngagementId → EXISTS passes.
   * // CS-SQL-001 // CS-SQL-003 // ADR-005 // DECISION-017-A // AC-MSG-001-04
   */
  it("[AC-MSG-001-02][POSITIVE] multi-participant (≥2): participantA reads the shared engagement thread", async () => {
    const result = await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = N'thr_rls_participant_a', @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = N'CLIENT', @read_only = 0;
       SELECT [id] FROM [dbo].[Thread]
       WHERE [id] = '${engagementThreadId}';`
    );
    const recordsets = result.recordsets as Array<Array<{ id?: string }>>;
    const rows = recordsets[recordsets.length - 1];
    await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = NULL, @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = NULL, @read_only = 0;`
    );
    expect(rows).toHaveLength(1);
    expect(rows?.[0]?.id).toBe(engagementThreadId);
  });

  /**
   * [AC-MSG-001-02][POSITIVE] Multi-participant (≥2): participantB reads the shared engagement thread.
   * TASK-017-012 Finding 2: the second participant (participantB, clerkId='thr_rls_participant_b')
   * must ALSO read the shared engagement thread.
   * Named code path: fn_thread_access — 3a-participant CLIENT EXISTS branch.
   *   clerkId='thr_rls_participant_b' → User.id = participantBUserId
   *   → EngagementParticipant.engagementId = sharedEngagementId → EXISTS passes.
   * This is the brief's "every participant reads" (martha-and-james) SDET trap.
   * // CS-SQL-001 // CS-SQL-003 // ADR-005 // DECISION-017-A // AC-MSG-001-02 // AC-MSG-001-04
   */
  it("[AC-MSG-001-02][POSITIVE] multi-participant (≥2): participantB reads the shared engagement thread", async () => {
    const result = await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = N'thr_rls_participant_b', @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = N'CLIENT', @read_only = 0;
       SELECT [id] FROM [dbo].[Thread]
       WHERE [id] = '${engagementThreadId}';`
    );
    const recordsets = result.recordsets as Array<Array<{ id?: string }>>;
    const rows = recordsets[recordsets.length - 1];
    await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = NULL, @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = NULL, @read_only = 0;`
    );
    expect(rows).toHaveLength(1);
    expect(rows?.[0]?.id).toBe(engagementThreadId);
  });

  /**
   * [AC-MSG-001-02][POSITIVE] Multi-participant (≥2): BOTH participantA and participantB
   * read the shared engagement thread in the same query.
   * TASK-017-012 Finding 2: proves the documented contract — every participant reads.
   * Reads the thread as both participants and asserts 1 row each; then confirms that
   * querying for BOTH participants returns 1 row each (not 0 for either).
   * Named code path: fn_thread_access — 3a-participant branch, evaluated independently
   * for each SESSION_CONTEXT clerk_user_id value.
   * // CS-SQL-001 // CS-SQL-003 // ADR-005 // DECISION-017-A // AC-MSG-001-02 // AC-MSG-001-04
   */
  it("[AC-MSG-001-02][POSITIVE] multi-participant (≥2): both participantA and participantB read the shared engagement thread", async () => {
    // Check participantA
    const resultA = await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = N'thr_rls_participant_a', @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = N'CLIENT', @read_only = 0;
       SELECT [id] FROM [dbo].[Thread]
       WHERE [id] = '${engagementThreadId}';`
    );
    const recordsetsA = resultA.recordsets as Array<Array<{ id?: string }>>;
    const rowsA = recordsetsA[recordsetsA.length - 1];
    await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = NULL, @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = NULL, @read_only = 0;`
    );

    // Check participantB
    const resultB = await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = N'thr_rls_participant_b', @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = N'CLIENT', @read_only = 0;
       SELECT [id] FROM [dbo].[Thread]
       WHERE [id] = '${engagementThreadId}';`
    );
    const recordsetsB = resultB.recordsets as Array<Array<{ id?: string }>>;
    const rowsB = recordsetsB[recordsetsB.length - 1];
    await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = NULL, @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = NULL, @read_only = 0;`
    );

    // BOTH participants must read exactly 1 row (the shared engagement thread)
    expect(rowsA, "[AC-MSG-001-02] participantA must read the shared engagement thread").toHaveLength(1);
    expect(rowsA?.[0]?.id, "[AC-MSG-001-02] participantA reads correct thread id").toBe(engagementThreadId);

    expect(rowsB, "[AC-MSG-001-02] participantB must read the shared engagement thread").toHaveLength(1);
    expect(rowsB?.[0]?.id, "[AC-MSG-001-02] participantB reads correct thread id").toBe(engagementThreadId);
  });

  /**
   * [AC-MSG-001-02][NEGATIVE] Client on different engagement reads ZERO — cross-engagement isolation.
   * unrelatedClient owns otherEngagement but has NO access to the shared engagement's thread.
   * Named code path: fn_thread_access — 3a-owner EXISTS: ownerUserId ≠ unrelatedClientUserId;
   *   3a-participant EXISTS: no EP link for unrelatedClient to sharedEngagementId;
   *   3b EXISTS: engagementThread.clientUserId IS NULL.
   * → All EXISTS empty → predicate empty → FILTER removes row → 0 rows.
   * // CS-SQL-001 // CS-SQL-003 // ADR-005
   */
  it("[AC-MSG-001-02][NEGATIVE] client on different engagement reads ZERO — cross-engagement isolation", async () => {
    const result = await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = N'thr_rls_unrelated', @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = N'CLIENT', @read_only = 0;
       SELECT [id] FROM [dbo].[Thread]
       WHERE [id] = '${engagementThreadId}';`
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

// ─── Tests: general-thread isolation (sec.pol_Thread) ─────────────────────────

describe("sec.pol_Thread — general-thread isolation (AC-MSG-006-02 / HARD GATE)", () => {

  /**
   * [AC-MSG-006-02][POSITIVE] General-thread: associated client reads their thread.
   * Named code path: fn_thread_access — 3b CLIENT general-thread EXISTS branch.
   *   clerkId='thr_rls_general_client' → User.id = generalClientUserId
   *   = Thread.clientUserId → EXISTS passes.
   * // CS-SQL-001 // CS-SQL-003 // ADR-005 // DECISION-017-A // AC-MSG-006-02
   */
  it("[AC-MSG-006-02][POSITIVE] general-thread: associated client reads their thread", async () => {
    const result = await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = N'thr_rls_general_client', @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = N'CLIENT', @read_only = 0;
       SELECT [id] FROM [dbo].[Thread]
       WHERE [id] = '${generalThreadId}';`
    );
    const recordsets = result.recordsets as Array<Array<{ id?: string }>>;
    const rows = recordsets[recordsets.length - 1];
    await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = NULL, @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = NULL, @read_only = 0;`
    );
    expect(rows).toHaveLength(1);
    expect(rows?.[0]?.id).toBe(generalThreadId);
  });

  /**
   * [AC-MSG-006-02][NEGATIVE] General-thread: unrelated client reads ZERO.
   * The unrelated client is NOT the Thread.clientUserId for the general thread.
   * Named code path: fn_thread_access — 3a-owner EXISTS: generalThread.engagementId IS NULL;
   *   3a-participant EXISTS: generalThread.engagementId IS NULL;
   *   3b EXISTS: unrelatedClientUserId ≠ generalThread.clientUserId → EXISTS empty.
   * → 0 rows (fail-closed).
   * // CS-SQL-001 // CS-SQL-003 // ADR-005 // DECISION-017-A // AC-MSG-006-02
   */
  it("[AC-MSG-006-02][NEGATIVE] general-thread: unrelated client reads ZERO", async () => {
    const result = await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = N'thr_rls_unrelated', @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = N'CLIENT', @read_only = 0;
       SELECT [id] FROM [dbo].[Thread]
       WHERE [id] = '${generalThreadId}';`
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
   * [AC-MSG-006-02][POSITIVE] General-thread: ACCOUNTANT reads all.
   * ACCOUNTANT branch passes unconditionally for all thread kinds.
   * // CS-SQL-003 // ADR-005
   */
  it("[AC-MSG-006-02][POSITIVE] general-thread: ACCOUNTANT reads all", async () => {
    const result = await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = N'thr_rls_accountant', @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = N'ACCOUNTANT', @read_only = 0;
       SELECT [id] FROM [dbo].[Thread]
       WHERE [id] = '${generalThreadId}';`
    );
    const recordsets = result.recordsets as Array<Array<{ id?: string }>>;
    const rows = recordsets[recordsets.length - 1];
    await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = NULL, @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = NULL, @read_only = 0;`
    );
    expect(rows).toHaveLength(1);
    expect(rows?.[0]?.id).toBe(generalThreadId);
  });

});

// ─── Admin pool sanity check ──────────────────────────────────────────────────

describe("admin pool sanity check — RLS-exempt reads", () => {

  /**
   * [POSITIVE] Admin pool reads both seeded Thread rows — RLS-exempt.
   * IS_MEMBER('app_admin_role') = 1 → predicate always passes.
   */
  it("[POSITIVE] admin pool (app_admin_role) reads both seeded Thread rows — RLS-exempt", async () => {
    const result = await adminPool.request().query<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM [dbo].[Thread]
       WHERE [id] IN ('${engagementThreadId}', '${generalThreadId}')`
    );
    const cnt = result.recordset[0]?.cnt ?? 0;
    expect(cnt).toBe(2);
  });

  /**
   * [AC-MSG-001-01] One thread per engagement — @@unique enforced.
   * Verify the seeded engagement thread is unique per engagementId.
   */
  it("[AC-MSG-001-01] one thread per engagement — @@unique([engagementId]) enforced at DB level", async () => {
    // Admin read: confirm there is exactly one Thread for sharedEngagementId
    const result = await adminPool.request().query<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM [dbo].[Thread]
       WHERE [engagementId] = '${sharedEngagementId}'`
    );
    expect(result.recordset[0]?.cnt).toBe(1);

    // Attempt to insert a duplicate engagement thread → should fail (unique index violation)
    let insertError: Error | null = null;
    try {
      await adminPool.request().query(
        `INSERT INTO [dbo].[Thread] ([kind], [engagementId], [clientUserId], [status], [updatedAt])
         VALUES (N'engagement', '${sharedEngagementId}', NULL, N'active', SYSDATETIMEOFFSET())`
      );
    } catch (err) {
      insertError = err as Error;
    }
    // Cleanup: if insert somehow succeeded, delete the duplicate
    await adminPool.request().query(
      `DELETE FROM [dbo].[Thread]
       WHERE [engagementId] = '${sharedEngagementId}' AND [id] <> '${engagementThreadId}'`
    ).catch(() => { /* ignore */ });

    // The insert MUST have failed (unique index violation)
    expect(insertError).not.toBeNull();
    expect(insertError?.message).toMatch(/unique|duplicate|violation/i);
  });

});
