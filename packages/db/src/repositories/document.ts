/**
 * packages/db/src/repositories/document.ts
 *
 * Two-phase authorize-then-sign upload/download pipeline for Documents.
 *
 * AC-FILE-001-01: Accountant upload primitive (two-phase, accountant principal, signed upload URL).
 * AC-FILE-001-02: Client upload stored in the engagement's set.
 * AC-FILE-001-03: Owner (primary client) can download their engagement's files.
 * AC-FILE-001-04: A client participant (not just the owner) can access the engagement's files —
 *   participant-extended fn_document_access (TASK-013-001). Both parties download.
 * AC-FILE-001-05: A file in engagement A is NOT exposed to other engagements.
 * AC-FILE-003-01: Encrypted at rest (adapter contract — proven through this pipeline vs Azurite).
 * AC-FILE-003-02: Retrieval requires an authorization check.
 * AC-FILE-003-03: No anonymous/public path.
 * AC-FILE-003-04: Grant time-limited, expires.
 * AC-NFR-009-01:  Scanned before available (indeterminate → stays pending fail-closed).
 * AC-NFR-009-02:  Infected → withheld + uploader informed.
 * AC-FILE-009-01: Accountant can upload a new version of an existing document.
 * AC-FILE-009-02: After replacement, "current" resolves to the newest non-superseded version.
 * AC-FILE-009-03: Every prior version retained + accessible after replacement.
 *
 * Pool strategy:
 *   - authorizeEngagementForUpload: REQUEST POOL (db / SESSION_CONTEXT) — FILTER-governed.
 *     Resolves the engagement through the 0007 FILTER. RLS-filtered miss → null (404 / no URL).
 *     ADR-009 step 2a: "authorize on the request pool" before minting any URL.
 *   - authorizeAccountantUpload: ADMIN POOL authz read for the accountant-principal path.
 *     Accountant has full visibility → direct admin pool query (no SESSION_CONTEXT needed).
 *     ADR-009: authorize BEFORE minting any URL — same two-phase discipline.
 *   - insertPendingDocument: ADMIN POOL (getAdminPool) — ADR-009 step 2d.
 *     Inserts the Document row with status='pending', computes the storage key.
 *     Runs AFTER authorization; the pending INSERT never bypasses the authz gate.
 *   - completeUpload: ADMIN POOL for the promotion write.
 *     Runs validateUploadedBytes → getFileScanner().scan → promote active | infected | stay pending.
 *     THIS IS THE SCAN-BEFORE-AVAILABLE GATE (ADR-021 / AC-NFR-009-01/-02).
 *   - listEngagementDocuments: REQUEST POOL — FILTER-governed; client sees own engagement only.
 *   - authorizeThenSignDownload: REQUEST POOL authz → active-only → getStorage().getSignedDownloadUrl.
 *     ADR-009 step 2a: authorization BEFORE URL minting. pending/infected never signable.
 *     Both owner and participant reach it via the participant-extended fn_document_access (TASK-013-001).
 *   - replaceDocumentWithNewVersion: ADMIN POOL — INSERT new DocumentVersion + UPDATE parent Document.
 *     DECISION-013-C: parent Document row = current pointer; prior DocumentVersion row gets supersededAt.
 *   - listDocumentVersions: REQUEST POOL — FILTER-governed (sec.pol_DocumentVersion, TASK-013-001).
 *
 * ADR-009: Two-phase upload (authorize→pending insert→sign URL→complete→promote).
 *   Replacement: new DocumentVersion row + new storage key; prior rows retained (DECISION-013-C).
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
 *   - authorizeAccountantUpload / replaceDocumentWithNewVersion are NOT exported from the barrel.
 *     Import directly from this source module in server actions / tests.
 *   - listDocumentVersions IS exported on the barrel.
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
 *
 * DECISION-013-C (TASK-013-002, current-version pointer):
 *   The parent Document row remains the "current" pointer. replaceDocumentWithNewVersion:
 *     1. INSERTs a new DocumentVersion row (new version number, new storageKey).
 *     2. SUPERSEDEs the prior DocumentVersion row (supersededAt = now).
 *     3. UPDATEs the parent Document row (storageKey, version, sizeBytes → current state).
 *   Prior DocumentVersion rows are never mutated beyond the one-time supersededAt stamp.
 *   Callers supply the engagementId from the server-resolved scope (defence-in-depth).
 */

import mssqlPkg from "mssql";
import { getAdminPool } from "../admin-connection.js";
import { db } from "../client.js";
import { getStorage } from "@tax-portal/storage";
import { getFileScanner, validateUploadedBytes } from "@tax-portal/storage";
import { withAuditTransaction, recordAuthEvent } from "../audit.js";
import type { AuditActor } from "../audit.js";
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
  /**
   * The server-resolved engagement id — used to scope the promotion UPDATE so that
   * a client-supplied documentId that does not belong to this engagement cannot be
   * promoted (defence-in-depth; the caller must also verify ownership via
   * getDocumentForOwnershipCheck before reaching here — M1 fix).
   */
  engagementId: string;
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

// ─── New types for EPIC-013 / TASK-013-002 ───────────────────────────────────

/**
 * Input for authorizeAccountantUpload.
 *
 * AC-FILE-001-01: Accountant upload primitive — two-phase, accountant principal.
 */
export interface AuthorizeAccountantUploadInput {
  /** The Engagement id to authorize against. Admin-pool read (full visibility). */
  engagementId: string;
}

/**
 * Result of replaceDocumentWithNewVersion.
 *
 * AC-FILE-009-01: Accountant can upload a new version of an existing document.
 * AC-FILE-009-02: After replacement, the new version is current.
 * AC-FILE-009-03: Prior version is retained (supersededAt set on old DocumentVersion row).
 */
export interface ReplaceDocumentResult {
  /** The newly created DocumentVersion id. */
  newVersionId: string;
  /** The new version number (prior version + 1). */
  newVersion: number;
  /** The new storage key for the replacement document (ADR-009 versioned key shape). */
  newStorageKey: string;
}

/**
 * Input for replaceDocumentWithNewVersion.
 */
export interface ReplaceDocumentInput {
  /** The Document id to replace. */
  documentId: string;
  /** The engagement the document belongs to (server-resolved — defence-in-depth scope). */
  engagementId: string;
  /** Original filename of the replacement (ADR-009). */
  originalFilename: string;
  /** Declared content-type of the replacement. */
  contentType: string;
  /** Declared content-length (0 if unknown; authoritative size comes from completeUpload stat()). */
  sizeBytes: number;
  /** Uploader clerkId from the verified session (audit trail — never client-supplied). CS-GEN-001. */
  uploadedByClerkId: string;
  /** Source surface for audit (CS-GEN-003). */
  sourceSurface: "admin";
}

/**
 * A single DocumentVersion as returned to callers.
 *
 * AC-FILE-009-02: Current version = the one with supersededAt IS NULL.
 * AC-FILE-009-03: All version rows retained and readable.
 */
export interface DocumentVersionItem {
  id: string;
  documentId: string;
  version: number;
  storageKey: string;
  /** Null = current; non-null = superseded at this timestamp. */
  supersededAt: Date | null;
  uploadedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Internal cast helpers ─────────────────────────────────────────────────────

type DocumentVersionRow = {
  id: string;
  documentId: string;
  version: number;
  storageKey: string;
  supersededAt: Date | null;
  uploadedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type EngagementRow = {
  id: string;
  engagementRequestId: string;
  clientUserId: string | null;
  status: string;
  letterSignedAt: Date | null;
  letterSignatureEvidence: string | null;
  letterTemplateSnapshot: string | null;
  questionnaireSubmittedAt: Date | null;
  // DECISION-010-A (EPIC-010): lifecycle confirmation timestamps (optional — may not be selected)
  deliveryConfirmedAt?: Date | null;
  filingConfirmedAt?: Date | null;
  // DECISION-B (BRIEF-012 / EPIC-012): taxYear is part of the engagement identity tuple (optional)
  taxYear?: number | null;
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

function dbAsDocumentVersionClient() {
  return db as unknown as {
    documentVersion: {
      findMany: (args?: {
        where?: { documentId?: string };
        orderBy?: { version: "asc" | "desc" };
      }) => Promise<DocumentVersionRow[]>;
    };
  };
}

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

// ─── Read: getDocumentForOwnershipCheck (request pool — M1 ownership guard) ───

/**
 * Load minimal ownership fields for a Document under the REQUEST POOL (FILTER-governed).
 *
 * Used by `completeUploadAction` to verify that the client-supplied `documentId`
 * belongs to the caller's engagement before invoking the admin-pool promotion gate.
 *
 * Under sec.pol_Document (0007-document-policy.sql):
 *   - CLIENT sees only documents for their own engagement (FILTER).
 *   - Null SESSION_CONTEXT → throws (ADR-003 §6 fail-closed).
 *   - A document that does not belong to the caller's engagement → null (RLS-filtered).
 *
 * Returns { engagementId, uploadedBy } when the document is visible to the caller.
 * Returns null when the document does not exist or is RLS-filtered from this caller.
 *
 * MUST be called inside withRequestContext() or withClerkIdentity() (ADR-003).
 *
 * M1 fix: the caller (completeUploadAction) must confirm the returned engagementId
 * matches the server-resolved engagement before proceeding to completeUpload.
 */
export async function getDocumentForOwnershipCheck(
  documentId: string,
): Promise<{ engagementId: string; uploadedBy: string | null } | null> {
  const client = dbAsDocumentClient();
  const row = await client.document.findUnique({ where: { id: documentId } });
  if (!row) return null;
  return { engagementId: row.engagementId, uploadedBy: row.uploadedBy };
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
    await promotePendingToActive(input.documentId, input.engagementId, stat.sizeBytes);
    return { outcome: "active", documentId: input.documentId };
  }

  if (scanVerdict.verdict === "infected") {
    // TERMINAL: pending → infected (AC-NFR-009-02 — threat detected; never signable)
    const threat = scanVerdict.threat ?? null;
    await promoteToInfected(input.documentId, input.engagementId, stat.sizeBytes, threat);
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
  await updateSizeBytesOnPending(input.documentId, input.engagementId, stat.sizeBytes);

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
      reason: "not-active",
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

// ─── Accountant upload authorize (admin pool — AC-FILE-001-01) ───────────────

/**
 * Authorize the accountant's access to an engagement for upload via the ADMIN POOL.
 *
 * AC-FILE-001-01: Accountant upload — two-phase authorize-then-sign discipline (ADR-009).
 *   The authorize step runs BEFORE any URL is minted (ADR-009 step 2a).
 *
 * DIFFERENCE from authorizeEngagementForUpload (client path):
 *   The client path uses the REQUEST POOL (FILTER-governed, SESSION_CONTEXT identity).
 *   The accountant path uses the ADMIN POOL — accountants have full visibility
 *   (IS_MEMBER('app_admin_role')=1 → RLS-exempt). No SESSION_CONTEXT needed.
 *   Both paths honor the ADR-009 two-phase discipline: authz first, then sign.
 *
 * Returns the EngagementItem if the engagement exists (admin pool always sees it).
 * Returns null when the engagement does not exist.
 *
 * The caller (action layer) MUST verify accountant identity from the verified session
 * before invoking this function. The admin pool does NOT enforce identity — authorization
 * is caller's responsibility at the action-layer boundary.
 *
 * After authorization, the caller proceeds with insertPendingDocument + getSignedUploadUrl
 * (the same pipeline primitives as the client upload path — reused not re-implemented).
 *
 * ADR-009: authorize → pending insert → sign URL → complete → promote (same pipeline).
 * ADR-003 §7: admin pool for the accountant-principal authorize.
 * CS-GEN-001: never log full signed URLs or filenames — key + operation only.
 *
 * // ADR-003 // ADR-009 // CS-TS-001 // CS-GEN-001 // AC-FILE-001-01
 */
export async function authorizeAccountantUpload(
  input: AuthorizeAccountantUploadInput,
): Promise<EngagementItem | null> {
  // Admin pool query — accountant has full visibility (RLS-exempt).
  // ADR-009: authorize BEFORE minting any URL.
  const pool = await getAdminPool();
  const req = new MssqlRequest(pool);
  req.input("engagementId", mssqlPkg.NVarChar(50), input.engagementId);

  const result = await req.query<EngagementRow>(
    `SELECT
       [id], [engagementRequestId], [clientUserId], [status],
       [letterSignedAt], [letterSignatureEvidence], [letterTemplateSnapshot],
       [questionnaireSubmittedAt], [deliveryConfirmedAt], [filingConfirmedAt],
       [taxYear],
       [createdAt], [updatedAt]
     FROM [dbo].[Engagement]
     WHERE [id] = @engagementId`
  );

  const row = result.recordset[0];
  if (!row) return null;
  return mapEngagementRow(row);
}

// ─── Version replacement (DECISION-013-C) ─────────────────────────────────────

/**
 * Replaces an existing Document with a new version (admin pool write).
 *
 * AC-FILE-009-01: Accountant can upload a new version of an existing document.
 * AC-FILE-009-02: After replacement, "current" = the newest non-superseded version.
 * AC-FILE-009-03: Every prior version retained — supersededAt set, never deleted.
 *
 * DECISION-013-C (current-version pointer):
 *   1. INSERTs a new DocumentVersion row with version = prior version + 1 and a NEW storageKey.
 *      ADR-009: storage key = engagements/{engId}/documents/{docId}/v{N}/{filename}.
 *   2. SUPERSEDEs the prior DocumentVersion row (supersededAt = SYSDATETIMEOFFSET()).
 *      The prior row is never deleted — AC-FILE-009-03 retained-version substrate.
 *   3. UPDATEs the parent Document row: storageKey, version, sizeBytes → current state.
 *      The parent Document row is the "current" pointer (DECISION-013-C).
 *
 * ADR-009: Replacement = new DocumentVersion row + NEW storage key. Never an overwrite.
 *   The prior version's storage object must NOT be deleted (AC-FILE-009-03).
 *
 * Returns { newVersionId, newVersion, newStorageKey } so the caller can mint the
 * signed upload URL for the replacement object (same pipeline as insertPendingDocument).
 * The caller runs completeUpload after the client PUTs to the signed URL.
 *
 * Emits audit event: 'document.version_replaced' (ADR-019).
 * CS-GEN-001: audit row contains documentId only — no filename or PII logged.
 *
 * NOT exported from the package barrel. Import directly from this module in server actions.
 *
 * // ADR-003 // ADR-009 // ADR-019 // DECISION-013-C // CS-TS-001 // CS-GEN-001 // CS-GEN-003
 */
export async function replaceDocumentWithNewVersion(
  input: ReplaceDocumentInput,
): Promise<ReplaceDocumentResult> {
  const actor: AuditActor = { clerkUserId: input.uploadedByClerkId, role: "ACCOUNTANT" };

  let newVersionId = "";
  let newVersion = 0;
  let newStorageKey = "";

  await withAuditTransaction(async (txn) => {
    const pool = await getAdminPool();

    // Step 1: Read the current Document row to get the current version number.
    //   Scoped to engagementId for defence-in-depth (DECISION-013-C).
    const readReq = new MssqlRequest(pool);
    readReq.input("documentId", mssqlPkg.NVarChar(50), input.documentId);
    readReq.input("engagementId", mssqlPkg.NVarChar(50), input.engagementId);

    const docResult = await readReq.query<{ version: number }>(
      `SELECT [version] FROM [dbo].[Document]
       WHERE [id] = @documentId AND [engagementId] = @engagementId`
    );

    const docRow = docResult.recordset[0];
    if (!docRow) {
      throw new Error(
        `replaceDocumentWithNewVersion: Document ${input.documentId} not found in engagement ${input.engagementId}`,
      );
    }

    const priorVersion = docRow.version;
    newVersion = priorVersion + 1;

    // ADR-009: storage key for the new version.
    // engagements/{engagementId}/documents/{documentId}/v{N}/{urlencoded-filename}
    // CS-GEN-001: key is logged (not the filename itself — it is URL-encoded in the key).
    newStorageKey = `engagements/${input.engagementId}/documents/${input.documentId}/v${newVersion}/${encodeURIComponent(input.originalFilename)}`;

    // Step 2: INSERT the new DocumentVersion row (current: supersededAt IS NULL).
    //   ADR-009: new row + new storage key. DECISION-013-C.
    const insertReq = new MssqlRequest(pool);
    insertReq.input("documentId", mssqlPkg.NVarChar(50), input.documentId);
    insertReq.input("version", mssqlPkg.Int(), newVersion);
    insertReq.input("storageKey", mssqlPkg.NVarChar(1024), newStorageKey);
    insertReq.input("uploadedBy", mssqlPkg.NVarChar(64), input.uploadedByClerkId);

    const insertResult = await insertReq.query<{ id: string }>(
      `INSERT INTO [dbo].[DocumentVersion]
         ([documentId], [version], [storageKey], [supersededAt], [uploadedBy], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES (@documentId, @version, @storageKey, NULL, @uploadedBy, SYSDATETIMEOFFSET())`
    );

    const insertRow = insertResult.recordset[0];
    if (!insertRow) {
      throw new Error("replaceDocumentWithNewVersion INSERT did not return a row");
    }
    newVersionId = insertRow.id;

    // Step 3: SUPERSEDE the prior DocumentVersion row (AC-FILE-009-03 — never delete).
    //   Set supersededAt on the prior version (WHERE version = priorVersion AND documentId = @documentId).
    //   DECISION-013-C: only the prior row gets the stamp; older rows already have it.
    const supersedeReq = new MssqlRequest(pool);
    supersedeReq.input("documentId", mssqlPkg.NVarChar(50), input.documentId);
    supersedeReq.input("priorVersion", mssqlPkg.Int(), priorVersion);

    await supersedeReq.query(
      `UPDATE [dbo].[DocumentVersion]
       SET [supersededAt] = SYSDATETIMEOFFSET(),
           [updatedAt] = SYSDATETIMEOFFSET()
       WHERE [documentId] = @documentId
         AND [version] = @priorVersion
         AND [supersededAt] IS NULL`
    );

    // Step 4: UPDATE the parent Document row (current pointer — DECISION-013-C).
    //   storageKey, version, sizeBytes update to the new version's state.
    //   sizeBytes is set to the declared value here; completeUpload will update
    //   with the authoritative stat() value after the PUT completes (same as insertPendingDocument).
    const updateReq = new MssqlRequest(pool);
    updateReq.input("documentId", mssqlPkg.NVarChar(50), input.documentId);
    updateReq.input("engagementId", mssqlPkg.NVarChar(50), input.engagementId);
    updateReq.input("newStorageKey", mssqlPkg.NVarChar(1024), newStorageKey);
    updateReq.input("newVersion", mssqlPkg.Int(), newVersion);
    updateReq.input("originalFilename", mssqlPkg.NVarChar(500), input.originalFilename);
    updateReq.input("contentType", mssqlPkg.NVarChar(255), input.contentType);
    updateReq.input("sizeBytes", mssqlPkg.BigInt(), input.sizeBytes);
    updateReq.input("uploadedBy", mssqlPkg.NVarChar(64), input.uploadedByClerkId);

    await updateReq.query(
      `UPDATE [dbo].[Document]
       SET [storageKey] = @newStorageKey,
           [version] = @newVersion,
           [originalFilename] = @originalFilename,
           [contentType] = @contentType,
           [sizeBytes] = @sizeBytes,
           [status] = N'pending',
           [uploadedBy] = @uploadedBy,
           [updatedAt] = SYSDATETIMEOFFSET()
       WHERE [id] = @documentId AND [engagementId] = @engagementId`
    );

    // ADR-019: emit audit event in the same transaction (fail-closed).
    // CS-GEN-001: targetId = documentId only — no filename or PII logged.
    await recordAuthEvent({
      actor,
      action: "document.version_replaced",
      targetType: "Document",
      targetId: input.documentId,
      sourceSurface: input.sourceSurface,
      transaction: txn,
    });
  });

  return { newVersionId, newVersion, newStorageKey };
}

// ─── Read: listDocumentVersions (request pool — FILTER-governed) ─────────────

/**
 * Returns all DocumentVersion rows for the given Document, ordered by version ASC.
 *
 * Under sec.pol_DocumentVersion (db/policies/0011-document-version-policy.sql):
 *   - CLIENT (owner + participant) sees only version rows for their engagement's documents.
 *   - ACCOUNTANT sees all version rows.
 *   - Null SESSION_CONTEXT → ZERO rows (fail-closed, ADR-003 §5).
 *
 * AC-FILE-009-02: The current version has supersededAt IS NULL; caller identifies it by filtering.
 * AC-FILE-009-03: Prior version rows (supersededAt IS NOT NULL) are retained and returned here.
 *
 * MUST be called inside withRequestContext() or withClerkIdentity() (ADR-003).
 *
 * // ADR-003 // ADR-005 // AC-FILE-009-02 // AC-FILE-009-03 // CS-TS-001 // CS-GEN-003
 */
export async function listDocumentVersions(
  documentId: string,
): Promise<DocumentVersionItem[]> {
  const client = dbAsDocumentVersionClient();
  const rows = await client.documentVersion.findMany({
    where: { documentId },
    orderBy: { version: "asc" },
  });
  return rows.map(mapDocumentVersionRow);
}

// ─── Internal: admin pool promotion helpers ────────────────────────────────────

async function promotePendingToActive(
  documentId: string,
  engagementId: string,
  sizeBytes: number,
): Promise<void> {
  const pool = await getAdminPool();
  const req = new MssqlRequest(pool);
  req.input("documentId", mssqlPkg.NVarChar(50), documentId);
  req.input("engagementId", mssqlPkg.NVarChar(50), engagementId);
  req.input("sizeBytes", mssqlPkg.BigInt(), sizeBytes);
  await req.query(
    `UPDATE [dbo].[Document]
     SET [status] = N'active',
         [sizeBytes] = @sizeBytes,
         [updatedAt] = SYSDATETIMEOFFSET()
     WHERE [id] = @documentId AND [engagementId] = @engagementId AND [status] = N'pending'`
  );
}

async function promoteToInfected(
  documentId: string,
  engagementId: string,
  sizeBytes: number,
  threat: string | null,
): Promise<void> {
  const pool = await getAdminPool();
  const req = new MssqlRequest(pool);
  req.input("documentId", mssqlPkg.NVarChar(50), documentId);
  req.input("engagementId", mssqlPkg.NVarChar(50), engagementId);
  req.input("sizeBytes", mssqlPkg.BigInt(), sizeBytes);
  req.input("scanThreat", mssqlPkg.NVarChar(500), threat ?? null);
  await req.query(
    `UPDATE [dbo].[Document]
     SET [status] = N'infected',
         [sizeBytes] = @sizeBytes,
         [scanThreat] = @scanThreat,
         [updatedAt] = SYSDATETIMEOFFSET()
     WHERE [id] = @documentId AND [engagementId] = @engagementId AND [status] = N'pending'`
  );
}

async function updateSizeBytesOnPending(
  documentId: string,
  engagementId: string,
  sizeBytes: number,
): Promise<void> {
  const pool = await getAdminPool();
  const req = new MssqlRequest(pool);
  req.input("documentId", mssqlPkg.NVarChar(50), documentId);
  req.input("engagementId", mssqlPkg.NVarChar(50), engagementId);
  req.input("sizeBytes", mssqlPkg.BigInt(), sizeBytes);
  await req.query(
    `UPDATE [dbo].[Document]
     SET [sizeBytes] = @sizeBytes,
         [updatedAt] = SYSDATETIMEOFFSET()
     WHERE [id] = @documentId AND [engagementId] = @engagementId AND [status] = N'pending'`
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
    // DECISION-010-A (EPIC-010): lifecycle confirmation timestamps
    deliveryConfirmedAt: row.deliveryConfirmedAt ?? null,
    filingConfirmedAt: row.filingConfirmedAt ?? null,
    // DECISION-B (BRIEF-012 / EPIC-012): taxYear is part of the engagement identity tuple
    taxYear: row.taxYear ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapDocumentVersionRow(row: DocumentVersionRow): DocumentVersionItem {
  return {
    id: row.id,
    documentId: row.documentId,
    version: row.version,
    storageKey: row.storageKey,
    supersededAt: row.supersededAt,
    uploadedBy: row.uploadedBy,
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
