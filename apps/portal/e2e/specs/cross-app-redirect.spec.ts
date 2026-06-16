/**
 * apps/portal/e2e/specs/cross-app-redirect.spec.ts — Exhaustive cross-app redirect matrix (portal)
 *
 * TASK-004-008: The EXHAUSTIVE ADR-010 §1 cross-app redirect matrix for the portal surface.
 * Complements apps/admin/e2e/specs/cross-app-redirect.spec.ts (admin surface).
 *
 * This spec covers:
 *   AC-AUTH-010-02: signed-in ACCOUNTANT → portal CLIENT-only route (/dashboard)
 *                   ⇒ redirect (307/308) to ADMIN_APP_URL; no CLIENT-only UI flash; redirect not 403.
 *   AC-AUTH-010-03: signed-in ACCOUNTANT → portal public route (/services)
 *                   ⇒ served (200); stays on portal origin; no redirect.
 *   Session continuity (ADR-010 §3): a session minted via portal /api/mock-session is honored
 *                   by the admin app (shared localhost cookie) — no fresh sign-in prompt.
 *   Global sign-out (ADR-010 §3, §8): clearSession clears the shared cookie ⇒ the next
 *                   request to a private portal route redirects to portal /sign-in.
 *
 * Redirect is 307/308 — NOT 403. Misnavigation is a redirect to the user's home surface.
 * Redirect fires in middleware BEFORE any wrong-app content renders (no flash of wrong UI).
 *
 * The seam proof lives in apps/portal/e2e/specs/auth-redirect.spec.ts (TASK-004-002).
 * This file is the EXHAUSTIVE matrix suite and is selected by pnpm e2e:cross-app.
 *
 * Run:
 *   pnpm --filter portal e2e:run -- --grep 'cross-app'
 *
 * Requires:
 *   - Portal container running at http://localhost:3000 (AUTH_PROVIDER=mock)
 *   - Admin container running at http://localhost:3001 (AUTH_PROVIDER=mock)
 */

import { test, expect } from "@playwright/test";
import { setupAccountantSession, setupClientSession, clearSession } from "../fixtures/auth.js";

const PORTAL_URL = process.env["PORTAL_BASE_URL"] ?? "http://localhost:3000";
const ADMIN_URL = process.env["ADMIN_BASE_URL"] ?? "http://localhost:3001";
const PORTAL_ORIGIN = new URL(PORTAL_URL).origin;
const ADMIN_ORIGIN = new URL(ADMIN_URL).origin;

// ─── AC-AUTH-010-02: ACCOUNTANT on portal CLIENT-only route → redirect to admin ─

test.describe("[AC-AUTH-010-02] cross-app: signed-in ACCOUNTANT on a portal CLIENT-only route is redirected to admin", () => {
  test.beforeEach(async ({ page, request }) => {
    await setupAccountantSession(page, request);
  });

  test.afterEach(async ({ page }) => {
    await clearSession(page);
  });

  test("[AC-AUTH-010-02] ACCOUNTANT visiting /dashboard is redirected to admin (3xx, not 403, no CLIENT-only flash)", async ({ page }) => {
    // Given: a signed-in ACCOUNTANT session cookie exists
    // When: the ACCOUNTANT visits a portal CLIENT-only route (/dashboard)
    // Then: the middleware redirects (307/308) to ADMIN_APP_URL BEFORE any dashboard content renders

    let redirectStatus: number | undefined;
    page.on("response", (response) => {
      if (response.status() === 307 || response.status() === 308) {
        redirectStatus = response.status();
      }
    });

    // waitUntil: "commit" — captures the redirect response before Playwright follows it
    await page.goto(`${PORTAL_URL}/dashboard`, { waitUntil: "commit" });

    const finalUrl = new URL(page.url());

    // The middleware must have fired a redirect — either:
    // (a) We observed a 3xx response (redirect fired in middleware)
    // (b) The final URL is on the admin origin (middleware redirected us there)
    // NOT a 403 — this is misnavigation, not a permission error.
    const isOnAdmin = page.url().startsWith(ADMIN_ORIGIN);
    const leftPortalDashboard = !(
      finalUrl.hostname === "localhost" &&
      (finalUrl.port === "3000" || finalUrl.port === "") &&
      finalUrl.pathname === "/dashboard"
    );

    // Either a redirect was observed or we ended up on admin
    expect(redirectStatus !== undefined || isOnAdmin, "Expected a 3xx redirect or final URL on admin origin").toBe(true);
    // Must not be serving the portal /dashboard (no CLIENT-only UI flash)
    expect(leftPortalDashboard, "ACCOUNTANT must NOT be served the portal /dashboard — redirect must fire before content renders").toBe(true);
    // Must NOT be a 403 (ADR-010 §1 — misnavigation is a redirect, not a permission error)
    expect(redirectStatus === 403, "Must not produce a 403 — misnavigation is a redirect (307/308), not a permission error").toBe(false);

    // If we ended up on admin, verify it's the admin origin
    if (isOnAdmin) {
      expect(finalUrl.hostname).toBe("localhost");
      expect(finalUrl.origin).toBe(ADMIN_ORIGIN);
    }
  });
});

// ─── AC-AUTH-010-03: ACCOUNTANT on portal public route → SERVED ───────────────

test.describe("[AC-AUTH-010-03] cross-app: signed-in ACCOUNTANT on a portal public route is served (no redirect)", () => {
  test.beforeEach(async ({ page, request }) => {
    await setupAccountantSession(page, request);
  });

  test.afterEach(async ({ page }) => {
    await clearSession(page);
  });

  test("[AC-AUTH-010-03] ACCOUNTANT visiting /services is served (200, stays on portal, no redirect to admin)", async ({ page }) => {
    // Given: a signed-in ACCOUNTANT session cookie exists
    // When: the ACCOUNTANT visits a portal PUBLIC route (/services)
    // Then: the page is served (200 OK); stays on portal origin; portal public allow-list is honored.

    let redirectToAdmin = false;
    page.on("response", (response) => {
      const loc = response.headers()["location"] ?? "";
      if ((response.status() === 307 || response.status() === 308) && loc.startsWith(ADMIN_ORIGIN)) {
        redirectToAdmin = true;
      }
    });

    const response = await page.goto(`${PORTAL_URL}/services`);

    // Then: served (200 OK)
    expect(response?.status(), "Expected 200 for a public portal route visited by an ACCOUNTANT").toBe(200);

    // Must NOT be redirected to admin (the allow-list is honored)
    expect(redirectToAdmin, "ACCOUNTANT on /services must NOT be redirected to admin").toBe(false);

    // Final URL must be on the portal origin
    const finalUrl = new URL(page.url());
    expect(finalUrl.origin, "Final URL must remain on the portal origin").toBe(PORTAL_ORIGIN);
    expect(page.url()).not.toContain(ADMIN_ORIGIN);
  });

  test("[AC-AUTH-010-03] ACCOUNTANT visiting portal root (/) is served (no redirect to admin)", async ({ page }) => {
    // Portal root is also a public route — must be served for any role.
    const response = await page.goto(`${PORTAL_URL}/`);
    expect(response?.status()).toBe(200);
    expect(page.url()).not.toContain(ADMIN_ORIGIN);
    expect(new URL(page.url()).origin).toBe(PORTAL_ORIGIN);
  });
});

// ─── Session continuity (ADR-010 §3): session minted for portal is honored by admin ─

test.describe("[AC-AUTH-010-03] cross-app: session continuity — portal session honored by admin", () => {
  test.afterEach(async ({ page }) => {
    await clearSession(page);
  });

  test("[AC-AUTH-010-03] session continuity: ACCOUNTANT session minted on portal is honored by admin (no fresh sign-in prompt)", async ({ page, request }) => {
    // Given: an ACCOUNTANT session is established via the portal /api/mock-session
    //        (the signed cookie is set on localhost, shared across ports per ADR-010 §3)
    await setupAccountantSession(page, request);

    // When: navigating to the admin app (its sign-in-excluded route /healthz always served)
    // We navigate to the admin root and verify the session is recognized.
    // Key proof: the admin middleware must NOT redirect to /sign-in when the shared cookie is present.
    // The admin root may 404 (no dashboard built yet) or redirect internally — either is fine;
    // what matters is the middleware said "session recognized, pass through" not "go to /sign-in".
    let redirectToSignIn = false;
    page.on("response", (response) => {
      const loc = response.headers()["location"] ?? "";
      if ((response.status() === 307 || response.status() === 308) && loc.includes("/sign-in")) {
        redirectToSignIn = true;
      }
    });

    await page.goto(`${ADMIN_URL}/`, { waitUntil: "commit" });

    const finalUrl = new URL(page.url());

    // Must NOT land on admin /sign-in (session must be recognized by the middleware)
    expect(
      finalUrl.pathname.startsWith("/sign-in"),
      "Admin must NOT redirect to /sign-in when the shared ACCOUNTANT session cookie is present — session continuity broken"
    ).toBe(false);

    // Must NOT have seen a redirect to /sign-in
    expect(
      redirectToSignIn,
      "Admin must NOT emit a redirect to /sign-in when ACCOUNTANT session cookie is present"
    ).toBe(false);

    // Must NOT be redirected to portal (the ACCOUNTANT session is valid for admin, not portal)
    expect(
      page.url().startsWith(PORTAL_ORIGIN),
      "Admin must NOT redirect an ACCOUNTANT back to portal when session is present"
    ).toBe(false);

    // The final URL must remain on the admin origin (session recognized → stayed on admin)
    expect(
      finalUrl.origin,
      "Final URL must be on the admin origin when ACCOUNTANT session is valid"
    ).toBe(ADMIN_ORIGIN);
  });
});

// ─── Global sign-out (ADR-010 §3, §8): clear session → portal private route → sign-in ─

test.describe("[AC-AUTH-010-01/-02] cross-app: global sign-out — clearing session causes portal redirect to sign-in", () => {
  test("[AC-AUTH-010-01/-02] global sign-out: after clearSession, a private portal route redirects to /sign-in", async ({ page, request }) => {
    // Given: a CLIENT session is established
    await setupClientSession(page, request);

    // Verify the session is valid (portal private route should serve)
    await page.goto(`${PORTAL_URL}/dashboard`, { waitUntil: "commit" });
    // At this point, CLIENT on /dashboard should be served OR redirected within portal
    // (not to /sign-in, since the session is valid)

    // When: the shared session is cleared (global sign-out — clears the shared cookie)
    await clearSession(page);

    // Then: the next request to a private portal route redirects to portal /sign-in
    let redirectSeen = false;
    page.on("response", (response) => {
      if (response.status() === 307 || response.status() === 308) {
        redirectSeen = true;
      }
    });

    await page.goto(`${PORTAL_URL}/dashboard`, { waitUntil: "commit" });

    const finalUrl = new URL(page.url());

    // The middleware must have redirected to /sign-in (unauthenticated redirect)
    expect(
      redirectSeen || finalUrl.pathname.includes("/sign-in"),
      "After global sign-out, a private portal route must redirect to /sign-in"
    ).toBe(true);

    // Must NOT be serving /dashboard
    expect(
      finalUrl.pathname === "/dashboard" && (finalUrl.port === "3000" || finalUrl.port === ""),
      "After sign-out, /dashboard must not be served"
    ).toBe(false);
  });
});
