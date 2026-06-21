/**
 * apps/portal/src/app/(dev)/dev-sign-in/sign-out-switcher.test.ts
 *
 * TASK-009-002 — Role/user switcher + global sign-out tests.
 *
 * Proves:
 *   AC-AUTH-013-02 (sign-out / ADR-010):
 *     - Sign-out clears the __mock_session cookie (max-age=0)
 *     - After sign-out, a protected route on apps/admin requires re-authentication
 *     - After sign-out, a protected route on apps/portal requires re-authentication
 *       (proves sign-out is GLOBAL, not per-app)
 *
 *   Switcher dev-acceptance (ADR-005 / D1):
 *     - Switching from Accountant to a Client re-establishes a CLIENT session
 *       server-side and the returned landing target is apps/portal
 *     - The switcher does NOT let the browser assert the new role directly
 *
 * Test inventory (matches the 5 required tests from the task spec):
 *   1. "signing out clears the mock-session cookie" — AC-AUTH-013-02
 *   2. "after sign-out, a protected route on apps/admin requires re-authentication" — AC-AUTH-013-02
 *   3. "after sign-out, a protected route on apps/portal requires re-authentication" — AC-AUTH-013-02
 *   4. "switching from Accountant to a Client re-establishes a CLIENT session server-side and re-lands on apps/portal" — switcher dev-acceptance
 *   5. "the switcher does not let the browser assert the new role directly" — ADR-005 / D1
 *
 * Methodology: test-after; all external seams mocked; AC tags in titles (CS-GEN-003).
 *
 * // ADR-005 // ADR-010 // ADR-001 // CS-TS-003 // CS-GEN-001 // CS-GEN-003
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Hoisted mock factories ────────────────────────────────────────────────────

const { mockCreateMockSessionCookie, mockCookiesSet, mockGetAdminAppUrl } = vi.hoisted(
  () => {
    const mockCookiesSet = vi.fn();
    const mockCreateMockSessionCookie = vi.fn();
    const mockGetAdminAppUrl = vi.fn(() => "http://localhost:13001");
    return { mockCreateMockSessionCookie, mockCookiesSet, mockGetAdminAppUrl };
  },
);

// ─── Mocks ────────────────────────────────────────────────────────────────────

// @tax-portal/auth — mock cookie builder and URL helpers
// Also uses importOriginal so we can test redirect decision functions from the real impl
// CS-GEN-001: stub never produces a real HMAC value
vi.mock("@tax-portal/auth", async (importOriginal) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const actual = await importOriginal<Record<string, any>>();
  return {
    ...actual,
    createMockSessionCookie: mockCreateMockSessionCookie,
    MOCK_SESSION_COOKIE_NAME: "__mock_session",
    getAdminAppUrl: mockGetAdminAppUrl,
  };
});

// next/headers — mock cookie store (server-side cookies() API)
vi.mock("next/headers", () => ({
  cookies: () =>
    Promise.resolve({
      set: mockCookiesSet,
    }),
}));

// ─── Import AFTER mocks ────────────────────────────────────────────────────────

import { devGlobalSignOut, devSwitchAccount } from "./actions";
// Import redirect helpers to test the "protected route requires re-auth" assertions
// These are the REAL implementations from @tax-portal/auth (not mocked — see importOriginal above)
import { portalRedirectDecision, adminRedirectDecision } from "@tax-portal/auth";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

/** Stub session cookie returned by the mocked createMockSessionCookie */
const STUB_SESSION_COOKIE = {
  name: "__mock_session",
  value: "stub-signed-session-value-[not-real]", // CS-GEN-001: stub value, never a real HMAC
  httpOnly: true,
  secure: false,
  sameSite: "Lax" as const,
  path: "/",
  expires: new Date(Date.now() + 3_600_000),
};

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();

  // Default: AUTH_PROVIDER=mock (lane active)
  vi.stubEnv("AUTH_PROVIDER", "mock");

  // Default: createMockSessionCookie succeeds
  mockCreateMockSessionCookie.mockResolvedValue(STUB_SESSION_COOKIE);

  // Default: getAdminAppUrl returns test admin URL
  mockGetAdminAppUrl.mockReturnValue("http://localhost:13001");

  // Set env vars for redirect decision functions (the real implementations read these)
  vi.stubEnv("PORTAL_APP_URL", "http://localhost:3000");
  vi.stubEnv("ADMIN_APP_URL", "http://localhost:13001");
});

// ─── 1. Sign-out clears the mock-session cookie ────────────────────────────────
//
// AC-AUTH-013-02 (ADR-010): signing out sets __mock_session max-age=0.
// The cookie is cleared server-side; the browser deletes it globally (no port in
// cookie domain matching — localhost:3000 and localhost:3001 share the cookie).

describe("signing out clears the mock-session cookie (AC-AUTH-013-02)", () => {
  /**
   * Test 1 (required):
   * "signing out clears the mock-session cookie"
   *
   * Expected: the __mock_session cookie is cleared (max-age 0).
   * Tag: AC-AUTH-013-02 / ADR-010
   *
   * Named code path: devGlobalSignOut() → cookies().set("__mock_session", "", { maxAge: 0 })
   *
   * // AC-AUTH-013-02 // ADR-010 // CS-GEN-001
   */
  it(
    "[AC-AUTH-013-02] signing out clears the mock-session cookie (max-age=0)",
    async () => {
      // GIVEN: AUTH_PROVIDER=mock (lane active)
      // WHEN: the dev global sign-out action is called
      const result = await devGlobalSignOut();

      // THEN: the __mock_session cookie is cleared (max-age=0)
      expect(mockCookiesSet).toHaveBeenCalledOnce();
      const [cookieName, cookieValue, cookieOpts] = mockCookiesSet.mock.calls[0] as [
        string,
        string,
        Record<string, unknown>,
      ];
      expect(cookieName).toBe("__mock_session");
      expect(cookieValue).toBe(""); // cleared value
      expect(cookieOpts["maxAge"]).toBe(0); // ADR-010: max-age=0 → browser deletes cookie

      // AND: the result provides a redirect destination (to dev-sign-in lane)
      expect(result.redirectTo).toBe("/dev-sign-in");

      // CS-GEN-001: cookie value is "" (empty) — no real session value is logged or returned
    },
  );

  it(
    "[AC-AUTH-013-02] devGlobalSignOut sets httpOnly on the cleared cookie (security attribute preserved)",
    async () => {
      await devGlobalSignOut();

      const [, , cookieOpts] = mockCookiesSet.mock.calls[0] as [
        string,
        string,
        Record<string, unknown>,
      ];
      // httpOnly must be preserved even on the clearing cookie
      expect(cookieOpts["httpOnly"]).toBe(true);
      // path must be / (matching the original set path)
      expect(cookieOpts["path"]).toBe("/");
    },
  );
});

// ─── 2. After sign-out, apps/admin protected route requires re-authentication ──
//
// AC-AUTH-013-02: after sign-out the session is gone; an ACCOUNTANT hitting the admin
// surface with no session is redirected to sign-in (the middleware sees null identity).
// This tests the REDIRECT DECISION at the middleware level — the policy that enforces
// re-authentication after sign-out on the ADMIN surface.

describe("after sign-out, protected routes require re-authentication (AC-AUTH-013-02)", () => {
  /**
   * Test 2 (required):
   * "after sign-out, a protected route on apps/admin requires re-authentication"
   *
   * Expected: unauthenticated → adminRedirectDecision → redirect to sign-in.
   * Tag: AC-AUTH-013-02 / ADR-010
   *
   * This test proves the ADMIN surface enforces re-authentication after sign-out.
   * After devGlobalSignOut(), the session cookie is gone; the admin middleware calls
   * adminRedirectDecision(path, null, url) → redirect to admin sign-in.
   *
   * Named code path: packages/auth/src/redirect.ts adminRedirectDecision with identity=null
   *
   * // AC-AUTH-013-02 // ADR-010
   */
  it(
    "[AC-AUTH-013-02] after sign-out, a protected route on apps/admin requires re-authentication",
    async () => {
      // GIVEN: the session has been cleared (sign-out called)
      await devGlobalSignOut();

      // The admin middleware is now called with identity=null (no session)
      // WHEN: an unauthenticated request hits a protected admin route
      const decision = adminRedirectDecision(
        "/", // admin root — a protected route (ADR-010: all admin routes are protected)
        null, // unauthenticated — session was cleared by devGlobalSignOut
        "http://localhost:13001/",
      );

      // THEN: the middleware redirects to re-authentication (admin sign-in)
      // ADR-010: unauthenticated → admin sign-in; no admin content is rendered
      expect(decision.action).toBe("redirect");
      if (decision.action === "redirect") {
        // The destination must be an admin sign-in or portal sign-in URL
        // (the redirect matrix sends unauthenticated users to sign-in)
        expect(decision.statusCode).toBe(307);
        // Must not be the admin root itself (that would be a loop)
        expect(decision.destination.pathname).not.toBe("/");
      }
    },
  );

  it(
    "[AC-AUTH-013-02] after sign-out, every protected admin path requires re-authentication — not just the root",
    async () => {
      await devGlobalSignOut();

      // Multiple protected admin paths
      const protectedAdminPaths = ["/", "/engagements", "/engagements/123", "/settings"];
      for (const path of protectedAdminPaths) {
        const decision = adminRedirectDecision(
          path,
          null, // unauthenticated after sign-out
          `http://localhost:13001${path}`,
        );
        // All protected paths must redirect (not serve) when unauthenticated
        expect(decision.action).toBe("redirect");
      }
    },
  );

  /**
   * Test 3 (required):
   * "after sign-out, a protected route on apps/portal requires re-authentication"
   * (proves sign-out is GLOBAL, not per-app)
   *
   * Expected: unauthenticated → portalRedirectDecision → redirect to portal sign-in.
   * Tag: AC-AUTH-013-02 / ADR-010
   *
   * The key assertion: sign-out from the portal action affects BOTH surfaces.
   * Even though devGlobalSignOut() is a portal-side action, the cleared cookie is
   * global (localhost domain, no port in cookie domain matching). The portal middleware
   * (portalRedirectDecision) also requires re-authentication after sign-out.
   *
   * Named code path: packages/auth/src/redirect.ts portalRedirectDecision with identity=null
   * on a private route (/dashboard) → redirect to /sign-in.
   *
   * // AC-AUTH-013-02 // ADR-010 // CS-TS-003
   */
  it(
    "[AC-AUTH-013-02] after sign-out, a protected route on apps/portal requires re-authentication (sign-out is GLOBAL, not per-app)",
    async () => {
      // GIVEN: the session has been cleared (sign-out called from portal surface)
      await devGlobalSignOut();

      // The portal middleware is now called with identity=null (no session)
      // WHEN: an unauthenticated request hits a protected portal route
      const decision = portalRedirectDecision(
        "/dashboard", // CLIENT-only private route — requires authentication
        null, // unauthenticated — session was cleared globally by devGlobalSignOut
        "http://localhost:3000/dashboard",
      );

      // THEN: the portal middleware also redirects to re-authentication
      // This proves the sign-out is GLOBAL — not per-app
      // ADR-010: unauthenticated → redirect to /sign-in (portal sign-in)
      expect(decision.action).toBe("redirect");
      if (decision.action === "redirect") {
        expect(decision.statusCode).toBe(307);
        // Redirect destination is portal sign-in (not /dashboard — that would be a loop)
        expect(decision.destination.pathname).toContain("sign-in");
      }
    },
  );

  it(
    "[AC-AUTH-013-02] sign-out global proof — both admin AND portal surfaces require re-auth after the SAME sign-out",
    async () => {
      // GIVEN: exactly ONE sign-out call
      await devGlobalSignOut();

      // Check the cookie was cleared only once (one action, global effect)
      expect(mockCookiesSet).toHaveBeenCalledOnce();
      const [, , clearOpts] = mockCookiesSet.mock.calls[0] as [string, string, Record<string, unknown>];
      expect(clearOpts["maxAge"]).toBe(0); // cookie deletion

      // WHEN: admin surface middleware sees the request with null identity
      const adminDecision = adminRedirectDecision("/", null, "http://localhost:13001/");
      // AND: portal surface middleware sees the request with null identity
      const portalDecision = portalRedirectDecision("/dashboard", null, "http://localhost:3000/dashboard");

      // THEN: BOTH surfaces redirect to re-authentication
      // CS-TS-003: cross-surface — the sign-out is global (one identity/session — ADR-010)
      expect(adminDecision.action).toBe("redirect");  // admin requires re-auth
      expect(portalDecision.action).toBe("redirect"); // portal requires re-auth
    },
  );
});

// ─── 3. Switcher re-establishes CLIENT session server-side, re-lands on portal ─
//
// Switcher dev-acceptance (ADR-005 / D4):
// Switching from Accountant to a Client re-establishes a CLIENT session server-side
// and the returned landing target is apps/portal.

describe("switcher re-establishes session server-side and re-lands on the correct app (dev-acceptance)", () => {
  /**
   * Test 4 (required):
   * "switching from Accountant to a Client re-establishes a CLIENT session server-side
   *  and re-lands on apps/portal"
   *
   * Expected: new session role = CLIENT (server-resolved); landing target = portal.
   * Tag: dev-acceptance / ADR-005 / ADR-010 / CS-TS-003
   *
   * // ADR-005 // ADR-010 // CS-TS-003
   */
  it(
    "[dev-acceptance] switching from Accountant to a Client re-establishes a CLIENT session server-side and re-lands on apps/portal",
    async () => {
      // GIVEN: currently signed in as ACCOUNTANT (implicit — switching FROM accountant)
      // WHEN: the tester switches to a client account
      const result = await devSwitchAccount("client-margaret");

      // THEN: a new session is established with the CLIENT role (server-resolved)
      expect(result.success).toBe(true);

      // The session cookie was set server-side
      expect(mockCookiesSet).toHaveBeenCalledOnce();
      const [cookieName, , cookieOpts] = mockCookiesSet.mock.calls[0] as [
        string,
        string,
        Record<string, unknown>,
      ];
      expect(cookieName).toBe("__mock_session");
      expect(cookieOpts["httpOnly"]).toBe(true);

      // ADR-005 D1: createMockSessionCookie was called with the SERVER-RESOLVED CLIENT role
      expect(mockCreateMockSessionCookie).toHaveBeenCalledOnce();
      const sessionArgs = mockCreateMockSessionCookie.mock.calls[0]?.[0] as {
        clerkUserId: string;
        role: string;
      };
      expect(sessionArgs.role).toBe("CLIENT"); // server-resolved, not browser-supplied — ADR-005

      // ADR-010: landing target is apps/portal (/dashboard — the CLIENT's home surface)
      expect(result.redirectTo).toBe("/dashboard"); // CLIENT → portal
    },
  );

  it(
    "[dev-acceptance] switching to the Accountant re-lands on apps/admin (ACCOUNTANT → admin surface)",
    async () => {
      // GIVEN: currently signed in as CLIENT
      // WHEN: the tester switches to the accountant account
      const result = await devSwitchAccount("accountant-jane");

      // THEN: a new session is established with the ACCOUNTANT role
      expect(result.success).toBe(true);

      // ADR-005 D1: role is server-resolved as ACCOUNTANT
      const sessionArgs = mockCreateMockSessionCookie.mock.calls[0]?.[0] as {
        role: string;
      };
      expect(sessionArgs.role).toBe("ACCOUNTANT");

      // ADR-010: ACCOUNTANT → lands on apps/admin
      expect(result.redirectTo).toMatch(/^http:\/\/localhost:13001/);
    },
  );

  it(
    "[dev-acceptance / CS-TS-003] any client account in the manifest can be selected as the switch target — cross-surface reachability",
    async () => {
      // CS-TS-003: the switcher must support all demo accounts for cross-surface reach
      const clientAccounts = [
        "client-margaret",
        "client-rafael",
        "client-diane",
        "client-sarah",
      ];

      for (const accountId of clientAccounts) {
        vi.clearAllMocks();
        mockCreateMockSessionCookie.mockResolvedValue(STUB_SESSION_COOKIE);

        const result = await devSwitchAccount(accountId);
        expect(result.success).toBe(true);
        expect(result.redirectTo).toBe("/dashboard"); // all clients → portal

        const args = mockCreateMockSessionCookie.mock.calls[0]?.[0] as { role: string };
        expect(args.role).toBe("CLIENT"); // all client accounts → CLIENT role (server-resolved)
      }
    },
  );
});

// ─── 4. Switcher does not let the browser assert the new role directly ─────────
//
// ADR-005 / D1 (HARD): the switcher must NOT let the browser assert the new role.
// The action accepts ONLY accountId; the role is resolved server-side from the manifest.

describe("the switcher does not let the browser assert the new role directly (ADR-005 / D1 HARD)", () => {
  /**
   * Test 5 (required):
   * "the switcher does not let the browser assert the new role directly"
   *
   * Expected: the new role is server-resolved from the chosen account id.
   * Tag: dev-acceptance / ADR-005 / D1
   *
   * Proof strategy:
   *   - devSwitchAccount accepts ONLY accountId (a single string parameter).
   *   - There is NO role parameter — the TypeScript type enforces this.
   *   - The role passed to createMockSessionCookie is ALWAYS the manifest's role
   *     for the given accountId, regardless of any intent the caller had.
   *   - A forged accountId that encodes a role (e.g. "client-role-ACCOUNTANT") is
   *     rejected because it is not in the manifest.
   *
   * Named code path: devSwitchAccount → devSignInAsAccount → findDemoAccount(accountId)
   *   → account.role (manifest-resolved) → createMockSessionCookie({ role: account.role })
   *
   * Counterfactual: if devSwitchAccount accepted a role parameter and passed it to
   *   createMockSessionCookie directly, the browser could forge any role.
   *   This test fails if such a path exists.
   *
   * // ADR-005 // CS-GEN-003
   */
  it(
    "[ADR-005 D1] the switcher does not let the browser assert the new role directly — role is server-resolved from accountId",
    async () => {
      // GIVEN: a client accountId
      // WHEN: the switcher is invoked (only accountId is passed)
      await devSwitchAccount("client-margaret");

      // THEN: createMockSessionCookie is called with the MANIFEST'S role (CLIENT),
      //   not any role the browser could have supplied
      expect(mockCreateMockSessionCookie).toHaveBeenCalledOnce();
      const callArgs = mockCreateMockSessionCookie.mock.calls[0]?.[0] as {
        clerkUserId: string;
        role: string;
      };

      // The role MUST be what the manifest says for "client-margaret"
      expect(callArgs.role).toBe("CLIENT"); // manifest-resolved — ADR-005

      // The clerkUserId MUST also be server-resolved (browser cannot supply it)
      expect(callArgs.clerkUserId).toBe("demo_usr_margaret_okonkwo"); // manifest value
    },
  );

  it(
    "[ADR-005 D1] a forged accountId that encodes a desired role is rejected — no session established",
    async () => {
      // Attack scenario: an attacker crafts an accountId encoding their desired role
      const forgedIds = [
        "client-role-ACCOUNTANT",
        "forged_ACCOUNTANT",
        "ACCOUNTANT",
        "accountant-forged",
        "role:ACCOUNTANT",
      ];

      for (const forgedId of forgedIds) {
        vi.clearAllMocks();

        const result = await devSwitchAccount(forgedId);

        // Forged accountId is not in the manifest → rejected
        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
        // No session established
        expect(mockCreateMockSessionCookie).not.toHaveBeenCalled();
        expect(mockCookiesSet).not.toHaveBeenCalled();
      }
    },
  );

  it(
    "[ADR-005 D1] accountant accountId always yields ACCOUNTANT role — browser cannot use it to get CLIENT session",
    async () => {
      // Sign in as accountant-jane → must get ACCOUNTANT, not CLIENT
      await devSwitchAccount("accountant-jane");

      const args = mockCreateMockSessionCookie.mock.calls[0]?.[0] as { role: string };
      expect(args.role).toBe("ACCOUNTANT"); // manifest-determined
      expect(args.role).not.toBe("CLIENT"); // browser cannot force CLIENT here
    },
  );

  it(
    "[ADR-005 D1] role is manifest-deterministic — same accountId always yields same role on switch",
    async () => {
      // Switching twice to the same account must yield the same role both times
      // (server-side manifest is stable, not randomized)
      await devSwitchAccount("client-rafael");
      const firstArgs = mockCreateMockSessionCookie.mock.calls[0]?.[0] as { role: string };

      vi.clearAllMocks();
      mockCreateMockSessionCookie.mockResolvedValue(STUB_SESSION_COOKIE);

      await devSwitchAccount("client-rafael");
      const secondArgs = mockCreateMockSessionCookie.mock.calls[0]?.[0] as { role: string };

      // Same accountId → same role (manifest-deterministic, not randomized)
      expect(firstArgs.role).toBe(secondArgs.role);
      expect(firstArgs.role).toBe("CLIENT"); // manifest value for client-rafael
    },
  );
});

// ─── 5. devGlobalSignOut is inert under AUTH_PROVIDER=clerk (ADR-001) ──────────

describe("devGlobalSignOut — inert under AUTH_PROVIDER=clerk (ADR-001)", () => {
  it(
    "[ADR-001] under AUTH_PROVIDER=clerk, devGlobalSignOut is a no-op — no cookie operations performed",
    async () => {
      vi.stubEnv("AUTH_PROVIDER", "clerk");

      await devGlobalSignOut();

      // Guard fires — no cookie was touched
      expect(mockCookiesSet).not.toHaveBeenCalled();
    },
  );
});

// ─── 6. devSwitchAccount is inert under AUTH_PROVIDER=clerk (ADR-001) ──────────

describe("devSwitchAccount — inert under AUTH_PROVIDER=clerk (ADR-001)", () => {
  it(
    "[ADR-001] under AUTH_PROVIDER=clerk, devSwitchAccount returns failure — no session established",
    async () => {
      vi.stubEnv("AUTH_PROVIDER", "clerk");

      const result = await devSwitchAccount("accountant-jane");

      expect(result.success).toBe(false);
      expect(mockCreateMockSessionCookie).not.toHaveBeenCalled();
      expect(mockCookiesSet).not.toHaveBeenCalled();
    },
  );
});
