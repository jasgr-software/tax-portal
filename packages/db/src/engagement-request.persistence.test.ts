/**
 * packages/db/src/engagement-request.persistence.test.ts
 *
 * TIER-3 INTEGRATION TEST — requires real SQL Server
 * Tests EngagementRequest persistence via the repositories.
 *
 * AC-DOOR-004-03: Request persisted in pending/awaiting-review state.
 * AC-DOOR-004-04: No account/User row created at submission.
 *
 * Connection approach:
 *   Uses raw mssql (not Prisma) for direct DB verification, due to the Prisma 5.22.0
 *   sqlserver connector limitation with port in the authority URL form (P1013 / TASK-002).
 *   The repositories under test (createEngagementRequest, getActiveServices) use adminDb
 *   internally — they resolve DATABASE_URL_ADMIN from env.
 *
 * Environment:
 *   DATABASE_URL_ADMIN — admin pool URL (bypasses RLS, used by repositories + test verification)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import mssqlPkg from "mssql";
import { parseSqlServerUrl } from "../../scripts/db-migrate.js";
import { createEngagementRequest } from "./repositories/engagement-request.js";

const { ConnectionPool } = mssqlPkg;

// Direct mssql pool for test setup/verification (bypasses Prisma URL parser limitation)
let verifyPool: InstanceType<typeof ConnectionPool>;

const ADMIN_URL = process.env["DATABASE_URL_ADMIN"];

// Track IDs for cleanup
const createdRequestIds: string[] = [];
const createdServiceIds: string[] = [];

beforeAll(async () => {
  if (!ADMIN_URL) {
    throw new Error("DATABASE_URL_ADMIN is required for persistence integration tests");
  }
  const config = parseSqlServerUrl(ADMIN_URL) as import("mssql").config;
  verifyPool = new ConnectionPool(config);
  await verifyPool.connect();
}, 30000);

afterAll(async () => {
  // Cleanup: EngagementRequestService rows cascade from EngagementRequest on DELETE
  for (const id of createdRequestIds) {
    await verifyPool.request().query(
      `DELETE FROM [dbo].[EngagementRequest] WHERE [id] = '${id}'`
    ).catch(() => { /* ignore */ });
  }
  for (const id of createdServiceIds) {
    await verifyPool.request().query(
      `DELETE FROM [dbo].[Service] WHERE [id] = '${id}'`
    ).catch(() => { /* ignore */ });
  }
  await verifyPool.close();
}, 30000);

/** Seed a Service row and return its id */
async function seedService(name: string): Promise<string> {
  const result = await verifyPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[Service] ([name], [active], [sortOrder], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'${name.replace(/'/g, "''")}', 1, 0, SYSDATETIMEOFFSET())`
  );
  const id = result.recordset[0]?.id ?? "";
  createdServiceIds.push(id);
  return id;
}

describe("createEngagementRequest — persistence integration", () => {
  /**
   * [AC-DOOR-004-03] Request is persisted in 'pending' state after submission.
   */
  it("[AC-DOOR-004-03] persists engagement request with status=pending", async () => {
    const serviceId = await seedService("Persistence Test - Status Check");

    const result = await createEngagementRequest({
      firstName: "Jane",
      lastName: "Prospect",
      email: "jane.prospect@example.com",
      serviceIds: [serviceId],
    });
    createdRequestIds.push(result.id);

    // Verify the row exists with correct status [AC-DOOR-004-03]
    const rows = await verifyPool.request().query<{ status: string; email: string }>(
      `SELECT [status], [email] FROM [dbo].[EngagementRequest] WHERE [id] = '${result.id}'`
    );
    expect(rows.recordset).toHaveLength(1);
    expect(rows.recordset[0]?.status).toBe("pending"); // [AC-DOOR-004-03]
    expect(rows.recordset[0]?.email).toBe("jane.prospect@example.com");
  });

  /**
   * [AC-DOOR-004-03] The returned result includes id and status='pending'.
   */
  it("[AC-DOOR-004-03] returns {id, status:'pending'} from createEngagementRequest", async () => {
    const serviceId = await seedService("Persistence Test - Return Value");

    const result = await createEngagementRequest({
      firstName: "Bob",
      lastName: "Client",
      email: `bob.client.${Date.now()}@example.com`,
      phone: "555-1234",
      message: "Interested in tax services",
      serviceIds: [serviceId],
    });
    createdRequestIds.push(result.id);

    expect(result.id).toBeTruthy();
    expect(result.status).toBe("pending"); // [AC-DOOR-004-03]
  });

  /**
   * [AC-DOOR-004-04] No User/account row is created when an EngagementRequest is submitted.
   * Prospect does NOT get an account at submission time.
   */
  it("[AC-DOOR-004-04] no User row is created when an engagement request is submitted", async () => {
    const serviceId = await seedService("Persistence Test - No User");
    const uniqueEmail = `no-user-test-${Date.now()}@example.com`;

    const result = await createEngagementRequest({
      firstName: "Anonymous",
      lastName: "Prospect",
      email: uniqueEmail,
      serviceIds: [serviceId],
    });
    createdRequestIds.push(result.id);

    // Verify no User row was created for this email [AC-DOOR-004-04]
    const userRows = await verifyPool.request().query<{ id: string }>(
      `SELECT [id] FROM [dbo].[User] WHERE [email] = N'${uniqueEmail}'`
    );
    expect(userRows.recordset).toHaveLength(0); // [AC-DOOR-004-04]
  });

  /**
   * Email normalization: createEngagementRequest normalizes email at the data layer.
   * ADR-002 § CITEXT equivalent for emails.
   */
  it("normalizes email to lowercase on create", async () => {
    const serviceId = await seedService("Persistence Test - Email Norm");

    const result = await createEngagementRequest({
      firstName: "Mixed",
      lastName: "Case",
      email: "  MIXED.Case@EXAMPLE.COM  ",
      serviceIds: [serviceId],
    });
    createdRequestIds.push(result.id);

    const rows = await verifyPool.request().query<{ email: string }>(
      `SELECT [email] FROM [dbo].[EngagementRequest] WHERE [id] = '${result.id}'`
    );
    expect(rows.recordset[0]?.email).toBe("mixed.case@example.com");
  });

  /**
   * Multi-service selection creates the correct join rows.
   * ADR-002 § No native array types → join table.
   */
  it("creates EngagementRequestService join rows for multi-service selection", async () => {
    const serviceAId = await seedService("Persistence Test - Multi A");
    const serviceBId = await seedService("Persistence Test - Multi B");

    const result = await createEngagementRequest({
      firstName: "Multi",
      lastName: "Select",
      email: `multi-select-${Date.now()}@example.com`,
      serviceIds: [serviceAId, serviceBId],
    });
    createdRequestIds.push(result.id);

    const joinRows = await verifyPool.request().query<{ serviceId: string }>(
      `SELECT [serviceId] FROM [dbo].[EngagementRequestService] WHERE [engagementRequestId] = '${result.id}'`
    );
    expect(joinRows.recordset).toHaveLength(2);
    const ids = joinRows.recordset.map((r) => r.serviceId).sort();
    expect(ids).toContain(serviceAId);
    expect(ids).toContain(serviceBId);
  });
});
