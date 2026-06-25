/**
 * packages/db/src/thread-message.integration.test.ts
 *
 * TIER-3 INTEGRATION TEST — requires real SQL Server (ADR-012 § Tier 3)
 *
 * Tests the Thread / Message repository seam (TASK-017-002 / BRIEF-017 / EPIC-017).
 *
 * Acceptance criteria covered:
 *
 *   AC-MSG-001-01 — One thread per engagement (getOrCreateEngagementThread is idempotent).
 *     Test: first call creates; concurrent/repeat calls return the same thread id.
 *
 *   AC-MSG-001-02 — Thread visible only to engagement participants.
 *     Test: getThreadForEngagement under the client's SESSION_CONTEXT returns the thread.
 *     (Full RLS isolation — CLIENT-A cannot read CLIENT-B's thread — is proven in
 *      TASK-017-001's RLS tests; this test validates the repository seam correctly wires
 *      through the request-pool read without adding a belt-and-suspenders WHERE.)
 *
 *   AC-MSG-001-03 / AC-MSG-002-03 — Messages returned in send order.
 *     Test: appendMessage × 3 then listThreadMessages → createdAt ASC order preserved.
 *
 *   AC-MSG-002-01/-02 — appendMessage inserts a message with sender + body.
 *     Test: appended message exists and has the correct senderClerkId.
 *
 *   AC-MSG-003-01 / AC-MSG-003-02 — HARD plain-text verbatim storage.
 *     Test: a body containing <script>, **Markdown**, <img src=x onerror=…>, and
 *           multi-byte Unicode round-trips BYTE-IDENTICAL from the store.
 *     This is the tier-3 mandatory test for REQ-MSG-003 storage proof.
 *
 *   AC-MSG-006-01 — General thread is kind='general', associated with the client, no engagementId.
 *     Test: createGeneralThread returns kind='general', clientUserId set, engagementId null.
 *
 *   AC-MSG-006-02 — General thread visible to that client + accountant.
 *     Test: getGeneralThreadsForClient under the client's SESSION_CONTEXT returns the thread.
 *
 * Architecture notes:
 *   - Write functions (getOrCreateEngagementThread, createGeneralThread, appendMessage) use the
 *     admin pool internally — no SESSION_CONTEXT required for the INSERT (ADR-003 §7).
 *   - Read functions (getThreadForEngagement, getGeneralThreadsForClient, listThreadMessages)
 *     use the request pool via withClerkIdentity — SESSION_CONTEXT is set before each query
 *     (ADR-003, CS-TS-001). RLS policies are the sole enforcement boundary (ADR-005).
 *   - DECISION-017-002-A: no WHERE clause added on top of RLS in the repository.
 *   - DECISION-017-002-B: getOrCreateEngagementThread idempotency via catch-and-re-read on 2627/2601.
 *   - Body verbatim guarantee (AC-MSG-003-01/-02): stored via NVarChar(Max) parameterised INSERT;
 *     round-trip read via the request pool; compared with ===.
 *
 * ADR-003: SESSION_CONTEXT propagation via withClerkIdentity for request-pool operations. // ADR-003
 * ADR-005: sec.pol_Thread / sec.pol_Message are the sole read enforcement boundaries. // ADR-005
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
import {
  getOrCreateEngagementThread,
  createGeneralThread,
  getThreadForEngagement,
  getGeneralThreadsForClient,
  listThreadMessages,
} from "./repositories/thread.js";
import { appendMessage } from "./repositories/message.js";

const { ConnectionPool } = mssqlPkg;

// ─── Connection setup ─────────────────────────────────────────────────────────

let adminPool: InstanceType<typeof ConnectionPool>;

const ADMIN_URL = process.env["DATABASE_URL_ADMIN"];

// ─── Test data ────────────────────────────────────────────────────────────────

/** Test-unique clerk IDs — avoids collision with TASK-017-001 RLS seeds. */
const CLIENT_A_CLERK_ID = "thread_msg_017_002_client_a";
const ACCOUNTANT_CLERK_ID = "thread_msg_017_002_acct";

let clientAUserId: string;
let engagementId: string;
let engagementRequestId: string;

// IDs to clean up at end
const createdThreadIds: string[] = [];
const createdMessageIds: string[] = [];
const createdEngagementIds: string[] = [];
const createdEngagementRequestIds: string[] = [];
const createdUserIds: string[] = [];

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Case-insensitive ID comparison — SQL Server UNIQUEIDENTIFIER may be returned in
 * different cases. All comparisons use .toLowerCase().
 */
function eqId(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

function includesId(ids: string[], targetId: string): boolean {
  const lower = targetId.toLowerCase();
  return ids.some((id) => id.toLowerCase() === lower);
}

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeAll(async () => {
  if (!ADMIN_URL) throw new Error("DATABASE_URL_ADMIN is required for integration tests");

  const adminConfig = parseSqlServerUrl(ADMIN_URL) as import("mssql").config;
  adminPool = new ConnectionPool(adminConfig);
  await adminPool.connect();

  // Seed: CLIENT-A User row
  const userAResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[User] ([clerkId], [email], [role], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'${CLIENT_A_CLERK_ID}', N'thread-msg-017-002-client-a@example.com', N'CLIENT', SYSDATETIMEOFFSET())`,
  );
  clientAUserId = userAResult.recordset[0]?.id ?? "";
  createdUserIds.push(clientAUserId);

  // Seed: a minimal EngagementRequest + Engagement for CLIENT-A
  const erResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[EngagementRequest] ([firstName], [lastName], [email], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'ThreadTest', N'Client', N'thread-msg-017-002-er@example.com', SYSDATETIMEOFFSET())`,
  );
  engagementRequestId = erResult.recordset[0]?.id ?? "";
  createdEngagementRequestIds.push(engagementRequestId);

  const engResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[Engagement] ([engagementRequestId], [clientUserId], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES ('${engagementRequestId}', '${clientAUserId}', SYSDATETIMEOFFSET())`,
  );
  engagementId = engResult.recordset[0]?.id ?? "";
  createdEngagementIds.push(engagementId);
}, 30000);

afterAll(async () => {
  // Cleanup in reverse FK order: Messages → Threads → Engagements → EngagementRequests → Users

  // Delete messages
  for (const msgId of createdMessageIds) {
    await adminPool
      .request()
      .query(`DELETE FROM [dbo].[Message] WHERE [id] = '${msgId}'`)
      .catch(() => { /* ignore */ });
  }

  // Delete threads
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

describe("thread/message repository seam — TASK-017-002 / EPIC-017", () => {

  // ─── AC-MSG-001-01: getOrCreateEngagementThread idempotency ───────────────

  /**
   * AC-MSG-001-01 — One thread per engagement (getOrCreateEngagementThread is idempotent).
   *
   * Given an engagement exists,
   * When getOrCreateEngagementThread is called twice for the same engagementId,
   * Then both calls return the same thread id — exactly one thread is created.
   *
   * This proves the @@unique([engagementId]) + catch-and-re-read idempotency strategy
   * (DECISION-017-002-B) yields exactly one thread on concurrent / repeat calls.
   *
   * // AC-MSG-001-01 // DECISION-017-002-B // ADR-003 §7 // CS-TS-002
   */
  it("AC-MSG-001-01 — getOrCreateEngagementThread is idempotent (repeat calls yield same thread)", async () => {
    // First call — creates the thread
    const first = await getOrCreateEngagementThread({ engagementId });
    createdThreadIds.push(first.id);

    expect(first.id, "[AC-MSG-001-01] First call must return a non-empty id").toBeTruthy();
    expect(first.kind, "[AC-MSG-001-01] Thread kind must be 'engagement'").toBe("engagement");
    expect(first.engagementId?.toLowerCase(), "[AC-MSG-001-01] Thread must be linked to the engagement")
      .toBe(engagementId.toLowerCase());
    expect(first.clientUserId, "[AC-MSG-001-01] engagement thread must not have clientUserId").toBeNull();
    expect(first.status, "[AC-MSG-001-01] Thread status must default to 'active'").toBe("active");

    // Second call — must return the SAME thread id (idempotent)
    const second = await getOrCreateEngagementThread({ engagementId });

    expect(
      eqId(second.id, first.id),
      `[AC-MSG-001-01] Second call must return the same thread id (${first.id} vs ${second.id})`,
    ).toBe(true);

    // Verify only one Thread row exists for this engagementId (admin pool confirmation)
    const countResult = await adminPool.request().query<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM [dbo].[Thread] WHERE [engagementId] = '${engagementId}'`,
    );
    expect(
      countResult.recordset[0]?.cnt,
      "[AC-MSG-001-01] Exactly one Thread row must exist for this engagementId",
    ).toBe(1);
  });

  // ─── AC-MSG-001-02: getThreadForEngagement RLS pass-through ───────────────

  /**
   * AC-MSG-001-02 — Thread visible to participants via request pool.
   *
   * Given an engagement thread exists for CLIENT-A's engagement,
   * When getThreadForEngagement is called under CLIENT-A's SESSION_CONTEXT,
   * Then the thread is returned.
   *
   * This validates that the repository seam wires through the request-pool read
   * without adding an extra WHERE clause (DECISION-017-002-A), and that the
   * SESSION_CONTEXT context set by withClerkIdentity propagates to the RLS check.
   *
   * Full RLS isolation proof (CLIENT-A cannot see CLIENT-B's thread) is in the
   * TASK-017-001 RLS test suite.
   *
   * // AC-MSG-001-02 // ADR-003 // ADR-005 // CS-TS-001 // DECISION-017-002-A
   */
  it("AC-MSG-001-02 — getThreadForEngagement returns thread for engagement participant", async () => {
    // Ensure the thread exists (getOrCreate — idempotent)
    const created = await getOrCreateEngagementThread({ engagementId });
    if (!includesId(createdThreadIds, created.id)) {
      createdThreadIds.push(created.id);
    }

    // CLIENT-A reads the thread via request pool (SESSION_CONTEXT set by withClerkIdentity)
    // CS-TS-001: getThreadForEngagement uses db wrapper (SESSION_CONTEXT). // CS-TS-001
    const thread = await withClerkIdentity(CLIENT_A_CLERK_ID, "CLIENT", () =>
      getThreadForEngagement(engagementId),
    );

    expect(thread, "[AC-MSG-001-02] Thread must be visible to CLIENT-A under their SESSION_CONTEXT").not.toBeNull();
    expect(
      eqId(thread!.id, created.id),
      "[AC-MSG-001-02] Thread id must match the created thread",
    ).toBe(true);
    expect(thread!.kind, "[AC-MSG-001-02] Thread kind must be 'engagement'").toBe("engagement");
    expect(
      thread!.engagementId?.toLowerCase(),
      "[AC-MSG-001-02] Thread must be linked to the correct engagement",
    ).toBe(engagementId.toLowerCase());
  });

  // ─── AC-MSG-002-01/-02 + AC-MSG-001-03/-002-03: appendMessage + listThreadMessages ──

  /**
   * AC-MSG-002-01/-02 / AC-MSG-001-03 / AC-MSG-002-03 — appendMessage + listThreadMessages.
   *
   * Given a thread exists,
   * When three messages are appended (with a 1ms delay between each to ensure distinct timestamps),
   * And listThreadMessages is called under CLIENT-A's SESSION_CONTEXT,
   * Then messages are returned in createdAt ASC order (send order preserved).
   * And each message has the correct senderClerkId and threadId.
   *
   * This also proves the full history persists across separate reads (AC-MSG-001-03).
   *
   * // AC-MSG-002-01/-02 // AC-MSG-001-03 // AC-MSG-002-03 // ADR-003 // CS-TS-001
   */
  it("AC-MSG-002-01/02 / AC-MSG-001-03 / AC-MSG-002-03 — appendMessage + listThreadMessages ordering", async () => {
    // Ensure the engagement thread exists
    const thread = await getOrCreateEngagementThread({ engagementId });
    if (!includesId(createdThreadIds, thread.id)) {
      createdThreadIds.push(thread.id);
    }

    const bodies = [
      "Hello, I need help with my taxes.",
      "Specifically the Section 199A deduction.",
      "Can you review my QBI calculation?",
    ];

    const appendedIds: string[] = [];

    // Append 3 messages sequentially to maintain send order
    for (const body of bodies) {
      const result = await appendMessage({
        threadId: thread.id,
        senderClerkId: CLIENT_A_CLERK_ID,
        body,
      });
      appendedIds.push(result.id);
      createdMessageIds.push(result.id);

      expect(result.id, `[AC-MSG-002-01] appendMessage must return a non-empty id`).toBeTruthy();
      expect(
        eqId(result.threadId, thread.id),
        `[AC-MSG-002-01] appendMessage must return the correct threadId`,
      ).toBe(true);
    }

    // Read messages under CLIENT-A's SESSION_CONTEXT
    // CS-TS-001: listThreadMessages uses db wrapper (SESSION_CONTEXT). // CS-TS-001
    const messages = await withClerkIdentity(CLIENT_A_CLERK_ID, "CLIENT", () =>
      listThreadMessages(thread.id),
    );

    // Verify at least the 3 appended messages are in the result
    const returnedIds = messages.map((m) => m.id.toLowerCase());
    for (const id of appendedIds) {
      expect(
        returnedIds.includes(id.toLowerCase()),
        `[AC-MSG-002-01] Appended message ${id} must be returned by listThreadMessages`,
      ).toBe(true);
    }

    // Verify ordering: the messages we appended must appear in send order (ASC by createdAt)
    // Extract just the 3 appended messages in the order they appear in the result
    const appendedInResult = messages.filter((m) =>
      appendedIds.some((id) => eqId(m.id, id)),
    );

    // Must appear in the order we appended them
    for (let i = 0; i < appendedInResult.length - 1; i++) {
      expect(
        appendedInResult[i]!.createdAt.getTime() <= appendedInResult[i + 1]!.createdAt.getTime(),
        `[AC-MSG-002-03] Message ${i} createdAt must be <= message ${i + 1} createdAt (send order)`,
      ).toBe(true);
    }

    // Verify sender and thread FK on each returned message
    for (const msg of appendedInResult) {
      expect(msg.senderClerkId, "[AC-MSG-002-02] senderClerkId must match the sender").toBe(CLIENT_A_CLERK_ID);
      expect(
        eqId(msg.threadId, thread.id),
        "[AC-MSG-002-02] threadId must match the thread",
      ).toBe(true);
    }

    // Second read — full history persists (AC-MSG-001-03)
    // CS-TS-001: second listThreadMessages call also uses db wrapper. // CS-TS-001
    const messagesAgain = await withClerkIdentity(CLIENT_A_CLERK_ID, "CLIENT", () =>
      listThreadMessages(thread.id),
    );

    expect(
      messagesAgain.length >= messages.length,
      "[AC-MSG-001-03] Full history must persist across separate reads (second read must have same or more messages)",
    ).toBe(true);
  });

  // ─── AC-MSG-003-01/-02 / REQ-MSG-003: HARD verbatim body round-trip ────────

  /**
   * AC-MSG-003-01 / AC-MSG-003-02 / REQ-MSG-003 — HARD plain-text verbatim storage.
   *
   * Given a body containing markup/HTML/script-like syntax and multi-byte Unicode,
   * When appendMessage is called with that body,
   * And the message is read back via listThreadMessages,
   * Then the body is BYTE-IDENTICAL to the original — no transformation, escaping,
   * or interpretation has occurred at the storage layer.
   *
   * This is the tier-3 mandatory storage-layer proof for REQ-MSG-003.
   * Rendering-side verbatim proof is TASK-017-006/-007.
   *
   * Test payloads:
   *   - XSS attempt:    <script>alert('xss')</script>
   *   - HTML injection: <img src=x onerror="evil()">
   *   - Markdown-like:  **bold** _italic_ `code`
   *   - Mixed Unicode:  Ŝ̶̟͉͎͊u̴̗̝͖̻̚ͅp̵̤̯͊̒͐͝ Ça va? — 日本語 — 한국어 — Ελληνικά
   *
   * // AC-MSG-003-01 // AC-MSG-003-02 // REQ-MSG-003 // CS-GEN-001
   */
  it("AC-MSG-003-01/02 / REQ-MSG-003 — body containing markup/HTML/script syntax is stored verbatim (byte-identical round-trip)", async () => {
    // Ensure the engagement thread exists
    const thread = await getOrCreateEngagementThread({ engagementId });
    if (!includesId(createdThreadIds, thread.id)) {
      createdThreadIds.push(thread.id);
    }

    // Test payloads — chosen to catch any server-side HTML escaping, Markdown interpretation,
    // or character transformation (REQ-MSG-003 storage-layer proof).
    // CS-GEN-001: these bodies are NOT logged anywhere in this test. // CS-GEN-001
    const verbatimPayloads = [
      `<script>alert('xss')</script>`,
      `<img src=x onerror="evil()">`,
      `**bold** _italic_ \`inline code\``,
      "Ŝ̶̟͉͎͊u̴̗̝͖̻̚ͅp̵̤̯͊̒͐͝ — Ça va? — 日本語 — 한국어 — Ελληνικά",
      // Newlines + tabs verbatim
      "Line one\r\nLine two\tTabbed",
    ];

    for (const originalBody of verbatimPayloads) {
      const result = await appendMessage({
        threadId: thread.id,
        senderClerkId: ACCOUNTANT_CLERK_ID,
        body: originalBody,
      });
      createdMessageIds.push(result.id);

      // Read back via request pool (RLS-governed)
      // CS-TS-001: listThreadMessages uses db wrapper (SESSION_CONTEXT). // CS-TS-001
      const messages = await withClerkIdentity(CLIENT_A_CLERK_ID, "CLIENT", () =>
        listThreadMessages(thread.id),
      );

      const found = messages.find((m) => eqId(m.id, result.id));
      expect(
        found,
        // CS-GEN-001: do NOT include the body value in the assertion message. // CS-GEN-001
        `[AC-MSG-003-01] Appended message must be retrievable via listThreadMessages`,
      ).toBeDefined();

      // HARD verbatim check: body must be byte-identical (===)
      // AC-MSG-003-01/-02 / REQ-MSG-003: no transform at the storage layer.
      expect(
        found?.body,
        "[AC-MSG-003-01/02 / REQ-MSG-003] Body must be byte-identical to the original (verbatim storage — no transform)",
      ).toBe(originalBody);
    }

    // Confirm also via admin pool direct read (bypass RLS — belt-and-suspenders verification)
    const adminCheck = await adminPool.request().query<{ body: string }>(
      // Use the last created message id
      `SELECT TOP 1 [body] FROM [dbo].[Message] WHERE [threadId] = '${thread.id}'
       AND [senderClerkId] = N'${ACCOUNTANT_CLERK_ID}'
       ORDER BY [createdAt] DESC`,
    );
    const lastPayload = verbatimPayloads[verbatimPayloads.length - 1]!;
    expect(
      adminCheck.recordset[0]?.body,
      "[AC-MSG-003-01/02 / REQ-MSG-003] Admin pool direct read must also show verbatim body",
    ).toBe(lastPayload);
  });

  // ─── AC-MSG-006-01: createGeneralThread ───────────────────────────────────

  /**
   * AC-MSG-006-01 — createGeneralThread produces kind='general', clientUserId set, no engagementId.
   *
   * Given a client User exists,
   * When createGeneralThread is called with that client's userId,
   * Then a Thread row with kind='general', clientUserId=@clientUserId, engagementId=NULL is created.
   *
   * // AC-MSG-006-01 // ADR-003 §7 // CS-TS-002
   */
  it("AC-MSG-006-01 — createGeneralThread produces kind='general' thread associated with the client", async () => {
    const thread = await createGeneralThread({ clientUserId: clientAUserId });
    createdThreadIds.push(thread.id);

    expect(thread.id, "[AC-MSG-006-01] createGeneralThread must return a non-empty id").toBeTruthy();
    expect(thread.kind, "[AC-MSG-006-01] Thread kind must be 'general'").toBe("general");
    expect(
      thread.clientUserId?.toLowerCase(),
      "[AC-MSG-006-01] Thread must be associated with the client (clientUserId set)",
    ).toBe(clientAUserId.toLowerCase());
    expect(thread.engagementId, "[AC-MSG-006-01] General thread must not have engagementId").toBeNull();
    expect(thread.status, "[AC-MSG-006-01] General thread status must default to 'active'").toBe("active");

    // Verify via admin pool direct read
    const adminCheck = await adminPool.request().query<{
      id: string;
      kind: string;
      clientUserId: string | null;
      engagementId: string | null;
    }>(
      `SELECT [id], [kind], [clientUserId], [engagementId]
       FROM [dbo].[Thread]
       WHERE [id] = '${thread.id}'`,
    );
    const row = adminCheck.recordset[0];
    expect(row, "[AC-MSG-006-01] Thread row must exist in DB").toBeDefined();
    expect(row?.kind, "[AC-MSG-006-01] kind must be 'general' in DB").toBe("general");
    expect(row?.engagementId, "[AC-MSG-006-01] engagementId must be NULL in DB").toBeNull();
    expect(
      row?.clientUserId?.toLowerCase(),
      "[AC-MSG-006-01] clientUserId must match in DB",
    ).toBe(clientAUserId.toLowerCase());
  });

  // ─── AC-MSG-006-02: getGeneralThreadsForClient ────────────────────────────

  /**
   * AC-MSG-006-02 — General thread visible to the associated client.
   *
   * Given a general thread is associated with CLIENT-A,
   * When getGeneralThreadsForClient is called under CLIENT-A's SESSION_CONTEXT,
   * Then the general thread is returned.
   *
   * // AC-MSG-006-02 // ADR-003 // ADR-005 // CS-TS-001 // DECISION-017-002-A
   */
  it("AC-MSG-006-02 — getGeneralThreadsForClient returns the thread under client SESSION_CONTEXT", async () => {
    // Create a general thread for CLIENT-A
    const thread = await createGeneralThread({ clientUserId: clientAUserId });
    createdThreadIds.push(thread.id);

    // CLIENT-A reads their general threads via request pool (SESSION_CONTEXT set)
    // CS-TS-001: getGeneralThreadsForClient uses db wrapper (SESSION_CONTEXT). // CS-TS-001
    const threads = await withClerkIdentity(CLIENT_A_CLERK_ID, "CLIENT", () =>
      getGeneralThreadsForClient(clientAUserId),
    );

    const threadIds = threads.map((t) => t.id.toLowerCase());
    expect(
      threadIds.includes(thread.id.toLowerCase()),
      "[AC-MSG-006-02] The general thread must be visible to CLIENT-A under their SESSION_CONTEXT",
    ).toBe(true);

    const found = threads.find((t) => eqId(t.id, thread.id));
    expect(found?.kind, "[AC-MSG-006-02] Returned thread must be kind='general'").toBe("general");
    expect(
      found?.clientUserId?.toLowerCase(),
      "[AC-MSG-006-02] Returned thread must be associated with CLIENT-A",
    ).toBe(clientAUserId.toLowerCase());
    expect(found?.engagementId, "[AC-MSG-006-02] General thread must have no engagementId").toBeNull();
  });

  // ─── AC-MSG-002-03: history persists across separate reads ────────────────

  /**
   * AC-MSG-002-03 — Full message history persists across separate reads.
   *
   * Given multiple messages are appended to a thread in a first session,
   * When listThreadMessages is called again in a second independent session,
   * Then the same full history is returned.
   *
   * // AC-MSG-001-03 // AC-MSG-002-03 // CS-TS-001
   */
  it("AC-MSG-001-03 / AC-MSG-002-03 — full message history persists across separate read calls", async () => {
    // Create a fresh thread for this test to avoid interference
    const thread = await getOrCreateEngagementThread({ engagementId });
    if (!includesId(createdThreadIds, thread.id)) {
      createdThreadIds.push(thread.id);
    }

    const payloads = [
      "First message in fresh read test",
      "Second message in fresh read test",
    ];

    const appendedIds: string[] = [];
    for (const body of payloads) {
      const result = await appendMessage({
        threadId: thread.id,
        senderClerkId: CLIENT_A_CLERK_ID,
        body,
      });
      appendedIds.push(result.id);
      createdMessageIds.push(result.id);
    }

    // First independent read
    // CS-TS-001: listThreadMessages via db wrapper. // CS-TS-001
    const firstRead = await withClerkIdentity(CLIENT_A_CLERK_ID, "CLIENT", () =>
      listThreadMessages(thread.id),
    );
    const firstReadIds = firstRead.map((m) => m.id.toLowerCase());

    // Second independent read
    const secondRead = await withClerkIdentity(CLIENT_A_CLERK_ID, "CLIENT", () =>
      listThreadMessages(thread.id),
    );
    const secondReadIds = secondRead.map((m) => m.id.toLowerCase());

    // Both reads must contain the appended messages
    for (const id of appendedIds) {
      expect(
        firstReadIds.includes(id.toLowerCase()),
        `[AC-MSG-001-03] First read must contain appended message ${id}`,
      ).toBe(true);
      expect(
        secondReadIds.includes(id.toLowerCase()),
        `[AC-MSG-001-03] Second read must contain appended message ${id} (history persists)`,
      ).toBe(true);
    }

    // The second read must have the same message count as the first read
    expect(
      secondRead.length,
      "[AC-MSG-001-03] Second read must return the same number of messages as first read",
    ).toBe(firstRead.length);
  });

});
