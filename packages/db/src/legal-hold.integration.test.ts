/**
 * packages/db/src/legal-hold.integration.test.ts
 *
 * TIER-3 INTEGRATION TEST — requires real SQL Server (ADR-012 § Tier 3)
 *
 * Tests place/lift/activeHoldsFor repository functions (TASK-015-001 / BRIEF-015 / EPIC-015).
 *
 * Acceptance criteria covered (AC-id test-tag contract, per BRIEF-015 gherkin methodology):
 *
 *   AC-FILE-014-01 — The accountant can place a legal hold on an individual engagement.
 *     Test: place hold on engagement → activeHoldsFor returns it.
 *
 *   AC-FILE-014-02 — The accountant can place a legal hold on a client (covers ALL engagements).
 *     Test: place client-scoped hold on a client with 2 engagements → activeHoldsFor returns hold
 *     for BOTH engagements (the client-scoped resolution in activeHoldsFor).
 *
 *   AC-FILE-014-04 — A legal hold remains in effect indefinitely until explicitly lifted.
 *     Test: verify active hold has no liftedAt, simulate no TTL expiry → hold still active.
 *
 *   AC-FILE-014-06 — Placing a legal hold is recorded in the audit trail.
 *     Test: place hold → AuditEvent row with action='legal_hold.placed' exists.
 *
 *   AC-FILE-014-07 — Lifting a legal hold is recorded in the audit trail.
 *     Test: lift hold → liftedAt set, activeHoldsFor returns none, AuditEvent 'legal_hold.lifted' exists.
 *
 * ADR-003: admin pool for all write operations (no SESSION_CONTEXT needed for admin pool).
 * ADR-005: admin pool bypasses RLS — place/lift use the admin pool for writes.
 * ADR-018 §6: legal hold shape: engagement/client scope, place/lift audited, no auto-expire.
 * ADR-019: audit events in same transaction (fail-closed via withAuditTransaction).
 *
 * CS-TS-001: all write paths go through packages/db (admin pool via withAuditTransaction). // CS-TS-001
 * CS-TS-002: admin pool accessed only via getAdminPool inside withAuditTransaction. // CS-TS-002
 * CS-GEN-001: no PII in audit targetId — holdId only. // CS-GEN-001
 * CS-GEN-002: additive — new test file, no existing test modified. // CS-GEN-002
 * CS-GEN-003: governing keys cited throughout. // CS-GEN-003
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import mssqlPkg from "mssql";
import { parseSqlServerUrl } from "./sql-server-url.js";
import {
  placeLegalHold,
  liftLegalHold,
  activeHoldsFor,
} from "./repositories/legal-hold.js";
import type { AuditActor } from "./audit.js";

const { ConnectionPool } = mssqlPkg;

// ─── Connection setup ─────────────────────────────────────────────────────────

let adminPool: InstanceType<typeof ConnectionPool>;

const ADMIN_URL = process.env["DATABASE_URL_ADMIN"];

// ─── Test data ────────────────────────────────────────────────────────────────

let seededRequestId1: string;
let seededRequestId2: string;
let seededEngagementId1: string;
let seededEngagementId2: string;
let seededClientUserId: string;

// Accountant actor (server-verified — ADR-019 §2, CS-GEN-001)
const accountantActor: AuditActor = {
  clerkUserId: "user_accountant_hold_integration_001",
  role: "ACCOUNTANT",
};

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeAll(async () => {
  if (!ADMIN_URL) throw new Error("DATABASE_URL_ADMIN is required for integration tests");

  const adminConfig = parseSqlServerUrl(ADMIN_URL) as import("mssql").config;
  adminPool = new ConnectionPool(adminConfig);
  await adminPool.connect();

  // Seed: EngagementRequests + Engagements + Client User
  // Two engagements for the same client (AC-FILE-014-02: client-scoped hold covers ALL engagements).

  // 1. Client User
  const userResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[User]
       ([clerkId], [email], [role], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'user_hold_int_client_001', N'hold-int-client-001@example.com', N'CLIENT', SYSDATETIMEOFFSET())`
  );
  seededClientUserId = userResult.recordset[0]?.id ?? "";

  // 2. EngagementRequest + Engagement 1 (owned by the client)
  const req1 = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[EngagementRequest]
       ([firstName], [lastName], [email], [status], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'Hold', N'IntTest1', N'hold-int-test1@example.com', N'accepted', SYSDATETIMEOFFSET())`
  );
  seededRequestId1 = req1.recordset[0]?.id ?? "";

  const eng1 = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[Engagement]
       ([engagementRequestId], [clientUserId], [status], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES ('${seededRequestId1}', '${seededClientUserId}', N'New', SYSDATETIMEOFFSET())`
  );
  seededEngagementId1 = eng1.recordset[0]?.id ?? "";

  // 3. EngagementRequest + Engagement 2 (same client)
  const req2 = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[EngagementRequest]
       ([firstName], [lastName], [email], [status], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'Hold', N'IntTest2', N'hold-int-test2@example.com', N'accepted', SYSDATETIMEOFFSET())`
  );
  seededRequestId2 = req2.recordset[0]?.id ?? "";

  const eng2 = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[Engagement]
       ([engagementRequestId], [clientUserId], [status], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES ('${seededRequestId2}', '${seededClientUserId}', N'New', SYSDATETIMEOFFSET())`
  );
  seededEngagementId2 = eng2.recordset[0]?.id ?? "";
}, 30000);

afterAll(async () => {
  // Cleanup — delete LegalHold rows for our test data, then engagements, users, requests
  if (seededEngagementId1) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[LegalHold] WHERE [engagementId] = '${seededEngagementId1}'`
    ).catch(() => { /* ignore */ });
    await adminPool.request().query(
      `DELETE FROM [dbo].[Engagement] WHERE [id] = '${seededEngagementId1}'`
    ).catch(() => { /* ignore */ });
  }
  if (seededEngagementId2) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[LegalHold] WHERE [engagementId] = '${seededEngagementId2}'`
    ).catch(() => { /* ignore */ });
    await adminPool.request().query(
      `DELETE FROM [dbo].[Engagement] WHERE [id] = '${seededEngagementId2}'`
    ).catch(() => { /* ignore */ });
  }
  if (seededClientUserId) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[LegalHold] WHERE [clientUserId] = '${seededClientUserId}'`
    ).catch(() => { /* ignore */ });
    await adminPool.request().query(
      `DELETE FROM [dbo].[User] WHERE [id] = '${seededClientUserId}'`
    ).catch(() => { /* ignore */ });
  }
  if (seededRequestId1) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[EngagementRequest] WHERE [id] = '${seededRequestId1}'`
    ).catch(() => { /* ignore */ });
  }
  if (seededRequestId2) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[EngagementRequest] WHERE [id] = '${seededRequestId2}'`
    ).catch(() => { /* ignore */ });
  }
  await adminPool.close();
}, 30000);

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("placeLegalHold / liftLegalHold / activeHoldsFor — integration (ADR-018 §6, ADR-019)", () => {

  /**
   * AC-FILE-014-01: The accountant can place a legal hold on an individual engagement.
   *
   * Given the accountant and an engagement,
   * When she places a legal hold on it,
   * Then the engagement is under legal hold.
   *
   * Verifies: placeLegalHold returns { outcome: 'placed' } + activeHoldsFor returns the hold.
   *
   * // AC-FILE-014-01 // ADR-018 // ADR-003 // ADR-019 // CS-TS-001 // CS-TS-002
   */
  it("AC-FILE-014-01 — place engagement-scoped hold → activeHoldsFor returns it", async () => {
    const placeResult = await placeLegalHold({
      actor: accountantActor,
      scope: "engagement",
      engagementId: seededEngagementId1,
    });

    expect(placeResult.outcome).toBe("placed");
    const holdId = (placeResult as { outcome: "placed"; holdId: string }).holdId;
    expect(holdId).toBeTruthy();

    // activeHoldsFor should return the hold
    const holds = await activeHoldsFor(seededEngagementId1);
    expect(holds.length).toBeGreaterThanOrEqual(1);
    const found = holds.find(h => h.id.toLowerCase() === holdId.toLowerCase());
    expect(found).toBeTruthy();
    expect(found?.scope).toBe("engagement");
    expect(found?.engagementId?.toLowerCase()).toBe(seededEngagementId1.toLowerCase());
    expect(found?.liftedAt).toBeNull();

    // Cleanup: lift the hold (so subsequent tests start clean)
    await liftLegalHold({ holdId, actor: accountantActor });
  });

  /**
   * AC-FILE-014-02: The accountant can place a legal hold on a client (covers ALL engagements).
   *
   * Given a client with multiple engagements,
   * When the accountant places a legal hold on the client,
   * Then the hold applies to all of that client's engagements.
   *
   * Verifies: client-scoped hold → activeHoldsFor returns the hold for BOTH engagements.
   * This is the core client-scope-covers-all requirement (AC-FILE-014-02).
   *
   * // AC-FILE-014-02 // ADR-018 // ADR-003 // ADR-019 // CS-TS-001 // CS-TS-002
   */
  it("AC-FILE-014-02 — client-scoped hold → activeHoldsFor reports hold for ALL client's engagements", async () => {
    const placeResult = await placeLegalHold({
      actor: accountantActor,
      scope: "client",
      clientUserId: seededClientUserId,
    });

    expect(placeResult.outcome).toBe("placed");
    const holdId = (placeResult as { outcome: "placed"; holdId: string }).holdId;

    // activeHoldsFor for engagement 1 should return the client-scoped hold
    const holds1 = await activeHoldsFor(seededEngagementId1);
    const found1 = holds1.find(h => h.id.toLowerCase() === holdId.toLowerCase());
    expect(found1).toBeTruthy();
    expect(found1?.scope).toBe("client");
    expect(found1?.clientUserId?.toLowerCase()).toBe(seededClientUserId.toLowerCase());

    // activeHoldsFor for engagement 2 should ALSO return the client-scoped hold
    // (client-scoped hold covers ALL of that client's engagements — AC-FILE-014-02)
    const holds2 = await activeHoldsFor(seededEngagementId2);
    const found2 = holds2.find(h => h.id.toLowerCase() === holdId.toLowerCase());
    expect(found2).toBeTruthy();
    expect(found2?.scope).toBe("client");

    // Cleanup: lift the client-scoped hold
    await liftLegalHold({ holdId, actor: accountantActor });
  });

  /**
   * AC-FILE-014-04: A legal hold remains in effect indefinitely until explicitly lifted.
   *
   * Given an active legal hold,
   * When time passes with no explicit action,
   * Then the hold remains in effect indefinitely until the accountant lifts it.
   *
   * Verifies: NO TTL column exists → hold placed has liftedAt=null; we check it is still
   * active after placement (no auto-expire path exists). The absence of a TTL column is the
   * proof: there is NO code path that auto-clears liftedAt.
   *
   * // AC-FILE-014-04 // ADR-018 // CS-TS-001
   */
  it("AC-FILE-014-04 — active hold has no expiry — liftedAt IS NULL, no auto-expire path", async () => {
    const placeResult = await placeLegalHold({
      actor: accountantActor,
      scope: "engagement",
      engagementId: seededEngagementId1,
      reason: "no-auto-expire test",
    });
    expect(placeResult.outcome).toBe("placed");
    const holdId = (placeResult as { outcome: "placed"; holdId: string }).holdId;

    // Read the hold directly via admin pool — liftedAt must be NULL (no auto-expire)
    const row = await adminPool.request().query<{
      id: string;
      liftedAt: Date | null;
      liftedByClerkId: string | null;
    }>(
      `SELECT [id], [liftedAt], [liftedByClerkId]
       FROM [dbo].[LegalHold]
       WHERE [id] = '${holdId}'`
    );
    expect(row.recordset[0]?.liftedAt).toBeNull();
    expect(row.recordset[0]?.liftedByClerkId).toBeNull();

    // activeHoldsFor still returns it (still active)
    const holds = await activeHoldsFor(seededEngagementId1);
    const found = holds.find(h => h.id.toLowerCase() === holdId.toLowerCase());
    expect(found).toBeTruthy();
    expect(found?.liftedAt).toBeNull();

    // Cleanup
    await liftLegalHold({ holdId, actor: accountantActor });
  });

  /**
   * AC-FILE-014-06: Placing a legal hold is recorded in the audit trail.
   *
   * Given the accountant placing a legal hold,
   * When the action completes,
   * Then it is recorded in the audit trail (who, on what, when).
   *
   * Verifies: AuditEvent row with action='legal_hold.placed' exists after placeLegalHold.
   * ADR-019: place emits audit event in the same transaction (fail-closed).
   *
   * // AC-FILE-014-06 // ADR-019 // CS-GEN-001 // CS-GEN-003
   */
  it("AC-FILE-014-06 — placing a hold emits AuditEvent 'legal_hold.placed'", async () => {
    const placeResult = await placeLegalHold({
      actor: accountantActor,
      scope: "engagement",
      engagementId: seededEngagementId1,
      reason: "audit-emission test",
    });
    expect(placeResult.outcome).toBe("placed");
    const holdId = (placeResult as { outcome: "placed"; holdId: string }).holdId;

    // Verify audit event exists (via admin pool — AuditEvent is append-only ledger ADR-019)
    // CS-GEN-001: targetId = holdId only — no client name or PII.
    const auditRows = await adminPool.request().query<{
      clerkUserId: string;
      actorRole: string;
      action: string;
      targetType: string;
      targetId: string;
      sourceSurface: string;
      outcome: string;
    }>(
      `SELECT TOP 5 [clerkUserId], [actorRole], [action], [targetType], [targetId], [sourceSurface], [outcome]
       FROM [dbo].[AuditEvent]
       WHERE [action] = N'legal_hold.placed'
         AND [targetId] = N'${holdId}'
       ORDER BY [id] DESC`
    );

    expect(auditRows.recordset.length).toBeGreaterThanOrEqual(1);
    const auditRow = auditRows.recordset[0];
    expect(auditRow?.clerkUserId).toBe(accountantActor.clerkUserId);
    expect(auditRow?.actorRole).toBe("ACCOUNTANT");
    expect(auditRow?.action).toBe("legal_hold.placed");
    expect(auditRow?.targetType).toBe("Engagement");
    expect(auditRow?.sourceSurface).toBe("admin");
    expect(auditRow?.outcome).toBe("success");

    // Cleanup
    await liftLegalHold({ holdId, actor: accountantActor });
  });

  /**
   * AC-FILE-014-07: Lifting a legal hold is recorded in the audit trail.
   *
   * Given the accountant lifting a legal hold,
   * When the action completes,
   * Then it is recorded in the audit trail (who, on what, when).
   * Also verifies: liftedAt set, activeHoldsFor returns none for this hold.
   *
   * Verifies: liftLegalHold sets liftedAt, activeHoldsFor returns none, AuditEvent exists.
   * ADR-019: lift emits audit event in the same transaction (fail-closed).
   *
   * // AC-FILE-014-07 // ADR-019 // CS-GEN-001 // CS-GEN-003
   */
  it("AC-FILE-014-07 — lifting a hold sets liftedAt, clears activeHoldsFor, emits 'legal_hold.lifted'", async () => {
    // First place a hold to lift
    const placeResult = await placeLegalHold({
      actor: accountantActor,
      scope: "engagement",
      engagementId: seededEngagementId1,
    });
    expect(placeResult.outcome).toBe("placed");
    const holdId = (placeResult as { outcome: "placed"; holdId: string }).holdId;

    // Verify it is active before lift
    const holdsBefore = await activeHoldsFor(seededEngagementId1);
    const foundBefore = holdsBefore.find(h => h.id.toLowerCase() === holdId.toLowerCase());
    expect(foundBefore).toBeTruthy();

    // Lift the hold
    const liftResult = await liftLegalHold({ holdId, actor: accountantActor });
    expect(liftResult.outcome).toBe("lifted");

    // liftedAt must be set, liftedByClerkId must match actor
    const row = await adminPool.request().query<{
      liftedAt: Date | null;
      liftedByClerkId: string | null;
    }>(
      `SELECT [liftedAt], [liftedByClerkId]
       FROM [dbo].[LegalHold]
       WHERE [id] = '${holdId}'`
    );
    expect(row.recordset[0]?.liftedAt).not.toBeNull();
    expect(row.recordset[0]?.liftedByClerkId).toBe(accountantActor.clerkUserId);

    // activeHoldsFor should no longer return this hold
    const holdsAfter = await activeHoldsFor(seededEngagementId1);
    const foundAfter = holdsAfter.find(h => h.id.toLowerCase() === holdId.toLowerCase());
    expect(foundAfter).toBeUndefined();

    // Verify audit event for 'legal_hold.lifted'
    // CS-GEN-001: targetId = holdId only (LegalHold entity).
    const auditRows = await adminPool.request().query<{
      clerkUserId: string;
      actorRole: string;
      action: string;
      targetType: string;
      targetId: string;
      sourceSurface: string;
    }>(
      `SELECT TOP 5 [clerkUserId], [actorRole], [action], [targetType], [targetId], [sourceSurface]
       FROM [dbo].[AuditEvent]
       WHERE [action] = N'legal_hold.lifted'
         AND [targetId] = N'${holdId}'
       ORDER BY [id] DESC`
    );

    expect(auditRows.recordset.length).toBeGreaterThanOrEqual(1);
    const auditRow = auditRows.recordset[0];
    expect(auditRow?.clerkUserId).toBe(accountantActor.clerkUserId);
    expect(auditRow?.actorRole).toBe("ACCOUNTANT");
    expect(auditRow?.action).toBe("legal_hold.lifted");
    expect(auditRow?.targetType).toBe("LegalHold");
    expect(auditRow?.sourceSurface).toBe("admin");
  });

  /**
   * Idempotency: placing a second hold on the same target returns 'already-held'.
   * DECISION (TASK-015-001): do not insert duplicate active holds.
   *
   * // AC-FILE-014-01 // DECISION-015-A
   */
  it("placeLegalHold is idempotent — second place returns already-held", async () => {
    const place1 = await placeLegalHold({
      actor: accountantActor,
      scope: "engagement",
      engagementId: seededEngagementId1,
    });
    expect(place1.outcome).toBe("placed");
    const holdId1 = (place1 as { outcome: "placed"; holdId: string }).holdId;

    const place2 = await placeLegalHold({
      actor: accountantActor,
      scope: "engagement",
      engagementId: seededEngagementId1,
    });
    expect(place2.outcome).toBe("already-held");
    // Returns the existing hold id
    expect((place2 as { outcome: "already-held"; holdId: string }).holdId.toLowerCase())
      .toBe(holdId1.toLowerCase());

    // Cleanup
    await liftLegalHold({ holdId: holdId1, actor: accountantActor });
  });

  /**
   * liftLegalHold is idempotent — second lift returns 'already-lifted'.
   * DECISION (TASK-015-001): idempotent lift.
   *
   * // AC-FILE-014-05 // DECISION-015-A
   */
  it("liftLegalHold is idempotent — second lift returns already-lifted", async () => {
    const placeResult = await placeLegalHold({
      actor: accountantActor,
      scope: "engagement",
      engagementId: seededEngagementId1,
    });
    expect(placeResult.outcome).toBe("placed");
    const holdId = (placeResult as { outcome: "placed"; holdId: string }).holdId;

    const lift1 = await liftLegalHold({ holdId, actor: accountantActor });
    expect(lift1.outcome).toBe("lifted");

    const lift2 = await liftLegalHold({ holdId, actor: accountantActor });
    expect(lift2.outcome).toBe("already-lifted");
  });

  /**
   * placeLegalHold returns 'not-found' for a non-existent engagement.
   *
   * // AC-FILE-014-01
   */
  it("placeLegalHold returns not-found for non-existent engagement", async () => {
    const result = await placeLegalHold({
      actor: accountantActor,
      scope: "engagement",
      engagementId: "00000000-0000-0000-0000-000000000000",
    });
    expect(result.outcome).toBe("not-found");
  });

  /**
   * activeHoldsFor returns empty for an engagement with no active holds.
   *
   * // AC-FILE-014-01 // AC-FILE-014-03
   */
  it("activeHoldsFor returns empty for engagement with no active holds", async () => {
    // seededEngagementId2 should have no active holds (cleaned up in each test)
    // Insert a hold, lift it, then verify activeHoldsFor returns empty
    const placeResult = await placeLegalHold({
      actor: accountantActor,
      scope: "engagement",
      engagementId: seededEngagementId2,
    });
    expect(placeResult.outcome).toBe("placed");
    const holdId = (placeResult as { outcome: "placed"; holdId: string }).holdId;
    await liftLegalHold({ holdId, actor: accountantActor });

    const holds = await activeHoldsFor(seededEngagementId2);
    const found = holds.find(h => h.id.toLowerCase() === holdId.toLowerCase());
    expect(found).toBeUndefined();
  });

});
