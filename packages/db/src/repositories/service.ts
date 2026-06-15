/**
 * packages/db/src/repositories/service.ts
 *
 * Data-access functions for Service.
 *
 * AC-DOOR-002-04: Only active services surface on the services page.
 * AC-DOOR-001-02: Services listed from DB are only active ones.
 * AC-DOOR-003-04: Active-services data-layer filter is enforced (inactive excluded).
 *
 * Service availability is toggled via the `active` flag — never deleted (reversible,
 * per REQ-DOOR-002). `getActiveServices` enforces the active-only filter at the query level.
 *
 * ADR-005 § Tables-in-scope:
 *   "Service-catalog tables (Service, IntakeTemplate) are accountant-managed, client-readable
 *    — policies allow all CLIENTs to SELECT active rows; only ACCOUNTANT / admin can mutate."
 *
 * DECISION: getActiveServices uses the admin pool (app_admin_role, RLS-exempt) for the public
 * services page, which has no authenticated user context. Citing ADR-003 §1/§6 — "anonymous
 * paths must use the admin pool, never the request pool." Query is read-only, filter-constrained
 * (active = true) — does not leak non-public data.
 *
 * Implementation note: uses raw mssql via the getAdminPool() factory as a pragmatic workaround
 * for the Prisma 5.22.0 sqlserver connector's port-parsing limitation in dev/test environments
 * (TASK-002 documented limitation). In production (standard port 1433), the Prisma adminDb
 * would work identically. This is the admin-pool escape hatch (ADR-004 § Raw SQL escape hatch).
 */

import { getAdminPool } from "../admin-connection.js";

export interface ServiceListItem {
  id: string;
  name: string;
  description: string | null;
  sortOrder: number;
}

// Row type from the raw query
interface ServiceRow {
  id: string;
  name: string;
  description: string | null;
  sortOrder: number;
}

/**
 * Returns the list of active services for the public services page.
 *
 * AC-DOOR-002-04 / AC-DOOR-001-02 / AC-DOOR-003-04:
 *   Only services with active = true are returned. Inactive services are excluded.
 *
 * DECISION: Uses admin pool for the anonymous public page path (no Clerk identity needed).
 * Ordered by sortOrder ASC, then name ASC for deterministic display order.
 */
export async function getActiveServices(): Promise<ServiceListItem[]> {
  const pool = await getAdminPool();
  const result = await pool.request().query<ServiceRow>(
    `SELECT [id], [name], [description], [sortOrder]
     FROM [dbo].[Service]
     WHERE [active] = 1
     ORDER BY [sortOrder] ASC, [name] ASC`
  );
  return result.recordset.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    sortOrder: row.sortOrder,
  }));
}
