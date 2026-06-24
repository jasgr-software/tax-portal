/**
 * packages/db/src/purge.integration.test.ts
 *
 * TIER-3 INTEGRATION TEST — requires real SQL Server (ADR-012 § Tier 3).
 *
 * Tests purgeEngagement — the admin-pool, accountant-confirmed, never-automatic
 * physical purge of engagement document data + storage bytes + audit survival.
 * TASK-015-002 / BRIEF-015 / EPIC-015.
 *
 * Acceptance criteria covered (AC-id test-tag contract, per BRIEF-015 gherkin methodology):
 *
 *   AC-FILE-013-03 — Explicit confirmation is required.
 *     purgeEngagement without confirmed=true → no rows removed, outcome 'not-confirmed'.
 *
 *   AC-FILE-013-04 — Expiry never triggers an automatic purge.
 *   AC-FILE-013-05 — Eligible-but-unpurged data stays accessible and retained.
 *     An expired-but-unconfirmed engagement's documents remain readable + retained.
 *
 *   AC-FILE-013-06 — Each purge is recorded in the audit trail; the audit record is not removed.
 *   AC-NFR-010-07  — Audit records for the engagement survive the purge.
 *     After a confirmed purge: Document + DocumentVersion rows gone; AuditEvent rows REMAIN.
 *
 *   AC-FILE-015-01 — In-window erasure = access-revocation only; no physical removal.
 *   AC-FILE-015-02 — Physical destruction not possible until window elapsed + no hold + confirmed.
 *     In-window purge is refused; nothing physically removed.
 *
 * NEVER-AUTOMATIC evidence (ADR-018 §5):
 *   There is no cron/scheduled/auto-trigger path to purgeEngagement.
 *   An expired engagement without explicit confirmed=true has its data readable after the call.
 *
 * AUDIT-SURVIVES-PURGE evidence (ADR-019 §5 / AC-NFR-010-07):
 *   After confirmed purge, the AuditEvent rows for the engagement — including the
 *   'engagement.purged' row — remain in the AuditEvent table (it is excluded from the sweep).
 *
 * Storage: uses MemoryAdapter (STORAGE_ADAPTER=memory) so storage.delete() is in-process.
 * Storage keys are pre-seeded into the MemoryAdapter via getStorage().put() before each test
 * so that delete() calls are verifiable via getStorage().stat(key) === null post-purge.
 * The singleton is reset via resetStorageForTesting() between tests.
 *
 * ADR-003: admin pool for all write operations (no SESSION_CONTEXT needed for admin pool). // ADR-003
 * ADR-005: admin pool bypasses RLS — purge uses admin pool for the physical DELETE. // ADR-005
 * ADR-009: storage bytes removed per DocumentVersion.storageKey (two-track lifecycle). // ADR-009
 * ADR-018 §5: post-retention purge; never automatic; confirmed required. // ADR-018
 * ADR-019: audit event 'engagement.purged' in same transaction (fail-closed). // ADR-019
 *
 * CS-TS-001: all DB paths through packages/db (admin pool via withAuditTransaction). // CS-TS-001
 * CS-TS-002: admin pool accessed only via getAdminPool inside withAuditTransaction. // CS-TS-002
 * CS-GEN-001: no PII in audit targetId — engagementId only. // CS-GEN-001
 * CS-GEN-002: additive — new test file, no existing test modified. // CS-GEN-002
 * CS-GEN-003: governing keys cited throughout. // CS-GEN-003
 * CS-SQL-002: physical DELETE is on the admin-pool / raw-SQL track (Prisma cannot express it). // CS-SQL-002
 *
 * // ADR-003 // ADR-005 // ADR-009 // ADR-018 // ADR-019 // OQ-014-01
 * // AC-FILE-013-03 // AC-FILE-013-04 // AC-FILE-013-05 // AC-FILE-013-06
 * // AC-FILE-015-01 // AC-FILE-015-02 // AC-NFR-010-07
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import mssqlPkg from "mssql";
import { parseSqlServerUrl } from "./sql-server-url.js";
import { purgeEngagement } from "./repositories/purge.js";
import { placeLegalHold } from "./repositories/legal-hold.js";
import { RETENTION_WINDOW_YEARS } from "./repositories/retention.js";
import type { AuditActor } from "./audit.js";
import { getStorage, resetStorageForTesting } from "@tax-portal/storage";

const { ConnectionPool } = mssqlPkg;

// ─── Connection setup ─────────────────────────────────────────────────────────

let adminPool: InstanceType<typeof ConnectionPool>;

const ADMIN_URL = process.env["DATABASE_URL_ADMIN"];

// ─── Test actor (accountant — server-verified, ADR-019 §2) ────────────────────

const accountantActor: AuditActor = {
  clerkUserId: "user_accountant_purge_integration_001",
  role: "ACCOUNTANT",
};

// ─── Seed data IDs ────────────────────────────────────────────────────────────

let seededClientUserId: string;
let seededRequestId: string;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * CompletedAt date in the distant past so the retention window has elapsed.
 * // ADR-018 §3 // DECISION-014-F
 */
function expiredCompletedAt(): string {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - (RETENTION_WINDOW_YEARS + 1));
  return d.toISOString();
}

/**
 * CompletedAt date 1 year ago — window has NOT elapsed (6 years remaining for default 7-year window).
 * // ADR-018 §3 // DECISION-014-F
 */
function inWindowCompletedAt(): string {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - 1);
  return d.toISOString();
}

/**
 * Count Document rows in the DB for a given engagementId.
 */
async function countDocumentRows(engId: string): Promise<number> {
  const result = await adminPool.request().query<{ cnt: number }>(
    `SELECT COUNT(*) AS cnt FROM [dbo].[Document] WHERE [engagementId] = '${engId}'`
  );
  return result.recordset[0]?.cnt ?? 0;
}

/**
 * Count DocumentVersion rows for all Documents in a given engagementId.
 */
async function countDocumentVersionRows(engId: string): Promise<number> {
  const result = await adminPool.request().query<{ cnt: number }>(
    `SELECT COUNT(*) AS cnt FROM [dbo].[DocumentVersion] dv
     INNER JOIN [dbo].[Document] d ON d.[id] = dv.[documentId]
     WHERE d.[engagementId] = '${engId}'`
  );
  return result.recordset[0]?.cnt ?? 0;
}

/**
 * Count AuditEvent rows for a given targetId (engagementId).
 * Used to prove audit-survives-purge (AC-NFR-010-07).
 * // AC-NFR-010-07 // ADR-019 §5
 */
async function countAuditEventRows(targetId: string): Promise<number> {
  const result = await adminPool.request().query<{ cnt: number }>(
    `SELECT COUNT(*) AS cnt FROM [dbo].[AuditEvent]
     WHERE [targetId] = '${targetId}'`
  );
  return result.recordset[0]?.cnt ?? 0;
}

/**
 * Count AuditEvent rows for a given targetId AND action.
 */
async function countAuditEventRowsForAction(targetId: string, action: string): Promise<number> {
  const result = await adminPool.request().query<{ cnt: number }>(
    `SELECT COUNT(*) AS cnt FROM [dbo].[AuditEvent]
     WHERE [targetId] = '${targetId}' AND [action] = '${action}'`
  );
  return result.recordset[0]?.cnt ?? 0;
}

/**
 * Seed an engagement with one Document + one DocumentVersion.
 * Seeds the storage key into the MemoryAdapter.
 * Returns { engId, realStorageKey }.
 *
 * @param completedAtIso — ISO string for completedAt, or null for not-completed.
 */
async function seedEngagementWithDocument(completedAtIso: string | null): Promise<{
  engId: string;
  realStorageKey: string;
}> {
  const completedAtParam = completedAtIso ? `'${completedAtIso}'` : "NULL";

  const engResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[Engagement]
       ([engagementRequestId], [clientUserId], [status], [completedAt], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES ('${seededRequestId}', '${seededClientUserId}', N'Complete', ${completedAtParam}, SYSDATETIMEOFFSET())`
  );
  const engId = engResult.recordset[0]?.id ?? "";

  // Insert a Document row with a placeholder storageKey
  const docResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[Document]
       ([engagementId], [storageKey], [originalFilename], [contentType],
        [sizeBytes], [status], [version], [uploadedBy], [deletedAt], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (
       '${engId}',
       N'__placeholder__',
       N'purge-test.pdf',
       N'application/pdf',
       1234,
       N'active',
       1,
       N'${accountantActor.clerkUserId}',
       NULL,
       SYSDATETIMEOFFSET()
     )`
  );
  const docId = docResult.recordset[0]?.id ?? "";

  // Real storage key uses the actual document id
  const realStorageKey = `engagements/${engId}/documents/${docId}/v1/purge-test.pdf`;

  // Update the Document storageKey with the real key
  await adminPool.request().query(
    `UPDATE [dbo].[Document]
     SET [storageKey] = N'${realStorageKey}', [updatedAt] = SYSDATETIMEOFFSET()
     WHERE [id] = '${docId}'`
  );

  // Insert a DocumentVersion row
  await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[DocumentVersion]
       ([documentId], [version], [storageKey], [uploadedBy], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (
       '${docId}',
       1,
       N'${realStorageKey}',
       N'${accountantActor.clerkUserId}',
       SYSDATETIMEOFFSET()
     )`
  );

  // Seed the storage key into the MemoryAdapter (via the singleton)
  // ADR-009: the bytes must be present before the purge so delete() is observable.
  await getStorage().put({
    key: realStorageKey,
    body: Buffer.from("fake-content-for-purge-test"),
    contentType: "application/pdf",
  });

  return { engId, realStorageKey };
}

/**
 * Cleanup an engagement and its documents (used in tests that do NOT call purgeEngagement(confirmed=true)).
 */
async function cleanupEngagement(engId: string): Promise<void> {
  await adminPool.request().query(
    `DELETE FROM [dbo].[DocumentVersion] WHERE [documentId] IN (SELECT [id] FROM [dbo].[Document] WHERE [engagementId] = '${engId}')`
  ).catch(() => { /* ignore */ });
  await adminPool.request().query(`DELETE FROM [dbo].[Document] WHERE [engagementId] = '${engId}'`).catch(() => { /* ignore */ });
  await adminPool.request().query(`DELETE FROM [dbo].[LegalHold] WHERE [engagementId] = '${engId}'`).catch(() => { /* ignore */ });
  await adminPool.request().query(`DELETE FROM [dbo].[Engagement] WHERE [id] = '${engId}'`).catch(() => { /* ignore */ });
}

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeAll(async () => {
  if (!ADMIN_URL) throw new Error("DATABASE_URL_ADMIN is required for integration tests");

  const adminConfig = parseSqlServerUrl(ADMIN_URL) as import("mssql").config;
  adminPool = new ConnectionPool(adminConfig);
  await adminPool.connect();

  // Seed shared: a client User
  const userResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[User]
       ([clerkId], [email], [role], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'user_purge_int_client_001', N'purge-int-client-001@example.com', N'CLIENT', SYSDATETIMEOFFSET())`
  );
  seededClientUserId = userResult.recordset[0]?.id ?? "";

  // Seed shared: an EngagementRequest
  const reqResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[EngagementRequest]
       ([firstName], [lastName], [email], [status], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'Purge', N'IntTest', N'purge-int-req@example.com', N'accepted', SYSDATETIMEOFFSET())`
  );
  seededRequestId = reqResult.recordset[0]?.id ?? "";

  // Use the MemoryAdapter for storage so storage.delete() is in-process and verifiable.
  // STORAGE_ADAPTER=memory → MemoryAdapter (no Azurite round-trip needed for byte assertions).
  process.env["STORAGE_ADAPTER"] = "memory";
}, 30000);

beforeEach(() => {
  // Reset the storage singleton before each test so each test gets a fresh MemoryAdapter.
  // getStorage() will re-create the adapter from STORAGE_ADAPTER=memory.
  resetStorageForTesting();
});

afterAll(async () => {
  resetStorageForTesting();
  // Cleanup shared seed data.
  if (seededClientUserId) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[LegalHold] WHERE [clientUserId] = '${seededClientUserId}'`
    ).catch(() => { /* ignore */ });
    // Clean up any leftover engagements
    const engResult = await adminPool.request().query<{ id: string }>(
      `SELECT [id] FROM [dbo].[Engagement] WHERE [clientUserId] = '${seededClientUserId}'`
    ).catch(() => ({ recordset: [] as Array<{ id: string }> }));
    for (const eng of engResult.recordset) {
      await adminPool.request().query(
        `DELETE FROM [dbo].[DocumentVersion] WHERE [documentId] IN (SELECT [id] FROM [dbo].[Document] WHERE [engagementId] = '${eng.id}')`
      ).catch(() => { /* ignore */ });
      await adminPool.request().query(
        `DELETE FROM [dbo].[Document] WHERE [engagementId] = '${eng.id}'`
      ).catch(() => { /* ignore */ });
      await adminPool.request().query(
        `DELETE FROM [dbo].[LegalHold] WHERE [engagementId] = '${eng.id}'`
      ).catch(() => { /* ignore */ });
      await adminPool.request().query(
        `DELETE FROM [dbo].[Engagement] WHERE [id] = '${eng.id}'`
      ).catch(() => { /* ignore */ });
    }
    await adminPool.request().query(
      `DELETE FROM [dbo].[User] WHERE [id] = '${seededClientUserId}'`
    ).catch(() => { /* ignore */ });
  }
  if (seededRequestId) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[EngagementRequest] WHERE [id] = '${seededRequestId}'`
    ).catch(() => { /* ignore */ });
  }
  await adminPool.close();
  delete process.env["STORAGE_ADAPTER"];
}, 30000);

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("purgeEngagement — integration (ADR-018 §5, ADR-019, ADR-009)", () => {

  /**
   * [AC-FILE-013-03] purgeEngagement WITHOUT explicit confirmation → no rows removed, 'not-confirmed'.
   *
   * Gherkin:
   *   Given a purge-eligible engagement and the accountant initiating a purge
   *   When she has not explicitly confirmed it
   *   Then no data is permanently removed until she confirms
   *
   * NEVER-AUTOMATIC + explicit-confirmation gate.
   * Regardless of eligibility, no data removed unless confirmed=true.
   *
   * // AC-FILE-013-03 // ADR-018 §5
   */
  it("[AC-FILE-013-03] no confirmation → no rows removed, outcome not-confirmed", async () => {
    const { engId, realStorageKey } = await seedEngagementWithDocument(expiredCompletedAt());

    const result = await purgeEngagement({
      engagementId: engId,
      actor: accountantActor,
      confirmed: false, // no confirmation — AC-FILE-013-03
    });

    expect(result.outcome).toBe("not-confirmed");

    // Document row still exists (no data removed)
    const docCount = await countDocumentRows(engId);
    expect(docCount).toBeGreaterThanOrEqual(1);

    // Storage key still present (storage.delete was NOT called)
    const stat = await getStorage().stat(realStorageKey);
    expect(stat).not.toBeNull();

    await cleanupEngagement(engId);
  }, 30000);

  /**
   * [AC-FILE-013-04 / AC-FILE-013-05] Expired-but-unconfirmed data stays readable + retained.
   *
   * Gherkin (AC-FILE-013-04):
   *   Given an engagement whose retention window has just elapsed
   *   When no accountant action is taken
   *   Then the system does not automatically purge it; expiry only creates eligibility
   *
   * Gherkin (AC-FILE-013-05):
   *   Given a purge-eligible engagement the accountant has not yet purged
   *   When its data is accessed
   *   Then it remains accessible and retained until she explicitly confirms removal
   *
   * NEVER-AUTOMATIC proof: there is no auto-trigger; the data remains readable after expiry.
   *
   * // AC-FILE-013-04 // AC-FILE-013-05 // ADR-018 §5
   */
  it("[AC-FILE-013-04/05] expired-but-unconfirmed docs stay readable + retained (never-automatic)", async () => {
    const { engId, realStorageKey } = await seedEngagementWithDocument(expiredCompletedAt());

    // No confirmation — simulates "expiry with no accountant action taken"
    const result = await purgeEngagement({
      engagementId: engId,
      actor: accountantActor,
      confirmed: false,
    });

    expect(result.outcome).toBe("not-confirmed");

    // Data is still in the DB — eligible-but-unpurged data stays readable (AC-FILE-013-05)
    const docCount = await countDocumentRows(engId);
    expect(docCount).toBeGreaterThanOrEqual(1);

    // Storage key still present — bytes not removed (AC-FILE-013-04 / never-automatic)
    const stat = await getStorage().stat(realStorageKey);
    expect(stat).not.toBeNull();

    await cleanupEngagement(engId);
  }, 30000);

  /**
   * [AC-FILE-013-06 / AC-NFR-010-07] Eligible + confirmed → rows gone, storage deleted per key,
   * 'engagement.purged' audit emitted; AuditEvent rows survive the purge.
   *
   * Gherkin (AC-FILE-013-06):
   *   Given a confirmed purge of an engagement's data
   *   When the audit trail is examined afterward
   *   Then the purge is recorded and that audit record is not removed by the purge
   *
   * Gherkin (AC-NFR-010-07):
   *   Given an engagement whose data has been purged
   *   When the audit trail for that engagement is examined
   *   Then its audit records — including the purge event — are not removed; they survive the purge
   *
   * Gate-Authoring Evidence (introduces_gate: yes):
   *   1. Run marker: this test "AC-FILE-013-06/AC-NFR-010-07 — eligible+confirmed → purged".
   *      File: packages/db/src/purge.integration.test.ts.
   *   2. Named code path: purgeEngagement in packages/db/src/repositories/purge.ts —
   *      Steps 5 (DELETE DocumentVersion + Document) EXPLICITLY EXCLUDE [dbo].[AuditEvent].
   *      Step 6 uses recordAuthEvent(action:'engagement.purged', txn) — it INSERTs into
   *      AuditEvent in the SAME transaction but is NOT a DELETE target.
   *      // DECISION: AuditEvent excluded from purge sweep — ADR-019 §5 // AC-NFR-010-07
   *   3. Counterfactual: if the sweep included AuditEvent (e.g.
   *      `DELETE FROM [dbo].[AuditEvent] WHERE [targetId] = @engagementId`),
   *      countAuditEventRows() and countAuditEventRowsForAction() would return 0,
   *      causing both assertions to fail.
   *
   * // AC-FILE-013-06 // AC-NFR-010-07 // ADR-019 §5 // ADR-009
   */
  it("[AC-FILE-013-06 / AC-NFR-010-07] eligible+confirmed → rows gone + storage.delete called + audit survives", async () => {
    const { engId, realStorageKey } = await seedEngagementWithDocument(expiredCompletedAt());

    // Before purge: document row exists, storage key present
    const docsBefore = await countDocumentRows(engId);
    expect(docsBefore).toBeGreaterThanOrEqual(1);
    const statBefore = await getStorage().stat(realStorageKey);
    expect(statBefore).not.toBeNull();

    // Confirmed purge
    const result = await purgeEngagement({
      engagementId: engId,
      actor: accountantActor,
      confirmed: true,
    });

    expect(result.outcome).toBe("purged");

    // Document + DocumentVersion rows are physically gone
    const docsAfter = await countDocumentRows(engId);
    expect(docsAfter).toBe(0);

    const versionsAfter = await countDocumentVersionRows(engId);
    expect(versionsAfter).toBe(0);

    // Storage bytes removed — storage.delete(key) was called per DocumentVersion key
    // ADR-009 two-track lifecycle: bytes removed coordinated with row delete.
    // CS-GEN-001: storage key is not logged (contains path information).
    // // ADR-009 // CS-GEN-001
    const statAfter = await getStorage().stat(realStorageKey);
    expect(statAfter).toBeNull(); // key deleted from MemoryAdapter

    // AUDIT-SURVIVES-PURGE:
    // The AuditEvent rows for this engagement — including 'engagement.purged' — are NOT removed.
    // DECISION: AuditEvent is excluded from the purge sweep (ADR-019 §5).
    // // AC-NFR-010-07 // AC-FILE-013-06 // ADR-019 §5
    const auditCount = await countAuditEventRows(engId);
    expect(auditCount).toBeGreaterThanOrEqual(1); // at least the 'engagement.purged' row

    const purgedAuditCount = await countAuditEventRowsForAction(engId, "engagement.purged");
    expect(purgedAuditCount).toBe(1); // exactly one 'engagement.purged' audit event

    // The engagement row itself is not removed by purgeEngagement (only doc data).
    await adminPool.request().query(`DELETE FROM [dbo].[Engagement] WHERE [id] = '${engId}'`).catch(() => { /* ignore */ });
  }, 30000);

  /**
   * [AC-FILE-015-01 / AC-FILE-015-02] In-window purge is refused; nothing physically removed.
   *
   * Gherkin (AC-FILE-015-01):
   *   Given a client erasure request during an engagement's retention window
   *   When it is honored
   *   Then no document or engagement data is physically removed
   *
   * Gherkin (AC-FILE-015-02):
   *   Given retained engagement data
   *   When physical destruction is attempted
   *   Then it is impossible until the window has elapsed and any legal hold is lifted,
   *   and then only via explicit accountant-confirmed purge
   *
   * Retention governs: no physical removal within the window.
   *
   * // AC-FILE-015-01 // AC-FILE-015-02 // ADR-018 §5
   */
  it("[AC-FILE-015-01 / AC-FILE-015-02] in-window purge refused — nothing physically removed", async () => {
    const { engId, realStorageKey } = await seedEngagementWithDocument(inWindowCompletedAt());

    // Confirmed purge — but engagement is in-window
    const result = await purgeEngagement({
      engagementId: engId,
      actor: accountantActor,
      confirmed: true,
    });

    // Refused — in-window; retention governs (AC-FILE-015-01/-02)
    expect(result.outcome).toBe("in-window");

    // Document row still exists — retention governs, no physical removal
    const docCount = await countDocumentRows(engId);
    expect(docCount).toBeGreaterThanOrEqual(1);

    // Storage key still present — bytes not removed
    const stat = await getStorage().stat(realStorageKey);
    expect(stat).not.toBeNull();

    await cleanupEngagement(engId);
  }, 30000);

  /**
   * Expired+held purge refused (blocked-by-hold, nothing removed).
   *
   * An expired engagement under an active legal hold cannot be purged.
   * purgeEngagement re-resolves eligibility server-side inside the transaction.
   *
   * // AC-FILE-014-03 // ADR-018 §6
   */
  it("[AC-FILE-014-03] expired+held purge refused — blocked-by-hold, nothing removed", async () => {
    const { engId, realStorageKey } = await seedEngagementWithDocument(expiredCompletedAt());

    // Place a legal hold on this engagement
    await placeLegalHold({
      actor: accountantActor,
      scope: "engagement",
      engagementId: engId,
    });

    // Confirmed purge — but hold is active
    const result = await purgeEngagement({
      engagementId: engId,
      actor: accountantActor,
      confirmed: true,
    });

    // Refused — blocked by hold (AC-FILE-014-03 / ADR-018 §6)
    expect(result.outcome).toBe("blocked-by-hold");

    // Document row still exists
    const docCount = await countDocumentRows(engId);
    expect(docCount).toBeGreaterThanOrEqual(1);

    // Storage key still present
    const stat = await getStorage().stat(realStorageKey);
    expect(stat).not.toBeNull();

    await cleanupEngagement(engId);
  }, 30000);

  /**
   * Not-found engagement returns 'not-found'.
   */
  it("not-found engagement → outcome not-found", async () => {
    const result = await purgeEngagement({
      engagementId: "00000000-0000-0000-0000-000000000000",
      actor: accountantActor,
      confirmed: true,
    });

    expect(result.outcome).toBe("not-found");
  }, 30000);

  /**
   * FAIL-CLOSED / ROLLBACK: if the audit INSERT throws mid-purge, the row DELETEs
   * are rolled back — Document + DocumentVersion rows survive.
   *
   * This is the regression test for the atomicity blocker:
   *   The bug — running DELETEs on the pool (autocommit) instead of the txn — means
   *   forcing recordAuthEvent to throw after the DELETEs would leave rows GONE with
   *   no audit record. With the fix, all statements run on the txn and rollback atomically.
   *
   * Test strategy:
   *   1. Spy on the audit module's recordAuthEvent and force it to throw for
   *      action='engagement.purged'.
   *   2. Call purgeEngagement(confirmed=true) on an eligible engagement.
   *   3. Assert the call throws (bubbles up from withAuditTransaction after rollback).
   *   4. Assert Document + DocumentVersion rows are STILL PRESENT (rolled back).
   *   5. Assert no 'engagement.purged' AuditEvent row exists.
   *   6. Assert storage.delete was NOT called (bytes deletion deferred post-commit).
   *
   * Mutation-test proof:
   *   This test goes RED against the original code (DELETEs on pool → autocommit →
   *   rows are gone even though the txn rolled back) and GREEN against the fix
   *   (DELETEs on txn → they roll back with the aborted audit INSERT).
   *
   * // AC-FILE-013-06 // AC-NFR-010-07 // ADR-019 §3 // ADR-009
   */
  it("[fail-closed] audit INSERT failure rolls back DELETEs — rows survive, no audit row, no storage delete", async () => {
    const { engId, realStorageKey } = await seedEngagementWithDocument(expiredCompletedAt());

    // Verify the rows exist before the attempted purge.
    expect(await countDocumentRows(engId)).toBeGreaterThanOrEqual(1);
    expect(await countDocumentVersionRows(engId)).toBeGreaterThanOrEqual(1);

    // Spy on recordAuthEvent (from the audit module loaded by purge.ts) and force it
    // to throw when the action is 'engagement.purged'.
    // This simulates a DB constraint / network error during the audit INSERT.
    // All other recordAuthEvent calls (e.g. hold placement) are allowed through.
    const auditModule = await import("./audit.js");
    const recordAuthEventSpy = vi
      .spyOn(auditModule, "recordAuthEvent")
      .mockImplementation(async (input) => {
        if (input.action === "engagement.purged") {
          throw new Error("[test-injection] forced audit INSERT failure");
        }
        // Pass through for any other action (not expected in this test).
        return auditModule.recordAuthEvent(input);
      });

    // purgeEngagement should throw — withAuditTransaction rolls back and re-throws.
    await expect(
      purgeEngagement({
        engagementId: engId,
        actor: accountantActor,
        confirmed: true,
      }),
    ).rejects.toThrow("[test-injection] forced audit INSERT failure");

    // Restore the spy immediately after the call.
    recordAuthEventSpy.mockRestore();

    // CRITICAL ASSERTIONS — prove the DELETEs were rolled back:

    // Document rows must still exist (rollback undid the DELETE).
    // If this fails, the DELETEs ran on the pool (autocommit) instead of the txn.
    const docsAfter = await countDocumentRows(engId);
    expect(docsAfter).toBeGreaterThanOrEqual(1); // rows survived rollback

    const versionsAfter = await countDocumentVersionRows(engId);
    expect(versionsAfter).toBeGreaterThanOrEqual(1); // rows survived rollback

    // No 'engagement.purged' audit row (the INSERT was the one that threw).
    const purgedAuditCount = await countAuditEventRowsForAction(engId, "engagement.purged");
    expect(purgedAuditCount).toBe(0); // no audit row — the txn rolled back

    // Storage bytes must NOT have been deleted (storage deletion is deferred to post-commit;
    // since the txn was rolled back, the post-commit step is never reached).
    const statAfter = await getStorage().stat(realStorageKey);
    expect(statAfter).not.toBeNull(); // bytes still present

    // Cleanup the engagement (the rows survived, so we need to clean up manually).
    await cleanupEngagement(engId);
  }, 30000);

});
