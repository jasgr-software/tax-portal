/**
 * apps/portal/src/app/engagements/new/page.tsx
 * — Returning-client new-engagement request page
 *
 * AC-DOOR-009-01: A signed-in existing client can start a new engagement request
 *   from inside the client surface. This page is the entry point for that flow.
 *   Middleware (applyPortalAuth) ensures only authenticated CLIENTs reach this route.
 * AC-DOOR-009-02: The page presents active services as a multi-select checklist.
 * AC-DOOR-009-03: NO contact fields are present. Contact is on-file and resolved
 *   server-side in the action (createReturningClientRequest / DECISION-E).
 *   The form deliberately omits firstName/lastName/email inputs.
 * AC-DOOR-009-04: Submission delegates to submitReturningClientRequest → routed to
 *   the accountant's inbox like a front-door request.
 *
 * ADR-006: This route lives in apps/portal (client surface).
 * ADR-003: Active services are fetched server-side via the admin pool.
 *   SESSION_CONTEXT is not required for getActiveServices() (admin-pool read, RLS-exempt).
 *
 * CS-TS-001: DB read (getActiveServices) goes through @tax-portal/db.
 * CS-TS-002: No raw pool import.
 * CS-TS-003: Mirrors the front-door request page (apps/portal/(public)/request/page.tsx)
 *   in structure and service-checklist pattern.
 * CS-GEN-003: Governing authority cited in comments.
 *
 * // CS-TS-001 // CS-TS-002 // CS-TS-003 // CS-GEN-003 // ADR-003 // ADR-006
 */

import type { Metadata } from "next";
import Link from "next/link";
import { getActiveServices } from "@tax-portal/db"; // CS-TS-001: admin pool via @tax-portal/db
import { ReturningClientRequestForm } from "./_components/ReturningClientRequestForm";

export const metadata: Metadata = {
  title: "New Engagement Request",
  description:
    "Request a new engagement. Select the tax services you need — your contact details are already on file.",
};

export const dynamic = "force-dynamic";

export default async function NewEngagementPage() {
  // Fetch active services server-side (admin pool via @tax-portal/db — ADR-003).
  // CS-TS-001: getActiveServices() is in @tax-portal/db — no raw pool import here.
  // Only active services are returned (mirrors front-door page — CS-TS-003).
  const services = await getActiveServices(); // CS-TS-001

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-8">
        <Link
          href="/dashboard"
          className="text-sm text-blue-600 hover:text-blue-700 mb-4 inline-block"
        >
          ← Back to Dashboard
        </Link>
        <h1 className="text-gray-900 mb-2">New Engagement Request</h1>
        {/*
          AC-DOOR-009-03: Explicit confirmation to the client that we already have
          their contact details — they do not need to re-enter them.
        */}
        <p className="text-gray-600" data-testid="no-contact-fields-message">
          Select the services you need. Your contact information is already on
          file — no need to re-enter it.
        </p>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 sm:p-8">
        {services.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-500 mb-4">
              No services are currently available to select. Please check back
              soon or contact your accountant directly.
            </p>
            <Link
              href="/dashboard"
              className="text-blue-600 hover:text-blue-700 text-sm"
            >
              Return to Dashboard
            </Link>
          </div>
        ) : (
          /*
            AC-DOOR-009-02: ReturningClientRequestForm renders only the service
            checklist — no contact fields (AC-DOOR-009-03 proof: form shape has
            no firstName/lastName/email inputs).
            CS-TS-003: Same ServiceChecklist component as the front-door form.
          */
          <ReturningClientRequestForm services={services} />
        )}
      </div>
    </div>
  );
}
