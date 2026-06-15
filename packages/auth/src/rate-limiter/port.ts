/**
 * packages/auth/src/rate-limiter/port.ts — RateLimiter port interface
 *
 * Defines the contract all rate-limiter bindings must satisfy.
 * ADR-022 §1: per-IP and per-endpoint limiting at the application edge.
 * ADR-022 §2: in-memory v1 with a defined >1-replica shared-store migration.
 * ADR-013: port discipline — swapping the impl is a single adapter change.
 *
 * Consumers key by `(sourceIp, endpoint)` — e.g. `"1.2.3.4:portal:sign-in"`.
 * The port is generic: callers build the compound key and pass it in.
 *
 * >1-REPLICA MIGRATION NOTE (ADR-022 §2 / ADR-007):
 *   The in-memory v1 implementation (InMemoryRateLimiter) stores counters in a
 *   single Node.js process. When either app scales beyond ONE REPLICA, counters
 *   live only in each replica's process — effective limit multiplies by the
 *   replica count (a real abuse hole). At that point, replace the in-memory
 *   adapter with the shared-store impl (SQL Server or external store) behind
 *   this same RateLimiter port. The call site in the sign-in action does NOT
 *   change; only the binding registered via getRateLimiter() changes.
 *   See .implementation/operations/runbook.md § Rate Limiter Scaling Trigger.
 */

// ─── Port Types ───────────────────────────────────────────────────────────────

/**
 * Result of a rate-limit check / consume call.
 *
 * allowed: true  → the request is within budget; caller should proceed.
 * allowed: false → the budget is exhausted; caller should return 429-equivalent.
 * retryAfterMs: (when allowed=false) milliseconds until the window resets.
 *               Callers surface this as the Retry-After hint.
 */
export interface RateLimitResult {
  allowed: boolean;
  retryAfterMs?: number;
}

/**
 * Configuration for the rate-limiter (consumed by the impl at construction).
 * ADR-022 §1: limits must be configurable (env/config), not hard-coded at the call site.
 */
export interface RateLimiterConfig {
  /**
   * Maximum allowed attempts within the window.
   * Conservative default: RATE_LIMIT_MAX_ATTEMPTS env var, else 10.
   */
  maxAttempts: number;

  /**
   * Window length in milliseconds.
   * Conservative default: RATE_LIMIT_WINDOW_MS env var, else 60_000 (1 minute).
   */
  windowMs: number;
}

/**
 * RateLimiter port — the single interface all rate-limiter bindings must implement.
 *
 * ADR-022 §2 / ADR-013: the port seam keeps the in-memory→shared-store swap
 * to a single adapter change. Sign-in callers program to this port exclusively.
 *
 * Usage:
 *   const limiter = getRateLimiter();
 *   const key = buildRateLimitKey(sourceIp, "portal:sign-in");
 *   const result = limiter.consume(key);
 *   if (!result.allowed) return rateLimitedResult(result.retryAfterMs);
 */
export interface RateLimiter {
  /**
   * Consume one attempt from the budget for the given key.
   *
   * If the current window has capacity, records the attempt and returns allowed=true.
   * If the budget is exhausted, returns allowed=false with retryAfterMs.
   *
   * key: compound string identifying the (sourceIp, endpoint) pair.
   *      Build with buildRateLimitKey().
   */
  consume(key: string): RateLimitResult;

  /**
   * Check the current state for the given key WITHOUT consuming a slot.
   * Returns the same shape as consume() — useful for pre-flight checks without
   * counting the check against the budget.
   */
  peek(key: string): RateLimitResult;

  /**
   * Reset the counter for all keys (used in tests to clear state between runs).
   * @internal — test / fixture use only. Do not call in production code.
   */
  reset(): void;
}

// ─── Key Helper ───────────────────────────────────────────────────────────────

/**
 * Build the compound rate-limit key for a (sourceIp, endpoint) pair.
 *
 * ADR-022 §1: key is per-source-IP AND per-endpoint so the sign-in budget
 * does not consume from the engagement-request budget and vice versa.
 * ADR-005: sourceIp must be resolved server-side (not a client-supplied header).
 *
 * @param sourceIp  The source IP address, resolved server-side.
 * @param endpoint  A stable endpoint identifier (e.g. "portal:sign-in").
 */
export function buildRateLimitKey(sourceIp: string, endpoint: string): string {
  return `${sourceIp}:${endpoint}`;
}

// ─── Config Helpers ───────────────────────────────────────────────────────────

/**
 * Read rate-limiter configuration from environment variables with conservative defaults.
 *
 * ADR-022 §1: limits are configurable, not hard-coded at the call site.
 *
 * Environment variables:
 *   RATE_LIMIT_MAX_ATTEMPTS — integer, default 10
 *   RATE_LIMIT_WINDOW_MS    — integer milliseconds, default 60000 (1 minute)
 */
export function getRateLimiterConfig(): RateLimiterConfig {
  const maxAttempts =
    parseInt(process.env["RATE_LIMIT_MAX_ATTEMPTS"] ?? "", 10) || 10;
  const windowMs =
    parseInt(process.env["RATE_LIMIT_WINDOW_MS"] ?? "", 10) || 60_000;

  return { maxAttempts, windowMs };
}
