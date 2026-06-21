/**
 * apps/portal/src/app/(dev)/dev-sign-in/actions.test.ts
 *
 * Unit/integration tests for the dev sign-in lane core (TASK-009-001).
 *
 * Covers:
 *   AC-AUTH-013-01: After sign-in the user reaches the role-appropriate surface
 *     without manual navigation (landing URL = correct app for the chosen role).
 *
 * Tests:
 *   1. Lane lists the seeded accountant and seeded clients (via DEMO_ACCOUNTS manifest).
 *   2. Selecting the Accountant → establishes a session whose role=ACCOUNTANT (server-resolved)
 *      and returns landing target = apps/admin.                    [AC-AUTH-013-01]
 *   3. Selecting a seeded Client → establishes role=CLIENT (server-resolved)
 *      and returns landing target = /dashboard (portal).           [AC-AUTH-013-01]
 *   4. The browser cannot influence the established role — only accountId crosses
 *      the boundary; the role is derived server-side.              [AC-AUTH-013-01]
 *   5. Seeded-account resolution goes through the manifest (dev-only DECISION, CS-TS-001).
 *
 * No real auth, no real DB, no Next.js runtime.
 * All external seams are mocked:
 *   - @tax-portal/auth: createMockSessionCookie stub, MOCK_SESSION_COOKIE_NAME,
 *     getAdminAppUrl (returns test URL).
 *   - next/headers: cookies().set stub.
 *
 * Methodology: test-after, AC tags in titles (CS-GEN-003).
 *
 * // ADR-001 // ADR-005 // ADR-010 // CS-TS-001 // CS-TS-003 // CS-GEN-001 // CS-GEN-003
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Hoisted mock factories ────────────────────────────────────────────────────
// vi.hoisted() ensures these are initialized before any vi.mock() factory runs.

const { mockCreateMockSessionCookie, mockCookiesSet, mockGetAdminAppUrl } = vi.hoisted(
  () => {
    const mockCookiesSet = vi.fn();
    const mockCreateMockSessionCookie = vi.fn();
    const mockGetAdminAppUrl = vi.fn(() => "http://localhost:13001");
    return { mockCreateMockSessionCookie, mockCookiesSet, mockGetAdminAppUrl };
  },
);

// ─── Mocks ────────────────────────────────────────────────────────────────────

// @tax-portal/auth — mock cookie builder and URL helper
// CS-GEN-001: we never verify the cookie value is logged — the stub never produces a real value
vi.mock("@tax-portal/auth", () => ({
  createMockSessionCookie: mockCreateMockSessionCookie,
  MOCK_SESSION_COOKIE_NAME: "__mock_session",
  getAdminAppUrl: mockGetAdminAppUrl,
}));

// next/headers — mock cookie store (server-side cookies() API)
vi.mock("next/headers", () => ({
  cookies: () =>
    Promise.resolve({
      set: mockCookiesSet,
    }),
}));

// ─── Import AFTER mocks ────────────────────────────────────────────────────────

import { devSignInAsAccount, devSignOut } from "./actions";
import {
  DEMO_ACCOUNTS,
  findDemoAccount,
  getDemoAccountsByRole,
} from "./demo-accounts";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

/** A stub session cookie returned by the mocked createMockSessionCookie */
const STUB_SESSION_COOKIE = {
  name: "__mock_session",
  value: "stub-signed-session-value-[not-real]", // CS-GEN-001: stub value, never logged in prod
  httpOnly: true,
  secure: false,
  sameSite: "Lax" as const,
  path: "/",
  expires: new Date(Date.now() + 3_600_000),
};

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();

  // Default: mock AUTH_PROVIDER=mock (lane active)
  vi.stubEnv("AUTH_PROVIDER", "mock");

  // Default: createMockSessionCookie succeeds
  mockCreateMockSessionCookie.mockResolvedValue(STUB_SESSION_COOKIE);

  // Default: getAdminAppUrl returns test admin URL
  mockGetAdminAppUrl.mockReturnValue("http://localhost:13001");
});

// ─── 1. Manifest — seeded accounts ────────────────────────────────────────────

describe("DEMO_ACCOUNTS manifest (CS-TS-001 — dev-only manifest DECISION)", () => {
  it("contains at least one ACCOUNTANT account", () => {
    // The manifest must include the accountant (Jane) for the lane to function
    const { accountant } = getDemoAccountsByRole();
    expect(accountant.length).toBeGreaterThan(0);
    expect(accountant[0]?.role).toBe("ACCOUNTANT");
  });

  it("contains at least one CLIENT account", () => {
    const { clients } = getDemoAccountsByRole();
    expect(clients.length).toBeGreaterThan(0);
    clients.forEach((c) => expect(c.role).toBe("CLIENT"));
  });

  it("every account has a stable demo_ clerkUserId prefix (seed convention)", () => {
    // The seed uses "demo_" prefix for stable fake Clerk ids
    DEMO_ACCOUNTS.forEach((account) => {
      expect(account.clerkUserId).toMatch(/^demo_/);
    });
  });

  it("findDemoAccount returns undefined for an unknown accountId", () => {
    expect(findDemoAccount("unknown-account-xyz")).toBeUndefined();
  });

  it("findDemoAccount returns the correct account for a known accountId", () => {
    const account = findDemoAccount("accountant-jane");
    expect(account).toBeDefined();
    expect(account?.role).toBe("ACCOUNTANT");
  });

  it("dev sign-in lane lists the seeded accountant and seeded client(s) — manifest completeness", () => {
    // This is the "lane lists" test — verifies both roles present in the manifest
    // that the picker UI will render
    const { accountant, clients } = getDemoAccountsByRole();
    expect(accountant.length).toBeGreaterThanOrEqual(1);
    expect(clients.length).toBeGreaterThanOrEqual(1);
    // Verify all have required shape
    [...accountant, ...clients].forEach((a) => {
      expect(typeof a.accountId).toBe("string");
      expect(typeof a.clerkUserId).toBe("string");
      expect(["ACCOUNTANT", "CLIENT"]).toContain(a.role);
      expect(typeof a.displayName).toBe("string");
      expect(typeof a.email).toBe("string");
    });
  });
});

// ─── 2. Accountant sign-in → ACCOUNTANT session, admin landing ────────────────

describe("devSignInAsAccount — Accountant role (AC-AUTH-013-01)", () => {
  it(
    "[AC-AUTH-013-01] selecting the Accountant establishes a session whose role is ACCOUNTANT (server-resolved) and targets apps/admin",
    async () => {
      // GIVEN: lane is active under AUTH_PROVIDER=mock
      // WHEN: tester selects the accountant account
      const result = await devSignInAsAccount("accountant-jane");

      // THEN: success and landing URL points to admin surface
      expect(result.success).toBe(true);
      expect(result.redirectTo).toBeDefined();
      // ADR-010: ACCOUNTANT → apps/admin
      expect(result.redirectTo).toMatch(/^http:\/\/localhost:13001/);
      expect(result.error).toBeUndefined();
    },
  );

  it(
    "[AC-AUTH-013-01] createMockSessionCookie is called with the server-resolved ACCOUNTANT role (not client-supplied)",
    async () => {
      // D1 (ADR-005): role passed to createMockSessionCookie must be
      // the server-resolved role from the manifest, not any browser-supplied value
      await devSignInAsAccount("accountant-jane");

      expect(mockCreateMockSessionCookie).toHaveBeenCalledOnce();
      const callArgs = mockCreateMockSessionCookie.mock.calls[0]?.[0] as {
        clerkUserId: string;
        role: string;
      };
      expect(callArgs.role).toBe("ACCOUNTANT"); // server-resolved — ADR-005
      // clerkUserId is the manifest's value (server-resolved)
      expect(callArgs.clerkUserId).toBe("demo_usr_jane_accountant");
    },
  );

  it(
    "[AC-AUTH-013-01] session cookie is set server-side after ACCOUNTANT sign-in",
    async () => {
      await devSignInAsAccount("accountant-jane");

      // The signed cookie must be set via the server-side cookies() API
      expect(mockCookiesSet).toHaveBeenCalledOnce();
      const [cookieName, , cookieOpts] = mockCookiesSet.mock.calls[0] as [
        string,
        string,
        Record<string, unknown>,
      ];
      expect(cookieName).toBe("__mock_session");
      expect(cookieOpts["httpOnly"]).toBe(true);
      // CS-GEN-001: we never assert on cookie VALUE here — we assert shape/attributes only
    },
  );
});

// ─── 3. Client sign-in → CLIENT session, portal landing ──────────────────────

describe("devSignInAsAccount — Client role (AC-AUTH-013-01)", () => {
  it(
    "[AC-AUTH-013-01] selecting a seeded Client establishes a session whose role is CLIENT (server-resolved) and targets apps/portal",
    async () => {
      // GIVEN: lane is active under AUTH_PROVIDER=mock
      // WHEN: tester selects a client account
      const result = await devSignInAsAccount("client-margaret");

      // THEN: success and landing URL is the portal dashboard
      expect(result.success).toBe(true);
      expect(result.redirectTo).toBe("/dashboard"); // ADR-010: CLIENT → portal
      expect(result.error).toBeUndefined();
    },
  );

  it(
    "[AC-AUTH-013-01] createMockSessionCookie is called with the server-resolved CLIENT role",
    async () => {
      await devSignInAsAccount("client-margaret");

      expect(mockCreateMockSessionCookie).toHaveBeenCalledOnce();
      const callArgs = mockCreateMockSessionCookie.mock.calls[0]?.[0] as {
        clerkUserId: string;
        role: string;
      };
      expect(callArgs.role).toBe("CLIENT"); // server-resolved — ADR-005
      expect(callArgs.clerkUserId).toBe("demo_usr_margaret_okonkwo");
    },
  );

  it(
    "[AC-AUTH-013-01] each CLIENT account in the manifest yields role=CLIENT and portal landing",
    async () => {
      // CS-TS-003: all seeded clients must land on the portal
      const { clients } = getDemoAccountsByRole();
      for (const clientAccount of clients) {
        vi.clearAllMocks();
        mockCreateMockSessionCookie.mockResolvedValue(STUB_SESSION_COOKIE);

        const result = await devSignInAsAccount(clientAccount.accountId);
        expect(result.success).toBe(true);
        expect(result.redirectTo).toBe("/dashboard");

        const callArgs = mockCreateMockSessionCookie.mock.calls[0]?.[0] as {
          role: string;
        };
        expect(callArgs.role).toBe("CLIENT");
      }
    },
  );
});

// ─── 4. Browser cannot influence the established role (D1 / ADR-005) ─────────

describe("devSignInAsAccount — server-set role, no client-trusted path (D1 / ADR-005)", () => {
  it(
    "[AC-AUTH-013-01] the browser cannot influence the established role — only accountId crosses the boundary",
    async () => {
      // The action signature accepts only `accountId: string`.
      // A browser cannot send a role — the action has no role parameter.
      // We verify by asserting that the role in the cookie is ALWAYS the manifest's role.

      // Sign in as accountant — role must be ACCOUNTANT regardless
      await devSignInAsAccount("accountant-jane");
      const acctArgs = mockCreateMockSessionCookie.mock.calls[0]?.[0] as {
        role: string;
      };
      expect(acctArgs.role).toBe("ACCOUNTANT");

      vi.clearAllMocks();
      mockCreateMockSessionCookie.mockResolvedValue(STUB_SESSION_COOKIE);

      // Sign in as client — role must be CLIENT regardless
      await devSignInAsAccount("client-margaret");
      const clientArgs = mockCreateMockSessionCookie.mock.calls[0]?.[0] as {
        role: string;
      };
      expect(clientArgs.role).toBe("CLIENT");
    },
  );

  it(
    "[AC-AUTH-013-01] unknown accountId is rejected — no session is established for unknown accounts",
    async () => {
      // Attempting to sign in with a non-existent accountId (e.g. a forged one)
      // must fail cleanly without establishing any session.
      const result = await devSignInAsAccount("forged-account-role-CLIENT");

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      // No cookie was set — session is not established
      expect(mockCookiesSet).not.toHaveBeenCalled();
      // No createMockSessionCookie was called
      expect(mockCreateMockSessionCookie).not.toHaveBeenCalled();
    },
  );

  it(
    "empty accountId is rejected — no session established",
    async () => {
      const result = await devSignInAsAccount("");
      expect(result.success).toBe(false);
      expect(mockCreateMockSessionCookie).not.toHaveBeenCalled();
      expect(mockCookiesSet).not.toHaveBeenCalled();
    },
  );
});

// ─── 5. Inert under AUTH_PROVIDER=clerk (ADR-001 defense-in-depth) ────────────

describe("devSignInAsAccount — inert under AUTH_PROVIDER=clerk (ADR-001)", () => {
  it(
    "returns failure when AUTH_PROVIDER=clerk — action-level guard (defense-in-depth)",
    async () => {
      vi.stubEnv("AUTH_PROVIDER", "clerk");

      const result = await devSignInAsAccount("accountant-jane");

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      // No session established — defense-in-depth guard fires
      expect(mockCreateMockSessionCookie).not.toHaveBeenCalled();
      expect(mockCookiesSet).not.toHaveBeenCalled();
    },
  );
});

// ─── 6. Cross-surface parity (CS-TS-003) ──────────────────────────────────────

describe("devSignInAsAccount — cross-surface parity (CS-TS-003)", () => {
  it(
    "[CS-TS-003] signing in as accountant lands on admin surface — ACCOUNTANT → apps/admin",
    async () => {
      const result = await devSignInAsAccount("accountant-jane");
      expect(result.success).toBe(true);
      expect(result.redirectTo).toContain("13001"); // admin URL
    },
  );

  it(
    "[CS-TS-003] signing in as client lands on portal surface — CLIENT → /dashboard",
    async () => {
      const result = await devSignInAsAccount("client-rafael");
      expect(result.success).toBe(true);
      expect(result.redirectTo).toBe("/dashboard"); // portal URL
    },
  );

  it(
    "[CS-TS-003] both roles reachable from the same lane — at least one accountant AND one client in manifest",
    () => {
      // Proves that a tester can reach EITHER surface from the lane (CS-TS-003)
      const { accountant, clients } = getDemoAccountsByRole();
      expect(accountant.length).toBeGreaterThanOrEqual(1);
      expect(clients.length).toBeGreaterThanOrEqual(1);
    },
  );
});

// ─── 7. devSignOut ────────────────────────────────────────────────────────────

describe("devSignOut", () => {
  it("clears the mock session cookie when AUTH_PROVIDER=mock", async () => {
    await devSignOut();

    expect(mockCookiesSet).toHaveBeenCalledOnce();
    const [cookieName, cookieValue, cookieOpts] = mockCookiesSet.mock.calls[0] as [
      string,
      string,
      Record<string, unknown>,
    ];
    expect(cookieName).toBe("__mock_session");
    expect(cookieValue).toBe("");
    expect(cookieOpts["maxAge"]).toBe(0);
  });

  it("is a no-op when AUTH_PROVIDER=clerk", async () => {
    vi.stubEnv("AUTH_PROVIDER", "clerk");
    await devSignOut();
    // No cookie operations — sign-out is inert under the real provider
    expect(mockCookiesSet).not.toHaveBeenCalled();
  });
});

// ─── 8. createMockSessionCookie failure ───────────────────────────────────────

describe("devSignInAsAccount — error handling", () => {
  it("returns failure when createMockSessionCookie throws — no cookie set", async () => {
    mockCreateMockSessionCookie.mockRejectedValue(new Error("crypto unavailable"));

    const result = await devSignInAsAccount("accountant-jane");

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    // Cookie was never set — session not established
    expect(mockCookiesSet).not.toHaveBeenCalled();
  });
});
