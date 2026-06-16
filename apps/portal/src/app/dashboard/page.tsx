/**
 * apps/portal/src/app/dashboard/page.tsx — Client dashboard (protected route)
 *
 * This is a CLIENT-only private route. The middleware (applyPortalAuth) enforces:
 *   - Unauthenticated → redirect to /sign-in
 *   - ACCOUNTANT session → redirect to apps/admin (ADR-010 redirect matrix)
 *   - CLIENT session → serve this page
 *
 * ADR-010: /dashboard is NOT in PORTAL_PUBLIC_PATHS — it requires a CLIENT session.
 * AC-AUTH-005-02: CLIENT lands here after sign-up/sign-in (no 2FA step encountered).
 *
 * DECISION (TASK-004-005): This is a minimal stub — the real dashboard content
 * is delivered in later epics (EPIC-002/003). It exists here so:
 *   1. The middleware redirect target is a real page (not a 404).
 *   2. The e2e tests can assert the client successfully lands post-auth.
 *   3. The ACCOUNTANT-on-CLIENT-only-route redirect can be exercised.
 *
 * Note: This page does NOT import auth or set session context itself —
 * session enforcement is done entirely in middleware (ADR-005/ADR-010).
 */

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Client Dashboard",
  description: "Your client portal dashboard.",
};

export default function DashboardPage() {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900 mb-2">
          Welcome to Your Client Portal
        </h1>
        <p className="text-gray-600">
          Your engagements and documents will appear here.
        </p>
      </div>

      <div
        className="rounded-lg border border-gray-200 bg-white p-8 text-center"
        data-testid="client-dashboard"
      >
        <p className="text-gray-500">
          Your client dashboard is being set up. Check back soon for your
          engagement details and documents.
        </p>
        <a
          href="/sign-in"
          className="mt-4 inline-block text-sm text-blue-600 hover:text-blue-700"
          data-testid="sign-out-link"
        >
          Sign out
        </a>
      </div>
    </div>
  );
}
