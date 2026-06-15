/**
 * apps/portal/e2e/specs/services-page.spec.ts
 *
 * Tier-6 e2e specs for the public services page (/services).
 * Runs against the full docker-compose stack (SQL Server + portal container).
 *
 * Acceptance criteria covered:
 *   AC-DOOR-001-01 — services page reachable anonymously (no sign-in)
 *   AC-DOOR-001-02 — active services are displayed
 *   AC-DOOR-001-03 — viewing creates no account / no personal info required
 *   AC-DOOR-002-04 — deactivated service absent from the services page
 *
 * Feature mirror: apps/portal/e2e/features/public-front-door.feature
 * EPIC-001 source: .planning/EPIC-001-public-front-door.md
 *
 * Gate evidence (ENGINE.md § Gate Authoring Rules):
 *   Named production code path: getActiveServices() in packages/db/src/repositories/service.ts
 *     — WHERE active = 1 filter. If that filter were removed (changed to WHERE 1=1),
 *     AC-DOOR-002-04 would red (inactive service "Estate Tax Return" would appear).
 */

import { test, expect } from "@playwright/test";
import {
  getActiveServices,
  getInactiveServices,
  closeAdminPool,
} from "../fixtures/db";

test.afterAll(async () => {
  await closeAdminPool();
});

// ──────────────────────────────────────────────────────────────────────────────
// AC-DOOR-001-01 — Services page reachable anonymously
// ──────────────────────────────────────────────────────────────────────────────

test("[AC-DOOR-001-01] anonymous visitor reaches /services with no sign-in required", async ({
  page,
}) => {
  // Given a visitor with no account and no sign-in
  // When they navigate to the public services page
  const response = await page.goto("/services");

  // Then the page is served without requiring authentication
  // Must return 200 (not a redirect to a sign-in page, not 401/403)
  expect(response?.status()).toBe(200);

  // Should not redirect to /sign-in, /login, or any auth gate
  expect(page.url()).not.toContain("/sign-in");
  expect(page.url()).not.toContain("/login");
  expect(page.url()).not.toContain("/auth");

  // Should render the services page heading (proves the page content loaded)
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

// ──────────────────────────────────────────────────────────────────────────────
// AC-DOOR-001-02 — Active services are displayed
// ──────────────────────────────────────────────────────────────────────────────

test("[AC-DOOR-001-02] active services from the DB are displayed on the services page", async ({
  page,
}) => {
  // Given the accountant has active services in the catalog (seeded by pnpm db:seed)
  const activeServices = await getActiveServices();
  expect(activeServices.length).toBeGreaterThan(0);

  // When an anonymous visitor views the services page
  await page.goto("/services");

  // Then the currently active services are displayed
  for (const service of activeServices) {
    // Each active service name should be present on the page
    await expect(page.getByText(service.name, { exact: true })).toBeVisible();
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// AC-DOOR-001-03 — Viewing creates no account / no personal info required
// ──────────────────────────────────────────────────────────────────────────────

test("[AC-DOOR-001-03] viewing the services page requires no account and no personal information", async ({
  page,
}) => {
  // Given an anonymous visitor on the services page
  // When they browse the services
  await page.goto("/services");

  // Then no account is created and no personal information is required
  // Assert: no sign-in prompt, no "create account" CTA, no email/name input on the page
  await expect(
    page.getByRole("button", { name: /sign in/i }),
  ).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: /create account/i }),
  ).not.toBeVisible();
  await expect(
    page.getByRole("link", { name: /sign in/i }),
  ).not.toBeVisible();

  // No form inputs for personal information on the services listing page
  await expect(page.locator('input[type="email"]')).not.toBeVisible();
  await expect(page.locator('input[name="firstName"]')).not.toBeVisible();

  // The page loads and shows content without demanding credentials
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

// ──────────────────────────────────────────────────────────────────────────────
// AC-DOOR-002-04 — Deactivated service absent from the services page
// ──────────────────────────────────────────────────────────────────────────────

test("[AC-DOOR-002-04] deactivated service does not appear on the services page", async ({
  page,
}) => {
  // Given a service that has been deactivated (seeded as "Estate Tax Return" with active=false)
  const inactiveServices = await getInactiveServices();
  expect(inactiveServices.length).toBeGreaterThan(0);

  // When an anonymous visitor views the services page
  await page.goto("/services");

  // Then the deactivated service does not appear as a selectable option
  for (const service of inactiveServices) {
    await expect(
      page.getByText(service.name, { exact: true }),
    ).not.toBeVisible();
  }
});
