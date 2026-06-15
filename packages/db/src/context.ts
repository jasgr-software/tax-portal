/**
 * packages/db/src/context.ts
 *
 * Request-scoped identity context using AsyncLocalStorage.
 * ADR-003: SESSION_CONTEXT identity propagation via AsyncLocalStorage.
 *
 * Every request-handling path must call withRequestContext() before touching the DB.
 * The $extends middleware in client.ts reads currentRequestContext() to get the
 * clerk_user_id and role to set on the SQL Server connection.
 *
 * Test helper: withClerkIdentity(clerkUserId, role, fn) — sets up a mock request context
 * for integration tests that need to exercise RLS without going through Next.js middleware.
 * ADR-003 § Consequences: "Integration tests ... set SESSION_CONTEXT manually via a test helper"
 */

import { AsyncLocalStorage } from "node:async_hooks";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RequestContext {
  /** The authenticated Clerk user ID (e.g. "user_abc123") */
  clerkUserId: string;
  /** The application role: 'ACCOUNTANT' | 'CLIENT' — matches SESSION_CONTEXT 'role' key */
  role: "ACCOUNTANT" | "CLIENT";
  /**
   * Tracks whether SESSION_CONTEXT has been set on the current connection for this request.
   * Prevents redundant sp_set_session_context calls on the same request.
   * ADR-003 §2: "tracked per request (not per connection) so the SET runs once per request"
   */
  sessionContextSet: boolean;
}

// ─── Storage ──────────────────────────────────────────────────────────────────

const _storage = new AsyncLocalStorage<RequestContext>();

/**
 * Returns the current request context if one is active, or null if not.
 * Called by the $extends middleware in client.ts before every DB operation.
 *
 * Returns null (not throws) — the middleware is responsible for the throw-or-pass decision.
 */
export function currentRequestContext(): RequestContext | null {
  return _storage.getStore() ?? null;
}

/**
 * Runs `fn` inside a request context carrying the given Clerk identity.
 *
 * In production: called by the Next.js middleware after verifying the Clerk session.
 * In tests: called by `withClerkIdentity` (see below).
 *
 * Any DB operations inside `fn` that go through the `db` client will have
 * SESSION_CONTEXT set automatically on first query.
 */
export function withRequestContext<T>(
  clerkUserId: string,
  role: "ACCOUNTANT" | "CLIENT",
  fn: () => Promise<T>,
): Promise<T> {
  const ctx: RequestContext = { clerkUserId, role, sessionContextSet: false };
  return _storage.run(ctx, fn);
}

/**
 * Integration-test helper that wraps a callback in a request context.
 *
 * ADR-003 § Consequences:
 *   "Integration tests that hit the DB directly (not through Next.js) set SESSION_CONTEXT
 *    manually via a test helper: withClerkIdentity('user_abc', 'CLIENT', () => { ... })"
 *
 * USAGE (in .test.ts files):
 *   const rows = await withClerkIdentity('user_clerk_123', 'CLIENT', () =>
 *     db.engagementRequest.findMany()
 *   );
 *
 * This is the only export from packages/db that test code may use directly to simulate
 * an authenticated request context. It does NOT bypass RLS — it sets real SESSION_CONTEXT
 * on the real SQL Server connection, exactly as production middleware would.
 */
export function withClerkIdentity<T>(
  clerkUserId: string,
  role: "ACCOUNTANT" | "CLIENT",
  fn: () => Promise<T>,
): Promise<T> {
  return withRequestContext(clerkUserId, role, fn);
}
