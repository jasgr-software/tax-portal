/**
 * apps/admin/e2e/demo/messaging.demo.spec.ts
 *
 * @demo UI demo walkthrough — EPIC-017 Messaging gallery (admin / Tax Portal surface).
 *
 * Not part of the e2e gate: `e2e:run` / `e2e:smoke` exclude `@demo` (--grep-invert @demo);
 * this runs ONLY via `pnpm --filter admin e2e:demo`. It drives jane-accountant's messaging
 * happy-path against the live docker-compose container stack (AUTH_PROVIDER=mock) and
 * writes an AC-tagged screenshot gallery to docs/demos/EPIC-017/. NON-GATING.
 *
 * Persona:   jane-accountant (.planning/personas/jane-accountant.md)
 * Flow:      flow-message-exchange (.planning/flows/flow-message-exchange.md)
 * Policy:    .orchestration/DEMO-POLICY.md
 *
 * Gallery ordering (EPIC-017 admin surface — screenshots 06–10):
 *   06-AC-MSG-001-01-admin-engagement-thread-panel.png
 *       — jane sees the engagement thread panel on /engagements/{id}/messages (AC-MSG-001-01)
 *   07-AC-MSG-001-04-admin-thread-view-composer.png
 *       — thread-view shows existing messages; MessageComposer is present (AC-MSG-001-04)
 *   08-AC-MSG-002-01-admin-general-thread-created.png
 *       — jane opens the general-thread form and sees the client selector populated (AC-MSG-002-01)
 *   09-AC-MSG-005-02-admin-unread-indicators.png
 *       — both engagement and general threads show unread indicators in the hub (AC-MSG-005-02)
 *   10-AC-MSG-004-02-admin-attachment-visible.png
 *       — seeded active attachment is visible alongside the message in the thread (AC-MSG-004-02)
 *
 * Each test ASSERTS the target element is visible BEFORE screenshotting (broken UI fails loudly).
 *
 * retro-012-012 (MANDATORY): screenshots MUST write ONLY to docs/demos/EPIC-017/ so prior-epic
 * PNGs are not rewritten. The DEMO_DIR const is the ONLY path used. // CS-GEN-001
 *
 * ADR-006: Admin surface only (Tax Portal). // ADR-006
 * ADR-012: Tier-6 e2e (demo variant — non-gating). // ADR-012
 * CS-TS-003: Mirror of portal messaging demo spec (same DB, different surface). // CS-TS-003
 * CS-GEN-003: AC ids cited in every test and screenshot name. // CS-GEN-003
 *
 * Run:
 *   pnpm --filter admin e2e:demo
 *   ADMIN_BASE_URL=http://localhost:13001 ADMIN_PORT=13001 pnpm --filter admin e2e:demo
 *
 * // ADR-006 // ADR-012 // CS-TS-003 // CS-GEN-001 // CS-GEN-003
 */

import { test, expect } from "@playwright/test";
import path from "path";
import mssqlPkg from "mssql";
import { setupAccountantSession, clearSession } from "../fixtures/auth.js";

const { ConnectionPool } = mssqlPkg;

// Gallery output dir — repo-root/docs/demos/EPIC-017 (resolved from this file's dir).
// Depth from apps/admin/e2e/demo/ to repo root = ../../../../
// retro-012-012 (MANDATORY): screenshots MUST write ONLY to docs/demos/EPIC-017/.
// This const is the ONLY path used; no prior-epic gallery is touched. // CS-GEN-001
const DEMO_DIR = path.resolve(__dirname, "../../../../docs/demos/EPIC-017");
const shot = (file: string) => path.join(DEMO_DIR, file);

const ADMIN_PORT = process.env["ADMIN_PORT"] ?? "3001";
const ADMIN_URL = process.env["ADMIN_BASE_URL"] ?? `http://localhost:${ADMIN_PORT}`;

// Deterministic fixture clerkIds — "-demo-017-jane" suffix avoids collision with e2e gate specs.
// CS-GEN-001: no real PII — test-only identifiers.
const JANE_CLERK_ID = "user_accountant_demo_017_jane";
const SARAH_CLERK_ID_FOR_ADMIN = "user_client_demo_017_admin_sarah";

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
      "[messaging.demo.spec] DATABASE_URL_ADMIN is not set. Required for admin pool seed/teardown.",
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

interface DemoAdminMessagingFixture {
  clientUserId: string;
  engagementId: string;
  engagementThreadId: string;
  clientMessageId: string;
  accountantMessageId: string;
  generalThreadId: string;
  generalThreadMessageId: string;
  seededAttachmentId: string;
}

// ─── Fixture seed ─────────────────────────────────────────────────────────────

/**
 * Seeds the admin messaging demo fixture:
 *   1. ACCOUNTANT user row (jane-accountant clerkId — for ThreadReadState FK).
 *   2. CLIENT user row (sarah — to be selectable in the client selector).
 *   3. EngagementRequest + active Engagement (jane ↔ sarah).
 *   4. Thread (kind='engagement') for the Engagement.
 *   5. Two Messages in the engagement thread (one client, one accountant).
 *   6. General Thread (kind='general') for sarah.
 *   7. A Message in the general thread (from sarah → accountant has unread).
 *   8. A MessageAttachment row (status='active') on the accountant's message.
 *
 * DECISION (TASK-017-009): Demo suffix "-demo-017-jane" avoids collision with
 * the e2e gate suite (TASK-017-008) which uses "-017-008" suffixes.
 * CS-GEN-001: generic bodies/emails — no PII. // CS-GEN-001
 */
async function seedDemoAdminMessagingFixture(): Promise<DemoAdminMessagingFixture> {
  const pool = await getPool();

  // Idempotent pre-cleanup
  await cleanupDemoAdminFixture().catch(() => { /* first run */ });

  // 1. Upsert ACCOUNTANT User row (jane — required for ThreadReadState FK).
  // DECISION: seed explicitly; cleanupDemoAdminFixture removes it. // CS-GEN-003
  await pool
    .request()
    .input("clerkId", JANE_CLERK_ID)
    .input("email", "demo-017-jane@messaging.demo.e2e.test")
    .query(
      `MERGE [dbo].[User] AS target
       USING (SELECT @clerkId AS clerkId) AS source ON target.[clerkId] = source.[clerkId]
       WHEN NOT MATCHED THEN
         INSERT ([clerkId], [email], [role], [createdAt], [updatedAt])
         VALUES (@clerkId, @email, N'ACCOUNTANT', SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET());`,
    );

  // 2. Upsert CLIENT User row (sarah — for general-thread clientUserId + client selector).
  const clientResult = await pool
    .request()
    .input("clerkId", SARAH_CLERK_ID_FOR_ADMIN)
    .input("email", "demo-017-sarah-admin@messaging.demo.e2e.test")
    .query<{ id: string }>(
      `MERGE [dbo].[User] AS target
       USING (SELECT @clerkId AS clerkId) AS source ON target.[clerkId] = source.[clerkId]
       WHEN NOT MATCHED THEN
         INSERT ([clerkId], [email], [role], [createdAt], [updatedAt])
         VALUES (@clerkId, @email, N'CLIENT', SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET())
       OUTPUT INSERTED.[id];`,
    );

  let clientUserId = clientResult.recordset[0]?.id;
  if (!clientUserId) {
    const lu = await pool
      .request()
      .input("clerkId", SARAH_CLERK_ID_FOR_ADMIN)
      .query<{ id: string }>(`SELECT [id] FROM [dbo].[User] WHERE [clerkId] = @clerkId`);
    clientUserId = lu.recordset[0]?.id;
    if (!clientUserId) throw new Error("[messaging.demo.spec] Failed to upsert CLIENT User");
  }

  // 3. Seed EngagementRequest + active Engagement.
  const reqResult = await pool
    .request()
    .input("email", "demo-017-sarah-admin@messaging.demo.e2e.test")
    .query<{ id: string }>(
      `INSERT INTO [dbo].[EngagementRequest]
         ([firstName], [lastName], [email], [status], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES (N'DemoJane017', N'MessagingClient', @email, N'accepted', SYSDATETIMEOFFSET())`,
    );
  const requestId = reqResult.recordset[0]?.id;
  if (!requestId) throw new Error("[messaging.demo.spec] Failed to seed EngagementRequest");

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
  if (!engagementId) throw new Error("[messaging.demo.spec] Failed to seed Engagement");

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
  if (!engagementThreadId) throw new Error("[messaging.demo.spec] Failed to seed engagement Thread");

  // 5. Seed two Messages (client + accountant).
  // CS-GEN-001: generic bodies — no PII. // CS-GEN-001
  const clientMsgResult = await pool
    .request()
    .input("threadId", engagementThreadId)
    .input("senderClerkId", SARAH_CLERK_ID_FOR_ADMIN)
    .query<{ id: string }>(
      `INSERT INTO [dbo].[Message] ([threadId], [senderClerkId], [body], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES (@threadId, @senderClerkId, N'Client demo message (EPIC-017 demo seed)', SYSDATETIMEOFFSET())`,
    );
  const clientMessageId = clientMsgResult.recordset[0]?.id;
  if (!clientMessageId) throw new Error("[messaging.demo.spec] Failed to seed client Message");

  const accountantMsgResult = await pool
    .request()
    .input("threadId", engagementThreadId)
    .input("senderClerkId", JANE_CLERK_ID)
    .query<{ id: string }>(
      `INSERT INTO [dbo].[Message] ([threadId], [senderClerkId], [body], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES (@threadId, @senderClerkId, N'Accountant demo reply (EPIC-017 demo seed)', SYSDATETIMEOFFSET())`,
    );
  const accountantMessageId = accountantMsgResult.recordset[0]?.id;
  if (!accountantMessageId) throw new Error("[messaging.demo.spec] Failed to seed accountant Message");

  // 6. Seed general Thread (kind='general') for the same client.
  const generalThreadResult = await pool
    .request()
    .input("clientUserId", clientUserId)
    .query<{ id: string }>(
      `INSERT INTO [dbo].[Thread] ([kind], [clientUserId], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES (N'general', @clientUserId, SYSDATETIMEOFFSET())`,
    );
  const generalThreadId = generalThreadResult.recordset[0]?.id;
  if (!generalThreadId) throw new Error("[messaging.demo.spec] Failed to seed general Thread");

  // 7. Seed an unread message in the general thread (from sarah → accountant has unread).
  // AC-MSG-005-02: general thread unread indicator.
  const generalMsgResult = await pool
    .request()
    .input("threadId", generalThreadId)
    .input("senderClerkId", SARAH_CLERK_ID_FOR_ADMIN)
    .query<{ id: string }>(
      `INSERT INTO [dbo].[Message] ([threadId], [senderClerkId], [body], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES (@threadId, @senderClerkId, N'General thread demo message (EPIC-017 demo seed)', SYSDATETIMEOFFSET())`,
    );
  const generalThreadMessageId = generalMsgResult.recordset[0]?.id;
  if (!generalThreadMessageId) throw new Error("[messaging.demo.spec] Failed to seed general Thread Message");

  // 8. Seed a MessageAttachment row (status='active') on the accountant's message.
  // DECISION (TASK-017-009): seed via DB pool (active status = scan already passed).
  // BUG-008-001 pattern: Azurite unreachable from host browser; seed attachment directly.
  // AC-MSG-004-02: attachment visible alongside the message. // ADR-009 // CS-GEN-001
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
         N'e2e-demo/attachments/demo-017-attachment.txt',
         N'demo-017-attachment.txt',
         N'text/plain',
         128,
         N'active',
         '${JANE_CLERK_ID}',
         SYSDATETIMEOFFSET()
       )`,
    );
  const seededAttachmentId = attachResult.recordset[0]?.id;
  if (!seededAttachmentId) throw new Error("[messaging.demo.spec] Failed to seed MessageAttachment");

  return {
    clientUserId: clientUserId.toLowerCase(),
    engagementId: engagementId.toLowerCase(),
    engagementThreadId: engagementThreadId.toLowerCase(),
    clientMessageId: clientMessageId.toLowerCase(),
    accountantMessageId: accountantMessageId.toLowerCase(),
    generalThreadId: generalThreadId.toLowerCase(),
    generalThreadMessageId: generalThreadMessageId.toLowerCase(),
    seededAttachmentId: seededAttachmentId.toLowerCase(),
  };
}

/**
 * Cleanup all seeded rows (cascade-ordered for FK safety).
 * Idempotent — ignores "row not found" errors.
 */
async function cleanupDemoAdminFixture(): Promise<void> {
  const pool = await getPool();

  // Attachments first
  await pool.request().query(
    `DELETE ma FROM [dbo].[MessageAttachment] ma
     INNER JOIN [dbo].[Message] m ON ma.[messageId] = m.[id]
     INNER JOIN [dbo].[Thread] t ON m.[threadId] = t.[id]
     WHERE t.[clientUserId] IN (
       SELECT u.[id] FROM [dbo].[User] u WHERE u.[clerkId] = '${SARAH_CLERK_ID_FOR_ADMIN}'
     )
     OR t.[engagementId] IN (
       SELECT e.[id] FROM [dbo].[Engagement] e
       INNER JOIN [dbo].[User] u ON e.[clientUserId] = u.[id]
       WHERE u.[clerkId] = '${SARAH_CLERK_ID_FOR_ADMIN}'
     )`,
  ).catch(() => { /* ignore */ });

  // ThreadReadState rows
  await pool.request().query(
    `DELETE trs FROM [dbo].[ThreadReadState] trs
     INNER JOIN [dbo].[User] u ON trs.[userId] = u.[id]
     WHERE u.[clerkId] IN ('${JANE_CLERK_ID}', '${SARAH_CLERK_ID_FOR_ADMIN}')`,
  ).catch(() => { /* ignore */ });

  // Messages
  await pool.request().query(
    `DELETE m FROM [dbo].[Message] m
     INNER JOIN [dbo].[Thread] t ON m.[threadId] = t.[id]
     WHERE t.[clientUserId] IN (
       SELECT u.[id] FROM [dbo].[User] u WHERE u.[clerkId] = '${SARAH_CLERK_ID_FOR_ADMIN}'
     )
     OR t.[engagementId] IN (
       SELECT e.[id] FROM [dbo].[Engagement] e
       INNER JOIN [dbo].[User] u ON e.[clientUserId] = u.[id]
       WHERE u.[clerkId] = '${SARAH_CLERK_ID_FOR_ADMIN}'
     )`,
  ).catch(() => { /* ignore */ });

  // Threads
  await pool.request().query(
    `DELETE t FROM [dbo].[Thread] t
     WHERE t.[clientUserId] IN (
       SELECT u.[id] FROM [dbo].[User] u WHERE u.[clerkId] = '${SARAH_CLERK_ID_FOR_ADMIN}'
     )
     OR t.[engagementId] IN (
       SELECT e.[id] FROM [dbo].[Engagement] e
       INNER JOIN [dbo].[User] u ON e.[clientUserId] = u.[id]
       WHERE u.[clerkId] = '${SARAH_CLERK_ID_FOR_ADMIN}'
     )`,
  ).catch(() => { /* ignore */ });

  // Engagements + Requests
  await pool.request().query(
    `DELETE e FROM [dbo].[Engagement] e
     INNER JOIN [dbo].[User] u ON e.[clientUserId] = u.[id]
     WHERE u.[clerkId] = '${SARAH_CLERK_ID_FOR_ADMIN}'`,
  ).catch(() => { /* ignore */ });

  await pool.request().query(
    `DELETE FROM [dbo].[EngagementRequest]
     WHERE [email] = N'demo-017-sarah-admin@messaging.demo.e2e.test'`,
  ).catch(() => { /* ignore */ });

  // Users
  await pool.request().query(
    `DELETE FROM [dbo].[User]
     WHERE [clerkId] IN ('${JANE_CLERK_ID}', '${SARAH_CLERK_ID_FOR_ADMIN}')`,
  ).catch(() => { /* ignore */ });
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

test.afterAll(async () => {
  await cleanupDemoAdminFixture();
  await closePool();
});

// ─── Screen 06: Engagement thread panel (AC-MSG-001-01) ──────────────────────

test(
  "[AC-MSG-001-01] @demo 06 — jane-accountant: engagement thread panel loads at /engagements/{id}/messages",
  async ({ page, request }) => {
    // Screen 06: jane navigates to /engagements/{id}/messages.
    // The engagement thread panel is present (AC-MSG-001-01: one thread per engagement).
    // Screenshot: admin engagement messages panel with the thread visible.

    test.setTimeout(30_000);

    const fixture = await seedDemoAdminMessagingFixture();

    try {
      await setupAccountantSession(page, request, JANE_CLERK_ID);
      await page.goto(`${ADMIN_URL}/engagements/${fixture.engagementId}/messages`);

      // The engagement messages panel must be present (AC-MSG-001-01).
      // Note: not using waitForLoadState("networkidle") — the SSE notification stream
      // keeps the network active indefinitely; check for the element directly.
      // data-testid from apps/admin/src/app/engagements/[engagementId]/messages/page.tsx
      const panel = page.getByTestId("admin-engagement-messages-panel");
      await expect(
        panel,
        "[AC-MSG-001-01] Engagement messages panel must be visible (one thread per engagement)",
      ).toBeVisible({ timeout: 15_000 });

      // Screenshot 06: engagement messages panel.
      await page.screenshot({
        path: shot("06-AC-MSG-001-01-admin-engagement-thread-panel.png"),
        fullPage: true,
      });
    } finally {
      await clearSession(page);
      await cleanupDemoAdminFixture();
    }
  },
);

// ─── Screen 07: Thread view + composer (AC-MSG-001-04) ───────────────────────

test(
  "[AC-MSG-001-04] @demo 07 — jane-accountant: thread-view shows ordered messages; MessageComposer present",
  async ({ page, request }) => {
    // Screen 07: jane sees the engagement thread with both messages (client + accountant).
    // The MessageComposer is present so she can send a new message (AC-MSG-001-04).
    // Screenshot: thread-view with existing messages and composer visible.

    test.setTimeout(30_000);

    const fixture = await seedDemoAdminMessagingFixture();

    try {
      await setupAccountantSession(page, request, JANE_CLERK_ID);
      await page.goto(`${ADMIN_URL}/engagements/${fixture.engagementId}/messages`);

      // Thread view must be visible (AC-MSG-001-03 / AC-MSG-001-04).
      // Note: not using waitForLoadState("networkidle") — the SSE notification stream
      // keeps the network active indefinitely; check for the element directly.
      // data-testid from ThreadView: thread-view
      const threadView = page.getByTestId("thread-view");
      await expect(
        threadView,
        "[AC-MSG-001-04] Thread view must be visible with ordered message history",
      ).toBeVisible({ timeout: 15_000 });

      // MessageComposer must be present (accountant can contribute — AC-MSG-001-04).
      // data-testid from MessageComposer: message-composer
      const composer = page.getByTestId("message-composer");
      await expect(
        composer,
        "[AC-MSG-001-04] MessageComposer must be visible (jane can send a message)",
      ).toBeVisible({ timeout: 10_000 });

      // Screenshot 07: thread-view with existing messages and composer.
      await page.screenshot({
        path: shot("07-AC-MSG-001-04-admin-thread-view-composer.png"),
        fullPage: true,
      });
    } finally {
      await clearSession(page);
      await cleanupDemoAdminFixture();
    }
  },
);

// ─── Screen 08: General thread form with client selector (AC-MSG-002-01) ─────

test(
  "[AC-MSG-002-01] @demo 08 — jane-accountant: general-thread form expands; client selector populated",
  async ({ page, request }) => {
    // Screen 08: jane opens the messages hub and clicks "New Message Thread".
    // The form expands showing the client selector (populated by listClientsAction).
    // AC-MSG-002-01: accountant can start a general thread with a client.
    // Screenshot: messages hub with the general-thread form open.

    test.setTimeout(30_000);

    const fixture = await seedDemoAdminMessagingFixture();

    try {
      await setupAccountantSession(page, request, JANE_CLERK_ID);
      await page.goto(`${ADMIN_URL}/messages`);

      // The messages hub panel must be visible.
      // Note: not using waitForLoadState("networkidle") — the SSE notification stream
      // keeps the network active indefinitely; check for the element directly.
      // data-testid from apps/admin/src/app/messages/page.tsx: admin-messages-panel
      const panel = page.getByTestId("admin-messages-panel");
      await expect(
        panel,
        "[AC-MSG-002-01] Admin messages hub panel must be visible at /messages",
      ).toBeVisible({ timeout: 15_000 });

      // Click "New Message Thread" to expand the StartGeneralThread form.
      // data-testid from StartGeneralThread.tsx: start-general-thread-button
      const newThreadButton = page.getByTestId("start-general-thread-button");
      await expect(
        newThreadButton,
        "[AC-MSG-002-01] Start-new-thread button must be visible",
      ).toBeVisible({ timeout: 10_000 });
      await newThreadButton.click();

      // The form must expand (AC-MSG-002-01).
      // data-testid: start-general-thread-form
      const form = page.getByTestId("start-general-thread-form");
      await expect(
        form,
        "[AC-MSG-002-01] Start-thread form must expand after clicking",
      ).toBeVisible({ timeout: 10_000 });

      // The client selector must be visible and populated by listClientsAction.
      // data-testid: select-client
      const clientSelector = page.getByTestId("select-client");
      await expect(
        clientSelector,
        "[AC-MSG-002-01] Client selector must be visible",
      ).toBeVisible({ timeout: 10_000 });

      // Wait for the client selector to populate (useEffect → listClientsAction).
      await expect
        .poll(
          async () => {
            const options = await clientSelector.evaluate((el: HTMLSelectElement) =>
              Array.from(el.options).filter((o) => o.value !== "").length,
            );
            return options;
          },
          {
            message: "[AC-MSG-002-01] Client selector must be populated with at least one client",
            timeout: 15_000,
            intervals: [200, 500, 1000],
          },
        )
        .toBeGreaterThan(0);

      // Screenshot 08: messages hub with the general-thread form and populated selector.
      await page.screenshot({
        path: shot("08-AC-MSG-002-01-admin-general-thread-created.png"),
        fullPage: true,
      });
    } finally {
      await clearSession(page);
      await cleanupDemoAdminFixture();
    }
  },
);

// ─── Screen 09: Unread indicators on both thread kinds (AC-MSG-005-02) ───────

test(
  "[AC-MSG-005-02] @demo 09 — jane-accountant: both engagement + general threads show unread indicators in messages hub",
  async ({ page, request }) => {
    // Screen 09: jane views the messages hub thread list.
    // Both the engagement thread and the general thread show unread indicators
    // (AC-MSG-005-02: unread indicator shown on all threads, engagement and general).
    // Screenshot: messages hub with unread indicators visible on both thread kinds.

    test.setTimeout(30_000);

    const fixture = await seedDemoAdminMessagingFixture();

    // Clear any prior ThreadReadState for jane so both threads appear unread.
    // This ensures the demo accurately captures the unread-indicator state.
    // DECISION: explicit cleanup before read-state assertions for demo determinism. // CS-GEN-003
    const pool = await getPool();
    await pool.request().query(
      `DELETE trs FROM [dbo].[ThreadReadState] trs
       INNER JOIN [dbo].[User] u ON trs.[userId] = u.[id]
       WHERE u.[clerkId] = '${JANE_CLERK_ID}'`,
    ).catch(() => { /* ignore */ });

    try {
      await setupAccountantSession(page, request, JANE_CLERK_ID);
      await page.goto(`${ADMIN_URL}/messages`);

      // Thread list must be visible.
      // Note: not using waitForLoadState("networkidle") — the SSE notification stream
      // keeps the network active indefinitely; check for the element directly.
      // data-testid: thread-list
      const threadList = page.getByTestId("thread-list");
      await expect(
        threadList,
        "[AC-MSG-005-02] Thread list must be visible in the messages hub",
      ).toBeVisible({ timeout: 15_000 });

      // At least one unread indicator visible (AC-MSG-005-01).
      const unreadIndicators = page.locator("[data-testid='unread-indicator']");
      await expect(
        unreadIndicators.first(),
        "[AC-MSG-005-02] At least one unread indicator must be visible (client sent messages jane hasn't read)",
      ).toBeVisible({ timeout: 10_000 });

      // Engagement thread item must show unread (AC-MSG-005-02: engagement kind).
      const engThreadItem = page.getByTestId(`thread-list-item-${fixture.engagementThreadId}`);
      await expect(
        engThreadItem,
        "[AC-MSG-005-02] Engagement thread list item must be visible",
      ).toBeVisible({ timeout: 10_000 });

      const engUnread = engThreadItem.locator("[data-testid='unread-indicator']");
      await expect(
        engUnread,
        "[AC-MSG-005-02] Engagement thread must show unread indicator",
      ).toBeVisible();

      // General thread item must show unread (AC-MSG-005-02: general kind).
      const genThreadItem = page.getByTestId(`thread-list-item-${fixture.generalThreadId}`);
      await expect(
        genThreadItem,
        "[AC-MSG-005-02] General thread list item must be visible",
      ).toBeVisible({ timeout: 10_000 });

      const genUnread = genThreadItem.locator("[data-testid='unread-indicator']");
      await expect(
        genUnread,
        "[AC-MSG-005-02] General thread must show unread indicator",
      ).toBeVisible();

      // Screenshot 09: messages hub with unread indicators on both thread kinds.
      await page.screenshot({
        path: shot("09-AC-MSG-005-02-admin-unread-indicators.png"),
        fullPage: true,
      });
    } finally {
      await clearSession(page);
      await cleanupDemoAdminFixture();
    }
  },
);

// ─── Screen 10: Attachment visible alongside message (AC-MSG-004-02) ─────────

test(
  "[AC-MSG-004-02] @demo 10 — jane-accountant: active attachment visible alongside the message in engagement thread",
  async ({ page, request }) => {
    // Screen 10: jane views the engagement thread.
    // The seeded MessageAttachment (status='active') is visible alongside the message.
    // AC-MSG-004-02: attachments visible to thread participants.
    // Screenshot: engagement thread with attachment item visible.

    test.setTimeout(30_000);

    const fixture = await seedDemoAdminMessagingFixture();

    try {
      await setupAccountantSession(page, request, JANE_CLERK_ID);
      await page.goto(`${ADMIN_URL}/engagements/${fixture.engagementId}/messages`);

      // Thread view must be visible.
      // Note: not using waitForLoadState("networkidle") — the SSE notification stream
      // keeps the network active indefinitely; check for the element directly.
      const threadView = page.getByTestId("thread-view");
      await expect(
        threadView,
        "[AC-MSG-004-02] Thread view must be visible",
      ).toBeVisible({ timeout: 15_000 });

      // The seeded active attachment must be visible alongside the message (AC-MSG-004-02).
      // data-testid from AttachmentItem: attachment-item-{id}
      const attachmentItem = page.getByTestId(`attachment-item-${fixture.seededAttachmentId}`);
      await expect(
        attachmentItem,
        "[AC-MSG-004-02] Seeded active attachment must be visible alongside the accountant's message",
      ).toBeVisible({ timeout: 15_000 });

      // The attachment filename must be displayed.
      // data-testid: attachment-filename-{id}
      const filenameEl = page.getByTestId(`attachment-filename-${fixture.seededAttachmentId}`);
      await expect(
        filenameEl,
        "[AC-MSG-004-02] Attachment filename must be visible",
      ).toBeVisible();

      // Screenshot 10: engagement thread with active attachment visible.
      await page.screenshot({
        path: shot("10-AC-MSG-004-02-admin-attachment-visible.png"),
        fullPage: true,
      });
    } finally {
      await clearSession(page);
      await cleanupDemoAdminFixture();
    }
  },
);
