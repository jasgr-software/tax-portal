/**
 * apps/admin/src/app/api/dev/dispatch-digest/route.ts
 *
 * DEV / TEST-ONLY trigger for dispatchDailyDigest.
 *
 * // DECISION-018-003-C: Trigger-seam choice — admin API route.
 *   We chose a guarded `apps/admin` route over a `scripts/run-digest.ts` because:
 *     (a) The running container stack already exposes the admin HTTP server.
 *     (b) The e2e tests (TASK-018-004/-005) drive the full stack via HTTP — a route
 *         trigger is a natural fit (just a `fetch()` from the test fixture).
 *     (c) A scripts/ alternative would require `docker exec` in e2e, adding
 *         a Docker dependency not present in the Playwright test runner.
 *   The route is guarded by ENABLE_DIGEST_TRIGGER=true; any other value (including
 *   the production default of unset/absent) returns 404.
 *   // DECISION-018-003-C
 *
 * PRODUCTION SAFETY (defense-in-depth — two layers):
 *   Layer 1 (fail-closed env flag):
 *     Returns 404 unless ENABLE_DIGEST_TRIGGER=true. The flag is unset in production
 *     by default, so any request reaches a 404 before any dispatch logic runs.
 *     That env var MUST NOT be set in production deployments.
 *   Layer 2 (admin auth via middleware):
 *     adminRedirectDecision() in packages/auth/src/redirect.ts enforces authentication
 *     on ALL /api/** admin routes — including this one. It does NOT exempt
 *     /api/dev/dispatch-digest. An unauthenticated request is redirected to /sign-in
 *     before the handler runs; a CLIENT-role session is redirected to the portal.
 *     Only a valid ACCOUNTANT session reaches the 404 or dispatch logic.
 *     The e2e tests that drive this route inject a mock ACCOUNTANT session for this reason.
 *   Together these layers provide defense-in-depth: the env flag fails closed at the
 *   application layer, and admin auth fails closed at the middleware layer.
 *   - ADR-023: production scheduling is deferred; this route is the dev stand-in only.
 *
 * URL: POST /api/dev/dispatch-digest
 *   Optional body: { "now": "<ISO-8601>" } — overrides the dispatch clock for testing.
 *   Returns: { "sentCount": <number> } on success.
 *   Returns: 404 when ENABLE_DIGEST_TRIGGER is not "true".
 *   Returns: 500 on dispatch error (body: { "error": "<message>" }).
 *
 * // ADR-023: production scheduling deferred; dev/test seam only.       // ADR-023
 * // ADR-025: dispatch internally calls getEmailProvider() — no ESP SDK here. // ADR-025
 * // CS-GEN-001: no recipient identity in the response beyond sentCount. // CS-GEN-001
 * // CS-GEN-003: governing keys cited.                                   // CS-GEN-003
 */

import { NextResponse } from "next/server";
import { dispatchDailyDigest } from "@tax-portal/db";

// DECISION-018-003-C: guard by env flag — production MUST NOT set this to "true".
// // DECISION-018-003-C
const ENABLED = process.env["ENABLE_DIGEST_TRIGGER"] === "true";

export async function POST(request: Request): Promise<NextResponse> {
  // Guard: 404 unless explicitly enabled (production-safety). // DECISION-018-003-C
  if (!ENABLED) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let now: Date | undefined;

  try {
    // Optional: parse "now" from the request body to override the dispatch clock.
    // This lets e2e tests simulate different calendar days without waiting.
    const body = (await request.json().catch(() => ({}))) as { now?: string };
    if (body.now) {
      const parsed = new Date(body.now);
      if (!isNaN(parsed.getTime())) {
        now = parsed;
      }
    }
  } catch {
    // Ignore body parse errors — proceed with the real clock.
  }

  try {
    // ADR-025: dispatchDailyDigest calls getEmailProvider() internally — no ESP SDK here.
    // CS-GEN-001: sentCount only in the response — no recipient identity.
    // // ADR-025 // CS-GEN-001
    // Pass now only when defined (exactOptionalPropertyTypes: true compliance).
    const result = await dispatchDailyDigest(now !== undefined ? { now } : undefined);
    return NextResponse.json({ sentCount: result.sentCount });
  } catch (err) {
    // CS-GEN-001: do NOT include any recipient identity or email body in the error response.
    // // CS-GEN-001 // ADR-025 §4
    const message =
      err instanceof Error ? err.message : "Dispatch failed (unknown error)";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
