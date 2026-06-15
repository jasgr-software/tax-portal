/**
 * apps/portal/e2e/fixtures/db.ts — Admin-pool DB helpers for e2e fixtures
 *
 * These helpers connect to SQL Server via the admin pool (DATABASE_URL_ADMIN)
 * to support:
 *   1. Verifying the engagement request was created (AC-DOOR-004-03 happy path).
 *      The engagement_request table is ACCOUNTANT-ONLY-readable by policy (ADR-005);
 *      we use the admin pool (app_admin_role, RLS-exempt) here instead of relaxing policy.
 *   2. Reading active/inactive service names so specs can assert exact names from DB data.
 *
 * SECURITY NOTE (ENGINE.md § Gate Authoring Rules):
 *   The RLS policy on engagement_request is NOT relaxed in tests.
 *   The admin pool (app_admin_role) is used — the same principal used by the server
 *   for anonymous writes (ADR-003 §1/§6). This is the "accountant-readable path"
 *   the task spec requires: use a seeded admin context, not a policy bypass.
 *
 * DATABASE_URL_ADMIN environment variable is required. In the docker-compose stack
 * this is injected at runtime. For local dev, set it in .env.local.
 *
 * Parsing logic mirrors packages/db/src/admin-connection.ts (same pragmatic workaround).
 */

import sql from "mssql";

// ─── URL Parser (mirrors packages/db/src/admin-connection.ts) ─────────────────

function parseSqlServerUrl(connectionUrl: string): sql.config {
  const withoutScheme = connectionUrl.replace(/^(?:sqlserver|mssql):\/\//, "");
  const firstSemi = withoutScheme.indexOf(";");
  const authority =
    firstSemi === -1 ? withoutScheme : withoutScheme.slice(0, firstSemi);
  const paramStr =
    firstSemi === -1 ? "" : withoutScheme.slice(firstSemi + 1);

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
  const resolvedPort =
    port !== 1433
      ? port
      : params["port"]
        ? parseInt(params["port"], 10)
        : 1433;

  const encrypt = (params["encrypt"] ?? "true").toLowerCase() !== "false";
  const trustServerCertificate =
    (params["trustServerCertificate"] ?? "false").toLowerCase() === "true";

  return {
    server,
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

// ─── Connection management ──────────────────────────────────────────────────────

let _pool: sql.ConnectionPool | null = null;

/**
 * Returns a connected admin-pool connection (lazy, singleton per test worker).
 * Call closeAdminPool() in globalTeardown or afterAll.
 */
async function getPool(): Promise<sql.ConnectionPool> {
  if (_pool && _pool.connected) return _pool;

  const url = process.env["DATABASE_URL_ADMIN"];
  if (!url) {
    throw new Error(
      "[e2e/fixtures/db] DATABASE_URL_ADMIN is not set. " +
        "Required for admin pool operations in e2e fixtures (ADR-007).",
    );
  }

  const config = parseSqlServerUrl(url);
  _pool = new sql.ConnectionPool(config);
  await _pool.connect();
  return _pool;
}

/**
 * Close the admin pool. Call in globalTeardown or afterAll.
 */
export async function closeAdminPool(): Promise<void> {
  if (_pool) {
    await _pool.close();
    _pool = null;
  }
}

// ─── E2e fixture helpers ────────────────────────────────────────────────────────

export interface ServiceRow {
  id: string;
  name: string;
  active: boolean;
}

/**
 * Returns all services (active and inactive) from the DB.
 * Used by specs to assert which names should/shouldn't appear on the page.
 *
 * Note: mssql returns SQL Server BIT columns as JavaScript boolean (true/false),
 * not as numbers (1/0). The active field is typed accordingly.
 */
export async function getAllServices(): Promise<ServiceRow[]> {
  const pool = await getPool();
  // Cast to BIT explicitly; mssql maps BIT to JS boolean
  const result = await pool
    .request()
    .query<{ id: string; name: string; active: boolean }>(
      `SELECT [id], [name], [active] FROM [dbo].[Service] ORDER BY [sortOrder] ASC, [name] ASC`,
    );
  return result.recordset.map((r) => ({
    id: r.id,
    name: r.name,
    // mssql returns BIT as boolean — convert defensively in case some drivers return 1/0
    active: r.active === true || (r.active as unknown as number) === 1,
  }));
}

/**
 * Returns active services only (mirrors getActiveServices() from packages/db).
 */
export async function getActiveServices(): Promise<ServiceRow[]> {
  const services = await getAllServices();
  return services.filter((s) => s.active);
}

/**
 * Returns inactive services only.
 */
export async function getInactiveServices(): Promise<ServiceRow[]> {
  const services = await getAllServices();
  return services.filter((s) => !s.active);
}

export interface EngagementRequestRow {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  status: string;
  serviceIds: string[];
}

/**
 * Looks up a recently created engagement request by email (normalized) and returns
 * the record plus its associated service IDs.
 *
 * Uses the admin pool (app_admin_role, RLS-exempt) — this is the "accountant-readable
 * path" required by TASK-005. The RLS policy is NOT relaxed.
 *
 * Returns null if no matching request is found.
 */
export async function findEngagementRequestByEmail(
  email: string,
): Promise<EngagementRequestRow | null> {
  const normalizedEmail = email.trim().toLowerCase();
  const pool = await getPool();

  const requestResult = await pool
    .request()
    .input("email", normalizedEmail)
    .query<{
      id: string;
      firstName: string;
      lastName: string;
      email: string;
      status: string;
    }>(
      `SELECT TOP 1 [id], [firstName], [lastName], [email], [status]
       FROM [dbo].[EngagementRequest]
       WHERE [email] = @email
       ORDER BY [createdAt] DESC`,
    );

  const row = requestResult.recordset[0];
  if (!row) return null;

  // Fetch associated service IDs
  const servicesResult = await pool
    .request()
    .input("engagementRequestId", row.id)
    .query<{ serviceId: string }>(
      `SELECT [serviceId]
       FROM [dbo].[EngagementRequestService]
       WHERE [engagementRequestId] = @engagementRequestId`,
    );

  return {
    id: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email,
    status: row.status,
    serviceIds: servicesResult.recordset.map((r) => r.serviceId),
  };
}

/**
 * Deletes a test engagement request by email (cleanup after e2e tests).
 * Deletes EngagementRequestService rows first (FK), then EngagementRequest.
 * Only used in test teardown — does not affect the RLS policy behavior.
 */
export async function deleteEngagementRequestsByEmail(
  email: string,
): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();
  const pool = await getPool();

  // Delete join rows first (FK constraint)
  await pool.request().input("email", normalizedEmail).query(`
    DELETE ers
    FROM [dbo].[EngagementRequestService] ers
    INNER JOIN [dbo].[EngagementRequest] er ON er.[id] = ers.[engagementRequestId]
    WHERE er.[email] = @email
  `);

  // Then delete the request
  await pool
    .request()
    .input("email", normalizedEmail)
    .query(
      `DELETE FROM [dbo].[EngagementRequest] WHERE [email] = @email`,
    );
}
