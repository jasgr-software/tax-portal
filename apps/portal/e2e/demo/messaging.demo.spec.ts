/**
 * apps/portal/e2e/demo/messaging.demo.spec.ts
 *
 * @demo UI demo walkthrough — EPIC-017 Messaging gallery (portal / Client Portal surface).
 *
 * Not part of the e2e gate: `e2e:run` / `e2e:smoke` exclude `@demo` (--grep-invert @demo);
 * this runs ONLY via `pnpm --filter portal e2e:demo`. It drives sarah-returning-client's
 * messaging happy-path against the live docker-compose container stack (AUTH_PROVIDER=mock)
 * and writes an AC-tagged screenshot gallery to docs/demos/EPIC-017/. NON-GATING.
 *
 * Persona:   sarah-returning-client (.planning/personas/sarah-returning-client.md)
 * Flow:      flow-message-exchange (.planning/flows/flow-message-exchange.md)
 * Policy:    .orchestration/DEMO-POLICY.md
 *
 * Gallery ordering (EPIC-017 portal surface — screenshots 01–05):
 *   01-AC-MSG-001-01-portal-engagement-thread-panel.png
 *       — sarah sees the engagement thread panel on /engagements/{id}/messages (AC-MSG-001-01)
 *   02-AC-MSG-001-04-portal-thread-view-composer.png
 *       — thread-view shows ordered messages; MessageComposer present so sarah can reply (AC-MSG-001-04)
 *   03-AC-MSG-004-03-portal-attachment-download.png
 *       — sarah sees the active attachment and download button (signed URL path — AC-MSG-004-03)
 *   04-AC-MSG-005-01-portal-unread-indicator.png
 *       — engagement thread shows an unread indicator to sarah (AC-MSG-005-01)
 *   05-AC-MSG-014-01-portal-new-message-notification.png
 *       — sarah's notification feed shows the new-message notification (AC-MSG-014-01)
 *
 * Each test ASSERTS the target element is visible BEFORE screenshotting (broken UI fails loudly).
 *
 * retro-012-012 (MANDATORY): screenshots MUST write ONLY to docs/demos/EPIC-017/ so prior-epic
 * PNGs are not rewritten. The DEMO_DIR const is the ONLY path used. // CS-GEN-001
 *
 * ADR-006: Portal surface only (Client Portal). // ADR-006
 * ADR-009: Signed URL path (requestAttachmentUrlAction → authorizeThenSignAttachment). // ADR-009
 * ADR-012: Tier-6 e2e (demo variant — non-gating). // ADR-012
 * CS-TS-003: Mirror of admin messaging demo spec (same DB, different surface). // CS-TS-003
 * CS-GEN-003: AC ids cited in every test and screenshot name. // CS-GEN-003
 *
 * Run:
 *   pnpm --filter portal e2e:demo
 *
 * // ADR-006 // ADR-009 // ADR-012 // CS-TS-003 // CS-GEN-001 // CS-GEN-003
 */

import { test, expect } from "@playwright/test";
import path from "path";
import mssqlPkg from "mssql";
import { setupClientSession, clearSession } from "../fixtures/auth.js";

const { ConnectionPool } = mssqlPkg;

// Gallery output dir — repo-root/docs/demos/EPIC-017 (resolved from this file's dir).
// Depth from apps/portal/e2e/demo/ to repo root = ../../../../
// retro-012-012 (MANDATORY): screenshots MUST write ONLY to docs/demos/EPIC-017/.
// This const is the ONLY path used; no prior-epic gallery is touched. // CS-GEN-001
const DEMO_DIR = path.resolve(__dirname, "../../../../docs/demos/EPIC-017");
const shot = (file: string) => path.join(DEMO_DIR, file);

const PORTAL_URL = process.env["PORTAL_BASE_URL"] ?? "http://localhost:3000";

// Deterministic fixture clerkIds — "-demo-017-portal" suffix avoids collision with e2e gate specs.
// CS-GEN-001: no real PII — test-only identifiers.
const SARAH_CLERK_ID = "user_client_demo_017_portal_sarah";
const JANE_CLERK_ID_FOR_PORTAL = "user_accountant_demo_017_portal_jane";

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
      "[portal-messaging.demo.spec] DATABASE_URL_ADMIN is not set. Required for admin pool seed/teardown.",
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

interface DemoPortalMessagingFixture {
  clientUserId: string;
  engagementId: string;
  engagementThreadId: string;
  clientMessageId: string;
  accountantMessageId: string;
  seededAttachmentId: string;
  newMessageNotifId: string;
}

// ─── Fixture seed ─────────────────────────────────────────────────────────────

/**
 * Seeds the portal messaging demo fixture:
 *   1. CLIENT user row (sarah — portal-facing demo).
 *   2. ACCOUNTANT user row (jane — for ThreadReadState FK + message sender).
 *   3. EngagementRequest + active Engagement (jane ↔ sarah).
 *   4. Thread (kind='engagement') for the Engagement.
 *   5. Two Messages in the engagement thread (client + accountant).
 *   6. A MessageAttachment row (status='active') on the accountant's message.
 *   7. A new_message Notification (AC-MSG-014-01) for sarah's portal feed.
 *
 * DECISION (TASK-017-009): "-demo-017-portal" suffix avoids collision with the e2e gate
 * suite (TASK-017-008) using "-017-008" suffixes and the admin demo using "-demo-017-jane"
 * / "-demo-017-admin-sarah" suffixes.
 * CS-GEN-001: generic bodies/emails — no PII. // CS-GEN-001
 */
async function seedDemoPortalMessagingFixture(): Promise<DemoPortalMessagingFixture> {
  const pool = await getPool();

  // Idempotent pre-cleanup
  await cleanupDemoPortalFixture().catch(() => { /* first run */ });

  // 1. Upsert CLIENT User row (sarah — portal session user).
  const sarahResult = await pool
    .request()
    .input("clerkId", SARAH_CLERK_ID)
    .input("email", "demo-017-portal-sarah@messaging.demo.e2e.test")
    .query<{ id: string }>(
      `MERGE [dbo].[User] AS target
       USING (SELECT @clerkId AS clerkId) AS source ON target.[clerkId] = source.[clerkId]
       WHEN NOT MATCHED THEN
         INSERT ([clerkId], [email], [role], [createdAt], [updatedAt])
         VALUES (@clerkId, @email, N'CLIENT', SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET())
       OUTPUT INSERTED.[id];`,
    );

  let clientUserId = sarahResult.recordset[0]?.id;
  if (!clientUserId) {
    const lu = await pool
      .request()
      .input("clerkId", SARAH_CLERK_ID)
      .query<{ id: string }>(`SELECT [id] FROM [dbo].[User] WHERE [clerkId] = @clerkId`);
    clientUserId = lu.recordset[0]?.id;
    if (!clientUserId) throw new Error("[portal-messaging.demo.spec] Failed to upsert CLIENT User");
  }

  // 2. Upsert ACCOUNTANT User row (jane — for message senderClerkId reference).
  await pool
    .request()
    .input("clerkId", JANE_CLERK_ID_FOR_PORTAL)
    .input("email", "demo-017-portal-jane@messaging.demo.e2e.test")
    .query(
      `MERGE [dbo].[User] AS target
       USING (SELECT @clerkId AS clerkId) AS source ON target.[clerkId] = source.[clerkId]
       WHEN NOT MATCHED THEN
         INSERT ([clerkId], [email], [role], [createdAt], [updatedAt])
         VALUES (@clerkId, @email, N'ACCOUNTANT', SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET());`,
    );

  // 3. Seed EngagementRequest + active Engagement.
  const reqResult = await pool
    .request()
    .input("email", "demo-017-portal-sarah@messaging.demo.e2e.test")
    .query<{ id: string }>(
      `INSERT INTO [dbo].[EngagementRequest]
         ([firstName], [lastName], [email], [status], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES (N'SarahDemo017', N'ReturningClient', @email, N'accepted', SYSDATETIMEOFFSET())`,
    );
  const requestId = reqResult.recordset[0]?.id;
  if (!requestId) throw new Error("[portal-messaging.demo.spec] Failed to seed EngagementRequest");

  const engResult = await pool
    .request()
    .input("clientUserId", clientUserId)
    .input("requestId", requestId)
    .query<{ id: string }>(
      `INSERT INTO [dbo].[Engagement]
         ([clientUserId], [engagementRequestId], [status], [taxYear], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES (@clientUserId, @requestId, N'In Progress', 2024, SYSDATETIMEOFFSET())`,
    );
  const engagementId = engResult.recordset[0]?.id;
  if (!engagementId) throw new Error("[portal-messaging.demo.spec] Failed to seed Engagement");

  // 4. Seed engagement Thread (kind='engagement').
  const threadResult = await pool
    .request()
    .input("engagementId", engagementId)
    .query<{ id: string }>(
      `INSERT INTO [dbo].[Thread] ([kind], [engagementId], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES (N'engagement', @engagementId, SYSDATETIMEOFFSET())`,
    );
  const engagementThreadId = threadResult.recordset[0]?.id;
  if (!engagementThreadId) throw new Error("[portal-messaging.demo.spec] Failed to seed engagement Thread");

  // 5. Seed two Messages (client + accountant).
  // CS-GEN-001: generic bodies — no PII. // CS-GEN-001
  const clientMsgResult = await pool
    .request()
    .input("threadId", engagementThreadId)
    .input("senderClerkId", SARAH_CLERK_ID)
    .query<{ id: string }>(
      `INSERT INTO [dbo].[Message] ([threadId], [senderClerkId], [body], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES (@threadId, @senderClerkId, N'Sarah demo message (EPIC-017 portal demo)', SYSDATETIMEOFFSET())`,
    );
  const clientMessageId = clientMsgResult.recordset[0]?.id;
  if (!clientMessageId) throw new Error("[portal-messaging.demo.spec] Failed to seed client Message");

  const accountantMsgResult = await pool
    .request()
    .input("threadId", engagementThreadId)
    .input("senderClerkId", JANE_CLERK_ID_FOR_PORTAL)
    .query<{ id: string }>(
      `INSERT INTO [dbo].[Message] ([threadId], [senderClerkId], [body], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES (@threadId, @senderClerkId, N'Accountant demo reply (EPIC-017 portal demo)', SYSDATETIMEOFFSET())`,
    );
  const accountantMessageId = accountantMsgResult.recordset[0]?.id;
  if (!accountantMessageId) throw new Error("[portal-messaging.demo.spec] Failed to seed accountant Message");

  // 6. Seed a MessageAttachment row (status='active') on the accountant's message.
  // DECISION (TASK-017-009): seed via DB pool (active status = scan already passed).
  // BUG-008-001 pattern: Azurite unreachable from host browser; seed attachment directly.
  // AC-MSG-004-02: attachment visible to participants; AC-MSG-004-03: download button present. // ADR-009
  const attachResult = await pool
    .request()
    .input("messageId", accountantMessageId)
    .query<{ id: string }>(
      `INSERT INTO [dbo].[MessageAttachment]
         ([messageId], [storageKey], [originalFilename], [contentType], [sizeBytes],
          [status], [uploadedBy], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES (
         @messageId,
         N'e2e-demo/portal/attachments/demo-017-portal-attachment.txt',
         N'demo-017-portal-attachment.txt',
         N'text/plain',
         64,
         N'active',
         '${JANE_CLERK_ID_FOR_PORTAL}',
         SYSDATETIMEOFFSET()
       )`,
    );
  const seededAttachmentId = attachResult.recordset[0]?.id;
  if (!seededAttachmentId) throw new Error("[portal-messaging.demo.spec] Failed to seed MessageAttachment");

  // 7. Seed a new_message Notification (AC-MSG-014-01) for sarah's portal feed.
  // linkedItemType='thread', linkedItemId=engagementThreadId.
  // AC-MSG-014-01: client is notified when accountant sends a message.
  const notifResult = await pool
    .request()
    .input("recipientUserId", clientUserId)
    .input("engagementId", engagementId)
    .input("threadId", engagementThreadId)
    .query<{ id: string }>(
      `INSERT INTO [dbo].[Notification]
         ([type], [title], [body], [recipientType], [recipientUserId],
          [linkedItemType], [linkedItemId], [readAt])
       OUTPUT INSERTED.[id]
       VALUES (
         N'new_message',
         N'New message from your accountant',
         N'Jane sent you a message in your engagement thread.',
         N'CLIENT',
         @recipientUserId,
         N'thread',
         @threadId,
         NULL
       )`,
    );
  const newMessageNotifId = notifResult.recordset[0]?.id;
  if (!newMessageNotifId) throw new Error("[portal-messaging.demo.spec] Failed to seed new_message Notification");

  return {
    clientUserId: clientUserId.toLowerCase(),
    engagementId: engagementId.toLowerCase(),
    engagementThreadId: engagementThreadId.toLowerCase(),
    clientMessageId: clientMessageId.toLowerCase(),
    accountantMessageId: accountantMessageId.toLowerCase(),
    seededAttachmentId: seededAttachmentId.toLowerCase(),
    newMessageNotifId: newMessageNotifId.toLowerCase(),
  };
}

/**
 * Cleanup all seeded rows (cascade-ordered for FK safety).
 * Idempotent — ignores "row not found" errors.
 */
async function cleanupDemoPortalFixture(): Promise<void> {
  const pool = await getPool();

  // Notifications for sarah
  await pool.request().input("clerkId", SARAH_CLERK_ID).query(
    `DELETE n FROM [dbo].[Notification] n
     INNER JOIN [dbo].[User] u ON n.[recipientUserId] = u.[id]
     WHERE u.[clerkId] = @clerkId`,
  ).catch(() => { /* ignore */ });

  // Attachments
  await pool.request().query(
    `DELETE ma FROM [dbo].[MessageAttachment] ma
     INNER JOIN [dbo].[Message] m ON ma.[messageId] = m.[id]
     INNER JOIN [dbo].[Thread] t ON m.[threadId] = t.[id]
     WHERE t.[engagementId] IN (
       SELECT e.[id] FROM [dbo].[Engagement] e
       INNER JOIN [dbo].[User] u ON e.[clientUserId] = u.[id]
       WHERE u.[clerkId] = '${SARAH_CLERK_ID}'
     )`,
  ).catch(() => { /* ignore */ });

  // ThreadReadState
  await pool.request().query(
    `DELETE trs FROM [dbo].[ThreadReadState] trs
     INNER JOIN [dbo].[User] u ON trs.[userId] = u.[id]
     WHERE u.[clerkId] IN ('${SARAH_CLERK_ID}', '${JANE_CLERK_ID_FOR_PORTAL}')`,
  ).catch(() => { /* ignore */ });

  // Messages
  await pool.request().query(
    `DELETE m FROM [dbo].[Message] m
     INNER JOIN [dbo].[Thread] t ON m.[threadId] = t.[id]
     WHERE t.[engagementId] IN (
       SELECT e.[id] FROM [dbo].[Engagement] e
       INNER JOIN [dbo].[User] u ON e.[clientUserId] = u.[id]
       WHERE u.[clerkId] = '${SARAH_CLERK_ID}'
     )`,
  ).catch(() => { /* ignore */ });

  // Threads
  await pool.request().query(
    `DELETE t FROM [dbo].[Thread] t
     WHERE t.[engagementId] IN (
       SELECT e.[id] FROM [dbo].[Engagement] e
       INNER JOIN [dbo].[User] u ON e.[clientUserId] = u.[id]
       WHERE u.[clerkId] = '${SARAH_CLERK_ID}'
     )`,
  ).catch(() => { /* ignore */ });

  // Engagements + Requests
  await pool.request().query(
    `DELETE e FROM [dbo].[Engagement] e
     INNER JOIN [dbo].[User] u ON e.[clientUserId] = u.[id]
     WHERE u.[clerkId] = '${SARAH_CLERK_ID}'`,
  ).catch(() => { /* ignore */ });

  await pool.request().query(
    `DELETE FROM [dbo].[EngagementRequest]
     WHERE [email] = N'demo-017-portal-sarah@messaging.demo.e2e.test'`,
  ).catch(() => { /* ignore */ });

  // Users
  await pool.request().query(
    `DELETE FROM [dbo].[User]
     WHERE [clerkId] IN ('${SARAH_CLERK_ID}', '${JANE_CLERK_ID_FOR_PORTAL}')`,
  ).catch(() => { /* ignore */ });
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

test.afterAll(async () => {
  await cleanupDemoPortalFixture();
  await closePool();
});

// ─── Screen 01: Engagement thread panel (AC-MSG-001-01) ──────────────────────

test(
  "[AC-MSG-001-01] @demo 01 — sarah-returning-client: engagement thread panel loads at /engagements/{id}/messages",
  async ({ page, request }) => {
    // Screen 01: sarah navigates to /engagements/{id}/messages.
    // The engagement thread panel is present (AC-MSG-001-01: one thread per engagement).
    // Screenshot: portal engagement messages panel.

    test.setTimeout(30_000);

    const fixture = await seedDemoPortalMessagingFixture();

    try {
      await setupClientSession(page, request, SARAH_CLERK_ID);
      await page.goto(`${PORTAL_URL}/engagements/${fixture.engagementId}/messages`);

      // The engagement messages panel must be present (AC-MSG-001-01).
      // Note: not using waitForLoadState("networkidle") — the SSE notification stream
      // keeps the network active indefinitely; check for the element directly.
      // data-testid from apps/portal/src/app/engagements/[engagementId]/messages/page.tsx
      const panel = page.getByTestId("portal-engagement-messages-panel");
      await expect(
        panel,
        "[AC-MSG-001-01] Portal engagement messages panel must be visible (one thread per engagement)",
      ).toBeVisible({ timeout: 15_000 });

      // Screenshot 01: portal engagement messages panel.
      await page.screenshot({
        path: shot("01-AC-MSG-001-01-portal-engagement-thread-panel.png"),
        fullPage: true,
      });
    } finally {
      await clearSession(page);
      await cleanupDemoPortalFixture();
    }
  },
);

// ─── Screen 02: Thread view + composer (AC-MSG-001-04) ───────────────────────

test(
  "[AC-MSG-001-04] @demo 02 — sarah-returning-client: thread-view shows ordered messages; MessageComposer present to reply",
  async ({ page, request }) => {
    // Screen 02: sarah sees the engagement thread with both messages (accountant + her own).
    // The MessageComposer is present so she can reply (AC-MSG-001-04).
    // Screenshot: portal thread-view with existing messages and composer.

    test.setTimeout(30_000);

    const fixture = await seedDemoPortalMessagingFixture();

    try {
      await setupClientSession(page, request, SARAH_CLERK_ID);
      await page.goto(`${PORTAL_URL}/engagements/${fixture.engagementId}/messages`);

      // Thread view must be visible (AC-MSG-001-03 / AC-MSG-001-04).
      // Note: not using waitForLoadState("networkidle") — the SSE notification stream
      // keeps the network active indefinitely; check for the element directly.
      // data-testid from ThreadView: thread-view
      const threadView = page.getByTestId("thread-view");
      await expect(
        threadView,
        "[AC-MSG-001-04] Thread view must be visible with ordered message history",
      ).toBeVisible({ timeout: 15_000 });

      // At least the accountant's seeded message must be in the thread (AC-MSG-001-03).
      const accountantMsg = page.getByTestId(`message-row-${fixture.accountantMessageId}`);
      await expect(
        accountantMsg,
        "[AC-MSG-001-04] Accountant's message must be visible (both parties' messages in thread)",
      ).toBeVisible({ timeout: 10_000 });

      // MessageComposer must be present (sarah can reply — AC-MSG-001-04).
      // data-testid from MessageComposer: message-composer
      const composer = page.getByTestId("message-composer");
      await expect(
        composer,
        "[AC-MSG-001-04] MessageComposer must be visible (sarah can reply)",
      ).toBeVisible({ timeout: 10_000 });

      // Screenshot 02: thread-view with messages and composer ready for reply.
      await page.screenshot({
        path: shot("02-AC-MSG-001-04-portal-thread-view-composer.png"),
        fullPage: true,
      });
    } finally {
      await clearSession(page);
      await cleanupDemoPortalFixture();
    }
  },
);

// ─── Screen 03: Attachment visible + download button (AC-MSG-004-03) ─────────

test(
  "[AC-MSG-004-03] @demo 03 — sarah-returning-client: active attachment visible with download button (signed URL path)",
  async ({ page, request }) => {
    // Screen 03: sarah views the engagement thread.
    // The seeded MessageAttachment (status='active') is visible with a download button.
    // AC-MSG-004-02: attachment visible to thread participants.
    // AC-MSG-004-03: participant can open/download via signed URL (ADR-009).
    // Screenshot: engagement thread with attachment item and download button visible.

    test.setTimeout(30_000);

    const fixture = await seedDemoPortalMessagingFixture();

    try {
      await setupClientSession(page, request, SARAH_CLERK_ID);
      await page.goto(`${PORTAL_URL}/engagements/${fixture.engagementId}/messages`);

      // Thread view must be visible.
      // Note: not using waitForLoadState("networkidle") — the SSE notification stream
      // keeps the network active indefinitely; check for the element directly.
      const threadView = page.getByTestId("thread-view");
      await expect(
        threadView,
        "[AC-MSG-004-03] Thread view must be visible",
      ).toBeVisible({ timeout: 15_000 });

      // The seeded active attachment must be visible alongside the message (AC-MSG-004-02).
      // data-testid from AttachmentItem: attachment-item-{id}
      const attachmentItem = page.getByTestId(`attachment-item-${fixture.seededAttachmentId}`);
      await expect(
        attachmentItem,
        "[AC-MSG-004-02] Seeded active attachment must be visible alongside the accountant's message",
      ).toBeVisible({ timeout: 15_000 });

      // The attachment filename must be displayed (AC-MSG-004-02).
      // data-testid: attachment-filename-{id}
      const filenameEl = page.getByTestId(`attachment-filename-${fixture.seededAttachmentId}`);
      await expect(
        filenameEl,
        "[AC-MSG-004-02] Attachment filename must be visible",
      ).toBeVisible();

      // Download button must be present for an active attachment (AC-MSG-004-03 / ADR-009).
      // data-testid: attachment-download-{id}
      const downloadButton = page.getByTestId(`attachment-download-${fixture.seededAttachmentId}`);
      await expect(
        downloadButton,
        "[AC-MSG-004-03] Download button must be present for active (scan-clean) attachment",
      ).toBeVisible({ timeout: 10_000 });

      // Screenshot 03: engagement thread with active attachment and download button.
      await page.screenshot({
        path: shot("03-AC-MSG-004-03-portal-attachment-download.png"),
        fullPage: true,
      });
    } finally {
      await clearSession(page);
      await cleanupDemoPortalFixture();
    }
  },
);

// ─── Screen 04: Unread indicator on engagement thread (AC-MSG-005-01) ────────

test(
  "[AC-MSG-005-01] @demo 04 — sarah-returning-client: engagement thread shows unread indicator when there are unread messages",
  async ({ page, request }) => {
    // Screen 04: sarah views the portal with unread messages in the engagement thread.
    // The engagement thread list shows an unread indicator (AC-MSG-005-01).
    // Screenshot: portal thread list with unread indicator on the engagement thread.

    test.setTimeout(30_000);

    const fixture = await seedDemoPortalMessagingFixture();

    // Ensure sarah has no ThreadReadState row so the engagement thread appears unread.
    const pool = await getPool();
    await pool.request().query(
      `DELETE trs FROM [dbo].[ThreadReadState] trs
       INNER JOIN [dbo].[User] u ON trs.[userId] = u.[id]
       WHERE u.[clerkId] = '${SARAH_CLERK_ID}'`,
    ).catch(() => { /* ignore */ });

    try {
      await setupClientSession(page, request, SARAH_CLERK_ID);
      // Navigate to a portal page that shows thread list (e.g. /messages or the portal home).
      // The portal messages list lives at /messages.
      await page.goto(`${PORTAL_URL}/messages`);

      // Thread list must be visible.
      // Note: not using waitForLoadState("networkidle") — the SSE notification stream
      // keeps the network active indefinitely; check for the element directly.
      // data-testid: thread-list (from ThreadList component on portal /messages page)
      const threadList = page.getByTestId("thread-list");
      await expect(
        threadList,
        "[AC-MSG-005-01] Thread list must be visible on /messages",
      ).toBeVisible({ timeout: 15_000 });

      // Engagement thread item must be visible with an unread indicator (AC-MSG-005-01).
      const engThreadItem = page.getByTestId(`thread-list-item-${fixture.engagementThreadId}`);
      await expect(
        engThreadItem,
        "[AC-MSG-005-01] Engagement thread list item must be visible",
      ).toBeVisible({ timeout: 10_000 });

      const unreadIndicator = engThreadItem.locator("[data-testid='unread-indicator']");
      await expect(
        unreadIndicator,
        "[AC-MSG-005-01] Engagement thread must show unread indicator (accountant sent a message sarah hasn't read)",
      ).toBeVisible({ timeout: 10_000 });

      // Screenshot 04: portal thread list with unread indicator.
      await page.screenshot({
        path: shot("04-AC-MSG-005-01-portal-unread-indicator.png"),
        fullPage: true,
      });
    } finally {
      await clearSession(page);
      await cleanupDemoPortalFixture();
    }
  },
);

// ─── Screen 05: New-message notification in portal feed (AC-MSG-014-01) ──────

test(
  "[AC-MSG-014-01] @demo 05 — sarah-returning-client: new_message notification appears in portal notification feed",
  async ({ page, request }) => {
    // Screen 05: sarah navigates to /notifications.
    // The new_message notification (seeded — accountant sent a message) is visible.
    // AC-MSG-014-01: client is notified when the accountant sends a new message.
    // Screenshot: portal /notifications page with the new_message notification visible.

    test.setTimeout(30_000);

    const fixture = await seedDemoPortalMessagingFixture();

    try {
      await setupClientSession(page, request, SARAH_CLERK_ID);
      await page.goto(`${PORTAL_URL}/notifications`);

      // The notification feed container must be visible.
      // Note: not using waitForLoadState("networkidle") — the SSE notification stream
      // keeps the network active indefinitely; check for the element directly.
      // data-testid from portal /notifications page: notification-feed
      const feed = page.getByTestId("notification-feed");
      await expect(
        feed,
        "[AC-MSG-014-01] Notification feed must be visible on /notifications",
      ).toBeVisible({ timeout: 15_000 });

      // The new_message notification must appear in the feed (AC-MSG-014-01).
      // data-testid from NotificationItem: notification-item-{id}
      const notifItem = page.getByTestId(`notification-item-${fixture.newMessageNotifId}`);
      await expect(
        notifItem,
        "[AC-MSG-014-01] new_message notification must be visible in the portal feed (accountant sent a message)",
      ).toBeVisible({ timeout: 15_000 });

      // It must have the correct notification type.
      await expect(notifItem).toHaveAttribute("data-notification-type", "new_message");

      // Screenshot 05: portal notification feed with new_message notification.
      await page.screenshot({
        path: shot("05-AC-MSG-014-01-portal-new-message-notification.png"),
        fullPage: true,
      });
    } finally {
      await clearSession(page);
      await cleanupDemoPortalFixture();
    }
  },
);
