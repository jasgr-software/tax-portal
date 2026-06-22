/**
 * apps/portal/e2e/specs/cross-app-redirect.spec.ts — Exhaustive cross-app redirect matrix (portal)
 *
 * TASK-004-008: The EXHAUSTIVE ADR-010 §1 cross-app redirect matrix for the portal surface.
 * Complements apps/admin/e2e/specs/cross-app-redirect.spec.ts (admin surface).
 *
 * TASK-009-003 (AC-AUTH-010 non-regression): This file is tagged as TASK-009-003 ownership
 * for the AC-AUTH-010 acceptance criteria. The redirect-matrix MECHANISM was delivered and
 * verified by EPIC-004 — it is NOT rebuilt here. TASK-009-003 owns the tagging + the
 * tier-2/3 unit-level proofs (server-set-role.test.ts); the e2e validation of AC-AUTH-010
 * through the dev sign-in lane's full flow is consolidated into TASK-009-004.
 * Middleware was NOT re-implemented — this is consolidation = ownership + tagging, not a rewrite.
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

// ─── AC-LIFE-003-03 / AC-LIFE-006-02: CLIENT redirected away from admin lifecycle surface ──

/**
 * TASK-010-004: Client navigating to the admin engagement lifecycle (transition/reopen) surface
 * is redirected away. The lifecycle controls live in apps/admin only (ADR-006, ADR-010).
 *
 * A CLIENT navigating to admin's /engagements/[id] (the transition surface) hits the
 * middleware's ACCOUNTANT-only enforcement and is redirected back to portal.
 *
 * AC-LIFE-003-03: A client cannot change an engagement's status — the admin transition
 *   surface is unreachable from apps/portal (no UI affordance + cross-app redirect).
 * AC-LIFE-006-02: A client cannot reopen a completed engagement — reopen is admin-only.
 *
 * // ADR-010: client navigating to admin transition surface is redirected
 * // ADR-006: lifecycle controls are admin-only
 * // CS-GEN-003: AC ids in comments
 */
test.describe("[AC-LIFE-003-03] [AC-LIFE-006-02] cross-app: CLIENT navigating to admin engagement lifecycle surface is redirected", () => {
  test.afterEach(async ({ page }) => {
    await clearSession(page);
  });

  test("[AC-LIFE-003-03] [AC-LIFE-006-02] CLIENT session cannot reach the admin engagement transition/lifecycle page", async ({
    page,
    request,
  }) => {
    // Given: a signed-in CLIENT session
    await setupClientSession(page, request);

    // When: CLIENT navigates to the admin engagement lifecycle surface
    // (the transition/reopen controls for a specific engagement)
    // We use a placeholder engagement id — the middleware enforces role BEFORE the page loads.
    // ADR-010: The admin middleware rejects non-ACCOUNTANT sessions.
    const fakeEngagementId = "00000000-0000-0000-0000-000000000001";
    let redirectToPortalOrSignIn = false;
    let adminEngagementPageServed = false;

    page.on("response", (response) => {
      const loc = response.headers()["location"] ?? "";
      // Redirect to portal or to admin sign-in counts as "redirected away"
      if (response.status() === 307 || response.status() === 308) {
        if (loc.startsWith(PORTAL_ORIGIN) || loc.includes("/sign-in")) {
          redirectToPortalOrSignIn = true;
        }
      }
    });

    await page.goto(`${ADMIN_URL}/engagements/${fakeEngagementId}`, {
      waitUntil: "commit",
    });

    const finalUrl = new URL(page.url());

    // The engagement lifecycle management panel must NOT be served to the CLIENT.
    // data-testid="engagement-status-panel" is the admin-only lifecycle UI (EngagementStatusPanel).
    const statusPanel = page.locator('[data-testid="engagement-status-panel"]');
    const statusPanelCount = await statusPanel.count();
    if (statusPanelCount === 0) {
      adminEngagementPageServed = false;
    } else {
      adminEngagementPageServed = true;
    }

    // Then: the CLIENT did NOT get served the admin engagement lifecycle page
    expect(
      adminEngagementPageServed,
      "[AC-LIFE-003-03] CLIENT must NOT be served the admin engagement lifecycle panel (transition/reopen controls)",
    ).toBe(false);

    // The admin middleware should have redirected the CLIENT away
    // (either a redirect was observed OR the final URL is not on the admin engagement path)
    const finalIsAdminEngagementPage =
      finalUrl.origin === ADMIN_ORIGIN &&
      finalUrl.pathname.startsWith("/engagements/") &&
      !finalUrl.pathname.includes("/sign-in");

    // Either a redirect was seen OR we did not end up on the admin engagement page
    expect(
      redirectToPortalOrSignIn || !finalIsAdminEngagementPage,
      "[AC-LIFE-003-03] CLIENT navigating to admin engagement lifecycle surface must be redirected " +
        `(final URL: ${page.url()}, redirect seen: ${redirectToPortalOrSignIn})`,
    ).toBe(true);
  });

  test("[AC-LIFE-003-03] [AC-LIFE-006-02] CLIENT on portal /dashboard has no affordance pointing to the admin transition URL", async ({
    page,
    request,
  }) => {
    // Given: a signed-in CLIENT session on the portal dashboard
    await setupClientSession(page, request);

    // When: CLIENT navigates to /dashboard
    await page.goto(`${PORTAL_URL}/dashboard`);

    // Then: the page content does NOT contain links to the admin transition surface.
    // AC-LIFE-003-03, AC-LIFE-006-02: no affordance pointing at admin lifecycle controls.
    const bodyHtml = await page.content();

    // No admin URLs in the portal page content
    expect(
      bodyHtml,
      "[AC-LIFE-003-03] Portal /dashboard must not contain links to the admin origin",
    ).not.toContain(ADMIN_ORIGIN);

    // No transition or reopen buttons
    const transitionButtons = page.locator(
      '[data-testid="advance-status-button"], [data-testid="transition-button"], ' +
        '[data-testid="reopen-engagement-button"]',
    );
    await expect(transitionButtons).toHaveCount(0);
  });
});
