/**
 * packages/db/src/document.encryption.rls.test.ts
 *
 * TIER-3 INTEGRATION TEST — requires real Azurite container
 * (docker compose up -d azurite must be running)
 *
 * Proves AC-FILE-003-01: encryption-at-rest is satisfied by the storage adapter
 * when a Document is uploaded through the pipeline (insertPendingDocument + storage.put).
 *
 * The @azure/storage-blob SDK exposes `serverEncrypted` on BlobProperties.
 * Azurite sets serverEncrypted=true for all blobs (mirrors Azure Blob Storage TDE).
 * This test reaches Azurite DIRECTLY via the AzuriteAdapter (not the MemoryAdapter)
 * to prove the conformance assertion of the upload path.
 *
 * ADR-020: Encryption-at-rest is the ADAPTER contract, not app code.
 *          No hand-rolled crypto may appear in the pipeline code.
 *          The adapter guarantees encryption; this test proves the adapter
 *          is exercised through the upload path.
 *
 * ADR-008 § Encryption at rest:
 *   "An integration test per adapter asserts that put(...) followed by an out-of-band
 *    read (via the admin pool) confirms the object is stored encrypted per provider
 *    semantics. For Azurite, this is a presence-of-encryption-metadata check."
 *
 * AC-FILE-003-01: "Uploaded files are encrypted at rest."
 *
 * CROSS-REFERENCE: packages/storage/src/storage.integration.test.ts covers the
 * AzuriteAdapter conformance in depth (serverEncrypted=true assertion via the SDK).
 * This test proves the same guarantee holds when the adapter is reached via the
 * packages/db upload pipeline path (insertPendingDocument → storage.put).
 *
 * Environment:
 *   STORAGE_ADAPTER            — must be "azurite"
 *   STORAGE_CONNECTION_STRING  — Azurite connection string
 *   DATABASE_URL_ADMIN         — admin pool (for DB cleanup)
 *   DATABASE_URL               — request pool (for audit pattern verification)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import mssqlPkg from "mssql";
import { BlobServiceClient } from "@azure/storage-blob";
import { parseSqlServerUrl } from "./sql-server-url.js";
import { insertPendingDocument } from "./repositories/document.js";
import { getStorage, resetStorageForTesting } from "@tax-portal/storage";

const { ConnectionPool } = mssqlPkg;

// ─── Connection / storage setup ───────────────────────────────────────────────

let adminPool: InstanceType<typeof ConnectionPool>;

const ADMIN_URL = process.env["DATABASE_URL_ADMIN"];

// Standard Azurite well-known dev account credentials (public — not secret)
const AZURITE_CONN =
  process.env["STORAGE_CONNECTION_STRING"] ??
  "DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;" +
    "AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;" +
    "BlobEndpoint=http://127.0.0.1:10000/devstoreaccount1";

const TEST_CONTAINER = "encryption-rls-test-" + Date.now().toString(36);

// ─── Test data ────────────────────────────────────────────────────────────────

let engagementId: string;
let engRequestId: string;
let userId: string;
const docIdsToClean: string[] = [];

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeAll(async () => {
  if (!ADMIN_URL) throw new Error("DATABASE_URL_ADMIN is required for encryption integration tests");

  // Ensure azurite adapter is used (not memory — ADR-020 requires real adapter for encryption proof).
  // The STORAGE_ADAPTER env is set by .env.local (should be "azurite" for local dev/CI).
  // DECISION (TASK-007-004): Set STORAGE_ADAPTER=azurite explicitly if not already set, to make
  // the test self-contained for local runs. The test proves the Azurite upload pipeline path;
  // setting the adapter here mirrors the pipeline test's self-contained design. When STORAGE_ADAPTER
  // is already set (e.g. by .env.local or another test that ran before this one), we use that value.
  // If the env is set to something other than "azurite", we still force it to "azurite" because
  // this test specifically requires the Azurite adapter to prove ADR-020 conformance.
  process.env["STORAGE_ADAPTER"] = "azurite";
  if (!process.env["STORAGE_CONNECTION_STRING"]) {
    process.env["STORAGE_CONNECTION_STRING"] =
      "DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;" +
      "AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;" +
      "BlobEndpoint=http://127.0.0.1:10000/devstoreaccount1";
  }

  // Override to use a test-specific container
  process.env["STORAGE_CONTAINER"] = TEST_CONTAINER;
  resetStorageForTesting();

  const adminConfig = parseSqlServerUrl(ADMIN_URL) as import("mssql").config;
  adminPool = new ConnectionPool(adminConfig);
  await adminPool.connect();

  // Seed minimal DB rows for insertPendingDocument
  const clerkId = `enc_rls_client_${Date.now()}`;

  const userResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[User] ([clerkId], [email], [role], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'${clerkId}', N'${clerkId}@test.example.com', N'CLIENT', SYSDATETIMEOFFSET())`
  );
  userId = userResult.recordset[0]?.id ?? "";

  const reqResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[EngagementRequest] ([firstName], [lastName], [email], [status], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'EncRLS', N'Client', N'${clerkId}@req.example.com', N'accepted', SYSDATETIMEOFFSET())`
  );
  engRequestId = reqResult.recordset[0]?.id ?? "";

  const engResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[Engagement]
       ([engagementRequestId], [clientUserId], [status], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES ('${engRequestId}', '${userId}', N'New', SYSDATETIMEOFFSET())`
  );
  engagementId = engResult.recordset[0]?.id ?? "";

  // Pre-flight: verify Azurite is reachable
  const storage = getStorage();
  try {
    await storage.put({
      key: "__enc-connectivity-check__",
      body: Buffer.from("ping"),
      contentType: "text/plain",
    });
    await storage.delete("__enc-connectivity-check__");
  } catch (err) {
    throw new Error(
      "[tier-3] Azurite connectivity check failed. Ensure docker compose up -d azurite is running. " +
        `Original error: ${String(err)}`
    );
  }
}, 30000);

afterAll(async () => {
  // Clean up Document rows
  if (docIdsToClean.length > 0) {
    const ids = docIdsToClean.map((id) => `'${id}'`).join(", ");
    await adminPool.request().query(`DELETE FROM [dbo].[Document] WHERE [id] IN (${ids})`).catch(() => {});
  }
  await adminPool.request().query(
    `DELETE FROM [dbo].[Document] WHERE [engagementId] = '${engagementId}'`
  ).catch(() => {});
  await adminPool.request().query(
    `DELETE FROM [dbo].[Engagement] WHERE [id] = '${engagementId}'`
  ).catch(() => {});
  await adminPool.request().query(
    `DELETE FROM [dbo].[EngagementRequest] WHERE [id] = '${engRequestId}'`
  ).catch(() => {});
  await adminPool.request().query(
    `DELETE FROM [dbo].[User] WHERE [id] = '${userId}'`
  ).catch(() => {});

  // Clean up test blobs
  try {
    const storage = getStorage();
    for await (const obj of storage.list("")) {
      await storage.delete(obj.key).catch(() => {});
    }
  } catch { /* ignore */ }

  resetStorageForTesting();
  await adminPool.close().catch(() => {});
}, 30000);

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("[AC-FILE-003-01][ADR-020] Encryption-at-rest through the upload pipeline", () => {

  /**
   * [AC-FILE-003-01][POSITIVE] A blob stored through the upload pipeline is encrypted at rest.
   *
   * Flow:
   *   1. insertPendingDocument() → computes storage key, INSERTs pending Document row.
   *   2. storage.put() → stores the blob in Azurite.
   *   3. Out-of-band read via @azure/storage-blob SDK → verify serverEncrypted=true.
   *
   * ADR-020: encryption is the adapter contract, not app code.
   * Azurite sets serverEncrypted=true for all blobs by default.
   */
  it("[AC-FILE-003-01] blob stored via upload pipeline has serverEncrypted=true (Azurite conformance)", async () => {
    // Step 1: insertPendingDocument (admin pool — ADR-009 step 2d)
    const { documentId, storageKey } = await insertPendingDocument({
      engagementId,
      originalFilename: "encryption-at-rest-test.pdf",
      contentType: "application/pdf",
      sizeBytes: 0,
      uploadedByClerkId: null,
    });
    docIdsToClean.push(documentId);

    expect(documentId).toBeTruthy();
    expect(storageKey).toContain(`engagements/${engagementId}/documents/${documentId}/v1/`);
    expect(storageKey).toContain("encryption-at-rest-test.pdf");

    // Step 2: PUT the blob to Azurite via the FileStorage port
    const storage = getStorage();
    const pdfContent = Buffer.from("%PDF-1.4 encryption-at-rest integration test");
    const putResult = await storage.put({
      key: storageKey,
      body: pdfContent,
      contentType: "application/pdf",
    });
    expect(putResult.key).toBe(storageKey);

    // Step 3: Out-of-band read via @azure/storage-blob SDK to verify encryption metadata.
    // ADR-020: encryption-at-rest is the adapter contract; we prove it via an out-of-band
    // SDK read (not via the FileStorage port, which doesn't expose encryption metadata).
    // This mirrors the pattern in storage.integration.test.ts (TASK-007-001 conformance).
    const blobServiceClient = BlobServiceClient.fromConnectionString(AZURITE_CONN);
    const containerClient = blobServiceClient.getContainerClient(TEST_CONTAINER);
    const blobClient = containerClient.getBlobClient(storageKey);
    const props = await blobClient.getProperties();

    // AC-FILE-003-01: Azurite sets serverEncrypted=true for all blobs by default.
    // This is the adapter-contract proof: encryption is a storage-layer guarantee.
    expect(props.isServerEncrypted).toBe(true);
    expect(props.contentLength).toBeGreaterThan(0);
    expect(props.contentType).toBe("application/pdf");
  });

  /**
   * [AC-FILE-003-01] Storage key follows the ADR-009 pattern and is URL-safe.
   * The encodeURIComponent ensures filenames with special chars are safe.
   */
  it("[AC-FILE-003-01] storage key follows ADR-009 pattern: engagements/{id}/documents/{id}/v1/{encoded-name}", async () => {
    const { documentId, storageKey } = await insertPendingDocument({
      engagementId,
      originalFilename: "my tax return 2024 (final).pdf",  // spaces + parens
      contentType: "application/pdf",
      sizeBytes: 0,
      uploadedByClerkId: null,
    });
    docIdsToClean.push(documentId);

    // ADR-009 storage key shape
    const expectedPrefix = `engagements/${engagementId}/documents/${documentId}/v1/`;
    expect(storageKey.startsWith(expectedPrefix)).toBe(true);

    // Filename must be URL-encoded (spaces → %20, parens → %28/%29)
    const encodedPart = storageKey.slice(expectedPrefix.length);
    expect(encodedPart).toBe(encodeURIComponent("my tax return 2024 (final).pdf"));

    // Cleanup
    await adminPool.request().query(
      `DELETE FROM [dbo].[Document] WHERE [id] = '${documentId}'`
    ).catch(() => {});
  });

  /**
   * [ADR-020] No hand-rolled crypto in the pipeline code.
   * The storage PUT goes through the adapter — we verify the blob is present
   * without any application-layer key or IV being involved.
   */
  it("[ADR-020] storage adapter handles encryption transparently — no app-code crypto", async () => {
    const { documentId, storageKey } = await insertPendingDocument({
      engagementId,
      originalFilename: "no-app-crypto.txt",
      contentType: "text/plain",
      sizeBytes: 0,
      uploadedByClerkId: null,
    });
    docIdsToClean.push(documentId);

    const storage = getStorage();
    // Plain text body — no encryption applied by app code
    const plainText = "This is plain text — encryption is the adapter's responsibility.";
    await storage.put({
      key: storageKey,
      body: Buffer.from(plainText),
      contentType: "text/plain",
    });

    // stat() confirms the object is stored and accessible
    const stat = await storage.stat(storageKey);
    expect(stat).not.toBeNull();
    expect(stat?.contentType).toBe("text/plain");
    expect(stat?.sizeBytes).toBe(Buffer.byteLength(plainText));

    // Out-of-band: serverEncrypted=true confirms adapter-level encryption (ADR-020)
    const blobServiceClient = BlobServiceClient.fromConnectionString(AZURITE_CONN);
    const containerClient = blobServiceClient.getContainerClient(TEST_CONTAINER);
    const blobClient = containerClient.getBlobClient(storageKey);
    const props = await blobClient.getProperties();
    expect(props.isServerEncrypted).toBe(true);
  });

});
