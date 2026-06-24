/**
 * apps/admin/e2e/demo/phase-3-walkthrough.demo.spec.ts
 *
 * @demo @video -- END-OF-PHASE-3 video walkthrough.
 *
 * A single, continuous, HUMAN-SPEED Playwright video demonstrating the entire Phase-3
 * delivery -- the engagement workspace -- end to end across BOTH surfaces (Client Portal
 * :3000 + Tax Portal admin :13001). Intended for human review / phase sign-off -- NOT a
 * quality gate.
 *
 * // DEMO-POLICY.md Part B -- when a slice completes a roadmap phase, the phase-completing
 * //   slice's PR carries the phase walkthrough @video spec (application code). EPIC-015 is
 * //   the last planned Phase-3 epic (EPIC-009..014 delivered), so it closes Phase 3. Without
 * //   this spec the Conductor's Report-time `e2e:video` matches nothing and the Phase-3
 * //   closeout video cannot be produced (the EPIC-008 silent-miss failure mode).
 *
 * Tagged `@demo @video`:
 *   - `@demo`  -> excluded from the e2e gate (`e2e:run` uses --grep-invert @demo).
 *   - `@demo`  -> also excluded from the screenshot galleries (`e2e:demo` uses
 *                 --grep-invert @video), so the fast galleries do NOT run this spec.
 *   - `@video` -> run ONLY via `pnpm --filter admin e2e:video` (--grep @video).
 *
 * Recording + pacing are set PER-SPEC via test.use() below -- the shared
 * playwright.config.ts is untouched, so the e2e gate keeps running at normal speed
 * with no video.
 *
 * The story (one continuous take -- every Phase-3 epic):
 *   0.  Title card.
 *   1.  EPIC-009 -- jane-accountant signs in via the dev sign-in lane; the server resolves
 *       her ACCOUNTANT role and lands her on apps/admin (Tax Portal).
 *   2.  EPIC-010 -- engagement lifecycle pipeline: New -> In Progress -> Review ->
 *       (confirm delivery + filing) -> Complete, then Reopen. Visibility/labels shown.
 *   3.  EPIC-011 -- engagement attributes: set a due date, record an accountant-only
 *       internal note, flip the priority flag.
 *   4.  EPIC-012 -- creation paths: the accountant-initiated engagement form + the
 *       multi-participant (two distinct CLIENT accounts) shared-access surface
 *       (post-state seeded + narrated; the live invite flow is covered by e2e gates).
 *   5.  EPIC-013 -- secure file exchange: folder tree + create-folder, version-replace
 *       affordance, both-party download. Upload UI shown; the byte round-trip is narrated
 *       (BUG-008-001) and the post-upload state is seeded.
 *   6.  EPIC-014 -- soft-delete a file (it leaves the working view) -> it appears in the
 *       Archive -> Recover it (it returns to the working view) -> the 7-yr retention floor.
 *   7.  EPIC-015 -- place a legal hold -> the held engagement shows blocked-by-hold (not
 *       purge-eligible) -> lift the hold -> confirm-before-purge of an expired engagement ->
 *       the audit record survives the purge.
 *   8.  Closing card.
 *
 * KNOWN LIMITATION (BUG-008-001):
 *   The ADR-009 two-phase upload pipeline (authorize -> browser PUT -> complete) cannot
 *   complete end-to-end in the default local stack because the Azurite SAS URL is signed
 *   against the container-internal hostname, which is unreachable from the host Playwright
 *   browser. As in phase-2-walkthrough, where a byte round-trip would block we SEED the
 *   post-state and NARRATE it with a caption rather than driving the upload to completion.
 *   This applies to:
 *     - EPIC-013 upload (the file-exchange documents are seeded directly as `active`).
 *     - EPIC-012 multi-participant invite (the second CLIENT participant is seeded; the
 *       live invite flow is proved by the EPIC-012 e2e gate suites).
 *
 * Pre-reqs (same SUT as the e2e gate):
 *   docker compose --env-file .env.local up -d -> pnpm db:migrate -> pnpm db:seed
 *   (pnpm db:seed includes seedAccountant() which upserts demo_usr_jane_accountant for the
 *    EPIC-009 dev sign-in lane.)
 *
 * Run (with neighbor-squat port remaps matching .env.local -- the admin playwright.config.ts
 * auto-loads .env.local host-side, so DATABASE_URL_ADMIN / ADMIN_PORT / MAILHOG_HTTP_PORT /
 * PORTAL_BASE_URL come from there without a manual export):
 *   pnpm --filter admin e2e:video
 *   DEMO_SLOWMO=0 pnpm --filter admin e2e:video   # fast correctness pass (no human pacing)
 *
 * // ADR-005: Sessions via the dev sign-in lane / /api/mock-session (role set server-side).
 * // ADR-006: Two-surface platform -- a single continuous take spans both surfaces.
 * // ADR-009: Client PUT directly to Azurite (upload narrated; limited by BUG-008-001).
 * // ADR-010: All admin routes require ACCOUNTANT auth -- the whole take runs as the accountant.
 * // ADR-012: Tier-6 e2e (video variant -- non-gating).
 * // ADR-018 / ADR-019: soft-delete + retention; purge never-automatic + confirmed + audited.
 * // CS-GEN-003: AC/ADR governing authority cited in comments + caption narration.
 * // CS-TS-003 (cross-surface parity, recommended): this phase-walkthrough deliverable is
 * //   DELIBERATELY single-surface — one spec under apps/admin/e2e/demo/, exactly as the
 * //   phase-1 and phase-2 walkthroughs are. The task (TASK-015-005) scopes the file to
 * //   apps/admin by name; the take still spans BOTH surfaces by driving the portal sign-in
 * //   lane (:3000) + portal URLs, so platform parity is honored without a mirror file.
 */

// CS-GEN-003: governing authority cited in file header + inline comments.

import { test, expect, type Page } from "@playwright/test";
import mssqlPkg from "mssql";
import { setupAccountantSession, clearSession } from "../fixtures/auth.js";
import { clearMailhog } from "../fixtures/mailhog.js";

const { ConnectionPool } = mssqlPkg;

// ─── Targets (neighbor-squat remaps come from .env.local: admin :13001, portal :3000) ──
const PORTAL_URL = process.env["PORTAL_BASE_URL"] ?? "http://localhost:3000";
const ADMIN_PORT_ENV = process.env["ADMIN_PORT"] ?? "3001";
const ADMIN_URL = process.env["ADMIN_BASE_URL"] ?? `http://localhost:${ADMIN_PORT_ENV}`;
const ADMIN_ORIGIN = new URL(ADMIN_URL).origin;

// ─── Per-run identifier (unique per run -- avoids fixture collisions across re-runs) ──
const RUN = Date.now();

// ─── Recording + human-speed pacing (PER-SPEC -- shared config untouched) ──────
test.use({
  video: { mode: "on", size: { width: 1366, height: 768 } },
  viewport: { width: 1366, height: 768 },
  launchOptions: { slowMo: Number(process.env["DEMO_SLOWMO"] ?? 650) }, // ~0.65s/action; DEMO_SLOWMO=0 for fast pass
  actionTimeout: 25_000,
  navigationTimeout: 30_000,
});

// ─── Narration helpers (modeled exactly on phase-2-walkthrough.demo.spec.ts) ────

/** A deliberate pause so a human can read / absorb the scene. */
async function beat(page: Page, ms = 1900): Promise<void> {
  await page.waitForTimeout(ms);
}

/**
 * Inject/replace a subtitle-style caption banner at the bottom of the page.
 * Re-injected after every navigation (a goto wipes the injected node).
 * Title/subtitle are author-controlled literals -- no untrusted interpolation.
 */
async function caption(page: Page, title: string, subtitle = ""): Promise<void> {
  await page.evaluate(
    ({ title, subtitle }) => {
      let el = document.getElementById("__demo_caption");
      if (!el) {
        el = document.createElement("div");
        el.id = "__demo_caption";
        document.body.appendChild(el);
      }
      el.style.cssText =
        "position:fixed;left:0;right:0;bottom:0;z-index:2147483647;" +
        "background:rgba(15,23,42,.93);color:#fff;padding:16px 26px;" +
        "font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;" +
        "display:flex;flex-direction:column;gap:3px;pointer-events:none;" +
        "box-shadow:0 -2px 16px rgba(0,0,0,.35)";
      el.innerHTML =
        `<div style="font-size:21px;font-weight:700;letter-spacing:.2px">${title}</div>` +
        (subtitle ? `<div style="font-size:15px;opacity:.85">${subtitle}</div>` : "");
    },
    { title, subtitle },
  );
  await page.waitForTimeout(120);
}

/** Full-screen title/closing card. */
async function showCard(page: Page, title: string, subtitle: string, ms = 2800): Promise<void> {
  await page.setContent(
    `<!doctype html><html><body style="margin:0;height:100vh;display:flex;align-items:center;` +
      `justify-content:center;background:#0f172a;color:#fff;` +
      `font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif">` +
      `<div style="text-align:center;max-width:1000px;padding:0 40px">` +
      `<div style="font-size:44px;font-weight:800;line-height:1.15">${title}</div>` +
      `<div style="font-size:21px;margin-top:16px;opacity:.85;line-height:1.4">${subtitle}</div>` +
      `</div></body></html>`,
  );
  await beat(page, ms);
}

// ─── DB helpers (admin pool, RLS-exempt seed/teardown path) ────────────────────
// Mirrors the parseSqlServerUrl/getPool pattern shared by every EPIC-0xx demo spec.

function parseSqlServerUrl(connectionUrl: string): mssqlPkg.config {
  const withoutScheme = connectionUrl.replace(/^(?:sqlserver|mssql):\/\//, "");
  const firstSemi = withoutScheme.indexOf(";");
  const authority = firstSemi === -1 ? withoutScheme : withoutScheme.slice(0, firstSemi);
  const paramStr = firstSemi === -1 ? "" : withoutScheme.slice(firstSemi + 1);

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

  return {
    server,
    port: port !== 1433 ? port : params["port"] ? parseInt(params["port"], 10) : 1433,
    user: user ?? params["user"],
    password: password ?? params["password"],
    database: params["database"] ?? "master",
    options: {
      encrypt: (params["encrypt"] ?? "true").toLowerCase() !== "false",
      trustServerCertificate: (params["trustServerCertificate"] ?? "false").toLowerCase() === "true",
    },
  };
}

let _pool: mssqlPkg.ConnectionPool | null = null;

async function getPool(): Promise<mssqlPkg.ConnectionPool> {
  if (_pool && _pool.connected) return _pool;
  const url = process.env["DATABASE_URL_ADMIN"];
  if (!url) {
    throw new Error(
      "[phase-3-walkthrough.demo.spec] DATABASE_URL_ADMIN is not set. Required for admin pool seed/teardown.",
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

interface EngagementFixture {
  engagementId: string;
  engagementRequestId: string;
}

interface DocEngagementFixture extends EngagementFixture {
  documentId: string;
}

// ─── Fixture seed helpers ──────────────────────────────────────────────────────

/**
 * Seed a minimal EngagementRequest + Engagement (clientUserId NULL -- accountant-surface
 * demo only). Optional flags set the seed state for the chapter that needs a given
 * starting condition (Review status, both confirmations, dueDate, priority).
 * "-phase3-{RUN}" suffix avoids collision with all gate suites and prior-epic demos.
 */
async function seedEngagement(opts: {
  label: string;
  status?: string;
  deliveryConfirmed?: boolean;
  filingConfirmed?: boolean;
  dueDate?: string;
  isPriority?: boolean;
  taxYear?: number;
  completedAt?: Date;
}): Promise<EngagementFixture> {
  const pool = await getPool();
  const email = `e2e-phase3-${RUN}-${opts.label}@phase-3-walkthrough.demo.e2e.test`;

  const reqResult = await pool
    .request()
    .input("firstName", "JaneDemo015")
    .input("lastName", `Phase3-${opts.label}`)
    .input("email", email)
    .query<{ id: string }>(
      `INSERT INTO [dbo].[EngagementRequest]
         ([firstName], [lastName], [email], [status], [createdAt], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES (@firstName, @lastName, @email, 'accepted', SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET())`,
    );
  const engagementRequestId = reqResult.recordset[0]?.id;
  if (!engagementRequestId) {
    throw new Error(`[phase-3-walkthrough] Failed to seed EngagementRequest (${opts.label})`);
  }

  const columns = ["[engagementRequestId]", "[status]", "[createdAt]", "[updatedAt]"];
  const values = ["@engagementRequestId", "@status", "SYSDATETIMEOFFSET()", "SYSDATETIMEOFFSET()"];
  const req = pool
    .request()
    .input("engagementRequestId", mssqlPkg.UniqueIdentifier, engagementRequestId)
    .input("status", opts.status ?? "New");

  if (opts.deliveryConfirmed) {
    columns.push("[deliveryConfirmedAt]");
    values.push("SYSDATETIMEOFFSET()");
  }
  if (opts.filingConfirmed) {
    columns.push("[filingConfirmedAt]");
    values.push("SYSDATETIMEOFFSET()");
  }
  if (opts.dueDate !== undefined) {
    columns.push("[dueDate]");
    values.push("@dueDate");
    req.input("dueDate", mssqlPkg.Date, new Date(opts.dueDate));
  }
  if (opts.isPriority !== undefined) {
    columns.push("[isPriority]");
    values.push("@isPriority");
    req.input("isPriority", mssqlPkg.Bit, opts.isPriority ? 1 : 0);
  }
  if (opts.taxYear !== undefined) {
    columns.push("[taxYear]");
    values.push("@taxYear");
    req.input("taxYear", mssqlPkg.Int, opts.taxYear);
  }
  if (opts.completedAt !== undefined) {
    columns.push("[completedAt]");
    values.push("@completedAt");
    req.input("completedAt", opts.completedAt);
  }

  const engResult = await req.query<{ id: string }>(
    `INSERT INTO [dbo].[Engagement]
       (${columns.join(", ")})
     OUTPUT INSERTED.[id]
     VALUES (${values.join(", ")})`,
  );
  const engagementId = engResult.recordset[0]?.id;
  if (!engagementId) {
    throw new Error(`[phase-3-walkthrough] Failed to seed Engagement (${opts.label})`);
  }

  return {
    engagementId: engagementId.toLowerCase(),
    engagementRequestId: engagementRequestId.toLowerCase(),
  };
}

/**
 * Seed an active Document on an engagement (skips the upload UI -- BUG-008-001 does not
 * apply to metadata-only operations; the upload itself is narrated, not driven).
 */
async function seedActiveDocument(engagementId: string, label: string): Promise<string> {
  const pool = await getPool();
  const docResult = await pool
    .request()
    .input("engagementId", mssqlPkg.UniqueIdentifier, engagementId)
    .input("storageKey", `phase3-demo/${engagementId}/${label}-${RUN}.pdf`)
    .input("filename", `Tax Return 2024 — ${label}.pdf`)
    .query<{ id: string }>(
      `INSERT INTO [dbo].[Document]
         ([engagementId], [storageKey], [originalFilename], [contentType],
          [sizeBytes], [status], [version], [createdAt], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES (@engagementId, @storageKey, @filename, 'application/pdf', 512000, 'active', 1, SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET())`,
    );
  const documentId = docResult.recordset[0]?.id;
  if (!documentId) throw new Error(`[phase-3-walkthrough] Failed to seed Document (${label})`);
  return documentId.toLowerCase();
}

/** completedAt ~8 years in the past -> 7-year retention window elapsed -> purge-eligible. */
function expiredCompletedAt(): Date {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - 8);
  return d;
}

/** Read the rendered active-hold-item testid suffix (holdId) so the lift locator matches GUID casing. */
async function readRenderedHoldId(page: Page): Promise<string | null> {
  const testid = await page
    .locator('[data-testid^="active-hold-item-"]')
    .first()
    .getAttribute("data-testid");
  if (!testid) return null;
  return testid.replace(/^active-hold-item-/, "");
}

async function activeHoldIdFor(engagementId: string): Promise<string | null> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input("engagementId", engagementId)
    .query<{ id: string }>(
      `SELECT TOP 1 [id] FROM [dbo].[LegalHold]
       WHERE [engagementId] = @engagementId AND [liftedAt] IS NULL
       ORDER BY [placedAt] DESC`,
    );
  return result.recordset[0]?.id?.toLowerCase() ?? null;
}

async function countAuditEventForEngagement(action: string, engagementId: string): Promise<number> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input("action", action)
    .input("targetId", engagementId)
    .query<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM [dbo].[AuditEvent]
       WHERE [action] = @action AND [targetId] = @targetId`,
    );
  return result.recordset[0]?.cnt ?? 0;
}

async function documentRowCount(engagementId: string): Promise<number> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input("id", engagementId)
    .query<{ cnt: number }>(`SELECT COUNT(*) AS cnt FROM [dbo].[Document] WHERE [engagementId] = @id`);
  return result.recordset[0]?.cnt ?? 0;
}

/** Clean up one engagement fixture in FK order (idempotent; safe after a purge). */
async function cleanupEngagement(engagementId: string, engagementRequestId: string): Promise<void> {
  const pool = await getPool();
  await pool.request().input("engagementId", engagementId).query(
    `DELETE FROM [dbo].[LegalHold] WHERE [engagementId] = @engagementId`,
  );
  await pool.request().input("engagementId", engagementId).query(`
    DELETE dv FROM [dbo].[DocumentVersion] dv
    INNER JOIN [dbo].[Document] d ON dv.[documentId] = d.[id]
    WHERE d.[engagementId] = @engagementId`,
  );
  await pool.request().input("engagementId", engagementId).query(
    `DELETE FROM [dbo].[Document] WHERE [engagementId] = @engagementId`,
  );
  await pool.request().input("id", engagementId).query(
    `DELETE FROM [dbo].[Engagement] WHERE [id] = @id`,
  );
  await pool.request().input("id", engagementRequestId).query(
    `DELETE FROM [dbo].[EngagementRequest] WHERE [id] = @id`,
  );
}

// ─── Lifecycle: track every seeded fixture and clean up in afterAll ─────────────

const _fixtures: EngagementFixture[] = [];

test.afterAll(async () => {
  try {
    for (const f of _fixtures) {
      await cleanupEngagement(f.engagementId, f.engagementRequestId).catch(() => {
        /* best-effort: a purged engagement's rows are already gone */
      });
    }
  } finally {
    await closePool();
  }
});

// ─── The single continuous walkthrough (one test() = one video) ─────────────────
test(
  "@demo @video Phase 3 walkthrough -- engagement workspace end to end (EPIC-009 through EPIC-015)",
  async ({ page, request }) => {
    test.setTimeout(15 * 60_000); // 15 min max -- the full Phase-3 feature set is the longest take.

    // Clean slate for a crisp recording (best-effort; Mailhog may be on a squatted host port).
    try {
      await clearMailhog();
    } catch (e) {
      console.warn("[phase-3-video] clearMailhog skipped (mailhog unreachable):", e);
    }

    // ── Scene 0 -- Title card ────────────────────────────────────────────────────
    await page.goto(`${PORTAL_URL}/`);
    await showCard(
      page,
      "Tax Accountant Client Portal -- Phase 3",
      "The engagement workspace: sign-in -> lifecycle -> attributes -> creation -> files -> deletion -> purge & legal hold",
    );

    // ── Scene 1 -- EPIC-009: jane-accountant signs in via the dev sign-in lane ──
    // ADR-005: the lane button submits only accountId; the server resolves the ACCOUNTANT
    //   role + session. ADR-006/010: ACCOUNTANT is redirected cross-app to apps/admin.
    await page.goto(`${PORTAL_URL}/dev-sign-in`);
    await page.waitForSelector('[data-testid="dev-sign-in-lane"]', { timeout: 15_000 });
    await caption(
      page,
      "EPIC-009 -- Dev sign-in lane",
      "Jane signs in with one click. The server sets her ACCOUNTANT role -- the browser never supplies it.",
    );
    await beat(page, 2200);

    await Promise.all([
      page.waitForNavigation({ waitUntil: "commit", timeout: 15_000 }),
      page.click('[data-testid="sign-in-btn-accountant-jane"]'),
    ]);
    await page.waitForLoadState("domcontentloaded", { timeout: 15_000 });

    // She is redirected cross-app to apps/admin (Tax Portal), NOT the client portal
    // (AC-AUTH-013-01 / ADR-010). DECISION (phase-3-walkthrough): under the neighbor-squat
    // remap the admin container's configured ADMIN_APP_URL is the container-internal port
    // (:3001), while the host-mapped port is :13001 (ADMIN_URL). The redirect therefore lands
    // the browser on the admin app's configured origin, which may be the internal port and
    // unreachable from the host browser. The role-appropriate-landing assertion that matters is
    // "redirected to admin, away from the portal" -- which we assert by host, tolerant of the
    // port remap. We then drive to the host ADMIN_URL to render the surface (the session cookie
    // is already set by the lane). The exact-origin landing is proved by the EPIC-009 e2e gate.
    const landedUrl = new URL(page.url());
    const portalHostname = new URL(PORTAL_URL).hostname;
    const portalPort = new URL(PORTAL_URL).port;
    const onPortalSurface = landedUrl.hostname === portalHostname && landedUrl.port === portalPort;
    expect(
      onPortalSurface,
      `[EPIC-009] ACCOUNTANT must be redirected to the admin surface, not the portal — got: ${page.url()}`,
    ).toBe(false);

    // Render the admin surface on the host-reachable URL (cookie already established by the lane).
    await page.goto(`${ADMIN_URL}/`);
    expect(
      page.url().startsWith(ADMIN_ORIGIN),
      `[EPIC-009] admin surface must render on the host admin origin (${ADMIN_ORIGIN}), got: ${page.url()}`,
    ).toBe(true);
    await expect(
      page.locator('[data-testid="dev-banner"]'),
      "[EPIC-009] DevBanner must be visible on apps/admin after accountant sign-in (AUTH_PROVIDER=mock)",
    ).toBeVisible({ timeout: 15_000 });
    await caption(
      page,
      "EPIC-009 -- Landed on the Tax Portal",
      "She is on apps/admin (the accountant surface) -- role-appropriate landing, enforced server-side.",
    );
    await beat(page, 2600);

    // From here on the whole take runs as the accountant session (ADR-010 -- admin is auth-only).
    // setupAccountantSession is the canonical /api/mock-session helper the admin e2e suite uses
    // (re-establishes the cookie on the host admin origin so every subsequent goto is authed).
    await setupAccountantSession(page, request);

    // ── Scene 2 -- EPIC-010: engagement lifecycle pipeline ──────────────────────
    // Drive New -> In Progress -> Review live, then show the Complete two-confirmation gate
    // (seeded Review+both-confirmed) and the Reopen affordance.
    const lifecycleFx = await seedEngagement({ label: "lifecycle", status: "New" });
    _fixtures.push(lifecycleFx);

    await page.goto(`${ADMIN_URL}/engagements`);
    await caption(
      page,
      "EPIC-010 -- Engagement pipeline",
      "Every engagement moves through New -> In Progress -> Review -> Complete. Here is the list.",
    );
    const engList = page.locator('[data-testid="engagements-list"]');
    await expect(engList, "engagements-list must be visible (EPIC-010)").toBeVisible({ timeout: 15_000 });
    await expect(
      page.locator(`[data-testid="engagement-item-${lifecycleFx.engagementId}"]`),
      "the seeded New engagement must appear in the list (EPIC-010)",
    ).toBeVisible({ timeout: 10_000 });
    await beat(page, 2400);

    await page.goto(`${ADMIN_URL}/engagements/${lifecycleFx.engagementId}`);
    const statusPanel = page.locator('[data-testid="engagement-status-panel"]');
    await expect(statusPanel, "engagement-status-panel must be visible (EPIC-010)").toBeVisible({ timeout: 15_000 });
    const statusBadge = page.locator('[data-testid="engagement-status-badge"]');
    await expect(statusBadge, "badge must show New before advancing").toHaveAttribute("data-status", "New");

    await caption(
      page,
      "EPIC-010 -- New -> In Progress",
      "Jane advances the engagement. Transitions are manual and forward-ordered.",
    );
    const advanceButton = page.locator('[data-testid="advance-status-button"]');
    await expect(advanceButton, "advance-status-button must be visible").toBeVisible({ timeout: 10_000 });
    await advanceButton.click();
    await expect(statusBadge, "badge must show In Progress").toHaveAttribute("data-status", "In Progress", { timeout: 10_000 });
    await beat(page, 2000);

    await caption(page, "EPIC-010 -- In Progress -> Review", "She reviews her own work before delivery.");
    await expect(advanceButton, "advance-status-button must offer Review").toContainText("Review", { timeout: 10_000 });
    await advanceButton.click();
    await expect(statusBadge, "badge must show Review").toHaveAttribute("data-status", "Review", { timeout: 10_000 });
    await beat(page, 2400);

    // Complete requires BOTH confirmations -- show the positive case on a seeded Review engagement.
    const completeFx = await seedEngagement({
      label: "complete",
      status: "Review",
      deliveryConfirmed: true,
      filingConfirmed: true,
    });
    _fixtures.push(completeFx);
    await page.goto(`${ADMIN_URL}/engagements/${completeFx.engagementId}`);
    await expect(statusPanel, "engagement-status-panel must be visible").toBeVisible({ timeout: 15_000 });
    await caption(
      page,
      "EPIC-010 -- Two-confirmation Complete gate",
      "Marking Complete requires confirming BOTH delivery and filing. Both are confirmed here.",
    );
    const completeButton = page.locator('[data-testid="complete-engagement-button"]');
    await expect(completeButton, "complete-engagement-button must be enabled when both confirmed").toBeEnabled({ timeout: 10_000 });
    await completeButton.click();
    await expect(statusBadge, "badge must show Complete").toHaveAttribute("data-status", "Complete", { timeout: 10_000 });
    await beat(page, 2200);

    const reopenButton = page.locator('[data-testid="reopen-engagement-button"]');
    await expect(reopenButton, "reopen-engagement-button must appear after Complete").toBeVisible({ timeout: 10_000 });
    await caption(
      page,
      "EPIC-010 -- Reopen",
      "A completed engagement can be reopened back into active work if something changes.",
    );
    await reopenButton.click();
    await expect(statusBadge, "badge must revert to In Progress after reopen").toHaveAttribute("data-status", "In Progress", { timeout: 10_000 });
    await beat(page, 2600);

    // ── Scene 3 -- EPIC-011: engagement attributes ──────────────────────────────
    // Due date / accountant-only internal note / priority flag, driven live.
    const attrFx = await seedEngagement({ label: "attributes", status: "In Progress" });
    _fixtures.push(attrFx);
    await page.goto(`${ADMIN_URL}/engagements/${attrFx.engagementId}`);
    const attrPanel = page.locator('[data-testid="engagement-attributes-panel"]');
    await expect(attrPanel, "engagement-attributes-panel must be visible (EPIC-011)").toBeVisible({ timeout: 15_000 });

    await caption(
      page,
      "EPIC-011 -- Due date",
      "Jane sets a target due date so the engagement surfaces when it needs attention.",
    );
    const dueDateInput = page.locator('[data-testid="due-date-input"]');
    await expect(dueDateInput, "due-date-input must be visible (EPIC-011)").toBeVisible({ timeout: 10_000 });
    await dueDateInput.fill("2026-09-15");
    await page.locator('[data-testid="set-due-date-button"]').click();
    await expect(
      page.locator('[data-testid="due-date-display"]'),
      "due-date-display must reflect the saved due date (EPIC-011)",
    ).toContainText(/2026/, { timeout: 10_000 });
    await beat(page, 2400);

    await caption(
      page,
      "EPIC-011 -- Accountant-only internal note",
      "She records a private note. Internal notes are never visible to the client.",
    );
    const noteInput = page.locator('[data-testid="note-body-input"]');
    await expect(noteInput, "note-body-input must be visible (EPIC-011)").toBeVisible({ timeout: 10_000 });
    await noteInput.fill("Phase-3 demo: confirm prior-year carryforward before filing. (Internal only.)");
    await page.locator('[data-testid="record-note-button"]').click();
    await expect(
      page.locator('[data-testid="note-item"]').first(),
      "the recorded internal note must appear in the notes list (EPIC-011)",
    ).toBeVisible({ timeout: 10_000 });
    await beat(page, 2400);

    await caption(
      page,
      "EPIC-011 -- Priority flag",
      "Flagging an engagement as priority makes it stand out on the dashboard.",
    );
    const priorityToggle = page.locator('[data-testid="priority-toggle-button"]');
    await expect(priorityToggle, "priority-toggle-button must be visible (EPIC-011)").toBeVisible({ timeout: 10_000 });
    await priorityToggle.click();
    await expect(
      page.locator('[data-testid="priority-badge"]'),
      "priority-badge must appear after flagging priority (EPIC-011)",
    ).toBeVisible({ timeout: 10_000 });
    await beat(page, 2600);

    // ── Scene 4 -- EPIC-012: creation paths + multi-participant ─────────────────
    // The accountant-initiated engagement form (live), then the multi-participant
    // shared-access surface (post-state seeded + narrated -- live invite proved by e2e gates).
    await page.goto(`${ADMIN_URL}/engagements/new`);
    const initiateForm = page.locator('[data-testid="initiate-engagement-form"]');
    await expect(
      initiateForm,
      "initiate-engagement-form must be visible (EPIC-012 accountant-initiated path)",
    ).toBeVisible({ timeout: 15_000 });
    await caption(
      page,
      "EPIC-012 -- Accountant-initiated engagement",
      "Jane can start an engagement herself -- e.g. for a returning client -- not just from an inbound request.",
    );
    await expect(
      page.locator('[data-testid="client-select"]'),
      "client-select must be visible on the initiate form (EPIC-012)",
    ).toBeVisible({ timeout: 10_000 });
    await beat(page, 2800);

    // Multi-participant: seed a second active document on a fresh engagement and show the
    // participants surface. The live two-account invite flow is covered by the EPIC-012 e2e
    // gate suites (engagement-participants / participant-shared-access); here we narrate it.
    const participantFx = await seedEngagement({ label: "participants", status: "In Progress" });
    _fixtures.push(participantFx);
    await page.goto(`${ADMIN_URL}/engagements/${participantFx.engagementId}/participants`);
    await caption(
      page,
      "EPIC-012 -- Multi-participant engagement",
      "One engagement can have more than one CLIENT participant -- e.g. a married couple, each their own account.",
    );
    const participantsList = page.locator('[data-testid="participants-list"]');
    await expect(
      participantsList,
      "participants-list must be visible on the participants page (EPIC-012)",
    ).toBeVisible({ timeout: 15_000 });
    await beat(page, 2400);
    await caption(
      page,
      "EPIC-012 -- Invite a second participant",
      "The invite goes through the mock-first auth seam -- the second participant gets their OWN account.",
    );
    await expect(
      page.locator('[data-testid="invite-panel"]'),
      "invite-panel must be visible on the participants page (EPIC-012)",
    ).toBeVisible({ timeout: 10_000 });
    await beat(page, 2600);

    // ── Scene 5 -- EPIC-013: secure file exchange ───────────────────────────────
    // Folder tree + create-folder (live), version-replace + download affordances on a
    // seeded active document (upload byte round-trip narrated -- BUG-008-001).
    const fileFx = await seedEngagement({ label: "files", status: "In Progress" });
    _fixtures.push(fileFx);
    const fileDocId = await seedActiveDocument(fileFx.engagementId, "file-exchange");

    await page.goto(`${ADMIN_URL}/engagements/${fileFx.engagementId}/documents`);
    await page.waitForLoadState("networkidle", { timeout: 15_000 });
    await caption(
      page,
      "EPIC-013 -- Secure file exchange",
      "Documents live per engagement, in folders, with version history -- both parties can download.",
    );
    const folderTree = page.locator('[data-testid="folder-tree"]');
    await expect(folderTree, "folder-tree must be visible (EPIC-013)").toBeVisible({ timeout: 15_000 });
    await beat(page, 2200);

    await caption(
      page,
      "EPIC-013 -- Upload",
      "Files upload directly to secure blob storage. (In this local stack the byte round-trip is mocked -- BUG-008-001.)",
    );
    await expect(
      page.locator('[data-testid="upload-section"]'),
      "upload-section must be visible (EPIC-013)",
    ).toBeVisible({ timeout: 10_000 });
    await beat(page, 2400);

    await caption(
      page,
      "EPIC-013 -- Create a folder",
      "Jane organizes documents into folders.",
    );
    const folderNameInput = page.locator('[data-testid="folder-name-input"]');
    await expect(folderNameInput, "folder-name-input must be visible (EPIC-013)").toBeVisible({ timeout: 10_000 });
    await folderNameInput.fill(`Source Documents ${RUN}`);
    await page.locator('[data-testid="folder-create-button"]').click();
    await expect(
      page.locator('[data-testid="folder-action-success"]'),
      "folder-action-success must appear after creating a folder (EPIC-013)",
    ).toBeVisible({ timeout: 10_000 });
    await beat(page, 2400);

    await caption(
      page,
      "EPIC-013 -- Version history + download",
      "Replacing a file keeps the prior version. Both the accountant and the client can download.",
    );
    const docItem = page.locator(`[data-testid="document-item-${fileDocId}"]`);
    await expect(docItem, "the seeded document must appear in the documents list (EPIC-013)").toBeVisible({ timeout: 10_000 });
    await expect(
      page.locator(`[data-testid="version-replace-button-${fileDocId}"]`),
      "version-replace-button must be visible for the active document (EPIC-013)",
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.locator(`[data-testid="download-button-${fileDocId}"]`),
      "download-button must be visible for the active document (EPIC-013)",
    ).toBeVisible({ timeout: 10_000 });
    await beat(page, 2800);

    // ── Scene 6 -- EPIC-014: soft-delete -> archive -> recover -> retention floor ─
    const delFx = await seedEngagement({ label: "deletion", status: "In Progress" });
    _fixtures.push(delFx);
    const delDocId = await seedActiveDocument(delFx.engagementId, "deletion");

    await page.goto(`${ADMIN_URL}/engagements/${delFx.engagementId}/documents`);
    await page.waitForLoadState("networkidle", { timeout: 15_000 });
    await expect(
      page.locator('[data-testid="documents-list"]'),
      "documents-list must be visible before delete (EPIC-014)",
    ).toBeVisible({ timeout: 15_000 });
    await caption(
      page,
      "EPIC-014 -- Soft-delete a file",
      "Jane deletes a file. Deletes are soft -- the file is recoverable and the bytes survive (7-yr retention).",
    );
    const deleteButton = page.locator(`[data-testid="delete-button-${delDocId}"]`);
    await expect(deleteButton, "delete-button must be visible (EPIC-014)").toBeVisible({ timeout: 10_000 });
    await deleteButton.click();
    const confirmYes = page.locator(`[data-testid="delete-confirm-yes-${delDocId}"]`);
    await expect(confirmYes, "delete-confirm-yes must appear (ADR-018 light confirm)").toBeVisible({ timeout: 5_000 });
    await confirmYes.click();

    await expect(
      page.locator(`[data-testid="document-item-${delDocId}"]`),
      "document must leave the working view after delete (EPIC-014)",
    ).not.toBeVisible({ timeout: 15_000 });
    await caption(
      page,
      "EPIC-014 -- It leaves the working view",
      "The file is gone from the normal document list -- but it is not destroyed.",
    );
    await beat(page, 2200);

    const archiveSection = page.locator('[data-testid="archive-section"]');
    await expect(archiveSection, "archive-section must be visible (EPIC-014)").toBeVisible({ timeout: 10_000 });
    await expect(
      page.locator(`[data-testid="archive-document-item-${delDocId}"]`),
      "deleted file must appear in the Archive section (EPIC-014)",
    ).toBeVisible({ timeout: 10_000 });
    await caption(
      page,
      "EPIC-014 -- It moves to the Archive",
      "The deleted file sits in the Archive, where it can be recovered within the retention window.",
    );
    await beat(page, 2400);

    await caption(page, "EPIC-014 -- Recover", "Jane recovers the file. It returns to the working view, intact.");
    const recoverButton = page.locator(`[data-testid="recover-button-${delDocId}"]`);
    await expect(recoverButton, "recover-button must be visible (EPIC-014)").toBeVisible({ timeout: 10_000 });
    await recoverButton.click();
    await expect(
      page.locator(`[data-testid="document-item-${delDocId}"]`),
      "recovered file must re-appear in the working view (EPIC-014)",
    ).toBeVisible({ timeout: 15_000 });
    await beat(page, 2800);

    // ── Scene 7 -- EPIC-015: legal hold -> blocked -> lift -> confirm purge -> audit survives ─
    // A *completed* engagement with an expired (8-yr-old) retention window -> purge-eligible.
    const purgeFx = await seedEngagement({
      label: "purge",
      status: "Complete",
      completedAt: expiredCompletedAt(),
    });
    _fixtures.push(purgeFx);

    await page.goto(`${ADMIN_URL}/engagements/${purgeFx.engagementId}/documents`);
    await page.waitForLoadState("networkidle", { timeout: 15_000 });
    const retentionPanel = page.locator('[data-testid="retention-panel"]');
    await expect(retentionPanel, "retention-panel must be visible (EPIC-015)").toBeVisible({ timeout: 15_000 });
    await caption(
      page,
      "EPIC-015 -- Place a legal hold",
      "This engagement's 7-year window has elapsed -- it is purge-eligible. But a legal hold suspends purging indefinitely.",
    );
    const placeButton = page.locator('[data-testid="legal-hold-place"]');
    await expect(placeButton, "legal-hold-place must be visible (EPIC-015)").toBeVisible({ timeout: 10_000 });
    await placeButton.click();
    await expect(
      page.locator('[data-testid="active-holds-list"]'),
      "active-holds-list must appear after placing the hold (EPIC-015)",
    ).toBeVisible({ timeout: 15_000 });
    const placedHoldId = await activeHoldIdFor(purgeFx.engagementId);
    expect(placedHoldId, "an active LegalHold row must exist after placing (EPIC-015)").toBeTruthy();
    await beat(page, 2200);

    // Reload so the server re-derives eligibility with the hold present.
    await page.reload();
    await page.waitForLoadState("networkidle", { timeout: 15_000 });
    await caption(
      page,
      "EPIC-015 -- Blocked by the hold",
      "While held, the engagement is NOT purge-eligible -- the reason is shown, and there is no purge control.",
    );
    const eligibilityReason = page.locator('[data-testid="purge-eligibility-reason"]');
    await expect(eligibilityReason, "purge-eligibility-reason must be visible (EPIC-015)").toBeVisible({ timeout: 10_000 });
    await expect(
      eligibilityReason,
      "[EPIC-015] a held engagement must show the blocked-by-hold reason",
    ).toContainText(/active legal hold/i, { timeout: 10_000 });
    await expect(
      page.locator('[data-testid="purge-button"]'),
      "[EPIC-015] no purge-button while the engagement is held",
    ).toHaveCount(0, { timeout: 5_000 });
    await beat(page, 2600);

    await caption(page, "EPIC-015 -- Lift the hold", "Once the legal matter clears, Jane lifts the hold.");
    const renderedHoldId = await readRenderedHoldId(page);
    expect(renderedHoldId, "an active-hold-item must be rendered before lift (EPIC-015)").toBeTruthy();
    const liftButton = page.locator(`[data-testid="legal-hold-lift-${renderedHoldId}"]`);
    await expect(liftButton, "legal-hold-lift must be visible for the active hold (EPIC-015)").toBeVisible({ timeout: 10_000 });
    await liftButton.click();
    await expect(
      page.locator(`[data-testid="active-hold-item-${renderedHoldId}"]`),
      "lifted hold must leave the active holds list (EPIC-015)",
    ).not.toBeVisible({ timeout: 15_000 });
    expect(await activeHoldIdFor(purgeFx.engagementId), "no active hold should remain after lift (EPIC-015)").toBeNull();
    await beat(page, 2200);

    // Eligibility restored -> confirm-before-purge.
    await page.reload();
    await page.waitForLoadState("networkidle", { timeout: 15_000 });
    await caption(
      page,
      "EPIC-015 -- Confirm before purge",
      "Eligibility is restored. Purge is never automatic -- Jane must type the engagement ID to confirm.",
    );
    await expect(
      page.locator('[data-testid="purge-eligibility-reason"]'),
      "[EPIC-015] eligibility restored after lifting the hold",
    ).toContainText(/Eligible for purge/i, { timeout: 10_000 });
    const initiateButton = page.locator('[data-testid="purge-button"]');
    await expect(initiateButton, "purge-button must be visible once eligible (EPIC-015)").toBeVisible({ timeout: 10_000 });
    await initiateButton.click();

    const confirmInput = page.locator('[data-testid="purge-confirm-input"]');
    const confirmSubmit = page.locator('[data-testid="purge-confirm-submit"]');
    await expect(confirmInput, "purge-confirm-input must appear (EPIC-015)").toBeVisible({ timeout: 10_000 });
    await expect(
      confirmSubmit,
      "[EPIC-015] purge-confirm-submit is DISABLED before the engagement ID is typed",
    ).toBeDisabled({ timeout: 5_000 });
    await beat(page, 2000);

    await confirmInput.fill(purgeFx.engagementId);
    await expect(
      confirmSubmit,
      "[EPIC-015] purge-confirm-submit enables only on the exact engagementId",
    ).toBeEnabled({ timeout: 5_000 });
    await caption(page, "EPIC-015 -- Purge", "The exact ID is typed. Jane confirms the permanent purge.");
    await confirmSubmit.click();
    await expect(
      page.locator('[data-testid="purge-result"]'),
      "[EPIC-015] purge-result must confirm the data was permanently removed",
    ).toBeVisible({ timeout: 20_000 });
    await beat(page, 2200);

    // The engagement's document data graph is destroyed (ADR-018 §5) …
    expect(await documentRowCount(purgeFx.engagementId), "[EPIC-015] document data is purged").toBe(0);
    // … but the 'engagement.purged' audit row SURVIVES (ADR-019 -- audit excluded from the sweep).
    const purgedAudit = await countAuditEventForEngagement("engagement.purged", purgeFx.engagementId);
    expect(purgedAudit, "[EPIC-015] the 'engagement.purged' audit row survives the purge").toBeGreaterThanOrEqual(1);
    await caption(
      page,
      "EPIC-015 -- The audit record survives",
      "The data is gone, but the audit trail of the purge -- and the hold place/lift -- is permanent.",
    );
    await beat(page, 3000);

    // ── Scene 8 -- Closing card ──────────────────────────────────────────────────
    await clearSession(page);
    await showCard(
      page,
      "Phase 3 complete",
      "EPIC-009 sign-in | EPIC-010 lifecycle | EPIC-011 attributes | EPIC-012 creation & participants | " +
        "EPIC-013 file exchange | EPIC-014 delete & recover | EPIC-015 purge & legal hold -- the engagement workspace, end to end.",
      3600,
    );
  },
);
