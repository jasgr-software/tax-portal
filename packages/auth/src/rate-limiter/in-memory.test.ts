/**
 * packages/auth/src/rate-limiter/in-memory.test.ts — Unit tests for InMemoryRateLimiter
 *
 * Verifies:
 *   - Allows attempts up to maxAttempts
 *   - Throttles the attempt that hits the limit (the Nth attempt itself is throttled)
 *   - Independent budgets per distinct key (ADR-022 §1: per-IP + per-endpoint scoping)
 *   - Window expiry resets the budget
 *   - peek() does not consume a slot
 *   - reset() clears all counters
 *
 * Tags: [ADR-022] / [rate-limit]
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { InMemoryRateLimiter } from "./in-memory.js";
import { buildRateLimitKey } from "./port.js";

describe("[ADR-022] [rate-limit] InMemoryRateLimiter — unit", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows attempts up to (maxAttempts - 1)", () => {
    const limiter = new InMemoryRateLimiter({ maxAttempts: 5, windowMs: 60_000 });
    const key = buildRateLimitKey("1.2.3.4", "portal:sign-in");

    // First 4 attempts should be allowed (indices 0–3 → counts 1–4, limit=5)
    for (let i = 0; i < 4; i++) {
      const result = limiter.consume(key);
      expect(result.allowed, `attempt ${i + 1} should be allowed`).toBe(true);
    }
  });

  it("[ADR-022] throttles the Nth attempt that exhausts the budget", () => {
    const limiter = new InMemoryRateLimiter({ maxAttempts: 3, windowMs: 60_000 });
    const key = buildRateLimitKey("1.2.3.4", "portal:sign-in");

    // First 2 allowed
    expect(limiter.consume(key).allowed).toBe(true);
    expect(limiter.consume(key).allowed).toBe(true);
    // 3rd attempt hits the limit — throttled
    const throttled = limiter.consume(key);
    expect(throttled.allowed).toBe(false);
    expect(throttled.retryAfterMs).toBeGreaterThan(0);
  });

  it("[ADR-022] all subsequent attempts after limit are throttled", () => {
    const limiter = new InMemoryRateLimiter({ maxAttempts: 2, windowMs: 60_000 });
    const key = buildRateLimitKey("10.0.0.1", "portal:sign-in");

    limiter.consume(key); // 1
    limiter.consume(key); // 2 — exhausts budget

    // 3rd and 4th should be throttled
    expect(limiter.consume(key).allowed).toBe(false);
    expect(limiter.consume(key).allowed).toBe(false);
  });

  it("[ADR-022] distinct keys have independent budgets (separate IPs)", () => {
    const limiter = new InMemoryRateLimiter({ maxAttempts: 2, windowMs: 60_000 });
    const keyA = buildRateLimitKey("1.1.1.1", "portal:sign-in");
    const keyB = buildRateLimitKey("2.2.2.2", "portal:sign-in");

    // Flood keyA
    limiter.consume(keyA);
    limiter.consume(keyA);
    expect(limiter.consume(keyA).allowed).toBe(false);

    // keyB should still have its own fresh budget
    expect(limiter.consume(keyB).allowed, "different IP should not be throttled").toBe(
      true,
    );
  });

  it("[ADR-022] distinct endpoint scoping — same IP, different endpoints", () => {
    const limiter = new InMemoryRateLimiter({ maxAttempts: 2, windowMs: 60_000 });
    const signInKey = buildRateLimitKey("1.1.1.1", "portal:sign-in");
    const engagementKey = buildRateLimitKey("1.1.1.1", "portal:engagement-request");

    // Flood sign-in endpoint
    limiter.consume(signInKey);
    limiter.consume(signInKey);
    expect(limiter.consume(signInKey).allowed).toBe(false);

    // Same IP on a different endpoint should be unaffected
    expect(limiter.consume(engagementKey).allowed).toBe(true);
  });

  it("window expiry resets the budget", () => {
    vi.useFakeTimers();
    const limiter = new InMemoryRateLimiter({ maxAttempts: 2, windowMs: 1_000 });
    const key = buildRateLimitKey("1.2.3.4", "portal:sign-in");

    // Exhaust the window
    limiter.consume(key);
    limiter.consume(key);
    expect(limiter.consume(key).allowed).toBe(false);

    // Advance past the window
    vi.advanceTimersByTime(1_001);

    // Budget resets — new window starts fresh
    expect(limiter.consume(key).allowed).toBe(true);
  });

  it("peek() checks state without consuming a slot", () => {
    const limiter = new InMemoryRateLimiter({ maxAttempts: 3, windowMs: 60_000 });
    const key = buildRateLimitKey("5.5.5.5", "portal:sign-in");

    // peek on a fresh key — allowed
    expect(limiter.peek(key).allowed).toBe(true);

    // consume 2 (one below limit)
    limiter.consume(key);
    limiter.consume(key);

    // peek says still allowed (one slot left)
    expect(limiter.peek(key).allowed).toBe(true);

    // peek a third time — still hasn't consumed
    expect(limiter.peek(key).allowed).toBe(true);

    // consume the third slot — throttle fires
    expect(limiter.consume(key).allowed).toBe(false);

    // peek now shows throttled
    expect(limiter.peek(key).allowed).toBe(false);
  });

  it("reset() clears all counters", () => {
    const limiter = new InMemoryRateLimiter({ maxAttempts: 2, windowMs: 60_000 });
    const key = buildRateLimitKey("9.9.9.9", "portal:sign-in");

    limiter.consume(key);
    limiter.consume(key);
    expect(limiter.consume(key).allowed).toBe(false);

    limiter.reset();

    // After reset, budget is fresh
    expect(limiter.consume(key).allowed).toBe(true);
  });

  it("retryAfterMs is positive and ≤ windowMs when throttled", () => {
    vi.useFakeTimers();
    const windowMs = 30_000;
    const limiter = new InMemoryRateLimiter({ maxAttempts: 1, windowMs });
    const key = buildRateLimitKey("3.3.3.3", "portal:sign-in");

    // Exhaust immediately
    limiter.consume(key);
    const throttled = limiter.consume(key);

    expect(throttled.allowed).toBe(false);
    expect(throttled.retryAfterMs).toBeGreaterThan(0);
    expect(throttled.retryAfterMs).toBeLessThanOrEqual(windowMs);
  });

  it("[ADR-022] buildRateLimitKey produces compound (ip, endpoint) string", () => {
    const key = buildRateLimitKey("192.168.1.1", "portal:sign-in");
    expect(key).toBe("192.168.1.1:portal:sign-in");
  });
});
