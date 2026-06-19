/**
 * packages/storage/src/scanner/port.ts — FileScanner port interface
 *
 * Defines the contract all AV scanning bindings (mock + cloud) must satisfy.
 * Apps import from @tax-portal/storage — never from a concrete binding.
 *
 * ADR-021: scan-before-available pipeline; FileScanner capability contract;
 *          verdict clean|infected|indeterminate; fail-closed unbound binding.
 * ADR-013: no vendor scanner SDK in app code (port discipline).
 * ADR-020: port-and-adapter security posture.
 * REQ-NFR-009: all uploaded files are scanned for malware.
 */

// ─── Verdict ──────────────────────────────────────────────────────────────────

/**
 * ScanVerdict — the three possible outcomes of a malware scan.
 *
 * IMPORTANT: `indeterminate` is a FIRST-CLASS verdict, NOT a pass.
 *
 *   'clean'         — scan completed; no threat found. File may be promoted to active.
 *   'infected'      — scan completed; threat detected. File must be quarantined/rejected.
 *   'indeterminate' — scan could not complete (timeout, engine unavailable, internal error).
 *                     The file MUST remain in pending state and MUST NOT be promoted to
 *                     active. Downstream (TASK-007-004) maps this to "stay pending" — never
 *                     "active". The type makes indeterminate structurally distinct from
 *                     clean so a consumer cannot accidentally treat them identically.
 *
 * ADR-021 §1: "Indeterminate/scanner-unavailable → stays pending (fail-closed: not
 * promoted to available) and is retried; it must never silently become active without
 * a pass."
 */
export type ScanVerdict =
  | { verdict: "clean" }
  | { verdict: "infected"; threat?: string }
  | { verdict: "indeterminate"; reason?: string };

/**
 * ScanObjectRef — the reference passed to FileScanner.scan().
 *
 * The scanner operates on a stored object reference (key in the storage layer),
 * optionally with a stream alternative. It does NOT block the client's PUT and
 * does NOT require a persisted local file (ADR-007: no local FS beyond /tmp).
 *
 * ADR-021 §1: "The scan runs out-of-band on the object in storage (or a streamed
 * copy through /tmp only, never a persisted local file)."
 */
export interface ScanObjectRef {
  /** Storage key — identifies the quarantined object to be scanned. */
  key: string;
  /**
   * Optional readable stream of the object's bytes for scanners that can
   * consume a stream directly (avoids an extra round-trip GET).
   * Not all bindings use this; the cloud binding fetches by key.
   */
  stream?: NodeJS.ReadableStream;
}

// ─── Port Interface ───────────────────────────────────────────────────────────

/**
 * FileScanner — the single interface all AV scanning bindings must implement.
 *
 * Callers (the upload complete handler and the reconciliation/scan cron) invoke
 * scan() after a file lands in storage in `pending` state. The result drives the
 * pending→active / pending→infected state transition in TASK-007-004.
 *
 * Bindings:
 *   MockFileScanner     — local dev + e2e (requires ALLOW_MOCK_SCANNER=true)
 *   CloudFileScanner    — deferred production binding (stub — throws at call-time)
 *
 * The selector (select.ts) picks the active binding via FILE_SCANNER env var.
 * Apps import only via getFileScanner() from @tax-portal/storage — never import
 * a concrete binding class.
 *
 * ADR-021 §4: capability contract the eventual engine must satisfy.
 * ADR-013: no vendor scanner SDK in route handlers or app code.
 */
export interface FileScanner {
  /**
   * Scan a stored object for malware and return a structured verdict.
   *
   * @param ref  - The object reference (key + optional stream).
   * @returns    ScanVerdict — clean, infected (with optional threat label), or
   *             indeterminate (with optional reason). Never throws on a scan failure;
   *             unreachable/timeout conditions are mapped to indeterminate. However,
   *             infrastructure failures (bad config, missing key) may throw.
   */
  scan(ref: ScanObjectRef): Promise<ScanVerdict>;
}
