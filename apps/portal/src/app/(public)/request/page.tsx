/**
 * apps/portal/src/app/(public)/request/page.tsx — Request form page
 *
 * AC-DOOR-003-01: Form presents active services as a checklist (via RequestForm/ServiceChecklist).
 * AC-DOOR-003-02: No freeform "describe your need" field (form shape constraint).
 * AC-DOOR-003-03: No service-specific sub-questions (static checklist only).
 * AC-DOOR-003-04: Deactivated services are not checklist options (getActiveServices() filter).
 * AC-DOOR-004-01: Select one or more services.
 * AC-DOOR-004-02: Provide basic contact info (firstName, lastName, email).
 *
 * REQ-DOOR-004 / ADR-003: Anonymous path — no auth gate, no account required.
 * ADR-006: Server Component — fetches active services server-side; passes to client form.
 *
 * Data flow:
 *   Server: getActiveServices() → active services list
 *   Client: RequestForm (client component) handles state, validation, action call
 *   Server Action: submitEngagementRequest → createEngagementRequest → admin pool
 */

import type { Metadata } from "next";
import Link from "next/link";
import { getActiveServices } from "@tax-portal/db";
import { RequestForm } from "@/components/RequestForm";

export const metadata: Metadata = {
  title: "Request Services",
  description:
    "Submit an engagement request. Select the tax services you need and provide your contact information.",
};

export const dynamic = "force-dynamic";

export default async function RequestPage() {
  // Fetch active services server-side (admin pool via @tax-portal/db — ADR-003)
  // Only active services are returned (AC-DOOR-003-04 / AC-DOOR-002-04)
  const services = await getActiveServices();

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-8">
        <Link
          href="/services"
          className="text-sm text-blue-600 hover:text-blue-700 mb-4 inline-block"
        >
          ← Back to services
        </Link>
        <h1 className="text-gray-900 mb-2">Request Services</h1>
        <p className="text-gray-600">
          Select the services you need and provide your contact information. We
          will review your request and reach out to discuss next steps. No
          account required.
        </p>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 sm:p-8">
        {services.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-500 mb-4">
              No services are currently available to select. Please check back
              soon or contact us directly.
            </p>
            <Link href="/services" className="text-blue-600 hover:text-blue-700 text-sm">
              View services page
            </Link>
          </div>
        ) : (
          <RequestForm services={services} />
        )}
      </div>
    </div>
  );
}
