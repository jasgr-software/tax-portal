/**
 * apps/admin/src/app/engagements/[engagementId]/documents/_components/UploadControl.tsx
 *
 * Accountant file upload control for the engagement document surface.
 *
 * TASK-013-003: Accountant upload + version-replace UI.
 *
 * Acceptance criteria:
 *   AC-FILE-001-01 — the accountant can upload a file to an engagement
 *
 * Upload mechanics (mirrors portal DocumentUploadStep.tsx pattern — ADR-009):
 *   1. File picker → user selects a file.
 *   2. requestUploadUrlAction (server) → signed upload URL + documentId + storageKey.
 *   3. Browser PUTs bytes directly to the signed URL (app never proxies bytes — ADR-009).
 *   4. completeUploadAction (server) → scan-promote gate (ADR-021).
 *   5. Reflect outcome: active | infected | pending.
 *   6. onUploadComplete() callback → parent reloads document list.
 *
 * ADR-006: Admin-only component — never imported in apps/portal.
 *   Upload surface is ONLY in apps/admin. (Download is TASK-013-005.)
 * ADR-009: Client PUTs bytes directly to signed URL; app never proxies.
 * ADR-021: completeUploadAction drives the scan-before-available gate.
 *
 * GUARDRAIL: No dangerouslySetInnerHTML anywhere in this component.
 * GUARDRAIL: No client-supplied engagementId — engagementId comes from the route prop.
 *   The server actions re-resolve the engagement from SESSION_CONTEXT (ADR-003).
 *
 * // ADR-006 // ADR-009 // ADR-021 // CS-GEN-003
 */

"use client";

import { useState, useCallback } from "react";
import { requestUploadUrlAction, completeUploadAction } from "../actions";

// ─── Types ────────────────────────────────────────────────────────────────────

type UploadStatus = "idle" | "uploading" | "completing" | "active" | "infected" | "error";

export interface UploadControlProps {
  /** Engagement ID from the server-resolved route param (never from client input). */
  engagementId: string;
  /** Called after a successful upload (outcome='active') so the parent can refresh. */
  onUploadComplete?: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * UploadControl — file picker + ADR-009 two-phase upload control for the accountant.
 *
 * Phases:
 *   1. File selected → requestUploadUrlAction → signed URL.
 *   2. Browser PUT to signed URL (ADR-009 — no proxy).
 *   3. completeUploadAction → scan-promote (ADR-021).
 *   4. Reflect outcome.
 *
 * data-testid hooks:
 *   data-testid="upload-control"       — root container
 *   data-testid="upload-file-input"    — hidden file input
 *   data-testid="upload-label-button"  — visible button label
 *   data-testid="upload-status"        — status message (aria-live)
 *
 * ADR-006: admin-only; never imported in portal.
 * GUARDRAIL: no dangerouslySetInnerHTML.
 */
export function UploadControl({ engagementId, onUploadComplete }: UploadControlProps) {
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      // Reset input so the same file can be re-uploaded after an error.
      e.target.value = "";

      setStatus("uploading");
      setErrorMessage(null);
      setSuccessMessage(null);

      // ── Phase 1: request signed upload URL ───────────────────────────────────
      // Wrapped in try/catch to surface server action errors (e.g. missing STORAGE_ADAPTER
      // env var — thrown by getStorage() before returning a result object).
      let urlResult: Awaited<ReturnType<typeof requestUploadUrlAction>>;
      try {
        urlResult = await requestUploadUrlAction(
          engagementId,
          file.name,
          file.type || "application/octet-stream",
          file.size,
        );
      } catch (err: unknown) {
        setStatus("error");
        setErrorMessage(
          err instanceof Error
            ? `Failed to start upload: ${err.message}`
            : "Failed to start upload. Please try again.",
        );
        return;
      }

      if (!urlResult.success) {
        setStatus("error");
        setErrorMessage(urlResult.error ?? "Failed to start upload. Please try again.");
        return;
      }

      const { documentId, uploadUrl, storageKey } = urlResult.data;

      // ── Phase 2: PUT bytes to signed URL (ADR-009 — browser, no proxy) ───────
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
        completeResult = await completeUploadAction(engagementId, documentId, storageKey);
      } catch (err: unknown) {
        setStatus("error");
        setErrorMessage(
          err instanceof Error
            ? `Upload completion failed: ${err.message}`
            : "Upload completion failed. Please try again.",
        );
        return;
      }

      if (!completeResult.success) {
        setStatus("error");
        setErrorMessage(completeResult.error ?? "Upload completion failed. Please try again.");
        return;
      }

      // ── Phase 4: reflect outcome ───────────────────────────────────────────────
      const { outcome } = completeResult.data;

      if (outcome === "active") {
        setStatus("active");
        setSuccessMessage(`"${file.name}" uploaded successfully.`);
        onUploadComplete?.();
      } else if (outcome === "infected") {
        // AC-NFR-009-02: malicious file withheld + uploader informed.
        setStatus("infected");
        setErrorMessage(
          "The file was rejected because it was found to contain malicious content and has been blocked. Please upload a clean file.",
        );
      } else {
        // outcome === "pending" — scan indeterminate (fail-closed).
        setStatus("error");
        setErrorMessage("The file is being processed. Please refresh the page in a moment.");
      }
    },
    [engagementId, onUploadComplete],
  );

  const isUploading = status === "uploading" || status === "completing";

  return (
    <div data-testid="upload-control">
      {/* Status messages */}
      {errorMessage && (
        <div
          role="alert"
          className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          data-testid="upload-error-message"
        >
          {/* GUARDRAIL: no dangerouslySetInnerHTML — auto-escaped JSX text */}
          {errorMessage}
        </div>
      )}

      {successMessage && (
        <div
          role="status"
          aria-live="polite"
          className="mb-3 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700"
          data-testid="upload-success-message"
        >
          {/* GUARDRAIL: no dangerouslySetInnerHTML */}
          {successMessage}
        </div>
      )}

      {/* File picker label/button */}
      {/* AC-FILE-002-01: no accept restriction (any file type) */}
      <label
        className={[
          "inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium cursor-pointer select-none",
          isUploading
            ? "bg-gray-200 text-gray-400 cursor-not-allowed"
            : "bg-blue-600 text-white hover:bg-blue-700",
        ].join(" ")}
        aria-busy={isUploading}
        data-testid="upload-label-button"
        aria-label="Upload a file to this engagement"
      >
        {isUploading ? (
          <>
            <svg
              className="w-4 h-4 animate-spin"
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
              className="w-4 h-4"
              aria-hidden="true"
            >
              <path d="M9.25 13.25a.75.75 0 0 0 1.5 0V4.636l2.955 3.129a.75.75 0 0 0 1.09-1.03l-4.25-4.5a.75.75 0 0 0-1.09 0l-4.25 4.5a.75.75 0 1 0 1.09 1.03L9.25 4.636v8.614Z" />
              <path d="M3.5 12.75a.75.75 0 0 0-1.5 0v2.5A2.75 2.75 0 0 0 4.75 18h10.5A2.75 2.75 0 0 0 18 15.25v-2.5a.75.75 0 0 0-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5Z" />
            </svg>
            Upload file
          </>
        )}
        {/* AC-FILE-002-01: no accept restriction — any file type */}
        <input
          type="file"
          className="sr-only"
          disabled={isUploading}
          onChange={handleFileChange}
          data-testid="upload-file-input"
          aria-label="Select a file to upload"
        />
      </label>

      {/* Screen-reader live region for upload status */}
      <span
        className="sr-only"
        aria-live="polite"
        data-testid="upload-status"
      >
        {status === "uploading" && "Uploading file…"}
        {status === "completing" && "Processing upload…"}
        {status === "active" && "File uploaded successfully."}
        {status === "infected" && "File was rejected: malicious content detected."}
        {status === "error" && "Upload failed."}
      </span>
    </div>
  );
}
