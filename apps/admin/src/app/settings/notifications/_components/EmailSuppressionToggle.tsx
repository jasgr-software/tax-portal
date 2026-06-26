/**
 * apps/admin/src/app/settings/notifications/_components/EmailSuppressionToggle.tsx
 *
 * Client component: renders the email-suppression toggle for the accountant.
 *
 * AC-MSG-010-01: The accountant can turn off her own email notifications entirely.
 *
 * This component:
 *   - Receives `initialEmailEnabled` from the server page (pre-read by getOwnEmailNudgePreferenceAction).
 *   - Calls setOwnEmailNudgeSuppressionAction(suppress) when the toggle changes.
 *   - Shows pending + error states.
 *
 * ADR-006: admin surface only (no mirror on apps/portal). // ADR-006
 * CS-GEN-001: no PII in state or console output. // CS-GEN-001
 * CS-GEN-003: governing keys cited. // CS-GEN-003
 */

"use client";

import { useState, useTransition } from "react";
import { setOwnEmailNudgeSuppressionAction } from "../actions";

interface EmailSuppressionToggleProps {
  /** Current emailNudgeEnabled value — determines initial toggle state */
  initialEmailEnabled: boolean;
}

/**
 * Toggle that lets the accountant suppress or re-enable her own email notifications.
 *
 * AC-MSG-010-01: checked = email enabled; unchecked = email suppressed (turned off).
 */
export function EmailSuppressionToggle({
  initialEmailEnabled,
}: EmailSuppressionToggleProps) {
  // Local state mirrors the server-side emailNudgeEnabled value.
  // true  = email enabled (not suppressed)
  // false = email suppressed (turned off)
  const [emailEnabled, setEmailEnabled] = useState(initialEmailEnabled);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleToggle() {
    const newEnabled = !emailEnabled;
    setError(null);

    startTransition(async () => {
      // suppress=true means we want to suppress (turn off) — so suppress = !newEnabled
      const result = await setOwnEmailNudgeSuppressionAction(!newEnabled);
      if (result.success) {
        setEmailEnabled(newEnabled);
      } else {
        // Revert optimistic update on failure — state is unchanged
        setError(result.error ?? "Failed to update email preference. Please try again.");
      }
    });
  }

  return (
    <div
      className="flex items-start gap-4"
      data-testid="email-suppression-toggle-container"
    >
      <div className="flex items-center">
        <button
          type="button"
          role="switch"
          aria-checked={emailEnabled}
          aria-label="Receive email digest notifications"
          data-testid="email-suppression-toggle"
          data-email-enabled={String(emailEnabled)}
          onClick={handleToggle}
          disabled={isPending}
          className={[
            "relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed",
            emailEnabled ? "bg-blue-600" : "bg-gray-200",
          ].join(" ")}
        >
          <span
            aria-hidden="true"
            className={[
              "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
              emailEnabled ? "translate-x-5" : "translate-x-0",
            ].join(" ")}
          />
        </button>
      </div>

      <div className="flex-1">
        <p className="text-sm font-medium text-gray-900">
          {emailEnabled
            ? "Email notifications are enabled"
            : "Email notifications are suppressed"}
        </p>
        <p className="mt-0.5 text-sm text-gray-500">
          {emailEnabled
            ? "You will receive a daily email digest when you have unread notifications."
            : "You will not receive any email digests. Notifications remain in the portal."}
        </p>

        {isPending && (
          <p className="mt-1 text-xs text-gray-400" data-testid="toggle-pending">
            Saving...
          </p>
        )}

        {error && (
          <p
            role="alert"
            className="mt-1 text-xs text-red-600"
            data-testid="toggle-error"
          >
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
