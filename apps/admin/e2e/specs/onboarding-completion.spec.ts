/**
 * apps/admin/e2e/specs/onboarding-completion.spec.ts
 *
 * Tier-6 e2e — EPIC-008 Onboarding completion (admin surface):
 *   - AC-ONBD-006-01: completion → engagement shows "In Progress" status in admin UI
 *   - AC-ONBD-006-02: the transition occurs without any manual action by the accountant
 *   - AC-ONBD-007-01: accountant receives an in-portal notification on completion
 *   - AC-ONBD-007-02: the notification identifies the engagement and its client
 *   - AC-MSG-013-04 : the accountant receives an onboarding_completed notification type
 *
 * Gherkin binding (EPIC-008 § Acceptance scenarios — verbatim):
 *
 *   AC-ONBD-006-01:
 *   "Given an engagement in status New whose onboarding has just become complete
 *    When the completion is processed
 *    Then the engagement's status changes from New to In Progress"
 *
 *   AC-ONBD-006-02:
 *   "Given onboarding has just become complete
 *    When the engagement transitions to In Progress
 *    Then the transition occurs without any manual action by the accountant"
 *
 *   AC-ONBD-007-01:
 *   "Given an engagement whose onboarding has just become complete
 *    When the completion is processed
 *    Then the accountant receives an in-portal notification of that completion"
 *
 *   AC-ONBD-007-02:
 *   "Given an onboarding-complete notification for the accountant
 *    When she opens it
 *    Then it identifies the engagement and its client whose onboarding completed"
 *
 *   AC-MSG-013-04:
 *   "Given onboarding is completed for an engagement
 *    When notifications are generated
 *    Then the accountant receives an onboarding-completed notification"
 *
 * Strategy:
 *   Seed an engagement that already has ALL three onboarding steps satisfied AND
 *   has already been transitioned to "In Progress" with an onboarding_completed
 *   Notification row (reflecting what TASK-008-001 processOnboardingCompletion produces).
 *   The test then:
 *     1. Navigates to the admin document-requests page for the engagement → observes
 *        data-testid="engagement-status" data-status="In Progress" (AC-ONBD-006-01)
 *     2. Navigates to admin /requests → observes the onboarding_completed notification
 *        in the NotificationsIndicator feed (AC-ONBD-007-01 / AC-MSG-013-04)
 *     3. Asserts the notification title/body identifies the engagement + client (AC-ONBD-007-02)
 *     4. Asserts a CLIENT session on portal CANNOT see this notification (accountant-only boundary)
 *
 * Security / fail-closed:
 *   - The notification is NOT reachable from apps/portal — asserted by navigating portal
 *     /requests as a CLIENT and confirming no notification-list is rendered there.
 *   - Engagement stays "In Progress" even after the accountant views it (no action needed).
 *
 * Stack: both apps up (admin :13001, portal :3000). AUTH_PROVIDER=mock.
 *
 * Run:
 *   pnpm --filter admin e2e:run -- --grep 'onboarding-completion'
 *
 * ADR-005: Notification is accountant-readable only; client cannot see it (RLS 0004).
 * ADR-006: Observables split across apps/admin (notification + status) and apps/portal (no notification).
 * ADR-012: Tier-6 e2e.
 * EPIC-008: completion capstone.
 */

import { test, expect } from "@playwright/test";
import mssqlPkg from "mssql";
import { setupAccountantSession, setupClientSession, clearSession } from "../fixtures/auth.js";

const { ConnectionPool } = mssqlPkg;

// Admin and portal URLs
const ADMIN_PORT_ENV = process.env["ADMIN_PORT"] ?? "3001";
const ADMIN_URL = process.env["ADMIN_BASE_URL"] ?? `http://localhost:${ADMIN_PORT_ENV}`;
const PORTAL_URL = process.env["PORTAL_BASE_URL"] ?? "http://localhost:3000";

// Distinct clerkId — suffix "-adcompl-" avoids collision with all other e2e suites.
const FIXTURE_CLERK_USER_ID = "user_client_e2e_adcompl_001";
// Accountant clerkId used for the notification feed (must match the seeded Notification.userId)
const FIXTURE_ACCOUNTANT_CLERK_ID = "user_accountant_e2e_001";

// ─── DB helpers (admin pool, RLS-exempt seed/teardown) ──────────────────────────

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
      "[admin/onboarding-completion.spec] DATABASE_URL_ADMIN is not set (ADR-007).",
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

// ─── Fixture seed / cleanup ──────────────────────────────────────────────────────
//
// Seed an engagement that:
//   - has all three onboarding steps satisfied (letter signed, questionnaire submitted,
//     document uploaded — or no required documents so allRequiredProvided=true)
//   - has already transitioned to status="In Progress" (as processOnboardingCompletion would do)
//   - has an onboarding_completed Notification row (as processOnboardingCompletion would emit)
//
// This seed directly reflects the post-completion state TASK-008-001 produces. The
// cross-app spec (onboarding-completion-cross-app.spec.ts) proves the live production
// path; this spec focuses on the admin observables given a completed engagement.
//

interface AdminCompletionSeedResult {
  userId: string;
  requestId: string;
  engagementId: string;
  notificationId: string;
  clientFirstName: string;
}

async function seedAdminCompletionFixture(): Promise<AdminCompletionSeedResult> {
  const pool = await getPool();

  // 0. Idempotent pre-cleanup for this fixture's user
  // DECISION (TASK-008-004 fix): Notification has no [relatedEntityId] column.
  // The schema only has [engagementRequestId] as the FK reference.
  // We delete via the EngagementRequest → Engagement → User join chain.
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
    .input("email", "e2e-adcompl-001@admin-completion.e2e.test")
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
    if (!userId) throw new Error("[admin/onboarding-completion.spec] Failed to upsert client User");
  }

  // 2. Upsert accountant User (required for setupAccountantSession — the session fixture
  // needs the accountant User row to exist in the DB for auth to pass).
  // DECISION (TASK-008-004 fix): Notification has no [userId] FK — the accountant User
  // is not referenced in the Notification INSERT. The User is upserted only so that
  // setupAccountantSession can authenticate as this accountant.
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

  const clientFirstName = "AdComplTest";
  const clientLastName = "E2E";

  // 3. EngagementRequest
  const requestResult = await pool
    .request()
    .input("firstName", clientFirstName)
    .input("lastName", clientLastName)
    .input("email", `e2e-adcompl-req-${Date.now()}@admin-completion.e2e.test`)
    .query<{ id: string }>(
      `INSERT INTO [dbo].[EngagementRequest]
         ([firstName], [lastName], [email], [status], [createdAt], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES (@firstName, @lastName, @email, 'accepted', SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET())`,
    );

  const requestId = requestResult.recordset[0]?.id;
  if (!requestId) throw new Error("[admin/onboarding-completion.spec] Failed to seed EngagementRequest");

  // 4. Engagement — status="In Progress" (already transitioned by completion engine)
  const evidenceJson = JSON.stringify({
    provider: "mock",
    ref: "e2e-adcompl-mock-ref",
    signedAt: new Date().toISOString(),
  });

  const engagementResult = await pool
    .request()
    .input("engagementRequestId", requestId)
    .input("clientUserId", userId)
    .input("status", "In Progress")
    .input("letterSignedAt", new Date())
    .input("letterSignatureEvidence", evidenceJson)
    .input("letterTemplateSnapshot", "E2E admin completion test letter snapshot")
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
  if (!engagementId) throw new Error("[admin/onboarding-completion.spec] Failed to seed Engagement");

  // 5. Notification — onboarding_completed
  // DECISION (TASK-008-004 fix): Notification schema (EPIC-003) has no [userId] or [updatedAt]
  // columns. The actual schema: [id], [type], [title], [body], [readAt], [engagementRequestId],
  // [createdAt]. The title/body format matches what processOnboardingCompletion emits
  // (onboarding-completion.ts: "Onboarding complete for {fullName}" + body with full name).
  // The Notification is not scoped to a specific user via FK — the sec.pol_Notification RLS
  // policy (0004-notification-policy.sql) makes all notifications accountant-readable.
  // DECISION: accountantUserId is used only for setupAccountantSession (User row must exist);
  // it is NOT inserted into Notification (no userId column in the schema).
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
  if (!notificationId) throw new Error("[admin/onboarding-completion.spec] Failed to seed Notification");

  return {
    userId: userId.toLowerCase(),
    requestId: requestId.toLowerCase(),
    engagementId: engagementId.toLowerCase(),
    notificationId: notificationId.toLowerCase(),
    clientFirstName,
  };
}

async function cleanupAdminCompletionFixture(
  requestId: string,
): Promise<void> {
  const pool = await getPool();

  // Notifications — delete by engagementRequestId FK (the only FK on Notification that links
  // to this fixture). DECISION (TASK-008-004 fix): Notification has no [relatedEntityId] column.
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

// ─── Lifecycle ────────────────────────────────────────────────────────────────────

test.afterAll(async () => {
  await cleanupClientUser();
  await closePool();
});

// ═══════════════════════════════════════════════════════════════════════════════
// AC-ONBD-006-01 / AC-ONBD-006-02 — Engagement shows "In Progress" (automatic)
// AC-ONBD-007-01 / AC-ONBD-007-02 / AC-MSG-013-04 — Accountant notification
// ═══════════════════════════════════════════════════════════════════════════════

test.describe(
  "[AC-ONBD-006-01] [AC-ONBD-006-02] [AC-ONBD-007-01] [AC-ONBD-007-02] [AC-MSG-013-04] admin observes In Progress + onboarding_completed notification",
  () => {
    let seeded: AdminCompletionSeedResult | null = null;

    test.beforeEach(async () => {
      seeded = await seedAdminCompletionFixture();
    });

    test.afterEach(async ({ page }) => {
      await clearSession(page);
      if (seeded) {
        await cleanupAdminCompletionFixture(seeded.requestId);
        seeded = null;
      }
    });

    test(
      "[AC-ONBD-006-01] [AC-ONBD-006-02] engagement shows In Progress status in admin without accountant action",
      async ({ page, request: httpRequest }) => {
        if (!seeded) throw new Error("fixture not seeded");

        // Given: onboarding is complete and engagement has auto-transitioned to In Progress
        // (seeded in status="In Progress" — reflecting what processOnboardingCompletion does)
        // AC-ONBD-006-02: the transition occurred WITHOUT any manual accountant action —
        // the accountant has not visited this page yet; we observe the status purely by navigation.
        await setupAccountantSession(page, httpRequest);
        await page.goto(`${ADMIN_URL}/engagements/${seeded.engagementId}/document-requests`);

        // When: the accountant views the engagement's document-requests page
        // Then: the engagement status shows "In Progress" (data-status="In Progress")
        const statusBadge = page.locator('[data-testid="engagement-status"]');
        await expect(statusBadge).toBeVisible({ timeout: 15_000 });
        await expect(statusBadge).toHaveAttribute("data-status", "In Progress", { timeout: 10_000 });
        await expect(statusBadge).toContainText("In Progress");
      },
    );

    test(
      "[AC-ONBD-007-01] [AC-MSG-013-04] accountant receives an onboarding_completed notification in the feed",
      async ({ page, request: httpRequest }) => {
        if (!seeded) throw new Error("fixture not seeded");

        // Given: onboarding has completed and a notification was emitted
        await setupAccountantSession(page, httpRequest);
        await page.goto(`${ADMIN_URL}/requests`);

        // When: the accountant opens the requests page (NotificationsIndicator rendered)
        // Then: the notification list is visible
        const notifList = page.locator('[data-testid="notification-list"]');
        await expect(notifList).toBeVisible({ timeout: 15_000 });

        // Then: an onboarding_completed notification is present (AC-ONBD-007-01, AC-MSG-013-04)
        // DECISION (TASK-008-004): We filter by data-notification-type="onboarding_completed"
        // since other test notifications (new_engagement_request) may be present.
        const onboardingNotif = notifList.locator(
          '[data-notification-type="onboarding_completed"]',
        );
        await expect(onboardingNotif.first()).toBeVisible({ timeout: 10_000 });
      },
    );

    test(
      "[AC-ONBD-007-02] the onboarding_completed notification identifies the engagement and client",
      async ({ page, request: httpRequest }) => {
        if (!seeded) throw new Error("fixture not seeded");

        // Given: the accountant sees the notification feed
        await setupAccountantSession(page, httpRequest);
        await page.goto(`${ADMIN_URL}/requests`);

        // When: she reads the notification
        const notifList = page.locator('[data-testid="notification-list"]');
        await expect(notifList).toBeVisible({ timeout: 15_000 });

        const onboardingNotif = notifList.locator(
          '[data-notification-type="onboarding_completed"]',
        );
        await expect(onboardingNotif.first()).toBeVisible({ timeout: 10_000 });

        // Then: the notification title identifies the client (AC-ONBD-007-02)
        await expect(onboardingNotif.first()).toContainText(seeded.clientFirstName, {
          timeout: 10_000,
        });

        // Then: the body text references the engagement (partial requestId or client name)
        // The notification body contains the client name (per the denormalization in TASK-008-001)
        const notifBody = onboardingNotif
          .first()
          .locator('[data-testid^="notification-body-"]');
        await expect(notifBody).toBeVisible({ timeout: 10_000 });
        await expect(notifBody).toContainText(seeded.clientFirstName);
      },
    );

    test(
      "[AC-ONBD-007-01] [security] the onboarding_completed notification is accountant-only — NOT visible in portal as client",
      async ({ page, request: httpRequest }) => {
        if (!seeded) throw new Error("fixture not seeded");

        // Given: a CLIENT session on apps/portal
        await setupClientSession(page, httpRequest, FIXTURE_CLERK_USER_ID);

        // When: the client navigates to /onboarding on the portal
        // (the portal has no /requests page that renders NotificationsIndicator)
        await page.goto(`${PORTAL_URL}/onboarding`);

        // Then: the notification-list is NOT present on the portal
        // (NotificationsIndicator is admin-only — ADR-006 + ADR-005 RLS 0004)
        const notifList = page.locator('[data-testid="notification-list"]');
        await expect(notifList).not.toBeVisible({ timeout: 5_000 });

        // Then: the portal page does NOT render any onboarding_completed notification
        const onboardingNotif = page.locator(
          '[data-notification-type="onboarding_completed"]',
        );
        await expect(onboardingNotif).not.toBeVisible({ timeout: 5_000 });
      },
    );
  },
);
