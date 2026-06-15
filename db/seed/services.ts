/**
 * db/seed/services.ts — Seed data for the Service catalog
 *
 * AC-DOOR-001-02: Active services displayed on the services page.
 * AC-DOOR-002-04: Deactivated services NOT displayed (at least one inactive service seeded
 *                 so TASK-005 e2e can verify the exclusion).
 * AC-DOOR-003-04: Deactivated services excluded from the request form checklist.
 *
 * Seeds:
 *   - Multiple active services (displayed on services page and request form)
 *   - At least one inactive service (must NOT appear on services page or request form)
 *
 * DECISION: Using raw mssql MERGE via getAdminPool() — same pattern as the repositories
 * (pragmatic workaround for the Prisma 5.22.0 sqlserver port-parsing limitation noted in
 * TASK-002/TASK-003 Work Logs). The MERGE is idempotent — safe to re-run.
 *
 * Called by: scripts/db-seed.ts
 */

import { getAdminPool } from "../../packages/db/src/admin-connection.js";

interface ServiceSeedInput {
  name: string;
  description: string | null;
  active: boolean;
  sortOrder: number;
}

const SERVICES: ServiceSeedInput[] = [
  // ── Active services ──────────────────────────────────────────────────────────
  {
    name: "Individual Tax Return Preparation",
    description:
      "Federal and state income tax return preparation for individuals (Form 1040 and related schedules).",
    active: true,
    sortOrder: 10,
  },
  {
    name: "Business Tax Return Preparation",
    description:
      "Tax return preparation for small businesses including S-Corps, C-Corps, partnerships, and LLCs.",
    active: true,
    sortOrder: 20,
  },
  {
    name: "Tax Planning",
    description:
      "Year-round proactive tax planning to minimize your tax liability and avoid surprises at filing time.",
    active: true,
    sortOrder: 30,
  },
  {
    name: "IRS Correspondence & Audit Support",
    description:
      "Representation and support for IRS notices, correspondence, and audit examinations.",
    active: true,
    sortOrder: 40,
  },
  {
    name: "Bookkeeping",
    description:
      "Monthly or quarterly bookkeeping services to keep your financial records accurate and up to date.",
    active: true,
    sortOrder: 50,
  },
  // ── Inactive service (at least one required — AC-DOOR-002-04 / AC-DOOR-003-04) ──
  {
    // This service is deactivated — must NOT appear on the services page or request form.
    // Seeded so TASK-005 e2e tests can verify the active-only filter.
    name: "Estate Tax Return",
    description:
      "Estate and gift tax return preparation (Form 706/709). Currently not accepting new engagements.",
    active: false,
    sortOrder: 999,
  },
];

/**
 * Upserts seed services using MERGE — idempotent, safe to re-run.
 * Uses name as the merge key (names are stable in seed data).
 */
export async function seedServices(): Promise<void> {
  const pool = await getAdminPool();

  console.warn("[seed/services] Upserting", SERVICES.length, "services...");

  for (const svc of SERVICES) {
    await pool
      .request()
      .input("name", svc.name)
      .input("description", svc.description)
      .input("active", svc.active ? 1 : 0)
      .input("sortOrder", svc.sortOrder).query(`
        MERGE [dbo].[Service] AS target
        USING (SELECT @name AS [name]) AS source
          ON target.[name] = source.[name]
        WHEN MATCHED THEN
          UPDATE SET
            [description] = @description,
            [active]      = @active,
            [sortOrder]   = @sortOrder,
            [updatedAt]   = SYSDATETIMEOFFSET()
        WHEN NOT MATCHED THEN
          INSERT ([name], [description], [active], [sortOrder], [updatedAt])
          VALUES (@name, @description, @active, @sortOrder, SYSDATETIMEOFFSET());
      `);
  }

  console.warn(
    "[seed/services] Done. Seeded",
    SERVICES.length,
    "services (1 inactive, rest active).",
  );
}
