/**
 * apps/admin/src/app/engagements/[engagementId]/documents/_components/RetentionPanel.tsx
 *
 * Admin-only component for purge-confirm + legal-hold place/lift surface.
 * TASK-015-003 / BRIEF-015 / EPIC-015 — post-retention destructive lifecycle.
 *
 * Acceptance criteria:
 *   AC-FILE-013-03 — The accountant must explicitly confirm before any data is permanently removed.
 *                    The purge confirm control is disabled until explicit confirmation is given.
 *   AC-FILE-014-01 — The accountant can place a legal hold on an individual engagement.
 *   AC-FILE-014-05 — The accountant can lift a legal hold on an engagement or client.
 *
 * This component:
 *   - Surfaces whether the engagement is purge-eligible and, if not, WHY
 *     (reason from purgeEligibility: 'in-window' | 'blocked-by-hold' | 'not-completed').
 *   - The reason comes from the server action — NEVER re-derived client-side (ADR-018 §6).
 *   - Confirm-before-purge: deliberate confirmation required (disabled until explicit confirmation
 *     given via typed engagement ID) — AC-FILE-013-03.
 *   - Place/lift legal-hold controls.
 *
 * ADR-006: Admin-only component — never imported in apps/portal.
 * ADR-018 §5/§6: Purge is never-automatic; hold suspends indefinitely.
 * GUARDRAIL: No dangerouslySetInnerHTML anywhere in this component.
 * GUARDRAIL: engagementId comes from the server-resolved route param — never from client input.
 *
 * data-testid hooks (for TASK-015-004 e2e):
 *   data-testid="retention-panel"                   — panel container
 *   data-testid="purge-eligibility-reason"          — eligibility reason text
 *   data-testid="legal-hold-place"                  — Place hold button
 *   data-testid="legal-hold-lift-{holdId}"          — Lift hold button (per hold)
 *   data-testid="active-holds-list"                 — list of active holds
 *   data-testid="active-hold-item-{holdId}"         — each active hold item
 *   data-testid="purge-button"                      — Purge button (disabled until confirmed)
 *   data-testid="purge-confirm-input"               — confirmation input field (type engagement ID)
 *   data-testid="purge-confirm-submit"              — Final confirm + purge button
 *   data-testid="purge-result"                      — purge outcome message
 *   data-testid="hold-result"                       — place/lift hold outcome message
 *
 * // ADR-006 // ADR-018 §5/§6 // CS-TS-003 // CS-TS-004 // CS-GEN-003
 * // AC-FILE-013-03 // AC-FILE-014-01 // AC-FILE-014-05
 */

"use client";

import { useState, useTransition } from "react";
import {
  purgeEngagementAction,
  placeLegalHoldAction,
  liftLegalHoldAction,
} from "../retention-actions";
import type { PurgeEligibilityResult, LegalHoldItem } from "../retention-actions";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RetentionPanelProps {
  /** Engagement ID from the server-resolved route param. */
  engagementId: string;
  /** Purge eligibility derived server-side (TASK-015-002 purgeEligibility). */
  eligibility: PurgeEligibilityResult;
  /** Active legal holds for this engagement — server-fetched before hydration. */
  activeHolds: LegalHoldItem[];
  /** Called after a purge or hold action completes so the parent can refresh. */
  onRetentionChange?: () => void;
}

// ─── Eligibility reason labels ────────────────────────────────────────────────

/**
 * Map the server-derived eligibility reason to a human-readable label.
 * NEVER re-derive the rule in this component — surfaces the server's reason only.
 * ADR-018 §3/§5/§6 / AC-FILE-013-01 / AC-FILE-014-03
 */
function eligibilityReasonLabel(
  eligibility: PurgeEligibilityResult,
): { label: string; className: string } {
  if (eligibility.eligible) {
    return {
      label: "Eligible for purge — retention window has elapsed and no active hold.",
      className: "text-amber-700 bg-amber-50 border-amber-200",
    };
  }
  switch (eligibility.reason) {
    case "blocked-by-hold":
      // AC-FILE-014-03: active hold blocks purge even post-expiry.
      return {
        label: "Not eligible — engagement is under an active legal hold.",
        className: "text-blue-700 bg-blue-50 border-blue-200",
      };
    case "in-window":
      // AC-FILE-013-01: data within the retention window cannot be purged.
      return {
        label: "Not eligible — engagement data is within the 7-year retention window.",
        className: "text-green-700 bg-green-50 border-green-200",
      };
    case "not-completed":
      // Engagement was never completed; retention clock is not running.
      return {
        label: "Not eligible — engagement has not been completed; retention clock not started.",
        className: "text-gray-700 bg-gray-50 border-gray-200",
      };
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * RetentionPanel — admin-only purge + legal-hold controls.
 *
 * AC-FILE-013-03: Confirm-before-purge — disabled until the accountant types the engagement ID.
 * AC-FILE-014-01: Place legal hold on this engagement.
 * AC-FILE-014-05: Lift an active legal hold.
 *
 * // ADR-006 // ADR-018 §5/§6 // CS-GEN-003 // AC-FILE-013-03 // AC-FILE-014-01 // AC-FILE-014-05
 */
export function RetentionPanel({
  engagementId,
  eligibility,
  activeHolds: initialActiveHolds,
  onRetentionChange,
}: RetentionPanelProps) {
  // ── Purge confirm flow ──────────────────────────────────────────────────────
  // AC-FILE-013-03: The purge button is disabled until the accountant types the
  // engagement ID exactly. This is the deliberate confirmation mechanism.
  // Irreversible destruction must NOT be one-click.
  const [confirmInput, setConfirmInput] = useState("");
  const [showPurgeConfirm, setShowPurgeConfirm] = useState(false);
  const [purgeResult, setPurgeResult] = useState<string | null>(null);
  const [purgeError, setPurgeError] = useState<string | null>(null);
  const [isPurgePending, startPurgeTransition] = useTransition();

  // ── Hold controls ───────────────────────────────────────────────────────────
  const [activeHolds, setActiveHolds] = useState<LegalHoldItem[]>(initialActiveHolds);
  const [holdResult, setHoldResult] = useState<string | null>(null);
  const [holdError, setHoldError] = useState<string | null>(null);
  const [isHoldPending, startHoldTransition] = useTransition();

  // Confirmation is valid only when the typed value exactly matches the engagement ID.
  // AC-FILE-013-03: explicit, deliberate confirmation required.
  const isConfirmed = confirmInput.trim() === engagementId.trim(); // AC-FILE-013-03

  // ── Purge handler ───────────────────────────────────────────────────────────

  function handlePurge() {
    if (!isConfirmed) return; // Belt-and-suspenders guard (AC-FILE-013-03)

    setPurgeError(null);
    setPurgeResult(null);

    startPurgeTransition(async () => {
      // Pass the explicit confirmation signal — only reaches here when isConfirmed === true.
      // AC-FILE-013-03 // ADR-018 §5: no purge without confirmed: true in the action.
      const result = await purgeEngagementAction(engagementId, isConfirmed);

      if (!result.success) {
        setPurgeError(result.error);
        return;
      }

      switch (result.data.outcome) {
        case "purged":
          setPurgeResult("Purge complete — engagement data has been permanently removed.");
          setShowPurgeConfirm(false);
          setConfirmInput("");
          onRetentionChange?.();
          break;
        case "not-confirmed":
          // Should not reach here if the guard is working, but handle defensively.
          setPurgeError("Purge was not confirmed.");
          break;
        case "blocked-by-hold":
          setPurgeError("Purge blocked — engagement is under an active legal hold.");
          break;
        case "in-window":
          setPurgeError("Purge blocked — engagement data is within the 7-year retention window.");
          break;
        case "not-completed":
          setPurgeError("Purge blocked — engagement has not been completed.");
          break;
        case "not-found":
          setPurgeError("Engagement not found.");
          break;
      }
    });
  }

  // ── Place hold handler ──────────────────────────────────────────────────────

  function handlePlaceHold() {
    setHoldError(null);
    setHoldResult(null);

    startHoldTransition(async () => {
      const result = await placeLegalHoldAction(engagementId);

      if (!result.success) {
        setHoldError(result.error);
        return;
      }

      const holdData = result.data;
      switch (holdData.outcome) {
        case "placed":
          setHoldResult("Legal hold placed on this engagement.");
          // Optimistically update the holds list so the UI reflects the new state.
          // The parent will re-fetch on onRetentionChange if provided.
          setActiveHolds((prev) => [
            ...prev,
            {
              id: holdData.holdId,
              scope: "engagement" as const,
              engagementId,
              clientUserId: null,
              placedByClerkId: "current",
              placedAt: new Date(),
              liftedByClerkId: null,
              liftedAt: null,
              reason: null,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ]);
          onRetentionChange?.();
          break;
        case "already-held":
          setHoldResult("A legal hold is already active for this engagement.");
          break;
        case "not-found":
          setHoldError("Engagement not found.");
          break;
      }
    });
  }

  // ── Lift hold handler ───────────────────────────────────────────────────────

  function handleLiftHold(holdId: string) {
    setHoldError(null);
    setHoldResult(null);

    startHoldTransition(async () => {
      const result = await liftLegalHoldAction(holdId, engagementId);

      if (!result.success) {
        setHoldError(result.error);
        return;
      }

      switch (result.data.outcome) {
        case "lifted":
          setHoldResult("Legal hold lifted — purge eligibility restored if window has elapsed.");
          // Remove the lifted hold from the local list.
          setActiveHolds((prev) => prev.filter((h) => h.id !== holdId));
          onRetentionChange?.();
          break;
        case "already-lifted":
          setHoldResult("Hold was already lifted.");
          setActiveHolds((prev) => prev.filter((h) => h.id !== holdId));
          break;
        case "not-found":
          setHoldError("Legal hold not found.");
          break;
      }
    });
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const reasonInfo = eligibilityReasonLabel(eligibility);

  return (
    <section
      className="rounded-lg border border-gray-200 bg-white mt-6"
      aria-label="Retention & legal hold"
      data-testid="retention-panel"
    >
      <div className="px-4 py-3 border-b border-gray-100">
        <h2 className="text-sm font-semibold text-gray-700">
          Retention &amp; Purge
        </h2>
      </div>

      <div className="p-4 space-y-6">

        {/* ── Eligibility status ─────────────────────────────────────────────── */}
        {/* Surfaces the server-derived reason — NEVER re-implements the rule. */}
        {/* ADR-018 §3/§5/§6 / AC-FILE-013-01 / AC-FILE-014-03 */}
        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Purge Eligibility
          </h3>
          <div
            className={`rounded border px-3 py-2 text-sm ${reasonInfo.className}`}
            data-testid="purge-eligibility-reason"
          >
            {/* GUARDRAIL: auto-escaped JSX text — no dangerouslySetInnerHTML */}
            {reasonInfo.label}
          </div>
        </div>

        {/* ── Active holds ───────────────────────────────────────────────────── */}
        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Active Legal Holds
          </h3>

          {activeHolds.length === 0 ? (
            <p className="text-sm text-gray-500">No active legal holds.</p>
          ) : (
            <ul
              className="divide-y divide-gray-100 rounded border border-gray-200"
              data-testid="active-holds-list"
            >
              {activeHolds.map((hold) => (
                <li
                  key={hold.id}
                  className="flex items-center justify-between px-3 py-2"
                  data-testid={`active-hold-item-${hold.id}`}
                >
                  <span className="text-sm text-gray-700">
                    {hold.scope === "client" ? "Client-scoped hold" : "Engagement hold"}
                    {hold.reason ? ` — ${hold.reason}` : ""}
                    <span className="ml-2 text-xs text-gray-400">
                      Placed {hold.placedAt.toLocaleDateString()}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => handleLiftHold(hold.id)}
                    disabled={isHoldPending}
                    className="ml-4 rounded px-2 py-1 text-xs font-medium text-red-700 bg-red-50 border border-red-200 hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    data-testid={`legal-hold-lift-${hold.id}`}
                  >
                    {/* AC-FILE-014-05: lift a hold */}
                    Lift Hold
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* ── Place hold ─────────────────────────────────────────────────────── */}
        {/* AC-FILE-014-01: place a legal hold on this engagement */}
        <div>
          <button
            type="button"
            onClick={handlePlaceHold}
            disabled={isHoldPending}
            className="rounded px-3 py-1.5 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            data-testid="legal-hold-place"
          >
            Place Legal Hold
          </button>

          {holdResult && (
            <p
              className="mt-2 text-sm text-green-700"
              data-testid="hold-result"
              role="status"
            >
              {/* GUARDRAIL: auto-escaped */}
              {holdResult}
            </p>
          )}
          {holdError && (
            <p
              className="mt-2 text-sm text-red-700"
              data-testid="hold-error"
              role="alert"
            >
              {/* GUARDRAIL: auto-escaped */}
              {holdError}
            </p>
          )}
        </div>

        {/* ── Purge confirm flow ─────────────────────────────────────────────── */}
        {/* AC-FILE-013-03: Explicit confirmation required before purge. */}
        {/* ADR-018 §5: NEVER-AUTOMATIC; accountant must confirm. */}
        {eligibility.eligible && (
          <div className="border border-red-200 rounded-lg p-4 bg-red-50">
            <h3 className="text-sm font-semibold text-red-800 mb-1">
              Permanent Purge
            </h3>
            <p className="text-xs text-red-700 mb-3">
              This will permanently remove all documents and data for this engagement.
              This action cannot be undone. Audit records will be preserved.
            </p>

            {!showPurgeConfirm ? (
              <button
                type="button"
                onClick={() => setShowPurgeConfirm(true)}
                className="rounded px-3 py-1.5 text-sm font-medium text-red-700 bg-white border border-red-300 hover:bg-red-50 transition-colors"
                data-testid="purge-button"
              >
                Initiate Purge…
              </button>
            ) : (
              <div className="space-y-3">
                {/* AC-FILE-013-03: deliberate confirm — type the engagement ID */}
                <p className="text-xs text-red-700">
                  Type the engagement ID exactly to confirm:{" "}
                  <span className="font-mono font-semibold">{engagementId}</span>
                </p>
                <input
                  type="text"
                  value={confirmInput}
                  onChange={(e) => setConfirmInput(e.target.value)}
                  placeholder="Type engagement ID to confirm"
                  className="block w-full rounded border border-red-300 px-2 py-1 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-red-400"
                  aria-label="Confirm by typing the engagement ID"
                  data-testid="purge-confirm-input"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handlePurge}
                    disabled={!isConfirmed || isPurgePending}
                    className="rounded px-3 py-1.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    aria-disabled={!isConfirmed || isPurgePending}
                    data-testid="purge-confirm-submit"
                  >
                    {/* AC-FILE-013-03: button disabled until confirmation is valid */}
                    {isPurgePending ? "Purging…" : "Confirm Purge"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowPurgeConfirm(false);
                      setConfirmInput("");
                      setPurgeError(null);
                    }}
                    className="rounded px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 transition-colors"
                    data-testid="purge-cancel"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {purgeResult && (
              <p
                className="mt-3 text-sm text-green-700"
                data-testid="purge-result"
                role="status"
              >
                {purgeResult}
              </p>
            )}
            {purgeError && (
              <p
                className="mt-3 text-sm text-red-700"
                data-testid="purge-error"
                role="alert"
              >
                {purgeError}
              </p>
            )}
          </div>
        )}

        {/* Non-eligible message with a summary reason */}
        {!eligibility.eligible && (
          <div className="text-xs text-gray-400 italic">
            Purge is not available for this engagement at this time.
          </div>
        )}

      </div>
    </section>
  );
}
