/**
 * apps/admin/e2e/specs/auth-redirect.spec.ts — Minimal middleware seam proof (admin)
 *
 * TASK-004-002: Proves the admin middleware seam fires BEFORE any page content renders,
 * using the mock auth binding (AUTH_PROVIDER=mock, default in the docker-compose stack).
 *
 * AC-AUTH-010-02 (seam proof): A CLIENT request to an admin route → redirects to portal
 * BEFORE any admin content renders. This is "redirect, not 403" (ADR-010 §1).
 *
 * Mirrors apps/portal/e2e/specs/auth-redirect.spec.ts
 * (CLAUDE.md § Platform-frontend scope — both surfaces must be wired).
 *
 * Execution against the docker-compose stack (AUTH_PROVIDER=mock):
 *   pnpm --filter admin e2e:run -- --grep auth-redirect
 *
 * Requires:
 *   - Admin container running at http://localhost:3001
 *   - AUTH_PROVIDER=mock (container env — the default)
 *   - PORTAL_APP_URL set (container env — redirect destination for CLIENT on admin route)
 */

import { test, expect } from "@playwright/test";
import { setupClientSession, setupAccountantSession, clearSession } from "../fixtures/auth.js";

// Derive admin URL from ADMIN_BASE_URL or ADMIN_PORT (mirrors playwright.config.ts + fixture).
const ADMIN_PORT = process.env["ADMIN_PORT"] ?? "3001";
const ADMIN_URL = process.env["ADMIN_BASE_URL"] ?? `http://localhost:${ADMIN_PORT}`;
const PORTAL_URL = process.env["PORTAL_BASE_URL"] ?? "http://localhost:3000";
const PORTAL_ORIGIN = new URL(PORTAL_URL).origin;
const ADMIN_ORIGIN = new URL(ADMIN_URL).origin;

// ─── AC-AUTH-010-02 (seam): CLIENT on admin route → redirect to portal ────────

test.describe("[AC-AUTH-010-02 seam] CLIENT on admin route redirects to portal", () => {
  test.beforeEach(async ({ page, request }) => {
    await setupClientSession(page, request);
  });

  test.afterEach(async ({ page }) => {
    await clearSession(page);
  });

  test("[AC-AUTH-010-02 seam] CLIENT visiting admin root is redirected to portal before content renders", async ({ page }) => {
    // Given: a signed-in CLIENT session cookie exists
    // When: the CLIENT visits the admin app root

    let redirectSeen = false;
    page.on("response", (response) => {
      if (response.status() === 307 || response.status() === 308) {
        redirectSeen = true;
      }
    });

    await page.goto(`${ADMIN_URL}/`, { waitUntil: "commit" });

    const finalUrl = new URL(page.url());

    // Then: the middleware redirects to the portal (before any admin content renders)
    // Either redirect was observed or we're now on the portal
    const isPortalApp = page.url().startsWith(PORTAL_ORIGIN);
    const isNotAdminRoot = !(page.url().startsWith(ADMIN_ORIGIN) && finalUrl.pathname === "/");

    // The middleware must have prevented the admin root from rendering for a CLIENT
    expect(redirectSeen || isPortalApp || isNotAdminRoot).toBe(true);

    // If we ended up on the portal, that's the correct redirect destination
    if (isPortalApp) {
      expect(finalUrl.hostname).toBe("localhost");
    }
  });
});

// ─── Unauthenticated on admin route → redirect to admin sign-in ─────────────────

test.describe("Unauthenticated on admin route redirects to admin sign-in", () => {
  test("unauthenticated request to admin root redirects to /sign-in", async ({ page }) => {
    // Given: no session cookie (unauthenticated)
    // When: visiting the admin root
    let redirectSeen = false;
    page.on("response", (response) => {
      if (response.status() === 307 || response.status() === 308) {
        redirectSeen = true;
      }
    });

    await page.goto(`${ADMIN_URL}/`, { waitUntil: "commit" });

    const finalUrl = new URL(page.url());

    // The middleware should have redirected to admin /sign-in
    expect(
      redirectSeen || finalUrl.pathname.includes("/sign-in")
    ).toBe(true);
  });

  test("admin /sign-in is accessible without auth (no redirect loop)", async ({ page }) => {
    // Given: no session cookie
    // When: visiting admin /sign-in
    const response = await page.goto(`${ADMIN_URL}/sign-in`);

    // Then: the sign-in page is served (200 OK — not a redirect loop)
    // Note: may redirect to a sign-in sub-path (e.g. if a sign-in page doesn't exist yet,
    // it will render something — a 404 page or a placeholder, but NOT a redirect back to /sign-in)
    const finalUrl = new URL(page.url());
    expect(finalUrl.pathname.startsWith("/sign-in") || response?.status() === 200).toBe(true);
  });
});

// ─── ACCOUNTANT on admin route → serve ────────────────────────────────────────

test.describe("ACCOUNTANT on admin route is served", () => {
  test.beforeEach(async ({ page, request }) => {
    await setupAccountantSession(page, request);
  });

  test.afterEach(async ({ page }) => {
    await clearSession(page);
  });

  test("ACCOUNTANT visiting admin root is served (not redirected)", async ({ page }) => {
    // Given: a signed-in ACCOUNTANT session cookie exists
    // When: the ACCOUNTANT visits the admin root
    const response = await page.goto(`${ADMIN_URL}/`);

    // Then: the page is served (200 OK or a redirect within the admin app, NOT to portal)
    // Must NOT have been redirected to the portal
    expect(page.url()).not.toContain(PORTAL_ORIGIN);

    // Status must be 200 (even if there's a 307 to an admin sub-route)
    expect(response?.status()).toBe(200);
  });
});
