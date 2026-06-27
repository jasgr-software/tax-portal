/**
 * apps/admin/src/app/api/dev/run-reminders/route.ts
 *
 * DEV / TEST-ONLY trigger for runReminderEngine.
 *
 * // DECISION-019-I: Trigger-seam choice — admin API route.
 *   Mirrors api/dev/dispatch-digest/route.ts (TASK-018-003 / DECISION-018-003-C):
 *     (a) The running container stack already exposes the admin HTTP server.
 *     (b) E2E tests (TASK-019-005) drive the full stack via HTTP — a route trigger
 *         is a natural fit (just a fetch() from the test fixture).
 *     (c) A scripts/ alternative would require docker exec in e2e, adding a Docker
 *         dependency not present in the Playwright test runner.
 *   The route is guarded by ENABLE_REMINDER_TRIGGER=true; any other value (including
 *   the production default of unset/absent) returns 404.
 *   // DECISION-019-I
 *
 * PRODUCTION SAFETY (defense-in-depth — three layers):
 *   Layer 1 (fail-closed env flag):
 *     Returns 404 unless ENABLE_REMINDER_TRIGGER=true. The flag is unset in production
 *     by default, so any request reaches a 404 before any engine logic runs.
 *     That env var MUST NOT be set in production deployments.
 *   Layer 2 (admin auth via middleware):
 *     adminRedirectDecision() in packages/auth/src/redirect.ts enforces authentication
 *     on ALL /api/** admin routes — including this one. It does NOT exempt
 *     /api/dev/run-reminders. An unauthenticated request is redirected to /sign-in
 *     before the handler runs; a CLIENT-role session is redirected to the portal.
 *     Only a valid ACCOUNTANT session reaches the 404 or engine logic.
 *   Layer 3 (in-handler identity check):
 *     Even with middleware active, this handler re-verifies the ACCOUNTANT identity
 *     from the cookie, matching the sibling dispatch-digest pattern (CS-TS-004). This
 *     prevents any middleware-bypass scenario from reaching engine logic.
 *
 * URL: POST /api/dev/run-reminders
 *   Optional body: { "now": "<ISO-8601>" } — overrides the engine clock for testing
 *     (accepted only when NODE_ENV==='test' or NODE_ENV==='development').
 *   Returns: { "overdueRequestsFound": N, "remindersRaised": N,
 *              "approachingDueEngagementsFound": N, "approachingDueNotificationsSent": N }
 *   Returns: 404 when ENABLE_REMINDER_TRIGGER is not "true".
 *   Returns: 401 when caller is not an authenticated ACCOUNTANT.
 *   Returns: 500 on engine error (body: { "error": "Engine run failed" }).
 *
 * // ADR-023: production scheduling deferred; dev/test seam only.       // ADR-023
 * // CS-GEN-001: no client identity in the response beyond counts.       // CS-GEN-001
 * // CS-TS-004: ACCOUNTANT identity from cookie before engine logic.     // CS-TS-004
 * // CS-GEN-003: governing keys cited.                                   // CS-GEN-003
 * // DECISION-019-J: no email path in this route — engine emits feed notifications only. // DECISION-019-J
 */

import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getAuthProvider } from "@tax-portal/auth";
import { runReminderEngine } from "@tax-portal/db";

// DECISION-019-I: guard by env flag — production MUST NOT set this to "true".
// Mirrors ENABLE_DIGEST_TRIGGER guard in api/dev/dispatch-digest/route.ts. // DECISION-019-I
const ENABLED = process.env["ENABLE_REMINDER_TRIGGER"] === "true";

export async function POST(request: Request): Promise<NextResponse> {
  // Guard: 404 unless explicitly enabled (production-safety). // DECISION-019-I
  if (!ENABLED) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Layer 3 (CS-TS-004): re-verify ACCOUNTANT identity from cookie, matching the
  // sibling dispatch-digest route pattern. Don't trust middleware alone.
  // CS-TS-004 step 1-3: cookie header → synthetic Request → provider.getIdentity().
  // // CS-TS-004 // ADR-006
  const headerStore = await headers();
  const cookieHeader = headerStore.get("cookie") ?? "";
  const syntheticRequest = new Request("http://localhost/", {
    headers: { cookie: cookieHeader },
  });
  const provider = getAuthProvider();
  const identity = await provider.getIdentity(syntheticRequest);

  if (!identity || identity.role !== "ACCOUNTANT") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Optional: parse "now" from the request body to override the engine clock.
  // Accepted only in test/development environments to prevent poisoning
  // lastReminderSentAt / lastApproachingDueNotifiedAt in any non-test deployment
  // that happens to have the ENABLE_REMINDER_TRIGGER flag set. // ADR-023
  let now: Date | undefined;
  const isTestOrDev =
    process.env["NODE_ENV"] === "test" ||
    process.env["NODE_ENV"] === "development";

  const body = (await request.json().catch(() => ({}))) as { now?: string };
  if (isTestOrDev && body.now) {
    const parsed = new Date(body.now);
    if (!isNaN(parsed.getTime())) {
      now = parsed;
    }
  }

  try {
    // ADR-023: runReminderEngine uses the injected clock when provided. // ADR-023
    // CS-GEN-001: result carries only counts — no client identity or PII. // CS-GEN-001
    // DECISION-019-J: no email path — engine emits feed notifications only. // DECISION-019-J
    // Pass now only when defined (exactOptionalPropertyTypes: true compliance).
    const result = await runReminderEngine(now !== undefined ? { now } : undefined);
    return NextResponse.json({
      overdueRequestsFound: result.overdueRequestsFound,
      remindersRaised: result.remindersRaised,
      approachingDueEngagementsFound: result.approachingDueEngagementsFound,
      approachingDueNotificationsSent: result.approachingDueNotificationsSent,
    });
  } catch (err) {
    // CS-GEN-001: return a generic message — no client identity or infra detail
    // in the HTTP body. Log category-only server-side. // CS-GEN-001
    console.error(
      "[run-reminders] engine run failed",
      (err as Error | null)?.constructor?.name ?? "unknown",
    );
    return NextResponse.json({ error: "Engine run failed" }, { status: 500 });
  }
}
