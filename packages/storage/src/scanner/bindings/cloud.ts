/**
 * packages/storage/src/scanner/bindings/cloud.ts — Cloud AV scanner binding (deferred stub)
 *
 * ADR-021 §4 (defer-but-constrain): the concrete AV engine/vendor is NOT decided here —
 * exactly as ADR-007 defers the deployment host and ADR-016 defers the observability
 * backend. This stub holds the binding's place in the selector so FILE_SCANNER=cloud
 * (the real-default) completes selection without error. The stub throws
 * ScannerBindingNotAvailableError at call-time.
 *
 * Selection completes; the stub is unreachable before a real engine is wired.
 * When the enablement slice lands (Phase 5), this file is REPLACED with the real
 * cloud AV integration — no call-site change required (callers import only via
 * getFileScanner() from @tax-portal/storage).
 *
 * Azure-cheapest default target: Microsoft Defender for Storage (malware scanning
 * on Blob), with ClamAV-in-a-container or a third-party scan API as alternatives.
 * No code depends on any of them here — that is the point of the port.
 *
 * Mirrors packages/esign/src/bindings/docuseal.ts (EsignBindingNotAvailableError).
 *
 * ADR-021 §4 capability contract:
 *   1. Scan an object in storage by key and return a verdict.
 *   2. Operate out-of-band (no persisted local file beyond /tmp — ADR-007).
 *   3. Sit behind this port (no vendor SDK in route handlers — ADR-013).
 *   4. Support a no-op/dev binding (MockFileScanner satisfies this — not this stub).
 */

import type { FileScanner, ScanObjectRef, ScanVerdict } from "../port.js";

// ─── CloudFileScanner ─────────────────────────────────────────────────────────

/**
 * CloudFileScanner — deferred production AV scanner binding.
 *
 * CURRENT STATUS: Stub. Throws ScannerBindingNotAvailableError when scan() is called.
 * Selection completes without error; only call-time throws.
 *
 * When the real cloud AV enablement slice lands (Phase 5), replace this stub with
 * the real integration. No changes needed in select.ts or callers — they import
 * only via getFileScanner().
 *
 * ADR-021 §4: a requested-but-unbound cloud binding fails closed (never silently
 * passing files through unscanned). The stub achieves this by throwing at call-time.
 */
export class CloudFileScanner implements FileScanner {
  async scan(_ref: ScanObjectRef): Promise<ScanVerdict> {
    // DECISION (TASK-007-002): stub throws at call-time. The real implementation
    // will call the configured cloud AV API (Defender for Storage, ClamAV, or a
    // third-party endpoint) with the object key, await the verdict, and return a
    // ScanVerdict. It must not buffer the whole file in the app process (ADR-007).
    throw new ScannerBindingNotAvailableError();
  }
}

// ─── Error ────────────────────────────────────────────────────────────────────

/**
 * Thrown when the cloud scanner binding is called before the real enablement slice lands.
 *
 * Mirrors EsignBindingNotAvailableError in packages/esign.
 *
 * If you see this error in local dev or e2e, set FILE_SCANNER=mock and
 * ALLOW_MOCK_SCANNER=true (e.g. in docker-compose.yml).
 *
 * In production, the real cloud AV binding must be wired before any file upload
 * flow is exercised (ADR-021 §4 — release-gating item).
 */
export class ScannerBindingNotAvailableError extends Error {
  constructor() {
    super(
      `[CloudFileScanner] Cloud AV scanner binding is not fully wired yet. ` +
        `Set FILE_SCANNER=mock and ALLOW_MOCK_SCANNER=true for local dev and e2e. ` +
        `The cloud binding is the deferred production target — do not call it before ` +
        `the real AV enablement slice lands (see ADR-021 §4).`,
    );
    this.name = "ScannerBindingNotAvailableError";
  }
}
