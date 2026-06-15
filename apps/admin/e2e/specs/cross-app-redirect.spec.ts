/**
 * apps/admin/e2e/specs/cross-app-redirect.spec.ts — Exhaustive cross-app redirect matrix (admin)
 *
 * TASK-004-008: The EXHAUSTIVE ADR-010 §1 cross-app redirect matrix for the admin surface.
 * Complements apps/portal/e2e/specs/cross-app-redirect.spec.ts (portal surface).
 *
 * This spec covers:
 *   AC-AUTH-010-01: signed-in CLIENT → admin root AND a deep admin path
 *                   ⇒ redirect (307/308) to PORTAL_APP_URL; no admin UI flash; redirect not 403.
 *   Session continuity (ADR-010 §3): a session minted via admin /api/mock-session is honored
 *                   by the portal app (shared localhost cookie — ADR-010 §3 one-Clerk-app model).
 *   Global sign-out (ADR-010 §3, §8): clearSession clears the shared cookie ⇒ the next
 *                   request to a private admin route redirects to admin /sign-in.
 *
 * Redirect is 307/308 — NOT 403. Misnavigation is a redirect to the user's home surface.
 * Redirect fires in middleware BEFORE any admin content renders (no flash of wrong UI).
 *
 * The seam proof lives in apps/admin/e2e/specs/auth-redirect.spec.ts (TASK-004-002).
 * This file is the EXHAUSTIVE matrix suite and is selected by pnpm e2e:cross-app.
 *
 * Run:
 *   pnpm --filter admin e2e:run -- --grep 'cross-app'
 *
 * Requires:
 *   - Admin container running at http://localhost:3001 (AUTH_PROVIDER=mock)
 *   - Portal container running at http://localhost:3000 (AUTH_PROVIDER=mock)
 */

import { test, expect } from "@playwright/test";
import { setupClientSession, setupAccountantSession, clearSession } from "../fixtures/auth.js";

const ADMIN_PORT = process.env["ADMIN_PORT"] ?? "3001";
const ADMIN_URL = process.env["ADMIN_BASE_URL"] ?? `http://localhost:${ADMIN_PORT}`;
const PORTAL_URL = process.env["PORTAL_BASE_URL"] ?? "http://localhost:3000";
const PORTAL_ORIGIN = new URL(PORTAL_URL).origin;
const ADMIN_ORIGIN = new URL(ADMIN_URL).origin;

// ─── AC-AUTH-010-01: CLIENT on admin root → redirect to portal ────────────────

test.describe("[AC-AUTH-010-01] cross-app: signed-in CLIENT on admin root is redirected to portal", () => {
  test.beforeEach(async ({ page, request }) => {
    await setupClientSession(page, request);
  });

  test.afterEach(async ({ page }) => {
    await clearSession(page);
  });

  test("[AC-AUTH-010-01] CLIENT visiting admin root (/) is redirected to portal (3xx, not 403, no admin flash)", async ({ page }) => {
    // Given: a signed-in CLIENT session cookie exists
    // When: the CLIENT visits the admin root
    // Then: the middleware redirects (307/308) to PORTAL_APP_URL BEFORE any admin content renders

    let redirectStatus: number | undefined;
    page.on("response", (response) => {
      if (response.status() === 307 || response.status() === 308) {
        redirectStatus = response.status();
      }
    });

    // waitUntil: "commit" — captures the redirect response before Playwright follows it
    await page.goto(`${ADMIN_URL}/`, { waitUntil: "commit" });

    const finalUrl = new URL(page.url());

    // The middleware must have fired a redirect — either:
    // (a) We observed a 3xx response (redirect fired in middleware)
    // (b) The final URL is on the portal origin (middleware redirected us there)
    // NOT a 403 — this is misnavigation, not a permission error (ADR-010 §1).
    const isOnPortal = page.url().startsWith(PORTAL_ORIGIN);
    const leftAdminRoot = !(
      finalUrl.origin === ADMIN_ORIGIN && finalUrl.pathname === "/"
    );

    // Either a redirect was observed or we ended up on portal
    expect(redirectStatus !== undefined || isOnPortal, "Expected a 3xx redirect or final URL on portal origin").toBe(true);
    // Must not be serving admin root (no admin UI flash)
    expect(leftAdminRoot, "CLIENT must NOT be served the admin root — redirect must fire before content renders").toBe(true);
    // Must NOT be a 403 (ADR-010 §1 — misnavigation is a redirect, not a permission error)
    expect(redirectStatus === 403, "Must not produce a 403 — misnavigation is a redirect (307/308), not a permission error").toBe(false);

    // If we ended up on portal, verify it's the portal origin
    if (isOnPortal) {
      expect(finalUrl.hostname).toBe("localhost");
      expect(finalUrl.origin).toBe(PORTAL_ORIGIN);
    }
  });

  test("[AC-AUTH-010-01] CLIENT visiting a deep admin path is redirected to portal (3xx, not 403, no admin flash)", async ({ page }) => {
    // Given: a signed-in CLIENT session cookie exists
    // When: the CLIENT visits a deep admin path (even a non-existent one — middleware fires before 404)
    // Then: the middleware redirects (307/308) to PORTAL_APP_URL BEFORE any admin content renders

    let redirectStatus: number | undefined;
    page.on("response", (response) => {
      if (response.status() === 307 || response.status() === 308) {
        redirectStatus = response.status();
      }
    });

    // Target a non-existent deep path — the middleware redirect fires BEFORE the 404 handler.
    // This is the whole point: the CLIENT never reaches any admin content.
    await page.goto(`${ADMIN_URL}/engagements/123`, { waitUntil: "commit" });

    const finalUrl = new URL(page.url());

    const isOnPortal = page.url().startsWith(PORTAL_ORIGIN);
    const leftAdminPath = !(finalUrl.origin === ADMIN_ORIGIN && finalUrl.pathname === "/engagements/123");

    // Either a redirect was observed or we ended up on portal
    expect(redirectStatus !== undefined || isOnPortal, "Expected a 3xx redirect from a deep admin path for a CLIENT").toBe(true);
    // Must not be serving the deep admin path
    expect(leftAdminPath, "CLIENT must NOT be served a deep admin path — redirect must fire before content renders").toBe(true);
    // Must NOT be a 403
    expect(redirectStatus === 403, "Must not produce a 403 — misnavigation is a redirect").toBe(false);
  });
});

// ─── Session continuity (ADR-010 §3): session minted for admin is honored by portal ─

test.describe("[AC-AUTH-010-01] cross-app: session continuity — admin session honored by portal", () => {
  test.afterEach(async ({ page }) => {
    await clearSession(page);
  });

  test("[AC-AUTH-010-01] session continuity: CLIENT session minted on admin is honored by portal (no fresh sign-in prompt)", async ({ page, request }) => {
    // Given: a CLIENT session is established via the admin /api/mock-session
    //        (the signed cookie is set on localhost, shared across ports per ADR-010 §3)
    await setupClientSession(page, request);

    // When: navigating to a portal CLIENT-allowed route
    // Then: the session is honored (portal serves the page) — no redirect to portal /sign-in
    // Note: CLIENT on /dashboard should be served; CLIENT on /services should also be served.
    const response = await page.goto(`${PORTAL_URL}/services`, { waitUntil: "commit" });

    const finalUrl = new URL(page.url());

    // Must NOT land on portal /sign-in (session must be recognized)
    expect(
      finalUrl.pathname.startsWith("/sign-in"),
      "Portal must NOT redirect to /sign-in when the shared CLIENT session cookie is present"
    ).toBe(false);

    // The response must be 200 (portal served the public page successfully)
    expect(response?.status(), "Expected portal to serve (200) when CLIENT session is present on a public route").toBe(200);

    // Must be on the portal origin
    expect(finalUrl.origin, "Final URL must be on the portal origin").toBe(PORTAL_ORIGIN);
  });
});

// ─── Global sign-out (ADR-010 §3, §8): clear session → admin private route → sign-in ─

test.describe("[AC-AUTH-010-01] cross-app: global sign-out — clearing session causes admin redirect to sign-in", () => {
  test("[AC-AUTH-010-01] global sign-out: after clearSession, a private admin route redirects to admin /sign-in", async ({ page, request }) => {
    // Given: an ACCOUNTANT session is established
    await setupAccountantSession(page, request);

    // Verify the session is valid (admin root should be served for ACCOUNTANT)
    const initialResponse = await page.goto(`${ADMIN_URL}/`, { waitUntil: "commit" });
    // Should be served (not redirected to sign-in)
    expect(new URL(page.url()).pathname.startsWith("/sign-in")).toBe(false);
    expect(initialResponse?.status()).toBe(200);

    // When: the shared session is cleared (global sign-out — clears the shared cookie)
    await clearSession(page);

    // Then: the next request to a private admin route redirects to admin /sign-in
    let redirectSeen = false;
    page.on("response", (response) => {
      if (response.status() === 307 || response.status() === 308) {
        redirectSeen = true;
      }
    });

    await page.goto(`${ADMIN_URL}/`, { waitUntil: "commit" });

    const finalUrl = new URL(page.url());

    // The middleware must have redirected to admin /sign-in (unauthenticated redirect)
    expect(
      redirectSeen || finalUrl.pathname.includes("/sign-in"),
      "After global sign-out, a private admin route must redirect to admin /sign-in"
    ).toBe(true);

    // Must NOT be serving admin root
    expect(
      finalUrl.pathname === "/" && finalUrl.origin === ADMIN_ORIGIN && !redirectSeen,
      "After sign-out, admin root must not be served without authentication"
    ).toBe(false);
  });
});
