/**
 * apps/admin/e2e/demo/letter-template.demo.spec.ts
 *
 * @demo UI demo walkthrough — EPIC-005 Engagement-letter template (admin surface).
 *
 * Not part of the e2e gate: `e2e:run` / `e2e:smoke` exclude `@demo` (--grep-invert @demo);
 * this runs ONLY via `pnpm --filter admin e2e:demo`. It drives jane-accountant's
 * engagement-letter template happy-path against the live docker-compose container stack
 * (AUTH_PROVIDER=mock) and writes an AC-tagged screenshot gallery to
 * docs/demos/EPIC-005/. NON-GATING.
 *
 * Persona: jane-accountant (.planning/personas/jane-accountant.md)
 * Flows:   flow-onboarding     (.planning/flows/flow-onboarding.md)
 *          flow-first-sign-in  (.planning/flows/flow-first-sign-in.md)
 * Policy:  .orchestration/DEMO-POLICY.md
 *
 * Gallery ordering (EPIC-005 admin surface — screenshots 01–02):
 *   01-AC-IDNT-007-01-default-template-present.png
 *       — accountant opens the letter-template setting page; a non-empty system default
 *         is already present (AC-IDNT-007-01)
 *   02-AC-IDNT-007-02-template-edit-persists.png
 *       — accountant edits the content, saves, and the edit persists after navigation
 *         away and back (AC-IDNT-007-02)
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

// Gallery output dir — repo-root/docs/demos/EPIC-005 (resolved from this file's dir).
// Depth from apps/admin/e2e/demo/ to repo root = ../../../../
const DEMO_DIR = path.resolve(__dirname, "../../../../docs/demos/EPIC-005");
const shot = (file: string) => path.join(DEMO_DIR, file);

// Admin base URL — mirrors playwright.config.ts + auth.ts.
const ADMIN_PORT = process.env["ADMIN_PORT"] ?? "3001";
const ADMIN_URL = process.env["ADMIN_BASE_URL"] ?? `http://localhost:${ADMIN_PORT}`;

// Unique content helper — avoids cross-test interference when the DB is shared.
function uniqueContent(prefix: string): string {
  return `${prefix} — demo edit ${Date.now()}.${Math.random().toString(36).slice(2, 6)}`;
}

// ─── Screen 01: Default template present out of the box (AC-IDNT-007-01) ──────

test(
  "[AC-IDNT-007-01] @demo 01 — jane-accountant: default engagement-letter template is present out of the box",
  async ({ page, request }) => {
    // Screen 01: ACCOUNTANT opens the engagement-letter template setting page.
    // A system-provided default template is already present — not empty.
    // Proves AC-IDNT-007-01: no manual authoring needed to get started.

    try {
      await setupAccountantSession(page, request);
      await page.goto(`${ADMIN_URL}/settings/letter-template`);

      // The template editor must be visible — AC-IDNT-007-01
      const templateTextarea = page.locator('[data-testid="template-content"]');
      await expect(
        templateTextarea,
        "template-content textarea must be visible (AC-IDNT-007-01)",
      ).toBeVisible({ timeout: 15_000 });

      // The textarea must contain non-empty content (system default present — AC-IDNT-007-01)
      const defaultContent = await templateTextarea.inputValue();
      expect(
        defaultContent.trim().length,
        "System default template must be non-empty (AC-IDNT-007-01)",
      ).toBeGreaterThan(0);

      // Screenshot 01: template editor with system default content visible
      await page.screenshot({
        path: shot("01-AC-IDNT-007-01-default-template-present.png"),
        fullPage: true,
      });
    } finally {
      await clearSession(page);
    }
  },
);

// ─── Screen 02: Accountant edits the template and the edit persists (AC-IDNT-007-02) ─

test(
  "[AC-IDNT-007-02] @demo 02 — jane-accountant: edits the engagement-letter template and the edit persists",
  async ({ page, request }) => {
    // Screen 02: ACCOUNTANT opens the engagement-letter template setting page,
    // fills in new content, clicks Save, navigates away and back, and sees the
    // edited content still present.
    // Proves AC-IDNT-007-02: edited content is retained as the current template.

    // DECISION (TASK-005-008): We use uniqueContent() to produce a deterministic
    // (per-run) value that will not collide across parallel demo runs or leave a
    // predictable string that a prior test might have set. The timestamp+random
    // suffix guarantees visual distinctness of the screenshot. We do NOT restore
    // the original default after the demo run — the template is overwritten and
    // will be reset by the next `pnpm db:seed`. This is consistent with the
    // onboarding-cross-app.spec.ts pattern (also leaves the template overwritten
    // after the test). The demo is non-gating; DB hygiene is owned by re-seeding.

    const editedContent = uniqueContent("[AC-IDNT-007-02] Jane's Demo Template Edit");

    try {
      await setupAccountantSession(page, request);
      await page.goto(`${ADMIN_URL}/settings/letter-template`);

      // The template editor must be visible
      const templateTextarea = page.locator('[data-testid="template-content"]');
      await expect(
        templateTextarea,
        "template-content textarea must be visible before editing",
      ).toBeVisible({ timeout: 15_000 });

      // When: accountant fills in the new content
      await templateTextarea.fill(editedContent);

      // The save button must be visible
      const saveButton = page.locator('button:has-text("Save template")');
      await expect(
        saveButton,
        "'Save template' button must be visible (AC-IDNT-007-02)",
      ).toBeVisible({ timeout: 10_000 });

      // When: accountant clicks Save
      await saveButton.click();

      // Then: a success banner appears confirming the save — AC-IDNT-007-02
      await expect(
        page.locator('[role="status"]:has-text("Template saved successfully")'),
        "Success banner must appear after saving (AC-IDNT-007-02)",
      ).toBeVisible({ timeout: 10_000 });

      // Navigate away and back to confirm persistence
      await page.goto(`${ADMIN_URL}/settings`);
      await page.goto(`${ADMIN_URL}/settings/letter-template`);

      // Then: the edited content must still be present — AC-IDNT-007-02
      const retainedTextarea = page.locator('[data-testid="template-content"]');
      await expect(
        retainedTextarea,
        "template-content textarea must be visible after returning to page",
      ).toBeVisible({ timeout: 15_000 });

      const retainedContent = await retainedTextarea.inputValue();
      expect(
        retainedContent.trim(),
        "Retained template content must match what was saved (AC-IDNT-007-02)",
      ).toBe(editedContent.trim());

      // Screenshot 02: editor showing the retained edited content after save + navigate-back
      await page.screenshot({
        path: shot("02-AC-IDNT-007-02-template-edit-persists.png"),
        fullPage: true,
      });
    } finally {
      await clearSession(page);
    }
  },
);
