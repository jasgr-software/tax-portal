/**
 * apps/portal/src/app/notifications/actions.ts — Client notification server actions
 *
 * Three per-principal actions for the CLIENT notification feed on apps/portal:
 *   1. getMyNotificationsAction     — fetches the CLIENT's notifications (newest-first)
 *   2. getMyUnreadCountAction       — fetches the CLIENT's unread notification count
 *   3. markNotificationOnViewAction — marks notifications for a linked item as read
 *                                     (fires when the client views a linked item)
 *
 * CS-TS-004: every action resolves identity from the request cookie (not action args)
 *   and guards the CLIENT role before any DB call. // CS-TS-004
 * CS-TS-001: all DB reads/writes go through the @tax-portal/db withRequestContext wrapper
 *   (SESSION_CONTEXT set before any query — ADR-003 §2). // CS-TS-001
 * CS-GEN-001: no PII, secrets, or linked-item keys in log output. // CS-GEN-001
 * CS-GEN-003: governing keys cited throughout. // CS-GEN-003
 *
 * ADR-003: SESSION_CONTEXT propagated via withRequestContext for all reads/writes.
 * ADR-005: sec.pol_Notification RLS FILTER (read) and BLOCK predicate (write) are
 *   the enforcement boundaries — no WHERE clause added in the repository (ADR-005).
 * ADR-006: This file is apps/portal only (client-facing surface). // ADR-006
 * ADR-023: real-time transport consumed elsewhere (NotificationBadgeClient); this file
 *   is the data-access boundary only.
 *
 * AC-MSG-017-01/-02/-03: badge count served by getMyUnreadCountAction.
 * AC-MSG-015-02/-03: markNotificationOnViewAction fires on linked-item view, no dismiss.
 * AC-MSG-007-03: feed presence verified by getMyNotificationsAction returning notifications.
 */

"use server";

import { headers } from "next/headers";
import { getAuthProvider } from "@tax-portal/auth";
import {
  withRequestContext,
  listNotifications,
  countUnreadNotifications,
  markNotificationsReadByLinkedItem,
} from "@tax-portal/db";
import type { NotificationItem } from "@tax-portal/db";

// ─── Identity helper ───────────────────────────────────────────────────────────

/**
 * Resolve the CLIENT identity from the request cookie.
 *
 * CS-TS-004: reads cookie header → synthetic Request → provider.getIdentity() → role guard.
 *   Identity is NEVER derived from action arguments or form data. // CS-TS-004
 *
 * ADR-003: identity resolution is the first step before any DB call.
 * ADR-001: role comes from the verified session only.
 */
async function getClientIdentity(): Promise<{
  clerkUserId: string;
  role: "CLIENT";
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

  // CS-TS-004 step 4: guard the CLIENT role — bail if absent or wrong role.
  if (!identity || identity.role !== "CLIENT") {
    return null;
  }

  return { clerkUserId: identity.clerkUserId, role: "CLIENT" };
}

// ─── Result types ──────────────────────────────────────────────────────────────

export type GetMyNotificationsResult =
  | { success: true; notifications: NotificationItem[] }
  | { success: false; error: string };

export type GetMyUnreadCountResult =
  | { success: true; unreadCount: number }
  | { success: false; error: string };

export type MarkNotificationOnViewResult =
  | { success: true; markedCount: number }
  | { success: false; error: string };

// ─── getMyNotificationsAction ─────────────────────────────────────────────────

/**
 * Returns the authenticated CLIENT's notifications (newest-first).
 *
 * Fetches under the CLIENT's SESSION_CONTEXT so sec.pol_Notification FILTER scopes
 * the result to the viewing principal's own notifications. A null SESSION_CONTEXT
 * would return ZERO rows (fail-closed, ADR-003 §5).
 *
 * AC-MSG-007-01/-02: feed is authoritative and complete per viewing principal.
 * AC-MSG-007-03: presence of these notifications verified here (feed is the record).
 * ADR-003: runs under withRequestContext(CLIENT identity) — SESSION_CONTEXT set.
 * ADR-005: FILTER does isolation — no app-layer WHERE added.
 * CS-TS-001: DB access via withRequestContext → listNotifications (packages/db). // CS-TS-001
 * CS-TS-004: identity resolved from cookie before any DB call. // CS-TS-004
 */
export async function getMyNotificationsAction(): Promise<GetMyNotificationsResult> {
  // CS-TS-004: cookie identity guard — must complete before any DB call.
  const identity = await getClientIdentity();
  if (!identity) {
    return { success: false, error: "Unauthorized: CLIENT identity required" };
  }

  // CS-TS-001: request-scoped read under CLIENT SESSION_CONTEXT via the packages/db wrapper.
  // ADR-003: withRequestContext sets SESSION_CONTEXT before the listNotifications() call.
  // ADR-005: FILTER predicate scopes to this CLIENT's notifications — no app-layer filter added.
  const notifications = await withRequestContext(
    identity.clerkUserId,
    identity.role,
    // CS-TS-001: listNotifications uses the db wrapper (SESSION_CONTEXT set). // CS-TS-001
    () => listNotifications(),
  );

  return { success: true, notifications };
}

// ─── getMyUnreadCountAction ───────────────────────────────────────────────────

/**
 * Returns the authenticated CLIENT's unread notification count.
 *
 * Derived count (readAt IS NULL under SESSION_CONTEXT), not a stored counter.
 * Used by the persistent nav badge (AC-MSG-017-02).
 *
 * AC-MSG-017-02: badge shows the count of the CLIENT's unread notifications.
 * ADR-003: runs under withRequestContext(CLIENT identity) — SESSION_CONTEXT set.
 * ADR-005: FILTER scopes count to this CLIENT's visible notifications.
 * CS-TS-001: DB access via withRequestContext → countUnreadNotifications. // CS-TS-001
 * CS-TS-004: identity resolved from cookie before any DB call. // CS-TS-004
 */
export async function getMyUnreadCountAction(): Promise<GetMyUnreadCountResult> {
  // CS-TS-004: cookie identity guard first.
  const identity = await getClientIdentity();
  if (!identity) {
    return { success: false, error: "Unauthorized: CLIENT identity required" };
  }

  // CS-TS-001: request-scoped count under CLIENT SESSION_CONTEXT. // CS-TS-001
  // ADR-003 §2: withRequestContext sets SESSION_CONTEXT before the query.
  const unreadCount = await withRequestContext(
    identity.clerkUserId,
    identity.role,
    () => countUnreadNotifications(),
  );

  return { success: true, unreadCount };
}

// ─── markNotificationOnViewAction ────────────────────────────────────────────

/**
 * Marks all unread notifications for a linked item as read by the CLIENT.
 *
 * Called automatically when the CLIENT views the linked item (e.g. an engagement page,
 * a document page). There is NO dismiss button — AC-MSG-015-03. The action fires from
 * the linked-item view page, not from a user-initiated dismiss affordance.
 *
 * Runs under the CLIENT's SESSION_CONTEXT so the RLS BLOCK predicate governs the UPDATE:
 * a CLIENT can only mark their own notifications read — even if a different linkedItemId
 * is somehow supplied, the BLOCK predicate is the enforcement boundary (ADR-005).
 *
 * Idempotent: already-read notifications are excluded by the WHERE (readAt IS NULL).
 * A repeat call for the same linked item is a safe no-op.
 *
 * SECURITY: linkedItemType and linkedItemId are validated server-side before the DB call.
 *   They are not trusted as RLS bypass material — the BLOCK predicate is the gate (ADR-005).
 *   The CLIENT's identity comes ONLY from the request cookie (CS-TS-004).
 *
 * AC-MSG-015-02: viewing the linked item marks the notification read automatically.
 * AC-MSG-015-03: no dismiss button — mark-read fires on view, not on a user action.
 * ADR-003: runs under withRequestContext(CLIENT identity) — SESSION_CONTEXT set.
 * ADR-005: BLOCK predicate is the enforcement boundary on UPDATE (not app-layer).
 * CS-TS-001: DB write via withRequestContext → markNotificationsReadByLinkedItem. // CS-TS-001
 * CS-TS-004: identity resolved from cookie, CLIENT role guarded, before any DB call. // CS-TS-004
 * CS-GEN-001: linkedItemId is not logged (it may carry an engagement key). // CS-GEN-001
 */
export async function markNotificationOnViewAction(input: {
  linkedItemType: string;
  linkedItemId: string;
}): Promise<MarkNotificationOnViewResult> {
  // CS-TS-004 steps 1–4: resolve identity from cookie, guard CLIENT role before DB call.
  const identity = await getClientIdentity();
  if (!identity) {
    // CS-TS-004: bail before the DB call if CLIENT identity is absent.
    return { success: false, error: "Unauthorized: CLIENT identity required" };
  }

  // Input validation: reject empty/missing linked-item keys before any DB call.
  // (The BLOCK predicate is the enforcement boundary, but we fail fast on clearly invalid input.)
  if (!input.linkedItemType || !input.linkedItemId) {
    return { success: false, error: "linkedItemType and linkedItemId are required" };
  }

  // CS-TS-001: write goes through withRequestContext (SESSION_CONTEXT set; BLOCK predicate active).
  // ADR-003 §2: withRequestContext sets SESSION_CONTEXT before markNotificationsReadByLinkedItem.
  // ADR-005: BLOCK predicate governs the UPDATE — CLIENT can only mark their own rows.
  // CS-GEN-001: do NOT log input.linkedItemId (may carry an engagement key). // CS-GEN-001
  const { markedCount } = await withRequestContext(
    identity.clerkUserId,
    identity.role,
    // CS-TS-001: markNotificationsReadByLinkedItem uses the db wrapper. // CS-TS-001
    () =>
      markNotificationsReadByLinkedItem({
        linkedItemType: input.linkedItemType,
        linkedItemId: input.linkedItemId,
      }),
  );

  return { success: true, markedCount };
}
