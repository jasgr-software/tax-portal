/**
 * apps/portal/src/app/dashboard/page.tsx — Client dashboard (protected route)
 *
 * This is a CLIENT-only private route. The middleware (applyPortalAuth) enforces:
 *   - Unauthenticated → redirect to /sign-in
 *   - ACCOUNTANT session → redirect to apps/admin (ADR-010 redirect matrix)
 *   - CLIENT session → serve this page
 *
 * TASK-010-004: Extends the stub to render the client's engagement(s) with the
 * mapped client-facing label. Resolves engagements server-side under the FILTER
 * via getMyEngagementAction() (no client-supplied id).
 *
 * ADR-003: engagement is resolved server-side via withRequestContext + FILTER.
 *   The client NEVER supplies an engagement id — resolution is FILTER-governed.
 * ADR-005: sec.pol_Engagement FILTER enforces own-data isolation (NOT app-layer filtering).
 * ADR-006: /dashboard is apps/portal only (client-facing, read-only).
 * ADR-010: /dashboard is NOT in PORTAL_PUBLIC_PATHS — requires a CLIENT session.
 *
 * AC-AUTH-003-01/-02: FILTER-governed — a CLIENT sees only their own engagement.
 * AC-AUTH-008-01/-02: Complete engagements remain viewable (no status filter applied).
 * AC-LIFE-002-01/-02/-03: labels mapped via clientFacingLabel in EngagementCard/Badge.
 * AC-LIFE-003-03: NO status-change affordance in apps/portal.
 * AC-LIFE-006-02: NO reopen affordance in apps/portal.
 * AC-LIFE-004-02/-03: Review → "In Progress" with no client action required.
 *
 * // ADR-005: sec.pol_Engagement FILTER governs isolation
 * // ADR-006: portal surface only
 * // CS-TS-001: DB read via withRequestContext (packages/db wrapper)
 * // CS-TS-003: shared EngagementCard/EngagementStatusBadge component consumed here
 * // CS-GEN-003: cite governing authority in comments
 */

import type { Metadata } from "next";
import { getMyEngagementAction } from "./actions";
import { EngagementCard } from "@/components/EngagementCard";

export const metadata: Metadata = {
  title: "Client Dashboard",
  description: "Your client portal dashboard.",
};

export default async function DashboardPage() {
  // Resolve the authenticated CLIENT's engagement server-side.
  // ADR-003: FILTER-governed via withRequestContext — no client-supplied id.
  // ADR-005: FILTER does isolation — NOT app-layer filtering.
  // CS-TS-001: getMyEngagementAction calls withRequestContext → getMyEngagement (packages/db).
  const result = await getMyEngagementAction();

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900 mb-2">
          Welcome to Your Client Portal
        </h1>
        <p className="text-gray-600">
          Your engagements and documents appear below.
        </p>
      </div>

      <div data-testid="client-dashboard">
        {result.success ? (
          <div data-testid="engagement-list">
            {/* AC-LIFE-002-01/-02/-03: EngagementCard renders only the mapped label — NEVER raw status.
                AC-LIFE-003-03, AC-LIFE-006-02: NO transition/reopen affordance (ADR-006).
                AC-AUTH-008-01/-02: Complete engagements remain visible (no status filter). */}
            <EngagementCard
              engagementId={result.engagement.id}
              internalStatus={result.engagement.status}
              createdAt={result.engagement.createdAt}
            />
          </div>
        ) : (
          <div
            className="rounded-lg border border-gray-200 bg-white p-8 text-center"
            data-testid="engagement-empty"
          >
            <p className="text-gray-500">
              {result.error === "No engagement found"
                ? "Your engagement is being set up. Check back soon."
                : "Something went wrong. Please sign in and try again."}
            </p>
            <a
              href="/sign-in"
              className="mt-4 inline-block text-sm text-blue-600 hover:text-blue-700"
              data-testid="sign-out-link"
            >
              Sign out
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
