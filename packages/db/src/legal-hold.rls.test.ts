/**
 * packages/db/src/legal-hold.rls.test.ts
 *
 * TIER-3 INTEGRATION TEST — requires real SQL Server (ADR-005 §6, HARD GATE)
 * Tests the sec.pol_LegalHold accountant-only security policy against the real engine.
 *
 * INTRODUCES-GATE: yes — this is the required tier-3 evidence for sec.pol_LegalHold.
 * CS-SQL-001: every newly-scoped table ships a SECURITY POLICY + this RLS integration test. // CS-SQL-001
 *
 * THIS POLICY IS ACCOUNTANT-ONLY — NOT the client-isolation pol_Engagement family.
 * A CLIENT who OWNS the held engagement still reads ZERO holds (AC-FILE-013-02).
 * This is the critical distinction:
 *   pol_Engagement (0005): lets the owning client read their own engagement row.
 *   pol_LegalHold (0013):  gives clients ZERO access, regardless of engagement ownership.
 * Internal legal-hold state is NEVER surfaced to clients. AC-FILE-013-02 is the hard requirement.
 *
 * ADR-005 §6 minimum coverage per policy: // CS-SQL-001
 *   [POSITIVE]  ACCOUNTANT reads all LegalHold rows         — returns rows
 *   [NEGATIVE]  Null SESSION_CONTEXT (anonymous) reads       — zero rows, no error (fail-closed)
 *   [NEGATIVE]  CLIENT role reads                            — zero rows
 *   [POSITIVE]  Admin principal (app_admin_role) reads all   — RLS-exempt
 *   [NEGATIVE]  CLIENT who OWNS the held engagement reads    — STILL zero rows (accountant-only)
 *   [NEGATIVE]  CLIENT participant reads                     — STILL zero rows (accountant-only)
 *   [NEGATIVE]  CLIENT cannot INSERT a hold via request pool — BLOCK predicate denies
 *
 * CS-SQL-001: every client-scoped table ships a SECURITY POLICY + this RLS integration test.
 * CS-SQL-003: predicate is an inline TVF, shallow, admin/accountant-first, fail-closed.
 * CS-GEN-001: no PII in audit events — targetId = holdId only. // CS-GEN-001
 * CS-GEN-002: additive — new test file, no existing test modified. // CS-GEN-002
 * CS-GEN-003: governing keys cited in comments throughout. // CS-GEN-003
 *
 * Gate Authoring Evidence (ENGINE.md § Gate Authoring Rules — three-item evidence):
 *   1. Run marker: this file at path packages/db/src/legal-hold.rls.test.ts;
 *      test names:
 *        "AC-FILE-013-02 — [POSITIVE] ACCOUNTANT role reads LegalHold rows",
 *        "AC-FILE-013-02 — [NEGATIVE] CLIENT role reads ZERO LegalHold rows",
 *        "AC-FILE-013-02 — [NEGATIVE] Null SESSION_CONTEXT reads ZERO LegalHold rows — fail-closed, no error",
 *        "AC-FILE-013-02 — [POSITIVE] Admin pool (app_admin_role) reads LegalHold rows — RLS-exempt",
 *        "AC-FILE-013-02 — [NEGATIVE] CLIENT who OWNS the held engagement reads ZERO holds — accountant-only",
 *        "AC-FILE-013-02 — [NEGATIVE] CLIENT participant of held engagement reads ZERO holds",
 *        "AC-FILE-013-02 — [NEGATIVE] CLIENT principal cannot INSERT a hold via request pool — BLOCK denies".
 *      Actual run output recorded in TASK-015-001 Work Log.
 *   2. Named code path: sec.fn_legal_hold_access in
 *      db/policies/0013-legal-hold-policy.sql — specifically the FILTER PREDICATE
 *      on dbo.LegalHold (STATE = ON, SCHEMABINDING = ON). The predicate's two
 *      branches: IS_MEMBER('app_admin_role') = 1 (positive/admin path) and
 *      CAST(SESSION_CONTEXT(N'role') AS NVARCHAR(16)) = N'ACCOUNTANT' (positive/accountant path).
 *      There is NO CLIENT branch (accountant-only policy). // CS-SQL-003
 *   3. Counterfactual: removing the
 *      "OR CAST(SESSION_CONTEXT(N'role') AS NVARCHAR(16)) = N'ACCOUNTANT'"
 *      branch from fn_legal_hold_access would cause the ACCOUNTANT-positive test to
 *      return 0 rows instead of 1+, failing this gate. Removing the IS_MEMBER branch
 *      would cause the admin-bypass test to return 0 rows, failing the admin test.
 *
 * Tagged AC IDs (test titles reference AC ids per BRIEF-015 methodology):
 *   AC-FILE-013-02 — purge is accountant/admin-only (no client-facing hold path — server-side proof)
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
 *
 * // CS-SQL-001 // CS-SQL-002 // CS-SQL-003 // ADR-005 // ADR-003 // ADR-018 // CS-GEN-001 // CS-GEN-003
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import mssqlPkg from "mssql";
import { parseSqlServerUrl } from "./sql-server-url.js";

const { ConnectionPool } = mssqlPkg;

// ─── Connection setup ─────────────────────────────────────────────────────────

let adminPool: InstanceType<typeof ConnectionPool>;
let requestPool: InstanceType<typeof ConnectionPool>;

const ADMIN_URL = process.env["DATABASE_URL_ADMIN"];
const REQUEST_URL = process.env["DATABASE_URL"];

// ─── Test data ────────────────────────────────────────────────────────────────

let seededRequestId: string;
let seededEngagementId: string;
let seededHoldId: string;
let seededClientUserId: string;
let seededClientClerkId: string;
let seededParticipantUserId: string;
let seededParticipantClerkId: string;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Count LegalHold rows visible to the given pool (after setting SESSION_CONTEXT).
 * Uses a fresh request on the pool to avoid context pollution between tests.
 *
 * AC-FILE-013-02: ACCOUNTANT sees rows; CLIENT/null sees zero (fail-closed).
 * CS-SQL-001: this helper drives the ADR-005 §6 minimum coverage matrix.
 * ADR-003: SESSION_CONTEXT is cleared after each test (pool hygiene).
 */
async function countVisibleHolds(
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
    "SELECT COUNT(*) AS cnt FROM [dbo].[LegalHold]"
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

  // Seed: insert EngagementRequest + Engagement + User (client) + User (participant) + LegalHold via admin pool
  // (Admin pool bypasses RLS — ADR-005 §2: IS_MEMBER('app_admin_role') = 1)

  // 1. Create an EngagementRequest (parent of Engagement)
  const requestResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[EngagementRequest]
       ([firstName], [lastName], [email], [status], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'Hold', N'RLSTest', N'hold-rls-test@example.com', N'accepted', SYSDATETIMEOFFSET())`
  );
  seededRequestId = requestResult.recordset[0]?.id ?? "";

  // 2. Create a User (the client who OWNS the engagement — for the owning-client-reads-zero test)
  //    AC-FILE-013-02: this client must read ZERO holds even though they own the held engagement.
  seededClientClerkId = "user_hold_rls_client_001";
  const userResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[User]
       ([clerkId], [email], [role], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'${seededClientClerkId}', N'hold-rls-client@example.com', N'CLIENT', SYSDATETIMEOFFSET())`
  );
  seededClientUserId = userResult.recordset[0]?.id ?? "";

  // 3. Create a participant User (also a CLIENT — for participant-reads-zero test)
  seededParticipantClerkId = "user_hold_rls_participant_001";
  const participantResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[User]
       ([clerkId], [email], [role], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'${seededParticipantClerkId}', N'hold-rls-participant@example.com', N'CLIENT', SYSDATETIMEOFFSET())`
  );
  seededParticipantUserId = participantResult.recordset[0]?.id ?? "";

  // 4. Create an Engagement owned by the seeded client
  const engagementResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[Engagement]
       ([engagementRequestId], [clientUserId], [status], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES ('${seededRequestId}', '${seededClientUserId}', N'New', SYSDATETIMEOFFSET())`
  );
  seededEngagementId = engagementResult.recordset[0]?.id ?? "";

  // 5. Add the participant to the Engagement (EngagementParticipant join)
  await adminPool.request().query(
    `INSERT INTO [dbo].[EngagementParticipant]
       ([engagementId], [userId], [role])
     VALUES ('${seededEngagementId}', '${seededParticipantUserId}', N'CLIENT')`
  );

  // 6. Create a LegalHold on the seeded engagement (via admin pool — RLS-exempt)
  //    AC-FILE-014-01: engagement-scoped hold placed by accountant.
  const holdResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[LegalHold]
       ([scope], [engagementId], [clientUserId], [placedByClerkId], [reason], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'engagement', '${seededEngagementId}', NULL, N'user_accountant_001', N'RLS test hold', SYSDATETIMEOFFSET())`
  );
  seededHoldId = holdResult.recordset[0]?.id ?? "";
}, 30000);

afterAll(async () => {
  // Cleanup seeded data via admin pool (bypasses RLS)
  if (seededHoldId) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[LegalHold] WHERE [id] = '${seededHoldId}'`
    ).catch(() => { /* ignore */ });
  }
  if (seededEngagementId) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[EngagementParticipant] WHERE [engagementId] = '${seededEngagementId}'`
    ).catch(() => { /* ignore */ });
    await adminPool.request().query(
      `DELETE FROM [dbo].[Engagement] WHERE [id] = '${seededEngagementId}'`
    ).catch(() => { /* ignore */ });
  }
  if (seededParticipantUserId) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[User] WHERE [id] = '${seededParticipantUserId}'`
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
// CS-GEN-003: all tests cite AC-FILE-013-02 (no client-facing hold path). // CS-GEN-003

describe("sec.pol_LegalHold — accountant-only RLS integration (HARD GATE, ADR-005 §6)", () => {

  /**
   * [POSITIVE] ACCOUNTANT reads LegalHold rows.
   * Predicate branch: CAST(SESSION_CONTEXT(N'role') AS NVARCHAR(16)) = N'ACCOUNTANT'
   * AC-FILE-013-02: accountant has full legal-hold visibility.
   * CS-SQL-003: ACCOUNTANT branch in fn_legal_hold_access passes (second branch).
   *
   * // AC-FILE-013-02 // CS-SQL-001 // CS-SQL-003 // ADR-005 // ADR-018
   */
  it("AC-FILE-013-02 — [POSITIVE] ACCOUNTANT role reads LegalHold rows", async () => {
    const count = await countVisibleHolds(requestPool, "user_accountant_001", "ACCOUNTANT");
    // Must see at least the seeded hold — CS-SQL-001: positive case proves the gate is live
    expect(count).toBeGreaterThanOrEqual(1);
  });

  /**
   * [NEGATIVE] CLIENT role reads ZERO LegalHold rows via request pool.
   * AC-FILE-013-02: legal holds are NEVER shown to clients — this is the load-bearing proof.
   * CS-SQL-003: no CLIENT branch in fn_legal_hold_access → empty predicate → 0 rows.
   * ADR-003 §5: SESSION_CONTEXT('role') = 'CLIENT' → both branches fail → 0 rows, no error.
   *
   * // AC-FILE-013-02 // CS-SQL-001 // CS-SQL-003 // ADR-003 // ADR-005
   */
  it("AC-FILE-013-02 — [NEGATIVE] CLIENT role reads ZERO LegalHold rows", async () => {
    const count = await countVisibleHolds(requestPool, "user_some_client", "CLIENT");
    expect(count).toBe(0);
  });

  /**
   * [NEGATIVE] Null SESSION_CONTEXT reads ZERO LegalHold rows — fail-closed, no error.
   * ADR-003 §5: null identity → predicate returns empty → zero rows, not an error.
   * AC-FILE-013-02: anonymous/null context reads zero (fail-closed).
   * CS-SQL-003: fail-closed null handling is the core safety property.
   *
   * // AC-FILE-013-02 // CS-SQL-001 // CS-SQL-003 // ADR-003 // ADR-005
   */
  it("AC-FILE-013-02 — [NEGATIVE] Null SESSION_CONTEXT reads ZERO LegalHold rows — fail-closed, no error", async () => {
    const count = await countVisibleHolds(requestPool, null, null);
    expect(count).toBe(0);
  });

  /**
   * [POSITIVE] Admin pool (connected as taxportal_admin / app_admin_role member) reads all rows — RLS-exempt.
   * IS_MEMBER('app_admin_role') = 1 → predicate passes unconditionally (first branch, CS-SQL-003).
   * Verifies the seeded hold exists with the correct scope and engagementId.
   * AC-FILE-013-02: admin bypass verified — admin pool can always read holds.
   *
   * // AC-FILE-013-02 // CS-SQL-001 // CS-SQL-003 // ADR-005
   */
  it("AC-FILE-013-02 — [POSITIVE] Admin pool (app_admin_role) reads LegalHold rows — RLS-exempt", async () => {
    const rows = await adminPool.request().query<{
      id: string;
      scope: string;
      engagementId: string;
      placedByClerkId: string;
    }>(
      `SELECT [id], [scope], [engagementId], [placedByClerkId]
       FROM [dbo].[LegalHold]
       WHERE [id] = '${seededHoldId}'`
    );
    expect(rows.recordset).toHaveLength(1);
    expect(rows.recordset[0]?.scope).toBe("engagement");
    expect(rows.recordset[0]?.placedByClerkId).toBe("user_accountant_001");
    // engagementId should match the seeded engagement (case-insensitive GUID comparison)
    expect(rows.recordset[0]?.engagementId.toLowerCase()).toBe(seededEngagementId.toLowerCase());
  });

  /**
   * [NEGATIVE] CLIENT who OWNS the parent engagement reads ZERO holds — accountant-only, NOT client-isolation.
   *
   * This is the critical distinguishing test for the ACCOUNTANT-ONLY policy family.
   * pol_Engagement (0005) lets a CLIENT read their OWN engagement row.
   * pol_LegalHold (0013) gives ZERO access to the CLIENT who owns the held engagement.
   *
   * The seeded Engagement has clientUserId = seededClientUserId (the client owns it).
   * The seeded User has clerkId = seededClientClerkId.
   * Setting SESSION_CONTEXT 'clerk_user_id' = seededClientClerkId + 'role' = 'CLIENT'
   * would grant the client visibility to their Engagement row under pol_Engagement.
   * BUT under pol_LegalHold: no CLIENT branch exists → empty predicate → 0 rows.
   *
   * AC-FILE-013-02: legal holds are NEVER shown to clients, regardless of ownership.
   * CS-SQL-003: CLIENT branch is ABSENT BY DESIGN in fn_legal_hold_access.
   *
   * // AC-FILE-013-02 // CS-SQL-001 // CS-SQL-003 // ADR-005 // ADR-018
   */
  it("AC-FILE-013-02 — [NEGATIVE] CLIENT who OWNS the held engagement reads ZERO holds — accountant-only", async () => {
    // The seeded client OWNS the engagement (Engagement.clientUserId = seededClientUserId)
    // but SESSION_CONTEXT 'role' = 'CLIENT' + 'clerk_user_id' = seededClientClerkId
    // must still return ZERO holds from pol_LegalHold.
    const count = await countVisibleHolds(requestPool, seededClientClerkId, "CLIENT");
    expect(count).toBe(0);
  });

  /**
   * [NEGATIVE] CLIENT participant of the held engagement reads ZERO holds — accountant-only.
   *
   * Even a participant (linked via EngagementParticipant) cannot see holds.
   * The seeded participant is linked to the seeded engagement.
   * AC-FILE-013-02: no client-facing hold path — not even for participants.
   *
   * // AC-FILE-013-02 // CS-SQL-001 // ADR-005
   */
  it("AC-FILE-013-02 — [NEGATIVE] CLIENT participant of held engagement reads ZERO holds", async () => {
    const count = await countVisibleHolds(requestPool, seededParticipantClerkId, "CLIENT");
    expect(count).toBe(0);
  });

  /**
   * [NEGATIVE] CLIENT principal cannot INSERT a hold via request pool — BLOCK predicate denies.
   *
   * This proves the BLOCK predicate (AFTER INSERT) on pol_LegalHold.
   * A CLIENT-context request pool INSERT should throw (predicate returns empty → INSERT blocked).
   * This is the BLOCK-predicate arm of the CS-SQL-001 proof — defence-in-depth.
   *
   * AC-FILE-013-02: no client-facing hold placement — server-side BLOCK is the data-layer gate.
   * ADR-005: BLOCK predicates enforce accountant-only write constraint.
   *
   * // AC-FILE-013-02 // CS-SQL-001 // ADR-005 // ADR-018
   */
  it("AC-FILE-013-02 — [NEGATIVE] CLIENT principal cannot INSERT a hold via request pool — BLOCK denies", async () => {
    // Set CLIENT SESSION_CONTEXT on request pool
    await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = N'${seededClientClerkId}', @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = N'CLIENT', @read_only = 0;`
    );

    // Attempt INSERT via request pool as CLIENT — should be blocked
    let threw = false;
    try {
      await requestPool.request().query(
        `INSERT INTO [dbo].[LegalHold]
           ([scope], [engagementId], [clientUserId], [placedByClerkId], [reason], [updatedAt])
         VALUES (N'engagement', '${seededEngagementId}', NULL, N'${seededClientClerkId}', N'should be blocked', SYSDATETIMEOFFSET())`
      );
    } catch (err) {
      threw = true;
      // BLOCK predicate should cause an error — verify it's the expected RLS error
      const msg = (err as { message?: string }).message ?? "";
      expect(msg.toLowerCase()).toMatch(/block predicate|blocked|violated|security policy|permission/);
    }

    // Clear SESSION_CONTEXT (pool hygiene)
    await requestPool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = NULL, @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = NULL, @read_only = 0;`
    );

    // BLOCK predicate MUST have thrown (the INSERT must not have succeeded)
    expect(threw).toBe(true);
  });

});
