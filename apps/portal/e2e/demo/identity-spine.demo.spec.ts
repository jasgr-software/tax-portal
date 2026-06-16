/**
 * apps/portal/e2e/demo/identity-spine.demo.spec.ts
 *
 * @demo UI demo walkthrough — EPIC-004 Identity spine (portal surface).
 *
 * Not part of the e2e gate: `e2e:run` / `e2e:smoke` exclude `@demo` (--grep-invert @demo);
 * this runs ONLY via `pnpm --filter portal e2e:demo`. It drives two persona happy-paths
 * against the live docker-compose container stack (AUTH_PROVIDER=mock) and writes an
 * AC-tagged screenshot gallery to docs/demos/EPIC-004/. NON-GATING.
 *
 * Personas:
 *   - tom-prospective-client (.planning/personas/tom-prospective-client.md)
 *   - jane-accountant (cross-app bounce portal-surface only — see admin spec for section B)
 * Flows:
 *   - flow-first-sign-in  (.planning/flows/flow-first-sign-in.md) — CLIENT path (section A)
 *   - flow-role-redirect  (.planning/flows/flow-role-redirect.md) — portal-landed halves (section C)
 * Policy: .orchestration/DEMO-POLICY.md
 *
 * Global gallery ordering (portal owns 01–04 + 06; admin owns 05 + 07–08):
 *   01-AC-AUTH-006-02-invitation-required.png   — /sign-up no ticket → invitation-required state
 *   02-AC-AUTH-006-01-invitation-signup.png     — /sign-up?ticket=... → sign-up form renders
 *   03-AC-AUTH-005-02-client-signin-no-2fa.png  — /sign-in → email+password only, no MFA step
 *   04-AC-AUTH-005-02-client-dashboard.png      — CLIENT lands on portal dashboard post-auth
 *   06-AC-AUTH-010-01-client-bounced-from-admin.png — CLIENT navigating admin URL lands on portal
 *
 * It ASSERTS each screen is visible before screenshotting, so a broken UI fails the demo loudly.
 *
 * Pre-reqs (same SUT as the e2e gate):
 *   docker compose up -d → pnpm db:migrate → pnpm db:seed
 *
 * ADR-005: Sessions are established via /api/mock-session (role set server-side).
 * ADR-006: Two-surface platform — this spec covers portal surface only.
 * ADR-010: /sign-up and /sign-in are in PORTAL_PUBLIC_PATHS; /dashboard is CLIENT-only.
 */

import { test, expect } from "@playwright/test";
import path from "path";
import { setupClientSession, setupAccountantSession, clearSession } from "../fixtures/auth.js";

// Gallery output dir — repo-root/docs/demos/EPIC-004 (resolved from this file's dir).
const DEMO_DIR = path.resolve(__dirname, "../../../../docs/demos/EPIC-004");
const shot = (file: string) => path.join(DEMO_DIR, file);

// The fixture invitation ticket for the mock auth provider (AC-AUTH-006-01).
// Mirrors FIXTURE_INVITATION.ticket — defined in apps/portal/src/ fixtures.
const FIXTURE_TICKET = "mock-fixture-ticket-client-001";

// Admin base URL for cross-app bounce screenshots (section C).
const ADMIN_URL = process.env["ADMIN_BASE_URL"] ?? `http://localhost:${process.env["ADMIN_PORT"] ?? "3001"}`;
const PORTAL_URL = process.env["PORTAL_BASE_URL"] ?? "http://localhost:3000";
const PORTAL_ORIGIN = new URL(PORTAL_URL).origin;

// ─── Section A: tom-prospective-client — first sign-in, invitation, NO 2FA ──────

test("[AC-AUTH-006-02] @demo 01 — /sign-up with no ticket shows invitation-required state (no self-registration)", async ({
  page,
}) => {
  // Screen 01: /sign-up without a ticket → "Invitation Required" state (AC-AUTH-006-02)
  // Proves no public self-registration path exists.
  await page.goto("/sign-up");
  const invitationMsg = page.getByTestId("invitation-required-message");
  await expect(invitationMsg, "Invitation-required message must be visible").toBeVisible({ timeout: 15_000 });
  // Assert no signup form (the form only renders when ticket is present — AC-AUTH-006-02)
  await expect(page.getByTestId("signup-form")).not.toBeVisible();
  await page.screenshot({ path: shot("01-AC-AUTH-006-02-invitation-required.png"), fullPage: true });
});

test("[AC-AUTH-006-01] @demo 02 — /sign-up?ticket=<fixture> shows the sign-up form (account via invitation only)", async ({
  page,
}) => {
  // Screen 02: /sign-up with the fixture ticket → sign-up form renders (AC-AUTH-006-01)
  // Proves a CLIENT account is created only via the accountant-issued invitation.
  await page.goto(`/sign-up?ticket=${FIXTURE_TICKET}`);
  const signupForm = page.getByTestId("signup-form");
  await expect(signupForm, "Sign-up form must be visible when ticket is present").toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("email-input"), "Email input must be visible").toBeVisible();
  await expect(page.getByTestId("password-input"), "Password input must be visible").toBeVisible();
  await expect(page.getByTestId("signup-submit-button"), "Submit button must be visible").toBeVisible();
  // No 2FA step (deferred — AC-AUTH-005-02)
  await expect(page.getByTestId("otp-input")).not.toBeVisible();
  await page.screenshot({ path: shot("02-AC-AUTH-006-01-invitation-signup.png"), fullPage: true });
});

test("[AC-AUTH-005-02] @demo 03 — /sign-in shows email+password only, NO 2FA/MFA step", async ({
  page,
}) => {
  // Screen 03: /sign-in → email + password form only (AC-AUTH-005-02)
  // Proves sign-in completes without a second factor (2FA deferred this slice).
  await page.goto("/sign-in");
  const signinForm = page.getByTestId("signin-form");
  await expect(signinForm, "Sign-in form must be visible").toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("email-input"), "Email input must be visible").toBeVisible();
  await expect(page.getByTestId("password-input"), "Password input must be visible").toBeVisible();
  await expect(page.getByTestId("signin-submit-button"), "Sign-in submit button must be visible").toBeVisible();
  // Assert NO OTP / MFA / 2FA element (explicitly no second factor)
  await expect(page.getByTestId("otp-input")).not.toBeVisible();
  await expect(page.locator("[data-testid*='mfa']")).not.toBeVisible();
  await expect(page.locator("[data-testid*='2fa']")).not.toBeVisible();
  await page.screenshot({ path: shot("03-AC-AUTH-005-02-client-signin-no-2fa.png"), fullPage: true });
});

test("[AC-AUTH-005-02] @demo 04 — authenticated CLIENT lands on portal dashboard", async ({
  page,
  request,
}) => {
  // Screen 04: CLIENT mock session → portal /dashboard (AC-AUTH-005-02)
  // Proves that after sign-in the CLIENT lands on their dashboard ("Welcome to Your Client Portal").
  // Session established via /api/mock-session (ADR-005 server-side role).
  await setupClientSession(page, request);
  await page.goto("/dashboard");
  const dashboard = page.getByTestId("client-dashboard");
  await expect(dashboard, "Client dashboard panel must be visible").toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Welcome to Your Client Portal")).toBeVisible();
  // No 2FA challenge on the authenticated page
  await expect(page.getByTestId("otp-input")).not.toBeVisible();
  await page.screenshot({ path: shot("04-AC-AUTH-005-02-client-dashboard.png"), fullPage: true });
  // Cleanup — clear the mock session after screenshot
  await clearSession(page);
});

// ─── Section C (portal half): role-redirect journey — CLIENT bounced from admin ──

test("[AC-AUTH-010-01] @demo 06 — signed-in CLIENT navigating to admin URL is redirected to portal", async ({
  page,
  request,
}) => {
  // Screen 06: CLIENT session → navigate to admin root → redirected to portal (AC-AUTH-010-01)
  // Proves the cross-app redirect fires: a CLIENT on the admin surface lands back on portal.
  // Cookie domain is localhost (shared across ports — ADR-010 §3).
  await setupClientSession(page, request);

  // Navigate to the admin app root
  await page.goto(`${ADMIN_URL}/`, { waitUntil: "networkidle" });

  const finalUrl = new URL(page.url());
  // CLIENT must NOT be served the admin surface — must land on portal origin.
  // The redirect may put us on portal root or portal /dashboard or /sign-in depending on middleware.
  expect(
    finalUrl.origin === PORTAL_ORIGIN,
    `CLIENT on admin URL must land on portal origin (${PORTAL_ORIGIN}), got ${finalUrl.origin}`,
  ).toBe(true);

  // Capture the landed portal page — shows no admin content was served
  await page.screenshot({ path: shot("06-AC-AUTH-010-01-client-bounced-from-admin.png"), fullPage: true });

  // Cleanup
  await clearSession(page);
});
