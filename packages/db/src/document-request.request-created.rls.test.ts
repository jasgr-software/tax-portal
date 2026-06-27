/**
 * packages/db/src/document-request.request-created.rls.test.ts
 *
 * TIER-3 INTEGRATION TEST — requires real SQL Server (ADR-005 §6, HARD GATE)
 * Tests the sec.pol_Notification CLIENT branch for document_request_created notifications.
 *
 * EPIC-019 / TASK-019-004 — extra gate #6:
 *   Per-recipient RLS isolation BOTH ways (AC-MSG-014-02, ADR-005, CS-SQL-001).
 *
 * The document_request_created notification is emitted by createDocumentRequestAsAccountant
 * after the DocumentRequest INSERT (DECISION-019-I). It is a CLIENT-scoped notification
 * (recipientType='CLIENT', recipientUserId=engagement.clientUserId). It reuses the
 * EPIC-016 sec.pol_Notification CLIENT branch — no new policy (DECISION-019-J).
 *
 * Coverage per AC/ADR (BRIEF-019 hard tier-3 gate):
 *   [POSITIVE] CLIENT-A receives document_request_created — they see their own notification
 *   [NEGATIVE] CLIENT-B does NOT see CLIENT-A's notification — ZERO rows (bidirectional HARD)
 *   [NEGATIVE] Null/zero SESSION_CONTEXT → ZERO rows (fail-closed, ADR-003 §5)
 *
 * Mirrors the CLIENT isolation harness in notification.rls.test.ts (EPIC-016 pattern).
 *
 * Gate Authoring Evidence (ENGINE.md § Gate Authoring Rules — three-item evidence):
 *   1. Run marker: this file at path packages/db/src/document-request.request-created.rls.test.ts.
 *      Test names listed in the describe block below.
 *   2. Named predicate: sec.fn_notification_access CLIENT branch in
 *      db/policies/0004-notification-policy.sql — the EXISTS branch keying on
 *      User.clerkId → User.id = Notification.recipientUserId. // ADR-005
 *   3. Counterfactual: removing the CLIENT EXISTS branch would make CLIENT-A see ZERO rows
 *      for their own notification (the positive test would fail). Removing the FILTER entirely
 *      would make CLIENT-B see CLIENT-A's row (the negative test would fail with count=1).
 *
 * Tagged AC IDs:
 *   AC-MSG-014-02 — client is notified when a document request is created for them
 *
 * // ADR-005 // ADR-003 // CS-SQL-001 // AC-MSG-014-02 // DECISION-019-I // DECISION-019-J
 *
 * Connection approach:
 *   Uses raw mssql (not Prisma). Rationale: same as other tier-3 RLS tests in this package
 *   (Prisma 5.22.0 sqlserver connector cannot parse port in the environment's URL form).
 *
 * Environment:
 *   DATABASE_URL_ADMIN — admin pool URL (sa / app_admin; bypasses RLS)
 *   DATABASE_URL       — request pool URL (app_user; subject to RLS)
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

/**
 * Unique clerk IDs to avoid collision with other test files.
 * Prefixed with 'docreq_rls_019_' to scope test data.
 */
const CLIENT_A_CLERK_ID = "docreq_rls_019_client_a";
const CLIENT_B_CLERK_ID = "docreq_rls_019_client_b";

let clientAUserId: string;
let clientBUserId: string;
let engagementRequestAId: string;
let engagementAId: string;
/** The document_request_created notification for CLIENT-A (recipientType='CLIENT', recipientUserId=clientAUserId). */
let notifClientAId: string;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Count Notification rows visible to the given CLIENT identity on the request pool,
 * scoped to a specific notification id.
 *
 * Returns 1 if the notification is visible to the identity, 0 otherwise.
 * AC-MSG-014-02: CLIENT sees their own; CLIENT-B does NOT see CLIENT-A's. // AC-MSG-014-02
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

  // Clear SESSION_CONTEXT after query (pool hygiene — ADR-003 §4)
  await pool.request().batch(
    `EXEC sp_set_session_context @key = N'clerk_user_id', @value = NULL, @read_only = 0;
     EXEC sp_set_session_context @key = N'role', @value = NULL, @read_only = 0;`
  );

  return cnt;
}

/**
 * Count Notification rows visible on the request pool with NO SESSION_CONTEXT set.
 * Scoped to a specific notification id.
 *
 * ADR-003 §5: null identity → predicate returns empty → zero rows (fail-closed). // ADR-003
 */
async function countVisibleWithNullContext(
  pool: InstanceType<typeof ConnectionPool>,
  notificationId: string,
): Promise<number> {
  // Do NOT set SESSION_CONTEXT — test the null-identity fail-closed path.
  const result = await pool.request().query(
    `SELECT COUNT(*) AS cnt FROM [dbo].[Notification] WHERE [id] = '${notificationId.replace(/'/g, "''")}'`
  );
  const cnt = ((result.recordset[0] as { cnt?: number } | undefined)?.cnt) ?? 0;
  return cnt;
}

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeAll(async () => {
  if (!ADMIN_URL) throw new Error("DATABASE_URL_ADMIN is required for RLS integration tests");
  if (!REQUEST_URL) throw new Error("DATABASE_URL is required for RLS integration tests");

  // Admin pool — IS_MEMBER('app_admin_role')=1 → RLS-exempt
  const adminConfig = parseSqlServerUrl(ADMIN_URL) as import("mssql").config;
  adminPool = new ConnectionPool(adminConfig);
  await adminPool.connect();

  // Request pool — app_user_role → subject to RLS
  const requestConfig = parseSqlServerUrl(REQUEST_URL) as import("mssql").config;
  requestPool = new ConnectionPool(requestConfig);
  await requestPool.connect();

  // ── Seed: CLIENT-A User ───────────────────────────────────────────────────
  const userAResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[User] ([clerkId], [email], [role], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'${CLIENT_A_CLERK_ID}', N'docreq-rls-019-client-a@example.com', N'CLIENT', SYSDATETIMEOFFSET())`
  );
  clientAUserId = userAResult.recordset[0]?.id ?? "";

  // ── Seed: CLIENT-B User ───────────────────────────────────────────────────
  const userBResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[User] ([clerkId], [email], [role], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'${CLIENT_B_CLERK_ID}', N'docreq-rls-019-client-b@example.com', N'CLIENT', SYSDATETIMEOFFSET())`
  );
  clientBUserId = userBResult.recordset[0]?.id ?? "";

  // ── Seed: EngagementRequest for CLIENT-A ─────────────────────────────────
  const reqAResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[EngagementRequest]
       ([firstName], [lastName], [email], [status], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'DocReqRLS019', N'ClientA', N'docreq-rls-019-req-a@example.com', N'accepted', SYSDATETIMEOFFSET())`
  );
  engagementRequestAId = reqAResult.recordset[0]?.id ?? "";

  // ── Seed: Engagement for CLIENT-A ────────────────────────────────────────
  const engAResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[Engagement]
       ([engagementRequestId], [clientUserId], [status], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES ('${engagementRequestAId}', '${clientAUserId}', N'New', SYSDATETIMEOFFSET())`
  );
  engagementAId = engAResult.recordset[0]?.id ?? "";

  // ── Seed: document_request_created notification for CLIENT-A ─────────────
  //
  // Simulates what createDocumentRequestAsAccountant does after INSERT (DECISION-019-I):
  // emitNotification({ recipientType:'CLIENT', recipientUserId:clientAUserId,
  //   type:'document_request_created', title:'A document request has been created for you',
  //   linkedItemType:'request', linkedItemId:<requestId> })
  //
  // We seed directly via admin pool (bypasses BLOCK predicate — mirrors emitNotification path).
  // ADR-005: admin pool INSERT is BLOCK-exempt. // ADR-005
  // CS-GEN-001: notification title carries no PII. // CS-GEN-001
  const notifResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[Notification]
       ([type], [title], [body], [recipientType], [recipientUserId], [linkedItemType])
     OUTPUT INSERTED.[id]
     VALUES (
       N'document_request_created',
       N'A document request has been created for you',
       NULL,
       N'CLIENT',
       '${clientAUserId}',
       N'request'
     )`
  );
  notifClientAId = notifResult.recordset[0]?.id ?? "";
}, 30_000);

afterAll(async () => {
  // Cleanup in reverse dependency order — admin pool bypasses RLS
  if (notifClientAId) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[Notification] WHERE [id] = '${notifClientAId}'`
    ).catch(() => { /* ignore */ });
  }
  if (engagementAId) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[Engagement] WHERE [id] = '${engagementAId}'`
    ).catch(() => { /* ignore */ });
  }
  if (engagementRequestAId) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[EngagementRequest] WHERE [id] = '${engagementRequestAId}'`
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
  await adminPool.close().catch(() => { /* ignore */ });
  await requestPool.close().catch(() => { /* ignore */ });
}, 30_000);

// ─── Tests ───────────────────────────────────────────────────────────────────

describe(
  "sec.pol_Notification — document_request_created CLIENT isolation (HARD GATE, ADR-005 §6, AC-MSG-014-02)",
  () => {

    /**
     * [POSITIVE] CLIENT-A receives the document_request_created notification — positive (HARD).
     *
     * sec.fn_notification_access CLIENT EXISTS branch:
     *   User.clerkId (= CLIENT_A_CLERK_ID) → User.id (= clientAUserId) = Notification.recipientUserId
     *   → EXISTS returns true → FILTER passes → 1 row visible.
     *
     * AC-MSG-014-02: client is notified when a document request is created for them. // AC-MSG-014-02
     * DECISION-019-I: notification emitted at creation with recipientUserId=engagement.clientUserId. // DECISION-019-I
     */
    it(
      "AC-MSG-014-02 — [POSITIVE] CLIENT-A receives document_request_created notification (their own) — 1 row",
      async () => {
        const count = await countVisibleNotificationById(
          requestPool,
          CLIENT_A_CLERK_ID,
          "CLIENT",
          notifClientAId,
        );
        // CLIENT-A must see their own document_request_created notification (1 row).
        expect(count).toBe(1);
      },
    );

    /**
     * [NEGATIVE] CLIENT-B does NOT see CLIENT-A's document_request_created notification — ZERO rows (HARD).
     *
     * sec.fn_notification_access CLIENT EXISTS branch:
     *   User.clerkId (= CLIENT_B_CLERK_ID) → User.id (= clientBUserId) ≠ Notification.recipientUserId (= clientAUserId)
     *   → EXISTS returns false → FILTER removes row → 0 rows visible.
     *
     * This is the bidirectional negative direction required by BRIEF-019 extra gate #6.
     * AC-MSG-014-02: only the engagement's own client receives the notification. // AC-MSG-014-02
     * ADR-005: RLS FILTER enforces per-recipient isolation (sec.pol_Notification). // ADR-005
     */
    it(
      "AC-MSG-014-02 — [NEGATIVE] CLIENT-B does NOT see CLIENT-A's document_request_created notification — ZERO rows (bidirectional HARD)",
      async () => {
        const count = await countVisibleNotificationById(
          requestPool,
          CLIENT_B_CLERK_ID,
          "CLIENT",
          notifClientAId,
        );
        // CLIENT-B must NOT see CLIENT-A's document_request_created notification (0 rows).
        expect(count).toBe(0);
      },
    );

    /**
     * [NEGATIVE] Null SESSION_CONTEXT → ZERO rows for document_request_created — fail-closed.
     *
     * ADR-003 §5: null identity → all predicate branches fail → FILTER removes all rows → 0 rows.
     * No error is raised — fail-closed, not fail-open.
     *
     * AC-MSG-014-02: an anonymous caller cannot read any client notification. // AC-MSG-014-02
     * ADR-003: SESSION_CONTEXT required; null context → zero rows. // ADR-003
     * ADR-005: FILTER predicate enforces fail-closed. // ADR-005
     */
    it(
      "AC-MSG-014-02 — [NEGATIVE] Null SESSION_CONTEXT → ZERO rows for document_request_created — fail-closed",
      async () => {
        const count = await countVisibleWithNullContext(requestPool, notifClientAId);
        // Null context must see ZERO notifications (fail-closed — no implicit read access). // ADR-003
        expect(count).toBe(0);
      },
    );

    /**
     * [POSITIVE] Admin pool reads all notifications — RLS-exempt verification.
     *
     * Verifies the seeded document_request_created notification exists with
     * the correct recipientType='CLIENT' and recipientUserId=clientAUserId.
     * IS_MEMBER('app_admin_role') = 1 → FILTER passes unconditionally. // ADR-005
     */
    it(
      "AC-MSG-014-02 — [POSITIVE] Admin pool (app_admin_role) reads document_request_created notification — RLS-exempt",
      async () => {
        const result = await adminPool.request().query<{
          id: string;
          type: string;
          recipientType: string;
          recipientUserId: string;
        }>(
          `SELECT [id], [type], [recipientType], [recipientUserId]
           FROM [dbo].[Notification]
           WHERE [id] = '${notifClientAId}'`
        );
        expect(result.recordset).toHaveLength(1);
        expect(result.recordset[0]?.type).toBe("document_request_created");
        expect(result.recordset[0]?.recipientType).toBe("CLIENT");
        expect(result.recordset[0]?.recipientUserId).toBe(clientAUserId);
      },
    );
  },
);
