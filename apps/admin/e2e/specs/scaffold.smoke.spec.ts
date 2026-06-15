/**
 * apps/admin/e2e/specs/scaffold.smoke.spec.ts — Scaffold smoke spec for Tax Portal (admin)
 *
 * @smoke tagged — proves the apps/admin e2e infrastructure is real and the container
 * serves responses. Runs against the docker-compose stack (admin container, port 3001).
 *
 * ADR-006: apps/admin runs on port 3001; e2e runs against docker-compose stack.
 * ADR-010: apps/admin has no public routes — the smoke probes /healthz and /readyz
 *          (infrastructure endpoints, explicitly excluded from auth middleware in TASK-004-002).
 *
 * This spec is the "e2e-infra-is-real proof" required by CLAUDE.md for scaffold tasks.
 * It does NOT test authenticated accountant flows — those land in TASK-004-002/-003.
 *
 * Execution evidence goes in the TASK-004-001 Work Log.
 */

import { test, expect } from "../fixtures/base";

// ─── /healthz — shallow health probe ────────────────────────────────────────────

test("@smoke admin /healthz returns 200 with status ok", async ({ request }) => {
  // Given the admin container is running on port 3001 (docker-compose stack)
  // When we probe the health endpoint
  const response = await request.get("/healthz");

  // Then the response is HTTP 200
  expect(response.status()).toBe(200);

  // And the JSON body has status "ok" and app "admin"
  const body = await response.json() as { status: string; app: string; ts: string };
  expect(body.status).toBe("ok");
  expect(body.app).toBe("admin");
  expect(typeof body.ts).toBe("string");
});

// ─── /readyz — readiness probe ──────────────────────────────────────────────────

test("@smoke admin /readyz returns 200 with status ready", async ({ request }) => {
  // Given the admin container is running on port 3001 (docker-compose stack)
  // When we probe the readiness endpoint
  const response = await request.get("/readyz");

  // Then the response is HTTP 200
  expect(response.status()).toBe(200);

  // And the JSON body has status "ready" and app "admin"
  const body = await response.json() as { status: string; app: string; ts: string };
  expect(body.status).toBe("ready");
  expect(body.app).toBe("admin");
  expect(typeof body.ts).toBe("string");
});

// ─── root page — auth middleware active ────────────────────────────────────────
//
// TASK-004-002: Admin middleware now redirects unauthenticated visitors from the
// root (/) to /sign-in. This test verifies that the middleware fires BEFORE any
// admin content renders (ADR-010 "apps/admin has NO public routes").
// The auth-stub placeholder test from TASK-004-001 is replaced by this redirect probe.

test("@smoke admin root unauthenticated request redirects to sign-in", async ({ page }) => {
  // Given the admin container is running and no session exists
  // When we navigate to the root without auth
  let redirectSeen = false;
  page.on("response", (response) => {
    if (response.status() === 307 || response.status() === 308) {
      redirectSeen = true;
    }
  });

  await page.goto("/", { waitUntil: "commit" });

  const finalUrl = new URL(page.url());

  // Then the middleware should have redirected to /sign-in
  // (ADR-010: admin has NO public routes; unauthenticated → /sign-in)
  expect(redirectSeen || finalUrl.pathname.includes("/sign-in")).toBe(true);
});
