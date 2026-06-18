"use client";

/**
 * apps/admin/src/app/settings/letter-template/_components/TemplateEditor.tsx
 *
 * Client component — textarea editor + save button for the engagement-letter template.
 *
 * AC-IDNT-007-01: Receives `initialContent` (the seeded system default or current content)
 *   and renders it in the textarea on first open — no authoring required for default.
 * AC-IDNT-007-02: Save invokes updateLetterTemplateAction; on success the persisted content
 *   is reflected back in the textarea via revalidatePath on the server + React re-render.
 *
 * Security: template content is rendered only via textarea `value` / `defaultValue` —
 *   NOT via dangerouslySetInnerHTML. React auto-escapes textarea content (XSS safe).
 *
 * ADR-006: This component is admin-only — imported only by the admin letter-template page.
 *   No portal surface imports this component.
 */

import { useState, useTransition } from "react";
import { updateLetterTemplateAction } from "../actions";

// ─── Props ────────────────────────────────────────────────────────────────────

export interface TemplateEditorProps {
  /**
   * The current template content loaded server-side (seeded default or last-saved edit).
   * AC-IDNT-007-01: If the DB is unseeded this may be null — render an empty placeholder.
   */
  initialContent: string | null;
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * TemplateEditor
 *
 * Renders the current engagement-letter template content in an editable textarea.
 * The accountant can edit the text and click Save — the action persists the content
 * to the DB (AC-IDNT-007-02) and revalidates the page.
 *
 * Content is auto-escaped by React — no dangerouslySetInnerHTML (XSS safe).
 */
export function TemplateEditor({ initialContent }: TemplateEditorProps) {
  const [content, setContent] = useState(initialContent ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleSave = () => {
    setError(null);
    setSaved(false);

    startTransition(async () => {
      const result = await updateLetterTemplateAction(content);

      if (!result.success) {
        setError(result.error);
      } else {
        setSaved(true);
      }
    });
  };

  return (
    <div className="space-y-4">
      {/* Error banner — rendered when save fails */}
      {error && (
        <div
          role="alert"
          className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </div>
      )}

      {/* Success banner — rendered after a successful save */}
      {saved && !error && (
        <div
          role="status"
          className="rounded border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700"
        >
          Template saved successfully.
        </div>
      )}

      {/* Template content textarea
          - value / onChange: React-controlled (auto-escapes content — no XSS risk)
          - data-testid: test selector anchor */}
      <div>
        <label
          htmlFor="letter-template-content"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          Template content (plain text / Markdown)
        </label>
        <textarea
          id="letter-template-content"
          data-testid="template-content"
          value={content}
          onChange={(e) => {
            setContent(e.target.value);
            // Clear transient status banners when the user starts editing
            setSaved(false);
            setError(null);
          }}
          rows={20}
          className="w-full rounded border border-gray-300 px-3 py-2 font-mono text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y"
          placeholder="Enter engagement letter content…"
          aria-label="Engagement letter template content"
        />
      </div>

      {/* Save button — disabled while the transition is pending */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={isPending}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isPending ? "Saving…" : "Save template"}
        </button>

        {isPending && (
          <span className="text-sm text-gray-500" aria-live="polite">
            Saving…
          </span>
        )}
      </div>
    </div>
  );
}
