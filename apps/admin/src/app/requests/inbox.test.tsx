/**
 * apps/admin/src/app/requests/inbox.test.tsx
 *
 * Tier 2/5 component tests for the engagement request inbox UI.
 *
 * AC-DASH-011-01: Accountant can view all engagement requests from the admin UI.
 * AC-DASH-011-02: Engagement requests are distinguishable by state (pending/accepted/declined).
 * AC-DASH-011-03: The accountant can identify which requests are pending a decision.
 * AC-DOOR-006-01: Accountant can view each pending engagement request and its submitted
 *   details (name, email, phone, selected services, message).
 *
 * Tests specified in the task's "Tests to Write First":
 *   1. [AC-DASH-011-01] Inbox lists all requests
 *   2. [AC-DASH-011-02] Requests show pending/accepted/declined state badges
 *   3. [AC-DASH-011-03] Pending requests are identifiable (distinct badge/attribute)
 *   4. [AC-DOOR-006-01] Request detail renders submitted details
 *
 * Strategy:
 *   - Render client-compatible components directly (RequestList, RequestDetail).
 *   - These are server components with no 'use client' directive and no hooks —
 *     they can be rendered in jsdom via @testing-library/react without mocking.
 *   - No server actions, no DB — tests focus on component behavior and rendering.
 *
 * // DECISION (TASK-003-004): RequestList and RequestDetail are pure server components
 * // (no hooks, no state) — rendering them directly in jsdom works without any
 * // server-action or DB mocking. This mirrors the strategy used for ServiceList
 * // when it was before the 'use client' directive was added.
 */

import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { EngagementRequestItem } from "@tax-portal/db";

// ─── Import components under test ─────────────────────────────────────────────

import { RequestList } from "./_components/RequestList.js";
import { RequestDetail } from "./_components/RequestDetail.js";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const MOCK_REQ_ID_1 = "req-001-aaaa-bbbb-cccc-000000000001";
const MOCK_REQ_ID_2 = "req-002-aaaa-bbbb-cccc-000000000002";
const MOCK_REQ_ID_3 = "req-003-aaaa-bbbb-cccc-000000000003";
const MOCK_SVC_ID_1 = "svc-001-aaaa-bbbb-cccc-000000000001";
const MOCK_SVC_ID_2 = "svc-002-aaaa-bbbb-cccc-000000000002";

const BASE_DATE = new Date("2026-06-01T10:00:00Z");

const PENDING_REQUEST: EngagementRequestItem = {
  id: MOCK_REQ_ID_1,
  firstName: "Alice",
  lastName: "Tester",
  email: "alice@example.com",
  phone: "555-1234",
  message: "I need help with my taxes.",
  status: "pending",
  declineReason: null,
  invitationTicket: null,
  decidedAt: null,
  createdAt: BASE_DATE,
  updatedAt: BASE_DATE,
  services: [
    { serviceId: MOCK_SVC_ID_1, serviceName: "Individual Tax Return" },
    { serviceId: MOCK_SVC_ID_2, serviceName: "Quarterly Estimated Taxes" },
  ],
};

const ACCEPTED_REQUEST: EngagementRequestItem = {
  id: MOCK_REQ_ID_2,
  firstName: "Bob",
  lastName: "Smith",
  email: "bob@example.com",
  phone: null,
  message: null,
  status: "accepted",
  declineReason: null,
  invitationTicket: "invite-ticket-abc",
  decidedAt: new Date("2026-06-02T12:00:00Z"),
  createdAt: new Date("2026-06-02T09:00:00Z"),
  updatedAt: new Date("2026-06-02T12:00:00Z"),
  services: [{ serviceId: MOCK_SVC_ID_1, serviceName: "Individual Tax Return" }],
};

const DECLINED_REQUEST: EngagementRequestItem = {
  id: MOCK_REQ_ID_3,
  firstName: "Carol",
  lastName: "Jones",
  email: "carol@example.com",
  phone: "555-5678",
  message: "Please decline.",
  status: "declined",
  declineReason: "We are not accepting new clients at this time.",
  invitationTicket: null,
  decidedAt: new Date("2026-06-03T14:00:00Z"),
  createdAt: new Date("2026-06-03T08:00:00Z"),
  updatedAt: new Date("2026-06-03T14:00:00Z"),
  services: [],
};

// ─── RequestList tests ────────────────────────────────────────────────────────

describe("[AC-DASH-011-01] inbox lists all engagement requests", () => {
  it("renders all requests passed to it", () => {
    render(
      <RequestList requests={[PENDING_REQUEST, ACCEPTED_REQUEST, DECLINED_REQUEST]} />,
    );

    // Each request's name is visible (AC-DASH-011-01)
    expect(screen.getByText("Alice Tester")).toBeInTheDocument();
    expect(screen.getByText("Bob Smith")).toBeInTheDocument();
    expect(screen.getByText("Carol Jones")).toBeInTheDocument();
  });

  it("renders emails for each request", () => {
    render(
      <RequestList requests={[PENDING_REQUEST, ACCEPTED_REQUEST]} />,
    );

    expect(screen.getByText("alice@example.com")).toBeInTheDocument();
    expect(screen.getByText("bob@example.com")).toBeInTheDocument();
  });

  it("renders a View link for each request", () => {
    render(
      <RequestList requests={[PENDING_REQUEST, ACCEPTED_REQUEST]} />,
    );

    const viewLinks = screen.getAllByRole("link", { name: /view request/i });
    expect(viewLinks).toHaveLength(2);
    expect(viewLinks[0]).toHaveAttribute("href", `/requests/${MOCK_REQ_ID_1}`);
    expect(viewLinks[1]).toHaveAttribute("href", `/requests/${MOCK_REQ_ID_2}`);
  });

  it("shows empty state when no requests exist", () => {
    render(<RequestList requests={[]} />);

    expect(screen.getByTestId("empty-state")).toBeInTheDocument();
    expect(screen.getByText(/no engagement requests yet/i)).toBeInTheDocument();
  });

  it("renders all three requests when multiple exist", () => {
    render(
      <RequestList requests={[PENDING_REQUEST, ACCEPTED_REQUEST, DECLINED_REQUEST]} />,
    );

    const list = screen.getByTestId("request-list");
    expect(list).toBeInTheDocument();

    // Three rows in the list (by data-testid)
    expect(screen.getByTestId(`request-row-${MOCK_REQ_ID_1}`)).toBeInTheDocument();
    expect(screen.getByTestId(`request-row-${MOCK_REQ_ID_2}`)).toBeInTheDocument();
    expect(screen.getByTestId(`request-row-${MOCK_REQ_ID_3}`)).toBeInTheDocument();
  });
});

// ─── State badge tests ────────────────────────────────────────────────────────

describe("[AC-DASH-011-02] requests show pending/accepted/declined state badges", () => {
  it("renders a Pending badge for a pending request", () => {
    render(<RequestList requests={[PENDING_REQUEST]} />);

    const badge = screen.getByTestId("status-badge");
    expect(badge).toHaveAttribute("data-status", "pending");
    expect(badge).toHaveTextContent("Pending");
  });

  it("renders an Accepted badge for an accepted request", () => {
    render(<RequestList requests={[ACCEPTED_REQUEST]} />);

    const badge = screen.getByTestId("status-badge");
    expect(badge).toHaveAttribute("data-status", "accepted");
    expect(badge).toHaveTextContent("Accepted");
  });

  it("renders a Declined badge for a declined request", () => {
    render(<RequestList requests={[DECLINED_REQUEST]} />);

    const badge = screen.getByTestId("status-badge");
    expect(badge).toHaveAttribute("data-status", "declined");
    expect(badge).toHaveTextContent("Declined");
  });

  it("renders three distinct badges when all three statuses are present", () => {
    render(
      <RequestList requests={[PENDING_REQUEST, ACCEPTED_REQUEST, DECLINED_REQUEST]} />,
    );

    const badges = screen.getAllByTestId("status-badge");
    expect(badges).toHaveLength(3);

    const statuses = badges.map((b) => b.getAttribute("data-status"));
    // Pending requests sort first, so statuses[0] may be 'pending'
    expect(statuses).toContain("pending");
    expect(statuses).toContain("accepted");
    expect(statuses).toContain("declined");
  });

  it("[AC-DASH-011-02] pending badge is visually distinct from accepted/declined (different text content)", () => {
    render(
      <RequestList requests={[PENDING_REQUEST, ACCEPTED_REQUEST, DECLINED_REQUEST]} />,
    );

    // Each badge has distinct text
    expect(screen.getByText("Pending")).toBeInTheDocument();
    expect(screen.getByText("Accepted")).toBeInTheDocument();
    expect(screen.getByText("Declined")).toBeInTheDocument();
  });
});

// ─── Pending identifiable tests ───────────────────────────────────────────────

describe("[AC-DASH-011-03] pending requests are identifiable", () => {
  it("pending request row has data-status=pending on its row", () => {
    render(
      <RequestList requests={[PENDING_REQUEST, ACCEPTED_REQUEST]} />,
    );

    const pendingRow = screen.getByTestId(`request-row-${MOCK_REQ_ID_1}`);
    expect(pendingRow).toHaveAttribute("data-status", "pending");

    const acceptedRow = screen.getByTestId(`request-row-${MOCK_REQ_ID_2}`);
    expect(acceptedRow).toHaveAttribute("data-status", "accepted");
  });

  it("pending badge has data-status=pending and aria-label identifying it as awaiting decision", () => {
    render(<RequestList requests={[PENDING_REQUEST]} />);

    const badge = screen.getByTestId("status-badge");
    expect(badge).toHaveAttribute("data-status", "pending");
    expect(badge).toHaveAttribute("aria-label", "Pending — awaiting decision");
  });

  it("pending requests are sorted to the top when mixed with decided requests", () => {
    // Pass decided requests first, then pending — expect pending to appear first in the DOM
    render(
      <RequestList requests={[ACCEPTED_REQUEST, DECLINED_REQUEST, PENDING_REQUEST]} />,
    );

    const rows = screen.getAllByTestId(/^request-row-/);
    // The first row should be the pending one (sorted to top)
    expect(rows[0]).toHaveAttribute("data-status", "pending");
  });

  it("all pending requests are identifiable when multiple pending requests exist", () => {
    const pendingRequest2: EngagementRequestItem = {
      ...PENDING_REQUEST,
      id: "req-004-pending",
      firstName: "Dave",
      lastName: "NewClient",
      email: "dave@example.com",
    };

    render(<RequestList requests={[PENDING_REQUEST, pendingRequest2]} />);

    const pendingRows = screen
      .getAllByTestId(/^request-row-/)
      .filter((row) => row.getAttribute("data-status") === "pending");

    expect(pendingRows).toHaveLength(2);
  });

  it("non-pending requests do NOT have data-status=pending", () => {
    render(<RequestList requests={[ACCEPTED_REQUEST, DECLINED_REQUEST]} />);

    const rows = screen.getAllByTestId(/^request-row-/);
    rows.forEach((row) => {
      expect(row.getAttribute("data-status")).not.toBe("pending");
    });
  });
});

// ─── RequestDetail tests ──────────────────────────────────────────────────────

describe("[AC-DOOR-006-01] request detail renders submitted details", () => {
  it("renders the prospect's first and last name", () => {
    render(<RequestDetail request={PENDING_REQUEST} />);

    expect(screen.getByTestId("detail-first-name")).toHaveTextContent("Alice");
    expect(screen.getByTestId("detail-last-name")).toHaveTextContent("Tester");
  });

  it("renders the prospect's email", () => {
    render(<RequestDetail request={PENDING_REQUEST} />);

    const emailEl = screen.getByTestId("detail-email");
    expect(emailEl).toHaveTextContent("alice@example.com");
    expect(emailEl).toHaveAttribute("href", "mailto:alice@example.com");
  });

  it("renders the prospect's phone when provided", () => {
    render(<RequestDetail request={PENDING_REQUEST} />);

    expect(screen.getByTestId("detail-phone")).toHaveTextContent("555-1234");
  });

  it("renders 'Not provided' when phone is null", () => {
    render(<RequestDetail request={ACCEPTED_REQUEST} />);

    expect(screen.getByTestId("detail-phone-empty")).toBeInTheDocument();
    expect(screen.getByTestId("detail-phone-empty")).toHaveTextContent("Not provided");
  });

  it("renders all selected service names", () => {
    render(<RequestDetail request={PENDING_REQUEST} />);

    const servicesContainer = screen.getByTestId("detail-services");
    expect(within(servicesContainer).getByText("Individual Tax Return")).toBeInTheDocument();
    expect(within(servicesContainer).getByText("Quarterly Estimated Taxes")).toBeInTheDocument();
  });

  it("renders service chips with correct testids for each service", () => {
    render(<RequestDetail request={PENDING_REQUEST} />);

    expect(screen.getByTestId(`service-chip-${MOCK_SVC_ID_1}`)).toHaveTextContent(
      "Individual Tax Return",
    );
    expect(screen.getByTestId(`service-chip-${MOCK_SVC_ID_2}`)).toHaveTextContent(
      "Quarterly Estimated Taxes",
    );
  });

  it("renders 'None listed' when request has no services", () => {
    render(<RequestDetail request={DECLINED_REQUEST} />);

    const servicesContainer = screen.getByTestId("detail-services");
    expect(within(servicesContainer).getByText(/none listed/i)).toBeInTheDocument();
  });

  it("renders the prospect's message", () => {
    render(<RequestDetail request={PENDING_REQUEST} />);

    const messageContainer = screen.getByTestId("detail-message");
    expect(messageContainer).toHaveTextContent("I need help with my taxes.");
  });

  it("renders 'No message provided' when message is null", () => {
    render(<RequestDetail request={ACCEPTED_REQUEST} />);

    const messageContainer = screen.getByTestId("detail-message");
    expect(messageContainer).toHaveTextContent(/no message provided/i);
  });

  it("renders the status badge on the detail view", () => {
    render(<RequestDetail request={PENDING_REQUEST} />);

    const badge = screen.getByTestId("detail-status-badge");
    expect(badge).toHaveAttribute("data-status", "pending");
    expect(badge).toHaveTextContent("Pending");
  });

  it("renders a declined status badge and decline reason on a declined request", () => {
    render(<RequestDetail request={DECLINED_REQUEST} />);

    const badge = screen.getByTestId("detail-status-badge");
    expect(badge).toHaveAttribute("data-status", "declined");

    // Decline reason shown (AC-DOOR-008-04 display — retained on declined record)
    const declineReason = screen.getByTestId("detail-decline-reason");
    expect(declineReason).toHaveTextContent(
      "We are not accepting new clients at this time.",
    );
  });

  it("does NOT render decline reason section for a pending request", () => {
    render(<RequestDetail request={PENDING_REQUEST} />);

    expect(screen.queryByTestId("detail-decline-reason")).not.toBeInTheDocument();
  });

  it("renders the decision slot when provided", () => {
    render(
      <RequestDetail
        request={PENDING_REQUEST}
        decisionSlot={<div data-testid="mock-decision-slot">Accept / Decline</div>}
      />,
    );

    expect(screen.getByTestId("decision-slot")).toBeInTheDocument();
    expect(screen.getByTestId("mock-decision-slot")).toHaveTextContent("Accept / Decline");
  });

  it("does NOT render the decision slot when null", () => {
    render(<RequestDetail request={PENDING_REQUEST} decisionSlot={null} />);

    expect(screen.queryByTestId("decision-slot")).not.toBeInTheDocument();
  });

  it("detail view wrapper has data-testid=request-detail", () => {
    render(<RequestDetail request={PENDING_REQUEST} />);

    expect(screen.getByTestId("request-detail")).toBeInTheDocument();
  });
});
