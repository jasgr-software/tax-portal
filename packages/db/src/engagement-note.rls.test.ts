/**
 * packages/db/src/engagement-note.rls.test.ts
 *
 * TIER-3 INTEGRATION TEST — requires real SQL Server (ADR-005 §6, HARD GATE)
 * Tests the sec.pol_EngagementNote accountant-only security policy against the real engine.
 *
 * INTRODUCES-GATE: yes — this is the required tier-3 evidence for sec.pol_EngagementNote.
 *
 * THIS POLICY IS ACCOUNTANT-ONLY — NOT the client-isolation pol_Engagement family.
 * A CLIENT who OWNS the parent engagement still reads ZERO notes (AC-LIFE-008-03).
 * This is the critical distinction: pol_Engagement lets the owning client read their row;
 * pol_EngagementNote gives clients ZERO access, regardless of engagement ownership.
 *
 * ADR-005 §6 minimum coverage per policy: // CS-SQL-001
 *   [POSITIVE]  ACCOUNTANT reads all EngagementNote rows         — returns rows
 *   [NEGATIVE]  Null SESSION_CONTEXT (anonymous) reads           — zero rows, no error (fail-closed)
 *   [NEGATIVE]  CLIENT role reads                                — zero rows
 *   [POSITIVE]  Admin principal (app_admin_role) reads all       — RLS-exempt
 *   [NEGATIVE]  CLIENT who OWNS the parent engagement reads      — STILL zero rows (accountant-only, not client-isolation)
 *
 * CS-SQL-001: every client-scoped table ships a SECURITY POLICY + this RLS integration test.
 * CS-SQL-003: predicate is an inline TVF, shallow, admin/accountant-first, fail-closed.
 * CS-GEN-002: additive — new test file, no existing test modified.
 * CS-GEN-003: governing keys cited in comments throughout.
 *
 * Gate Authoring Evidence (ENGINE.md § Gate Authoring Rules — three-item evidence):
 *   1. Run marker: this file at path packages/db/src/engagement-note.rls.test.ts;
 *      test names:
 *        "AC-LIFE-008-02 — [POSITIVE] ACCOUNTANT role reads EngagementNote rows",
 *        "AC-LIFE-008-03 — [NEGATIVE] CLIENT role reads ZERO EngagementNote rows",
 *        "AC-LIFE-008-03 — [NEGATIVE] Null SESSION_CONTEXT reads ZERO EngagementNote rows — fail-closed, no error",
 *        "AC-LIFE-008-02 — [POSITIVE] Admin pool (app_admin_role) reads EngagementNote rows — RLS-exempt",
 *        "AC-LIFE-008-03 — [NEGATIVE] CLIENT who OWNS the engagement reads ZERO notes — accountant-only, not client-isolation".
 *      Actual run output recorded in TASK-011-001 Work Log.
 *   2. Named code path: sec.fn_engagement_note_access in
 *      db/policies/0008-engagement-note-policy.sql — specifically the FILTER PREDICATE
 *      on dbo.EngagementNote (STATE = ON, SCHEMABINDING = ON). The predicate's two
 *      branches: IS_MEMBER('app_admin_role') = 1 (positive/admin path) and
 *      CAST(SESSION_CONTEXT(N'role') AS NVARCHAR(16)) = N'ACCOUNTANT' (positive/accountant path).
 *      There is NO CLIENT branch (accountant-only policy). // CS-SQL-003
 *   3. Counterfactual: removing the
 *      "OR CAST(SESSION_CONTEXT(N'role') AS NVARCHAR(16)) = N'ACCOUNTANT'"
 *      branch from fn_engagement_note_access would cause the ACCOUNTANT-positive test to
 *      return 0 rows instead of 1+, failing this gate. Removing the IS_MEMBER branch
 *      would cause the admin-bypass test to return 0 rows, failing the admin test.
 *
 * Tagged AC IDs (test titles reference AC ids):
 *   AC-LIFE-008-02 — accountant can add internal notes to an engagement
 *   AC-LIFE-008-03 — notes are never shown to the client (accountant-only)
 *
 * Connection approach:
 *   Uses raw mssql (not Prisma) for both pools. Rationale: Prisma 5.22.0 sqlserver connector
 *   cannot parse port in the authority URL form (P1013) nor in the semicolon-param form when
 *   the password contains special chars. The mssql driver parses both forms correctly.
 *   This is the TASK-002-documented workaround for the port-14330 environment.
 *
 * Environment:
 *   DATABASE_URL_ADMIN — admin pool URL (taxportal_admin / app_admin_role; bypasses RLS)
 *   DATABASE_URL       — request pool URL (taxportal_user / app_user_role; subject to RLS)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import mssqlPkg from "mssql";
import { parseSqlServerUrl } from "../../scripts/db-migrate.js";

const { ConnectionPool } = mssqlPkg;

// ─── Connection setup ─────────────────────────────────────────────────────────

let adminPool: InstanceType<typeof ConnectionPool>;
let requestPool: InstanceType<typeof ConnectionPool>;

const ADMIN_URL = process.env["DATABASE_URL_ADMIN"];
const REQUEST_URL = process.env["DATABASE_URL"];

// ─── Test data ────────────────────────────────────────────────────────────────

let seededRequestId: string;
let seededEngagementId: string;
let seededNoteId: string;
let seededClientUserId: string;
let seededClientClerkId: string;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Count EngagementNote rows visible to the given pool (after setting SESSION_CONTEXT).
 * Uses a fresh request on the pool to avoid context pollution between tests.
 *
 * AC-LIFE-008-02: ACCOUNTANT sees rows; AC-LIFE-008-03: CLIENT/null sees zero (fail-closed).
 * CS-SQL-001: this helper drives the ADR-005 §6 minimum coverage matrix.
 * ADR-003: SESSION_CONTEXT is cleared after each test (pool hygiene).
 */
async function countVisibleNotes(
  pool: InstanceType<typeof ConnectionPool>,
  clerkUserId: string | null,
  role: string | null,
): Promise<number> {
  // Set SESSION_CONTEXT if an identity is provided
  if (clerkUserId !== null && role !== null) {
    await pool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = N'${clerkUserId.replace(/'/g, "''")}', @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = N'${role.replace(/'/g, "''")}', @read_only = 0;`
    );
  }
  // Else: no SESSION_CONTEXT set — tests the null-identity fail-closed path

  const result = await pool.request().query(
    "SELECT COUNT(*) AS cnt FROM [dbo].[EngagementNote]"
  );
  const cnt = ((result.recordset[0] as { cnt?: number } | undefined)?.cnt) ?? 0;

  // Clear SESSION_CONTEXT after query (pool hygiene — ADR-003 §4)
  await pool.request().batch(
    `EXEC sp_set_session_context @key = N'clerk_user_id', @value = NULL, @read_only = 0;
     EXEC sp_set_session_context @key = N'role', @value = NULL, @read_only = 0;`
  );

  return cnt;
}

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeAll(async () => {
  if (!ADMIN_URL) throw new Error("DATABASE_URL_ADMIN is required for RLS integration tests");
  if (!REQUEST_URL) throw new Error("DATABASE_URL is required for RLS integration tests");

  // Admin pool — connected as taxportal_admin (app_admin_role member) → RLS-exempt
  const adminConfig = parseSqlServerUrl(ADMIN_URL) as import("mssql").config;
  adminPool = new ConnectionPool(adminConfig);
  await adminPool.connect();

  // Request pool — connected as taxportal_user (app_user_role member) → subject to RLS
  const requestConfig = parseSqlServerUrl(REQUEST_URL) as import("mssql").config;
  requestPool = new ConnectionPool(requestConfig);
  await requestPool.connect();

  // Seed: insert an EngagementRequest + Engagement + User (client) + EngagementNote via admin pool
  // (Admin pool bypasses RLS — ADR-005 §2: IS_MEMBER('app_admin_role') = 1)

  // 1. Create an EngagementRequest (parent of Engagement)
  const requestResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[EngagementRequest]
       ([firstName], [lastName], [email], [status], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'Note', N'RLSTest', N'note-rls-test@example.com', N'accepted', SYSDATETIMEOFFSET())`
  );
  seededRequestId = requestResult.recordset[0]?.id ?? "";

  // 2. Create a User (the client who OWNS the engagement — for the owning-client-reads-zero test)
  //    AC-LIFE-008-03: this client must read ZERO notes even though they own the engagement.
  seededClientClerkId = "user_note_rls_client_001";
  const userResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[User]
       ([clerkId], [email], [role], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'${seededClientClerkId}', N'note-rls-client@example.com', N'CLIENT', SYSDATETIMEOFFSET())`
  );
  seededClientUserId = userResult.recordset[0]?.id ?? "";

  // 3. Create an Engagement owned by the seeded client
  const engagementResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[Engagement]
       ([engagementRequestId], [clientUserId], [status], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES ('${seededRequestId}', '${seededClientUserId}', N'New', SYSDATETIMEOFFSET())`
  );
  seededEngagementId = engagementResult.recordset[0]?.id ?? "";

  // 4. Create an EngagementNote on the seeded engagement (via admin pool — RLS-exempt)
  //    AC-LIFE-008-02: accountant can create internal notes.
  //    Note: createdBy is the accountant's clerkId.
  const noteResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[EngagementNote]
       ([engagementId], [body], [createdBy], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES ('${seededEngagementId}', N'Internal accountant note — RLS test seed', N'user_accountant_001', SYSDATETIMEOFFSET())`
  );
  seededNoteId = noteResult.recordset[0]?.id ?? "";
}, 30000);

afterAll(async () => {
  // Cleanup seeded data via admin pool (bypasses RLS)
  if (seededNoteId) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[EngagementNote] WHERE [id] = '${seededNoteId}'`
    ).catch(() => { /* ignore */ });
  }
  if (seededEngagementId) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[Engagement] WHERE [id] = '${seededEngagementId}'`
    ).catch(() => { /* ignore */ });
  }
  if (seededClientUserId) {
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
  await requestPool.close();
}, 30000);

// ─── Tests ───────────────────────────────────────────────────────────────────
// CS-GEN-003: all tests cite AC-LIFE-008-02 (accountant writes/reads notes) and
// AC-LIFE-008-03 (client never reads notes). // CS-GEN-003

describe("sec.pol_EngagementNote — accountant-only RLS integration (HARD GATE, ADR-005 §6)", () => {

  /**
   * [POSITIVE] ACCOUNTANT reads EngagementNote rows.
   * Predicate branch: CAST(SESSION_CONTEXT(N'role') AS NVARCHAR(16)) = N'ACCOUNTANT'
   * AC-LIFE-008-02: accountant can view internal notes on any engagement.
   * CS-SQL-003: ACCOUNTANT branch in fn_engagement_note_access passes (second branch).
   */
  it("AC-LIFE-008-02 — [POSITIVE] ACCOUNTANT role reads EngagementNote rows", async () => {
    const count = await countVisibleNotes(requestPool, "user_accountant_001", "ACCOUNTANT");
    // Must see at least the seeded note — CS-SQL-001: positive case proves the gate is live
    expect(count).toBeGreaterThanOrEqual(1);
  });

  /**
   * [NEGATIVE] CLIENT role reads ZERO EngagementNote rows via request pool.
   * AC-LIFE-008-03: notes are NEVER shown to clients — this is the load-bearing proof.
   * CS-SQL-003: no CLIENT branch in fn_engagement_note_access → empty predicate → 0 rows.
   * ADR-003 §5: SESSION_CONTEXT('role') = 'CLIENT' → both branches fail → 0 rows, no error.
   */
  it("AC-LIFE-008-03 — [NEGATIVE] CLIENT role reads ZERO EngagementNote rows", async () => {
    const count = await countVisibleNotes(requestPool, "user_some_client", "CLIENT");
    expect(count).toBe(0);
  });

  /**
   * [NEGATIVE] Null SESSION_CONTEXT reads ZERO EngagementNote rows — fail-closed, no error.
   * ADR-003 §5: null identity → predicate returns empty → zero rows, not an error.
   * AC-LIFE-008-03: anonymous/null context reads zero (fail-closed).
   * CS-SQL-003: fail-closed null handling is the core safety property.
   */
  it("AC-LIFE-008-03 — [NEGATIVE] Null SESSION_CONTEXT reads ZERO EngagementNote rows — fail-closed, no error", async () => {
    const count = await countVisibleNotes(requestPool, null, null);
    expect(count).toBe(0);
  });

  /**
   * [POSITIVE] Admin pool (connected as taxportal_admin / app_admin_role member) reads all rows — RLS-exempt.
   * IS_MEMBER('app_admin_role') = 1 → predicate passes unconditionally (first branch, CS-SQL-003).
   * Verifies the seeded note exists with the correct body and engagementId.
   * AC-LIFE-008-02: admin bypass verified — admin pool can always read notes.
   */
  it("AC-LIFE-008-02 — [POSITIVE] Admin pool (app_admin_role) reads EngagementNote rows — RLS-exempt", async () => {
    const rows = await adminPool.request().query<{
      id: string;
      engagementId: string;
      body: string;
      createdBy: string;
    }>(
      `SELECT [id], [engagementId], [body], [createdBy]
       FROM [dbo].[EngagementNote]
       WHERE [id] = '${seededNoteId}'`
    );
    expect(rows.recordset).toHaveLength(1);
    expect(rows.recordset[0]?.body).toBe("Internal accountant note — RLS test seed");
    expect(rows.recordset[0]?.createdBy).toBe("user_accountant_001");
    expect(rows.recordset[0]?.engagementId).toBe(seededEngagementId);
  });

  /**
   * [NEGATIVE] CLIENT who OWNS the parent engagement reads ZERO notes — accountant-only, NOT client-isolation.
   *
   * This is the critical distinguishing test for the ACCOUNTANT-ONLY policy family.
   * pol_Engagement (0005) lets a CLIENT read their OWN engagement row.
   * pol_EngagementNote (0008) gives ZERO access to the CLIENT who owns the engagement.
   *
   * The seeded Engagement has clientUserId = seededClientUserId (the client owns it).
   * The seeded User has clerkId = seededClientClerkId.
   * Setting SESSION_CONTEXT 'clerk_user_id' = seededClientClerkId + 'role' = 'CLIENT'
   * would grant the client visibility to their Engagement row under pol_Engagement.
   * BUT under pol_EngagementNote: no CLIENT branch exists → empty predicate → 0 rows.
   *
   * AC-LIFE-008-03: internal notes are NEVER shown to clients, regardless of ownership.
   * CS-SQL-003: CLIENT branch is ABSENT BY DESIGN in fn_engagement_note_access.
   */
  it("AC-LIFE-008-03 — [NEGATIVE] CLIENT who OWNS the engagement reads ZERO notes — accountant-only, not client-isolation", async () => {
    // The seeded client OWNS the engagement (Engagement.clientUserId = seededClientUserId)
    // but SESSION_CONTEXT 'role' = 'CLIENT' + 'clerk_user_id' = seededClientClerkId
    // must still return ZERO notes from pol_EngagementNote.
    const count = await countVisibleNotes(requestPool, seededClientClerkId, "CLIENT");
    expect(count).toBe(0);
  });

});
