/**
 * packages/auth/src/select.ts — Env-driven binding selector
 *
 * Selects exactly ONE active AuthProvider binding based on the AUTH_PROVIDER
 * environment variable. Exactly one binding is active per process.
 *
 * AUTH_PROVIDER values:
 *   "mock"  (default) — MockAuthProvider: e2e + local dev (requires ALLOW_MOCK_AUTH=true)
 *   "clerk"           — ClerkAuthProvider: production target (requires TASK-004-003)
 *
 * Apps consume `getAuthProvider()` and depend on the AuthProvider port —
 * never on a concrete binding class. This is the seam that makes the later
 * "swap mock → real Clerk" a single-line env change (or drop-in at TASK-004-003).
 *
 * Security: the mock binding must never be active in a real production deployment.
 * Guard: mock/unset AUTH_PROVIDER is forbidden unless ALLOW_MOCK_AUTH=true is explicitly
 * set (e.g., in docker-compose.yml for e2e/local prod-built containers). A real deploy
 * sets AUTH_PROVIDER=clerk and leaves ALLOW_MOCK_AUTH unset — still throws on mock/unset.
 * If AUTH_PROVIDER=clerk but CLERK_SECRET_KEY is absent, the selection still completes
 * (the binding just throws at call-time per its DECISION comment).
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

  // Fail-closed: the mock binding must NEVER be active in a real production deployment.
  // Throw early at startup so the process refuses to serve rather than running mock auth
  // against real users or allowing an attacker to forge an ACCOUNTANT cookie with the
  // repo-published dev secret. (F1/F6 — review finding.)
  //
  // DECISION: the guard keys on explicit deployment intent (ALLOW_MOCK_AUTH), NOT build mode
  // (NODE_ENV), because NODE_ENV=production is true for ANY built image — including the
  // sanctioned e2e/local prod-built container that runs AUTH_PROVIDER=mock. Keying on
  // NODE_ENV would block every prod-built container from serving the mock provider, which is
  // exactly the bug (BUG-002-001). A real deployment sets AUTH_PROVIDER=clerk and leaves
  // ALLOW_MOCK_AUTH unset, so mock/unset still throws → F1/F6 intent preserved + strengthened.
  // An e2e/local prod-built container sets ALLOW_MOCK_AUTH=true explicitly (docker-compose.yml).
  // An attacker who cannot influence the deploy's env cannot forge ALLOW_MOCK_AUTH → THROW.
  const allowMock = (process.env["ALLOW_MOCK_AUTH"] ?? "").toLowerCase() === "true";
  if (!allowMock && (!rawProvider || provider === "mock")) {
    throw new Error(
      "[packages/auth] mock auth is forbidden unless ALLOW_MOCK_AUTH=true. " +
        "Set AUTH_PROVIDER=clerk for a real deployment, or ALLOW_MOCK_AUTH=true for e2e/local.",
    );
  }

  // Contradiction guard: AUTH_PROVIDER=clerk + ALLOW_MOCK_AUTH=true is an insecure-design
  // contradiction. A real Clerk deployment must never also permit the mock binding — the mock
  // secret is repo-committed and would allow an attacker to forge an ACCOUNTANT session.
  // If you need local dev with real Clerk keys, leave ALLOW_MOCK_AUTH unset.
  if (provider === "clerk" && allowMock) {
    throw new Error(
      "[packages/auth] AUTH_PROVIDER=clerk and ALLOW_MOCK_AUTH=true cannot be set together. " +
        "A real Clerk deployment must leave ALLOW_MOCK_AUTH unset. " +
        "ALLOW_MOCK_AUTH=true is only valid with AUTH_PROVIDER=mock (local dev / e2e).",
    );
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

// ─── Dev-lane guard predicate ─────────────────────────────────────────────────

/**
 * Returns true only when the mock auth provider is explicitly sanctioned by the
 * deployment configuration — i.e. ALLOW_MOCK_AUTH=true AND AUTH_PROVIDER is
 * "mock" (or absent, which defaults to "mock" for local dev).
 *
 * This is the SINGLE source of truth for the dev sign-in lane guard.
 * All four lane guard call sites (portal/admin actions.ts, page.tsx, DevBanner.tsx)
 * must call this function rather than inlining the check, so the gates cannot drift.
 *
 * Security contract (mirrors the fail-closed logic in createAuthProvider()):
 *   - ALLOW_MOCK_AUTH unset / not "true" → false (lane is inactive, fail-closed)
 *   - AUTH_PROVIDER=clerk → false (lane is inactive under the real binding)
 *   - ALLOW_MOCK_AUTH=true + AUTH_PROVIDER=clerk → false (contradiction — inert)
 *   - ALLOW_MOCK_AUTH=true + AUTH_PROVIDER=mock (or unset) → true (sanctioned)
 *
 * The lane mints ACCOUNTANT-level sessions, so it uses the STRICTEST possible gate:
 * unset ALLOW_MOCK_AUTH → inactive (not "default-to-mock") — ADR-001 / ADR-012.
 *
 * // ADR-001 (mock-binding only — inert under AUTH_PROVIDER=clerk)
 * // ADR-012 (security-relevant guard — fails closed unless ALLOW_MOCK_AUTH explicitly set)
 * // ADR-005 (dev lane mints sessions — must use the strictest guard)
 */
export function isMockAuthSanctioned(): boolean {
  const allowMock = (process.env["ALLOW_MOCK_AUTH"] ?? "").toLowerCase() === "true";
  if (!allowMock) return false;
  // Contradiction: clerk + ALLOW_MOCK_AUTH=true is insecure — treat as inactive
  const provider = (process.env["AUTH_PROVIDER"] ?? "mock").toLowerCase();
  return provider === "mock";
}
