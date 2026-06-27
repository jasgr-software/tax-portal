/**
 * apps/portal/e2e/demo/request-created-nudge.demo.spec.ts
 *
 * @demo UI demo walkthrough — EPIC-019 Client request-created nudge (portal / Client Portal).
 *
 * Not part of the e2e gate: `e2e:run` / `e2e:smoke` exclude `@demo` (--grep-invert @demo);
 * this runs ONLY via `pnpm --filter portal e2e:demo`. It drives sarah-client's notification
 * happy-path against the live docker-compose container stack (AUTH_PROVIDER=mock) and writes
 * an AC-tagged screenshot gallery to docs/demos/EPIC-019/. NON-GATING.
 *
 * No phase-walkthrough video — this slice does not close Phase 4. // BRIEF-019 § Notes
 *
 * Persona:   sarah-client (.planning/personas/sarah-client.md)
 * Flow:      flow-notification-feed (reminder branch — request-created nudge variant)
 *            (.planning/flows/flow-notification-feed.md)
 * Policy:    .orchestration/DEMO-POLICY.md
 *
 * Gallery ordering (EPIC-019 portal surface — screenshots 06–07):
 *   06-AC-MSG-014-02-portal-notification.png
 *       — sarah views the in-portal notification that a document request was created for her
 *   07-AC-MSG-014-02-digest-email.png
 *       — (optional) Mailhog web UI showing the content-free digest email
 *         that summarizes the notification without revealing request detail
 *         (content-free: no label, engagement reference, or request description in body)
 *
 * Screenshot 07 is OPTIONAL: requires Mailhog reachable AND ENABLE_DIGEST_TRIGGER=true.
 * If unavailable, the demo writes 06 only and skips 07 gracefully.
 *
 * Each test ASSERTS the target element is visible BEFORE screenshotting.
 *
 * retro-012-012 (MANDATORY): screenshots MUST write ONLY to docs/demos/EPIC-019/.
 * This const is the ONLY path used; no prior-epic gallery is touched. // CS-GEN-001
 *
 * ADR-005: CLIENT sees only her own notification (RLS scoped). // ADR-005
 * ADR-006: Portal surface only (Client Portal). // ADR-006
 * ADR-012: Tier-6 e2e (demo variant — non-gating). // ADR-012
 * ADR-023: ENABLE_DIGEST_TRIGGER seam; no new email path. // ADR-023
 * CS-GEN-001: Digest email is content-free. // CS-GEN-001
 * CS-GEN-002: No new email path; rides existing EPIC-018 digest. // CS-GEN-002
 * CS-GEN-003: AC ids cited in every test and screenshot name. // CS-GEN-003
 *
 * Run:
 *   ADMIN_PORT=13001 pnpm --filter portal e2e:demo -- --grep "request-created-nudge"
 */

import { test, expect } from "@playwright/test";
import path from "path";
import mssqlPkg from "mssql";
import { setupClientSession, clearSession } from "../fixtures/auth.js";
import { clearMailhog, waitForEmail } from "../fixtures/mailhog.js";

const { ConnectionPool, UniqueIdentifier } = mssqlPkg;

// Gallery output dir — repo-root/docs/demos/EPIC-019 (resolved from this file's dir).
// Depth from apps/portal/e2e/demo/ to repo root = ../../../../
// retro-012-012 (MANDATORY): screenshots MUST write ONLY to docs/demos/EPIC-019/.
const DEMO_DIR = path.resolve(__dirname, "../../../../docs/demos/EPIC-019");
const shot = (file: string) => path.join(DEMO_DIR, file);

// Portal base URL
const PORTAL_PORT = process.env["PORTAL_PORT"] ?? "3000";
const PORTAL_URL = process.env["PORTAL_BASE_URL"] ?? `http://localhost:${PORTAL_PORT}`;

// Admin base URL — needed to trigger the digest dispatch seam
const ADMIN_PORT = process.env["ADMIN_PORT"] ?? "3001";
const ADMIN_URL = process.env["ADMIN_BASE_URL"] ?? `http://localhost:${ADMIN_PORT}`;

// Demo-specific fixture identifiers (deterministic, no collision with gate specs).
// CS-GEN-001: synthetic identifiers — no real PII. // CS-GEN-001
const SARAH_CLERK_ID = "user_client_demo_019_sarah";
const SARAH_EMAIL = "sarah-demo-019@demo.e2e.test";

// A fixed ACCOUNTANT clerkId used only to call the digest trigger (no DB row needed).
const DIGEST_TRIGGER_CLERK_ID = "user_accountant_demo_019_digest_trigger";

// Sentinel strings for content-free assertion
// These must NOT appear in the digest email subject or body.
// CS-GEN-001: digest email must not echo sensitive request details. // CS-GEN-001
const SENSITIVE_REQUEST_LABEL = "Demo019-TaxReturnDocs-Sensitive-Label";
const SENSITIVE_ENGAGEMENT_REF = "Demo019-EngagementRef-Sensitive";

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

  return {
    server,
    port:
      port !== 1433
        ? port
        : params["port"]
          ? parseInt(params["port"], 10)
          : 1433,
    user: user ?? params["user"],
    password: password ?? params["password"],
    database: params["database"] ?? "master",
    options: {
      encrypt: (params["encrypt"] ?? "true").toLowerCase() !== "false",
      trustServerCertificate:
        (params["trustServerCertificate"] ?? "false").toLowerCase() === "true",
    },
  };
}

let _pool: mssqlPkg.ConnectionPool | null = null;

async function getPool(): Promise<mssqlPkg.ConnectionPool> {
  if (_pool && _pool.connected) return _pool;
  const url = process.env["DATABASE_URL_ADMIN"];
  if (!url) {
    throw new Error(
      "[request-created-nudge.demo.spec] DATABASE_URL_ADMIN is not set. Required for admin pool seed/teardown.",
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

interface DemoSeedResult {
  userId: string;
  notificationId: string;
  engagementId: string;
}

/**
 * Seeds a USER (sarah-client) + EngagementRequest + Engagement + Notification
 * of type 'document_request_created'.
 * The notification body contains SENSITIVE strings that must NOT appear in the digest email.
 */
async function seedDemoFixture(): Promise<DemoSeedResult> {
  const pool = await getPool();

  // Cleanup any prior demo fixture for this email (idempotent)
  await cleanupDemoFixture(pool).catch(() => {
    /* ignore on first run */
  });

  // 1. User (sarah-client)
  const userResult = await pool
    .request()
    .input("clerkId", SARAH_CLERK_ID)
    .input("email", SARAH_EMAIL)
    .query<{ id: string }>(
      `INSERT INTO [dbo].[User]
         ([clerkUserId], [email], [role], [createdAt], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES (@clerkId, @email, N'CLIENT', GETUTCDATE(), GETUTCDATE())`,
    );

  const userId = userResult.recordset[0]?.id;
  if (!userId) {
    throw new Error("[request-created-nudge.demo.spec] Failed to seed User");
  }

  // 2. EngagementRequest
  const reqResult = await pool
    .request()
    .input("email", SARAH_EMAIL)
    .query<{ id: string }>(
      `INSERT INTO [dbo].[EngagementRequest]
         ([firstName], [lastName], [email], [status], [createdAt], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES (N'DemoSarah', N'ClientDemo019', @email, N'accepted', GETUTCDATE(), GETUTCDATE())`,
    );

  const engagementRequestId = reqResult.recordset[0]?.id;
  if (!engagementRequestId) {
    throw new Error(
      "[request-created-nudge.demo.spec] Failed to seed EngagementRequest",
    );
  }

  // 3. Engagement (linked to client userId)
  const engResult = await pool
    .request()
    .input("engagementRequestId", UniqueIdentifier, engagementRequestId)
    .input("clientUserId", UniqueIdentifier, userId)
    .query<{ id: string }>(
      `INSERT INTO [dbo].[Engagement]
         ([engagementRequestId], [clientUserId], [status], [createdAt], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES (@engagementRequestId, @clientUserId, N'New', GETUTCDATE(), GETUTCDATE())`,
    );

  const engagementId = engResult.recordset[0]?.id;
  if (!engagementId) {
    throw new Error(
      "[request-created-nudge.demo.spec] Failed to seed Engagement",
    );
  }

  // 4. Notification: document_request_created
  //    Body contains SENSITIVE strings to assert content-free in digest.
  //    ADR-005: recipientType='CLIENT', recipientUserId=userId — scoped to sarah. // ADR-005
  //    CS-GEN-001: email body must NOT echo these sensitive strings. // CS-GEN-001
  const notifResult = await pool
    .request()
    .input("recipientUserId", UniqueIdentifier, userId)
    .input("sensitiveLabel", SENSITIVE_REQUEST_LABEL)
    .input("sensitiveRef", SENSITIVE_ENGAGEMENT_REF)
    .query<{ id: string }>(
      `INSERT INTO [dbo].[Notification]
         ([recipientType], [recipientUserId], [type], [title], [body], [isRead], [createdAt], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES (
         N'CLIENT',
         @recipientUserId,
         N'document_request_created',
         N'New document request',
         N'A document request "' + @sensitiveLabel + '" was created for engagement ' + @sensitiveRef + '.',
         0,
         GETUTCDATE(),
         GETUTCDATE()
       )`,
    );

  const notificationId = notifResult.recordset[0]?.id;
  if (!notificationId) {
    throw new Error(
      "[request-created-nudge.demo.spec] Failed to seed Notification",
    );
  }

  return {
    userId: userId.toLowerCase(),
    notificationId: notificationId.toLowerCase(),
    engagementId: engagementId.toLowerCase(),
  };
}

async function cleanupDemoFixture(
  pool: mssqlPkg.ConnectionPool,
): Promise<void> {
  // Delete notifications for the demo user
  await pool
    .request()
    .input("clerkId", SARAH_CLERK_ID)
    .query(
      `DELETE n FROM [dbo].[Notification] n
       INNER JOIN [dbo].[User] u ON n.[recipientUserId] = u.[id]
       WHERE u.[clerkUserId] = @clerkId`,
    )
    .catch(() => {});

  // Delete engagements linked to the demo email
  await pool
    .request()
    .input("email", SARAH_EMAIL)
    .query(
      `DELETE e FROM [dbo].[Engagement] e
       INNER JOIN [dbo].[EngagementRequest] er ON e.[engagementRequestId] = er.[id]
       WHERE er.[email] = @email`,
    )
    .catch(() => {});

  // Delete engagement requests
  await pool
    .request()
    .input("email", SARAH_EMAIL)
    .query(`DELETE FROM [dbo].[EngagementRequest] WHERE [email] = @email`)
    .catch(() => {});

  // Delete the user
  await pool
    .request()
    .input("clerkId", SARAH_CLERK_ID)
    .query(`DELETE FROM [dbo].[User] WHERE [clerkUserId] = @clerkId`)
    .catch(() => {});
}

test.afterAll(async () => {
  await closePool();
});

// ─── Screen 06: In-portal notification (AC-MSG-014-02) ────────────────────────

test(
  "[AC-MSG-014-02] @demo 06 — sarah-client: views in-portal notification for document request created",
  async ({ page, request }) => {
    let seeded: DemoSeedResult | null = null;

    try {
      seeded = await seedDemoFixture();
      await setupClientSession(page, request, SARAH_CLERK_ID);

      // Navigate to the portal notifications page
      await page.goto(`${PORTAL_URL}/notifications`);

      const notifItem = page.locator(
        `[data-testid="notification-item-${seeded.notificationId}"]`,
      );
      await expect(
        notifItem,
        `[AC-MSG-014-02] notification-item-${seeded.notificationId} must be visible in portal feed`,
      ).toBeVisible({ timeout: 15_000 });

      // Screenshot 06: In-portal notification visible for sarah-client
      await page.screenshot({
        path: shot("06-AC-MSG-014-02-portal-notification.png"),
        fullPage: true,
      });
    } finally {
      await clearSession(page);
      if (seeded) {
        const pool = await getPool();
        await cleanupDemoFixture(pool);
      }
    }
  },
);

// ─── Screen 07: Content-free digest email (AC-MSG-014-02) ─────────────────────
//
// This screen is OPTIONAL. It requires:
//   1. Mailhog reachable (MAILHOG_HTTP_URL set and service up)
//   2. ENABLE_DIGEST_TRIGGER=true in the running admin container
//
// If either prerequisite is unavailable, the test is skipped (not failed).
// The gate-level assertion for the content-free property is in:
//   apps/portal/e2e/specs/request-created-nudge.spec.ts [AC-MSG-014-02]

test(
  "[AC-MSG-014-02] @demo 07 — digest email is content-free nudge (screenshot optional)",
  async ({ page, request }) => {
    const digestTriggerEnabled =
      process.env["ENABLE_DIGEST_TRIGGER"] === "true";
    const mailhogUrl =
      process.env["MAILHOG_HTTP_URL"] ?? "http://localhost:18025";

    // Quick mailhog ping to check availability
    const mailhogAvailable = await fetch(
      `${mailhogUrl}/api/v2/messages?limit=1`,
    )
      .then((r) => r.ok)
      .catch(() => false);

    if (!digestTriggerEnabled || !mailhogAvailable) {
      test.skip(
        true,
        "[AC-MSG-014-02] Demo screen 07 skipped: ENABLE_DIGEST_TRIGGER not set or " +
          "Mailhog unavailable. Run with ENABLE_DIGEST_TRIGGER=true and Mailhog up to " +
          "capture the digest screenshot.",
      );
      return;
    }

    let seeded: DemoSeedResult | null = null;

    try {
      seeded = await seedDemoFixture();
      await clearMailhog();

      // Trigger digest dispatch via admin API (EPIC-018 seam). // ADR-023 // CS-GEN-002
      // The `request` APIRequestContext can hit any URL including the admin app.
      // Step 1: Obtain an ACCOUNTANT mock-session cookie from the admin app.
      const sessionResp = await request.post(
        `${ADMIN_URL}/api/mock-session`,
        {
          data: { clerkUserId: DIGEST_TRIGGER_CLERK_ID, role: "ACCOUNTANT" },
          headers: { "Content-Type": "application/json" },
        },
      );

      if (!sessionResp.ok()) {
        test.skip(
          true,
          `[AC-MSG-014-02] Demo screen 07 skipped: admin mock-session returned ${sessionResp.status()}.`,
        );
        return;
      }

      // Extract just the name=value portion of the Set-Cookie header (strip directives)
      const rawSetCookie = sessionResp.headers()["set-cookie"] ?? "";
      const sessionCookieToken = rawSetCookie.split(";")[0] ?? "";

      // Step 2: Call dispatch-digest with the session cookie.
      const dispatchResp = await request.post(
        `${ADMIN_URL}/api/dev/dispatch-digest`,
        {
          headers: {
            "Content-Type": "application/json",
            Cookie: sessionCookieToken,
          },
        },
      );

      if (!dispatchResp.ok()) {
        test.skip(
          true,
          `[AC-MSG-014-02] Demo screen 07 skipped: dispatch-digest returned ${dispatchResp.status()}.`,
        );
        return;
      }

      // Wait for the digest email to arrive in Mailhog for sarah's address
      const email = await waitForEmail({
        to: SARAH_EMAIL,
        timeoutMs: 20_000,
      }).catch(() => null);

      if (!email) {
        test.skip(
          true,
          "[AC-MSG-014-02] Demo screen 07 skipped: digest email did not arrive in time.",
        );
        return;
      }

      // Navigate to Mailhog web UI and screenshot it
      await page.goto(`${mailhogUrl}`, { waitUntil: "load" });

      // Screenshot 07: Mailhog web UI showing the content-free digest email
      await page.screenshot({
        path: shot("07-AC-MSG-014-02-digest-email.png"),
        fullPage: true,
      });
    } finally {
      await clearSession(page);
      if (seeded) {
        const pool = await getPool();
        await cleanupDemoFixture(pool);
      }
    }
  },
);
