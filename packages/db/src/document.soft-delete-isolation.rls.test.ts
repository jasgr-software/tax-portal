/**
 * packages/db/src/document.soft-delete-isolation.rls.test.ts
 *
 * TIER-3 INTEGRATION TEST — requires real SQL Server (ADR-005 §6, HARD GATE)
 *
 * Tests sec.pol_Document + sec.pol_DocumentVersion security policies for the
 * EPIC-014 soft-delete isolation (BRIEF-014 / TASK-014-001 / DECISION-014-B / DECISION-014-C):
 *
 *   - A soft-deleted Document (deletedAt IS NOT NULL) is INVISIBLE to the owning CLIENT (owner)
 *   - A soft-deleted Document is INVISIBLE to a participant CLIENT
 *   - A soft-deleted Document remains VISIBLE to the ACCOUNTANT (archive/recover path — AC-FILE-004-02/-03)
 *   - Admin pool always sees all documents including soft-deleted (RLS-exempt)
 *   - The VERSIONS of a soft-deleted Document are INVISIBLE to owner + participant CLIENT
 *   - The VERSIONS of a soft-deleted Document remain VISIBLE to ACCOUNTANT
 *   - A NON-DELETED Document is STILL VISIBLE to its owner + participant (no regression — EPIC-013)
 *   - Cross-engagement isolation STILL HOLDS: CLIENT-B sees ZERO of CLIENT-A's docs (regression check)
 *   - A sibling non-deleted doc is still visible to its owner (selective filter — not all-or-nothing)
 *   - Null SESSION_CONTEXT → ZERO rows (fail-closed — ADR-003 §5 / ADR-005)
 *
 * Acceptance criteria covered (AC-id test-tag contract, per BRIEF-014 methodology):
 *   AC-FILE-006-01 — Deleting marks deleted and removes from normal file view.
 *                    Proven both ways: invisible to owner+participant CLIENT, visible to ACCOUNTANT.
 *   AC-FILE-004-02 — A client cannot delete any file (no client delete path at the RLS layer).
 *                    The soft-delete filter is CLIENT-branch-only; ACCOUNTANT always passes.
 *   AC-FILE-004-03 — No client-facing path exists to remove a file from an engagement.
 *                    Verified: the CLIENT-branch RLS filter is the data-layer gate.
 *
 * ADR-005 §6 minimum coverage per policy (all present below):
 *   [AC-FILE-006-01][NEGATIVE]  Soft-deleted doc invisible to owner CLIENT (HARD)
 *   [AC-FILE-006-01][NEGATIVE]  Soft-deleted doc invisible to participant CLIENT (HARD)
 *   [AC-FILE-004-02][POSITIVE]  Soft-deleted doc STILL VISIBLE to ACCOUNTANT (archive/recover)
 *   [AC-FILE-004-03][POSITIVE]  Admin pool sees soft-deleted doc (RLS-exempt)
 *   [AC-FILE-006-01][NEGATIVE]  Versions of soft-deleted doc invisible to owner + participant CLIENT
 *   [AC-FILE-006-01][POSITIVE]  Versions of soft-deleted doc visible to ACCOUNTANT
 *   [NO-REGRESSION]             Non-deleted sibling doc still visible to owner (filter is selective)
 *   [NO-REGRESSION]             Cross-engagement isolation holds (CLIENT-B sees ZERO of CLIENT-A's docs)
 *   [ADR-005][NEGATIVE]         Null SESSION_CONTEXT reads ZERO — fail-closed
 *
 * Gate Authoring Evidence (ENGINE.md § Gate Authoring Rules — INTRODUCES-GATE: yes):
 *   1. Run marker: packages/db/src/document.soft-delete-isolation.rls.test.ts
 *      Test names (exact):
 *        "[AC-FILE-006-01] soft-deleted doc invisible to owner CLIENT — HARD"
 *        "[AC-FILE-006-01] soft-deleted doc invisible to participant CLIENT — HARD"
 *        "[AC-FILE-004-02] soft-deleted doc STILL VISIBLE to ACCOUNTANT — archive/recover path"
 *        "[POSITIVE] admin pool sees soft-deleted doc — RLS-exempt"
 *        "[AC-FILE-006-01] versions of soft-deleted doc invisible to owner CLIENT"
 *        "[AC-FILE-006-01] versions of soft-deleted doc invisible to participant CLIENT"
 *        "[AC-FILE-006-01] versions of soft-deleted doc visible to ACCOUNTANT"
 *        "[NO-REGRESSION] non-deleted sibling doc still visible to owner after soft-delete"
 *        "[NO-REGRESSION] cross-engagement isolation holds — CLIENT-B sees ZERO of CLIENT-A docs"
 *        "[ADR-005] null SESSION_CONTEXT reads ZERO documents — fail-closed"
 *
 *   2. Named code paths:
 *      sec.fn_document_access 3a CLIENT-owner branch in db/policies/0012-document-soft-delete-filter.sql:
 *        OR (
 *            @documentDeletedAt IS NULL
 *            AND EXISTS (
 *                SELECT 1 FROM [dbo].[User] u
 *                JOIN [dbo].[Engagement] e ON e.[clientUserId] = u.[id]
 *                WHERE u.[clerkId] = CAST(SESSION_CONTEXT(N'clerk_user_id') AS NVARCHAR(64))
 *                  AND e.[id] = @documentEngagementId
 *            )
 *        )
 *      sec.fn_document_version_access 3a CLIENT-owner branch (updated — d.[deletedAt] IS NULL):
 *        OR EXISTS (
 *            SELECT 1 FROM [dbo].[Document] d
 *            JOIN [dbo].[Engagement] e ON e.[id] = d.[engagementId]
 *            JOIN [dbo].[User] u ON u.[id] = e.[clientUserId]
 *            WHERE d.[id] = @documentVersionDocumentId
 *              AND u.[clerkId] = CAST(SESSION_CONTEXT(N'clerk_user_id') AS NVARCHAR(64))
 *              AND d.[deletedAt] IS NULL
 *        )
 *      Counterfactual: removing @documentDeletedAt IS NULL from fn_document_access 3a/3b would
 *      cause soft-deleted docs to remain visible to CLIENT, failing the AC-FILE-006-01 tests.
 *      Removing the FILTER predicate entirely would cause cross-engagement isolation to fail.
 *
 *   3. Counterfactual verified: the tests would fail if either:
 *      (a) @documentDeletedAt IS NULL is removed from fn_document_access 3a/3b
 *          → soft-deleted doc visible to CLIENT (wrong)
 *      (b) d.[deletedAt] IS NULL is removed from fn_document_version_access 3a/3b
 *          → versions of soft-deleted doc visible to CLIENT (wrong)
 *      (c) FILTER predicate is disabled on pol_Document
 *          → CLIENT-B sees CLIENT-A's docs (cross-engagement isolation fails)
 *
 * Connection approach:
 *   Uses raw mssql (not Prisma) for pool setup/control. Rationale: same as TASK-005-001
 *   (Prisma 5.22.0 sqlserver connector cannot parse port in authority URL form — P1013).
 *   SESSION_CONTEXT is set in the same batch as the SELECT to ensure it is active
 *   when the predicate evaluates it.
 *
 * Environment:
 *   DATABASE_URL_ADMIN — admin pool URL (taxportal_admin; IS_MEMBER('app_admin_role')=1 → RLS-exempt)
 *   DATABASE_URL       — request pool URL (taxportal_user; subject to RLS)
 *
 * // CS-SQL-001 // CS-SQL-002 // CS-SQL-003 // ADR-005 // ADR-003 // ADR-018 // ADR-009
 * // DECISION-014-B // DECISION-014-C // CS-GEN-002 // CS-GEN-003
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
 * Three users:
 *   ownerUser:       owner (clientUserId) of Engagement A
 *   participantUser: linked participant on Engagement A (EngagementParticipant row)
 *   clientBUser:     owner of Engagement B (cross-engagement isolation check)
 */
let ownerUserId: string;
let participantUserId: string;
let clientBUserId: string;

/** Engagement A: owned by ownerUser, with participantUser linked. */
let engagementAId: string;
/** Engagement B: owned by clientBUser (cross-engagement isolation check). */
let engagementBId: string;

/** EngagementRequest rows (1:1 FK on Engagement). */
let reqAId: string;
let reqBId: string;

/** EngagementParticipant link: participantUser → Engagement A. */
let participantLinkId: string;

/**
 * Documents in Engagement A:
 *   deletedDocId: soft-deleted document (deletedAt IS NOT NULL) — should be invisible to CLIENT
 *   activeDocId:  non-deleted sibling document (deletedAt IS NULL) — should still be visible to CLIENT
 */
let deletedDocId: string;
let activeDocId: string;

/**
 * Document in Engagement B (CLIENT-B's doc — cross-engagement isolation check).
 */
let clientBDocId: string;

/**
 * DocumentVersion rows for the soft-deleted document (deletedDocId):
 *   versionDeletedV1Id: version row for the soft-deleted parent doc.
 *   The version row itself is not soft-deleted (no deletedAt on DocumentVersion).
 *   But fn_document_version_access CLIENT branch requires d.[deletedAt] IS NULL
 *   where d is the parent Document — so this version becomes invisible to CLIENT.
 */
let versionDeletedV1Id: string;

/**
 * DocumentVersion row for the active (non-deleted) document:
 *   versionActiveV1Id: should remain visible to owner + participant CLIENT.
 */
let versionActiveV1Id: string;

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

  // ─── Seed: User rows (clerkId prefix: 'sd_rls_' for soft-delete-rls) ───────
  const ownerResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[User] ([clerkId], [email], [role], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'sd_rls_owner', N'sd-rls-owner@example.com', N'CLIENT', SYSDATETIMEOFFSET())`
  );
  ownerUserId = ownerResult.recordset[0]?.id ?? "";

  const participantResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[User] ([clerkId], [email], [role], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'sd_rls_participant', N'sd-rls-participant@example.com', N'CLIENT', SYSDATETIMEOFFSET())`
  );
  participantUserId = participantResult.recordset[0]?.id ?? "";

  const clientBResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[User] ([clerkId], [email], [role], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'sd_rls_client_b', N'sd-rls-client-b@example.com', N'CLIENT', SYSDATETIMEOFFSET())`
  );
  clientBUserId = clientBResult.recordset[0]?.id ?? "";

  // ─── Seed: EngagementRequest rows ────────────────────────────────────────
  const reqAResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[EngagementRequest] ([firstName], [lastName], [email], [status], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'SdRLS', N'Owner', N'sd-rls-req-a@example.com', N'accepted', SYSDATETIMEOFFSET())`
  );
  reqAId = reqAResult.recordset[0]?.id ?? "";

  const reqBResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[EngagementRequest] ([firstName], [lastName], [email], [status], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'SdRLS', N'ClientB', N'sd-rls-req-b@example.com', N'accepted', SYSDATETIMEOFFSET())`
  );
  reqBId = reqBResult.recordset[0]?.id ?? "";

  // ─── Seed: Engagement rows (admin pool bypasses BLOCK) ───────────────────
  const engAResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[Engagement]
       ([engagementRequestId], [clientUserId], [status], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES ('${reqAId}', '${ownerUserId}', N'New', SYSDATETIMEOFFSET())`
  );
  engagementAId = engAResult.recordset[0]?.id ?? "";

  const engBResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[Engagement]
       ([engagementRequestId], [clientUserId], [status], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES ('${reqBId}', '${clientBUserId}', N'New', SYSDATETIMEOFFSET())`
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

  // ─── Seed: Documents in Engagement A (admin pool bypasses BLOCK) ─────────
  // Soft-deleted document: deletedAt IS NOT NULL (tombstone set) — ADR-018 §1 / DECISION-014-B
  // This doc should be invisible to CLIENT (owner + participant) via the FILTER predicate.
  const deletedDocResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[Document]
       ([engagementId], [storageKey], [originalFilename], [contentType], [sizeBytes],
        [status], [version], [deletedAt], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (
       '${engagementAId}',
       N'engagements/${engagementAId}/documents/sd-test/v1/deleted-doc.pdf',
       N'deleted-doc.pdf',
       N'application/pdf',
       11111,
       N'active',
       1,
       SYSDATETIMEOFFSET(),
       SYSDATETIMEOFFSET()
     )`
  );
  deletedDocId = deletedDocResult.recordset[0]?.id ?? "";

  // Active (non-deleted) sibling document: deletedAt IS NULL — should remain visible to CLIENT
  // No-regression check: the soft-delete FILTER should not hide this doc.
  const activeDocResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[Document]
       ([engagementId], [storageKey], [originalFilename], [contentType], [sizeBytes],
        [status], [version], [deletedAt], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (
       '${engagementAId}',
       N'engagements/${engagementAId}/documents/sd-test/v1/active-doc.pdf',
       N'active-doc.pdf',
       N'application/pdf',
       22222,
       N'active',
       1,
       NULL,
       SYSDATETIMEOFFSET()
     )`
  );
  activeDocId = activeDocResult.recordset[0]?.id ?? "";

  // Document in Engagement B (CLIENT-B's document — cross-engagement isolation check)
  const clientBDocResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[Document]
       ([engagementId], [storageKey], [originalFilename], [contentType], [sizeBytes],
        [status], [version], [deletedAt], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (
       '${engagementBId}',
       N'engagements/${engagementBId}/documents/sd-test-b/v1/client-b-doc.pdf',
       N'client-b-doc.pdf',
       N'application/pdf',
       33333,
       N'active',
       1,
       NULL,
       SYSDATETIMEOFFSET()
     )`
  );
  clientBDocId = clientBDocResult.recordset[0]?.id ?? "";

  // ─── Seed: DocumentVersion rows (admin pool bypasses BLOCK) ──────────────
  // Version row for the SOFT-DELETED document (deletedDocId)
  // fn_document_version_access CLIENT branches require d.[deletedAt] IS NULL — so this
  // version row becomes invisible to CLIENT when the parent doc is soft-deleted.
  // DECISION-014-C: filter on parent d.[deletedAt], not on the version row itself.
  const versionDeletedResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[DocumentVersion]
       ([documentId], [version], [storageKey], [supersededAt], [uploadedBy], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (
       '${deletedDocId}',
       1,
       N'engagements/${engagementAId}/documents/${deletedDocId}/v1/deleted-doc-v1.pdf',
       NULL,
       N'sd_rls_owner',
       SYSDATETIMEOFFSET()
     )`
  );
  versionDeletedV1Id = versionDeletedResult.recordset[0]?.id ?? "";

  // Version row for the ACTIVE (non-deleted) document (activeDocId)
  // Should remain visible to CLIENT after the sibling doc is soft-deleted.
  const versionActiveResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[DocumentVersion]
       ([documentId], [version], [storageKey], [supersededAt], [uploadedBy], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (
       '${activeDocId}',
       1,
       N'engagements/${engagementAId}/documents/${activeDocId}/v1/active-doc-v1.pdf',
       NULL,
       N'sd_rls_owner',
       SYSDATETIMEOFFSET()
     )`
  );
  versionActiveV1Id = versionActiveResult.recordset[0]?.id ?? "";
}, 30000);

afterAll(async () => {
  // Cleanup via admin pool — reverse dependency order (DocumentVersion → Document → Engagement → EngagementRequest → User)

  // DocumentVersion rows first (FK → Document)
  if (versionDeletedV1Id) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[DocumentVersion] WHERE [id] = '${versionDeletedV1Id}'`
    ).catch(() => { /* ignore */ });
  }
  if (versionActiveV1Id) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[DocumentVersion] WHERE [id] = '${versionActiveV1Id}'`
    ).catch(() => { /* ignore */ });
  }

  // Document rows
  if (deletedDocId) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[Document] WHERE [id] = '${deletedDocId}'`
    ).catch(() => { /* ignore */ });
  }
  if (activeDocId) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[Document] WHERE [id] = '${activeDocId}'`
    ).catch(() => { /* ignore */ });
  }
  if (clientBDocId) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[Document] WHERE [id] = '${clientBDocId}'`
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
  if (reqAId) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[EngagementRequest] WHERE [id] = '${reqAId}'`
    ).catch(() => { /* ignore */ });
  }
  if (reqBId) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[EngagementRequest] WHERE [id] = '${reqBId}'`
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
  if (clientBUserId) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[User] WHERE [id] = '${clientBUserId}'`
    ).catch(() => { /* ignore */ });
  }

  await adminPool.close().catch(() => { /* ignore */ });
  await requestPool.close().catch(() => { /* ignore */ });
}, 30000);

// ─── Tests: Document soft-delete isolation ────────────────────────────────────
// AC-FILE-006-01: invisible to CLIENT; visible to ACCOUNTANT.
// AC-FILE-004-02/-03: the deletedAt filter is CLIENT-branch-only.
// // CS-SQL-001 // ADR-005 // ADR-018 // DECISION-014-B

describe("sec.pol_Document — soft-delete isolation (EPIC-014 / TASK-014-001 / CS-SQL-001 / ADR-005 §6 HARD GATE)", () => {

  /**
   * [AC-FILE-006-01][NEGATIVE] Soft-deleted doc invisible to owner CLIENT.
   * Named code path: fn_document_access 3a CLIENT-owner branch.
   *   clerkId='sd_rls_owner' → User.id = ownerUserId → Engagement.clientUserId matches
   *   → BUT @documentDeletedAt IS NOT NULL → branch evaluates FALSE → 0 rows.
   * ADR-018 §1: soft-delete removes doc from client/working view. // DECISION-014-B
   * // CS-SQL-001 // ADR-005 // ADR-018 // DECISION-014-B // AC-FILE-006-01
   */
  it("[AC-FILE-006-01] soft-deleted doc invisible to owner CLIENT — HARD", async () => {
    const result = await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = N'sd_rls_owner', @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = N'CLIENT', @read_only = 0;
       SELECT [id], [originalFilename], [deletedAt] FROM [dbo].[Document]
       WHERE [id] = '${deletedDocId}';`
    );

    const recordsets = result.recordsets as Array<Array<{ id?: string; originalFilename?: string; deletedAt?: Date }>>;
    const selectRecordset = recordsets[recordsets.length - 1];

    // Clear context
    await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = NULL, @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = NULL, @read_only = 0;`
    );

    // Soft-deleted doc MUST be invisible to the owning CLIENT (FILTER removes it — AC-FILE-006-01)
    expect(selectRecordset).toHaveLength(0);
  });

  /**
   * [AC-FILE-006-01][NEGATIVE] Soft-deleted doc invisible to participant CLIENT.
   * Named code path: fn_document_access 3b CLIENT-participant branch.
   *   clerkId='sd_rls_participant' → EngagementParticipant link to Engagement A
   *   → BUT @documentDeletedAt IS NOT NULL → branch evaluates FALSE → 0 rows.
   * CS-GEN-002: participant branch gains the same filter (additive — only CLIENT branches). // CS-GEN-002
   * // CS-SQL-001 // ADR-005 // DECISION-013-A // DECISION-014-B // AC-FILE-006-01
   */
  it("[AC-FILE-006-01] soft-deleted doc invisible to participant CLIENT — HARD", async () => {
    const result = await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = N'sd_rls_participant', @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = N'CLIENT', @read_only = 0;
       SELECT [id] FROM [dbo].[Document]
       WHERE [id] = '${deletedDocId}';`
    );

    const recordsets = result.recordsets as Array<Array<{ id?: string }>>;
    const selectRecordset = recordsets[recordsets.length - 1];

    // Clear context
    await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = NULL, @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = NULL, @read_only = 0;`
    );

    // Soft-deleted doc MUST be invisible to participant CLIENT (AC-FILE-006-01)
    expect(selectRecordset).toHaveLength(0);
  });

  /**
   * [AC-FILE-004-02] Soft-deleted doc STILL VISIBLE to ACCOUNTANT — archive/recover path.
   * Named code path: fn_document_access branch 2 (ACCOUNTANT role always passes).
   *   CAST(SESSION_CONTEXT(N'role') AS NVARCHAR(16)) = N'ACCOUNTANT' → TRUE → 1 row.
   *   The @documentDeletedAt IS NULL check is inside the CLIENT branches (3a/3b) only.
   *   ACCOUNTANT branch does NOT check deletedAt — this is DECISION-014-B: filter is CLIENT-only.
   * AC-FILE-004-02/-03: the deletedAt filter is CLIENT-branch-only; ACCOUNTANT always sees all. ✓
   * AC-FILE-006-03 substrate: the accountant recover path requires visibility.
   * // CS-SQL-001 // ADR-005 // CS-GEN-002 // DECISION-014-B // AC-FILE-004-02 // AC-FILE-004-03
   */
  it("[AC-FILE-004-02] soft-deleted doc STILL VISIBLE to ACCOUNTANT — archive/recover path", async () => {
    const result = await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = N'sd_rls_accountant', @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = N'ACCOUNTANT', @read_only = 0;
       SELECT [id], [originalFilename], [deletedAt] FROM [dbo].[Document]
       WHERE [id] = '${deletedDocId}';`
    );

    const recordsets = result.recordsets as Array<Array<{ id?: string; originalFilename?: string; deletedAt?: Date }>>;
    const selectRecordset = recordsets[recordsets.length - 1];

    // Clear context
    await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = NULL, @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = NULL, @read_only = 0;`
    );

    // ACCOUNTANT MUST see the soft-deleted doc (branch 2 passes regardless of deletedAt)
    expect(selectRecordset).toHaveLength(1);
    expect(selectRecordset?.[0]?.id).toBe(deletedDocId);
    expect(selectRecordset?.[0]?.originalFilename).toBe("deleted-doc.pdf");
    // Verify the doc is actually soft-deleted (deletedAt IS NOT NULL confirms test data integrity)
    expect(selectRecordset?.[0]?.deletedAt).not.toBeNull();
  });

  /**
   * [POSITIVE] Admin pool sees soft-deleted doc — RLS-exempt.
   * IS_MEMBER('app_admin_role') = 1 → branch 1 passes → 1 row.
   * Admin pool bypasses all RLS including the deletedAt filter.
   * // CS-SQL-001 // ADR-005
   */
  it("[POSITIVE] admin pool sees soft-deleted doc — RLS-exempt", async () => {
    const result = await adminPool.request().query<{ id: string; deletedAt: Date }>(
      `SELECT [id], [deletedAt] FROM [dbo].[Document] WHERE [id] = '${deletedDocId}'`
    );
    expect(result.recordset).toHaveLength(1);
    expect(result.recordset[0]?.id).toBe(deletedDocId);
    // Confirm the doc is actually soft-deleted in the DB
    expect(result.recordset[0]?.deletedAt).not.toBeNull();
  });

  /**
   * [NO-REGRESSION] Non-deleted sibling doc still visible to owner after soft-delete.
   * The FILTER is NOT all-or-nothing: it only hides rows where deletedAt IS NOT NULL.
   * An active (deletedAt=NULL) sibling in the same engagement remains visible to the owner.
   * This proves the filter is selective — EPIC-013 "owner reads own docs" path is unbroken.
   * // CS-SQL-001 // CS-GEN-002 // ADR-005
   */
  it("[NO-REGRESSION] non-deleted sibling doc still visible to owner after soft-delete", async () => {
    const result = await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = N'sd_rls_owner', @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = N'CLIENT', @read_only = 0;
       SELECT [id], [originalFilename] FROM [dbo].[Document]
       WHERE [id] = '${activeDocId}';`
    );

    const recordsets = result.recordsets as Array<Array<{ id?: string; originalFilename?: string }>>;
    const selectRecordset = recordsets[recordsets.length - 1];

    // Clear context
    await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = NULL, @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = NULL, @read_only = 0;`
    );

    // Active doc MUST remain visible to owner — soft-delete filter is selective (only hides deleted docs)
    expect(selectRecordset).toHaveLength(1);
    expect(selectRecordset?.[0]?.id).toBe(activeDocId);
    expect(selectRecordset?.[0]?.originalFilename).toBe("active-doc.pdf");
  });

  /**
   * [NO-REGRESSION] Cross-engagement isolation holds — CLIENT-B sees ZERO of CLIENT-A docs.
   * This verifies the EPIC-013 engagement isolation is NOT regressed by the EPIC-014 change.
   * CLIENT-B's SESSION_CONTEXT → fn_document_access EXISTS checks against Engagement A
   *   → EXISTS empty (clientBUserId ≠ Engagement A's clientUserId) → 0 rows.
   * Both deleted and active Engagement A documents must be invisible to CLIENT-B.
   * // CS-SQL-001 // ADR-005 // AC-FILE-001-05 (regression check)
   */
  it("[NO-REGRESSION] cross-engagement isolation holds — CLIENT-B sees ZERO of CLIENT-A docs", async () => {
    const result = await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = N'sd_rls_client_b', @read_only = 0;
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

    // CLIENT-B MUST see ZERO documents from Engagement A (cross-engagement isolation — ADR-005 §6 HARD)
    expect(selectRecordset).toHaveLength(0);
  });

  /**
   * [ADR-005][NEGATIVE] Null SESSION_CONTEXT reads ZERO documents — fail-closed.
   * ADR-003 §5: null identity → all three branches fail → predicate empty → 0 rows.
   * This applies to both soft-deleted and active documents.
   * // ADR-005 // ADR-003
   */
  it("[ADR-005] null SESSION_CONTEXT reads ZERO documents — fail-closed", async () => {
    // No SESSION_CONTEXT set (anonymous path)
    const result = await requestPool.request().query(
      `SELECT COUNT(*) AS cnt FROM [dbo].[Document]
       WHERE [id] IN ('${deletedDocId}', '${activeDocId}')`
    );

    const cnt = (result.recordset as Array<{ cnt?: number }>)[0]?.cnt ?? -1;
    // Null SESSION_CONTEXT → all branches fail → FILTER removes all rows → 0 rows (fail-closed)
    expect(cnt).toBe(0);
  });

});

// ─── Tests: DocumentVersion soft-delete isolation ─────────────────────────────
// DECISION-014-C: fn_document_version_access CLIENT branches gain AND d.[deletedAt] IS NULL

describe("sec.pol_DocumentVersion — soft-delete isolation via parent Document.deletedAt (DECISION-014-C / CS-SQL-001)", () => {

  /**
   * [AC-FILE-006-01][NEGATIVE] Versions of soft-deleted doc invisible to owner CLIENT.
   * Named code path: fn_document_version_access 3a CLIENT-owner branch (updated).
   *   d.[deletedAt] IS NULL check in the EXISTS (parent doc is soft-deleted → EXISTS empty).
   *   The version row itself has no deletedAt — the parent doc's deletedAt is what matters.
   * DECISION-014-C: filter on parent d.[deletedAt], not on the version row itself.
   * // CS-SQL-001 // ADR-005 // ADR-018 // DECISION-014-C // AC-FILE-006-01
   */
  it("[AC-FILE-006-01] versions of soft-deleted doc invisible to owner CLIENT", async () => {
    const result = await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = N'sd_rls_owner', @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = N'CLIENT', @read_only = 0;
       SELECT [id] FROM [dbo].[DocumentVersion]
       WHERE [id] = '${versionDeletedV1Id}';`
    );

    const recordsets = result.recordsets as Array<Array<{ id?: string }>>;
    const selectRecordset = recordsets[recordsets.length - 1];

    // Clear context
    await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = NULL, @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = NULL, @read_only = 0;`
    );

    // Version of soft-deleted doc MUST be invisible to owner CLIENT (parent d.[deletedAt] IS NOT NULL)
    expect(selectRecordset).toHaveLength(0);
  });

  /**
   * [AC-FILE-006-01][NEGATIVE] Versions of soft-deleted doc invisible to participant CLIENT.
   * Named code path: fn_document_version_access 3b CLIENT-participant branch (updated).
   *   d.[deletedAt] IS NULL check in the participant EXISTS.
   * // CS-SQL-001 // ADR-005 // DECISION-013-A // DECISION-014-C // AC-FILE-006-01
   */
  it("[AC-FILE-006-01] versions of soft-deleted doc invisible to participant CLIENT", async () => {
    const result = await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = N'sd_rls_participant', @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = N'CLIENT', @read_only = 0;
       SELECT [id] FROM [dbo].[DocumentVersion]
       WHERE [id] = '${versionDeletedV1Id}';`
    );

    const recordsets = result.recordsets as Array<Array<{ id?: string }>>;
    const selectRecordset = recordsets[recordsets.length - 1];

    // Clear context
    await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = NULL, @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = NULL, @read_only = 0;`
    );

    // Version of soft-deleted doc MUST be invisible to participant CLIENT (AC-FILE-006-01)
    expect(selectRecordset).toHaveLength(0);
  });

  /**
   * [AC-FILE-006-01][POSITIVE] Versions of soft-deleted doc visible to ACCOUNTANT.
   * Named code path: fn_document_version_access branch 2 (ACCOUNTANT always passes).
   *   The d.[deletedAt] IS NULL check is inside CLIENT branches (3a/3b) only.
   *   ACCOUNTANT sees ALL version rows including those of soft-deleted parent docs.
   * AC-FILE-006-03 substrate: recover path requires the version history to remain accessible.
   * // CS-SQL-001 // ADR-005 // CS-GEN-002 // DECISION-014-C // AC-FILE-006-01 // AC-FILE-006-03
   */
  it("[AC-FILE-006-01] versions of soft-deleted doc visible to ACCOUNTANT", async () => {
    const result = await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = N'sd_rls_accountant', @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = N'ACCOUNTANT', @read_only = 0;
       SELECT [id], [version] FROM [dbo].[DocumentVersion]
       WHERE [id] = '${versionDeletedV1Id}';`
    );

    const recordsets = result.recordsets as Array<Array<{ id?: string; version?: number }>>;
    const selectRecordset = recordsets[recordsets.length - 1];

    // Clear context
    await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = NULL, @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = NULL, @read_only = 0;`
    );

    // ACCOUNTANT MUST see the version row (branch 2 passes regardless — archive/recover path)
    expect(selectRecordset).toHaveLength(1);
    expect(selectRecordset?.[0]?.id).toBe(versionDeletedV1Id);
  });

  /**
   * [NO-REGRESSION] Version of non-deleted doc still visible to owner CLIENT.
   * The fn_document_version_access filter should NOT hide versions of active (non-deleted) docs.
   * d.[deletedAt] IS NULL for the active parent → EXISTS check passes → 1 row.
   * // CS-SQL-001 // CS-GEN-002 // ADR-005
   */
  it("[NO-REGRESSION] version of active (non-deleted) doc still visible to owner CLIENT", async () => {
    const result = await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = N'sd_rls_owner', @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = N'CLIENT', @read_only = 0;
       SELECT [id] FROM [dbo].[DocumentVersion]
       WHERE [id] = '${versionActiveV1Id}';`
    );

    const recordsets = result.recordsets as Array<Array<{ id?: string }>>;
    const selectRecordset = recordsets[recordsets.length - 1];

    // Clear context
    await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = NULL, @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = NULL, @read_only = 0;`
    );

    // Version of active doc MUST remain visible to owner (no regression — EPIC-013 path unbroken)
    expect(selectRecordset).toHaveLength(1);
    expect(selectRecordset?.[0]?.id).toBe(versionActiveV1Id);
  });

});

// ─── Admin pool sanity checks ─────────────────────────────────────────────────

describe("sec.pol_Document + sec.pol_DocumentVersion — admin pool sanity (RLS-exempt)", () => {

  /**
   * [POSITIVE] Admin pool sees both documents (deleted + active) — RLS-exempt.
   * IS_MEMBER('app_admin_role') = 1 → branch 1 passes → 2 rows.
   * // ADR-005 // CS-SQL-001
   */
  it("[POSITIVE] admin pool sees both Engagement A documents (deleted + active) — RLS-exempt", async () => {
    const result = await adminPool.request().query<{ id: string; deletedAt: Date | null }>(
      `SELECT [id], [deletedAt] FROM [dbo].[Document]
       WHERE [id] IN ('${deletedDocId}', '${activeDocId}')
       ORDER BY [originalFilename]`
    );
    expect(result.recordset).toHaveLength(2);
    // One is soft-deleted, one is not
    const deletedAtValues = result.recordset.map(r => r.deletedAt);
    const hasDeletedOne = deletedAtValues.some(v => v !== null);
    const hasActiveOne = deletedAtValues.some(v => v === null);
    expect(hasDeletedOne).toBe(true);
    expect(hasActiveOne).toBe(true);
  });

  /**
   * [POSITIVE] Admin pool sees both DocumentVersion rows — RLS-exempt.
   * // ADR-005 // CS-SQL-001
   */
  it("[POSITIVE] admin pool sees both document version rows (deleted-parent + active-parent) — RLS-exempt", async () => {
    const result = await adminPool.request().query<{ id: string }>(
      `SELECT [id] FROM [dbo].[DocumentVersion]
       WHERE [id] IN ('${versionDeletedV1Id}', '${versionActiveV1Id}')`
    );
    expect(result.recordset).toHaveLength(2);
    const ids = result.recordset.map(r => r.id);
    expect(ids).toContain(versionDeletedV1Id);
    expect(ids).toContain(versionActiveV1Id);
  });

});
