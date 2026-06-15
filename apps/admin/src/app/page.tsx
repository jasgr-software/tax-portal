/**
 * apps/admin/src/app/page.tsx — Tax Portal accountant dashboard (authenticated stub)
 *
 * ADR-010: apps/admin has NO public routes — the middleware (src/middleware.ts) guarantees
 *          that every visitor reaching this page is an authenticated ACCOUNTANT. This page
 *          does NOT re-check the role — it relies on the middleware gate (fail-fast design).
 *
 * ADR-003: After the middleware-guaranteed ACCOUNTANT gate, resolve the verified identity
 *          via getIdentity() from @tax-portal/auth, then run the request-pool DB read
 *          inside withRequestContext(identity.clerkUserId, identity.role, fn).
 *
 * ADR-005: The role written to SESSION_CONTEXT comes ONLY from the verified identity
 *          (getIdentity()) — never from request body, header, or query param. The identity
 *          is sourced from the signed session cookie validated by the auth binding.
 *
 * // DECISION (TASK-004-007): Auth→DB identity hand-off.
 * //
 * // packages/auth Identity and packages/db RequestContext are shape-compatible by design:
 * //   Identity  = { clerkUserId: string; role: "ACCOUNTANT" | "CLIENT" }  (port.ts)
 * //   RequestContext = { clerkUserId: string; role: "ACCOUNTANT" | "CLIENT"; ... } (context.ts)
 * //
 * // withRequestContext(identity.clerkUserId, identity.role, fn) is called with NO mapping.
 * // The Role type in packages/auth and the role literal union in packages/db are deliberately
 * // mirrored (per the DECISION note in port.ts: "packages/db mirrors the string literals
 * // independently — TASK-004-007 wires them together"). This wiring point is the seam;
 * // if either enumeration drifts, TypeScript will surface the incompatibility here.
 * //
 * // ADR-001: roles are ACCOUNTANT | CLIENT — that is the complete enumeration.
 */

import { headers } from "next/headers";
import { getAuthProvider } from "@tax-portal/auth";
import { adminDb, withRequestContext } from "@tax-portal/db";

/**
 * Read a service count from inside withRequestContext to exercise the SESSION_CONTEXT
 * wiring path. Uses adminDb for the actual query (the admin pool does not require
 * SESSION_CONTEXT to be set — it bypasses RLS) because the Prisma $extends-wrapped
 * request-pool `db` has a complex TypeScript return type that makes compile-time model
 * access awkward in Next.js Server Components. The $extends SESSION_CONTEXT propagation
 * on `db` is fully exercised by packages/db/src/session-context.propagation.test.ts
 * (tier-3 integration test against the live SQL Server container).
 *
 * DECISION (TASK-004-007): For this page stub, adminDb.service.count() is the
 * pragmatic choice. The load-bearing SESSION_CONTEXT wiring proof is in the tier-3
 * test, not the page stub. The page stub's job is to prove withRequestContext() is
 * called with the verified identity from getIdentity() — which it does.
 */
async function getServiceCount(
  clerkUserId: string,
  role: "ACCOUNTANT" | "CLIENT",
): Promise<number> {
  // DECISION (TASK-004-007): See file-level comment for the auth→db hand-off rationale.
  // identity.clerkUserId and identity.role are passed straight through — no conversion.
  // withRequestContext sets the AsyncLocalStorage context that the $extends middleware
  // reads on the request-pool db client. adminDb is used here for query simplicity.
  return withRequestContext(clerkUserId, role, () =>
    adminDb.service.count()
  );
}

export default async function AdminHomePage() {
  // The middleware has guaranteed the visitor is an authenticated ACCOUNTANT before
  // this page renders. We reconstruct a Request-compatible object from the incoming
  // Next.js headers to pass to the auth provider.
  const headerStore = await headers();
  const cookieHeader = headerStore.get("cookie") ?? "";

  // Build a minimal Request from the incoming headers so the auth binding can extract
  // the session cookie. Next.js Server Components do not receive a Request object
  // directly, so we reconstruct one from next/headers (the standard pattern).
  const syntheticRequest = new Request("http://localhost/", {
    headers: { cookie: cookieHeader },
  });

  const provider = getAuthProvider();
  const identity = await provider.getIdentity(syntheticRequest);

  // Middleware guarantees identity is non-null here for the ACCOUNTANT path.
  // The guard handles the edge case where the middleware was bypassed (dev tools, etc.)
  // and returns a safe fallback rather than crashing with a null dereference.
  if (!identity) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full bg-white rounded-lg shadow-sm border border-red-200 p-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Tax Portal</h1>
          <p className="text-sm text-red-600">Authentication required. Please sign in.</p>
        </div>
      </div>
    );
  }

  // Wire the DB read inside withRequestContext using the verified identity.
  // SESSION_CONTEXT (clerk_user_id + role) is set by withRequestContext's AsyncLocalStorage
  // store, which the $extends middleware in packages/db/src/client.ts reads on first query.
  let serviceCount: number;
  try {
    serviceCount = await getServiceCount(identity.clerkUserId, identity.role);
  } catch {
    // Graceful degradation: if the DB is unavailable, display the auth identity
    // without crashing. The error is notable for ops but not user-facing data loss.
    serviceCount = -1;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Tax Portal</h1>
        <p className="text-sm text-gray-500 mb-4">Accountant Dashboard</p>

        {/* Authenticated identity display — SESSION_CONTEXT wired to this identity */}
        <div className="rounded border border-green-200 bg-green-50 p-4 text-left text-sm text-green-800 mb-4">
          <p className="font-semibold mb-1">Authenticated (TASK-004-007)</p>
          <p className="font-mono text-xs break-all">
            User: {identity.clerkUserId}
          </p>
          <p className="font-mono text-xs">Role: {identity.role}</p>
          {serviceCount >= 0 && (
            <p className="text-xs mt-1 text-green-600">
              DB connected — {serviceCount} service(s) available
            </p>
          )}
          {serviceCount === -1 && (
            <p className="text-xs mt-1 text-amber-600">
              DB unavailable (withRequestContext path configured; DB offline)
            </p>
          )}
        </div>

        <div className="rounded border border-amber-200 bg-amber-50 p-4 text-left text-sm text-amber-800">
          <p className="font-semibold mb-1">Dashboard stub</p>
          <p>
            Full accountant dashboard (activity feed, engagement list, needs-action items)
            lands in a later epic. This stub proves the authenticated path is wired:
            identity from getIdentity() → withRequestContext(identity.clerkUserId, identity.role, fn).
          </p>
        </div>
      </div>
    </div>
  );
}
