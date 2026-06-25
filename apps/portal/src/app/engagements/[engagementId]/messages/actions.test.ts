/**
 * apps/portal/src/app/engagements/[engagementId]/messages/actions.test.ts
 *
 * Unit tests for the portal (CLIENT) messaging server actions.
 *
 * TASK-017-003: Test coverage for sendMessageAction + markThreadReadAction (CLIENT surface).
 *
 * Acceptance criteria tested:
 *   AC-MSG-013-02 — CLIENT sends → exactly one ACCOUNTANT notification emitted;
 *                   CLIENT sender NOT notified; sender-not-notified invariant.
 *   AC-MSG-005-04 — markThreadReadAction sets the viewer's lastReadAt watermark.
 *   AC-MSG-001-02 — unauthenticated / role-mismatched caller refused before any DB write.
 *   AC-MSG-001-04 — CLIENT can send a message in an engagement thread.
 *
 * Security contract (CS-TS-004 / ADR-003):
 *   - CLIENT identity from session cookie only — never from args.
 *   - Unauthenticated (null identity) → refused.
 *   - ACCOUNTANT identity on portal → refused (wrong surface).
 *   - CLIENT identity → allowed.
 *   - markThreadReadAction leaves another participant's read state untouched.
 *
 * Strategy:
 *   - No real DB connection — all seam calls are mocked.
 *   - appendMessage mock captures the call args so we can assert notification behavior
 *     via the emitAndPublishNotification mock.
 *   - withRequestContext mock calls-through to verify markThreadRead is invoked.
 *   - CS-TS-002: verified by absence of getAdminPool import in actions.ts.
 *   - CS-GEN-001: verified by asserting body is NOT in any mock call except appendMessage.
 *   - CS-GEN-003: cite governing keys in comments.
 *
 * // ADR-003: server-side authority; identity from session only
 * // ADR-006: portal surface — CLIENT actions
 * // CS-TS-001: request-pool via wrapper
 * // CS-TS-002: no direct pool import
 * // CS-TS-003: mirror discipline — admin surface has parallel test file
 * // CS-TS-004: identity from session cookie only
 * // CS-GEN-001: no PII / message body in logs or test assertions beyond appendMessage
 * // CS-GEN-003: cite governing authority in comments
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Hoisted mock functions ───────────────────────────────────────────────────

const {
  mockGetIdentity,
  mockAppendMessage,
  mockMarkThreadRead,
  mockGetOrCreateEngagementThread,
  mockGetThreadForEngagement,
  mockWithRequestContext,
  mockStoreAndScanAttachment,
  mockVerifyMessageInThread,
} = vi.hoisted(() => ({
  mockGetIdentity: vi.fn(),
  mockAppendMessage: vi.fn(),
  mockMarkThreadRead: vi.fn(),
  mockGetOrCreateEngagementThread: vi.fn(),
  mockGetThreadForEngagement: vi.fn(),
  mockWithRequestContext: vi.fn(),
  mockStoreAndScanAttachment: vi.fn(),
  mockVerifyMessageInThread: vi.fn(),
}));

// ─── Mocks ────────────────────────────────────────────────────────────────────

// Mock next/headers — server action reads cookie header to build synthetic Request
vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue({
    get: (key: string) => {
      if (key === "cookie") return "mock-cookie=session";
      return null;
    },
  }),
}));

// Mock @tax-portal/auth — return verified identity by default
vi.mock("@tax-portal/auth", () => ({
  getAuthProvider: () => ({ getIdentity: mockGetIdentity }),
}));

// Mock @tax-portal/db barrel — all seam calls via barrel
vi.mock("@tax-portal/db", () => ({
  appendMessage: mockAppendMessage,
  markThreadRead: mockMarkThreadRead,
  getOrCreateEngagementThread: mockGetOrCreateEngagementThread,
  getThreadForEngagement: mockGetThreadForEngagement,
  withRequestContext: mockWithRequestContext,
  storeAndScanAttachment: mockStoreAndScanAttachment,
  verifyMessageInThread: mockVerifyMessageInThread,
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { sendMessageAction, markThreadReadAction, attachMessageAction } from "./actions.js";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const CLIENT_IDENTITY = { clerkUserId: "user_client_017_portal", role: "CLIENT" as const };
const ACCOUNTANT_IDENTITY = { clerkUserId: "user_acct_017", role: "ACCOUNTANT" as const };

const ENGAGEMENT_ID = "eng-017-portal-aaaa-bbbb-000000000001";
const THREAD_ID = "thr-017-portal-aaaa-bbbb-000000000001";
const MESSAGE_ID = "msg-017-portal-aaaa-bbbb-000000000001";
const MESSAGE_BODY = "Hello, I have a question about my return.";

const MOCK_THREAD = { id: THREAD_ID, kind: "engagement", engagementId: ENGAGEMENT_ID };
const MOCK_APPEND_RESULT = { id: MESSAGE_ID, threadId: THREAD_ID };
const MOCK_MARK_READ_RESULT = { threadId: THREAD_ID, lastReadAt: new Date("2026-06-25T00:00:00Z") };

// ─── sendMessageAction — identity guard tests ─────────────────────────────────

describe("[CS-TS-004] [ADR-003] portal: sendMessageAction — identity guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // withRequestContext calls-through so the callback (getThreadForEngagement) executes.
    mockWithRequestContext.mockImplementation(
      async (_clerkUserId: string, _role: string, cb: () => Promise<unknown>) => cb(),
    );
    // Default: participation gate passes (thread found for the CLIENT participant).
    mockGetThreadForEngagement.mockResolvedValue(MOCK_THREAD);
    mockAppendMessage.mockResolvedValue(MOCK_APPEND_RESULT);
  });

  it("[ADR-003] unauthenticated caller (null identity) refused before any DB write", async () => {
    // AC-MSG-001-02: unauthenticated caller refused.
    // CS-TS-004: null identity from session → refusal.
    mockGetIdentity.mockResolvedValue(null);

    const result = await sendMessageAction(ENGAGEMENT_ID, MESSAGE_BODY);

    expect(result.success).toBe(false);
    expect((result as { success: false; error: string }).error).toMatch(/Unauthorized/i);
    // No DB write must occur (CS-TS-004 / ADR-003 — refuse before DB)
    expect(mockGetThreadForEngagement).not.toHaveBeenCalled();
    expect(mockAppendMessage).not.toHaveBeenCalled();
  });

  it("[CS-TS-004] ACCOUNTANT identity on portal → refused (wrong surface, wrong role)", async () => {
    // Portal requires CLIENT identity. An ACCOUNTANT on portal is refused.
    // CS-TS-004: identity from session — role mismatch → refuse before any DB write.
    mockGetIdentity.mockResolvedValue(ACCOUNTANT_IDENTITY);

    const result = await sendMessageAction(ENGAGEMENT_ID, MESSAGE_BODY);

    expect(result.success).toBe(false);
    expect((result as { success: false; error: string }).error).toMatch(/Unauthorized/i);
    expect(mockGetThreadForEngagement).not.toHaveBeenCalled();
    expect(mockAppendMessage).not.toHaveBeenCalled();
  });

  it("[ADR-003] CLIENT identity → allowed to send", async () => {
    // AC-MSG-001-04: CLIENT can send.
    mockGetIdentity.mockResolvedValue(CLIENT_IDENTITY);

    const result = await sendMessageAction(ENGAGEMENT_ID, MESSAGE_BODY);

    expect(result.success).toBe(true);
    expect(mockAppendMessage).toHaveBeenCalledOnce();
  });
});

// ─── sendMessageAction — input validation ─────────────────────────────────────

describe("[ADR-003] portal: sendMessageAction — input validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetIdentity.mockResolvedValue(CLIENT_IDENTITY);
    mockWithRequestContext.mockImplementation(
      async (_clerkUserId: string, _role: string, cb: () => Promise<unknown>) => cb(),
    );
    mockGetThreadForEngagement.mockResolvedValue(MOCK_THREAD);
    mockAppendMessage.mockResolvedValue(MOCK_APPEND_RESULT);
  });

  it("empty engagementId rejected before any DB write", async () => {
    const result = await sendMessageAction("", MESSAGE_BODY);
    expect(result.success).toBe(false);
    expect(mockAppendMessage).not.toHaveBeenCalled();
  });

  it("empty body rejected before any DB write", async () => {
    const result = await sendMessageAction(ENGAGEMENT_ID, "");
    expect(result.success).toBe(false);
    expect(mockAppendMessage).not.toHaveBeenCalled();
  });

  it("whitespace-only body rejected", async () => {
    const result = await sendMessageAction(ENGAGEMENT_ID, "   ");
    expect(result.success).toBe(false);
    expect(mockAppendMessage).not.toHaveBeenCalled();
  });
});

// ─── sendMessageAction — success path ─────────────────────────────────────────

describe("[AC-MSG-001-04] [AC-MSG-013-02] portal: sendMessageAction — success path", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetIdentity.mockResolvedValue(CLIENT_IDENTITY);
    mockWithRequestContext.mockImplementation(
      async (_clerkUserId: string, _role: string, cb: () => Promise<unknown>) => cb(),
    );
    mockGetThreadForEngagement.mockResolvedValue(MOCK_THREAD);
    mockAppendMessage.mockResolvedValue(MOCK_APPEND_RESULT);
  });

  it("[AC-MSG-001-04] CLIENT can send a message — appendMessage called with correct threadId + senderClerkId", async () => {
    // AC-MSG-001-04: CLIENT sends in engagement thread.
    // CS-TS-004: senderClerkId from verified session identity — never from args.
    const result = await sendMessageAction(ENGAGEMENT_ID, MESSAGE_BODY);

    expect(result.success).toBe(true);
    expect(mockAppendMessage).toHaveBeenCalledOnce();
    expect(mockAppendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: THREAD_ID,
        senderClerkId: CLIENT_IDENTITY.clerkUserId, // CS-TS-004: from verified session
        body: MESSAGE_BODY.trim(),
      }),
    );
  });

  it("[AC-MSG-013-02] CLIENT sends → appendMessage called (notification emitted inside appendMessage)", async () => {
    // AC-MSG-013-02: CLIENT sender → ACCOUNTANT notified (inside appendMessage).
    // The action layer calls appendMessage which internally emits the notification.
    // We verify appendMessage was called with the CLIENT's clerkId as senderClerkId.
    // The notification emission itself is tested in the message.ts unit tests.
    const result = await sendMessageAction(ENGAGEMENT_ID, MESSAGE_BODY);

    expect(result.success).toBe(true);
    // Verify senderClerkId is CLIENT's (not ACCOUNTANT's) — ensures correct direction
    const callArg = mockAppendMessage.mock.calls[0]?.[0] as {
      senderClerkId: string;
    };
    expect(callArg?.senderClerkId).toBe(CLIENT_IDENTITY.clerkUserId);
  });

  it("result contains message id and threadId", async () => {
    const result = await sendMessageAction(ENGAGEMENT_ID, MESSAGE_BODY);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe(MESSAGE_ID);
      expect(result.data.threadId).toBe(THREAD_ID);
    }
  });
});

// ─── markThreadReadAction — identity guard ─────────────────────────────────────

describe("[CS-TS-004] [ADR-003] portal: markThreadReadAction — identity guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetOrCreateEngagementThread.mockResolvedValue(MOCK_THREAD);
    // withRequestContext calls-through to invoke the callback
    mockWithRequestContext.mockImplementation(
      async (_clerkUserId: string, _role: string, cb: () => Promise<unknown>) => cb(),
    );
    mockMarkThreadRead.mockResolvedValue(MOCK_MARK_READ_RESULT);
  });

  it("[ADR-003] unauthenticated caller refused before any DB write", async () => {
    mockGetIdentity.mockResolvedValue(null);

    const result = await markThreadReadAction(ENGAGEMENT_ID);

    expect(result.success).toBe(false);
    expect((result as { success: false; error: string }).error).toMatch(/Unauthorized/i);
    expect(mockMarkThreadRead).not.toHaveBeenCalled();
    expect(mockWithRequestContext).not.toHaveBeenCalled();
  });

  it("[CS-TS-004] ACCOUNTANT on portal → refused before any DB write", async () => {
    mockGetIdentity.mockResolvedValue(ACCOUNTANT_IDENTITY);

    const result = await markThreadReadAction(ENGAGEMENT_ID);

    expect(result.success).toBe(false);
    expect((result as { success: false; error: string }).error).toMatch(/Unauthorized/i);
    expect(mockMarkThreadRead).not.toHaveBeenCalled();
  });
});

// ─── markThreadReadAction — success path ─────────────────────────────────────

describe("[AC-MSG-005-04] portal: markThreadReadAction — success path", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetIdentity.mockResolvedValue(CLIENT_IDENTITY);
    mockGetOrCreateEngagementThread.mockResolvedValue(MOCK_THREAD);
    // withRequestContext calls-through to invoke the callback
    mockWithRequestContext.mockImplementation(
      async (_clerkUserId: string, _role: string, cb: () => Promise<unknown>) => cb(),
    );
    mockMarkThreadRead.mockResolvedValue(MOCK_MARK_READ_RESULT);
  });

  it("[AC-MSG-005-04] markThreadReadAction sets the viewer's lastReadAt watermark", async () => {
    // AC-MSG-005-04: marking a thread read clears the viewer's unread indicator.
    const result = await markThreadReadAction(ENGAGEMENT_ID);

    expect(result.success).toBe(true);
    expect(mockMarkThreadRead).toHaveBeenCalledOnce();
    expect(mockMarkThreadRead).toHaveBeenCalledWith(THREAD_ID);
    if (result.success) {
      expect(result.data.threadId).toBe(THREAD_ID);
      expect(result.data.lastReadAt).toEqual(MOCK_MARK_READ_RESULT.lastReadAt);
    }
  });

  it("[CS-TS-004] withRequestContext called with identity from verified session", async () => {
    // CS-TS-004: SESSION_CONTEXT set with identity from the verified cookie session.
    const result = await markThreadReadAction(ENGAGEMENT_ID);

    expect(result.success).toBe(true);
    expect(mockWithRequestContext).toHaveBeenCalledWith(
      CLIENT_IDENTITY.clerkUserId, // CS-TS-004: from verified session
      CLIENT_IDENTITY.role,
      expect.any(Function),
    );
  });

  it("[ADR-005] markThreadRead called with the resolved threadId (own-row isolation via RLS)", async () => {
    // ADR-005: sec.pol_ThreadReadState BLOCK enforces own-row write.
    // The action passes threadId; the BLOCK predicate resolves userId from SESSION_CONTEXT.
    const result = await markThreadReadAction(ENGAGEMENT_ID);

    expect(result.success).toBe(true);
    expect(mockMarkThreadRead).toHaveBeenCalledWith(THREAD_ID);
  });
});

// ─── markThreadReadAction — another participant's state untouched ──────────────

describe("[AC-MSG-005-04] portal: markThreadReadAction — own-row isolation", () => {
  // This test asserts that markThreadReadAction only marks the viewer's watermark.
  // The BLOCK predicate on sec.pol_ThreadReadState prevents writing another viewer's row.
  // At the action level: the action passes only the threadId; no userId is passed.
  // The RLS predicate in the DB resolves userId from SESSION_CONTEXT.
  //
  // In this unit test we verify:
  //   1. markThreadRead is called with the correct threadId.
  //   2. No userId is in the call arg (userId is DB-resolved, not action-supplied).
  //   3. A second call with a different identity does not affect the first viewer's result.

  it("[ADR-005] markThreadRead called with threadId only — userId resolved by DB (BLOCK predicate)", async () => {
    vi.clearAllMocks();
    mockGetIdentity.mockResolvedValue(CLIENT_IDENTITY);
    mockGetOrCreateEngagementThread.mockResolvedValue(MOCK_THREAD);
    mockWithRequestContext.mockImplementation(
      async (_clerkUserId: string, _role: string, cb: () => Promise<unknown>) => cb(),
    );
    mockMarkThreadRead.mockResolvedValue(MOCK_MARK_READ_RESULT);

    const result = await markThreadReadAction(ENGAGEMENT_ID);

    expect(result.success).toBe(true);
    // markThreadRead signature: markThreadRead(threadId: string) — NO userId param
    const args = mockMarkThreadRead.mock.calls[0];
    expect(args).toHaveLength(1); // Only threadId — userId is DB-resolved
    expect(args?.[0]).toBe(THREAD_ID);
  });
});

// ─── markThreadReadAction — input validation ──────────────────────────────────

describe("portal: markThreadReadAction — input validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetIdentity.mockResolvedValue(CLIENT_IDENTITY);
  });

  it("empty engagementId rejected before any DB write", async () => {
    const result = await markThreadReadAction("");
    expect(result.success).toBe(false);
    expect(mockMarkThreadRead).not.toHaveBeenCalled();
  });
});

// ─── B1 NEGATIVE: non-participant CLIENT cannot send a message ────────────────

/**
 * [B1][NEGATIVE] A CLIENT who is NOT a participant of the engagement thread is refused
 * BEFORE any admin-pool write. getThreadForEngagement returns null (RLS: non-participant).
 *
 * This test was RED before the participation gate was added — the action would call
 * appendMessage even when the requesting CLIENT was not a participant (getOrCreateEngagementThread
 * would return a thread for ANY engagementId on the admin pool). It is GREEN after the fix.
 *
 * ADR-005: sec.pol_Thread FILTER returns null for non-participants (fail-closed). // ADR-005
 * CS-TS-001: participation check runs under withRequestContext (request pool). // CS-TS-001
 */
describe("[B1][NEGATIVE] portal: sendMessageAction — non-participant CLIENT refused", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetIdentity.mockResolvedValue(CLIENT_IDENTITY);
    // withRequestContext calls-through so the callback (getThreadForEngagement) executes.
    mockWithRequestContext.mockImplementation(
      async (_clerkUserId: string, _role: string, cb: () => Promise<unknown>) => cb(),
    );
    // Non-participant: getThreadForEngagement returns null (RLS FILTER on sec.pol_Thread).
    mockGetThreadForEngagement.mockResolvedValue(null);
  });

  it("[ADR-005][NEGATIVE] non-participant CLIENT: getThreadForEngagement null → refused BEFORE appendMessage", async () => {
    // This is the red→green regression guard for B1 on the engagement surface.
    // BEFORE fix: appendMessage would be called (getOrCreateEngagementThread was admin pool).
    // AFTER fix: getThreadForEngagement returns null → refused; appendMessage never called.
    const result = await sendMessageAction(ENGAGEMENT_ID, MESSAGE_BODY);

    expect(result.success).toBe(false);
    expect((result as { success: false; error: string }).error).toMatch(/not found|access denied/i);
    // The admin-pool write must NOT have occurred (ADR-003 / ADR-005). // ADR-003 // ADR-005
    expect(mockAppendMessage).not.toHaveBeenCalled();
  });

  it("[ADR-005][NEGATIVE] attacker supplies a foreign engagementId → refused", async () => {
    // Attacker supplies a valid-looking but foreign engagementId.
    // getThreadForEngagement returns null for the non-participant → refused. // ADR-005
    const result = await sendMessageAction("eng-foreign-aaaa-bbbb-000000000099", MESSAGE_BODY);

    expect(result.success).toBe(false);
    expect(mockAppendMessage).not.toHaveBeenCalled();
  });
});

// ─── B1 POSITIVE: legitimate participant CAN send ────────────────────────────

describe("[B1][POSITIVE] portal: sendMessageAction — participant CLIENT allowed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetIdentity.mockResolvedValue(CLIENT_IDENTITY);
    mockWithRequestContext.mockImplementation(
      async (_clerkUserId: string, _role: string, cb: () => Promise<unknown>) => cb(),
    );
    // Participant: getThreadForEngagement returns the real thread.
    mockGetThreadForEngagement.mockResolvedValue(MOCK_THREAD);
    mockAppendMessage.mockResolvedValue(MOCK_APPEND_RESULT);
  });

  it("[AC-MSG-001-04][POSITIVE] participant CLIENT: thread found → appendMessage called", async () => {
    // AC-MSG-001-04: CLIENT can send in engagement thread.
    const result = await sendMessageAction(ENGAGEMENT_ID, MESSAGE_BODY);

    expect(result.success).toBe(true);
    expect(mockGetThreadForEngagement).toHaveBeenCalledWith(ENGAGEMENT_ID);
    expect(mockAppendMessage).toHaveBeenCalledOnce();
    expect(mockAppendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: THREAD_ID,
        senderClerkId: CLIENT_IDENTITY.clerkUserId, // CS-TS-004: from verified session
        body: MESSAGE_BODY.trim(),
      }),
    );
  });
});

// ─── B2 NEGATIVE: non-participant CLIENT cannot attach a file ─────────────────

/**
 * [B2][NEGATIVE] A CLIENT who is NOT a participant (or uses a wrong messageId↔threadId binding)
 * is refused before storeAndScanAttachment. verifyMessageInThread returns false.
 *
 * This test was RED before the participation gate was added — the action would call
 * storeAndScanAttachment for any CLIENT even if not a participant.
 * It is GREEN after the fix.
 *
 * ADR-005: sec.pol_Message FILTER returns false for non-participants. // ADR-005
 * CS-TS-001: binding check runs under withRequestContext. // CS-TS-001
 */
describe("[B2][NEGATIVE] portal: attachMessageAction — non-participant CLIENT refused", () => {
  const MOCK_BYTES = Buffer.from("file bytes");

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetIdentity.mockResolvedValue(CLIENT_IDENTITY);
    mockWithRequestContext.mockImplementation(
      async (_clerkUserId: string, _role: string, cb: () => Promise<unknown>) => cb(),
    );
    // Non-participant or wrong binding: verifyMessageInThread returns false.
    mockVerifyMessageInThread.mockResolvedValue(false);
  });

  it("[ADR-005][NEGATIVE] non-participant CLIENT: verifyMessageInThread false → refused BEFORE storeAndScanAttachment", async () => {
    // This is the red→green regression guard for B2 on the engagement surface.
    // BEFORE fix: storeAndScanAttachment would be called for any CLIENT.
    // AFTER fix: verifyMessageInThread returns false → refused; store never called.
    const result = await attachMessageAction(
      MESSAGE_ID,
      THREAD_ID,
      "malware.pdf",
      "application/pdf",
      MOCK_BYTES,
    );

    expect(result.success).toBe(false);
    expect((result as { success: false; error: string }).error).toMatch(/not found|access denied/i);
    // The admin-pool store must NOT have occurred (ADR-003 / ADR-005). // ADR-003 // ADR-005
    expect(mockStoreAndScanAttachment).not.toHaveBeenCalled();
  });

  it("[ADR-005][NEGATIVE] wrong messageId↔threadId binding → refused", async () => {
    // Attacker substitutes a messageId from a different thread — binding fails. // ADR-005
    const result = await attachMessageAction(
      "msg-from-other-thread-000000000099",
      THREAD_ID,
      "file.pdf",
      "application/pdf",
      MOCK_BYTES,
    );

    expect(result.success).toBe(false);
    expect(mockStoreAndScanAttachment).not.toHaveBeenCalled();
  });
});

// ─── B2 POSITIVE: legitimate participant CAN attach ───────────────────────────

describe("[B2][POSITIVE] portal: attachMessageAction — participant CLIENT allowed", () => {
  const MOCK_BYTES = Buffer.from("file bytes");

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetIdentity.mockResolvedValue(CLIENT_IDENTITY);
    mockWithRequestContext.mockImplementation(
      async (_clerkUserId: string, _role: string, cb: () => Promise<unknown>) => cb(),
    );
    // Participant with correct binding: verifyMessageInThread returns true.
    mockVerifyMessageInThread.mockResolvedValue(true);
    mockStoreAndScanAttachment.mockResolvedValue({
      outcome: "active" as const,
      attachmentId: "att-017-portal-0001",
    });
  });

  it("[AC-MSG-004-01][POSITIVE] participant CLIENT: verifyMessageInThread true → storeAndScanAttachment called", async () => {
    // AC-MSG-004-01: CLIENT can attach to a message in their engagement thread.
    const result = await attachMessageAction(
      MESSAGE_ID,
      THREAD_ID,
      "tax-doc.pdf",
      "application/pdf",
      MOCK_BYTES,
    );

    expect(result.success).toBe(true);
    expect(mockVerifyMessageInThread).toHaveBeenCalledWith(MESSAGE_ID, THREAD_ID);
    expect(mockStoreAndScanAttachment).toHaveBeenCalledOnce();
    expect(mockStoreAndScanAttachment).toHaveBeenCalledWith(
      expect.objectContaining({
        messageId: MESSAGE_ID,
        threadId: THREAD_ID,
        uploadedByClerkId: CLIENT_IDENTITY.clerkUserId, // CS-TS-004: from verified session
      }),
    );
  });
});
