/**
 * apps/portal/src/app/(public)/services/page.tsx — Public services page
 *
 * AC-DOOR-001-01: Page is reachable anonymously (no sign-in required).
 * AC-DOOR-001-02: Active services are listed.
 * AC-DOOR-001-03: Viewing creates no account, asks nothing personal.
 * AC-DOOR-002-04: Deactivated services do not appear (enforced at data layer + UI).
 *
 * REQ-DOOR-004: The defining invariant — anonymous, no gate.
 * ADR-003: Uses admin pool via getActiveServices() from @tax-portal/db
 *          (anonymous path, no Clerk identity required).
 *
 * This is a React Server Component (Next.js 14 App Router default).
 * Data fetching is inline — no client-side JS for the services list.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { getActiveServices } from "@tax-portal/db";
import { Button } from "@tax-portal/ui";

export const metadata: Metadata = {
  title: "Our Services",
  description:
    "Browse our tax accounting services and submit an engagement request.",
};

// Force dynamic rendering — the services page reads from the DB on every request.
// In production, ISR/cache headers would be set here; for now, dynamic is correct.
export const dynamic = "force-dynamic";

export default async function ServicesPage() {
  // getActiveServices uses the admin pool — anonymous path (ADR-003 §1/§6).
  // Only active services are returned — inactive are excluded at the data layer
  // (AC-DOOR-002-04 / AC-DOOR-001-02 enforced by the query WHERE active = 1).
  const services = await getActiveServices();

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-10">
        <h1 className="text-gray-900 mb-3">Our Tax Accounting Services</h1>
        <p className="text-lg text-gray-600 max-w-2xl">
          We provide comprehensive tax accounting services for individuals and
          businesses. Browse our services below and submit a request to get
          started.
        </p>
      </div>

      {services.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
          <p className="text-gray-500">
            No services are currently available. Please check back soon.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mb-10">
          {services.map((service) => (
            <div
              key={service.id}
              className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm hover:shadow-md transition-shadow"
            >
              <h3 className="text-gray-900 mb-2">{service.name}</h3>
              {service.description && (
                <p className="text-sm text-gray-600">{service.description}</p>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="rounded-lg bg-blue-50 border border-blue-100 p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-gray-900 mb-1">Ready to get started?</h2>
          <p className="text-gray-600 text-sm">
            Select the services you need and submit a request. No account
            required.
          </p>
        </div>
        <Link href="/request">
          <Button size="lg">Request Services</Button>
        </Link>
      </div>
    </div>
  );
}
