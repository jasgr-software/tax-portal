/**
 * apps/portal/src/app/onboarding/questionnaire-step.test.tsx
 *
 * Component tests for QuestionnaireStep (TASK-006-004).
 * All server actions and @tax-portal/db seams are mocked — no real DB, no real auth.
 *
 * Tests cover:
 *   [AC-ONBD-003-01] renders the questions of the resolved template
 *   [AC-ONBD-003-03] step shows unsatisfied before submit (affordance + submit enabled)
 *   [AC-ONBD-002-01 honored] questionnaire form NOT rendered when letter unsigned (step locked)
 *   [edge] absent template → awaiting-questionnaire empty state (no crash)
 *   [security] question content auto-escaped (no dangerouslySetInnerHTML)
 *   [AC-ONBD-003-03] already-submitted → read-only satisfied state
 *   [wiring] OnboardingSequence renders QuestionnaireStep in the intake-questionnaire slot
 *
 * Methodology: test-first (TDD: required), AC tags in titles.
 * E2e is TASK-006-006 — no e2e here (E2e-required: no).
 *
 * GUARDRAIL: tests assert the UI REFLECTS the server-returned data — they do not assert
 * that the UI computes its own gate. The gate is the server's OnboardingReadModel.
 *
 * ADR-006: portal-only component tests — never imported in apps/admin.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { OnboardingReadModel } from "@tax-portal/db";
import type { QuestionnaireForEngagement, QuestionDef } from "@tax-portal/db";

// ─── Hoisted mock factories ───────────────────────────────────────────────────

const { mockGetMyQuestionnaireAction, mockSubmitQuestionnaireAction } = vi.hoisted(() => ({
  mockGetMyQuestionnaireAction: vi.fn(),
  mockSubmitQuestionnaireAction: vi.fn(),
}));

const { mockSignEngagementLetterAction } = vi.hoisted(() => ({
  mockSignEngagementLetterAction: vi.fn(),
}));

// ─── Mocks ────────────────────────────────────────────────────────────────────

// Mock the server actions at the component boundary.
vi.mock("./actions", () => ({
  getMyQuestionnaireAction: mockGetMyQuestionnaireAction,
  submitQuestionnaireAction: mockSubmitQuestionnaireAction,
  signEngagementLetterAction: mockSignEngagementLetterAction,
  getMyOnboardingAction: vi.fn(),
  getClientIdentity: vi.fn(),
  // TASK-007-006: DocumentUploadStep imports these
  requestUploadUrlAction: vi.fn(),
  completeUploadAction: vi.fn(),
  getChecklistAction: vi.fn(),
}));

// Mock @tax-portal/db — only type imports are needed in tests; mocked to prevent
// real DB module loading in jsdom (no mssql, no Prisma client).
vi.mock("@tax-portal/db", () => ({
  resolveOnboarding: vi.fn(),
  checkStepAccessibility: vi.fn(),
}));

// ─── Import AFTER mocks ───────────────────────────────────────────────────────

import { QuestionnaireStep } from "./_components/QuestionnaireStep";
import { OnboardingSequence } from "./_components/OnboardingSequence";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ENGAGEMENT_ID = "engagement-uuid-q-test-001";
const LETTER_CONTENT = "Dear Client,\n\nThis is the engagement letter.";

const SAMPLE_QUESTIONS: QuestionDef[] = [
  { id: "q1", prompt: "What is your filing status?", type: "text", required: true },
  { id: "q2", prompt: "List any dependents:", type: "textarea", required: false },
  { id: "q3", prompt: "Did you have foreign income?", type: "text", required: true },
];

const SAMPLE_TEMPLATE: QuestionnaireForEngagement = {
  engagementId: ENGAGEMENT_ID,
  serviceId: "service-tax-prep-001",
  serviceName: "Individual Tax Preparation",
  template: {
    id: "template-001",
    serviceId: "service-tax-prep-001",
    questions: JSON.stringify(SAMPLE_QUESTIONS),
    updatedBy: "accountant-clerk-001",
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-06-01"),
  },
};

const TEMPLATE_NULL_QUESTIONNAIRE: QuestionnaireForEngagement = {
  engagementId: ENGAGEMENT_ID,
  serviceId: "service-tax-prep-001",
  serviceName: "Individual Tax Preparation",
  template: null,
};

// Model where the letter is signed and intake-questionnaire is accessible
const ACCESSIBLE_READ_MODEL: OnboardingReadModel = {
  engagementId: ENGAGEMENT_ID,
  steps: [
    { key: "engagement-letter", accessible: true, done: true },
    { key: "intake-questionnaire", accessible: true, done: false },
    { key: "document-upload", accessible: true, done: false },
  ],
  currentStep: "intake-questionnaire",
  remaining: 1,
};

// Model where the letter is unsigned — intake-questionnaire is NOT accessible
const LOCKED_READ_MODEL: OnboardingReadModel = {
  engagementId: ENGAGEMENT_ID,
  steps: [
    { key: "engagement-letter", accessible: true, done: false },
    { key: "intake-questionnaire", accessible: false, done: false },
    { key: "document-upload", accessible: false, done: false },
  ],
  currentStep: "engagement-letter",
  remaining: 2,
};

// Model where questionnaire is already submitted (done: true)
const SUBMITTED_READ_MODEL: OnboardingReadModel = {
  engagementId: ENGAGEMENT_ID,
  steps: [
    { key: "engagement-letter", accessible: true, done: true },
    { key: "intake-questionnaire", accessible: true, done: true },
    { key: "document-upload", accessible: true, done: false },
  ],
  currentStep: "document-upload",
  remaining: 1,
};

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  // Default: successful load of the sample template
  mockGetMyQuestionnaireAction.mockResolvedValue({
    success: true,
    data: SAMPLE_TEMPLATE,
    alreadySubmitted: false,
  });
  mockSubmitQuestionnaireAction.mockResolvedValue({ success: true });
  mockSignEngagementLetterAction.mockResolvedValue({
    success: true,
    data: ACCESSIBLE_READ_MODEL,
  });
});

// ─── QuestionnaireStep — AC-ONBD-003-01: renders correct template questions ──────

describe("QuestionnaireStep — [AC-ONBD-003-01] renders the resolved template's questions", () => {

  it("[AC-ONBD-003-01] renders the questionnaire form container with data-testid", async () => {
    render(
      <QuestionnaireStep
        stepState={{ accessible: true, done: false }}
        questionnaire={SAMPLE_TEMPLATE}
        alreadySubmitted={false}
      />,
    );

    expect(await screen.findByTestId("questionnaire-form")).toBeInTheDocument();
  });

  it("[AC-ONBD-003-01] renders each question's prompt as text (auto-escaped)", async () => {
    render(
      <QuestionnaireStep
        stepState={{ accessible: true, done: false }}
        questionnaire={SAMPLE_TEMPLATE}
        alreadySubmitted={false}
      />,
    );

    expect(await screen.findByText("What is your filing status?")).toBeInTheDocument();
    expect(screen.getByText("List any dependents:")).toBeInTheDocument();
    expect(screen.getByText("Did you have foreign income?")).toBeInTheDocument();
  });

  it("[AC-ONBD-003-01] text question rendered as <input>", async () => {
    render(
      <QuestionnaireStep
        stepState={{ accessible: true, done: false }}
        questionnaire={SAMPLE_TEMPLATE}
        alreadySubmitted={false}
      />,
    );

    // q1 and q3 are type: "text" → should render as <input>
    const inputs = await screen.findAllByRole("textbox");
    // Two text inputs (q1, q3) + one textarea (q2)
    const textInputs = inputs.filter(
      (el) => el.tagName.toLowerCase() === "input",
    );
    expect(textInputs.length).toBeGreaterThanOrEqual(2);
  });

  it("[AC-ONBD-003-01] textarea question rendered as <textarea>", async () => {
    render(
      <QuestionnaireStep
        stepState={{ accessible: true, done: false }}
        questionnaire={SAMPLE_TEMPLATE}
        alreadySubmitted={false}
      />,
    );

    // q2 is type: "textarea"
    const textareas = await screen.findAllByRole("textbox");
    const textareaEls = textareas.filter(
      (el) => el.tagName.toLowerCase() === "textarea",
    );
    expect(textareaEls.length).toBeGreaterThanOrEqual(1);
  });

  it("[AC-ONBD-003-01] each question input has data-question-id attribute", async () => {
    render(
      <QuestionnaireStep
        stepState={{ accessible: true, done: false }}
        questionnaire={SAMPLE_TEMPLATE}
        alreadySubmitted={false}
      />,
    );

    expect(await screen.findByTestId("questionnaire-form")).toBeInTheDocument();
    expect(document.querySelector("[data-question-id='q1']")).toBeInTheDocument();
    expect(document.querySelector("[data-question-id='q2']")).toBeInTheDocument();
    expect(document.querySelector("[data-question-id='q3']")).toBeInTheDocument();
  });

  it("[AC-ONBD-003-01] required fields are marked as required", async () => {
    render(
      <QuestionnaireStep
        stepState={{ accessible: true, done: false }}
        questionnaire={SAMPLE_TEMPLATE}
        alreadySubmitted={false}
      />,
    );

    await screen.findByTestId("questionnaire-form");
    const q1Input = document.querySelector("[data-question-id='q1']") as HTMLInputElement | null;
    const q3Input = document.querySelector("[data-question-id='q3']") as HTMLInputElement | null;
    const q2Textarea = document.querySelector("[data-question-id='q2']") as HTMLTextAreaElement | null;
    expect(q1Input?.required).toBe(true);
    expect(q3Input?.required).toBe(true);
    expect(q2Textarea?.required).toBe(false);
  });

  it("[AC-ONBD-003-01] form container has data-step='intake-questionnaire'", async () => {
    render(
      <QuestionnaireStep
        stepState={{ accessible: true, done: false }}
        questionnaire={SAMPLE_TEMPLATE}
        alreadySubmitted={false}
      />,
    );

    const form = await screen.findByTestId("questionnaire-form");
    expect(form).toHaveAttribute("data-step", "intake-questionnaire");
  });

});

// ─── QuestionnaireStep — AC-ONBD-003-03: unsatisfied/submitted affordances ───

describe("QuestionnaireStep — [AC-ONBD-003-03] submit affordance before and after submit", () => {

  it("[AC-ONBD-003-03] shows submit button when not submitted", async () => {
    render(
      <QuestionnaireStep
        stepState={{ accessible: true, done: false }}
        questionnaire={SAMPLE_TEMPLATE}
        alreadySubmitted={false}
      />,
    );

    expect(await screen.findByTestId("questionnaire-submit-button")).toBeInTheDocument();
  });

  it("[AC-ONBD-003-03] submit button is enabled when all required fields answered", async () => {
    render(
      <QuestionnaireStep
        stepState={{ accessible: true, done: false }}
        questionnaire={SAMPLE_TEMPLATE}
        alreadySubmitted={false}
      />,
    );

    await screen.findByTestId("questionnaire-form");

    // Fill required fields
    const q1Input = document.querySelector("[data-question-id='q1']") as HTMLInputElement;
    const q3Input = document.querySelector("[data-question-id='q3']") as HTMLInputElement;
    fireEvent.change(q1Input, { target: { value: "Single" } });
    fireEvent.change(q3Input, { target: { value: "No" } });

    const submitButton = screen.getByTestId("questionnaire-submit-button");
    expect(submitButton).not.toBeDisabled();
  });

  it("[AC-ONBD-003-03] submit button starts disabled when required fields are empty", async () => {
    render(
      <QuestionnaireStep
        stepState={{ accessible: true, done: false }}
        questionnaire={SAMPLE_TEMPLATE}
        alreadySubmitted={false}
      />,
    );

    const submitButton = await screen.findByTestId("questionnaire-submit-button");
    expect(submitButton).toBeDisabled();
  });

  it("[AC-ONBD-003-03] form has data-questionnaire-submitted='false' before submit", async () => {
    render(
      <QuestionnaireStep
        stepState={{ accessible: true, done: false }}
        questionnaire={SAMPLE_TEMPLATE}
        alreadySubmitted={false}
      />,
    );

    const form = await screen.findByTestId("questionnaire-form");
    expect(form).toHaveAttribute("data-questionnaire-submitted", "false");
  });

  it("[AC-ONBD-003-03] shows read-only satisfied state when alreadySubmitted=true", async () => {
    render(
      <QuestionnaireStep
        stepState={{ accessible: true, done: true }}
        questionnaire={SAMPLE_TEMPLATE}
        alreadySubmitted={true}
      />,
    );

    expect(await screen.findByTestId("questionnaire-submitted-confirmation")).toBeInTheDocument();
    expect(screen.queryByTestId("questionnaire-submit-button")).not.toBeInTheDocument();
  });

  it("[AC-ONBD-003-03] submitted state has data-questionnaire-submitted='true'", async () => {
    render(
      <QuestionnaireStep
        stepState={{ accessible: true, done: true }}
        questionnaire={SAMPLE_TEMPLATE}
        alreadySubmitted={true}
      />,
    );

    const form = await screen.findByTestId("questionnaire-form");
    expect(form).toHaveAttribute("data-questionnaire-submitted", "true");
  });

  it("[AC-ONBD-003-03] calling submit invokes submitQuestionnaireAction", async () => {
    render(
      <QuestionnaireStep
        stepState={{ accessible: true, done: false }}
        questionnaire={SAMPLE_TEMPLATE}
        alreadySubmitted={false}
      />,
    );

    await screen.findByTestId("questionnaire-form");

    // Fill required fields so submit becomes enabled
    const q1Input = document.querySelector("[data-question-id='q1']") as HTMLInputElement;
    const q3Input = document.querySelector("[data-question-id='q3']") as HTMLInputElement;
    fireEvent.change(q1Input, { target: { value: "Single" } });
    fireEvent.change(q3Input, { target: { value: "No" } });

    const submitButton = screen.getByTestId("questionnaire-submit-button");
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mockSubmitQuestionnaireAction).toHaveBeenCalledOnce();
    });
  });

});

// ─── QuestionnaireStep — EPIC-005 gate honored: locked state ─────────────────

describe("QuestionnaireStep — [AC-ONBD-002-01 honored] letter-unsigned → locked, no form", () => {

  it("[AC-ONBD-002-01 honored] renders locked affordance when accessible=false", () => {
    render(
      <QuestionnaireStep
        stepState={{ accessible: false, done: false }}
        questionnaire={null}
        alreadySubmitted={false}
      />,
    );

    expect(screen.getByTestId("questionnaire-locked")).toBeInTheDocument();
    expect(screen.queryByTestId("questionnaire-form")).not.toBeInTheDocument();
  });

  it("[AC-ONBD-002-01 honored] does NOT render the questionnaire form when step not accessible", () => {
    render(
      <QuestionnaireStep
        stepState={{ accessible: false, done: false }}
        questionnaire={null}
        alreadySubmitted={false}
      />,
    );

    expect(screen.queryByTestId("questionnaire-form")).not.toBeInTheDocument();
    expect(screen.queryByTestId("questionnaire-submit-button")).not.toBeInTheDocument();
  });

  it("[AC-ONBD-002-01 honored] locked state shows letter-signing instruction", () => {
    render(
      <QuestionnaireStep
        stepState={{ accessible: false, done: false }}
        questionnaire={null}
        alreadySubmitted={false}
      />,
    );

    const locked = screen.getByTestId("questionnaire-locked");
    expect(locked).toHaveTextContent(/sign/i);
  });

  it("[security] gate NOT weakened: accessible=false + template present still shows locked", () => {
    // Even if questionnaire data were provided while step is inaccessible,
    // the component must honour accessible:false and show locked, never the form.
    render(
      <QuestionnaireStep
        stepState={{ accessible: false, done: false }}
        questionnaire={SAMPLE_TEMPLATE}
        alreadySubmitted={false}
      />,
    );

    expect(screen.getByTestId("questionnaire-locked")).toBeInTheDocument();
    expect(screen.queryByTestId("questionnaire-form")).not.toBeInTheDocument();
  });

});

// ─── QuestionnaireStep — edge: absent template (template: null) ───────────────

describe("QuestionnaireStep — [edge] absent template → awaiting-questionnaire empty state", () => {

  it("[edge] renders awaiting-questionnaire state when template is null", () => {
    render(
      <QuestionnaireStep
        stepState={{ accessible: true, done: false }}
        questionnaire={TEMPLATE_NULL_QUESTIONNAIRE}
        alreadySubmitted={false}
      />,
    );

    expect(screen.getByTestId("questionnaire-awaiting")).toBeInTheDocument();
  });

  it("[edge] does NOT crash when questionnaire is null entirely", () => {
    // Defensive: questionnaire prop is null (engagement resolution returned null)
    render(
      <QuestionnaireStep
        stepState={{ accessible: true, done: false }}
        questionnaire={null}
        alreadySubmitted={false}
      />,
    );

    // Should render locked (step says accessible:true but no questionnaire — show awaiting)
    // DECISION: when accessible=true but questionnaire=null, show awaiting state.
    // (accessible=false is the EPIC-005 locked gate path handled above.)
    expect(screen.getByTestId("questionnaire-awaiting")).toBeInTheDocument();
  });

  it("[edge] awaiting state shows no submit button", () => {
    render(
      <QuestionnaireStep
        stepState={{ accessible: true, done: false }}
        questionnaire={TEMPLATE_NULL_QUESTIONNAIRE}
        alreadySubmitted={false}
      />,
    );

    expect(screen.queryByTestId("questionnaire-submit-button")).not.toBeInTheDocument();
  });

  it("[edge] awaiting state does not render broken form with no questions", () => {
    render(
      <QuestionnaireStep
        stepState={{ accessible: true, done: false }}
        questionnaire={TEMPLATE_NULL_QUESTIONNAIRE}
        alreadySubmitted={false}
      />,
    );

    expect(screen.queryByTestId("questionnaire-form")).not.toBeInTheDocument();
  });

});

// ─── Security: question content auto-escaped ──────────────────────────────────

describe("QuestionnaireStep — [security] question content auto-escaped", () => {

  it("[security] question prompt rendered as text — no HTML injection possible", async () => {
    const maliciousQuestions: QuestionDef[] = [
      {
        id: "q-xss",
        prompt: "<script>alert('xss')</script>",
        type: "text",
        required: false,
      },
    ];

    const maliciousTemplate: QuestionnaireForEngagement = {
      engagementId: ENGAGEMENT_ID,
      serviceId: "service-001",
      serviceName: "Tax",
      template: {
        id: "tmpl-001",
        serviceId: "service-001",
        questions: JSON.stringify(maliciousQuestions),
        updatedBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    };

    render(
      <QuestionnaireStep
        stepState={{ accessible: true, done: false }}
        questionnaire={maliciousTemplate}
        alreadySubmitted={false}
      />,
    );

    await screen.findByTestId("questionnaire-form");
    // The content should appear as text (escaped), not as a DOM script element.
    expect(screen.getByText("<script>alert('xss')</script>")).toBeInTheDocument();
    // No actual <script> element was injected.
    expect(document.querySelector("script[data-question-id='q-xss']")).toBeNull();
  });

});

// ─── OnboardingSequence wiring: questionnaire step rendered in sequence ───────

describe("OnboardingSequence — questionnaire step wired into intake-questionnaire slot", () => {

  it("renders QuestionnaireStep in intake-questionnaire slot when accessible", async () => {
    render(
      <OnboardingSequence
        model={ACCESSIBLE_READ_MODEL}
        letterContent={LETTER_CONTENT}
        questionnaire={SAMPLE_TEMPLATE}
        alreadySubmitted={false}
        checklist={null}
      />,
    );

    // The questionnaire form should appear in the accessible signed state
    expect(await screen.findByTestId("questionnaire-form")).toBeInTheDocument();
  });

  it("renders locked affordance in intake-questionnaire slot when inaccessible", () => {
    render(
      <OnboardingSequence
        model={LOCKED_READ_MODEL}
        letterContent={LETTER_CONTENT}
        questionnaire={null}
        alreadySubmitted={false}
        checklist={null}
      />,
    );

    // Locked state (letter not signed → step not accessible)
    expect(screen.getByTestId("questionnaire-locked")).toBeInTheDocument();
    expect(screen.queryByTestId("questionnaire-form")).not.toBeInTheDocument();
  });

  it("renders submitted/read-only state in intake-questionnaire slot when done", async () => {
    render(
      <OnboardingSequence
        model={SUBMITTED_READ_MODEL}
        letterContent={LETTER_CONTENT}
        questionnaire={SAMPLE_TEMPLATE}
        alreadySubmitted={true}
        checklist={null}
      />,
    );

    expect(await screen.findByTestId("questionnaire-submitted-confirmation")).toBeInTheDocument();
  });

  it("renders awaiting-questionnaire in slot when template is null", async () => {
    render(
      <OnboardingSequence
        model={ACCESSIBLE_READ_MODEL}
        letterContent={LETTER_CONTENT}
        questionnaire={TEMPLATE_NULL_QUESTIONNAIRE}
        alreadySubmitted={false}
        checklist={null}
      />,
    );

    expect(await screen.findByTestId("questionnaire-awaiting")).toBeInTheDocument();
  });

});
