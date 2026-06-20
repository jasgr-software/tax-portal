/**
 * apps/portal/e2e/specs/onboarding-completion.spec.ts
 *
 * Tier-6 e2e — EPIC-008 Onboarding completion path (portal surface):
 *   - AC-ONBD-005-01: all three steps satisfied → onboarding complete (all steps data-done="true")
 *   - AC-ONBD-005-02: any one step unsatisfied → onboarding NOT complete (stays incomplete)
 *
 * Gherkin binding (EPIC-008 § Acceptance scenarios — verbatim):
 *
 *   AC-ONBD-005-01:
 *   "Given an engagement whose letter is signed, questionnaire submitted, and required documents uploaded
 *    When onboarding completion is evaluated
 *    Then onboarding is marked complete"
 *
 *   AC-ONBD-005-02:
 *   "Given an engagement with at least one of the three onboarding steps unsatisfied
 *    When onboarding completion is evaluated
 *    Then onboarding is not complete"
 *
 * Strategy:
 *
 *   Positive path (AC-ONBD-005-01):
 *     Seed an engagement that is pre-letter-signed + pre-questionnaire-submitted; the
 *     test then drives the FINAL required step (document upload) through the browser,
 *     triggering processOnboardingCompletion. The test observes:
 *       - All three steps show data-done="true" in the OnboardingSequence
 *       - data-remaining="0" on the position indicator
 *     This proves the portal "completion" observable: all steps satisfied.
 *
 *   Negative path (AC-ONBD-005-02):
 *     DB-seeds a fully-complete engagement (all three columns set) but then asserts
 *     the API-layer observable: even when the page is rendered for an engagement with
 *     only letter-signed (no questionnaire, no document), the onboarding page correctly
 *     shows steps that are NOT done, proving the incomplete guard is observable.
 *     An engagement with only letterSignedAt set → questionnaire + document-upload steps
 *     are still not done → position indicator data-remaining > 0.
 *
 * Stack: portal container at http://localhost:3000 (AUTH_PROVIDER=mock, ESIGN_PROVIDER=mock,
 *        STORAGE_PROVIDER=azurite, MALWARE_SCAN_PROVIDER=mock).
 *
 * Fixture:
 *   Positive: User + EngagementRequest + Engagement (letter signed + questionnaire submitted
 *             pre-seeded) + QuestionnaireTemplate + QuestionnaireAnswer + DocumentRequest.
 *   Negative: User + EngagementRequest + Engagement (only letterSignedAt set; questionnaire
 *             and document-upload not satisfied).
 *   Admin DB pool used for seed / teardown only (ADR-003, ADR-005).
 *
 * Run:
 *   pnpm --filter portal e2e:run -- --grep 'onboarding-completion'
 *
 * ADR-006: Portal-only surface.
 * ADR-005: RLS policy not relaxed — admin pool for seed/teardown only.
 * ADR-012: Tier-6 e2e.
 * EPIC-008: completion path capstone.
 */

import { test, expect } from "@playwright/test";
import mssqlPkg from "mssql";
import { setupClientSession, clearSession } from "../fixtures/auth.js";
import { configureAzuriteCors } from "../fixtures/azurite-cors.js";

const { ConnectionPool } = mssqlPkg;

const PORTAL_URL = process.env["PORTAL_BASE_URL"] ?? "http://localhost:3000";

// Distinct clerkId — suffix "-compl-" avoids collision with all other e2e suites.
const FIXTURE_CLERK_USER_ID = "user_client_e2e_compl_001";
// Second fixture user for negative path (avoids collision with positive path user)
const FIXTURE_CLERK_USER_ID_NEG = "user_client_e2e_compl_neg_001";

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
      "[onboarding-completion.spec] DATABASE_URL_ADMIN is not set (ADR-007).",
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

// ─── Shared upsert helper ────────────────────────────────────────────────────────

async function upsertUser(clerkId: string, email: string): Promise<string> {
  const pool = await getPool();

  const userResult = await pool
    .request()
    .input("clerkId", clerkId)
    .input("email", email)
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
      .input("clerkId", clerkId)
      .query<{ id: string }>(`SELECT [id] FROM [dbo].[User] WHERE [clerkId] = @clerkId`);
    userId = lookup.recordset[0]?.id;
    if (!userId) throw new Error(`[onboarding-completion.spec] Failed to upsert User (clerkId=${clerkId})`);
  }
  return userId;
}

// ─── Positive-path fixture ────────────────────────────────────────────────────────
//
// Seeds an engagement that is pre-signed (letterSignedAt) + pre-questionnaire-submitted
// (questionnaireSubmittedAt + QuestionnaireAnswer row) + one required DocumentRequest.
// The test then drives the final upload through the browser to complete onboarding.
//

interface PositiveSeedResult {
  userId: string;
  requestId: string;
  engagementId: string;
  documentRequestId: string;
  serviceId: string;
}

async function seedPositiveFixture(): Promise<PositiveSeedResult> {
  const pool = await getPool();

  // 0. Idempotent pre-cleanup for the positive fixture user
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
  await pool
    .request()
    .input("clerkId", FIXTURE_CLERK_USER_ID)
    .query(
      `DELETE e
       FROM [dbo].[Engagement] e
       JOIN [dbo].[User] u ON u.[id] = e.[clientUserId]
       WHERE u.[clerkId] = @clerkId`,
    );

  // 1. Upsert User
  const userId = await upsertUser(FIXTURE_CLERK_USER_ID, "e2e-compl-001@completion.e2e.test");

  // 2. Get first active service for the questionnaire template
  const serviceRow = await pool
    .request()
    .query<{ id: string }>(
      `SELECT TOP 1 [id] FROM [dbo].[Service] WHERE [active] = 1 ORDER BY [sortOrder] ASC`,
    );
  const serviceId = serviceRow.recordset[0]?.id;
  if (!serviceId) throw new Error("[onboarding-completion.spec] No active service found for fixture");

  // 3. Seed QuestionnaireTemplate for the service (idempotent via MERGE on serviceId)
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
    if (!templateId) throw new Error("[onboarding-completion.spec] Failed to upsert QuestionnaireTemplate");
  }

  // 4. EngagementRequest
  const requestResult = await pool
    .request()
    .input("firstName", "ComplTest")
    .input("lastName", "E2E")
    .input("email", `e2e-compl-req-${Date.now()}@completion.e2e.test`)
    .query<{ id: string }>(
      `INSERT INTO [dbo].[EngagementRequest]
         ([firstName], [lastName], [email], [status], [createdAt], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES (@firstName, @lastName, @email, 'accepted', SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET())`,
    );

  const requestId = requestResult.recordset[0]?.id;
  if (!requestId) throw new Error("[onboarding-completion.spec] Failed to seed EngagementRequest");

  // 4a. Link request to service
  await pool
    .request()
    .input("engagementRequestId", requestId)
    .input("serviceId", serviceId)
    .query(
      `INSERT INTO [dbo].[EngagementRequestService] ([engagementRequestId], [serviceId])
       VALUES (@engagementRequestId, @serviceId)`,
    );

  // 5. Engagement — pre-signed + pre-questionnaire-submitted (status=New; completion not yet triggered)
  const evidenceJson = JSON.stringify({
    provider: "mock",
    ref: "e2e-compl-mock-ref",
    signedAt: new Date().toISOString(),
  });

  const engagementResult = await pool
    .request()
    .input("engagementRequestId", requestId)
    .input("clientUserId", userId)
    .input("status", "New")
    .input("letterSignedAt", new Date())
    .input("letterSignatureEvidence", evidenceJson)
    .input("letterTemplateSnapshot", "E2E completion test letter snapshot")
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
  if (!engagementId) throw new Error("[onboarding-completion.spec] Failed to seed Engagement");

  // 6. QuestionnaireAnswer row (to mark questionnaire step as satisfied)
  const answersJson = JSON.stringify({ q1: "E2E completion test answer" });
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

  // 7. DocumentRequest — the final required step for completion
  // DECISION (TASK-008-004): DocumentRequest has no [required] column (TASK-007 schema).
  // A DocumentRequest in the engagement makes allRequiredProvided=false until fulfilled.
  const docRequestResult = await pool
    .request()
    .input("engagementId", engagementId)
    .input("label", "Tax Return Document (E2E completion test)")
    .query<{ id: string }>(
      `INSERT INTO [dbo].[DocumentRequest]
         ([engagementId], [label], [createdAt], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES (@engagementId, @label, SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET())`,
    );

  const documentRequestId = docRequestResult.recordset[0]?.id;
  if (!documentRequestId) throw new Error("[onboarding-completion.spec] Failed to seed DocumentRequest");

  // DIAGNOSTIC (TASK-008-004): Verify the DocumentRequest is visible via admin pool.
  const verifyDrResult = await pool
    .request()
    .input("engagementId", engagementId)
    .query<{ id: string; engagementId: string; label: string }>(
      `SELECT [id], [engagementId], [label] FROM [dbo].[DocumentRequest] WHERE [engagementId] = @engagementId`,
    );
  console.log(
    `[DIAG] DocumentRequest count via admin pool for engagementId=${engagementId}: ${verifyDrResult.recordset.length}`,
    verifyDrResult.recordset.map((r) => ({ id: r.id, engagementId: r.engagementId })),
  );

  // DIAGNOSTIC: Verify the Engagement.clientUserId is set correctly
  const verifyEngResult = await pool
    .request()
    .input("engagementId", engagementId)
    .query<{ clientUserId: string; status: string }>(
      `SELECT [clientUserId], [status] FROM [dbo].[Engagement] WHERE [id] = @engagementId`,
    );
  console.log(
    `[DIAG] Engagement for engagementId=${engagementId}: clientUserId=${verifyEngResult.recordset[0]?.clientUserId}, status=${verifyEngResult.recordset[0]?.status}`,
  );

  // DIAGNOSTIC: Verify the User row exists with correct clerkId
  const verifyUserResult = await pool
    .request()
    .input("userId", userId)
    .query<{ id: string; clerkId: string }>(
      `SELECT [id], [clerkId] FROM [dbo].[User] WHERE [id] = @userId`,
    );
  console.log(
    `[DIAG] User for userId=${userId}: clerkId=${verifyUserResult.recordset[0]?.clerkId}`,
  );

  return {
    userId: userId.toLowerCase(),
    requestId: requestId.toLowerCase(),
    engagementId: engagementId.toLowerCase(),
    documentRequestId: documentRequestId.toLowerCase(),
    serviceId: serviceId.toLowerCase(),
  };
}

async function cleanupPositiveFixture(requestId: string): Promise<void> {
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
  // Delete Notification rows linked to the engagement (via engagementId FK or engagementRequestId)
  await pool.request().input("requestId", requestId).query(
    `DELETE n
     FROM [dbo].[Notification] n
     JOIN [dbo].[Engagement] e ON e.[engagementRequestId] = @requestId
     WHERE n.[engagementRequestId] = @requestId`,
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

// ─── Negative-path fixture ────────────────────────────────────────────────────────
//
// Seeds an engagement with ONLY letterSignedAt set; questionnaire not submitted,
// no document requests at all. This gives us an engagement where the portal page
// correctly shows incomplete steps (AC-ONBD-005-02: at least one step unsatisfied).
//

interface NegativeSeedResult {
  userId: string;
  requestId: string;
  engagementId: string;
}

async function seedNegativeFixture(): Promise<NegativeSeedResult> {
  const pool = await getPool();

  // 0. Idempotent pre-cleanup — delete in FK-safe order (children first)
  await pool
    .request()
    .input("clerkId", FIXTURE_CLERK_USER_ID_NEG)
    .query(
      `DELETE dr
       FROM [dbo].[DocumentRequest] dr
       JOIN [dbo].[Engagement] e ON e.[id] = dr.[engagementId]
       JOIN [dbo].[User] u ON u.[id] = e.[clientUserId]
       WHERE u.[clerkId] = @clerkId`,
    );
  await pool
    .request()
    .input("clerkId", FIXTURE_CLERK_USER_ID_NEG)
    .query(
      `DELETE e
       FROM [dbo].[Engagement] e
       JOIN [dbo].[User] u ON u.[id] = e.[clientUserId]
       WHERE u.[clerkId] = @clerkId`,
    );

  // 1. Upsert User
  const userId = await upsertUser(FIXTURE_CLERK_USER_ID_NEG, "e2e-compl-neg-001@completion.e2e.test");

  // 2. EngagementRequest
  const requestResult = await pool
    .request()
    .input("firstName", "ComplNeg")
    .input("lastName", "E2E")
    .input("email", `e2e-compl-neg-req-${Date.now()}@completion.e2e.test`)
    .query<{ id: string }>(
      `INSERT INTO [dbo].[EngagementRequest]
         ([firstName], [lastName], [email], [status], [createdAt], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES (@firstName, @lastName, @email, 'accepted', SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET())`,
    );

  const requestId = requestResult.recordset[0]?.id;
  if (!requestId) throw new Error("[onboarding-completion.spec] Failed to seed negative EngagementRequest");

  // 3. Engagement — only letterSignedAt set; NO questionnaire + NO document requests
  const evidenceJson = JSON.stringify({
    provider: "mock",
    ref: "e2e-compl-neg-mock-ref",
    signedAt: new Date().toISOString(),
  });

  const engagementResult = await pool
    .request()
    .input("engagementRequestId", requestId)
    .input("clientUserId", userId)
    .input("status", "New")
    .input("letterSignedAt", new Date())
    .input("letterSignatureEvidence", evidenceJson)
    .input("letterTemplateSnapshot", "E2E neg test letter snapshot")
    .query<{ id: string }>(
      `INSERT INTO [dbo].[Engagement]
         ([engagementRequestId], [clientUserId], [status],
          [letterSignedAt], [letterSignatureEvidence], [letterTemplateSnapshot],
          [createdAt], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES (@engagementRequestId, @clientUserId, @status,
               @letterSignedAt, @letterSignatureEvidence, @letterTemplateSnapshot,
               SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET())`,
    );

  const engagementId = engagementResult.recordset[0]?.id;
  if (!engagementId) throw new Error("[onboarding-completion.spec] Failed to seed negative Engagement");

  // Add a DocumentRequest so allRequiredProvided=false (the upload step is NOT done).
  // Without this, zero requests → vacuously satisfied → data-done="true" (wrong for the negative path).
  // DECISION (TASK-008-004): DocumentRequest has no [required] column (see TASK-007 schema).
  await pool
    .request()
    .input("engagementId", engagementId)
    .input("label", "Required document for negative test")
    .query(
      `INSERT INTO [dbo].[DocumentRequest]
         ([engagementId], [label], [createdAt], [updatedAt])
       VALUES (@engagementId, @label, SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET())`,
    );

  return {
    userId: userId.toLowerCase(),
    requestId: requestId.toLowerCase(),
    engagementId: engagementId.toLowerCase(),
  };
}

async function cleanupNegativeFixture(requestId: string): Promise<void> {
  const pool = await getPool();
  // Delete DocumentRequest rows first (FK child of Engagement)
  await pool.request().input("requestId", requestId).query(
    `DELETE dr
     FROM [dbo].[DocumentRequest] dr
     JOIN [dbo].[Engagement] e ON e.[id] = dr.[engagementId]
     WHERE e.[engagementRequestId] = @requestId`,
  );
  await pool.request().input("requestId", requestId).query(
    `DELETE FROM [dbo].[Engagement] WHERE [engagementRequestId] = @requestId`,
  );
  await pool.request().input("requestId", requestId).query(
    `DELETE FROM [dbo].[EngagementRequest] WHERE [id] = @requestId`,
  );
}

async function cleanupUser(clerkId: string): Promise<void> {
  const pool = await getPool();
  // DECISION (TASK-008-004): Must delete child rows before the User row to avoid FK violation.
  // Engagement.clientUserId is a FK to User.id — delete engagements (and their children) first.
  await pool.request().input("clerkId", clerkId).query(
    `DELETE d
     FROM [dbo].[Document] d
     JOIN [dbo].[Engagement] e ON e.[id] = d.[engagementId]
     JOIN [dbo].[User] u ON u.[id] = e.[clientUserId]
     WHERE u.[clerkId] = @clerkId`,
  );
  await pool.request().input("clerkId", clerkId).query(
    `DELETE dr
     FROM [dbo].[DocumentRequest] dr
     JOIN [dbo].[Engagement] e ON e.[id] = dr.[engagementId]
     JOIN [dbo].[User] u ON u.[id] = e.[clientUserId]
     WHERE u.[clerkId] = @clerkId`,
  );
  await pool.request().input("clerkId", clerkId).query(
    `DELETE qa
     FROM [dbo].[QuestionnaireAnswer] qa
     JOIN [dbo].[Engagement] e ON e.[id] = qa.[engagementId]
     JOIN [dbo].[User] u ON u.[id] = e.[clientUserId]
     WHERE u.[clerkId] = @clerkId`,
  );
  await pool.request().input("clerkId", clerkId).query(
    `DELETE e
     FROM [dbo].[Engagement] e
     JOIN [dbo].[User] u ON u.[id] = e.[clientUserId]
     WHERE u.[clerkId] = @clerkId`,
  );
  await pool
    .request()
    .input("clerkId", clerkId)
    .query(`DELETE FROM [dbo].[User] WHERE [clerkId] = @clerkId`);
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────────

test.beforeAll(async () => {
  await configureAzuriteCors();
});

test.afterAll(async () => {
  await cleanupUser(FIXTURE_CLERK_USER_ID);
  await cleanupUser(FIXTURE_CLERK_USER_ID_NEG);
  await closePool();
});

// ═══════════════════════════════════════════════════════════════════════════════
// AC-ONBD-005-01 — All three steps satisfied → onboarding complete
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("[AC-ONBD-005-01] all three steps satisfied → onboarding marked complete", () => {
  /**
   * Gherkin (EPIC-008 § Acceptance scenarios — verbatim):
   * Given an engagement whose letter is signed, questionnaire submitted, and required documents uploaded
   * When onboarding completion is evaluated
   * Then onboarding is marked complete
   *
   * Strategy: seed letter-signed + questionnaire-submitted; drive the final document upload
   * through the browser (triggering processOnboardingCompletion); observe all steps done.
   */

  let seeded: PositiveSeedResult | null = null;

  test.beforeEach(async ({ page, request: httpRequest }) => {
    seeded = await seedPositiveFixture();
    await setupClientSession(page, httpRequest, FIXTURE_CLERK_USER_ID);
  });

  test.afterEach(async ({ page }) => {
    await clearSession(page);
    if (seeded) {
      await cleanupPositiveFixture(seeded.requestId);
      seeded = null;
    }
  });

  test(
    "[AC-ONBD-005-01] client uploads the final required document → all steps complete (onboarding marked complete)",
    async ({ page }) => {
      if (!seeded) throw new Error("fixture not seeded");

      // Given: engagement with letter signed + questionnaire submitted (from seed)
      // Precondition check: step 1 done, step 2 done, step 3 accessible but not yet done
      await page.goto(`${PORTAL_URL}/onboarding`);

      const letterStep = page.locator('[data-testid="onboarding-step-engagement-letter"]');
      const questionnaireStep = page.locator('[data-testid="onboarding-step-intake-questionnaire"]');
      const uploadStep = page.locator('[data-testid="onboarding-step-document-upload"]');

      await expect(letterStep).toHaveAttribute("data-done", "true", { timeout: 10_000 });
      await expect(questionnaireStep).toHaveAttribute("data-done", "true", { timeout: 10_000 });
      await expect(uploadStep).toHaveAttribute("data-done", "false", { timeout: 10_000 });
      await expect(uploadStep).toHaveAttribute("data-accessible", "true", { timeout: 10_000 });

      // When: the client uploads the required document (final step)
      // Find the upload label for the seeded document request
      const uploadLabelLocator = page.locator(
        `[data-testid="upload-label-${seeded.documentRequestId}"]`,
      );
      await expect(uploadLabelLocator).toBeVisible({ timeout: 10_000 });

      const [fileChooser] = await Promise.all([
        page.waitForEvent("filechooser"),
        uploadLabelLocator.click(),
      ]);
      await fileChooser.setFiles({
        name: "tax-return-completed.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from("[AC-ONBD-005-01] E2E completion test document"),
      });

      // Then: the upload completes, the checklist item is fulfilled
      const checklistItem = page.locator(
        `[data-testid="checklist-item-${seeded.documentRequestId}"]`,
      );
      await expect(checklistItem).toHaveAttribute("data-status", "fulfilled", { timeout: 30_000 });

      // Then: revalidatePath causes re-render; wait for the satisfied state on document-upload step
      await expect(uploadStep).toHaveAttribute("data-done", "true", { timeout: 30_000 });

      // Then: all steps are done → onboarding is complete
      // (AC-ONBD-005-01: complete only when ALL three steps are satisfied)
      await expect(letterStep).toHaveAttribute("data-done", "true");
      await expect(questionnaireStep).toHaveAttribute("data-done", "true");

      // Then: position indicator shows 0 remaining
      const positionEl = page.locator('[data-testid="onboarding-position"]');
      await expect(positionEl).toHaveAttribute("data-remaining", "0", { timeout: 15_000 });
      await expect(positionEl).toContainText("all steps complete");
    },
  );
});

// ═══════════════════════════════════════════════════════════════════════════════
// AC-ONBD-005-02 — Any unsatisfied step → onboarding NOT complete
// AC-ONBD-006-03 — Incomplete onboarding → engagement stays New (negative path)
// ═══════════════════════════════════════════════════════════════════════════════

test.describe(
  "[AC-ONBD-005-02] [AC-ONBD-006-03] any unsatisfied step → onboarding not complete / stays New",
  () => {
    /**
     * Gherkin (EPIC-008 § Acceptance scenarios — verbatim):
     *
     *   AC-ONBD-005-02:
     *   "Given an engagement with at least one of the three onboarding steps unsatisfied
     *    When onboarding completion is evaluated
     *    Then onboarding is not complete"
     *
     *   AC-ONBD-006-03:
     *   "Given an engagement whose onboarding is not yet complete
     *    When its status is examined
     *    Then it remains in New and has not transitioned"
     *
     * Strategy: seed with only letterSignedAt set (questionnaire + document-upload not satisfied).
     * Observable:
     *   - Portal page shows questionnaire step data-done="false" (step 2 not satisfied)
     *   - Portal page shows document-upload step data-done="false" (step 3 not satisfied)
     *   - data-remaining > 0 (onboarding not complete)
     *   - DB engagement status is still "New" (no transition fired)
     */

    let seeded: NegativeSeedResult | null = null;

    test.beforeEach(async ({ page, request: httpRequest }) => {
      seeded = await seedNegativeFixture();
      await setupClientSession(page, httpRequest, FIXTURE_CLERK_USER_ID_NEG);
    });

    test.afterEach(async ({ page }) => {
      await clearSession(page);
      if (seeded) {
        await cleanupNegativeFixture(seeded.requestId);
        seeded = null;
      }
    });

    test(
      "[AC-ONBD-005-02] [AC-ONBD-006-03] incomplete onboarding: questionnaire + upload not done → not complete; engagement stays New",
      async ({ page }) => {
        if (!seeded) throw new Error("fixture not seeded");

        // Given: engagement with only letterSignedAt set (questionnaire + doc-upload unsatisfied)
        await page.goto(`${PORTAL_URL}/onboarding`);

        // When: onboarding page renders (completion evaluated)
        const letterStep = page.locator('[data-testid="onboarding-step-engagement-letter"]');
        const questionnaireStep = page.locator('[data-testid="onboarding-step-intake-questionnaire"]');
        const uploadStep = page.locator('[data-testid="onboarding-step-document-upload"]');

        // Then: letter is done (seeded)
        await expect(letterStep).toHaveAttribute("data-done", "true", { timeout: 10_000 });

        // Then: questionnaire is NOT done (AC-ONBD-005-02: at least one step unsatisfied)
        await expect(questionnaireStep).toHaveAttribute("data-done", "false", { timeout: 10_000 });

        // Then: document-upload is NOT done
        await expect(uploadStep).toHaveAttribute("data-done", "false", { timeout: 10_000 });

        // Then: onboarding is NOT complete (remaining > 0)
        const positionEl = page.locator('[data-testid="onboarding-position"]');
        const remaining = await positionEl.getAttribute("data-remaining", { timeout: 10_000 });
        expect(Number(remaining)).toBeGreaterThan(0);

        // Then: portal page does NOT show "all steps complete" text
        await expect(positionEl).not.toContainText("all steps complete");

        // Then (AC-ONBD-006-03): engagement stays New — verify directly in DB
        const pool = await getPool();
        const statusRow = await pool
          .request()
          .input("engagementId", seeded.engagementId)
          .query<{ status: string }>(
            `SELECT [status] FROM [dbo].[Engagement] WHERE [id] = @engagementId`,
          );
        const dbStatus = statusRow.recordset[0]?.status;
        expect(dbStatus).toBe("New");

        // Then (AC-ONBD-005-02 + AC-ONBD-006-03): no Notification of type 'onboarding_completed'
        // was created for this engagement (no completion event fired)
        const notifRow = await pool
          .request()
          .input("requestId", seeded.requestId)
          .query<{ id: string }>(
            `SELECT n.[id]
             FROM [dbo].[Notification] n
             JOIN [dbo].[Engagement] e ON e.[engagementRequestId] = @requestId
             WHERE n.[engagementRequestId] = @requestId
               AND n.[type] = 'onboarding_completed'`,
          );
        expect(notifRow.recordset.length).toBe(0);
      },
    );
  },
);
