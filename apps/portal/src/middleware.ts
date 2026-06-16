/**
 * apps/portal/src/middleware.ts — Per-app Next.js middleware for Client Portal
 *
 * ADR-001: One Clerk application, two sign-in surfaces. This middleware enforces
 *          the role gate for apps/portal using the @tax-portal/auth abstraction.
 * ADR-010: Redirect matrix for portal — public allow-list, ACCOUNTANT on CLIENT-only
 *          route → redirect to admin, unauthenticated on private route → redirect to sign-in.
 * ADR-005: Role is read server-side from the verified session via applyPortalAuth().
 *
 * This middleware delegates to applyPortalAuth() from @tax-portal/auth.
 * It does NOT hand-roll the role check (CLAUDE.md multi-surface parity rule;
 * ADR-001 Consequences: "a shared helper in packages/auth hosts requireRole(role)
 * so neither app hand-rolls the check").
 *
 * The active binding is selected by AUTH_PROVIDER env var (default: "mock").
 * In e2e and local dev, the mock binding is active — no real Clerk keys needed.
 * In production, AUTH_PROVIDER=clerk activates the Clerk binding (TASK-004-003).
 *
 * Excluded from auth:
 *   - Public portal routes: /, /services, /request, /sign-in, /sign-up (and sub-paths)
 *   - Infrastructure: /healthz, /readyz (Docker health probes)
 *
 * AC-AUTH-010-03: A signed-in ACCOUNTANT visiting a public portal route MUST be served.
 *
 * Note: This file lives in src/ because the portal uses the src/ directory structure.
 * Next.js 15 looks for middleware.ts at the same level as the app/ directory.
 */

import { type NextRequest } from "next/server";
import { applyPortalAuth } from "@tax-portal/auth";

/**
 * Next.js middleware function — runs on every matched request before the route handler.
 * Returns NextResponse.next() (serve) or NextResponse.redirect(url) (redirect).
 *
 * ADR-010: Redirect fires BEFORE any page content renders — this is the seam that
 * prevents the "flash of wrong-surface UI."
 */
export async function middleware(request: NextRequest) {
  return applyPortalAuth(request);
}

/**
 * Matcher config — run middleware on all routes EXCEPT:
 *   - Next.js internals (_next/static, _next/image, etc.)
 *   - Static files (favicon, images, etc.)
 *
 * Public portal routes and infra endpoints are handled INSIDE the middleware
 * (not excluded by the matcher) so they can be explicitly allow-listed by
 * applyPortalAuth / isPortalPublicPath / isInfraPath. This ensures the allow-list
 * is maintained in one place (@tax-portal/auth) rather than in two matcher configs.
 *
 * ADR-010: the matcher is intentionally broad; the redirect logic inside
 * applyPortalAuth() is the authoritative policy.
 */
export const config = {
  matcher: [
    /*
     * Match all request paths EXCEPT:
     *   - _next/static (static assets)
     *   - _next/image (image optimization)
     *   - favicon.ico (site icon)
     *   - Files with extensions (e.g. .png, .jpg, .svg, .webp)
     */
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff|woff2|ttf|eot)$).*)",
  ],
};
