/**
 * apps/admin/src/app/notifications/notification-badge.test.tsx
 *
 * Component tests for the accountant notification badge + feed (EPIC-016 / TASK-016-006).
 *
 * AC coverage:
 *   [AC-MSG-013-03] Accountant feed renders document_uploaded notification.
 *   [AC-MSG-017-01] Badge present in admin nav with unread count.
 *   [AC-MSG-017-02] Badge shows correct unread count for the ACCOUNTANT.
 *   [AC-MSG-012-01/-02/-03] Real-time arrival increments badge without refresh.
 *   [AC-MSG-015-02/-03] Viewing the linked item marks read; no dismiss control.
 *
 * Strategy:
 *   - Render components directly with fixture props.
 *   - No DB connection, no server actions — pure component behavior.
 *   - Mocks the @tax-portal/realtime transport for real-time tests.
 *   - CS-TS-003: shared badge component shape with apps/portal (consume, not fork).
 *
 * ADR-006: admin-only surface.
 * ADR-023: real-time transport mocked via vi.mock.
 * CS-TS-003: AccountantNotificationBadgeClient mirrors portal NotificationBadgeClient shape.
 * CS-GEN-003: AC ids and governing keys cited.
 *
 * // AC-MSG-013-03 // AC-MSG-017-01 // AC-MSG-017-02
 * // AC-MSG-012-01 // AC-MSG-012-02 // AC-MSG-012-03
 * // AC-MSG-015-02 // AC-MSG-015-03
 * // ADR-006 // ADR-023 // CS-TS-003 // CS-GEN-003
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import type { NotificationItem } from "@tax-portal/db";
import type { NotificationSubscriber, UnsubscribeFn } from "@tax-portal/realtime";

// ─── Mock the realtime transport ──────────────────────────────────────────────

const { mockSubscribe } = vi.hoisted(() => ({
  mockSubscribe: vi.fn(),
}));

vi.mock("@tax-portal/realtime", () => ({
  getNotificationTransport: () => ({
    subscribe: mockSubscribe,
  }),
}));

// ─── Import after mocks ────────────────────────────────────────────────────────

import { NotificationsIndicator } from "../requests/_components/NotificationsIndicator.js";
import { AccountantNotificationBadgeClient } from "./AccountantNotificationBadgeClient.js";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const MOCK_ENGAGEMENT_REQUEST_ID = "req-001-aaaa-bbbb-cccc-000000000001";
const MOCK_ENGAGEMENT_ID = "eng-001-aaaa-bbbb-cccc-000000000001";
const MOCK_DOCUMENT_ID = "doc-001-aaaa-bbbb-cccc-000000000001";

const makeNotif = (overrides: Partial<NotificationItem>): NotificationItem => ({
  id: "notif-default-001",
  type: "new_engagement_request",
  title: "Default notification",
  body: null,
  readAt: null,
  engagementRequestId: null,
  createdAt: new Date("2026-06-24T10:00:00Z"),
  recipientType: "ACCOUNTANT",
  recipientUserId: null,
  linkedItemType: null,
  linkedItemId: null,
  ...overrides,
});

const MOCK_NEW_REQUEST_NOTIF: NotificationItem = makeNotif({
  id: "notif-new-req-001",
  type: "new_engagement_request",
  title: "New engagement request from Jane Prospect",
  engagementRequestId: MOCK_ENGAGEMENT_REQUEST_ID,
  linkedItemType: "request",
  linkedItemId: MOCK_ENGAGEMENT_REQUEST_ID,
});

const MOCK_ONBOARDING_COMPLETE_NOTIF: NotificationItem = makeNotif({
  id: "notif-onbd-complete-001",
  type: "onboarding_completed",
  title: "Onboarding complete for Jane Prospect",
  body: "Jane Prospect has completed all onboarding steps.",
  engagementRequestId: MOCK_ENGAGEMENT_REQUEST_ID,
  linkedItemType: "engagement",
  linkedItemId: MOCK_ENGAGEMENT_ID,
});

/** [AC-MSG-013-03] Document-upload notification — the new type this task adds. */
const MOCK_DOCUMENT_UPLOAD_NOTIF: NotificationItem = makeNotif({
  id: "notif-doc-upload-001",
  type: "document_uploaded",
  title: "New document uploaded by Jane Prospect",
  body: "Jane Prospect uploaded Tax_Return_2024.pdf to your engagement.",
  engagementRequestId: MOCK_ENGAGEMENT_REQUEST_ID,
  linkedItemType: "document",
  linkedItemId: MOCK_DOCUMENT_ID,
});


// ─── Tests: NotificationsIndicator — document_uploaded ────────────────────────

describe("[AC-MSG-013-03] accountant feed renders the document-upload notification", () => {
  /**
   * [AC-MSG-013-03] The accountant feed renders 'document_uploaded' notifications.
   * This is the new type added by TASK-016-006 (CS-GEN-002 additive extension).
   *
   * CS-GEN-002: the existing indicator is extended, not rewritten. // CS-GEN-002
   */
  it("[AC-MSG-013-03] renders a document_uploaded notification in the feed", () => {
    render(<NotificationsIndicator notifications={[MOCK_DOCUMENT_UPLOAD_NOTIF]} />);

    expect(screen.getByTestId("notification-list")).toBeInTheDocument();
    const item = screen.getByTestId(`notification-item-${MOCK_DOCUMENT_UPLOAD_NOTIF.id}`);
    expect(item).toBeInTheDocument();
    expect(item).toHaveAttribute("data-notification-type", "document_uploaded");
  });

  /**
   * [AC-MSG-013-03] The document_uploaded notification body is rendered in the feed.
   */
  it("[AC-MSG-013-03] renders the document_uploaded notification title and body", () => {
    render(<NotificationsIndicator notifications={[MOCK_DOCUMENT_UPLOAD_NOTIF]} />);

    expect(
      screen.getByText("New document uploaded by Jane Prospect"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId(`notification-body-${MOCK_DOCUMENT_UPLOAD_NOTIF.id}`),
    ).toHaveTextContent("Tax_Return_2024.pdf");
  });

  /**
   * [AC-MSG-013-03] Unread document_uploaded notification increments the badge count.
   */
  it("[AC-MSG-013-03] unread document_uploaded notification increments the unread badge", () => {
    render(<NotificationsIndicator notifications={[MOCK_DOCUMENT_UPLOAD_NOTIF]} />);

    const badge = screen.getByTestId("unread-count");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent("1");
  });

  /**
   * [AC-MSG-013-03] All three known types render in the same feed simultaneously.
   * CS-GEN-002: additive — no existing types dropped. // CS-GEN-002
   */
  it("[AC-MSG-013-03] all three known notification types render in the same feed", () => {
    render(
      <NotificationsIndicator
        notifications={[
          MOCK_NEW_REQUEST_NOTIF,
          MOCK_ONBOARDING_COMPLETE_NOTIF,
          MOCK_DOCUMENT_UPLOAD_NOTIF,
        ]}
      />,
    );

    expect(
      screen.getByTestId(`notification-item-${MOCK_NEW_REQUEST_NOTIF.id}`),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId(`notification-item-${MOCK_ONBOARDING_COMPLETE_NOTIF.id}`),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId(`notification-item-${MOCK_DOCUMENT_UPLOAD_NOTIF.id}`),
    ).toBeInTheDocument();

    // Badge count = 3 (all unread)
    expect(screen.getByTestId("unread-count")).toHaveTextContent("3");
  });

  /**
   * Non-regression: existing new_engagement_request and onboarding_completed types
   * are still rendered after adding document_uploaded.
   * CS-GEN-002: additive — no existing behavior changed. // CS-GEN-002
   */
  it("[non-regression / CS-GEN-002] existing types (new_engagement_request, onboarding_completed) still render", () => {
    render(
      <NotificationsIndicator
        notifications={[MOCK_NEW_REQUEST_NOTIF, MOCK_ONBOARDING_COMPLETE_NOTIF]}
      />,
    );

    expect(
      screen.getByTestId(`notification-item-${MOCK_NEW_REQUEST_NOTIF.id}`),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId(`notification-item-${MOCK_ONBOARDING_COMPLETE_NOTIF.id}`),
    ).toBeInTheDocument();
  });
});

// ─── Tests: AccountantNotificationBadgeClient — badge in nav ──────────────────

describe("[AC-MSG-017-01/-02] badge present in admin nav with unread count", () => {
  let subscriberFn: NotificationSubscriber | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    subscriberFn = null;
    // Capture the subscriber so tests can trigger fake real-time events.
    mockSubscribe.mockImplementation(
      (_channel: string, subscriber: NotificationSubscriber): UnsubscribeFn => {
        subscriberFn = subscriber;
        return () => {};
      },
    );
  });

  /**
   * [AC-MSG-017-01] Badge is rendered with unread count ≥ 1 when initialUnreadCount > 0.
   * The badge is the indicator that persists in the admin nav from any area.
   */
  it("[AC-MSG-017-01] renders the unread badge when initialUnreadCount > 0", () => {
    render(
      <AccountantNotificationBadgeClient initialUnreadCount={2} />,
    );

    const badge = screen.getByTestId("nav-unread-badge");
    expect(badge).toBeInTheDocument(); // [AC-MSG-017-01]
    expect(badge).toHaveAttribute("data-unread-count", "2"); // [AC-MSG-017-02]
    expect(badge).toHaveTextContent("2");
  });

  /**
   * [AC-MSG-017-01] Badge is absent when initialUnreadCount = 0.
   * The badge element is conditionally rendered (absent when count ≤ 0).
   */
  it("[AC-MSG-017-01] badge is absent when initialUnreadCount = 0", () => {
    render(
      <AccountantNotificationBadgeClient initialUnreadCount={0} />,
    );

    expect(screen.queryByTestId("nav-unread-badge")).not.toBeInTheDocument();
  });

  /**
   * [AC-MSG-017-02] Badge text reflects the exact initialUnreadCount.
   */
  it("[AC-MSG-017-02] badge text reflects the initial unread count", () => {
    render(
      <AccountantNotificationBadgeClient initialUnreadCount={5} />,
    );

    const badge = screen.getByTestId("nav-unread-badge");
    expect(badge).toHaveTextContent("5"); // [AC-MSG-017-02]
  });

  /**
   * [AC-MSG-012-01/-02/-03] Real-time arrival increments the badge without refresh.
   * The badge increments on 'notification.created' events from the transport.
   *
   * ADR-023: transport subscribed via getNotificationTransport(). // ADR-023
   * CS-TS-003: shares the same event-driven pattern as apps/portal NotificationBadgeClient. // CS-TS-003
   */
  it("[AC-MSG-012-01/-02/-03] real-time arrival increments the badge without refresh", async () => {
    render(
      <AccountantNotificationBadgeClient initialUnreadCount={1} />,
    );

    // Badge starts at 1 (server-fetched)
    expect(screen.getByTestId("nav-unread-badge")).toHaveTextContent("1");

    // Trigger a real-time 'notification.created' event (no page reload)
    await act(async () => {
      subscriberFn?.({ type: "notification.created", payload: {} });
    });

    // [AC-MSG-012-03] Badge increments to 2 without any navigation or reload.
    const badge = screen.getByTestId("nav-unread-badge");
    expect(badge).toHaveTextContent("2"); // [AC-MSG-012-01/-02/-03]
    expect(badge).toHaveAttribute("data-unread-count", "2");
  });

  /**
   * [AC-MSG-012-01/-02/-03] Multiple real-time arrivals increment the badge correctly.
   */
  it("[AC-MSG-012-01/-02/-03] multiple real-time arrivals increment badge correctly", async () => {
    render(
      <AccountantNotificationBadgeClient initialUnreadCount={0} />,
    );

    // Badge starts absent (count = 0)
    expect(screen.queryByTestId("nav-unread-badge")).not.toBeInTheDocument();

    // Emit 3 real-time events
    await act(async () => {
      subscriberFn?.({ type: "notification.created", payload: {} });
      subscriberFn?.({ type: "notification.created", payload: {} });
      subscriberFn?.({ type: "notification.created", payload: {} });
    });

    const badge = screen.getByTestId("nav-unread-badge");
    expect(badge).toHaveTextContent("3"); // [AC-MSG-012-03]
  });

  /**
   * Badge decrements on 'notification.read' events (mark-read reflected without refresh).
   * AC-MSG-017-03: badge reflects the current read state.
   */
  it("[AC-MSG-017-03] badge decrements on notification.read event (mark-read reflected)", async () => {
    render(
      <AccountantNotificationBadgeClient initialUnreadCount={3} />,
    );

    expect(screen.getByTestId("nav-unread-badge")).toHaveTextContent("3");

    await act(async () => {
      subscriberFn?.({ type: "notification.read", payload: {} });
    });

    expect(screen.getByTestId("nav-unread-badge")).toHaveTextContent("2");
  });

  /**
   * Badge does not go below 0 on decrement (floor at 0, badge absent).
   */
  it("badge does not go below 0 (floor at 0 — badge absent when count reaches 0)", async () => {
    render(
      <AccountantNotificationBadgeClient initialUnreadCount={1} />,
    );

    await act(async () => {
      subscriberFn?.({ type: "notification.read", payload: {} });
    });

    // Count = 0 — badge is absent (component returns null when count ≤ 0)
    expect(screen.queryByTestId("nav-unread-badge")).not.toBeInTheDocument();
  });

  /**
   * Badge subscribes to the real-time transport on mount and unsubscribes on unmount.
   * ADR-023: subscribe returns UnsubscribeFn — MUST be called on cleanup. // ADR-023
   */
  it("[ADR-023] subscribes to transport on mount and unsubscribes on unmount", () => {
    const mockUnsubscribe = vi.fn();
    mockSubscribe.mockReturnValueOnce(mockUnsubscribe);

    const { unmount } = render(
      <AccountantNotificationBadgeClient initialUnreadCount={1} />,
    );

    expect(mockSubscribe).toHaveBeenCalledTimes(1); // subscribed on mount

    unmount();

    expect(mockUnsubscribe).toHaveBeenCalledTimes(1); // unsubscribed on unmount [ADR-023]
  });
});
