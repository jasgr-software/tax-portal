/**
 * apps/portal/src/app/notifications/_components/NotificationBadgeServer.tsx
 *
 * Server component that fetches the initial unread count and renders the
 * NotificationBadgeClient for authenticated CLIENTs.
 *
 * DECISION (TASK-016-005): The root layout covers both public and private routes.
 * This server component gates the badge on CLIENT identity — it returns null for
 * unauthenticated or ACCOUNTANT sessions (badge is CLIENT-only on apps/portal).
 * // ADR-006 // ADR-010 // DECISION-016-005-D
 *
 * Workflow:
 *   1. Resolve CLIENT identity from the request cookie (CS-TS-004 guard).
 *   2. If no CLIENT session → return null (badge is absent for guests).
 *   3. Fetch the initial unread count under the CLIENT SESSION_CONTEXT.
 *   4. Render NotificationBadgeClient with the initial count and clerkUserId.
 *      The client component then subscribes to real-time events for live updates.
 *
 * AC-MSG-017-01: badge visible from any area — mounted in the root layout.
 * AC-MSG-017-02: badge shows the CLIENT's unread count (server-fetched initial value).
 * AC-MSG-017-03: badge updates on events — handled by NotificationBadgeClient.
 * AC-MSG-012-03: real-time arrival increments badge — handled by NotificationBadgeClient.
 *
 * ADR-003: initial count fetched under CLIENT SESSION_CONTEXT via withRequestContext.
 * CS-TS-001: DB access via getMyUnreadCountAction (withRequestContext wrapper). // CS-TS-001
 * CS-TS-004: identity guard in getMyUnreadCountAction. // CS-TS-004
 * CS-GEN-001: clerkUserId passed as prop (session-derived); not logged here. // CS-GEN-001
 * CS-GEN-003: governing keys cited. // CS-GEN-003
 */

import { headers } from "next/headers";
import { getAuthProvider } from "@tax-portal/auth";
import { getMyUnreadCountAction } from "../actions";
import { NotificationBadgeClient } from "./NotificationBadgeClient";

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * NotificationBadgeServer — server-rendered gate for the real-time notification badge.
 *
 * Returns null for non-CLIENT sessions (public routes, unauthenticated, ACCOUNTANT).
 * For authenticated CLIENTs, fetches the initial unread count and renders the client
 * component that subscribes to real-time updates.
 *
 * AC-MSG-017-01: persistent badge in navigation — caller mounts this in layout.
 * ADR-003: initial count fetched under CLIENT SESSION_CONTEXT.
 * CS-TS-004: identity resolved from cookie (guard inside getMyUnreadCountAction). // CS-TS-004
 */
export async function NotificationBadgeServer() {
  // Resolve CLIENT identity from the request cookie.
  // CS-TS-004: identity is from verified session only (same pattern as getClientIdentity()
  //   inside actions.ts). We do a lightweight check here before calling getMyUnreadCountAction.
  // ADR-003: trust fence — identity from cookie, not from URL or request body.
  const headerStore = await headers();
  const cookieHeader = headerStore.get("cookie") ?? "";
  const syntheticRequest = new Request("http://localhost/", {
    headers: { cookie: cookieHeader },
  });

  let clerkUserId: string | null = null;
  try {
    const provider = getAuthProvider();
    const identity = await provider.getIdentity(syntheticRequest);
    if (identity?.role === "CLIENT") {
      clerkUserId = identity.clerkUserId;
    }
  } catch {
    // Auth provider threw (e.g. invalid cookie) — treat as unauthenticated.
    // CS-GEN-001: do not log the cookie value. // CS-GEN-001
    return null;
  }

  // Not authenticated as a CLIENT — return null (badge is absent).
  // DECISION-016-005-D: badge only for CLIENTs on apps/portal.
  if (!clerkUserId) {
    return null;
  }

  // Fetch the initial unread count for this CLIENT.
  // CS-TS-001: getMyUnreadCountAction → withRequestContext → countUnreadNotifications. // CS-TS-001
  // CS-TS-004: identity guard inside getMyUnreadCountAction. // CS-TS-004
  const countResult = await getMyUnreadCountAction();
  const initialUnreadCount = countResult.success ? countResult.unreadCount : 0;

  // Render the client component with the server-fetched initial state.
  // CS-GEN-001: clerkUserId is passed as a prop (session-derived); not logged. // CS-GEN-001
  return (
    <NotificationBadgeClient
      initialUnreadCount={initialUnreadCount}
      clerkUserId={clerkUserId}
    />
  );
}
