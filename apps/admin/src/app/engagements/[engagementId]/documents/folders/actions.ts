/**
 * apps/admin/src/app/engagements/[engagementId]/documents/folders/actions.ts
 *
 * Server actions for accountant-managed folder structure.
 *
 * TASK-013-004: Admin (Tax Portal) — accountant-managed folder structure.
 *
 * Acceptance criteria:
 *   AC-FILE-010-01 — files organize into a folder structure
 *   AC-FILE-010-02 — accountant can create, rename, and arrange (re-parent) folders
 *   AC-FILE-010-03 — accountant can place a file in a folder
 *   AC-FILE-010-04 — folder management (create/rename/arrange/place) is accountant-only
 *
 * ADR-003: Every action verifies getAccountantIdentity() BEFORE any DB write.
 *   The actor for the ADR-019 audit event comes ONLY from the verified session —
 *   never from action args, form data, or client-supplied role.
 * ADR-006: These actions exist ONLY in apps/admin — no mirror in apps/portal.
 *   Clients never manage folders (AC-FILE-010-04).
 * ADR-019: Folder mutations are audited events; actor = verified session.
 * DECISION-013-A: parentFolderId self-ref for nesting; re-parent stays same engagement.
 *
 * Pool strategy (TASK-013-002 folder primitives):
 *   createFolderAction: admin pool via createFolder()
 *   renameFolderAction: admin pool via renameFolder()
 *   moveFolderAction: admin pool via moveFolder()
 *   placeDocumentAction: admin pool via placeDocumentInFolder()
 *
 * // ADR-003: server-side authority — getAccountantIdentity() before every DB write
 * // ADR-006: admin surface only (apps/admin) — no mirror in apps/portal
 * // ADR-019: audit actor comes from verified session only
 * // DECISION-013-A: parentFolderId self-ref; re-parent stays in same engagement
 * // CS-TS-001: all DB writes use TASK-013-002 admin-pool seam (admin principal)
 * // CS-TS-002: no direct adminDb/pool import — seam calls via folder repository source
 * // CS-TS-004: identity from session cookie, never from args/form data
 * // CS-GEN-001: no PII logged (clerkUserId in audit trail via seam, not in server logs)
 * // CS-GEN-003: cite governing authority in comments
 */

"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getAuthProvider } from "@tax-portal/auth";
// NOT on the barrel — import directly from the folder repository source module (TASK-013-002)
// ADR-019: audit events are emitted inside withAuditTransaction in the folder seams,
//   not directly in the actions (pattern mirrors TASK-013-002 folder.ts).
import {
  createFolder,
  renameFolder,
  moveFolder,
  placeDocumentInFolder,
} from "@tax-portal/db/src/repositories/folder.js";

// ─── Result types ─────────────────────────────────────────────────────────────

export type CreateFolderActionResult =
  | { success: true; data: { folderId: string } }
  | { success: false; error: string };

export type RenameFolderActionResult =
  | { success: true; data: { renamed: boolean } }
  | { success: false; error: string };

export type MoveFolderActionResult =
  | { success: true; data: { moved: boolean } }
  | { success: false; error: string };

export type PlaceDocumentActionResult =
  | { success: true; data: { placed: boolean } }
  | { success: false; error: string };

// ─── Identity helper ──────────────────────────────────────────────────────────

/**
 * Resolve the verified accountant identity from the incoming request headers.
 *
 * ADR-003: identity.role comes from the verified session (Clerk public metadata
 *   or mock session cookie) — NEVER from any server action argument or form data.
 *   The trust fence is this guard; the BLOCK predicate (pol_Folder) is defence-in-depth.
 * ADR-006: Apps/admin only — this helper is not exported or available in apps/portal.
 * CS-TS-004: identity from session cookie only — never from args or form data.
 *
 * // ADR-003 // ADR-006 // CS-TS-004
 */
async function getAccountantIdentity(): Promise<{
  clerkUserId: string;
  role: "ACCOUNTANT" | "CLIENT";
} | null> {
  // CS-TS-004: Read identity from the incoming request headers (verified server-side).
  const headerStore = await headers();
  const cookieHeader = headerStore.get("cookie") ?? "";

  const syntheticRequest = new Request("http://localhost/", {
    headers: { cookie: cookieHeader },
  });

  const provider = getAuthProvider();
  const identity = await provider.getIdentity(syntheticRequest);

  if (!identity || identity.role !== "ACCOUNTANT") {
    return null;
  }

  return { clerkUserId: identity.clerkUserId, role: identity.role };
}

// ─── Server Actions ───────────────────────────────────────────────────────────

/**
 * Create a new folder for the engagement (accountant-only).
 *
 * AC-FILE-010-01: Files organize into folders — this creates the folder container.
 * AC-FILE-010-02: Accountant creates folders (optionally nested via parentFolderId).
 * AC-FILE-010-04: Only ACCOUNTANT role can create folders; CLIENT/null rejected before any write.
 *
 * ADR-003: identity guard before any DB write.
 * ADR-006: admin surface only — no mirror in apps/portal.
 * ADR-019: 'folder.created' audit event (inside createFolder / withAuditTransaction).
 * DECISION-013-A: parentFolderId self-ref for nesting; null = root-level.
 * CS-TS-004: identity from session cookie only — never from args.
 * CS-GEN-001: no folder name or PII logged — folderId only in audit row.
 *
 * @param engagementId - The Engagement.id (from the URL route param — server-resolved).
 * @param name - The display name for the new folder.
 * @param parentFolderId - Optional parent folder id (null = root-level). DECISION-013-A.
 *
 * // ADR-003 // ADR-006 // ADR-019 // DECISION-013-A // CS-TS-001 // CS-TS-002 // CS-TS-004 // CS-GEN-001 // CS-GEN-003
 */
export async function createFolderAction(
  engagementId: string,
  name: string,
  parentFolderId?: string | null,
): Promise<CreateFolderActionResult> {
  // ── 1. Identity guard (ACCOUNTANT-only, ADR-003, CS-TS-004) ──────────────────
  const identity = await getAccountantIdentity(); // ADR-003 // CS-TS-004
  if (!identity) {
    return { success: false, error: "Unauthorized: ACCOUNTANT identity required" };
  }

  // ── 2. Input validation ───────────────────────────────────────────────────────
  if (!engagementId || typeof engagementId !== "string" || !engagementId.trim()) {
    return { success: false, error: "A valid engagement ID is required" };
  }
  if (!name || typeof name !== "string" || !name.trim()) {
    return { success: false, error: "A valid folder name is required" };
  }

  // ── 3. Create folder via TASK-013-002 seam (admin pool) ──────────────────────
  // AC-FILE-010-02: folder created on admin pool (admin principal bypasses BLOCK predicate).
  // CS-TS-001: admin pool write via folder repository seam.
  // CS-GEN-001: audit row contains folderId only — no display name logged.
  let result: { folderId: string };
  try {
    result = await createFolder({ // ADR-019: emits 'folder.created' inside withAuditTransaction
      engagementId: engagementId.trim(),
      name: name.trim(),
      parentFolderId: parentFolderId ?? null, // DECISION-013-A: null = root-level
      accountantClerkId: identity.clerkUserId, // CS-TS-004: from verified session
      sourceSurface: "admin", // ADR-006
    });
  } catch (err: unknown) {
    // CS-GEN-001: log at server level only — no PII surfaced to client.
    console.error("[createFolderAction] createFolder failed:", err);
    return { success: false, error: "Failed to create folder. Please try again." };
  }

  // ── 4. Revalidate the documents page ─────────────────────────────────────────
  revalidatePath(`/engagements/${engagementId.trim()}/documents`);

  return { success: true, data: { folderId: result.folderId } };
}

/**
 * Rename an existing folder (accountant-only).
 *
 * AC-FILE-010-02: Accountant can rename folders.
 * AC-FILE-010-04: Only ACCOUNTANT role can rename folders; CLIENT/null rejected before any write.
 *
 * ADR-003: identity guard before any DB write.
 * ADR-006: admin surface only — no mirror in apps/portal.
 * ADR-019: 'folder.renamed' audit event (inside renameFolder / withAuditTransaction).
 * CS-TS-004: identity from session cookie only — never from args.
 * CS-GEN-001: no new name or PII logged — folderId only in audit row.
 *
 * @param engagementId - The Engagement.id (defence-in-depth scope).
 * @param folderId - The Folder id to rename.
 * @param newName - The new display name.
 *
 * // ADR-003 // ADR-006 // ADR-019 // CS-TS-001 // CS-TS-002 // CS-TS-004 // CS-GEN-001 // CS-GEN-003
 */
export async function renameFolderAction(
  engagementId: string,
  folderId: string,
  newName: string,
): Promise<RenameFolderActionResult> {
  // ── 1. Identity guard (ACCOUNTANT-only, ADR-003, CS-TS-004) ──────────────────
  const identity = await getAccountantIdentity(); // ADR-003 // CS-TS-004
  if (!identity) {
    return { success: false, error: "Unauthorized: ACCOUNTANT identity required" };
  }

  // ── 2. Input validation ───────────────────────────────────────────────────────
  if (!engagementId || typeof engagementId !== "string" || !engagementId.trim()) {
    return { success: false, error: "A valid engagement ID is required" };
  }
  if (!folderId || typeof folderId !== "string" || !folderId.trim()) {
    return { success: false, error: "A valid folder ID is required" };
  }
  if (!newName || typeof newName !== "string" || !newName.trim()) {
    return { success: false, error: "A valid folder name is required" };
  }

  // ── 3. Rename folder via TASK-013-002 seam (admin pool) ──────────────────────
  // AC-FILE-010-02: rename on admin pool (scoped UPDATE — WHERE folderId AND engagementId).
  // CS-TS-001: admin pool write via folder repository seam.
  let result: { renamed: boolean };
  try {
    result = await renameFolder({ // ADR-019: emits 'folder.renamed' inside withAuditTransaction
      folderId: folderId.trim(),
      engagementId: engagementId.trim(),
      newName: newName.trim(),
      accountantClerkId: identity.clerkUserId, // CS-TS-004: from verified session
      sourceSurface: "admin", // ADR-006
    });
  } catch (err: unknown) {
    // CS-GEN-001: log at server level only — no PII surfaced to client.
    console.error("[renameFolderAction] renameFolder failed:", err);
    return { success: false, error: "Failed to rename folder. Please try again." };
  }

  // ── 4. Revalidate the documents page ─────────────────────────────────────────
  revalidatePath(`/engagements/${engagementId.trim()}/documents`);

  return { success: true, data: { renamed: result.renamed } };
}

/**
 * Move (re-parent) a folder within the same engagement (accountant-only).
 *
 * AC-FILE-010-02: Accountant can arrange (nest/re-parent) folders.
 * AC-FILE-010-04: Only ACCOUNTANT role can move folders; CLIENT/null rejected before any write.
 * DECISION-013-A: Re-parenting stays within the same engagement — enforced both here
 *   (scoped UPDATE via engagementId) and by the pol_Folder BLOCK predicate.
 *   Moving across engagements is NOT permitted.
 *
 * ADR-003: identity guard before any DB write.
 * ADR-006: admin surface only — no mirror in apps/portal.
 * ADR-019: 'folder.moved' audit event (inside moveFolder / withAuditTransaction).
 * CS-TS-004: identity from session cookie only — never from args.
 *
 * @param engagementId - The Engagement.id (defence-in-depth scope — move stays in-engagement).
 * @param folderId - The Folder id to move.
 * @param newParentFolderId - The new parent folder id (null = promote to root). DECISION-013-A.
 *
 * // ADR-003 // ADR-006 // ADR-019 // DECISION-013-A // CS-TS-001 // CS-TS-002 // CS-TS-004 // CS-GEN-001 // CS-GEN-003
 */
export async function moveFolderAction(
  engagementId: string,
  folderId: string,
  newParentFolderId: string | null,
): Promise<MoveFolderActionResult> {
  // ── 1. Identity guard (ACCOUNTANT-only, ADR-003, CS-TS-004) ──────────────────
  const identity = await getAccountantIdentity(); // ADR-003 // CS-TS-004
  if (!identity) {
    return { success: false, error: "Unauthorized: ACCOUNTANT identity required" };
  }

  // ── 2. Input validation ───────────────────────────────────────────────────────
  if (!engagementId || typeof engagementId !== "string" || !engagementId.trim()) {
    return { success: false, error: "A valid engagement ID is required" };
  }
  if (!folderId || typeof folderId !== "string" || !folderId.trim()) {
    return { success: false, error: "A valid folder ID is required" };
  }
  // DECISION-013-A: folderId cannot equal newParentFolderId (circular reference guard).
  if (newParentFolderId && newParentFolderId.trim() === folderId.trim()) {
    return { success: false, error: "A folder cannot be its own parent." };
  }

  // ── 3. Move (re-parent) folder via TASK-013-002 seam (admin pool) ─────────────
  // DECISION-013-A: engagementId scope on the UPDATE prevents cross-engagement moves.
  // AC-FILE-010-02: re-parent on admin pool (scoped UPDATE — WHERE folderId AND engagementId).
  // CS-TS-001: admin pool write via folder repository seam.
  let result: { moved: boolean };
  try {
    result = await moveFolder({ // ADR-019: emits 'folder.moved' inside withAuditTransaction
      folderId: folderId.trim(),
      engagementId: engagementId.trim(),
      newParentFolderId: newParentFolderId?.trim() ?? null, // DECISION-013-A: null = root
      accountantClerkId: identity.clerkUserId, // CS-TS-004: from verified session
      sourceSurface: "admin", // ADR-006
    });
  } catch (err: unknown) {
    // CS-GEN-001: log at server level only — no PII surfaced to client.
    console.error("[moveFolderAction] moveFolder failed:", err);
    return { success: false, error: "Failed to move folder. Please try again." };
  }

  // ── 4. Revalidate the documents page ─────────────────────────────────────────
  revalidatePath(`/engagements/${engagementId.trim()}/documents`);

  return { success: true, data: { moved: result.moved } };
}

/**
 * Place a document in a folder (accountant-only).
 *
 * AC-FILE-010-01: Files organize into folders — this places a file into one.
 * AC-FILE-010-03: A file is placed in a folder via this action.
 * AC-FILE-010-04: Only ACCOUNTANT role can place documents; CLIENT/null rejected before any write.
 * DECISION-013-A: No storage key changes — Document.folderId DB relationship is the only
 *   placement record (ADR-009: folder membership is not encoded in the storage key).
 *
 * ADR-003: identity guard before any DB write.
 * ADR-006: admin surface only — no mirror in apps/portal.
 * ADR-009: No storageKey changes — placement is purely the DB folderId relationship.
 * ADR-019: 'document.placed_in_folder' audit event (inside placeDocumentInFolder).
 * CS-TS-004: identity from session cookie only — never from args.
 *
 * @param engagementId - The Engagement.id (defence-in-depth scope).
 * @param documentId - The Document id to place.
 * @param folderId - The target Folder id (null = remove from folder / move to engagement root).
 *
 * // ADR-003 // ADR-006 // ADR-009 // ADR-019 // DECISION-013-A // CS-TS-001 // CS-TS-002 // CS-TS-004 // CS-GEN-001 // CS-GEN-003
 */
export async function placeDocumentAction(
  engagementId: string,
  documentId: string,
  folderId: string | null,
): Promise<PlaceDocumentActionResult> {
  // ── 1. Identity guard (ACCOUNTANT-only, ADR-003, CS-TS-004) ──────────────────
  const identity = await getAccountantIdentity(); // ADR-003 // CS-TS-004
  if (!identity) {
    return { success: false, error: "Unauthorized: ACCOUNTANT identity required" };
  }

  // ── 2. Input validation ───────────────────────────────────────────────────────
  if (!engagementId || typeof engagementId !== "string" || !engagementId.trim()) {
    return { success: false, error: "A valid engagement ID is required" };
  }
  if (!documentId || typeof documentId !== "string" || !documentId.trim()) {
    return { success: false, error: "A valid document ID is required" };
  }

  // ── 3. Place document via TASK-013-002 seam (admin pool) ──────────────────────
  // AC-FILE-010-03: place on admin pool (scoped UPDATE — WHERE documentId AND engagementId).
  // DECISION-013-A: no storageKey change — only Document.folderId updated (ADR-009).
  // CS-TS-001: admin pool write via folder repository seam.
  let result: { placed: boolean };
  try {
    result = await placeDocumentInFolder({ // ADR-019: emits 'document.placed_in_folder'
      documentId: documentId.trim(),
      engagementId: engagementId.trim(),
      folderId: folderId?.trim() ?? null, // null = remove from folder
      accountantClerkId: identity.clerkUserId, // CS-TS-004: from verified session
      sourceSurface: "admin", // ADR-006
    });
  } catch (err: unknown) {
    // CS-GEN-001: log at server level only — no PII surfaced to client.
    console.error("[placeDocumentAction] placeDocumentInFolder failed:", err);
    return { success: false, error: "Failed to place document in folder. Please try again." };
  }

  // ── 4. Revalidate the documents page ─────────────────────────────────────────
  revalidatePath(`/engagements/${engagementId.trim()}/documents`);

  return { success: true, data: { placed: result.placed } };
}
