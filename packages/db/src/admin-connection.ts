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

const { ConnectionPool } = mssqlPkg;

/**
 * Parse a Prisma-format sqlserver:// URL into mssql ConnectionPool config.
 * Supports both authority form (user:pass@host:port) and semicolon-param form
 * (sqlserver://host;port=N;user=U;password=P;...).
 *
 * This is a copy of parseSqlServerUrl from scripts/db-migrate.ts to avoid
 * a circular dependency between packages/db and scripts/.
 */
function parseSqlServerUrl(connectionUrl: string): import("mssql").config {
  const withoutScheme = connectionUrl.replace(/^(?:sqlserver|mssql):\/\//, "");
  const firstSemi = withoutScheme.indexOf(";");
  const authority = firstSemi === -1 ? withoutScheme : withoutScheme.slice(0, firstSemi);
  const paramStr = firstSemi === -1 ? "" : withoutScheme.slice(firstSemi + 1);

  const params: Record<string, string> = {};
  for (const part of paramStr.split(";")) {
    const eqIdx = part.indexOf("=");
    if (eqIdx === -1) continue;
    const k = part.slice(0, eqIdx).trim();
    const v = part.slice(eqIdx + 1).trim();
    if (k) params[k] = v;
  }

  let user: string | undefined;
  let password: string | undefined;
  let hostPort = authority;

  const atIdx = authority.lastIndexOf("@");
  if (atIdx !== -1) {
    const credentials = authority.slice(0, atIdx);
    hostPort = authority.slice(atIdx + 1);
    const colonIdx = credentials.indexOf(":");
    if (colonIdx === -1) {
      user = decodeURIComponent(credentials);
    } else {
      user = decodeURIComponent(credentials.slice(0, colonIdx));
      password = decodeURIComponent(credentials.slice(colonIdx + 1));
    }
  }

  let server = hostPort;
  let port = 1433;
  const portMatch = hostPort.match(/:(\d+)$/);
  if (portMatch) {
    port = parseInt(portMatch[1] ?? "1433", 10);
    server = hostPort.slice(0, hostPort.length - portMatch[0].length);
  }

  const resolvedUser = user ?? params["user"];
  const resolvedPassword = password ?? params["password"];
  const resolvedPort = port !== 1433 ? port : (params["port"] ? parseInt(params["port"], 10) : 1433);

  const encrypt = (params["encrypt"] ?? "true").toLowerCase() !== "false";
  const trustServerCertificate =
    (params["trustServerCertificate"] ?? "false").toLowerCase() === "true";

  return {
    server: server,
    port: resolvedPort,
    user: resolvedUser,
    password: resolvedPassword,
    database: params["database"] || "master",
    options: {
      encrypt,
      trustServerCertificate,
    },
  };
}

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
