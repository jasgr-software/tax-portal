/**
 * apps/admin/e2e/specs/request-decline.spec.ts
 *
 * TASK-003-006: Tier-6 e2e — Decline happy path + reason email in Mailhog + reason retained
 *
 * Acceptance criteria covered (e2e tier — ADR-012 tier map):
 *   AC-DOOR-006-03 — accountant declines a pending request → moves to declined state
 *   AC-DOOR-008-01 — declining lets the accountant write a brief free-text reason
 *   AC-DOOR-008-02 — the reason is sent to the prospect's contact email (Mailhog)
 *   AC-DOOR-008-04 — the decline reason is retained in the portal, visible to the accountant
 *
 * Gate evidence (§ Gate Authoring Rules — Introduces-gate: advisory):
 *   Named code path: getEmailProvider().send() in declineRequest() (apps/admin/src/app/requests/actions.ts)
 *   Counterfactual: removing the emailProvider.send() call from declineRequest() would leave the
 *     request declined but no email in Mailhog → this test would fail the waitForEmail() assertion.
 *
 * Feature mirror: apps/admin/e2e/features/request-inbox.feature (AC-DOOR-006-03, AC-DOOR-008-*)
 *
 * Email assertions: reads the Mailhog HTTP API (http://localhost:18025/api/v2/messages)
 *   to confirm the decline reason email actually arrived at the prospect's contact email.
 *
 * Auth: ACCOUNTANT via mock-session fixture (setupAccountantSession).
 *
 * Stack: admin container at http://localhost:13001 (ADMIN_BASE_URL / ADMIN_PORT env).
 *
 * Run:
 *   pnpm --filter admin e2e:run -- --grep 'request-decline'
 *
 * ADR-006: Decline action is admin-only.
 * ADR-019: Decline records an audit row — not directly asserted here (tier-3 has it).
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
  return `${prefix}.${Date.now()}.${Math.random().toString(36).slice(2, 6)}@e2e-decline-test.example.com`;
}

// ─── afterAll: close DB pool ──────────────────────────────────────────────────
// BUG-003-001: rate-limiter reset endpoint removed; RATE_LIMIT_MAX_ATTEMPTS=100 in
// docker-compose.yml prevents exhaustion across 3× sequential pnpm e2e:run invocations.

test.afterAll(async () => {
  await closeRequestsPool();
});

// ─── [AC-DOOR-006-03][AC-DOOR-008-01/-02/-04] Full decline happy path ────────

test.describe(
  "[AC-DOOR-006-03][AC-DOOR-008-01][AC-DOOR-008-02][AC-DOOR-008-04] " +
    "accountant declines with a reason → declined state + reason email in Mailhog + reason retained",
  () => {
    let seededId: string;
    const prospectEmail = uniqueEmail("decline-prospect");
    const DECLINE_REASON = "We are at capacity for new clients at this time. Thank you for your interest.";

    test.beforeEach(async ({ page, request }) => {
      // Seed a pending request to decline
      const pending = await seedPendingRequest({
        firstName: "DeclineFirst",
        lastName: "DeclineLast",
        email: prospectEmail,
        message: "Please review my request",
      });
      seededId = pending.id;

      // Clear Mailhog BEFORE the test so we get a clean slate for email assertions.
      // AC-DOOR-008-02: the decline reason email must arrive in Mailhog after declining.
      await clearMailhog();

      await setupAccountantSession(page, request);
    });

    test.afterEach(async ({ page }) => {
      await clearSession(page);
      if (seededId) await deleteRequestById(seededId);
    });

    test(
      "[AC-DOOR-006-03][AC-DOOR-008-01][AC-DOOR-008-02][AC-DOOR-008-04] " +
        "decline with reason → status declined + reason email arrives + reason retained in portal",
      async ({ page }) => {
        // Given: a pending engagement request
        // Navigate to the detail page
        await page.goto(`${ADMIN_URL}/requests/${seededId}`);
        await expect(page.getByTestId("request-detail")).toBeVisible({ timeout: 10_000 });

        // The status badge shows Pending
        const statusBadge = page.getByTestId("detail-status-badge");
        await expect(statusBadge).toHaveAttribute("data-status", "pending");

        // The decision idle view is shown
        await expect(page.getByTestId("decision-idle")).toBeVisible({ timeout: 10_000 });

        // AC-DOOR-008-01: she can write a brief free-text reason message
        // Click the Decline button to open the decline form
        await page.getByTestId("decline-btn").click();

        // The decline form appears with the reason textarea
        await expect(page.getByTestId("decline-form")).toBeVisible({ timeout: 5_000 });
        await expect(page.getByTestId("decline-reason-textarea")).toBeVisible();

        // Fill in the decline reason (AC-DOOR-008-01)
        await page.getByTestId("decline-reason-textarea").fill(DECLINE_REASON);

        // When: the accountant submits the decline with reason
        await page.getByTestId("decline-submit-btn").click();

        // Then: the request moves to the declined state.
        // The server action calls revalidatePath; the RSC re-renders immediately.
        // Wait directly for the status badge to show "declined" (page auto-refreshes).
        await expect(page.getByTestId("detail-status-badge")).toHaveAttribute(
          "data-status",
          "declined",
          { timeout: 20_000 },
        );

        // AC-DOOR-008-04: the decline reason is retained and shown on the detail page
        const retainedReason = page.getByTestId("detail-decline-reason");
        await expect(retainedReason).toBeVisible({ timeout: 5_000 });
        await expect(retainedReason).toContainText(DECLINE_REASON);

        // DB assertion: status is 'declined' and reason is persisted (AC-DOOR-008-04)
        const updatedRecord = await getRequestById(seededId);
        expect(updatedRecord).not.toBeNull();
        expect(updatedRecord!.status).toBe("declined");
        expect(updatedRecord!.declineReason).toBe(DECLINE_REASON);

        // Then (AC-DOOR-008-02): the decline reason email arrived in Mailhog addressed to the prospect
        const declineEmail = await waitForEmail({
          to: prospectEmail,
          subjectContains: "engagement request",
          bodyContains: DECLINE_REASON,
          timeoutMs: 15_000,
        });

        const subject = getSubject(declineEmail);
        const body = getBody(declineEmail);

        // The email subject mentions the engagement request
        expect(subject.toLowerCase()).toContain("engagement request");

        // The email body contains the prospect's name
        expect(body).toContain("DeclineFirst");

        // The email body contains the exact decline reason (AC-DOOR-008-02)
        expect(body).toContain(DECLINE_REASON);

        // AC-DOOR-008-03: the prospect received this without needing a portal account
        // (proven by the fact that the email arrived with no User row or sign-in required)
        // No invitationTicket was issued (this is a decline, not an accept)
        expect(updatedRecord!.invitationTicket).toBeNull();
      },
    );
  },
);

// ─── [AC-DOOR-008-01] Reason textarea captures free text ─────────────────────

test.describe("[AC-DOOR-008-01] declining lets the accountant write a brief free-text reason message", () => {
  let seededId: string;
  const reasonEmail = uniqueEmail("decline-reason-capture");

  test.beforeEach(async ({ page, request }) => {
    const pending = await seedPendingRequest({
      firstName: "ReasonCapture",
      lastName: "Test",
      email: reasonEmail,
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
    "[AC-DOOR-008-01] decline form shows a textarea for the free-text reason",
    async ({ page }) => {
      // Given: the accountant on the request detail page
      await page.goto(`${ADMIN_URL}/requests/${seededId}`);
      await expect(page.getByTestId("decision-idle")).toBeVisible({ timeout: 10_000 });

      // When: she clicks Decline
      await page.getByTestId("decline-btn").click();

      // Then: a textarea for the free-text reason appears
      await expect(page.getByTestId("decline-form")).toBeVisible();
      await expect(page.getByTestId("decline-reason-textarea")).toBeVisible();

      // The submit button is disabled until a reason is entered
      await expect(page.getByTestId("decline-submit-btn")).toBeDisabled();

      // She can type a reason
      await page.getByTestId("decline-reason-textarea").fill("Test reason for capacity.");

      // Submit button becomes enabled once text is entered
      await expect(page.getByTestId("decline-submit-btn")).toBeEnabled();

      // She can cancel (AC-DOOR-008-01 — she controls the interaction)
      await page.getByTestId("decline-cancel-btn").click();
      await expect(page.getByTestId("decline-form")).not.toBeVisible();
      await expect(page.getByTestId("decision-idle")).toBeVisible();
    },
  );
});

// ─── [AC-DOOR-008-04] Decline reason retained on the declined request ─────────

test.describe("[AC-DOOR-008-04] the decline reason is retained in the portal, visible to the accountant", () => {
  let seededId: string;
  const retainEmail = uniqueEmail("decline-retain");
  const RETAINED_REASON = "Not currently accepting new clients in this area.";

  test.beforeEach(async ({ page, request }) => {
    const pending = await seedPendingRequest({
      firstName: "RetainTest",
      lastName: "User",
      email: retainEmail,
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
    "[AC-DOOR-008-04] after declining, the reason is retained and shown when viewing the declined request",
    async ({ page }) => {
      // Given: the accountant declines a request with a specific reason
      await page.goto(`${ADMIN_URL}/requests/${seededId}`);
      await expect(page.getByTestId("decision-idle")).toBeVisible({ timeout: 10_000 });
      await page.getByTestId("decline-btn").click();
      await page.getByTestId("decline-reason-textarea").fill(RETAINED_REASON);
      await page.getByTestId("decline-submit-btn").click();

      // The server action calls revalidatePath; RSC re-renders immediately.
      // Wait for status badge to show "declined" (page auto-refreshes).
      await expect(page.getByTestId("detail-status-badge")).toHaveAttribute(
        "data-status",
        "declined",
        { timeout: 20_000 },
      );

      // Then: the decline reason is retained and shown attached to the request
      // (status is already "declined" — verified above via the auto-refresh wait)
      const retainedReason = page.getByTestId("detail-decline-reason");
      await expect(retainedReason).toBeVisible();
      await expect(retainedReason).toContainText(RETAINED_REASON);

      // And navigating away and back still shows the retained reason
      await page.goto(`${ADMIN_URL}/requests`);
      await expect(page.getByRole("heading", { name: "Engagement Requests" })).toBeVisible();
      await page.goto(`${ADMIN_URL}/requests/${seededId}`);

      const persistedReason = page.getByTestId("detail-decline-reason");
      await expect(persistedReason).toBeVisible({ timeout: 10_000 });
      await expect(persistedReason).toContainText(RETAINED_REASON);
    },
  );
});

// ─── [AC-DOOR-006-05] Decided request cannot be re-decided ───────────────────

test.describe("[AC-DOOR-006-05] a declined request is no longer pending or awaiting a further decision", () => {
  let seededId: string;
  const redecideEmail = uniqueEmail("decline-redecide");

  test.beforeEach(async ({ page, request }) => {
    const pending = await seedPendingRequest({
      firstName: "ReDecline",
      lastName: "Test",
      email: redecideEmail,
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
    "[AC-DOOR-006-05] a declined request shows no decision affordances",
    async ({ page }) => {
      // Given: the accountant declines a request
      await page.goto(`${ADMIN_URL}/requests/${seededId}`);
      await expect(page.getByTestId("decision-idle")).toBeVisible({ timeout: 10_000 });
      await page.getByTestId("decline-btn").click();
      await page.getByTestId("decline-reason-textarea").fill("Capacity full.");
      await page.getByTestId("decline-submit-btn").click();

      // The server action calls revalidatePath; RSC re-renders immediately.
      // Wait for status badge to show "declined" (page auto-refreshes).
      await expect(page.getByTestId("detail-status-badge")).toHaveAttribute(
        "data-status",
        "declined",
        { timeout: 20_000 },
      );

      // Then: the request is no longer pending — no decision affordances shown
      await expect(page.getByTestId("detail-status-badge")).toHaveAttribute(
        "data-status",
        "declined",
        { timeout: 10_000 },
      );

      // DecisionActions renders null for non-decidable statuses
      await expect(page.getByTestId("decision-idle")).not.toBeVisible();
      await expect(page.getByTestId("accept-btn")).not.toBeVisible();
      await expect(page.getByTestId("decline-btn")).not.toBeVisible();
    },
  );
});
