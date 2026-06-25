/**
 * packages/db/src/message-attachment.scan-before-available.integration.test.ts
 *
 * TIER-3 INTEGRATION TEST — requires real SQL Server + real Azurite + mock scanner
 * (docker compose up -d; tax-portal-sqlserver + tax-portal-azurite must be Up)
 *
 * Tests the scan-before-available pipeline + participant-scoped signed-URL retrieval
 * for MessageAttachments (TASK-017-004 / BRIEF-017 / EPIC-017).
 *
 * GATE-AUTHORING EVIDENCE (introduces_gate: yes — ENGINE.md § Gate Authoring Rules):
 *   Named code path: storeAndScanAttachment's promotion branch in
 *     packages/db/src/repositories/message-attachment.ts.
 *   `if (scanVerdict.verdict === 'clean' && validationResult === 'pass')` → 'active'.
 *   ALL other branches stay 'pending' or go 'infected'.
 *   Counterfactual: forcing promotion on 'infected' reds the withholding test;
 *   removing the 'clean' guard reds the indeterminate test.
 *
 * AC IDs covered:
 *   AC-MSG-004-01 — sender attaches one+ files to a message (multiple on one message listed)
 *   AC-MSG-004-02 — attachments visible to thread participants alongside the message
 *   AC-MSG-004-03 — participants retrieve attachments via a short-lived participant-scoped signed URL
 *   AC-MSG-004-05 — attachments scanned before available; infected/indeterminate withheld
 *
 * ADR-021 / REQ-NFR-009: scan-before-available gate.
 * ADR-008/-009: signed URL — authorize-before-mint; server-resolved key; TTL-capped.
 * ADR-003: SESSION_CONTEXT + pool strategy.
 * ADR-005: RLS FILTER sec.pol_MessageAttachment.
 * CS-GEN-001: signed URL never logged; audit targetId = attachmentId only.
 * CS-TS-001: reuse getStorage()/getFileScanner()/validateUploadedBytes from @tax-portal/storage.
 * CS-TS-003: cross-surface parity (repo tested here; actions layer tested at action layer).
 *
 * Environment (from .env.local via vitest setup):
 *   DATABASE_URL_ADMIN         — admin pool (app_admin_role, RLS-exempt)
 *   DATABASE_URL               — request pool (app_user_role, subject to RLS)
 *   STORAGE_ADAPTER            — must be "azurite"
 *   STORAGE_CONNECTION_STRING  — Azurite connection string
 *   FILE_SCANNER               — set to "mock" in test (ALLOW_MOCK_SCANNER=true)
 *   REALTIME_PROVIDER          — set to "mock" (emitAndPublishNotification path)
 *
 * // ADR-003 // ADR-005 // ADR-008 // ADR-009 // ADR-021 // REQ-NFR-009
 * // CS-TS-001 // CS-TS-003 // CS-GEN-001 // CS-GEN-003
 * // AC-MSG-004-01 // AC-MSG-004-02 // AC-MSG-004-03 // AC-MSG-004-05
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import mssqlPkg from "mssql";
import { parseSqlServerUrl } from "./sql-server-url.js";
import { withClerkIdentity } from "./context.js";
import {
  storeAndScanAttachment,
  authorizeThenSignAttachment,
  listMessageAttachments,
} from "./repositories/message-attachment.js";
import { getStorage, resetStorageForTesting } from "@tax-portal/storage";
import { resetScannerForTesting } from "@tax-portal/storage";
import { resetNotificationTransportForTesting } from "@tax-portal/realtime";

const { ConnectionPool } = mssqlPkg;

// ─── Connection setup ─────────────────────────────────────────────────────────

let adminPool: InstanceType<typeof ConnectionPool>;
let requestPool: InstanceType<typeof ConnectionPool>;

const ADMIN_URL = process.env["DATABASE_URL_ADMIN"];
const REQUEST_URL = process.env["DATABASE_URL"];

// ─── Test data ────────────────────────────────────────────────────────────────

// Two users with separate threads — used for IDOR cross-thread negative test.
let clientAClerkId: string;
let clientAUserId: string;
let clientBClerkId: string;
let clientBUserId: string;

// Shared engagement for CLIENT-A (engagement thread)
let clientARequestId: string;
let clientAEngagementId: string;

// Thread + message IDs
let threadAId: string;     // engagement thread for CLIENT-A
let threadBId: string;     // engagement thread for CLIENT-B (IDOR negative test)
let messageAId: string;    // message in threadA
let messageBId: string;    // message in threadB

// IDs for cleanup
const createdAttachmentIds: string[] = [];

// Isolated Azurite container for this test run
const TEST_CONTAINER = "msg-att-scan-test-" + Date.now().toString(36);

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeAll(async () => {
  if (!ADMIN_URL) throw new Error("DATABASE_URL_ADMIN is required for tier-3 integration tests");
  if (!REQUEST_URL) throw new Error("DATABASE_URL is required for tier-3 integration tests");

  // Force mock scanner (ADR-021 / tier-3 gate-authoring requirement).
  // DECISION: Set env vars directly so the test is self-contained (same pattern as document.upload-pipeline.rls.test.ts).
  process.env["FILE_SCANNER"] = "mock";
  process.env["ALLOW_MOCK_SCANNER"] = "true";

  // Mock real-time transport to avoid RealtimeBindingNotAvailableError.
  // storeAndScanAttachment does NOT emit notifications (only document completeUpload does),
  // but authorizeThenSignAttachment emits a recordAuthEvent. Keep consistent with document tests.
  // ADR-023: mock requires REALTIME_PROVIDER=mock + ALLOW_MOCK_REALTIME=true. // ADR-023
  process.env["REALTIME_PROVIDER"] = "mock";
  process.env["ALLOW_MOCK_REALTIME"] = "true";
  resetNotificationTransportForTesting();

  // Force Azurite storage adapter.
  process.env["STORAGE_ADAPTER"] = "azurite";
  if (!process.env["STORAGE_CONNECTION_STRING"]) {
    process.env["STORAGE_CONNECTION_STRING"] =
      "DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;" +
      "AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;" +
      "BlobEndpoint=http://127.0.0.1:10000/devstoreaccount1";
  }
  process.env["STORAGE_CONTAINER"] = TEST_CONTAINER;

  // Reset singletons so test container override takes effect.
  resetStorageForTesting();
  resetScannerForTesting();

  const adminConfig = parseSqlServerUrl(ADMIN_URL) as import("mssql").config;
  adminPool = new ConnectionPool(adminConfig);
  await adminPool.connect();

  const requestConfig = parseSqlServerUrl(REQUEST_URL) as import("mssql").config;
  requestPool = new ConnectionPool(requestConfig);
  await requestPool.connect();

  // Unique clerkIds for this test run (avoid collision with other tests).
  const ts = Date.now();
  clientAClerkId = `att_scan_client_a_${ts}`;
  clientBClerkId = `att_scan_client_b_${ts}`;

  // Seed CLIENT-A user.
  const userARes = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[User] ([clerkId], [email], [role], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'${clientAClerkId}', N'${clientAClerkId}@test.example.com', N'CLIENT', SYSDATETIMEOFFSET())`
  );
  clientAUserId = userARes.recordset[0]?.id ?? "";

  // Seed CLIENT-B user.
  const userBRes = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[User] ([clerkId], [email], [role], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'${clientBClerkId}', N'${clientBClerkId}@test.example.com', N'CLIENT', SYSDATETIMEOFFSET())`
  );
  clientBUserId = userBRes.recordset[0]?.id ?? "";

  // Seed engagement for CLIENT-A (needed for Thread FK, though Thread policy uses clientUserId/engagementId).
  const reqARes = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[EngagementRequest] ([firstName], [lastName], [email], [status], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'AttScan', N'ClientA', N'${clientAClerkId}@req.example.com', N'accepted', SYSDATETIMEOFFSET())`
  );
  clientARequestId = reqARes.recordset[0]?.id ?? "";

  const engARes = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[Engagement]
       ([engagementRequestId], [clientUserId], [status], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES ('${clientARequestId}', '${clientAUserId}', N'New', SYSDATETIMEOFFSET())`
  );
  clientAEngagementId = engARes.recordset[0]?.id ?? "";

  // Seed engagement for CLIENT-B (for IDOR cross-thread negative test).
  const reqBRes = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[EngagementRequest] ([firstName], [lastName], [email], [status], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'AttScan', N'ClientB', N'${clientBClerkId}@req.example.com', N'accepted', SYSDATETIMEOFFSET())`
  );
  const clientBRequestId = reqBRes.recordset[0]?.id ?? "";

  const engBRes = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[Engagement]
       ([engagementRequestId], [clientUserId], [status], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES ('${clientBRequestId}', '${clientBUserId}', N'New', SYSDATETIMEOFFSET())`
  );
  const clientBEngagementId = engBRes.recordset[0]?.id ?? "";

  // Seed Thread for CLIENT-A (engagement thread).
  // CHECK constraint: engagement threads must have engagementId NOT NULL and clientUserId NULL.
  // (Thread_engagement_or_client_chk: engagementId IS NOT NULL AND clientUserId IS NULL
  //  OR engagementId IS NULL AND clientUserId IS NOT NULL — exclusive OR.)
  const threadARes = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[Thread]
       ([kind], [engagementId], [clientUserId], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'engagement', '${clientAEngagementId}', NULL, SYSDATETIMEOFFSET())`
  );
  threadAId = threadARes.recordset[0]?.id ?? "";

  // Seed Thread for CLIENT-B (for IDOR negative test).
  const threadBRes = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[Thread]
       ([kind], [engagementId], [clientUserId], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (N'engagement', '${clientBEngagementId}', NULL, SYSDATETIMEOFFSET())`
  );
  threadBId = threadBRes.recordset[0]?.id ?? "";

  // Seed Message in Thread-A (for CLIENT-A's attachments).
  const msgARes = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[Message]
       ([threadId], [senderClerkId], [body], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES ('${threadAId}', N'${clientAClerkId}', N'Test message A', SYSDATETIMEOFFSET())`
  );
  messageAId = msgARes.recordset[0]?.id ?? "";

  // Seed Message in Thread-B (for the IDOR negative test).
  const msgBRes = await adminPool.request().query<{ id: string }>(
    `INSERT INTO [dbo].[Message]
       ([threadId], [senderClerkId], [body], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES ('${threadBId}', N'${clientBClerkId}', N'Test message B', SYSDATETIMEOFFSET())`
  );
  messageBId = msgBRes.recordset[0]?.id ?? "";

  // Pre-flight Azurite connectivity check.
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

  // Suppress unused variable warnings (clientBUserId used implicitly).
  void clientBUserId;
}, 40000);

afterAll(async () => {
  // Clean up in reverse FK order: MessageAttachment → Message → Thread → Engagement → ...
  for (const attId of createdAttachmentIds) {
    await adminPool
      .request()
      .query(`DELETE FROM [dbo].[MessageAttachment] WHERE [id] = '${attId}'`)
      .catch(() => { /* ignore */ });
  }
  await adminPool
    .request()
    .query(`DELETE FROM [dbo].[MessageAttachment] WHERE [messageId] IN ('${messageAId}', '${messageBId}')`)
    .catch(() => { /* ignore */ });
  await adminPool
    .request()
    .query(`DELETE FROM [dbo].[Message] WHERE [id] IN ('${messageAId}', '${messageBId}')`)
    .catch(() => { /* ignore */ });
  await adminPool
    .request()
    .query(`DELETE FROM [dbo].[Thread] WHERE [id] IN ('${threadAId}', '${threadBId}')`)
    .catch(() => { /* ignore */ });
  await adminPool
    .request()
    .query(`DELETE FROM [dbo].[Engagement] WHERE [clientUserId] IN ('${clientAUserId}', '${clientBUserId}')`)
    .catch(() => { /* ignore */ });
  await adminPool
    .request()
    .query(`DELETE FROM [dbo].[EngagementRequest] WHERE [id] = '${clientARequestId}'`)
    .catch(() => { /* ignore */ });
  await adminPool
    .request()
    .query(`DELETE FROM [dbo].[User] WHERE [id] IN ('${clientAUserId}', '${clientBUserId}')`)
    .catch(() => { /* ignore */ });

  // Clean up Azurite test container.
  try {
    const storage = getStorage();
    for await (const obj of storage.list("")) {
      await storage.delete(obj.key).catch(() => { /* ignore */ });
    }
  } catch { /* ignore */ }

  // Reset singletons.
  resetStorageForTesting();
  resetScannerForTesting();
  resetNotificationTransportForTesting();
  delete process.env["REALTIME_PROVIDER"];
  delete process.env["ALLOW_MOCK_REALTIME"];

  await adminPool.close().catch(() => { /* ignore */ });
  await requestPool.close().catch(() => { /* ignore */ });
}, 40000);

// ─── Test helpers ─────────────────────────────────────────────────────────────

/** Case-insensitive GUID comparison (SQL Server may return upper or lower case). */
function eqId(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

// ─── Tests: scan-before-available gate (ADR-021 / REQ-NFR-009) ───────────────

describe("[ADR-021][REQ-NFR-009] Scan-before-available gate — storeAndScanAttachment", () => {

  /**
   * [AC-MSG-004-01][AC-MSG-004-05][POSITIVE]
   * Clean file: pending → active after scan; participant can retrieve signed URL.
   *
   * Gate-Authoring Named Code Path:
   *   `if (scanVerdict.verdict === 'clean' && validationResult === 'pass')` → 'active'.
   * Key does NOT contain 'malicious' or 'indeterminate' → mock scanner returns 'clean'.
   */
  it("[AC-MSG-004-05] clean file → status 'active' → participant gets signed URL", async () => {
    // Store + scan (clean key — mock scanner returns 'clean').
    // CS-TS-001: storeAndScanAttachment reuses EPIC-007 FileScanner + EPIC-013 validateUploadedBytes. // CS-TS-001
    const result = await storeAndScanAttachment({
      messageId: messageAId,
      threadId: threadAId,
      originalFilename: "clean-attachment.pdf",  // no sentinel → clean verdict
      contentType: "application/pdf",
      bytes: Buffer.from("%PDF-1.4 clean message attachment content"),
      uploadedByClerkId: clientAClerkId,
    });

    // Scan-before-available gate: clean → 'active'. // AC-MSG-004-05
    expect(result.outcome).toBe("active");
    const attachmentId = result.attachmentId;
    createdAttachmentIds.push(attachmentId);
    expect(attachmentId).toBeTruthy();

    // DB read-back via admin pool: verify status='active'.
    const verify = await adminPool.request().query<{ status: string; storageKey: string }>(
      `SELECT [status], [storageKey] FROM [dbo].[MessageAttachment] WHERE [id] = '${attachmentId}'`
    );
    expect(verify.recordset[0]?.status).toBe("active");

    // Storage key must follow ADR-008/-009 pattern (server-owned, scoped to thread/message/attachment).
    const storageKey = verify.recordset[0]?.storageKey ?? "";
    expect(storageKey).toContain(`threads/${threadAId}`);
    expect(storageKey).toContain(`messages/${messageAId}`);
    expect(storageKey).toContain(`attachments/${attachmentId}`);
    expect(storageKey).toContain("clean-attachment.pdf");
    // Key must NOT be the placeholder. // ADR-008
    expect(storageKey).not.toBe("__pending__");

    // Now the participant (CLIENT-A) can get a signed URL.
    // AC-MSG-004-03: participant-scoped signed URL. // AC-MSG-004-03
    // ADR-009: authorize-before-mint; only server-resolved key is signed. // ADR-009
    const signResult = await withClerkIdentity(clientAClerkId, "CLIENT", () =>
      authorizeThenSignAttachment({
        attachmentId,
        actor: { clerkUserId: clientAClerkId, role: "CLIENT" },
      })
    );

    expect(signResult.authorized).toBe(true);
    if (signResult.authorized) {
      // URL must be present and TTL-capped (ADR-008 — future expiresAt). // ADR-008
      expect(signResult.url).toBeTruthy();
      expect(signResult.expiresAt.getTime()).toBeGreaterThan(Date.now());
      // CS-GEN-001: URL is NOT logged here or in the repository — return value only. // CS-GEN-001
    }
  });

  /**
   * [AC-MSG-004-05][NEGATIVE]
   * Infected file: pending → infected; NEVER signable.
   * Key contains 'malicious' → mock scanner returns 'infected'.
   * Gate: infected files MUST remain withheld — never 'active', never signable.
   */
  it("[AC-MSG-004-05] infected file → status 'infected' → NEVER signable (withheld)", async () => {
    const result = await storeAndScanAttachment({
      messageId: messageAId,
      threadId: threadAId,
      originalFilename: "malicious-attachment.pdf",  // 'malicious' sentinel → infected verdict
      contentType: "application/pdf",
      bytes: Buffer.from("fake malicious content"),
      uploadedByClerkId: clientAClerkId,
    });

    // Scan-before-available gate: infected → 'infected', never 'active'. // AC-MSG-004-05
    expect(result.outcome).toBe("infected");
    const attachmentId = result.attachmentId;
    createdAttachmentIds.push(attachmentId);

    // DB read-back: status must be 'infected'.
    const verify = await adminPool.request().query<{ status: string }>(
      `SELECT [status] FROM [dbo].[MessageAttachment] WHERE [id] = '${attachmentId}'`
    );
    expect(verify.recordset[0]?.status).toBe("infected");

    // Attempt to sign the infected attachment — MUST be refused.
    // REQ-NFR-009: infected attachment is NEVER retrievable. // REQ-NFR-009
    const signResult = await withClerkIdentity(clientAClerkId, "CLIENT", () =>
      authorizeThenSignAttachment({
        attachmentId,
        actor: { clerkUserId: clientAClerkId, role: "CLIENT" },
      })
    );

    expect(signResult.authorized).toBe(false);
    if (!signResult.authorized) {
      expect(signResult.reason).toBe("not-active");
    }
  });

  /**
   * [AC-MSG-004-05][REQ-NFR-009][NEGATIVE] Fail-closed invariant:
   * Indeterminate scan → stays 'pending' (fail-closed — NOT a pass, NEVER active).
   * Key contains 'indeterminate' → mock scanner returns 'indeterminate'.
   *
   * Gate-Authoring Named Code Path: indeterminate verdict does NOT enter the
   * `verdict === 'clean'` branch → remains 'pending'. A pending attachment is NEVER signable.
   *
   * ADR-021: 'indeterminate' is first-class fail-closed; silently becoming 'active' is forbidden.
   */
  it("[REQ-NFR-009] indeterminate scan → stays 'pending' (fail-closed — NEVER becomes active)", async () => {
    const result = await storeAndScanAttachment({
      messageId: messageAId,
      threadId: threadAId,
      originalFilename: "indeterminate-scan-attachment.pdf",  // 'indeterminate' sentinel
      contentType: "application/pdf",
      bytes: Buffer.from("scanner could not complete"),
      uploadedByClerkId: clientAClerkId,
    });

    // Fail-closed: indeterminate → stays 'pending'. NOT 'active'. // REQ-NFR-009 // ADR-021
    expect(result.outcome).toBe("pending");
    const attachmentId = result.attachmentId;
    createdAttachmentIds.push(attachmentId);

    // DB read-back: status MUST be 'pending' (NEVER silently 'active').
    const verify = await adminPool.request().query<{ status: string }>(
      `SELECT [status] FROM [dbo].[MessageAttachment] WHERE [id] = '${attachmentId}'`
    );
    expect(verify.recordset[0]?.status).toBe("pending");

    // Attempt to sign the pending (indeterminate) attachment — MUST be refused.
    // REQ-NFR-009: pending attachment is NEVER signable (fail-closed). // REQ-NFR-009
    const signResult = await withClerkIdentity(clientAClerkId, "CLIENT", () =>
      authorizeThenSignAttachment({
        attachmentId,
        actor: { clerkUserId: clientAClerkId, role: "CLIENT" },
      })
    );

    expect(signResult.authorized).toBe(false);
    if (!signResult.authorized) {
      expect(signResult.reason).toBe("not-active");
    }
  });

  /**
   * [AC-MSG-004-05] Oversize file → rejected at attach (same size rule as document upload).
   * File exceeding MAX_FILE_SIZE_BYTES throws before any INSERT.
   * ADR-021 §3: 100 MB cap. Same rule as document upload (EPIC-013 lesson).
   */
  it("[AC-MSG-004-05] oversize file → rejected at attach before any INSERT", async () => {
    // Create a buffer that exceeds MAX_FILE_SIZE_BYTES (100 MB).
    // DECISION: allocate a small buffer and set its length artificially to avoid OOM.
    // We use Buffer.alloc to create a properly-sized small buffer and manipulate the size check.
    // Actually, we need to satisfy the `input.bytes.length > MAX_FILE_SIZE_BYTES` check.
    // Use a mock by creating a fake Buffer object with a large .length property.
    const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB — from @tax-portal/storage
    const fakeOversizeBuffer = Object.create(Buffer.from("x")) as Buffer;
    Object.defineProperty(fakeOversizeBuffer, "length", { value: MAX_FILE_SIZE_BYTES + 1, writable: false });

    await expect(
      storeAndScanAttachment({
        messageId: messageAId,
        threadId: threadAId,
        originalFilename: "oversize-file.pdf",
        contentType: "application/pdf",
        bytes: fakeOversizeBuffer,
        uploadedByClerkId: clientAClerkId,
      })
    ).rejects.toThrow(/MAX_FILE_SIZE_BYTES/);
  });

});

// ─── Tests: IDOR defence — cross-thread key-substitution negative ─────────────

describe("[IDOR Defence] Cross-thread key-substitution negative (EPIC-013 lesson)", () => {

  /**
   * [AC-MSG-004-03][NEGATIVE][REQUIRED — SDET trap]
   * A participant of thread A CANNOT mint a URL for thread B's attachment by substituting ids.
   *
   * Test:
   *   1. Store a clean attachment in thread B (CLIENT-B's thread).
   *   2. CLIENT-A (participant of thread A ONLY) attempts to sign thread B's attachmentId.
   *   3. RLS FILTER (sec.pol_MessageAttachment) prevents CLIENT-A from resolving the attachment.
   *      → authorizeThenSignAttachment returns { authorized: false, reason: 'rls-filtered' }.
   *
   * This is the IDOR negative required by the task spec (EPIC-013 lesson).
   * The client never supplies a storage key — only the attachmentId.
   * The RLS FILTER is the sole enforcement boundary (ADR-005).
   *
   * // ADR-005 // ADR-008 // ADR-009 // EPIC-013 // CS-TS-001
   */
  it("[REQUIRED NEGATIVE] CLIENT-A cannot mint URL for thread-B attachment — RLS FILTER blocks it", async () => {
    // 1. Store a clean attachment in thread B (CLIENT-B's thread / message).
    const storeResult = await storeAndScanAttachment({
      messageId: messageBId,   // thread B's message
      threadId: threadBId,      // thread B
      originalFilename: "client-b-private-attachment.pdf",  // clean key → 'active'
      contentType: "application/pdf",
      bytes: Buffer.from("%PDF-1.4 client-b private document"),
      uploadedByClerkId: clientBClerkId,
    });

    expect(storeResult.outcome).toBe("active");
    const threadBAttachmentId = storeResult.attachmentId;
    createdAttachmentIds.push(threadBAttachmentId);

    // 2. CLIENT-A (participant of thread A only) attempts to sign thread B's attachment.
    //    CLIENT-A's SESSION_CONTEXT: clerkId = clientAClerkId.
    //    sec.pol_MessageAttachment FILTER resolves participation via Message → Thread → Engagement.
    //    Thread B's Engagement.clientUserId = clientBUserId ≠ clientAUserId → RLS returns no rows.
    const signResult = await withClerkIdentity(clientAClerkId, "CLIENT", () =>
      authorizeThenSignAttachment({
        attachmentId: threadBAttachmentId,  // thread B's attachment ID
        actor: { clerkUserId: clientAClerkId, role: "CLIENT" },
      })
    );

    // RLS FILTER returns no rows for CLIENT-A on thread B's attachment.
    // → Prisma findUnique returns null → 'rls-filtered' (not-found from caller's perspective).
    // ADR-005: the FILTER predicate is the sole enforcement boundary. // ADR-005
    // IDOR: CLIENT-A cannot mint a URL for thread-B's attachment. // EPIC-013
    expect(signResult.authorized).toBe(false);
    if (!signResult.authorized) {
      expect(signResult.reason).toBe("rls-filtered");
    }
  });

});

// ─── Tests: multiple attachments on one message (AC-MSG-004-01/-02) ───────────

describe("[AC-MSG-004-01][AC-MSG-004-02] Multiple attachments on one message", () => {

  /**
   * [AC-MSG-004-01][AC-MSG-004-02][POSITIVE]
   * Multiple attachments on one message — all stored + listed.
   * listMessageAttachments returns all attachments ordered by createdAt ASC.
   */
  it("[AC-MSG-004-01] multiple attachments on one message — all stored + listed", async () => {
    // Store two clean attachments on the same message (thread A).
    const result1 = await storeAndScanAttachment({
      messageId: messageAId,
      threadId: threadAId,
      originalFilename: "attachment-one.pdf",  // clean → 'active'
      contentType: "application/pdf",
      bytes: Buffer.from("%PDF-1.4 first attachment"),
      uploadedByClerkId: clientAClerkId,
    });
    expect(result1.outcome).toBe("active");
    createdAttachmentIds.push(result1.attachmentId);

    const result2 = await storeAndScanAttachment({
      messageId: messageAId,
      threadId: threadAId,
      originalFilename: "attachment-two.txt",  // clean → 'active'
      contentType: "text/plain",
      bytes: Buffer.from("second attachment plain text content"),
      uploadedByClerkId: clientAClerkId,
    });
    expect(result2.outcome).toBe("active");
    createdAttachmentIds.push(result2.attachmentId);

    // List attachments under CLIENT-A's SESSION_CONTEXT.
    // AC-MSG-004-02: attachments visible to thread participants alongside the message. // AC-MSG-004-02
    // CS-TS-001: listMessageAttachments uses request pool via Prisma db wrapper. // CS-TS-001
    const attachments = await withClerkIdentity(clientAClerkId, "CLIENT", () =>
      listMessageAttachments(messageAId)
    );

    // Must return at least the two we just inserted (other tests may have added more).
    const ids = attachments.map((a) => a.id.toLowerCase());
    expect(ids).toContain(result1.attachmentId.toLowerCase());
    expect(ids).toContain(result2.attachmentId.toLowerCase());

    // All returned attachments must belong to this message.
    for (const att of attachments) {
      expect(eqId(att.messageId, messageAId)).toBe(true);
    }

    // Verify sizeBytes are > 0 for active attachments.
    const att1 = attachments.find((a) => eqId(a.id, result1.attachmentId));
    const att2 = attachments.find((a) => eqId(a.id, result2.attachmentId));
    expect(att1?.status).toBe("active");
    expect(att2?.status).toBe("active");
    expect(att1?.sizeBytes).toBeGreaterThan(0);
    expect(att2?.sizeBytes).toBeGreaterThan(0);
  });

  /**
   * [AC-MSG-004-02][NEGATIVE] CLIENT-B cannot list CLIENT-A's thread's message attachments.
   * RLS FILTER (sec.pol_MessageAttachment) prevents cross-thread listing.
   */
  it("[AC-MSG-004-02] CLIENT-B cannot list CLIENT-A's message attachments — RLS FILTER", async () => {
    // CLIENT-B attempts to list attachments for CLIENT-A's message.
    const attachments = await withClerkIdentity(clientBClerkId, "CLIENT", () =>
      listMessageAttachments(messageAId)  // CLIENT-A's message
    );

    // RLS FILTER: CLIENT-B is not a participant of thread A → zero rows returned.
    // ADR-005: FILTER predicate enforces isolation. // ADR-005
    expect(attachments).toHaveLength(0);
  });

});

// ─── Tests: signed URL shape + TTL (ADR-008/-009) ────────────────────────────

describe("[ADR-008][ADR-009] Signed-URL shape — TTL-capped, server-resolved key", () => {

  /**
   * [AC-MSG-004-03][ADR-008] Signed URL has a future expiresAt (TTL-capped).
   * The URL is short-lived and expires — never permanently accessible.
   *
   * ADR-008: TTL-capped (max 3600s). // ADR-008
   * ADR-009: signed after authorization; server-resolved key only. // ADR-009
   * CS-GEN-001: URL is returned but NEVER logged. // CS-GEN-001
   */
  it("[ADR-008][AC-MSG-004-03] signed URL has future expiresAt (TTL-capped)", async () => {
    // Store a clean attachment.
    const result = await storeAndScanAttachment({
      messageId: messageAId,
      threadId: threadAId,
      originalFilename: "ttl-test-attachment.pdf",  // clean → 'active'
      contentType: "application/pdf",
      bytes: Buffer.from("%PDF-1.4 ttl test content"),
      uploadedByClerkId: clientAClerkId,
    });
    expect(result.outcome).toBe("active");
    createdAttachmentIds.push(result.attachmentId);

    const before = Date.now();
    const signResult = await withClerkIdentity(clientAClerkId, "CLIENT", () =>
      authorizeThenSignAttachment({
        attachmentId: result.attachmentId,
        ttlSeconds: 300,  // explicit 5-min TTL (within ADR-008 max)
        actor: { clerkUserId: clientAClerkId, role: "CLIENT" },
      })
    );

    expect(signResult.authorized).toBe(true);
    if (signResult.authorized) {
      // expiresAt must be in the future (TTL-capped by the adapter — ADR-008). // ADR-008
      expect(signResult.expiresAt.getTime()).toBeGreaterThan(before);
      // URL must be present and non-empty (signed URL — never publicly addressable). // ADR-008
      expect(typeof signResult.url).toBe("string");
      expect(signResult.url.length).toBeGreaterThan(0);
      // CS-GEN-001: URL is NOT logged in this test. // CS-GEN-001
    }
  });

});
