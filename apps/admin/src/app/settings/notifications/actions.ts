/**
 * apps/admin/src/app/settings/notifications/actions.ts
 *
 * Server actions for the accountant email-notification suppression toggle.
 *
 * AC-MSG-010-01: The accountant can turn off her own email notifications entirely.
 *
 * Two server actions:
 *   setOwnEmailNudgeSuppressionAction(suppress: boolean) — write: set emailNudgeEnabled = !suppress.
 *   getOwnEmailNudgeSuppressionAction()                  — read: returns current emailNudgeEnabled.
 *
 * ADR-006: This file is apps/admin ONLY. Do NOT add any client email-settings UI. // ADR-006
 * ADR-003: SESSION_CONTEXT propagated via withRequestContext for the write seam.   // ADR-003
 * ADR-005: own-row isolation enforced by the repository WHERE clause (no pol_User BLOCK). // ADR-005
 *
 * CS-TS-004: identity resolved from request cookie + ACCOUNTANT role guard BEFORE any DB call.
 *   Mirrors getAccountantIdentity() from apps/admin/src/app/notifications/actions.ts verbatim-in-spirit.
 *   // CS-TS-004
 * CS-TS-001: write goes through withRequestContext → setEmailNudgePreferenceForCurrentUser.
 *   // CS-TS-001
 * CS-TS-003: mirrors the pattern established in apps/admin/src/app/notifications/actions.ts.
 *   // CS-TS-003
 * CS-GEN-001: no PII or secrets in log output.       // CS-GEN-001
 * CS-GEN-002: additive — new file; no existing action modified.  // CS-GEN-002
 * CS-GEN-003: governing keys cited throughout.        // CS-GEN-003
 *
 * suppress=true  → emailNudgeEnabled=false (turn off notifications)
 * suppress=false → emailNudgeEnabled=true  (turn on notifications)
 */

"use server";

import { headers } from "next/headers";
import { getAuthProvider } from "@tax-portal/auth";
import {
  withRequestContext,
  getEmailNudgePreferenceForCurrentUser,
  setEmailNudgePreferenceForCurrentUser,
} from "@tax-portal/db";

// ─── Identity helper ───────────────────────────────────────────────────────────

/**
 * Resolve the ACCOUNTANT identity from the request cookie.
 *
 * CS-TS-004: reads cookie header → synthetic Request → provider.getIdentity() → role guard.
 *   Identity is NEVER derived from action arguments or form data. // CS-TS-004
 * CS-TS-003: verbatim-in-spirit mirror of getAccountantIdentity() in
 *   apps/admin/src/app/notifications/actions.ts. // CS-TS-003
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

export type SetOwnEmailNudgeSuppressionResult =
  | { success: true }
  | { success: false; error: string };

export type GetOwnEmailNudgePreferenceResult =
  | { success: true; emailEnabled: boolean }
  | { success: false; error: string };

// ─── setOwnEmailNudgeSuppressionAction ────────────────────────────────────────

/**
 * Toggles the accountant's own email nudge suppression.
 *
 * suppress=true  → emailNudgeEnabled=false (accountant suppressed; zero emails).
 * suppress=false → emailNudgeEnabled=true  (accountant receives daily digest).
 *
 * AC-MSG-010-01: the accountant can turn off her own email notifications entirely.
 *
 * Security (CS-TS-004):
 *   1. Reads cookie header from the incoming request.
 *   2. Constructs a synthetic Request and calls provider.getIdentity().
 *   3. Guards the ACCOUNTANT role — bails BEFORE any DB call if absent.
 *   4. A CLIENT or unauthenticated caller is rejected immediately.
 *
 * Write seam (CS-TS-001):
 *   withRequestContext(clerkUserId, 'ACCOUNTANT', () => setEmailNudgePreferenceForCurrentUser(!suppress))
 *   SESSION_CONTEXT is set before the UPDATE; own-row isolation enforced by WHERE clerkId.
 *
 * ADR-003: write scoped to caller's own row via withRequestContext. // ADR-003
 * ADR-005: no sec.pol_User BLOCK — own-row isolation enforced by WHERE clause in the repo. // ADR-005
 * ADR-006: accountant-only surface (apps/admin). // ADR-006
 * CS-TS-001: write through withRequestContext wrapper. // CS-TS-001
 * CS-TS-004: identity from cookie + ACCOUNTANT role guard before any DB write. // CS-TS-004
 * CS-GEN-001: no PII in logs. // CS-GEN-001
 * CS-GEN-003: governing keys cited. // CS-GEN-003
 *
 * @param suppress - true to suppress email (turn off); false to re-enable.
 * @returns SetOwnEmailNudgeSuppressionResult — success, or failure + error string.
 */
export async function setOwnEmailNudgeSuppressionAction(
  suppress: boolean,
): Promise<SetOwnEmailNudgeSuppressionResult> {
  // CS-TS-004: resolve identity from cookie and guard ACCOUNTANT role BEFORE any DB call.
  // A CLIENT or unauthenticated caller is rejected here — never reaches the write seam.
  // // CS-TS-004 // ADR-006
  const identity = await getAccountantIdentity();
  if (!identity) {
    return { success: false, error: "Unauthorized: ACCOUNTANT identity required" };
  }

  // CS-TS-001: write through withRequestContext (SESSION_CONTEXT set before UPDATE).
  // suppress=true  → emailNudgeEnabled=false (accountant suppressed).
  // suppress=false → emailNudgeEnabled=true  (accountant re-enabled).
  // AC-MSG-010-01: turning off = suppress=true → emailNudgeEnabled=false. // AC-MSG-010-01
  // ADR-003: SESSION_CONTEXT propagated via withRequestContext. // ADR-003
  // ADR-005: own-row isolation via WHERE clerkId in setEmailNudgePreferenceForCurrentUser. // ADR-005
  // CS-TS-001: withRequestContext is the wrapper — no direct db client access. // CS-TS-001
  await withRequestContext(
    identity.clerkUserId,
    "ACCOUNTANT",
    () => setEmailNudgePreferenceForCurrentUser(!suppress),
  );

  return { success: true };
}

// ─── getOwnEmailNudgePreferenceAction ─────────────────────────────────────────

/**
 * Reads the accountant's current email-nudge preference.
 *
 * Used by the settings page to determine the initial toggle state.
 * Returns { emailEnabled: true } if the row is absent (defensive default-on per AC-MSG-011-01).
 *
 * AC-MSG-010-01: settings page shows the current suppression state. // AC-MSG-010-01
 * AC-MSG-011-01: default-on — emailNudgeEnabled defaults to true at DB level. // AC-MSG-011-01
 *
 * CS-TS-004: ACCOUNTANT role guard before any DB read. // CS-TS-004
 * CS-TS-001: read through withRequestContext (SESSION_CONTEXT set). // CS-TS-001
 * ADR-003: SESSION_CONTEXT propagated via withRequestContext. // ADR-003
 * ADR-006: accountant-only surface (apps/admin). // ADR-006
 * CS-GEN-003: governing keys cited. // CS-GEN-003
 */
export async function getOwnEmailNudgePreferenceAction(): Promise<GetOwnEmailNudgePreferenceResult> {
  // CS-TS-004: ACCOUNTANT identity guard before any DB read. // CS-TS-004
  const identity = await getAccountantIdentity();
  if (!identity) {
    return { success: false, error: "Unauthorized: ACCOUNTANT identity required" };
  }

  // CS-TS-001: read through withRequestContext (SESSION_CONTEXT set). // CS-TS-001
  // ADR-003: SESSION_CONTEXT propagated via withRequestContext. // ADR-003
  const emailEnabled = await withRequestContext(
    identity.clerkUserId,
    "ACCOUNTANT",
    () => getEmailNudgePreferenceForCurrentUser(),
  );

  return { success: true, emailEnabled };
}
