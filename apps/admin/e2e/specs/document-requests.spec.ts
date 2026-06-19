/**
 * apps/admin/e2e/specs/document-requests.spec.ts
 *
 * Tier-6 e2e — Accountant document-request authoring.
 *
 * Acceptance criteria covered (EPIC-007):
 *   AC-FILE-007-01 — accountant creates a document request in an engagement with a free-text label
 *
 * Gherkin binding (prose-bound until Cucumber tooling lands — CLAUDE.md § Executable gherkin tooling):
 *   Scenario: Accountant creates a labeled document request
 *   (verbatim from .planning/EPIC-007-initial-document-upload-checklist.md § Acceptance scenarios)
 *
 * EPIC-007 § Acceptance scenario (verbatim):
 *   AC-FILE-007-01: "Given the accountant in an engagement
 *                    When she creates a document request with a free-text label
 *                    Then a labeled document request is created in that engagement"
 *
 * Stack: admin container at http://localhost:13001 (ADMIN_PORT env), AUTH_PROVIDER=mock.
 *
 * data-* hooks (TASK-007-005 — must match DocumentRequestEditor.tsx exactly):
 *   data-testid="document-request-editor"      — root container
 *   data-testid="document-request-label-input" — label text input
 *   data-testid="add-document-request-button"  — submit button
 *   data-testid="request-list"                 — list of existing requests
 *   data-testid="document-request-item-{id}"   — each request row (prefix-matched in specs)
 *
 * DB fixtures (admin pool — RLS-exempt, teardown only):
 *   The spec seeds a minimal Engagement row + related EngagementRequest row to provide
 *   a valid engagementId for the route param. Cleaned up in afterAll.
 *
 * Run:
 *   pnpm --filter admin e2e:run -- --grep 'document.request'
 *
 * ADR-006: Document-request authoring is admin-only; clients never reach this surface.
 * ADR-005: Role is set server-side via the mock session cookie; never from client input.
 * ADR-012: Tier-6 e2e.
 */

import { test, expect } from "@playwright/test";
import mssqlPkg from "mssql";
import { setupAccountantSession, clearSession } from "../fixtures/auth.js";

const { ConnectionPool, UniqueIdentifier } = mssqlPkg;

const ADMIN_PORT = process.env["ADMIN_PORT"] ?? "3001";
const ADMIN_URL = process.env["ADMIN_BASE_URL"] ?? `http://localhost:${ADMIN_PORT}`;

// ─── Unique content helper ─────────────────────────────────────────────────────

function uniqueLabel(prefix: string): string {
  return `${prefix} — e2e ${Date.now()}`;
}

// ─── DB helpers (admin pool — for fixture setup/teardown only) ─────────────────

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
      "[document-requests.spec] DATABASE_URL_ADMIN is not set (required for fixture setup/teardown).",
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

/**
 * Seed a minimal EngagementRequest + Engagement row for the e2e test.
 * Returns the engagementId (lowercase GUID).
 *
 * The Engagement row requires an EngagementRequest FK. We seed the request first,
 * then the engagement. Both are cleaned up in teardown.
 *
 * DECISION (TASK-007-005): clientUserId is NULL (DECISION-A — nullable until sign-up).
 * The document-request authoring test does not require a real client User row.
 * The accountant's server action verifies her OWN session identity (getAccountantIdentity),
 * not the client's — so NULL clientUserId is fine for the authoring e2e.
 */
async function seedEngagement(data: {
  email: string;
}): Promise<{ engagementId: string; engagementRequestId: string }> {
  const pool = await getPool();

  // 1. Seed EngagementRequest
  const reqResult = await pool
    .request()
    .input("firstName", "E2E")
    .input("lastName", "DocumentRequestSpec")
    .input("email", data.email)
    .query<{ id: string }>(
      `INSERT INTO [dbo].[EngagementRequest]
         ([firstName], [lastName], [email], [status], [createdAt], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES
         (@firstName, @lastName, @email, 'accepted', GETUTCDATE(), GETUTCDATE())`,
    );

  const reqRow = reqResult.recordset[0];
  if (!reqRow) {
    throw new Error("[document-requests.spec] seedEngagement: no EngagementRequest id returned");
  }
  const engagementRequestId = reqRow.id;

  // 2. Seed Engagement — clientUserId is NULL per DECISION-A (nullable until client sign-up).
  // The document-request authoring test only needs a valid engagementId FK to insert against.
  const engResult = await pool
    .request()
    .input("engagementRequestId", UniqueIdentifier, engagementRequestId)
    .query<{ id: string }>(
      `INSERT INTO [dbo].[Engagement]
         ([engagementRequestId], [status], [createdAt], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES
         (@engagementRequestId, 'New', GETUTCDATE(), GETUTCDATE())`,
    );

  const engRow = engResult.recordset[0];
  if (!engRow) {
    throw new Error("[document-requests.spec] seedEngagement: no Engagement id returned");
  }

  return {
    engagementId: engRow.id.toLowerCase(),
    engagementRequestId: engagementRequestId.toLowerCase(),
  };
}

/**
 * Clean up document requests, engagement, and engagement request seeded by this spec.
 */
async function cleanupEngagement(
  engagementId: string,
  engagementRequestId: string,
): Promise<void> {
  const pool = await getPool();

  // 1. Delete DocumentRequest rows for this engagement
  await pool
    .request()
    .input("engagementId", UniqueIdentifier, engagementId)
    .query(`DELETE FROM [dbo].[DocumentRequest] WHERE [engagementId] = @engagementId`);

  // 2. Delete Engagement
  await pool
    .request()
    .input("id", UniqueIdentifier, engagementId)
    .query(`DELETE FROM [dbo].[Engagement] WHERE [id] = @id`);

  // 3. Delete EngagementRequest
  await pool
    .request()
    .input("id", UniqueIdentifier, engagementRequestId)
    .query(`DELETE FROM [dbo].[EngagementRequest] WHERE [id] = @id`);
}

test.afterAll(async () => {
  await closePool();
});

// ═══════════════════════════════════════════════════════════════════════════════
// AC-FILE-007-01 — Accountant creates a labeled document request
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("[AC-FILE-007-01] accountant creates a labeled document request within an engagement", () => {
  /**
   * Gherkin (EPIC-007 § Acceptance scenarios — verbatim):
   * Given the accountant in an engagement
   * When she creates a document request with a free-text label
   * Then a labeled document request is created in that engagement
   */

  test.beforeEach(async ({ page, request }) => {
    await setupAccountantSession(page, request);
  });

  test.afterEach(async ({ page }) => {
    await clearSession(page);
  });

  test("[AC-FILE-007-01] accountant creates a labeled document request and it appears in the list", async ({ page }) => {
    // Seed a real engagement so we have a valid engagementId
    const { engagementId, engagementRequestId } = await seedEngagement({
      email: `e2e-docreq-${Date.now()}@example.test`,
    });

    try {
      // Given: the accountant in an engagement
      // Navigate to the document-requests authoring page for this engagement
      await page.goto(`${ADMIN_URL}/engagements/${engagementId}/document-requests`);

      // Wait for the editor to load
      const editor = page.locator('[data-testid="document-request-editor"]');
      await expect(editor).toBeVisible({ timeout: 15_000 });

      // When: she creates a document request with a free-text label
      const labelInput = page.locator('[data-testid="document-request-label-input"]');
      await expect(labelInput).toBeVisible();

      const label = uniqueLabel("[AC-FILE-007-01] 2023 W-2 form");
      await labelInput.fill(label);

      const addButton = page.locator('[data-testid="add-document-request-button"]');
      await expect(addButton).toBeVisible();
      await addButton.click();

      // Then: a labeled document request is created in that engagement
      // The new request appears in the list
      await expect(
        page.locator('[data-testid^="document-request-item-"]').first(),
      ).toBeVisible({ timeout: 10_000 });

      await expect(
        page.locator('[data-testid^="document-request-item-"]').first(),
      ).toHaveText(new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

      // Success banner is shown
      await expect(
        page.locator('[role="status"]'),
      ).toHaveText(/document request added/i, { timeout: 10_000 });

      // Then: the label input is cleared (ready for next entry)
      await expect(labelInput).toHaveValue("");

      // Navigate away and back — the request persists (revalidatePath wrote it)
      await page.goto(`${ADMIN_URL}/`);
      await page.goto(`${ADMIN_URL}/engagements/${engagementId}/document-requests`);

      await expect(editor).toBeVisible({ timeout: 15_000 });

      // The document request should still appear after reload
      await expect(
        page.locator('[data-testid="request-list"]'),
      ).toBeVisible({ timeout: 10_000 });

      await expect(
        page.locator('[data-testid^="document-request-item-"]').first(),
      ).toContainText(label, { timeout: 10_000 });
    } finally {
      // Cleanup — always delete seeded rows even if the test fails
      await cleanupEngagement(engagementId, engagementRequestId);
    }
  });

  test("[AC-FILE-007-01] label validation: empty label rejected client-side without calling the server", async ({ page }) => {
    // Seed a real engagement
    const { engagementId, engagementRequestId } = await seedEngagement({
      email: `e2e-docreq-empty-${Date.now()}@example.test`,
    });

    try {
      await page.goto(`${ADMIN_URL}/engagements/${engagementId}/document-requests`);

      const editor = page.locator('[data-testid="document-request-editor"]');
      await expect(editor).toBeVisible({ timeout: 15_000 });

      // Click Add with empty label
      const addButton = page.locator('[data-testid="add-document-request-button"]');
      await addButton.click();

      // Error banner should appear (use first() — Next.js route announcer also has role="alert")
      await expect(
        page.locator('[role="alert"]').first(),
      ).toBeVisible({ timeout: 5_000 });
      await expect(
        page.locator('[role="alert"]').first(),
      ).toHaveText(/required|empty/i);

      // No request in the list
      await expect(
        page.locator('[data-testid^="document-request-item-"]'),
      ).toHaveCount(0);
    } finally {
      await cleanupEngagement(engagementId, engagementRequestId);
    }
  });

  test("[security][ADR-006] page requires ACCOUNTANT auth — CLIENT session is redirected away", async ({ page, request }) => {
    // Clear accountant session set by beforeEach
    await clearSession(page);

    // Seed a real engagement
    const { engagementId, engagementRequestId } = await seedEngagement({
      email: `e2e-docreq-client-${Date.now()}@example.test`,
    });

    try {
      // Set up a CLIENT session — admin middleware redirects CLIENT sessions away from admin
      // (mirrors [AC-DOOR-006-04] CLIENT session rejected from inbox — request-inbox.spec.ts)
      const { setupClientSession } = await import("../fixtures/auth.js");
      await setupClientSession(page, request);

      // Track any redirect response from the middleware
      let redirectSeen = false;
      page.on("response", (response) => {
        if (response.status() === 307 || response.status() === 308 || response.status() === 302) {
          redirectSeen = true;
        }
      });

      // Navigate with waitUntil: "commit" so we can inspect the final URL before page load
      await page.goto(
        `${ADMIN_URL}/engagements/${engagementId}/document-requests`,
        { waitUntil: "commit" },
      );

      const finalUrl = new URL(page.url());
      const isOnDocRequestPath =
        finalUrl.pathname === `/engagements/${engagementId}/document-requests`;

      // Then: the CLIENT is NOT served the document-requests authoring page.
      // The admin middleware redirects CLIENTs to portal (ADR-010) OR the
      // page guard renders the "Authentication required" error UI.
      expect(
        redirectSeen || !isOnDocRequestPath,
        "CLIENT must NOT be served the admin document-requests authoring page",
      ).toBe(true);

      // The editor must NOT be visible to the CLIENT
      await expect(
        page.locator('[data-testid="document-request-editor"]'),
      ).not.toBeVisible({ timeout: 5_000 });
    } finally {
      await cleanupEngagement(engagementId, engagementRequestId);
    }
  });
});
