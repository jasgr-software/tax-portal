/**
 * apps/admin/src/app/requests/_components/DecisionActions.tsx
 *
 * Client component — Accept button + Decline form (reason textarea).
 * Wired into the `decisionSlot` prop of RequestDetail (TASK-003-005).
 *
 * Only rendered when the request is in a decidable state ('pending' or 'awaiting_review').
 * When already decided, a read-only summary is shown instead.
 *
 * AC-DOOR-006-02: Accept button triggers acceptRequest() server action.
 * AC-DOOR-006-03: Decline form captures reason + triggers declineRequest() server action.
 * AC-DOOR-006-04: Server actions guard ACCOUNTANT identity (role server-evaluated).
 * AC-DOOR-006-05: Server actions reject if already decided (error surface to UI).
 * AC-DOOR-007-01/-02: Acceptance triggers invitation email via the action.
 * AC-DOOR-008-01: Reason textarea captures the free-text decline reason.
 * AC-DOOR-008-02/-03: Decline action sends the reason email via the action.
 *
 * 'use client' — required for useState, form submission, and router refresh.
 *
 * ADR-006: Admin-only component — never imported in apps/portal.
 */

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { acceptRequest, declineRequest } from "../actions";
import type { DecisionResult } from "../actions";

// ─── Props ────────────────────────────────────────────────────────────────────

interface DecisionActionsProps {
  /** The engagement request ID to act on */
  requestId: string;
  /** Current request status — determines if decision affordances are shown */
  status: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * DecisionActions — Accept/Decline affordances for a pending engagement request.
 *
 * Rendered inside RequestDetail's `decisionSlot` when the request is decidable.
 *
 * State:
 *   - `view`: 'idle' | 'decline-form' | 'result'
 *   - `declineReason`: the textarea content
 *   - `result`: the DecisionResult from the last action
 *
 * Transitions:
 *   idle → (click Accept) → calls acceptRequest() → result
 *   idle → (click Decline) → decline-form
 *   decline-form → (submit) → calls declineRequest(reason) → result
 *   decline-form → (click Cancel) → idle
 */
export function DecisionActions({ requestId, status }: DecisionActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [view, setView] = useState<"idle" | "decline-form" | "result">("idle");
  const [declineReason, setDeclineReason] = useState("");
  const [result, setResult] = useState<DecisionResult | null>(null);

  // Not a decidable status — show nothing (the detail page shows the status badge)
  const isDecidable = status === "pending" || status === "awaiting_review";

  if (!isDecidable) {
    return null;
  }

  // ── Result view ────────────────────────────────────────────────────────────

  if (view === "result" && result) {
    if (!result.success) {
      const isAlreadyDecided = result.error === "already_decided";
      return (
        <div
          className="rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
          role="alert"
          data-testid="decision-result-error"
        >
          {isAlreadyDecided
            ? "This request has already been decided. Refreshing…"
            : `An error occurred: ${result.error}`}
          {isAlreadyDecided && (
            <button
              className="ml-2 underline"
              onClick={() => router.refresh()}
              data-testid="decision-refresh-btn"
            >
              Refresh
            </button>
          )}
        </div>
      );
    }

    // Success
    return (
      <div
        className="space-y-2"
        data-testid="decision-result-success"
      >
        <div className="rounded border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          Decision recorded successfully.
          {!result.emailSent && (
            <span className="block mt-1 text-amber-700" data-testid="decision-email-warning">
              Note: {result.emailError}
            </span>
          )}
        </div>
        <button
          className="text-sm text-blue-600 hover:underline"
          onClick={() => router.refresh()}
          data-testid="decision-refresh-btn"
        >
          Refresh to see updated status
        </button>
      </div>
    );
  }

  // ── Decline form view ──────────────────────────────────────────────────────

  if (view === "decline-form") {
    return (
      <div className="space-y-4" data-testid="decline-form">
        <div>
          <label
            htmlFor="decline-reason"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Decline reason <span className="text-red-500">*</span>
          </label>
          <textarea
            id="decline-reason"
            name="decline-reason"
            rows={4}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="Briefly explain why you are declining this request…"
            value={declineReason}
            onChange={(e) => setDeclineReason(e.target.value)}
            disabled={isPending}
            data-testid="decline-reason-textarea"
            // AC-DOOR-008-01: captures the free-text reason
          />
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            disabled={isPending || !declineReason.trim()}
            onClick={() => {
              startTransition(async () => {
                const actionResult = await declineRequest(requestId, declineReason);
                setResult(actionResult);
                setView("result");
              });
            }}
            className="inline-flex items-center rounded bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid="decline-submit-btn"
          >
            {isPending ? "Declining…" : "Confirm Decline"}
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => {
              setView("idle");
              setDeclineReason("");
            }}
            className="inline-flex items-center rounded border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            data-testid="decline-cancel-btn"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // ── Idle view (Accept + Decline buttons) ───────────────────────────────────

  return (
    <div className="flex gap-3" data-testid="decision-idle">
      {/* Accept button — AC-DOOR-006-02 / AC-DOOR-007-01 */}
      <button
        type="button"
        disabled={isPending}
        onClick={() => {
          startTransition(async () => {
            const actionResult = await acceptRequest(requestId);
            setResult(actionResult);
            setView("result");
          });
        }}
        className="inline-flex items-center rounded bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
        data-testid="accept-btn"
      >
        {isPending ? "Processing…" : "Accept"}
      </button>

      {/* Decline button — opens the decline form (AC-DOOR-008-01) */}
      <button
        type="button"
        disabled={isPending}
        onClick={() => setView("decline-form")}
        className="inline-flex items-center rounded border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
        data-testid="decline-btn"
      >
        Decline
      </button>
    </div>
  );
}
