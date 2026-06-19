/**
 * apps/portal/e2e/demo/document-upload.demo.spec.ts
 *
 * @demo UI demo walkthrough — EPIC-007 Client document-upload step (portal surface).
 *
 * Not part of the e2e gate: `e2e:run` / `e2e:smoke` exclude `@demo` (--grep-invert @demo);
 * this runs ONLY via `pnpm --filter portal e2e:demo`. It drives sarah-returning-client's
 * document-upload happy-path (post-letter-gate) against the live docker-compose container
 * stack (AUTH_PROVIDER=mock, ESIGN_PROVIDER=mock, ALLOW_MOCK_ESIGN=true,
 * MALWARE_SCAN_PROVIDER=mock) and writes an AC-tagged screenshot gallery to
 * docs/demos/EPIC-007/. NON-GATING.
 *
 * Persona: sarah-returning-client (.planning/personas/sarah-returning-client.md)
 * Flows:   flow-onboarding    (.planning/flows/flow-onboarding.md)
 *          flow-file-exchange (.planning/flows/flow-file-exchange.md)
 * Policy:  .orchestration/DEMO-POLICY.md
 *
 * Gallery ordering (EPIC-007 portal surface — screenshots 02–05):
 *   02-AC-ONBD-004-01-02-03-document-checklist.png
 *       — post-letter-gate client sees the document checklist with outstanding items;
 *         outstanding vs. provided items are distinguished (AC-ONBD-004-01/-02/-03)
 *   03-AC-ONBD-004-03-item-fulfilled.png
 *       — after a clean file upload the checklist item transitions to fulfilled
 *         (AC-ONBD-004-03)
 *   04-AC-NFR-009-02-malicious-rejected.png
 *       — EICAR-like file upload triggers mock scanner; rejection message appears
 *         and the item remains outstanding (AC-NFR-009-02)
 *
 * Each test ASSERTS the target element is visible BEFORE screenshotting (broken UI fails loudly).
 *
 * Pre-reqs (same SUT as the e2e gate):
 *   docker compose up -d → pnpm db:migrate → pnpm db:seed
 *
 * Fixture:
 *   // DECISION (TASK-007-007): deterministic clerkUserId "user_client_e2e_demo_007"
 *   // (distinct from all other suites — avoids session interference with
 *   // "user_client_e2e_upload_001" (document-upload.spec.ts),
 *   // "user_client_e2e_demo_006" (questionnaire.demo.spec.ts),
 *   // "user_client_e2e_demo_005" (EPIC-005 demo), etc.)
 *   // The letter-sign gate is driven by the test itself (driveLetterSignGate) using the
 *   // EPIC-005/006 precedent (ESIGN_PROVIDER=mock + ALLOW_MOCK_ESIGN=true).
 *   // The engagement is seeded with letterSignedAt=NULL; the test drives sign through the UI.
 *   // A DocumentRequest is seeded directly (admin pool) to provide the checklist item.
 *
 * ADR-005: Sessions are established via /api/mock-session (role set server-side). RLS
 *          policy is NOT relaxed; admin pool used for seed/teardown only.
 * ADR-006: Two-surface platform — this spec covers the portal surface (Client Portal).
 * ADR-009: Signed-URL upload; client PUTs directly to Azurite (CORS configured by fixture).
 * ADR-021: Malware scan gate; mock scanner returns configured outcome.
 * ADR-023/024: E-sign goes through ESignatureProvider PORT (ESIGN_PROVIDER=mock).
 *
 * Run:
 *   pnpm --filter portal e2e:demo
 */

import { test, expect } from "@playwright/test";
import path from "path";
import mssqlPkg from "mssql";
import { setupClientSession, clearSession } from "../fixtures/auth.js";
import { configureAzuriteCors } from "../fixtures/azurite-cors.js";

const { ConnectionPool } = mssqlPkg;

// Gallery output dir — repo-root/docs/demos/EPIC-007 (resolved from this file's dir).
// Depth from apps/portal/e2e/demo/ to repo root = ../../../../
// RETRO-006 item 4 (MANDATORY): screenshots MUST write ONLY to docs/demos/EPIC-007/.
// This const is the ONLY path used; no prior-epic gallery is touched.
const DEMO_DIR = path.resolve(__dirname, "../../../../docs/demos/EPIC-007");
const shot = (file: string) => path.join(DEMO_DIR, file);

const PORTAL_URL = process.env["PORTAL_BASE_URL"] ?? "http://localhost:3000";

// ─── Deterministic fixture ids ─────────────────────────────────────────────────
// DECISION (TASK-007-007): Use a deterministic, demo-only clerkUserId.
// The "-demo-007" suffix distinguishes this fixture from all other suites.
const FIXTURE_CLERK_USER_ID = "user_client_e2e_demo_007";

// Unique document request label — authored in this run; proves the CORRECT checklist is shown.
const FIXTURE_DOC_REQUEST_LABEL = `[AC-FILE-007-01] Demo-007 upload checklist item — ${Date.now()}`;

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
      "[document-upload.demo.spec] DATABASE_URL_ADMIN is not set. Required for admin pool seed/teardown.",
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
  documentRequestId: string;
}

/**
 * Seeds the document-upload demo fixture.
 *
 * The Engagement is seeded with letterSignedAt=NULL so the test can drive the letter-sign
 * gate through the UI (EPIC-005 precedent — driveLetterSignGate helper below).
 *
 *   1. User (fixture clerk id, CLIENT role) — via MERGE (idempotent)
 *   2. EngagementRequest (accepted)
 *   3. Engagement (letterSignedAt=NULL — unsigned, gate closed)
 *   4. DocumentRequest (the accountant-authored checklist item)
 *
 * Cleanup: call cleanupFixture() in try/finally.
 */
async function seedDocumentUploadDemoFixture(): Promise<SeedResult> {
  const pool = await getPool();

  // ── 0. Pre-seed cleanup (idempotent) ──────────────────────────────────────
  // Ensures stale data from previous failed runs is cleared before seeding.
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
      `DELETE e
       FROM [dbo].[Engagement] e
       JOIN [dbo].[User] u ON u.[id] = e.[clientUserId]
       WHERE u.[clerkId] = @clerkId`,
    );

  // ── 1. Upsert User ─────────────────────────────────────────────────────────
  const userResult = await pool
    .request()
    .input("clerkId", FIXTURE_CLERK_USER_ID)
    .input("email", "e2e-demo-007@document-upload.demo.e2e.test")
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
    if (!userId) throw new Error("[document-upload.demo.spec] Failed to upsert/find User fixture row");
  }

  // ── 2. Seed EngagementRequest ──────────────────────────────────────────────
  const requestResult = await pool
    .request()
    .input("firstName", "DemoSarah")
    .input("lastName", "DocumentUpload")
    .input("email", `e2e-demo-007-upload-req-${Date.now()}@document-upload.demo.e2e.test`)
    .query<{ id: string }>(
      `INSERT INTO [dbo].[EngagementRequest]
         ([firstName], [lastName], [email], [status], [createdAt], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES (@firstName, @lastName, @email, 'accepted', SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET())`,
    );

  const requestId = requestResult.recordset[0]?.id;
  if (!requestId) throw new Error("[document-upload.demo.spec] Failed to seed EngagementRequest row");

  // ── 3. Seed Engagement — letterSignedAt=NULL (unsigned, letter gate closed) ─
  // The driveLetterSignGate helper will sign it through the UI.
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
  if (!engagementId) throw new Error("[document-upload.demo.spec] Failed to seed Engagement row");

  // ── 4. Seed DocumentRequest (the accountant-authored checklist item) ─────────
  const docRequestResult = await pool
    .request()
    .input("engagementId", engagementId)
    .input("label", FIXTURE_DOC_REQUEST_LABEL)
    .input("createdBy", "accountant_e2e_demo_007")
    .query<{ id: string }>(
      `INSERT INTO [dbo].[DocumentRequest]
         ([engagementId], [label], [createdBy], [createdAt], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES (@engagementId, @label, @createdBy, SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET())`,
    );

  const documentRequestId = docRequestResult.recordset[0]?.id;
  if (!documentRequestId) throw new Error("[document-upload.demo.spec] Failed to seed DocumentRequest row");

  // DECISION (TASK-007-007): Lowercase all IDs — SQL Server mssql returns uppercase GUIDs,
  // but Prisma lowercases them; component uses Prisma-returned IDs for data-testid attributes.
  return {
    userId: userId.toLowerCase(),
    requestId: requestId.toLowerCase(),
    engagementId: engagementId.toLowerCase(),
    documentRequestId: documentRequestId.toLowerCase(),
  };
}

/**
 * Clean up seeded rows in reverse FK order.
 * Called in try/finally to ensure cleanup even on test failure.
 */
async function cleanupFixture(requestId: string): Promise<void> {
  const pool = await getPool();

  // 1. Document rows (FK → Engagement + DocumentRequest)
  await pool
    .request()
    .input("requestId", requestId)
    .query(
      `DELETE d
       FROM [dbo].[Document] d
       JOIN [dbo].[Engagement] e ON e.[id] = d.[engagementId]
       WHERE e.[engagementRequestId] = @requestId`,
    );

  // 2. DocumentRequest rows (FK → Engagement)
  await pool
    .request()
    .input("requestId", requestId)
    .query(
      `DELETE dr
       FROM [dbo].[DocumentRequest] dr
       JOIN [dbo].[Engagement] e ON e.[id] = dr.[engagementId]
       WHERE e.[engagementRequestId] = @requestId`,
    );

  // 3. Engagement
  await pool
    .request()
    .input("requestId", requestId)
    .query(`DELETE FROM [dbo].[Engagement] WHERE [engagementRequestId] = @requestId`);

  // 4. EngagementRequest
  await pool
    .request()
    .input("requestId", requestId)
    .query(`DELETE FROM [dbo].[EngagementRequest] WHERE [id] = @requestId`);
}

async function cleanupFixtureUser(): Promise<void> {
  const pool = await getPool();
  await pool
    .request()
    .input("clerkId", FIXTURE_CLERK_USER_ID)
    .query(`DELETE FROM [dbo].[User] WHERE [clerkId] = @clerkId`);
}

// ─── Lifecycle hooks ───────────────────────────────────────────────────────────

// Configure Azurite CORS once per run so the browser can PUT directly to Azurite.
// Mirrors document-upload.spec.ts configureAzuriteCors pattern (TASK-007-006).
test.beforeAll(async () => {
  await configureAzuriteCors();
});

// afterAll: clean up demo user and close pool
test.afterAll(async () => {
  await cleanupFixtureUser();
  await closePool();
});

// ─── Helper: drive the EPIC-005 letter-sign gate ──────────────────────────────
//
// The document-upload step only unlocks after the engagement letter is signed.
// This helper drives the full letter-sign path through the UI.
// Reuses the EPIC-005 mock-e-sign pattern (ESIGN_PROVIDER=mock + ALLOW_MOCK_ESIGN=true).
// Mirrors driveLetterSignGate from apps/portal/e2e/demo/questionnaire.demo.spec.ts.

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

  // The document-upload step must now be accessible after letter-sign
  // (EPIC-007 adds step 3 which unlocks after the letter gate)
  await expect(
    page.locator('[data-testid="onboarding-step-document-upload"]'),
    "document-upload step must be accessible after letter-sign",
  ).toHaveAttribute("data-accessible", "true", { timeout: 15_000 });
}

// ─── Screen 02: Client sees the document checklist (AC-ONBD-004-01/-02/-03) ───

test(
  "[AC-ONBD-004-01] [AC-ONBD-004-02] @demo 02 — post-letter-gate client: document checklist shown with outstanding item",
  async ({ page, request }) => {
    // Screen 02: sarah-returning-client signs the letter gate and then the document-upload
    // step unlocks. She sees the document checklist with the accountant-authored label.
    // The item is shown with 'Outstanding' status — distinguishing outstanding from provided.
    //
    // Proves:
    //   AC-ONBD-004-01: client is shown the document checklist for their engagement.
    //   AC-ONBD-004-02: outstanding vs. provided items are distinguished (Outstanding badge).
    //   AC-ONBD-004-03: (the upload interface is visible — ready for the client to upload).
    //
    // Screenshot: full-page onboarding page with the document-upload step active,
    // showing the checklist with the Outstanding badge on the seeded request.

    let seeded: SeedResult | null = null;

    try {
      seeded = await seedDocumentUploadDemoFixture();
      await setupClientSession(page, request, FIXTURE_CLERK_USER_ID);

      // Drive through the EPIC-005 letter-sign gate
      await driveLetterSignGate(page);

      // The document-upload active interface must be visible
      const uploadActive = page.locator('[data-testid="document-upload-active"]');
      await expect(
        uploadActive,
        "document-upload-active must be visible after letter-sign (AC-ONBD-004-01)",
      ).toBeVisible({ timeout: 10_000 });

      // The checklist must show the accountant-authored label
      const checklistLabel = page.locator('[data-testid^="checklist-label-"]');
      await expect(
        checklistLabel.first(),
        "Checklist must show the accountant-authored label (AC-ONBD-004-01)",
      ).toContainText(FIXTURE_DOC_REQUEST_LABEL, { timeout: 10_000 });

      // The item status must be Outstanding (AC-ONBD-004-02 — outstanding vs. provided)
      const statusBadge = page.locator(
        `[data-testid="checklist-status-${seeded.documentRequestId}"]`,
      );
      await expect(
        statusBadge,
        "Checklist item must show 'Outstanding' badge before upload (AC-ONBD-004-02)",
      ).toContainText("Outstanding", { timeout: 10_000 });

      // Screenshot 02: checklist with Outstanding item visible
      await page.screenshot({
        path: shot("02-AC-ONBD-004-01-02-03-document-checklist.png"),
        fullPage: true,
      });
    } finally {
      await clearSession(page);
      if (seeded) await cleanupFixture(seeded.requestId);
    }
  },
);

// ─── Screen 03: Upload to fulfill a checklist item (AC-ONBD-004-03) ─────────

test(
  "[AC-ONBD-004-03] @demo 03 — post-letter-gate client: uploads a clean file; item transitions to fulfilled",
  async ({ page, request }) => {
    // Screen 03: sarah-returning-client uploads a clean PDF file against the outstanding
    // checklist item. After the upload pipeline completes (authorize → PUT → complete),
    // the item transitions from Outstanding to Fulfilled.
    //
    // Proves AC-ONBD-004-03: the client can upload a document to fulfill a checklist item.
    //
    // Screenshot: full-page onboarding page after upload — checklist item shows
    // data-status="fulfilled" (or the satisfied state when all items are provided).
    //
    // DECISION (TASK-007-007): Use filechooser pattern (label.click + waitForEvent) rather
    // than setInputFiles directly on the hidden input — same pattern as document-upload.spec.ts.
    // The <input type="file"> is sr-only inside a <label>; clicking the label fires React's
    // synthetic onChange handler reliably.

    let seeded: SeedResult | null = null;

    try {
      seeded = await seedDocumentUploadDemoFixture();
      await setupClientSession(page, request, FIXTURE_CLERK_USER_ID);

      // Drive through the letter-sign gate
      await driveLetterSignGate(page);

      // The upload interface must be active
      const uploadActive = page.locator('[data-testid="document-upload-active"]');
      await expect(
        uploadActive,
        "document-upload-active must be visible (AC-ONBD-004-03)",
      ).toBeVisible({ timeout: 10_000 });

      // The upload label for the outstanding item must be visible
      const uploadLabel = page.locator(
        `[data-testid="upload-label-${seeded.documentRequestId}"]`,
      );
      await expect(
        uploadLabel,
        "upload-label for the checklist item must be visible (AC-ONBD-004-03)",
      ).toBeVisible({ timeout: 10_000 });

      // When: the client uploads a clean file (not EICAR — mock scanner passes it)
      const [fileChooser] = await Promise.all([
        page.waitForEvent("filechooser"),
        uploadLabel.click(),
      ]);
      await fileChooser.setFiles({
        name: "2023-w2-form.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from("Demo EPIC-007 clean document for AC-ONBD-004-03 walkthrough"),
      });

      // Then: the checklist item transitions to fulfilled (data-status="fulfilled")
      // The mock scanner returns 'clean' for this file, completing the upload pipeline.
      const checklistItem = page.locator(
        `[data-testid="checklist-item-${seeded.documentRequestId}"]`,
      );
      await expect(
        checklistItem,
        "Checklist item must have data-status='fulfilled' after clean upload (AC-ONBD-004-03)",
      ).toHaveAttribute("data-status", "fulfilled", { timeout: 30_000 });

      // Screenshot 03: fulfilled checklist item
      await page.screenshot({
        path: shot("03-AC-ONBD-004-03-item-fulfilled.png"),
        fullPage: true,
      });
    } finally {
      await clearSession(page);
      if (seeded) await cleanupFixture(seeded.requestId);
    }
  },
);

// ─── Screen 04: Malicious file rejected (AC-NFR-009-02) ──────────────────────

test(
  "[AC-NFR-009-02] @demo 04 — post-letter-gate client: malicious upload rejected; item remains outstanding",
  async ({ page, request }) => {
    // Screen 04: sarah-returning-client uploads a file with EICAR test content.
    // The mock malware scanner recognizes the EICAR pattern and returns 'infected'.
    // The file is withheld; the rejection message appears; the item stays Outstanding.
    //
    // Proves AC-NFR-009-02: a file found malicious is withheld from recipients and
    // the uploader is informed it was rejected.
    //
    // Screenshot: full-page onboarding page showing the rejection message and the
    // checklist item still Outstanding.
    //
    // DECISION (TASK-007-007): The same EICAR test string pattern used in
    // document-upload.spec.ts (TASK-007-006) triggers the mock scanner. The file name
    // contains "eicar" to trigger the mock scanner key-based check.
    // If MALWARE_SCAN_PROVIDER is not "mock", this test skips (non-gating).

    const scanMode = process.env["MALWARE_SCAN_PROVIDER"] ?? "mock";
    if (scanMode !== "mock") {
      // Non-gating: skip gracefully if the mock scanner isn't configured.
      // The rejection behavior is verified in document-upload.spec.ts and the
      // component test (document-upload-step.test.tsx).
      test.skip();
      return;
    }

    let seeded: SeedResult | null = null;

    try {
      seeded = await seedDocumentUploadDemoFixture();
      await setupClientSession(page, request, FIXTURE_CLERK_USER_ID);

      // Drive through the letter-sign gate
      await driveLetterSignGate(page);

      // The upload interface must be active
      const uploadActive = page.locator('[data-testid="document-upload-active"]');
      await expect(
        uploadActive,
        "document-upload-active must be visible (AC-NFR-009-02)",
      ).toBeVisible({ timeout: 10_000 });

      const uploadLabel = page.locator(
        `[data-testid="upload-label-${seeded.documentRequestId}"]`,
      );
      await expect(
        uploadLabel,
        "upload-label must be visible (AC-NFR-009-02)",
      ).toBeVisible({ timeout: 10_000 });

      // When: the client uploads a file with EICAR test content
      // The mock scanner recognizes the EICAR string and returns outcome='infected'.
      const eicarContent = "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-TEST-FILE!$H+H*";
      const [fileChooser] = await Promise.all([
        page.waitForEvent("filechooser"),
        uploadLabel.click(),
      ]);
      await fileChooser.setFiles({
        name: "eicar-test.txt",
        mimeType: "text/plain",
        buffer: Buffer.from(eicarContent),
      });

      // Then: rejection message appears (the file is withheld — AC-NFR-009-02)
      const rejectionMsg = page.locator(
        `[data-testid="upload-rejected-${seeded.documentRequestId}"]`,
      );
      await expect(
        rejectionMsg,
        "upload-rejected message must be visible after EICAR upload (AC-NFR-009-02)",
      ).toBeVisible({ timeout: 30_000 });
      await expect(
        rejectionMsg,
        "Rejection message must mention 'malicious' (AC-NFR-009-02)",
      ).toContainText(/malicious/i, { timeout: 10_000 });

      // Then: the item remains Outstanding (file withheld — not fulfilled)
      const statusBadge = page.locator(
        `[data-testid="checklist-status-${seeded.documentRequestId}"]`,
      );
      await expect(
        statusBadge,
        "Checklist item must still show 'Outstanding' after malicious upload (AC-NFR-009-02)",
      ).toContainText("Outstanding", { timeout: 10_000 });

      // Screenshot 04: rejection message visible, item still Outstanding
      // Assert-before-screenshot — both elements asserted above.
      await page.screenshot({
        path: shot("04-AC-NFR-009-02-malicious-rejected.png"),
        fullPage: true,
      });
    } finally {
      await clearSession(page);
      if (seeded) await cleanupFixture(seeded.requestId);
    }
  },
);
