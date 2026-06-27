/**
 * apps/admin/src/app/engagements/[engagementId]/_components/ReminderOverridePanel.tsx
 *
 * Client component: renders the per-engagement reminder frequency override panel.
 *
 * TASK-019-002 / BRIEF-019 / EPIC-019
 *
 * AC-DASH-008-02: The accountant can set a per-engagement overdue-reminder frequency.
 *   This panel lets the accountant set or clear the override for the current engagement.
 *   // AC-DASH-008-02
 * AC-DASH-008-03: When the override is set, it takes precedence over the global default.
 *   When cleared (null), the engagement reverts to the global default. // AC-DASH-008-03
 *
 * ADR-006: admin surface only (no mirror on apps/portal). // ADR-006
 * CS-TS-004: the server action guards ACCOUNTANT role before the DB write. // CS-TS-004
 * CS-GEN-001: no PII in state or console output. // CS-GEN-001
 * CS-GEN-003: governing keys cited. // CS-GEN-003
 * DECISION-019-A: per-engagement override = Engagement.reminderFrequencyDaysOverride column. // DECISION-019-A
 */

"use client";

import { useState, useTransition } from "react";
import { setEngagementCadenceOverrideAction } from "../cadence-actions";

interface ReminderOverridePanelProps {
  engagementId: string;
  /** Current override from DB (null = no override, using global default). // DECISION-019-A */
  initialOverrideDays: number | null;
  /** Global default for reference display (not stored here — loaded by the page). */
  globalDefaultDays: number;
}

/**
 * Panel for setting or clearing the per-engagement reminder frequency override.
 *
 * AC-DASH-008-02: submitted override is persisted via setEngagementCadenceOverrideAction. // AC-DASH-008-02
 * AC-DASH-008-03: clearing the override (null) reverts to global default. // AC-DASH-008-03
 */
export function ReminderOverridePanel({
  engagementId,
  initialOverrideDays,
  globalDefaultDays,
}: ReminderOverridePanelProps) {
  const [overrideDays, setOverrideDays] = useState<string>(
    initialOverrideDays !== null ? String(initialOverrideDays) : "",
  );
  const [savedOverride, setSavedOverride] = useState<number | null>(initialOverrideDays);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSetOverride(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    const parsed = parseInt(overrideDays, 10);
    if (isNaN(parsed) || parsed < 1) {
      setError("Please enter a positive whole number of days.");
      return;
    }

    startTransition(async () => {
      // CS-TS-004: setEngagementCadenceOverrideAction guards ACCOUNTANT role. // CS-TS-004
      // DECISION-019-A: writes Engagement.reminderFrequencyDaysOverride. // DECISION-019-A
      const result = await setEngagementCadenceOverrideAction(engagementId, parsed);
      if (result.success) {
        setSavedOverride(parsed);
        setSuccessMessage(`Override saved: reminders every ${parsed} day${parsed === 1 ? "" : "s"} for this engagement.`);
      } else {
        setError(result.error ?? "Failed to save override. Please try again.");
      }
    });
  }

  function handleClearOverride() {
    setError(null);
    setSuccessMessage(null);

    startTransition(async () => {
      // DECISION-019-A: null clears the override → falls back to global default. // DECISION-019-A
      // AC-DASH-008-03: clearing = reverts to global default. // AC-DASH-008-03
      const result = await setEngagementCadenceOverrideAction(engagementId, null);
      if (result.success) {
        setSavedOverride(null);
        setOverrideDays("");
        setSuccessMessage(`Override cleared. This engagement now uses the global default (${globalDefaultDays} days).`);
      } else {
        setError(result.error ?? "Failed to clear override. Please try again.");
      }
    });
  }

  const effectiveDays = savedOverride ?? globalDefaultDays;
  const hasOverride = savedOverride !== null;

  return (
    <div data-testid="reminder-override-panel">
      <div className="mb-3">
        <p className="text-sm text-gray-600">
          {hasOverride ? (
            <>
              <span className="font-medium text-gray-900">Override active:</span>{" "}
              reminders every {savedOverride} day{savedOverride === 1 ? "" : "s"} for this engagement.
            </>
          ) : (
            <>
              <span className="font-medium text-gray-900">No override:</span>{" "}
              using global default ({globalDefaultDays} days).
            </>
          )}
        </p>
        <p className="text-xs text-gray-400 mt-0.5">
          Effective: every {effectiveDays} day{effectiveDays === 1 ? "" : "s"}
        </p>
      </div>

      <form
        onSubmit={handleSetOverride}
        data-testid="reminder-override-form"
        className="flex items-end gap-3"
      >
        <div>
          <label
            htmlFor="engagementReminderOverride"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Override frequency (days)
          </label>
          <input
            id="engagementReminderOverride"
            type="number"
            min={1}
            value={overrideDays}
            onChange={(e) => {
              setOverrideDays(e.target.value);
              setError(null);
              setSuccessMessage(null);
            }}
            placeholder={String(globalDefaultDays)}
            disabled={isPending}
            data-testid="override-frequency-input"
            className="block w-32 rounded border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50 disabled:opacity-60"
          />
        </div>

        <button
          type="submit"
          disabled={isPending || !overrideDays}
          data-testid="set-override-button"
          className="rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending ? "Saving..." : "Set"}
        </button>

        {hasOverride && (
          <button
            type="button"
            onClick={handleClearOverride}
            disabled={isPending}
            data-testid="clear-override-button"
            className="rounded border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Clear
          </button>
        )}
      </form>

      {error && (
        <p
          role="alert"
          className="mt-2 text-sm text-red-600"
          data-testid="override-error"
        >
          {error}
        </p>
      )}

      {successMessage && (
        <p
          role="status"
          className="mt-2 text-sm text-green-600"
          data-testid="override-success"
        >
          {successMessage}
        </p>
      )}
    </div>
  );
}
