/**
 * apps/portal/src/app/onboarding/_components/LetterSignStep.tsx
 *
 * Renders the engagement letter content for review and provides a sign button.
 *
 * AC-IDNT-007-03 UI: Displays the accountant's edited template content for the client to
 *   review before signing. Content rendered as auto-escaped JSX text — never via
 *   dangerouslySetInnerHTML (ADR-024 §6 content boundary; no rich-HTML injection).
 * AC-ONBD-002-03: The sign button calls signEngagementLetterAction(engagementId).
 *   The "signed" decision comes from the server (via the e-sign port + verifyCompletion)
 *   — never from a client-asserted boolean.
 *
 * GUARDRAIL: This component does NOT compute its own accessibility gate. It reflects
 * the `isSigned` flag passed down from the read model. The real enforcement is
 * signEngagementLetterAction's server-side guard (TASK-005-005).
 *
 * GUARDRAIL: No import of e-sign binding classes. The server action (signEngagementLetterAction)
 * owns the ESignatureProvider PORT interaction — this component only calls the action.
 *
 * ADR-006: Portal-only client component — never imported in apps/admin.
 * ADR-024 §6: letterContent rendered as auto-escaped text (whitespace-pre-wrap), no HTML.
 */

"use client";

import { useState, useTransition } from "react";
import { signEngagementLetterAction } from "../actions";
import type { OnboardingReadModel } from "@tax-portal/db";

// ─── Types ────────────────────────────────────────────────────────────────────

interface LetterSignStepProps {
  /** The engagement id — used by the sign action. Server-resolved; never from URL param. */
  engagementId: string;
  /**
   * The accountant's edited template content (AC-IDNT-007-03).
   * Rendered as auto-escaped JSX text. NEVER passed to dangerouslySetInnerHTML.
   * ADR-024 §6: content boundary — no rich HTML.
   */
  letterContent: string;
  /** True when the letter has already been signed (step.done from the read model). */
  isSigned: boolean;
  /**
   * Optional callback: called with the updated read model after a successful sign.
   * Used by tests (and optionally by parent components) to observe sign completion.
   */
  onSignComplete?: ((model: OnboardingReadModel) => void) | undefined;
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * LetterSignStep — client component for engagement letter review + sign action.
 *
 * AC-IDNT-007-03 UI: Letter content displayed for review (auto-escaped text).
 * AC-ONBD-002-03: Sign button calls signEngagementLetterAction; page revalidates on success.
 *
 * Uses useTransition to show a pending state during the server action call.
 * After a successful sign, revalidatePath('/onboarding') (in signEngagementLetterAction)
 * causes Next.js to re-render the server component with the updated read model.
 */
export function LetterSignStep({
  engagementId,
  letterContent,
  isSigned,
  onSignComplete,
}: LetterSignStepProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSign() {
    setError(null);
    startTransition(async () => {
      const result = await signEngagementLetterAction(engagementId);
      if (result.success) {
        // revalidatePath('/onboarding') in the action causes the server component to re-render.
        // onSignComplete notifies tests / parent components of the updated model.
        onSignComplete?.(result.data);
      } else {
        setError(result.error ?? "Signing failed. Please try again.");
      }
    });
  }

  return (
    <div data-testid="letter-sign-step">
      {/* AC-IDNT-007-03 UI: Letter content — auto-escaped JSX text, not HTML */}
      {/* ADR-024 §6: content boundary — NEVER dangerouslySetInnerHTML */}
      <div
        className="mb-4 rounded-md border border-gray-200 bg-white p-4 text-sm text-gray-700 leading-relaxed"
        data-testid="letter-content"
        style={{ whiteSpace: "pre-wrap" }}
        aria-label="Engagement letter content"
      >
        {/* Auto-escaped JSX text — React renders this as text, not HTML */}
        {letterContent || (
          <span className="italic text-gray-400">
            No letter template configured. Contact your accountant.
          </span>
        )}
      </div>

      {/* Sign button or signed state */}
      {isSigned ? (
        <div
          className="flex items-center gap-2 text-sm font-medium text-green-700"
          data-testid="letter-signed-confirmation"
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
          Engagement letter signed
        </div>
      ) : (
        <div>
          <button
            type="button"
            onClick={handleSign}
            disabled={isPending}
            className={[
              "inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold text-white shadow-sm",
              isPending
                ? "bg-blue-400 cursor-not-allowed"
                : "bg-blue-600 hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600",
            ].join(" ")}
            data-testid="sign-letter-button"
            aria-label={isPending ? "Signing engagement letter…" : "Sign engagement letter"}
            aria-busy={isPending}
          >
            {isPending ? (
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
                Signing…
              </>
            ) : (
              "Sign Engagement Letter"
            )}
          </button>

          {error && (
            <p
              role="alert"
              className="mt-2 text-sm text-red-600"
              data-testid="sign-error-message"
            >
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
