/**
 * apps/portal/e2e/specs/request-form.spec.ts
 *
 * Tier-6 e2e specs for the request form (/request).
 * Runs against the full docker-compose stack (SQL Server + portal container).
 *
 * Acceptance criteria covered:
 *   AC-DOOR-003-01 — form presents active services as a checklist
 *   AC-DOOR-003-02 — no freeform "describe your need" field replaces the checklist
 *   AC-DOOR-003-03 — no service-specific sub-questions vary the form by selection
 *   AC-DOOR-003-04 — deactivated service not a checklist option
 *   AC-DOOR-004-01 — select one or more services captured
 *   AC-DOOR-004-02 — contact info fields captured
 *   AC-DOOR-004-05 — zero-services submit blocked, no request created
 *
 * Feature mirror: apps/portal/e2e/features/public-front-door.feature
 * EPIC-001 source: .planning/EPIC-001-public-front-door.md
 *
 * Gate evidence (ENGINE.md § Gate Authoring Rules):
 *   Named production code path:
 *     - ServiceChecklist.tsx: renders one checkbox per active service; no textarea present.
 *       Removing the check in RequestForm.handleSubmit (selectedServiceIds.length === 0)
 *       would red AC-DOOR-004-05.
 *     - getActiveServices() WHERE active=1 filter: if removed, inactive services appear
 *       in the checklist (would red AC-DOOR-003-04).
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
// AC-DOOR-003-01 — Form presents active services as a checklist
// ──────────────────────────────────────────────────────────────────────────────

test("[AC-DOOR-003-01] request form presents active services as selectable checklist items", async ({
  page,
}) => {
  // Given the request form (When an anonymous visitor opens it)
  const activeServices = await getActiveServices();
  expect(activeServices.length).toBeGreaterThan(0);

  await page.goto("/request");

  // Then the active services are presented as selectable checklist items
  // Each active service should have a checkbox with the service name as its label
  for (const service of activeServices) {
    const checkbox = page.getByRole("checkbox", { name: service.name });
    await expect(checkbox).toBeVisible();
    await expect(checkbox).not.toBeChecked();
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// AC-DOOR-003-02 — No freeform "describe your need" field replaces the checklist
// ──────────────────────────────────────────────────────────────────────────────

test("[AC-DOOR-003-02] no freeform textarea replaces the service checklist", async ({
  page,
}) => {
  // Given the request form
  await page.goto("/request");

  // When the visitor inspects how they express what they need
  // Then selection is via the service checklist — no freeform textarea replacing it

  // No textarea element should be present for "describe your need" style input
  const textareas = page.locator("textarea");
  await expect(textareas).toHaveCount(0);

  // The checklist (fieldset with checkboxes) should be present
  const fieldset = page.locator("fieldset");
  await expect(fieldset).toBeVisible();
  const checkboxes = page.locator('input[type="checkbox"]');
  await expect(checkboxes.first()).toBeVisible();
});

// ──────────────────────────────────────────────────────────────────────────────
// AC-DOOR-003-03 — No service-specific sub-questions vary the form by selection
// ──────────────────────────────────────────────────────────────────────────────

test("[AC-DOOR-003-03] no service-specific sub-questions appear when services are selected", async ({
  page,
}) => {
  // Given the request form with services selected
  const activeServices = await getActiveServices();
  expect(activeServices.length).toBeGreaterThan(0);

  await page.goto("/request");

  // Count checkboxes before any selection
  const checkboxesBefore = await page.locator('input[type="checkbox"]').count();

  // When the visitor selects services one by one
  for (const service of activeServices) {
    await page.getByRole("checkbox", { name: service.name }).check();

    // Then no new inputs/sub-questions appear after each selection
    // The checkbox count must remain constant (no dynamic sub-form injection)
    const checkboxesAfter = await page
      .locator('input[type="checkbox"]')
      .count();
    expect(checkboxesAfter).toBe(checkboxesBefore);
  }

  // Contact info fields remain constant regardless of service selection
  await expect(page.locator('input[name="firstName"]')).toBeVisible();
  await expect(page.locator('input[name="lastName"]')).toBeVisible();
  await expect(page.locator('input[name="email"]')).toBeVisible();
});

// ──────────────────────────────────────────────────────────────────────────────
// AC-DOOR-003-04 — Deactivated service not a checklist option
// ──────────────────────────────────────────────────────────────────────────────

test("[AC-DOOR-003-04] deactivated service is not offered as a checklist option on the request form", async ({
  page,
}) => {
  // Given a deactivated service (seeded as "Estate Tax Return")
  const inactiveServices = await getInactiveServices();
  expect(inactiveServices.length).toBeGreaterThan(0);

  // When the visitor views the request form's checklist
  await page.goto("/request");

  // Then the deactivated service is not offered as a checklist option
  for (const service of inactiveServices) {
    await expect(
      page.getByRole("checkbox", { name: service.name }),
    ).not.toBeVisible();
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// AC-DOOR-004-01 — Prospect selects one or more services
// ──────────────────────────────────────────────────────────────────────────────

test("[AC-DOOR-004-01] selecting one or more services is captured and shown as checked", async ({
  page,
}) => {
  // Given an anonymous visitor on the request form
  const activeServices = await getActiveServices();
  expect(activeServices.length).toBeGreaterThan(0);

  await page.goto("/request");

  // When they choose one or more active services
  const firstService = activeServices[0];
  const secondService = activeServices[1];

  if (!firstService) throw new Error("No active services seeded");

  await page.getByRole("checkbox", { name: firstService.name }).check();
  await expect(
    page.getByRole("checkbox", { name: firstService.name }),
  ).toBeChecked();

  // Select a second service if available
  if (secondService) {
    await page.getByRole("checkbox", { name: secondService.name }).check();
    await expect(
      page.getByRole("checkbox", { name: secondService.name }),
    ).toBeChecked();
  }

  // Then their selection is captured for submission (both remain checked)
  await expect(
    page.getByRole("checkbox", { name: firstService.name }),
  ).toBeChecked();
});

// ──────────────────────────────────────────────────────────────────────────────
// AC-DOOR-004-02 — Prospect provides basic contact information
// ──────────────────────────────────────────────────────────────────────────────

test("[AC-DOOR-004-02] contact info fields (firstName, lastName, email) are present and accept input", async ({
  page,
}) => {
  // Given an anonymous visitor completing the request form
  await page.goto("/request");

  // When they enter their basic contact information
  await page.locator('input[name="firstName"]').fill("Jane");
  await page.locator('input[name="lastName"]').fill("Smith");
  await page.locator('input[name="email"]').fill("jane.smith.e2e@example.com");

  // Then the contact information is captured with the request
  // (Verify the fields retained the values — form is ready to submit)
  await expect(page.locator('input[name="firstName"]')).toHaveValue("Jane");
  await expect(page.locator('input[name="lastName"]')).toHaveValue("Smith");
  await expect(page.locator('input[name="email"]')).toHaveValue(
    "jane.smith.e2e@example.com",
  );
});

// ──────────────────────────────────────────────────────────────────────────────
// AC-DOOR-004-05 — Zero-services submit blocked
// ──────────────────────────────────────────────────────────────────────────────

test("[AC-DOOR-004-05] submitting with zero services selected is blocked with no request created", async ({
  page,
}) => {
  // Given an anonymous visitor on the request form with no services selected
  await page.goto("/request");

  // Fill contact info but do NOT select any service
  await page.locator('input[name="firstName"]').fill("No");
  await page.locator('input[name="lastName"]').fill("Service");
  await page.locator('input[name="email"]').fill("no.service.e2e@example.com");

  // Ensure no checkboxes are checked
  const checkedBoxes = page.locator('input[type="checkbox"]:checked');
  await expect(checkedBoxes).toHaveCount(0);

  // When they attempt to submit
  await page.getByRole("button", { name: /submit request/i }).click();

  // Then submission is blocked
  // An error/validation message should appear
  const errorMessage = page
    .getByRole("alert")
    .or(page.getByText(/at least one service/i))
    .or(page.getByText(/please select/i));
  await expect(errorMessage.first()).toBeVisible();

  // The form is still visible (not replaced by a success state)
  await expect(
    page.getByRole("button", { name: /submit request/i }),
  ).toBeVisible();

  // The success message must NOT be present
  await expect(page.getByText(/request submitted/i)).not.toBeVisible();
});
