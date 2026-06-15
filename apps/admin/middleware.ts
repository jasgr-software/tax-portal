/**
 * apps/admin/middleware.ts — Per-app Next.js middleware for Tax Portal (admin)
 *
 * ADR-001: One Clerk application, two sign-in surfaces. This middleware enforces
 *          the ACCOUNTANT role gate for apps/admin using the @tax-portal/auth abstraction.
 * ADR-010: Admin has NO public routes. Every path requires ACCOUNTANT auth except:
 *          - /sign-in and /sign-in/** (sign-in surface — accessible unauthenticated)
 *          - /healthz, /readyz (infrastructure probes — Docker health checks)
 *          CLIENT on any admin route → redirect to PORTAL_APP_URL (misnavigation, not 403).
 * ADR-005: Role is read server-side from the verified session via applyAdminAuth().
 *
 * This middleware delegates to applyAdminAuth() from @tax-portal/auth.
 * It does NOT hand-roll the role check (CLAUDE.md multi-surface parity rule;
 * ADR-001 Consequences: "a shared helper in packages/auth hosts requireRole(role)
 * so neither app hand-rolls the check").
 *
 * The active binding is selected by AUTH_PROVIDER env var (default: "mock").
 * In e2e and local dev, the mock binding is active — no real Clerk keys needed.
 * In production, AUTH_PROVIDER=clerk activates the Clerk binding (TASK-004-003).
 *
 * Mirrors apps/portal/middleware.ts pattern (CLAUDE.md § Platform-frontend scope).
 */

import { type NextRequest } from "next/server";
import { applyAdminAuth } from "@tax-portal/auth";

/**
 * Next.js middleware function — runs on every matched request before the route handler.
 * Returns NextResponse.next() (serve) or NextResponse.redirect(url) (redirect).
 *
 * ADR-010: Redirect fires BEFORE any page content renders — no flash of admin UI
 * is ever rendered to a CLIENT or unauthenticated visitor.
 */
export async function middleware(request: NextRequest) {
  return applyAdminAuth(request);
}

/**
 * Matcher config — run middleware on all routes EXCEPT:
 *   - Next.js internals (_next/static, _next/image, etc.)
 *   - Static files (favicon, images, etc.)
 *
 * Sign-in paths, infra endpoints, and auth decisions are handled INSIDE the middleware
 * (not excluded here) so policy is maintained in one place (@tax-portal/auth) rather
 * than split between matcher config and applyAdminAuth logic.
 *
 * ADR-010 "apps/admin has NO public routes" — the matcher deliberately matches
 * everything so applyAdminAuth() can enforce the full redirect matrix.
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
