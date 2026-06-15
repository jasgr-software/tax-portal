/**
 * packages/auth/src/select.ts — Env-driven binding selector
 *
 * Selects exactly ONE active AuthProvider binding based on the AUTH_PROVIDER
 * environment variable. Exactly one binding is active per process.
 *
 * AUTH_PROVIDER values:
 *   "mock"  (default) — MockAuthProvider: e2e + local dev
 *   "clerk"           — ClerkAuthProvider: production target (requires TASK-004-003)
 *
 * Apps consume `getAuthProvider()` and depend on the AuthProvider port —
 * never on a concrete binding class. This is the seam that makes the later
 * "swap mock → real Clerk" a single-line env change (or drop-in at TASK-004-003).
 *
 * Security: the mock binding must never be active in production.
 * Guard: if AUTH_PROVIDER=clerk but CLERK_SECRET_KEY is absent, the selection
 * still completes (the binding just throws at call-time per its DECISION comment).
 * A separate production health check should verify AUTH_PROVIDER=clerk in production.
 *
 * Singleton pattern: the provider instance is created once and cached for the
 * process lifetime (Next.js long-lived Node.js process, ADR-007).
 */

import type { AuthProvider } from "./port.js";
import { MockAuthProvider } from "./bindings/mock.js";
import { ClerkAuthProvider } from "./bindings/clerk.js";

// ─── Singleton ────────────────────────────────────────────────────────────────

let _provider: AuthProvider | null = null;

/**
 * Returns the active AuthProvider singleton for this process.
 * Reads AUTH_PROVIDER once and caches the result.
 *
 * @returns The active AuthProvider (mock or clerk).
 */
export function getAuthProvider(): AuthProvider {
  if (_provider) return _provider;
  _provider = createAuthProvider();
  return _provider;
}

/**
 * Create a new AuthProvider instance based on the current AUTH_PROVIDER env.
 * Called once per process (singleton above). Exported for testing (reset via
 * resetAuthProviderForTesting).
 */
export function createAuthProvider(): AuthProvider {
  const provider = (process.env["AUTH_PROVIDER"] ?? "mock").toLowerCase();

  switch (provider) {
    case "mock":
      return new MockAuthProvider();
    case "clerk":
      return new ClerkAuthProvider();
    default:
      // Unknown binding: fall back to mock with a warning (never throw — middleware
      // must not crash the process on an unknown provider value).
      console.warn(
        `[packages/auth] Unknown AUTH_PROVIDER="${process.env["AUTH_PROVIDER"]}". ` +
          `Defaulting to mock binding. Set AUTH_PROVIDER=clerk for production.`,
      );
      return new MockAuthProvider();
  }
}

/**
 * Reset the cached provider (for testing only).
 * Call this in test teardown when you need to re-read AUTH_PROVIDER.
 *
 * @internal — test use only. Do not call in production code.
 */
export function resetAuthProviderForTesting(): void {
  _provider = null;
}
