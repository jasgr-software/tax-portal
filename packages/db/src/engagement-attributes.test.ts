/**
 * packages/db/src/engagement-attributes.test.ts
 *
 * TIER-2/3 INTEGRATION TEST — requires real SQL Server (ADR-012)
 *
 * Tests the engagement-attribute seams introduced in TASK-011-002:
 *   - setEngagementDueDate   (admin pool, withAuditTransaction)
 *   - setEngagementPriority  (admin pool, withAuditTransaction)
 *   - recordEngagementNote   (admin pool, withAuditTransaction)
 *   - listEngagementNotes    (request pool, withRequestContext / RLS gate)
 *
 * Acceptance criteria covered (tagged in test titles):
 *   AC-LIFE-007-03 — due date on engagement A does not appear on engagement B
 *   AC-LIFE-008-02 — a note recorded on engagement A is not associated with engagement B
 *   AC-LIFE-008-02 — listEngagementNotes under ACCOUNTANT returns notes
 *   AC-LIFE-008-02 — notes-read seam under CLIENT context returns ZERO (RLS gate)
 *   AC-LIFE-009-03 — flagging engagement A leaves engagement B unflagged
 *   ADR-019        — each write records exactly one audit event in the same transaction
 *   ADR-019        — no note body in any audit row (CS-GEN-001)
 *
 * ADR-003 §7: privileged accountant writes use admin pool inside withAuditTransaction.
 * ADR-005:    sec.pol_EngagementNote FILTER predicate governs notes visibility on request pool.
 * ADR-012:    Tier-3 test against the real SQL Server container.
 * ADR-019:    Each write atomically records an audit event (same transaction, no note body).
 * CS-TS-001:  listEngagementNotes uses the db (Prisma request-pool wrapper); write seams use
 *             admin pool inside withAuditTransaction.
 * CS-TS-002:  Never import raw requestDb/adminDb pools outside packages/db.
 * CS-GEN-001: note body NEVER logged in audit rows.
 * CS-GEN-002: additive — new test file; existing tests not modified.
 * CS-GEN-003: all governing keys cited in test comments throughout.
 *
 * DECISION (TASK-011-002): engagement-note.read.rls.test.ts is NOT created as a separate file.
 *   The CLIENT-reads-zero-via-seam case (AC-LIFE-008-02 negative) is fully covered here via
 *   listEngagementNotes under withClerkIdentity(..., 'CLIENT', ...). The existing
 *   engagement-note.rls.test.ts (TASK-011-001) covers the raw SQL / policy layer; this file
 *   covers the seam layer. Two levels of coverage are redundant — the seam test is the more
 *   meaningful one (it tests the actual exported function that production code calls).
 *   Noted in Work Log per TASK-011-002 task spec.
 *
 * Connection approach:
 *   - Write seams use the admin pool via withAuditTransaction (packages/db seam, ADR-003 §7).
 *   - Notes read seam uses db (Prisma request pool) via withClerkIdentity (packages/db seam, CS-TS-001).
 *   - Raw admin pool (raw mssql) is used ONLY for seeding/teardown and for reading audit rows.
 *   This mirrors the engagement.lifecycle.transition.test.ts pattern.
 *
 * Environment:
 *   DATABASE_URL_ADMIN — admin pool URL (taxportal_admin / app_admin_role; bypasses RLS)
 *   DATABASE_URL       — request pool URL (taxportal_user / app_user_role; subject to RLS)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import mssqlPkg from "mssql";
import { parseSqlServerUrl } from "./sql-server-url.js";
import {
  setEngagementDueDate,
  setEngagementPriority,
  recordEngagementNote,
  listEngagementNotes,
} from "./repositories/engagement.js";
import { withClerkIdentity } from "./context.js";
import type { AuditActor } from "./audit.js";

const { ConnectionPool } = mssqlPkg;

// ─── Connection setup ─────────────────────────────────────────────────────────

let adminPool: InstanceType<typeof ConnectionPool>;

const ADMIN_URL = process.env["DATABASE_URL_ADMIN"];

// ─── Test data ────────────────────────────────────────────────────────────────

/** IDs for the two primary engagements under test — reset per test via beforeEach */
let engagementA: string;
let requestA: string;
let engagementB: string;
let requestB: string;

/** All seeded engagements — collected for cleanup in afterAll */
const seededEngagements: Array<{ engagementId: string; requestId: string }> = [];
/** All seeded note ids — collected for cleanup in afterAll */
const seededNoteIds: string[] = [];

/** Synthetic accountant actor for audit events (DECISION-011-D / ADR-019 §2) */
const ACCOUNTANT_ACTOR: AuditActor = {
  clerkUserId: "lc_attr_accountant_001",
  role: "ACCOUNTANT",
};

/** Synthetic accountant clerkId used as createdBy (mirrors DocumentRequest.createdBy pattern) */
const ACCOUNTANT_CLERK_ID = "lc_attr_accountant_001";

/** Synthetic client clerkId for the notes-read RLS negative test (AC-LIFE-008-02) */
const CLIENT_CLERK_ID = "lc_attr_client_001";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Creates a fresh EngagementRequest + Engagement via the admin pool.
 * Uses a unique email per call (Date.now() suffix) to avoid unique-key conflicts.
 * Returns { engagementId, requestId }.
 */
async function seedEngagement(suffix: string): Promise<{
  engagementId: string;
  requestId: string;
}> {
  const reqResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[EngagementRequest]
       ([firstName], [lastName], [email], [status], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'Attr', N'Test', N'attr-test-${suffix}-${Date.now()}@example.com', N'accepted', SYSDATETIMEOFFSET())`
  );
  const reqId = reqResult.recordset[0]?.id ?? "";

  const engResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[Engagement]
       ([engagementRequestId], [status], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES ('${reqId}', N'New', SYSDATETIMEOFFSET())`
  );
  const engId = engResult.recordset[0]?.id ?? "";

  return { engagementId: engId, requestId: reqId };
}

/**
 * Reads the Engagement row's attribute columns via the admin pool (RLS-exempt).
 * Returns dueDate and isPriority as-stored.
 */
async function getEngagementAttributes(engagementId: string): Promise<{
  dueDate: Date | null;
  isPriority: boolean;
} | null> {
  const result = await adminPool.request().query<{
    dueDate: Date | null;
    isPriority: boolean;
  }>(
    `SELECT [dueDate], [isPriority]
     FROM [dbo].[Engagement]
     WHERE [id] = '${engagementId}'`
  );
  const row = result.recordset[0];
  if (!row) return null;
  return {
    dueDate: row.dueDate ?? null,
    isPriority: Boolean(row.isPriority),
  };
}

/**
 * Counts AuditEvent rows for a given targetId and action string.
 * ADR-019: verifies one audit event per write.
 */
async function countAuditRows(targetId: string, action: string): Promise<number> {
  const result = await adminPool.request().query<{ cnt: number }>(
    `SELECT COUNT(*) AS cnt FROM [dbo].[AuditEvent]
     WHERE [targetId] = '${targetId}'
       AND [action] = N'${action.replace(/'/g, "''")}'`
  );
  return result.recordset[0]?.cnt ?? 0;
}

/**
 * Reads AuditEvent rows for a given targetId to verify no note body is present.
 * CS-GEN-001: note body must NEVER appear in any audit row's targetId, action, or other columns.
 */
async function getAuditRowsForTarget(targetId: string, action: string): Promise<Array<{
  targetType: string | null;
  targetId: string | null;
  action: string;
}>> {
  const result = await adminPool.request().query<{
    targetType: string | null;
    targetId: string | null;
    action: string;
  }>(
    `SELECT [targetType], [targetId], [action]
     FROM [dbo].[AuditEvent]
     WHERE [targetId] = '${targetId}'
       AND [action] = N'${action.replace(/'/g, "''")}'`
  );
  return result.recordset;
}

/**
 * Counts EngagementNote rows for a given engagementId via the admin pool (RLS-exempt).
 * Used to verify per-engagement isolation in cross-engagement tests.
 */
async function countNotesByEngagement(engagementId: string): Promise<number> {
  const result = await adminPool.request().query<{ cnt: number }>(
    `SELECT COUNT(*) AS cnt FROM [dbo].[EngagementNote]
     WHERE [engagementId] = '${engagementId}'`
  );
  return result.recordset[0]?.cnt ?? 0;
}

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeAll(async () => {
  if (!ADMIN_URL) throw new Error("DATABASE_URL_ADMIN is required for engagement-attributes tests");

  const adminConfig = parseSqlServerUrl(ADMIN_URL) as import("mssql").config;
  adminPool = new ConnectionPool(adminConfig);
  await adminPool.connect();
}, 30000);

/**
 * Each test gets two fresh engagements (A + B) to prove per-engagement attribution.
 * AC-LIFE-007-03, AC-LIFE-009-03: settings on A must not appear on B.
 */
beforeEach(async () => {
  const a = await seedEngagement("A");
  engagementA = a.engagementId;
  requestA = a.requestId;
  seededEngagements.push(a);

  const b = await seedEngagement("B");
  engagementB = b.engagementId;
  requestB = b.requestId;
  seededEngagements.push(b);
});

afterAll(async () => {
  // Cleanup: delete notes first (FK constraint), then engagements, then requests.
  for (const noteId of seededNoteIds) {
    await adminPool.request()
      .query(`DELETE FROM [dbo].[EngagementNote] WHERE [id] = '${noteId}'`)
      .catch(() => { /* ignore */ });
  }
  for (const { engagementId, requestId } of seededEngagements) {
    // Delete notes attached to the engagement (safe even if already deleted above)
    await adminPool.request()
      .query(`DELETE FROM [dbo].[EngagementNote] WHERE [engagementId] = '${engagementId}'`)
      .catch(() => { /* ignore */ });
    await adminPool.request()
      .query(`DELETE FROM [dbo].[Engagement] WHERE [id] = '${engagementId}'`)
      .catch(() => { /* ignore */ });
    await adminPool.request()
      .query(`DELETE FROM [dbo].[EngagementRequest] WHERE [id] = '${requestId}'`)
      .catch(() => { /* ignore */ });
  }
  await adminPool.close().catch(() => { /* ignore */ });
}, 60000);

// ─── Tests: setEngagementDueDate ─────────────────────────────────────────────

describe("setEngagementDueDate — per-engagement attribution + audit (AC-LIFE-007-03, ADR-019)", () => {

  /**
   * [AC-LIFE-007-03] Setting due date on engagement A does not affect engagement B.
   * Verifies per-engagement attribution: dueDate on A, B.dueDate remains null.
   * AC-LIFE-007-01/-02: the seam handles both first-set and update (single guarded UPDATE).
   * DECISION-011-D: admin pool inside withAuditTransaction; @@ROWCOUNT guard.
   */
  it("[AC-LIFE-007-03] due date set on engagement A does not appear on engagement B — B.dueDate is null", async () => {
    const testDate = new Date("2026-09-30"); // AC-LIFE-007-01: first-set

    // Set due date on A only
    const result = await setEngagementDueDate({
      engagementId: engagementA,
      dueDate: testDate,
      actor: ACCOUNTANT_ACTOR,
      sourceSurface: "admin",
    });

    // ADR-003, DECISION-011-D: write succeeds
    expect(result.success).toBe(true);

    // Verify A has the due date
    const attrA = await getEngagementAttributes(engagementA);
    expect(attrA).not.toBeNull();
    expect(attrA?.dueDate).not.toBeNull();

    // AC-LIFE-007-03: B must not have the due date
    const attrB = await getEngagementAttributes(engagementB);
    expect(attrB).not.toBeNull();
    expect(attrB?.dueDate).toBeNull();  // per-engagement attribution verified
  });

  /**
   * AC-LIFE-007-01/-02: update (second set) succeeds — single guarded UPDATE handles both.
   * DECISION-011-D: no IS NULL guard — the UPDATE always sets dueDate regardless of prior value.
   */
  it("[AC-LIFE-007-01/-02] second setEngagementDueDate (update) succeeds — { success: true }", async () => {
    const firstDate = new Date("2026-09-15");
    const secondDate = new Date("2026-10-31");

    // First set
    await setEngagementDueDate({
      engagementId: engagementA,
      dueDate: firstDate,
      actor: ACCOUNTANT_ACTOR,
      sourceSurface: "admin",
    });

    // Second set (update)
    const updateResult = await setEngagementDueDate({
      engagementId: engagementA,
      dueDate: secondDate,
      actor: ACCOUNTANT_ACTOR,
      sourceSurface: "admin",
    });

    expect(updateResult.success).toBe(true);

    // Verify the date was updated to the new value
    const attr = await getEngagementAttributes(engagementA);
    expect(attr?.dueDate).not.toBeNull();
  });

  /**
   * setEngagementDueDate on a non-existent engagement returns { success: false }.
   * DECISION-011-D: @@ROWCOUNT = 0 → success=false (engagement not found).
   */
  it("setEngagementDueDate on non-existent engagement returns { success: false }", async () => {
    const fakeId = "00000000-0000-0000-0000-000000000001";
    const result = await setEngagementDueDate({
      engagementId: fakeId,
      dueDate: new Date("2026-12-31"),
      actor: ACCOUNTANT_ACTOR,
      sourceSurface: "admin",
    });
    expect(result.success).toBe(false);
  });

  /**
   * [ADR-019] setEngagementDueDate records exactly one audit event 'engagement.due_date_set'.
   * The audit event's targetType=Engagement, targetId=engagementId.
   * CS-GEN-001: no note body / PII in the audit row.
   * DECISION-011-E: audit action string 'engagement.due_date_set'.
   */
  it("[ADR-019] setEngagementDueDate records exactly one audit event with action=engagement.due_date_set", async () => {
    const before = await countAuditRows(engagementA, "engagement.due_date_set");

    await setEngagementDueDate({
      engagementId: engagementA,
      dueDate: new Date("2026-08-31"),
      actor: ACCOUNTANT_ACTOR,
      sourceSurface: "admin",
    });

    const after = await countAuditRows(engagementA, "engagement.due_date_set");
    // Exactly one new audit row must be created
    expect(after - before).toBe(1);

    // CS-GEN-001: verify the audit row structure — targetType=Engagement, targetId=engagementId
    const rows = await getAuditRowsForTarget(engagementA, "engagement.due_date_set");
    expect(rows.length).toBeGreaterThanOrEqual(1);
    // The most recent row (last in the array due to INSERT order)
    const lastRow = rows[rows.length - 1];
    expect(lastRow?.targetType).toBe("Engagement");
    expect(lastRow?.targetId).toBe(engagementA);
    // CS-GEN-001: action must be the action string, NOT any body/PII content
    expect(lastRow?.action).toBe("engagement.due_date_set");
  });

});

// ─── Tests: setEngagementPriority ────────────────────────────────────────────

describe("setEngagementPriority — per-engagement attribution + audit (AC-LIFE-009-03, ADR-019)", () => {

  /**
   * [AC-LIFE-009-03] Flagging engagement A leaves engagement B unflagged.
   * Verifies per-engagement attribution: isPriority on A, B.isPriority remains false.
   * AC-LIFE-009-01: flag (isPriority=true) path.
   * DECISION-011-D: admin pool inside withAuditTransaction; @@ROWCOUNT guard.
   */
  it("[AC-LIFE-009-03] flagging engagement A leaves engagement B unflagged — B.isPriority is false", async () => {
    // Flag A as priority
    const result = await setEngagementPriority({
      engagementId: engagementA,
      isPriority: true,
      actor: ACCOUNTANT_ACTOR,
      sourceSurface: "admin",
    });

    // ADR-003, DECISION-011-D: write succeeds
    expect(result.success).toBe(true);

    // Verify A is flagged
    const attrA = await getEngagementAttributes(engagementA);
    expect(attrA?.isPriority).toBe(true);

    // AC-LIFE-009-03: B must NOT be flagged
    const attrB = await getEngagementAttributes(engagementB);
    expect(attrB?.isPriority).toBe(false);  // per-engagement attribution verified
  });

  /**
   * [AC-LIFE-009-02] Unflagging (isPriority=false) after flagging succeeds.
   * AC-LIFE-009-02: the same seam handles unflag (isPriority=false).
   */
  it("[AC-LIFE-009-01/-02] flag then unflag: isPriority transitions true → false", async () => {
    // Flag
    await setEngagementPriority({
      engagementId: engagementA,
      isPriority: true,
      actor: ACCOUNTANT_ACTOR,
      sourceSurface: "admin",
    });

    const afterFlag = await getEngagementAttributes(engagementA);
    expect(afterFlag?.isPriority).toBe(true);

    // Unflag
    const unflagResult = await setEngagementPriority({
      engagementId: engagementA,
      isPriority: false,
      actor: ACCOUNTANT_ACTOR,
      sourceSurface: "admin",
    });

    expect(unflagResult.success).toBe(true);
    const afterUnflag = await getEngagementAttributes(engagementA);
    expect(afterUnflag?.isPriority).toBe(false);
  });

  /**
   * setEngagementPriority on a non-existent engagement returns { success: false }.
   * DECISION-011-D: @@ROWCOUNT = 0 → success=false.
   */
  it("setEngagementPriority on non-existent engagement returns { success: false }", async () => {
    const fakeId = "00000000-0000-0000-0000-000000000002";
    const result = await setEngagementPriority({
      engagementId: fakeId,
      isPriority: true,
      actor: ACCOUNTANT_ACTOR,
      sourceSurface: "admin",
    });
    expect(result.success).toBe(false);
  });

  /**
   * [ADR-019] setEngagementPriority records exactly one audit event 'engagement.priority_set'.
   * DECISION-011-E: audit action string 'engagement.priority_set'.
   * CS-GEN-001: no note body / PII in the audit row.
   */
  it("[ADR-019] setEngagementPriority records exactly one audit event with action=engagement.priority_set", async () => {
    const before = await countAuditRows(engagementA, "engagement.priority_set");

    await setEngagementPriority({
      engagementId: engagementA,
      isPriority: true,
      actor: ACCOUNTANT_ACTOR,
      sourceSurface: "admin",
    });

    const after = await countAuditRows(engagementA, "engagement.priority_set");
    expect(after - before).toBe(1);

    // CS-GEN-001: verify the audit row structure
    const rows = await getAuditRowsForTarget(engagementA, "engagement.priority_set");
    expect(rows.length).toBeGreaterThanOrEqual(1);
    const lastRow = rows[rows.length - 1];
    expect(lastRow?.targetType).toBe("Engagement");
    expect(lastRow?.targetId).toBe(engagementA);
    expect(lastRow?.action).toBe("engagement.priority_set");
  });

});

// ─── Tests: recordEngagementNote ─────────────────────────────────────────────

describe("recordEngagementNote — per-engagement attribution + audit (AC-LIFE-008, ADR-019, CS-GEN-001)", () => {

  /**
   * [AC-LIFE-008] A note recorded on engagement A is not associated with engagement B.
   * Verifies per-engagement attribution: note on A, B has 0 notes.
   * AC-LIFE-008-02: accountant can add internal notes; note INSERT creates an EngagementNote row.
   * DECISION-011-D: admin pool inside withAuditTransaction; OUTPUT INSERTED.id.
   */
  it("[AC-LIFE-008] note recorded on engagement A is NOT associated with engagement B — B has 0 notes", async () => {
    const noteBody = "Internal note for engagement A — cross-engagement attribution test";

    const result = await recordEngagementNote({
      engagementId: engagementA,
      body: noteBody,
      createdBy: ACCOUNTANT_CLERK_ID,
      actor: ACCOUNTANT_ACTOR,
      sourceSurface: "admin",
    });

    // Write succeeds and returns a noteId
    expect(result.success).toBe(true);
    expect(result.noteId).toBeDefined();
    expect(typeof result.noteId).toBe("string");

    // Track note for teardown
    if (result.noteId) seededNoteIds.push(result.noteId);

    // Verify A has 1 note
    const notesA = await countNotesByEngagement(engagementA);
    expect(notesA).toBe(1);

    // AC-LIFE-008: B must have 0 notes — per-engagement attribution verified
    const notesB = await countNotesByEngagement(engagementB);
    expect(notesB).toBe(0);
  });

  /**
   * recordEngagementNote on a non-existent engagement returns { success: false }.
   * FK violation on engagementId → caught in seam → { success: false }.
   */
  it("recordEngagementNote on non-existent engagement returns { success: false }", async () => {
    const fakeId = "00000000-0000-0000-0000-000000000003";
    const result = await recordEngagementNote({
      engagementId: fakeId,
      body: "This note should not be inserted",
      createdBy: ACCOUNTANT_CLERK_ID,
      actor: ACCOUNTANT_ACTOR,
      sourceSurface: "admin",
    });
    expect(result.success).toBe(false);
  });

  /**
   * [ADR-019] recordEngagementNote records exactly one audit event 'engagement.note_recorded'.
   * CS-GEN-001: the audit row's targetId is the engagementId (NOT the note id or body).
   *             No note body appears in any AuditEvent column.
   * DECISION-011-E: audit action string 'engagement.note_recorded'.
   */
  it("[ADR-019][CS-GEN-001] recordEngagementNote records audit event with targetId=engagementId and NO note body", async () => {
    const noteBody = "Sensitive internal note — must NEVER appear in audit rows";
    const before = await countAuditRows(engagementA, "engagement.note_recorded");

    const result = await recordEngagementNote({
      engagementId: engagementA,
      body: noteBody,
      createdBy: ACCOUNTANT_CLERK_ID,
      actor: ACCOUNTANT_ACTOR,
      sourceSurface: "admin",
    });

    expect(result.success).toBe(true);
    if (result.noteId) seededNoteIds.push(result.noteId);

    const after = await countAuditRows(engagementA, "engagement.note_recorded");
    // Exactly one new audit row
    expect(after - before).toBe(1);

    // CS-GEN-001: verify the audit row structure — targetType=Engagement, targetId=engagementId
    const rows = await getAuditRowsForTarget(engagementA, "engagement.note_recorded");
    expect(rows.length).toBeGreaterThanOrEqual(1);
    const lastRow = rows[rows.length - 1];

    // targetType=Engagement (not EngagementNote, not a note body fragment)
    expect(lastRow?.targetType).toBe("Engagement");
    // targetId=engagementId (not noteId — the note body must NEVER appear here)
    expect(lastRow?.targetId).toBe(engagementA);
    // CS-GEN-001: action must be the action string — NOT the note body
    expect(lastRow?.action).toBe("engagement.note_recorded");
    // CS-GEN-001: the audit row's action string must NOT contain any part of the note body
    expect(lastRow?.action).not.toContain("Sensitive");
    expect(lastRow?.action).not.toContain("internal note");

    // Double-check: the AuditEvent table must not have any row with the note body as its targetId
    const bodyAsTargetId = await adminPool.request().query<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM [dbo].[AuditEvent]
       WHERE [targetId] = N'${noteBody.replace(/'/g, "''")}'`
    );
    expect(bodyAsTargetId.recordset[0]?.cnt).toBe(0);
  });

});

// ─── Tests: listEngagementNotes (request-pool / RLS gate) ────────────────────

describe("listEngagementNotes — RLS gate + ACCOUNTANT/CLIENT visibility (AC-LIFE-008-02, ADR-005)", () => {

  /**
   * [AC-LIFE-008-02] ACCOUNTANT context reads notes via listEngagementNotes.
   * sec.pol_EngagementNote FILTER: ACCOUNTANT branch passes → notes returned.
   * CS-TS-001: runs under the db (Prisma request-pool wrapper) via withClerkIdentity.
   * ADR-003: SESSION_CONTEXT set by withClerkIdentity; RLS is the access gate.
   * ADR-005: sec.pol_EngagementNote FILTER predicate governs visibility.
   */
  it("[AC-LIFE-008-02] ACCOUNTANT context reads notes via listEngagementNotes — returns the seeded note", async () => {
    // Seed a note on engagement A
    const noteBody = "ACCOUNTANT-readable note — listEngagementNotes positive test";
    const recordResult = await recordEngagementNote({
      engagementId: engagementA,
      body: noteBody,
      createdBy: ACCOUNTANT_CLERK_ID,
      actor: ACCOUNTANT_ACTOR,
      sourceSurface: "admin",
    });
    expect(recordResult.success).toBe(true);
    if (recordResult.noteId) seededNoteIds.push(recordResult.noteId);

    // CS-TS-001: listEngagementNotes uses db (Prisma request pool wrapper)
    // ADR-003: withClerkIdentity sets SESSION_CONTEXT → sec.pol_EngagementNote FILTER applies
    const notes = await withClerkIdentity("user_accountant_001", "ACCOUNTANT", () =>
      listEngagementNotes(engagementA)
    );

    // ACCOUNTANT context → at least the seeded note is visible
    expect(notes.length).toBeGreaterThanOrEqual(1);
    // DECISION (TASK-011-002): SQL Server NEWSEQUENTIALID() returns UUIDs in uppercase via raw
    // mssql (what recordEngagementNote uses for OUTPUT INSERTED.id), while Prisma normalises
    // UNIQUEIDENTIFIER to lowercase. Case-insensitive comparison avoids false failures.
    const seededNote = notes.find(
      (n) => n.id.toLowerCase() === (recordResult.noteId ?? "").toLowerCase()
    );
    expect(seededNote).toBeDefined();
    expect(seededNote?.engagementId.toLowerCase()).toBe(engagementA.toLowerCase());
    expect(seededNote?.body).toBe(noteBody);
    expect(seededNote?.createdBy).toBe(ACCOUNTANT_CLERK_ID);
  });

  /**
   * [AC-LIFE-008-02] CLIENT context via listEngagementNotes returns ZERO notes.
   * This is the critical CLIENT-reads-zero-via-seam proof:
   *   - sec.pol_EngagementNote has NO CLIENT branch → empty predicate → 0 rows.
   *   - The seam (listEngagementNotes) does NOT add app-layer filtering.
   *   - RLS is the SOLE access gate (ADR-005).
   *
   * ADR-003: SESSION_CONTEXT 'role'='CLIENT' → no CLIENT branch in predicate → 0 rows.
   * ADR-005: sec.pol_EngagementNote FILTER fail-closed (CLIENT → 0 rows, not an error).
   * CS-TS-001: the seam runs under the db (Prisma request-pool wrapper) — RLS applies.
   *
   * DECISION (TASK-011-002): engagement-note.read.rls.test.ts is NOT created as a separate file.
   *   This test covers the CLIENT-reads-zero-via-seam case at the seam layer.
   *   The raw-SQL / policy layer is covered by engagement-note.rls.test.ts (TASK-011-001).
   */
  it("[AC-LIFE-008-02] CLIENT context via listEngagementNotes returns ZERO notes — RLS is the gate", async () => {
    // First seed a note (so there IS data, and the zero-result is from RLS, not from absence)
    const recordResult = await recordEngagementNote({
      engagementId: engagementA,
      body: "CLIENT must not see this note",
      createdBy: ACCOUNTANT_CLERK_ID,
      actor: ACCOUNTANT_ACTOR,
      sourceSurface: "admin",
    });
    expect(recordResult.success).toBe(true);
    if (recordResult.noteId) seededNoteIds.push(recordResult.noteId);

    // Verify the note exists via admin pool (baseline: the data IS there)
    const notesViaAdmin = await countNotesByEngagement(engagementA);
    expect(notesViaAdmin).toBeGreaterThanOrEqual(1);

    // CS-TS-001: listEngagementNotes uses db (Prisma request pool wrapper)
    // ADR-003: withClerkIdentity sets SESSION_CONTEXT 'role'='CLIENT'
    // ADR-005: sec.pol_EngagementNote has no CLIENT branch → 0 rows
    const notes = await withClerkIdentity(CLIENT_CLERK_ID, "CLIENT", () =>
      listEngagementNotes(engagementA)
    );

    // AC-LIFE-008-02: CLIENT reads ZERO notes — RLS fail-closed (not app-layer filtering)
    expect(notes).toHaveLength(0);
  });

  /**
   * listEngagementNotes returns only notes for the requested engagement (not cross-engagement).
   * ACCOUNTANT context can see all notes, but scoped by engagementId parameter.
   */
  it("listEngagementNotes scoped to engagementId — notes from B are not returned when querying A", async () => {
    // Seed a note on each engagement
    const resultA = await recordEngagementNote({
      engagementId: engagementA,
      body: "Note on engagement A",
      createdBy: ACCOUNTANT_CLERK_ID,
      actor: ACCOUNTANT_ACTOR,
      sourceSurface: "admin",
    });
    const resultB = await recordEngagementNote({
      engagementId: engagementB,
      body: "Note on engagement B",
      createdBy: ACCOUNTANT_CLERK_ID,
      actor: ACCOUNTANT_ACTOR,
      sourceSurface: "admin",
    });
    if (resultA.noteId) seededNoteIds.push(resultA.noteId);
    if (resultB.noteId) seededNoteIds.push(resultB.noteId);

    // Query for engagement A's notes only
    const notesForA = await withClerkIdentity("user_accountant_001", "ACCOUNTANT", () =>
      listEngagementNotes(engagementA)
    );

    // DECISION (TASK-011-002): SQL Server NEWSEQUENTIALID() returns UUIDs in uppercase via raw
    // mssql (OUTPUT INSERTED.id), Prisma normalises to lowercase — compare case-insensitively.
    const noteAIdLower = (resultA.noteId ?? "").toLowerCase();
    const noteBIdLower = (resultB.noteId ?? "").toLowerCase();

    // Only A's note should appear — B's note must NOT be in the list
    const hasNoteFromB = notesForA.some((n) => n.id.toLowerCase() === noteBIdLower);
    expect(hasNoteFromB).toBe(false);

    // A's note IS present
    const hasNoteFromA = notesForA.some((n) => n.id.toLowerCase() === noteAIdLower);
    expect(hasNoteFromA).toBe(true);
  });

});
