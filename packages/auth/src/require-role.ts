/**
 * packages/auth/src/require-role.ts — requireRole() helper for per-app middleware
 *
 * Provides the high-level helper that apps/portal/middleware.ts and
 * apps/admin/middleware.ts import. This keeps role-gate logic in one place;
 * neither app hand-rolls the check (ADR-001 Consequences; CLAUDE.md multi-surface default).
 *
 * ADR-005: Role is server-evaluated from the verified session — never client-asserted.
 * ADR-010: Misnavigation is a redirect (307), not a 403. Redirect fires before render.
 *
 * The functions here combine:
 *   1. getAuthProvider().getIdentity(request) — reads the verified session
 *   2. portalRedirectDecision / adminRedirectDecision — encodes the ADR-010 matrix
 *
 * Apps import `applyPortalAuth` / `applyAdminAuth` from @tax-portal/auth and call
 * them in their middleware — no direct binding import, no hand-rolled role check.
 */

import { type NextRequest, NextResponse } from "next/server.js";
import { getAuthProvider } from "./select.js";
import {
  portalRedirectDecision,
  adminRedirectDecision,
  type MiddlewareDecision,
} from "./redirect.js";
import { MOCK_SESSION_COOKIE_NAME } from "./bindings/mock.js";

// ─── Shared Types ─────────────────────────────────────────────────────────────

export type { MiddlewareDecision };

// ─── Portal Auth ──────────────────────────────────────────────────────────────

/**
 * Apply ADR-010 portal auth logic to a Next.js middleware request.
 *
 * Returns a NextResponse:
 *   - NextResponse.next() if the request should be served
 *   - NextResponse.redirect(url) if the request should be redirected
 *
 * Called from apps/portal/middleware.ts. Uses the active auth provider
 * binding (mock in e2e/local dev, Clerk in production).
 *
 * AC-AUTH-001-03 foundation: identity/role is read from the VERIFIED session
 * via getAuthProvider().getIdentity(), never from a client-supplied header.
 */
export async function applyPortalAuth(request: NextRequest): Promise<NextResponse> {
  const provider = getAuthProvider();
  // Use NextRequest.cookies.get() to reliably extract the mock session cookie
  // in Edge Runtime (where request.headers.get("cookie") may not expose all cookies).
  // Build a synthetic Request with the cookie header set from NextRequest.cookies.
  const mockSessionCookie = request.cookies.get(MOCK_SESSION_COOKIE_NAME)?.value;
  const syntheticHeaders = new Headers(request.headers);
  if (mockSessionCookie) {
    syntheticHeaders.set("cookie", `${MOCK_SESSION_COOKIE_NAME}=${mockSessionCookie}`);
  }
  const syntheticRequest = new Request(request.url, { headers: syntheticHeaders });
  const identity = await provider.getIdentity(syntheticRequest);

  const decision: MiddlewareDecision = portalRedirectDecision(
    request.nextUrl.pathname,
    identity,
    request.url,
  );

  if (decision.action === "redirect") {
    return NextResponse.redirect(decision.destination, {
      status: decision.statusCode,
    });
  }

  return NextResponse.next();
}

/**
 * Apply ADR-010 admin auth logic to a Next.js middleware request.
 *
 * Returns a NextResponse:
 *   - NextResponse.next() if the request should be served (ACCOUNTANT authenticated)
 *   - NextResponse.redirect(url) if the request should be redirected
 *
 * Called from apps/admin/middleware.ts. Uses the active auth provider binding.
 *
 * AC-AUTH-001-03 foundation: role is read server-side from the verified session.
 */
export async function applyAdminAuth(request: NextRequest): Promise<NextResponse> {
  const provider = getAuthProvider();
  // Use NextRequest.cookies.get() to reliably extract the mock session cookie
  // in Edge Runtime (where request.headers.get("cookie") may not expose all cookies).
  const mockSessionCookie = request.cookies.get(MOCK_SESSION_COOKIE_NAME)?.value;
  const syntheticHeaders = new Headers(request.headers);
  if (mockSessionCookie) {
    syntheticHeaders.set("cookie", `${MOCK_SESSION_COOKIE_NAME}=${mockSessionCookie}`);
  }
  const syntheticRequest = new Request(request.url, { headers: syntheticHeaders });
  const identity = await provider.getIdentity(syntheticRequest);

  const decision: MiddlewareDecision = adminRedirectDecision(
    request.nextUrl.pathname,
    identity,
    request.url,
  );

  if (decision.action === "redirect") {
    return NextResponse.redirect(decision.destination, {
      status: decision.statusCode,
    });
  }

  return NextResponse.next();
}
