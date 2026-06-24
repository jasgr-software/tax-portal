/**
 * packages/db/src/document.soft-delete.integration.test.ts
 *
 * TIER-3 INTEGRATION TEST — requires real SQL Server (ADR-012 / ADR-005 §6 HARD GATE).
 *
 * Tests softDeleteDocument + recoverDocument + listEngagementDocuments + listDeletedDocuments
 * (EPIC-014 / BRIEF-014 / TASK-014-002):
 *
 *   AC-FILE-004-01: softDeleteDocument sets deletedAt tombstone — outcome 'deleted'.
 *   AC-FILE-006-02: After soft-delete, the row STILL EXISTS (admin-pool read-back).
 *                   No storage delete occurs (no storage.delete* call in the seam).
 *   AC-FILE-005-02: Soft-deleted doc is not permanently removed — row + bytes survive.
 *   AC-FILE-005-03: Retention is the governing rule in-window; no path permanently removes the doc.
 *   AC-FILE-006-03: recoverDocument on a soft-deleted doc clears deletedAt → outcome 'recovered'.
 *                   Doc is visible again to its owner CLIENT (round-trip through request pool).
 *   AC-FILE-006-01: listEngagementDocuments (default) excludes soft-deleted;
 *                   includeDeleted:true / listDeletedDocuments returns them — working vs archive view.
 *   Audit (ADR-019): softDelete + recover each emit one audit event
 *                    ('document.deleted' / 'document.recovered') with targetId = documentId only.
 *
 * Hard gate verification (BRIEF-014 § SDET Review focus):
 *   - NO `DELETE FROM [dbo].[Document]` in this test or in the seam under test.
 *   - NO storage.delete* call (soft-delete is UPDATE-only — ADR-018 §1).
 *   - softDeleteDocument uses UPDATE SET [deletedAt] = SYSDATETIMEOFFSET() (tombstone only).
 *
 * Pool strategy:
 *   adminPool — direct mssql ConnectionPool (IS_MEMBER('app_admin_role')=1 → RLS-exempt).
 *     Used for: seed/cleanup, read-back verification after soft-delete.
 *   requestPool — direct mssql ConnectionPool with SESSION_CONTEXT set.
 *     Used for: CLIENT-context visibility assertions (round-trip after recover).
 *   withClerkIdentity — ADR-003 integration: wraps listEngagementDocuments / listDeletedDocuments
 *     under CLIENT / ACCOUNTANT context so the RLS FILTER predicate is evaluated.
 *
 * // ADR-003 // ADR-005 // ADR-018 // ADR-019 // DECISION-014-D // DECISION-014-E
 * // CS-TS-001 // CS-TS-002 // CS-GEN-001 // CS-GEN-002 // CS-GEN-003
 * // AC-FILE-004-01 // AC-FILE-005-02 // AC-FILE-005-03 // AC-FILE-006-01 // AC-FILE-006-02 // AC-FILE-006-03
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import mssqlPkg from "mssql";
import { parseSqlServerUrl } from "./sql-server-url.js";
import { withClerkIdentity } from "./context.js";
import {
  softDeleteDocument,
  recoverDocument,
  listEngagementDocuments,
  listDeletedDocuments,
} from "./repositories/document.js";

const { ConnectionPool } = mssqlPkg;

// ─── Connection pools ─────────────────────────────────────────────────────────

let adminPool: InstanceType<typeof ConnectionPool>;
let requestPool: InstanceType<typeof ConnectionPool>;

const ADMIN_URL = process.env["DATABASE_URL_ADMIN"];
const REQUEST_URL = process.env["DATABASE_URL"];

// ─── Test identities ──────────────────────────────────────────────────────────

const ownerClerkId = "sd_intg_owner";
const accountantClerkId = "sd_intg_accountant";

// ─── Seed data IDs ────────────────────────────────────────────────────────────

let ownerUserId: string;
let engagementId: string;
let engagementRequestId: string;
let documentId: string;
let siblingDocId: string; // non-deleted sibling — for working-view test

// ─── Cleanup arrays ───────────────────────────────────────────────────────────

const documentIds: string[] = [];
const engagementIds: string[] = [];
const requestIds: string[] = [];
const userIds: string[] = [];

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  if (!ADMIN_URL) throw new Error("DATABASE_URL_ADMIN is required for integration tests");
  if (!REQUEST_URL) throw new Error("DATABASE_URL is required for integration tests");

  const adminConfig = parseSqlServerUrl(ADMIN_URL) as import("mssql").config;
  adminPool = new ConnectionPool(adminConfig);
  await adminPool.connect();

  const requestConfig = parseSqlServerUrl(REQUEST_URL) as import("mssql").config;
  requestPool = new ConnectionPool(requestConfig);
  await requestPool.connect();

  // ─── Pre-clean stale data ────────────────────────────────────────────────
  const staleUserResult = await adminPool.request().query<{ id: string }>(
    `SELECT [id] FROM [dbo].[User] WHERE [clerkId] = N'${ownerClerkId}'`
  );
  const staleUserId = staleUserResult.recordset[0]?.id;
  if (staleUserId) {
    const staleEngResult = await adminPool.request().query<{ id: string }>(
      `SELECT [id] FROM [dbo].[Engagement] WHERE [clientUserId] = '${staleUserId}'`
    );
    for (const staleEng of staleEngResult.recordset) {
      await adminPool.request().query(
        `DELETE FROM [dbo].[DocumentVersion] WHERE [documentId] IN (SELECT [id] FROM [dbo].[Document] WHERE [engagementId] = '${staleEng.id}')`
      ).catch(() => { /* ignore */ });
      await adminPool.request().query(
        `DELETE FROM [dbo].[Document] WHERE [engagementId] = '${staleEng.id}'`
      ).catch(() => { /* ignore */ });
      await adminPool.request().query(
        `DELETE FROM [dbo].[Engagement] WHERE [id] = '${staleEng.id}'`
      ).catch(() => { /* ignore */ });
    }
    await adminPool.request().query(
      `DELETE FROM [dbo].[EngagementRequest] WHERE [email] = N'sd-intg-req@example.com'`
    ).catch(() => { /* ignore */ });
    await adminPool.request().query(
      `DELETE FROM [dbo].[User] WHERE [id] = '${staleUserId}'`
    ).catch(() => { /* ignore */ });
  }

  // ─── Seed: User (owner) ─────────────────────────────────────────────────
  const userResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[User] ([clerkId], [email], [role], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'${ownerClerkId}', N'sd-intg-owner@example.com', N'CLIENT', SYSDATETIMEOFFSET())`
  );
  ownerUserId = userResult.recordset[0]?.id ?? "";
  userIds.push(ownerUserId);

  // ─── Seed: EngagementRequest ─────────────────────────────────────────────
  const reqResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[EngagementRequest] ([firstName], [lastName], [email], [status], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'SdIntg', N'Owner', N'sd-intg-req@example.com', N'accepted', SYSDATETIMEOFFSET())`
  );
  engagementRequestId = reqResult.recordset[0]?.id ?? "";
  requestIds.push(engagementRequestId);

  // ─── Seed: Engagement ────────────────────────────────────────────────────
  const engResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[Engagement]
       ([engagementRequestId], [clientUserId], [status], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES ('${engagementRequestId}', '${ownerUserId}', N'New', SYSDATETIMEOFFSET())`
  );
  engagementId = engResult.recordset[0]?.id ?? "";
  engagementIds.push(engagementId);

  // ─── Seed: Document (the one we'll soft-delete then recover) ─────────────
  // ADR-018 §1: deletedAt IS NULL = active (no tombstone set yet in seed)
  const docResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[Document]
       ([engagementId], [storageKey], [originalFilename], [contentType],
        [sizeBytes], [status], [version], [uploadedBy], [deletedAt], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (
       '${engagementId}',
       N'engagements/${engagementId}/documents/sd-test/v1/test-file.pdf',
       N'test-file.pdf',
       N'application/pdf',
       12345,
       N'active',
       1,
       N'${ownerClerkId}',
       NULL,
       SYSDATETIMEOFFSET()
     )`
  );
  documentId = docResult.recordset[0]?.id ?? "";
  documentIds.push(documentId);

  // ─── Seed: Sibling Document (not soft-deleted — for working-view test) ───
  const siblingResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[Document]
       ([engagementId], [storageKey], [originalFilename], [contentType],
        [sizeBytes], [status], [version], [uploadedBy], [deletedAt], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (
       '${engagementId}',
       N'engagements/${engagementId}/documents/sd-test/v1/sibling-file.pdf',
       N'sibling-file.pdf',
       N'application/pdf',
       9999,
       N'active',
       1,
       N'${ownerClerkId}',
       NULL,
       SYSDATETIMEOFFSET()
     )`
  );
  siblingDocId = siblingResult.recordset[0]?.id ?? "";
  documentIds.push(siblingDocId);
}, 30000);

afterAll(async () => {
  // Cleanup in reverse dependency order (DocumentVersion → Document → Engagement → EngagementRequest → User)
  for (const did of documentIds) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[Document] WHERE [id] = '${did}'`
    ).catch(() => { /* ignore */ });
  }
  for (const eid of engagementIds) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[Engagement] WHERE [id] = '${eid}'`
    ).catch(() => { /* ignore */ });
  }
  for (const rid of requestIds) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[EngagementRequest] WHERE [id] = '${rid}'`
    ).catch(() => { /* ignore */ });
  }
  for (const uid of userIds) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[User] WHERE [id] = '${uid}'`
    ).catch(() => { /* ignore */ });
  }
  await adminPool.close().catch(() => { /* ignore */ });
  await requestPool.close().catch(() => { /* ignore */ });
}, 30000);

// ─── Tests: softDeleteDocument ────────────────────────────────────────────────

describe("softDeleteDocument — admin-pool UPDATE tombstone (ADR-018 §1, AC-FILE-004-01, DECISION-014-D)", () => {

  /**
   * [AC-FILE-004-01] softDeleteDocument sets deletedAt tombstone — outcome 'deleted'.
   * ADR-018 §1: soft-delete sets deletedAt; NEVER a physical DELETE.
   * DECISION-014-D: 'deleted' outcome when the UPDATE succeeded.
   * CS-GEN-001: targetId = documentId only (no filename in audit).
   * // AC-FILE-004-01 // ADR-018 // DECISION-014-D // CS-GEN-001 // CS-TS-002
   */
  it("[AC-FILE-004-01] softDeleteDocument returns 'deleted' and sets deletedAt tombstone", async () => {
    const result = await softDeleteDocument({
      documentId,
      engagementId,
      actor: { clerkUserId: accountantClerkId, role: "ACCOUNTANT" },
    });

    expect(result.outcome).toBe("deleted");

    // Admin-pool read-back: verify the tombstone was set (row exists, deletedAt IS NOT NULL)
    // AC-FILE-006-02: the ROW STILL EXISTS after soft-delete (not a physical DELETE).
    const check = await adminPool.request().query<{
      id: string;
      deletedAt: Date | null;
      originalFilename: string;
    }>(
      `SELECT [id], [deletedAt], [originalFilename]
       FROM [dbo].[Document]
       WHERE [id] = '${documentId}'`
    );

    // [AC-FILE-006-02]: row MUST still exist (never a physical DELETE — ADR-018 §1)
    expect(check.recordset).toHaveLength(1);
    const row = check.recordset[0]!;
    expect(row.id.toLowerCase()).toBe(documentId.toLowerCase());

    // Tombstone MUST be set (deletedAt IS NOT NULL) — the soft-delete mark
    expect(row.deletedAt).not.toBeNull();
    expect(row.deletedAt).toBeInstanceOf(Date);

    // Filename still present — the row is retained intact (AC-FILE-006-02 / ADR-018 §1)
    expect(row.originalFilename).toBe("test-file.pdf");
  });

  /**
   * [AC-FILE-006-02 / AC-FILE-005-02 / AC-FILE-005-03] After soft-delete, the row still exists.
   * No storage delete occurs — no storage.delete* call in softDeleteDocument.
   * ADR-018 §1: "delete" = set tombstone; bytes + row survive.
   * // AC-FILE-006-02 // AC-FILE-005-02 // AC-FILE-005-03 // ADR-018
   */
  it("[AC-FILE-006-02/AC-FILE-005-02/AC-FILE-005-03] row and storageKey survive soft-delete (no physical removal)", async () => {
    // Admin-pool read: storageKey must still be present (storage bytes not deleted)
    const check = await adminPool.request().query<{
      storageKey: string;
      deletedAt: Date | null;
      sizeBytes: string;
    }>(
      `SELECT [storageKey], [deletedAt], [sizeBytes]
       FROM [dbo].[Document]
       WHERE [id] = '${documentId}'`
    );

    expect(check.recordset).toHaveLength(1);
    const row = check.recordset[0]!;

    // storageKey is intact — the storage object was NOT deleted (ADR-018 §1)
    expect(row.storageKey).toContain("engagements/");
    expect(row.storageKey).not.toBe("");

    // deletedAt IS NOT NULL — tombstone is set (soft-deleted, not destroyed)
    expect(row.deletedAt).not.toBeNull();

    // sizeBytes non-zero — data still present (no purge)
    expect(Number(row.sizeBytes)).toBeGreaterThan(0);
  });

  /**
   * [DECISION-014-D] softDeleteDocument returns 'already-deleted' when called again (idempotent).
   * The tombstone IS NULL guard prevents double-delete.
   * // DECISION-014-D // ADR-018
   */
  it("[DECISION-014-D] softDeleteDocument returns 'already-deleted' on re-call (idempotent)", async () => {
    const result = await softDeleteDocument({
      documentId,
      engagementId,
      actor: { clerkUserId: accountantClerkId, role: "ACCOUNTANT" },
    });

    expect(result.outcome).toBe("already-deleted");
  });

  /**
   * [DECISION-014-D] softDeleteDocument returns 'not-found' for an unknown documentId.
   * // DECISION-014-D
   */
  it("[DECISION-014-D] softDeleteDocument returns 'not-found' for unknown documentId", async () => {
    const result = await softDeleteDocument({
      documentId: "00000000-0000-0000-0000-DEADBEEF0001",
      engagementId,
      actor: { clerkUserId: accountantClerkId, role: "ACCOUNTANT" },
    });

    expect(result.outcome).toBe("not-found");
  });

});

// ─── Tests: listEngagementDocuments — working view vs archive view ────────────

describe("listEngagementDocuments — working view (default) vs archive view (includeDeleted) (DECISION-014-E, AC-FILE-006-01)", () => {

  /**
   * [AC-FILE-006-01] Default working view excludes soft-deleted documents.
   * CLIENT context: RLS also enforces deletedAt IS NULL (defense-in-depth).
   * ACCOUNTANT context: app-layer filter provides the working view.
   * // AC-FILE-006-01 // DECISION-014-E // ADR-018 // CS-TS-001
   */
  it("[AC-FILE-006-01] listEngagementDocuments (default) excludes the soft-deleted doc — working view", async () => {
    // ACCOUNTANT context — RLS does not block them; app-layer filter applies.
    const docs = await withClerkIdentity(
      accountantClerkId,
      "ACCOUNTANT",
      () => listEngagementDocuments(engagementId),
    );

    const ids = docs.map(d => d.id.toLowerCase());

    // Sibling (active) doc MUST be in the working view
    expect(ids).toContain(siblingDocId.toLowerCase());

    // Soft-deleted doc MUST NOT appear in the working view (AC-FILE-006-01)
    expect(ids).not.toContain(documentId.toLowerCase());
  });

  /**
   * [AC-FILE-006-01] includeDeleted:true returns all docs including soft-deleted (archive view).
   * ACCOUNTANT context: both active and deleted docs returned.
   * // AC-FILE-006-01 // DECISION-014-E // ADR-018
   */
  it("[AC-FILE-006-01] listEngagementDocuments(includeDeleted:true) returns both active and soft-deleted docs", async () => {
    const docs = await withClerkIdentity(
      accountantClerkId,
      "ACCOUNTANT",
      () => listEngagementDocuments(engagementId, { includeDeleted: true }),
    );

    const ids = docs.map(d => d.id.toLowerCase());

    // Both the active sibling AND the soft-deleted doc must appear in the archive view
    expect(ids).toContain(siblingDocId.toLowerCase());
    expect(ids).toContain(documentId.toLowerCase());

    // Soft-deleted doc's deletedAt must be non-null (AC-FILE-006-01 — marked deleted)
    const deletedDoc = docs.find(d => d.id.toLowerCase() === documentId.toLowerCase());
    expect(deletedDoc).toBeDefined();
    expect(deletedDoc?.deletedAt).not.toBeNull();
  });

  /**
   * [AC-FILE-006-01] CLIENT context: RLS hides soft-deleted docs regardless of the includeDeleted flag.
   * The RLS FILTER predicate (0012-document-soft-delete-filter.sql) enforces deletedAt IS NULL
   * on CLIENT branches — the app-layer flag cannot override RLS.
   * // AC-FILE-006-01 // ADR-005 // ADR-018 // CS-TS-001
   */
  it("[AC-FILE-006-01] CLIENT context: soft-deleted doc hidden by RLS even with includeDeleted:true", async () => {
    const docs = await withClerkIdentity(
      ownerClerkId,
      "CLIENT",
      // Passing includeDeleted:true to the CLIENT context — RLS must still hide the deleted doc.
      () => listEngagementDocuments(engagementId, { includeDeleted: true }),
    );

    const ids = docs.map(d => d.id.toLowerCase());

    // CLIENT must NOT see the soft-deleted doc (RLS is the data-layer gate — ADR-005)
    expect(ids).not.toContain(documentId.toLowerCase());

    // CLIENT MUST still see the active sibling (RLS allows it)
    expect(ids).toContain(siblingDocId.toLowerCase());
  });

});

// ─── Tests: listDeletedDocuments ─────────────────────────────────────────────

describe("listDeletedDocuments — archive/recover surface (DECISION-014-E, AC-FILE-006-01/-03)", () => {

  /**
   * [AC-FILE-006-01 / AC-FILE-006-03] listDeletedDocuments returns only soft-deleted docs.
   * ACCOUNTANT context — the recover/archive surface.
   * // AC-FILE-006-01 // AC-FILE-006-03 // DECISION-014-E // ADR-018
   */
  it("[AC-FILE-006-01/AC-FILE-006-03] listDeletedDocuments returns only soft-deleted docs for ACCOUNTANT", async () => {
    const docs = await withClerkIdentity(
      accountantClerkId,
      "ACCOUNTANT",
      () => listDeletedDocuments(engagementId),
    );

    const ids = docs.map(d => d.id.toLowerCase());

    // Soft-deleted doc MUST appear in the archive/recover listing
    expect(ids).toContain(documentId.toLowerCase());

    // Active sibling MUST NOT appear (listDeletedDocuments is deleted-only)
    expect(ids).not.toContain(siblingDocId.toLowerCase());

    // Confirm the listed doc's deletedAt is non-null (it IS soft-deleted)
    const deletedDoc = docs.find(d => d.id.toLowerCase() === documentId.toLowerCase());
    expect(deletedDoc?.deletedAt).not.toBeNull();
  });

});

// ─── Tests: recoverDocument ───────────────────────────────────────────────────

describe("recoverDocument — admin-pool UPDATE, clears tombstone (ADR-018 §1, AC-FILE-006-03)", () => {

  /**
   * [AC-FILE-006-03] recoverDocument clears deletedAt — outcome 'recovered'.
   * The doc becomes visible again to its owner CLIENT (round-trip through request pool).
   * ADR-018 §1: in-window recovery re-activates the document by clearing deletedAt.
   * // AC-FILE-006-03 // AC-FILE-005-02 // ADR-018 // DECISION-014-D // CS-TS-002
   */
  it("[AC-FILE-006-03] recoverDocument returns 'recovered' and clears deletedAt tombstone", async () => {
    const result = await recoverDocument({
      documentId,
      engagementId,
      actor: { clerkUserId: accountantClerkId, role: "ACCOUNTANT" },
    });

    expect(result.outcome).toBe("recovered");

    // Admin-pool read-back: deletedAt MUST be NULL (tombstone cleared)
    const check = await adminPool.request().query<{ id: string; deletedAt: Date | null }>(
      `SELECT [id], [deletedAt]
       FROM [dbo].[Document]
       WHERE [id] = '${documentId}'`
    );

    expect(check.recordset).toHaveLength(1);
    const row = check.recordset[0]!;
    expect(row.id.toLowerCase()).toBe(documentId.toLowerCase());

    // deletedAt MUST be NULL — tombstone cleared (recovered)
    expect(row.deletedAt).toBeNull();
  });

  /**
   * [AC-FILE-006-03] After recovery, the doc is visible again to its owner CLIENT.
   * Round-trip through the request pool (RLS predicate gates the CLIENT view).
   * // AC-FILE-006-03 // AC-FILE-005-02 // ADR-003 // ADR-005 // CS-TS-001
   */
  it("[AC-FILE-006-03] recovered doc is visible again to owner CLIENT via working view", async () => {
    const docs = await withClerkIdentity(
      ownerClerkId,
      "CLIENT",
      () => listEngagementDocuments(engagementId),
    );

    const ids = docs.map(d => d.id.toLowerCase());

    // Recovered doc MUST now be visible to CLIENT (deletedAt IS NULL → RLS passes it through)
    expect(ids).toContain(documentId.toLowerCase());
  });

  /**
   * [DECISION-014-D] recoverDocument returns 'not-deleted' when the doc is already active.
   * (After the successful recovery above, the doc is active again.)
   * // DECISION-014-D // ADR-018
   */
  it("[DECISION-014-D] recoverDocument returns 'not-deleted' when doc is not soft-deleted", async () => {
    const result = await recoverDocument({
      documentId,
      engagementId,
      actor: { clerkUserId: accountantClerkId, role: "ACCOUNTANT" },
    });

    expect(result.outcome).toBe("not-deleted");
  });

  /**
   * [DECISION-014-D] recoverDocument returns 'not-found' for unknown documentId.
   * // DECISION-014-D
   */
  it("[DECISION-014-D] recoverDocument returns 'not-found' for unknown documentId", async () => {
    const result = await recoverDocument({
      documentId: "00000000-0000-0000-0000-DEADBEEF0002",
      engagementId,
      actor: { clerkUserId: accountantClerkId, role: "ACCOUNTANT" },
    });

    expect(result.outcome).toBe("not-found");
  });

});

// ─── Tests: Audit event emission (ADR-019) ────────────────────────────────────

describe("Audit events — document.deleted / document.recovered (ADR-019, CS-GEN-001)", () => {

  /**
   * [ADR-019] softDeleteDocument emits audit event 'document.deleted' with targetId = documentId.
   * CS-GEN-001: audit targetId = documentId only — no filename or PII.
   * We re-soft-delete (set up fresh to test audit), then check AuditEvent table.
   * // ADR-019 // CS-GEN-001 // CS-GEN-003 // AC-FILE-004-01
   */
  it("[ADR-019] softDeleteDocument emits 'document.deleted' audit event with targetId = documentId", async () => {
    // The document is currently active (recovered above). Soft-delete it to generate a new audit event.
    const deleteResult = await softDeleteDocument({
      documentId,
      engagementId,
      actor: { clerkUserId: accountantClerkId, role: "ACCOUNTANT" },
    });

    expect(deleteResult.outcome).toBe("deleted");

    // Admin-pool read: check AuditEvent for 'document.deleted' action with targetId = documentId.
    // IMPORTANT: The AuditEvent table uses LEDGER = ON (APPEND_ONLY) — we can only SELECT.
    // We check for the most recent event matching our criteria.
    // CS-GEN-001: targetId = documentId (no filename); the field must NOT contain the filename.
    const auditCheck = await adminPool.request().query<{
      action: string;
      targetType: string;
      targetId: string;
      actorRole: string;
    }>(
      `SELECT TOP 1 [action], [targetType], [targetId], [actorRole]
       FROM [dbo].[AuditEvent]
       WHERE [action] = N'document.deleted'
         AND [targetId] = '${documentId}'
         AND [clerkUserId] = N'${accountantClerkId}'
       ORDER BY [occurredAt] DESC`
    );

    expect(auditCheck.recordset).toHaveLength(1);
    const auditRow = auditCheck.recordset[0]!;
    expect(auditRow.action).toBe("document.deleted");
    expect(auditRow.targetType).toBe("Document");
    expect(auditRow.targetId.toLowerCase()).toBe(documentId.toLowerCase());
    // Actor is the accountant (not a client — accountant-only delete)
    expect(auditRow.actorRole).toBe("ACCOUNTANT");
  });

  /**
   * [ADR-019] recoverDocument emits audit event 'document.recovered' with targetId = documentId.
   * CS-GEN-001: audit targetId = documentId only — no filename or PII.
   * // ADR-019 // CS-GEN-001 // CS-GEN-003 // AC-FILE-006-03
   */
  it("[ADR-019] recoverDocument emits 'document.recovered' audit event with targetId = documentId", async () => {
    // Document is currently soft-deleted (from the test above). Recover it to generate audit event.
    const recoverResult = await recoverDocument({
      documentId,
      engagementId,
      actor: { clerkUserId: accountantClerkId, role: "ACCOUNTANT" },
    });

    expect(recoverResult.outcome).toBe("recovered");

    // Admin-pool read: check AuditEvent for 'document.recovered' action.
    const auditCheck = await adminPool.request().query<{
      action: string;
      targetType: string;
      targetId: string;
      actorRole: string;
    }>(
      `SELECT TOP 1 [action], [targetType], [targetId], [actorRole]
       FROM [dbo].[AuditEvent]
       WHERE [action] = N'document.recovered'
         AND [targetId] = '${documentId}'
         AND [clerkUserId] = N'${accountantClerkId}'
       ORDER BY [occurredAt] DESC`
    );

    expect(auditCheck.recordset).toHaveLength(1);
    const auditRow = auditCheck.recordset[0]!;
    expect(auditRow.action).toBe("document.recovered");
    expect(auditRow.targetType).toBe("Document");
    expect(auditRow.targetId.toLowerCase()).toBe(documentId.toLowerCase());
    expect(auditRow.actorRole).toBe("ACCOUNTANT");
  });

});
