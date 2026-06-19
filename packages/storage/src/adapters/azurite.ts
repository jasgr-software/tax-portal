/**
 * packages/storage/src/adapters/azurite.ts — AzuriteAdapter
 *
 * Targets Azurite (Azure Blob Storage emulator) via @azure/storage-blob.
 *
 * IMPORTANT: This is the ONLY module in the entire codebase that may import
 * @azure/storage-blob. App code in apps/** must NEVER import @azure/storage-blob
 * directly — ADR-008 enforces the seam via this adapter.
 *
 * Encryption at rest (ADR-008 § Encryption at rest / ADR-020):
 *   Azurite simulates AES-256 server-side encryption transparently. No per-object
 *   encryption config is required in dev. The adapter does NOT hand-roll crypto.
 *   The encryption conformance integration test (storage.integration.test.ts) asserts
 *   that stored objects have encryption metadata present via an out-of-band stat call.
 *
 * TTL caps (ADR-008 § TTL policy):
 *   Enforced by resolveDownloadTtl() and resolveUploadTtl() from ttl.ts.
 *   Requests for TTLs exceeding the caps throw before any SDK call.
 *
 * Storage keys are opaque to this adapter (ADR-008 § Naming — ADR-009 constructs
 * the key pattern at the caller layer, not here).
 *
 * ADR-008: Object Storage Abstraction (Port-and-Adapter)
 * ADR-009: Signed-URL file access
 * ADR-013: No cloud KMS/secrets SDK in app code
 * ADR-020: Encryption-at-rest is the adapter contract
 */

import {
  BlobSASPermissions,
  BlobServiceClient,
  StorageSharedKeyCredential,
  generateBlobSASQueryParameters,
} from "@azure/storage-blob";
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

/**
 * AzuriteAdapter — FileStorage implementation targeting Azurite / Azure Blob Storage.
 * @internal — not exported from the public barrel; consumers get the FileStorage interface.
 */
export class AzuriteAdapter implements FileStorage {
  readonly #client: BlobServiceClient;
  readonly #containerName: string;
  readonly #credential: StorageSharedKeyCredential;

  constructor(connectionString: string, containerName: string) {
    this.#client = BlobServiceClient.fromConnectionString(connectionString);
    this.#containerName = containerName;
    // Extract the shared key credential for SAS generation
    // Azurite uses the well-known dev account/key — prod adapters provide their own
    this.#credential = extractCredential(connectionString);
  }

  /**
   * Ensure the container exists (idempotent). Called lazily before first use.
   */
  async #ensureContainer(): Promise<void> {
    const container = this.#client.getContainerClient(this.#containerName);
    // createIfNotExists is idempotent — safe to call on every operation
    await container.createIfNotExists();
  }

  async put(input: PutInput): Promise<PutResult> {
    await this.#ensureContainer();
    const container = this.#client.getContainerClient(this.#containerName);
    const blob = container.getBlockBlobClient(input.key);

    let etag: string;
    let versionId: string | undefined;

    if (Buffer.isBuffer(input.body) || input.body instanceof Uint8Array) {
      const data = Buffer.isBuffer(input.body)
        ? input.body
        : Buffer.from(input.body);
      const uploadOpts = input.metadata !== undefined
        ? {
            blobHTTPHeaders: { blobContentType: input.contentType },
            metadata: input.metadata,
          }
        : { blobHTTPHeaders: { blobContentType: input.contentType } };
      const result = await blob.upload(data, data.byteLength, uploadOpts);
      etag = result.etag ?? "";
      versionId = result.versionId;
    } else {
      // NodeJS.ReadableStream — use a Readable from Node's stream module
      // The Azure SDK expects a Node.js Readable, not a web ReadableStream.
      // DECISION: cast as import("stream").Readable since the ADR-008 interface
      // types the body as NodeJS.ReadableStream which maps to Node's Readable.
      const streamOpts = input.metadata !== undefined
        ? {
            blobHTTPHeaders: { blobContentType: input.contentType },
            metadata: input.metadata,
          }
        : { blobHTTPHeaders: { blobContentType: input.contentType } };
      const result = await blob.uploadStream(
        input.body as import("stream").Readable,
        undefined, // bufferSize (default)
        undefined, // maxConcurrency (default)
        streamOpts,
      );
      etag = result.etag ?? "";
      versionId = result.versionId;
    }

    // exactOptionalPropertyTypes: only include versionId if it is defined
    if (versionId !== undefined) {
      return { key: input.key, etag, versionId };
    }
    return { key: input.key, etag };
  }

  async getSignedDownloadUrl(
    key: string,
    opts?: SignedUrlOptions,
  ): Promise<SignedUrl> {
    const ttlSeconds = resolveDownloadTtl(opts?.ttlSeconds);
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    const startsOn = new Date();

    // exactOptionalPropertyTypes: only include optional fields if they are defined
    const sasValues = {
      containerName: this.#containerName,
      blobName: key,
      permissions: BlobSASPermissions.parse("r"),
      startsOn,
      expiresOn: expiresAt,
      ...(opts?.responseContentType !== undefined && { contentType: opts.responseContentType }),
      ...(opts?.responseContentDisposition !== undefined && { contentDisposition: opts.responseContentDisposition }),
    };
    const sasParams = generateBlobSASQueryParameters(sasValues, this.#credential);

    const blobUrl = this.#client
      .getContainerClient(this.#containerName)
      .getBlobClient(key).url;

    const url = `${blobUrl}?${sasParams.toString()}`;
    return { url, expiresAt };
  }

  async getSignedUploadUrl(
    key: string,
    opts: SignedUploadOptions,
  ): Promise<SignedUrl> {
    // Ensure the container exists before minting the signed upload URL.
    // If the container doesn't exist and the client PUTs to the signed URL,
    // Azurite returns 404 (BlobContainerNotFound) — the PUT silently fails.
    // ensureContainer is idempotent (createIfNotExists) so this is safe on every call.
    await this.#ensureContainer();

    const ttlSeconds = resolveUploadTtl(opts.ttlSeconds);
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    const startsOn = new Date();

    const sasParams = generateBlobSASQueryParameters(
      {
        containerName: this.#containerName,
        blobName: key,
        permissions: BlobSASPermissions.parse("w"),
        startsOn,
        expiresOn: expiresAt,
        contentType: opts.contentType,
      },
      this.#credential,
    );

    const blobUrl = this.#client
      .getContainerClient(this.#containerName)
      .getBlobClient(key).url;

    const url = `${blobUrl}?${sasParams.toString()}`;
    return { url, expiresAt };
  }

  async delete(key: string): Promise<void> {
    const container = this.#client.getContainerClient(this.#containerName);
    const blob = container.getBlobClient(key);
    // deleteIfExists is safe — silently succeeds if blob doesn't exist
    await blob.deleteIfExists();
  }

  async *list(
    prefix: string,
    opts?: ListOptions,
  ): AsyncIterable<ObjectSummary> {
    const container = this.#client.getContainerClient(this.#containerName);
    const max = opts?.maxResults ?? Infinity;
    let count = 0;

    for await (const item of container.listBlobsFlat({ prefix })) {
      if (count >= max) break;
      yield {
        key: item.name,
        sizeBytes: item.properties.contentLength ?? 0,
        lastModified: item.properties.lastModified ?? new Date(),
      };
      count++;
    }
  }

  async stat(key: string): Promise<ObjectStat | null> {
    const container = this.#client.getContainerClient(this.#containerName);
    const blob = container.getBlobClient(key);
    try {
      const props = await blob.getProperties();
      return {
        key,
        sizeBytes: props.contentLength ?? 0,
        etag: props.etag ?? "",
        lastModified: props.lastModified ?? new Date(),
        contentType: props.contentType ?? "",
        metadata: (props.metadata as Record<string, string>) ?? {},
      };
    } catch (err) {
      // BlobNotFound → return null (matching interface contract)
      const e = err as { statusCode?: number; code?: string };
      if (e.statusCode === 404 || e.code === "BlobNotFound") {
        return null;
      }
      throw err;
    }
  }

  /**
   * Out-of-band properties for integration test assertions (encryption metadata check).
   * Returns the raw blob properties including server-encryption metadata.
   * @internal — used in tier-3 integration tests only, not part of FileStorage port.
   */
  async getRawProperties(key: string): Promise<Record<string, unknown> | null> {
    const container = this.#client.getContainerClient(this.#containerName);
    const blob = container.getBlobClient(key);
    try {
      const props = await blob.getProperties();
      // Return the full properties object as a record for test inspection
      return props as unknown as Record<string, unknown>;
    } catch (err) {
      const e = err as { statusCode?: number };
      if (e.statusCode === 404) return null;
      throw err;
    }
  }
}

/**
 * Extract a StorageSharedKeyCredential from an Azurite / Azure Blob connection string.
 * Connection string format:
 *   DefaultEndpointsProtocol=...;AccountName=<name>;AccountKey=<key>;BlobEndpoint=...
 * or Azurite shorthand:
 *   UseDevelopmentStorage=true
 */
function extractCredential(
  connectionString: string,
): StorageSharedKeyCredential {
  // Azurite shorthand
  if (connectionString === "UseDevelopmentStorage=true") {
    return new StorageSharedKeyCredential(
      "devstoreaccount1",
      "Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==",
    );
  }

  const parts: Record<string, string> = {};
  for (const segment of connectionString.split(";")) {
    const eqIdx = segment.indexOf("=");
    if (eqIdx > 0) {
      const k = segment.slice(0, eqIdx);
      const v = segment.slice(eqIdx + 1);
      parts[k] = v;
    }
  }

  const accountName = parts["AccountName"];
  const accountKey = parts["AccountKey"];

  if (!accountName || !accountKey) {
    throw new Error(
      "[packages/storage] AzuriteAdapter: STORAGE_CONNECTION_STRING must contain " +
        "AccountName and AccountKey. " +
        "Local Azurite format: DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;" +
        "AccountKey=<key>;BlobEndpoint=http://127.0.0.1:10000/devstoreaccount1",
    );
  }

  return new StorageSharedKeyCredential(accountName, accountKey);
}
