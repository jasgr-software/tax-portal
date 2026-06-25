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
 * TASK-017-012 AC coverage (Finding 1 — AC-MSG-013-02 "through the EPIC-016 feed"):
 *   [AC-MSG-013-02] The accountant receives/reads the in-portal new_message notification —
 *     the feed renders it with data-notification-type="new_message".
 *     CS-GEN-002: additive — no existing assertion changed. // CS-GEN-002
 *     CS-TS-003: cross-surface parity with portal feed (which already rendered new_message). // CS-TS-003
 *     ADR-006: admin-only component. // ADR-006
 *     EPIC-016: notification feed pattern. // EPIC-016
 *
 * BUG-017-002 AC coverage (root test-validity defect — linkedItemType mismatch):
 *   [AC-MSG-013-02 / BUG-017-002] new_message notification with linkedItemType='engagement'
 *     (the REAL value emitted by appendMessage for engagement threads after BUG-017-002 fix)
 *     renders a "View messages" link → /engagements/<engagementId>/messages.
 *   [AC-MSG-013-02 / BUG-017-002] new_message notification with linkedItemType='thread'
 *     (the REAL value emitted by appendMessage for general threads) renders a "View messages"
 *     link → /messages/<threadId>.
 *   Fixtures use the REAL linkedItemType values appendMessage produces (not seeded 'engagement'
 *   for all cases). CS-GEN-002: additive — no existing assertion changed. // CS-GEN-002
 *   CS-TS-003: both admin + portal resolve same linkedItemType values (cross-surface parity). // CS-TS-003
 *   BUG-017-002 // ADR-005 // ADR-006 // EPIC-016 // CS-GEN-003
 *
 * Strategy:
 *   - Render NotificationsIndicator directly with fixture NotificationItem arrays.
 *   - No DB connection, no server actions — pure component behavior under @testing-library/react.
 *   - Mirrors inbox.test.tsx pattern (pure server components renderable in jsdom).
 *
 * ADR-006: Component is admin-only.
 * ADR-005: Renders only what listNotifications() returns (caller-supplied, RLS-scoped).
 * XSS: title/body rendered as React text nodes (default-escaped; no dangerouslySetInnerHTML).
 * CS-TS-003: mirrors portal notification-feed.test.tsx for new_message scenarios. // CS-TS-003
 * CS-GEN-002: additive — no existing test assertions removed or changed. // CS-GEN-002
 * CS-GEN-003: AC ids in test names. // CS-GEN-003
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import type { NotificationItem } from "@tax-portal/db";
import { NotificationsIndicator } from "./NotificationsIndicator.js";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const MOCK_ENGAGEMENT_REQUEST_ID = "req-001-aaaa-bbbb-cccc-000000000001";

// EPIC-016 / TASK-016-002: NotificationItem now includes recipientType, recipientUserId,
// linkedItemType, linkedItemId. Existing test fixtures updated with ACCOUNTANT defaults.
// CS-GEN-002: additive — no existing assertion changed. // CS-GEN-002
const MOCK_NEW_REQUEST_NOTIF: NotificationItem = {
  id: "notif-new-req-001",
  type: "new_engagement_request",
  title: "New engagement request from Jane Prospect",
  body: null,
  readAt: null,
  engagementRequestId: MOCK_ENGAGEMENT_REQUEST_ID,
  createdAt: new Date("2026-06-17T10:00:00Z"),
  recipientType: "ACCOUNTANT",
  recipientUserId: null,
  linkedItemType: "request",
  linkedItemId: MOCK_ENGAGEMENT_REQUEST_ID,
};

const MOCK_ONBOARDING_COMPLETE_NOTIF: NotificationItem = {
  id: "notif-onbd-complete-001",
  type: "onboarding_completed",
  title: "Onboarding complete for Jane Prospect",
  body: "Jane Prospect has completed all onboarding steps. Their engagement is now in progress.",
  readAt: null,
  engagementRequestId: MOCK_ENGAGEMENT_REQUEST_ID,
  createdAt: new Date("2026-06-18T14:30:00Z"),
  recipientType: "ACCOUNTANT",
  recipientUserId: null,
  linkedItemType: null,
  linkedItemId: null,
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
  recipientType: "ACCOUNTANT",
  recipientUserId: null,
  linkedItemType: null,
  linkedItemId: null,
};

// ─── new_message fixtures (TASK-017-012 / BUG-017-002 / AC-MSG-013-02) ────────

const MOCK_ENGAGEMENT_ID = "eng-001-aaaa-bbbb-cccc-000000000001";
const MOCK_THREAD_ID = "thr-001-aaaa-bbbb-cccc-000000000001";

/**
 * Unread new_message notification for an ENGAGEMENT thread — ACCOUNTANT-scoped.
 * BUG-017-002: uses the REAL linkedItemType='engagement' that appendMessage emits
 * for engagement threads after the fix (not the formerly-seeded 'engagement' that
 * was never actually emitted for general threads).
 * AC-MSG-013-02: client sends → accountant notified "through the EPIC-016 feed".
 * CS-TS-003: mirrors the portal feed fixture pattern. // CS-TS-003
 * BUG-017-002 // AC-MSG-013-02 // ADR-005 // EPIC-016 // CS-GEN-003
 */
const MOCK_NEW_MESSAGE_NOTIF: NotificationItem = {
  id: "notif-new-msg-001",
  type: "new_message",
  title: "New message from client",
  body: "Client sent you a message in the engagement thread.",
  readAt: null, // unread
  engagementRequestId: null,
  createdAt: new Date("2026-06-25T10:00:00Z"),
  recipientType: "ACCOUNTANT",
  recipientUserId: null,
  linkedItemType: "engagement", // BUG-017-002: REAL value emitted by appendMessage for engagement threads
  linkedItemId: MOCK_ENGAGEMENT_ID, // BUG-017-002: the engagementId (not threadId)
};

/** Read new_message notification (for badge-absent assertion). */
const MOCK_READ_NEW_MESSAGE_NOTIF: NotificationItem = {
  ...MOCK_NEW_MESSAGE_NOTIF,
  id: "notif-new-msg-002",
  readAt: new Date("2026-06-25T11:00:00Z"),
};

/** new_message without any linkage — no link expected (defensive). */
const MOCK_NEW_MESSAGE_NO_LINK_NOTIF: NotificationItem = {
  ...MOCK_NEW_MESSAGE_NOTIF,
  id: "notif-new-msg-003",
  linkedItemType: null,
  linkedItemId: null,
};

/**
 * Unread new_message notification for a GENERAL thread — ACCOUNTANT-scoped.
 * BUG-017-002: uses the REAL linkedItemType='thread' that appendMessage emits
 * for general threads after the fix. The renderer must build /messages/<threadId>.
 * AC-MSG-013-02: client sends in general thread → accountant notified.
 * CS-TS-003: mirrors the portal feed general-thread fixture pattern. // CS-TS-003
 * BUG-017-002 // AC-MSG-013-02 // ADR-006 // EPIC-016 // CS-GEN-003
 */
const MOCK_NEW_MESSAGE_GENERAL_THREAD_NOTIF: NotificationItem = {
  id: "notif-new-msg-004",
  type: "new_message",
  title: "New message from client",
  body: "Client sent you a message in the general thread.",
  readAt: null, // unread
  engagementRequestId: null,
  createdAt: new Date("2026-06-25T12:00:00Z"),
  recipientType: "ACCOUNTANT",
  recipientUserId: null,
  linkedItemType: "thread", // BUG-017-002: REAL value emitted by appendMessage for general threads
  linkedItemId: MOCK_THREAD_ID,  // BUG-017-002: the threadId
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

// ─── Tests: new_message notification rendering (AC-MSG-013-02 / TASK-017-012) ─

/**
 * Finding 1 (TASK-017-012): The admin feed must render 'new_message' notifications
 * with data-notification-type="new_message" so the SDET's feed-render assertion holds.
 * CS-GEN-002: additive — no existing assertion changed. // CS-GEN-002
 * CS-TS-003: mirrors portal feed render for new_message (cross-surface parity). // CS-TS-003
 * ADR-006: admin-only component. // ADR-006
 * EPIC-016: notification feed pattern. // EPIC-016
 * AC-MSG-013-02: "through the EPIC-016 feed" — the brief's literal contract. // AC-MSG-013-02
 */
describe("[AC-MSG-013-02] admin feed renders new_message notification (TASK-017-012 — Finding 1)", () => {
  /**
   * [AC-MSG-013-02] The accountant's feed renders a new_message notification item
   * with data-notification-type="new_message" — the brief's "through the EPIC-016 feed" contract.
   * CS-TS-003: mirrors the portal feed new_message render (cross-surface parity). // CS-TS-003
   */
  it("[AC-MSG-013-02] renders a new_message notification item in the admin feed", () => {
    render(<NotificationsIndicator notifications={[MOCK_NEW_MESSAGE_NOTIF]} />);

    expect(screen.getByTestId("notification-list")).toBeInTheDocument();
    const item = screen.getByTestId(`notification-item-${MOCK_NEW_MESSAGE_NOTIF.id}`);
    expect(item).toBeInTheDocument();
    // AC-MSG-013-02: data-notification-type="new_message" — the SDET's feed-render assertion
    expect(item).toHaveAttribute("data-notification-type", "new_message");
  });

  /**
   * [AC-MSG-013-02] Unread new_message notification increments the unread badge count.
   */
  it("[AC-MSG-013-02] unread new_message notification increments unread-count badge", () => {
    render(<NotificationsIndicator notifications={[MOCK_NEW_MESSAGE_NOTIF]} />);

    const badge = screen.getByTestId("unread-count");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent("1");
  });

  /**
   * [AC-MSG-013-02] Read new_message notification does NOT increment the unread badge.
   */
  it("[AC-MSG-013-02] read new_message notification does NOT increment unread-count badge", () => {
    render(
      <NotificationsIndicator notifications={[MOCK_READ_NEW_MESSAGE_NOTIF]} />,
    );

    expect(screen.queryByTestId("unread-count")).not.toBeInTheDocument();
  });

  /**
   * [AC-MSG-013-02] Feed renders the new_message notification title.
   */
  it("[AC-MSG-013-02] renders the new_message notification title", () => {
    render(<NotificationsIndicator notifications={[MOCK_NEW_MESSAGE_NOTIF]} />);

    expect(screen.getByText("New message from client")).toBeInTheDocument();
  });

  /**
   * [AC-MSG-013-02] Feed renders the new_message notification body.
   */
  it("[AC-MSG-013-02] renders the new_message notification body", () => {
    render(<NotificationsIndicator notifications={[MOCK_NEW_MESSAGE_NOTIF]} />);

    const bodyEl = screen.getByTestId(`notification-body-${MOCK_NEW_MESSAGE_NOTIF.id}`);
    expect(bodyEl).toBeInTheDocument();
    expect(bodyEl).toHaveTextContent(/sent you a message/i);
  });

  /**
   * [AC-MSG-013-02] Feed renders a "View messages" link for new_message with engagement linkage.
   * Links to /engagements/<engagementId>/messages — the engagement messages area.
   * CS-TS-003: matches the portal pattern of linking to the triggering item. // CS-TS-003
   */
  it("[AC-MSG-013-02] renders a View messages link for new_message with engagement linkage", () => {
    render(<NotificationsIndicator notifications={[MOCK_NEW_MESSAGE_NOTIF]} />);

    const link = screen.getByTestId(`notification-link-${MOCK_NEW_MESSAGE_NOTIF.id}`);
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", `/engagements/${MOCK_ENGAGEMENT_ID}/messages`);
    expect(link).toHaveTextContent("View messages");
  });

  /**
   * [AC-MSG-013-02] No link rendered for new_message without engagement linkage.
   */
  it("[AC-MSG-013-02] no link rendered for new_message without engagement linkage", () => {
    render(<NotificationsIndicator notifications={[MOCK_NEW_MESSAGE_NO_LINK_NOTIF]} />);

    expect(
      screen.queryByTestId(`notification-link-${MOCK_NEW_MESSAGE_NO_LINK_NOTIF.id}`),
    ).not.toBeInTheDocument();
  });
});

// ─── Tests: new_message non-regression for existing types (CS-GEN-002) ────────

describe("[CS-GEN-002] new_message addition does not regress existing notification types (TASK-017-012)", () => {
  /**
   * [CS-GEN-002] Adding new_message to ACCOUNTANT_KNOWN_TYPES must not change
   * the rendering of existing types. Mixed feed with all known types renders all.
   * CS-GEN-002: additive — no existing assertion changed. // CS-GEN-002
   */
  it("[CS-GEN-002] mixed feed with all known types renders all items", () => {
    render(
      <NotificationsIndicator
        notifications={[
          MOCK_NEW_REQUEST_NOTIF,
          MOCK_ONBOARDING_COMPLETE_NOTIF,
          MOCK_NEW_MESSAGE_NOTIF,
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
      screen.getByTestId(`notification-item-${MOCK_NEW_MESSAGE_NOTIF.id}`),
    ).toBeInTheDocument();
  });

  /**
   * [CS-GEN-002] Unread count reflects all unread known-type items including new_message.
   */
  it("[CS-GEN-002] unread count includes new_message in mixed feed", () => {
    render(
      <NotificationsIndicator
        notifications={[
          MOCK_NEW_REQUEST_NOTIF,      // unread
          MOCK_NEW_MESSAGE_NOTIF,      // unread
          MOCK_READ_NEW_REQUEST_NOTIF, // read — should not count
        ]}
      />,
    );

    expect(screen.getByTestId("unread-count")).toHaveTextContent("2");
  });
});

// ─── Tests: BUG-017-002 — real linkedItemType values from appendMessage ────────

/**
 * BUG-017-002: The root test-validity defect — the prior fixture seeded
 * linkedItemType='engagement' for ALL new_message notifications, but the real
 * appendMessage() emission used linkedItemType='thread' for everything. After the
 * BUG-017-002 fix, appendMessage() emits:
 *   - engagement thread → linkedItemType='engagement', linkedItemId=engagementId
 *   - general thread   → linkedItemType='thread',     linkedItemId=threadId
 *
 * These tests use the REAL post-fix values that appendMessage() produces.
 * The 'engagement' case is already covered above (MOCK_NEW_MESSAGE_NOTIF).
 * This suite adds the 'thread' case (general threads) which was previously untested.
 *
 * CS-GEN-002: additive — no existing assertion changed. // CS-GEN-002
 * CS-TS-003: cross-surface parity with portal feed. // CS-TS-003
 * BUG-017-002 // AC-MSG-013-02 // ADR-005 // ADR-006 // EPIC-016 // CS-GEN-003
 */
describe("[BUG-017-002] new_message link routing uses the real linkedItemType from appendMessage", () => {
  /**
   * [BUG-017-002 / AC-MSG-013-02] Engagement-thread new_message:
   * linkedItemType='engagement', linkedItemId=engagementId → /engagements/<id>/messages
   * This is the REAL value appendMessage() emits for engagement threads after the fix.
   * CS-TS-003: matches portal resolvePortalHref for the same type. // CS-TS-003
   */
  it("[BUG-017-002 / AC-MSG-013-02] engagement-thread new_message: View messages link → /engagements/<id>/messages", () => {
    render(<NotificationsIndicator notifications={[MOCK_NEW_MESSAGE_NOTIF]} />);

    const link = screen.getByTestId(`notification-link-${MOCK_NEW_MESSAGE_NOTIF.id}`);
    expect(link).toBeInTheDocument();
    // BUG-017-002: link must route to /messages sub-area, not engagement root
    expect(link).toHaveAttribute("href", `/engagements/${MOCK_ENGAGEMENT_ID}/messages`);
    expect(link).toHaveTextContent("View messages");
  });

  /**
   * [BUG-017-002 / AC-MSG-013-02] General-thread new_message:
   * linkedItemType='thread', linkedItemId=threadId → /messages/<threadId>
   * This is the REAL value appendMessage() emits for general threads after the fix.
   * This case was COMPLETELY ABSENT before BUG-017-002 — the previous renderer had no
   * 'thread' branch, so general-thread notifications rendered without any link.
   * CS-GEN-002: additive — new 'thread' branch; 'engagement' branch unchanged. // CS-GEN-002
   * CS-TS-003: matches portal resolvePortalHref for the same type. // CS-TS-003
   */
  it("[BUG-017-002 / AC-MSG-013-02] general-thread new_message: View messages link → /messages/<threadId>", () => {
    render(<NotificationsIndicator notifications={[MOCK_NEW_MESSAGE_GENERAL_THREAD_NOTIF]} />);

    const link = screen.getByTestId(
      `notification-link-${MOCK_NEW_MESSAGE_GENERAL_THREAD_NOTIF.id}`,
    );
    expect(link).toBeInTheDocument();
    // BUG-017-002: general-thread link must route to /messages/<threadId>
    expect(link).toHaveAttribute("href", `/messages/${MOCK_THREAD_ID}`);
    expect(link).toHaveTextContent("View messages");
  });

  /**
   * [BUG-017-002 / AC-MSG-013-02] General-thread new_message renders in the feed
   * with data-notification-type="new_message".
   * CS-TS-003: both thread kinds render as new_message type items. // CS-TS-003
   */
  it("[BUG-017-002 / AC-MSG-013-02] general-thread new_message renders in the feed with correct type attribute", () => {
    render(<NotificationsIndicator notifications={[MOCK_NEW_MESSAGE_GENERAL_THREAD_NOTIF]} />);

    const item = screen.getByTestId(
      `notification-item-${MOCK_NEW_MESSAGE_GENERAL_THREAD_NOTIF.id}`,
    );
    expect(item).toBeInTheDocument();
    expect(item).toHaveAttribute("data-notification-type", "new_message");
  });

  /**
   * [BUG-017-002 / CS-GEN-002] Both thread kinds can appear in the same feed simultaneously.
   * An accountant with both engagement-thread and general-thread notifications sees both
   * with the correct links. CS-GEN-002: additive — both coexist without conflict. // CS-GEN-002
   */
  it("[BUG-017-002 / CS-GEN-002] both engagement-thread and general-thread new_message items coexist in the feed", () => {
    render(
      <NotificationsIndicator
        notifications={[
          MOCK_NEW_MESSAGE_NOTIF,               // engagement thread
          MOCK_NEW_MESSAGE_GENERAL_THREAD_NOTIF, // general thread
        ]}
      />,
    );

    // Engagement-thread item with correct link
    const engagementLink = screen.getByTestId(
      `notification-link-${MOCK_NEW_MESSAGE_NOTIF.id}`,
    );
    expect(engagementLink).toHaveAttribute(
      "href",
      `/engagements/${MOCK_ENGAGEMENT_ID}/messages`,
    );

    // General-thread item with correct link
    const generalLink = screen.getByTestId(
      `notification-link-${MOCK_NEW_MESSAGE_GENERAL_THREAD_NOTIF.id}`,
    );
    expect(generalLink).toHaveAttribute("href", `/messages/${MOCK_THREAD_ID}`);
  });
});
