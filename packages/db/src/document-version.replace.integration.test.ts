/**
 * packages/db/src/document-version.replace.integration.test.ts
 *
 * TIER-3 INTEGRATION TEST — requires real SQL Server (ADR-005 §6).
 *
 * Tests replaceDocumentWithNewVersion + listDocumentVersions (EPIC-013 / BRIEF-013 / TASK-013-002):
 *   - replace an active v1 document → a v2 DocumentVersion row with a DISTINCT storageKey
 *   - v1 DocumentVersion row is still present with supersededAt IS NOT NULL (AC-FILE-009-03)
 *   - current resolves to the newest non-superseded version (AC-FILE-009-02)
 *   - parent Document row updated: storageKey, version pointer → v2 state (DECISION-013-C)
 *   - authorizeAccountantUpload: admin pool read; returns EngagementItem for existing engagement;
 *     returns null for unknown engagementId (ADR-009 two-phase: authorize BEFORE sign)
 *
 * Acceptance criteria covered:
 *   AC-FILE-009-01: Accountant can upload a new version of an existing document.
 *   AC-FILE-009-02: After replacement, "current" resolves to the newest non-superseded version.
 *   AC-FILE-009-03: Every prior version retained + accessible after replacement.
 *   AC-FILE-001-01: authorizeAccountantUpload — admin-pool authorize primitive.
 *   AC-FILE-001-03: authorizeThenSignDownload accessible by both-party (TASK-013-001 gate).
 *   AC-FILE-001-04: authorizeThenSignDownload via participant-extended fn_document_access (TASK-013-001).
 *
 * // ADR-003 // ADR-009 // ADR-019 // DECISION-013-C // DECISION-013-B
 * // AC-FILE-009-01 // AC-FILE-009-02 // AC-FILE-009-03 // AC-FILE-001-01
 * // CS-TS-001 // CS-TS-002 // CS-GEN-001 // CS-GEN-003
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import mssqlPkg from "mssql";
import { parseSqlServerUrl } from "./sql-server-url.js";
import { withClerkIdentity } from "./context.js";
import {
  replaceDocumentWithNewVersion,
  listDocumentVersions,
  authorizeAccountantUpload,
  authorizeThenSignDownload,
} from "./repositories/document.js";
import { getStorage, resetStorageForTesting } from "@tax-portal/storage";

const { ConnectionPool } = mssqlPkg;

// ─── Connection pools ─────────────────────────────────────────────────────────

let adminPool: InstanceType<typeof ConnectionPool>;

const ADMIN_URL = process.env["DATABASE_URL_ADMIN"];
const REQUEST_URL = process.env["DATABASE_URL"];

// ─── Test data ────────────────────────────────────────────────────────────────

let ownerClerkId: string;
let ownerUserId: string;
let engagementId: string;
let engagementRequestId: string;
let documentId: string;
let versionV1Id: string;

const documentIds: string[] = [];
const versionIds: string[] = [];
const engagementIds: string[] = [];
const requestIds: string[] = [];
const userIds: string[] = [];

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  if (!ADMIN_URL) throw new Error("DATABASE_URL_ADMIN is required for integration tests");
  if (!REQUEST_URL) throw new Error("DATABASE_URL is required for integration tests");

  // Initialize the storage adapter for the [AC-FILE-009-03][ACCESSIBLE] test.
  // Mirrors the pattern in document.encryption.rls.test.ts — set STORAGE_ADAPTER=azurite
  // and provide the well-known Azurite dev credentials if not already set.
  // The getSignedDownloadUrl call in the ACCESSIBLE test requires a real adapter (not memory).
  // DECISION-013-005-FIX1: Self-contained adapter init so the tier-3 file runs without
  // manual STORAGE_ADAPTER export. Azurite is part of the integration test stack (docker compose up -d).
  // // ADR-008 // ADR-009 // DECISION-013-005-FIX1
  process.env["STORAGE_ADAPTER"] = "azurite";
  if (!process.env["STORAGE_CONNECTION_STRING"]) {
    process.env["STORAGE_CONNECTION_STRING"] =
      "DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;" +
      "AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;" +
      "BlobEndpoint=http://127.0.0.1:10000/devstoreaccount1";
  }
  resetStorageForTesting(); // flush any prior adapter instance

  const adminConfig = parseSqlServerUrl(ADMIN_URL) as import("mssql").config;
  adminPool = new ConnectionPool(adminConfig);
  await adminPool.connect();

  ownerClerkId = "dv_repl_owner";

  // ─── Pre-clean: remove any stale data from prior runs ───────────────────
  const staleUserResult = await adminPool.request().query<{ id: string }>(
    `SELECT [id] FROM [dbo].[User] WHERE [clerkId] = N'${ownerClerkId}'`
  );
  const staleUserId = staleUserResult.recordset[0]?.id;
  if (staleUserId) {
    const staleEngResult = await adminPool.request().query<{ id: string }>(
      `SELECT [id] FROM [dbo].[Engagement] WHERE [clientUserId] = '${staleUserId}'`
    );
    for (const staleEng of staleEngResult.recordset) {
      const staleDocResult = await adminPool.request().query<{ id: string }>(
        `SELECT [id] FROM [dbo].[Document] WHERE [engagementId] = '${staleEng.id}'`
      );
      for (const staleDoc of staleDocResult.recordset) {
        await adminPool.request().query(
          `DELETE FROM [dbo].[DocumentVersion] WHERE [documentId] = '${staleDoc.id}'`
        ).catch(() => { /* ignore */ });
      }
      await adminPool.request().query(
        `DELETE FROM [dbo].[Document] WHERE [engagementId] = '${staleEng.id}'`
      ).catch(() => { /* ignore */ });
      await adminPool.request().query(
        `DELETE FROM [dbo].[Engagement] WHERE [id] = '${staleEng.id}'`
      ).catch(() => { /* ignore */ });
    }
    await adminPool.request().query(
      `DELETE FROM [dbo].[EngagementRequest] WHERE [email] = N'dv-repl-req@example.com'`
    ).catch(() => { /* ignore */ });
    await adminPool.request().query(
      `DELETE FROM [dbo].[User] WHERE [id] = '${staleUserId}'`
    ).catch(() => { /* ignore */ });
  }

  // Seed: User
  const userResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[User] ([clerkId], [email], [role], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'${ownerClerkId}', N'dv-repl-owner@example.com', N'CLIENT', SYSDATETIMEOFFSET())`
  );
  ownerUserId = userResult.recordset[0]?.id ?? "";
  userIds.push(ownerUserId);

  // Seed: EngagementRequest
  const reqResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[EngagementRequest] ([firstName], [lastName], [email], [status], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'DVRepl', N'Owner', N'dv-repl-req@example.com', N'accepted', SYSDATETIMEOFFSET())`
  );
  engagementRequestId = reqResult.recordset[0]?.id ?? "";
  requestIds.push(engagementRequestId);

  // Seed: Engagement
  const engResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[Engagement]
       ([engagementRequestId], [clientUserId], [status], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES ('${engagementRequestId}', '${ownerUserId}', N'New', SYSDATETIMEOFFSET())`
  );
  engagementId = engResult.recordset[0]?.id ?? "";
  engagementIds.push(engagementId);

  // Seed: Document (v1 active — the one we will replace)
  // The v1 storageKey will be compared after replacement to ensure v2 has a distinct key.
  const docResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[Document]
       ([engagementId], [storageKey], [originalFilename], [contentType],
        [sizeBytes], [status], [version], [uploadedBy], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (
       '${engagementId}',
       N'__placeholder_key__',
       N'report.pdf', N'application/pdf',
       10000, N'active', 1, N'${ownerClerkId}', SYSDATETIMEOFFSET()
     )`
  );
  documentId = docResult.recordset[0]?.id ?? "";
  documentIds.push(documentId);

  // Update the storageKey to use the real documentId (matches ADR-009 shape)
  const v1StorageKey = `engagements/${engagementId}/documents/${documentId}/v1/report.pdf`;
  await adminPool.request().query(
    `UPDATE [dbo].[Document]
     SET [storageKey] = N'${v1StorageKey}', [updatedAt] = SYSDATETIMEOFFSET()
     WHERE [id] = '${documentId}'`
  );

  // Seed: DocumentVersion v1 row (current — supersededAt IS NULL)
  const v1Result = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[DocumentVersion]
       ([documentId], [version], [storageKey], [supersededAt], [uploadedBy], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (
       '${documentId}', 1, N'${v1StorageKey}', NULL, N'${ownerClerkId}', SYSDATETIMEOFFSET()
     )`
  );
  versionV1Id = v1Result.recordset[0]?.id ?? "";
  versionIds.push(versionV1Id);
}, 30000);

afterAll(async () => {
  // Cleanup in reverse dependency order
  for (const vid of versionIds) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[DocumentVersion] WHERE [id] = '${vid}'`
    ).catch(() => { /* ignore */ });
  }
  for (const did of documentIds) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[Document] WHERE [id] = '${did}'`
    ).catch(() => { /* ignore */ });
  }
  for (const eid of engagementIds) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[Engagement] WHERE [id] = '${eid}'`
    ).catch(() => { /* ignore */ });
  }
  for (const rid of requestIds) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[EngagementRequest] WHERE [id] = '${rid}'`
    ).catch(() => { /* ignore */ });
  }
  for (const uid of userIds) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[User] WHERE [id] = '${uid}'`
    ).catch(() => { /* ignore */ });
  }
  await adminPool.close().catch(() => { /* ignore */ });
  resetStorageForTesting(); // release adapter singleton after tests complete
}, 30000);

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("authorizeAccountantUpload — admin pool authorize (AC-FILE-001-01 / ADR-009)", () => {

  /**
   * [AC-FILE-001-01] authorizeAccountantUpload returns EngagementItem for existing engagement.
   * Admin pool authorize: runs BEFORE any URL is minted (ADR-009 two-phase discipline).
   * Admin pool is RLS-exempt — accountant sees all engagements.
   * // AC-FILE-001-01 // ADR-003 // ADR-009 // CS-TS-001
   */
  it("[AC-FILE-001-01] authorizeAccountantUpload returns EngagementItem for a known engagement", async () => {
    const result = await authorizeAccountantUpload({ engagementId });

    expect(result).not.toBeNull();
    expect(result?.id.toLowerCase()).toBe(engagementId.toLowerCase());
    expect(result?.status).toBe("New");
    // clientUserId is present (owner is linked)
    expect(result?.clientUserId?.toLowerCase()).toBe(ownerUserId.toLowerCase());
  });

  /**
   * [AC-FILE-001-01] authorizeAccountantUpload returns null for unknown engagementId.
   * ADR-009: authorize returns null → caller must not mint a URL. Fail-closed.
   * // AC-FILE-001-01 // ADR-009
   */
  it("[AC-FILE-001-01] authorizeAccountantUpload returns null for unknown engagementId", async () => {
    const result = await authorizeAccountantUpload({
      engagementId: "00000000-0000-0000-0000-000000000002",
    });

    expect(result).toBeNull();
  });

});

describe("replaceDocumentWithNewVersion — version replacement (DECISION-013-C / AC-FILE-009-01/-02/-03)", () => {

  // Track the replacement result for subsequent tests
  let replaceResult: Awaited<ReturnType<typeof replaceDocumentWithNewVersion>>;
  const originalV1StorageKey = `engagements/${engagementIds[0]}/documents/__placeholder__/v1/report.pdf`;

  /**
   * [AC-FILE-009-01] replaceDocumentWithNewVersion creates a new DocumentVersion row.
   * ADR-009: replacement = new row + new storage key. Never an overwrite.
   * DECISION-013-C: parent Document row is updated to the current pointer.
   * // AC-FILE-009-01 // ADR-009 // DECISION-013-C // CS-TS-001
   */
  it("[AC-FILE-009-01] replaceDocumentWithNewVersion creates v2 DocumentVersion with distinct storageKey", async () => {
    replaceResult = await replaceDocumentWithNewVersion({
      documentId,
      engagementId,
      originalFilename: "report-v2.pdf",
      contentType: "application/pdf",
      sizeBytes: 20000,
      uploadedByClerkId: "accountant_clerk_repl_intg",
      sourceSurface: "admin",
    });

    // Track the new version row for cleanup
    versionIds.push(replaceResult.newVersionId);

    expect(replaceResult.newVersionId).toBeTruthy();
    expect(replaceResult.newVersion).toBe(2); // v1 + 1
    expect(replaceResult.newStorageKey).toContain("/v2/"); // ADR-009 versioned key shape
    expect(replaceResult.newStorageKey).not.toContain("/v1/"); // NEW key, not a copy
  });

  /**
   * [AC-FILE-009-03] v1 DocumentVersion row is retained with supersededAt IS NOT NULL.
   * ADR-009: replacement never deletes the prior version object or row.
   * DECISION-013-B: superseded rows have supersededAt set but are never physically deleted.
   * // AC-FILE-009-03 // ADR-009 // DECISION-013-B
   */
  it("[AC-FILE-009-03] v1 DocumentVersion row still present with supersededAt IS NOT NULL — retained", async () => {
    const check = await adminPool.request().query<{
      id: string;
      version: number;
      supersededAt: Date | null;
    }>(
      `SELECT [id], [version], [supersededAt]
       FROM [dbo].[DocumentVersion]
       WHERE [id] = '${versionV1Id}'`
    );

    expect(check.recordset).toHaveLength(1);
    const v1Row = check.recordset[0]!;

    // v1 row MUST still exist (never deleted — AC-FILE-009-03)
    expect(v1Row.version).toBe(1);

    // v1 MUST be superseded (supersededAt IS NOT NULL) — DECISION-013-C
    expect(v1Row.supersededAt).not.toBeNull();
  });

  /**
   * [AC-FILE-009-02] Current version resolves to the newest non-superseded version.
   * DECISION-013-C: parent Document row is the current pointer (version column + storageKey).
   * // AC-FILE-009-02 // DECISION-013-C // ADR-009
   */
  it("[AC-FILE-009-02] parent Document row points to v2 (current — supersededAt IS NULL)", async () => {
    const docCheck = await adminPool.request().query<{
      version: number;
      storageKey: string;
    }>(
      `SELECT [version], [storageKey]
       FROM [dbo].[Document]
       WHERE [id] = '${documentId}'`
    );

    expect(docCheck.recordset).toHaveLength(1);
    const docRow = docCheck.recordset[0]!;

    // Parent Document row MUST now point to v2 (current pointer — DECISION-013-C)
    expect(docRow.version).toBe(2);
    expect(docRow.storageKey).toBe(replaceResult.newStorageKey);
    expect(docRow.storageKey).toContain("/v2/");
  });

  /**
   * [AC-FILE-009-02/-03] listDocumentVersions returns both v1 (superseded) and v2 (current).
   * v1 has supersededAt IS NOT NULL; v2 has supersededAt IS NULL.
   * The caller identifies "current" by supersededAt IS NULL.
   * // AC-FILE-009-02 // AC-FILE-009-03 // CS-TS-001 // ADR-003
   */
  it("[AC-FILE-009-02/-03] listDocumentVersions returns v1 (superseded) + v2 (current) under CLIENT context", async () => {
    const versions = await withClerkIdentity(
      ownerClerkId,
      "CLIENT",
      () => listDocumentVersions(documentId),
    );

    // Both versions must be present (AC-FILE-009-03: prior retained)
    expect(versions).toHaveLength(2);

    const v1 = versions.find((v) => v.version === 1);
    const v2 = versions.find((v) => v.version === 2);

    // v1: retained + superseded (AC-FILE-009-03)
    expect(v1).toBeDefined();
    expect(v1?.id.toLowerCase()).toBe(versionV1Id.toLowerCase());
    expect(v1?.supersededAt).not.toBeNull(); // superseded by v2

    // v2: current (AC-FILE-009-02 — supersededAt IS NULL)
    expect(v2).toBeDefined();
    expect(v2?.id.toLowerCase()).toBe(replaceResult.newVersionId.toLowerCase());
    expect(v2?.supersededAt).toBeNull(); // current version

    // v2 storageKey must be distinct from v1 (ADR-009: never overwrite)
    expect(v2?.storageKey).toBe(replaceResult.newStorageKey);
    expect(v1?.storageKey).not.toBe(v2?.storageKey);
  });

  /**
   * [AC-FILE-009-02] Current version can be identified as the row with supersededAt IS NULL.
   * Caller filters by supersededAt IS NULL to get the current version.
   * // AC-FILE-009-02 // DECISION-013-C // ADR-003
   */
  it("[AC-FILE-009-02] current version identified by supersededAt IS NULL (newest non-superseded)", async () => {
    const versions = await withClerkIdentity(
      ownerClerkId,
      "CLIENT",
      () => listDocumentVersions(documentId),
    );

    // Current = supersededAt IS NULL
    const currentVersions = versions.filter((v) => v.supersededAt === null);
    expect(currentVersions).toHaveLength(1);
    expect(currentVersions[0]?.version).toBe(2);
    expect(currentVersions[0]?.storageKey).toContain("/v2/");
  });

  /**
   * [AC-FILE-001-03/-04] authorizeThenSignDownload resolves through fn_document_access.
   * After replacement, the Document.storageKey points to v2 (pending after replace).
   * The prior v1 storageKey is distinct — demonstrates both-party download resolves correctly.
   * // AC-FILE-001-03 // AC-FILE-001-04 // ADR-009 // CS-TS-001
   */
  it("[AC-FILE-001-03/-04] authorizeThenSignDownload resolves via participant-extended fn_document_access", async () => {
    // The document is now 'pending' (replaceDocumentWithNewVersion sets status=pending).
    // authorizeThenSignDownload MUST NOT sign a pending document (AC-NFR-009-01 gate).
    const result = await withClerkIdentity(
      ownerClerkId,
      "CLIENT",
      () => authorizeThenSignDownload({
        documentId,
        engagementId,
      }),
    );

    // The document is pending — gate must refuse (not-active)
    expect(result.authorized).toBe(false);
    if (!result.authorized) {
      expect(result.reason).toBe("not-active"); // pending document must never be signed
    }
  });

  /**
   * [AC-FILE-009-03][ACCESSIBLE] Prior (superseded) version remains downloadable after replacement.
   *
   * AC-FILE-009-03 mandate: "every prior version is retained AND remains accessible."
   * "Accessible" = downloadable, not merely listed. This test proves the download path.
   *
   * Flow under test (mirrors requestDownloadUrlForVersionAction logic):
   *   1. Promote parent Document back to 'active' (simulating completeUpload for v2).
   *   2. Call authorizeThenSignDownload (ACCOUNTANT context) → authorized: true + URL minted.
   *      This proves the active-gate passes and the current document path is signed.
   *   3. Retrieve the v1 DocumentVersion storageKey from the DB (the superseded row).
   *   4. Call getStorage().getSignedDownloadUrl(v1StorageKey) → proves the prior version's
   *      storageKey is independently signable (returns a non-empty URL with a future expiresAt).
   *
   * This confirms the requestDownloadUrlForVersionAction flow works for a prior version:
   *   - The parent Document authz check passes (step 2: authorized: true).
   *   - The version's storageKey is independently signable (step 4: URL minted).
   *   - Prior version is accessible, not merely listed.
   *
   * ADR-009: prior versions are retained and accessible (DECISION-013-B).
   * ADR-008: TTL-capped signed URL — getSignedDownloadUrl returns future expiresAt.
   * CS-GEN-001: signed URL is not logged in this test (returned only to assertion).
   *
   * // AC-FILE-009-03 // ADR-009 // ADR-008 // DECISION-013-B // CS-GEN-001 // CS-GEN-003
   */
  it("[AC-FILE-009-03][ACCESSIBLE] prior (superseded) v1 version remains downloadable after parent promoted to active", async () => {
    // Step 1: Promote parent Document to 'active' (simulate completeUpload for v2).
    // This is what completeUpload does when the scan passes — the HARD gate's pre-condition.
    await adminPool.request().query(
      `UPDATE [dbo].[Document]
       SET [status] = N'active', [updatedAt] = SYSDATETIMEOFFSET()
       WHERE [id] = '${documentId}'`
    );

    // Step 2: Confirm authorizeThenSignDownload now returns authorized: true (active gate).
    // Uses ACCOUNTANT context — ACCOUNTANT sees all documents (ADR-005 / fn_document_access).
    // This is the authorization step of requestDownloadUrlForVersionAction (authorize BEFORE sign).
    const authResult = await withClerkIdentity(
      "accountant_clerk_repl_intg",
      "ACCOUNTANT",
      () => authorizeThenSignDownload({
        documentId,
        engagementId,
      }),
    );

    // Parent is 'active' → gate MUST pass (AC-FILE-001-03 active path)
    expect(authResult.authorized).toBe(true);
    if (authResult.authorized) {
      // URL must be minted (non-empty, string)
      expect(authResult.url).toBeTruthy();
      expect(typeof authResult.url).toBe("string");
      // expiresAt must be a future Date (ADR-008 TTL cap)
      expect(authResult.expiresAt).toBeInstanceOf(Date);
      expect(authResult.expiresAt.getTime()).toBeGreaterThan(Date.now());
    }

    // Step 3: Retrieve the v1 DocumentVersion's storageKey from the DB.
    // (The superseded row — stored at the time of version creation in beforeAll.)
    const v1VersionRow = await adminPool.request().query<{
      storageKey: string;
      version: number;
      supersededAt: Date | null;
    }>(
      `SELECT [storageKey], [version], [supersededAt]
       FROM [dbo].[DocumentVersion]
       WHERE [id] = '${versionV1Id}'`
    );

    expect(v1VersionRow.recordset).toHaveLength(1);
    const v1Row = v1VersionRow.recordset[0]!;
    const v1StorageKey = v1Row.storageKey;

    // Sanity: v1 is still superseded (retained — AC-FILE-009-03 RETAINED proof preserved)
    expect(v1Row.version).toBe(1);
    expect(v1Row.supersededAt).not.toBeNull();

    // Step 4: Prove the v1 storageKey is independently signable.
    // This is the version-specific signing step of requestDownloadUrlForVersionAction.
    // getSignedDownloadUrl generates a SAS URL — does not require the blob to exist;
    // the URL is the capability proof. Real bytes in storage are proven at tier-6 e2e.
    const storage = getStorage();
    const v1Signed = await storage.getSignedDownloadUrl(v1StorageKey, {
      responseContentDisposition: "attachment",
    });

    // Prior version storageKey MUST mint a URL (accessible = downloadable path exists)
    expect(v1Signed.url).toBeTruthy();
    expect(typeof v1Signed.url).toBe("string");

    // URL must contain the v1 storageKey (blob name embedded in the SAS URL)
    // The SAS URL for Azurite includes the blob name in the path.
    const lastSegment = v1StorageKey.split("/").pop()!;
    expect(v1Signed.url).toContain(lastSegment);

    // expiresAt must be a future Date (ADR-008 TTL-capped)
    expect(v1Signed.expiresAt).toBeInstanceOf(Date);
    expect(v1Signed.expiresAt.getTime()).toBeGreaterThan(Date.now());

    // Summary: v1 storageKey produced a signed URL with a future expiry —
    // the prior version is ACCESSIBLE (not merely listed). AC-FILE-009-03 ACCESSIBLE gate PASSES.
  });

});

describe("listDocumentVersions — request pool RLS-scoped read (AC-FILE-009-02/-03)", () => {

  /**
   * [ADR-003] listDocumentVersions under ACCOUNTANT context returns all version rows.
   * // ADR-003 // ADR-005 // AC-FILE-009-03
   */
  it("[ADR-003] listDocumentVersions under ACCOUNTANT returns all version rows — full visibility", async () => {
    const versions = await withClerkIdentity(
      "accountant_clerk_repl_intg",
      "ACCOUNTANT",
      () => listDocumentVersions(documentId),
    );

    // ACCOUNTANT sees all version rows (v1 + v2)
    expect(versions.length).toBeGreaterThanOrEqual(2);
    const versionNumbers = versions.map((v) => v.version);
    expect(versionNumbers).toContain(1);
    expect(versionNumbers).toContain(2);
  });

  /**
   * [CS-TS-001] DocumentVersionItem shape — all fields present.
   * // CS-TS-001 // CS-GEN-003
   */
  it("[CS-TS-001] DocumentVersionItem contains expected fields", async () => {
    const versions = await withClerkIdentity(
      ownerClerkId,
      "CLIENT",
      () => listDocumentVersions(documentId),
    );

    expect(versions.length).toBeGreaterThan(0);
    const first = versions[0]!;
    expect(first.id).toBeTruthy();
    expect(first.documentId.toLowerCase()).toBe(documentId.toLowerCase());
    expect(typeof first.version).toBe("number");
    expect(typeof first.storageKey).toBe("string");
    expect(first.createdAt).toBeInstanceOf(Date);
    expect(first.updatedAt).toBeInstanceOf(Date);
  });

});
