/**
 * apps/portal/src/app/onboarding/_components/DocumentUploadStep.tsx
 *
 * Renders the document-upload step for the onboarding sequence.
 *
 * AC-ONBD-004-01 UI: Displays the engagement's document checklist.
 * AC-ONBD-004-02 UI: Shows outstanding vs. provided items.
 * AC-ONBD-004-03 UI: Client uploads any-type file to fulfill a request.
 * AC-FILE-007-02 UI: Each document request label is shown.
 * AC-FILE-007-03 UI: Upload widget per request to fulfill it.
 * AC-FILE-008-02 UI: Outstanding vs. fulfilled visually distinguished.
 * AC-FILE-008-03 UI: Fulfilled request leaves the outstanding set.
 * AC-FILE-002-01 UI: No file-type accept restriction on the file picker.
 * AC-NFR-009-02 UI: Infected/withheld file → rejection message to the uploader.
 *
 * GUARDRAIL: This component does NOT compute its own accessibility gate.
 *   It reflects the `accessible` + `done` flags passed down from OnboardingReadModel (TASK-005-005).
 *   If `accessible: false` (letter unsigned), it renders the EPIC-005 locked-step affordance.
 *   The real gate is server-side: requestUploadUrlAction / completeUploadAction call
 *   checkStepAccessibility (EPIC-005 letter hard gate) — a client bypassing the UI is refused.
 *
 * GUARDRAIL: No `dangerouslySetInnerHTML`. Document labels are accountant-authored text
 *   and are rendered as auto-escaped JSX text nodes (ADR-024 §6 content boundary).
 *
 * ADR-006: Portal-only client component — never imported in apps/admin.
 * ADR-001/ADR-005: No client-supplied ids. Checklist resolved server-side.
 * ADR-009: Client PUTs bytes directly to the signed upload URL; the app never proxies bytes.
 *
 * Mirror of QuestionnaireStep.tsx shape (TASK-007-006 dispatch contract):
 *   - Props: stepState, checklist, onUploadComplete
 *   - Four states: LOCKED, AWAITING, SATISFIED, ACTIVE
 */

"use client";

import { useState, useTransition, useCallback } from "react";
import {
  getChecklistAction,
  requestUploadUrlAction,
  completeUploadAction,
} from "../actions";
import type { ChecklistReadModel } from "@tax-portal/db";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DocumentUploadStepState {
  /** Whether the step is accessible (letter signed — from OnboardingReadModel). */
  accessible: boolean;
  /** Whether the document-upload step is done (all required provided — from OnboardingReadModel). */
  done: boolean;
}

export interface DocumentUploadStepProps {
  /**
   * Step accessibility + done flags from the EPIC-005 OnboardingReadModel.
   * GUARDRAIL: This component does NOT re-derive the gate — it consumes what the server returns.
   */
  stepState: DocumentUploadStepState;
  /**
   * The resolved checklist read model for this client's engagement.
   * null → awaiting state (no requests authored yet, or resolution failed).
   *
   * ADR-001/ADR-005: resolved server-side; never from a client-supplied id.
   */
  checklist: ChecklistReadModel | null;
  /**
   * Optional callback: called after a successful upload (for parent observation / testing).
   */
  onUploadComplete?: (() => void) | undefined;
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * DocumentUploadStep — client component for the document-upload step.
 *
 * Renders four states (all required by AC-ONBD-004-01/-02/-03 and the design contract):
 *
 *   1. LOCKED (accessible: false)     — EPIC-005 gate not passed; shows locked affordance.
 *   2. AWAITING (no requests yet)     — no document requests authored; empty state.
 *   3. SATISFIED (done: true)         — all required items provided; read-only satisfied state.
 *   4. ACTIVE (accessible: true)      — active upload interface.
 *
 * GUARDRAIL: No dangerouslySetInnerHTML anywhere in this component.
 * GUARDRAIL: No client-derived gate logic (accessible flag comes from OnboardingReadModel).
 * GUARDRAIL: No client-supplied ids — requestUploadUrlAction is called without ids from the client.
 */
export function DocumentUploadStep({
  stepState,
  checklist,
  onUploadComplete,
}: DocumentUploadStepProps) {
  // ── State 1: LOCKED — EPIC-005 gate not passed ────────────────────────────
  // GUARDRAIL: reflect accessible from the OnboardingReadModel; never compute it here.
  if (!stepState.accessible) {
    return <DocumentUploadLockedState />;
  }

  // ── State 2: AWAITING — no document requests authored yet ─────────────────
  // accessible=true but no checklist or checklist has zero items.
  if (!checklist) {
    return <DocumentUploadAwaitingState />;
  }

  // ── State 3: SATISFIED — all required items provided ─────────────────────
  // Reflect the done flag from the OnboardingReadModel (server-computed).
  if (stepState.done && checklist.items.length > 0) {
    return <DocumentUploadSatisfiedState checklist={checklist} />;
  }

  // ── State 4: ACTIVE — upload interface ───────────────────────────────────
  return (
    <DocumentUploadActive
      checklist={checklist}
      onUploadComplete={onUploadComplete}
    />
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

/**
 * DocumentUploadLockedState — rendered when accessible: false (letter not signed).
 *
 * Presentation-only affordance — the real gate is server-side.
 * data-testid: "document-upload-locked" + "lock-message-document-upload" for e2e.
 */
function DocumentUploadLockedState() {
  return (
    <div data-testid="document-upload-locked">
      <p
        className="text-sm text-gray-500 mt-1"
        data-testid="lock-message-document-upload"
      >
        Sign the engagement letter to unlock this step.
      </p>
    </div>
  );
}

/**
 * DocumentUploadAwaitingState — rendered when checklist is null/empty.
 *
 * Shown when the accountant has not yet authored any document requests for the engagement
 * (AC-ONBD-004-01 clean null case).
 */
function DocumentUploadAwaitingState() {
  return (
    <div
      className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800"
      data-testid="document-upload-awaiting"
    >
      <p className="font-medium">No document requests yet</p>
      <p className="mt-1 text-amber-700">
        Your accountant has not yet added document requests for this engagement.
        Please check back shortly.
      </p>
    </div>
  );
}

/**
 * DocumentUploadSatisfiedState — read-only satisfied view when all items provided.
 *
 * AC-ONBD-004-04: Shows a satisfied state when all required items are provided.
 */
function DocumentUploadSatisfiedState({
  checklist,
}: {
  checklist: ChecklistReadModel;
}) {
  return (
    <div
      data-testid="document-upload-satisfied"
      data-step="document-upload"
      data-upload-done="true"
    >
      <div
        className="flex items-center gap-2 text-sm font-medium text-green-700 mb-4"
        data-testid="document-upload-done-confirmation"
        aria-live="polite"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="w-5 h-5"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z"
            clipRule="evenodd"
          />
        </svg>
        All documents provided
      </div>
      {/* Read-only checklist — all fulfilled */}
      <ul className="space-y-2" data-testid="checklist-items">
        {checklist.items.map((item) => (
          <li
            key={item.requestId}
            className="flex items-center gap-2 text-sm text-gray-700"
            data-testid={`checklist-item-${item.requestId}`}
            data-request-id={item.requestId}
            data-status={item.status}
          >
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-green-100 text-green-700 text-xs font-semibold">
              ✓
            </span>
            {/* Auto-escaped JSX text — NEVER dangerouslySetInnerHTML (ADR-024 §6) */}
            <span>{item.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Per-request upload state ──────────────────────────────────────────────────

type UploadStatus =
  | "idle"
  | "uploading"
  | "completing"
  | "active"
  | "infected"
  | "error";

interface RequestUploadState {
  status: UploadStatus;
  errorMessage: string | null;
}

/**
 * DocumentUploadActive — the active checklist + per-request upload interface.
 *
 * AC-ONBD-004-01: Shows the checklist the accountant defined.
 * AC-ONBD-004-02: Outstanding vs. fulfilled items distinguished.
 * AC-ONBD-004-03: Client uploads to fulfill a request.
 * AC-FILE-002-01: No format allow-list — file picker accepts any type.
 * AC-NFR-009-02: If outcome=infected, shows rejection message; request stays outstanding.
 */
function DocumentUploadActive({
  checklist,
  onUploadComplete,
}: {
  checklist: ChecklistReadModel;
  onUploadComplete?: (() => void) | undefined;
}) {
  // Per-request upload state (keyed by requestId).
  const [uploadStates, setUploadStates] = useState<
    Record<string, RequestUploadState>
  >(() => {
    const initial: Record<string, RequestUploadState> = {};
    for (const item of checklist.items) {
      initial[item.requestId] = { status: "idle", errorMessage: null };
    }
    return initial;
  });

  // Whether a refresh of the checklist is pending (after upload completes).
  const [isPendingRefresh, startRefresh] = useTransition();
  const [localChecklist, setLocalChecklist] =
    useState<ChecklistReadModel>(checklist);

  // Refresh the checklist after a successful upload by calling the server.
  const refreshChecklist = useCallback(() => {
    startRefresh(async () => {
      const result = await getChecklistAction();
      if (result.success) {
        setLocalChecklist(result.data);
      }
      onUploadComplete?.();
    });
  }, [onUploadComplete]);

  const setRequestState = useCallback(
    (requestId: string, update: Partial<RequestUploadState>) => {
      setUploadStates((prev) => ({
        ...prev,
        [requestId]: { ...(prev[requestId] ?? { status: "idle", errorMessage: null }), ...update },
      }));
    },
    [],
  );

  /**
   * Handle file selection + full upload pipeline for a single request.
   *
   * ADR-009 two-phase flow:
   *   1. requestUploadUrlAction — authorize + pending insert + signed upload URL.
   *   2. Client PUTs bytes directly to the signed URL (never proxied by the app).
   *   3. completeUploadAction — scan-promote gate (ADR-021).
   *   4. Reflect outcome: active (fulfilled) | infected (rejection surface, AC-NFR-009-02).
   *
   * GUARDRAIL: requestId comes from the server-resolved checklist prop — never from
   *   a client-supplied form field. The server actions re-resolve the engagement
   *   from SESSION_CONTEXT (ADR-001/ADR-005).
   */
  const handleFileUpload = useCallback(
    async (requestId: string, file: File) => {
      setRequestState(requestId, { status: "uploading", errorMessage: null });

      // ── Phase 1: authorize + pending insert + signed upload URL ───────────
      const uploadUrlResult = await requestUploadUrlAction({
        requestId,
        filename: file.name,
        // DECISION (TASK-007-006): Content-type from the File object (browser-declared).
        // AC-FILE-002-01: any type accepted — the server never rejects by content-type.
        // The server records it for stat() during completeUpload; MIME mismatch detection
        // is in the scan gate (ADR-021) not here.
        contentType: file.type || "application/octet-stream",
        sizeBytes: file.size,
      });

      if (!uploadUrlResult.success) {
        setRequestState(requestId, {
          status: "error",
          errorMessage:
            uploadUrlResult.error ?? "Failed to start upload. Please try again.",
        });
        return;
      }

      const { documentId, uploadUrl, storageKey } = uploadUrlResult.data;

      // ── Phase 2: PUT bytes directly to storage (app never proxies bytes — ADR-009) ──
      try {
        const putResponse = await fetch(uploadUrl, {
          method: "PUT",
          body: file,
          headers: {
            "Content-Type": file.type || "application/octet-stream",
            // Azure Blob Storage (and Azurite) require this header for block blob uploads.
            // Without it, Azurite returns HTTP 400 (BlobTypeNotSupported / missing blob type).
            "x-ms-blob-type": "BlockBlob",
          },
        });

        if (!putResponse.ok) {
          throw new Error(
            `Storage PUT failed: ${putResponse.status} ${putResponse.statusText}`,
          );
        }
      } catch (err: unknown) {
        setRequestState(requestId, {
          status: "error",
          errorMessage:
            err instanceof Error
              ? `Upload to storage failed: ${err.message}`
              : "Upload to storage failed. Please try again.",
        });
        return;
      }

      // ── Phase 3: complete (scan-promote gate — ADR-021) ───────────────────
      setRequestState(requestId, { status: "completing", errorMessage: null });

      const completeResult = await completeUploadAction({
        documentId,
        storageKey,
      });

      if (!completeResult.success) {
        setRequestState(requestId, {
          status: "error",
          errorMessage:
            completeResult.error ?? "Upload completion failed. Please try again.",
        });
        return;
      }

      const { outcome } = completeResult.data;

      // ── Phase 4: reflect outcome ───────────────────────────────────────────
      if (outcome === "active") {
        // AC-FILE-008-03: fulfilled item leaves the outstanding set.
        // Refresh the checklist so the UI reflects the new state.
        setRequestState(requestId, { status: "active", errorMessage: null });
        refreshChecklist();
      } else if (outcome === "infected") {
        // AC-NFR-009-02: malicious file withheld + uploader informed.
        // The request stays outstanding (not fulfilled).
        setRequestState(requestId, {
          status: "infected",
          errorMessage:
            "Your file was rejected because it was found to contain malicious content and has been blocked. Please upload a clean file.",
        });
      } else {
        // outcome === "pending" — scan indeterminate or validation failure (fail-closed).
        setRequestState(requestId, {
          status: "error",
          errorMessage:
            "Your file is being processed. Please refresh the page in a moment.",
        });
      }
    },
    [setRequestState, refreshChecklist],
  );

  return (
    <div
      data-testid="document-upload-active"
      data-step="document-upload"
      data-upload-done="false"
    >
      {/* AC-ONBD-004-01: The checklist */}
      <p className="text-sm text-gray-600 mb-4">
        Upload the documents requested below to complete this step.
      </p>

      {/* Zero items: awaiting authoring */}
      {localChecklist.items.length === 0 && (
        <div
          className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800"
          data-testid="checklist-empty"
        >
          <p className="font-medium">No document requests yet</p>
          <p className="mt-1 text-amber-700">
            Your accountant has not added any document requests for this engagement.
          </p>
        </div>
      )}

      {/* Checklist items */}
      <ul className="space-y-4" data-testid="checklist-items">
        {localChecklist.items.map((item) => {
          const reqState = uploadStates[item.requestId] ?? {
            status: "idle",
            errorMessage: null,
          };
          const isFulfilled = item.status === "fulfilled";
          const isUploading =
            reqState.status === "uploading" ||
            reqState.status === "completing" ||
            isPendingRefresh;

          return (
            <li
              key={item.requestId}
              className={[
                "rounded-lg border p-4",
                isFulfilled
                  ? "border-green-200 bg-green-50"
                  : "border-gray-200 bg-white",
              ].join(" ")}
              data-testid={`checklist-item-${item.requestId}`}
              data-request-id={item.requestId}
              data-status={item.status}
            >
              {/* Item label + status badge — AC-FILE-007-02, AC-FILE-008-02 */}
              <div className="flex items-center gap-2 mb-2">
                {isFulfilled ? (
                  <span
                    className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-green-100 text-green-700 text-xs font-semibold flex-shrink-0"
                    aria-hidden="true"
                  >
                    ✓
                  </span>
                ) : (
                  <span
                    className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-gray-200 text-gray-500 text-xs font-semibold flex-shrink-0"
                    aria-hidden="true"
                  >
                    •
                  </span>
                )}
                {/* Label — auto-escaped JSX text (GUARDRAIL: no dangerouslySetInnerHTML) */}
                <span
                  className={[
                    "text-sm font-medium",
                    isFulfilled ? "text-green-800" : "text-gray-900",
                  ].join(" ")}
                  data-testid={`checklist-label-${item.requestId}`}
                >
                  {item.label}
                </span>
                {/* Status badge — AC-FILE-008-02 */}
                <span
                  className={[
                    "ml-auto text-xs font-semibold px-2 py-0.5 rounded-full",
                    isFulfilled
                      ? "bg-green-100 text-green-700"
                      : "bg-amber-100 text-amber-800",
                  ].join(" ")}
                  data-testid={`checklist-status-${item.requestId}`}
                >
                  {isFulfilled ? "Provided" : "Outstanding"}
                </span>
              </div>

              {/* Upload widget — only shown for outstanding items (AC-ONBD-004-03) */}
              {/* AC-FILE-008-03: a fulfilled item no longer shows the upload widget */}
              {!isFulfilled && (
                <div className="mt-2">
                  {/* AC-NFR-009-02: rejection message for infected file */}
                  {reqState.status === "infected" && reqState.errorMessage && (
                    <div
                      role="alert"
                      className="mb-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
                      data-testid={`upload-rejected-${item.requestId}`}
                    >
                      {reqState.errorMessage}
                    </div>
                  )}

                  {/* Generic error state */}
                  {reqState.status === "error" && reqState.errorMessage && (
                    <div
                      role="alert"
                      className="mb-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
                      data-testid={`upload-error-${item.requestId}`}
                    >
                      {reqState.errorMessage}
                    </div>
                  )}

                  {/* File input — AC-FILE-002-01: no accept restriction → any file type */}
                  <label
                    className={[
                      "inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium cursor-pointer",
                      isUploading
                        ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                        : "bg-blue-600 text-white hover:bg-blue-700",
                    ].join(" ")}
                    aria-busy={isUploading}
                    data-testid={`upload-label-${item.requestId}`}
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
                        {reqState.status === "uploading"
                          ? "Uploading…"
                          : reqState.status === "completing"
                          ? "Processing…"
                          : "Updating…"}
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
                    {/* AC-FILE-002-01: no accept restriction (any file type) */}
                    <input
                      type="file"
                      className="sr-only"
                      disabled={isUploading}
                      data-testid={`file-input-${item.requestId}`}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file && !isUploading) {
                          // Reset the input so the same file can be re-uploaded after rejection
                          e.target.value = "";
                          void handleFileUpload(item.requestId, file);
                        }
                      }}
                      aria-label={`Upload file for: ${item.label}`}
                    />
                  </label>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {/* Overall step satisfaction signal */}
      {localChecklist.allRequiredProvided && localChecklist.items.length > 0 && (
        <div
          className="mt-4 flex items-center gap-2 text-sm font-medium text-green-700"
          data-testid="checklist-all-provided"
          aria-live="polite"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="w-5 h-5"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z"
              clipRule="evenodd"
            />
          </svg>
          All required documents provided
        </div>
      )}
    </div>
  );
}
