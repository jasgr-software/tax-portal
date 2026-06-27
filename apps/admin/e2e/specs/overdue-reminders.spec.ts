/**
 * apps/admin/e2e/specs/overdue-reminders.spec.ts
 *
 * Tier-6 e2e — Overdue document-request flagging and reminder cadence configuration.
 * EPIC-019 / TASK-019-005 / BRIEF-019
 *
 * Acceptance criteria covered (apps/admin surface):
 *   AC-FILE-012-02 — An overdue document request is flagged/surfaced as overdue when
 *     the accountant views the request.
 *   AC-DASH-008-01 — The accountant can set a global default frequency for overdue
 *     document-request reminders; it is recorded and applies where no override exists.
 *   AC-DASH-008-02 — The accountant can set an overdue-reminder frequency for an
 *     individual engagement; that engagement carries its own reminder frequency.
 *   AC-MSG-018-03 — The accountant can configure the reminder frequency as a global
 *     default; overdue reminders are raised at that frequency by default across
 *     engagements. (Covered by the AC-DASH-008-01 scenario — the setting IS the
 *     mechanism; the hard tier-3 enforcement is in TASK-019-003/-004.)
 *
 * Gherkin binding (verbatim from BRIEF-019 § Acceptance scenarios;
 * see apps/admin/e2e/features/overdue-reminders.feature):
 *
 *   AC-FILE-012-02:
 *     Given a document request whose due date has passed and that is unfulfilled
 *     When the accountant views the request
 *     Then it is flagged/surfaced as overdue
 *
 *   AC-DASH-008-01 + AC-MSG-018-03:
 *     Given the accountant on her settings surface
 *     When she sets a global default overdue-reminder frequency
 *     Then that global default is recorded and applies where no override exists
 *
 *   AC-DASH-008-02:
 *     Given the accountant viewing an individual engagement
 *     When she sets an overdue-reminder frequency for that engagement
 *     Then that engagement carries its own reminder frequency
 *
 * Strategy:
 *   Test 1 (AC-FILE-012-02):
 *     1. Seed EngagementRequest + Engagement + DocumentRequest with dueDate in the past.
 *        isOverdue is DERIVED at page load from dueDate < now (no engine trigger needed —
 *        DECISION-019-D; the overdue badge is computed by listDocumentRequestsForEngagementAdmin).
 *     2. Navigate to /engagements/{id}/document-requests.
 *     3. Assert the overdue-badge-{documentRequestId} testid is visible (AC-FILE-012-02).
 *
 *   Test 2 (AC-DASH-008-01 / AC-MSG-018-03):
 *     1. Navigate to /settings/reminders.
 *     2. Set the global default cadence to 14 days (reminder-frequency-input).
 *     3. Click save (save-cadence-button) and assert cadence-success is visible.
 *     4. Reload the page and assert cadence-current-value shows 14 days (persisted).
 *     5. Reset to 7 days (original default per DECISION-019-B) for clean teardown.
 *
 *   Test 3 (AC-DASH-008-02):
 *     1. Reuse the engagement from test 1 (or seed fresh — handled in beforeAll).
 *     2. Navigate to /engagements/{id} (engagement detail page with ReminderOverridePanel).
 *     3. Set override to 3 days (override-frequency-input, set-override-button).
 *     4. Assert override-success is visible (AC-DASH-008-02).
 *     5. Reload and assert the override persists (override-frequency-input shows 3).
 *
 * Stack: admin container at http://localhost:13001 (ADMIN_PORT env), AUTH_PROVIDER=mock.
 * Run:
 *   pnpm --filter admin e2e:run -- --grep "overdue-reminders"
 *   pnpm --filter admin e2e:run -- --grep "AC-FILE-012-02"
 *
 * data-testid hooks consumed (from TASK-019-002/-004 implementation):
 *   document-request-editor             — root container (document-requests page)
 *   overdue-badge-{id}                  — overdue badge (AC-FILE-012-02; when isOverdue)
 *   reminder-settings-page              — root of /settings/reminders
 *   reminder-frequency-input            — global default frequency input
 *   save-cadence-button                 — save global default button
 *   cadence-success                     — success message after save
 *   cadence-current-value               — current saved value display
 *   reminder-override-panel             — root of the per-engagement override panel
 *   override-frequency-input            — per-engagement override frequency input
 *   set-override-button                 — save per-engagement override button
 *   override-success                    — success message after override save
 *
 * DB fixture:
 *   Seeded via admin pool (RLS-exempt). Cleaned up in afterAll.
 *   DocumentRequest.dueDate set to 10 days in the past (overdue on page load).
 *   // ADR-023: no wall-clock wait; past-due dueDate makes isOverdue=true at page load.
 *
 * // ADR-006: admin surface only — cadence config and overdue flag are accountant affordances.
 * // ADR-012: tier-6 e2e. // ADR-012
 * // ADR-023: time-injectable seam; past-due dueDate drives overdue without engine trigger. // ADR-023
 * // CS-TS-003: pattern consistent with apps/portal notification-feed.spec.ts. // CS-TS-003
 * // CS-GEN-001: no PII in fixture data beyond synthetic identifiers. // CS-GEN-001
 * // CS-GEN-002: additive test; no existing spec modified. // CS-GEN-002
 * // CS-GEN-003: AC ids and governing keys cited throughout. // CS-GEN-003
 */

import { test, expect } from "@playwright/test";
import mssqlPkg from "mssql";
import { setupAccountantSession, clearSession } from "../fixtures/auth.js";

const { ConnectionPool, UniqueIdentifier } = mssqlPkg;

// ─── URL resolution ────────────────────────────────────────────────────────────

const ADMIN_PORT = process.env["ADMIN_PORT"] ?? "3001";
const ADMIN_URL = process.env["ADMIN_BASE_URL"] ?? `http://localhost:${ADMIN_PORT}`;

// ─── Fixture identifiers (unique suffix "-019-005" avoids collision) ──────────
// CS-GEN-001: synthetic fixture identifiers — no real PII. // CS-GEN-001

const FIXTURE_ACCOUNTANT_CLERK_ID = "user_accountant_overdue_e2e_019_005";
const FIXTURE_EMAIL = "overdue-reminders-e2e-019-005@example.com";

// ─── DB helpers (admin pool — RLS-exempt fixture setup/teardown) ──────────────

/**
 * Parse a sqlserver:// connection string into mssql config.
 * Duplicated per spec — each spec is self-contained (CS-TS-003 note).
 * // CS-TS-003
 */
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
      "[overdue-reminders.spec] DATABASE_URL_ADMIN is not set " +
        "(required for fixture setup/teardown).",
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

// ─── Fixture shape ────────────────────────────────────────────────────────────

interface OverdueFixture {
  engagementId: string;
  engagementRequestId: string;
  documentRequestId: string;
}

/**
 * Seeds:
 *   - EngagementRequest (accepted status)
 *   - Engagement (status = 'New', no clientUserId needed for admin view)
 *   - DocumentRequest with dueDate 10 days in the past (so isOverdue=true on page load)
 *
 * isOverdue is DERIVED at page load by listDocumentRequestsForEngagementAdmin:
 *   computeIsOverdue({ dueDate: <past date>, isFulfilled: false, now: <page-load time> }) = true
 *   No engine trigger needed (ADR-023: no wall-clock wait — past dueDate suffices). // ADR-023
 *
 * AC-FILE-012-04: only the request with a past due date is overdue.
 * // AC-FILE-012-02 // AC-FILE-012-04 // ADR-023 // CS-GEN-001
 */
async function seedOverdueFixture(): Promise<OverdueFixture> {
  const pool = await getPool();

  // Idempotent: clean up any prior fixture for this email before seeding fresh.
  await cleanupOverdueFixture(pool).catch(() => {
    /* ignore on first run */
  });

  // 1. Seed EngagementRequest
  const reqResult = await pool
    .request()
    .input("email", FIXTURE_EMAIL)
    .query<{ id: string }>(
      `INSERT INTO [dbo].[EngagementRequest]
         ([firstName], [lastName], [email], [status], [createdAt], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES (N'OverdueTest', N'E2E019005', @email, N'accepted', GETUTCDATE(), GETUTCDATE())`,
    );

  const engagementRequestId = reqResult.recordset[0]?.id;
  if (!engagementRequestId) {
    throw new Error("[overdue-reminders.spec] Failed to seed EngagementRequest");
  }

  // 2. Seed Engagement (clientUserId = NULL — admin-view test; no client needed).
  //    AC-FILE-012-02: the accountant views the request on the admin surface.
  const engResult = await pool
    .request()
    .input("engagementRequestId", UniqueIdentifier, engagementRequestId)
    .query<{ id: string }>(
      `INSERT INTO [dbo].[Engagement]
         ([engagementRequestId], [status], [createdAt], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES (@engagementRequestId, N'New', GETUTCDATE(), GETUTCDATE())`,
    );

  const engagementId = engResult.recordset[0]?.id;
  if (!engagementId) {
    throw new Error("[overdue-reminders.spec] Failed to seed Engagement");
  }

  // 3. Seed DocumentRequest with dueDate 10 days in the past.
  //    isOverdue = true at page load because: isFulfilled=false AND dueDate < now.
  //    ADR-023: no wall-clock wait — past dueDate drives the overdue derivation. // ADR-023
  //    ADR-018: overdue derived from existing dueDate lifecycle attribute. // ADR-018
  //    AC-FILE-012-04: the due date has passed → overdue. // AC-FILE-012-04
  const drResult = await pool
    .request()
    .input("engagementId", UniqueIdentifier, engagementId)
    .query<{ id: string }>(
      `INSERT INTO [dbo].[DocumentRequest]
         ([engagementId], [label], [dueDate], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES (
         @engagementId,
         N'[AC-FILE-012-02] Tax return documents (e2e-019-005)',
         CAST(DATEADD(day, -10, GETUTCDATE()) AS DATE),
         GETUTCDATE()
       )`,
    );

  const documentRequestId = drResult.recordset[0]?.id;
  if (!documentRequestId) {
    throw new Error("[overdue-reminders.spec] Failed to seed DocumentRequest");
  }

  return {
    engagementId: engagementId.toLowerCase(),
    engagementRequestId: engagementRequestId.toLowerCase(),
    documentRequestId: documentRequestId.toLowerCase(),
  };
}

/**
 * Clean up all seeded rows: DocumentRequest → Engagement → EngagementRequest.
 * Idempotent — FK-ordered deletion.
 */
async function cleanupOverdueFixture(pool: mssqlPkg.ConnectionPool): Promise<void> {
  // Delete by email pattern (matches the fixture email exactly).
  await pool
    .request()
    .input("email", FIXTURE_EMAIL)
    .query(
      `DELETE dr FROM [dbo].[DocumentRequest] dr
       INNER JOIN [dbo].[Engagement] e ON dr.[engagementId] = e.[id]
       INNER JOIN [dbo].[EngagementRequest] er ON e.[engagementRequestId] = er.[id]
       WHERE er.[email] = @email`,
    )
    .catch(() => {});

  await pool
    .request()
    .input("email", FIXTURE_EMAIL)
    .query(
      `DELETE e FROM [dbo].[Engagement] e
       INNER JOIN [dbo].[EngagementRequest] er ON e.[engagementRequestId] = er.[id]
       WHERE er.[email] = @email`,
    )
    .catch(() => {});

  await pool
    .request()
    .input("email", FIXTURE_EMAIL)
    .query(`DELETE FROM [dbo].[EngagementRequest] WHERE [email] = @email`)
    .catch(() => {});
}

// ─── Fixture state ────────────────────────────────────────────────────────────

let fixture: OverdueFixture;

test.beforeAll(async () => {
  fixture = await seedOverdueFixture();
});

test.afterAll(async () => {
  const pool = await getPool();
  await cleanupOverdueFixture(pool);
  await closePool();
});

// ═══════════════════════════════════════════════════════════════════════════════
// Test 1: @AC-FILE-012-02 — Overdue request flagged/surfaced as overdue
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("[AC-FILE-012-02] accountant views overdue request — flagged as overdue", () => {
  /**
   * Gherkin (BRIEF-019 § Acceptance scenarios — verbatim):
   *   Given a document request whose due date has passed and that is unfulfilled
   *   When the accountant views the request
   *   Then it is flagged/surfaced as overdue
   *
   * // AC-FILE-012-02 // ADR-006 // ADR-012 // ADR-023
   */

  test.beforeEach(async ({ page, request }) => {
    // ADR-006: admin surface only (ACCOUNTANT role). // ADR-006
    // ADR-005: role is set server-side by the mock-session endpoint. // ADR-005
    await setupAccountantSession(page, request, FIXTURE_ACCOUNTANT_CLERK_ID);
  });

  test.afterEach(async ({ page }) => {
    await clearSession(page);
  });

  test(
    "[AC-FILE-012-02] accountant views a request with a past dueDate — overdue badge is visible",
    async ({ page }) => {
      // Given: a document request with dueDate 10 days in the past (seeded in beforeAll)
      // ADR-023: no wall-clock wait — dueDate in the past makes isOverdue=true at page load. // ADR-023
      // ADR-018: overdue derived from existing dueDate attribute (no new clock). // ADR-018

      // When: the accountant views the request (navigates to document-requests page)
      // AC-FILE-012-02: listDocumentRequestsForEngagementAdmin computes isOverdue at load. // AC-FILE-012-02
      await page.goto(
        `${ADMIN_URL}/engagements/${fixture.engagementId}/document-requests`,
      );

      // Wait for the editor to load
      await expect(
        page.locator('[data-testid="document-request-editor"]'),
        "[AC-FILE-012-02] document-request-editor must be visible",
      ).toBeVisible({ timeout: 15_000 });

      // Then: the overdue badge is visible for the seeded request (AC-FILE-012-02).
      // data-testid="overdue-badge-{id}" is rendered by DocumentRequestEditor when isOverdue=true.
      // AC-FILE-012-02: the badge surfaces the overdue state for the accountant. // AC-FILE-012-02
      const overdueBadge = page.locator(
        `[data-testid="overdue-badge-${fixture.documentRequestId}"]`,
      );

      await expect(
        overdueBadge,
        `[AC-FILE-012-02] overdue-badge-${fixture.documentRequestId} must be visible (request with past dueDate is overdue)`,
      ).toBeVisible({ timeout: 10_000 });

      // Verify the badge text is "Overdue" (case-insensitive)
      await expect(
        overdueBadge,
        "[AC-FILE-012-02] overdue badge text must be 'Overdue'",
      ).toHaveText(/overdue/i);

      // Verify the request list item has data-overdue="true" (the data attribute set by DocumentRequestEditor)
      const requestItem = page.locator(
        `[data-testid="document-request-item-${fixture.documentRequestId}"]`,
      );
      await expect(
        requestItem,
        "[AC-FILE-012-02] document-request-item must be visible",
      ).toBeVisible();
      await expect(
        requestItem,
        "[AC-FILE-012-02] document-request-item data-overdue must be 'true'",
      ).toHaveAttribute("data-overdue", "true");
    },
  );
});

// ═══════════════════════════════════════════════════════════════════════════════
// Test 2: @AC-DASH-008-01 + @AC-MSG-018-03 — Set global default cadence
// ═══════════════════════════════════════════════════════════════════════════════

test.describe(
  "[AC-DASH-008-01] [AC-MSG-018-03] accountant sets global default reminder cadence",
  () => {
    /**
     * Gherkin (BRIEF-019 § Acceptance scenarios — verbatim):
     *   AC-DASH-008-01:
     *     Given the accountant on her settings surface
     *     When she sets a global default overdue-reminder frequency
     *     Then that global default is recorded and applies where no override exists
     *
     *   AC-MSG-018-03:
     *     Given the accountant configuring reminders
     *     When she sets a global default reminder frequency
     *     Then overdue reminders are raised at that frequency by default across engagements
     *     (Proven here via the UI config path; engine enforcement proven in tier-3 TASK-019-003.)
     *
     * // AC-DASH-008-01 // AC-MSG-018-03 // ADR-006 // ADR-012
     */

    test.beforeEach(async ({ page, request }) => {
      await setupAccountantSession(page, request, FIXTURE_ACCOUNTANT_CLERK_ID);
    });

    test.afterEach(async ({ page }) => {
      await clearSession(page);
    });

    test(
      "[AC-DASH-008-01] [AC-MSG-018-03] accountant sets global default cadence to 14 days — saved and persists",
      async ({ page }) => {
        // Given: the accountant on her settings surface
        await page.goto(`${ADMIN_URL}/settings/reminders`);

        await expect(
          page.locator('[data-testid="reminder-settings-page"]'),
          "[AC-DASH-008-01] reminder-settings-page must be visible",
        ).toBeVisible({ timeout: 15_000 });

        // When: she sets a global default overdue-reminder frequency (14 days)
        const frequencyInput = page.locator('[data-testid="reminder-frequency-input"]');
        await expect(
          frequencyInput,
          "[AC-DASH-008-01] reminder-frequency-input must be visible",
        ).toBeVisible({ timeout: 10_000 });

        // Record the current value so we can restore it after the test.
        // AC-DASH-008-01: the form shows the current saved value. // AC-DASH-008-01
        const originalValue = await frequencyInput.inputValue();

        // Set frequency to 14 days (different from the seeded default of 7 to prove the change is recorded).
        await frequencyInput.fill("14");

        const saveButton = page.locator('[data-testid="save-cadence-button"]');
        await expect(
          saveButton,
          "[AC-DASH-008-01] save-cadence-button must be visible",
        ).toBeVisible({ timeout: 10_000 });
        await saveButton.click();

        // Then: that global default is recorded (success message visible)
        // AC-DASH-008-01: the saved value is persisted. // AC-DASH-008-01
        // AC-MSG-018-03: the setting applies where no override exists. // AC-MSG-018-03
        const successMsg = page.locator('[data-testid="cadence-success"]');
        await expect(
          successMsg,
          "[AC-DASH-008-01] cadence-success must be visible after save",
        ).toBeVisible({ timeout: 10_000 });

        await expect(
          successMsg,
          "[AC-DASH-008-01] cadence-success must mention '14'",
        ).toContainText("14");

        // Verify persistence: reload the page and confirm the current-value shows 14.
        // AC-DASH-008-01: "is recorded" — persists across page reload. // AC-DASH-008-01
        await page.reload();
        await expect(
          page.locator('[data-testid="reminder-settings-page"]'),
          "[AC-DASH-008-01] reminder-settings-page must be visible after reload",
        ).toBeVisible({ timeout: 15_000 });

        const currentValueEl = page.locator('[data-testid="cadence-current-value"]');
        await expect(
          currentValueEl,
          "[AC-DASH-008-01] cadence-current-value must show 14 after reload (persisted)",
        ).toContainText("14");

        // Restore original value so this test doesn't pollute other tests.
        // (The ReminderSetting singleton row is shared state — clean up explicitly.)
        const restoreInput = page.locator('[data-testid="reminder-frequency-input"]');
        await restoreInput.fill(originalValue || "7");
        await page.locator('[data-testid="save-cadence-button"]').click();
        await expect(
          page.locator('[data-testid="cadence-success"]'),
          "[AC-DASH-008-01] restore: cadence-success must be visible",
        ).toBeVisible({ timeout: 10_000 });
      },
    );
  },
);

// ═══════════════════════════════════════════════════════════════════════════════
// Test 3: @AC-DASH-008-02 — Set per-engagement cadence override
// ═══════════════════════════════════════════════════════════════════════════════

test.describe(
  "[AC-DASH-008-02] accountant sets per-engagement reminder cadence override",
  () => {
    /**
     * Gherkin (BRIEF-019 § Acceptance scenarios — verbatim):
     *   Given the accountant viewing an individual engagement
     *   When she sets an overdue-reminder frequency for that engagement
     *   Then that engagement carries its own reminder frequency
     *
     * // AC-DASH-008-02 // ADR-006 // ADR-012
     */

    test.beforeEach(async ({ page, request }) => {
      await setupAccountantSession(page, request, FIXTURE_ACCOUNTANT_CLERK_ID);
    });

    test.afterEach(async ({ page }) => {
      await clearSession(page);
    });

    test(
      "[AC-DASH-008-02] accountant sets per-engagement override to 3 days — saved and persists",
      async ({ page }) => {
        // Given: the accountant viewing an individual engagement
        // (reuse the engagement seeded in beforeAll — it has no override set initially)
        await page.goto(
          `${ADMIN_URL}/engagements/${fixture.engagementId}`,
        );

        // Wait for the reminder-override-panel to load
        const overridePanel = page.locator('[data-testid="reminder-override-panel"]');
        await expect(
          overridePanel,
          "[AC-DASH-008-02] reminder-override-panel must be visible",
        ).toBeVisible({ timeout: 15_000 });

        // When: she sets an overdue-reminder frequency for that engagement (3 days)
        const overrideInput = page.locator('[data-testid="override-frequency-input"]');
        await expect(
          overrideInput,
          "[AC-DASH-008-02] override-frequency-input must be visible",
        ).toBeVisible({ timeout: 10_000 });

        await overrideInput.fill("3");

        const setButton = page.locator('[data-testid="set-override-button"]');
        await expect(
          setButton,
          "[AC-DASH-008-02] set-override-button must be visible",
        ).toBeVisible({ timeout: 10_000 });
        await setButton.click();

        // Then: that engagement carries its own reminder frequency (success message)
        // AC-DASH-008-02: the override is saved. // AC-DASH-008-02
        const successMsg = page.locator('[data-testid="override-success"]');
        await expect(
          successMsg,
          "[AC-DASH-008-02] override-success must be visible after save",
        ).toBeVisible({ timeout: 10_000 });

        await expect(
          successMsg,
          "[AC-DASH-008-02] override-success must mention '3'",
        ).toContainText("3");

        // Verify persistence: reload the page and confirm the override is still set.
        // AC-DASH-008-02: "carries its own reminder frequency" — persists across reload. // AC-DASH-008-02
        await page.reload();
        await expect(
          page.locator('[data-testid="reminder-override-panel"]'),
          "[AC-DASH-008-02] reminder-override-panel must be visible after reload",
        ).toBeVisible({ timeout: 15_000 });

        const reloadedInput = page.locator('[data-testid="override-frequency-input"]');
        await expect(
          reloadedInput,
          "[AC-DASH-008-02] override-frequency-input must show 3 after reload (persisted)",
        ).toHaveValue("3");

        // Clean up: clear the override so this test doesn't pollute other tests.
        const clearButton = page.locator('[data-testid="clear-override-button"]');
        if (await clearButton.isVisible()) {
          await clearButton.click();
          await expect(
            page.locator('[data-testid="override-success"]'),
            "[AC-DASH-008-02] clear: override-success must be visible",
          ).toBeVisible({ timeout: 10_000 });
        }
      },
    );
  },
);
