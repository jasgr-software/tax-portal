/**
 * packages/db/src/onboarding-completion.predicate.test.ts
 *
 * TIER-2 UNIT TEST — pure function, no DB required (ADR-012)
 *
 * Truth-table tests for isOnboardingComplete().
 * Exercises every combination of the three step `done` flags.
 *
 * Tagged AC IDs:
 *   AC-ONBD-005-01 — true iff all three steps are done
 *   AC-ONBD-005-02 — false when any one step is not done
 */

import { describe, it, expect } from "vitest";
import { isOnboardingComplete } from "./onboarding-completion.js";
import type { OnboardingReadModel } from "./onboarding.js";

// ─── Helper: build a read model with controllable done flags ─────────────────

/**
 * Build a minimal OnboardingReadModel with the given step done flags.
 * Accessibility does not affect the completion predicate — only `done` matters.
 */
function buildModel(opts: {
  letterDone: boolean;
  questionnaireDone: boolean;
  documentUploadDone: boolean;
}): OnboardingReadModel {
  return {
    engagementId: "test-engagement-id",
    steps: [
      {
        key: "engagement-letter",
        accessible: true,
        done: opts.letterDone,
      },
      {
        key: "intake-questionnaire",
        accessible: opts.letterDone,
        done: opts.questionnaireDone,
      },
      {
        key: "document-upload",
        accessible: opts.letterDone,
        done: opts.documentUploadDone,
      },
    ],
    currentStep: opts.letterDone
      ? opts.questionnaireDone
        ? "document-upload"
        : "intake-questionnaire"
      : "engagement-letter",
    remaining: 0,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("isOnboardingComplete — AC-ONBD-005-01 / AC-ONBD-005-02 truth table", () => {

  /**
   * [AC-ONBD-005-01] All three steps done → complete (the one true case).
   */
  it("AC-ONBD-005-01 — all three steps done → complete (true)", () => {
    const model = buildModel({
      letterDone: true,
      questionnaireDone: true,
      documentUploadDone: true,
    });
    expect(isOnboardingComplete(model)).toBe(true);
  });

  /**
   * [AC-ONBD-005-02] Letter not done → not complete.
   * Single-step-unsatisfied case: only letter missing.
   */
  it("AC-ONBD-005-02 — letter NOT done (questionnaire + upload done) → not complete (false)", () => {
    const model = buildModel({
      letterDone: false,
      questionnaireDone: true,
      documentUploadDone: true,
    });
    expect(isOnboardingComplete(model)).toBe(false);
  });

  /**
   * [AC-ONBD-005-02] Questionnaire not done → not complete.
   * Single-step-unsatisfied case: only questionnaire missing.
   */
  it("AC-ONBD-005-02 — questionnaire NOT done (letter + upload done) → not complete (false)", () => {
    const model = buildModel({
      letterDone: true,
      questionnaireDone: false,
      documentUploadDone: true,
    });
    expect(isOnboardingComplete(model)).toBe(false);
  });

  /**
   * [AC-ONBD-005-02] Document upload not done → not complete.
   * Single-step-unsatisfied case: only document upload missing.
   */
  it("AC-ONBD-005-02 — document upload NOT done (letter + questionnaire done) → not complete (false)", () => {
    const model = buildModel({
      letterDone: true,
      questionnaireDone: true,
      documentUploadDone: false,
    });
    expect(isOnboardingComplete(model)).toBe(false);
  });

  /**
   * [AC-ONBD-005-02] No steps done → not complete.
   * All steps unsatisfied (fresh engagement).
   */
  it("AC-ONBD-005-02 — no steps done → not complete (false)", () => {
    const model = buildModel({
      letterDone: false,
      questionnaireDone: false,
      documentUploadDone: false,
    });
    expect(isOnboardingComplete(model)).toBe(false);
  });

  /**
   * [AC-ONBD-005-02] Letter done only → not complete.
   * Two steps unsatisfied.
   */
  it("AC-ONBD-005-02 — only letter done → not complete (false)", () => {
    const model = buildModel({
      letterDone: true,
      questionnaireDone: false,
      documentUploadDone: false,
    });
    expect(isOnboardingComplete(model)).toBe(false);
  });

  /**
   * [AC-ONBD-005-02] Questionnaire done only → not complete.
   * (Unusual state — questionnaire accessible requires letter signed; but predicate is pure.)
   */
  it("AC-ONBD-005-02 — only questionnaire done → not complete (false)", () => {
    const model = buildModel({
      letterDone: false,
      questionnaireDone: true,
      documentUploadDone: false,
    });
    expect(isOnboardingComplete(model)).toBe(false);
  });

  /**
   * [AC-ONBD-005-02] Document upload done only → not complete.
   */
  it("AC-ONBD-005-02 — only document upload done → not complete (false)", () => {
    const model = buildModel({
      letterDone: false,
      questionnaireDone: false,
      documentUploadDone: true,
    });
    expect(isOnboardingComplete(model)).toBe(false);
  });

  /**
   * [AC-ONBD-005-02] Letter + questionnaire done, upload not done → not complete.
   */
  it("AC-ONBD-005-02 — letter + questionnaire done, upload NOT done → not complete (false)", () => {
    const model = buildModel({
      letterDone: true,
      questionnaireDone: true,
      documentUploadDone: false,
    });
    expect(isOnboardingComplete(model)).toBe(false);
  });

  /**
   * [AC-ONBD-005-02] Letter + upload done, questionnaire not done → not complete.
   */
  it("AC-ONBD-005-02 — letter + upload done, questionnaire NOT done → not complete (false)", () => {
    const model = buildModel({
      letterDone: true,
      questionnaireDone: false,
      documentUploadDone: true,
    });
    expect(isOnboardingComplete(model)).toBe(false);
  });

});
