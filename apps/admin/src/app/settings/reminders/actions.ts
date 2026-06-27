/**
 * apps/admin/src/app/settings/reminders/actions.ts
 *
 * Server actions for the global overdue-reminder cadence setting.
 *
 * TASK-019-002 / BRIEF-019 / EPIC-019
 *
 * Two server actions:
 *   setGlobalDefaultCadenceAction({ reminderFrequencyDays }) — write: update the singleton ReminderSetting row.
 *   getGlobalDefaultCadenceAction()                          — read: return current reminderFrequencyDays.
 *
 * Acceptance criteria:
 *   AC-DASH-008-01: accountant can set the global default reminder frequency; it is recorded. // AC-DASH-008-01
 *   AC-MSG-018-03: overdue reminders raised at that frequency by default across engagements. // AC-MSG-018-03
 *
 * ADR-006: This file is apps/admin ONLY. Cadence configuration is accountant-only. // ADR-006
 * ADR-003: SESSION_CONTEXT propagated via admin pool for cadence writes (admin path). // ADR-003
 * ADR-005: sec.pol_ReminderSetting blocks client reads/writes on the request pool;
 *   the server action role guard is the defence at the HTTP layer. // ADR-005
 *
 * CS-TS-004: identity resolved from request cookie + ACCOUNTANT role guard BEFORE any DB call.
 *   Mirrors the EPIC-018 pattern in apps/admin/src/app/settings/notifications/actions.ts verbatim.
 *   // CS-TS-004
 * CS-TS-001: writes go through getGlobalDefaultCadence / setGlobalDefaultCadence which use
 *   the admin pool inside packages/db (no raw pool import at the action layer). // CS-TS-001
 * CS-TS-002: no raw requestDb/adminDb import here — all via @tax-portal/db barrel. // CS-TS-002
 * CS-GEN-001: no PII or config detail logged. // CS-GEN-001
 * CS-GEN-002: additive — new file; no existing action modified. // CS-GEN-002
 * CS-GEN-003: governing keys cited throughout. // CS-GEN-003
 *
 * // ADR-006 // CS-TS-004 // CS-TS-001 // CS-TS-002 // DECISION-019-B
 */

"use server";

import { headers } from "next/headers";
import { getAuthProvider } from "@tax-portal/auth";
import {
  getGlobalDefaultCadence,
  setGlobalDefaultCadence,
} from "@tax-portal/db";

// ─── Identity helper ───────────────────────────────────────────────────────────

/**
 * Resolve the ACCOUNTANT identity from the request cookie.
 *
 * CS-TS-004: reads cookie header → synthetic Request → provider.getIdentity() → role guard.
 *   Identity is NEVER derived from action arguments or form data. // CS-TS-004
 * CS-TS-003: verbatim-in-spirit mirror of the EPIC-018 notifications/actions.ts pattern. // CS-TS-003
 *
 * ADR-003: identity resolution is the first step before any DB call. // ADR-003
 * ADR-005: role comes from the verified session only. // ADR-005
 * ADR-006: ACCOUNTANT guard — CLIENT identities are rejected. // ADR-006
 * CS-GEN-001: cookie value is not logged. // CS-GEN-001
 */
async function getAccountantIdentity(): Promise<{
  clerkUserId: string;
  role: "ACCOUNTANT";
} | null> {
  // CS-TS-004 step 1: read the cookie header from the incoming request. // CS-TS-004
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

export type SetGlobalDefaultCadenceActionResult =
  | { success: true }
  | { success: false; error: string };

export type GetGlobalDefaultCadenceActionResult =
  | { success: true; reminderFrequencyDays: number }
  | { success: false; error: string };

// ─── setGlobalDefaultCadenceAction ────────────────────────────────────────────

/**
 * Sets the global default overdue-reminder frequency (in days).
 *
 * Writes to the singleton ReminderSetting row via the @tax-portal/db barrel.
 * ACCOUNTANT role required — CLIENT or unauthenticated sessions are rejected before the write.
 *
 * AC-DASH-008-01: the global default is recorded and applies where no override exists. // AC-DASH-008-01
 * AC-MSG-018-03: overdue reminders raised at this frequency by default. // AC-MSG-018-03
 *
 * Security (CS-TS-004):
 *   1. Reads cookie header from the incoming request.
 *   2. Constructs a synthetic Request and calls provider.getIdentity().
 *   3. Guards the ACCOUNTANT role — bails BEFORE any DB call if absent.
 *   4. A CLIENT or unauthenticated caller is rejected immediately.
 *
 * CS-TS-001: write goes through setGlobalDefaultCadence which uses admin pool inside packages/db. // CS-TS-001
 * CS-TS-002: no raw requestDb/adminDb import at this layer. // CS-TS-002
 * CS-TS-004: identity from cookie + ACCOUNTANT role guard before any DB write. // CS-TS-004
 * ADR-006: accountant-only surface (apps/admin). // ADR-006
 * DECISION-019-B: singleton ReminderSetting write. // DECISION-019-B
 * CS-GEN-001: no PII or config detail logged. // CS-GEN-001
 * CS-GEN-003: governing keys cited. // CS-GEN-003
 *
 * @param reminderFrequencyDays - new global default cadence in days (positive integer).
 */
export async function setGlobalDefaultCadenceAction(
  reminderFrequencyDays: number,
): Promise<SetGlobalDefaultCadenceActionResult> {
  // CS-TS-004: resolve identity from cookie and guard ACCOUNTANT role BEFORE any DB call.
  // A CLIENT or unauthenticated caller is rejected here — never reaches the write seam.
  // // CS-TS-004 // ADR-006
  const identity = await getAccountantIdentity();
  if (!identity) {
    return { success: false, error: "Unauthorized: ACCOUNTANT identity required" };
  }

  // CS-TS-001: write through the @tax-portal/db barrel (setGlobalDefaultCadence uses admin pool
  //   inside packages/db). // CS-TS-001 // CS-TS-002
  // DECISION-019-B: updates the singleton ReminderSetting row. // DECISION-019-B
  await setGlobalDefaultCadence({ reminderFrequencyDays });

  return { success: true };
}

// ─── getGlobalDefaultCadenceAction ────────────────────────────────────────────

/**
 * Reads the current global default overdue-reminder frequency.
 *
 * Used by the settings page to determine the initial cadence value.
 * ACCOUNTANT role required — CLIENT sessions are rejected.
 *
 * AC-DASH-008-01: the accountant can read the global default frequency. // AC-DASH-008-01
 *
 * CS-TS-004: ACCOUNTANT role guard before any DB read. // CS-TS-004
 * CS-TS-001: read through getGlobalDefaultCadence which uses admin pool in packages/db. // CS-TS-001
 * ADR-006: accountant-only surface (apps/admin). // ADR-006
 * CS-GEN-003: governing keys cited. // CS-GEN-003
 */
export async function getGlobalDefaultCadenceAction(): Promise<GetGlobalDefaultCadenceActionResult> {
  // CS-TS-004: ACCOUNTANT identity guard before any DB read. // CS-TS-004
  const identity = await getAccountantIdentity();
  if (!identity) {
    return { success: false, error: "Unauthorized: ACCOUNTANT identity required" };
  }

  // CS-TS-001: read through getGlobalDefaultCadence (admin pool in packages/db). // CS-TS-001
  const cadence = await getGlobalDefaultCadence();

  return { success: true, reminderFrequencyDays: cadence.reminderFrequencyDays };
}
