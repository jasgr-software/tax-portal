"use client";

/**
 * apps/admin/src/app/engagements/[engagementId]/document-requests/_components/DocumentRequestEditor.tsx
 *
 * Client component — labeled document-request authoring form for the accountant.
 *
 * AC-FILE-007-01: The accountant creates a document request in an engagement with a free-text label.
 *   The label describes what the client should upload (e.g. "2023 W-2", "Bank statements").
 *
 * Security:
 *   - Label rendered via controlled <input> value — NO dangerouslySetInnerHTML (XSS safe).
 *   - Client-side validation mirrors server-side validation in actions.ts (non-empty, ≤500 chars).
 *   - The save action verifies the ACCOUNTANT identity server-side; the component trusts the action.
 *
 * data-* hooks for e2e / demo:
 *   - data-testid="document-request-editor" — root container
 *   - data-testid="label-input" — the label text input
 *   - data-testid="add-request" — the submit button
 *   - data-testid="request-list" — the list of existing requests
 *   - data-testid="request-item" — each request row in the list
 *
 * ADR-006: Admin-only component. No portal surface imports it.
 *
 * Mirrors apps/admin/src/app/settings/questionnaire-templates/_components/QuestionnaireTemplateEditor.tsx
 * in guard + action + component shape.
 */

import { useState, useTransition } from "react";
import type { DocumentRequestItem } from "@tax-portal/db";
import { createDocumentRequestAction } from "../actions";
import { LABEL_MAX_LENGTH, validateLabel } from "../validation";

// ─── Props ────────────────────────────────────────────────────────────────────

export interface DocumentRequestEditorProps {
  /** The engagement this editor authors requests for. */
  engagementId: string;
  /** Existing document requests for this engagement (rendered below the form). */
  initialRequests: DocumentRequestItem[];
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * DocumentRequestEditor
 *
 * A single-field form that creates labeled document requests for an engagement.
 * The accountant:
 *   1. Types a free-text label (e.g. "2023 W-2 form").
 *   2. Clicks "Add request" — the server action creates the DocumentRequest row.
 *   3. The new request appears in the list below the form (revalidated by the server action).
 *
 * All label text is rendered via controlled input value — auto-escaped by React.
 */
export function DocumentRequestEditor({
  engagementId,
  initialRequests,
}: DocumentRequestEditorProps) {
  // ── State ─────────────────────────────────────────────────────────────────
  const [label, setLabel] = useState("");
  const [clientError, setClientError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [requests, setRequests] = useState<DocumentRequestItem[]>(initialRequests);
  const [isSaving, startSaveTransition] = useTransition();

  // ── Submit handler ────────────────────────────────────────────────────────

  const handleAdd = () => {
    setServerError(null);
    setSuccessMessage(null);

    // Client-side validation (uses shared validateLabel from validation.ts —
    // mirrors server-side validation exactly so errors are consistent)
    const err = validateLabel(label);
    if (err) {
      setClientError(err);
      return;
    }
    setClientError(null);

    startSaveTransition(async () => {
      const result = await createDocumentRequestAction(engagementId, label);

      if (!result.success) {
        setServerError(result.error);
        return;
      }

      // Optimistically append the new request to the list
      // (The server action also revalidatePath's the page for a fresh SSR render on next nav)
      const newRequest: DocumentRequestItem = {
        id: result.id,
        engagementId,
        label: label.trim(),
        createdBy: null, // We don't have this on the client — it's an audit field
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      setRequests((prev) => [...prev, newRequest]);
      setLabel("");
      setSuccessMessage("Document request added.");
    });
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const error = clientError ?? serverError;

  return (
    <div data-testid="document-request-editor" className="space-y-6">
      {/* Error banner */}
      {error && (
        <div
          role="alert"
          className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </div>
      )}

      {/* Success banner */}
      {successMessage && !error && (
        <div
          role="status"
          className="rounded border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700"
        >
          {successMessage}
        </div>
      )}

      {/* Label input + Add button */}
      <div>
        <label
          htmlFor="label-input"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          Document request label
          <span className="ml-1 text-gray-400 font-normal text-xs">
            (e.g. &quot;2023 W-2 form&quot;, &quot;Bank statements&quot;)
          </span>
        </label>

        <div className="flex items-center gap-3">
          <input
            id="label-input"
            type="text"
            value={label}
            onChange={(e) => {
              setLabel(e.target.value);
              setClientError(null);
              setServerError(null);
              setSuccessMessage(null);
            }}
            disabled={isSaving}
            maxLength={LABEL_MAX_LENGTH}
            placeholder="Describe what the client should upload…"
            data-testid="label-input"
            className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-60"
          />

          <button
            type="button"
            data-testid="add-request"
            onClick={handleAdd}
            disabled={isSaving}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed whitespace-nowrap"
          >
            {isSaving ? "Adding…" : "Add request"}
          </button>
        </div>

        {/* Character counter — visible when approaching limit */}
        {label.length > LABEL_MAX_LENGTH * 0.8 && (
          <p className="mt-1 text-xs text-gray-500">
            {label.trim().length}/{LABEL_MAX_LENGTH} characters
          </p>
        )}
      </div>

      {/* Existing requests list */}
      <div>
        <h3 className="text-sm font-medium text-gray-700 mb-3">
          Document requests ({requests.length})
        </h3>

        {requests.length === 0 ? (
          <p
            className="text-sm text-gray-400 italic"
            data-testid="empty-state"
          >
            No document requests yet. Add one above.
          </p>
        ) : (
          <ul
            data-testid="request-list"
            className="space-y-2"
          >
            {requests.map((req, idx) => (
              <li
                key={req.id}
                data-testid="request-item"
                className="flex items-center gap-3 rounded border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-800"
              >
                <span className="text-gray-400 text-xs font-mono w-6 shrink-0">
                  {idx + 1}.
                </span>
                <span className="flex-1">{req.label}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
