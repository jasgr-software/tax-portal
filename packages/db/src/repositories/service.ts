/**
 * packages/db/src/repositories/service.ts
 *
 * Data-access functions for Service.
 *
 * AC-DOOR-002-01: createService persists a new active service (re-readable, active=true)
 * AC-DOOR-002-02: updateService changes name/description and the change survives a re-read
 * AC-DOOR-002-03: deactivateService sets active=false (row NOT deleted — reversible)
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
 * Implementation note for reads: uses raw mssql via the getAdminPool() factory as a pragmatic
 * workaround for the Prisma 5.22.0 sqlserver connector's port-parsing limitation in dev/test
 * environments (TASK-002 documented limitation). In production (standard port 1433), the Prisma
 * adminDb would work identically. This is the admin-pool escape hatch (ADR-004 § Raw SQL escape
 * hatch).
 *
 * DECISION (TASK-002-002): Write functions (createService, updateService, deactivateService,
 * listAllServices) use the request-scoped `db` Prisma wrapper (SESSION_CONTEXT-aware) so that
 * the accountant's role reaches the sec.fn_service_write_access BLOCK predicate from TASK-002-001.
 * This is the runtime half of AC-DOOR-002-05 — writes are authorized at the trust boundary.
 * The caller is responsible for wrapping these calls inside withRequestContext(clerkUserId, role, fn).
 * Using adminDb for writes is EXPLICITLY FORBIDDEN — it bypasses the policy (ADR-003 §6, ADR-005).
 *
 * DECISION (TASK-002-002): Because `ReturnType<PrismaClient["$extends"]>` does not expose model
 * methods on its static type (complex TypeScript inference from $extends), the write functions cast
 * `db as unknown as PrismaClient` to access `db.service.*`. This is safe because at runtime `db`
 * IS a PrismaClient extended only with a query middleware — the model delegate shape is unchanged.
 * The alternative (raw mssql via requestPool) would bypass the $extends SESSION_CONTEXT middleware
 * and violate ADR-003. The cast is the minimal approach that keeps SESSION_CONTEXT propagation intact.
 */

import { PrismaClient } from "@prisma/client";
import { db } from "../client.js";
import { getAdminPool } from "../admin-connection.js";

// ─── Public types ─────────────────────────────────────────────────────────────

export interface ServiceListItem {
  id: string;
  name: string;
  description: string | null;
  sortOrder: number;
}

/** Full service shape returned by write operations and listAllServices */
export interface ServiceItem {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

/** Input for creating a new service */
export interface CreateServiceInput {
  /** Required — 1–200 characters */
  name: string;
  /** Optional — arbitrary text */
  description?: string | undefined;
  /** Display order (default 0) */
  sortOrder?: number | undefined;
}

/** Input for updating an existing service */
export interface UpdateServiceInput {
  /** Service ID (UNIQUEIDENTIFIER as string) */
  id: string;
  /** New name (1–200 characters) */
  name?: string | undefined;
  /** New description (or null to clear) */
  description?: string | null | undefined;
  /** New sort order */
  sortOrder?: number | undefined;
}

// ─── Internal cast helper ────────────────────────────────────────────────────

/**
 * Cast the request-scoped `db` wrapper to PrismaClient for model access.
 *
 * DECISION (TASK-002-002): `db` is `ReturnType<PrismaClient["$extends"]>` — the TypeScript
 * type does not expose model delegates at compile time (complex $extends inference). At runtime
 * the object IS a PrismaClient with the SESSION_CONTEXT middleware attached. Casting through
 * `unknown` is the minimal-risk approach: all model operations still go through the $extends
 * middleware (which sets SESSION_CONTEXT before the first query), maintaining ADR-003 compliance.
 *
 * The SESSION_CONTEXT is set by the $allOperations middleware in client.ts BEFORE the model
 * query executes — so the BLOCK predicate from TASK-002-001 sees the correct role.
 */
function requestDb(): PrismaClient {
  return db as unknown as PrismaClient;
}

// ─── Row type from raw query ──────────────────────────────────────────────────

interface ServiceRow {
  id: string;
  name: string;
  description: string | null;
  sortOrder: number;
}

// ─── Read: Public (anonymous) ─────────────────────────────────────────────────

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

// ─── Read: Admin list (active + inactive) ─────────────────────────────────────

/**
 * Returns ALL services (active and inactive) for the accountant admin list.
 *
 * MUST be called inside withRequestContext(clerkUserId, 'ACCOUNTANT', fn) so that
 * SESSION_CONTEXT is set and the FILTER predicate in sec.pol_Service allows the read.
 * The admin pool (app_admin_role) bypasses RLS and would work, but using `db` here keeps
 * the same SESSION_CONTEXT-aware path as the writes — consistent identity propagation.
 *
 * DECISION (TASK-002-002): Uses request-scoped `db` wrapper so the accountant identity is
 * set in SESSION_CONTEXT. Admin pool would also work (RLS-exempt), but the request pool
 * with an ACCOUNTANT context is the correct production path for authenticated reads.
 *
 * Ordered by active DESC (active rows first), then sortOrder ASC, then name ASC.
 */
export async function listAllServices(): Promise<ServiceItem[]> {
  const rows = await requestDb().service.findMany({
    orderBy: [
      { active: "desc" },
      { sortOrder: "asc" },
      { name: "asc" },
    ],
  });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    active: row.active,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
}

// ─── Writes: accountant-only (must run inside withRequestContext ACCOUNTANT) ──

/**
 * Creates a new service with active = true.
 *
 * AC-DOOR-002-01: The new service is persisted and re-readable with active=true.
 *
 * MUST be called inside withRequestContext(clerkUserId, 'ACCOUNTANT', fn).
 * The SESSION_CONTEXT middleware in client.ts sets clerk_user_id + role BEFORE
 * the INSERT reaches the DB, authorizing the write via sec.fn_service_write_access.
 *
 * Validation (enforced at repo level — defense in depth; server actions validate first):
 *   - name is required and non-empty (trimmed)
 *   - description is optional
 *   - sortOrder defaults to 0
 *
 * @throws Error if name is empty after trimming
 */
export async function createService(input: CreateServiceInput): Promise<ServiceItem> {
  const name = input.name.trim();
  if (!name) {
    throw new Error("Service name is required and must be non-empty");
  }
  if (name.length > 200) {
    throw new Error("Service name must be 200 characters or fewer");
  }

  const row = await requestDb().service.create({
    data: {
      name,
      description: input.description?.trim() ?? null,
      active: true, // AC-DOOR-002-01: new services start active
      sortOrder: input.sortOrder ?? 0,
    },
  });

  return {
    id: row.id,
    name: row.name,
    description: row.description,
    active: row.active,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Updates the name, description, and/or sortOrder of an existing service.
 *
 * AC-DOOR-002-02: The change to name/description survives a re-read.
 *
 * MUST be called inside withRequestContext(clerkUserId, 'ACCOUNTANT', fn).
 * Only fields present in the input are updated (partial update pattern).
 * The `active` flag is NOT changed by this function — use deactivateService/reactivateService.
 *
 * @throws Error if name is provided but empty after trimming
 * @throws Error if the service ID is not found (Prisma throws P2025)
 */
export async function updateService(input: UpdateServiceInput): Promise<ServiceItem> {
  if (!input.id) {
    throw new Error("Service id is required");
  }

  // Build the partial update object — only include fields that were provided
  const updateData: {
    name?: string;
    description?: string | null;
    sortOrder?: number;
  } = {};

  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) {
      throw new Error("Service name must be non-empty");
    }
    if (name.length > 200) {
      throw new Error("Service name must be 200 characters or fewer");
    }
    updateData.name = name;
  }

  if (input.description !== undefined) {
    // null is allowed (clears the description)
    updateData.description = input.description === null ? null : input.description.trim();
  }

  if (input.sortOrder !== undefined) {
    updateData.sortOrder = input.sortOrder;
  }

  const row = await requestDb().service.update({
    where: { id: input.id },
    data: updateData,
  });

  return {
    id: row.id,
    name: row.name,
    description: row.description,
    active: row.active,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Deactivates a service by setting active = false.
 *
 * AC-DOOR-002-03: The row is NOT deleted — only active is set to false (reversible).
 * REQ-DOOR-002: EngagementRequestService FK references must survive — no DELETE.
 *
 * MUST be called inside withRequestContext(clerkUserId, 'ACCOUNTANT', fn).
 *
 * @throws Error if the service ID is not found (Prisma throws P2025)
 */
export async function deactivateService(id: string): Promise<ServiceItem> {
  if (!id) {
    throw new Error("Service id is required");
  }

  // DECISION (TASK-002-002): UPDATE active = false — NEVER DELETE.
  // REQ-DOOR-002 explicitly requires reversible deactivation. The EngagementRequestService
  // join table references Service.id — a DELETE would violate FK constraints AND lose history.
  const row = await requestDb().service.update({
    where: { id },
    data: { active: false },
  });

  return {
    id: row.id,
    name: row.name,
    description: row.description,
    active: row.active,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Reactivates a previously deactivated service by setting active = true.
 *
 * DECISION (TASK-002-002): Included per task spec "optionally reactivateService" — the
 * reversibility of deactivation (REQ-DOOR-002) naturally implies a reactivate path.
 * This is the counterpart to deactivateService; future UI can expose it when needed.
 *
 * MUST be called inside withRequestContext(clerkUserId, 'ACCOUNTANT', fn).
 *
 * @throws Error if the service ID is not found (Prisma throws P2025)
 */
export async function reactivateService(id: string): Promise<ServiceItem> {
  if (!id) {
    throw new Error("Service id is required");
  }

  const row = await requestDb().service.update({
    where: { id },
    data: { active: true },
  });

  return {
    id: row.id,
    name: row.name,
    description: row.description,
    active: row.active,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
