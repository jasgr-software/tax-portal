/**
 * apps/admin/e2e/demo/file-deletion.demo.spec.ts
 *
 * @demo UI demo walkthrough — EPIC-014 File Deletion & Recovery gallery (admin / Tax Portal surface).
 *
 * Not part of the e2e gate: `e2e:run` / `e2e:smoke` exclude `@demo` (--grep-invert @demo);
 * this runs ONLY via `pnpm --filter admin e2e:demo`. It drives jane-accountant's
 * file-deletion happy-path — delete → working view leaves → appears in Archive → Recover →
 * restored to working view — against the live docker-compose container stack
 * (AUTH_PROVIDER=mock) and writes an AC-tagged screenshot gallery to docs/demos/EPIC-014/.
 * NON-GATING.
 *
 * Persona: jane-accountant (.planning/personas/jane-accountant.md)
 * Flows:   flow-document-lifecycle (.planning/flows/flow-document-lifecycle.md)
 * Policy:  .orchestration/DEMO-POLICY.md
 *
 * Gallery ordering (EPIC-014 admin surface — screenshots 01–06):
 *   01-AC-FILE-004-01-working-view-with-delete-button.png
 *       — jane-accountant sees the Delete button on an active document (AC-FILE-004-01)
 *   02-AC-FILE-004-01-delete-confirm-visible.png
 *       — Delete button clicked; inline confirm appears before firing (ADR-018 light confirm)
 *   03-AC-FILE-006-01-working-view-after-delete.png
 *       — After delete: file has left the working view (AC-FILE-006-01)
 *   04-AC-FILE-006-01-archive-section-with-deleted-file.png
 *       — Deleted file appears in the Archive section with Recover control (AC-FILE-006-01)
 *   05-AC-FILE-006-03-recover-button-visible.png
 *       — Recover button visible for the deleted file (AC-FILE-006-03)
 *   06-AC-FILE-006-03-working-view-after-recover.png
 *       — After Recover: file is restored to the working view (AC-FILE-006-03)
 *
 * Each test ASSERTS the target element is visible BEFORE screenshotting (broken UI fails loudly).
 *
 * Pre-reqs (same SUT as the e2e gate):
 *   docker compose up -d → pnpm db:migrate → pnpm db:seed
 *
 * Fixture:
 *   DECISION (TASK-014-003): Use deterministic "-demo-014" suffix for all fixture IDs
 *   to distinguish from e2e gate suites and EPIC-013 demo. clientUserId is NULL
 *   (accountant-surface demo only). Seeds Document directly as 'active' (skips upload
 *   UI pipeline — BUG-008-001 does not apply to delete/recover; metadata-only operations).
 *   Cleanup: cleanupFixture() in try/finally for each test.
 *
 * ADR-005: Sessions via /api/mock-session (role set server-side). RLS not relaxed.
 * ADR-006: Two-surface platform — this spec covers the admin surface (Tax Portal).
 * ADR-018: Soft-delete — sets deletedAt tombstone; row + bytes survive.
 * ADR-012: Tier-6 e2e (demo variant — non-gating).
 *
 * // ADR-005 // ADR-006 // ADR-018 // ADR-012 // CS-GEN-001 // CS-GEN-003
 *
 * Run:
 *   ADMIN_BASE_URL=http://localhost:13001 ADMIN_PORT=13001 pnpm --filter admin e2e:demo
 */

import { test, expect } from "@playwright/test";
import path from "path";
import mssqlPkg from "mssql";
import { setupAccountantSession, clearSession } from "../fixtures/auth.js";

const { ConnectionPool } = mssqlPkg;

// Gallery output dir — repo-root/docs/demos/EPIC-014 (resolved from this file's dir).
// Depth from apps/admin/e2e/demo/ to repo root = ../../../../
// retro-012-012 (MANDATORY): screenshots MUST write ONLY to docs/demos/EPIC-014/.
const DEMO_DIR = path.resolve(__dirname, "../../../../docs/demos/EPIC-014");
const shot = (file: string) => path.join(DEMO_DIR, file);

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
      "[file-deletion.demo.spec] DATABASE_URL_ADMIN is not set. Required for admin pool seed/teardown.",
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

interface DemoFixture {
  engagementId: string;
  engagementRequestId: string;
  documentId: string;
}

// ─── Fixture seed helpers ──────────────────────────────────────────────────────

/**
 * Seed a minimal Engagement + active Document for the demo.
 * DECISION (TASK-014-003): clientUserId NULL (accountant-surface demo only).
 *   The "-demo-014" suffix in the email distinguishes from all gate suites and EPIC-013 demo.
 */
async function seedEngagementWithDocument(suffix: string): Promise<DemoFixture> {
  const pool = await getPool();

  const reqResult = await pool
    .request()
    .input("firstName", "JaneDemo014")
    .input("lastName", "FileDeletion")
    .input("email", `e2e-demo-014-${suffix}@file-deletion.demo.e2e.test`)
    .query<{ id: string }>(
      `INSERT INTO [dbo].[EngagementRequest]
         ([firstName], [lastName], [email], [status], [createdAt], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES (@firstName, @lastName, @email, 'accepted', GETUTCDATE(), GETUTCDATE())`,
    );

  const engagementRequestId = reqResult.recordset[0]?.id;
  if (!engagementRequestId) {
    throw new Error("[file-deletion.demo.spec] Failed to seed EngagementRequest");
  }

  const engResult = await pool
    .request()
    .input("engagementRequestId", engagementRequestId)
    .query<{ id: string }>(
      `INSERT INTO [dbo].[Engagement]
         ([engagementRequestId], [status], [createdAt], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES (@engagementRequestId, 'In Progress', GETUTCDATE(), GETUTCDATE())`,
    );

  const engagementId = engResult.recordset[0]?.id;
  if (!engagementId) {
    throw new Error("[file-deletion.demo.spec] Failed to seed Engagement");
  }

  // Seed an active Document (skips upload UI — BUG-008-001 does not apply to delete/recover)
  const docResult = await pool
    .request()
    .input("engagementId", engagementId)
    .input("storageKey", `demo-014/${engagementId.toLowerCase()}/demo-report-${suffix}.pdf`)
    .input("filename", `Tax Return 2024 Demo — ${suffix}.pdf`)
    .query<{ id: string }>(
      `INSERT INTO [dbo].[Document]
         ([engagementId], [storageKey], [originalFilename], [contentType],
          [sizeBytes], [status], [version], [createdAt], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES (@engagementId, @storageKey, @filename, 'application/pdf', 512000, 'active', 1, GETUTCDATE(), GETUTCDATE())`,
    );

  const documentId = docResult.recordset[0]?.id;
  if (!documentId) {
    throw new Error("[file-deletion.demo.spec] Failed to seed Document");
  }

  return {
    engagementId: engagementId.toLowerCase(),
    engagementRequestId: engagementRequestId.toLowerCase(),
    documentId: documentId.toLowerCase(),
  };
}

/**
 * Clean up fixture rows in FK order (idempotent).
 */
async function cleanupFixture(
  engagementId: string,
  engagementRequestId: string,
): Promise<void> {
  const pool = await getPool();

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

// ─── Screen 01: Working view with Delete button (AC-FILE-004-01) ───────────────

test(
  "[AC-FILE-004-01] @demo 01 — jane-accountant: Delete button visible for an active document",
  async ({ page, request }) => {
    // Screen 01: jane-accountant navigates to the documents page.
    // The Delete button is visible for the active document.
    //
    // Proves AC-FILE-004-01: the accountant can delete a file (the control is present).
    //
    // Screenshot strategy: documents page showing Delete button for the active file.

    test.setTimeout(30_000);

    const suffix = `01-del-btn-${Date.now()}`;
    const fixture = await seedEngagementWithDocument(suffix);

    try {
      await setupAccountantSession(page, request);

      // Given: jane-accountant on the documents page with an active document
      await page.goto(`${ADMIN_URL}/engagements/${fixture.engagementId}/documents`);
      await page.waitForLoadState("networkidle", { timeout: 15_000 });

      // The documents list must be visible
      const documentsList = page.locator('[data-testid="documents-list"]');
      await expect(
        documentsList,
        "documents-list must be visible (AC-FILE-004-01)",
      ).toBeVisible({ timeout: 15_000 });

      // The Delete button must be visible for the active document
      const deleteButton = page.locator(`[data-testid="delete-button-${fixture.documentId}"]`);
      await expect(
        deleteButton,
        "delete-button must be visible for the active document (AC-FILE-004-01)",
      ).toBeVisible({ timeout: 10_000 });

      // Screenshot 01: working view with Delete button visible.
      await page.screenshot({
        path: shot("01-AC-FILE-004-01-working-view-with-delete-button.png"),
        fullPage: true,
      });
    } finally {
      await clearSession(page);
      await cleanupFixture(fixture.engagementId, fixture.engagementRequestId);
    }
  },
);

// ─── Screen 02: Delete confirm visible (ADR-018 light confirm) ─────────────────

test(
  "[AC-FILE-004-01] @demo 02 — jane-accountant: Delete confirm appears before firing",
  async ({ page, request }) => {
    // Screen 02: jane-accountant clicks Delete — an inline confirm appears.
    // ADR-018: soft-delete is recoverable, so a light confirm is used.
    //
    // Proves AC-FILE-004-01: the confirm step before soft-delete fires.
    //
    // Screenshot strategy: documents page after Delete is clicked, showing inline confirm.

    test.setTimeout(30_000);

    const suffix = `02-del-confirm-${Date.now()}`;
    const fixture = await seedEngagementWithDocument(suffix);

    try {
      await setupAccountantSession(page, request);

      await page.goto(`${ADMIN_URL}/engagements/${fixture.engagementId}/documents`);
      await page.waitForLoadState("networkidle", { timeout: 15_000 });

      const documentsList = page.locator('[data-testid="documents-list"]');
      await expect(documentsList, "documents-list must be visible").toBeVisible({ timeout: 15_000 });

      // When: jane-accountant clicks Delete
      const deleteButton = page.locator(`[data-testid="delete-button-${fixture.documentId}"]`);
      await expect(deleteButton, "delete-button must be visible").toBeVisible({ timeout: 10_000 });
      await deleteButton.click();

      // Then: inline confirm appears
      const confirmYes = page.locator(`[data-testid="delete-confirm-yes-${fixture.documentId}"]`);
      await expect(
        confirmYes,
        "delete-confirm-yes must appear after clicking Delete (ADR-018 light confirm — AC-FILE-004-01)",
      ).toBeVisible({ timeout: 5_000 });

      // Screenshot 02: confirm visible before delete fires.
      await page.screenshot({
        path: shot("02-AC-FILE-004-01-delete-confirm-visible.png"),
        fullPage: true,
      });
    } finally {
      await clearSession(page);
      await cleanupFixture(fixture.engagementId, fixture.engagementRequestId);
    }
  },
);

// ─── Screen 03 + 04 + 05 + 06: Delete → Archive → Recover (AC-FILE-006-01/-03) ─

test(
  "[AC-FILE-006-01] [AC-FILE-006-03] @demo 03-06 — jane-accountant: delete → archive → recover journey",
  async ({ page, request }) => {
    // Screens 03-06: jane-accountant deletes a file, sees it leave the working view,
    // sees it in the Archive section, and then recovers it.
    //
    // Proves:
    //   AC-FILE-006-01: file marked deleted and removed from normal file view.
    //   AC-FILE-006-03: file remains recoverable; Recover restores it.
    //
    // Screenshots:
    //   03 — working view after delete (file gone)
    //   04 — Archive section with deleted file (Recover control visible)
    //   05 — Recover button for the deleted file
    //   06 — working view after Recover (file restored)

    test.setTimeout(60_000);

    const suffix = `03-06-journey-${Date.now()}`;
    const fixture = await seedEngagementWithDocument(suffix);

    try {
      await setupAccountantSession(page, request);

      // Given: jane-accountant on the documents page
      await page.goto(`${ADMIN_URL}/engagements/${fixture.engagementId}/documents`);
      await page.waitForLoadState("networkidle", { timeout: 15_000 });

      const documentsList = page.locator('[data-testid="documents-list"]');
      await expect(documentsList, "documents-list must be visible before delete").toBeVisible({ timeout: 15_000 });

      // ── Delete the file ────────────────────────────────────────────────────────
      const deleteButton = page.locator(`[data-testid="delete-button-${fixture.documentId}"]`);
      await expect(deleteButton, "delete-button must be visible").toBeVisible({ timeout: 10_000 });
      await deleteButton.click();

      const confirmYes = page.locator(`[data-testid="delete-confirm-yes-${fixture.documentId}"]`);
      await expect(confirmYes, "delete-confirm-yes must appear").toBeVisible({ timeout: 5_000 });
      await confirmYes.click();

      // Wait for the item to leave the working view (AC-FILE-006-01)
      await expect(
        page.locator(`[data-testid="document-item-${fixture.documentId}"]`),
        "document must leave working view after delete (AC-FILE-006-01)",
      ).not.toBeVisible({ timeout: 15_000 });

      // Screenshot 03: working view after delete (file gone from normal list).
      await page.screenshot({
        path: shot("03-AC-FILE-006-01-working-view-after-delete.png"),
        fullPage: true,
      });

      // ── Archive section with deleted file ──────────────────────────────────────
      const archiveSection = page.locator('[data-testid="archive-section"]');
      await expect(
        archiveSection,
        "archive-section must be visible (AC-FILE-006-01)",
      ).toBeVisible({ timeout: 10_000 });

      const archiveItem = page.locator(`[data-testid="archive-document-item-${fixture.documentId}"]`);
      await expect(
        archiveItem,
        "deleted file must appear in Archive section (AC-FILE-006-01)",
      ).toBeVisible({ timeout: 10_000 });

      // Screenshot 04: Archive section with deleted file visible.
      await page.screenshot({
        path: shot("04-AC-FILE-006-01-archive-section-with-deleted-file.png"),
        fullPage: true,
      });

      // ── Recover button visible ─────────────────────────────────────────────────
      const recoverButton = page.locator(`[data-testid="recover-button-${fixture.documentId}"]`);
      await expect(
        recoverButton,
        "recover-button must be visible for the deleted file (AC-FILE-006-03)",
      ).toBeVisible({ timeout: 10_000 });

      // Screenshot 05: Recover button visible.
      await page.screenshot({
        path: shot("05-AC-FILE-006-03-recover-button-visible.png"),
        fullPage: true,
      });

      // ── Recover the file ───────────────────────────────────────────────────────
      await recoverButton.click();

      // Wait for the file to re-appear in the working view (AC-FILE-006-03)
      await expect(
        page.locator(`[data-testid="document-item-${fixture.documentId}"]`),
        "recovered file must re-appear in working view (AC-FILE-006-03)",
      ).toBeVisible({ timeout: 15_000 });

      // Screenshot 06: working view after Recover (file restored).
      await page.screenshot({
        path: shot("06-AC-FILE-006-03-working-view-after-recover.png"),
        fullPage: true,
      });

      console.info(
        "[AC-FILE-006-01] [AC-FILE-006-03] demo journey complete: " +
          `document ${fixture.documentId} deleted → archived → recovered successfully.`,
      );
    } finally {
      await clearSession(page);
      await cleanupFixture(fixture.engagementId, fixture.engagementRequestId);
    }
  },
);
