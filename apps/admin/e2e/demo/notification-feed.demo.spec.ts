/**
 * apps/admin/e2e/demo/notification-feed.demo.spec.ts
 *
 * @demo UI demo walkthrough — EPIC-016 Notification feed gallery (admin / Tax Portal surface).
 *
 * Not part of the e2e gate: `e2e:run` / `e2e:smoke` exclude `@demo` (--grep-invert @demo);
 * this runs ONLY via `pnpm --filter admin e2e:demo`. It drives jane-accountant's notification
 * feed happy-path against the live docker-compose container stack (AUTH_PROVIDER=mock,
 * REALTIME_PROVIDER=mock) and writes an AC-tagged screenshot gallery to docs/demos/EPIC-016/.
 * NON-GATING.
 *
 * Persona:   jane-accountant (.planning/personas/jane-accountant.md)
 * Flow:      flow-notification-feed (.planning/flows/flow-notification-feed.md)
 * Policy:    .orchestration/DEMO-POLICY.md
 *
 * Gallery ordering (EPIC-016 admin surface — screenshots 06–09):
 *   06-AC-MSG-017-01-admin-nav-unread-badge.png
 *       — jane sees the unread-count badge in the admin nav (AC-MSG-017-01)
 *   07-AC-MSG-013-03-admin-document-upload-notification.png
 *       — document_uploaded notification visible in the admin notifications indicator (AC-MSG-013-03)
 *   08-AC-MSG-015-02-admin-mark-read-on-view.png
 *       — jane views the linked request → mark-read fires (AC-MSG-015-02/-015-03/-017-03)
 *   09-AC-MSG-017-03-admin-badge-after-mark-read.png
 *       — admin badge reflects the read state after viewing the request (AC-MSG-017-03)
 *
 * Each test ASSERTS the target element is visible BEFORE screenshotting (broken UI fails loudly).
 *
 * retro-012-012 (MANDATORY): screenshots MUST write ONLY to docs/demos/EPIC-016/ so prior-epic
 * PNGs are not rewritten. The DEMO_DIR const is the ONLY path used. // CS-GEN-001
 *
 * ADR-006: Admin surface only (Tax Portal). // ADR-006
 * ADR-012: Tier-6 e2e (demo variant — non-gating). // ADR-012
 * ADR-023: Real-time via mock seam (REALTIME_PROVIDER=mock). // ADR-023
 * CS-GEN-003: AC ids cited in every test and screenshot name. // CS-GEN-003
 *
 * Run:
 *   pnpm --filter admin e2e:demo
 */

import { test, expect } from "@playwright/test";
import path from "path";
import mssqlPkg from "mssql";
import { setupAccountantSession, clearSession } from "../fixtures/auth.js";

const { ConnectionPool } = mssqlPkg;

// Gallery output dir — repo-root/docs/demos/EPIC-016 (resolved from this file's dir).
// Depth from apps/admin/e2e/demo/ to repo root = ../../../../
// retro-012-012 (MANDATORY): screenshots MUST write ONLY to docs/demos/EPIC-016/.
// This const is the ONLY path used; no prior-epic gallery is touched. // CS-GEN-001
const DEMO_DIR = path.resolve(__dirname, "../../../../docs/demos/EPIC-016");
const shot = (file: string) => path.join(DEMO_DIR, file);

const ADMIN_PORT = process.env["ADMIN_PORT"] ?? "3001";
const ADMIN_URL = process.env["ADMIN_BASE_URL"] ?? `http://localhost:${ADMIN_PORT}`;

// Deterministic fixture clerkId — "-demo-016-jane" suffix avoids collision with e2e gate specs.
const JANE_CLERK_ID = "user_accountant_demo_016_jane";

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

interface DemoAdminNotifFixture {
  requestId: string;
  documentUploadNotifId: string;
}

// ─── Fixture seed ─────────────────────────────────────────────────────────────

/**
 * Seeds the admin notification-feed demo fixture:
 *   1. EngagementRequest (accepted — provides the linked item for the notification).
 *   2. document_uploaded notification (ACCOUNTANT-scoped, AC-MSG-013-03).
 *
 * DECISION (TASK-016-007): We seed the ACCOUNTANT notification without a specific
 * accountant user ID (recipientUserId=null) because all ACCOUNTANT sessions share
 * the ACCOUNTANT channel. The jane-accountant demo session will see this notification.
 */
async function seedDemoAdminNotifFixture(): Promise<DemoAdminNotifFixture> {
  const pool = await getPool();

  // ── Idempotent pre-cleanup ──────────────────────────────────────────────────
  await pool.request().query(
    `DELETE n FROM [dbo].[Notification] n
     INNER JOIN [dbo].[EngagementRequest] r ON n.[linkedItemId] = r.[id]
     WHERE r.[email] = N'e2e-demo-016-jane@notification-feed.demo.e2e.test'
     AND n.[recipientType] = N'ACCOUNTANT'`,
  ).catch(() => { /* ignore */ });
  await pool.request().query(
    `DELETE FROM [dbo].[EngagementRequest] WHERE [email] = N'e2e-demo-016-jane@notification-feed.demo.e2e.test'`,
  ).catch(() => { /* ignore */ });

  // ── 1. Seed EngagementRequest (accepted — provides the linked item) ──────────
  const reqResult = await pool
    .request()
    .input("email", "e2e-demo-016-jane@notification-feed.demo.e2e.test")
    .query<{ id: string }>(
      `INSERT INTO [dbo].[EngagementRequest]
         ([firstName], [lastName], [email], [status], [message], [createdAt], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES (N'JaneDemo016', N'AccountantClient', @email, 'pending',
               N'Client uploaded Tax_Return_2024.pdf to the engagement', SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET())`,
    );
  const requestId = reqResult.recordset[0]?.id;
  if (!requestId) throw new Error("[notification-feed.demo.spec] Failed to seed EngagementRequest");

  // ── 2. Seed document_uploaded notification (AC-MSG-013-03) ──────────────────
  //    recipientType='ACCOUNTANT', recipientUserId=null (shared accountant channel)
  //    linkedItemType='request', linkedItemId=requestId (request detail page marks it read)
  const notifResult = await pool
    .request()
    .input("requestId", requestId)
    .query<{ id: string }>(
      `INSERT INTO [dbo].[Notification]
         ([type], [title], [body], [recipientType], [recipientUserId],
          [linkedItemType], [linkedItemId], [engagementRequestId], [readAt])
       OUTPUT INSERTED.[id]
       VALUES (
         N'document_uploaded',
         N'New document uploaded by client',
         N'Your client uploaded Tax_Return_2024.pdf to their engagement.',
         N'ACCOUNTANT',
         NULL,
         N'request',
         @requestId,
         @requestId,
         NULL
       )`,
    );
  const documentUploadNotifId = notifResult.recordset[0]?.id;
  if (!documentUploadNotifId) throw new Error("[notification-feed.demo.spec] Failed to seed document_uploaded notif");

  return {
    requestId: requestId.toLowerCase(),
    documentUploadNotifId: documentUploadNotifId.toLowerCase(),
  };
}

/**
 * Cleanup all seeded rows.
 */
async function cleanupDemoAdminFixture(): Promise<void> {
  const pool = await getPool();
  await pool.request().query(
    `DELETE n FROM [dbo].[Notification] n
     INNER JOIN [dbo].[EngagementRequest] r ON n.[linkedItemId] = r.[id]
     WHERE r.[email] = N'e2e-demo-016-jane@notification-feed.demo.e2e.test'
     AND n.[recipientType] = N'ACCOUNTANT'`,
  ).catch(() => { /* ignore */ });
  await pool.request().query(
    `DELETE FROM [dbo].[EngagementRequest] WHERE [email] = N'e2e-demo-016-jane@notification-feed.demo.e2e.test'`,
  ).catch(() => { /* ignore */ });
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

test.afterAll(async () => {
  await cleanupDemoAdminFixture();
  await closePool();
});

// ─── Screen 06: Admin nav unread badge (AC-MSG-017-01) ────────────────────────

test(
  "[AC-MSG-017-01] @demo 06 — jane-accountant: unread-count badge visible in admin nav",
  async ({ page, request }) => {
    // Screen 06: jane-accountant navigates to the admin dashboard.
    // The unread-count badge is visible in the nav (AC-MSG-017-01: from any area).
    // Screenshot: admin dashboard with the nav unread badge visible.

    test.setTimeout(30_000);

    const fixture = await seedDemoAdminNotifFixture();

    try {
      await setupAccountantSession(page, request, JANE_CLERK_ID);
      await page.goto(`${ADMIN_URL}/`);
      await page.waitForLoadState("networkidle", { timeout: 15_000 });

      // The unread badge must be visible (AC-MSG-017-01)
      const badge = page.getByTestId("nav-unread-badge");
      await expect(
        badge,
        "[AC-MSG-017-01] Unread badge must be visible in the admin nav for jane-accountant",
      ).toBeVisible({ timeout: 10_000 });

      // Screenshot 06: admin nav with unread badge.
      await page.screenshot({
        path: shot("06-AC-MSG-017-01-admin-nav-unread-badge.png"),
        fullPage: true,
      });
    } finally {
      await clearSession(page);
      await cleanupDemoAdminFixture();
    }
  },
);

// ─── Screen 07: Document-upload notification in admin indicator (AC-MSG-013-03) ─

test(
  "[AC-MSG-013-03] @demo 07 — jane-accountant: document_uploaded notification in admin notifications indicator",
  async ({ page, request }) => {
    // Screen 07: jane navigates to /requests where the NotificationsIndicator is.
    // The document_uploaded notification is visible (AC-MSG-013-03).
    // Screenshot: admin /requests page with the document_uploaded notification visible.

    test.setTimeout(30_000);

    const fixture = await seedDemoAdminNotifFixture();

    try {
      await setupAccountantSession(page, request, JANE_CLERK_ID);
      await page.goto(`${ADMIN_URL}/requests`);
      await page.waitForLoadState("networkidle", { timeout: 15_000 });

      // The NotificationsIndicator must be visible (AC-MSG-013-03)
      const notifIndicator = page.getByTestId("notifications-indicator");
      await expect(
        notifIndicator,
        "[AC-MSG-013-03] notifications-indicator must be visible on /requests",
      ).toBeVisible({ timeout: 10_000 });

      // The document_uploaded notification must appear in the indicator (AC-MSG-013-03)
      const notifItem = page.getByTestId(`notification-item-${fixture.documentUploadNotifId}`);
      await expect(
        notifItem,
        "[AC-MSG-013-03] document_uploaded notification must be visible in the admin notifications indicator",
      ).toBeVisible({ timeout: 10_000 });

      // It must have the correct notification type
      await expect(notifItem).toHaveAttribute("data-notification-type", "document_uploaded");

      // Screenshot 07: admin /requests with the document_uploaded notification.
      await page.screenshot({
        path: shot("07-AC-MSG-013-03-admin-document-upload-notification.png"),
        fullPage: true,
      });
    } finally {
      await clearSession(page);
      await cleanupDemoAdminFixture();
    }
  },
);

// ─── Screen 08: Mark-read on view (AC-MSG-015-02 / -015-03) ──────────────────

test(
  "[AC-MSG-015-02][AC-MSG-015-03] @demo 08 — jane-accountant: viewing linked request marks notification read",
  async ({ page, request }) => {
    // Screen 08: jane navigates to the linked request detail page.
    // markNotificationOnViewAction fires automatically (no dismiss button — AC-MSG-015-03).
    // Screenshot: admin request detail page (the view that triggers mark-read).

    test.setTimeout(30_000);

    const fixture = await seedDemoAdminNotifFixture();

    try {
      await setupAccountantSession(page, request, JANE_CLERK_ID);

      // Navigate to the linked request detail page.
      // This fires markNotificationOnViewAction server-side (AC-MSG-015-02).
      // No dismiss button needed (AC-MSG-015-03).
      await page.goto(`${ADMIN_URL}/requests/${fixture.requestId}`);
      await page.waitForLoadState("networkidle", { timeout: 15_000 });

      // The request detail page must be visible
      const requestDetail = page.getByTestId("request-detail");
      await expect(
        requestDetail,
        "[AC-MSG-015-02] Request detail page must be visible (linked-item view triggers mark-read)",
      ).toBeVisible({ timeout: 15_000 });

      // Screenshot 08: admin request detail page (mark-read trigger — AC-MSG-015-02).
      await page.screenshot({
        path: shot("08-AC-MSG-015-02-admin-mark-read-on-view.png"),
        fullPage: true,
      });
    } finally {
      await clearSession(page);
      await cleanupDemoAdminFixture();
    }
  },
);

// ─── Screen 09: Admin badge after mark-read (AC-MSG-017-03) ──────────────────

test(
  "[AC-MSG-017-03] @demo 09 — jane-accountant: admin badge reflects read state after viewing linked request",
  async ({ page, request }) => {
    // Screen 09: after viewing the linked request, the admin badge decrements.
    // AC-MSG-017-03: badge updates to reflect the new unread count.
    // Screenshot: admin dashboard with the updated (lower) badge count.

    test.setTimeout(45_000);

    const fixture = await seedDemoAdminNotifFixture();

    try {
      await setupAccountantSession(page, request, JANE_CLERK_ID);

      // Visit admin dashboard to capture initial badge count
      await page.goto(`${ADMIN_URL}/`);
      await page.waitForLoadState("networkidle", { timeout: 15_000 });

      const badge = page.getByTestId("nav-unread-badge");
      await expect(badge).toBeVisible({ timeout: 10_000 });
      const initialCountStr = await badge.getAttribute("data-unread-count");
      const initialCount = Number(initialCountStr ?? "0");

      // Navigate to the linked request detail page (triggers mark-read — AC-MSG-015-02)
      await page.goto(`${ADMIN_URL}/requests/${fixture.requestId}`);
      await page.waitForLoadState("networkidle", { timeout: 15_000 });

      const requestDetail = page.getByTestId("request-detail");
      await expect(requestDetail).toBeVisible({ timeout: 15_000 });

      // Return to admin dashboard to get the updated badge count (AC-MSG-017-03)
      await page.goto(`${ADMIN_URL}/`);
      await page.waitForLoadState("networkidle", { timeout: 15_000 });

      const badgeAfter = page.getByTestId("nav-unread-badge");
      const badgeVisible = await badgeAfter.isVisible();
      const countAfter = badgeVisible
        ? Number((await badgeAfter.getAttribute("data-unread-count")) ?? "0")
        : 0;

      expect(
        countAfter,
        "[AC-MSG-017-03] Admin badge count must decrease after jane views the linked request " +
          "(AC-MSG-015-02 mark-read fires; AC-MSG-015-03 no dismiss needed)",
      ).toBeLessThan(initialCount);

      // Screenshot 09: admin dashboard with decreased badge count (after mark-read).
      await page.screenshot({
        path: shot("09-AC-MSG-017-03-admin-badge-after-mark-read.png"),
        fullPage: true,
      });
    } finally {
      await clearSession(page);
      await cleanupDemoAdminFixture();
    }
  },
);
