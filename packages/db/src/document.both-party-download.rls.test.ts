/**
 * packages/db/src/document.both-party-download.rls.test.ts
 *
 * TIER-3 INTEGRATION TEST — requires real SQL Server (ADR-005 §6, HARD GATE)
 *
 * Tests the participant-download extension of sec.pol_Document / fn_document_access
 * (EPIC-013 / BRIEF-013 / TASK-013-001 / DECISION-013-A):
 *   - Primary owner reads the doc (AC-FILE-001-03 owner branch — preserved unchanged)
 *   - A non-owner participant reads the doc (AC-FILE-001-04 — NEW participant branch)
 *   - An unrelated client (neither owner nor participant) sees ZERO
 *   - ACCOUNTANT reads all engagements' documents
 *   - A document never crosses engagements (AC-FILE-001-05 — no regression)
 *
 * This test is the primary AC-FILE-001-04 gate for TASK-013-001. The "both-party-download trap"
 * that the brief's SDET/panel named — the prior fn_document_access was owner-only; this test
 * proves the participant branch is present and correct (both ways).
 *
 * Acceptance criteria covered (AC-id test-tag contract, per BRIEF-013 methodology):
 *   AC-FILE-001-04  — A client participant (not just the owner) can access the engagement's files.
 *                     Named "both-party-download trap" in the brief (HARD gate).
 *   AC-FILE-001-05  — A file in engagement A is NOT exposed to other engagements (cross-engagement isolation).
 *   AC-FILE-003-02  — Retrieval requires an authorization check (the FILTER predicate IS that check).
 *
 * ADR-005 §6 minimum coverage per policy (all present below):
 *   [AC-FILE-001-04][POSITIVE]  Non-owner participant reads the doc — NEW participant branch passes
 *   [AC-FILE-001-04][NEGATIVE]  Unrelated CLIENT (neither owner nor participant) sees ZERO — isolation HARD
 *   [AC-FILE-001-03][POSITIVE]  Primary owner (clientUserId) still reads their doc — owner branch not broken
 *   [ADR-005][NEGATIVE]         Null SESSION_CONTEXT reads ZERO — fail-closed
 *   [ADR-005][POSITIVE]         ACCOUNTANT reads all documents — full visibility preserved
 *   [AC-FILE-001-05][NEGATIVE]  Document never crosses engagements — cross-engagement isolation preserved
 *
 * Gate Authoring Evidence (ENGINE.md § Gate Authoring Rules — INTRODUCES-GATE: yes):
 *   1. Run marker: packages/db/src/document.both-party-download.rls.test.ts
 *      Test names (exact):
 *        "[AC-FILE-001-04] non-owner participant reads the engagement's document — positive (HARD GATE)"
 *        "[AC-FILE-001-04] unrelated CLIENT (neither owner nor participant) sees ZERO documents — isolation HARD"
 *        "[AC-FILE-001-03-regression] primary owner (clientUserId) still reads their document — owner branch preserved"
 *        "[ADR-005] null/anonymous SESSION_CONTEXT reads ZERO — fail-closed"
 *        "[ADR-005] ACCOUNTANT reads all documents — both engagements visible"
 *        "[AC-FILE-001-05] document never crosses engagements — cross-engagement isolation preserved"
 *      Actual output recorded in TASK-013-001 Work Log.
 *   2. Named code path: sec.fn_document_access in db/policies/0007-document-policy.sql —
 *      specifically the NEW 3b CLIENT-participant EXISTS branch (TASK-013-001 extension):
 *        OR EXISTS (
 *            SELECT 1 FROM [dbo].[User] u
 *            JOIN [dbo].[EngagementParticipant] ep ON ep.[userId] = u.[id]
 *            WHERE u.[clerkId] = CAST(SESSION_CONTEXT(N'clerk_user_id') AS NVARCHAR(64))
 *              AND ep.[engagementId] = @documentEngagementId
 *        )
 *   3. Counterfactual: removing the 3b participant EXISTS branch from fn_document_access would
 *      cause "[AC-FILE-001-04] non-owner participant reads the engagement's document — positive"
 *      to return 0 rows instead of 1, failing the test. The participant's document access
 *      collapses to zero — they can reach the engagement (0005) but not its documents (0007).
 *      Alternatively, removing the FILTER predicate entirely would cause the unrelated-CLIENT
 *      isolation test to return 1 row, failing the isolation gate.
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
 * // CS-SQL-001 // CS-SQL-003 // ADR-005 // ADR-003 // DECISION-013-A // CS-GEN-002 // CS-GEN-003
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
 * Users for both-party download testing:
 *   - ownerUser:        the clientUserId owner of engagement A (AC-FILE-001-03 owner branch)
 *   - participantUser:  a linked participant via EngagementParticipant (AC-FILE-001-04 participant branch)
 *   - unrelatedClient:  neither owner nor participant — must see ZERO (isolation HARD gate)
 */
let ownerUserId: string;
let participantUserId: string;
let unrelatedClientUserId: string;

/** Engagement A: the shared engagement where both owner + participant can access documents. */
let engagementAId: string;
/** Engagement B: owned by a different user (cross-engagement isolation gate). */
let engagementBId: string;

/** EngagementRequests (1:1 FK required on Engagement). */
let engagementARequestId: string;
let engagementBRequestId: string;

/** User owning Engagement B (for cross-engagement isolation). */
let ownerBUserId: string;

/** The EngagementParticipant row linking participantUser to Engagement A. */
let participantLinkId: string;

/** Document in Engagement A (both owner + participant should read it). */
let documentAId: string;
/** Document in Engagement B (unrelated to participant — cross-engagement isolation). */
let documentBId: string;

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
  // Unique clerkId prefix: 'bpd_rls_' (both-party-download)
  const ownerResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[User] ([clerkId], [email], [role], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'bpd_rls_owner', N'bpd-rls-owner@example.com', N'CLIENT', SYSDATETIMEOFFSET())`
  );
  ownerUserId = ownerResult.recordset[0]?.id ?? "";

  const participantResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[User] ([clerkId], [email], [role], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'bpd_rls_participant', N'bpd-rls-participant@example.com', N'CLIENT', SYSDATETIMEOFFSET())`
  );
  participantUserId = participantResult.recordset[0]?.id ?? "";

  const unrelatedResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[User] ([clerkId], [email], [role], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'bpd_rls_unrelated', N'bpd-rls-unrelated@example.com', N'CLIENT', SYSDATETIMEOFFSET())`
  );
  unrelatedClientUserId = unrelatedResult.recordset[0]?.id ?? "";

  const ownerBResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[User] ([clerkId], [email], [role], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'bpd_rls_owner_b', N'bpd-rls-owner-b@example.com', N'CLIENT', SYSDATETIMEOFFSET())`
  );
  ownerBUserId = ownerBResult.recordset[0]?.id ?? "";

  // ─── Seed: EngagementRequest rows (1:1 FK required) ──────────────────────
  const reqAResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[EngagementRequest] ([firstName], [lastName], [email], [status], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'BPD', N'OwnerA', N'bpd-rls-req-a@example.com', N'accepted', SYSDATETIMEOFFSET())`
  );
  engagementARequestId = reqAResult.recordset[0]?.id ?? "";

  const reqBResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[EngagementRequest] ([firstName], [lastName], [email], [status], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'BPD', N'OwnerB', N'bpd-rls-req-b@example.com', N'accepted', SYSDATETIMEOFFSET())`
  );
  engagementBRequestId = reqBResult.recordset[0]?.id ?? "";

  // ─── Seed: Engagement rows (admin pool bypasses BLOCK predicate) ──────────
  // Engagement A: owned by ownerUser — participantUser is linked via EngagementParticipant
  const engAResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[Engagement]
       ([engagementRequestId], [clientUserId], [status], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES ('${engagementARequestId}', '${ownerUserId}', N'New', SYSDATETIMEOFFSET())`
  );
  engagementAId = engAResult.recordset[0]?.id ?? "";

  // Engagement B: owned by a different user (cross-engagement isolation target)
  const engBResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[Engagement]
       ([engagementRequestId], [clientUserId], [status], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES ('${engagementBRequestId}', '${ownerBUserId}', N'New', SYSDATETIMEOFFSET())`
  );
  engagementBId = engBResult.recordset[0]?.id ?? "";

  // ─── Seed: EngagementParticipant row (admin pool — bypasses BLOCK predicate) ─
  // AC-FILE-001-04: participantUser is linked to Engagement A (not B)
  const linkResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[EngagementParticipant]
       ([engagementId], [userId], [role])
     OUTPUT INSERTED.[id]
     VALUES ('${engagementAId}', '${participantUserId}', N'CLIENT')`
  );
  participantLinkId = linkResult.recordset[0]?.id ?? "";

  // NOTE: ownerUser has NO EngagementParticipant link — accesses via clientUserId (owner branch).
  // NOTE: unrelatedClientUserId has NO EngagementParticipant link — must see ZERO.
  // NOTE: participantUser is linked to Engagement A ONLY — Engagement B must be invisible.

  // ─── Seed: Document rows (admin pool bypasses BLOCK) ─────────────────────
  // ADR-009 storage key shape: engagements/{engId}/documents/{docId}/v{ver}/filename
  const docAResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[Document]
       ([engagementId], [storageKey], [originalFilename], [contentType], [sizeBytes],
        [status], [version], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (
       '${engagementAId}',
       N'engagements/${engagementAId}/documents/dummy-bpd-a/v1/test-bpd-a.pdf',
       N'test-bpd-a.pdf',
       N'application/pdf',
       11111,
       N'active',
       1,
       SYSDATETIMEOFFSET()
     )`
  );
  documentAId = docAResult.recordset[0]?.id ?? "";

  const docBResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[Document]
       ([engagementId], [storageKey], [originalFilename], [contentType], [sizeBytes],
        [status], [version], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (
       '${engagementBId}',
       N'engagements/${engagementBId}/documents/dummy-bpd-b/v1/test-bpd-b.pdf',
       N'test-bpd-b.pdf',
       N'application/pdf',
       22222,
       N'active',
       1,
       SYSDATETIMEOFFSET()
     )`
  );
  documentBId = docBResult.recordset[0]?.id ?? "";
}, 30000);

afterAll(async () => {
  // Cleanup via admin pool (bypasses RLS BLOCK predicates) — reverse dependency order

  // Documents first (FK → Engagement)
  if (documentAId) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[Document] WHERE [id] = '${documentAId}'`
    ).catch(() => { /* ignore */ });
  }
  if (documentBId) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[Document] WHERE [id] = '${documentBId}'`
    ).catch(() => { /* ignore */ });
  }

  // EngagementParticipant row (FK → Engagement)
  if (participantLinkId) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[EngagementParticipant] WHERE [id] = '${participantLinkId}'`
    ).catch(() => { /* ignore */ });
  }

  // Engagements (FK → EngagementRequest)
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

  // EngagementRequest rows
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

  // User rows
  if (ownerUserId) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[User] WHERE [id] = '${ownerUserId}'`
    ).catch(() => { /* ignore */ });
  }
  if (participantUserId) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[User] WHERE [id] = '${participantUserId}'`
    ).catch(() => { /* ignore */ });
  }
  if (unrelatedClientUserId) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[User] WHERE [id] = '${unrelatedClientUserId}'`
    ).catch(() => { /* ignore */ });
  }
  if (ownerBUserId) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[User] WHERE [id] = '${ownerBUserId}'`
    ).catch(() => { /* ignore */ });
  }

  await adminPool.close().catch(() => { /* ignore */ });
  await requestPool.close().catch(() => { /* ignore */ });
}, 30000);

// ─── Tests: sec.pol_Document — both-party download (AC-FILE-001-04 HARD GATE) ──────────────

describe("sec.pol_Document (extended) — both-party download gate (AC-FILE-001-04 / BRIEF-013 / TASK-013-001 HARD GATE)", () => {

  /**
   * [AC-FILE-001-04][POSITIVE] Non-owner participant reads the engagement's document.
   * Named code path: fn_document_access — 3b CLIENT participant EXISTS branch (NEW TASK-013-001).
   *   clerkId='bpd_rls_participant' → User.id = participantUserId
   *   → EngagementParticipant.engagementId = engagementAId → EXISTS passes
   * → 1 row returned (participant reads the document).
   * This is the AC-FILE-001-04 hard gate — the "both-party-download trap" the brief named.
   * A one-directional assertion (owner-only) is a rejection per the brief's SDET focus areas.
   * // CS-SQL-003 // ADR-005 // DECISION-013-A // CS-GEN-002
   */
  it("[AC-FILE-001-04] non-owner participant reads the engagement's document — positive (HARD GATE)", async () => {
    const result = await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = N'bpd_rls_participant', @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = N'CLIENT', @read_only = 0;
       SELECT [id] FROM [dbo].[Document]
       WHERE [engagementId] = '${engagementAId}';`
    );

    const recordsets = result.recordsets as Array<Array<{ id?: string }>>;
    const selectRecordset = recordsets[recordsets.length - 1];

    // Clear context
    await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = NULL, @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = NULL, @read_only = 0;`
    );

    // Participant MUST see the document (3b participant EXISTS branch passes)
    // This is the AC-FILE-001-04 gate — participant has access, not just the owner.
    expect(selectRecordset).toHaveLength(1);
    expect(selectRecordset?.[0]?.id).toBe(documentAId);
  });

  /**
   * [AC-FILE-001-04][NEGATIVE] Unrelated CLIENT (neither owner nor participant) sees ZERO documents.
   * Named code path: fn_document_access — 3a owner EXISTS empty + 3b participant EXISTS empty.
   *   clerkId='bpd_rls_unrelated' → no Engagement with clientUserId = unrelated (3a fails)
   *   → no EngagementParticipant link (3b fails) → EXISTS both empty → 0 rows (fail-closed).
   * This is the ISOLATION half of AC-FILE-001-04 — a one-directional assertion is a rejection.
   * // CS-SQL-003 // ADR-005 // DECISION-013-A
   */
  it("[AC-FILE-001-04] unrelated CLIENT (neither owner nor participant) sees ZERO documents — isolation HARD", async () => {
    const result = await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = N'bpd_rls_unrelated', @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = N'CLIENT', @read_only = 0;
       SELECT [id] FROM [dbo].[Document]
       WHERE [engagementId] = '${engagementAId}';`
    );

    const recordsets = result.recordsets as Array<Array<{ id?: string }>>;
    const selectRecordset = recordsets[recordsets.length - 1];

    // Clear context
    await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = NULL, @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = NULL, @read_only = 0;`
    );

    // Unrelated CLIENT MUST NOT see the document (both EXISTS branches empty)
    expect(selectRecordset).toHaveLength(0);
  });

  /**
   * [AC-FILE-001-03-regression] Primary owner (clientUserId) still reads their document.
   * Named code path: fn_document_access — 3a CLIENT owner EXISTS branch (ORIGINAL — EPIC-007).
   *   clerkId='bpd_rls_owner' → User.id = ownerUserId → Engagement.clientUserId = ownerUserId
   * → 1 row returned (owner reads the document via the ORIGINAL branch).
   * Verifies the participant extension (3b) did NOT break the existing owner branch (3a).
   * // CS-SQL-003 // ADR-005 // CS-GEN-002 (additive — 3a preserved byte-identical)
   */
  it("[AC-FILE-001-03-regression] primary owner (clientUserId) still reads their document — owner branch preserved", async () => {
    const result = await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = N'bpd_rls_owner', @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = N'CLIENT', @read_only = 0;
       SELECT [id] FROM [dbo].[Document]
       WHERE [engagementId] = '${engagementAId}';`
    );

    const recordsets = result.recordsets as Array<Array<{ id?: string }>>;
    const selectRecordset = recordsets[recordsets.length - 1];

    // Clear context
    await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = NULL, @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = NULL, @read_only = 0;`
    );

    // Owner MUST still see the document (3a branch still byte-identical)
    expect(selectRecordset).toHaveLength(1);
    expect(selectRecordset?.[0]?.id).toBe(documentAId);
  });

  /**
   * [ADR-005][NEGATIVE] Null/anonymous SESSION_CONTEXT reads ZERO documents — fail-closed.
   * ADR-003 §5: null identity → all four branches fail → predicate empty → 0 rows, no error.
   * // CS-SQL-003 // ADR-003 §5
   */
  it("[ADR-005] null/anonymous SESSION_CONTEXT reads ZERO — fail-closed", async () => {
    // No SESSION_CONTEXT set — anonymous path
    const result = await requestPool.request().query(
      `SELECT COUNT(*) AS cnt FROM [dbo].[Document]
       WHERE [id] IN ('${documentAId}', '${documentBId}')`
    );

    const cnt = (result.recordset as Array<{ cnt?: number }>)[0]?.cnt ?? -1;
    // Null SESSION_CONTEXT → predicate empty → FILTER removes all rows → 0 (fail-closed)
    expect(cnt).toBe(0);
  });

  /**
   * [ADR-005][POSITIVE] ACCOUNTANT reads all documents — full visibility preserved.
   * Predicate branch: CAST(SESSION_CONTEXT(N'role') AS NVARCHAR(16)) = N'ACCOUNTANT'
   * ACCOUNTANT sees both engagements' documents.
   * // CS-SQL-003
   */
  it("[ADR-005] ACCOUNTANT reads all documents — both engagements visible", async () => {
    const result = await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = N'bpd_rls_accountant', @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = N'ACCOUNTANT', @read_only = 0;
       SELECT [id] FROM [dbo].[Document]
       WHERE [id] IN ('${documentAId}', '${documentBId}');`
    );

    const recordsets = result.recordsets as Array<Array<{ id?: string }>>;
    const selectRecordset = recordsets[recordsets.length - 1];

    // Clear context
    await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = NULL, @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = NULL, @read_only = 0;`
    );

    // ACCOUNTANT MUST see both documents (ACCOUNTANT branch passes unconditionally)
    expect(selectRecordset).toHaveLength(2);
    const ids = (selectRecordset ?? []).map((r) => r.id);
    expect(ids).toContain(documentAId);
    expect(ids).toContain(documentBId);
  });

  /**
   * [AC-FILE-001-05][NEGATIVE] A document never crosses engagements.
   * The participant (linked to Engagement A only) MUST NOT see Engagement B's document.
   * Named code path: fn_document_access — 3b participant EXISTS keyed on ep.engagementId
   *   = @documentEngagementId (the doc's engagementId). Participant link is to Engagement A,
   *   so for Engagement B's document, ep.engagementId = engagementBId ≠ participantLinkId's engagement.
   * → EXISTS empty → predicate empty → 0 rows (cross-engagement isolation preserved).
   * // CS-SQL-003 // ADR-005 // AC-FILE-001-05
   */
  it("[AC-FILE-001-05] document never crosses engagements — participant cannot see Engagement B's doc", async () => {
    // participantUser is linked to Engagement A only.
    // Document B is in Engagement B — participant has no link to Engagement B.
    const result = await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = N'bpd_rls_participant', @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = N'CLIENT', @read_only = 0;
       SELECT [id] FROM [dbo].[Document]
       WHERE [engagementId] = '${engagementBId}';`
    );

    const recordsets = result.recordsets as Array<Array<{ id?: string }>>;
    const selectRecordset = recordsets[recordsets.length - 1];

    // Clear context
    await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = NULL, @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = NULL, @read_only = 0;`
    );

    // Participant MUST NOT see Engagement B's document (no link to Engagement B)
    // Cross-engagement isolation preserved — the participant branch is scoped to ONE engagement
    expect(selectRecordset).toHaveLength(0);
  });

});

// ─── Admin pool sanity check ──────────────────────────────────────────────────

describe("sec.pol_Document (extended) — admin pool sanity (TASK-013-001)", () => {

  /**
   * [POSITIVE] Admin pool reads both seeded documents — RLS-exempt.
   * IS_MEMBER('app_admin_role') = 1 → predicate always passes.
   */
  it("[POSITIVE] Admin pool (app_admin_role) reads both seeded documents — RLS-exempt", async () => {
    const result = await adminPool.request().query<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM [dbo].[Document]
       WHERE [id] IN ('${documentAId}', '${documentBId}')`
    );
    const cnt = result.recordset[0]?.cnt ?? 0;
    // Admin pool bypasses RLS → sees both
    expect(cnt).toBe(2);
  });

});
