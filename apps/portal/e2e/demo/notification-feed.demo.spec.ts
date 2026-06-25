/**
 * apps/portal/e2e/demo/notification-feed.demo.spec.ts
 *
 * @demo UI demo walkthrough — EPIC-016 Notification feed gallery (portal / Client Portal surface).
 *
 * Not part of the e2e gate: `e2e:run` / `e2e:smoke` exclude `@demo` (--grep-invert @demo);
 * this runs ONLY via `pnpm --filter portal e2e:demo`. It drives sarah-returning-client's
 * notification feed happy-path against the live docker-compose container stack
 * (AUTH_PROVIDER=mock, REALTIME_PROVIDER=mock) and writes an AC-tagged screenshot gallery
 * to docs/demos/EPIC-016/. NON-GATING.
 *
 * Persona:   sarah-returning-client (.planning/personas/sarah-returning-client.md)
 * Flow:      flow-notification-feed (.planning/flows/flow-notification-feed.md)
 * Policy:    .orchestration/DEMO-POLICY.md
 *
 * Gallery ordering (EPIC-016 portal surface — screenshots 01–05):
 *   01-AC-MSG-017-01-portal-nav-unread-badge.png
 *       — sarah sees the unread-count badge in the nav (AC-MSG-017-01)
 *   02-AC-MSG-017-02-portal-badge-count.png
 *       — the badge shows the correct unread count (AC-MSG-017-02)
 *   03-AC-MSG-007-03-portal-notification-feed.png
 *       — sarah's notification feed (AC-MSG-007-03: feed is the authoritative record)
 *   04-AC-MSG-014-03-portal-status-change-notification.png
 *       — engagement_status_changed notification in the portal feed (AC-MSG-014-03)
 *   05-AC-MSG-015-02-portal-badge-after-mark-read.png
 *       — badge reflects the read state after sarah views the linked engagement (AC-MSG-015-02/-015-03/-017-03)
 *
 * Each test ASSERTS the target element is visible BEFORE screenshotting (broken UI fails loudly).
 *
 * retro-012-012 (MANDATORY): screenshots MUST write ONLY to docs/demos/EPIC-016/ so prior-epic
 * PNGs are not rewritten. The DEMO_DIR const is the ONLY path used. // CS-GEN-001
 *
 * ADR-006: Portal surface only (Client Portal). // ADR-006
 * ADR-012: Tier-6 e2e (demo variant — non-gating). // ADR-012
 * ADR-023: Real-time via mock seam (REALTIME_PROVIDER=mock). // ADR-023
 * CS-GEN-003: AC ids cited in every test and screenshot name. // CS-GEN-003
 *
 * Run:
 *   pnpm --filter portal e2e:demo
 */

import { test, expect } from "@playwright/test";
import path from "path";
import mssqlPkg from "mssql";
import { setupClientSession, clearSession } from "../fixtures/auth.js";

const { ConnectionPool } = mssqlPkg;

// Gallery output dir — repo-root/docs/demos/EPIC-016 (resolved from this file's dir).
// Depth from apps/portal/e2e/demo/ to repo root = ../../../../
// retro-012-012 (MANDATORY): screenshots MUST write ONLY to docs/demos/EPIC-016/.
// This const is the ONLY path used; no prior-epic gallery is touched. // CS-GEN-001
const DEMO_DIR = path.resolve(__dirname, "../../../../docs/demos/EPIC-016");
const shot = (file: string) => path.join(DEMO_DIR, file);

const PORTAL_URL = process.env["PORTAL_BASE_URL"] ?? "http://localhost:3000";

// Deterministic fixture clerkId — "-demo-016-sarah" suffix avoids collision with e2e gate specs.
const SARAH_CLERK_ID = "user_client_demo_016_sarah";

// ─── DB helpers (admin pool — RLS-exempt seed/teardown) ───────────────────────

function parseSqlServerUrl(connectionUrl: string): mssqlPkg.config {
  const withoutScheme = connectionUrl.replace(/^(?:sqlserver|mssql):\/\//, "");
  const firstSemi = withoutScheme.indexOf(";");
  const authority =
    firstSemi === -1 ? withoutScheme : withoutScheme.slice(0, firstSemi);
  const paramStr =
    firstSemi === -1 ? "" : withoutScheme.slice(firstSemi + 1);

  const params: Record<string, string> = {};
  for (const part of paramStr.split(";")) {
    const eqIdx = part.indexOf("=");
    if (eqIdx === -1) continue;
    const k = part.slice(0, eqIdx).trim();
    const v = part.slice(eqIdx + 1).trim();
    if (k) params[k] = v;
  }

  let user: string | undefined;
  let password: string | undefined;
  let hostPort = authority;

  const atIdx = authority.lastIndexOf("@");
  if (atIdx !== -1) {
    const credentials = authority.slice(0, atIdx);
    hostPort = authority.slice(atIdx + 1);
    const colonIdx = credentials.indexOf(":");
    if (colonIdx === -1) {
      user = decodeURIComponent(credentials);
    } else {
      user = decodeURIComponent(credentials.slice(0, colonIdx));
      password = decodeURIComponent(credentials.slice(colonIdx + 1));
    }
  }

  let server = hostPort;
  let port = 1433;
  const portMatch = hostPort.match(/:(\d+)$/);
  if (portMatch) {
    port = parseInt(portMatch[1] ?? "1433", 10);
    server = hostPort.slice(0, hostPort.length - portMatch[0].length);
  }

  return {
    server,
    port:
      port !== 1433
        ? port
        : params["port"]
          ? parseInt(params["port"], 10)
          : 1433,
    user: user ?? params["user"],
    password: password ?? params["password"],
    database: params["database"] ?? "master",
    options: {
      encrypt: (params["encrypt"] ?? "true").toLowerCase() !== "false",
      trustServerCertificate:
        (params["trustServerCertificate"] ?? "false").toLowerCase() === "true",
    },
  };
}

let _pool: mssqlPkg.ConnectionPool | null = null;

async function getPool(): Promise<mssqlPkg.ConnectionPool> {
  if (_pool && _pool.connected) return _pool;
  const url = process.env["DATABASE_URL_ADMIN"];
  if (!url) {
    throw new Error(
      "[notification-feed.demo.spec] DATABASE_URL_ADMIN is not set. Required for admin pool seed/teardown.",
    );
  }
  const config = parseSqlServerUrl(url);
  _pool = new ConnectionPool(config);
  await _pool.connect();
  return _pool;
}

async function closePool(): Promise<void> {
  if (_pool) {
    await _pool.close();
    _pool = null;
  }
}

// ─── Fixture types ────────────────────────────────────────────────────────────

interface DemoNotifFixture {
  userId: string;
  engagementId: string;
  requestId: string;
  statusChangeNotifId: string;
  deliverableNotifId: string;
  acceptedNotifId: string;
}

// ─── Fixture seed ─────────────────────────────────────────────────────────────

/**
 * Seeds the portal notification-feed demo fixture:
 *   1. Sarah USER (CLIENT role, deterministic clerkId).
 *   2. EngagementRequest (accepted).
 *   3. Engagement (In Progress, letter signed — no letter gate).
 *   4. engagement_status_changed notification (AC-MSG-014-03).
 *   5. deliverable_ready notification (AC-MSG-014-04).
 *   6. engagement_request_accepted notification (AC-MSG-014-05).
 *   All three notifications are unread.
 *
 * DECISION (TASK-016-007): Three notification types are seeded to demonstrate the breadth
 * of the notification feed. A fourth type (declined) is omitted because the demo shows
 * positive acceptance flows (sarah-returning-client is an accepted client).
 */
async function seedDemoNotifFixture(): Promise<DemoNotifFixture> {
  const pool = await getPool();

  // ── Idempotent pre-cleanup ──────────────────────────────────────────────────
  await pool.request().input("clerkId", SARAH_CLERK_ID).query(
    `DELETE n FROM [dbo].[Notification] n
     INNER JOIN [dbo].[User] u ON n.[recipientUserId] = u.[id]
     WHERE u.[clerkId] = @clerkId`,
  ).catch(() => { /* ignore */ });
  await pool.request().input("clerkId", SARAH_CLERK_ID).query(
    `DELETE e FROM [dbo].[Engagement] e
     INNER JOIN [dbo].[User] u ON e.[clientUserId] = u.[id]
     WHERE u.[clerkId] = @clerkId`,
  ).catch(() => { /* ignore */ });
  await pool.request().query(
    `DELETE FROM [dbo].[EngagementRequest] WHERE [email] = N'e2e-demo-016-sarah@notification-feed.demo.e2e.test'`,
  ).catch(() => { /* ignore */ });

  // ── 1. Upsert Sarah (CLIENT) ────────────────────────────────────────────────
  const sarahResult = await pool
    .request()
    .input("clerkId", SARAH_CLERK_ID)
    .input("email", "e2e-demo-016-sarah@notification-feed.demo.e2e.test")
    .input("role", "CLIENT")
    .query<{ id: string }>(
      `MERGE [dbo].[User] AS target
       USING (SELECT @clerkId AS clerkId) AS source
         ON target.[clerkId] = source.[clerkId]
       WHEN NOT MATCHED THEN
         INSERT ([clerkId], [email], [role], [createdAt], [updatedAt])
         VALUES (@clerkId, @email, @role, SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET())
       OUTPUT INSERTED.[id];`,
    );

  let userId = sarahResult.recordset[0]?.id;
  if (!userId) {
    const lu = await pool
      .request()
      .input("clerkId", SARAH_CLERK_ID)
      .query<{ id: string }>(`SELECT [id] FROM [dbo].[User] WHERE [clerkId] = @clerkId`);
    userId = lu.recordset[0]?.id;
    if (!userId) throw new Error("[notification-feed.demo.spec] Failed to upsert Sarah");
  }

  // ── 2. Seed EngagementRequest (accepted) ────────────────────────────────────
  const reqResult = await pool
    .request()
    .input("email", "e2e-demo-016-sarah@notification-feed.demo.e2e.test")
    .query<{ id: string }>(
      `INSERT INTO [dbo].[EngagementRequest]
         ([firstName], [lastName], [email], [status], [createdAt], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES (N'SarahDemo016', N'ReturningClient', @email, 'accepted', SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET())`,
    );
  const requestId = reqResult.recordset[0]?.id;
  if (!requestId) throw new Error("[notification-feed.demo.spec] Failed to seed EngagementRequest");

  // ── 3. Seed Engagement (In Progress, letter signed) ─────────────────────────
  const evidenceJson = JSON.stringify({
    provider: "mock",
    ref: "demo-016-sarah-mock",
    signedAt: new Date().toISOString(),
  });
  const engResult = await pool
    .request()
    .input("requestId", requestId)
    .input("clientUserId", userId)
    .input("letterSignedAt", new Date())
    .input("letterSignatureEvidence", evidenceJson)
    .input("letterTemplateSnapshot", "E2E notification-feed demo 016 letter")
    .query<{ id: string }>(
      `INSERT INTO [dbo].[Engagement]
         ([engagementRequestId], [clientUserId], [status],
          [letterSignedAt], [letterSignatureEvidence], [letterTemplateSnapshot],
          [taxYear], [createdAt], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES (@requestId, @clientUserId, 'In Progress',
               @letterSignedAt, @letterSignatureEvidence, @letterTemplateSnapshot,
               2024, SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET())`,
    );
  const engagementId = engResult.recordset[0]?.id;
  if (!engagementId) throw new Error("[notification-feed.demo.spec] Failed to seed Engagement");
  const engagementIdLower = engagementId.toLowerCase();

  // ── 4. Seed engagement_status_changed notification (AC-MSG-014-03) ──────────
  const notif1 = await pool
    .request()
    .input("recipientUserId", userId)
    .input("engagementId", engagementId)
    .query<{ id: string }>(
      `INSERT INTO [dbo].[Notification]
         ([type], [title], [body], [recipientType], [recipientUserId],
          [linkedItemType], [linkedItemId], [readAt])
       OUTPUT INSERTED.[id]
       VALUES (
         N'engagement_status_changed',
         N'Your engagement status has changed to Review',
         N'Jane has moved your engagement to the Review stage.',
         N'CLIENT', @recipientUserId, N'engagement', @engagementId, NULL
       )`,
    );
  const statusChangeNotifId = notif1.recordset[0]?.id?.toLowerCase();
  if (!statusChangeNotifId) throw new Error("[notification-feed.demo.spec] Failed to seed status_changed notif");

  // ── 5. Seed deliverable_ready notification (AC-MSG-014-04) ──────────────────
  const notif2 = await pool
    .request()
    .input("recipientUserId", userId)
    .input("engagementId", engagementId)
    .query<{ id: string }>(
      `INSERT INTO [dbo].[Notification]
         ([type], [title], [body], [recipientType], [recipientUserId],
          [linkedItemType], [linkedItemId], [readAt])
       OUTPUT INSERTED.[id]
       VALUES (
         N'deliverable_ready',
         N'Your tax return is ready for review',
         N'Jane has prepared your 2024 tax return. Please review it at your convenience.',
         N'CLIENT', @recipientUserId, N'engagement', @engagementId, NULL
       )`,
    );
  const deliverableNotifId = notif2.recordset[0]?.id?.toLowerCase();
  if (!deliverableNotifId) throw new Error("[notification-feed.demo.spec] Failed to seed deliverable_ready notif");

  // ── 6. Seed engagement_request_accepted notification (AC-MSG-014-05) ────────
  const notif3 = await pool
    .request()
    .input("recipientUserId", userId)
    .input("engagementId", engagementId)
    .query<{ id: string }>(
      `INSERT INTO [dbo].[Notification]
         ([type], [title], [body], [recipientType], [recipientUserId],
          [linkedItemType], [linkedItemId], [readAt])
       OUTPUT INSERTED.[id]
       VALUES (
         N'engagement_request_accepted',
         N'Your request has been accepted',
         N'Jane has accepted your engagement request. Welcome to the portal!',
         N'CLIENT', @recipientUserId, N'engagement', @engagementId, NULL
       )`,
    );
  const acceptedNotifId = notif3.recordset[0]?.id?.toLowerCase();
  if (!acceptedNotifId) throw new Error("[notification-feed.demo.spec] Failed to seed request_accepted notif");

  return {
    userId: userId.toLowerCase(),
    engagementId: engagementIdLower,
    requestId: requestId.toLowerCase(),
    statusChangeNotifId,
    deliverableNotifId,
    acceptedNotifId,
  };
}

/**
 * Cleanup all seeded rows in reverse FK order.
 */
async function cleanupDemoFixture(): Promise<void> {
  const pool = await getPool();

  await pool.request().input("clerkId", SARAH_CLERK_ID).query(
    `DELETE n FROM [dbo].[Notification] n
     INNER JOIN [dbo].[User] u ON n.[recipientUserId] = u.[id]
     WHERE u.[clerkId] = @clerkId`,
  ).catch(() => { /* ignore */ });
  await pool.request().input("clerkId", SARAH_CLERK_ID).query(
    `DELETE e FROM [dbo].[Engagement] e
     INNER JOIN [dbo].[User] u ON e.[clientUserId] = u.[id]
     WHERE u.[clerkId] = @clerkId`,
  ).catch(() => { /* ignore */ });
  await pool.request().query(
    `DELETE FROM [dbo].[EngagementRequest] WHERE [email] = N'e2e-demo-016-sarah@notification-feed.demo.e2e.test'`,
  ).catch(() => { /* ignore */ });
  await pool.request().input("clerkId", SARAH_CLERK_ID).query(
    `DELETE FROM [dbo].[User] WHERE [clerkId] = @clerkId`,
  ).catch(() => { /* ignore */ });
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

test.afterAll(async () => {
  await cleanupDemoFixture();
  await closePool();
});

// ─── Screen 01: Nav unread badge (AC-MSG-017-01) ──────────────────────────────

test(
  "[AC-MSG-017-01] @demo 01 — sarah-returning-client: unread-count badge visible in portal nav",
  async ({ page, request }) => {
    // Screen 01: sarah-returning-client navigates to the portal home page.
    // The unread-count badge is visible in the nav (AC-MSG-017-01: from any area).
    // Screenshot: portal home page with the nav unread badge visible.

    test.setTimeout(30_000);

    const fixture = await seedDemoNotifFixture();

    try {
      await setupClientSession(page, request, SARAH_CLERK_ID);
      await page.goto(`${PORTAL_URL}/`);
      await page.waitForLoadState("networkidle", { timeout: 15_000 });

      // The unread badge must be visible (AC-MSG-017-01)
      const badge = page.getByTestId("nav-unread-badge");
      await expect(
        badge,
        "[AC-MSG-017-01] Unread badge must be visible in the portal nav for sarah-returning-client",
      ).toBeVisible({ timeout: 10_000 });

      // Screenshot 01: portal nav with unread badge.
      await page.screenshot({
        path: shot("01-AC-MSG-017-01-portal-nav-unread-badge.png"),
        fullPage: true,
      });
    } finally {
      await clearSession(page);
      await cleanupDemoFixture();
    }
  },
);

// ─── Screen 02: Badge count (AC-MSG-017-02) ───────────────────────────────────

test(
  "[AC-MSG-017-02] @demo 02 — sarah-returning-client: badge shows the correct unread count",
  async ({ page, request }) => {
    // Screen 02: the badge shows the correct unread count (3 notifications seeded).
    // Screenshot: portal home page with the badge count visible.

    test.setTimeout(30_000);

    const fixture = await seedDemoNotifFixture();

    try {
      await setupClientSession(page, request, SARAH_CLERK_ID);
      await page.goto(`${PORTAL_URL}/`);
      await page.waitForLoadState("networkidle", { timeout: 15_000 });

      // Badge must show count ≥ 3 (3 notifications seeded above) (AC-MSG-017-02)
      const badge = page.getByTestId("nav-unread-badge");
      await expect(badge).toBeVisible({ timeout: 10_000 });
      const countAttr = await badge.getAttribute("data-unread-count");
      expect(
        Number(countAttr),
        "[AC-MSG-017-02] Badge must show unread count ≥ 3 (3 notifications seeded)",
      ).toBeGreaterThanOrEqual(3);

      // Screenshot 02: portal nav with badge count.
      await page.screenshot({
        path: shot("02-AC-MSG-017-02-portal-badge-count.png"),
        fullPage: true,
      });
    } finally {
      await clearSession(page);
      await cleanupDemoFixture();
    }
  },
);

// ─── Screen 03: Notification feed (AC-MSG-007-03) ─────────────────────────────

test(
  "[AC-MSG-007-03] @demo 03 — sarah-returning-client: notification feed shows all entitled notifications",
  async ({ page, request }) => {
    // Screen 03: sarah navigates to /notifications.
    // The feed shows all entitled notifications (AC-MSG-007-03: feed is the authoritative record).
    // Screenshot: portal /notifications page with the full feed visible.

    test.setTimeout(30_000);

    const fixture = await seedDemoNotifFixture();

    try {
      await setupClientSession(page, request, SARAH_CLERK_ID);
      await page.goto(`${PORTAL_URL}/notifications`);
      await page.waitForLoadState("networkidle", { timeout: 15_000 });

      // The notification feed container must be visible (AC-MSG-007-03)
      const feed = page.getByTestId("notification-feed");
      await expect(
        feed,
        "[AC-MSG-007-03] Notification feed must be visible on /notifications",
      ).toBeVisible({ timeout: 10_000 });

      // At least one seeded notification must appear in the feed
      const notifItem = page.getByTestId(`notification-item-${fixture.statusChangeNotifId}`);
      await expect(
        notifItem,
        "[AC-MSG-007-03] engagement_status_changed notification must be in the feed (AC-MSG-014-03)",
      ).toBeVisible({ timeout: 10_000 });

      // Screenshot 03: portal notification feed page.
      await page.screenshot({
        path: shot("03-AC-MSG-007-03-portal-notification-feed.png"),
        fullPage: true,
      });
    } finally {
      await clearSession(page);
      await cleanupDemoFixture();
    }
  },
);

// ─── Screen 04: Status-change notification in feed (AC-MSG-014-03) ────────────

test(
  "[AC-MSG-014-03] @demo 04 — sarah-returning-client: engagement_status_changed notification in the portal feed",
  async ({ page, request }) => {
    // Screen 04: the engagement_status_changed notification is visible in the feed.
    // This demonstrates AC-MSG-014-03: client receives an in-portal notification of the status change.
    // Screenshot: portal /notifications page with the status-change notification highlighted.

    test.setTimeout(30_000);

    const fixture = await seedDemoNotifFixture();

    try {
      await setupClientSession(page, request, SARAH_CLERK_ID);
      await page.goto(`${PORTAL_URL}/notifications`);
      await page.waitForLoadState("networkidle", { timeout: 15_000 });

      // The engagement_status_changed notification must be visible (AC-MSG-014-03)
      const notifItem = page.getByTestId(`notification-item-${fixture.statusChangeNotifId}`);
      await expect(
        notifItem,
        "[AC-MSG-014-03] engagement_status_changed notification must appear in the portal feed",
      ).toBeVisible({ timeout: 10_000 });

      // It must have the correct notification type
      await expect(notifItem).toHaveAttribute("data-notification-type", "engagement_status_changed");

      // Screenshot 04: status-change notification in the portal feed.
      await page.screenshot({
        path: shot("04-AC-MSG-014-03-portal-status-change-notification.png"),
        fullPage: true,
      });
    } finally {
      await clearSession(page);
      await cleanupDemoFixture();
    }
  },
);

// ─── Screen 05: Badge after mark-read on view (AC-MSG-015-02 / -015-03 / -017-03) ─

test(
  "[AC-MSG-015-02][AC-MSG-015-03][AC-MSG-017-03] @demo 05 — sarah-returning-client: badge reflects read state after viewing linked engagement",
  async ({ page, request }) => {
    // Screen 05: sarah views the linked engagement page.
    // markNotificationOnViewAction fires automatically (no dismiss button — AC-MSG-015-03).
    // The badge count decreases on the next page load (AC-MSG-015-02 / AC-MSG-017-03).
    // Screenshot: portal home page with the updated badge count (after mark-read).

    test.setTimeout(45_000);

    const fixture = await seedDemoNotifFixture();

    try {
      await setupClientSession(page, request, SARAH_CLERK_ID);

      // Visit home to capture initial badge count
      await page.goto(`${PORTAL_URL}/`);
      await page.waitForLoadState("networkidle", { timeout: 15_000 });

      const badge = page.getByTestId("nav-unread-badge");
      await expect(badge).toBeVisible({ timeout: 10_000 });
      const initialCountStr = await badge.getAttribute("data-unread-count");
      const initialCount = Number(initialCountStr ?? "0");

      // Navigate to the linked engagement page.
      // markNotificationOnViewAction fires server-side on load (AC-MSG-015-02).
      // No dismiss button — the mark fires automatically (AC-MSG-015-03).
      await page.goto(`${PORTAL_URL}/engagements/${fixture.engagementId}`);
      await page.waitForLoadState("networkidle", { timeout: 15_000 });

      // Verify we're on the engagement detail page
      const engagementDetail = page.getByTestId("engagement-detail");
      await expect(engagementDetail).toBeVisible({ timeout: 15_000 });

      // Return to home to get the updated badge count (AC-MSG-017-03: badge reflects read state)
      await page.goto(`${PORTAL_URL}/`);
      await page.waitForLoadState("networkidle", { timeout: 15_000 });

      const badgeAfter = page.getByTestId("nav-unread-badge");
      const badgeVisible = await badgeAfter.isVisible();
      const countAfter = badgeVisible
        ? Number((await badgeAfter.getAttribute("data-unread-count")) ?? "0")
        : 0;

      expect(
        countAfter,
        "[AC-MSG-017-03] Badge count must decrease after sarah views the linked engagement " +
          "(AC-MSG-015-02 mark-read fires; AC-MSG-015-03 no dismiss needed)",
      ).toBeLessThan(initialCount);

      // Screenshot 05: portal home page with decreased badge count (reflecting mark-read).
      await page.screenshot({
        path: shot("05-AC-MSG-015-02-portal-badge-after-mark-read.png"),
        fullPage: true,
      });
    } finally {
      await clearSession(page);
      await cleanupDemoFixture();
    }
  },
);
