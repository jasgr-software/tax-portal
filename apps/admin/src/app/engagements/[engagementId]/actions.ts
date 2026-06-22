/**
 * apps/admin/src/app/engagements/[engagementId]/actions.ts
 *
 * Server actions for the engagement lifecycle management surface.
 *
 * TASK-010-003: Accountant transition / completion-gate / reopen surface.
 *
 * Acceptance criteria:
 *   AC-LIFE-001-03: accountant advances New → In Progress → Review → Complete in order
 *   AC-LIFE-003-01: accountant changes engagement status
 *   AC-LIFE-005-01: Complete requires delivery confirmation (server gate)
 *   AC-LIFE-005-02: Complete requires filing confirmation (server gate)
 *   AC-LIFE-006-01: accountant reopens a Complete engagement
 *
 * ADR-003: Every action verifies getAccountantIdentity() BEFORE any DB write.
 *   The actor for the ADR-019 audit event comes ONLY from the verified session — never
 *   from action args, form data, or client-supplied role.
 * ADR-006: These actions exist ONLY in apps/admin — no mirror in apps/portal.
 *   The portal surface is TASK-010-004.
 * ADR-019: Audit event actor = verified session clerkUserId + ACCOUNTANT role.
 *   Recorded by the TASK-010-001 seam atomically with the DB write.
 *
 * All seam calls (transitionEngagementStatus, confirmDelivery, confirmFiling,
 * reopenEngagement) are imported from @tax-portal/db — the TASK-010-001 lifecycle seam.
 * No transition/validation/audit logic is re-implemented here. The seam is the
 * trust fence at the DB layer; this action layer is the trust fence at the HTTP layer.
 *
 * AC-LIFE-005-03 two-confirmation server enforcement: completeEngagementAction calls
 * transitionEngagementStatus with toStatus="Complete". The seam already enforces
 * deliveryConfirmedAt IS NOT NULL AND filingConfirmedAt IS NOT NULL (DECISION-010-C).
 * When either confirmation is missing, the seam returns { transitioned: false } and
 * this action returns { success: false }. This is the NEGATIVE proof that the server
 * gate is active — not merely a disabled UI button.
 *
 * // ADR-003: server-side authority — getAccountantIdentity() before every DB write
 * // ADR-006: admin surface only (apps/admin) — no mirror in apps/portal
 * // ADR-019: audit actor comes from verified session only
 * // CS-TS-001: all DB reads use admin-pool via getEngagementStatusForAdmin
 * // CS-TS-002: no direct adminDb/pool import — seam calls via @tax-portal/db barrel
 * // CS-TS-003: admin-scoped actions; portal side is TASK-010-004 (different surface)
 * // CS-GEN-001: no PII logged (clerkUserId in audit trail via seam, not in server logs)
 * // CS-GEN-003: cite governing authority in comments
 */

"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getAuthProvider } from "@tax-portal/auth";
import {
  transitionEngagementStatus,
  confirmDelivery,
  confirmFiling,
  reopenEngagement,
  getEngagementStatusForAdmin,
} from "@tax-portal/db";
// CS-TS-001: CS-TS-002: all imports from @tax-portal/db barrel (no raw pool imports)
import type { AuditActor } from "@tax-portal/db";

// ─── Result types ─────────────────────────────────────────────────────────────

export type LifecycleActionResult =
  | { success: true }
  | { success: false; error: string };

// ─── Identity helper ──────────────────────────────────────────────────────────

/**
 * Resolve the verified accountant identity from the incoming request headers.
 *
 * Mirrors apps/admin/src/app/engagements/[engagementId]/document-requests/actions.ts pattern exactly.
 * Returns null if no identity is found or the role is not ACCOUNTANT.
 *
 * ADR-003: identity.role comes from the verified session (Clerk public metadata
 *   or mock session cookie) — NEVER from any server action argument or form data.
 *   The trust fence is this guard; the BLOCK predicate is defence-in-depth only.
 * ADR-006: Apps/admin only — this helper is not exported or available in apps/portal.
 */
async function getAccountantIdentity(): Promise<{
  clerkUserId: string;
  role: "ACCOUNTANT" | "CLIENT";
} | null> {
  // ADR-003: Read identity from the incoming request headers (verified server-side).
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
 * Advance an engagement to the next stage in the lifecycle.
 *
 * AC-LIFE-001-03: New → In Progress → Review (the forward pipeline).
 * AC-LIFE-003-01: Only the accountant can change engagement status.
 *
 * Allowed edges (from TASK-010-001 LIFECYCLE_ALLOWED_TRANSITIONS):
 *   New → In Progress, In Progress → Review
 *   (Review → Complete is handled by completeEngagementAction which enforces confirmations)
 *
 * ADR-003: identity guard before any DB write.
 * ADR-019: actor = verified session identity (clerkUserId + ACCOUNTANT role).
 * ADR-006: admin surface only.
 *
 * @param engagementId - The Engagement.id (from the URL route param — server-resolved).
 * @param fromStatus   - Expected current status (guarded WHERE clause in seam).
 * @param toStatus     - Target status (seam validates edge is allowed).
 */
export async function advanceStatusAction(
  engagementId: string,
  fromStatus: string,
  toStatus: string,
): Promise<LifecycleActionResult> {
  // ── 1. Identity guard (ACCOUNTANT-only, ADR-003) ──────────────────────────
  const identity = await getAccountantIdentity(); // ADR-003
  if (!identity) {
    return { success: false, error: "Unauthorized: ACCOUNTANT identity required" };
  }

  // ── 2. Validate inputs ────────────────────────────────────────────────────
  if (typeof engagementId !== "string" || !engagementId.trim()) {
    return { success: false, error: "A valid engagement ID is required" };
  }
  if (typeof fromStatus !== "string" || !fromStatus.trim()) {
    return { success: false, error: "A valid current status is required" };
  }
  if (typeof toStatus !== "string" || !toStatus.trim()) {
    return { success: false, error: "A valid target status is required" };
  }

  // ── 3. Build actor from verified session (ADR-019) ─────────────────────────
  // The actor for the audit event comes ONLY from the server-verified session.
  // Never from action arguments, form data, or any client-supplied value.
  const actor: AuditActor = {
    clerkUserId: identity.clerkUserId, // ADR-019
    role: identity.role,               // ADR-019
  };

  // ── 4. Call the TASK-010-001 seam (no duplicate logic here) ───────────────
  // CS-TS-002: transitionEngagementStatus imported from @tax-portal/db barrel (no raw pool)
  const result = await transitionEngagementStatus({
    engagementId: engagementId.trim(),
    fromStatus: fromStatus.trim(),
    toStatus: toStatus.trim(),
    actor,
    sourceSurface: "admin", // ADR-006: always "admin" from this surface
  });

  if (!result.transitioned) {
    return {
      success: false,
      error: "Could not advance status — status conflict or guard fired (concurrent update?)",
    };
  }

  // ── 5. Revalidate the engagement page ─────────────────────────────────────
  revalidatePath(`/engagements/${engagementId.trim()}`);

  return { success: true };
}

/**
 * Record the delivery confirmation for an engagement.
 *
 * AC-LIFE-005-01: Complete requires the delivery confirmation.
 * Sets deliveryConfirmedAt on the engagement. Both delivery + filing must be confirmed
 * before the → Complete transition is allowed (enforced by the seam + DB guard).
 *
 * ADR-003: identity guard before any DB write.
 * ADR-019: actor = verified session identity.
 * ADR-006: admin surface only.
 *
 * @param engagementId - The Engagement.id (server-resolved).
 */
export async function confirmDeliveryAction(
  engagementId: string,
): Promise<LifecycleActionResult> {
  // ── 1. Identity guard (ACCOUNTANT-only, ADR-003) ──────────────────────────
  const identity = await getAccountantIdentity(); // ADR-003
  if (!identity) {
    return { success: false, error: "Unauthorized: ACCOUNTANT identity required" };
  }

  // ── 2. Validate input ─────────────────────────────────────────────────────
  if (typeof engagementId !== "string" || !engagementId.trim()) {
    return { success: false, error: "A valid engagement ID is required" };
  }

  // ── 3. Build actor from verified session (ADR-019) ─────────────────────────
  const actor: AuditActor = {
    clerkUserId: identity.clerkUserId, // ADR-019
    role: identity.role,               // ADR-019
  };

  // ── 4. Call the TASK-010-001 seam ─────────────────────────────────────────
  // CS-TS-002: confirmDelivery imported from @tax-portal/db barrel (no raw pool)
  const result = await confirmDelivery({
    engagementId: engagementId.trim(),
    actor,
    sourceSurface: "admin", // ADR-006
  });

  if (!result.confirmed) {
    return {
      success: false,
      error: "Could not record delivery confirmation — already confirmed or engagement not found",
    };
  }

  revalidatePath(`/engagements/${engagementId.trim()}`);
  return { success: true };
}

/**
 * Record the filing confirmation for an engagement.
 *
 * AC-LIFE-005-02: Complete requires the filing confirmation.
 * Sets filingConfirmedAt on the engagement. Both delivery + filing must be confirmed
 * before the → Complete transition is allowed (enforced by the seam + DB guard).
 *
 * ADR-003: identity guard before any DB write.
 * ADR-019: actor = verified session identity.
 * ADR-006: admin surface only.
 *
 * @param engagementId - The Engagement.id (server-resolved).
 */
export async function confirmFilingAction(
  engagementId: string,
): Promise<LifecycleActionResult> {
  // ── 1. Identity guard (ACCOUNTANT-only, ADR-003) ──────────────────────────
  const identity = await getAccountantIdentity(); // ADR-003
  if (!identity) {
    return { success: false, error: "Unauthorized: ACCOUNTANT identity required" };
  }

  // ── 2. Validate input ─────────────────────────────────────────────────────
  if (typeof engagementId !== "string" || !engagementId.trim()) {
    return { success: false, error: "A valid engagement ID is required" };
  }

  // ── 3. Build actor from verified session (ADR-019) ─────────────────────────
  const actor: AuditActor = {
    clerkUserId: identity.clerkUserId, // ADR-019
    role: identity.role,               // ADR-019
  };

  // ── 4. Call the TASK-010-001 seam ─────────────────────────────────────────
  // CS-TS-002: confirmFiling imported from @tax-portal/db barrel (no raw pool)
  const result = await confirmFiling({
    engagementId: engagementId.trim(),
    actor,
    sourceSurface: "admin", // ADR-006
  });

  if (!result.confirmed) {
    return {
      success: false,
      error: "Could not record filing confirmation — already confirmed or engagement not found",
    };
  }

  revalidatePath(`/engagements/${engagementId.trim()}`);
  return { success: true };
}

/**
 * Complete an engagement (Review → Complete) with the two-confirmation server gate.
 *
 * AC-LIFE-005-01/-02: BOTH delivery and filing confirmations must be recorded.
 * The seam enforces this at the DB layer: UPDATE WHERE deliveryConfirmedAt IS NOT NULL
 * AND filingConfirmedAt IS NOT NULL (DECISION-010-C). When either is NULL the seam
 * returns { transitioned: false } and this action returns { success: false }.
 *
 * This is the NEGATIVE proof for the server gate — the UI disables the Complete
 * button until both confirmations are checked, but the SERVER independently enforces
 * the constraint. Disabling only the UI button would leave the gate bypassable.
 *
 * AC-LIFE-001-03: Review → Complete is the final forward step.
 * ADR-003: identity guard before any DB write.
 * ADR-019: actor = verified session identity.
 * ADR-006: admin surface only.
 *
 * @param engagementId - The Engagement.id (server-resolved).
 */
export async function completeEngagementAction(
  engagementId: string,
): Promise<LifecycleActionResult> {
  // ── 1. Identity guard (ACCOUNTANT-only, ADR-003) ──────────────────────────
  const identity = await getAccountantIdentity(); // ADR-003
  if (!identity) {
    return { success: false, error: "Unauthorized: ACCOUNTANT identity required" };
  }

  // ── 2. Validate input ─────────────────────────────────────────────────────
  if (typeof engagementId !== "string" || !engagementId.trim()) {
    return { success: false, error: "A valid engagement ID is required" };
  }

  // ── 3. Look up current status (admin pool, RLS-exempt) ───────────────────
  // CS-TS-001: getEngagementStatusForAdmin uses admin pool — correct for admin-surface reads.
  // ADR-003 §7: admin pool is allowed for admin-surface reads (no SESSION_CONTEXT needed).
  const current = await getEngagementStatusForAdmin(engagementId.trim());
  if (!current) {
    return { success: false, error: "Engagement not found" };
  }

  // ── 4. Build actor from verified session (ADR-019) ─────────────────────────
  const actor: AuditActor = {
    clerkUserId: identity.clerkUserId, // ADR-019
    role: identity.role,               // ADR-019
  };

  // ── 5. Call the seam with toStatus="Complete" ──────────────────────────────
  // AC-LIFE-005-01/-02 server gate: the seam rejects Complete when either
  // deliveryConfirmedAt or filingConfirmedAt is NULL (DECISION-010-C).
  // { transitioned: false } = at least one confirmation is missing.
  // CS-TS-002: transitionEngagementStatus from @tax-portal/db barrel (no raw pool)
  const result = await transitionEngagementStatus({
    engagementId: engagementId.trim(),
    fromStatus: current.status,
    toStatus: "Complete",
    actor,
    sourceSurface: "admin", // ADR-006
  });

  if (!result.transitioned) {
    // AC-LIFE-005-01/-02: server confirms the gate fired — both confirmations required.
    return {
      success: false,
      error: "Cannot complete engagement — both delivery and filing confirmations required (server gate)",
    };
  }

  revalidatePath(`/engagements/${engagementId.trim()}`);
  return { success: true };
}

/**
 * Reopen a Complete engagement (Complete → In Progress).
 *
 * AC-LIFE-006-01: The accountant can reopen a Complete engagement.
 * Clears both confirmation timestamps (deliveryConfirmedAt = NULL, filingConfirmedAt = NULL)
 * so a future re-completion re-gates on both confirmations (DECISION-010-B).
 *
 * ADR-003: identity guard before any DB write.
 * ADR-019: actor = verified session identity.
 * ADR-006: admin surface only — CLIENT cannot call this (BLOCK predicate + action guard).
 *
 * @param engagementId - The Engagement.id (server-resolved).
 */
export async function reopenEngagementAction(
  engagementId: string,
): Promise<LifecycleActionResult> {
  // ── 1. Identity guard (ACCOUNTANT-only, ADR-003) ──────────────────────────
  const identity = await getAccountantIdentity(); // ADR-003
  if (!identity) {
    return { success: false, error: "Unauthorized: ACCOUNTANT identity required" };
  }

  // ── 2. Validate input ─────────────────────────────────────────────────────
  if (typeof engagementId !== "string" || !engagementId.trim()) {
    return { success: false, error: "A valid engagement ID is required" };
  }

  // ── 3. Build actor from verified session (ADR-019) ─────────────────────────
  const actor: AuditActor = {
    clerkUserId: identity.clerkUserId, // ADR-019
    role: identity.role,               // ADR-019
  };

  // ── 4. Call the TASK-010-001 seam ─────────────────────────────────────────
  // CS-TS-002: reopenEngagement imported from @tax-portal/db barrel (no raw pool)
  const result = await reopenEngagement({
    engagementId: engagementId.trim(),
    actor,
    sourceSurface: "admin", // ADR-006
  });

  if (!result.reopened) {
    return {
      success: false,
      error: "Could not reopen engagement — engagement must be in Complete status",
    };
  }

  revalidatePath(`/engagements/${engagementId.trim()}`);
  return { success: true };
}
