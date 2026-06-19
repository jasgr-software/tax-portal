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
// This includes EngagementRequest, Notification, Service, User, Engagement, LetterTemplate,
// QuestionnaireTemplate, QuestionnaireAnswer model types, and Prisma namespace.
export type {
  EngagementRequest,
  Notification,
  Service,
  EngagementRequestService,
  User,
  Engagement,
  LetterTemplate,
  QuestionnaireTemplate,
  QuestionnaireAnswer,
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
// createEngagement              — admin pool write at accept-time (DECISION-A: clientUserId nullable)
// getEngagementForClient        — request pool read (sec.pol_Engagement FILTER enforces client isolation)
// getMyEngagement               — no-arg request pool read (FILTER returns caller's own row; TASK-005-006)
// recordLetterSignatureAsClient — REQUEST POOL signature write (BLOCK-governed; production path)
//
// NOT on this barrel (substrate/test-only):
//   recordLetterSignature — admin-pool write that bypasses BLOCK; import from the source module directly.
export type {
  CreateEngagementInput,
  CreateEngagementResult,
  EngagementItem,
  RecordLetterSignatureInput,
} from "./repositories/engagement.js";
export {
  createEngagement,
  getEngagementForClient,
  getMyEngagement,
  recordLetterSignatureAsClient,
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

// QuestionnaireTemplate repository (EPIC-006 / TASK-006-001 / TASK-006-003)
// getTemplateForService         — admin pool read (accountant-managed; clients read via admin pool at step 2)
// upsertTemplateForService      — admin pool write (accountant-only; AC-DASH-012-01/-02/-03)
// listTemplates                 — admin pool read (admin UI listing; AC-DASH-012-01/-03)
// getQuestionnaireForEngagement — engagement → primary service type → template (TASK-006-003)
//   Request pool engagement gate (sec.pol_Engagement FILTER) then admin pool template read.
//   engagementId must be server-resolved — never client-supplied (AC-ONBD-003-01).
//   Non-owner → null (FILTER fail-closed, ADR-005). Absent template → { ..., template: null }.
// getMyQuestionnaire            — no-arg FILTER-governed entry for the portal page (TASK-006-003)
//   Mirrors getMyEngagement (TASK-005-006): engagement id resolved server-side under FILTER.
//
// NOT on this barrel (substrate/test-only):
//   submitQuestionnaireAnswer — admin-pool write that bypasses BLOCK; import from source module.
export type {
  QuestionDef,
  QuestionnaireTemplateItem,
  UpsertTemplateInput,
  QuestionnaireForEngagement,
} from "./repositories/questionnaire-template.js";
export {
  getTemplateForService,
  upsertTemplateForService,
  listTemplates,
  getQuestionnaireForEngagement,
  getMyQuestionnaire,
} from "./repositories/questionnaire-template.js";

// QuestionnaireAnswer repository (EPIC-006 / TASK-006-001)
// getMyQuestionnaireAnswer      — request pool read (sec.pol_QuestionnaireAnswer FILTER enforces isolation)
// submitQuestionnaireAsClient   — REQUEST POOL submit write (BLOCK-governed; production path)
//                                 Sets QuestionnaireAnswer row + Engagement.questionnaireSubmittedAt.
//
// NOT on this barrel (substrate/test-only):
//   submitQuestionnaireAnswer — admin-pool write that bypasses BLOCK; import from source module.
export type {
  QuestionnaireAnswerItem,
  SubmitQuestionnaireInput,
} from "./repositories/questionnaire-answer.js";
export {
  getMyQuestionnaireAnswer,
  submitQuestionnaireAsClient,
} from "./repositories/questionnaire-answer.js";

// DocumentRequest repository (EPIC-007 / TASK-007-004)
// listDocumentRequestsForEngagement — request pool read (sec.pol_DocumentRequest FILTER-governed)
//   CLIENT sees own engagement's requests; ACCOUNTANT sees all.
//   Must be called inside withRequestContext() or withClerkIdentity() (ADR-003).
//
// NOT on this barrel (accountant-only writes):
//   createDocumentRequestAsAccountant — admin pool write (BLOCK-governed write for accountant path);
//     import from "./repositories/document-request.js" in server actions.
export type {
  DocumentRequestItem,
  CreateDocumentRequestInput,
} from "./repositories/document-request.js";
export {
  listDocumentRequestsForEngagement,
} from "./repositories/document-request.js";

// Document repository (EPIC-007 / TASK-007-004) — two-phase authorize-then-sign pipeline
// authorizeEngagementForUpload  — request pool authz (FILTER-governed; 404 on RLS miss)
// listEngagementDocuments       — request pool read (FILTER-governed; client sees own docs only)
// authorizeThenSignDownload     — request pool authz → active-only → signed download URL (ADR-009)
//
// NOT on this barrel (import directly from source module in server actions):
//   insertPendingDocument           — admin pool INSERT (ADR-009 step 2d)
//   completeUpload                  — admin pool promote (scan-before-available gate, ADR-021)
//   getDocumentForOwnershipCheck    — request pool read (FILTER-governed; M1 ownership guard)
export type {
  DocumentItem,
  InsertPendingDocumentInput,
  InsertPendingDocumentResult,
  CompleteUploadInput,
  CompleteUploadResult,
  AuthorizeThenSignDownloadInput,
  AuthorizeThenSignDownloadResult,
} from "./repositories/document.js";
export {
  authorizeEngagementForUpload,
  listEngagementDocuments,
  authorizeThenSignDownload,
} from "./repositories/document.js";

// Checklist read model (EPIC-007 / TASK-007-004)
// resolveChecklist — request pool/FILTER-scoped read model; derives outstanding/fulfilled
//   per DocumentRequest based on ≥1 active Document references (AC-FILE-008-01/-02/-03).
//   allRequiredProvided drives the document-upload step done flag in resolveOnboarding (AC-ONBD-004-04).
export type {
  ChecklistItem,
  ChecklistItemStatus,
  ChecklistReadModel,
} from "./checklist.js";
export { resolveChecklist } from "./checklist.js";
