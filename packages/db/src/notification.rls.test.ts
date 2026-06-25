/**
 * packages/db/src/notification.rls.test.ts
 *
 * TIER-3 INTEGRATION TEST — requires real SQL Server (ADR-005 §6, HARD GATE)
 * Tests the sec.pol_Notification security policy against the real engine.
 *
 * INTRODUCES-GATE: yes — this is the required tier-3 evidence for sec.pol_Notification.
 *
 * EPIC-016 / TASK-016-001: Extended from the EPIC-003 4-test accountant-only suite to the
 * full bidirectional dual-role matrix required by AC-MSG-014-07.
 * Admin + ACCOUNTANT branches remain BYTE-IDENTICAL to the EPIC-003 original (CS-GEN-002).
 *
 * ADR-005 §6 minimum coverage per policy:
 *   [POSITIVE]  ACCOUNTANT reads their accountant-scoped notifications  — returns rows
 *   [NEGATIVE]  Null SESSION_CONTEXT reads                              — zero rows (fail-closed)
 *   [POSITIVE]  CLIENT-A reads their own CLIENT notification            — returns 1 (HARD)
 *   [NEGATIVE]  CLIENT-A reads CLIENT-B's notification                 — zero rows (HARD)
 *   [NEGATIVE]  CLIENT-B reads CLIENT-A's notification                 — zero rows (bidirectional HARD)
 *   [NEGATIVE]  CLIENT reads ACCOUNTANT-scoped notification             — zero rows (cross-type)
 *   [POSITIVE]  Admin pool (app_admin_role) reads all                  — RLS-exempt
 *   [POSITIVE]  Read notification ≥90 days old is retained + visible   — AC-MSG-016-01
 *   [POSITIVE]  Unread notification ≥90 days old is retained + visible — AC-MSG-016-02
 *
 * Gate Authoring Evidence (ENGINE.md § Gate Authoring Rules — three-item evidence):
 *   1. Run marker: this file at path packages/db/src/notification.rls.test.ts.
 *      Test names listed in the describe block below.
 *      Actual run output pasted in TASK-016-001 Work Log.
 *   2. Named predicate line: sec.fn_notification_access in
 *      db/policies/0004-notification-policy.sql — the CLIENT-ownership EXISTS branch
 *      (TASK-016-001 addition, lines ~95-98):
 *        OR EXISTS (
 *            SELECT 1 FROM [dbo].[User] u
 *            JOIN [dbo].[Notification] n ON n.[recipientUserId] = u.[id]
 *            WHERE u.[clerkId] = CAST(SESSION_CONTEXT(N'clerk_user_id') AS NVARCHAR(64))
 *              AND n.[id] = @notificationId
 *        )
 *      on the FILTER PREDICATE on dbo.Notification (STATE=ON, SCHEMABINDING=ON).
 *   3. Counterfactual: removing the CLIENT-ownership EXISTS branch would cause
 *      "CLIENT-A reads their own CLIENT notification — positive (HARD)" to return 0 rows
 *      instead of 1, failing that test. Removing the FILTER PREDICATE entirely would cause
 *      "CLIENT-A reads CLIENT-B notification — ZERO rows" AND
 *      "CLIENT-B reads CLIENT-A notification — ZERO rows" to return 1 row each instead of 0,
 *      failing the HARD bidirectional isolation gate. Either change reds this gate.
 *
 * Tagged AC IDs:
 *   AC-MSG-014-07 — per-viewer RLS isolation (bidirectional CLIENT-A↔B + null + cross-type)
 *   AC-MSG-016-01 — read notification ≥90 days old is retained
 *   AC-MSG-016-02 — unread notification ≥90 days old is retained
 *   AC-DOOR-005-03 — notification delivered to accountant only (original EPIC-003 tests preserved)
 *
 * // ADR-005 // ADR-003 // ADR-018 // CS-SQL-001
 *
 * Connection approach:
 *   Uses raw mssql (not Prisma) for both pools. Rationale: Prisma 5.22.0 sqlserver connector
 *   cannot parse port in the authority URL form (P1013) nor in the semicolon-param form when
 *   the password contains special chars. The mssql driver parses both forms correctly.
 *   This is the TASK-002-documented workaround for the port-14330 environment.
 *
 * Environment:
 *   DATABASE_URL_ADMIN — admin pool URL (sa / app_admin login; bypasses RLS)
 *   DATABASE_URL       — request pool URL (app_user login; subject to RLS)
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

// ─── Test data (EPIC-003 / ACCOUNTANT-scoped) ─────────────────────────────────

let seededRequestId: string;
let seededNotificationId: string;  // ACCOUNTANT-scoped (EPIC-003 original seed)

// ─── Test data (EPIC-016 / dual-role CLIENT isolation) ───────────────────────

/**
 * Unique clerk IDs to avoid collision with other test files.
 * Prefixed with 'notif_rls_016_001_' to scope test data.
 */
const CLIENT_A_CLERK_ID = "notif_rls_016_001_client_a";
const CLIENT_B_CLERK_ID = "notif_rls_016_001_client_b";

let clientAUserId: string;
let clientBUserId: string;
let notifClientAId: string;   // CLIENT-A's notification (recipientType='CLIENT')
let notifClientBId: string;   // CLIENT-B's notification (recipientType='CLIENT')

// Retention test: backdated 91 days
const RETENTION_BACKDATE_SQL = `DATEADD(day, -91, SYSDATETIMEOFFSET())`;
let retentionReadId: string;   // AC-MSG-016-01: read notification ≥90 days old
let retentionUnreadId: string; // AC-MSG-016-02: unread notification ≥90 days old

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Count Notification rows visible to the given pool (after setting SESSION_CONTEXT).
 * Uses the existing pool (connection must already be open).
 *
 * AC-DOOR-005-03: ACCOUNTANT sees rows; CLIENT/null sees zero (fail-closed).
 * AC-MSG-014-07: CLIENT sees only their own rows (dual-role isolation).
 */
async function countVisibleNotifications(
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
    "SELECT COUNT(*) AS cnt FROM [dbo].[Notification]"
  );
  const cnt = ((result.recordset[0] as { cnt?: number } | undefined)?.cnt) ?? 0;

  // Clear SESSION_CONTEXT after query (pool hygiene — ADR-003 §4)
  await pool.request().batch(
    `EXEC sp_set_session_context @key = N'clerk_user_id', @value = NULL, @read_only = 0;
     EXEC sp_set_session_context @key = N'role', @value = NULL, @read_only = 0;`
  );

  return cnt;
}

/**
 * Count Notification rows visible to the given CLIENT identity on the request pool,
 * but restricted to a specific notification id (point query).
 * Returns 1 if the notification is visible to the identity, 0 otherwise.
 *
 * AC-MSG-014-07: point-query isolation — CLIENT-A cannot read CLIENT-B's specific row.
 */
async function countVisibleNotificationById(
  pool: InstanceType<typeof ConnectionPool>,
  clerkUserId: string,
  role: string,
  notificationId: string,
): Promise<number> {
  await pool.request().batch(
    `EXEC sp_set_session_context @key = N'clerk_user_id', @value = N'${clerkUserId.replace(/'/g, "''")}', @read_only = 0;
     EXEC sp_set_session_context @key = N'role', @value = N'${role.replace(/'/g, "''")}', @read_only = 0;`
  );

  const result = await pool.request().query(
    `SELECT COUNT(*) AS cnt FROM [dbo].[Notification] WHERE [id] = '${notificationId.replace(/'/g, "''")}'`
  );
  const cnt = ((result.recordset[0] as { cnt?: number } | undefined)?.cnt) ?? 0;

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

  // Admin pool — connected as sa / app_admin (is_member('app_admin_role')=1) → RLS-exempt
  const adminConfig = parseSqlServerUrl(ADMIN_URL) as import("mssql").config;
  adminPool = new ConnectionPool(adminConfig);
  await adminPool.connect();

  // Request pool — connected as app_user (is_member('app_user_role')=1) → subject to RLS
  const requestConfig = parseSqlServerUrl(REQUEST_URL) as import("mssql").config;
  requestPool = new ConnectionPool(requestConfig);
  await requestPool.connect();

  // ── EPIC-003 seed (ACCOUNTANT-scoped notification) ────────────────────────
  // Insert an EngagementRequest + ACCOUNTANT-scoped Notification via admin pool (bypasses RLS)
  const requestResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[EngagementRequest]
       ([firstName], [lastName], [email], [status], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'Notif', N'RLSTest', N'notif-rls-test@example.com', N'pending', SYSDATETIMEOFFSET())`
  );
  seededRequestId = requestResult.recordset[0]?.id ?? "";

  const notifResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[Notification]
       ([type], [title], [body], [engagementRequestId], [recipientType], [recipientUserId])
     OUTPUT INSERTED.[id]
     VALUES (N'new_engagement_request', N'New request from Notif RLSTest', NULL, '${seededRequestId}', N'ACCOUNTANT', NULL)`
  );
  seededNotificationId = notifResult.recordset[0]?.id ?? "";

  // ── EPIC-016 seed (CLIENT-A and CLIENT-B Users + their notifications) ─────
  // Two Client User rows for isolation tests (unique clerk IDs)
  const userAResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[User] ([clerkId], [email], [role], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'${CLIENT_A_CLERK_ID}', N'notif-rls-016-001-client-a@example.com', N'CLIENT', SYSDATETIMEOFFSET())`
  );
  clientAUserId = userAResult.recordset[0]?.id ?? "";

  const userBResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[User] ([clerkId], [email], [role], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'${CLIENT_B_CLERK_ID}', N'notif-rls-016-001-client-b@example.com', N'CLIENT', SYSDATETIMEOFFSET())`
  );
  clientBUserId = userBResult.recordset[0]?.id ?? "";

  // CLIENT-A's notification (recipientType='CLIENT', recipientUserId=clientAUserId)
  const notifAResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[Notification]
       ([type], [title], [recipientType], [recipientUserId])
     OUTPUT INSERTED.[id]
     VALUES (N'notif_rls_016_001_client_notif', N'RLS Test: CLIENT-A notification', N'CLIENT', '${clientAUserId}')`
  );
  notifClientAId = notifAResult.recordset[0]?.id ?? "";

  // CLIENT-B's notification (recipientType='CLIENT', recipientUserId=clientBUserId)
  const notifBResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[Notification]
       ([type], [title], [recipientType], [recipientUserId])
     OUTPUT INSERTED.[id]
     VALUES (N'notif_rls_016_001_client_notif', N'RLS Test: CLIENT-B notification', N'CLIENT', '${clientBUserId}')`
  );
  notifClientBId = notifBResult.recordset[0]?.id ?? "";

  // Retention seed: read notification backdated 91 days (AC-MSG-016-01)
  const retReadResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[Notification]
       ([type], [title], [createdAt], [readAt], [recipientType], [recipientUserId])
     OUTPUT INSERTED.[id]
     VALUES (
       N'notif_rls_016_001_retention_read',
       N'RLS Test: RETENTION READ 91 days old',
       ${RETENTION_BACKDATE_SQL},
       ${RETENTION_BACKDATE_SQL},
       N'ACCOUNTANT',
       NULL
     )`
  );
  retentionReadId = retReadResult.recordset[0]?.id ?? "";

  // Retention seed: unread notification backdated 91 days (AC-MSG-016-02)
  const retUnreadResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[Notification]
       ([type], [title], [createdAt], [readAt], [recipientType], [recipientUserId])
     OUTPUT INSERTED.[id]
     VALUES (
       N'notif_rls_016_001_retention_unread',
       N'RLS Test: RETENTION UNREAD 91 days old',
       ${RETENTION_BACKDATE_SQL},
       NULL,
       N'ACCOUNTANT',
       NULL
     )`
  );
  retentionUnreadId = retUnreadResult.recordset[0]?.id ?? "";
}, 30000);

afterAll(async () => {
  // Cleanup seeded data via admin pool (bypasses RLS) — in safe order
  for (const id of [notifClientAId, notifClientBId, retentionReadId, retentionUnreadId, seededNotificationId]) {
    if (id) {
      await adminPool.request().query(
        `DELETE FROM [dbo].[Notification] WHERE [id] = '${id}'`
      ).catch(() => { /* ignore */ });
    }
  }
  if (seededRequestId) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[EngagementRequest] WHERE [id] = '${seededRequestId}'`
    ).catch(() => { /* ignore */ });
  }
  if (clientAUserId) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[User] WHERE [id] = '${clientAUserId}'`
    ).catch(() => { /* ignore */ });
  }
  if (clientBUserId) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[User] WHERE [id] = '${clientBUserId}'`
    ).catch(() => { /* ignore */ });
  }
  await adminPool.close();
  await requestPool.close();
}, 30000);

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("sec.pol_Notification — RLS integration (HARD GATE, ADR-005 §6, AC-MSG-014-07 + AC-DOOR-005-03)", () => {

  /**
   * [POSITIVE] ACCOUNTANT reads their accountant-scoped notifications.
   * Predicate branch: CAST(SESSION_CONTEXT(N'role') AS NVARCHAR(16)) = N'ACCOUNTANT'
   * Tagged: AC-MSG-014-07 — ACCOUNTANT full visibility of accountant-scoped feed
   * Tagged: AC-DOOR-005-03 — notification delivered to accountant (positive proof)
   */
  it("AC-MSG-014-07 — [POSITIVE] ACCOUNTANT reads their own accountant-scoped notifications", async () => {
    const count = await countVisibleNotifications(requestPool, "user_accountant_test", "ACCOUNTANT");
    // Must see at least the seeded ACCOUNTANT notification (+ retention seeds)
    expect(count).toBeGreaterThanOrEqual(1);
  });

  /**
   * [NEGATIVE] Null SESSION_CONTEXT reads ZERO notifications — fail-closed, no error.
   * ADR-003 §5: null identity → predicate returns empty → zero rows, not an error.
   * Tagged: AC-MSG-014-07 — null context reads zero (fail-closed)
   * Tagged: AC-DOOR-005-03 — anonymous/null context reads zero
   */
  it("AC-MSG-014-07 — [NEGATIVE] Null SESSION_CONTEXT reads ZERO notifications — fail-closed, no error", async () => {
    const count = await countVisibleNotifications(requestPool, null, null);
    expect(count).toBe(0);
  });

  /**
   * [POSITIVE] CLIENT-A reads their own CLIENT notification — positive (HARD).
   * Predicate branch: CLIENT EXISTS — User.clerkId → User.id = Notification.recipientUserId
   * Tagged: AC-MSG-014-07 — CLIENT sees their own notification (HARD gate)
   */
  it("AC-MSG-014-07 — [POSITIVE] CLIENT-A reads their own CLIENT notification — positive (HARD)", async () => {
    const count = await countVisibleNotificationById(
      requestPool, CLIENT_A_CLERK_ID, "CLIENT", notifClientAId
    );
    // CLIENT-A must see their own notification (1 row)
    expect(count).toBe(1);
  });

  /**
   * [NEGATIVE] CLIENT-A reads CLIENT-B's notification — ZERO rows (CLIENT isolation HARD).
   * Predicate branch: CLIENT EXISTS on CLIENT-B's row fails for CLIENT-A's SESSION_CONTEXT.
   * Tagged: AC-MSG-014-07 — CLIENT-A cannot read CLIENT-B's notification (HARD gate)
   */
  it("AC-MSG-014-07 — [NEGATIVE] CLIENT-A reads CLIENT-B notification — ZERO rows (CLIENT isolation HARD)", async () => {
    const count = await countVisibleNotificationById(
      requestPool, CLIENT_A_CLERK_ID, "CLIENT", notifClientBId
    );
    // CLIENT-A must NOT see CLIENT-B's notification (0 rows — fail-closed for other's row)
    expect(count).toBe(0);
  });

  /**
   * [NEGATIVE] CLIENT-B reads CLIENT-A's notification — ZERO rows (bidirectional isolation HARD).
   * This is the second direction of the bidirectional assertion (both directions mandatory).
   * Predicate branch: CLIENT EXISTS on CLIENT-A's row fails for CLIENT-B's SESSION_CONTEXT.
   * Tagged: AC-MSG-014-07 — CLIENT-B cannot read CLIENT-A's notification (bidirectional HARD)
   */
  it("AC-MSG-014-07 — [NEGATIVE] CLIENT-B reads CLIENT-A notification — ZERO rows (bidirectional isolation HARD)", async () => {
    const count = await countVisibleNotificationById(
      requestPool, CLIENT_B_CLERK_ID, "CLIENT", notifClientAId
    );
    // CLIENT-B must NOT see CLIENT-A's notification (0 rows — bidirectional proof)
    expect(count).toBe(0);
  });

  /**
   * [NEGATIVE] CLIENT reads ACCOUNTANT-scoped notification — ZERO rows (cross-type isolation).
   * ACCOUNTANT-scoped rows have recipientUserId=NULL → EXISTS JOIN fails (NULL != any id) → 0 rows.
   * DECISION-A (TASK-016-001): recipientUserId=NULL → CLIENT branch returns false → cross-type invisible.
   * Tagged: AC-MSG-014-07 — CLIENT cannot read ACCOUNTANT-scoped notification (cross-type)
   */
  it("AC-MSG-014-07 — [NEGATIVE] CLIENT reads ACCOUNTANT-scoped notification — ZERO rows (cross-type isolation)", async () => {
    const count = await countVisibleNotificationById(
      requestPool, CLIENT_A_CLERK_ID, "CLIENT", seededNotificationId
    );
    // CLIENT-A must NOT see an ACCOUNTANT-scoped notification (0 rows — cross-type isolation)
    expect(count).toBe(0);
  });

  /**
   * [POSITIVE] Admin pool (connected as sa / app_admin_role-member) reads all rows — RLS-exempt.
   * IS_MEMBER('app_admin_role') = 1 → predicate passes unconditionally.
   * Verifies the seeded ACCOUNTANT notification exists with the correct type and title.
   * Tagged: AC-MSG-014-07 — admin bypass verified
   * Tagged: AC-DOOR-005-03 — admin bypass verified
   */
  it("AC-MSG-014-07 — [POSITIVE] Admin pool (app_admin_role) reads all notifications — RLS-exempt", async () => {
    const rows = await adminPool.request().query<{
      id: string;
      type: string;
      title: string;
      engagementRequestId: string;
    }>(
      `SELECT [id], [type], [title], [engagementRequestId]
       FROM [dbo].[Notification]
       WHERE [id] = '${seededNotificationId}'`
    );
    expect(rows.recordset).toHaveLength(1);
    expect(rows.recordset[0]?.type).toBe("new_engagement_request");
    expect(rows.recordset[0]?.title).toBe("New request from Notif RLSTest");
    expect(rows.recordset[0]?.engagementRequestId).toBe(seededRequestId);
  });

  /**
   * [POSITIVE] Read notification ≥90 days old is retained and visible to ACCOUNTANT.
   * ADR-018 §retention: ≥90-day retention floor — read notifications are never auto-purged.
   * This is a non-deletion guarantee: the backdated row exists because there is no auto-purge.
   * Tagged: AC-MSG-016-01 — read notification ≥90 days old retained + visible
   */
  it("AC-MSG-016-01 — [POSITIVE] Read notification ≥90 days old is retained and visible to ACCOUNTANT", async () => {
    const count = await countVisibleNotificationById(
      requestPool, "user_accountant_test_retention", "ACCOUNTANT", retentionReadId
    );
    expect(count).toBe(1);

    // Verify via admin pool that readAt is set (this row was inserted with readAt)
    const row = await adminPool.request().query<{ readAt: Date | null }>(
      `SELECT [readAt] FROM [dbo].[Notification] WHERE [id] = '${retentionReadId}'`
    );
    expect(row.recordset[0]?.readAt, "[AC-MSG-016-01] readAt must be non-null for the retention-read notification").not.toBeNull();
  });

  /**
   * [POSITIVE] Unread notification ≥90 days old is retained and visible to ACCOUNTANT.
   * ADR-018 §retention: ≥90-day retention floor — unread notifications are never auto-purged.
   * This is distinct from EPIC-017 thread retention — scoped to Notification only.
   * Tagged: AC-MSG-016-02 — unread notification ≥90 days old retained + visible
   */
  it("AC-MSG-016-02 — [POSITIVE] Unread notification ≥90 days old is retained and visible to ACCOUNTANT", async () => {
    const count = await countVisibleNotificationById(
      requestPool, "user_accountant_test_retention", "ACCOUNTANT", retentionUnreadId
    );
    expect(count).toBe(1);

    // Verify via admin pool that readAt is NULL (this row was inserted without readAt)
    const row = await adminPool.request().query<{ readAt: Date | null }>(
      `SELECT [readAt] FROM [dbo].[Notification] WHERE [id] = '${retentionUnreadId}'`
    );
    expect(row.recordset[0]?.readAt, "[AC-MSG-016-02] readAt must be null for the unread retention notification").toBeNull();
  });

});
