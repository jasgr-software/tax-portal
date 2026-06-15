/**
 * packages/auth/src/redirect.ts — ADR-010 redirect helper + public-allow-list matcher
 *
 * This module encodes the redirect matrix from ADR-010 §1. Per-app Next.js middleware
 * calls `buildRedirectDecision()` to compute the correct action (serve or redirect)
 * BEFORE any page content renders — this is what prevents the "flash of wrong-surface UI."
 *
 * ADR-010: Misnavigation is a REDIRECT, not a 403. Redirect happens before render.
 * ADR-010 §1 matrix:
 *   - Portal public allow-list routes: served for ANY role (including ACCOUNTANT) and
 *     for unauthenticated users.
 *   - Signed-in CLIENT → admin route: redirect to PORTAL_APP_URL (client's home).
 *   - Signed-in ACCOUNTANT → portal CLIENT-only route: redirect to ADMIN_APP_URL.
 *   - Signed-in ACCOUNTANT → portal PUBLIC route: SERVE (AC-AUTH-010-03).
 *   - Unauthenticated → portal private route: redirect to portal /sign-in.
 *   - Unauthenticated → any admin route: redirect to admin /sign-in.
 *
 * AC-AUTH-010-03: A signed-in ACCOUNTANT visiting a public portal route MUST be served,
 * not redirected. This is an explicit requirement from the product spec and the ADR.
 *
 * Env vars: PORTAL_APP_URL, ADMIN_APP_URL (required at middleware runtime).
 * Fallbacks (http://localhost:3000 / http://localhost:3001) are for local dev only.
 */

import type { Role } from "./port.js";

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Portal public allow-list — routes served for any role (or unauthenticated).
 * ADR-010 §1 / ADR-001: public front door routes.
 * CLAUDE.md task note: `/`, `/services`, `/request`, `/sign-in`, `/sign-up`.
 *
 * Matching is prefix-based: `/sign-in` also matches `/sign-in/anything`.
 * This covers Clerk's sub-paths (e.g. `/sign-in/factor-one`).
 */
export const PORTAL_PUBLIC_PATHS: readonly string[] = [
  "/",
  "/services",
  "/request",
  "/sign-in",
  "/sign-up",
];

/**
 * Infrastructure paths that must always pass through (health/readiness probes).
 * These are never blocked by auth middleware — Docker HEALTHCHECK uses them
 * from inside the container (no user session available). Applies to both apps.
 */
export const INFRA_PATHS: readonly string[] = ["/healthz", "/readyz"];

// ─── Redirect Decision Types ──────────────────────────────────────────────────

/** The middleware should serve the request */
export interface ServeDecision {
  action: "serve";
}

/** The middleware should redirect to the given URL */
export interface RedirectDecision {
  action: "redirect";
  destination: URL;
  /** "permanent" (308) for canonical moves; "temporary" (307) for auth redirects */
  statusCode: 307 | 308;
}

export type MiddlewareDecision = ServeDecision | RedirectDecision;

// ─── URL Resolution ───────────────────────────────────────────────────────────

/**
 * Resolve PORTAL_APP_URL from env with local dev fallback.
 * Never used in production without the env var — the fallback is a dev safety net.
 */
export function getPortalAppUrl(): string {
  return process.env["PORTAL_APP_URL"] ?? "http://localhost:3000";
}

/**
 * Resolve ADMIN_APP_URL from env with local dev fallback.
 */
export function getAdminAppUrl(): string {
  return process.env["ADMIN_APP_URL"] ?? "http://localhost:3001";
}

// ─── Public Route Matching ────────────────────────────────────────────────────

/**
 * Returns true if the pathname is on the portal public allow-list.
 * Matching is prefix-based so `/sign-in/factor-one` is treated as public.
 *
 * AC-AUTH-010-03: public portal routes are served for any role.
 */
export function isPortalPublicPath(pathname: string): boolean {
  const normalized = pathname.split("?")[0] ?? "";
  return PORTAL_PUBLIC_PATHS.some(
    (p) => normalized === p || (p !== "/" && normalized.startsWith(p + "/")),
  );
}

/**
 * Returns true if the path is an infrastructure path (healthz/readyz).
 * These are always served without auth checks.
 */
export function isInfraPath(pathname: string): boolean {
  const normalized = pathname.split("?")[0] ?? "";
  return INFRA_PATHS.some(
    (p) => normalized === p || normalized.startsWith(p + "/"),
  );
}

// ─── Portal Redirect Decision ─────────────────────────────────────────────────

/**
 * Compute the redirect decision for a request to apps/portal.
 *
 * Encodes the ADR-010 matrix for the portal app:
 *   1. Infrastructure paths → always serve.
 *   2. Public portal path → always serve (any role, unauthenticated).
 *   3. Signed-in ACCOUNTANT → serve if public; redirect to admin home if not.
 *      (AC-AUTH-010-03: accountant on public route IS served.)
 *   4. Unauthenticated → redirect to portal /sign-in (private routes only).
 *   5. Signed-in CLIENT → serve.
 *
 * @param pathname  The request pathname (e.g. "/services")
 * @param identity  null = unauthenticated; Identity object = authenticated
 * @param requestUrl The full request URL (used to build sign-in redirect URL)
 */
export function portalRedirectDecision(
  pathname: string,
  identity: { role: Role } | null,
  requestUrl: string,
): MiddlewareDecision {
  // 1. Infrastructure paths always pass through — no auth check.
  if (isInfraPath(pathname)) {
    return { action: "serve" };
  }

  // 1b. API routes always pass through — auth is handled by the route handler itself.
  //     This allows /api/mock-session (test-only) to operate without a pre-existing session.
  if (pathname.startsWith("/api/")) {
    return { action: "serve" };
  }

  // 2. Public portal route — serve for any role or unauthenticated.
  //    AC-AUTH-010-03: a signed-in ACCOUNTANT on a public portal route MUST be served.
  if (isPortalPublicPath(pathname)) {
    return { action: "serve" };
  }

  // Past here: we're on a portal PRIVATE route.

  // 3. Unauthenticated → redirect to portal /sign-in with redirect_url param.
  if (identity === null) {
    const portalBase = getPortalAppUrl();
    const redirectUrl = new URL("/sign-in", portalBase);
    redirectUrl.searchParams.set("redirect_url", requestUrl);
    return { action: "redirect", destination: redirectUrl, statusCode: 307 };
  }

  // 4. Signed-in ACCOUNTANT on a portal CLIENT-only (private) route → redirect to admin home.
  //    ADR-010 §1: "Signed-in ACCOUNTANT → apps/portal CLIENT-only route → Redirect to apps/admin/"
  if (identity.role === "ACCOUNTANT") {
    const adminBase = getAdminAppUrl();
    const destination = new URL("/", adminBase);
    return { action: "redirect", destination, statusCode: 307 };
  }

  // 5. Signed-in CLIENT → serve.
  return { action: "serve" };
}

// ─── Admin Redirect Decision ──────────────────────────────────────────────────

/**
 * Compute the redirect decision for a request to apps/admin.
 *
 * Encodes the ADR-010 matrix for the admin app:
 *   1. Infrastructure paths → always serve.
 *   2. Admin sign-in path (/sign-in/**) → serve (even without session).
 *   3. Unauthenticated → redirect to admin /sign-in.
 *   4. Signed-in CLIENT → redirect to portal home.
 *      ADR-010 §1: "compact HTML response with redirect header; no 403 page rendered"
 *   5. Signed-in ACCOUNTANT → serve.
 *
 * ADR-010 § "apps/admin has NO public routes" (beyond sign-in surface).
 *
 * @param pathname  The request pathname (e.g. "/dashboard")
 * @param identity  null = unauthenticated; Identity object = authenticated
 * @param requestUrl The full request URL (used to build sign-in redirect URL)
 */
export function adminRedirectDecision(
  pathname: string,
  identity: { role: Role } | null,
  requestUrl: string,
): MiddlewareDecision {
  // 1. Infrastructure paths always pass through — no auth check.
  if (isInfraPath(pathname)) {
    return { action: "serve" };
  }

  // 1b. API routes always pass through — auth is handled by the route handler itself.
  //     This allows /api/mock-session (test-only) to operate without a pre-existing session.
  if (pathname.startsWith("/api/")) {
    return { action: "serve" };
  }

  // 2. Admin sign-in surface is always accessible (even unauthenticated).
  //    ADR-010: "Unauthenticated → apps/admin → Redirect to apps/admin/sign-in"
  //    The /sign-in path itself must not redirect to /sign-in (infinite loop).
  if (pathname === "/sign-in" || pathname.startsWith("/sign-in/")) {
    return { action: "serve" };
  }

  // 3. Unauthenticated → redirect to admin /sign-in with redirect_url.
  if (identity === null) {
    const adminBase = getAdminAppUrl();
    const redirectUrl = new URL("/sign-in", adminBase);
    redirectUrl.searchParams.set("redirect_url", requestUrl);
    return { action: "redirect", destination: redirectUrl, statusCode: 307 };
  }

  // 4. Signed-in CLIENT → redirect to portal home (misnavigation, not a 403).
  //    ADR-010 §1: "Redirect to apps/portal/ ... this is a misnavigation, not a permission error"
  if (identity.role === "CLIENT") {
    const portalBase = getPortalAppUrl();
    const destination = new URL("/", portalBase);
    return { action: "redirect", destination, statusCode: 307 };
  }

  // 5. Signed-in ACCOUNTANT → serve.
  return { action: "serve" };
}
