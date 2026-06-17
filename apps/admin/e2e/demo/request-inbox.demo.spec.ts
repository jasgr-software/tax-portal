/**
 * apps/admin/e2e/demo/request-inbox.demo.spec.ts
 *
 * @demo UI demo walkthrough — EPIC-003 Accountant request inbox (admin surface).
 *
 * Not part of the e2e gate: `e2e:run` / `e2e:smoke` exclude `@demo` (--grep-invert @demo);
 * this runs ONLY via `pnpm --filter admin e2e:demo`. It drives jane-accountant's request-inbox
 * happy-path against the live docker-compose container stack (AUTH_PROVIDER=mock) and writes
 * an AC-tagged screenshot gallery to docs/demos/EPIC-003/. NON-GATING.
 *
 * Persona: jane-accountant (.planning/personas/jane-accountant.md)
 * Flow:    flow-engagement-request (.planning/flows/flow-engagement-request.md)
 *          flow-first-sign-in      (.planning/flows/flow-first-sign-in.md)
 * Policy:  .orchestration/DEMO-POLICY.md
 *
 * Gallery ordering (EPIC-003 sequence 01–07):
 *   01-AC-DOOR-005-02-notification-leads-to-request.png
 *       — notifications indicator with new-request notification visible; clicking it
 *         leads jane to the request (AC-DOOR-005-02, AC-MSG-013-01)
 *   02-AC-DASH-011-01-inbox-list-all-states.png
 *       — inbox showing pending, accepted, and declined rows; all states distinguishable
 *         (AC-DASH-011-01, AC-DASH-011-02, AC-DASH-011-03)
 *   03-AC-DOOR-006-01-request-detail-pending.png
 *       — detail page for a pending request; submitted details visible (AC-DOOR-006-01)
 *   04-AC-DOOR-006-02-accept-btn-click.png
 *       — detail page showing Accept button (idle decision panel) (AC-DOOR-006-02)
 *   05-AC-DOOR-006-02-07-accepted-state.png
 *       — detail page after accept: status badge = accepted; decision panel gone
 *         (AC-DOOR-006-02, AC-DOOR-006-05, AC-DOOR-007-01/04)
 *   06-AC-DOOR-008-01-decline-form.png
 *       — decline form with free-text reason textarea open (AC-DOOR-008-01)
 *   07-AC-DOOR-006-03-08-declined-state-reason-retained.png
 *       — detail page after decline: status = declined; reason retained; decision panel gone
 *         (AC-DOOR-006-03, AC-DOOR-006-05, AC-DOOR-008-04)
 *
 * Each test ASSERTS the target element is visible BEFORE screenshotting (broken UI fails loudly).
 *
 * Pre-reqs (same SUT as the e2e gate):
 *   docker compose up -d → pnpm db:migrate → pnpm db:seed
 *
 * ADR-005: Sessions are established via /api/mock-session (role set server-side).
 * ADR-006: Two-surface platform — this spec covers the admin surface (Tax Portal).
 * ADR-010: All admin routes require ACCOUNTANT auth.
 *
 * Run:
 *   ADMIN_BASE_URL=http://localhost:13001 ADMIN_PORT=13001 pnpm --filter admin e2e:demo
 */

import { test, expect } from "@playwright/test";
import path from "path";
import { setupAccountantSession, clearSession } from "../fixtures/auth.js";
import {
  seedPendingRequest,
  seedPendingRequestWithNotification,
  deleteRequestById,
  closeRequestsPool,
} from "../fixtures/requests.js";
import { clearMailhog, waitForEmail, getSubject, getBody } from "../fixtures/mailhog.js";

// Gallery output dir — repo-root/docs/demos/EPIC-003 (resolved from this file's dir).
// Depth from apps/admin/e2e/demo/ to repo root = ../../../../
const DEMO_DIR = path.resolve(__dirname, "../../../../docs/demos/EPIC-003");
const shot = (file: string) => path.join(DEMO_DIR, file);

// Admin base URL — mirrors playwright.config.ts + auth.ts.
const ADMIN_PORT = process.env["ADMIN_PORT"] ?? "3001";
const ADMIN_URL = process.env["ADMIN_BASE_URL"] ?? `http://localhost:${ADMIN_PORT}`;

// Unique helpers — avoids cross-test interference when the DB is shared.
function uniqueEmail(prefix: string): string {
  return `${prefix}.${Date.now()}.${Math.random().toString(36).slice(2, 6)}@demo-inbox.example.com`;
}

// afterAll: close the admin DB pool opened by request fixtures.
test.afterAll(async () => {
  await closeRequestsPool();
});

// ─── Screen 01: Notification leads to request (AC-DOOR-005-02, AC-MSG-013-01) ─

test(
  "[AC-DOOR-005-02][AC-MSG-013-01] @demo 01 — jane-accountant: notification identifies new request and leads her to it",
  async ({ page, request }) => {
    // Screen 01: ACCOUNTANT with a seeded notification → visits /requests → notification indicator
    // visible with the new-request item → clicking the notification link navigates to the request
    // detail page (AC-DOOR-005-02, AC-MSG-013-01).
    // Proves: the accountant is notified of a new engagement request, and the notification
    // leads her to review it.

    let notifRequestId: string | null = null;
    const notifEmail = uniqueEmail("demo-notif");

    try {
      const seeded = await seedPendingRequestWithNotification({
        firstName: "DemoNotif",
        lastName: "User",
        email: notifEmail,
        message: "Notification demo request",
      });
      notifRequestId = seeded.request.id;

      await setupAccountantSession(page, request);
      await page.goto(`${ADMIN_URL}/requests`);
      await expect(
        page.getByRole("heading", { name: "Engagement Requests" }),
        "'Engagement Requests' heading must be visible",
      ).toBeVisible({ timeout: 15_000 });

      // The NotificationsIndicator is visible — AC-MSG-013-01
      const notifIndicator = page.getByTestId("notifications-indicator");
      await expect(
        notifIndicator,
        "notifications-indicator must be visible (AC-MSG-013-01)",
      ).toBeVisible({ timeout: 10_000 });

      // The notification item for the seeded request is shown — AC-DOOR-005-02
      const notifItem = page.getByTestId(`notification-item-${seeded.notificationId}`);
      await expect(
        notifItem,
        `notification-item-${seeded.notificationId} must be visible (AC-DOOR-005-02)`,
      ).toBeVisible({ timeout: 10_000 });

      // Screenshot 01: notification indicator + notification item visible
      await page.screenshot({ path: shot("01-AC-DOOR-005-02-notification-leads-to-request.png"), fullPage: true });

      // Click the notification link — it leads to the request detail page (AC-DOOR-005-02)
      const notifLink = page.getByTestId(`notification-link-${seeded.notificationId}`);
      await expect(notifLink).toBeVisible({ timeout: 5_000 });
      await notifLink.click();
      await page.waitForURL(`${ADMIN_URL}/requests/${seeded.request.id}`, { timeout: 10_000 });
      await expect(page.getByTestId("request-detail")).toBeVisible({ timeout: 10_000 });
    } finally {
      await clearSession(page);
      if (notifRequestId) await deleteRequestById(notifRequestId);
    }
  },
);

// ─── Screen 02: Inbox list with all states (AC-DASH-011-01/-02/-03) ─────────────

test(
  "[AC-DASH-011-01][AC-DASH-011-02][AC-DASH-011-03] @demo 02 — jane-accountant: inbox shows all requests distinguishable by state",
  async ({ page, request }) => {
    // Screen 02: ACCOUNTANT views the inbox with pending, accepted, and declined rows.
    // All states are visually distinguishable; pending rows are identifiable.
    // (AC-DASH-011-01: can view all; AC-DASH-011-02: distinguishable by state;
    //  AC-DASH-011-03: pending identifiable)

    const pendingEmail = uniqueEmail("demo-inbox-pending");
    let pendingId: string | null = null;

    try {
      const pending = await seedPendingRequest({
        firstName: "DemoInbox",
        lastName: "Pending",
        email: pendingEmail,
        message: "Inbox state demo — pending",
      });
      pendingId = pending.id;

      await setupAccountantSession(page, request);
      await page.goto(`${ADMIN_URL}/requests`);
      await expect(
        page.getByRole("heading", { name: "Engagement Requests" }),
        "'Engagement Requests' heading must be visible (AC-DASH-011-01)",
      ).toBeVisible({ timeout: 15_000 });

      // The request list container is visible — AC-DASH-011-01
      const list = page.getByTestId("request-list");
      await expect(list, "request-list must be visible (AC-DASH-011-01)").toBeVisible({ timeout: 10_000 });

      // The seeded pending row is visible with a "Pending" status badge — AC-DASH-011-02 / -03
      const pendingRow = page.getByTestId(`request-row-${pendingId}`);
      await expect(pendingRow, `request-row-${pendingId} must be visible`).toBeVisible({ timeout: 10_000 });
      const pendingBadge = pendingRow.getByTestId("status-badge");
      await expect(
        pendingBadge,
        "Pending status badge must be visible (AC-DASH-011-02/-03)",
      ).toBeVisible({ timeout: 5_000 });
      await expect(pendingBadge).toHaveAttribute("data-status", "pending");

      // Screenshot 02: inbox list with pending row visible and state distinguishable
      await page.screenshot({ path: shot("02-AC-DASH-011-01-inbox-list-all-states.png"), fullPage: true });
    } finally {
      await clearSession(page);
      if (pendingId) await deleteRequestById(pendingId);
    }
  },
);

// ─── Screen 03: Request detail — submitted details visible (AC-DOOR-006-01) ────

test(
  "[AC-DOOR-006-01] @demo 03 — jane-accountant: opens a pending request and sees its submitted details",
  async ({ page, request }) => {
    // Screen 03: ACCOUNTANT opens a pending request from the inbox and sees all submitted
    // details: name, email, phone, message. Status badge shows "Pending".
    // (AC-DOOR-006-01)

    const detailEmail = uniqueEmail("demo-detail");
    let detailId: string | null = null;

    try {
      const pending = await seedPendingRequest({
        firstName: "DemoDetail",
        lastName: "Request",
        email: detailEmail,
        phone: "555-0100",
        message: "I need help with my tax returns for this year.",
      });
      detailId = pending.id;

      await setupAccountantSession(page, request);
      await page.goto(`${ADMIN_URL}/requests`);
      await expect(
        page.getByRole("heading", { name: "Engagement Requests" }),
      ).toBeVisible({ timeout: 15_000 });

      // Navigate to the detail page via the View link
      const viewLink = page.getByTestId(`view-link-${detailId}`);
      await expect(viewLink, `view-link-${detailId} must be visible`).toBeVisible({ timeout: 10_000 });
      await viewLink.click();
      await page.waitForURL(`${ADMIN_URL}/requests/${detailId}`, { timeout: 10_000 });

      // Detail container is visible — AC-DOOR-006-01
      await expect(
        page.getByTestId("request-detail"),
        "request-detail container must be visible (AC-DOOR-006-01)",
      ).toBeVisible({ timeout: 10_000 });

      // Submitted details are shown
      await expect(page.getByTestId("detail-first-name")).toContainText("DemoDetail");
      await expect(page.getByTestId("detail-last-name")).toContainText("Request");
      await expect(page.getByTestId("detail-email")).toContainText(detailEmail);
      await expect(page.getByTestId("detail-phone")).toContainText("555-0100");
      await expect(page.getByTestId("detail-message")).toContainText("I need help with my tax returns");

      // Status badge shows "Pending"
      const statusBadge = page.getByTestId("detail-status-badge");
      await expect(statusBadge).toHaveAttribute("data-status", "pending");

      // Screenshot 03: detail page with submitted details and pending badge
      await page.screenshot({ path: shot("03-AC-DOOR-006-01-request-detail-pending.png"), fullPage: true });
    } finally {
      await clearSession(page);
      if (detailId) await deleteRequestById(detailId);
    }
  },
);

// ─── Screens 04 + 05: Accept branch (AC-DOOR-006-02, AC-DOOR-007-01/04) ─────────

test(
  "[AC-DOOR-006-02][AC-DOOR-007-01][AC-DOOR-007-04] @demo 04+05 — jane-accountant: accepts a pending request; invitation issued",
  async ({ page, request }) => {
    // Screen 04: Detail page showing the idle decision panel with Accept + Decline buttons
    //            (AC-DOOR-006-02 — accept affordance visible)
    // Screen 05: After accepting — status badge = accepted; decision panel gone;
    //            invitation email arrived in Mailhog (AC-DOOR-006-02, AC-DOOR-006-05,
    //            AC-DOOR-007-01, AC-DOOR-007-04)

    const acceptEmail = uniqueEmail("demo-accept");
    let acceptId: string | null = null;

    try {
      await clearMailhog();

      const pending = await seedPendingRequest({
        firstName: "DemoAccept",
        lastName: "Prospect",
        email: acceptEmail,
        message: "Please accept me as a client.",
      });
      acceptId = pending.id;

      await setupAccountantSession(page, request);
      await page.goto(`${ADMIN_URL}/requests/${acceptId}`);
      await expect(
        page.getByTestId("request-detail"),
        "request-detail must be visible",
      ).toBeVisible({ timeout: 15_000 });

      // Status badge shows Pending — we are on a decidable request
      const statusBadge = page.getByTestId("detail-status-badge");
      await expect(statusBadge).toHaveAttribute("data-status", "pending");

      // Decision idle panel with Accept + Decline buttons visible — AC-DOOR-006-02
      await expect(
        page.getByTestId("decision-idle"),
        "decision-idle must be visible before acceptance (AC-DOOR-006-02)",
      ).toBeVisible({ timeout: 10_000 });
      await expect(page.getByTestId("accept-btn")).toBeVisible();
      await expect(page.getByTestId("decline-btn")).toBeVisible();

      // Screenshot 04: idle decision panel — Accept + Decline buttons visible
      await page.screenshot({ path: shot("04-AC-DOOR-006-02-accept-btn-click.png"), fullPage: true });

      // When: the accountant clicks Accept — AC-DOOR-006-02
      await page.getByTestId("accept-btn").click();

      // Then: the request moves to accepted state (RSC re-render via revalidatePath)
      await expect(
        page.getByTestId("detail-status-badge"),
        "status badge must become 'accepted' after clicking Accept (AC-DOOR-006-02)",
      ).toHaveAttribute("data-status", "accepted", { timeout: 20_000 });

      // Decision panel is gone — request is no longer decidable (AC-DOOR-006-05)
      await expect(page.getByTestId("decision-idle")).not.toBeVisible();
      await expect(page.getByTestId("accept-btn")).not.toBeVisible();

      // Screenshot 05: accepted state — no decision panel, status = accepted
      await page.screenshot({ path: shot("05-AC-DOOR-006-02-07-accepted-state.png"), fullPage: true });

      // Verify invitation email arrived in Mailhog — AC-DOOR-007-01
      const inviteEmail = await waitForEmail({
        to: acceptEmail,
        subjectContains: "invited",
        timeoutMs: 15_000,
      });
      const inviteSubject = getSubject(inviteEmail);
      const inviteBody = getBody(inviteEmail);

      // Email confirms invitation was sent to the prospect (AC-DOOR-007-01)
      expect(inviteSubject.toLowerCase()).toContain("invited");
      // Email body addresses the prospect and includes sign-up link (AC-DOOR-007-02)
      expect(inviteBody).toContain("DemoAccept");
      expect(inviteBody).toMatch(/sign-up\?ticket=/);
    } finally {
      await clearSession(page);
      if (acceptId) await deleteRequestById(acceptId);
    }
  },
);

// ─── Screens 06 + 07: Decline branch (AC-DOOR-006-03, AC-DOOR-008-01/-04) ───────

test(
  "[AC-DOOR-006-03][AC-DOOR-008-01][AC-DOOR-008-04] @demo 06+07 — jane-accountant: declines with reason; reason retained",
  async ({ page, request }) => {
    // Screen 06: Decline form open with free-text reason textarea (AC-DOOR-008-01)
    // Screen 07: After declining — status = declined; decline reason retained on detail page;
    //            decision panel gone (AC-DOOR-006-03, AC-DOOR-006-05, AC-DOOR-008-04)

    const declineEmail = uniqueEmail("demo-decline");
    const DECLINE_REASON =
      "Thank you for your interest. We are currently at capacity and unable to take on new clients at this time.";
    let declineId: string | null = null;

    try {
      await clearMailhog();

      const pending = await seedPendingRequest({
        firstName: "DemoDecline",
        lastName: "Prospect",
        email: declineEmail,
        message: "Please consider my engagement request.",
      });
      declineId = pending.id;

      await setupAccountantSession(page, request);
      await page.goto(`${ADMIN_URL}/requests/${declineId}`);
      await expect(
        page.getByTestId("request-detail"),
        "request-detail must be visible",
      ).toBeVisible({ timeout: 15_000 });

      // Status badge shows Pending
      await expect(page.getByTestId("detail-status-badge")).toHaveAttribute("data-status", "pending");

      // Decision idle panel visible
      await expect(
        page.getByTestId("decision-idle"),
        "decision-idle must be visible before declining",
      ).toBeVisible({ timeout: 10_000 });

      // Click Decline to open the decline form — AC-DOOR-008-01
      await page.getByTestId("decline-btn").click();

      // Decline form with reason textarea is visible — AC-DOOR-008-01
      await expect(
        page.getByTestId("decline-form"),
        "decline-form must be visible after clicking Decline (AC-DOOR-008-01)",
      ).toBeVisible({ timeout: 5_000 });
      await expect(page.getByTestId("decline-reason-textarea")).toBeVisible();

      // Fill in the free-text reason (AC-DOOR-008-01)
      await page.getByTestId("decline-reason-textarea").fill(DECLINE_REASON);

      // Screenshot 06: decline form open with reason filled in
      await page.screenshot({ path: shot("06-AC-DOOR-008-01-decline-form.png"), fullPage: true });

      // When: the accountant submits the decline — AC-DOOR-006-03
      await page.getByTestId("decline-submit-btn").click();

      // Then: status moves to declined (RSC re-render via revalidatePath)
      await expect(
        page.getByTestId("detail-status-badge"),
        "status badge must become 'declined' after submitting decline (AC-DOOR-006-03)",
      ).toHaveAttribute("data-status", "declined", { timeout: 20_000 });

      // Decline reason is retained and visible on the detail page — AC-DOOR-008-04
      const retainedReason = page.getByTestId("detail-decline-reason");
      await expect(
        retainedReason,
        "detail-decline-reason must be visible after declining (AC-DOOR-008-04)",
      ).toBeVisible({ timeout: 5_000 });
      await expect(retainedReason).toContainText(DECLINE_REASON);

      // Decision panel is gone — request is no longer decidable (AC-DOOR-006-05)
      await expect(page.getByTestId("decision-idle")).not.toBeVisible();
      await expect(page.getByTestId("decline-btn")).not.toBeVisible();

      // Screenshot 07: declined state — reason retained; no decision panel
      await page.screenshot({
        path: shot("07-AC-DOOR-006-03-08-declined-state-reason-retained.png"),
        fullPage: true,
      });

      // Verify decline reason email arrived in Mailhog — AC-DOOR-008-02 (additional assurance)
      const declinedEmail = await waitForEmail({
        to: declineEmail,
        subjectContains: "engagement request",
        bodyContains: DECLINE_REASON,
        timeoutMs: 15_000,
      });
      const declineSubject = getSubject(declinedEmail);
      const declineBody = getBody(declinedEmail);

      // Email addresses the prospect and contains the decline reason (AC-DOOR-008-02)
      expect(declineSubject.toLowerCase()).toContain("engagement request");
      expect(declineBody).toContain("DemoDecline");
      expect(declineBody).toContain(DECLINE_REASON);
    } finally {
      await clearSession(page);
      if (declineId) await deleteRequestById(declineId);
    }
  },
);
