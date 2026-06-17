/**
 * apps/admin/src/app/requests/actions.ts — Request inbox server actions (accountant-only)
 *
 * AC-DOOR-005-01: Surfaces the notification generated when a request was submitted.
 * AC-DOOR-005-02: Notification carries engagementRequestId so the UI can link to the request.
 * AC-MSG-013-01:  Accountant reads notifications of type 'new_engagement_request'.
 *
 * TASK-003-005 additions:
 * AC-DOOR-006-02: acceptRequest — moves request to 'accepted'.
 * AC-DOOR-006-03: declineRequest — moves request to 'declined'.
 * AC-DOOR-006-04: requireRole(ACCOUNTANT) guard on both actions (role server-evaluated).
 * AC-DOOR-006-05: Decide-exactly-once — AlreadyDecidedError from the repo layer.
 * AC-DOOR-007-01: Accept sends an invitation email to the prospect's contact email.
 * AC-DOOR-007-02: Invitation email body links to the client surface (PORTAL_APP_URL) with the ticket.
 * AC-DOOR-007-03: No User/account row is created at acceptance (createInvitation only; account is EPIC-004).
 * AC-DOOR-007-04: Invitation ticket persisted on the EngagementRequest (invitationTicket field).
 * AC-DOOR-008-01: Decline accepts a free-text reason from the accountant.
 * AC-DOOR-008-02: Reason emailed to the prospect's contact email.
 * AC-DOOR-008-03: Prospect has no portal account — plain email only.
 * AC-DOOR-008-04: Reason persisted on the declined EngagementRequest (declineReason field).
 *
 * ADR-003: Every read/write goes through the request-scoped `db` wrapper (withRequestContext)
 *   so SESSION_CONTEXT is set before any query. NO direct Prisma access outside that wrapper.
 *   The request pool's RLS predicate (sec.pol_Notification) enforces accountant-only visibility.
 *   The accept/decline writes use the admin pool via withAuditTransaction (the admin pool is
 *   the sanctioned path for identity-bearing mutations that co-commit the audit row — see audit.ts).
 *
 * ADR-005: The role written to SESSION_CONTEXT comes ONLY from getIdentity() (verified session)
 *   — NEVER from request body, header, or query param.
 *
 * ADR-019: accept + decline each write an append-only audit row in the same transaction as
 *   the status transition. The audit INSERT and the UPDATE commit or rollback together.
 *
 * ADR-022: outbound invitation/decline email is rate-limited via getRateLimiter() (InMemoryRateLimiter).
 *   Per-accountant-IP rate key. On rate-limit: decision IS committed (transaction already committed);
 *   only the email is suppressed. Surface a retryable error for the email.
 *
 * // DECISION (TASK-003-005): Transaction discipline — status-transition + ticket/reason +
 * // audit row are ALL committed in withAuditTransaction() BEFORE the email is sent.
 * // Email is sent AFTER the transaction commits (never on a rolled-back decision).
 * // If the email send is rate-limited or fails: the decision is already committed and
 * // cannot be lost. We return a partial-success result indicating the decision was recorded
 * // but the email was not sent. The caller can display a retryable message. This is the
 * // simplest correct behavior: the decision is idempotent (decide-once), the email is a
 * // best-effort side effect that can be retried via a future resend mechanism.
 *
 * // DECISION (TASK-003-003): getNotifications and markNotificationRead go through the
 * // request pool (via withRequestContext + listNotifications/markNotificationRead from
 * // @tax-portal/db) — NOT the admin pool. This ensures sec.pol_Notification's FILTER
 * // predicate is exercised (accountant-only read, ADR-005). The admin pool bypasses RLS
 * // and would return notifications to ANY caller — using the request pool is the correct,
 * // fail-closed pattern.
 *
 * // DECISION (TASK-003-005): Rate-limit key is 'admin:decision-email' keyed by accountant
 * // clerkUserId (not source IP) because: (a) this is an admin-initiated action, not a
 * // public endpoint; (b) the accountant is a single trusted user, so per-user keying
 * // is the meaningful boundary; (c) rate-limiting is anti-abuse for outbound email
 * // (ADR-022), not brute-force auth protection. Using source IP would be overly restrictive
 * // if the accountant's IP changes (e.g., VPN). The same InMemoryRateLimiter singleton
 * // is reused (per ADR-022 §2 single-process constraint documented in the runbook).
 */

"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getAuthProvider, getPortalAppUrl, getRateLimiter, buildRateLimitKey } from "@tax-portal/auth";
import { getEmailProvider } from "@tax-portal/email";
import {
  withRequestContext,
  listNotifications,
  markNotificationRead,
  getEngagementRequest,
  acceptEngagementRequest,
  declineEngagementRequest,
  AlreadyDecidedError,
  recordAuthEvent,
  withAuditTransaction,
} from "@tax-portal/db";
import type { NotificationItem } from "@tax-portal/db";

// ─── Result types ─────────────────────────────────────────────────────────────

export type NotificationsResult =
  | { success: true; data: NotificationItem[] }
  | { success: false; error: string };

export type MarkReadResult =
  | { success: true; id: string }
  | { success: false; error: string };

/**
 * Result of an accept/decline decision action.
 *
 * On full success: { success: true, emailSent: true }
 * On decision-committed but email rate-limited: { success: true, emailSent: false, emailError: string }
 *   — the decision is recorded; caller can offer a retry for the email.
 * On already-decided: { success: false, error: 'already_decided' }
 * On auth failure: { success: false, error: 'unauthorized' }
 * On input error: { success: false, error: string }
 */
export type DecisionResult =
  | { success: true; emailSent: true }
  | { success: true; emailSent: false; emailError: string }
  | { success: false; error: string };

// ─── Identity helper ──────────────────────────────────────────────────────────

/**
 * Resolve the verified accountant identity from the incoming request headers.
 *
 * Mirrors apps/admin/src/app/services/actions.ts — builds a synthetic Request from the
 * incoming cookies so the auth binding can extract the session.
 *
 * Returns null if no identity is found or the role is not ACCOUNTANT.
 *
 * ADR-005: identity.role comes from the verified session (Clerk public metadata
 * or mock session cookie) — NEVER from any server action argument or form data.
 */
async function getAccountantIdentity(): Promise<{
  clerkUserId: string;
  role: "ACCOUNTANT" | "CLIENT";
} | null> {
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
 * Fetch all notifications visible to the authenticated accountant.
 *
 * AC-DOOR-005-01: Surfaces the notification generated when a request was submitted.
 * AC-DOOR-005-02: Each notification carries engagementRequestId for the request link.
 * AC-MSG-013-01:  Returns notifications of type 'new_engagement_request'.
 *
 * Uses the request pool (withRequestContext) — sec.pol_Notification enforces
 * accountant-only visibility at the SQL Server layer (ADR-005).
 *
 * @returns NotificationsResult — success + NotificationItem[], or failure + error message
 */
export async function getNotificationsAction(): Promise<NotificationsResult> {
  const identity = await getAccountantIdentity();
  if (!identity) {
    return { success: false, error: "Unauthorized: ACCOUNTANT identity required" };
  }

  // DECISION (TASK-003-003): withRequestContext sets SESSION_CONTEXT so the
  // request pool's RLS FILTER predicate (sec.pol_Notification) restricts visibility
  // to ACCOUNTANT only. listNotifications() uses db (request pool).
  const data = await withRequestContext(
    identity.clerkUserId,
    identity.role,
    () => listNotifications(),
  );

  return { success: true, data };
}

/**
 * Mark a notification as read.
 *
 * Uses the request pool (withRequestContext) — sec.pol_Notification's BLOCK
 * predicate allows updates only for ACCOUNTANT (ADR-005).
 *
 * @param notificationId - The notification ID to mark as read
 * @returns MarkReadResult — success + id, or failure + error message
 */
export async function markNotificationReadAction(
  notificationId: string,
): Promise<MarkReadResult> {
  const identity = await getAccountantIdentity();
  if (!identity) {
    return { success: false, error: "Unauthorized: ACCOUNTANT identity required" };
  }

  if (!notificationId) {
    return { success: false, error: "Notification id is required" };
  }

  const result = await withRequestContext(
    identity.clerkUserId,
    identity.role,
    () => markNotificationRead(notificationId),
  );

  return { success: true, id: result.id };
}

// ─── Decision Actions (TASK-003-005) ─────────────────────────────────────────

/**
 * Accept a pending engagement request.
 *
 * Flow:
 *   1. Verify ACCOUNTANT identity (requireRole guard — AC-DOOR-006-04).
 *   2. Validate requestId is present.
 *   3. Fetch the request details (prospect email) inside the request context.
 *   4. In a single withAuditTransaction:
 *      a. acceptEngagementRequest(id, ticket) — status→accepted, ticket persisted (AC-DOOR-007-04).
 *         Throws AlreadyDecidedError if already decided (AC-DOOR-006-05).
 *      b. createInvitation(email, 'CLIENT') — role server-set (ADR-001/ADR-005).
 *         No User/account row created (AC-DOOR-007-03 — account is EPIC-004).
 *      c. recordAuthEvent audit row (ADR-019).
 *   5. After transaction commits: rate-limit check + send invitation email (AC-DOOR-007-01/-02).
 *   6. revalidatePath('/requests') so the list re-fetches with the updated status.
 *
 * // DECISION (TASK-003-005): createInvitation is called INSIDE the transaction because
 * // the ticket must be available to persist to EngagementRequest.invitationTicket in the
 * // same transaction. The mock createInvitation is synchronous-safe and the real Clerk
 * // call has no DB side effects, so it can run inside the mssql Transaction context.
 * // If Clerk fails, the transaction rolls back (no partial state). This is the correct
 * // transaction discipline: we'd rather lose the invitation attempt than commit a
 * // status=accepted row with no ticket attached.
 *
 * // DECISION (TASK-003-005): For the "no account before sign-up" assertion (AC-DOOR-007-03):
 * // this action only calls createInvitation() on the auth provider — which issues an
 * // invitation token, NOT a User row. The User/account row is created only when the invited
 * // prospect acts on the invitation and completes sign-up (EPIC-004). This is enforced
 * // by the auth provider seam: MockAuthProvider.createInvitation returns { email, role, ticket }
 * // with no side effect on the User table. ClerkAuthProvider.createInvitation similarly
 * // creates a Clerk invitation (deferred account), not a full Clerk user.
 *
 * @param requestId - The engagement request ID to accept.
 * @returns DecisionResult — success (+ emailSent flag) or failure.
 *
 * AC-DOOR-006-02 — moves request to accepted.
 * AC-DOOR-006-04 — ACCOUNTANT only.
 * AC-DOOR-006-05 — decide-once (AlreadyDecidedError).
 * AC-DOOR-007-01 — invitation email sent.
 * AC-DOOR-007-02 — invitation links to client surface (PORTAL_APP_URL).
 * AC-DOOR-007-03 — no account created.
 * AC-DOOR-007-04 — ticket persisted on the request.
 * ADR-019 — audit row.
 * ADR-022 — outbound email rate-limited.
 */
export async function acceptRequest(requestId: string): Promise<DecisionResult> {
  // ── 1. Identity guard (AC-DOOR-006-04) ────────────────────────────────────
  const identity = await getAccountantIdentity();
  if (!identity) {
    return { success: false, error: "Unauthorized: ACCOUNTANT identity required" };
  }

  // ── 2. Input validation ───────────────────────────────────────────────────
  if (!requestId) {
    return { success: false, error: "Request ID is required" };
  }

  // ── 3. Fetch request details (prospect email) via the request context ─────
  // Needed to send the invitation email AFTER the transaction commits.
  const requestRecord = await withRequestContext(
    identity.clerkUserId,
    identity.role,
    () => getEngagementRequest(requestId),
  );
  if (!requestRecord) {
    return { success: false, error: "Request not found" };
  }

  const prospectEmail = requestRecord.email;
  const prospectName = `${requestRecord.firstName} ${requestRecord.lastName}`.trim();

  // ── 4. Transaction: status→accepted + ticket + audit (ADR-019 §3) ─────────
  // withAuditTransaction opens an mssql Transaction on the admin pool.
  // Both acceptEngagementRequest and recordAuthEvent are bound to this transaction.
  // createInvitation runs inside the transaction (see DECISION above).

  let ticket: string;

  try {
    await withAuditTransaction(async (txn) => {
      // Issue the CLIENT invitation (role is server-set — ADR-001/ADR-005)
      // AC-DOOR-007-03: createInvitation does NOT create a User row.
      const authProvider = getAuthProvider();
      const invitation = await authProvider.createInvitation(prospectEmail, "CLIENT");
      ticket = invitation.ticket;

      // Status transition → 'accepted' + persist ticket (AC-DOOR-007-04)
      // Throws AlreadyDecidedError if status is not pending/awaiting_review (AC-DOOR-006-05)
      await acceptEngagementRequest(requestId, ticket, txn);

      // Audit row (ADR-019): accept is a security-significant action
      await recordAuthEvent({
        actor: { clerkUserId: identity.clerkUserId, role: identity.role },
        action: "engagement_request.accepted",
        targetType: "EngagementRequest",
        targetId: requestId,
        sourceSurface: "admin",
        outcome: "success",
        transaction: txn,
      });
    });
  } catch (err) {
    if (err instanceof AlreadyDecidedError) {
      return { success: false, error: "already_decided" };
    }
    throw err;
  }

  // ── 5. After transaction commits: rate-limit + send invitation email ───────
  // DECISION (TASK-003-005): Email sent AFTER transaction commit. If email fails,
  // the decision is already committed (cannot be lost). Return partial success.

  const rateLimiter = getRateLimiter();
  const rateLimitKey = buildRateLimitKey(identity.clerkUserId, "admin:decision-email");
  const rlResult = rateLimiter.consume(rateLimitKey);

  if (!rlResult.allowed) {
    // Decision committed; email blocked by rate limiter.
    // DECISION (TASK-003-005): Record the skip in the return value. The caller
    // can surface a retry message. The decision stands — the accountant can use
    // a future resend mechanism. The rate limiter is reset per invocation for tests.
    return {
      success: true,
      emailSent: false,
      emailError: `Rate limited — invitation email not sent. Retry after ${Math.ceil((rlResult.retryAfterMs ?? 60_000) / 1000)}s.`,
    };
  }

  // Build the invitation email linking to the CLIENT surface sign-up (ADR-010)
  // AC-DOOR-007-02: invitation directs recipient to create their own account on the client surface.
  const portalAppUrl = getPortalAppUrl();
  const signUpUrl = `${portalAppUrl}/sign-up?ticket=${encodeURIComponent(ticket!)}`;

  const emailProvider = getEmailProvider();
  try {
    await emailProvider.send({
      to: prospectEmail,
      subject: "You've been invited to the tax portal",
      text:
        `Hi ${prospectName},\n\n` +
        `Your engagement request has been accepted. Please create your account using the link below:\n\n` +
        `${signUpUrl}\n\n` +
        `This invitation is specific to you and tied to your engagement request.\n\n` +
        `If you did not submit a tax services request, please disregard this email.\n\n` +
        `Thank you.`,
    });
  } catch (emailErr) {
    // Email failed post-commit. Decision is safe. Return partial success.
    const errMsg = emailErr instanceof Error ? emailErr.message : String(emailErr);
    return {
      success: true,
      emailSent: false,
      emailError: `Decision recorded; invitation email failed to send: ${errMsg}`,
    };
  }

  // Revalidate the requests list so the UI reflects the new status
  revalidatePath("/requests");
  revalidatePath(`/requests/${requestId}`);

  return { success: true, emailSent: true };
}

/**
 * Decline a pending engagement request with a free-text reason.
 *
 * Flow:
 *   1. Verify ACCOUNTANT identity (requireRole guard — AC-DOOR-006-04).
 *   2. Validate requestId + reason.
 *   3. Fetch the request details (prospect email) inside the request context.
 *   4. In a single withAuditTransaction:
 *      a. declineEngagementRequest(id, reason) — status→declined, reason persisted.
 *         Throws AlreadyDecidedError if already decided (AC-DOOR-006-05).
 *      b. recordAuthEvent audit row (ADR-019).
 *   5. After transaction commits: rate-limit check + send decline-reason email (AC-DOOR-008-02/-03).
 *   6. revalidatePath('/requests').
 *
 * AC-DOOR-006-03 — moves request to declined.
 * AC-DOOR-006-04 — ACCOUNTANT only.
 * AC-DOOR-006-05 — decide-once.
 * AC-DOOR-008-01 — free-text reason accepted.
 * AC-DOOR-008-02 — reason emailed to contact email.
 * AC-DOOR-008-03 — prospect has no account (plain email only).
 * AC-DOOR-008-04 — reason persisted on the request.
 * ADR-019 — audit row.
 * ADR-022 — outbound email rate-limited.
 */
export async function declineRequest(
  requestId: string,
  reason: string,
): Promise<DecisionResult> {
  // ── 1. Identity guard (AC-DOOR-006-04) ────────────────────────────────────
  const identity = await getAccountantIdentity();
  if (!identity) {
    return { success: false, error: "Unauthorized: ACCOUNTANT identity required" };
  }

  // ── 2. Input validation ───────────────────────────────────────────────────
  if (!requestId) {
    return { success: false, error: "Request ID is required" };
  }
  if (!reason || !reason.trim()) {
    return { success: false, error: "Decline reason is required" };
  }

  // ── 3. Fetch request details (prospect email) via the request context ─────
  const requestRecord = await withRequestContext(
    identity.clerkUserId,
    identity.role,
    () => getEngagementRequest(requestId),
  );
  if (!requestRecord) {
    return { success: false, error: "Request not found" };
  }

  const prospectEmail = requestRecord.email;
  const prospectName = `${requestRecord.firstName} ${requestRecord.lastName}`.trim();

  // ── 4. Transaction: status→declined + reason + audit ─────────────────────
  try {
    await withAuditTransaction(async (txn) => {
      // Status transition → 'declined' + persist reason (AC-DOOR-008-04)
      // Throws AlreadyDecidedError if already decided (AC-DOOR-006-05)
      await declineEngagementRequest(requestId, reason.trim(), txn);

      // Audit row (ADR-019): decline is a security-significant action
      await recordAuthEvent({
        actor: { clerkUserId: identity.clerkUserId, role: identity.role },
        action: "engagement_request.declined",
        targetType: "EngagementRequest",
        targetId: requestId,
        sourceSurface: "admin",
        outcome: "success",
        transaction: txn,
      });
    });
  } catch (err) {
    if (err instanceof AlreadyDecidedError) {
      return { success: false, error: "already_decided" };
    }
    throw err;
  }

  // ── 5. After transaction commits: rate-limit + send decline email ──────────
  // DECISION (TASK-003-005): See acceptRequest — same email-after-transaction pattern.
  // AC-DOOR-008-03: the prospect has no portal account; plain email delivery only.

  const rateLimiter = getRateLimiter();
  const rateLimitKey = buildRateLimitKey(identity.clerkUserId, "admin:decision-email");
  const rlResult = rateLimiter.consume(rateLimitKey);

  if (!rlResult.allowed) {
    return {
      success: true,
      emailSent: false,
      emailError: `Rate limited — decline email not sent. Retry after ${Math.ceil((rlResult.retryAfterMs ?? 60_000) / 1000)}s.`,
    };
  }

  const emailProvider = getEmailProvider();
  try {
    await emailProvider.send({
      to: prospectEmail,
      subject: "Update on your tax portal engagement request",
      text:
        `Hi ${prospectName},\n\n` +
        `Thank you for your interest in our tax services. After review, we are unable to accept your engagement request at this time.\n\n` +
        `Reason: ${reason.trim()}\n\n` +
        `We appreciate you reaching out and hope to assist you in the future.\n\n` +
        `Best regards.`,
    });
  } catch (emailErr) {
    const errMsg = emailErr instanceof Error ? emailErr.message : String(emailErr);
    return {
      success: true,
      emailSent: false,
      emailError: `Decision recorded; decline email failed to send: ${errMsg}`,
    };
  }

  // Revalidate the requests list
  revalidatePath("/requests");
  revalidatePath(`/requests/${requestId}`);

  return { success: true, emailSent: true };
}
