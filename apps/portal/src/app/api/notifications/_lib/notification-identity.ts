/**
 * apps/portal/src/app/api/notifications/_lib/notification-identity.ts
 *
 * Shared identity-resolution helpers for the portal notifications API routes.
 * Extracted from stream/route.ts + emit-test/route.ts (F5 — eliminate verbatim duplication).
 *
 * CS-TS-004: identity is ALWAYS resolved from cookie — never from URL params or request body.
 * CS-TS-001: DB access via getAdminPool from @tax-portal/db. // CS-TS-001
 * CS-TS-002: no raw pools imported outside packages/db. // CS-TS-002
 * CS-GEN-001: clerkUserId and userDbId are NOT logged. // CS-GEN-001
 * ADR-003: identity resolution is the first step before any operation. // ADR-003
 */

import { headers } from "next/headers";
import { getAuthProvider } from "@tax-portal/auth";
import { getAdminPool } from "@tax-portal/db";

/**
 * Resolve the CLIENT identity from the request cookie.
 *
 * CS-TS-004: reads cookie header → synthetic Request → provider.getIdentity() → role guard.
 *   Identity is NEVER derived from URL params or request body. // CS-TS-004
 *
 * ADR-003: identity resolution is the first step before any subscription or publish.
 * Returns null if no valid CLIENT session exists.
 */
export async function resolveClientIdentity(): Promise<{
  clerkUserId: string;
  role: "CLIENT";
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

  // CS-TS-004 step 4: guard the CLIENT role — bail if absent or wrong role.
  if (!identity || identity.role !== "CLIENT") {
    return null;
  }

  return { clerkUserId: identity.clerkUserId, role: "CLIENT" };
}

/**
 * Look up the DB User.id for a given clerkUserId.
 *
 * Channel convention: "user:<User.id>" (DB UUID), matching what emitAndPublishNotification()
 * publishes to (notification.ts). To subscribe/publish to the correct channel, we resolve
 * the DB User.id from the clerkUserId.
 *
 * CS-TS-001: admin pool access via packages/db-exported getAdminPool. // CS-TS-001
 * CS-TS-002: getAdminPool is the only pool import — no raw mssql in callers. // CS-TS-002
 * CS-GEN-001: clerkUserId is NOT logged. // CS-GEN-001
 *
 * Returns null if the user is not found in the DB.
 */
export async function lookupUserDbId(clerkUserId: string): Promise<string | null> {
  const pool = await getAdminPool();
  const result = await pool
    .request()
    .input("clerkId", clerkUserId)
    .query<{ id: string }>(
      // CS-GEN-001: clerkId is used as a WHERE filter only — not logged. // CS-GEN-001
      `SELECT TOP 1 [id] FROM [dbo].[User] WHERE [clerkId] = @clerkId`,
    );
  return result.recordset[0]?.id ?? null;
}
