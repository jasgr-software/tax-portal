/**
 * packages/storage/src/scanner/select.ts — Env-driven FileScanner binding selector
 *
 * Selects exactly ONE active FileScanner binding based on the FILE_SCANNER
 * environment variable. Exactly one binding is active per process.
 *
 * FILE_SCANNER values:
 *   "cloud" (default) — CloudFileScanner: real/production (deferred stub for now)
 *   "mock"            — MockFileScanner: e2e + local dev (requires ALLOW_MOCK_SCANNER=true)
 *
 * Apps consume `getFileScanner()` and depend on the FileScanner port —
 * never on a concrete binding class.
 *
 * Security — FAIL-CLOSED, REAL-DEFAULT (ADR-021 §4 / ADR-023 precedent):
 *
 *   This selector mirrors packages/esign/src/select.ts exactly.
 *   DEFAULT BINDING = cloud (real), NOT mock.
 *
 *   The mock binding is selectable ONLY with an explicit non-production opt-in:
 *   ALLOW_MOCK_SCANNER=true. Without the flag the selector binds the real (deferred-stub)
 *   binding or throws. It NEVER silently falls back to the mock.
 *
 *   FILE_SCANNER=mock + ALLOW_MOCK_SCANNER unset/false → THROW (fail-closed)
 *   FILE_SCANNER=cloud + ALLOW_MOCK_SCANNER=true       → THROW (contradiction)
 *   FILE_SCANNER=cloud, ALLOW_MOCK_SCANNER unset        → CloudFileScanner (stub at call-time)
 *   FILE_SCANNER=mock, ALLOW_MOCK_SCANNER=true          → MockFileScanner
 *   FILE_SCANNER unset, ALLOW_MOCK_SCANNER unset         → CloudFileScanner (stub at call-time)
 *   FILE_SCANNER=<unknown>                               → THROW
 *
 *   The guard keys on ALLOW_MOCK_SCANNER, NOT NODE_ENV — keying on NODE_ENV was the
 *   BUG-002-001 failure mode (NODE_ENV=production is always true for any built image,
 *   including the sanctioned e2e/local prod-built container). A real deployment sets
 *   FILE_SCANNER=cloud and leaves ALLOW_MOCK_SCANNER unset → fail closed.
 *   An e2e/local container sets FILE_SCANNER=mock + ALLOW_MOCK_SCANNER=true.
 *
 * Singleton: the scanner instance is created once and cached for the process
 * lifetime (Next.js long-lived Node.js process, ADR-007).
 *
 * ADR-021 §4: fail-closed unbound binding; no vendor SDK in app code.
 * ADR-013: port discipline — no vendor scanner SDK imported here.
 */

import type { FileScanner } from "./port.js";
import { MockFileScanner } from "./bindings/mock.js";
import { CloudFileScanner } from "./bindings/cloud.js";

// ─── Singleton ────────────────────────────────────────────────────────────────

let _scanner: FileScanner | null = null;

/**
 * Returns the active FileScanner singleton for this process.
 * Reads FILE_SCANNER once and caches the result.
 *
 * @returns The active FileScanner (cloud stub or mock).
 * @throws If FILE_SCANNER=mock without ALLOW_MOCK_SCANNER=true.
 * @throws If FILE_SCANNER=cloud with ALLOW_MOCK_SCANNER=true (contradiction).
 * @throws If FILE_SCANNER is an unknown value.
 */
export function getFileScanner(): FileScanner {
  if (_scanner) return _scanner;
  _scanner = createFileScanner();
  return _scanner;
}

/**
 * Create a new FileScanner instance based on the current FILE_SCANNER env.
 * Called once per process (singleton above). Exported for testing (reset via
 * resetScannerForTesting).
 */
export function createFileScanner(): FileScanner {
  // Default binding = cloud (real), NOT mock.
  // Mirrors packages/esign/src/select.ts's ESIGN_PROVIDER default posture.
  const rawScanner = process.env["FILE_SCANNER"];
  // Treat unset (undefined) and empty string as the default ("cloud").
  // An explicitly empty FILE_SCANNER is treated as "not set" — same posture as
  // packages/esign/src/select.ts which also uses `?? "docuseal"` and a toLowerCase().
  const scanner = (rawScanner?.trim() || "cloud").toLowerCase();

  // Guard: ALLOW_MOCK_SCANNER (not NODE_ENV) is the trust-boundary key.
  // See BUG-002-001 / ADR-021 §4: NODE_ENV cannot distinguish e2e from real production.
  const allowMock =
    (process.env["ALLOW_MOCK_SCANNER"] ?? "").toLowerCase() === "true";

  // Fail-closed: the mock binding must NEVER be active without an explicit non-prod opt-in.
  // FILE_SCANNER=mock + ALLOW_MOCK_SCANNER unset/false → THROW.
  // A real deployment sets FILE_SCANNER=cloud and leaves ALLOW_MOCK_SCANNER unset.
  // An e2e/local container sets ALLOW_MOCK_SCANNER=true (docker-compose.yml).
  if (scanner === "mock" && !allowMock) {
    throw new Error(
      "[packages/storage/scanner] mock scanner is forbidden unless ALLOW_MOCK_SCANNER=true. " +
        "Set FILE_SCANNER=cloud for a real deployment, or " +
        "FILE_SCANNER=mock + ALLOW_MOCK_SCANNER=true for e2e/local dev. " +
        "The mock binding is unreachable in a production configuration (ADR-021 §4).",
    );
  }

  // Contradiction guard: FILE_SCANNER=cloud + ALLOW_MOCK_SCANNER=true is an
  // insecure-design contradiction — mirrors the esign contradiction guard (BUG-002-001).
  // A real cloud deployment must never also permit the mock binding.
  // If you need local dev with FILE_SCANNER=cloud, leave ALLOW_MOCK_SCANNER unset.
  if (scanner === "cloud" && allowMock) {
    throw new Error(
      "[packages/storage/scanner] FILE_SCANNER=cloud and ALLOW_MOCK_SCANNER=true cannot be set together. " +
        "A real cloud deployment must leave ALLOW_MOCK_SCANNER unset. " +
        "ALLOW_MOCK_SCANNER=true is only valid with FILE_SCANNER=mock (local dev / e2e).",
    );
  }

  switch (scanner) {
    case "mock":
      // Only reachable when ALLOW_MOCK_SCANNER=true (guard above).
      return new MockFileScanner();
    case "cloud":
      // Selection completes; stub throws ScannerBindingNotAvailableError at call-time.
      // When the real enablement slice lands, replace CloudFileScanner with the real
      // AV integration — no change needed here.
      return new CloudFileScanner();
    default:
      // Unknown binding: throw instead of silently falling back to mock.
      // A typo'd FILE_SCANNER value must be caught at startup, not at first scan.
      throw new Error(
        `[packages/storage/scanner] Unknown FILE_SCANNER="${rawScanner}". ` +
          `Valid values: "cloud" (default/production), "mock" (local/e2e only — requires ALLOW_MOCK_SCANNER=true). ` +
          `Fix the FILE_SCANNER env var and restart the process.`,
      );
  }
}

/**
 * Reset the cached scanner singleton (for testing only).
 * Call this in test teardown when you need to re-read FILE_SCANNER.
 *
 * @internal — test use only. Do not call in production code.
 */
export function resetScannerForTesting(): void {
  _scanner = null;
}
