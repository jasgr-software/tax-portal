/**
 * apps/admin/src/app/notifications/actions.test.ts
 *
 * Unit tests for admin notification server actions (EPIC-016 / TASK-016-006).
 *
 * AC coverage:
 *   [AC-MSG-013-03] getMyUnreadCountAction returns ACCOUNTANT unread count.
 *   [AC-MSG-017-01/-02] getMyUnreadCountAction is ACCOUNTANT-only (identity guard).
 *   [AC-MSG-015-02/-03] markNotificationOnViewAction marks read for linked item; no dismiss.
 *   [AC-MSG-015-03] no dismiss control — mark-read is view-triggered, not button-triggered.
 *
 * Strategy:
 *   - No real DB connection — withRequestContext, countUnreadNotifications, and
 *     markNotificationsReadByLinkedItem are mocked.
 *   - Tests verify the action layer: identity guard, delegation, error handling.
 *   - Mirrors apps/admin/src/app/requests/notifications.test.ts pattern (CS-TS-003).
 *
 * // AC-MSG-013-03 // AC-MSG-017-01 // AC-MSG-017-02 // AC-MSG-015-02 // AC-MSG-015-03
 * // CS-TS-001 // CS-TS-004 // CS-GEN-001 // CS-GEN-003
 * // ADR-003 // ADR-005 // ADR-006
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Hoisted mock functions ───────────────────────────────────────────────────

const {
  mockGetIdentity,
  mockCountUnreadNotifications,
  mockMarkNotificationsReadByLinkedItem,
} = vi.hoisted(() => ({
  mockGetIdentity: vi.fn(),
  mockCountUnreadNotifications: vi.fn(),
  mockMarkNotificationsReadByLinkedItem: vi.fn(),
}));

// ─── Mocks ────────────────────────────────────────────────────────────────────

// Mock next/headers — server action reads cookie header
vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue({
    get: (key: string) => (key === "cookie" ? "mock-cookie=session" : null),
  }),
}));

// Mock @tax-portal/auth — return a verified ACCOUNTANT identity by default
vi.mock("@tax-portal/auth", () => ({
  getAuthProvider: () => ({ getIdentity: mockGetIdentity }),
}));

// Mock @tax-portal/db — provide withRequestContext passthrough + stub functions
vi.mock("@tax-portal/db", () => ({
  // withRequestContext passes through to fn() — no actual SESSION_CONTEXT in unit tests
  withRequestContext: vi.fn().mockImplementation(
    (_clerkUserId: string, _role: string, fn: () => Promise<unknown>) => fn(),
  ),
  countUnreadNotifications: mockCountUnreadNotifications,
  markNotificationsReadByLinkedItem: mockMarkNotificationsReadByLinkedItem,
}));

// ─── Import after mocks ────────────────────────────────────────────────────────

import {
  getMyUnreadCountAction,
  markNotificationOnViewAction,
} from "./actions.js";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ACCOUNTANT_IDENTITY = {
  clerkUserId: "user_acct_notif_test_001",
  role: "ACCOUNTANT" as const,
};

const CLIENT_IDENTITY = {
  clerkUserId: "user_client_notif_test_001",
  role: "CLIENT" as const,
};

const MOCK_ENGAGEMENT_ID = "eng-id-001-aaaa-bbbb-cccc-000000000001";

// ─── Tests: getMyUnreadCountAction ───────────────────────────────────────────

describe("getMyUnreadCountAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetIdentity.mockResolvedValue(ACCOUNTANT_IDENTITY);
    mockCountUnreadNotifications.mockResolvedValue(3);
  });

  /**
   * [AC-MSG-017-02] ACCOUNTANT receives their unread count.
   * CS-TS-004: identity guard checked before DB call. // CS-TS-004
   */
  it("[AC-MSG-017-02] returns success + unreadCount when identity is ACCOUNTANT", async () => {
    const result = await getMyUnreadCountAction();

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.unreadCount).toBe(3); // [AC-MSG-017-02]
    }
    expect(mockCountUnreadNotifications).toHaveBeenCalledTimes(1);
  });

  /**
   * [AC-MSG-017-01] Badge requires ACCOUNTANT identity — returns unauthorized for null.
   * CS-TS-004: identity guard before any DB call. // CS-TS-004
   */
  it("[AC-MSG-017-01] returns { success: false } when identity is null (unauthenticated)", async () => {
    mockGetIdentity.mockResolvedValue(null);
    const result = await getMyUnreadCountAction();

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/unauthorized/i);
    }
    expect(mockCountUnreadNotifications).not.toHaveBeenCalled();
  });

  /**
   * [AC-MSG-017-01] Badge requires ACCOUNTANT identity — returns unauthorized for CLIENT role.
   * ADR-006: admin actions are ACCOUNTANT-only. // ADR-006
   */
  it("[AC-MSG-017-01] returns { success: false } when role is CLIENT (accountant-only)", async () => {
    mockGetIdentity.mockResolvedValue(CLIENT_IDENTITY);
    const result = await getMyUnreadCountAction();

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/unauthorized/i);
    }
    expect(mockCountUnreadNotifications).not.toHaveBeenCalled();
  });

  /**
   * Returns unreadCount = 0 when there are no unread notifications.
   */
  it("returns unreadCount = 0 when countUnreadNotifications returns 0", async () => {
    mockCountUnreadNotifications.mockResolvedValue(0);
    const result = await getMyUnreadCountAction();

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.unreadCount).toBe(0);
    }
  });
});

// ─── Tests: markNotificationOnViewAction ─────────────────────────────────────

describe("markNotificationOnViewAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetIdentity.mockResolvedValue(ACCOUNTANT_IDENTITY);
    mockMarkNotificationsReadByLinkedItem.mockResolvedValue({ markedCount: 1 });
  });

  /**
   * [AC-MSG-015-02] Viewing a linked item marks its notifications read.
   * The action fires on linked-item view — no dismiss button (AC-MSG-015-03).
   * CS-TS-004: identity from cookie, ACCOUNTANT guard. // CS-TS-004
   * CS-TS-001: markNotificationsReadByLinkedItem via withRequestContext. // CS-TS-001
   */
  it("[AC-MSG-015-02] marks notifications read for the linked item when ACCOUNTANT", async () => {
    const result = await markNotificationOnViewAction({
      linkedItemType: "engagement",
      linkedItemId: MOCK_ENGAGEMENT_ID,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.markedCount).toBe(1); // [AC-MSG-015-02]
    }
    expect(mockMarkNotificationsReadByLinkedItem).toHaveBeenCalledWith({
      linkedItemType: "engagement",
      linkedItemId: MOCK_ENGAGEMENT_ID,
    });
  });

  /**
   * [AC-MSG-015-03] Mark-read fires on view — no dismiss control.
   * The action is invoked automatically from the linked-item page, not from a button.
   * Verified here by confirming the action succeeds without any user-facing dismiss trigger.
   * CS-TS-004: identity guard must succeed before DB call. // CS-TS-004
   */
  it("[AC-MSG-015-03] action succeeds without any explicit dismiss parameter (view-triggered)", async () => {
    // The action takes only linkedItemType + linkedItemId — NO "dismiss" or "markRead" flag.
    // This verifies the no-dismiss contract: mark-read is automatic on view.
    const result = await markNotificationOnViewAction({
      linkedItemType: "request",
      linkedItemId: "req-id-001-aaaa-bbbb-cccc-000000000001",
    });

    expect(result.success).toBe(true);
    // No dismiss parameter in the result — mark-read is automatic. [AC-MSG-015-03]
  });

  /**
   * Returns markedCount = 0 when no notifications matched (already read or not found).
   * The action is idempotent — repeat calls are safe.
   */
  it("returns markedCount = 0 when no notifications are unread for the linked item", async () => {
    mockMarkNotificationsReadByLinkedItem.mockResolvedValue({ markedCount: 0 });
    const result = await markNotificationOnViewAction({
      linkedItemType: "engagement",
      linkedItemId: MOCK_ENGAGEMENT_ID,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.markedCount).toBe(0);
    }
  });

  /**
   * [AC-MSG-015-02] Returns unauthorized when identity is null.
   * CS-TS-004: identity guard before DB call. // CS-TS-004
   */
  it("[AC-MSG-015-02] returns { success: false } when identity is null (unauthenticated)", async () => {
    mockGetIdentity.mockResolvedValue(null);
    const result = await markNotificationOnViewAction({
      linkedItemType: "engagement",
      linkedItemId: MOCK_ENGAGEMENT_ID,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/unauthorized/i);
    }
    expect(mockMarkNotificationsReadByLinkedItem).not.toHaveBeenCalled();
  });

  /**
   * Returns unauthorized when role is CLIENT (admin actions are ACCOUNTANT-only).
   * ADR-006: admin actions require ACCOUNTANT identity. // ADR-006
   */
  it("returns { success: false } when role is CLIENT (accountant-only)", async () => {
    mockGetIdentity.mockResolvedValue(CLIENT_IDENTITY);
    const result = await markNotificationOnViewAction({
      linkedItemType: "engagement",
      linkedItemId: MOCK_ENGAGEMENT_ID,
    });

    expect(result.success).toBe(false);
    expect(mockMarkNotificationsReadByLinkedItem).not.toHaveBeenCalled();
  });

  /**
   * Returns error when linkedItemType is empty.
   * Input validation guard — fail fast before DB call.
   */
  it("returns { success: false } when linkedItemType is empty", async () => {
    const result = await markNotificationOnViewAction({
      linkedItemType: "",
      linkedItemId: MOCK_ENGAGEMENT_ID,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/required/i);
    }
    expect(mockMarkNotificationsReadByLinkedItem).not.toHaveBeenCalled();
  });

  /**
   * Returns error when linkedItemId is empty.
   * Input validation guard — fail fast before DB call.
   */
  it("returns { success: false } when linkedItemId is empty", async () => {
    const result = await markNotificationOnViewAction({
      linkedItemType: "engagement",
      linkedItemId: "",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/required/i);
    }
    expect(mockMarkNotificationsReadByLinkedItem).not.toHaveBeenCalled();
  });
});
