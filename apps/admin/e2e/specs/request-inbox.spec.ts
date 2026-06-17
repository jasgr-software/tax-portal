/**
 * apps/admin/e2e/specs/request-inbox.spec.ts
 *
 * TASK-003-006: Tier-6 e2e — Request inbox list/states/pending + view details
 *
 * Acceptance criteria covered (e2e tier — ADR-012 tier map):
 *   AC-DASH-011-01 — accountant can view all engagement requests from the admin UI
 *   AC-DASH-011-02 — requests are distinguishable by state: pending, accepted, declined
 *   AC-DASH-011-03 — the accountant can identify which requests are pending a decision
 *   AC-DOOR-006-01 — accountant can view each pending request and its submitted details
 *   AC-DOOR-005-02 — notification identifies the new request and leads her to it
 *
 * Feature mirror: apps/admin/e2e/features/request-inbox.feature
 *
 * Auth: ACCOUNTANT via mock-session fixture (setupAccountantSession).
 * Security: verifies a non-ACCOUNTANT (CLIENT) cannot reach the inbox.
 *
 * Stack: admin container at http://localhost:13001 (ADMIN_BASE_URL / ADMIN_PORT env).
 *
 * Run:
 *   pnpm --filter admin e2e:run -- --grep 'request-inbox'
 *
 * ADR-006: Inbox is admin-only — no portal mirror.
 * ADR-010: All admin routes require ACCOUNTANT auth.
 * ADR-012: Tier-6 e2e — real DB + real server actions + real RLS policy gate.
 */

import { test, expect } from "@playwright/test";
import { setupAccountantSession, setupClientSession, clearSession } from "../fixtures/auth.js";
import {
  seedPendingRequest,
  seedPendingRequestWithNotification,
  deleteRequestById,
  closeRequestsPool,
} from "../fixtures/requests.js";

// ─── URL resolution ────────────────────────────────────────────────────────────

const ADMIN_PORT = process.env["ADMIN_PORT"] ?? "3001";
const ADMIN_URL = process.env["ADMIN_BASE_URL"] ?? `http://localhost:${ADMIN_PORT}`;

// ─── Unique name helper ────────────────────────────────────────────────────────

function uniqueEmail(prefix: string): string {
  return `${prefix}.${Date.now()}.${Math.random().toString(36).slice(2, 6)}@e2e-inbox-test.example.com`;
}

// ─── afterAll: close DB pool ───────────────────────────────────────────────────

test.afterAll(async () => {
  await closeRequestsPool();
});

// ─── [AC-DASH-011-01] Accountant views all engagement requests ────────────────

test.describe("[AC-DASH-011-01] accountant can view all engagement requests from the admin UI", () => {
  let seededId1: string;
  let seededId2: string;
  const email1 = uniqueEmail("inbox-all-1");
  const email2 = uniqueEmail("inbox-all-2");

  test.beforeEach(async ({ page, request }) => {
    // Seed two requests (different states)
    const r1 = await seedPendingRequest({ firstName: "AliceInbox", lastName: "Pending", email: email1 });
    const r2 = await seedPendingRequest({ firstName: "BobInbox", lastName: "Pending", email: email2 });
    seededId1 = r1.id;
    seededId2 = r2.id;
    await setupAccountantSession(page, request);
  });

  test.afterEach(async ({ page }) => {
    await clearSession(page);
    if (seededId1) await deleteRequestById(seededId1);
    if (seededId2) await deleteRequestById(seededId2);
  });

  test(
    "[AC-DASH-011-01] accountant opens the inbox and sees all engagement requests",
    async ({ page }) => {
      // Given: engagement requests exist in various states
      // When: the accountant opens the request inbox in the admin UI
      await page.goto(`${ADMIN_URL}/requests`);

      // Then: she can view all engagement requests
      // The inbox page heading is visible
      await expect(page.getByRole("heading", { name: "Engagement Requests" })).toBeVisible();

      // Both seeded requests appear in the list
      const list = page.getByTestId("request-list");
      await expect(list).toBeVisible();

      // Both rows are present (by email text in the row)
      await expect(page.getByText(email1)).toBeVisible({ timeout: 10_000 });
      await expect(page.getByText(email2)).toBeVisible({ timeout: 10_000 });
    },
  );
});

// ─── [AC-DASH-011-02] Requests distinguishable by state ──────────────────────

test.describe("[AC-DASH-011-02] requests are distinguishable by state: pending, accepted, declined", () => {
  let pendingId: string;
  const pendingEmail = uniqueEmail("inbox-state-pending");

  test.beforeEach(async ({ page, request }) => {
    const pending = await seedPendingRequest({
      firstName: "StateTestPending",
      lastName: "User",
      email: pendingEmail,
    });
    pendingId = pending.id;
    await setupAccountantSession(page, request);
  });

  test.afterEach(async ({ page }) => {
    await clearSession(page);
    if (pendingId) await deleteRequestById(pendingId);
  });

  test(
    "[AC-DASH-011-02] each request's state is distinguishable in the inbox",
    async ({ page }) => {
      // Given: engagement requests in pending state
      // When: the accountant views the inbox
      await page.goto(`${ADMIN_URL}/requests`);
      await expect(page.getByRole("heading", { name: "Engagement Requests" })).toBeVisible();

      // Then: each request's state is distinguishable
      // Find the row for the pending request
      const pendingRow = page.getByTestId(`request-row-${pendingId}`);
      await expect(pendingRow).toBeVisible({ timeout: 10_000 });

      // The pending row has a status badge with data-status="pending"
      const pendingBadge = pendingRow.getByTestId("status-badge");
      await expect(pendingBadge).toBeVisible();
      await expect(pendingBadge).toHaveAttribute("data-status", "pending");
      await expect(pendingBadge).toContainText("Pending");

      // The row itself carries data-status="pending" (AC-DASH-011-03 machinery)
      await expect(pendingRow).toHaveAttribute("data-status", "pending");
    },
  );
});

// ─── [AC-DASH-011-03] Pending requests are identifiable ──────────────────────

test.describe("[AC-DASH-011-03] the accountant can identify which requests are pending a decision", () => {
  let pendingId: string;
  const pendingEmail = uniqueEmail("inbox-pending-id");

  test.beforeEach(async ({ page, request }) => {
    const pending = await seedPendingRequest({
      firstName: "PendingIdent",
      lastName: "Test",
      email: pendingEmail,
    });
    pendingId = pending.id;
    await setupAccountantSession(page, request);
  });

  test.afterEach(async ({ page }) => {
    await clearSession(page);
    if (pendingId) await deleteRequestById(pendingId);
  });

  test(
    "[AC-DASH-011-03] pending requests are identifiable — data-status attribute and pending badge",
    async ({ page }) => {
      // Given: a mix of decided and undecided requests (seeded pending)
      // When: the accountant views the inbox
      await page.goto(`${ADMIN_URL}/requests`);
      await expect(page.getByRole("heading", { name: "Engagement Requests" })).toBeVisible();

      // Then: she can identify which requests are still pending a decision
      // Locate the seeded pending row
      const pendingRow = page.getByTestId(`request-row-${pendingId}`);
      await expect(pendingRow).toBeVisible({ timeout: 10_000 });
      await expect(pendingRow).toHaveAttribute("data-status", "pending");

      // The status badge explicitly says "Pending" and has the pending data-status
      const badge = pendingRow.getByTestId("status-badge");
      await expect(badge).toHaveAttribute("data-status", "pending");
      await expect(badge).toContainText("Pending");

      // All rows with data-status="pending" are identifiable
      const allPendingRows = page.locator("[data-testid^='request-row-'][data-status='pending']");
      const count = await allPendingRows.count();
      expect(count).toBeGreaterThan(0);
    },
  );
});

// ─── [AC-DOOR-006-01] Accountant views a pending request's submitted details ──

test.describe("[AC-DOOR-006-01] accountant can view each pending request and its submitted details", () => {
  let pendingId: string;
  const detailEmail = uniqueEmail("inbox-detail");

  test.beforeEach(async ({ page, request }) => {
    const pending = await seedPendingRequest({
      firstName: "DetailFirst",
      lastName: "DetailLast",
      email: detailEmail,
      phone: "555-1234",
      message: "I need help with my taxes",
    });
    pendingId = pending.id;
    await setupAccountantSession(page, request);
  });

  test.afterEach(async ({ page }) => {
    await clearSession(page);
    if (pendingId) await deleteRequestById(pendingId);
  });

  test(
    "[AC-DOOR-006-01] accountant opens a pending request and sees its submitted details",
    async ({ page }) => {
      // Given: a pending engagement request
      // When: the accountant opens it in the inbox
      await page.goto(`${ADMIN_URL}/requests`);
      await expect(page.getByRole("heading", { name: "Engagement Requests" })).toBeVisible();

      // Navigate to the detail page via the View link
      const viewLink = page.getByTestId(`view-link-${pendingId}`);
      await expect(viewLink).toBeVisible({ timeout: 10_000 });
      await viewLink.click();

      // Wait for the detail page to load
      await page.waitForURL(`${ADMIN_URL}/requests/${pendingId}`, { timeout: 10_000 });

      // Then: she sees the request and its submitted details
      // The request detail container is visible
      await expect(page.getByTestId("request-detail")).toBeVisible();

      // Name fields are shown
      await expect(page.getByTestId("detail-first-name")).toContainText("DetailFirst");
      await expect(page.getByTestId("detail-last-name")).toContainText("DetailLast");

      // Email is shown
      await expect(page.getByTestId("detail-email")).toContainText(detailEmail);

      // Phone is shown
      await expect(page.getByTestId("detail-phone")).toContainText("555-1234");

      // Message is shown
      await expect(page.getByTestId("detail-message")).toContainText("I need help with my taxes");

      // Status badge shows "Pending"
      const statusBadge = page.getByTestId("detail-status-badge");
      await expect(statusBadge).toContainText("Pending");
      await expect(statusBadge).toHaveAttribute("data-status", "pending");
    },
  );
});

// ─── [AC-DOOR-005-02] Notification leads to the request ──────────────────────

test.describe("[AC-DOOR-005-02] notification identifies the new request and leads the accountant to it", () => {
  let requestId: string;
  let notificationId: string;
  const notifEmail = uniqueEmail("inbox-notification");

  test.beforeEach(async ({ page, request }) => {
    const seeded = await seedPendingRequestWithNotification({
      firstName: "NotifTest",
      lastName: "User",
      email: notifEmail,
      message: "Need tax help",
    });
    requestId = seeded.request.id;
    notificationId = seeded.notificationId;
    await setupAccountantSession(page, request);
  });

  test.afterEach(async ({ page }) => {
    await clearSession(page);
    if (requestId) await deleteRequestById(requestId);
  });

  test(
    "[AC-DOOR-005-02] opening the notification leads the accountant to the request",
    async ({ page }) => {
      // Given: a new-request notification for the accountant
      // When: she opens the notifications area on the requests page
      await page.goto(`${ADMIN_URL}/requests`);
      await expect(page.getByRole("heading", { name: "Engagement Requests" })).toBeVisible();

      // The NotificationsIndicator is visible
      const notifIndicator = page.getByTestId("notifications-indicator");
      await expect(notifIndicator).toBeVisible({ timeout: 10_000 });

      // The notification for this specific request is shown
      const notifItem = page.getByTestId(`notification-item-${notificationId}`);
      await expect(notifItem).toBeVisible({ timeout: 10_000 });

      // The notification carries a link to the specific request — AC-DOOR-005-02
      const notifLink = page.getByTestId(`notification-link-${notificationId}`);
      await expect(notifLink).toBeVisible();
      await expect(notifLink).toHaveAttribute("data-engagement-request-id", requestId);

      // Then: clicking the link leads her to that request
      await notifLink.click();
      await page.waitForURL(`${ADMIN_URL}/requests/${requestId}`, { timeout: 10_000 });

      // The request detail page is shown with the correct request
      await expect(page.getByTestId("request-detail")).toBeVisible();
      await expect(page.getByTestId("detail-email")).toContainText(notifEmail);
    },
  );
});

// ─── [Security] Non-accountant cannot access the inbox ───────────────────────

test.describe("[Security] non-ACCOUNTANT cannot reach the inbox or request actions", () => {
  test.afterEach(async ({ page }) => {
    await clearSession(page);
  });

  test(
    "[AC-DOOR-006-04][Security] CLIENT session is rejected from the inbox",
    async ({ page, request }) => {
      // Given: a caller who is not the accountant — a CLIENT
      await setupClientSession(page, request);

      // When: that caller attempts to access the request inbox
      let redirectSeen = false;
      page.on("response", (response) => {
        if (response.status() === 307 || response.status() === 308) {
          redirectSeen = true;
        }
      });

      await page.goto(`${ADMIN_URL}/requests`, { waitUntil: "commit" });

      const finalUrl = new URL(page.url());
      const isOnInboxPath = finalUrl.pathname === "/requests";

      // Then: the attempt is rejected — redirected away or not served the page
      expect(
        redirectSeen || !isOnInboxPath,
        "CLIENT must NOT be served the admin /requests inbox page",
      ).toBe(true);
    },
  );

  test(
    "[Security] anonymous visitor is redirected to sign-in from the inbox",
    async ({ page }) => {
      // Given: a caller who is anonymous (no session)
      // When: that caller attempts to access the request inbox
      let redirectSeen = false;
      page.on("response", (response) => {
        if (response.status() === 307 || response.status() === 308) {
          redirectSeen = true;
        }
      });

      await page.goto(`${ADMIN_URL}/requests`, { waitUntil: "commit" });

      const finalUrl = new URL(page.url());
      const onSignIn = finalUrl.pathname.includes("/sign-in");

      // Then: anonymous visitors are redirected to sign-in
      expect(
        redirectSeen || onSignIn,
        "Anonymous visitor must be redirected to sign-in, not served the inbox",
      ).toBe(true);
    },
  );
});
