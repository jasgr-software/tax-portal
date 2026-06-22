"use client";

/**
 * apps/admin/src/app/engagements/[engagementId]/_components/EngagementStatusPanel.tsx
 *
 * Client component: the accountant's lifecycle control panel.
 *
 * TASK-010-003: Accountant transition / completion-gate / reopen surface.
 *
 * Acceptance criteria:
 *   AC-LIFE-001-03: accountant advances New → In Progress → Review → Complete in order
 *   AC-LIFE-003-01: accountant changes engagement status
 *   AC-LIFE-005-01: delivery confirmation required before Complete
 *   AC-LIFE-005-02: filing confirmation required before Complete
 *   AC-LIFE-006-01: accountant can reopen a Complete engagement
 *
 * Design:
 *   - Shows the current internal status (not the client-facing label — TASK-010-002 is portal-only)
 *   - Provides an "Advance" button for the next allowed forward step (New→IP, IP→Review)
 *   - For the Review→Complete step, shows the two-confirmation checkboxes (AC-LIFE-005-01/-02)
 *     and a "Complete" button that is DISABLED unless both are checked in the UI
 *   - When status is "Complete", shows a "Reopen" button (AC-LIFE-006-01)
 *   - All state mutations call server actions — no direct DB access in this component
 *
 * Two-confirmation gate (AC-LIFE-005-01/-02):
 *   The UI disables the Complete button until both checkboxes are checked.
 *   BUT the server independently enforces the same gate (see actions.ts / seam DECISION-010-C).
 *   A disabled button alone is NOT sufficient — the server is the authority.
 *
 * data-testid attributes (for e2e):
 *   data-testid="engagement-status-panel"    — root container
 *   data-testid="engagement-status-badge"    — current status display
 *   data-testid="advance-status-button"      — forward-step button (when available)
 *   data-testid="confirm-delivery-button"    — delivery confirmation button
 *   data-testid="confirm-filing-button"      — filing confirmation button
 *   data-testid="confirm-delivery-check"     — delivery confirmed indicator/checkbox
 *   data-testid="confirm-filing-check"       — filing confirmed indicator/checkbox
 *   data-testid="complete-engagement-button" — Complete button (disabled until both confirmed)
 *   data-testid="reopen-engagement-button"   — Reopen button (status=Complete only)
 *   data-testid="lifecycle-action-status"    — result message (success/error)
 *
 * ADR-006: Admin surface only — no mirror in apps/portal.
 * CS-TS-003: This component is admin-only (portal side is TASK-010-004).
 * CS-GEN-001: No PII logged or exposed in the component — only status + IDs.
 * CS-GEN-003: cite governing authority in comments.
 */

import { useState, useTransition } from "react";
import {
  advanceStatusAction,
  confirmDeliveryAction,
  confirmFilingAction,
  completeEngagementAction,
  reopenEngagementAction,
} from "../actions";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface EngagementStatusPanelProps {
  engagementId: string;
  /** Current internal status from the DB. Not client-facing label (ADR-006, TASK-010-002). */
  status: string;
  /** Whether delivery has been confirmed (deliveryConfirmedAt IS NOT NULL). */
  deliveryConfirmed: boolean;
  /** Whether filing has been confirmed (filingConfirmedAt IS NOT NULL). */
  filingConfirmed: boolean;
}

// ─── Allowed transitions map (mirrors LIFECYCLE_ALLOWED_TRANSITIONS from seam) ─
// DECISION: duplicating the map client-side for UI control only. The seam is the authority.
const NEXT_STATUS: Record<string, string | undefined> = {
  "New": "In Progress",
  "In Progress": "Review",
  "Review": "Complete",   // gated by confirmations
};

// ─── Status badge colour helper ────────────────────────────────────────────────

function statusBadgeClass(status: string): string {
  switch (status) {
    case "New":         return "bg-gray-100 text-gray-700";
    case "In Progress": return "bg-blue-100 text-blue-800";
    case "Review":      return "bg-yellow-100 text-yellow-800";
    case "Complete":    return "bg-green-100 text-green-800";
    default:            return "bg-gray-100 text-gray-500";
  }
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function EngagementStatusPanel({
  engagementId,
  status: initialStatus,
  deliveryConfirmed: initialDeliveryConfirmed,
  filingConfirmed: initialFilingConfirmed,
}: EngagementStatusPanelProps) {
  const [status, setStatus] = useState(initialStatus);
  const [deliveryConfirmed, setDeliveryConfirmed] = useState(initialDeliveryConfirmed);
  const [filingConfirmed, setFilingConfirmed] = useState(initialFilingConfirmed);
  const [actionMessage, setActionMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const nextStatus = NEXT_STATUS[status];

  // ── Advance (New→IP, IP→Review) ────────────────────────────────────────────
  function handleAdvance() {
    if (!nextStatus || nextStatus === "Complete") return;
    startTransition(async () => {
      setActionMessage(null);
      const result = await advanceStatusAction(engagementId, status, nextStatus);
      if (result.success) {
        setStatus(nextStatus);
        setActionMessage({ type: "success", text: `Status advanced to ${nextStatus}` });
      } else {
        setActionMessage({ type: "error", text: result.error });
      }
    });
  }

  // ── Confirm delivery ───────────────────────────────────────────────────────
  function handleConfirmDelivery() {
    startTransition(async () => {
      setActionMessage(null);
      const result = await confirmDeliveryAction(engagementId);
      if (result.success) {
        setDeliveryConfirmed(true);
        setActionMessage({ type: "success", text: "Delivery confirmed" });
      } else {
        setActionMessage({ type: "error", text: result.error });
      }
    });
  }

  // ── Confirm filing ─────────────────────────────────────────────────────────
  function handleConfirmFiling() {
    startTransition(async () => {
      setActionMessage(null);
      const result = await confirmFilingAction(engagementId);
      if (result.success) {
        setFilingConfirmed(true);
        setActionMessage({ type: "success", text: "Filing confirmed" });
      } else {
        setActionMessage({ type: "error", text: result.error });
      }
    });
  }

  // ── Complete (Review→Complete, two-confirmation gate) ─────────────────────
  // AC-LIFE-005-01/-02: UI disables the button until both are confirmed.
  // The server independently enforces the same gate (DECISION-010-C).
  function handleComplete() {
    if (!deliveryConfirmed || !filingConfirmed) return;
    startTransition(async () => {
      setActionMessage(null);
      const result = await completeEngagementAction(engagementId);
      if (result.success) {
        setStatus("Complete");
        setActionMessage({ type: "success", text: "Engagement marked Complete" });
      } else {
        setActionMessage({ type: "error", text: result.error });
      }
    });
  }

  // ── Reopen (Complete→In Progress) ─────────────────────────────────────────
  // AC-LIFE-006-01: accountant reopens a Complete engagement
  function handleReopen() {
    startTransition(async () => {
      setActionMessage(null);
      const result = await reopenEngagementAction(engagementId);
      if (result.success) {
        setStatus("In Progress");
        // Confirmations are cleared on reopen (DECISION-010-B)
        setDeliveryConfirmed(false);
        setFilingConfirmed(false);
        setActionMessage({ type: "success", text: "Engagement reopened — status set to In Progress" });
      } else {
        setActionMessage({ type: "error", text: result.error });
      }
    });
  }

  return (
    <div
      data-testid="engagement-status-panel"
      className="bg-white rounded-lg border border-gray-200 shadow-sm p-6"
    >
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Engagement Status</h2>

      {/* Current status badge */}
      <div className="flex items-center gap-3 mb-6">
        <span className="text-sm text-gray-600 font-medium">Current stage:</span>
        <span
          data-testid="engagement-status-badge"
          data-status={status}
          className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${statusBadgeClass(status)}`}
        >
          {status}
        </span>
      </div>

      {/* Action result message */}
      {actionMessage && (
        <div
          data-testid="lifecycle-action-status"
          role={actionMessage.type === "error" ? "alert" : "status"}
          className={`mb-4 rounded border px-4 py-3 text-sm ${
            actionMessage.type === "error"
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-green-200 bg-green-50 text-green-700"
          }`}
        >
          {actionMessage.text}
        </div>
      )}

      {/* ── Review-stage: completion confirmation affordances (AC-LIFE-005-01/-02) ── */}
      {status === "Review" && (
        <div className="mb-5 space-y-3">
          <p className="text-sm text-gray-600 font-medium">
            To complete this engagement, both confirmations are required:
          </p>

          {/* Delivery confirmation */}
          <div className="flex items-center justify-between rounded-md border border-gray-200 px-4 py-3 bg-gray-50">
            <div className="flex items-center gap-3">
              <span
                data-testid="confirm-delivery-check"
                data-confirmed={deliveryConfirmed ? "true" : "false"}
                className={`h-5 w-5 rounded flex items-center justify-center text-xs font-bold ${
                  deliveryConfirmed
                    ? "bg-green-500 text-white"
                    : "bg-white border-2 border-gray-300 text-transparent"
                }`}
              >
                ✓
              </span>
              <span className="text-sm text-gray-700">
                Delivery confirmed — tax return delivered to client
              </span>
            </div>
            {!deliveryConfirmed && (
              <button
                data-testid="confirm-delivery-button"
                onClick={handleConfirmDelivery}
                disabled={isPending}
                className="text-xs font-medium rounded-md px-3 py-1.5 bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Confirm delivery
              </button>
            )}
          </div>

          {/* Filing confirmation */}
          <div className="flex items-center justify-between rounded-md border border-gray-200 px-4 py-3 bg-gray-50">
            <div className="flex items-center gap-3">
              <span
                data-testid="confirm-filing-check"
                data-confirmed={filingConfirmed ? "true" : "false"}
                className={`h-5 w-5 rounded flex items-center justify-center text-xs font-bold ${
                  filingConfirmed
                    ? "bg-green-500 text-white"
                    : "bg-white border-2 border-gray-300 text-transparent"
                }`}
              >
                ✓
              </span>
              <span className="text-sm text-gray-700">
                Filing confirmed — tax return filed with IRS
              </span>
            </div>
            {!filingConfirmed && (
              <button
                data-testid="confirm-filing-button"
                onClick={handleConfirmFiling}
                disabled={isPending}
                className="text-xs font-medium rounded-md px-3 py-1.5 bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Confirm filing
              </button>
            )}
          </div>

          {/* Complete button — disabled until both confirmations (AC-LIFE-005-01/-02 UI gate) */}
          <div className="mt-4">
            <button
              data-testid="complete-engagement-button"
              onClick={handleComplete}
              disabled={isPending || !deliveryConfirmed || !filingConfirmed}
              aria-disabled={!deliveryConfirmed || !filingConfirmed}
              className="w-full rounded-md px-4 py-2 text-sm font-semibold bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
              title={
                !deliveryConfirmed || !filingConfirmed
                  ? "Both delivery and filing confirmations required"
                  : "Mark engagement as Complete"
              }
            >
              Mark as Complete
            </button>
            {(!deliveryConfirmed || !filingConfirmed) && (
              <p className="mt-1.5 text-xs text-amber-600 text-center">
                Requires both delivery and filing confirmations (AC-LIFE-005-01/-02)
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── Forward-advance button (New→IP, IP→Review) ─────────────────────── */}
      {nextStatus && nextStatus !== "Complete" && (
        <button
          data-testid="advance-status-button"
          data-from-status={status}
          data-to-status={nextStatus}
          onClick={handleAdvance}
          disabled={isPending}
          className="w-full rounded-md px-4 py-2 text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Advance to {nextStatus}
        </button>
      )}

      {/* ── Reopen button (AC-LIFE-006-01) ─────────────────────────────────── */}
      {status === "Complete" && (
        <button
          data-testid="reopen-engagement-button"
          onClick={handleReopen}
          disabled={isPending}
          className="w-full rounded-md px-4 py-2 text-sm font-semibold border border-amber-500 bg-white text-amber-700 hover:bg-amber-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Reopen engagement
        </button>
      )}

      {/* ── Completed state display ─────────────────────────────────────────── */}
      {status === "Complete" && (
        <p className="mt-3 text-center text-xs text-gray-400">
          This engagement is complete. Use &ldquo;Reopen&rdquo; to return it to In Progress.
        </p>
      )}
    </div>
  );
}
