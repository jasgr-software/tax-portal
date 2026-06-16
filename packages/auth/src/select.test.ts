/**
 * packages/auth/src/select.test.ts — Unit tests for the binding selector
 *
 * Tests:
 *   - AUTH_PROVIDER=mock + ALLOW_MOCK_AUTH=true selects MockAuthProvider
 *   - AUTH_PROVIDER=clerk (without ALLOW_MOCK_AUTH) selects ClerkAuthProvider
 *   - AUTH_PROVIDER=clerk + ALLOW_MOCK_AUTH=true is a contradiction → throws
 *   - Default (no AUTH_PROVIDER env) without ALLOW_MOCK_AUTH throws (fail-closed)
 *   - Both bindings satisfy the AuthProvider port interface (runtime shape)
 *
 * Regression (BUG-002-001): guard keys on ALLOW_MOCK_AUTH, not NODE_ENV.
 *   - prod-shaped (NODE_ENV=production) + ALLOW_MOCK_AUTH=true + AUTH_PROVIDER=mock → no throw
 *   - no ALLOW_MOCK_AUTH + AUTH_PROVIDER=mock → throws
 *   - no ALLOW_MOCK_AUTH + AUTH_PROVIDER unset → throws
 *   - AUTH_PROVIDER=clerk (no ALLOW_MOCK_AUTH) → ClerkAuthProvider
 */

import { describe, it, expect, afterEach } from "vitest";
import { createAuthProvider, resetAuthProviderForTesting, getAuthProvider } from "./select.js";
import { MockAuthProvider } from "./bindings/mock.js";
import { ClerkAuthProvider } from "./bindings/clerk.js";

describe("binding selector", () => {
  afterEach(() => {
    // Clean up env and reset singleton after each test
    delete process.env["AUTH_PROVIDER"];
    delete process.env["ALLOW_MOCK_AUTH"];
    resetAuthProviderForTesting();
  });

  it("selects MockAuthProvider when AUTH_PROVIDER=mock and ALLOW_MOCK_AUTH=true", () => {
    process.env["AUTH_PROVIDER"] = "mock";
    process.env["ALLOW_MOCK_AUTH"] = "true";
    const provider = createAuthProvider();
    expect(provider).toBeInstanceOf(MockAuthProvider);
  });

  it("selects ClerkAuthProvider when AUTH_PROVIDER=clerk", () => {
    process.env["AUTH_PROVIDER"] = "clerk";
    const provider = createAuthProvider();
    expect(provider).toBeInstanceOf(ClerkAuthProvider);
  });

  it("throws when AUTH_PROVIDER=clerk and ALLOW_MOCK_AUTH=true (contradiction guard)", () => {
    // AUTH_PROVIDER=clerk + ALLOW_MOCK_AUTH=true is a contradiction: a real Clerk deployment
    // must never also permit the mock binding (repo-committed secret → forgeable ACCOUNTANT cookie).
    process.env["AUTH_PROVIDER"] = "clerk";
    process.env["ALLOW_MOCK_AUTH"] = "true";
    expect(() => createAuthProvider()).toThrow(/AUTH_PROVIDER=clerk and ALLOW_MOCK_AUTH=true cannot be set together/);
  });

  it("throws for unknown AUTH_PROVIDER value (fail-closed, not fall-back)", () => {
    // F1 fix: unknown AUTH_PROVIDER now throws instead of silently falling back to mock.
    // A typo'd value must surface at startup, not silently run the mock binding.
    process.env["AUTH_PROVIDER"] = "unknown-binding";
    process.env["ALLOW_MOCK_AUTH"] = "true";
    expect(() => createAuthProvider()).toThrow(/Unknown AUTH_PROVIDER/);
  });

  it("returns the same singleton instance on repeated getAuthProvider() calls", () => {
    process.env["AUTH_PROVIDER"] = "mock";
    process.env["ALLOW_MOCK_AUTH"] = "true";
    const a = getAuthProvider();
    const b = getAuthProvider();
    expect(a).toBe(b);
  });

  it("returns a new instance after resetAuthProviderForTesting()", () => {
    process.env["AUTH_PROVIDER"] = "mock";
    process.env["ALLOW_MOCK_AUTH"] = "true";
    const a = getAuthProvider();
    resetAuthProviderForTesting();
    const b = getAuthProvider();
    // Both should be MockAuthProvider but different instances
    expect(a).toBeInstanceOf(MockAuthProvider);
    expect(b).toBeInstanceOf(MockAuthProvider);
    expect(a).not.toBe(b);
  });

  // ─── BUG-002-001 Regression: ALLOW_MOCK_AUTH replaces NODE_ENV guard ────────

  it("[BUG-002-001] prod-shaped env + ALLOW_MOCK_AUTH=true + AUTH_PROVIDER=mock → MockAuthProvider (no throw)", () => {
    // The bug: NODE_ENV=production (true in any built image) was blocking this.
    // Fix: ALLOW_MOCK_AUTH=true is the explicit opt-in for e2e/local prod-built containers.
    const prevNodeEnv = process.env["NODE_ENV"];
    process.env["NODE_ENV"] = "production";
    process.env["ALLOW_MOCK_AUTH"] = "true";
    process.env["AUTH_PROVIDER"] = "mock";
    try {
      const provider = createAuthProvider();
      expect(provider).toBeInstanceOf(MockAuthProvider);
    } finally {
      if (prevNodeEnv === undefined) {
        delete process.env["NODE_ENV"];
      } else {
        process.env["NODE_ENV"] = prevNodeEnv;
      }
    }
  });

  it("[BUG-002-001] no ALLOW_MOCK_AUTH + AUTH_PROVIDER=mock → throws (fail-closed default)", () => {
    // No ALLOW_MOCK_AUTH means mock is not opted in — must throw regardless of NODE_ENV.
    process.env["AUTH_PROVIDER"] = "mock";
    // ALLOW_MOCK_AUTH is deliberately unset (afterEach cleanup ensures this)
    expect(() => createAuthProvider()).toThrow(/ALLOW_MOCK_AUTH/);
  });

  it("[BUG-002-001] no ALLOW_MOCK_AUTH + AUTH_PROVIDER unset → throws (fail-closed default)", () => {
    // Unset AUTH_PROVIDER defaults to mock, which is forbidden without ALLOW_MOCK_AUTH.
    delete process.env["AUTH_PROVIDER"];
    // ALLOW_MOCK_AUTH is deliberately unset
    expect(() => createAuthProvider()).toThrow(/ALLOW_MOCK_AUTH/);
  });

  it("[BUG-002-001] AUTH_PROVIDER=clerk without ALLOW_MOCK_AUTH → ClerkAuthProvider (real deploy path)", () => {
    // Real prod deploy path: AUTH_PROVIDER=clerk with ALLOW_MOCK_AUTH unset → ClerkAuthProvider.
    // Note: AUTH_PROVIDER=clerk WITH ALLOW_MOCK_AUTH=true is a contradiction and throws (separate test above).
    process.env["AUTH_PROVIDER"] = "clerk";
    delete process.env["ALLOW_MOCK_AUTH"];
    const provider = createAuthProvider();
    expect(provider).toBeInstanceOf(ClerkAuthProvider);
  });
});

describe("AuthProvider port — runtime shape check", () => {
  it("MockAuthProvider satisfies the port interface (has all required methods)", () => {
    const provider = new MockAuthProvider();
    // Port interface: getSessionRole, getIdentity, checkSession, createInvitation, sessionTimeoutMs
    expect(typeof provider.getSessionRole).toBe("function");
    expect(typeof provider.getIdentity).toBe("function");
    expect(typeof provider.checkSession).toBe("function");
    expect(typeof provider.createInvitation).toBe("function");
    expect(typeof provider.sessionTimeoutMs).toBe("number");
  });

  it("ClerkAuthProvider satisfies the port interface (has all required methods)", () => {
    const provider = new ClerkAuthProvider();
    expect(typeof provider.getSessionRole).toBe("function");
    expect(typeof provider.getIdentity).toBe("function");
    expect(typeof provider.checkSession).toBe("function");
    expect(typeof provider.createInvitation).toBe("function");
    expect(typeof provider.sessionTimeoutMs).toBe("number");
  });
});
