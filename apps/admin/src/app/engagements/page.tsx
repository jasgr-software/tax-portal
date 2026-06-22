/**
 * apps/admin/src/app/engagements/page.tsx
 *
 * Engagement list page — full-visibility surface for the accountant.
 *
 * TASK-010-003: Full-visibility engagement list (AC-AUTH-002-01/-02).
 *
 * Acceptance criteria:
 *   AC-AUTH-002-01: The accountant can see all engagements regardless of which client owns them.
 *   AC-AUTH-002-02: The admin engagement list surface is accessible to the accountant.
 *
 * ADR-010: apps/admin has NO public routes. Middleware guarantees ACCOUNTANT before this page.
 * ADR-003 §7: listEngagementsForAdmin uses admin pool — RLS-exempt for accountant reads.
 *   No withRequestContext needed (admin pool, not request pool).
 * ADR-005: Identity from verified session only.
 * ADR-006: Admin surface only — no mirror in apps/portal.
 *
 * // ADR-003: admin pool for full-visibility list
 * // ADR-006: admin surface only
 * // CS-TS-001: uses @tax-portal/db barrel (no raw pool import)
 * // CS-GEN-003: cite governing authority in comments
 */

import { headers } from "next/headers";
import { getAuthProvider } from "@tax-portal/auth";
import { listEngagementsForAdmin } from "@tax-portal/db";
// CS-TS-001: uses @tax-portal/db barrel

// ─── Metadata ─────────────────────────────────────────────────────────────────

export const metadata = {
  title: "Engagements",
};

// ─── Status badge helper ───────────────────────────────────────────────────────

function statusBadgeClass(status: string): string {
  switch (status) {
    case "New":         return "bg-gray-100 text-gray-700";
    case "In Progress": return "bg-blue-100 text-blue-800";
    case "Review":      return "bg-yellow-100 text-yellow-800";
    case "Complete":    return "bg-green-100 text-green-800";
    default:            return "bg-gray-100 text-gray-500";
  }
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function EngagementsPage() {
  // Defense-in-depth identity guard — middleware guarantees ACCOUNTANT (ADR-010).
  // ADR-003: identity from verified session headers.
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

  // AC-AUTH-002-01/-02: Full-visibility list — admin pool, all engagements regardless of client.
  // ADR-003 §7: admin pool is correct — accountant sees all (not SESSION_CONTEXT scoped).
  // CS-TS-001: listEngagementsForAdmin via @tax-portal/db barrel.
  let engagements: Awaited<ReturnType<typeof listEngagementsForAdmin>> = [];
  let dbError: string | null = null;

  try {
    engagements = await listEngagementsForAdmin();
  } catch {
    dbError = "Unable to load engagements — database temporarily unavailable.";
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top nav */}
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
                  className="font-medium text-blue-600 hover:text-blue-700 transition-colors"
                  aria-current="page"
                >
                  Engagements
                </a>
              </nav>
            </div>
            <span className="text-xs text-gray-400 font-mono">{identity.clerkUserId}</span>
          </div>
        </div>
      </nav>

      {/* Main content */}
      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Engagements</h1>
            <p className="mt-1 text-sm text-gray-500">
              All active and completed client engagements.
            </p>
          </div>
          <span className="text-sm text-gray-400">
            {engagements.length} engagement{engagements.length !== 1 ? "s" : ""}
          </span>
        </div>

        {dbError && (
          <div
            role="alert"
            className="mb-6 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            {dbError}
          </div>
        )}

        {/* AC-AUTH-002-01/-02: Full-visibility engagement list */}
        {engagements.length === 0 && !dbError ? (
          <div
            data-testid="engagements-empty"
            className="bg-white rounded-lg border border-gray-200 p-12 text-center text-sm text-gray-500"
          >
            No engagements yet.
          </div>
        ) : (
          <div
            data-testid="engagements-list"
            className="bg-white rounded-lg border border-gray-200 shadow-sm divide-y divide-gray-200"
          >
            {engagements.map((eng) => (
              <a
                key={eng.id}
                href={`/engagements/${eng.id}`}
                data-testid={`engagement-item-${eng.id.toLowerCase()}`}
                data-status={eng.status}
                className="flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-sm font-medium text-gray-900 truncate">
                    {eng.clientFirstName && eng.clientLastName
                      ? `${eng.clientFirstName} ${eng.clientLastName}`
                      : eng.clientEmail ?? "Unknown client"}
                  </span>
                  {eng.clientEmail && (
                    <span className="text-xs text-gray-400 truncate">{eng.clientEmail}</span>
                  )}
                </div>
                <div className="flex items-center gap-4 ml-4 shrink-0">
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusBadgeClass(eng.status)}`}
                  >
                    {eng.status}
                  </span>
                  <span className="text-xs text-gray-400">→</span>
                </div>
              </a>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
