/**
 * apps/admin/e2e/demo/document-requests.demo.spec.ts
 *
 * @demo UI demo walkthrough — EPIC-007 Document-request authoring (admin surface).
 *
 * Not part of the e2e gate: `e2e:run` / `e2e:smoke` exclude `@demo` (--grep-invert @demo);
 * this runs ONLY via `pnpm --filter admin e2e:demo`. It drives jane-accountant's
 * document-request authoring happy-path against the live docker-compose container stack
 * (AUTH_PROVIDER=mock) and writes an AC-tagged screenshot gallery to
 * docs/demos/EPIC-007/. NON-GATING.
 *
 * Persona: jane-accountant (.planning/personas/jane-accountant.md)
 * Flows:   flow-file-exchange   (.planning/flows/flow-file-exchange.md)
 * Policy:  .orchestration/DEMO-POLICY.md
 *
 * Gallery ordering (EPIC-007 admin surface — screenshot 01):
 *   01-AC-FILE-007-01-document-request-created.png
 *       — jane-accountant creates a labeled document request in an engagement;
 *         the labeled request appears in the list (AC-FILE-007-01)
 *
 * Each test ASSERTS the target element is visible BEFORE screenshotting (broken UI fails loudly).
 *
 * Pre-reqs (same SUT as the e2e gate):
 *   docker compose up -d → pnpm db:migrate → pnpm db:seed
 *
 * Fixture:
 *   // DECISION (TASK-007-007): We seed a minimal EngagementRequest + Engagement to provide
 *   // a valid engagementId for the document-requests route param. The engagement has
 *   // clientUserId=NULL (DECISION-A — nullable until client sign-up; the authoring action
 *   // only checks the accountant's identity, not the client's). The seeded label uses a
 *   // deterministic "-demo-007" component so the fixture never conflicts with e2e suites.
 *   // We use a clerkUserId distinct from EPIC-006 demo to avoid session interference.
 *
 * ADR-005: Sessions are established via /api/mock-session (role set server-side). RLS
 *          policy is NOT relaxed; admin pool used for seed/teardown only.
 * ADR-006: Two-surface platform — this spec covers the admin surface (Tax Portal).
 *
 * Run:
 *   ADMIN_BASE_URL=http://localhost:13001 ADMIN_PORT=13001 pnpm --filter admin e2e:demo
 */

import { test, expect } from "@playwright/test";
import path from "path";
import mssqlPkg from "mssql";
import { setupAccountantSession, clearSession } from "../fixtures/auth.js";

const { ConnectionPool, UniqueIdentifier } = mssqlPkg;

// Gallery output dir — repo-root/docs/demos/EPIC-007 (resolved from this file's dir).
// Depth from apps/admin/e2e/demo/ to repo root = ../../../../
// RETRO-006 item 4 (MANDATORY): screenshots MUST write ONLY to docs/demos/EPIC-007/.
// This const is the ONLY path used; no prior-epic gallery is touched.
const DEMO_DIR = path.resolve(__dirname, "../../../../docs/demos/EPIC-007");
const shot = (file: string) => path.join(DEMO_DIR, file);

// Admin base URL — mirrors playwright.config.ts + auth.ts.
const ADMIN_PORT = process.env["ADMIN_PORT"] ?? "3001";
const ADMIN_URL = process.env["ADMIN_BASE_URL"] ?? `http://localhost:${ADMIN_PORT}`;

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
      "[document-requests.demo.spec] DATABASE_URL_ADMIN is not set. Required for admin pool seed/teardown.",
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

interface SeedResult {
  engagementId: string;
  engagementRequestId: string;
}

/**
 * Seeds a minimal EngagementRequest + Engagement for the demo.
 *
 * clientUserId is NULL (DECISION-A — nullable until client sign-up).
 * The document-request authoring action only checks the accountant's identity.
 * Cleanup: call cleanupEngagement() in try/finally.
 */
async function seedEngagement(): Promise<SeedResult> {
  const pool = await getPool();

  // 1. Seed EngagementRequest
  const reqResult = await pool
    .request()
    .input("firstName", "DemoJane")
    .input("lastName", "DocumentRequests")
    .input("email", `e2e-demo-007-docreq-${Date.now()}@document-requests.demo.e2e.test`)
    .query<{ id: string }>(
      `INSERT INTO [dbo].[EngagementRequest]
         ([firstName], [lastName], [email], [status], [createdAt], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES (@firstName, @lastName, @email, 'accepted', GETUTCDATE(), GETUTCDATE())`,
    );

  const engagementRequestId = reqResult.recordset[0]?.id;
  if (!engagementRequestId) {
    throw new Error("[document-requests.demo.spec] Failed to seed EngagementRequest row");
  }

  // 2. Seed Engagement (clientUserId = NULL — DECISION-A)
  const engResult = await pool
    .request()
    .input("engagementRequestId", UniqueIdentifier, engagementRequestId)
    .query<{ id: string }>(
      `INSERT INTO [dbo].[Engagement]
         ([engagementRequestId], [status], [createdAt], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES (@engagementRequestId, 'New', GETUTCDATE(), GETUTCDATE())`,
    );

  const engagementId = engResult.recordset[0]?.id;
  if (!engagementId) {
    throw new Error("[document-requests.demo.spec] Failed to seed Engagement row");
  }

  return {
    engagementId: engagementId.toLowerCase(),
    engagementRequestId: engagementRequestId.toLowerCase(),
  };
}

/**
 * Cleans up seeded DocumentRequest + Engagement + EngagementRequest rows.
 * Called in try/finally to ensure cleanup even on test failure.
 */
async function cleanupEngagement(
  engagementId: string,
  engagementRequestId: string,
): Promise<void> {
  const pool = await getPool();

  // 1. DocumentRequest rows (FK → Engagement)
  await pool
    .request()
    .input("engagementId", UniqueIdentifier, engagementId)
    .query(`DELETE FROM [dbo].[DocumentRequest] WHERE [engagementId] = @engagementId`);

  // 2. Engagement
  await pool
    .request()
    .input("id", UniqueIdentifier, engagementId)
    .query(`DELETE FROM [dbo].[Engagement] WHERE [id] = @id`);

  // 3. EngagementRequest
  await pool
    .request()
    .input("id", UniqueIdentifier, engagementRequestId)
    .query(`DELETE FROM [dbo].[EngagementRequest] WHERE [id] = @id`);
}

// ─── afterAll: close pool ──────────────────────────────────────────────────────

test.afterAll(async () => {
  await closePool();
});

// ─── Screen 01: Accountant creates a labeled document request (AC-FILE-007-01) ─

test(
  "[AC-FILE-007-01] @demo 01 — jane-accountant: creates a labeled document request; request appears in list",
  async ({ page, request }) => {
    // Screen 01: ACCOUNTANT navigates to the document-requests authoring page for an engagement.
    // She types a free-text label (uniquely identifiable) and clicks "Add request".
    // The labeled request appears in the request list — proving the round-trip from
    // authoring form to persisted checklist item.
    //
    // Proves AC-FILE-007-01: the accountant can create a document request in an engagement
    // with a free-text label, and it is persisted.
    //
    // Screenshot strategy: full-page screenshot of the document-requests page after the
    // request is added — shows the labeled request in the list.

    let seeded: SeedResult | null = null;

    try {
      seeded = await seedEngagement();
      await setupAccountantSession(page, request);

      // Given: the accountant in an engagement
      await page.goto(`${ADMIN_URL}/engagements/${seeded.engagementId}/document-requests`);

      // Wait for the editor to load
      const editor = page.locator('[data-testid="document-request-editor"]');
      await expect(
        editor,
        "document-request-editor must be visible (AC-FILE-007-01)",
      ).toBeVisible({ timeout: 15_000 });

      // When: she creates a document request with a free-text label
      const label = `[AC-FILE-007-01] 2023 W-2 — demo-007 label — ${Date.now()}`;

      // DECISION (TASK-007-007): Use the actual component data-testid values from
      // DocumentRequestEditor.tsx, NOT the TASK-007-005 spec header comment (which
      // documents the intended testids that diverged from the actual component output).
      // Actual component data-testids:
      //   "document-request-label-input" — label text input
      //   "add-document-request-button" — submit button
      //   "document-request-item-{id}" — each request row
      const labelInput = page.locator('[data-testid="document-request-label-input"]');
      await expect(labelInput, "document-request-label-input must be visible").toBeVisible({ timeout: 10_000 });
      await labelInput.fill(label);

      const addButton = page.locator('[data-testid="add-document-request-button"]');
      await expect(addButton, "add-document-request-button must be visible").toBeVisible({ timeout: 10_000 });
      await addButton.click();

      // Then: the labeled request appears in the list — AC-FILE-007-01
      // The list uses data-testid="document-request-item-{id}"; wait for ANY item to appear.
      const firstItem = page.locator('[data-testid^="document-request-item-"]').first();
      await expect(
        firstItem,
        "The first document-request-item must be visible after submission (AC-FILE-007-01)",
      ).toBeVisible({ timeout: 10_000 });

      await expect(
        firstItem,
        "The document-request-item must contain the authored label (AC-FILE-007-01)",
      ).toContainText(label, { timeout: 10_000 });

      // Then: success banner is visible
      await expect(
        page.locator('[role="status"]'),
        "Success status banner must be visible after adding request (AC-FILE-007-01)",
      ).toHaveText(/document request added/i, { timeout: 10_000 });

      // Screenshot 01: document-requests page with the labeled request in the list.
      // Assert-before-screenshot — the item must be visible (asserted above).
      await page.screenshot({
        path: shot("01-AC-FILE-007-01-document-request-created.png"),
        fullPage: true,
      });
    } finally {
      await clearSession(page);
      if (seeded) {
        await cleanupEngagement(seeded.engagementId, seeded.engagementRequestId);
      }
    }
  },
);
