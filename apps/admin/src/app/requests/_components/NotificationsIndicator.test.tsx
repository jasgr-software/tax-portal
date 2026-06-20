/**
 * apps/admin/src/app/requests/_components/NotificationsIndicator.test.tsx
 *
 * Component tests for NotificationsIndicator.
 *
 * TASK-008-003 AC coverage:
 *   [AC-ONBD-007-01 / AC-MSG-013-04] The accountant receives/can read the in-portal
 *     onboarding-complete notification — the feed renders it (dual-tagged per brief).
 *   [AC-ONBD-007-02] The rendered notification identifies the engagement + client
 *     (title/body text content rendered from the notification row).
 *   [non-regression] The feed still renders new_engagement_request notifications.
 *
 * Strategy:
 *   - Render NotificationsIndicator directly with fixture NotificationItem arrays.
 *   - No DB connection, no server actions — pure component behavior under @testing-library/react.
 *   - Mirrors inbox.test.tsx pattern (pure server components renderable in jsdom).
 *
 * ADR-006: Component is admin-only.
 * ADR-005: Renders only what listNotifications() returns (caller-supplied, RLS-scoped).
 * XSS: title/body rendered as React text nodes (default-escaped; no dangerouslySetInnerHTML).
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import type { NotificationItem } from "@tax-portal/db";
import { NotificationsIndicator } from "./NotificationsIndicator.js";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const MOCK_ENGAGEMENT_REQUEST_ID = "req-001-aaaa-bbbb-cccc-000000000001";

const MOCK_NEW_REQUEST_NOTIF: NotificationItem = {
  id: "notif-new-req-001",
  type: "new_engagement_request",
  title: "New engagement request from Jane Prospect",
  body: null,
  readAt: null,
  engagementRequestId: MOCK_ENGAGEMENT_REQUEST_ID,
  createdAt: new Date("2026-06-17T10:00:00Z"),
};

const MOCK_ONBOARDING_COMPLETE_NOTIF: NotificationItem = {
  id: "notif-onbd-complete-001",
  type: "onboarding_completed",
  title: "Onboarding complete for Jane Prospect",
  body: "Jane Prospect has completed all onboarding steps. Their engagement is now in progress.",
  readAt: null,
  engagementRequestId: MOCK_ENGAGEMENT_REQUEST_ID,
  createdAt: new Date("2026-06-18T14:30:00Z"),
};

const MOCK_READ_NEW_REQUEST_NOTIF: NotificationItem = {
  ...MOCK_NEW_REQUEST_NOTIF,
  id: "notif-new-req-002",
  readAt: new Date("2026-06-17T11:00:00Z"),
};

const MOCK_READ_ONBOARDING_COMPLETE_NOTIF: NotificationItem = {
  ...MOCK_ONBOARDING_COMPLETE_NOTIF,
  id: "notif-onbd-complete-002",
  readAt: new Date("2026-06-18T15:00:00Z"),
};

const MOCK_UNKNOWN_TYPE_NOTIF: NotificationItem = {
  id: "notif-unknown-001",
  type: "some_future_type",
  title: "Should not be rendered",
  body: null,
  readAt: null,
  engagementRequestId: null,
  createdAt: new Date("2026-06-19T08:00:00Z"),
};

// ─── Tests: onboarding_completed notification rendering ───────────────────────

describe("[AC-ONBD-007-01 / AC-MSG-013-04] feed renders onboarding_completed notification", () => {
  /**
   * [AC-ONBD-007-01 / AC-MSG-013-04] The accountant receives the in-portal
   * onboarding-complete notification — the feed renders it.
   * Dual-tagged because they assert the same notification surface.
   */
  it("[AC-ONBD-007-01 / AC-MSG-013-04] renders an onboarding_completed notification in the feed", () => {
    render(<NotificationsIndicator notifications={[MOCK_ONBOARDING_COMPLETE_NOTIF]} />);

    expect(screen.getByTestId("notification-list")).toBeInTheDocument();
    expect(
      screen.getByTestId(`notification-item-${MOCK_ONBOARDING_COMPLETE_NOTIF.id}`),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId(`notification-item-${MOCK_ONBOARDING_COMPLETE_NOTIF.id}`),
    ).toHaveAttribute("data-notification-type", "onboarding_completed");
  });

  /**
   * [AC-ONBD-007-01 / AC-MSG-013-04] Unread onboarding-complete notification
   * increments the unread badge count.
   */
  it("[AC-ONBD-007-01 / AC-MSG-013-04] unread onboarding_completed notification increments unread-count badge", () => {
    render(<NotificationsIndicator notifications={[MOCK_ONBOARDING_COMPLETE_NOTIF]} />);

    const badge = screen.getByTestId("unread-count");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent("1");
  });

  /**
   * [AC-ONBD-007-01 / AC-MSG-013-04] A read onboarding-complete notification
   * does NOT increment the unread badge.
   */
  it("[AC-ONBD-007-01 / AC-MSG-013-04] read onboarding_completed notification does NOT increment unread-count badge", () => {
    render(
      <NotificationsIndicator notifications={[MOCK_READ_ONBOARDING_COMPLETE_NOTIF]} />,
    );

    expect(screen.queryByTestId("unread-count")).not.toBeInTheDocument();
  });
});

// ─── Tests: onboarding_completed identifies engagement + client ────────────────

describe("[AC-ONBD-007-02] rendered notification identifies the engagement + client", () => {
  /**
   * [AC-ONBD-007-02] The notification title identifies the engagement's client.
   * The engine denormalizes the client name into the title.
   */
  it("[AC-ONBD-007-02] renders the notification title identifying the client (onboarding_completed)", () => {
    render(<NotificationsIndicator notifications={[MOCK_ONBOARDING_COMPLETE_NOTIF]} />);

    // Title must contain client name — "Jane Prospect"
    expect(screen.getByText("Onboarding complete for Jane Prospect")).toBeInTheDocument();
  });

  /**
   * [AC-ONBD-007-02] The notification body identifies the engagement + client context.
   * The engine writes the body with the client name and completion statement.
   */
  it("[AC-ONBD-007-02] renders the notification body identifying the engagement + client", () => {
    render(<NotificationsIndicator notifications={[MOCK_ONBOARDING_COMPLETE_NOTIF]} />);

    const bodyEl = screen.getByTestId(
      `notification-body-${MOCK_ONBOARDING_COMPLETE_NOTIF.id}`,
    );
    expect(bodyEl).toBeInTheDocument();
    // Body contains client name and onboarding completion statement (AC-ONBD-007-02)
    expect(bodyEl).toHaveTextContent(/Jane Prospect/);
    expect(bodyEl).toHaveTextContent(/completed all onboarding steps/i);
  });

  /**
   * [AC-ONBD-007-02] XSS-safety: title and body are rendered as React text (not innerHTML).
   * Test verifies text content appears in normal DOM text nodes, not via innerHTML injection.
   */
  it("[AC-ONBD-007-02 / XSS] renders title and body as escaped text (XSS-safe)", () => {
    const xssAttempt = "Onboarding complete for <script>alert(1)</script> Eve";
    const notifWithXss: NotificationItem = {
      ...MOCK_ONBOARDING_COMPLETE_NOTIF,
      id: "notif-xss-001",
      title: xssAttempt,
      body: "<img src=x onerror=alert(1)>",
    };

    render(<NotificationsIndicator notifications={[notifWithXss]} />);

    const item = screen.getByTestId("notification-item-notif-xss-001");
    // The raw angle bracket text should appear as literal text, not as HTML tags
    expect(item).toHaveTextContent("Onboarding complete for");
    expect(item).toHaveTextContent("Eve");
    // No script element injected
    expect(item.querySelector("script")).toBeNull();
    expect(item.querySelector("img")).toBeNull();
  });
});

// ─── Tests: new_engagement_request non-regression ─────────────────────────────

describe("[non-regression] feed still renders new_engagement_request notifications", () => {
  /**
   * Non-regression: the existing new_engagement_request rendering is preserved
   * after adding onboarding_completed support.
   */
  it("[non-regression] renders new_engagement_request notification in the feed", () => {
    render(<NotificationsIndicator notifications={[MOCK_NEW_REQUEST_NOTIF]} />);

    expect(screen.getByTestId("notification-list")).toBeInTheDocument();
    expect(
      screen.getByTestId(`notification-item-${MOCK_NEW_REQUEST_NOTIF.id}`),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId(`notification-item-${MOCK_NEW_REQUEST_NOTIF.id}`),
    ).toHaveAttribute("data-notification-type", "new_engagement_request");
  });

  it("[non-regression] new_engagement_request notification renders its title", () => {
    render(<NotificationsIndicator notifications={[MOCK_NEW_REQUEST_NOTIF]} />);

    expect(
      screen.getByText("New engagement request from Jane Prospect"),
    ).toBeInTheDocument();
  });

  it("[non-regression] new_engagement_request notification renders a Review request link", () => {
    render(<NotificationsIndicator notifications={[MOCK_NEW_REQUEST_NOTIF]} />);

    const link = screen.getByTestId(
      `notification-link-${MOCK_NEW_REQUEST_NOTIF.id}`,
    );
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute(
      "href",
      `/requests/${MOCK_ENGAGEMENT_REQUEST_ID}`,
    );
    expect(link).toHaveTextContent("Review request");
  });

  it("[non-regression] unread new_engagement_request increments unread badge", () => {
    render(<NotificationsIndicator notifications={[MOCK_NEW_REQUEST_NOTIF]} />);

    expect(screen.getByTestId("unread-count")).toHaveTextContent("1");
  });

  it("[non-regression] read new_engagement_request does NOT increment unread badge", () => {
    render(<NotificationsIndicator notifications={[MOCK_READ_NEW_REQUEST_NOTIF]} />);

    expect(screen.queryByTestId("unread-count")).not.toBeInTheDocument();
  });
});

// ─── Tests: mixed notification types in one feed ──────────────────────────────

describe("mixed notification types in one feed", () => {
  it("renders both new_engagement_request and onboarding_completed in the same feed", () => {
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

  it("unread count reflects unread items across both known types", () => {
    render(
      <NotificationsIndicator
        notifications={[
          MOCK_NEW_REQUEST_NOTIF,           // unread
          MOCK_ONBOARDING_COMPLETE_NOTIF,   // unread
          MOCK_READ_NEW_REQUEST_NOTIF,      // read — should not count
        ]}
      />,
    );

    expect(screen.getByTestId("unread-count")).toHaveTextContent("2");
  });

  it("does NOT render unknown/future notification types", () => {
    render(
      <NotificationsIndicator
        notifications={[MOCK_NEW_REQUEST_NOTIF, MOCK_UNKNOWN_TYPE_NOTIF]}
      />,
    );

    // The unknown type notification should NOT appear in the DOM
    expect(
      screen.queryByTestId(`notification-item-${MOCK_UNKNOWN_TYPE_NOTIF.id}`),
    ).not.toBeInTheDocument();
    // Only the known-type notification renders
    expect(
      screen.getByTestId(`notification-item-${MOCK_NEW_REQUEST_NOTIF.id}`),
    ).toBeInTheDocument();
  });

  it("shows empty state when all notifications are of unknown type", () => {
    render(<NotificationsIndicator notifications={[MOCK_UNKNOWN_TYPE_NOTIF]} />);

    expect(screen.getByTestId("no-notifications")).toBeInTheDocument();
    expect(screen.queryByTestId("notification-list")).not.toBeInTheDocument();
  });
});

// ─── Tests: empty state ───────────────────────────────────────────────────────

describe("empty state", () => {
  it("shows empty state when notifications is empty", () => {
    render(<NotificationsIndicator notifications={[]} />);

    expect(screen.getByTestId("no-notifications")).toBeInTheDocument();
    expect(screen.queryByTestId("notification-list")).not.toBeInTheDocument();
    expect(screen.queryByTestId("unread-count")).not.toBeInTheDocument();
  });
});
