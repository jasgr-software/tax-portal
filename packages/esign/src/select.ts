/**
 * packages/esign/src/select.ts — Env-driven e-sign binding selector
 *
 * Selects exactly ONE active ESignatureProvider binding based on the ESIGN_PROVIDER
 * environment variable. Exactly one binding is active per process.
 *
 * ESIGN_PROVIDER values:
 *   "docuseal" (default) — DocusealESignatureProvider: real (deferred stub for now)
 *   "mock"               — MockESignatureProvider: e2e + local dev (requires ALLOW_MOCK_ESIGN=true)
 *
 * Apps consume `getESignatureProvider()` and depend on the ESignatureProvider port —
 * never on a concrete binding class.
 *
 * Security — FAIL-CLOSED, REAL-DEFAULT (DECISION-E / ADR-023 §4):
 *
 *   This selector is the INVERSE default of packages/auth/src/select.ts.
 *   Auth defaults to "mock" (its non-prod posture predates ADR-023).
 *   E-sign is the FIRST seam authored under ADR-023, so it sets the correct precedent:
 *
 *   DEFAULT PROVIDER = docuseal (real), NOT mock.
 *
 *   The mock binding is selectable ONLY with an explicit non-production opt-in:
 *   ALLOW_MOCK_ESIGN=true. Without the flag the selector binds the real (deferred-stub)
 *   binding or throws. It NEVER silently falls back to the mock.
 *
 *   ESIGN_PROVIDER=mock + ALLOW_MOCK_ESIGN unset/false → THROW (fail-closed)
 *   ESIGN_PROVIDER=docuseal + ALLOW_MOCK_ESIGN=true   → THROW (contradiction)
 *   ESIGN_PROVIDER=docuseal, ALLOW_MOCK_ESIGN unset   → DocusealESignatureProvider (stub)
 *   ESIGN_PROVIDER=mock, ALLOW_MOCK_ESIGN=true        → MockESignatureProvider
 *   ESIGN_PROVIDER unset, ALLOW_MOCK_ESIGN unset      → DocusealESignatureProvider (stub)
 *   ESIGN_PROVIDER=<unknown>                           → THROW
 *
 *   The guard keys on ALLOW_MOCK_ESIGN, NOT NODE_ENV — keying on NODE_ENV was the
 *   BUG-002-001 failure mode (NODE_ENV=production is always true for any built image,
 *   including the sanctioned e2e/local prod-built container). A real deployment sets
 *   ESIGN_PROVIDER=docuseal and leaves ALLOW_MOCK_ESIGN unset → fail closed.
 *   An e2e/local prod-built container sets ESIGN_PROVIDER=mock + ALLOW_MOCK_ESIGN=true.
 *
 * Singleton: the provider instance is created once and cached for the process
 * lifetime (Next.js long-lived Node.js process, ADR-007).
 *
 * ADR-023: provider-seam & mock-first strategy.
 * ADR-024: e-sign via self-hosted Docuseal behind this seam.
 */

import type { ESignatureProvider } from "./port.js";
import { MockESignatureProvider } from "./bindings/mock.js";
import { DocusealESignatureProvider } from "./bindings/docuseal.js";

// ─── Singleton ────────────────────────────────────────────────────────────────

let _provider: ESignatureProvider | null = null;

/**
 * Returns the active ESignatureProvider singleton for this process.
 * Reads ESIGN_PROVIDER once and caches the result.
 *
 * @returns The active ESignatureProvider (docuseal stub or mock).
 */
export function getESignatureProvider(): ESignatureProvider {
  if (_provider) return _provider;
  _provider = createESignatureProvider();
  return _provider;
}

/**
 * Create a new ESignatureProvider instance based on the current ESIGN_PROVIDER env.
 * Called once per process (singleton above). Exported for testing (reset via
 * resetESignProviderForTesting).
 */
export function createESignatureProvider(): ESignatureProvider {
  // DECISION-E (TASK-005-002 / ADR-023 §4):
  // Default provider = docuseal (real), NOT mock.
  // This is the INVERSE of packages/auth which defaults to mock (pre-ADR-023 posture).
  // E-sign is the first seam authored under ADR-023, so it sets the correct precedent.
  const rawProvider = process.env["ESIGN_PROVIDER"];
  const provider = (rawProvider ?? "docuseal").toLowerCase();

  // Guard: ALLOW_MOCK_ESIGN (not NODE_ENV) is the trust-boundary key.
  // See BUG-002-001 / ADR-023 §4: NODE_ENV cannot distinguish e2e from real production.
  const allowMock = (process.env["ALLOW_MOCK_ESIGN"] ?? "").toLowerCase() === "true";

  // Fail-closed: the mock binding must NEVER be active without an explicit non-prod opt-in.
  // ESIGN_PROVIDER=mock + ALLOW_MOCK_ESIGN unset/false → THROW.
  // A real deployment sets ESIGN_PROVIDER=docuseal and leaves ALLOW_MOCK_ESIGN unset.
  // An e2e/local container sets ALLOW_MOCK_ESIGN=true (docker-compose.yml portal service).
  if (provider === "mock" && !allowMock) {
    throw new Error(
      "[packages/esign] mock e-sign is forbidden unless ALLOW_MOCK_ESIGN=true. " +
        "Set ESIGN_PROVIDER=docuseal for a real deployment, or " +
        "ESIGN_PROVIDER=mock + ALLOW_MOCK_ESIGN=true for e2e/local dev. " +
        "The mock binding is unreachable in a production configuration (ADR-023 §4).",
    );
  }

  // Contradiction guard: ESIGN_PROVIDER=docuseal + ALLOW_MOCK_ESIGN=true is an
  // insecure-design contradiction — mirrors the auth contradiction guard (BUG-002-001).
  // A real Docuseal deployment must never also permit the mock binding.
  // If you need local dev with ESIGN_PROVIDER=docuseal, leave ALLOW_MOCK_ESIGN unset.
  if (provider === "docuseal" && allowMock) {
    throw new Error(
      "[packages/esign] ESIGN_PROVIDER=docuseal and ALLOW_MOCK_ESIGN=true cannot be set together. " +
        "A real Docuseal deployment must leave ALLOW_MOCK_ESIGN unset. " +
        "ALLOW_MOCK_ESIGN=true is only valid with ESIGN_PROVIDER=mock (local dev / e2e).",
    );
  }

  switch (provider) {
    case "mock":
      // Only reachable when ALLOW_MOCK_ESIGN=true (guard above).
      return new MockESignatureProvider();
    case "docuseal":
      // Selection completes; stub throws EsignBindingNotAvailableError at call-time.
      // When the real enablement slice lands, replace DocusealESignatureProvider with
      // the real Docuseal API integration — no change needed here.
      return new DocusealESignatureProvider();
    default:
      // Unknown binding: throw instead of silently falling back to mock.
      // A typo'd ESIGN_PROVIDER value must be caught at startup, not at runtime.
      throw new Error(
        `[packages/esign] Unknown ESIGN_PROVIDER="${rawProvider}". ` +
          `Valid values: "docuseal" (default/production), "mock" (local/e2e only — requires ALLOW_MOCK_ESIGN=true). ` +
          `Fix the ESIGN_PROVIDER env var and restart the process.`,
      );
  }
}

/**
 * Reset the cached provider (for testing only).
 * Call this in test teardown when you need to re-read ESIGN_PROVIDER.
 *
 * @internal — test use only. Do not call in production code.
 */
export function resetESignProviderForTesting(): void {
  _provider = null;
}
