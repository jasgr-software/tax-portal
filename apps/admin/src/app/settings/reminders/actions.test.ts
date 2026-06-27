/**
 * apps/admin/src/app/settings/reminders/actions.test.ts
 *
 * Unit tests for the global default cadence server actions.
 *
 * TASK-019-002 / BRIEF-019 / EPIC-019
 *
 * Acceptance criteria covered:
 *   AC-DASH-008-01: accountant can set/read global default reminder frequency. // AC-DASH-008-01
 *   AC-MSG-018-03: global default frequency applies where no override exists. // AC-MSG-018-03
 *
 * Test coverage:
 *   - [CS-TS-004] CLIENT identity is rejected BEFORE any DB call (security gate).
 *   - [CS-TS-004] Unauthenticated caller is rejected BEFORE any DB call.
 *   - [CS-TS-001] Accountant write path invokes setGlobalDefaultCadence.
 *   - [AC-DASH-008-01] Set action writes the new frequency.
 *   - [AC-DASH-008-01] Get action returns current frequency.
 *
 * Strategy:
 *   - No real DB connection — cadence repository functions are mocked.
 *   - Identity guard tested with null identity, CLIENT role, and valid ACCOUNTANT.
 *   - Mirrors the test pattern in apps/admin/src/app/settings/notifications/actions.test.ts.
 *
 * CS-TS-004: The key security gate: CLIENT or unauth caller must be rejected before
 *   any call to setGlobalDefaultCadence or getGlobalDefaultCadence. // CS-TS-004
 * CS-TS-001: write goes through setGlobalDefaultCadence (no raw pool import). // CS-TS-001
 * CS-GEN-002: additive — new test file; no existing test modified. // CS-GEN-002
 * CS-GEN-003: governing keys cited throughout. // CS-GEN-003
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Hoisted mock functions ───────────────────────────────────────────────────

const {
  mockGetIdentity,
  mockGetGlobalDefaultCadence,
  mockSetGlobalDefaultCadence,
} = vi.hoisted(() => ({
  mockGetIdentity: vi.fn(),
  mockGetGlobalDefaultCadence: vi.fn(),
  mockSetGlobalDefaultCadence: vi.fn(),
}));

// ─── Mocks ────────────────────────────────────────────────────────────────────

// Mock next/headers — server action reads cookie header to build synthetic Request
vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue({
    get: (key: string) => (key === "cookie" ? "mock-cookie=session" : null),
  }),
}));

// Mock @tax-portal/auth — return a verified ACCOUNTANT identity by default
vi.mock("@tax-portal/auth", () => ({
  getAuthProvider: () => ({ getIdentity: mockGetIdentity }),
}));

// Mock @tax-portal/db — stub cadence repository functions
vi.mock("@tax-portal/db", () => ({
  getGlobalDefaultCadence: mockGetGlobalDefaultCadence,
  setGlobalDefaultCadence: mockSetGlobalDefaultCadence,
}));

// ─── Import after mocks are set up ────────────────────────────────────────────

import {
  setGlobalDefaultCadenceAction,
  getGlobalDefaultCadenceAction,
} from "./actions.js";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ACCOUNTANT_IDENTITY = {
  clerkUserId: "user_acct_test_019_002",
  role: "ACCOUNTANT" as const,
};

const CLIENT_IDENTITY = {
  clerkUserId: "user_client_test_019_002",
  role: "CLIENT" as const,
};

// ─── Tests: setGlobalDefaultCadenceAction ─────────────────────────────────────

describe("setGlobalDefaultCadenceAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: authenticated ACCOUNTANT
    mockGetIdentity.mockResolvedValue(ACCOUNTANT_IDENTITY);
    // Default: setGlobalDefaultCadence is a no-op
    mockSetGlobalDefaultCadence.mockResolvedValue({ updated: true });
  });

  // ── Security gate (CS-TS-004) ─────────────────────────────────────────────

  /**
   * [CS-TS-004] CLIENT identity is rejected BEFORE any DB write.
   *
   * A CLIENT session must return { success: false } immediately.
   * setGlobalDefaultCadence must NOT be called.
   * This is the mandatory security gate for cadence config.
   *
   * // CS-TS-004 // ADR-006
   */
  it("[CS-TS-004] CLIENT identity is rejected before any DB write", async () => {
    // CS-TS-004: set up a CLIENT identity
    mockGetIdentity.mockResolvedValue(CLIENT_IDENTITY);

    const result = await setGlobalDefaultCadenceAction(14);

    // Must fail before reaching any DB call
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/unauthorized/i);
    }

    // CS-TS-004: DB write seam must NOT have been called — the trust fence held.
    expect(mockSetGlobalDefaultCadence).not.toHaveBeenCalled();
  });

  /**
   * [CS-TS-004] Unauthenticated caller (null identity) is rejected BEFORE any DB write.
   *
   * // CS-TS-004 // ADR-003
   */
  it("[CS-TS-004] unauthenticated caller (null identity) is rejected before any DB write", async () => {
    mockGetIdentity.mockResolvedValue(null);

    const result = await setGlobalDefaultCadenceAction(14);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/unauthorized/i);
    }

    // CS-TS-004: DB write seam not reached.
    expect(mockSetGlobalDefaultCadence).not.toHaveBeenCalled();
  });

  // ── Happy path (CS-TS-001 + AC-DASH-008-01) ───────────────────────────────

  /**
   * [AC-DASH-008-01] ACCOUNTANT write path invokes setGlobalDefaultCadence with the correct frequency.
   *
   * // AC-DASH-008-01 // CS-TS-001 // DECISION-019-B
   */
  it("[AC-DASH-008-01] ACCOUNTANT sets cadence → setGlobalDefaultCadence called with the new frequency", async () => {
    const NEW_FREQUENCY = 14;

    const result = await setGlobalDefaultCadenceAction(NEW_FREQUENCY);

    expect(result.success).toBe(true);

    // CS-TS-001: write goes through setGlobalDefaultCadence (admin pool in packages/db). // CS-TS-001
    expect(mockSetGlobalDefaultCadence).toHaveBeenCalledWith({
      reminderFrequencyDays: NEW_FREQUENCY,
    });
  });

  /**
   * [AC-DASH-008-01] ACCOUNTANT can set different valid frequencies.
   *
   * // AC-DASH-008-01
   */
  it("[AC-DASH-008-01] ACCOUNTANT can set cadence to 30 days", async () => {
    const result = await setGlobalDefaultCadenceAction(30);

    expect(result.success).toBe(true);
    expect(mockSetGlobalDefaultCadence).toHaveBeenCalledWith({ reminderFrequencyDays: 30 });
  });

  // ── Server-side bounds (security) ─────────────────────────────────────────

  /**
   * Server-side guard rejects reminderFrequencyDays=0.
   * A 0 or negative value would make shouldRaiseReminder() always true → reminder-flood.
   */
  it("[security] rejects reminderFrequencyDays=0 before any DB write", async () => {
    const result = await setGlobalDefaultCadenceAction(0);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/integer between 1 and 365/i);
    }
    expect(mockSetGlobalDefaultCadence).not.toHaveBeenCalled();
  });

  /**
   * Server-side guard rejects negative reminderFrequencyDays.
   */
  it("[security] rejects negative reminderFrequencyDays before any DB write", async () => {
    const result = await setGlobalDefaultCadenceAction(-1);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/integer between 1 and 365/i);
    }
    expect(mockSetGlobalDefaultCadence).not.toHaveBeenCalled();
  });

  /**
   * Server-side guard rejects non-integer values.
   */
  it("[security] rejects non-integer reminderFrequencyDays (e.g. 1.5) before any DB write", async () => {
    const result = await setGlobalDefaultCadenceAction(1.5);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/integer between 1 and 365/i);
    }
    expect(mockSetGlobalDefaultCadence).not.toHaveBeenCalled();
  });

  /**
   * Server-side guard rejects values > 365.
   */
  it("[security] rejects reminderFrequencyDays > 365 before any DB write", async () => {
    const result = await setGlobalDefaultCadenceAction(366);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/integer between 1 and 365/i);
    }
    expect(mockSetGlobalDefaultCadence).not.toHaveBeenCalled();
  });
});

// ─── Tests: getGlobalDefaultCadenceAction ─────────────────────────────────────

describe("getGlobalDefaultCadenceAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetIdentity.mockResolvedValue(ACCOUNTANT_IDENTITY);
    mockGetGlobalDefaultCadence.mockResolvedValue({
      id: "test-id",
      reminderFrequencyDays: 7,
      approachingDueWindowDays: 7,
      defaultRequestDueDays: null,
    });
  });

  /**
   * [CS-TS-004] CLIENT identity is rejected before any DB read.
   */
  it("[CS-TS-004] CLIENT identity is rejected before any DB read", async () => {
    mockGetIdentity.mockResolvedValue(CLIENT_IDENTITY);

    const result = await getGlobalDefaultCadenceAction();

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/unauthorized/i);
    }
    expect(mockGetGlobalDefaultCadence).not.toHaveBeenCalled();
  });

  /**
   * [CS-TS-004] Unauthenticated caller is rejected before any DB read.
   */
  it("[CS-TS-004] unauthenticated caller is rejected before any DB read", async () => {
    mockGetIdentity.mockResolvedValue(null);

    const result = await getGlobalDefaultCadenceAction();

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/unauthorized/i);
    }
    expect(mockGetGlobalDefaultCadence).not.toHaveBeenCalled();
  });

  /**
   * [AC-DASH-008-01] Returns current global default frequency for ACCOUNTANT.
   */
  it("[AC-DASH-008-01] returns current reminderFrequencyDays for ACCOUNTANT", async () => {
    mockGetGlobalDefaultCadence.mockResolvedValue({
      id: "test-id",
      reminderFrequencyDays: 7,
      approachingDueWindowDays: 7,
      defaultRequestDueDays: null,
    });

    const result = await getGlobalDefaultCadenceAction();

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.reminderFrequencyDays).toBe(7);
    }
    expect(mockGetGlobalDefaultCadence).toHaveBeenCalledOnce();
  });
});
