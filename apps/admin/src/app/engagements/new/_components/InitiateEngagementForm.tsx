/**
 * apps/admin/src/app/engagements/new/_components/InitiateEngagementForm.tsx
 *
 * Client component: the interactive form for accountant-initiated engagement creation.
 *
 * TASK-012-004: Initiate-engagement form — client picker, services multi-select, tax-year input,
 * and duplicate-guard warning flow.
 *
 * Acceptance criteria:
 *   AC-DOOR-010-01 — accountant can initiate a new engagement for an existing client
 *   AC-DOOR-010-02 — she can select one or more active services for it
 *   AC-DOOR-010-03 — direct creation (no accept/decline step imposed)
 *   AC-DOOR-010-04 — the created engagement is associated with the chosen client
 *   AC-LIFE-011-02 — duplicate attempt renders <DuplicateWarning> with existing engagement data
 *   AC-LIFE-011-03 — from warning: navigate (link) to existing OR override (re-submit with override=true)
 *   AC-LIFE-011-04 — never silently blocks or redirects — warning is always shown
 *
 * data-* hooks used by e2e:
 *   data-testid="initiate-engagement-form"    — form root
 *   data-testid="client-select"               — client picker <select>
 *   data-testid="service-checkbox-{id}"       — per-service checkbox
 *   data-testid="tax-year-input"              — tax year <input>
 *   data-testid="submit-initiate"             — primary submit button
 *   data-testid="form-error"                  — top-level error message
 *   data-testid="success-message"             — success confirmation
 *   (duplicate-warning hooks are in DuplicateWarning.tsx)
 *
 * ADR-006: Admin surface only — no portal mirror.
 * CS-TS-003: component exists ONLY in apps/admin.
 * CS-GEN-001: no PII logged.
 * CS-GEN-003: cite governing authority in comments.
 *
 * // ADR-006 // CS-TS-003 // CS-GEN-001 // CS-GEN-003
 */

"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { initiateEngagement } from "../actions";
import { DuplicateWarning } from "../DuplicateWarning";
import type { ClientListItem, ServiceSelectItem, DuplicateMatchItem } from "../actions";

// ─── Props ────────────────────────────────────────────────────────────────────

interface InitiateEngagementFormProps {
  clients: ClientListItem[];
  services: ServiceSelectItem[];
}

// ─── Form state ───────────────────────────────────────────────────────────────

type FormState =
  | { phase: "form" }
  | { phase: "duplicate_warning"; matches: DuplicateMatchItem[]; pendingPayload: FormPayload }
  | { phase: "success"; engagementId: string };

interface FormPayload {
  clientUserId: string;
  serviceIds: string[];
  taxYear: number;
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * Interactive form for accountant-initiated engagement creation.
 *
 * AC-DOOR-010-01/-02: client picker + service multi-select.
 * AC-LIFE-011-02/-03/-04: on duplicate → show <DuplicateWarning>; never auto-redirect.
 *
 * // DECISION (TASK-012-004): form state machine:
 * //   'form'               → initial state; accountant fills the form
 * //   'duplicate_warning'  → server returned a duplicate; show DuplicateWarning
 * //   'success'            → engagement created; show success message + link
 * // Transitions:
 * //   form → [submit no-dup]   → success
 * //   form → [submit dup]      → duplicate_warning
 * //   duplicate_warning → [navigate] → (accountant clicks link — browser navigation)
 * //   duplicate_warning → [override] → success (re-submit with override=true)
 * //   duplicate_warning → [cancel]   → form
 */
export function InitiateEngagementForm({ clients, services }: InitiateEngagementFormProps) {
  const router = useRouter();

  // Form field state — clientUserId is the User.id from loadInitiateEngagementFormData (server-authoritative)
  const [clientUserId, setClientUserId] = useState<string>(clients[0]?.id ?? "");
  const [selectedServiceIds, setSelectedServiceIds] = useState<Set<string>>(new Set());
  const [taxYear, setTaxYear] = useState<string>(String(new Date().getFullYear()));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Overall state machine
  const [formState, setFormState] = useState<FormState>({ phase: "form" });

  // ── Service checkbox toggle ───────────────────────────────────────────────
  const toggleService = useCallback((serviceId: string) => {
    setSelectedServiceIds((prev) => {
      const next = new Set(prev);
      if (next.has(serviceId)) {
        next.delete(serviceId);
      } else {
        next.add(serviceId);
      }
      return next;
    });
  }, []);

  // ── Submit handler ────────────────────────────────────────────────────────

  /**
   * Handle the primary form submit (or override re-submit).
   *
   * AC-DOOR-010-03: calls initiateEngagement with no override=false (no accept/decline gate).
   * AC-LIFE-011-02: on duplicate_warning result → transition to 'duplicate_warning' phase.
   * AC-LIFE-011-03: on override=true → create proceeds unconditionally.
   * AC-LIFE-011-04: never silently blocks — result is always surfaced.
   */
  async function handleSubmit(override = false) {
    setError(null);
    setSubmitting(true);

    const parsedYear = parseInt(taxYear, 10);
    const serviceIdArray = Array.from(selectedServiceIds);

    // Client-side validation (server also validates)
    if (!clientUserId) {
      setError("Please select a client.");
      setSubmitting(false);
      return;
    }
    if (serviceIdArray.length === 0) {
      setError("Please select at least one service.");
      setSubmitting(false);
      return;
    }
    if (isNaN(parsedYear) || parsedYear < 2000 || parsedYear > 2100) {
      setError("Please enter a valid tax year (2000–2100).");
      setSubmitting(false);
      return;
    }

    try {
      // AC-DOOR-010-01/-02/-03: call the server action
      const result = await initiateEngagement(
        clientUserId,
        serviceIdArray,
        parsedYear,
        override,
      );

      if (result.status === "created") {
        // AC-DOOR-010-03/-04: engagement created directly; navigate to it.
        setFormState({ phase: "success", engagementId: result.engagementId });
        // Redirect after a brief moment so success message is visible.
        setTimeout(() => {
          router.push(`/engagements/${result.engagementId}`);
        }, 800);
      } else if (result.status === "duplicate_warning") {
        // AC-LIFE-011-02/-04: duplicate found — surface the warning (never silently block).
        setFormState({
          phase: "duplicate_warning",
          matches: result.matches,
          pendingPayload: { clientUserId, serviceIds: serviceIdArray, taxYear: parsedYear },
        });
      } else {
        // result.status === 'error'
        setError(result.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred.");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Override handler (from DuplicateWarning) ──────────────────────────────

  /**
   * Re-submit with override=true — creates the second engagement unconditionally.
   * AC-LIFE-011-03: the accountant explicitly chose to override.
   */
  async function handleOverride() {
    await handleSubmit(true);
  }

  // ── Cancel override — go back to form ────────────────────────────────────
  function handleCancelOverride() {
    setFormState({ phase: "form" });
    setError(null);
  }

  // ─── Render: duplicate_warning phase ──────────────────────────────────────
  if (formState.phase === "duplicate_warning") {
    return (
      <DuplicateWarning
        matches={formState.matches}
        onOverride={handleOverride}
        onCancel={handleCancelOverride}
      />
    );
  }

  // ─── Render: success phase ─────────────────────────────────────────────────
  if (formState.phase === "success") {
    return (
      <div
        data-testid="success-message"
        role="status"
        className="rounded-lg border border-green-300 bg-green-50 p-8 text-center"
      >
        <p className="text-sm font-semibold text-green-800">Engagement created successfully.</p>
        <p className="mt-1 text-xs text-green-700">Redirecting to the engagement…</p>
        <a
          href={`/engagements/${formState.engagementId}`}
          data-testid="engagement-link"
          className="mt-3 inline-block text-sm text-green-800 underline hover:text-green-900"
        >
          Go to engagement
        </a>
      </div>
    );
  }

  // ─── Render: form phase ────────────────────────────────────────────────────
  return (
    <div className="rounded-lg border border-gray-200 bg-white shadow-sm p-6">
      <form
        data-testid="initiate-engagement-form"
        onSubmit={(e) => {
          e.preventDefault();
          void handleSubmit(false);
        }}
        noValidate
        className="space-y-6"
      >
        {/* Top-level error (AC-LIFE-011-04: never silently fail) */}
        {error && (
          <div
            data-testid="form-error"
            role="alert"
            className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            {error}
          </div>
        )}

        {/* AC-DOOR-010-01: Client picker */}
        <div>
          <label
            htmlFor="client-select"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Client <span aria-hidden="true" className="text-red-500">*</span>
          </label>
          <select
            id="client-select"
            data-testid="client-select"
            value={clientUserId}
            onChange={(e) => setClientUserId(e.target.value)}
            required
            className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="" disabled>
              — Select a client —
            </option>
            {clients.map((client) => (
              <option key={client.id} value={client.id} data-testid={`client-option-${client.id}`}>
                {client.email}
              </option>
            ))}
          </select>
        </div>

        {/* AC-DOOR-010-02: Service multi-select (checkboxes) */}
        <fieldset>
          <legend className="block text-sm font-medium text-gray-700 mb-2">
            Services <span aria-hidden="true" className="text-red-500">*</span>
          </legend>
          {services.length === 0 ? (
            <p className="text-sm text-gray-500">
              No active services available. Add services first.
            </p>
          ) : (
            <div className="space-y-2">
              {services.map((svc) => (
                <label
                  key={svc.id}
                  className="flex items-center gap-3 rounded-md border border-gray-200 px-4 py-2.5 hover:bg-gray-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    data-testid={`service-checkbox-${svc.id}`}
                    checked={selectedServiceIds.has(svc.id)}
                    onChange={() => toggleService(svc.id)}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-900">{svc.name}</span>
                </label>
              ))}
            </div>
          )}
        </fieldset>

        {/* Tax year input */}
        <div>
          <label
            htmlFor="tax-year-input"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Tax Year <span aria-hidden="true" className="text-red-500">*</span>
          </label>
          <input
            id="tax-year-input"
            type="number"
            data-testid="tax-year-input"
            value={taxYear}
            onChange={(e) => setTaxYear(e.target.value)}
            required
            min={2000}
            max={2100}
            placeholder="e.g. 2024"
            className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {/* Submit */}
        <div className="flex items-center gap-4 pt-2">
          <button
            type="submit"
            data-testid="submit-initiate"
            disabled={submitting}
            className="inline-flex items-center rounded-md bg-blue-600 px-5 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? "Creating…" : "Create Engagement"}
          </button>
          <a
            href="/engagements"
            className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            Cancel
          </a>
        </div>
      </form>
    </div>
  );
}
