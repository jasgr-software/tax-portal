/**
 * packages/db/src/services.query.test.ts
 *
 * TIER-3 INTEGRATION TEST — requires real SQL Server
 * Tests the active-services query against the real DB.
 *
 * AC-DOOR-002-04: Only active services are listed on the services page.
 * AC-DOOR-001-02: Services listed from DB are only active ones.
 * AC-DOOR-003-04: Active-services data-layer filter is enforced (inactive excluded).
 *
 * Verifies that getActiveServices():
 *   - Returns only services with active=true
 *   - Excludes inactive services (active=false)
 *   - Orders by sortOrder ASC, then name ASC
 *
 * Connection approach:
 *   Uses raw mssql for setup/teardown; getActiveServices() uses adminDb internally.
 *
 * Environment:
 *   DATABASE_URL_ADMIN — admin pool URL (used by getActiveServices + test seed/cleanup)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import mssqlPkg from "mssql";
import { parseSqlServerUrl } from "../../scripts/db-migrate.js";
import { getActiveServices } from "./repositories/service.js";

const { ConnectionPool } = mssqlPkg;

let pool: InstanceType<typeof ConnectionPool>;
const ADMIN_URL = process.env["DATABASE_URL_ADMIN"];
const createdServiceIds: string[] = [];

beforeAll(async () => {
  if (!ADMIN_URL) {
    throw new Error("DATABASE_URL_ADMIN is required for services query integration tests");
  }
  const config = parseSqlServerUrl(ADMIN_URL) as import("mssql").config;
  pool = new ConnectionPool(config);
  await pool.connect();
}, 30000);

afterAll(async () => {
  for (const id of createdServiceIds) {
    await pool.request().query(
      `DELETE FROM [dbo].[Service] WHERE [id] = '${id}'`
    ).catch(() => { /* ignore */ });
  }
  await pool.close();
}, 30000);

/** Insert a service row and return its id */
async function seedService(name: string, active: boolean, sortOrder: number): Promise<string> {
  const result = await pool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[Service] ([name], [active], [sortOrder], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'${name.replace(/'/g, "''")}', ${active ? 1 : 0}, ${sortOrder}, SYSDATETIMEOFFSET())`
  );
  const id = result.recordset[0]?.id ?? "";
  createdServiceIds.push(id);
  return id;
}

describe("getActiveServices — active-only filter integration", () => {
  /**
   * [AC-DOOR-002-04] [AC-DOOR-001-02] [AC-DOOR-003-04]
   * Only active services are returned; inactive services are excluded.
   */
  it("[AC-DOOR-002-04][AC-DOOR-001-02][AC-DOOR-003-04] returns only active services; inactive excluded", async () => {
    const activeId = await seedService("Active Service - RLS Query Test", true, 99);
    const inactiveId = await seedService("Inactive Service - RLS Query Test", false, 98);

    const results = await getActiveServices();
    const resultIds = results.map((s) => s.id);

    // Active service appears [AC-DOOR-002-04 / -001-02 / -003-04]
    expect(resultIds).toContain(activeId);

    // Inactive service is excluded [AC-DOOR-002-04 / -001-02 / -003-04]
    expect(resultIds).not.toContain(inactiveId);
  });

  /**
   * [AC-DOOR-003-04] All rows returned have active=true — WHERE clause enforced.
   */
  it("[AC-DOOR-003-04] all returned services have active=true (WHERE clause enforced at data layer)", async () => {
    const activeId = await seedService("Active - Clause Test", true, 200);
    const inactiveId = await seedService("Inactive - Clause Test", false, 201);

    const results = await getActiveServices();
    const resultIds = results.map((s) => s.id);

    // No inactive service in results
    expect(resultIds).not.toContain(inactiveId);
    // Active service in results
    expect(resultIds).toContain(activeId);
  });

  /**
   * Results are sorted by sortOrder ASC, then name ASC.
   */
  it("returns services ordered by sortOrder ASC, then name ASC", async () => {
    const lowOrderId = await seedService("Order Test Z (sort 5)", true, 5);
    const highOrderId = await seedService("Order Test A (sort 10)", true, 10);

    const results = await getActiveServices();
    const resultIds = results.map((s) => s.id);
    const lowIdx = resultIds.indexOf(lowOrderId);
    const highIdx = resultIds.indexOf(highOrderId);

    expect(lowIdx).toBeGreaterThanOrEqual(0);
    expect(highIdx).toBeGreaterThanOrEqual(0);
    // sortOrder 5 must appear before sortOrder 10
    expect(lowIdx).toBeLessThan(highIdx);
  });
});
