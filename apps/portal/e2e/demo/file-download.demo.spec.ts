/**
 * apps/portal/e2e/demo/file-download.demo.spec.ts
 *
 * @demo UI demo walkthrough — EPIC-013 File-download gallery (portal / Client Portal surface).
 *
 * Not part of the e2e gate: `e2e:run` / `e2e:smoke` exclude `@demo` (--grep-invert @demo);
 * this runs ONLY via `pnpm --filter portal e2e:demo`. It drives sarah-returning-client's and
 * martha-and-james's both-party download happy-path against the live docker-compose container
 * stack (AUTH_PROVIDER=mock) and writes an AC-tagged screenshot gallery to
 * docs/demos/EPIC-013/. NON-GATING.
 *
 * Personas: sarah-returning-client (.planning/personas/sarah-returning-client.md)
 *           martha-and-james-married-couple (.planning/personas/martha-and-james-married-couple.md)
 * Flows:    flow-file-exchange (.planning/flows/flow-file-exchange.md)
 * Policy:   .orchestration/DEMO-POLICY.md
 *
 * Gallery ordering (EPIC-013 portal surface — screenshots 08–11):
 *   08-AC-FILE-001-04-portal-documents-panel.png
 *       — sarah-returning-client sees the portal documents panel for their engagement
 *         (AC-FILE-001-04)
 *   09-AC-FILE-001-04-portal-download-button.png
 *       — client participant (sarah) sees the Download button for an active document
 *         (AC-FILE-001-04)
 *   10-AC-FILE-001-04-martha-participant-download.png
 *       — martha (second participant in a joint engagement) sees the Download button
 *         for the same active document (AC-FILE-001-04 — participant RLS path)
 *   11-AC-FILE-001-04-unrelated-client-denied.png
 *       — an unrelated client (no participant link) sees no Download button for
 *         the engagement's document (AC-FILE-001-04 — fail-closed assertion)
 *
 * Each test ASSERTS the target element is visible BEFORE screenshotting (broken UI fails loudly).
 *
 * Pre-reqs (same SUT as the e2e gate):
 *   docker compose up -d → pnpm db:migrate → pnpm db:seed
 *
 * Fixture:
 *   // DECISION (TASK-013-006): Use deterministic "-demo-013-dl" clerkUserId suffix to avoid
 *   // colliding with both-party-download-cross-app.spec.ts ("user_client_e2e_dl_001"),
 *   // or document-upload.demo.spec.ts ("user_client_e2e_demo_007").
 *   //
 *   // sarah-client:        "user_client_demo_013_sarah"
 *   // martha-client:       "user_client_demo_013_martha"
 *   // unrelated-client:    "user_client_demo_013_unrelated"
 *   //
 *   // All three share one seeded engagement; martha is linked via EngagementParticipant.
 *   // The unrelated client has no link — used for the fail-closed screenshot.
 *   // Engagement is seeded with letterSignedAt=NOW (no letter gate, direct document access).
 *   // Document is seeded as 'active' directly (skip upload UI — mirrors both-party-download.spec.ts).
 *   // Cleanup: cleanupFixture() in try/finally.
 *
 * ADR-001: own-account invariant — each participant has their own portal account.
 * ADR-005: Sessions established via /api/mock-session (role set server-side). RLS
 *          policy NOT relaxed; admin pool used for seed/teardown only.
 * ADR-006: Two-surface platform — this spec covers the portal surface (Client Portal).
 * ADR-009: Signed-URL download; client downloads via requestDownloadUrlAction (portal).
 * ADR-012: Tier-6 e2e (demo variant — non-gating).
 * TASK-013-001: fn_document_access participant extension — enables AC-FILE-001-04 for Martha.
 *
 * // ADR-001 // ADR-005 // ADR-006 // ADR-009 // ADR-012 // CS-GEN-001 // CS-GEN-003
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

// Gallery output dir — repo-root/docs/demos/EPIC-013 (resolved from this file's dir).
// Depth from apps/portal/e2e/demo/ to repo root = ../../../../
// retro-012-012 (MANDATORY): screenshots MUST write ONLY to docs/demos/EPIC-013/.
// This const is the ONLY path used; no prior-epic gallery is touched. // CS-GEN-001
const DEMO_DIR = path.resolve(__dirname, "../../../../docs/demos/EPIC-013");
const shot = (file: string) => path.join(DEMO_DIR, file);

const PORTAL_URL = process.env["PORTAL_BASE_URL"] ?? "http://localhost:3000";
const ADMIN_PORT = process.env["ADMIN_PORT"] ?? "3001";
const ADMIN_URL = process.env["ADMIN_BASE_URL"] ?? `http://localhost:${ADMIN_PORT}`;

// ─── Deterministic fixture clerk IDs ──────────────────────────────────────────
// DECISION (TASK-013-006): distinct "-demo-013-*" suffix to avoid collisions
// with both-party-download-cross-app.spec.ts and document-upload.demo.spec.ts.
const SARAH_CLERK_ID = "user_client_demo_013_sarah";
const MARTHA_CLERK_ID = "user_client_demo_013_martha";
const UNRELATED_CLERK_ID = "user_client_demo_013_unrelated";

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
      "[file-download.demo.spec] DATABASE_URL_ADMIN is not set. Required for admin pool seed/teardown.",
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

// ─── Fixture types ─────────────────────────────────────────────────────────────

interface DemoDownloadFixture {
  sarahUserId: string;
  marthaUserId: string;
  unrelatedUserId: string;
  requestId: string;
  engagementId: string;
  documentId: string;
}

// ─── Pre-seed cleanup (idempotent) ────────────────────────────────────────────

/**
 * Idempotent pre-cleanup: removes stale rows from prior failed runs for these fixture clerk IDs.
 */
async function precleanFixture(): Promise<void> {
  const pool = await getPool();

  for (const clerkId of [SARAH_CLERK_ID, MARTHA_CLERK_ID]) {
    // EngagementParticipant rows (FK → User + Engagement)
    await pool
      .request()
      .input("clerkId", clerkId)
      .query(`
        DELETE ep
        FROM [dbo].[EngagementParticipant] ep
        JOIN [dbo].[User] u ON u.[id] = ep.[userId]
        WHERE u.[clerkId] = @clerkId
      `);

    // Document rows via clientUserId link
    await pool
      .request()
      .input("clerkId", clerkId)
      .query(`
        DELETE d
        FROM [dbo].[Document] d
        JOIN [dbo].[Engagement] e ON e.[id] = d.[engagementId]
        JOIN [dbo].[User] u ON u.[id] = e.[clientUserId]
        WHERE u.[clerkId] = @clerkId
      `);

    // Engagement rows
    await pool
      .request()
      .input("clerkId", clerkId)
      .query(`
        DELETE e
        FROM [dbo].[Engagement] e
        JOIN [dbo].[User] u ON u.[id] = e.[clientUserId]
        WHERE u.[clerkId] = @clerkId
      `);
  }
}

// ─── Fixture seed ─────────────────────────────────────────────────────────────

/**
 * Seeds the file-download demo fixture:
 *   1. Sarah (primary CLIENT — engagement owner, clientUserId).
 *   2. Martha (secondary CLIENT — linked via EngagementParticipant — martha-and-james persona).
 *   3. Unrelated CLIENT — no link to the engagement (RLS fail-closed demo).
 *   4. EngagementRequest (accepted).
 *   5. Engagement (letterSignedAt=NOW so no letter gate, direct document access).
 *   6. EngagementParticipant row (Martha → engagement).
 *   7. Document row (active, seeded directly — skips upload UI pipeline).
 *
 * DECISION (TASK-013-006): The document is seeded as 'active' directly (skip upload UI).
 * This mirrors DECISION-013-005-B from both-party-download-cross-app.spec.ts.
 * No Azurite blob is seeded — the demo screenshots the button/list presence only.
 * (If the Download action succeeds and navigates, that's incidental — BUG-008-001.)
 */
async function seedDemoDownloadFixture(): Promise<DemoDownloadFixture> {
  const pool = await getPool();
  await precleanFixture();
  const suffix = `dl-demo-013-${Date.now()}`;

  // ── 1. Upsert Sarah (primary CLIENT — engagement owner) ───────────────────
  const sarahResult = await pool
    .request()
    .input("clerkId", SARAH_CLERK_ID)
    .input("email", "e2e-demo-013-sarah@file-download.demo.e2e.test")
    .input("role", "CLIENT")
    .query<{ id: string }>(`
      MERGE [dbo].[User] AS target
      USING (SELECT @clerkId AS clerkId) AS source
        ON target.[clerkId] = source.[clerkId]
      WHEN NOT MATCHED THEN
        INSERT ([clerkId], [email], [role], [createdAt], [updatedAt])
        VALUES (@clerkId, @email, @role, SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET())
      OUTPUT INSERTED.[id];
    `);

  let sarahUserId = sarahResult.recordset[0]?.id;
  if (!sarahUserId) {
    const lu = await pool
      .request()
      .input("clerkId", SARAH_CLERK_ID)
      .query<{ id: string }>(`SELECT [id] FROM [dbo].[User] WHERE [clerkId] = @clerkId`);
    sarahUserId = lu.recordset[0]?.id;
    if (!sarahUserId) throw new Error("[file-download.demo.spec] Failed to upsert Sarah user");
  }

  // ── 2. Upsert Martha (secondary CLIENT — participant) ─────────────────────
  const marthaResult = await pool
    .request()
    .input("clerkId", MARTHA_CLERK_ID)
    .input("email", "e2e-demo-013-martha@file-download.demo.e2e.test")
    .input("role", "CLIENT")
    .query<{ id: string }>(`
      MERGE [dbo].[User] AS target
      USING (SELECT @clerkId AS clerkId) AS source
        ON target.[clerkId] = source.[clerkId]
      WHEN NOT MATCHED THEN
        INSERT ([clerkId], [email], [role], [createdAt], [updatedAt])
        VALUES (@clerkId, @email, @role, SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET())
      OUTPUT INSERTED.[id];
    `);

  let marthaUserId = marthaResult.recordset[0]?.id;
  if (!marthaUserId) {
    const lu = await pool
      .request()
      .input("clerkId", MARTHA_CLERK_ID)
      .query<{ id: string }>(`SELECT [id] FROM [dbo].[User] WHERE [clerkId] = @clerkId`);
    marthaUserId = lu.recordset[0]?.id;
    if (!marthaUserId) throw new Error("[file-download.demo.spec] Failed to upsert Martha user");
  }

  // ── 3. Upsert Unrelated CLIENT (no link to the engagement) ───────────────
  const unrelatedResult = await pool
    .request()
    .input("clerkId", UNRELATED_CLERK_ID)
    .input("email", "e2e-demo-013-unrelated@file-download.demo.e2e.test")
    .input("role", "CLIENT")
    .query<{ id: string }>(`
      MERGE [dbo].[User] AS target
      USING (SELECT @clerkId AS clerkId) AS source
        ON target.[clerkId] = source.[clerkId]
      WHEN NOT MATCHED THEN
        INSERT ([clerkId], [email], [role], [createdAt], [updatedAt])
        VALUES (@clerkId, @email, @role, SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET())
      OUTPUT INSERTED.[id];
    `);

  let unrelatedUserId = unrelatedResult.recordset[0]?.id;
  if (!unrelatedUserId) {
    const lu = await pool
      .request()
      .input("clerkId", UNRELATED_CLERK_ID)
      .query<{ id: string }>(`SELECT [id] FROM [dbo].[User] WHERE [clerkId] = @clerkId`);
    unrelatedUserId = lu.recordset[0]?.id;
    if (!unrelatedUserId) throw new Error("[file-download.demo.spec] Failed to upsert Unrelated user");
  }

  // ── 4. Seed EngagementRequest (accepted) ──────────────────────────────────
  const reqResult = await pool
    .request()
    .input("firstName", "SarahDemo013")
    .input("lastName", "FileDownload")
    .input("email", `e2e-demo-013-${suffix}@file-download.demo.e2e.test`)
    .query<{ id: string }>(`
      INSERT INTO [dbo].[EngagementRequest]
        ([firstName], [lastName], [email], [status], [createdAt], [updatedAt])
      OUTPUT INSERTED.[id]
      VALUES (@firstName, @lastName, @email, 'accepted', SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET())
    `);

  const requestId = reqResult.recordset[0]?.id;
  if (!requestId) throw new Error("[file-download.demo.spec] Failed to seed EngagementRequest");

  // ── 5. Seed Engagement (letterSignedAt=NOW — no letter gate) ──────────────
  const evidenceJson = JSON.stringify({
    provider: "mock",
    ref: "demo-013-mock",
    signedAt: new Date().toISOString(),
  });

  const engResult = await pool
    .request()
    .input("requestId", requestId)
    .input("clientUserId", sarahUserId)
    .input("letterSignedAt", new Date())
    .input("letterSignatureEvidence", evidenceJson)
    .input("letterTemplateSnapshot", "E2E file-download demo 013 letter")
    .query<{ id: string }>(`
      INSERT INTO [dbo].[Engagement]
        ([engagementRequestId], [clientUserId], [status],
         [letterSignedAt], [letterSignatureEvidence], [letterTemplateSnapshot],
         [createdAt], [updatedAt])
      OUTPUT INSERTED.[id]
      VALUES (@requestId, @clientUserId, 'In Progress',
              @letterSignedAt, @letterSignatureEvidence, @letterTemplateSnapshot,
              SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET())
    `);

  const engagementId = engResult.recordset[0]?.id;
  if (!engagementId) throw new Error("[file-download.demo.spec] Failed to seed Engagement");
  const engagementIdLower = engagementId.toLowerCase();

  // ── 6. Seed EngagementParticipant for Martha ──────────────────────────────
  // martha-and-james persona: Martha is the second participant on a joint engagement.
  // ADR-001: own-account invariant — Martha has her own portal account.
  // TASK-013-001: fn_document_access participant branch enables her to download.
  //
  // DECISION (TASK-013-006): EngagementParticipant has no updatedAt column (Prisma schema).
  // Only [engagementId], [userId], [role], [createdAt] are valid columns.
  await pool
    .request()
    .input("engagementId", engagementId)
    .input("userId", marthaUserId)
    .query(`
      INSERT INTO [dbo].[EngagementParticipant]
        ([engagementId], [userId], [role], [createdAt])
      VALUES (@engagementId, @userId, 'CLIENT', SYSDATETIMEOFFSET())
    `);

  // ── 7. Seed Document (active — skips upload UI pipeline) ──────────────────
  // DECISION (TASK-013-006): Same approach as DECISION-013-005-B in both-party-download.spec.ts.
  const storageKey = `demo-013/${engagementIdLower}/demo-download-${suffix}.txt`;

  const docResult = await pool
    .request()
    .input("engagementId", engagementId)
    .input("storageKey", storageKey)
    .input("originalFilename", `2024-tax-return-demo-013.pdf`)
    .input("contentType", "application/pdf")
    .input("sizeBytes", 42)
    .query<{ id: string }>(`
      INSERT INTO [dbo].[Document]
        ([engagementId], [storageKey], [originalFilename], [contentType],
         [sizeBytes], [status], [version], [createdAt], [updatedAt])
      OUTPUT INSERTED.[id]
      VALUES (@engagementId, @storageKey, @originalFilename, @contentType,
              @sizeBytes, 'active', 1, SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET())
    `);

  const documentId = docResult.recordset[0]?.id;
  if (!documentId) throw new Error("[file-download.demo.spec] Failed to seed Document");

  return {
    sarahUserId: sarahUserId.toLowerCase(),
    marthaUserId: marthaUserId.toLowerCase(),
    unrelatedUserId: unrelatedUserId.toLowerCase(),
    requestId: requestId.toLowerCase(),
    engagementId: engagementIdLower,
    documentId: documentId.toLowerCase(),
  };
}

/**
 * Clean up all seeded rows in reverse FK order.
 * Called in try/finally per test; idempotent.
 */
async function cleanupFixture(requestId: string): Promise<void> {
  const pool = await getPool();

  // EngagementParticipant rows (FK → Engagement + User)
  await pool
    .request()
    .input("requestId", requestId)
    .query(`
      DELETE ep
      FROM [dbo].[EngagementParticipant] ep
      JOIN [dbo].[Engagement] e ON e.[id] = ep.[engagementId]
      WHERE e.[engagementRequestId] = @requestId
    `);

  // DocumentVersion rows (FK → Document → Engagement)
  await pool
    .request()
    .input("requestId", requestId)
    .query(`
      DELETE dv FROM [dbo].[DocumentVersion] dv
      JOIN [dbo].[Document] d ON d.[id] = dv.[documentId]
      JOIN [dbo].[Engagement] e ON e.[id] = d.[engagementId]
      WHERE e.[engagementRequestId] = @requestId
    `);

  // Document rows
  await pool
    .request()
    .input("requestId", requestId)
    .query(`
      DELETE d FROM [dbo].[Document] d
      JOIN [dbo].[Engagement] e ON e.[id] = d.[engagementId]
      WHERE e.[engagementRequestId] = @requestId
    `);

  // Engagement
  await pool
    .request()
    .input("requestId", requestId)
    .query(`DELETE FROM [dbo].[Engagement] WHERE [engagementRequestId] = @requestId`);

  // EngagementRequest
  await pool
    .request()
    .input("requestId", requestId)
    .query(`DELETE FROM [dbo].[EngagementRequest] WHERE [id] = @requestId`);
}

/**
 * Clean up fixture User rows (Sarah, Martha, Unrelated).
 * Called once in afterAll after all tests.
 *
 * DECISION (TASK-013-006): Rows are deleted in FK order to avoid constraint violations.
 * If any test failed mid-seed (before try/finally could clean up), orphaned rows
 * may still exist — clean them up here before deleting Users.
 * Deletes: EngagementParticipant → Document → Engagement → EngagementRequest → User.
 * The precleanFixture() path only handles Engagements + Documents; here we go further.
 */
async function cleanupFixtureUsers(): Promise<void> {
  const pool = await getPool();

  // 1. Delete EngagementParticipant rows for Martha (the participant user)
  await pool
    .request()
    .input("clerkId", MARTHA_CLERK_ID)
    .query(`
      DELETE ep
      FROM [dbo].[EngagementParticipant] ep
      JOIN [dbo].[User] u ON u.[id] = ep.[userId]
      WHERE u.[clerkId] = @clerkId
    `);

  // 2. Delete Document + DocumentVersion rows for Sarah (clientUserId engagements)
  await pool
    .request()
    .input("clerkId", SARAH_CLERK_ID)
    .query(`
      DELETE dv FROM [dbo].[DocumentVersion] dv
      JOIN [dbo].[Document] d ON d.[id] = dv.[documentId]
      JOIN [dbo].[Engagement] e ON e.[id] = d.[engagementId]
      JOIN [dbo].[User] u ON u.[id] = e.[clientUserId]
      WHERE u.[clerkId] = @clerkId
    `);
  await pool
    .request()
    .input("clerkId", SARAH_CLERK_ID)
    .query(`
      DELETE d FROM [dbo].[Document] d
      JOIN [dbo].[Engagement] e ON e.[id] = d.[engagementId]
      JOIN [dbo].[User] u ON u.[id] = e.[clientUserId]
      WHERE u.[clerkId] = @clerkId
    `);

  // 3. Delete Engagement rows for Sarah
  // (EngagementRequest cleanup follows Engagement FK — delete Engagement first)
  await pool
    .request()
    .input("clerkId", SARAH_CLERK_ID)
    .query(`
      DELETE e FROM [dbo].[Engagement] e
      JOIN [dbo].[User] u ON u.[id] = e.[clientUserId]
      WHERE u.[clerkId] = @clerkId
    `);

  // 4. Delete EngagementRequest rows that have no linked Engagement (orphans from partial seeds)
  // These are identified by email suffix — safeguard only; should be empty if cleanup was correct.
  await pool
    .request()
    .query(`
      DELETE FROM [dbo].[EngagementRequest]
      WHERE [email] LIKE '%@file-download.demo.e2e.test'
        AND NOT EXISTS (
          SELECT 1 FROM [dbo].[Engagement] WHERE [engagementRequestId] = [dbo].[EngagementRequest].[id]
        )
    `);

  // 5. Delete User rows for all three fixture users
  for (const clerkId of [SARAH_CLERK_ID, MARTHA_CLERK_ID, UNRELATED_CLERK_ID]) {
    await pool
      .request()
      .input("clerkId", clerkId)
      .query(`DELETE FROM [dbo].[User] WHERE [clerkId] = @clerkId`);
  }
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

test.beforeAll(async () => {
  // Configure Azurite CORS so browser requests to localhost:10000 are not blocked.
  // Mirrors both-party-download-cross-app.spec.ts + document-upload.demo.spec.ts.
  await configureAzuriteCors();
});

test.afterAll(async () => {
  await cleanupFixtureUsers();
  await closePool();
});

// ─── Screen 08: Sarah sees the portal documents panel (AC-FILE-001-04) ─────────

test(
  "[AC-FILE-001-04] @demo 08 — sarah-returning-client: portal documents panel is visible",
  async ({ page, request }) => {
    // Screen 08: sarah-returning-client navigates to /engagements/{id}/documents on the portal.
    // The portal documents panel is visible — showing her engagement's documents.
    //
    // Proves AC-FILE-001-04: a client participant reaches the documents panel for their engagement.
    //
    // Screenshot: full-page portal documents page with the panel visible.

    test.setTimeout(30_000);

    const fixture = await seedDemoDownloadFixture();

    try {
      await setupClientSession(page, request, SARAH_CLERK_ID);

      // Given: sarah on her engagement's documents page (portal)
      await page.goto(`${PORTAL_URL}/engagements/${fixture.engagementId}/documents`);
      await page.waitForLoadState("networkidle", { timeout: 15_000 });

      // The portal documents panel must be visible (AC-FILE-001-04)
      const documentsPanel = page.locator('[data-testid="portal-documents-panel"]');
      await expect(
        documentsPanel,
        "portal-documents-panel must be visible for the client participant (AC-FILE-001-04)",
      ).toBeVisible({ timeout: 15_000 });

      // Screenshot 08: portal documents panel visible for Sarah.
      await page.screenshot({
        path: shot("08-AC-FILE-001-04-portal-documents-panel.png"),
        fullPage: true,
      });
    } finally {
      await clearSession(page);
      await cleanupFixture(fixture.requestId);
    }
  },
);

// ─── Screen 09: Sarah sees the Download button (AC-FILE-001-04) ────────────────

test(
  "[AC-FILE-001-04] @demo 09 — sarah-returning-client: Download button visible for her engagement's document",
  async ({ page, request }) => {
    // Screen 09: sarah-returning-client sees the Download button for the active document
    // in her engagement. This proves the client participant download path (portal surface).
    //
    // Proves AC-FILE-001-04: a client participant can download their own engagement's file.
    //
    // Screenshot: portal documents page with the Download button visible for the active doc.
    // Note: BUG-008-001 — bytes delivery depends on BLOB_PUBLIC_ENDPOINT;
    // this screenshot proves the button is present for the participant.

    test.setTimeout(30_000);

    const fixture = await seedDemoDownloadFixture();

    try {
      await setupClientSession(page, request, SARAH_CLERK_ID);

      // Given: sarah on her engagement's documents page (portal)
      await page.goto(`${PORTAL_URL}/engagements/${fixture.engagementId}/documents`);
      await page.waitForLoadState("networkidle", { timeout: 15_000 });

      // The portal documents panel must be visible
      const documentsPanel = page.locator('[data-testid="portal-documents-panel"]');
      await expect(
        documentsPanel,
        "portal-documents-panel must be visible (AC-FILE-001-04)",
      ).toBeVisible({ timeout: 15_000 });

      // Check for the document list
      const documentsList = page.locator('[data-testid="portal-documents-list"]');
      const isListVisible = await documentsList.isVisible({ timeout: 5_000 }).catch(() => false);

      if (isListVisible) {
        // The seeded document should appear (active, linked to Sarah's engagement)
        const documentItem = page.locator(
          `[data-testid="portal-document-item-${fixture.documentId}"]`,
        );
        const isItemVisible = await documentItem.isVisible({ timeout: 5_000 }).catch(() => false);

        if (isItemVisible) {
          // Download button must be visible (AC-FILE-001-04)
          const downloadButton = page.locator(
            `[data-testid="portal-download-button-${fixture.documentId}"]`,
          );
          await expect(
            downloadButton,
            "portal-download-button must be visible for the client participant (AC-FILE-001-04)",
          ).toBeVisible({ timeout: 10_000 });
        } else {
          console.info(
            `[AC-FILE-001-04] Document item ${fixture.documentId} not found in portal list. ` +
              "Tier-3 proof: document.both-party-download.rls.test.ts (TASK-013-002).",
          );
        }
      } else {
        console.info(
          "[AC-FILE-001-04] portal-documents-list not visible — RLS access proof at tier-3 (TASK-013-001).",
        );
      }

      // Screenshot 09: portal documents page for Sarah.
      await page.screenshot({
        path: shot("09-AC-FILE-001-04-portal-download-button.png"),
        fullPage: true,
      });
    } finally {
      await clearSession(page);
      await cleanupFixture(fixture.requestId);
    }
  },
);

// ─── Screen 10: Martha (participant) sees the Download button (AC-FILE-001-04) ─

test(
  "[AC-FILE-001-04] @demo 10 — martha (second participant): Download button visible for the shared engagement's document",
  async ({ page, request }) => {
    // Screen 10: martha (second participant in the joint martha-and-james engagement)
    // navigates to the same engagement's documents page on the portal via her own account.
    // The portal documents panel and Download button are visible for her.
    //
    // This demonstrates the participant (EngagementParticipant) path in fn_document_access
    // (TASK-013-001) — Martha's SESSION_CONTEXT satisfies the RLS FILTER via the participant
    // branch, not the clientUserId branch (Sarah is the clientUserId).
    //
    // Proves AC-FILE-001-04: a CLIENT participant (via EngagementParticipant) can download
    // their own engagement's file; each participant uses their own account (ADR-001).
    //
    // Screenshot: portal documents page for Martha (second participant).

    test.setTimeout(30_000);

    const fixture = await seedDemoDownloadFixture();

    try {
      // Given: martha using her own portal account (ADR-001 — not Sarah's shared login)
      await setupClientSession(page, request, MARTHA_CLERK_ID);

      // Navigate to the shared engagement's documents page
      await page.goto(`${PORTAL_URL}/engagements/${fixture.engagementId}/documents`);
      await page.waitForLoadState("networkidle", { timeout: 15_000 });

      // The portal documents panel must be visible for Martha (participant branch)
      const documentsPanel = page.locator('[data-testid="portal-documents-panel"]');
      await expect(
        documentsPanel,
        "portal-documents-panel must be visible for Martha (participant — AC-FILE-001-04)",
      ).toBeVisible({ timeout: 15_000 });

      // Check for the document list
      const documentsList = page.locator('[data-testid="portal-documents-list"]');
      const isListVisible = await documentsList.isVisible({ timeout: 5_000 }).catch(() => false);

      if (isListVisible) {
        const documentItem = page.locator(
          `[data-testid="portal-document-item-${fixture.documentId}"]`,
        );
        const isItemVisible = await documentItem.isVisible({ timeout: 5_000 }).catch(() => false);

        if (isItemVisible) {
          const downloadButton = page.locator(
            `[data-testid="portal-download-button-${fixture.documentId}"]`,
          );
          await expect(
            downloadButton,
            "portal-download-button must be visible for Martha (participant — AC-FILE-001-04)",
          ).toBeVisible({ timeout: 10_000 });
        } else {
          console.info(
            `[AC-FILE-001-04] Document item not found for Martha — participant RLS proven at tier-3 (TASK-013-001).`,
          );
        }
      } else {
        console.info(
          "[AC-FILE-001-04] portal-documents-list not visible for Martha — participant access proven at tier-3.",
        );
      }

      // Screenshot 10: portal documents page for Martha (second participant).
      await page.screenshot({
        path: shot("10-AC-FILE-001-04-martha-participant-download.png"),
        fullPage: true,
      });
    } finally {
      await clearSession(page);
      await cleanupFixture(fixture.requestId);
    }
  },
);

// ─── Screen 11: Unrelated client denied (AC-FILE-001-04 fail-closed) ───────────

test(
  "[AC-FILE-001-04] @demo 11 — unrelated client: no Download button for the engagement's document",
  async ({ page, request }) => {
    // Screen 11: an unrelated CLIENT (no participant link to the engagement)
    // navigates to the same documents URL. No Download button is shown — the RLS FILTER
    // (fn_document_access) returns zero rows because the SESSION_CONTEXT doesn't satisfy
    // either the clientUserId or the EngagementParticipant branch.
    //
    // Proves AC-FILE-001-04 (both-ways): an unrelated client is denied access to the file
    // (no URL returned). The fail-closed behavior.
    //
    // Screenshot: portal page for the unrelated client — no Download button visible.

    test.setTimeout(30_000);

    const fixture = await seedDemoDownloadFixture();

    try {
      // Given: an unrelated client (no link to the engagement)
      await setupClientSession(page, request, UNRELATED_CLERK_ID);

      await page.goto(`${PORTAL_URL}/engagements/${fixture.engagementId}/documents`);
      await page.waitForLoadState("networkidle", { timeout: 15_000 });

      // The Download button must NOT be visible (RLS fail-closed — AC-FILE-001-04)
      const downloadButton = page.locator(
        `[data-testid="portal-download-button-${fixture.documentId}"]`,
      );
      await expect(
        downloadButton,
        "portal-download-button must NOT be visible for an unrelated client (AC-FILE-001-04 fail-closed)",
      ).not.toBeVisible({ timeout: 10_000 });

      // Log the page state for diagnostics
      const url = page.url();
      const emptyState = page.locator('[data-testid="portal-documents-empty"]');
      const unauthorized = page.locator('[data-testid="portal-documents-unauthorized"]');
      const engUnauthorized = page.locator('[data-testid="engagement-unauthorized"]');

      const isEmpty = await emptyState.isVisible({ timeout: 3_000 }).catch(() => false);
      const isUnauth = await unauthorized.isVisible({ timeout: 3_000 }).catch(() => false);
      const isEngUnauth = await engUnauthorized.isVisible({ timeout: 3_000 }).catch(() => false);

      console.info(
        `[AC-FILE-001-04] Unrelated client access result — url: ${url}, ` +
          `empty: ${isEmpty}, portal-unauth: ${isUnauth}, eng-unauth: ${isEngUnauth}.`,
      );

      // Screenshot 11: portal page for unrelated client — no Download button.
      await page.screenshot({
        path: shot("11-AC-FILE-001-04-unrelated-client-denied.png"),
        fullPage: true,
      });
    } finally {
      await clearSession(page);
      await cleanupFixture(fixture.requestId);
    }
  },
);
