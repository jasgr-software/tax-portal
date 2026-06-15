#!/usr/bin/env tsx
/**
 * scripts/db-seed.ts — Local development seed runner
 *
 * Seeds the local database with:
 *   - Service catalog (active + at least one inactive — TASK-004)
 *
 * Usage:
 *   pnpm db:seed           # Seed all data
 *
 * Environment:
 *   DATABASE_URL_ADMIN — required (admin pool for seed writes)
 *
 * Design:
 *   Each seeder is idempotent (MERGE on stable keys). Re-running is safe.
 *   Seeders run sequentially to respect FK ordering.
 */

import { seedServices } from "../db/seed/services.js";
import { closeAdminPool } from "../packages/db/src/admin-connection.js";

async function main(): Promise<void> {
  console.warn("=== tax-portal seed runner ===");

  if (!process.env["DATABASE_URL_ADMIN"]) {
    throw new Error(
      "DATABASE_URL_ADMIN is required for seed (ADR-007: SQL authentication). " +
        "Copy .env.example to .env.local and set the variable.",
    );
  }

  try {
    await seedServices();
  } finally {
    await closeAdminPool();
  }

  console.warn("=== seed complete ===");
}

main().catch((err) => {
  console.error("\n[seed ERROR]", err instanceof Error ? err.message : err);
  process.exit(1);
});
