/**
 * apps/portal/e2e/specs/document-upload-cross-app.spec.ts
 *
 * Cross-app tier-6 e2e: accountant navigates to the document-requests authoring surface
 * via the request-detail nav-link (orphan-fix) → authors a document request →
 * client loads the portal → sees the checklist item with the accountant's label.
 *
 * This is the primary cross-surface evidence loop for EPIC-007 (AC-FILE-007-01/-02/-03 cross-app):
 *   1. Accountant opens /requests/<id> on admin — the "Document checklist / requests →" nav-link
 *      is present (orphan-fix: TASK-007-006). Clicks it to navigate to the authoring surface.
 *   2. Accountant creates a document request with a free-text label (AC-FILE-007-01).
 *   3. Client loads /onboarding on portal — sees the checklist item with the exact label
 *      (AC-FILE-007-02, AC-ONBD-004-01).
 *   4. Client fulfills the request by uploading a file (AC-FILE-007-03, AC-ONBD-004-03).
 *
 * Acceptance criteria covered (EPIC-007):
 *   AC-FILE-007-01 — accountant creates a labeled document request
 *   AC-FILE-007-02 — client sees each document request and its label
 *   AC-FILE-007-03 — client fulfills a request by uploading
 *   AC-ONBD-004-01 — client is shown the engagement's document checklist
 *   AC-ONBD-004-03 — client uploads to fulfill an item
 *
 * Gherkin binding (EPIC-007 § Acceptance scenarios — verbatim):
 *
 *   AC-FILE-007-01:
 *   "Given the accountant in an engagement
 *    When she creates a document request with a free-text label
 *    Then a labeled document request is created in that engagement"
 *
 *   AC-FILE-007-02:
 *   "Given an engagement with document requests
 *    When the client participant views the engagement
 *    Then they see each document request and its label"
 *
 *   AC-FILE-007-03:
 *   "Given a document request addressed to the client's engagement
 *    When the client uploads a file in response
 *    Then that request is fulfilled by the uploaded file"
 *
 * Stack: both containers up (AUTH_PROVIDER=mock, ESIGN_PROVIDER=mock,
 *        STORAGE_PROVIDER=azurite, MALWARE_SCAN_PROVIDER=mock).
 *
 * Fixture:
 *   - User (CLIENT, fixture clerkId)
 *   - EngagementRequest (accepted — accountant navigates to /requests/<id>)
 *   - Engagement (letterSignedAt=NOW — pre-signed to skip letter gate)
 *   All seeded directly via admin DB pool.
 *   The document request row is authored via the admin UI (not seeded directly)
 *   so the test exercises the real authoring path (AC-FILE-007-01).
 *   Cleanup reverses FK order.
 *
 * Run:
 *   pnpm e2e:cross-app  (includes this spec — scripts/e2e-cross-app.sh)
 *   pnpm --filter portal e2e:run -- --grep 'document-upload-cross-app'
 *
 * ADR-006: Cross-app — admin (accountant authoring) + portal (client upload).
 * ADR-012: Tier-6 e2e.
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

// Distinct clerkId from all other suites to avoid unique-constraint collisions.
const FIXTURE_CLERK_USER_ID = "user_client_e2e_upload_cross_001";

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
      "[document-upload-cross-app.spec] DATABASE_URL_ADMIN is not set (ADR-007).",
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

// ─── Fixture seed/cleanup ─────────────────────────────────────────────────────

interface CrossAppSeedResult {
  userId: string;
  requestId: string;
  engagementId: string;
}

/**
 * Seed the cross-app fixture:
 *   1. User (CLIENT, fixture clerkId)
 *   2. EngagementRequest (accepted — so accountant can navigate to /requests/<id>)
 *   3. Engagement (pre-signed — letter gate open for upload step)
 *
 * The DocumentRequest is authored via the admin UI (not seeded) so we exercise AC-FILE-007-01.
 */
async function seedCrossAppFixture(): Promise<CrossAppSeedResult> {
  const pool = await getPool();

  // 0. Pre-seed cleanup (idempotent) — clears stale data from previous failed runs.
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

  // 1. Upsert User
  const userResult = await pool
    .request()
    .input("clerkId", FIXTURE_CLERK_USER_ID)
    .input("email", "e2e-cross-upload-001@upload-cross.e2e.test")
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
    if (!userId) throw new Error("[document-upload-cross-app.spec] Failed to upsert User");
  }

  // 2. EngagementRequest (accepted — accountant navigates to /requests/<id>)
  const requestResult = await pool
    .request()
    .input("firstName", "CrossUploadTest")
    .input("lastName", "E2E")
    .input("email", `e2e-cross-upload-${Date.now()}@cross-upload.e2e.test`)
    .query<{ id: string }>(
      `INSERT INTO [dbo].[EngagementRequest]
         ([firstName], [lastName], [email], [status], [createdAt], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES (@firstName, @lastName, @email, 'accepted', SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET())`,
    );

  const requestId = requestResult.recordset[0]?.id;
  if (!requestId) throw new Error("[document-upload-cross-app.spec] Failed to seed EngagementRequest");

  // 3. Engagement — pre-signed (letterSignedAt=NOW)
  const evidenceJson = JSON.stringify({
    provider: "mock",
    ref: "e2e-cross-upload-mock-ref",
    signedAt: new Date().toISOString(),
  });

  const engagementResult = await pool
    .request()
    .input("engagementRequestId", requestId)
    .input("clientUserId", userId)
    .input("status", "New")
    .input("letterSignedAt", new Date())
    .input("letterSignatureEvidence", evidenceJson)
    .input("letterTemplateSnapshot", "E2E cross-app letter snapshot")
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
  if (!engagementId) throw new Error("[document-upload-cross-app.spec] Failed to seed Engagement");

  // DECISION (TASK-007-006): Lowercase all seeded IDs to match Prisma's return format.
  // SQL Server mssql raw queries return UNIQUEIDENTIFIER values as uppercase GUIDs.
  // Prisma lowercases them. URL params with lowercase GUIDs still match SQL Server
  // UNIQUEIDENTIFIER columns (case-insensitive comparison).
  return {
    userId: userId.toLowerCase(),
    requestId: requestId.toLowerCase(),
    engagementId: engagementId.toLowerCase(),
  };
}

async function cleanupCrossAppFixture(requestId: string): Promise<void> {
  const pool = await getPool();

  // 1. Document rows
  await pool
    .request()
    .input("requestId", requestId)
    .query(
      `DELETE d
       FROM [dbo].[Document] d
       JOIN [dbo].[Engagement] e ON e.[id] = d.[engagementId]
       WHERE e.[engagementRequestId] = @requestId`,
    );

  // 2. DocumentRequest rows
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

async function cleanupCrossAppUser(): Promise<void> {
  const pool = await getPool();
  await pool
    .request()
    .input("clerkId", FIXTURE_CLERK_USER_ID)
    .query(`DELETE FROM [dbo].[User] WHERE [clerkId] = @clerkId`);
}

// ─── Lifecycle hooks ──────────────────────────────────────────────────────────

// Configure Azurite CORS once per test-file run so the browser can PUT directly to
// the Azurite emulator from origin http://localhost:3000 without CORS errors.
// DECISION (TASK-007-006): page.route() does NOT intercept cross-origin localhost fetch()
// calls in Playwright/Chromium — configuring CORS server-side is the correct fix.
test.beforeAll(async () => {
  await configureAzuriteCors();
});

test.afterAll(async () => {
  await cleanupCrossAppUser();
  await closePool();
});

// ═══════════════════════════════════════════════════════════════════════════════
// Cross-app: accountant authors request → client sees label in checklist
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("[document-upload-cross-app] accountant authors → client fulfills (AC-FILE-007-01/-02/-03)", () => {

  let seeded: CrossAppSeedResult | null = null;
  let fixtureLabel = "";

  test.beforeEach(async () => {
    // Azurite CORS is configured once per run in the file-level test.beforeAll above.
    seeded = await seedCrossAppFixture();
    // Generate a unique label per test so the assertion is not a tautology.
    fixtureLabel = `Cross-app Document Request — ${Date.now()}`;
  });

  test.afterEach(async ({ page }) => {
    await clearSession(page);
    if (seeded) {
      await cleanupCrossAppFixture(seeded.requestId);
      seeded = null;
    }
  });

  test(
    "[AC-FILE-007-01] [AC-FILE-007-02] accountant authors request via nav-link → client sees it",
    async ({ page, request: httpRequest }) => {
      if (!seeded) throw new Error("fixture not seeded");

      // ── Step 1: Accountant navigates to /requests/<id> on admin ───────────────
      await setupAccountantSession(page, httpRequest);
      await page.goto(`${ADMIN_URL}/requests/${seeded.requestId}`);

      // Wait for the page to load — check the document-requests nav-link is present
      // (orphan-fix: TASK-007-006 adds this link once an engagement exists)
      const docRequestsLink = page.locator('[data-testid="document-requests-link"]');
      await expect(docRequestsLink).toBeVisible({ timeout: 10_000 });

      // ── Step 2: Accountant clicks the nav-link → navigates to authoring surface ─
      await docRequestsLink.click();

      // Wait for the document-requests authoring page
      await expect(page).toHaveURL(/document-requests/, { timeout: 10_000 });

      // ── Step 3: Accountant creates a document request (AC-FILE-007-01) ────────
      // The authoring surface is /engagements/<id>/document-requests
      // Inputs: label field + "Add request" button (from the admin document-request editor)
      const labelInput = page.locator('[data-testid="document-request-label-input"]');
      await expect(labelInput).toBeVisible({ timeout: 10_000 });
      await labelInput.fill(fixtureLabel);

      const addButton = page.locator('[data-testid="add-document-request-button"]');
      await expect(addButton).toBeVisible({ timeout: 5_000 });
      await addButton.click();

      // Wait for the new request to appear in the list
      const requestItem = page.locator(`[data-testid^="document-request-item-"]`);
      await expect(requestItem.filter({ hasText: fixtureLabel })).toBeVisible({ timeout: 10_000 });

      // ── Step 4: Switch to client session on portal ─────────────────────────────
      await clearSession(page);
      await setupClientSession(page, httpRequest, FIXTURE_CLERK_USER_ID);
      await page.goto(`${PORTAL_URL}/onboarding`);

      // ── Step 5: Client sees the checklist with the accountant's label (AC-FILE-007-02) ─
      const uploadStep = page.locator('[data-testid="onboarding-step-document-upload"]');
      await expect(uploadStep).toHaveAttribute("data-accessible", "true", { timeout: 10_000 });

      const uploadActive = page.locator('[data-testid="document-upload-active"]');
      await expect(uploadActive).toBeVisible({ timeout: 10_000 });

      // The label the accountant authored must be visible to the client
      const checklistLabel = page.locator('[data-testid^="checklist-label-"]');
      await expect(
        checklistLabel.filter({ hasText: fixtureLabel }),
      ).toBeVisible({ timeout: 10_000 });
    },
  );

  test(
    "[AC-FILE-007-03] client fulfills the request authored by the accountant",
    async ({ page, request: httpRequest }) => {
      if (!seeded) throw new Error("fixture not seeded");

      // ── Step 1: Accountant authors the document request ───────────────────────
      await setupAccountantSession(page, httpRequest);
      await page.goto(`${ADMIN_URL}/engagements/${seeded.engagementId}/document-requests`);

      const labelInput = page.locator('[data-testid="document-request-label-input"]');
      await expect(labelInput).toBeVisible({ timeout: 10_000 });
      await labelInput.fill(fixtureLabel);

      const addButton = page.locator('[data-testid="add-document-request-button"]');
      await addButton.click();

      // Wait for request to appear (confirms it's in the DB)
      const requestItem = page.locator(`[data-testid^="document-request-item-"]`);
      await expect(requestItem.filter({ hasText: fixtureLabel })).toBeVisible({ timeout: 10_000 });

      // Get the request id from the data attribute (for checklist item assertion).
      // DECISION (TASK-007-006): Lowercase the id — the admin component stores the mssql-returned
      // uppercase GUID in data-request-id, but the portal component uses Prisma-returned lowercase
      // UUIDs in data-testid attributes. Always compare against the lowercase form.
      const requestItemEl = requestItem.filter({ hasText: fixtureLabel }).first();
      const docRequestIdRaw = await requestItemEl.getAttribute("data-request-id");
      const docRequestId = docRequestIdRaw ? docRequestIdRaw.toLowerCase() : null;

      // ── Step 2: Client fulfills the request ───────────────────────────────────
      await clearSession(page);
      await setupClientSession(page, httpRequest, FIXTURE_CLERK_USER_ID);
      await page.goto(`${PORTAL_URL}/onboarding`);

      const uploadStep = page.locator('[data-testid="onboarding-step-document-upload"]');
      await expect(uploadStep).toHaveAttribute("data-accessible", "true", { timeout: 10_000 });
      await page.locator('[data-testid="document-upload-active"]').waitFor({ state: "visible", timeout: 10_000 });

      // Find the upload label for the seeded request (by request id or first available).
      // DECISION (TASK-007-006): Use filechooser pattern (label.click + waitForEvent) rather
      // than setInputFiles directly on the hidden input. See document-upload.spec.ts for rationale.
      const uploadLabelLocator = docRequestId
        ? page.locator(`[data-testid="upload-label-${docRequestId}"]`)
        : page.locator('[data-testid^="upload-label-"]').first();

      await expect(uploadLabelLocator).toBeVisible({ timeout: 10_000 });

      const [fileChooser] = await Promise.all([
        page.waitForEvent("filechooser"),
        uploadLabelLocator.click(),
      ]);
      await fileChooser.setFiles({
        name: "tax-document.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from("Tax document content for AC-FILE-007-03 cross-app test"),
      });

      // Then: the request is fulfilled by the uploaded file.
      //
      // DECISION (TASK-007-006): The fixture creates ONE document request. When the only
      // required item is fulfilled, allRequiredProvided=true and the UI transitions from
      // the ACTIVE state (with per-item "Provided"/"Outstanding" status badges) to the
      // SATISFIED state ("All documents provided" + read-only list). The "Provided" badge
      // only appears in the ACTIVE state when some-but-not-all items are fulfilled.
      //
      // We check `data-status="fulfilled"` on the checklist item, which is present in BOTH
      // the ACTIVE state (partially fulfilled) and the SATISFIED state (all fulfilled).
      // This assertion correctly covers the single-item cross-app fixture scenario.
      if (docRequestId) {
        const checklistItem = page.locator(`[data-testid="checklist-item-${docRequestId}"]`);
        await expect(checklistItem).toHaveAttribute("data-status", "fulfilled", { timeout: 30_000 });
      } else {
        // Fallback: wait for the satisfied state (all items fulfilled — no specific requestId)
        await expect(
          page.locator('[data-testid="document-upload-satisfied"]'),
        ).toBeVisible({ timeout: 30_000 });
      }
    },
  );
});
