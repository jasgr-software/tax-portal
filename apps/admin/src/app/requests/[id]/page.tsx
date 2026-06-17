/**
 * apps/admin/src/app/requests/[id]/page.tsx — Engagement Request Detail
 *
 * Server component — resolves verified ACCOUNTANT identity, fetches the specific
 * engagement request by ID (via the request pool `db` under accountant SESSION_CONTEXT),
 * and renders RequestDetail with the submitted details.
 *
 * This is the link target for:
 *   - NotificationsIndicator links (/requests/<engagementRequestId>) — AC-DOOR-005-02.
 *   - RequestList's "View" links.
 *
 * AC-DOOR-006-01: Accountant can view each pending engagement request and its submitted
 *   details (name, email, phone, selected services, message).
 * AC-DASH-011-02: Status badge distinguishes pending/accepted/declined.
 *
 * ADR-010: ACCOUNTANT-guarded — a CLIENT or anon hitting this route gets the auth error UI.
 * ADR-003: DB reads via withRequestContext(clerkUserId, role, () => getEngagementRequest(id)).
 * ADR-005: Identity from verified session (getIdentity()) — never from URL params.
 * ADR-006: Admin-only route — there is NO mirror in apps/portal.
 *
 * The `decisionSlot` prop of RequestDetail is wired to DecisionActions (TASK-003-005):
 * a client component that renders Accept button + Decline form for pending requests.
 */

import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getAuthProvider } from "@tax-portal/auth";
import { withRequestContext, getEngagementRequest } from "@tax-portal/db";
import type { EngagementRequestItem } from "@tax-portal/db";
import { RequestDetail } from "../_components/RequestDetail";
import { DecisionActions } from "../_components/DecisionActions";

// ─── Route params ─────────────────────────────────────────────────────────────

interface RequestDetailPageProps {
  params: Promise<{ id: string }>;
}

// ─── Data fetching ────────────────────────────────────────────────────────────

/**
 * Fetch a single engagement request inside the request context.
 * MUST run inside withRequestContext so SESSION_CONTEXT is set for the request pool.
 * ADR-003: pol_EngagementRequest FILTER predicate enforces accountant-only visibility.
 */
async function fetchRequest(
  clerkUserId: string,
  role: "ACCOUNTANT" | "CLIENT",
  requestId: string,
): Promise<EngagementRequestItem | null> {
  return withRequestContext(clerkUserId, role, () => getEngagementRequest(requestId));
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function RequestDetailPage({ params }: RequestDetailPageProps) {
  const { id } = await params;

  // Resolve the verified identity from the incoming request headers.
  // Defense-in-depth guard — mirrors services/page.tsx and requests/page.tsx pattern.
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

  // Fetch the specific engagement request (returns null if not found or RLS denies)
  let request: EngagementRequestItem | null = null;
  let dbError: string | null = null;

  try {
    request = await fetchRequest(identity.clerkUserId, identity.role, id);
  } catch {
    dbError = "Unable to load request — database temporarily unavailable.";
  }

  // 404 when request not found (or RLS hides it — same UX as not found)
  if (!dbError && !request) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top nav — mirrors requests/page.tsx pattern */}
      <nav className="border-b border-gray-200 bg-white shadow-sm">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-14 items-center justify-between">
            <div className="flex items-center gap-6">
              <span className="text-base font-bold text-gray-900">Tax Portal</span>
              <nav className="flex gap-4 text-sm" aria-label="Main navigation">
                <a href="/" className="text-gray-500 hover:text-gray-900 transition-colors">
                  Dashboard
                </a>
                <a href="/services" className="text-gray-500 hover:text-gray-900 transition-colors">
                  Services
                </a>
                <a href="/requests" className="text-gray-500 hover:text-gray-900 transition-colors">
                  Requests
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
          href="/requests"
          className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
        >
          ← Back to Requests
        </a>
      </div>

      {/* Main content */}
      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
        {dbError && (
          <div
            className="mb-6 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
            role="alert"
          >
            {dbError}
          </div>
        )}
        {request && (
          // TASK-003-005: Wire DecisionActions into the decisionSlot.
          // DecisionActions is a client component that renders Accept/Decline affordances
          // only when the request is in a decidable state (pending/awaiting_review).
          // AC-DOOR-006-02/-03/-04: accept/decline buttons guarded by ACCOUNTANT role
          // (the server actions re-verify identity before acting).
          <RequestDetail
            request={request}
            decisionSlot={
              <DecisionActions
                requestId={request.id}
                status={request.status}
              />
            }
          />
        )}
      </main>
    </div>
  );
}
