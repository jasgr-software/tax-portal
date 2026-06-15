/**
 * apps/portal/src/app/readyz/route.ts — Readiness check endpoint
 *
 * ADR-007: Per-app readiness endpoint probed by scripts/smoke-test.sh.
 * For this phase, readyz is equivalent to healthz (shallow check).
 * A deep readyz that pings the DB is deferred until the full stack smoke is needed.
 */

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    { status: "ready", app: "portal", ts: new Date().toISOString() },
    { status: 200 },
  );
}
