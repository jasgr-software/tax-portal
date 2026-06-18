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
  getMyQuestionnaire,
} from "@tax-portal/db";
import { getESignatureProvider } from "@tax-portal/esign";
import type {
  OnboardingReadModel,
  QuestionnaireForEngagement,
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

/**
 * Result type for getMyQuestionnaireAction (TASK-006-004/005 coordination seam).
 *
 * Returns the resolved questionnaire for the current CLIENT's engagement service type,
 * plus whether the questionnaire has already been submitted and any existing answers.
 *
 * TASK-006-005 uses this seam to populate the QuestionnaireStep with server-resolved data.
 * No client-supplied ids (ADR-001/ADR-005): engagement + service type resolved server-side.
 */
export type GetMyQuestionnaireResult =
  | {
      success: true;
      data: QuestionnaireForEngagement;
      alreadySubmitted: boolean;
      existingAnswers: string | null;
    }
  | { success: false; error: string };

/**
 * Result type for submitQuestionnaireAction (TASK-006-005 seam — stub body here).
 *
 * On success: the questionnaire step has been satisfied server-side.
 * On failure: error message for display.
 */
export type SubmitQuestionnaireResult =
  | { success: true }
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

/**
 * Load the questionnaire for the authenticated CLIENT's engagement.
 *
 * TASK-006-004/005 coordination seam: this is the no-arg data-loading action.
 * The questionnaire is resolved server-side via getMyQuestionnaire() under
 * withRequestContext — no client-supplied engagement id, service id, or template id
 * (ADR-001/ADR-005).
 *
 * TASK-006-005 extends this seam to also return:
 *   - alreadySubmitted: whether Engagement.questionnaireSubmittedAt is set
 *   - existingAnswers: the QuestionnaireAnswer.answers blob (if submitted)
 *
 * For now (TASK-006-004) the full implementation defers to TASK-006-005. This stub
 * returns the questionnaire template data; alreadySubmitted and existingAnswers are
 * hardcoded to false/null until TASK-006-005 fills the body.
 *
 * AC-ONBD-003-01: The questionnaire shown corresponds to the engagement's service type.
 * ADR-001/ADR-005: Engagement + service resolution is server-side only.
 * ADR-003: reads run under withRequestContext(CLIENT) so the FILTER predicate governs.
 *
 * // DECISION (TASK-006-004): stub body defers alreadySubmitted + existingAnswers to
 * // TASK-006-005. The import seam is defined here so QuestionnaireStep can be tested
 * // and wired without blocking on 005. TASK-006-005 replaces this stub body entirely.
 */
export async function getMyQuestionnaireAction(): Promise<GetMyQuestionnaireResult> {
  const identity = await getClientIdentity();
  if (!identity) {
    return { success: false, error: "Unauthorized: CLIENT identity required" };
  }

  const questionnaireResult = await withRequestContext(
    identity.clerkUserId,
    identity.role,
    () => getMyQuestionnaire(),
  );

  if (!questionnaireResult) {
    return { success: false, error: "No active engagement found" };
  }

  // DECISION (TASK-006-004): alreadySubmitted + existingAnswers stubbed to false/null.
  // TASK-006-005 replaces this stub body to load the submitted state from the DB.
  return {
    success: true,
    data: questionnaireResult,
    alreadySubmitted: false,
    existingAnswers: null,
  };
}

/**
 * Submit the questionnaire answers for the authenticated CLIENT.
 *
 * TASK-006-004/005 coordination seam: this action is the submit entry point.
 * The implementation body is owned by TASK-006-005 — it will:
 *   1. Verify CLIENT identity (getClientIdentity).
 *   2. Validate that the intake-questionnaire step is accessible (checkStepAccessibility).
 *   3. Resolve the engagement + template server-side (no client-supplied ids).
 *   4. Validate all required questions have answers.
 *   5. Call submitQuestionnaireAsClient (REQUEST POOL / BLOCK-governed).
 *   6. Record an audit event.
 *   7. revalidatePath('/onboarding').
 *
 * For now (TASK-006-004) this is a typed stub so the component can compile and tests
 * can mock it. TASK-006-005 replaces this stub body entirely.
 *
 * @param answersJson — serialized JSON { [questionId]: string } (DECISION-H).
 *   Validated by TASK-006-005 at the action layer before writing to the DB.
 *   NEVER includes a client-supplied engagement id, template id, or service id.
 *
 * AC-ONBD-003-03: step satisfied only when this action succeeds (server-side).
 * AC-ONBD-003-04: answers recorded against the engagement.
 * ADR-001/ADR-005: no client-supplied ids. All resolution is server-side.
 *
 * // DECISION (TASK-006-004): stub returns not-yet-implemented error so that calling
 * // the submit form before TASK-006-005 lands gives a clear message rather than a crash.
 * // TASK-006-005 replaces this stub body with the full implementation.
 */
export async function submitQuestionnaireAction(
  answersJson: string,
): Promise<SubmitQuestionnaireResult> {
  // GUARDRAIL: stub — TASK-006-005 replaces this body.
  // answersJson is accepted here to define the seam signature; 005 validates + persists it.
  void answersJson;
  return {
    success: false,
    error: "Questionnaire submission not yet implemented (TASK-006-005 pending).",
  };
}
