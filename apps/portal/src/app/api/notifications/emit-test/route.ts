/**
 * apps/portal/src/app/api/notifications/emit-test/route.ts
 *
 * TEST-ONLY endpoint: trigger a real-time notification emission directly via the mock transport.
 *
 * ONLY ACTIVE when ALLOW_MOCK_REALTIME=true (e2e/local dev only).
 * Returns 404 in production (ALLOW_MOCK_REALTIME unset → the mock-realtime guard is off).
 *
 * Purpose: e2e tests call this endpoint to trigger `transport.publish()` in the server process,
 * which fans out to the SSE route's subscriber — driving the push-without-navigation test
 * (AC-MSG-012-03). This endpoint allows the test to drive the server-side publish without
 * needing emitAndPublishNotification (which would also do a DB INSERT — this avoids the
 * schema dependency in the push regression test).
 *
 * DECISION-016-005b-RT (TASK-016-005b / ADR-023):
 *   This endpoint is the e2e equivalent of the server-side publish path. In production,
 *   the push would come from emitAndPublishNotification() (packages/db). In the e2e test,
 *   this endpoint drives the transport.publish() directly on the mock binding to prove the
 *   SSE bridge delivers the event to the browser. // DECISION-016-005b-RT // ADR-023
 *
 * SECURITY — channel derivation from session (BUG-016-002 fix):
 *   The recipient channel is derived from the server-verified session identity ONLY.
 *   The caller CANNOT supply a channel in the request body — doing so would allow
 *   cross-user injection (emitting to another user's channel). // CS-GEN-003
 *   The channel is "user:<User.id>" (DB UUID), resolved from the authenticated session
 *   via the same resolveClientIdentity() + lookupUserDbId() path used by the stream route.
 *   If the session is unauthenticated / non-CLIENT / user-not-found → 401/404 (no publish).
 *
 * Request body: { event: { type: string, payload: Record<string, unknown> } }
 *   (No "channel" field — channel is derived server-side from the authenticated session.)
 * Response: 200 + { ok: true } if the event was published.
 *           401 if the caller is not authenticated as a CLIENT.
 *           404 if ALLOW_MOCK_REALTIME is not active, or user not found in DB.
 *           400 if the body is invalid (missing event or event.type).
 *
 * AUTH: The caller must be authenticated as a CLIENT (session cookie required).
 *   The e2e test MUST call this endpoint from within the browser page (page.evaluate fetch)
 *   or via page.request() so the session cookie is included. Do NOT use the standalone
 *   Playwright request fixture — it does not carry the browser's session cookies.
 *   (BUG-016-002 root cause: standalone request fixture → no cookie → middleware redirect.)
 *
 * CS-GEN-001: The endpoint does NOT log the channel or event payload. // CS-GEN-001
 * CS-GEN-003: Governing keys cited. // CS-GEN-003
 * CS-TS-001: DB access via getAdminPool from @tax-portal/db. // CS-TS-001
 * CS-TS-002: No raw pools imported outside packages/db. // CS-TS-002
 * CS-TS-004: Identity resolved from cookie before any operation. // CS-TS-004
 * ADR-003: SESSION_CONTEXT pattern — identity first. // ADR-003
 * ADR-023 §4: Fail-closed posture — only reachable under mock opt-in. // ADR-023
 */

import { NextResponse, type NextRequest } from "next/server";
import { getNotificationTransport } from "@tax-portal/realtime";
// F5: identity helpers extracted to shared _lib to eliminate verbatim duplication
// between stream/route.ts and emit-test/route.ts. // CS-TS-004 // CS-TS-001 // CS-TS-002
import { resolveClientIdentity, lookupUserDbId } from "../_lib/notification-identity";

/**
 * Only active when ALLOW_MOCK_REALTIME=true AND NODE_ENV !== 'production'.
 *
 * Belt-and-suspenders guard (F6 fix): the ALLOW_MOCK_REALTIME env var is the primary gate,
 * but a misconfigured deployment with that var set in production would still be blocked by
 * the NODE_ENV check. Both conditions must hold: explicit mock opt-in AND non-production env.
 *
 * ADR-023 §4: fail-closed — only the explicit opt-in activates this endpoint. // ADR-023
 * Note: NEXT_PUBLIC_ALLOW_MOCK_REALTIME is for browser bundle inlining; in server context
 * the non-prefixed var is the canonical read. Both are checked for local-dev convenience.
 */
function isMockRealtimeActive(): boolean {
  // F6: non-production guard — belt-and-suspenders on top of the ALLOW_MOCK_REALTIME flag.
  if (process.env["NODE_ENV"] === "production") {
    return false;
  }
  return (
    (process.env["ALLOW_MOCK_REALTIME"] ?? "").toLowerCase() === "true" ||
    (process.env["NEXT_PUBLIC_ALLOW_MOCK_REALTIME"] ?? "").toLowerCase() === "true"
  );
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  // ADR-023 §4: fail-closed guard — not reachable in production. // ADR-023
  if (!isMockRealtimeActive()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // CS-TS-004: resolve identity from cookie before any operation.
  // SECURITY (BUG-016-002): channel is derived from the authenticated session ONLY.
  //   The caller cannot supply a channel in the body — that was the security rejection.
  //   This mirrors the stream route's resolveClientIdentity() pattern. // CS-TS-004
  const identity = await resolveClientIdentity();
  if (!identity) {
    // Unauthenticated or non-CLIENT session — do not publish.
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // DECISION-016-005b-RT: look up the DB User.id so the publication channel matches
  // what emitAndPublishNotification() publishes to ("user:<User.id>", not "user:<clerkId>").
  // CS-GEN-001: userDbId is NOT logged. // CS-GEN-001
  const userDbId = await lookupUserDbId(identity.clerkUserId);
  if (!userDbId) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // SECURITY: channel is derived entirely server-side from the authenticated session + DB lookup.
  // The caller CANNOT control which channel is published to. // DECISION-016-005b-RT // ADR-023
  // CS-GEN-001: the channel is NOT logged. // CS-GEN-001
  const channel = `user:${userDbId}`;

  // Parse the request body — only event is accepted (no channel field).
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (
    typeof body !== "object" ||
    body === null ||
    typeof (body as Record<string, unknown>)["event"] !== "object" ||
    (body as Record<string, unknown>)["event"] === null
  ) {
    return NextResponse.json(
      { error: "Body must have event (object with type + payload)" },
      { status: 400 },
    );
  }

  const { event } = body as {
    event: { type: string; payload: Record<string, unknown> };
  };

  if (typeof event.type !== "string") {
    return NextResponse.json({ error: "event.type must be a string" }, { status: 400 });
  }

  // Publish via the in-process mock transport.
  // ADR-023: getNotificationTransport() → MockNotificationTransport (server-side, in-process).
  // The SSE route (/api/notifications/stream) has a subscriber registered on the client's channel.
  // This publish() call fans out to that subscriber, which writes the event to the SSE stream.
  // CS-GEN-001: do NOT log the channel or event payload. // CS-GEN-001
  const transport = getNotificationTransport();
  await transport.publish(channel, {
    type: event.type,
    payload: event.payload ?? {},
  });

  return NextResponse.json({ ok: true });
}
