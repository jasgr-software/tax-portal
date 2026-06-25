/**
 * packages/db/src/thread-unread.integration.test.ts
 *
 * TIER-3 INTEGRATION TEST — requires real SQL Server (ADR-012 § Tier 3)
 *
 * Tests listThreadsWithUnread — the per-viewer unread read-model (TASK-017-005 / BRIEF-017 / EPIC-017).
 *
 * Acceptance criteria covered:
 *
 *   AC-MSG-005-01 — A new message makes the thread unread for both participants.
 *     Test: appendMessage → listThreadsWithUnread under both participants → hasUnread=true for both.
 *
 *   AC-MSG-005-02 — The unread computation covers engagement AND general threads uniformly.
 *     Test: one engagement thread + one general thread; both show hasUnread=true under both conditions.
 *
 *   AC-MSG-005-03 — Per-viewer divergence: thread can be unread for A and read for B simultaneously.
 *     Test: A marks read (markThreadRead) → hasUnread=false for A; B has not read → hasUnread=true for B.
 *
 *   AC-MSG-005-04 — After a viewer marks read, the indicator clears for THAT viewer only.
 *     Test: A reads → hasUnread[A]=false, hasUnread[B]=true (unchanged).
 *           Then B reads → hasUnread[B]=false.
 *
 * Additional initial-state test:
 *   no-read-state-row-yet — A viewer with no ThreadReadState row on a thread with other-authored
 *     messages → hasUnread=true.
 *     (This is implied by AC-MSG-005-01 but is explicitly proven as a standalone case.)
 *
 * DECISION-017-005-A binding assertion:
 *   The viewer's own sent messages DO NOT count as unread for themselves.
 *   Test: A sends a message; listThreadsWithUnread under A → hasUnread=false (own message excluded).
 *
 * Architecture notes:
 *   - listThreadsWithUnread uses the REQUEST POOL (db / SESSION_CONTEXT) — RLS sec.pol_Thread
 *     is the sole visibility gate (DECISION-017-002-A: no extra WHERE added).
 *   - markThreadRead uses the REQUEST POOL (SESSION_CONTEXT) — BLOCK predicate enforces own-row write.
 *   - Write seeding (Thread, Message, ThreadReadState, Engagement, User) uses the admin pool directly.
 *   - DECISION-017-005-A: senderClerkId (the actual Message column) is used for the "exclude own
 *     messages" predicate — not senderUserId (which does not exist in the schema).
 *     SESSION_CONTEXT('clerk_user_id') is a Clerk ID; senderClerkId is also a Clerk ID.
 *
 * ADR-003: SESSION_CONTEXT propagation via withClerkIdentity for request-pool reads. // ADR-003
 * ADR-005: sec.pol_Thread / sec.pol_ThreadReadState are the enforcement boundaries. // ADR-005
 * ADR-006: consumed by both portal + admin surfaces (shared package). // ADR-006
 *
 * CS-TS-001: all request-pool reads go through the db wrapper via withClerkIdentity. // CS-TS-001
 * CS-TS-002: no raw pool imported outside packages/db. // CS-TS-002
 * CS-GEN-001: message bodies not logged — tests do not log body values. // CS-GEN-001
 * CS-GEN-002: additive — new test file; no existing test modified. // CS-GEN-002
 * CS-GEN-003: governing keys cited throughout. // CS-GEN-003
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import mssqlPkg from "mssql";
import { parseSqlServerUrl } from "./sql-server-url.js";
import { withClerkIdentity } from "./context.js";
import { listThreadsWithUnread } from "./repositories/thread-read.js";
import { markThreadRead } from "./repositories/thread-read.js";
import { getOrCreateEngagementThread, createGeneralThread } from "./repositories/thread.js";
import { appendMessage } from "./repositories/message.js";

const { ConnectionPool } = mssqlPkg;

// ─── Connection setup ─────────────────────────────────────────────────────────

let adminPool: InstanceType<typeof ConnectionPool>;

const ADMIN_URL = process.env["DATABASE_URL_ADMIN"];

// ─── Test data — unique clerk IDs to avoid collision with other test suites ────

const CLIENT_A_CLERK_ID = "thread_unread_017_005_client_a";
const CLIENT_B_CLERK_ID = "thread_unread_017_005_client_b";
const ACCOUNTANT_CLERK_ID = "thread_unread_017_005_acct";

let clientAUserId: string;
let clientBUserId: string;
let accountantUserId: string;

// Thread + entity IDs for teardown
let engagementThreadId: string;
let generalThreadId: string;
let engagementIdForA: string;
let engagementRequestIdForA: string;
let ownMessageThreadId: string; // separate thread for the "own message" test case

// IDs to clean up at end
const createdThreadIds: string[] = [];
const createdMessageIds: string[] = [];
const createdEngagementIds: string[] = [];
const createdEngagementRequestIds: string[] = [];
const createdUserIds: string[] = [];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function eqId(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

function includesId(ids: string[], targetId: string): boolean {
  const lower = targetId.toLowerCase();
  return ids.some((id) => id.toLowerCase() === lower);
}

/**
 * Finds the thread with the given id in the listThreadsWithUnread result.
 * Returns undefined if not found (RLS may hide threads not visible to this viewer).
 */
async function getThreadUnread(
  viewerClerkId: string,
  viewerRole: "CLIENT" | "ACCOUNTANT",
  threadId: string,
): Promise<{ hasUnread: boolean } | undefined> {
  const threads = await withClerkIdentity(viewerClerkId, viewerRole, () =>
    listThreadsWithUnread(),
  );
  const found = threads.find((t) => eqId(t.id, threadId));
  return found ? { hasUnread: found.hasUnread } : undefined;
}

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeAll(async () => {
  if (!ADMIN_URL) throw new Error("DATABASE_URL_ADMIN is required for integration tests");

  const adminConfig = parseSqlServerUrl(ADMIN_URL) as import("mssql").config;
  adminPool = new ConnectionPool(adminConfig);
  await adminPool.connect();

  // Seed: CLIENT-A user row
  const userAResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[User] ([clerkId], [email], [role], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'${CLIENT_A_CLERK_ID}', N'thread-unread-017-005-client-a@example.com', N'CLIENT', SYSDATETIMEOFFSET())`,
  );
  clientAUserId = userAResult.recordset[0]?.id ?? "";
  createdUserIds.push(clientAUserId);

  // Seed: CLIENT-B user row
  const userBResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[User] ([clerkId], [email], [role], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'${CLIENT_B_CLERK_ID}', N'thread-unread-017-005-client-b@example.com', N'CLIENT', SYSDATETIMEOFFSET())`,
  );
  clientBUserId = userBResult.recordset[0]?.id ?? "";
  createdUserIds.push(clientBUserId);

  // Seed: ACCOUNTANT user row
  // markThreadRead resolves the caller's userId via: SELECT id FROM [dbo].[User] WHERE clerkId = SESSION_CONTEXT(...)
  // Without a User row for the ACCOUNTANT, the MERGE finds no source row and writes nothing.
  const acctResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[User] ([clerkId], [email], [role], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'${ACCOUNTANT_CLERK_ID}', N'thread-unread-017-005-acct@example.com', N'ACCOUNTANT', SYSDATETIMEOFFSET())`,
  );
  accountantUserId = acctResult.recordset[0]?.id ?? "";
  createdUserIds.push(accountantUserId);

  // Seed: a minimal EngagementRequest + Engagement for CLIENT-A (for engagement thread)
  const erResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[EngagementRequest] ([firstName], [lastName], [email], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'UnreadTest', N'Client', N'thread-unread-017-005-er@example.com', SYSDATETIMEOFFSET())`,
  );
  engagementRequestIdForA = erResult.recordset[0]?.id ?? "";
  createdEngagementRequestIds.push(engagementRequestIdForA);

  const engResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[Engagement] ([engagementRequestId], [clientUserId], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES ('${engagementRequestIdForA}', '${clientAUserId}', SYSDATETIMEOFFSET())`,
  );
  engagementIdForA = engResult.recordset[0]?.id ?? "";
  createdEngagementIds.push(engagementIdForA);

  // Create the engagement thread for CLIENT-A (kind='engagement')
  const engThread = await getOrCreateEngagementThread({ engagementId: engagementIdForA });
  engagementThreadId = engThread.id;
  createdThreadIds.push(engagementThreadId);

  // Create a general thread for CLIENT-A (kind='general')
  const genThread = await createGeneralThread({ clientUserId: clientAUserId });
  generalThreadId = genThread.id;
  createdThreadIds.push(generalThreadId);

  // Create a separate thread for "own message" test (engagement thread for CLIENT-B)
  const erBResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[EngagementRequest] ([firstName], [lastName], [email], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'OwnMsgTest', N'Client', N'thread-unread-017-005-own@example.com', SYSDATETIMEOFFSET())`,
  );
  const erBId = erBResult.recordset[0]?.id ?? "";
  createdEngagementRequestIds.push(erBId);

  const engBResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[Engagement] ([engagementRequestId], [clientUserId], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES ('${erBId}', '${clientBUserId}', SYSDATETIMEOFFSET())`,
  );
  const engBId = engBResult.recordset[0]?.id ?? "";
  createdEngagementIds.push(engBId);

  const ownMsgThread = await getOrCreateEngagementThread({ engagementId: engBId });
  ownMessageThreadId = ownMsgThread.id;
  createdThreadIds.push(ownMessageThreadId);
}, 45000);

afterAll(async () => {
  // Cleanup in reverse FK order:
  // ThreadReadState → Message → Thread → Engagement → EngagementRequest → User

  // Delete ThreadReadState rows for test threads
  for (const threadId of createdThreadIds) {
    await adminPool
      .request()
      .query(`DELETE FROM [dbo].[ThreadReadState] WHERE [threadId] = '${threadId}'`)
      .catch(() => { /* ignore */ });
  }

  // Delete messages
  for (const msgId of createdMessageIds) {
    await adminPool
      .request()
      .query(`DELETE FROM [dbo].[Message] WHERE [id] = '${msgId}'`)
      .catch(() => { /* ignore */ });
  }

  // Delete threads (and any remaining messages/read state via the thread sweep)
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

  // Delete engagements
  for (const eid of createdEngagementIds) {
    await adminPool
      .request()
      .query(`DELETE FROM [dbo].[Engagement] WHERE [id] = '${eid}'`)
      .catch(() => { /* ignore */ });
  }

  // Delete engagement requests
  for (const erid of createdEngagementRequestIds) {
    await adminPool
      .request()
      .query(`DELETE FROM [dbo].[EngagementRequest] WHERE [id] = '${erid}'`)
      .catch(() => { /* ignore */ });
  }

  // Delete users
  for (const uid of createdUserIds) {
    await adminPool
      .request()
      .query(`DELETE FROM [dbo].[User] WHERE [id] = '${uid}'`)
      .catch(() => { /* ignore */ });
  }

  await adminPool.close().catch(() => { /* ignore */ });
}, 30000);

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("listThreadsWithUnread — per-viewer unread read-model (TASK-017-005 / EPIC-017)", () => {

  // ─── Initial state: no read-state row yet → hasUnread=true ───────────────

  /**
   * Initial state (implies AC-MSG-005-01 initial case):
   * A viewer with no ThreadReadState row on a thread that has messages from others → hasUnread=true.
   *
   * This directly proves the COALESCE fallback ('0001-01-01') makes all existing messages
   * appear "unread" when the viewer has never read the thread.
   *
   * // AC-MSG-005-01 // DECISION-017-005-A // DECISION-017-A // CS-TS-001 // ADR-003
   */
  it("no-read-state-row-yet — viewer with no ThreadReadState row on a thread with others' messages → hasUnread=true", async () => {
    // Append a message from the ACCOUNTANT to the engagement thread
    // CS-GEN-001: body is not logged. // CS-GEN-001
    const msg = await appendMessage({
      threadId: engagementThreadId,
      senderClerkId: ACCOUNTANT_CLERK_ID,
      body: "Test message for no-read-state-row-yet scenario",
    });
    createdMessageIds.push(msg.id);

    // CLIENT-A has no ThreadReadState row yet on this thread.
    // Under DECISION-017-A: COALESCE(null, '0001-01-01') → all messages are after '0001-01-01'.
    // The message was sent by ACCOUNTANT (not CLIENT-A) → not excluded by senderClerkId check.
    // → hasUnread MUST be true.
    //
    // CS-TS-001: listThreadsWithUnread uses db wrapper (SESSION_CONTEXT). // CS-TS-001
    const result = await getThreadUnread(CLIENT_A_CLERK_ID, "CLIENT", engagementThreadId);

    expect(
      result,
      "[no-read-state-row-yet] Thread must be visible to CLIENT-A under their SESSION_CONTEXT",
    ).toBeDefined();
    expect(
      result?.hasUnread,
      "[no-read-state-row-yet] hasUnread must be true when viewer has no ThreadReadState row and thread has others' messages",
    ).toBe(true);
  });

  // ─── DECISION-017-005-A: viewer's own sent messages do not count as unread ─

  /**
   * DECISION-017-005-A bounded assertion: a viewer's own sent messages MUST NOT trigger hasUnread.
   *
   * Given CLIENT-B sends a message in their engagement thread (ownMessageThreadId),
   * And CLIENT-B has no ThreadReadState row (no read watermark),
   * When listThreadsWithUnread is called under CLIENT-B's SESSION_CONTEXT,
   * Then hasUnread MUST be false — own messages are excluded from the "unread" check.
   *
   * This verifies the "m.senderClerkId <> SESSION_CONTEXT(N'clerk_user_id')" predicate.
   *
   * // DECISION-017-005-A // DECISION-017-A // AC-MSG-005-01 // CS-TS-001
   */
  it("DECISION-017-005-A — viewer's own sent messages do not count as unread for themselves", async () => {
    // CLIENT-B sends a message in the ownMessageThreadId (their engagement thread)
    // CS-GEN-001: body is not logged. // CS-GEN-001
    const msg = await appendMessage({
      threadId: ownMessageThreadId,
      senderClerkId: CLIENT_B_CLERK_ID,
      body: "CLIENT-B own message — should not trigger hasUnread for CLIENT-B",
    });
    createdMessageIds.push(msg.id);

    // CLIENT-B reads listThreadsWithUnread — their own message must not produce hasUnread=true.
    // CS-TS-001: listThreadsWithUnread uses db wrapper (SESSION_CONTEXT). // CS-TS-001
    const result = await getThreadUnread(CLIENT_B_CLERK_ID, "CLIENT", ownMessageThreadId);

    expect(
      result,
      "[DECISION-017-005-A] ownMessageThread must be visible to CLIENT-B",
    ).toBeDefined();
    expect(
      result?.hasUnread,
      "[DECISION-017-005-A] hasUnread must be false for the sender of the only message (own-message exclusion)",
    ).toBe(false);
  });

  // ─── AC-MSG-005-01: new message → unread for both participants ────────────

  /**
   * AC-MSG-005-01 — A new message makes the thread unread for both participants.
   *
   * Given an engagement thread exists for CLIENT-A,
   * And neither participant has a ThreadReadState row,
   * When ACCOUNTANT appends a message (already done in previous test — engagementThreadId),
   * And then CLIENT-A appends a reply,
   * Then: listThreadsWithUnread under ACCOUNTANT → hasUnread=true for engagementThreadId.
   *       listThreadsWithUnread under CLIENT-A   → hasUnread=true for engagementThreadId
   *         (ACCOUNTANT's message is still newer than CLIENT-A's read watermark, which is null).
   *
   * // AC-MSG-005-01 // DECISION-017-A // DECISION-017-002-A // CS-TS-001 // ADR-003 // ADR-005
   */
  it("AC-MSG-005-01 — new message makes the thread unread for both participants", async () => {
    // CLIENT-A sends a message — now ACCOUNTANT should see hasUnread=true.
    // (ACCOUNTANT already sent a message in the first test → CLIENT-A hasUnread=true.)
    // CS-GEN-001: body is not logged. // CS-GEN-001
    const replyMsg = await appendMessage({
      threadId: engagementThreadId,
      senderClerkId: CLIENT_A_CLERK_ID,
      body: "Reply from CLIENT-A for AC-MSG-005-01",
    });
    createdMessageIds.push(replyMsg.id);

    // CLIENT-A: sees ACCOUNTANT's message (sent by ACCOUNTANT, not CLIENT-A) → hasUnread=true.
    // CS-TS-001: listThreadsWithUnread via db wrapper. // CS-TS-001
    const clientAView = await getThreadUnread(CLIENT_A_CLERK_ID, "CLIENT", engagementThreadId);
    expect(
      clientAView,
      "[AC-MSG-005-01] Engagement thread must be visible to CLIENT-A",
    ).toBeDefined();
    expect(
      clientAView?.hasUnread,
      "[AC-MSG-005-01] hasUnread must be true for CLIENT-A — ACCOUNTANT sent a message CLIENT-A has not read",
    ).toBe(true);

    // ACCOUNTANT: sees CLIENT-A's reply (sent by CLIENT-A, not ACCOUNTANT) → hasUnread=true.
    // CS-TS-001: listThreadsWithUnread via db wrapper (ACCOUNTANT context). // CS-TS-001
    const accountantView = await getThreadUnread(ACCOUNTANT_CLERK_ID, "ACCOUNTANT", engagementThreadId);
    expect(
      accountantView,
      "[AC-MSG-005-01] Engagement thread must be visible to ACCOUNTANT",
    ).toBeDefined();
    expect(
      accountantView?.hasUnread,
      "[AC-MSG-005-01] hasUnread must be true for ACCOUNTANT — CLIENT-A sent a reply ACCOUNTANT has not read",
    ).toBe(true);
  });

  // ─── AC-MSG-005-02: both thread kinds covered uniformly ──────────────────

  /**
   * AC-MSG-005-02 — The unread computation covers engagement AND general threads uniformly.
   *
   * Given an engagement thread (kind='engagement') and a general thread (kind='general'),
   * both associated with CLIENT-A,
   * When ACCOUNTANT appends a message in the general thread,
   * Then listThreadsWithUnread under CLIENT-A returns hasUnread=true for BOTH thread kinds.
   *
   * This proves the query has no kind-filter — it covers both kinds uniformly.
   *
   * // AC-MSG-005-02 // DECISION-017-005-A // DECISION-017-A // CS-TS-001 // ADR-003
   */
  it("AC-MSG-005-02 — unread computation covers engagement AND general threads uniformly", async () => {
    // Append a message from ACCOUNTANT in the general thread
    // CS-GEN-001: body is not logged. // CS-GEN-001
    const genMsg = await appendMessage({
      threadId: generalThreadId,
      senderClerkId: ACCOUNTANT_CLERK_ID,
      body: "General thread message for AC-MSG-005-02",
    });
    createdMessageIds.push(genMsg.id);

    // CLIENT-A should see hasUnread=true for BOTH threads under their SESSION_CONTEXT.
    // The engagement thread already has unread messages (previous test).
    // The general thread now has a new message from ACCOUNTANT.
    const engView = await getThreadUnread(CLIENT_A_CLERK_ID, "CLIENT", engagementThreadId);
    const genView = await getThreadUnread(CLIENT_A_CLERK_ID, "CLIENT", generalThreadId);

    expect(
      engView,
      "[AC-MSG-005-02] Engagement thread must be visible to CLIENT-A",
    ).toBeDefined();
    expect(
      engView?.hasUnread,
      "[AC-MSG-005-02] hasUnread must be true for engagement thread (kind='engagement')",
    ).toBe(true);

    expect(
      genView,
      "[AC-MSG-005-02] General thread must be visible to CLIENT-A",
    ).toBeDefined();
    expect(
      genView?.hasUnread,
      "[AC-MSG-005-02] hasUnread must be true for general thread (kind='general')",
    ).toBe(true);

    // Verify the kind fields are returned correctly (AC-MSG-005-02: uniformity across kinds)
    const allThreads = await withClerkIdentity(CLIENT_A_CLERK_ID, "CLIENT", () =>
      listThreadsWithUnread(),
    );
    const engThread = allThreads.find((t) => eqId(t.id, engagementThreadId));
    const genThread = allThreads.find((t) => eqId(t.id, generalThreadId));

    expect(engThread?.kind, "[AC-MSG-005-02] Engagement thread must have kind='engagement'").toBe("engagement");
    expect(genThread?.kind, "[AC-MSG-005-02] General thread must have kind='general'").toBe("general");
  });

  // ─── AC-MSG-005-03: per-viewer divergence (A reads, B has not) ───────────

  /**
   * AC-MSG-005-03 — Per-viewer divergence: thread can be unread for A and read for B simultaneously.
   *
   * Given the engagement thread has unread messages for both ACCOUNTANT (CLIENT-A's reply)
   * and CLIENT-A (ACCOUNTANT's message),
   * When CLIENT-A marks the engagement thread as read (markThreadRead),
   * Then:
   *   - listThreadsWithUnread under CLIENT-A → hasUnread=false for engagementThreadId.
   *   - listThreadsWithUnread under ACCOUNTANT → hasUnread=true for engagementThreadId
   *     (ACCOUNTANT has NOT marked it read — their view is unchanged).
   *
   * This proves per-viewer independence: the unread state is (thread, viewer) scoped.
   *
   * // AC-MSG-005-03 // AC-MSG-005-04 // DECISION-017-A // DECISION-017-005-A
   * // CS-TS-001 // ADR-003 // ADR-005
   */
  it("AC-MSG-005-03 — per-viewer divergence: A marks read → hasUnread[A]=false, hasUnread[B]=true", async () => {
    // Before marking read: verify CLIENT-A has hasUnread=true for the engagement thread.
    const beforeClientA = await getThreadUnread(CLIENT_A_CLERK_ID, "CLIENT", engagementThreadId);
    expect(
      beforeClientA?.hasUnread,
      "[AC-MSG-005-03] CLIENT-A should have hasUnread=true before marking read (precondition)",
    ).toBe(true);

    // Before marking read: verify ACCOUNTANT has hasUnread=true for the engagement thread.
    const beforeAccountant = await getThreadUnread(ACCOUNTANT_CLERK_ID, "ACCOUNTANT", engagementThreadId);
    expect(
      beforeAccountant?.hasUnread,
      "[AC-MSG-005-03] ACCOUNTANT should have hasUnread=true before CLIENT-A marks read (precondition)",
    ).toBe(true);

    // CLIENT-A marks the engagement thread as read.
    // CS-TS-001: markThreadRead uses db wrapper (SESSION_CONTEXT). // CS-TS-001
    // ADR-005: BLOCK predicate on ThreadReadState enforces own-row write. // ADR-005
    await withClerkIdentity(CLIENT_A_CLERK_ID, "CLIENT", () =>
      markThreadRead(engagementThreadId),
    );

    // After CLIENT-A marks read: CLIENT-A's hasUnread must be false.
    // CS-TS-001: listThreadsWithUnread via db wrapper. // CS-TS-001
    const afterClientA = await getThreadUnread(CLIENT_A_CLERK_ID, "CLIENT", engagementThreadId);
    expect(
      afterClientA,
      "[AC-MSG-005-03] Engagement thread must still be visible to CLIENT-A after marking read",
    ).toBeDefined();
    expect(
      afterClientA?.hasUnread,
      "[AC-MSG-005-03] hasUnread must be false for CLIENT-A after they marked the thread read",
    ).toBe(false);

    // ACCOUNTANT has NOT marked read — their view MUST still show hasUnread=true.
    // This is the per-viewer divergence proof (AC-MSG-005-03).
    // CS-TS-001: listThreadsWithUnread via db wrapper (ACCOUNTANT context). // CS-TS-001
    const afterAccountant = await getThreadUnread(ACCOUNTANT_CLERK_ID, "ACCOUNTANT", engagementThreadId);
    expect(
      afterAccountant,
      "[AC-MSG-005-03] Engagement thread must still be visible to ACCOUNTANT",
    ).toBeDefined();
    expect(
      afterAccountant?.hasUnread,
      "[AC-MSG-005-03] hasUnread must still be true for ACCOUNTANT — they have not marked the thread read (per-viewer isolation)",
    ).toBe(true);
  });

  // ─── AC-MSG-005-04: clears for A only, then B marks read → clears for B ──

  /**
   * AC-MSG-005-04 — After marking read, the indicator clears for THAT viewer only.
   *
   * Continues from AC-MSG-005-03 state: CLIENT-A has read, ACCOUNTANT has not.
   *
   * When ACCOUNTANT marks the engagement thread as read,
   * Then:
   *   - listThreadsWithUnread under ACCOUNTANT → hasUnread=false.
   *   - listThreadsWithUnread under CLIENT-A → hasUnread=false (unchanged — A already read).
   *
   * This confirms the isolation: clearing one viewer's indicator does not affect the other,
   * and clears only for the viewer who invoked markThreadRead.
   *
   * // AC-MSG-005-04 // DECISION-017-A // CS-TS-001 // ADR-003 // ADR-005
   */
  it("AC-MSG-005-04 — indicator clears for THAT viewer only; other viewer's state is unaffected", async () => {
    // Precondition: CLIENT-A has read (from AC-MSG-005-03 test above) → hasUnread=false.
    const clientABefore = await getThreadUnread(CLIENT_A_CLERK_ID, "CLIENT", engagementThreadId);
    expect(
      clientABefore?.hasUnread,
      "[AC-MSG-005-04] CLIENT-A must have hasUnread=false (precondition from previous test)",
    ).toBe(false);

    // Precondition: ACCOUNTANT has NOT read → hasUnread=true.
    const accountantBefore = await getThreadUnread(ACCOUNTANT_CLERK_ID, "ACCOUNTANT", engagementThreadId);
    expect(
      accountantBefore?.hasUnread,
      "[AC-MSG-005-04] ACCOUNTANT must have hasUnread=true (precondition from previous test)",
    ).toBe(true);

    // ACCOUNTANT marks the thread as read.
    // CS-TS-001: markThreadRead uses db wrapper (SESSION_CONTEXT). // CS-TS-001
    await withClerkIdentity(ACCOUNTANT_CLERK_ID, "ACCOUNTANT", () =>
      markThreadRead(engagementThreadId),
    );

    // ACCOUNTANT's view: now hasUnread=false.
    const accountantAfter = await getThreadUnread(ACCOUNTANT_CLERK_ID, "ACCOUNTANT", engagementThreadId);
    expect(
      accountantAfter,
      "[AC-MSG-005-04] Engagement thread must still be visible to ACCOUNTANT after marking read",
    ).toBeDefined();
    expect(
      accountantAfter?.hasUnread,
      "[AC-MSG-005-04] hasUnread must be false for ACCOUNTANT after they marked the thread read",
    ).toBe(false);

    // CLIENT-A's view: must remain hasUnread=false (their state was not changed by ACCOUNTANT's read).
    // This proves isolation: clearing for one viewer does not affect the other.
    const clientAAfter = await getThreadUnread(CLIENT_A_CLERK_ID, "CLIENT", engagementThreadId);
    expect(
      clientAAfter?.hasUnread,
      "[AC-MSG-005-04] CLIENT-A's hasUnread must remain false — ACCOUNTANT marking read does not affect CLIENT-A's state",
    ).toBe(false);
  });

});
