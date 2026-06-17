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
// This includes EngagementRequest, Notification, Service, User model types, and Prisma namespace.
export type {
  EngagementRequest,
  Notification,
  Service,
  EngagementRequestService,
  User,
  Prisma,
} from "@prisma/client";

// Re-export repositories
export type {
  CreateEngagementRequestInput,
  CreateEngagementRequestResult,
  EngagementRequestItem,
  EngagementRequestServiceItem,
} from "./repositories/engagement-request.js";
export {
  createEngagementRequest,
  NOTIFICATION_TYPE_NEW_REQUEST,
  listEngagementRequests,
  getEngagementRequest,
  acceptEngagementRequest,
  declineEngagementRequest,
  AlreadyDecidedError,
} from "./repositories/engagement-request.js";
export type {
  ServiceListItem,
  ServiceItem,
  CreateServiceInput,
  UpdateServiceInput,
} from "./repositories/service.js";
export {
  getActiveServices,
  listAllServices,
  createService,
  updateService,
  deactivateService,
} from "./repositories/service.js";

// Notification repository (EPIC-003 — accountant inbox, AC-DOOR-005-03, AC-MSG-013-01)
// createNotification — admin pool insert (called by TASK-003-003 from the portal submit action)
// listNotifications  — request pool read (ACCOUNTANT-only via sec.pol_Notification)
// markNotificationRead — request pool update (marks a notification as read)
export type {
  CreateNotificationInput,
  CreateNotificationResult,
  NotificationItem,
} from "./repositories/notification.js";
export {
  createNotification,
  listNotifications,
  markNotificationRead,
} from "./repositories/notification.js";

// Audit-event write helper (ADR-019)
// recordAuthEvent INSERTs a tamper-evident audit row into the AuditEvent ledger table.
// Actor identity comes from the server-verified session (ADR-003, ADR-019 §2) — NEVER from client input.
export type { AuditActor, RecordAuthEventInput } from "./audit.js";
export { recordAuthEvent, withAuditTransaction } from "./audit.js";

// Admin pool accessor — exported for callers that need to open a raw mssql Transaction
// for same-pool atomic writes (ADR-019 §3 fail-closed — audit INSERT in the same transaction
// as the account-creation mutation). Primarily used by apps/portal sign-up/actions.ts.
// ADR-003 §7: admin pool is allowed for mutations that run outside a request-context scope.
export { getAdminPool, closeAdminPool } from "./admin-connection.js";
