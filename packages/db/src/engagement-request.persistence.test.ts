/**
 * packages/db/src/engagement-request.persistence.test.ts
 *
 * TIER-3 INTEGRATION TEST — requires real SQL Server
 * Tests EngagementRequest persistence via the repositories.
 *
 * AC-DOOR-004-03: Request persisted in pending/awaiting-review state.
 * AC-DOOR-004-04: No account/User row created at submission.
 * AC-DOOR-005-01: Submitting a request generates exactly one accountant notification.
 * AC-DOOR-005-02: The notification carries engagementRequestId (links to the request).
 * AC-MSG-013-01:  The notification type is 'new_engagement_request'.
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
const createdNotificationIds: string[] = [];
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
  // Cleanup Notification rows first (Notification.engagementRequestId uses SetNull on delete,
  // so deleting EngagementRequest won't cascade-delete Notifications — must clean up explicitly).
  // TASK-003-003: createEngagementRequest now generates a Notification in the same transaction.
  for (const id of createdNotificationIds) {
    await verifyPool.request().query(
      `DELETE FROM [dbo].[Notification] WHERE [id] = '${id}'`
    ).catch(() => { /* ignore */ });
  }
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
    createdNotificationIds.push(result.notificationId);

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
   * [AC-DOOR-005-01] The returned result also includes notificationId (proves notification created).
   */
  it("[AC-DOOR-004-03][AC-DOOR-005-01] returns {id, status:'pending', notificationId} from createEngagementRequest", async () => {
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
    createdNotificationIds.push(result.notificationId);

    expect(result.id).toBeTruthy();
    expect(result.status).toBe("pending"); // [AC-DOOR-004-03]
    expect(result.notificationId).toBeTruthy(); // [AC-DOOR-005-01] — notification created
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
    createdNotificationIds.push(result.notificationId);

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
    createdNotificationIds.push(result.notificationId);

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
    createdNotificationIds.push(result.notificationId);

    const joinRows = await verifyPool.request().query<{ serviceId: string }>(
      `SELECT [serviceId] FROM [dbo].[EngagementRequestService] WHERE [engagementRequestId] = '${result.id}'`
    );
    expect(joinRows.recordset).toHaveLength(2);
    const ids = joinRows.recordset.map((r) => r.serviceId).sort();
    expect(ids).toContain(serviceAId);
    expect(ids).toContain(serviceBId);
  });

  /**
   * [AC-DOOR-005-01] Submitting a request generates exactly one accountant notification.
   * The notification is created atomically with the request in the same transaction.
   */
  it("[AC-DOOR-005-01] creates exactly one Notification row tied to the new request", async () => {
    const serviceId = await seedService("Persistence Test - Notification Count");
    const uniqueEmail = `notif-count-${Date.now()}@example.com`;

    const result = await createEngagementRequest({
      firstName: "Test",
      lastName: "Notification",
      email: uniqueEmail,
      serviceIds: [serviceId],
    });
    createdRequestIds.push(result.id);
    createdNotificationIds.push(result.notificationId);

    // Verify exactly ONE Notification row was created for this request [AC-DOOR-005-01]
    const notifRows = await verifyPool.request().query<{
      id: string;
      type: string;
      title: string;
      engagementRequestId: string;
    }>(
      `SELECT [id], [type], [title], [engagementRequestId]
       FROM [dbo].[Notification]
       WHERE [engagementRequestId] = '${result.id}'`
    );
    expect(notifRows.recordset).toHaveLength(1); // exactly one [AC-DOOR-005-01]
    expect(notifRows.recordset[0]?.id).toBe(result.notificationId);

    // [AC-MSG-013-01] Notification type = 'new_engagement_request'
    expect(notifRows.recordset[0]?.type).toBe("new_engagement_request"); // [AC-MSG-013-01]

    // [AC-DOOR-005-02] Notification title identifies the request; engagementRequestId links to it
    expect(notifRows.recordset[0]?.title).toMatch(/Test Notification/); // [AC-DOOR-005-02]
    expect(notifRows.recordset[0]?.engagementRequestId).toBe(result.id); // [AC-DOOR-005-02]
  });

  /**
   * [AC-DOOR-005-01][AC-MSG-013-01] Notification has type 'new_engagement_request' and is unread.
   * The title includes the prospect's name for UI display (AC-DOOR-005-02 identification).
   */
  it("[AC-MSG-013-01][AC-DOOR-005-02] notification type is new_engagement_request and title includes prospect name", async () => {
    const serviceId = await seedService("Persistence Test - Notification Type");

    const result = await createEngagementRequest({
      firstName: "Alice",
      lastName: "Applicant",
      email: `alice.applicant.${Date.now()}@example.com`,
      serviceIds: [serviceId],
    });
    createdRequestIds.push(result.id);
    createdNotificationIds.push(result.notificationId);

    const notifRows = await verifyPool.request().query<{
      type: string;
      title: string;
      readAt: Date | null;
      engagementRequestId: string;
    }>(
      `SELECT [type], [title], [readAt], [engagementRequestId]
       FROM [dbo].[Notification]
       WHERE [id] = '${result.notificationId}'`
    );
    expect(notifRows.recordset).toHaveLength(1);
    expect(notifRows.recordset[0]?.type).toBe("new_engagement_request"); // [AC-MSG-013-01]
    expect(notifRows.recordset[0]?.title).toContain("Alice Applicant"); // [AC-DOOR-005-02] — identifies the prospect
    expect(notifRows.recordset[0]?.readAt).toBeNull(); // unread at creation
    expect(notifRows.recordset[0]?.engagementRequestId).toBe(result.id); // [AC-DOOR-005-02] — links to request
  });
});
