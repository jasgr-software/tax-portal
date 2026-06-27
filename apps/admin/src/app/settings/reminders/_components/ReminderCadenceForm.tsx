/**
 * apps/admin/src/app/settings/reminders/_components/ReminderCadenceForm.tsx
 *
 * Client component: renders the global default reminder cadence form for the accountant.
 *
 * TASK-019-002 / BRIEF-019 / EPIC-019
 *
 * AC-DASH-008-01: The accountant can set the global default overdue-reminder frequency.
 *   This form lets the accountant enter a frequency (in days) and submit it.
 *   // AC-DASH-008-01
 *
 * ADR-006: admin surface only (no mirror on apps/portal). // ADR-006
 * CS-TS-004: the server action guards ACCOUNTANT role before the DB write. // CS-TS-004
 * CS-GEN-001: no PII in state or console output. // CS-GEN-001
 * CS-GEN-003: governing keys cited. // CS-GEN-003
 */

"use client";

import { useState, useTransition } from "react";
import { setGlobalDefaultCadenceAction } from "../actions";

interface ReminderCadenceFormProps {
  /** Current global default cadence in days — pre-read by the server page. // AC-DASH-008-01 */
  initialFrequencyDays: number;
}

/**
 * Form for setting the global default overdue-reminder frequency.
 *
 * AC-DASH-008-01: submitted value is persisted via setGlobalDefaultCadenceAction. // AC-DASH-008-01
 */
export function ReminderCadenceForm({
  initialFrequencyDays,
}: ReminderCadenceFormProps) {
  const [frequencyDays, setFrequencyDays] = useState(String(initialFrequencyDays));
  const [savedDays, setSavedDays] = useState(initialFrequencyDays);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    const parsed = parseInt(frequencyDays, 10);
    if (isNaN(parsed) || parsed < 1) {
      setError("Please enter a positive whole number of days.");
      return;
    }

    startTransition(async () => {
      // CS-TS-004: setGlobalDefaultCadenceAction guards ACCOUNTANT role. // CS-TS-004
      const result = await setGlobalDefaultCadenceAction(parsed);
      if (result.success) {
        setSavedDays(parsed);
        setSuccessMessage(`Global default saved: reminders every ${parsed} day${parsed === 1 ? "" : "s"}.`);
      } else {
        setError(result.error ?? "Failed to save. Please try again.");
      }
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      data-testid="reminder-cadence-form"
      aria-label="Global default reminder frequency"
    >
      <div className="flex items-end gap-4">
        <div className="flex-1 max-w-xs">
          <label
            htmlFor="reminderFrequencyDays"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Frequency (days)
          </label>
          <input
            id="reminderFrequencyDays"
            type="number"
            min={1}
            value={frequencyDays}
            onChange={(e) => {
              setFrequencyDays(e.target.value);
              setError(null);
              setSuccessMessage(null);
            }}
            disabled={isPending}
            data-testid="reminder-frequency-input"
            className="block w-full rounded border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50 disabled:opacity-60"
            aria-describedby={error ? "cadence-error" : successMessage ? "cadence-success" : undefined}
          />
        </div>

        <button
          type="submit"
          disabled={isPending}
          data-testid="save-cadence-button"
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending ? "Saving..." : "Save"}
        </button>
      </div>

      {/* Current saved value context */}
      <p className="mt-2 text-xs text-gray-400" data-testid="cadence-current-value">
        Current: every {savedDays} day{savedDays === 1 ? "" : "s"}
      </p>

      {error && (
        <p
          id="cadence-error"
          role="alert"
          className="mt-2 text-sm text-red-600"
          data-testid="cadence-error"
        >
          {error}
        </p>
      )}

      {successMessage && (
        <p
          id="cadence-success"
          role="status"
          className="mt-2 text-sm text-green-600"
          data-testid="cadence-success"
        >
          {successMessage}
        </p>
      )}
    </form>
  );
}
