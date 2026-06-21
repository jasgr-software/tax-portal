/**
 * apps/portal/src/app/(dev)/dev-sign-in/actions.ts
 *
 * Dev sign-in lane server actions — one-click sign-in for the mock provider.
 *
 * ONLY ACTIVE under ALLOW_MOCK_AUTH=true + AUTH_PROVIDER=mock (same contract as
 * /api/mock-session). In production (AUTH_PROVIDER=clerk or ALLOW_MOCK_AUTH unset)
 * these actions are never reachable — the page itself returns 404.
 * Guard is the shared isMockAuthSanctioned() from @tax-portal/auth — single source
 * of truth for the mock-active condition (TASK-009-003 owns the proving gate).
 *
 * D1 (ADR-005, HARD):
 *   The browser submits ONLY the accountId (a display key).
 *   The server resolves that account's role + clerkUserId from the DEMO_ACCOUNTS
 *   manifest. The role is NEVER supplied by the browser. The session is established
 *   by calling buildMockSessionSetCookieHeader (the same seam as /api/mock-session).
 *   No parallel session mechanism is introduced.
 *
 * D3 (CS-TS-003):
 *   After session establishment the server returns the landing URL:
 *     ACCOUNTANT → ADMIN_APP_URL (apps/admin)
 *     CLIENT     → /dashboard (apps/portal)
 *   Both surfaces are reachable from the same lane. The browser does the
 *   redirect after the action returns — this is a standard Next.js server action pattern.
 *
 * CS-GEN-001: the signed mock-session cookie value is NEVER logged.
 *
 * // ADR-001 (mock-binding only — inert under AUTH_PROVIDER=clerk)
 * // ADR-005 (role server-resolved from manifest; D1 — no client-trusted path)
 * // ADR-010 (role-appropriate landing: ACCOUNTANT → admin, CLIENT → portal)
 * // ADR-012 (security guard: fail-closed — requires ALLOW_MOCK_AUTH=true)
 * // CS-TS-001 (no direct Prisma access; justified dev-only manifest — DECISION in demo-accounts.ts)
 * // CS-TS-003 (cross-surface parity — both roles reachable from the lane)
 * // CS-GEN-001 (no cookie value or MOCK_SESSION_SECRET in logs)
 * // CS-GEN-003 (governing key citations present)
 */

"use server";

import { cookies } from "next/headers";
import {
  createMockSessionCookie,
  MOCK_SESSION_COOKIE_NAME,
  getAdminAppUrl,
  isMockAuthSanctioned,
} from "@tax-portal/auth";
import { findDemoAccount } from "./demo-accounts";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DevSignInResult {
  success: boolean;
  /** URL to navigate to after successful sign-in */
  redirectTo?: string;
  /** Human-readable error message on failure */
  error?: string;
}

// ─── Guard ────────────────────────────────────────────────────────────────────
// isMockAuthSanctioned() is the single shared predicate from @tax-portal/auth.
// ADR-001 / ADR-012: lane is inactive unless ALLOW_MOCK_AUTH=true AND
// AUTH_PROVIDER=mock (or unset). Unset ALLOW_MOCK_AUTH → inactive (fail-closed).
// All call sites in this file use this imported predicate so the gate cannot drift.
// // ADR-001 // ADR-012 // CS-GEN-003

// ─── Landing URL Resolution ────────────────────────────────────────────────────

/**
 * Resolve the landing URL for a given role.
 *
 * ADR-010 / AC-AUTH-013-01:
 *   ACCOUNTANT → apps/admin root (Tax Portal)
 *   CLIENT     → /dashboard (Client Portal — protected, middleware lands them there)
 *
 * // ADR-010 // CS-TS-003
 */
function resolveLandingUrl(role: "ACCOUNTANT" | "CLIENT"): string {
  if (role === "ACCOUNTANT") {
    // Cross-app navigation to apps/admin — full absolute URL required
    return getAdminAppUrl() + "/";
  }
  // CLIENT stays on apps/portal — relative path (same-origin)
  return "/dashboard";
}

// ─── Server Action ─────────────────────────────────────────────────────────────

/**
 * Server Action: sign in as a seeded demo account by accountId.
 *
 * D1 (ADR-005): the browser submits ONLY accountId. The server resolves
 *   the role + clerkUserId from the DEMO_ACCOUNTS manifest server-side.
 *   The session cookie is established here via createMockSessionCookie —
 *   the same seam as /api/mock-session. No parallel mechanism.
 *
 * D3 (CS-TS-003): returns the landing URL appropriate for the resolved role.
 *
 * CS-GEN-001: cookie VALUE is never logged. We log only accountId (non-sensitive).
 *
 * AC-AUTH-013-01: after sign-in the user reaches the surface for their role
 *   without manual navigation — the returned redirectTo URL is the landing target.
 *
 * // ADR-005 // ADR-001 // ADR-010 // CS-TS-001 // CS-TS-003 // CS-GEN-001 // CS-GEN-003
 */
export async function devSignInAsAccount(
  accountId: string,
): Promise<DevSignInResult> {
  // Guard: defense-in-depth — action is inert under the real provider
  // ADR-001: only active under AUTH_PROVIDER=mock
  if (!isMockAuthSanctioned()) {
    return { success: false, error: "Dev sign-in lane is not active." };
  }

  // Input validation — accountId must be a non-empty string
  if (typeof accountId !== "string" || !accountId.trim()) {
    return { success: false, error: "Invalid account selection." };
  }

  // D1 (ADR-005): resolve role + clerkUserId SERVER-SIDE from the manifest.
  // The browser only submitted accountId — it cannot influence the role or clerkUserId.
  // CS-TS-001: no DB access — justified manifest DECISION (see demo-accounts.ts header).
  const account = findDemoAccount(accountId.trim());
  if (!account) {
    return { success: false, error: "Unknown account. Choose a seeded demo account." };
  }

  // Establish the signed mock session SERVER-SIDE.
  // Reuses createMockSessionCookie from packages/auth — the same seam as /api/mock-session.
  // ADR-005: the role in the cookie is account.role (server-resolved), never client-supplied.
  // CS-GEN-001: cookie VALUE is NOT logged — only accountId is logged (non-sensitive).
  let sessionCookie: Awaited<ReturnType<typeof createMockSessionCookie>>;
  try {
    sessionCookie = await createMockSessionCookie({
      clerkUserId: account.clerkUserId, // server-resolved — ADR-005
      role: account.role,               // server-resolved — ADR-005; D1 satisfied
    });
  } catch (err) {
    // Log error context WITHOUT the cookie value (CS-GEN-001).
    // Log account.accountId (server-resolved) rather than the raw browser input (CS-GEN-001).
    console.error(
      "[dev-sign-in] createMockSessionCookie failed for accountId:",
      account.accountId,
      "error:",
      err instanceof Error ? err.message : "unknown",
    );
    return { success: false, error: "Session creation failed. Check server logs." };
  }

  // Set the signed cookie via Next.js cookies() API (server-side — ADR-005).
  // DECISION (TASK-004-005): Next.js ResponseCookie expects lowercase sameSite values.
  // MockSessionCookie uses title-case ("Lax"); we lowercase at the boundary.
  const cookieStore = await cookies();
  cookieStore.set(sessionCookie.name, sessionCookie.value, {
    httpOnly: sessionCookie.httpOnly,
    secure: sessionCookie.secure,
    sameSite: sessionCookie.sameSite.toLowerCase() as "lax" | "strict" | "none",
    path: sessionCookie.path,
    expires: sessionCookie.expires,
  });
  // CS-GEN-001: cookie value is NOT logged here or anywhere in this action.

  // D3 / AC-AUTH-013-01: resolve the landing URL for the server-resolved role.
  // ADR-010: ACCOUNTANT → apps/admin, CLIENT → apps/portal/dashboard
  // CS-TS-003: both roles reachable from this single lane.
  const redirectTo = resolveLandingUrl(account.role);

  return { success: true, redirectTo };
}

/**
 * Server Action: global sign-out — clear the mock session cookie, leaving the
 * user in an unauthenticated state on BOTH surfaces.
 *
 * AC-AUTH-013-02: signing out ends the session. The signed mock-session cookie
 *   (__mock_session) is shared at the browser level across both apps/portal and
 *   apps/admin (same localhost domain, no port in cookie domain matching). Setting
 *   max-age=0 from either surface causes the browser to delete the cookie globally
 *   — both surfaces see an unauthenticated state on the next request.
 *
 * ADR-010: sign-out is GLOBAL (one identity/session across both apps).
 *   Reuses the clearSessionCookie pattern from /api/mock-session DELETE.
 *   No parallel sign-out mechanism introduced.
 *
 * ADR-001 / ADR-012: guard is isMockAuthSanctioned() — inert unless ALLOW_MOCK_AUTH=true
 *   AND AUTH_PROVIDER=mock. Inert under AUTH_PROVIDER=clerk.
 * CS-GEN-001: no cookie value is logged.
 * CS-TS-003: this action is the shared sign-out path used by the DevBanner on BOTH
 *   apps/portal and apps/admin — the same pattern is mirrored in admin's dev actions.
 *
 * // ADR-010 // ADR-001 // CS-TS-003 // CS-GEN-001 // CS-GEN-003
 */
export async function devGlobalSignOut(): Promise<{ redirectTo: string }> {
  if (!isMockAuthSanctioned()) {
    // ADR-001: no-op under the real provider; return portal sign-in as a safe fallback
    return { redirectTo: "/sign-in" };
  }

  // Clear the signed mock-session cookie (max-age=0) — AC-AUTH-013-02 / ADR-010
  // Mirror the set-time attributes so deletion is robust under HTTPS.
  // The cookie was set with secure: NODE_ENV !== "development" (mock-session-api.ts:79);
  // the clear must carry the same secure flag or it won't match the browser's cookie jar
  // on an HTTPS deployment. CS-GEN-001: cookie value is never logged here.
  const cookieStore = await cookies();
  cookieStore.set(MOCK_SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env["NODE_ENV"] !== "development",
    sameSite: "lax",
    path: "/",
    maxAge: 0, // ADR-010: max-age=0 signals browser to delete the cookie globally
  });

  // Redirect to the dev sign-in lane after sign-out
  return { redirectTo: "/dev-sign-in" };
}

/**
 * Server Action: switch to a different demo account (role/user switcher).
 *
 * D4 (switcher — TASK-009-002): While signed in, switch to a different demo account
 *   by re-driving the server-set-role path (devSignInAsAccount).
 *   Returns the landing URL for the newly chosen role so the caller can redirect.
 *
 * ADR-005 (HARD): the new role is server-resolved from the chosen accountId via the
 *   DEMO_ACCOUNTS manifest — NOT supplied by the browser. The browser submits ONLY
 *   accountId; the server re-resolves role + clerkUserId from the manifest.
 *
 * ADR-010: re-landing after switch follows the same role-based landing as initial sign-in:
 *   ACCOUNTANT → apps/admin, CLIENT → apps/portal/dashboard.
 *
 * CS-TS-003: this action is the shared switch path; mirrors the admin-surface counterpart.
 * CS-GEN-001: no cookie value or secret is logged.
 *
 * // ADR-005 // ADR-010 // CS-TS-003 // CS-GEN-001 // CS-GEN-003
 */
export async function devSwitchAccount(accountId: string): Promise<DevSignInResult> {
  // ADR-001: guard consistent with the lane (inert under AUTH_PROVIDER=clerk)
  // ADR-005: re-drives the server-set-role path — accountId only, role resolved server-side
  return devSignInAsAccount(accountId);
}
