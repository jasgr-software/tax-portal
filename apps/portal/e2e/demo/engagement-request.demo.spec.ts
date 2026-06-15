/**
 * apps/portal/e2e/demo/engagement-request.demo.spec.ts
 *
 * @demo UI demo walkthrough — EPIC-001 Public front door.
 *
 * Not part of the e2e gate: `e2e:run` / `e2e:smoke` exclude `@demo` (--grep-invert @demo);
 * this runs ONLY via `pnpm --filter portal e2e:demo`. It drives Tom's (prospective client)
 * engagement-request happy path against the live docker-compose stack and writes an
 * AC-tagged screenshot gallery to docs/demos/EPIC-001/. NON-GATING.
 *
 * Persona: .planning/personas/tom-prospective-client.md
 * Flow:    .planning/flows/flow-engagement-request.md (anonymous submission path)
 * Policy:  .orchestration/DEMO-POLICY.md
 *
 * It also ASSERTS each screen is visible, so a broken UI fails the demo loudly.
 *
 * Pre-reqs (same SUT as the e2e gate): docker compose up -d → pnpm db:migrate → pnpm db:seed.
 */

import { test, expect } from "@playwright/test";
import path from "path";
import {
  getActiveServices,
  deleteEngagementRequestsByEmail,
  closeAdminPool,
} from "../fixtures/db";

// Gallery output dir — repo-root/docs/demos/EPIC-001 (resolved from this file's dir).
const DEMO_DIR = path.resolve(__dirname, "../../../../docs/demos/EPIC-001");
const shot = (file: string) => path.join(DEMO_DIR, file);

// Stable demo email (cleaned up afterAll) — distinct from the @smoke spec's email.
const DEMO_EMAIL = "demo.tom@example.com";

test.afterAll(async () => {
  try {
    await deleteEngagementRequestsByEmail(DEMO_EMAIL);
  } finally {
    await closeAdminPool();
  }
});

test("[AC-DOOR-001-01][AC-DOOR-003-01][AC-DOOR-004-01][AC-DOOR-004-03] @demo public front door walkthrough", async ({
  page,
}) => {
  const activeServices = await getActiveServices();
  expect(activeServices.length, "seed active services first (pnpm db:seed)").toBeGreaterThan(0);
  // Demo two services when available, else one.
  const chosen = activeServices.slice(0, Math.min(2, activeServices.length));

  // 1. Anonymous services page — no account, no sign-in.  [AC-DOOR-001-01]
  await page.goto("/services");
  await expect(page.getByText(chosen[0]!.name).first()).toBeVisible({ timeout: 15_000 });
  await page.screenshot({ path: shot("01-AC-DOOR-001-01-services-page.png"), fullPage: true });

  // 2. Engagement request form — services as a checklist.  [AC-DOOR-003-01]
  await page.goto("/request");
  await expect(page.getByRole("checkbox", { name: chosen[0]!.name })).toBeVisible({ timeout: 15_000 });
  await page.screenshot({ path: shot("02-AC-DOOR-003-01-request-form.png"), fullPage: true });

  // 3. Select one or more services + provide basic contact info.  [AC-DOOR-004-01 / -004-02]
  for (const svc of chosen) {
    await page.getByRole("checkbox", { name: svc.name }).check();
    await expect(page.getByRole("checkbox", { name: svc.name })).toBeChecked();
  }
  await page.locator('input[name="firstName"]').fill("Tom");
  await page.locator('input[name="lastName"]').fill("Prospect");
  await page.locator('input[name="email"]').fill(DEMO_EMAIL);
  await page.screenshot({ path: shot("03-AC-DOOR-004-01-services-selected.png"), fullPage: true });

  // 4. Submit → pending request created → confirmation.  [AC-DOOR-004-03]
  await page.getByRole("button", { name: /submit request/i }).click();
  await expect(page.getByText(/request submitted/i)).toBeVisible({ timeout: 15_000 });
  await page.screenshot({ path: shot("04-AC-DOOR-004-03-submitted-confirmation.png"), fullPage: true });
});
