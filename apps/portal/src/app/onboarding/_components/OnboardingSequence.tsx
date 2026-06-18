/**
 * apps/portal/src/app/onboarding/_components/OnboardingSequence.tsx
 *
 * Renders the three-step onboarding sequence with position indicator, locked affordances,
 * the letter-sign step, and the questionnaire step.
 *
 * AC-ONBD-001-01: Exactly three ordered steps rendered in fixed order.
 * AC-ONBD-001-03: Current position (step N of 3) + remaining steps shown.
 * AC-ONBD-002-01/-02 UI: Steps 2/3 render locked (lock icon + explanation) when accessible:false.
 * AC-ONBD-002-03 UI: Steps 2/3 render unlocked when accessible:true (after signing).
 * AC-ONBD-003-01 UI: Questionnaire step renders the resolved template for the service type.
 * AC-ONBD-003-03 UI: Questionnaire step shows unsatisfied/submitted affordance.
 *
 * GUARDRAIL: This component renders what the server returns — it does NOT compute its own
 * accessibility gate. All accessibility flags come from OnboardingReadModel (TASK-005-005).
 * The UI lock is a PRESENTATION AFFORDANCE ONLY — the real enforcement is the server-side
 * refusal in checkStepAccessibility / signEngagementLetterAction (TASK-005-005).
 *
 * data-* attributes: used by TASK-005-007 + TASK-006-006 e2e for deterministic assertion.
 * Same convention as EPIC-003's data-status on RequestList rows.
 *
 * ADR-006: Portal-only component — not reachable from apps/admin.
 */

import type { OnboardingReadModel, QuestionnaireForEngagement } from "@tax-portal/db";
import { LetterSignStep } from "./LetterSignStep";
import { QuestionnaireStep } from "./QuestionnaireStep";

// ─── Types ────────────────────────────────────────────────────────────────────

interface OnboardingSequenceProps {
  /** The onboarding read model from the server (TASK-005-005 — never computed client-side). */
  model: OnboardingReadModel;
  /**
   * The accountant's edited template content for the letter step (AC-IDNT-007-03).
   * Passed down from the server load — rendered as auto-escaped JSX text (ADR-024 §6).
   * Never rendered via dangerouslySetInnerHTML.
   */
  letterContent: string;
  /**
   * The resolved questionnaire for the client's engagement service type (TASK-006-003/004).
   * null = no engagement found or resolution failed (QuestionnaireStep shows awaiting state).
   * questionnaire.template = null = no template authored yet (awaiting state).
   *
   * ADR-001/ADR-005: server-resolved; never from a client-supplied id.
   * TASK-006-005 will extend this to carry alreadySubmitted + existingAnswers.
   */
  questionnaire: QuestionnaireForEngagement | null;
  /**
   * Whether the client has already submitted the questionnaire (AC-ONBD-003-03).
   * True → QuestionnaireStep renders satisfied/read-only state.
   * Server-derived (TASK-006-005); never client-asserted.
   */
  alreadySubmitted: boolean;
  /**
   * Existing answers if previously submitted (DECISION-H: serialized JSON blob).
   * null when no prior submission exists.
   */
  existingAnswers: string | null;
}

// ─── Step metadata ────────────────────────────────────────────────────────────

const STEP_LABELS: Record<string, string> = {
  "engagement-letter": "Engagement Letter",
  "intake-questionnaire": "Intake Questionnaire",
  "document-upload": "Document Upload",
};

const STEP_DESCRIPTIONS: Record<string, string> = {
  "engagement-letter": "Review and sign your engagement letter to get started.",
  "intake-questionnaire": "Complete the intake questionnaire so your accountant can prepare your return.",
  "document-upload": "Upload your tax documents for review.",
};

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * OnboardingSequence — three-step onboarding progress + locked/unlocked affordances.
 *
 * This is a server component (no 'use client' directive). The LetterSignStep and
 * QuestionnaireStep children are client components (they own button + action calls).
 *
 * AC-ONBD-001-01: Three steps rendered in the fixed order from the model.
 * AC-ONBD-001-03: Position indicator ("Step N of 3") + remaining count.
 * AC-ONBD-002-01/-02 UI: Locked steps display a lock icon + unlock instruction.
 * AC-ONBD-002-03 UI: Accessible steps display their content normally.
 * AC-ONBD-003-01 UI: Questionnaire step renders the service-type template (TASK-006-004).
 * AC-ONBD-003-03 UI: Questionnaire step shows not-submitted/submitted affordance.
 */
export function OnboardingSequence({
  model,
  letterContent,
  questionnaire,
  alreadySubmitted,
  existingAnswers,
}: OnboardingSequenceProps) {
  const totalSteps = model.steps.length;
  // stepNumber is 1-based index of the current step (first non-done step).
  const currentIdx = model.steps.findIndex((s) => s.key === model.currentStep);
  const stepNumber = (currentIdx === -1 ? 0 : currentIdx) + 1;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900 mb-2">
          Onboarding
        </h1>
        {/* AC-ONBD-001-03: Current position + remaining count */}
        <p
          className="text-sm text-gray-500"
          data-testid="onboarding-position"
          data-current-step={model.currentStep}
          data-remaining={model.remaining}
        >
          Step {stepNumber} of {totalSteps}
          {model.remaining > 0 && (
            <span> — {model.remaining} step{model.remaining !== 1 ? "s" : ""} remaining</span>
          )}
          {model.remaining === 0 && (
            <span> — all steps complete</span>
          )}
        </p>
      </div>

      {/* Step list — AC-ONBD-001-01: exactly three steps in order */}
      <div
        className="space-y-4"
        data-testid="onboarding-steps"
      >
        {model.steps.map((step, index) => {
          const isCurrent = step.key === model.currentStep;
          const label = STEP_LABELS[step.key] ?? step.key;
          const description = STEP_DESCRIPTIONS[step.key] ?? "";
          const stepNum = index + 1;

          return (
            <div
              key={step.key}
              className={[
                "rounded-lg border p-6",
                step.done
                  ? "border-green-200 bg-green-50"
                  : isCurrent
                  ? "border-blue-200 bg-blue-50"
                  : step.accessible
                  ? "border-gray-200 bg-white"
                  : "border-gray-200 bg-gray-50 opacity-75",
              ].join(" ")}
              data-testid={`onboarding-step-${step.key}`}
              data-step={step.key}
              data-accessible={step.accessible ? "true" : "false"}
              data-done={step.done ? "true" : "false"}
              data-current={isCurrent ? "true" : "false"}
              aria-label={`Step ${stepNum}: ${label}${step.done ? " — completed" : step.accessible ? isCurrent ? " — current" : "" : " — locked"}`}
            >
              {/* Step header */}
              <div className="flex items-center gap-3 mb-2">
                {/* Step number / done indicator */}
                <div
                  className={[
                    "flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-sm font-semibold",
                    step.done
                      ? "bg-green-600 text-white"
                      : isCurrent
                      ? "bg-blue-600 text-white"
                      : step.accessible
                      ? "bg-gray-400 text-white"
                      : "bg-gray-300 text-gray-500",
                  ].join(" ")}
                  aria-hidden="true"
                >
                  {step.done ? "✓" : stepNum}
                </div>

                <h2 className="text-base font-semibold text-gray-900">
                  {label}
                </h2>

                {/* Lock icon for inaccessible steps (AC-ONBD-002-01/-02 UI) */}
                {!step.accessible && (
                  <span
                    className="ml-auto inline-flex items-center gap-1 rounded-full bg-gray-200 px-2.5 py-0.5 text-xs font-medium text-gray-600"
                    data-testid={`lock-badge-${step.key}`}
                    aria-label="Locked"
                  >
                    {/* Lock icon — SVG inline for zero extra deps */}
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 16 16"
                      fill="currentColor"
                      className="w-3 h-3"
                      aria-hidden="true"
                    >
                      <path
                        fillRule="evenodd"
                        d="M8 1a3.5 3.5 0 0 0-3.5 3.5V6H4a2 2 0 0 0-2 2v5a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-.5V4.5A3.5 3.5 0 0 0 8 1Zm2 5V4.5a2 2 0 1 0-4 0V6h4Z"
                        clipRule="evenodd"
                      />
                    </svg>
                    Locked
                  </span>
                )}

                {/* Done badge */}
                {step.done && (
                  <span
                    className="ml-auto inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800"
                    data-testid={`done-badge-${step.key}`}
                  >
                    Complete
                  </span>
                )}
              </div>

              {/* Step body */}
              {/* Engagement letter step: accessible → LetterSignStep */}
              {step.key === "engagement-letter" && step.accessible && (
                <LetterSignStep
                  engagementId={model.engagementId}
                  letterContent={letterContent}
                  isSigned={step.done}
                />
              )}

              {/* Engagement letter step: not accessible → lock message */}
              {step.key === "engagement-letter" && !step.accessible && (
                <p
                  className="text-sm text-gray-500 mt-1"
                  data-testid={`lock-message-${step.key}`}
                >
                  Sign the engagement letter to unlock this step.
                </p>
              )}

              {/*
               * Intake questionnaire step — TASK-006-004 wiring.
               *
               * QuestionnaireStep handles all four states internally:
               *   1. accessible:false → locked affordance (EPIC-005 gate honored)
               *   2. accessible:true, template:null → awaiting state
               *   3. alreadySubmitted:true → satisfied/read-only state
               *   4. accessible:true, template:present → active form
               *
               * GUARDRAIL: We pass the accessible flag from the OnboardingReadModel step.
               * QuestionnaireStep does NOT re-derive the gate — it consumes what we pass.
               * AC-ONBD-003-01/-03: questionnaire prop carries the resolved template data.
               */}
              {step.key === "intake-questionnaire" && (
                <QuestionnaireStep
                  stepState={{ accessible: step.accessible, done: step.done }}
                  questionnaire={questionnaire}
                  alreadySubmitted={alreadySubmitted}
                  existingAnswers={existingAnswers}
                />
              )}

              {/* Document upload step: show placeholder content */}
              {step.key === "document-upload" && step.accessible && (
                <p className="text-sm text-gray-600">{description}</p>
              )}

              {/* Document upload step: locked → lock message */}
              {step.key === "document-upload" && !step.accessible && (
                <p
                  className="text-sm text-gray-500 mt-1"
                  data-testid={`lock-message-${step.key}`}
                >
                  Sign the engagement letter to unlock this step.
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
