/**
 * apps/admin/e2e/fixtures/base.ts — Base Playwright fixture for Tax Portal (admin) e2e
 *
 * Mirrors apps/portal/e2e/fixtures/ shape (CLAUDE.md § Platform-frontend scope).
 *
 * For this scaffold task the fixture is minimal — it exports the Playwright test/expect
 * objects re-exported from @playwright/test so all admin e2e specs import from a consistent
 * local alias. Auth-specific fixtures (accountant session, Clerk mock) land in TASK-004-002.
 *
 * // DECISION (TASK-004-002): The accountant auth fixture will be added here once
 * // packages/auth and Clerk middleware are wired. Specs that require auth will extend
 * // this base fixture with the authenticated page context.
 */

export { test, expect } from "@playwright/test";
