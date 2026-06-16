/**
 * apps/admin/e2e/demo/identity-spine.demo.spec.ts
 *
 * @demo UI demo walkthrough — EPIC-004 Identity spine (admin surface).
 *
 * Not part of the e2e gate: `e2e:run` / `e2e:smoke` exclude `@demo` (--grep-invert @demo);
 * this runs ONLY via `pnpm --filter admin e2e:demo`. It drives two persona happy-paths
 * against the live docker-compose container stack (AUTH_PROVIDER=mock) and writes an
 * AC-tagged screenshot gallery to docs/demos/EPIC-004/. NON-GATING.
 *
 * Personas:
 *   - jane-accountant (.planning/personas/jane-accountant.md) — section B
 *   - tom-prospective-client (cross-app bounce admin-surface — portal spec covers client side)
 * Flows:
 *   - flow-first-sign-in  (.planning/flows/flow-first-sign-in.md) — ACCOUNTANT path (section B)
 *   - flow-role-redirect  (.planning/flows/flow-role-redirect.md) — admin-landed halves (section C)
 * Policy: .orchestration/DEMO-POLICY.md
 *
 * Global gallery ordering (admin owns 05 + 07–08; portal owns 01–04 + 06):
 *   05-AC-AUTH-001-03-accountant-dashboard.png       — jane-accountant → admin root → dashboard (Tax Portal / Accountant Dashboard / Role: ACCOUNTANT)
 *   07-AC-AUTH-010-02-accountant-bounced-from-portal.png — ACCOUNTANT visiting portal /dashboard is redirected to admin
 *   08-AC-AUTH-010-03-accountant-public-portal-served.png — ACCOUNTANT visiting portal /services IS served (no redirect)
 *
 * It ASSERTS each screen is visible before screenshotting, so a broken UI fails the demo loudly.
 *
 * Pre-reqs (same SUT as the e2e gate):
 *   docker compose up -d → pnpm db:migrate → pnpm db:seed
 *
 * ADR-005: Sessions are established via /api/mock-session (role set server-side).
 * ADR-006: Two-surface platform — this spec covers admin surface + admin-landed bounces.
 * ADR-010: Admin has NO public routes. Portal /dashboard is CLIENT-only; /services is public.
 */

import { test, expect } from "@playwright/test";
import path from "path";
import { setupAccountantSession, clearSession } from "../fixtures/auth.js";

// Gallery output dir — repo-root/docs/demos/EPIC-004 (resolved from this file's dir).
// Note: path depth from apps/admin/e2e/demo/ to repo root = ../../../../
const DEMO_DIR = path.resolve(__dirname, "../../../../docs/demos/EPIC-004");
const shot = (file: string) => path.join(DEMO_DIR, file);

// Portal base URL for cross-app bounce screenshots (section C).
const PORTAL_URL = process.env["PORTAL_BASE_URL"] ?? "http://localhost:3000";
const ADMIN_PORT = process.env["ADMIN_PORT"] ?? "3001";
const ADMIN_URL = process.env["ADMIN_BASE_URL"] ?? `http://localhost:${ADMIN_PORT}`;
const ADMIN_ORIGIN = new URL(ADMIN_URL).origin;
const PORTAL_ORIGIN = new URL(PORTAL_URL).origin;

// ─── Section B: jane-accountant — first sign-in, NO 2FA ──────────────────────

test("[AC-AUTH-001-03] @demo 05 — jane-accountant: authenticated ACCOUNTANT lands on admin dashboard (no 2FA)", async ({
  page,
  request,
}) => {
  // Screen 05: ACCOUNTANT mock session → admin root → authenticated dashboard (AC-AUTH-001-03)
  // Proves: ACCOUNTANT session is established and the admin surface is served (not redirected).
  // The dashboard renders "Tax Portal" / "Accountant Dashboard" — the accountant's work surface.
  // No 2FA challenge (deferred this slice).
  // Session established via /api/mock-session on admin (ADR-005 server-side role).
  await setupAccountantSession(page, request);
  await page.goto("/");
  // Assert the authenticated Tax Portal dashboard renders — this is the ACCOUNTANT surface.
  // AC-AUTH-001-03: the ACCOUNTANT can access the admin app; middleware passes them through.
  await expect(
    page.getByText("Tax Portal"),
    "'Tax Portal' heading must be visible — proves the admin surface is served to ACCOUNTANT",
  ).toBeVisible({ timeout: 15_000 });
  await expect(
    page.getByText("Accountant Dashboard", { exact: true }),
    "'Accountant Dashboard' sub-heading must be visible",
  ).toBeVisible({ timeout: 10_000 });
  // Assert NOT redirected to sign-in (the ACCOUNTANT session is recognized by the middleware)
  expect(
    page.url().includes("/sign-in"),
    "ACCOUNTANT must NOT be redirected to /sign-in — session must be valid",
  ).toBe(false);
  // No 2FA challenge element
  await expect(page.getByTestId("otp-input")).not.toBeVisible();
  await page.screenshot({ path: shot("05-AC-AUTH-001-03-accountant-dashboard.png"), fullPage: true });
  // Cleanup
  await clearSession(page);
});

// ─── Section C (admin half): role-redirect journey ────────────────────────────

test("[AC-AUTH-010-02] @demo 07 — signed-in ACCOUNTANT visiting portal CLIENT-only route is redirected to admin", async ({
  page,
  request,
}) => {
  // Screen 07: ACCOUNTANT session → navigate to portal /dashboard → redirected to admin (AC-AUTH-010-02)
  // Proves the cross-app redirect fires: ACCOUNTANT on portal CLIENT-only route lands on admin.
  // Cookie domain is localhost (shared across ports — ADR-010 §3).
  await setupAccountantSession(page, request);

  // Navigate to portal CLIENT-only route
  await page.goto(`${PORTAL_URL}/dashboard`, { waitUntil: "networkidle" });

  const finalUrl = new URL(page.url());
  // ACCOUNTANT must NOT be served the portal /dashboard — must land on admin origin.
  expect(
    finalUrl.origin === ADMIN_ORIGIN,
    `ACCOUNTANT on portal /dashboard must land on admin origin (${ADMIN_ORIGIN}), got ${finalUrl.origin}`,
  ).toBe(true);

  // Assert admin content is visible on the landed page
  await expect(
    page.getByText("Tax Portal"),
    "'Tax Portal' must be visible on the redirected admin page",
  ).toBeVisible({ timeout: 15_000 });

  await page.screenshot({ path: shot("07-AC-AUTH-010-02-accountant-bounced-from-portal.png"), fullPage: true });

  // Cleanup
  await clearSession(page);
});

test("[AC-AUTH-010-03] @demo 08 — signed-in ACCOUNTANT visiting portal PUBLIC route is served (no redirect)", async ({
  page,
  request,
}) => {
  // Screen 08: ACCOUNTANT session → navigate to portal /services → SERVED, not redirected (AC-AUTH-010-03)
  // Proves the allow-list is honored: ACCOUNTANT on a portal public route stays on portal.
  // This is the intentional no-bounce case (ADR-010 §1 allow-list).
  await setupAccountantSession(page, request);

  // Track any redirect to admin
  let redirectedToAdmin = false;
  page.on("response", (response) => {
    const loc = response.headers()["location"] ?? "";
    if ((response.status() === 307 || response.status() === 308) && loc.startsWith(ADMIN_ORIGIN)) {
      redirectedToAdmin = true;
    }
  });

  const response = await page.goto(`${PORTAL_URL}/services`);

  // Must be served (200) — not redirected to admin
  expect(
    response?.status() === 200,
    `Portal /services must be served (200) for ACCOUNTANT, got ${response?.status()}`,
  ).toBe(true);
  expect(
    redirectedToAdmin,
    "ACCOUNTANT on portal public route /services must NOT be redirected to admin",
  ).toBe(false);

  // Final URL must remain on portal origin (the allow-list is honored)
  const finalUrl = new URL(page.url());
  expect(
    finalUrl.origin === PORTAL_ORIGIN,
    `Final URL must stay on portal origin (${PORTAL_ORIGIN}), got ${finalUrl.origin}`,
  ).toBe(true);

  // Assert the portal /services page has content (not an error page)
  await expect(
    page.locator("h1, h2, main").first(),
    "Portal /services must render content (not an error page)",
  ).toBeVisible({ timeout: 15_000 });

  await page.screenshot({ path: shot("08-AC-AUTH-010-03-accountant-public-portal-served.png"), fullPage: true });

  // Cleanup
  await clearSession(page);
});
