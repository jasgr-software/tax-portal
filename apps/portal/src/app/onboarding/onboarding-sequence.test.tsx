/**
 * apps/portal/src/app/onboarding/onboarding-sequence.test.tsx
 *
 * Tier-5 component tests for the onboarding sequence UI.
 * All server actions and @tax-portal/db seams are mocked — no real DB, no real auth.
 *
 * Tests cover:
 *   [AC-ONBD-001-01] renders exactly three steps in order
 *   [AC-ONBD-001-03] renders current position + remaining steps
 *   [AC-ONBD-002-01/-02 UI] steps 2/3 render locked when accessible:false (unsigned)
 *   [AC-ONBD-002-03 UI] steps 2/3 render unlocked when accessible:true (after signing)
 *   [AC-IDNT-007-03 UI] the letter step renders the accountant's edited template content
 *   Tier-2 wiring: sign button invokes signEngagementLetterAction with the engagementId
 *
 * Methodology: test-after, AC tags in titles.
 * E2e is TASK-005-007 — no e2e here.
 *
 * GUARDRAIL: tests assert the UI REFLECTS the read model flags — they do not assert
 * that the UI computes its own gate (because it must not). Component is the presentation layer.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { OnboardingReadModel } from "@tax-portal/db";

// ─── Hoisted mock factories ───────────────────────────────────────────────────

const { mockSignEngagementLetterAction } = vi.hoisted(() => ({
  mockSignEngagementLetterAction: vi.fn(),
}));

// ─── Mocks ────────────────────────────────────────────────────────────────────

// Mock the server action at the component boundary.
// LetterSignStep imports signEngagementLetterAction from its parent actions module.
vi.mock("./actions", () => ({
  signEngagementLetterAction: mockSignEngagementLetterAction,
  getMyOnboardingAction: vi.fn(),
  getClientIdentity: vi.fn(),
}));

// Mock @tax-portal/db — only the type imports are needed here; mocked to prevent
// any real DB module loading in jsdom (no mssql, no Prisma client).
vi.mock("@tax-portal/db", () => ({
  resolveOnboarding: vi.fn(),
  checkStepAccessibility: vi.fn(),
}));

// ─── Import AFTER mocks ───────────────────────────────────────────────────────

import { OnboardingSequence } from "./_components/OnboardingSequence";
import { LetterSignStep } from "./_components/LetterSignStep";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ENGAGEMENT_ID = "engagement-uuid-test-001";
const LETTER_CONTENT = "Dear Client,\n\nThis is the engagement letter from your accountant.";

const UNSIGNED_READ_MODEL: OnboardingReadModel = {
  engagementId: ENGAGEMENT_ID,
  steps: [
    { key: "engagement-letter", accessible: true, done: false },
    { key: "intake-questionnaire", accessible: false, done: false },
    { key: "document-upload", accessible: false, done: false },
  ],
  currentStep: "engagement-letter",
  remaining: 2,
};

const SIGNED_READ_MODEL: OnboardingReadModel = {
  engagementId: ENGAGEMENT_ID,
  steps: [
    { key: "engagement-letter", accessible: true, done: true },
    { key: "intake-questionnaire", accessible: true, done: false },
    { key: "document-upload", accessible: true, done: false },
  ],
  currentStep: "intake-questionnaire",
  remaining: 1,
};

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockSignEngagementLetterAction.mockResolvedValue({
    success: true,
    data: SIGNED_READ_MODEL,
  });
});

// ─── OnboardingSequence tests ─────────────────────────────────────────────────

describe("OnboardingSequence — AC-ONBD-001-01: renders exactly three steps in order", () => {

  it("[AC-ONBD-001-01] renders exactly three step containers", () => {
    render(
      <OnboardingSequence model={UNSIGNED_READ_MODEL} letterContent={LETTER_CONTENT} />,
    );

    const steps = screen.getAllByTestId(/^onboarding-step-/);
    expect(steps).toHaveLength(3);
  });

  it("[AC-ONBD-001-01] steps are rendered in the correct order: letter, questionnaire, upload", () => {
    render(
      <OnboardingSequence model={UNSIGNED_READ_MODEL} letterContent={LETTER_CONTENT} />,
    );

    const steps = screen.getAllByTestId(/^onboarding-step-/);

    // data-step attribute carries the step key
    expect(steps[0]).toHaveAttribute("data-step", "engagement-letter");
    expect(steps[1]).toHaveAttribute("data-step", "intake-questionnaire");
    expect(steps[2]).toHaveAttribute("data-step", "document-upload");
  });

  it("[AC-ONBD-001-01] each step has a data-step attribute matching its key", () => {
    render(
      <OnboardingSequence model={UNSIGNED_READ_MODEL} letterContent={LETTER_CONTENT} />,
    );

    expect(screen.getByTestId("onboarding-step-engagement-letter")).toBeInTheDocument();
    expect(screen.getByTestId("onboarding-step-intake-questionnaire")).toBeInTheDocument();
    expect(screen.getByTestId("onboarding-step-document-upload")).toBeInTheDocument();
  });

});

describe("OnboardingSequence — AC-ONBD-001-03: renders current position + remaining steps", () => {

  it("[AC-ONBD-001-03] shows 'Step 1 of 3' when unsigned (currentStep = engagement-letter)", () => {
    render(
      <OnboardingSequence model={UNSIGNED_READ_MODEL} letterContent={LETTER_CONTENT} />,
    );

    const positionEl = screen.getByTestId("onboarding-position");
    expect(positionEl).toHaveTextContent("Step 1 of 3");
  });

  it("[AC-ONBD-001-03] shows '2 steps remaining' when unsigned (remaining = 2)", () => {
    render(
      <OnboardingSequence model={UNSIGNED_READ_MODEL} letterContent={LETTER_CONTENT} />,
    );

    const positionEl = screen.getByTestId("onboarding-position");
    expect(positionEl).toHaveTextContent("2 steps remaining");
  });

  it("[AC-ONBD-001-03] position indicator has data-current-step attribute", () => {
    render(
      <OnboardingSequence model={UNSIGNED_READ_MODEL} letterContent={LETTER_CONTENT} />,
    );

    const positionEl = screen.getByTestId("onboarding-position");
    expect(positionEl).toHaveAttribute("data-current-step", "engagement-letter");
  });

  it("[AC-ONBD-001-03] position indicator has data-remaining attribute", () => {
    render(
      <OnboardingSequence model={UNSIGNED_READ_MODEL} letterContent={LETTER_CONTENT} />,
    );

    const positionEl = screen.getByTestId("onboarding-position");
    expect(positionEl).toHaveAttribute("data-remaining", "2");
  });

  it("[AC-ONBD-001-03] shows 'Step 2 of 3' and '1 step remaining' when letter is signed", () => {
    render(
      <OnboardingSequence model={SIGNED_READ_MODEL} letterContent={LETTER_CONTENT} />,
    );

    const positionEl = screen.getByTestId("onboarding-position");
    expect(positionEl).toHaveTextContent("Step 2 of 3");
    expect(positionEl).toHaveTextContent("1 step remaining");
    expect(positionEl).toHaveAttribute("data-current-step", "intake-questionnaire");
    expect(positionEl).toHaveAttribute("data-remaining", "1");
  });

});

describe("OnboardingSequence — AC-ONBD-002-01/-02 UI: locked affordances when unsigned", () => {

  it("[AC-ONBD-002-01 UI] intake-questionnaire step has data-accessible='false' when unsigned", () => {
    render(
      <OnboardingSequence model={UNSIGNED_READ_MODEL} letterContent={LETTER_CONTENT} />,
    );

    const questionnaireStep = screen.getByTestId("onboarding-step-intake-questionnaire");
    expect(questionnaireStep).toHaveAttribute("data-accessible", "false");
  });

  it("[AC-ONBD-002-02 UI] document-upload step has data-accessible='false' when unsigned", () => {
    render(
      <OnboardingSequence model={UNSIGNED_READ_MODEL} letterContent={LETTER_CONTENT} />,
    );

    const uploadStep = screen.getByTestId("onboarding-step-document-upload");
    expect(uploadStep).toHaveAttribute("data-accessible", "false");
  });

  it("[AC-ONBD-002-01/-02 UI] locked steps show a lock badge", () => {
    render(
      <OnboardingSequence model={UNSIGNED_READ_MODEL} letterContent={LETTER_CONTENT} />,
    );

    expect(screen.getByTestId("lock-badge-intake-questionnaire")).toBeInTheDocument();
    expect(screen.getByTestId("lock-badge-document-upload")).toBeInTheDocument();
  });

  it("[AC-ONBD-002-01/-02 UI] locked steps show a lock message explaining how to unlock", () => {
    render(
      <OnboardingSequence model={UNSIGNED_READ_MODEL} letterContent={LETTER_CONTENT} />,
    );

    expect(screen.getByTestId("lock-message-intake-questionnaire")).toHaveTextContent(
      "Sign the engagement letter to unlock",
    );
    expect(screen.getByTestId("lock-message-document-upload")).toHaveTextContent(
      "Sign the engagement letter to unlock",
    );
  });

  it("[AC-ONBD-002-01/-02 UI] engagement-letter step is NOT locked when unsigned", () => {
    render(
      <OnboardingSequence model={UNSIGNED_READ_MODEL} letterContent={LETTER_CONTENT} />,
    );

    const letterStep = screen.getByTestId("onboarding-step-engagement-letter");
    expect(letterStep).toHaveAttribute("data-accessible", "true");
    // No lock badge for the letter step
    expect(screen.queryByTestId("lock-badge-engagement-letter")).not.toBeInTheDocument();
  });

});

describe("OnboardingSequence — AC-ONBD-002-03 UI: unlocked after signing", () => {

  it("[AC-ONBD-002-03 UI] intake-questionnaire step has data-accessible='true' when signed", () => {
    render(
      <OnboardingSequence model={SIGNED_READ_MODEL} letterContent={LETTER_CONTENT} />,
    );

    const questionnaireStep = screen.getByTestId("onboarding-step-intake-questionnaire");
    expect(questionnaireStep).toHaveAttribute("data-accessible", "true");
  });

  it("[AC-ONBD-002-03 UI] document-upload step has data-accessible='true' when signed", () => {
    render(
      <OnboardingSequence model={SIGNED_READ_MODEL} letterContent={LETTER_CONTENT} />,
    );

    const uploadStep = screen.getByTestId("onboarding-step-document-upload");
    expect(uploadStep).toHaveAttribute("data-accessible", "true");
  });

  it("[AC-ONBD-002-03 UI] no lock badges when letter is signed", () => {
    render(
      <OnboardingSequence model={SIGNED_READ_MODEL} letterContent={LETTER_CONTENT} />,
    );

    expect(screen.queryByTestId("lock-badge-intake-questionnaire")).not.toBeInTheDocument();
    expect(screen.queryByTestId("lock-badge-document-upload")).not.toBeInTheDocument();
  });

  it("[AC-ONBD-002-03 UI] engagement-letter step has data-done='true' when signed", () => {
    render(
      <OnboardingSequence model={SIGNED_READ_MODEL} letterContent={LETTER_CONTENT} />,
    );

    const letterStep = screen.getByTestId("onboarding-step-engagement-letter");
    expect(letterStep).toHaveAttribute("data-done", "true");
  });

});

// ─── LetterSignStep tests ─────────────────────────────────────────────────────

describe("LetterSignStep — AC-IDNT-007-03 UI: renders accountant's template content", () => {

  it("[AC-IDNT-007-03 UI] renders the accountant's edited template content as text", () => {
    render(
      <LetterSignStep
        engagementId={ENGAGEMENT_ID}
        letterContent={LETTER_CONTENT}
        isSigned={false}
      />,
    );

    const contentEl = screen.getByTestId("letter-content");
    expect(contentEl).toHaveTextContent("Dear Client,");
    expect(contentEl).toHaveTextContent("This is the engagement letter from your accountant.");
  });

  it("[AC-IDNT-007-03 UI] letter content container exists in the DOM", () => {
    render(
      <LetterSignStep
        engagementId={ENGAGEMENT_ID}
        letterContent={LETTER_CONTENT}
        isSigned={false}
      />,
    );

    expect(screen.getByTestId("letter-content")).toBeInTheDocument();
  });

  it("[AC-IDNT-007-03 UI] shows fallback message when letterContent is empty", () => {
    render(
      <LetterSignStep
        engagementId={ENGAGEMENT_ID}
        letterContent=""
        isSigned={false}
      />,
    );

    const contentEl = screen.getByTestId("letter-content");
    expect(contentEl).toHaveTextContent("No letter template configured");
  });

  it("[AC-IDNT-007-03 UI] OnboardingSequence passes letter content to LetterSignStep", () => {
    render(
      <OnboardingSequence model={UNSIGNED_READ_MODEL} letterContent={LETTER_CONTENT} />,
    );

    // The letter content should appear in the rendered output
    expect(screen.getByTestId("letter-content")).toHaveTextContent(
      "This is the engagement letter from your accountant.",
    );
  });

});

describe("LetterSignStep — sign button wiring (tier-2)", () => {

  it("renders the sign button when isSigned is false", () => {
    render(
      <LetterSignStep
        engagementId={ENGAGEMENT_ID}
        letterContent={LETTER_CONTENT}
        isSigned={false}
      />,
    );

    expect(screen.getByTestId("sign-letter-button")).toBeInTheDocument();
  });

  it("does NOT render the sign button when isSigned is true", () => {
    render(
      <LetterSignStep
        engagementId={ENGAGEMENT_ID}
        letterContent={LETTER_CONTENT}
        isSigned={true}
      />,
    );

    expect(screen.queryByTestId("sign-letter-button")).not.toBeInTheDocument();
    expect(screen.getByTestId("letter-signed-confirmation")).toBeInTheDocument();
  });

  it("clicking sign button invokes signEngagementLetterAction with the engagementId", async () => {
    render(
      <LetterSignStep
        engagementId={ENGAGEMENT_ID}
        letterContent={LETTER_CONTENT}
        isSigned={false}
      />,
    );

    const button = screen.getByTestId("sign-letter-button");
    fireEvent.click(button);

    await waitFor(() => {
      expect(mockSignEngagementLetterAction).toHaveBeenCalledOnce();
      expect(mockSignEngagementLetterAction).toHaveBeenCalledWith(ENGAGEMENT_ID);
    });
  });

  it("calls onSignComplete with the updated model on successful sign", async () => {
    const onSignComplete = vi.fn();

    render(
      <LetterSignStep
        engagementId={ENGAGEMENT_ID}
        letterContent={LETTER_CONTENT}
        isSigned={false}
        onSignComplete={onSignComplete}
      />,
    );

    fireEvent.click(screen.getByTestId("sign-letter-button"));

    await waitFor(() => {
      expect(onSignComplete).toHaveBeenCalledOnce();
      expect(onSignComplete).toHaveBeenCalledWith(SIGNED_READ_MODEL);
    });
  });

  it("shows error message when signEngagementLetterAction returns failure", async () => {
    mockSignEngagementLetterAction.mockResolvedValueOnce({
      success: false,
      error: "Signing failed: not the owner",
    });

    render(
      <LetterSignStep
        engagementId={ENGAGEMENT_ID}
        letterContent={LETTER_CONTENT}
        isSigned={false}
      />,
    );

    fireEvent.click(screen.getByTestId("sign-letter-button"));

    await waitFor(() => {
      expect(screen.getByTestId("sign-error-message")).toHaveTextContent(
        "Signing failed: not the owner",
      );
    });
  });

  it("[security] letter content rendered as text — no HTML injection possible", () => {
    // Verify that potentially dangerous content is auto-escaped (not executed as HTML).
    const maliciousContent = "<script>alert('xss')</script>";

    render(
      <LetterSignStep
        engagementId={ENGAGEMENT_ID}
        letterContent={maliciousContent}
        isSigned={false}
      />,
    );

    // The content should appear as text (escaped), not as a DOM script element.
    const contentEl = screen.getByTestId("letter-content");
    // React auto-escapes JSX text — the script tag appears as literal text, not a DOM node.
    expect(contentEl).toHaveTextContent("<script>alert('xss')</script>");
    // No actual <script> element was created inside the content container.
    expect(contentEl.querySelector("script")).toBeNull();
  });

});
