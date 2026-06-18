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
// This includes EngagementRequest, Notification, Service, User, Engagement, LetterTemplate
// model types, and Prisma namespace.
export type {
  EngagementRequest,
  Notification,
  Service,
  EngagementRequestService,
  User,
  Engagement,
  LetterTemplate,
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
// listNotifications  — request pool read (ACCOUNTANT-only via sec.pol_Notification)
// markNotificationRead — request pool update (marks a notification as read)
// NOTE: createNotification removed — TASK-003-003 inlined the INSERT into createEngagementRequest.
export type { NotificationItem } from "./repositories/notification.js";
export { listNotifications, markNotificationRead } from "./repositories/notification.js";

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

// Engagement repository (EPIC-005 / TASK-005-001 — first client-owned-rows entity)
// createEngagement            — admin pool write at accept-time (DECISION-A: clientUserId nullable)
// getEngagementForClient      — request pool read (sec.pol_Engagement FILTER enforces client isolation)
// getEngagementByRequestId    — request pool read by engagementRequestId
// recordLetterSignature       — admin-pool signature write (substrate/tests; bypasses BLOCK)
// recordLetterSignatureAsClient — REQUEST POOL signature write (BLOCK-governed; production path)
export type {
  CreateEngagementInput,
  CreateEngagementResult,
  EngagementItem,
  RecordLetterSignatureInput,
} from "./repositories/engagement.js";
export {
  createEngagement,
  getEngagementForClient,
  getEngagementByRequestId,
  recordLetterSignature,
  recordLetterSignatureAsClient,
  updateEngagementClientUserId,
} from "./repositories/engagement.js";

// Onboarding read model (EPIC-005 / TASK-005-005)
// resolveOnboarding      — derives ordered steps + accessibility + position from EngagementItem
// checkStepAccessibility — server-side hard gate: refuses locked steps (AC-ONBD-001-02/-002-01/-02)
export type {
  OnboardingStepKey,
  OnboardingStep,
  OnboardingReadModel,
  StepRefusal,
} from "./onboarding.js";
export { resolveOnboarding, checkStepAccessibility } from "./onboarding.js";

// LetterTemplate repository (EPIC-005 / TASK-005-001)
// getCurrentLetterTemplate — admin pool read (accountant + system; not client-readable)
// updateLetterTemplate     — admin pool write (accountant-only; AC-IDNT-007-02)
export type {
  LetterTemplateItem,
  UpdateLetterTemplateInput,
} from "./repositories/letter-template.js";
export { getCurrentLetterTemplate, updateLetterTemplate } from "./repositories/letter-template.js";
