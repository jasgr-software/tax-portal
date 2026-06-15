/**
 * apps/portal/playwright.config.ts — Playwright e2e config for the Client Portal
 *
 * ADR-006: Each app has its own Playwright config; e2e runs against the full
 *          docker-compose stack (SQL Server + portal container), NOT a dev server.
 * ADR-012: Tier-6 e2e — full stack; Chromium only; @smoke subset = required-on-PR subset.
 * TASK-005: Introduces the portal e2e gate.
 *
 * Base URL: http://localhost:3000 — the portal container (TASK-004 docker-compose service).
 * Reporters: list (CI) + html (local); JUnit for CI evidence.
 */

import { defineConfig, devices } from "@playwright/test";
import path from "path";

// E2e-specific env path: load .env.local at project root for DATABASE_URL_ADMIN
// (fixture helper needs admin pool for the accountant-readable assertion).
// dotenv is used only if the var isn't already set (e.g., in CI via docker-compose env).
const dotenvPath = path.resolve(__dirname, "../../.env.local");

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",

  // Run all tests in each file in parallel; disable parallelism within a test
  // for the compose stack to avoid flaky concurrent DB writes on the happy-path submit.
  fullyParallel: false,
  workers: 1,

  // Fail the entire run on the first test suite failure in CI (keeps logs short).
  // Locally developers may want retries — set PW_RETRIES=2 env var to override.
  retries: process.env["CI"] ? 1 : 0,

  // Global timeout per test (30 s is generous for a local stack).
  timeout: 30_000,

  // Base URL: the portal container (or dev server when running locally without Docker).
  use: {
    baseURL: process.env["PORTAL_BASE_URL"] ?? "http://localhost:3000",

    // Capture traces on first retry to aid debugging.
    trace: "on-first-retry",

    // Screenshot on failure.
    screenshot: "only-on-failure",

    // Chromium only — ADR-012 / ADR-006.
    ...devices["Desktop Chrome"],
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  // Artifacts directory (gitignored).
  outputDir: "./test-results",

  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
    ["junit", { outputFile: "test-results/results.xml" }],
  ],

  // NOTE: webServer is intentionally omitted — this config targets the docker-compose
  // stack (container SUT). Run `docker compose up -d` + `pnpm db:seed` before e2e.
  // For local ad-hoc dev-server runs, set PORTAL_BASE_URL=http://localhost:3000
  // and run `pnpm dev:portal` separately.
});
