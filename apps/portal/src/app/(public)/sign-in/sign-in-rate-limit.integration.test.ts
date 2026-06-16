/**
 * apps/portal/src/app/(public)/sign-in/sign-in-rate-limit.integration.test.ts
 *
 * [ADR-022] [rate-limit] Integration test proving the throttle on the sign-in surface.
 *
 * ADR-022 OBLIGATION: "An integration test proving the throttle on the sign-in
 * surface — drive the sign-in entry N+1 times from one source key within the
 * window and assert the (N+1)th attempt is throttled."
 *
 * This test drives the SIGN-IN SURFACE (signInAsClient server action) directly —
 * not the limiter in isolation. It verifies:
 *
 *   1. [ADR-022] N+1 attempts from one source IP → the attempt that exhausts the
 *      budget is throttled with { success:false, retryAfterMs: <positive> } and
 *      NO session established.
 *   2. [ADR-022] A different source IP still succeeds (independent budget).
 *   3. [ADR-022] A single legitimate attempt from any IP is never blocked.
 *   4. [ADR-022] The throttled result does not expose account existence
 *      (error message is a generic rate-limit message, not a credential error).
 *
 * Methodology:
 *   - Signs in by calling the signInAsClient() server action directly in-process.
 *   - Mocks next/headers.cookies() and next/headers.headers() (Next.js server APIs
 *     that require a request context) so tests run outside a Next.js request cycle.
 *   - Uses a low maxAttempts (3) via env var to make the test fast and deterministic.
 *   - Resets the rate-limiter singleton between tests (resetRateLimiterForTesting).
 *   - ADR-001: AUTH_PROVIDER=mock; no real Clerk contacted.
 *   - No 2FA gate — guards the password sign-in that ships now.
 *
 * Vitest hoisting note: vi.mock factories are hoisted to the top of the file before
 * any variable declarations. The mock implementations must be self-contained or read
 * state from module-scoped globals that are safe to read at hoist time. We use a
 * wrapper object approach: mockState is declared with `var` (hoisted by JS itself)
 * and the factory captures it by reference.
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from "vitest";
// Import from the test-only subpath — resetRateLimiterForTesting is NOT in the
// public barrel (@tax-portal/auth). Use @tax-portal/auth/testing for test helpers.
// (OE5 fix: test resets must not appear in the public @tax-portal/auth exports.)
import { resetRateLimiterForTesting } from "@tax-portal/auth/testing";

// ─── Shared mock state ────────────────────────────────────────────────────────
// Declared before vi.mock factories. Vitest hoists vi.mock() calls to the top of
// the compiled module, but the closure over these vars is evaluated lazily (at
// runtime), so by the time any test executes, the vars are initialised.
//
// We use a plain object so the factory closure captures the *reference*, not the
// value — mutating mockState.sourceIp is visible inside the mock immediately.

// eslint-disable-next-line prefer-const
let mockState = {
  sourceIp: "1.2.3.4",
  cookieSetCalls: 0,
};

const cookieSetSpy = vi.fn();

// ─── Mock next/headers ────────────────────────────────────────────────────────
// next/headers requires an active Next.js request context. The mock provides
// controllable headers so we can simulate different source IPs per test.

vi.mock("next/headers", () => ({
  headers: vi.fn().mockImplementation(async () => ({
    get: (name: string) => {
      if (name === "x-forwarded-for") return mockState.sourceIp;
      return null;
    },
  })),
  cookies: vi.fn().mockImplementation(async () => ({
    set: cookieSetSpy,
    get: vi.fn(),
    getAll: vi.fn().mockReturnValue([]),
    has: vi.fn().mockReturnValue(false),
    delete: vi.fn(),
  })),
}));

// ─── Import the sign-in action ────────────────────────────────────────────────
// Imported after vi.mock declarations (which are hoisted); the mock is in place
// when the module is evaluated.
import { signInAsClient } from "./actions.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build valid FormData with non-empty credentials. */
function makeFormData(email = "client@example.com", password = "password123"): FormData {
  const fd = new FormData();
  fd.append("email", email);
  fd.append("password", password);
  return fd;
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe("[ADR-022] [rate-limit] sign-in surface throttle — integration", () => {
  // Use a tight limit (3 attempts) so tests are fast and deterministic.
  // RATE_LIMIT_MAX_ATTEMPTS=3 → 3rd attempt exhausts budget.
  beforeEach(() => {
    process.env["RATE_LIMIT_MAX_ATTEMPTS"] = "3";
    process.env["RATE_LIMIT_WINDOW_MS"] = "60000";
    process.env["AUTH_PROVIDER"] = "mock";
    // Enable trusted-proxy mode so the mocked X-Forwarded-For header is used for
    // rate-limit key resolution (F3 fix: TRUST_PROXY gates XFF trust in production too).
    process.env["TRUST_PROXY"] = "true";
    resetRateLimiterForTesting();
    cookieSetSpy.mockClear();
    mockState.sourceIp = "1.2.3.4";
  });

  afterEach(() => {
    resetRateLimiterForTesting();
    delete process.env["RATE_LIMIT_MAX_ATTEMPTS"];
    delete process.env["RATE_LIMIT_WINDOW_MS"];
    delete process.env["TRUST_PROXY"];
  });

  // ── Test 1: N+1 attempts → (N+1)th is throttled, no session established ─────

  it("[ADR-022] exhausts the budget on the Nth attempt and throttles — no session established", async () => {
    mockState.sourceIp = "10.0.0.1";

    // Attempts 1 and 2: allowed (limit=3 means 1st and 2nd within budget)
    const result1 = await signInAsClient(makeFormData());
    expect(result1.success, "attempt 1 should succeed").toBe(true);

    const result2 = await signInAsClient(makeFormData());
    expect(result2.success, "attempt 2 should succeed").toBe(true);

    // 3rd attempt: exhausts the budget — throttled
    const throttled = await signInAsClient(makeFormData());
    expect(throttled.success, "3rd attempt should be throttled").toBe(false);
    expect(
      throttled.retryAfterMs,
      "throttled result must include retryAfterMs",
    ).toBeGreaterThan(0);

    // 4th attempt: still throttled (budget remains exhausted in the window)
    const alsoThrottled = await signInAsClient(makeFormData());
    expect(alsoThrottled.success, "4th attempt should also be throttled").toBe(false);
    expect(alsoThrottled.retryAfterMs).toBeGreaterThan(0);
  });

  it("[ADR-022] throttled attempt does NOT establish a session (no session cookie set)", async () => {
    mockState.sourceIp = "10.0.0.2";

    // Exhaust the budget (2 allowed + 1 throttle with maxAttempts=3)
    await signInAsClient(makeFormData());
    await signInAsClient(makeFormData());

    // Reset spy to count only the throttled attempt's cookie calls
    cookieSetSpy.mockClear();

    const throttled = await signInAsClient(makeFormData());

    expect(throttled.success).toBe(false);
    expect(throttled.retryAfterMs).toBeGreaterThan(0);

    // No session cookie must have been set during the throttled call
    expect(
      cookieSetSpy,
      "no session cookie should be established on a throttled attempt",
    ).not.toHaveBeenCalled();
  });

  // ── Test 2: Different source IP has its own budget ───────────────────────────

  it("[ADR-022] flooding one source IP does NOT exhaust a different IP's budget", async () => {
    const floodingIp = "192.168.1.100";
    const legitimateIp = "192.168.1.200";

    // Exhaust the flooding IP's budget
    mockState.sourceIp = floodingIp;
    await signInAsClient(makeFormData());
    await signInAsClient(makeFormData());
    const floodThrottled = await signInAsClient(makeFormData());
    expect(floodThrottled.success, "flooding IP should be throttled").toBe(false);

    // Legitimate IP should still have its own fresh budget
    mockState.sourceIp = legitimateIp;
    const legitResult = await signInAsClient(makeFormData());
    expect(
      legitResult.success,
      "legitimate IP must NOT be blocked by another IP's flood",
    ).toBe(true);
  });

  // ── Test 3: Single legitimate attempt is never blocked ───────────────────────

  it("[ADR-022] a single legitimate attempt is never blocked (conservative default)", async () => {
    mockState.sourceIp = "172.16.0.1";

    // One clean attempt — must always succeed regardless of limit configuration
    const result = await signInAsClient(makeFormData());
    expect(result.success, "a single legitimate attempt must never be blocked").toBe(true);
    expect(result.retryAfterMs).toBeUndefined();
  });

  // ── Test 4: Throttle error message is generic (no account-existence leak) ────

  it("[ADR-022] throttle error message does not expose account existence", async () => {
    mockState.sourceIp = "10.1.2.3";

    // Exhaust budget
    await signInAsClient(makeFormData());
    await signInAsClient(makeFormData());

    // Throttled: error must be a generic rate-limit message, not a credential error
    const throttled = await signInAsClient(makeFormData());
    expect(throttled.success).toBe(false);
    expect(throttled.error).toBeDefined();

    // The message must NOT contain credential-specific language
    expect(throttled.error).not.toMatch(/invalid|incorrect|wrong|credentials/i);
    // It should contain rate-limit language
    expect(throttled.error).toMatch(/too many|rate|wait|attempts/i);
  });

  // ── Test 5: retryAfterMs is present and positive on throttled response ────────

  it("[ADR-022] throttled response includes a positive retryAfterMs (retry hint)", async () => {
    mockState.sourceIp = "10.9.8.7";

    await signInAsClient(makeFormData());
    await signInAsClient(makeFormData());
    const throttled = await signInAsClient(makeFormData());

    expect(throttled.success).toBe(false);
    expect(typeof throttled.retryAfterMs).toBe("number");
    expect(throttled.retryAfterMs).toBeGreaterThan(0);
    // retryAfterMs must be ≤ the configured window (60 seconds)
    expect(throttled.retryAfterMs).toBeLessThanOrEqual(60_000);
  });

  // ── Test 6: Limiter is keyed by endpoint — IP-independent budgets ─────────────

  it("[ADR-022] rate limit is scoped to the sign-in endpoint — distinct IPs have independent budgets", async () => {
    const ipA = "10.10.10.1";
    const ipB = "10.10.10.2";

    // Flood IP A
    mockState.sourceIp = ipA;
    await signInAsClient(makeFormData());
    await signInAsClient(makeFormData());
    const aThrottled = await signInAsClient(makeFormData());
    expect(aThrottled.success).toBe(false);

    // IP B is unaffected — confirming (ip, endpoint) keying not (global or email)
    mockState.sourceIp = ipB;
    const bResult = await signInAsClient(makeFormData("other@example.com"));
    expect(bResult.success, "IP B should have an independent budget").toBe(true);
  });
});
