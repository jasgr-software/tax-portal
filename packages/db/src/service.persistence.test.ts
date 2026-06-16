/**
 * packages/db/src/service.persistence.test.ts
 *
 * TIER-3 INTEGRATION TEST — requires real SQL Server
 *
 * Tests Service write-repository persistence: createService, updateService,
 * deactivateService, listAllServices — run under an ACCOUNTANT request context
 * via withClerkIdentity (ADR-003 § Consequences: test helper pattern).
 *
 * AC-DOOR-002-01: createService persists a new active service (re-readable, active=true)
 * AC-DOOR-002-02: updateService changes name/description and the change survives a re-read
 * AC-DOOR-002-03: deactivateService sets active=false (row NOT deleted — reversible)
 *
 * Trust boundary proof (runtime half of AC-DOOR-002-05):
 *   Each write runs inside withClerkIdentity('user_acct_write_test', 'ACCOUNTANT', fn),
 *   which sets AsyncLocalStorage context → the `db` $extends middleware calls
 *   sp_set_session_context with role='ACCOUNTANT' before the first query → the
 *   sec.fn_service_write_access BLOCK predicate from TASK-002-001 authorizes the write.
 *   A CLIENT context would be rejected (covered by service.rls.test.ts).
 *
 * Connection approach:
 *   - Writes: via the request-scoped `db` Prisma wrapper (SESSION_CONTEXT-aware), wrapped
 *     in withClerkIdentity (ACCOUNTANT) — the exact production path.
 *   - Setup/verification/cleanup: raw mssql admin pool (RLS-exempt, guaranteed re-read
 *     even if RLS filter changes). Mirrors the pattern from engagement-request.persistence.test.ts.
 *
 * URL workaround (matches session-context.propagation.test.ts):
 *   Prisma 5.22.0 ignores port=N in semicolon form. The DATABASE_URL in .env.local
 *   is already in authority form (sqlserver://localhost:14330;...) per TASK-002-002
 *   task spec note — no transformation needed. If still in semicolon form, the
 *   toAuthorityForm() helper converts it before the lazy `db` singleton initializes.
 *
 * DECISION (TASK-002-002): Verification re-reads use the admin pool (not `db`) so the
 * re-read is role-independent and purely tests data persistence, not RLS filtering.
 * This is the cleanest signal: "does the row exist and have the expected values?"
 *
 * DECISION (TASK-002-002): afterEach disconnects the Prisma request pool (same pattern as
 * session-context.propagation.test.ts) to avoid @read_only=1 SESSION_CONTEXT conflicts
 * between tests (error 15664). Each test reconnects fresh on next use.
 *
 * Environment:
 *   DATABASE_URL       — request pool URL (app_user_role; subject to SESSION_CONTEXT)
 *   DATABASE_URL_ADMIN — admin pool URL (sa / app_admin; bypasses RLS, for setup/verify)
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import mssqlPkg from "mssql";
import { parseSqlServerUrl } from "../../scripts/db-migrate.js";
import {
  createService,
  updateService,
  deactivateService,
  listAllServices,
} from "./repositories/service.js";
import { withClerkIdentity } from "./index.js";
import { db } from "./client.js";

const { ConnectionPool } = mssqlPkg;

// ─── URL fixup (authority form so Prisma connector reads port correctly) ───────

/**
 * Transform a semicolon-form sqlserver URL to authority form.
 * Mirrors the helper in session-context.propagation.test.ts.
 *
 * If DATABASE_URL is already in authority form (e.g. sqlserver://localhost:14330;...)
 * this is a no-op. Applied in beforeAll before the lazy `db` singleton is initialized.
 */
function toAuthorityForm(url: string): string {
  const match = url.match(/^(sqlserver:\/\/[^;]+);port=(\d+);(.*)$/i);
  if (!match) return url;
  const [, prefix, port, rest] = match;
  return `${prefix}:${port};${rest}`;
}

// ─── Connection setup ─────────────────────────────────────────────────────────

let adminPool: InstanceType<typeof ConnectionPool>;

const ADMIN_URL = process.env["DATABASE_URL_ADMIN"];
const REQUEST_URL = process.env["DATABASE_URL"];

/** Service IDs created by this test run — cleaned up in afterAll */
const createdServiceIds: string[] = [];

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  if (!ADMIN_URL) {
    throw new Error("DATABASE_URL_ADMIN is required for persistence integration tests");
  }
  if (!REQUEST_URL) {
    throw new Error("DATABASE_URL is required for persistence integration tests");
  }

  // Transform DATABASE_URL to authority form so the lazy `db` singleton picks up
  // the correct port when it initializes on first use inside the test.
  const authorityUrl = toAuthorityForm(REQUEST_URL);
  if (authorityUrl !== REQUEST_URL) {
    process.env["DATABASE_URL"] = authorityUrl;
  }

  // Admin pool for setup/verification/cleanup
  const adminConfig = parseSqlServerUrl(ADMIN_URL) as import("mssql").config;
  adminPool = new ConnectionPool(adminConfig);
  await adminPool.connect();
}, 30000);

afterAll(async () => {
  // Best-effort cleanup of all Service rows created by this test run.
  // Parameterized to avoid interpolated SQL (even though id is test-created).
  for (const id of createdServiceIds) {
    await adminPool
      .request()
      .input("id", id)
      .query("DELETE FROM [dbo].[Service] WHERE [id] = @id")
      .catch(() => {
        /* ignore — best-effort */
      });
  }
  await adminPool.close().catch(() => {
    /* ignore */
  });
}, 30000);

/**
 * Disconnect the Prisma request pool after each test.
 *
 * DECISION (TASK-002-002): Same pattern as session-context.propagation.test.ts.
 * The $extends middleware sets SESSION_CONTEXT with @read_only = 1. Disconnecting
 * forces the pool to release all connections; the next test reconnects fresh with
 * a clean SESSION_CONTEXT state — avoids error 15664 across test runs.
 */
afterEach(async () => {
  await (db as unknown as { $disconnect: () => Promise<void> }).$disconnect();
}, 10000);

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Verify a Service row via the admin pool (RLS-exempt re-read). */
async function readServiceAdmin(id: string): Promise<{
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  sortOrder: number;
} | null> {
  const result = await adminPool
    .request()
    .query<{
      id: string;
      name: string;
      description: string | null;
      active: boolean;
      sortOrder: number;
    }>(
      `SELECT [id], [name], [description],
              CAST([active] AS BIT) AS [active], [sortOrder]
       FROM [dbo].[Service]
       WHERE [id] = '${id}'`
    );
  return result.recordset[0] ?? null;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Service write repository — TIER-3 persistence (real SQL Server, ACCOUNTANT context)", () => {

  /**
   * [AC-DOOR-002-01] createService persists a new active service and it is re-readable.
   *
   * Proof of trust boundary (runtime half of AC-DOOR-002-05):
   *   withClerkIdentity('user_acct_write_test', 'ACCOUNTANT', fn) sets AsyncLocalStorage
   *   context → the `db` $extends middleware calls sp_set_session_context(role='ACCOUNTANT')
   *   before the INSERT → sec.fn_service_write_access authorizes the write.
   */
  it("[AC-DOOR-002-01] createService persists a new active service and it is re-readable", async () => {
    const uniqueName = `Persistence Test — Create [${Date.now()}]`;

    const created = await withClerkIdentity(
      "user_acct_write_test",
      "ACCOUNTANT",
      () => createService({ name: uniqueName, description: "Created by AC-DOOR-002-01 test", sortOrder: 5 }),
    );

    // Track for cleanup
    createdServiceIds.push(created.id);

    // Verify returned values
    expect(created.id).toBeTruthy();
    expect(created.name).toBe(uniqueName);
    expect(created.description).toBe("Created by AC-DOOR-002-01 test");
    expect(created.active).toBe(true); // AC-DOOR-002-01: new service must be active
    expect(created.sortOrder).toBe(5);

    // Re-read via admin pool to verify persistence (AC-DOOR-002-01: "re-readable")
    const row = await readServiceAdmin(created.id);
    expect(row, "Row must exist in DB after createService").not.toBeNull();
    expect(row?.name).toBe(uniqueName);
    expect(row?.description).toBe("Created by AC-DOOR-002-01 test");
    expect(row?.active).toBe(true); // [AC-DOOR-002-01]
    expect(row?.sortOrder).toBe(5);
  });

  /**
   * [AC-DOOR-002-02] updateService changes name/description and the change survives a re-read.
   *
   * Seeds a row via admin pool, then updates it via the request-scoped `db` wrapper
   * with ACCOUNTANT context, then re-reads via admin pool to verify persistence.
   */
  it("[AC-DOOR-002-02] updateService changes name/description and the change survives a re-read", async () => {
    // Seed a row via admin pool (bypasses RLS so no context needed for setup)
    const seedResult = await adminPool.request().query<{ id: string }>(
      `INSERT INTO [dbo].[Service] ([name], [active], [sortOrder], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES (N'Persistence Test — Before Update [${Date.now()}]', 1, 0, SYSDATETIMEOFFSET())`
    );
    // DECISION (TASK-002-002): raw mssql returns UUIDs uppercase; Prisma normalizes to lowercase.
    // Normalize seedId to lowercase so ID comparisons with Prisma return values are consistent.
    const seedId = (seedResult.recordset[0]?.id ?? "").toLowerCase();
    expect(seedId).toBeTruthy();
    createdServiceIds.push(seedId);

    // Update via request-scoped `db` (ACCOUNTANT context)
    const updated = await withClerkIdentity(
      "user_acct_write_test",
      "ACCOUNTANT",
      () =>
        updateService({
          id: seedId,
          name: "Persistence Test — After Update",
          description: "Updated description for AC-DOOR-002-02",
          sortOrder: 10,
        }),
    );

    expect(updated.id).toBe(seedId);
    expect(updated.name).toBe("Persistence Test — After Update");
    expect(updated.description).toBe("Updated description for AC-DOOR-002-02");
    expect(updated.sortOrder).toBe(10);

    // Re-read via admin pool — verify the update survived persistence (AC-DOOR-002-02)
    const row = await readServiceAdmin(seedId);
    expect(row, "Row must still exist after updateService").not.toBeNull();
    expect(row?.name).toBe("Persistence Test — After Update"); // [AC-DOOR-002-02]
    expect(row?.description).toBe("Updated description for AC-DOOR-002-02"); // [AC-DOOR-002-02]
    expect(row?.sortOrder).toBe(10);
    expect(row?.active).toBe(true); // updateService must not change the active flag
  });

  /**
   * [AC-DOOR-002-03] deactivateService sets active=false (row NOT deleted — reversible).
   *
   * Seeds a row via admin pool (active=true), deactivates it via ACCOUNTANT context,
   * then re-reads via admin pool to verify: row still exists with active=false.
   * REQ-DOOR-002: EngagementRequestService FK references must survive — no DELETE.
   */
  it("[AC-DOOR-002-03] deactivateService sets active=false (row NOT deleted)", async () => {
    // Seed a row via admin pool
    const seedResult = await adminPool.request().query<{ id: string }>(
      `INSERT INTO [dbo].[Service] ([name], [active], [sortOrder], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES (N'Persistence Test — Deactivate [${Date.now()}]', 1, 0, SYSDATETIMEOFFSET())`
    );
    // DECISION (TASK-002-002): raw mssql returns UUIDs uppercase; Prisma normalizes to lowercase.
    const seedId = (seedResult.recordset[0]?.id ?? "").toLowerCase();
    expect(seedId).toBeTruthy();
    createdServiceIds.push(seedId);

    // Deactivate via request-scoped `db` (ACCOUNTANT context)
    const deactivated = await withClerkIdentity(
      "user_acct_write_test",
      "ACCOUNTANT",
      () => deactivateService(seedId),
    );

    expect(deactivated.id).toBe(seedId);
    expect(deactivated.active).toBe(false); // [AC-DOOR-002-03]: active must be false

    // Re-read via admin pool — verify row NOT deleted, active=false (AC-DOOR-002-03)
    const row = await readServiceAdmin(seedId);
    expect(row, "Row must still exist after deactivateService — NOT deleted (REQ-DOOR-002)").not.toBeNull();
    expect(row?.active).toBe(false); // [AC-DOOR-002-03]: active=false, not deleted
  });

  /**
   * listAllServices returns both active and inactive rows for the admin list.
   *
   * Seeds one active and one inactive row, then calls listAllServices under ACCOUNTANT
   * context and verifies both rows appear.
   */
  it("listAllServices returns both active and inactive rows for the admin list", async () => {
    const ts = Date.now();

    // Seed an active row
    const activeResult = await adminPool.request().query<{ id: string }>(
      `INSERT INTO [dbo].[Service] ([name], [active], [sortOrder], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES (N'Persistence Test — ListAll Active [${ts}]', 1, 99, SYSDATETIMEOFFSET())`
    );
    // DECISION (TASK-002-002): raw mssql returns UUIDs uppercase; Prisma normalizes to lowercase.
    const activeId = (activeResult.recordset[0]?.id ?? "").toLowerCase();
    expect(activeId).toBeTruthy();
    createdServiceIds.push(activeId);

    // Seed an inactive row
    const inactiveResult = await adminPool.request().query<{ id: string }>(
      `INSERT INTO [dbo].[Service] ([name], [active], [sortOrder], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES (N'Persistence Test — ListAll Inactive [${ts}]', 0, 99, SYSDATETIMEOFFSET())`
    );
    // DECISION (TASK-002-002): raw mssql returns UUIDs uppercase; Prisma normalizes to lowercase.
    const inactiveId = (inactiveResult.recordset[0]?.id ?? "").toLowerCase();
    expect(inactiveId).toBeTruthy();
    createdServiceIds.push(inactiveId);

    // listAllServices under ACCOUNTANT context
    const all = await withClerkIdentity(
      "user_acct_write_test",
      "ACCOUNTANT",
      () => listAllServices(),
    );

    // Both seeded rows must appear in the result
    const allIds = all.map((s) => s.id);
    expect(allIds, "Active row must be included in listAllServices").toContain(activeId);
    expect(allIds, "Inactive row must be included in listAllServices").toContain(inactiveId);

    // Confirm active flags
    const activeRow = all.find((s) => s.id === activeId);
    const inactiveRow = all.find((s) => s.id === inactiveId);
    expect(activeRow?.active).toBe(true);
    expect(inactiveRow?.active).toBe(false);
  });

});
