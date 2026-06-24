/**
 * apps/admin/src/app/engagements/[engagementId]/documents/_components/DocumentsClientPage.tsx
 *
 * Client-side engagement document list with upload + per-file replace + delete + recover controls.
 *
 * TASK-013-003: Accountant upload + version-replace UI.
 * TASK-014-003: Soft-delete + Archive/Recover affordance (EPIC-014).
 *
 * Acceptance criteria:
 *   AC-FILE-001-01 — the accountant can upload a file; it appears in the engagement's document set.
 *   AC-FILE-009-01 — an existing file can be replaced with a new version.
 *   AC-FILE-009-02 — after replacement, the newest version is presented as the current version.
 *   AC-FILE-004-01 — the accountant can delete a file (Delete control on each active file).
 *   AC-FILE-006-01 — deleting removes the file from the working view (hidden in working list).
 *   AC-FILE-006-03 — deleted files appear in the Archive section with a Recover control.
 *
 * This is the client-interactive shell:
 *   - Renders the document list from `initialDocuments` (server-fetched, passed as props).
 *   - After an upload, replace, delete, or recover completes, refreshes the list.
 *   - UploadControl: new-file upload (AC-FILE-001-01).
 *   - VersionReplaceControl: per-document version replacement (AC-FILE-009-01/-02).
 *   - Delete button: soft-delete action (AC-FILE-004-01 / AC-FILE-006-01).
 *   - Archive section: lists deleted documents with Recover control (AC-FILE-006-03).
 *
 * ADR-006: Admin-only component — never imported in apps/portal.
 * ADR-018: Delete is soft (tombstone only — never a physical delete button that issues DELETE SQL).
 * GUARDRAIL: No dangerouslySetInnerHTML anywhere in this component.
 * GUARDRAIL: engagementId comes from the server-resolved route param — never from client input.
 *
 * data-testid hooks:
 *   data-testid="documents-list"             — document list container (working view)
 *   data-testid="documents-empty"            — empty state message
 *   data-testid="document-item-{id}"         — each document row
 *   data-testid="document-filename-{id}"     — filename label
 *   data-testid="document-version-{id}"      — current version badge
 *   data-testid="document-status-{id}"       — status badge (active/pending/infected)
 *   data-testid="upload-section"             — upload control container
 *   data-testid="delete-button-{id}"         — Delete button for each active document
 *   data-testid="delete-confirm-{id}"        — confirmation inline (shown before delete fires)
 *   data-testid="delete-confirm-yes-{id}"    — confirm Yes button
 *   data-testid="delete-confirm-cancel-{id}" — cancel button
 *   data-testid="delete-error-{id}"          — error message on delete failure
 *   data-testid="archive-section"            — Archive/deleted documents section
 *   data-testid="archive-empty"              — empty archive state
 *   data-testid="archive-document-item-{id}" — each deleted document row
 *   data-testid="archive-filename-{id}"      — filename of the deleted document
 *   data-testid="recover-button-{id}"        — Recover button for each deleted document
 *   data-testid="recover-error-{id}"         — error message on recover failure
 *
 * // ADR-006 // ADR-018 // CS-TS-003 // CS-TS-004 // CS-GEN-003
 */

"use client";

import { useState, useCallback, useTransition } from "react";
import { UploadControl } from "./UploadControl";
import { VersionReplaceControl } from "./VersionReplaceControl";
import { DownloadButton } from "./DownloadButton";
import { VersionHistory } from "./VersionHistory";
import { listDocumentsAction, deleteDocumentAction, recoverDocumentAction, listDeletedDocumentsAction } from "../actions";
import type { DocumentItem } from "@tax-portal/db";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DocumentsClientPageProps {
  /** Engagement ID from the server-resolved route param. */
  engagementId: string;
  /** Initial document list (working view, deletedAt IS NULL) — server-fetched before hydration. */
  initialDocuments: DocumentItem[];
  /** Initial deleted document list (archive view) — server-fetched before hydration. */
  initialDeletedDocuments: DocumentItem[];
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * DocumentsClientPage — client component for the engagement document list.
 *
 * Shows all documents for the engagement. After upload, replace, delete, or recover,
 * refreshes both the working list and the archive list.
 *
 * AC-FILE-001-01: uploaded file appears in the document set (after refresh).
 * AC-FILE-009-01: replaced file gets a new version (after refresh shows v+1).
 * AC-FILE-009-02: newest version is shown as current (Document row current pointer — DECISION-013-C).
 * AC-FILE-004-01: Delete control on each active file; soft-delete removes from working view.
 * AC-FILE-006-01: deleted file disappears from the working list; appears in Archive section.
 * AC-FILE-006-03: Archive section shows Recover control; recover restores to working view.
 *
 * // ADR-006 // ADR-018 // CS-TS-004 // CS-GEN-003
 */
export function DocumentsClientPage({ engagementId, initialDocuments, initialDeletedDocuments }: DocumentsClientPageProps) {
  const [documents, setDocuments] = useState<DocumentItem[]>(initialDocuments);
  const [deletedDocuments, setDeletedDocuments] = useState<DocumentItem[]>(initialDeletedDocuments);
  const [isPending, startTransition] = useTransition();

  // Refresh both working and archive lists after any mutation.
  // ADR-018: working view = deletedAt IS NULL; archive = deletedAt IS NOT NULL.
  const refreshAll = useCallback(() => {
    startTransition(async () => {
      const [workingResult, archiveResult] = await Promise.all([
        listDocumentsAction(engagementId),
        listDeletedDocumentsAction(engagementId),
      ]);
      if (workingResult.success) {
        setDocuments(workingResult.data);
      }
      if (archiveResult.success) {
        setDeletedDocuments(archiveResult.data);
      }
    });
  }, [engagementId]);

  return (
    <div>
      {/* Upload section (AC-FILE-001-01) */}
      <section
        className="mb-6 rounded-lg border border-gray-200 bg-white p-4"
        data-testid="upload-section"
      >
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Upload a new file</h2>
        <UploadControl
          engagementId={engagementId}
          onUploadComplete={refreshAll}
        />
      </section>

      {/* Working document list (AC-FILE-001-01 / AC-FILE-009-01 / AC-FILE-009-02 / AC-FILE-004-01) */}
      <section
        className="rounded-lg border border-gray-200 bg-white"
        aria-label="Engagement documents"
        aria-busy={isPending}
      >
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700">
            Documents
            {isPending && (
              <span className="ml-2 text-xs font-normal text-gray-400" aria-live="polite">
                Refreshing…
              </span>
            )}
          </h2>
        </div>

        {documents.length === 0 ? (
          <div
            className="px-4 py-8 text-center text-sm text-gray-500"
            data-testid="documents-empty"
          >
            No documents have been uploaded to this engagement yet.
          </div>
        ) : (
          <ul className="divide-y divide-gray-100" data-testid="documents-list">
            {documents.map((doc) => (
              <DocumentRow
                key={doc.id}
                document={doc}
                engagementId={engagementId}
                onReplaceComplete={refreshAll}
                onDeleteComplete={refreshAll}
              />
            ))}
          </ul>
        )}
      </section>

      {/* Archive / Deleted documents section (AC-FILE-006-01 / AC-FILE-006-03) */}
      {/* ADR-018: deleted docs are retained; accountant can recover in-window. */}
      <section
        className="mt-6 rounded-lg border border-gray-200 bg-white"
        aria-label="Deleted documents (Archive)"
        data-testid="archive-section"
      >
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700">
            Archive
            <span className="ml-2 text-xs font-normal text-gray-400">Deleted files — recoverable in-window</span>
          </h2>
        </div>

        {deletedDocuments.length === 0 ? (
          <div
            className="px-4 py-8 text-center text-sm text-gray-500"
            data-testid="archive-empty"
          >
            No deleted files in this engagement.
          </div>
        ) : (
          <ul className="divide-y divide-gray-100" data-testid="archive-list">
            {deletedDocuments.map((doc) => (
              <ArchiveRow
                key={doc.id}
                document={doc}
                engagementId={engagementId}
                onRecoverComplete={refreshAll}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// ─── Document row sub-component ────────────────────────────────────────────────

interface DocumentRowProps {
  document: DocumentItem;
  engagementId: string;
  onReplaceComplete: () => void;
  onDeleteComplete: () => void;
}

/**
 * DocumentRow — renders a single document row with version info + replace + delete controls.
 *
 * AC-FILE-009-02: shows current version number (Document row = current pointer, DECISION-013-C).
 * AC-FILE-009-01: per-document VersionReplaceControl.
 * AC-FILE-004-01: Delete button (soft-delete; shows inline confirm before firing — ADR-018 §1).
 * AC-FILE-006-01: deleted file is removed from this working list on next refresh.
 *
 * Only 'active' documents show the replace and delete controls.
 * ADR-018: Delete is soft (tombstone only — never a physical DELETE row).
 */
function DocumentRow({ document, engagementId, onReplaceComplete, onDeleteComplete }: DocumentRowProps) {
  const isActive = document.status === "active";
  const isPendingStatus = document.status === "pending";
  const isInfected = document.status === "infected";

  // Delete confirm state — show inline confirm before firing the server action.
  // ADR-018: soft-delete is recoverable, so a light confirm suffices (not a destructive modal).
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, startDeleteTransition] = useTransition();
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const statusBadge = isActive
    ? { label: "Active", className: "bg-green-100 text-green-700" }
    : isPendingStatus
    ? { label: "Processing", className: "bg-amber-100 text-amber-700" }
    : isInfected
    ? { label: "Blocked", className: "bg-red-100 text-red-700" }
    : { label: document.status, className: "bg-gray-100 text-gray-600" };

  // AC-FILE-004-01: soft-delete handler.
  // CS-TS-004: action resolves identity server-side; CLIENT is rejected before any write.
  // ADR-018: calls deleteDocumentAction (soft-delete, UPDATE-only; row+bytes retained).
  function handleDeleteConfirm() {
    setDeleteError(null);
    startDeleteTransition(async () => {
      const result = await deleteDocumentAction(engagementId, document.id); // ADR-018 // CS-TS-004
      if (result.success) {
        setShowDeleteConfirm(false);
        onDeleteComplete(); // Refresh both working and archive lists (AC-FILE-006-01)
      } else {
        // CS-GEN-001: surface action-level error message only, not internal details.
        setDeleteError(result.error);
        setShowDeleteConfirm(false);
      }
    });
  }

  return (
    <li
      className="px-4 py-3 flex items-start gap-3"
      data-testid={`document-item-${document.id}`}
      data-document-id={document.id}
      data-status={document.status}
    >
      {/* File icon */}
      <div className="flex-shrink-0 mt-0.5">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="w-5 h-5 text-gray-400"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M4 4a2 2 0 0 1 2-2h4.586A2 2 0 0 1 12 2.586L15.414 6A2 2 0 0 1 16 7.414V16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4Zm2 6a.75.75 0 0 1 .75-.75h6.5a.75.75 0 0 1 0 1.5h-6.5A.75.75 0 0 1 6 10Zm0 3a.75.75 0 0 1 .75-.75h6.5a.75.75 0 0 1 0 1.5h-6.5A.75.75 0 0 1 6 13Z"
            clipRule="evenodd"
          />
        </svg>
      </div>

      {/* Document info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          {/* GUARDRAIL: originalFilename auto-escaped as JSX text — no dangerouslySetInnerHTML */}
          <span
            className="text-sm font-medium text-gray-900 truncate"
            data-testid={`document-filename-${document.id}`}
          >
            {document.originalFilename}
          </span>

          {/* AC-FILE-009-02: current version badge */}
          <span
            className="text-xs text-gray-400 font-mono flex-shrink-0"
            data-testid={`document-version-${document.id}`}
          >
            v{document.version}
          </span>

          {/* Status badge */}
          <span
            className={`text-xs font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0 ${statusBadge.className}`}
            data-testid={`document-status-${document.id}`}
          >
            {statusBadge.label}
          </span>
        </div>

        <div className="mt-0.5 flex items-center gap-3 text-xs text-gray-400">
          <span>{document.contentType}</span>
          {document.sizeBytes > 0 && (
            <span>{formatBytes(document.sizeBytes)}</span>
          )}
          <span>{formatDate(document.createdAt)}</span>
        </div>

        {/* Inline delete confirm — shown when Delete is clicked (ADR-018: light confirm, recoverable) */}
        {showDeleteConfirm && (
          <div
            className="mt-2 flex items-center gap-2 text-sm"
            data-testid={`delete-confirm-${document.id}`}
          >
            <span className="text-gray-600">Delete this file? (Recoverable from Archive)</span>
            <button
              onClick={handleDeleteConfirm}
              disabled={isDeleting}
              className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
              data-testid={`delete-confirm-yes-${document.id}`}
            >
              {isDeleting ? "Deleting…" : "Delete"}
            </button>
            <button
              onClick={() => setShowDeleteConfirm(false)}
              disabled={isDeleting}
              className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200 disabled:opacity-50"
              data-testid={`delete-confirm-cancel-${document.id}`}
            >
              Cancel
            </button>
          </div>
        )}

        {/* Delete error message */}
        {deleteError && (
          <div
            className="mt-1 text-xs text-red-600"
            role="alert"
            data-testid={`delete-error-${document.id}`}
          >
            {/* GUARDRAIL: auto-escaped JSX text — no dangerouslySetInnerHTML */}
            {deleteError}
          </div>
        )}

        {/* AC-FILE-009-03: version history — listed below meta; collapsible (TASK-013-005) */}
        {isActive && (
          <VersionHistory
            documentId={document.id}
            engagementId={engagementId}
          />
        )}
      </div>

      {/* AC-FILE-001-03: download + AC-FILE-009-01: replace + AC-FILE-004-01: delete — active only */}
      {isActive && (
        <div className="flex-shrink-0 flex flex-col gap-1">
          {/* AC-FILE-001-03: accountant downloads any engagement's file (TASK-013-005) */}
          {/* ADR-009: authorize-then-sign via requestDownloadUrlAction */}
          <DownloadButton
            documentId={document.id}
            engagementId={engagementId}
          />
          <VersionReplaceControl
            engagementId={engagementId}
            documentId={document.id}
            currentFilename={document.originalFilename}
            onReplaceComplete={onReplaceComplete}
          />
          {/* AC-FILE-004-01: soft-delete control — shows inline confirm (ADR-018: light confirm, recoverable) */}
          {/* CS-TS-004: server action rejects non-ACCOUNTANT before any write */}
          {/* ADR-006: admin-only; no delete control in apps/portal (CS-TS-003 mirror obligation) */}
          {!showDeleteConfirm && (
            <button
              onClick={() => { setDeleteError(null); setShowDeleteConfirm(true); }}
              className="px-2 py-1 text-xs text-red-600 border border-red-300 rounded hover:bg-red-50 transition-colors"
              data-testid={`delete-button-${document.id}`}
              aria-label={`Delete ${document.originalFilename}`}
            >
              Delete
            </button>
          )}
        </div>
      )}
    </li>
  );
}

// ─── Archive row sub-component ─────────────────────────────────────────────────

interface ArchiveRowProps {
  document: DocumentItem;
  engagementId: string;
  onRecoverComplete: () => void;
}

/**
 * ArchiveRow — renders a single soft-deleted document row with a Recover control.
 *
 * AC-FILE-006-01: Deleted files appear here (not in the working list).
 * AC-FILE-006-03: Each row has a Recover button that calls recoverDocumentAction.
 * AC-FILE-005-02: Recovery is in-window only (no expiry guard in this slice; EPIC-015).
 *
 * ADR-018: recover clears deletedAt tombstone (UPDATE — not INSERT/DELETE).
 */
function ArchiveRow({ document, engagementId, onRecoverComplete }: ArchiveRowProps) {
  const [isRecovering, startRecoverTransition] = useTransition();
  const [recoverError, setRecoverError] = useState<string | null>(null);

  function handleRecover() {
    setRecoverError(null);
    startRecoverTransition(async () => {
      const result = await recoverDocumentAction(engagementId, document.id); // ADR-018 // CS-TS-004
      if (result.success) {
        onRecoverComplete(); // Refresh both lists (AC-FILE-006-03: file back in working view)
      } else {
        // CS-GEN-001: surface action-level error only.
        setRecoverError(result.error);
      }
    });
  }

  return (
    <li
      className="px-4 py-3 flex items-center gap-3"
      data-testid={`archive-document-item-${document.id}`}
      data-document-id={document.id}
    >
      {/* File icon */}
      <div className="flex-shrink-0">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="w-5 h-5 text-gray-300"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M4 4a2 2 0 0 1 2-2h4.586A2 2 0 0 1 12 2.586L15.414 6A2 2 0 0 1 16 7.414V16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4Zm2 6a.75.75 0 0 1 .75-.75h6.5a.75.75 0 0 1 0 1.5h-6.5A.75.75 0 0 1 6 10Zm0 3a.75.75 0 0 1 .75-.75h6.5a.75.75 0 0 1 0 1.5h-6.5A.75.75 0 0 1 6 13Z"
            clipRule="evenodd"
          />
        </svg>
      </div>

      {/* Document info */}
      <div className="flex-1 min-w-0">
        {/* GUARDRAIL: originalFilename auto-escaped as JSX text — no dangerouslySetInnerHTML */}
        <span
          className="text-sm font-medium text-gray-400 truncate line-through"
          data-testid={`archive-filename-${document.id}`}
        >
          {document.originalFilename}
        </span>
        <div className="mt-0.5 flex items-center gap-3 text-xs text-gray-300">
          <span>v{document.version}</span>
          <span>{document.contentType}</span>
          <span>Deleted</span>
        </div>

        {/* Recover error message */}
        {recoverError && (
          <div
            className="mt-1 text-xs text-red-600"
            role="alert"
            data-testid={`recover-error-${document.id}`}
          >
            {/* GUARDRAIL: auto-escaped JSX text */}
            {recoverError}
          </div>
        )}
      </div>

      {/* AC-FILE-006-03: Recover control — clears tombstone and restores to working view */}
      <div className="flex-shrink-0">
        <button
          onClick={handleRecover}
          disabled={isRecovering}
          className="px-2 py-1 text-xs text-green-700 border border-green-300 rounded hover:bg-green-50 transition-colors disabled:opacity-50"
          data-testid={`recover-button-${document.id}`}
          aria-label={`Recover ${document.originalFilename}`}
        >
          {isRecovering ? "Recovering…" : "Recover"}
        </button>
      </div>
    </li>
  );
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
