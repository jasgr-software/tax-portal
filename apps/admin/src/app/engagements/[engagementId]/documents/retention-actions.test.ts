/**
 * apps/admin/src/app/engagements/[engagementId]/documents/retention-actions.test.ts
 *
 * Unit tests for purge-confirm + legal-hold server actions.
 * TASK-015-003 / BRIEF-015 / EPIC-015 — post-retention destructive lifecycle.
 *
 * Acceptance criteria tested:
 *   AC-FILE-013-02 — Purge is accountant/admin-only; non-ACCOUNTANT is rejected.
 *   AC-FILE-013-03 — Explicit confirmation is required; no purge without it.
 *   AC-FILE-014-01 — placeLegalHoldAction places a hold on the engagement.
 *   AC-FILE-014-05 — liftLegalHoldAction lifts the hold.
 *
 * Security contract (ADR-003, ADR-006, ADR-019, CS-TS-004):
 *   - Non-ACCOUNTANT identity (null or CLIENT) is rejected by every action BEFORE any DB write.
 *   - Actor for ADR-019 audit event comes ONLY from the verified session.
 *   - purgeEngagementAction passes confirmed: true ONLY with an explicit confirmation.
 *   - Without confirmation, no purge is issued (outcome = 'not-confirmed').
 *
 * Strategy:
 *   - No real DB connection — all seam calls are mocked.
 *   - Identity guard tested with null identity, CLIENT role, and valid ACCOUNTANT.
 *   - Mirrors the established pattern from actions.test.ts (TASK-013-003 / TASK-014-003).
 *   - CS-TS-001: verified by not calling raw DB directly.
 *   - CS-TS-002: verified by not importing adminDb/pool directly.
 *   - CS-TS-004: identity from session cookie — verified by mock structure.
 *   - CS-GEN-001: verified by not logging PII (no engagement ID in audit call params).
 *   - CS-GEN-003: cite governing keys in comments.
 *
 * // ADR-003: server-side authority; actor from session only
 * // ADR-006: admin surface only
 * // ADR-018 §5/§6: confirmed purge + legal hold
 * // ADR-019: audit actor from verified session
 * // CS-TS-001: request-scoped DB via wrapper
 * // CS-TS-002: no direct pool import
 * // CS-TS-004: identity from session cookie only
 * // CS-GEN-001: no PII in logs
 * // CS-GEN-003: cite governing authority in comments
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Hoisted mock functions ───────────────────────────────────────────────────

const {
  mockGetIdentity,
  mockPurgeEngagement,
  mockPlaceLegalHold,
  mockLiftLegalHold,
  mockActiveHoldsFor,
  mockPurgeEligibility,
  mockRevalidatePath,
} = vi.hoisted(() => ({
  mockGetIdentity: vi.fn(),
  mockPurgeEngagement: vi.fn(),
  mockPlaceLegalHold: vi.fn(),
  mockLiftLegalHold: vi.fn(),
  mockActiveHoldsFor: vi.fn(),
  mockPurgeEligibility: vi.fn(),
  mockRevalidatePath: vi.fn(),
}));

// ─── Mocks ────────────────────────────────────────────────────────────────────

// Mock next/headers — server action reads cookie header to build synthetic Request
vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue({
    get: (key: string) => {
      if (key === "cookie") return "mock-cookie=session";
      return null;
    },
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

// Mock @tax-portal/db barrel
vi.mock("@tax-portal/db", () => ({
  purgeEngagement: mockPurgeEngagement,
  placeLegalHold: mockPlaceLegalHold,
  liftLegalHold: mockLiftLegalHold,
  activeHoldsFor: mockActiveHoldsFor,
  purgeEligibility: mockPurgeEligibility,
  retentionDeadlineFor: vi.fn(),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import {
  purgeEngagementAction,
  placeLegalHoldAction,
  liftLegalHoldAction,
  getPurgeEligibilityAction,
} from "./retention-actions.js";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ACCOUNTANT_IDENTITY = {
  clerkUserId: "user_acct_test_015",
  role: "ACCOUNTANT" as const,
};

const CLIENT_IDENTITY = {
  clerkUserId: "user_client_test_015",
  role: "CLIENT" as const,
};

const ENGAGEMENT_ID = "eng-015-aaaa-bbbb-cccc-000000000001";
const HOLD_ID = "hold-015-aaaa-bbbb-cccc-000000000001";

// ─── Tests: identity guard — every action rejects non-ACCOUNTANT ──────────────
//
// AC-FILE-013-02: Purge is accountant/admin-only; no client-facing path.
// ADR-003: getAccountantIdentity() must be called BEFORE any DB write.
// CS-TS-004: identity from session cookie only — never from args or form data.

describe("[AC-FILE-013-02] [AC-FILE-014-01] [AC-FILE-014-05] [security] non-ACCOUNTANT identity is rejected by every action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetIdentity.mockResolvedValue(null);
    // Seam mocks should NEVER be called when identity is rejected
    mockPurgeEngagement.mockResolvedValue({ outcome: "purged" });
    mockPlaceLegalHold.mockResolvedValue({ outcome: "placed", holdId: HOLD_ID });
    mockLiftLegalHold.mockResolvedValue({ outcome: "lifted" });
    mockActiveHoldsFor.mockResolvedValue([]);
    mockPurgeEligibility.mockReturnValue({ eligible: true, reason: "eligible" });
  });

  // purgeEngagementAction — identity guard (AC-FILE-013-02, CS-TS-004)
  it("[AC-FILE-013-02][security] purgeEngagementAction: null identity rejected, no DB write", async () => {
    // CS-TS-004: identity from verified session only — null means no valid session
    const result = await purgeEngagementAction(ENGAGEMENT_ID, true);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/unauthorized/i);
    // ADR-003: seam must NOT be called before identity is verified
    expect(mockPurgeEngagement).not.toHaveBeenCalled(); // AC-FILE-013-02
  });

  it("[AC-FILE-013-02][security] purgeEngagementAction: CLIENT role rejected, no DB write", async () => {
    // CS-TS-004: only ACCOUNTANT role is allowed
    mockGetIdentity.mockResolvedValue(CLIENT_IDENTITY);

    const result = await purgeEngagementAction(ENGAGEMENT_ID, true);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/unauthorized/i);
    // ADR-003: seam must NOT be called before identity is verified
    expect(mockPurgeEngagement).not.toHaveBeenCalled(); // AC-FILE-013-02
  });

  // placeLegalHoldAction — identity guard (AC-FILE-014-01, CS-TS-004)
  it("[AC-FILE-014-01][security] placeLegalHoldAction: null identity rejected, no DB write", async () => {
    const result = await placeLegalHoldAction(ENGAGEMENT_ID);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/unauthorized/i);
    // ADR-003: seam must NOT be called before identity is verified
    expect(mockPlaceLegalHold).not.toHaveBeenCalled();
  });

  it("[AC-FILE-014-01][security] placeLegalHoldAction: CLIENT role rejected, no DB write", async () => {
    mockGetIdentity.mockResolvedValue(CLIENT_IDENTITY);

    const result = await placeLegalHoldAction(ENGAGEMENT_ID);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/unauthorized/i);
    expect(mockPlaceLegalHold).not.toHaveBeenCalled();
  });

  // liftLegalHoldAction — identity guard (AC-FILE-014-05, CS-TS-004)
  it("[AC-FILE-014-05][security] liftLegalHoldAction: null identity rejected, no DB write", async () => {
    const result = await liftLegalHoldAction(HOLD_ID, ENGAGEMENT_ID);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/unauthorized/i);
    // ADR-003: seam must NOT be called before identity is verified
    expect(mockLiftLegalHold).not.toHaveBeenCalled();
  });

  it("[AC-FILE-014-05][security] liftLegalHoldAction: CLIENT role rejected, no DB write", async () => {
    mockGetIdentity.mockResolvedValue(CLIENT_IDENTITY);

    const result = await liftLegalHoldAction(HOLD_ID, ENGAGEMENT_ID);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/unauthorized/i);
    expect(mockLiftLegalHold).not.toHaveBeenCalled();
  });

  // getPurgeEligibilityAction — identity guard
  it("[security] getPurgeEligibilityAction: null identity rejected, no DB read", async () => {
    const result = await getPurgeEligibilityAction(ENGAGEMENT_ID, null);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/unauthorized/i);
    expect(mockActiveHoldsFor).not.toHaveBeenCalled();
  });
});

// ─── Tests: AC-FILE-013-03 — explicit confirmation required for purge ──────────
//
// AC-FILE-013-03: No data is permanently removed until the accountant explicitly confirms.
// ADR-018 §5: NEVER-AUTOMATIC — confirmation must be explicitly set.

describe("[AC-FILE-013-03] purgeEngagementAction: explicit confirmation is required", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetIdentity.mockResolvedValue(ACCOUNTANT_IDENTITY);
    mockPurgeEngagement.mockResolvedValue({ outcome: "purged" });
    mockRevalidatePath.mockReturnValue(undefined);
  });

  it("[AC-FILE-013-03] WITHOUT confirmation (false): no purge, returns not-confirmed", async () => {
    // AC-FILE-013-03: confirmation=false → no purge; no DB write at all.
    // ADR-018 §5 / NEVER-AUTOMATIC: no destruction without explicit confirmed: true.
    const result = await purgeEngagementAction(ENGAGEMENT_ID, false);

    // The action returns success: true with outcome 'not-confirmed' — no data removed.
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.outcome).toBe("not-confirmed"); // AC-FILE-013-03
    }
    // CRITICAL: purgeEngagement must NOT be called when confirmation is missing.
    // ADR-018 §5: no DB write without confirmed: true.
    expect(mockPurgeEngagement).not.toHaveBeenCalled(); // AC-FILE-013-03
  });

  it("[AC-FILE-013-03] WITH confirmation (true): purge is called with confirmed: true", async () => {
    // AC-FILE-013-03: confirmation=true → passes confirmed: true to purgeEngagement.
    mockPurgeEngagement.mockResolvedValue({ outcome: "purged" });

    const result = await purgeEngagementAction(ENGAGEMENT_ID, true);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.outcome).toBe("purged"); // AC-FILE-013-03
    }
    // Verify the seam was called with confirmed: true (not false).
    // AC-FILE-013-03 / ADR-018 §5: only passes confirmed: true when explicit.
    expect(mockPurgeEngagement).toHaveBeenCalledWith(
      expect.objectContaining({
        engagementId: ENGAGEMENT_ID,
        confirmed: true, // AC-FILE-013-03: explicit confirmed: true
      }),
    );
  });

  it("[AC-FILE-013-03] Actor comes from verified session, NEVER from args (ADR-003, CS-TS-004)", async () => {
    // ADR-019: actor must come from the verified session (CS-TS-004).
    // This test verifies the actor clerkUserId matches the session identity.
    mockPurgeEngagement.mockResolvedValue({ outcome: "purged" });

    await purgeEngagementAction(ENGAGEMENT_ID, true);

    // ADR-003: actor.clerkUserId must come from the session, not from action args.
    // CS-TS-004: identity from session cookie only.
    expect(mockPurgeEngagement).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: expect.objectContaining({
          clerkUserId: ACCOUNTANT_IDENTITY.clerkUserId, // from verified session // CS-TS-004
          role: "ACCOUNTANT",
        }),
        confirmed: true, // AC-FILE-013-03
      }),
    );
  });

  it("[AC-FILE-013-03] On purge success, revalidatePath is called", async () => {
    // The page refreshes after a successful purge.
    mockPurgeEngagement.mockResolvedValue({ outcome: "purged" });

    await purgeEngagementAction(ENGAGEMENT_ID, true);

    expect(mockRevalidatePath).toHaveBeenCalledWith(
      `/engagements/${ENGAGEMENT_ID}/documents`,
    );
  });
});

// ─── Tests: AC-FILE-014-01 — placeLegalHoldAction ────────────────────────────

describe("[AC-FILE-014-01] placeLegalHoldAction: place a hold on an engagement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetIdentity.mockResolvedValue(ACCOUNTANT_IDENTITY);
    mockPlaceLegalHold.mockResolvedValue({ outcome: "placed", holdId: HOLD_ID });
    mockRevalidatePath.mockReturnValue(undefined);
  });

  it("[AC-FILE-014-01] ACCOUNTANT can place a hold; seam called with scope='engagement'", async () => {
    // AC-FILE-014-01: accountant places engagement-scoped hold.
    const result = await placeLegalHoldAction(ENGAGEMENT_ID);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.outcome).toBe("placed"); // AC-FILE-014-01
    }
    // Verify the seam was called with the correct scope.
    expect(mockPlaceLegalHold).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: "engagement", // AC-FILE-014-01
        engagementId: ENGAGEMENT_ID,
        actor: expect.objectContaining({
          clerkUserId: ACCOUNTANT_IDENTITY.clerkUserId, // CS-TS-004
          role: "ACCOUNTANT",
        }),
      }),
    );
  });

  it("[AC-FILE-014-01] Actor comes from verified session (ADR-019, CS-TS-004)", async () => {
    // ADR-019: actor from verified session only.
    await placeLegalHoldAction(ENGAGEMENT_ID);

    expect(mockPlaceLegalHold).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: expect.objectContaining({
          clerkUserId: ACCOUNTANT_IDENTITY.clerkUserId, // CS-TS-004: from verified session
        }),
      }),
    );
  });

  it("[AC-FILE-014-01] On success, revalidatePath is called", async () => {
    await placeLegalHoldAction(ENGAGEMENT_ID);

    expect(mockRevalidatePath).toHaveBeenCalledWith(
      `/engagements/${ENGAGEMENT_ID}/documents`,
    );
  });

  it("[AC-FILE-014-01] 'already-held' outcome is surfaced (idempotent)", async () => {
    mockPlaceLegalHold.mockResolvedValue({ outcome: "already-held", holdId: HOLD_ID });

    const result = await placeLegalHoldAction(ENGAGEMENT_ID);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.outcome).toBe("already-held");
    }
  });
});

// ─── Tests: AC-FILE-014-05 — liftLegalHoldAction ─────────────────────────────

describe("[AC-FILE-014-05] liftLegalHoldAction: lift a hold on an engagement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetIdentity.mockResolvedValue(ACCOUNTANT_IDENTITY);
    mockLiftLegalHold.mockResolvedValue({ outcome: "lifted" });
    mockRevalidatePath.mockReturnValue(undefined);
  });

  it("[AC-FILE-014-05] ACCOUNTANT can lift a hold; seam called with holdId", async () => {
    // AC-FILE-014-05: accountant lifts the hold; eligibility restored iff window elapsed.
    const result = await liftLegalHoldAction(HOLD_ID, ENGAGEMENT_ID);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.outcome).toBe("lifted"); // AC-FILE-014-05
    }
    // Verify the seam was called with the holdId.
    expect(mockLiftLegalHold).toHaveBeenCalledWith(
      expect.objectContaining({
        holdId: HOLD_ID, // AC-FILE-014-05
        actor: expect.objectContaining({
          clerkUserId: ACCOUNTANT_IDENTITY.clerkUserId, // CS-TS-004
          role: "ACCOUNTANT",
        }),
      }),
    );
  });

  it("[AC-FILE-014-05] Actor comes from verified session (ADR-019, CS-TS-004)", async () => {
    // ADR-019: actor from verified session only — never from holdId arg.
    await liftLegalHoldAction(HOLD_ID, ENGAGEMENT_ID);

    expect(mockLiftLegalHold).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: expect.objectContaining({
          clerkUserId: ACCOUNTANT_IDENTITY.clerkUserId, // CS-TS-004: from verified session
        }),
      }),
    );
  });

  it("[AC-FILE-014-05] On success, revalidatePath is called", async () => {
    await liftLegalHoldAction(HOLD_ID, ENGAGEMENT_ID);

    expect(mockRevalidatePath).toHaveBeenCalledWith(
      `/engagements/${ENGAGEMENT_ID}/documents`,
    );
  });

  it("[AC-FILE-014-05] 'already-lifted' outcome is surfaced (idempotent)", async () => {
    mockLiftLegalHold.mockResolvedValue({ outcome: "already-lifted" });

    const result = await liftLegalHoldAction(HOLD_ID, ENGAGEMENT_ID);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.outcome).toBe("already-lifted");
    }
  });
});

// ─── Tests: input validation ──────────────────────────────────────────────────

describe("input validation — empty engagement/hold ID is rejected", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetIdentity.mockResolvedValue(ACCOUNTANT_IDENTITY);
  });

  it("purgeEngagementAction: empty engagementId is rejected", async () => {
    const result = await purgeEngagementAction("", true);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/valid engagement/i);
    expect(mockPurgeEngagement).not.toHaveBeenCalled();
  });

  it("placeLegalHoldAction: empty engagementId is rejected", async () => {
    const result = await placeLegalHoldAction("");

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/valid engagement/i);
    expect(mockPlaceLegalHold).not.toHaveBeenCalled();
  });

  it("liftLegalHoldAction: empty holdId is rejected", async () => {
    const result = await liftLegalHoldAction("", ENGAGEMENT_ID);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/valid hold/i);
    expect(mockLiftLegalHold).not.toHaveBeenCalled();
  });

  it("liftLegalHoldAction: empty engagementId is rejected", async () => {
    const result = await liftLegalHoldAction(HOLD_ID, "");

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/valid engagement/i);
    expect(mockLiftLegalHold).not.toHaveBeenCalled();
  });
});
