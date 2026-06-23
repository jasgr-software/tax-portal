/**
 * packages/db/src/engagement-participant.client-isolation.rls.test.ts
 *
 * TIER-3 INTEGRATION TEST — requires real SQL Server (ADR-005 §6, HARD GATE)
 *
 * Tests the following security policies (EPIC-012 / TASK-012-001):
 *   1. sec.pol_EngagementParticipant — new scoped table: a participant sees only their
 *      own link rows; unrelated CLIENT sees ZERO. (CS-SQL-001: HARD requirement)
 *   2. sec.pol_Engagement (extended) — engagement access via participant link: a linked
 *      participant reaches the shared engagement; unrelated CLIENT sees ZERO. (DECISION-D)
 *
 * Acceptance criteria covered (AC-id test-tag contract, per BRIEF-012 methodology):
 *   AC-AUTH-007-03  — Each participant reaches the shared engagement through their own account
 *                     and sees no unrelated client's data.
 *   AC-AUTH-007-01  — A single engagement may have more than one CLIENT participant.
 *   AC-LIFE-012-01  — An engagement can have more than one participant linked to it.
 *   AC-LIFE-012-03  — All participants linked to an engagement are associated with the same engagement.
 *   AC-LIFE-010-02  — Each of a client's concurrent engagements is tracked independently of the others.
 *   AC-AUTH-003-regression — The primary clientUserId owner still reads their engagement (no regression).
 *
 * ADR-005 §6 minimum coverage per policy (all present below + extra cases):
 *   [AC-AUTH-007-03][POSITIVE]   Participant (via EngagementParticipant link) reads the shared engagement
 *   [AC-AUTH-007-03][NEGATIVE]   Unrelated CLIENT sees ZERO rows for that engagement — isolation (HARD)
 *   [ADR-005][NEGATIVE]          Anonymous / null SESSION_CONTEXT reads ZERO — fail-closed
 *   [ADR-005][POSITIVE]          ACCOUNTANT reads all engagements — full visibility preserved
 *   [AC-AUTH-003-regression]     The primary clientUserId owner still reads their engagement — no regression
 *   [AC-AUTH-007-01]             Two CLIENT participants both reach the one shared engagement
 *   [AC-LIFE-012-01][AC-LIFE-012-03] An engagement links >1 participant; both associate to same engagement
 *   [AC-LIFE-010-02]             Concurrent engagement for same client (different service/tax-year) is isolated
 *   [CS-SQL-001]                 EngagementParticipant rows: a participant reads only their own link rows
 *
 * Gate Authoring Evidence (ENGINE.md § Gate Authoring Rules — INTRODUCES-GATE: no):
 *   This test gates the new policies introduced in TASK-012-001. It does NOT introduce a new
 *   CI gate — it is a continuation of the existing RLS hard-gate pattern (CS-SQL-001).
 *   The pre-existing pattern's gate was introduced in TASK-005-001 and TASK-006-001.
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
 * // CS-SQL-001 // CS-SQL-003 // ADR-005 // ADR-003 // DECISION-D (BRIEF-012)
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
 * Three users for multi-participant isolation testing:
 *   - ownerUser:          the clientUserId owner of the shared engagement (AC-AUTH-003)
 *   - participantA:       a linked participant via EngagementParticipant (AC-AUTH-007-03)
 *   - participantB:       a second linked participant (AC-AUTH-007-01)
 *   - unrelatedClient:    a CLIENT with no link to the shared engagement (isolation HARD)
 */
let ownerUserId: string;
let participantAUserId: string;
let participantBUserId: string;
let unrelatedClientUserId: string;

/** The shared engagement that both participants link to. */
let sharedEngagementId: string;
/** A second engagement for ownerUser — concurrent engagement (AC-LIFE-010-02). */
let concurrentEngagementId: string;

/** EngagementRequests (1:1 FK required on Engagement). */
let sharedEngagementRequestId: string;
let concurrentEngagementRequestId: string;

/** EngagementParticipant rows. */
let participantALinkId: string;
let participantBLinkId: string;

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
  // Owner: the primary clientUserId of the shared engagement (AC-AUTH-003 no-regression)
  const ownerResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[User] ([clerkId], [email], [role], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'ep_rls_owner', N'ep-rls-owner@example.com', N'CLIENT', SYSDATETIMEOFFSET())`
  );
  ownerUserId = ownerResult.recordset[0]?.id ?? "";

  // Participant A: a linked participant via EngagementParticipant (AC-AUTH-007-03)
  const participantAResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[User] ([clerkId], [email], [role], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'ep_rls_participant_a', N'ep-rls-participant-a@example.com', N'CLIENT', SYSDATETIMEOFFSET())`
  );
  participantAUserId = participantAResult.recordset[0]?.id ?? "";

  // Participant B: a second linked participant (AC-AUTH-007-01 — multiple participants)
  const participantBResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[User] ([clerkId], [email], [role], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'ep_rls_participant_b', N'ep-rls-participant-b@example.com', N'CLIENT', SYSDATETIMEOFFSET())`
  );
  participantBUserId = participantBResult.recordset[0]?.id ?? "";

  // Unrelated client: no link to the shared engagement (isolation HARD gate)
  const unrelatedResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[User] ([clerkId], [email], [role], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'ep_rls_unrelated', N'ep-rls-unrelated@example.com', N'CLIENT', SYSDATETIMEOFFSET())`
  );
  unrelatedClientUserId = unrelatedResult.recordset[0]?.id ?? "";

  // ─── Seed: EngagementRequest rows (1:1 FK required) ──────────────────────
  const sharedReqResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[EngagementRequest] ([firstName], [lastName], [email], [status], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'EP', N'RLSOwner', N'ep-rls-owner-req@example.com', N'accepted', SYSDATETIMEOFFSET())`
  );
  sharedEngagementRequestId = sharedReqResult.recordset[0]?.id ?? "";

  const concurrentReqResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[EngagementRequest] ([firstName], [lastName], [email], [status], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'EP', N'RLSOwner2', N'ep-rls-owner-req2@example.com', N'accepted', SYSDATETIMEOFFSET())`
  );
  concurrentEngagementRequestId = concurrentReqResult.recordset[0]?.id ?? "";

  // ─── Seed: Engagement rows (admin pool bypasses BLOCK predicate) ──────────
  // Shared engagement: owned by ownerUser (clientUserId), participants A + B linked
  const sharedEngResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[Engagement]
       ([engagementRequestId], [clientUserId], [status], [taxYear], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES ('${sharedEngagementRequestId}', '${ownerUserId}', N'New', 2024, SYSDATETIMEOFFSET())`
  );
  sharedEngagementId = sharedEngResult.recordset[0]?.id ?? "";

  // Concurrent engagement: also owned by ownerUser (different taxYear — AC-LIFE-010-02)
  const concurrentEngResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[Engagement]
       ([engagementRequestId], [clientUserId], [status], [taxYear], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES ('${concurrentEngagementRequestId}', '${ownerUserId}', N'New', 2025, SYSDATETIMEOFFSET())`
  );
  concurrentEngagementId = concurrentEngResult.recordset[0]?.id ?? "";

  // ─── Seed: EngagementParticipant rows (admin pool — bypasses BLOCK predicate) ─
  // AC-LIFE-012-01/-03: link both participants to the SHARED engagement
  const linkAResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[EngagementParticipant]
       ([engagementId], [userId], [role])
     OUTPUT INSERTED.[id]
     VALUES ('${sharedEngagementId}', '${participantAUserId}', N'CLIENT')`
  );
  participantALinkId = linkAResult.recordset[0]?.id ?? "";

  const linkBResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[EngagementParticipant]
       ([engagementId], [userId], [role])
     OUTPUT INSERTED.[id]
     VALUES ('${sharedEngagementId}', '${participantBUserId}', N'CLIENT')`
  );
  participantBLinkId = linkBResult.recordset[0]?.id ?? "";

  // NOTE: unrelatedClient has NO EngagementParticipant link — that's the isolation gate.
  // NOTE: ownerUser has NO EngagementParticipant link — they access via clientUserId (AC-AUTH-003).
}, 30000);

afterAll(async () => {
  // Cleanup via admin pool (bypasses RLS BLOCK predicates) — reverse dependency order

  // EngagementParticipant rows first (FK → Engagement)
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

  // Engagements (FK → EngagementRequest)
  if (sharedEngagementId) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[Engagement] WHERE [id] = '${sharedEngagementId}'`
    ).catch(() => { /* ignore */ });
  }
  if (concurrentEngagementId) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[Engagement] WHERE [id] = '${concurrentEngagementId}'`
    ).catch(() => { /* ignore */ });
  }

  // EngagementRequest rows
  if (sharedEngagementRequestId) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[EngagementRequest] WHERE [id] = '${sharedEngagementRequestId}'`
    ).catch(() => { /* ignore */ });
  }
  if (concurrentEngagementRequestId) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[EngagementRequest] WHERE [id] = '${concurrentEngagementRequestId}'`
    ).catch(() => { /* ignore */ });
  }

  // User rows
  if (ownerUserId) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[User] WHERE [id] = '${ownerUserId}'`
    ).catch(() => { /* ignore */ });
  }
  if (participantAUserId) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[User] WHERE [id] = '${participantAUserId}'`
    ).catch(() => { /* ignore */ });
  }
  if (participantBUserId) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[User] WHERE [id] = '${participantBUserId}'`
    ).catch(() => { /* ignore */ });
  }
  if (unrelatedClientUserId) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[User] WHERE [id] = '${unrelatedClientUserId}'`
    ).catch(() => { /* ignore */ });
  }

  await adminPool.close().catch(() => { /* ignore */ });
  await requestPool.close().catch(() => { /* ignore */ });
}, 30000);

// ─── Tests: Engagement access via participant link (sec.pol_Engagement extended) ──────────────

describe("sec.pol_Engagement (extended) — participant-link access (AC-AUTH-007-03 / DECISION-D / HARD GATE)", () => {

  /**
   * [AC-AUTH-007-03][POSITIVE] Participant A reads the shared engagement via their link.
   * Named code path: fn_engagement_access — 3b CLIENT participant EXISTS branch.
   *   clerkId='ep_rls_participant_a' → User.id = participantAUserId
   *   → EngagementParticipant.engagementId = sharedEngagementId → EXISTS passes
   * → 1 row returned (participant A sees the shared engagement).
   * // CS-SQL-003 // ADR-005 // DECISION-D
   */
  it("[AC-AUTH-007-03] a participant linked via EngagementParticipant reads the shared engagement — positive", async () => {
    const result = await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = N'ep_rls_participant_a', @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = N'CLIENT', @read_only = 0;
       SELECT [id] FROM [dbo].[Engagement]
       WHERE [id] = '${sharedEngagementId}';`
    );

    const recordsets = result.recordsets as Array<Array<{ id?: string }>>;
    const selectRecordset = recordsets[recordsets.length - 1];

    // Clear context
    await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = NULL, @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = NULL, @read_only = 0;`
    );

    // Participant A MUST see the shared engagement (3b participant EXISTS branch passes)
    expect(selectRecordset).toHaveLength(1);
    expect(selectRecordset?.[0]?.id).toBe(sharedEngagementId);
  });

  /**
   * [AC-AUTH-007-03][NEGATIVE] Unrelated CLIENT sees ZERO rows — isolation (ADR-005 HARD).
   * Named code path: fn_engagement_access — 3a owner EXISTS empty (unrelated user is not owner);
   *   3b participant EXISTS empty (no EngagementParticipant row for unrelated user).
   * → predicate empty → FILTER removes row → 0 rows (fail-closed).
   * // CS-SQL-003 // ADR-005 // DECISION-D
   */
  it("[AC-AUTH-007-03] an unrelated CLIENT sees ZERO rows for that engagement — isolation (ADR-005 HARD)", async () => {
    const result = await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = N'ep_rls_unrelated', @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = N'CLIENT', @read_only = 0;
       SELECT [id] FROM [dbo].[Engagement]
       WHERE [id] = '${sharedEngagementId}';`
    );

    const recordsets = result.recordsets as Array<Array<{ id?: string }>>;
    const selectRecordset = recordsets[recordsets.length - 1];

    // Clear context
    await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = NULL, @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = NULL, @read_only = 0;`
    );

    // Unrelated CLIENT MUST NOT see the shared engagement (BOTH EXISTS branches empty)
    expect(selectRecordset).toHaveLength(0);
  });

  /**
   * [ADR-005][NEGATIVE] Null SESSION_CONTEXT reads ZERO rows — fail-closed, no error.
   * ADR-003 §5: null identity → all three branches fail → predicate empty → 0 rows.
   * // CS-SQL-003 // ADR-003 §5
   */
  it("[ADR-005] null/anonymous SESSION_CONTEXT reads ZERO — fail-closed", async () => {
    // No SESSION_CONTEXT set — anonymous path
    const result = await requestPool.request().query(
      `SELECT COUNT(*) AS cnt FROM [dbo].[Engagement]
       WHERE [id] = '${sharedEngagementId}'`
    );

    const cnt = (result.recordset as Array<{ cnt?: number }>)[0]?.cnt ?? -1;
    // Null SESSION_CONTEXT → predicate empty → FILTER removes all rows → 0 (fail-closed)
    expect(cnt).toBe(0);
  });

  /**
   * [ADR-005][POSITIVE] ACCOUNTANT reads all engagements — full visibility preserved.
   * Predicate branch: CAST(SESSION_CONTEXT(N'role') AS NVARCHAR(16)) = N'ACCOUNTANT'
   * ACCOUNTANT sees both the shared engagement and the concurrent engagement.
   * // CS-SQL-003
   */
  it("[ADR-005] ACCOUNTANT reads all engagements — full visibility preserved", async () => {
    const result = await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = N'ep_rls_accountant', @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = N'ACCOUNTANT', @read_only = 0;
       SELECT [id] FROM [dbo].[Engagement]
       WHERE [id] IN ('${sharedEngagementId}', '${concurrentEngagementId}');`
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
    expect(ids).toContain(sharedEngagementId);
    expect(ids).toContain(concurrentEngagementId);
  });

  /**
   * [AC-AUTH-003-regression] Primary clientUserId owner still reads their engagement — no regression.
   * Named code path: fn_engagement_access — 3a owner EXISTS branch (ORIGINAL, byte-identical).
   *   clerkId='ep_rls_owner' → User.id = ownerUserId → Engagement.clientUserId = ownerUserId
   * → 1 row returned (owner sees the shared engagement via the ORIGINAL branch).
   * This test verifies the extension to 3b did NOT break the existing 3a owner branch.
   * // CS-SQL-003 // ADR-005 // DECISION-D (additive — 3a preserved byte-identical)
   */
  it("[AC-AUTH-003-regression] the primary clientUserId owner still reads their engagement — no regression", async () => {
    const result = await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = N'ep_rls_owner', @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = N'CLIENT', @read_only = 0;
       SELECT [id] FROM [dbo].[Engagement]
       WHERE [id] = '${sharedEngagementId}';`
    );

    const recordsets = result.recordsets as Array<Array<{ id?: string }>>;
    const selectRecordset = recordsets[recordsets.length - 1];

    // Clear context
    await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = NULL, @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = NULL, @read_only = 0;`
    );

    // Owner MUST still see the shared engagement (3a branch still byte-identical)
    expect(selectRecordset).toHaveLength(1);
    expect(selectRecordset?.[0]?.id).toBe(sharedEngagementId);
  });

  /**
   * [AC-AUTH-007-01] Two CLIENT participants both reach the one shared engagement.
   * Named code path: fn_engagement_access — 3b participant EXISTS branch for both.
   *   Participant A: clerkId='ep_rls_participant_a' → linked → 1 row
   *   Participant B: clerkId='ep_rls_participant_b' → linked → 1 row
   * Both reach the SAME shared engagement (AC-LIFE-012-03: all link to the same engagement).
   * // CS-SQL-003 // ADR-005 // AC-AUTH-007-01 // AC-LIFE-012-01 // AC-LIFE-012-03
   */
  it("[AC-AUTH-007-01] two CLIENT participants both reach the one shared engagement", async () => {
    // Participant B checks
    const result = await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = N'ep_rls_participant_b', @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = N'CLIENT', @read_only = 0;
       SELECT [id] FROM [dbo].[Engagement]
       WHERE [id] = '${sharedEngagementId}';`
    );

    const recordsets = result.recordsets as Array<Array<{ id?: string }>>;
    const selectRecordset = recordsets[recordsets.length - 1];

    // Clear context
    await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = NULL, @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = NULL, @read_only = 0;`
    );

    // Participant B MUST see the shared engagement
    expect(selectRecordset).toHaveLength(1);
    expect(selectRecordset?.[0]?.id).toBe(sharedEngagementId);
  });

  /**
   * [AC-LIFE-012-01][AC-LIFE-012-03] An engagement links >1 participant; all associate to the same engagement.
   * Verifies the data model: the shared engagement has exactly two EngagementParticipant rows (admin view).
   * Both participants (A + B) are linked to the SAME engagement (sharedEngagementId).
   * // AC-LIFE-012-01 // AC-LIFE-012-03
   */
  it("[AC-LIFE-012-01][AC-LIFE-012-03] an engagement links >1 participant; all associate to the same engagement", async () => {
    // Admin pool read (RLS-exempt): count participant rows for the shared engagement
    const result = await adminPool.request().query<{ cnt: number; engagementId: string }>(
      `SELECT COUNT(*) AS cnt, [engagementId]
       FROM [dbo].[EngagementParticipant]
       WHERE [id] IN ('${participantALinkId}', '${participantBLinkId}')
       GROUP BY [engagementId]`
    );

    // Both participant rows exist AND both reference the SAME engagement
    expect(result.recordset).toHaveLength(1); // one group (same engagementId)
    expect(result.recordset[0]?.cnt).toBe(2); // two participants
    expect(result.recordset[0]?.engagementId).toBe(sharedEngagementId); // same engagement
  });

  /**
   * [AC-LIFE-010-02] Concurrent engagement for the same client (different tax-year) is isolated.
   * Participant A is linked to the shared engagement (taxYear=2024) but NOT to the concurrent
   * engagement (taxYear=2025, owned by the same client). The participant path should NOT
   * widen access to engagements the participant is not linked to.
   * // AC-LIFE-010-02 // CS-SQL-003 // ADR-005
   */
  it("[AC-LIFE-010-02] a second concurrent engagement for the same client (different tax-year) is isolated — participant cannot see it", async () => {
    // Participant A is linked to sharedEngagementId (taxYear=2024).
    // concurrentEngagementId (taxYear=2025) is owned by ownerUser via clientUserId,
    // but participant A has NO EngagementParticipant link to it.
    const result = await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = N'ep_rls_participant_a', @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = N'CLIENT', @read_only = 0;
       SELECT [id] FROM [dbo].[Engagement]
       WHERE [id] = '${concurrentEngagementId}';`
    );

    const recordsets = result.recordsets as Array<Array<{ id?: string }>>;
    const selectRecordset = recordsets[recordsets.length - 1];

    // Clear context
    await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = NULL, @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = NULL, @read_only = 0;`
    );

    // Participant A MUST NOT see the concurrent engagement (no link to it)
    // This proves concurrent engagements are scoped independently (AC-LIFE-010-02)
    expect(selectRecordset).toHaveLength(0);
  });

  /**
   * [AC-LIFE-010-02] Owner sees BOTH concurrent engagements — ownership path not narrowed.
   * The owner (clientUserId) access to BOTH their own engagements must still work after
   * the participant extension. This is the owner-scope consistency check for AC-LIFE-010-02.
   * // AC-LIFE-010-02 // AC-AUTH-003-regression
   */
  it("[AC-LIFE-010-02] owner sees both their concurrent engagements via clientUserId — no narrowing", async () => {
    const result = await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = N'ep_rls_owner', @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = N'CLIENT', @read_only = 0;
       SELECT [id] FROM [dbo].[Engagement]
       WHERE [id] IN ('${sharedEngagementId}', '${concurrentEngagementId}');`
    );

    const recordsets = result.recordsets as Array<Array<{ id?: string }>>;
    const selectRecordset = recordsets[recordsets.length - 1];

    // Clear context
    await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = NULL, @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = NULL, @read_only = 0;`
    );

    // Owner MUST see both their engagements (3a owner branch works for both)
    expect(selectRecordset).toHaveLength(2);
    const ids = (selectRecordset ?? []).map((r) => r.id);
    expect(ids).toContain(sharedEngagementId);
    expect(ids).toContain(concurrentEngagementId);
  });

});

// ─── Tests: EngagementParticipant row isolation (sec.pol_EngagementParticipant) ───────────────

describe("sec.pol_EngagementParticipant — participant row isolation (CS-SQL-001 / ADR-005 §6, EPIC-012 FOURTH client-scoped table)", () => {

  /**
   * [CS-SQL-001][POSITIVE] Participant A reads only their own EngagementParticipant row.
   * Named code path: fn_engagement_participant_access — 3 CLIENT EXISTS branch.
   *   clerkId='ep_rls_participant_a' → User.id = participantAUserId
   *   → EngagementParticipant.id = participantALinkId → EXISTS passes
   * → 1 row returned (participant A sees their own link row).
   * // CS-SQL-001 // CS-SQL-003 // ADR-005
   */
  it("[CS-SQL-001] participant A reads only their own EngagementParticipant link row — positive", async () => {
    const result = await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = N'ep_rls_participant_a', @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = N'CLIENT', @read_only = 0;
       SELECT [id] FROM [dbo].[EngagementParticipant]
       WHERE [id] IN ('${participantALinkId}', '${participantBLinkId}');`
    );

    const recordsets = result.recordsets as Array<Array<{ id?: string }>>;
    const selectRecordset = recordsets[recordsets.length - 1];

    // Clear context
    await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = NULL, @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = NULL, @read_only = 0;`
    );

    // Participant A sees ONLY their own link row (not participant B's)
    expect(selectRecordset).toHaveLength(1);
    expect(selectRecordset?.[0]?.id).toBe(participantALinkId);
  });

  /**
   * [CS-SQL-001][NEGATIVE] Unrelated CLIENT sees ZERO EngagementParticipant rows — isolation (ADR-005 HARD).
   * Named code path: fn_engagement_participant_access — 3 CLIENT EXISTS empty.
   *   clerkId='ep_rls_unrelated' → no EngagementParticipant rows with userId = unrelated user
   * → EXISTS empty → predicate empty → FILTER removes all rows → 0 rows.
   * // CS-SQL-001 // CS-SQL-003 // ADR-005
   */
  it("[CS-SQL-001] an unrelated CLIENT sees ZERO EngagementParticipant rows — isolation (ADR-005 HARD)", async () => {
    const result = await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = N'ep_rls_unrelated', @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = N'CLIENT', @read_only = 0;
       SELECT [id] FROM [dbo].[EngagementParticipant]
       WHERE [id] IN ('${participantALinkId}', '${participantBLinkId}');`
    );

    const recordsets = result.recordsets as Array<Array<{ id?: string }>>;
    const selectRecordset = recordsets[recordsets.length - 1];

    // Clear context
    await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = NULL, @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = NULL, @read_only = 0;`
    );

    // Unrelated CLIENT MUST see ZERO participant rows (fail-closed — not a participant)
    expect(selectRecordset).toHaveLength(0);
  });

  /**
   * [ADR-005][NEGATIVE] Null SESSION_CONTEXT reads ZERO EngagementParticipant rows — fail-closed.
   * ADR-003 §5: null identity → all three branches fail → predicate empty → 0 rows, no error.
   * // CS-SQL-003 // ADR-003 §5
   */
  it("[ADR-005] null/anonymous SESSION_CONTEXT reads ZERO EngagementParticipant rows — fail-closed", async () => {
    // No SESSION_CONTEXT set — anonymous path
    const result = await requestPool.request().query(
      `SELECT COUNT(*) AS cnt FROM [dbo].[EngagementParticipant]
       WHERE [id] IN ('${participantALinkId}', '${participantBLinkId}')`
    );

    const cnt = (result.recordset as Array<{ cnt?: number }>)[0]?.cnt ?? -1;
    // Null SESSION_CONTEXT → predicate empty → FILTER removes all rows → 0 (fail-closed)
    expect(cnt).toBe(0);
  });

  /**
   * [ADR-005][POSITIVE] ACCOUNTANT reads all EngagementParticipant rows — full visibility.
   * Predicate branch: CAST(SESSION_CONTEXT(N'role') AS NVARCHAR(16)) = N'ACCOUNTANT'
   * ACCOUNTANT sees both participant link rows.
   * // CS-SQL-003
   */
  it("[ADR-005] ACCOUNTANT reads all EngagementParticipant rows — full visibility preserved", async () => {
    const result = await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = N'ep_rls_accountant', @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = N'ACCOUNTANT', @read_only = 0;
       SELECT [id] FROM [dbo].[EngagementParticipant]
       WHERE [id] IN ('${participantALinkId}', '${participantBLinkId}');`
    );

    const recordsets = result.recordsets as Array<Array<{ id?: string }>>;
    const selectRecordset = recordsets[recordsets.length - 1];

    // Clear context
    await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = NULL, @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = NULL, @read_only = 0;`
    );

    // ACCOUNTANT sees both participant link rows
    expect(selectRecordset).toHaveLength(2);
    const ids = (selectRecordset ?? []).map((r) => r.id);
    expect(ids).toContain(participantALinkId);
    expect(ids).toContain(participantBLinkId);
  });

});

// ─── Admin pool sanity check ──────────────────────────────────────────────────

describe("admin pool sanity check — RLS-exempt reads", () => {

  /**
   * [POSITIVE] Admin pool reads all seeded engagement participant rows — RLS-exempt.
   * IS_MEMBER('app_admin_role') = 1 → predicate always passes.
   */
  it("[POSITIVE] Admin pool (app_admin_role) reads both seeded EngagementParticipant rows — RLS-exempt", async () => {
    const result = await adminPool.request().query<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM [dbo].[EngagementParticipant]
       WHERE [id] IN ('${participantALinkId}', '${participantBLinkId}')`
    );
    const cnt = result.recordset[0]?.cnt ?? 0;
    // Admin pool bypasses RLS → sees both
    expect(cnt).toBe(2);
  });

  /**
   * [POSITIVE] Admin pool reads the taxYear column — data model verification.
   * Verifies the DECISION-B taxYear column is stored and readable correctly.
   * // DECISION-B (BRIEF-012)
   */
  it("[POSITIVE] Admin pool reads taxYear from both seeded engagements — data model verification (DECISION-B)", async () => {
    const result = await adminPool.request().query<{ id: string; taxYear: number | null }>(
      `SELECT [id], [taxYear] FROM [dbo].[Engagement]
       WHERE [id] IN ('${sharedEngagementId}', '${concurrentEngagementId}')
       ORDER BY [taxYear] ASC`
    );
    expect(result.recordset).toHaveLength(2);
    expect(result.recordset[0]?.taxYear).toBe(2024); // shared engagement
    expect(result.recordset[1]?.taxYear).toBe(2025); // concurrent engagement
  });

});
