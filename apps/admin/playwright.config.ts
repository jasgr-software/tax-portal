/**
 * apps/admin/playwright.config.ts — Playwright e2e config for the Tax Portal (admin)
 *
 * ADR-006: Each app has its own Playwright config; e2e runs against the full
 *          docker-compose stack (SQL Server + admin container), NOT a dev server.
 * ADR-010: apps/admin has no public routes — every path requires ACCOUNTANT auth.
 *          Auth middleware lands in TASK-004-002; smoke spec probes /healthz (no-auth endpoint).
 * ADR-012: Tier-6 e2e — full stack; Chromium only; @smoke subset = required-on-PR subset.
 *
 * Base URL: http://localhost:3001 — the admin container (docker-compose admin service).
 * Reporters: list (CI) + html (local); JUnit for CI evidence.
 *
 * Mirrors apps/portal/playwright.config.ts (CLAUDE.md § Platform-frontend scope).
 */

import { defineConfig, devices } from "@playwright/test";
import path from "path";

// Load .env.local at repo root host-side so fixture vars (DATABASE_URL_ADMIN) work
// locally without a manual export. Guarded + best-effort: if the var is already set
// (CI injects it) or the file is absent, this is a no-op.
// Native process.loadEnvFile (Node ≥20.12) — same pattern as apps/portal config.
const dotenvPath = path.resolve(__dirname, "../../.env.local");
try {
  (process as NodeJS.Process & { loadEnvFile?: (p: string) => void }).loadEnvFile?.(dotenvPath);
} catch {
  // .env.local absent (e.g. CI) — env comes from the container/shell. Ignore.
}

// Derive the admin base URL from ADMIN_BASE_URL or ADMIN_PORT (docker-compose port mapping).
// When ADMIN_PORT is set in .env.local (e.g. 13001, to avoid conflict with another service),
// the Playwright base URL automatically follows. ADMIN_BASE_URL takes precedence.
const ADMIN_PORT = process.env["ADMIN_PORT"] ?? "3001";
const ADMIN_BASE_URL =
  process.env["ADMIN_BASE_URL"] ?? `http://localhost:${ADMIN_PORT}`;

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",

  // Run all tests in each file sequentially; single worker for compose stack stability.
  fullyParallel: false,
  workers: 1,

  // Fail the entire run on the first test suite failure in CI.
  retries: process.env["CI"] ? 1 : 0,

  // Global timeout per test.
  timeout: 30_000,

  // Base URL: the admin container (or dev server when running locally without Docker).
  use: {
    baseURL: ADMIN_BASE_URL,

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
  // stack (container SUT). Run `docker compose up -d` before e2e.
  // For local ad-hoc dev-server runs, set ADMIN_BASE_URL=http://localhost:3001
  // and run `pnpm dev:admin` separately.
});
