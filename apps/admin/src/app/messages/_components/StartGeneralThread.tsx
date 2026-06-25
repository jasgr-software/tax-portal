/**
 * apps/admin/src/app/messages/_components/StartGeneralThread.tsx
 *
 * Start-general-thread affordance — ACCOUNTANT-ONLY.
 *
 * Renders a control that allows the accountant to initiate a new general (direct) thread
 * with a specific client (by User.id). Calls createGeneralThreadForClientAction.
 *
 * TASK-017-010: component now fetches its own client list via listClientsAction on mount,
 * so the selector is populated rather than rendering with an empty list.
 * The selector's chosen clientUserId is server-validated in createGeneralThreadForClientAction
 * before startGeneralThreadAction is called — never trusted raw from the form.
 *
 * AC-MSG-006-01: accountant can initiate a general thread with a specific client.
 * AC-MSG-002-01: selector is populated (listClientsAction) + chosen client → thread created.
 * AC-MSG-002-02: resulting thread associated with the chosen client.
 *
 * CS-TS-004: This component MUST ONLY appear in apps/admin — NEVER in apps/portal. // CS-TS-004
 * ADR-003: clientUserId is server-validated in createGeneralThreadForClientAction. // ADR-003
 * ADR-006: admin-ONLY affordance; start-general-thread has no CLIENT surface. // ADR-006
 * CS-GEN-001: no PII logged. // CS-GEN-001
 * CS-GEN-002: additive — accepts optional `clients` prop for SSR/test override; fetch
 *   on mount when prop is absent or empty. // CS-GEN-002
 * CS-GEN-003: governing keys cited throughout. // CS-GEN-003
 *
 * // AC-MSG-006-01 // AC-MSG-002-01 // AC-MSG-002-02
 * // CS-TS-004 // ADR-003 // ADR-006 // CS-GEN-001 // CS-GEN-002 // CS-GEN-003
 */

"use client";

import { useState, useEffect } from "react";
import {
  listClientsAction,
  createGeneralThreadForClientAction,
} from "../actions";
import type { ClientItem } from "@tax-portal/db";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StartGeneralThreadProps {
  /**
   * Optional pre-loaded list of clients (SSR injection or test override).
   * When provided and non-empty, the component uses this list directly without
   * fetching from listClientsAction.
   *
   * In production, pass no prop (or an empty array) and the component will fetch
   * via listClientsAction on mount. In tests, pass a fixture list.
   *
   * Each entry: { userId, displayName } — userId is User.id (server-resolved).
   *
   * CS-GEN-002: additive — accepts optional pre-loaded list for backward compat. // CS-GEN-002
   * ADR-003: the clientUserId is server-validated in createGeneralThreadForClientAction. // ADR-003
   */
  clients?: Array<{ userId: string; displayName: string }>;
  /** Callback after a thread is created (to refresh the thread list). */
  onCreated?: (threadId: string) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Map a ClientItem to the displayName shape used by the selector.
 * DECISION-E: firstName/lastName from EngagementRequest (not User model). // DECISION-E
 * CS-GEN-001: displayName is a display label — never logged. // CS-GEN-001
 */
function toDisplayName(client: ClientItem): string {
  const parts = [client.firstName, client.lastName].filter(Boolean);
  const name = parts.length > 0 ? parts.join(" ") : null;
  // Fall back to email if name is unavailable (edge case — no EngagementRequest linked yet)
  return name ?? client.email ?? client.clientUserId;
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * StartGeneralThread — ACCOUNTANT-ONLY control to initiate a general thread.
 *
 * Fetches clients from listClientsAction on mount so the selector is populated.
 * On submit, calls createGeneralThreadForClientAction which server-validates the
 * chosen clientUserId against the listed set before creating the thread.
 *
 * AC-MSG-006-01: accountant selects a client → thread created.
 * AC-MSG-002-01: selector populated (listClientsAction) + submit reaches createGeneralThreadForClientAction.
 * AC-MSG-002-02: resulting thread associated with the chosen client.
 * CS-TS-004: MUST ONLY appear in apps/admin. Portal has no equivalent affordance. // CS-TS-004
 *
 * // AC-MSG-006-01 // AC-MSG-002-01 // AC-MSG-002-02
 * // CS-TS-004 // ADR-003 // ADR-006 // CS-GEN-001 // CS-GEN-003
 */
export function StartGeneralThread({ clients: propClients, onCreated }: StartGeneralThreadProps) {
  const [selectedUserId, setSelectedUserId] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  // AC-MSG-002-01: fetch clients from listClientsAction so the selector is populated.
  // CS-GEN-002: when a non-empty propClients is supplied (SSR/test override), skip the fetch. // CS-GEN-002
  const [fetchedClients, setFetchedClients] = useState<Array<{ userId: string; displayName: string }>>([]);
  const [loadingClients, setLoadingClients] = useState(false);
  const [loadClientError, setLoadClientError] = useState<string | null>(null);

  // Determine which client list to display in the selector.
  // Prefer propClients when non-empty (test/SSR override); otherwise use fetched list.
  const displayClients =
    propClients && propClients.length > 0 ? propClients : fetchedClients;

  // Fetch clients on mount (when expanded for the first time) via listClientsAction.
  // ADR-003: listClientsAction is accountant-guarded — identity verified server-side. // ADR-003
  // CS-GEN-001: client names/emails are display data — never logged here. // CS-GEN-001
  useEffect(() => {
    // Only fetch when the form is expanded and we have no pre-loaded clients.
    if (!expanded) return;
    if (propClients && propClients.length > 0) return;
    if (fetchedClients.length > 0) return; // already fetched

    setLoadingClients(true);
    setLoadClientError(null);

    listClientsAction()
      .then((result) => {
        if (result.success) {
          // Map ClientItem → { userId, displayName } for the selector.
          setFetchedClients(
            result.data.map((c) => ({
              userId: c.clientUserId,
              displayName: toDisplayName(c),
            })),
          );
        } else {
          // CS-GEN-001: error message is generic — no PII. // CS-GEN-001
          setLoadClientError("Could not load client list. Please try again.");
        }
      })
      .catch(() => {
        // CS-GEN-001: no details surfaced. // CS-GEN-001
        setLoadClientError("Could not load client list. Please try again.");
      })
      .finally(() => {
        setLoadingClients(false);
      });
  }, [expanded, propClients, fetchedClients.length]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedUserId) return;

    setCreating(true);
    setError(null);

    // AC-MSG-002-01: call createGeneralThreadForClientAction with the chosen clientUserId.
    // The action server-validates the clientUserId against the listed set before calling
    // startGeneralThreadAction — never trusted raw from the form. // ADR-003
    // CS-GEN-001: no PII logged. // CS-GEN-001
    const result = await createGeneralThreadForClientAction(selectedUserId);

    if (result.success) {
      setSelectedUserId("");
      setExpanded(false);
      onCreated?.(result.data.id);
    } else {
      setError(result.error);
    }
    setCreating(false);
  }

  // CS-TS-004: This affordance is ACCOUNTANT-ONLY — admin surface only. // CS-TS-004
  // ADR-006: no equivalent exists in apps/portal. // ADR-006

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
        data-testid="start-general-thread-button"
        aria-label="Start new direct message thread with a client"
      >
        + New Message Thread
      </button>
    );
  }

  return (
    <div
      className="rounded border border-blue-200 bg-blue-50 p-4"
      data-testid="start-general-thread-form"
    >
      <h3 className="text-sm font-semibold text-gray-900 mb-3">
        Start Direct Thread
      </h3>

      {/* Error */}
      {error && (
        <div
          role="alert"
          className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          data-testid="start-thread-error"
        >
          {error}
        </div>
      )}

      {/* Client load error */}
      {loadClientError && (
        <div
          role="alert"
          className="mb-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700"
          data-testid="load-client-error"
        >
          {loadClientError}
        </div>
      )}

      <form onSubmit={handleCreate} className="flex items-end gap-3">
        {/* Client selector — server-fetched list; not raw user input */}
        {/* ADR-003: clientUserId server-resolved from the options list and validated in createGeneralThreadForClientAction. // ADR-003 */}
        <div className="flex-1">
          <label htmlFor="select-client" className="block text-xs text-gray-600 mb-1">
            Select client
          </label>
          <select
            id="select-client"
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            disabled={creating || loadingClients}
            data-testid="select-client"
            required
          >
            <option value="">
              {loadingClients ? "Loading clients…" : "-- Select a client --"}
            </option>
            {displayClients.map((c) => (
              <option key={c.userId} value={c.userId}>
                {/* React text node — auto-escaped */}
                {c.displayName}
              </option>
            ))}
          </select>
        </div>

        {/* Create + cancel buttons */}
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={creating || loadingClients || !selectedUserId}
            className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            data-testid="create-thread-submit"
          >
            {creating ? "Creating…" : "Create"}
          </button>
          <button
            type="button"
            onClick={() => {
              setExpanded(false);
              setError(null);
              setSelectedUserId("");
            }}
            className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
            data-testid="cancel-create-thread"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
