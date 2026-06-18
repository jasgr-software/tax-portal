/**
 * apps/admin/e2e/demo/questionnaire-template.demo.spec.ts
 *
 * @demo UI demo walkthrough — EPIC-006 Intake questionnaire template (admin surface).
 *
 * Not part of the e2e gate: `e2e:run` / `e2e:smoke` exclude `@demo` (--grep-invert @demo);
 * this runs ONLY via `pnpm --filter admin e2e:demo`. It drives jane-accountant's
 * questionnaire-template authoring/editing happy-path against the live docker-compose
 * container stack (AUTH_PROVIDER=mock) and writes an AC-tagged screenshot gallery to
 * docs/demos/EPIC-006/. NON-GATING.
 *
 * Persona: jane-accountant (.planning/personas/jane-accountant.md)
 * Flows:   flow-onboarding    (.planning/flows/flow-onboarding.md)
 * Policy:  .orchestration/DEMO-POLICY.md
 *
 * Gallery ordering (EPIC-006 admin surface — screenshots 01–03):
 *   01-AC-DASH-012-02-service-type-picker.png
 *       — accountant opens the questionnaire-template settings; service-type picker and
 *         editor are visible (AC-DASH-012-02)
 *   02-AC-DASH-012-01-template-saved.png
 *       — accountant adds a question, saves; success banner appears
 *         (AC-DASH-012-01)
 *   03-AC-DASH-012-03-template-edit-persists.png
 *       — accountant edits the question prompt, saves, navigates away and back;
 *         edited prompt retained (AC-DASH-012-03)
 *
 * Each test ASSERTS the target element is visible BEFORE screenshotting (broken UI fails loudly).
 *
 * Pre-reqs (same SUT as the e2e gate):
 *   docker compose up -d → pnpm db:migrate → pnpm db:seed
 *
 * data-* hooks (TASK-006-002):
 *   data-testid="questionnaire-editor"  — root container
 *   data-testid="save-template"         — save button
 *   data-question-row                   — on each question row
 *   #service-picker                     — service type select element
 *
 * ADR-005: Sessions are established via /api/mock-session (role set server-side).
 * ADR-006: Two-surface platform — this spec covers the admin surface (Tax Portal).
 * ADR-010: All admin routes require ACCOUNTANT auth.
 *
 * Run:
 *   ADMIN_BASE_URL=http://localhost:13001 ADMIN_PORT=13001 pnpm --filter admin e2e:demo
 */

import { test, expect } from "@playwright/test";
import path from "path";
import mssqlPkg from "mssql";
import { setupAccountantSession, clearSession } from "../fixtures/auth.js";

const { ConnectionPool } = mssqlPkg;

// Gallery output dir — repo-root/docs/demos/EPIC-006 (resolved from this file's dir).
// Depth from apps/admin/e2e/demo/ to repo root = ../../../../
const DEMO_DIR = path.resolve(__dirname, "../../../../docs/demos/EPIC-006");
const shot = (file: string) => path.join(DEMO_DIR, file);

// Admin base URL — mirrors playwright.config.ts + auth.ts.
const ADMIN_PORT = process.env["ADMIN_PORT"] ?? "3001";
const ADMIN_URL = process.env["ADMIN_BASE_URL"] ?? `http://localhost:${ADMIN_PORT}`;

// Unique content helper — avoids cross-test interference when the DB is shared.
function uniquePrompt(prefix: string): string {
  return `${prefix} — demo ${Date.now()}.${Math.random().toString(36).slice(2, 6)}`;
}

// ─── DB helpers (admin pool — for fixture cleanup only) ────────────────────────

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
      "[questionnaire-template.demo.spec] DATABASE_URL_ADMIN is not set. Required for cleanup.",
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
 * Delete the QuestionnaireTemplate row for a given serviceId.
 * Called in try/finally to ensure cleanup even on test failure.
 * Mirrors questionnaire-templates.spec.ts cleanupTemplateByServiceId.
 */
async function cleanupTemplateByServiceId(serviceId: string): Promise<void> {
  const pool = await getPool();
  // Delete associated QuestionnaireAnswer rows first (FK → QuestionnaireTemplate)
  await pool
    .request()
    .input("serviceId", serviceId)
    .query(
      `DELETE qa
       FROM [dbo].[QuestionnaireAnswer] qa
       JOIN [dbo].[QuestionnaireTemplate] qt ON qt.[id] = qa.[templateId]
       WHERE qt.[serviceId] = @serviceId`,
    );
  await pool
    .request()
    .input("serviceId", serviceId)
    .query(`DELETE FROM [dbo].[QuestionnaireTemplate] WHERE [serviceId] = @serviceId`);
}

// ─── afterAll: close pool ──────────────────────────────────────────────────────

test.afterAll(async () => {
  await closePool();
});

// ─── Screen 01: Service type picker and editor visible (AC-DASH-012-02) ────────

test(
  "[AC-DASH-012-02] @demo 01 — jane-accountant: service type picker and questionnaire editor visible",
  async ({ page, request }) => {
    // Screen 01: ACCOUNTANT opens the questionnaire-template settings page.
    // The service type picker (#service-picker) is visible and a service is selected.
    // The questionnaire editor (data-testid="questionnaire-editor") is loaded.
    // Proves AC-DASH-012-02: the accountant can associate a template with a service type.

    try {
      await setupAccountantSession(page, request);
      await page.goto(`${ADMIN_URL}/settings/questionnaire-templates`);

      // The editor root must be visible — AC-DASH-012-02
      const editor = page.locator('[data-testid="questionnaire-editor"]');
      await expect(
        editor,
        "questionnaire-editor must be visible (AC-DASH-012-02)",
      ).toBeVisible({ timeout: 15_000 });

      // The service picker must be visible and have a value selected
      const servicePicker = page.locator("#service-picker");
      await expect(
        servicePicker,
        "#service-picker must be visible (AC-DASH-012-02)",
      ).toBeVisible({ timeout: 10_000 });

      const selectedServiceId = await servicePicker.inputValue();
      expect(
        selectedServiceId.length,
        "A service type must be selected in the picker (AC-DASH-012-02)",
      ).toBeGreaterThan(0);

      // Screenshot 01: questionnaire-template editor with service picker visible
      // (full-page to show the entire authoring surface)
      await page.screenshot({
        path: shot("01-AC-DASH-012-02-service-type-picker.png"),
        fullPage: true,
      });
    } finally {
      await clearSession(page);
    }
  },
);

// ─── Screen 02: Author questions and save — success banner (AC-DASH-012-01) ────

test(
  "[AC-DASH-012-01] @demo 02 — jane-accountant: authors questions and saves; success banner confirms",
  async ({ page, request }) => {
    // Screen 02: ACCOUNTANT opens the questionnaire-template settings page,
    // adds a question with a uniquely-identifiable prompt, clicks Save,
    // and a success banner appears.
    // Proves AC-DASH-012-01: the accountant can create an intake questionnaire template;
    // the template is saved and available.
    //
    // DECISION (TASK-006-007): We use uniquePrompt() to produce a deterministic per-run
    // value that will not collide. The template is written to the first service type in the
    // picker (same as questionnaire-templates.spec.ts). Cleanup: cleanupTemplateByServiceId()
    // in try/finally. We do NOT restore the original template after the demo run — the
    // template is cleaned up by the try/finally DB teardown. This is consistent with the
    // EPIC-005 DECISION (TASK-005-008): demo is non-gating; DB hygiene is owned by re-seeding.

    const questionPrompt = uniquePrompt("[AC-DASH-012-01] Jane's Demo Questionnaire Question");
    let serviceId: string | null = null;

    try {
      await setupAccountantSession(page, request);
      await page.goto(`${ADMIN_URL}/settings/questionnaire-templates`);

      // The editor must be visible
      const editor = page.locator('[data-testid="questionnaire-editor"]');
      await expect(
        editor,
        "questionnaire-editor must be visible before authoring",
      ).toBeVisible({ timeout: 15_000 });

      // Capture the service id for cleanup
      const servicePicker = page.locator("#service-picker");
      await expect(servicePicker).toBeVisible();
      serviceId = await servicePicker.inputValue();
      expect(serviceId.length).toBeGreaterThan(0);

      // When: accountant adds a question
      const addQuestionBtn = page.locator('button:has-text("+ Add question")');
      await expect(
        addQuestionBtn,
        "'+ Add question' button must be visible",
      ).toBeVisible({ timeout: 10_000 });
      await addQuestionBtn.click();

      // Fill in the question prompt
      const questionRows = page.locator("[data-question-row]");
      await expect(questionRows, "Must have 1 question row after adding").toHaveCount(1, { timeout: 5_000 });

      const promptInput = questionRows.first().locator('input[type="text"]').first();
      await expect(promptInput, "Question prompt input must be visible").toBeVisible();
      await promptInput.fill(questionPrompt);

      // When: accountant saves
      const saveButton = page.locator('[data-testid="save-template"]');
      await expect(
        saveButton,
        "save-template button must be visible (AC-DASH-012-01)",
      ).toBeVisible({ timeout: 10_000 });
      await saveButton.click();

      // Then: success banner appears — AC-DASH-012-01
      const successBanner = page.locator('[role="status"]:has-text("Template saved successfully")');
      await expect(
        successBanner,
        "Success banner must appear after saving (AC-DASH-012-01)",
      ).toBeVisible({ timeout: 10_000 });

      // Screenshot 02: editor with success banner confirming the template was saved
      await page.screenshot({
        path: shot("02-AC-DASH-012-01-template-saved.png"),
        fullPage: true,
      });
    } finally {
      await clearSession(page);
      if (serviceId) await cleanupTemplateByServiceId(serviceId);
    }
  },
);

// ─── Screen 03: Edit template + navigate-away-and-back — edit persists (AC-DASH-012-03) ─

test(
  "[AC-DASH-012-03] @demo 03 — jane-accountant: edits template; edit persists after navigate-away-and-back",
  async ({ page, request }) => {
    // Screen 03: ACCOUNTANT opens the questionnaire-template settings page,
    // creates an initial template, then edits the question prompt, saves,
    // navigates away and back, and the edited prompt is still present.
    // Proves AC-DASH-012-03: the edited template is retained as the current template
    // for its service type.
    //
    // DECISION (TASK-006-007): We create a template, edit it, and take the screenshot
    // after navigate-back showing the retained edit. Cleanup in try/finally via
    // cleanupTemplateByServiceId so each run starts clean.

    const initialPrompt = uniquePrompt("[AC-DASH-012-03] Initial question");
    const editedPrompt = uniquePrompt("[AC-DASH-012-03] Edited question (demo)");
    let serviceId: string | null = null;

    try {
      await setupAccountantSession(page, request);
      await page.goto(`${ADMIN_URL}/settings/questionnaire-templates`);

      // The editor must be visible
      const editor = page.locator('[data-testid="questionnaire-editor"]');
      await expect(
        editor,
        "questionnaire-editor must be visible before authoring",
      ).toBeVisible({ timeout: 15_000 });

      // Capture the service id for cleanup
      const servicePicker = page.locator("#service-picker");
      await expect(servicePicker).toBeVisible();
      serviceId = await servicePicker.inputValue();
      expect(serviceId.length).toBeGreaterThan(0);

      // Create an initial template (so we have something to edit)
      const addQuestionBtn = page.locator('button:has-text("+ Add question")');
      await expect(addQuestionBtn).toBeVisible({ timeout: 10_000 });
      await addQuestionBtn.click();

      const questionRows = page.locator("[data-question-row]");
      await expect(questionRows).toHaveCount(1, { timeout: 5_000 });

      const promptInput = questionRows.first().locator('input[type="text"]').first();
      await expect(promptInput).toBeVisible();
      await promptInput.fill(initialPrompt);

      await page.locator('[data-testid="save-template"]').click();
      await expect(
        page.locator('[role="status"]:has-text("Template saved successfully")'),
      ).toBeVisible({ timeout: 10_000 });

      // When: accountant edits the question prompt
      await promptInput.fill(editedPrompt);

      // And saves the edited template
      await page.locator('[data-testid="save-template"]').click();
      await expect(
        page.locator('[role="status"]:has-text("Template saved successfully")'),
      ).toBeVisible({ timeout: 10_000 });

      // Navigate away and back to confirm persistence — AC-DASH-012-03
      await page.goto(`${ADMIN_URL}/settings`);
      await page.goto(`${ADMIN_URL}/settings/questionnaire-templates`);

      // Then: the editor must be visible after navigate-back
      await expect(
        editor,
        "questionnaire-editor must be visible after navigate-back (AC-DASH-012-03)",
      ).toBeVisible({ timeout: 15_000 });

      // Then: the edited prompt must be present (retained after navigate-away) — AC-DASH-012-03
      const retainedInput = page
        .locator("[data-question-row] input[type=\"text\"]")
        .first();
      await expect(
        retainedInput,
        "Question prompt input must be visible after navigate-back",
      ).toBeVisible({ timeout: 10_000 });

      const retainedValue = await retainedInput.inputValue();
      expect(
        retainedValue.trim(),
        "Retained question prompt must match the edited value (AC-DASH-012-03)",
      ).toBe(editedPrompt.trim());

      // Screenshot 03: editor after navigate-back showing the retained edited prompt
      await page.screenshot({
        path: shot("03-AC-DASH-012-03-template-edit-persists.png"),
        fullPage: true,
      });
    } finally {
      await clearSession(page);
      if (serviceId) await cleanupTemplateByServiceId(serviceId);
    }
  },
);
