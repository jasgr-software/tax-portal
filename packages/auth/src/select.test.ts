/**
 * packages/auth/src/select.test.ts — Unit tests for the binding selector
 *
 * Tests:
 *   - AUTH_PROVIDER=mock selects MockAuthProvider
 *   - AUTH_PROVIDER=clerk selects ClerkAuthProvider
 *   - Default (no AUTH_PROVIDER env) selects MockAuthProvider
 *   - Both bindings satisfy the AuthProvider port interface (runtime shape)
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createAuthProvider, resetAuthProviderForTesting, getAuthProvider } from "./select.js";
import { MockAuthProvider } from "./bindings/mock.js";
import { ClerkAuthProvider } from "./bindings/clerk.js";

describe("binding selector", () => {
  afterEach(() => {
    // Clean up env and reset singleton after each test
    delete process.env["AUTH_PROVIDER"];
    resetAuthProviderForTesting();
  });

  it("selects MockAuthProvider when AUTH_PROVIDER=mock", () => {
    process.env["AUTH_PROVIDER"] = "mock";
    const provider = createAuthProvider();
    expect(provider).toBeInstanceOf(MockAuthProvider);
  });

  it("selects ClerkAuthProvider when AUTH_PROVIDER=clerk", () => {
    process.env["AUTH_PROVIDER"] = "clerk";
    const provider = createAuthProvider();
    expect(provider).toBeInstanceOf(ClerkAuthProvider);
  });

  it("defaults to MockAuthProvider when AUTH_PROVIDER is absent", () => {
    delete process.env["AUTH_PROVIDER"];
    const provider = createAuthProvider();
    expect(provider).toBeInstanceOf(MockAuthProvider);
  });

  it("falls back to MockAuthProvider for unknown AUTH_PROVIDER value", () => {
    process.env["AUTH_PROVIDER"] = "unknown-binding";
    const provider = createAuthProvider();
    expect(provider).toBeInstanceOf(MockAuthProvider);
  });

  it("returns the same singleton instance on repeated getAuthProvider() calls", () => {
    process.env["AUTH_PROVIDER"] = "mock";
    const a = getAuthProvider();
    const b = getAuthProvider();
    expect(a).toBe(b);
  });

  it("returns a new instance after resetAuthProviderForTesting()", () => {
    process.env["AUTH_PROVIDER"] = "mock";
    const a = getAuthProvider();
    resetAuthProviderForTesting();
    const b = getAuthProvider();
    // Both should be MockAuthProvider but different instances
    expect(a).toBeInstanceOf(MockAuthProvider);
    expect(b).toBeInstanceOf(MockAuthProvider);
    expect(a).not.toBe(b);
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
