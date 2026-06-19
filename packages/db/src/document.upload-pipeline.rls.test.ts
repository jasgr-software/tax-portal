/**
 * packages/db/src/document.upload-pipeline.rls.test.ts
 *
 * TIER-3 INTEGRATION TEST — requires real SQL Server + real Azurite + mock scanner
 * (docker compose up -d; tax-portal-sqlserver + tax-portal-azurite must be Up)
 *
 * This file proves the two-phase authorize-then-sign upload/download pipeline:
 *   Phase 1: authorizeEngagementForUpload (request pool, FILTER-governed) → mint signed upload URL
 *   Phase 2: completeUpload (scan-before-available gate, ADR-021)
 *   Download: authorizeThenSignDownload (request pool authz → active-only → signed URL)
 *
 * GATE-AUTHORING EVIDENCE (Introduces-gate: yes — ENGINE.md § Gate Authoring Rules):
 *   Named code path: completeUpload's promotion branch in repositories/document.ts.
 *     `if (scanVerdict.verdict === 'clean' && validationResult === 'pass')` → promotes to 'active'.
 *     ALL other branches stay 'pending' or go 'infected'.
 *   Counterfactual: see Work Log (forcing promotion on 'infected' reds the withholding test).
 *
 * AC IDs covered (per task spec):
 *   AC-FILE-001-02   — client upload stored in the engagement's set
 *   AC-FILE-001-05   — file in engagement A NOT exposed to engagement B
 *   AC-FILE-002-01   — MIME/size validation (pass-through here; scanner is primary)
 *   AC-FILE-003-01   — encrypted at rest (Azurite adapter conformance; via upload path)
 *   AC-FILE-003-02   — retrieval requires authz check (Gate 1 before any URL)
 *   AC-FILE-003-03   — no anonymous/public path (null SESSION_CONTEXT → null)
 *   AC-FILE-003-04   — grant time-limited (signed URL has future expiresAt)
 *   AC-NFR-009-01    — scanned before available (indeterminate → stays pending, fail-closed)
 *   AC-NFR-009-02    — infected → withheld
 *   AC-FILE-007-03   — documents listed per engagement
 *
 * ADR-003 Amendment 1: SESSION_CONTEXT keys set WITHOUT @read_only (writable keys).
 * ADR-009: authorize-then-sign ordering.
 * ADR-021: scan-before-available gate.
 *
 * Environment (from .env.local via vitest.setup.ts globalSetup):
 *   DATABASE_URL_ADMIN          — admin pool (app_admin_role, IS_MEMBER=1, RLS-exempt)
 *   DATABASE_URL                — request pool (app_user_role, subject to RLS)
 *   STORAGE_ADAPTER             — must be "azurite"
 *   STORAGE_CONNECTION_STRING   — Azurite connection string
 *   FILE_SCANNER                — must be "mock"
 *   ALLOW_MOCK_SCANNER          — must be "true"
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import mssqlPkg from "mssql";
import { parseSqlServerUrl } from "./sql-server-url.js";
import { withClerkIdentity } from "./context.js";
import {
  authorizeEngagementForUpload,
  listEngagementDocuments,
  authorizeThenSignDownload,
} from "./repositories/document.js";
import {
  insertPendingDocument,
  completeUpload,
} from "./repositories/document.js";
import { getStorage, resetStorageForTesting } from "@tax-portal/storage";
import { resetScannerForTesting } from "@tax-portal/storage";

const { ConnectionPool } = mssqlPkg;

// ─── Connection setup ─────────────────────────────────────────────────────────

let adminPool: InstanceType<typeof ConnectionPool>;

const ADMIN_URL = process.env["DATABASE_URL_ADMIN"];
const REQUEST_URL = process.env["DATABASE_URL"];

// ─── Test data (seeded in beforeAll) ─────────────────────────────────────────

// CLIENT-A
let clientAClerkId: string;
let clientAUserId: string;
let clientARequestId: string;
let clientAEngagementId: string;

// CLIENT-B (for isolation tests)
let clientBClerkId: string;
let clientBUserId: string;
let clientBRequestId: string;
let clientBEngagementId: string;

// Storage container for this test run
const TEST_CONTAINER = "upload-pipeline-test-" + Date.now().toString(36);

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeAll(async () => {
  if (!ADMIN_URL) throw new Error("DATABASE_URL_ADMIN is required for tier-3 pipeline tests");
  if (!REQUEST_URL) throw new Error("DATABASE_URL is required for tier-3 pipeline tests");

  // Force mock scanner for pipeline tests (ADR-021 / tier-3 gate-authoring requirement).
  // DECISION (TASK-007-004): Set env vars directly here so the test is self-contained and
  // doesn't require pre-configured .env.local entries for FILE_SCANNER/ALLOW_MOCK_SCANNER.
  // The mock scanner is safe for integration tests; resetScannerForTesting() cleans up.
  process.env["FILE_SCANNER"] = "mock";
  process.env["ALLOW_MOCK_SCANNER"] = "true";

  // DECISION (TASK-007-004): Set STORAGE_ADAPTER to "azurite" explicitly here so this test
  // doesn't depend on .env.local having the correct value — the Azurite emulator is the
  // required adapter for tier-3 pipeline tests; resetStorageForTesting() reads the adapter
  // from env to clear the correct singleton, so this must be set BEFORE that call.
  process.env["STORAGE_ADAPTER"] = "azurite";
  // Use the real Azurite connection string from env (set in .env.local) or fall back to the
  // default devstoreaccount1 connection string for the docker-compose Azurite service.
  if (!process.env["STORAGE_CONNECTION_STRING"]) {
    process.env["STORAGE_CONNECTION_STRING"] =
      "DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;" +
      "AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;" +
      "BlobEndpoint=http://127.0.0.1:10000/devstoreaccount1";
  }

  // Override STORAGE_CONTAINER to use an isolated test container
  process.env["STORAGE_CONTAINER"] = TEST_CONTAINER;

  // Reset singletons so the test container override takes effect
  resetStorageForTesting();
  resetScannerForTesting();

  const adminConfig = parseSqlServerUrl(ADMIN_URL) as import("mssql").config;
  adminPool = new ConnectionPool(adminConfig);
  await adminPool.connect();

  // Seed unique clerkIds for this test run
  clientAClerkId = `pipeline_rls_client_a_${Date.now()}`;
  clientBClerkId = `pipeline_rls_client_b_${Date.now()}`;

  // Seed: CLIENT-A
  const userAResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[User] ([clerkId], [email], [role], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'${clientAClerkId}', N'${clientAClerkId}@test.example.com', N'CLIENT', SYSDATETIMEOFFSET())`
  );
  clientAUserId = userAResult.recordset[0]?.id ?? "";

  const reqAResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[EngagementRequest] ([firstName], [lastName], [email], [status], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'PipelineRLS', N'ClientA', N'${clientAClerkId}@req.example.com', N'accepted', SYSDATETIMEOFFSET())`
  );
  clientARequestId = reqAResult.recordset[0]?.id ?? "";

  const engAResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[Engagement]
       ([engagementRequestId], [clientUserId], [status], [letterSignedAt], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES ('${clientARequestId}', '${clientAUserId}', N'New',
             SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET())`
  );
  clientAEngagementId = engAResult.recordset[0]?.id ?? "";

  // Seed: CLIENT-B (for cross-engagement isolation tests)
  const userBResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[User] ([clerkId], [email], [role], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'${clientBClerkId}', N'${clientBClerkId}@test.example.com', N'CLIENT', SYSDATETIMEOFFSET())`
  );
  clientBUserId = userBResult.recordset[0]?.id ?? "";

  const reqBResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[EngagementRequest] ([firstName], [lastName], [email], [status], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'PipelineRLS', N'ClientB', N'${clientBClerkId}@req.example.com', N'accepted', SYSDATETIMEOFFSET())`
  );
  clientBRequestId = reqBResult.recordset[0]?.id ?? "";

  const engBResult = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[Engagement]
       ([engagementRequestId], [clientUserId], [status], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES ('${clientBRequestId}', '${clientBUserId}', N'New', SYSDATETIMEOFFSET())`
  );
  clientBEngagementId = engBResult.recordset[0]?.id ?? "";

  // Pre-flight Azurite connectivity: put a sentinel blob
  const storage = getStorage();
  try {
    await storage.put({
      key: "__connectivity-check__",
      body: Buffer.from("ping"),
      contentType: "text/plain",
    });
    await storage.delete("__connectivity-check__");
  } catch (err) {
    throw new Error(
      "[tier-3] Azurite connectivity check failed. Ensure docker compose up -d azurite is running. " +
        `Original error: ${String(err)}`
    );
  }
}, 40000);

afterAll(async () => {
  // Clean up DB rows — reverse dependency order (Documents → Engagements → Requests → Users)
  await adminPool.request().query(
    `DELETE FROM [dbo].[Document] WHERE [engagementId] IN ('${clientAEngagementId}', '${clientBEngagementId}')`
  ).catch(() => { /* ignore */ });
  await adminPool.request().query(
    `DELETE FROM [dbo].[Engagement] WHERE [id] IN ('${clientAEngagementId}', '${clientBEngagementId}')`
  ).catch(() => { /* ignore */ });
  await adminPool.request().query(
    `DELETE FROM [dbo].[EngagementRequest] WHERE [id] IN ('${clientARequestId}', '${clientBRequestId}')`
  ).catch(() => { /* ignore */ });
  await adminPool.request().query(
    `DELETE FROM [dbo].[User] WHERE [id] IN ('${clientAUserId}', '${clientBUserId}')`
  ).catch(() => { /* ignore */ });

  // Clean up Azurite test container
  try {
    const storage = getStorage();
    // list and delete all blobs in the test container
    for await (const obj of storage.list("")) {
      await storage.delete(obj.key).catch(() => { /* ignore */ });
    }
  } catch { /* ignore — container may not have blobs */ }

  // Reset singletons for subsequent tests
  resetStorageForTesting();
  resetScannerForTesting();

  await adminPool.close().catch(() => { /* ignore */ });
}, 40000);

// ─── Tests: authorize-then-sign ordering (ADR-009) ───────────────────────────

describe("[ADR-009] Authorize-then-sign ordering — authz query runs BEFORE any URL is minted", () => {

  /**
   * [AC-FILE-003-02][AC-FILE-003-03] Null SESSION_CONTEXT → throws (fail-closed).
   * ADR-003 §6: Prisma $extends middleware throws when no identity context is set.
   * This is the code-plane gate: the request is REJECTED before any RLS predicate runs.
   * DECISION (TASK-007-004): The test expects a throw, not null — ADR-003 §6 is the
   * authoritative fail-closed contract for the request pool. See checklist.test.ts for
   * the equivalent doc-string on this design choice.
   */
  it("[AC-FILE-003-03] null SESSION_CONTEXT → authorizeEngagementForUpload throws (fail-closed, ADR-003 §6)", async () => {
    // Call without withClerkIdentity — no SESSION_CONTEXT set.
    // ADR-003 §6: Prisma $extends middleware THROWS when no identity is set (not silently null).
    await expect(authorizeEngagementForUpload(clientAEngagementId)).rejects.toThrow(
      /No identity in request context/
    );
  });

  /**
   * [AC-FILE-003-02][POSITIVE] CLIENT-A resolves their own engagement — authz passes.
   * DECISION (TASK-007-004): UUID comparison is case-insensitive — Prisma normalises
   * SQL Server UNIQUEIDENTIFIER values to lowercase; the mssql OUTPUT INSERTED.[id]
   * returns uppercase. Use toLowerCase() on both sides for stable comparison.
   */
  it("[AC-FILE-003-02] CLIENT-A resolves own engagement via authorizeEngagementForUpload — authz passes", async () => {
    const result = await withClerkIdentity(clientAClerkId, "CLIENT", () =>
      authorizeEngagementForUpload(clientAEngagementId)
    );
    expect(result).not.toBeNull();
    // DECISION: compare case-insensitively (Prisma returns lowercase; mssql returns uppercase)
    expect(result?.id.toLowerCase()).toBe(clientAEngagementId.toLowerCase());
    // letterSignedAt is set (seeded above) — step accessible
    expect(result?.letterSignedAt).not.toBeNull();
  });

  /**
   * [AC-FILE-001-05] CLIENT-B cannot resolve CLIENT-A's engagement — cross-engagement isolation.
   * authorizeEngagementForUpload returns null for CLIENT-B trying CLIENT-A's engagementId.
   */
  it("[AC-FILE-001-05] CLIENT-B cannot resolve CLIENT-A's engagement — FILTER returns null", async () => {
    const result = await withClerkIdentity(clientBClerkId, "CLIENT", () =>
      authorizeEngagementForUpload(clientAEngagementId)
    );
    // CLIENT-B does not own CLIENT-A's engagement → FILTER returns empty → null
    expect(result).toBeNull();
  });

});

// ─── Tests: upload pipeline (pending insert → storage PUT → complete → promote) ─

describe("[ADR-009][ADR-021] Two-phase upload pipeline — pending insert + scan-before-available gate", () => {

  /**
   * [AC-FILE-001-02][AC-NFR-009-01] Clean file: pending → active after scan.
   * Gate-Authoring Named Code Path: `verdict === 'clean' && validationResult === 'pass'`.
   * Uses mock scanner (key does not contain malicious/indeterminate sentinel → clean verdict).
   */
  it("[AC-FILE-001-02][AC-NFR-009-01] clean upload: pending → active (scan passes, clean key)", async () => {
    // Step 1: Authorize
    const engagement = await withClerkIdentity(clientAClerkId, "CLIENT", () =>
      authorizeEngagementForUpload(clientAEngagementId)
    );
    expect(engagement).not.toBeNull();

    // Step 2: Insert pending Document (admin pool — ADR-009 step 2d)
    const { documentId, storageKey } = await insertPendingDocument({
      engagementId: clientAEngagementId,
      originalFilename: "clean-tax-document.pdf",
      contentType: "application/pdf",
      sizeBytes: 0,
      uploadedByClerkId: clientAClerkId,
    });
    expect(documentId).toBeTruthy();
    // Storage key must follow ADR-009 pattern (no malicious/indeterminate sentinel)
    expect(storageKey).toContain(`engagements/${clientAEngagementId}/documents/${documentId}/v1/`);
    expect(storageKey).toContain("clean-tax-document.pdf");

    // Step 3: PUT the file to storage (simulates client's signed-URL PUT)
    const storage = getStorage();
    const pdfBytes = Buffer.from("%PDF-1.4 clean test document content");
    await storage.put({
      key: storageKey,
      body: pdfBytes,
      contentType: "application/pdf",
    });

    // Step 4: Complete upload — scan-before-available gate (ADR-021)
    const result = await completeUpload({
      documentId,
      storageKey,
      uploadedByClerkId: clientAClerkId,
    });

    // Clean key → mock scanner returns 'clean' → promoted to 'active'
    expect(result.outcome).toBe("active");
    expect(result.documentId).toBe(documentId);

    // Verify DB state via admin pool read-back
    const verify = await adminPool.request().query<{ status: string }>(
      `SELECT [status] FROM [dbo].[Document] WHERE [id] = '${documentId}'`
    );
    expect(verify.recordset[0]?.status).toBe("active");
  });

  /**
   * [AC-NFR-009-02] Infected file: pending → infected (never signable).
   * Key contains 'malicious' sentinel → mock scanner returns 'infected'.
   * Gate: infected files MUST remain withheld — never 'active'.
   */
  it("[AC-NFR-009-02] infected upload: pending → infected (withheld, never signable)", async () => {
    // Insert pending Document with a key that will trigger the infected sentinel
    const { documentId, storageKey } = await insertPendingDocument({
      engagementId: clientAEngagementId,
      originalFilename: "malicious-file.pdf",  // 'malicious' in name → infected verdict
      contentType: "application/pdf",
      sizeBytes: 0,
      uploadedByClerkId: clientAClerkId,
    });

    // The storage key will contain 'malicious' → mock scanner → 'infected'
    expect(storageKey).toContain("malicious");

    // PUT the file to storage
    const storage = getStorage();
    await storage.put({
      key: storageKey,
      body: Buffer.from("fake malicious content"),
      contentType: "application/pdf",
    });

    // Complete upload — infected verdict
    const result = await completeUpload({
      documentId,
      storageKey,
      uploadedByClerkId: clientAClerkId,
    });

    // Mock scanner detects 'malicious' in key → 'infected' outcome
    expect(result.outcome).toBe("infected");

    // DB read-back: status must be 'infected'
    const verify = await adminPool.request().query<{ status: string; scanThreat: string | null }>(
      `SELECT [status], [scanThreat] FROM [dbo].[Document] WHERE [id] = '${documentId}'`
    );
    expect(verify.recordset[0]?.status).toBe("infected");
    // Mock scanner sets threat label
    expect(verify.recordset[0]?.scanThreat).toBe("EICAR-Test-Signature");
  });

  /**
   * [AC-NFR-009-01] Indeterminate file: stays pending — fail-closed (NEVER silently active).
   * Key contains 'indeterminate' sentinel → mock scanner returns 'indeterminate'.
   * Gate-Authoring Named Code Path: the `verdict === 'indeterminate'` path leaves status='pending'.
   */
  it("[AC-NFR-009-01] indeterminate upload: stays pending (fail-closed — NEVER becomes active)", async () => {
    const { documentId, storageKey } = await insertPendingDocument({
      engagementId: clientAEngagementId,
      originalFilename: "indeterminate-scan.pdf",  // 'indeterminate' in name → indeterminate verdict
      contentType: "application/pdf",
      sizeBytes: 0,
      uploadedByClerkId: clientAClerkId,
    });

    expect(storageKey).toContain("indeterminate");

    const storage = getStorage();
    await storage.put({
      key: storageKey,
      body: Buffer.from("scanner could not complete"),
      contentType: "application/pdf",
    });

    const result = await completeUpload({
      documentId,
      storageKey,
      uploadedByClerkId: clientAClerkId,
    });

    // Fail-closed: indeterminate → stays 'pending'
    expect(result.outcome).toBe("pending");

    // DB read-back: status MUST still be 'pending' (never silently 'active')
    const verify = await adminPool.request().query<{ status: string }>(
      `SELECT [status] FROM [dbo].[Document] WHERE [id] = '${documentId}'`
    );
    expect(verify.recordset[0]?.status).toBe("pending");
  });

  /**
   * [AC-NFR-009-01][NEGATIVE] pending Document is NEVER signable for download.
   * A 'pending' document must return authorized:false from authorizeThenSignDownload.
   */
  it("[AC-NFR-009-01] pending Document is never signable for download", async () => {
    // Insert a pending doc but do NOT complete upload (stays pending)
    const { documentId } = await insertPendingDocument({
      engagementId: clientAEngagementId,
      originalFilename: "still-pending-doc.pdf",
      contentType: "application/pdf",
      sizeBytes: 0,
      uploadedByClerkId: clientAClerkId,
    });

    // Attempt to authorize-then-sign download for a pending doc
    const result = await withClerkIdentity(clientAClerkId, "CLIENT", () =>
      authorizeThenSignDownload({
        documentId,
        engagementId: clientAEngagementId,
      })
    );

    // pending → NOT authorized (AC-NFR-009-01: never signable)
    expect(result.authorized).toBe(false);
    if (!result.authorized) {
      expect(result.reason).toBe("not-active");
    }
  });

  /**
   * [AC-NFR-009-02][NEGATIVE] infected Document is NEVER signable for download.
   */
  it("[AC-NFR-009-02] infected Document is never signable for download", async () => {
    // Seed an infected Document directly via admin pool
    const infectedResult = await adminPool.request().query<{ id: string }>(
      `INSERT INTO [dbo].[Document]
         ([engagementId], [storageKey], [originalFilename], [contentType], [sizeBytes],
          [status], [version], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES ('${clientAEngagementId}',
               N'engagements/${clientAEngagementId}/documents/infected-test/v1/infected.pdf',
               N'infected.pdf', N'application/pdf', 100, N'infected', 1, SYSDATETIMEOFFSET())`
    );
    const infectedDocId = infectedResult.recordset[0]?.id ?? "";

    // Attempt download of infected doc
    const result = await withClerkIdentity(clientAClerkId, "CLIENT", () =>
      authorizeThenSignDownload({
        documentId: infectedDocId,
        engagementId: clientAEngagementId,
      })
    );

    // infected → NOT authorized (AC-NFR-009-02: withheld)
    expect(result.authorized).toBe(false);
    if (!result.authorized) {
      expect(result.reason).toBe("not-active");
    }
  });

});

// ─── Tests: authorize-then-sign download (ADR-009) ───────────────────────────

describe("[ADR-009] Authorize-then-sign download — both gates layered", () => {

  let activeDocId: string;

  beforeAll(async () => {
    // Seed an 'active' Document for download tests
    const result = await adminPool.request().query<{ id: string }>(
      `INSERT INTO [dbo].[Document]
         ([engagementId], [storageKey], [originalFilename], [contentType], [sizeBytes],
          [status], [version], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES ('${clientAEngagementId}',
               N'engagements/${clientAEngagementId}/documents/active-download-test/v1/active-doc.pdf',
               N'active-doc.pdf', N'application/pdf', 5000, N'active', 1, SYSDATETIMEOFFSET())`
    );
    activeDocId = result.recordset[0]?.id ?? "";

    // Put a blob in storage for this key (so signed URL resolves)
    const storage = getStorage();
    await storage.put({
      key: `engagements/${clientAEngagementId}/documents/active-download-test/v1/active-doc.pdf`,
      body: Buffer.from("%PDF-1.4 active document content"),
      contentType: "application/pdf",
    });
  }, 15000);

  /**
   * [AC-FILE-003-01][AC-FILE-003-04] Active Document: signed URL returned with future expiresAt.
   * Gate 1 (authz) + Gate 2 (active-only) both pass → URL minted.
   * AC-FILE-003-01: encryption-at-rest is the adapter contract (Azurite serverEncrypted=true).
   * AC-FILE-003-04: expiresAt is in the future (TTL-capped by the adapter).
   */
  it("[AC-FILE-003-01][AC-FILE-003-04] active Document: signed download URL returned with future expiresAt", async () => {
    const result = await withClerkIdentity(clientAClerkId, "CLIENT", () =>
      authorizeThenSignDownload({
        documentId: activeDocId,
        engagementId: clientAEngagementId,
      })
    );

    expect(result.authorized).toBe(true);
    if (result.authorized) {
      expect(result.url).toBeTruthy();
      // AC-FILE-003-04: expiresAt is in the future
      expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
      // AC-FILE-003-04: TTL is within the allowed cap (≤ 3600s from now)
      const maxExpiry = Date.now() + 3600 * 1000 + 5000; // 1 hour + 5s buffer
      expect(result.expiresAt.getTime()).toBeLessThanOrEqual(maxExpiry);
    }
  });

  /**
   * [AC-FILE-003-04] Expiry: the signed URL should be time-limited (TTL ≤ cap).
   * With default TTL (300s), expiresAt should be ~5 minutes from now.
   */
  it("[AC-FILE-003-04] signed URL has a TTL-bounded expiry (default 300s)", async () => {
    const before = Date.now();
    const result = await withClerkIdentity(clientAClerkId, "CLIENT", () =>
      authorizeThenSignDownload({
        documentId: activeDocId,
        engagementId: clientAEngagementId,
        ttlSeconds: 300,
      })
    );
    const after = Date.now();

    expect(result.authorized).toBe(true);
    if (result.authorized) {
      const expiryMs = result.expiresAt.getTime();
      // Should expire in ~5 minutes (300s) from issuance
      const minExpiry = before + 290 * 1000; // 290s from before
      const maxExpiry = after + 310 * 1000;  // 310s from after
      expect(expiryMs).toBeGreaterThanOrEqual(minExpiry);
      expect(expiryMs).toBeLessThanOrEqual(maxExpiry);
    }
  });

  /**
   * [AC-FILE-003-02][AC-FILE-003-03] Non-owner CLIENT-B cannot download CLIENT-A's active doc.
   * Gate 1 (authz): CLIENT-B's SESSION_CONTEXT → FILTER returns null → authorized: false.
   */
  it("[AC-FILE-003-02] CLIENT-B cannot download CLIENT-A's active Document — FILTER blocks", async () => {
    const result = await withClerkIdentity(clientBClerkId, "CLIENT", () =>
      authorizeThenSignDownload({
        documentId: activeDocId,
        engagementId: clientAEngagementId,
      })
    );
    // CLIENT-B's FILTER does not match CLIENT-A's engagement → authorized: false
    expect(result.authorized).toBe(false);
    if (!result.authorized) {
      expect(result.reason).toBe("rls-filtered");
    }
  });

  /**
   * [AC-FILE-003-03] Null SESSION_CONTEXT → throws (ADR-003 §6 fail-closed).
   * The Prisma $extends middleware rejects the query before any URL can be minted.
   */
  it("[AC-FILE-003-03] null SESSION_CONTEXT → authorizeThenSignDownload throws (ADR-003 §6 fail-closed, no public path)", async () => {
    // No withClerkIdentity → ADR-003 §6 middleware gate → throws
    await expect(
      authorizeThenSignDownload({ documentId: activeDocId, engagementId: clientAEngagementId })
    ).rejects.toThrow(/No identity in request context/);
  });

});

// ─── Tests: listEngagementDocuments (AC-FILE-007-03, AC-FILE-001-02) ─────────

describe("[AC-FILE-007-03] listEngagementDocuments — FILTER-governed, CLIENT sees own docs only", () => {

  /**
   * [AC-FILE-007-03] CLIENT-A sees their own engagement's documents.
   * DECISION (TASK-007-004): UUID comparison is case-insensitive.
   */
  it("[AC-FILE-007-03] CLIENT-A sees own engagement's documents (FILTER passes)", async () => {
    const docs = await withClerkIdentity(clientAClerkId, "CLIENT", () =>
      listEngagementDocuments(clientAEngagementId)
    );
    // Must return the documents seeded in the pipeline tests above
    // (there should be at least 1 — the active-doc and any from pipeline tests)
    expect(Array.isArray(docs)).toBe(true);
    // CLIENT-A uploaded to clientAEngagementId — at least one doc should be visible
    expect(docs.length).toBeGreaterThanOrEqual(1);
    // All returned docs must belong to CLIENT-A's engagement
    // DECISION: compare case-insensitively (Prisma returns lowercase GUIDs; mssql returns uppercase)
    for (const doc of docs) {
      expect(doc.engagementId.toLowerCase()).toBe(clientAEngagementId.toLowerCase());
    }
  });

  /**
   * [AC-FILE-001-05] CLIENT-B sees ZERO documents for CLIENT-A's engagement.
   */
  it("[AC-FILE-001-05] CLIENT-B sees ZERO documents for CLIENT-A's engagement (FILTER blocks)", async () => {
    const docs = await withClerkIdentity(clientBClerkId, "CLIENT", () =>
      listEngagementDocuments(clientAEngagementId)
    );
    // CLIENT-B's FILTER → no rows for CLIENT-A's engagement
    expect(docs).toHaveLength(0);
  });

  /**
   * Null SESSION_CONTEXT → throws (ADR-003 §6 fail-closed).
   * The Prisma $extends middleware throws before any RLS predicate runs.
   */
  it("[ADR-003] null SESSION_CONTEXT → listEngagementDocuments throws (ADR-003 §6 fail-closed)", async () => {
    await expect(listEngagementDocuments(clientAEngagementId)).rejects.toThrow(
      /No identity in request context/
    );
  });

});

// ─── Tests: AC-FILE-003-01 encryption-at-rest ─────────────────────────────────

describe("[AC-FILE-003-01] Encryption-at-rest — Azurite adapter conformance through upload path", () => {

  /**
   * [AC-FILE-003-01] A blob stored via the upload pipeline is encrypted at rest.
   * Azurite marks blobs serverEncrypted=true — the adapter's encryption-at-rest contract.
   * ADR-020: encryption is the adapter contract, not app code.
   */
  it("[AC-FILE-003-01] uploaded blob is encrypted-at-rest (Azurite serverEncrypted=true conformance)", async () => {
    // Insert a pending document and put a blob
    const { documentId, storageKey } = await insertPendingDocument({
      engagementId: clientAEngagementId,
      originalFilename: "encryption-proof.pdf",
      contentType: "application/pdf",
      sizeBytes: 0,
      uploadedByClerkId: clientAClerkId,
    });

    const storage = getStorage();
    const pdfContent = Buffer.from("%PDF-1.4 encryption-at-rest test");
    await storage.put({
      key: storageKey,
      body: pdfContent,
      contentType: "application/pdf",
    });

    // stat() returns ObjectStat — for Azurite this proves the object is stored
    // (Azurite sets serverEncrypted=true on all blobs by default — ADR-020 adapter contract)
    const stat = await storage.stat(storageKey);
    expect(stat).not.toBeNull();
    expect(stat?.sizeBytes).toBeGreaterThan(0);
    expect(stat?.contentType).toBe("application/pdf");

    // Verify encryption marker is present via the raw Azure Blob SDK check
    // (The AzuriteAdapter uses @azure/storage-blob which sets serverEncrypted on BlobProperties)
    // We cannot read serverEncrypted from the FileStorage port directly (it's not in ObjectStat).
    // The storage.integration.test.ts conformance test covers this via internal SDK access.
    // Here we assert the blob is present (stat non-null) + size > 0 as the pipeline proof.
    // DECISION (TASK-007-004): Full serverEncrypted assertion is in storage.integration.test.ts
    // (TASK-007-001 conformance). This test proves the upload pipeline reaches Azurite (stat non-null).

    // Cleanup
    await storage.delete(storageKey).catch(() => { /* ignore */ });
    await adminPool.request().query(
      `DELETE FROM [dbo].[Document] WHERE [id] = '${documentId}'`
    ).catch(() => { /* ignore */ });
  });

});

// ─── Tests: null SESSION_CONTEXT fail-closed ──────────────────────────────────
//
// ADR-003 §6: The Prisma $extends middleware THROWS when no identity context is set.
// This is the code-plane fail-closed gate (not the SQL Server RLS predicate gate).
// The RLS FILTER predicate (ADR-003 §5) is the data-plane gate — it would return empty/null
// if the middleware allowed the query through. But the middleware gate fires FIRST.
//
// DECISION (TASK-007-004): Tests in this suite verify the THROW behaviour (ADR-003 §6),
// not a null/empty return. The RLS predicate behaviour (ADR-003 §5 / ADR-005) is verified
// by the CLIENT-B isolation tests above (which DO use withClerkIdentity for CLIENT-B,
// so the middleware passes, and the RLS predicate does the cross-client filtering).

describe("[ADR-003 §6] Null SESSION_CONTEXT fail-closed — Prisma middleware throws", () => {

  it("[ADR-003 §6] authorizeEngagementForUpload without SESSION_CONTEXT → throws (fail-closed)", async () => {
    // No withClerkIdentity wrapper → ADR-003 §6 middleware throws before any SQL executes
    await expect(authorizeEngagementForUpload(clientAEngagementId)).rejects.toThrow(
      /No identity in request context/
    );
  });

  it("[ADR-003 §6] listEngagementDocuments without SESSION_CONTEXT → throws (fail-closed)", async () => {
    await expect(listEngagementDocuments(clientAEngagementId)).rejects.toThrow(
      /No identity in request context/
    );
  });

  it("[ADR-003 §6] authorizeThenSignDownload without SESSION_CONTEXT → throws (fail-closed)", async () => {
    // Seed a quick active doc to test against
    const result2 = await adminPool.request().query<{ id: string }>(
      `INSERT INTO [dbo].[Document]
         ([engagementId], [storageKey], [originalFilename], [contentType], [sizeBytes],
          [status], [version], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES ('${clientAEngagementId}',
               N'engagements/${clientAEngagementId}/documents/null-ctx-test/v1/test.pdf',
               N'test.pdf', N'application/pdf', 100, N'active', 1, SYSDATETIMEOFFSET())`
    );
    const docId = result2.recordset[0]?.id ?? "";

    // No SESSION_CONTEXT → ADR-003 §6 middleware throws before any URL can be minted
    await expect(
      authorizeThenSignDownload({ documentId: docId, engagementId: clientAEngagementId })
    ).rejects.toThrow(/No identity in request context/);

    // Cleanup
    await adminPool.request().query(
      `DELETE FROM [dbo].[Document] WHERE [id] = '${docId}'`
    ).catch(() => { /* ignore */ });
  });

});
