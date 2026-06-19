/**
 * packages/storage/src/storage.test.ts — Unit tests for @tax-portal/storage
 *
 * Covers:
 *   - MemoryAdapter conformance (put→stat round-trip, list, delete)
 *   - TTL cap enforcement (download + upload — ADR-008 § TTL policy)
 *   - makeStorage fail-closed matrix (cloud → throw, unknown → throw)
 *
 * AC-FILE-003-01 (partial): adapter contract that delivers TTL enforcement
 * and fail-closed boot. The tier-3 encryption-at-rest proof is in
 * storage.integration.test.ts (real Azurite container).
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import { MemoryAdapter } from "./adapters/memory.js";
import { makeStorage, resetStorageForTesting } from "./select.js";
import { TTL, resolveDownloadTtl, resolveUploadTtl } from "./ttl.js";

afterEach(() => {
  resetStorageForTesting();
  vi.restoreAllMocks();
});

// ─── MemoryAdapter Conformance ────────────────────────────────────────────────

describe("MemoryAdapter", () => {
  describe("put → stat round-trip", () => {
    it("reflects key, size, contentType, and metadata after put", async () => {
      const adapter = new MemoryAdapter();
      const body = Buffer.from("hello tax portal");
      const result = await adapter.put({
        key: "engagements/abc/doc.pdf",
        body,
        contentType: "application/pdf",
        metadata: { engagementId: "abc", uploadedBy: "client-1" },
      });

      expect(result.key).toBe("engagements/abc/doc.pdf");
      expect(result.etag).toBeTruthy();

      const stat = await adapter.stat("engagements/abc/doc.pdf");
      expect(stat).not.toBeNull();
      expect(stat!.key).toBe("engagements/abc/doc.pdf");
      expect(stat!.sizeBytes).toBe(body.byteLength);
      expect(stat!.contentType).toBe("application/pdf");
      expect(stat!.metadata).toEqual({
        engagementId: "abc",
        uploadedBy: "client-1",
      });
      expect(stat!.etag).toBe(result.etag);
      expect(stat!.lastModified).toBeInstanceOf(Date);
    });

    it("stat returns null for a key that was never stored", async () => {
      const adapter = new MemoryAdapter();
      const result = await adapter.stat("nonexistent/key.pdf");
      expect(result).toBeNull();
    });

    it("overwrites existing key on re-put", async () => {
      const adapter = new MemoryAdapter();
      await adapter.put({
        key: "docs/file.txt",
        body: Buffer.from("first"),
        contentType: "text/plain",
      });
      await adapter.put({
        key: "docs/file.txt",
        body: Buffer.from("second version"),
        contentType: "text/plain",
      });
      const stat = await adapter.stat("docs/file.txt");
      expect(stat!.sizeBytes).toBe(14); // "second version".length
    });

    it("accepts Uint8Array body", async () => {
      const adapter = new MemoryAdapter();
      const body = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // %PDF magic
      await adapter.put({
        key: "docs/test.pdf",
        body,
        contentType: "application/pdf",
      });
      const stat = await adapter.stat("docs/test.pdf");
      expect(stat!.sizeBytes).toBe(4);
    });

    it("put without metadata produces empty metadata record in stat", async () => {
      const adapter = new MemoryAdapter();
      await adapter.put({
        key: "docs/bare.pdf",
        body: Buffer.from("data"),
        contentType: "application/pdf",
      });
      const stat = await adapter.stat("docs/bare.pdf");
      expect(stat!.metadata).toEqual({});
    });
  });

  describe("delete", () => {
    it("removes the key; subsequent stat returns null", async () => {
      const adapter = new MemoryAdapter();
      await adapter.put({
        key: "docs/to-delete.pdf",
        body: Buffer.from("delete me"),
        contentType: "application/pdf",
      });
      expect(await adapter.stat("docs/to-delete.pdf")).not.toBeNull();
      await adapter.delete("docs/to-delete.pdf");
      expect(await adapter.stat("docs/to-delete.pdf")).toBeNull();
    });

    it("delete of non-existent key is a no-op (does not throw)", async () => {
      const adapter = new MemoryAdapter();
      await expect(adapter.delete("nonexistent.pdf")).resolves.toBeUndefined();
    });
  });

  describe("list", () => {
    it("yields only keys matching the prefix", async () => {
      const adapter = new MemoryAdapter();
      await adapter.put({
        key: "engagements/123/w2.pdf",
        body: Buffer.from("a"),
        contentType: "application/pdf",
      });
      await adapter.put({
        key: "engagements/123/receipt.pdf",
        body: Buffer.from("b"),
        contentType: "application/pdf",
      });
      await adapter.put({
        key: "engagements/999/other.pdf",
        body: Buffer.from("c"),
        contentType: "application/pdf",
      });

      const results: string[] = [];
      for await (const obj of adapter.list("engagements/123/")) {
        results.push(obj.key);
      }
      expect(results.sort()).toEqual([
        "engagements/123/receipt.pdf",
        "engagements/123/w2.pdf",
      ]);
    });

    it("respects maxResults option", async () => {
      const adapter = new MemoryAdapter();
      for (let i = 0; i < 5; i++) {
        await adapter.put({
          key: `docs/file-${i.toString()}.pdf`,
          body: Buffer.from(`file ${i.toString()}`),
          contentType: "application/pdf",
        });
      }
      const results: string[] = [];
      for await (const obj of adapter.list("docs/", { maxResults: 2 })) {
        results.push(obj.key);
      }
      expect(results).toHaveLength(2);
    });

    it("returns ObjectSummary shape (key, sizeBytes, lastModified)", async () => {
      const adapter = new MemoryAdapter();
      const body = Buffer.from("content");
      await adapter.put({
        key: "docs/shape.pdf",
        body,
        contentType: "application/pdf",
      });
      const items: import("./types.js").ObjectSummary[] = [];
      for await (const obj of adapter.list("docs/")) {
        items.push(obj);
      }
      expect(items).toHaveLength(1);
      expect(items[0]!.key).toBe("docs/shape.pdf");
      expect(items[0]!.sizeBytes).toBe(body.byteLength);
      expect(items[0]!.lastModified).toBeInstanceOf(Date);
    });
  });

  describe("getSignedDownloadUrl", () => {
    it("returns a stub URL with an expiresAt in the future", async () => {
      const adapter = new MemoryAdapter();
      const before = Date.now();
      const result = await adapter.getSignedDownloadUrl("docs/file.pdf");
      const after = Date.now();

      expect(result.url).toContain("localhost");
      expect(result.url).toContain("docs%2Ffile.pdf");
      expect(result.expiresAt.getTime()).toBeGreaterThanOrEqual(
        before + TTL.DOWNLOAD_DEFAULT_S * 1000,
      );
      expect(result.expiresAt.getTime()).toBeLessThanOrEqual(
        after + TTL.DOWNLOAD_DEFAULT_S * 1000 + 100,
      );
    });

    it("uses custom ttlSeconds when provided", async () => {
      const adapter = new MemoryAdapter();
      const ttl = 60;
      const before = Date.now();
      const result = await adapter.getSignedDownloadUrl("docs/file.pdf", {
        ttlSeconds: ttl,
      });
      expect(result.expiresAt.getTime()).toBeGreaterThanOrEqual(
        before + ttl * 1000,
      );
    });
  });

  describe("getSignedUploadUrl", () => {
    it("returns a stub URL with an expiresAt in the future", async () => {
      const adapter = new MemoryAdapter();
      const before = Date.now();
      const result = await adapter.getSignedUploadUrl("docs/new.pdf", {
        contentType: "application/pdf",
      });
      const after = Date.now();

      expect(result.url).toContain("localhost");
      expect(result.expiresAt.getTime()).toBeGreaterThanOrEqual(
        before + TTL.UPLOAD_DEFAULT_S * 1000,
      );
      expect(result.expiresAt.getTime()).toBeLessThanOrEqual(
        after + TTL.UPLOAD_DEFAULT_S * 1000 + 100,
      );
    });
  });
});

// ─── TTL Cap Enforcement ──────────────────────────────────────────────────────

describe("TTL cap enforcement (ADR-008 § TTL policy)", () => {
  describe("resolveDownloadTtl", () => {
    it("returns DOWNLOAD_DEFAULT_S when no TTL is specified", () => {
      expect(resolveDownloadTtl()).toBe(TTL.DOWNLOAD_DEFAULT_S);
      expect(resolveDownloadTtl(undefined)).toBe(TTL.DOWNLOAD_DEFAULT_S);
    });

    it("returns the specified TTL when within the cap", () => {
      expect(resolveDownloadTtl(60)).toBe(60);
      expect(resolveDownloadTtl(TTL.DOWNLOAD_MAX_S)).toBe(TTL.DOWNLOAD_MAX_S);
    });

    it("throws when TTL exceeds DOWNLOAD_MAX_S", () => {
      expect(() => resolveDownloadTtl(TTL.DOWNLOAD_MAX_S + 1)).toThrow(
        /exceeds the maximum allowed/,
      );
      expect(() => resolveDownloadTtl(7200)).toThrow(
        /exceeds the maximum allowed/,
      );
    });
  });

  describe("resolveUploadTtl", () => {
    it("returns UPLOAD_DEFAULT_S when no TTL is specified", () => {
      expect(resolveUploadTtl()).toBe(TTL.UPLOAD_DEFAULT_S);
    });

    it("returns the specified TTL when within the cap", () => {
      expect(resolveUploadTtl(300)).toBe(300);
      expect(resolveUploadTtl(TTL.UPLOAD_MAX_S)).toBe(TTL.UPLOAD_MAX_S);
    });

    it("throws when TTL exceeds UPLOAD_MAX_S", () => {
      expect(() => resolveUploadTtl(TTL.UPLOAD_MAX_S + 1)).toThrow(
        /exceeds the maximum allowed/,
      );
    });
  });

  describe("MemoryAdapter TTL cap via adapter method calls", () => {
    it("getSignedDownloadUrl throws when ttlSeconds > DOWNLOAD_MAX_S", async () => {
      const adapter = new MemoryAdapter();
      await expect(
        adapter.getSignedDownloadUrl("key", {
          ttlSeconds: TTL.DOWNLOAD_MAX_S + 1,
        }),
      ).rejects.toThrow(/exceeds the maximum allowed/);
    });

    it("getSignedUploadUrl throws when ttlSeconds > UPLOAD_MAX_S", async () => {
      const adapter = new MemoryAdapter();
      await expect(
        adapter.getSignedUploadUrl("key", {
          contentType: "application/pdf",
          ttlSeconds: TTL.UPLOAD_MAX_S + 1,
        }),
      ).rejects.toThrow(/exceeds the maximum allowed/);
    });
  });
});

// ─── makeStorage Fail-Closed Matrix ──────────────────────────────────────────

describe("makeStorage fail-closed matrix (ADR-008 § Adapter binding)", () => {
  it("STORAGE_ADAPTER=cloud throws with explicit 'no production adapter' message", () => {
    expect(() =>
      makeStorage({ STORAGE_ADAPTER: "cloud" }),
    ).toThrow(/no production adapter is bound/);
  });

  it("STORAGE_ADAPTER=CLOUD (uppercase) throws — adapter check is case-insensitive", () => {
    expect(() =>
      makeStorage({ STORAGE_ADAPTER: "CLOUD" }),
    ).toThrow(/no production adapter is bound/);
  });

  it("STORAGE_ADAPTER=unknown throws with unknown-value message", () => {
    expect(() =>
      makeStorage({ STORAGE_ADAPTER: "s3" }),
    ).toThrow(/Unknown or missing STORAGE_ADAPTER/);
  });

  it("STORAGE_ADAPTER=empty-string throws", () => {
    expect(() =>
      makeStorage({ STORAGE_ADAPTER: "" }),
    ).toThrow(/Unknown or missing STORAGE_ADAPTER/);
  });

  it("STORAGE_ADAPTER missing entirely throws", () => {
    expect(() => makeStorage({})).toThrow(/Unknown or missing STORAGE_ADAPTER/);
  });

  it("STORAGE_ADAPTER=memory returns a MemoryAdapter (implements FileStorage)", () => {
    const storage = makeStorage({ STORAGE_ADAPTER: "memory" });
    expect(typeof storage.put).toBe("function");
    expect(typeof storage.stat).toBe("function");
    expect(typeof storage.getSignedDownloadUrl).toBe("function");
    expect(typeof storage.getSignedUploadUrl).toBe("function");
    expect(typeof storage.delete).toBe("function");
    expect(typeof storage.list).toBe("function");
  });

  it("STORAGE_ADAPTER=azurite requires STORAGE_CONNECTION_STRING", () => {
    expect(() =>
      makeStorage({
        STORAGE_ADAPTER: "azurite",
        // No STORAGE_CONNECTION_STRING
      }),
    ).toThrow(/STORAGE_CONNECTION_STRING/);
  });

  it("STORAGE_ADAPTER=azurite with connection string returns an AzuriteAdapter", () => {
    const storage = makeStorage({
      STORAGE_ADAPTER: "azurite",
      STORAGE_CONNECTION_STRING:
        "DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;" +
        "AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;" +
        "BlobEndpoint=http://127.0.0.1:10000/devstoreaccount1",
      STORAGE_CONTAINER: "test-container",
    });
    expect(typeof storage.put).toBe("function");
    expect(typeof storage.stat).toBe("function");
  });
});

// ─── TTL Constants sanity ──────────────────────────────────────────────────────

describe("TTL constants (ADR-008 § TTL policy)", () => {
  it("DOWNLOAD_DEFAULT_S is 300 (5 min)", () => {
    expect(TTL.DOWNLOAD_DEFAULT_S).toBe(300);
  });

  it("DOWNLOAD_MAX_S is 3600 (1 hour)", () => {
    expect(TTL.DOWNLOAD_MAX_S).toBe(3600);
  });

  it("UPLOAD_DEFAULT_S is 900 (15 min)", () => {
    expect(TTL.UPLOAD_DEFAULT_S).toBe(900);
  });

  it("UPLOAD_MAX_S is 3600 (1 hour)", () => {
    expect(TTL.UPLOAD_MAX_S).toBe(3600);
  });
});
