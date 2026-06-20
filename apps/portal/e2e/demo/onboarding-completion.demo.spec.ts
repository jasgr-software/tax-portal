/**
 * apps/portal/e2e/demo/onboarding-completion.demo.spec.ts
 *
 * @demo UI demo walkthrough — EPIC-008 Onboarding-completion capstone (portal surface).
 *
 * Not part of the e2e gate: `e2e:run` / `e2e:smoke` exclude `@demo` (--grep-invert @demo);
 * this runs ONLY via `pnpm --filter portal e2e:demo`. It drives sarah-returning-client's
 * view of the onboarding state immediately before/after completion against the live
 * docker-compose container stack (AUTH_PROVIDER=mock) and writes an AC-tagged screenshot
 * gallery to docs/demos/EPIC-008/. NON-GATING.
 *
 * Persona: sarah-returning-client (.planning/personas/sarah-returning-client.md)
 * Flows:   flow-onboarding (.planning/flows/flow-onboarding.md)
 * Policy:  .orchestration/DEMO-POLICY.md
 *
 * Gallery ordering (EPIC-008 portal surface — screenshot 03):
 *   03-AC-ONBD-005-01-portal-onboarding-state.png
 *       — sarah-returning-client's onboarding page showing steps 1+2 done (letter signed,
 *         questionnaire submitted) and step 3 accessible (document upload ready).
 *         This is the pre-completion portal state: the final upload triggers
 *         processOnboardingCompletion (AC-ONBD-005-01), which the environment cannot fully
 *         demonstrate due to BUG-008-001 (see KNOWN BLOCKER below).
 *
 * KNOWN BLOCKER — BUG-008-001:
 *   The ADR-009 two-phase upload pipeline cannot complete end-to-end in this local env because
 *   the Azurite SAS URL is signed against the container-internal address and is unreachable
 *   from the host Playwright browser. As a result:
 *     - The document-upload step cannot reach data-status="fulfilled" via the browser.
 *     - The portal "all steps complete" state (data-remaining="0", all data-done="true")
 *       cannot be reached by driving the upload through the UI.
 *   This is a pre-existing EPIC-007 infra defect (BUG-008-001), NOT a BRIEF-008 regression.
 *   The acceptance criterion AC-ONBD-005-01 is proved at the tier-3 integration layer
 *   (onboarding-completion.test.ts — processOnboardingCompletion unit tests).
 *   See .implementation/tasks/BUG-008-001-azurite-sas-url-host-unreachable-from-playwright-browser.md.
 *   The gallery screenshot (03-AC-ONBD-005-01) shows the pre-completion state: steps 1+2
 *   done, step 3 accessible and ready. This is the highest-fidelity portal state capturable
 *   in this environment. The all-steps-done positive completion screen is noted as a gap
 *   in docs/demos/EPIC-008/DEMO.md.
 *
 * Each test ASSERTS the target element is visible BEFORE screenshotting (broken UI fails loudly).
 *
 * Pre-reqs (same SUT as the e2e gate):
 *   docker compose up -d → pnpm db:migrate → pnpm db:seed
 *
 * Fixture:
 *   // DECISION (TASK-008-005): We seed a client User + Engagement with letter signed +
 *   // questionnaire submitted (pre-completion). The QuestionnaireTemplate + QuestionnaireAnswer
 *   // are also seeded (required for the questionnaire step to show as done). A DocumentRequest
 *   // is seeded so the document-upload step is accessible (EPIC-007 gate: without a DocumentRequest
 *   // the step may show an "awaiting" state). This mirrors the positive-path fixture from
 *   // onboarding-completion.spec.ts (TASK-008-004 gate).
 *   //
 *   // clerkId: "user_client_e2e_demo_008_portal" — distinct from:
 *   //   "user_client_e2e_demo_008"  (admin demo spec in this epic)
 *   //   "user_client_e2e_compl_001" (onboarding-completion.spec.ts gate)
 *   //   "user_client_e2e_demo_007"  (document-upload.demo.spec.ts EPIC-007)
 *
 * ADR-005: Sessions are established via /api/mock-session (role set server-side). RLS
 *          policy is NOT relaxed; admin pool used for seed/teardown only.
 * ADR-006: Two-surface platform — this spec covers the portal surface (Client Portal).
 * ADR-009: Signed-URL upload; cannot complete from host browser (BUG-008-001).
 * ADR-012: Tier-6 e2e.
 * EPIC-008: completion capstone.
 *
 * Run:
 *   pnpm --filter portal e2e:demo
 */

import { test, expect } from "@playwright/test";
import path from "path";
import mssqlPkg from "mssql";
import { setupClientSession, clearSession } from "../fixtures/auth.js";

const { ConnectionPool } = mssqlPkg;

// Gallery output dir — repo-root/docs/demos/EPIC-008 (resolved from this file's dir).
// Depth from apps/portal/e2e/demo/ to repo root = ../../../../
// RETRO-006 item 4 / RETRO-007 obs 5 (MANDATORY): screenshots MUST write ONLY to docs/demos/EPIC-008/.
// This const is the ONLY path used; no prior-epic gallery is touched.
const DEMO_DIR = path.resolve(__dirname, "../../../../docs/demos/EPIC-008");
const shot = (file: string) => path.join(DEMO_DIR, file);

const PORTAL_URL = process.env["PORTAL_BASE_URL"] ?? "http://localhost:3000";

// Distinct clerkId suffix "-demo-008-portal" — avoids collision with all other suites.
const FIXTURE_CLERK_USER_ID = "user_client_e2e_demo_008_portal";

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

interface PortalDemoSeedResult {
  userId: string;
  requestId: string;
  engagementId: string;
  documentRequestId: string;
}

/**
 * Seeds the portal completion demo fixture.
 *
 * Seeds a pre-completion engagement:
 *   - letter signed (letterSignedAt set)
 *   - questionnaire submitted (questionnaireSubmittedAt + QuestionnaireAnswer row)
 *   - one DocumentRequest (to make the document-upload step accessible)
 *   - status="New" (not yet transitioned — upload pending)
 *
 * This is the state sarah-returning-client would see immediately before her final upload
 * triggers processOnboardingCompletion. The document-upload step is accessible (step 3),
 * steps 1+2 show as done. This is the highest-fidelity portal state the environment
 * supports (BUG-008-001 prevents driving the upload to completion via the browser).
 */
async function seedPortalDemoFixture(): Promise<PortalDemoSeedResult> {
  const pool = await getPool();

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
    .input("email", "e2e-demo-008-portal@onboarding-completion.demo.e2e.test")
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

  // 2. Get first active service for the questionnaire template
  const serviceRow = await pool
    .request()
    .query<{ id: string }>(
      `SELECT TOP 1 [id] FROM [dbo].[Service] WHERE [active] = 1 ORDER BY [sortOrder] ASC`,
    );
  const serviceId = serviceRow.recordset[0]?.id;
  if (!serviceId) throw new Error("[onboarding-completion.demo.spec] No active service found for fixture");

  // 3. Upsert QuestionnaireTemplate for the service (idempotent via MERGE)
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
    if (!templateId) throw new Error("[onboarding-completion.demo.spec] Failed to upsert QuestionnaireTemplate");
  }

  // 4. EngagementRequest
  const requestResult = await pool
    .request()
    .input("firstName", "DemoSarah")
    .input("lastName", "Completion")
    .input("email", `e2e-demo-008-portal-req-${Date.now()}@onboarding-completion.demo.e2e.test`)
    .query<{ id: string }>(
      `INSERT INTO [dbo].[EngagementRequest]
         ([firstName], [lastName], [email], [status], [createdAt], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES (@firstName, @lastName, @email, 'accepted', SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET())`,
    );

  const requestId = requestResult.recordset[0]?.id;
  if (!requestId) throw new Error("[onboarding-completion.demo.spec] Failed to seed EngagementRequest");

  // 4a. Link request to service
  await pool
    .request()
    .input("engagementRequestId", requestId)
    .input("serviceId", serviceId)
    .query(
      `INSERT INTO [dbo].[EngagementRequestService] ([engagementRequestId], [serviceId])
       VALUES (@engagementRequestId, @serviceId)`,
    );

  // 5. Engagement — letter signed + questionnaire submitted, status=New (pre-completion)
  const evidenceJson = JSON.stringify({
    provider: "mock",
    ref: "e2e-demo-008-portal-mock-ref",
    signedAt: new Date().toISOString(),
  });

  const engagementResult = await pool
    .request()
    .input("engagementRequestId", requestId)
    .input("clientUserId", userId)
    .input("status", "New")
    .input("letterSignedAt", new Date())
    .input("letterSignatureEvidence", evidenceJson)
    .input("letterTemplateSnapshot", "E2E demo-008 portal letter snapshot")
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

  // 6. QuestionnaireAnswer (marks questionnaire step as satisfied in read model)
  const answersJson = JSON.stringify({ q1: "E2E demo-008 portal answer" });
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

  // 7. DocumentRequest — makes document-upload step accessible (EPIC-007)
  const docRequestResult = await pool
    .request()
    .input("engagementId", engagementId)
    .input("label", "2023 Tax Return (E2E demo-008 portal)")
    .query<{ id: string }>(
      `INSERT INTO [dbo].[DocumentRequest]
         ([engagementId], [label], [createdAt], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES (@engagementId, @label, SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET())`,
    );

  const documentRequestId = docRequestResult.recordset[0]?.id;
  if (!documentRequestId) throw new Error("[onboarding-completion.demo.spec] Failed to seed DocumentRequest");

  return {
    userId: userId.toLowerCase(),
    requestId: requestId.toLowerCase(),
    engagementId: engagementId.toLowerCase(),
    documentRequestId: documentRequestId.toLowerCase(),
  };
}

async function cleanupPortalDemoFixture(requestId: string): Promise<void> {
  const pool = await getPool();

  // Delete in reverse FK order
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
    `DELETE FROM [dbo].[Engagement] WHERE [engagementRequestId] = @requestId`,
  );
  await pool.request().input("requestId", requestId).query(
    `DELETE FROM [dbo].[EngagementRequest] WHERE [id] = @requestId`,
  );
}

async function cleanupPortalDemoUser(): Promise<void> {
  const pool = await getPool();
  await pool
    .request()
    .input("clerkId", FIXTURE_CLERK_USER_ID)
    .query(`DELETE FROM [dbo].[User] WHERE [clerkId] = @clerkId`);
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

test.afterAll(async () => {
  await cleanupPortalDemoUser();
  await closePool();
});

// ─── Screen 03: Portal onboarding state — steps 1+2 done, step 3 accessible (AC-ONBD-005-01) ──

test(
  "[AC-ONBD-005-01] @demo 03 — sarah-returning-client: portal shows steps 1+2 done, step 3 (document upload) accessible — pre-completion state",
  async ({ page, request }) => {
    // Screen 03: sarah-returning-client's onboarding page showing steps 1+2 done (letter
    // signed, questionnaire submitted) and step 3 accessible (document upload ready).
    //
    // This is the pre-completion portal state: the final upload triggers
    // processOnboardingCompletion (AC-ONBD-005-01), which transitions the engagement to
    // "In Progress" and emits the onboarding_completed notification.
    //
    // Note on BUG-008-001: The portal positive completion screen (all-steps-done,
    // data-remaining="0") is NOT capturable in this environment because the Azurite
    // SAS URL is unreachable from the host Playwright browser (see BUG-008-001). The
    // completion observable is proved at the tier-3 integration layer. This screenshot
    // shows the highest-fidelity portal state the environment supports.
    //
    // Proves (partially):
    //   AC-ONBD-005-01: steps 1+2 are satisfied (done badges present); step 3 is the
    //   final trigger — once uploaded, processOnboardingCompletion fires.
    //   The all-steps-done state (data-remaining="0") is documented as a BUG-008-001 gap.
    //
    // Screenshot: full-page onboarding page showing:
    //   - done-badge-engagement-letter (step 1 complete)
    //   - done-badge-intake-questionnaire (step 2 complete)
    //   - onboarding-step-document-upload with data-accessible="true" (step 3 accessible)
    //   - document-upload-active interface visible (upload widget ready)

    let seeded: PortalDemoSeedResult | null = null;

    try {
      seeded = await seedPortalDemoFixture();
      await setupClientSession(page, request, FIXTURE_CLERK_USER_ID);

      // Navigate to onboarding
      await page.goto(`${PORTAL_URL}/onboarding`);

      // Assert: step 1 (engagement-letter) is done
      const letterDoneBadge = page.locator('[data-testid="done-badge-engagement-letter"]');
      await expect(
        letterDoneBadge,
        "done-badge-engagement-letter must be visible (letter step complete)",
      ).toBeVisible({ timeout: 15_000 });

      // Assert: step 2 (intake-questionnaire) is done
      const questionnaireDoneBadge = page.locator('[data-testid="done-badge-intake-questionnaire"]');
      await expect(
        questionnaireDoneBadge,
        "done-badge-intake-questionnaire must be visible (questionnaire step complete)",
      ).toBeVisible({ timeout: 10_000 });

      // Assert: step 3 (document-upload) is accessible (ready for the client)
      const documentUploadStep = page.locator('[data-testid="onboarding-step-document-upload"]');
      await expect(
        documentUploadStep,
        "onboarding-step-document-upload must be visible",
      ).toBeVisible({ timeout: 10_000 });
      await expect(
        documentUploadStep,
        "onboarding-step-document-upload must have data-accessible='true' (AC-ONBD-005-01 — step 3 gate open)",
      ).toHaveAttribute("data-accessible", "true", { timeout: 10_000 });

      // Assert: document-upload-active interface is visible (upload widget ready)
      const uploadActive = page.locator('[data-testid="document-upload-active"]');
      await expect(
        uploadActive,
        "document-upload-active must be visible (upload widget ready for the client)",
      ).toBeVisible({ timeout: 10_000 });

      // Screenshot 03: portal showing steps 1+2 done, step 3 accessible (pre-completion state)
      // BUG-008-001 gap: all-steps-done (data-remaining="0") not capturable in this env.
      await page.screenshot({
        path: shot("03-AC-ONBD-005-01-portal-onboarding-state.png"),
        fullPage: true,
      });
    } finally {
      await clearSession(page);
      if (seeded) await cleanupPortalDemoFixture(seeded.requestId);
    }
  },
);
