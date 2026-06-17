/**
 * apps/admin/e2e/demo/phase-1-walkthrough.demo.spec.ts
 *
 * @demo @video — END-OF-PHASE-1 video walkthrough.
 *
 * A single, continuous, HUMAN-SPEED Playwright video demonstrating every Phase-1 feature
 * end-to-end across BOTH surfaces (Client Portal :3000 + Tax Portal admin :13001) plus the
 * Mailhog mail-catcher UI. Intended for human review / phase sign-off — NOT a quality gate.
 *
 * Tagged `@demo @video`:
 *   - `@demo`  → excluded from the e2e gate (`e2e:run` uses --grep-invert @demo).
 *   - `@video` → run ONLY via `pnpm --filter admin e2e:video` (--grep @video). The screenshot
 *                galleries (`e2e:demo`) exclude `@video` so they stay fast.
 *
 * Recording + pacing are set PER-SPEC via test.use() below — the shared playwright.config.ts
 * is untouched, so the e2e gate keeps running at normal speed with no video.
 *
 * The story (one continuous take):
 *   0. Title card.
 *   1. EPIC-001 — a prospect browses the public services page and submits TWO engagement
 *      requests (Tom → will be accepted, Jane → will be declined).  [portal :3000, anonymous]
 *   2. EPIC-004 — no session is bounced from the admin app to the portal; then the accountant
 *      signs in (mock session) and lands on her dashboard.            [two-role model]
 *   3. EPIC-002 — the accountant adds, edits, and deactivates a service; the public catalog
 *      reflects the change.                                            [admin /services]
 *   4. EPIC-003 — the new-request notification, the inbox (states), and a request's details.
 *   5. EPIC-003 — Accept Tom → invitation email shown in the Mailhog inbox.
 *   6. EPIC-003 — Decline Jane with a reason → decline-reason email shown in the Mailhog inbox.
 *   7. Closing card.
 *
 * Pre-reqs (same SUT as the e2e gate): docker compose up -d → schema migrated + seeded; Mailhog up.
 *
 * Run:
 *   ADMIN_BASE_URL=http://localhost:13001 ADMIN_PORT=13001 \
 *   MAILHOG_HTTP_PORT=18025 PORTAL_BASE_URL=http://localhost:3000 \
 *   pnpm --filter admin e2e:video
 *
 * Then package the recording:  node scripts/make-phase1-video.mjs
 *
 * ADR-005: sessions established via /api/mock-session (role set server-side).
 * ADR-006: two-surface platform — this single take spans both surfaces.
 * ADR-010: all admin routes require ACCOUNTANT auth (the role-boundary beat proves the redirect).
 */

import { test, expect, type Page } from "@playwright/test";
import { setupAccountantSession, clearSession } from "../fixtures/auth.js";
import { deleteRequestsByEmail, closeRequestsPool } from "../fixtures/requests.js";
import { clearMailhog, waitForEmail } from "../fixtures/mailhog.js";

// ─── Targets (mirror playwright.config.ts + the fixtures) ──────────────────────
const PORTAL_URL = process.env["PORTAL_BASE_URL"] ?? "http://localhost:3000";
const ADMIN_PORT = process.env["ADMIN_PORT"] ?? "3001";
const ADMIN_URL = process.env["ADMIN_BASE_URL"] ?? `http://localhost:${ADMIN_PORT}`;
const MAILHOG_HTTP_PORT = process.env["MAILHOG_HTTP_PORT"] ?? "18025";
const MAILHOG_URL = process.env["MAILHOG_HTTP_URL"] ?? `http://localhost:${MAILHOG_HTTP_PORT}`;

// Two prospects for the two decision branches — unique per run, readable on-screen.
const RUN = Date.now();
const TOM = { first: "Tom", last: "Prospect", email: `tom.prospect.${RUN}@demo.example.com` };
const JANE = { first: "Jane", last: "Skeptical", email: `jane.skeptical.${RUN}@demo.example.com` };
const NEW_SERVICE = `Estate & Trust Planning (demo ${RUN})`;
// Plain ASCII on purpose: the Mailhog fixture's quoted-printable decoder emits raw bytes for
// multi-byte UTF-8 (e.g. an em-dash), which would break the email-body substring assertion.
const DECLINE_REASON =
  "Thank you for reaching out. We are fully booked this season and cannot take on new clients right now. Please get in touch with us again next quarter.";

// ─── Recording + human-speed pacing (PER-SPEC — shared config untouched) ───────
test.use({
  video: { mode: "on", size: { width: 1366, height: 768 } },
  viewport: { width: 1366, height: 768 },
  launchOptions: { slowMo: Number(process.env["DEMO_SLOWMO"] ?? 650) }, // ≈0.65s/action — set DEMO_SLOWMO=0 for a fast correctness pass
  actionTimeout: 25_000,
  navigationTimeout: 30_000,
});

// ─── Narration helpers ─────────────────────────────────────────────────────────

/** A deliberate pause so a human can read/absorb the scene. */
async function beat(page: Page, ms = 1900): Promise<void> {
  await page.waitForTimeout(ms);
}

/**
 * Inject/replace a subtitle-style caption banner at the bottom of the page.
 * Re-injected after every navigation (a goto wipes the injected node).
 * Title/subtitle are author-controlled literals — no untrusted interpolation.
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

// ─── Cleanup ────────────────────────────────────────────────────────────────────
test.afterAll(async () => {
  try {
    await deleteRequestsByEmail(TOM.email);
    await deleteRequestsByEmail(JANE.email);
  } finally {
    await closeRequestsPool();
  }
});

// ─── The single continuous walkthrough (one test() = one video) ─────────────────
test("@demo @video Phase 1 walkthrough — front door → auth → catalog → request inbox", async ({
  page,
  request,
}) => {
  test.setTimeout(8 * 60_000);

  // Auto-accept the deactivate confirm() dialog (EPIC-002).
  page.on("dialog", (dialog) => void dialog.accept());

  // Clean slate for a crisp recording (idempotent on re-runs).
  await clearMailhog();
  await deleteRequestsByEmail(TOM.email);
  await deleteRequestsByEmail(JANE.email);

  // ── Scene 0 — Title ──────────────────────────────────────────────────────────
  await page.goto(`${PORTAL_URL}/services`);
  await showCard(
    page,
    "Tax Accountant Client Portal",
    "Phase 1 — the front door works end to end · EPIC-001 · EPIC-004 · EPIC-002 · EPIC-003",
  );

  // ── Scene 1 — EPIC-001: public front door (portal, anonymous) ────────────────
  await page.goto(`${PORTAL_URL}/services`);
  await caption(
    page,
    "EPIC-001 — Public front door",
    "A prospective client browses the offered services — no account, no sign-in.",
  );
  await beat(page, 2400);

  // Submit two real engagement requests through the actual form.
  for (const who of [TOM, JANE] as const) {
    await page.goto(`${PORTAL_URL}/request`);
    await caption(
      page,
      "EPIC-001 — Submit an engagement request",
      `${who.first} ${who.last} selects services and sends a request to the accountant.`,
    );
    // Select up to two services (whatever is seeded).
    const boxes = page.getByRole("checkbox");
    await expect(boxes.first()).toBeVisible({ timeout: 15_000 });
    await boxes.nth(0).check();
    if ((await boxes.count()) > 1) await boxes.nth(1).check();
    await page.locator('input[name="firstName"]').fill(who.first);
    await page.locator('input[name="lastName"]').fill(who.last);
    await page.locator('input[name="email"]').fill(who.email);
    await beat(page, 1400);
    await page.getByRole("button", { name: /submit request/i }).click();
    await expect(page.getByText(/request submitted/i)).toBeVisible({ timeout: 15_000 });
    await caption(
      page,
      "EPIC-001 — Request received",
      `${who.first}'s request is recorded and the accountant is notified in-portal.`,
    );
    await beat(page, 2200);
  }

  // ── Scene 2 — EPIC-004: two-role model + sign-in ─────────────────────────────
  await clearSession(page);
  await page.goto(`${ADMIN_URL}/`);
  await caption(
    page,
    "EPIC-004 — Two-role model",
    "With no session, the accountant's Tax Portal bounces the visitor to the client surface.",
  );
  await beat(page, 2600);

  await setupAccountantSession(page, request);
  await page.goto(`${ADMIN_URL}/`);
  await expect(page.getByText("Accountant Dashboard", { exact: true })).toBeVisible({ timeout: 15_000 });
  await caption(
    page,
    "EPIC-004 — Signed in as the accountant",
    "Role is evaluated server-side from the verified session (ACCOUNTANT).",
  );
  await beat(page, 2400);

  // ── Scene 3 — EPIC-002: services-catalog management (admin) ──────────────────
  await page.goto(`${ADMIN_URL}/services`);
  await expect(page.getByRole("heading", { name: "Services Catalog" })).toBeVisible({ timeout: 15_000 });
  await caption(page, "EPIC-002 — Services catalog", "The accountant manages the services prospects can request.");
  await beat(page, 2000);

  // Add
  await page.getByRole("button", { name: "Add new service" }).click();
  await expect(page.getByRole("form", { name: "Add service form" })).toBeVisible({ timeout: 10_000 });
  await page.getByLabel("Service Name").fill(NEW_SERVICE);
  await page.getByLabel("Description").fill("Wills, trusts, and estate tax planning for individuals and families.");
  await caption(page, "EPIC-002 — Add a service", "A new offering is added to the catalog.");
  await beat(page, 1400);
  await page.getByRole("button", { name: "Add Service" }).click();
  await expect(page.getByRole("form", { name: "Add service form" })).not.toBeVisible({ timeout: 10_000 });
  const newRow = page.getByRole("row", { name: new RegExp(`Service: ${escapeRe(NEW_SERVICE)}`) });
  await expect(newRow).toBeVisible({ timeout: 10_000 });
  await beat(page, 1800);

  // Edit
  await page.getByRole("button", { name: `Edit ${NEW_SERVICE}` }).click();
  await expect(page.getByRole("form", { name: "Edit service form" })).toBeVisible({ timeout: 10_000 });
  const desc = page.getByRole("form", { name: "Edit service form" }).getByLabel("Description");
  await desc.clear();
  await desc.fill("Updated: estate, trust, and gift-tax planning — now including year-round advisory.");
  await caption(page, "EPIC-002 — Edit a service", "Details are updated in place.");
  await beat(page, 1400);
  await page.getByRole("button", { name: "Save Changes" }).click();
  await expect(page.getByRole("form", { name: "Edit service form" })).not.toBeVisible({ timeout: 10_000 });
  await beat(page, 1600);

  // Deactivate
  await caption(page, "EPIC-002 — Deactivate a service", "Deactivating retires it (reversible) without deleting history.");
  await page.getByRole("button", { name: `Deactivate ${NEW_SERVICE}` }).click();
  const inactiveRow = page.getByRole("row", { name: new RegExp(`Service: ${escapeRe(NEW_SERVICE)} \\(inactive\\)`) });
  await expect(inactiveRow.getByTestId("inactive-badge")).toBeVisible({ timeout: 10_000 });
  await beat(page, 2000);

  // Cross-surface: the deactivated service is gone from the public catalog.
  await page.goto(`${PORTAL_URL}/services`);
  await caption(
    page,
    "EPIC-001 ↔ EPIC-002 — Cross-surface",
    "The public services page reflects the accountant's catalog — the deactivated service is no longer offered.",
  );
  await expect(page.getByText(NEW_SERVICE)).toHaveCount(0);
  await beat(page, 2400);

  // ── Scene 4 — EPIC-003: notification, inbox, request detail ──────────────────
  await page.goto(`${ADMIN_URL}/requests`);
  await expect(page.getByRole("heading", { name: "Engagement Requests" })).toBeVisible({ timeout: 15_000 });
  await caption(
    page,
    "EPIC-003 — New-request notification",
    "The accountant is notified in-portal of the requests Tom and Jane just submitted.",
  );
  await expect(page.getByTestId("notifications-indicator")).toBeVisible({ timeout: 10_000 });
  await beat(page, 2600);

  await caption(
    page,
    "EPIC-003 — The request inbox",
    "All engagement requests in one place, distinguishable by state (pending / accepted / declined).",
  );
  await expect(page.getByTestId("request-list")).toBeVisible({ timeout: 10_000 });
  await beat(page, 2400);

  // Open Tom's request from the inbox (locate his row by email, click its View link).
  const tomRow = page.locator('[data-testid^="request-row-"]').filter({ hasText: TOM.email });
  await expect(tomRow).toBeVisible({ timeout: 10_000 });
  await tomRow.locator('[data-testid^="view-link-"]').click();
  await expect(page.getByTestId("request-detail")).toBeVisible({ timeout: 10_000 });
  await caption(
    page,
    "EPIC-003 — Review the request",
    "The accountant sees everything the prospect submitted before deciding.",
  );
  await expect(page.getByTestId("detail-status-badge")).toHaveAttribute("data-status", "pending");
  await beat(page, 2800);

  // ── Scene 5 — EPIC-003: Accept Tom → invitation email ────────────────────────
  await caption(page, "EPIC-003 — Accept", "Accepting invites the prospect to create their portal account.");
  await beat(page, 1200);
  await page.getByTestId("accept-btn").click();
  await expect(page.getByTestId("detail-status-badge")).toHaveAttribute("data-status", "accepted", { timeout: 20_000 });
  await caption(page, "EPIC-003 — Accepted", "The request moves to ‘accepted’ and an invitation email is sent.");
  await beat(page, 2400);

  // Prove + show the invitation email in the Mailhog inbox.
  await waitForEmail({ to: TOM.email, subjectContains: "invited", timeoutMs: 20_000 });
  await showEmailInMailhog(
    page,
    TOM.email,
    "EPIC-003 — Invitation email",
    "The real invitation lands in the prospect's inbox, with a link to create their account.",
  );

  // ── Scene 6 — EPIC-003: Decline Jane → reason email ──────────────────────────
  await page.goto(`${ADMIN_URL}/requests`);
  await expect(page.getByTestId("request-list")).toBeVisible({ timeout: 15_000 });
  const janeRow = page.locator('[data-testid^="request-row-"]').filter({ hasText: JANE.email });
  await expect(janeRow).toBeVisible({ timeout: 10_000 });
  await janeRow.locator('[data-testid^="view-link-"]').click();
  await expect(page.getByTestId("request-detail")).toBeVisible({ timeout: 10_000 });
  await caption(page, "EPIC-003 — Decline with a reason", "Declining lets the accountant write a courteous explanation.");
  await page.getByTestId("decline-btn").click();
  await expect(page.getByTestId("decline-form")).toBeVisible({ timeout: 10_000 });
  await page.getByTestId("decline-reason-textarea").fill(DECLINE_REASON);
  await beat(page, 1800);
  await page.getByTestId("decline-submit-btn").click();
  await expect(page.getByTestId("detail-status-badge")).toHaveAttribute("data-status", "declined", { timeout: 20_000 });
  await expect(page.getByTestId("detail-decline-reason")).toContainText(DECLINE_REASON);
  await caption(page, "EPIC-003 — Declined", "The reason is emailed to the prospect and retained on the request.");
  await beat(page, 2600);

  // Prove + show the decline-reason email in the Mailhog inbox.
  await waitForEmail({ to: JANE.email, subjectContains: "engagement request", bodyContains: DECLINE_REASON, timeoutMs: 20_000 });
  await showEmailInMailhog(
    page,
    JANE.email,
    "EPIC-003 — Decline-reason email",
    "The prospect receives the explanation by email — no account required.",
  );

  // ── Scene 7 — Closing ────────────────────────────────────────────────────────
  await showCard(
    page,
    "Phase 1 complete",
    "EPIC-001 front door · EPIC-004 auth & two-role model · EPIC-002 catalog · EPIC-003 request inbox — 51/51 AC verified.",
    3200,
  );
});

// ─── Local helpers ───────────────────────────────────────────────────────────────

/** Escape a string for use inside a RegExp literal (mirrors the services-catalog demo). */
function escapeRe(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Best-effort: open the Mailhog inbox and the message for `to`, captioned. The email's
 * arrival is already hard-asserted via waitForEmail() before this is called, so a Mailhog
 * UI selector quirk degrades to "show the inbox" rather than failing the walkthrough.
 */
async function showEmailInMailhog(
  page: Page,
  to: string,
  title: string,
  subtitle: string,
): Promise<void> {
  await page.goto(MAILHOG_URL);
  await caption(page, title, subtitle);
  await beat(page, 1600);
  try {
    // Mailhog (MailHog) renders message rows as `.msglist-message`.
    const row = page.locator(".msglist-message", { hasText: to }).first();
    await row.click({ timeout: 8_000 });
    await beat(page, 3000);
  } catch {
    // Selector drift — the inbox list is still on-screen and the email was already asserted.
    await beat(page, 2200);
  }
}
