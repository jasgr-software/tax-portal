/**
 * apps/admin/src/app/engagements/[engagementId]/page.tsx
 *
 * Per-engagement view for the accountant — lifecycle management + attribute surface.
 *
 * TASK-010-003: Accountant transition / completion-gate / reopen surface.
 * TASK-011-003: Accountant attribute management (due date / note / priority flag) surface.
 *
 * Acceptance criteria:
 *   AC-LIFE-001-03: accountant advances New → In Progress → Review → Complete in order
 *   AC-LIFE-003-01: accountant changes engagement status
 *   AC-LIFE-005-01: delivery confirmation required before Complete (UI + server)
 *   AC-LIFE-005-02: filing confirmation required before Complete (UI + server)
 *   AC-LIFE-006-01: accountant reopens a Complete engagement
 *   AC-LIFE-007-01: accountant sets a due date on an engagement
 *   AC-LIFE-007-02: accountant updates the due date after it has been set
 *   AC-LIFE-008-01: accountant records internal notes on an engagement
 *   AC-LIFE-009-01: accountant flags an engagement as priority
 *   AC-LIFE-009-02: accountant removes the priority flag
 *
 * ADR-010: apps/admin has NO public routes. Middleware guarantees ACCOUNTANT before this page.
 *   This page adds a defense-in-depth identity guard (mirrors document-requests/page.tsx).
 * ADR-003: Engagement attributes read via getEngagementForAdmin (admin pool — no SESSION_CONTEXT
 *   needed for admin-surface reads, per DECISION in TASK-008-003).
 *   Notes read via listEngagementNotes MUST be wrapped in withRequestContext (REQUEST POOL,
 *   sec.pol_EngagementNote governs visibility — ADR-003 / ADR-005 / CS-TS-001).
 * ADR-005: Identity from verified session only — never from URL params or form data.
 * ADR-006: This page is apps/admin ONLY. No mirror route in apps/portal. Notes panel
 *   NEVER surfaced in apps/portal (CS-TS-003 negative obligation).
 *
 * Pool strategy:
 *   Page guard: identity check via getAuthProvider() (mirrors document-requests/page.tsx).
 *   Engagement read: getEngagementForAdmin (admin pool, TASK-011-003 extended select).
 *   Notes read: listEngagementNotes wrapped in withRequestContext (REQUEST POOL, ADR-003).
 *
 * // ADR-003: admin pool for admin-surface reads; withRequestContext for notes (RLS gate)
 * // ADR-006: admin surface only — notes panel NEVER in apps/portal
 * // CS-TS-001: uses @tax-portal/db barrel for all reads (no raw pool import)
 * // CS-TS-003: notes management admin-only; portal negative enforced by no portal code added
 * // CS-GEN-003: cite governing authority in comments
 */

import { headers } from "next/headers";
import { getAuthProvider } from "@tax-portal/auth";
import { getEngagementForAdmin, listEngagementNotes, withRequestContext } from "@tax-portal/db";
// CS-TS-001: uses @tax-portal/db barrel (no raw pool import)
import { EngagementStatusPanel } from "./_components/EngagementStatusPanel";
import { EngagementAttributesPanel } from "./_components/EngagementAttributesPanel";

// ─── Route params ─────────────────────────────────────────────────────────────

interface EngagementDetailPageProps {
  params: Promise<{ engagementId: string }>;
}

// ─── Metadata ─────────────────────────────────────────────────────────────────

export const metadata = {
  title: "Engagement — Lifecycle",
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function EngagementDetailPage({
  params,
}: EngagementDetailPageProps) {
  const { engagementId } = await params;

  // Defense-in-depth identity guard — ADR-010 middleware guarantees ACCOUNTANT,
  // but we re-verify here to match the established page pattern.
  // ADR-003: identity from verified session headers, never from URL params.
  const headerStore = await headers();
  const cookieHeader = headerStore.get("cookie") ?? "";

  const syntheticRequest = new Request("http://localhost/", {
    headers: { cookie: cookieHeader },
  });

  const provider = getAuthProvider();
  const identity = await provider.getIdentity(syntheticRequest);

  if (!identity || identity.role !== "ACCOUNTANT") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full bg-white rounded-lg shadow-sm border border-red-200 p-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Tax Portal</h1>
          <p className="text-sm text-red-600">Authentication required. Please sign in.</p>
        </div>
      </div>
    );
  }

  // Load engagement lifecycle state — admin pool (RLS-exempt for accountant surface).
  // ADR-003 §7: admin pool is correct for admin-surface reads (no SESSION_CONTEXT needed).
  // TASK-011-003: getEngagementForAdmin now also returns dueDate + isPriority (additive, CS-GEN-002).
  // CS-TS-001: getEngagementForAdmin uses admin pool via @tax-portal/db barrel.
  const engagement = await getEngagementForAdmin(engagementId);

  // Load internal notes under withRequestContext — sec.pol_EngagementNote is the access gate.
  // ADR-003: MUST be inside withRequestContext so SESSION_CONTEXT is set (ACCOUNTANT role).
  // ADR-005: sec.pol_EngagementNote FILTER enforces accountant-only visibility server-side.
  // CS-TS-001: listEngagementNotes uses the request-pool db wrapper.
  // CS-GEN-001: note bodies are displayed to the accountant only — not logged here.
  // CS-TS-003: notes are loaded in apps/admin ONLY — this code never runs in apps/portal.
  const notes = engagement
    ? await withRequestContext(identity.clerkUserId, identity.role, () =>
        listEngagementNotes(engagementId),
      )
    : [];

  if (!engagement) {
    return (
      <div className="min-h-screen bg-gray-50">
        <nav className="border-b border-gray-200 bg-white shadow-sm">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="flex h-14 items-center justify-between">
              <span className="text-base font-bold text-gray-900">Tax Portal</span>
            </div>
          </div>
        </nav>
        <main className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-8">
          <div
            role="alert"
            className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            Engagement not found.
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top nav — mirrors document-requests/page.tsx pattern */}
      <nav className="border-b border-gray-200 bg-white shadow-sm">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-14 items-center justify-between">
            <div className="flex items-center gap-6">
              <span className="text-base font-bold text-gray-900">Tax Portal</span>
              <nav className="flex gap-4 text-sm" aria-label="Main navigation">
                <a
                  href="/"
                  className="text-gray-500 hover:text-gray-900 transition-colors"
                >
                  Dashboard
                </a>
                <a
                  href="/requests"
                  className="text-gray-500 hover:text-gray-900 transition-colors"
                >
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
            <span className="text-xs text-gray-400 font-mono">{identity.clerkUserId}</span>
          </div>
        </div>
      </nav>

      {/* Breadcrumb */}
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-4">
        <a
          href="/engagements"
          className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
        >
          ← Back to Engagements
        </a>
      </div>

      {/* Main content */}
      <main className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Engagement Lifecycle</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage the engagement status pipeline. Only you (the accountant) can advance or
            reopen this engagement.
          </p>
          <p className="mt-1 text-xs text-gray-400 font-mono">
            ID: {engagementId}
          </p>
        </div>

        {/* Lifecycle status panel — AC-LIFE-001-03, AC-LIFE-003-01, AC-LIFE-005-01/-02, AC-LIFE-006-01 */}
        <EngagementStatusPanel
          engagementId={engagementId}
          status={engagement.status}
          deliveryConfirmed={engagement.deliveryConfirmedAt !== null}
          filingConfirmed={engagement.filingConfirmedAt !== null}
        />

        {/* Attribute management panel — TASK-011-003 */}
        {/* AC-LIFE-007-01/-02: due date; AC-LIFE-008-01: internal notes; AC-LIFE-009-01/-02: priority flag */}
        {/* ADR-006 / CS-TS-003: This panel is apps/admin ONLY — notes NEVER surfaced in apps/portal */}
        <div className="mt-6">
          <EngagementAttributesPanel
            engagementId={engagementId}
            dueDate={engagement.dueDate}
            isPriority={engagement.isPriority}
            notes={notes}
          />
        </div>

        {/* Link to document requests for this engagement */}
        <div className="mt-6">
          <a
            href={`/engagements/${engagementId}/document-requests`}
            className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
          >
            View document requests →
          </a>
        </div>

        {/* Link to participants for this engagement — TASK-012-005 */}
        {/* AC-AUTH-007-01: accountant can invite additional CLIENT participants */}
        {/* ADR-001: each participant signs in with their own account (no shared login) */}
        <div className="mt-4">
          <a
            href={`/engagements/${engagementId}/participants`}
            className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
            data-testid="participants-link"
          >
            Manage participants →
          </a>
        </div>
      </main>
    </div>
  );
}
