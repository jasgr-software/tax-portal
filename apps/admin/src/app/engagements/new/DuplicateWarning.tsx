/**
 * apps/admin/src/app/engagements/new/DuplicateWarning.tsx
 *
 * Warning component shown when the duplicate guard detects an existing engagement
 * for the same (client, service type, tax year) combination.
 *
 * TASK-012-004: Duplicate-guard warning UI (Tax Portal admin).
 *
 * Acceptance criteria:
 *   AC-LIFE-011-02 — warns and shows the existing matching engagement before any second is created.
 *   AC-LIFE-011-03 — from the warning the accountant can navigate to the existing engagement OR
 *                    deliberately override to create the second.
 *   AC-LIFE-011-04 — never silently blocks or silently redirects; condition surfaced for decision.
 *
 * data-* hooks used by e2e:
 *   data-testid="duplicate-warning"             — root warning container
 *   data-testid="duplicate-match-{engagementId}" — one card per match
 *   data-testid="navigate-to-engagement"         — link to existing engagement
 *   data-testid="override-submit"                — override button (create the second anyway)
 *   data-testid="cancel-override"                — cancel / go back
 *
 * ADR-006: Admin surface only — no portal mirror.
 * CS-TS-003: component exists ONLY in apps/admin.
 * CS-GEN-001: no client PII logged or rendered beyond what is already visible to the accountant.
 * CS-GEN-003: cite governing authority in comments.
 *
 * // ADR-006 // CS-TS-003 // CS-GEN-001 // CS-GEN-003
 */

"use client";

import type { DuplicateMatchItem } from "./actions";

// ─── Props ────────────────────────────────────────────────────────────────────

interface DuplicateWarningProps {
  /** The duplicate matches returned by the server action. */
  matches: DuplicateMatchItem[];
  /** Called when the accountant confirms the override (creates the second engagement). */
  onOverride: () => void;
  /** Called when the accountant cancels and goes back to editing the form. */
  onCancel: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * Renders the duplicate-guard warning for the accountant.
 *
 * AC-LIFE-011-02: Shows the existing matching engagement (status, taxYear, overlapping services).
 * AC-LIFE-011-03: Offers two explicit choices — navigate to existing OR override.
 * AC-LIFE-011-04: Never silently blocks or redirects — the accountant must choose.
 *
 * // DECISION (TASK-012-004): The warning is always rendered when matches.length > 0.
 * // The UI does NOT auto-redirect to the existing engagement (AC-LIFE-011-04).
 * // The accountant explicitly clicks "Go to existing engagement" to navigate,
 * // or "Create anyway" to override. There is no third (silent) path.
 */
export function DuplicateWarning({ matches, onOverride, onCancel }: DuplicateWarningProps) {
  return (
    // AC-LIFE-011-02: warning container — always visible when a duplicate is found
    // AC-LIFE-011-04: never silent — this component forces an explicit decision
    <div
      data-testid="duplicate-warning"
      role="alert"
      aria-live="polite"
      className="rounded-lg border border-amber-300 bg-amber-50 p-6 space-y-4"
    >
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="shrink-0 mt-0.5 text-amber-500" aria-hidden="true">
          <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
              clipRule="evenodd"
            />
          </svg>
        </div>
        <div>
          <h2 className="text-sm font-semibold text-amber-800">
            Duplicate engagement detected
          </h2>
          <p className="mt-1 text-sm text-amber-700">
            An engagement already exists for this client, service type, and tax year combination.
            Review the existing engagement{matches.length > 1 ? "s" : ""} below before proceeding.
          </p>
        </div>
      </div>

      {/* Existing engagement cards (AC-LIFE-011-02: show the matching engagement) */}
      <div className="space-y-3">
        {matches.map((match) => {
          // Normalize to lowercase for consistent URL routing and data-testid matching.
          // SQL Server returns UUIDs in uppercase; lowercase for consistency with Next.js routing.
          const engagementIdLower = match.engagementId.toLowerCase();
          return (
          <div
            key={engagementIdLower}
            data-testid={`duplicate-match-${engagementIdLower}`}
            className="rounded-md border border-amber-200 bg-white p-4 flex items-center justify-between gap-4"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">
                  {match.status}
                </span>
                {match.taxYear !== null && (
                  <span className="text-xs text-gray-500">Tax year {match.taxYear}</span>
                )}
              </div>
              {match.overlappingServiceIds.length > 0 && (
                <p className="mt-1 text-xs text-gray-400 truncate">
                  {match.overlappingServiceIds.length} overlapping service
                  {match.overlappingServiceIds.length !== 1 ? "s" : ""}
                </p>
              )}
            </div>
            {/* AC-LIFE-011-03: navigate-to-existing action */}
            <a
              href={`/engagements/${engagementIdLower}`}
              data-testid="navigate-to-engagement"
              className="shrink-0 inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
            >
              Go to existing engagement
            </a>
          </div>
          );
        })}
      </div>

      {/* Action row (AC-LIFE-011-03: override OR cancel — never a silent path) */}
      <div className="flex flex-wrap items-center gap-3 pt-2">
        {/* AC-LIFE-011-03: override path — create the second engagement anyway */}
        <button
          type="button"
          data-testid="override-submit"
          onClick={onOverride}
          className="inline-flex items-center rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 transition-colors"
        >
          Create anyway (override)
        </button>
        {/* Cancel — go back to editing the form without creating or navigating */}
        <button
          type="button"
          data-testid="cancel-override"
          onClick={onCancel}
          className="inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-offset-2 transition-colors"
        >
          Cancel — go back
        </button>
      </div>
    </div>
  );
}
