/**
 * packages/db/src/engagement-on-accept.persistence.test.ts
 *
 * TIER-3 INTEGRATION TEST — requires real SQL Server (DATABASE_URL_ADMIN)
 *
 * Tests the accept→Engagement substrate path (TASK-005-003 / AC-ONBD-001-01).
 *
 * Coverage:
 *   [AC-ONBD-001-01][persistence] accept creates exactly one Engagement with status='New',
 *                                  clientUserId=NULL (DECISION-A).
 *   [AC-ONBD-001-01][persistence] engagementRequestId UNIQUE constraint: a second Engagement
 *                                  for the same EngagementRequest fails (idempotency backstop).
 *   [AC-ONBD-001-01][persistence] rollback leaves no orphan Engagement — if the transaction is
 *                                  rolled back after createEngagement, the row does not exist.
 *   [DECISION-A][persistence]     updateEngagementClientUserId back-fills the FK when a User row
 *                                  exists (proves the back-fill seam works at the DB layer).
 *   [DECISION-A][persistence]     updateEngagementClientUserId is a no-op when the engagement has
 *                                  no matching engagementRequestId (safe for the mock-binding case).
 *
 * Pool strategy:
 *   - createEngagement uses the admin pool (RLS-exempt) — same as accept-time in production.
 *   - updateEngagementClientUserId uses the admin pool (same).
 *   - Verification queries use verifyPool (direct mssql, admin credentials).
 *   - Rollback test uses a direct mssql Transaction on verifyPool to simulate accept transaction.
 *
 * Connection approach:
 *   Raw mssql (not Prisma) for setup/verification, consistent with engagement.persistence.test.ts.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import mssqlPkg from "mssql";
import { parseSqlServerUrl } from "../../scripts/db-migrate.js";
import { createEngagement, updateEngagementClientUserId } from "./repositories/engagement.js";
import { withAuditTransaction } from "./audit.js";

const { ConnectionPool, Transaction } = mssqlPkg;

const ADMIN_URL = process.env["DATABASE_URL_ADMIN"];

// Direct mssql pool for test setup / verification
let verifyPool: InstanceType<typeof ConnectionPool>;

// Track IDs for cleanup (FK order: Engagement first)
const createdEngagementIds: string[] = [];
const createdRequestIds: string[] = [];
const createdUserIds: string[] = [];

beforeAll(async () => {
  if (!ADMIN_URL) {
    throw new Error(
      "DATABASE_URL_ADMIN is required for engagement-on-accept persistence integration tests",
    );
  }
  const config = parseSqlServerUrl(ADMIN_URL) as import("mssql").config;
  verifyPool = new ConnectionPool(config);
  await verifyPool.connect();
}, 30_000);

afterAll(async () => {
  // Cleanup in FK order
  for (const id of createdEngagementIds) {
    await verifyPool
      .request()
      .query(`DELETE FROM [dbo].[Engagement] WHERE [id] = '${id}'`)
      .catch(() => {
        /* ignore */
      });
  }
  for (const id of createdRequestIds) {
    await verifyPool
      .request()
      .query(`DELETE FROM [dbo].[EngagementRequest] WHERE [id] = '${id}'`)
      .catch(() => {
        /* ignore */
      });
  }
  for (const id of createdUserIds) {
    await verifyPool
      .request()
      .query(`DELETE FROM [dbo].[User] WHERE [id] = '${id}'`)
      .catch(() => {
        /* ignore */
      });
  }
  await verifyPool.close();
}, 30_000);

// ─── Seed helpers ─────────────────────────────────────────────────────────────

/** Seed an EngagementRequest row in 'accepted' status and return its id */
async function seedAcceptedRequest(label: string): Promise<string> {
  const result = await verifyPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[EngagementRequest]
       ([firstName], [lastName], [email], [status], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'Accept', N'Test', N'accept-${label}-${Date.now()}@example.com', N'accepted', SYSDATETIMEOFFSET())`,
  );
  const id = result.recordset[0]?.id ?? "";
  createdRequestIds.push(id);
  return id;
}

/** Seed a User row and return its id */
async function seedUser(label: string): Promise<string> {
  const clerkId = `on_accept_test_${label}_${Date.now()}`;
  const result = await verifyPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[User] ([clerkId], [email], [role], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'${clerkId}', N'on-accept-${label}-${Date.now()}@example.com', N'CLIENT', SYSDATETIMEOFFSET())`,
  );
  const id = result.recordset[0]?.id ?? "";
  createdUserIds.push(id);
  return id;
}

/** Directly verify an Engagement row exists by id */
async function getEngagementRow(id: string): Promise<{
  id: string;
  status: string;
  clientUserId: string | null;
  engagementRequestId: string;
} | null> {
  const result = await verifyPool.request().query<{
    id: string;
    status: string;
    clientUserId: string | null;
    engagementRequestId: string;
  }>(
    `SELECT [id], [status], [clientUserId], [engagementRequestId]
     FROM [dbo].[Engagement] WHERE [id] = '${id}'`,
  );
  return result.recordset[0] ?? null;
}

/** Count Engagement rows for a given engagementRequestId */
async function countEngagementsForRequest(requestId: string): Promise<number> {
  const result = await verifyPool.request().query<{ cnt: number }>(
    `SELECT COUNT(*) AS cnt FROM [dbo].[Engagement]
     WHERE [engagementRequestId] = '${requestId}'`,
  );
  return result.recordset[0]?.cnt ?? 0;
}

// ─── createEngagement — accept-time substrate ─────────────────────────────────

describe("createEngagement — accept creates one Engagement (AC-ONBD-001-01)", () => {
  /**
   * [AC-ONBD-001-01][persistence] accept creates exactly one Engagement with status='New'
   * and clientUserId=NULL (DECISION-A: prospect has no User row at accept-time).
   */
  it("[AC-ONBD-001-01][persistence] creates exactly one Engagement with status=New, clientUserId=NULL", async () => {
    const requestId = await seedAcceptedRequest("new-status");

    const result = await createEngagement({ engagementRequestId: requestId });
    createdEngagementIds.push(result.id);

    // Verify result shape
    expect(result.status).toBe("New");
    expect(result.id).toBeTruthy();

    // Verify DB row
    const row = await getEngagementRow(result.id);
    expect(row).not.toBeNull();
    expect(row?.status).toBe("New");
    expect(row?.clientUserId).toBeNull(); // DECISION-A: NULL at accept-time
    expect(row?.engagementRequestId.toLowerCase()).toBe(requestId.toLowerCase());

    // Verify exactly one row exists for this request
    const count = await countEngagementsForRequest(requestId);
    expect(count).toBe(1);
  });

  /**
   * [AC-ONBD-001-01][persistence] UNIQUE constraint on engagementRequestId prevents a second
   * Engagement for the same EngagementRequest. Accepting is decide-once; the constraint is
   * the idempotency backstop.
   */
  it("[AC-ONBD-001-01][persistence] UNIQUE constraint rejects a second Engagement for the same request (idempotency backstop)", async () => {
    const requestId = await seedAcceptedRequest("unique-constraint");

    const first = await createEngagement({ engagementRequestId: requestId });
    createdEngagementIds.push(first.id);

    // Second create must fail (UNIQUE constraint violation)
    await expect(
      createEngagement({ engagementRequestId: requestId }),
    ).rejects.toThrow();

    // Still exactly one row
    const count = await countEngagementsForRequest(requestId);
    expect(count).toBe(1);
  });

  /**
   * [AC-ONBD-001-01][persistence] Rollback leaves no orphan Engagement.
   *
   * Simulates the accept transaction being rolled back (e.g. AlreadyDecidedError thrown
   * after createEngagement but before commit). The Engagement INSERT is inside the same
   * transaction — on rollback, no row exists.
   *
   * This validates the "rollback leaves no orphan" invariant from the task spec.
   */
  it("[AC-ONBD-001-01][persistence] rollback leaves no orphan Engagement row", async () => {
    const requestId = await seedAcceptedRequest("rollback-test");

    // Track the ID we would have created (returned by the INSERT before rollback)
    let insertedId: string | undefined;

    // Open a real mssql Transaction on the admin pool to simulate withAuditTransaction
    const { getAdminPool } = await import("./admin-connection.js");
    const pool = await getAdminPool();
    const txn = new Transaction(pool);
    await txn.begin();

    try {
      // Call createEngagement inside the transaction (mirrors the accept flow)
      const result = await createEngagement({ engagementRequestId: requestId }, txn);
      insertedId = result.id;

      // Simulate a failure AFTER the INSERT (e.g. AlreadyDecidedError or audit failure)
      throw new Error("Simulated accept transaction failure — trigger rollback");
    } catch {
      // Roll back — the Engagement INSERT should be undone
      await txn.rollback().catch(() => {
        /* ignore rollback error */
      });
    }

    // Verify: the Engagement row does NOT exist after rollback (no orphan)
    expect(insertedId).toBeTruthy();
    const row = await getEngagementRow(insertedId!);
    expect(row).toBeNull();

    // Verify via request-level count
    const count = await countEngagementsForRequest(requestId);
    expect(count).toBe(0);
  });

  /**
   * [AC-ONBD-001-01][persistence] Engagement is created atomically with accept via withAuditTransaction.
   * This test verifies the happy-path transaction commit: the row EXISTS after commit.
   */
  it("[AC-ONBD-001-01][persistence] Engagement is committed inside withAuditTransaction (atomic accept)", async () => {
    const requestId = await seedAcceptedRequest("atomic-commit");

    let insertedId: string | undefined;

    // Use the real withAuditTransaction (admin pool) — mirrors the production accept path
    await withAuditTransaction(async (txn) => {
      const result = await createEngagement({ engagementRequestId: requestId }, txn);
      insertedId = result.id;
      // No throw → transaction commits
    });

    expect(insertedId).toBeTruthy();
    createdEngagementIds.push(insertedId!);

    // After commit: row must exist
    const row = await getEngagementRow(insertedId!);
    expect(row).not.toBeNull();
    expect(row?.status).toBe("New");
    expect(row?.clientUserId).toBeNull();
  });
});

// ─── updateEngagementClientUserId — DECISION-A back-fill seam ─────────────────

describe("updateEngagementClientUserId — DECISION-A back-fill seam", () => {
  /**
   * [DECISION-A][persistence] Back-fills clientUserId when a User row exists.
   * This proves the DB-layer seam works: the UPDATE sets clientUserId from NULL → User.id.
   */
  it("[DECISION-A][persistence] updateEngagementClientUserId sets clientUserId when it was NULL", async () => {
    const requestId = await seedAcceptedRequest("backfill-happy");
    const userId = await seedUser("backfill-user");

    const eng = await createEngagement({ engagementRequestId: requestId });
    createdEngagementIds.push(eng.id);

    // Back-fill — simulates the sign-up seam resolving the User row
    const result = await updateEngagementClientUserId(requestId, userId);

    expect(result.rowsAffected).toBe(1);

    // Verify DB row has been updated
    const row = await getEngagementRow(eng.id);
    expect(row?.clientUserId?.toLowerCase()).toBe(userId.toLowerCase());
  });

  /**
   * [DECISION-A][persistence] updateEngagementClientUserId is a no-op when no engagement exists
   * for the given engagementRequestId. Returns rowsAffected=0 (safe for mock-binding case).
   */
  it("[DECISION-A][persistence] returns rowsAffected=0 when no matching engagement found (mock-binding no-op)", async () => {
    const nonExistentRequestId = "00000000-0000-0000-0000-000000000099";
    const userId = await seedUser("no-engagement-user");

    const result = await updateEngagementClientUserId(nonExistentRequestId, userId);

    // No engagement row → rowsAffected=0 (safe no-op)
    expect(result.rowsAffected).toBe(0);
  });

  /**
   * [DECISION-A][persistence] updateEngagementClientUserId is a no-op when clientUserId is
   * already set (WHERE ... AND clientUserId IS NULL guard). Back-fill is idempotent.
   */
  it("[DECISION-A][persistence] no-op when clientUserId is already set (idempotent back-fill)", async () => {
    const requestId = await seedAcceptedRequest("backfill-idempotent");
    const userId = await seedUser("backfill-idem-user");
    const otherUserId = await seedUser("backfill-idem-other");

    // Create engagement with clientUserId already set
    const eng = await createEngagement({
      engagementRequestId: requestId,
      clientUserId: userId,
    });
    createdEngagementIds.push(eng.id);

    // Attempt to back-fill with a different userId — must be a no-op
    const result = await updateEngagementClientUserId(requestId, otherUserId);

    expect(result.rowsAffected).toBe(0);

    // clientUserId must still be the original userId
    const row = await getEngagementRow(eng.id);
    expect(row?.clientUserId?.toLowerCase()).toBe(userId.toLowerCase());
  });

  /**
   * [DECISION-A][persistence] updateEngagementClientUserId runs inside withAuditTransaction
   * — back-fill and audit row commit atomically (proves the seam structure at the DB layer).
   */
  it("[DECISION-A][persistence] back-fill runs inside withAuditTransaction (atomic commit with audit)", async () => {
    const requestId = await seedAcceptedRequest("backfill-atomic");
    const userId = await seedUser("backfill-atomic-user");

    const eng = await createEngagement({ engagementRequestId: requestId });
    createdEngagementIds.push(eng.id);

    // Run back-fill inside withAuditTransaction — mirrors the sign-up seam
    await withAuditTransaction(async (txn) => {
      await updateEngagementClientUserId(requestId, userId, txn);
    });

    // Verify the back-fill committed
    const row = await getEngagementRow(eng.id);
    expect(row?.clientUserId?.toLowerCase()).toBe(userId.toLowerCase());
  });
});
