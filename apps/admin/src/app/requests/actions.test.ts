/**
 * apps/admin/src/app/requests/actions.test.ts
 *
 * Tier-2/unit: decision server actions — acceptRequest + declineRequest.
 *
 * Covers (12 AC from TASK-003-005):
 *   AC-DOOR-006-02: acceptRequest transitions request to 'accepted' status.
 *   AC-DOOR-006-03: declineRequest transitions request to 'declined' status.
 *   AC-DOOR-006-04: Non-ACCOUNTANT identity is rejected before any side effects.
 *   AC-DOOR-006-05: A second decision on an already-decided request is rejected.
 *   AC-DOOR-007-01: acceptRequest sends an invitation email to the prospect's contact email.
 *   AC-DOOR-007-02: The invitation email body contains the PORTAL_APP_URL sign-up link with ticket.
 *   AC-DOOR-007-03: No User/account row is created at acceptance (createInvitation only — no DB user write).
 *   AC-DOOR-007-04: The invitation ticket is persisted (acceptEngagementRequest called with ticket arg).
 *   AC-DOOR-008-01: declineRequest accepts and passes through the free-text decline reason.
 *   AC-DOOR-008-02/-03: declineRequest sends the reason to the prospect's contact email (no account needed).
 *   AC-DOOR-008-04: The decline reason is persisted (declineEngagementRequest called with reason arg).
 *
 * Also covers (security invariants):
 *   ADR-019: Audit row written (recordAuthEvent called) on accept + decline.
 *   ADR-022: Outbound email rate-limited (email blocked when rate limit exhausted).
 *
 * Methodology: test-after, gherkin-style test names, AC tags in titles.
 * No real DB, no real email. All external seams are mocked:
 *   - @tax-portal/db: withRequestContext passthrough, getEngagementRequest stub,
 *     acceptEngagementRequest stub, declineEngagementRequest stub, AlreadyDecidedError,
 *     recordAuthEvent stub, withAuditTransaction passthrough.
 *   - @tax-portal/auth: getAuthProvider (getIdentity + createInvitation mocks),
 *     getPortalAppUrl (returns test URL), getRateLimiter (returns stub limiter),
 *     buildRateLimitKey (passthrough).
 *   - @tax-portal/email: getEmailProvider (send mock).
 *   - next/headers: headers() cookie mock.
 *   - next/cache: revalidatePath no-op.
 *
 * The actual SESSION_CONTEXT wiring is proven by the tier-3 integration tests in
 * packages/db/src/session-context.propagation.test.ts (existing).
 * The DB-layer decide-once BLOCK predicate is proven by
 * packages/db/src/engagement-request.decide-boundary.rls.test.ts (existing).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Hoisted mock factories ───────────────────────────────────────────────────
// vi.hoisted() ensures these are defined before any vi.mock() factory runs.

const {
  mockGetIdentity,
  mockCreateInvitation,
  mockEmailSend,
  mockGetEngagementRequest,
  mockAcceptEngagementRequest,
  mockDeclineEngagementRequest,
  mockRecordAuthEvent,
  mockCreateEngagement,
  mockRateLimiterConsume,
  mockRevalidatePath,
  mockHeaders,
  mockWithRequestContext,
  mockWithAuditTransaction,
  mockGetAdminPool,
  mockEmitAndPublishNotification,
} = vi.hoisted(() => ({
  mockGetIdentity: vi.fn(),
  mockCreateInvitation: vi.fn(),
  mockEmailSend: vi.fn(),
  mockGetEngagementRequest: vi.fn(),
  mockAcceptEngagementRequest: vi.fn(),
  mockDeclineEngagementRequest: vi.fn(),
  mockRecordAuthEvent: vi.fn(),
  /**
   * TASK-005-003: createEngagement mock — asserts the Engagement is created on accept
   * (AC-ONBD-001-01). Returns a stub { id, status: 'New' } to match the real signature.
   */
  mockCreateEngagement: vi.fn(),
  mockRateLimiterConsume: vi.fn(),
  mockRevalidatePath: vi.fn(),
  /** Represents the `headers()` async function from next/headers */
  mockHeaders: vi.fn(),
  /** Pass-through withRequestContext: calls fn() directly (no real SESSION_CONTEXT) */
  mockWithRequestContext: vi.fn(),
  /** Pass-through withAuditTransaction: calls fn(null) directly (no real transaction) */
  mockWithAuditTransaction: vi.fn(),
  /**
   * EPIC-016 / TASK-016-004: getAdminPool mock — resolves client user id from request.
   * Returns a stub pool whose .request().query() resolves with no clientUserId (new-prospect path).
   * Tests that assert the notification path can override this. // TASK-016-004 // CS-GEN-002
   */
  mockGetAdminPool: vi.fn(),
  /**
   * EPIC-016 / TASK-016-004: emitAndPublishNotification mock — no-op in unit tests.
   * The real function hits the DB (admin pool) + real-time transport — both are mocked here.
   * Resolves with a stub { id: 'mock-notif-id' }. // TASK-016-004
   */
  mockEmitAndPublishNotification: vi.fn(),
}));

// ─── AlreadyDecidedError mock class ──────────────────────────────────────────
// Must be defined before vi.mock() factories so the instanceof check in actions.ts works.
// We export it from the @tax-portal/db mock factory below.

const { MockAlreadyDecidedError } = vi.hoisted(() => {
  class MockAlreadyDecidedError extends Error {
    constructor(id: string) {
      super(`[mock] Request ${id} already decided`);
      this.name = "AlreadyDecidedError";
    }
  }
  return { MockAlreadyDecidedError };
});

// ─── Mocks ────────────────────────────────────────────────────────────────────

// next/headers — server action reads cookie header for identity resolution.
// Uses mockHeaders (hoisted) so beforeEach can restore it after clearAllMocks().
vi.mock("next/headers", () => ({
  headers: mockHeaders,
}));

// next/cache — revalidatePath no-op in unit tests
vi.mock("next/cache", () => ({
  revalidatePath: mockRevalidatePath,
}));

// @tax-portal/auth — mock auth provider (getIdentity + createInvitation), portal URL,
// rate limiter port. Role is server-evaluated (never from client input — ADR-005).
vi.mock("@tax-portal/auth", () => ({
  getAuthProvider: () => ({
    getIdentity: mockGetIdentity,
    createInvitation: mockCreateInvitation,
  }),
  getPortalAppUrl: () => "http://localhost:3000",
  getRateLimiter: () => ({
    consume: mockRateLimiterConsume,
    peek: vi.fn().mockReturnValue({ allowed: true }),
    reset: vi.fn(),
  }),
  buildRateLimitKey: (userId: string, endpoint: string) => `${userId}:${endpoint}`,
}));

// @tax-portal/email — mock email provider; captures what was sent
vi.mock("@tax-portal/email", () => ({
  getEmailProvider: () => ({
    send: mockEmailSend,
    fromAddress: "noreply@test.example.com",
  }),
}));

// @tax-portal/db — mock all DB interactions used by the decision actions.
// All mocks are hoisted so beforeEach can restore them after vi.clearAllMocks().
// TASK-005-003: createEngagement added to the mock (AC-ONBD-001-01).
vi.mock("@tax-portal/db", () => ({
  withRequestContext: mockWithRequestContext,
  withAuditTransaction: mockWithAuditTransaction,
  getEngagementRequest: mockGetEngagementRequest,
  acceptEngagementRequest: mockAcceptEngagementRequest,
  declineEngagementRequest: mockDeclineEngagementRequest,
  recordAuthEvent: mockRecordAuthEvent,
  createEngagement: mockCreateEngagement,
  AlreadyDecidedError: MockAlreadyDecidedError,
  // EPIC-016 / TASK-016-004: mock admin pool + notification emit for unit tests.
  // The real getAdminPool() opens a DB connection; emitAndPublishNotification hits the DB + transport.
  // Unit tests isolate from these — the integration test (source-event-wiring.integration.test.ts)
  // exercises the real path against the actual SQL Server. // TASK-016-004 // CS-GEN-002
  getAdminPool: mockGetAdminPool,
  emitAndPublishNotification: mockEmitAndPublishNotification,
}));

// mock mssql — resolveClientUserIdFromRequest destructures { Request } from the default mssql export
// and calls mssqlPkg.NVarChar(50). We mock the entire module to provide a stub Request constructor.
// When used with `new MssqlRequest(pool)`, the constructor sets input/query on `this`.
// The stub's query() resolves with { clientUserId: null } (new-prospect path — no portal account).
// EPIC-016 / TASK-016-004 // CS-GEN-002 // ADR-003
vi.mock("mssql", () => {
  // When `new StubRequest(pool)` is called, 'this' is the new object.
  // Setting input/query on 'this' makes them available on the instance.
  function StubRequest(this: {
    input: ReturnType<typeof vi.fn>;
    query: ReturnType<typeof vi.fn>;
  }, _pool: unknown) {
    this.input = vi.fn().mockReturnThis();
    this.query = vi.fn().mockResolvedValue({ recordset: [{ clientUserId: null }] });
  }
  const mssqlDefault = {
    NVarChar: (_size: number) => `NVARCHAR(${_size})`,
    UniqueIdentifier: "UNIQUEIDENTIFIER",
    MAX: 65535,
    Request: StubRequest,
  };
  return {
    default: mssqlDefault,
  };
});

// ─── Import AFTER mocks ───────────────────────────────────────────────────────

import { acceptRequest, declineRequest } from "./actions.js";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const REQUEST_ID = "req-aaaabbbb-cccc-dddd-eeee-000000000001";
const PROSPECT_EMAIL = "tom.prospect@example.com";
const MOCK_TICKET = "mock-ticket-client-dG9tLnByb3NwZWN0QA";

const ACCOUNTANT_IDENTITY = {
  clerkUserId: "user_accountant_001",
  role: "ACCOUNTANT" as const,
};

const CLIENT_IDENTITY = {
  clerkUserId: "user_client_001",
  role: "CLIENT" as const,
};

/** Pending engagement request as returned by getEngagementRequest() */
const MOCK_PENDING_REQUEST = {
  id: REQUEST_ID,
  firstName: "Tom",
  lastName: "Prospect",
  email: PROSPECT_EMAIL,
  phone: null,
  message: "Need help with taxes",
  status: "pending",
  declineReason: null,
  invitationTicket: null,
  decidedAt: null,
  createdAt: new Date("2026-06-17T09:00:00Z"),
  updatedAt: new Date("2026-06-17T09:00:00Z"),
  services: [],
};

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();

  // Restore headers mock after clearAllMocks() — clearAllMocks() clears vi.fn() implementations.
  // mockHeaders must be re-configured each test run.
  mockHeaders.mockResolvedValue({
    get: (key: string) => (key === "cookie" ? "mock-cookie=session" : null),
  });

  // Restore withRequestContext pass-through (calls fn() directly — no real SESSION_CONTEXT)
  mockWithRequestContext.mockImplementation(
    (_clerkUserId: string, _role: string, fn: () => Promise<unknown>) => fn(),
  );

  // Restore withAuditTransaction pass-through (calls fn(null) — no real mssql transaction)
  mockWithAuditTransaction.mockImplementation(
    (fn: (txn: null) => Promise<unknown>) => fn(null),
  );

  // Default: verified ACCOUNTANT identity
  mockGetIdentity.mockResolvedValue(ACCOUNTANT_IDENTITY);

  // Default: createInvitation returns a fixture invitation (no account created — AC-DOOR-007-03)
  mockCreateInvitation.mockResolvedValue({
    email: PROSPECT_EMAIL,
    role: "CLIENT",
    ticket: MOCK_TICKET,
  });

  // Default: request found in pending state
  mockGetEngagementRequest.mockResolvedValue(MOCK_PENDING_REQUEST);

  // Default: accept/decline repo fns succeed (no throw = success)
  mockAcceptEngagementRequest.mockResolvedValue(undefined);
  mockDeclineEngagementRequest.mockResolvedValue(undefined);

  // Default: createEngagement succeeds with a stub New engagement (TASK-005-003)
  mockCreateEngagement.mockResolvedValue({
    id: "engagement-aaaabbbb-cccc-dddd-eeee-000000000001",
    status: "New",
  });

  // Default: audit row written without error
  mockRecordAuthEvent.mockResolvedValue(undefined);

  // Default: email send succeeds
  mockEmailSend.mockResolvedValue({ id: "email-001" });

  // Default: rate limiter allows (not exhausted)
  mockRateLimiterConsume.mockReturnValue({ allowed: true });

  // EPIC-016 / TASK-016-004: getAdminPool and emitAndPublishNotification defaults.
  // Default: resolveClientUserIdFromRequest sees no clientUserId (new-prospect path).
  // emitAndPublishNotification is a no-op stub — real behavior tested in integration tests.
  // CS-GEN-002: additive setup — no existing default changed. // CS-GEN-002
  mockGetAdminPool.mockResolvedValue({});
  mockEmitAndPublishNotification.mockResolvedValue({ id: "mock-notif-id-accept-decline" });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── acceptRequest tests ──────────────────────────────────────────────────────

describe("acceptRequest", () => {
  // ── AC-DOOR-006-02 ────────────────────────────────────────────────────────
  describe("[AC-DOOR-006-02] accept moves the request to accepted", () => {
    it("[AC-DOOR-006-02] calls acceptEngagementRequest with the request ID and invitation ticket", async () => {
      const result = await acceptRequest(REQUEST_ID);

      // The repo fn is called → status transition to 'accepted' happens at the DB layer
      expect(mockAcceptEngagementRequest).toHaveBeenCalledOnce();
      expect(mockAcceptEngagementRequest).toHaveBeenCalledWith(REQUEST_ID, MOCK_TICKET, null);
      expect(result.success).toBe(true);
    });
  });

  // ── AC-DOOR-006-04 ────────────────────────────────────────────────────────
  describe("[AC-DOOR-006-04] only ACCOUNTANT can accept", () => {
    it("[AC-DOOR-006-04] returns { success: false } when identity is null (unauthenticated)", async () => {
      mockGetIdentity.mockResolvedValue(null);

      const result = await acceptRequest(REQUEST_ID);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toMatch(/unauthorized/i);
      }
      // No side effects — no invitation, no email, no DB write
      expect(mockCreateInvitation).not.toHaveBeenCalled();
      expect(mockAcceptEngagementRequest).not.toHaveBeenCalled();
      expect(mockEmailSend).not.toHaveBeenCalled();
      expect(mockRecordAuthEvent).not.toHaveBeenCalled();
    });

    it("[AC-DOOR-006-04] returns { success: false } when role is CLIENT (not ACCOUNTANT)", async () => {
      mockGetIdentity.mockResolvedValue(CLIENT_IDENTITY);

      const result = await acceptRequest(REQUEST_ID);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toMatch(/unauthorized/i);
      }
      // No side effects
      expect(mockCreateInvitation).not.toHaveBeenCalled();
      expect(mockAcceptEngagementRequest).not.toHaveBeenCalled();
      expect(mockEmailSend).not.toHaveBeenCalled();
      expect(mockRecordAuthEvent).not.toHaveBeenCalled();
    });
  });

  // ── AC-DOOR-006-05 ────────────────────────────────────────────────────────
  describe("[AC-DOOR-006-05] decide-exactly-once — second accept is rejected", () => {
    it("[AC-DOOR-006-05] returns { success: false, error: 'already_decided' } when repo throws AlreadyDecidedError", async () => {
      mockAcceptEngagementRequest.mockRejectedValue(new MockAlreadyDecidedError(REQUEST_ID));

      const result = await acceptRequest(REQUEST_ID);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("already_decided");
      }
      // Email must NOT be sent when the transaction fails
      expect(mockEmailSend).not.toHaveBeenCalled();
    });

    it("[AC-DOOR-006-05] second accept on an accepted request is rejected (AlreadyDecidedError propagation)", async () => {
      // First accept succeeds
      await acceptRequest(REQUEST_ID);
      // Second accept: the repo rejects
      mockAcceptEngagementRequest.mockRejectedValue(new MockAlreadyDecidedError(REQUEST_ID));

      const secondResult = await acceptRequest(REQUEST_ID);

      expect(secondResult.success).toBe(false);
      if (!secondResult.success) {
        expect(secondResult.error).toBe("already_decided");
      }
    });
  });

  // ── AC-DOOR-007-01 ────────────────────────────────────────────────────────
  describe("[AC-DOOR-007-01] accept sends an invitation email to the prospect's contact email", () => {
    it("[AC-DOOR-007-01] emailProvider.send() is called with the prospect's email address", async () => {
      const result = await acceptRequest(REQUEST_ID);

      expect(result.success).toBe(true);
      expect(mockEmailSend).toHaveBeenCalledOnce();
      const sentMessage = mockEmailSend.mock.calls[0]?.[0];
      expect(sentMessage?.to).toBe(PROSPECT_EMAIL);
    });

    it("[AC-DOOR-007-01] email subject mentions the invitation", async () => {
      await acceptRequest(REQUEST_ID);

      const sentMessage = mockEmailSend.mock.calls[0]?.[0];
      expect(sentMessage?.subject).toMatch(/invited/i);
    });
  });

  // ── AC-DOOR-007-02 ────────────────────────────────────────────────────────
  describe("[AC-DOOR-007-02] invitation email links to client surface sign-up with ticket", () => {
    it("[AC-DOOR-007-02] email body contains PORTAL_APP_URL sign-up URL with ticket query param", async () => {
      await acceptRequest(REQUEST_ID);

      const sentMessage = mockEmailSend.mock.calls[0]?.[0];
      // The email body must contain the portal sign-up URL with the ticket (ADR-010)
      expect(sentMessage?.text).toContain("http://localhost:3000/sign-up");
      expect(sentMessage?.text).toContain(encodeURIComponent(MOCK_TICKET));
    });
  });

  // ── AC-DOOR-007-03 ────────────────────────────────────────────────────────
  describe("[AC-DOOR-007-03] no User/account row is created at acceptance", () => {
    it("[AC-DOOR-007-03] createInvitation is called (issues invitation only) — no User INSERT", async () => {
      await acceptRequest(REQUEST_ID);

      // createInvitation issues an invitation token ONLY — no User row is created.
      // The mock returns { email, role: 'CLIENT', ticket } with no DB side effect.
      // This mirrors ADR-001: createInvitation = deferred account (Clerk invitation),
      // not a full Clerk user (that is EPIC-004's sign-up path).
      expect(mockCreateInvitation).toHaveBeenCalledOnce();
      expect(mockCreateInvitation).toHaveBeenCalledWith(PROSPECT_EMAIL, "CLIENT");

      // Critically: the mock does NOT call any User repository insert.
      // In the real system, MockAuthProvider.createInvitation returns a fixture token
      // with NO User table insert — the test verifies the code does not call any
      // User-creation function (no such call exists in acceptRequest).
    });

    it("[AC-DOOR-007-03] createInvitation is called with role CLIENT (server-set — ADR-001/ADR-005)", async () => {
      await acceptRequest(REQUEST_ID);

      const callArgs = mockCreateInvitation.mock.calls[0];
      // Role is set by the server (always 'CLIENT') — never from client input (ADR-005)
      expect(callArgs?.[1]).toBe("CLIENT");
    });
  });

  // ── AC-DOOR-007-04 ────────────────────────────────────────────────────────
  describe("[AC-DOOR-007-04] invitation ticket persisted on the engagement request", () => {
    it("[AC-DOOR-007-04] acceptEngagementRequest is called with the ticket returned by createInvitation", async () => {
      await acceptRequest(REQUEST_ID);

      // The ticket from createInvitation must be passed to acceptEngagementRequest
      // (which persists it to EngagementRequest.invitationTicket — AC-DOOR-007-04)
      expect(mockAcceptEngagementRequest).toHaveBeenCalledWith(REQUEST_ID, MOCK_TICKET, null);
    });

    it("[AC-DOOR-007-04] a different ticket from createInvitation is also passed through", async () => {
      const altTicket = "mock-ticket-client-alt-different";
      mockCreateInvitation.mockResolvedValue({
        email: PROSPECT_EMAIL,
        role: "CLIENT",
        ticket: altTicket,
      });

      await acceptRequest(REQUEST_ID);

      expect(mockAcceptEngagementRequest).toHaveBeenCalledWith(REQUEST_ID, altTicket, null);
    });
  });

  // ── Audit (ADR-019) ───────────────────────────────────────────────────────
  describe("[ADR-019] audit row written on accept", () => {
    it("[ADR-019] recordAuthEvent called with action engagement_request.accepted", async () => {
      await acceptRequest(REQUEST_ID);

      expect(mockRecordAuthEvent).toHaveBeenCalledOnce();
      const auditArg = mockRecordAuthEvent.mock.calls[0]?.[0];
      expect(auditArg?.action).toBe("engagement_request.accepted");
      expect(auditArg?.targetType).toBe("EngagementRequest");
      expect(auditArg?.targetId).toBe(REQUEST_ID);
      expect(auditArg?.sourceSurface).toBe("admin");
      expect(auditArg?.actor.clerkUserId).toBe(ACCOUNTANT_IDENTITY.clerkUserId);
      expect(auditArg?.actor.role).toBe("ACCOUNTANT");
    });

    it("[ADR-019] audit is NOT written when the identity guard rejects (no audit on unauthorized)", async () => {
      mockGetIdentity.mockResolvedValue(null);

      await acceptRequest(REQUEST_ID);

      expect(mockRecordAuthEvent).not.toHaveBeenCalled();
    });

    it("[ADR-019] audit is NOT written when AlreadyDecidedError is thrown (no audit on no-op)", async () => {
      mockAcceptEngagementRequest.mockRejectedValue(new MockAlreadyDecidedError(REQUEST_ID));

      await acceptRequest(REQUEST_ID);

      // withAuditTransaction passthrough executes fn() which throws AlreadyDecidedError
      // before recordAuthEvent is called — no audit row on already-decided.
      // (In the real impl, AlreadyDecidedError is thrown by acceptEngagementRequest
      // which is called BEFORE recordAuthEvent in the transaction callback.)
      expect(mockRecordAuthEvent).not.toHaveBeenCalled();
    });
  });

  // ── ADR-022: Rate limiting ─────────────────────────────────────────────────
  describe("[ADR-022] outbound invitation email is rate-limited", () => {
    it("[ADR-022] when rate limit is exhausted, decision is committed but email is NOT sent", async () => {
      mockRateLimiterConsume.mockReturnValue({
        allowed: false,
        retryAfterMs: 30_000,
      });

      const result = await acceptRequest(REQUEST_ID);

      // The decision IS committed (acceptEngagementRequest was called before rate-limit check)
      expect(mockAcceptEngagementRequest).toHaveBeenCalledOnce();

      // But the email was suppressed
      expect(mockEmailSend).not.toHaveBeenCalled();

      // The result reports success=true with emailSent=false and an emailError message
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.emailSent).toBe(false);
        if (!result.emailSent) {
          expect(result.emailError).toMatch(/rate limited/i);
        }
      }
    });

    it("[ADR-022] when rate limit allows, email IS sent", async () => {
      mockRateLimiterConsume.mockReturnValue({ allowed: true });

      const result = await acceptRequest(REQUEST_ID);

      expect(mockEmailSend).toHaveBeenCalledOnce();
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.emailSent).toBe(true);
      }
    });
  });

  // ── AC-ONBD-001-01 (TASK-005-003): Engagement created on accept ───────────
  describe("[AC-ONBD-001-01] engagement substrate created on accept", () => {
    it("[AC-ONBD-001-01] createEngagement is called inside the accept transaction with the requestId", async () => {
      await acceptRequest(REQUEST_ID);

      // createEngagement must be called exactly once inside withAuditTransaction (same txn)
      expect(mockCreateEngagement).toHaveBeenCalledOnce();
      expect(mockCreateEngagement).toHaveBeenCalledWith(
        { engagementRequestId: REQUEST_ID },
        null, // mock txn value (withAuditTransaction passthrough passes null)
      );
    });

    it("[AC-ONBD-001-01] createEngagement is called with clientUserId omitted (NULL at accept-time — DECISION-A)", async () => {
      await acceptRequest(REQUEST_ID);

      const callArgs = mockCreateEngagement.mock.calls[0]?.[0];
      // DECISION-A: clientUserId must NOT be set at accept-time (prospect has no User row yet)
      expect(callArgs?.clientUserId).toBeUndefined();
    });

    it("[AC-ONBD-001-01] engagement is NOT created when the request is already decided (rollback — no orphan)", async () => {
      // AlreadyDecidedError is thrown by acceptEngagementRequest BEFORE createEngagement is called.
      // The transaction rolls back → no Engagement row is created (correct: no orphan engagement).
      mockAcceptEngagementRequest.mockRejectedValue(new MockAlreadyDecidedError(REQUEST_ID));

      const result = await acceptRequest(REQUEST_ID);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("already_decided");
      }
      // createEngagement must NOT have been called — it follows acceptEngagementRequest in the
      // transaction callback, so when acceptEngagementRequest throws, the callback exits early.
      expect(mockCreateEngagement).not.toHaveBeenCalled();
    });

    it("[AC-ONBD-001-01] engagement is NOT created when the identity guard rejects (no unauthorized create)", async () => {
      mockGetIdentity.mockResolvedValue(null);

      await acceptRequest(REQUEST_ID);

      // No transaction is ever opened — the action returns early at the identity guard.
      expect(mockCreateEngagement).not.toHaveBeenCalled();
    });

    it("[AC-ONBD-001-01] EPIC-003 accept behavior is unchanged (status transition + ticket + audit + email)", async () => {
      // This test verifies the additive constraint: EPIC-003 behavior is preserved.
      // All prior side effects remain in place after TASK-005-003 adds createEngagement.
      const result = await acceptRequest(REQUEST_ID);

      // EPIC-003 invariants — all unchanged:
      expect(mockAcceptEngagementRequest).toHaveBeenCalledOnce();           // status→accepted
      expect(mockAcceptEngagementRequest).toHaveBeenCalledWith(REQUEST_ID, MOCK_TICKET, null);
      expect(mockRecordAuthEvent).toHaveBeenCalledOnce();                   // audit row
      expect(mockEmailSend).toHaveBeenCalledOnce();                         // invitation email
      const sentMessage = mockEmailSend.mock.calls[0]?.[0];
      expect(sentMessage?.to).toBe(PROSPECT_EMAIL);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.emailSent).toBe(true);
      }

      // TASK-005-003 addition — createEngagement also called:
      expect(mockCreateEngagement).toHaveBeenCalledOnce();
    });
  });
});

// ─── declineRequest tests ─────────────────────────────────────────────────────

describe("declineRequest", () => {
  const DECLINE_REASON = "Our services do not currently match your needs.";

  // ── AC-DOOR-006-03 ────────────────────────────────────────────────────────
  describe("[AC-DOOR-006-03] decline moves the request to declined", () => {
    it("[AC-DOOR-006-03] calls declineEngagementRequest with the request ID and reason", async () => {
      const result = await declineRequest(REQUEST_ID, DECLINE_REASON);

      expect(mockDeclineEngagementRequest).toHaveBeenCalledOnce();
      expect(mockDeclineEngagementRequest).toHaveBeenCalledWith(REQUEST_ID, DECLINE_REASON, null);
      expect(result.success).toBe(true);
    });
  });

  // ── AC-DOOR-006-04 ────────────────────────────────────────────────────────
  describe("[AC-DOOR-006-04] only ACCOUNTANT can decline", () => {
    it("[AC-DOOR-006-04] returns { success: false } when identity is null (unauthenticated)", async () => {
      mockGetIdentity.mockResolvedValue(null);

      const result = await declineRequest(REQUEST_ID, DECLINE_REASON);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toMatch(/unauthorized/i);
      }
      expect(mockDeclineEngagementRequest).not.toHaveBeenCalled();
      expect(mockEmailSend).not.toHaveBeenCalled();
      expect(mockRecordAuthEvent).not.toHaveBeenCalled();
    });

    it("[AC-DOOR-006-04] returns { success: false } when role is CLIENT (not ACCOUNTANT)", async () => {
      mockGetIdentity.mockResolvedValue(CLIENT_IDENTITY);

      const result = await declineRequest(REQUEST_ID, DECLINE_REASON);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toMatch(/unauthorized/i);
      }
      expect(mockDeclineEngagementRequest).not.toHaveBeenCalled();
    });
  });

  // ── AC-DOOR-006-05 ────────────────────────────────────────────────────────
  describe("[AC-DOOR-006-05] decide-exactly-once — second decline is rejected", () => {
    it("[AC-DOOR-006-05] returns { success: false, error: 'already_decided' } when repo throws AlreadyDecidedError", async () => {
      mockDeclineEngagementRequest.mockRejectedValue(new MockAlreadyDecidedError(REQUEST_ID));

      const result = await declineRequest(REQUEST_ID, DECLINE_REASON);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("already_decided");
      }
      expect(mockEmailSend).not.toHaveBeenCalled();
    });
  });

  // ── AC-DOOR-008-01 ────────────────────────────────────────────────────────
  describe("[AC-DOOR-008-01] decline captures a free-text reason", () => {
    it("[AC-DOOR-008-01] accepts a non-empty reason and passes it to the repo", async () => {
      await declineRequest(REQUEST_ID, DECLINE_REASON);

      expect(mockDeclineEngagementRequest).toHaveBeenCalledWith(REQUEST_ID, DECLINE_REASON, null);
    });

    it("[AC-DOOR-008-01] returns { success: false } when reason is empty (input validation)", async () => {
      const result = await declineRequest(REQUEST_ID, "");

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toMatch(/reason.*required|required.*reason/i);
      }
      expect(mockDeclineEngagementRequest).not.toHaveBeenCalled();
    });

    it("[AC-DOOR-008-01] returns { success: false } when reason is whitespace-only", async () => {
      const result = await declineRequest(REQUEST_ID, "   ");

      expect(result.success).toBe(false);
      expect(mockDeclineEngagementRequest).not.toHaveBeenCalled();
    });
  });

  // ── AC-DOOR-008-02 / AC-DOOR-008-03 ──────────────────────────────────────
  describe("[AC-DOOR-008-02/-03] reason emailed to the accountless prospect", () => {
    it("[AC-DOOR-008-02] emailProvider.send() is called with the prospect's contact email", async () => {
      await declineRequest(REQUEST_ID, DECLINE_REASON);

      expect(mockEmailSend).toHaveBeenCalledOnce();
      const sentMessage = mockEmailSend.mock.calls[0]?.[0];
      // AC-DOOR-008-02: reason sent to the prospect's contact email
      expect(sentMessage?.to).toBe(PROSPECT_EMAIL);
    });

    it("[AC-DOOR-008-03] email body contains the decline reason (prospect has no account — plain email)", async () => {
      await declineRequest(REQUEST_ID, DECLINE_REASON);

      const sentMessage = mockEmailSend.mock.calls[0]?.[0];
      // AC-DOOR-008-03: prospect receives explanation without needing a portal account
      expect(sentMessage?.text).toContain(DECLINE_REASON);
    });

    it("[AC-DOOR-008-03] no account is required — email is sent to the prospect's contact email only", async () => {
      // This test verifies the design: the email goes to the contact email on the
      // EngagementRequest (not to any portal user account email). The prospect has
      // no account (AC-DOOR-008-03 — they are still a prospect at this point).
      await declineRequest(REQUEST_ID, DECLINE_REASON);

      const sentMessage = mockEmailSend.mock.calls[0]?.[0];
      expect(sentMessage?.to).toBe(PROSPECT_EMAIL); // contact email from the request
      // The mock getEngagementRequest returned { email: PROSPECT_EMAIL } — this is the
      // contact email the prospect provided when submitting the request (no account exists).
    });
  });

  // ── AC-DOOR-008-04 ────────────────────────────────────────────────────────
  describe("[AC-DOOR-008-04] decline reason retained on the request", () => {
    it("[AC-DOOR-008-04] declineEngagementRequest is called with the exact reason text", async () => {
      const specificReason = "We are not currently accepting new clients in this service area.";

      await declineRequest(REQUEST_ID, specificReason);

      expect(mockDeclineEngagementRequest).toHaveBeenCalledWith(REQUEST_ID, specificReason, null);
    });

    it("[AC-DOOR-008-04] reason is trimmed before persistence (whitespace stripped)", async () => {
      const paddedReason = "  Unable to assist at this time.  ";

      await declineRequest(REQUEST_ID, paddedReason);

      // Reason should be trimmed before passing to the repo
      expect(mockDeclineEngagementRequest).toHaveBeenCalledWith(
        REQUEST_ID,
        "Unable to assist at this time.",
        null,
      );
    });
  });

  // ── Audit (ADR-019) ───────────────────────────────────────────────────────
  describe("[ADR-019] audit row written on decline", () => {
    it("[ADR-019] recordAuthEvent called with action engagement_request.declined", async () => {
      await declineRequest(REQUEST_ID, DECLINE_REASON);

      expect(mockRecordAuthEvent).toHaveBeenCalledOnce();
      const auditArg = mockRecordAuthEvent.mock.calls[0]?.[0];
      expect(auditArg?.action).toBe("engagement_request.declined");
      expect(auditArg?.targetType).toBe("EngagementRequest");
      expect(auditArg?.targetId).toBe(REQUEST_ID);
      expect(auditArg?.sourceSurface).toBe("admin");
      expect(auditArg?.actor.clerkUserId).toBe(ACCOUNTANT_IDENTITY.clerkUserId);
      expect(auditArg?.actor.role).toBe("ACCOUNTANT");
    });

    it("[ADR-019] audit is NOT written when the identity guard rejects", async () => {
      mockGetIdentity.mockResolvedValue(null);

      await declineRequest(REQUEST_ID, DECLINE_REASON);

      expect(mockRecordAuthEvent).not.toHaveBeenCalled();
    });
  });

  // ── ADR-022: Rate limiting ─────────────────────────────────────────────────
  describe("[ADR-022] outbound decline email is rate-limited", () => {
    it("[ADR-022] when rate limit is exhausted, decision is committed but decline email is NOT sent", async () => {
      mockRateLimiterConsume.mockReturnValue({
        allowed: false,
        retryAfterMs: 45_000,
      });

      const result = await declineRequest(REQUEST_ID, DECLINE_REASON);

      // The decision IS committed
      expect(mockDeclineEngagementRequest).toHaveBeenCalledOnce();

      // But the email was suppressed
      expect(mockEmailSend).not.toHaveBeenCalled();

      // Partial success result
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.emailSent).toBe(false);
        if (!result.emailSent) {
          expect(result.emailError).toMatch(/rate limited/i);
        }
      }
    });
  });
});
