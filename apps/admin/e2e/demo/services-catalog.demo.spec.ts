/**
 * apps/admin/e2e/demo/services-catalog.demo.spec.ts
 *
 * @demo UI demo walkthrough — EPIC-002 Services Catalog management (admin surface).
 *
 * Not part of the e2e gate: `e2e:run` / `e2e:smoke` exclude `@demo` (--grep-invert @demo);
 * this runs ONLY via `pnpm --filter admin e2e:demo`. It drives jane-accountant's catalog-
 * management happy path against the live docker-compose container stack (AUTH_PROVIDER=mock)
 * and writes an AC-tagged screenshot gallery to docs/demos/EPIC-002/. NON-GATING.
 *
 * Persona: jane-accountant (.planning/personas/jane-accountant.md)
 * Flow:    flow-engagement-request (.planning/flows/flow-engagement-request.md)
 * Policy:  .orchestration/DEMO-POLICY.md
 *
 * Gallery ordering (EPIC-002 owns its own sequence 01–04):
 *   01-AC-DASH-010-01-services-catalog-list.png      — authenticated accountant on admin /services; catalog list shown
 *   02-AC-DOOR-002-01-add-service.png                — accountant adds a uniquely-named service; new row visible
 *   03-AC-DOOR-002-02-edit-service.png               — accountant edits the service; updated row visible
 *   04-AC-DOOR-002-03-deactivate-service-inactive.png — accountant deactivates it; inactive-badge visible
 *
 * Each test ASSERTS the target element is visible BEFORE screenshotting (broken UI fails loudly).
 *
 * Pre-reqs (same SUT as the e2e gate):
 *   docker compose up -d → pnpm db:migrate → pnpm db:seed
 *
 * ADR-005: Sessions are established via /api/mock-session (role set server-side).
 * ADR-006: Two-surface platform — this spec covers the admin surface (Tax Portal).
 * ADR-010: All admin routes require ACCOUNTANT auth.
 *
 * Run:
 *   ADMIN_BASE_URL=http://localhost:13001 ADMIN_PORT=13001 pnpm --filter admin e2e:demo
 */

import { test, expect } from "@playwright/test";
import path from "path";
import { setupAccountantSession, clearSession } from "../fixtures/auth.js";

// Gallery output dir — repo-root/docs/demos/EPIC-002 (resolved from this file's dir).
// Depth from apps/admin/e2e/demo/ to repo root = ../../../../
const DEMO_DIR = path.resolve(__dirname, "../../../../docs/demos/EPIC-002");
const shot = (file: string) => path.join(DEMO_DIR, file);

// Admin base URL — mirrors playwright.config.ts + auth.ts.
const ADMIN_PORT = process.env["ADMIN_PORT"] ?? "3001";
const ADMIN_URL = process.env["ADMIN_BASE_URL"] ?? `http://localhost:${ADMIN_PORT}`;

// Unique name helper — avoids cross-test interference when the DB is shared.
// Mirrors the helper in apps/admin/e2e/specs/services-catalog.spec.ts.
function uniqueName(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// Escape a string for use in a RegExp literal.
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ─── Screen 01: Services Catalog list ─────────────────────────────────────────

test("[AC-DASH-010-01] @demo 01 — jane-accountant: authenticated accountant sees the services catalog list", async ({
  page,
  request,
}) => {
  // Screen 01: ACCOUNTANT mock session → admin /services → catalog list visible (AC-DASH-010-01)
  // Proves: the accountant can access the catalog management screen and see the list of services.
  await setupAccountantSession(page, request);
  await page.goto(`${ADMIN_URL}/services`);

  // Assert the catalog heading is visible — proves the admin /services screen is served.
  await expect(
    page.getByRole("heading", { name: "Services Catalog" }),
    "'Services Catalog' heading must be visible — proves admin /services is served to ACCOUNTANT",
  ).toBeVisible({ timeout: 15_000 });

  // Assert we are NOT on a sign-in page (session was accepted).
  expect(
    page.url().includes("/sign-in"),
    "ACCOUNTANT must NOT be redirected to /sign-in — session must be valid",
  ).toBe(false);

  await page.screenshot({ path: shot("01-AC-DASH-010-01-services-catalog-list.png"), fullPage: true });
  await clearSession(page);
});

// ─── Screen 02: Add a service ──────────────────────────────────────────────────

test("[AC-DOOR-002-01] @demo 02 — jane-accountant: adds a new service; new row appears in catalog", async ({
  page,
  request,
}) => {
  // Screen 02: ACCOUNTANT opens add-form, fills details, submits → new row visible (AC-DOOR-002-01)
  // Proves: the accountant can add a service and it appears in the catalog list.
  await setupAccountantSession(page, request);
  await page.goto(`${ADMIN_URL}/services`);
  await expect(
    page.getByRole("heading", { name: "Services Catalog" }),
  ).toBeVisible({ timeout: 15_000 });

  const serviceName = uniqueName("Demo-Add-Service");
  const serviceDescription = "Demo walkthrough: test service for EPIC-002 add screenshot";

  // Open the add form.
  await page.getByRole("button", { name: "Add new service" }).click();
  await expect(page.getByRole("form", { name: "Add service form" })).toBeVisible({ timeout: 10_000 });

  // Fill in the name and description.
  await page.getByLabel("Service Name").fill(serviceName);
  await page.getByLabel("Description").fill(serviceDescription);

  // Submit and wait for the form to close.
  await page.getByRole("button", { name: "Add Service" }).click();
  await expect(page.getByRole("form", { name: "Add service form" })).not.toBeVisible({ timeout: 10_000 });

  // Assert the new row is visible in the catalog list.
  const newRow = page.getByRole("row", {
    name: new RegExp(`Service: ${escapeRegExp(serviceName)}`),
  });
  await expect(
    newRow,
    `New service row for '${serviceName}' must be visible after add`,
  ).toBeVisible({ timeout: 10_000 });

  // Assert the new row shows Active status.
  await expect(
    newRow.getByText("Active"),
    "New service must show Active status",
  ).toBeVisible({ timeout: 5_000 });

  await page.screenshot({ path: shot("02-AC-DOOR-002-01-add-service.png"), fullPage: true });
  await clearSession(page);
});

// ─── Screen 03: Edit a service ─────────────────────────────────────────────────

test("[AC-DOOR-002-02] @demo 03 — jane-accountant: edits a service; updated row visible in catalog", async ({
  page,
  request,
}) => {
  // Screen 03: ACCOUNTANT adds a service then edits it → updated row visible (AC-DOOR-002-02)
  // Proves: the accountant can update a service's details and the change is reflected in the list.
  await setupAccountantSession(page, request);
  await page.goto(`${ADMIN_URL}/services`);
  await expect(
    page.getByRole("heading", { name: "Services Catalog" }),
  ).toBeVisible({ timeout: 15_000 });

  // First, add a service to edit (state setup for this screenshot).
  const originalName = uniqueName("Demo-Edit-Before");
  const editedName = uniqueName("Demo-Edit-After");
  const editedDescription = "Demo walkthrough: updated description for EPIC-002 edit screenshot";

  await page.getByRole("button", { name: "Add new service" }).click();
  await expect(page.getByRole("form", { name: "Add service form" })).toBeVisible({ timeout: 10_000 });
  await page.getByLabel("Service Name").fill(originalName);
  await page.getByRole("button", { name: "Add Service" }).click();
  await expect(page.getByRole("form", { name: "Add service form" })).not.toBeVisible({ timeout: 10_000 });

  // Open the edit form for the service we just added.
  const editButton = page.getByRole("button", { name: `Edit ${originalName}` });
  await expect(editButton, `Edit button for '${originalName}' must be visible`).toBeVisible({ timeout: 10_000 });
  await editButton.click();

  // Assert the edit form appears.
  await expect(
    page.getByRole("form", { name: "Edit service form" }),
    "Edit service form must be visible",
  ).toBeVisible({ timeout: 10_000 });

  // Update the name and description.
  const nameInput = page.getByRole("form", { name: "Edit service form" }).getByLabel("Service Name");
  await nameInput.clear();
  await nameInput.fill(editedName);

  const descInput = page.getByRole("form", { name: "Edit service form" }).getByLabel("Description");
  await descInput.clear();
  await descInput.fill(editedDescription);

  // Submit and wait for the edit form to close.
  await page.getByRole("button", { name: "Save Changes" }).click();
  await expect(page.getByRole("form", { name: "Edit service form" })).not.toBeVisible({ timeout: 10_000 });

  // Assert the updated row is visible.
  const updatedRow = page.getByRole("row", {
    name: new RegExp(`Service: ${escapeRegExp(editedName)}`),
  });
  await expect(
    updatedRow,
    `Updated service row for '${editedName}' must be visible after edit`,
  ).toBeVisible({ timeout: 10_000 });

  await page.screenshot({ path: shot("03-AC-DOOR-002-02-edit-service.png"), fullPage: true });
  await clearSession(page);
});

// ─── Screen 04: Deactivate a service (inactive state) ─────────────────────────

test("[AC-DOOR-002-03] @demo 04 — jane-accountant: deactivates a service; inactive-badge visible", async ({
  page,
  request,
}) => {
  // Screen 04: ACCOUNTANT adds a service then deactivates it → inactive-badge visible (AC-DOOR-002-03)
  // Proves: the accountant can deactivate a service and it is shown with the inactive badge.
  await setupAccountantSession(page, request);
  await page.goto(`${ADMIN_URL}/services`);
  await expect(
    page.getByRole("heading", { name: "Services Catalog" }),
  ).toBeVisible({ timeout: 15_000 });

  // Add a service to deactivate (state setup for this screenshot).
  const serviceName = uniqueName("Demo-Deactivate-Service");

  await page.getByRole("button", { name: "Add new service" }).click();
  await expect(page.getByRole("form", { name: "Add service form" })).toBeVisible({ timeout: 10_000 });
  await page.getByLabel("Service Name").fill(serviceName);
  await page.getByRole("button", { name: "Add Service" }).click();
  await expect(page.getByRole("form", { name: "Add service form" })).not.toBeVisible({ timeout: 10_000 });

  // Auto-accept the confirm dialog that fires on deactivation.
  page.on("dialog", (dialog) => dialog.accept());

  // Click the Deactivate button.
  const deactivateButton = page.getByRole("button", { name: `Deactivate ${serviceName}` });
  await expect(
    deactivateButton,
    `Deactivate button for '${serviceName}' must be visible before click`,
  ).toBeVisible({ timeout: 10_000 });
  await deactivateButton.click();

  // Assert the inactive-badge is visible for this service row.
  const inactiveBadge = page
    .getByRole("row", {
      name: new RegExp(`Service: ${escapeRegExp(serviceName)} \\(inactive\\)`),
    })
    .getByTestId("inactive-badge");

  await expect(
    inactiveBadge,
    `inactive-badge for '${serviceName}' must be visible after deactivation`,
  ).toBeVisible({ timeout: 10_000 });

  await page.screenshot({ path: shot("04-AC-DOOR-002-03-deactivate-service-inactive.png"), fullPage: true });
  await clearSession(page);
});
