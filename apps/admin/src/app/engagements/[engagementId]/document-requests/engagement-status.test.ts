/**
 * apps/admin/src/app/engagements/[engagementId]/document-requests/engagement-status.test.ts
 *
 * Unit tests for getEngagementStatusAction — the minimal admin-pool engagement
 * status read added by TASK-008-003 for the AC-ONBD-006-01 UI observable.
 *
 * AC-ONBD-006-01 (UI observable): The admin per-engagement page shows the engagement
 *   status, reading "In Progress" once the completion engine has transitioned it.
 *
 * ADR-003: getEngagementStatusForAdmin uses the admin pool (no withRequestContext needed).
 * ADR-005: Identity guard — ACCOUNTANT-only.
 * ADR-006: Admin surface only — not in apps/portal.
 *
 * Strategy: No real DB. getEngagementStatusForAdmin is mocked. Tests verify the action layer:
 *   1. ACCOUNTANT identity is required (null identity + CLIENT role rejected).
 *   2. Returns { success: true, status } when the engagement exists.
 *   3. Returns { success: true, status: 'In Progress' } when transitioned (AC-ONBD-006-01).
 *   4. Returns { success: false, error } when the engagement is not found.
 *   5. Returns { success: false, error } when engagementId is empty.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Hoisted mock functions ───────────────────────────────────────────────────

const {
  mockGetIdentity,
  mockGetEngagementStatusForAdmin,
} = vi.hoisted(() => ({
  mockGetIdentity: vi.fn(),
  mockGetEngagementStatusForAdmin: vi.fn(),
}));

// ─── Mocks ────────────────────────────────────────────────────────────────────

// Mock next/headers — server action reads cookie header
vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue({
    get: (key: string) => (key === "cookie" ? "mock-cookie=session" : null),
  }),
}));

// Mock next/cache — revalidatePath is a no-op in tests
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

// Mock @tax-portal/auth — return a verified ACCOUNTANT identity by default
vi.mock("@tax-portal/auth", () => ({
  getAuthProvider: () => ({ getIdentity: mockGetIdentity }),
}));

// Mock @tax-portal/db barrel — expose getEngagementStatusForAdmin and other used exports
vi.mock("@tax-portal/db", () => ({
  withRequestContext: vi.fn().mockImplementation(
    (_clerkUserId: string, _role: string, fn: () => Promise<unknown>) => fn(),
  ),
  listDocumentRequestsForEngagement: vi.fn().mockResolvedValue([]),
  getEngagementStatusForAdmin: mockGetEngagementStatusForAdmin,
}));

// Mock the direct source-module import (NOT on the barrel — TASK-007-004 constraint)
vi.mock("@tax-portal/db/src/repositories/document-request.js", () => ({
  createDocumentRequestAsAccountant: vi.fn(),
}));

// ─── Import after mocks ────────────────────────────────────────────────────────

import { getEngagementStatusAction } from "./actions.js";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ENGAGEMENT_ID = "eng-001-aaaa-bbbb-cccc-000000000001";

const ACCOUNTANT_IDENTITY = {
  clerkUserId: "user_acct_test",
  role: "ACCOUNTANT" as const,
};

const CLIENT_IDENTITY = {
  clerkUserId: "user_client_test",
  role: "CLIENT" as const,
};

// ─── Tests: getEngagementStatusAction ────────────────────────────────────────

describe("getEngagementStatusAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetIdentity.mockResolvedValue(ACCOUNTANT_IDENTITY);
    mockGetEngagementStatusForAdmin.mockResolvedValue({
      id: ENGAGEMENT_ID,
      status: "New",
    });
  });

  /**
   * [AC-ONBD-006-01] Happy path — returns status 'New' for an engagement.
   */
  it("[AC-ONBD-006-01] returns { success: true, status: 'New' } when engagement is in New status", async () => {
    const result = await getEngagementStatusAction(ENGAGEMENT_ID);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.status).toBe("New");
    }
    expect(mockGetEngagementStatusForAdmin).toHaveBeenCalledWith(ENGAGEMENT_ID);
  });

  /**
   * [AC-ONBD-006-01] Returns 'In Progress' after the completion engine transitions the
   * engagement (simulates the post-onboarding state the UI observable must show).
   */
  it("[AC-ONBD-006-01] returns { success: true, status: 'In Progress' } once engagement is transitioned", async () => {
    mockGetEngagementStatusForAdmin.mockResolvedValue({
      id: ENGAGEMENT_ID,
      status: "In Progress",
    });

    const result = await getEngagementStatusAction(ENGAGEMENT_ID);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.status).toBe("In Progress"); // [AC-ONBD-006-01] UI observable
    }
  });

  /**
   * [security] Returns unauthorized when identity is null.
   */
  it("[security] returns { success: false } when identity is null (unauthenticated)", async () => {
    mockGetIdentity.mockResolvedValue(null);

    const result = await getEngagementStatusAction(ENGAGEMENT_ID);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/unauthorized/i);
    }
    expect(mockGetEngagementStatusForAdmin).not.toHaveBeenCalled();
  });

  /**
   * [security] Returns unauthorized when role is CLIENT.
   * Status display is admin-only (ADR-006).
   */
  it("[security] returns { success: false } when role is CLIENT (accountant-only)", async () => {
    mockGetIdentity.mockResolvedValue(CLIENT_IDENTITY);

    const result = await getEngagementStatusAction(ENGAGEMENT_ID);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/unauthorized/i);
    }
    expect(mockGetEngagementStatusForAdmin).not.toHaveBeenCalled();
  });

  /**
   * Returns { success: false } when engagementId is empty.
   */
  it("[validation] returns { success: false } when engagementId is empty", async () => {
    const result = await getEngagementStatusAction("");

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/engagement|id/i);
    }
    expect(mockGetEngagementStatusForAdmin).not.toHaveBeenCalled();
  });

  /**
   * Returns { success: false } when the engagement is not found.
   */
  it("[AC-ONBD-006-01] returns { success: false, error: 'Engagement not found' } when not found", async () => {
    mockGetEngagementStatusForAdmin.mockResolvedValue(null);

    const result = await getEngagementStatusAction(ENGAGEMENT_ID);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/not found/i);
    }
  });

  /**
   * Trims whitespace from engagementId before calling the repository.
   */
  it("[validation] passes trimmed engagementId to getEngagementStatusForAdmin", async () => {
    await getEngagementStatusAction(`  ${ENGAGEMENT_ID}  `);

    expect(mockGetEngagementStatusForAdmin).toHaveBeenCalledWith(ENGAGEMENT_ID);
  });
});
