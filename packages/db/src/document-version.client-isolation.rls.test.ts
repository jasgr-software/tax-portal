/**
 * packages/db/src/document-version.client-isolation.rls.test.ts
 *
 * TIER-3 INTEGRATION TEST — requires real SQL Server (ADR-005 §6, HARD GATE)
 *
 * Tests sec.pol_DocumentVersion security policy (EPIC-013 / BRIEF-013 / TASK-013-001):
 *   - Owner reads own engagement's document version rows (fn_document_version_access 3a)
 *   - Participant reads same engagement's document version rows (fn_document_version_access 3b)
 *   - CLIENT-B (neither owner nor participant) sees ZERO — isolation both ways (HARD)
 *   - A superseded (prior) version row remains SELECT-able after a newer row is added
 *     (AC-FILE-009-03 substrate — retained version rows accessible to eligible callers)
 *   - ACCOUNTANT reads all version rows
 *   - null identity → ZERO (fail-closed)
 *
 * Acceptance criteria covered (AC-id test-tag contract, per BRIEF-013 methodology):
 *   AC-FILE-009-03  — Every prior version retained + accessible after replacement.
 *                     Substrate: a superseded DocumentVersion row (supersededAt IS NOT NULL)
 *                     remains SELECT-able. The replacement operation is TASK-013-002.
 *
 * ADR-005 §6 minimum coverage per policy (all present below):
 *   [CS-SQL-001][POSITIVE]    Owner reads own engagement's version rows — positive
 *   [CS-SQL-001][POSITIVE]    Participant reads same engagement's version rows — positive (3b branch)
 *   [CS-SQL-001][NEGATIVE]    CLIENT-B sees ZERO version rows — isolation HARD
 *   [AC-FILE-009-03][POSITIVE] Superseded version row remains SELECT-able (supersededAt IS NOT NULL) — retained
 *   [ADR-005][NEGATIVE]       Null SESSION_CONTEXT reads ZERO — fail-closed
 *   [ADR-005][POSITIVE]       ACCOUNTANT reads all version rows — full visibility preserved
 *   [CS-SQL-001][CROSS-ENG]  Cross-engagement version row never visible to CLIENT-A
 *
 * Gate Authoring Evidence (ENGINE.md § Gate Authoring Rules — INTRODUCES-GATE: yes):
 *   1. Run marker: packages/db/src/document-version.client-isolation.rls.test.ts
 *      Test names (exact):
 *        "[CS-SQL-001] owner reads own engagement's document version rows — positive"
 *        "[CS-SQL-001] participant reads same engagement's document version rows — positive (3b branch)"
 *        "[CS-SQL-001] CLIENT-B sees ZERO version rows — isolation HARD"
 *        "[AC-FILE-009-03] superseded version row remains SELECT-able after a newer version is added — retained"
 *        "[ADR-005] null/anonymous SESSION_CONTEXT reads ZERO version rows — fail-closed"
 *        "[ADR-005] ACCOUNTANT reads all version rows — full visibility preserved"
 *        "[CS-SQL-001] cross-engagement version row never visible to CLIENT-A"
 *      Actual output recorded in TASK-013-001 Work Log.
 *   2. Named code path: sec.fn_document_version_access in db/policies/0011-document-version-policy.sql —
 *      specifically the FILTER PREDICATE on dbo.DocumentVersion (STATE = ON, SCHEMABINDING = ON):
 *        3b CLIENT participant EXISTS:
 *          OR EXISTS (
 *              SELECT 1 FROM [dbo].[Document] d
 *              JOIN [dbo].[EngagementParticipant] ep ON ep.[engagementId] = d.[engagementId]
 *              JOIN [dbo].[User] u ON u.[id] = ep.[userId]
 *              WHERE d.[id] = @documentVersionDocumentId
 *                AND u.[clerkId] = CAST(SESSION_CONTEXT(N'clerk_user_id') AS NVARCHAR(64))
 *          )
 *   3. Counterfactual: removing the FILTER predicate from pol_DocumentVersion would cause
 *      the "[CS-SQL-001] CLIENT-B sees ZERO version rows — isolation HARD" test to return
 *      rows instead of 0, failing the isolation gate. Removing the 3b participant EXISTS
 *      would cause the "[CS-SQL-001] participant reads..." test to return 0 instead of rows.
 *
 * Connection approach:
 *   Uses raw mssql (not Prisma) for pool setup/control. Rationale: Prisma 5.22.0 sqlserver
 *   connector cannot parse port in authority URL form — P1013.
 *
 * Environment:
 *   DATABASE_URL_ADMIN — admin pool URL (taxportal_admin; IS_MEMBER('app_admin_role')=1 → RLS-exempt)
 *   DATABASE_URL       — request pool URL (taxportal_user; subject to RLS)
 *
 * // CS-SQL-001 // CS-SQL-002 // CS-SQL-003 // ADR-005 // ADR-003 // DECISION-013-B // CS-GEN-002 // CS-GEN-003
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
 * Users for document version isolation testing:
 *   - ownerAUser:      the clientUserId owner of Engagement A
 *   - participantUser: a linked participant on Engagement A
 *   - clientBUser:     owner of Engagement B (must see ZERO of Engagement A's version rows)
 */
let ownerAUserId: string;
let participantUserId: string;
let clientBUserId: string;

/** Engagement A: owns ownerAUser + participantUser. */
let engagementAId: string;
/** Engagement B: owns clientBUser (cross-engagement isolation). */
let engagementBId: string;

/** EngagementRequests (1:1 FK on Engagement). */
let engagementARequestId: string;
let engagementBRequestId: string;

/** EngagementParticipant row linking participantUser to Engagement A. */
let participantLinkId: string;

/** Document in Engagement A (both owner + participant can read its versions). */
let documentAId: string;
/** Document in Engagement B (clientB's document — cross-engagement isolation). */
let documentBId: string;

/**
 * DocumentVersion rows for documentA:
 *   - versionAV1Id: version 1 (superseded — supersededAt IS NOT NULL) → must still be SELECT-able
 *   - versionAV2Id: version 2 (current — supersededAt IS NULL)
 *   AC-FILE-009-03: both version rows are retained + accessible.
 */
let versionAV1Id: string; // superseded version (AC-FILE-009-03 substrate)
let versionAV2Id: string; // current version

/** DocumentVersion row for documentB (cross-engagement isolation check). */
let versionBV1Id: string;

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
  // Unique clerkId prefix: 'dv_rls_' (document-version-rls)
  const ownerAResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[User] ([clerkId], [email], [role], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'dv_rls_owner_a', N'dv-rls-owner-a@example.com', N'CLIENT', SYSDATETIMEOFFSET())`
  );
  ownerAUserId = ownerAResult.recordset[0]?.id ?? "";

  const participantResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[User] ([clerkId], [email], [role], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'dv_rls_participant', N'dv-rls-participant@example.com', N'CLIENT', SYSDATETIMEOFFSET())`
  );
  participantUserId = participantResult.recordset[0]?.id ?? "";

  const clientBResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[User] ([clerkId], [email], [role], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'dv_rls_client_b', N'dv-rls-client-b@example.com', N'CLIENT', SYSDATETIMEOFFSET())`
  );
  clientBUserId = clientBResult.recordset[0]?.id ?? "";

  // ─── Seed: EngagementRequest rows ────────────────────────────────────────
  const reqAResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[EngagementRequest] ([firstName], [lastName], [email], [status], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'DvRLS', N'OwnerA', N'dv-rls-req-a@example.com', N'accepted', SYSDATETIMEOFFSET())`
  );
  engagementARequestId = reqAResult.recordset[0]?.id ?? "";

  const reqBResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[EngagementRequest] ([firstName], [lastName], [email], [status], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'DvRLS', N'ClientB', N'dv-rls-req-b@example.com', N'accepted', SYSDATETIMEOFFSET())`
  );
  engagementBRequestId = reqBResult.recordset[0]?.id ?? "";

  // ─── Seed: Engagement rows ────────────────────────────────────────────────
  const engAResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[Engagement]
       ([engagementRequestId], [clientUserId], [status], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES ('${engagementARequestId}', '${ownerAUserId}', N'New', SYSDATETIMEOFFSET())`
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

  // ─── Seed: Document rows (admin pool bypasses BLOCK) ─────────────────────
  const docAResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[Document]
       ([engagementId], [storageKey], [originalFilename], [contentType], [sizeBytes],
        [status], [version], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (
       '${engagementAId}',
       N'engagements/${engagementAId}/documents/dummy-dv-a/v2/test-dv-a.pdf',
       N'test-dv-a.pdf',
       N'application/pdf',
       33333,
       N'active',
       2,
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
       N'engagements/${engagementBId}/documents/dummy-dv-b/v1/test-dv-b.pdf',
       N'test-dv-b.pdf',
       N'application/pdf',
       44444,
       N'active',
       1,
       SYSDATETIMEOFFSET()
     )`
  );
  documentBId = docBResult.recordset[0]?.id ?? "";

  // ─── Seed: DocumentVersion rows (admin pool bypasses BLOCK) ──────────────
  // ADR-009: versioned storage key: engagements/{engId}/documents/{docId}/v{ver}/filename
  // DECISION-013-B: version rows are the retained-version substrate (AC-FILE-009-03).

  // Document A — version 1 (superseded: supersededAt IS NOT NULL)
  // AC-FILE-009-03: this row must remain SELECT-able after version 2 is added.
  const v1AResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[DocumentVersion]
       ([documentId], [version], [storageKey], [supersededAt], [uploadedBy], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (
       '${documentAId}',
       1,
       N'engagements/${engagementAId}/documents/${documentAId}/v1/test-dv-a-v1.pdf',
       SYSDATETIMEOFFSET(),
       N'dv_rls_owner_a',
       SYSDATETIMEOFFSET()
     )`
  );
  versionAV1Id = v1AResult.recordset[0]?.id ?? "";

  // Document A — version 2 (current: supersededAt IS NULL)
  // This version was added AFTER v1 — v1 remains retained (AC-FILE-009-03 substrate).
  const v2AResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[DocumentVersion]
       ([documentId], [version], [storageKey], [supersededAt], [uploadedBy], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (
       '${documentAId}',
       2,
       N'engagements/${engagementAId}/documents/${documentAId}/v2/test-dv-a-v2.pdf',
       NULL,
       N'dv_rls_owner_a',
       SYSDATETIMEOFFSET()
     )`
  );
  versionAV2Id = v2AResult.recordset[0]?.id ?? "";

  // Document B — version 1 (for cross-engagement isolation test)
  const v1BResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[DocumentVersion]
       ([documentId], [version], [storageKey], [supersededAt], [uploadedBy], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (
       '${documentBId}',
       1,
       N'engagements/${engagementBId}/documents/${documentBId}/v1/test-dv-b-v1.pdf',
       NULL,
       N'dv_rls_client_b',
       SYSDATETIMEOFFSET()
     )`
  );
  versionBV1Id = v1BResult.recordset[0]?.id ?? "";
}, 30000);

afterAll(async () => {
  // Cleanup via admin pool — reverse dependency order (DocumentVersion → Document → Engagement → EngagementRequest → User)

  // DocumentVersion rows first (FK → Document)
  if (versionAV1Id) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[DocumentVersion] WHERE [id] = '${versionAV1Id}'`
    ).catch(() => { /* ignore */ });
  }
  if (versionAV2Id) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[DocumentVersion] WHERE [id] = '${versionAV2Id}'`
    ).catch(() => { /* ignore */ });
  }
  if (versionBV1Id) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[DocumentVersion] WHERE [id] = '${versionBV1Id}'`
    ).catch(() => { /* ignore */ });
  }

  // Document rows
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

  // EngagementParticipant row
  if (participantLinkId) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[EngagementParticipant] WHERE [id] = '${participantLinkId}'`
    ).catch(() => { /* ignore */ });
  }

  // Engagements
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
  if (ownerAUserId) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[User] WHERE [id] = '${ownerAUserId}'`
    ).catch(() => { /* ignore */ });
  }
  if (participantUserId) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[User] WHERE [id] = '${participantUserId}'`
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

// ─── Tests: sec.pol_DocumentVersion — client isolation (CS-SQL-001 / ADR-005 §6) ─────────────

describe("sec.pol_DocumentVersion — client isolation (CS-SQL-001 / ADR-005 §6, EPIC-013 SIXTH client-scoped table)", () => {

  /**
   * [CS-SQL-001][POSITIVE] Owner reads own engagement's document version rows.
   * Named code path: fn_document_version_access — 3a CLIENT owner EXISTS branch.
   *   clerkId='dv_rls_owner_a' → User.id = ownerAUserId
   *   → Document.engagementId → Engagement.clientUserId = ownerAUserId → EXISTS passes
   * → 2 rows returned (both v1 superseded + v2 current).
   * // CS-SQL-003 // ADR-005 // ADR-003
   */
  it("[CS-SQL-001] owner reads own engagement's document version rows — positive", async () => {
    const result = await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = N'dv_rls_owner_a', @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = N'CLIENT', @read_only = 0;
       SELECT [id] FROM [dbo].[DocumentVersion]
       WHERE [id] IN ('${versionAV1Id}', '${versionAV2Id}');`
    );

    const recordsets = result.recordsets as Array<Array<{ id?: string }>>;
    const selectRecordset = recordsets[recordsets.length - 1];

    // Clear context
    await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = NULL, @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = NULL, @read_only = 0;`
    );

    // Owner MUST see both version rows (both the superseded v1 and the current v2)
    expect(selectRecordset).toHaveLength(2);
    const ids = (selectRecordset ?? []).map((r) => r.id);
    expect(ids).toContain(versionAV1Id);
    expect(ids).toContain(versionAV2Id);
  });

  /**
   * [CS-SQL-001][POSITIVE] Participant reads same engagement's document version rows — 3b branch.
   * Named code path: fn_document_version_access — 3b CLIENT participant EXISTS branch.
   *   clerkId='dv_rls_participant' → User.id = participantUserId
   *   → Document.engagementId → EngagementParticipant.engagementId = engagementAId → EXISTS passes
   * → 2 rows returned (both v1 + v2 for the engagement's document).
   * // CS-SQL-003 // ADR-005 // DECISION-013-A
   */
  it("[CS-SQL-001] participant reads same engagement's document version rows — positive (3b branch)", async () => {
    const result = await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = N'dv_rls_participant', @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = N'CLIENT', @read_only = 0;
       SELECT [id] FROM [dbo].[DocumentVersion]
       WHERE [id] IN ('${versionAV1Id}', '${versionAV2Id}');`
    );

    const recordsets = result.recordsets as Array<Array<{ id?: string }>>;
    const selectRecordset = recordsets[recordsets.length - 1];

    // Clear context
    await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = NULL, @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = NULL, @read_only = 0;`
    );

    // Participant MUST see both version rows (3b participant EXISTS branch passes)
    expect(selectRecordset).toHaveLength(2);
    const ids = (selectRecordset ?? []).map((r) => r.id);
    expect(ids).toContain(versionAV1Id);
    expect(ids).toContain(versionAV2Id);
  });

  /**
   * [CS-SQL-001][NEGATIVE] CLIENT-B sees ZERO version rows — isolation HARD.
   * Named code path: fn_document_version_access — 3a owner EXISTS empty + 3b participant EXISTS empty.
   *   clerkId='dv_rls_client_b' → not owner of Engagement A (3a fails)
   *   → no EngagementParticipant link to Engagement A (3b fails) → EXISTS both empty → 0 rows.
   * This is the isolation HARD gate per ADR-005 §6. One-directional assertion is a rejection.
   * // CS-SQL-003 // ADR-005 // DECISION-013-A
   */
  it("[CS-SQL-001] CLIENT-B sees ZERO version rows — isolation HARD", async () => {
    const result = await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = N'dv_rls_client_b', @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = N'CLIENT', @read_only = 0;
       SELECT [id] FROM [dbo].[DocumentVersion]
       WHERE [id] IN ('${versionAV1Id}', '${versionAV2Id}');`
    );

    const recordsets = result.recordsets as Array<Array<{ id?: string }>>;
    const selectRecordset = recordsets[recordsets.length - 1];

    // Clear context
    await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = NULL, @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = NULL, @read_only = 0;`
    );

    // CLIENT-B MUST NOT see any of Engagement A's version rows (both EXISTS branches empty)
    expect(selectRecordset).toHaveLength(0);
  });

  /**
   * [AC-FILE-009-03] Superseded version row remains SELECT-able after a newer version is added.
   * This is the AC-FILE-009-03 retained-version substrate test.
   * versionAV1 has supersededAt IS NOT NULL (set when versionAV2 was added).
   * versionAV2 is the current version (supersededAt IS NULL).
   * BOTH must be SELECT-able by the owner — prior versions are never deleted.
   *
   * ADR-009: "Replacement = new DocumentVersion row + new storage key; prior rows retained."
   * DECISION-013-B: superseded rows have supersededAt set but are never physically deleted.
   * The FILTER predicate on pol_DocumentVersion does NOT filter on supersededAt — it grants access
   * to ALL version rows for the engagement's documents, both current and superseded.
   * // AC-FILE-009-03 // ADR-009 // DECISION-013-B
   */
  it("[AC-FILE-009-03] superseded version row remains SELECT-able after a newer version is added — retained", async () => {
    const result = await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = N'dv_rls_owner_a', @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = N'CLIENT', @read_only = 0;
       SELECT [id], [version], [supersededAt]
       FROM [dbo].[DocumentVersion]
       WHERE [documentId] = '${documentAId}'
       ORDER BY [version] ASC;`
    );

    const recordsets = result.recordsets as Array<Array<{ id?: string; version?: number; supersededAt?: Date | null }>>;
    const selectRecordset = recordsets[recordsets.length - 1];

    // Clear context
    await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = NULL, @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = NULL, @read_only = 0;`
    );

    // Both version rows must be present (v1 superseded + v2 current) — AC-FILE-009-03 substrate
    expect(selectRecordset).toHaveLength(2);

    const v1Row = selectRecordset?.find((r) => r.version === 1);
    const v2Row = selectRecordset?.find((r) => r.version === 2);

    // v1 is present and superseded (supersededAt IS NOT NULL) — retained after v2 was added
    expect(v1Row).toBeDefined();
    expect(v1Row?.id).toBe(versionAV1Id);
    expect(v1Row?.supersededAt).not.toBeNull(); // superseded by v2 — but still SELECT-able

    // v2 is present and current (supersededAt IS NULL)
    expect(v2Row).toBeDefined();
    expect(v2Row?.id).toBe(versionAV2Id);
    expect(v2Row?.supersededAt).toBeNull(); // current version
  });

  /**
   * [ADR-005][NEGATIVE] Null/anonymous SESSION_CONTEXT reads ZERO version rows — fail-closed.
   * ADR-003 §5: null identity → all branches fail → predicate empty → 0 rows, no error.
   * // CS-SQL-003 // ADR-003 §5
   */
  it("[ADR-005] null/anonymous SESSION_CONTEXT reads ZERO version rows — fail-closed", async () => {
    // No SESSION_CONTEXT set — anonymous path
    const result = await requestPool.request().query(
      `SELECT COUNT(*) AS cnt FROM [dbo].[DocumentVersion]
       WHERE [id] IN ('${versionAV1Id}', '${versionAV2Id}', '${versionBV1Id}')`
    );

    const cnt = (result.recordset as Array<{ cnt?: number }>)[0]?.cnt ?? -1;
    // Null SESSION_CONTEXT → predicate empty → FILTER removes all rows → 0 (fail-closed)
    expect(cnt).toBe(0);
  });

  /**
   * [ADR-005][POSITIVE] ACCOUNTANT reads all version rows — full visibility preserved.
   * Predicate branch: CAST(SESSION_CONTEXT(N'role') AS NVARCHAR(16)) = N'ACCOUNTANT'
   * ACCOUNTANT sees all three version rows (versionAV1, versionAV2, versionBV1).
   * // CS-SQL-003
   */
  it("[ADR-005] ACCOUNTANT reads all version rows — full visibility preserved", async () => {
    const result = await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = N'dv_rls_accountant', @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = N'ACCOUNTANT', @read_only = 0;
       SELECT [id] FROM [dbo].[DocumentVersion]
       WHERE [id] IN ('${versionAV1Id}', '${versionAV2Id}', '${versionBV1Id}');`
    );

    const recordsets = result.recordsets as Array<Array<{ id?: string }>>;
    const selectRecordset = recordsets[recordsets.length - 1];

    // Clear context
    await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = NULL, @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = NULL, @read_only = 0;`
    );

    // ACCOUNTANT MUST see all three version rows
    expect(selectRecordset).toHaveLength(3);
    const ids = (selectRecordset ?? []).map((r) => r.id);
    expect(ids).toContain(versionAV1Id);
    expect(ids).toContain(versionAV2Id);
    expect(ids).toContain(versionBV1Id);
  });

  /**
   * [CS-SQL-001] Cross-engagement version row never visible to CLIENT-A.
   * Engagement B's version row (versionBV1) must be invisible to CLIENT-A's owner/participant.
   * The participant EXISTS branch is scoped to THIS engagement:
   *   ep.engagementId = documentB's engagementId (= engagementBId)
   * Since ownerA has no link to engagementBId, EXISTS is empty → 0 rows.
   * // CS-SQL-003 // ADR-005 // DECISION-013-B
   */
  it("[CS-SQL-001] cross-engagement version row never visible to CLIENT-A", async () => {
    const result = await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = N'dv_rls_owner_a', @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = N'CLIENT', @read_only = 0;
       SELECT [id] FROM [dbo].[DocumentVersion]
       WHERE [id] = '${versionBV1Id}';`
    );

    const recordsets = result.recordsets as Array<Array<{ id?: string }>>;
    const selectRecordset = recordsets[recordsets.length - 1];

    // Clear context
    await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = NULL, @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = NULL, @read_only = 0;`
    );

    // CLIENT-A MUST NOT see Engagement B's version row (cross-engagement isolation)
    expect(selectRecordset).toHaveLength(0);
  });

});

// ─── Admin pool sanity check ──────────────────────────────────────────────────

describe("sec.pol_DocumentVersion — admin pool sanity (TASK-013-001)", () => {

  /**
   * [POSITIVE] Admin pool reads all seeded document version rows — RLS-exempt.
   * IS_MEMBER('app_admin_role') = 1 → predicate always passes.
   */
  it("[POSITIVE] Admin pool (app_admin_role) reads all three seeded document version rows — RLS-exempt", async () => {
    const result = await adminPool.request().query<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM [dbo].[DocumentVersion]
       WHERE [id] IN ('${versionAV1Id}', '${versionAV2Id}', '${versionBV1Id}')`
    );
    const cnt = result.recordset[0]?.cnt ?? 0;
    // Admin pool bypasses RLS → sees all three
    expect(cnt).toBe(3);
  });

});
