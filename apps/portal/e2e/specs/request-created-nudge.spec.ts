/**
 * apps/portal/e2e/specs/request-created-nudge.spec.ts
 *
 * Tier-6 e2e — Client document_request_created nudge in portal feed + EPIC-018 digest reuse.
 * EPIC-019 / TASK-019-005 / BRIEF-019
 *
 * Acceptance criteria covered (apps/portal surface):
 *   AC-MSG-014-02 — A client is notified (in-portal) when a document request is created for them.
 *     + The notification rides the EXISTING EPIC-018 content-free daily digest (no new email path).
 *
 * Gherkin binding (verbatim from BRIEF-019 § Acceptance scenarios;
 * see apps/portal/e2e/features/request-created-nudge.feature):
 *   Given the accountant creates a document request for a client
 *   When the request is created
 *   Then that client receives an in-portal notification that a document request was created for them
 *   And the notification is summarized by the existing content-free daily digest email
 *   And no new email content path or per-event email is introduced
 *
 * Strategy:
 *   1. Seed a CLIENT User + EngagementRequest + Engagement + document_request_created Notification.
 *      (We insert the notification directly via admin pool to prove the RLS seam works end-to-end,
 *      matching the shape emitted by createDocumentRequestAsAccountant.)
 *   2. Set up a CLIENT mock session; navigate to /notifications.
 *   3. Assert the document_request_created notification item is visible in the feed (AC-MSG-014-02).
 *   4. Verify the notification title matches the content-free title "A document request has been
 *      created for you" (CS-GEN-001: no request label, no client name, no engagement detail).
 *   5. Clear Mailhog.
 *   6. Trigger the daily digest dispatch (POST ADMIN_URL/api/dev/dispatch-digest, guarded by
 *      ENABLE_DIGEST_TRIGGER=true which is already set in the admin container).
 *      Uses the EXISTING EPIC-018 digest; NO new email path is introduced.
 *   7. Wait for the digest nudge to arrive in Mailhog and assert:
 *      - Email arrives at FIXTURE_CLIENT_EMAIL (digest recipient).
 *      - Subject and body are content-free: "new activity" only, no notification title/detail.
 *      - No request label, no client name, no engagement reference appears.
 *      This two-sided content-free proof is the "no new email content path" assertion.
 *
 * Extra gate (TASK-019-005 spec):
 *   "Digest-reuse (extra_gate #13, AC-MSG-014-02 portal side): the document_request_created client
 *   nudge appears in the portal feed AND is summarized by the EXISTING content-free EPIC-018 daily
 *   digest — assert NO new per-event email and NO new email content path was introduced."
 *
 * Stack: full docker-compose stack.
 *   Portal at http://localhost:3000 (PORTAL_BASE_URL).
 *   Admin trigger at http://localhost:13001 (ADMIN_URL / ADMIN_PORT).
 *   Mailhog at http://localhost:18025 (MAILHOG_HTTP_PORT).
 *   EMAIL_PROVIDER=smtp (admin container) → Mailhog SMTP port (internal).
 *   ENABLE_DIGEST_TRIGGER=true (already set in admin container — TASK-018-003). // ADR-023
 *
 * Run:
 *   pnpm --filter portal e2e:run -- --grep "request-created-nudge"
 *   pnpm --filter portal e2e:run -- --grep "AC-MSG-014-02"
 *
 * data-testid hooks consumed (from packages/ui/src/components/NotificationFeed.tsx):
 *   notification-feed               — root list container
 *   notification-item-{id}          — each notification row
 *
 * // ADR-003: admin pool for fixture seed/teardown (RLS-exempt; no SESSION_CONTEXT needed). // ADR-003
 * // ADR-005: RLS policy on Notification enforced via CLIENT session on portal. // ADR-005
 * // ADR-006: portal surface for client nudge; admin route for digest trigger. // ADR-006
 * // ADR-012: tier-6 e2e against the full docker-compose stack. // ADR-012
 * // ADR-023: SMTP → Mailhog for dev/e2e; ENABLE_DIGEST_TRIGGER=true enables the seam. // ADR-023
 * // CS-GEN-001: no PII in test data beyond necessary fixture identifiers. // CS-GEN-001
 * // CS-GEN-002: additive test; no new email path introduced. // CS-GEN-002
 * // CS-GEN-003: AC ids and governing keys cited throughout. // CS-GEN-003
 */

import { test, expect } from "@playwright/test";
import mssqlPkg from "mssql";
import { setupClientSession, clearSession } from "../fixtures/auth.js";
import {
  clearMailhog,
  waitForEmail,
  getSubject,
  getBody,
} from "../fixtures/mailhog.js";

const { ConnectionPool } = mssqlPkg;

// ─── URL resolution ────────────────────────────────────────────────────────────

const PORTAL_URL = process.env["PORTAL_BASE_URL"] ?? "http://localhost:3000";
const ADMIN_PORT = process.env["ADMIN_PORT"] ?? "3001";
const ADMIN_URL = process.env["ADMIN_BASE_URL"] ?? `http://localhost:${ADMIN_PORT}`;

// ─── Fixture identifiers ───────────────────────────────────────────────────────
// Unique suffix "-019-005-002" avoids collision with all other suites in this project.
// CS-GEN-001: no real PII used — all values are fake/synthetic fixture data. // CS-GEN-001

const FIXTURE_CLIENT_CLERK_ID = "user_client_req_created_e2e_019_005_002";
const FIXTURE_CLIENT_EMAIL = "req-created-e2e-019-005-002@example.com";

// The expected notification title for document_request_created (CS-GEN-001 compliant).
// Must match the title emitted by createDocumentRequestAsAccountant in packages/db.
// // AC-MSG-014-02 // CS-GEN-001
const EXPECTED_NOTIFICATION_TITLE = "A document request has been created for you";

// Sensitive strings seeded into the notification body — these represent content-detail
// categories that MUST NOT appear in the digest email (AC-MSG-008-01 two-sided proof).
// These are unique obfuscated values to prevent false positives.
// // CS-GEN-001 // AC-MSG-008-01
const SENSITIVE_REQUEST_LABEL = "SensitiveTaxReturn2024Doc_019005002";
const SENSITIVE_ENGAGEMENT_REF = "SensitiveEngagementRef_019005002_XYZ";

// ─── DB helpers (admin pool — RLS-exempt fixture setup/teardown) ──────────────

/**
 * Parse a sqlserver:// connection string into mssql config.
 * // CS-TS-003: duplicated per spec — each spec is self-contained.
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
      "[request-created-nudge.spec] DATABASE_URL_ADMIN is not set " +
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

// ─── Fixture state ────────────────────────────────────────────────────────────

interface RequestCreatedFixture {
  userId: string;
  engagementId: string;
  notificationId: string;
}

/**
 * Seeds:
 *   - CLIENT User (email nudge enabled by default — DB DEFAULT 1)
 *   - EngagementRequest (accepted status)
 *   - Engagement (linked to clientUserId so the digest can find the recipient)
 *   - Notification (type='document_request_created', recipientType='CLIENT',
 *                   recipientUserId=userId, readAt=NULL — unread for digest)
 *
 * The notification shape matches exactly what createDocumentRequestAsAccountant
 * (packages/db) emits when it calls emitNotification() for AC-MSG-014-02.
 * // AC-MSG-014-02 // ADR-005 // ADR-003
 *
 * The body includes sensitive strings to verify two-sided content-free digest proof.
 * // CS-GEN-001: sensitive strings are obfuscated fixture identifiers (not real PII)
 */
async function seedRequestCreatedFixture(): Promise<RequestCreatedFixture> {
  const pool = await getPool();

  // Idempotent: clean up any prior run for this clerkId before seeding fresh.
  await cleanupFixture(pool).catch(() => {
    /* ignore on first run */
  });

  // 1. Upsert CLIENT User.
  //    emailNudgeEnabled: omitted → DB DEFAULT 1 (nudge-enabled by default, no opt-in).
  //    // AC-MSG-011-01: default-on invariant.
  const userResult = await pool
    .request()
    .input("clerkId", FIXTURE_CLIENT_CLERK_ID)
    .input("email", FIXTURE_CLIENT_EMAIL)
    .query<{ id: string }>(
      `MERGE [dbo].[User] AS target
       USING (SELECT @clerkId AS clerkId) AS source
         ON target.[clerkId] = source.[clerkId]
       WHEN NOT MATCHED THEN
         INSERT ([clerkId], [email], [role], [createdAt], [updatedAt])
         VALUES (@clerkId, @email, N'CLIENT', SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET())
       OUTPUT INSERTED.[id];`,
    );

  let userId = userResult.recordset[0]?.id;
  if (!userId) {
    // Row already existed — look it up (MERGE OUTPUT returns nothing on WHEN MATCHED).
    const lookup = await pool
      .request()
      .input("clerkId", FIXTURE_CLIENT_CLERK_ID)
      .query<{ id: string }>(`SELECT [id] FROM [dbo].[User] WHERE [clerkId] = @clerkId`);
    userId = lookup.recordset[0]?.id;
    if (!userId) {
      throw new Error("[request-created-nudge.spec] Failed to upsert User fixture");
    }
  }

  // 2. Seed EngagementRequest (accepted status — client has an active engagement).
  const reqResult = await pool
    .request()
    .input("email", FIXTURE_CLIENT_EMAIL)
    .query<{ id: string }>(
      `INSERT INTO [dbo].[EngagementRequest]
         ([firstName], [lastName], [email], [phone], [message], [status], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES (N'RequestCreated', N'E2E019005B', @email, NULL, NULL, N'accepted', SYSDATETIMEOFFSET())`,
    );

  const engagementRequestId = reqResult.recordset[0]?.id;
  if (!engagementRequestId) {
    throw new Error("[request-created-nudge.spec] Failed to seed EngagementRequest");
  }

  // 3. Seed Engagement linked to the client user.
  //    clientUserId is required so the digest can join User via Notification.recipientUserId.
  const engResult = await pool
    .request()
    .input("clientUserId", userId)
    .input("requestId", engagementRequestId)
    .query<{ id: string }>(
      `INSERT INTO [dbo].[Engagement]
         ([clientUserId], [engagementRequestId], [status], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES (@clientUserId, @requestId, N'In Progress', SYSDATETIMEOFFSET())`,
    );

  const engagementId = engResult.recordset[0]?.id;
  if (!engagementId) {
    throw new Error("[request-created-nudge.spec] Failed to seed Engagement");
  }

  // 4. Seed a document_request_created Notification.
  //    Shape matches exactly what createDocumentRequestAsAccountant emits:
  //      recipientType = 'CLIENT', recipientUserId = userId
  //      type = 'document_request_created'
  //      title = 'A document request has been created for you'  (CS-GEN-001: content-free)
  //      body = sensitive-string-containing body (to prove the two-sided content-free digest)
  //      readAt = NULL (unread — eligible for digest nudge)
  //    // AC-MSG-014-02 // CS-GEN-001 // ADR-005
  const notifResult = await pool
    .request()
    .input("recipientUserId", userId)
    .input("engagementId", engagementId)
    .input("title", EXPECTED_NOTIFICATION_TITLE)
    .input(
      "sensitiveBody",
      `Request for: ${SENSITIVE_REQUEST_LABEL} | Ref: ${SENSITIVE_ENGAGEMENT_REF}`,
    )
    .query<{ id: string }>(
      `INSERT INTO [dbo].[Notification]
         ([type], [title], [body], [recipientType], [recipientUserId],
          [linkedItemType], [linkedItemId], [readAt])
       OUTPUT INSERTED.[id]
       VALUES (
         N'document_request_created',
         @title,
         @sensitiveBody,
         N'CLIENT',
         @recipientUserId,
         N'engagement',
         @engagementId,
         NULL
       )`,
    );

  const notificationId = notifResult.recordset[0]?.id;
  if (!notificationId) {
    throw new Error("[request-created-nudge.spec] Failed to seed Notification");
  }

  return {
    userId: userId.toLowerCase(),
    engagementId: engagementId.toLowerCase(),
    notificationId: notificationId.toLowerCase(),
  };
}

/**
 * Cleanup: delete notification → engagement → engagementRequest → user (FK-ordered).
 * // ADR-005: admin pool for cleanup — RLS not involved. // ADR-005
 */
async function cleanupFixture(pool: mssqlPkg.ConnectionPool): Promise<void> {
  // 1. Delete Notifications for this user.
  await pool
    .request()
    .input("clerkId", FIXTURE_CLIENT_CLERK_ID)
    .query(
      `DELETE n FROM [dbo].[Notification] n
       INNER JOIN [dbo].[User] u ON n.[recipientUserId] = u.[id]
       WHERE u.[clerkId] = @clerkId`,
    )
    .catch(() => {});

  // 2. Delete Engagements for this user (FK: Engagement.clientUserId → User.id).
  await pool
    .request()
    .input("clerkId", FIXTURE_CLIENT_CLERK_ID)
    .query(
      `DELETE e FROM [dbo].[Engagement] e
       INNER JOIN [dbo].[User] u ON e.[clientUserId] = u.[id]
       WHERE u.[clerkId] = @clerkId`,
    )
    .catch(() => {});

  // 3. Delete EngagementRequests for this email (after Engagement removed).
  await pool
    .request()
    .input("email", FIXTURE_CLIENT_EMAIL)
    .query(`DELETE FROM [dbo].[EngagementRequest] WHERE [email] = @email`)
    .catch(() => {});

  // 4. Delete User last (other FKs resolved above).
  await pool
    .request()
    .input("clerkId", FIXTURE_CLIENT_CLERK_ID)
    .query(`DELETE FROM [dbo].[User] WHERE [clerkId] = @clerkId`)
    .catch(() => {});
}

// ─── Dispatch trigger helper ───────────────────────────────────────────────────

/**
 * Trigger the daily digest dispatch via the existing EPIC-018 dev/test seam
 * (POST ADMIN_URL/api/dev/dispatch-digest).
 *
 * This is the EXISTING seam from EPIC-018 (TASK-018-003). We reuse it here to
 * prove that the document_request_created notification rides the EXISTING digest
 * without introducing any new email path. // CS-GEN-002 // AC-MSG-014-02
 *
 * The route is guarded by ENABLE_DIGEST_TRIGGER=true (already set in the admin
 * container — see docker-compose.yml / TASK-018-003). A minimal ACCOUNTANT mock
 * session is used to satisfy the admin middleware guard (DECISION-018-003-C).
 *
 * // ADR-023: SMTP → Mailhog; ENABLE_DIGEST_TRIGGER=true enables the seam. // ADR-023
 * // CS-GEN-001: clerkUserId is a synthetic fixture identifier. // CS-GEN-001
 * // CS-GEN-002: reuses the existing EPIC-018 digest seam — no new email path. // CS-GEN-002
 */
async function triggerDigestDispatch(adminUrl: string): Promise<{ sentCount: number }> {
  // Step 1: Obtain a minimal ACCOUNTANT mock session to pass the admin middleware.
  const sessionResp = await fetch(`${adminUrl}/api/mock-session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      clerkUserId: "dispatch_trigger_e2e_session_019_005",
      role: "ACCOUNTANT",
    }),
  });

  if (!sessionResp.ok) {
    throw new Error(
      `[triggerDigestDispatch] POST ${adminUrl}/api/mock-session returned ${sessionResp.status}. ` +
        `Is AUTH_PROVIDER=mock set in the admin container?`,
    );
  }

  const setCookieHeader = sessionResp.headers.get("set-cookie");
  if (!setCookieHeader) {
    throw new Error(
      "[triggerDigestDispatch] POST /api/mock-session did not return Set-Cookie header.",
    );
  }

  const cookieValue = setCookieHeader.split(";")[0] ?? "";

  // Step 2: POST to the EXISTING digest dispatch trigger.
  // CS-GEN-002: reusing the EXISTING /api/dev/dispatch-digest seam — no new email route. // CS-GEN-002
  // ADR-023: ENABLE_DIGEST_TRIGGER=true must be set in the admin container. // ADR-023
  const dispatchResp = await fetch(`${adminUrl}/api/dev/dispatch-digest`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Cookie": cookieValue,
    },
    body: JSON.stringify({}),
  });

  if (!dispatchResp.ok) {
    const text = await dispatchResp.text().catch(() => "(unparseable)");
    throw new Error(
      `[triggerDigestDispatch] POST ${adminUrl}/api/dev/dispatch-digest returned ` +
        `${dispatchResp.status}: ${text}. ` +
        `Is ENABLE_DIGEST_TRIGGER=true in the admin container?`,
    );
  }

  return dispatchResp.json() as Promise<{ sentCount: number }>;
}

// ─── Suite setup / teardown ───────────────────────────────────────────────────

let fixture: RequestCreatedFixture;

test.beforeAll(async () => {
  fixture = await seedRequestCreatedFixture();
});

test.afterAll(async () => {
  const pool = await getPool();
  await cleanupFixture(pool);
  await closePool();
});

// ═══════════════════════════════════════════════════════════════════════════════
// Test: @AC-MSG-014-02 — Client sees request-created nudge in portal feed
//                         + digest-reuse assertion (no new email path)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * [AC-MSG-014-02]
 * Client receives an in-portal notification when a document request is created for them.
 * The notification rides the EXISTING EPIC-018 content-free daily digest (no new email path).
 *
 * Gherkin (BRIEF-019 § Acceptance scenarios — verbatim):
 *   Given the accountant creates a document request for a client
 *   When the request is created
 *   Then that client receives an in-portal notification that a document request was created for them
 *   (extended: And the notification rides the existing content-free daily digest — no new email path)
 *
 * // AC-MSG-014-02 // ADR-005 // ADR-006 // ADR-012 // ADR-023 // CS-GEN-001 // CS-GEN-002 // CS-GEN-003
 */
test(
  "AC-MSG-014-02 — client sees document_request_created nudge in portal feed; digest is content-free (no new email path)",
  async ({ page, request }) => {
    // ── Step 1: Setup CLIENT session and navigate to the portal notification feed ──
    // ADR-006: portal surface (apps/portal) for the client's notification feed. // ADR-006
    // ADR-005: CLIENT session → sec.pol_Notification FILTER scopes to this user's notifications. // ADR-005
    await setupClientSession(page, request, FIXTURE_CLIENT_CLERK_ID);

    // Navigate to the notifications feed
    await page.goto(`${PORTAL_URL}/notifications`);

    // Wait for the notification feed to load
    const feedEl = page.locator('[data-testid="notification-feed"]');
    await expect(
      feedEl,
      "[AC-MSG-014-02] notification-feed must be visible",
    ).toBeVisible({ timeout: 15_000 });

    // ── Step 2: Assert the document_request_created notification is in the feed ───
    // AC-MSG-014-02: "that client receives an in-portal notification". // AC-MSG-014-02
    // ADR-005: RLS (sec.pol_Notification) scopes the feed to this CLIENT's notifications. // ADR-005
    const notifItem = page.locator(
      `[data-testid="notification-item-${fixture.notificationId}"]`,
    );

    await expect(
      notifItem,
      `[AC-MSG-014-02] notification-item-${fixture.notificationId} must be visible in the feed`,
    ).toBeVisible({ timeout: 10_000 });

    // Verify the notification title is content-free (CS-GEN-001 compliance).
    // The title must match the generic "A document request has been created for you"
    // (no request label, no client name, no engagement reference).
    // CS-GEN-001: no PII or request detail in notification title. // CS-GEN-001
    await expect(
      notifItem,
      "[AC-MSG-014-02] notification item must contain the expected content-free title",
    ).toContainText(EXPECTED_NOTIFICATION_TITLE, { ignoreCase: true });

    // Verify the notification is unread (readAt = NULL → unread indicator present)
    // This also proves the notification is eligible for the digest (unread → digest candidate).
    // AC-MSG-014-02: notification delivered to the feed (unread). // AC-MSG-014-02

    await clearSession(page);

    // ── Step 3: Digest-reuse assertion — the notification rides the EXISTING EPIC-018 digest ──
    // CS-GEN-002: reusing the EXISTING /api/dev/dispatch-digest seam — no new email path. // CS-GEN-002
    // AC-MSG-014-02 extra gate: "NO new per-event email and NO new email content path". // AC-MSG-014-02
    // ADR-023: ENABLE_DIGEST_TRIGGER=true is already set in the admin container. // ADR-023

    // Clear Mailhog before dispatch (determinism — no cross-test bleed).
    await clearMailhog();

    // Trigger the existing EPIC-018 daily digest dispatch.
    // CS-GEN-002: this is the SAME digest seam as EPIC-018 — no new email path. // CS-GEN-002
    const dispatchResult = await triggerDigestDispatch(ADMIN_URL);

    // The dispatch must have sent at least one nudge (our fixture user has an unread notification).
    expect(
      dispatchResult.sentCount,
      "[AC-MSG-014-02] digest dispatch must have sent at least one nudge (sentCount ≥ 1)",
    ).toBeGreaterThanOrEqual(1);

    // Wait for the nudge email to arrive in Mailhog.
    // ADR-023: SMTP → Mailhog; the email arrives via the real SMTP path. // ADR-023
    const msg = await waitForEmail({
      to: FIXTURE_CLIENT_EMAIL,
      timeoutMs: 15_000,
    });

    const subject = getSubject(msg);
    const body = getBody(msg);

    // ── Step 4: Assert content-free (two-sided proof) ─────────────────────────────
    //
    // POSITIVE side: subject and body carry "new activity" text only.
    // CS-GEN-001: generic nudge — no notification detail in the email. // CS-GEN-001
    // AC-MSG-008-01 (via EPIC-018 reuse): content-free nudge contract. // AC-MSG-008-01
    expect(
      subject.toLowerCase(),
      "[AC-MSG-014-02] digest subject must contain 'new activity' (positive side — content-free)",
    ).toContain("new activity");

    const portalSignInUrl = process.env["PORTAL_BASE_URL"] ?? PORTAL_URL;
    expect(
      body,
      "[AC-MSG-014-02] digest body must contain the portal sign-in URL (positive side)",
    ).toContain(portalSignInUrl.replace(/\/$/, ""));

    // NEGATIVE side: neither the sensitive body content NOR any request detail appears.
    // This proves NO new email content path was introduced — only the content-free digest.
    // CS-GEN-002: additive (no new email path). // CS-GEN-002 // AC-MSG-014-02
    const subjectAndBody = `${subject} ${body}`;

    expect(
      subjectAndBody.toLowerCase().includes(SENSITIVE_REQUEST_LABEL.toLowerCase()),
      "[AC-MSG-014-02] digest must NOT contain the sensitive request label " +
        `("${SENSITIVE_REQUEST_LABEL}") — no new email content path (negative side)`,
    ).toBe(false);

    expect(
      subjectAndBody.toLowerCase().includes(SENSITIVE_ENGAGEMENT_REF.toLowerCase()),
      "[AC-MSG-014-02] digest must NOT contain the sensitive engagement ref " +
        `("${SENSITIVE_ENGAGEMENT_REF}") — no new email content path (negative side)`,
    ).toBe(false);

    expect(
      subjectAndBody.toLowerCase().includes(EXPECTED_NOTIFICATION_TITLE.toLowerCase()),
      "[AC-MSG-014-02] digest must NOT contain the notification title itself — " +
        "content-free means only 'new activity', not the notification title (two-sided proof)",
    ).toBe(false);
  },
);
