/**
 * packages/db/src/thread-archive.integration.test.ts
 *
 * TIER-3 INTEGRATION TEST — requires real SQL Server (ADR-012 § Tier 3)
 *
 * TASK-017-007: Archive-on-close — additive wiring into the EPIC-010 Complete transition.
 * EPIC-017 / BRIEF-017.
 *
 * Acceptance criteria covered:
 *
 *   AC-MSG-006-01 — Archive is a state flip, NOT a delete.
 *     Test: after engagement → Complete, the Thread row is still present,
 *           all Message rows are still present, row counts unchanged.
 *
 *   AC-MSG-006-02 — Thread is marked archived (not deleted) when engagement closes.
 *     Test: after Complete, Thread.status='archived', archivedAt is non-null,
 *           and the thread is found by the engagement's thread lookup.
 *
 *   AC-MSG-006-03 — Archived thread stays fully readable by participants.
 *     Test: getThreadForEngagement + listThreadMessages under the client's SESSION_CONTEXT
 *           still return the thread and its full message history after Complete.
 *           RLS read predicates do NOT filter on Thread.status (DECISION-017-002-A).
 *
 * Additional invariants proven:
 *
 *   - Idempotent: calling archiveEngagementThread a second time (on an already-archived thread)
 *     is a no-op — status stays 'archived', archivedAt is unchanged.
 *   - General threads are unaffected: a general thread (engagementId IS NULL) is never
 *     archived by the engagement-close path (WHERE keys on engagementId).
 *   - No purge / 90-day-floor logic applied to threads:
 *     - RETENTION_WINDOW_YEARS applies to Engagement.completedAt for documents (EPIC-015).
 *     - Thread / Message rows have no retainUntil / purge-at column — indefinite retention
 *       (ADR-018 tier-3). Confirm: Thread and Message rows are present after Complete.
 *
 * Architecture notes:
 *   - transitionEngagementStatus drives the engagement to Review → Complete in each test
 *     (mirrors engagement.lifecycle.transition.test.ts pattern). confirmDelivery +
 *     confirmFiling must be called first (AC-LIFE-005-03 gate).
 *   - archiveEngagementThread is wired inside transitionEngagementStatus's post-commit
 *     Complete block — we prove it via the observable state (Thread.status='archived').
 *   - Read functions use withClerkIdentity (CS-TS-001 / ADR-003 SESSION_CONTEXT).
 *   - Admin pool verifies row presence beyond RLS (bypass for the "nothing deleted" assertion).
 *   - DECISION-017-002-A: RLS read predicates do NOT filter on status — verified by the
 *     archived-thread-stays-readable test (AC-MSG-006-03).
 *
 * ADR-003: SESSION_CONTEXT propagation via withClerkIdentity for request-pool reads. // ADR-003
 * ADR-005: sec.pol_Thread / sec.pol_Message are the sole read enforcement boundaries. // ADR-005
 * ADR-018: tier-3 indefinite retention — no purge, no 90-day floor on threads. // ADR-018
 * ADR-019: transitionEngagementStatus records audit events; archiveEngagementThread does not
 *           emit its own audit (no audit hook in the repository — no audit requirement for the
 *           archive flip itself; the transition audit event captures the Complete transition). // ADR-019
 * CS-TS-001: all request-pool reads go through the db wrapper via withClerkIdentity. // CS-TS-001
 * CS-TS-002: admin pool via getAdminPool() — only inside packages/db. // CS-TS-002
 * CS-GEN-001: message bodies not logged in this test. // CS-GEN-001
 * CS-GEN-002: additive — new test file; no existing test modified. // CS-GEN-002
 * CS-GEN-003: governing keys cited throughout. // CS-GEN-003
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import mssqlPkg from "mssql";
import { parseSqlServerUrl } from "./sql-server-url.js";
import { withClerkIdentity } from "./context.js";
import {
  getOrCreateEngagementThread,
  createGeneralThread,
  getThreadForEngagement,
  listThreadMessages,
  archiveEngagementThread,
} from "./repositories/thread.js";
import { appendMessage } from "./repositories/message.js";
import {
  transitionEngagementStatus,
  confirmDelivery,
  confirmFiling,
} from "./repositories/engagement.js";
import type { AuditActor } from "./audit.js";
import {
  resetNotificationTransportForTesting,
} from "@tax-portal/realtime";

const { ConnectionPool } = mssqlPkg;

// ─── Connection setup ─────────────────────────────────────────────────────────

let adminPool: InstanceType<typeof ConnectionPool>;

const ADMIN_URL = process.env["DATABASE_URL_ADMIN"];

// ─── Test data ────────────────────────────────────────────────────────────────

/**
 * Test-unique clerk IDs — avoids collision with other integration tests.
 * Prefixed with 'thr_arch_017_007_' to scope test data.
 */
const CLIENT_A_CLERK_ID = "thr_arch_017_007_client_a";
const ACCOUNTANT_CLERK_ID = "thr_arch_017_007_acct";

/** Synthetic accountant actor for audit events. // ADR-019 */
const ACCOUNTANT_ACTOR: AuditActor = {
  clerkUserId: ACCOUNTANT_CLERK_ID,
  role: "ACCOUNTANT",
};

/** Synthetic User.id for CLIENT-A */
let clientAUserId: string;

// IDs registered for teardown
const createdUserIds: string[] = [];
const createdEngagementRequestIds: string[] = [];
const createdEngagementIds: string[] = [];
const createdThreadIds: string[] = [];
const createdMessageIds: string[] = [];

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Case-insensitive UNIQUEIDENTIFIER comparison.
 * SQL Server may return GUIDs in uppercase or lowercase.
 */
function eqId(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

/**
 * Seeds a minimal EngagementRequest + Engagement in 'Review' status,
 * with both delivery and filing confirmed (so → Complete can be called directly).
 *
 * Returns engagementId and requestId for teardown.
 *
 * The engagement is seeded with clientUserId=clientAUserId (simulating a returning-client
 * engagement, EPIC-012 path). clientUserId IS NOT NULL ensures notification path fires;
 * the test focuses on the archive path, not the notification.
 */
async function seedReviewEngagement(): Promise<{
  engagementId: string;
  requestId: string;
}> {
  // Insert EngagementRequest
  const erResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[EngagementRequest]
       ([firstName], [lastName], [email], [status], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'ArchiveTest', N'Client', N'thr-arch-017-007-${Date.now()}@example.com', N'accepted', SYSDATETIMEOFFSET())`,
  );
  const requestId = erResult.recordset[0]?.id ?? "";
  createdEngagementRequestIds.push(requestId);

  // Insert Engagement with status='Review', clientUserId=clientAUserId
  const engReq = adminPool.request();
  engReq.input("requestId", requestId);
  engReq.input("clientUserId", clientAUserId);
  const engResult = await engReq.query<{ id: string }>(
    `INSERT INTO [dbo].[Engagement]
       ([engagementRequestId], [clientUserId], [status], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (@requestId, @clientUserId, N'Review', SYSDATETIMEOFFSET())`,
  );
  const engagementId = engResult.recordset[0]?.id ?? "";
  createdEngagementIds.push(engagementId);

  // Set both confirmations (AC-LIFE-005-03: both required before → Complete)
  await confirmDelivery({ engagementId, actor: ACCOUNTANT_ACTOR, sourceSurface: "admin" });
  await confirmFiling({ engagementId, actor: ACCOUNTANT_ACTOR, sourceSurface: "admin" });

  return { engagementId, requestId };
}

/**
 * Reads the Thread row via admin pool (bypasses RLS — for "nothing deleted" assertions).
 * Returns null if no thread exists for the engagement.
 */
async function getThreadByEngagementDirect(engagementId: string): Promise<{
  id: string;
  status: string;
  archivedAt: Date | null;
  kind: string;
} | null> {
  const result = await adminPool.request().query<{
    id: string;
    status: string;
    archivedAt: Date | null;
    kind: string;
  }>(
    `SELECT [id], [status], [archivedAt], [kind]
     FROM [dbo].[Thread]
     WHERE [engagementId] = '${engagementId}'`,
  );
  return result.recordset[0] ?? null;
}

/**
 * Counts Message rows for a given threadId via admin pool (bypasses RLS).
 * Used to prove no messages were deleted.
 */
async function countMessagesDirect(threadId: string): Promise<number> {
  const result = await adminPool.request().query<{ cnt: number }>(
    `SELECT COUNT(*) AS cnt FROM [dbo].[Message] WHERE [threadId] = '${threadId}'`,
  );
  return result.recordset[0]?.cnt ?? 0;
}

// ─── Mock real-time transport setup (required for confirmDelivery / transitionEngagementStatus) ───
//
// confirmDelivery + transitionEngagementStatus call emitAndPublishNotification, which calls
// getNotificationTransport().publish(). Without activating the mock transport the
// SupabaseRealtimeTransport throws RealtimeBindingNotAvailableError.
// ADR-023 §2: mock-first sequencing — ALLOW_MOCK_REALTIME=true enables the mock selector.
// Mirror the pattern from source-event-wiring.integration.test.ts (TASK-016-004).
// // ADR-023 // CS-GEN-002

beforeEach(() => {
  process.env["REALTIME_PROVIDER"] = "mock";
  process.env["ALLOW_MOCK_REALTIME"] = "true";
  resetNotificationTransportForTesting();
});

afterEach(() => {
  delete process.env["REALTIME_PROVIDER"];
  delete process.env["ALLOW_MOCK_REALTIME"];
  resetNotificationTransportForTesting();
});

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeAll(async () => {
  if (!ADMIN_URL) throw new Error("DATABASE_URL_ADMIN is required for integration tests");

  const adminConfig = parseSqlServerUrl(ADMIN_URL) as import("mssql").config;
  adminPool = new ConnectionPool(adminConfig);
  await adminPool.connect();

  // Seed CLIENT-A User
  const userResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[User] ([clerkId], [email], [role], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'${CLIENT_A_CLERK_ID}', N'thr-arch-017-007-client-a@example.com', N'CLIENT', SYSDATETIMEOFFSET())`,
  );
  clientAUserId = userResult.recordset[0]?.id ?? "";
  createdUserIds.push(clientAUserId);
}, 30000);

afterAll(async () => {
  // Cleanup in reverse FK order: Messages → Threads → Engagements → EngagementRequests → Users

  for (const msgId of createdMessageIds) {
    await adminPool
      .request()
      .query(`DELETE FROM [dbo].[Message] WHERE [id] = '${msgId}'`)
      .catch(() => { /* ignore */ });
  }

  for (const threadId of createdThreadIds) {
    await adminPool
      .request()
      .query(`DELETE FROM [dbo].[Message] WHERE [threadId] = '${threadId}'`)
      .catch(() => { /* ignore */ });
    await adminPool
      .request()
      .query(`DELETE FROM [dbo].[Thread] WHERE [id] = '${threadId}'`)
      .catch(() => { /* ignore */ });
  }

  for (const eid of createdEngagementIds) {
    await adminPool
      .request()
      .query(`DELETE FROM [dbo].[Engagement] WHERE [id] = '${eid}'`)
      .catch(() => { /* ignore */ });
  }

  for (const erid of createdEngagementRequestIds) {
    await adminPool
      .request()
      .query(`DELETE FROM [dbo].[EngagementRequest] WHERE [id] = '${erid}'`)
      .catch(() => { /* ignore */ });
  }

  for (const uid of createdUserIds) {
    await adminPool
      .request()
      .query(`DELETE FROM [dbo].[User] WHERE [id] = '${uid}'`)
      .catch(() => { /* ignore */ });
  }

  await adminPool.close().catch(() => { /* ignore */ });
}, 30000);

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("archive-on-close — TASK-017-007 / EPIC-017 / BRIEF-017", () => {

  // ─── AC-MSG-006-02: engagement → Complete → thread archived (not deleted) ───

  /**
   * AC-MSG-006-02 — engagement → Complete → Thread.status='archived', archivedAt non-null.
   *
   * Given an engagement in 'Review' status with both confirmations set,
   * And its engagement thread exists with one message,
   * When transitionEngagementStatus is called with toStatus='Complete',
   * Then:
   *   - transitionResult.transitioned = true (the status transition succeeded)
   *   - Thread.status = 'archived'
   *   - Thread.archivedAt is non-null (stamped at the DB level)
   *   - Thread row still exists (not deleted — AC-MSG-006-01)
   *
   * ADR-018 tier-3: archive = state flip only; no rows deleted.
   * // AC-MSG-006-02 // AC-MSG-006-01 // ADR-018 // CS-GEN-002 // EPIC-010 // EPIC-017
   */
  it("[AC-MSG-006-02] engagement → Complete → Thread.status='archived', archivedAt set, thread still present", async () => {
    const { engagementId } = await seedReviewEngagement();

    // Create the engagement thread (get-or-create — idempotent, AC-MSG-001-01)
    const thread = await getOrCreateEngagementThread({ engagementId });
    createdThreadIds.push(thread.id);

    expect(thread.status, "Thread must start as 'active'").toBe("active");
    expect(thread.archivedAt, "archivedAt must be null before archiving").toBeNull();

    // Append a message to the thread (proves messages are preserved after archiving)
    const msg = await appendMessage({
      threadId: thread.id,
      senderClerkId: ACCOUNTANT_CLERK_ID,
      body: "Initial message before close",
    });
    createdMessageIds.push(msg.id);

    // Transition the engagement to Complete (Review → Complete)
    // archiveEngagementThread is called additively inside this function (TASK-017-007 wiring).
    // CS-GEN-002: existing setEngagementCompleted + emitAndPublishNotification calls are preserved.
    const transitionResult = await transitionEngagementStatus({
      engagementId,
      fromStatus: "Review",
      toStatus: "Complete",
      actor: ACCOUNTANT_ACTOR,
      sourceSurface: "admin",
    });

    expect(transitionResult.transitioned, "Engagement must transition to Complete").toBe(true);

    // Verify thread is archived (admin pool — bypasses RLS for direct state assertion)
    const threadRow = await getThreadByEngagementDirect(engagementId);

    expect(threadRow, "[AC-MSG-006-02] Thread row must still exist after Complete (not deleted)").not.toBeNull();
    expect(threadRow!.status, "[AC-MSG-006-02] Thread.status must be 'archived' after Complete").toBe("archived");
    expect(threadRow!.archivedAt, "[AC-MSG-006-02] Thread.archivedAt must be non-null after Complete").not.toBeNull();
    expect(threadRow!.kind, "[AC-MSG-006-02] Thread kind must remain 'engagement'").toBe("engagement");
  });

  // ─── AC-MSG-006-01: thread + all messages still present (nothing deleted) ───

  /**
   * AC-MSG-006-01 — Archive is a state flip, NOT a delete.
   *
   * Given an engagement has been transitioned to Complete,
   * And the engagement thread has multiple message rows,
   * Then:
   *   - Thread row count is 1 (thread still exists — not deleted)
   *   - Message row count equals the pre-archive count (no messages deleted)
   *
   * ADR-018 tier-3 / REQ-MSG-006: indefinite retention; no purge; no 90-day floor.
   * // AC-MSG-006-01 // ADR-018 // REQ-MSG-006 // CS-GEN-003
   */
  it("[AC-MSG-006-01] thread + all messages still present after Complete (archive is NOT a delete)", async () => {
    const { engagementId } = await seedReviewEngagement();

    // Create the engagement thread
    const thread = await getOrCreateEngagementThread({ engagementId });
    createdThreadIds.push(thread.id);

    // Append 3 messages (proves full message history is retained)
    const messageCount = 3;
    for (let i = 0; i < messageCount; i++) {
      const m = await appendMessage({
        threadId: thread.id,
        senderClerkId: i % 2 === 0 ? CLIENT_A_CLERK_ID : ACCOUNTANT_CLERK_ID,
        body: `Test message ${i + 1} of ${messageCount}`,
      });
      createdMessageIds.push(m.id);
    }

    // Verify pre-archive message count via admin pool
    const preArchiveCount = await countMessagesDirect(thread.id);
    expect(preArchiveCount, "Must have 3 messages before archiving").toBe(messageCount);

    // Verify pre-archive thread row count
    const preArchiveThreadCount = await adminPool.request().query<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM [dbo].[Thread] WHERE [engagementId] = '${engagementId}'`,
    );
    expect(preArchiveThreadCount.recordset[0]?.cnt, "Must have exactly 1 thread before archiving").toBe(1);

    // Transition to Complete — triggers archiveEngagementThread additively
    const result = await transitionEngagementStatus({
      engagementId,
      fromStatus: "Review",
      toStatus: "Complete",
      actor: ACCOUNTANT_ACTOR,
      sourceSurface: "admin",
    });
    expect(result.transitioned, "Engagement must transition to Complete").toBe(true);

    // Verify post-archive message count — must equal pre-archive (no messages deleted)
    const postArchiveCount = await countMessagesDirect(thread.id);
    expect(
      postArchiveCount,
      `[AC-MSG-006-01] Message count must be ${messageCount} after archiving (no messages deleted)`,
    ).toBe(messageCount);

    // Verify thread row still present (not deleted)
    const postArchiveThreadCount = await adminPool.request().query<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM [dbo].[Thread] WHERE [engagementId] = '${engagementId}'`,
    );
    expect(
      postArchiveThreadCount.recordset[0]?.cnt,
      "[AC-MSG-006-01] Thread row must still exist after Complete (not deleted)",
    ).toBe(1);

    // Confirm no purge / 90-day-floor column is present on Thread or Message
    // (ADR-018 tier-3: threads have no retainUntil / purge-at — indefinite retention)
    const threadCols = await adminPool.request().query<{ COLUMN_NAME: string }>(
      `SELECT COLUMN_NAME
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_NAME = 'Thread'
         AND COLUMN_NAME IN ('retainUntil', 'purgeAt', 'purgeEligibleAt', 'retentionDeadline')`,
    );
    expect(
      threadCols.recordset.length,
      "[AC-MSG-006-01] Thread must have NO retention/purge columns (indefinite retention — ADR-018 tier-3)",
    ).toBe(0);

    const messageCols = await adminPool.request().query<{ COLUMN_NAME: string }>(
      `SELECT COLUMN_NAME
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_NAME = 'Message'
         AND COLUMN_NAME IN ('retainUntil', 'purgeAt', 'purgeEligibleAt', 'retentionDeadline')`,
    );
    expect(
      messageCols.recordset.length,
      "[AC-MSG-006-01] Message must have NO retention/purge columns (indefinite retention — ADR-018 tier-3)",
    ).toBe(0);
  });

  // ─── AC-MSG-006-03: archived thread stays fully readable by participants ─────

  /**
   * AC-MSG-006-03 — Archived thread stays fully readable by participants.
   *
   * Given an engagement has been transitioned to Complete and its thread is archived,
   * When getThreadForEngagement is called under the client's SESSION_CONTEXT,
   * Then the archived thread is returned (status='archived' is visible).
   * When listThreadMessages is called under the client's SESSION_CONTEXT,
   * Then the full message history is returned (all messages visible after archiving).
   *
   * DECISION-017-002-A: the RLS read predicates (sec.pol_Thread / sec.pol_Message) do NOT
   * filter on Thread.status — archived threads remain visible. Do NOT add a status filter.
   *
   * // AC-MSG-006-03 // DECISION-017-002-A // ADR-003 // ADR-005 // CS-TS-001
   */
  it("[AC-MSG-006-03] archived thread + full message history still readable by participant after Complete", async () => {
    const { engagementId } = await seedReviewEngagement();

    // Create the engagement thread
    const thread = await getOrCreateEngagementThread({ engagementId });
    createdThreadIds.push(thread.id);

    // Append 2 messages (proves history is readable after archive)
    const bodies = [
      "First message — readable after archive",
      "Second message — readable after archive",
    ];
    const appendedIds: string[] = [];
    for (const body of bodies) {
      const m = await appendMessage({
        threadId: thread.id,
        senderClerkId: CLIENT_A_CLERK_ID,
        body,
      });
      createdMessageIds.push(m.id);
      appendedIds.push(m.id);
    }

    // Transition to Complete — archives the thread
    const result = await transitionEngagementStatus({
      engagementId,
      fromStatus: "Review",
      toStatus: "Complete",
      actor: ACCOUNTANT_ACTOR,
      sourceSurface: "admin",
    });
    expect(result.transitioned, "Engagement must transition to Complete").toBe(true);

    // Verify archived via admin pool before the RLS read
    const threadRow = await getThreadByEngagementDirect(engagementId);
    expect(threadRow?.status, "Thread must be 'archived' before testing readability").toBe("archived");

    // CLIENT-A reads the thread via request pool (SESSION_CONTEXT set by withClerkIdentity)
    // CS-TS-001: getThreadForEngagement uses the db wrapper (SESSION_CONTEXT propagated). // CS-TS-001
    // DECISION-017-002-A: no WHERE status='active' in the read path — RLS is the sole boundary. // DECISION-017-002-A
    const readThread = await withClerkIdentity(CLIENT_A_CLERK_ID, "CLIENT", () =>
      getThreadForEngagement(engagementId),
    );

    expect(
      readThread,
      "[AC-MSG-006-03] Archived thread must be visible to CLIENT-A under their SESSION_CONTEXT",
    ).not.toBeNull();
    expect(
      eqId(readThread!.id, thread.id),
      "[AC-MSG-006-03] Returned thread id must match the archived thread",
    ).toBe(true);
    expect(
      readThread!.status,
      "[AC-MSG-006-03] Returned thread must have status='archived' (status visible to participant)",
    ).toBe("archived");
    expect(
      readThread!.archivedAt,
      "[AC-MSG-006-03] Returned thread must have archivedAt non-null",
    ).not.toBeNull();

    // CLIENT-A reads message history via request pool
    // CS-TS-001: listThreadMessages uses the db wrapper (SESSION_CONTEXT propagated). // CS-TS-001
    const messages = await withClerkIdentity(CLIENT_A_CLERK_ID, "CLIENT", () =>
      listThreadMessages(thread.id),
    );

    const returnedIds = messages.map((m) => m.id.toLowerCase());
    for (const appendedId of appendedIds) {
      expect(
        returnedIds.includes(appendedId.toLowerCase()),
        `[AC-MSG-006-03] Message ${appendedId} must be visible in the archived thread's history`,
      ).toBe(true);
    }
    expect(
      messages.length,
      "[AC-MSG-006-03] Full message history must be returned (no messages hidden by archive status)",
    ).toBeGreaterThanOrEqual(bodies.length);
  });

  // ─── Idempotent: re-archiving an already-archived thread is a no-op ──────────

  /**
   * Idempotent guard — archiving an already-archived thread is a no-op.
   *
   * Given a thread is already 'archived',
   * When archiveEngagementThread is called again for the same engagementId,
   * Then the call succeeds without error,
   * And Thread.status remains 'archived' (unchanged),
   * And Thread.archivedAt remains the original value (not re-stamped).
   *
   * The WHERE status='active' guard in archiveEngagementThread ensures @@ROWCOUNT=0
   * on the second call — idempotent by design.
   *
   * // CS-GEN-002 // DECISION-017-007-A // CS-GEN-003
   */
  it("idempotent — re-archiving an already-archived thread is a no-op (status and archivedAt unchanged)", async () => {
    const { engagementId } = await seedReviewEngagement();

    // Create the engagement thread
    const thread = await getOrCreateEngagementThread({ engagementId });
    createdThreadIds.push(thread.id);

    // First archive (via transitionEngagementStatus → Complete)
    await transitionEngagementStatus({
      engagementId,
      fromStatus: "Review",
      toStatus: "Complete",
      actor: ACCOUNTANT_ACTOR,
      sourceSurface: "admin",
    });

    // Read archivedAt after first archive
    const afterFirst = await getThreadByEngagementDirect(engagementId);
    expect(afterFirst?.status, "Thread must be 'archived' after first Complete").toBe("archived");
    expect(afterFirst?.archivedAt, "archivedAt must be non-null after first archive").not.toBeNull();
    const firstArchivedAt = afterFirst!.archivedAt!;

    // Wait 1ms to ensure any re-stamp would produce a different timestamp
    await new Promise((resolve) => setTimeout(resolve, 1));

    // Call archiveEngagementThread directly a second time (idempotent check)
    // This is the no-op path — thread is already 'archived', so WHERE status='active' fires @@ROWCOUNT=0.
    await archiveEngagementThread(engagementId);

    // Read archivedAt after second call — must be unchanged
    const afterSecond = await getThreadByEngagementDirect(engagementId);
    expect(afterSecond?.status, "Thread status must remain 'archived' after re-archive call").toBe("archived");
    expect(
      afterSecond?.archivedAt?.getTime(),
      "archivedAt must NOT be re-stamped on second call (idempotent no-op)",
    ).toBe(firstArchivedAt.getTime());
  });

  // ─── General threads are unaffected by engagement close ──────────────────────

  /**
   * General threads are unaffected by the engagement-close path.
   *
   * Given a general thread exists for CLIENT-A (engagementId IS NULL),
   * And an engagement thread for CLIENT-A's engagement is created,
   * When transitionEngagementStatus drives the engagement to Complete,
   * Then:
   *   - The engagement thread is archived (status='archived')
   *   - The general thread is NOT archived (status='active') — WHERE keys on engagementId
   *
   * This proves the WHERE [engagementId] = @engagementId clause in archiveEngagementThread
   * does not touch general threads (which have engagementId IS NULL).
   *
   * // CS-GEN-003 // ADR-018 // DECISION-017-002-A
   */
  it("general thread is unaffected by engagement close — WHERE keys on engagementId, engagementId=NULL is not matched", async () => {
    const { engagementId } = await seedReviewEngagement();

    // Create the engagement thread
    const engThread = await getOrCreateEngagementThread({ engagementId });
    createdThreadIds.push(engThread.id);

    // Create a general thread for CLIENT-A (engagementId=NULL, kind='general')
    const generalThread = await createGeneralThread({ clientUserId: clientAUserId });
    createdThreadIds.push(generalThread.id);

    expect(generalThread.engagementId, "General thread must have no engagementId").toBeNull();
    expect(generalThread.kind, "General thread must be kind='general'").toBe("general");
    expect(generalThread.status, "General thread must start as 'active'").toBe("active");

    // Transition the engagement to Complete — archives the engagement thread
    const result = await transitionEngagementStatus({
      engagementId,
      fromStatus: "Review",
      toStatus: "Complete",
      actor: ACCOUNTANT_ACTOR,
      sourceSurface: "admin",
    });
    expect(result.transitioned, "Engagement must transition to Complete").toBe(true);

    // Verify engagement thread is archived
    const engThreadRow = await getThreadByEngagementDirect(engagementId);
    expect(
      engThreadRow?.status,
      "Engagement thread must be 'archived' after Complete",
    ).toBe("archived");

    // Verify general thread is NOT archived (still 'active')
    const generalThreadRow = await adminPool.request().query<{
      id: string;
      status: string;
      archivedAt: Date | null;
    }>(
      `SELECT [id], [status], [archivedAt] FROM [dbo].[Thread] WHERE [id] = '${generalThread.id}'`,
    );
    const genRow = generalThreadRow.recordset[0];
    expect(genRow, "General thread row must exist").toBeDefined();
    expect(
      genRow?.status,
      "General thread must remain 'active' (not affected by engagement close — WHERE keys on engagementId)",
    ).toBe("active");
    expect(
      genRow?.archivedAt,
      "General thread archivedAt must remain null",
    ).toBeNull();
  });

});
