#!/usr/bin/env tsx
/**
 * scripts/db-seed.ts — Local development seed runner
 *
 * Seeds the local database with:
 *   - Service catalog (active + at least one inactive — TASK-004)
 *
 * Usage:
 *   pnpm db:seed           # Seed services only (minimal, default)
 *   pnpm db:seed:demo      # Seed services + full demo practice data
 *
 * Flags:
 *   --demo    Run the demo data pipeline (clients, engagements, onboarding,
 *             questionnaire templates/answers, document requests/docs, notifications).
 *             Implies services seed (services always run first for FK safety).
 *
 * Environment:
 *   DATABASE_URL_ADMIN — required (admin pool for seed writes)
 *
 * Design:
 *   Each seeder is idempotent (MERGE on stable keys). Re-running is safe.
 *   Seeders run sequentially to respect FK ordering.
 */

import path from "path";

// Self-load .env.local host-side so `pnpm db:seed` / `pnpm db:seed:demo` work
// without a manual `export DATABASE_URL_ADMIN=...` step. Uses Node 20.6+ built-in
// process.loadEnvFile — no dotenv dependency. Ignore-if-absent (CI has env injected).
// Same pattern as apps/admin/playwright.config.ts and scripts/demo-stage.ts.
const dotenvPath = path.resolve(
  new URL(import.meta.url).pathname,
  "../../.env.local",
);
try {
  (process as NodeJS.Process & { loadEnvFile?: (p: string) => void })
    .loadEnvFile?.(dotenvPath);
} catch {
  // .env.local absent or loadEnvFile unavailable — env comes from shell. Ignore.
}

import { seedServices } from "../db/seed/services.js";
import { seedDemo } from "../db/seed/demo/index.js";
import { closeAdminPool } from "../packages/db/src/admin-connection.js";

const isDemo = process.argv.includes("--demo");

async function main(): Promise<void> {
  console.warn("=== tax-portal seed runner ===");

  if (!process.env["DATABASE_URL_ADMIN"]) {
    throw new Error(
      "DATABASE_URL_ADMIN is required for seed (ADR-007: SQL authentication). " +
        "Copy .env.example to .env.local and set the variable.",
    );
  }

  try {
    if (isDemo) {
      // Demo pipeline: services + full practice data (clients, engagements, onboarding, etc.)
      await seedDemo();
    } else {
      // Default: services only (minimal — does not pollute dev DB with demo clutter)
      await seedServices();
    }
  } finally {
    await closeAdminPool();
  }

  console.warn("=== seed complete ===");
}

main().catch((err) => {
  console.error("\n[seed ERROR]", err instanceof Error ? err.message : err);
  process.exit(1);
});
