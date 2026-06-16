/**
 * apps/admin/e2e/specs/services-catalog.spec.ts
 *
 * TASK-002-004: Tier-6 e2e catalog journeys — binds the 7 gherkin scenarios from BRIEF-002.
 *
 * AC-DOOR-002-01 + AC-DASH-010-01: Accountant adds a service → appears in catalog list
 * AC-DOOR-002-02 + AC-DASH-010-02: Accountant edits a service → edited details reflected
 * AC-DOOR-002-03 + AC-DASH-010-03: Accountant deactivates a service → shown inactive
 * AC-DOOR-002-05: Catalog write path exists only on the authenticated admin surface
 *
 * Each covering test's title contains its AC id(s) — required for COVERAGE write-back.
 * DOOR + DASH paired journeys are tagged with BOTH ids (same UI behavior, two AC views).
 *
 * Authentication: mocked provider (AUTH_PROVIDER=mock). Uses setupAccountantSession() from
 * apps/admin/e2e/fixtures/auth.ts. No real Clerk is contacted.
 *
 * Stack: admin container at http://localhost:13001 (ADMIN_BASE_URL / ADMIN_PORT env).
 *
 * Run:
 *   pnpm --filter admin e2e:run -- --grep 'services-catalog'
 *
 * ADR-006: Admin-only management surface; no portal mirror for writes.
 * ADR-010: All admin routes require ACCOUNTANT auth.
 * ADR-012: Tier-6 e2e — real DB + real server actions + real RLS policy gate.
 */

import { test, expect } from "@playwright/test";
import {
  setupAccountantSession,
  setupClientSession,
  clearSession,
} from "../fixtures/auth.js";

// ─── URL resolution ────────────────────────────────────────────────────────────
// Mirrors playwright.config.ts + auth.ts (ADMIN_BASE_URL / ADMIN_PORT).
const ADMIN_PORT = process.env["ADMIN_PORT"] ?? "3001";
const ADMIN_URL = process.env["ADMIN_BASE_URL"] ?? `http://localhost:${ADMIN_PORT}`;

// ─── Unique name helper ────────────────────────────────────────────────────────
// Tests create services with unique names to avoid cross-test interference
// (the DB is shared across the test run; uniqueness prevents false positives).
function uniqueName(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// ─── [AC-DOOR-002-01][AC-DASH-010-01] Accountant adds a service ───────────────

test.describe("[AC-DOOR-002-01][AC-DASH-010-01] accountant adds a service → appears in her catalog list", () => {
  test.beforeEach(async ({ page, request }) => {
    await setupAccountantSession(page, request);
  });

  test.afterEach(async ({ page }) => {
    await clearSession(page);
  });

  test(
    "[AC-DOOR-002-01][AC-DASH-010-01] accountant adds a service → appears in her catalog list",
    async ({ page }) => {
      // Given: the signed-in accountant on the catalog management screen
      await page.goto(`${ADMIN_URL}/services`);

      // Assert the catalog management screen is shown
      await expect(page.getByRole("heading", { name: "Services Catalog" })).toBeVisible();

      // When: she adds a new service with its details
      const serviceName = uniqueName("E2E-Add-Service");
      const serviceDescription = "E2E test service description for add";

      // Click the "Add Service" button
      await page.getByRole("button", { name: "Add new service" }).click();

      // Fill in the form
      await expect(page.getByRole("form", { name: "Add service form" })).toBeVisible();
      await page.getByLabel("Service Name").fill(serviceName);
      await page.getByLabel("Description").fill(serviceDescription);

      // Submit
      await page.getByRole("button", { name: "Add Service" }).click();

      // Then: the service exists in the catalog and is available to be offered
      // The form should close on success, and the catalog should refresh
      await expect(page.getByRole("form", { name: "Add service form" })).not.toBeVisible({ timeout: 10_000 });

      // Verify the new service appears in the catalog list (active status)
      const serviceRow = page.getByRole("row", {
        name: new RegExp(`Service: ${serviceName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`),
      });
      await expect(serviceRow).toBeVisible({ timeout: 10_000 });

      // Verify it shows "Active" status
      await expect(serviceRow.getByText("Active")).toBeVisible();
    },
  );
});

// ─── [AC-DOOR-002-02][AC-DASH-010-02] Accountant edits a service ──────────────

test.describe("[AC-DOOR-002-02][AC-DASH-010-02] accountant edits a service → edited details reflected", () => {
  test.beforeEach(async ({ page, request }) => {
    await setupAccountantSession(page, request);
  });

  test.afterEach(async ({ page }) => {
    await clearSession(page);
  });

  test(
    "[AC-DOOR-002-02][AC-DASH-010-02] accountant edits a service → edited details reflected",
    async ({ page }) => {
      // Given: an existing service in the catalog
      await page.goto(`${ADMIN_URL}/services`);
      await expect(page.getByRole("heading", { name: "Services Catalog" })).toBeVisible();

      // First, add a service to edit (setup for this test)
      const originalName = uniqueName("E2E-Edit-Before");
      const editedName = uniqueName("E2E-Edit-After");
      const editedDescription = "Updated description after edit";

      // Add the service
      await page.getByRole("button", { name: "Add new service" }).click();
      await expect(page.getByRole("form", { name: "Add service form" })).toBeVisible();
      await page.getByLabel("Service Name").fill(originalName);
      await page.getByRole("button", { name: "Add Service" }).click();
      await expect(page.getByRole("form", { name: "Add service form" })).not.toBeVisible({ timeout: 10_000 });

      // When: the accountant edits its details
      const editButton = page.getByRole("button", { name: `Edit ${originalName}` });
      await expect(editButton).toBeVisible({ timeout: 10_000 });
      await editButton.click();

      // The edit form should appear, pre-filled with the original values
      await expect(page.getByRole("form", { name: "Edit service form" })).toBeVisible();

      // Clear and fill with new values
      const nameInput = page.getByRole("form", { name: "Edit service form" }).getByLabel("Service Name");
      await nameInput.clear();
      await nameInput.fill(editedName);

      const descInput = page.getByRole("form", { name: "Edit service form" }).getByLabel("Description");
      await descInput.clear();
      await descInput.fill(editedDescription);

      // Submit
      await page.getByRole("button", { name: "Save Changes" }).click();

      // Then: the updated details are persisted and reflected wherever the service is shown
      await expect(page.getByRole("form", { name: "Edit service form" })).not.toBeVisible({ timeout: 10_000 });

      // Verify the updated name appears in the catalog
      const updatedRow = page.getByRole("row", {
        name: new RegExp(`Service: ${editedName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`),
      });
      await expect(updatedRow).toBeVisible({ timeout: 10_000 });

      // Verify the old name no longer appears
      await expect(
        page.getByRole("row", {
          name: new RegExp(`Service: ${originalName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`),
        }),
      ).not.toBeVisible({ timeout: 5_000 });

      // Reload page to confirm persistence (round-trip to DB)
      await page.reload();
      await expect(page.getByRole("heading", { name: "Services Catalog" })).toBeVisible();
      await expect(
        page.getByRole("row", {
          name: new RegExp(`Service: ${editedName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`),
        }),
      ).toBeVisible({ timeout: 10_000 });
    },
  );
});

// ─── [AC-DOOR-002-03][AC-DASH-010-03] Accountant deactivates a service ─────────

test.describe("[AC-DOOR-002-03][AC-DASH-010-03] accountant deactivates a service → shown inactive", () => {
  test.beforeEach(async ({ page, request }) => {
    await setupAccountantSession(page, request);
  });

  test.afterEach(async ({ page }) => {
    await clearSession(page);
  });

  test(
    "[AC-DOOR-002-03][AC-DASH-010-03] accountant deactivates a service → shown inactive",
    async ({ page }) => {
      // Given: an active service in the catalog
      await page.goto(`${ADMIN_URL}/services`);
      await expect(page.getByRole("heading", { name: "Services Catalog" })).toBeVisible();

      const serviceName = uniqueName("E2E-Deactivate-Service");

      // Add the service to deactivate
      await page.getByRole("button", { name: "Add new service" }).click();
      await expect(page.getByRole("form", { name: "Add service form" })).toBeVisible();
      await page.getByLabel("Service Name").fill(serviceName);
      await page.getByRole("button", { name: "Add Service" }).click();
      await expect(page.getByRole("form", { name: "Add service form" })).not.toBeVisible({ timeout: 10_000 });

      // When: the accountant deactivates it
      // Playwright can auto-dismiss dialogs by default; configure to accept the confirm dialog
      page.on("dialog", (dialog) => dialog.accept());

      const deactivateButton = page.getByRole("button", {
        name: `Deactivate ${serviceName}`,
      });
      await expect(deactivateButton).toBeVisible({ timeout: 10_000 });
      await deactivateButton.click();

      // Then: the service is marked inactive and is no longer offered to prospects
      // The deactivate button should disappear (inactive rows don't have it)
      await expect(deactivateButton).not.toBeVisible({ timeout: 10_000 });

      // The service row should show "Inactive" badge
      const inactiveBadge = page
        .getByRole("row", {
          name: new RegExp(`Service: ${serviceName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\(inactive\\)`),
        })
        .getByTestId("inactive-badge");
      await expect(inactiveBadge).toBeVisible({ timeout: 10_000 });

      // Reload to confirm persistence
      await page.reload();
      await expect(page.getByRole("heading", { name: "Services Catalog" })).toBeVisible();
      const reloadedInactiveBadge = page
        .getByRole("row", {
          name: new RegExp(`Service: ${serviceName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\(inactive\\)`),
        })
        .getByTestId("inactive-badge");
      await expect(reloadedInactiveBadge).toBeVisible({ timeout: 10_000 });
    },
  );
});

// ─── [AC-DOOR-002-05] Catalog write path is admin-only ────────────────────────

test.describe("[AC-DOOR-002-05] catalog write path exists only on the authenticated admin surface", () => {
  test.afterEach(async ({ page }) => {
    await clearSession(page);
  });

  test(
    "[AC-DOOR-002-05] CLIENT session has no catalog write UI — redirected away from admin",
    async ({ page, request }) => {
      // Given: a caller who is not the accountant — a CLIENT
      await setupClientSession(page, request);

      // When: that caller attempts to access the catalog management screen
      // Then: the change is rejected (the middleware redirects CLIENTs away from admin)
      // The trust boundary proof is the TASK-002-001 tier-3 DB test;
      // this is the UI-surface complement.
      let redirectSeen = false;
      page.on("response", (response) => {
        if (response.status() === 307 || response.status() === 308) {
          redirectSeen = true;
        }
      });

      await page.goto(`${ADMIN_URL}/services`, { waitUntil: "commit" });

      const finalUrl = new URL(page.url());
      const isOnAdminServices =
        finalUrl.origin.includes("13001") || finalUrl.origin.includes("3001");
      const isOnServicesPath = finalUrl.pathname === "/services";

      // A CLIENT must NOT be served the catalog management page
      // — either redirected away or not on /services
      expect(
        redirectSeen || !isOnAdminServices || !isOnServicesPath,
        "CLIENT must NOT be served the admin /services catalog management page",
      ).toBe(true);
    },
  );

  test(
    "[AC-DOOR-002-05] anonymous visitor has no catalog write UI — redirected to sign-in",
    async ({ page }) => {
      // Given: a caller who is anonymous (no session)
      // When: that caller attempts to access the catalog management screen
      let redirectSeen = false;
      page.on("response", (response) => {
        if (response.status() === 307 || response.status() === 308) {
          redirectSeen = true;
        }
      });

      await page.goto(`${ADMIN_URL}/services`, { waitUntil: "commit" });

      const finalUrl = new URL(page.url());
      const onSignIn = finalUrl.pathname.includes("/sign-in");

      // Then: the change is rejected — anonymous visitors cannot access catalog management
      // The middleware redirects unauthenticated requests to admin /sign-in
      expect(
        redirectSeen || onSignIn,
        "Anonymous visitor must be redirected to sign-in, not served the catalog management page",
      ).toBe(true);

      // Must not have been served the catalog management page itself
      expect(
        finalUrl.pathname === "/services" && !redirectSeen,
        "Anonymous visitor must NOT be served /services catalog — redirect must fire",
      ).toBe(false);
    },
  );
});
