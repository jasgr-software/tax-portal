#!/usr/bin/env tsx
/**
 * scripts/demo-stage.ts — Codified demo staging script
 *
 * Clears app-table data (FK-safe, scoped DELETE — NOT a volume wipe) and
 * reseeds the local database with a full, believable demo dataset for phase
 * close-out walkthrough recordings.
 *
 * Usage:
 *   pnpm demo:stage
 *
 * What it does:
 *   1. Self-loads .env.local via Node 20.6+ process.loadEnvFile (ignore-if-absent).
 *   2. Guardrail: refuses to run unless DATABASE_URL_ADMIN points at a local host.
 *   3. Deletes transactional/clutter rows in FK-safe child-to-parent order.
 *   4. Runs seedServices() + the full demo seed pipeline (clients, engagements,
 *      onboarding, notifications).
 *
 * System-default rows that SURVIVE the clean:
 *   - LetterTemplate (isSystemDefault = 1) — seeded by migration 0003; the
 *     scoped delete skips it (WHERE isSystemDefault = 0). The onboarding flow
 *     requires this row to exist, so we never touch it.
 *   - QuestionnaireTemplate rows — cleared because they are fully MERGE-seeded
 *     by the demo seeder on every run. No migration inserts them; the demo
 *     seeder is the authoritative source. Clearing + re-seeding is idempotent.
 *   - Service rows — left intact (MERGE-seeded by seedServices). No clear needed.
 *
 * Guardrail (fail-closed):
 *   Allowed DB hosts: localhost, 127.0.0.1, ::1, sqlserver, tax-portal-sqlserver.
 *   If the host resolves to anything else (or DATABASE_URL_ADMIN is unset, or
 *   NODE_ENV=production), the script prints a clear refusal and exits 1 without
 *   touching the DB.
 *
 * Constraints:
 *   - NEVER calls docker compose down, drops databases, or wipes volumes.
 *   - Schema and migrations remain intact; only DATA rows are cleared and reseeded.
 *   - ASCII-only strings.
 *   - Re-running is safe (idempotent clean + MERGE-based seed).
 */

import path from "path";
import mssqlPkg from "mssql";
import { parseSqlServerUrl } from "../packages/db/src/sql-server-url.js";
import { getAdminPool, closeAdminPool } from "../packages/db/src/admin-connection.js";
import { seedDemo } from "../db/seed/demo/index.js";

const { Request: MssqlRequest } = mssqlPkg;

// ─── Step 1: Self-load .env.local (Node 20.6+ built-in, ignore-if-absent) ─────
// Same pattern as apps/admin/playwright.config.ts lines ~19-27.
// No dotenv dependency required.
const dotenvPath = path.resolve(
  new URL(import.meta.url).pathname,
  "../../.env.local",
);
try {
  (process as NodeJS.Process & { loadEnvFile?: (p: string) => void })
    .loadEnvFile?.(dotenvPath);
} catch {
  // .env.local absent (e.g. CI) or loadEnvFile unavailable — env comes from shell. Ignore.
}

// ─── Allowed local DB hosts (guardrail allowlist) ──────────────────────────────

const ALLOWED_LOCAL_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "sqlserver",                // docker-compose service name
  "tax-portal-sqlserver",     // docker container name variant
]);

/**
 * Guardrail: parse DATABASE_URL_ADMIN and refuse to run unless the DB host is
 * in the local allowlist.
 *
 * Hard fail-closed: exits 1 if:
 *   - DATABASE_URL_ADMIN is unset
 *   - NODE_ENV === 'production'
 *   - The parsed host is not in ALLOWED_LOCAL_HOSTS
 *
 * Returns the parsed URL string (valid) for pool construction — the pool is
 * created lazily via getAdminPool() which re-reads the env var, so we just
 * validate here.
 */
function guardrailCheck(): void {
  // Production env guard
  if (process.env["NODE_ENV"] === "production") {
    console.error(
      "[demo-stage] GUARDRAIL BLOCKED: NODE_ENV=production detected.\n" +
        "  This script must NOT run in production. Aborting without touching the DB.",
    );
    process.exit(1);
  }

  const dbUrl = process.env["DATABASE_URL_ADMIN"];
  if (!dbUrl) {
    console.error(
      "[demo-stage] GUARDRAIL BLOCKED: DATABASE_URL_ADMIN is not set.\n" +
        "  Copy .env.example to .env.local and configure the variable.",
    );
    process.exit(1);
  }

  // Parse just the host out of the URL (reuse the shared parser)
  let host: string;
  try {
    const config = parseSqlServerUrl(dbUrl);
    host = config.server ?? "";
  } catch (err) {
    console.error(
      "[demo-stage] GUARDRAIL BLOCKED: Could not parse DATABASE_URL_ADMIN.\n" +
        "  Ensure the URL is a valid sqlserver:// connection string.\n" +
        "  Parse error:",
      err instanceof Error ? err.message : err,
    );
    process.exit(1);
  }

  const normalizedHost = host.toLowerCase().trim();
  if (!ALLOWED_LOCAL_HOSTS.has(normalizedHost)) {
    console.error(
      `[demo-stage] GUARDRAIL BLOCKED: DATABASE_URL_ADMIN points to host "${host}".\n` +
        `  Allowed local hosts: ${[...ALLOWED_LOCAL_HOSTS].join(", ")}.\n` +
        "  This script only runs against a local database. Aborting without touching the DB.",
    );
    process.exit(1);
  }

  console.warn(
    `[demo-stage] Guardrail passed. DB host "${host}" is local. Proceeding.`,
  );
}

// ─── Step 2: Scoped FK-safe clean ─────────────────────────────────────────────

/**
 * Deletes all transactional/clutter app-data rows in child-to-parent FK order.
 *
 * Deletion order (child -> parent, respecting FK constraints):
 *   1. Notification          — FK to EngagementRequest (SetNull on delete, but we delete rows)
 *   2. Document              — FK to Engagement + DocumentRequest
 *   3. QuestionnaireAnswer   — FK to Engagement + QuestionnaireTemplate
 *   4. DocumentRequest       — FK to Engagement
 *   5. QuestionnaireTemplate — FK to Service (no child FK dependencies remaining after step 3)
 *   6. Engagement            — FK to EngagementRequest + User
 *   7. EngagementRequestService — FK to EngagementRequest + Service
 *   8. EngagementRequest     — no remaining child dependencies
 *   9. User (CLIENT only)    — delete CLIENT role rows only (no ACCOUNTANT rows touched)
 *
 * Tables intentionally NOT cleared:
 *   - Service                — MERGE-seeded; clearing would require re-migration. Left intact.
 *   - LetterTemplate (isSystemDefault=1) — migration-seeded system row; must survive.
 *     We clear non-system rows (isSystemDefault=0) only in case test runs created extras.
 *     The default row is preserved so the onboarding flow continues to work.
 *
 * Prints a one-line summary per table (rows deleted).
 */
async function cleanAppData(): Promise<void> {
  const pool = await getAdminPool();

  console.warn("[demo-stage] --- Cleaning app data (FK-safe scoped delete) ---");

  type TableClean = {
    label: string;
    sql: string;
  };

  const steps: TableClean[] = [
    {
      label: "Notification",
      sql: "DELETE FROM [dbo].[Notification]",
    },
    {
      label: "Document",
      sql: "DELETE FROM [dbo].[Document]",
    },
    {
      label: "QuestionnaireAnswer",
      sql: "DELETE FROM [dbo].[QuestionnaireAnswer]",
    },
    {
      label: "DocumentRequest",
      sql: "DELETE FROM [dbo].[DocumentRequest]",
    },
    {
      label: "QuestionnaireTemplate",
      sql: "DELETE FROM [dbo].[QuestionnaireTemplate]",
    },
    {
      label: "Engagement",
      sql: "DELETE FROM [dbo].[Engagement]",
    },
    {
      label: "EngagementRequestService",
      sql: "DELETE FROM [dbo].[EngagementRequestService]",
    },
    {
      label: "EngagementRequest",
      sql: "DELETE FROM [dbo].[EngagementRequest]",
    },
    {
      label: "User (CLIENT only)",
      // Only delete CLIENT-role rows — leave the ACCOUNTANT row (if any) untouched
      sql: "DELETE FROM [dbo].[User] WHERE [role] = N'CLIENT'",
    },
    {
      // Clear only non-system LetterTemplate rows (accountant-edited duplicates, test artifacts).
      // The migration-seeded isSystemDefault=1 row is preserved so the onboarding flow works.
      label: "LetterTemplate (non-system only)",
      sql: "DELETE FROM [dbo].[LetterTemplate] WHERE [isSystemDefault] = 0",
    },
  ];

  for (const step of steps) {
    const req = new MssqlRequest(pool);
    const result = await req.query(step.sql);
    const rowsAffected = result.rowsAffected[0] ?? 0;
    console.warn(
      `[demo-stage]   ${step.label}: ${rowsAffected} row(s) deleted`,
    );
  }

  console.warn("[demo-stage] --- Clean complete ---");
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.warn("=== demo-stage: Tax Portal demo staging script ===");
  console.warn(
    "[demo-stage] This script clears app-data rows and reseeds a full demo dataset.",
  );
  console.warn(
    "[demo-stage] It does NOT drop the database, wipe volumes, or restart containers.",
  );

  // Step 1: Guardrail — refuse to run against non-local DB
  guardrailCheck();

  try {
    // Step 2: Scoped FK-safe clean
    await cleanAppData();

    // Step 3: Reseed services (base catalog) + full demo pipeline.
    // seedDemo() calls seedServices() first internally, so Service rows are
    // MERGE-upserted before any FK-dependent rows are inserted.
    console.warn("[demo-stage] --- Seeding demo data ---");
    await seedDemo();

    console.warn("[demo-stage] --- Seed complete ---");
  } finally {
    await closeAdminPool();
  }

  console.warn("=== demo-stage: Done. Local DB is ready for demo walkthrough. ===");
}

main().catch((err) => {
  console.error(
    "\n[demo-stage ERROR]",
    err instanceof Error ? err.message : err,
  );
  process.exit(1);
});
