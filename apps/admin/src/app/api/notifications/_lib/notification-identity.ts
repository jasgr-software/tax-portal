/**
 * apps/admin/src/app/api/notifications/_lib/notification-identity.ts
 *
 * Shared identity-resolution helper for the admin notifications API routes.
 * Extracted from stream/route.ts + emit-test/route.ts (F5 — eliminate verbatim duplication).
 *
 * CS-TS-004: identity is ALWAYS resolved from cookie — never from URL params or request body.
 * CS-GEN-001: clerkUserId is NOT logged. // CS-GEN-001
 * ADR-003: identity resolution is the first step before any operation. // ADR-003
 * ADR-010: ACCOUNTANT-only — 401 for non-ACCOUNTANT sessions. // ADR-010
 */

import { headers } from "next/headers";
import { getAuthProvider } from "@tax-portal/auth";

/**
 * Resolve the ACCOUNTANT identity from the request cookie.
 *
 * CS-TS-004: reads cookie header → synthetic Request → provider.getIdentity() → role guard.
 *   Identity is NEVER derived from URL params or request body. // CS-TS-004
 *
 * ADR-010: ACCOUNTANT role guard — returns null for non-ACCOUNTANT sessions.
 * Returns null if no valid ACCOUNTANT session exists.
 */
export async function resolveAccountantIdentity(): Promise<{
  clerkUserId: string;
  role: "ACCOUNTANT";
} | null> {
  // CS-TS-004 step 1: read the cookie header from the incoming request.
  const headerStore = await headers();
  const cookieHeader = headerStore.get("cookie") ?? "";

  // CS-TS-004 step 2: construct a synthetic Request (the auth provider reads cookies from it).
  const syntheticRequest = new Request("http://localhost/", {
    headers: { cookie: cookieHeader },
  });

  // CS-TS-004 step 3: call provider.getIdentity() — this is the trust fence.
  const provider = getAuthProvider();
  const identity = await provider.getIdentity(syntheticRequest);

  // CS-TS-004 step 4: guard the ACCOUNTANT role — bail if absent or wrong role.
  // ADR-010: ACCOUNTANT-only endpoint. // ADR-010
  if (!identity || identity.role !== "ACCOUNTANT") {
    return null;
  }

  return { clerkUserId: identity.clerkUserId, role: "ACCOUNTANT" };
}
