/**
 * apps/admin/src/app/settings/questionnaire-templates/template-editor.test.tsx
 *
 * Component tests for QuestionnaireTemplateEditor.
 *
 * AC-DASH-012-01: Accountant can author and save a new template for a service type.
 * AC-DASH-012-02: Editor is keyed per serviceId; save action receives the correct serviceId.
 * AC-DASH-012-03: Editor loads and displays existing questions; edited content is submitted on save.
 * AC-ONBD-003-02: Switching service types loads that service's questions (distinct per serviceId).
 *
 * Security:
 *   - Question prompts rendered via controlled input values (auto-escaped — no XSS risk).
 *   - No dangerouslySetInnerHTML usage.
 *
 * Strategy:
 *   - Render QuestionnaireTemplateEditor directly in jsdom.
 *   - Mock getQuestionnaireTemplateAction and upsertQuestionnaireTemplateAction.
 *   - Mirrors apps/admin/src/app/settings/letter-template/template-editor.test.tsx pattern.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { QuestionDef } from "@tax-portal/db";

// ─── Hoisted mock functions ───────────────────────────────────────────────────

const { mockGetQuestionnaireTemplateAction, mockUpsertQuestionnaireTemplateAction } =
  vi.hoisted(() => ({
    mockGetQuestionnaireTemplateAction: vi.fn(),
    mockUpsertQuestionnaireTemplateAction: vi.fn(),
  }));

// ─── Mocks ────────────────────────────────────────────────────────────────────

// Mock the actions module so the component does not need a server environment
vi.mock("@/app/settings/questionnaire-templates/actions", () => ({
  getQuestionnaireTemplateAction: mockGetQuestionnaireTemplateAction,
  upsertQuestionnaireTemplateAction: mockUpsertQuestionnaireTemplateAction,
}));

// Also cover the relative import path
vi.mock("../actions", () => ({
  getQuestionnaireTemplateAction: mockGetQuestionnaireTemplateAction,
  upsertQuestionnaireTemplateAction: mockUpsertQuestionnaireTemplateAction,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/settings/questionnaire-templates",
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { QuestionnaireTemplateEditor } from "./_components/QuestionnaireTemplateEditor.js";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const SERVICES = [
  { id: "svc-001", name: "Individual Tax Return", description: null, sortOrder: 1 },
  { id: "svc-002", name: "Business Tax Return", description: null, sortOrder: 2 },
];

const EXISTING_QUESTIONS: QuestionDef[] = [
  { id: "q-001", prompt: "What is your filing status?", type: "text", required: true },
  { id: "q-002", prompt: "Describe any major life changes.", type: "textarea", required: false },
];

const BUSINESS_QUESTIONS: QuestionDef[] = [
  { id: "q-b01", prompt: "Business entity type?", type: "text", required: true },
];

function renderEditor(
  overrides: Partial<React.ComponentProps<typeof QuestionnaireTemplateEditor>> = {},
) {
  return render(
    <QuestionnaireTemplateEditor
      services={SERVICES}
      initialServiceId="svc-001"
      initialQuestions={null}
      {...overrides}
    />,
  );
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe("QuestionnaireTemplateEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpsertQuestionnaireTemplateAction.mockResolvedValue({ success: true, action: "created" });
    mockGetQuestionnaireTemplateAction.mockResolvedValue({ success: true, data: null });
  });

  // ── Render tests ─────────────────────────────────────────────────────────────

  it("renders with data-testid='questionnaire-editor' root container", () => {
    renderEditor();
    expect(screen.getByTestId("questionnaire-editor")).toBeInTheDocument();
  });

  it("renders the service picker with all available services", () => {
    renderEditor();

    const picker = screen.getByLabelText(/service type/i);
    expect(picker).toBeInTheDocument();

    const options = within(picker as HTMLElement).getAllByRole("option");
    expect(options).toHaveLength(2);
    expect(options[0]).toHaveTextContent("Individual Tax Return");
    expect(options[1]).toHaveTextContent("Business Tax Return");
  });

  it("renders data-service-id attributes on each service option", () => {
    renderEditor();

    const options = screen.getAllByRole("option");
    expect(options[0]).toHaveAttribute("data-service-id", "svc-001");
    expect(options[1]).toHaveAttribute("data-service-id", "svc-002");
  });

  it("renders the save button with data-testid='save-template'", () => {
    renderEditor();
    expect(screen.getByTestId("save-template")).toBeInTheDocument();
  });

  it("renders the '+ Add question' button", () => {
    renderEditor();
    expect(screen.getByRole("button", { name: /add question/i })).toBeInTheDocument();
  });

  /**
   * [AC-DASH-012-03] Existing questions are displayed when initialQuestions is provided.
   */
  it("[AC-DASH-012-03] renders existing question prompts when initialQuestions is provided", () => {
    renderEditor({ initialQuestions: EXISTING_QUESTIONS });

    expect(screen.getByDisplayValue("What is your filing status?")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Describe any major life changes.")).toBeInTheDocument();
  });

  it("[AC-DASH-012-03] renders empty state message when no questions exist", () => {
    renderEditor({ initialQuestions: null });

    expect(screen.getByText(/no questions yet/i)).toBeInTheDocument();
  });

  it("renders data-question-row attribute on each question row", () => {
    renderEditor({ initialQuestions: EXISTING_QUESTIONS });

    const rows = document.querySelectorAll("[data-question-row]");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveAttribute("data-question-row", "q-001");
    expect(rows[1]).toHaveAttribute("data-question-row", "q-002");
  });

  // ── Add / Remove question ─────────────────────────────────────────────────────

  /**
   * [AC-DASH-012-01] Clicking '+ Add question' appends a new question row.
   */
  it("[AC-DASH-012-01] clicking '+ Add question' adds a new question row", async () => {
    const user = userEvent.setup();
    renderEditor({ initialQuestions: [] });

    await user.click(screen.getByRole("button", { name: /add question/i }));

    const rows = document.querySelectorAll("[data-question-row]");
    expect(rows).toHaveLength(1);
  });

  it("clicking Remove removes the question row", async () => {
    const user = userEvent.setup();
    renderEditor({ initialQuestions: EXISTING_QUESTIONS });

    const removeButtons = screen.getAllByRole("button", { name: /remove question/i });
    await user.click(removeButtons[0]!);

    const rows = document.querySelectorAll("[data-question-row]");
    expect(rows).toHaveLength(1);
  });

  // ── Save interaction ──────────────────────────────────────────────────────────

  /**
   * [AC-DASH-012-01] Save invokes upsertQuestionnaireTemplateAction with the serviceId + questions.
   */
  it("[AC-DASH-012-01] save button invokes upsertQuestionnaireTemplateAction with serviceId + questions", async () => {
    const user = userEvent.setup();
    renderEditor({ initialServiceId: "svc-001", initialQuestions: EXISTING_QUESTIONS });

    await user.click(screen.getByTestId("save-template"));

    await waitFor(() => {
      expect(mockUpsertQuestionnaireTemplateAction).toHaveBeenCalledWith(
        "svc-001",
        EXISTING_QUESTIONS,
      );
    });
  });

  /**
   * [AC-DASH-012-02] The selectedServiceId is passed to the save action — service-type binding.
   */
  it("[AC-DASH-012-02] passes the correct serviceId to the save action (service-type binding)", async () => {
    const user = userEvent.setup();
    renderEditor({ initialServiceId: "svc-001", initialQuestions: EXISTING_QUESTIONS });

    await user.click(screen.getByTestId("save-template"));

    await waitFor(() => {
      expect(mockUpsertQuestionnaireTemplateAction).toHaveBeenCalledWith(
        "svc-001",
        expect.any(Array),
      );
    });
  });

  /**
   * [AC-DASH-012-03] Editing a question prompt and saving submits the updated content.
   */
  it("[AC-DASH-012-03] save submits the updated prompt after the accountant edits it", async () => {
    const user = userEvent.setup();
    renderEditor({ initialServiceId: "svc-001", initialQuestions: EXISTING_QUESTIONS });

    // Find the first question prompt input and update it
    const promptInput = screen.getByDisplayValue("What is your filing status?");
    await user.clear(promptInput);
    await user.type(promptInput, "Updated: what is your filing status?");

    await user.click(screen.getByTestId("save-template"));

    await waitFor(() => {
      expect(mockUpsertQuestionnaireTemplateAction).toHaveBeenCalledWith(
        "svc-001",
        expect.arrayContaining([
          expect.objectContaining({ prompt: "Updated: what is your filing status?" }),
        ]),
      );
    });
  });

  it("shows success status banner after a successful save", async () => {
    const user = userEvent.setup();
    renderEditor({ initialServiceId: "svc-001", initialQuestions: EXISTING_QUESTIONS });

    await user.click(screen.getByTestId("save-template"));

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(/saved successfully/i);
    });
  });

  it("shows error alert banner when upsertQuestionnaireTemplateAction returns { success: false }", async () => {
    mockUpsertQuestionnaireTemplateAction.mockResolvedValue({
      success: false,
      error: "At least one question is required",
    });

    const user = userEvent.setup();
    renderEditor({ initialServiceId: "svc-001", initialQuestions: [] });

    await user.click(screen.getByTestId("save-template"));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/at least one question is required/i);
    });
  });

  it("shows error alert when action returns unauthorized error", async () => {
    mockUpsertQuestionnaireTemplateAction.mockResolvedValue({
      success: false,
      error: "Unauthorized: ACCOUNTANT identity required",
    });

    const user = userEvent.setup();
    renderEditor({ initialServiceId: "svc-001", initialQuestions: EXISTING_QUESTIONS });

    await user.click(screen.getByTestId("save-template"));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Unauthorized: ACCOUNTANT identity required",
      );
    });
  });

  // ── Service switching ─────────────────────────────────────────────────────────

  /**
   * [AC-ONBD-003-02] Switching to a different service type loads that service's template.
   */
  it("[AC-ONBD-003-02] switching service type calls getQuestionnaireTemplateAction with the new serviceId", async () => {
    const user = userEvent.setup();
    mockGetQuestionnaireTemplateAction.mockResolvedValue({
      success: true,
      data: {
        id: "qt-002",
        serviceId: "svc-002",
        questions: JSON.stringify(BUSINESS_QUESTIONS),
        updatedBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    renderEditor({ initialServiceId: "svc-001", initialQuestions: EXISTING_QUESTIONS });

    const picker = screen.getByLabelText(/service type/i);
    await user.selectOptions(picker, "svc-002");

    await waitFor(() => {
      expect(mockGetQuestionnaireTemplateAction).toHaveBeenCalledWith("svc-002");
    });
  });

  /**
   * [AC-ONBD-003-02] After switching to svc-002, the editor renders svc-002's questions
   * (not svc-001's) — distinct templates, no cross-contamination.
   */
  it("[AC-ONBD-003-02] after service switch, renders the newly loaded service's questions", async () => {
    const user = userEvent.setup();
    mockGetQuestionnaireTemplateAction.mockResolvedValue({
      success: true,
      data: {
        id: "qt-002",
        serviceId: "svc-002",
        questions: JSON.stringify(BUSINESS_QUESTIONS),
        updatedBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    renderEditor({ initialServiceId: "svc-001", initialQuestions: EXISTING_QUESTIONS });

    const picker = screen.getByLabelText(/service type/i);
    await user.selectOptions(picker, "svc-002");

    await waitFor(() => {
      expect(screen.getByDisplayValue("Business entity type?")).toBeInTheDocument();
    });

    // svc-001 questions must NOT be visible
    expect(screen.queryByDisplayValue("What is your filing status?")).not.toBeInTheDocument();
  });

  // ── XSS safety ────────────────────────────────────────────────────────────────

  /**
   * Security: question prompts with HTML special characters are rendered safely
   * via controlled input values — no dangerouslySetInnerHTML.
   */
  it("renders question prompt with HTML special characters safely (no XSS via input value)", () => {
    const xssPrompt = '<script>alert("xss")</script>';
    const xssQuestions: QuestionDef[] = [
      { id: "q-xss", prompt: xssPrompt, type: "text", required: false },
    ];

    renderEditor({ initialQuestions: xssQuestions });

    const input = screen.getByDisplayValue(xssPrompt);
    expect(input).toBeInTheDocument();
    // No <script> injected into the DOM
    expect(document.querySelector("script[data-injected]")).not.toBeInTheDocument();
  });
});
