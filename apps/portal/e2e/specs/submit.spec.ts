/**
 * apps/portal/e2e/specs/submit.spec.ts
 *
 * Tier-6 e2e spec — happy-path engagement request submit.
 * Runs against the full docker-compose stack (SQL Server + portal container).
 *
 * Acceptance criterion covered:
 *   AC-DOOR-004-03 @smoke — submitting creates a pending engagement request
 *
 * Feature mirror: apps/portal/e2e/features/public-front-door.feature
 * EPIC-001 source: .planning/EPIC-001-public-front-door.md
 *
 * Assertion strategy for AC-DOOR-004-03:
 *   The engagement_request table is ACCOUNTANT-ONLY-readable by the RLS policy (ADR-005).
 *   To verify the DB row was created without relaxing the policy, this spec uses the
 *   admin pool fixture (app_admin_role — RLS-exempt) to read back the created record.
 *   This is the "accountant-readable path" (admin-pool context) required by TASK-005.
 *   The RLS policy is NOT weakened in this test.
 *
 * @smoke — This test is included in the @smoke subset.
 *   Smoke subset run: pnpm --filter portal e2e:run -- --grep '@smoke'
 *   Used by: scripts/smoke-test.sh + IO Smoke phase.
 *
 * Gate evidence (ENGINE.md § Gate Authoring Rules):
 *   Named production code path:
 *     createEngagementRequest() in packages/db/src/repositories/engagement-request.ts
 *     — the INSERT transaction + status='pending' + EngagementRequestService join rows.
 *     If the status were changed from 'pending' to 'draft' on INSERT, this test would
 *     red on the `expect(record.status).toBe('pending')` assertion.
 *   Counterfactual: Changing the Server Action (actions.ts) submitEngagementRequest to
 *     return { success: false } unconditionally would red this test on the UI success
 *     state assertion (page would show error, not "Request Submitted").
 */

import { test, expect } from "@playwright/test";
import {
  getActiveServices,
  findEngagementRequestByEmail,
  deleteEngagementRequestsByEmail,
  closeAdminPool,
} from "../fixtures/db";

// Unique-ish test email — includes a timestamp suffix to avoid cross-run collisions
// if cleanup failed in a previous run.
const TEST_EMAIL = `e2e.smoke.${Date.now()}@test.example.com`;

test.afterAll(async () => {
  // Cleanup: delete the test engagement request created during this run
  try {
    await deleteEngagementRequestsByEmail(TEST_EMAIL);
  } finally {
    await closeAdminPool();
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// AC-DOOR-004-03 @smoke — Happy-path submit creates a pending request
// ──────────────────────────────────────────────────────────────────────────────

test("[AC-DOOR-004-03] @smoke happy-path: fill form, submit → pending engagement_request created", async ({
  page,
}) => {
  // Given a completed request form with at least one service selected
  const activeServices = await getActiveServices();
  expect(activeServices.length).toBeGreaterThan(0);

  const chosenService = activeServices[0];
  if (!chosenService) throw new Error("No active services seeded — run pnpm db:seed first");

  await page.goto("/request");

  // Select one service from the checklist
  await page.getByRole("checkbox", { name: chosenService.name }).check();
  await expect(
    page.getByRole("checkbox", { name: chosenService.name }),
  ).toBeChecked();

  // Fill contact info
  await page.locator('input[name="firstName"]').fill("Smoke");
  await page.locator('input[name="lastName"]').fill("Test");
  await page.locator('input[name="email"]').fill(TEST_EMAIL);

  // When the visitor submits it
  await page.getByRole("button", { name: /submit request/i }).click();

  // Then an engagement request is created in a pending (awaiting-review) state
  // 1) UI: success message appears (form replaced by confirmation)
  const successHeading = page.getByText(/request submitted/i);
  await expect(successHeading).toBeVisible({ timeout: 15_000 });

  // 2) The submit button is gone (form replaced by success state)
  await expect(
    page.getByRole("button", { name: /submit request/i }),
  ).not.toBeVisible();

  // 3) DB: assert the record was created in pending state via the admin pool
  //    (accountant-readable path — admin_role, RLS-exempt — NOT a policy relaxation)
  const record = await findEngagementRequestByEmail(TEST_EMAIL);
  expect(record).not.toBeNull();
  expect(record!.status).toBe("pending");
  expect(record!.firstName).toBe("Smoke");
  expect(record!.lastName).toBe("Test");
  expect(record!.email).toBe(TEST_EMAIL.toLowerCase());
  expect(record!.serviceIds).toHaveLength(1);
  expect(record!.serviceIds[0]).toBe(chosenService.id);
});
