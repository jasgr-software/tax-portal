/**
 * apps/admin/src/app/requests/page.tsx — Engagement Request Inbox
 *
 * Server component — resolves verified ACCOUNTANT identity from incoming headers,
 * reads all engagement requests (via the request pool `db` under accountant SESSION_CONTEXT),
 * and renders the RequestList component with the NotificationsIndicator.
 *
 * AC-DASH-011-01: Accountant can view all engagement requests from the admin UI.
 * AC-DASH-011-02: Engagement requests are distinguishable by state (pending/accepted/declined).
 * AC-DASH-011-03: The accountant can identify which requests are pending a decision.
 *
 * ADR-010: apps/admin has NO public routes. Every path requires ACCOUNTANT auth.
 *          The middleware has guaranteed ACCOUNTANT before this page renders.
 *          This page adds an extra identity guard for defense-in-depth (mirrors services/page.tsx).
 * ADR-003: DB reads run inside withRequestContext(identity.clerkUserId, identity.role, fn)
 *          so SESSION_CONTEXT is set before the first query (listEngagementRequests uses
 *          the request-scoped `db`, not `adminDb`).
 * ADR-005: Role comes from the verified session (getIdentity()) — never from request params.
 * ADR-006: This page is admin-only — there is NO mirror in apps/portal.
 *
 * Identity hand-off pattern mirrors apps/admin/src/app/services/page.tsx:
 *   headers() → cookie header → synthetic Request → getIdentity() → identity guard
 *   → withRequestContext(identity.clerkUserId, identity.role, () => listEngagementRequests())
 */

import { headers } from "next/headers";
import { getAuthProvider } from "@tax-portal/auth";
import {
  withRequestContext,
  listEngagementRequests,
  listNotifications,
} from "@tax-portal/db";
import type { EngagementRequestItem, NotificationItem } from "@tax-portal/db";
import { RequestList } from "./_components/RequestList";
import { NotificationsIndicator } from "./_components/NotificationsIndicator";

export const metadata = {
  title: "Engagement Requests",
};

/**
 * Load all engagement requests inside the request context.
 * MUST run inside withRequestContext so SESSION_CONTEXT is set for the request pool.
 * ADR-003: pol_EngagementRequest FILTER predicate enforces accountant-only visibility.
 */
async function getAllRequests(
  clerkUserId: string,
  role: "ACCOUNTANT" | "CLIENT",
): Promise<EngagementRequestItem[]> {
  return withRequestContext(clerkUserId, role, () => listEngagementRequests());
}

/**
 * Load all notifications inside the request context.
 * MUST run inside withRequestContext so SESSION_CONTEXT is set for the request pool.
 * ADR-003: pol_Notification FILTER predicate enforces accountant-only visibility.
 */
async function getNotifications(
  clerkUserId: string,
  role: "ACCOUNTANT" | "CLIENT",
): Promise<NotificationItem[]> {
  return withRequestContext(clerkUserId, role, () => listNotifications());
}

export default async function RequestsPage() {
  // Resolve the verified identity from the incoming request headers.
  // The middleware has guaranteed an ACCOUNTANT is present, but we guard here
  // as defense-in-depth — the same pattern as apps/admin/src/app/services/page.tsx.
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

  // Fetch all engagement requests and notifications in parallel (both use the same
  // SESSION_CONTEXT / request pool). On DB error, render empty list + error banner.
  let requests: EngagementRequestItem[] = [];
  let notifications: NotificationItem[] = [];
  let dbError: string | null = null;

  try {
    [requests, notifications] = await Promise.all([
      getAllRequests(identity.clerkUserId, identity.role),
      getNotifications(identity.clerkUserId, identity.role),
    ]);
  } catch {
    dbError = "Unable to load requests — database temporarily unavailable.";
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top nav — mirrors services/page.tsx pattern */}
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
                  href="/services"
                  className="text-gray-500 hover:text-gray-900 transition-colors"
                >
                  Services
                </a>
                <a
                  href="/requests"
                  className="font-medium text-blue-600 hover:text-blue-700 transition-colors"
                  aria-current="page"
                >
                  Requests
                </a>
              </nav>
            </div>
            <div className="flex items-center gap-4">
              {/* NotificationsIndicator — AC-DOOR-005-02, AC-MSG-013-01 */}
              <NotificationsIndicator notifications={notifications} />
              <span className="text-xs text-gray-400 font-mono">{identity.clerkUserId}</span>
            </div>
          </div>
        </div>
      </nav>

      {/* Main content */}
      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        {dbError && (
          <div
            className="mb-6 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
            role="alert"
          >
            {dbError}
          </div>
        )}
        <RequestList requests={requests} />
      </main>
    </div>
  );
}
