/**
 * apps/admin/src/app/engagements/[engagementId]/documents/_components/DocumentsClientPage.tsx
 *
 * Client-side engagement document list with upload + per-file replace controls.
 *
 * TASK-013-003: Accountant upload + version-replace UI.
 *
 * Acceptance criteria:
 *   AC-FILE-001-01 — the accountant can upload a file; it appears in the engagement's document set.
 *   AC-FILE-009-01 — an existing file can be replaced with a new version.
 *   AC-FILE-009-02 — after replacement, the newest version is presented as the current version.
 *
 * This is the client-interactive shell:
 *   - Renders the document list from `initialDocuments` (server-fetched, passed as props).
 *   - After an upload or replace completes, calls listDocumentsAction to refresh the list.
 *   - UploadControl: new-file upload (AC-FILE-001-01).
 *   - VersionReplaceControl: per-document version replacement (AC-FILE-009-01/-02).
 *
 * ADR-006: Admin-only component — never imported in apps/portal.
 * GUARDRAIL: No dangerouslySetInnerHTML anywhere in this component.
 * GUARDRAIL: engagementId comes from the server-resolved route param — never from client input.
 *
 * data-testid hooks:
 *   data-testid="documents-list"             — document list container
 *   data-testid="documents-empty"            — empty state message
 *   data-testid="document-item-{id}"         — each document row
 *   data-testid="document-filename-{id}"     — filename label
 *   data-testid="document-version-{id}"      — current version badge
 *   data-testid="document-status-{id}"       — status badge (active/pending/infected)
 *   data-testid="upload-section"             — upload control container
 *
 * // ADR-006 // CS-GEN-003
 */

"use client";

import { useState, useCallback, useTransition } from "react";
import { UploadControl } from "./UploadControl";
import { VersionReplaceControl } from "./VersionReplaceControl";
import { DownloadButton } from "./DownloadButton";
import { VersionHistory } from "./VersionHistory";
import { listDocumentsAction } from "../actions";
import type { DocumentItem } from "@tax-portal/db";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DocumentsClientPageProps {
  /** Engagement ID from the server-resolved route param. */
  engagementId: string;
  /** Initial document list — server-fetched before the page is hydrated. */
  initialDocuments: DocumentItem[];
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * DocumentsClientPage — client component for the engagement document list.
 *
 * Shows all documents for the engagement. After upload or replace, refreshes the list
 * via listDocumentsAction so the newest state is reflected without a full page reload.
 *
 * AC-FILE-001-01: uploaded file appears in the document set (after refresh).
 * AC-FILE-009-01: replaced file gets a new version (after refresh shows v+1).
 * AC-FILE-009-02: newest version is shown as current (Document row current pointer — DECISION-013-C).
 */
export function DocumentsClientPage({ engagementId, initialDocuments }: DocumentsClientPageProps) {
  const [documents, setDocuments] = useState<DocumentItem[]>(initialDocuments);
  const [isPending, startTransition] = useTransition();

  // Refresh the document list after an upload or replace completes.
  const refreshDocuments = useCallback(() => {
    startTransition(async () => {
      const result = await listDocumentsAction(engagementId);
      if (result.success) {
        setDocuments(result.data);
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
          onUploadComplete={refreshDocuments}
        />
      </section>

      {/* Document list (AC-FILE-001-01 / AC-FILE-009-01 / AC-FILE-009-02) */}
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
                onReplaceComplete={refreshDocuments}
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
}

/**
 * DocumentRow — renders a single document row with version info + replace control.
 *
 * AC-FILE-009-02: shows current version number (Document row = current pointer, DECISION-013-C).
 * AC-FILE-009-01: per-document VersionReplaceControl.
 *
 * Only 'active' documents show the replace control — 'pending' and 'infected' do not
 * expose a replace option (the upload is not yet resolved).
 */
function DocumentRow({ document, engagementId, onReplaceComplete }: DocumentRowProps) {
  const isActive = document.status === "active";
  const isPending = document.status === "pending";
  const isInfected = document.status === "infected";

  const statusBadge = isActive
    ? { label: "Active", className: "bg-green-100 text-green-700" }
    : isPending
    ? { label: "Processing", className: "bg-amber-100 text-amber-700" }
    : isInfected
    ? { label: "Blocked", className: "bg-red-100 text-red-700" }
    : { label: document.status, className: "bg-gray-100 text-gray-600" };

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

        {/* AC-FILE-009-03: version history — listed below meta; collapsible (TASK-013-005) */}
        {isActive && (
          <VersionHistory
            documentId={document.id}
            engagementId={engagementId}
          />
        )}
      </div>

      {/* AC-FILE-001-03: download + AC-FILE-009-01: replace — active documents only */}
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
        </div>
      )}
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
