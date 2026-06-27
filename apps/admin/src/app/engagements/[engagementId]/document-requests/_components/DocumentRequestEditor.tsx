"use client";

/**
 * apps/admin/src/app/engagements/[engagementId]/document-requests/_components/DocumentRequestEditor.tsx
 *
 * Client component — labeled document-request authoring form for the accountant.
 *
 * AC-FILE-007-01: The accountant creates a document request in an engagement with a free-text label.
 *   The label describes what the client should upload (e.g. "2023 W-2", "Bank statements").
 * AC-FILE-012-02: Overdue requests are flagged/surfaced as overdue when the accountant views them.
 *   Each list item shows an "Overdue" badge when isOverdue=true. // AC-FILE-012-02
 * AC-MSG-014-02: The client receives a notification when a request is created (handled server-side
 *   by createDocumentRequestAsAccountant — no client component action needed). // AC-MSG-014-02
 *
 * TASK-019-004 additions:
 *   - Due date input field on the create form (DECISION-019-C / AC-FILE-012-04).
 *   - Overdue badge on list items (AC-FILE-012-02).
 *   - initialRequests now expects DocumentRequestAdminItem[] (with isOverdue/isFulfilled).
 *
 * Security:
 *   - Label rendered via controlled <input> value — NO dangerouslySetInnerHTML (XSS safe).
 *   - Client-side validation mirrors server-side validation in actions.ts (non-empty, ≤500 chars).
 *   - The save action verifies the ACCOUNTANT identity server-side; the component trusts the action.
 *   - CS-GEN-001: no PII in any displayed field beyond what the accountant authored. // CS-GEN-001
 *
 * data-* hooks for e2e / demo:
 *   - data-testid="document-request-editor" — root container
 *   - data-testid="document-request-label-input" — the label text input (cross-app e2e)
 *   - data-testid="document-request-due-date-input" — the due date input (TASK-019-004)
 *   - data-testid="add-document-request-button" — the submit button (cross-app e2e)
 *   - data-testid="request-list" — the list of existing requests
 *   - data-testid="document-request-item-{id}" — each request row, with data-request-id={id}
 *   - data-testid="overdue-badge-{id}" — overdue badge (AC-FILE-012-02; only when isOverdue)
 *
 * ADR-006: Admin-only component. No portal surface imports it. // ADR-006
 * CS-TS-003: pattern consistent with the notification feed rendering convention. // CS-TS-003
 * DECISION-019-C: due date input stored as-is by the server action; used for overdue derivation. // DECISION-019-C
 *
 * Mirrors apps/admin/src/app/settings/questionnaire-templates/_components/QuestionnaireTemplateEditor.tsx
 * in guard + action + component shape.
 */

import { useState, useTransition } from "react";
import type { DocumentRequestAdminItem } from "@tax-portal/db";
import { createDocumentRequestAction } from "../actions";
import { LABEL_MAX_LENGTH, validateLabel } from "../validation";

// ─── Props ────────────────────────────────────────────────────────────────────

export interface DocumentRequestEditorProps {
  /** The engagement this editor authors requests for. */
  engagementId: string;
  /**
   * Existing document requests for this engagement (rendered below the form).
   * DocumentRequestAdminItem includes isFulfilled + isOverdue (AC-FILE-012-02 / TASK-019-004).
   * // AC-FILE-012-02 // DECISION-019-C // DECISION-019-D
   */
  initialRequests: DocumentRequestAdminItem[];
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * DocumentRequestEditor
 *
 * A form that creates labeled document requests with an optional due date for an engagement.
 * The accountant:
 *   1. Types a free-text label (e.g. "2023 W-2 form").
 *   2. Optionally sets a due date for the request (DECISION-019-C / AC-FILE-012-04). // DECISION-019-C
 *   3. Clicks "Add request" — the server action creates the DocumentRequest row and emits
 *      a document_request_created notification for the client (AC-MSG-014-02). // AC-MSG-014-02
 *   4. The new request appears in the list below the form (revalidated by the server action).
 *   5. Overdue requests are highlighted with an "Overdue" badge (AC-FILE-012-02). // AC-FILE-012-02
 *
 * All label text is rendered via controlled input value — auto-escaped by React.
 */
export function DocumentRequestEditor({
  engagementId,
  initialRequests,
}: DocumentRequestEditorProps) {
  // ── State ─────────────────────────────────────────────────────────────────
  const [label, setLabel] = useState("");
  const [dueDate, setDueDate] = useState<string>(""); // HTML date string (YYYY-MM-DD)
  const [clientError, setClientError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [requests, setRequests] = useState<DocumentRequestAdminItem[]>(initialRequests);
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

    // Parse the optional due date (DECISION-019-C). // DECISION-019-C
    // HTML date input gives a "YYYY-MM-DD" string; convert to Date for the server action.
    const parsedDueDate: Date | null = dueDate ? new Date(`${dueDate}T00:00:00.000Z`) : null;

    startSaveTransition(async () => {
      const result = await createDocumentRequestAction(
        engagementId,
        label,
        parsedDueDate, // DECISION-019-C: optional due date // DECISION-019-C
      );

      if (!result.success) {
        setServerError(result.error);
        return;
      }

      // Optimistically append the new request to the list.
      // isOverdue=false for a newly created request (can't be overdue immediately).
      // isFulfilled=false for a newly created request (no document uploaded yet).
      // (The server action also revalidatePath's the page for a fresh SSR render on next nav)
      const newRequest: DocumentRequestAdminItem = {
        id: result.id,
        engagementId,
        label: label.trim(),
        createdBy: null, // We don't have this on the client — it's an audit field
        createdAt: new Date(),
        updatedAt: new Date(),
        dueDate: parsedDueDate,
        isFulfilled: false, // newly created — no document yet // DECISION-019-D
        isOverdue: false,   // newly created — cannot be overdue immediately // AC-FILE-012-02
      };
      setRequests((prev) => [...prev, newRequest]);
      setLabel("");
      setDueDate("");
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

      {/* Label input + Due date input + Add button */}
      <div className="space-y-3">
        {/* Label */}
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
              data-testid="document-request-label-input"
              className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-60"
            />
          </div>

          {/* Character counter — visible when approaching limit */}
          {label.length > LABEL_MAX_LENGTH * 0.8 && (
            <p className="mt-1 text-xs text-gray-500">
              {label.trim().length}/{LABEL_MAX_LENGTH} characters
            </p>
          )}
        </div>

        {/* Due date — optional (DECISION-019-C / AC-FILE-012-04) */}
        <div>
          <label
            htmlFor="due-date-input"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Due date
            <span className="ml-1 text-gray-400 font-normal text-xs">
              (optional — when provided, overdue detection uses this date)
            </span>
          </label>
          <input
            id="due-date-input"
            type="date"
            value={dueDate}
            onChange={(e) => {
              setDueDate(e.target.value);
              setServerError(null);
              setSuccessMessage(null);
            }}
            disabled={isSaving}
            data-testid="document-request-due-date-input"
            className="rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-60"
          />
        </div>

        {/* Add button */}
        <div>
          <button
            type="button"
            data-testid="add-document-request-button"
            onClick={handleAdd}
            disabled={isSaving}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed whitespace-nowrap"
          >
            {isSaving ? "Adding…" : "Add request"}
          </button>
        </div>
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
                data-testid={`document-request-item-${req.id.toLowerCase()}`}
                data-request-id={req.id.toLowerCase()}
                data-overdue={req.isOverdue}
                className={`flex items-start gap-3 rounded border px-4 py-3 text-sm ${
                  req.isOverdue
                    ? "border-red-300 bg-red-50"
                    : "border-gray-200 bg-gray-50"
                }`}
              >
                <span className="text-gray-400 text-xs font-mono w-6 shrink-0 mt-0.5">
                  {idx + 1}.
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={req.isOverdue ? "text-red-800" : "text-gray-800"}>
                      {req.label}
                    </span>
                    {/* AC-FILE-012-02: overdue badge — derived from isOverdue (DECISION-019-C/-D) */}
                    {req.isOverdue && (
                      <span
                        data-testid={`overdue-badge-${req.id.toLowerCase()}`}
                        className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700"
                        // AC-FILE-012-02: overdue flag surfaced on the accountant view // AC-FILE-012-02
                      >
                        Overdue
                      </span>
                    )}
                  </div>
                  {/* Due date display */}
                  {req.dueDate && (
                    <p className="mt-0.5 text-xs text-gray-500">
                      Due: {new Date(req.dueDate).toLocaleDateString()}
                    </p>
                  )}
                  {/* Fulfillment status */}
                  {req.isFulfilled && (
                    <p className="mt-0.5 text-xs text-green-600">
                      Fulfilled
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
