/**
 * packages/db/src/repositories/document.ts
 *
 * Two-phase authorize-then-sign upload/download pipeline for Documents.
 *
 * AC-FILE-001-02: Client upload stored in the engagement's set.
 * AC-FILE-001-05: A file in engagement A is NOT exposed to other engagements.
 * AC-FILE-003-01: Encrypted at rest (adapter contract — proven through this pipeline vs Azurite).
 * AC-FILE-003-02: Retrieval requires an authorization check.
 * AC-FILE-003-03: No anonymous/public path.
 * AC-FILE-003-04: Grant time-limited, expires.
 * AC-NFR-009-01:  Scanned before available (indeterminate → stays pending fail-closed).
 * AC-NFR-009-02:  Infected → withheld + uploader informed.
 *
 * Pool strategy:
 *   - authorizeEngagementForUpload: REQUEST POOL (db / SESSION_CONTEXT) — FILTER-governed.
 *     Resolves the engagement through the 0007 FILTER. RLS-filtered miss → null (404 / no URL).
 *     ADR-009 step 2a: "authorize on the request pool" before minting any URL.
 *   - insertPendingDocument: ADMIN POOL (getAdminPool) — ADR-009 step 2d.
 *     Inserts the Document row with status='pending', computes the storage key.
 *     Runs AFTER authorization; the pending INSERT never bypasses the authz gate.
 *   - completeUpload: ADMIN POOL for the promotion write.
 *     Runs validateUploadedBytes → getFileScanner().scan → promote active | infected | stay pending.
 *     THIS IS THE SCAN-BEFORE-AVAILABLE GATE (ADR-021 / AC-NFR-009-01/-02).
 *   - listEngagementDocuments: REQUEST POOL — FILTER-governed; client sees own engagement only.
 *   - authorizeThenSignDownload: REQUEST POOL authz → active-only → getStorage().getSignedDownloadUrl.
 *     ADR-009 step 2a: authorization BEFORE URL minting. pending/infected never signable.
 *
 * ADR-009: Two-phase upload (authorize→pending insert→sign URL→complete→promote).
 * ADR-021: Scan-before-available gate (pending→active only on clean+valid).
 * ADR-003: SESSION_CONTEXT for authorize; admin pool for pending insert / promotion.
 * ADR-003 Amendment 1: no @read_only on sp_set_session_context.
 * ADR-005: 0007 FILTER + BLOCK are the authz gates.
 * ADR-008: FileStorage port for signed URLs (TTL-capped by the adapter).
 * ADR-019: Upload is an audited event (withAuditTransaction / recordAuthEvent).
 * ADR-022: Upload path rate-limited (RateLimiter seam — consumed by the caller, not here).
 *
 * NOTE:
 *   - insertPendingDocument / completeUpload are NOT exported from the package barrel.
 *     Callers import them directly from this source module.
 *   - authorizeEngagementForUpload / listEngagementDocuments / authorizeThenSignDownload
 *     ARE exported on the barrel (request-pool reads that callers consume).
 *
 * DECISION (TASK-007-004): The rate-limit check and audit event are the CALLER's
 *   responsibility (server action in apps/portal / TASK-007-006). This repository
 *   provides the two-phase pipeline primitives; the caller wraps them with the
 *   RateLimiter.consume() call before invoking authorizeEngagementForUpload, and
 *   withAuditTransaction + recordAuthEvent after a successful upload URL mint.
 *   This keeps the repository focused on the data + storage layer per the ADR-003/019/022
 *   patterns already established (audit.ts / rate-limiter/port.ts are separate packages).
 *   The task-level dispatch note says "the upload path rate-limited + audited"; the tests
 *   here prove the audit seam call path (via integration of withAuditTransaction) and the
 *   RateLimiter seam is tested at the action layer.
 *
 * DECISION (TASK-007-004): authorizeEngagementForUpload returns the EngagementItem so the
 *   caller can also run checkStepAccessibility (letter gate) without an extra DB round-trip.
 *   The caller MUST check checkStepAccessibility before calling insertPendingDocument.
 */

import mssqlPkg from "mssql";
import { getAdminPool } from "../admin-connection.js";
import { db } from "../client.js";
import { getStorage } from "@tax-portal/storage";
import { getFileScanner, validateUploadedBytes } from "@tax-portal/storage";
import type { EngagementItem } from "./engagement.js";

const { Request: MssqlRequest } = mssqlPkg;

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * A single Document as returned to callers.
 *
 * AC-FILE-001-02: Documents are stored against the engagement.
 * status: 'pending' | 'active' | 'infected' (ADR-009).
 */
export interface DocumentItem {
  id: string;
  engagementId: string;
  documentRequestId: string | null;
  storageKey: string;
  originalFilename: string;
  contentType: string;
  /** sizeBytes as number — BigInt is deserialized at the boundary. */
  sizeBytes: number;
  /** 'pending' | 'active' | 'infected' */
  status: string;
  version: number;
  scanThreat: string | null;
  uploadedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Input for inserting a pending Document (ADR-009 step 2d). */
export interface InsertPendingDocumentInput {
  /** FK → Engagement. */
  engagementId: string;
  /** Optional FK → DocumentRequest (fulfillment link — null for ad-hoc uploads). */
  documentRequestId?: string | null;
  /** Original filename as declared by the uploader (ADR-009). */
  originalFilename: string;
  /** Declared content-type (signed into the upload URL policy). */
  contentType: string;
  /**
   * Declared content-length from the signed upload options. May be 0 for
   * unknown-at-request-time; authoritative size comes from stat() in completeUpload.
   */
  sizeBytes: number;
  /** Uploader clerkId from the verified session (audit trail — never client-supplied). */
  uploadedByClerkId: string | null;
}

/** Result of insertPendingDocument. */
export interface InsertPendingDocumentResult {
  /** The new Document id (used to compute the storage key). */
  documentId: string;
  /** The computed storage key: engagements/{engagementId}/documents/{documentId}/v1/{encoded-filename}. */
  storageKey: string;
}

/** Input for completeUpload (called after the client's PUT to storage). */
export interface CompleteUploadInput {
  /** The Document id returned by insertPendingDocument. */
  documentId: string;
  /** The storage key returned by insertPendingDocument. */
  storageKey: string;
  /** Uploader clerkId for the infected-notification path (AC-NFR-009-02). */
  uploadedByClerkId: string | null;
}

/** Result of completeUpload. */
export type CompleteUploadResult =
  | { outcome: "active"; documentId: string }
  | { outcome: "infected"; documentId: string; threat: string | null }
  | { outcome: "pending"; documentId: string; reason: string };

/** Input for authorize-then-sign download. */
export interface AuthorizeThenSignDownloadInput {
  /** The Document id to download. Must be 'active' and visible to the caller. */
  documentId: string;
  /** engagementId — used to scope the FILTER query to the caller's engagement. */
  engagementId: string;
  /** Optional TTL override in seconds (capped by ADR-008 — default: 300s). */
  ttlSeconds?: number;
}

/** Result of authorizeThenSignDownload. */
export type AuthorizeThenSignDownloadResult =
  | { authorized: true; url: string; expiresAt: Date }
  | { authorized: false; reason: "not-found" | "not-active" | "rls-filtered" };

// ─── Internal cast helpers ─────────────────────────────────────────────────────

type EngagementRow = {
  id: string;
  engagementRequestId: string;
  clientUserId: string | null;
  status: string;
  letterSignedAt: Date | null;
  letterSignatureEvidence: string | null;
  letterTemplateSnapshot: string | null;
  questionnaireSubmittedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type DocumentRow = {
  id: string;
  engagementId: string;
  documentRequestId: string | null;
  storageKey: string;
  originalFilename: string;
  contentType: string;
  sizeBytes: bigint;
  status: string;
  version: number;
  scanThreat: string | null;
  uploadedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function dbAsEngagementClient() {
  return db as unknown as {
    engagement: {
      findUnique: (args: { where: { id: string } }) => Promise<EngagementRow | null>;
    };
  };
}

function dbAsDocumentClient() {
  return db as unknown as {
    document: {
      findUnique: (args: { where: { id: string } }) => Promise<DocumentRow | null>;
      findMany: (args?: {
        where?: { engagementId?: string };
        orderBy?: { createdAt: "asc" | "desc" };
      }) => Promise<DocumentRow[]>;
    };
  };
}

// ─── Read + Authorize: authorizeEngagementForUpload (request pool) ─────────────

/**
 * Authorize the caller's engagement via the REQUEST POOL (RLS-governed).
 *
 * ADR-009 step 2a: the RLS authz query runs BEFORE any URL is minted.
 * sec.pol_Engagement FILTER (fn_engagement_access): CLIENT sees only their own
 * engagement; ACCOUNTANT sees all; null SESSION_CONTEXT → null (fail-closed).
 *
 * Returns the EngagementItem if the caller owns the engagement (non-null).
 * Returns null when:
 *   - The engagement does not exist.
 *   - The caller's SESSION_CONTEXT does not satisfy the FILTER predicate.
 *   - SESSION_CONTEXT is null (fail-closed, ADR-003 §5).
 *
 * The caller MUST check the return value. null → 404 / refuse. No URL minted.
 * The caller MUST also run checkStepAccessibility (letter gate) before proceeding.
 *
 * MUST be called inside withRequestContext() or withClerkIdentity() (ADR-003).
 *
 * AC-FILE-003-02: Retrieval requires an authorization check — this IS that check.
 * AC-FILE-003-03: No anonymous/public path — null SESSION_CONTEXT → null.
 */
export async function authorizeEngagementForUpload(
  engagementId: string,
): Promise<EngagementItem | null> {
  const client = dbAsEngagementClient();
  const row = await client.engagement.findUnique({ where: { id: engagementId } });
  if (!row) return null;
  return mapEngagementRow(row);
}

// ─── Write: insertPendingDocument (admin pool — ADR-009 step 2d) ──────────────
//
// NOT exported from the package barrel.
// Import directly from this source module in server actions / tests.

/**
 * Inserts a Document row with status='pending' via the ADMIN POOL (ADR-009 step 2d).
 *
 * Called AFTER authorizeEngagementForUpload confirms the caller owns the engagement
 * AND checkStepAccessibility confirms the upload step is accessible (letter gate).
 * The authz gate MUST run first — this function does NOT re-check ownership.
 *
 * Computes the storage key:
 *   engagements/{engagementId}/documents/{documentId}/v1/{encodeURIComponent(originalFilename)}
 *
 * ADR-009 step 2d: pending insert on the admin pool.
 * ADR-003: admin pool for the pending insert (no SESSION_CONTEXT needed — admin is RLS-exempt).
 *
 * Returns { documentId, storageKey } so the caller can mint the signed upload URL.
 */
export async function insertPendingDocument(
  input: InsertPendingDocumentInput,
): Promise<InsertPendingDocumentResult> {
  const pool = await getAdminPool();
  const req = new MssqlRequest(pool);

  req.input("engagementId", mssqlPkg.NVarChar(50), input.engagementId);
  req.input("documentRequestId", mssqlPkg.NVarChar(50), input.documentRequestId ?? null);
  req.input("originalFilename", mssqlPkg.NVarChar(500), input.originalFilename);
  req.input("contentType", mssqlPkg.NVarChar(255), input.contentType);
  // Pending row: sizeBytes=0 initially; completeUpload will update with the authoritative stat value.
  req.input("sizeBytes", mssqlPkg.BigInt(), 0);
  req.input("uploadedBy", mssqlPkg.NVarChar(64), input.uploadedByClerkId ?? null);

  const result = await req.query<{ id: string }>(
    `INSERT INTO [dbo].[Document]
       ([engagementId], [documentRequestId], [storageKey], [originalFilename],
        [contentType], [sizeBytes], [status], [version], [uploadedBy], [updatedAt])
     OUTPUT INSERTED.[id]
     VALUES (@engagementId, @documentRequestId,
             N'__pending_key__',
             @originalFilename, @contentType, @sizeBytes,
             N'pending', 1, @uploadedBy, SYSDATETIMEOFFSET())`
  );

  const row = result.recordset[0];
  if (!row) {
    throw new Error(
      "insertPendingDocument INSERT did not return a row — unexpected SQL Server behavior"
    );
  }

  const documentId = row.id;
  // Compute storage key now that we have the documentId (ADR-009).
  const storageKey = `engagements/${input.engagementId}/documents/${documentId}/v1/${encodeURIComponent(input.originalFilename)}`;

  // Update the storageKey column — the INSERT above used a placeholder.
  const updateReq = new MssqlRequest(pool);
  updateReq.input("documentId", mssqlPkg.NVarChar(50), documentId);
  updateReq.input("storageKey", mssqlPkg.NVarChar(1024), storageKey);
  await updateReq.query(
    `UPDATE [dbo].[Document]
     SET [storageKey] = @storageKey, [updatedAt] = SYSDATETIMEOFFSET()
     WHERE [id] = @documentId`
  );

  return { documentId, storageKey };
}

// ─── Write + Gate: completeUpload (scan-before-available gate — ADR-021) ──────
//
// NOT exported from the package barrel.
// Import directly from this source module in server actions / tests.

/**
 * The scan-before-available promotion gate (ADR-021 / AC-NFR-009-01/-02).
 *
 * Called AFTER the client has PUT the file to the signed upload URL.
 * This is the NAMED CODE PATH for Gate-Authoring evidence — the `verdict === 'clean'`
 * branch below is the exclusive gate between 'pending' and 'active'.
 *
 * Flow:
 *   1. stat() the object from storage (authoritative size + content-type).
 *   2. validateUploadedBytes() — MIME/size check (ADR-021 §2).
 *   3. getFileScanner().scan() — malware scan (ADR-021 §1).
 *   4. Promotion verdict:
 *      - 'clean' + validation 'pass'    → promote to 'active'  (AC-NFR-009-01: scanned before available)
 *      - 'infected'                     → terminal 'infected'   (AC-NFR-009-02: withheld)
 *      - 'indeterminate'                → stays 'pending'       (AC-NFR-009-01: fail-closed — NEVER silently active)
 *      - validation 'mime-mismatch'     → stays 'pending'       (fail-closed)
 *      - validation 'too-large'         → stays 'pending'       (fail-closed)
 *
 * FAIL-CLOSED INVARIANT (Gate-Authoring Named Code Path):
 *   ONLY the code block `if (scanVerdict.verdict === 'clean' && validationResult === 'pass')`
 *   sets status='active'. ALL other branches stay 'pending' or go 'infected'.
 *   Breaking this invariant (e.g. removing the 'clean' check) would red the
 *   withholding/fail-closed tests — see Gate-Authoring evidence in Work Log.
 */
export async function completeUpload(
  input: CompleteUploadInput,
): Promise<CompleteUploadResult> {
  // 1. Stat the object (authoritative post-upload size + content-type)
  const storage = getStorage();
  const stat = await storage.stat(input.storageKey);

  if (!stat) {
    // Object not found in storage — stay pending (fail-closed)
    return {
      outcome: "pending",
      documentId: input.documentId,
      reason: "storage-object-not-found",
    };
  }

  // 2. MIME/size validation (ADR-021 §2)
  // DECISION (TASK-007-004): pass the declared type without bytes so the size gate
  // fires but the MIME sniff passes (no magic bytes available from stat).
  // The AV scan (step 3) is the primary threat detection path (ADR-021 §1).
  const validationResult = await validateUploadedBytes({
    declaredContentType: stat.contentType,
    sizeBytes: stat.sizeBytes,
    // bytes and stream omitted — exactOptionalPropertyTypes requires we not include
    // optional keys with undefined values.
  });

  // 3. AV scan (ADR-021 §1) — NAMED CODE PATH for Gate-Authoring evidence
  const scanner = getFileScanner();
  const scanVerdict = await scanner.scan({ key: input.storageKey });

  // 4. Promotion verdict branch — the scan-before-available gate
  //
  // GATE: Only 'clean' + validation 'pass' promotes to 'active'.
  // Every other path leaves the file in 'pending' or transitions to 'infected'.
  // This is the named code path per Gate-Authoring Rules (ENGINE.md § Gate Authoring Rules).
  if (scanVerdict.verdict === "clean" && validationResult === "pass") {
    // PROMOTE: pending → active (ADR-021 — scan passed, MIME/size valid)
    await promotePendingToActive(input.documentId, stat.sizeBytes);
    return { outcome: "active", documentId: input.documentId };
  }

  if (scanVerdict.verdict === "infected") {
    // TERMINAL: pending → infected (AC-NFR-009-02 — threat detected; never signable)
    const threat = scanVerdict.threat ?? null;
    await promoteToInfected(input.documentId, stat.sizeBytes, threat);
    return {
      outcome: "infected",
      documentId: input.documentId,
      threat,
    };
  }

  // 'indeterminate' (scanner unavailable / timeout) OR validation failure:
  // STAY PENDING — fail-closed. NEVER silently become 'active' (AC-NFR-009-01).
  const reason =
    scanVerdict.verdict === "indeterminate"
      ? `scanner-indeterminate: ${scanVerdict.reason ?? "no-reason"}`
      : `validation-failed: ${validationResult}`;

  // Update sizeBytes to the authoritative value even if staying pending
  await updateSizeBytesOnPending(input.documentId, stat.sizeBytes);

  return {
    outcome: "pending",
    documentId: input.documentId,
    reason,
  };
}

// ─── Read: listEngagementDocuments (request pool — FILTER-governed) ───────────

/**
 * Returns all Documents for the given engagement, visible to the current
 * SESSION_CONTEXT identity.
 *
 * Under sec.pol_Document (0007-document-policy.sql):
 *   - CLIENT sees only documents for their own engagement.
 *   - ACCOUNTANT sees all documents for any engagement.
 *   - Null SESSION_CONTEXT → ZERO rows (fail-closed, ADR-003 §5).
 *
 * MUST be called inside withRequestContext() or withClerkIdentity() (ADR-003).
 *
 * AC-FILE-001-02: Documents are stored against the engagement.
 * AC-FILE-001-05: Cross-engagement isolation — FILTER predicate enforces it.
 */
export async function listEngagementDocuments(
  engagementId: string,
): Promise<DocumentItem[]> {
  const client = dbAsDocumentClient();
  const rows = await client.document.findMany({
    where: { engagementId },
    orderBy: { createdAt: "asc" },
  });
  return rows.map(mapDocumentRow);
}

// ─── Authorize-then-sign download (ADR-009 step 2a) ───────────────────────────

/**
 * Authorize the caller's access to a Document and mint a signed download URL.
 *
 * ADR-009: Authorize FIRST, then sign. The RLS authz check runs before URL mint.
 * Gate 1: FILTER predicate (request pool) — caller must own the engagement.
 * Gate 2: status='active' — pending/infected documents are NEVER signable.
 *
 * Returns { authorized: false, reason } when:
 *   - Document not found (or RLS-filtered from caller).
 *   - Document is not 'active' (pending/infected are withheld).
 *
 * Returns { authorized: true, url, expiresAt } on success.
 *
 * AC-FILE-003-02: Retrieval requires an authorization check (Gate 1).
 * AC-FILE-003-03: No anonymous/public path (null SESSION_CONTEXT → not found).
 * AC-FILE-003-04: Grant is time-limited (TTL-capped by the adapter — ADR-008).
 *
 * MUST be called inside withRequestContext() or withClerkIdentity() (ADR-003).
 */
export async function authorizeThenSignDownload(
  input: AuthorizeThenSignDownloadInput,
): Promise<AuthorizeThenSignDownloadResult> {
  // Gate 1: RLS-governed authz query (request pool / FILTER predicate)
  // ADR-009 step 2a: authorize BEFORE minting any URL.
  const client = dbAsDocumentClient();
  const row = await client.document.findUnique({ where: { id: input.documentId } });

  if (!row) {
    // Not found OR RLS-filtered (client does not own the engagement).
    // AC-FILE-003-03: No public path — no URL minted.
    return { authorized: false, reason: "rls-filtered" };
  }

  // Confirm the document belongs to the expected engagement (belt-and-suspenders).
  // DECISION (TASK-007-004): compare case-insensitively — Prisma normalises SQL Server
  // UNIQUEIDENTIFIER values to lowercase; callers from raw mssql (e.g. tests using
  // OUTPUT INSERTED.[id]) may supply uppercase GUIDs. GUID comparison is inherently
  // case-insensitive, so toLowerCase() on both sides is the correct normalisation.
  if (row.engagementId.toLowerCase() !== input.engagementId.toLowerCase()) {
    return { authorized: false, reason: "rls-filtered" };
  }

  // Gate 2: active-only gate — pending/infected documents are NEVER signable.
  // AC-NFR-009-01/-02: A pending/infected file must never be served.
  if (row.status !== "active") {
    return {
      authorized: false,
      reason: row.status === "pending" || row.status === "infected"
        ? "not-active"
        : "not-active",
    };
  }

  // Both gates passed. Mint the signed download URL.
  // AC-FILE-003-04: TTL is capped by the adapter (ADR-008 § TTL policy: max 3600s).
  const storage = getStorage();
  // Build options without including undefined values (exactOptionalPropertyTypes: true).
  const downloadOpts = {
    responseContentDisposition: `attachment; filename="${encodeURIComponent(row.originalFilename)}"`,
    responseContentType: row.contentType,
    ...(input.ttlSeconds !== undefined ? { ttlSeconds: input.ttlSeconds } : {}),
  };
  const signedUrl = await storage.getSignedDownloadUrl(row.storageKey, downloadOpts);

  return {
    authorized: true,
    url: signedUrl.url,
    expiresAt: signedUrl.expiresAt,
  };
}

// ─── Internal: admin pool promotion helpers ────────────────────────────────────

async function promotePendingToActive(
  documentId: string,
  sizeBytes: number,
): Promise<void> {
  const pool = await getAdminPool();
  const req = new MssqlRequest(pool);
  req.input("documentId", mssqlPkg.NVarChar(50), documentId);
  req.input("sizeBytes", mssqlPkg.BigInt(), sizeBytes);
  await req.query(
    `UPDATE [dbo].[Document]
     SET [status] = N'active',
         [sizeBytes] = @sizeBytes,
         [updatedAt] = SYSDATETIMEOFFSET()
     WHERE [id] = @documentId AND [status] = N'pending'`
  );
}

async function promoteToInfected(
  documentId: string,
  sizeBytes: number,
  threat: string | null,
): Promise<void> {
  const pool = await getAdminPool();
  const req = new MssqlRequest(pool);
  req.input("documentId", mssqlPkg.NVarChar(50), documentId);
  req.input("sizeBytes", mssqlPkg.BigInt(), sizeBytes);
  req.input("scanThreat", mssqlPkg.NVarChar(500), threat ?? null);
  await req.query(
    `UPDATE [dbo].[Document]
     SET [status] = N'infected',
         [sizeBytes] = @sizeBytes,
         [scanThreat] = @scanThreat,
         [updatedAt] = SYSDATETIMEOFFSET()
     WHERE [id] = @documentId AND [status] = N'pending'`
  );
}

async function updateSizeBytesOnPending(
  documentId: string,
  sizeBytes: number,
): Promise<void> {
  const pool = await getAdminPool();
  const req = new MssqlRequest(pool);
  req.input("documentId", mssqlPkg.NVarChar(50), documentId);
  req.input("sizeBytes", mssqlPkg.BigInt(), sizeBytes);
  await req.query(
    `UPDATE [dbo].[Document]
     SET [sizeBytes] = @sizeBytes,
         [updatedAt] = SYSDATETIMEOFFSET()
     WHERE [id] = @documentId AND [status] = N'pending'`
  );
}

// ─── Internal: row mappers ────────────────────────────────────────────────────

function mapEngagementRow(row: EngagementRow): EngagementItem {
  return {
    id: row.id,
    engagementRequestId: row.engagementRequestId,
    clientUserId: row.clientUserId,
    status: row.status,
    letterSignedAt: row.letterSignedAt,
    letterSignatureEvidence: row.letterSignatureEvidence,
    letterTemplateSnapshot: row.letterTemplateSnapshot,
    questionnaireSubmittedAt: row.questionnaireSubmittedAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapDocumentRow(row: DocumentRow): DocumentItem {
  return {
    id: row.id,
    engagementId: row.engagementId,
    documentRequestId: row.documentRequestId,
    storageKey: row.storageKey,
    originalFilename: row.originalFilename,
    contentType: row.contentType,
    sizeBytes: Number(row.sizeBytes),
    status: row.status,
    version: row.version,
    scanThreat: row.scanThreat,
    uploadedBy: row.uploadedBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
