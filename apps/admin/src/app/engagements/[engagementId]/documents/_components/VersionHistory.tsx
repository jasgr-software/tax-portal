/**
 * apps/admin/src/app/engagements/[engagementId]/documents/_components/VersionHistory.tsx
 *
 * Version history view — lists all retained DocumentVersion rows for a document.
 * Each prior version is individually downloadable (AC-FILE-009-03).
 *
 * TASK-013-005: Version history (AC-FILE-009-03).
 *
 * AC-FILE-009-03: Every prior version retained + accessible after replacement.
 *   Each DocumentVersion row (supersededAt IS NOT NULL = prior; IS NULL = current)
 *   is listed here. Each prior version is downloadable via requestDownloadUrlAction
 *   using the version's storageKey (supplied from the DocumentVersionItem).
 *
 * ADR-003: listDocumentVersionsAction uses withRequestContext (ACCOUNTANT role).
 * ADR-009: Download uses the authorize-then-sign path — version storageKey is the key
 *   the signed download URL is minted against.
 * ADR-006: Admin-only component — portal has its own mirror (TASK-013-005).
 * CS-TS-003: Mirror discipline — keep version listing consistent with portal VersionHistory.
 *
 * data-testid hooks:
 *   data-testid="version-history-{documentId}"        — outer container
 *   data-testid="version-history-toggle-{documentId}" — show/hide toggle
 *   data-testid="version-history-list-{documentId}"   — the version list (ul)
 *   data-testid="version-item-{versionId}"            — each version row
 *   data-testid="version-label-{versionId}"           — "v{N}" label
 *   data-testid="version-status-{versionId}"          — "Current" or "Superseded"
 *   data-testid="version-download-{versionId}"        — per-version download trigger
 *
 * // ADR-003 // ADR-006 // ADR-009 // CS-TS-003 // AC-FILE-009-03 // CS-GEN-003
 */

"use client";

import { useState, useTransition } from "react";
import { listDocumentVersionsAction, requestDownloadUrlForVersionAction } from "../actions";
import type { DocumentVersionItem } from "@tax-portal/db";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface VersionHistoryProps {
  /** Document id to list version history for. */
  documentId: string;
  /** Engagement id — required for scoping the download authz check. */
  engagementId: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * VersionHistory — collapsible panel showing all DocumentVersion rows.
 *
 * AC-FILE-009-03: After a replacement, every prior version (supersededAt IS NOT NULL)
 *   is listed here. Each version is downloadable (the current version uses the parent
 *   Document storageKey; prior versions use their own DocumentVersion storageKey).
 *
 * The panel is collapsed by default and expanded on click. Versions are loaded lazily
 * (on first expand) to avoid unnecessary DB reads for documents with only one version.
 *
 * // AC-FILE-009-03 // ADR-003 // ADR-009 // CS-TS-003
 */
export function VersionHistory({ documentId, engagementId }: VersionHistoryProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [versions, setVersions] = useState<DocumentVersionItem[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, startLoadTransition] = useTransition();
  const [downloadErrors, setDownloadErrors] = useState<Record<string, string>>({});
  const [downloadPending, setDownloadPending] = useState<Record<string, boolean>>({});

  function handleToggle() {
    if (!isExpanded && versions === null) {
      // First expand — load versions lazily.
      startLoadTransition(async () => {
        const result = await listDocumentVersionsAction(documentId);
        if (result.success) {
          setVersions(result.data);
        } else {
          setLoadError(result.error);
          setVersions([]);
        }
      });
    }
    setIsExpanded((prev) => !prev);
  }

  async function handleVersionDownload(versionId: string) {
    setDownloadErrors((prev) => ({ ...prev, [versionId]: "" }));
    setDownloadPending((prev) => ({ ...prev, [versionId]: true }));

    try {
      // ADR-009: authorize-then-sign on the server; signed URL returned and consumed immediately.
      // SECURITY: pass versionId (DB primary key), NOT storageKey — server resolves the key under RLS.
      // CS-GEN-001: no URL stored or logged.
      const result = await requestDownloadUrlForVersionAction(documentId, engagementId, versionId);
      if (!result.success) {
        setDownloadErrors((prev) => ({ ...prev, [versionId]: result.error }));
        return;
      }
      // Navigate to signed URL immediately — CS-GEN-001: not logged/stored.
      window.location.assign(result.data.url);
    } finally {
      setDownloadPending((prev) => ({ ...prev, [versionId]: false }));
    }
  }

  return (
    <div
      className="mt-2"
      data-testid={`version-history-${documentId}`}
    >
      <button
        type="button"
        onClick={handleToggle}
        className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition-colors"
        aria-expanded={isExpanded}
        data-testid={`version-history-toggle-${documentId}`}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 16 16"
          fill="currentColor"
          className={`w-3 h-3 transition-transform ${isExpanded ? "rotate-90" : ""}`}
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M6.22 4.22a.75.75 0 0 1 1.06 0l3.25 3.25a.75.75 0 0 1 0 1.06l-3.25 3.25a.75.75 0 0 1-1.06-1.06L8.94 8 6.22 5.28a.75.75 0 0 1 0-1.06Z"
            clipRule="evenodd"
          />
        </svg>
        {isLoading ? "Loading…" : "Version history"}
      </button>

      {isExpanded && (
        <div className="mt-1 ml-3 border-l-2 border-gray-100 pl-3">
          {loadError && (
            <p className="text-xs text-red-500">{loadError}</p>
          )}

          {versions !== null && versions.length === 0 && (
            <p className="text-xs text-gray-400">No prior versions.</p>
          )}

          {versions !== null && versions.length > 0 && (
            <ul
              className="space-y-1"
              data-testid={`version-history-list-${documentId}`}
            >
              {versions.map((ver) => {
                const isCurrent = ver.supersededAt === null;
                const isDownloading = downloadPending[ver.id] ?? false;
                const dlError = downloadErrors[ver.id];

                return (
                  <li
                    key={ver.id}
                    className="flex items-center gap-2"
                    data-testid={`version-item-${ver.id}`}
                  >
                    {/* Version label */}
                    <span
                      className="text-xs font-mono text-gray-600 w-6"
                      data-testid={`version-label-${ver.id}`}
                    >
                      v{ver.version}
                    </span>

                    {/* Current / Superseded badge */}
                    <span
                      className={`text-xs px-1 py-0.5 rounded ${
                        isCurrent
                          ? "bg-green-50 text-green-700"
                          : "bg-gray-100 text-gray-500"
                      }`}
                      data-testid={`version-status-${ver.id}`}
                    >
                      {isCurrent ? "Current" : "Superseded"}
                    </span>

                    {/* Uploaded date */}
                    <span className="text-xs text-gray-400">
                      {new Date(ver.createdAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>

                    {/* Per-version download — AC-FILE-009-03: prior versions downloadable */}
                    <button
                      type="button"
                      disabled={isDownloading}
                      onClick={() => handleVersionDownload(ver.id)}
                      className="text-xs text-blue-600 hover:text-blue-800 disabled:opacity-50 disabled:cursor-not-allowed"
                      aria-busy={isDownloading}
                      data-testid={`version-download-${ver.id}`}
                    >
                      {isDownloading ? "Preparing…" : "Download"}
                    </button>

                    {/* Per-version download error */}
                    {dlError && (
                      <span className="text-xs text-red-500">{dlError}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
