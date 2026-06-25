/**
 * apps/admin/src/app/messages/actions.ts
 *
 * Server actions for the admin (ACCOUNTANT) general-thread messaging surface.
 *
 * TASK-017-003: Start a general thread, send a message in a general thread, and mark
 *   a general thread as read — all ACCOUNTANT-only on the admin surface.
 * TASK-017-004: General-thread attach + retrieve (ACCOUNTANT guard) — scan-before-available.
 * TASK-017-010: listClientsAction — populates the StartGeneralThread client selector.
 *   createGeneralThreadForClientAction — validated wrapper: server-validates the chosen
 *   clientUserId is in the listed set before calling startGeneralThreadAction.
 *
 * Acceptance criteria:
 *   AC-MSG-001-02 — thread visible only to participants (identity guard + request pool).
 *   AC-MSG-001-04 — both parties can send messages (ACCOUNTANT surface: sendGeneralMessageAction).
 *   AC-MSG-002-01 — accountant picks a client from a populated selector + creates a general thread.
 *   AC-MSG-002-02 — thread associated with the chosen client + visible to accountant + that client.
 *   AC-MSG-004-01 — sender attaches one+ files to a message (attachGeneralMessageAction).
 *   AC-MSG-004-03 — participants retrieve attachments via signed URL (requestGeneralAttachmentUrlAction).
 *   AC-MSG-004-05 — attachments scanned before available; infected/indeterminate withheld.
 *   AC-MSG-005-04 — marking a thread read clears the viewer's unread indicator.
 *   AC-MSG-006-01 — accountant can start a general thread for a specific client.
 *   AC-MSG-013-02 — when the ACCOUNTANT sends, the CLIENT receives a new-message notification.
 *   AC-MSG-014-01 — same: ACCOUNTANT sends → CLIENT notified.
 *
 * Identity guard (CS-TS-004 / ADR-003):
 *   ALL actions call getAccountantIdentity() BEFORE any DB access.
 *   startGeneralThreadAction is ACCOUNTANT-ONLY — a CLIENT identity is refused before
 *   any DB access. No CLIENT path exists to this file (ADR-006).
 *   Identity comes ONLY from the verified session (cookie) — never from action args.
 *
 * SECURITY (TASK-017-010 / clientUserId server-validation):
 *   createGeneralThreadForClientAction fetches the client list server-side (listClients)
 *   and validates the caller-supplied clientUserId is in that set BEFORE calling
 *   startGeneralThreadAction. The clientUserId is NEVER trusted raw from the form.
 *   ADR-003: all identity and validation is server-authoritative. // ADR-003
 *
 * SECURITY (TASK-017-004 / IDOR defence — EPIC-013 lesson):
 *   requestGeneralAttachmentUrlAction accepts only an attachmentId (never a storage key).
 *   The storage key is resolved server-side under RLS (sec.pol_MessageAttachment FILTER).
 *
 * ADR-003: server-side authority — getAccountantIdentity() before every DB access. // ADR-003
 * ADR-006: admin surface ONLY — no general-thread start action exists in apps/portal. // ADR-006
 * ADR-008: signed URL only; TTL-capped; URL NEVER logged. // ADR-008
 * ADR-009: authorize-before-mint for attachment URL. // ADR-009
 * ADR-021: scan-before-available via storeAndScanAttachment (reuses EPIC-007 FileScanner). // ADR-021
 * ADR-023: new-message notification inside appendMessage. // ADR-023
 * REQ-NFR-009: attachment MUST be scanned clean before retrievable. // REQ-NFR-009
 * CS-TS-001: request-pool operations via withRequestContext; writes via @tax-portal/db barrel. // CS-TS-001
 * CS-TS-002: no raw adminDb/pool import in this file. // CS-TS-002
 * CS-TS-003: send + mark-read admin actions mirror the portal surface for general threads;
 *   startGeneralThreadAction + attach/retrieve are admin-only (no portal mirror). // CS-TS-003
 * CS-TS-004: identity from session cookie — never from args or form data. // CS-TS-004
 * CS-GEN-001: message bodies + signed URLs NEVER logged; audit = attachmentId only. // CS-GEN-001
 * CS-GEN-001: client names/emails (from listClients) are display data — NEVER logged. // CS-GEN-001
 * CS-GEN-002: additive wiring — appendMessage + createGeneralThread signatures unchanged. // CS-GEN-002
 * CS-GEN-003: governing keys cited throughout. // CS-GEN-003
 */

"use server";

import { headers } from "next/headers";
import { getAuthProvider } from "@tax-portal/auth";
import {
  appendMessage,
  markThreadRead,
  createGeneralThread,
  withRequestContext,
  storeAndScanAttachment,
  authorizeThenSignAttachment,
  listClients,
} from "@tax-portal/db";
import type {
  ThreadItem,
  AppendMessageResult,
  MarkThreadReadResult,
  StoreAndScanAttachmentResult,
  ClientItem,
} from "@tax-portal/db";

// ─── Result types ─────────────────────────────────────────────────────────────

export type StartGeneralThreadResult =
  | { success: true; data: ThreadItem }
  | { success: false; error: string };

export type SendGeneralMessageResult =
  | { success: true; data: AppendMessageResult }
  | { success: false; error: string };

export type MarkGeneralThreadReadResult =
  | { success: true; data: MarkThreadReadResult }
  | { success: false; error: string };

/**
 * Result of attachGeneralMessageAction.
 * AC-MSG-004-01: general-thread attach (ACCOUNTANT-only surface).
 */
export type AttachGeneralMessageResult =
  | { success: true; data: StoreAndScanAttachmentResult }
  | { success: false; error: string };

/**
 * Result of requestGeneralAttachmentUrlAction.
 * AC-MSG-004-03: general-thread attachment signed URL (ACCOUNTANT surface).
 */
export type RequestGeneralAttachmentUrlResult =
  | { success: true; data: { url: string; expiresAt: Date } }
  | { success: false; error: string };

/**
 * Result of listClientsAction.
 * AC-MSG-002-01: populates the StartGeneralThread client selector.
 *
 * TASK-017-010: admin-pool, RLS-exempt client list for the ACCOUNTANT selector.
 * CS-GEN-001: names/emails are display data — NEVER logged. // CS-GEN-001
 * ADR-006: admin surface only — no client-listing path in apps/portal. // ADR-006
 */
export type ListClientsResult =
  | { success: true; data: ClientItem[] }
  | { success: false; error: string };

/**
 * Result of createGeneralThreadForClientAction.
 * AC-MSG-002-01: accountant submits a server-validated clientUserId to create a general thread.
 * AC-MSG-002-02: resulting thread associated with the chosen client.
 *
 * TASK-017-010: validated wrapper around startGeneralThreadAction — server-validates
 * the chosen clientUserId against the listed set before calling startGeneralThreadAction.
 * clientUserId is NEVER trusted raw from the form (ADR-003). // ADR-003
 */
export type CreateGeneralThreadForClientResult =
  | { success: true; data: ThreadItem }
  | { success: false; error: string };

// ─── Identity helper ──────────────────────────────────────────────────────────

/**
 * Resolve the verified ACCOUNTANT identity from the incoming request headers.
 *
 * ADR-003: identity.role comes from the verified session (Clerk public metadata
 *   or mock session cookie) — NEVER from any server action argument or form data.
 * ADR-006: apps/admin only — this helper is not exported or available in apps/portal.
 * CS-TS-004: identity from session cookie only — never from args or form data.
 *
 * // ADR-003 // ADR-006 // CS-TS-004
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

// ─── Server Actions ───────────────────────────────────────────────────────────

/**
 * Start a new general (direct) thread with a client — ACCOUNTANT-only.
 *
 * AC-MSG-006-01: The accountant can initiate a general thread with a specific client.
 *
 * This action is ACCOUNTANT-ONLY. A CLIENT identity is refused before any DB access
 * (CS-TS-004 / ADR-003). No CLIENT path exists to start a general thread.
 *
 * Flow:
 *   1. getAccountantIdentity() — must be ACCOUNTANT (ADR-003, CS-TS-004). Refused otherwise.
 *   2. Input validation — clientUserId must be non-empty.
 *   3. createGeneralThread (admin pool) — inserts a new Thread row with kind='general'.
 *
 * SECURITY: clientUserId is accepted from the action args but MUST be server-resolved in
 *   the UI layer (e.g. from a DB query listing clients — never raw user input). At this
 *   layer we trust it is a valid UNIQUEIDENTIFIER; the DB FK will reject invalid values.
 *
 * ADR-003: getAccountantIdentity() before any DB access. // ADR-003
 * ADR-006: admin-ONLY — no general-thread start in apps/portal. // ADR-006
 * CS-TS-004: identity from session only; CLIENT identity refused. // CS-TS-004
 * CS-GEN-001: no PII logged. // CS-GEN-001
 *
 * @param clientUserId — The target client's User.id (server-resolved by the UI layer).
 *
 * // ADR-003 // ADR-006 // CS-TS-001 // CS-TS-002 // CS-TS-004 // CS-GEN-001 // CS-GEN-003
 * // AC-MSG-006-01
 */
async function startGeneralThreadAction(
  clientUserId: string,
): Promise<StartGeneralThreadResult> {
  // ── 1. Identity guard (ACCOUNTANT-only, ADR-003, CS-TS-004) ──────────────────
  // ACCOUNTANT-ONLY: a CLIENT identity is refused BEFORE any DB access. // CS-TS-004 // ADR-003
  const identity = await getAccountantIdentity(); // ADR-003 // CS-TS-004
  if (!identity) {
    return { success: false, error: "Unauthorized: ACCOUNTANT identity required." };
  }

  // ── 2. Input validation ───────────────────────────────────────────────────────
  if (!clientUserId?.trim()) {
    return { success: false, error: "A valid client user ID is required." };
  }

  // ── 3. Create the general thread (admin pool — server-authoritative) ───────────
  // createGeneralThread uses the admin pool (ADR-003 §7: admin-pool write).
  // clientUserId is the FK → User.id; DB rejects invalid values.
  // CS-GEN-001: no PII logged. // CS-GEN-001
  let thread: ThreadItem;
  try {
    thread = await createGeneralThread({ clientUserId: clientUserId.trim() });
  } catch (err: unknown) {
    // CS-GEN-001: server-level log only — do not surface internals to the client. // CS-GEN-001
    console.error("[admin:messages:startGeneralThreadAction] createGeneralThread failed:", err);
    return { success: false, error: "Failed to create general thread. Please try again." };
  }

  return { success: true, data: thread };
}

/**
 * Send a plain-text message in a general thread (ACCOUNTANT surface).
 *
 * AC-MSG-001-04: Both parties can send messages (ACCOUNTANT sends here).
 * AC-MSG-014-01: After the message is persisted, appendMessage emits a new-message
 *   notification to the CLIENT. The ACCOUNTANT sender is NEVER self-notified.
 *
 * Flow:
 *   1. getAccountantIdentity() — must be ACCOUNTANT (ADR-003, CS-TS-004). Refused otherwise.
 *   2. Input validation — threadId and body must be non-empty.
 *   3. appendMessage (admin pool) — inserts the Message row with verbatim body.
 *      Post-write: emitNewMessageNotifications fires inside appendMessage. // AC-MSG-014-01
 *
 * ADR-003: getAccountantIdentity() before any DB access. // ADR-003
 * ADR-006: admin surface — general threads are accountant-initiated. // ADR-006
 * CS-TS-004: identity from session only. // CS-TS-004
 * CS-GEN-001: body is NOT logged at any level. // CS-GEN-001
 *
 * @param threadId — The Thread.id of the general thread (server-resolved — never client-supplied).
 * @param body — The plain-text message body (stored verbatim — AC-MSG-003-01/-02).
 *
 * // ADR-003 // ADR-006 // ADR-023 // CS-TS-001 // CS-TS-002 // CS-TS-004
 * // CS-GEN-001 // CS-GEN-002 // CS-GEN-003
 * // AC-MSG-001-04 // AC-MSG-014-01
 */
export async function sendGeneralMessageAction(
  threadId: string,
  body: string,
): Promise<SendGeneralMessageResult> {
  // ── 1. Identity guard (ACCOUNTANT-only, ADR-003, CS-TS-004) ──────────────────
  const identity = await getAccountantIdentity(); // ADR-003 // CS-TS-004
  if (!identity) {
    return { success: false, error: "Unauthorized: ACCOUNTANT identity required." };
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
  // Post-write: appendMessage emits new-message notification to CLIENT. // AC-MSG-014-01
  let result: AppendMessageResult;
  try {
    result = await appendMessage({
      threadId: threadId.trim(),
      senderClerkId: identity.clerkUserId, // CS-TS-004: from verified session
      body: body.trim(), // AC-MSG-003-01/-02: verbatim
    });
  } catch (err: unknown) {
    // CS-GEN-001: server-level log only — do not surface internals or body. // CS-GEN-001
    console.error("[admin:messages:sendGeneralMessageAction] appendMessage failed:", err);
    return { success: false, error: "Failed to send message. Please try again." };
  }

  return { success: true, data: result };
}

/**
 * Mark a general thread as read for the current ACCOUNTANT viewer.
 *
 * AC-MSG-005-04: Marking a thread read sets the viewer's lastReadAt watermark.
 *
 * markThreadRead uses the REQUEST POOL (db / SESSION_CONTEXT). The BLOCK predicate
 * on sec.pol_ThreadReadState allows only the viewing principal to write their own row.
 *
 * Flow:
 *   1. getAccountantIdentity() — must be ACCOUNTANT (ADR-003, CS-TS-004). Refused otherwise.
 *   2. Input validation — threadId must be non-empty.
 *   3. withRequestContext(ACCOUNTANT) → markThreadRead(threadId) — request pool upsert.
 *
 * ADR-003: getAccountantIdentity() before any DB access. // ADR-003
 * ADR-005: sec.pol_ThreadReadState BLOCK enforces own-row write. // ADR-005
 * ADR-006: admin surface. // ADR-006
 * CS-TS-001: markThreadRead runs under withRequestContext (SESSION_CONTEXT). // CS-TS-001
 * CS-TS-004: identity from session only. // CS-TS-004
 *
 * @param threadId — The Thread.id to mark read (server-resolved — never client-supplied).
 *
 * // ADR-003 // ADR-005 // ADR-006 // CS-TS-001 // CS-TS-002 // CS-TS-004
 * // CS-GEN-001 // CS-GEN-003
 * // AC-MSG-005-04
 */
export async function markGeneralThreadReadAction(
  threadId: string,
): Promise<MarkGeneralThreadReadResult> {
  // ── 1. Identity guard (ACCOUNTANT-only, ADR-003, CS-TS-004) ──────────────────
  const identity = await getAccountantIdentity(); // ADR-003 // CS-TS-004
  if (!identity) {
    return { success: false, error: "Unauthorized: ACCOUNTANT identity required." };
  }

  // ── 2. Input validation ───────────────────────────────────────────────────────
  if (!threadId?.trim()) {
    return { success: false, error: "A valid thread ID is required." };
  }

  // ── 3. Mark thread read (request pool — RLS own-row write) ───────────────────
  // withRequestContext sets SESSION_CONTEXT so the BLOCK predicate on sec.pol_ThreadReadState
  // correctly resolves the ACCOUNTANT viewer's User.id and allows the own-row upsert.
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
 * Attach a file to an existing general-thread message (ACCOUNTANT surface).
 *
 * AC-MSG-004-01: Sender attaches one+ files to a message.
 * AC-MSG-004-05: Attachments are scanned before available; infected/indeterminate withheld.
 *
 * Flow:
 *   1. getAccountantIdentity() — must be ACCOUNTANT (ADR-003, CS-TS-004). Refused otherwise.
 *   2. Input validation — messageId + threadId must be non-empty; bytes must be present.
 *   3. storeAndScanAttachment (admin pool) — store bytes → scan → set status.
 *      REQ-NFR-009: only 'clean' verdict → 'active'; 'indeterminate' → stays 'pending' (fail-closed).
 *
 * ADR-003: getAccountantIdentity() before any DB access. // ADR-003
 * ADR-021: scan-before-available via storeAndScanAttachment (reuses EPIC-007 FileScanner). // ADR-021
 * REQ-NFR-009: attachment MUST be scanned clean before retrievable. // REQ-NFR-009
 * CS-TS-004: identity from session only. // CS-TS-004
 * CS-GEN-001: file contents NOT logged. // CS-GEN-001
 *
 * @param messageId   — The Message.id to attach to.
 * @param threadId    — The Thread.id of the general thread (storage key scoping).
 * @param filename    — Original filename as declared by the uploader.
 * @param contentType — Declared content-type of the file.
 * @param bytes       — File bytes.
 *
 * // ADR-003 // ADR-006 // ADR-021 // REQ-NFR-009 // CS-TS-001 // CS-TS-002
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
  // ── 1. Identity guard (ACCOUNTANT-only, ADR-003, CS-TS-004) ──────────────────
  const identity = await getAccountantIdentity(); // ADR-003 // CS-TS-004
  if (!identity) {
    return { success: false, error: "Unauthorized: ACCOUNTANT identity required." };
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
  // CS-TS-001: storeAndScanAttachment from @tax-portal/db barrel. // CS-TS-001
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
    console.error("[admin:messages:attachGeneralMessageAction] storeAndScanAttachment failed:", err);
    return { success: false, error: "Failed to attach file. Please try again." };
  }

  return { success: true, data: result };
}

/**
 * List all distinct CLIENT users for the StartGeneralThread selector — ACCOUNTANT-only.
 *
 * AC-MSG-002-01: populates the client selector so the accountant can start a general thread.
 *
 * Flow:
 *   1. getAccountantIdentity() — must be ACCOUNTANT (ADR-003, CS-TS-004). Refused otherwise.
 *   2. listClients (admin pool — RLS-exempt read of distinct CLIENT users with display identity).
 *
 * TASK-017-010: closes the gap where StartGeneralThread rendered with an empty clients list.
 * ADR-003: getAccountantIdentity() before any DB access. // ADR-003
 * ADR-006: admin surface ONLY — no client-listing path in apps/portal. // ADR-006
 * CS-TS-001: listClients from @tax-portal/db barrel (admin pool inside packages/db). // CS-TS-001
 * CS-TS-002: no raw pool import in this file. // CS-TS-002
 * CS-TS-004: identity from session only; CLIENT identity refused. // CS-TS-004
 * CS-GEN-001: client names/emails are display data — NEVER logged. // CS-GEN-001
 * EPIC-012: DECISION-E — names come from EngagementRequest, not User model. // EPIC-012
 *
 * // ADR-003 // ADR-006 // CS-TS-001 // CS-TS-002 // CS-TS-004 // CS-GEN-001 // CS-GEN-003
 * // AC-MSG-002-01 // EPIC-012
 */
export async function listClientsAction(): Promise<ListClientsResult> {
  // ── 1. Identity guard (ACCOUNTANT-only, ADR-003, CS-TS-004) ──────────────────
  // ACCOUNTANT-ONLY: a CLIENT identity is refused BEFORE any DB access. // CS-TS-004 // ADR-003
  const identity = await getAccountantIdentity(); // ADR-003 // CS-TS-004
  if (!identity) {
    return { success: false, error: "Unauthorized: ACCOUNTANT identity required." };
  }

  // ── 2. Fetch distinct CLIENT users (admin pool — RLS-exempt) ─────────────────
  // listClients: admin pool, RLS-exempt (ADR-003 §7). // CS-TS-001 // CS-TS-002
  // CS-GEN-001: names/emails returned as display data — NEVER logged here. // CS-GEN-001
  let clients: ClientItem[];
  try {
    clients = await listClients();
  } catch (err: unknown) {
    // CS-GEN-001: server-level log only — no PII. // CS-GEN-001
    console.error("[admin:messages:listClientsAction] listClients failed:", err);
    return { success: false, error: "Failed to load client list. Please try again." };
  }

  return { success: true, data: clients };
}

/**
 * Start a general thread with a server-validated clientUserId — ACCOUNTANT-only.
 *
 * AC-MSG-002-01: accountant picks a client from the populated selector + creates a thread.
 * AC-MSG-002-02: resulting thread is associated with the chosen client.
 *
 * This action wraps startGeneralThreadAction with a server-side validation step:
 * it fetches the allowed client list from listClients and asserts the supplied
 * clientUserId is in that set BEFORE calling startGeneralThreadAction.
 *
 * SECURITY: clientUserId from form data is NEVER trusted raw.
 *   The server re-derives the allowed set (listClients) and validates the choice.
 *   An id not in the listed set is rejected with an error — no DB call made.
 *   ADR-003: server-authoritative validation. // ADR-003
 *
 * Flow:
 *   1. getAccountantIdentity() — must be ACCOUNTANT (ADR-003, CS-TS-004). Refused otherwise.
 *   2. Input validation — clientUserId must be non-empty.
 *   3. listClients (admin pool) — fetch the allowed set.
 *   4. Validate: clientUserId must be in the listed set. Reject otherwise.
 *   5. startGeneralThreadAction with the validated clientUserId.
 *
 * ADR-003: getAccountantIdentity() before any DB access; clientUserId server-validated. // ADR-003
 * ADR-006: admin surface ONLY. // ADR-006
 * CS-TS-004: identity from session only. // CS-TS-004
 * CS-GEN-001: client names/emails NEVER logged. // CS-GEN-001
 *
 * @param clientUserId — The chosen client's User.id from the form (server-validated before use).
 *
 * // ADR-003 // ADR-006 // CS-TS-001 // CS-TS-002 // CS-TS-004 // CS-GEN-001 // CS-GEN-003
 * // AC-MSG-002-01 // AC-MSG-002-02 // AC-MSG-006-01
 */
export async function createGeneralThreadForClientAction(
  clientUserId: string,
): Promise<CreateGeneralThreadForClientResult> {
  // ── 1. Identity guard (ACCOUNTANT-only, ADR-003, CS-TS-004) ──────────────────
  // ACCOUNTANT-ONLY: a CLIENT identity is refused BEFORE any DB access. // CS-TS-004 // ADR-003
  const identity = await getAccountantIdentity(); // ADR-003 // CS-TS-004
  if (!identity) {
    return { success: false, error: "Unauthorized: ACCOUNTANT identity required." };
  }

  // ── 2. Input validation ───────────────────────────────────────────────────────
  if (!clientUserId?.trim()) {
    return { success: false, error: "A valid client user ID is required." };
  }
  const trimmedClientUserId = clientUserId.trim();

  // ── 3. Fetch the allowed client set (admin pool — server-authoritative) ───────
  // ADR-003: the allowed set is re-derived server-side, never taken from caller. // ADR-003
  // CS-TS-001 / CS-TS-002: listClients from @tax-portal/db barrel. // CS-TS-001 // CS-TS-002
  // CS-GEN-001: client names/emails NEVER logged. // CS-GEN-001
  let clients: ClientItem[];
  try {
    clients = await listClients();
  } catch (err: unknown) {
    // CS-GEN-001: server-level log only — no PII. // CS-GEN-001
    console.error(
      "[admin:messages:createGeneralThreadForClientAction] listClients failed:",
      err,
    );
    return { success: false, error: "Failed to validate client. Please try again." };
  }

  // ── 4. Server-side validation — clientUserId must be in the listed set ────────
  // SECURITY: clientUserId is NEVER trusted raw from form data. The server validates
  // the choice against the re-derived allowed set. A fake/injected id is rejected here.
  // ADR-003: server-authoritative validation — never trust caller input. // ADR-003
  const isAllowed = clients.some((c) => c.clientUserId === trimmedClientUserId);
  if (!isAllowed) {
    return { success: false, error: "Invalid client selection. Please try again." };
  }

  // ── 5. Create the general thread (via startGeneralThreadAction) ───────────────
  // The clientUserId is now server-validated — safe to pass to startGeneralThreadAction.
  // AC-MSG-002-01: thread created for the chosen client. // AC-MSG-002-01
  // AC-MSG-002-02: thread associated with the validated client. // AC-MSG-002-02
  const result = await startGeneralThreadAction(trimmedClientUserId);
  if (!result.success) {
    return result;
  }

  return { success: true, data: result.data };
}

/**
 * Request a short-lived signed URL for a general-thread message attachment (ACCOUNTANT surface).
 *
 * AC-MSG-004-03: Participants retrieve attachments via a short-lived participant-scoped signed URL.
 *
 * SECURITY (IDOR defence — EPIC-013 lesson):
 *   Accepts only the attachmentId (NEVER a storage key — IDOR gate).
 *   The storage key is resolved server-side under RLS (sec.pol_MessageAttachment FILTER).
 *
 * Flow:
 *   1. getAccountantIdentity() — must be ACCOUNTANT (ADR-003, CS-TS-004). Refused otherwise.
 *   2. Input validation — attachmentId must be non-empty.
 *   3. withRequestContext(ACCOUNTANT) → authorizeThenSignAttachment (request pool, RLS-governed).
 *
 * ADR-003: getAccountantIdentity() before any DB access. // ADR-003
 * ADR-008: signed URL; TTL-capped; URL NEVER logged. // ADR-008
 * ADR-009: authorize-before-mint. // ADR-009
 * REQ-NFR-009: only 'active' attachments get a URL. // REQ-NFR-009
 * CS-GEN-001: signed URL NEVER logged; audit targetId = attachmentId only. // CS-GEN-001
 *
 * @param attachmentId — The MessageAttachment.id (ONLY the id — never a storage key).
 *
 * // ADR-003 // ADR-006 // ADR-008 // ADR-009 // REQ-NFR-009
 * // CS-TS-001 // CS-TS-002 // CS-TS-004 // CS-GEN-001 // CS-GEN-003
 * // AC-MSG-004-03
 */
export async function requestGeneralAttachmentUrlAction(
  attachmentId: string,
): Promise<RequestGeneralAttachmentUrlResult> {
  // ── 1. Identity guard (ACCOUNTANT-only, ADR-003, CS-TS-004) ──────────────────
  const identity = await getAccountantIdentity(); // ADR-003 // CS-TS-004
  if (!identity) {
    return { success: false, error: "Unauthorized: ACCOUNTANT identity required." };
  }

  // ── 2. Input validation ───────────────────────────────────────────────────────
  if (!attachmentId?.trim()) {
    return { success: false, error: "A valid attachment ID is required." };
  }

  // ── 3. Authorize then sign (request pool — RLS IDOR gate) ────────────────────
  // CS-TS-001: authorizeThenSignAttachment under withRequestContext. // CS-TS-001
  // CS-GEN-001: signed URL NEVER logged; audit targetId = attachmentId only. // CS-GEN-001
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

  // CS-GEN-001: URL returned to caller but NEVER logged here. // CS-GEN-001
  return { success: true, data: { url: result.url, expiresAt: result.expiresAt } };
}
