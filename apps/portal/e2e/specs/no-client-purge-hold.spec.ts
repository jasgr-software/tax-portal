/**
 * apps/portal/e2e/specs/no-client-purge-hold.spec.ts
 *
 * Tier-6 e2e (absence) — Portal surface no-client-purge/hold/lift absence proof.
 *
 * TASK-015-004 / BRIEF-015 / EPIC-015 — AC-FILE-013-02: purge is accountant/admin-only;
 * no client-facing path initiates or requests a purge, a hold, or a lift.
 *
 * This spec proves the PORTAL surface (Client Portal) exposes NO purge/hold/lift capability
 * for any engagement — including one the client participates in / uploaded to. This is the
 * portal half of the "both-ways" no-client-purge/hold proof required by BRIEF-015 (mirroring
 * EPIC-014's no-client-delete trap and EPIC-013's both-party trap):
 *   1. Server-side: purgeEngagementAction / placeLegalHoldAction / liftLegalHoldAction reject
 *      non-ACCOUNTANT before any write, and the RLS no-client-purge policy holds the CLIENT branch
 *      (proven in apps/admin retention-actions.test.ts + packages/db purge.rls.test.ts — tier-3).
 *   2. Portal surface (this spec): the client engagement/documents view exposes NO purge, hold,
 *      or lift affordance for any engagement, including one the client uploaded to.
 *
 * Acceptance criteria covered:
 *   AC-FILE-013-02 — Purge is an accountant/admin-only action; no client-facing path initiates
 *                    or requests a purge. (By extension: no hold/lift affordance either — the
 *                    whole RetentionPanel surface is admin-only, ADR-006.)
 *
 * Gherkin binding (BRIEF-015 § Acceptance scenarios — verbatim):
 *
 *   AC-FILE-013-02:
 *     Given the client surface
 *     When it is examined for a purge capability
 *     Then no client-facing path initiates or requests a purge; purge is accountant/admin-only
 *
 * Stack: portal container at http://localhost:3000, AUTH_PROVIDER=mock.
 *
 * Fixture strategy:
 *   Seeds an Engagement (completedAt ~8 years in the past — would be purge-eligible on the
 *   admin surface) with:
 *     a) An active Document uploaded by the accountant — any file the client can see.
 *     b) An active Document with uploadedByClerkId = CLIENT (simulates client-uploaded).
 *   The client is linked as an EngagementParticipant so the portal's RLS FILTER returns the
 *   engagement/documents. In every case the portal surface must show NO purge/hold/lift control.
 *
 *   DECISION (TASK-015-004): the engagement is seeded purge-eligible (window elapsed) on purpose —
 *   even an engagement that the accountant COULD purge exposes no purge/hold/lift affordance on the
 *   portal surface, because the entire RetentionPanel lives only in apps/admin (ADR-006 / CS-TS-003).
 *
 * data-testid hooks (must NOT exist on the portal surface — these are the absence assertions):
 *   data-testid="retention-panel"             — MUST NOT EXIST on portal
 *   data-testid="legal-hold-place"            — MUST NOT EXIST on portal
 *   data-testid^="legal-hold-lift-"           — MUST NOT EXIST on portal
 *   data-testid^="active-hold-item-"          — MUST NOT EXIST on portal
 *   data-testid="active-holds-list"           — MUST NOT EXIST on portal
 *   data-testid="purge-button"                — MUST NOT EXIST on portal
 *   data-testid="purge-confirm-input"         — MUST NOT EXIST on portal
 *   data-testid="purge-confirm-submit"        — MUST NOT EXIST on portal
 *   data-testid="purge-eligibility-reason"    — MUST NOT EXIST on portal
 *
 * CS-TS-003: This spec is the mirror obligation — the portal absence is verified here.
 *   The admin presence is verified in apps/admin/e2e/specs/purge-legal-hold.spec.ts.
 * ADR-006: Purge + legal hold live in apps/admin ONLY. No purge/hold route, action, or UI in apps/portal.
 * ADR-010: cross-app — the no-client absence is exercised on the portal surface.
 *
 * Run:
 *   pnpm --filter portal e2e:run -- --grep 'no-client-purge-hold'
 *
 * // ADR-003 // ADR-005 // ADR-006 // ADR-010 // ADR-018 // CS-TS-003 // CS-TS-004 // CS-GEN-003
 * // AC-FILE-013-02
 */

import { test, expect } from "@playwright/test";
import mssqlPkg from "mssql";
import { setupClientSession, clearSession } from "../fixtures/auth.js";

const { ConnectionPool } = mssqlPkg;

const PORTAL_URL = process.env["PORTAL_BASE_URL"] ?? "http://localhost:3000";

// The CLIENT user id used for the mock session and for "client-uploaded" document simulation.
const CLIENT_CLERK_USER_ID = "user_client_e2e_015_nopurge";

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
      "[no-client-purge-hold.spec] DATABASE_URL_ADMIN is not set (required for fixture setup/teardown).",
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

interface PortalNoPurgeFixture {
  engagementId: string;
  engagementRequestId: string;
  userId: string;
  accountantDocumentId: string;   // document uploaded by accountant
  clientDocumentId: string;       // document with uploadedByClerkId = client's clerkUserId
}

// ─── Fixture seed helpers ──────────────────────────────────────────────────────

/**
 * CompletedAt ~8 years in the past so the engagement is purge-eligible on the admin surface.
 * The portal absence holds regardless of eligibility — but seeding it eligible removes any
 * "the control is just conditionally hidden because it isn't eligible" loophole (ADR-006).
 */
function expiredCompletedAt(): Date {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - 8);
  return d;
}

/**
 * Seed a User + EngagementRequest + completed Engagement + EngagementParticipant + two Documents:
 *   1. An 'active' document uploaded by the accountant.
 *   2. An 'active' document with uploadedByClerkId = CLIENT (simulates client-uploaded file).
 *
 * DECISION (TASK-015-004): seeds documents directly as 'active' (skips upload UI pipeline,
 *   BUG-008-001). The portal no-purge/hold test is a static-presence absence test — no UI
 *   interaction with bytes. Mirrors apps/portal/e2e/specs/no-client-delete.spec.ts exactly.
 *
 * The client is linked as an EngagementParticipant so the portal's RLS FILTER
 * (fn_document_access) returns the documents (owner or participant path).
 *
 * // ADR-005: EngagementParticipant row is required for the fn_document_access participant branch.
 */
async function seedFixture(suffix: string): Promise<PortalNoPurgeFixture> {
  const pool = await getPool();

  // 1. Seed User (client identity — clerkUserId = CLIENT_CLERK_USER_ID)
  const userResult = await pool
    .request()
    .input("clerkId", CLIENT_CLERK_USER_ID)
    .input("email", `e2e-no-purge-015-${suffix}@client.e2e.test`)
    .input("role", "CLIENT")
    .query<{ id: string }>(
      `IF NOT EXISTS (SELECT 1 FROM [dbo].[User] WHERE [clerkId] = @clerkId)
         INSERT INTO [dbo].[User] ([clerkId], [email], [role], [createdAt], [updatedAt])
         VALUES (@clerkId, @email, @role, GETUTCDATE(), GETUTCDATE());
       SELECT [id] FROM [dbo].[User] WHERE [clerkId] = @clerkId`,
    );

  const userId = userResult.recordset[0]?.id;
  if (!userId) {
    throw new Error("[no-client-purge-hold.spec] seedFixture: no User id");
  }

  // 2. Seed EngagementRequest
  const reqResult = await pool
    .request()
    .input("firstName", "ClientNoPurge015")
    .input("lastName", "Spec")
    .input("email", `e2e-no-purge-015-${suffix}@client.e2e.test`)
    .query<{ id: string }>(
      `INSERT INTO [dbo].[EngagementRequest]
         ([firstName], [lastName], [email], [status], [createdAt], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES (@firstName, @lastName, @email, 'accepted', GETUTCDATE(), GETUTCDATE())`,
    );

  const engagementRequestId = reqResult.recordset[0]?.id;
  if (!engagementRequestId) {
    throw new Error("[no-client-purge-hold.spec] seedFixture: no EngagementRequest id");
  }

  // 3. Seed a *completed* Engagement (completedAt ~8 years ago → purge-eligible on admin).
  const engResult = await pool
    .request()
    .input("engagementRequestId", engagementRequestId)
    .input("clientUserId", userId)
    .input("completedAt", expiredCompletedAt())
    .query<{ id: string }>(
      `INSERT INTO [dbo].[Engagement]
         ([engagementRequestId], [clientUserId], [status], [completedAt], [createdAt], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES (@engagementRequestId, @clientUserId, 'Complete', @completedAt, GETUTCDATE(), GETUTCDATE())`,
    );

  const engagementId = engResult.recordset[0]?.id;
  if (!engagementId) {
    throw new Error("[no-client-purge-hold.spec] seedFixture: no Engagement id");
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

  // 5a. Seed an active Document uploaded by accountant (no uploadedBy = client)
  const accountantDocResult = await pool
    .request()
    .input("engagementId", engagementId)
    .input("storageKey", `e2e/015/nopurge/${engagementId.toLowerCase()}/acct-doc-${suffix}.txt`)
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
    throw new Error("[no-client-purge-hold.spec] seedFixture: no accountant Document id");
  }

  // 5b. Seed an active Document with uploadedBy = CLIENT (simulates client-uploaded file)
  // AC-FILE-013-02: "including one the client participates in / uploaded to" — no purge/hold control even for this.
  const clientDocResult = await pool
    .request()
    .input("engagementId", engagementId)
    .input("storageKey", `e2e/015/nopurge/${engagementId.toLowerCase()}/client-doc-${suffix}.txt`)
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
    throw new Error("[no-client-purge-hold.spec] seedFixture: no client Document id");
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
    .query(`DELETE FROM [dbo].[LegalHold] WHERE [engagementId] = @engagementId`);

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
// AC-FILE-013-02 — Portal surface: no purge/hold/lift affordance for any engagement
//
// Gherkin (BRIEF-015 § Acceptance scenarios — verbatim):
//   Given the client surface
//   When it is examined for a purge capability
//   Then no client-facing path initiates or requests a purge; purge is accountant/admin-only
// ══════════════════════════════════════════════════════════════════════════════

test.describe("[AC-FILE-013-02] no-client-purge-hold — portal surface exposes no purge/hold/lift affordance", () => {
  /**
   * CS-TS-003: The portal absence is the mirror obligation of the admin RetentionPanel presence.
   * ADR-006: Purge + legal hold live in apps/admin ONLY; apps/portal has no purge/hold action or route.
   *
   * This suite covers both:
   *   - A document uploaded by the accountant (client has no purge/hold).
   *   - A document with uploadedBy = client (client still has no purge/hold — AC-FILE-013-02).
   */

  test.beforeEach(async ({ page, request }) => {
    await setupClientSession(page, request, CLIENT_CLERK_USER_ID); // ADR-003: CLIENT session
  });

  test.afterEach(async ({ page }) => {
    await clearSession(page);
  });

  test("[AC-FILE-013-02] no-client-purge-hold: portal documents view exposes NO purge/hold/lift affordance (accountant-uploaded file)", async ({ page }) => {
    test.setTimeout(30_000);

    const suffix = `ac-purge-${Date.now()}`;
    const fixture = await seedFixture(suffix);

    try {
      // Given: the client surface of an engagement (purge-eligible on the admin surface).
      await page.goto(`${PORTAL_URL}/engagements/${fixture.engagementId}/documents`);
      await page.waitForLoadState("networkidle", { timeout: 15_000 });

      // The portal documents panel must be visible (the client CAN see the engagement).
      const portalPanel = page.locator('[data-testid="portal-documents-panel"]');
      await expect(
        portalPanel,
        "[AC-FILE-013-02] portal-documents-panel must be visible",
      ).toBeVisible({ timeout: 15_000 });

      // When it is examined for a purge/hold capability (AC-FILE-013-02):
      // The entire RetentionPanel surface must be ABSENT on the portal.
      const retentionPanel = page.locator('[data-testid="retention-panel"]');
      await expect(
        retentionPanel,
        "[AC-FILE-013-02] retention-panel MUST NOT exist on the portal surface",
      ).toHaveCount(0, { timeout: 5_000 });

      // No purge controls anywhere.
      await expect(
        page.locator('[data-testid="purge-button"]'),
        "[AC-FILE-013-02] purge-button MUST NOT exist on the portal surface",
      ).toHaveCount(0, { timeout: 5_000 });
      await expect(
        page.locator('[data-testid="purge-confirm-input"]'),
        "[AC-FILE-013-02] purge-confirm-input MUST NOT exist on the portal surface",
      ).toHaveCount(0, { timeout: 5_000 });
      await expect(
        page.locator('[data-testid="purge-confirm-submit"]'),
        "[AC-FILE-013-02] purge-confirm-submit MUST NOT exist on the portal surface",
      ).toHaveCount(0, { timeout: 5_000 });
      await expect(
        page.locator('[data-testid="purge-eligibility-reason"]'),
        "[AC-FILE-013-02] purge-eligibility-reason MUST NOT exist on the portal surface",
      ).toHaveCount(0, { timeout: 5_000 });

      // No legal-hold controls anywhere.
      await expect(
        page.locator('[data-testid="legal-hold-place"]'),
        "[AC-FILE-013-02] legal-hold-place MUST NOT exist on the portal surface",
      ).toHaveCount(0, { timeout: 5_000 });
      await expect(
        page.locator('[data-testid="active-holds-list"]'),
        "[AC-FILE-013-02] active-holds-list MUST NOT exist on the portal surface",
      ).toHaveCount(0, { timeout: 5_000 });
      await expect(
        page.locator('[data-testid^="legal-hold-lift-"]'),
        "[AC-FILE-013-02] NO legal-hold-lift control may exist on the portal surface",
      ).toHaveCount(0, { timeout: 5_000 });
      await expect(
        page.locator('[data-testid^="active-hold-item-"]'),
        "[AC-FILE-013-02] NO active-hold-item may exist on the portal surface",
      ).toHaveCount(0, { timeout: 5_000 });

      console.info(
        "[AC-FILE-013-02] no-client-purge-hold: confirmed NO purge/hold/lift affordance on the " +
          "portal surface for an accountant-uploaded document on a purge-eligible engagement.",
      );
    } finally {
      await cleanupFixture(fixture.engagementId, fixture.engagementRequestId);
    }
  });

  test("[AC-FILE-013-02] no-client-purge-hold: portal documents view exposes NO purge/hold/lift affordance — even for a file the client uploaded", async ({ page }) => {
    // AC-FILE-013-02: "including one the client participates in / uploaded to"
    // The client uploaded the file (uploadedBy = client's clerkUserId) but still sees
    // NO purge/hold/lift control on the portal surface.
    test.setTimeout(30_000);

    const suffix = `client-purge-${Date.now()}`;
    const fixture = await seedFixture(suffix);

    try {
      // Given: a client participant of an engagement, including for a file they uploaded.
      await page.goto(`${PORTAL_URL}/engagements/${fixture.engagementId}/documents`);
      await page.waitForLoadState("networkidle", { timeout: 15_000 });

      const portalPanel = page.locator('[data-testid="portal-documents-panel"]');
      await expect(
        portalPanel,
        "[AC-FILE-013-02] portal-documents-panel must be visible",
      ).toBeVisible({ timeout: 15_000 });

      // When it is examined for a purge/hold capability (AC-FILE-013-02):
      // Complete absence of the entire purge/hold surface — even though the client uploaded a file.
      await expect(
        page.locator('[data-testid="retention-panel"]'),
        "[AC-FILE-013-02] retention-panel MUST NOT exist on the portal surface (client-uploaded doc)",
      ).toHaveCount(0, { timeout: 5_000 });
      await expect(
        page.locator('[data-testid="purge-button"]'),
        "[AC-FILE-013-02] purge-button MUST NOT exist — including for client-uploaded files",
      ).toHaveCount(0, { timeout: 5_000 });
      await expect(
        page.locator('[data-testid="purge-confirm-submit"]'),
        "[AC-FILE-013-02] purge-confirm-submit MUST NOT exist on the portal surface",
      ).toHaveCount(0, { timeout: 5_000 });
      await expect(
        page.locator('[data-testid="legal-hold-place"]'),
        "[AC-FILE-013-02] legal-hold-place MUST NOT exist — including for client-uploaded files",
      ).toHaveCount(0, { timeout: 5_000 });
      await expect(
        page.locator('[data-testid^="legal-hold-lift-"]'),
        "[AC-FILE-013-02] NO legal-hold-lift control may exist on the portal surface",
      ).toHaveCount(0, { timeout: 5_000 });

      console.info(
        "[AC-FILE-013-02] no-client-purge-hold: confirmed NO purge/hold/lift affordance on the " +
          `portal surface — not for accountant-uploaded (${fixture.accountantDocumentId}), ` +
          `not for client-uploaded (${fixture.clientDocumentId}).`,
      );
    } finally {
      await cleanupFixture(fixture.engagementId, fixture.engagementRequestId);
    }
  });
});
