/**
 * apps/admin/src/app/notifications/actions.ts — Accountant notification server actions
 *
 * EPIC-016 / TASK-016-006: Accountant notification feed + badge + mark-read-on-view.
 *
 * Three per-principal actions for the ACCOUNTANT notification feed on apps/admin:
 *   1. getMyUnreadCountAction        — fetches the ACCOUNTANT's unread notification count
 *   2. markNotificationOnViewAction  — marks notifications for a linked item as read
 *                                      (fires when the accountant views a linked item)
 *
 * CS-TS-004: every action resolves identity from the request cookie (not action args)
 *   and guards the ACCOUNTANT role before any DB call. // CS-TS-004
 * CS-TS-001: all DB reads/writes go through the @tax-portal/db withRequestContext wrapper
 *   (SESSION_CONTEXT set before any query — ADR-003 §2). // CS-TS-001
 * CS-GEN-001: no PII, secrets, or linked-item keys in log output. // CS-GEN-001
 * CS-GEN-002: additive — existing getNotificationsAction / markNotificationReadAction in
 *   apps/admin/src/app/requests/actions.ts are NOT modified. // CS-GEN-002
 * CS-GEN-003: governing keys cited throughout. // CS-GEN-003
 * CS-TS-003: mirrors apps/portal/src/app/notifications/actions.ts pattern (same shape,
 *   ACCOUNTANT role guard instead of CLIENT). // CS-TS-003
 *
 * ADR-003: SESSION_CONTEXT propagated via withRequestContext for all reads/writes.
 * ADR-005: sec.pol_Notification RLS FILTER (read) and BLOCK predicate (write) are
 *   the enforcement boundaries — no WHERE clause added in the repository (ADR-005).
 * ADR-006: This file is apps/admin only (accountant-facing surface). // ADR-006
 * ADR-023: real-time transport consumed in AccountantNotificationBadgeClient; this file
 *   is the data-access boundary only. // ADR-023
 *
 * AC-MSG-017-01/-02/-03: badge count served by getMyUnreadCountAction.
 * AC-MSG-015-02/-03: markNotificationOnViewAction fires on linked-item view, no dismiss.
 * AC-MSG-013-03: document-upload notification counted in the ACCOUNTANT's unread count.
 */

"use server";

import { headers } from "next/headers";
import { getAuthProvider } from "@tax-portal/auth";
import {
  withRequestContext,
  countUnreadNotifications,
  markNotificationsReadByLinkedItem,
} from "@tax-portal/db";

// ─── Identity helper ───────────────────────────────────────────────────────────

/**
 * Resolve the ACCOUNTANT identity from the request cookie.
 *
 * CS-TS-004: reads cookie header → synthetic Request → provider.getIdentity() → role guard.
 *   Identity is NEVER derived from action arguments or form data. // CS-TS-004
 *
 * ADR-003: identity resolution is the first step before any DB call.
 * ADR-005: role comes from the verified session only. // ADR-005
 * ADR-006: ACCOUNTANT guard — CLIENT identities are rejected. // ADR-006
 * CS-GEN-001: cookie value is not logged. // CS-GEN-001
 */
async function getAccountantIdentity(): Promise<{
  clerkUserId: string;
  role: "ACCOUNTANT";
} | null> {
  // CS-TS-004 step 1: read the cookie header from the incoming request.
  const headerStore = await headers();
  const cookieHeader = headerStore.get("cookie") ?? "";

  // CS-TS-004 step 2: construct a synthetic Request (the auth provider reads cookies from it).
  const syntheticRequest = new Request("http://localhost/", {
    headers: { cookie: cookieHeader },
  });

  // CS-TS-004 step 3: call provider.getIdentity() — this is the trust fence.
  const provider = getAuthProvider();
  const identity = await provider.getIdentity(syntheticRequest);

  // CS-TS-004 step 4: guard the ACCOUNTANT role — bail if absent or wrong role.
  // ADR-006: this is an accountant-only surface. A CLIENT session is rejected. // ADR-006
  if (!identity || identity.role !== "ACCOUNTANT") {
    return null;
  }

  return { clerkUserId: identity.clerkUserId, role: "ACCOUNTANT" };
}

// ─── Result types ──────────────────────────────────────────────────────────────

export type GetMyUnreadCountResult =
  | { success: true; unreadCount: number }
  | { success: false; error: string };

export type MarkNotificationOnViewResult =
  | { success: true; markedCount: number }
  | { success: false; error: string };

// ─── getMyUnreadCountAction ───────────────────────────────────────────────────

/**
 * Returns the authenticated ACCOUNTANT's unread notification count.
 *
 * Derived count (readAt IS NULL under SESSION_CONTEXT), not a stored counter.
 * Used by the persistent nav badge (AC-MSG-017-01/-02).
 *
 * Includes all ACCOUNTANT-scoped notification types:
 *   - new_engagement_request (AC-MSG-013-01)
 *   - onboarding_completed (AC-MSG-013-04)
 *   - document_uploaded (AC-MSG-013-03) — new in TASK-016-006
 *
 * AC-MSG-017-01/-02: badge shows the ACCOUNTANT's unread count.
 * AC-MSG-013-03: document_uploaded notifications counted in the ACCOUNTANT's unread total.
 * ADR-003: runs under withRequestContext(ACCOUNTANT identity) — SESSION_CONTEXT set.
 * ADR-005: FILTER scopes count to ACCOUNTANT's visible notifications.
 * CS-TS-001: DB access via withRequestContext → countUnreadNotifications. // CS-TS-001
 * CS-TS-004: identity resolved from cookie before any DB call. // CS-TS-004
 * CS-TS-003: mirrors apps/portal/src/app/notifications/actions.ts getMyUnreadCountAction. // CS-TS-003
 */
export async function getMyUnreadCountAction(): Promise<GetMyUnreadCountResult> {
  // CS-TS-004: cookie identity guard first.
  const identity = await getAccountantIdentity();
  if (!identity) {
    return { success: false, error: "Unauthorized: ACCOUNTANT identity required" };
  }

  // CS-TS-001: request-scoped count under ACCOUNTANT SESSION_CONTEXT. // CS-TS-001
  // ADR-003 §2: withRequestContext sets SESSION_CONTEXT before the query.
  // ADR-005: FILTER predicate scopes to this ACCOUNTANT's notifications — no app-layer filter.
  // AC-MSG-013-03: document_uploaded notifications are included in the ACCOUNTANT's RLS-scoped count.
  const unreadCount = await withRequestContext(
    identity.clerkUserId,
    identity.role,
    () => countUnreadNotifications(),
  );

  return { success: true, unreadCount };
}

// ─── markNotificationOnViewAction ────────────────────────────────────────────

/**
 * Marks all unread notifications for a linked item as read by the ACCOUNTANT.
 *
 * Called automatically when the ACCOUNTANT views the linked item (e.g. an engagement page,
 * a document upload page, a request detail). There is NO dismiss button — AC-MSG-015-03.
 * The action fires from the linked-item view page, not from a user-initiated dismiss affordance.
 *
 * Runs under the ACCOUNTANT's SESSION_CONTEXT so the RLS BLOCK predicate governs the UPDATE:
 * an ACCOUNTANT can only mark notifications they are entitled to read — even if a different
 * linkedItemId is somehow supplied, the BLOCK predicate is the enforcement boundary (ADR-005).
 *
 * Idempotent: already-read notifications are excluded by the WHERE (readAt IS NULL).
 * A repeat call for the same linked item is a safe no-op.
 *
 * SECURITY: linkedItemType and linkedItemId are validated server-side before the DB call.
 *   They are not trusted as RLS bypass material — the BLOCK predicate is the gate (ADR-005).
 *   The ACCOUNTANT's identity comes ONLY from the request cookie (CS-TS-004).
 *
 * AC-MSG-015-02: viewing the linked item marks the notification read automatically.
 * AC-MSG-015-03: no dismiss button — mark-read fires on view, not on a user action.
 * ADR-003: runs under withRequestContext(ACCOUNTANT identity) — SESSION_CONTEXT set.
 * ADR-005: BLOCK predicate is the enforcement boundary on UPDATE (not app-layer).
 * CS-TS-001: DB write via withRequestContext → markNotificationsReadByLinkedItem. // CS-TS-001
 * CS-TS-004: identity resolved from cookie, ACCOUNTANT role guarded, before DB call. // CS-TS-004
 * CS-GEN-001: linkedItemId is not logged (it may carry a document or engagement key). // CS-GEN-001
 * CS-TS-003: mirrors apps/portal/src/app/notifications/actions.ts markNotificationOnViewAction. // CS-TS-003
 */
export async function markNotificationOnViewAction(input: {
  linkedItemType: string;
  linkedItemId: string;
}): Promise<MarkNotificationOnViewResult> {
  // CS-TS-004 steps 1–4: resolve identity from cookie, guard ACCOUNTANT role before DB call.
  const identity = await getAccountantIdentity();
  if (!identity) {
    // CS-TS-004: bail before the DB call if ACCOUNTANT identity is absent.
    return { success: false, error: "Unauthorized: ACCOUNTANT identity required" };
  }

  // Input validation: reject empty/missing linked-item keys before any DB call.
  // (The BLOCK predicate is the enforcement boundary, but we fail fast on clearly invalid input.)
  if (!input.linkedItemType || !input.linkedItemId) {
    return { success: false, error: "linkedItemType and linkedItemId are required" };
  }

  // CS-TS-001: write goes through withRequestContext (SESSION_CONTEXT set; BLOCK predicate active).
  // ADR-003 §2: withRequestContext sets SESSION_CONTEXT before markNotificationsReadByLinkedItem.
  // ADR-005: BLOCK predicate governs the UPDATE — ACCOUNTANT can only mark their own rows.
  // CS-GEN-001: do NOT log input.linkedItemId (may carry a document or engagement key). // CS-GEN-001
  const { markedCount } = await withRequestContext(
    identity.clerkUserId,
    identity.role,
    // CS-TS-001: markNotificationsReadByLinkedItem uses the db wrapper. // CS-TS-001
    () =>
      markNotificationsReadByLinkedItem({
        linkedItemType: input.linkedItemType,
        linkedItemId: input.linkedItemId,
        // SECURITY FIX (F2): scope the updateMany to ACCOUNTANT-scoped rows only.
        // Prevents an ACCOUNTANT mark-read from flipping CLIENT-scoped rows when the
        // linkedItemId is shared (e.g. a request row that generates both CLIENT + ACCOUNTANT notifs).
        // AC-MSG-014-07 // ADR-005
        recipientType: "ACCOUNTANT",
      }),
  );

  return { success: true, markedCount };
}
