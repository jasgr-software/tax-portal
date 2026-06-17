/**
 * apps/admin/e2e/specs/request-accept.spec.ts
 *
 * TASK-003-006: Tier-6 e2e — Accept happy path + invitation email in Mailhog
 *
 * Acceptance criteria covered (e2e tier — ADR-012 tier map):
 *   AC-DOOR-006-02 — accountant accepts a pending request → moves to accepted state
 *   AC-DOOR-007-01 — acceptance sends an invitation to the prospect's contact email (Mailhog)
 *
 * Gate evidence (§ Gate Authoring Rules — Introduces-gate: advisory):
 *   Named code path: getEmailProvider().send() in acceptRequest() (apps/admin/src/app/requests/actions.ts)
 *   Counterfactual: removing the emailProvider.send() call from acceptRequest() would leave the
 *     request accepted but no email in Mailhog → this test would fail the waitForEmail() assertion.
 *
 * Feature mirror: apps/admin/e2e/features/request-inbox.feature (AC-DOOR-006-02, AC-DOOR-007-01)
 *
 * Email assertions: reads the Mailhog HTTP API (http://localhost:18025/api/v2/messages)
 *   to confirm the invitation email actually arrived at the prospect's contact email.
 *
 * Auth: ACCOUNTANT via mock-session fixture (setupAccountantSession).
 *
 * Stack: admin container at http://localhost:13001 (ADMIN_BASE_URL / ADMIN_PORT env).
 *
 * Run:
 *   pnpm --filter admin e2e:run -- --grep 'request-accept'
 *
 * ADR-006: Accept action is admin-only.
 * ADR-019: Accept records an audit row — not directly asserted here (tier-3 has it).
 * ADR-022: Rate limiting on outbound email — RATE_LIMIT_MAX_ATTEMPTS=100 set in
 *   docker-compose.yml prevents exhaustion across sequential e2e runs (BUG-003-001 fix).
 * REQ-NFR-008: Email delivery proven against Mailhog catcher.
 */

import { test, expect } from "@playwright/test";
import { setupAccountantSession, clearSession } from "../fixtures/auth.js";
import {
  seedPendingRequest,
  deleteRequestById,
  getRequestById,
  closeRequestsPool,
} from "../fixtures/requests.js";
import {
  clearMailhog,
  waitForEmail,
  getSubject,
  getBody,
} from "../fixtures/mailhog.js";

// ─── URL resolution ────────────────────────────────────────────────────────────

const ADMIN_PORT = process.env["ADMIN_PORT"] ?? "3001";
const ADMIN_URL = process.env["ADMIN_BASE_URL"] ?? `http://localhost:${ADMIN_PORT}`;

// ─── Unique email helper ───────────────────────────────────────────────────────

function uniqueEmail(prefix: string): string {
  return `${prefix}.${Date.now()}.${Math.random().toString(36).slice(2, 6)}@e2e-accept-test.example.com`;
}

// ─── afterAll: close DB pool ──────────────────────────────────────────────────
// BUG-003-001: rate-limiter reset endpoint removed; RATE_LIMIT_MAX_ATTEMPTS=100 in
// docker-compose.yml prevents exhaustion across 3× sequential pnpm e2e:run invocations.

test.afterAll(async () => {
  await closeRequestsPool();
});

// ─── [AC-DOOR-006-02][AC-DOOR-007-01] Accept → accepted state + invitation email ─

test.describe("[AC-DOOR-006-02][AC-DOOR-007-01] accountant accepts a request → accepted + invitation email in Mailhog", () => {
  let seededId: string;
  const prospectEmail = uniqueEmail("accept-prospect");

  test.beforeEach(async ({ page, request }) => {
    // Seed a pending request to accept
    const pending = await seedPendingRequest({
      firstName: "AcceptFirst",
      lastName: "AcceptLast",
      email: prospectEmail,
      message: "Please accept my request",
    });
    seededId = pending.id;

    // Clear Mailhog BEFORE the test so we get a clean slate for email assertions.
    // AC-DOOR-007-01: the invitation email must arrive in Mailhog after acceptance.
    await clearMailhog();

    await setupAccountantSession(page, request);
  });

  test.afterEach(async ({ page }) => {
    await clearSession(page);
    if (seededId) await deleteRequestById(seededId);
  });

  test(
    "[AC-DOOR-006-02][AC-DOOR-007-01] accept → status accepted + invitation email arrives in Mailhog",
    async ({ page }) => {
      // Given: a pending engagement request
      // Navigate to the detail page
      await page.goto(`${ADMIN_URL}/requests/${seededId}`);
      await expect(page.getByTestId("request-detail")).toBeVisible({ timeout: 10_000 });

      // The status badge shows Pending
      const statusBadge = page.getByTestId("detail-status-badge");
      await expect(statusBadge).toHaveAttribute("data-status", "pending");

      // The decision actions are shown (idle view with Accept + Decline buttons)
      await expect(page.getByTestId("decision-idle")).toBeVisible({ timeout: 10_000 });
      await expect(page.getByTestId("accept-btn")).toBeVisible();

      // When: the accountant accepts the request
      await page.getByTestId("accept-btn").click();

      // Then: the request moves to the accepted state.
      // The server action calls revalidatePath which triggers an immediate RSC re-render.
      // The page auto-refreshes with the new status — no manual refresh needed.
      // Wait directly for the status badge to show "accepted" (RSC re-renders with updated status).
      await expect(page.getByTestId("detail-status-badge")).toHaveAttribute(
        "data-status",
        "accepted",
        { timeout: 20_000 },
      );

      // After the RSC refresh, the decision idle panel is gone (not decidable anymore)
      await expect(page.getByTestId("decision-idle")).not.toBeVisible();

      // DB assertion: the request status is 'accepted' in the DB
      const updatedRecord = await getRequestById(seededId);
      expect(updatedRecord).not.toBeNull();
      expect(updatedRecord!.status).toBe("accepted");
      // The invitation ticket was persisted (AC-DOOR-007-04)
      expect(updatedRecord!.invitationTicket).toBeTruthy();

      // Then (AC-DOOR-007-01): an invitation email arrived in Mailhog addressed to the prospect
      const inviteEmail = await waitForEmail({
        to: prospectEmail,
        subjectContains: "invited",
        timeoutMs: 15_000,
      });

      const subject = getSubject(inviteEmail);
      const body = getBody(inviteEmail);

      // The email subject mentions invitation
      expect(subject.toLowerCase()).toContain("invited");

      // The email body mentions the prospect's name (AC-DOOR-007-02: directs recipient)
      expect(body).toContain("AcceptFirst");

      // The invitation links to the client surface sign-up (AC-DOOR-007-02)
      // The sign-up URL contains the ticket from the invitation
      expect(body).toMatch(/sign-up\?ticket=/);

      // The ticket in the body matches the persisted ticket (AC-DOOR-007-04)
      const ticket = updatedRecord!.invitationTicket;
      expect(body).toContain(ticket!);
    },
  );
});

// ─── [AC-DOOR-006-05] Decided request cannot be decided again ──────────────────

test.describe("[AC-DOOR-006-05] once decided, a request is no longer pending or awaiting further decision", () => {
  let seededId: string;
  const repeatedEmail = uniqueEmail("accept-repeat");

  test.beforeEach(async ({ page, request }) => {
    const pending = await seedPendingRequest({
      firstName: "RepeatAccept",
      lastName: "User",
      email: repeatedEmail,
    });
    seededId = pending.id;
    await clearMailhog();
    await setupAccountantSession(page, request);
  });

  test.afterEach(async ({ page }) => {
    await clearSession(page);
    if (seededId) await deleteRequestById(seededId);
  });

  test(
    "[AC-DOOR-006-05] an accepted request shows no decision affordances (already decided)",
    async ({ page }) => {
      // Given: the accountant accepts a request
      await page.goto(`${ADMIN_URL}/requests/${seededId}`);
      await expect(page.getByTestId("decision-idle")).toBeVisible({ timeout: 10_000 });
      await page.getByTestId("accept-btn").click();

      // The server action calls revalidatePath; the RSC re-renders immediately.
      // Wait for the status badge to show "accepted" (page auto-refreshes).
      await expect(page.getByTestId("detail-status-badge")).toHaveAttribute(
        "data-status",
        "accepted",
        { timeout: 20_000 },
      );

      // The decision idle panel (with Accept/Decline buttons) is NOT shown
      // (DecisionActions.tsx returns null when status is not 'pending'/'awaiting_review')
      await expect(page.getByTestId("decision-idle")).not.toBeVisible();
      await expect(page.getByTestId("accept-btn")).not.toBeVisible();
      await expect(page.getByTestId("decline-btn")).not.toBeVisible();
    },
  );
});
