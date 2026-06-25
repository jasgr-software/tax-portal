/**
 * apps/portal/src/app/messages/[threadId]/actions.ts
 *
 * Server actions for the portal (CLIENT) general-thread view — /messages/[threadId].
 *
 * TASK-017-011: Send a message in a general thread + mark it as read (CLIENT surface).
 *   Mirror of apps/admin/src/app/messages/[threadId]/actions.ts for the CLIENT role.
 *
 * Acceptance criteria:
 *   AC-MSG-002-02 — general thread visible to the accountant AND the associated client.
 *   AC-MSG-002-03 — ordered message history readable by both participants.
 *   AC-MSG-001-04 — both parties can read + contribute (CLIENT sends here).
 *   AC-MSG-005-04 — marking a thread read clears the viewer's unread indicator.
 *   AC-MSG-004-01 — sender attaches one+ files to a message (attachGeneralMessageAction).
 *   AC-MSG-004-03 — participants retrieve attachments via signed URL.
 *   AC-MSG-004-05 — attachments scanned before available; infected/indeterminate withheld.
 *
 * These actions take threadId directly (not engagementId) because general threads have no
 * engagementId. The thread is already known when the page loads (/messages/[threadId]).
 *
 * Identity guard (CS-TS-004 / ADR-003):
 *   All actions call getClientIdentity() BEFORE any DB access.
 *   Identity comes ONLY from the verified session (cookie) — never from action args.
 *   Non-CLIENT or unauthenticated callers are refused before any DB write.
 *
 * SECURITY (IDOR defence — EPIC-013 lesson):
 *   requestAttachmentUrlAction accepts only an attachmentId (never a storage key).
 *   The storage key is resolved server-side under RLS (sec.pol_MessageAttachment FILTER).
 *   A CLIENT participant of thread A CANNOT mint a URL for thread B's attachment.
 *
 * ADR-003: server-side authority — getClientIdentity() before every DB access. // ADR-003
 * ADR-005: sec.pol_Thread / pol_ThreadReadState / pol_MessageAttachment are the gates. // ADR-005
 * ADR-006: portal surface (CLIENT-facing); admin surface is the mirror. // ADR-006
 * ADR-008: signed URL only; TTL-capped; URL NEVER logged. // ADR-008
 * ADR-009: authorize-before-mint for attachment URL. // ADR-009
 * ADR-021: scan-before-available via storeAndScanAttachment. // ADR-021
 * ADR-023: new-message notification inside appendMessage. // ADR-023
 * REQ-NFR-009: attachment MUST be scanned clean before retrievable. // REQ-NFR-009
 * CS-TS-001: request-pool operations via withRequestContext; writes via @tax-portal/db barrel. // CS-TS-001
 * CS-TS-002: no raw adminDb/pool import in this file. // CS-TS-002
 * CS-TS-003: actions mirror apps/admin/src/app/messages/[threadId]/actions.ts. // CS-TS-003
 * CS-TS-004: identity from session cookie — never from args or form data. // CS-TS-004
 * CS-GEN-001: message bodies + signed URLs NEVER logged; audit payload = attachmentId only. // CS-GEN-001
 * CS-GEN-002: additive — appendMessage signature unchanged. // CS-GEN-002
 * CS-GEN-003: governing keys cited throughout. // CS-GEN-003
 */

"use server";

import { headers } from "next/headers";
import { getAuthProvider } from "@tax-portal/auth";
import {
  appendMessage,
  markThreadRead,
  withRequestContext,
  storeAndScanAttachment,
  authorizeThenSignAttachment,
} from "@tax-portal/db";
import type {
  AppendMessageResult,
  MarkThreadReadResult,
  StoreAndScanAttachmentResult,
} from "@tax-portal/db";

// ─── Result types ─────────────────────────────────────────────────────────────

export type SendGeneralMessageResult =
  | { success: true; data: AppendMessageResult }
  | { success: false; error: string };

export type MarkGeneralThreadReadResult =
  | { success: true; data: MarkThreadReadResult }
  | { success: false; error: string };

/**
 * Result of attachGeneralMessageAction.
 * AC-MSG-004-01: one attachment per call; multiple calls for multiple files.
 */
export type AttachGeneralMessageResult =
  | { success: true; data: StoreAndScanAttachmentResult }
  | { success: false; error: string };

/**
 * Result of requestAttachmentUrlAction.
 * AC-MSG-004-03: participant-scoped signed URL (TTL-capped, ADR-008).
 */
export type RequestAttachmentUrlResult =
  | { success: true; data: { url: string; expiresAt: Date } }
  | { success: false; error: string };

// ─── Identity helper ──────────────────────────────────────────────────────────

/**
 * Resolve the verified CLIENT identity from the incoming request headers.
 *
 * ADR-003: identity.role comes from the verified session (Clerk public metadata
 *   or mock session cookie) — NEVER from any server action argument or form data.
 * CS-TS-004: identity from session cookie only — never from args or form data.
 *
 * // ADR-003 // CS-TS-004
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
 * Send a plain-text message in a general thread (CLIENT surface).
 *
 * AC-MSG-001-04: Both parties can send messages in the general thread.
 *   This action handles the CLIENT side; the ACCOUNTANT mirror is in apps/admin.
 * AC-MSG-013-02: After the message is persisted, appendMessage emits a new-message
 *   notification to the ACCOUNTANT. The CLIENT sender is NEVER self-notified.
 *
 * Flow:
 *   1. getClientIdentity() — must be CLIENT (ADR-003, CS-TS-004). Refused otherwise.
 *   2. Input validation — threadId and body must be non-empty.
 *   3. appendMessage (admin pool) — inserts the Message row with verbatim body.
 *      Post-write: emitNewMessageNotifications fires inside appendMessage. // AC-MSG-013-02
 *
 * ADR-003: getClientIdentity() before any DB access. // ADR-003
 * ADR-006: portal surface (CLIENT); admin mirror in apps/admin. // ADR-006
 * CS-TS-004: identity from session only. // CS-TS-004
 * CS-GEN-001: body is NOT logged. // CS-GEN-001
 *
 * @param threadId — The Thread.id of the general thread (from URL route param).
 * @param body — The plain-text message body (stored verbatim — AC-MSG-003-01/-02).
 *
 * // ADR-003 // ADR-006 // ADR-023 // CS-TS-001 // CS-TS-002 // CS-TS-003 // CS-TS-004
 * // CS-GEN-001 // CS-GEN-002 // CS-GEN-003
 * // AC-MSG-001-04 // AC-MSG-013-02
 */
export async function sendGeneralMessageAction(
  threadId: string,
  body: string,
): Promise<SendGeneralMessageResult> {
  // ── 1. Identity guard (CLIENT-only, ADR-003, CS-TS-004) ──────────────────────
  const identity = await getClientIdentity(); // ADR-003 // CS-TS-004
  if (!identity) {
    return { success: false, error: "Unauthorized: Please sign in to send messages." };
  }

  // ── 2. Input validation ───────────────────────────────────────────────────────
  if (!threadId?.trim()) {
    return { success: false, error: "A valid thread ID is required." };
  }
  if (!body?.trim()) {
    return { success: false, error: "Message body cannot be empty." };
  }

  // ── 3. Append the message (admin pool — verbatim body) ───────────────────────
  // appendMessage stores the body VERBATIM (AC-MSG-003-01/-02 / REQ-MSG-003).
  // CS-GEN-001: body is NEVER logged here or inside appendMessage. // CS-GEN-001
  // Post-write: appendMessage emits new-message notification to the ACCOUNTANT. // AC-MSG-013-02
  let result: AppendMessageResult;
  try {
    result = await appendMessage({
      threadId: threadId.trim(),
      senderClerkId: identity.clerkUserId, // CS-TS-004: from verified session
      body: body.trim(), // AC-MSG-003-01/-02: verbatim
    });
  } catch (err: unknown) {
    // CS-GEN-001: server-level log only — do not surface internals or body. // CS-GEN-001
    console.error("[portal:general:sendGeneralMessageAction] appendMessage failed:", err);
    return { success: false, error: "Failed to send message. Please try again." };
  }

  return { success: true, data: result };
}

/**
 * Mark a general thread as read for the current CLIENT viewer.
 *
 * AC-MSG-005-04: Marking a thread read sets the viewer's lastReadAt watermark.
 *
 * markThreadRead uses the REQUEST POOL (db / SESSION_CONTEXT). The BLOCK predicate
 * on sec.pol_ThreadReadState allows only the viewing principal to write their own row.
 * A caller cannot mark another viewer's read state (fail-closed — ADR-005).
 *
 * Flow:
 *   1. getClientIdentity() — must be CLIENT (ADR-003, CS-TS-004). Refused otherwise.
 *   2. Input validation — threadId must be non-empty.
 *   3. withRequestContext(CLIENT) → markThreadRead(threadId) — request pool upsert.
 *
 * ADR-003: getClientIdentity() before any DB access. // ADR-003
 * ADR-005: sec.pol_ThreadReadState BLOCK enforces own-row write. // ADR-005
 * ADR-006: portal surface (CLIENT). // ADR-006
 * CS-TS-001: markThreadRead runs under withRequestContext (SESSION_CONTEXT). // CS-TS-001
 * CS-TS-004: identity from session only. // CS-TS-004
 *
 * @param threadId — The Thread.id (from URL route param — server-resolved).
 *
 * // ADR-003 // ADR-005 // ADR-006 // CS-TS-001 // CS-TS-002 // CS-TS-003 // CS-TS-004
 * // CS-GEN-001 // CS-GEN-003
 * // AC-MSG-005-04
 */
export async function markGeneralThreadReadAction(
  threadId: string,
): Promise<MarkGeneralThreadReadResult> {
  // ── 1. Identity guard (CLIENT-only, ADR-003, CS-TS-004) ──────────────────────
  const identity = await getClientIdentity(); // ADR-003 // CS-TS-004
  if (!identity) {
    return { success: false, error: "Unauthorized: Please sign in." };
  }

  // ── 2. Input validation ───────────────────────────────────────────────────────
  if (!threadId?.trim()) {
    return { success: false, error: "A valid thread ID is required." };
  }

  // ── 3. Mark thread read (request pool — RLS own-row write) ───────────────────
  // withRequestContext sets SESSION_CONTEXT so the BLOCK predicate on sec.pol_ThreadReadState
  // correctly resolves the CLIENT viewer's User.id and allows the own-row upsert.
  // CS-TS-001: markThreadRead from @tax-portal/db barrel via withRequestContext. // CS-TS-001
  // ADR-005: BLOCK predicate enforces own-row isolation. // ADR-005
  const result = await withRequestContext(
    identity.clerkUserId, // CS-TS-004: from verified session
    identity.role,
    () => markThreadRead(threadId.trim()), // AC-MSG-005-04
  );

  return { success: true, data: result };
}

/**
 * Attach a file to an existing general-thread message (CLIENT surface).
 *
 * AC-MSG-004-01: Sender attaches one+ files to a message.
 * AC-MSG-004-05: Attachments are scanned before available; infected/indeterminate withheld.
 *
 * Flow:
 *   1. getClientIdentity() — must be CLIENT (ADR-003, CS-TS-004). Refused otherwise.
 *   2. Input validation — messageId + threadId must be non-empty; bytes must be present.
 *   3. storeAndScanAttachment (admin pool) — store bytes → scan → set status.
 *
 * ADR-003: getClientIdentity() before any DB access. // ADR-003
 * ADR-021: scan-before-available via storeAndScanAttachment. // ADR-021
 * REQ-NFR-009: only 'clean' verdict → 'active'; 'indeterminate' → stays 'pending' (fail-closed).
 * CS-TS-004: identity from session only. // CS-TS-004
 * CS-GEN-001: file contents NOT logged. // CS-GEN-001
 *
 * @param messageId   — The Message.id to attach to (server-resolved).
 * @param threadId    — The Thread.id of the general thread (storage key scoping).
 * @param filename    — Original filename as declared by the uploader.
 * @param contentType — Declared content-type of the file.
 * @param bytes       — File bytes.
 *
 * // ADR-003 // ADR-006 // ADR-021 // REQ-NFR-009 // CS-TS-001 // CS-TS-002 // CS-TS-003
 * // CS-TS-004 // CS-GEN-001 // CS-GEN-003
 * // AC-MSG-004-01 // AC-MSG-004-05
 */
export async function attachGeneralMessageAction(
  messageId: string,
  threadId: string,
  filename: string,
  contentType: string,
  bytes: Buffer,
): Promise<AttachGeneralMessageResult> {
  // ── 1. Identity guard (CLIENT-only, ADR-003, CS-TS-004) ──────────────────────
  const identity = await getClientIdentity(); // ADR-003 // CS-TS-004
  if (!identity) {
    return { success: false, error: "Unauthorized: Please sign in to attach files." };
  }

  // ── 2. Input validation ───────────────────────────────────────────────────────
  if (!messageId?.trim()) {
    return { success: false, error: "A valid message ID is required." };
  }
  if (!threadId?.trim()) {
    return { success: false, error: "A valid thread ID is required." };
  }
  if (!filename?.trim()) {
    return { success: false, error: "A filename is required." };
  }
  if (!bytes?.length) {
    return { success: false, error: "File bytes are required." };
  }

  // ── 3. Store + scan (admin pool — storeAndScanAttachment) ───────────────────
  // REQ-NFR-009: 'indeterminate' → stays 'pending' (fail-closed, NOT a pass). // REQ-NFR-009
  // CS-GEN-001: bytes content NOT logged. // CS-GEN-001
  let result: StoreAndScanAttachmentResult;
  try {
    result = await storeAndScanAttachment({
      messageId: messageId.trim(),
      threadId: threadId.trim(),
      originalFilename: filename.trim(),
      contentType: contentType.trim(),
      bytes,
      uploadedByClerkId: identity.clerkUserId, // CS-TS-004: from verified session
    });
  } catch (err: unknown) {
    // CS-GEN-001: server-level log only — do not surface file contents. // CS-GEN-001
    console.error("[portal:general:attachGeneralMessageAction] storeAndScanAttachment failed:", err);
    return { success: false, error: "Failed to attach file. Please try again." };
  }

  return { success: true, data: result };
}

/**
 * Request a short-lived participant-scoped signed URL for a general-thread attachment (CLIENT).
 *
 * AC-MSG-004-03: Participants retrieve attachments via a short-lived participant-scoped signed URL.
 *
 * SECURITY (IDOR defence — EPIC-013 lesson):
 *   Accepts only the attachmentId (NEVER a storage key — IDOR gate).
 *   The storage key is resolved server-side under RLS (sec.pol_MessageAttachment FILTER).
 *   A CLIENT participant of thread A CANNOT mint a URL for thread B's attachment.
 *
 * Flow:
 *   1. getClientIdentity() — must be CLIENT (ADR-003, CS-TS-004). Refused otherwise.
 *   2. Input validation — attachmentId must be non-empty.
 *   3. withRequestContext(CLIENT) → authorizeThenSignAttachment (request pool, RLS-governed).
 *
 * ADR-003: getClientIdentity() before any DB access. // ADR-003
 * ADR-008: signed URL; TTL-capped; URL NEVER logged. // ADR-008
 * ADR-009: authorize-before-mint. // ADR-009
 * REQ-NFR-009: only 'active' attachments get a URL. // REQ-NFR-009
 * CS-GEN-001: signed URL NEVER logged; audit targetId = attachmentId only. // CS-GEN-001
 *
 * @param attachmentId — The MessageAttachment.id (ONLY the id — never a storage key).
 *
 * // ADR-003 // ADR-006 // ADR-008 // ADR-009 // REQ-NFR-009
 * // CS-TS-001 // CS-TS-002 // CS-TS-003 // CS-TS-004 // CS-GEN-001 // CS-GEN-003
 * // AC-MSG-004-03
 */
export async function requestAttachmentUrlAction(
  attachmentId: string,
): Promise<RequestAttachmentUrlResult> {
  // ── 1. Identity guard (CLIENT-only, ADR-003, CS-TS-004) ──────────────────────
  const identity = await getClientIdentity(); // ADR-003 // CS-TS-004
  if (!identity) {
    return { success: false, error: "Unauthorized: Please sign in." };
  }

  // ── 2. Input validation ───────────────────────────────────────────────────────
  if (!attachmentId?.trim()) {
    return { success: false, error: "A valid attachment ID is required." };
  }

  // ── 3. Authorize then sign (request pool — RLS IDOR gate) ────────────────────
  // withRequestContext sets SESSION_CONTEXT so RLS FILTER (sec.pol_MessageAttachment)
  // resolves participant access. Only a participant with status='active' gets a URL.
  // CS-TS-001: authorizeThenSignAttachment under withRequestContext. // CS-TS-001
  // ADR-008/-009: sign the server-resolved storage key after authorization. // ADR-008 // ADR-009
  // CS-GEN-001: signed URL NEVER logged. // CS-GEN-001
  const result = await withRequestContext(
    identity.clerkUserId, // CS-TS-004: from verified session
    identity.role,
    () =>
      authorizeThenSignAttachment({
        attachmentId: attachmentId.trim(),
        actor: { clerkUserId: identity.clerkUserId, role: identity.role },
      }),
  );

  if (!result.authorized) {
    if (result.reason === "not-active") {
      return {
        success: false,
        error: "Attachment is not yet available (still being scanned).",
      };
    }
    return { success: false, error: "Attachment not found or access denied." };
  }

  // CS-GEN-001: URL returned to the caller but NEVER logged here. // CS-GEN-001
  return { success: true, data: { url: result.url, expiresAt: result.expiresAt } };
}
