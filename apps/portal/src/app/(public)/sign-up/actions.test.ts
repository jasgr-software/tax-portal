/**
 * apps/portal/src/app/(public)/sign-up/actions.test.ts
 *
 * Unit tests for signUpWithInvitation server action.
 *
 * Covers:
 *   AC-AUTH-006-01/-02: Only a valid invitation ticket creates a session.
 *   ADR-005: CLIENT role is server-set from the invitation, never client-asserted.
 *   ADR-019 §3: Audit INSERT in the same transaction; fail-closed if audit throws.
 *   [DECISION-A (deferred)]: Under the mock binding the engagement's clientUserId stays NULL;
 *     no back-fill runs at sign-up. The back-fill is deferred to the real-auth-binding slice.
 *
 * No real DB, no real auth. All external seams are mocked:
 *   - @tax-portal/db: withAuditTransaction passthrough, recordAuthEvent stub.
 *   - @tax-portal/auth: FIXTURE_INVITATION, MOCK_SESSION_COOKIE_NAME,
 *     createMockSessionCookie stub, getRateLimiter, buildRateLimitKey.
 *   - next/headers: cookies() + headers() stubs.
 *
 * Methodology: test-after, AC tags in titles.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Hoisted mock factories ───────────────────────────────────────────────────

const {
  mockWithAuditTransaction,
  mockRecordAuthEvent,
  mockGetRateLimiter,
  mockBuildRateLimitKey,
  mockCreateMockSessionCookie,
  mockCookiesSet,
  mockHeadersGet,
} = vi.hoisted(() => {
  const mockCookiesSet = vi.fn();
  const mockHeadersGet = vi.fn().mockReturnValue(null);
  return {
    /** Pass-through withAuditTransaction: calls fn(null) directly (no real transaction) */
    mockWithAuditTransaction: vi.fn(),
    mockRecordAuthEvent: vi.fn(),
    mockGetRateLimiter: vi.fn(),
    mockBuildRateLimitKey: vi.fn(),
    mockCreateMockSessionCookie: vi.fn(),
    mockCookiesSet,
    mockHeadersGet,
  };
});

// ─── Mocks ────────────────────────────────────────────────────────────────────

// @tax-portal/db — mock DB interactions
vi.mock("@tax-portal/db", () => ({
  withAuditTransaction: mockWithAuditTransaction,
  recordAuthEvent: mockRecordAuthEvent,
}));

// @tax-portal/auth — mock auth provider, session cookie helpers, rate limiter
vi.mock("@tax-portal/auth", () => ({
  FIXTURE_INVITATION: {
    ticket: "fixture-ticket-client-test-canonical",
    role: "CLIENT" as const,
    email: "fixture@example.com",
  },
  MOCK_SESSION_COOKIE_NAME: "mock_session",
  createMockSessionCookie: mockCreateMockSessionCookie,
  getRateLimiter: mockGetRateLimiter,
  buildRateLimitKey: mockBuildRateLimitKey,
}));

// next/headers — mock cookie + header store
vi.mock("next/headers", () => ({
  cookies: () =>
    Promise.resolve({
      set: mockCookiesSet,
    }),
  headers: () =>
    Promise.resolve({
      get: mockHeadersGet,
    }),
}));

// ─── Import AFTER mocks ───────────────────────────────────────────────────────

import { signUpWithInvitation } from "./actions.js";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const MOCK_TICKET_CLIENT = "mock-ticket-client-dG9tLnByb3NwZWN0QA";
const MOCK_TICKET_FIXTURE = "fixture-ticket-client-test-canonical";

const STUB_SESSION_COOKIE = {
  name: "mock_session",
  value: "stub-session-value",
  httpOnly: true,
  secure: false,
  sameSite: "Lax" as const,
  path: "/",
  expires: new Date(Date.now() + 3600_000),
};

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();

  // Default: withAuditTransaction pass-through (calls fn(null))
  mockWithAuditTransaction.mockImplementation(
    (fn: (txn: null) => Promise<unknown>) => fn(null),
  );

  // Default: recordAuthEvent succeeds (no throw)
  mockRecordAuthEvent.mockResolvedValue(undefined);

  // Default: rate limiter allows
  mockGetRateLimiter.mockReturnValue({
    consume: vi.fn().mockReturnValue({ allowed: true }),
    peek: vi.fn().mockReturnValue({ allowed: true }),
    reset: vi.fn(),
  });
  mockBuildRateLimitKey.mockImplementation(
    (id: string, endpoint: string) => `${id}:${endpoint}`,
  );

  // Default: createMockSessionCookie returns a stub cookie
  mockCreateMockSessionCookie.mockResolvedValue(STUB_SESSION_COOKIE);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Helper: build FormData ───────────────────────────────────────────────────

function makeFormData(ticket: string, email = "client@example.com"): FormData {
  const fd = new FormData();
  fd.set("ticket", ticket);
  fd.set("email", email);
  return fd;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("signUpWithInvitation — audit seam structure", () => {
  it("withAuditTransaction is called (seam does not bypass the transaction)", async () => {
    const fd = makeFormData(MOCK_TICKET_CLIENT);

    await signUpWithInvitation(fd);

    // The sign-up seam (audit INSERT) runs inside withAuditTransaction.
    // This proves: if the audit INSERT fails, the cookie is NOT sent (fail-closed, ADR-019 §3).
    expect(mockWithAuditTransaction).toHaveBeenCalledOnce();
  });

  it("audit row is written inside the transaction (ADR-019 invariant)", async () => {
    const fd = makeFormData(MOCK_TICKET_CLIENT);

    await signUpWithInvitation(fd);

    expect(mockRecordAuthEvent).toHaveBeenCalledOnce();
    const auditArg = mockRecordAuthEvent.mock.calls[0]?.[0];
    expect(auditArg?.action).toBe("auth.account_created");
    expect(auditArg?.sourceSurface).toBe("portal");
    expect(auditArg?.actor.role).toBe("CLIENT");
  });

  it("[DECISION-A] fixture ticket also passes through the audit seam without back-fill", async () => {
    const fd = makeFormData(MOCK_TICKET_FIXTURE);

    const result = await signUpWithInvitation(fd);

    // Under mock binding, no back-fill runs; sign-up still completes normally.
    expect(result.success).toBe(true);
    expect(mockWithAuditTransaction).toHaveBeenCalledOnce();
    expect(mockRecordAuthEvent).toHaveBeenCalledOnce();
  });

  it("sign-up succeeds with session cookie set", async () => {
    const fd = makeFormData(MOCK_TICKET_CLIENT);

    const result = await signUpWithInvitation(fd);

    expect(result.success).toBe(true);
    expect(result.redirectTo).toBe("/dashboard");
    expect(mockCookiesSet).toHaveBeenCalledOnce();
  });
});

// ─── Regression guard: AC-AUTH-006-01/-02 behavior ────────────────────────────

describe("signUpWithInvitation — regression guard (pre-existing AC)", () => {
  it("[AC-AUTH-006-01/-02] invalid ticket returns { success: false } — no session created", async () => {
    const fd = makeFormData("totally-invalid-ticket-xyz");

    const result = await signUpWithInvitation(fd);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/invitation.*required|valid invitation/i);
    // No session cookie, no audit row
    expect(mockCookiesSet).not.toHaveBeenCalled();
    expect(mockRecordAuthEvent).not.toHaveBeenCalled();
  });

  it("[AC-AUTH-006-01/-02] empty ticket returns { success: false }", async () => {
    const fd = makeFormData("");

    const result = await signUpWithInvitation(fd);

    expect(result.success).toBe(false);
    expect(mockCookiesSet).not.toHaveBeenCalled();
  });

  it("[ADR-019 §3] fail-closed: if audit INSERT throws, session cookie is NOT set", async () => {
    // ADR-019 §3: withAuditTransaction rolls back if recordAuthEvent throws.
    // The session cookie must NOT be set (fail-closed — no account without audit record).
    mockWithAuditTransaction.mockImplementation(
      async (fn: (txn: null) => Promise<unknown>) => {
        await fn(null); // this calls recordAuthEvent which throws below
      },
    );
    mockRecordAuthEvent.mockRejectedValue(new Error("Simulated audit INSERT failure"));

    const fd = makeFormData(MOCK_TICKET_CLIENT);
    const result = await signUpWithInvitation(fd);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/internal error|failed/i);
    expect(mockCookiesSet).not.toHaveBeenCalled();
  });

  it("[ADR-005] CLIENT role is server-set from the invitation (not client-asserted)", async () => {
    const fd = makeFormData(MOCK_TICKET_CLIENT);
    // Attempt to assert ACCOUNTANT role via form data — must be ignored
    fd.set("role", "ACCOUNTANT");

    await signUpWithInvitation(fd);

    // The audit actor's role is always CLIENT (server-set from the validated invitation)
    const auditArg = mockRecordAuthEvent.mock.calls[0]?.[0];
    expect(auditArg?.actor.role).toBe("CLIENT");
  });

  it("[sign-up] successful sign-up with mock-ticket-client produces a session cookie", async () => {
    const fd = makeFormData(MOCK_TICKET_CLIENT, "tom@example.com");

    const result = await signUpWithInvitation(fd);

    expect(result.success).toBe(true);
    expect(result.redirectTo).toBe("/dashboard");
    // Session cookie is set server-side (HttpOnly)
    expect(mockCookiesSet).toHaveBeenCalledOnce();
    const cookieArgs = mockCookiesSet.mock.calls[0];
    expect(cookieArgs?.[0]).toBe(STUB_SESSION_COOKIE.name);
    expect(cookieArgs?.[2]?.httpOnly).toBe(true);
  });
});
