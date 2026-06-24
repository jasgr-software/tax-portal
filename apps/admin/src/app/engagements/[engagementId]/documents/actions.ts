/**
 * apps/admin/src/app/engagements/[engagementId]/documents/actions.ts
 *
 * Server actions for the accountant upload + version-replace + soft-delete + recover surface.
 *
 * TASK-013-003: Accountant upload + version-replace UI & server actions.
 * TASK-014-003: Accountant soft-delete + recover server actions (EPIC-014).
 *
 * Acceptance criteria:
 *   AC-FILE-001-01 — the accountant can upload a file to an engagement
 *   AC-FILE-009-01 — an existing file can be replaced with a new version
 *   AC-FILE-009-02 — after replacement, the newest version is presented as current
 *   AC-FILE-004-01 — the accountant can delete a file within an engagement (soft-delete)
 *   AC-FILE-004-02 — a client cannot delete any file (deleteDocumentAction rejects non-ACCOUNTANT)
 *   AC-FILE-006-01 — deleting marks it deleted and removes from working view
 *   AC-FILE-006-03 — a soft-deleted file remains recoverable; recoverDocumentAction restores it
 *
 * ADR-003: Every action verifies getAccountantIdentity() BEFORE any DB write.
 *   The actor for the ADR-019 audit event comes ONLY from the verified session — never
 *   from action args, form data, or client-supplied role.
 * ADR-006: These actions exist ONLY in apps/admin — no mirror in apps/portal.
 *   (Download is the mirrored path — TASK-013-005. Delete is admin-only — TASK-014-003.)
 * ADR-009: Two-phase upload pipeline (authorize → pending insert → sign URL → complete → promote).
 *   Replacement: new DocumentVersion row + new storage key; prior rows retained (DECISION-013-C).
 * ADR-018: Soft-delete-first — deleteDocumentAction sets a tombstone (deletedAt), never issues
 *   a physical DELETE. Row + bytes are retained within the 7-year window. Recoverable in-window.
 * ADR-019: Upload + replace + delete + recover are all audited events; actor = verified session.
 * ADR-022: Upload path rate-limited (RateLimiter seam consumed here before URL mint).
 *
 * Pool strategy:
 *   requestUploadUrlAction: authorizeAccountantUpload (admin pool) + insertPendingDocument (admin pool).
 *   completeUploadAction: completeUpload (admin pool) + recordAuthEvent (admin pool).
 *   replaceWithNewVersionAction: replaceDocumentWithNewVersion (admin pool, withAuditTransaction).
 *   listDocumentsForEngagementAction: admin pool read (no SESSION_CONTEXT needed for accountant view).
 *   requestDownloadUrlAction: withRequestContext (ACCOUNTANT) → authorizeThenSignDownload (request pool) → recordAuthEvent (ADR-019).
 *   requestDownloadUrlForVersionAction: withRequestContext (ACCOUNTANT) → authorizeThenSignDownload with version storageKey → recordAuthEvent (ADR-019).
 *   listDocumentVersionsAction: withRequestContext (ACCOUNTANT) → listDocumentVersions (request pool).
 *   deleteDocumentAction: softDeleteDocument (admin pool, ADR-018 §1) + recordAuthEvent (ADR-019). // TASK-014-003
 *   recoverDocumentAction: recoverDocument (admin pool, ADR-018 §1) + recordAuthEvent (ADR-019). // TASK-014-003
 *   listDeletedDocumentsAction: listDeletedDocuments (admin pool, archive view). // TASK-014-003
 *
 * // ADR-003: server-side authority — getAccountantIdentity() before every DB write
 * // ADR-006: admin surface only (apps/admin) — no mirror in apps/portal; delete is admin-only
 * // ADR-009: two-phase upload pipeline
 * // ADR-018: soft-delete-first; row + bytes retained; no physical DELETE; in-window recoverable
 * // ADR-019: audit actor comes from verified session only; download + delete + recover events audited
 * // ADR-022: rate-limit before minting upload URL
 * // CS-TS-001: all DB reads use admin-pool or @tax-portal/db barrel
 * // CS-TS-002: no direct adminDb/pool import — seam calls via @tax-portal/db barrel or direct source
 * // CS-TS-003: delete is admin-only; portal absence is verified by TASK-014-003 portal e2e
 * // CS-TS-004: identity from session cookie, never from args/form data; deleteDocumentAction rejects non-ACCOUNTANT
 * // CS-GEN-001: no PII logged; targetId = documentId only — signed URL NEVER persisted or logged (ADR-009)
 * // CS-GEN-003: cite governing authority in comments
 */

"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import {
  getAuthProvider,
  getRateLimiter,
  buildRateLimitKey,
} from "@tax-portal/auth";
import {
  listEngagementDocuments,
  listDeletedDocuments,
  listDocumentVersions,
  softDeleteDocument,
  recoverDocument,
  recordAuthEvent,
  withRequestContext,
} from "@tax-portal/db";
import type {
  AuditActor,
  DocumentItem,
  DocumentVersionItem,
  SoftDeleteDocumentResult,
  RecoverDocumentResult,
} from "@tax-portal/db";
import { getStorage } from "@tax-portal/storage";
// NOT on the barrel — import directly from the source module (TASK-013-002 / document.ts note)
import {
  authorizeAccountantUpload,
  insertPendingDocument,
  completeUpload,
  replaceDocumentWithNewVersion,
  authorizeThenSignDownload,
} from "@tax-portal/db/src/repositories/document.js";

// ─── Constants ────────────────────────────────────────────────────────────────

const UPLOAD_URL_ENDPOINT = "admin:document:upload-url";
const COMPLETE_UPLOAD_ENDPOINT = "admin:document:complete-upload";

// ─── Result types ─────────────────────────────────────────────────────────────

export type RequestUploadUrlResult =
  | { success: true; data: { documentId: string; uploadUrl: string; storageKey: string } }
  | { success: false; error: string };

export type CompleteUploadResult =
  | { success: true; data: { outcome: "active" | "infected" | "pending" } }
  | { success: false; error: string };

export type ReplaceWithNewVersionResult =
  | { success: true; data: { documentId: string; newVersionId: string; newVersion: number; uploadUrl: string; storageKey: string } }
  | { success: false; error: string };

export type ListDocumentsResult =
  | { success: true; data: DocumentItem[] }
  | { success: false; error: string };

export type RequestDownloadUrlResult =
  | { success: true; data: { url: string; expiresAt: Date } }
  | { success: false; error: string };

export type DeleteDocumentResult =
  | { success: true; data: SoftDeleteDocumentResult }
  | { success: false; error: string };

export type RecoverDocumentActionResult =
  | { success: true; data: RecoverDocumentResult }
  | { success: false; error: string };

export type ListDeletedDocumentsResult =
  | { success: true; data: DocumentItem[] }
  | { success: false; error: string };

export type ListDocumentVersionsResult =
  | { success: true; data: DocumentVersionItem[] }
  | { success: false; error: string };

// ─── Identity helper ──────────────────────────────────────────────────────────

/**
 * Resolve the verified accountant identity from the incoming request headers.
 *
 * ADR-003: identity.role comes from the verified session (Clerk public metadata
 *   or mock session cookie) — NEVER from any server action argument or form data.
 *   The trust fence is this guard; the BLOCK predicate is defence-in-depth only.
 * ADR-006: Apps/admin only — this helper is not exported or available in apps/portal.
 * CS-TS-004: identity from session cookie only — never from args or form data.
 */
async function getAccountantIdentity(): Promise<{
  clerkUserId: string;
  role: "ACCOUNTANT" | "CLIENT";
} | null> {
  // CS-TS-004: Read identity from the incoming request headers (verified server-side).
  const headerStore = await headers();
  const cookieHeader = headerStore.get("cookie") ?? "";

  const syntheticRequest = new Request("http://localhost/", {
    headers: { cookie: cookieHeader },
  });

  const provider = getAuthProvider();
  const identity = await provider.getIdentity(syntheticRequest);

  if (!identity || identity.role !== "ACCOUNTANT") {
    return null;
  }

  return { clerkUserId: identity.clerkUserId, role: identity.role };
}

// ─── Source IP helper ──────────────────────────────────────────────────────────

/**
 * Resolve the request source IP for rate limiting (ADR-022).
 * Reads from x-forwarded-for or x-real-ip headers; falls back to "unknown".
 * ADR-005: IP resolved server-side — never from client-supplied form data.
 */
async function resolveSourceIp(): Promise<string> {
  const headerStore = await headers();
  const forwarded = headerStore.get("x-forwarded-for");
  if (forwarded) {
    // x-forwarded-for may be comma-separated; take the first (client) IP.
    return (forwarded.split(",")[0] ?? "unknown").trim();
  }
  return headerStore.get("x-real-ip") ?? "unknown";
}

// ─── Server Actions ───────────────────────────────────────────────────────────

/**
 * Phase 1 of the accountant two-phase upload pipeline (ADR-009 step 2).
 *
 * Authorize the accountant for upload, insert a pending Document row, and mint a signed
 * upload URL so the client browser can PUT bytes directly to storage.
 *
 * Flow:
 *   1. getAccountantIdentity() — must be ACCOUNTANT (role from verified session, CS-TS-004).
 *   2. getRateLimiter().consume(...) — ADR-022 rate-limit BEFORE authz.
 *   3. authorizeAccountantUpload(engagementId) — admin pool read confirms engagement exists.
 *      null → engagement not found → refuse.
 *   4. insertPendingDocument(admin pool) → documentId + storageKey.
 *   5. getStorage().getSignedUploadUrl(storageKey) → signed upload URL.
 *   6. Rewrite URL origin for browser consumption (BLOB_PUBLIC_ENDPOINT — BUG-008-001).
 *   7. recordAuthEvent (ADR-019) — audit after the owner-confirmed pending insert.
 *   8. Return { documentId, uploadUrl, storageKey } to the browser.
 *
 * ADR-003: identity guard before any DB write.
 * ADR-006: admin surface only.
 * ADR-009: signed upload URL; browser PUTs directly; app never proxies bytes.
 * ADR-022: rate-limit BEFORE authorize.
 * ADR-019: audit after owner-confirmed write.
 * CS-TS-004: identity from session cookie only — never from args.
 * CS-GEN-001: no PII logged — documentId only in audit, not filename.
 *
 * @param engagementId - The Engagement.id (from the URL route param — server-resolved).
 * @param filename - Original filename declared by the uploader.
 * @param contentType - Declared MIME type.
 * @param sizeBytes - Declared size in bytes (0 if unknown; stat() in completeUpload is authoritative).
 *
 * // ADR-003 // ADR-006 // ADR-009 // ADR-019 // ADR-022 // CS-TS-001 // CS-TS-004 // CS-GEN-001 // CS-GEN-003
 */
export async function requestUploadUrlAction(
  engagementId: string,
  filename: string,
  contentType: string,
  sizeBytes: number,
): Promise<RequestUploadUrlResult> {
  // ── 1. Identity guard (ACCOUNTANT-only, ADR-003, CS-TS-004) ──────────────────
  const identity = await getAccountantIdentity(); // ADR-003 // CS-TS-004
  if (!identity) {
    return { success: false, error: "Unauthorized: ACCOUNTANT identity required" };
  }

  // ── 2. Input validation ───────────────────────────────────────────────────────
  if (!engagementId?.trim()) {
    return { success: false, error: "A valid engagement ID is required" };
  }
  if (!filename?.trim()) {
    return { success: false, error: "A valid filename is required" };
  }

  // ── 3. Rate-limit BEFORE authorize (ADR-022) ──────────────────────────────────
  // ADR-022: consume from the per-IP upload budget before minting any URL.
  const sourceIp = await resolveSourceIp(); // ADR-005: server-side IP only
  const rateLimitKey = buildRateLimitKey(sourceIp, UPLOAD_URL_ENDPOINT);
  const limiter = getRateLimiter();
  const rateLimitResult = limiter.consume(rateLimitKey); // ADR-022

  if (!rateLimitResult.allowed) {
    return {
      success: false,
      error: "Too many upload attempts. Please wait before trying again.",
    };
  }

  // ── 4. Authorize (admin pool — accountant has full visibility) ─────────────────
  // ADR-009: authorize BEFORE minting any URL (step 2a).
  // authorizeAccountantUpload uses the admin pool — no SESSION_CONTEXT needed for accountant.
  // CS-TS-001: admin pool read via the document repository seam.
  const engagement = await authorizeAccountantUpload({ engagementId: engagementId.trim() }); // ADR-009
  if (!engagement) {
    return { success: false, error: "Engagement not found" };
  }

  // ── 5. Insert pending Document row (admin pool — ADR-009 step 2d) ─────────────
  // uploadedByClerkId is from the server-verified session (CS-TS-004 / ADR-019 audit trail).
  // CS-GEN-001: no PII logged — clerkUserId goes into audit row only, not server logs.
  let pendingResult: { documentId: string; storageKey: string };
  try {
    pendingResult = await insertPendingDocument({ // ADR-009 step 2d
      engagementId: engagement.id,
      documentRequestId: null, // accountant ad-hoc upload — not linked to a request
      originalFilename: filename.trim(),
      contentType: contentType || "application/octet-stream",
      sizeBytes: sizeBytes ?? 0,
      uploadedByClerkId: identity.clerkUserId, // CS-TS-004: from verified session
    });
  } catch (err: unknown) {
    // CS-GEN-001: log at server level only — do not surface internal topology to client.
    console.error("[requestUploadUrlAction] insertPendingDocument failed:", err);
    return { success: false, error: "Failed to register upload. Please try again." };
  }

  const { documentId, storageKey } = pendingResult;

  // ── 6. Mint signed upload URL (ADR-009 step 2e) ───────────────────────────────
  // Browser PUTs bytes directly to storage — the app never proxies bytes (ADR-009).
  const storage = getStorage();
  const signedUpload = await storage.getSignedUploadUrl(storageKey, {
    contentType: contentType || "application/octet-stream",
    maxSizeBytes: 100 * 1024 * 1024, // 100 MB cap (ADR-008 / ADR-021)
  });

  // ── 7. Rewrite URL origin for browser consumption (BUG-008-001 / BLOB_PUBLIC_ENDPOINT) ──
  // In local docker-compose, the server connects to Azurite at the Docker-internal hostname.
  // The browser cannot resolve that hostname — BLOB_PUBLIC_ENDPOINT rewrites it to localhost.
  // This is the known infra caveat (BUG-008-001) — see task Work Log for flagged tier note.
  let uploadUrl = signedUpload.url;
  const blobPublicEndpoint = process.env["BLOB_PUBLIC_ENDPOINT"];
  if (blobPublicEndpoint) {
    try {
      const internal = new URL(uploadUrl);
      const publicOrigin = new URL(blobPublicEndpoint);
      internal.protocol = publicOrigin.protocol;
      internal.hostname = publicOrigin.hostname;
      internal.port = publicOrigin.port;
      uploadUrl = internal.toString();
    } catch {
      // Malformed BLOB_PUBLIC_ENDPOINT — fall back to raw URL; browser PUT may fail.
      console.warn(
        "[requestUploadUrlAction] BLOB_PUBLIC_ENDPOINT set but could not be parsed; " +
          "returning raw storage URL.",
      );
    }
  }

  // ── 8. Audit the upload-URL mint (ADR-019) ────────────────────────────────────
  // ADR-019: actor = verified session identity; never from args.
  // CS-GEN-001: targetId = engagementId only — no filename in the audit row.
  const actor: AuditActor = {
    clerkUserId: identity.clerkUserId, // ADR-019 // CS-TS-004
    role: identity.role,
  };

  await recordAuthEvent({
    actor,
    action: "document.upload_url_minted",
    targetType: "Engagement",
    targetId: engagement.id,
    sourceSurface: "admin", // ADR-006
  });

  return {
    success: true,
    data: { documentId, uploadUrl, storageKey },
  };
}

/**
 * Phase 2 of the accountant two-phase upload pipeline (ADR-009 / ADR-021).
 *
 * Called after the browser has PUT bytes to the signed upload URL.
 * Drives the scan-before-available gate (ADR-021 / AC-NFR-009-01/-02):
 *   - 'clean' + validation 'pass' → promote to 'active' (Document available)
 *   - 'infected'                  → promote to 'infected' (AC-NFR-009-02: withheld)
 *   - 'indeterminate' / fail      → stay 'pending' (fail-closed)
 *
 * ADR-003: identity guard before any DB read/write.
 * ADR-006: admin surface only.
 * ADR-009: complete after PUT.
 * ADR-021: scan-before-available gate.
 * ADR-019: audit after scan-promote result.
 * ADR-022: rate-limit on the complete path.
 * CS-TS-004: identity from session cookie only — never from args.
 *
 * @param engagementId - The Engagement.id (from the URL route param — server-resolved).
 * @param documentId - The Document id returned by requestUploadUrlAction.
 * @param storageKey - The storage key returned by requestUploadUrlAction.
 *
 * // ADR-003 // ADR-006 // ADR-009 // ADR-019 // ADR-021 // ADR-022 // CS-TS-004 // CS-GEN-003
 */
export async function completeUploadAction(
  engagementId: string,
  documentId: string,
  storageKey: string,
): Promise<CompleteUploadResult> {
  // ── 1. Identity guard (ACCOUNTANT-only, ADR-003, CS-TS-004) ──────────────────
  const identity = await getAccountantIdentity(); // ADR-003 // CS-TS-004
  if (!identity) {
    return { success: false, error: "Unauthorized: ACCOUNTANT identity required" };
  }

  // ── 2. Input validation ───────────────────────────────────────────────────────
  if (!engagementId?.trim()) {
    return { success: false, error: "A valid engagement ID is required" };
  }
  if (!documentId?.trim()) {
    return { success: false, error: "A valid document ID is required" };
  }
  if (!storageKey?.trim()) {
    return { success: false, error: "A valid storage key is required" };
  }

  // ── 3. Rate-limit (ADR-022) ───────────────────────────────────────────────────
  const sourceIp = await resolveSourceIp();
  const rateLimitKey = buildRateLimitKey(sourceIp, COMPLETE_UPLOAD_ENDPOINT);
  const limiter = getRateLimiter();
  const rateLimitResult = limiter.consume(rateLimitKey); // ADR-022

  if (!rateLimitResult.allowed) {
    return {
      success: false,
      error: "Too many requests. Please wait before trying again.",
    };
  }

  // ── 4. Scan-promote gate (ADR-021) ─────────────────────────────────────────────
  // completeUpload: stat + validate + scan + promote.
  // engagementId scopes the promotion UPDATE (defence-in-depth).
  const scanResult = await completeUpload({ // ADR-021
    documentId: documentId.trim(),
    storageKey: storageKey.trim(),
    uploadedByClerkId: identity.clerkUserId, // CS-TS-004: from verified session
    engagementId: engagementId.trim(),
  });

  // ── 5. Audit (ADR-019) ────────────────────────────────────────────────────────
  const actor: AuditActor = {
    clerkUserId: identity.clerkUserId, // ADR-019 // CS-TS-004
    role: identity.role,
  };

  // Audit the scan completion event regardless of outcome (active/infected/pending).
  // CS-GEN-001: documentId only in audit row — no filename or storage key.
  await recordAuthEvent({
    actor,
    action: "document.upload_completed",
    targetType: "Document",
    targetId: documentId.trim(),
    sourceSurface: "admin", // ADR-006
  });

  // ── 6. Revalidate the documents page ─────────────────────────────────────────
  revalidatePath(`/engagements/${engagementId.trim()}/documents`);

  return {
    success: true,
    data: { outcome: scanResult.outcome },
  };
}

/**
 * Replace an existing document with a new version (accountant-only).
 *
 * AC-FILE-009-01: Accountant uploads a new version of an existing document.
 * AC-FILE-009-02: After replacement, the newest version is presented as current.
 *
 * This is Phase 1 of the replace pipeline:
 *   1. getAccountantIdentity() — must be ACCOUNTANT.
 *   2. getRateLimiter().consume(...) — ADR-022 rate-limit before any write.
 *   3. replaceDocumentWithNewVersion (admin pool, withAuditTransaction):
 *      - INSERT new DocumentVersion row (new version number, new storageKey).
 *      - SUPERSEDE prior DocumentVersion row (supersededAt = now).
 *      - UPDATE parent Document row (current pointer — DECISION-013-C).
 *   4. Mint signed upload URL for the replacement object (same pipeline as requestUploadUrlAction).
 *   5. Rewrite URL origin for browser (BUG-008-001 / BLOB_PUBLIC_ENDPOINT).
 *   6. Return { documentId, newVersionId, newVersion, uploadUrl, storageKey }.
 *
 * The browser then PUTs bytes to the signed URL and calls completeUploadAction to finalize.
 *
 * ADR-003: identity guard before any DB write.
 * ADR-006: admin surface only.
 * ADR-009: new DocumentVersion row + new storage key (NOT an overwrite).
 * DECISION-013-C: parent Document row = current pointer; prior rows retained.
 * ADR-019: 'document.version_replaced' audit event (inside replaceDocumentWithNewVersion).
 * ADR-022: rate-limit before write.
 * CS-TS-004: identity from session cookie only — never from args.
 *
 * @param engagementId - The Engagement.id (from the URL route param — server-resolved).
 * @param documentId - The existing Document.id to replace.
 * @param filename - Original filename of the replacement.
 * @param contentType - Declared MIME type of the replacement.
 * @param sizeBytes - Declared size in bytes (0 if unknown).
 *
 * // ADR-003 // ADR-006 // ADR-009 // ADR-019 // ADR-022 // DECISION-013-C // CS-TS-001 // CS-TS-004 // CS-GEN-001 // CS-GEN-003
 */
export async function replaceWithNewVersionAction(
  engagementId: string,
  documentId: string,
  filename: string,
  contentType: string,
  sizeBytes: number,
): Promise<ReplaceWithNewVersionResult> {
  // ── 1. Identity guard (ACCOUNTANT-only, ADR-003, CS-TS-004) ──────────────────
  const identity = await getAccountantIdentity(); // ADR-003 // CS-TS-004
  if (!identity) {
    return { success: false, error: "Unauthorized: ACCOUNTANT identity required" };
  }

  // ── 2. Input validation ───────────────────────────────────────────────────────
  if (!engagementId?.trim()) {
    return { success: false, error: "A valid engagement ID is required" };
  }
  if (!documentId?.trim()) {
    return { success: false, error: "A valid document ID is required" };
  }
  if (!filename?.trim()) {
    return { success: false, error: "A valid filename is required" };
  }

  // ── 3. Rate-limit (ADR-022) ───────────────────────────────────────────────────
  const sourceIp = await resolveSourceIp();
  const rateLimitKey = buildRateLimitKey(sourceIp, UPLOAD_URL_ENDPOINT);
  const limiter = getRateLimiter();
  const rateLimitResult = limiter.consume(rateLimitKey); // ADR-022

  if (!rateLimitResult.allowed) {
    return {
      success: false,
      error: "Too many upload attempts. Please wait before trying again.",
    };
  }

  // ── 4. Replace document with new version (DECISION-013-C) ──────────────────────
  // replaceDocumentWithNewVersion:
  //   - INSERT new DocumentVersion row.
  //   - SUPERSEDE prior DocumentVersion row.
  //   - UPDATE parent Document row (current pointer).
  //   - Emits ADR-019 audit event inside withAuditTransaction.
  // uploadedByClerkId from verified session (CS-TS-004).
  // CS-GEN-001: audit row contains documentId only — no filename or PII.
  let replaceResult: { newVersionId: string; newVersion: number; newStorageKey: string };
  try {
    replaceResult = await replaceDocumentWithNewVersion({ // DECISION-013-C // ADR-009
      documentId: documentId.trim(),
      engagementId: engagementId.trim(),
      originalFilename: filename.trim(),
      contentType: contentType || "application/octet-stream",
      sizeBytes: sizeBytes ?? 0,
      uploadedByClerkId: identity.clerkUserId, // CS-TS-004: from verified session
      sourceSurface: "admin", // ADR-006
    });
  } catch (err: unknown) {
    // CS-GEN-001: log at server level only — do not surface internal topology to client.
    console.error("[replaceWithNewVersionAction] replaceDocumentWithNewVersion failed:", err);
    return { success: false, error: "Failed to initiate version replacement. Please try again." };
  }

  const { newVersionId, newVersion, newStorageKey } = replaceResult;

  // ── 5. Mint signed upload URL for the replacement object (ADR-009) ─────────────
  // Browser PUTs replacement bytes to this URL; app never proxies bytes (ADR-009).
  const storage = getStorage();
  const signedUpload = await storage.getSignedUploadUrl(newStorageKey, {
    contentType: contentType || "application/octet-stream",
    maxSizeBytes: 100 * 1024 * 1024, // 100 MB cap (ADR-008 / ADR-021)
  });

  // ── 6. Rewrite URL origin for browser (BUG-008-001) ───────────────────────────
  let uploadUrl = signedUpload.url;
  const blobPublicEndpoint = process.env["BLOB_PUBLIC_ENDPOINT"];
  if (blobPublicEndpoint) {
    try {
      const internal = new URL(uploadUrl);
      const publicOrigin = new URL(blobPublicEndpoint);
      internal.protocol = publicOrigin.protocol;
      internal.hostname = publicOrigin.hostname;
      internal.port = publicOrigin.port;
      uploadUrl = internal.toString();
    } catch {
      console.warn(
        "[replaceWithNewVersionAction] BLOB_PUBLIC_ENDPOINT set but could not be parsed; " +
          "returning raw storage URL.",
      );
    }
  }

  // ── 7. Revalidate the documents page ─────────────────────────────────────────
  revalidatePath(`/engagements/${engagementId.trim()}/documents`);

  return {
    success: true,
    data: {
      documentId: documentId.trim(),
      newVersionId,
      newVersion,
      uploadUrl,
      storageKey: newStorageKey,
    },
  };
}

/**
 * List all documents for an engagement (accountant view — admin pool, full visibility).
 *
 * AC-FILE-001-01: The document set for the engagement is listed.
 *
 * ADR-003: accountant identity guard; admin pool for full-visibility read.
 * ADR-006: admin surface only.
 * CS-TS-001: uses listEngagementDocuments from @tax-portal/db barrel.
 *
 * @param engagementId - The Engagement.id (from the URL route param — server-resolved).
 *
 * // ADR-003 // ADR-006 // CS-TS-001 // CS-GEN-003
 */
export async function listDocumentsAction(
  engagementId: string,
): Promise<ListDocumentsResult> {
  // ── 1. Identity guard (ACCOUNTANT-only, ADR-003) ──────────────────────────────
  const identity = await getAccountantIdentity(); // ADR-003
  if (!identity) {
    return { success: false, error: "Unauthorized: ACCOUNTANT identity required" };
  }

  // ── 2. Input validation ───────────────────────────────────────────────────────
  if (!engagementId?.trim()) {
    return { success: false, error: "A valid engagement ID is required" };
  }

  // ── 3. Read documents (accountant uses withRequestContext — FILTER for ACCOUNTANT returns all) ──
  // DECISION-013-003: Use withRequestContext to set SESSION_CONTEXT for the accountant identity.
  // The FILTER predicate for ACCOUNTANT role returns all documents for any engagement (full visibility).
  // CS-TS-001: listEngagementDocuments from @tax-portal/db barrel (no raw pool).
  const documents = await withRequestContext(
    identity.clerkUserId,
    identity.role,
    () => listEngagementDocuments(engagementId.trim()),
  );

  return { success: true, data: documents };
}

// ─── Download actions (TASK-013-005) ─────────────────────────────────────────

/**
 * Authorize-then-sign a download URL for a document (accountant path).
 *
 * AC-FILE-001-03: The accountant can download any engagement's file over the
 *   time-limited, never-public signed-URL path (ADR-009).
 *
 * Flow:
 *   1. getAccountantIdentity() — must be ACCOUNTANT (ADR-003, CS-TS-004).
 *   2. withRequestContext(ACCOUNTANT) → authorizeThenSignDownload (request pool):
 *      - FILTER predicate: ACCOUNTANT sees all documents (ADR-005).
 *      - Active-only gate: pending/infected are NEVER signable (ADR-009).
 *      - Mint signed URL (ADR-008 TTL-capped; CS-GEN-001: URL not logged).
 *   3. recordAuthEvent (ADR-019) — emit document.download event on SUCCESS ONLY.
 *      targetId = documentId (NEVER the signed URL or filename — CS-GEN-001).
 *   4. Return { url, expiresAt } to the browser for immediate navigation.
 *
 * ADR-003: withRequestContext propagates ACCOUNTANT identity via SESSION_CONTEXT.
 * ADR-009: Authorize BEFORE minting the signed URL (request pool FILTER, then sign).
 * ADR-008: TTL-capped signed URL (max 3600s, default 300s).
 * ADR-019: download URL mint is an audited access event; actor from verified session only.
 * CS-GEN-001: Signed URL is NEVER logged or included in the audit payload; targetId = documentId only.
 * CS-GEN-003: Cite governing authority in comments.
 * CS-TS-004: Identity from session cookie only — never from args or form data.
 *
 * // DECISION: the audit event records document ACCESS (download-URL mint), keyed by documentId.
 * // The transient signed URL is never persisted or logged (ADR-009 / CS-GEN-001).
 *
 * @param documentId - The Document id to download (server-resolved; not client-supplied trust).
 * @param engagementId - The Engagement id (server-resolved scope for belt-and-suspenders check).
 *
 * // ADR-003 // ADR-008 // ADR-009 // ADR-019 // CS-GEN-001 // CS-TS-004 // CS-GEN-003 // AC-FILE-001-03
 */
export async function requestDownloadUrlAction(
  documentId: string,
  engagementId: string,
): Promise<RequestDownloadUrlResult> {
  // ── 1. Identity guard (ACCOUNTANT-only, ADR-003, CS-TS-004) ──────────────────
  const identity = await getAccountantIdentity(); // ADR-003 // CS-TS-004
  if (!identity) {
    return { success: false, error: "Unauthorized: ACCOUNTANT identity required" };
  }

  // ── 2. Input validation ───────────────────────────────────────────────────────
  if (!documentId?.trim()) {
    return { success: false, error: "A valid document ID is required" };
  }
  if (!engagementId?.trim()) {
    return { success: false, error: "A valid engagement ID is required" };
  }

  // ── 3. Authorize-then-sign (ADR-009, request pool, ACCOUNTANT SESSION_CONTEXT) ─
  // ADR-003: withRequestContext propagates ACCOUNTANT identity so the RLS FILTER
  //   returns the document (ACCOUNTANT sees all, ADR-005).
  // ADR-009: authorize BEFORE minting the signed URL.
  // CS-GEN-001: signed URL is not logged — returned to the caller only.
  const result = await withRequestContext(
    identity.clerkUserId,
    identity.role,
    () =>
      authorizeThenSignDownload({
        documentId: documentId.trim(),
        engagementId: engagementId.trim(),
      }),
  );

  if (!result.authorized) {
    // AC-FILE-003-03: no anonymous/public path — return refusal without detail.
    const reason = result.reason === "not-active"
      ? "File is not yet available (processing or blocked)."
      : "File not found or access denied.";
    return { success: false, error: reason };
  }

  // ── 4. Rewrite URL origin for browser consumption (BUG-008-001 / BLOB_PUBLIC_ENDPOINT) ──
  // In local docker-compose, the server connects to Azurite at the Docker-internal hostname.
  // BLOB_PUBLIC_ENDPOINT rewrites it to localhost for the browser.
  // BUG-008-001: known infra caveat — see TASK-013-003 Work Log.
  let downloadUrl = result.url;
  const blobPublicEndpoint = process.env["BLOB_PUBLIC_ENDPOINT"];
  if (blobPublicEndpoint) {
    try {
      const internal = new URL(downloadUrl);
      const publicOrigin = new URL(blobPublicEndpoint);
      internal.protocol = publicOrigin.protocol;
      internal.hostname = publicOrigin.hostname;
      internal.port = publicOrigin.port;
      downloadUrl = internal.toString();
    } catch {
      // Malformed BLOB_PUBLIC_ENDPOINT — fall back to raw URL; browser GET may fail.
      console.warn(
        "[requestDownloadUrlAction] BLOB_PUBLIC_ENDPOINT set but could not be parsed; " +
          "returning raw storage URL.",
      );
    }
  }

  // ── 5. Audit the download-URL mint (ADR-019) ─────────────────────────────────
  // ADR-019: emit on SUCCESS ONLY (refusal path exits before this point).
  // DECISION: audit records document ACCESS (download-URL mint), keyed by documentId.
  //   The transient signed URL is NEVER included in the payload (ADR-009 / CS-GEN-001).
  //   actor = clerkUserId from the verified session (CS-TS-004 / ADR-019 / ADR-003).
  //   targetId = documentId (NEVER the signed URL or filename — CS-GEN-001).
  // // ADR-019 // ADR-003 // ADR-009 // CS-GEN-001 // CS-TS-004
  const downloadActor: AuditActor = {
    clerkUserId: identity.clerkUserId, // ADR-019 // CS-TS-004: from verified session
    role: identity.role,
  };

  await recordAuthEvent({
    actor: downloadActor,
    action: "document.download",
    targetType: "Document",
    targetId: documentId.trim(), // CS-GEN-001: documentId only — NOT the signed URL or filename
    sourceSurface: "admin", // ADR-006
  });

  // CS-GEN-001: the signed URL is returned to the caller but NEVER logged.
  return {
    success: true,
    data: { url: downloadUrl, expiresAt: result.expiresAt },
  };
}

/**
 * Authorize-then-sign a download URL for a specific DocumentVersion (by versionId).
 *
 * AC-FILE-009-03: Prior versions are retained and each is individually downloadable.
 *
 * This action mints a signed URL against a DocumentVersion's storageKey. The server
 * resolves the storageKey from the DB row under RLS — the client never supplies it.
 *
 * ADR-009: Authorize-then-sign — the caller's identity is verified first.
 *   We authorize via authorizeThenSignDownload (parent Document row), then resolve
 *   the version's storageKey from listDocumentVersions (RLS-scoped), then sign it.
 * SECURITY: versionId is accepted from the client instead of versionStorageKey to prevent
 *   IDOR. The server resolves and asserts version.documentId === documentId before signing.
 * ADR-019: version download URL mint is an audited access event; actor from verified session only.
 *   targetId = documentId (parent document — NOT the storageKey, signed URL, or filename).
 * CS-GEN-001: Signed URL NOT logged; targetId = documentId only (no version storageKey in payload).
 * CS-TS-004: Identity from session cookie only.
 *
 * // DECISION: the audit event records document version ACCESS, keyed by the parent documentId.
 * // The transient signed URL and version storageKey are never persisted or logged (ADR-009 / CS-GEN-001).
 *
 * @param documentId - The parent Document id (for RLS authz check).
 * @param engagementId - The Engagement id (for scope check).
 * @param versionId - The DocumentVersion.id to download (server resolves storageKey — never client-supplied).
 *
 * // ADR-003 // ADR-008 // ADR-009 // ADR-019 // CS-GEN-001 // CS-TS-004 // CS-GEN-003 // AC-FILE-009-03
 */
export async function requestDownloadUrlForVersionAction(
  documentId: string,
  engagementId: string,
  versionId: string,
): Promise<RequestDownloadUrlResult> {
  // ── 1. Identity guard (ACCOUNTANT-only, ADR-003, CS-TS-004) ──────────────────
  const identity = await getAccountantIdentity(); // ADR-003 // CS-TS-004
  if (!identity) {
    return { success: false, error: "Unauthorized: ACCOUNTANT identity required" };
  }

  // ── 2. Input validation ───────────────────────────────────────────────────────
  if (!documentId?.trim()) {
    return { success: false, error: "A valid document ID is required" };
  }
  if (!engagementId?.trim()) {
    return { success: false, error: "A valid engagement ID is required" };
  }
  if (!versionId?.trim()) {
    return { success: false, error: "A valid version ID is required" };
  }

  // ── 3. Authorize via the parent document AND resolve the version row under RLS ─
  // ADR-009: authorize BEFORE minting. CS-GEN-001: URL not logged.
  // SECURITY: listDocumentVersions runs under withRequestContext (ACCOUNTANT SESSION_CONTEXT),
  //   so sec.pol_DocumentVersion FILTER (TASK-013-001) governs what rows are visible.
  //   We then assert version.documentId === documentId to prevent cross-document IDOR.
  //   The storageKey is NEVER client-supplied.
  const authAndVersionResult = await withRequestContext(
    identity.clerkUserId,
    identity.role,
    async () => {
      const authResult = await authorizeThenSignDownload({
        documentId: documentId.trim(),
        engagementId: engagementId.trim(),
      });
      if (!authResult.authorized) {
        return { authorized: false as const, reason: authResult.reason };
      }
      // Resolve version row under RLS — sec.pol_DocumentVersion FILTER applies.
      const versions = await listDocumentVersions(documentId.trim());
      const version = versions.find((v) => v.id === versionId.trim());
      if (!version) {
        return { authorized: false as const, reason: "rls-filtered" as const };
      }
      // Belt-and-suspenders: assert the resolved row belongs to the claimed document.
      if (version.documentId !== documentId.trim()) {
        return { authorized: false as const, reason: "rls-filtered" as const };
      }
      return { authorized: true as const, storageKey: version.storageKey };
    },
  );

  if (!authAndVersionResult.authorized) {
    // The parent document isn't accessible — don't sign any version key.
    return { success: false, error: "File not found or access denied." };
  }

  // ── 4. Mint signed URL for the version's storageKey (server-resolved) ────────
  // ADR-008: TTL-capped by the adapter (default 300s, max 3600s).
  // CS-GEN-001: signed URL NOT logged.
  const storage = getStorage();
  const signedUrl = await storage.getSignedDownloadUrl(authAndVersionResult.storageKey, {
    responseContentDisposition: "attachment",
  });

  // ── 5. Rewrite URL origin for browser (BUG-008-001 / BLOB_PUBLIC_ENDPOINT) ──
  let downloadUrl = signedUrl.url;
  const blobPublicEndpoint = process.env["BLOB_PUBLIC_ENDPOINT"];
  if (blobPublicEndpoint) {
    try {
      const internal = new URL(downloadUrl);
      const publicOrigin = new URL(blobPublicEndpoint);
      internal.protocol = publicOrigin.protocol;
      internal.hostname = publicOrigin.hostname;
      internal.port = publicOrigin.port;
      downloadUrl = internal.toString();
    } catch {
      console.warn(
        "[requestDownloadUrlForVersionAction] BLOB_PUBLIC_ENDPOINT set but could not be parsed; " +
          "returning raw storage URL.",
      );
    }
  }

  // ── 6. Audit the version download-URL mint (ADR-019) ─────────────────────────
  // ADR-019: emit on SUCCESS ONLY (refusal path exits before this point — step 3).
  // DECISION: audit records document version ACCESS, keyed by parent documentId.
  //   The transient signed URL and version storageKey are NEVER included in the payload.
  //   targetId = documentId (parent document — NOT the version storageKey — CS-GEN-001).
  // // ADR-019 // ADR-003 // ADR-009 // CS-GEN-001 // CS-TS-004
  const versionDownloadActor: AuditActor = {
    clerkUserId: identity.clerkUserId, // ADR-019 // CS-TS-004: from verified session
    role: identity.role,
  };

  await recordAuthEvent({
    actor: versionDownloadActor,
    action: "document.download",
    targetType: "Document",
    targetId: documentId.trim(), // CS-GEN-001: parent documentId only — NOT storageKey or signed URL
    sourceSurface: "admin", // ADR-006
  });

  // CS-GEN-001: signed URL is returned to the caller but NEVER logged.
  return {
    success: true,
    data: { url: downloadUrl, expiresAt: signedUrl.expiresAt },
  };
}

/**
 * List all DocumentVersion rows for a given document (accountant view).
 *
 * AC-FILE-009-03: Prior versions are retained and listed (supersededAt IS NOT NULL = prior).
 *
 * ADR-003: withRequestContext propagates ACCOUNTANT identity.
 * CS-TS-001: listDocumentVersions from @tax-portal/db barrel.
 *
 * @param documentId - The parent Document id.
 *
 * // ADR-003 // CS-TS-001 // CS-GEN-003 // AC-FILE-009-03
 */
export async function listDocumentVersionsAction(
  documentId: string,
): Promise<ListDocumentVersionsResult> {
  // ── 1. Identity guard (ACCOUNTANT-only, ADR-003) ──────────────────────────────
  const identity = await getAccountantIdentity(); // ADR-003
  if (!identity) {
    return { success: false, error: "Unauthorized: ACCOUNTANT identity required" };
  }

  // ── 2. Input validation ───────────────────────────────────────────────────────
  if (!documentId || typeof documentId !== "string" || !documentId.trim()) {
    return { success: false, error: "A valid document ID is required" };
  }

  // ── 3. List versions (request pool — FILTER-governed) ────────────────────────
  // CS-TS-001: listDocumentVersions from @tax-portal/db barrel.
  const versions = await withRequestContext(
    identity.clerkUserId,
    identity.role,
    () => listDocumentVersions(documentId.trim()),
  );

  return { success: true, data: versions };
}

// ─── Soft-delete actions (TASK-014-003 / EPIC-014) ────────────────────────────

/**
 * Soft-delete a document (accountant-only).
 *
 * AC-FILE-004-01: The accountant can delete a file within an engagement.
 * AC-FILE-004-02: A client cannot delete — this action rejects non-ACCOUNTANT (CS-TS-004).
 * AC-FILE-006-01: Deleting marks the file deleted and removes it from the working view.
 * AC-FILE-006-02/-03: Soft-delete is UPDATE-only (ADR-018 §1) — row + bytes are retained;
 *   the document remains recoverable in-window (see recoverDocumentAction).
 *
 * Flow:
 *   1. getAccountantIdentity() — ACCOUNTANT-only (CS-TS-004). Rejects non-accountant.
 *   2. Input validation.
 *   3. softDeleteDocument (admin pool, ADR-018 §1 — UPDATE-only, audit event inside).
 *   4. revalidatePath — removes the file from the working view (AC-FILE-006-01).
 *
 * ADR-003: identity guard before any write (CS-TS-004).
 * ADR-006: apps/admin ONLY — no delete action/route in apps/portal (AC-FILE-004-03).
 * ADR-018: soft-delete-first — deletedAt tombstone, never physical DELETE.
 *   Row + bytes survive; no purge path in this slice (EPIC-015).
 * ADR-019: 'document.deleted' audit event recorded inside softDeleteDocument.
 * CS-TS-001: softDeleteDocument from @tax-portal/db barrel (admin pool).
 * CS-TS-003: mirror check — portal exposes NO delete affordance; verified by TASK-014-003 portal e2e.
 * CS-TS-004: identity from session cookie only; rejects CLIENT role (AC-FILE-004-02).
 * CS-GEN-001: no PII logged; targetId = documentId (never filename or storageKey).
 *
 * @param engagementId - The Engagement.id (server-resolved route param).
 * @param documentId - The Document.id to soft-delete.
 *
 * // ADR-003 // ADR-006 // ADR-018 // ADR-019 // CS-TS-001 // CS-TS-003 // CS-TS-004 // CS-GEN-001 // CS-GEN-003
 * // AC-FILE-004-01 // AC-FILE-004-02 // AC-FILE-006-01
 */
export async function deleteDocumentAction(
  engagementId: string,
  documentId: string,
): Promise<DeleteDocumentResult> {
  // ── 1. Identity guard (ACCOUNTANT-only, ADR-003, CS-TS-004) ──────────────────
  // CS-TS-004: identity from verified session only — rejects null and CLIENT role.
  // AC-FILE-004-02: non-ACCOUNTANT identity → reject BEFORE any write.
  const identity = await getAccountantIdentity(); // ADR-003 // CS-TS-004
  if (!identity) {
    // CS-GEN-001: do not expose internals; generic Unauthorized message only.
    return { success: false, error: "Unauthorized: ACCOUNTANT identity required" }; // AC-FILE-004-02
  }

  // ── 2. Input validation ───────────────────────────────────────────────────────
  if (!engagementId?.trim()) {
    return { success: false, error: "A valid engagement ID is required" };
  }
  if (!documentId?.trim()) {
    return { success: false, error: "A valid document ID is required" };
  }

  // ── 3. Soft-delete (admin pool, ADR-018 §1 — UPDATE-only) ────────────────────
  // softDeleteDocument:
  //   - Sets deletedAt tombstone on the Document row (UPDATE, NOT DELETE).
  //   - Emits 'document.deleted' audit event inside (ADR-019).
  //   - actor from the verified session (CS-TS-004 / ADR-019).
  //   - Row + bytes are preserved (AC-FILE-006-02).
  // CS-TS-001: softDeleteDocument from @tax-portal/db barrel (admin pool).
  // CS-GEN-001: no PII in logs; targetId = documentId only in audit row.
  const actor: AuditActor = {
    clerkUserId: identity.clerkUserId, // ADR-019 // CS-TS-004: from verified session
    role: identity.role,
  };

  let deleteResult: SoftDeleteDocumentResult;
  try {
    deleteResult = await softDeleteDocument({ // ADR-018 §1 // CS-TS-001
      documentId: documentId.trim(),
      engagementId: engagementId.trim(),
      actor, // ADR-019: actor from verified session
    });
  } catch (err: unknown) {
    // CS-GEN-001: server-level log only — do not surface internals to the client.
    console.error("[deleteDocumentAction] softDeleteDocument failed:", err);
    return { success: false, error: "Failed to delete document. Please try again." };
  }

  // ── 4. Revalidate documents page (AC-FILE-006-01 — remove from working view) ─
  // The deleted file leaves the working-view list on next render (deletedAt IS NOT NULL
  // filtered out by the RLS FILTER branch for ACCOUNTANT working view, per DECISION-014-E).
  revalidatePath(`/engagements/${engagementId.trim()}/documents`); // AC-FILE-006-01

  return { success: true, data: deleteResult };
}

/**
 * Recover a soft-deleted document (accountant-only).
 *
 * AC-FILE-006-03: A soft-deleted file remains recoverable until its retention period elapses.
 * AC-FILE-005-02: Within the 7-year window, a document remains recoverable.
 *
 * Flow:
 *   1. getAccountantIdentity() — ACCOUNTANT-only (CS-TS-004).
 *   2. Input validation.
 *   3. recoverDocument (admin pool, ADR-018 §1 — clears deletedAt, audit event inside).
 *   4. revalidatePath — restores the file to the working view.
 *
 * ADR-003: identity guard before any write (CS-TS-004).
 * ADR-006: apps/admin ONLY.
 * ADR-018: clears deletedAt tombstone; no purge in this slice (EPIC-015).
 * ADR-019: 'document.recovered' audit event recorded inside recoverDocument.
 * CS-TS-001: recoverDocument from @tax-portal/db barrel (admin pool).
 * CS-TS-004: identity from session cookie only; rejects CLIENT role.
 * CS-GEN-001: no PII logged; targetId = documentId in audit row.
 *
 * @param engagementId - The Engagement.id (server-resolved route param).
 * @param documentId - The Document.id to recover.
 *
 * // ADR-003 // ADR-006 // ADR-018 // ADR-019 // CS-TS-001 // CS-TS-004 // CS-GEN-001 // CS-GEN-003
 * // AC-FILE-006-03 // AC-FILE-005-02
 */
export async function recoverDocumentAction(
  engagementId: string,
  documentId: string,
): Promise<RecoverDocumentActionResult> {
  // ── 1. Identity guard (ACCOUNTANT-only, ADR-003, CS-TS-004) ──────────────────
  const identity = await getAccountantIdentity(); // ADR-003 // CS-TS-004
  if (!identity) {
    return { success: false, error: "Unauthorized: ACCOUNTANT identity required" };
  }

  // ── 2. Input validation ───────────────────────────────────────────────────────
  if (!engagementId?.trim()) {
    return { success: false, error: "A valid engagement ID is required" };
  }
  if (!documentId?.trim()) {
    return { success: false, error: "A valid document ID is required" };
  }

  // ── 3. Recover (admin pool, ADR-018 §1 — clears deletedAt tombstone) ─────────
  // recoverDocument:
  //   - Clears deletedAt on the Document row (UPDATE, NOT DELETE or INSERT).
  //   - Emits 'document.recovered' audit event inside (ADR-019).
  //   - actor from the verified session (CS-TS-004 / ADR-019).
  // CS-TS-001: recoverDocument from @tax-portal/db barrel (admin pool).
  // CS-GEN-001: no PII in logs; actor from verified session only.
  const actor: AuditActor = {
    clerkUserId: identity.clerkUserId, // ADR-019 // CS-TS-004: from verified session
    role: identity.role,
  };

  let recoverResult: RecoverDocumentResult;
  try {
    recoverResult = await recoverDocument({ // ADR-018 §1 // CS-TS-001
      documentId: documentId.trim(),
      engagementId: engagementId.trim(),
      actor, // ADR-019: actor from verified session
    });
  } catch (err: unknown) {
    // CS-GEN-001: server-level log only — do not surface internals to the client.
    console.error("[recoverDocumentAction] recoverDocument failed:", err);
    return { success: false, error: "Failed to recover document. Please try again." };
  }

  // ── 4. Revalidate documents page (restore to working view) ───────────────────
  revalidatePath(`/engagements/${engagementId.trim()}/documents`); // AC-FILE-006-03

  return { success: true, data: recoverResult };
}

/**
 * List soft-deleted documents for an engagement (accountant archive view).
 *
 * AC-FILE-006-01: Deleted documents leave the working view → they appear in this archive view.
 * AC-FILE-006-03: Deleted documents remain in the archive (recoverable) until retention elapses.
 *
 * ADR-003: identity guard before read.
 * ADR-006: apps/admin ONLY (archive view is accountant-only).
 * CS-TS-001: listDeletedDocuments from @tax-portal/db barrel (admin pool).
 *
 * @param engagementId - The Engagement.id (server-resolved route param).
 *
 * // ADR-003 // ADR-006 // CS-TS-001 // CS-GEN-003
 * // AC-FILE-006-01 // AC-FILE-006-03
 */
export async function listDeletedDocumentsAction(
  engagementId: string,
): Promise<ListDeletedDocumentsResult> {
  // ── 1. Identity guard (ACCOUNTANT-only, ADR-003) ──────────────────────────────
  const identity = await getAccountantIdentity(); // ADR-003
  if (!identity) {
    return { success: false, error: "Unauthorized: ACCOUNTANT identity required" };
  }

  // ── 2. Input validation ───────────────────────────────────────────────────────
  if (!engagementId?.trim()) {
    return { success: false, error: "A valid engagement ID is required" };
  }

  // ── 3. List deleted documents (request pool, ACCOUNTANT SESSION_CONTEXT) ────────
  // DECISION-014-003: listDeletedDocuments uses db (request-pool Prisma client) with the
  // ADR-003 middleware that enforces SESSION_CONTEXT. Must be wrapped in withRequestContext
  // so the middleware validates the caller's identity before the query executes.
  // The ACCOUNTANT FILTER in fn_document_access returns all documents (incl. deleted) for this role.
  // CS-TS-001: listDeletedDocuments from @tax-portal/db barrel (via withRequestContext).
  const deletedDocuments = await withRequestContext(
    identity.clerkUserId,
    identity.role,
    () => listDeletedDocuments(engagementId.trim()),
  ); // ADR-003 // CS-TS-001

  return { success: true, data: deletedDocuments };
}
