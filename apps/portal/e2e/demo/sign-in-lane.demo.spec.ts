/**
 * apps/portal/e2e/demo/sign-in-lane.demo.spec.ts
 *
 * @demo UI demo walkthrough — EPIC-009 dev sign-in lane (portal surface).
 *
 * Not part of the e2e gate: `e2e:run` / `e2e:smoke` exclude `@demo` (--grep-invert @demo);
 * this runs ONLY via `pnpm --filter portal e2e:demo`. It drives two persona happy-paths
 * against the live docker-compose container stack (AUTH_PROVIDER=mock) and writes an
 * AC-tagged screenshot gallery to docs/demos/EPIC-009/. NON-GATING.
 *
 * Personas:
 *   - sarah-returning-client (.planning/personas/sarah-returning-client.md)
 *     → accountId: "client-sarah", clerkId: "demo_usr_linda_svensson"
 *       (display-name mismatch is cosmetic — TASK-009-001 SDET review note)
 *   - jane-accountant (.planning/personas/jane-accountant.md)
 *     → accountId: "accountant-jane", clerkId: "demo_usr_jane_accountant"
 *
 * Flows:
 *   - flow-first-sign-in  (.planning/flows/flow-first-sign-in.md) — CLIENT path
 *   - flow-role-redirect  (.planning/flows/flow-role-redirect.md) — switcher hop
 *
 * Policy: .orchestration/DEMO-POLICY.md
 *
 * Gallery ordering (portal surface owns 02 + 03; admin surface owns 01):
 *   02-AC-AUTH-013-01-sarah-client-portal-landing.png
 *       — sarah-returning-client signs in via the dev lane → lands on apps/portal /dashboard
 *         Proves AC-AUTH-013-01: CLIENT sign-in → CLIENT lands on Client Portal (not admin)
 *   03-switcher-role-hop-to-admin.png
 *       — switcher hop: signed-in CLIENT switches to accountant-jane → re-lands on apps/admin
 *         Proves switcher dev-acceptance: switch from CLIENT → re-lands on admin surface
 *
 * Each test ASSERTS the target element is visible BEFORE screenshotting (broken UI fails loudly).
 *
 * Pre-reqs (same SUT as the e2e gate):
 *   docker compose up -d --no-deps --env-file .env.local → pnpm db:migrate → pnpm db:seed
 *
 * Run:
 *   pnpm --filter portal e2e:demo
 *
 * // CS-GEN-002 (MANDATORY): screenshots write ONLY to docs/demos/EPIC-009/ — the DEMO_DIR
 * //   const is the single output path. No prior-epic PNGs are touched. (RETRO-006 item 4)
 * // CS-GEN-003: AC ids cited in test annotations + titles.
 * // ADR-005: Sessions established via the dev sign-in lane server action (role server-set).
 * // ADR-006: Two-surface platform — portal surface covered here; admin surface in admin spec.
 * // REQ-AUTH-013: dev sign-in lane enabling one-click, server-set-role sign-in.
 */

import { test, expect } from "@playwright/test";
import path from "path";
import { clearSession } from "../fixtures/auth.js";

// CS-GEN-002: Gallery output dir — repo-root/docs/demos/EPIC-009 (resolved from this file's dir).
// Depth from apps/portal/e2e/demo/ to repo root = ../../../../
// RETRO-006 item 4 (MANDATORY): screenshots MUST write ONLY to docs/demos/EPIC-009/.
// This const is the ONLY output path used in this spec. No prior-epic gallery is touched.
const DEMO_DIR = path.resolve(__dirname, "../../../../docs/demos/EPIC-009");
// CS-GEN-002
const shot = (file: string) => path.join(DEMO_DIR, file);

// URL constants — mirror sign-in-lane.spec.ts (gate spec)
const PORTAL_URL = process.env["PORTAL_BASE_URL"] ?? "http://localhost:3000";
const ADMIN_PORT = process.env["ADMIN_PORT"] ?? "3001";
const ADMIN_URL = process.env["ADMIN_BASE_URL"] ?? `http://localhost:${ADMIN_PORT}`;
const PORTAL_ORIGIN = new URL(PORTAL_URL).origin;
const ADMIN_ORIGIN = new URL(ADMIN_URL).origin;

// ─── Helper: sign in via the dev lane ─────────────────────────────────────────
//
// Mirrors the signInViaLane() helper in sign-in-lane.spec.ts (gate spec).
// ADR-001: lane is at /dev-sign-in (active under AUTH_PROVIDER=mock only).
// ADR-005: the button submits only accountId; the server resolves role + session.
// The lane uses a Next.js server action → redirect(). Playwright follows the 307.

async function signInViaLane(page: import("@playwright/test").Page, accountId: string): Promise<void> {
  await page.goto(`${PORTAL_URL}/dev-sign-in`);
  await page.waitForSelector('[data-testid="dev-sign-in-lane"]', { timeout: 10_000 });
  await Promise.all([
    page.waitForNavigation({ waitUntil: "commit", timeout: 15_000 }),
    page.click(`[data-testid="sign-in-btn-${accountId}"]`),
  ]);
  await page.waitForLoadState("domcontentloaded", { timeout: 15_000 });
}

// ─── Screen 02: sarah-returning-client → lands on apps/portal /dashboard ──────

test(
  // CS-GEN-003: AC-AUTH-013-01 cited in title
  "[AC-AUTH-013-01] @demo 02 — sarah-returning-client: signs in via dev lane → lands on apps/portal /dashboard",
  async ({ page }) => {
    // Screen 02: sarah-returning-client (accountId: "client-sarah", persona from
    // .planning/personas/sarah-returning-client.md) signs in via the dev sign-in lane.
    // The server resolves her CLIENT role → redirects to apps/portal /dashboard.
    //
    // Proves:
    //   AC-AUTH-013-01: CLIENT sign-in via the dev lane → CLIENT lands on Client Portal
    //   (not admin — the role-appropriate landing per ADR-010 / ADR-006)
    //
    // Note: the DEMO_ACCOUNTS manifest maps "client-sarah" → clerkId "demo_usr_linda_svensson"
    // (a display-name mismatch noted in TASK-009-001 SDET review; cosmetic, not a defect).
    //
    // Screenshot: full-page portal /dashboard showing the signed-in CLIENT session.
    // Assert-before-screenshot: /dashboard must be visible before the shot is taken.
    //
    // ADR-005: role resolved server-side from the DEMO_ACCOUNTS manifest; browser supplies only accountId.
    // ADR-006: CLIENT → apps/portal (Client Portal), not apps/admin.
    // ADR-010: role-appropriate landing — CLIENT must NOT be served admin pages.
    // flow-first-sign-in: CLIENT path.

    try {
      // Given: a PoC build under AUTH_PROVIDER=mock with demo accounts seeded
      // When: the tester opens the sign-in lane and signs in as sarah-returning-client (CLIENT)
      await signInViaLane(page, "client-sarah");

      // Then: she lands on apps/portal /dashboard (CLIENT surface)
      expect(
        page.url().startsWith(PORTAL_ORIGIN),
        `[AC-AUTH-013-01] sarah-returning-client must land on portal origin (${PORTAL_ORIGIN}), got: ${page.url()}`
      ).toBe(true);

      // Must be on /dashboard (the CLIENT portal home)
      const finalUrl = new URL(page.url());
      expect(
        finalUrl.pathname === "/dashboard" || finalUrl.pathname.startsWith("/dashboard"),
        `[AC-AUTH-013-01] CLIENT must land on /dashboard, got pathname: ${finalUrl.pathname}`
      ).toBe(true);

      // Assert: the main page content is visible before screenshotting (broken UI fails loudly)
      // The portal /dashboard renders within a layout — we check the page has loaded past a loading state.
      // The DevBanner is the most reliable visible element post-sign-in under AUTH_PROVIDER=mock.
      const devBanner = page.locator('[data-testid="dev-banner"]');
      await expect(
        devBanner,
        "[AC-AUTH-013-01] DevBanner must be visible on portal /dashboard after CLIENT sign-in (AUTH_PROVIDER=mock)"
      ).toBeVisible({ timeout: 15_000 });

      // Screenshot 02: portal /dashboard as sarah-returning-client — AC-AUTH-013-01 evidence
      // CS-GEN-002: output ONLY to docs/demos/EPIC-009/ (DEMO_DIR, the single scoped path)
      await page.screenshot({
        path: shot("02-AC-AUTH-013-01-sarah-client-portal-landing.png"),
        fullPage: true,
      });
    } finally {
      await clearSession(page);
    }
  }
);

// ─── Screen 03: switcher hop — CLIENT → ACCOUNTANT re-lands on apps/admin ─────

test(
  // CS-GEN-003: switcher dev-acceptance cited in title
  "[switcher dev-acceptance] @demo 03 — role/user switcher hop: CLIENT (sarah) → ACCOUNTANT (jane) re-lands on apps/admin",
  async ({ page }) => {
    // Screen 03: after signing in as CLIENT (sarah-returning-client), use the in-app
    // DevBanner switcher to switch to ACCOUNTANT (accountant-jane) → re-lands on apps/admin.
    //
    // Proves:
    //   switcher dev-acceptance: in-app role/user switcher replaces the prior session
    //   and re-lands on the correct app for the newly chosen role (ADR-010 / ADR-006).
    //
    // This is the "switcher hop" story beat from the EPIC-009 demo gallery.
    //
    // Screenshot: full-page apps/admin landing page after the switcher hop, showing
    //   the DevBanner (proof the admin surface rendered for the ACCOUNTANT session).
    //
    // ADR-005: switcher submits only accountId; server resolves ACCOUNTANT role.
    // ADR-006: ACCOUNTANT → apps/admin (Tax Portal).
    // ADR-010: re-lands on correct surface after role switch.
    // flow-role-redirect: cross-app redirect on role switch.

    try {
      // Given: the tester is signed in as CLIENT (sarah) via the portal lane
      await signInViaLane(page, "client-sarah");
      expect(
        page.url().startsWith(PORTAL_ORIGIN),
        `Switcher setup: CLIENT must start on portal (${PORTAL_ORIGIN}), got: ${page.url()}`
      ).toBe(true);

      // Assert DevBanner + switcher button are visible on the portal surface
      await page.waitForSelector('[data-testid="dev-banner"]', { timeout: 10_000 });
      await page.waitForSelector('[data-testid="dev-switch-btn-accountant-jane"]', { timeout: 10_000 });

      // When: the tester uses the switcher to choose accountant-jane (ACCOUNTANT)
      // ADR-005: only accountId submitted; server resolves ACCOUNTANT role from DEMO_ACCOUNTS
      // The switcher client component does window.location.href = result.redirectTo (admin URL)
      await Promise.all([
        page.waitForURL(new RegExp(ADMIN_ORIGIN.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), { timeout: 15_000 }),
        page.click('[data-testid="dev-switch-btn-accountant-jane"]'),
      ]);

      // Then: the prior CLIENT session is replaced; they land on apps/admin (ACCOUNTANT surface)
      expect(
        page.url().startsWith(ADMIN_ORIGIN),
        `Switcher: switch CLIENT→ACCOUNTANT must land on admin (${ADMIN_ORIGIN}), got: ${page.url()}`
      ).toBe(true);

      // Assert: DevBanner is visible on the admin surface (proof admin rendered for ACCOUNTANT)
      // Broken UI (e.g., admin didn't accept the session) fails loudly here.
      const adminDevBanner = page.locator('[data-testid="dev-banner"]');
      await expect(
        adminDevBanner,
        "Switcher: DevBanner must be visible on apps/admin after CLIENT→ACCOUNTANT switch"
      ).toBeVisible({ timeout: 15_000 });

      // Screenshot 03: apps/admin landing after switcher hop from CLIENT to ACCOUNTANT
      // CS-GEN-002: output ONLY to docs/demos/EPIC-009/ (DEMO_DIR, the single scoped path)
      await page.screenshot({
        path: shot("03-switcher-role-hop-to-admin.png"),
        fullPage: true,
      });
    } finally {
      await clearSession(page);
    }
  }
);
