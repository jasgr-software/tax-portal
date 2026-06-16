/**
 * apps/admin/e2e/specs/services-catalog-cross-surface.spec.ts
 *
 * TASK-002-004: Cross-surface deactivate loop.
 *
 * AC-DOOR-002-03 (cross-surface evidence): A service deactivated in the admin app
 * is absent from the portal's public services page (/services), which renders only
 * active services. This is EVIDENCE for AC-DOOR-002-03 — NOT a sign-off on
 * AC-DOOR-002-04 (which is owned by EPIC-001 and covers the request form).
 *
 * Flow:
 *   1. Accountant creates a uniquely-named service via admin /services (ADD)
 *   2. Verify the service appears on the portal public services page
 *   3. Accountant deactivates the service in admin
 *   4. Verify the service is ABSENT from the portal public services page
 *
 * This test exercises the full DB round-trip:
 *   admin server action (deactivateServiceAction) → Prisma withRequestContext →
 *   SQL Server UPDATE active=false → portal getActiveServices() → WHERE active=1 →
 *   service absent from public page
 *
 * Authentication:
 *   - Admin journey: setupAccountantSession (mock provider)
 *   - Portal check: anonymous / public (no session needed — the portal services page is public)
 *
 * ADR-006: Catalog write is admin-only. The portal surfaces only active services (read-only).
 * ADR-012: Tier-6 e2e — exercises the full stack end-to-end.
 *
 * Run:
 *   pnpm --filter admin e2e:run -- --grep 'cross-surface'
 */

import { test, expect } from "@playwright/test";
import { setupAccountantSession, clearSession } from "../fixtures/auth.js";

// ─── URL resolution ────────────────────────────────────────────────────────────
const ADMIN_PORT = process.env["ADMIN_PORT"] ?? "3001";
const ADMIN_URL = process.env["ADMIN_BASE_URL"] ?? `http://localhost:${ADMIN_PORT}`;
const PORTAL_URL = process.env["PORTAL_BASE_URL"] ?? "http://localhost:3000";

// ─── Unique name helper ────────────────────────────────────────────────────────
function uniqueName(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// ─── [AC-DOOR-002-03] Cross-surface deactivate → portal absence ───────────────

test.describe("[AC-DOOR-002-03] deactivated service no longer selectable on the public door (cross-surface loop)", () => {
  test.beforeEach(async ({ page, request }) => {
    await setupAccountantSession(page, request);
  });

  test.afterEach(async ({ page }) => {
    await clearSession(page);
  });

  test(
    "[AC-DOOR-002-03] deactivated service no longer selectable on the public door (cross-surface loop)",
    async ({ page }) => {
      // ── STEP 1: Create a uniquely-named active service in admin ──────────────
      const serviceName = uniqueName("E2E-CrossSurface-Deactivate");

      await page.goto(`${ADMIN_URL}/services`);
      await expect(page.getByRole("heading", { name: "Services Catalog" })).toBeVisible();

      // Add the service
      await page.getByRole("button", { name: "Add new service" }).click();
      await expect(page.getByRole("form", { name: "Add service form" })).toBeVisible();
      await page.getByLabel("Service Name").fill(serviceName);
      await page.getByRole("button", { name: "Add Service" }).click();
      await expect(page.getByRole("form", { name: "Add service form" })).not.toBeVisible({ timeout: 10_000 });

      // Confirm the service is active in the catalog
      const activeServiceRow = page.getByRole("row", {
        name: new RegExp(`Service: ${serviceName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`),
      });
      await expect(activeServiceRow).toBeVisible({ timeout: 10_000 });

      // ── STEP 2: Verify the service appears on the portal public services page ─
      // Navigate to portal (new page context isn't needed — portal /services is public)
      await page.goto(`${PORTAL_URL}/services`);
      await expect(page.getByRole("heading", { name: "Our Tax Accounting Services" })).toBeVisible();

      // The service should appear as an active offering
      await expect(page.getByRole("heading", { name: serviceName, level: 3 })).toBeVisible({ timeout: 10_000 });

      // ── STEP 3: Deactivate the service in admin ──────────────────────────────
      await page.goto(`${ADMIN_URL}/services`);
      await expect(page.getByRole("heading", { name: "Services Catalog" })).toBeVisible();

      // Accept the confirmation dialog
      page.on("dialog", (dialog) => dialog.accept());

      const deactivateButton = page.getByRole("button", {
        name: `Deactivate ${serviceName}`,
      });
      await expect(deactivateButton).toBeVisible({ timeout: 10_000 });
      await deactivateButton.click();

      // Confirm deactivation in admin (inactive badge visible)
      const inactiveBadge = page
        .getByRole("row", {
          name: new RegExp(`Service: ${serviceName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\(inactive\\)`),
        })
        .getByTestId("inactive-badge");
      await expect(inactiveBadge).toBeVisible({ timeout: 10_000 });

      // ── STEP 4: Verify the service is ABSENT from the portal public page ──────
      // Navigate to portal services page (force-dynamic — reads from DB on every request)
      await page.goto(`${PORTAL_URL}/services`);
      await expect(page.getByRole("heading", { name: "Our Tax Accounting Services" })).toBeVisible();

      // Then: the deactivated service must NOT appear in the portal services list
      // The portal page only renders active services (WHERE active = 1).
      // This is the cross-surface loop: deactivate in admin → absent from public door.
      // Evidence for AC-DOOR-002-03 (NOT AC-DOOR-002-04 — owned by EPIC-001).
      await expect(
        page.getByRole("heading", { name: serviceName, level: 3 }),
      ).not.toBeVisible({ timeout: 10_000 });
    },
  );
});
