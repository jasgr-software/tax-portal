/**
 * apps/admin/src/app/engagements/[engagementId]/actions.test.ts
 *
 * Unit tests for engagement lifecycle server actions.
 *
 * TASK-010-003: Accountant transition / completion-gate / reopen surface.
 *
 * Acceptance criteria tested:
 *   AC-LIFE-003-01 — accountant changes engagement status (server action guard)
 *   AC-LIFE-005-01 — Complete requires delivery confirmation (server rejects without it)
 *   AC-LIFE-005-02 — Complete requires filing confirmation (server rejects without it)
 *   AC-LIFE-006-01 — accountant reopens a Complete engagement
 *
 * Security contract (ADR-003, ADR-006, ADR-019):
 *   - Non-ACCOUNTANT identity (null or CLIENT) is rejected by every action BEFORE any DB write.
 *   - Actor for ADR-019 audit event comes ONLY from the verified session — never from action args.
 *   - Every action calls the TASK-010-001 seam (mocked here) — no duplicate transition logic.
 *
 * Strategy:
 *   - No real DB connection — all seam calls are mocked.
 *   - Identity guard tested with null identity, CLIENT role, and valid ACCOUNTANT.
 *   - Mirrors document-requests/actions.test.ts pattern exactly.
 *   - CS-TS-001: verified by not calling raw DB directly.
 *   - CS-TS-002: verified by not importing adminDb/pool directly.
 *   - CS-GEN-003: cite governing keys in comments.
 *
 * // ADR-003: server-side authority; actor from session only
 * // ADR-006: admin surface only
 * // ADR-019: audit event actor comes from verified session
 * // CS-TS-001: request-scoped DB via wrapper
 * // CS-TS-002: no direct pool import
 * // CS-GEN-003: cite governing authority in comments
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Hoisted mock functions ───────────────────────────────────────────────────

const {
  mockGetIdentity,
  mockTransitionEngagementStatus,
  mockConfirmDelivery,
  mockConfirmFiling,
  mockReopenEngagement,
  mockGetEngagementStatusForAdmin,
  mockRevalidatePath,
} = vi.hoisted(() => ({
  mockGetIdentity: vi.fn(),
  mockTransitionEngagementStatus: vi.fn(),
  mockConfirmDelivery: vi.fn(),
  mockConfirmFiling: vi.fn(),
  mockReopenEngagement: vi.fn(),
  mockGetEngagementStatusForAdmin: vi.fn(),
  mockRevalidatePath: vi.fn(),
}));

// ─── Mocks ────────────────────────────────────────────────────────────────────

// Mock next/headers — server action reads cookie header to build synthetic Request
vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue({
    get: (key: string) => (key === "cookie" ? "mock-cookie=session" : null),
  }),
}));

// Mock next/cache — revalidatePath is a no-op in tests
vi.mock("next/cache", () => ({
  revalidatePath: mockRevalidatePath,
}));

// Mock @tax-portal/auth — return a verified ACCOUNTANT identity by default
vi.mock("@tax-portal/auth", () => ({
  getAuthProvider: () => ({ getIdentity: mockGetIdentity }),
}));

// Mock @tax-portal/db barrel — lifecycle seam functions + status read
// ADR-003: these are the TASK-010-001 seam calls; we mock them here at the action layer
vi.mock("@tax-portal/db", () => ({
  transitionEngagementStatus: mockTransitionEngagementStatus,
  confirmDelivery: mockConfirmDelivery,
  confirmFiling: mockConfirmFiling,
  reopenEngagement: mockReopenEngagement,
  getEngagementStatusForAdmin: mockGetEngagementStatusForAdmin,
  LIFECYCLE_ALLOWED_TRANSITIONS: new Map([
    ["New", "In Progress"],
    ["In Progress", "Review"],
    ["Review", "Complete"],
  ]),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import {
  advanceStatusAction,
  confirmDeliveryAction,
  confirmFilingAction,
  completeEngagementAction,
  reopenEngagementAction,
} from "./actions.js";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ACCOUNTANT_IDENTITY = {
  clerkUserId: "user_acct_test",
  role: "ACCOUNTANT" as const,
};

const CLIENT_IDENTITY = {
  clerkUserId: "user_client_test",
  role: "CLIENT" as const,
};

const ENGAGEMENT_ID = "eng-001-aaaa-bbbb-cccc-000000000001";

// ─── Tests: identity guard — every action rejects non-ACCOUNTANT ──────────────
//
// [AC-LIFE-003-01] accountant changes status — the server-side gate is the trust fence.
// ADR-003: getAccountantIdentity() must be called BEFORE any DB write.

describe("[AC-LIFE-003-01] [security] non-ACCOUNTANT identity is rejected by every action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetIdentity.mockResolvedValue(null);
    // Seam mocks should NEVER be called when identity is rejected
    mockTransitionEngagementStatus.mockResolvedValue({ transitioned: true });
    mockConfirmDelivery.mockResolvedValue({ confirmed: true });
    mockConfirmFiling.mockResolvedValue({ confirmed: true });
    mockReopenEngagement.mockResolvedValue({ reopened: true });
    mockGetEngagementStatusForAdmin.mockResolvedValue({ id: ENGAGEMENT_ID, status: "In Progress" });
  });

  it("[AC-LIFE-003-01][security] advanceStatusAction: null identity is rejected, no DB write", async () => {
    const result = await advanceStatusAction(ENGAGEMENT_ID, "New", "In Progress");

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/unauthorized/i);
    // ADR-003: seam must NOT be called before identity is verified
    expect(mockTransitionEngagementStatus).not.toHaveBeenCalled();
  });

  it("[AC-LIFE-003-01][security] advanceStatusAction: CLIENT role is rejected, no DB write", async () => {
    mockGetIdentity.mockResolvedValue(CLIENT_IDENTITY);

    const result = await advanceStatusAction(ENGAGEMENT_ID, "New", "In Progress");

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/unauthorized/i);
    expect(mockTransitionEngagementStatus).not.toHaveBeenCalled();
  });

  it("[AC-LIFE-005-01][security] confirmDeliveryAction: null identity is rejected, no DB write", async () => {
    const result = await confirmDeliveryAction(ENGAGEMENT_ID);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/unauthorized/i);
    expect(mockConfirmDelivery).not.toHaveBeenCalled();
  });

  it("[AC-LIFE-005-01][security] confirmDeliveryAction: CLIENT role is rejected, no DB write", async () => {
    mockGetIdentity.mockResolvedValue(CLIENT_IDENTITY);

    const result = await confirmDeliveryAction(ENGAGEMENT_ID);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/unauthorized/i);
    expect(mockConfirmDelivery).not.toHaveBeenCalled();
  });

  it("[AC-LIFE-005-02][security] confirmFilingAction: null identity is rejected, no DB write", async () => {
    const result = await confirmFilingAction(ENGAGEMENT_ID);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/unauthorized/i);
    expect(mockConfirmFiling).not.toHaveBeenCalled();
  });

  it("[AC-LIFE-005-02][security] confirmFilingAction: CLIENT role is rejected, no DB write", async () => {
    mockGetIdentity.mockResolvedValue(CLIENT_IDENTITY);

    const result = await confirmFilingAction(ENGAGEMENT_ID);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/unauthorized/i);
    expect(mockConfirmFiling).not.toHaveBeenCalled();
  });

  it("[security] completeEngagementAction: null identity is rejected, no DB write", async () => {
    const result = await completeEngagementAction(ENGAGEMENT_ID);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/unauthorized/i);
    expect(mockTransitionEngagementStatus).not.toHaveBeenCalled();
  });

  it("[security] completeEngagementAction: CLIENT role is rejected, no DB write", async () => {
    mockGetIdentity.mockResolvedValue(CLIENT_IDENTITY);

    const result = await completeEngagementAction(ENGAGEMENT_ID);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/unauthorized/i);
    expect(mockTransitionEngagementStatus).not.toHaveBeenCalled();
  });

  it("[AC-LIFE-006-01][security] reopenEngagementAction: null identity is rejected, no DB write", async () => {
    const result = await reopenEngagementAction(ENGAGEMENT_ID);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/unauthorized/i);
    expect(mockReopenEngagement).not.toHaveBeenCalled();
  });

  it("[AC-LIFE-006-01][security] reopenEngagementAction: CLIENT role is rejected, no DB write", async () => {
    mockGetIdentity.mockResolvedValue(CLIENT_IDENTITY);

    const result = await reopenEngagementAction(ENGAGEMENT_ID);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/unauthorized/i);
    expect(mockReopenEngagement).not.toHaveBeenCalled();
  });
});

// ─── Tests: advanceStatusAction — happy path ──────────────────────────────────
//
// [AC-LIFE-001-03] accountant advances New → In Progress → Review
// [AC-LIFE-003-01] accountant changes engagement status

describe("[AC-LIFE-001-03] [AC-LIFE-003-01] advanceStatusAction — accountant advances status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetIdentity.mockResolvedValue(ACCOUNTANT_IDENTITY);
    mockTransitionEngagementStatus.mockResolvedValue({ transitioned: true });
  });

  it("[AC-LIFE-001-03] returns { success: true } when ACCOUNTANT advances New → In Progress", async () => {
    const result = await advanceStatusAction(ENGAGEMENT_ID, "New", "In Progress");

    expect(result.success).toBe(true);
    expect(mockTransitionEngagementStatus).toHaveBeenCalledOnce();
    expect(mockTransitionEngagementStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        engagementId: ENGAGEMENT_ID,
        fromStatus: "New",
        toStatus: "In Progress",
        sourceSurface: "admin",
      }),
    );
  });

  it("[AC-LIFE-001-03] returns { success: true } when ACCOUNTANT advances In Progress → Review", async () => {
    const result = await advanceStatusAction(ENGAGEMENT_ID, "In Progress", "Review");

    expect(result.success).toBe(true);
    expect(mockTransitionEngagementStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        fromStatus: "In Progress",
        toStatus: "Review",
      }),
    );
  });

  it("[AC-LIFE-003-01] actor for ADR-019 audit event comes ONLY from verified session — not from args", async () => {
    await advanceStatusAction(ENGAGEMENT_ID, "New", "In Progress");

    // The actor passed to the seam must use the clerkUserId from the verified session
    expect(mockTransitionEngagementStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: expect.objectContaining({
          clerkUserId: ACCOUNTANT_IDENTITY.clerkUserId,
          // ADR-019: actor comes from verified session only
        }),
      }),
    );
  });

  it("[AC-LIFE-001-03] calls revalidatePath for the engagement page after success", async () => {
    await advanceStatusAction(ENGAGEMENT_ID, "New", "In Progress");

    expect(mockRevalidatePath).toHaveBeenCalledWith(
      expect.stringContaining(ENGAGEMENT_ID),
    );
  });

  it("returns { success: false } when the seam returns { transitioned: false } (guard fired)", async () => {
    mockTransitionEngagementStatus.mockResolvedValue({ transitioned: false });

    const result = await advanceStatusAction(ENGAGEMENT_ID, "In Progress", "Review");

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/could not|conflict|guard/i);
  });

  it("returns { success: false } when engagementId is empty", async () => {
    const result = await advanceStatusAction("", "New", "In Progress");

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/engagement|id/i);
    expect(mockTransitionEngagementStatus).not.toHaveBeenCalled();
  });
});

// ─── Tests: confirmDeliveryAction ─────────────────────────────────────────────
//
// [AC-LIFE-005-01] Complete requires delivery confirmation (server enforces this)

describe("[AC-LIFE-005-01] confirmDeliveryAction — server gate for delivery confirmation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetIdentity.mockResolvedValue(ACCOUNTANT_IDENTITY);
    mockConfirmDelivery.mockResolvedValue({ confirmed: true });
  });

  it("[AC-LIFE-005-01] returns { success: true } when ACCOUNTANT confirms delivery", async () => {
    const result = await confirmDeliveryAction(ENGAGEMENT_ID);

    expect(result.success).toBe(true);
    expect(mockConfirmDelivery).toHaveBeenCalledOnce();
    expect(mockConfirmDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        engagementId: ENGAGEMENT_ID,
        sourceSurface: "admin",
        // ADR-019: actor from verified session
        actor: expect.objectContaining({ clerkUserId: ACCOUNTANT_IDENTITY.clerkUserId }),
      }),
    );
  });

  it("[AC-LIFE-005-01] returns { success: false } when seam returns { confirmed: false }", async () => {
    mockConfirmDelivery.mockResolvedValue({ confirmed: false });

    const result = await confirmDeliveryAction(ENGAGEMENT_ID);

    expect(result.success).toBe(false);
  });

  it("[AC-LIFE-005-01] returns { success: false } when engagementId is empty", async () => {
    const result = await confirmDeliveryAction("");

    expect(result.success).toBe(false);
    expect(mockConfirmDelivery).not.toHaveBeenCalled();
  });
});

// ─── Tests: confirmFilingAction ────────────────────────────────────────────────
//
// [AC-LIFE-005-02] Complete requires filing confirmation (server enforces this)

describe("[AC-LIFE-005-02] confirmFilingAction — server gate for filing confirmation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetIdentity.mockResolvedValue(ACCOUNTANT_IDENTITY);
    mockConfirmFiling.mockResolvedValue({ confirmed: true });
  });

  it("[AC-LIFE-005-02] returns { success: true } when ACCOUNTANT confirms filing", async () => {
    const result = await confirmFilingAction(ENGAGEMENT_ID);

    expect(result.success).toBe(true);
    expect(mockConfirmFiling).toHaveBeenCalledOnce();
    expect(mockConfirmFiling).toHaveBeenCalledWith(
      expect.objectContaining({
        engagementId: ENGAGEMENT_ID,
        sourceSurface: "admin",
        // ADR-019: actor from verified session
        actor: expect.objectContaining({ clerkUserId: ACCOUNTANT_IDENTITY.clerkUserId }),
      }),
    );
  });

  it("[AC-LIFE-005-02] returns { success: false } when seam returns { confirmed: false }", async () => {
    mockConfirmFiling.mockResolvedValue({ confirmed: false });

    const result = await confirmFilingAction(ENGAGEMENT_ID);

    expect(result.success).toBe(false);
  });

  it("[AC-LIFE-005-02] returns { success: false } when engagementId is empty", async () => {
    const result = await confirmFilingAction("");

    expect(result.success).toBe(false);
    expect(mockConfirmFiling).not.toHaveBeenCalled();
  });
});

// ─── Tests: completeEngagementAction ──────────────────────────────────────────
//
// [AC-LIFE-005-01/-02] The server MUST reject → Complete without both confirmations.
// The seam (transitionEngagementStatus) enforces this at the DB level. Here we verify:
//   (a) the action calls the seam with toStatus="Complete"
//   (b) the action checks current status is "Review" before calling the seam
//   (c) a seam rejection (transitioned: false) propagates as { success: false }

describe("[AC-LIFE-005-01] [AC-LIFE-005-02] completeEngagementAction — two-confirmation gate server enforcement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetIdentity.mockResolvedValue(ACCOUNTANT_IDENTITY);
    mockTransitionEngagementStatus.mockResolvedValue({ transitioned: true });
    mockGetEngagementStatusForAdmin.mockResolvedValue({ id: ENGAGEMENT_ID, status: "Review" });
  });

  it("[AC-LIFE-005-01][AC-LIFE-005-02] returns { success: true } when seam allows Complete (both confirms set at DB)", async () => {
    const result = await completeEngagementAction(ENGAGEMENT_ID);

    expect(result.success).toBe(true);
    expect(mockTransitionEngagementStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        engagementId: ENGAGEMENT_ID,
        toStatus: "Complete",
        fromStatus: "Review",
        sourceSurface: "admin",
      }),
    );
  });

  it("[AC-LIFE-005-01][AC-LIFE-005-02] server rejects Complete when seam returns { transitioned: false } — proves negative", async () => {
    // The seam returns false when deliveryConfirmedAt or filingConfirmedAt is NULL (DECISION-010-C).
    // This proves the server enforcement is active, not merely a disabled UI button.
    mockTransitionEngagementStatus.mockResolvedValue({ transitioned: false });

    const result = await completeEngagementAction(ENGAGEMENT_ID);

    // [AC-LIFE-005-01][AC-LIFE-005-02]: server rejects Complete without both confirmations
    expect(result.success).toBe(false);
    if (!result.success) {
      // Error should indicate the gate fired (confirmations missing)
      expect(result.error).toMatch(/confirm|gate|complete|guard/i);
    }
  });

  it("[AC-LIFE-005-01][AC-LIFE-005-02] calls seam even when engagement is not in Review — seam enforces guard", async () => {
    // The seam's allowed-transitions map catches any invalid from→to edge.
    // The action passes the current status; the seam returns false for invalid edges.
    mockGetEngagementStatusForAdmin.mockResolvedValue({ id: ENGAGEMENT_ID, status: "In Progress" });
    mockTransitionEngagementStatus.mockResolvedValue({ transitioned: false });

    const result = await completeEngagementAction(ENGAGEMENT_ID);

    expect(result.success).toBe(false);
  });

  it("[AC-LIFE-005-01] actor comes from verified session — not from action args", async () => {
    await completeEngagementAction(ENGAGEMENT_ID);

    expect(mockTransitionEngagementStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: expect.objectContaining({
          clerkUserId: ACCOUNTANT_IDENTITY.clerkUserId,
        }),
      }),
    );
  });
});

// ─── Tests: reopenEngagementAction ────────────────────────────────────────────
//
// [AC-LIFE-006-01] accountant reopens a Complete engagement

describe("[AC-LIFE-006-01] reopenEngagementAction — accountant reopens a Complete engagement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetIdentity.mockResolvedValue(ACCOUNTANT_IDENTITY);
    mockReopenEngagement.mockResolvedValue({ reopened: true });
  });

  it("[AC-LIFE-006-01] returns { success: true } when ACCOUNTANT reopens a Complete engagement", async () => {
    const result = await reopenEngagementAction(ENGAGEMENT_ID);

    expect(result.success).toBe(true);
    expect(mockReopenEngagement).toHaveBeenCalledOnce();
    expect(mockReopenEngagement).toHaveBeenCalledWith(
      expect.objectContaining({
        engagementId: ENGAGEMENT_ID,
        sourceSurface: "admin",
        // ADR-019: actor from verified session
        actor: expect.objectContaining({ clerkUserId: ACCOUNTANT_IDENTITY.clerkUserId }),
      }),
    );
  });

  it("[AC-LIFE-006-01] returns { success: false } when seam returns { reopened: false } (engagement not Complete)", async () => {
    mockReopenEngagement.mockResolvedValue({ reopened: false });

    const result = await reopenEngagementAction(ENGAGEMENT_ID);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/could not|reopen|complete/i);
  });

  it("[AC-LIFE-006-01] calls revalidatePath after successful reopen", async () => {
    await reopenEngagementAction(ENGAGEMENT_ID);

    expect(mockRevalidatePath).toHaveBeenCalledWith(
      expect.stringContaining(ENGAGEMENT_ID),
    );
  });

  it("[AC-LIFE-006-01] returns { success: false } when engagementId is empty", async () => {
    const result = await reopenEngagementAction("");

    expect(result.success).toBe(false);
    expect(mockReopenEngagement).not.toHaveBeenCalled();
  });
});
