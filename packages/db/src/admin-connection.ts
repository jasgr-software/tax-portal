/**
 * packages/db/src/admin-connection.ts
 *
 * Lazy admin-pool mssql connection for repository operations that need to
 * bypass the Prisma 5.22.0 sqlserver connector's port-parsing limitation.
 *
 * ADR-003 §1: admin pool (app_admin_role) — elevated, RLS-exempt.
 * ADR-004: Prisma as sole ORM — raw mssql is the escape hatch for this specific
 *          workaround (non-standard port in test/dev environments).
 *
 * Production (standard port 1433): adminDb Prisma client works identically.
 * Dev/test (non-standard port): Prisma 5.22.0 ignores port=N in semicolon-param
 * form. This module uses the mssql driver directly, which parses both URL forms
 * correctly. Per TASK-002 documentation and TASK-003 IO disposition.
 *
 * This is an INTERNAL module — not exported from the package barrel.
 * External code should import `adminDb` from './client.js' for Prisma-style access,
 * or use this for raw SQL operations that need the admin pool.
 */

import mssqlPkg from "mssql";
import { parseSqlServerUrl } from "./sql-server-url.js";

const { ConnectionPool } = mssqlPkg;

// ─── Lazy connection pool ────────────────────────────────────────────────────

let _adminPool: InstanceType<typeof ConnectionPool> | null = null;
// In-flight promise memoization: prevents two concurrent callers from both
// entering the connect() path and leaking one of the resulting connections.
let _adminPoolPromise: Promise<InstanceType<typeof ConnectionPool>> | null = null;

/**
 * Returns the admin-pool mssql connection, creating it on first call.
 * Reads DATABASE_URL_ADMIN from environment.
 *
 * Concurrent callers await the same connection promise — no pool leak.
 *
 * ADR-003 §7: admin pool is used by migrations, webhooks, cron, seeds, and
 * the one sanctioned identity-less write (anonymous engagement request submit).
 */
export async function getAdminPool(): Promise<InstanceType<typeof ConnectionPool>> {
  if (_adminPool && _adminPool.connected) {
    return _adminPool;
  }

  if (_adminPoolPromise) {
    return _adminPoolPromise;
  }

  const url = process.env["DATABASE_URL_ADMIN"];
  if (!url) {
    throw new Error(
      "[packages/db] DATABASE_URL_ADMIN is not set. " +
        "Required for admin pool operations (ADR-007: SQL authentication).",
    );
  }

  const config = parseSqlServerUrl(url);
  const pool = new ConnectionPool(config);
  _adminPoolPromise = pool.connect().then((connected) => {
    _adminPool = connected;
    _adminPoolPromise = null;
    return connected;
  });
  return _adminPoolPromise;
}

/**
 * Close the admin pool connection. Call during process shutdown or test teardown.
 */
export async function closeAdminPool(): Promise<void> {
  if (_adminPool) {
    await _adminPool.close();
    _adminPool = null;
  }
}
