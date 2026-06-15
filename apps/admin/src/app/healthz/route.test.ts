/**
 * apps/admin/src/app/healthz/route.test.ts — Unit smoke for /healthz route
 *
 * Scaffold task: proves `pnpm --filter admin test` runs and the health route
 * returns the expected shape. This is the unit-level "e2e-infra-is-real" companion
 * to the Playwright smoke spec in e2e/specs/scaffold.smoke.spec.ts.
 *
 * No DB, no Next.js server — pure unit test using jsdom environment.
 */

import { describe, it, expect } from "vitest";
import { GET } from "./route";

describe("/healthz route (admin)", () => {
  it("returns HTTP 200 with status ok and app=admin", async () => {
    // NextResponse.json() is synchronous — GET() returns a NextResponse directly, not a Promise.
    // However it satisfies the Response interface, so .json() is async.
    const response = GET();
    expect(response.status).toBe(200);

    const body = (await response.json()) as { status: string; app: string; ts: string };
    expect(body.status).toBe("ok");
    expect(body.app).toBe("admin");
    expect(typeof body.ts).toBe("string");
    // Timestamp should be a valid ISO 8601 string
    expect(() => new Date(body.ts).toISOString()).not.toThrow();
  });
});
