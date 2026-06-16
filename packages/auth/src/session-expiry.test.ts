/**
 * packages/auth/src/session-expiry.test.ts
 *
 * TIER-3 session-expiry test — no DB, no real sleep.
 *
 * AC-AUTH-009-01: Session expires on the default timeout and re-auth is required.
 *
 * Methodology:
 *   - Drives the active provider's DEFAULT sessionTimeoutMs via getAuthProvider().sessionTimeoutMs
 *     (not a hardcoded literal — tracks the binding so it cannot drift).
 *   - Crafts an EXPIRED session payload deterministically: exp = Date.now() - sessionTimeoutMs - 1000
 *     (already past the expiry window). Does NOT sleep(sessionTimeoutMs).
 *   - Asserts checkSession() → { valid: false, reason: "expired" } for the expired session.
 *   - Asserts getIdentity() → null for the expired session (re-auth required).
 *   - Asserts a session minted within the timeout window is { valid: true, identity }.
 *
 * ADR-005: Role is server-evaluated, never client-asserted. The expiry check is
 *          performed by verifyMockSessionAsync on the SIGNED cookie — the browser
 *          cannot extend its own session by sending a different exp value.
 *
 * Tagged AC IDs: AC-AUTH-009-01
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  MockAuthProvider,
  signMockSession,
  MOCK_SESSION_COOKIE_NAME,
} from "./bindings/mock.js";
import { getAuthProvider, resetAuthProviderForTesting } from "./select.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeRequestWithCookie(cookieValue: string): Request {
  return new Request("http://localhost:3001/dashboard", {
    headers: {
      cookie: `${MOCK_SESSION_COOKIE_NAME}=${cookieValue}`,
    },
  });
}

function makeRequestWithoutCookie(): Request {
  return new Request("http://localhost:3001/dashboard", {});
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("session-expiry — [AC-AUTH-009-01]", () => {
  beforeEach(() => {
    // Use a deterministic test secret for all tests in this suite
    process.env["MOCK_SESSION_SECRET"] = "test-expiry-secret-67890";
    process.env["AUTH_PROVIDER"] = "mock";
    // Reset singleton so getAuthProvider() picks up the env var cleanly
    resetAuthProviderForTesting();
  });

  afterEach(() => {
    delete process.env["MOCK_SESSION_SECRET"];
    delete process.env["AUTH_PROVIDER"];
    // Reset singleton between tests
    resetAuthProviderForTesting();
  });

  /**
   * [AC-AUTH-009-01] Valid session before default timeout resolves to the identity.
   *
   * Mints a session expiring in the future (exp = now + sessionTimeoutMs).
   * checkSession() must return { valid: true, identity }.
   */
  it(
    "[AC-AUTH-009-01] valid session before default timeout resolves to the identity",
    async () => {
      // DECISION (TASK-004-007): Read sessionTimeoutMs from the active provider, not
      // a literal, so this assertion tracks the binding and cannot drift.
      const provider = getAuthProvider();
      const sessionTimeoutMs = provider.sessionTimeoutMs;

      // Mint a session that expires in the future (exp = now + sessionTimeoutMs)
      const exp = Date.now() + sessionTimeoutMs;
      const cookieValue = signMockSession({
        clerkUserId: "user_acct_expiry_test",
        role: "ACCOUNTANT",
        exp,
      });

      const req = makeRequestWithCookie(cookieValue);
      const result = await provider.checkSession(req);

      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.identity.clerkUserId).toBe("user_acct_expiry_test");
        expect(result.identity.role).toBe("ACCOUNTANT");
      }
    },
  );

  /**
   * [AC-AUTH-009-01] Session past the default timeout is expired and checkSession
   * returns { valid: false, reason: "expired" }.
   *
   * Crafts an already-expired session deterministically:
   *   exp = Date.now() - sessionTimeoutMs - 1000 (1 second past the cutoff).
   * Does NOT sleep(). This exercises the expiry branch in verifyMockSessionAsync.
   */
  it(
    "[AC-AUTH-009-01] session past the default timeout is expired — checkSession returns { valid: false, reason: 'expired' }",
    async () => {
      const provider = getAuthProvider();
      const sessionTimeoutMs = provider.sessionTimeoutMs;

      // Craft an expired session: exp is already in the past by sessionTimeoutMs + 1s.
      // This is the deterministic expiry approach — no wall-clock sleep required.
      const exp = Date.now() - sessionTimeoutMs - 1000;
      const cookieValue = signMockSession({
        clerkUserId: "user_acct_expiry_test",
        role: "ACCOUNTANT",
        exp,
      });

      const req = makeRequestWithCookie(cookieValue);
      const result = await provider.checkSession(req);

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.reason).toBe("expired");
      }
    },
  );

  /**
   * [AC-AUTH-009-01] Expired session yields no identity — getIdentity() returns null,
   * meaning re-auth is required.
   *
   * verifyMockSessionAsync checks exp and returns null for expired sessions,
   * so getIdentity() propagates null to the caller.
   */
  it(
    "[AC-AUTH-009-01] expired session yields no identity (getIdentity returns null — re-auth required)",
    async () => {
      const provider = getAuthProvider();
      const sessionTimeoutMs = provider.sessionTimeoutMs;

      const exp = Date.now() - sessionTimeoutMs - 1000;
      const cookieValue = signMockSession({
        clerkUserId: "user_acct_expiry_test",
        role: "ACCOUNTANT",
        exp,
      });

      const req = makeRequestWithCookie(cookieValue);
      const identity = await provider.getIdentity(req);

      // Null identity ⇒ caller must redirect to sign-in (re-auth required)
      expect(identity).toBeNull();
    },
  );

  /**
   * [AC-AUTH-009-01] Absent session (no cookie) is unauthenticated, not expired.
   * Confirms the two cases are distinguished correctly — expired implies a prior
   * valid session that has lapsed; unauthenticated means no session at all.
   */
  it(
    "[AC-AUTH-009-01] absent session (no cookie) returns unauthenticated, not expired",
    async () => {
      const provider = getAuthProvider();
      const req = makeRequestWithoutCookie();
      const result = await provider.checkSession(req);

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.reason).toBe("unauthenticated");
      }
    },
  );

  /**
   * [AC-AUTH-009-01] sessionTimeoutMs is the PROVIDER DEFAULT — not a hardcoded literal.
   * This test asserts the provider exposes the default (MockAuthProvider = 24 h) and
   * that the expiry test above drives it via the property, not a magic number.
   *
   * If the binding changes its default, this test still passes — but the expiry test
   * above will correctly use the new timeout, which is exactly what we want.
   */
  it(
    "[AC-AUTH-009-01] provider default sessionTimeoutMs is a positive number (binding-specific default drives expiry tests)",
    async () => {
      const provider = getAuthProvider();
      expect(typeof provider.sessionTimeoutMs).toBe("number");
      expect(provider.sessionTimeoutMs).toBeGreaterThan(0);
      // Document the expected default for the mock binding (24 h = 86_400_000 ms).
      // If the binding changes, this assertion catches the drift.
      expect(provider.sessionTimeoutMs).toBe(24 * 60 * 60 * 1000);
    },
  );

  /**
   * Additional: CLIENT role expiry works identically to ACCOUNTANT.
   * Ensures the expiry logic is role-agnostic (carried in exp, not role).
   */
  it(
    "[AC-AUTH-009-01] CLIENT session expires on the default timeout (role-agnostic expiry)",
    async () => {
      const provider = getAuthProvider();
      const sessionTimeoutMs = provider.sessionTimeoutMs;

      const exp = Date.now() - sessionTimeoutMs - 1000;
      const cookieValue = signMockSession({
        clerkUserId: "user_client_expiry_test",
        role: "CLIENT",
        exp,
      });

      const req = makeRequestWithCookie(cookieValue);
      const result = await provider.checkSession(req);

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.reason).toBe("expired");
      }

      const identity = await provider.getIdentity(req);
      expect(identity).toBeNull();
    },
  );
});

// ─── MockAuthProvider class-level sessionTimeoutMs ────────────────────────────
// This describe tests the class directly, separate from the singleton provider,
// to verify the property is correctly declared on the class and not just the instance.

describe("MockAuthProvider.sessionTimeoutMs — [AC-AUTH-009-01]", () => {
  it("[AC-AUTH-009-01] MockAuthProvider exposes sessionTimeoutMs as a readonly property", () => {
    const provider = new MockAuthProvider();
    // 24 hours in ms — the mock binding's documented default
    expect(provider.sessionTimeoutMs).toBe(24 * 60 * 60 * 1000);
  });
});
