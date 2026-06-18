"use client";

/**
 * apps/admin/src/app/settings/questionnaire-templates/_components/QuestionnaireTemplateEditor.tsx
 *
 * Client component — per-service questionnaire editor for the accountant.
 *
 * AC-DASH-012-01: Accountant authors a new template for a service type and saves.
 * AC-DASH-012-02: The editor is keyed by serviceId; the save action binds the template
 *   to the selected service.
 * AC-DASH-012-03: Accountant edits an existing template; edited content is retained.
 *
 * Security:
 *   - Question prompts rendered via controlled <input> / <textarea> values only —
 *     NO dangerouslySetInnerHTML. React auto-escapes all text content (XSS safe).
 *   - Question `id` values generated client-side with crypto.randomUUID() on add
 *     (stable across edits; validated at the action boundary).
 *
 * data-* hooks for TASK-006-006 e2e / demo:
 *   - data-testid="questionnaire-editor" — root container
 *   - data-service-id on each service picker <option>
 *   - data-question-row on each question row
 *   - data-testid="save-template" on the save button
 *
 * ADR-006: This component is admin-only. No portal surface imports it.
 */

import { useState, useTransition } from "react";
import type { QuestionDef } from "@tax-portal/db";
import {
  getQuestionnaireTemplateAction,
  upsertQuestionnaireTemplateAction,
} from "../actions";

// ─── Props ────────────────────────────────────────────────────────────────────

export interface Service {
  id: string;
  name: string;
  description: string | null;
  sortOrder: number;
}

export interface QuestionnaireTemplateEditorProps {
  /** List of catalog services the accountant can author templates for. */
  services: Service[];
  /** The initially selected serviceId (first service by default). */
  initialServiceId: string | null;
  /** The questions for the initially selected service (null = no template yet). */
  initialQuestions: QuestionDef[] | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Generate a stable question ID using the Web Crypto API (available in Next.js). */
function newQuestionId(): string {
  return `q-${crypto.randomUUID()}`;
}

/** Parse the questions JSON blob from the repository into a QuestionDef array. */
function parseQuestions(questionsJson: string | null | undefined): QuestionDef[] {
  if (!questionsJson) return [];
  try {
    const parsed: unknown = JSON.parse(questionsJson);
    if (!Array.isArray(parsed)) return [];
    return parsed as QuestionDef[];
  } catch {
    return [];
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * QuestionnaireTemplateEditor
 *
 * A service-type picker + multi-question editor. The accountant:
 *   1. Selects a service type from the dropdown.
 *   2. The editor loads the current template (or empty) for that service.
 *   3. Authors the question set (add / remove / edit questions).
 *   4. Clicks Save — the action upserts the template keyed by serviceId.
 *
 * All question prompts are rendered via controlled input values — auto-escaped by React.
 */
export function QuestionnaireTemplateEditor({
  services,
  initialServiceId,
  initialQuestions,
}: QuestionnaireTemplateEditorProps) {
  // ── State ─────────────────────────────────────────────────────────────────
  const [selectedServiceId, setSelectedServiceId] = useState<string>(
    initialServiceId ?? services[0]?.id ?? "",
  );
  const [questions, setQuestions] = useState<QuestionDef[]>(
    initialQuestions ?? [],
  );
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [loadingService, startLoadTransition] = useTransition();
  const [isSaving, startSaveTransition] = useTransition();

  // ── Service picker change ────────────────────────────────────────────────

  const handleServiceChange = (newServiceId: string) => {
    setSelectedServiceId(newServiceId);
    setError(null);
    setSaved(false);

    startLoadTransition(async () => {
      const result = await getQuestionnaireTemplateAction(newServiceId);
      if (result.success) {
        setQuestions(result.data ? parseQuestions(result.data.questions) : []);
      } else {
        setError(result.error);
      }
    });
  };

  // ── Question CRUD ────────────────────────────────────────────────────────

  const addQuestion = () => {
    const newQ: QuestionDef = {
      id: newQuestionId(),
      prompt: "",
      type: "text",
      required: false,
    };
    setQuestions((prev) => [...prev, newQ]);
    setSaved(false);
    setError(null);
  };

  const removeQuestion = (id: string) => {
    setQuestions((prev) => prev.filter((q) => q.id !== id));
    setSaved(false);
    setError(null);
  };

  const updateQuestion = (id: string, patch: Partial<Omit<QuestionDef, "id">>) => {
    setQuestions((prev) =>
      prev.map((q) => (q.id === id ? { ...q, ...patch } : q)),
    );
    setSaved(false);
    setError(null);
  };

  // ── Save ─────────────────────────────────────────────────────────────────

  const handleSave = () => {
    setError(null);
    setSaved(false);

    startSaveTransition(async () => {
      const result = await upsertQuestionnaireTemplateAction(
        selectedServiceId,
        questions,
      );

      if (!result.success) {
        setError(result.error);
      } else {
        setSaved(true);
      }
    });
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const isPending = loadingService || isSaving;

  return (
    <div data-testid="questionnaire-editor" className="space-y-6">
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
      {saved && !error && (
        <div
          role="status"
          className="rounded border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700"
        >
          Template saved successfully.
        </div>
      )}

      {/* Service picker */}
      <div>
        <label
          htmlFor="service-picker"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          Service type
        </label>
        <select
          id="service-picker"
          value={selectedServiceId}
          onChange={(e) => handleServiceChange(e.target.value)}
          disabled={isPending}
          className="rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-60"
        >
          {services.map((svc) => (
            <option
              key={svc.id}
              value={svc.id}
              data-service-id={svc.id}
            >
              {svc.name}
            </option>
          ))}
        </select>
        {loadingService && (
          <span className="ml-3 text-sm text-gray-500" aria-live="polite">
            Loading template…
          </span>
        )}
      </div>

      {/* Question list */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-gray-700">
            Questions ({questions.length})
          </h3>
          <button
            type="button"
            onClick={addQuestion}
            disabled={isPending}
            className="rounded bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 disabled:opacity-60"
          >
            + Add question
          </button>
        </div>

        {questions.length === 0 && (
          <p className="text-sm text-gray-400 italic">
            No questions yet. Click &quot;+ Add question&quot; to start building
            the template.
          </p>
        )}

        {questions.map((question, idx) => (
          <div
            key={question.id}
            data-question-row={question.id}
            className="rounded border border-gray-200 bg-gray-50 p-4 space-y-3"
          >
            {/* Prompt */}
            <div>
              <label
                htmlFor={`q-prompt-${question.id}`}
                className="block text-xs font-medium text-gray-600 mb-1"
              >
                Question {idx + 1} prompt
              </label>
              <input
                id={`q-prompt-${question.id}`}
                type="text"
                value={question.prompt}
                onChange={(e) =>
                  updateQuestion(question.id, { prompt: e.target.value })
                }
                disabled={isPending}
                placeholder="Enter the question prompt…"
                className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-60"
              />
            </div>

            {/* Type + Required row */}
            <div className="flex items-center gap-6">
              <div>
                <label
                  htmlFor={`q-type-${question.id}`}
                  className="block text-xs font-medium text-gray-600 mb-1"
                >
                  Input type
                </label>
                <select
                  id={`q-type-${question.id}`}
                  value={question.type}
                  onChange={(e) =>
                    updateQuestion(question.id, {
                      type: e.target.value as "text" | "textarea",
                    })
                  }
                  disabled={isPending}
                  className="rounded border border-gray-300 px-2 py-1.5 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-60"
                >
                  <option value="text">Single line</option>
                  <option value="textarea">Multi-line</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <input
                  id={`q-required-${question.id}`}
                  type="checkbox"
                  checked={question.required}
                  onChange={(e) =>
                    updateQuestion(question.id, { required: e.target.checked })
                  }
                  disabled={isPending}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-60"
                />
                <label
                  htmlFor={`q-required-${question.id}`}
                  className="text-xs font-medium text-gray-600"
                >
                  Required
                </label>
              </div>

              {/* Remove button — right-aligned */}
              <div className="ml-auto">
                <button
                  type="button"
                  onClick={() => removeQuestion(question.id)}
                  disabled={isPending}
                  aria-label={`Remove question ${idx + 1}`}
                  className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-1 disabled:opacity-60"
                >
                  Remove
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Save button */}
      <div className="flex items-center gap-3 pt-2 border-t border-gray-200">
        <button
          type="button"
          data-testid="save-template"
          onClick={handleSave}
          disabled={isPending}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isSaving ? "Saving…" : "Save template"}
        </button>

        {isSaving && (
          <span className="text-sm text-gray-500" aria-live="polite">
            Saving…
          </span>
        )}
      </div>
    </div>
  );
}
