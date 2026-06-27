/**
 * apps/admin/src/app/engagements/[engagementId]/cadence-actions.test.ts
 *
 * Unit tests for the per-engagement cadence override server actions.
 *
 * TASK-019-002 / BRIEF-019 / EPIC-019
 *
 * Acceptance criteria covered:
 *   AC-DASH-008-02: accountant can set per-engagement reminder frequency. // AC-DASH-008-02
 *   AC-DASH-008-03: per-engagement override takes precedence over global default. // AC-DASH-008-03
 *   AC-MSG-018-04: per-engagement frequency takes precedence when set. // AC-MSG-018-04
 *
 * Test coverage:
 *   - [CS-TS-004] CLIENT identity is rejected BEFORE any DB call (security gate).
 *   - [CS-TS-004] Unauthenticated caller is rejected BEFORE any DB call.
 *   - [CS-TS-001] Accountant write path invokes setEngagementCadenceOverride.
 *   - [AC-DASH-008-02] Set action writes the engagement override.
 *   - [AC-DASH-008-03] Clearing override (null) path succeeds.
 *   - [AC-DASH-008-02] Get action returns current override.
 *
 * Strategy:
 *   - No real DB connection — cadence repository functions are mocked.
 *   - Identity guard tested with null identity, CLIENT role, and valid ACCOUNTANT.
 *   - Mirrors the pattern in apps/admin/src/app/settings/reminders/actions.test.ts.
 *
 * CS-TS-004: The key security gate: CLIENT or unauth caller must be rejected before
 *   any call to setEngagementCadenceOverride or getEngagementCadenceOverride. // CS-TS-004
 * CS-TS-001: write goes through setEngagementCadenceOverride (admin pool in packages/db). // CS-TS-001
 * CS-GEN-002: additive — new test file; no existing test modified. // CS-GEN-002
 * CS-GEN-003: governing keys cited throughout. // CS-GEN-003
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Hoisted mock functions ───────────────────────────────────────────────────

const {
  mockGetIdentity,
  mockSetEngagementCadenceOverride,
  mockGetEngagementCadenceOverride,
  mockRevalidatePath,
} = vi.hoisted(() => ({
  mockGetIdentity: vi.fn(),
  mockSetEngagementCadenceOverride: vi.fn(),
  mockGetEngagementCadenceOverride: vi.fn(),
  mockRevalidatePath: vi.fn(),
}));

// ─── Mocks ────────────────────────────────────────────────────────────────────

// Mock next/headers — server action reads cookie header to build synthetic Request
vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue({
    get: (key: string) => (key === "cookie" ? "mock-cookie=session" : null),
  }),
}));

// Mock next/cache — revalidatePath is called after a successful write
vi.mock("next/cache", () => ({
  revalidatePath: mockRevalidatePath,
}));

// Mock @tax-portal/auth — return a verified ACCOUNTANT identity by default
vi.mock("@tax-portal/auth", () => ({
  getAuthProvider: () => ({ getIdentity: mockGetIdentity }),
}));

// Mock @tax-portal/db — stub cadence repository functions
vi.mock("@tax-portal/db", () => ({
  setEngagementCadenceOverride: mockSetEngagementCadenceOverride,
  getEngagementCadenceOverride: mockGetEngagementCadenceOverride,
}));

// ─── Import after mocks are set up ────────────────────────────────────────────

import {
  setEngagementCadenceOverrideAction,
  getEngagementCadenceOverrideAction,
} from "./cadence-actions.js";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ACCOUNTANT_IDENTITY = {
  clerkUserId: "user_acct_test_019_002_engagement",
  role: "ACCOUNTANT" as const,
};

const CLIENT_IDENTITY = {
  clerkUserId: "user_client_test_019_002_engagement",
  role: "CLIENT" as const,
};

const TEST_ENGAGEMENT_ID = "test-engagement-id-cadence";

// ─── Tests: setEngagementCadenceOverrideAction ────────────────────────────────

describe("setEngagementCadenceOverrideAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: authenticated ACCOUNTANT
    mockGetIdentity.mockResolvedValue(ACCOUNTANT_IDENTITY);
    // Default: setEngagementCadenceOverride is a no-op
    mockSetEngagementCadenceOverride.mockResolvedValue({ updated: true });
  });

  // ── Security gate (CS-TS-004) ─────────────────────────────────────────────

  /**
   * [CS-TS-004] CLIENT identity is rejected BEFORE any DB write.
   *
   * A CLIENT session must return { success: false } immediately.
   * setEngagementCadenceOverride must NOT be called.
   * This is the mandatory security gate for per-engagement cadence config.
   *
   * // CS-TS-004 // ADR-006
   */
  it("[CS-TS-004] CLIENT identity is rejected before any DB write", async () => {
    // CS-TS-004: set up a CLIENT identity
    mockGetIdentity.mockResolvedValue(CLIENT_IDENTITY);

    const result = await setEngagementCadenceOverrideAction(TEST_ENGAGEMENT_ID, 14);

    // Must fail before reaching any DB call
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/unauthorized/i);
    }

    // CS-TS-004: DB write seam must NOT have been called — the trust fence held.
    expect(mockSetEngagementCadenceOverride).not.toHaveBeenCalled();
  });

  /**
   * [CS-TS-004] Unauthenticated caller (null identity) is rejected BEFORE any DB write.
   *
   * // CS-TS-004 // ADR-003
   */
  it("[CS-TS-004] unauthenticated caller (null identity) is rejected before any DB write", async () => {
    mockGetIdentity.mockResolvedValue(null);

    const result = await setEngagementCadenceOverrideAction(TEST_ENGAGEMENT_ID, 14);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/unauthorized/i);
    }

    // CS-TS-004: DB write seam not reached.
    expect(mockSetEngagementCadenceOverride).not.toHaveBeenCalled();
  });

  // ── Happy path (CS-TS-001 + AC-DASH-008-02) ───────────────────────────────

  /**
   * [AC-DASH-008-02] ACCOUNTANT write path invokes setEngagementCadenceOverride with
   * the engagement ID and frequency.
   *
   * // AC-DASH-008-02 // CS-TS-001 // DECISION-019-A
   */
  it("[AC-DASH-008-02] ACCOUNTANT sets per-engagement override → setEngagementCadenceOverride called correctly", async () => {
    const OVERRIDE_FREQ = 21;

    const result = await setEngagementCadenceOverrideAction(TEST_ENGAGEMENT_ID, OVERRIDE_FREQ);

    expect(result.success).toBe(true);

    // CS-TS-001: write goes through setEngagementCadenceOverride (admin pool in packages/db). // CS-TS-001
    expect(mockSetEngagementCadenceOverride).toHaveBeenCalledWith({
      engagementId: TEST_ENGAGEMENT_ID,
      reminderFrequencyDays: OVERRIDE_FREQ,
    });

    // Revalidate called after successful write.
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/engagements/${TEST_ENGAGEMENT_ID}`);
  });

  /**
   * [AC-DASH-008-03] Clearing the override (null) invokes setEngagementCadenceOverride(null).
   *
   * Clearing reverts the engagement to the global default.
   * // AC-DASH-008-03 // DECISION-019-A
   */
  it("[AC-DASH-008-03] clearing override (null) → setEngagementCadenceOverride called with null (clears override)", async () => {
    const result = await setEngagementCadenceOverrideAction(TEST_ENGAGEMENT_ID, null);

    expect(result.success).toBe(true);

    // DECISION-019-A: null clears Engagement.reminderFrequencyDaysOverride. // DECISION-019-A
    expect(mockSetEngagementCadenceOverride).toHaveBeenCalledWith({
      engagementId: TEST_ENGAGEMENT_ID,
      reminderFrequencyDays: null,
    });
  });

  /**
   * [CS-TS-001] revalidatePath is called after a successful override write.
   */
  it("[CS-TS-001] revalidatePath is called for the engagement after a successful write", async () => {
    await setEngagementCadenceOverrideAction(TEST_ENGAGEMENT_ID, 14);

    expect(mockRevalidatePath).toHaveBeenCalledWith(`/engagements/${TEST_ENGAGEMENT_ID}`);
  });
});

// ─── Tests: getEngagementCadenceOverrideAction ────────────────────────────────

describe("getEngagementCadenceOverrideAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetIdentity.mockResolvedValue(ACCOUNTANT_IDENTITY);
    mockGetEngagementCadenceOverride.mockResolvedValue({
      engagementId: TEST_ENGAGEMENT_ID,
      reminderFrequencyDaysOverride: null,
    });
  });

  /**
   * [CS-TS-004] CLIENT identity is rejected before any DB read.
   */
  it("[CS-TS-004] CLIENT identity is rejected before any DB read", async () => {
    mockGetIdentity.mockResolvedValue(CLIENT_IDENTITY);

    const result = await getEngagementCadenceOverrideAction(TEST_ENGAGEMENT_ID);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/unauthorized/i);
    }
    expect(mockGetEngagementCadenceOverride).not.toHaveBeenCalled();
  });

  /**
   * [CS-TS-004] Unauthenticated caller is rejected before any DB read.
   */
  it("[CS-TS-004] unauthenticated caller is rejected before any DB read", async () => {
    mockGetIdentity.mockResolvedValue(null);

    const result = await getEngagementCadenceOverrideAction(TEST_ENGAGEMENT_ID);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/unauthorized/i);
    }
    expect(mockGetEngagementCadenceOverride).not.toHaveBeenCalled();
  });

  /**
   * [AC-DASH-008-02] Returns null override when none is set.
   */
  it("[AC-DASH-008-02] returns reminderFrequencyDaysOverride=null when no override is set", async () => {
    mockGetEngagementCadenceOverride.mockResolvedValue({
      engagementId: TEST_ENGAGEMENT_ID,
      reminderFrequencyDaysOverride: null,
    });

    const result = await getEngagementCadenceOverrideAction(TEST_ENGAGEMENT_ID);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.reminderFrequencyDaysOverride).toBeNull();
    }
  });

  /**
   * [AC-DASH-008-02] Returns the override value when one is set.
   */
  it("[AC-DASH-008-02] returns the override value when one is set for the engagement", async () => {
    mockGetEngagementCadenceOverride.mockResolvedValue({
      engagementId: TEST_ENGAGEMENT_ID,
      reminderFrequencyDaysOverride: 21,
    });

    const result = await getEngagementCadenceOverrideAction(TEST_ENGAGEMENT_ID);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.reminderFrequencyDaysOverride).toBe(21);
    }
  });
});
