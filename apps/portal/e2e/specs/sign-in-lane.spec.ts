/**
 * apps/portal/e2e/specs/sign-in-lane.spec.ts — Sign-in lane e2e binding (TASK-009-004)
 *
 * Binds the EPIC-009 gherkin acceptance scenarios to executable Playwright tests
 * for the CLIENT PORTAL surface (apps/portal). Until the Cucumber tooling lands
 * (CLAUDE.md § Executable gherkin tooling), these are standard `.spec.ts` that
 * COVER the Given/When/Then scenarios; SDET compares behavior to the scenarios in prose.
 *
 * Acceptance scenarios bound here (from .planning/EPIC-009-poc-two-role-sign-in-lane.md):
 *
 *   [AC-AUTH-013-01] — Sign in as the accountant → lands on apps/admin (no manual nav)
 *   [AC-AUTH-013-01] — Sign in as a seeded client → lands on that client's apps/portal home
 *   [AC-AUTH-013-02] — Sign out → unauthenticated → protected route on EITHER app requires re-auth
 *   Switcher dev-acceptance — role/user switcher re-lands on the correct app
 *
 * AC-AUTH-010-01/-02/-03 redirect matrix is covered by the existing cross-app-redirect.spec.ts
 * (already exercised through the lane's sign-in path via auth fixtures — TASK-009-003 tagging).
 * This spec exercises AC-AUTH-013-01/-02 and the switcher dev-acceptance through the
 * dev sign-in lane UI (the actual browser flow), not just fixture injection.
 *
 * Requires:
 *   - Portal container at http://localhost:3000 (AUTH_PROVIDER=mock)
 *   - Admin container at http://localhost:3001 (AUTH_PROVIDER=mock)
 *   - Demo seed run: pnpm db:seed:demo (includes demo_usr_jane_accountant ACCOUNTANT row)
 *
 * Run:
 *   pnpm --filter portal e2e:run -- --grep sign-in-lane
 *
 * // ADR-001 (mock-only lane; inert under AUTH_PROVIDER=clerk)
 * // ADR-005 (role is server-set; browser submits only accountId)
 * // ADR-010 (role-appropriate landing; global sign-out)
 * // ADR-006 (two apps; accountant → admin, client → portal)
 * // CS-GEN-003 (AC ids in test titles/annotations)
 * // CS-TS-003 (cross-surface parity — portal surface covered here; admin in sign-in-lane.spec.ts)
 */

import { test, expect } from "@playwright/test";
import { clearSession } from "../fixtures/auth.js";

// ─── URL constants ─────────────────────────────────────────────────────────────

const PORTAL_URL = process.env["PORTAL_BASE_URL"] ?? "http://localhost:3000";
const ADMIN_PORT = process.env["ADMIN_PORT"] ?? "3001";
const ADMIN_URL = process.env["ADMIN_BASE_URL"] ?? `http://localhost:${ADMIN_PORT}`;
const PORTAL_ORIGIN = new URL(PORTAL_URL).origin;
const ADMIN_ORIGIN = new URL(ADMIN_URL).origin;

// ─── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Navigate to the dev sign-in lane and sign in by clicking the account button.
 *
 * ADR-001: lane is at /dev-sign-in on the portal (active under AUTH_PROVIDER=mock).
 * ADR-005: the button submits only accountId; the server resolves role + session.
 *
 * The lane uses a Next.js server action that sets a cookie and returns a redirect URL.
 * The page.tsx handles the redirect server-side via next/navigation's redirect() — this
 * produces a 307 that Playwright follows automatically. We wait for navigation to complete.
 */
async function signInViaLane(page: import("@playwright/test").Page, accountId: string): Promise<void> {
  await page.goto(`${PORTAL_URL}/dev-sign-in`);
  // Wait for the lane to render (the picker card has data-testid="dev-sign-in-lane")
  await page.waitForSelector('[data-testid="dev-sign-in-lane"]', { timeout: 10_000 });
  // Click the sign-in button for the chosen account and wait for the resulting navigation.
  // The server action sets the cookie and calls Next.js redirect() — the browser follows
  // the resulting 307 to the role-appropriate surface.
  await Promise.all([
    page.waitForNavigation({ waitUntil: "commit", timeout: 15_000 }),
    page.click(`[data-testid="sign-in-btn-${accountId}"]`),
  ]);
  // Allow the final page to settle
  await page.waitForLoadState("domcontentloaded", { timeout: 15_000 });
}

// ─── AC-AUTH-013-01: Sign in as Accountant → lands on apps/admin ─────────────

test.describe("[AC-AUTH-013-01] sign in as jane-accountant via dev lane → lands on apps/admin", () => {
  /**
   * Gherkin scenario (EPIC-009 § Acceptance scenarios):
   *   Given a PoC build under AUTH_PROVIDER=mock with the demo accounts seeded
   *   When the tester opens the sign-in lane and signs in as the Accountant
   *   Then a session for the ACCOUNTANT is established and they land authenticated on the
   *        Tax Portal (admin) dashboard without further navigation
   *
   * // AC-AUTH-013-01 // ADR-001 // ADR-005 // ADR-006 // ADR-010
   */
  test.afterEach(async ({ page }) => {
    await clearSession(page);
  });

  test("[AC-AUTH-013-01] signing in as jane-accountant via the dev sign-in lane lands on apps/admin without manual nav", async ({ page }) => {
    // Given: a PoC build under AUTH_PROVIDER=mock with demo accounts seeded
    // (the stack is up with AUTH_PROVIDER=mock; demo seed includes demo_usr_jane_accountant)

    // When: the tester opens the sign-in lane and signs in as the Accountant
    await signInViaLane(page, "accountant-jane");

    // Then: a session for the ACCOUNTANT is established and they land on apps/admin
    const finalUrl = new URL(page.url());

    // Must be on the admin app (apps/admin — ADR-006 / ADR-010)
    expect(
      page.url().startsWith(ADMIN_ORIGIN),
      `[AC-AUTH-013-01] Expected final URL to be on admin origin (${ADMIN_ORIGIN}) after accountant sign-in, got: ${page.url()}`
    ).toBe(true);

    // Must NOT have required additional manual navigation (no /dev-sign-in, no /sign-in)
    expect(
      finalUrl.pathname.startsWith("/dev-sign-in") || finalUrl.pathname.startsWith("/sign-in"),
      "[AC-AUTH-013-01] After accountant sign-in, must NOT still be on a sign-in page"
    ).toBe(false);

    // Must NOT have landed on the portal origin (wrong surface for ACCOUNTANT)
    expect(
      page.url().startsWith(PORTAL_ORIGIN) && !page.url().startsWith(ADMIN_ORIGIN),
      "[AC-AUTH-013-01] ACCOUNTANT must land on admin, NOT portal"
    ).toBe(false);
  });
});

// ─── AC-AUTH-013-01: Sign in as a seeded client → lands on apps/portal ────────

test.describe("[AC-AUTH-013-01] sign in as a seeded client via dev lane → lands on apps/portal home", () => {
  /**
   * Gherkin scenario (EPIC-009 § Acceptance scenarios):
   *   Given a PoC build under AUTH_PROVIDER=mock with seeded clients
   *   When the tester opens the sign-in lane and signs in as a named client
   *   Then a session for that CLIENT is established and they land authenticated on
   *        that client's Client Portal home without further navigation
   *
   * // AC-AUTH-013-01 // ADR-001 // ADR-005 // ADR-006 // ADR-010
   */
  test.afterEach(async ({ page }) => {
    await clearSession(page);
  });

  test("[AC-AUTH-013-01] signing in as margaret-okonkwo (seeded client) via the dev sign-in lane lands on apps/portal home", async ({ page }) => {
    // Given: a PoC build under AUTH_PROVIDER=mock with seeded clients
    // (margaret.okonkwo@example.com is an accepted client seeded by db/seed/demo/clients.ts)

    // When: the tester opens the sign-in lane and signs in as Margaret
    await signInViaLane(page, "client-margaret");

    // Then: a session for the CLIENT is established and they land on apps/portal home
    const finalUrl = new URL(page.url());

    // Must be on the portal origin (CLIENT surface — ADR-006 / ADR-010)
    expect(
      page.url().startsWith(PORTAL_ORIGIN),
      `[AC-AUTH-013-01] Expected final URL to be on portal origin (${PORTAL_ORIGIN}) after client sign-in, got: ${page.url()}`
    ).toBe(true);

    // Must NOT have been redirected to admin (wrong surface for CLIENT)
    expect(
      page.url().startsWith(ADMIN_ORIGIN),
      "[AC-AUTH-013-01] CLIENT must NOT be redirected to admin"
    ).toBe(false);

    // Must NOT still be on the sign-in page (no manual nav required)
    expect(
      finalUrl.pathname.startsWith("/dev-sign-in") || finalUrl.pathname.startsWith("/sign-in"),
      "[AC-AUTH-013-01] After client sign-in, must NOT still be on a sign-in page"
    ).toBe(false);

    // The client's portal home is /dashboard (CLIENT session is established)
    // The middleware serves /dashboard for a CLIENT (not a redirect to /sign-in)
    expect(
      finalUrl.pathname === "/dashboard" || finalUrl.pathname.startsWith("/dashboard"),
      `[AC-AUTH-013-01] CLIENT must land on /dashboard (the client portal home), got pathname: ${finalUrl.pathname}`
    ).toBe(true);
  });
});

// ─── AC-AUTH-013-02: Sign out → unauthenticated → re-auth required ────────────

test.describe("[AC-AUTH-013-02] sign out via DevBanner → unauthenticated → protected route requires re-auth", () => {
  /**
   * Gherkin scenario (EPIC-009 § Acceptance scenarios):
   *   Given a tester signed in through the lane as either role
   *   When they sign out
   *   Then their session ends and any subsequent request to a protected surface
   *        requires signing in again
   *
   * // AC-AUTH-013-02 // ADR-010 // ADR-001
   */

  test("[AC-AUTH-013-02] sign out via DevBanner as CLIENT → portal protected route redirects to /sign-in (global sign-out)", async ({ page }) => {
    // Given: a tester signed in through the lane as CLIENT (Margaret)
    await signInViaLane(page, "client-margaret");
    // Verify we're on portal /dashboard
    await expect(page).toHaveURL(new RegExp(`${PORTAL_ORIGIN}/dashboard`));

    // Verify the DevBanner is present (dev-sign-out-btn)
    await page.waitForSelector('[data-testid="dev-sign-out-btn"]', { timeout: 10_000 });

    // When: they sign out via the DevBanner
    // The sign-out button triggers devGlobalSignOut() server action via startTransition().
    // The action clears the cookie and returns { redirectTo: "/dev-sign-in" }.
    // The client component then sets window.location.href = "/dev-sign-in".
    // We wait for the URL to change away from /dashboard (the sign-out navigation).
    await Promise.all([
      page.waitForURL(/\/(dev-sign-in|sign-in)/, { timeout: 15_000 }),
      page.click('[data-testid="dev-sign-out-btn"]'),
    ]);

    // The sign-out action redirects to /dev-sign-in (the lane)
    // Verify they landed on the sign-in lane (unauthenticated state)
    const afterSignOutUrl = new URL(page.url());
    expect(
      afterSignOutUrl.pathname.startsWith("/dev-sign-in") || afterSignOutUrl.pathname.startsWith("/sign-in"),
      `[AC-AUTH-013-02] After sign-out, must land on a sign-in page; got: ${page.url()}`
    ).toBe(true);

    // Then: any subsequent request to a protected portal route requires signing in again
    // Navigate to the protected /dashboard — must redirect to /sign-in
    let redirectSeen = false;
    page.on("response", (response) => {
      if (response.status() === 307 || response.status() === 308) {
        redirectSeen = true;
      }
    });
    await page.goto(`${PORTAL_URL}/dashboard`, { waitUntil: "commit" });
    const finalUrl = new URL(page.url());

    // Must be redirected to /sign-in (unauthenticated)
    expect(
      redirectSeen || finalUrl.pathname.includes("/sign-in") || finalUrl.pathname.includes("/dev-sign-in"),
      `[AC-AUTH-013-02] After global sign-out, accessing /dashboard must redirect to sign-in; got: ${page.url()}`
    ).toBe(true);

    // Must NOT be serving /dashboard (session is gone)
    expect(
      finalUrl.pathname === "/dashboard" && !redirectSeen,
      "[AC-AUTH-013-02] /dashboard must NOT be served after sign-out"
    ).toBe(false);
  });
});

// ─── Dev-acceptance: Switcher — Accountant → Client re-lands on apps/portal ───

test.describe("Switcher dev-acceptance: role/user switcher re-lands on the correct app", () => {
  /**
   * Gherkin scenario (EPIC-009 § Dev-acceptance scenarios):
   *   Given the tester is signed in through the lane as one role
   *   When they use the in-app switcher to choose the other role
   *   Then the prior session is replaced and they land on the correct app for the newly chosen role
   *
   * // ADR-005 (accountId only; role resolved server-side)
   * // ADR-010 (re-landing on correct app after switch)
   * // CS-TS-003 (switcher present on both surfaces)
   */

  test.afterEach(async ({ page }) => {
    await clearSession(page);
  });

  test("switcher dev-acceptance: switch from CLIENT to ACCOUNTANT → re-lands on apps/admin", async ({ page }) => {
    // Given: the tester is signed in as CLIENT (Margaret) via the portal lane
    await signInViaLane(page, "client-margaret");
    await expect(page).toHaveURL(new RegExp(`${PORTAL_ORIGIN}/dashboard`));

    // Verify the DevBanner switcher is present on the portal surface
    await page.waitForSelector('[data-testid="dev-banner"]', { timeout: 10_000 });
    await page.waitForSelector('[data-testid="dev-switch-btn-accountant-jane"]', { timeout: 10_000 });

    // When: the tester uses the switcher to choose the ACCOUNTANT role
    // ADR-005: only accountId is submitted; server resolves role from DEMO_ACCOUNTS manifest
    // The switcher uses window.location.href = result.redirectTo (client-side nav to admin URL)
    await Promise.all([
      page.waitForURL(new RegExp(ADMIN_ORIGIN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), { timeout: 15_000 }),
      page.click('[data-testid="dev-switch-btn-accountant-jane"]'),
    ]);

    // Then: the prior CLIENT session is replaced; they land on apps/admin (ACCOUNTANT surface)
    expect(
      page.url().startsWith(ADMIN_ORIGIN),
      `Switcher: switch CLIENT→ACCOUNTANT must land on admin (${ADMIN_ORIGIN}), got: ${page.url()}`
    ).toBe(true);

    // Must NOT remain on portal /dashboard (wrong surface for ACCOUNTANT)
    expect(
      page.url().startsWith(PORTAL_ORIGIN) && new URL(page.url()).pathname === "/dashboard",
      "Switcher: after switch to ACCOUNTANT, must NOT remain on portal /dashboard"
    ).toBe(false);
  });

  test("switcher dev-acceptance: switch from ACCOUNTANT to CLIENT → re-lands on apps/portal", async ({ page }) => {
    // Given: the tester is signed in as ACCOUNTANT (jane) via the portal lane
    await signInViaLane(page, "accountant-jane");
    // ACCOUNTANT lands on apps/admin
    expect(
      page.url().startsWith(ADMIN_ORIGIN),
      `Expected ACCOUNTANT sign-in to land on admin (${ADMIN_ORIGIN}), got: ${page.url()}`
    ).toBe(true);

    // The DevBanner is on the admin surface (CS-TS-003 — mirrored on both apps)
    // The admin DevBanner has the client switch buttons (adminDevSwitchAccount → PORTAL_APP_URL)
    await page.waitForSelector('[data-testid="dev-banner"]', { timeout: 10_000 });
    await page.waitForSelector('[data-testid="dev-switch-btn-client-margaret"]', { timeout: 10_000 });

    // When: the tester uses the admin-surface switcher to choose a CLIENT role
    // ADR-005: only accountId submitted; server resolves CLIENT role from ADMIN_DEMO_ACCOUNTS
    // The switcher calls adminDevSwitchAccount which returns getPortalAppUrl() + "/dashboard"
    // The client component then does window.location.href to portal /dashboard
    await Promise.all([
      page.waitForURL(new RegExp(PORTAL_ORIGIN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), { timeout: 15_000 }),
      page.click('[data-testid="dev-switch-btn-client-margaret"]'),
    ]);

    // Then: the prior ACCOUNTANT session is replaced; they land on apps/portal (CLIENT surface)
    expect(
      page.url().startsWith(PORTAL_ORIGIN),
      `Switcher: switch ACCOUNTANT→CLIENT must land on portal (${PORTAL_ORIGIN}), got: ${page.url()}`
    ).toBe(true);

    // Must NOT remain on admin (wrong surface for CLIENT)
    expect(
      page.url().startsWith(ADMIN_ORIGIN),
      "Switcher: after switch to CLIENT, must NOT remain on admin"
    ).toBe(false);
  });
});

// ─── Dev sign-in lane page renders under AUTH_PROVIDER=mock ───────────────────

test.describe("Dev sign-in lane page is accessible under AUTH_PROVIDER=mock", () => {
  /**
   * Validates the lane is reachable under the mock provider and shows the picker UI.
   * ADR-001: lane is active under AUTH_PROVIDER=mock; absent under AUTH_PROVIDER=clerk.
   */
  test("portal /dev-sign-in renders the lane picker card under AUTH_PROVIDER=mock", async ({ page }) => {
    const response = await page.goto(`${PORTAL_URL}/dev-sign-in`);

    // Under AUTH_PROVIDER=mock the lane must be accessible (not 404)
    // ADR-001: inert (404) under AUTH_PROVIDER=clerk — that path is proven by TASK-009-003
    expect(response?.status(), "Dev sign-in lane must be 200 under AUTH_PROVIDER=mock").toBe(200);

    // The picker card must be present
    await expect(page.locator('[data-testid="dev-sign-in-lane"]')).toBeVisible();

    // The accountant sign-in button must be present (lane lists demo accounts)
    await expect(page.locator('[data-testid="sign-in-btn-accountant-jane"]')).toBeVisible();

    // A client sign-in button must also be present
    await expect(page.locator('[data-testid="sign-in-btn-client-margaret"]')).toBeVisible();
  });
});
