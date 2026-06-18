/**
 * apps/portal/e2e/demo/questionnaire.demo.spec.ts
 *
 * @demo UI demo walkthrough — EPIC-006 Intake questionnaire (portal surface).
 *
 * Not part of the e2e gate: `e2e:run` / `e2e:smoke` exclude `@demo` (--grep-invert @demo);
 * this runs ONLY via `pnpm --filter portal e2e:demo`. It drives a post-letter-gate client's
 * questionnaire completion happy-path against the live docker-compose container stack
 * (AUTH_PROVIDER=mock, ESIGN_PROVIDER=mock, ALLOW_MOCK_ESIGN=true) and writes an
 * AC-tagged screenshot gallery to docs/demos/EPIC-006/. NON-GATING.
 *
 * Persona: sarah-returning-client (post-letter-gate, questionnaire step unlocked)
 * Flows:   flow-onboarding    (.planning/flows/flow-onboarding.md)
 * Policy:  .orchestration/DEMO-POLICY.md
 *
 * Gallery ordering (EPIC-006 portal surface — screenshots 04–06):
 *   04-AC-ONBD-003-01-questionnaire-shown.png
 *       — after letter-gate, client clicks into the questionnaire step; the form is
 *         shown with the template question authored by the accountant (AC-ONBD-003-01)
 *   05-AC-ONBD-003-03-pre-submit.png
 *       — client fills in the required field; form is in unsatisfied state
 *         (data-questionnaire-submitted="false"); submit button is enabled (AC-ONBD-003-03)
 *   06-AC-ONBD-003-03-step-satisfied.png
 *       — after submit: data-questionnaire-submitted="true"; confirmation visible;
 *         step marked done (AC-ONBD-003-03)
 *
 * Each test ASSERTS the target element is visible BEFORE screenshotting (broken UI fails loudly).
 *
 * Pre-reqs (same SUT as the e2e gate):
 *   docker compose up -d → pnpm db:migrate → pnpm db:seed
 *
 * Fixture:
 *   // DECISION (TASK-006-007): We seed a User row with deterministic clerkUserId
 *   // "user_client_e2e_demo_006" (distinct from all other suites — see onboarding-questionnaire.spec.ts
 *   // "user_client_e2e_q_001", questionnaire-cross-app.spec.ts "user_client_e2e_qcross_001",
 *   // and the EPIC-005 demo "user_client_e2e_demo_005").
 *   // We seed the QuestionnaireTemplate, EngagementRequestService, and Engagement via admin pool.
 *   // The letter-sign path is driven by the test itself (letterSignedAt seeded as NULL then the
 *   // test clicks sign-letter-button) — same pattern as onboarding-questionnaire.spec.ts.
 *   // The FIXTURE_QUESTION_PROMPT is a uniquely-identifiable prompt (not a tautology) so the
 *   // screenshot genuinely shows authored content.
 *
 * ADR-005: Sessions are established via /api/mock-session (role set server-side). RLS
 *          policy is NOT relaxed; admin pool used for seed/teardown only.
 * ADR-006: Two-surface platform — this spec covers the portal surface (Client Portal).
 * ADR-023/024: e-sign goes through ESignatureProvider PORT (ESIGN_PROVIDER=mock).
 *
 * Run:
 *   pnpm --filter portal e2e:demo
 */

import { test, expect } from "@playwright/test";
import path from "path";
import mssqlPkg from "mssql";
import { setupClientSession, clearSession } from "../fixtures/auth.js";

const { ConnectionPool } = mssqlPkg;

// Gallery output dir — repo-root/docs/demos/EPIC-006 (resolved from this file's dir).
// Depth from apps/portal/e2e/demo/ to repo root = ../../../../
const DEMO_DIR = path.resolve(__dirname, "../../../../docs/demos/EPIC-006");
const shot = (file: string) => path.join(DEMO_DIR, file);

const PORTAL_URL = process.env["PORTAL_BASE_URL"] ?? "http://localhost:3000";

// ─── Deterministic fixture ids ─────────────────────────────────────────────────
// DECISION (TASK-006-007): Use a deterministic, demo-only clerkUserId.
// The "-demo-006" suffix distinguishes this fixture from all other suites.
const FIXTURE_CLERK_USER_ID = "user_client_e2e_demo_006";

// Unique question prompt — authored in this run; proves the CORRECT template is shown.
const FIXTURE_QUESTION_PROMPT = `[AC-ONBD-003-01] Demo-006 questionnaire question — ${Date.now()}`;

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
      "[questionnaire.demo.spec] DATABASE_URL_ADMIN is not set. Required for admin pool seed/teardown.",
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

// ─── Fixture seed results ──────────────────────────────────────────────────────

interface SeedResult {
  userId: string;
  requestId: string;
  engagementId: string;
  serviceId: string;
  templateId: string;
}

/**
 * Seeds the full questionnaire-demo fixture (mirrors onboarding-questionnaire.spec.ts):
 *   1. User (fixture clerk id, CLIENT role) — via MERGE (idempotent)
 *   2. EngagementRequest
 *   3. Service lookup — first active by sortOrder ASC (DECISION-F primary)
 *   4. EngagementRequestService join row
 *   5. QuestionnaireTemplate for that service (FIXTURE_QUESTION_PROMPT content)
 *   6. Engagement — letterSignedAt=NULL (letter unsigned, gate closed)
 *
 * The letter-sign path is driven by the test itself.
 * Cleanup: call cleanupFixture() + cleanupTemplate() in try/finally.
 */
async function seedQuestionnaireFixture(): Promise<SeedResult> {
  const pool = await getPool();

  // ── 1. Upsert User ─────────────────────────────────────────────────────────
  const userResult = await pool
    .request()
    .input("clerkId", FIXTURE_CLERK_USER_ID)
    .input("email", "e2e-demo-006@questionnaire.demo.e2e.test")
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
    if (!userId) throw new Error("[questionnaire.demo.spec] Failed to upsert/find User fixture row");
  }

  // ── 2. Seed EngagementRequest ──────────────────────────────────────────────
  const requestResult = await pool
    .request()
    .input("firstName", "DemoSarah")
    .input("lastName", "Questionnaire")
    .input("email", `e2e-demo-q-req-${Date.now()}@questionnaire.demo.e2e.test`)
    .query<{ id: string }>(
      `INSERT INTO [dbo].[EngagementRequest]
         ([firstName], [lastName], [email], [status], [createdAt], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES (@firstName, @lastName, @email, 'accepted', SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET())`,
    );

  const requestId = requestResult.recordset[0]?.id;
  if (!requestId) throw new Error("[questionnaire.demo.spec] Failed to seed EngagementRequest row");

  // ── 3. Resolve the primary service (DECISION-F: first active by sortOrder ASC) ─
  const serviceResult = await pool
    .request()
    .query<{ id: string }>(
      `SELECT TOP 1 [id] FROM [dbo].[Service] WHERE [active] = 1 ORDER BY [sortOrder] ASC, [id] ASC`,
    );

  const serviceId = serviceResult.recordset[0]?.id;
  if (!serviceId) throw new Error("[questionnaire.demo.spec] No active Service found (run pnpm db:seed first)");

  // ── 4. Link request → service (EngagementRequestService join row) ──────────
  await pool
    .request()
    .input("engagementRequestId", requestId)
    .input("serviceId", serviceId)
    .query(
      `INSERT INTO [dbo].[EngagementRequestService] ([engagementRequestId], [serviceId])
       VALUES (@engagementRequestId, @serviceId)`,
    );

  // ── 5. Upsert QuestionnaireTemplate for this service with unique prompt ─────
  const questionsJson = JSON.stringify([
    {
      id: "q-demo-006-fixture-001",
      prompt: FIXTURE_QUESTION_PROMPT,
      type: "text",
      required: true,
    },
  ]);

  const existingTemplate = await pool
    .request()
    .input("serviceId", serviceId)
    .query<{ id: string }>(
      `SELECT [id] FROM [dbo].[QuestionnaireTemplate] WHERE [serviceId] = @serviceId`,
    );

  let templateId: string;
  if (existingTemplate.recordset[0]?.id) {
    templateId = existingTemplate.recordset[0].id;
    await pool
      .request()
      .input("serviceId", serviceId)
      .input("questions", mssqlPkg.NVarChar(mssqlPkg.MAX), questionsJson)
      .query(
        `UPDATE [dbo].[QuestionnaireTemplate]
         SET [questions] = @questions, [updatedAt] = SYSDATETIMEOFFSET()
         WHERE [serviceId] = @serviceId`,
      );
  } else {
    const templateResult = await pool
      .request()
      .input("serviceId", serviceId)
      .input("questions", mssqlPkg.NVarChar(mssqlPkg.MAX), questionsJson)
      .query<{ id: string }>(
        `INSERT INTO [dbo].[QuestionnaireTemplate]
           ([serviceId], [questions], [updatedAt])
         OUTPUT INSERTED.[id]
         VALUES (@serviceId, @questions, SYSDATETIMEOFFSET())`,
      );
    templateId = templateResult.recordset[0]?.id ?? "";
    if (!templateId) throw new Error("[questionnaire.demo.spec] Failed to seed QuestionnaireTemplate row");
  }

  // ── 6. Seed Engagement — letterSignedAt=NULL (unsigned, gate closed) ────────
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
  if (!engagementId) throw new Error("[questionnaire.demo.spec] Failed to seed Engagement row");

  return { userId, requestId, engagementId, serviceId, templateId };
}

/**
 * Clean up seeded rows in reverse FK order.
 * Called in try/finally to ensure cleanup even on test failure.
 */
async function cleanupFixture(requestId: string): Promise<void> {
  const pool = await getPool();

  // 1. QuestionnaireAnswer (FK → Engagement + QuestionnaireTemplate)
  await pool
    .request()
    .input("requestId", requestId)
    .query(
      `DELETE qa
       FROM [dbo].[QuestionnaireAnswer] qa
       JOIN [dbo].[Engagement] e ON e.[id] = qa.[engagementId]
       WHERE e.[engagementRequestId] = @requestId`,
    );

  // 2. Engagement (FK → EngagementRequest)
  await pool
    .request()
    .input("requestId", requestId)
    .query(`DELETE FROM [dbo].[Engagement] WHERE [engagementRequestId] = @requestId`);

  // 3. EngagementRequestService (FK → EngagementRequest)
  await pool
    .request()
    .input("requestId", requestId)
    .query(`DELETE FROM [dbo].[EngagementRequestService] WHERE [engagementRequestId] = @requestId`);

  // 4. EngagementRequest
  await pool
    .request()
    .input("requestId", requestId)
    .query(`DELETE FROM [dbo].[EngagementRequest] WHERE [id] = @requestId`);
}

/**
 * Delete the QuestionnaireTemplate for the demo service.
 * Called in afterAll to avoid interfering with per-test runs (template is shared).
 */
async function cleanupTemplate(serviceId: string): Promise<void> {
  const pool = await getPool();
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

// ─── Track service id for afterAll template cleanup ────────────────────────────
let _fixtureServiceId: string | null = null;

// ─── afterAll: clean up demo user, template, and close pool ───────────────────

test.afterAll(async () => {
  if (_fixtureServiceId) {
    await cleanupTemplate(_fixtureServiceId);
  }
  await cleanupFixtureUser();
  await closePool();
});

// ─── Helper: drive the EPIC-005 letter-sign gate ──────────────────────────────
//
// The questionnaire step only unlocks after the engagement letter is signed (EPIC-005 gate).
// This helper drives the full letter-sign path before each test that needs the gate satisfied.
// Reuses the EPIC-005 mock-e-sign pattern (ESIGN_PROVIDER=mock + ALLOW_MOCK_ESIGN=true).

async function driveLetterSignGate(page: import("@playwright/test").Page): Promise<void> {
  // Navigate to onboarding
  await page.goto(`${PORTAL_URL}/onboarding`);

  // Step 1 (engagement-letter) must be accessible
  const letterStep = page.locator('[data-testid="onboarding-step-engagement-letter"]');
  await expect(
    letterStep,
    "engagement-letter step must be accessible (data-accessible=true) — EPIC-005 gate",
  ).toHaveAttribute("data-accessible", "true", { timeout: 15_000 });

  // The sign button must be visible
  const signButton = page.locator('[data-testid="sign-letter-button"]');
  await expect(signButton, "sign-letter-button must be visible").toBeVisible({ timeout: 10_000 });

  // Click Sign (drives signEngagementLetterAction via ESignatureProvider PORT — mock)
  await signButton.click();

  // Wait for the letter-signed confirmation (revalidatePath triggers re-render)
  await expect(
    page.locator('[data-testid="letter-signed-confirmation"]'),
    "letter-signed-confirmation must appear after signing",
  ).toBeVisible({ timeout: 15_000 });

  // Step 2 (intake-questionnaire) must now be accessible
  await expect(
    page.locator('[data-testid="onboarding-step-intake-questionnaire"]'),
    "intake-questionnaire step must be accessible after letter-sign",
  ).toHaveAttribute("data-accessible", "true", { timeout: 15_000 });
}

// ─── Screen 04: Questionnaire step shown with matching template (AC-ONBD-003-01) ─

test(
  "[AC-ONBD-003-01] @demo 04 — post-letter-gate client: questionnaire step shown with the correct template",
  async ({ page, request }) => {
    // Screen 04: CLIENT (post-letter-sign) clicks into the questionnaire step.
    // The form is visible and contains the question authored by the accountant
    // (FIXTURE_QUESTION_PROMPT — uniquely-identifiable, not a tautology).
    // Proves AC-ONBD-003-01: the questionnaire presented is the one for their
    // engagement's service type.
    //
    // Screenshot strategy: full-page screenshot of the onboarding page with the
    // questionnaire form open — shows the form with the authored question.

    let seeded: SeedResult | null = null;

    try {
      seeded = await seedQuestionnaireFixture();
      _fixtureServiceId = seeded.serviceId;
      await setupClientSession(page, request, FIXTURE_CLERK_USER_ID);

      // Drive through the letter-sign gate (EPIC-005 precondition)
      await driveLetterSignGate(page);

      // When: the client clicks into the questionnaire step
      const questionnaireStep = page.locator('[data-testid="onboarding-step-intake-questionnaire"]');
      await questionnaireStep.click();

      // Then: the questionnaire form is visible — AC-ONBD-003-01
      const questionnaireForm = page.locator(
        '[data-testid="questionnaire-form"][data-step="intake-questionnaire"]',
      );
      await expect(
        questionnaireForm,
        "questionnaire-form must be visible (AC-ONBD-003-01)",
      ).toBeVisible({ timeout: 10_000 });

      // Then: the authored question input is visible (correct template shown — AC-ONBD-003-01)
      const questionInput = page.locator('[data-question-id="q-demo-006-fixture-001"]');
      await expect(
        questionInput,
        "Question input for demo fixture question must be visible (AC-ONBD-003-01)",
      ).toBeVisible({ timeout: 10_000 });

      // Then: the question label contains our authored prompt (honest fixture — not a tautology)
      const questionLabel = page.locator('label[for="question-q-demo-006-fixture-001"]');
      await expect(
        questionLabel,
        "Question label must contain the authored FIXTURE_QUESTION_PROMPT (AC-ONBD-003-01)",
      ).toContainText(FIXTURE_QUESTION_PROMPT, { timeout: 10_000 });

      // Screenshot 04: full-page — questionnaire form open, authored question visible
      await page.screenshot({
        path: shot("04-AC-ONBD-003-01-questionnaire-shown.png"),
        fullPage: true,
      });
    } finally {
      await clearSession(page);
      if (seeded) await cleanupFixture(seeded.requestId);
    }
  },
);

// ─── Screens 05 + 06: Pre-submit (unsatisfied) → post-submit (satisfied) (AC-ONBD-003-03) ─

test(
  "[AC-ONBD-003-03] @demo 05+06 — post-letter-gate client: fills questionnaire → submit → step satisfied",
  async ({ page, request }) => {
    // Screen 05: Client fills in the required question field.
    //            data-questionnaire-submitted="false" (step unsatisfied before submit).
    //            Submit button is enabled (required fields filled).
    //            Proves AC-ONBD-003-03 (pre-submit: step not yet satisfied).
    //
    // Screen 06: After clicking Submit, data-questionnaire-submitted="true";
    //            confirmation visible; step marked done (data-done="true").
    //            Proves AC-ONBD-003-03 (post-submit: step satisfied once submitted).
    //
    // E-sign goes through ESignatureProvider PORT (ESIGN_PROVIDER=mock + ALLOW_MOCK_ESIGN=true).

    let seeded: SeedResult | null = null;

    try {
      seeded = await seedQuestionnaireFixture();
      _fixtureServiceId = seeded.serviceId;
      await setupClientSession(page, request, FIXTURE_CLERK_USER_ID);

      // Drive through the letter-sign gate (EPIC-005 precondition)
      await driveLetterSignGate(page);

      // Navigate to the questionnaire step
      const questionnaireStep = page.locator('[data-testid="onboarding-step-intake-questionnaire"]');
      await questionnaireStep.click();

      // The questionnaire form must be visible
      const questionnaireForm = page.locator(
        '[data-testid="questionnaire-form"][data-step="intake-questionnaire"]',
      );
      await expect(
        questionnaireForm,
        "questionnaire-form must be visible",
      ).toBeVisible({ timeout: 10_000 });

      // Given: step is unsatisfied before submit — AC-ONBD-003-03 (pre-submit)
      await expect(
        questionnaireForm,
        "data-questionnaire-submitted must be 'false' before submit (AC-ONBD-003-03)",
      ).toHaveAttribute("data-questionnaire-submitted", "false");

      // Fill in the required question input
      const questionInput = page.locator('[data-question-id="q-demo-006-fixture-001"]');
      await expect(questionInput, "Question input must be visible").toBeVisible({ timeout: 10_000 });
      await questionInput.fill("Sarah's demo answer for the intake questionnaire");

      // The submit button must be visible and enabled
      const submitButton = page.locator('[data-testid="questionnaire-submit-button"]');
      await expect(submitButton, "Submit button must be visible").toBeVisible({ timeout: 10_000 });
      await expect(submitButton, "Submit button must be enabled (required fields filled)").not.toBeDisabled({ timeout: 5_000 });

      // Screenshot 05: form filled in, submit button enabled, step unsatisfied
      await page.screenshot({
        path: shot("05-AC-ONBD-003-03-pre-submit.png"),
        fullPage: true,
      });

      // When: client clicks Submit
      await submitButton.click();

      // Then: step is satisfied — data-questionnaire-submitted flips to "true" — AC-ONBD-003-03
      const satisfiedForm = page.locator(
        '[data-testid="questionnaire-form"][data-questionnaire-submitted="true"]',
      );
      await expect(
        satisfiedForm,
        "data-questionnaire-submitted must flip to 'true' after submit (AC-ONBD-003-03)",
      ).toBeVisible({ timeout: 15_000 });

      // Then: confirmation message is visible
      await expect(
        page.locator('[data-testid="questionnaire-submitted-confirmation"]'),
        "questionnaire-submitted-confirmation must be visible (AC-ONBD-003-03)",
      ).toBeVisible({ timeout: 15_000 });

      // Then: the questionnaire step is marked done
      await expect(
        page.locator('[data-testid="onboarding-step-intake-questionnaire"]'),
        "intake-questionnaire step must have data-done=true after submit (AC-ONBD-003-03)",
      ).toHaveAttribute("data-done", "true", { timeout: 15_000 });

      // Screenshot 06: post-submit — step done, satisfaction confirmation visible
      await page.screenshot({
        path: shot("06-AC-ONBD-003-03-step-satisfied.png"),
        fullPage: true,
      });
    } finally {
      await clearSession(page);
      if (seeded) await cleanupFixture(seeded.requestId);
    }
  },
);
