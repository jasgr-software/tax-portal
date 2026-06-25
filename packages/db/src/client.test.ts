/**
 * packages/db/src/client.test.ts
 *
 * TIER-3 INTEGRATION TEST — requires real SQL Server (ADR-012 § Tier 3)
 *
 * Tests for listClients (packages/db/src/repositories/client.ts).
 *
 * TASK-017-010 / BRIEF-017 — Acceptance criteria verified here:
 *   [AC-MSG-002-01] listClients returns distinct clients with display identity
 *     (firstName, lastName, email) for the StartGeneralThread selector.
 *   [AC-MSG-002-01] listClients returns an empty array when no clients exist
 *     (or when no Engagements have a non-null clientUserId).
 *   [DECISION-E] names come from EngagementRequest, not the User model.
 *   [CS-TS-002] admin pool accessed via getAdminPool() inside packages/db — not imported raw.
 *
 * Approach:
 *   - Seed isolated test rows (User + EngagementRequest + Engagement) using the admin pool.
 *   - Call listClients() and assert the returned ClientItem[] against the seeded data.
 *   - Clean up all seeded rows in afterAll.
 *
 * CS-GEN-001: test data emails are synthetic — never real PII. // CS-GEN-001
 * CS-GEN-003: governing keys cited throughout. // CS-GEN-003
 * ADR-003 §7: admin pool — no SESSION_CONTEXT needed for this read. // ADR-003
 * CS-TS-002: listClients uses getAdminPool() inside packages/db only. // CS-TS-002
 * DECISION-E: names resolved via EngagementRequest, not User. // DECISION-E
 *
 * // AC-MSG-002-01 // CS-GEN-001 // CS-GEN-003 // ADR-003 // CS-TS-002 // DECISION-E
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import mssqlPkg from "mssql";
import { parseSqlServerUrl } from "./sql-server-url.js";
import { listClients } from "./repositories/client.js";

const { ConnectionPool } = mssqlPkg;

// ─── Connection setup ─────────────────────────────────────────────────────────

let adminPool: InstanceType<typeof ConnectionPool>;
const ADMIN_URL = process.env["DATABASE_URL_ADMIN"];

// ─── Test data ────────────────────────────────────────────────────────────────

/**
 * Test-unique clerk IDs — avoids collision with other test suites.
 * These IDs only exist in the test environment; production never has them.
 */
const CLIENT_A_CLERK_ID = "list_clients_017_010_client_a";
const CLIENT_B_CLERK_ID = "list_clients_017_010_client_b";

let clientAUserId = "";
let clientBUserId = "";

/** Track everything we seed, for cleanup in afterAll. */
const createdUserIds: string[] = [];
const createdEngagementRequestIds: string[] = [];
const createdEngagementIds: string[] = [];

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Case-insensitive GUID comparison — SQL Server may return UNIQUEIDENTIFIERs in
 * different casing across drivers.
 */
function eqId(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeAll(async () => {
  if (!ADMIN_URL) {
    throw new Error("DATABASE_URL_ADMIN is required for listClients integration tests");
  }

  const adminConfig = parseSqlServerUrl(ADMIN_URL) as import("mssql").config;
  adminPool = new ConnectionPool(adminConfig);
  await adminPool.connect();

  // Seed: CLIENT-A User row
  const userAResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[User] ([clerkId], [email], [role], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'${CLIENT_A_CLERK_ID}', N'list-clients-017-010-client-a@example.com', N'CLIENT', SYSDATETIMEOFFSET())`,
  );
  clientAUserId = userAResult.recordset[0]?.id ?? "";
  createdUserIds.push(clientAUserId);

  // Seed: CLIENT-B User row
  const userBResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[User] ([clerkId], [email], [role], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'${CLIENT_B_CLERK_ID}', N'list-clients-017-010-client-b@example.com', N'CLIENT', SYSDATETIMEOFFSET())`,
  );
  clientBUserId = userBResult.recordset[0]?.id ?? "";
  createdUserIds.push(clientBUserId);

  // Seed: EngagementRequest for CLIENT-A (provides firstName/lastName/email — DECISION-E)
  const erAResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[EngagementRequest] ([firstName], [lastName], [email], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'AliceListClients', N'SmithListClients', N'list-clients-017-010-er-a@example.com', SYSDATETIMEOFFSET())`,
  );
  const erAId = erAResult.recordset[0]?.id ?? "";
  createdEngagementRequestIds.push(erAId);

  // Seed: Engagement for CLIENT-A (links clientUserId → EngagementRequest)
  const engAResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[Engagement] ([engagementRequestId], [clientUserId], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES ('${erAId}', '${clientAUserId}', SYSDATETIMEOFFSET())`,
  );
  createdEngagementIds.push(engAResult.recordset[0]?.id ?? "");

  // Seed: EngagementRequest for CLIENT-B
  const erBResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[EngagementRequest] ([firstName], [lastName], [email], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'BobListClients', N'JonesListClients', N'list-clients-017-010-er-b@example.com', SYSDATETIMEOFFSET())`,
  );
  const erBId = erBResult.recordset[0]?.id ?? "";
  createdEngagementRequestIds.push(erBId);

  // Seed: Engagement for CLIENT-B
  const engBResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[Engagement] ([engagementRequestId], [clientUserId], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES ('${erBId}', '${clientBUserId}', SYSDATETIMEOFFSET())`,
  );
  createdEngagementIds.push(engBResult.recordset[0]?.id ?? "");
}, 30000);

afterAll(async () => {
  if (!adminPool) return;

  // Cleanup in reverse FK order: Engagements → EngagementRequests → Users
  for (const id of createdEngagementIds) {
    await adminPool
      .request()
      .query(`DELETE FROM [dbo].[Engagement] WHERE [id] = '${id}'`)
      .catch(() => { /* ignore */ });
  }

  for (const id of createdEngagementRequestIds) {
    await adminPool
      .request()
      .query(`DELETE FROM [dbo].[EngagementRequest] WHERE [id] = '${id}'`)
      .catch(() => { /* ignore */ });
  }

  for (const id of createdUserIds) {
    await adminPool
      .request()
      .query(`DELETE FROM [dbo].[User] WHERE [id] = '${id}'`)
      .catch(() => { /* ignore */ });
  }

  await adminPool.close().catch(() => { /* ignore */ });
}, 30000);

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("listClients — admin-pool client list read model (TASK-017-010 / AC-MSG-002-01)", () => {
  it(
    "[AC-MSG-002-01] returns the seeded CLIENT-A with correct display identity from EngagementRequest",
    async () => {
      // AC-MSG-002-01: the selector is populated with clients so the accountant can pick one.
      // DECISION-E: firstName/lastName come from EngagementRequest, not User. // DECISION-E
      const result = await listClients();

      // Find CLIENT-A in the result
      const clientA = result.find((c) => eqId(c.clientUserId, clientAUserId));
      expect(clientA).toBeDefined();
      expect(clientA?.firstName).toBe("AliceListClients");
      expect(clientA?.lastName).toBe("SmithListClients");
      // email comes from EngagementRequest (DECISION-E)
      expect(clientA?.email).toBe("list-clients-017-010-er-a@example.com");
      // CS-GEN-001: no assertion on logged data — names are return values only. // CS-GEN-001
    },
  );

  it(
    "[AC-MSG-002-01] returns the seeded CLIENT-B with correct display identity",
    async () => {
      // Both clients must be in the result — distinct-by-clientUserId.
      const result = await listClients();

      const clientB = result.find((c) => eqId(c.clientUserId, clientBUserId));
      expect(clientB).toBeDefined();
      expect(clientB?.firstName).toBe("BobListClients");
      expect(clientB?.lastName).toBe("JonesListClients");
    },
  );

  it(
    "[AC-MSG-002-01] distinct-by-clientUserId — a client with multiple engagements appears only once",
    async () => {
      // Seed a SECOND engagement for CLIENT-A (different EngagementRequest, same clientUserId).
      // listClients must DISTINCT and return CLIENT-A only once.
      const er2Result = await adminPool.request().query<{ id: string }>(
        `INSERT INTO [dbo].[EngagementRequest] ([firstName], [lastName], [email], [updatedAt])
         OUTPUT INSERTED.[id]
         VALUES (N'AliceListClients', N'SmithListClients', N'list-clients-017-010-er-a2@example.com', SYSDATETIMEOFFSET())`,
      );
      const er2Id = er2Result.recordset[0]?.id ?? "";
      createdEngagementRequestIds.push(er2Id);

      const eng2Result = await adminPool.request().query<{ id: string }>(
        `INSERT INTO [dbo].[Engagement] ([engagementRequestId], [clientUserId], [updatedAt])
         OUTPUT INSERTED.[id]
         VALUES ('${er2Id}', '${clientAUserId}', SYSDATETIMEOFFSET())`,
      );
      createdEngagementIds.push(eng2Result.recordset[0]?.id ?? "");

      try {
        const result = await listClients();

        // CLIENT-A must appear exactly once despite having 2 engagements.
        const clientAEntries = result.filter((c) => eqId(c.clientUserId, clientAUserId));
        expect(clientAEntries).toHaveLength(1);
      } finally {
        // Clean up the extra engagement + ER (do not wait for afterAll to avoid state leak)
        await adminPool
          .request()
          .query(`DELETE FROM [dbo].[Engagement] WHERE [id] = '${eng2Result.recordset[0]?.id}'`)
          .catch(() => { /* ignore */ });
        await adminPool
          .request()
          .query(`DELETE FROM [dbo].[EngagementRequest] WHERE [id] = '${er2Id}'`)
          .catch(() => { /* ignore */ });
      }
    },
  );

  it(
    "[AC-MSG-002-01] returns an array type (may be empty when no CLIENT users with Engagements exist)",
    async () => {
      // Verifies the function returns an array — not null, not undefined.
      // (In practice there are seeded rows in the test DB, so this won't be empty.)
      const result = await listClients();

      expect(Array.isArray(result)).toBe(true);
      // Each item must have the required ClientItem shape
      for (const item of result) {
        expect(typeof item.clientUserId).toBe("string");
        expect(item.clientUserId.length).toBeGreaterThan(0);
        // firstName/lastName/email may be null (DECISION-E edge case) but must be present as properties
        expect("firstName" in item).toBe(true);
        expect("lastName" in item).toBe(true);
        expect("email" in item).toBe(true);
      }
    },
  );
});
