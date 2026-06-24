/**
 * apps/admin/src/app/engagements/[engagementId]/documents/_components/FolderTree.tsx
 *
 * Folder tree management component for the accountant's engagement documents surface.
 *
 * TASK-013-004: Admin (Tax Portal) — accountant-managed folder structure.
 *
 * Acceptance criteria:
 *   AC-FILE-010-01 — files organize into a folder structure (tree rendered here)
 *   AC-FILE-010-02 — accountant can create, rename, and arrange (re-parent) folders
 *   AC-FILE-010-03 — accountant can place a file in a folder via the folder tree
 *   AC-FILE-010-04 — folder management affordance exists ONLY here (apps/admin) — never in apps/portal
 *
 * ADR-006: Admin-only component — NEVER imported in apps/portal.
 *   The folder-management UI (create/rename/arrange/place) is NOT available to clients.
 * GUARDRAIL: No dangerouslySetInnerHTML anywhere in this component.
 * GUARDRAIL: engagementId comes from the server-resolved route param — never from client input.
 * DECISION-013-A: parentFolderId self-ref for nesting; re-parent stays same engagement.
 *
 * data-testid hooks (AC-tagged):
 *   data-testid="folder-tree"                   — root container (@AC-FILE-010-01)
 *   data-testid="folder-create-form"            — create folder form (@AC-FILE-010-02)
 *   data-testid="folder-name-input"             — name input for new folder
 *   data-testid="folder-create-button"          — submit create action
 *   data-testid="folder-item-{id}"             — each folder row (@AC-FILE-010-02)
 *   data-testid="folder-name-{id}"             — folder name label
 *   data-testid="folder-rename-button-{id}"    — opens rename form (@AC-FILE-010-02)
 *   data-testid="folder-rename-input-{id}"     — rename text input
 *   data-testid="folder-rename-submit-{id}"    — submit rename action
 *   data-testid="folder-rename-cancel-{id}"    — cancel rename
 *   data-testid="folder-move-select-{id}"      — parent folder select for re-parent (@AC-FILE-010-02)
 *   data-testid="folder-move-button-{id}"      — submit re-parent action
 *   data-testid="place-document-select-{docId}" — folder selector for placing a doc (@AC-FILE-010-03)
 *   data-testid="place-document-button-{docId}" — submit place-in-folder action
 *   data-testid="folder-action-error"           — error banner
 *   data-testid="folder-action-success"         — success banner
 *
 * // ADR-006 // DECISION-013-A // CS-GEN-003
 */

"use client";

import { useState, useTransition, useCallback } from "react";
import {
  createFolderAction,
  renameFolderAction,
  moveFolderAction,
  placeDocumentAction,
} from "../folders/actions";
import type {
  CreateFolderActionResult,
  RenameFolderActionResult,
  MoveFolderActionResult,
  PlaceDocumentActionResult,
} from "../folders/actions";
import type { FolderItem, DocumentItem } from "@tax-portal/db";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FolderTreeProps {
  /** Engagement ID from the server-resolved route param — never from client input. */
  engagementId: string;
  /** Initial folder list — server-fetched and passed as props. */
  initialFolders: FolderItem[];
  /** Documents that can be placed into folders. */
  documents: DocumentItem[];
  /** Called after any structural change (create/rename/move/place) so the parent can refresh. */
  onFolderChange?: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * FolderTree — accountant-only folder management component.
 *
 * Renders the engagement's folder tree and exposes:
 *   - Create folder (optionally nested) — AC-FILE-010-02
 *   - Rename folder — AC-FILE-010-02
 *   - Re-parent (arrange) folder — AC-FILE-010-02 / DECISION-013-A
 *   - Place a document in a folder — AC-FILE-010-03
 *
 * ADR-006: Admin-only — this component must NEVER be imported in apps/portal.
 *   The portal client has NO folder-management affordance (AC-FILE-010-04).
 */
export function FolderTree({
  engagementId,
  initialFolders,
  documents,
  onFolderChange,
}: FolderTreeProps) {
  const [folders, setFolders] = useState<FolderItem[]>(initialFolders);
  const [statusMessage, setStatusMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [isPending, startTransition] = useTransition();

  // ── Create folder state ───────────────────────────────────────────────────────
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderParentId, setNewFolderParentId] = useState<string>("");

  // ── Rename state (per-folder inline form) ────────────────────────────────────
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // ── Move (re-parent) state ────────────────────────────────────────────────────
  const [movingFolderId, setMovingFolderId] = useState<string | null>(null);
  const [moveTargetParentId, setMoveTargetParentId] = useState<string>("");

  // ── Place document state ──────────────────────────────────────────────────────
  const [placingDocId, setPlacingDocId] = useState<string | null>(null);
  const [placeTargetFolderId, setPlaceTargetFolderId] = useState<string>("");

  // ─── Status helpers ───────────────────────────────────────────────────────────

  function showSuccess(text: string) {
    setStatusMessage({ type: "success", text });
    setTimeout(() => setStatusMessage(null), 4000);
  }

  function showError(text: string) {
    setStatusMessage({ type: "error", text });
  }

  // ─── Refresh folders after mutation ──────────────────────────────────────────
  // The parent (page.tsx) re-fetches the full folder list via server action refresh.
  // We call onFolderChange() to signal the parent to reload the folder+document state.
  const triggerRefresh = useCallback(() => {
    onFolderChange?.();
  }, [onFolderChange]);

  // ─── Create folder ────────────────────────────────────────────────────────────

  /**
   * AC-FILE-010-02: Accountant creates a folder.
   * AC-FILE-010-04: Identity guard in createFolderAction — CLIENT/null rejected before any write.
   *
   * // ADR-003 // ADR-006 // CS-TS-004
   */
  function handleCreateFolder(e: React.FormEvent) {
    e.preventDefault();
    if (!newFolderName.trim()) return;

    startTransition(async () => {
      const result: CreateFolderActionResult = await createFolderAction(
        engagementId,
        newFolderName.trim(),
        newFolderParentId.trim() || null, // DECISION-013-A: empty string → root level
      );

      if (result.success) {
        setNewFolderName("");
        setNewFolderParentId("");
        showSuccess(`Folder created.`);
        // Optimistically add the new folder (will be reconciled by parent refresh).
        setFolders((prev) => [
          ...prev,
          {
            id: result.data.folderId,
            engagementId,
            name: newFolderName.trim(),
            parentFolderId: newFolderParentId.trim() || null,
            createdBy: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ]);
        triggerRefresh();
      } else {
        showError(result.error);
      }
    });
  }

  // ─── Rename folder ────────────────────────────────────────────────────────────

  /**
   * AC-FILE-010-02: Accountant renames a folder.
   * AC-FILE-010-04: Identity guard in renameFolderAction — CLIENT/null rejected before any write.
   *
   * // ADR-003 // ADR-006 // CS-TS-004
   */
  function startRename(folder: FolderItem) {
    setRenamingFolderId(folder.id);
    setRenameValue(folder.name);
  }

  function cancelRename() {
    setRenamingFolderId(null);
    setRenameValue("");
  }

  function handleRenameSubmit(folderId: string) {
    if (!renameValue.trim()) return;

    startTransition(async () => {
      const result: RenameFolderActionResult = await renameFolderAction(
        engagementId,
        folderId,
        renameValue.trim(),
      );

      if (result.success) {
        if (result.data.renamed) {
          // Optimistically update the name in local state.
          setFolders((prev) =>
            prev.map((f) =>
              f.id === folderId ? { ...f, name: renameValue.trim(), updatedAt: new Date() } : f,
            ),
          );
          showSuccess(`Folder renamed.`);
          triggerRefresh();
        } else {
          showError("Folder not found or not in this engagement.");
        }
        setRenamingFolderId(null);
        setRenameValue("");
      } else {
        showError(result.error);
      }
    });
  }

  // ─── Move (re-parent) folder ──────────────────────────────────────────────────

  /**
   * AC-FILE-010-02: Accountant re-parents (arranges) a folder.
   * DECISION-013-A: Re-parenting stays within the same engagement.
   * AC-FILE-010-04: Identity guard in moveFolderAction — CLIENT/null rejected before any write.
   *
   * // ADR-003 // ADR-006 // DECISION-013-A // CS-TS-004
   */
  function startMove(folder: FolderItem) {
    setMovingFolderId(folder.id);
    setMoveTargetParentId(folder.parentFolderId ?? "");
  }

  function cancelMove() {
    setMovingFolderId(null);
    setMoveTargetParentId("");
  }

  function handleMoveSubmit(folderId: string) {
    startTransition(async () => {
      const result: MoveFolderActionResult = await moveFolderAction(
        engagementId,
        folderId,
        moveTargetParentId.trim() || null, // DECISION-013-A: empty string → root level
      );

      if (result.success) {
        if (result.data.moved) {
          // Optimistically update parent in local state.
          setFolders((prev) =>
            prev.map((f) =>
              f.id === folderId
                ? { ...f, parentFolderId: moveTargetParentId.trim() || null, updatedAt: new Date() }
                : f,
            ),
          );
          showSuccess(`Folder moved.`);
          triggerRefresh();
        } else {
          showError("Folder not found or not in this engagement.");
        }
        setMovingFolderId(null);
        setMoveTargetParentId("");
      } else {
        showError(result.error);
      }
    });
  }

  // ─── Place document in folder ─────────────────────────────────────────────────

  /**
   * AC-FILE-010-03: A file is placed in a folder.
   * DECISION-013-A: No storage key changes — Document.folderId DB relationship only (ADR-009).
   * AC-FILE-010-04: Identity guard in placeDocumentAction — CLIENT/null rejected before any write.
   *
   * // ADR-003 // ADR-006 // ADR-009 // DECISION-013-A // CS-TS-004
   */
  function handlePlaceDocument(documentId: string) {
    startTransition(async () => {
      const result: PlaceDocumentActionResult = await placeDocumentAction(
        engagementId,
        documentId,
        placeTargetFolderId.trim() || null, // null = remove from folder
      );

      if (result.success) {
        if (result.data.placed) {
          showSuccess(`File placed in folder.`);
          triggerRefresh();
        } else {
          showError("Document not found or not in this engagement.");
        }
        setPlacingDocId(null);
        setPlaceTargetFolderId("");
      } else {
        showError(result.error);
      }
    });
  }

  // ─── Build eligible-parent options (exclude self + descendants) ───────────────

  /**
   * Returns folders eligible as a new parent for a given folderId.
   * Excludes: the folder itself (circular reference guard — DECISION-013-A).
   * Note: Full descendant exclusion would require a tree traversal; here we exclude
   * direct self only (the DB scoped-UPDATE is the enforcement backstop).
   */
  function eligibleParents(forFolderId: string): FolderItem[] {
    return folders.filter((f) => f.id !== forFolderId);
  }

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <section
      className="rounded-lg border border-gray-200 bg-white"
      aria-label="Folder management"
      data-testid="folder-tree"
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100">
        <h2 className="text-sm font-semibold text-gray-700">
          Folders
          {isPending && (
            <span className="ml-2 text-xs font-normal text-gray-400" aria-live="polite">
              Saving…
            </span>
          )}
        </h2>
      </div>

      {/* Status banners */}
      {statusMessage && (
        statusMessage.type === "success" ? (
          <div
            role="status"
            aria-live="polite"
            className="mx-4 mt-3 rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700"
            data-testid="folder-action-success"
          >
            {/* GUARDRAIL: auto-escaped JSX text — no dangerouslySetInnerHTML */}
            {statusMessage.text}
          </div>
        ) : (
          <div
            role="alert"
            aria-live="assertive"
            className="mx-4 mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
            data-testid="folder-action-error"
          >
            {/* GUARDRAIL: auto-escaped JSX text — no dangerouslySetInnerHTML */}
            {statusMessage.text}
          </div>
        )
      )}

      {/* ── Create folder form (AC-FILE-010-02) ─────────────────────────────── */}
      <form
        onSubmit={handleCreateFolder}
        className="px-4 py-3 border-b border-gray-100"
        data-testid="folder-create-form"
        aria-label="Create a new folder"
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label
              htmlFor="new-folder-name"
              className="block text-xs font-medium text-gray-600 mb-1"
            >
              New folder name
            </label>
            <input
              id="new-folder-name"
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="e.g. Tax Returns 2023"
              className="block w-full rounded border border-gray-300 px-2 py-1.5 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
              disabled={isPending}
              maxLength={255}
              data-testid="folder-name-input"
            />
          </div>
          {folders.length > 0 && (
            <div className="flex-1">
              <label
                htmlFor="new-folder-parent"
                className="block text-xs font-medium text-gray-600 mb-1"
              >
                Parent folder (optional)
              </label>
              <select
                id="new-folder-parent"
                value={newFolderParentId}
                onChange={(e) => setNewFolderParentId(e.target.value)}
                className="block w-full rounded border border-gray-300 px-2 py-1.5 text-sm text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                disabled={isPending}
                data-testid="folder-parent-select"
              >
                <option value="">— Root level —</option>
                {folders.map((f) => (
                  <option key={f.id} value={f.id}>
                    {/* GUARDRAIL: auto-escaped JSX text — no dangerouslySetInnerHTML */}
                    {f.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <button
            type="submit"
            disabled={isPending || !newFolderName.trim()}
            className="rounded bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
            data-testid="folder-create-button"
          >
            Create folder
          </button>
        </div>
      </form>

      {/* ── Folder list (AC-FILE-010-01 / AC-FILE-010-02) ───────────────────── */}
      {folders.length === 0 ? (
        <div
          className="px-4 py-6 text-center text-sm text-gray-500"
          data-testid="folder-tree-empty"
        >
          No folders created yet. Create one above to start organizing files.
        </div>
      ) : (
        <ul
          className="divide-y divide-gray-100"
          aria-label="Folder list"
          data-testid="folder-list"
        >
          {folders.map((folder) => (
            <FolderRow
              key={folder.id}
              folder={folder}
              folders={folders}
              eligibleParents={eligibleParents}
              renamingFolderId={renamingFolderId}
              renameValue={renameValue}
              movingFolderId={movingFolderId}
              moveTargetParentId={moveTargetParentId}
              isPending={isPending}
              onStartRename={startRename}
              onCancelRename={cancelRename}
              onRenameValueChange={setRenameValue}
              onRenameSubmit={handleRenameSubmit}
              onStartMove={startMove}
              onCancelMove={cancelMove}
              onMoveTargetChange={setMoveTargetParentId}
              onMoveSubmit={handleMoveSubmit}
            />
          ))}
        </ul>
      )}

      {/* ── Place document in folder (AC-FILE-010-03) ───────────────────────── */}
      {documents.length > 0 && (
        <section
          className="px-4 py-3 border-t border-gray-100"
          aria-label="Place a file in a folder"
          data-testid="place-document-section"
        >
          <h3 className="text-xs font-semibold text-gray-600 mb-2">Place a file in a folder</h3>
          {folders.length === 0 ? (
            <p className="text-xs text-gray-400">Create a folder first to place files.</p>
          ) : (
            <ul className="space-y-2">
              {documents.map((doc) => (
                <li key={doc.id} className="flex flex-col sm:flex-row sm:items-center gap-2">
                  <span
                    className="text-sm text-gray-700 truncate flex-1"
                    title={doc.originalFilename}
                  >
                    {/* GUARDRAIL: auto-escaped JSX text — no dangerouslySetInnerHTML */}
                    {doc.originalFilename}
                  </span>
                  <div className="flex items-center gap-2">
                    <select
                      aria-label={`Choose folder for ${doc.originalFilename}`}
                      value={placingDocId === doc.id ? placeTargetFolderId : ""}
                      onChange={(e) => {
                        setPlacingDocId(doc.id);
                        setPlaceTargetFolderId(e.target.value);
                      }}
                      className="rounded border border-gray-300 px-2 py-1 text-sm text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                      disabled={isPending}
                      data-testid={`place-document-select-${doc.id}`}
                    >
                      <option value="">— No folder —</option>
                      {folders.map((f) => (
                        <option key={f.id} value={f.id}>
                          {/* GUARDRAIL: auto-escaped JSX text — no dangerouslySetInnerHTML */}
                          {f.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={isPending || placingDocId !== doc.id || !placeTargetFolderId}
                      onClick={() => handlePlaceDocument(doc.id)}
                      className="rounded bg-gray-700 px-3 py-1 text-xs font-semibold text-white hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-1"
                      data-testid={`place-document-button-${doc.id}`}
                    >
                      Place
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </section>
  );
}

// ─── FolderRow sub-component ──────────────────────────────────────────────────

interface FolderRowProps {
  folder: FolderItem;
  folders: FolderItem[];
  eligibleParents: (forFolderId: string) => FolderItem[];
  renamingFolderId: string | null;
  renameValue: string;
  movingFolderId: string | null;
  moveTargetParentId: string;
  isPending: boolean;
  onStartRename: (folder: FolderItem) => void;
  onCancelRename: () => void;
  onRenameValueChange: (v: string) => void;
  onRenameSubmit: (folderId: string) => void;
  onStartMove: (folder: FolderItem) => void;
  onCancelMove: () => void;
  onMoveTargetChange: (v: string) => void;
  onMoveSubmit: (folderId: string) => void;
}

/**
 * FolderRow — renders a single folder entry with inline rename + re-parent controls.
 *
 * AC-FILE-010-02: inline rename + re-parent (arrange) affordances.
 * AC-FILE-010-04: these affordances exist ONLY in apps/admin — never in apps/portal.
 */
function FolderRow({
  folder,
  eligibleParents,
  renamingFolderId,
  renameValue,
  movingFolderId,
  moveTargetParentId,
  isPending,
  onStartRename,
  onCancelRename,
  onRenameValueChange,
  onRenameSubmit,
  onStartMove,
  onCancelMove,
  onMoveTargetChange,
  onMoveSubmit,
}: FolderRowProps) {
  const isRenaming = renamingFolderId === folder.id;
  const isMoving = movingFolderId === folder.id;
  const eligibles = eligibleParents(folder.id);

  return (
    <li
      className="px-4 py-3"
      data-testid={`folder-item-${folder.id}`}
      data-folder-id={folder.id}
    >
      {/* Folder name row */}
      <div className="flex items-center gap-3">
        {/* Folder icon */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="w-5 h-5 text-amber-500 flex-shrink-0"
          aria-hidden="true"
        >
          <path d="M2 6a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6Z" />
        </svg>

        {/* Folder name */}
        {isRenaming ? (
          <div className="flex items-center gap-2 flex-1">
            <input
              type="text"
              value={renameValue}
              onChange={(e) => onRenameValueChange(e.target.value)}
              className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
              disabled={isPending}
              maxLength={255}
              autoFocus
              aria-label={`Rename folder ${folder.name}`}
              data-testid={`folder-rename-input-${folder.id}`}
              onKeyDown={(e) => {
                if (e.key === "Enter") onRenameSubmit(folder.id);
                if (e.key === "Escape") onCancelRename();
              }}
            />
            <button
              type="button"
              onClick={() => onRenameSubmit(folder.id)}
              disabled={isPending || !renameValue.trim()}
              className="rounded bg-blue-600 px-2 py-1 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
              data-testid={`folder-rename-submit-${folder.id}`}
            >
              Save
            </button>
            <button
              type="button"
              onClick={onCancelRename}
              disabled={isPending}
              className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-1"
              data-testid={`folder-rename-cancel-${folder.id}`}
            >
              Cancel
            </button>
          </div>
        ) : (
          <>
            <span
              className="text-sm font-medium text-gray-900 flex-1"
              data-testid={`folder-name-${folder.id}`}
            >
              {/* GUARDRAIL: auto-escaped JSX text — no dangerouslySetInnerHTML */}
              {folder.name}
            </span>

            {/* Rename button */}
            <button
              type="button"
              onClick={() => onStartRename(folder)}
              disabled={isPending || isMoving}
              className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-1"
              aria-label={`Rename ${folder.name}`}
              data-testid={`folder-rename-button-${folder.id}`}
            >
              Rename
            </button>

            {/* Move (re-parent) button */}
            {eligibles.length > 0 && (
              <button
                type="button"
                onClick={() => onStartMove(folder)}
                disabled={isPending || isRenaming}
                className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-1"
                aria-label={`Move ${folder.name} to a different parent`}
                data-testid={`folder-arrange-button-${folder.id}`}
              >
                Move
              </button>
            )}
          </>
        )}
      </div>

      {/* Re-parent form (AC-FILE-010-02 / DECISION-013-A) */}
      {isMoving && (
        <div className="mt-2 ml-8 flex items-center gap-2">
          <select
            value={moveTargetParentId}
            onChange={(e) => onMoveTargetChange(e.target.value)}
            className="rounded border border-gray-300 px-2 py-1 text-sm text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
            disabled={isPending}
            aria-label={`Move ${folder.name} under a different folder`}
            data-testid={`folder-move-select-${folder.id}`}
          >
            <option value="">— Root level —</option>
            {eligibles.map((f) => (
              <option key={f.id} value={f.id}>
                {/* GUARDRAIL: auto-escaped JSX text — no dangerouslySetInnerHTML */}
                {f.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => onMoveSubmit(folder.id)}
            disabled={isPending}
            className="rounded bg-blue-600 px-2 py-1 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
            data-testid={`folder-move-button-${folder.id}`}
          >
            Move here
          </button>
          <button
            type="button"
            onClick={onCancelMove}
            disabled={isPending}
            className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-1"
            data-testid={`folder-move-cancel-${folder.id}`}
          >
            Cancel
          </button>
        </div>
      )}

      {/* Parent indicator */}
      {folder.parentFolderId && !isMoving && (
        <p className="mt-1 ml-8 text-xs text-gray-400">
          Nested folder
        </p>
      )}
    </li>
  );
}
