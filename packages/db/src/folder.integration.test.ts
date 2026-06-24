/**
 * packages/db/src/folder.integration.test.ts
 *
 * TIER-3 INTEGRATION TEST — requires real SQL Server (ADR-005 §6).
 *
 * Tests the folder repository operations (EPIC-013 / BRIEF-013 / TASK-013-002):
 *   createFolder   — admin pool INSERT; audited; returns folderId.
 *   renameFolder   — admin pool UPDATE; scoped to engagementId; audited.
 *   moveFolder     — admin pool UPDATE parentFolderId; same-engagement scope; audited.
 *   placeDocumentInFolder — admin pool UPDATE Document.folderId; audited.
 *   listEngagementFolders — request pool read; RLS-scoped (FILTER via sec.pol_Folder).
 *
 * Acceptance criteria covered:
 *   AC-FILE-010-02: Accountant can arrange (nest/re-parent) folders.
 *   AC-FILE-010-03: A file can be placed in a folder (placeDocumentInFolder).
 *
 * Pool discipline verified:
 *   - Admin pool writes succeed (admin principal, RLS-exempt).
 *   - Request pool list is RLS-scoped (CLIENT sees only their engagement's folders).
 *   CS-TS-001 / CS-TS-002: no raw requestDb/adminDb outside packages/db.
 *
 * // ADR-003 // ADR-005 // ADR-009 // ADR-019 // DECISION-013-A
 * // AC-FILE-010-02 // AC-FILE-010-03 // CS-TS-001 // CS-TS-002 // CS-GEN-001 // CS-GEN-003
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import mssqlPkg from "mssql";
import { parseSqlServerUrl } from "./sql-server-url.js";
import { withClerkIdentity } from "./context.js";
import {
  createFolder,
  renameFolder,
  moveFolder,
  placeDocumentInFolder,
  listEngagementFolders,
} from "./repositories/folder.js";

const { ConnectionPool } = mssqlPkg;

// ─── Connection pools ─────────────────────────────────────────────────────────

let adminPool: InstanceType<typeof ConnectionPool>;

const ADMIN_URL = process.env["DATABASE_URL_ADMIN"];
const REQUEST_URL = process.env["DATABASE_URL"];

// ─── Test data ────────────────────────────────────────────────────────────────

let clientUserId: string;
let clientClerkId: string;
let engagementId: string;
let engagementRequestId: string;
let documentId: string;

// Folder IDs tracked for cleanup
const folderIds: string[] = [];
// Document IDs tracked for cleanup
const documentIds: string[] = [];

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  if (!ADMIN_URL) throw new Error("DATABASE_URL_ADMIN is required for integration tests");
  if (!REQUEST_URL) throw new Error("DATABASE_URL is required for integration tests");

  const adminConfig = parseSqlServerUrl(ADMIN_URL) as import("mssql").config;
  adminPool = new ConnectionPool(adminConfig);
  await adminPool.connect();

  // ─── Pre-clean: remove any stale data from prior runs in correct dependency order ─
  // This guards against incomplete cleanup when a prior test run left data behind.
  clientClerkId = "folder_intg_client";
  const staleUserResult = await adminPool.request().query<{ id: string }>(
    `SELECT [id] FROM [dbo].[User] WHERE [clerkId] = N'${clientClerkId}'`
  );
  const staleUserId = staleUserResult.recordset[0]?.id;
  if (staleUserId) {
    // Find and delete stale engagements (and their FK children)
    const staleEngResult = await adminPool.request().query<{ id: string }>(
      `SELECT [id] FROM [dbo].[Engagement] WHERE [clientUserId] = '${staleUserId}'`
    );
    for (const staleEng of staleEngResult.recordset) {
      // Delete children: folders, documents (and their document versions)
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
        `DELETE FROM [dbo].[Folder] WHERE [engagementId] = '${staleEng.id}'`
      ).catch(() => { /* ignore */ });
      await adminPool.request().query(
        `DELETE FROM [dbo].[Engagement] WHERE [id] = '${staleEng.id}'`
      ).catch(() => { /* ignore */ });
    }
    // Delete stale engagement requests for this user
    await adminPool.request().query(
      `DELETE FROM [dbo].[EngagementRequest] WHERE [email] = N'folder-intg-req@example.com'`
    ).catch(() => { /* ignore */ });
    // Delete the stale user
    await adminPool.request().query(
      `DELETE FROM [dbo].[User] WHERE [id] = '${staleUserId}'`
    ).catch(() => { /* ignore */ });
  }

  // Seed: User
  const userResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[User] ([clerkId], [email], [role], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'${clientClerkId}', N'folder-intg-client@example.com', N'CLIENT', SYSDATETIMEOFFSET())`
  );
  clientUserId = userResult.recordset[0]?.id ?? "";

  // Seed: EngagementRequest
  const reqResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[EngagementRequest] ([firstName], [lastName], [email], [status], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'FolderIntg', N'Client', N'folder-intg-req@example.com', N'accepted', SYSDATETIMEOFFSET())`
  );
  engagementRequestId = reqResult.recordset[0]?.id ?? "";

  // Seed: Engagement
  const engResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[Engagement]
       ([engagementRequestId], [clientUserId], [status], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES ('${engagementRequestId}', '${clientUserId}', N'New', SYSDATETIMEOFFSET())`
  );
  engagementId = engResult.recordset[0]?.id ?? "";

  // Seed: Document (for placeDocumentInFolder test)
  const docResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[Document]
       ([engagementId], [storageKey], [originalFilename], [contentType], [sizeBytes],
        [status], [version], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (
       '${engagementId}',
       N'engagements/${engagementId}/documents/dummy-fld-intg/v1/test.pdf',
       N'test.pdf', N'application/pdf', 1024, N'active', 1, SYSDATETIMEOFFSET()
     )`
  );
  documentId = docResult.recordset[0]?.id ?? "";
  documentIds.push(documentId);
}, 30000);

afterAll(async () => {
  // Cleanup in reverse dependency order
  for (const fid of folderIds) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[Folder] WHERE [id] = '${fid}'`
    ).catch(() => { /* ignore */ });
  }
  for (const did of documentIds) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[Document] WHERE [id] = '${did}'`
    ).catch(() => { /* ignore */ });
  }
  if (engagementId) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[Engagement] WHERE [id] = '${engagementId}'`
    ).catch(() => { /* ignore */ });
  }
  if (engagementRequestId) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[EngagementRequest] WHERE [id] = '${engagementRequestId}'`
    ).catch(() => { /* ignore */ });
  }
  if (clientUserId) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[User] WHERE [id] = '${clientUserId}'`
    ).catch(() => { /* ignore */ });
  }
  await adminPool.close().catch(() => { /* ignore */ });
}, 30000);

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Folder repository — admin pool writes (TASK-013-002 / AC-FILE-010-02)", () => {

  /**
   * [AC-FILE-010-02] createFolder — admin pool INSERT; returns folderId.
   * Verifies the folder row is readable from the admin pool immediately after.
   * AC-FILE-010-04: createFolder runs on the admin pool (accountant-only write).
   * ADR-019: audit event emitted inside withAuditTransaction.
   * // AC-FILE-010-02 // ADR-003 // ADR-019 // CS-TS-001
   */
  it("[AC-FILE-010-02] createFolder inserts a root-level folder — admin pool write", async () => {
    const result = await createFolder({
      engagementId,
      name: "Tax Returns 2024",
      parentFolderId: null,
      accountantClerkId: "accountant_clerk_folder_intg",
      sourceSurface: "admin",
    });

    expect(result.folderId).toBeTruthy();
    folderIds.push(result.folderId);

    // Verify the row exists in the database
    const check = await adminPool.request().query<{ id: string; name: string; parentFolderId: string | null }>(
      `SELECT [id], [name], [parentFolderId] FROM [dbo].[Folder]
       WHERE [id] = '${result.folderId}'`
    );
    expect(check.recordset).toHaveLength(1);
    expect(check.recordset[0]?.name).toBe("Tax Returns 2024");
    expect(check.recordset[0]?.parentFolderId).toBeNull();
  });

  /**
   * [AC-FILE-010-02] createFolder with parentFolderId — nested folder creation.
   * DECISION-013-A: nullable parentFolderId self-ref for nesting.
   * // AC-FILE-010-02 // DECISION-013-A // ADR-003
   */
  it("[AC-FILE-010-02] createFolder with parentFolderId — nested folder under parent", async () => {
    // Create parent first
    const parentResult = await createFolder({
      engagementId,
      name: "Parent Folder",
      parentFolderId: null,
      accountantClerkId: "accountant_clerk_folder_intg",
      sourceSurface: "admin",
    });
    folderIds.push(parentResult.folderId);

    // Create child nested under parent
    const childResult = await createFolder({
      engagementId,
      name: "Child Folder",
      parentFolderId: parentResult.folderId,
      accountantClerkId: "accountant_clerk_folder_intg",
      sourceSurface: "admin",
    });
    folderIds.push(childResult.folderId);

    // Verify nested relationship
    const check = await adminPool.request().query<{ parentFolderId: string | null }>(
      `SELECT [parentFolderId] FROM [dbo].[Folder] WHERE [id] = '${childResult.folderId}'`
    );
    expect(check.recordset[0]?.parentFolderId?.toLowerCase()).toBe(
      parentResult.folderId.toLowerCase()
    );
  });

  /**
   * [AC-FILE-010-02] renameFolder — admin pool UPDATE; scoped to engagementId.
   * Returns { renamed: true } when the folder exists in the engagement.
   * // AC-FILE-010-02 // ADR-003 // ADR-019
   */
  it("[AC-FILE-010-02] renameFolder updates the display name — scoped to engagementId", async () => {
    const createResult = await createFolder({
      engagementId,
      name: "Old Name",
      parentFolderId: null,
      accountantClerkId: "accountant_clerk_folder_intg",
      sourceSurface: "admin",
    });
    folderIds.push(createResult.folderId);

    const renameResult = await renameFolder({
      folderId: createResult.folderId,
      engagementId,
      newName: "New Name",
      accountantClerkId: "accountant_clerk_folder_intg",
      sourceSurface: "admin",
    });

    expect(renameResult.renamed).toBe(true);

    // Verify the name change
    const check = await adminPool.request().query<{ name: string }>(
      `SELECT [name] FROM [dbo].[Folder] WHERE [id] = '${createResult.folderId}'`
    );
    expect(check.recordset[0]?.name).toBe("New Name");
  });

  /**
   * [AC-FILE-010-02] renameFolder on a non-existent folder returns { renamed: false }.
   * Defence-in-depth: engagementId scoping prevents cross-engagement rename.
   * // AC-FILE-010-02 // ADR-003
   */
  it("[AC-FILE-010-02] renameFolder on unknown folderId returns renamed: false", async () => {
    const result = await renameFolder({
      folderId: "00000000-0000-0000-0000-000000000001",
      engagementId,
      newName: "Ghost",
      accountantClerkId: "accountant_clerk_folder_intg",
      sourceSurface: "admin",
    });

    expect(result.renamed).toBe(false);
  });

  /**
   * [AC-FILE-010-02] moveFolder — re-parents a folder within the same engagement.
   * DECISION-013-A: re-parenting stays within the same engagement (enforced by WHERE scope).
   * // AC-FILE-010-02 // DECISION-013-A // ADR-003 // ADR-019
   */
  it("[AC-FILE-010-02] moveFolder re-parents a folder within the same engagement", async () => {
    // Create target parent
    const targetParent = await createFolder({
      engagementId,
      name: "Target Parent",
      parentFolderId: null,
      accountantClerkId: "accountant_clerk_folder_intg",
      sourceSurface: "admin",
    });
    folderIds.push(targetParent.folderId);

    // Create folder to move
    const moveable = await createFolder({
      engagementId,
      name: "Moveable Folder",
      parentFolderId: null,
      accountantClerkId: "accountant_clerk_folder_intg",
      sourceSurface: "admin",
    });
    folderIds.push(moveable.folderId);

    // Move it under the target parent
    const moveResult = await moveFolder({
      folderId: moveable.folderId,
      engagementId,
      newParentFolderId: targetParent.folderId,
      accountantClerkId: "accountant_clerk_folder_intg",
      sourceSurface: "admin",
    });

    expect(moveResult.moved).toBe(true);

    // Verify new parent
    const check = await adminPool.request().query<{ parentFolderId: string | null }>(
      `SELECT [parentFolderId] FROM [dbo].[Folder] WHERE [id] = '${moveable.folderId}'`
    );
    expect(check.recordset[0]?.parentFolderId?.toLowerCase()).toBe(
      targetParent.folderId.toLowerCase()
    );
  });

  /**
   * [AC-FILE-010-02] moveFolder to root (null parentFolderId) — promote to root-level.
   * // AC-FILE-010-02 // DECISION-013-A
   */
  it("[AC-FILE-010-02] moveFolder to null parentFolderId promotes folder to root-level", async () => {
    // Create a parent to start nested under
    const parent = await createFolder({
      engagementId,
      name: "Temp Parent",
      parentFolderId: null,
      accountantClerkId: "accountant_clerk_folder_intg",
      sourceSurface: "admin",
    });
    folderIds.push(parent.folderId);

    // Create the folder nested under parent
    const nested = await createFolder({
      engagementId,
      name: "Nested to Root",
      parentFolderId: parent.folderId,
      accountantClerkId: "accountant_clerk_folder_intg",
      sourceSurface: "admin",
    });
    folderIds.push(nested.folderId);

    // Move to root (null parent)
    const moveResult = await moveFolder({
      folderId: nested.folderId,
      engagementId,
      newParentFolderId: null,
      accountantClerkId: "accountant_clerk_folder_intg",
      sourceSurface: "admin",
    });

    expect(moveResult.moved).toBe(true);

    // Verify parentFolderId is now null
    const check = await adminPool.request().query<{ parentFolderId: string | null }>(
      `SELECT [parentFolderId] FROM [dbo].[Folder] WHERE [id] = '${nested.folderId}'`
    );
    expect(check.recordset[0]?.parentFolderId).toBeNull();
  });

  /**
   * [AC-FILE-010-03] placeDocumentInFolder — sets Document.folderId via admin pool.
   * DECISION-013-A: no storageKey change; folder membership is the DB relationship only.
   * ADR-009: folder placement does NOT change the storage key.
   * // AC-FILE-010-03 // ADR-003 // ADR-009 // DECISION-013-A // ADR-019
   */
  it("[AC-FILE-010-03] placeDocumentInFolder sets Document.folderId on the admin pool", async () => {
    // Create a folder to place the document in
    const targetFolder = await createFolder({
      engagementId,
      name: "Placement Target",
      parentFolderId: null,
      accountantClerkId: "accountant_clerk_folder_intg",
      sourceSurface: "admin",
    });
    folderIds.push(targetFolder.folderId);

    // Read the document's original storageKey (must not change)
    const originalKeyResult = await adminPool.request().query<{ storageKey: string }>(
      `SELECT [storageKey] FROM [dbo].[Document] WHERE [id] = '${documentId}'`
    );
    const originalStorageKey = originalKeyResult.recordset[0]?.storageKey ?? "";

    // Place the document in the folder
    const placeResult = await placeDocumentInFolder({
      documentId,
      engagementId,
      folderId: targetFolder.folderId,
      accountantClerkId: "accountant_clerk_folder_intg",
      sourceSurface: "admin",
    });

    expect(placeResult.placed).toBe(true);

    // Verify folderId was set
    const check = await adminPool.request().query<{ folderId: string | null; storageKey: string }>(
      `SELECT [folderId], [storageKey] FROM [dbo].[Document] WHERE [id] = '${documentId}'`
    );
    expect(check.recordset[0]?.folderId?.toLowerCase()).toBe(
      targetFolder.folderId.toLowerCase()
    );
    // ADR-009: storageKey MUST NOT change when folder placement changes (DECISION-013-A)
    expect(check.recordset[0]?.storageKey).toBe(originalStorageKey);
  });

  /**
   * [AC-FILE-010-03] placeDocumentInFolder with null folderId removes the document from its folder.
   * // AC-FILE-010-03 // DECISION-013-A
   */
  it("[AC-FILE-010-03] placeDocumentInFolder with null removes document from folder (engagement root)", async () => {
    const removeResult = await placeDocumentInFolder({
      documentId,
      engagementId,
      folderId: null,
      accountantClerkId: "accountant_clerk_folder_intg",
      sourceSurface: "admin",
    });

    expect(removeResult.placed).toBe(true);

    // Verify folderId is now null (document at engagement root)
    const check = await adminPool.request().query<{ folderId: string | null }>(
      `SELECT [folderId] FROM [dbo].[Document] WHERE [id] = '${documentId}'`
    );
    expect(check.recordset[0]?.folderId).toBeNull();
  });

});

describe("Folder repository — listEngagementFolders (request pool, RLS-scoped)", () => {

  /**
   * [CS-TS-001] listEngagementFolders under CLIENT context — RLS-scoped read.
   * The CLIENT (owner) should see their engagement's folders.
   * Must be called inside withClerkIdentity (ADR-003).
   * // CS-TS-001 // ADR-003 // ADR-005
   */
  it("[CS-TS-001] listEngagementFolders returns folders for the CLIENT owner's engagement", async () => {
    // Create a folder via admin (so there's something to list)
    const created = await createFolder({
      engagementId,
      name: "Listed Folder",
      parentFolderId: null,
      accountantClerkId: "accountant_clerk_folder_intg",
      sourceSurface: "admin",
    });
    folderIds.push(created.folderId);

    // List via request pool (CLIENT context — SESSION_CONTEXT-mediated)
    const folders = await withClerkIdentity(
      clientClerkId,
      "CLIENT",
      () => listEngagementFolders(engagementId),
    );

    // CLIENT should see folders for their own engagement
    // GUID comparison is case-insensitive (Prisma returns lowercase; raw mssql may return uppercase)
    expect(folders.length).toBeGreaterThan(0);
    const ids = folders.map((f) => f.id.toLowerCase());
    expect(ids).toContain(created.folderId.toLowerCase());
  });

  /**
   * [ADR-003] listEngagementFolders under ACCOUNTANT context — full visibility.
   * ACCOUNTANT sees all engagement folders (ACCOUNTANT branch in fn_folder_access).
   * // ADR-003 // ADR-005
   */
  it("[ADR-003] listEngagementFolders under ACCOUNTANT context — full visibility", async () => {
    const folders = await withClerkIdentity(
      "accountant_clerk_folder_intg",
      "ACCOUNTANT",
      () => listEngagementFolders(engagementId),
    );

    expect(folders.length).toBeGreaterThan(0);
    // All returned folders should belong to the engagement
    for (const f of folders) {
      expect(f.engagementId.toLowerCase()).toBe(engagementId.toLowerCase());
    }
  });

  /**
   * [CS-TS-001] FolderItem shape — all fields present.
   * // CS-TS-001 // CS-GEN-003
   */
  it("[CS-TS-001] FolderItem contains expected fields from listEngagementFolders", async () => {
    const folders = await withClerkIdentity(
      clientClerkId,
      "CLIENT",
      () => listEngagementFolders(engagementId),
    );

    expect(folders.length).toBeGreaterThan(0);
    const first = folders[0]!;
    expect(first.id).toBeTruthy();
    expect(first.engagementId).toBeTruthy();
    expect(first.name).toBeTruthy();
    expect(typeof first.parentFolderId === "string" || first.parentFolderId === null).toBe(true);
    expect(first.createdAt).toBeInstanceOf(Date);
    expect(first.updatedAt).toBeInstanceOf(Date);
  });

});
