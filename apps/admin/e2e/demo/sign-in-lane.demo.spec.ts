/**
 * apps/admin/e2e/demo/sign-in-lane.demo.spec.ts
 *
 * @demo UI demo walkthrough — EPIC-009 dev sign-in lane (admin surface).
 *
 * Not part of the e2e gate: `e2e:run` / `e2e:smoke` exclude `@demo` (--grep-invert @demo);
 * this runs ONLY via `pnpm --filter admin e2e:demo` (which also excludes @video).
 * It drives the jane-accountant happy-path against the live docker-compose container stack
 * (AUTH_PROVIDER=mock) and writes an AC-tagged screenshot gallery to docs/demos/EPIC-009/.
 * NON-GATING.
 *
 * Persona: jane-accountant (.planning/personas/jane-accountant.md)
 *   → accountId: "accountant-jane", clerkId: "demo_usr_jane_accountant"
 *
 * Flows:
 *   - flow-first-sign-in  (.planning/flows/flow-first-sign-in.md) — ACCOUNTANT path
 *
 * Policy: .orchestration/DEMO-POLICY.md
 *
 * Gallery ordering (admin surface owns 01; portal surface owns 02 + 03):
 *   01-AC-AUTH-013-01-jane-accountant-admin-landing.png
 *       — jane-accountant signs in via the dev lane → lands on apps/admin dashboard
 *         Proves AC-AUTH-013-01: ACCOUNTANT sign-in → ACCOUNTANT lands on Tax Portal (not portal)
 *
 * Each test ASSERTS the target element is visible BEFORE screenshotting (broken UI fails loudly).
 *
 * Pre-reqs (same SUT as the e2e gate):
 *   docker compose up -d --no-deps --env-file .env.local → pnpm db:migrate → pnpm db:seed
 *   (pnpm db:seed includes seedAccountant() which upserts demo_usr_jane_accountant)
 *
 * Run:
 *   ADMIN_BASE_URL=http://localhost:13001 ADMIN_PORT=13001 pnpm --filter admin e2e:demo
 *
 * // CS-GEN-002 (MANDATORY): screenshots write ONLY to docs/demos/EPIC-009/ — the DEMO_DIR
 * //   const is the single output path. No prior-epic PNGs are touched. (RETRO-006 item 4)
 * // CS-GEN-003: AC ids cited in test annotations + titles.
 * // ADR-005: Session established via dev sign-in lane server action (role server-set from
 * //   DEMO_ACCOUNTS manifest; browser submits only accountId; never client-supplied role).
 * // ADR-006: Two-surface platform — admin surface covered here; portal surface in portal spec.
 * // REQ-AUTH-013: dev sign-in lane enabling one-click, server-set-role sign-in.
 */

import { test, expect } from "@playwright/test";
import path from "path";
import { clearSession } from "../fixtures/auth.js";

// CS-GEN-002: Gallery output dir — repo-root/docs/demos/EPIC-009 (resolved from this file's dir).
// Depth from apps/admin/e2e/demo/ to repo root = ../../../../
// RETRO-006 item 4 (MANDATORY): screenshots MUST write ONLY to docs/demos/EPIC-009/.
// This const is the ONLY output path used in this spec. No prior-epic gallery is touched.
const DEMO_DIR = path.resolve(__dirname, "../../../../docs/demos/EPIC-009");
// CS-GEN-002
const shot = (file: string) => path.join(DEMO_DIR, file);

// URL constants — mirrors sign-in-lane.spec.ts (gate spec) port-squat remap
const ADMIN_PORT_ENV = process.env["ADMIN_PORT"] ?? "3001";
const ADMIN_URL = process.env["ADMIN_BASE_URL"] ?? `http://localhost:${ADMIN_PORT_ENV}`;
const PORTAL_URL = process.env["PORTAL_BASE_URL"] ?? "http://localhost:3000";
const ADMIN_ORIGIN = new URL(ADMIN_URL).origin;
const PORTAL_ORIGIN = new URL(PORTAL_URL).origin;

// ─── Helper: sign in via the portal dev lane ───────────────────────────────────
//
// The sign-in lane lives on the PORTAL surface at /dev-sign-in.
// Both roles are accessible from the same portal lane.
// ADR-001: lane is active under AUTH_PROVIDER=mock only.
// ADR-005: the button submits only accountId; the server resolves role + session.
// ADR-006: ACCOUNTANT is redirected cross-app to apps/admin.

async function signInViaLane(page: import("@playwright/test").Page, accountId: string): Promise<void> {
  await page.goto(`${PORTAL_URL}/dev-sign-in`);
  await page.waitForSelector('[data-testid="dev-sign-in-lane"]', { timeout: 10_000 });
  await Promise.all([
    page.waitForNavigation({ waitUntil: "commit", timeout: 15_000 }),
    page.click(`[data-testid="sign-in-btn-${accountId}"]`),
  ]);
  await page.waitForLoadState("domcontentloaded", { timeout: 15_000 });
}

// ─── Screen 01: jane-accountant → lands on apps/admin ─────────────────────────

test(
  // CS-GEN-003: AC-AUTH-013-01 cited in title
  "[AC-AUTH-013-01] @demo 01 — jane-accountant: signs in via dev lane → lands on apps/admin (Tax Portal)",
  async ({ page }) => {
    // Screen 01: jane-accountant (accountId: "accountant-jane", persona from
    // .planning/personas/jane-accountant.md) signs in via the portal dev sign-in lane.
    // The server resolves her ACCOUNTANT role → redirects cross-app to apps/admin.
    //
    // Proves:
    //   AC-AUTH-013-01: ACCOUNTANT sign-in via the dev lane → ACCOUNTANT lands on Tax Portal
    //   (not client portal — the role-appropriate landing per ADR-010 / ADR-006)
    //
    // Screenshot: full-page apps/admin landing page after the sign-in redirect.
    // Assert-before-screenshot: DevBanner must be visible (proof admin rendered for ACCOUNTANT session).
    //
    // ADR-005: role resolved server-side from the DEMO_ACCOUNTS manifest; browser supplies only accountId.
    //   The demo seed (pnpm db:seed) upserts the ACCOUNTANT User row via seedAccountant()
    //   (demo_usr_jane_accountant → role=ACCOUNTANT), so admin pages have a real backing identity.
    // ADR-006: ACCOUNTANT → apps/admin (Tax Portal), not apps/portal.
    // ADR-010: role-appropriate landing — ACCOUNTANT must NOT be served portal CLIENT pages.
    // flow-first-sign-in: ACCOUNTANT path.

    try {
      // Given: a PoC build under AUTH_PROVIDER=mock with demo accounts seeded
      //   (pnpm db:seed includes demo_usr_jane_accountant via seedAccountant())
      // When: the tester opens the sign-in lane and signs in as jane-accountant (ACCOUNTANT)
      await signInViaLane(page, "accountant-jane");

      // Then: she lands on apps/admin (Tax Portal)
      expect(
        page.url().startsWith(ADMIN_ORIGIN),
        `[AC-AUTH-013-01] jane-accountant must land on admin origin (${ADMIN_ORIGIN}), got: ${page.url()}`
      ).toBe(true);

      // Must NOT have been redirected to portal (wrong surface for ACCOUNTANT)
      expect(
        page.url().startsWith(PORTAL_ORIGIN) && !page.url().startsWith(ADMIN_ORIGIN),
        "[AC-AUTH-013-01] ACCOUNTANT must NOT land on portal — admin is the correct surface"
      ).toBe(false);

      // Assert: DevBanner is visible on the admin surface (proof admin rendered the ACCOUNTANT session)
      // Broken UI (e.g., admin rejected the cross-app session) fails loudly here.
      // ADR-001: DevBanner is present under AUTH_PROVIDER=mock; absent under clerk.
      const devBanner = page.locator('[data-testid="dev-banner"]');
      await expect(
        devBanner,
        "[AC-AUTH-013-01] DevBanner must be visible on apps/admin after accountant sign-in (AUTH_PROVIDER=mock)"
      ).toBeVisible({ timeout: 15_000 });

      // Screenshot 01: apps/admin landing as jane-accountant — AC-AUTH-013-01 evidence
      // CS-GEN-002: output ONLY to docs/demos/EPIC-009/ (DEMO_DIR, the single scoped path)
      await page.screenshot({
        path: shot("01-AC-AUTH-013-01-jane-accountant-admin-landing.png"),
        fullPage: true,
      });
    } finally {
      await clearSession(page);
    }
  }
);
