/**
 * packages/db/src/onboarding-completion.integration.test.ts
 *
 * TIER-3 INTEGRATION TEST — requires real SQL Server (Docker pre-flight mandatory, ADR-012)
 *
 * Tests processOnboardingCompletion() against the real container DB.
 *
 * Grouped coverage (in AC-id order):
 *
 * GROUP 1 — completion predicate + status transition (AC-ONBD-005-01/-02, AC-ONBD-006-01/-02/-03):
 *   [AC-ONBD-006-01][AC-ONBD-006-02] all steps satisfied → transitions New → In Progress (automatic)
 *   [AC-ONBD-006-03][AC-ONBD-005-02] incomplete onboarding → stays New, no notification
 *   [AC-ONBD-006-03][fire-once]      two calls → exactly ONE notification + ONE audit row
 *   [AC-ONBD-005-01]                  already-In-Progress engagement → no-op (returns false)
 *
 * GROUP 2 — notification identity (AC-ONBD-007-01/-02, AC-MSG-013-04):
 *   [AC-ONBD-007-01][AC-MSG-013-04]  on completion, ONE onboarding_completed notification created
 *   [AC-ONBD-007-02]                  notification title/body identifies client + engagement
 *   [AC-ONBD-007-01][ADR-005 §6]    ACCOUNTANT reads the notification; CLIENT + null reads ZERO
 *
 * GROUP 3 — audit record (ADR-019):
 *   [ADR-019]  engagement.transition audit row recorded on transition (and not on no-op)
 *
 * ADR-005 §6 (HARD GATE): a per-policy integration test proves the onboarding-complete
 *   notification is readable by ACCOUNTANT and reads ZERO for CLIENT and null-SESSION_CONTEXT.
 *
 * Connection approach:
 *   Raw mssql for both admin pool (setup/verification, RLS-exempt) and request pool
 *   (SESSION_CONTEXT reads for RLS tests). Mirrors notification.rls.test.ts pattern.
 *   (Reason: Prisma 5.22.0 sqlserver connector port-parsing limitation — TASK-002.)
 *
 * Environment:
 *   DATABASE_URL_ADMIN — admin pool URL (bypasses RLS)
 *   DATABASE_URL       — request pool URL (subject to RLS)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import mssqlPkg from "mssql";
import { parseSqlServerUrl } from "./sql-server-url.js";
import {
  processOnboardingCompletion,
  NOTIFICATION_TYPE_ONBOARDING_COMPLETE,
  ENGAGEMENT_TRANSITION_ACTION,
} from "./onboarding-completion.js";

const { ConnectionPool } = mssqlPkg;

// ─── Connection setup ─────────────────────────────────────────────────────────

let adminPool: InstanceType<typeof ConnectionPool>;
let requestPool: InstanceType<typeof ConnectionPool>;

const ADMIN_URL = process.env["DATABASE_URL_ADMIN"];
const REQUEST_URL = process.env["DATABASE_URL"];

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Count Notification rows of type onboarding_completed for the given engagementRequestId,
 * visible under the given SESSION_CONTEXT (or no context for null-identity tests).
 *
 * Uses the request pool — subject to sec.pol_Notification (ADR-005 §6).
 */
async function countOnboardingNotificationsAs(
  pool: InstanceType<typeof ConnectionPool>,
  engagementRequestId: string,
  clerkUserId: string | null,
  role: string | null,
): Promise<number> {
  if (clerkUserId !== null && role !== null) {
    await pool.request().batch(
      `EXEC sp_set_session_context @key = N'clerk_user_id', @value = N'${clerkUserId.replace(/'/g, "''")}', @read_only = 0;
       EXEC sp_set_session_context @key = N'role', @value = N'${role.replace(/'/g, "''")}', @read_only = 0;`
    );
  }

  const req = pool.request();
  req.input("engagementRequestId", engagementRequestId);
  req.input("type", NOTIFICATION_TYPE_ONBOARDING_COMPLETE);
  const result = await req.query<{ cnt: number }>(
    `SELECT COUNT(*) AS cnt FROM [dbo].[Notification]
     WHERE [engagementRequestId] = @engagementRequestId
       AND [type] = @type`
  );
  const cnt = result.recordset[0]?.cnt ?? 0;

  // Clear SESSION_CONTEXT (pool hygiene, ADR-003 §4)
  await pool.request().batch(
    `EXEC sp_set_session_context @key = N'clerk_user_id', @value = NULL, @read_only = 0;
     EXEC sp_set_session_context @key = N'role', @value = NULL, @read_only = 0;`
  );

  return cnt;
}

/**
 * Count AuditEvent rows for engagement.transition on the given engagementId.
 * Uses admin pool (AuditEvent is accountant-readable; admin is always RLS-exempt).
 */
async function countTransitionAuditRows(engagementId: string): Promise<number> {
  const req = adminPool.request();
  req.input("targetId", engagementId);
  req.input("action", ENGAGEMENT_TRANSITION_ACTION);
  const result = await req.query<{ cnt: number }>(
    `SELECT COUNT(*) AS cnt FROM [dbo].[AuditEvent]
     WHERE [targetId] = @targetId
       AND [action] = @action`
  );
  return result.recordset[0]?.cnt ?? 0;
}

/**
 * Read a single Notification row of type onboarding_completed for the given engagementRequestId.
 * Uses admin pool (RLS-exempt) — for content verification independent of RLS.
 */
async function getOnboardingNotification(engagementRequestId: string): Promise<{
  id: string;
  type: string;
  title: string;
  body: string | null;
  engagementRequestId: string;
} | null> {
  const req = adminPool.request();
  req.input("engagementRequestId", engagementRequestId);
  req.input("type", NOTIFICATION_TYPE_ONBOARDING_COMPLETE);
  const result = await req.query<{
    id: string;
    type: string;
    title: string;
    body: string | null;
    engagementRequestId: string;
  }>(
    `SELECT TOP 1 [id], [type], [title], [body], [engagementRequestId]
     FROM [dbo].[Notification]
     WHERE [engagementRequestId] = @engagementRequestId
       AND [type] = @type`
  );
  return result.recordset[0] ?? null;
}

// ─── Seed helpers ─────────────────────────────────────────────────────────────

/** IDs tracked for cleanup (FK order: Notification, AuditEvent, Document, DocumentRequest, Engagement, EngagementRequest, User) */
const cleanupNotificationIds: string[] = [];
const cleanupEngagementIds: string[] = [];
const cleanupRequestIds: string[] = [];
const cleanupUserIds: string[] = [];
const cleanupDocumentIds: string[] = [];
const cleanupDocumentRequestIds: string[] = [];

interface SeedEngagementOpts {
  label: string;
  /** Clerk user ID for the CLIENT (for RLS tests) */
  clientClerkId?: string;
  /** Set letterSignedAt? */
  signed?: boolean;
  /** Set questionnaireSubmittedAt? */
  questionnaireSubmitted?: boolean;
  /** Initial status (defaults to 'New') */
  status?: string;
}

interface SeedEngagementResult {
  engagementId: string;
  engagementRequestId: string;
  clientUserId: string | null;
  clientClerkId: string;
  clientFirstName: string;
  clientLastName: string;
}

/**
 * Seed a full engagement (EngagementRequest + Engagement + optional User).
 * Returns IDs for use in tests and cleanup.
 */
async function seedEngagement(opts: SeedEngagementOpts): Promise<SeedEngagementResult> {
  const ts = Date.now();
  const clerkId = opts.clientClerkId ?? `completion_client_${ts}_${opts.label.replace(/\s/g, "_")}`;
  const firstName = `Test${opts.label}`;
  const lastName = `Client`;

  // Insert User if we need client isolation for RLS tests
  let clientUserId: string | null = null;
  const userResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[User] ([clerkId], [email], [role], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'${clerkId}', N'${clerkId}@test.example.com', N'CLIENT', SYSDATETIMEOFFSET())`
  );
  clientUserId = userResult.recordset[0]?.id ?? null;
  if (clientUserId) cleanupUserIds.push(clientUserId);

  // Insert EngagementRequest
  const reqReq = adminPool.request();
  reqReq.input("firstName", firstName);
  reqReq.input("lastName", lastName);
  const reqResult = await reqReq.query<{ id: string }>(
    `INSERT INTO [dbo].[EngagementRequest]
       ([firstName], [lastName], [email], [status], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (@firstName, @lastName,
             N'${clerkId}@req.example.com',
             N'accepted', SYSDATETIMEOFFSET())`
  );
  const engagementRequestId = reqResult.recordset[0]?.id ?? "";
  cleanupRequestIds.push(engagementRequestId);

  // Insert Engagement
  const status = opts.status ?? "New";
  const letterSignedAt = opts.signed ? "SYSDATETIMEOFFSET()" : "NULL";
  const questionnaireSubmittedAt = opts.questionnaireSubmitted ? "SYSDATETIMEOFFSET()" : "NULL";

  const engReq = adminPool.request();
  engReq.input("engagementRequestId", engagementRequestId);
  engReq.input("clientUserId", clientUserId);
  engReq.input("status", status);

  const engResult = await engReq.query<{ id: string }>(
    `INSERT INTO [dbo].[Engagement]
       ([engagementRequestId], [clientUserId], [status],
        [letterSignedAt], [questionnaireSubmittedAt], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (
       @engagementRequestId, @clientUserId, @status,
       ${letterSignedAt}, ${questionnaireSubmittedAt},
       SYSDATETIMEOFFSET()
     )`
  );
  const engagementId = engResult.recordset[0]?.id ?? "";
  cleanupEngagementIds.push(engagementId);

  return {
    engagementId,
    engagementRequestId,
    clientUserId,
    clientClerkId: clerkId,
    clientFirstName: firstName,
    clientLastName: lastName,
  };
}

/**
 * Seed a DocumentRequest for an engagement and return its ID.
 */
async function seedDocumentRequest(engagementId: string, label: string): Promise<string> {
  const reqObj = adminPool.request();
  reqObj.input("engagementId", engagementId);
  reqObj.input("label", label);
  const result = await reqObj.query<{ id: string }>(
    `INSERT INTO [dbo].[DocumentRequest]
       ([engagementId], [label], [createdBy], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (@engagementId, @label, N'accountant', SYSDATETIMEOFFSET())`
  );
  const id = result.recordset[0]?.id ?? "";
  cleanupDocumentRequestIds.push(id);
  return id;
}

/**
 * Seed an active Document fulfilling a DocumentRequest.
 */
async function seedActiveDocument(
  engagementId: string,
  documentRequestId: string,
): Promise<string> {
  const ts = Date.now();
  const req = adminPool.request();
  req.input("engagementId", engagementId);
  req.input("documentRequestId", documentRequestId);
  req.input("filename", `test-${ts}.pdf`);
  const result = await req.query<{ id: string }>(
    `INSERT INTO [dbo].[Document]
       ([engagementId], [documentRequestId], [storageKey], [originalFilename],
        [contentType], [sizeBytes], [status], [version], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (
       @engagementId, @documentRequestId,
       N'test/path/doc.pdf', @filename,
       N'application/pdf', 1000, N'active', 1,
       SYSDATETIMEOFFSET()
     )`
  );
  const id = result.recordset[0]?.id ?? "";
  cleanupDocumentIds.push(id);
  return id;
}

/**
 * Read the current status of an engagement from the admin pool.
 */
async function getEngagementStatus(engagementId: string): Promise<string | null> {
  const req = adminPool.request();
  req.input("id", engagementId);
  const result = await req.query<{ status: string }>(
    `SELECT [status] FROM [dbo].[Engagement] WHERE [id] = @id`
  );
  return result.recordset[0]?.status ?? null;
}

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeAll(async () => {
  if (!ADMIN_URL) throw new Error("DATABASE_URL_ADMIN is required for onboarding-completion integration tests");
  if (!REQUEST_URL) throw new Error("DATABASE_URL is required for onboarding-completion integration tests (RLS boundary tests)");

  const adminConfig = parseSqlServerUrl(ADMIN_URL) as import("mssql").config;
  adminPool = new ConnectionPool(adminConfig);
  await adminPool.connect();

  const requestConfig = parseSqlServerUrl(REQUEST_URL) as import("mssql").config;
  requestPool = new ConnectionPool(requestConfig);
  await requestPool.connect();
}, 30_000);

afterAll(async () => {
  // Cleanup in FK order: Notification → Document → DocumentRequest → Engagement → EngagementRequest → User
  // First: delete any onboarding_completed notifications for our engagements
  for (const engReqId of cleanupRequestIds) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[Notification]
       WHERE [engagementRequestId] = '${engReqId}'
         AND [type] = '${NOTIFICATION_TYPE_ONBOARDING_COMPLETE}'`
    ).catch(() => {});
  }
  // Delete any tracked notifications
  for (const id of cleanupNotificationIds) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[Notification] WHERE [id] = '${id}'`
    ).catch(() => {});
  }
  // Documents
  for (const id of cleanupDocumentIds) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[Document] WHERE [id] = '${id}'`
    ).catch(() => {});
  }
  // DocumentRequests
  for (const id of cleanupDocumentRequestIds) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[DocumentRequest] WHERE [id] = '${id}'`
    ).catch(() => {});
  }
  // Engagements
  for (const id of cleanupEngagementIds) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[Engagement] WHERE [id] = '${id}'`
    ).catch(() => {});
  }
  // EngagementRequests
  for (const id of cleanupRequestIds) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[EngagementRequest] WHERE [id] = '${id}'`
    ).catch(() => {});
  }
  // Users
  for (const id of cleanupUserIds) {
    await adminPool.request().query(
      `DELETE FROM [dbo].[User] WHERE [id] = '${id}'`
    ).catch(() => {});
  }

  await adminPool.close().catch(() => {});
  await requestPool.close().catch(() => {});
}, 30_000);

// ─── GROUP 1: Completion predicate + status transition ────────────────────────

describe("GROUP 1 — completion predicate + status transition", () => {

  /**
   * [AC-ONBD-006-01][AC-ONBD-006-02] All three steps satisfied → automatic New → In Progress.
   * No manual accountant action required (AC-ONBD-006-02): transition driven by system call only.
   */
  it("AC-ONBD-006-01 / AC-ONBD-006-02 — all steps satisfied → transitions New → In Progress automatically", async () => {
    // Seed engagement with letter signed + questionnaire submitted (zero DocumentRequests → vacuously done)
    const { engagementId } = await seedEngagement({
      label: "complete1",
      signed: true,
      questionnaireSubmitted: true,
    });

    // Pre-condition: status is New
    expect(await getEngagementStatus(engagementId)).toBe("New");

    // System-initiated call (no accountant action)
    const result = await processOnboardingCompletion(engagementId);

    // AC-ONBD-006-01: transitions to In Progress
    expect(result.transitioned).toBe(true);
    expect(await getEngagementStatus(engagementId)).toBe("In Progress");
  }, 15_000);

  /**
   * [AC-ONBD-006-03][AC-ONBD-005-02] Letter not signed → stays New, no notification.
   */
  it("AC-ONBD-006-03 / AC-ONBD-005-02 — letter NOT signed → stays New, no notification created", async () => {
    const { engagementId, engagementRequestId } = await seedEngagement({
      label: "incomplete_letter",
      signed: false,           // letter NOT done
      questionnaireSubmitted: true,
    });

    const result = await processOnboardingCompletion(engagementId);

    expect(result.transitioned).toBe(false);
    expect(await getEngagementStatus(engagementId)).toBe("New");

    // AC-ONBD-006-03: no notification created for incomplete engagement
    const notifCount = await countOnboardingNotificationsAs(
      adminPool,
      engagementRequestId,
      null, null, // admin pool is RLS-exempt, no need to set context
    );
    // Use admin pool for count (no SESSION_CONTEXT needed — it's RLS-exempt)
    const adminReq = adminPool.request();
    adminReq.input("engagementRequestId", engagementRequestId);
    adminReq.input("type", NOTIFICATION_TYPE_ONBOARDING_COMPLETE);
    const countResult = await adminReq.query<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM [dbo].[Notification]
       WHERE [engagementRequestId] = @engagementRequestId
         AND [type] = @type`
    );
    expect(countResult.recordset[0]?.cnt ?? 0).toBe(0);
  }, 15_000);

  /**
   * [AC-ONBD-006-03][AC-ONBD-005-02] Questionnaire not submitted → stays New, no notification.
   */
  it("AC-ONBD-006-03 / AC-ONBD-005-02 — questionnaire NOT submitted → stays New, no notification", async () => {
    const { engagementId, engagementRequestId } = await seedEngagement({
      label: "incomplete_questionnaire",
      signed: true,
      questionnaireSubmitted: false, // questionnaire NOT done
    });

    const result = await processOnboardingCompletion(engagementId);

    expect(result.transitioned).toBe(false);
    expect(await getEngagementStatus(engagementId)).toBe("New");

    const adminReq = adminPool.request();
    adminReq.input("engagementRequestId", engagementRequestId);
    adminReq.input("type", NOTIFICATION_TYPE_ONBOARDING_COMPLETE);
    const countResult = await adminReq.query<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM [dbo].[Notification]
       WHERE [engagementRequestId] = @engagementRequestId
         AND [type] = @type`
    );
    expect(countResult.recordset[0]?.cnt ?? 0).toBe(0);
  }, 15_000);

  /**
   * [AC-ONBD-006-03][AC-ONBD-005-02] Outstanding document request → stays New, no notification.
   * Letter signed, questionnaire done, but one DocumentRequest is outstanding.
   */
  it("AC-ONBD-006-03 / AC-ONBD-005-02 — outstanding DocumentRequest → stays New, no notification", async () => {
    const { engagementId, engagementRequestId } = await seedEngagement({
      label: "incomplete_docs",
      signed: true,
      questionnaireSubmitted: true,
    });

    // Seed a DocumentRequest without a fulfilling Document → upload NOT done
    await seedDocumentRequest(engagementId, "W-2 please");

    const result = await processOnboardingCompletion(engagementId);

    expect(result.transitioned).toBe(false);
    expect(await getEngagementStatus(engagementId)).toBe("New");

    const adminReq = adminPool.request();
    adminReq.input("engagementRequestId", engagementRequestId);
    adminReq.input("type", NOTIFICATION_TYPE_ONBOARDING_COMPLETE);
    const countResult = await adminReq.query<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM [dbo].[Notification]
       WHERE [engagementRequestId] = @engagementRequestId
         AND [type] = @type`
    );
    expect(countResult.recordset[0]?.cnt ?? 0).toBe(0);
  }, 15_000);

  /**
   * [AC-ONBD-005-01] Fulfilled DocumentRequest satisfies the document-upload step.
   */
  it("AC-ONBD-005-01 — fulfilled DocumentRequest → document-upload step done → transitions", async () => {
    const { engagementId } = await seedEngagement({
      label: "docs_fulfilled",
      signed: true,
      questionnaireSubmitted: true,
    });

    // Seed DocumentRequest + fulfilling active Document
    const drId = await seedDocumentRequest(engagementId, "W-2");
    await seedActiveDocument(engagementId, drId);

    const result = await processOnboardingCompletion(engagementId);

    expect(result.transitioned).toBe(true);
    expect(await getEngagementStatus(engagementId)).toBe("In Progress");
  }, 15_000);

  /**
   * [AC-ONBD-006-03][fire-once] Two calls → exactly ONE notification + ONE audit row.
   * The fire-once guard (UPDATE WHERE status='New' + @@ROWCOUNT) ensures the second call
   * is a guaranteed no-op.
   */
  it("AC-ONBD-006-03 (fire-once) — two processOnboardingCompletion calls → exactly ONE notification + ONE audit row", async () => {
    const { engagementId, engagementRequestId } = await seedEngagement({
      label: "fire_once",
      signed: true,
      questionnaireSubmitted: true,
    });

    // First call — should transition
    const first = await processOnboardingCompletion(engagementId);
    expect(first.transitioned).toBe(true);

    // Second call — should be no-op (already In Progress)
    const second = await processOnboardingCompletion(engagementId);
    expect(second.transitioned).toBe(false);

    // EXACTLY one notification
    const adminReq = adminPool.request();
    adminReq.input("engagementRequestId", engagementRequestId);
    adminReq.input("type", NOTIFICATION_TYPE_ONBOARDING_COMPLETE);
    const countResult = await adminReq.query<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM [dbo].[Notification]
       WHERE [engagementRequestId] = @engagementRequestId
         AND [type] = @type`
    );
    expect(countResult.recordset[0]?.cnt ?? 0).toBe(1);

    // EXACTLY one audit row
    const auditCount = await countTransitionAuditRows(engagementId);
    expect(auditCount).toBe(1);
  }, 20_000);

  /**
   * Already-In-Progress engagement → returns false immediately (no-op).
   * Guard: early status check before any writes.
   */
  it("AC-ONBD-006-03 — already-In-Progress engagement → returns transitioned: false (no-op)", async () => {
    const { engagementId, engagementRequestId } = await seedEngagement({
      label: "already_in_progress",
      signed: true,
      questionnaireSubmitted: true,
      status: "In Progress",
    });

    const result = await processOnboardingCompletion(engagementId);

    expect(result.transitioned).toBe(false);

    // No notification created for already-transitioned engagement
    const adminReq = adminPool.request();
    adminReq.input("engagementRequestId", engagementRequestId);
    adminReq.input("type", NOTIFICATION_TYPE_ONBOARDING_COMPLETE);
    const countResult = await adminReq.query<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM [dbo].[Notification]
       WHERE [engagementRequestId] = @engagementRequestId
         AND [type] = @type`
    );
    expect(countResult.recordset[0]?.cnt ?? 0).toBe(0);
  }, 15_000);

});

// ─── GROUP 2: Notification identity ──────────────────────────────────────────

describe("GROUP 2 — notification identity + accountant-only read boundary", () => {

  let notifEngagementId: string;
  let notifEngagementRequestId: string;
  let notifClientFirstName: string;
  let notifClientLastName: string;
  let notifClientClerkId: string;

  beforeAll(async () => {
    // Seed a fully-satisfied engagement for notification content tests
    const seed = await seedEngagement({
      label: "notif_content",
      signed: true,
      questionnaireSubmitted: true,
    });
    notifEngagementId = seed.engagementId;
    notifEngagementRequestId = seed.engagementRequestId;
    notifClientFirstName = seed.clientFirstName;
    notifClientLastName = seed.clientLastName;
    notifClientClerkId = seed.clientClerkId;

    await processOnboardingCompletion(notifEngagementId);
  }, 20_000);

  /**
   * [AC-ONBD-007-01][AC-MSG-013-04] Exactly one onboarding_completed notification created.
   */
  it("AC-ONBD-007-01 / AC-MSG-013-04 — on completion, exactly ONE onboarding_completed notification is created", async () => {
    const req = adminPool.request();
    req.input("engagementRequestId", notifEngagementRequestId);
    req.input("type", NOTIFICATION_TYPE_ONBOARDING_COMPLETE);
    const result = await req.query<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM [dbo].[Notification]
       WHERE [engagementRequestId] = @engagementRequestId
         AND [type] = @type`
    );
    expect(result.recordset[0]?.cnt ?? 0).toBe(1);
  }, 10_000);

  /**
   * [AC-ONBD-007-02] Notification title and body identify the client + engagement.
   * Title contains the client's full name.
   * Body references the client and the engagement context.
   * engagementRequestId FK resolves to the correct engagement.
   */
  it("AC-ONBD-007-02 — notification identifies client (title/body contain name) + references engagement via engagementRequestId", async () => {
    const notif = await getOnboardingNotification(notifEngagementRequestId);

    expect(notif).not.toBeNull();
    expect(notif!.type).toBe(NOTIFICATION_TYPE_ONBOARDING_COMPLETE);

    const clientFullName = `${notifClientFirstName} ${notifClientLastName}`.trim();

    // Title identifies the client
    expect(notif!.title).toContain(clientFullName);

    // Body identifies the client and engagement
    expect(notif!.body).toContain(clientFullName);

    // FK resolves to the correct engagement (via the 1:1 EngagementRequest → Engagement link)
    expect(notif!.engagementRequestId.toLowerCase()).toBe(
      notifEngagementRequestId.toLowerCase()
    );
  }, 10_000);

  /**
   * [AC-ONBD-007-01][ADR-005 §6] ACCOUNTANT reads the notification.
   * Request pool with ACCOUNTANT SESSION_CONTEXT → sees the row.
   */
  it("AC-ONBD-007-01 (ADR-005 §6) [POSITIVE] ACCOUNTANT reads the onboarding_completed notification", async () => {
    const count = await countOnboardingNotificationsAs(
      requestPool,
      notifEngagementRequestId,
      "user_accountant_onboarding_test",
      "ACCOUNTANT",
    );
    expect(count).toBeGreaterThanOrEqual(1);
  }, 10_000);

  /**
   * [AC-ONBD-007-01][ADR-005 §6] CLIENT reads ZERO — accountant-only (fail-closed).
   * sec.pol_Notification FILTER: CLIENT branch absent → zero rows.
   */
  it("AC-ONBD-007-01 (ADR-005 §6) [NEGATIVE] CLIENT reads ZERO onboarding_completed notifications (fail-closed)", async () => {
    const count = await countOnboardingNotificationsAs(
      requestPool,
      notifEngagementRequestId,
      notifClientClerkId,
      "CLIENT",
    );
    expect(count).toBe(0);
  }, 10_000);

  /**
   * [AC-ONBD-007-01][ADR-005 §6] Null SESSION_CONTEXT reads ZERO — fail-closed (ADR-003 §5).
   */
  it("AC-ONBD-007-01 (ADR-005 §6) [NEGATIVE] Null SESSION_CONTEXT reads ZERO notifications — fail-closed (ADR-003 §5)", async () => {
    const count = await countOnboardingNotificationsAs(
      requestPool,
      notifEngagementRequestId,
      null, null,
    );
    expect(count).toBe(0);
  }, 10_000);

});

// ─── GROUP 3: Audit record ────────────────────────────────────────────────────

describe("GROUP 3 — audit record (ADR-019)", () => {

  /**
   * [ADR-019] On transition, an engagement.transition audit row is recorded.
   * Not recorded on no-op (incomplete onboarding).
   */
  it("ADR-019 — engagement.transition audit row recorded on transition; ZERO rows on incomplete no-op", async () => {
    // Seed a complete engagement → should produce 1 audit row
    const { engagementId: completeEngId } = await seedEngagement({
      label: "audit_complete",
      signed: true,
      questionnaireSubmitted: true,
    });

    await processOnboardingCompletion(completeEngId);
    const auditCount = await countTransitionAuditRows(completeEngId);
    expect(auditCount).toBe(1);

    // Seed an incomplete engagement → should NOT produce an audit row
    const { engagementId: incompleteEngId } = await seedEngagement({
      label: "audit_incomplete",
      signed: false, // incomplete
      questionnaireSubmitted: true,
    });

    await processOnboardingCompletion(incompleteEngId);
    const auditCountIncomplete = await countTransitionAuditRows(incompleteEngId);
    expect(auditCountIncomplete).toBe(0);
  }, 20_000);

  /**
   * [ADR-019] Audit row contains correct action, targetType, targetId, sourceSurface, outcome.
   */
  it("ADR-019 — audit row has correct action, targetType, targetId, sourceSurface, outcome", async () => {
    const { engagementId } = await seedEngagement({
      label: "audit_fields",
      signed: true,
      questionnaireSubmitted: true,
    });

    await processOnboardingCompletion(engagementId);

    const req = adminPool.request();
    req.input("targetId", engagementId);
    req.input("action", ENGAGEMENT_TRANSITION_ACTION);
    const result = await req.query<{
      action: string;
      targetType: string;
      targetId: string;
      sourceSurface: string;
      outcome: string;
      actorRole: string;
    }>(
      `SELECT TOP 1 [action], [targetType], [targetId], [sourceSurface], [outcome], [actorRole]
       FROM [dbo].[AuditEvent]
       WHERE [targetId] = @targetId
         AND [action] = @action`
    );

    const row = result.recordset[0];
    expect(row).not.toBeUndefined();
    expect(row!.action).toBe(ENGAGEMENT_TRANSITION_ACTION);
    expect(row!.targetType).toBe("Engagement");
    // targetId comparison is case-insensitive (SQL Server UNIQUEIDENTIFIER vs string)
    expect(row!.targetId.toLowerCase()).toBe(engagementId.toLowerCase());
    expect(row!.sourceSurface).toBe("portal");
    expect(row!.outcome).toBe("success");
    // DECISION: system actor uses role='ACCOUNTANT' for the admin/privileged context
    expect(row!.actorRole).toBe("ACCOUNTANT");
  }, 15_000);

});
