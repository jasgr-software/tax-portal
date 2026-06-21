/**
 * apps/admin/src/app/(dev)/dev-sign-in/actions.ts
 *
 * Admin-surface dev sign-in/sign-out/switcher server actions.
 *
 * These are the admin-surface mirror of the portal-side actions in:
 *   apps/portal/src/app/(dev)/dev-sign-in/actions.ts
 *
 * CS-TS-003: cross-surface parity — the same sign-out and switcher affordance
 *   must be reachable on BOTH apps/portal AND apps/admin. This file provides the
 *   admin-surface server action binding for the DevBanner.
 *
 * The switcher re-drives the same server-set-role path as the portal lane
 * (devSignInAsAccount D1 pattern) — accountId only, role resolved from the
 * ADMIN_DEMO_ACCOUNTS manifest server-side (ADR-005 HARD).
 *
 * The sign-out clears the __mock_session cookie (max-age=0). Since the cookie is
 * set with domain=localhost (no port in cookie domain matching), clearing it from
 * either surface causes the browser to delete it globally — both apps see an
 * unauthenticated state on the next request (ADR-010, AC-AUTH-013-02).
 *
 * ADR-001: all actions are inert under AUTH_PROVIDER=clerk.
 * CS-GEN-001: no cookie value, MOCK_SESSION_SECRET, or PII is logged.
 * CS-GEN-003: governing key citations in code.
 *
 * // ADR-001 // ADR-005 // ADR-010 // CS-TS-003 // CS-GEN-001 // CS-GEN-003
 */

"use server";

import { cookies } from "next/headers";
import {
  createMockSessionCookie,
  MOCK_SESSION_COOKIE_NAME,
  getAdminAppUrl,
  getPortalAppUrl,
} from "@tax-portal/auth";
import { findAdminDemoAccount } from "./demo-accounts";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AdminSwitchResult {
  success: boolean;
  redirectTo?: string;
  error?: string;
}

// ─── Guard ────────────────────────────────────────────────────────────────────

/**
 * Guard: only active under mock binding.
 * ADR-001: inert under AUTH_PROVIDER=clerk — all actions are no-ops.
 */
function isMockActive(): boolean {
  return (process.env["AUTH_PROVIDER"] ?? "mock") === "mock";
}

// ─── Landing URL Resolution ───────────────────────────────────────────────────

/**
 * Resolve the landing URL for the newly chosen role.
 *
 * ADR-010 / CS-TS-003:
 *   ACCOUNTANT → apps/admin root (stays on admin surface)
 *   CLIENT     → apps/portal/dashboard (redirects cross-app to portal)
 *
 * // ADR-010 // CS-TS-003
 */
function resolveLandingUrl(role: "ACCOUNTANT" | "CLIENT"): string {
  if (role === "ACCOUNTANT") {
    // ACCOUNTANT stays on apps/admin
    return getAdminAppUrl() + "/";
  }
  // CLIENT crosses to apps/portal
  return getPortalAppUrl() + "/dashboard";
}

// ─── Server Actions ───────────────────────────────────────────────────────────

/**
 * Server Action: global sign-out from the admin surface.
 *
 * AC-AUTH-013-02 (ADR-010): clears the __mock_session cookie (max-age=0).
 *   The cookie is domain-scoped to localhost (no port in cookie domain matching)
 *   so clearing it from apps/admin:3001 removes it for apps/portal:3000 too.
 *   Both surfaces see an unauthenticated state on the next request — GLOBAL sign-out.
 *
 * CS-TS-003: mirrors devGlobalSignOut in portal's actions.ts.
 * ADR-001: inert under AUTH_PROVIDER=clerk.
 * CS-GEN-001: no cookie value or secret is logged.
 *
 * // AC-AUTH-013-02 // ADR-010 // ADR-001 // CS-TS-003 // CS-GEN-001 // CS-GEN-003
 */
export async function adminDevGlobalSignOut(): Promise<{ redirectTo: string }> {
  if (!isMockActive()) {
    // ADR-001: no-op under real provider; return portal sign-in as safe fallback
    return { redirectTo: getPortalAppUrl() + "/sign-in" };
  }

  // Clear the signed mock-session cookie (max-age=0) — AC-AUTH-013-02 / ADR-010
  // CS-GEN-001: cookie value is NEVER logged
  const cookieStore = await cookies();
  cookieStore.set(MOCK_SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0, // ADR-010: max-age=0 signals browser to delete the cookie globally
  });

  // Redirect to the portal's dev sign-in lane after sign-out
  // (the portal hosts the dev sign-in picker at /dev-sign-in)
  return { redirectTo: getPortalAppUrl() + "/dev-sign-in" };
}

/**
 * Server Action: switch to a different demo account (admin-surface switcher).
 *
 * D4 (TASK-009-002 switcher): re-drives the server-set-role path from the admin surface.
 *   The browser submits ONLY accountId; the server resolves role + clerkUserId from
 *   the ADMIN_DEMO_ACCOUNTS manifest (ADR-005 HARD — no client-trusted role path).
 *
 * ADR-010: the newly chosen account's role determines the landing URL:
 *   ACCOUNTANT → stays on admin; CLIENT → redirects to portal.
 *
 * CS-TS-003: mirrors devSwitchAccount in portal's actions.ts.
 * CS-GEN-001: no cookie value or secret is logged.
 *
 * // ADR-005 // ADR-010 // ADR-001 // CS-TS-003 // CS-GEN-001 // CS-GEN-003
 */
export async function adminDevSwitchAccount(accountId: string): Promise<AdminSwitchResult> {
  // ADR-001: guard — inert under the real provider
  if (!isMockActive()) {
    return { success: false, error: "Dev switcher is not active." };
  }

  // Input validation
  if (typeof accountId !== "string" || !accountId.trim()) {
    return { success: false, error: "Invalid account selection." };
  }

  // D1 (ADR-005): resolve role + clerkUserId server-side from the manifest.
  // The browser only submitted accountId — it cannot influence the role or clerkUserId.
  const account = findAdminDemoAccount(accountId.trim());
  if (!account) {
    return { success: false, error: "Unknown account. Choose a seeded demo account." };
  }

  // Re-establish the signed mock session server-side.
  // ADR-005: role is account.role (server-resolved from manifest), never client-supplied.
  // CS-GEN-001: cookie value is NEVER logged.
  let sessionCookie: Awaited<ReturnType<typeof createMockSessionCookie>>;
  try {
    sessionCookie = await createMockSessionCookie({
      clerkUserId: account.clerkUserId, // server-resolved — ADR-005
      role: account.role,               // server-resolved — ADR-005; D1 satisfied
    });
  } catch (err) {
    // Log error context WITHOUT the cookie value (CS-GEN-001)
    console.error(
      "[admin-dev-sign-in] createMockSessionCookie failed for accountId:",
      accountId,
      "error:",
      err instanceof Error ? err.message : "unknown",
    );
    return { success: false, error: "Session creation failed. Check server logs." };
  }

  // Set the signed cookie server-side (ADR-005).
  const cookieStore = await cookies();
  cookieStore.set(sessionCookie.name, sessionCookie.value, {
    httpOnly: sessionCookie.httpOnly,
    secure: sessionCookie.secure,
    sameSite: sessionCookie.sameSite.toLowerCase() as "lax" | "strict" | "none",
    path: sessionCookie.path,
    expires: sessionCookie.expires,
  });
  // CS-GEN-001: cookie value is NOT logged here or anywhere in this action.

  // ADR-010 / CS-TS-003: resolve the landing URL for the server-resolved role.
  const redirectTo = resolveLandingUrl(account.role);

  return { success: true, redirectTo };
}
