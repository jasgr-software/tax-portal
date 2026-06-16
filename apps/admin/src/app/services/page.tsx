/**
 * apps/admin/src/app/services/page.tsx — Services catalog management page
 *
 * Server component — resolves verified ACCOUNTANT identity from incoming headers,
 * reads all services (active + inactive) via listAllServices inside withRequestContext,
 * and renders the ServiceList client component.
 *
 * AC-DASH-010-01: Accountant can add a service from the admin UI.
 * AC-DASH-010-02: Accountant can edit a service from the admin UI.
 * AC-DASH-010-03: Accountant can deactivate a service from the admin UI.
 *
 * ADR-010: apps/admin has NO public routes. Every path requires ACCOUNTANT auth.
 *          The middleware has guaranteed ACCOUNTANT before this page renders.
 *          This page adds an extra identity guard for defense-in-depth (mirrors page.tsx).
 * ADR-003: DB reads run inside withRequestContext(identity.clerkUserId, identity.role, fn)
 *          so SESSION_CONTEXT is set before the first query (listAllServices uses request-scoped db).
 * ADR-005: Role comes from the verified session (getIdentity()) — never from request params.
 * ADR-006: This page is admin-only — there is NO mirror in apps/portal.
 *
 * Identity hand-off pattern mirrors apps/admin/src/app/page.tsx:
 *   headers() → cookie header → synthetic Request → getIdentity() → identity guard
 *   → withRequestContext(identity.clerkUserId, identity.role, () => listAllServices())
 */

import { headers } from "next/headers";
import { getAuthProvider } from "@tax-portal/auth";
import { withRequestContext, listAllServices } from "@tax-portal/db";
import type { ServiceItem } from "@tax-portal/db";
import { ServiceList } from "./_components/ServiceList";

export const metadata = {
  title: "Services Catalog",
};

/**
 * Load all services (active + inactive) inside the request context.
 * MUST run inside withRequestContext so SESSION_CONTEXT is set for the Prisma request pool.
 */
async function getAllServices(
  clerkUserId: string,
  role: "ACCOUNTANT" | "CLIENT",
): Promise<ServiceItem[]> {
  return withRequestContext(clerkUserId, role, () => listAllServices());
}

export default async function ServicesPage() {
  // Resolve the verified identity from the incoming request headers.
  // The middleware has guaranteed an ACCOUNTANT is present, but we guard here
  // as defense-in-depth — the same pattern as apps/admin/src/app/page.tsx.
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

  // Read all services (active + inactive) inside withRequestContext.
  // On DB error, render the management UI with an empty list + error banner rather than crashing.
  let services: ServiceItem[] = [];
  let dbError: string | null = null;

  try {
    services = await getAllServices(identity.clerkUserId, identity.role);
  } catch {
    dbError = "Unable to load services — database temporarily unavailable.";
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Simple top nav — lightweight reusable pattern for EPIC-003 (inbox) */}
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
                  className="font-medium text-blue-600 hover:text-blue-700 transition-colors"
                  aria-current="page"
                >
                  Services
                </a>
              </nav>
            </div>
            <span className="text-xs text-gray-400 font-mono">{identity.clerkUserId}</span>
          </div>
        </div>
      </nav>

      {/* Main content */}
      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        {dbError && (
          <div className="mb-6 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
            {dbError}
          </div>
        )}
        <ServiceList services={services} />
      </main>
    </div>
  );
}
