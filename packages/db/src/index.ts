/**
 * packages/db/src/index.ts — barrel export for @tax-portal/db
 *
 * Exports exactly these things (ADR-004 § Client shape):
 *   db               — the wrapped request-pool Prisma client (SESSION_CONTEXT set-on-acquire)
 *   adminDb          — the admin-pool Prisma client (RLS-exempt, no SESSION_CONTEXT)
 *   withClerkIdentity — test helper for integration tests (ADR-003 § Consequences)
 *
 * Does NOT export:
 *   requestDb        — the unwrapped request client (ADR-003 §6: import-boundary ESLint rule)
 *
 * Re-exports Prisma types for convenience — consumers import from @tax-portal/db,
 * not from @prisma/client directly, keeping the import surface minimal.
 */

export { db, adminDb } from "./client.js";
export { withClerkIdentity, withRequestContext, currentRequestContext } from "./context.js";

// Re-export Prisma types so consumers don't need to import @prisma/client directly.
// This includes EngagementRequest, Service, User model types, and Prisma namespace.
export type {
  EngagementRequest,
  Service,
  EngagementRequestService,
  User,
  Prisma,
} from "@prisma/client";

// Re-export repositories
export type { CreateEngagementRequestInput, CreateEngagementRequestResult } from "./repositories/engagement-request.js";
export { createEngagementRequest } from "./repositories/engagement-request.js";
export type { ServiceListItem } from "./repositories/service.js";
export { getActiveServices } from "./repositories/service.js";
