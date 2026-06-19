/**
 * packages/db/src/onboarding.ts — Onboarding read model + step-accessibility logic
 *
 * Resolves the three-step onboarding read model from an EngagementItem's runtime state.
 * Accessibility is derived server-side from `letterSignedAt` — never stored.
 *
 * AC-ONBD-001-01: Three ordered steps: ['engagement-letter', 'intake-questionnaire', 'document-upload'].
 * AC-ONBD-001-02: A later step cannot be entered before the letter is signed (server refuses).
 * AC-ONBD-001-03: currentStep + remaining derivable from signed/unsigned state.
 * AC-ONBD-002-01: questionnaire step is inaccessible (refused, not hidden) while letterSignedAt is NULL.
 * AC-ONBD-002-02: document-upload step is inaccessible (refused, not hidden) while letterSignedAt is NULL.
 * AC-ONBD-002-03: sign → steps 2/3 become accessible.
 * AC-ONBD-003-03: questionnaire step is done only when questionnaireSubmittedAt is non-null (EPIC-006).
 * AC-ONBD-004-04: document-upload step done flag = allRequiredProvided from the checklist read model (EPIC-007).
 *
 * DECISION (TASK-005-005): Step accessibility is derived server-side from letterSignedAt + the
 * fixed step order — it is NEVER stored as a separate column. This is drift-free (no two sources
 * of truth) and means a sign action atomically unlocks steps 2/3 at the DB layer.
 *
 * DECISION (TASK-005-005): Steps 2/3 are gated by `letterSignedAt != null`. EPIC-006 adds
 * the questionnaire step's `done` flag via `questionnaireSubmittedAt` (DECISION-I / TASK-006-001).
 * EPIC-007 (TASK-007-004): the document-upload step's `done` flag is `allRequiredProvided` from
 * the checklist read model — wired here per the dispatch contract.
 */

import type { EngagementItem } from "./repositories/engagement.js";

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * The canonical step key enumeration (AC-ONBD-001-01).
 * Fixed order — never reorder these without updating resolveOnboarding.
 */
export type OnboardingStepKey =
  | "engagement-letter"
  | "intake-questionnaire"
  | "document-upload";

/**
 * Per-step accessibility + completion state.
 *
 * accessible: true  — the client may enter this step.
 * accessible: false — the server refuses entry to this step (not hidden; refused).
 * done: true        — the step has been completed (signed/submitted).
 */
export interface OnboardingStep {
  key: OnboardingStepKey;
  /** Whether the server permits the client to enter this step. */
  accessible: boolean;
  /** Whether this step has been completed. */
  done: boolean;
}

/**
 * The onboarding read model returned by resolveOnboarding.
 *
 * AC-ONBD-001-01: steps is always exactly ['engagement-letter', 'intake-questionnaire', 'document-upload'].
 * AC-ONBD-001-03: currentStep (the first non-done accessible step) + remaining (count after current).
 */
export interface OnboardingReadModel {
  engagementId: string;
  steps: [OnboardingStep, OnboardingStep, OnboardingStep];
  /** The key of the current active step (first non-done step). */
  currentStep: OnboardingStepKey;
  /** Number of steps remaining after the current step. */
  remaining: number;
}

/**
 * Refusal result — returned when a locked step entry is attempted.
 * The server refuses (not merely hides) the step (AC-ONBD-001-02 / AC-ONBD-002-01/-02).
 */
export interface StepRefusal {
  refused: true;
  reason: "step-locked" | "not-found";
  stepKey: OnboardingStepKey;
}

// ─── Implementation ───────────────────────────────────────────────────────────

/**
 * Resolve the onboarding read model from a loaded EngagementItem.
 *
 * Derives all step accessibility + position from `letterSignedAt` — no separate state store.
 *
 * AC-ONBD-001-01: Returns exactly three ordered steps in fixed order.
 * AC-ONBD-001-02: Steps 2/3 inaccessible (accessible: false) when letterSignedAt is NULL.
 * AC-ONBD-001-03: currentStep + remaining derived from state.
 * AC-ONBD-002-01/-02: steps 2/3 are accessible: false until letterSignedAt is set.
 * AC-ONBD-002-03: once letterSignedAt is non-null, steps 2/3 become accessible: true.
 * AC-ONBD-003-03: intake-questionnaire step is done when questionnaireSubmittedAt is non-null (EPIC-006).
 * AC-ONBD-004-04: document-upload step done = allRequiredProvided (EPIC-007 / TASK-007-004).
 *
 * DECISION (TASK-007-004): allRequiredProvided is an OPTIONAL parameter. When provided, it drives
 * the document-upload `done` flag directly (the caller has already called resolveChecklist).
 * When absent (undefined), the done flag defaults to false — matching the pre-EPIC-007 behavior
 * and allowing pages that don't need the full checklist to call resolveOnboarding without
 * an extra DB round-trip. Callers that need the accurate `done` flag MUST pass allRequiredProvided.
 * The server actions in apps/portal (TASK-007-006) call resolveChecklist and pass the result here.
 *
 * @param engagement — the EngagementItem (already fetched under client's SESSION_CONTEXT / FILTER).
 * @param allRequiredProvided — from resolveChecklist(); drives the document-upload done flag.
 *                              When undefined, defaults to false (conservative / correct pre-EPIC-007 behavior).
 */
export function resolveOnboarding(
  engagement: EngagementItem,
  allRequiredProvided?: boolean,
): OnboardingReadModel {
  const signed = engagement.letterSignedAt != null;
  // DECISION-I (EPIC-006): questionnaire step done flag from questionnaireSubmittedAt (AC-ONBD-003-03)
  const questionnaireDone = engagement.questionnaireSubmittedAt != null;
  // EPIC-007 (TASK-007-004): document-upload done flag from the checklist read model (AC-ONBD-004-04).
  // allRequiredProvided=undefined → false (conservative default; see DECISION above).
  const documentUploadDone = allRequiredProvided === true;

  const steps: [OnboardingStep, OnboardingStep, OnboardingStep] = [
    {
      key: "engagement-letter",
      accessible: true,          // always accessible — this is where onboarding starts
      done: signed,              // done once letterSignedAt is set
    },
    {
      key: "intake-questionnaire",
      accessible: signed,        // AC-ONBD-002-01: locked until signed
      done: questionnaireDone,   // AC-ONBD-003-03: done once questionnaireSubmittedAt is set (EPIC-006)
    },
    {
      key: "document-upload",
      accessible: signed,        // AC-ONBD-002-02: locked until signed
      done: documentUploadDone,  // AC-ONBD-004-04: done = allRequiredProvided (EPIC-007 / TASK-007-004)
    },
  ];

  // Derive currentStep: the first non-done step (or the last step if all done).
  // AC-ONBD-001-03: position derived from state.
  let currentIdx = 0;
  for (let i = 0; i < steps.length; i++) {
    if (!steps[i]!.done) {
      currentIdx = i;
      break;
    }
    // If all steps are done, currentIdx stays at last step.
    currentIdx = i;
  }

  const currentStep = steps[currentIdx]!.key;
  const remaining = steps.length - 1 - currentIdx;

  return {
    engagementId: engagement.id,
    steps,
    currentStep,
    remaining,
  };
}

/**
 * Check whether a given step is accessible for an engagement.
 *
 * Returns undefined when accessible, or a StepRefusal when the step is locked.
 *
 * Used by server entry points for steps 2/3 to enforce the server-side hard gate
 * (AC-ONBD-001-02 / AC-ONBD-002-01/-02). A reviewer bypassing the UI still hits this check.
 *
 * @param engagement — the EngagementItem to check against.
 * @param stepKey — the step the client is attempting to enter.
 */
export function checkStepAccessibility(
  engagement: EngagementItem,
  stepKey: OnboardingStepKey,
): StepRefusal | undefined {
  const model = resolveOnboarding(engagement);
  const step = model.steps.find((s) => s.key === stepKey);

  if (!step) {
    return { refused: true, reason: "not-found", stepKey };
  }

  if (!step.accessible) {
    return { refused: true, reason: "step-locked", stepKey };
  }

  return undefined; // accessible
}
