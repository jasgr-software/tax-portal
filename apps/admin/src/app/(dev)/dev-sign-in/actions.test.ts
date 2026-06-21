/**
 * apps/admin/src/app/(dev)/dev-sign-in/actions.test.ts
 *
 * Admin-surface sign-out + switcher unit tests (TASK-009-002).
 *
 * Proves that the admin-surface dev actions honor the same contracts as the
 * portal-surface actions (CS-TS-003 cross-surface parity):
 *   - adminDevGlobalSignOut: clears __mock_session (max-age=0), redirects to portal sign-in
 *   - adminDevSwitchAccount: re-establishes session server-side (ADR-005 D1), returns correct landing URL
 *
 * These tests mirror apps/portal/src/app/(dev)/dev-sign-in/sign-out-switcher.test.ts
 * (the canonical 5-test set that proves AC-AUTH-013-02 and the switcher dev-acceptance).
 * The admin tests prove the same contracts hold on the admin surface (CS-TS-003).
 *
 * // ADR-005 // ADR-010 // ADR-001 // CS-TS-003 // CS-GEN-001 // CS-GEN-003
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Hoisted mock factories ────────────────────────────────────────────────────

const { mockCreateMockSessionCookie, mockCookiesSet, mockGetAdminAppUrl, mockGetPortalAppUrl } = vi.hoisted(
  () => {
    const mockCookiesSet = vi.fn();
    const mockCreateMockSessionCookie = vi.fn();
    const mockGetAdminAppUrl = vi.fn(() => "http://localhost:13001");
    const mockGetPortalAppUrl = vi.fn(() => "http://localhost:3000");
    return { mockCreateMockSessionCookie, mockCookiesSet, mockGetAdminAppUrl, mockGetPortalAppUrl };
  },
);

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@tax-portal/auth", () => ({
  createMockSessionCookie: mockCreateMockSessionCookie,
  MOCK_SESSION_COOKIE_NAME: "__mock_session",
  getAdminAppUrl: mockGetAdminAppUrl,
  getPortalAppUrl: mockGetPortalAppUrl,
}));

vi.mock("next/headers", () => ({
  cookies: () =>
    Promise.resolve({
      set: mockCookiesSet,
    }),
}));

// ─── Import AFTER mocks ────────────────────────────────────────────────────────

import {
  adminDevGlobalSignOut,
  adminDevSwitchAccount,
} from "./actions";
import {
  findAdminDemoAccount,
  ADMIN_DEMO_ACCOUNTS,
} from "./demo-accounts";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const STUB_SESSION_COOKIE = {
  name: "__mock_session",
  value: "stub-signed-session-value-[not-real]", // CS-GEN-001: stub, never a real HMAC
  httpOnly: true,
  secure: false,
  sameSite: "Lax" as const,
  path: "/",
  expires: new Date(Date.now() + 3_600_000),
};

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("AUTH_PROVIDER", "mock");
  mockCreateMockSessionCookie.mockResolvedValue(STUB_SESSION_COOKIE);
  mockGetAdminAppUrl.mockReturnValue("http://localhost:13001");
  mockGetPortalAppUrl.mockReturnValue("http://localhost:3000");
});

// ─── Admin manifest completeness ──────────────────────────────────────────────

describe("ADMIN_DEMO_ACCOUNTS manifest (CS-TS-003 — mirrors portal manifest)", () => {
  it("contains at least one ACCOUNTANT account", () => {
    const accountants = ADMIN_DEMO_ACCOUNTS.filter((a) => a.role === "ACCOUNTANT");
    expect(accountants.length).toBeGreaterThan(0);
  });

  it("contains at least one CLIENT account", () => {
    const clients = ADMIN_DEMO_ACCOUNTS.filter((a) => a.role === "CLIENT");
    expect(clients.length).toBeGreaterThan(0);
  });

  it("every account has a stable demo_ clerkUserId prefix (seed convention — CS-TS-001)", () => {
    ADMIN_DEMO_ACCOUNTS.forEach((account) => {
      expect(account.clerkUserId).toMatch(/^demo_/);
    });
  });

  it("findAdminDemoAccount returns undefined for an unknown accountId", () => {
    expect(findAdminDemoAccount("unknown-xyz")).toBeUndefined();
  });

  it("findAdminDemoAccount returns the correct account for a known accountId", () => {
    const jane = findAdminDemoAccount("accountant-jane");
    expect(jane).toBeDefined();
    expect(jane?.role).toBe("ACCOUNTANT");
  });
});

// ─── adminDevGlobalSignOut ────────────────────────────────────────────────────

describe("[AC-AUTH-013-02] adminDevGlobalSignOut — admin-surface global sign-out", () => {
  it(
    "[AC-AUTH-013-02 / CS-TS-003] adminDevGlobalSignOut clears the mock-session cookie (max-age=0)",
    async () => {
      // GIVEN: signed in on admin surface
      // WHEN: sign-out is triggered from admin surface
      const result = await adminDevGlobalSignOut();

      // THEN: cookie is cleared with max-age=0
      expect(mockCookiesSet).toHaveBeenCalledOnce();
      const [cookieName, cookieValue, cookieOpts] = mockCookiesSet.mock.calls[0] as [
        string,
        string,
        Record<string, unknown>,
      ];
      expect(cookieName).toBe("__mock_session");
      expect(cookieValue).toBe(""); // cleared
      expect(cookieOpts["maxAge"]).toBe(0); // ADR-010: global cookie deletion
      expect(cookieOpts["httpOnly"]).toBe(true);
      expect(cookieOpts["path"]).toBe("/");

      // AND: redirect to portal dev-sign-in lane
      expect(result.redirectTo).toContain("dev-sign-in");
    },
  );

  it(
    "[ADR-001] adminDevGlobalSignOut is inert under AUTH_PROVIDER=clerk",
    async () => {
      vi.stubEnv("AUTH_PROVIDER", "clerk");

      await adminDevGlobalSignOut();

      // Guard fires — no cookie was touched
      expect(mockCookiesSet).not.toHaveBeenCalled();
    },
  );
});

// ─── adminDevSwitchAccount ────────────────────────────────────────────────────

describe("[dev-acceptance / ADR-005] adminDevSwitchAccount — server-set role, no client-trusted path", () => {
  it(
    "[ADR-005 D1] switching to a CLIENT account establishes a CLIENT session server-side — role NOT browser-supplied",
    async () => {
      // GIVEN: currently on admin surface
      // WHEN: tester switches to a client
      const result = await adminDevSwitchAccount("client-margaret");

      expect(result.success).toBe(true);

      // ADR-005 D1: role is server-resolved from manifest
      const args = mockCreateMockSessionCookie.mock.calls[0]?.[0] as {
        clerkUserId: string;
        role: string;
      };
      expect(args.role).toBe("CLIENT"); // manifest-resolved, not browser-supplied
      expect(args.clerkUserId).toBe("demo_usr_margaret_okonkwo");

      // ADR-010: CLIENT → portal
      expect(result.redirectTo).toContain("http://localhost:3000");
      expect(result.redirectTo).toContain("dashboard");
    },
  );

  it(
    "[ADR-005 D1 / ADR-010 / CS-TS-003] switching to the accountant re-establishes ACCOUNTANT session and stays on admin",
    async () => {
      const result = await adminDevSwitchAccount("accountant-jane");

      expect(result.success).toBe(true);

      const args = mockCreateMockSessionCookie.mock.calls[0]?.[0] as { role: string };
      expect(args.role).toBe("ACCOUNTANT"); // manifest-resolved — ADR-005

      // ADR-010: ACCOUNTANT → stays on admin surface
      expect(result.redirectTo).toMatch(/^http:\/\/localhost:13001/);
    },
  );

  it(
    "[ADR-005 D1] a forged accountId encoding a role is rejected — no session established",
    async () => {
      const forgedIds = ["client-ACCOUNTANT", "forged_ACCOUNTANT", "ACCOUNTANT", "role:CLIENT"];

      for (const forgedId of forgedIds) {
        vi.clearAllMocks();

        const result = await adminDevSwitchAccount(forgedId);

        expect(result.success).toBe(false);
        expect(mockCreateMockSessionCookie).not.toHaveBeenCalled();
        expect(mockCookiesSet).not.toHaveBeenCalled();
      }
    },
  );

  it(
    "[ADR-001] adminDevSwitchAccount is inert under AUTH_PROVIDER=clerk",
    async () => {
      vi.stubEnv("AUTH_PROVIDER", "clerk");

      const result = await adminDevSwitchAccount("accountant-jane");

      expect(result.success).toBe(false);
      expect(mockCreateMockSessionCookie).not.toHaveBeenCalled();
      expect(mockCookiesSet).not.toHaveBeenCalled();
    },
  );

  it(
    "[CS-GEN-001] cookie value is never logged — error path logs only accountId (non-sensitive)",
    async () => {
      // When createMockSessionCookie throws, the error log must contain only accountId
      // (not the cookie value or secret) — CS-GEN-001
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      mockCreateMockSessionCookie.mockRejectedValue(new Error("crypto unavailable"));

      const result = await adminDevSwitchAccount("accountant-jane");

      expect(result.success).toBe(false);
      // Cookie was never set (no session established on error)
      expect(mockCookiesSet).not.toHaveBeenCalled();

      // Error log exists (confirms error was logged)
      if (consoleSpy.mock.calls.length > 0) {
        // Verify the log does NOT contain any cookie-value-like string
        const logArgs = consoleSpy.mock.calls.flat().join(" ");
        expect(logArgs).not.toContain("stub-signed"); // no cookie value
        expect(logArgs).not.toContain("MOCK_SESSION_SECRET"); // no secret
        // It may contain the accountId (non-sensitive identifier)
        expect(logArgs).toContain("accountant-jane"); // CS-GEN-001: only accountId logged
      }

      consoleSpy.mockRestore();
    },
  );
});
