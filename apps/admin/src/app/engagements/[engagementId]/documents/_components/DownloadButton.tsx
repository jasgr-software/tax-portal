/**
 * apps/admin/src/app/engagements/[engagementId]/documents/_components/DownloadButton.tsx
 *
 * Admin download control — requests a signed download URL for a document and navigates
 * to it so the browser downloads the file.
 *
 * TASK-013-005: Both-surface download (AC-FILE-001-03 — accountant downloads any file).
 *
 * ADR-009: Authorize-then-sign discipline — the signed URL is minted server-side after
 *   the caller's identity and document ownership are verified. The URL is never stored;
 *   it is consumed immediately by `window.location.assign`.
 * ADR-003: requestDownloadUrlAction uses withRequestContext (ACCOUNTANT role).
 * ADR-006: This component is apps/admin ONLY. Portal has its own mirror (TASK-013-005).
 * CS-GEN-001: Signed URL is NOT logged — used only for the browser navigation.
 * CS-TS-003: Mirror discipline — keep signed-URL handling consistent with portal DownloadButton.
 *
 * data-testid hooks:
 *   data-testid="download-button-{documentId}"  — the download trigger button
 *   data-testid="download-error-{documentId}"   — error message when download fails
 *
 * // ADR-003 // ADR-006 // ADR-009 // CS-GEN-001 // CS-TS-003 // CS-GEN-003
 */

"use client";

import { useState, useTransition } from "react";
import { requestDownloadUrlAction } from "../actions";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DownloadButtonProps {
  /** Document id to download. */
  documentId: string;
  /** Engagement id — required by authorizeThenSignDownload for belt-and-suspenders scope. */
  engagementId: string;
  /** Display label (defaults to "Download"). */
  label?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * DownloadButton — triggers a signed-URL download for an active document.
 *
 * AC-FILE-001-03: The accountant can download any engagement's file over the
 *   authorize-then-sign path. The component calls requestDownloadUrlAction which
 *   runs authorizeThenSignDownload on the request pool (ACCOUNTANT identity from
 *   the verified session) and returns a time-limited signed URL.
 *
 * ADR-009: The URL is used immediately via window.location.assign; it is never
 *   stored in state or logged (CS-GEN-001).
 * ADR-003: Identity comes from the verified session inside the server action.
 *
 * // ADR-003 // ADR-009 // CS-GEN-001 // CS-TS-003 // AC-FILE-001-03
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

      // Navigate to the signed URL — the browser handles the download disposition.
      // ADR-009: URL consumed immediately; not stored in state.
      // CS-GEN-001: no URL in state, no URL logged.
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
        data-testid={`download-button-${documentId}`}
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

      {/* Error message — shown when the server action returns { success: false } */}
      {/* GUARDRAIL: error is a server-side string, auto-escaped as JSX text — no dangerouslySetInnerHTML */}
      {error && (
        <p
          className="mt-1 text-xs text-red-600"
          role="alert"
          data-testid={`download-error-${documentId}`}
        >
          {error}
        </p>
      )}
    </div>
  );
}
