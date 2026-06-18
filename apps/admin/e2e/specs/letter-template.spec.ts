/**
 * apps/admin/e2e/specs/letter-template.spec.ts
 *
 * Tier-6 e2e — Accountant engagement-letter template setting.
 *
 * Acceptance criteria covered (EPIC-005):
 *   AC-IDNT-007-01 — a system-provided default template exists out of the box (e2e surface)
 *   AC-IDNT-007-02 — accountant edits the template's content and saves; edit persists (e2e surface)
 *
 * Gherkin binding (prose-bound until Cucumber tooling lands — CLAUDE.md § Executable gherkin tooling):
 *   Scenario: A default letter template exists out of the box
 *   Scenario: Accountant edits the letter template
 *
 * Note: AC-IDNT-007-03 (the edited template is what the client signs) is the cross-app
 * scenario and is covered in apps/portal/e2e/specs/onboarding-cross-app.spec.ts.
 *
 * Stack: admin container at http://localhost:13001 (ADMIN_PORT env), AUTH_PROVIDER=mock.
 *
 * Run:
 *   pnpm --filter admin e2e:run -- --grep 'letter-template'
 *
 * ADR-006: Letter template setting is admin-only; clients never reach this surface.
 * ADR-012: Tier-6 e2e.
 */

import { test, expect } from "@playwright/test";
import { setupAccountantSession, clearSession } from "../fixtures/auth.js";

const ADMIN_PORT = process.env["ADMIN_PORT"] ?? "3001";
const ADMIN_URL = process.env["ADMIN_BASE_URL"] ?? `http://localhost:${ADMIN_PORT}`;

// ─── Unique content helper ─────────────────────────────────────────────────────

function uniqueContent(prefix: string): string {
  return `${prefix} — e2e test edit ${Date.now()}`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// AC-IDNT-007-01 — Default template present out of the box
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("[AC-IDNT-007-01] default engagement-letter template is present out of the box", () => {
  /**
   * Gherkin (EPIC-005 § Acceptance scenarios — verbatim):
   * Given a fresh portal with no accountant-authored letter
   * When the accountant opens the engagement-letter template setting
   * Then a system-provided default engagement-letter template is already present
   *
   * Note: the DB is seeded with the default template row (packages/db seed script).
   * This test verifies the page renders non-empty content — i.e. the template row
   * was seeded. The exact content is not asserted here (it may change); only that
   * something is present (non-empty textarea).
   */

  test.beforeEach(async ({ page, request }) => {
    await setupAccountantSession(page, request);
  });

  test.afterEach(async ({ page }) => {
    await clearSession(page);
  });

  test("[AC-IDNT-007-01] letter template page shows a non-empty system default", async ({ page }) => {
    // Given: a fresh portal with a system-seeded template
    // When: the accountant opens the engagement-letter template setting
    await page.goto(`${ADMIN_URL}/settings/letter-template`);

    // Then: the template editor is visible
    const templateTextarea = page.locator('[data-testid="template-content"]');
    await expect(templateTextarea).toBeVisible();

    // Then: the textarea contains non-empty content (system default present)
    const content = await templateTextarea.inputValue();
    expect(content.trim().length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// AC-IDNT-007-02 — Accountant edits the letter template and the edit persists
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("[AC-IDNT-007-02] accountant edits the template and the edit persists", () => {
  /**
   * Gherkin (EPIC-005 § Acceptance scenarios — verbatim):
   * Given the engagement-letter template setting
   * When the accountant edits the template's content and saves
   * Then the edited content is retained as the current template
   */

  test.beforeEach(async ({ page, request }) => {
    await setupAccountantSession(page, request);
  });

  test.afterEach(async ({ page }) => {
    await clearSession(page);
  });

  test("[AC-IDNT-007-02] edited template content is retained after saving", async ({ page }) => {
    // Given: the engagement-letter template setting page
    await page.goto(`${ADMIN_URL}/settings/letter-template`);

    const templateTextarea = page.locator('[data-testid="template-content"]');
    await expect(templateTextarea).toBeVisible();

    // When: the accountant edits the template content and saves
    const newContent = uniqueContent("E2E Test Template Content [AC-IDNT-007-02]");
    await templateTextarea.fill(newContent);

    // Click Save
    const saveButton = page.locator('button:has-text("Save template")');
    await expect(saveButton).toBeVisible();
    await saveButton.click();

    // Then: a success banner appears (the action returned success)
    await expect(page.locator('[role="status"]:has-text("Template saved successfully")'))
      .toBeVisible({ timeout: 10_000 });

    // Then: navigate away and back — the edited content is retained
    await page.goto(`${ADMIN_URL}/settings`);
    await page.goto(`${ADMIN_URL}/settings/letter-template`);

    const retainedContent = await page
      .locator('[data-testid="template-content"]')
      .inputValue();
    expect(retainedContent.trim()).toBe(newContent.trim());
  });
});
