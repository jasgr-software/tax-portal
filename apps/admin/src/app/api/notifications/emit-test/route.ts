/**
 * apps/admin/src/app/api/notifications/emit-test/route.ts
 *
 * TEST-ONLY endpoint: trigger a real-time notification emission directly via the mock transport.
 * ACCOUNTANT surface equivalent of apps/portal/src/app/api/notifications/emit-test/route.ts.
 *
 * ONLY ACTIVE when ALLOW_MOCK_REALTIME=true (e2e/local dev only).
 * Returns 404 in production (ALLOW_MOCK_REALTIME unset → the mock-realtime guard is off).
 *
 * Purpose: e2e tests call this endpoint to trigger `transport.publish()` in the server process,
 * which fans out to the SSE route's subscriber — driving the push-without-navigation test
 * (AC-MSG-012-03) for the ACCOUNTANT surface.
 *
 * Channel: "accountant:notifications" (derived from ACCOUNTANT role guard — no client input).
 * Request body: { event: { type: string, payload: Record<string, unknown> } }
 * Response: 200 + { ok: true } if the event was published.
 *           401 if the caller is not authenticated as an ACCOUNTANT.
 *           404 if ALLOW_MOCK_REALTIME is not active.
 *           400 if the body is invalid.
 *
 * SECURITY: channel is derived from the server-verified session ONLY — ACCOUNTANT role guard.
 *   The caller CANNOT supply a channel in the request body. // DECISION-016-006-SSE // ADR-023
 *
 * CS-GEN-001: The endpoint does NOT log the channel or event payload. // CS-GEN-001
 * CS-TS-004: Identity resolved from cookie before any operation. // CS-TS-004
 * ADR-023 §4: Fail-closed posture — only reachable under mock opt-in. // ADR-023
 * ADR-010: ACCOUNTANT-only endpoint. // ADR-010
 * CS-GEN-003: Governing keys cited. // CS-GEN-003
 */

import { NextResponse, type NextRequest } from "next/server";
import { getNotificationTransport } from "@tax-portal/realtime";
// F5: identity helper extracted to shared _lib to eliminate verbatim duplication
// between stream/route.ts and emit-test/route.ts. // CS-TS-004 // ADR-010
import { resolveAccountantIdentity } from "../_lib/notification-identity.js";

// ─── Constants ────────────────────────────────────────────────────────────────

/** The shared ACCOUNTANT notifications channel. */
const ACCOUNTANT_NOTIFICATIONS_CHANNEL = "accountant:notifications";

// ─── Guards ───────────────────────────────────────────────────────────────────

/**
 * Only active when ALLOW_MOCK_REALTIME=true AND NODE_ENV !== 'production'.
 *
 * Belt-and-suspenders guard (F6 fix): the ALLOW_MOCK_REALTIME env var is the primary gate,
 * but a misconfigured deployment with that var set in production would still be blocked by
 * the NODE_ENV check. Both conditions must hold: explicit mock opt-in AND non-production env.
 *
 * ADR-023 §4: fail-closed — only the explicit opt-in activates this endpoint. // ADR-023
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

  // CS-TS-004: resolve ACCOUNTANT identity from cookie before any operation.
  const identity = await resolveAccountantIdentity();
  if (!identity) {
    // ADR-010: ACCOUNTANT-only endpoint. // ADR-010
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // DECISION-016-006-SSE: channel is "accountant:notifications" — derived from role guard.
  // The caller cannot supply a channel in the body.
  // CS-GEN-001: channel is NOT logged. // CS-GEN-001
  const channel = ACCOUNTANT_NOTIFICATIONS_CHANNEL;

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
  // CS-GEN-001: do NOT log the channel or event payload. // CS-GEN-001
  const transport = getNotificationTransport();
  await transport.publish(channel, {
    type: event.type,
    payload: event.payload ?? {},
  });

  return NextResponse.json({ ok: true });
}
