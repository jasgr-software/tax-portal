/**
 * apps/portal/src/app/engagements/[engagementId]/documents/_components/VersionHistory.tsx
 *
 * Portal version history panel — lists all retained DocumentVersion rows for a document.
 * Each version is individually downloadable (AC-FILE-009-03).
 *
 * TASK-013-005: Version history (AC-FILE-009-03), portal surface.
 *
 * Mirrors apps/admin/.../documents/_components/VersionHistory.tsx (CS-TS-003 / ADR-006).
 * Uses portal-side actions (requestDownloadUrlForVersionAction, listDocumentVersionsAction).
 *
 * AC-FILE-009-03: Every prior version retained + accessible after replacement.
 * ADR-003: Portal actions use withRequestContext (CLIENT role).
 * ADR-009: Download uses the authorize-then-sign path.
 * CS-TS-003: Mirror discipline — keep version listing consistent with admin surface.
 *
 * data-testid hooks:
 *   data-testid="portal-version-history-{documentId}"        — outer container
 *   data-testid="portal-version-history-toggle-{documentId}" — show/hide toggle
 *   data-testid="portal-version-history-list-{documentId}"   — the version list (ul)
 *   data-testid="portal-version-item-{versionId}"            — each version row
 *   data-testid="portal-version-label-{versionId}"           — "v{N}" label
 *   data-testid="portal-version-status-{versionId}"          — "Current" or "Superseded"
 *   data-testid="portal-version-download-{versionId}"        — per-version download trigger
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
 * VersionHistory (portal) — collapsible panel showing all DocumentVersion rows.
 *
 * AC-FILE-009-03: After replacement, every prior version (supersededAt IS NOT NULL)
 *   is listed and downloadable by the client participant.
 *
 * Mirrors the admin VersionHistory component (CS-TS-003).
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

  async function handleVersionDownload(versionId: string, storageKey: string) {
    setDownloadErrors((prev) => ({ ...prev, [versionId]: "" }));
    setDownloadPending((prev) => ({ ...prev, [versionId]: true }));

    try {
      // ADR-009: authorize-then-sign on the server; signed URL consumed immediately.
      // CS-GEN-001: no URL stored or logged.
      const result = await requestDownloadUrlForVersionAction(documentId, engagementId, storageKey);
      if (!result.success) {
        setDownloadErrors((prev) => ({ ...prev, [versionId]: result.error }));
        return;
      }
      // Navigate to signed URL immediately.
      window.location.assign(result.data.url);
    } finally {
      setDownloadPending((prev) => ({ ...prev, [versionId]: false }));
    }
  }

  return (
    <div
      className="mt-2"
      data-testid={`portal-version-history-${documentId}`}
    >
      <button
        type="button"
        onClick={handleToggle}
        className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition-colors"
        aria-expanded={isExpanded}
        data-testid={`portal-version-history-toggle-${documentId}`}
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
              data-testid={`portal-version-history-list-${documentId}`}
            >
              {versions.map((ver) => {
                const isCurrent = ver.supersededAt === null;
                const isDownloading = downloadPending[ver.id] ?? false;
                const dlError = downloadErrors[ver.id];

                return (
                  <li
                    key={ver.id}
                    className="flex items-center gap-2"
                    data-testid={`portal-version-item-${ver.id}`}
                  >
                    <span
                      className="text-xs font-mono text-gray-600 w-6"
                      data-testid={`portal-version-label-${ver.id}`}
                    >
                      v{ver.version}
                    </span>

                    <span
                      className={`text-xs px-1 py-0.5 rounded ${
                        isCurrent
                          ? "bg-green-50 text-green-700"
                          : "bg-gray-100 text-gray-500"
                      }`}
                      data-testid={`portal-version-status-${ver.id}`}
                    >
                      {isCurrent ? "Current" : "Superseded"}
                    </span>

                    <span className="text-xs text-gray-400">
                      {new Date(ver.createdAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>

                    {/* AC-FILE-009-03: per-version download */}
                    <button
                      type="button"
                      disabled={isDownloading}
                      onClick={() => handleVersionDownload(ver.id, ver.storageKey)}
                      className="text-xs text-blue-600 hover:text-blue-800 disabled:opacity-50 disabled:cursor-not-allowed"
                      aria-busy={isDownloading}
                      data-testid={`portal-version-download-${ver.id}`}
                    >
                      {isDownloading ? "Preparing…" : "Download"}
                    </button>

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
