/**
 * apps/admin/src/app/engagements/[engagementId]/cadence-actions.ts
 *
 * Server action for the per-engagement overdue-reminder cadence override.
 *
 * TASK-019-002 / BRIEF-019 / EPIC-019
 *
 * Server action:
 *   setEngagementCadenceOverrideAction({ engagementId, reminderFrequencyDays | null })
 *     — accountant-only; writes (or clears) Engagement.reminderFrequencyDaysOverride.
 *     — null clears the override → engagement falls back to the global default.
 *
 * Acceptance criteria:
 *   AC-DASH-008-02: accountant sets per-engagement reminder frequency. // AC-DASH-008-02
 *   AC-DASH-008-03: per-engagement override takes precedence over global default. // AC-DASH-008-03
 *   AC-MSG-018-04: per-engagement frequency takes precedence. // AC-MSG-018-04
 *
 * ADR-006: This file is apps/admin ONLY. Per-engagement cadence config is accountant-only.
 *   There is NO mirror route in apps/portal. // ADR-006
 * ADR-003: identity resolved from request cookie before any DB call. // ADR-003
 * ADR-005: sec.pol_Engagement governs the request-pool path; admin pool is used here via
 *   the repository, and the server action role guard is the defence at the HTTP layer. // ADR-005
 *
 * CS-TS-004: identity resolved from request cookie + ACCOUNTANT role guard BEFORE any DB call.
 *   Mirrors the EPIC-018 notifications/actions.ts pattern. // CS-TS-004
 * CS-TS-001: write goes through setEngagementCadenceOverride which uses the admin pool
 *   inside packages/db. // CS-TS-001
 * CS-TS-002: no raw requestDb/adminDb import at this layer — all via @tax-portal/db barrel. // CS-TS-002
 * CS-GEN-001: no PII or config detail logged. // CS-GEN-001
 * CS-GEN-002: additive — new file; no existing action modified. // CS-GEN-002
 * CS-GEN-003: governing keys cited throughout. // CS-GEN-003
 *
 * // ADR-006 // CS-TS-004 // CS-TS-001 // CS-TS-002 // DECISION-019-A
 */

"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getAuthProvider } from "@tax-portal/auth";
import {
  setEngagementCadenceOverride,
  getEngagementCadenceOverride,
} from "@tax-portal/db";

// ─── Identity helper ───────────────────────────────────────────────────────────

/**
 * Resolve the ACCOUNTANT identity from the request cookie.
 *
 * CS-TS-004: reads cookie header → synthetic Request → provider.getIdentity() → role guard.
 *   Identity is NEVER derived from action arguments or form data. // CS-TS-004
 *
 * Mirrors the pattern in apps/admin/src/app/settings/reminders/actions.ts exactly.
 *
 * ADR-003: identity resolution is the first step before any DB call. // ADR-003
 * ADR-006: ACCOUNTANT guard — CLIENT identities are rejected. // ADR-006
 * CS-GEN-001: cookie value is not logged. // CS-GEN-001
 */
async function getAccountantIdentity(): Promise<{
  clerkUserId: string;
  role: "ACCOUNTANT";
} | null> {
  // CS-TS-004 step 1: read the cookie header. // CS-TS-004
  const headerStore = await headers();
  const cookieHeader = headerStore.get("cookie") ?? "";

  // CS-TS-004 step 2: construct a synthetic Request.
  const syntheticRequest = new Request("http://localhost/", {
    headers: { cookie: cookieHeader },
  });

  // CS-TS-004 step 3: call provider.getIdentity() — trust fence.
  const provider = getAuthProvider();
  const identity = await provider.getIdentity(syntheticRequest);

  // CS-TS-004 step 4: guard ACCOUNTANT role. // CS-TS-004 // ADR-006
  if (!identity || identity.role !== "ACCOUNTANT") {
    return null;
  }

  return { clerkUserId: identity.clerkUserId, role: "ACCOUNTANT" };
}

// ─── Result types ──────────────────────────────────────────────────────────────

export type SetEngagementCadenceOverrideActionResult =
  | { success: true }
  | { success: false; error: string };

export type GetEngagementCadenceOverrideActionResult =
  | { success: true; reminderFrequencyDaysOverride: number | null }
  | { success: false; error: string };

// ─── setEngagementCadenceOverrideAction ───────────────────────────────────────

/**
 * Sets (or clears) the per-engagement overdue-reminder frequency override.
 *
 * Pass reminderFrequencyDays = null to clear the override (global default resumes).
 * ACCOUNTANT role required — CLIENT or unauthenticated sessions are rejected before the write.
 *
 * AC-DASH-008-02: per-engagement frequency is recorded. // AC-DASH-008-02
 * AC-DASH-008-03: clearing the override reverts to global default. // AC-DASH-008-03
 * AC-MSG-018-04: per-engagement frequency takes precedence when set. // AC-MSG-018-04
 *
 * Security (CS-TS-004):
 *   1. Reads cookie header from the incoming request.
 *   2. Constructs a synthetic Request and calls provider.getIdentity().
 *   3. Guards the ACCOUNTANT role — bails BEFORE any DB call if absent.
 *   4. A CLIENT or unauthenticated caller is rejected immediately.
 *
 * CS-TS-001: write through setEngagementCadenceOverride (admin pool in packages/db). // CS-TS-001
 * CS-TS-002: no raw requestDb/adminDb import at this layer. // CS-TS-002
 * CS-TS-004: identity from cookie + ACCOUNTANT role guard before any DB write. // CS-TS-004
 * ADR-006: accountant-only surface (apps/admin). // ADR-006
 * DECISION-019-A: writes Engagement.reminderFrequencyDaysOverride; null clears it. // DECISION-019-A
 * CS-GEN-001: no PII or config detail logged. // CS-GEN-001
 * CS-GEN-003: governing keys cited. // CS-GEN-003
 *
 * @param engagementId - The Engagement.id (server-resolved from the route; never from client input).
 * @param reminderFrequencyDays - new override in days; null clears the override.
 */
export async function setEngagementCadenceOverrideAction(
  engagementId: string,
  reminderFrequencyDays: number | null,
): Promise<SetEngagementCadenceOverrideActionResult> {
  // CS-TS-004: resolve identity from cookie and guard ACCOUNTANT role BEFORE any DB call.
  // A CLIENT or unauthenticated caller is rejected here — never reaches the write seam.
  // // CS-TS-004 // ADR-006
  const identity = await getAccountantIdentity();
  if (!identity) {
    return { success: false, error: "Unauthorized: ACCOUNTANT identity required" };
  }

  // Input validation — engagementId must be a non-empty string (server-resolved from the route).
  if (typeof engagementId !== "string" || !engagementId.trim()) {
    return { success: false, error: "A valid engagement ID is required" };
  }

  // CS-TS-001: write through setEngagementCadenceOverride (admin pool inside packages/db). // CS-TS-001
  // CS-TS-002: no raw pool import at this layer. // CS-TS-002
  // DECISION-019-A: null clears Engagement.reminderFrequencyDaysOverride; non-null sets it. // DECISION-019-A
  await setEngagementCadenceOverride({
    engagementId: engagementId.trim(),
    reminderFrequencyDays,
  });

  // Revalidate the engagement page so the UI reflects the new override.
  revalidatePath(`/engagements/${engagementId.trim()}`);

  return { success: true };
}

// ─── getEngagementCadenceOverrideAction ───────────────────────────────────────

/**
 * Reads the per-engagement reminder frequency override.
 *
 * Returns null when no override is set.
 * ACCOUNTANT role required — CLIENT sessions are rejected.
 *
 * AC-DASH-008-02: the accountant can read the per-engagement override. // AC-DASH-008-02
 *
 * CS-TS-004: ACCOUNTANT role guard before any DB read. // CS-TS-004
 * CS-TS-001: read through getEngagementCadenceOverride (admin pool in packages/db). // CS-TS-001
 * ADR-006: accountant-only surface (apps/admin). // ADR-006
 */
export async function getEngagementCadenceOverrideAction(
  engagementId: string,
): Promise<GetEngagementCadenceOverrideActionResult> {
  // CS-TS-004: ACCOUNTANT identity guard before any DB read. // CS-TS-004
  const identity = await getAccountantIdentity();
  if (!identity) {
    return { success: false, error: "Unauthorized: ACCOUNTANT identity required" };
  }

  if (typeof engagementId !== "string" || !engagementId.trim()) {
    return { success: false, error: "A valid engagement ID is required" };
  }

  // CS-TS-001: read through getEngagementCadenceOverride (admin pool in packages/db). // CS-TS-001
  const override = await getEngagementCadenceOverride(engagementId.trim());

  return { success: true, reminderFrequencyDaysOverride: override.reminderFrequencyDaysOverride };
}
