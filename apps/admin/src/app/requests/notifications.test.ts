/**
 * apps/admin/src/app/requests/notifications.test.ts
 *
 * Tier 2: Unit tests for notification server actions (admin surface).
 *
 * AC-DOOR-005-02: getNotificationsAction returns notifications with engagementRequestId
 *                 so the UI can link to the specific request.
 * AC-MSG-013-01:  Notifications of type 'new_engagement_request' are surfaced to the accountant.
 * AC-DOOR-005-01: getNotificationsAction is accountant-only (ACCOUNTANT identity required).
 *
 * No real DB connection — listNotifications and markNotificationRead are mocked.
 * Tests verify the action layer:
 *   1. ACCOUNTANT identity gates access (returns unauthorized for non-ACCOUNTANT).
 *   2. getNotificationsAction delegates to listNotifications via withRequestContext.
 *   3. markNotificationReadAction delegates to markNotificationRead via withRequestContext.
 *   4. Returned notifications carry engagementRequestId (AC-DOOR-005-02).
 *   5. Returned notifications include type 'new_engagement_request' (AC-MSG-013-01).
 *
 * // DECISION (TASK-003-003): withRequestContext is mocked to pass through fn() directly,
 * // consistent with the pattern in apps/admin/src/app/services/actions.test.ts.
 * // The actual SESSION_CONTEXT wiring is proven by the tier-3 integration tests in
 * // packages/db/src/session-context.propagation.test.ts and notification.rls.test.ts.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NotificationItem } from "@tax-portal/db";

// ─── Hoisted mock functions ───────────────────────────────────────────────────

const {
  mockGetIdentity,
  mockListNotifications,
  mockMarkNotificationRead,
} = vi.hoisted(() => ({
  mockGetIdentity: vi.fn(),
  mockListNotifications: vi.fn(),
  mockMarkNotificationRead: vi.fn(),
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

// Mock @tax-portal/db — provide withRequestContext passthrough + stub read functions
vi.mock("@tax-portal/db", () => ({
  // withRequestContext passes through to fn() — no actual SESSION_CONTEXT in unit tests
  withRequestContext: vi.fn().mockImplementation(
    (_clerkUserId: string, _role: string, fn: () => Promise<unknown>) => fn()
  ),
  listNotifications: mockListNotifications,
  markNotificationRead: mockMarkNotificationRead,
}));

// ─── Import after mocks ────────────────────────────────────────────────────────

import {
  getNotificationsAction,
  markNotificationReadAction,
} from "./actions.js";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const MOCK_REQUEST_ID = "req-id-001-aaaa-bbbb-cccc-000000000001";
const MOCK_NOTIFICATION_ID = "notif-id-001-aaaa-bbbb-cccc-000000000001";

/** A new-request notification as returned by listNotifications()
 *
 * EPIC-016 / TASK-016-002: NotificationItem now includes recipientType, recipientUserId,
 * linkedItemType, linkedItemId. Updated with ACCOUNTANT defaults (CS-GEN-002 additive). // CS-GEN-002
 */
const MOCK_NEW_REQUEST_NOTIFICATION: NotificationItem = {
  id: MOCK_NOTIFICATION_ID,
  type: "new_engagement_request",            // AC-MSG-013-01
  title: "New engagement request from Jane Prospect",
  body: null,
  readAt: null,                               // unread
  engagementRequestId: MOCK_REQUEST_ID,       // AC-DOOR-005-02 — links to the request
  createdAt: new Date("2026-06-17T10:00:00Z"),
  // EPIC-016 additive fields
  recipientType: "ACCOUNTANT",
  recipientUserId: null,
  linkedItemType: "request",
  linkedItemId: MOCK_REQUEST_ID,
};

const ACCOUNTANT_IDENTITY = {
  clerkUserId: "user_acct_test",
  role: "ACCOUNTANT" as const,
};

const CLIENT_IDENTITY = {
  clerkUserId: "user_client_test",
  role: "CLIENT" as const,
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("getNotificationsAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetIdentity.mockResolvedValue(ACCOUNTANT_IDENTITY);
    mockListNotifications.mockResolvedValue([MOCK_NEW_REQUEST_NOTIFICATION]);
  });

  /**
   * [AC-DOOR-005-01] Accountant can read their notifications.
   * Verifies the action succeeds and delegates to listNotifications.
   */
  it("[AC-DOOR-005-01] returns success + notifications when identity is ACCOUNTANT", async () => {
    const result = await getNotificationsAction();

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(1);
    }
    expect(mockListNotifications).toHaveBeenCalledTimes(1);
  });

  /**
   * [AC-MSG-013-01] Returned notifications include type 'new_engagement_request'.
   * The notification type identifies new service requests to the accountant.
   */
  it("[AC-MSG-013-01] returned notifications include type new_engagement_request", async () => {
    const result = await getNotificationsAction();

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data[0]?.type).toBe("new_engagement_request"); // [AC-MSG-013-01]
    }
  });

  /**
   * [AC-DOOR-005-02] Returned notifications carry engagementRequestId.
   * This FK is used by NotificationsIndicator to link to /requests/<engagementRequestId>.
   */
  it("[AC-DOOR-005-02] returned notifications carry engagementRequestId for request link", async () => {
    const result = await getNotificationsAction();

    expect(result.success).toBe(true);
    if (result.success) {
      const notif = result.data[0];
      expect(notif?.engagementRequestId).toBe(MOCK_REQUEST_ID); // [AC-DOOR-005-02]
    }
  });

  /**
   * [AC-DOOR-005-02] The notification title identifies the new request arrival.
   * AC-DOOR-005-02 requires "identifies that a new request arrived".
   */
  it("[AC-DOOR-005-02] notification title identifies the new request", async () => {
    const result = await getNotificationsAction();

    expect(result.success).toBe(true);
    if (result.success) {
      const notif = result.data[0];
      expect(notif?.title).toMatch(/new engagement request/i); // [AC-DOOR-005-02]
    }
  });

  /**
   * [AC-DOOR-005-01] Returns unauthorized when identity is null (unauthenticated).
   * The notification must be delivered to the accountant only (ADR-005).
   */
  it("[AC-DOOR-005-01] returns { success: false } when identity is null (unauthenticated)", async () => {
    mockGetIdentity.mockResolvedValue(null);
    const result = await getNotificationsAction();

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/unauthorized/i);
    }
    expect(mockListNotifications).not.toHaveBeenCalled();
  });

  /**
   * [AC-DOOR-005-01] Returns unauthorized when role is CLIENT.
   * Notifications are accountant-only (ADR-005, sec.pol_Notification).
   */
  it("[AC-DOOR-005-01] returns { success: false } when role is CLIENT (accountant-only)", async () => {
    mockGetIdentity.mockResolvedValue(CLIENT_IDENTITY);
    const result = await getNotificationsAction();

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/unauthorized/i);
    }
    expect(mockListNotifications).not.toHaveBeenCalled();
  });

  /**
   * Empty state: when there are no notifications, returns an empty array.
   */
  it("returns empty array when there are no notifications", async () => {
    mockListNotifications.mockResolvedValue([]);
    const result = await getNotificationsAction();

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(0);
    }
  });
});

describe("markNotificationReadAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetIdentity.mockResolvedValue(ACCOUNTANT_IDENTITY);
    mockMarkNotificationRead.mockResolvedValue({ id: MOCK_NOTIFICATION_ID });
  });

  /**
   * Happy path: ACCOUNTANT can mark a notification as read.
   */
  it("returns success + id when ACCOUNTANT marks notification read", async () => {
    const result = await markNotificationReadAction(MOCK_NOTIFICATION_ID);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.id).toBe(MOCK_NOTIFICATION_ID);
    }
    expect(mockMarkNotificationRead).toHaveBeenCalledWith(MOCK_NOTIFICATION_ID);
  });

  /**
   * Returns unauthorized when identity is null.
   */
  it("returns { success: false } when identity is null", async () => {
    mockGetIdentity.mockResolvedValue(null);
    const result = await markNotificationReadAction(MOCK_NOTIFICATION_ID);

    expect(result.success).toBe(false);
    expect(mockMarkNotificationRead).not.toHaveBeenCalled();
  });

  /**
   * Returns unauthorized when role is CLIENT.
   */
  it("returns { success: false } when role is CLIENT", async () => {
    mockGetIdentity.mockResolvedValue(CLIENT_IDENTITY);
    const result = await markNotificationReadAction(MOCK_NOTIFICATION_ID);

    expect(result.success).toBe(false);
    expect(mockMarkNotificationRead).not.toHaveBeenCalled();
  });

  /**
   * Returns error when notificationId is empty.
   */
  it("returns { success: false } when notificationId is empty", async () => {
    const result = await markNotificationReadAction("");

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/id.*required|required.*id/i);
    }
    expect(mockMarkNotificationRead).not.toHaveBeenCalled();
  });
});
