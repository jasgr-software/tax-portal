/**
 * apps/admin/src/app/services/actions.ts — Service catalog server actions (accountant-only)
 *
 * AC-DOOR-002-01: createServiceAction persists a new active service (re-readable, active=true)
 * AC-DOOR-002-02: updateServiceAction changes name/description and the change survives a re-read
 * AC-DOOR-002-03: deactivateServiceAction sets active=false (row NOT deleted — reversible)
 * AC-DOOR-002-05 (runtime half): writes run under the authenticated accountant identity so
 *                                 the role reaches the sec.fn_service_write_access BLOCK predicate.
 *
 * ADR-003: Every write goes through the request-scoped `db` wrapper (withRequestContext) so
 *   SESSION_CONTEXT is set before the first query. NO direct Prisma in this file (the
 *   repository functions wrap `db`). NO adminDb for catalog writes — adminDb bypasses RLS.
 *   ESLint import boundary enforces no direct `requestDb` import.
 *
 * ADR-005: The role written to SESSION_CONTEXT comes ONLY from getIdentity() (verified session)
 *   — NEVER from request body, header, or query param.
 *
 * Identity provenance (mirrors apps/admin/src/app/page.tsx):
 *   1. Reconstruct a minimal Request from the incoming headers (cookies).
 *   2. Call provider.getIdentity(syntheticRequest) → verified Identity (clerkUserId, role).
 *   3. Guard: identity must exist and role must be 'ACCOUNTANT'.
 *   4. Call withRequestContext(identity.clerkUserId, identity.role, () => repo call).
 *
 * Input validation:
 *   - name: required, non-empty after trim, max 200 chars
 *   - description: optional, no explicit max (NVARCHAR(Max) in schema)
 *   - sortOrder: optional integer, defaults to 0 if omitted
 *
 * REQ-DOOR-002: deactivateServiceAction sets active=false, never DELETE.
 *   EngagementRequestService FK references must survive.
 *
 * // DECISION (TASK-002-002): revalidatePath targets '/services' (the admin catalog route
 * //   for TASK-002-003). The route does not exist yet but revalidatePath is a no-op when
 * //   the path is not cached — safe to call now so TASK-002-003 picks up fresh data.
 *
 * // DECISION (TASK-002-002): Server actions return a discriminated union
 * //   { success: true; data: ServiceItem } | { success: false; error: string }
 * //   rather than throwing. This keeps the client-side handling explicit and avoids
 * //   unhandled error boundaries for user-input errors (empty name, etc.).
 * //   Fatal/unexpected errors (DB down, policy violation) are re-thrown as-is so the
 * //   Next.js error boundary surfaces them — these are ops issues, not input errors.
 */

"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getAuthProvider } from "@tax-portal/auth";
import {
  withRequestContext,
  createService,
  updateService,
  deactivateService,
} from "@tax-portal/db";
import type { ServiceItem } from "@tax-portal/db";

// ─── Result types ─────────────────────────────────────────────────────────────

export type ServiceActionResult =
  | { success: true; data: ServiceItem }
  | { success: false; error: string };

// ─── Identity helper ──────────────────────────────────────────────────────────

/**
 * Resolve the verified accountant identity from the incoming request headers.
 *
 * Mirrors apps/admin/src/app/page.tsx — builds a synthetic Request from the
 * incoming cookies so the auth binding can extract the session.
 *
 * Returns null if no identity is found or the role is not ACCOUNTANT.
 * The middleware should guarantee ACCOUNTANT before this action is reached,
 * but we guard here as defense-in-depth (ADR-010, ADR-005).
 *
 * ADR-005: identity.role comes from the verified session (Clerk public metadata
 * or mock session cookie) — NEVER from any server action argument or form data.
 */
async function getAccountantIdentity(): Promise<{
  clerkUserId: string;
  role: "ACCOUNTANT" | "CLIENT";
} | null> {
  const headerStore = await headers();
  const cookieHeader = headerStore.get("cookie") ?? "";

  // Build a minimal Request from the incoming headers so the auth provider can
  // extract the session cookie. Server Actions do not receive a Request object
  // directly — reconstruct from next/headers (standard pattern, mirrors page.tsx).
  const syntheticRequest = new Request("http://localhost/", {
    headers: { cookie: cookieHeader },
  });

  const provider = getAuthProvider();
  const identity = await provider.getIdentity(syntheticRequest);

  if (!identity || identity.role !== "ACCOUNTANT") {
    return null;
  }

  return { clerkUserId: identity.clerkUserId, role: identity.role };
}

// ─── Input validation ─────────────────────────────────────────────────────────

/** Validate service name: required, non-empty after trim, max 200 chars. */
function validateName(name: unknown): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof name !== "string") {
    return { ok: false, error: "Service name must be a string" };
  }
  const trimmed = name.trim();
  if (!trimmed) {
    return { ok: false, error: "Service name is required and must be non-empty" };
  }
  if (trimmed.length > 200) {
    return { ok: false, error: "Service name must be 200 characters or fewer" };
  }
  return { ok: true, value: trimmed };
}

/** Validate sortOrder: if provided, must be a safe integer. */
function validateSortOrder(
  sortOrder: unknown,
): { ok: true; value: number } | { ok: false; error: string } {
  if (sortOrder === undefined || sortOrder === null) {
    return { ok: true, value: 0 };
  }
  const n = Number(sortOrder);
  if (!Number.isInteger(n) || n < -2147483648 || n > 2147483647) {
    return { ok: false, error: "Sort order must be a valid integer" };
  }
  return { ok: true, value: n };
}

// ─── Server Actions ───────────────────────────────────────────────────────────

/**
 * Create a new service in the catalog.
 *
 * AC-DOOR-002-01: The new service persists with active=true and is re-readable.
 *
 * Flow:
 *   1. Resolve verified ACCOUNTANT identity from session.
 *   2. Validate input (name required, sortOrder optional).
 *   3. Call createService inside withRequestContext — SESSION_CONTEXT set before INSERT.
 *   4. revalidatePath('/services') so the admin catalog refreshes.
 *
 * @param input - Raw form data: name (required), description (optional), sortOrder (optional)
 * @returns ServiceActionResult — success + ServiceItem, or failure + error message
 */
export async function createServiceAction(
  input: { name: string; description?: string; sortOrder?: number | string },
): Promise<ServiceActionResult> {
  const identity = await getAccountantIdentity();
  if (!identity) {
    return { success: false, error: "Unauthorized: ACCOUNTANT identity required" };
  }

  // Validate name
  const nameValidation = validateName(input.name);
  if (!nameValidation.ok) {
    return { success: false, error: nameValidation.error };
  }

  // Validate sortOrder
  const sortOrderValidation = validateSortOrder(input.sortOrder);
  if (!sortOrderValidation.ok) {
    return { success: false, error: sortOrderValidation.error };
  }

  // Perform write inside withRequestContext — SESSION_CONTEXT carries ACCOUNTANT role
  // to sec.fn_service_write_access (runtime half of AC-DOOR-002-05).
  // ADR-003: identity provenance is the verified session (getAccountantIdentity above),
  //          never an argument to this action.
  const data = await withRequestContext(
    identity.clerkUserId,
    identity.role,
    () =>
      createService({
        name: nameValidation.value,
        description: input.description,
        sortOrder: sortOrderValidation.value,
      }),
  );

  // Revalidate the admin services catalog route
  // DECISION (TASK-002-002): revalidatePath('/services') is a no-op until the route
  // exists (TASK-002-003), but is safe to call now and ensures fresh data when it lands.
  revalidatePath("/services");

  return { success: true, data };
}

/**
 * Update an existing service's name, description, and/or sortOrder.
 *
 * AC-DOOR-002-02: The change survives a re-read.
 *
 * Only fields present (non-undefined) in the input are updated (partial update).
 * The `active` flag is not changed here — use deactivateServiceAction for that.
 *
 * @param input - id (required), name/description/sortOrder (any combination, all optional)
 * @returns ServiceActionResult — success + updated ServiceItem, or failure + error message
 */
export async function updateServiceAction(
  input: { id: string; name?: string; description?: string | null; sortOrder?: number | string },
): Promise<ServiceActionResult> {
  const identity = await getAccountantIdentity();
  if (!identity) {
    return { success: false, error: "Unauthorized: ACCOUNTANT identity required" };
  }

  if (!input.id) {
    return { success: false, error: "Service id is required" };
  }

  // Validate name if provided
  if (input.name !== undefined) {
    const nameValidation = validateName(input.name);
    if (!nameValidation.ok) {
      return { success: false, error: nameValidation.error };
    }
  }

  // Validate sortOrder if provided (not null/undefined)
  let normalizedSortOrder: number | undefined;
  if (input.sortOrder !== undefined && input.sortOrder !== null) {
    const sortOrderValidation = validateSortOrder(input.sortOrder);
    if (!sortOrderValidation.ok) {
      return { success: false, error: sortOrderValidation.error };
    }
    normalizedSortOrder = sortOrderValidation.value;
  }

  const updateInput: { id: string; name?: string; description?: string | null; sortOrder?: number } = {
    id: input.id,
    ...(input.name !== undefined && { name: input.name.trim() }),
    ...(input.description !== undefined && { description: input.description }),
    ...(normalizedSortOrder !== undefined && { sortOrder: normalizedSortOrder }),
  };

  const data = await withRequestContext(
    identity.clerkUserId,
    identity.role,
    () => updateService(updateInput),
  );

  revalidatePath("/services");

  return { success: true, data };
}

/**
 * Deactivate a service (sets active=false — NOT a delete).
 *
 * AC-DOOR-002-03: active=false, row still exists (reversible).
 * REQ-DOOR-002: EngagementRequestService FK references survive — never DELETE.
 *
 * @param id - The service ID to deactivate
 * @returns ServiceActionResult — success + deactivated ServiceItem, or failure + error message
 */
export async function deactivateServiceAction(
  id: string,
): Promise<ServiceActionResult> {
  const identity = await getAccountantIdentity();
  if (!identity) {
    return { success: false, error: "Unauthorized: ACCOUNTANT identity required" };
  }

  if (!id) {
    return { success: false, error: "Service id is required" };
  }

  // DECISION (TASK-002-002): deactivateService calls UPDATE active=false — NEVER DELETE.
  // This is enforced at the repository level AND here as defense-in-depth documentation.
  const data = await withRequestContext(
    identity.clerkUserId,
    identity.role,
    () => deactivateService(id),
  );

  revalidatePath("/services");

  return { success: true, data };
}
