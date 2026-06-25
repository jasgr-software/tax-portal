/**
 * packages/db/src/repositories/message-attachment.ts
 *
 * Scan-before-available + participant-scoped signed-URL pipeline for MessageAttachments.
 *
 * TASK-017-004 (BRIEF-017 / EPIC-017):
 *   AC-MSG-004-01 — sender attaches one or more files to a message.
 *   AC-MSG-004-02 — attachments visible to thread participants alongside the message.
 *   AC-MSG-004-03 — participants retrieve attachments via a short-lived participant-scoped signed URL.
 *   AC-MSG-004-04 — attachments remain available as long as the message is retained.
 *   AC-MSG-004-05 — attachments are scanned before available; infected/indeterminate withheld.
 *
 * Three exported functions:
 *   storeAndScanAttachment — ADMIN POOL: put bytes to storage → scan → set status active/pending/infected.
 *   authorizeThenSignAttachment — REQUEST POOL (RLS): resolve attachment + thread, assert participant
 *     AND status='active', sign the server-resolved storage key. Signs ONLY a server-resolved key.
 *   listMessageAttachments — REQUEST POOL: list attachments for a message (RLS-governed).
 *
 * Security / compliance:
 *   ADR-008: Storage port — signed URL only, never publicly addressable; storage key is server-owned.
 *   ADR-009: Two-phase scan-before-available; storage key includes threadId/messageId/attachmentId.
 *   ADR-021: File-upload safety — reuse EPIC-007 FileScanner + EPIC-013 validateUploadedBytes/MAX_FILE_SIZE_BYTES.
 *   REQ-NFR-009: An attachment must NOT be retrievable until the FileScanner returns 'clean'.
 *     'indeterminate' → stays 'pending' (fail-closed, never silently promoted to 'active').
 *     'infected'      → terminal 'infected' (never retrievable, ever).
 *   ADR-003: Admin pool for storage put + scan + status promotion; request pool for RLS authz + list.
 *   ADR-005: sec.pol_MessageAttachment FILTER + BLOCK governs request-pool reads.
 *   ADR-019: Signed-URL mint is audited (attachmentId only — no URL/filename/key — CS-GEN-001).
 *   CS-GEN-001: Signed URL NEVER logged; audit payload = attachmentId only.
 *   CS-GEN-003: Governing keys cited throughout.
 *   CS-TS-001: Request-pool reads via Prisma db wrapper (withRequestContext / withClerkIdentity); admin writes via getAdminPool.
 *   CS-TS-002: No raw pool import outside packages/db.
 *   CS-TS-003: Cross-surface mirror — consume this module on both portal + admin surfaces.
 *
 * IDOR defence (EPIC-013 lesson, required by task spec):
 *   authorizeThenSignAttachment threads the attachmentId → resolves attachment + its thread via
 *   REQUEST POOL (RLS-filtered). Only after RLS confirms the caller is a participant AND the
 *   attachment status='active' is the server-resolved storage key signed. The client NEVER
 *   supplies a storage key. A participant of thread A cannot mint a URL for thread B's attachment
 *   by substituting ids/keys — the RLS FILTER gates the resolve step.
 *
 * Storage key shape (server-owned, ADR-008/-009):
 *   threads/{threadId}/messages/{messageId}/attachments/{attachmentId}/{urlencoded-filename}
 *   This key is computed server-side after the INSERT returns the attachmentId. The client
 *   never sees or supplies the storage key.
 *
 * Scan fail-closed invariant (NAMED CODE PATH — Gate-Authoring evidence):
 *   ONLY the block `if (scanVerdict.verdict === 'clean' && validationResult === 'pass')`
 *   sets status='active'. ALL other branches stay 'pending' or go 'infected'.
 *   Breaking this invariant (e.g. removing the 'clean' check) would red the
 *   infected/indeterminate-never-signable tests.
 *
 * // ADR-003 // ADR-005 // ADR-008 // ADR-009 // ADR-021 // REQ-NFR-009
 * // CS-TS-001 // CS-TS-002 // CS-TS-003 // CS-GEN-001 // CS-GEN-003
 * // AC-MSG-004-01 // AC-MSG-004-02 // AC-MSG-004-03 // AC-MSG-004-04 // AC-MSG-004-05
 */

import mssqlPkg from "mssql";
import { getAdminPool } from "../admin-connection.js";
import { db } from "../client.js";
import {
  getStorage,
  getFileScanner,
  validateUploadedBytes,
  MAX_FILE_SIZE_BYTES,
} from "@tax-portal/storage";
import { recordAuthEvent } from "../audit.js";
import type { AuditActor } from "../audit.js";

const { Request: MssqlRequest } = mssqlPkg;

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * A single MessageAttachment as returned to callers.
 *
 * status: 'pending' | 'active' | 'infected' (mirrors Document.status — ADR-009).
 * AC-MSG-004-02: visible to thread participants alongside the message.
 */
export interface MessageAttachmentItem {
  id: string;
  messageId: string;
  storageKey: string;
  originalFilename: string;
  contentType: string;
  /** sizeBytes as number — BigInt deserialized at the boundary. */
  sizeBytes: number;
  /** 'pending' | 'active' | 'infected' */
  status: string;
  uploadedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Input for storeAndScanAttachment.
 *
 * Called by the action layer (admin pool) after the caller's identity has been verified.
 * The action layer is responsible for identity gating before calling this function.
 *
 * AC-MSG-004-01: sender attaches one+ files to a message.
 * ADR-021: file-type/size validation + scan happen inside this function.
 * REQ-NFR-009: scan-before-available gate — status stays 'pending' unless scan returns 'clean'.
 */
export interface StoreAndScanAttachmentInput {
  /** The Message.id the attachment belongs to (server-resolved — never client-supplied). */
  messageId: string;
  /**
   * The Thread.id the message belongs to.
   * Required for the storage key (server-owned scoping — ADR-008/-009).
   */
  threadId: string;
  /** Original filename as declared by the uploader (ADR-009). */
  originalFilename: string;
  /** Declared content-type (ADR-009). */
  contentType: string;
  /** File bytes to store (required — inline attach; caller has the bytes). */
  bytes: Buffer;
  /** Uploader clerkId from the verified session (audit trail — never client-supplied). */
  uploadedByClerkId: string | null;
}

/**
 * Result of storeAndScanAttachment.
 *
 * 'active'   — scan clean + validation pass; attachment is retrievable.
 * 'infected' — threat detected; attachment NEVER retrievable.
 * 'pending'  — indeterminate scan OR validation failure; stays withheld (fail-closed).
 *
 * ADR-021 / REQ-NFR-009: only 'active' attachments are signable.
 */
export type StoreAndScanAttachmentResult =
  | { outcome: "active"; attachmentId: string }
  | { outcome: "infected"; attachmentId: string; threat: string | null }
  | { outcome: "pending"; attachmentId: string; reason: string };

/**
 * Input for authorizeThenSignAttachment.
 *
 * The caller provides the attachmentId ONLY — never the storage key (IDOR defence).
 * The storage key is resolved server-side under RLS before minting the URL.
 *
 * ADR-008/-009: authorize-before-mint discipline; server-resolved key.
 * REQ-NFR-009: attachment must be 'active' before signing.
 */
export interface AuthorizeThenSignAttachmentInput {
  /** The MessageAttachment.id (client-supplied — only the id, never the storage key). */
  attachmentId: string;
  /** Optional TTL override in seconds (capped by the adapter — ADR-008 max 3600s). */
  ttlSeconds?: number;
  /** Actor for the audit event (CS-GEN-001 / ADR-019). */
  actor: AuditActor;
}

/**
 * Result of authorizeThenSignAttachment.
 *
 * 'authorized: true'  — URL minted; expiresAt reflects the TTL cap (ADR-008).
 * 'authorized: false' — attachment not found, not active, or caller is not a participant.
 *
 * AC-MSG-004-03: participant-scoped signed URL.
 * ADR-008: TTL-capped; short-lived. Never logged (CS-GEN-001).
 * ADR-009: signed AFTER authorization (authorize-before-mint).
 */
export type AuthorizeThenSignAttachmentResult =
  | { authorized: true; url: string; expiresAt: Date }
  | {
      authorized: false;
      reason: "not-found" | "not-active" | "rls-filtered";
    };

// ─── Internal row types ────────────────────────────────────────────────────────

type MessageAttachmentRow = {
  id: string;
  messageId: string;
  storageKey: string;
  originalFilename: string;
  contentType: string;
  sizeBytes: bigint;
  status: string;
  uploadedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
};

// ─── Internal cast helpers ─────────────────────────────────────────────────────

function dbAsMessageAttachmentClient() {
  return db as unknown as {
    messageAttachment: {
      findUnique: (args: { where: { id: string } }) => Promise<MessageAttachmentRow | null>;
      findMany: (args?: {
        where?: { messageId?: string };
        orderBy?: { createdAt: "asc" | "desc" };
      }) => Promise<MessageAttachmentRow[]>;
    };
  };
}

// ─── Row mapper ───────────────────────────────────────────────────────────────

function mapAttachmentRow(row: MessageAttachmentRow): MessageAttachmentItem {
  return {
    id: row.id,
    messageId: row.messageId,
    storageKey: row.storageKey,
    originalFilename: row.originalFilename,
    contentType: row.contentType,
    sizeBytes: Number(row.sizeBytes),
    status: row.status,
    uploadedBy: row.uploadedBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// ─── Internal: admin pool promotion helpers ────────────────────────────────────

async function promoteAttachmentToActive(attachmentId: string, sizeBytes: number): Promise<void> {
  const pool = await getAdminPool(); // CS-TS-002: admin pool via getAdminPool() only
  const req = new MssqlRequest(pool);
  req.input("attachmentId", mssqlPkg.NVarChar(50), attachmentId);
  req.input("sizeBytes", mssqlPkg.BigInt(), sizeBytes);
  await req.query(
    `UPDATE [dbo].[MessageAttachment]
     SET [status]    = N'active',
         [sizeBytes] = @sizeBytes,
         [updatedAt] = SYSDATETIMEOFFSET()
     WHERE [id] = @attachmentId AND [status] = N'pending'`
  );
}

async function promoteAttachmentToInfected(
  attachmentId: string,
  sizeBytes: number,
): Promise<void> {
  const pool = await getAdminPool(); // CS-TS-002
  const req = new MssqlRequest(pool);
  req.input("attachmentId", mssqlPkg.NVarChar(50), attachmentId);
  req.input("sizeBytes", mssqlPkg.BigInt(), sizeBytes);
  await req.query(
    `UPDATE [dbo].[MessageAttachment]
     SET [status]    = N'infected',
         [sizeBytes] = @sizeBytes,
         [updatedAt] = SYSDATETIMEOFFSET()
     WHERE [id] = @attachmentId AND [status] = N'pending'`
  );
}

async function updateAttachmentSizeBytesOnPending(
  attachmentId: string,
  sizeBytes: number,
): Promise<void> {
  const pool = await getAdminPool(); // CS-TS-002
  const req = new MssqlRequest(pool);
  req.input("attachmentId", mssqlPkg.NVarChar(50), attachmentId);
  req.input("sizeBytes", mssqlPkg.BigInt(), sizeBytes);
  await req.query(
    `UPDATE [dbo].[MessageAttachment]
     SET [sizeBytes] = @sizeBytes,
         [updatedAt] = SYSDATETIMEOFFSET()
     WHERE [id] = @attachmentId AND [status] = N'pending'`
  );
}

// ─── Write + Gate: storeAndScanAttachment (admin pool — ADR-021 scan-before-available) ──

/**
 * Store an attachment in object storage and run the scan-before-available gate (ADR-021).
 *
 * ADMIN POOL: uses getAdminPool() for the INSERT and status promotion. No SESSION_CONTEXT.
 * The action layer MUST verify the caller's identity (CLIENT or ACCOUNTANT) before invoking.
 *
 * Pipeline:
 *   1. Size validation — rejects immediately if bytes exceed MAX_FILE_SIZE_BYTES (100 MB).
 *      Same rule as document upload (ADR-021 §3 / AC-MSG-004-05).
 *   2. INSERT a pending MessageAttachment row (status='pending'; storageKey='__pending__' placeholder).
 *   3. Compute the server-owned storage key:
 *      threads/{threadId}/messages/{messageId}/attachments/{attachmentId}/{urlencoded-filename}
 *      The key is computed AFTER the INSERT returns the attachmentId — never client-supplied (ADR-008/-009).
 *   4. Update the storageKey column with the computed key.
 *   5. PUT the bytes to storage (getStorage().put) — admin pool / server-side.
 *   6. validateUploadedBytes — MIME/magic-byte + size check (ADR-021 §2).
 *   7. getFileScanner().scan — AV scan (ADR-021 §1). Reuses EPIC-007 FileScanner seam.
 *   8. Promotion verdict (SCAN-BEFORE-AVAILABLE GATE — ADR-021 / REQ-NFR-009):
 *      - 'clean' + validation 'pass'  → promote to 'active'  (AC-MSG-004-05 pass)
 *      - 'infected'                   → terminal 'infected'   (never retrievable)
 *      - 'indeterminate'              → stays 'pending'       (fail-closed — NEVER silently active)
 *      - validation 'mime-mismatch'   → stays 'pending'       (fail-closed)
 *      - validation 'too-large'       → stays 'pending'       (fail-closed; size already pre-checked)
 *
 * FAIL-CLOSED INVARIANT (Gate-Authoring Named Code Path):
 *   ONLY `if (scanVerdict.verdict === 'clean' && validationResult === 'pass')` → 'active'.
 *   ALL other paths stay 'pending' or go 'infected'.
 *   This invariant is proved by: infected→never-signable + indeterminate→stays-pending tests.
 *
 * Reuse discipline (CS-TS-001):
 *   getStorage(), getFileScanner(), validateUploadedBytes, MAX_FILE_SIZE_BYTES
 *   are all imported from @tax-portal/storage — NOT rebuilt here. // CS-TS-001
 *
 * ADR-008: storage key is server-computed after the INSERT; never client-supplied.
 * ADR-021 / REQ-NFR-009: scan-before-available gate.
 * CS-GEN-001: storageKey NOT logged (only attachmentId). // CS-GEN-001
 * CS-TS-002: admin pool via getAdminPool() only. // CS-TS-002
 *
 * // ADR-003 // ADR-008 // ADR-009 // ADR-021 // REQ-NFR-009
 * // CS-TS-001 // CS-TS-002 // CS-GEN-001 // CS-GEN-003
 * // AC-MSG-004-01 // AC-MSG-004-05
 */
export async function storeAndScanAttachment(
  input: StoreAndScanAttachmentInput,
): Promise<StoreAndScanAttachmentResult> {
  // 0. Pre-flight size check — reject immediately if bytes exceed the cap (ADR-021 §3).
  //    Same rule as document upload (AC-MSG-004-05 / EPIC-013 lesson).
  if (input.bytes.length > MAX_FILE_SIZE_BYTES) {
    // DECISION: pre-flight before insert so we never persist rows for oversized files.
    throw new Error(
      `[storeAndScanAttachment] File exceeds MAX_FILE_SIZE_BYTES (${MAX_FILE_SIZE_BYTES} bytes): ` +
        `actual=${input.bytes.length}`
    );
  }

  // 1. INSERT a pending MessageAttachment row (admin pool — ADR-003 §7).
  const pool = await getAdminPool(); // CS-TS-002
  const insertReq = new MssqlRequest(pool);

  insertReq.input("messageId", mssqlPkg.NVarChar(50), input.messageId);
  insertReq.input("originalFilename", mssqlPkg.NVarChar(500), input.originalFilename);
  insertReq.input("contentType", mssqlPkg.NVarChar(255), input.contentType);
  insertReq.input("sizeBytes", mssqlPkg.BigInt(), 0); // Pending: 0 initially; set after stat
  insertReq.input("uploadedBy", mssqlPkg.NVarChar(64), input.uploadedByClerkId ?? null);

  const insertResult = await insertReq.query<{ id: string }>(
    `INSERT INTO [dbo].[MessageAttachment]
       ([messageId], [storageKey], [originalFilename], [contentType],
        [sizeBytes], [status], [uploadedBy], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (@messageId, N'__pending__',
             @originalFilename, @contentType, @sizeBytes,
             N'pending', @uploadedBy, SYSDATETIMEOFFSET())`
  );

  const insertRow = insertResult.recordset[0];
  if (!insertRow) {
    throw new Error(
      "storeAndScanAttachment INSERT did not return a row — unexpected SQL Server behavior"
    );
  }

  const attachmentId = insertRow.id;

  // 2. Compute the server-owned storage key (ADR-008/-009).
  //    Key shape: threads/{threadId}/messages/{messageId}/attachments/{attachmentId}/{urlencoded-filename}
  //    The key is computed AFTER the INSERT returns the attachmentId — never client-supplied.
  //    CS-GEN-001: key is NOT logged (only attachmentId). // CS-GEN-001
  const storageKey =
    `threads/${input.threadId}/messages/${input.messageId}/attachments/${attachmentId}/` +
    `${encodeURIComponent(input.originalFilename)}`;

  // 3. Update the storageKey column (placeholder → real key).
  const updateReq = new MssqlRequest(pool); // CS-TS-002
  updateReq.input("attachmentId", mssqlPkg.NVarChar(50), attachmentId);
  updateReq.input("storageKey", mssqlPkg.NVarChar(1024), storageKey);
  await updateReq.query(
    `UPDATE [dbo].[MessageAttachment]
     SET [storageKey] = @storageKey, [updatedAt] = SYSDATETIMEOFFSET()
     WHERE [id] = @attachmentId`
  );

  // 4. PUT the bytes to storage (getStorage() reused from @tax-portal/storage — CS-TS-001).
  //    ADR-008: storage port — never publicly addressable; signed URL only.
  //    ADR-020: encryption at rest is the adapter contract. // ADR-020
  const storage = getStorage(); // CS-TS-001: reused from @tax-portal/storage
  await storage.put({
    key: storageKey,
    body: input.bytes,
    contentType: input.contentType,
  });

  // 5. MIME/size validation (ADR-021 §2) — reuse validateUploadedBytes (EPIC-013 seam).
  //    Passes bytes directly (inline attach — bytes already in memory).
  //    CS-TS-001: validateUploadedBytes from @tax-portal/storage — NOT rebuilt. // CS-TS-001
  const validationResult = await validateUploadedBytes({
    declaredContentType: input.contentType,
    bytes: input.bytes,
    sizeBytes: input.bytes.length,
  });

  // 6. AV scan (ADR-021 §1) — reuse EPIC-007 FileScanner seam (NOT rebuilt).
  //    CS-TS-001: getFileScanner() from @tax-portal/storage. // CS-TS-001
  const scanner = getFileScanner(); // CS-TS-001: reuse EPIC-007 FileScanner
  const scanVerdict = await scanner.scan({ key: storageKey });

  // 7. Promotion verdict — SCAN-BEFORE-AVAILABLE GATE (ADR-021 / REQ-NFR-009)
  //
  // GATE: Only 'clean' + validation 'pass' promotes to 'active'.
  // Every other path leaves the file 'pending' or transitions to 'infected'.
  // This is the NAMED CODE PATH for Gate-Authoring evidence.
  if (scanVerdict.verdict === "clean" && validationResult === "pass") {
    // PROMOTE: pending → active (ADR-021 / REQ-NFR-009)
    await promoteAttachmentToActive(attachmentId, input.bytes.length);
    return { outcome: "active", attachmentId };
  }

  if (scanVerdict.verdict === "infected") {
    // TERMINAL: pending → infected (REQ-NFR-009 / AC-MSG-004-05 — never retrievable)
    await promoteAttachmentToInfected(attachmentId, input.bytes.length);
    return {
      outcome: "infected",
      attachmentId,
      threat: scanVerdict.threat ?? null,
    };
  }

  // 'indeterminate' (scanner unavailable / timeout) OR validation failure:
  // STAY PENDING — fail-closed. NEVER silently become 'active' (REQ-NFR-009 / ADR-021).
  // ADR-021: 'indeterminate' is a first-class fail-closed verdict — NOT a pass.
  const reason =
    scanVerdict.verdict === "indeterminate"
      ? `scanner-indeterminate: ${scanVerdict.reason ?? "no-reason"}`
      : `validation-failed: ${validationResult}`;

  // Update sizeBytes to the actual byte count even if staying pending.
  await updateAttachmentSizeBytesOnPending(attachmentId, input.bytes.length);

  return {
    outcome: "pending",
    attachmentId,
    reason,
  };
}

// ─── Read + Authorize: authorizeThenSignAttachment (request pool — IDOR defence) ─

/**
 * Authorize the caller's access to a MessageAttachment and mint a signed download URL.
 *
 * IDOR DEFENCE (EPIC-013 lesson — HARD required by task spec):
 *   Threads the attachmentId → resolves attachment + its thread under the REQUEST POOL (RLS).
 *   Only after RLS confirms the caller is a participant (FILTER predicate) AND the attachment
 *   is status='active' is the server-resolved storage key signed.
 *   The client NEVER supplies a storage key — only the attachmentId.
 *   A participant of thread A CANNOT mint a URL for thread B's attachment by substituting
 *   ids/keys — the RLS FILTER (sec.pol_MessageAttachment) gates the resolve step.
 *
 * Gate sequence:
 *   1. Resolve attachment via REQUEST POOL (RLS FILTER via sec.pol_MessageAttachment).
 *      null → 'not-found' (RLS-filtered or does not exist). No URL minted.
 *   2. Assert status='active'. non-active → 'not-active'. No URL minted.
 *   3. Sign the server-resolved storageKey (NOT a caller-supplied key — IDOR gate).
 *      TTL-capped (ADR-008 max 3600s; default adapter TTL ~300s).
 *   4. Emit audit event (ADR-019): action='attachment.download_url_minted',
 *      targetId=attachmentId ONLY — no URL, filename, or storage key logged (CS-GEN-001).
 *
 * MUST be called inside withRequestContext() or withClerkIdentity() (ADR-003).
 * The RLS FILTER (sec.pol_MessageAttachment) provides the participation gate.
 *
 * Mirrors authorizeThenSignDownload in packages/db/src/repositories/document.ts (CS-TS-003).
 *
 * ADR-003: SESSION_CONTEXT must be set before calling (request pool). // ADR-003
 * ADR-005: FILTER predicate gates the resolve step — participant-only. // ADR-005
 * ADR-008: TTL-capped signed URL (max 3600s). URL is never stored or logged. // ADR-008
 * ADR-009: authorize-before-mint discipline. // ADR-009
 * ADR-019: download_url_mint is audited; actor from verified session. // ADR-019
 * REQ-NFR-009: attachment must be 'active' before signing. // REQ-NFR-009
 * CS-GEN-001: signed URL NEVER logged; audit targetId = attachmentId only. // CS-GEN-001
 * CS-TS-001: request pool via Prisma db wrapper (withRequestContext). // CS-TS-001
 * CS-TS-003: mirrors authorizeThenSignDownload shape. // CS-TS-003
 *
 * // ADR-003 // ADR-005 // ADR-008 // ADR-009 // ADR-019 // REQ-NFR-009
 * // CS-GEN-001 // CS-TS-001 // CS-TS-003
 * // AC-MSG-004-03
 */
export async function authorizeThenSignAttachment(
  input: AuthorizeThenSignAttachmentInput,
): Promise<AuthorizeThenSignAttachmentResult> {
  // Gate 1: RLS-governed authz query (request pool / FILTER predicate).
  // ADR-009: authorize BEFORE minting any URL. The RLS FILTER (sec.pol_MessageAttachment)
  // resolves participant access through Message → Thread → Engagement/Client chain.
  // CS-TS-001: request pool via Prisma db wrapper. // CS-TS-001
  const client = dbAsMessageAttachmentClient();
  const row = await client.messageAttachment.findUnique({ where: { id: input.attachmentId } });

  if (!row) {
    // Not found OR RLS-filtered (caller is not a thread participant).
    // ADR-003 §5: null SESSION_CONTEXT → zero rows (fail-closed).
    // AC-MSG-004-03: participant-scoped; non-participants get no URL.
    return { authorized: false, reason: "rls-filtered" };
  }

  // Gate 2: status='active' only. pending/infected attachments are NEVER signable.
  // REQ-NFR-009: attachment must NOT be retrievable until FileScanner returns 'clean'.
  // 'indeterminate' → stays 'pending' → never signable (fail-closed).
  // 'infected' → terminal; never signable.
  if (row.status !== "active") {
    return { authorized: false, reason: "not-active" };
  }

  // Both gates passed. Mint the signed download URL.
  // ADR-008: TTL-capped by the adapter (max 3600s default ~300s).
  // CS-GEN-001: signed URL is NEVER logged. // CS-GEN-001
  const storage = getStorage(); // CS-TS-001: reuse from @tax-portal/storage
  const downloadOpts = {
    responseContentDisposition: `attachment; filename="${encodeURIComponent(row.originalFilename)}"`,
    responseContentType: row.contentType,
    ...(input.ttlSeconds !== undefined ? { ttlSeconds: input.ttlSeconds } : {}),
  };
  // Sign the SERVER-RESOLVED storageKey — never the caller-supplied key (IDOR gate).
  const signedUrl = await storage.getSignedDownloadUrl(row.storageKey, downloadOpts);

  // ADR-019: audit the mint (attachmentId only — no URL, filename, or key — CS-GEN-001).
  // Fire-and-not-blocking: audit failure does NOT prevent URL delivery.
  await recordAuthEvent({
    actor: input.actor,
    action: "attachment.download_url_minted",
    targetType: "MessageAttachment",
    targetId: input.attachmentId, // CS-GEN-001: attachmentId only — no URL/filename/key
    sourceSurface: input.actor.role === "ACCOUNTANT" ? "admin" : "portal",
    outcome: "success",
  }).catch((err: unknown) => {
    // CS-GEN-001: log only a coarse error identifier — no PII, URLs, or storage keys. // CS-GEN-001
    // A09 (logging): tightened from String(err) which could carry a storage key or URL.
    const errName = err instanceof Error ? err.name : "unknown";
    console.warn("[message-attachment.ts] audit emit failed (non-fatal):", errName);
  });

  return {
    authorized: true,
    url: signedUrl.url,
    expiresAt: signedUrl.expiresAt,
  };
}

// ─── Read: listMessageAttachments (request pool — RLS-governed) ───────────────

/**
 * Returns all MessageAttachment rows for the given message, visible to the current
 * SESSION_CONTEXT identity (RLS FILTER via sec.pol_MessageAttachment).
 *
 * Under sec.pol_MessageAttachment:
 *   - CLIENT sees only attachments for messages in threads they participate in.
 *   - ACCOUNTANT sees all attachments.
 *   - Null SESSION_CONTEXT → ZERO rows (fail-closed, ADR-003 §5).
 *
 * All statuses are returned ('pending', 'active', 'infected'). Callers rendering
 * UI must filter to 'active' for downloadable attachments; 'pending'/'infected'
 * attachments display with appropriate unavailable-state UI.
 *
 * MUST be called inside withRequestContext() or withClerkIdentity() (ADR-003).
 *
 * AC-MSG-004-02: attachments visible to thread participants alongside the message.
 *
 * // ADR-003 // ADR-005 // CS-TS-001 // CS-GEN-003
 * // AC-MSG-004-02
 */
export async function listMessageAttachments(
  messageId: string,
): Promise<MessageAttachmentItem[]> {
  // CS-TS-001: request pool via Prisma db wrapper (withRequestContext). // CS-TS-001
  const client = dbAsMessageAttachmentClient();
  const rows = await client.messageAttachment.findMany({
    where: { messageId },
    orderBy: { createdAt: "asc" },
  });
  return rows.map(mapAttachmentRow);
}
