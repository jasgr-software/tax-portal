/**
 * apps/admin/src/app/engagements/new/page.tsx
 *
 * Accountant-initiated engagement creation page.
 *
 * TASK-012-004: Initiate-engagement UI — client picker, active-services multi-select, tax-year input.
 *
 * Acceptance criteria:
 *   AC-DOOR-010-01 — accountant can initiate a new engagement for an existing client
 *   AC-DOOR-010-02 — she can select one or more active services for it
 *   AC-DOOR-010-03 — the engagement is created without an accept/decline step (direct creation)
 *   AC-DOOR-010-04 — the created engagement is associated with the chosen client
 *   AC-LIFE-011-02 — duplicate attempt warns and shows the existing engagement before any creation
 *   AC-LIFE-011-03 — from the warning: navigate to existing OR override to create the second
 *   AC-LIFE-011-04 — never silently blocked or redirected; condition always surfaced
 *
 * Server component shell: loads form data (clients + services) server-side.
 * Client component wrapper: drives the form state, duplicate warning, and server-action calls.
 *
 * ADR-006: Admin surface only — no mirror in apps/portal.
 * ADR-010: Apps/admin has NO public routes. Middleware guarantees ACCOUNTANT before this page.
 * ADR-003: form data loaded via loadInitiateEngagementFormData (admin pool, accountant-guarded).
 * CS-TS-003: page exists ONLY in apps/admin.
 * CS-GEN-003: cite governing authority in comments.
 *
 * // ADR-003 // ADR-006 // ADR-010 // CS-TS-003 // CS-GEN-003
 */

import { loadInitiateEngagementFormData } from "./actions";
import { InitiateEngagementForm } from "./_components/InitiateEngagementForm";

// ─── Metadata ─────────────────────────────────────────────────────────────────

export const metadata = {
  title: "New Engagement",
};

// ─── Page ─────────────────────────────────────────────────────────────────────

/**
 * Server component: loads the client list + active services for the form,
 * then renders the client-component form wrapper.
 *
 * AC-DOOR-010-01: presents the client picker.
 * AC-DOOR-010-02: presents the active-services multi-select.
 * ADR-003: loadInitiateEngagementFormData uses admin pool (accountant-guarded action).
 */
export default async function NewEngagementPage() {
  // AC-DOOR-010-01/-02: load clients + active services for the picker/multi-select.
  // ADR-003: admin pool, accountant-identity guard inside loadInitiateEngagementFormData.
  const { clients, services } = await loadInitiateEngagementFormData();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top nav */}
      <nav className="border-b border-gray-200 bg-white shadow-sm">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-14 items-center gap-6">
            <span className="text-base font-bold text-gray-900">Tax Portal</span>
            <nav className="flex gap-4 text-sm" aria-label="Main navigation">
              <a href="/" className="text-gray-500 hover:text-gray-900 transition-colors">
                Dashboard
              </a>
              <a href="/requests" className="text-gray-500 hover:text-gray-900 transition-colors">
                Requests
              </a>
              <a
                href="/engagements"
                className="text-gray-500 hover:text-gray-900 transition-colors"
              >
                Engagements
              </a>
            </nav>
          </div>
        </div>
      </nav>

      {/* Main content */}
      <main className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
            <a href="/engagements" className="hover:text-gray-700 transition-colors">
              Engagements
            </a>
            <span aria-hidden="true">›</span>
            <span className="text-gray-700">New</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Initiate Engagement</h1>
          <p className="mt-1 text-sm text-gray-500">
            Create a new engagement for an existing client without an accept/decline step.
          </p>
        </div>

        {clients.length === 0 ? (
          <div
            data-testid="no-clients-message"
            role="alert"
            className="rounded-lg border border-gray-200 bg-white p-8 text-center text-sm text-gray-500"
          >
            No clients are available yet. Accept a client request first.
          </div>
        ) : (
          // InitiateEngagementForm is the client component that handles all form state,
          // duplicate-warning rendering, and server-action calls.
          <InitiateEngagementForm clients={clients} services={services} />
        )}
      </main>
    </div>
  );
}
