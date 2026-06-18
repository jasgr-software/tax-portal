/**
 * apps/portal/e2e/specs/questionnaire-cross-app.spec.ts
 *
 * Cross-app tier-6 e2e: admin authors a uniquely-identifiable questionnaire template
 * for a service type → portal client (whose engagement is that service type) is shown
 * exactly that template → completes and submits it → step is satisfied.
 *
 * Acceptance criteria covered (EPIC-006):
 *   AC-ONBD-003-01 — correct template shown in portal (service-type match proven)
 *   AC-ONBD-003-03 — step satisfied after submit (data-questionnaire-submitted flips)
 *   cross-app — admin author→portal completion loop end-to-end
 *
 * Gherkin binding (prose-bound until Cucumber tooling lands — CLAUDE.md § Executable gherkin tooling):
 *
 *   AC-ONBD-003-01 (EPIC-006 § Acceptance scenarios — verbatim):
 *   "Given an engagement for a given service type, with a questionnaire template defined
 *    for that service type
 *    When the client reaches the questionnaire step
 *    Then the questionnaire presented is the one for their engagement's service type"
 *
 *   AC-ONBD-003-03 (EPIC-006 § Acceptance scenarios — verbatim):
 *   "Given a client viewing the questionnaire who has not yet submitted it
 *    When the questionnaire step's satisfaction is evaluated
 *    Then the step is not satisfied until the client submits their completed questionnaire"
 *
 * Also exercises the full cross-surface loop:
 *   1. Accountant session on admin (http://localhost:13001) → authors template for service type
 *   2. DB seeds: client User + EngagementRequest + EngagementRequestService + Engagement (unsigned)
 *   3. Client session on portal (http://localhost:3000) → signs the engagement letter (EPIC-005 gate)
 *   4. Client clicks into the questionnaire step → sees the accountant's uniquely-authored content
 *   5. Client fills in and submits → data-questionnaire-submitted flips "false"→"true"
 *
 * CLAUDE.md § Platform-frontend scope: this spec legitimately touches BOTH surfaces
 * (admin author + portal sign + portal submit) — this is the multi-surface cross-app case.
 *
 * Stack: both containers up (AUTH_PROVIDER=mock, ESIGN_PROVIDER=mock, ALLOW_MOCK_ESIGN=true).
 *
 * // DECISION (TASK-006-006): The accountant authors the template via the admin UI (not via
 * // direct DB write) so the test exercises the full authoring path (AC-DASH-012-01/-02).
 * // The client fixture (DB seed) seeds the EngagementRequestService so the engagement is
 * // linked to the SAME service the accountant just authored the template for.
 * // The admin-authored template is identified by a unique timestamp-based prompt
 * // that the portal assertion compares against (not a tautology).
 * //
 * // Cross-app cookie coordination: uses portal /api/mock-session for both accountant
 * // and client sessions (the shared-localhost cookie at ADR-010 §3 means the admin
 * // app honors the same cookie). This mirrors onboarding-cross-app.spec.ts.
 *
 * Run:
 *   pnpm e2e:cross-app          (scripts/e2e-cross-app.sh — runs portal + admin cross-app specs)
 *   pnpm --filter portal e2e:run -- --grep 'questionnaire-cross-app'
 *
 * ADR-006: Cross-app — admin (accountant) + portal (client).
 * ADR-012: Tier-6 e2e.
 * ADR-023/024: E-sign through ESignatureProvider PORT (ESIGN_PROVIDER=mock).
 */

import { test, expect } from "@playwright/test";
import mssqlPkg from "mssql";
import {
  setupClientSession,
  setupAccountantSession,
  clearSession,
} from "../fixtures/auth.js";

const { ConnectionPool } = mssqlPkg;

const PORTAL_URL = process.env["PORTAL_BASE_URL"] ?? "http://localhost:3000";
const ADMIN_PORT = process.env["ADMIN_PORT"] ?? "3001";
const ADMIN_URL = process.env["ADMIN_BASE_URL"] ?? `http://localhost:${ADMIN_PORT}`;

// DECISION (TASK-006-006): Different clerkUserId from all other suites (onboarding, cross-app,
// questionnaire portal suite) to avoid unique constraint collision across suites running in sequence.
const FIXTURE_CLERK_USER_ID = "user_client_e2e_qcross_001";

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

  const resolvedUser = user ?? params["user"];
  const resolvedPassword = password ?? params["password"];
  const resolvedPort =
    port !== 1433
      ? port
      : params["port"]
        ? parseInt(params["port"], 10)
        : 1433;

  const encrypt = (params["encrypt"] ?? "true").toLowerCase() !== "false";
  const trustServerCertificate =
    (params["trustServerCertificate"] ?? "false").toLowerCase() === "true";

  return {
    server,
    port: resolvedPort,
    user: resolvedUser,
    password: resolvedPassword,
    database: params["database"] ?? "master",
    options: { encrypt, trustServerCertificate },
  };
}

let _pool: mssqlPkg.ConnectionPool | null = null;

async function getPool(): Promise<mssqlPkg.ConnectionPool> {
  if (_pool && _pool.connected) return _pool;
  const url = process.env["DATABASE_URL_ADMIN"];
  if (!url) {
    throw new Error(
      "[questionnaire-cross-app.spec] DATABASE_URL_ADMIN is not set (ADR-007).",
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

interface SeedResult {
  userId: string;
  requestId: string;
  engagementId: string;
  serviceId: string;
}

/**
 * Seeds the client fixture for the cross-app test:
 *   - User (fixture clerk id)
 *   - EngagementRequest
 *   - EngagementRequestService (linking request to the given serviceId)
 *   - Engagement (letterSignedAt=NULL — unsigned, gate closed for the test to drive)
 *
 * @param serviceId - The service ID to link the engagement to. MUST match the service
 *   the accountant just authored a template for (obtained from the admin UI service picker).
 *
 * The QuestionnaireTemplate is authored THROUGH THE ADMIN UI by the accountant
 * (not seeded here) — that's what makes this a cross-app test.
 *
 * // DECISION (TASK-006-006): serviceId is passed in from the admin UI service picker
 * // (not resolved by a DB query) so the fixture is guaranteed to use the EXACT same
 * // service the accountant authored the template for. An earlier version queried the DB
 * // for "first active service by sortOrder" — but mssql driver UUID ordering differs
 * // from the Next.js/Prisma ordering used in the service picker, so the IDs diverged
 * // when multiple services share the same sortOrder. The UI-driven ID is the source of
 * // truth here (the cross-app loop depends on the picker's selection, not the DB sort order).
 */
async function seedClientFixture(serviceId: string): Promise<SeedResult> {
  const pool = await getPool();

  // 1. Upsert User
  const userResult = await pool
    .request()
    .input("clerkId", FIXTURE_CLERK_USER_ID)
    .input("email", "e2e-qcross-001@qcross.e2e.test")
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
    const lookupResult = await pool
      .request()
      .input("clerkId", FIXTURE_CLERK_USER_ID)
      .query<{ id: string }>(`SELECT [id] FROM [dbo].[User] WHERE [clerkId] = @clerkId`);
    userId = lookupResult.recordset[0]?.id;
    if (!userId) throw new Error("[questionnaire-cross-app.spec] Failed to upsert User row");
  }

  // 2. Seed EngagementRequest
  const requestResult = await pool
    .request()
    .input("firstName", "QCross")
    .input("lastName", "E2E")
    .input("email", `e2e-qcross-req-${Date.now()}@qcross.e2e.test`)
    .query<{ id: string }>(
      `INSERT INTO [dbo].[EngagementRequest]
         ([firstName], [lastName], [email], [status], [createdAt], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES (@firstName, @lastName, @email, 'accepted', SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET())`,
    );

  const requestId = requestResult.recordset[0]?.id;
  if (!requestId) throw new Error("[questionnaire-cross-app.spec] Failed to seed EngagementRequest row");

  // 3. Link request → the provided serviceId (same as the accountant's template)
  await pool
    .request()
    .input("engagementRequestId", requestId)
    .input("serviceId", serviceId)
    .query(
      `INSERT INTO [dbo].[EngagementRequestService] ([engagementRequestId], [serviceId])
       VALUES (@engagementRequestId, @serviceId)`,
    );

  // 4. Seed Engagement — unsigned (letterSignedAt=NULL)
  const engagementResult = await pool
    .request()
    .input("engagementRequestId", requestId)
    .input("clientUserId", userId)
    .input("status", "New")
    .query<{ id: string }>(
      `INSERT INTO [dbo].[Engagement]
         ([engagementRequestId], [clientUserId], [status], [createdAt], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES (@engagementRequestId, @clientUserId, @status, SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET())`,
    );

  const engagementId = engagementResult.recordset[0]?.id;
  if (!engagementId) throw new Error("[questionnaire-cross-app.spec] Failed to seed Engagement row");

  return { userId, requestId, engagementId, serviceId };
}

async function cleanupFixture(requestId: string): Promise<void> {
  const pool = await getPool();

  // QuestionnaireAnswer (FK → Engagement + QuestionnaireTemplate)
  await pool
    .request()
    .input("requestId", requestId)
    .query(
      `DELETE qa
       FROM [dbo].[QuestionnaireAnswer] qa
       JOIN [dbo].[Engagement] e ON e.[id] = qa.[engagementId]
       WHERE e.[engagementRequestId] = @requestId`,
    );

  // Engagement
  await pool
    .request()
    .input("requestId", requestId)
    .query(`DELETE FROM [dbo].[Engagement] WHERE [engagementRequestId] = @requestId`);

  // EngagementRequestService
  await pool
    .request()
    .input("requestId", requestId)
    .query(`DELETE FROM [dbo].[EngagementRequestService] WHERE [engagementRequestId] = @requestId`);

  // EngagementRequest
  await pool
    .request()
    .input("requestId", requestId)
    .query(`DELETE FROM [dbo].[EngagementRequest] WHERE [id] = @requestId`);
}

/**
 * Delete the QuestionnaireTemplate authored by the accountant during this test run.
 * (The admin UI created it; we clean it up after the test via admin pool.)
 */
async function cleanupTemplateForService(serviceId: string): Promise<void> {
  const pool = await getPool();
  // QuestionnaireAnswer first (FK → QuestionnaireTemplate)
  await pool
    .request()
    .input("serviceId", serviceId)
    .query(
      `DELETE qa
       FROM [dbo].[QuestionnaireAnswer] qa
       JOIN [dbo].[QuestionnaireTemplate] qt ON qt.[id] = qa.[templateId]
       WHERE qt.[serviceId] = @serviceId`,
    );
  await pool
    .request()
    .input("serviceId", serviceId)
    .query(`DELETE FROM [dbo].[QuestionnaireTemplate] WHERE [serviceId] = @serviceId`);
}

async function cleanupFixtureUser(): Promise<void> {
  const pool = await getPool();
  await pool
    .request()
    .input("clerkId", FIXTURE_CLERK_USER_ID)
    .query(`DELETE FROM [dbo].[User] WHERE [clerkId] = @clerkId`);
}

test.afterAll(async () => {
  await cleanupFixtureUser();
  await closePool();
});

// ═══════════════════════════════════════════════════════════════════════════════
// Cross-app: admin author→portal completion loop
// (AC-ONBD-003-01 + AC-ONBD-003-03 + AC-DASH-012-01/-02)
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("[cross-app] admin-authored template → portal client completion loop", () => {
  /**
   * Full cross-surface loop:
   *   1. Accountant session on admin → /settings/questionnaire-templates
   *   2. Accountant selects the primary service type, authors a uniquely-identifiable template
   *   3. Accountant saves → success banner confirms (AC-DASH-012-01/-02)
   *   4. Clear accountant session; seed client fixture; establish client session
   *   5. Client opens /onboarding → signs the engagement letter (EPIC-005 gate)
   *   6. Client opens the questionnaire step → authored content appears (AC-ONBD-003-01)
   *   7. Client fills in the answer + submits → data-questionnaire-submitted flips (AC-ONBD-003-03)
   */

  let seeded: SeedResult | null = null;
  // DECISION (TASK-006-006): Track the serviceId the accountant authored the template for
  // separately from seeded.serviceId. The template is created BEFORE seeded is set, so if
  // the test fails between template creation and seeding, we still need to clean up the template.
  // This variable is set as soon as we read primaryServiceId from the picker (before any save).
  let templateServiceId: string | null = null;

  test.afterEach(async ({ page }) => {
    await clearSession(page);
    if (templateServiceId) {
      await cleanupTemplateForService(templateServiceId);
      templateServiceId = null;
    }
    if (seeded) {
      await cleanupFixture(seeded.requestId);
      seeded = null;
    }
  });

  test("[cross-app] admin-authored template shown in portal and satisfied after submit", async ({ page, request }) => {
    // ─── Step 1: Accountant authors the template in admin ──────────────────────
    // DECISION (TASK-006-006): The portal /api/mock-session is called with role=ACCOUNTANT.
    // The shared-localhost cookie (ADR-010 §3) means the admin app honors it.
    // Mirrors the onboarding-cross-app.spec.ts accountant session pattern.
    await setupAccountantSession(page, request);
    await page.goto(`${ADMIN_URL}/settings/questionnaire-templates`);

    const editor = page.locator('[data-testid="questionnaire-editor"]');
    await expect(editor).toBeVisible({ timeout: 15_000 });

    // Determine the primary service id (DECISION-F: first active by sortOrder ASC)
    // We read it from the picker so the test is robust to service catalog changes.
    const servicePicker = page.locator('#service-picker');
    await expect(servicePicker).toBeVisible();
    const primaryServiceId = await servicePicker.inputValue();
    expect(primaryServiceId).toBeTruthy();

    // Set templateServiceId IMMEDIATELY so afterEach can clean up the template
    // even if the test fails before seeded is set. This prevents template accumulation
    // across retry runs (DECISION-TASK-006-006: template cleanup must be keyed by the
    // picker's service ID, not seeded.serviceId — which may differ due to UUID casing).
    templateServiceId = primaryServiceId;

    // Unique, timestamp-based question prompt (honest fixture — not a tautology)
    const authoredPrompt = `[cross-app] AC-ONBD-003-01 authored question — ${Date.now()}`;

    // Clear any pre-existing questions from a previous test run before authoring.
    // DECISION (TASK-006-006): Stale templates from failed cleanup (prior runs) can leave
    // questions in the editor. Remove them all first so the test authors exactly 1 question —
    // making the portal assertion ('exactly 1 [data-question-id]') unambiguous.
    const existingRows = page.locator('[data-question-row]');
    const existingCount = await existingRows.count();
    for (let i = 0; i < existingCount; i++) {
      // Always click the first "Remove" button (rows shift up after each removal)
      const removeBtn = page.locator('[data-question-row]').first().locator('button:has-text("Remove")');
      if (await removeBtn.isVisible()) {
        await removeBtn.click();
        // Wait for the row to disappear before trying to remove the next one
        await expect(page.locator('[data-question-row]')).toHaveCount(existingCount - i - 1, { timeout: 3_000 });
      }
    }

    // Author a new question with the unique prompt.
    const addQuestionBtn = page.locator('button:has-text("+ Add question")');
    await expect(addQuestionBtn).toBeVisible();
    await addQuestionBtn.click();

    const questionRows = page.locator('[data-question-row]');
    await expect(questionRows).toHaveCount(1, { timeout: 5_000 });
    const promptInput = questionRows.first().locator('input[type="text"]').first();
    await promptInput.fill(authoredPrompt);

    // Save the template (AC-DASH-012-01: creates the template from the admin UI)
    const saveButton = page.locator('[data-testid="save-template"]');
    await expect(saveButton).toBeVisible();
    await saveButton.click();

    // Confirm save success (AC-DASH-012-02: template bound to the selected service type)
    await expect(
      page.locator('[role="status"]:has-text("Template saved successfully")'),
    ).toBeVisible({ timeout: 10_000 });

    // ─── Step 2: Switch to client session ─────────────────────────────────────
    await clearSession(page);

    // Seed the client fixture, explicitly linking to the SAME primaryServiceId the
    // accountant just authored the template for. We pass the picker's value directly
    // so DB driver UUID-ordering differences cannot cause a mismatch.
    seeded = await seedClientFixture(primaryServiceId);

    await setupClientSession(page, request, FIXTURE_CLERK_USER_ID);

    // ─── Step 3: Client signs the engagement letter (EPIC-005 gate) ───────────
    await page.goto(`${PORTAL_URL}/onboarding`);

    const letterStep = page.locator('[data-testid="onboarding-step-engagement-letter"]');
    await expect(letterStep).toHaveAttribute("data-accessible", "true", { timeout: 10_000 });

    const signButton = page.locator('[data-testid="sign-letter-button"]');
    await expect(signButton).toBeVisible({ timeout: 10_000 });
    await signButton.click();

    await expect(
      page.locator('[data-testid="letter-signed-confirmation"]'),
    ).toBeVisible({ timeout: 15_000 });

    await expect(
      page.locator('[data-testid="onboarding-step-intake-questionnaire"]'),
    ).toHaveAttribute("data-accessible", "true", { timeout: 15_000 });

    // ─── Step 4: Client opens the questionnaire step ───────────────────────────
    const questionnaireStep = page.locator('[data-testid="onboarding-step-intake-questionnaire"]');
    await questionnaireStep.click();

    // Then: the questionnaire form is visible (data-step="intake-questionnaire")
    const questionnaireForm = page.locator('[data-testid="questionnaire-form"][data-step="intake-questionnaire"]');
    await expect(questionnaireForm).toBeVisible({ timeout: 10_000 });

    // Then: data-questionnaire-submitted="false" (step not yet satisfied)
    await expect(questionnaireForm).toHaveAttribute("data-questionnaire-submitted", "false");

    // Then: the authored question prompt from the ADMIN surface appears in the PORTAL
    // (AC-ONBD-003-01: the questionnaire presented IS the one for their engagement's service type)
    // This is the core cross-app binding assertion: not a tautology — compares to the
    // accountant's authored content from Step 1.
    const questionLabel = page.locator('label').filter({ hasText: authoredPrompt });
    await expect(questionLabel).toBeVisible({ timeout: 10_000 });

    // ─── Step 5: Client fills in and submits ──────────────────────────────────
    // Find the question input (first question in the form)
    const allQuestionInputs = page.locator('[data-question-id]');
    await expect(allQuestionInputs).toHaveCount(1, { timeout: 5_000 });
    const firstInput = allQuestionInputs.first();
    await firstInput.fill("Cross-app e2e test answer");

    // Submit
    const submitButton = page.locator('[data-testid="questionnaire-submit-button"]');
    await expect(submitButton).not.toBeDisabled({ timeout: 5_000 });
    await submitButton.click();

    // Then: data-questionnaire-submitted flips to "true" (AC-ONBD-003-03)
    const satisfiedForm = page.locator('[data-testid="questionnaire-form"][data-questionnaire-submitted="true"]');
    await expect(satisfiedForm).toBeVisible({ timeout: 15_000 });

    // Then: the confirmation message is visible
    await expect(
      page.locator('[data-testid="questionnaire-submitted-confirmation"]'),
    ).toBeVisible({ timeout: 15_000 });

    // Then: the intake-questionnaire step is done
    await expect(
      page.locator('[data-testid="onboarding-step-intake-questionnaire"]'),
    ).toHaveAttribute("data-done", "true", { timeout: 15_000 });
  });
});
