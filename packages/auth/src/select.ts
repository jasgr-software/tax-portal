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
  const rawProvider = process.env["AUTH_PROVIDER"];
  const provider = (rawProvider ?? "mock").toLowerCase();

  // Fail-closed: the mock binding must NEVER be active in production.
  // Throw early at startup so the process refuses to serve rather than running mock auth
  // against real users or allowing an attacker to forge an ACCOUNTANT cookie with the
  // repo-published dev secret. (F1/F6 — review finding.)
  if (process.env["NODE_ENV"] === "production") {
    if (!rawProvider || provider === "mock") {
      throw new Error(
        "[packages/auth] AUTH_PROVIDER must be set to a non-mock value in production. " +
          "Set AUTH_PROVIDER=clerk. The mock binding is forbidden in NODE_ENV=production.",
      );
    }
  }

  switch (provider) {
    case "mock":
      return new MockAuthProvider();
    case "clerk":
      return new ClerkAuthProvider();
    default:
      // Unknown binding: throw instead of silently falling back to mock.
      // A typo'd AUTH_PROVIDER value should be caught at startup, not at runtime after
      // the process has already started handling requests with the wrong binding.
      throw new Error(
        `[packages/auth] Unknown AUTH_PROVIDER="${rawProvider}". ` +
          `Valid values: "mock" (local/e2e only), "clerk" (production). ` +
          `Fix the AUTH_PROVIDER env var and restart the process.`,
      );
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
