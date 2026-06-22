/**
 * apps/admin/src/app/engagements/[engagementId]/page.tsx
 *
 * Per-engagement view for the accountant — lifecycle management surface.
 *
 * TASK-010-003: Accountant transition / completion-gate / reopen surface.
 *
 * Acceptance criteria:
 *   AC-LIFE-001-03: accountant advances New → In Progress → Review → Complete in order
 *   AC-LIFE-003-01: accountant changes engagement status
 *   AC-LIFE-005-01: delivery confirmation required before Complete (UI + server)
 *   AC-LIFE-005-02: filing confirmation required before Complete (UI + server)
 *   AC-LIFE-006-01: accountant reopens a Complete engagement
 *
 * ADR-010: apps/admin has NO public routes. Middleware guarantees ACCOUNTANT before this page.
 *   This page adds a defense-in-depth identity guard (mirrors document-requests/page.tsx).
 * ADR-003: DB reads use getEngagementForAdmin (admin pool — no SESSION_CONTEXT needed for
 *   admin-surface reads, per DECISION in TASK-008-003). No withRequestContext needed here.
 * ADR-005: Identity from verified session only — never from URL params or form data.
 * ADR-006: This page is apps/admin ONLY. No mirror route in apps/portal.
 *
 * Pool strategy:
 *   Page guard: identity check via getAuthProvider() (mirrors document-requests/page.tsx).
 *   Engagement read: getEngagementForAdmin (admin pool, TASK-010-003 additive read).
 *
 * // ADR-003: admin pool for admin-surface reads
 * // ADR-006: admin surface only
 * // CS-TS-001: uses admin-pool via getEngagementForAdmin (no raw Prisma)
 * // CS-GEN-003: cite governing authority in comments
 */

import { headers } from "next/headers";
import { getAuthProvider } from "@tax-portal/auth";
import { getEngagementForAdmin } from "@tax-portal/db";
// CS-TS-001: uses @tax-portal/db barrel (no raw pool import)
import { EngagementStatusPanel } from "./_components/EngagementStatusPanel";

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
  // CS-TS-001: getEngagementForAdmin uses admin pool via @tax-portal/db barrel.
  const engagement = await getEngagementForAdmin(engagementId);

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

        {/* Link to document requests for this engagement */}
        <div className="mt-6">
          <a
            href={`/engagements/${engagementId}/document-requests`}
            className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
          >
            View document requests →
          </a>
        </div>
      </main>
    </div>
  );
}
