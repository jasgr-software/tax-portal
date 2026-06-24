/**
 * apps/admin/src/app/engagements/[engagementId]/documents/retention-actions.ts
 *
 * Server actions for the accountant purge-confirm + legal-hold place/lift surface.
 * TASK-015-003 / BRIEF-015 / EPIC-015 — post-retention destructive lifecycle.
 *
 * Acceptance criteria:
 *   AC-FILE-013-02 — Purge is accountant/admin-only; no client-facing path initiates or requests a purge.
 *   AC-FILE-013-03 — The accountant is required to explicitly confirm a purge before any data is permanently removed.
 *   AC-FILE-014-01 — The accountant can place a legal hold on an individual engagement.
 *   AC-FILE-014-05 — The accountant can lift a legal hold on an engagement or client.
 *
 * ADR-003: Every action verifies getAccountantIdentity() BEFORE any DB write.
 *   Actor for ADR-019 audit event comes ONLY from the verified session — never
 *   from action args, form data, or client-supplied role.
 * ADR-006: These actions exist ONLY in apps/admin — no mirror in apps/portal.
 *   (CS-TS-003 mirror obligation: the portal absence is e2e-proven by TASK-015-004.)
 * ADR-018 §5/§6: Purge is admin-pool, accountant-confirmed, NEVER automatic.
 *   Legal hold suspends purge indefinitely; hold/lift are accountant-only.
 * ADR-019: Purge + hold place/lift are audited events; actor = verified session.
 *
 * // ADR-003: server-side authority — getAccountantIdentity() before every DB write
 * // ADR-006: admin surface only (apps/admin) — no mirror in apps/portal; CS-TS-003
 * // ADR-018 §5/§6: purge confirmed + never automatic; hold suspends indefinitely
 * // ADR-019: audit actor from verified session only
 * // CS-TS-001: all DB calls via @tax-portal/db barrel
 * // CS-TS-002: no direct adminDb/pool import — seam calls via @tax-portal/db barrel
 * // CS-TS-003: purge/hold surface is admin-only; portal absence proven by TASK-015-004
 * // CS-TS-004: identity from session cookie, never from args/form data; rejects non-ACCOUNTANT
 * // CS-GEN-001: no PII logged; targetId = engagementId/holdId only
 * // CS-GEN-003: cite governing authority in comments
 */

"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getAuthProvider } from "@tax-portal/auth";
import {
  purgeEngagement,
  placeLegalHold,
  liftLegalHold,
} from "@tax-portal/db";
import type {
  AuditActor,
  PurgeEngagementResult,
  PlaceLegalHoldResult,
  LiftLegalHoldResult,
  LegalHoldItem,
  PurgeEligibilityResult,
} from "@tax-portal/db";

// Re-export types for use in components
export type {
  PurgeEligibilityResult,
  LegalHoldItem,
};

// ─── Result types ─────────────────────────────────────────────────────────────

export type PurgeEngagementActionResult =
  | { success: true; data: PurgeEngagementResult }
  | { success: false; error: string };

export type PlaceLegalHoldActionResult =
  | { success: true; data: PlaceLegalHoldResult }
  | { success: false; error: string };

export type LiftLegalHoldActionResult =
  | { success: true; data: LiftLegalHoldResult }
  | { success: false; error: string };

// ─── Identity helper ──────────────────────────────────────────────────────────

/**
 * Resolve the verified accountant identity from the incoming request headers.
 *
 * ADR-003: identity.role comes from the verified session (Clerk public metadata
 *   or mock session cookie) — NEVER from any server action argument or form data.
 *   The trust fence is this guard; the BLOCK predicate is defence-in-depth only.
 * ADR-006: apps/admin only — this helper is not exported or available in apps/portal.
 * CS-TS-004: identity from session cookie only — never from args or form data.
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
 * Purge an engagement's data (accountant-only, requires explicit confirmation).
 *
 * AC-FILE-013-02: Purge is accountant/admin-only; no client-facing path initiates or requests a purge.
 * AC-FILE-013-03: Explicit confirmation is required — no data removed without it.
 *   The action receives an explicit confirmation signal and only passes confirmed: true
 *   when that signal is present and valid. A missing or invalid confirmation → no purge.
 *   Irreversible destruction must NOT be one-click.
 *
 * Flow:
 *   1. getAccountantIdentity() — ACCOUNTANT-only (CS-TS-004). Rejects non-accountant.
 *   2. Input validation.
 *   3. Explicit confirmation guard — confirmation must be truthy (AC-FILE-013-03 / ADR-018 §5).
 *      Only then pass confirmed: true to purgeEngagement.
 *   4. purgeEngagement(admin pool, confirmed: true) — ADR-018 §5 / ADR-019.
 *   5. revalidatePath — refresh the documents page.
 *
 * ADR-003: identity guard before any write (CS-TS-004). NEVER-AUTOMATIC (ADR-018 §5).
 * ADR-006: apps/admin ONLY — no purge action/route in apps/portal (AC-FILE-013-02).
 * ADR-018 §5: confirmed = true required; no destruction without explicit accountant confirmation.
 * ADR-019: 'engagement.purged' audit event emitted inside purgeEngagement (actor from verified session).
 * CS-TS-001: purgeEngagement from @tax-portal/db barrel (admin pool).
 * CS-TS-003: portal exposes NO purge affordance; verified by TASK-015-004 portal e2e.
 * CS-TS-004: identity from session cookie only; rejects CLIENT role (AC-FILE-013-02).
 * CS-GEN-001: no PII logged; targetId = engagementId in audit row.
 *
 * @param engagementId - The Engagement.id (server-resolved route param).
 * @param confirmation - Explicit confirmation signal from the UI (must be truthy — AC-FILE-013-03).
 *
 * // ADR-003 // ADR-006 // ADR-018 §5/§6 // ADR-019 // CS-TS-001 // CS-TS-003 // CS-TS-004 // CS-GEN-001 // CS-GEN-003
 * // AC-FILE-013-02 // AC-FILE-013-03
 */
export async function purgeEngagementAction(
  engagementId: string,
  confirmation: boolean,
): Promise<PurgeEngagementActionResult> {
  // ── 1. Identity guard (ACCOUNTANT-only, ADR-003, CS-TS-004) ──────────────────
  // CS-TS-004: identity from verified session only — rejects null and CLIENT role.
  // AC-FILE-013-02: non-ACCOUNTANT identity → reject BEFORE any write.
  const identity = await getAccountantIdentity(); // ADR-003 // CS-TS-004
  if (!identity) {
    // CS-GEN-001: do not expose internals; generic Unauthorized message only.
    return { success: false, error: "Unauthorized: ACCOUNTANT identity required" }; // AC-FILE-013-02
  }

  // ── 2. Input validation ───────────────────────────────────────────────────────
  if (!engagementId?.trim()) {
    return { success: false, error: "A valid engagement ID is required" };
  }

  // ── 3. Explicit confirmation guard (AC-FILE-013-03 / ADR-018 §5) ─────────────
  // NEVER-AUTOMATIC: the accountant must explicitly confirm. A falsy/missing
  // confirmation is a no-op — irreversible destruction must NOT be one-click.
  // Only pass confirmed: true when the caller has explicitly signalled confirmation.
  // // AC-FILE-013-03 // ADR-018 §5
  if (!confirmation) {
    // No-op — return a discriminated outcome matching the DB layer's 'not-confirmed'.
    // No DB write occurs (ADR-018 §5 / AC-FILE-013-03).
    return {
      success: true,
      data: { outcome: "not-confirmed" } as PurgeEngagementResult,
    };
  }

  // ── 4. Build actor from verified session (ADR-019) ────────────────────────────
  // ADR-019: actor comes ONLY from the server-verified session (CS-TS-004).
  // NEVER from action args or form data.
  const actor: AuditActor = {
    clerkUserId: identity.clerkUserId, // ADR-019 // CS-TS-004: from verified session
    role: identity.role,
  };

  // ── 5. Purge (admin pool, confirmed: true, ADR-018 §5) ────────────────────────
  // purgeEngagement:
  //   - Re-resolves eligibility server-side inside the transaction (ADR-003 §5 defence-in-depth).
  //   - Physical DELETE of DocumentVersion + Document rows + storage bytes (ADR-009).
  //   - Emits 'engagement.purged' audit event in-txn (ADR-019). AuditEvent excluded from sweep.
  //   - NEVER-AUTOMATIC: only fires on explicit confirmed: true (ADR-018 §5 / AC-FILE-013-04).
  // CS-TS-001: purgeEngagement from @tax-portal/db barrel (admin pool).
  // CS-GEN-001: no PII logged; targetId = engagementId in audit row.
  let purgeResult: PurgeEngagementResult;
  try {
    purgeResult = await purgeEngagement({ // ADR-018 §5 // CS-TS-001
      engagementId: engagementId.trim(),
      actor, // ADR-019: actor from verified session
      confirmed: true, // AC-FILE-013-03: only reaches here when confirmation === true
    });
  } catch (err: unknown) {
    // CS-GEN-001: server-level log only — do not surface internals to the client.
    console.error("[purgeEngagementAction] purgeEngagement failed:", err);
    return { success: false, error: "Failed to purge engagement. Please try again." };
  }

  // ── 6. Revalidate the documents page ─────────────────────────────────────────
  revalidatePath(`/engagements/${engagementId.trim()}/documents`);

  return { success: true, data: purgeResult };
}

/**
 * Place a legal hold on an engagement (accountant-only).
 *
 * AC-FILE-014-01: The accountant can place a legal hold on an individual engagement.
 * AC-FILE-014-06: Placing is audited (who, on what, when) — inside placeLegalHold.
 *
 * Flow:
 *   1. getAccountantIdentity() — ACCOUNTANT-only (CS-TS-004). Rejects non-accountant.
 *   2. Input validation.
 *   3. placeLegalHold (admin pool, scope='engagement', audited in-txn) — AC-FILE-014-01/-06.
 *   4. revalidatePath — refresh the documents page.
 *
 * ADR-003: identity guard before any write (CS-TS-004).
 * ADR-006: apps/admin ONLY — no hold action in apps/portal.
 * ADR-018 §6: hold suspends purge indefinitely; engagement-scoped here.
 * ADR-019: 'legal_hold.placed' audit event emitted inside placeLegalHold.
 * CS-TS-001: placeLegalHold from @tax-portal/db barrel (admin pool).
 * CS-TS-004: identity from session cookie only; rejects CLIENT role.
 * CS-GEN-001: no PII logged; targetId = holdId only.
 *
 * @param engagementId - The Engagement.id to place a hold on.
 * @param reason - Optional reason string for the hold (CS-GEN-001: must not contain PII).
 *
 * // ADR-003 // ADR-006 // ADR-018 §6 // ADR-019 // CS-TS-001 // CS-TS-004 // CS-GEN-001 // CS-GEN-003
 * // AC-FILE-014-01 // AC-FILE-014-06
 */
export async function placeLegalHoldAction(
  engagementId: string,
  reason?: string,
): Promise<PlaceLegalHoldActionResult> {
  // ── 1. Identity guard (ACCOUNTANT-only, ADR-003, CS-TS-004) ──────────────────
  const identity = await getAccountantIdentity(); // ADR-003 // CS-TS-004
  if (!identity) {
    return { success: false, error: "Unauthorized: ACCOUNTANT identity required" };
  }

  // ── 2. Input validation ───────────────────────────────────────────────────────
  if (!engagementId?.trim()) {
    return { success: false, error: "A valid engagement ID is required" };
  }

  // ── 3. Build actor from verified session (ADR-019) ────────────────────────────
  const actor: AuditActor = {
    clerkUserId: identity.clerkUserId, // ADR-019 // CS-TS-004: from verified session
    role: identity.role,
  };

  // ── 4. Place hold (admin pool, scope='engagement', ADR-018 §6) ────────────────
  // placeLegalHold:
  //   - Inserts LegalHold row with scope='engagement' (AC-FILE-014-01).
  //   - Idempotent: already-held returns 'already-held'.
  //   - Emits 'legal_hold.placed' audit event in-txn (ADR-019 / AC-FILE-014-06).
  //   - actor from verified session (CS-TS-004 / ADR-019).
  // CS-TS-001: placeLegalHold from @tax-portal/db barrel (admin pool).
  // CS-GEN-001: no PII logged; targetId = holdId only in audit row.
  let holdResult: PlaceLegalHoldResult;
  try {
    holdResult = await placeLegalHold({ // ADR-018 §6 // CS-TS-001
      actor, // ADR-019: actor from verified session
      scope: "engagement",
      engagementId: engagementId.trim(),
      reason: reason ?? null,
    });
  } catch (err: unknown) {
    // CS-GEN-001: server-level log only — do not surface internals to the client.
    console.error("[placeLegalHoldAction] placeLegalHold failed:", err);
    return { success: false, error: "Failed to place legal hold. Please try again." };
  }

  // ── 5. Revalidate the documents page ─────────────────────────────────────────
  revalidatePath(`/engagements/${engagementId.trim()}/documents`);

  return { success: true, data: holdResult };
}

/**
 * Lift a legal hold (accountant-only).
 *
 * AC-FILE-014-05: The accountant can lift a legal hold on an engagement or client;
 *   lifting a hold restores normal purge eligibility if the retention window has elapsed.
 * AC-FILE-014-07: Lifting is audited (who, on what, when) — inside liftLegalHold.
 *
 * Flow:
 *   1. getAccountantIdentity() — ACCOUNTANT-only (CS-TS-004). Rejects non-accountant.
 *   2. Input validation.
 *   3. liftLegalHold (admin pool, audited in-txn) — AC-FILE-014-05/-07.
 *   4. revalidatePath — refresh the documents page.
 *
 * ADR-003: identity guard before any write (CS-TS-004).
 * ADR-006: apps/admin ONLY.
 * ADR-018 §6: lift restores eligibility iff window elapsed; hold does not auto-expire.
 * ADR-019: 'legal_hold.lifted' audit event emitted inside liftLegalHold.
 * CS-TS-001: liftLegalHold from @tax-portal/db barrel (admin pool).
 * CS-TS-004: identity from session cookie only; rejects CLIENT role.
 * CS-GEN-001: no PII logged; targetId = holdId only.
 *
 * @param holdId - The LegalHold.id to lift.
 * @param engagementId - The Engagement.id (for path revalidation after lift).
 *
 * // ADR-003 // ADR-006 // ADR-018 §6 // ADR-019 // CS-TS-001 // CS-TS-004 // CS-GEN-001 // CS-GEN-003
 * // AC-FILE-014-05 // AC-FILE-014-07
 */
export async function liftLegalHoldAction(
  holdId: string,
  engagementId: string,
): Promise<LiftLegalHoldActionResult> {
  // ── 1. Identity guard (ACCOUNTANT-only, ADR-003, CS-TS-004) ──────────────────
  const identity = await getAccountantIdentity(); // ADR-003 // CS-TS-004
  if (!identity) {
    return { success: false, error: "Unauthorized: ACCOUNTANT identity required" };
  }

  // ── 2. Input validation ───────────────────────────────────────────────────────
  if (!holdId?.trim()) {
    return { success: false, error: "A valid hold ID is required" };
  }
  if (!engagementId?.trim()) {
    return { success: false, error: "A valid engagement ID is required" };
  }

  // ── 3. Build actor from verified session (ADR-019) ────────────────────────────
  const actor: AuditActor = {
    clerkUserId: identity.clerkUserId, // ADR-019 // CS-TS-004: from verified session
    role: identity.role,
  };

  // ── 4. Lift hold (admin pool, ADR-018 §6) ────────────────────────────────────
  // liftLegalHold:
  //   - Sets liftedAt + liftedByClerkId on the LegalHold row (AC-FILE-014-05).
  //   - Idempotent: already-lifted returns 'already-lifted'.
  //   - Emits 'legal_hold.lifted' audit event in-txn (ADR-019 / AC-FILE-014-07).
  //   - actor from verified session (CS-TS-004 / ADR-019).
  //   - After lift, eligibility restores iff window elapsed (the eligibility derivation
  //     is in purgeEngagement/purgeEligibility — this function only sets the lifted state).
  // CS-TS-001: liftLegalHold from @tax-portal/db barrel (admin pool).
  // CS-GEN-001: no PII logged; targetId = holdId only in audit row.
  let liftResult: LiftLegalHoldResult;
  try {
    liftResult = await liftLegalHold({ // ADR-018 §6 // CS-TS-001
      holdId: holdId.trim(),
      actor, // ADR-019: actor from verified session
    });
  } catch (err: unknown) {
    // CS-GEN-001: server-level log only — do not surface internals to the client.
    console.error("[liftLegalHoldAction] liftLegalHold failed:", err);
    return { success: false, error: "Failed to lift legal hold. Please try again." };
  }

  // ── 5. Revalidate the documents page ─────────────────────────────────────────
  revalidatePath(`/engagements/${engagementId.trim()}/documents`);

  return { success: true, data: liftResult };
}

