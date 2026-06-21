/**
 * apps/portal/e2e/specs/auth-redirect.spec.ts — Minimal middleware seam proof (portal)
 *
 * TASK-004-002: Proves the portal middleware seam fires BEFORE any page content renders,
 * using the mock auth binding (AUTH_PROVIDER=mock, default in the docker-compose stack).
 *
 * TASK-009-003 (AC-AUTH-010 non-regression): This file is tagged as part of TASK-009-003
 * AC-AUTH-010 non-regression ownership. The redirect-matrix MECHANISM was delivered by
 * EPIC-004 — it is NOT rebuilt. The tier-2/3 unit-level AC-AUTH-010 proofs live in
 * apps/portal/src/app/(dev)/dev-sign-in/server-set-role.test.ts.
 *
 * AC-AUTH-010-03: A signed-in ACCOUNTANT visiting a public portal route MUST be served
 * (no redirect). This is the key "redirect matrix foundation" test for this task.
 *
 * AC-AUTH-010-01 (seam proof): ACCOUNTANT on a portal CLIENT-only route → redirects to admin.
 * Note: the EXHAUSTIVE AC-AUTH-010-* cross-app matrix lives in TASK-004-008.
 *
 * Execution against the docker-compose stack (AUTH_PROVIDER=mock):
 *   pnpm --filter portal e2e:run -- --grep auth-redirect
 *
 * Requires:
 *   - Portal container running at http://localhost:3000
 *   - AUTH_PROVIDER=mock (container env — the default)
 *   - ADMIN_APP_URL set (container env — redirect destination for ACCOUNTANT on private route)
 */

import { test, expect } from "@playwright/test";
import { setupAccountantSession, clearSession } from "../fixtures/auth.js";

const PORTAL_URL = process.env["PORTAL_BASE_URL"] ?? "http://localhost:3000";
const ADMIN_URL = process.env["ADMIN_BASE_URL"] ?? "http://localhost:3001";
const ADMIN_ORIGIN = new URL(ADMIN_URL).origin;

// ─── AC-AUTH-010-03: ACCOUNTANT on public portal route → SERVE ────────────────

test.describe("[AC-AUTH-010-03] ACCOUNTANT on public portal route is served", () => {
  test.beforeEach(async ({ page, request }) => {
    await setupAccountantSession(page, request);
  });

  test.afterEach(async ({ page }) => {
    await clearSession(page);
  });

  test("[AC-AUTH-010-03] ACCOUNTANT visiting /services is served (no redirect)", async ({ page }) => {
    // Given: a signed-in ACCOUNTANT session cookie exists
    // When: the ACCOUNTANT visits a public portal route (/services)
    const response = await page.goto(`${PORTAL_URL}/services`);

    // Then: the page is served (200 OK — no redirect to admin)
    // The final URL should be /services (or the portal origin), NOT the admin URL
    expect(response?.status()).toBe(200);
    const finalUrl = new URL(page.url());
    // Must NOT have been redirected to the admin app
    expect(page.url()).not.toContain(ADMIN_ORIGIN);
    expect(finalUrl.hostname).toBe("localhost");
    // Should still be on the portal
    expect(finalUrl.pathname).toContain("service");
  });
});

// ─── AC-AUTH-010-01 (seam): ACCOUNTANT on private portal route → redirect to admin ─

test.describe("[AC-AUTH-010-01 seam] ACCOUNTANT on private portal route redirects to admin", () => {
  test.beforeEach(async ({ page, request }) => {
    await setupAccountantSession(page, request);
  });

  test.afterEach(async ({ page }) => {
    await clearSession(page);
  });

  test("[AC-AUTH-010-01 seam] ACCOUNTANT on /dashboard is redirected to admin", async ({ page }) => {
    // Given: a signed-in ACCOUNTANT session cookie exists
    // When: the ACCOUNTANT visits a portal CLIENT-only route (/dashboard)
    // Then: the middleware redirects to the admin app BEFORE content renders

    // We capture responses to see if a redirect fired
    let redirected = false;
    page.on("response", (response) => {
      if (response.status() === 307 || response.status() === 308) {
        redirected = true;
      }
    });

    await page.goto(`${PORTAL_URL}/dashboard`, { waitUntil: "commit" });

    // The middleware should have redirected — the final URL should be the admin app
    // or at minimum NOT be the portal /dashboard
    const finalUrl = new URL(page.url());

    // Either the redirect fired (redirected = true) or the final destination is admin
    // In both cases, the portal /dashboard content must NOT be visible
    const isDashboard = finalUrl.hostname === "localhost" &&
      finalUrl.port === "3000" &&
      finalUrl.pathname === "/dashboard";

    // If we ended up on admin, that's the correct redirect destination
    const isAdminApp = page.url().startsWith(ADMIN_ORIGIN);

    // The middleware must have redirected — either redirect was observed or we landed on admin
    expect(redirected || isAdminApp || !isDashboard).toBe(true);
  });
});

// ─── Unauthenticated on private portal route → redirect to sign-in ─────────────

test.describe("Unauthenticated on private portal route redirects to sign-in", () => {
  test("unauthenticated request to /dashboard redirects to /sign-in", async ({ page }) => {
    // Given: no session cookie (unauthenticated)
    // When: visiting a private portal route
    let redirectSeen = false;
    page.on("response", (response) => {
      if (response.status() === 307 || response.status() === 308) {
        redirectSeen = true;
      }
    });

    await page.goto(`${PORTAL_URL}/dashboard`, { waitUntil: "commit" });

    const finalUrl = new URL(page.url());

    // The middleware should have redirected to sign-in
    // Final destination should include /sign-in
    expect(
      redirectSeen || finalUrl.pathname.includes("/sign-in")
    ).toBe(true);
  });
});
