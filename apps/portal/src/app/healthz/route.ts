/**
 * apps/portal/src/app/healthz/route.ts — Health check endpoint
 *
 * ADR-007: Per-app health endpoint for smoke harness (scripts/smoke-test.sh).
 * Returns HTTP 200 with a JSON body so the smoke harness can probe this app.
 *
 * This is a shallow health check — it does NOT probe the database.
 * A deep health check (DB ping) is deferred to a separate /readyz endpoint
 * if needed by EPIC-002 (TASK-002 smoke-test references /readyz as advisory).
 */

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    { status: "ok", app: "portal", ts: new Date().toISOString() },
    { status: 200 },
  );
}
