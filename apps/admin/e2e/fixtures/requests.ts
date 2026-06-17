/**
 * apps/admin/e2e/fixtures/requests.ts — Engagement request seed/cleanup for admin e2e
 *
 * BRIEF-003 / TASK-003-006: Seed engagement requests for e2e specs.
 * Uses the admin pool (DATABASE_URL_ADMIN, app_admin_role, RLS-exempt) to:
 *   1. Seed pending engagement requests for accept/decline tests.
 *   2. Query request details after decision actions.
 *   3. Clean up seeded requests after each test.
 *
 * SECURITY NOTE (ADR-005): The admin pool is the RLS-exempt path used legitimately
 *   by e2e fixtures — the same path the accountant uses via SESSION_CONTEXT.
 *   The RLS policy is NOT relaxed; we use the admin principal that has full access,
 *   mirroring how the server's own admin pool creates requests (anonymous write path).
 *
 * Connection:
 *   DATABASE_URL_ADMIN env var — host-side URL (localhost:14330 in .env.local).
 *   Mirrors apps/portal/e2e/fixtures/db.ts pattern exactly.
 *
 * ADR-012: Tier-6 e2e fixtures read DB directly via admin pool for setup/teardown.
 * ADR-003: Fixture queries do NOT set SESSION_CONTEXT (no RLS filtering needed — admin pool).
 */

import mssqlPkg from "mssql";

const { ConnectionPool } = mssqlPkg;

// ─── URL Parser (mirrors apps/portal/e2e/fixtures/db.ts exactly) ──────────────

function parseSqlServerUrl(connectionUrl: string): mssqlPkg.config {
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
    database: params["database"] ?? "master",
    options: {
      encrypt,
      trustServerCertificate,
    },
  };
}

// ─── Connection management ──────────────────────────────────────────────────────

let _pool: mssqlPkg.ConnectionPool | null = null;

async function getPool(): Promise<mssqlPkg.ConnectionPool> {
  if (_pool && _pool.connected) return _pool;

  const url = process.env["DATABASE_URL_ADMIN"];
  if (!url) {
    throw new Error(
      "[e2e/fixtures/requests] DATABASE_URL_ADMIN is not set. " +
        "Required for admin pool operations in e2e fixtures (ADR-007).",
    );
  }

  const config = parseSqlServerUrl(url);
  _pool = new ConnectionPool(config);
  await _pool.connect();
  return _pool;
}

/**
 * Close the admin pool. Call in afterAll to clean up connections.
 */
export async function closeRequestsPool(): Promise<void> {
  if (_pool) {
    await _pool.close();
    _pool = null;
  }
}

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface SeededRequest {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  status: string;
}

export interface RequestRow {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  message: string | null;
  status: string;
  declineReason: string | null;
  invitationTicket: string | null;
  createdAt: Date;
}

// ─── Seed helpers ───────────────────────────────────────────────────────────────

/**
 * Seed a pending engagement request directly into the DB.
 * Uses raw SQL INSERT (same path as apps/portal/e2e/fixtures/db.ts).
 * Returns the seeded request id, firstName, lastName, email, and initial status.
 *
 * NOTE: Does NOT create a Notification row (unlike createEngagementRequest in the
 * production path). The notification seam is tested separately; seeded requests
 * here are for accept/decline UI flow tests where we need a known pending request.
 *
 * @param data.email - Unique email per test run to avoid cross-test collision.
 */
export async function seedPendingRequest(data: {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  message?: string;
}): Promise<SeededRequest> {
  const pool = await getPool();
  const normalizedEmail = data.email.trim().toLowerCase();

  // INSERT with OUTPUT INSERTED (ADR-002 § NEWSEQUENTIALID PKs via OUTPUT clause)
  const result = await pool
    .request()
    .input("firstName", data.firstName)
    .input("lastName", data.lastName)
    .input("email", normalizedEmail)
    .input("phone", data.phone ?? null)
    .input("message", data.message ?? null)
    .query<{ id: string }>(
      `INSERT INTO [dbo].[EngagementRequest]
         ([firstName], [lastName], [email], [phone], [message], [status], [createdAt], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES
         (@firstName, @lastName, @email, @phone, @message, 'pending', GETUTCDATE(), GETUTCDATE())`,
    );

  const row = result.recordset[0];
  if (!row) {
    throw new Error("[e2e/fixtures/requests] seedPendingRequest: no id returned from INSERT");
  }

  return {
    // SQL Server NEWSEQUENTIALID() returns uppercase GUID; lowercase to match HTML data-testid
    id: row.id.toLowerCase(),
    firstName: data.firstName,
    lastName: data.lastName,
    email: normalizedEmail,
    status: "pending",
  };
}

/**
 * Seed a pending engagement request AND a corresponding accountant Notification.
 * Mirrors the production createEngagementRequest() transaction.
 * Required for notification-leads-to-request tests (AC-DOOR-005-02).
 */
export async function seedPendingRequestWithNotification(data: {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  message?: string;
}): Promise<{ request: SeededRequest; notificationId: string }> {
  const pool = await getPool();
  const normalizedEmail = data.email.trim().toLowerCase();

  // Insert the request
  const reqResult = await pool
    .request()
    .input("firstName", data.firstName)
    .input("lastName", data.lastName)
    .input("email", normalizedEmail)
    .input("phone", data.phone ?? null)
    .input("message", data.message ?? null)
    .query<{ id: string }>(
      `INSERT INTO [dbo].[EngagementRequest]
         ([firstName], [lastName], [email], [phone], [message], [status], [createdAt], [updatedAt])
       OUTPUT INSERTED.[id]
       VALUES
         (@firstName, @lastName, @email, @phone, @message, 'pending', GETUTCDATE(), GETUTCDATE())`,
    );

  const reqRow = reqResult.recordset[0];
  if (!reqRow) {
    throw new Error("[e2e/fixtures/requests] seedPendingRequestWithNotification: no request id returned");
  }

  const requestId = reqRow.id;
  const title = `New engagement request from ${data.firstName} ${data.lastName}`;

  // Insert the Notification
  // NOTE: Notification schema has no [updatedAt] column (see prisma/schema.prisma §Notification).
  const notifResult = await pool
    .request()
    .input("engagementRequestId", requestId)
    .input("title", title)
    .query<{ id: string }>(
      `INSERT INTO [dbo].[Notification]
         ([type], [engagementRequestId], [title], [createdAt])
       OUTPUT INSERTED.[id]
       VALUES
         ('new_engagement_request', @engagementRequestId, @title, SYSDATETIMEOFFSET())`,
    );

  const notifRow = notifResult.recordset[0];
  if (!notifRow) {
    throw new Error("[e2e/fixtures/requests] seedPendingRequestWithNotification: no notification id returned");
  }

  return {
    request: {
      // SQL Server NEWSEQUENTIALID() returns uppercase GUID; lowercase to match HTML data-testid
      id: requestId.toLowerCase(),
      firstName: data.firstName,
      lastName: data.lastName,
      email: normalizedEmail,
      status: "pending",
    },
    // Lowercase notification ID too (used in data-testid lookups)
    notificationId: notifRow.id.toLowerCase(),
  };
}

// ─── Query helpers ──────────────────────────────────────────────────────────────

/**
 * Look up an engagement request by ID from the admin pool.
 * Returns null if not found.
 */
export async function getRequestById(id: string): Promise<RequestRow | null> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input("id", id)
    .query<RequestRow>(
      `SELECT [id], [firstName], [lastName], [email], [phone], [message],
              [status], [declineReason], [invitationTicket], [createdAt]
       FROM [dbo].[EngagementRequest]
       WHERE [id] = @id`,
    );
  return result.recordset[0] ?? null;
}

/**
 * Count all engagement requests in the DB (used by inbox-state assertions).
 */
export async function countAllRequests(): Promise<number> {
  const pool = await getPool();
  const result = await pool
    .request()
    .query<{ cnt: number }>(`SELECT COUNT(*) AS cnt FROM [dbo].[EngagementRequest]`);
  return result.recordset[0]?.cnt ?? 0;
}

// ─── Cleanup helpers ────────────────────────────────────────────────────────────

/**
 * Delete a seeded engagement request (and its Notification rows) by ID.
 * Call in afterEach/afterAll for deterministic teardown.
 *
 * Deletes in FK order:
 *   1. EngagementRequestService join rows
 *   2. Notification rows (have FK to EngagementRequest)
 *   3. EngagementRequest itself
 *
 * NOTE: AuditEvent rows are NOT deleted. AuditEvent is an APPEND_ONLY ledger table
 * (ADR-019) — DELETE is blocked by SQL Server. Audit rows for test requests are left
 * behind (they are keyed by targetId and do not block EngagementRequest deletion since
 * AuditEvent has no FK constraint back to EngagementRequest — it's an audit log).
 */
export async function deleteRequestById(id: string): Promise<void> {
  const pool = await getPool();

  // 1. Join rows
  await pool
    .request()
    .input("id", id)
    .query(`DELETE FROM [dbo].[EngagementRequestService] WHERE [engagementRequestId] = @id`);

  // 2. Notification rows
  await pool
    .request()
    .input("id", id)
    .query(`DELETE FROM [dbo].[Notification] WHERE [engagementRequestId] = @id`);

  // 3. EngagementRequest itself
  await pool
    .request()
    .input("id", id)
    .query(`DELETE FROM [dbo].[EngagementRequest] WHERE [id] = @id`);
}

/**
 * Delete seeded engagement requests by email (cleanup convenience).
 * Deletes in FK order.
 */
export async function deleteRequestsByEmail(email: string): Promise<void> {
  const pool = await getPool();
  const normalizedEmail = email.trim().toLowerCase();

  // Get IDs first
  const idResult = await pool
    .request()
    .input("email", normalizedEmail)
    .query<{ id: string }>(
      `SELECT [id] FROM [dbo].[EngagementRequest] WHERE [email] = @email`,
    );

  for (const row of idResult.recordset) {
    await deleteRequestById(row.id);
  }
}
