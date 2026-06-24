/**
 * apps/portal/src/app/engagements/[engagementId]/documents/_components/DownloadButton.tsx
 *
 * Portal download control — requests a signed download URL for a document and navigates to it.
 *
 * TASK-013-005: Both-surface download (AC-FILE-001-04 — client participant downloads their files).
 *
 * ADR-009: Authorize-then-sign — signed URL is minted server-side after the CLIENT's identity
 *   and document access are verified through fn_document_access (TASK-013-001).
 * ADR-003: requestDownloadUrlAction uses withRequestContext (CLIENT role).
 * ADR-006: This component is apps/portal — mirrors DownloadButton in apps/admin (CS-TS-003).
 * CS-GEN-001: Signed URL is NOT logged — used only for browser navigation.
 * CS-TS-003: Mirror discipline — keep signed-URL handling consistent with admin DownloadButton.
 *
 * data-testid hooks:
 *   data-testid="portal-download-button-{documentId}"  — the download trigger button
 *   data-testid="portal-download-error-{documentId}"   — error message when download fails
 *
 * // ADR-003 // ADR-006 // ADR-009 // CS-GEN-001 // CS-TS-003 // CS-GEN-003 // AC-FILE-001-04
 */

"use client";

import { useState, useTransition } from "react";
import { requestDownloadUrlAction } from "../actions";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DownloadButtonProps {
  /** Document id to download. */
  documentId: string;
  /** Engagement id — required for the authorize-then-sign scope check. */
  engagementId: string;
  /** Display label (defaults to "Download"). */
  label?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * DownloadButton (portal) — triggers a signed-URL download for an active document.
 *
 * AC-FILE-001-04: A client participant downloads their engagement's file over the
 *   authorize-then-sign path. The fn_document_access predicate (TASK-013-001) grants
 *   access to both the engagement owner and any linked participant.
 *   An unrelated client gets { authorized: false, reason: "rls-filtered" } → error shown.
 *
 * Mirrors the admin DownloadButton behavior exactly (CS-TS-003 / ADR-006 mirror discipline).
 *
 * // ADR-003 // ADR-009 // CS-GEN-001 // CS-TS-003 // AC-FILE-001-04
 */
export function DownloadButton({
  documentId,
  engagementId,
  label = "Download",
}: DownloadButtonProps) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleDownload() {
    setError(null);
    startTransition(async () => {
      // ADR-009: server action mints the signed URL (authorize-then-sign).
      // CS-GEN-001: the signed URL is NEVER logged — used only for navigation.
      const result = await requestDownloadUrlAction(documentId, engagementId);

      if (!result.success) {
        setError(result.error);
        return;
      }

      // Navigate to the signed URL — the browser handles the download.
      // ADR-009: URL consumed immediately; not stored in state.
      window.location.assign(result.data.url);
    });
  }

  return (
    <div>
      <button
        type="button"
        disabled={isPending}
        onClick={handleDownload}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        aria-busy={isPending}
        data-testid={`portal-download-button-${documentId}`}
      >
        {/* Download icon */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 16 16"
          fill="currentColor"
          className="w-3.5 h-3.5"
          aria-hidden="true"
        >
          <path d="M8.75 2.75a.75.75 0 0 0-1.5 0v5.69L5.03 6.22a.75.75 0 0 0-1.06 1.06l3.5 3.5a.75.75 0 0 0 1.06 0l3.5-3.5a.75.75 0 0 0-1.06-1.06L8.75 8.44V2.75Z" />
          <path d="M3.5 9.75a.75.75 0 0 0-1.5 0v1.5A2.75 2.75 0 0 0 4.75 14h6.5A2.75 2.75 0 0 0 14 11.25v-1.5a.75.75 0 0 0-1.5 0v1.5c0 .69-.56 1.25-1.25 1.25h-6.5c-.69 0-1.25-.56-1.25-1.25v-1.5Z" />
        </svg>
        {isPending ? "Preparing…" : label}
      </button>

      {/* Error message */}
      {/* GUARDRAIL: error is a server-side string, auto-escaped as JSX text */}
      {error && (
        <p
          className="mt-1 text-xs text-red-600"
          role="alert"
          data-testid={`portal-download-error-${documentId}`}
        >
          {error}
        </p>
      )}
    </div>
  );
}
