/**
 * apps/portal/src/app/onboarding/actions.ts — Client onboarding server actions
 *
 * AC-ONBD-001-01: Returns exactly three ordered steps: ['engagement-letter','intake-questionnaire','document-upload'].
 * AC-ONBD-001-02: A later step cannot be entered before the letter is signed (server refuses).
 * AC-ONBD-001-03: currentStep + remaining derivable from signed/unsigned state.
 * AC-ONBD-002-01: questionnaire step server-side-refused while letterSignedAt is NULL.
 * AC-ONBD-002-02: document-upload step server-side-refused while letterSignedAt is NULL.
 * AC-ONBD-002-03: sign → steps 2/3 become accessible.
 * AC-ONBD-002-04: signature evidence recorded against the engagement + audited.
 * AC-IDNT-007-03: the letter presented/snapshotted is the accountant's edited template.
 *
 * ADR-001/ADR-005: onboarding reachable only by the authenticated CLIENT who owns the engagement;
 *   role comes from the verified session only (never from client-supplied body/header/query).
 * ADR-003: reads go through withRequestContext() so sec.pol_Engagement FILTER governs visibility.
 *   A non-owning CLIENT reads ZERO engagement rows (fail-closed).
 * ADR-019: signature is a security-significant audited event (fail-closed, recordAuthEvent).
 * ADR-023/024: sign through the ESignatureProvider PORT — never a binding class directly.
 *
 * // DECISION (TASK-005-005): getClientIdentity() is the portal's CLIENT identity helper,
 * // mirroring admin getAccountantIdentity(). It builds a synthetic Request from the cookie
 * // header → getAuthProvider().getIdentity(req) → requires role === 'CLIENT'. Role comes ONLY
 * // from the verified session — never from a server-action argument or form data.
 *
 * // DECISION (TASK-005-005): Two-pool coordination for the signing path:
 * //   1. ESignatureProvider.verifyCompletion() → signed: true is the precondition.
 * //   2. recordLetterSignatureAsClient (REQUEST POOL, BLOCK-governed) runs FIRST.
 * //      rowsAffected = 0 → not the owner → STOP, return refusal, NO audit event for a non-event.
 * //   3. Only after rowsAffected = 1, record the audit event (ADMIN POOL via recordAuthEvent).
 * //      If the audit insert throws, surface the error (fail-closed).
 * //   4. revalidatePath('/onboarding') so the unlocked steps render.
 * //
 * //   withAuditTransaction (admin pool) and recordLetterSignatureAsClient (request pool) run
 * //   on DIFFERENT pools and CANNOT share a single mssql Transaction. The two-step coordination
 * //   is the correct pattern: DB write first, then audit. The signing action is idempotent at
 * //   the DB layer (letterSignedAt once set stays set), so a failed audit write can be retried.
 * //   This two-pool approach is a deliberate DECISION driven by the pool architecture (ADR-003).
 */

"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import {
  getAuthProvider,
} from "@tax-portal/auth";
import {
  withRequestContext,
  getEngagementForClient,
  getMyEngagement,
  getCurrentLetterTemplate,
  recordLetterSignatureAsClient,
  recordAuthEvent,
  resolveOnboarding,
} from "@tax-portal/db";
import { getESignatureProvider } from "@tax-portal/esign";
import type {
  OnboardingReadModel,
} from "@tax-portal/db";

// ─── Identity helper ──────────────────────────────────────────────────────────

/**
 * Resolve the CLIENT identity from the incoming request cookie.
 *
 * Mirrors admin getAccountantIdentity() (apps/admin/src/app/requests/actions.ts L122-141):
 *   - Reads the cookie header from Next.js headers().
 *   - Builds a synthetic Request → getAuthProvider().getIdentity(req).
 *   - Requires role === 'CLIENT'; returns null for ACCOUNTANT or unauthenticated.
 *
 * ADR-001/ADR-005: role from the verified session only — NEVER from a server-action
 *   argument, form data, URL param, or any client-supplied source.
 *
 * This is the first portal server action requiring CLIENT identity. The portal previously
 * relied on middleware only for auth enforcement.
 */
export async function getClientIdentity(): Promise<{
  clerkUserId: string;
  role: "CLIENT";
} | null> {
  const headerStore = await headers();
  const cookieHeader = headerStore.get("cookie") ?? "";

  const syntheticRequest = new Request("http://localhost/", {
    headers: { cookie: cookieHeader },
  });

  const provider = getAuthProvider();
  const identity = await provider.getIdentity(syntheticRequest);

  if (!identity || identity.role !== "CLIENT") {
    return null;
  }

  return { clerkUserId: identity.clerkUserId, role: "CLIENT" };
}

// ─── Result Types ─────────────────────────────────────────────────────────────

export type SignEngagementLetterResult =
  | { success: true; data: OnboardingReadModel }
  | { success: false; error: string; refused?: boolean };

// ─── Server Actions ───────────────────────────────────────────────────────────

/**
 * Return the onboarding read model for the authenticated CLIENT without a client-supplied id.
 *
 * This is the page-facing no-arg action: the page NEVER receives an id from the client.
 * Engagement resolution is server-side, FILTER-governed (ADR-001/ADR-005).
 *
 * // DECISION (TASK-005-006): The onboarding page resolves the client's engagement by calling
 * // getMyEngagement() under withRequestContext — no id from URL param, form data, or body.
 * // sec.pol_Engagement FILTER returns only the caller's own row (fail-closed for non-owners).
 * // In Phase 2 a client owns exactly one engagement (brief's out-of-scope fence on multi-
 * // participant).
 *
 * Also loads the current LetterTemplate content so the page can render the letter for review
 * (AC-IDNT-007-03 UI surface) without a second round-trip.
 *
 * AC-ONBD-001-01: Returns exactly three ordered steps.
 * AC-ONBD-001-02: Steps 2/3 are accessible: false when letterSignedAt is NULL.
 * AC-ONBD-001-03: currentStep + remaining derived server-side.
 * AC-IDNT-007-03: The accountant's edited template content is included for display.
 * ADR-003: reads run under withRequestContext(CLIENT) so the FILTER predicate governs.
 */
export async function getMyOnboardingAction(): Promise<
  | { success: true; data: OnboardingReadModel; letterContent: string }
  | { success: false; error: string }
> {
  const identity = await getClientIdentity();
  if (!identity) {
    return { success: false, error: "Unauthorized: CLIENT identity required" };
  }

  // Resolve engagement server-side via FILTER predicate — no client-supplied id.
  const engagement = await withRequestContext(
    identity.clerkUserId,
    identity.role,
    () => getMyEngagement(),
  );

  if (!engagement) {
    // FILTER returned ZERO rows — not the owner, clientUserId not set, or no engagement exists.
    return { success: false, error: "No active engagement found" };
  }

  const model = resolveOnboarding(engagement);

  // Load the current letter template for the letter step display (AC-IDNT-007-03 UI).
  // Admin pool read — safe for server-side display; content is auto-escaped at render.
  const template = await getCurrentLetterTemplate();
  const letterContent = template?.content ?? "";

  return { success: true, data: model, letterContent };
}

/**
 * Sign the engagement letter for the authenticated CLIENT.
 *
 * Flow (AC-ONBD-002-03/-04, AC-IDNT-007-03, ADR-023/024, ADR-019):
 *   1. getClientIdentity() → must be CLIENT (role from verified session).
 *   2. Load engagement under client principal (request pool / FILTER).
 *   3. Load current LetterTemplate.content (AC-IDNT-007-03: accountant's edited template).
 *   4. Drive the ESignatureProvider PORT:
 *      a. provider.createSignatureRequest({ engagementId, letterContent, signer })
 *      b. provider.verifyCompletion(ref) → SignatureCompletion
 *      c. "signed" decision comes ONLY from verifyCompletion — never from client-supplied args.
 *   5. On signed: false → return not-signed result without mutating.
 *   6. On signed: true:
 *      a. recordLetterSignatureAsClient (REQUEST POOL, BLOCK-governed) FIRST.
 *         rowsAffected = 0 → not the owner → return refusal, NO audit event.
 *      b. recordAuthEvent (ADMIN POOL) — audit the signing event (fail-closed).
 *      c. revalidatePath('/onboarding') → unlocked steps render.
 *      d. Return updated OnboardingReadModel.
 *
 * // DECISION (TASK-005-005): Two-pool coordination — see module-level DECISION comment.
 *
 * @param engagementId — the engagement to sign.
 */
export async function signEngagementLetterAction(
  engagementId: string,
): Promise<SignEngagementLetterResult> {
  // Step 1: identity guard
  const identity = await getClientIdentity();
  if (!identity) {
    return { success: false, error: "Unauthorized: CLIENT identity required" };
  }

  if (!engagementId) {
    return { success: false, error: "engagementId is required" };
  }

  // Step 2: load engagement under client principal (FILTER predicate)
  const engagement = await withRequestContext(
    identity.clerkUserId,
    identity.role,
    () => getEngagementForClient(engagementId),
  );

  if (!engagement) {
    return { success: false, error: "Engagement not found", refused: true };
  }

  // Step 3: load the current letter template (AC-IDNT-007-03)
  const template = await getCurrentLetterTemplate();
  if (!template) {
    return { success: false, error: "Letter template not configured" };
  }

  // Step 4: drive the ESignatureProvider PORT (ADR-023/024)
  // NEVER import a binding class — only the port types and getESignatureProvider are used.
  const provider = getESignatureProvider();

  const signatureRequest = await provider.createSignatureRequest({
    engagementId,
    letterContent: template.content,
    signer: { clerkUserId: identity.clerkUserId },
  });

  const completion = await provider.verifyCompletion(signatureRequest.ref);

  // Step 5: on signed: false — return without mutating
  if (!completion.signed) {
    return { success: false, error: "Letter has not been signed yet" };
  }

  // Step 6a: request-pool BLOCK-governed signature write FIRST (TASK-005-005 point 1)
  // DECISION (TASK-005-005): two-pool coordination — see module DECISION comment above.
  // The "signed" decision comes ONLY from verifyCompletion (ADR-024 §3 trust boundary).
  const signResult = await recordLetterSignatureAsClient({
    engagementId,
    signatureEvidence: completion.evidence,
    templateSnapshot: template.content,   // AC-IDNT-007-03: snapshot at sign time (DECISION-C)
    clerkUserId: identity.clerkUserId,
    role: "CLIENT",
  });

  if (signResult.rowsAffected === 0) {
    // BLOCK predicate denied the write — not the owner or SESSION_CONTEXT was null.
    // Do NOT record an audit event for a non-event (ENGINE.md security principle).
    return {
      success: false,
      error: "Signature write denied: not the owner of this engagement",
      refused: true,
    };
  }

  // Step 6b: audit the signing event (admin pool, fail-closed — ADR-019)
  // DECISION (TASK-005-005): audit runs AFTER the request-pool write (two-pool coordination).
  // New action string 'engagement.letter_signed' extends the extensible action field (ADR-019).
  await recordAuthEvent({
    actor: { clerkUserId: identity.clerkUserId, role: "CLIENT" },
    action: "engagement.letter_signed",
    targetType: "Engagement",
    targetId: engagementId,
    sourceSurface: "portal",
  });

  // Step 6c: revalidate so the unlocked steps render (AC-ONBD-002-03)
  revalidatePath("/onboarding");

  // Step 6d: return updated read model — re-load engagement after signing
  const updatedEngagement = await withRequestContext(
    identity.clerkUserId,
    identity.role,
    () => getEngagementForClient(engagementId),
  );

  if (!updatedEngagement) {
    // Extremely unlikely (just wrote successfully), but be safe.
    return { success: false, error: "Could not reload engagement after signing" };
  }

  const updatedModel = resolveOnboarding(updatedEngagement);
  return { success: true, data: updatedModel };
}
