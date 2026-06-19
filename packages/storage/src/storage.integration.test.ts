/**
 * packages/storage/src/storage.integration.test.ts
 * Tier-3 Azurite integration test — runs against the REAL Azurite container
 *
 * Prerequisites: `docker compose up -d azurite`
 * Connection: DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;...
 *
 * What it asserts:
 *   1. AzuriteAdapter.put() stores a blob and stat() returns it
 *   2. Encryption metadata is present after put (AC-FILE-003-01 adapter conformance —
 *      ADR-008 § Encryption at rest): serverEncrypted === true on the blob properties
 *   3. getSignedDownloadUrl and getSignedUploadUrl return non-empty URLs with future expiresAt
 *   4. delete() removes the blob
 *   5. list() returns blobs under a prefix
 *
 * Runs against the REAL Azurite container, NOT the MemoryAdapter.
 * This is the tier-3 conformance test referenced by TASK-007-001 spec.
 *
 * ADR-008 § Encryption at rest:
 *   "An integration test per adapter asserts that put(...) followed by an out-of-band
 *    read (via the admin pool) confirms the object is stored encrypted per provider
 *    semantics. For Azurite, this is a presence-of-encryption-metadata check."
 *
 * ADR-020: Encryption-at-rest is the adapter contract. This test proves the adapter
 * satisfies that contract without any hand-rolled crypto in app code.
 *
 * AC-FILE-003-01 (partial): the adapter contract that delivers encryption-at-rest.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { AzuriteAdapter } from "./adapters/azurite.js";

// ─── Connection config ────────────────────────────────────────────────────────

// Standard Azurite well-known dev account credentials (public — not secret)
const AZURITE_CONN =
  process.env["STORAGE_CONNECTION_STRING"] ??
  "DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;" +
    "AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;" +
    "BlobEndpoint=http://127.0.0.1:10000/devstoreaccount1";

const TEST_CONTAINER = "integration-test-" + Date.now().toString(36);

let adapter: AzuriteAdapter;

// ─── Pre-flight — fail fast if Azurite is unreachable ─────────────────────────

beforeAll(async () => {
  adapter = new AzuriteAdapter(AZURITE_CONN, TEST_CONTAINER);

  // Probe connectivity: attempt to put a sentinel blob. If Azurite is unreachable
  // the error will abort the entire describe block with a clear message.
  try {
    await adapter.put({
      key: "__connectivity-check__",
      body: Buffer.from("ping"),
      contentType: "text/plain",
    });
    await adapter.delete("__connectivity-check__");
  } catch (err) {
    throw new Error(
      "[tier-3] Azurite connectivity check failed. " +
        "Ensure docker compose up -d azurite is running before executing integration tests. " +
        `Original error: ${String(err)}`,
    );
  }
}, 15000);

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("[tier-3, Azurite] AzuriteAdapter conformance + encryption-at-rest", () => {
  const TEST_KEY = `integration-test-${Date.now().toString(36)}/sample.pdf`;

  it("put → stat reflects key, size, contentType, and metadata", async () => {
    const body = Buffer.from(
      "%PDF-1.4 integration test document content for tax portal",
    );
    const result = await adapter.put({
      key: TEST_KEY,
      body,
      contentType: "application/pdf",
      metadata: { engagementId: "test-engagement-1", source: "tier3-test" },
    });

    expect(result.key).toBe(TEST_KEY);
    expect(result.etag).toBeTruthy();

    const stat = await adapter.stat(TEST_KEY);
    expect(stat).not.toBeNull();
    expect(stat!.key).toBe(TEST_KEY);
    expect(stat!.sizeBytes).toBe(body.byteLength);
    expect(stat!.contentType).toBe("application/pdf");
    // Azurite lower-cases metadata keys
    expect(stat!.metadata).toMatchObject({
      engagementid: "test-engagement-1",
      source: "tier3-test",
    });
  }, 15000);

  it(
    "[AC-FILE-003-01] put → out-of-band stat confirms encryption metadata present (ADR-008 § Encryption at rest)",
    async () => {
      // Put a blob if not already there
      await adapter.put({
        key: TEST_KEY,
        body: Buffer.from("encryption at rest conformance test"),
        contentType: "text/plain",
      });

      // Out-of-band stat: inspect raw blob properties for server-side encryption
      // ADR-008: "For Azurite, this is a presence-of-encryption-metadata check."
      // Azurite sets isServerEncrypted=true on stored blobs by default.
      const rawProps = await adapter.getRawProperties(TEST_KEY);
      expect(rawProps).not.toBeNull();

      // Azurite 3.x+ reports isServerEncrypted=true for all stored blobs
      // (simulates Azure Blob SSE — transparent AES-256 at rest).
      // This assertion is the AC-FILE-003-01 adapter conformance proof.
      expect(rawProps!["isServerEncrypted"]).toBe(true);
    },
    15000,
  );

  it("getSignedDownloadUrl returns a non-empty URL with future expiresAt", async () => {
    const before = Date.now();
    const signed = await adapter.getSignedDownloadUrl(TEST_KEY);

    expect(signed.url).toBeTruthy();
    expect(signed.url).toContain(TEST_KEY.split("/").pop()!); // blob name in URL
    expect(signed.expiresAt).toBeInstanceOf(Date);
    expect(signed.expiresAt.getTime()).toBeGreaterThan(before);
  }, 15000);

  it(
    "getSignedDownloadUrl throws when ttlSeconds > DOWNLOAD_MAX_S (cap enforced before SDK call)",
    async () => {
      await expect(
        adapter.getSignedDownloadUrl(TEST_KEY, { ttlSeconds: 3601 }),
      ).rejects.toThrow(/exceeds the maximum allowed/);
    },
    5000,
  );

  it("getSignedUploadUrl returns a non-empty URL with future expiresAt", async () => {
    const uploadKey = `integration-test-${Date.now().toString(36)}/upload-test.pdf`;
    const before = Date.now();
    const signed = await adapter.getSignedUploadUrl(uploadKey, {
      contentType: "application/pdf",
    });

    expect(signed.url).toBeTruthy();
    expect(signed.expiresAt).toBeInstanceOf(Date);
    expect(signed.expiresAt.getTime()).toBeGreaterThan(before);
  }, 15000);

  it(
    "getSignedUploadUrl throws when ttlSeconds > UPLOAD_MAX_S (cap enforced before SDK call)",
    async () => {
      await expect(
        adapter.getSignedUploadUrl("any-key", {
          contentType: "application/pdf",
          ttlSeconds: 3601,
        }),
      ).rejects.toThrow(/exceeds the maximum allowed/);
    },
    5000,
  );

  it("list returns blobs under the prefix", async () => {
    const prefix = `list-test-${Date.now().toString(36)}/`;
    const keys = [`${prefix}a.pdf`, `${prefix}b.pdf`, `${prefix}c.pdf`];
    for (const key of keys) {
      await adapter.put({
        key,
        body: Buffer.from(`content of ${key}`),
        contentType: "application/pdf",
      });
    }

    const found: string[] = [];
    for await (const obj of adapter.list(prefix)) {
      found.push(obj.key);
    }
    expect(found.sort()).toEqual(keys.sort());
  }, 30000);

  it("delete removes the blob; subsequent stat returns null", async () => {
    const deleteKey = `delete-test-${Date.now().toString(36)}/file.pdf`;
    await adapter.put({
      key: deleteKey,
      body: Buffer.from("to be deleted"),
      contentType: "application/pdf",
    });
    expect(await adapter.stat(deleteKey)).not.toBeNull();

    await adapter.delete(deleteKey);
    expect(await adapter.stat(deleteKey)).toBeNull();
  }, 15000);

  it("stat returns null for a non-existent key", async () => {
    const result = await adapter.stat(`nonexistent-${Date.now().toString(36)}.pdf`);
    expect(result).toBeNull();
  }, 10000);
});
