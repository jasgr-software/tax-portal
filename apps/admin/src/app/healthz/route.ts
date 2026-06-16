/**
 * apps/admin/src/app/healthz/route.ts — Health check endpoint for Tax Portal (admin)
 *
 * ADR-007: Per-app health endpoint for smoke harness (scripts/smoke-test.sh).
 * Returns HTTP 200 with a JSON body so the smoke harness can probe this app.
 *
 * This is a shallow health check — it does NOT probe the database.
 * A deep health check (DB ping) is deferred to /readyz if needed.
 *
 * ADR-010: /healthz is the one infrastructure endpoint that must be reachable without auth
 * (Docker HEALTHCHECK calls it from inside the container; no user session available).
 * The Clerk middleware (TASK-004-002) must explicitly allow this path to pass through.
 */

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    { status: "ok", app: "admin", ts: new Date().toISOString() },
    { status: 200 },
  );
}
