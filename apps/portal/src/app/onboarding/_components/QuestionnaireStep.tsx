/**
 * apps/portal/src/app/onboarding/_components/QuestionnaireStep.tsx
 *
 * Renders the intake questionnaire step for the onboarding sequence.
 *
 * AC-ONBD-003-01 UI: Displays the questionnaire bound to the engagement's service type.
 *   Questions are rendered from the resolved QuestionDef array (text → input, textarea → textarea).
 *   Template is server-resolved via getMyQuestionnaire() — never from a client-supplied id
 *   (ADR-001/ADR-005: no client-supplied serviceId/templateId/engagementId).
 *
 * AC-ONBD-003-03 UI: Before submit — "not yet submitted" affordance + enabled Submit when all
 *   required fields answered. After submit — satisfied/read-only state (server-side satisfaction
 *   is TASK-006-005; this component reflects the state passed down).
 *
 * GUARDRAIL: This component does NOT compute its own accessibility gate. It reflects
 *   the `accessible` + `done` flags passed down from OnboardingReadModel (TASK-005-005).
 *   If `accessible: false` (letter unsigned), it renders the EPIC-005 locked-step affordance.
 *   This preserves the EPIC-005 gate — the UI lock is a PRESENTATION AFFORDANCE ONLY.
 *
 * GUARDRAIL: No `dangerouslySetInnerHTML`. Question prompts are accountant-authored text
 *   and are rendered as auto-escaped JSX text nodes (ADR-024 §6 content boundary).
 *
 * ADR-006: Portal-only client component — never imported in apps/admin.
 * ADR-001/ADR-005: No client-supplied ids. Questionnaire resolved server-side.
 *
 * Coordination seam with TASK-006-005:
 *   - Props receive `questionnaire`, `alreadySubmitted`, `existingAnswers` from parent.
 *   - `submitQuestionnaireAction` is imported from `../actions` — TASK-006-005 implements
 *     the server-side body. This task defines the import seam and calls the action.
 *   - DECISION (TASK-006-004/005 coordination): the component calls submitQuestionnaireAction()
 *     without arguments — the action resolves the engagement/template server-side (no-arg, no ids).
 *     The answers map `{ [questionId]: string }` is the only argument (DECISION-H from EPIC-006).
 */

"use client";

import { useState, useTransition, useCallback } from "react";
import { submitQuestionnaireAction } from "../actions";
import type { QuestionDef, QuestionnaireForEngagement } from "@tax-portal/db";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface QuestionnaireStepState {
  /** Whether the step is accessible (letter signed — from OnboardingReadModel). */
  accessible: boolean;
  /** Whether the questionnaire step is already done (submitted — from OnboardingReadModel). */
  done: boolean;
}

export interface QuestionnaireStepProps {
  /**
   * Step accessibility + done flags from the EPIC-005 OnboardingReadModel.
   * GUARDRAIL: This component does NOT re-derive the gate — it consumes what the server returns.
   */
  stepState: QuestionnaireStepState;
  /**
   * The resolved questionnaire for this client's engagement service type.
   * null → awaiting state (no template authored yet, or engagement resolution failed).
   * questionnaire.template === null → awaiting state (engagement resolved but no template yet).
   *
   * ADR-001/ADR-005: resolved server-side; never from a client-supplied id.
   */
  questionnaire: QuestionnaireForEngagement | null;
  /**
   * Whether the client has already submitted the questionnaire (AC-ONBD-003-03).
   * True → render satisfied/read-only state. False → render the form.
   * Authoritative satisfaction is server-side (TASK-006-005); this is the reflected flag.
   */
  alreadySubmitted: boolean;
  /**
   * Existing answers if the client has previously submitted.
   * Serialized JSON: { [questionId]: string } (DECISION-H).
   * Null when no prior submission exists.
   */
  existingAnswers: string | null;
  /**
   * Optional callback: called after a successful submit.
   * Used by tests (and optionally by parent components) to observe submit completion.
   */
  onSubmitComplete?: (() => void) | undefined;
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * QuestionnaireStep — client component for the intake questionnaire step.
 *
 * Renders four states (all required by AC-ONBD-003-01/-003-03 and the design contract):
 *
 *   1. LOCKED (accessible: false)  — EPIC-005 gate not passed; shows locked affordance.
 *   2. AWAITING (accessible: true, template: null) — no questionnaire authored yet; empty state.
 *   3. SUBMITTED (alreadySubmitted: true) — read-only satisfied state.
 *   4. FORM (accessible: true, template: present, alreadySubmitted: false) — active form.
 *
 * GUARDRAIL: No dangerouslySetInnerHTML anywhere in this component.
 * GUARDRAIL: No client-derived gate logic (accessible flag comes from OnboardingReadModel).
 * GUARDRAIL: No client-supplied ids — submitQuestionnaireAction is called without ids.
 */
export function QuestionnaireStep({
  stepState,
  questionnaire,
  alreadySubmitted,
  existingAnswers: _existingAnswers,
  onSubmitComplete,
}: QuestionnaireStepProps) {
  // ── State 1: LOCKED — EPIC-005 gate not passed ────────────────────────────
  // GUARDRAIL: reflect accessible from the OnboardingReadModel; never compute it here.
  if (!stepState.accessible) {
    return <QuestionnaireLockedState />;
  }

  // ── State 2: AWAITING — no template authored yet ──────────────────────────
  // accessible=true but no questionnaire or template.template is null.
  const template = questionnaire?.template ?? null;
  if (!questionnaire || !template) {
    return <QuestionnaireAwaitingState />;
  }

  // ── State 3: SUBMITTED — read-only satisfied state ────────────────────────
  if (alreadySubmitted || stepState.done) {
    return <QuestionnaireSubmittedState template={template} />;
  }

  // ── State 4: FORM — active questionnaire form ─────────────────────────────
  return (
    <QuestionnaireForm
      template={template}
      questionnaire={questionnaire}
      onSubmitComplete={onSubmitComplete}
    />
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

/**
 * QuestionnaireLockedState — rendered when accessible: false (letter not signed).
 *
 * Mirrors the EPIC-005 locked-step presentation from OnboardingSequence.tsx.
 * Reuses the same text and visual affordance to maintain UI consistency.
 * This is a PRESENTATION-ONLY affordance — the real gate is server-side.
 *
 * DECISION (TASK-006-004): data-testid is "questionnaire-locked" (primary) for new tests,
 * and "lock-message-intake-questionnaire" for backward compat with EPIC-005 component tests
 * (onboarding-sequence.test.tsx) that previously asserted the lock message from OnboardingSequence.
 * Both are set via a wrapper + child so both testids are addressable.
 */
function QuestionnaireLockedState() {
  return (
    <div data-testid="questionnaire-locked">
      <p
        className="text-sm text-gray-500 mt-1"
        data-testid="lock-message-intake-questionnaire"
      >
        Sign the engagement letter to unlock this step.
      </p>
    </div>
  );
}

/**
 * QuestionnaireAwaitingState — rendered when template is null.
 *
 * Shown when the engagement has a service type but the accountant has not yet
 * authored a questionnaire template for it (AC-ONBD-003-01 clean null case).
 */
function QuestionnaireAwaitingState() {
  return (
    <div
      className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800"
      data-testid="questionnaire-awaiting"
    >
      <p className="font-medium">Questionnaire not yet available</p>
      <p className="mt-1 text-amber-700">
        Your accountant is preparing the questionnaire for your service type.
        Please check back shortly.
      </p>
    </div>
  );
}

/**
 * QuestionnaireSubmittedState — read-only satisfied view after submission.
 *
 * AC-ONBD-003-03: Shows a satisfied state. The authoritative satisfaction is
 * server-side (TASK-006-005); this component reflects the alreadySubmitted flag.
 */
function QuestionnaireSubmittedState({
  template,
}: {
  template: NonNullable<QuestionnaireForEngagement["template"]>;
}) {
  // Parse questions for the read-only display
  let questions: QuestionDef[] = [];
  try {
    questions = JSON.parse(template.questions) as QuestionDef[];
  } catch {
    questions = [];
  }

  return (
    <div
      data-testid="questionnaire-form"
      data-step="intake-questionnaire"
      data-questionnaire-submitted="true"
    >
      <div
        className="flex items-center gap-2 text-sm font-medium text-green-700 mb-4"
        data-testid="questionnaire-submitted-confirmation"
        aria-live="polite"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="w-5 h-5"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z"
            clipRule="evenodd"
          />
        </svg>
        Questionnaire submitted
      </div>
      {/* Read-only question list */}
      {questions.length > 0 && (
        <div className="space-y-3">
          {questions.map((q) => (
            <div key={q.id} className="text-sm text-gray-600">
              {/* Auto-escaped JSX text — NEVER dangerouslySetInnerHTML (ADR-024 §6) */}
              <p className="font-medium text-gray-700">{q.prompt}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * QuestionnaireForm — active form rendering + submit wiring.
 *
 * AC-ONBD-003-01: Renders each QuestionDef as a labeled input.
 *   text → <input type="text">, textarea → <textarea>. Required fields marked.
 *
 * AC-ONBD-003-03: Submit button enabled when all required fields answered.
 *   Calls submitQuestionnaireAction (TASK-006-005 owns the server-side body).
 *
 * GUARDRAIL: No dangerouslySetInnerHTML. Prompts rendered as auto-escaped JSX text.
 * GUARDRAIL: submitQuestionnaireAction called without client-supplied ids (ADR-001).
 */
function QuestionnaireForm({
  template,
  questionnaire,
  onSubmitComplete,
}: {
  template: NonNullable<QuestionnaireForEngagement["template"]>;
  questionnaire: QuestionnaireForEngagement;
  onSubmitComplete?: (() => void) | undefined;
}) {
  // Parse question definitions (DECISION-G: serialized JSON blob)
  let questions: QuestionDef[] = [];
  try {
    questions = JSON.parse(template.questions) as QuestionDef[];
  } catch {
    questions = [];
  }

  // Track answer values keyed by question id (DECISION-H: { [questionId]: string })
  const [answers, setAnswers] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const q of questions) {
      initial[q.id] = "";
    }
    return initial;
  });

  const [isPending, startTransition] = useTransition();
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Required field validation — all required questions must have non-empty answers
  const requiredQuestions = questions.filter((q) => q.required);
  const allRequiredAnswered = requiredQuestions.every(
    (q) => (answers[q.id] ?? "").trim().length > 0,
  );

  const handleAnswerChange = useCallback(
    (questionId: string, value: string) => {
      setAnswers((prev) => ({ ...prev, [questionId]: value }));
    },
    [],
  );

  function handleSubmit() {
    if (!allRequiredAnswered || isPending) return;
    setSubmitError(null);

    // DECISION (TASK-006-004/005 coordination): Pass answers map to the action.
    // submitQuestionnaireAction resolves engagement/template server-side — no ids from client.
    // TASK-006-005 owns the server-side body; this task defines the call seam.
    const answersJson = JSON.stringify(answers);

    startTransition(async () => {
      const result = await submitQuestionnaireAction(answersJson);
      if (result.success) {
        // revalidatePath('/onboarding') in the action causes the server component to re-render.
        onSubmitComplete?.();
      } else {
        setSubmitError(result.error ?? "Submission failed. Please try again.");
      }
    });
  }

  // Suppress unused-var warning for questionnaire (used for type safety + future serviceName display)
  void questionnaire;

  return (
    <div
      data-testid="questionnaire-form"
      data-step="intake-questionnaire"
      data-questionnaire-submitted="false"
    >
      <div className="space-y-5">
        {questions.map((q) => (
          <div key={q.id} className="flex flex-col gap-1.5">
            {/* Label — auto-escaped JSX text (GUARDRAIL: no dangerouslySetInnerHTML) */}
            <label
              htmlFor={`question-${q.id}`}
              className="block text-sm font-medium text-gray-700"
            >
              {/* ADR-024 §6: prompt rendered as text, not HTML. Auto-escaped by React. */}
              {q.prompt}
              {q.required && (
                <span className="ml-1 text-red-500" aria-hidden="true">
                  *
                </span>
              )}
            </label>

            {/* Input or Textarea depending on QuestionDef.type */}
            {q.type === "textarea" ? (
              <textarea
                id={`question-${q.id}`}
                data-question-id={q.id}
                required={q.required}
                rows={4}
                className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
                value={answers[q.id] ?? ""}
                onChange={(e) => handleAnswerChange(q.id, e.target.value)}
                disabled={isPending}
                aria-required={q.required}
              />
            ) : (
              <input
                type="text"
                id={`question-${q.id}`}
                data-question-id={q.id}
                required={q.required}
                className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
                value={answers[q.id] ?? ""}
                onChange={(e) => handleAnswerChange(q.id, e.target.value)}
                disabled={isPending}
                aria-required={q.required}
              />
            )}
          </div>
        ))}
      </div>

      {/* Submit button — enabled only when all required fields answered */}
      <div className="mt-6">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!allRequiredAnswered || isPending}
          data-testid="questionnaire-submit-button"
          className={[
            "inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold text-white shadow-sm",
            !allRequiredAnswered || isPending
              ? "bg-blue-400 cursor-not-allowed"
              : "bg-blue-600 hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600",
          ].join(" ")}
          aria-label={isPending ? "Submitting questionnaire…" : "Submit questionnaire"}
          aria-busy={isPending}
        >
          {isPending ? (
            <>
              <svg
                className="w-4 h-4 animate-spin"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4Z"
                />
              </svg>
              Submitting…
            </>
          ) : (
            "Submit Questionnaire"
          )}
        </button>

        {submitError && (
          <p
            role="alert"
            className="mt-2 text-sm text-red-600"
            data-testid="questionnaire-error-message"
          >
            {submitError}
          </p>
        )}
      </div>
    </div>
  );
}
