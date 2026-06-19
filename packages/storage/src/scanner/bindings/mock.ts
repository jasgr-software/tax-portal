/**
 * packages/storage/src/scanner/bindings/mock.ts — Mock/test-double AV scanner binding
 *
 * The e2e/local-dev default. Selected when FILE_SCANNER=mock AND ALLOW_MOCK_SCANNER=true.
 *
 * Behavior — deterministic by sentinel (load-bearing for TASK-007-006 e2e):
 *
 *   key or stream content contains 'eicar' or 'malicious' (case-insensitive)
 *     → ScanVerdict { verdict: 'infected', threat: 'EICAR-Test-Signature' }
 *
 *   key or stream content contains 'indeterminate' (case-insensitive)
 *     → ScanVerdict { verdict: 'indeterminate', reason: 'mock-indeterminate-sentinel' }
 *
 *   anything else
 *     → ScanVerdict { verdict: 'clean' }
 *
 * The sentinel pattern is detected in the storage KEY first (no I/O needed for
 * key-based detection). If the key carries no sentinel, stream content is checked
 * (first 512 bytes as UTF-8). This keeps the mock lightweight while allowing
 * content-level sentinel injection for tests that can't control the key.
 *
 * ADR-021 §4 (support a no-op/dev binding; local dev and tests run without a
 * real engine; mock binding proves wiring).
 *
 * IMPORTANT: This binding proves wiring (the seam is connected). It does NOT
 * prove that a real AV scan was performed (ADR-013 / ADR-021 §4).
 */

import type { FileScanner, ScanObjectRef, ScanVerdict } from "../port.js";

// ─── Sentinel constants ───────────────────────────────────────────────────────

/** Keys (or first-512-bytes of stream content) matching this pattern → infected. */
const MALICIOUS_PATTERN = /eicar|malicious/i;

/** Keys (or first-512-bytes of stream content) matching this pattern → indeterminate. */
const INDETERMINATE_PATTERN = /indeterminate/i;

// ─── MockFileScanner ──────────────────────────────────────────────────────────

/**
 * MockFileScanner — the e2e/local-dev AV scanner binding.
 *
 * Deterministic: the verdict is driven entirely by sentinel strings in the
 * object key (or stream content). Given the same key, always returns the same
 * verdict — no randomness, no external calls.
 *
 * The e2e suite (TASK-007-006) drives malicious and clean paths by controlling
 * the key name passed in the upload flow.
 */
export class MockFileScanner implements FileScanner {
  /**
   * Scan an object reference for malware.
   *
   * Verdict is determined by sentinel detection in:
   *   1. The object key (no I/O).
   *   2. Stream content (first 512 bytes), when stream is provided and key is clean.
   *
   * Returns infected / indeterminate / clean based on which sentinel matches first.
   *
   * @param ref - The object reference (key + optional stream).
   */
  async scan(ref: ScanObjectRef): Promise<ScanVerdict> {
    // 1. Check the key first — zero I/O, fully deterministic for key-controlled tests.
    if (MALICIOUS_PATTERN.test(ref.key)) {
      return { verdict: "infected", threat: "EICAR-Test-Signature" };
    }
    if (INDETERMINATE_PATTERN.test(ref.key)) {
      return { verdict: "indeterminate", reason: "mock-indeterminate-sentinel" };
    }

    // 2. Optionally check the first 512 bytes of the stream, if provided.
    //    This allows tests that supply a stream to inject a sentinel via content
    //    when they don't control the key.
    if (ref.stream) {
      const prefix = await readPrefix(ref.stream, 512);
      const text = prefix.toString("utf-8");
      if (MALICIOUS_PATTERN.test(text)) {
        return { verdict: "infected", threat: "EICAR-Test-Signature" };
      }
      if (INDETERMINATE_PATTERN.test(text)) {
        return {
          verdict: "indeterminate",
          reason: "mock-indeterminate-sentinel",
        };
      }
    }

    return { verdict: "clean" };
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Read up to `maxBytes` from a readable stream and return as a Buffer.
 * Does not consume the rest of the stream; the caller is responsible for any
 * further stream handling.
 */
async function readPrefix(
  stream: NodeJS.ReadableStream,
  maxBytes: number,
): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let done = false;

    const finish = () => {
      if (done) return;
      done = true;
      // Pause / destroy to stop further reads — we only need the prefix.
      stream.pause();
      resolve(Buffer.concat(chunks));
    };

    stream.on("data", (chunk: Buffer | string) => {
      if (done) return;
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      const remaining = maxBytes - total;
      if (remaining <= 0) {
        finish();
        return;
      }
      chunks.push(buf.subarray(0, Math.min(buf.length, remaining)));
      total += Math.min(buf.length, remaining);
      if (total >= maxBytes) finish();
    });

    stream.on("end", finish);
    stream.on("error", (err: Error) => {
      if (done) return;
      done = true;
      reject(err);
    });

    stream.resume();
  });
}
