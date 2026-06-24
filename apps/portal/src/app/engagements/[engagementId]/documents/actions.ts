/**
 * apps/portal/src/app/engagements/[engagementId]/documents/actions.ts
 *
 * Server actions for the portal client-participant document download surface.
 *
 * TASK-013-005: Both-surface download — client participant download path (AC-FILE-001-04).
 *
 * Acceptance criteria:
 *   AC-FILE-001-04 — a client participant can download their own engagement's files
 *     (resolves through the participant-extended fn_document_access — TASK-013-001).
 *     An unrelated client gets no URL (rls-filtered).
 *   AC-FILE-009-03 — version history listed; each prior version downloadable.
 *
 * ADR-003: Every action verifies getClientIdentity() BEFORE any DB query.
 *   The actor identity comes ONLY from the verified session — never from action args,
 *   form data, or client-supplied role.
 * ADR-006: Download is the mirrored path (CLAUDE.md § Platform-frontend scope).
 *   This action mirrors admin requestDownloadUrlAction — keep the signed-URL +
 *   DB-wrapper download handling consistent (CS-TS-003).
 * ADR-009: Authorize-then-sign discipline — authorizeThenSignDownload (request pool).
 *   The RLS FILTER (fn_document_access, TASK-013-001) is what grants access to
 *   both the engagement owner and any linked participant.
 * ADR-008: TTL-capped signed URL (max 3600s, default 300s).
 * CS-GEN-001: No signed URL or PII logged at production level.
 * CS-TS-003: Signed-URL + DB-wrapper handling mirrors apps/admin (mirror discipline).
 * CS-TS-004: Identity from session cookie only — never from args/form data.
 *
 * Pool strategy:
 *   requestDownloadUrlAction: withRequestContext (CLIENT) → authorizeThenSignDownload (request pool) → recordAuthEvent (ADR-019).
 *     The participant-extended fn_document_access predicate (TASK-013-001) is what allows
 *     a non-owner participant to pass the FILTER gate.
 *   requestDownloadUrlForVersionAction: withRequestContext (CLIENT) → authorize via parent doc, then sign version key → recordAuthEvent (ADR-019).
 *   listDocumentsForEngagementAction: withRequestContext (CLIENT) → listEngagementDocuments (request pool).
 *   listDocumentVersionsAction: withRequestContext (CLIENT) → listDocumentVersions (request pool).
 *
 * // ADR-003: server-side authority — getClientIdentity() before every DB access
 * // ADR-006: portal surface — download is the mirrored path (no upload or folder management)
 * // ADR-009: two-phase authorize-then-sign download pipeline
 * // ADR-008: TTL-capped signed download URL (max 3600s)
 * // ADR-019: download access events are audited; actor from verified session; targetId = documentId (CS-GEN-001)
 * // CS-TS-001: all DB reads use @tax-portal/db barrel via withRequestContext
 * // CS-TS-002: no direct adminDb/pool import
 * // CS-TS-003: mirror discipline — signed-URL + DB-wrapper handling + audit emission matches apps/admin (TASK-013-007)
 * // CS-TS-004: identity from session cookie, never from args/form data
 * // CS-GEN-001: no PII or signed URL logged; targetId = documentId only — signed URL NEVER persisted or logged
 * // CS-GEN-003: cite governing authority in comments
 */

"use server";

import { headers } from "next/headers";
import { getAuthProvider } from "@tax-portal/auth";
import {
  listEngagementDocuments,
  listDocumentVersions,
  recordAuthEvent,
  withRequestContext,
} from "@tax-portal/db";
import type { AuditActor, DocumentItem, DocumentVersionItem } from "@tax-portal/db";
// NOT on the barrel — import directly from the source module (TASK-013-002 / document.ts note)
import { authorizeThenSignDownload } from "@tax-portal/db/src/repositories/document.js";
import { getStorage } from "@tax-portal/storage";

// ─── Result types ─────────────────────────────────────────────────────────────

export type RequestDownloadUrlResult =
  | { success: true; data: { url: string; expiresAt: Date } }
  | { success: false; error: string };

export type ListDocumentsResult =
  | { success: true; data: DocumentItem[] }
  | { success: false; error: string };

export type ListDocumentVersionsResult =
  | { success: true; data: DocumentVersionItem[] }
  | { success: false; error: string };

// ─── Identity helper ──────────────────────────────────────────────────────────

/**
 * Resolve the verified client identity from the incoming request headers.
 *
 * ADR-003: identity.role comes from the verified session (Clerk public metadata
 *   or mock session cookie) — NEVER from any server action argument or form data.
 * CS-TS-004: identity from session cookie only — never from args or form data.
 *
 * DECISION-013-005-A: portal download requires CLIENT identity only. An unauthenticated
 *   call returns null → 401 refused. An ACCOUNTANT session on portal is an edge case
 *   handled by ADR-010 middleware redirect; we treat it as unauthorized here.
 */
async function getClientIdentity(): Promise<{
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

  if (!identity || identity.role !== "CLIENT") {
    return null;
  }

  return { clerkUserId: identity.clerkUserId, role: identity.role };
}

// ─── Server Actions ───────────────────────────────────────────────────────────

/**
 * Authorize-then-sign a download URL for a document (client participant path).
 *
 * AC-FILE-001-04: A client participant can download their engagement's file over the
 *   time-limited, never-public signed-URL path (ADR-009).
 *   The participant-extended fn_document_access (TASK-013-001) is what lets a
 *   non-owner participant pass the FILTER gate (not just the engagement owner).
 *   An unrelated client's SESSION_CONTEXT fails the FILTER → rls-filtered → no URL.
 *
 * Flow:
 *   1. getClientIdentity() — must be CLIENT (ADR-003, CS-TS-004).
 *   2. withRequestContext(CLIENT) → authorizeThenSignDownload (request pool):
 *      - FILTER (fn_document_access, TASK-013-001): owner + participant branch both pass.
 *      - Unrelated client → FILTER returns null → { authorized: false, reason: "rls-filtered" }.
 *      - Active-only gate: pending/infected NEVER signable (ADR-009).
 *      - Mint signed URL (ADR-008 TTL-capped; CS-GEN-001: URL not logged).
 *   3. recordAuthEvent (ADR-019) — emit document.download event on SUCCESS ONLY.
 *      targetId = documentId (NEVER the signed URL or filename — CS-GEN-001).
 *   4. Rewrite URL origin for browser (BLOB_PUBLIC_ENDPOINT — BUG-008-001).
 *   5. Return { url, expiresAt } for immediate browser navigation.
 *
 * ADR-003: withRequestContext propagates CLIENT identity via SESSION_CONTEXT.
 * ADR-009: Authorize BEFORE minting the signed URL.
 * ADR-019: download URL mint is an audited access event; actor from verified session only.
 * CS-GEN-001: Signed URL NOT logged; targetId = documentId only (no signed URL in payload).
 * CS-TS-003: Mirrors apps/admin requestDownloadUrlAction (mirror discipline — TASK-013-007).
 * CS-TS-004: Identity from session cookie only — never from args.
 *
 * // DECISION: the audit event records document ACCESS (download-URL mint), keyed by documentId.
 * // The transient signed URL is never persisted or logged (ADR-009 / CS-GEN-001).
 *
 * @param documentId - The Document id to download (server-resolved; not client-supplied trust).
 * @param engagementId - The Engagement id (server-resolved scope for belt-and-suspenders).
 *
 * // ADR-003 // ADR-008 // ADR-009 // ADR-019 // CS-GEN-001 // CS-TS-003 // CS-TS-004 // CS-GEN-003
 * // AC-FILE-001-04
 */
export async function requestDownloadUrlAction(
  documentId: string,
  engagementId: string,
): Promise<RequestDownloadUrlResult> {
  // ── 1. Identity guard (CLIENT-only, ADR-003, CS-TS-004) ──────────────────────
  const identity = await getClientIdentity(); // ADR-003 // CS-TS-004
  if (!identity) {
    return { success: false, error: "Unauthorized: Please sign in to download files." };
  }

  // ── 2. Input validation ───────────────────────────────────────────────────────
  if (!documentId?.trim()) {
    return { success: false, error: "A valid document ID is required." };
  }
  if (!engagementId?.trim()) {
    return { success: false, error: "A valid engagement ID is required." };
  }

  // ── 3. Authorize-then-sign (ADR-009, request pool, CLIENT SESSION_CONTEXT) ────
  // ADR-003: withRequestContext propagates CLIENT identity.
  // ADR-005: fn_document_access FILTER (TASK-013-001) is the access gate:
  //   - Engagement owner: (e.clientUserId = me) → pass.
  //   - Linked participant: EXISTS(EngagementParticipant ep ...) → pass.
  //   - Unrelated client: both branches fail → { authorized: false, reason: "rls-filtered" }.
  // ADR-009: authorize BEFORE minting. CS-GEN-001: URL not logged.
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
    // AC-FILE-003-03: no anonymous/public path.
    // Do NOT reveal whether the document exists (information leak prevention).
    const reason = result.reason === "not-active"
      ? "File is not yet available."
      : "File not found or access denied.";
    return { success: false, error: reason };
  }

  // ── 4. Audit the download-URL mint (ADR-019) ─────────────────────────────────
  // ADR-019: emit on SUCCESS ONLY (refusal path exits before this point — step 3).
  // DECISION: audit records document ACCESS (download-URL mint), keyed by documentId.
  //   The transient signed URL is NEVER included in the payload (ADR-009 / CS-GEN-001).
  //   actor = clerkUserId from the verified session (CS-TS-004 / ADR-019 / ADR-003).
  //   targetId = documentId (NEVER the signed URL or filename — CS-GEN-001).
  // CS-TS-003: mirrors apps/admin requestDownloadUrlAction audit pattern (TASK-013-007).
  // // ADR-019 // ADR-003 // ADR-009 // CS-GEN-001 // CS-TS-003 // CS-TS-004
  const downloadActor: AuditActor = {
    clerkUserId: identity.clerkUserId, // ADR-019 // CS-TS-004: from verified session
    role: identity.role,
  };

  await recordAuthEvent({
    actor: downloadActor,
    action: "document.download",
    targetType: "Document",
    targetId: documentId.trim(), // CS-GEN-001: documentId only — NOT the signed URL or filename
    sourceSurface: "portal", // ADR-006: portal surface
  });

  // ── 5. Rewrite URL origin for browser (BUG-008-001 / BLOB_PUBLIC_ENDPOINT) ──
  // Mirrors admin requestDownloadUrlAction (CS-TS-003).
  // BUG-008-001: known infra caveat — Docker-internal host not reachable from browser.
  // The portal side was wired by TASK-007-001; BLOB_PUBLIC_ENDPOINT is set in portal env.
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
      // Malformed BLOB_PUBLIC_ENDPOINT — fall back to raw URL.
      console.warn(
        "[portal:requestDownloadUrlAction] BLOB_PUBLIC_ENDPOINT set but could not be parsed; " +
          "returning raw storage URL.",
      );
    }
  }

  // CS-GEN-001: signed URL returned to caller but NEVER logged.
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
 * Mirrors apps/admin requestDownloadUrlForVersionAction (CS-TS-003 — TASK-013-007).
 * The client participant path uses withRequestContext(CLIENT) — the same
 * fn_document_access FILTER (TASK-013-001) applies here as for the current version.
 *
 * ADR-019: version download URL mint is an audited access event; actor from verified session.
 *   targetId = documentId (parent — NOT the version storageKey or signed URL — CS-GEN-001).
 *
 * SECURITY: versionId is accepted from the client instead of versionStorageKey to prevent
 *   IDOR. The server resolves the storageKey from the DB row under RLS, asserting
 *   version.documentId === documentId before signing. The client never supplies the key.
 *
 * // DECISION: audit records document version ACCESS, keyed by the parent documentId.
 * // The transient signed URL and version storageKey are never persisted or logged (ADR-009 / CS-GEN-001).
 *
 * @param documentId - The parent Document id (for RLS authz check).
 * @param engagementId - The Engagement id (for scope check).
 * @param versionId - The DocumentVersion.id to download (server resolves storageKey — never client-supplied).
 *
 * // ADR-003 // ADR-008 // ADR-009 // ADR-019 // CS-GEN-001 // CS-TS-003 // CS-TS-004 // CS-GEN-003
 * // AC-FILE-009-03
 */
export async function requestDownloadUrlForVersionAction(
  documentId: string,
  engagementId: string,
  versionId: string,
): Promise<RequestDownloadUrlResult> {
  // ── 1. Identity guard (CLIENT-only) ──────────────────────────────────────────
  const identity = await getClientIdentity(); // ADR-003 // CS-TS-004
  if (!identity) {
    return { success: false, error: "Unauthorized: Please sign in to download files." };
  }

  // ── 2. Input validation ───────────────────────────────────────────────────────
  if (!documentId?.trim()) {
    return { success: false, error: "A valid document ID is required." };
  }
  if (!engagementId?.trim()) {
    return { success: false, error: "A valid engagement ID is required." };
  }
  if (!versionId?.trim()) {
    return { success: false, error: "A valid version ID is required." };
  }

  // ── 3. Authorize via parent document AND resolve the version row under RLS ────
  // ADR-009: authorize BEFORE minting. CS-GEN-001: URL not logged.
  // SECURITY: listDocumentVersions runs under withRequestContext (CLIENT SESSION_CONTEXT),
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
    return { success: false, error: "File not found or access denied." };
  }

  // ── 4. Mint signed URL for the version's storageKey (server-resolved) ────────
  // ADR-008: TTL-capped by the adapter (default 300s, max 3600s).
  // CS-GEN-001: signed URL NOT logged.
  const storage = getStorage();
  const signedUrl = await storage.getSignedDownloadUrl(authAndVersionResult.storageKey, {
    responseContentDisposition: "attachment",
  });

  // ── 5. Audit the version download-URL mint (ADR-019) ─────────────────────────
  // ADR-019: emit on SUCCESS ONLY (refusal path exits before this point — step 3).
  // DECISION: audit records document version ACCESS, keyed by parent documentId.
  //   The transient signed URL and version storageKey are NEVER included in the payload.
  //   targetId = documentId (parent document — NOT the version storageKey — CS-GEN-001).
  // CS-TS-003: mirrors apps/admin requestDownloadUrlForVersionAction audit pattern (TASK-013-007).
  // // ADR-019 // ADR-003 // ADR-009 // CS-GEN-001 // CS-TS-003 // CS-TS-004
  const versionDownloadActor: AuditActor = {
    clerkUserId: identity.clerkUserId, // ADR-019 // CS-TS-004: from verified session
    role: identity.role,
  };

  await recordAuthEvent({
    actor: versionDownloadActor,
    action: "document.download",
    targetType: "Document",
    targetId: documentId.trim(), // CS-GEN-001: parent documentId only — NOT storageKey or signed URL
    sourceSurface: "portal", // ADR-006: portal surface
  });

  // ── 6. Rewrite URL origin for browser (BUG-008-001 / BLOB_PUBLIC_ENDPOINT) ──
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
        "[portal:requestDownloadUrlForVersionAction] BLOB_PUBLIC_ENDPOINT set but could not be parsed.",
      );
    }
  }

  return {
    success: true,
    data: { url: downloadUrl, expiresAt: signedUrl.expiresAt },
  };
}

/**
 * List all documents for an engagement (client participant view).
 *
 * AC-FILE-001-04: A linked participant can see their engagement's document set.
 *   The fn_document_access FILTER (TASK-013-001) governs what the CLIENT can see.
 *
 * ADR-003: withRequestContext propagates CLIENT identity.
 * CS-TS-001: listEngagementDocuments from @tax-portal/db barrel.
 *
 * @param engagementId - The Engagement.id (from the URL route param — server-resolved).
 *
 * // ADR-003 // CS-TS-001 // CS-GEN-003 // AC-FILE-001-04
 */
export async function listDocumentsForEngagementAction(
  engagementId: string,
): Promise<ListDocumentsResult> {
  // ── 1. Identity guard (CLIENT-only, ADR-003) ──────────────────────────────────
  const identity = await getClientIdentity(); // ADR-003
  if (!identity) {
    return { success: false, error: "Unauthorized: Please sign in." };
  }

  // ── 2. Input validation ───────────────────────────────────────────────────────
  if (!engagementId?.trim()) {
    return { success: false, error: "A valid engagement ID is required." };
  }

  // ── 3. Read documents (CLIENT — FILTER limits to their engagement's docs) ─────
  // The fn_document_access FILTER (TASK-013-001) is the access gate.
  // CS-TS-001: listEngagementDocuments from @tax-portal/db barrel.
  const documents = await withRequestContext(
    identity.clerkUserId,
    identity.role,
    () => listEngagementDocuments(engagementId.trim()),
  );

  return { success: true, data: documents };
}

/**
 * List all DocumentVersion rows for a given document (client participant view).
 *
 * AC-FILE-009-03: Prior versions are retained and listed (each individually downloadable).
 *
 * ADR-003: withRequestContext propagates CLIENT identity.
 * CS-TS-001: listDocumentVersions from @tax-portal/db barrel.
 *
 * @param documentId - The parent Document id.
 *
 * // ADR-003 // CS-TS-001 // CS-GEN-003 // AC-FILE-009-03
 */
export async function listDocumentVersionsAction(
  documentId: string,
): Promise<ListDocumentVersionsResult> {
  // ── 1. Identity guard (CLIENT-only, ADR-003) ──────────────────────────────────
  const identity = await getClientIdentity(); // ADR-003
  if (!identity) {
    return { success: false, error: "Unauthorized: Please sign in." };
  }

  // ── 2. Input validation ───────────────────────────────────────────────────────
  if (!documentId?.trim()) {
    return { success: false, error: "A valid document ID is required." };
  }

  // ── 3. List versions (request pool — FILTER-governed) ────────────────────────
  const versions = await withRequestContext(
    identity.clerkUserId,
    identity.role,
    () => listDocumentVersions(documentId.trim()),
  );

  return { success: true, data: versions };
}
