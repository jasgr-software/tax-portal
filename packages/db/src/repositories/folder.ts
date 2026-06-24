/**
 * packages/db/src/repositories/folder.ts
 *
 * Folder repository — create/rename/move/place (admin pool) and list (request pool).
 *
 * AC-FILE-010-02: Accountant can arrange (nest/re-parent) folders.
 * AC-FILE-010-03: A file can be placed in a folder.
 * AC-FILE-010-04: Folder management (create/rename/arrange) is accountant-only.
 *   Write operations run on the ADMIN POOL (admin principal, RLS-exempt).
 *   The BLOCK PREDICATE on sec.pol_Folder (fn_folder_write_access — NO CLIENT branch)
 *   provides defence-in-depth: a CLIENT through the request pool hits error 33504.
 *
 * Pool strategy (ADR-003 / CS-TS-001 / CS-TS-002):
 *   - createFolder / renameFolder / moveFolder / placeDocumentInFolder: ADMIN POOL.
 *     Write operations run after the caller has verified accountant identity at the
 *     action layer. The admin pool bypasses the BLOCK predicate (IS_MEMBER('app_admin_role')=1).
 *   - listEngagementFolders: REQUEST POOL (db / SESSION_CONTEXT).
 *     FILTER predicate sec.pol_Folder enforces client isolation per-row.
 *     Must be called inside withRequestContext() or withClerkIdentity() (ADR-003).
 *
 * ADR-019: Folder mutations emit audit events via withAuditTransaction / recordAuthEvent.
 *   Actor identity comes from the verified session (never client-supplied).
 *   Action values: 'folder.created' | 'folder.renamed' | 'folder.moved' | 'document.placed_in_folder'
 *
 * ADR-009 note: no folder segment in storage keys — folder membership is the DB
 *   Document.folderId relationship. Re-parenting a folder does NOT change any storageKey.
 *   DECISION-013-A: nullable parentFolderId self-ref for nesting; re-parent stays same engagement.
 *
 * CS-GEN-001: no PII (filenames, usernames) in audit rows or log statements.
 * CS-GEN-003: governing keys cited in comments and tagged below.
 *
 * NOTE:
 *   - createFolder / renameFolder / moveFolder / placeDocumentInFolder are NOT exported
 *     from the package barrel. Import directly from this module in server actions / tests.
 *   - listEngagementFolders IS exported on the barrel (request-pool read).
 *
 * // ADR-003 // ADR-005 // ADR-009 // ADR-019 // DECISION-013-A
 * // CS-TS-001 // CS-TS-002 // CS-GEN-001 // CS-GEN-003
 */

import mssqlPkg from "mssql";
import { getAdminPool } from "../admin-connection.js";
import { db } from "../client.js";
import { withAuditTransaction, recordAuthEvent } from "../audit.js";
import type { AuditActor } from "../audit.js";

const { Request: MssqlRequest } = mssqlPkg;

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * A single Folder as returned to callers.
 *
 * AC-FILE-010-01: Files organize into folders (Folder table).
 * AC-FILE-010-02: parentFolderId supports nesting/re-parenting.
 */
export interface FolderItem {
  id: string;
  engagementId: string;
  name: string;
  /** Null = root-level folder; non-null = nested under parent (DECISION-013-A). */
  parentFolderId: string | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Input for createFolder. */
export interface CreateFolderInput {
  /** FK → Engagement (admin-verified). */
  engagementId: string;
  /** Display name of the folder. */
  name: string;
  /** Optional parent folder (null = root-level). Must be in the same engagement (DECISION-013-A). */
  parentFolderId?: string | null;
  /** Accountant clerkId from verified session (audit trail — never client-supplied). CS-GEN-001. */
  accountantClerkId: string;
  /** Source surface for audit (CS-GEN-003). */
  sourceSurface: "admin";
}

/** Result of createFolder. */
export interface CreateFolderResult {
  folderId: string;
}

/** Input for renameFolder. */
export interface RenameFolderInput {
  /** The Folder id to rename. */
  folderId: string;
  /** The engagement the folder belongs to (defence-in-depth scope). */
  engagementId: string;
  /** New display name. */
  newName: string;
  /** Accountant clerkId from verified session (audit trail). CS-GEN-001. */
  accountantClerkId: string;
  /** Source surface for audit (CS-GEN-003). */
  sourceSurface: "admin";
}

/** Input for moveFolder (re-parent within the same engagement). */
export interface MoveFolderInput {
  /** The Folder id to move. */
  folderId: string;
  /** The engagement the folder belongs to (defence-in-depth scope). Must not change. DECISION-013-A. */
  engagementId: string;
  /** The new parent folder id (null = promote to root). Must be in the same engagement. */
  newParentFolderId: string | null;
  /** Accountant clerkId from verified session (audit trail). CS-GEN-001. */
  accountantClerkId: string;
  /** Source surface for audit (CS-GEN-003). */
  sourceSurface: "admin";
}

/** Input for placeDocumentInFolder. */
export interface PlaceDocumentInFolderInput {
  /** The Document id to place. */
  documentId: string;
  /** The engagement the document belongs to (defence-in-depth scope). */
  engagementId: string;
  /** The target Folder id (null = remove from folder / move to engagement root). */
  folderId: string | null;
  /** Accountant clerkId from verified session (audit trail). CS-GEN-001. */
  accountantClerkId: string;
  /** Source surface for audit (CS-GEN-003). */
  sourceSurface: "admin";
}

// ─── Internal row type ────────────────────────────────────────────────────────

type FolderRow = {
  id: string;
  engagementId: string;
  name: string;
  parentFolderId: string | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
};

// ─── Write: createFolder (admin pool) ────────────────────────────────────────

/**
 * Creates a Folder for the given engagement via the ADMIN POOL.
 *
 * AC-FILE-010-02: Accountant can create folders (DECISION-013-A nullable parentFolderId).
 * AC-FILE-010-04: Folder creation is accountant-only — admin pool bypasses BLOCK;
 *   a CLIENT through the request pool would hit error 33504 (fn_folder_write_access).
 *
 * Emits audit event: 'folder.created' (ADR-019).
 *
 * ADR-003: admin pool for the insert — caller MUST verify accountant identity first.
 * CS-GEN-001: audit row contains folderId + engagementId only — no display name or PII.
 *
 * // ADR-003 // ADR-005 // ADR-019 // CS-TS-001 // CS-GEN-001 // CS-GEN-003
 */
export async function createFolder(
  input: CreateFolderInput,
): Promise<CreateFolderResult> {
  const actor: AuditActor = { clerkUserId: input.accountantClerkId, role: "ACCOUNTANT" };

  const folderId = await withAuditTransaction(async (txn) => {
    const pool = await getAdminPool();
    const req = new MssqlRequest(pool);
    req.input("engagementId", mssqlPkg.NVarChar(50), input.engagementId);
    req.input("name", mssqlPkg.NVarChar(255), input.name);
    req.input("parentFolderId", mssqlPkg.NVarChar(50), input.parentFolderId ?? null);
    req.input("createdBy", mssqlPkg.NVarChar(64), input.accountantClerkId);

    const result = await req.query<{ id: string }>(
      `INSERT INTO [dbo].[Folder]
         ([engagementId], [name], [parentFolderId], [createdBy], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES (@engagementId, @name, @parentFolderId, @createdBy, SYSDATETIMEOFFSET())`
    );

    const row = result.recordset[0];
    if (!row) {
      throw new Error("createFolder INSERT did not return a row");
    }

    const newFolderId = row.id;

    // ADR-019: emit audit event in the same transaction (fail-closed).
    // CS-GEN-001: targetId = folderId only — no display name/PII logged.
    await recordAuthEvent({
      actor,
      action: "folder.created",
      targetType: "Folder",
      targetId: newFolderId,
      sourceSurface: input.sourceSurface,
      transaction: txn,
    });

    return newFolderId;
  });

  return { folderId };
}

// ─── Write: renameFolder (admin pool) ────────────────────────────────────────

/**
 * Renames a Folder via the ADMIN POOL.
 *
 * AC-FILE-010-02: Accountant can rename folders.
 * AC-FILE-010-04: Folder rename is accountant-only.
 *
 * Scoped UPDATE: WHERE id = @folderId AND engagementId = @engagementId (defence-in-depth).
 * Returns false when the folder does not exist or does not belong to the engagement.
 *
 * Emits audit event: 'folder.renamed' (ADR-019).
 *
 * // ADR-003 // ADR-019 // CS-TS-001 // CS-GEN-001 // CS-GEN-003
 */
export async function renameFolder(
  input: RenameFolderInput,
): Promise<{ renamed: boolean }> {
  const actor: AuditActor = { clerkUserId: input.accountantClerkId, role: "ACCOUNTANT" };

  let rowsAffected = 0;

  await withAuditTransaction(async (txn) => {
    const pool = await getAdminPool();
    const req = new MssqlRequest(pool);
    req.input("folderId", mssqlPkg.NVarChar(50), input.folderId);
    req.input("engagementId", mssqlPkg.NVarChar(50), input.engagementId);
    req.input("newName", mssqlPkg.NVarChar(255), input.newName);

    const result = await req.query(
      `UPDATE [dbo].[Folder]
       SET [name] = @newName,
           [updatedAt] = SYSDATETIMEOFFSET()
       WHERE [id] = @folderId
         AND [engagementId] = @engagementId`
    );

    rowsAffected = result.rowsAffected[0] ?? 0;

    if (rowsAffected > 0) {
      // ADR-019: emit audit only when a row was actually updated.
      // CS-GEN-001: targetId = folderId only — no new name or PII logged.
      await recordAuthEvent({
        actor,
        action: "folder.renamed",
        targetType: "Folder",
        targetId: input.folderId,
        sourceSurface: input.sourceSurface,
        transaction: txn,
      });
    }
  });

  return { renamed: rowsAffected > 0 };
}

// ─── Write: moveFolder (re-parent within same engagement — DECISION-013-A) ───

/**
 * Re-parents a Folder within the same engagement via the ADMIN POOL.
 *
 * AC-FILE-010-02: Accountant can arrange (nest/re-parent) folders.
 * AC-FILE-010-04: Folder arrangement is accountant-only.
 * DECISION-013-A: Re-parenting stays within the same engagement — enforced here by
 *   scoping the UPDATE to engagementId = @engagementId.
 *
 * Sets parentFolderId to the new value (null = promote to root).
 * Returns false when the folder does not exist or belongs to a different engagement.
 *
 * Emits audit event: 'folder.moved' (ADR-019).
 *
 * // ADR-003 // ADR-019 // DECISION-013-A // CS-TS-001 // CS-GEN-001 // CS-GEN-003
 */
export async function moveFolder(
  input: MoveFolderInput,
): Promise<{ moved: boolean }> {
  const actor: AuditActor = { clerkUserId: input.accountantClerkId, role: "ACCOUNTANT" };

  let rowsAffected = 0;

  await withAuditTransaction(async (txn) => {
    const pool = await getAdminPool();
    const req = new MssqlRequest(pool);
    req.input("folderId", mssqlPkg.NVarChar(50), input.folderId);
    req.input("engagementId", mssqlPkg.NVarChar(50), input.engagementId);
    req.input("newParentFolderId", mssqlPkg.NVarChar(50), input.newParentFolderId);

    const result = await req.query(
      `UPDATE [dbo].[Folder]
       SET [parentFolderId] = @newParentFolderId,
           [updatedAt] = SYSDATETIMEOFFSET()
       WHERE [id] = @folderId
         AND [engagementId] = @engagementId`
    );

    rowsAffected = result.rowsAffected[0] ?? 0;

    if (rowsAffected > 0) {
      // ADR-019: emit audit only when a row was actually updated.
      // CS-GEN-001: targetId = folderId only — no parent name or PII logged.
      await recordAuthEvent({
        actor,
        action: "folder.moved",
        targetType: "Folder",
        targetId: input.folderId,
        sourceSurface: input.sourceSurface,
        transaction: txn,
      });
    }
  });

  return { moved: rowsAffected > 0 };
}

// ─── Write: placeDocumentInFolder (admin pool) ────────────────────────────────

/**
 * Places a Document in a folder (or removes it from any folder when folderId is null).
 *
 * AC-FILE-010-03: A file can be placed in a folder.
 * DECISION-013-A: No folder segment in storage keys — the Document.folderId DB relationship
 *   is the only placement record. This operation does NOT change any storageKey (ADR-009).
 *
 * Scoped UPDATE: WHERE id = @documentId AND engagementId = @engagementId (defence-in-depth).
 * Returns false when the document does not exist or belongs to a different engagement.
 *
 * Emits audit event: 'document.placed_in_folder' (ADR-019).
 *
 * // ADR-003 // ADR-009 // ADR-019 // DECISION-013-A // CS-TS-001 // CS-GEN-001 // CS-GEN-003
 */
export async function placeDocumentInFolder(
  input: PlaceDocumentInFolderInput,
): Promise<{ placed: boolean }> {
  const actor: AuditActor = { clerkUserId: input.accountantClerkId, role: "ACCOUNTANT" };

  let rowsAffected = 0;

  await withAuditTransaction(async (txn) => {
    const pool = await getAdminPool();
    const req = new MssqlRequest(pool);
    req.input("documentId", mssqlPkg.NVarChar(50), input.documentId);
    req.input("engagementId", mssqlPkg.NVarChar(50), input.engagementId);
    req.input("folderId", mssqlPkg.NVarChar(50), input.folderId);

    const result = await req.query(
      `UPDATE [dbo].[Document]
       SET [folderId] = @folderId,
           [updatedAt] = SYSDATETIMEOFFSET()
       WHERE [id] = @documentId
         AND [engagementId] = @engagementId`
    );

    rowsAffected = result.rowsAffected[0] ?? 0;

    if (rowsAffected > 0) {
      // ADR-019: emit audit only when a row was actually updated.
      // CS-GEN-001: targetId = documentId only — no filename or PII logged.
      await recordAuthEvent({
        actor,
        action: "document.placed_in_folder",
        targetType: "Document",
        targetId: input.documentId,
        sourceSurface: input.sourceSurface,
        transaction: txn,
      });
    }
  });

  return { placed: rowsAffected > 0 };
}

// ─── Read: listEngagementFolders (request pool — FILTER-governed) ─────────────

/**
 * Returns all Folders for the given engagement, visible to the current SESSION_CONTEXT identity.
 *
 * Under sec.pol_Folder (db/policies/0010-folder-policy.sql):
 *   - CLIENT sees only folders for their own engagement (owner + participant branches).
 *   - ACCOUNTANT sees all folders for any engagement.
 *   - Null SESSION_CONTEXT → ZERO rows (fail-closed, ADR-003 §5).
 *
 * MUST be called inside withRequestContext() or withClerkIdentity() (ADR-003).
 *
 * AC-FILE-010-01: Files organize into folders — this is the read path.
 * AC-FILE-010-02: Folder hierarchy is visible via parentFolderId.
 *
 * // ADR-003 // ADR-005 // CS-TS-001 // CS-GEN-003
 */
export async function listEngagementFolders(
  engagementId: string,
): Promise<FolderItem[]> {
  const client = dbAsFolderClient();
  const rows = await client.folder.findMany({
    where: { engagementId },
    orderBy: { createdAt: "asc" },
  });
  return rows.map(mapFolderRow);
}

// ─── Internal: Prisma cast helper ────────────────────────────────────────────

function dbAsFolderClient() {
  return db as unknown as {
    folder: {
      findMany: (args?: {
        where?: { engagementId?: string };
        orderBy?: { createdAt: "asc" | "desc" };
      }) => Promise<FolderRow[]>;
    };
  };
}

// ─── Internal: row mapper ─────────────────────────────────────────────────────

function mapFolderRow(row: FolderRow): FolderItem {
  return {
    id: row.id,
    engagementId: row.engagementId,
    name: row.name,
    parentFolderId: row.parentFolderId,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
