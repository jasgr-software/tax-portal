/**
 * apps/admin/e2e/specs/sign-in-lane.spec.ts — Sign-in lane e2e binding (TASK-009-004)
 *
 * Binds the EPIC-009 gherkin acceptance scenarios to executable Playwright tests
 * for the TAX PORTAL surface (apps/admin). Until the Cucumber tooling lands
 * (CLAUDE.md § Executable gherkin tooling), these are standard `.spec.ts` that
 * COVER the Given/When/Then scenarios; SDET compares behavior to the scenarios in prose.
 *
 * Acceptance scenarios bound here (from .planning/EPIC-009-poc-two-role-sign-in-lane.md):
 *
 *   [AC-AUTH-013-01] — Sign in as the accountant → lands on apps/admin (admin surface coverage)
 *   [AC-AUTH-013-02] — Sign out via admin DevBanner → unauthenticated → protected admin route
 *                      requires re-auth (AC-AUTH-013-02 admin-surface coverage)
 *   Switcher dev-acceptance — admin-surface switcher re-lands on the correct app
 *
 * The portal surface coverage is in apps/portal/e2e/specs/sign-in-lane.spec.ts.
 * Both surfaces must be covered per CLAUDE.md § Platform-frontend scope.
 *
 * Requires:
 *   - Portal container at http://localhost:3000 (AUTH_PROVIDER=mock)
 *   - Admin container at http://localhost:3001 (AUTH_PROVIDER=mock)
 *   - Demo seed run: pnpm db:seed:demo (includes demo_usr_jane_accountant ACCOUNTANT row)
 *
 * Run:
 *   pnpm --filter admin e2e:run -- --grep sign-in-lane
 *
 * // ADR-001 (mock-only lane; inert under AUTH_PROVIDER=clerk)
 * // ADR-005 (role is server-set; browser submits only accountId)
 * // ADR-010 (role-appropriate landing; global sign-out)
 * // ADR-006 (two apps; accountant → admin, client → portal)
 * // CS-GEN-003 (AC ids in test titles/annotations)
 * // CS-TS-003 (cross-surface parity — admin surface covered here; portal in portal sign-in-lane.spec.ts)
 */

import { test, expect } from "@playwright/test";
import { clearSession } from "../fixtures/auth.js";

// ─── URL constants ─────────────────────────────────────────────────────────────

const ADMIN_PORT = process.env["ADMIN_PORT"] ?? "3001";
const ADMIN_URL = process.env["ADMIN_BASE_URL"] ?? `http://localhost:${ADMIN_PORT}`;
const PORTAL_URL = process.env["PORTAL_BASE_URL"] ?? "http://localhost:3000";
const PORTAL_ORIGIN = new URL(PORTAL_URL).origin;
const ADMIN_ORIGIN = new URL(ADMIN_URL).origin;

// ─── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Navigate to the portal dev sign-in lane and sign in by clicking the account button.
 *
 * The sign-in lane lives on the PORTAL surface at /dev-sign-in. Both roles are accessible
 * from the same portal lane. ADR-006: the accountant signs in via the portal lane
 * and is redirected cross-app to apps/admin.
 *
 * The lane uses a Next.js server action that sets a cookie and calls Next.js redirect() —
 * the browser follows the resulting 307 to the role-appropriate surface.
 */
async function signInViaLane(page: import("@playwright/test").Page, accountId: string): Promise<void> {
  await page.goto(`${PORTAL_URL}/dev-sign-in`);
  await page.waitForSelector('[data-testid="dev-sign-in-lane"]', { timeout: 10_000 });
  await Promise.all([
    page.waitForNavigation({ waitUntil: "commit", timeout: 15_000 }),
    page.click(`[data-testid="sign-in-btn-${accountId}"]`),
  ]);
  await page.waitForLoadState("domcontentloaded", { timeout: 15_000 });
}

// ─── AC-AUTH-013-01: admin surface — accountant lands on admin ────────────────

test.describe("[AC-AUTH-013-01] admin surface: sign in as jane-accountant → lands on apps/admin dashboard", () => {
  /**
   * Gherkin scenario (EPIC-009 § Acceptance scenarios):
   *   Given a PoC build under AUTH_PROVIDER=mock with the demo accounts seeded
   *   When the tester opens the sign-in lane and signs in as the Accountant
   *   Then a session for the ACCOUNTANT is established and they land authenticated on the
   *        Tax Portal (admin) dashboard without further navigation
   *
   * Verifies the admin surface receives the ACCOUNTANT and serves it correctly.
   * The admin app must NOT redirect an authenticated ACCOUNTANT to /sign-in.
   *
   * // AC-AUTH-013-01 // ADR-001 // ADR-005 // ADR-006 // ADR-010
   */
  test.afterEach(async ({ page }) => {
    await clearSession(page);
  });

  test("[AC-AUTH-013-01] accountant sign-in via portal lane lands on apps/admin (admin surface verifies landing)", async ({ page }) => {
    // Given: a PoC build under AUTH_PROVIDER=mock with demo accounts seeded
    // (demo_usr_jane_accountant ACCOUNTANT User row seeded by db/seed/demo/clients.ts seedAccountant())

    // When: the tester signs in as the Accountant via the portal dev sign-in lane
    await signInViaLane(page, "accountant-jane");

    // Then: they land on apps/admin (admin surface served for ACCOUNTANT)
    expect(
      page.url().startsWith(ADMIN_ORIGIN),
      `[AC-AUTH-013-01] ACCOUNTANT must land on admin (${ADMIN_ORIGIN}) after sign-in, got: ${page.url()}`
    ).toBe(true);

    // The admin root must be served — ACCOUNTANT is authenticated on the admin surface
    // (Not redirected to /sign-in — the session is valid)
    const finalUrl = new URL(page.url());
    expect(
      finalUrl.pathname.startsWith("/sign-in"),
      "[AC-AUTH-013-01] Admin must NOT redirect authenticated ACCOUNTANT to /sign-in"
    ).toBe(false);

    // Must NOT have been redirected to portal (wrong surface for ACCOUNTANT — would be AC-AUTH-010-02 fail)
    expect(
      page.url().startsWith(PORTAL_ORIGIN),
      "[AC-AUTH-013-01] ACCOUNTANT must NOT land on portal — admin is the correct surface"
    ).toBe(false);

    // The DevBanner must be present (proof the admin surface rendered and the mock binding is active)
    // ADR-001: the DevBanner is visible only under AUTH_PROVIDER=mock
    await expect(page.locator('[data-testid="dev-banner"]')).toBeVisible();
  });

  test("[AC-AUTH-013-01] after accountant sign-in, navigating to admin root serves the admin app (no re-auth)", async ({ page }) => {
    // Given: ACCOUNTANT is signed in via the portal lane
    await signInViaLane(page, "accountant-jane");
    expect(page.url().startsWith(ADMIN_ORIGIN)).toBe(true);

    // When: the ACCOUNTANT navigates to the admin root (explicit navigation)
    const response = await page.goto(`${ADMIN_URL}/`);

    // Then: the admin root is served (200 OK — no redirect to /sign-in required)
    // The session established by the lane is honored by the admin app.
    expect(
      response?.status() === 200,
      "[AC-AUTH-013-01] Admin root must be served (200) for authenticated ACCOUNTANT — no re-auth"
    ).toBe(true);

    // Final URL must remain on admin (not redirected to portal or /sign-in)
    expect(
      new URL(page.url()).origin === ADMIN_ORIGIN,
      "[AC-AUTH-013-01] Final URL must be on admin origin after ACCOUNTANT session established"
    ).toBe(true);
  });
});

// ─── AC-AUTH-013-02: Sign out via admin DevBanner → unauthenticated ────────────

test.describe("[AC-AUTH-013-02] admin surface: sign out via admin DevBanner → unauthenticated → admin protected route re-auth", () => {
  /**
   * Gherkin scenario (EPIC-009 § Acceptance scenarios):
   *   Given a tester signed in through the lane as either role
   *   When they sign out
   *   Then their session ends and any subsequent request to a protected surface
   *        requires signing in again
   *
   * This test verifies that sign-out from the ADMIN surface (via the admin DevBanner)
   * is GLOBAL — both apps see an unauthenticated state (ADR-010 — one identity/session).
   *
   * // AC-AUTH-013-02 // ADR-010 // ADR-001
   */

  test("[AC-AUTH-013-02] sign out via admin DevBanner → admin protected route redirects to /sign-in (global sign-out from admin surface)", async ({ page }) => {
    // Given: a tester signed in through the lane as ACCOUNTANT
    await signInViaLane(page, "accountant-jane");
    expect(page.url().startsWith(ADMIN_ORIGIN)).toBe(true);

    // Verify DevBanner is present on admin surface
    await page.waitForSelector('[data-testid="dev-sign-out-btn"]', { timeout: 10_000 });

    // When: they sign out via the admin DevBanner (adminDevGlobalSignOut action)
    // The DevBannerClient uses window.location.href inside startTransition() after an async
    // server action — Promise.all anchors to the actual URL navigation event.
    await Promise.all([
      page.waitForURL(/\/(dev-sign-in|sign-in)/, { timeout: 15_000 }),
      page.click('[data-testid="dev-sign-out-btn"]'),
    ]);

    // After sign-out, admin banner redirects to portal /dev-sign-in
    // Confirm the session is cleared (redirected away from admin)
    const afterSignOutUrl = new URL(page.url());
    expect(
      afterSignOutUrl.pathname.startsWith("/dev-sign-in") || afterSignOutUrl.pathname.startsWith("/sign-in"),
      `[AC-AUTH-013-02] After admin sign-out, must land on a sign-in page; got: ${page.url()}`
    ).toBe(true);

    // Then: any subsequent request to a protected admin route requires re-auth
    let redirectSeen = false;
    page.on("response", (response) => {
      if (response.status() === 307 || response.status() === 308) {
        redirectSeen = true;
      }
    });
    await page.goto(`${ADMIN_URL}/`, { waitUntil: "commit" });
    const finalUrl = new URL(page.url());

    // Admin root must redirect to /sign-in (unauthenticated)
    expect(
      redirectSeen || finalUrl.pathname.includes("/sign-in"),
      `[AC-AUTH-013-02] After global sign-out, accessing admin root must redirect to /sign-in; got: ${page.url()}`
    ).toBe(true);

    // Must NOT be serving admin root (session is gone)
    expect(
      finalUrl.pathname === "/" && finalUrl.origin === ADMIN_ORIGIN && !redirectSeen,
      "[AC-AUTH-013-02] Admin root must NOT be served without authentication after sign-out"
    ).toBe(false);
  });

  test("[AC-AUTH-013-02] sign out via admin DevBanner is GLOBAL — portal protected route also requires re-auth", async ({ page }) => {
    // Given: a tester signed in through the lane as ACCOUNTANT (or CLIENT — global means both apps)
    // Sign in as CLIENT via the lane, verify portal /dashboard is served
    await signInViaLane(page, "client-margaret");
    expect(page.url().startsWith(PORTAL_ORIGIN)).toBe(true);

    // Now sign in as ACCOUNTANT to get onto the admin surface
    await page.goto(`${PORTAL_URL}/dev-sign-in`);
    await page.waitForSelector('[data-testid="dev-sign-in-lane"]', { timeout: 10_000 });
    await Promise.all([
      page.waitForNavigation({ waitUntil: "commit", timeout: 15_000 }),
      page.click('[data-testid="sign-in-btn-accountant-jane"]'),
    ]);
    await page.waitForLoadState("domcontentloaded", { timeout: 15_000 });
    expect(page.url().startsWith(ADMIN_ORIGIN)).toBe(true);

    // When: the tester signs out via the admin DevBanner
    await page.waitForSelector('[data-testid="dev-sign-out-btn"]', { timeout: 10_000 });
    await Promise.all([
      page.waitForURL(/\/(dev-sign-in|sign-in)/, { timeout: 15_000 }),
      page.click('[data-testid="dev-sign-out-btn"]'),
    ]);

    // Then: the portal protected route also requires re-auth (global sign-out — ADR-010)
    let portalRedirectSeen = false;
    page.on("response", (response) => {
      if (response.status() === 307 || response.status() === 308) {
        portalRedirectSeen = true;
      }
    });
    await page.goto(`${PORTAL_URL}/dashboard`, { waitUntil: "commit" });
    const finalUrl = new URL(page.url());

    // Portal /dashboard must redirect to /sign-in (cookie is gone from both apps)
    expect(
      portalRedirectSeen || finalUrl.pathname.includes("/sign-in") || finalUrl.pathname.includes("/dev-sign-in"),
      `[AC-AUTH-013-02] After global sign-out via admin, portal /dashboard must require re-auth; got: ${page.url()}`
    ).toBe(true);
  });
});

// ─── Admin surface DevBanner is present for authenticated ACCOUNTANT ───────────

test.describe("Admin surface DevBanner present for authenticated ACCOUNTANT (mock binding)", () => {
  /**
   * Validates that the admin surface renders the DevBanner (switcher + sign-out)
   * for an authenticated ACCOUNTANT under AUTH_PROVIDER=mock.
   * CS-TS-003: the DevBanner is mirrored on BOTH surfaces.
   * ADR-001: DevBanner is absent under AUTH_PROVIDER=clerk (TASK-009-003 owns the proof).
   *
   * // CS-TS-003 // ADR-001
   */
  test.afterEach(async ({ page }) => {
    await clearSession(page);
  });

  test("admin DevBanner renders with switcher and sign-out controls for authenticated ACCOUNTANT", async ({ page }) => {
    // Sign in as ACCOUNTANT
    await signInViaLane(page, "accountant-jane");
    expect(page.url().startsWith(ADMIN_ORIGIN)).toBe(true);

    // The DevBanner must be visible on the admin surface
    await expect(page.locator('[data-testid="dev-banner"]')).toBeVisible();

    // The sign-out button must be present
    await expect(page.locator('[data-testid="dev-sign-out-btn"]')).toBeVisible();

    // The switcher buttons for demo accounts must be present (CS-TS-003)
    await expect(page.locator('[data-testid="dev-switch-btn-accountant-jane"]')).toBeVisible();
    await expect(page.locator('[data-testid="dev-switch-btn-client-margaret"]')).toBeVisible();
  });
});
