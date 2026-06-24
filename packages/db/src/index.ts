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
// QuestionnaireTemplate, QuestionnaireAnswer, EngagementParticipant model types, and Prisma namespace.
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
  // EPIC-012: EngagementParticipant join table (DECISION-D, BRIEF-012 multi-participant engagements)
  // AC-LIFE-012-01/-03, AC-AUTH-007-01/-03
  EngagementParticipant,
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
// getEngagementStatusForAdmin   — admin pool status-only read for admin surface (TASK-008-003, AC-ONBD-006-01 UI)
//
// EPIC-010 lifecycle seam (TASK-010-001):
// transitionEngagementStatus    — accountant-initiated forward transition (admin pool, DECISION-010-C/D/F)
// confirmDelivery               — records delivery confirmation timestamp (admin pool, DECISION-010-A)
// confirmFiling                 — records filing confirmation timestamp (admin pool, DECISION-010-A)
// reopenEngagement              — Complete → In Progress + clear confirms (admin pool, DECISION-010-B)
// LIFECYCLE_ALLOWED_TRANSITIONS — allowed forward edges map (DECISION-010-D)
//
// EPIC-011 attribute seams (TASK-011-002):
// setEngagementDueDate     — accountant-only: set/update/clear dueDate (admin pool, DECISION-011-D)
// setEngagementPriority    — accountant-only: flag/unflag isPriority (admin pool, DECISION-011-D)
// recordEngagementNote     — accountant-only: INSERT EngagementNote (admin pool, DECISION-011-D)
// listEngagementNotes      — REQUEST POOL read; sec.pol_EngagementNote is the gate (CS-TS-001, ADR-005)
//   CLIENT context → ZERO rows (RLS fail-closed); ACCOUNTANT → all notes.
//   MUST be called inside withRequestContext() / withClerkIdentity().
//
// NOT on this barrel (substrate/test-only):
//   recordLetterSignature — admin-pool write that bypasses BLOCK; import from the source module directly.
export type {
  CreateEngagementInput,
  CreateEngagementResult,
  EngagementItem,
  RecordLetterSignatureInput,
  // EPIC-010 lifecycle types
  TransitionEngagementInput,
  TransitionResult,
  ConfirmEngagementInput,
  ConfirmResult,
  // EPIC-011 attribute types (TASK-011-002)
  SetEngagementDueDateInput,
  SetDueDateResult,
  SetEngagementPriorityInput,
  SetPriorityResult,
  RecordEngagementNoteInput,
  RecordNoteResult,
  EngagementNoteItem,
} from "./repositories/engagement.js";
export {
  createEngagement,
  getEngagementForClient,
  getMyEngagement,
  recordLetterSignatureAsClient,
  // Admin-pool status-only read for the admin per-engagement surface (TASK-008-003, AC-ONBD-006-01 UI)
  getEngagementStatusForAdmin,
  // Admin-pool full lifecycle state read (TASK-010-003, AC-LIFE-001-03, AC-LIFE-005-01/-02)
  getEngagementForAdmin,
  // Admin-pool full-visibility engagement list (TASK-010-003, AC-AUTH-002-01/-02)
  listEngagementsForAdmin,
  // EPIC-010 lifecycle seam (TASK-010-001)
  LIFECYCLE_ALLOWED_TRANSITIONS,
  transitionEngagementStatus,
  confirmDelivery,
  confirmFiling,
  reopenEngagement,
  // EPIC-011 attribute seams (TASK-011-002, DECISION-011-D)
  setEngagementDueDate,
  setEngagementPriority,
  recordEngagementNote,
  // REQUEST POOL notes read — RLS is the gate (ADR-005, CS-TS-001; MUST be in withRequestContext)
  listEngagementNotes,
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

// Document repository (EPIC-007 / TASK-007-004 + EPIC-013 / TASK-013-002)
//   Two-phase authorize-then-sign upload/download pipeline (ADR-009).
//
// On this barrel (request-pool reads + actions-layer operations):
//   authorizeEngagementForUpload  — request pool authz (FILTER-governed; 404 on RLS miss)
//   listEngagementDocuments       — request pool read (FILTER-governed; client sees own docs only)
//   authorizeThenSignDownload     — request pool authz → active-only → signed download URL (ADR-009)
//     Both owner + participant reach it via participant-extended fn_document_access (TASK-013-001).
//     AC-FILE-001-03 (owner) + AC-FILE-001-04 (participant) — both-party download gate.
//   listDocumentVersions          — request pool read (sec.pol_DocumentVersion FILTER-governed)
//     AC-FILE-009-02 (current = supersededAt IS NULL) + AC-FILE-009-03 (prior rows retained).
//
// NOT on this barrel (import directly from source module in server actions):
//   insertPendingDocument           — admin pool INSERT (ADR-009 step 2d)
//   completeUpload                  — admin pool promote (scan-before-available gate, ADR-021)
//   getDocumentForOwnershipCheck    — request pool read (FILTER-governed; M1 ownership guard)
//   authorizeAccountantUpload       — admin pool authz (accountant-principal; AC-FILE-001-01)
//   replaceDocumentWithNewVersion   — admin pool write (new DocumentVersion + supersede; DECISION-013-C)
//
// CS-TS-001/-002: request-pool reads go through the db wrapper with SESSION_CONTEXT;
//   admin-pool writes via getAdminPool() inside withAuditTransaction (ADR-019).
export type {
  DocumentItem,
  InsertPendingDocumentInput,
  InsertPendingDocumentResult,
  CompleteUploadInput,
  CompleteUploadResult,
  AuthorizeThenSignDownloadInput,
  AuthorizeThenSignDownloadResult,
  // EPIC-013 / TASK-013-002 types
  AuthorizeAccountantUploadInput,
  ReplaceDocumentInput,
  ReplaceDocumentResult,
  DocumentVersionItem,
} from "./repositories/document.js";
export {
  authorizeEngagementForUpload,
  listEngagementDocuments,
  authorizeThenSignDownload,
  // EPIC-013 / TASK-013-002 exports
  // AC-FILE-009-02/-03: version history read (request pool, RLS-scoped)
  listDocumentVersions,
} from "./repositories/document.js";

// Folder repository (EPIC-013 / TASK-013-002) — folder ops + list
//   createFolder / renameFolder / moveFolder / placeDocumentInFolder: admin pool writes.
//   AC-FILE-010-02: accountant can create/rename/arrange folders.
//   AC-FILE-010-03: document placement in folders.
//   AC-FILE-010-04: folder management is accountant-only (BLOCK on request pool).
//   listEngagementFolders: request pool read (sec.pol_Folder FILTER-governed).
//
// NOT on this barrel (admin-only writes — import directly from source module):
//   createFolder / renameFolder / moveFolder / placeDocumentInFolder
//
// CS-TS-001/-002: listEngagementFolders is the only request-pool read; all writes are admin.
export type {
  FolderItem,
  CreateFolderInput,
  CreateFolderResult,
  RenameFolderInput,
  MoveFolderInput,
  PlaceDocumentInFolderInput,
} from "./repositories/folder.js";
export {
  // AC-FILE-010-01: read folders for the engagement (request pool, RLS-scoped)
  listEngagementFolders,
} from "./repositories/folder.js";

// Document-organization read model (EPIC-013 / TASK-013-002)
//   getTopLevelOrganization: request pool, RLS-scoped.
//   AC-FILE-011-01: Files grouped by engagement.
//   AC-FILE-011-02: Engagements grouped by taxYear.
//   DECISION-013-D: null taxYear → explicit "unspecified" bucket.
//
// CS-TS-001: request pool read via db wrapper with SESSION_CONTEXT.
export type {
  OrgEngagementEntry,
  OrgYearBucket,
  TopLevelOrganization,
} from "./repositories/document-organization.js";
export {
  getTopLevelOrganization,
} from "./repositories/document-organization.js";

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

// Engagement-creation seams (EPIC-012 / TASK-012-002)
// createReturningClientRequest          — pending EngagementRequest for a returning (signed-in) client;
//   contact resolved from on-file User→Engagement→EngagementRequest (AC-DOOR-009-03, DECISION-E).
// createAccountantInitiatedEngagement   — pre-accepted request + Engagement + participant link in one audit tx
//   (AC-DOOR-010-04, AC-LIFE-010-01, AC-LIFE-012-01, DECISION-A).
// findDuplicateEngagements              — QUERY (not a DB constraint) for duplicate (client,service,taxYear)
//   detection (AC-LIFE-011-01/-02, DECISION-C). Override path (AC-LIFE-011-03) must work.
// addEngagementParticipant              — link an additional participant; idempotent on @@unique
//   (AC-LIFE-012-01, AC-AUTH-007-01).
// CS-GEN-001: no PII in audit rows; CS-TS-001/-002: admin pool via getAdminPool()/withAuditTransaction.
export type {
  CreateReturningClientRequestInput,
  CreateReturningClientRequestResult,
  CreateAccountantInitiatedEngagementInput,
  CreateAccountantInitiatedEngagementResult,
  FindDuplicateEngagementsInput,
  DuplicateEngagementMatch,
  AddEngagementParticipantInput,
  AddEngagementParticipantResult,
} from "./repositories/engagement-creation.js";
export {
  UserNotFoundError,
  UserContactNotFoundError,
  createReturningClientRequest,
  createAccountantInitiatedEngagement,
  findDuplicateEngagements,
  addEngagementParticipant,
} from "./repositories/engagement-creation.js";

// Client-facing engagement status label mapping (EPIC-010 / TASK-010-002)
// clientFacingLabel     — maps the four internal stages to the three client-facing labels
//                         (AC-LIFE-002-01/-02/-03, AC-LIFE-004-01/-02/-03, REQ-LIFE-002/-004)
// CLIENT_FACING_LABELS  — the three allowed output label values (read-only constant)
// ClientFacingLabel     — the union type "Received" | "In Progress" | "Completed"
//
// DECISION-010-E: mapping fixed in v1; not accountant-configurable (OQ-002 resolved).
// CS-TS-003: placed in packages/db (shared) so both portal + admin can consume it.
export type { ClientFacingLabel } from "./engagement-label.js";
export { clientFacingLabel, CLIENT_FACING_LABELS } from "./engagement-label.js";

// Onboarding completion engine (EPIC-008 / TASK-008-001)
// isOnboardingComplete           — pure predicate: true iff all three step done flags are true
//                                  (AC-ONBD-005-01/-02). Consumes OnboardingReadModel from onboarding.ts.
// processOnboardingCompletion    — privileged, server-authoritative, fire-once seam (ADR-003).
//                                  Evaluates completion, transitions New → In Progress, inserts
//                                  accountant-only Notification, and records the ADR-019 audit event —
//                                  atomically in ONE transaction (AC-ONBD-006-01/-02/-03,
//                                  AC-ONBD-007-01/-02, AC-MSG-013-04).
// NOTIFICATION_TYPE_ONBOARDING_COMPLETE — "onboarding_completed" type constant; imported by
//                                          TASK-008-003 for the admin notification feed.
// ENGAGEMENT_TRANSITION_ACTION   — "engagement.transition" audit action constant.
export {
  isOnboardingComplete,
  processOnboardingCompletion,
  NOTIFICATION_TYPE_ONBOARDING_COMPLETE,
  ENGAGEMENT_TRANSITION_ACTION,
} from "./onboarding-completion.js";
