/**
 * apps/portal/src/app/dashboard/actions.ts — Client dashboard server actions
 *
 * Resolves the authenticated CLIENT's engagement(s) server-side via the
 * sec.pol_Engagement FILTER predicate. The client NEVER supplies an engagement id —
 * the FILTER returns only their own row(s).
 *
 * ADR-003: reads run under withRequestContext(CLIENT identity) so the FILTER
 *   predicate governs visibility (fail-closed for null/wrong identity).
 * ADR-005: sec.pol_Engagement FILTER enforces own-data isolation — NOT app-layer
 *   filtering. The function does NOT filter the returned list; FILTER already does it.
 * ADR-006: This action is apps/portal only — client-facing read-only surface.
 *   Transition/reopen controls live in apps/admin (ADR-006).
 * CS-TS-001: DB access goes through the @tax-portal/db request-scoped wrapper
 *   (withRequestContext / db / SESSION_CONTEXT). Never import raw pools here.
 * CS-TS-002: Never import raw requestDb/adminDb pools outside packages/db.
 * CS-GEN-003: cite governing authority in comments.
 *
 * AC-AUTH-003-01/-02/-03: own-data isolation via FILTER (server-enforced).
 * AC-AUTH-008-01/-02: Complete engagements remain viewable (no status filter).
 */

"use server";

import { headers } from "next/headers";
import { getAuthProvider } from "@tax-portal/auth";
import {
  withRequestContext,
  getMyEngagement,
  getEngagementForClient,
} from "@tax-portal/db";
import type { EngagementItem } from "@tax-portal/db";

// ─── Identity helper ───────────────────────────────────────────────────────────

/**
 * Resolve the CLIENT identity from the request cookie.
 *
 * Mirrors the pattern in apps/portal/src/app/onboarding/actions.ts (TASK-005-005).
 * ADR-001/ADR-005: role from the verified session only — NEVER from form data or URL.
 * CS-TS-001: identity resolution does not touch the DB directly — only the auth provider.
 */
export async function getClientIdentity(): Promise<{
  clerkUserId: string;
  role: "CLIENT";
} | null> {
  const headerStore = await headers();
  const cookieHeader = headerStore.get("cookie") ?? "";

  const syntheticRequest = new Request("http://localhost/", {
    headers: { cookie: cookieHeader },
  });

  const provider = getAuthProvider();
  const identity = await provider.getIdentity(syntheticRequest);

  if (!identity || identity.role !== "CLIENT") {
    return null;
  }

  return { clerkUserId: identity.clerkUserId, role: "CLIENT" };
}

// ─── Result types ──────────────────────────────────────────────────────────────

export type GetMyEngagementResult =
  | { success: true; engagement: EngagementItem }
  | { success: false; error: string };

export type GetEngagementByIdResult =
  | { success: true; engagement: EngagementItem }
  | { success: false; error: "unauthorized" | "not_found" | string };

// ─── Server actions ────────────────────────────────────────────────────────────

/**
 * Returns the authenticated CLIENT's engagement (no client-supplied id).
 *
 * Resolves the engagement server-side via sec.pol_Engagement FILTER predicate.
 * The FILTER returns ZERO rows for a non-owner, null SESSION_CONTEXT, or no engagement.
 *
 * AC-AUTH-003-01/-02: FILTER enforces isolation — a CLIENT sees only their own engagement.
 * AC-AUTH-008-01/-02: Complete engagements are returned (no status filter applied here).
 * ADR-003: runs under withRequestContext(CLIENT identity) so SESSION_CONTEXT is set.
 * CS-TS-001: DB access via withRequestContext → getMyEngagement (packages/db wrapper).
 * CS-TS-002: no raw pool import.
 */
export async function getMyEngagementAction(): Promise<GetMyEngagementResult> {
  const identity = await getClientIdentity();
  if (!identity) {
    return { success: false, error: "Unauthorized: CLIENT identity required" };
  }

  // ADR-003, CS-TS-001: request-scoped read under CLIENT identity via the packages/db wrapper.
  // ADR-005: FILTER predicate does the isolation — we do NOT app-layer filter the result.
  const engagement = await withRequestContext(
    identity.clerkUserId,
    identity.role,
    // CS-TS-001: getMyEngagement goes through the db wrapper (SESSION_CONTEXT set).
    () => getMyEngagement(),
  );

  if (!engagement) {
    return { success: false, error: "No engagement found" };
  }

  return { success: true, engagement };
}

/**
 * Returns the authenticated CLIENT's engagement by id.
 *
 * The id is server-resolved by the FILTER — if the CLIENT does not own this engagement,
 * getEngagementForClient returns null (fail-closed, ADR-005).
 *
 * AC-AUTH-003-03: The restriction holds across every access path, including a direct
 *   reference to a specific record (fetch-by-id). If CLIENT-B supplies CLIENT-A's id,
 *   the FILTER denies it and this function returns { success: false, error: "not_found" }.
 * AC-AUTH-008-01/-02: Complete engagements are returned (no status filter).
 * ADR-003: runs under withRequestContext(CLIENT identity).
 * ADR-005: FILTER does the isolation — NOT app-layer filtering.
 * CS-TS-001: DB access via withRequestContext → getEngagementForClient.
 * CS-TS-002: no raw pool import.
 */
export async function getEngagementByIdAction(
  engagementId: string,
): Promise<GetEngagementByIdResult> {
  const identity = await getClientIdentity();
  if (!identity) {
    return { success: false, error: "unauthorized" };
  }

  // ADR-003, CS-TS-001: request-scoped read under CLIENT identity via the packages/db wrapper.
  // ADR-005: FILTER predicate enforces isolation on the fetch-by-id path (AC-AUTH-003-03).
  // A non-owner CLIENT's SESSION_CONTEXT causes the FILTER to return null (fail-closed).
  const engagement = await withRequestContext(
    identity.clerkUserId,
    identity.role,
    // CS-TS-001: getEngagementForClient goes through the db wrapper (SESSION_CONTEXT set).
    () => getEngagementForClient(engagementId),
  );

  if (!engagement) {
    // FILTER returned null — either not found or not owned by this CLIENT.
    // Return a generic not_found to avoid leaking whether the id exists at all.
    return { success: false, error: "not_found" };
  }

  return { success: true, engagement };
}
