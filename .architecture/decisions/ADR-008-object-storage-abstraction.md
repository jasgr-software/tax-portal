# ADR-008: Object Storage Abstraction (Port-and-Adapter)

**Status:** Accepted
**Date:** 2026-04-16
**Deciders:** SA (with user direction)
**Related:** ADR-002 (SQL Server), ADR-003 (Identity propagation), ADR-005 (RLS), ADR-006 (Monorepo layout), ADR-007 (Container packaging), ADR-009 (Signed-URL file access)

## Context

The portal exchanges files between accountant and clients (REQ-FILE-001 through REQ-FILE-012): tax documents, W-2s, receipts, scanned forms, returns. Requirements:

- AES-256 encryption at rest (REQ-FILE-003, ADR-020).
- Never publicly accessible — every download/upload via time-limited signed URL (REQ-FILE-003, REQ-NFR-002).
- 7-year retention after engagement completion (REQ-FILE-005).
- Soft-delete semantics (REQ-FILE-006).
- Any file type (REQ-FILE-002).
- Version history — new version rows retain old content (REQ-FILE-009).

The original plan used Supabase Storage. With Supabase gone (ADR-002) and the deployment platform deferred (ADR-007), **the concrete object-storage provider is also deferred**. What we need right now is:

- A stable interface the app codes against.
- A local-dev adapter that mirrors the production API shape closely enough that prod behaviour is predictable.
- A production-adapter slot that can be filled in Phase 5 with whichever provider the deploy decision picks.

"Gravity" acknowledgement: **Azure Blob Storage is the likely production target** — Azurite (the Azure Blob emulator) is the local adapter, and the SQL Server / Azure Container Apps stack has Azure gravity. But the interface is kept portable so S3, Cloudflare R2, GCS, or self-hosted MinIO remain single-day rewrites.

## Decision

**A port-and-adapter `FileStorage` interface lives in `packages/storage` (ADR-006). The app imports only the interface type. Adapters plug in at startup. Azurite is the local-dev adapter in Epic 001. The production adapter is deferred to Phase 5.**

### Interface

```ts
// packages/storage/src/types.ts

export interface FileStorage {
  put(input: PutInput): Promise<PutResult>;
  getSignedDownloadUrl(key: string, opts?: SignedUrlOptions): Promise<SignedUrl>;
  getSignedUploadUrl(key: string, opts?: SignedUploadOptions): Promise<SignedUrl>;
  delete(key: string): Promise<void>;
  list(prefix: string, opts?: ListOptions): AsyncIterable<ObjectSummary>;
  stat(key: string): Promise<ObjectStat | null>;
}

export interface PutInput {
  key: string;
  body: Buffer | Uint8Array | NodeJS.ReadableStream;
  contentType: string;
  contentLength?: number;
  metadata?: Record<string, string>;   // opaque string map; flows through adapter-native metadata
}

export interface PutResult {
  key: string;
  etag: string;
  versionId?: string;                  // populated by adapters that support native versioning; advisory only
}

export interface SignedUrl {
  url: string;
  expiresAt: Date;
}

export interface SignedUrlOptions {
  ttlSeconds?: number;                 // default: 300 (5 min) for downloads; see § TTL policy
  responseContentType?: string;        // optional content-type override for downloads
  responseContentDisposition?: string; // e.g., attachment; filename="..."
}

export interface SignedUploadOptions extends SignedUrlOptions {
  contentType: string;                 // mandatory — signed into the URL policy
  maxSizeBytes?: number;                // optional — signed into the URL policy where supported
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
```

Interface design notes:

- **Narrow on purpose.** Six methods cover every current use case. No multipart-upload primitives (`createMultipartUpload`, etc.) — the signed-upload URL pattern (ADR-009) lets the browser upload directly, and any multipart concerns are handled by the provider on its side of the signed URL. A future epic that demands server-side multipart adds methods explicitly.
- **Streams for bodies.** `put` accepts `NodeJS.ReadableStream` so large uploads don't buffer in memory. The adapter is responsible for adapter-native streaming (S3 multipart, Azure block blob, etc.).
- **Metadata is opaque.** Callers stuff arbitrary `Record<string, string>` into metadata. Adapters map it to their native metadata API (Azure: `metadata`, S3: `x-amz-meta-*`). Reads round-trip it back.
- **`versionId` is advisory.** Prod adapters that offer native versioning (Azure Blob versioning, S3 versioning) may populate it. Our application-level versioning (ADR-009 § Version history) is authoritative — it rewrites the key on every version. Native versioning is belt-and-braces only.

### Adapters in Epic 001

Two adapters ship in Epic 001:

- **`AzuriteAdapter`** — targets Azurite via the Azure Storage Blob SDK (`@azure/storage-blob`). Configured via connection-string env var. Runs against the `azurite` service in `docker-compose.yml`.
- **`MemoryAdapter`** — in-process `Map<string, Buffer>`-backed implementation for unit tests. Not a supported runtime target.

Epic 001 does **not** ship a production adapter. `STORAGE_ADAPTER` env var is read at startup:

```
STORAGE_ADAPTER=azurite        # Epic 001 — default for local dev + CI
STORAGE_ADAPTER=memory         # Tests only
STORAGE_ADAPTER=cloud          # Reserved for Phase 5 production adapter — binding empty in Epic 001
```

If `STORAGE_ADAPTER=cloud` and no concrete binding has been compiled in, **startup fails with an explicit error** — the app does not silently fall back to in-memory, does not write to the local disk, and does not auto-select an adapter. This is a fail-closed boot check.

### Encryption at rest — adapter-contract requirement

Every compliant adapter must support encryption at rest. Specifically:

- **AzuriteAdapter** — Azurite simulates AES-256 server-side encryption transparently. No per-object encryption config needed in dev.
- **Production adapters** — must be configured with provider-side encryption enabled by default. For Azure Blob, this is the default (SSE enabled on all new accounts). For S3, the bucket must have default encryption (SSE-S3 or SSE-KMS). For GCS, default CMEK or Google-managed keys. For R2, encryption is automatic.
- **Client-side encryption** — not required in v1. The signed-URL model is the primary security boundary; additional client-side encryption is a v2 consideration.

An integration test per adapter asserts that `put(...)` followed by an out-of-band read (via the admin pool) confirms the object is stored encrypted per provider semantics. For Azurite, this is a presence-of-encryption-metadata check. For prod adapters (when they land), it is a direct property inspection on the stored object.

### TTL policy

Default TTLs:

- **Downloads:** 5 minutes (`300s`). Short so that a leaked URL is low-value.
- **Uploads:** 15 minutes (`900s`). Longer so that a slow client on a bad connection can finish uploading before the URL expires.

TTLs are overridable per call but capped in the adapter:

- **Max download TTL:** 1 hour (`3600s`).
- **Max upload TTL:** 1 hour (`3600s`).

Requests for longer TTLs throw. If a future epic (e.g., a background-pipeline job operating on a large file) needs longer, it must use the admin pool and a separate signed-operation (e.g., adapter-native service-to-service copy) — not a longer TTL.

### Signed URL generation runs under the admin principal — after app-side authorization

The app-side authorization gate is enforced **before** signed URL minting:

1. Next.js route handler receives a request like "give me a download URL for `documentId=X`."
2. The handler loads the `Document` row via the request pool (`db`) — RLS filters rows to only what the caller can see (ADR-005). If the document doesn't appear in the result, the handler returns 404.
3. The handler then hands off to `packages/storage` to mint the signed URL. The signing call uses adapter credentials stored in env vars (`STORAGE_CONNECTION_STRING` for AzuriteAdapter) — these are credentials of the adapter / account, not scoped to a specific user.
4. The signed URL is returned.

Critically: **the signing call is orthogonal to the request-pool principal.** The adapter SDK authenticates to the storage service using its own key/connection-string. RLS on the `Document` row (step 2) is the gate; the signing itself cannot be gated at the adapter layer because the adapter talks to a third-party service. This is why ADR-009 describes the full flow — this ADR describes only the port and its contract.

### Naming and keys

Storage key pattern is defined in ADR-009. In this ADR's scope: **keys are opaque strings**, adapters don't interpret them, and adapter tests don't depend on key shape.

### Adapter binding — startup

The app's entrypoint (`apps/web/src/server.ts` for standalone Next.js bootstrap, or `apps/web/src/lib/storage/index.ts` for app-router-triggered initialisation) reads `STORAGE_ADAPTER` and returns the correct implementation:

```ts
export function makeStorage(env: AppEnv): FileStorage {
  switch (env.STORAGE_ADAPTER) {
    case 'azurite':
      return new AzuriteAdapter(env.STORAGE_CONNECTION_STRING, env.STORAGE_CONTAINER);
    case 'memory':
      return new MemoryAdapter();
    case 'cloud':
      throw new Error(
        'STORAGE_ADAPTER=cloud but no production adapter is bound in this build. ' +
        'Epic 001 does not include a production adapter. See ADR-008.',
      );
    default:
      throw new Error(`Unknown STORAGE_ADAPTER: ${env.STORAGE_ADAPTER}`);
  }
}
```

The `cloud` branch exists in Epic 001 explicitly so that an accidental prod-shaped env doesn't silently degrade.

### Configuration contract

Every adapter reads the following env vars (only what it needs):

- `STORAGE_ADAPTER` — `azurite | memory | cloud` (required).
- `STORAGE_CONNECTION_STRING` — adapter-native connection string (Azurite uses Azure's devstore format).
- `STORAGE_CONTAINER` — logical container/bucket name. Default `tax-portal-documents` in dev.

When Phase 5 picks a production adapter, its env contract is documented alongside the adapter, and `.env.example` is updated.

## Alternatives considered

### Direct use of the Azure SDK throughout the app

Skip the port and let `@azure/storage-blob` imports sit in route handlers. Rejected:

- Test ergonomics collapse — every test that touches file access needs an Azurite instance, not a memory adapter.
- A later switch away from Azure is a full rewrite rather than a file swap.
- The `packages/storage` boundary makes ADR-009's signed-URL policy enforceable — all signing goes through one module, which can be audited for TTL caps, key-pattern validation, and authorization-before-sign.

### Single-provider commitment now (pick S3 / Azure Blob in this ADR)

Picking the provider in Epic 001 would let us skip the adapter and code against the SDK directly. Rejected — user asked for deferral; Azure Blob gravity is acknowledged but not locked.

### Upload-via-server pattern (no signed upload URLs)

The client POSTs the file to a Next.js route, which streams it to storage. Simpler auth story (the app is the uploader, so it has full control). Rejected:

- Doubles egress costs (client → app → storage).
- Limits upload size to what the Next.js route + platform ingress can handle (some hosts cap request bodies at 50 MB or 500 MB — tax documents can easily be larger).
- Makes progress indicators harder — the browser sees its PUT to Next.js, not the final destination, so failures are indirect.
- Signed-upload-URL pattern is the industry standard; rejecting it creates friction for no gain.

### Separate services per content type

Store documents in one bucket, avatars in another, attachments in a third. Rejected for v1 — one container, one adapter, keys prefixed by content type (`engagements/...`, `avatars/...`, `attachments/...`) — see ADR-009. Splitting containers is a Phase 5+ conversation if cost or policy reasons emerge.

### Store file bytes in SQL Server

VARBINARY(MAX) column in `Document`. Appealing for transactional consistency — `INSERT Document ... + file content` is one transaction. Rejected:

- SQL Server is not a blob store — backups bloat catastrophically, replication slows, and the DB engine fights for the memory that blob cache wants.
- FILESTREAM / FileTable features bring their own operational complexity and aren't portable across the SQL Server deploy candidates (ADR-002).
- Signed-URL semantics can't be emulated cheaply over SQL Server — we'd end up proxying every download through the app.

Transactional consistency is handled instead by the two-step upload pattern (ADR-009): create `Document` row under admin pool; client uploads via signed URL; webhook / readiness check flips the row's state. Failures leave dangling storage objects that a reconciliation sweep cleans up.

## Consequences

- **Provider decision is Phase-5-cheap.** When the host is chosen, picking the production adapter is a small, contained PR: implement `FileStorage` against the provider SDK, add env-var wiring, pass the existing adapter-conformance test suite.
- **Azure gravity is real but not binding.** Azurite's API is Azure Blob's API. If Phase 5 picks Azure Blob, the adapter is near-identical to the Azurite adapter. If Phase 5 picks S3 or R2, a new adapter is written — maybe a day of work — because the interface is narrow.
- **Tests don't depend on Azurite.** Most tests use `MemoryAdapter`. Integration tests that specifically exercise adapter behaviour (encryption, listing semantics) run against Azurite in CI via docker-compose.
- **Fail-closed boot prevents accidental prod regressions.** A build that hasn't had a cloud adapter compiled in cannot accidentally run in cloud mode. This catches "forgot to wire the prod adapter in the container image" at startup rather than at first file upload.
- **Signed-URL policy is centralisable.** All signing goes through `packages/storage`, so when ADR-009's rules (TTL caps, key patterns) are enforced, they are enforced in one place. Future security audits inspect one module, not every route handler.
- **Encryption-at-rest is adapter-contract, not application-contract.** The app doesn't hand-roll encryption. The adapter inherits the provider's default encryption. Migration between providers preserves the encryption posture as long as the new adapter is also configured with defaults on.
- **Multipart / resumable uploads are a later feature.** If a client needs to upload a 5 GB file from a flaky connection, a later epic adds the needed primitives. Not a v1 concern — tax docs are typically <50 MB.
- **Signed URLs are never persisted.** A URL is minted on demand and handed back in the API response. Storing them in the DB would extend their effective lifetime (anyone reading the column later could use them) — the model is stateless URL generation, not URL caching.
- **Observability.** Every signed-URL issuance logs: caller Clerk user ID, document ID, operation (download/upload), TTL, adapter used. Downloads that never fire (URL issued but never GET'd) are not visible to the app — accepted. Uploads that never complete are detected by the readiness pattern in ADR-009.

## Related

- **ADR-002** — SQL Server as datastore; motivates "don't store blobs in DB."
- **ADR-005** — RLS via Security Policies; authorization gate before signing lives on RLS-scoped `Document` reads.
- **ADR-006** — Monorepo layout; defines `packages/storage` shape.
- **ADR-007** — Container packaging; the storage adapter is orthogonal to the host, making both deferrable.
- **ADR-009** — Signed-URL file access; the behavioural-layer ADR that consumes this ADR's port.
- **SRS** — REQ-FILE-002, REQ-FILE-003, REQ-FILE-005, REQ-FILE-006, REQ-FILE-009, REQ-NFR-002.
- **ADR-005 / ADR-020** — security non-negotiable; encryption-at-rest and signed URLs derive from this.
