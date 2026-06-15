/**
 * apps/admin/src/app/readyz/route.ts — Readiness check endpoint for Tax Portal (admin)
 *
 * ADR-007: Per-app readiness endpoint probed by scripts/smoke-test.sh.
 * For this phase, readyz is equivalent to healthz (shallow check).
 * A deep readyz that pings the DB is deferred until the full stack smoke is needed.
 *
 * ADR-010: /readyz (like /healthz) must be accessible without auth for infrastructure probes.
 * The Clerk middleware (TASK-004-002) must explicitly allow this path to pass through.
 */

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    { status: "ready", app: "admin", ts: new Date().toISOString() },
    { status: 200 },
  );
}
