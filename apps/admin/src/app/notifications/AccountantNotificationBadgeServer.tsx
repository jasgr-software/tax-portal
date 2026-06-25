/**
 * apps/admin/src/app/notifications/AccountantNotificationBadgeServer.tsx
 *
 * Server component that fetches the initial unread count and renders the
 * AccountantNotificationBadgeClient for authenticated ACCOUNTANT sessions.
 *
 * DECISION (TASK-016-006): The root layout covers all admin routes.
 * This server component gates the badge on ACCOUNTANT identity — it returns null for
 * unauthenticated or CLIENT sessions (badge is ACCOUNTANT-only on apps/admin).
 * ADR-010: all admin routes require ACCOUNTANT auth; badge is always shown post-auth.
 * // ADR-006 // ADR-010 // DECISION-016-006-A
 *
 * Workflow:
 *   1. Resolve ACCOUNTANT identity from the request cookie (CS-TS-004 guard).
 *   2. If no ACCOUNTANT session → return null (badge absent for non-ACCOUNTANT sessions).
 *   3. Fetch the initial unread count under the ACCOUNTANT SESSION_CONTEXT.
 *   4. Render AccountantNotificationBadgeClient with the initial count.
 *      The client component then subscribes to real-time events for live updates.
 *
 * AC-MSG-017-01: badge visible from any area — mounted in the root admin layout.
 * AC-MSG-017-02: badge shows the ACCOUNTANT's unread count (server-fetched initial value).
 * AC-MSG-017-03: badge updates on events — handled by AccountantNotificationBadgeClient.
 * AC-MSG-012-03: real-time arrival increments badge — handled by AccountantNotificationBadgeClient.
 * AC-MSG-013-03: document_uploaded counted in the ACCOUNTANT's unread total.
 *
 * ADR-003: initial count fetched under ACCOUNTANT SESSION_CONTEXT via withRequestContext.
 * CS-TS-001: DB access via getMyUnreadCountAction (withRequestContext wrapper). // CS-TS-001
 * CS-TS-004: identity guard in getMyUnreadCountAction. // CS-TS-004
 * CS-TS-003: mirrors portal NotificationBadgeServer — one platform, two surfaces. // CS-TS-003
 * CS-GEN-001: no PII logged here. // CS-GEN-001
 * CS-GEN-003: governing keys cited. // CS-GEN-003
 */

import { headers } from "next/headers";
import { getAuthProvider } from "@tax-portal/auth";
import { getMyUnreadCountAction } from "./actions";
import { AccountantNotificationBadgeClient } from "./AccountantNotificationBadgeClient";

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * AccountantNotificationBadgeServer — server-rendered gate for the ACCOUNTANT badge.
 *
 * Returns null for non-ACCOUNTANT sessions (CLIENT or unauthenticated).
 * For authenticated ACCOUNTANTs, fetches the initial unread count and renders the
 * client component that subscribes to real-time updates.
 *
 * AC-MSG-017-01: persistent badge in admin navigation — caller mounts this in layout.
 * ADR-003: initial count fetched under ACCOUNTANT SESSION_CONTEXT.
 * CS-TS-004: identity resolved from cookie (guard inside getMyUnreadCountAction). // CS-TS-004
 * CS-TS-003: mirrors portal NotificationBadgeServer pattern. // CS-TS-003
 */
export async function AccountantNotificationBadgeServer() {
  // Resolve ACCOUNTANT identity from the request cookie.
  // CS-TS-004: same pattern as getAccountantIdentity() in actions.ts.
  // ADR-003: trust fence — identity from cookie, not from URL or request body. // ADR-003
  // CS-GEN-001: do not log the cookie value. // CS-GEN-001
  const headerStore = await headers();
  const cookieHeader = headerStore.get("cookie") ?? "";
  const syntheticRequest = new Request("http://localhost/", {
    headers: { cookie: cookieHeader },
  });

  let isAccountant = false;
  try {
    const provider = getAuthProvider();
    const identity = await provider.getIdentity(syntheticRequest);
    if (identity?.role === "ACCOUNTANT") {
      isAccountant = true;
    }
  } catch {
    // Auth provider threw (e.g. invalid cookie) — treat as unauthenticated.
    // CS-GEN-001: do not log the cookie or identity value. // CS-GEN-001
    return null;
  }

  // Not authenticated as an ACCOUNTANT — return null (badge is absent).
  // DECISION-016-006-A: badge only for ACCOUNTANTs on apps/admin (mirrors portal CLIENT-only).
  // ADR-010: this surface only admits ACCOUNTANTs; this guard is defense-in-depth. // ADR-010
  if (!isAccountant) {
    return null;
  }

  // Fetch the initial unread count for this ACCOUNTANT.
  // CS-TS-001: getMyUnreadCountAction → withRequestContext → countUnreadNotifications. // CS-TS-001
  // CS-TS-004: identity guard inside getMyUnreadCountAction. // CS-TS-004
  // AC-MSG-013-03: document_uploaded notifications included in the ACCOUNTANT's RLS-scoped count.
  const countResult = await getMyUnreadCountAction();
  const initialUnreadCount = countResult.success ? countResult.unreadCount : 0;

  // Render the client component with the server-fetched initial state.
  // CS-GEN-001: no sensitive identity data passed to the client — only the count. // CS-GEN-001
  // CS-TS-003: AccountantNotificationBadgeClient mirrors portal NotificationBadgeClient. // CS-TS-003
  return (
    <AccountantNotificationBadgeClient
      initialUnreadCount={initialUnreadCount}
    />
  );
}
