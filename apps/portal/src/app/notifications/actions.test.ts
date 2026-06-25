/**
 * apps/portal/src/app/notifications/actions.test.ts
 *
 * Unit tests for notification server actions (TASK-016-005).
 *
 * Tests the identity guard + role check behavior (CS-TS-004) and input validation,
 * without a live DB (mocked).
 *
 * AC coverage:
 *   [AC-MSG-015-02/-03] markNotificationOnViewAction fires mark-read with correct input
 *   [AC-MSG-017-02]     getMyUnreadCountAction returns unread count
 *   [CS-TS-004]         all actions return unauthorized when CLIENT identity is absent
 *   [CS-TS-004]         markNotificationOnViewAction guards CLIENT role
 *
 * Mocking strategy:
 *   - @tax-portal/auth: mock getAuthProvider → mock getIdentity
 *   - @tax-portal/db: mock withRequestContext, listNotifications, countUnreadNotifications,
 *     markNotificationsReadByLinkedItem
 *   - next/headers: mock headers()
 *
 * CS-TS-004: verification — the identity guard pattern (cookie→synthetic Request→getIdentity→role).
 * CS-GEN-003: AC ids in test names. // CS-GEN-003
 * ADR-003: SESSION_CONTEXT is the mechanism; withRequestContext is mocked to verify it's called.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ───────────────────────────────────────────────────────────────────

// Mock next/headers
vi.mock("next/headers", () => ({
  headers: vi.fn(),
}));

// Mock @tax-portal/auth
vi.mock("@tax-portal/auth", () => ({
  getAuthProvider: vi.fn(),
}));

// Mock @tax-portal/db
vi.mock("@tax-portal/db", () => ({
  withRequestContext: vi.fn(),
  listNotifications: vi.fn(),
  countUnreadNotifications: vi.fn(),
  markNotificationsReadByLinkedItem: vi.fn(),
}));

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { headers } from "next/headers";
import { getAuthProvider } from "@tax-portal/auth";
import {
  withRequestContext,
  listNotifications,
  countUnreadNotifications,
  markNotificationsReadByLinkedItem,
} from "@tax-portal/db";

import {
  getMyNotificationsAction,
  getMyUnreadCountAction,
  markNotificationOnViewAction,
} from "./actions";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const mockHeaders = headers as ReturnType<typeof vi.fn>;
const mockGetAuthProvider = getAuthProvider as ReturnType<typeof vi.fn>;
const mockWithRequestContext = withRequestContext as ReturnType<typeof vi.fn>;
const mockListNotifications = listNotifications as ReturnType<typeof vi.fn>;
const mockCountUnreadNotifications = countUnreadNotifications as ReturnType<typeof vi.fn>;
const mockMarkNotificationsReadByLinkedItem =
  markNotificationsReadByLinkedItem as ReturnType<typeof vi.fn>;

const MOCK_CLERK_USER_ID = "user_client_test_001";
const MOCK_COOKIE = "__mock_session=abc123";

function setupClientIdentity(role: string = "CLIENT") {
  mockHeaders.mockResolvedValue({ get: () => MOCK_COOKIE });
  mockGetAuthProvider.mockReturnValue({
    getIdentity: vi.fn().mockResolvedValue({
      clerkUserId: MOCK_CLERK_USER_ID,
      role,
    }),
  });
}

function setupNoIdentity() {
  mockHeaders.mockResolvedValue({ get: () => "" });
  mockGetAuthProvider.mockReturnValue({
    getIdentity: vi.fn().mockResolvedValue(null),
  });
}

// ─── Tests: getMyNotificationsAction ─────────────────────────────────────────

describe("getMyNotificationsAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * [CS-TS-004] Returns unauthorized when no CLIENT session is present.
   * The action must bail before any DB call if identity is absent.
   */
  it("[CS-TS-004] returns unauthorized when CLIENT identity is absent", async () => {
    setupNoIdentity();

    const result = await getMyNotificationsAction();

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("Unauthorized");
    }
    // withRequestContext must NOT be called — the guard fired before the DB call.
    expect(mockWithRequestContext).not.toHaveBeenCalled();
  });

  /**
   * [CS-TS-004] Returns unauthorized when session is ACCOUNTANT (not CLIENT).
   */
  it("[CS-TS-004] returns unauthorized for ACCOUNTANT role (not CLIENT)", async () => {
    setupClientIdentity("ACCOUNTANT");

    const result = await getMyNotificationsAction();

    expect(result.success).toBe(false);
    expect(mockWithRequestContext).not.toHaveBeenCalled();
  });

  /**
   * [AC-MSG-007-01/-02] Returns notifications for authenticated CLIENT.
   */
  it("[AC-MSG-007-01/-02] returns notifications for authenticated CLIENT", async () => {
    setupClientIdentity();

    const mockNotifications = [
      {
        id: "n1",
        type: "engagement_status_changed",
        title: "Status changed",
        body: null,
        readAt: null,
        engagementRequestId: null,
        createdAt: new Date(),
        recipientType: "CLIENT",
        recipientUserId: "user-001",
        linkedItemType: "engagement",
        linkedItemId: "eng-001",
      },
    ];

    // withRequestContext calls the callback and returns its result.
    mockWithRequestContext.mockImplementation(
      async (_userId: string, _role: string, fn: () => Promise<unknown>) => fn(),
    );
    mockListNotifications.mockResolvedValue(mockNotifications);

    const result = await getMyNotificationsAction();

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.notifications).toEqual(mockNotifications);
    }
    // withRequestContext called with the CLIENT's clerkUserId and role.
    expect(mockWithRequestContext).toHaveBeenCalledWith(
      MOCK_CLERK_USER_ID,
      "CLIENT",
      expect.any(Function),
    );
  });
});

// ─── Tests: getMyUnreadCountAction ───────────────────────────────────────────

describe("getMyUnreadCountAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * [CS-TS-004] Returns unauthorized when CLIENT identity is absent.
   */
  it("[CS-TS-004] returns unauthorized when CLIENT identity is absent", async () => {
    setupNoIdentity();

    const result = await getMyUnreadCountAction();

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("Unauthorized");
    }
    expect(mockWithRequestContext).not.toHaveBeenCalled();
  });

  /**
   * [AC-MSG-017-02] Returns unread count for authenticated CLIENT.
   */
  it("[AC-MSG-017-02] returns unread count for authenticated CLIENT", async () => {
    setupClientIdentity();

    mockWithRequestContext.mockImplementation(
      async (_userId: string, _role: string, fn: () => Promise<unknown>) => fn(),
    );
    mockCountUnreadNotifications.mockResolvedValue(3);

    const result = await getMyUnreadCountAction();

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.unreadCount).toBe(3);
    }
    expect(mockWithRequestContext).toHaveBeenCalledWith(
      MOCK_CLERK_USER_ID,
      "CLIENT",
      expect.any(Function),
    );
  });

  /**
   * [AC-MSG-017-02] Returns unread count of 0 when no unread notifications.
   */
  it("[AC-MSG-017-02] returns 0 when no unread notifications", async () => {
    setupClientIdentity();

    mockWithRequestContext.mockImplementation(
      async (_userId: string, _role: string, fn: () => Promise<unknown>) => fn(),
    );
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
  });

  /**
   * [CS-TS-004] Returns unauthorized when CLIENT identity is absent.
   * The server action must bail before the DB call — CS-TS-004 step 4.
   */
  it("[CS-TS-004] returns unauthorized when CLIENT identity is absent", async () => {
    setupNoIdentity();

    const result = await markNotificationOnViewAction({
      linkedItemType: "engagement",
      linkedItemId: "eng-001",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("Unauthorized");
    }
    // The DB write must NOT be called — the guard fired first (CS-TS-004). // CS-TS-004
    expect(mockWithRequestContext).not.toHaveBeenCalled();
    expect(mockMarkNotificationsReadByLinkedItem).not.toHaveBeenCalled();
  });

  /**
   * [CS-TS-004] Returns unauthorized for ACCOUNTANT role (not CLIENT).
   * markNotificationOnViewAction is a CLIENT-only action.
   */
  it("[CS-TS-004] returns unauthorized for ACCOUNTANT role", async () => {
    setupClientIdentity("ACCOUNTANT");

    const result = await markNotificationOnViewAction({
      linkedItemType: "engagement",
      linkedItemId: "eng-001",
    });

    expect(result.success).toBe(false);
    expect(mockWithRequestContext).not.toHaveBeenCalled();
  });

  /**
   * [AC-MSG-015-02/-03] Marks notifications read for the given linked item.
   * Fires automatically on view (caller invokes this on page render).
   */
  it("[AC-MSG-015-02/-03] marks notifications read for the given linked item", async () => {
    setupClientIdentity();

    mockWithRequestContext.mockImplementation(
      async (_userId: string, _role: string, fn: () => Promise<unknown>) => fn(),
    );
    mockMarkNotificationsReadByLinkedItem.mockResolvedValue({ markedCount: 1 });

    const result = await markNotificationOnViewAction({
      linkedItemType: "engagement",
      linkedItemId: "eng-001-aaaa-bbbb-cccc-000000000001",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.markedCount).toBe(1);
    }

    // withRequestContext called with CLIENT identity.
    expect(mockWithRequestContext).toHaveBeenCalledWith(
      MOCK_CLERK_USER_ID,
      "CLIENT",
      expect.any(Function),
    );

    // markNotificationsReadByLinkedItem called with the correct input.
    expect(mockMarkNotificationsReadByLinkedItem).toHaveBeenCalledWith({
      linkedItemType: "engagement",
      linkedItemId: "eng-001-aaaa-bbbb-cccc-000000000001",
    });
  });

  /**
   * [AC-MSG-015-03] Returns error when linkedItemType is missing (input validation).
   * Guard fires before DB call.
   */
  it("[AC-MSG-015-03] returns error when linkedItemType is empty", async () => {
    setupClientIdentity();

    const result = await markNotificationOnViewAction({
      linkedItemType: "",
      linkedItemId: "eng-001",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("linkedItemType");
    }
    expect(mockWithRequestContext).not.toHaveBeenCalled();
  });

  /**
   * [AC-MSG-015-03] Returns error when linkedItemId is missing (input validation).
   * Guard fires before DB call.
   */
  it("[AC-MSG-015-03] returns error when linkedItemId is empty", async () => {
    setupClientIdentity();

    const result = await markNotificationOnViewAction({
      linkedItemType: "engagement",
      linkedItemId: "",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("linkedItemId");
    }
    expect(mockWithRequestContext).not.toHaveBeenCalled();
  });

  /**
   * [AC-MSG-015-03] Idempotent: markedCount is 0 when notifications are already read.
   * Re-calling on the same linked item is safe (the repository excludes already-read rows).
   */
  it("[AC-MSG-015-03] idempotent — markedCount 0 when notifications already read", async () => {
    setupClientIdentity();

    mockWithRequestContext.mockImplementation(
      async (_userId: string, _role: string, fn: () => Promise<unknown>) => fn(),
    );
    mockMarkNotificationsReadByLinkedItem.mockResolvedValue({ markedCount: 0 });

    const result = await markNotificationOnViewAction({
      linkedItemType: "engagement",
      linkedItemId: "eng-001-aaaa-bbbb-cccc-000000000001",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.markedCount).toBe(0);
    }
  });
});
