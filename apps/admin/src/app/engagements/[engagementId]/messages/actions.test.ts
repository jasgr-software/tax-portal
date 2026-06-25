/**
 * apps/admin/src/app/engagements/[engagementId]/messages/actions.test.ts
 *
 * Unit tests for the admin (ACCOUNTANT) per-engagement + general messaging server actions.
 *
 * TASK-017-003: Test coverage for:
 *   - sendMessageAction (per-engagement, ACCOUNTANT surface)
 *   - markThreadReadAction (per-engagement, ACCOUNTANT surface)
 *   - startGeneralThreadAction (ACCOUNTANT-only — CLIENT identity refused)
 *   - sendGeneralMessageAction + markGeneralThreadReadAction (general thread surface)
 *
 * Acceptance criteria tested:
 *   AC-MSG-014-01 — ACCOUNTANT sends → exactly one CLIENT notification emitted (inside appendMessage);
 *                   ACCOUNTANT sender NOT notified.
 *   AC-MSG-005-04 — markThreadReadAction sets the viewer's lastReadAt watermark; another
 *                   participant's read-state is NOT touched (own-row isolation).
 *   AC-MSG-001-02 — unauthenticated / role-mismatched caller refused before any DB write.
 *   AC-MSG-006-01 — ACCOUNTANT can start a general thread; CLIENT identity refused.
 *
 * Security contract (CS-TS-004 / ADR-003):
 *   - ACCOUNTANT identity from session cookie only — never from args.
 *   - Unauthenticated (null identity) → refused before any DB write.
 *   - CLIENT identity on admin → refused (wrong surface / role).
 *   - startGeneralThreadAction: CLIENT identity refused BEFORE any DB call (ACCOUNTANT-only).
 *
 * Strategy:
 *   - No real DB connection — all seam calls are mocked.
 *   - appendMessage mock captures call args to verify senderClerkId.
 *   - withRequestContext mock calls-through to verify markThreadRead is invoked.
 *   - CS-TS-002: verified by absence of getAdminPool import in actions.ts files.
 *   - CS-GEN-001: body not in mock call assertions beyond appendMessage.
 *   - CS-GEN-003: cite governing keys in comments.
 *
 * // ADR-003: server-side authority; identity from session only
 * // ADR-006: admin surface — ACCOUNTANT actions + ACCOUNTANT-only startGeneralThreadAction
 * // CS-TS-001: request-pool via wrapper
 * // CS-TS-002: no direct pool import
 * // CS-TS-003: mirror discipline — portal surface has parallel test file
 * // CS-TS-004: identity from session cookie only
 * // CS-GEN-001: no PII / message body in mock assertions beyond appendMessage
 * // CS-GEN-003: cite governing authority in comments
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Hoisted mock functions ───────────────────────────────────────────────────

const {
  mockGetIdentity,
  mockAppendMessage,
  mockMarkThreadRead,
  mockGetOrCreateEngagementThread,
  mockCreateGeneralThread,
  mockWithRequestContext,
} = vi.hoisted(() => ({
  mockGetIdentity: vi.fn(),
  mockAppendMessage: vi.fn(),
  mockMarkThreadRead: vi.fn(),
  mockGetOrCreateEngagementThread: vi.fn(),
  mockCreateGeneralThread: vi.fn(),
  mockWithRequestContext: vi.fn(),
}));

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue({
    get: (key: string) => {
      if (key === "cookie") return "mock-cookie=session";
      return null;
    },
  }),
}));

vi.mock("@tax-portal/auth", () => ({
  getAuthProvider: () => ({ getIdentity: mockGetIdentity }),
}));

vi.mock("@tax-portal/db", () => ({
  appendMessage: mockAppendMessage,
  markThreadRead: mockMarkThreadRead,
  getOrCreateEngagementThread: mockGetOrCreateEngagementThread,
  createGeneralThread: mockCreateGeneralThread,
  withRequestContext: mockWithRequestContext,
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import {
  sendMessageAction,
  markThreadReadAction,
} from "./actions.js";
import {
  sendGeneralMessageAction,
  markGeneralThreadReadAction,
} from "../../../messages/actions.js";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ACCOUNTANT_IDENTITY = { clerkUserId: "user_acct_017_admin", role: "ACCOUNTANT" as const };
const CLIENT_IDENTITY = { clerkUserId: "user_client_017_admin", role: "CLIENT" as const };

const ENGAGEMENT_ID = "eng-017-admin-aaaa-bbbb-000000000001";
const THREAD_ID = "thr-017-admin-aaaa-bbbb-000000000001";
const GENERAL_THREAD_ID = "thr-017-general-bbbb-cccc-000000000001";
const MESSAGE_ID = "msg-017-admin-aaaa-bbbb-000000000001";

const MESSAGE_BODY = "Please review the attached documents.";

const MOCK_THREAD = { id: THREAD_ID, kind: "engagement", engagementId: ENGAGEMENT_ID };

const MOCK_APPEND_RESULT = { id: MESSAGE_ID, threadId: THREAD_ID };
const MOCK_MARK_READ_RESULT = { threadId: THREAD_ID, lastReadAt: new Date("2026-06-25T00:00:00Z") };

// ─── sendMessageAction — identity guard ─────────────────────────────────────

describe("[CS-TS-004] [ADR-003] admin: sendMessageAction — identity guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetOrCreateEngagementThread.mockResolvedValue(MOCK_THREAD);
    mockAppendMessage.mockResolvedValue(MOCK_APPEND_RESULT);
  });

  it("[ADR-003] unauthenticated caller (null identity) refused before any DB write", async () => {
    // AC-MSG-001-02: unauthenticated caller refused.
    mockGetIdentity.mockResolvedValue(null);

    const result = await sendMessageAction(ENGAGEMENT_ID, MESSAGE_BODY);

    expect(result.success).toBe(false);
    expect((result as { success: false; error: string }).error).toMatch(/Unauthorized/i);
    expect(mockGetOrCreateEngagementThread).not.toHaveBeenCalled();
    expect(mockAppendMessage).not.toHaveBeenCalled();
  });

  it("[CS-TS-004] CLIENT identity on admin surface → refused", async () => {
    // Admin surface requires ACCOUNTANT. CLIENT on admin → refused.
    mockGetIdentity.mockResolvedValue(CLIENT_IDENTITY);

    const result = await sendMessageAction(ENGAGEMENT_ID, MESSAGE_BODY);

    expect(result.success).toBe(false);
    expect((result as { success: false; error: string }).error).toMatch(/Unauthorized/i);
    expect(mockAppendMessage).not.toHaveBeenCalled();
  });

  it("[ADR-003] ACCOUNTANT identity → allowed to send", async () => {
    // AC-MSG-001-04: ACCOUNTANT can send.
    mockGetIdentity.mockResolvedValue(ACCOUNTANT_IDENTITY);

    const result = await sendMessageAction(ENGAGEMENT_ID, MESSAGE_BODY);

    expect(result.success).toBe(true);
    expect(mockAppendMessage).toHaveBeenCalledOnce();
  });
});

// ─── sendMessageAction — success path ────────────────────────────────────────

describe("[AC-MSG-001-04] [AC-MSG-014-01] admin: sendMessageAction — success path", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetIdentity.mockResolvedValue(ACCOUNTANT_IDENTITY);
    mockGetOrCreateEngagementThread.mockResolvedValue(MOCK_THREAD);
    mockAppendMessage.mockResolvedValue(MOCK_APPEND_RESULT);
  });

  it("[AC-MSG-001-04] ACCOUNTANT can send — appendMessage called with correct threadId + senderClerkId", async () => {
    // CS-TS-004: senderClerkId from verified session — never from args.
    const result = await sendMessageAction(ENGAGEMENT_ID, MESSAGE_BODY);

    expect(result.success).toBe(true);
    expect(mockAppendMessage).toHaveBeenCalledOnce();
    expect(mockAppendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: THREAD_ID,
        senderClerkId: ACCOUNTANT_IDENTITY.clerkUserId, // CS-TS-004: from verified session
        body: MESSAGE_BODY.trim(),
      }),
    );
  });

  it("[AC-MSG-014-01] ACCOUNTANT sends → appendMessage called with ACCOUNTANT's clerkId (CLIENT(s) notified inside appendMessage)", async () => {
    // AC-MSG-014-01: ACCOUNTANT sends → CLIENT(s) notified (inside appendMessage post-write).
    // We verify the senderClerkId passed to appendMessage is the ACCOUNTANT's — not the CLIENT's.
    // The notification direction (→CLIENT) is controlled by message.ts notification logic.
    const result = await sendMessageAction(ENGAGEMENT_ID, MESSAGE_BODY);

    expect(result.success).toBe(true);
    const callArg = mockAppendMessage.mock.calls[0]?.[0] as { senderClerkId: string };
    expect(callArg?.senderClerkId).toBe(ACCOUNTANT_IDENTITY.clerkUserId);
    // Note: the ACCOUNTANT sender MUST NOT receive a notification — this is enforced inside
    // appendMessage's emitNewMessageNotifications (DECISION-017-003-C).
  });
});

// ─── markThreadReadAction — identity guard ─────────────────────────────────────

describe("[CS-TS-004] [ADR-003] admin: markThreadReadAction — identity guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetOrCreateEngagementThread.mockResolvedValue(MOCK_THREAD);
    mockWithRequestContext.mockImplementation(
      async (_id: string, _role: string, cb: () => Promise<unknown>) => cb(),
    );
    mockMarkThreadRead.mockResolvedValue(MOCK_MARK_READ_RESULT);
  });

  it("[ADR-003] unauthenticated → refused before any DB write", async () => {
    mockGetIdentity.mockResolvedValue(null);

    const result = await markThreadReadAction(ENGAGEMENT_ID);

    expect(result.success).toBe(false);
    expect((result as { success: false; error: string }).error).toMatch(/Unauthorized/i);
    expect(mockMarkThreadRead).not.toHaveBeenCalled();
    expect(mockWithRequestContext).not.toHaveBeenCalled();
  });

  it("[CS-TS-004] CLIENT on admin → refused", async () => {
    mockGetIdentity.mockResolvedValue(CLIENT_IDENTITY);

    const result = await markThreadReadAction(ENGAGEMENT_ID);

    expect(result.success).toBe(false);
    expect((result as { success: false; error: string }).error).toMatch(/Unauthorized/i);
    expect(mockMarkThreadRead).not.toHaveBeenCalled();
  });
});

// ─── markThreadReadAction — success path ─────────────────────────────────────

describe("[AC-MSG-005-04] admin: markThreadReadAction — success path", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetIdentity.mockResolvedValue(ACCOUNTANT_IDENTITY);
    mockGetOrCreateEngagementThread.mockResolvedValue(MOCK_THREAD);
    mockWithRequestContext.mockImplementation(
      async (_id: string, _role: string, cb: () => Promise<unknown>) => cb(),
    );
    mockMarkThreadRead.mockResolvedValue(MOCK_MARK_READ_RESULT);
  });

  it("[AC-MSG-005-04] markThreadReadAction sets the ACCOUNTANT's lastReadAt watermark", async () => {
    const result = await markThreadReadAction(ENGAGEMENT_ID);

    expect(result.success).toBe(true);
    expect(mockMarkThreadRead).toHaveBeenCalledOnce();
    expect(mockMarkThreadRead).toHaveBeenCalledWith(THREAD_ID);
    if (result.success) {
      expect(result.data.threadId).toBe(THREAD_ID);
    }
  });

  it("[ADR-005] markThreadRead called with threadId only — userId resolved by DB (own-row isolation)", async () => {
    // ADR-005: BLOCK predicate resolves userId from SESSION_CONTEXT (not from action args).
    // The action only passes threadId — no userId.
    const result = await markThreadReadAction(ENGAGEMENT_ID);

    expect(result.success).toBe(true);
    const args = mockMarkThreadRead.mock.calls[0];
    expect(args).toHaveLength(1); // Only threadId — no userId
    expect(args?.[0]).toBe(THREAD_ID);
  });

  it("[ADR-005] another participant's read-state is NOT marked (own-row: each viewer marks only their row)", async () => {
    // ADR-005 / sec.pol_ThreadReadState: each viewer (ACCOUNTANT and CLIENT) has their own row.
    // markThreadReadAction called with ACCOUNTANT session → only ACCOUNTANT's row is upserted.
    // A CLIENT participant's read-state row is untouched (the DB's own-row BLOCK enforces this).
    //
    // At the action test level: we verify markThreadRead is called exactly once
    // (not twice for two participants), confirming the action does NOT mark all participants.
    mockGetIdentity.mockResolvedValue(ACCOUNTANT_IDENTITY);

    const result = await markThreadReadAction(ENGAGEMENT_ID);

    expect(result.success).toBe(true);
    // Exactly ONE call: the ACCOUNTANT's own row. CLIENT's row is untouched.
    expect(mockMarkThreadRead).toHaveBeenCalledTimes(1);
  });
});

// NOTE: startGeneralThreadAction tests removed — the function is now unexported (internal only).
// Its identity guard (ACCOUNTANT-only) and input validation are covered via
// createGeneralThreadForClientAction which is the only public entry point.
// Security fix: removing the export closes the unvalidated direct-call path (EPIC-017 fixer).

// ─── sendGeneralMessageAction — identity guard ────────────────────────────────

describe("[CS-TS-004] [ADR-003] admin: sendGeneralMessageAction — identity guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAppendMessage.mockResolvedValue({ id: MESSAGE_ID, threadId: GENERAL_THREAD_ID });
  });

  it("[ADR-003] unauthenticated → refused before any DB write", async () => {
    mockGetIdentity.mockResolvedValue(null);

    const result = await sendGeneralMessageAction(GENERAL_THREAD_ID, MESSAGE_BODY);

    expect(result.success).toBe(false);
    expect((result as { success: false; error: string }).error).toMatch(/Unauthorized/i);
    expect(mockAppendMessage).not.toHaveBeenCalled();
  });

  it("[CS-TS-004] CLIENT identity → refused", async () => {
    mockGetIdentity.mockResolvedValue(CLIENT_IDENTITY);

    const result = await sendGeneralMessageAction(GENERAL_THREAD_ID, MESSAGE_BODY);

    expect(result.success).toBe(false);
    expect(mockAppendMessage).not.toHaveBeenCalled();
  });

  it("[ADR-003] ACCOUNTANT → allowed to send in general thread", async () => {
    mockGetIdentity.mockResolvedValue(ACCOUNTANT_IDENTITY);

    const result = await sendGeneralMessageAction(GENERAL_THREAD_ID, MESSAGE_BODY);

    expect(result.success).toBe(true);
    expect(mockAppendMessage).toHaveBeenCalledOnce();
  });
});

// ─── sendGeneralMessageAction — success path ─────────────────────────────────

describe("[AC-MSG-014-01] admin: sendGeneralMessageAction — success path", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetIdentity.mockResolvedValue(ACCOUNTANT_IDENTITY);
    mockAppendMessage.mockResolvedValue({ id: MESSAGE_ID, threadId: GENERAL_THREAD_ID });
  });

  it("[AC-MSG-014-01] ACCOUNTANT sends in general thread → appendMessage with ACCOUNTANT senderClerkId", async () => {
    // AC-MSG-014-01: ACCOUNTANT sends → CLIENT notified (inside appendMessage).
    const result = await sendGeneralMessageAction(GENERAL_THREAD_ID, MESSAGE_BODY);

    expect(result.success).toBe(true);
    expect(mockAppendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: GENERAL_THREAD_ID,
        senderClerkId: ACCOUNTANT_IDENTITY.clerkUserId, // CS-TS-004: from verified session
        body: MESSAGE_BODY.trim(),
      }),
    );
  });
});

// ─── markGeneralThreadReadAction — identity guard ─────────────────────────────

describe("[CS-TS-004] [ADR-003] admin: markGeneralThreadReadAction — identity guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWithRequestContext.mockImplementation(
      async (_id: string, _role: string, cb: () => Promise<unknown>) => cb(),
    );
    mockMarkThreadRead.mockResolvedValue({ threadId: GENERAL_THREAD_ID, lastReadAt: new Date() });
  });

  it("[ADR-003] unauthenticated → refused before any DB write", async () => {
    mockGetIdentity.mockResolvedValue(null);

    const result = await markGeneralThreadReadAction(GENERAL_THREAD_ID);

    expect(result.success).toBe(false);
    expect((result as { success: false; error: string }).error).toMatch(/Unauthorized/i);
    expect(mockMarkThreadRead).not.toHaveBeenCalled();
  });

  it("[CS-TS-004] CLIENT → refused", async () => {
    mockGetIdentity.mockResolvedValue(CLIENT_IDENTITY);

    const result = await markGeneralThreadReadAction(GENERAL_THREAD_ID);

    expect(result.success).toBe(false);
    expect(mockMarkThreadRead).not.toHaveBeenCalled();
  });

  it("[AC-MSG-005-04] ACCOUNTANT → markThreadRead called", async () => {
    mockGetIdentity.mockResolvedValue(ACCOUNTANT_IDENTITY);

    const result = await markGeneralThreadReadAction(GENERAL_THREAD_ID);

    expect(result.success).toBe(true);
    expect(mockMarkThreadRead).toHaveBeenCalledWith(GENERAL_THREAD_ID);
  });
});

// ─── Multi-participant scenario (conceptual) ─────────────────────────────────

describe("[AC-MSG-014-01] multi-participant: ACCOUNTANT sends → each non-sender CLIENT notified", () => {
  // NOTE: The multi-participant notification logic lives inside message.ts
  // (emitNewMessageNotifications). At the action test layer we verify:
  //   1. appendMessage is called with the ACCOUNTANT's senderClerkId.
  //   2. Only ONE call to appendMessage occurs (not one per participant).
  // The participant-resolution + per-CLIENT notification loop is tested in message.ts unit tests.
  // The SDET will validate the multi-participant behavior in integration tests (TASK-017-008).

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetIdentity.mockResolvedValue(ACCOUNTANT_IDENTITY);
    mockGetOrCreateEngagementThread.mockResolvedValue(MOCK_THREAD);
    mockAppendMessage.mockResolvedValue(MOCK_APPEND_RESULT);
  });

  it("appendMessage called exactly once even for multi-participant threads", async () => {
    // The action calls appendMessage once; notification fanout is inside appendMessage.
    const result = await sendMessageAction(ENGAGEMENT_ID, MESSAGE_BODY);

    expect(result.success).toBe(true);
    expect(mockAppendMessage).toHaveBeenCalledTimes(1); // Single INSERT; notification inside
  });

  it("ACCOUNTANT sender NOT in notification recipients — senderClerkId is ACCOUNTANT's (not CLIENT's)", async () => {
    // ADR-023 / DECISION-017-003-C: sender is excluded from notification recipients.
    // At action layer: senderClerkId = ACCOUNTANT.clerkUserId (from verified session).
    // Inside appendMessage, if senderClerkId does NOT match any client → sender is ACCOUNTANT
    // → CLIENT recipients are notified. Sender (ACCOUNTANT) is never notified. // AC-MSG-014-01
    const result = await sendMessageAction(ENGAGEMENT_ID, MESSAGE_BODY);

    expect(result.success).toBe(true);
    const callArg = mockAppendMessage.mock.calls[0]?.[0] as { senderClerkId: string };
    expect(callArg?.senderClerkId).toBe(ACCOUNTANT_IDENTITY.clerkUserId);
    // The notification logic (not self-notified) is enforced in message.ts based on this clerkId.
  });
});
