/**
 * apps/portal/src/app/messages/[threadId]/actions.test.ts
 *
 * Unit tests for the portal (CLIENT) general-thread server actions.
 *
 * EPIC-017 security fix — negative tests proving B1/B2 participation gate:
 *   B1: A CLIENT who is NOT a participant of a general thread cannot send a message
 *       (sendGeneralMessageAction refuses when getThreadById returns null).
 *   B2: A CLIENT who is NOT a participant (or supplies a wrong messageId↔threadId binding)
 *       cannot attach a file (attachGeneralMessageAction refuses when
 *       verifyMessageInThread returns false).
 *
 * These tests were red BEFORE the participation gate was added (the action called
 * appendMessage / storeAndScanAttachment on ANY threadId). They are green AFTER
 * the gate is added (getThreadById + verifyMessageInThread under withRequestContext).
 *
 * Also tests the positive path: a legitimate participant CAN send + attach.
 *
 * Strategy:
 *   - No real DB connection — all seam calls are mocked.
 *   - withRequestContext calls-through to invoke the callback.
 *   - getThreadById returns null to simulate non-participant (B1 negative gate).
 *   - verifyMessageInThread returns false to simulate non-participant / wrong binding (B2).
 *   - getThreadById returns a real thread for the positive (participant) paths.
 *
 * // ADR-003: server-side authority; identity from session only
 * // ADR-005: request-pool participation gate (fail-closed)
 * // ADR-006: portal surface — CLIENT actions
 * // CS-TS-001: request-pool via withRequestContext
 * // CS-TS-002: no direct pool import
 * // CS-TS-003: mirror — admin surface has parallel messaging actions
 * // CS-TS-004: identity from session cookie only
 * // CS-GEN-001: no PII / message bodies in logs beyond action level
 * // CS-GEN-003: cite governing authority in comments
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Hoisted mock functions ───────────────────────────────────────────────────

const {
  mockGetIdentity,
  mockAppendMessage,
  mockMarkThreadRead,
  mockGetThreadById,
  mockWithRequestContext,
  mockStoreAndScanAttachment,
  mockAuthorizeThenSignAttachment,
  mockVerifyMessageInThread,
} = vi.hoisted(() => ({
  mockGetIdentity: vi.fn(),
  mockAppendMessage: vi.fn(),
  mockMarkThreadRead: vi.fn(),
  mockGetThreadById: vi.fn(),
  mockWithRequestContext: vi.fn(),
  mockStoreAndScanAttachment: vi.fn(),
  mockAuthorizeThenSignAttachment: vi.fn(),
  mockVerifyMessageInThread: vi.fn(),
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
  getThreadById: mockGetThreadById,
  withRequestContext: mockWithRequestContext,
  storeAndScanAttachment: mockStoreAndScanAttachment,
  authorizeThenSignAttachment: mockAuthorizeThenSignAttachment,
  verifyMessageInThread: mockVerifyMessageInThread,
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import {
  sendGeneralMessageAction,
  attachGeneralMessageAction,
  markGeneralThreadReadAction,
} from "./actions.js";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const CLIENT_IDENTITY = { clerkUserId: "user_client_017_portal_gen", role: "CLIENT" as const };
const ACCOUNTANT_IDENTITY = { clerkUserId: "user_acct_017", role: "ACCOUNTANT" as const };

const THREAD_ID = "thr-017-general-aaaa-bbbb-000000000001";
const OTHER_THREAD_ID = "thr-017-general-aaaa-bbbb-000000000099";
const MESSAGE_ID = "msg-017-general-aaaa-bbbb-000000000001";
const MESSAGE_BODY = "Hello from general thread.";

const MOCK_THREAD = {
  id: THREAD_ID,
  kind: "general" as const,
  engagementId: null,
  clientUserId: "user-client-id-abc",
  status: "active" as const,
  archivedAt: null,
  createdAt: new Date("2026-06-25T00:00:00Z"),
  updatedAt: new Date("2026-06-25T00:00:00Z"),
};
const MOCK_APPEND_RESULT = { id: MESSAGE_ID, threadId: THREAD_ID };
const MOCK_SCAN_RESULT = { outcome: "active" as const, attachmentId: "att-017-aaaa-0001" };
const MOCK_MARK_READ_RESULT = { threadId: THREAD_ID, lastReadAt: new Date("2026-06-25T00:00:00Z") };
const MOCK_BYTES = Buffer.from("file bytes");

// ─── B1 NEGATIVE: non-participant cannot send a message ───────────────────────

/**
 * [B1][NEGATIVE] A CLIENT who is NOT a participant of the general thread is refused
 * BEFORE any admin-pool write. getThreadById returns null (RLS: non-participant).
 *
 * This test was RED before the participation gate was added — the action would call
 * appendMessage even when getThreadById returned null. It is GREEN after the fix.
 *
 * ADR-005: sec.pol_Thread FILTER returns null for non-participants (fail-closed). // ADR-005
 * CS-TS-001: participation check runs under withRequestContext. // CS-TS-001
 */
describe("[B1][NEGATIVE] sendGeneralMessageAction — non-participant CLIENT refused", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetIdentity.mockResolvedValue(CLIENT_IDENTITY);
    // withRequestContext calls-through so the callback (getThreadById) executes.
    mockWithRequestContext.mockImplementation(
      async (_clerkUserId: string, _role: string, cb: () => Promise<unknown>) => cb(),
    );
    // Non-participant: getThreadById returns null (RLS FILTER on sec.pol_Thread).
    mockGetThreadById.mockResolvedValue(null);
  });

  it("[ADR-005][NEGATIVE] non-participant CLIENT: getThreadById returns null → refused BEFORE appendMessage", async () => {
    // This is the red→green regression guard for B1.
    // BEFORE fix: appendMessage would be called.
    // AFTER fix: refused here; appendMessage never called.
    const result = await sendGeneralMessageAction(THREAD_ID, MESSAGE_BODY);

    expect(result.success).toBe(false);
    expect((result as { success: false; error: string }).error).toMatch(/not found|access denied/i);
    // The admin-pool write must NOT have occurred (ADR-003 / ADR-005). // ADR-003 // ADR-005
    expect(mockAppendMessage).not.toHaveBeenCalled();
  });

  it("[ADR-005][NEGATIVE] non-participant with a valid-looking threadId cannot write", async () => {
    // Attacker supplies a real but foreign threadId — must still be refused.
    // getThreadById under withRequestContext returns null (RLS FILTER). // ADR-005
    const result = await sendGeneralMessageAction(OTHER_THREAD_ID, MESSAGE_BODY);

    expect(result.success).toBe(false);
    expect(mockAppendMessage).not.toHaveBeenCalled();
  });
});

// ─── B1 POSITIVE: legitimate participant CAN send ────────────────────────────

describe("[B1][POSITIVE] sendGeneralMessageAction — participant CLIENT allowed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetIdentity.mockResolvedValue(CLIENT_IDENTITY);
    mockWithRequestContext.mockImplementation(
      async (_clerkUserId: string, _role: string, cb: () => Promise<unknown>) => cb(),
    );
    // Participant: getThreadById returns the real thread.
    mockGetThreadById.mockResolvedValue(MOCK_THREAD);
    mockAppendMessage.mockResolvedValue(MOCK_APPEND_RESULT);
  });

  it("[AC-MSG-001-04][POSITIVE] participant CLIENT: getThreadById returns thread → appendMessage called", async () => {
    // AC-MSG-001-04: CLIENT can send in general thread.
    const result = await sendGeneralMessageAction(THREAD_ID, MESSAGE_BODY);

    expect(result.success).toBe(true);
    expect(mockGetThreadById).toHaveBeenCalledWith(THREAD_ID);
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

// ─── B2 NEGATIVE: non-participant cannot attach a file ───────────────────────

/**
 * [B2][NEGATIVE] A CLIENT who is NOT a participant of the thread is refused before
 * storeAndScanAttachment. verifyMessageInThread returns false (RLS-governed).
 *
 * This test was RED before the participation gate was added — the action would call
 * storeAndScanAttachment even for a non-participant's messageId/threadId pair.
 * It is GREEN after the fix.
 *
 * ADR-005: sec.pol_Message FILTER returns false for non-participants. // ADR-005
 * CS-TS-001: binding check runs under withRequestContext. // CS-TS-001
 */
describe("[B2][NEGATIVE] attachGeneralMessageAction — non-participant CLIENT refused", () => {
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
    // This is the red→green regression guard for B2.
    // BEFORE fix: storeAndScanAttachment would be called.
    // AFTER fix: refused here; storeAndScanAttachment never called.
    const result = await attachGeneralMessageAction(
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

  it("[ADR-005][NEGATIVE] wrong messageId↔threadId binding: verifyMessageInThread false → refused", async () => {
    // Attacker substitutes a messageId from another thread — binding check returns false.
    // verifyMessageInThread returns false (message not in this thread via RLS). // ADR-005
    const result = await attachGeneralMessageAction(
      "msg-from-other-thread",
      THREAD_ID,
      "file.pdf",
      "application/pdf",
      MOCK_BYTES,
    );

    expect(result.success).toBe(false);
    expect(mockStoreAndScanAttachment).not.toHaveBeenCalled();
  });
});

// ─── B2 POSITIVE: legitimate participant CAN attach ──────────────────────────

describe("[B2][POSITIVE] attachGeneralMessageAction — participant CLIENT allowed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetIdentity.mockResolvedValue(CLIENT_IDENTITY);
    mockWithRequestContext.mockImplementation(
      async (_clerkUserId: string, _role: string, cb: () => Promise<unknown>) => cb(),
    );
    // Participant with correct binding: verifyMessageInThread returns true.
    mockVerifyMessageInThread.mockResolvedValue(true);
    mockStoreAndScanAttachment.mockResolvedValue(MOCK_SCAN_RESULT);
  });

  it("[AC-MSG-004-01][POSITIVE] participant CLIENT: verifyMessageInThread true → storeAndScanAttachment called", async () => {
    // AC-MSG-004-01: CLIENT can attach to a message they sent in the general thread.
    const result = await attachGeneralMessageAction(
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

// ─── Identity guard tests ─────────────────────────────────────────────────────

describe("[CS-TS-004][ADR-003] sendGeneralMessageAction — identity guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWithRequestContext.mockImplementation(
      async (_clerkUserId: string, _role: string, cb: () => Promise<unknown>) => cb(),
    );
    mockGetThreadById.mockResolvedValue(MOCK_THREAD);
    mockAppendMessage.mockResolvedValue(MOCK_APPEND_RESULT);
  });

  it("[ADR-003] unauthenticated caller (null identity) refused before any DB write", async () => {
    mockGetIdentity.mockResolvedValue(null);

    const result = await sendGeneralMessageAction(THREAD_ID, MESSAGE_BODY);

    expect(result.success).toBe(false);
    expect((result as { success: false; error: string }).error).toMatch(/Unauthorized/i);
    expect(mockGetThreadById).not.toHaveBeenCalled();
    expect(mockAppendMessage).not.toHaveBeenCalled();
  });

  it("[CS-TS-004] ACCOUNTANT on portal → refused (wrong surface)", async () => {
    mockGetIdentity.mockResolvedValue(ACCOUNTANT_IDENTITY);

    const result = await sendGeneralMessageAction(THREAD_ID, MESSAGE_BODY);

    expect(result.success).toBe(false);
    expect(mockGetThreadById).not.toHaveBeenCalled();
    expect(mockAppendMessage).not.toHaveBeenCalled();
  });
});

// ─── markGeneralThreadReadAction tests ───────────────────────────────────────

describe("[AC-MSG-005-04] markGeneralThreadReadAction — identity guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWithRequestContext.mockImplementation(
      async (_clerkUserId: string, _role: string, cb: () => Promise<unknown>) => cb(),
    );
    mockMarkThreadRead.mockResolvedValue(MOCK_MARK_READ_RESULT);
  });

  it("[ADR-003] unauthenticated caller refused before any DB write", async () => {
    mockGetIdentity.mockResolvedValue(null);

    const result = await markGeneralThreadReadAction(THREAD_ID);

    expect(result.success).toBe(false);
    expect((result as { success: false; error: string }).error).toMatch(/Unauthorized/i);
    expect(mockMarkThreadRead).not.toHaveBeenCalled();
  });

  it("[AC-MSG-005-04] CLIENT identity → markThreadRead called with correct threadId", async () => {
    mockGetIdentity.mockResolvedValue(CLIENT_IDENTITY);

    const result = await markGeneralThreadReadAction(THREAD_ID);

    expect(result.success).toBe(true);
    expect(mockMarkThreadRead).toHaveBeenCalledWith(THREAD_ID);
  });
});
