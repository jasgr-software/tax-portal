/**
 * packages/db/src/engagement.lifecycle.transition.test.ts
 *
 * TIER-3 INTEGRATION TEST — requires real SQL Server (ADR-012)
 *
 * Tests the lifecycle transition/confirmation/reopen seam introduced in TASK-010-001.
 * Covers: transitionEngagementStatus, confirmDelivery, confirmFiling, reopenEngagement.
 *
 * Acceptance criteria (AC-tagged test names):
 *   AC-LIFE-001-01 — status CHECK constraint rejects an out-of-set value
 *   AC-LIFE-001-03 — accountant advances New → In Progress → Review → Complete in forward order
 *   AC-LIFE-003-02 — EPIC-008 onboarding-completion automatic New → In Progress remains intact
 *                    (verified by the existing onboarding-completion.integration.test.ts — not re-tested here)
 *   AC-LIFE-005-03 — → Complete blocked with only delivery confirmation (≤1 confirm → not Complete)
 *   AC-LIFE-005-03 — → Complete blocked with only filing confirmation
 *   AC-LIFE-005-03 — → Complete allowed when BOTH confirmations recorded
 *   AC-LIFE-006-01 — reopen Complete → In Progress clears both confirmation timestamps
 *
 * Additionally:
 *   ADR-019        — each transition records an audit event in the same transaction
 *
 * ADR-003 §7: privileged accountant writes use admin pool inside withAuditTransaction.
 * ADR-005:    BLOCK predicate (request pool) covered in engagement.lifecycle.rls.test.ts.
 * ADR-012:    Tier-3 test against the real SQL Server container.
 * ADR-019:    Audit atomicity: transition audit row in the same transaction as the status UPDATE.
 * CS-TS-001:  Admin pool writes use the correct pool (admin, not request pool).
 * CS-GEN-002: status set is additive (extends prior 2-value set; no fork).
 * CS-GEN-003: // ADR-003, // ADR-005, // ADR-019, // DECISION-010-*
 *
 * Connection: raw mssql (admin pool only — lifecycle writes are admin-pool; RLS tests in the RLS file).
 *
 * Environment:
 *   DATABASE_URL_ADMIN — admin pool URL (taxportal_admin; IS_MEMBER('app_admin_role')=1 → RLS-exempt)
 *   DATABASE_URL       — request pool URL (not needed for admin writes, used for CHECK constraint test)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import mssqlPkg from "mssql";
import { parseSqlServerUrl } from "./sql-server-url.js";
import {
  transitionEngagementStatus,
  confirmDelivery,
  confirmFiling,
  reopenEngagement,
  LIFECYCLE_ALLOWED_TRANSITIONS,
} from "./repositories/engagement.js";
import type { AuditActor } from "./audit.js";

const { ConnectionPool } = mssqlPkg;

// ─── Connection setup ─────────────────────────────────────────────────────────

let adminPool: InstanceType<typeof ConnectionPool>;

const ADMIN_URL = process.env["DATABASE_URL_ADMIN"];

// ─── Test data ────────────────────────────────────────────────────────────────

/** IDs for the engagement under test — reset between tests via beforeEach */
let testEngagementId: string;
let testRequestId: string;

/** Synthetic accountant actor for audit events (DECISION in onboarding-completion.ts) */
const ACCOUNTANT_ACTOR: AuditActor = {
  clerkUserId: "lc_trans_accountant",
  role: "ACCOUNTANT",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Creates a fresh Engagement row via admin pool for a test.
 * Returns the new engagement id.
 * Uses a throwaway EngagementRequest row (no User needed for transition tests).
 */
async function seedEngagementWithStatus(status: string): Promise<{
  engagementId: string;
  requestId: string;
}> {
  const reqResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[EngagementRequest]
       ([firstName], [lastName], [email], [status], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'LC', N'Trans', N'lc-trans-${Date.now()}@example.com', N'accepted', SYSDATETIMEOFFSET())`
  );
  const reqId = reqResult.recordset[0]?.id ?? "";

  const engResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[Engagement]
       ([engagementRequestId], [status], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES ('${reqId}', N'${status.replace(/'/g, "''")}', SYSDATETIMEOFFSET())`
  );
  const engId = engResult.recordset[0]?.id ?? "";

  return { engagementId: engId, requestId: reqId };
}

/**
 * Reads the current Engagement row via admin pool (RLS-exempt).
 */
async function getEngagementStatus(engagementId: string): Promise<{
  status: string;
  deliveryConfirmedAt: Date | null;
  filingConfirmedAt: Date | null;
} | null> {
  const result = await adminPool.request().query<{
    status: string;
    deliveryConfirmedAt: Date | null;
    filingConfirmedAt: Date | null;
  }>(
    `SELECT [status], [deliveryConfirmedAt], [filingConfirmedAt]
     FROM [dbo].[Engagement]
     WHERE [id] = '${engagementId}'`
  );
  return result.recordset[0] ?? null;
}

/**
 * Counts AuditEvent rows for a given engagementId and action.
 * Uses admin pool (AuditEvent is admin-readable, ADR-019).
 */
async function countAuditRows(engagementId: string, action: string): Promise<number> {
  const result = await adminPool.request().query<{ cnt: number }>(
    `SELECT COUNT(*) AS cnt FROM [dbo].[AuditEvent]
     WHERE [targetId] = '${engagementId}'
       AND [action] = N'${action.replace(/'/g, "''")}'`
  );
  return result.recordset[0]?.cnt ?? 0;
}

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeAll(async () => {
  if (!ADMIN_URL) throw new Error("DATABASE_URL_ADMIN is required for lifecycle transition tests");

  const adminConfig = parseSqlServerUrl(ADMIN_URL) as import("mssql").config;
  adminPool = new ConnectionPool(adminConfig);
  await adminPool.connect();
}, 30000);

/**
 * Each test gets a fresh engagement (seeded at 'New' unless overridden).
 * testEngagementId and testRequestId are set here and cleaned up in afterAll.
 * This avoids inter-test status pollution.
 */
const seededEngagements: Array<{ engagementId: string; requestId: string }> = [];

beforeEach(async () => {
  const seeded = await seedEngagementWithStatus("New");
  testEngagementId = seeded.engagementId;
  testRequestId = seeded.requestId;
  seededEngagements.push(seeded);
});

afterAll(async () => {
  // Cleanup all seeded test engagements
  for (const { engagementId, requestId } of seededEngagements) {
    await adminPool.request()
      .query(`DELETE FROM [dbo].[Engagement] WHERE [id] = '${engagementId}'`)
      .catch(() => { /* ignore */ });
    await adminPool.request()
      .query(`DELETE FROM [dbo].[EngagementRequest] WHERE [id] = '${requestId}'`)
      .catch(() => { /* ignore */ });
  }
  await adminPool.close().catch(() => { /* ignore */ });
}, 60000);

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("LIFECYCLE_ALLOWED_TRANSITIONS map (DECISION-010-D)", () => {

  it("contains exactly the forward edges and no reopen edge (reopen is a separate function)", () => {
    // DECISION-010-D: allowed forward edges map
    expect(LIFECYCLE_ALLOWED_TRANSITIONS.get("New")).toBe("In Progress");
    expect(LIFECYCLE_ALLOWED_TRANSITIONS.get("In Progress")).toBe("Review");
    expect(LIFECYCLE_ALLOWED_TRANSITIONS.get("Review")).toBe("Complete");
    // Reopen is not in the forward map (it's exposed via reopenEngagement)
    expect(LIFECYCLE_ALLOWED_TRANSITIONS.get("Complete")).toBeUndefined();
  });

});

describe("transitionEngagementStatus — forward transitions (AC-LIFE-001-03, DECISION-010-C/D/F)", () => {

  /**
   * [AC-LIFE-001-03] Accountant advances New → In Progress.
   * Guard: WHERE status='New' + @@ROWCOUNT. Returns { transitioned: true }.
   * ADR-019: audit event 'engagement.transition' recorded.
   */
  it("[AC-LIFE-001-03] New → In Progress transition succeeds and records audit event", async () => {
    const result = await transitionEngagementStatus({
      engagementId: testEngagementId,
      fromStatus: "New",
      toStatus: "In Progress",
      actor: ACCOUNTANT_ACTOR,
      sourceSurface: "admin",
    });

    expect(result.transitioned).toBe(true);

    const row = await getEngagementStatus(testEngagementId);
    expect(row?.status).toBe("In Progress");

    // ADR-019: audit event in the same transaction
    const auditCount = await countAuditRows(testEngagementId, "engagement.transition");
    expect(auditCount).toBeGreaterThanOrEqual(1);
  });

  /**
   * [AC-LIFE-001-03] Accountant advances In Progress → Review.
   */
  it("[AC-LIFE-001-03] In Progress → Review transition succeeds", async () => {
    // First advance to In Progress
    await transitionEngagementStatus({
      engagementId: testEngagementId,
      fromStatus: "New",
      toStatus: "In Progress",
      actor: ACCOUNTANT_ACTOR,
      sourceSurface: "admin",
    });

    // Then advance to Review
    const result = await transitionEngagementStatus({
      engagementId: testEngagementId,
      fromStatus: "In Progress",
      toStatus: "Review",
      actor: ACCOUNTANT_ACTOR,
      sourceSurface: "admin",
    });

    expect(result.transitioned).toBe(true);
    const row = await getEngagementStatus(testEngagementId);
    expect(row?.status).toBe("Review");
  });

  /**
   * [AC-LIFE-001-03] Full forward chain: New → In Progress → Review → Complete.
   * Complete requires BOTH confirmations (AC-LIFE-005-03).
   */
  it("[AC-LIFE-001-03] full forward chain New → In Progress → Review → Complete (both confirms set)", async () => {
    // New → In Progress
    await transitionEngagementStatus({
      engagementId: testEngagementId,
      fromStatus: "New",
      toStatus: "In Progress",
      actor: ACCOUNTANT_ACTOR,
      sourceSurface: "admin",
    });

    // In Progress → Review
    await transitionEngagementStatus({
      engagementId: testEngagementId,
      fromStatus: "In Progress",
      toStatus: "Review",
      actor: ACCOUNTANT_ACTOR,
      sourceSurface: "admin",
    });

    // Set both confirmations before → Complete
    await confirmDelivery({ engagementId: testEngagementId, actor: ACCOUNTANT_ACTOR, sourceSurface: "admin" });
    await confirmFiling({ engagementId: testEngagementId, actor: ACCOUNTANT_ACTOR, sourceSurface: "admin" });

    // Review → Complete
    const result = await transitionEngagementStatus({
      engagementId: testEngagementId,
      fromStatus: "Review",
      toStatus: "Complete",
      actor: ACCOUNTANT_ACTOR,
      sourceSurface: "admin",
    });

    expect(result.transitioned).toBe(true);
    const row = await getEngagementStatus(testEngagementId);
    expect(row?.status).toBe("Complete");
  });

  /**
   * Guard: wrong fromStatus returns { transitioned: false } without touching DB.
   * DECISION-010-C: WHERE status=@from guard.
   */
  it("wrong fromStatus — guard fires, transitioned=false, DB unchanged", async () => {
    const result = await transitionEngagementStatus({
      engagementId: testEngagementId,
      fromStatus: "Review",  // engagement is at 'New'
      toStatus: "Complete",
      actor: ACCOUNTANT_ACTOR,
      sourceSurface: "admin",
    });

    expect(result.transitioned).toBe(false);
    const row = await getEngagementStatus(testEngagementId);
    expect(row?.status).toBe("New");  // unchanged
  });

  /**
   * Disallowed edge returns { transitioned: false } immediately.
   * DECISION-010-D: server-side allowed-transitions map guard.
   */
  it("disallowed edge (New → Complete skip) — rejected at seam level, transitioned=false", async () => {
    const result = await transitionEngagementStatus({
      engagementId: testEngagementId,
      fromStatus: "New",
      toStatus: "Complete",  // not in allowed map (New → In Progress is allowed, not New → Complete)
      actor: ACCOUNTANT_ACTOR,
      sourceSurface: "admin",
    });

    expect(result.transitioned).toBe(false);
    const row = await getEngagementStatus(testEngagementId);
    expect(row?.status).toBe("New");  // unchanged
  });

});

describe("→ Complete confirmation gate (AC-LIFE-005-03)", () => {

  /**
   * [AC-LIFE-005-03] → Complete blocked with only delivery confirmation (no filing).
   * Guard: WHERE status='Review' AND deliveryConfirmedAt IS NOT NULL AND filingConfirmedAt IS NOT NULL.
   * With only delivery set → filingConfirmedAt IS NULL → guard fires → transitioned=false.
   */
  it("[AC-LIFE-005-03] → Complete blocked with only delivery confirmation (filing missing) — transitioned=false", async () => {
    // Advance to Review first
    await transitionEngagementStatus({
      engagementId: testEngagementId,
      fromStatus: "New",
      toStatus: "In Progress",
      actor: ACCOUNTANT_ACTOR,
      sourceSurface: "admin",
    });
    await transitionEngagementStatus({
      engagementId: testEngagementId,
      fromStatus: "In Progress",
      toStatus: "Review",
      actor: ACCOUNTANT_ACTOR,
      sourceSurface: "admin",
    });

    // Only delivery confirmed — filing is still NULL
    await confirmDelivery({ engagementId: testEngagementId, actor: ACCOUNTANT_ACTOR, sourceSurface: "admin" });

    // Try → Complete with only delivery confirmed — must fail
    const result = await transitionEngagementStatus({
      engagementId: testEngagementId,
      fromStatus: "Review",
      toStatus: "Complete",
      actor: ACCOUNTANT_ACTOR,
      sourceSurface: "admin",
    });

    expect(result.transitioned).toBe(false);
    const row = await getEngagementStatus(testEngagementId);
    // AC-LIFE-005-03: status MUST remain 'Review' (not Complete)
    expect(row?.status).toBe("Review");
    expect(row?.filingConfirmedAt).toBeNull();
  });

  /**
   * [AC-LIFE-005-03] → Complete blocked with only filing confirmation (no delivery).
   * Same guard: deliveryConfirmedAt IS NULL → guard fires → transitioned=false.
   */
  it("[AC-LIFE-005-03] → Complete blocked with only filing confirmation (delivery missing) — transitioned=false", async () => {
    // Advance to Review
    await transitionEngagementStatus({
      engagementId: testEngagementId,
      fromStatus: "New",
      toStatus: "In Progress",
      actor: ACCOUNTANT_ACTOR,
      sourceSurface: "admin",
    });
    await transitionEngagementStatus({
      engagementId: testEngagementId,
      fromStatus: "In Progress",
      toStatus: "Review",
      actor: ACCOUNTANT_ACTOR,
      sourceSurface: "admin",
    });

    // Only filing confirmed — delivery is still NULL
    await confirmFiling({ engagementId: testEngagementId, actor: ACCOUNTANT_ACTOR, sourceSurface: "admin" });

    // Try → Complete with only filing confirmed — must fail
    const result = await transitionEngagementStatus({
      engagementId: testEngagementId,
      fromStatus: "Review",
      toStatus: "Complete",
      actor: ACCOUNTANT_ACTOR,
      sourceSurface: "admin",
    });

    expect(result.transitioned).toBe(false);
    const row = await getEngagementStatus(testEngagementId);
    // AC-LIFE-005-03: status MUST remain 'Review'
    expect(row?.status).toBe("Review");
    expect(row?.deliveryConfirmedAt).toBeNull();
  });

  /**
   * [AC-LIFE-005-03] → Complete allowed when BOTH confirmations recorded.
   * Guard passes: both non-null → transitioned=true → status=Complete.
   */
  it("[AC-LIFE-005-03] → Complete allowed when BOTH delivery and filing confirmations recorded — transitioned=true", async () => {
    // Advance to Review
    await transitionEngagementStatus({
      engagementId: testEngagementId,
      fromStatus: "New",
      toStatus: "In Progress",
      actor: ACCOUNTANT_ACTOR,
      sourceSurface: "admin",
    });
    await transitionEngagementStatus({
      engagementId: testEngagementId,
      fromStatus: "In Progress",
      toStatus: "Review",
      actor: ACCOUNTANT_ACTOR,
      sourceSurface: "admin",
    });

    // Both confirmations
    const delivResult = await confirmDelivery({ engagementId: testEngagementId, actor: ACCOUNTANT_ACTOR, sourceSurface: "admin" });
    const filResult = await confirmFiling({ engagementId: testEngagementId, actor: ACCOUNTANT_ACTOR, sourceSurface: "admin" });

    expect(delivResult.confirmed).toBe(true);
    expect(filResult.confirmed).toBe(true);

    // Now → Complete should succeed
    const result = await transitionEngagementStatus({
      engagementId: testEngagementId,
      fromStatus: "Review",
      toStatus: "Complete",
      actor: ACCOUNTANT_ACTOR,
      sourceSurface: "admin",
    });

    expect(result.transitioned).toBe(true);
    const row = await getEngagementStatus(testEngagementId);
    // AC-LIFE-005-03: BOTH confirmations → Complete allowed
    expect(row?.status).toBe("Complete");
    expect(row?.deliveryConfirmedAt).not.toBeNull();
    expect(row?.filingConfirmedAt).not.toBeNull();
  });

});

describe("reopenEngagement (AC-LIFE-006-01, DECISION-010-B)", () => {

  /**
   * [AC-LIFE-006-01] reopen Complete → In Progress clears both confirmation timestamps.
   * DECISION-010-B: reopenEngagement sets status='In Progress' + clears both confirms.
   */
  it("[AC-LIFE-006-01] reopen Complete → In Progress clears both confirmation timestamps", async () => {
    // Seed a Complete engagement with both confirmations
    const seeded = await seedEngagementWithStatus("Complete");
    seededEngagements.push(seeded);

    // Set both confirmations directly via admin pool
    await adminPool.request().query(
      `UPDATE [dbo].[Engagement]
       SET [deliveryConfirmedAt] = SYSDATETIMEOFFSET(),
           [filingConfirmedAt]   = SYSDATETIMEOFFSET(),
           [updatedAt]           = SYSDATETIMEOFFSET()
       WHERE [id] = '${seeded.engagementId}'`
    );

    // Verify they're set
    const before = await getEngagementStatus(seeded.engagementId);
    expect(before?.status).toBe("Complete");
    expect(before?.deliveryConfirmedAt).not.toBeNull();
    expect(before?.filingConfirmedAt).not.toBeNull();

    // Reopen
    const result = await reopenEngagement({
      engagementId: seeded.engagementId,
      actor: ACCOUNTANT_ACTOR,
      sourceSurface: "admin",
    });

    expect(result.reopened).toBe(true);

    const after = await getEngagementStatus(seeded.engagementId);
    // AC-LIFE-006-01: status = In Progress
    expect(after?.status).toBe("In Progress");
    // DECISION-010-B: BOTH confirmation timestamps cleared on reopen
    expect(after?.deliveryConfirmedAt).toBeNull();
    expect(after?.filingConfirmedAt).toBeNull();
  });

  /**
   * Reopen of a non-Complete engagement returns { reopened: false }.
   * Guard: WHERE status='Complete' + @@ROWCOUNT.
   */
  it("reopen of non-Complete engagement — guard fires, reopened=false, status unchanged", async () => {
    // testEngagementId is at 'New' (from beforeEach)
    const result = await reopenEngagement({
      engagementId: testEngagementId,
      actor: ACCOUNTANT_ACTOR,
      sourceSurface: "admin",
    });

    expect(result.reopened).toBe(false);
    const row = await getEngagementStatus(testEngagementId);
    expect(row?.status).toBe("New");  // unchanged
  });

  /**
   * After reopen, a second reopen returns { reopened: false } (fire-once guard).
   */
  it("second reopen attempt returns reopened=false (guard: status is now In Progress, not Complete)", async () => {
    const seeded = await seedEngagementWithStatus("Complete");
    seededEngagements.push(seeded);

    // First reopen — should succeed
    const first = await reopenEngagement({
      engagementId: seeded.engagementId,
      actor: ACCOUNTANT_ACTOR,
      sourceSurface: "admin",
    });
    expect(first.reopened).toBe(true);

    // Second reopen — should fail (now In Progress)
    const second = await reopenEngagement({
      engagementId: seeded.engagementId,
      actor: ACCOUNTANT_ACTOR,
      sourceSurface: "admin",
    });
    expect(second.reopened).toBe(false);
  });

});

describe("ADR-019 audit atomicity", () => {

  /**
   * [ADR-019] Each transition/reopen records an audit event in the SAME transaction.
   * Verifies audit rows are created for: transition, confirm_delivery, confirm_filing, reopen.
   */
  it("[ADR-019] transition, confirmDelivery, confirmFiling, reopen each record an audit event atomically", async () => {
    const seeded = await seedEngagementWithStatus("New");
    seededEngagements.push(seeded);
    const engId = seeded.engagementId;

    // Advance New → In Progress (1 audit row for 'engagement.transition')
    await transitionEngagementStatus({
      engagementId: engId, fromStatus: "New", toStatus: "In Progress",
      actor: ACCOUNTANT_ACTOR, sourceSurface: "admin",
    });
    expect(await countAuditRows(engId, "engagement.transition")).toBe(1);

    // In Progress → Review (2nd audit row for 'engagement.transition')
    await transitionEngagementStatus({
      engagementId: engId, fromStatus: "In Progress", toStatus: "Review",
      actor: ACCOUNTANT_ACTOR, sourceSurface: "admin",
    });
    expect(await countAuditRows(engId, "engagement.transition")).toBe(2);

    // Confirm delivery (1 audit row for 'engagement.confirm_delivery')
    await confirmDelivery({ engagementId: engId, actor: ACCOUNTANT_ACTOR, sourceSurface: "admin" });
    expect(await countAuditRows(engId, "engagement.confirm_delivery")).toBe(1);

    // Confirm filing (1 audit row for 'engagement.confirm_filing')
    await confirmFiling({ engagementId: engId, actor: ACCOUNTANT_ACTOR, sourceSurface: "admin" });
    expect(await countAuditRows(engId, "engagement.confirm_filing")).toBe(1);

    // Review → Complete
    await transitionEngagementStatus({
      engagementId: engId, fromStatus: "Review", toStatus: "Complete",
      actor: ACCOUNTANT_ACTOR, sourceSurface: "admin",
    });
    expect(await countAuditRows(engId, "engagement.transition")).toBe(3);

    // Reopen (1 audit row for 'engagement.reopen')
    await reopenEngagement({ engagementId: engId, actor: ACCOUNTANT_ACTOR, sourceSurface: "admin" });
    expect(await countAuditRows(engId, "engagement.reopen")).toBe(1);
  });

});

describe("DB CHECK constraint (AC-LIFE-001-01)", () => {

  /**
   * [AC-LIFE-001-01] status CHECK constraint rejects an out-of-set value.
   * CK_Engagement_status CHECK ([status] IN ('New', 'In Progress', 'Review', 'Complete')).
   * An UPDATE with status='Bogus' must throw (SQL Server CHECK constraint violation).
   *
   * This verifies the DB-layer status invariant (not just the app-layer guard).
   */
  it("[AC-LIFE-001-01] status CHECK constraint rejects out-of-set value 'Bogus' with an error", async () => {
    // Attempt direct admin-pool UPDATE with an invalid status value
    // CK_Engagement_status should reject this
    await expect(
      adminPool.request().query(
        `UPDATE [dbo].[Engagement]
         SET [status] = N'Bogus', [updatedAt] = SYSDATETIMEOFFSET()
         WHERE [id] = '${testEngagementId}'`
      )
    ).rejects.toThrow();  // SQL Server CHECK violation throws

    // Verify the status was not changed
    const row = await getEngagementStatus(testEngagementId);
    expect(row?.status).toBe("New");  // unchanged — constraint enforced it
  });

});
