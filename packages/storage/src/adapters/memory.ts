/**
 * packages/storage/src/adapters/memory.ts — MemoryAdapter
 *
 * In-process Map<string, Buffer>-backed implementation for unit tests.
 * NOT a supported runtime target — do not use in production or e2e.
 *
 * Signed URLs are loopback stubs (`http://localhost/storage/<key>?op=...`)
 * that satisfy type checking; the test harness does NOT actually resolve them.
 * The MemoryAdapter is for unit-testing adapter-conformant callers, not for
 * testing URL resolution.
 *
 * TTL caps are enforced via the shared ttl.ts utility — same enforcement
 * point as AzuriteAdapter (ADR-008 § TTL policy).
 *
 * ADR-008: Object Storage Abstraction (Port-and-Adapter)
 */

import { resolveDownloadTtl, resolveUploadTtl } from "../ttl.js";
import type {
  FileStorage,
  ListOptions,
  ObjectStat,
  ObjectSummary,
  PutInput,
  PutResult,
  SignedUploadOptions,
  SignedUrl,
  SignedUrlOptions,
} from "../types.js";

interface StoredBlob {
  data: Buffer;
  contentType: string;
  metadata: Record<string, string>;
  etag: string;
  lastModified: Date;
}

/**
 * In-memory FileStorage adapter for unit tests.
 * @internal — test-only; do NOT export from the public barrel.
 */
export class MemoryAdapter implements FileStorage {
  readonly #store = new Map<string, StoredBlob>();

  async put(input: PutInput): Promise<PutResult> {
    // Collect the body into a Buffer regardless of input shape
    let data: Buffer;
    if (Buffer.isBuffer(input.body)) {
      data = input.body;
    } else if (input.body instanceof Uint8Array) {
      data = Buffer.from(input.body);
    } else {
      // NodeJS.ReadableStream — collect chunks
      const chunks: Buffer[] = [];
      for await (const chunk of input.body as AsyncIterable<unknown>) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
      }
      data = Buffer.concat(chunks);
    }

    const etag = `"${data.length.toString(16)}-${Date.now().toString(16)}"`;
    const blob: StoredBlob = {
      data,
      contentType: input.contentType,
      metadata: input.metadata ?? {},
      etag,
      lastModified: new Date(),
    };
    this.#store.set(input.key, blob);

    return {
      key: input.key,
      etag,
      // MemoryAdapter does not support native versioning
    };
  }

  async getSignedDownloadUrl(
    key: string,
    opts?: SignedUrlOptions,
  ): Promise<SignedUrl> {
    const ttl = resolveDownloadTtl(opts?.ttlSeconds);
    const expiresAt = new Date(Date.now() + ttl * 1000);
    // Stub URL — not resolvable; for unit-test type checking only
    const url =
      `http://localhost/storage/${encodeURIComponent(key)}` +
      `?op=download&expires=${expiresAt.getTime()}`;
    return { url, expiresAt };
  }

  async getSignedUploadUrl(
    key: string,
    opts: SignedUploadOptions,
  ): Promise<SignedUrl> {
    const ttl = resolveUploadTtl(opts.ttlSeconds);
    const expiresAt = new Date(Date.now() + ttl * 1000);
    // Stub URL — not resolvable; for unit-test type checking only
    const url =
      `http://localhost/storage/${encodeURIComponent(key)}` +
      `?op=upload&contentType=${encodeURIComponent(opts.contentType)}&expires=${expiresAt.getTime()}`;
    return { url, expiresAt };
  }

  async delete(key: string): Promise<void> {
    this.#store.delete(key);
  }

  async *list(
    prefix: string,
    opts?: ListOptions,
  ): AsyncIterable<ObjectSummary> {
    let count = 0;
    const max = opts?.maxResults ?? Infinity;
    for (const [key, blob] of this.#store) {
      if (count >= max) break;
      if (key.startsWith(prefix)) {
        yield {
          key,
          sizeBytes: blob.data.byteLength,
          lastModified: blob.lastModified,
        };
        count++;
      }
    }
  }

  async stat(key: string): Promise<ObjectStat | null> {
    const blob = this.#store.get(key);
    if (!blob) return null;
    return {
      key,
      sizeBytes: blob.data.byteLength,
      etag: blob.etag,
      lastModified: blob.lastModified,
      contentType: blob.contentType,
      metadata: blob.metadata,
    };
  }

  /**
   * Expose the raw buffer for test assertions (not part of FileStorage port).
   * @internal — test-only helper
   */
  getRawBuffer(key: string): Buffer | undefined {
    return this.#store.get(key)?.data;
  }

  /**
   * Returns true if the key exists in the store.
   * @internal — test-only helper
   */
  has(key: string): boolean {
    return this.#store.has(key);
  }
}
