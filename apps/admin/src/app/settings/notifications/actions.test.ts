/**
 * apps/admin/src/app/settings/notifications/actions.test.ts
 *
 * Tier-2 unit tests for the accountant email-suppression server actions.
 *
 * AC-MSG-010-01: The accountant can turn off her own email notifications entirely.
 *
 * Test coverage:
 *   - [CS-TS-004] CLIENT identity is rejected BEFORE any DB write (security gate).
 *   - [CS-TS-004] Unauthenticated caller is rejected BEFORE any DB write.
 *   - [CS-TS-001] Accountant write path succeeds through withRequestContext.
 *   - [AC-MSG-010-01] suppress=true → setEmailNudgePreferenceForCurrentUser(false).
 *   - [AC-MSG-010-01] suppress=false → setEmailNudgePreferenceForCurrentUser(true).
 *   - Read action: returns current preference for ACCOUNTANT; rejects CLIENT/unauth.
 *
 * Strategy:
 *   - No real DB connection — withRequestContext and preference functions are mocked.
 *   - Identity guard tested with null identity, CLIENT role, and valid ACCOUNTANT.
 *   - Mirrors the test pattern in apps/admin/src/app/settings/letter-template/actions.test.ts.
 *
 * CS-TS-004: The key security gate: CLIENT or unauth caller must be rejected before
 *   any call to setEmailNudgePreferenceForCurrentUser or withRequestContext. // CS-TS-004
 * CS-TS-001: write goes through withRequestContext (SESSION_CONTEXT set). // CS-TS-001
 * CS-GEN-002: additive — new test file; no existing test modified. // CS-GEN-002
 * CS-GEN-003: governing keys cited throughout. // CS-GEN-003
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Hoisted mock functions ───────────────────────────────────────────────────
//
// vi.hoisted() required because vi.mock() factories are hoisted before const declarations.

const {
  mockGetIdentity,
  mockWithRequestContext,
  mockGetEmailNudgePreferenceForCurrentUser,
  mockSetEmailNudgePreferenceForCurrentUser,
} = vi.hoisted(() => ({
  mockGetIdentity: vi.fn(),
  mockWithRequestContext: vi.fn(),
  mockGetEmailNudgePreferenceForCurrentUser: vi.fn(),
  mockSetEmailNudgePreferenceForCurrentUser: vi.fn(),
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

// Mock @tax-portal/db — stub withRequestContext + preference repository functions.
// withRequestContext is the CS-TS-001 wrapper; we execute the callback to verify
// the preference function is called inside the wrapper. // CS-TS-001
vi.mock("@tax-portal/db", () => ({
  withRequestContext: mockWithRequestContext,
  getEmailNudgePreferenceForCurrentUser: mockGetEmailNudgePreferenceForCurrentUser,
  setEmailNudgePreferenceForCurrentUser: mockSetEmailNudgePreferenceForCurrentUser,
}));

// ─── Import after mocks are set up ────────────────────────────────────────────

import {
  setOwnEmailNudgeSuppressionAction,
  getOwnEmailNudgePreferenceAction,
} from "./actions.js";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ACCOUNTANT_IDENTITY = {
  clerkUserId: "user_acct_test_018_004",
  role: "ACCOUNTANT" as const,
};

const CLIENT_IDENTITY = {
  clerkUserId: "user_client_test_018_004",
  role: "CLIENT" as const,
};

// ─── Tests: setOwnEmailNudgeSuppressionAction ─────────────────────────────────

describe("setOwnEmailNudgeSuppressionAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: authenticated ACCOUNTANT
    mockGetIdentity.mockResolvedValue(ACCOUNTANT_IDENTITY);
    // Default: withRequestContext executes the callback immediately (no DB)
    mockWithRequestContext.mockImplementation(
      async (_clerkUserId: string, _role: string, fn: () => Promise<void>) => fn(),
    );
    // Default: setEmailNudgePreferenceForCurrentUser is a no-op
    mockSetEmailNudgePreferenceForCurrentUser.mockResolvedValue(undefined);
  });

  // ── Security gate (CS-TS-004) ─────────────────────────────────────────────

  /**
   * [CS-TS-004] CLIENT identity is rejected BEFORE any DB write.
   *
   * A CLIENT session must return { success: false } immediately.
   * Neither withRequestContext nor setEmailNudgePreferenceForCurrentUser may be called.
   * This is the mandatory security gate: a non-ACCOUNTANT caller is blocked at the trust fence.
   *
   * // CS-TS-004 // ADR-006
   */
  it("[CS-TS-004] CLIENT identity is rejected before any DB write", async () => {
    // CS-TS-004: set up a CLIENT identity
    mockGetIdentity.mockResolvedValue(CLIENT_IDENTITY);

    const result = await setOwnEmailNudgeSuppressionAction(true);

    // Must fail before reaching any DB call
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/unauthorized/i);
    }

    // CS-TS-004: DB write seam must NOT have been called — the trust fence held.
    expect(mockWithRequestContext).not.toHaveBeenCalled(); // CS-TS-001 wrapper skipped
    expect(mockSetEmailNudgePreferenceForCurrentUser).not.toHaveBeenCalled();
  });

  /**
   * [CS-TS-004] Unauthenticated caller (null identity) is rejected BEFORE any DB write.
   *
   * A null identity (no valid session cookie) must return { success: false }.
   * The DB write seam must not be reached.
   *
   * // CS-TS-004 // ADR-003
   */
  it("[CS-TS-004] unauthenticated caller (null identity) is rejected before any DB write", async () => {
    mockGetIdentity.mockResolvedValue(null);

    const result = await setOwnEmailNudgeSuppressionAction(true);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/unauthorized/i);
    }

    // CS-TS-004: DB write seam not reached.
    expect(mockWithRequestContext).not.toHaveBeenCalled();
    expect(mockSetEmailNudgePreferenceForCurrentUser).not.toHaveBeenCalled();
  });

  // ── Happy path (CS-TS-001 + AC-MSG-010-01) ───────────────────────────────

  /**
   * [AC-MSG-010-01] suppress=true → setEmailNudgePreferenceForCurrentUser(false).
   *
   * The accountant turns off her email notifications.
   * withRequestContext is called with the ACCOUNTANT clerkUserId.
   * setEmailNudgePreferenceForCurrentUser is called with false (disabled).
   *
   * // AC-MSG-010-01 // CS-TS-001 // CS-TS-004 // ADR-003
   */
  it("[AC-MSG-010-01] suppress=true calls setEmailNudgePreferenceForCurrentUser(false)", async () => {
    const result = await setOwnEmailNudgeSuppressionAction(true);

    expect(result.success).toBe(true);

    // CS-TS-001: write goes through withRequestContext with the ACCOUNTANT identity. // CS-TS-001
    expect(mockWithRequestContext).toHaveBeenCalledWith(
      ACCOUNTANT_IDENTITY.clerkUserId,
      "ACCOUNTANT",
      expect.any(Function),
    );

    // AC-MSG-010-01: suppress=true → emailNudgeEnabled=false (turned off). // AC-MSG-010-01
    expect(mockSetEmailNudgePreferenceForCurrentUser).toHaveBeenCalledWith(false);
  });

  /**
   * [AC-MSG-010-01] suppress=false → setEmailNudgePreferenceForCurrentUser(true).
   *
   * The accountant re-enables her email notifications.
   *
   * // AC-MSG-010-01 // CS-TS-001
   */
  it("[AC-MSG-010-01] suppress=false calls setEmailNudgePreferenceForCurrentUser(true)", async () => {
    const result = await setOwnEmailNudgeSuppressionAction(false);

    expect(result.success).toBe(true);
    expect(mockSetEmailNudgePreferenceForCurrentUser).toHaveBeenCalledWith(true);
  });

  /**
   * [CS-TS-001] withRequestContext is called with ACCOUNTANT role and correct clerkUserId.
   *
   * The wrapper must always be called — it sets SESSION_CONTEXT before the UPDATE.
   *
   * // CS-TS-001 // ADR-003
   */
  it("[CS-TS-001] withRequestContext is called with ACCOUNTANT role and caller clerkUserId", async () => {
    await setOwnEmailNudgeSuppressionAction(true);

    expect(mockWithRequestContext).toHaveBeenCalledWith(
      ACCOUNTANT_IDENTITY.clerkUserId,
      "ACCOUNTANT",
      expect.any(Function),
    );
  });
});

// ─── Tests: getOwnEmailNudgePreferenceAction ──────────────────────────────────

describe("getOwnEmailNudgePreferenceAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetIdentity.mockResolvedValue(ACCOUNTANT_IDENTITY);
    mockWithRequestContext.mockImplementation(
      async (_clerkUserId: string, _role: string, fn: () => Promise<boolean>) => fn(),
    );
    mockGetEmailNudgePreferenceForCurrentUser.mockResolvedValue(true);
  });

  /**
   * [CS-TS-004] CLIENT identity is rejected before any DB read.
   */
  it("[CS-TS-004] CLIENT identity is rejected before any DB read", async () => {
    mockGetIdentity.mockResolvedValue(CLIENT_IDENTITY);

    const result = await getOwnEmailNudgePreferenceAction();

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/unauthorized/i);
    }
    expect(mockWithRequestContext).not.toHaveBeenCalled();
    expect(mockGetEmailNudgePreferenceForCurrentUser).not.toHaveBeenCalled();
  });

  /**
   * [CS-TS-004] Unauthenticated caller is rejected before any DB read.
   */
  it("[CS-TS-004] unauthenticated caller is rejected before any DB read", async () => {
    mockGetIdentity.mockResolvedValue(null);

    const result = await getOwnEmailNudgePreferenceAction();

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/unauthorized/i);
    }
    expect(mockWithRequestContext).not.toHaveBeenCalled();
  });

  /**
   * [AC-MSG-011-01 + CS-TS-001] ACCOUNTANT read returns emailEnabled=true (default-on).
   */
  it("[AC-MSG-011-01] returns emailEnabled=true for ACCOUNTANT when preference is enabled", async () => {
    mockGetEmailNudgePreferenceForCurrentUser.mockResolvedValue(true);

    const result = await getOwnEmailNudgePreferenceAction();

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.emailEnabled).toBe(true);
    }
    expect(mockWithRequestContext).toHaveBeenCalledWith(
      ACCOUNTANT_IDENTITY.clerkUserId,
      "ACCOUNTANT",
      expect.any(Function),
    );
  });

  /**
   * [AC-MSG-010-01] Returns emailEnabled=false when accountant has suppressed.
   */
  it("[AC-MSG-010-01] returns emailEnabled=false when accountant has suppressed notifications", async () => {
    mockGetEmailNudgePreferenceForCurrentUser.mockResolvedValue(false);

    const result = await getOwnEmailNudgePreferenceAction();

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.emailEnabled).toBe(false);
    }
  });
});
