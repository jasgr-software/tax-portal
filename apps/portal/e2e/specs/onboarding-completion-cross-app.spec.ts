/**
 * apps/portal/e2e/specs/onboarding-completion-cross-app.spec.ts
 *
 * Cross-app tier-6 e2e — EPIC-008 full completion loop:
 *   Client drives the final onboarding step in apps/portal →
 *   Accountant observes "In Progress" + onboarding_completed notification in apps/admin.
 *
 * Acceptance criteria covered (all 8 AC for EPIC-008):
 *   AC-ONBD-005-01 — all three steps satisfied → onboarding complete
 *   AC-ONBD-005-02 — (cross-app confirmation) incomplete stays incomplete
 *   AC-ONBD-006-01 — completion → engagement shows In Progress in admin
 *   AC-ONBD-006-02 — transition automatic (no accountant action — accountant only observes)
 *   AC-ONBD-006-03 — incomplete stays New (verified in onboarding-completion.spec.ts portal-only)
 *   AC-ONBD-007-01 — accountant receives an in-portal completion notification
 *   AC-ONBD-007-02 — notification identifies the engagement and client
 *   AC-MSG-013-04  — accountant receives an onboarding-completed notification type
 *
 * Gherkin binding (EPIC-008 § Acceptance scenarios — verbatim, full loop):
 *
 *   AC-ONBD-005-01:
 *   "Given an engagement whose letter is signed, questionnaire submitted, and required documents uploaded
 *    When onboarding completion is evaluated
 *    Then onboarding is marked complete"
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
 *   AC-ONBD-007-01 / AC-MSG-013-04:
 *   "Given an engagement whose onboarding has just become complete
 *    When the completion is processed
 *    Then the accountant receives an in-portal notification of that completion"
 *
 *   AC-ONBD-007-02:
 *   "Given an onboarding-complete notification for the accountant
 *    When she opens it
 *    Then it identifies the engagement and its client whose onboarding completed"
 *
 * Strategy (live production path):
 *   1. Seed: User + EngagementRequest + Engagement (letter signed + questionnaire submitted
 *      + DocumentRequest) + QuestionnaireTemplate + QuestionnaireAnswer.
 *      Engagement starts at status="New" — the test DRIVES the completion trigger live.
 *   2. Client session: upload the required document in portal /onboarding
 *      → completeUploadAction → processOnboardingCompletion fires.
 *   3. Portal observable: all three steps data-done="true", data-remaining="0"
 *      (AC-ONBD-005-01: onboarding marked complete).
 *   4. Accountant session: navigate to admin /engagements/<id>/document-requests →
 *      observe data-status="In Progress" (AC-ONBD-006-01/-02: auto transition, no accountant action).
 *   5. Accountant observes /requests → onboarding_completed notification in the feed
 *      (AC-ONBD-007-01, AC-MSG-013-04) identifying the client (AC-ONBD-007-02).
 *
 * Stack: both containers up (portal :3000, admin :13001, AUTH_PROVIDER=mock,
 *        ESIGN_PROVIDER=mock, STORAGE_PROVIDER=azurite, MALWARE_SCAN_PROVIDER=mock).
 *
 * Run:
 *   pnpm e2e:cross-app          (scripts/e2e-cross-app.sh — includes this spec)
 *   pnpm --filter portal e2e:run -- --grep 'onboarding-completion-cross-app'
 *
 * ADR-006: Cross-app — portal (client upload) → admin (accountant observes).
 * ADR-012: Tier-6 e2e.
 * ADR-005: RLS policy not relaxed — admin pool for seed/teardown only.
 * EPIC-008: completion capstone.
 */

import { test, expect } from "@playwright/test";
import mssqlPkg from "mssql";
import {
  setupClientSession,
  setupAccountantSession,
  clearSession,
} from "../fixtures/auth.js";
import { configureAzuriteCors } from "../fixtures/azurite-cors.js";

const { ConnectionPool } = mssqlPkg;

const PORTAL_URL = process.env["PORTAL_BASE_URL"] ?? "http://localhost:3000";
const ADMIN_PORT = process.env["ADMIN_PORT"] ?? "3001";
const ADMIN_URL = process.env["ADMIN_BASE_URL"] ?? `http://localhost:${ADMIN_PORT}`;

// Distinct clerkId — suffix "-xcompl-" avoids collision with all other suites.
const FIXTURE_CLERK_USER_ID = "user_client_e2e_xcompl_001";
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
      "[onboarding-completion-cross-app.spec] DATABASE_URL_ADMIN is not set (ADR-007).",
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

interface CrossCompletionSeedResult {
  userId: string;
  requestId: string;
  engagementId: string;
  documentRequestId: string;
  clientFirstName: string;
  clientLastName: string;
}

/**
 * Seeds the cross-app completion fixture:
 *   - Client User (fixture clerkId)
 *   - Accountant User (for notification recipient lookup)
 *   - EngagementRequest (accepted)
 *   - EngagementRequestService (linked to first active service)
 *   - QuestionnaireTemplate (for the service)
 *   - Engagement (status=New, letter signed, questionnaire submitted + QuestionnaireAnswer)
 *   - DocumentRequest (one required item — the test will upload to this)
 *
 * The test drives the final document upload through the browser, triggering
 * processOnboardingCompletion live. This is the "production path" evidence.
 */
async function seedCrossCompletionFixture(): Promise<CrossCompletionSeedResult> {
  const pool = await getPool();

  const clientFirstName = "XComplTest";
  const clientLastName = "E2E";

  // 0. Idempotent pre-cleanup
  await pool
    .request()
    .input("clerkId", FIXTURE_CLERK_USER_ID)
    .query(
      `DELETE d
       FROM [dbo].[Document] d
       JOIN [dbo].[Engagement] e ON e.[id] = d.[engagementId]
       JOIN [dbo].[User] u ON u.[id] = e.[clientUserId]
       WHERE u.[clerkId] = @clerkId`,
    );
  await pool
    .request()
    .input("clerkId", FIXTURE_CLERK_USER_ID)
    .query(
      `DELETE dr
       FROM [dbo].[DocumentRequest] dr
       JOIN [dbo].[Engagement] e ON e.[id] = dr.[engagementId]
       JOIN [dbo].[User] u ON u.[id] = e.[clientUserId]
       WHERE u.[clerkId] = @clerkId`,
    );
  await pool
    .request()
    .input("clerkId", FIXTURE_CLERK_USER_ID)
    .query(
      `DELETE qa
       FROM [dbo].[QuestionnaireAnswer] qa
       JOIN [dbo].[Engagement] e ON e.[id] = qa.[engagementId]
       JOIN [dbo].[User] u ON u.[id] = e.[clientUserId]
       WHERE u.[clerkId] = @clerkId`,
    );
  // Notifications linked to this client's engagements
  await pool
    .request()
    .input("clerkId", FIXTURE_CLERK_USER_ID)
    .query(
      `DELETE n
       FROM [dbo].[Notification] n
       JOIN [dbo].[Engagement] e ON e.[engagementRequestId] = n.[engagementRequestId]
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
    .input("email", "e2e-xcompl-001@cross-completion.e2e.test")
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
    if (!userId) throw new Error("[onboarding-completion-cross-app.spec] Failed to upsert client User");
  }

  // 2. Upsert accountant User
  const acctResult = await pool
    .request()
    .input("clerkId", FIXTURE_ACCOUNTANT_CLERK_ID)
    .input("email", "e2e-accountant-xcompl@cross-completion.e2e.test")
    .input("role", "ACCOUNTANT")
    .query<{ id: string }>(
      `MERGE [dbo].[User] AS target
       USING (SELECT @clerkId AS clerkId) AS source
         ON target.[clerkId] = source.[clerkId]
       WHEN NOT MATCHED THEN
         INSERT ([clerkId], [email], [role], [createdAt], [updatedAt])
         VALUES (@clerkId, @email, @role, SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET())
       OUTPUT INSERTED.[id];`,
    );

  if (!acctResult.recordset[0]?.id) {
    // MERGE may return no OUTPUT if the row already existed — that is fine, accountant exists.
    const lookup = await pool
      .request()
      .input("clerkId", FIXTURE_ACCOUNTANT_CLERK_ID)
      .query<{ id: string }>(`SELECT [id] FROM [dbo].[User] WHERE [clerkId] = @clerkId`);
    if (!lookup.recordset[0]?.id)
      throw new Error("[onboarding-completion-cross-app.spec] Failed to upsert accountant User");
  }

  // 3. Get first active service for questionnaire template
  const serviceRow = await pool
    .request()
    .query<{ id: string }>(
      `SELECT TOP 1 [id] FROM [dbo].[Service] WHERE [active] = 1 ORDER BY [sortOrder] ASC`,
    );
  const serviceId = serviceRow.recordset[0]?.id;
  if (!serviceId) throw new Error("[onboarding-completion-cross-app.spec] No active service found");

  // 4. Upsert QuestionnaireTemplate for the service
  const templateQuestions = JSON.stringify([
    { id: "q1", prompt: "Describe your income sources", required: true, type: "text" },
  ]);
  const templateResult = await pool
    .request()
    .input("serviceId", serviceId)
    .input("questions", templateQuestions)
    .query<{ id: string }>(
      `MERGE [dbo].[QuestionnaireTemplate] AS target
       USING (SELECT @serviceId AS serviceId) AS source
         ON target.[serviceId] = source.[serviceId]
       WHEN NOT MATCHED THEN
         INSERT ([serviceId], [questions], [createdAt], [updatedAt])
         VALUES (@serviceId, @questions, SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET())
       WHEN MATCHED THEN
         UPDATE SET [questions] = @questions, [updatedAt] = SYSDATETIMEOFFSET()
       OUTPUT INSERTED.[id];`,
    );

  let templateId = templateResult.recordset[0]?.id;
  if (!templateId) {
    const tLookup = await pool
      .request()
      .input("serviceId", serviceId)
      .query<{ id: string }>(
        `SELECT TOP 1 [id] FROM [dbo].[QuestionnaireTemplate] WHERE [serviceId] = @serviceId`,
      );
    templateId = tLookup.recordset[0]?.id;
    if (!templateId) throw new Error("[onboarding-completion-cross-app.spec] Failed to upsert QuestionnaireTemplate");
  }

  // 5. EngagementRequest
  const requestResult = await pool
    .request()
    .input("firstName", clientFirstName)
    .input("lastName", clientLastName)
    .input("email", `e2e-xcompl-req-${Date.now()}@cross-completion.e2e.test`)
    .query<{ id: string }>(
      `INSERT INTO [dbo].[EngagementRequest]
         ([firstName], [lastName], [email], [status], [createdAt], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES (@firstName, @lastName, @email, 'accepted', SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET())`,
    );

  const requestId = requestResult.recordset[0]?.id;
  if (!requestId) throw new Error("[onboarding-completion-cross-app.spec] Failed to seed EngagementRequest");

  // 5a. Link request → service
  await pool
    .request()
    .input("engagementRequestId", requestId)
    .input("serviceId", serviceId)
    .query(
      `INSERT INTO [dbo].[EngagementRequestService] ([engagementRequestId], [serviceId])
       VALUES (@engagementRequestId, @serviceId)`,
    );

  // 6. Engagement — status=New, letter signed, questionnaire submitted
  const evidenceJson = JSON.stringify({
    provider: "mock",
    ref: "e2e-xcompl-mock-ref",
    signedAt: new Date().toISOString(),
  });

  const engagementResult = await pool
    .request()
    .input("engagementRequestId", requestId)
    .input("clientUserId", userId)
    .input("status", "New")
    .input("letterSignedAt", new Date())
    .input("letterSignatureEvidence", evidenceJson)
    .input("letterTemplateSnapshot", "E2E cross-completion letter snapshot")
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
  if (!engagementId) throw new Error("[onboarding-completion-cross-app.spec] Failed to seed Engagement");

  // 7. QuestionnaireAnswer row (questionnaire step satisfied)
  const answersJson = JSON.stringify({ q1: "Cross-completion E2E answer" });
  await pool
    .request()
    .input("engagementId", engagementId)
    .input("templateId", templateId)
    .input("answers", answersJson)
    .query(
      `INSERT INTO [dbo].[QuestionnaireAnswer]
         ([engagementId], [templateId], [answers], [submittedAt], [createdAt], [updatedAt])
       VALUES (@engagementId, @templateId, @answers,
               SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET())`,
    );

  // 8. DocumentRequest — the final required step the test will upload to
  // DECISION (TASK-008-004): DocumentRequest has no [required] column (TASK-007 schema).
  const docRequestResult = await pool
    .request()
    .input("engagementId", engagementId)
    .input("label", "Cross-Completion Tax Document (E2E)")
    .query<{ id: string }>(
      `INSERT INTO [dbo].[DocumentRequest]
         ([engagementId], [label], [createdAt], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES (@engagementId, @label, SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET())`,
    );

  const documentRequestId = docRequestResult.recordset[0]?.id;
  if (!documentRequestId) throw new Error("[onboarding-completion-cross-app.spec] Failed to seed DocumentRequest");

  return {
    userId: userId.toLowerCase(),
    requestId: requestId.toLowerCase(),
    engagementId: engagementId.toLowerCase(),
    documentRequestId: documentRequestId.toLowerCase(),
    clientFirstName,
    clientLastName,
  };
}

async function cleanupCrossCompletionFixture(requestId: string): Promise<void> {
  const pool = await getPool();

  await pool.request().input("requestId", requestId).query(
    `DELETE d
     FROM [dbo].[Document] d
     JOIN [dbo].[Engagement] e ON e.[id] = d.[engagementId]
     WHERE e.[engagementRequestId] = @requestId`,
  );
  await pool.request().input("requestId", requestId).query(
    `DELETE dr
     FROM [dbo].[DocumentRequest] dr
     JOIN [dbo].[Engagement] e ON e.[id] = dr.[engagementId]
     WHERE e.[engagementRequestId] = @requestId`,
  );
  await pool.request().input("requestId", requestId).query(
    `DELETE qa
     FROM [dbo].[QuestionnaireAnswer] qa
     JOIN [dbo].[Engagement] e ON e.[id] = qa.[engagementId]
     WHERE e.[engagementRequestId] = @requestId`,
  );
  await pool.request().input("requestId", requestId).query(
    `DELETE FROM [dbo].[Notification] WHERE [engagementRequestId] = @requestId`,
  );
  await pool.request().input("requestId", requestId).query(
    `DELETE FROM [dbo].[Engagement] WHERE [engagementRequestId] = @requestId`,
  );
  await pool.request().input("requestId", requestId).query(
    `DELETE FROM [dbo].[EngagementRequestService] WHERE [engagementRequestId] = @requestId`,
  );
  await pool.request().input("requestId", requestId).query(
    `DELETE FROM [dbo].[EngagementRequest] WHERE [id] = @requestId`,
  );
}

async function cleanupCrossCompletionUser(): Promise<void> {
  const pool = await getPool();
  // DECISION (TASK-008-004): Must delete child rows before the User row.
  // Engagement.clientUserId is a FK to User.id.
  await pool.request().input("clerkId", FIXTURE_CLERK_USER_ID).query(
    `DELETE d
     FROM [dbo].[Document] d
     JOIN [dbo].[Engagement] e ON e.[id] = d.[engagementId]
     JOIN [dbo].[User] u ON u.[id] = e.[clientUserId]
     WHERE u.[clerkId] = @clerkId`,
  );
  await pool.request().input("clerkId", FIXTURE_CLERK_USER_ID).query(
    `DELETE dr
     FROM [dbo].[DocumentRequest] dr
     JOIN [dbo].[Engagement] e ON e.[id] = dr.[engagementId]
     JOIN [dbo].[User] u ON u.[id] = e.[clientUserId]
     WHERE u.[clerkId] = @clerkId`,
  );
  await pool.request().input("clerkId", FIXTURE_CLERK_USER_ID).query(
    `DELETE qa
     FROM [dbo].[QuestionnaireAnswer] qa
     JOIN [dbo].[Engagement] e ON e.[id] = qa.[engagementId]
     JOIN [dbo].[User] u ON u.[id] = e.[clientUserId]
     WHERE u.[clerkId] = @clerkId`,
  );
  await pool.request().input("clerkId", FIXTURE_CLERK_USER_ID).query(
    `DELETE e
     FROM [dbo].[Engagement] e
     JOIN [dbo].[User] u ON u.[id] = e.[clientUserId]
     WHERE u.[clerkId] = @clerkId`,
  );
  await pool
    .request()
    .input("clerkId", FIXTURE_CLERK_USER_ID)
    .query(`DELETE FROM [dbo].[User] WHERE [clerkId] = @clerkId`);
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────────

test.beforeAll(async () => {
  await configureAzuriteCors();
});

test.afterAll(async () => {
  await cleanupCrossCompletionUser();
  await closePool();
});

// ═══════════════════════════════════════════════════════════════════════════════
// Full cross-app loop: client completes (portal) → accountant observes (admin)
// ═══════════════════════════════════════════════════════════════════════════════

test.describe(
  "[onboarding-completion-cross-app] client completes final step (portal) → accountant sees In Progress + notification (admin)",
  () => {
    let seeded: CrossCompletionSeedResult | null = null;

    test.beforeEach(async () => {
      seeded = await seedCrossCompletionFixture();
    });

    test.afterEach(async ({ page }) => {
      await clearSession(page);
      if (seeded) {
        await cleanupCrossCompletionFixture(seeded.requestId);
        seeded = null;
      }
    });

    test(
      "[AC-ONBD-005-01] [AC-ONBD-006-01] [AC-ONBD-006-02] [AC-ONBD-007-01] [AC-ONBD-007-02] [AC-MSG-013-04] client uploads final doc → all steps complete → admin observes In Progress + onboarding_completed notification",
      async ({ page, request: httpRequest }) => {
        if (!seeded) throw new Error("fixture not seeded");

        // ─── Step 1: Client session — upload the final required document ──────────

        // Given: engagement pre-letter-signed + pre-questionnaire-submitted, one required doc
        await setupClientSession(page, httpRequest, FIXTURE_CLERK_USER_ID);
        await page.goto(`${PORTAL_URL}/onboarding`);

        // Verify preconditions: steps 1 + 2 done, step 3 accessible but not done
        const letterStep = page.locator('[data-testid="onboarding-step-engagement-letter"]');
        const questionnaireStep = page.locator('[data-testid="onboarding-step-intake-questionnaire"]');
        const uploadStep = page.locator('[data-testid="onboarding-step-document-upload"]');

        await expect(letterStep).toHaveAttribute("data-done", "true", { timeout: 10_000 });
        await expect(questionnaireStep).toHaveAttribute("data-done", "true", { timeout: 10_000 });
        await expect(uploadStep).toHaveAttribute("data-done", "false", { timeout: 10_000 });
        await expect(uploadStep).toHaveAttribute("data-accessible", "true", { timeout: 10_000 });

        // When: the client uploads the required document (final step)
        const uploadLabelLocator = page.locator(
          `[data-testid="upload-label-${seeded.documentRequestId}"]`,
        );
        await expect(uploadLabelLocator).toBeVisible({ timeout: 10_000 });

        const [fileChooser] = await Promise.all([
          page.waitForEvent("filechooser"),
          uploadLabelLocator.click(),
        ]);
        await fileChooser.setFiles({
          name: "cross-completion-tax-return.pdf",
          mimeType: "application/pdf",
          buffer: Buffer.from(
            "[AC-ONBD-005-01] [AC-ONBD-006-01] [AC-MSG-013-04] Cross-app completion test document",
          ),
        });

        // Then (AC-ONBD-005-01 portal observable): all steps complete after upload
        const checklistItem = page.locator(
          `[data-testid="checklist-item-${seeded.documentRequestId}"]`,
        );
        await expect(checklistItem).toHaveAttribute("data-status", "fulfilled", {
          timeout: 30_000,
        });

        // Then: document-upload step is now done (triggers processOnboardingCompletion)
        await expect(uploadStep).toHaveAttribute("data-done", "true", { timeout: 30_000 });

        // Then: all steps done and remaining=0
        const positionEl = page.locator('[data-testid="onboarding-position"]');
        await expect(positionEl).toHaveAttribute("data-remaining", "0", { timeout: 15_000 });
        await expect(positionEl).toContainText("all steps complete");

        // ─── Step 2: Verify DB transition — engagement must be "In Progress" ─────

        // AC-ONBD-006-01: engagement status changed to "In Progress" automatically
        // (no accountant action taken — AC-ONBD-006-02)
        const pool = await getPool();
        const statusRow = await pool
          .request()
          .input("engagementId", seeded.engagementId)
          .query<{ status: string }>(
            `SELECT [status] FROM [dbo].[Engagement] WHERE [id] = @engagementId`,
          );
        const dbStatus = statusRow.recordset[0]?.status;
        expect(dbStatus).toBe("In Progress");

        // ─── Step 3: Accountant session — admin observes In Progress + notification ──

        // AC-ONBD-006-02: transition automatic; accountant only observes
        await clearSession(page);
        await setupAccountantSession(page, httpRequest);

        // Then (AC-ONBD-006-01): engagement shows "In Progress" on admin document-requests page
        await page.goto(`${ADMIN_URL}/engagements/${seeded.engagementId}/document-requests`);
        const statusBadge = page.locator('[data-testid="engagement-status"]');
        await expect(statusBadge).toBeVisible({ timeout: 15_000 });
        await expect(statusBadge).toHaveAttribute("data-status", "In Progress", {
          timeout: 10_000,
        });

        // Then (AC-ONBD-007-01, AC-MSG-013-04): accountant sees the completion notification
        await page.goto(`${ADMIN_URL}/requests`);
        const notifList = page.locator('[data-testid="notification-list"]');
        await expect(notifList).toBeVisible({ timeout: 15_000 });

        const onboardingNotif = notifList.locator(
          '[data-notification-type="onboarding_completed"]',
        );
        await expect(onboardingNotif.first()).toBeVisible({ timeout: 15_000 });

        // Then (AC-ONBD-007-02): the notification identifies the engagement + client
        await expect(onboardingNotif.first()).toContainText(seeded.clientFirstName, {
          timeout: 10_000,
        });

        const notifBody = onboardingNotif
          .first()
          .locator('[data-testid^="notification-body-"]');
        await expect(notifBody).toBeVisible({ timeout: 10_000 });
        await expect(notifBody).toContainText(seeded.clientFirstName);
      },
    );
  },
);
