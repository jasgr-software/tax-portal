/**
 * apps/admin/src/app/engagements/[engagementId]/documents/_components/RetentionPanel.test.tsx
 *
 * Component tests for RetentionPanel (purge-confirm + legal-hold controls).
 * TASK-015-003 / BRIEF-015 / EPIC-015 — post-retention destructive lifecycle.
 *
 * Acceptance criteria tested:
 *   AC-FILE-013-03 — The purge confirm control is disabled until explicit confirmation is given.
 *                    No purge proceeds without confirmation — the button is disabled.
 *   AC-FILE-014-01 — Place hold button renders and calls placeLegalHoldAction.
 *   AC-FILE-014-05 — Lift hold button renders per active hold; calls liftLegalHoldAction.
 *   (implicit) Eligibility reason is surfaced read-only via the prop (not re-derived client-side).
 *
 * Strategy:
 *   - Render RetentionPanel directly in jsdom (no real server actions).
 *   - Mock all server actions from retention-actions module.
 *   - Mirrors EngagementAttributesPanel.test.tsx pattern.
 *   - No real DB connection; all writes go through mocked actions.
 *   - CS-TS-003: this test lives ONLY in apps/admin — no portal mirror.
 *
 * // ADR-006: component tested here is apps/admin ONLY
 * // CS-TS-003: verified by this test existing ONLY in apps/admin
 * // CS-GEN-003: cite governing authority in comments
 * // AC-FILE-013-03 // AC-FILE-014-01 // AC-FILE-014-05
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { LegalHoldItem, PurgeEligibilityResult } from "../retention-actions.js";

// ─── Hoisted mock functions ───────────────────────────────────────────────────

const {
  mockPurgeEngagementAction,
  mockPlaceLegalHoldAction,
  mockLiftLegalHoldAction,
} = vi.hoisted(() => ({
  mockPurgeEngagementAction: vi.fn(),
  mockPlaceLegalHoldAction: vi.fn(),
  mockLiftLegalHoldAction: vi.fn(),
}));

// ─── Mocks ────────────────────────────────────────────────────────────────────

// Mock the retention server actions (both absolute and relative import paths)
vi.mock(
  "@/app/engagements/[engagementId]/documents/retention-actions",
  () => ({
    purgeEngagementAction: mockPurgeEngagementAction,
    placeLegalHoldAction: mockPlaceLegalHoldAction,
    liftLegalHoldAction: mockLiftLegalHoldAction,
    retentionDeadlineFor: vi.fn(),
  }),
);

vi.mock("../retention-actions", () => ({
  purgeEngagementAction: mockPurgeEngagementAction,
  placeLegalHoldAction: mockPlaceLegalHoldAction,
  liftLegalHoldAction: mockLiftLegalHoldAction,
  retentionDeadlineFor: vi.fn(),
}));

// Mock @tax-portal/db — not needed in component tests
vi.mock("@tax-portal/db", () => ({}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { RetentionPanel } from "./RetentionPanel.js";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ENGAGEMENT_ID = "eng-015-comp-test-001";
const HOLD_ID = "hold-015-comp-test-001";

const ELIGIBLE: PurgeEligibilityResult = { eligible: true, reason: "eligible" };
const NOT_ELIGIBLE_IN_WINDOW: PurgeEligibilityResult = { eligible: false, reason: "in-window" };
const NOT_ELIGIBLE_HELD: PurgeEligibilityResult = { eligible: false, reason: "blocked-by-hold" };
const NOT_ELIGIBLE_NOT_COMPLETED: PurgeEligibilityResult = { eligible: false, reason: "not-completed" };

const ACTIVE_HOLD: LegalHoldItem = {
  id: HOLD_ID,
  scope: "engagement",
  engagementId: ENGAGEMENT_ID,
  clientUserId: null,
  placedByClerkId: "user_acct_test",
  placedAt: new Date("2026-01-15T10:00:00Z"),
  liftedByClerkId: null,
  liftedAt: null,
  reason: "litigation-hold-2026",
  createdAt: new Date("2026-01-15T10:00:00Z"),
  updatedAt: new Date("2026-01-15T10:00:00Z"),
};

// ─── Tests: eligibility reason display ───────────────────────────────────────

describe("RetentionPanel: eligibility reason surfaced read-only", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows eligible reason when eligible=true", () => {
    render(
      <RetentionPanel
        engagementId={ENGAGEMENT_ID}
        eligibility={ELIGIBLE}
        activeHolds={[]}
      />,
    );

    // data-testid="purge-eligibility-reason" — surfaces the reason without re-deriving it.
    const reasonEl = screen.getByTestId("purge-eligibility-reason");
    expect(reasonEl).toBeInTheDocument();
    expect(reasonEl.textContent).toMatch(/eligible/i);
  });

  it("shows in-window reason when not-eligible/in-window (AC-FILE-013-01)", () => {
    render(
      <RetentionPanel
        engagementId={ENGAGEMENT_ID}
        eligibility={NOT_ELIGIBLE_IN_WINDOW}
        activeHolds={[]}
      />,
    );

    const reasonEl = screen.getByTestId("purge-eligibility-reason");
    expect(reasonEl.textContent).toMatch(/retention window/i);
  });

  it("shows blocked-by-hold reason when not-eligible/blocked-by-hold (AC-FILE-014-03)", () => {
    render(
      <RetentionPanel
        engagementId={ENGAGEMENT_ID}
        eligibility={NOT_ELIGIBLE_HELD}
        activeHolds={[ACTIVE_HOLD]}
      />,
    );

    const reasonEl = screen.getByTestId("purge-eligibility-reason");
    expect(reasonEl.textContent).toMatch(/legal hold/i);
  });

  it("shows not-completed reason when engagement has no completion", () => {
    render(
      <RetentionPanel
        engagementId={ENGAGEMENT_ID}
        eligibility={NOT_ELIGIBLE_NOT_COMPLETED}
        activeHolds={[]}
      />,
    );

    const reasonEl = screen.getByTestId("purge-eligibility-reason");
    expect(reasonEl.textContent).toMatch(/not been completed/i);
  });
});

// ─── Tests: AC-FILE-013-03 — confirm-before-purge is required ────────────────
//
// The purge confirm control is disabled until the accountant types the engagement ID.
// AC-FILE-013-03: No data is permanently removed without explicit confirmation.

describe("[AC-FILE-013-03] Confirm-before-purge: disabled until explicit confirmation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPurgeEngagementAction.mockResolvedValue({ success: true, data: { outcome: "purged" } });
  });

  it("[AC-FILE-013-03] Purge button is visible when eligible; confirm dialog not shown initially", () => {
    render(
      <RetentionPanel
        engagementId={ENGAGEMENT_ID}
        eligibility={ELIGIBLE}
        activeHolds={[]}
      />,
    );

    // The initial "Initiate Purge…" button is present.
    const purgeButton = screen.getByTestId("purge-button");
    expect(purgeButton).toBeInTheDocument();

    // The confirm input and submit button should not be visible yet.
    expect(screen.queryByTestId("purge-confirm-input")).not.toBeInTheDocument();
    expect(screen.queryByTestId("purge-confirm-submit")).not.toBeInTheDocument();
  });

  it("[AC-FILE-013-03] Purge controls are NOT shown when not eligible", () => {
    render(
      <RetentionPanel
        engagementId={ENGAGEMENT_ID}
        eligibility={NOT_ELIGIBLE_IN_WINDOW}
        activeHolds={[]}
      />,
    );

    // No purge section shown when not eligible.
    expect(screen.queryByTestId("purge-button")).not.toBeInTheDocument();
    expect(screen.queryByTestId("purge-confirm-input")).not.toBeInTheDocument();
  });

  it("[AC-FILE-013-03] Clicking 'Initiate Purge' reveals the confirm input", async () => {
    const user = userEvent.setup();

    render(
      <RetentionPanel
        engagementId={ENGAGEMENT_ID}
        eligibility={ELIGIBLE}
        activeHolds={[]}
      />,
    );

    // Click the "Initiate Purge…" button to reveal the confirm flow.
    await user.click(screen.getByTestId("purge-button"));

    // Now the confirm input and submit button should appear.
    expect(screen.getByTestId("purge-confirm-input")).toBeInTheDocument();
    expect(screen.getByTestId("purge-confirm-submit")).toBeInTheDocument();
  });

  it("[AC-FILE-013-03] Confirm submit is DISABLED when input does not match engagement ID", async () => {
    const user = userEvent.setup();

    render(
      <RetentionPanel
        engagementId={ENGAGEMENT_ID}
        eligibility={ELIGIBLE}
        activeHolds={[]}
      />,
    );

    await user.click(screen.getByTestId("purge-button"));

    const confirmInput = screen.getByTestId("purge-confirm-input");
    const confirmSubmit = screen.getByTestId("purge-confirm-submit");

    // Initially disabled (empty input).
    // AC-FILE-013-03: disabled until confirmed.
    expect(confirmSubmit).toBeDisabled();

    // Type an incorrect value.
    await user.type(confirmInput, "wrong-id");

    // Still disabled — wrong value.
    expect(confirmSubmit).toBeDisabled();

    // Verify no purge action was called.
    expect(mockPurgeEngagementAction).not.toHaveBeenCalled();
  });

  it("[AC-FILE-013-03] Confirm submit is ENABLED when input exactly matches engagement ID", async () => {
    const user = userEvent.setup();

    render(
      <RetentionPanel
        engagementId={ENGAGEMENT_ID}
        eligibility={ELIGIBLE}
        activeHolds={[]}
      />,
    );

    await user.click(screen.getByTestId("purge-button"));

    const confirmInput = screen.getByTestId("purge-confirm-input");
    const confirmSubmit = screen.getByTestId("purge-confirm-submit");

    // Type the exact engagement ID.
    await user.type(confirmInput, ENGAGEMENT_ID);

    // Now the submit button should be enabled.
    // AC-FILE-013-03: enabled only when confirmation is complete.
    expect(confirmSubmit).not.toBeDisabled();
  });

  it("[AC-FILE-013-03] Clicking confirm submit calls purgeEngagementAction with confirmation=true", async () => {
    const user = userEvent.setup();

    render(
      <RetentionPanel
        engagementId={ENGAGEMENT_ID}
        eligibility={ELIGIBLE}
        activeHolds={[]}
      />,
    );

    await user.click(screen.getByTestId("purge-button"));

    const confirmInput = screen.getByTestId("purge-confirm-input");
    await user.type(confirmInput, ENGAGEMENT_ID);

    await user.click(screen.getByTestId("purge-confirm-submit"));

    await waitFor(() => {
      // AC-FILE-013-03: purgeEngagementAction called with confirmation=true.
      expect(mockPurgeEngagementAction).toHaveBeenCalledWith(
        ENGAGEMENT_ID,
        true, // AC-FILE-013-03: explicit confirmation
      );
    });
  });
});

// ─── Tests: AC-FILE-014-01 — place hold control ───────────────────────────────

describe("[AC-FILE-014-01] Place hold button renders and calls placeLegalHoldAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPlaceLegalHoldAction.mockResolvedValue({ success: true, data: { outcome: "placed", holdId: HOLD_ID } });
  });

  it("[AC-FILE-014-01] Place hold button is present", () => {
    render(
      <RetentionPanel
        engagementId={ENGAGEMENT_ID}
        eligibility={ELIGIBLE}
        activeHolds={[]}
      />,
    );

    // data-testid="legal-hold-place"
    expect(screen.getByTestId("legal-hold-place")).toBeInTheDocument();
  });

  it("[AC-FILE-014-01] Clicking place hold calls placeLegalHoldAction", async () => {
    const user = userEvent.setup();

    render(
      <RetentionPanel
        engagementId={ENGAGEMENT_ID}
        eligibility={ELIGIBLE}
        activeHolds={[]}
      />,
    );

    await user.click(screen.getByTestId("legal-hold-place"));

    await waitFor(() => {
      // AC-FILE-014-01: placeLegalHoldAction called with the engagement ID.
      // No reason arg supplied (it's optional in the component call).
      expect(mockPlaceLegalHoldAction).toHaveBeenCalledWith(ENGAGEMENT_ID);
    });
  });

  it("[AC-FILE-014-01] Success result is shown after placing hold", async () => {
    const user = userEvent.setup();

    render(
      <RetentionPanel
        engagementId={ENGAGEMENT_ID}
        eligibility={ELIGIBLE}
        activeHolds={[]}
      />,
    );

    await user.click(screen.getByTestId("legal-hold-place"));

    await waitFor(() => {
      const holdResult = screen.getByTestId("hold-result");
      expect(holdResult.textContent).toMatch(/legal hold placed/i);
    });
  });
});

// ─── Tests: AC-FILE-014-05 — lift hold controls ──────────────────────────────

describe("[AC-FILE-014-05] Active holds are listed; Lift hold button calls liftLegalHoldAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLiftLegalHoldAction.mockResolvedValue({ success: true, data: { outcome: "lifted" } });
  });

  it("[AC-FILE-014-05] Active holds list renders each hold", () => {
    render(
      <RetentionPanel
        engagementId={ENGAGEMENT_ID}
        eligibility={NOT_ELIGIBLE_HELD}
        activeHolds={[ACTIVE_HOLD]}
      />,
    );

    // data-testid="active-holds-list" is present.
    expect(screen.getByTestId("active-holds-list")).toBeInTheDocument();

    // Each hold item: data-testid="active-hold-item-{holdId}"
    expect(screen.getByTestId(`active-hold-item-${HOLD_ID}`)).toBeInTheDocument();

    // Each lift button: data-testid="legal-hold-lift-{holdId}"
    expect(screen.getByTestId(`legal-hold-lift-${HOLD_ID}`)).toBeInTheDocument();
  });

  it("[AC-FILE-014-05] Clicking Lift Hold calls liftLegalHoldAction with holdId", async () => {
    const user = userEvent.setup();

    render(
      <RetentionPanel
        engagementId={ENGAGEMENT_ID}
        eligibility={NOT_ELIGIBLE_HELD}
        activeHolds={[ACTIVE_HOLD]}
      />,
    );

    await user.click(screen.getByTestId(`legal-hold-lift-${HOLD_ID}`));

    await waitFor(() => {
      // AC-FILE-014-05: liftLegalHoldAction called with the hold ID.
      expect(mockLiftLegalHoldAction).toHaveBeenCalledWith(HOLD_ID, ENGAGEMENT_ID);
    });
  });

  it("[AC-FILE-014-05] After lifting, success message is shown", async () => {
    const user = userEvent.setup();

    render(
      <RetentionPanel
        engagementId={ENGAGEMENT_ID}
        eligibility={NOT_ELIGIBLE_HELD}
        activeHolds={[ACTIVE_HOLD]}
      />,
    );

    await user.click(screen.getByTestId(`legal-hold-lift-${HOLD_ID}`));

    await waitFor(() => {
      const holdResult = screen.getByTestId("hold-result");
      expect(holdResult.textContent).toMatch(/lifted/i);
    });
  });

  it("[AC-FILE-014-05] No active holds shows empty state", () => {
    render(
      <RetentionPanel
        engagementId={ENGAGEMENT_ID}
        eligibility={ELIGIBLE}
        activeHolds={[]}
      />,
    );

    // No active holds list shown; no hold items.
    expect(screen.queryByTestId("active-holds-list")).not.toBeInTheDocument();
    expect(screen.queryByTestId(`active-hold-item-${HOLD_ID}`)).not.toBeInTheDocument();
  });
});

// ─── Tests: retention panel renders in all eligibility states ─────────────────

describe("RetentionPanel renders correctly in all eligibility states", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the panel container with data-testid='retention-panel'", () => {
    render(
      <RetentionPanel
        engagementId={ENGAGEMENT_ID}
        eligibility={ELIGIBLE}
        activeHolds={[]}
      />,
    );

    expect(screen.getByTestId("retention-panel")).toBeInTheDocument();
  });

  it("Place Legal Hold button is present regardless of eligibility state", () => {
    // The hold button is available even when not eligible (to allow placing a hold on in-window engagements).
    render(
      <RetentionPanel
        engagementId={ENGAGEMENT_ID}
        eligibility={NOT_ELIGIBLE_IN_WINDOW}
        activeHolds={[]}
      />,
    );

    expect(screen.getByTestId("legal-hold-place")).toBeInTheDocument();
  });
});
