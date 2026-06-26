/**
 * apps/portal/e2e/specs/email-nudge-signin.spec.ts
 *
 * Tier-6 e2e — Content-free nudge email → portal sign-in journey (EPIC-018 / TASK-018-005)
 *
 * Acceptance criteria covered:
 *   AC-MSG-008-01 — The email digest nudge conveys ONLY that new activity is waiting
 *                   in the portal and the sign-in URL. No activity detail of any kind
 *                   leaks into the subject or body (two-sided proof on real SMTP path).
 *   AC-MSG-008-03 — The sign-in URL embedded in the nudge leads the recipient back to
 *                   the CLIENT portal sign-in page (apps/portal /sign-in).
 *
 * Strategy:
 *   1. Seed a CLIENT User + EngagementRequest + Engagement + unread Notification.
 *      The Notification contains five categories of sensitive data in its title and body:
 *        - client name (SENSITIVE_CLIENT_NAME)
 *        - document name (SENSITIVE_DOCUMENT_NAME)
 *        - message content (SENSITIVE_MESSAGE_BODY)
 *        - engagement reference (SENSITIVE_ENGAGEMENT_REF)
 *        - event description (SENSITIVE_EVENT_DESC)
 *   2. Clear Mailhog before the test (determinism — no cross-test bleed).
 *   3. Trigger the daily digest via the dev/test trigger seam:
 *        POST ADMIN_URL/api/dev/dispatch-digest
 *      The dispatch runs against the real SMTP → Mailhog path.
 *      An ACCOUNTANT mock session is used to satisfy the admin middleware guard.
 *   4. Wait for the nudge email to arrive in Mailhog (waitForEmail).
 *   5. Assert content-free (two-sided — the key security property):
 *      Positive side: subject contains "new activity"; body contains sign-in URL.
 *      Negative side: subject+body contain NONE of the seeded sensitive strings.
 *   6. Navigate to the sign-in URL from the email → assert portal /sign-in page (AC-MSG-008-03).
 *
 * Cross-surface (CLAUDE.md § Platform-frontend scope):
 *   The dispatch is triggered via apps/admin (ADMIN_URL). The sign-in journey
 *   lands on apps/portal (PORTAL_URL). Both surfaces are exercised.
 *
 * Stack: full docker-compose stack; Mailhog at MAILHOG_HTTP_PORT (default 18025).
 *        EMAIL_PROVIDER=smtp (admin container) → Mailhog SMTP (port 1025 internal).
 *        ENABLE_DIGEST_TRIGGER=true (docker-compose default for local/e2e stack).
 *        AUTH_PROVIDER=mock (admin + portal containers).
 *
 * Run:
 *   pnpm --filter portal e2e:run -- --grep "AC-MSG-008-01"
 *   pnpm --filter portal e2e:run -- --grep email-nudge-signin
 *
 * DECISION (TASK-018-005): The dispatch route was designed to be unauthenticated
 *   (DECISION-018-003-C) but the admin middleware has no bypass for /api/dev/* paths.
 *   We create a minimal ACCOUNTANT mock session to satisfy the middleware guard. The
 *   session is ephemeral and discarded after the dispatch call; it does not affect any
 *   user data. This is a workaround for a gap in TASK-018-003's middleware configuration.
 *   // DECISION-018-003-C // DECISION (TASK-018-005)
 *
 * ADR-003: admin pool for fixture seed/teardown (RLS-exempt; no SESSION_CONTEXT needed). // ADR-003
 * ADR-005: RLS policy on Notification enforced via CLIENT session on portal (admin pool for fixture). // ADR-005
 * ADR-006: CLIENT → portal surface (PORTAL_APP_URL/sign-in); dispatch via admin route. // ADR-006
 * ADR-012: Tier-6 e2e against the full docker-compose stack. // ADR-012
 * ADR-023: SMTP → Mailhog for dev/e2e; ENABLE_DIGEST_TRIGGER=true enables the seam. // ADR-023
 * ADR-025: dispatchDailyDigest sends via EmailProvider port; content by composeDigestNudge. // ADR-025
 * REQ-MSG-008: content-free nudge contract (this test re-asserts on the real SMTP path). // REQ-MSG-008
 * CS-TS-003: Mailhog fixture mirrored from apps/admin/e2e/fixtures/mailhog.ts. // CS-TS-003
 * CS-GEN-001: no PII in test data beyond necessary fixture identifiers. // CS-GEN-001
 * CS-GEN-002: additive test; no existing spec removed or narrowed. // CS-GEN-002
 * CS-GEN-003: AC ids and governing keys cited throughout. // CS-GEN-003
 *
 * // ADR-003 // ADR-005 // ADR-006 // ADR-012 // ADR-023 // ADR-025
 * // REQ-MSG-008 // REQ-MSG-011
 * // CS-TS-003 // CS-GEN-001 // CS-GEN-002 // CS-GEN-003
 */

import { test, expect } from "@playwright/test";
import mssqlPkg from "mssql";
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
// Unique suffix "-018-005-001" avoids collision with all other suites in this project.
// CS-GEN-001: no real PII used — all values are fake/synthetic fixture data. // CS-GEN-001

const FIXTURE_CLIENT_CLERK_ID = "user_client_nudge_e2e_018_005_001";
const FIXTURE_CLIENT_EMAIL = "nudge-e2e-018-005-001@example.com";

// ─── Sensitive strings seeded into the Notification title and body ────────────
//
// These strings represent the five categories of sensitive data the content-free
// contract (REQ-MSG-008 / AC-MSG-008-01 / AC-MSG-008-02) prohibits from appearing
// in the delivered email:
//   1. Client name
//   2. Document name
//   3. Message body / content
//   4. Engagement detail / reference
//   5. Event description
//
// Each string uses a unique obfuscated suffix to avoid false positives from any
// generic words that legitimately appear in the nudge ("portal", "activity", etc.).
//
// // REQ-MSG-008 // AC-MSG-008-01 // AC-MSG-008-02 // ADR-025 §3 // ADR-017

const SENSITIVE_CLIENT_NAME = "SensitiveClientAlphaBeta_018005";
const SENSITIVE_DOCUMENT_NAME = "SensitiveDoc_TaxReturn_XYZ2024.pdf";
const SENSITIVE_MESSAGE_BODY = "SensitiveMsgContent_ABC123_018005";
const SENSITIVE_ENGAGEMENT_REF = "SensitiveEngRef_DEF456_018005";
const SENSITIVE_EVENT_DESC = "SensitiveEventDesc_GHI789_018005";

const SENSITIVE_STRINGS = [
  SENSITIVE_CLIENT_NAME,
  SENSITIVE_DOCUMENT_NAME,
  SENSITIVE_MESSAGE_BODY,
  SENSITIVE_ENGAGEMENT_REF,
  SENSITIVE_EVENT_DESC,
] as const;

// ─── DB helpers (admin pool — RLS-exempt fixture setup/teardown) ──────────────
//
// CS-TS-003: parseSqlServerUrl is duplicated across e2e specs per established convention.
//   Each spec is self-contained; no shared DB fixture util exists yet in this codebase.
// // CS-TS-003

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
      "[email-nudge-signin.spec] DATABASE_URL_ADMIN is not set " +
        "(required for fixture setup/teardown — ensure it is set in .env.local or injected by CI).",
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

// ─── Fixture state ─────────────────────────────────────────────────────────────

interface NudgeFixture {
  userId: string;
  engagementId: string;
}

/**
 * Seeds a CLIENT User + EngagementRequest + Engagement + unread Notification.
 *
 * The Notification has sensitive strings in its title and body — these represent
 * actual notification content (client name, document name, message body, engagement
 * reference, event description). None of these must appear in the delivered nudge
 * email, proving the two-sided content-free property (AC-MSG-008-01 / AC-MSG-008-02).
 *
 * The User is seeded without an explicit emailNudgeEnabled value — the DB DEFAULT 1
 * (from the brief-018 migration) is in effect, proving no opt-in step is needed
 * (also demonstrates the AC-MSG-011-01 default-on invariant as a side effect).
 *
 * ADR-005: admin pool for fixture — RLS is not exercised here (admin pool bypasses it). // ADR-005
 * ADR-003: no SESSION_CONTEXT needed for admin pool seed operations (ADR-003 §7). // ADR-003
 * CS-GEN-001: no real PII — all values are synthetic fixture identifiers. // CS-GEN-001
 */
async function seedFixture(): Promise<NudgeFixture> {
  const pool = await getPool();
  // Idempotent: clean up any prior run for this clerkId before seeding fresh.
  await cleanupFixture(pool).catch(() => { /* ignore on first run */ });

  // 1. Upsert CLIENT User.
  //    Omitting emailNudgeEnabled → DB DEFAULT 1 (nudge-enabled by default, no opt-in needed).
  //    // AC-MSG-011-01 // REQ-MSG-011 // ADR-003
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
    if (!userId) throw new Error("[email-nudge-signin.spec] Failed to upsert User fixture");
  }

  // 2. Seed an EngagementRequest (accepted status — client has an active engagement).
  const reqResult = await pool
    .request()
    .input("email", FIXTURE_CLIENT_EMAIL)
    .query<{ id: string }>(
      `INSERT INTO [dbo].[EngagementRequest]
         ([firstName], [lastName], [email], [phone], [message], [status], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES (N'NudgeTest', N'E2E018005', @email, NULL, NULL, N'accepted', SYSDATETIMEOFFSET())`,
    );
  const requestId = reqResult.recordset[0]?.id;
  if (!requestId) {
    throw new Error("[email-nudge-signin.spec] Failed to seed EngagementRequest fixture");
  }

  // 3. Seed an Engagement linked to the client user.
  //    clientUserId is required so getDigestRecipients can join User on Notification.
  const engResult = await pool
    .request()
    .input("clientUserId", userId)
    .input("requestId", requestId)
    .query<{ id: string }>(
      `INSERT INTO [dbo].[Engagement]
         ([clientUserId], [engagementRequestId], [status], [taxYear], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES (@clientUserId, @requestId, N'In Progress', 2024, SYSDATETIMEOFFSET())`,
    );
  const engagementId = engResult.recordset[0]?.id;
  if (!engagementId) {
    throw new Error("[email-nudge-signin.spec] Failed to seed Engagement fixture");
  }

  // 4. Seed an unread Notification with sensitive strings in title and body.
  //    These strings (client name, document name, message content, engagement reference,
  //    event description) represent the data categories REQ-MSG-008 prohibits from
  //    appearing in the delivered email. The two-sided proof asserts their absence.
  //    readAt = NULL → unread → eligible for digest nudge.
  //    // REQ-MSG-008 // AC-MSG-008-01 // AC-MSG-008-02 // ADR-025 §3
  await pool
    .request()
    .input("recipientUserId", userId)
    .input("engagementId", engagementId)
    .input(
      "sensitiveTitle",
      `${SENSITIVE_CLIENT_NAME} sent a document: ${SENSITIVE_DOCUMENT_NAME}`,
    )
    .input(
      "sensitiveBody",
      `${SENSITIVE_MESSAGE_BODY} regarding engagement ${SENSITIVE_ENGAGEMENT_REF}: ${SENSITIVE_EVENT_DESC}`,
    )
    .query(
      `INSERT INTO [dbo].[Notification]
         ([type], [title], [body], [recipientType], [recipientUserId],
          [linkedItemType], [linkedItemId], [readAt])
       VALUES (
         N'message_received',
         @sensitiveTitle,
         @sensitiveBody,
         N'CLIENT',
         @recipientUserId,
         N'engagement',
         @engagementId,
         NULL
       )`,
    );

  return {
    userId: userId.toLowerCase(),
    engagementId: engagementId.toLowerCase(),
  };
}

/**
 * Cleanup: delete notification → engagement → request → user (FK-ordered).
 * Idempotent — .catch(() => {}) ignores "row not found" errors on first run.
 *
 * ADR-005: admin pool for cleanup — RLS not involved. // ADR-005
 */
async function cleanupFixture(pool: mssqlPkg.ConnectionPool): Promise<void> {
  // 1. Delete Notifications for this user (recipientUserId FK → User.id has SetNull,
  //    but we delete explicitly to ensure clean state).
  await pool
    .request()
    .input("clerkId", FIXTURE_CLIENT_CLERK_ID)
    .query(
      `DELETE n FROM [dbo].[Notification] n
       INNER JOIN [dbo].[User] u ON n.[recipientUserId] = u.[id]
       WHERE u.[clerkId] = @clerkId`,
    )
    .catch(() => { });

  // 2. Delete Engagements for this user (FK: Engagement.clientUserId → User.id).
  await pool
    .request()
    .input("clerkId", FIXTURE_CLIENT_CLERK_ID)
    .query(
      `DELETE e FROM [dbo].[Engagement] e
       INNER JOIN [dbo].[User] u ON e.[clientUserId] = u.[id]
       WHERE u.[clerkId] = @clerkId`,
    )
    .catch(() => { });

  // 3. Delete EngagementRequests for this email (after Engagement removed).
  await pool
    .request()
    .input("email", FIXTURE_CLIENT_EMAIL)
    .query(`DELETE FROM [dbo].[EngagementRequest] WHERE [email] = @email`)
    .catch(() => { });

  // 4. Delete User last (other FKs resolved above).
  await pool
    .request()
    .input("clerkId", FIXTURE_CLIENT_CLERK_ID)
    .query(`DELETE FROM [dbo].[User] WHERE [clerkId] = @clerkId`)
    .catch(() => { });
}

// ─── Dispatch trigger helper ───────────────────────────────────────────────────

/**
 * Trigger the daily digest dispatch via the dev/test seam on apps/admin.
 *
 * The dispatch route POST /api/dev/dispatch-digest (TASK-018-003) sends nudge emails
 * via the configured EmailProvider (SMTP → Mailhog for dev/e2e). It is guarded by
 * ENABLE_DIGEST_TRIGGER=true (docker-compose default for local/e2e).
 *
 * The admin middleware (applyAdminAuth) requires an ACCOUNTANT session. We create a
 * minimal ACCOUNTANT mock session to satisfy the middleware guard. The session is
 * ephemeral — it is used only for this HTTP call and writes no user data.
 *
 * DECISION (TASK-018-005): The route was designed to be unauthenticated (DECISION-018-003-C)
 *   but the admin middleware does not have an exemption for /api/dev/* paths. Creating a
 *   minimal ACCOUNTANT session is the least-invasive workaround that avoids rebuilding
 *   the admin container. The session cookie is scoped to this fetch call only.
 *   // DECISION-018-003-C // DECISION (TASK-018-005)
 *
 * // ADR-023: SMTP → Mailhog; ENABLE_DIGEST_TRIGGER=true for dev/e2e. // ADR-023
 * // ADR-025: dispatch uses EmailProvider port only; no ESP SDK at this call site. // ADR-025
 * // CS-GEN-001: no PII in the session clerkUserId used for the trigger. // CS-GEN-001
 */
async function triggerDispatch(adminUrl: string): Promise<{ sentCount: number }> {
  // Step 1: Obtain a minimal ACCOUNTANT mock session to pass the admin middleware.
  // CS-GEN-001: clerkUserId is a synthetic fixture identifier, not a real user. // CS-GEN-001
  const sessionResp = await fetch(`${adminUrl}/api/mock-session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      clerkUserId: "dispatch_trigger_e2e_session_018_005",
      role: "ACCOUNTANT",
    }),
  });

  if (!sessionResp.ok) {
    throw new Error(
      `[triggerDispatch] POST ${adminUrl}/api/mock-session returned ${sessionResp.status}. ` +
        `Is AUTH_PROVIDER=mock set in the admin container?`,
    );
  }

  const setCookieHeader = sessionResp.headers.get("set-cookie");
  if (!setCookieHeader) {
    throw new Error(
      "[triggerDispatch] POST /api/mock-session did not return Set-Cookie header. " +
        "Is ALLOW_MOCK_AUTH=true set in the admin container?",
    );
  }

  // Extract the raw "name=value" portion of the cookie (before any ; attrs).
  const cookieValue = setCookieHeader.split(";")[0] ?? "";

  // Step 2: POST to the dispatch trigger with the session cookie.
  // ADR-023: ENABLE_DIGEST_TRIGGER=true (docker-compose default) enables this route.
  // ADR-025: the route calls dispatchDailyDigest which uses getEmailProvider() internally.
  // // ADR-023 // ADR-025
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
      `[triggerDispatch] POST ${adminUrl}/api/dev/dispatch-digest returned ${dispatchResp.status}: ${text}. ` +
        `Is ENABLE_DIGEST_TRIGGER=true in the admin container? ` +
        `(docker-compose default: true — if recently changed, restart the admin container)`,
    );
  }

  return dispatchResp.json() as Promise<{ sentCount: number }>;
}

// ─── Suite setup / teardown ───────────────────────────────────────────────────

let fixture: NudgeFixture;

test.beforeAll(async () => {
  fixture = await seedFixture();
});

test.afterAll(async () => {
  const pool = await getPool();
  await cleanupFixture(pool);
  await closePool();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

/**
 * [AC-MSG-008-01] [AC-MSG-008-03]
 * Content-free nudge in Mailhog + sign-in link leads to portal /sign-in.
 *
 * Given a CLIENT user with an unread in-portal notification containing sensitive detail
 *   (client name, document name, message body, engagement reference, event description),
 * When the daily digest dispatch runs via the admin trigger seam,
 * Then a nudge email arrives in Mailhog (real SMTP delivery — ADR-023):
 *   [AC-MSG-008-01] The subject and body contain ONLY generic "new activity" text
 *                   and the sign-in URL — none of the seeded sensitive strings leak.
 *   [AC-MSG-008-03] Following the sign-in URL leads the recipient to the portal
 *                   sign-in page (apps/portal /sign-in, not the admin surface).
 *
 * This is the tier-6 e2e re-assertion of the content-free property: proving it
 * survives the real SMTP→Mailhog path, not just the unit-level composer test
 * (TASK-018-003 tier-3 integration test).
 *
 * // AC-MSG-008-01 // AC-MSG-008-03 // REQ-MSG-008 // ADR-006 // ADR-012 // ADR-023 // ADR-025
 */
test(
  "AC-MSG-008-01 AC-MSG-008-03 — client receives content-free nudge in Mailhog; no sensitive detail; sign-in link lands at portal /sign-in",
  async ({ page }) => {
    // ── Step 1: Clear Mailhog (determinism — no cross-test bleed) ──────────────
    // Any prior messages are irrelevant to this test; clearing ensures we only
    // assert on mail delivered by this specific dispatch invocation.
    await clearMailhog();

    // ── Step 2: Trigger the daily digest ───────────────────────────────────────
    // ADR-023: dispatch sends via EMAIL_PROVIDER=smtp → Mailhog SMTP port 1025.
    // ADR-025: dispatch uses composeDigestNudge (content-free) + EmailProvider port.
    // // ADR-023 // ADR-025
    const result = await triggerDispatch(ADMIN_URL);

    // Dispatch must have processed at least the fixture user.
    expect(
      result.sentCount,
      "[AC-MSG-008-01] dispatch must have sent at least one nudge (sentCount ≥ 1)",
    ).toBeGreaterThanOrEqual(1);

    // ── Step 3: Wait for the nudge to arrive in Mailhog ────────────────────────
    // waitForEmail polls until the message for FIXTURE_CLIENT_EMAIL arrives.
    // Timeout is generous (15s) to account for SMTP delivery latency in CI.
    // // ADR-023 // AC-MSG-008-01
    const msg = await waitForEmail({ to: FIXTURE_CLIENT_EMAIL, timeoutMs: 15_000 });

    const subject = getSubject(msg);
    const body = getBody(msg);

    // ── Step 4: Assert content-free (positive side) ────────────────────────────
    // The subject must convey "new activity" — the ONLY permitted message (REQ-MSG-008).
    // The body must contain the sign-in URL as the sole actionable affordance.
    // // AC-MSG-008-01 // REQ-MSG-008 // ADR-025 §3

    expect(
      subject.toLowerCase(),
      "[AC-MSG-008-01] Subject must convey generic new-activity statement (positive side)",
    ).toContain("new activity");

    expect(
      body.toLowerCase(),
      "[AC-MSG-008-01] Body must convey generic new-activity statement (positive side)",
    ).toContain("new activity");

    expect(
      body,
      "[AC-MSG-008-01] Body must contain a sign-in URL as the only action affordance",
    ).toContain("/sign-in");

    // ── Step 5: Assert content-free (negative side — two-sided proof) ──────────
    // NONE of the five categories of sensitive data seeded into the Notification
    // must appear in the delivered email's subject or body. This proves the contract
    // survives the real SMTP→Mailhog path (not just the unit-level test).
    // // AC-MSG-008-01 // AC-MSG-008-02 // REQ-MSG-008 // ADR-025 §3 // ADR-017
    for (const sensitive of SENSITIVE_STRINGS) {
      expect(
        subject,
        `[AC-MSG-008-01] Subject must NOT leak sensitive string: "${sensitive}"`,
      ).not.toContain(sensitive);

      expect(
        body,
        `[AC-MSG-008-01] Body must NOT leak sensitive string: "${sensitive}"`,
      ).not.toContain(sensitive);
    }

    // ── Step 6: Extract sign-in URL from the email body ────────────────────────
    // The body from composeDigestNudge has the format:
    //   "You have new activity waiting for you in your portal.\n\n"
    //   "Sign in to see what's new: http://localhost:3000/sign-in"
    // // AC-MSG-008-03 // ADR-006
    const signInUrlMatch = body.match(/https?:\/\/[^\s]+\/sign-in\b/);
    expect(
      signInUrlMatch,
      "[AC-MSG-008-03] Email body must contain a https?://.../sign-in URL",
    ).not.toBeNull();

    const signInUrl = signInUrlMatch![0]!;

    // The URL must point to the CLIENT portal surface, not the admin surface.
    // ADR-006: CLIENT → PORTAL_APP_URL/sign-in (port 3000 in dev/e2e).
    // In the admin container, PORTAL_APP_URL=http://localhost:3000.
    // // ADR-006 // AC-MSG-008-03
    expect(
      signInUrl,
      "[AC-MSG-008-03] Sign-in URL must reference the portal surface (port 3000 / PORTAL_APP_URL)",
    ).toContain(":3000/sign-in");

    // ── Step 7: Navigate to the sign-in URL — assert portal sign-in page ────────
    // AC-MSG-008-03: following the embedded sign-in link leads the recipient to the
    // CLIENT portal sign-in page (apps/portal /sign-in), not the admin surface.
    // ADR-006: the CLIENT surface is apps/portal (port 3000). // ADR-006 // AC-MSG-008-03
    await page.goto(signInUrl);
    await page.waitForLoadState("load");

    // The portal sign-in page renders data-testid="signin-form".
    // The URL must match the portal /sign-in path.
    const signInForm = page.getByTestId("signin-form");
    await expect(
      signInForm,
      "[AC-MSG-008-03] Portal /sign-in page must render the sign-in form",
    ).toBeVisible({ timeout: 10_000 });

    await expect(
      page,
      "[AC-MSG-008-03] Browser URL must be at portal /sign-in after following the nudge link",
    ).toHaveURL(/\/sign-in/, { timeout: 10_000 });

    // Sanity: we should be at the PORTAL URL (port 3000), not the admin (port 3001 / 13001).
    const currentUrl = page.url();
    expect(
      currentUrl,
      "[AC-MSG-008-03] Must land on PORTAL URL (port 3000), not the admin surface",
    ).toMatch(/localhost:3000/);

    // Log for Work Log evidence (ENGINE § Submission Gate).
    // CS-GEN-001: log only structural evidence; no PII from the email content. // CS-GEN-001
    console.log(
      `[AC-MSG-008-01 AC-MSG-008-03] ✓ Nudge delivered to ${FIXTURE_CLIENT_EMAIL} via Mailhog. ` +
        `sentCount=${result.sentCount}. Subject="${subject}". ` +
        `Sign-in URL="${signInUrl}". Landed at: ${currentUrl}. ` +
        `Content-free: all ${SENSITIVE_STRINGS.length} sensitive strings absent from subject+body.`,
    );
  },
);
