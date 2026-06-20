/**
 * apps/admin/e2e/demo/onboarding-completion.demo.spec.ts
 *
 * @demo UI demo walkthrough — EPIC-008 Onboarding-completion capstone (admin surface).
 *
 * Not part of the e2e gate: `e2e:run` / `e2e:smoke` exclude `@demo` (--grep-invert @demo);
 * this runs ONLY via `pnpm --filter admin e2e:demo`. It drives jane-accountant's
 * onboarding-completion observation path against the live docker-compose container stack
 * (AUTH_PROVIDER=mock) and writes an AC-tagged screenshot gallery to
 * docs/demos/EPIC-008/. NON-GATING.
 *
 * Persona: jane-accountant (.planning/personas/jane-accountant.md)
 * Flows:   flow-onboarding (.planning/flows/flow-onboarding.md)
 * Policy:  .orchestration/DEMO-POLICY.md
 *
 * Gallery ordering (EPIC-008 admin surface — screenshots 01–02):
 *   01-AC-ONBD-006-01-engagement-in-progress.png
 *       — jane-accountant views the engagement document-requests page;
 *         the engagement status badge shows "In Progress" (auto-transition, no manual action).
 *         Proves AC-ONBD-006-01: onboarding completion → engagement transitions New → In Progress.
 *         Proves AC-ONBD-006-02: the transition is automatic (accountant never clicked anything).
 *   02-AC-ONBD-007-01-onboarding-complete-notification.png
 *       — jane-accountant sees the onboarding_completed notification in the notification feed.
 *         The notification title and body identify the client (AdComplDemo / name).
 *         Proves AC-ONBD-007-01: accountant receives an in-portal notification on completion.
 *         Proves AC-ONBD-007-02: the notification identifies the engagement and its client.
 *
 * Each test ASSERTS the target element is visible BEFORE screenshotting (broken UI fails loudly).
 *
 * Pre-reqs (same SUT as the e2e gate):
 *   docker compose up -d → pnpm db:migrate → pnpm db:seed
 *
 * Fixture:
 *   // DECISION (TASK-008-005): We seed the post-completion state directly (same approach as
 *   // onboarding-completion.spec.ts — admin surface), since the completion engine trigger
 *   // (processOnboardingCompletion via portal upload) is blocked by BUG-008-001 in this env.
 *   // The admin surface spec (TASK-008-004 gate) already proved the observables; this demo
 *   // captures the visual gallery.
 *   //
 *   // Distinct clerkIds use "-demo-008" suffix to avoid collision with all other suites:
 *   //   CLIENT:    "user_client_e2e_demo_008"
 *   //   ACCOUNTANT: "user_accountant_e2e_001" (shared — same ACCOUNTANT used by other suites)
 *   //
 *   // Notification schema (as confirmed by TASK-008-004 fix):
 *   //   [id], [type], [title], [body], [readAt], [engagementRequestId], [createdAt]
 *   //   No [userId] or [updatedAt] columns.
 *
 * ADR-005: Sessions are established via /api/mock-session (role set server-side). RLS
 *          policy is NOT relaxed; admin pool used for seed/teardown only.
 * ADR-006: Two-surface platform — this spec covers the admin surface (Tax Portal).
 * ADR-012: Tier-6 e2e.
 * EPIC-008: completion capstone.
 *
 * Run:
 *   ADMIN_BASE_URL=http://localhost:13001 ADMIN_PORT=13001 pnpm --filter admin e2e:demo
 */

import { test, expect } from "@playwright/test";
import path from "path";
import mssqlPkg from "mssql";
import { setupAccountantSession, clearSession } from "../fixtures/auth.js";

const { ConnectionPool } = mssqlPkg;

// Gallery output dir — repo-root/docs/demos/EPIC-008 (resolved from this file's dir).
// Depth from apps/admin/e2e/demo/ to repo root = ../../../../
// RETRO-006 item 4 / RETRO-007 obs 5 (MANDATORY): screenshots MUST write ONLY to docs/demos/EPIC-008/.
// This const is the ONLY path used; no prior-epic gallery is touched.
const DEMO_DIR = path.resolve(__dirname, "../../../../docs/demos/EPIC-008");
const shot = (file: string) => path.join(DEMO_DIR, file);

// Admin base URL — mirrors playwright.config.ts + auth.ts neighbor-squat remap.
const ADMIN_PORT_ENV = process.env["ADMIN_PORT"] ?? "3001";
const ADMIN_URL = process.env["ADMIN_BASE_URL"] ?? `http://localhost:${ADMIN_PORT_ENV}`;

// Distinct clerkId suffix "-demo-008" — avoids collision with all other suites.
const FIXTURE_CLERK_USER_ID = "user_client_e2e_demo_008";
// Accountant clerkId — same as used by other admin suites (shared ACCOUNTANT row).
const FIXTURE_ACCOUNTANT_CLERK_ID = "user_accountant_e2e_001";

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
      "[onboarding-completion.demo.spec] DATABASE_URL_ADMIN is not set. Required for admin pool seed/teardown.",
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

// ─── Fixture seed / cleanup ────────────────────────────────────────────────────

interface DemoSeedResult {
  userId: string;
  requestId: string;
  engagementId: string;
  notificationId: string;
  clientFirstName: string;
  clientLastName: string;
}

/**
 * Seeds the admin completion demo fixture.
 *
 * Seeds the post-completion state (engagement status="In Progress" + onboarding_completed
 * Notification) directly — reflecting what processOnboardingCompletion (TASK-008-001) produces.
 *
 * This is the same approach as onboarding-completion.spec.ts (TASK-008-004 gate), which
 * proved these observables. The demo captures the visual gallery of those proved states.
 *
 * Notification schema (TASK-008-004 fix confirmation):
 *   [id], [type], [title], [body], [readAt], [engagementRequestId], [createdAt]
 *   No [userId] or [updatedAt] columns.
 */
async function seedDemoFixture(): Promise<DemoSeedResult> {
  const pool = await getPool();

  // 0. Idempotent pre-cleanup for this fixture's client user
  await pool
    .request()
    .input("clerkId", FIXTURE_CLERK_USER_ID)
    .query(
      `DELETE n
       FROM [dbo].[Notification] n
       JOIN [dbo].[EngagementRequest] er ON er.[id] = n.[engagementRequestId]
       JOIN [dbo].[Engagement] e ON e.[engagementRequestId] = er.[id]
       JOIN [dbo].[User] u ON u.[id] = e.[clientUserId]
       WHERE u.[clerkId] = @clerkId`,
    );
  await pool
    .request()
    .input("clerkId", FIXTURE_CLERK_USER_ID)
    .query(
      `DELETE e
       FROM [dbo].[Engagement] e
       JOIN [dbo].[User] u ON u.[id] = e.[clientUserId]
       WHERE u.[clerkId] = @clerkId`,
    );

  // 1. Upsert client User
  const userResult = await pool
    .request()
    .input("clerkId", FIXTURE_CLERK_USER_ID)
    .input("email", "e2e-demo-008@onboarding-completion.demo.e2e.test")
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

  let userId = userResult.recordset[0]?.id;
  if (!userId) {
    const lookup = await pool
      .request()
      .input("clerkId", FIXTURE_CLERK_USER_ID)
      .query<{ id: string }>(`SELECT [id] FROM [dbo].[User] WHERE [clerkId] = @clerkId`);
    userId = lookup.recordset[0]?.id;
    if (!userId) throw new Error("[onboarding-completion.demo.spec] Failed to upsert client User");
  }

  // 2. Upsert accountant User (needed for setupAccountantSession)
  await pool
    .request()
    .input("clerkId", FIXTURE_ACCOUNTANT_CLERK_ID)
    .input("email", "e2e-accountant-001@admin-completion.e2e.test")
    .input("role", "ACCOUNTANT")
    .query(
      `MERGE [dbo].[User] AS target
       USING (SELECT @clerkId AS clerkId) AS source
         ON target.[clerkId] = source.[clerkId]
       WHEN NOT MATCHED THEN
         INSERT ([clerkId], [email], [role], [createdAt], [updatedAt])
         VALUES (@clerkId, @email, @role, SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET());`,
    );

  const clientFirstName = "AdComplDemo";
  const clientLastName = "Gallery";

  // 3. EngagementRequest
  const requestResult = await pool
    .request()
    .input("firstName", clientFirstName)
    .input("lastName", clientLastName)
    .input("email", `e2e-demo-008-req-${Date.now()}@onboarding-completion.demo.e2e.test`)
    .query<{ id: string }>(
      `INSERT INTO [dbo].[EngagementRequest]
         ([firstName], [lastName], [email], [status], [createdAt], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES (@firstName, @lastName, @email, 'accepted', SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET())`,
    );

  const requestId = requestResult.recordset[0]?.id;
  if (!requestId) throw new Error("[onboarding-completion.demo.spec] Failed to seed EngagementRequest");

  // 4. Engagement — status="In Progress" (post-completion state from processOnboardingCompletion)
  const evidenceJson = JSON.stringify({
    provider: "mock",
    ref: "e2e-demo-008-mock-ref",
    signedAt: new Date().toISOString(),
  });

  const engagementResult = await pool
    .request()
    .input("engagementRequestId", requestId)
    .input("clientUserId", userId)
    .input("status", "In Progress")
    .input("letterSignedAt", new Date())
    .input("letterSignatureEvidence", evidenceJson)
    .input("letterTemplateSnapshot", "E2E demo-008 completion letter snapshot")
    .input("questionnaireSubmittedAt", new Date())
    .query<{ id: string }>(
      `INSERT INTO [dbo].[Engagement]
         ([engagementRequestId], [clientUserId], [status],
          [letterSignedAt], [letterSignatureEvidence], [letterTemplateSnapshot],
          [questionnaireSubmittedAt],
          [createdAt], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES (@engagementRequestId, @clientUserId, @status,
               @letterSignedAt, @letterSignatureEvidence, @letterTemplateSnapshot,
               @questionnaireSubmittedAt,
               SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET())`,
    );

  const engagementId = engagementResult.recordset[0]?.id;
  if (!engagementId) throw new Error("[onboarding-completion.demo.spec] Failed to seed Engagement");

  // 5. Notification — onboarding_completed (as emitted by processOnboardingCompletion)
  // Schema: [id], [type], [title], [body], [readAt], [engagementRequestId], [createdAt]
  const clientFullName = `${clientFirstName} ${clientLastName}`;
  const notifTitle = `Onboarding complete for ${clientFullName}`;
  const notifBody = `${clientFullName} has completed all onboarding steps. Their engagement is now in progress.`;

  const notifResult = await pool
    .request()
    .input("type", "onboarding_completed")
    .input("title", notifTitle)
    .input("body", notifBody)
    .input("engagementRequestId", requestId)
    .query<{ id: string }>(
      `INSERT INTO [dbo].[Notification]
         ([type], [title], [body], [engagementRequestId])
       OUTPUT INSERTED.[id]
       VALUES (@type, @title, @body, @engagementRequestId)`,
    );

  const notificationId = notifResult.recordset[0]?.id;
  if (!notificationId) throw new Error("[onboarding-completion.demo.spec] Failed to seed Notification");

  return {
    userId: userId.toLowerCase(),
    requestId: requestId.toLowerCase(),
    engagementId: engagementId.toLowerCase(),
    notificationId: notificationId.toLowerCase(),
    clientFirstName,
    clientLastName,
  };
}

async function cleanupDemoFixture(requestId: string): Promise<void> {
  const pool = await getPool();

  // Notifications — delete by engagementRequestId FK
  await pool.request().input("requestId", requestId).query(
    `DELETE FROM [dbo].[Notification] WHERE [engagementRequestId] = @requestId`,
  );
  // Engagement
  await pool.request().input("requestId", requestId).query(
    `DELETE FROM [dbo].[Engagement] WHERE [engagementRequestId] = @requestId`,
  );
  // EngagementRequest
  await pool.request().input("requestId", requestId).query(
    `DELETE FROM [dbo].[EngagementRequest] WHERE [id] = @requestId`,
  );
}

async function cleanupClientUser(): Promise<void> {
  const pool = await getPool();
  await pool
    .request()
    .input("clerkId", FIXTURE_CLERK_USER_ID)
    .query(`DELETE FROM [dbo].[User] WHERE [clerkId] = @clerkId`);
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

test.afterAll(async () => {
  await cleanupClientUser();
  await closePool();
});

// ─── Screen 01: Accountant sees engagement "In Progress" (AC-ONBD-006-01 / AC-ONBD-006-02) ──

test(
  "[AC-ONBD-006-01] [AC-ONBD-006-02] @demo 01 — jane-accountant: engagement shows In Progress after onboarding completion (automatic, no manual action)",
  async ({ page, request }) => {
    // Screen 01: jane-accountant navigates to the document-requests page for the completed
    // engagement. Without any manual action on her part, the engagement status badge shows
    // "In Progress" (auto-transitioned by processOnboardingCompletion).
    //
    // Proves:
    //   AC-ONBD-006-01: completion → engagement status transitions New → In Progress
    //   AC-ONBD-006-02: the transition is automatic — accountant took no manual action
    //
    // Screenshot: full-page document-requests admin page showing the "In Progress" badge.
    // Assert-before-screenshot: engagement-status badge must be visible + have data-status="In Progress".

    let seeded: DemoSeedResult | null = null;

    try {
      seeded = await seedDemoFixture();
      await setupAccountantSession(page, request);

      // Navigate to the engagement's document-requests page in admin
      await page.goto(`${ADMIN_URL}/engagements/${seeded.engagementId}/document-requests`);

      // Assert: the engagement-status badge is visible and shows "In Progress"
      const statusBadge = page.locator('[data-testid="engagement-status"]');
      await expect(
        statusBadge,
        "engagement-status badge must be visible (AC-ONBD-006-01)",
      ).toBeVisible({ timeout: 15_000 });
      await expect(
        statusBadge,
        "engagement-status must have data-status='In Progress' (AC-ONBD-006-01)",
      ).toHaveAttribute("data-status", "In Progress", { timeout: 10_000 });
      await expect(
        statusBadge,
        "engagement-status badge must contain text 'In Progress'",
      ).toContainText("In Progress");

      // Screenshot 01: engagement showing "In Progress" status (auto-transition, no accountant action)
      await page.screenshot({
        path: shot("01-AC-ONBD-006-01-engagement-in-progress.png"),
        fullPage: true,
      });
    } finally {
      await clearSession(page);
      if (seeded) await cleanupDemoFixture(seeded.requestId);
    }
  },
);

// ─── Screen 02: Accountant sees onboarding_completed notification (AC-ONBD-007-01 / AC-ONBD-007-02) ──

test(
  "[AC-ONBD-007-01] [AC-ONBD-007-02] @demo 02 — jane-accountant: onboarding_completed notification in feed identifies client",
  async ({ page, request }) => {
    // Screen 02: jane-accountant navigates to /requests which renders NotificationsIndicator.
    // The notification feed shows an onboarding_completed notification with the client's
    // name in both the title and body — identifying the engagement and its client.
    //
    // Proves:
    //   AC-ONBD-007-01: accountant receives an in-portal notification on completion
    //   AC-ONBD-007-02: the notification identifies the engagement and its client
    //
    // Screenshot: full-page /requests page showing the onboarding_completed notification
    // with client name visible in the notification title and body.

    let seeded: DemoSeedResult | null = null;

    try {
      seeded = await seedDemoFixture();
      await setupAccountantSession(page, request);

      // Navigate to /requests (NotificationsIndicator rendered here)
      await page.goto(`${ADMIN_URL}/requests`);

      // Assert: notification-list is visible
      const notifList = page.locator('[data-testid="notification-list"]');
      await expect(
        notifList,
        "notification-list must be visible (AC-ONBD-007-01)",
      ).toBeVisible({ timeout: 15_000 });

      // Assert: onboarding_completed notification is present
      const onboardingNotif = notifList.locator(
        '[data-notification-type="onboarding_completed"]',
      );
      await expect(
        onboardingNotif.first(),
        "onboarding_completed notification must be visible in feed (AC-ONBD-007-01)",
      ).toBeVisible({ timeout: 10_000 });

      // Assert: notification identifies the client by name (AC-ONBD-007-02)
      const clientFullName = `${seeded.clientFirstName} ${seeded.clientLastName}`;
      await expect(
        onboardingNotif.first(),
        `notification must contain client name '${clientFullName}' (AC-ONBD-007-02)`,
      ).toContainText(seeded.clientFirstName, { timeout: 10_000 });

      // Assert: notification body identifies the engagement context (AC-ONBD-007-02)
      const notifBody = onboardingNotif.first().locator('[data-testid^="notification-body-"]');
      await expect(
        notifBody,
        "notification-body must be visible (AC-ONBD-007-02)",
      ).toBeVisible({ timeout: 10_000 });
      await expect(
        notifBody,
        "notification body must contain client name to identify engagement (AC-ONBD-007-02)",
      ).toContainText(seeded.clientFirstName);

      // Screenshot 02: notification feed showing onboarding_completed with client identification
      await page.screenshot({
        path: shot("02-AC-ONBD-007-01-onboarding-complete-notification.png"),
        fullPage: true,
      });
    } finally {
      await clearSession(page);
      if (seeded) await cleanupDemoFixture(seeded.requestId);
    }
  },
);
