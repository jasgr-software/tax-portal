/**
 * apps/admin/src/app/engagements/[engagementId]/documents/_components/VersionReplaceControl.tsx
 *
 * Accountant version-replace control for an existing engagement document.
 *
 * TASK-013-003: Accountant upload + version-replace UI.
 *
 * Acceptance criteria:
 *   AC-FILE-009-01 — an existing file can be replaced with a new version
 *   AC-FILE-009-02 — after replacement, the newest version is presented as current
 *
 * Replace mechanics (mirrors ADR-009 two-phase pipeline, DECISION-013-C):
 *   1. File picker → user selects a replacement file.
 *   2. replaceWithNewVersionAction (server):
 *      - INSERT new DocumentVersion row (new storageKey, new version number).
 *      - SUPERSEDE prior DocumentVersion row (supersededAt = now).
 *      - UPDATE parent Document row (current pointer — DECISION-013-C).
 *      - Returns signed upload URL for the replacement object.
 *   3. Browser PUTs replacement bytes to the signed URL (ADR-009 — no proxy).
 *   4. completeUploadAction (server) → scan-promote gate (ADR-021).
 *   5. Reflect outcome: active | infected | pending.
 *   6. onReplaceComplete() callback → parent reloads document list.
 *
 * ADR-006: Admin-only component — never imported in apps/portal.
 * ADR-009: Client PUTs bytes directly to signed URL; app never proxies.
 * DECISION-013-C: parent Document row = current pointer; prior rows retained.
 * AC-FILE-009-03: Prior version rows are NOT deleted by the replace pipeline.
 *
 * GUARDRAIL: No dangerouslySetInnerHTML anywhere in this component.
 * GUARDRAIL: documentId and engagementId come from the server-resolved page props —
 *   never from client-manufactured input.
 *
 * // ADR-006 // ADR-009 // DECISION-013-C // CS-GEN-003
 */

"use client";

import { useState, useCallback } from "react";
import { replaceWithNewVersionAction, completeUploadAction } from "../actions";

// ─── Types ────────────────────────────────────────────────────────────────────

type ReplaceStatus = "idle" | "uploading" | "completing" | "active" | "infected" | "error";

export interface VersionReplaceControlProps {
  /** Engagement ID from the server-resolved route param (never from client input). */
  engagementId: string;
  /**
   * The Document.id to replace.
   * Must be the server-resolved id from the document list — never from a client form field.
   * ADR-003: engagementId + documentId scope the DB write in replaceWithNewVersionAction.
   */
  documentId: string;
  /** Current filename of the document being replaced (for display/aria label). */
  currentFilename: string;
  /**
   * Called after a successful replacement (outcome='active') so the parent can refresh.
   * AC-FILE-009-02: parent refreshes so the newest version is shown as current.
   */
  onReplaceComplete?: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * VersionReplaceControl — per-document version-replace file picker for the accountant.
 *
 * Renders a compact "Replace" button that triggers the ADR-009 replace pipeline.
 *
 * DECISION-013-C: replaceWithNewVersionAction handles:
 *   - INSERT new DocumentVersion row.
 *   - SUPERSEDE prior DocumentVersion row.
 *   - UPDATE parent Document row (current pointer).
 * After completeUploadAction succeeds with outcome='active', the parent reloads the list
 * so the newest version is presented as current (AC-FILE-009-02).
 *
 * data-testid hooks:
 *   data-testid="version-replace-control-{documentId}"   — root container
 *   data-testid="version-replace-input-{documentId}"     — hidden file input
 *   data-testid="version-replace-button-{documentId}"    — visible button label
 *   data-testid="version-replace-status-{documentId}"    — status message (aria-live)
 *
 * ADR-006: admin-only; never imported in portal.
 * GUARDRAIL: no dangerouslySetInnerHTML.
 */
export function VersionReplaceControl({
  engagementId,
  documentId,
  currentFilename,
  onReplaceComplete,
}: VersionReplaceControlProps) {
  const [status, setStatus] = useState<ReplaceStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      // Reset input so the same file can be re-uploaded after an error.
      e.target.value = "";

      setStatus("uploading");
      setErrorMessage(null);

      // ── Phase 1: replace + mint signed upload URL (DECISION-013-C) ───────────
      // replaceWithNewVersionAction:
      //   - INSERT new DocumentVersion row.
      //   - SUPERSEDE prior DocumentVersion row.
      //   - UPDATE parent Document row.
      //   - Returns signed upload URL for the new object.
      // Wrapped in try/catch to surface server action errors (e.g. missing STORAGE_ADAPTER
      // env var — thrown by getStorage() before returning a result object).
      let replaceResult: Awaited<ReturnType<typeof replaceWithNewVersionAction>>;
      try {
        replaceResult = await replaceWithNewVersionAction(
          engagementId,
          documentId,
          file.name,
          file.type || "application/octet-stream",
          file.size,
        );
      } catch (err: unknown) {
        setStatus("error");
        setErrorMessage(
          err instanceof Error
            ? `Failed to start replacement: ${err.message}`
            : "Failed to start replacement. Please try again.",
        );
        return;
      }

      if (!replaceResult.success) {
        setStatus("error");
        setErrorMessage(replaceResult.error ?? "Failed to start replacement. Please try again.");
        return;
      }

      const { uploadUrl, storageKey, documentId: docId } = replaceResult.data;

      // ── Phase 2: PUT replacement bytes to signed URL (ADR-009 — browser, no proxy) ──
      // AbortController ensures the PUT does not hang indefinitely if the storage
      // endpoint is unreachable (BUG-008-001: Azurite Docker-internal hostname
      // unreachable from host browser when BLOB_PUBLIC_ENDPOINT is not set).
      // 20s timeout surfaces the error quickly; the scan gate runs in Phase 3.
      const putController = new AbortController();
      const putTimeout = setTimeout(() => putController.abort(), 20_000);

      try {
        const putResponse = await fetch(uploadUrl, {
          method: "PUT",
          body: file,
          signal: putController.signal,
          headers: {
            "Content-Type": file.type || "application/octet-stream",
            // Azure Blob Storage (and Azurite) require this header for block blob uploads.
            "x-ms-blob-type": "BlockBlob",
          },
        });

        if (!putResponse.ok) {
          throw new Error(
            `Storage PUT failed: ${putResponse.status} ${putResponse.statusText}`,
          );
        }
      } catch (err: unknown) {
        setStatus("error");
        const message =
          err instanceof DOMException && err.name === "AbortError"
            ? "Upload to storage timed out. The storage service may be unreachable."
            : err instanceof Error
              ? `Upload to storage failed: ${err.message}`
              : "Upload to storage failed. Please try again.";
        setErrorMessage(message);
        return;
      } finally {
        clearTimeout(putTimeout);
      }

      // ── Phase 3: complete (scan-promote gate — ADR-021) ───────────────────────
      setStatus("completing");

      let completeResult: Awaited<ReturnType<typeof completeUploadAction>>;
      try {
        completeResult = await completeUploadAction(engagementId, docId, storageKey);
      } catch (err: unknown) {
        setStatus("error");
        setErrorMessage(
          err instanceof Error
            ? `Version replacement completion failed: ${err.message}`
            : "Version replacement completion failed. Please try again.",
        );
        return;
      }

      if (!completeResult.success) {
        setStatus("error");
        setErrorMessage(completeResult.error ?? "Version replacement completion failed. Please try again.");
        return;
      }

      // ── Phase 4: reflect outcome ───────────────────────────────────────────────
      const { outcome } = completeResult.data;

      if (outcome === "active") {
        // AC-FILE-009-02: parent refreshes so newest version is shown as current.
        setStatus("active");
        onReplaceComplete?.();
      } else if (outcome === "infected") {
        // AC-NFR-009-02: malicious replacement withheld + uploader informed.
        setStatus("infected");
        setErrorMessage(
          "The replacement file was rejected because it was found to contain malicious content and has been blocked. Please upload a clean file.",
        );
      } else {
        // outcome === "pending" — scan indeterminate (fail-closed).
        setStatus("error");
        setErrorMessage("The replacement file is being processed. Please refresh the page in a moment.");
      }
    },
    [engagementId, documentId, onReplaceComplete],
  );

  const isUploading = status === "uploading" || status === "completing";

  return (
    <div data-testid={`version-replace-control-${documentId}`}>
      {/* Error/infected status */}
      {errorMessage && (
        <div
          role="alert"
          className="mb-1 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700"
          data-testid={`version-replace-error-${documentId}`}
        >
          {/* GUARDRAIL: no dangerouslySetInnerHTML */}
          {errorMessage}
        </div>
      )}

      {/* Replace button label */}
      <label
        className={[
          "inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium cursor-pointer select-none",
          isUploading
            ? "bg-gray-100 text-gray-400 cursor-not-allowed"
            : "bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100",
        ].join(" ")}
        aria-busy={isUploading}
        data-testid={`version-replace-button-${documentId}`}
        // GUARDRAIL: currentFilename auto-escaped in aria-label attribute
        aria-label={`Replace "${currentFilename}" with a new version`}
      >
        {isUploading ? (
          <>
            <svg
              className="w-3 h-3 animate-spin"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4Z"
              />
            </svg>
            {status === "uploading" ? "Uploading…" : "Processing…"}
          </>
        ) : (
          <>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="w-3 h-3"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M15.312 11.424a5.5 5.5 0 0 1-9.201 2.466l-.312-.311h2.433a.75.75 0 0 0 0-1.5H3.989a.75.75 0 0 0-.75.75v4.242a.75.75 0 0 0 1.5 0v-2.43l.31.31a7 7 0 0 0 11.712-3.138.75.75 0 0 0-1.449-.39Zm1.23-3.723a.75.75 0 0 0 .219-.53V2.929a.75.75 0 0 0-1.5 0V5.36l-.31-.31A7 7 0 0 0 3.239 8.188a.75.75 0 1 0 1.448.389A5.5 5.5 0 0 1 13.89 6.11l.311.31h-2.432a.75.75 0 0 0 0 1.5h4.243a.75.75 0 0 0 .53-.219Z"
                clipRule="evenodd"
              />
            </svg>
            Replace
          </>
        )}
        {/* AC-FILE-002-01: no accept restriction — any file type */}
        <input
          type="file"
          className="sr-only"
          disabled={isUploading}
          onChange={handleFileChange}
          data-testid={`version-replace-input-${documentId}`}
          aria-label={`Select a replacement file for "${currentFilename}"`}
        />
      </label>

      {/* Screen-reader live region */}
      <span
        className="sr-only"
        aria-live="polite"
        data-testid={`version-replace-status-${documentId}`}
      >
        {status === "uploading" && "Uploading replacement file…"}
        {status === "completing" && "Processing replacement…"}
        {status === "active" && "File replaced successfully."}
        {status === "infected" && "Replacement file was rejected: malicious content detected."}
        {status === "error" && "Replacement failed."}
      </span>
    </div>
  );
}
