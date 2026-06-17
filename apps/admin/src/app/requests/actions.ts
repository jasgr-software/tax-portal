/**
 * apps/admin/src/app/requests/actions.ts — Request inbox server actions (accountant-only)
 *
 * AC-DOOR-005-01: Surfaces the notification generated when a request was submitted.
 * AC-DOOR-005-02: Notification carries engagementRequestId so the UI can link to the request.
 * AC-MSG-013-01:  Accountant reads notifications of type 'new_engagement_request'.
 *
 * ADR-003: Every read/write goes through the request-scoped `db` wrapper (withRequestContext)
 *   so SESSION_CONTEXT is set before any query. NO direct Prisma access outside that wrapper.
 *   The request pool's RLS predicate (sec.pol_Notification) enforces accountant-only visibility.
 *
 * ADR-005: The role written to SESSION_CONTEXT comes ONLY from getIdentity() (verified session)
 *   — NEVER from request body, header, or query param.
 *
 * Identity provenance (mirrors apps/admin/src/app/services/actions.ts):
 *   1. Reconstruct a minimal Request from the incoming headers (cookies).
 *   2. Call provider.getIdentity(syntheticRequest) → verified Identity (clerkUserId, role).
 *   3. Guard: identity must exist and role must be 'ACCOUNTANT'.
 *   4. Call withRequestContext(identity.clerkUserId, identity.role, () => repo call).
 *
 * // DECISION (TASK-003-003): getNotifications and markNotificationRead go through the
 * // request pool (via withRequestContext + listNotifications/markNotificationRead from
 * // @tax-portal/db) — NOT the admin pool. This ensures sec.pol_Notification's FILTER
 * // predicate is exercised (accountant-only read, ADR-005). The admin pool bypasses RLS
 * // and would return notifications to ANY caller — using the request pool is the correct,
 * // fail-closed pattern.
 */

"use server";

import { headers } from "next/headers";
import { getAuthProvider } from "@tax-portal/auth";
import {
  withRequestContext,
  listNotifications,
  markNotificationRead,
} from "@tax-portal/db";
import type { NotificationItem } from "@tax-portal/db";

// ─── Result types ─────────────────────────────────────────────────────────────

export type NotificationsResult =
  | { success: true; data: NotificationItem[] }
  | { success: false; error: string };

export type MarkReadResult =
  | { success: true; id: string }
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
