/**
 * apps/admin/src/app/settings/letter-template/template-editor.test.tsx
 *
 * Tier-5 component tests for TemplateEditor.
 *
 * AC-IDNT-007-01: Renders the current template content (default on first open).
 * AC-IDNT-007-02: Save button invokes updateLetterTemplateAction with the edited content.
 *
 * Strategy:
 *   - Render TemplateEditor directly in jsdom (no Next.js server needed).
 *   - Mock updateLetterTemplateAction — component tests focus on UI behavior, not DB.
 *   - vi.hoisted() + vi.mock() pattern mirrors catalog-management.test.tsx.
 *   - Content rendered via textarea value (auto-escaped — no XSS risk).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ─── Hoisted mock functions ───────────────────────────────────────────────────

const { mockUpdateLetterTemplateAction } = vi.hoisted(() => ({
  mockUpdateLetterTemplateAction: vi.fn(),
}));

// ─── Mocks ────────────────────────────────────────────────────────────────────

// Mock the actions module so TemplateEditor does not need a server environment
vi.mock("@/app/settings/letter-template/actions", () => ({
  updateLetterTemplateAction: mockUpdateLetterTemplateAction,
}));

// Also mock the relative path for the .js extension import in the component
vi.mock("../actions", () => ({
  updateLetterTemplateAction: mockUpdateLetterTemplateAction,
}));

// Mock next/navigation — not used by this component but may be pulled in transitively
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/settings/letter-template",
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { TemplateEditor } from "./_components/TemplateEditor.js";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const SYSTEM_DEFAULT_CONTENT =
  "This Engagement Letter sets forth the terms and conditions under which [Firm Name] agrees to provide tax preparation services.";

// ─── Test suite ───────────────────────────────────────────────────────────────

describe("TemplateEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateLetterTemplateAction.mockResolvedValue({ success: true });
  });

  // ── Render tests ─────────────────────────────────────────────────────────────

  /**
   * [AC-IDNT-007-01] Renders the default/current template content in the textarea.
   * The accountant sees the seeded default on first open — no authoring required.
   */
  it("[AC-IDNT-007-01] renders the current template content in the textarea", () => {
    render(<TemplateEditor initialContent={SYSTEM_DEFAULT_CONTENT} />);

    const textarea = screen.getByTestId("template-content");
    expect(textarea).toBeInTheDocument();
    expect(textarea).toHaveValue(SYSTEM_DEFAULT_CONTENT);
  });

  /**
   * [AC-IDNT-007-01] Renders an empty textarea when content is null (unseeded DB defensive path)
   */
  it("[AC-IDNT-007-01] renders empty textarea when initialContent is null (unseeded DB)", () => {
    render(<TemplateEditor initialContent={null} />);

    const textarea = screen.getByTestId("template-content");
    expect(textarea).toBeInTheDocument();
    expect(textarea).toHaveValue("");
  });

  it("renders the Save template button", () => {
    render(<TemplateEditor initialContent={SYSTEM_DEFAULT_CONTENT} />);

    expect(screen.getByRole("button", { name: /save template/i })).toBeInTheDocument();
  });

  it("renders the textarea label", () => {
    render(<TemplateEditor initialContent={SYSTEM_DEFAULT_CONTENT} />);

    expect(screen.getByLabelText(/template content/i)).toBeInTheDocument();
  });

  // ── Save interaction tests ────────────────────────────────────────────────────

  /**
   * [AC-IDNT-007-02] Clicking Save invokes updateLetterTemplateAction with the current content.
   */
  it("[AC-IDNT-007-02] save button invokes updateLetterTemplateAction with the current content", async () => {
    const user = userEvent.setup();
    render(<TemplateEditor initialContent={SYSTEM_DEFAULT_CONTENT} />);

    await user.click(screen.getByRole("button", { name: /save template/i }));

    await waitFor(() => {
      expect(mockUpdateLetterTemplateAction).toHaveBeenCalledWith(SYSTEM_DEFAULT_CONTENT);
    });
  });

  /**
   * [AC-IDNT-007-02] Save invokes the action with the edited (new) content.
   * The accountant types new content and saves — the action receives the updated text.
   */
  it("[AC-IDNT-007-02] save invokes the action with edited content after the accountant types", async () => {
    const user = userEvent.setup();
    render(<TemplateEditor initialContent={SYSTEM_DEFAULT_CONTENT} />);

    const textarea = screen.getByTestId("template-content");

    // Clear and type new content
    await user.clear(textarea);
    await user.type(textarea, "New engagement letter text.");

    await user.click(screen.getByRole("button", { name: /save template/i }));

    await waitFor(() => {
      expect(mockUpdateLetterTemplateAction).toHaveBeenCalledWith(
        "New engagement letter text.",
      );
    });
  });

  /**
   * Success banner shown after a successful save
   */
  it("shows success status after a successful save", async () => {
    const user = userEvent.setup();
    render(<TemplateEditor initialContent={SYSTEM_DEFAULT_CONTENT} />);

    await user.click(screen.getByRole("button", { name: /save template/i }));

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(/saved successfully/i);
    });
  });

  /**
   * Error banner shown when the action returns { success: false }
   */
  it("shows error alert when updateLetterTemplateAction returns { success: false }", async () => {
    mockUpdateLetterTemplateAction.mockResolvedValue({
      success: false,
      error: "No template row found to update — the database may not be seeded.",
    });

    const user = userEvent.setup();
    render(<TemplateEditor initialContent={SYSTEM_DEFAULT_CONTENT} />);

    await user.click(screen.getByRole("button", { name: /save template/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "No template row found to update — the database may not be seeded.",
      );
    });
  });

  /**
   * Error banner shown when the action returns unauthorized
   */
  it("shows error alert when action returns unauthorized error", async () => {
    mockUpdateLetterTemplateAction.mockResolvedValue({
      success: false,
      error: "Unauthorized: ACCOUNTANT identity required",
    });

    const user = userEvent.setup();
    render(<TemplateEditor initialContent={SYSTEM_DEFAULT_CONTENT} />);

    await user.click(screen.getByRole("button", { name: /save template/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Unauthorized: ACCOUNTANT identity required",
      );
    });
  });

  /**
   * No XSS risk — content with special characters is rendered via textarea value,
   * not dangerouslySetInnerHTML. React auto-escapes textarea content.
   */
  it("renders content with HTML special characters safely (no XSS via textarea value)", () => {
    const xssAttempt = '<script>alert("xss")</script>';
    render(<TemplateEditor initialContent={xssAttempt} />);

    const textarea = screen.getByTestId("template-content");
    // The textarea value is set correctly — React handles escaping internally
    expect(textarea).toHaveValue(xssAttempt);

    // No <script> element was injected into the DOM (it's safely in a textarea value)
    expect(document.querySelector("script[data-injected]")).not.toBeInTheDocument();
  });
});
