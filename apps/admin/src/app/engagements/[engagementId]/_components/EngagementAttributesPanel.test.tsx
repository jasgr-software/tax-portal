/**
 * apps/admin/src/app/engagements/[engagementId]/_components/EngagementAttributesPanel.test.tsx
 *
 * Component tests for EngagementAttributesPanel.
 *
 * TASK-011-003: Admin attribute server actions + UI panel (due date / note / priority flag).
 *
 * Acceptance criteria tested:
 *   AC-LIFE-007-01 — due-date input is rendered; "Set due date" button calls setDueDateAction
 *   AC-LIFE-007-02 — "Update due date" button calls setDueDateAction (when a date already set)
 *   AC-LIFE-008-01 — note recorder textarea + "Add note" button calls recordNoteAction
 *   AC-LIFE-009-01 — priority toggle calls setPriorityAction(true) when unflagged
 *   AC-LIFE-009-02 — priority toggle calls setPriorityAction(false) when flagged
 *
 * Strategy:
 *   - Render EngagementAttributesPanel directly in jsdom (no real server actions).
 *   - Mock all server actions from the attributes/actions module.
 *   - Mirrors DocumentRequestEditor.test.tsx pattern (established component test pattern).
 *   - No real DB connection; all writes go through mocked actions.
 *
 * // ADR-006: component tested here is apps/admin ONLY — the test does not touch apps/portal
 * // CS-TS-003: verified by this test existing ONLY in apps/admin (no portal mirror)
 * // CS-GEN-003: cite governing authority in comments
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { EngagementNoteItem } from "@tax-portal/db";

// ─── Hoisted mock functions ───────────────────────────────────────────────────

const {
  mockSetDueDateAction,
  mockRecordNoteAction,
  mockSetPriorityAction,
} = vi.hoisted(() => ({
  mockSetDueDateAction: vi.fn(),
  mockRecordNoteAction: vi.fn(),
  mockSetPriorityAction: vi.fn(),
}));

// ─── Mocks ────────────────────────────────────────────────────────────────────

// Mock the attributes server actions (absolute + relative paths)
vi.mock(
  "@/app/engagements/[engagementId]/attributes/actions",
  () => ({
    setDueDateAction: mockSetDueDateAction,
    recordNoteAction: mockRecordNoteAction,
    setPriorityAction: mockSetPriorityAction,
  }),
);

// Also mock via relative import path (matches how the component imports it)
vi.mock("../attributes/actions", () => ({
  setDueDateAction: mockSetDueDateAction,
  recordNoteAction: mockRecordNoteAction,
  setPriorityAction: mockSetPriorityAction,
}));

// Mock @tax-portal/db for type imports (no real DB needed in component tests)
vi.mock("@tax-portal/db", () => ({}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { EngagementAttributesPanel } from "./EngagementAttributesPanel.js";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ENGAGEMENT_ID = "eng-011-comp-test-001";

const EXISTING_NOTES: EngagementNoteItem[] = [
  {
    id: "note-001",
    engagementId: ENGAGEMENT_ID,
    body: "Initial contact made — client requires K-1 statements.",
    createdBy: "user_acct_test",
    createdAt: new Date("2026-06-01T10:00:00Z"),
    updatedAt: new Date("2026-06-01T10:00:00Z"),
  },
  {
    id: "note-002",
    engagementId: ENGAGEMENT_ID,
    body: "Awaiting amended W-2 from employer.",
    createdBy: "user_acct_test",
    createdAt: new Date("2026-06-05T14:30:00Z"),
    updatedAt: new Date("2026-06-05T14:30:00Z"),
  },
];

type PanelProps = React.ComponentProps<typeof EngagementAttributesPanel>;

function renderPanel(overrides: Partial<PanelProps> = {}) {
  return render(
    <EngagementAttributesPanel
      engagementId={ENGAGEMENT_ID}
      dueDate={null}
      isPriority={false}
      notes={[]}
      {...overrides}
    />,
  );
}

// ─── Tests: render / DOM presence ─────────────────────────────────────────────

describe("EngagementAttributesPanel — DOM presence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSetDueDateAction.mockResolvedValue({ success: true });
    mockRecordNoteAction.mockResolvedValue({ success: true });
    mockSetPriorityAction.mockResolvedValue({ success: true });
  });

  it("renders with data-testid='engagement-attributes-panel' root container", () => {
    renderPanel();
    expect(screen.getByTestId("engagement-attributes-panel")).toBeInTheDocument();
  });

  it("[AC-LIFE-007-01] renders due-date input (data-testid='due-date-input')", () => {
    renderPanel();
    expect(screen.getByTestId("due-date-input")).toBeInTheDocument();
  });

  it("[AC-LIFE-007-01] renders set-due-date button (data-testid='set-due-date-button')", () => {
    renderPanel();
    expect(screen.getByTestId("set-due-date-button")).toBeInTheDocument();
  });

  it("[AC-LIFE-007-02] shows 'Update due date' button when a date is already set", () => {
    renderPanel({ dueDate: new Date("2026-12-31") });
    expect(screen.getByTestId("set-due-date-button")).toHaveTextContent(/update due date/i);
  });

  it("[AC-LIFE-007-01] shows 'Set due date' button when no date is set", () => {
    renderPanel({ dueDate: null });
    expect(screen.getByTestId("set-due-date-button")).toHaveTextContent(/set due date/i);
  });

  it("[AC-LIFE-009-01] renders priority toggle button (data-testid='priority-toggle-button')", () => {
    renderPanel();
    expect(screen.getByTestId("priority-toggle-button")).toBeInTheDocument();
  });

  it("[AC-LIFE-009-01] shows 'Flag as priority' when not currently flagged", () => {
    renderPanel({ isPriority: false });
    expect(screen.getByTestId("priority-toggle-button")).toHaveTextContent(/flag as priority/i);
  });

  it("[AC-LIFE-009-02] shows 'Remove priority flag' when currently flagged", () => {
    renderPanel({ isPriority: true });
    expect(screen.getByTestId("priority-toggle-button")).toHaveTextContent(/remove priority flag/i);
  });

  it("[AC-LIFE-009-02] shows priority badge when engagement is flagged", () => {
    renderPanel({ isPriority: true });
    expect(screen.getByTestId("priority-badge")).toBeInTheDocument();
    expect(screen.getByTestId("priority-badge")).toHaveTextContent(/priority/i);
  });

  it("[AC-LIFE-009-01] does not show priority badge when not flagged", () => {
    renderPanel({ isPriority: false });
    expect(screen.queryByTestId("priority-badge")).not.toBeInTheDocument();
  });

  it("[AC-LIFE-008-01] renders note-body textarea (data-testid='note-body-input')", () => {
    renderPanel();
    expect(screen.getByTestId("note-body-input")).toBeInTheDocument();
  });

  it("[AC-LIFE-008-01] renders record-note button (data-testid='record-note-button')", () => {
    renderPanel();
    expect(screen.getByTestId("record-note-button")).toBeInTheDocument();
  });

  it("[AC-LIFE-008-01] renders existing notes when notes prop is provided", () => {
    renderPanel({ notes: EXISTING_NOTES });
    expect(screen.getByTestId("notes-list")).toBeInTheDocument();
    const items = screen.getAllByTestId("note-item");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Initial contact made — client requires K-1 statements.");
    expect(items[1]).toHaveTextContent("Awaiting amended W-2 from employer.");
  });

  it("[AC-LIFE-008-01] shows empty state message when no notes exist", () => {
    renderPanel({ notes: [] });
    expect(screen.queryByTestId("notes-list")).not.toBeInTheDocument();
    expect(screen.getByText(/no internal notes yet/i)).toBeInTheDocument();
  });
});

// ─── Tests: setDueDateAction wire-up (AC-LIFE-007-01/-02) ────────────────────

describe("[AC-LIFE-007-01] [AC-LIFE-007-02] setDueDateAction wire-up", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSetDueDateAction.mockResolvedValue({ success: true });
  });

  it("[AC-LIFE-007-01] clicking 'Set due date' calls setDueDateAction with the date value", async () => {
    const user = userEvent.setup();
    renderPanel();

    // Set a date value in the input
    const dateInput = screen.getByTestId("due-date-input");
    await user.type(dateInput, "2026-12-31");

    await user.click(screen.getByTestId("set-due-date-button"));

    await waitFor(() => {
      expect(mockSetDueDateAction).toHaveBeenCalledWith(
        ENGAGEMENT_ID,
        "2026-12-31",
      );
    });
  });

  it("[AC-LIFE-007-01] shows success message after setting due date", async () => {
    const user = userEvent.setup();
    renderPanel();

    const dateInput = screen.getByTestId("due-date-input");
    await user.type(dateInput, "2026-12-31");
    await user.click(screen.getByTestId("set-due-date-button"));

    await waitFor(() => {
      expect(screen.getByTestId("attribute-action-status")).toBeInTheDocument();
    });
  });

  it("[AC-LIFE-007-01] shows error message when setDueDateAction fails", async () => {
    mockSetDueDateAction.mockResolvedValue({ success: false, error: "Engagement not found" });
    const user = userEvent.setup();
    renderPanel();

    const dateInput = screen.getByTestId("due-date-input");
    await user.type(dateInput, "2026-12-31");
    await user.click(screen.getByTestId("set-due-date-button"));

    await waitFor(() => {
      const status = screen.getByTestId("attribute-action-status");
      expect(status).toBeInTheDocument();
      expect(status).toHaveTextContent(/engagement not found/i);
    });
  });
});

// ─── Tests: recordNoteAction wire-up (AC-LIFE-008-01) ────────────────────────

describe("[AC-LIFE-008-01] recordNoteAction wire-up", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRecordNoteAction.mockResolvedValue({ success: true });
  });

  it("[AC-LIFE-008-01] clicking 'Add note' calls recordNoteAction with the note text", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.type(screen.getByTestId("note-body-input"), "K-1 forms needed from trust.");
    await user.click(screen.getByTestId("record-note-button"));

    await waitFor(() => {
      expect(mockRecordNoteAction).toHaveBeenCalledWith(
        ENGAGEMENT_ID,
        "K-1 forms needed from trust.",
      );
    });
  });

  it("[AC-LIFE-008-01] clears note textarea after successful recording", async () => {
    const user = userEvent.setup();
    renderPanel();

    const textarea = screen.getByTestId("note-body-input");
    await user.type(textarea, "Some note to record");
    await user.click(screen.getByTestId("record-note-button"));

    await waitFor(() => {
      expect(mockRecordNoteAction).toHaveBeenCalled();
    });

    // Note input is cleared on success
    expect(textarea).toHaveValue("");
  });

  it("[AC-LIFE-008-01] 'Add note' button is disabled when note text is empty", () => {
    renderPanel();
    const button = screen.getByTestId("record-note-button");
    expect(button).toBeDisabled();
  });

  it("[AC-LIFE-008-01] shows error message when recordNoteAction fails", async () => {
    mockRecordNoteAction.mockResolvedValue({ success: false, error: "Note body required" });
    const user = userEvent.setup();
    renderPanel();

    await user.type(screen.getByTestId("note-body-input"), "A note");
    await user.click(screen.getByTestId("record-note-button"));

    await waitFor(() => {
      const status = screen.getByTestId("attribute-action-status");
      expect(status).toHaveTextContent(/note body required/i);
    });
  });
});

// ─── Tests: setPriorityAction wire-up (AC-LIFE-009-01/-02) ───────────────────

describe("[AC-LIFE-009-01] [AC-LIFE-009-02] setPriorityAction wire-up", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSetPriorityAction.mockResolvedValue({ success: true });
  });

  it("[AC-LIFE-009-01] clicking toggle when unflagged calls setPriorityAction(true)", async () => {
    const user = userEvent.setup();
    renderPanel({ isPriority: false });

    await user.click(screen.getByTestId("priority-toggle-button"));

    await waitFor(() => {
      expect(mockSetPriorityAction).toHaveBeenCalledWith(ENGAGEMENT_ID, true);
    });
  });

  it("[AC-LIFE-009-02] clicking toggle when flagged calls setPriorityAction(false)", async () => {
    const user = userEvent.setup();
    renderPanel({ isPriority: true });

    await user.click(screen.getByTestId("priority-toggle-button"));

    await waitFor(() => {
      expect(mockSetPriorityAction).toHaveBeenCalledWith(ENGAGEMENT_ID, false);
    });
  });

  it("[AC-LIFE-009-01] shows priority badge after successfully flagging", async () => {
    const user = userEvent.setup();
    renderPanel({ isPriority: false });

    await user.click(screen.getByTestId("priority-toggle-button"));

    await waitFor(() => {
      expect(screen.getByTestId("priority-badge")).toBeInTheDocument();
    });
  });

  it("[AC-LIFE-009-02] hides priority badge after successfully unflagging", async () => {
    const user = userEvent.setup();
    renderPanel({ isPriority: true });

    await user.click(screen.getByTestId("priority-toggle-button"));

    await waitFor(() => {
      expect(screen.queryByTestId("priority-badge")).not.toBeInTheDocument();
    });
  });

  it("[AC-LIFE-009-01] shows success message after flagging", async () => {
    const user = userEvent.setup();
    renderPanel({ isPriority: false });

    await user.click(screen.getByTestId("priority-toggle-button"));

    await waitFor(() => {
      expect(screen.getByTestId("attribute-action-status")).toBeInTheDocument();
    });
  });

  it("[AC-LIFE-009-01] shows error message when setPriorityAction fails", async () => {
    mockSetPriorityAction.mockResolvedValue({ success: false, error: "Engagement not found" });
    const user = userEvent.setup();
    renderPanel({ isPriority: false });

    await user.click(screen.getByTestId("priority-toggle-button"));

    await waitFor(() => {
      const status = screen.getByTestId("attribute-action-status");
      expect(status).toHaveTextContent(/engagement not found/i);
    });
  });
});
