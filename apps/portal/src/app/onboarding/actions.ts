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
  getRateLimiter,
  buildRateLimitKey,
} from "@tax-portal/auth";
import {
  withRequestContext,
  getEngagementForClient,
  getMyEngagement,
  getCurrentLetterTemplate,
  recordLetterSignatureAsClient,
  recordAuthEvent,
  resolveOnboarding,
  checkStepAccessibility,
  getMyQuestionnaire,
  getMyQuestionnaireAnswer,
  submitQuestionnaireAsClient,
  authorizeEngagementForUpload,
  resolveChecklist,
  listDocumentRequestsForEngagement,
  processOnboardingCompletion,
} from "@tax-portal/db";
// NOT on the barrel — import directly from the source module (TASK-007-004 constraint)
// Mirrors createDocumentRequestAsAccountant import pattern in admin actions.ts.
import {
  insertPendingDocument,
  completeUpload,
  getDocumentForOwnershipCheck,
} from "@tax-portal/db/src/repositories/document.js";
import { getStorage } from "@tax-portal/storage";
import { getESignatureProvider } from "@tax-portal/esign";
import type {
  OnboardingReadModel,
  QuestionnaireForEngagement,
  QuestionDef,
  ChecklistReadModel,
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

  // Load the current letter template for the letter step display (AC-IDNT-007-03 UI).
  // Admin pool read — safe for server-side display; content is auto-escaped at render.
  const template = await getCurrentLetterTemplate();
  const letterContent = template?.content ?? "";

  // DECISION (TASK-007-006): resolve the checklist to compute the document-upload step done flag.
  // resolveOnboarding(engagement, allRequiredProvided) needs allRequiredProvided from resolveChecklist.
  // Only needed when the letter is signed (step accessible) — otherwise allRequiredProvided defaults
  // to false (conservative) and no extra DB round-trip is needed.
  let allRequiredProvided: boolean | undefined;
  const letterSigned = engagement.letterSignedAt != null;
  if (letterSigned) {
    // resolveChecklist runs under the same request context (FILTER-governed).
    const checklist = await withRequestContext(
      identity.clerkUserId,
      identity.role,
      () => resolveChecklist(engagement.id),
    );
    allRequiredProvided = checklist.allRequiredProvided;
  }

  const model = resolveOnboarding(engagement, allRequiredProvided);

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

  // Resolve questionnaire + existing answer state in a single withRequestContext call.
  // Both reads run under the same SESSION_CONTEXT so the FILTER predicate governs both.
  // DECISION (TASK-006-005): We call getMyQuestionnaire() (which internally resolves the
  // engagement id via FILTER) and then getMyQuestionnaireAnswer() with that engagement id.
  // The questionnaire result carries the engagementId so we can load the answer without
  // a second withRequestContext wrapper.
  const questionnaireResult = await withRequestContext(
    identity.clerkUserId,
    identity.role,
    async () => {
      const questionnaire = await getMyQuestionnaire();
      if (!questionnaire) return null;

      // Also load existing answers (null = not yet submitted) — FILTER-governed.
      // getMyQuestionnaireAnswer is a Prisma request-pool read; SESSION_CONTEXT is set
      // by withRequestContext wrapping this async callback.
      const existingAnswer = await getMyQuestionnaireAnswer(questionnaire.engagementId);

      return {
        questionnaire,
        existingAnswer,
      };
    },
  );

  if (!questionnaireResult) {
    return { success: false, error: "No active engagement found" };
  }

  const { questionnaire, existingAnswer } = questionnaireResult;

  return {
    success: true,
    data: questionnaire,
    alreadySubmitted: existingAnswer !== null,
  };
}

/**
 * Submit the questionnaire answers for the authenticated CLIENT.
 *
 * Flow (AC-ONBD-003-03/-04, ADR-001/ADR-005, ADR-003, ADR-019):
 *   1. getClientIdentity() → must be CLIENT (role from verified session, never client-supplied).
 *   2. Resolve engagement + template server-side (getMyQuestionnaire under withRequestContext).
 *      The client NEVER supplies an engagementId, serviceId, or templateId.
 *   3. Gate check: checkStepAccessibility(engagement, 'intake-questionnaire').
 *      If the letter is unsigned → step locked → return refusal, no write.
 *   4. Validate answers against the resolved template's required questions (server-side).
 *      Missing required answers → return validation error, no write.
 *   5. submitQuestionnaireAsClient (REQUEST POOL, BLOCK-governed) — writes the answer row
 *      AND sets Engagement.questionnaireSubmittedAt in one batch.
 *      rowsAffected = 0 → BLOCK denied (not the owner) → refusal, no satisfaction.
 *   6. Audit the submission via recordAuthEvent (ADMIN POOL) — AFTER the owner-confirmed write.
 *      Fail-closed: no audit event for a non-event (ADR-019).
 *   7. revalidatePath('/onboarding') so the step reads as done.
 *
 * @param answersJson — serialized JSON { [questionId]: string } (DECISION-H).
 *   The client submits answers by question id; the templateId is server-derived only.
 *   NEVER includes a client-supplied engagement id, template id, or service id.
 *
 * AC-ONBD-003-01: templateId is server-derived via getMyQuestionnaire() — never client-supplied.
 * AC-ONBD-003-03: step satisfied only when this action succeeds (server-side, read model).
 * AC-ONBD-003-04: answers recorded against the engagement + questionnaireSubmittedAt set.
 * ADR-001/ADR-005: no client-supplied ids; BLOCK predicate enforces owner-only write.
 * ADR-003: reads run under withRequestContext(CLIENT) so the FILTER predicate governs.
 * ADR-019: audit event written only after a confirmed owner write.
 *
 * // DECISION (TASK-006-005): Two-pool coordination for the submission path mirrors
 * // signEngagementLetterAction (TASK-005-005):
 * //   1. submitQuestionnaireAsClient (REQUEST POOL, BLOCK-governed) runs FIRST.
 * //      rowsAffected = 0 → not the owner → STOP, return refusal, NO audit for a non-event.
 * //   2. Only after rowsAffected = 1, record the audit event (ADMIN POOL via recordAuthEvent).
 * //      The submission is idempotent at the DB layer once written (questionnaireSubmittedAt
 * //      is set once and stays set), so a failed audit write is the only non-atomic edge.
 * //
 * // DECISION (TASK-006-005): Answers JSON parse + required-question validation runs at the
 * //   action layer, not the DB layer (DECISION-H carries: JSON validated here, not by a DB
 * //   constraint). We parse answersJson as { [questionId]: string } and confirm all required
 * //   questions have non-empty answers before writing.
 */
export async function submitQuestionnaireAction(
  answersJson: string,
): Promise<SubmitQuestionnaireResult> {
  // Step 1: identity guard — CLIENT only (role from verified session)
  const identity = await getClientIdentity();
  if (!identity) {
    return { success: false, error: "Unauthorized: CLIENT identity required" };
  }

  // Step 2: resolve engagement + template server-side (no client-supplied ids).
  // DECISION (TASK-006-005): resolve engagement + questionnaire together under one
  // withRequestContext call. We need the full EngagementItem for the gate check, so
  // we call getMyEngagement() AND getMyQuestionnaire() in the same session context.
  // getMyQuestionnaire internally re-reads the engagement (belt-and-suspenders), but
  // the FILTER is exercised both times under the same SESSION_CONTEXT.
  const resolved = await withRequestContext(
    identity.clerkUserId,
    identity.role,
    async () => {
      const engagement = await getMyEngagement();
      if (!engagement) return null;
      const questionnaire = await getMyQuestionnaire();
      if (!questionnaire) return null;
      return { engagement, questionnaire };
    },
  );

  if (!resolved) {
    return { success: false, error: "No active engagement found" };
  }

  const { engagement, questionnaire } = resolved;

  // Step 3: gate check — letter must be signed before questionnaire is accessible.
  // checkStepAccessibility returns undefined if accessible, or a StepRefusal if locked.
  const refusal = checkStepAccessibility(engagement, "intake-questionnaire");
  if (refusal) {
    return {
      success: false,
      error: "Questionnaire is not yet accessible: engagement letter must be signed first",
      refused: true,
    };
  }

  // Step 4: validate answers against the template's required questions (server-side).
  // DECISION (TASK-006-005): Parse answersJson here — the templateId is server-derived from
  // questionnaire.template; the client cannot supply a different template.
  if (!questionnaire.template) {
    return {
      success: false,
      error: "No questionnaire template configured for this service type",
    };
  }

  let parsedAnswers: Record<string, unknown>;
  try {
    const raw: unknown = JSON.parse(answersJson);
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      throw new TypeError("answers must be a JSON object");
    }
    parsedAnswers = raw as Record<string, unknown>;
  } catch {
    return { success: false, error: "Invalid answers format: expected JSON object { [questionId]: string }" };
  }

  // F1: Reject any answer value that is not a string — a non-string (number, object, etc.)
  // would cause .trim() to throw a TypeError outside the try/catch above.
  for (const val of Object.values(parsedAnswers)) {
    if (typeof val !== "string") {
      return { success: false, error: "Invalid answers format: expected JSON object { [questionId]: string }" };
    }
  }

  // Safe cast: all values confirmed string above.
  const stringAnswers = parsedAnswers as Record<string, string>;

  // Validate all required questions have non-empty answers.
  let questions: QuestionDef[];
  try {
    const rawQuestions: unknown = JSON.parse(questionnaire.template.questions);
    if (!Array.isArray(rawQuestions)) {
      throw new TypeError("questions must be a JSON array");
    }
    questions = rawQuestions as QuestionDef[];
  } catch {
    return { success: false, error: "Template questions configuration is invalid" };
  }

  const missingRequired = questions
    .filter((q) => q.required && !stringAnswers[q.id]?.trim())
    .map((q) => q.id);

  if (missingRequired.length > 0) {
    return {
      success: false,
      error: `Missing required answers for questions: ${missingRequired.join(", ")}`,
    };
  }

  // F2: Reconstruct the stored blob from template question IDs only (key-whitelist).
  // Unknown keys from the client are dropped; the value type is already confirmed string.
  // Enforce a sane total-size cap (64 KB) before persisting to NVARCHAR(MAX).
  const sanitizedAnswers: Record<string, string> = {};
  for (const q of questions) {
    sanitizedAnswers[q.id] = stringAnswers[q.id] ?? "";
  }
  const sanitizedAnswersJson = JSON.stringify(sanitizedAnswers);
  const ANSWERS_MAX_BYTES = 65_536; // 64 KB — sane cap for NVARCHAR(MAX) serialized answers
  if (Buffer.byteLength(sanitizedAnswersJson, "utf8") > ANSWERS_MAX_BYTES) {
    return { success: false, error: "Answers payload exceeds maximum allowed size" };
  }

  // Step 5: owner-only BLOCK-governed write (REQUEST POOL).
  // submitQuestionnaireAsClient inserts the QuestionnaireAnswer row AND sets
  // Engagement.questionnaireSubmittedAt in one batch (DECISION in questionnaire-answer.ts).
  // rowsAffected = 0 → BLOCK denied (not the owner or null SESSION_CONTEXT) → refusal.
  // templateId is server-derived from questionnaire.template.id — never client-supplied.
  // Stored blob uses sanitizedAnswersJson (key-whitelisted, size-capped) — not raw client input.
  const submitResult = await submitQuestionnaireAsClient({
    engagementId: engagement.id,
    templateId: questionnaire.template.id,
    answers: sanitizedAnswersJson,
    clerkUserId: identity.clerkUserId,
    role: "CLIENT",
  });

  if (submitResult.rowsAffected === 0) {
    // BLOCK predicate denied the write — not the owner or SESSION_CONTEXT was null.
    // Do NOT record an audit event for a non-event (ADR-019).
    return {
      success: false,
      error: "Submission denied: not the owner of this engagement",
      refused: true,
    };
  }

  // Step 6: audit the submission event (ADMIN POOL, fail-closed — ADR-019).
  // DECISION (TASK-006-005): audit runs AFTER the request-pool write (two-pool coordination,
  // mirrors signEngagementLetterAction). The submission is idempotent at the DB layer once
  // questionnaireSubmittedAt is set.
  await recordAuthEvent({
    actor: { clerkUserId: identity.clerkUserId, role: "CLIENT" },
    action: "engagement.questionnaire_submitted",
    targetType: "Engagement",
    targetId: engagement.id,
    sourceSurface: "portal",
  });

  // Step 7: revalidate so the read model re-computes the step as done.
  revalidatePath("/onboarding");

  // Step 8 (TASK-008-002): best-effort completion trigger (AC-ONBD-006-01, AC-ONBD-007-01 path).
  //
  // DECISION (TASK-008-002): processOnboardingCompletion runs AFTER the step's own commit has
  // succeeded and revalidatePath has been called. This preserves D5 (best-effort-after-commit):
  // a failure here must NOT roll back or fail the already-committed questionnaire submission.
  // The fire-once guard in TASK-008-001 (D2: UPDATE WHERE status='New' + @@ROWCOUNT) makes a
  // later retry idempotent — if this call fails transiently, a re-submission of the questionnaire
  // will retrigger it safely. We use the server-resolved engagement.id (never client-supplied,
  // ADR-003). Error is logged server-side only — no client leak.
  try {
    await processOnboardingCompletion(engagement.id);
  } catch (completionErr: unknown) {
    console.error(
      "[submitQuestionnaireAction] processOnboardingCompletion failed (best-effort, step still committed):",
      completionErr,
    );
  }

  return { success: true };
}

// ─── EPIC-007: Document Upload Actions ────────────────────────────────────────

/**
 * Resolve the source IP server-side from the incoming request headers.
 * Mirrors the same function in sign-up/actions.ts (ADR-005, TASK-004-009).
 * ADR-022: rate-limit by source IP to prevent upload-path abuse.
 */
async function resolveSourceIpForUpload(): Promise<string> {
  const headerStore = await headers();
  const trustProxy = process.env["TRUST_PROXY"] === "true";

  if (trustProxy) {
    const xForwardedFor = headerStore.get("x-forwarded-for");
    if (xForwardedFor) {
      const firstIp = xForwardedFor.split(",")[0]?.trim();
      if (firstIp) return firstIp;
    }
    const xRealIp = headerStore.get("x-real-ip");
    if (xRealIp) return xRealIp.trim();
  }

  return "127.0.0.1";
}

/** Stable endpoint identifier for the portal upload surface (ADR-022 §1). */
const UPLOAD_URL_ENDPOINT = "portal:document-upload" as const;
const COMPLETE_UPLOAD_ENDPOINT = "portal:document-upload-complete" as const;

// ─── Result types ─────────────────────────────────────────────────────────────

/**
 * Input for requestUploadUrlAction.
 * Contains only upload metadata — the engagement is resolved server-side from SESSION_CONTEXT.
 * The requestId is the DocumentRequest.id; the server confirms the client owns the engagement
 * before using it. It does NOT bypass any authz check — authorizeEngagementForUpload runs FIRST.
 */
export interface RequestUploadUrlInput {
  /** The DocumentRequest.id this upload fulfills. Confirmed server-side after authz. */
  requestId: string;
  /** Original filename as declared by the uploader (ADR-009). */
  filename: string;
  /** Declared content-type (signed into the upload URL policy). */
  contentType: string;
  /** Declared content-length (advisory; authoritative size comes from stat() in completeUpload). */
  sizeBytes: number;
}

export type RequestUploadUrlResult =
  | {
      success: true;
      data: {
        /** The new Document.id — used in completeUploadAction. */
        documentId: string;
        /** The signed upload URL (client PUTs directly to storage — ADR-009). */
        uploadUrl: string;
        /** The storage key — used in completeUploadAction. */
        storageKey: string;
      };
    }
  | { success: false; error: string; refused?: boolean };

export type CompleteUploadInput = {
  /** The Document.id returned by requestUploadUrlAction. */
  documentId: string;
  /** The storage key returned by requestUploadUrlAction. */
  storageKey: string;
};

export type CompleteUploadActionResult =
  | {
      success: true;
      data: {
        outcome: "active" | "infected" | "pending";
        documentId: string;
      };
    }
  | { success: false; error: string; refused?: boolean };

export type GetChecklistResult =
  | { success: true; data: ChecklistReadModel }
  | { success: false; error: string; refused?: boolean };

// ─── Server Actions ───────────────────────────────────────────────────────────

/**
 * Get the document-upload checklist for the authenticated CLIENT's engagement.
 *
 * No-arg action: the engagement is resolved server-side (no client-supplied id).
 * Used by DocumentUploadStep after an upload to refresh the checklist.
 *
 * ADR-001/ADR-005: engagement resolved server-side from SESSION_CONTEXT.
 * ADR-003: runs under withRequestContext(CLIENT) so FILTER predicate governs.
 * EPIC-005 letter gate: checkStepAccessibility enforces server-side refusal.
 */
export async function getChecklistAction(): Promise<GetChecklistResult> {
  const identity = await getClientIdentity();
  if (!identity) {
    return { success: false, error: "Unauthorized: CLIENT identity required" };
  }

  const resolved = await withRequestContext(
    identity.clerkUserId,
    identity.role,
    async () => {
      const engagement = await getMyEngagement();
      if (!engagement) return null;

      // Gate check: letter must be signed before document-upload is accessible.
      const refusal = checkStepAccessibility(engagement, "document-upload");
      if (refusal) return { refused: true } as const;

      const checklist = await resolveChecklist(engagement.id);
      return { engagement, checklist };
    },
  );

  if (!resolved) {
    return { success: false, error: "No active engagement found" };
  }

  if ("refused" in resolved) {
    return {
      success: false,
      error: "Document upload step is not yet accessible: engagement letter must be signed first",
      refused: true,
    } as const;
  }

  return { success: true, data: resolved.checklist };
}

/**
 * Phase 1 of the two-phase upload pipeline (ADR-009 step 2).
 *
 * Authorize the CLIENT for upload, insert a pending Document row, and mint a signed
 * upload URL so the client can PUT bytes directly to storage (app never proxies bytes).
 *
 * Flow (ADR-009 / ADR-019 / ADR-022):
 *   1. getClientIdentity() → must be CLIENT (role from verified session, never client input).
 *   2. getRateLimiter().consume(...) (ADR-022) — refuse if throttled (BEFORE authz).
 *   3. checkStepAccessibility(engagement, 'document-upload') — refuse if letter unsigned (EPIC-005).
 *   4. authorizeEngagementForUpload(engagementId) (request pool / FILTER) → EngagementItem or null.
 *      null → 404 / refuse. Confirms the caller owns the engagement.
 *   5. insertPendingDocument(admin pool) → documentId + storageKey.
 *   6. getStorage().getSignedUploadUrl(storageKey) → signed upload URL.
 *   7. recordAuthEvent (ADR-019) — audit after the owner-confirmed pending insert.
 *   8. Return { documentId, uploadUrl, storageKey } to the client.
 *
 * SECURITY GUARDRAIL: The engagement is owner-resolved server-side.
 * The requestId in the input is the DocumentRequest.id — it is recorded on the Document row
 * for checklist linkage but is NOT used to bypass any authz check. authorizeEngagementForUpload
 * uses the engagement.id from the server-resolved engagement (not from the client).
 *
 * ADR-009: signed upload URL; client PUTs directly; app never proxies bytes.
 * ADR-022: rate-limit BEFORE authorize.
 * EPIC-005 letter gate: checkStepAccessibility refused first.
 * ADR-019: audit after owner-confirmed write.
 * ADR-001/ADR-005: engagementId owner-resolved server-side (FILTER) — never client input.
 */
export async function requestUploadUrlAction(
  input: RequestUploadUrlInput,
): Promise<RequestUploadUrlResult> {
  // Step 1: identity guard — CLIENT only (role from verified session)
  const identity = await getClientIdentity();
  if (!identity) {
    return { success: false, error: "Unauthorized: CLIENT identity required" };
  }

  // Step 2: ADR-022 rate-limit BEFORE authorize.
  // Mirrors sign-up/actions.ts signUpWithInvitation rate-limit pattern.
  const sourceIp = await resolveSourceIpForUpload();
  const rateLimitKey = buildRateLimitKey(sourceIp, UPLOAD_URL_ENDPOINT);
  const limiter = getRateLimiter();
  const rateLimitResult = limiter.consume(rateLimitKey);

  if (!rateLimitResult.allowed) {
    return {
      success: false,
      error: "Too many upload attempts. Please wait before trying again.",
    };
  }

  // Step 3: resolve engagement server-side (no client-supplied engagementId).
  // authorizeEngagementForUpload uses the FILTER predicate — fail-closed for non-owners.
  const resolved = await withRequestContext(
    identity.clerkUserId,
    identity.role,
    async () => {
      const engagement = await getMyEngagement();
      if (!engagement) return null;

      // Step 3a: EPIC-005 letter gate — must be signed before upload is accessible.
      const refusal = checkStepAccessibility(engagement, "document-upload");
      if (refusal) return { refused: true } as const;

      // Step 3b: Confirm ownership via FILTER-governed authz query (ADR-009 step 2a).
      const authorizedEngagement = await authorizeEngagementForUpload(engagement.id);
      if (!authorizedEngagement) return null;

      return { engagement: authorizedEngagement };
    },
  );

  if (!resolved) {
    return { success: false, error: "Engagement not found", refused: true };
  }

  if ("refused" in resolved) {
    return {
      success: false,
      error: "Document upload step is not yet accessible: engagement letter must be signed first",
      refused: true,
    };
  }

  const { engagement } = resolved;

  // m1 guard: confirm the client-supplied requestId belongs to the resolved engagement.
  // We query under the request pool (FILTER-governed) so CLIENT-B cannot link to CLIENT-A's
  // DocumentRequest. If the requestId is not found in the caller's engagement, treat as null
  // (ad-hoc upload) rather than linking to an unverified checklist item.
  let verifiedDocumentRequestId: string | null = null;
  if (input.requestId) {
    const ownedRequests = await withRequestContext(
      identity.clerkUserId,
      identity.role,
      () => listDocumentRequestsForEngagement(engagement.id),
    );
    const matched = ownedRequests.find((r) => r.id === input.requestId);
    verifiedDocumentRequestId = matched?.id ?? null;
  }

  // Step 4: Insert the pending Document row (admin pool — ADR-009 step 2d).
  // requestId is the DocumentRequest.id linking this upload to a checklist item.
  // uploadedByClerkId is from the server-verified session (ADR-005 / ADR-019 audit trail).
  let pendingResult: { documentId: string; storageKey: string };
  try {
    pendingResult = await insertPendingDocument({
      engagementId: engagement.id,
      documentRequestId: verifiedDocumentRequestId,
      originalFilename: input.filename,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      uploadedByClerkId: identity.clerkUserId,
    });
  } catch (err: unknown) {
    // m3: log full error server-side; return a generic stable message to the client
    // to avoid leaking internal topology (storage host, SQL object names, etc.).
    console.error("[requestUploadUrlAction] insertPendingDocument failed:", err);
    return {
      success: false,
      error: "Failed to register upload. Please try again.",
    };
  }

  const { documentId, storageKey } = pendingResult;

  // Step 5: mint the signed upload URL (ADR-009 step 2e).
  // The client PUTs bytes directly to storage — the app never proxies bytes (ADR-009).
  const storage = getStorage();
  const signedUpload = await storage.getSignedUploadUrl(storageKey, {
    contentType: input.contentType,
    maxSizeBytes: 100 * 1024 * 1024, // 100 MB cap (ADR-021 § ADR-008 §)
  });

  // DECISION (TASK-007-006): Rewrite the signed URL's origin for browser consumption.
  //
  // In local/CI docker-compose, the portal server connects to Azurite at the Docker-internal
  // hostname "azurite:10000" (set in PORTAL_STORAGE_CONNECTION_STRING). The SAS URL produced
  // by BlobServiceClient uses that same internal hostname. However, the client browser (running
  // on the host) cannot resolve "azurite" — the host can only reach the emulator via localhost
  // (the mapped port from docker-compose: ${AZURITE_PORT:-10000}:10000).
  //
  // BLOB_PUBLIC_ENDPOINT (optional): when set, its origin replaces the storage URL's origin
  // before the URL is returned to the browser. The path and query string (SAS params) are
  // preserved verbatim — only the scheme+host+port are swapped.
  //
  // Example (docker-compose local stack):
  //   STORAGE_CONNECTION_STRING → BlobEndpoint=http://azurite:10000/devstoreaccount1
  //   Signed URL generated       → http://azurite:10000/devstoreaccount1/...?sas-params
  //   BLOB_PUBLIC_ENDPOINT       → http://localhost:10000
  //   Rewritten URL returned     → http://localhost:10000/devstoreaccount1/...?sas-params
  //
  // In production (real Azure), internal and external URLs are the same — BLOB_PUBLIC_ENDPOINT
  // is not set and the URL is returned as-is.
  let uploadUrl = signedUpload.url;
  const blobPublicEndpoint = process.env["BLOB_PUBLIC_ENDPOINT"];
  if (blobPublicEndpoint) {
    try {
      const internal = new URL(uploadUrl);
      const publicOrigin = new URL(blobPublicEndpoint);
      // Swap scheme+host+port; keep path + search + hash intact.
      internal.protocol = publicOrigin.protocol;
      internal.hostname = publicOrigin.hostname;
      internal.port = publicOrigin.port;
      uploadUrl = internal.toString();
    } catch {
      // Malformed BLOB_PUBLIC_ENDPOINT — log and fall back to the original URL.
      // A browser-side upload failure will surface the misconfiguration.
      console.warn(
        "[requestUploadUrlAction] BLOB_PUBLIC_ENDPOINT is set but could not be parsed; " +
          "returning raw storage URL. Browser-side PUT may fail if the storage host is " +
          "not reachable from the client. Value:",
        blobPublicEndpoint,
      );
    }
  }

  // Step 6: audit the upload-URL mint after the owner-confirmed write (ADR-019).
  // DECISION (TASK-007-006): audit the pending insert (URL mint = commitment to storage path).
  // The completion audit is in completeUploadAction (after the scan-promote gate).
  // mirrors submitQuestionnaireAction: audit runs after rowsAffected=1 (owner-confirmed write).
  await recordAuthEvent({
    actor: { clerkUserId: identity.clerkUserId, role: "CLIENT" },
    action: "document.upload_url_minted",
    targetType: "Engagement",
    targetId: engagement.id,
    sourceSurface: "portal",
  });

  return {
    success: true,
    data: {
      documentId,
      uploadUrl,
      storageKey,
    },
  };
}

/**
 * Phase 2 of the two-phase upload pipeline (ADR-009 / ADR-021).
 *
 * Called after the client has PUT bytes to the signed upload URL.
 * Drives the scan-before-available gate (ADR-021 / AC-NFR-009-01/-02):
 *   - 'clean' + validation 'pass' → promote to 'active' (Document available)
 *   - 'infected'                  → promote to 'infected' (AC-NFR-009-02: withheld)
 *   - 'indeterminate' / fail      → stay 'pending' (fail-closed)
 *
 * The DocumentUploadStep component reflects the outcome:
 *   - 'active'   → checklist refreshed; fulfilled item leaves outstanding (AC-FILE-008-03)
 *   - 'infected' → rejection message shown to uploader (AC-NFR-009-02)
 *   - 'pending'  → transient "being processed" message
 *
 * Flow:
 *   1. getClientIdentity() → must be CLIENT (role from verified session, never client input).
 *   2. getRateLimiter().consume(...) (ADR-022 — upload-complete path).
 *   3. checkStepAccessibility (EPIC-005 letter gate) — refuse if letter unsigned.
 *   4. completeUpload(documentId, storageKey) — stat + validate + scan + promote.
 *   5. recordAuthEvent (ADR-019) — audit after the scan-promote gate.
 *   6. revalidatePath('/onboarding') — re-computes the step done flag (AC-ONBD-004-04).
 *
 * ADR-009: complete after PUT.
 * ADR-021: scan-before-available gate.
 * ADR-019: audit after owner-confirmed scan result.
 * ADR-022: rate-limit on the complete path too.
 * EPIC-005 letter gate: refused server-side if letter unsigned.
 */
export async function completeUploadAction(
  input: CompleteUploadInput,
): Promise<CompleteUploadActionResult> {
  // Step 1: identity guard — CLIENT only (role from verified session)
  const identity = await getClientIdentity();
  if (!identity) {
    return { success: false, error: "Unauthorized: CLIENT identity required" };
  }

  // Step 2: ADR-022 rate-limit on the complete path.
  const sourceIp = await resolveSourceIpForUpload();
  const rateLimitKey = buildRateLimitKey(sourceIp, COMPLETE_UPLOAD_ENDPOINT);
  const limiter = getRateLimiter();
  const rateLimitResult = limiter.consume(rateLimitKey);

  if (!rateLimitResult.allowed) {
    return {
      success: false,
      error: "Too many requests. Please wait before trying again.",
    };
  }

  // Step 3: EPIC-005 letter gate + M1 ownership check.
  // Resolve engagement server-side for the gate check, and verify the client-supplied
  // documentId belongs to the caller's engagement under the request pool (FILTER-governed).
  const engagementAndOwnership = await withRequestContext(
    identity.clerkUserId,
    identity.role,
    async () => {
      const eng = await getMyEngagement();
      if (!eng) return null;

      // M1: load the document under the request pool — RLS FILTER returns null if the
      // document does not belong to this caller's engagement (cross-owner isolation).
      const docOwnership = await getDocumentForOwnershipCheck(input.documentId);

      return { engagement: eng, docOwnership };
    },
  );

  if (!engagementAndOwnership) {
    return { success: false, error: "No active engagement found", refused: true };
  }

  const { engagement, docOwnership } = engagementAndOwnership;

  const refusal = checkStepAccessibility(engagement, "document-upload");
  if (refusal) {
    return {
      success: false,
      error: "Document upload step is not yet accessible: engagement letter must be signed first",
      refused: true,
    };
  }

  // M1: confirm the document is owned by this engagement (RLS-filtered above; double-check
  // the engagementId matches the server-resolved engagement).
  if (
    !docOwnership ||
    docOwnership.engagementId.toLowerCase() !== engagement.id.toLowerCase()
  ) {
    console.warn(
      "[completeUploadAction] document ownership check failed: documentId not visible " +
        "to caller or does not belong to their engagement",
      { documentId: input.documentId, callerEngagementId: engagement.id },
    );
    return { success: false, error: "Document not found or access denied." };
  }

  // Step 4: scan-promote gate (ADR-021 / AC-NFR-009-01/-02).
  // completeUpload: stat → validate → scan → promote active|infected|stay pending.
  // Pass the server-resolved engagementId so the admin-pool promotion is scoped
  // by engagementId (defence-in-depth — M1 root-cause fix).
  let scanResult: Awaited<ReturnType<typeof completeUpload>>;
  try {
    scanResult = await completeUpload({
      documentId: input.documentId,
      storageKey: input.storageKey,
      uploadedByClerkId: identity.clerkUserId,
      engagementId: engagement.id,
    });
  } catch (err: unknown) {
    // m3: log full error server-side; return a generic stable message to the client.
    console.error("[completeUploadAction] completeUpload failed:", err);
    return {
      success: false,
      error: "Upload processing failed. Please try again.",
    };
  }

  // Step 5: audit after the scan-promote gate (ADR-019).
  // Action distinguishes outcome for the audit trail.
  const auditAction =
    scanResult.outcome === "active"
      ? "document.upload_completed"
      : scanResult.outcome === "infected"
      ? "document.upload_rejected_malicious"
      : "document.upload_pending";

  await recordAuthEvent({
    actor: { clerkUserId: identity.clerkUserId, role: "CLIENT" },
    action: auditAction,
    targetType: "Engagement",
    targetId: engagement.id,
    sourceSurface: "portal",
  });

  // Step 6: revalidate so the onboarding read model re-computes the step done flag (AC-ONBD-004-04).
  // resolveOnboarding(engagement, allRequiredProvided) needs the fresh checklist.
  // revalidatePath causes the page to re-fetch the read model including resolveChecklist.
  revalidatePath("/onboarding");

  // Step 7 (TASK-008-002): best-effort completion trigger (AC-ONBD-006-01, AC-ONBD-007-01 path).
  //
  // DECISION (TASK-008-002): processOnboardingCompletion runs AFTER the step's own commit has
  // succeeded and revalidatePath has been called. This preserves D5 (best-effort-after-commit):
  // a failure here must NOT roll back or fail the already-committed upload completion result.
  // The fire-once guard in TASK-008-001 (D2: UPDATE WHERE status='New' + @@ROWCOUNT) makes a
  // later retry idempotent — if this call fails transiently, re-completing the upload will
  // retrigger it safely. We use the server-resolved engagement.id (never client-supplied,
  // ADR-003). Error is logged server-side only — no client leak.
  try {
    await processOnboardingCompletion(engagement.id);
  } catch (completionErr: unknown) {
    console.error(
      "[completeUploadAction] processOnboardingCompletion failed (best-effort, step still committed):",
      completionErr,
    );
  }

  return {
    success: true,
    data: {
      outcome: scanResult.outcome,
      documentId: scanResult.documentId,
    },
  };
}
