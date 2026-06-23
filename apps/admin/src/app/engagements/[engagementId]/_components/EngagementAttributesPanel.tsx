"use client";

/**
 * apps/admin/src/app/engagements/[engagementId]/_components/EngagementAttributesPanel.tsx
 *
 * Client component: the accountant's attribute management panel.
 *
 * TASK-011-003: Admin attribute server actions + UI panel (due date / note / priority flag).
 *
 * Acceptance criteria:
 *   AC-LIFE-007-01: accountant sets a due date on an engagement (due-date input)
 *   AC-LIFE-007-02: accountant updates the due date after it has been set (same input)
 *   AC-LIFE-008-01: accountant records internal notes (notes textarea + recorder)
 *   AC-LIFE-009-01: accountant flags an engagement as priority (priority toggle ON)
 *   AC-LIFE-009-02: accountant removes the priority flag (priority toggle OFF)
 *
 * Design:
 *   - Due-date input (set/update, calendar date only — AC-LIFE-007-01/-02)
 *   - Internal-notes recorder (textarea + "Add note" button) + list of existing notes
 *     (accountant-only — NEVER surfaced in apps/portal, CS-TS-003)
 *   - Priority flag toggle (flag / unflag — AC-LIFE-009-01/-02)
 *   - All mutations call server actions — no direct DB access in this component
 *   - Structured per EngagementStatusPanel.tsx pattern (same _components/ dir)
 *
 * data-testid attributes (for e2e in TASK-011-004):
 *   data-testid="engagement-attributes-panel"   — root container
 *   data-testid="due-date-input"                — date input
 *   data-testid="set-due-date-button"           — submit due date button
 *   data-testid="due-date-display"              — current due date display (when set)
 *   data-testid="priority-toggle-button"        — flag / unflag button
 *   data-testid="priority-badge"                — badge shown when flagged
 *   data-testid="note-body-input"               — note textarea
 *   data-testid="record-note-button"            — "Add note" button
 *   data-testid="notes-list"                    — list of existing notes
 *   data-testid="note-item"                     — individual note item (data-note-id=...)
 *   data-testid="attribute-action-status"       — result message (success/error)
 *
 * // ADR-006: Admin surface ONLY — no mirror in apps/portal (CS-TS-003)
 * // ADR-003: actions call getAccountantIdentity() server-side before every write
 * // CS-TS-003: internal notes NEVER surfaced in apps/portal
 * // CS-GEN-001: note body not logged — server actions honor this; component only displays
 * // CS-GEN-003: cite governing authority in comments
 */

import { useState, useTransition } from "react";
import type { EngagementNoteItem } from "@tax-portal/db";
import {
  setDueDateAction,
  recordNoteAction,
  setPriorityAction,
} from "../attributes/actions";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface EngagementAttributesPanelProps {
  engagementId: string;
  /** Current due date (null if not yet set). AC-LIFE-007-01/-02. */
  dueDate: Date | null;
  /** Whether the engagement is currently flagged as priority. AC-LIFE-009-01/-02. */
  isPriority: boolean;
  /** Existing internal notes (accountant-only — NEVER shown in apps/portal). AC-LIFE-008-01. */
  notes: EngagementNoteItem[];
}

// ─── Helper: format a Date for display ────────────────────────────────────────

function formatDate(date: Date | null): string {
  if (!date) return "";
  // Format as YYYY-MM-DD for the date input value
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// ─── Helper: format a Date for human-readable display ─────────────────────────

function formatDateDisplay(date: Date | null): string {
  if (!date) return "Not set";
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function EngagementAttributesPanel({
  engagementId,
  dueDate: initialDueDate,
  isPriority: initialIsPriority,
  notes: initialNotes,
}: EngagementAttributesPanelProps) {
  const [dueDate, setDueDateState] = useState<Date | null>(initialDueDate);
  const [dueDateInput, setDueDateInput] = useState<string>(formatDate(initialDueDate));
  const [isPriority, setIsPriority] = useState(initialIsPriority);
  const [notes, setNotes] = useState<EngagementNoteItem[]>(initialNotes);
  const [noteBody, setNoteBody] = useState("");
  const [actionMessage, setActionMessage] = useState<{
    type: "success" | "error";
    text: string;
    area: "dueDate" | "note" | "priority";
  } | null>(null);
  const [isPending, startTransition] = useTransition();

  // ── Set / update due date (AC-LIFE-007-01/-02) ─────────────────────────────
  function handleSetDueDate() {
    startTransition(async () => {
      setActionMessage(null);
      const result = await setDueDateAction(engagementId, dueDateInput || null);
      if (result.success) {
        const newDate = dueDateInput ? new Date(dueDateInput) : null;
        setDueDateState(newDate);
        setActionMessage({
          type: "success",
          text: newDate ? `Due date set to ${formatDateDisplay(newDate)}` : "Due date cleared",
          area: "dueDate",
        });
      } else {
        setActionMessage({ type: "error", text: result.error, area: "dueDate" });
      }
    });
  }

  // ── Record a note (AC-LIFE-008-01) ─────────────────────────────────────────
  // ADR-006 / CS-TS-003: notes are accountant-only; this panel is apps/admin ONLY.
  function handleRecordNote() {
    startTransition(async () => {
      setActionMessage(null);
      const result = await recordNoteAction(engagementId, noteBody);
      if (result.success) {
        // Optimistic append — revalidatePath will refresh the full list on next navigation.
        // For immediate UI feedback, we construct a local stub.
        const stub: EngagementNoteItem = {
          id: `local-${Date.now()}`,
          engagementId,
          body: noteBody,
          createdBy: "you",
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        setNotes((prev) => [...prev, stub]);
        setNoteBody("");
        setActionMessage({ type: "success", text: "Note recorded", area: "note" });
      } else {
        setActionMessage({ type: "error", text: result.error, area: "note" });
      }
    });
  }

  // ── Toggle priority flag (AC-LIFE-009-01/-02) ──────────────────────────────
  function handleTogglePriority() {
    startTransition(async () => {
      setActionMessage(null);
      const newPriority = !isPriority;
      const result = await setPriorityAction(engagementId, newPriority);
      if (result.success) {
        setIsPriority(newPriority);
        setActionMessage({
          type: "success",
          text: newPriority ? "Engagement flagged as priority" : "Priority flag removed",
          area: "priority",
        });
      } else {
        setActionMessage({ type: "error", text: result.error, area: "priority" });
      }
    });
  }

  return (
    <div
      data-testid="engagement-attributes-panel"
      className="bg-white rounded-lg border border-gray-200 shadow-sm p-6"
    >
      <h2 className="text-lg font-semibold text-gray-900 mb-6">Engagement Attributes</h2>

      {/* ── Due date section (AC-LIFE-007-01/-02) ────────────────────────── */}
      <section className="mb-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-2">Due Date</h3>

        {/* Current due date display */}
        <div className="mb-3">
          <span className="text-xs text-gray-500 mr-2">Current:</span>
          <span
            data-testid="due-date-display"
            className="text-sm text-gray-800 font-medium"
          >
            {formatDateDisplay(dueDate)}
          </span>
        </div>

        {/* Due date picker + set/update button */}
        <div className="flex items-center gap-3">
          <input
            data-testid="due-date-input"
            type="date"
            value={dueDateInput}
            onChange={(e) => setDueDateInput(e.target.value)}
            disabled={isPending}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Engagement due date"
          />
          <button
            data-testid="set-due-date-button"
            onClick={handleSetDueDate}
            disabled={isPending}
            className="rounded-md px-3 py-1.5 text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {dueDate ? "Update due date" : "Set due date"}
          </button>
        </div>

        {/* Due date action result */}
        {actionMessage?.area === "dueDate" && (
          <div
            data-testid="attribute-action-status"
            role={actionMessage.type === "error" ? "alert" : "status"}
            className={`mt-2 rounded border px-3 py-2 text-xs ${
              actionMessage.type === "error"
                ? "border-red-200 bg-red-50 text-red-700"
                : "border-green-200 bg-green-50 text-green-700"
            }`}
          >
            {actionMessage.text}
          </div>
        )}
      </section>

      {/* ── Priority flag section (AC-LIFE-009-01/-02) ───────────────────── */}
      <section className="mb-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-2">Priority</h3>

        <div className="flex items-center gap-3">
          {isPriority && (
            <span
              data-testid="priority-badge"
              className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-amber-100 text-amber-800"
            >
              Priority
            </span>
          )}
          <button
            data-testid="priority-toggle-button"
            onClick={handleTogglePriority}
            disabled={isPending}
            aria-pressed={isPriority}
            className={`rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed ${
              isPriority
                ? "border border-amber-500 bg-white text-amber-700 hover:bg-amber-50"
                : "bg-amber-600 text-white hover:bg-amber-700"
            }`}
          >
            {isPriority ? "Remove priority flag" : "Flag as priority"}
          </button>
        </div>

        {/* Priority action result */}
        {actionMessage?.area === "priority" && (
          <div
            data-testid="attribute-action-status"
            role={actionMessage.type === "error" ? "alert" : "status"}
            className={`mt-2 rounded border px-3 py-2 text-xs ${
              actionMessage.type === "error"
                ? "border-red-200 bg-red-50 text-red-700"
                : "border-green-200 bg-green-50 text-green-700"
            }`}
          >
            {actionMessage.text}
          </div>
        )}
      </section>

      {/* ── Internal notes section (AC-LIFE-008-01) ──────────────────────── */}
      {/* ADR-006 / CS-TS-003: notes panel is apps/admin ONLY — never shown in apps/portal */}
      <section>
        <h3 className="text-sm font-semibold text-gray-700 mb-2">
          Internal Notes
          <span className="ml-2 text-xs font-normal text-gray-400">(accountant-only)</span>
        </h3>

        {/* Existing notes list (AC-LIFE-008-01) */}
        {notes.length > 0 ? (
          <ul
            data-testid="notes-list"
            className="mb-4 space-y-2"
            aria-label="Existing internal notes"
          >
            {notes.map((note) => (
              <li
                key={note.id}
                data-testid="note-item"
                data-note-id={note.id}
                className="rounded-md border border-gray-200 bg-gray-50 px-4 py-3"
              >
                <p className="text-sm text-gray-800 whitespace-pre-wrap">{note.body}</p>
                <p className="mt-1 text-xs text-gray-400">
                  {note.createdAt instanceof Date
                    ? note.createdAt.toLocaleString()
                    : String(note.createdAt)}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mb-4 text-sm text-gray-400 italic">No internal notes yet.</p>
        )}

        {/* Note recorder (AC-LIFE-008-01) */}
        <div className="space-y-2">
          <textarea
            data-testid="note-body-input"
            value={noteBody}
            onChange={(e) => setNoteBody(e.target.value)}
            disabled={isPending}
            rows={3}
            placeholder="Add an internal note…"
            aria-label="Internal note text"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed resize-y"
          />
          <button
            data-testid="record-note-button"
            onClick={handleRecordNote}
            disabled={isPending || !noteBody.trim()}
            className="rounded-md px-3 py-1.5 text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Add note
          </button>
        </div>

        {/* Note action result */}
        {actionMessage?.area === "note" && (
          <div
            data-testid="attribute-action-status"
            role={actionMessage.type === "error" ? "alert" : "status"}
            className={`mt-2 rounded border px-3 py-2 text-xs ${
              actionMessage.type === "error"
                ? "border-red-200 bg-red-50 text-red-700"
                : "border-green-200 bg-green-50 text-green-700"
            }`}
          >
            {actionMessage.text}
          </div>
        )}
      </section>
    </div>
  );
}
