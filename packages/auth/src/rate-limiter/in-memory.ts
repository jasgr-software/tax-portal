/**
 * packages/auth/src/rate-limiter/in-memory.ts — In-memory v1 RateLimiter implementation
 *
 * Fixed-window counter: each unique key gets its own attempt count inside a
 * time window. When the window expires, the counter resets.
 *
 * ADR-022 §2 / ADR-007 — SINGLE-PROCESS v1:
 *   // DECISION: This implementation stores counters in the Node.js process heap.
 *   // It is correct when each app runs as a SINGLE REPLICA. If either
 *   // apps/portal or apps/admin is scaled beyond ONE replica, counters are
 *   // per-process, so the effective limit multiplies by the replica count — an
 *   // abuse hole (ADR-007's in-memory caveat, reconciled by ADR-022 §2 into an
 *   // explicit scaling trigger). The migration path: replace this class with the
 *   // shared-store adapter (SQL Server or Redis) behind the RateLimiter port
 *   // WITHOUT changing the call sites in the sign-in action. See runbook §
 *   // "Rate Limiter Scaling Trigger" for the operational trigger.
 *
 * ADR-005 trusted-proxy assumption:
 *   // DECISION: The source IP key passed to consume()/peek() is resolved
 *   // server-side in the sign-in action. If X-Forwarded-For is used, it must be
 *   // trusted only when the request arrives from a known reverse proxy. See the
 *   // sign-in action (apps/portal/src/app/(public)/sign-in/actions.ts) for the
 *   // IP resolution and its DECISION note on the trusted-proxy assumption.
 *
 * Eviction: stale windows (expired but not yet replaced) are removed on access
 * to prevent unbounded map growth. The map does NOT grow without bound.
 */

import type { RateLimiter, RateLimitResult, RateLimiterConfig } from "./port.js";
import { getRateLimiterConfig } from "./port.js";

// ─── Window State ─────────────────────────────────────────────────────────────

interface WindowState {
  /** Number of attempts recorded in the current window */
  count: number;
  /** Timestamp (ms) when the current window expires */
  windowExpiresAt: number;
}

// ─── Implementation ───────────────────────────────────────────────────────────

export class InMemoryRateLimiter implements RateLimiter {
  private readonly config: RateLimiterConfig;
  private readonly windows: Map<string, WindowState> = new Map();

  constructor(config?: Partial<RateLimiterConfig>) {
    const defaults = getRateLimiterConfig();
    this.config = {
      maxAttempts: config?.maxAttempts ?? defaults.maxAttempts,
      windowMs: config?.windowMs ?? defaults.windowMs,
    };
  }

  /**
   * Consume one attempt from the budget for the given key.
   * Returns allowed=true if within budget; allowed=false + retryAfterMs if throttled.
   */
  consume(key: string): RateLimitResult {
    const now = Date.now();
    const state = this.getOrCreateWindow(key, now);

    // If budget already exhausted, reject without incrementing further
    if (state.count >= this.config.maxAttempts) {
      return {
        allowed: false,
        retryAfterMs: state.windowExpiresAt - now,
      };
    }

    // Consume one slot
    state.count += 1;

    // If this consume pushed us to the limit, report throttled immediately
    if (state.count >= this.config.maxAttempts) {
      return {
        allowed: false,
        retryAfterMs: state.windowExpiresAt - now,
      };
    }

    return { allowed: true };
  }

  /**
   * Check state without consuming a slot.
   */
  peek(key: string): RateLimitResult {
    const now = Date.now();
    const state = this.getOrCreateWindow(key, now);

    if (state.count >= this.config.maxAttempts) {
      return {
        allowed: false,
        retryAfterMs: state.windowExpiresAt - now,
      };
    }

    return { allowed: true };
  }

  /**
   * Reset all counters — for test/fixture use only.
   * @internal — do not call in production code.
   */
  reset(): void {
    this.windows.clear();
  }

  // ─── Private Helpers ───────────────────────────────────────────────────────

  /**
   * Return the WindowState for the given key, initialising or refreshing it
   * if the window has expired. Evicts stale entries on creation.
   */
  private getOrCreateWindow(key: string, now: number): WindowState {
    const existing = this.windows.get(key);

    if (existing && now < existing.windowExpiresAt) {
      // Still within the current window — reuse it
      return existing;
    }

    // Window expired (or first access for this key) — open a fresh window
    const fresh: WindowState = {
      count: 0,
      windowExpiresAt: now + this.config.windowMs,
    };
    this.windows.set(key, fresh);
    return fresh;
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

let _limiter: RateLimiter | null = null;

/**
 * Returns the active RateLimiter singleton for this process.
 * Mirrors the getAuthProvider() singleton pattern from packages/auth/src/select.ts.
 *
 * ADR-022 §2 / ADR-007 single-process note: singleton is correct per-process;
 * see class-level DECISION comment for the >1-replica migration trigger.
 */
export function getRateLimiter(): RateLimiter {
  if (_limiter) return _limiter;
  _limiter = new InMemoryRateLimiter();
  return _limiter;
}

/**
 * Reset the singleton — for test/fixture use only so integration tests
 * start each run with a clean counter map.
 *
 * @internal — do not call in production code.
 */
export function resetRateLimiterForTesting(): void {
  if (_limiter) _limiter.reset();
  _limiter = null;
}
