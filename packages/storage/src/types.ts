/**
 * packages/storage/src/types.ts — FileStorage port interface + I/O types
 *
 * Interface and type definitions are verbatim to ADR-008 § Interface contract.
 * Do NOT add extra methods (no multipart in v1 — ADR-008 § Narrow on purpose).
 *
 * Apps import only from @tax-portal/storage (the barrel). Concrete adapter
 * classes must never be re-exported into app code.
 *
 * ADR-008: Object Storage Abstraction (Port-and-Adapter)
 * ADR-009: Signed-URL file access (consumes this port)
 * ADR-020: Encryption-at-rest is the adapter contract, NOT app code
 */

// ─── Main Port Interface ──────────────────────────────────────────────────────

export interface FileStorage {
  put(input: PutInput): Promise<PutResult>;
  getSignedDownloadUrl(key: string, opts?: SignedUrlOptions): Promise<SignedUrl>;
  getSignedUploadUrl(key: string, opts?: SignedUploadOptions): Promise<SignedUrl>;
  delete(key: string): Promise<void>;
  list(prefix: string, opts?: ListOptions): AsyncIterable<ObjectSummary>;
  stat(key: string): Promise<ObjectStat | null>;
}

// ─── Input / Output Types ─────────────────────────────────────────────────────

export interface PutInput {
  key: string;
  body: Buffer | Uint8Array | NodeJS.ReadableStream;
  contentType: string;
  contentLength?: number;
  metadata?: Record<string, string>; // opaque string map; flows through adapter-native metadata
}

export interface PutResult {
  key: string;
  etag: string;
  versionId?: string; // populated by adapters that support native versioning; advisory only
}

export interface SignedUrl {
  url: string;
  expiresAt: Date;
}

export interface SignedUrlOptions {
  ttlSeconds?: number; // default: 300 (5 min) for downloads; see § TTL policy
  responseContentType?: string; // optional content-type override for downloads
  responseContentDisposition?: string; // e.g., attachment; filename="..."
}

export interface SignedUploadOptions extends SignedUrlOptions {
  contentType: string; // mandatory — signed into the URL policy
  maxSizeBytes?: number; // optional — signed into the URL policy where supported
}

export interface ObjectStat {
  key: string;
  sizeBytes: number;
  etag: string;
  lastModified: Date;
  contentType: string;
  metadata: Record<string, string>;
}

export interface ObjectSummary {
  key: string;
  sizeBytes: number;
  lastModified: Date;
}

// ─── ListOptions (not in ADR-008 interface signature but needed by list()) ───
// DECISION: ADR-008 declares `list(prefix: string, opts?: ListOptions)` with
// ListOptions referenced but not defined. Providing a minimal shape for
// extensibility. If the ADR is later expanded, match it.
export interface ListOptions {
  maxResults?: number;
}
