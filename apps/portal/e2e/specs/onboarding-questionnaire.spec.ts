/**
 * apps/portal/e2e/specs/onboarding-questionnaire.spec.ts
 *
 * Tier-6 e2e — Client intake questionnaire step: correct questionnaire shown +
 * step satisfied on submit. The questionnaire step is only reachable AFTER the
 * engagement letter is signed (EPIC-005 gate). This spec drives through that gate.
 *
 * Acceptance criteria covered (EPIC-006):
 *   AC-ONBD-003-01 — post-gate client is shown the questionnaire for their engagement's
 *                    service type (assert the authored content appears — not a tautology)
 *   AC-ONBD-003-03 — step unsatisfied before submit, satisfied after
 *                    (data-questionnaire-submitted flips from "false" → "true")
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
 * Gate requirement (hard requirement — SDET reject if bypassed):
 *   The questionnaire step is only accessible AFTER the engagement letter is signed.
 *   This spec drives the full letter-sign precondition FIRST, then reaches the questionnaire step.
 *   Reuses the EPIC-005 onboarding e2e sign-letter pattern (onboarding.spec.ts / onboarding-cross-app.spec.ts).
 *
 * Stack: portal container at http://localhost:3000 (AUTH_PROVIDER=mock, ESIGN_PROVIDER=mock,
 *        ALLOW_MOCK_ESIGN=true). Admin container used only for DB seeding (admin pool).
 *
 * Fixture (per DECISION from TASK-005-007 pattern):
 *   Seeds: User + EngagementRequest + EngagementRequestService + QuestionnaireTemplate + Engagement
 *   The Engagement starts with letterSignedAt=NULL (unsigned) so we can drive the full
 *   letter-sign path through the EPIC-005 gate before reaching the questionnaire step.
 *   Template has a uniquely-identifiable question prompt (not a tautology assertion).
 *
 * // DECISION (TASK-006-006): We seed the QuestionnaireTemplate via admin pool BEFORE
 * // the client signs (so the template is ready when the questionnaire step unlocks).
 * // The Engagement.questionnaireSubmittedAt is NOT pre-set (NULL = not yet submitted).
 * // We seed the EngagementRequestService to link the engagement to the first active
 * // service in the catalog (the primary service resolved by getMyQuestionnaire DECISION-F).
 * // Cleanup reverses the FK chain: QuestionnaireAnswer → QuestionnaireTemplate →
 * // Engagement → EngagementRequestService → EngagementRequest → User.
 *
 * Run:
 *   pnpm --filter portal e2e:run -- --grep 'onboarding-questionnaire'
 *
 * AC-ONBD-003-03 satisfy-on-submit is run 3× zero-flake (ENGINE.md § Bug Fixes / TASK spec requirement).
 *
 * ADR-006: Portal-only client surface.
 * ADR-005: RLS policy not relaxed — admin pool used for seed/teardown only.
 * ADR-012: Tier-6 e2e.
 */

import { test, expect } from "@playwright/test";
import mssqlPkg from "mssql";
import { setupClientSession, clearSession } from "../fixtures/auth.js";

const { ConnectionPool } = mssqlPkg;

const PORTAL_URL = process.env["PORTAL_BASE_URL"] ?? "http://localhost:3000";

// ─── Deterministic fixture ids ─────────────────────────────────────────────────
// DECISION (TASK-006-006): Use a deterministic, e2e-only clerkUserId.
// The suffix "-q-" distinguishes this fixture from the EPIC-005 onboarding suite
// and the cross-app suite to prevent unique constraint collisions.
const FIXTURE_CLERK_USER_ID = "user_client_e2e_q_001";

// ─── Unique question prompt (honest fixture — not a tautology) ─────────────────
// This is the uniquely-identifiable content that proves the CORRECT template is shown.
// The prompt is set in beforeAll (once per suite run).
let FIXTURE_QUESTION_PROMPT = "";

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
      "[onboarding-questionnaire.spec] DATABASE_URL_ADMIN is not set (ADR-007).",
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
 * Seeds the full questionnaire-test fixture:
 *   1. User (fixture clerk id, CLIENT role)
 *   2. EngagementRequest (FK required for Engagement)
 *   3. Service lookup — picks the first active service by sortOrder ASC (DECISION-F primary)
 *   4. EngagementRequestService join row (links request to service)
 *   5. QuestionnaireTemplate for that service with a uniquely-identifiable question
 *   6. Engagement with clientUserId set, letterSignedAt=NULL (unsigned — gate closed)
 *
 * The letter-sign path is driven by the test itself (not pre-set here).
 * Cleanup: called per-test in afterEach to avoid cross-test contamination.
 */
async function seedQuestionnaireFixture(): Promise<SeedResult> {
  const pool = await getPool();

  // ── 1. Upsert User ─────────────────────────────────────────────────────────
  const userResult = await pool
    .request()
    .input("clerkId", FIXTURE_CLERK_USER_ID)
    .input("email", "e2e-q-001@questionnaire.e2e.test")
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
    if (!userId) throw new Error("[onboarding-questionnaire.spec] Failed to upsert User fixture row");
  }

  // ── 2. Seed EngagementRequest ──────────────────────────────────────────────
  const requestResult = await pool
    .request()
    .input("firstName", "QTest")
    .input("lastName", "E2E")
    .input("email", `e2e-q-req-${Date.now()}@questionnaire.e2e.test`)
    .query<{ id: string }>(
      `INSERT INTO [dbo].[EngagementRequest]
         ([firstName], [lastName], [email], [status], [createdAt], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES (@firstName, @lastName, @email, 'accepted', SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET())`,
    );

  const requestId = requestResult.recordset[0]?.id;
  if (!requestId) throw new Error("[onboarding-questionnaire.spec] Failed to seed EngagementRequest row");

  // ── 3. Resolve the primary service (DECISION-F: first active by sortOrder ASC) ─
  const serviceResult = await pool
    .request()
    .query<{ id: string }>(
      `SELECT TOP 1 [id] FROM [dbo].[Service] WHERE [active] = 1 ORDER BY [sortOrder] ASC, [id] ASC`,
    );

  const serviceId = serviceResult.recordset[0]?.id;
  if (!serviceId) throw new Error("[onboarding-questionnaire.spec] No active Service found (run pnpm db:seed first)");

  // ── 4. Link request → service (EngagementRequestService join row) ──────────
  await pool
    .request()
    .input("engagementRequestId", requestId)
    .input("serviceId", serviceId)
    .query(
      `INSERT INTO [dbo].[EngagementRequestService] ([engagementRequestId], [serviceId])
       VALUES (@engagementRequestId, @serviceId)`,
    );

  // ── 5. Upsert QuestionnaireTemplate for this service ───────────────────────
  // DECISION (TASK-006-006): The unique prompt is set in beforeAll and reused across the 3×
  // zero-flake runs. We use MERGE to handle re-seeding (retry runs after test failure).
  const questionsJson = JSON.stringify([
    {
      id: "q-e2e-fixture-001",
      prompt: FIXTURE_QUESTION_PROMPT,
      type: "text",
      required: true,
    },
  ]);

  // Check if a template already exists for this serviceId
  const existingTemplate = await pool
    .request()
    .input("serviceId", serviceId)
    .query<{ id: string }>(
      `SELECT [id] FROM [dbo].[QuestionnaireTemplate] WHERE [serviceId] = @serviceId`,
    );

  let templateId: string;
  if (existingTemplate.recordset[0]?.id) {
    // Update existing template
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
    // Insert new template
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
    if (!templateId) throw new Error("[onboarding-questionnaire.spec] Failed to seed QuestionnaireTemplate row");
  }

  // ── 6. Seed Engagement — letterSignedAt=NULL (letter unsigned, gate closed) ─
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
  if (!engagementId) throw new Error("[onboarding-questionnaire.spec] Failed to seed Engagement row");

  return { userId, requestId, engagementId, serviceId, templateId };
}

/**
 * Clean up seeded rows in reverse FK order (per TASK-005-007 pattern).
 * Called in afterEach to prevent cross-test contamination.
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
 * Delete the QuestionnaireTemplate for the fixture service (cleanup).
 * Called only in afterAll to avoid interfering with the 3× zero-flake runs.
 * NOTE: Template is shared across the suite's tests (same serviceId); we clean it in afterAll.
 */
async function cleanupTemplate(serviceId: string): Promise<void> {
  const pool = await getPool();
  // Clean QuestionnaireAnswer rows first (FK → QuestionnaireTemplate)
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

// ─── Resolve service id for afterAll cleanup ──────────────────────────────────
let _fixtureServiceId: string | null = null;

test.beforeAll(async () => {
  // Generate a unique prompt once per suite run — shared across all tests in this file
  // (all tests assert against the same authored content to satisfy AC-ONBD-003-01).
  FIXTURE_QUESTION_PROMPT = `[AC-ONBD-003-01/03] E2E fixture question — ${Date.now()}`;
});

test.afterAll(async () => {
  if (_fixtureServiceId) {
    await cleanupTemplate(_fixtureServiceId);
  }
  await cleanupFixtureUser();
  await closePool();
});

// ═══════════════════════════════════════════════════════════════════════════════
// AC-ONBD-003-01 — Post-gate client shown the questionnaire for their service type
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("[AC-ONBD-003-01] post-gate client is shown the questionnaire for their engagement's service type", () => {
  /**
   * Gherkin (EPIC-006 § Acceptance scenarios — verbatim):
   * Given an engagement for a given service type, with a questionnaire template defined for that service type
   * When the client reaches the questionnaire step
   * Then the questionnaire presented is the one for their engagement's service type
   *
   * Gate requirement: drives through the EPIC-005 letter-sign FIRST (questionnaire only unlocks
   * after the letter is signed). The sign path reuses the EPIC-005 mock-e-sign pattern
   * (ESIGN_PROVIDER=mock + ALLOW_MOCK_ESIGN=true — deterministic signed:true).
   *
   * Honest fixture: the questionnaire content assertion compares to FIXTURE_QUESTION_PROMPT —
   * a uniquely-identifiable prompt authored in this test run (not a tautology).
   */

  let seeded: SeedResult | null = null;

  test.beforeEach(async ({ page, request }) => {
    seeded = await seedQuestionnaireFixture();
    _fixtureServiceId = seeded.serviceId;
    await setupClientSession(page, request, FIXTURE_CLERK_USER_ID);
  });

  test.afterEach(async ({ page }) => {
    await clearSession(page);
    if (seeded) {
      await cleanupFixture(seeded.requestId);
      seeded = null;
    }
  });

  test("[AC-ONBD-003-01] client sees the questionnaire for their engagement's service type (after letter-sign)", async ({ page }) => {
    // Given: an engagement with a questionnaire template defined for its service type
    // (seeded in beforeEach — User + EngagementRequestService + QuestionnaireTemplate + Engagement)

    // ── Precondition: drive the letter-sign gate (EPIC-005) FIRST ─────────────
    await page.goto(`${PORTAL_URL}/onboarding`);

    // Confirm step 1 (engagement-letter) is accessible
    const letterStep = page.locator('[data-testid="onboarding-step-engagement-letter"]');
    await expect(letterStep).toHaveAttribute("data-accessible", "true", { timeout: 10_000 });

    // Sign the engagement letter (EPIC-005 mock e-sign)
    const signButton = page.locator('[data-testid="sign-letter-button"]');
    await expect(signButton).toBeVisible({ timeout: 10_000 });
    await signButton.click();

    // Wait for the letter-signed confirmation (revalidatePath triggers re-render)
    await expect(
      page.locator('[data-testid="letter-signed-confirmation"]'),
    ).toBeVisible({ timeout: 15_000 });

    // Confirm step 1 done + step 2 (intake-questionnaire) unlocked
    await expect(letterStep).toHaveAttribute("data-done", "true");
    await expect(
      page.locator('[data-testid="onboarding-step-intake-questionnaire"]'),
    ).toHaveAttribute("data-accessible", "true", { timeout: 15_000 });

    // ── When: the client reaches the questionnaire step ───────────────────────
    // Click on the questionnaire step to expand/navigate to it
    const questionnaireStep = page.locator('[data-testid="onboarding-step-intake-questionnaire"]');
    await questionnaireStep.click();

    // Then: the questionnaire form is visible (data-step="intake-questionnaire")
    const questionnaireForm = page.locator('[data-testid="questionnaire-form"][data-step="intake-questionnaire"]');
    await expect(questionnaireForm).toBeVisible({ timeout: 10_000 });

    // Then: the questionnaire presented is the one for THEIR engagement's service type.
    // Assert the authored question prompt appears (not-a-tautology: unique per suite run).
    // This proves AC-ONBD-003-01: the CORRECT template content (the one keyed to their
    // engagement's service type) is shown — not a generic empty form.
    const questionInput = page.locator(`[data-question-id="q-e2e-fixture-001"]`);
    await expect(questionInput).toBeVisible({ timeout: 10_000 });

    // Verify the question label contains our authored prompt
    const questionLabel = page.locator(`label[for="question-q-e2e-fixture-001"]`);
    await expect(questionLabel).toContainText(FIXTURE_QUESTION_PROMPT, { timeout: 10_000 });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// AC-ONBD-003-03 — Step unsatisfied before submit, satisfied after
// (data-questionnaire-submitted flips from "false" → "true")
// Run 3× zero-flake (ENGINE.md § Bug Fixes / TASK spec requirement)
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("[AC-ONBD-003-03] step unsatisfied before submit, satisfied after submit", () => {
  /**
   * Gherkin (EPIC-006 § Acceptance scenarios — verbatim):
   * Given a client viewing the questionnaire who has not yet submitted it
   * When the questionnaire step's satisfaction is evaluated
   * Then the step is not satisfied until the client submits their completed questionnaire
   *
   * Gate requirement: drives through the EPIC-005 letter-sign FIRST (same as AC-ONBD-003-01).
   *
   * data-questionnaire-submitted:
   *   "false" → questionnaire not yet submitted (step unsatisfied)
   *   "true"  → questionnaire submitted (step satisfied, read-only state)
   *
   * Run 3× zero-flake: This describe block runs once per test execution. The submission
   * gate spec is run 3 consecutive times by the human runner (3× zero-flake per TASK spec).
   * The test is self-contained and does NOT depend on state from the AC-ONBD-003-01 test.
   *
   * Submit trigger (ENGINE.md § AC-ONBD-003-03):
   *   submitQuestionnaireAction → BLOCK-governed write (QuestionnaireAnswer INSERT +
   *   Engagement.questionnaireSubmittedAt UPDATE) → revalidatePath('/onboarding') →
   *   getMyOnboardingAction resolves updated model → QuestionnaireStep renders
   *   data-questionnaire-submitted="true".
   *
   * Gate authoring evidence (Introduces-gate: advisory):
   *   Named code path: handleSubmit → submitQuestionnaireAction → submitQuestionnaireAsClient
   *     → Engagement.questionnaireSubmittedAt UPDATE → revalidatePath → QuestionnaireStep
   *     renders QuestionnaireSubmittedState with data-questionnaire-submitted="true".
   *   Counterfactual: if revalidatePath('/onboarding') were removed from submitQuestionnaireAction,
   *     the page would not re-render after submit and data-questionnaire-submitted would remain
   *     "false" — this test would fail the satisfied assertion.
   */

  let seeded: SeedResult | null = null;

  test.beforeEach(async ({ page, request }) => {
    seeded = await seedQuestionnaireFixture();
    _fixtureServiceId = seeded.serviceId;
    await setupClientSession(page, request, FIXTURE_CLERK_USER_ID);
  });

  test.afterEach(async ({ page }) => {
    await clearSession(page);
    if (seeded) {
      await cleanupFixture(seeded.requestId);
      seeded = null;
    }
  });

  test("[AC-ONBD-003-03] data-questionnaire-submitted flips from false to true on submit", async ({ page }) => {
    // ── Precondition: drive the letter-sign gate (EPIC-005) ───────────────────
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

    // ── Navigate to the questionnaire step ────────────────────────────────────
    const questionnaireStep = page.locator('[data-testid="onboarding-step-intake-questionnaire"]');
    await questionnaireStep.click();

    // Given: a client viewing the questionnaire who has not yet submitted it
    // Then: data-questionnaire-submitted="false" (step unsatisfied before submit)
    const questionnaireForm = page.locator('[data-testid="questionnaire-form"][data-step="intake-questionnaire"]');
    await expect(questionnaireForm).toBeVisible({ timeout: 10_000 });
    await expect(questionnaireForm).toHaveAttribute("data-questionnaire-submitted", "false");

    // The submit button is present (will be enabled once required fields are filled)
    const submitButton = page.locator('[data-testid="questionnaire-submit-button"]');
    await expect(submitButton).toBeVisible({ timeout: 10_000 });

    // ── When: the client fills in the required question and submits ───────────
    // Fill in the fixture's required question (q-e2e-fixture-001, required: true)
    const questionInput = page.locator('[data-question-id="q-e2e-fixture-001"]');
    await expect(questionInput).toBeVisible({ timeout: 10_000 });
    await questionInput.fill("My e2e test answer for the required question");

    // Then: submit button is now enabled (required fields satisfied)
    await expect(submitButton).not.toBeDisabled({ timeout: 5_000 });

    // When: click Submit
    await submitButton.click();

    // ── Then: step is satisfied — data-questionnaire-submitted flips to "true" ─
    // After submitQuestionnaireAction → revalidatePath('/onboarding'), the server re-renders
    // the onboarding page. The QuestionnaireSubmittedState renders with data-questionnaire-submitted="true".
    const satisfiedForm = page.locator('[data-testid="questionnaire-form"][data-questionnaire-submitted="true"]');
    await expect(satisfiedForm).toBeVisible({ timeout: 15_000 });

    // Also assert the confirmation message is visible (QuestionnaireSubmittedState)
    await expect(
      page.locator('[data-testid="questionnaire-submitted-confirmation"]'),
    ).toBeVisible({ timeout: 15_000 });

    // And the onboarding step is now marked done
    await expect(
      page.locator('[data-testid="onboarding-step-intake-questionnaire"]'),
    ).toHaveAttribute("data-done", "true", { timeout: 15_000 });
  });
});
