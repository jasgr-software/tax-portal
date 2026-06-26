/**
 * apps/portal/e2e/specs/client-emailed-without-optin.spec.ts
 *
 * Tier-6 e2e — Client receives nudge by default without performing any opt-in step
 * (EPIC-018 / TASK-018-005)
 *
 * Acceptance criteria covered:
 *   AC-MSG-011-02 — A newly created CLIENT user receives a nudge email by default
 *                   (no opt-in step performed). Proven against real delivered mail
 *                   in Mailhog: the client's emailNudgeEnabled column defaults to
 *                   true (DB DEFAULT 1 per the brief-018 migration), meaning a
 *                   newly inserted User row is nudge-eligible without any additional
 *                   action or configuration.
 *
 * Strategy:
 *   1. Seed a CLIENT User WITHOUT setting emailNudgeEnabled — DB DEFAULT 1 applies.
 *   2. Seed a notification-worthy event (unread Notification, type 'engagement_status_changed'
 *      from the existing EPIC-016 feed).
 *   3. Clear Mailhog before the test.
 *   4. Trigger the daily digest via the dev/test seam.
 *   5. Assert the nudge arrives in Mailhog (proves default-on — no opt-in required).
 *   6. Re-assert the delivered mail is content-free (two-sided) on the real SMTP path.
 *
 * "No opt-in step": the only things created are a User row (with no emailNudgeEnabled
 * column specified in the INSERT → DB DEFAULT 1) and an unread Notification.
 * No call to setEmailNudgePreferenceForCurrentUser(), no UI interaction, no settings
 * page visit. The nudge arrives purely because of the default.
 *
 * Stack: full docker-compose stack; Mailhog at MAILHOG_HTTP_PORT (default 18025).
 *        EMAIL_PROVIDER=smtp → Mailhog SMTP. ENABLE_DIGEST_TRIGGER=true (docker-compose).
 *
 * Run:
 *   pnpm --filter portal e2e:run -- --grep "AC-MSG-011-02"
 *   pnpm --filter portal e2e:run -- --grep client-emailed-without-optin
 *
 * ADR-003: admin pool for fixture seed/teardown (RLS-exempt; no SESSION_CONTEXT). // ADR-003
 * ADR-005: RLS policy on Notification — admin pool bypasses it for fixture. // ADR-005
 * ADR-006: CLIENT nudge → PORTAL_APP_URL/sign-in (confirmed via email body). // ADR-006
 * ADR-012: Tier-6 e2e against the full docker-compose stack. // ADR-012
 * ADR-023: SMTP → Mailhog; ENABLE_DIGEST_TRIGGER=true enables the trigger seam. // ADR-023
 * ADR-025: dispatch uses EmailProvider port; content by composeDigestNudge. // ADR-025
 * REQ-MSG-011: client default-on nudge preference (no opt-in step). // REQ-MSG-011
 * REQ-MSG-008: content-free nudge contract. // REQ-MSG-008
 * CS-TS-003: Mailhog fixture mirrored from apps/admin/e2e/fixtures/mailhog.ts. // CS-TS-003
 * CS-GEN-001: no PII in test data beyond necessary fixture identifiers. // CS-GEN-001
 * CS-GEN-002: additive test. // CS-GEN-002
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

const ADMIN_PORT = process.env["ADMIN_PORT"] ?? "3001";
const ADMIN_URL = process.env["ADMIN_BASE_URL"] ?? `http://localhost:${ADMIN_PORT}`;

// ─── Fixture identifiers ───────────────────────────────────────────────────────
// Unique suffix "-018-005-002" avoids collision with all other suites.
// CS-GEN-001: no real PII used — all values are fake/synthetic fixture data. // CS-GEN-001

const FIXTURE_CLIENT_CLERK_ID = "user_client_nudge_e2e_018_005_002";
const FIXTURE_CLIENT_EMAIL = "nudge-e2e-018-005-002@example.com";

// ─── Sensitive strings seeded into Notification fields ────────────────────────
//
// These are seeded into the Notification title and body to enable the content-free
// re-assertion (REQ-MSG-008). Even in the AC-MSG-011-02 ("default-on") test, the
// delivered email must still be content-free — it proves both properties together:
//   (a) a default-on client receives a nudge (AC-MSG-011-02)
//   (b) the nudge is content-free on the real SMTP path (REQ-MSG-008)
//
// Unique suffixes avoid false positives from generic words.
// // REQ-MSG-008 // AC-MSG-008-01 // AC-MSG-008-02

const SENSITIVE_STATUS_DETAIL = "SensitiveEngStatusChange_018005B";
const SENSITIVE_TAX_YEAR = "SensitiveTaxYear_2024_DEF789";

const SENSITIVE_STRINGS_B = [
  SENSITIVE_STATUS_DETAIL,
  SENSITIVE_TAX_YEAR,
] as const;

// ─── DB helpers (admin pool — RLS-exempt fixture setup/teardown) ──────────────
//
// CS-TS-003: parseSqlServerUrl duplicated per established spec convention. // CS-TS-003

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
      "[client-emailed-without-optin.spec] DATABASE_URL_ADMIN is not set " +
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

// ─── Fixture state ─────────────────────────────────────────────────────────────

interface DefaultOnFixture {
  userId: string;
  engagementId: string;
}

/**
 * Seeds a CLIENT User WITHOUT setting emailNudgeEnabled (proves DB default-on behavior).
 *
 * The key property being proven: the INSERT omits emailNudgeEnabled entirely.
 * The DB DEFAULT 1 (from the brief-018 migration) makes the user nudge-eligible
 * without any opt-in step — this is AC-MSG-011-02 + REQ-MSG-011.
 *
 * We also seed an engagement + unread notification (engagement_status_changed — from
 * the existing EPIC-016 feed) to make the user eligible for a nudge.
 *
 * ADR-003: admin pool for seed — no SESSION_CONTEXT needed. // ADR-003
 * ADR-005: admin pool bypasses RLS for fixture operations. // ADR-005
 * REQ-MSG-011: client emailNudgeEnabled defaults to true — proven by omitting it from INSERT.
 * AC-MSG-011-02: no opt-in step performed. // AC-MSG-011-02 // REQ-MSG-011
 */
async function seedDefaultOnFixture(): Promise<DefaultOnFixture> {
  const pool = await getPool();
  await cleanupFixture(pool).catch(() => { /* ignore on first run */ });

  // 1. Insert CLIENT User — intentionally omitting emailNudgeEnabled.
  //    DB DEFAULT 1 applies: user is nudge-enabled by default (no opt-in required).
  //    This is the core proof point for AC-MSG-011-02 / REQ-MSG-011.
  //    // AC-MSG-011-02 // REQ-MSG-011
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
    const lookup = await pool
      .request()
      .input("clerkId", FIXTURE_CLIENT_CLERK_ID)
      .query<{ id: string }>(`SELECT [id] FROM [dbo].[User] WHERE [clerkId] = @clerkId`);
    userId = lookup.recordset[0]?.id;
    if (!userId) {
      throw new Error("[client-emailed-without-optin.spec] Failed to upsert User fixture");
    }
  }

  // Verify the DB DEFAULT was applied (belt-and-suspenders assertion).
  // AC-MSG-011-02: emailNudgeEnabled must be true without any opt-in step. // AC-MSG-011-02
  const prefRow = await pool
    .request()
    .input("clerkId", FIXTURE_CLIENT_CLERK_ID)
    .query<{ emailNudgeEnabled: boolean }>(
      `SELECT [emailNudgeEnabled] FROM [dbo].[User] WHERE [clerkId] = @clerkId`,
    );
  const nudgeEnabled = prefRow.recordset[0]?.emailNudgeEnabled;
  if (nudgeEnabled !== true) {
    throw new Error(
      `[client-emailed-without-optin.spec] [AC-MSG-011-02] DB DEFAULT 1 check failed: ` +
        `emailNudgeEnabled=${nudgeEnabled} (expected true — no opt-in step performed)`,
    );
  }

  // 2. Seed EngagementRequest.
  const reqResult = await pool
    .request()
    .input("email", FIXTURE_CLIENT_EMAIL)
    .query<{ id: string }>(
      `INSERT INTO [dbo].[EngagementRequest]
         ([firstName], [lastName], [email], [phone], [message], [status], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES (N'DefaultOn', N'E2E018005B', @email, NULL, NULL, N'accepted', SYSDATETIMEOFFSET())`,
    );
  const requestId = reqResult.recordset[0]?.id;
  if (!requestId) {
    throw new Error("[client-emailed-without-optin.spec] Failed to seed EngagementRequest");
  }

  // 3. Seed Engagement.
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
    throw new Error("[client-emailed-without-optin.spec] Failed to seed Engagement");
  }

  // 4. Seed an unread Notification (engagement_status_changed — existing EPIC-016 feed type).
  //    The notification body includes sensitive strings to enable the content-free re-assertion.
  //    readAt = NULL → unread → eligible for digest nudge.
  //    // AC-MSG-008-01 // REQ-MSG-008 // EPIC-016
  await pool
    .request()
    .input("recipientUserId", userId)
    .input("engagementId", engagementId)
    .input(
      "sensitiveTitle",
      `Your engagement status has been updated to In Progress: ${SENSITIVE_STATUS_DETAIL}`,
    )
    .input(
      "sensitiveBody",
      `Your engagement is now In Progress. Tax year: ${SENSITIVE_TAX_YEAR}. Please sign in to review.`,
    )
    .query(
      `INSERT INTO [dbo].[Notification]
         ([type], [title], [body], [recipientType], [recipientUserId],
          [linkedItemType], [linkedItemId], [readAt])
       VALUES (
         N'engagement_status_changed',
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
 */
async function cleanupFixture(pool: mssqlPkg.ConnectionPool): Promise<void> {
  await pool
    .request()
    .input("clerkId", FIXTURE_CLIENT_CLERK_ID)
    .query(
      `DELETE n FROM [dbo].[Notification] n
       INNER JOIN [dbo].[User] u ON n.[recipientUserId] = u.[id]
       WHERE u.[clerkId] = @clerkId`,
    )
    .catch(() => { });

  await pool
    .request()
    .input("clerkId", FIXTURE_CLIENT_CLERK_ID)
    .query(
      `DELETE e FROM [dbo].[Engagement] e
       INNER JOIN [dbo].[User] u ON e.[clientUserId] = u.[id]
       WHERE u.[clerkId] = @clerkId`,
    )
    .catch(() => { });

  await pool
    .request()
    .input("email", FIXTURE_CLIENT_EMAIL)
    .query(`DELETE FROM [dbo].[EngagementRequest] WHERE [email] = @email`)
    .catch(() => { });

  await pool
    .request()
    .input("clerkId", FIXTURE_CLIENT_CLERK_ID)
    .query(`DELETE FROM [dbo].[User] WHERE [clerkId] = @clerkId`)
    .catch(() => { });
}

// ─── Dispatch trigger helper ───────────────────────────────────────────────────

/**
 * Trigger the daily digest dispatch via the dev/test seam.
 *
 * See email-nudge-signin.spec.ts for full documentation on the ACCOUNTANT session
 * workaround (DECISION-018-003-C / DECISION TASK-018-005).
 *
 * // DECISION-018-003-C // DECISION (TASK-018-005)
 * // ADR-023 // ADR-025 // CS-GEN-001
 */
async function triggerDispatch(adminUrl: string): Promise<{ sentCount: number }> {
  const sessionResp = await fetch(`${adminUrl}/api/mock-session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      clerkUserId: "dispatch_trigger_e2e_session_018_005b",
      role: "ACCOUNTANT",
    }),
  });

  if (!sessionResp.ok) {
    throw new Error(
      `[triggerDispatch] POST ${adminUrl}/api/mock-session returned ${sessionResp.status}. ` +
        `Is AUTH_PROVIDER=mock and ALLOW_MOCK_AUTH=true set in the admin container?`,
    );
  }

  const setCookieHeader = sessionResp.headers.get("set-cookie");
  if (!setCookieHeader) {
    throw new Error("[triggerDispatch] /api/mock-session did not return Set-Cookie header");
  }

  const cookieValue = setCookieHeader.split(";")[0] ?? "";

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
        `(docker-compose default: true — restart the admin container if recently changed)`,
    );
  }

  return dispatchResp.json() as Promise<{ sentCount: number }>;
}

// ─── Suite setup / teardown ───────────────────────────────────────────────────

let fixture: DefaultOnFixture;

test.beforeAll(async () => {
  fixture = await seedDefaultOnFixture();
});

test.afterAll(async () => {
  const pool = await getPool();
  await cleanupFixture(pool);
  await closePool();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

/**
 * [AC-MSG-011-02] Newly created client receives a nudge by default (no opt-in step).
 *
 * Given a newly created CLIENT user (no emailNudgeEnabled set — DB DEFAULT 1),
 * And a notification-worthy event has occurred (unread Notification in the feed),
 * When the daily digest dispatch runs,
 * Then the client receives a nudge email in Mailhog without having performed any
 * opt-in step — proving the default-on behavior required by REQ-MSG-011.
 *
 * Also re-asserts the content-free property (REQ-MSG-008) for this real SMTP path:
 * the notification detail seeded into Notification.title and Notification.body must
 * NOT appear in the delivered email.
 *
 * // AC-MSG-011-02 // REQ-MSG-011 // REQ-MSG-008 // ADR-012 // ADR-023 // ADR-025
 */
test(
  "AC-MSG-011-02 — newly created client with default settings (no opt-in) receives a nudge email; delivered mail is content-free",
  async () => {
    // Suppress unused variable warning — fixture is used implicitly to ensure
    // the user is seeded before the test; we only need userId for potential cleanup.
    void fixture;

    // ── Step 1: Clear Mailhog (determinism) ────────────────────────────────────
    await clearMailhog();

    // ── Step 2: Trigger the daily digest ───────────────────────────────────────
    // AC-MSG-011-02: the fixture user is eligible because:
    //   (a) emailNudgeEnabled = 1 (DB default — no opt-in step performed)
    //   (b) lastNudgeSentAt IS NULL (never nudged — newly created)
    //   (c) readAt IS NULL on the seeded Notification (unread)
    // // AC-MSG-011-02 // REQ-MSG-011 // ADR-023 // ADR-025
    const result = await triggerDispatch(ADMIN_URL);

    expect(
      result.sentCount,
      "[AC-MSG-011-02] dispatch must have sent at least one nudge (sentCount ≥ 1)",
    ).toBeGreaterThanOrEqual(1);

    // ── Step 3: Wait for the nudge to arrive in Mailhog ────────────────────────
    // The fixture user's email was NOT configured with any opt-in preference.
    // If the email arrives, it proves the default-on behavior.
    // // AC-MSG-011-02 // ADR-023
    const msg = await waitForEmail({ to: FIXTURE_CLIENT_EMAIL, timeoutMs: 15_000 });

    const subject = getSubject(msg);
    const body = getBody(msg);

    // ── Step 4: Assert the nudge arrived (default-on proof) ────────────────────
    // The email arrived → emailNudgeEnabled was true by default (no opt-in required).
    // AC-MSG-011-02: no opt-in step was performed; the nudge arrives by default.
    // // AC-MSG-011-02 // REQ-MSG-011
    expect(
      subject.length,
      "[AC-MSG-011-02] Email must have arrived with a non-empty subject (default-on proof)",
    ).toBeGreaterThan(0);

    expect(
      body.length,
      "[AC-MSG-011-02] Email must have arrived with a non-empty body (default-on proof)",
    ).toBeGreaterThan(0);

    // ── Step 5: Re-assert content-free on the real SMTP path ───────────────────
    // REQ-MSG-008: the nudge is content-free — proved here on the real SMTP→Mailhog path.
    // Sensitive strings from the Notification title/body must NOT appear in the email.
    // // REQ-MSG-008 // AC-MSG-008-01 // AC-MSG-008-02 // ADR-025 §3 // ADR-017

    expect(
      subject.toLowerCase(),
      "[REQ-MSG-008] Subject must convey generic new-activity statement",
    ).toContain("new activity");

    expect(
      body.toLowerCase(),
      "[REQ-MSG-008] Body must convey generic new-activity statement",
    ).toContain("new activity");

    for (const sensitive of SENSITIVE_STRINGS_B) {
      expect(
        subject,
        `[REQ-MSG-008] Subject must NOT leak sensitive string: "${sensitive}"`,
      ).not.toContain(sensitive);

      expect(
        body,
        `[REQ-MSG-008] Body must NOT leak sensitive string: "${sensitive}"`,
      ).not.toContain(sensitive);
    }

    // The body must contain a sign-in URL (portal surface per ADR-006).
    // // ADR-006 // AC-MSG-008-03
    expect(
      body,
      "[ADR-006] Body must contain the portal sign-in URL (CLIENT → PORTAL_APP_URL/sign-in)",
    ).toContain("/sign-in");

    // Log for Work Log evidence.
    // CS-GEN-001: log structural evidence only; no PII from email content. // CS-GEN-001
    console.log(
      `[AC-MSG-011-02] ✓ Default-on nudge delivered to ${FIXTURE_CLIENT_EMAIL} via Mailhog ` +
        `(no opt-in step performed). sentCount=${result.sentCount}. ` +
        `Subject="${subject}". Content-free: all ${SENSITIVE_STRINGS_B.length} ` +
        `sensitive strings absent from subject+body.`,
    );
  },
);
