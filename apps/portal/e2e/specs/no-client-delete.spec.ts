/**
 * apps/portal/e2e/specs/no-client-delete.spec.ts
 *
 * Tier-6 e2e — Portal surface no-client-delete absence proof.
 *
 * TASK-014-003: AC-FILE-004-02 and AC-FILE-004-03 — no client-facing path removes a file.
 *
 * This spec proves the PORTAL surface (Client Portal) exposes NO delete capability for
 * any file — including a file the client uploaded. This is the second half of the
 * "both-ways" no-client-delete proof required by BRIEF-014 (mirroring EPIC-013's
 * both-party trap):
 *   1. Server-side: deleteDocumentAction rejects non-ACCOUNTANT before any write
 *      (proven in apps/admin/src/app/.../documents/actions.test.ts).
 *   2. Portal surface (this spec): the client documents view exposes NO delete affordance
 *      for any file, including one the client uploaded.
 *
 * Acceptance criteria covered:
 *   AC-FILE-004-02 — A client cannot delete any file, including a file the client uploaded.
 *   AC-FILE-004-03 — No client-facing path exists to remove a file from an engagement.
 *
 * Gherkin binding (BRIEF-014 § Acceptance scenarios — verbatim):
 *
 *   AC-FILE-004-02:
 *     Given a client participant of an engagement, including for a file they uploaded
 *     When they attempt to delete a file through any portal path
 *     Then no deletion occurs and the capability is not available to them
 *
 *   AC-FILE-004-03:
 *     Given the client surface of an engagement
 *     When it is examined for a file-removal capability
 *     Then no client-facing path exists to remove a file from the engagement
 *
 * Stack: portal container at http://localhost:3000, AUTH_PROVIDER=mock.
 *
 * Fixture strategy:
 *   Seeds an Engagement with:
 *     a) An active Document uploaded by the accountant — any file the client can see.
 *     b) An active Document with uploadedByClerkId matching the CLIENT (simulates client-uploaded).
 *   Both cases must show NO delete control on the portal surface.
 *
 * data-testid hooks (must NOT exist on the portal surface — these are the absence assertions):
 *   data-testid="delete-button-{id}"         — MUST NOT EXIST on portal
 *   data-testid="delete-confirm-{id}"        — MUST NOT EXIST on portal
 *   data-testid="archive-section"            — MUST NOT EXIST on portal
 *   data-testid="recover-button-{id}"        — MUST NOT EXIST on portal
 *
 * CS-TS-003: This spec is the mirror obligation — the portal absence is verified here.
 *   The admin presence is verified in apps/admin/e2e/specs/file-deletion.spec.ts.
 * ADR-006: Delete lives in apps/admin ONLY. No delete route, action, or UI in apps/portal.
 *
 * Run:
 *   pnpm --filter portal e2e:run -- --grep 'no-client-delete'
 *
 * // ADR-003 // ADR-005 // ADR-006 // ADR-018 // CS-TS-003 // CS-TS-004 // CS-GEN-003
 * // AC-FILE-004-02 // AC-FILE-004-03
 */

import { test, expect } from "@playwright/test";
import mssqlPkg from "mssql";
import { setupClientSession, clearSession } from "../fixtures/auth.js";

const { ConnectionPool } = mssqlPkg;

const PORTAL_URL = process.env["PORTAL_BASE_URL"] ?? "http://localhost:3000";

// The CLIENT user id used for the mock session and for "client-uploaded" document simulation.
const CLIENT_CLERK_USER_ID = "user_client_e2e_014_nodelete";

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
      "[no-client-delete.spec] DATABASE_URL_ADMIN is not set (required for fixture setup/teardown).",
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

interface PortalNoDeleteFixture {
  engagementId: string;
  engagementRequestId: string;
  userId: string;
  accountantDocumentId: string;   // document uploaded by accountant
  clientDocumentId: string;       // document with uploadedByClerkId = client's clerkUserId
}

// ─── Fixture seed helpers ──────────────────────────────────────────────────────

/**
 * Seed a User + EngagementRequest + Engagement + EngagementParticipant + two Documents:
 *   1. An 'active' document uploaded by the accountant.
 *   2. An 'active' document with uploadedByClerkId = CLIENT (simulates client-uploaded file).
 *
 * DECISION (TASK-014-003): seeds documents directly as 'active' (skips upload UI pipeline).
 * The portal no-delete test is a static-presence absence test — no UI interaction with bytes.
 *
 * The client is linked as an EngagementParticipant so the portal's RLS FILTER
 * (fn_document_access) returns the documents (owner or participant path).
 *
 * // ADR-005: EngagementParticipant row is required for the fn_document_access participant branch.
 */
async function seedFixture(suffix: string): Promise<PortalNoDeleteFixture> {
  const pool = await getPool();

  // 1. Seed User (client identity — clerkUserId = CLIENT_CLERK_USER_ID)
  const userResult = await pool
    .request()
    .input("clerkId", CLIENT_CLERK_USER_ID)
    .input("email", `e2e-no-delete-014-${suffix}@client.e2e.test`)
    .input("role", "CLIENT")
    .query<{ id: string }>(
      `IF NOT EXISTS (SELECT 1 FROM [dbo].[User] WHERE [clerkId] = @clerkId)
         INSERT INTO [dbo].[User] ([clerkId], [email], [role], [createdAt], [updatedAt])
         VALUES (@clerkId, @email, @role, GETUTCDATE(), GETUTCDATE());
       SELECT [id] FROM [dbo].[User] WHERE [clerkId] = @clerkId`,
    );

  const userId = userResult.recordset[0]?.id;
  if (!userId) {
    throw new Error("[no-client-delete.spec] seedFixture: no User id");
  }

  // 2. Seed EngagementRequest
  const reqResult = await pool
    .request()
    .input("firstName", "ClientNoDelete014")
    .input("lastName", "Spec")
    .input("email", `e2e-no-delete-014-${suffix}@client.e2e.test`)
    .query<{ id: string }>(
      `INSERT INTO [dbo].[EngagementRequest]
         ([firstName], [lastName], [email], [status], [createdAt], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES (@firstName, @lastName, @email, 'accepted', GETUTCDATE(), GETUTCDATE())`,
    );

  const engagementRequestId = reqResult.recordset[0]?.id;
  if (!engagementRequestId) {
    throw new Error("[no-client-delete.spec] seedFixture: no EngagementRequest id");
  }

  // 3. Seed Engagement with clientUserId = userId
  const engResult = await pool
    .request()
    .input("engagementRequestId", engagementRequestId)
    .input("clientUserId", userId)
    .query<{ id: string }>(
      `INSERT INTO [dbo].[Engagement]
         ([engagementRequestId], [clientUserId], [status], [createdAt], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES (@engagementRequestId, @clientUserId, 'In Progress', GETUTCDATE(), GETUTCDATE())`,
    );

  const engagementId = engResult.recordset[0]?.id;
  if (!engagementId) {
    throw new Error("[no-client-delete.spec] seedFixture: no Engagement id");
  }

  // 4. Seed EngagementParticipant (ensures fn_document_access participant branch grants access)
  // ADR-005: the RLS FILTER requires either clientUserId match OR EngagementParticipant row.
  await pool
    .request()
    .input("engagementId", engagementId)
    .input("userId", userId)
    .query(
      `IF NOT EXISTS (
         SELECT 1 FROM [dbo].[EngagementParticipant]
         WHERE [engagementId] = @engagementId AND [userId] = @userId
       )
       INSERT INTO [dbo].[EngagementParticipant]
         ([engagementId], [userId], [createdAt])
       VALUES (@engagementId, @userId, GETUTCDATE())`,
    );

  // 5a. Seed an active Document uploaded by accountant (no uploadedByClerkId = client)
  const accountantDocResult = await pool
    .request()
    .input("engagementId", engagementId)
    .input("storageKey", `e2e/014/nodelete/${engagementId.toLowerCase()}/acct-doc-${suffix}.txt`)
    .input("filename", `acct-doc-${suffix}.txt`)
    .query<{ id: string }>(
      `INSERT INTO [dbo].[Document]
         ([engagementId], [storageKey], [originalFilename], [contentType],
          [sizeBytes], [status], [version], [createdAt], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES (@engagementId, @storageKey, @filename, 'text/plain', 42, 'active', 1, GETUTCDATE(), GETUTCDATE())`,
    );

  const accountantDocumentId = accountantDocResult.recordset[0]?.id;
  if (!accountantDocumentId) {
    throw new Error("[no-client-delete.spec] seedFixture: no accountant Document id");
  }

  // 5b. Seed an active Document with uploadedByClerkId = CLIENT (simulates client-uploaded file)
  // AC-FILE-004-02: "including a file the client uploaded" — no delete control even for this.
  const clientDocResult = await pool
    .request()
    .input("engagementId", engagementId)
    .input("storageKey", `e2e/014/nodelete/${engagementId.toLowerCase()}/client-doc-${suffix}.txt`)
    .input("filename", `client-doc-${suffix}.txt`)
    .input("uploadedBy", CLIENT_CLERK_USER_ID)
    .query<{ id: string }>(
      `INSERT INTO [dbo].[Document]
         ([engagementId], [storageKey], [originalFilename], [contentType],
          [sizeBytes], [status], [version], [uploadedBy], [createdAt], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES (@engagementId, @storageKey, @filename, 'text/plain', 24, 'active', 1, @uploadedBy, GETUTCDATE(), GETUTCDATE())`,
    );

  const clientDocumentId = clientDocResult.recordset[0]?.id;
  if (!clientDocumentId) {
    throw new Error("[no-client-delete.spec] seedFixture: no client Document id");
  }

  return {
    engagementId: engagementId.toLowerCase(),
    engagementRequestId: engagementRequestId.toLowerCase(),
    userId,
    accountantDocumentId: accountantDocumentId.toLowerCase(),
    clientDocumentId: clientDocumentId.toLowerCase(),
  };
}

/**
 * Clean up all seeded rows in FK order.
 */
async function cleanupFixture(
  engagementId: string,
  engagementRequestId: string,
): Promise<void> {
  const pool = await getPool();

  await pool
    .request()
    .input("engagementId", engagementId)
    .query(`DELETE FROM [dbo].[EngagementParticipant] WHERE [engagementId] = @engagementId`);

  await pool
    .request()
    .input("engagementId", engagementId)
    .query(`
      DELETE dv FROM [dbo].[DocumentVersion] dv
      INNER JOIN [dbo].[Document] d ON dv.[documentId] = d.[id]
      WHERE d.[engagementId] = @engagementId
    `);

  await pool
    .request()
    .input("engagementId", engagementId)
    .query(`DELETE FROM [dbo].[Document] WHERE [engagementId] = @engagementId`);

  await pool
    .request()
    .input("id", engagementId)
    .query(`DELETE FROM [dbo].[Engagement] WHERE [id] = @id`);

  await pool
    .request()
    .input("id", engagementRequestId)
    .query(`DELETE FROM [dbo].[EngagementRequest] WHERE [id] = @id`);
}

// ─── afterAll: close pool ──────────────────────────────────────────────────────

test.afterAll(async () => {
  await closePool();
});

// ══════════════════════════════════════════════════════════════════════════════
// AC-FILE-004-02 / AC-FILE-004-03 — Portal surface: no delete affordance for any file
//
// Gherkin (BRIEF-014 § Acceptance scenarios — verbatim):
//   Given a client participant of an engagement, including for a file they uploaded
//   When they attempt to delete a file through any portal path
//   Then no deletion occurs and the capability is not available to them
//
//   Given the client surface of an engagement
//   When it is examined for a file-removal capability
//   Then no client-facing path exists to remove a file from the engagement
// ══════════════════════════════════════════════════════════════════════════════

test.describe("[AC-FILE-004-02] [AC-FILE-004-03] no-client-delete — portal surface exposes no delete affordance", () => {
  /**
   * CS-TS-003: The portal absence is the mirror obligation of the admin Delete presence.
   * ADR-006: Delete lives in apps/admin ONLY; apps/portal has no delete action or route.
   *
   * This suite covers both:
   *   - A document uploaded by the accountant (client has no delete).
   *   - A document with uploadedByClerkId = client (client still has no delete — AC-FILE-004-02).
   */

  test.beforeEach(async ({ page, request }) => {
    await setupClientSession(page, request, CLIENT_CLERK_USER_ID); // ADR-003: CLIENT session
  });

  test.afterEach(async ({ page }) => {
    await clearSession(page);
  });

  test("[AC-FILE-004-02] [AC-FILE-004-03] no-client-delete: portal documents view exposes NO delete affordance for accountant-uploaded file", async ({ page }) => {
    test.setTimeout(30_000);

    const suffix = `ac-del-${Date.now()}`;
    const fixture = await seedFixture(suffix);

    try {
      // Given: the client surface of an engagement
      await page.goto(`${PORTAL_URL}/engagements/${fixture.engagementId}/documents`);
      await page.waitForLoadState("networkidle", { timeout: 15_000 });

      // The portal documents panel must be visible
      const portalPanel = page.locator('[data-testid="portal-documents-panel"]');
      await expect(
        portalPanel,
        "[AC-FILE-004-03] portal-documents-panel must be visible",
      ).toBeVisible({ timeout: 15_000 });

      // When it is examined for a file-removal capability (AC-FILE-004-03):
      // There must be NO delete button anywhere on the portal surface.
      // AC-FILE-004-02: for the accountant-uploaded document
      const deleteButtonForAccountantDoc = page.locator(
        `[data-testid="delete-button-${fixture.accountantDocumentId}"]`,
      );
      await expect(
        deleteButtonForAccountantDoc,
        "[AC-FILE-004-02] delete-button MUST NOT be visible on the portal surface (accountant-uploaded doc)",
      ).not.toBeVisible({ timeout: 5_000 });

      // AC-FILE-004-03: No generic delete button anywhere on the page
      const anyDeleteButton = page.locator('[data-testid^="delete-button-"]');
      await expect(
        anyDeleteButton,
        "[AC-FILE-004-03] NO delete-button may exist anywhere on the portal documents page",
      ).toHaveCount(0, { timeout: 5_000 });

      // No archive section (delete is admin-only) — ADR-006
      const archiveSection = page.locator('[data-testid="archive-section"]');
      await expect(
        archiveSection,
        "[AC-FILE-004-03] archive-section MUST NOT exist on the portal surface",
      ).not.toBeVisible({ timeout: 5_000 });

      // No recover button anywhere
      const anyRecoverButton = page.locator('[data-testid^="recover-button-"]');
      await expect(
        anyRecoverButton,
        "[AC-FILE-004-03] NO recover-button may exist on the portal surface",
      ).toHaveCount(0, { timeout: 5_000 });

      console.info(
        "[AC-FILE-004-02] [AC-FILE-004-03] no-client-delete: confirmed NO delete/archive/recover " +
          "affordance on portal surface for accountant-uploaded document.",
      );
    } finally {
      await cleanupFixture(fixture.engagementId, fixture.engagementRequestId);
    }
  });

  test("[AC-FILE-004-02] no-client-delete: portal documents view exposes NO delete affordance — even for a file the client uploaded", async ({ page }) => {
    // AC-FILE-004-02: "including a file the client uploaded"
    // The client uploaded the file (uploadedByClerkId = client's clerkUserId) but
    // still sees NO delete control on the portal surface.
    test.setTimeout(30_000);

    const suffix = `client-del-${Date.now()}`;
    const fixture = await seedFixture(suffix);

    try {
      // Given: a client participant of an engagement, including for a file they uploaded
      await page.goto(`${PORTAL_URL}/engagements/${fixture.engagementId}/documents`);
      await page.waitForLoadState("networkidle", { timeout: 15_000 });

      // The portal documents panel must be visible
      const portalPanel = page.locator('[data-testid="portal-documents-panel"]');
      await expect(
        portalPanel,
        "[AC-FILE-004-02] portal-documents-panel must be visible",
      ).toBeVisible({ timeout: 15_000 });

      // When they attempt to delete a file through any portal path (AC-FILE-004-02):
      // Even for a document the client uploaded (clientDocumentId has uploadedByClerkId = client):
      const deleteButtonForClientDoc = page.locator(
        `[data-testid="delete-button-${fixture.clientDocumentId}"]`,
      );
      await expect(
        deleteButtonForClientDoc,
        "[AC-FILE-004-02] delete-button MUST NOT be visible on the portal surface (client-uploaded doc)",
      ).not.toBeVisible({ timeout: 5_000 });

      // Then: no deletion occurs and the capability is not available to them (AC-FILE-004-02)
      // Complete absence of any delete affordance
      const anyDeleteButton = page.locator('[data-testid^="delete-button-"]');
      await expect(
        anyDeleteButton,
        "[AC-FILE-004-02] NO delete-button may exist anywhere on the portal surface — including for client-uploaded files",
      ).toHaveCount(0, { timeout: 5_000 });

      // No delete-confirm affordance either
      const anyDeleteConfirm = page.locator('[data-testid^="delete-confirm-"]');
      await expect(
        anyDeleteConfirm,
        "[AC-FILE-004-02] NO delete-confirm may exist on the portal surface",
      ).toHaveCount(0, { timeout: 5_000 });

      console.info(
        "[AC-FILE-004-02] no-client-delete: confirmed NO delete affordance on portal surface — " +
          `not for accountant-uploaded (${fixture.accountantDocumentId}), ` +
          `not for client-uploaded (${fixture.clientDocumentId}).`,
      );
    } finally {
      await cleanupFixture(fixture.engagementId, fixture.engagementRequestId);
    }
  });
});
