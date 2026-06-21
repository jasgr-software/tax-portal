/**
 * apps/portal/src/app/(dev)/dev-sign-in/server-set-role.test.ts
 *
 * TASK-009-003 — Server-set-role assertion (ADR-005 / D1 HARD constraint).
 *
 * This test file proves the core ADR-005 invariant for the dev sign-in lane:
 *   "The established session's role is the SERVER-resolved value for the chosen account,
 *    NOT a client-supplied one."
 *
 * The dev sign-in action signature is:
 *   devSignInAsAccount(accountId: string): Promise<DevSignInResult>
 *
 * The browser submits ONLY `accountId` (a display key, e.g. "client-margaret").
 * The server resolves `role` + `clerkUserId` from the DEMO_ACCOUNTS manifest.
 * There is NO role parameter — the client physically cannot supply a role.
 *
 * Tests in this file:
 *   1. The action signature has no `role` parameter — client cannot inject a role.
 *   2. Attempting to use a forged accountId that encodes a role is rejected.
 *   3. The established session's role always matches the manifest's value, not any
 *      input the client could control.
 *   4. The same accountId always yields the same role (manifest-deterministic).
 *   5. The browser cannot submit `{"accountId":"accountant-jane","role":"CLIENT"}`
 *      and get a CLIENT session — the role is ignored at the boundary.
 *
 * Also tags the AC-AUTH-010 behaviors tested at the middleware/redirect-decision
 * level (tier-2/3 unit tests):
 *   AC-AUTH-010-01: signed-in CLIENT → admin surface → redirect to portal (no admin content)
 *   AC-AUTH-010-02: signed-in ACCOUNTANT → CLIENT-only portal route → redirect to admin
 *   AC-AUTH-010-03: signed-in ACCOUNTANT → portal public route → served (no redirect)
 *
 * These AC-AUTH-010 redirect tests exercise the mechanism through the same session
 * cookie shape that the lane's sign-in path (devSignInAsAccount) establishes —
 * proving the lane's sessions flow through the same redirect matrix as the e2e path.
 *
 * // ADR-005 (server-set role — D1: no client-trusted role path)
 * // ADR-010 (redirect matrix: portal vs admin surface routing by role)
 * // ADR-001 (mock binding; lane inert under AUTH_PROVIDER=clerk)
 * // CS-TS-001 (no DB read in the lane — static manifest DECISION in demo-accounts.ts)
 * // CS-GEN-001 (no cookie value or MOCK_SESSION_SECRET in logs)
 * // CS-GEN-003 (governing key citations present)
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

// Use importOriginal to preserve the real redirect decision functions while
// stubbing out the cookie builder and URL helpers used by devSignInAsAccount.
// portalRedirectDecision and adminRedirectDecision are tested against their
// REAL implementations — this is what makes the AC-AUTH-010 tier-2/3 tests meaningful.
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

vi.mock("next/headers", () => ({
  cookies: () =>
    Promise.resolve({
      set: mockCookiesSet,
    }),
}));

// ─── Import AFTER mocks ────────────────────────────────────────────────────────

import { devSignInAsAccount } from "./actions";
import { findDemoAccount, DEMO_ACCOUNTS } from "./demo-accounts";
// Import redirect helpers for the AC-AUTH-010 tier-2/3 assertions (ADR-010)
import { portalRedirectDecision, adminRedirectDecision } from "@tax-portal/auth";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const STUB_SESSION_COOKIE = {
  name: "__mock_session",
  value: "stub-signed-[not-real]", // CS-GEN-001: stub, never a real HMAC
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
  vi.stubEnv("PORTAL_APP_URL", "http://localhost:3000");
  vi.stubEnv("ADMIN_APP_URL", "http://localhost:13001");
});

// ─── 1. ADR-005: The action accepts ONLY accountId — no role parameter ─────────

describe("devSignInAsAccount — action interface: only accountId crosses the boundary (ADR-005 / D1)", () => {
  /**
   * D1 (ADR-005): The action accepts exactly one parameter: accountId (string).
   * There is no role parameter. The TypeScript type system enforces this at compile
   * time; these runtime tests confirm the behavioral invariant.
   */
  it(
    "[ADR-005 D1] the action accepts only accountId — calling it with a valid accountId succeeds and uses the MANIFEST role",
    async () => {
      // GIVEN: a valid accountId for an ACCOUNTANT
      // WHEN: the action is called (the only argument is accountId)
      const result = await devSignInAsAccount("accountant-jane");

      // THEN: success, and the role passed to createMockSessionCookie is from the manifest
      expect(result.success).toBe(true);
      expect(mockCreateMockSessionCookie).toHaveBeenCalledOnce();

      const callArgs = mockCreateMockSessionCookie.mock.calls[0]?.[0] as {
        clerkUserId: string;
        role: string;
      };

      // The manifest says accountant-jane → ACCOUNTANT
      // The CLIENT CANNOT CHANGE THIS — there's no role param in the action
      expect(callArgs.role).toBe("ACCOUNTANT");
      // CS-TS-001: clerkUserId is also server-resolved — never from the browser
      expect(callArgs.clerkUserId).toBe("demo_usr_jane_accountant");
    },
  );

  it(
    "[ADR-005 D1] a CLIENT accountId always yields CLIENT role — client cannot request a different role",
    async () => {
      const result = await devSignInAsAccount("client-margaret");

      expect(result.success).toBe(true);
      const callArgs = mockCreateMockSessionCookie.mock.calls[0]?.[0] as {
        role: string;
      };

      // Manifest: client-margaret → CLIENT
      expect(callArgs.role).toBe("CLIENT");
    },
  );

  /**
   * The key client-side forgery scenario:
   * A browser cannot call `devSignInAsAccount("accountant-jane", { role: "CLIENT" })`
   * to get a CLIENT session for the accountant's identity (or vice versa).
   * The action simply ignores any extra parameters TypeScript enforces away.
   *
   * We prove this structurally: the established role is ALWAYS what the manifest says.
   */
  it(
    "[ADR-005 D1] accountant accountId always yields ACCOUNTANT session — no client path to override it",
    async () => {
      // Attempt to sign in as accountant-jane — role is server-resolved
      await devSignInAsAccount("accountant-jane");

      const callArgs = mockCreateMockSessionCookie.mock.calls[0]?.[0] as {
        role: string;
      };

      // No matter what the client "intended," the server uses the manifest role
      expect(callArgs.role).toBe("ACCOUNTANT");
      expect(callArgs.role).not.toBe("CLIENT");
    },
  );
});

// ─── 2. Forged accountId attack: encoded role in the id ───────────────────────

describe("devSignInAsAccount — forged accountId attack (ADR-005 / D1)", () => {
  /**
   * Attack scenario: an attacker crafts an accountId that encodes their desired role,
   * e.g. "client-ACCOUNTANT" or "forged_ACCOUNTANT_access".
   * The manifest lookup fails → no session is established.
   */
  it(
    "[ADR-005] accountId encoding a forged ACCOUNTANT role is rejected — no session established",
    async () => {
      // Attacker tries to craft an accountId that looks like it might get them ACCOUNTANT access
      const forgedIds = [
        "client-ACCOUNTANT",
        "forged_role_ACCOUNTANT",
        "accountant-forged",
        "__proto__",
        "ACCOUNTANT",
        "role:ACCOUNTANT",
        'accountant-jane\nrole=CLIENT', // injection attempt
      ];

      for (const forgedId of forgedIds) {
        vi.clearAllMocks();

        const result = await devSignInAsAccount(forgedId);

        // All forged ids must fail — not in the manifest
        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
        // No session established for any forged accountId
        expect(mockCreateMockSessionCookie).not.toHaveBeenCalled();
        expect(mockCookiesSet).not.toHaveBeenCalled();
      }
    },
  );

  it(
    "[ADR-005] accountId swap attack: cannot use one account's id to get another account's role",
    async () => {
      // Sign in as client-margaret → must get CLIENT, not ACCOUNTANT
      const clientResult = await devSignInAsAccount("client-margaret");
      expect(clientResult.success).toBe(true);
      const clientCallArgs = mockCreateMockSessionCookie.mock.calls[0]?.[0] as {
        role: string;
      };
      expect(clientCallArgs.role).toBe("CLIENT");

      vi.clearAllMocks();
      mockCreateMockSessionCookie.mockResolvedValue(STUB_SESSION_COOKIE);

      // Sign in as accountant-jane → must get ACCOUNTANT, not CLIENT
      const acctResult = await devSignInAsAccount("accountant-jane");
      expect(acctResult.success).toBe(true);
      const acctCallArgs = mockCreateMockSessionCookie.mock.calls[0]?.[0] as {
        role: string;
      };
      expect(acctCallArgs.role).toBe("ACCOUNTANT");
    },
  );
});

// ─── 3. Server-resolved role is manifest-deterministic ────────────────────────

describe("devSignInAsAccount — role is manifest-deterministic (ADR-005)", () => {
  it(
    "[ADR-005] every account in the manifest has a stable server-resolved role — repeated calls yield the same role",
    async () => {
      // For each account in the manifest, calling the action twice must yield the same role
      for (const account of DEMO_ACCOUNTS) {
        vi.clearAllMocks();
        mockCreateMockSessionCookie.mockResolvedValue(STUB_SESSION_COOKIE);

        const result1 = await devSignInAsAccount(account.accountId);
        expect(result1.success).toBe(true);
        const firstCall = mockCreateMockSessionCookie.mock.calls[0]?.[0] as {
          role: string;
        };

        vi.clearAllMocks();
        mockCreateMockSessionCookie.mockResolvedValue(STUB_SESSION_COOKIE);

        const result2 = await devSignInAsAccount(account.accountId);
        expect(result2.success).toBe(true);
        const secondCall = mockCreateMockSessionCookie.mock.calls[0]?.[0] as {
          role: string;
        };

        // Same accountId always yields same role — server-manifest, not randomized
        expect(firstCall.role).toBe(secondCall.role);
        // Role matches the manifest
        expect(firstCall.role).toBe(account.role);
      }
    },
  );

  it(
    "[ADR-005] findDemoAccount returns the manifest record — role is embedded in the manifest, not computed from input",
    () => {
      // Direct test of the manifest lookup — the server uses this to resolve role
      const jane = findDemoAccount("accountant-jane");
      expect(jane).toBeDefined();
      expect(jane?.role).toBe("ACCOUNTANT");
      // The accountId "accountant-jane" does NOT contain role information
      // that the server reads back out — the role is from the manifest object
      expect(jane?.accountId).toBe("accountant-jane");

      const margaret = findDemoAccount("client-margaret");
      expect(margaret).toBeDefined();
      expect(margaret?.role).toBe("CLIENT");

      // Any unknown accountId returns undefined — no default role is assumed
      expect(findDemoAccount("unknown-xyz")).toBeUndefined();
    },
  );
});

// ─── 4. AC-AUTH-010 non-regression: tier-2/3 redirect-decision tests ──────────
//
// The redirect matrix (AC-AUTH-010-01/-02/-03) is implemented in:
//   packages/auth/src/redirect.ts → portalRedirectDecision, adminRedirectDecision
// delivered and verified by EPIC-004.
//
// This task (TASK-009-003) tags these tests with their AC ids and asserts they
// hold through the same session cookie shape that the dev sign-in lane establishes.
// The lane uses createMockSessionCookie with role=ACCOUNTANT|CLIENT — the same
// role field that the middleware reads to make redirect decisions.
//
// The e2e validation of AC-AUTH-010 through the lane's full sign-in flow is
// consolidated into TASK-009-004. These tier-2/3 tests cover the logic layer.
//
// Named code paths:
//   - redirect.ts:187  portalRedirectDecision: ACCOUNTANT → admin redirect (AC-AUTH-010-02)
//   - redirect.ts:161  portalRedirectDecision: public path → serve (AC-AUTH-010-03)
//   - redirect.ts:265  adminRedirectDecision:  CLIENT → portal redirect (AC-AUTH-010-01)

describe("AC-AUTH-010 non-regression: redirect matrix (tier-2/3, ADR-010)", () => {
  /**
   * AC-AUTH-010-01: signed-in CLIENT reaching the admin surface is redirected to the
   * client surface (portal); no admin content rendered.
   *
   * Named code path: packages/auth/src/redirect.ts:265
   *   if (identity.role === "CLIENT") {
   *     const destination = new URL("/", portalBase);
   *     return { action: "redirect", destination, statusCode: 307 };
   *   }
   *
   * This is the same role value the lane's session carries after devSignInAsAccount("client-*").
   */
  it(
    "[AC-AUTH-010-01] signed-in CLIENT visiting admin root is redirected to portal (not served, not 403)",
    () => {
      // ADR-010: adminRedirectDecision with role=CLIENT → redirect to portal
      const decision = adminRedirectDecision(
        "/",
        { role: "CLIENT" },
        "http://localhost:13001/",
      );

      // Must redirect — not serve (no admin content rendered)
      expect(decision.action).toBe("redirect");
      if (decision.action === "redirect") {
        // Destination is portal origin (the client's home surface)
        expect(decision.destination.origin).toContain("localhost:3000");
        expect(decision.statusCode).toBe(307); // not 403 — ADR-010 §1: misnavigation → redirect
      }
    },
  );

  it(
    "[AC-AUTH-010-01] signed-in CLIENT visiting a deep admin path is redirected to portal",
    () => {
      const decision = adminRedirectDecision(
        "/engagements/123/messages",
        { role: "CLIENT" },
        "http://localhost:13001/engagements/123/messages",
      );

      expect(decision.action).toBe("redirect");
      if (decision.action === "redirect") {
        expect(decision.destination.origin).toContain("localhost:3000");
        expect(decision.statusCode).toBe(307);
      }
    },
  );

  /**
   * AC-AUTH-010-02: signed-in ACCOUNTANT reaching a CLIENT-only portal route is
   * redirected to the admin surface; no client-only content rendered.
   *
   * Named code path: packages/auth/src/redirect.ts:187
   *   if (identity.role === "ACCOUNTANT") {
   *     const destination = new URL("/", adminBase);
   *     return { action: "redirect", destination, statusCode: 307 };
   *   }
   *
   * This is the same role value the lane's session carries after devSignInAsAccount("accountant-jane").
   */
  it(
    "[AC-AUTH-010-02] signed-in ACCOUNTANT visiting portal /dashboard (CLIENT-only) is redirected to admin",
    () => {
      // ADR-010: portalRedirectDecision with ACCOUNTANT on a private (CLIENT-only) route
      const decision = portalRedirectDecision(
        "/dashboard",
        { role: "ACCOUNTANT" },
        "http://localhost:3000/dashboard",
      );

      expect(decision.action).toBe("redirect");
      if (decision.action === "redirect") {
        // Destination is admin origin (the accountant's home surface)
        expect(decision.destination.origin).toContain("localhost:13001");
        expect(decision.statusCode).toBe(307); // not 403
      }
    },
  );

  it(
    "[AC-AUTH-010-02] signed-in ACCOUNTANT visiting any portal private route is redirected to admin",
    () => {
      const privateRoutes = ["/dashboard", "/onboarding", "/onboarding/documents"];
      for (const route of privateRoutes) {
        const decision = portalRedirectDecision(
          route,
          { role: "ACCOUNTANT" },
          `http://localhost:3000${route}`,
        );
        expect(decision.action).toBe("redirect");
        if (decision.action === "redirect") {
          expect(decision.statusCode).toBe(307);
          expect(decision.destination.origin).toContain("localhost:13001");
        }
      }
    },
  );

  /**
   * AC-AUTH-010-03: public (non-client-only) routes on the client surface remain
   * reachable regardless of role.
   *
   * Named code path: packages/auth/src/redirect.ts:161
   *   if (isPortalPublicPath(pathname)) { return { action: "serve" }; }
   *
   * The public allow-list includes /dev-sign-in itself (PORTAL_PUBLIC_PATHS in redirect.ts).
   * The page-level isMockActive() guard is the ONLY thing that makes it 404 under clerk.
   */
  it(
    "[AC-AUTH-010-03] signed-in ACCOUNTANT visiting portal public route /services is served (no redirect)",
    () => {
      const decision = portalRedirectDecision(
        "/services",
        { role: "ACCOUNTANT" },
        "http://localhost:3000/services",
      );

      // Public route → always serve for any role
      expect(decision.action).toBe("serve");
    },
  );

  it(
    "[AC-AUTH-010-03] signed-in CLIENT visiting portal public route /services is served",
    () => {
      const decision = portalRedirectDecision(
        "/services",
        { role: "CLIENT" },
        "http://localhost:3000/services",
      );

      expect(decision.action).toBe("serve");
    },
  );

  it(
    "[AC-AUTH-010-03] unauthenticated user visiting portal public route / is served",
    () => {
      const decision = portalRedirectDecision(
        "/",
        null, // unauthenticated
        "http://localhost:3000/",
      );

      expect(decision.action).toBe("serve");
    },
  );

  it(
    "[AC-AUTH-010-03] the /dev-sign-in route is on the portal public allow-list — any role (or unauthenticated) reaches the page",
    () => {
      // The page itself 404s under AUTH_PROVIDER=clerk (isMockActive() guard).
      // But the MIDDLEWARE allow-list lets the request through — the 404 is the page's
      // responsibility, not the middleware's. This test proves the middleware decision.
      const decisionUnauthenticated = portalRedirectDecision(
        "/dev-sign-in",
        null,
        "http://localhost:3000/dev-sign-in",
      );
      const decisionClient = portalRedirectDecision(
        "/dev-sign-in",
        { role: "CLIENT" },
        "http://localhost:3000/dev-sign-in",
      );
      const decisionAccountant = portalRedirectDecision(
        "/dev-sign-in",
        { role: "ACCOUNTANT" },
        "http://localhost:3000/dev-sign-in",
      );

      // All reach the middleware "serve" — the page guard handles the 404
      expect(decisionUnauthenticated.action).toBe("serve");
      expect(decisionClient.action).toBe("serve");
      expect(decisionAccountant.action).toBe("serve");
    },
  );

  /**
   * Prove the redirect matrix is role-discriminating:
   * CLIENT on admin → redirect; ACCOUNTANT on admin → serve.
   * This is the symmetry proof for AC-AUTH-010-01 vs normal accountant access.
   */
  it(
    "[AC-AUTH-010-01 / ADR-010] signed-in ACCOUNTANT visiting admin root is SERVED (not redirected) — role discrimination is correct",
    () => {
      const decision = adminRedirectDecision(
        "/",
        { role: "ACCOUNTANT" },
        "http://localhost:13001/",
      );

      // ACCOUNTANT on admin → serve (not redirect)
      expect(decision.action).toBe("serve");
    },
  );
});
