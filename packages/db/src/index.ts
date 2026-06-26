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

// Notification repository (EPIC-003 + EPIC-016 — accountant + client feed)
// EPIC-003 (AC-DOOR-005-03, AC-MSG-013-01):
//   listNotifications   — request pool read (SESSION_CONTEXT gated, RLS enforced)
//   markNotificationRead — request pool update (marks a notification as read by id)
// EPIC-016 / TASK-016-002 (additive — CS-GEN-002):
//   countUnreadNotifications              — derived unread count (readAt IS NULL) via request pool (AC-MSG-017-02)
//   markNotificationsReadByLinkedItem     — per-principal mark-read keyed on linked-item pair (AC-MSG-015-02/-03)
//   emitNotification                      — admin pool INSERT; server-side emit helper used by TASK-016-004
//   EmitNotificationInput/Result          — input/result types for emitNotification
// EPIC-016 / TASK-016-004 (additive — CS-GEN-002):
//   emitAndPublishNotification            — convenience wrapper: emit + real-time publish (ADR-023)
// NOTE: createNotification removed — TASK-003-003 inlined the INSERT into createEngagementRequest.
// CS-GEN-003: governing keys cited in source and here. // CS-GEN-003
export type {
  NotificationItem,
  EmitNotificationInput,
  EmitNotificationResult,
  MarkReadByLinkedItemInput,
} from "./repositories/notification.js";
export {
  listNotifications,
  markNotificationRead,
  countUnreadNotifications,
  markNotificationsReadByLinkedItem,
  emitNotification,
  // EPIC-016 / TASK-016-004: convenience wrapper — emit + real-time publish in one call.
  // CS-GEN-002: additive export; existing exports unchanged. // CS-GEN-002
  emitAndPublishNotification,
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

// Document repository (EPIC-007 / TASK-007-004 + EPIC-013 / TASK-013-002 + EPIC-014 / TASK-014-002)
//   Two-phase authorize-then-sign upload/download pipeline (ADR-009).
//
// On this barrel (request-pool reads + actions-layer operations):
//   authorizeEngagementForUpload  — request pool authz (FILTER-governed; 404 on RLS miss)
//   listEngagementDocuments       — request pool read (FILTER-governed; client sees own docs only)
//     EPIC-014: opts.includeDeleted — working view (default) vs archive view split (DECISION-014-E)
//   listDeletedDocuments          — ACCOUNTANT/admin-pool reader: only deletedAt IS NOT NULL rows
//     (the recover/archive surface consumed by TASK-014-003). // AC-FILE-006-01 // AC-FILE-006-03
//   authorizeThenSignDownload     — request pool authz → active-only → signed download URL (ADR-009)
//     Both owner + participant reach it via participant-extended fn_document_access (TASK-013-001).
//     AC-FILE-001-03 (owner) + AC-FILE-001-04 (participant) — both-party download gate.
//   listDocumentVersions          — request pool read (sec.pol_DocumentVersion FILTER-governed)
//     AC-FILE-009-02 (current = supersededAt IS NULL) + AC-FILE-009-03 (prior rows retained).
//   softDeleteDocument            — ADMIN POOL write; sets deletedAt tombstone; UPDATE-only (ADR-018 §1)
//     audit event 'document.deleted' in-txn (ADR-019). // DECISION-014-D // AC-FILE-004-01
//   recoverDocument               — ADMIN POOL write; clears deletedAt; audit 'document.recovered'.
//     // DECISION-014-D // AC-FILE-006-03 // AC-FILE-005-02
//   retentionDeadlineFor          — pure function: completedAt + RETENTION_WINDOW_YEARS
//     // ADR-018 §3 // DECISION-014-F // AC-FILE-005-01 // AC-NFR-006-01
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
  // EPIC-014 / TASK-014-002 types
  SoftDeleteDocumentInput,
  SoftDeleteDocumentResult,
  RecoverDocumentInput,
  RecoverDocumentResult,
  ListEngagementDocumentsOptions,
} from "./repositories/document.js";
export {
  authorizeEngagementForUpload,
  listEngagementDocuments,
  // EPIC-014 / TASK-014-002: archive-view read (only soft-deleted docs; accountant recover surface)
  listDeletedDocuments,
  authorizeThenSignDownload,
  // EPIC-013 / TASK-013-002 exports
  // AC-FILE-009-02/-03: version history read (request pool, RLS-scoped)
  listDocumentVersions,
  // EPIC-014 / TASK-014-002: soft-delete + recover seams (admin pool, audited, UPDATE-only)
  // AC-FILE-004-01: accountant can soft-delete; AC-FILE-006-02/-03: row+bytes survive; recoverable.
  softDeleteDocument,
  recoverDocument,
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

// Retention clock (EPIC-014 / TASK-014-002 — ADR-018 §3, DECISION-014-F)
//   RETENTION_WINDOW_YEARS   — configurable constant (default 7; env-overridable via RETENTION_WINDOW_YEARS)
//   retentionDeadlineFor     — pure function: completedAt + RETENTION_WINDOW_YEARS years; null if no completedAt.
//     AC-FILE-005-01: retained ≥7 years from completion. AC-NFR-006-01: system-enforced, not manual.
//   setEngagementCompleted   — idempotent stamp: completedAt = SYSDATETIMEOFFSET() when IS NULL.
//     Wired into transitionEngagementStatus (Review → Complete path). ADR-018 §3 / DECISION-014-F.
//     NOT on this barrel for action callers — import from the source module if needed outside packages/db.
export type {
  RetentionEngagementInput,
  SetEngagementCompletedInput,
  SetEngagementCompletedResult,
} from "./repositories/retention.js";
export {
  RETENTION_WINDOW_YEARS,
  retentionDeadlineFor,
} from "./repositories/retention.js";

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

// Legal-hold repository (EPIC-015 / TASK-015-001 — ADR-018 §6 / ADR-005)
// Accountant-only legal-hold place/lift/read seam — the purge blocker (ADR-018 §6).
//
// ACCOUNTANT-ONLY: no client-facing read, insert, update, or delete path to LegalHold.
// RLS policy: sec.pol_LegalHold (Track B: db/policies/0013-legal-hold-policy.sql).
//   CLIENT → ZERO rows (fail-closed). ACCOUNTANT/admin → all rows.
//
// placeLegalHold — ADMIN POOL write; inserts hold (scope='engagement'|'client'); audit 'legal_hold.placed'.
//   Idempotent: if an active hold already exists for the same scope/target, returns 'already-held'.
//   AC-FILE-014-01 (engagement-scoped) + AC-FILE-014-02 (client-scoped).
//   AC-FILE-014-06: placing is audited (who, on what, when).
//
// liftLegalHold — ADMIN POOL write; sets liftedAt + liftedByClerkId; audit 'legal_hold.lifted'.
//   Idempotent: already-lifted hold returns 'already-lifted'.
//   AC-FILE-014-05: lifting restores purge eligibility iff window elapsed.
//   AC-FILE-014-07: lifting is audited (who, on what, when).
//
// activeHoldsFor(engagementId) — ADMIN POOL read; returns all active holds for an engagement.
//   Resolves BOTH scopes: direct engagement holds AND client-scoped holds (via engagement.clientUserId).
//   An empty result means the engagement is not held and may be purge-eligible (if window elapsed).
//   TASK-015-002 consumes this for purge-eligibility derivation.
//   AC-FILE-014-02: client-scoped hold covers ALL of that client's engagements.
//   AC-FILE-014-03: an active hold blocks purge even post-expiry.
//   AC-FILE-014-04: active hold = liftedAt IS NULL (no auto-expire — no TTL column).
//
// CS-TS-001/-002: admin pool via getAdminPool inside withAuditTransaction.
// CS-GEN-001: no PII in audit rows (targetId = holdId only).
// CS-GEN-002: additive — new repository; no existing repository modified.
// CS-SQL-001: the LegalHold table ships sec.pol_LegalHold + legal-hold.rls.test.ts (HARD GATE).
export type {
  LegalHoldItem,
  PlaceLegalHoldInput,
  PlaceLegalHoldResult,
  LiftLegalHoldInput,
  LiftLegalHoldResult,
} from "./repositories/legal-hold.js";
export {
  // AC-FILE-014-01/-02/-06: place engagement-scoped or client-scoped hold (admin pool, audited)
  placeLegalHold,
  // AC-FILE-014-05/-07: lift a hold (admin pool, audited); restores eligibility iff window elapsed
  liftLegalHold,
  // AC-FILE-014-02/-03/-04: read active holds for eligibility derivation (admin pool read)
  activeHoldsFor,
} from "./repositories/legal-hold.js";

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

// Purge-eligibility derivation + admin-pool confirmed purge (EPIC-015 / TASK-015-002 — ADR-018 §5/§6)
//
// purgeEligibility — PURE function: derives eligibility from retentionDeadlineFor + activeHolds.
//   Precedence: (1) blocked-by-hold → (2) in-window / not-completed → (3) eligible.
//   Eligibility is computed, never stored; expiry creates eligibility ONLY (never auto-purge).
//   ADR-018 §5/§6 / AC-FILE-013-01/-04 / AC-FILE-014-03/-05 / AC-FILE-015-02
//
// purgeEngagement — ADMIN POOL write; confirmed, never-automatic physical DELETE of
//   DocumentVersion + Document rows + storage bytes (ADR-009 two-track lifecycle).
//   Re-resolves eligibility server-side inside the transaction (never trusts caller eligibility).
//   Emits 'engagement.purged' audit event in the same transaction (ADR-019 §3 fail-closed).
//   AuditEvent is EXCLUDED from the purge sweep (ADR-019 §5 / AC-NFR-010-07).
//   TEMPORAL-HISTORY deferral under OQ-014-01: no _History side-rows purged (none exist yet).
//   NEVER-AUTOMATIC: no cron/scheduled/auto-trigger; confirmed=true required (AC-FILE-013-03/-04).
//   ADMIN-POOL ONLY: no client request handler or client principal can reach this function.
//   AC-FILE-013-01/-02/-03/-04/-05/-06 / AC-FILE-014-03 / AC-FILE-015-01/-02 / AC-NFR-010-07
//
// CS-TS-001/-002: admin pool only via getAdminPool inside withAuditTransaction.
// CS-SQL-001: no client principal can reach the physical DELETE path (purge.rls.test.ts).
// CS-SQL-002: physical DELETE is on the raw-SQL / admin-pool track (Prisma cannot express it).
// CS-GEN-001: no PII in audit rows (targetId = engagementId only).
export type {
  PurgeEligibilityResult,
  PurgeEngagementInput,
  PurgeEngagementResult,
} from "./repositories/purge.js";
export {
  // Pure eligibility derivation (ADR-018 §3/§5/§6 — no DB, reuses retentionDeadlineFor + holds input)
  // AC-FILE-013-01/-04 / AC-FILE-014-03/-05 / AC-FILE-015-02
  purgeEligibility,
  // Admin-pool confirmed purge (ADR-018 §5 / ADR-019 / ADR-009)
  // AC-FILE-013-01/-02/-03/-04/-05/-06 / AC-FILE-014-03 / AC-FILE-015-01/-02 / AC-NFR-010-07
  purgeEngagement,
} from "./repositories/purge.js";

// Thread repository (EPIC-017 / TASK-017-002 — per-engagement + general messaging spine)
//
// Write functions (admin pool — server-authoritative):
//   getOrCreateEngagementThread  — idempotent: gets or creates the one engagement thread.
//     Concurrent calls yield exactly one thread (@@unique[engagementId] + catch-and-re-read).
//     AC-MSG-001-01.
//   createGeneralThread          — accountant-initiated direct thread for a client (kind='general').
//     AC-MSG-006-01.
//   archiveEngagementThread      — idempotent: flips Thread.status='archived' when engagement closes.
//     TASK-017-007: wired additively inside transitionEngagementStatus post-commit Complete block.
//     ADR-018 tier-3: archive = state flip, NOT delete; threads retained indefinitely.
//     AC-MSG-006-01/-02/-03.
//
// Read functions (request pool — RLS-governed via sec.pol_Thread):
//   getThreadForEngagement       — returns the thread for an engagement, or null if absent.
//     AC-MSG-001-02: visible only to participants (RLS is the gate).
//   getGeneralThreadsForClient   — returns general threads for a given clientUserId.
//     AC-MSG-006-01/-02: visible only to that client + accountant (RLS is the gate).
//   listThreadMessages           — returns messages ordered by createdAt ASC (request pool).
//     Body is returned verbatim — no transformation (AC-MSG-003-01/-02).
//     AC-MSG-001-03 / AC-MSG-002-03.
//
// DECISION-017-002-A: reads do NOT add a WHERE clause on top of RLS (policy is the boundary).
//   Critically: archived threads are NOT filtered by status in the read path (AC-MSG-006-03).
// DECISION-017-002-B: getOrCreateEngagementThread catches SQL Server unique-violation (2627/2601)
//   and re-reads — the @@unique index is the sole constraint enforcement point.
// DECISION-017-007-A: archivedAt stamped via SYSDATETIMEOFFSET() at DB level in archiveEngagementThread.
//
// CS-TS-001: request-pool reads go through the db wrapper (SESSION_CONTEXT).
// CS-TS-002: admin pool via getAdminPool() inside packages/db only.
// CS-GEN-001: message bodies must not be logged.
// CS-GEN-002: additive — new repository; no existing export removed or narrowed. // CS-GEN-002
// CS-GEN-003: governing keys cited in source and here. // CS-GEN-003
export type {
  ThreadItem,
  MessageItem,
  GetOrCreateEngagementThreadInput,
  CreateGeneralThreadInput,
} from "./repositories/thread.js";
export {
  // AC-MSG-001-01: idempotent get-or-create (admin pool, concurrent-safe)
  getOrCreateEngagementThread,
  // AC-MSG-006-01: accountant-initiated general thread (admin pool)
  createGeneralThread,
  // TASK-017-007 / AC-MSG-006-01/-02/-03: archive engagement thread on close (admin pool, idempotent)
  // ADR-018 tier-3: state flip only; threads retained indefinitely.
  archiveEngagementThread,
  // AC-MSG-001-02: request pool read — sec.pol_Thread FILTER is the gate
  getThreadForEngagement,
  // AC-MSG-002-02/-003 / AC-MSG-001-04: general-thread read by Thread.id (request pool, RLS-governed)
  // IDOR gate: non-participant resolving another client's threadId gets null (DECISION-017-002-A).
  // Used by /messages/[threadId] route on both surfaces (TASK-017-011). // CS-TS-001 // ADR-005
  getThreadById,
  // AC-MSG-006-01/-02: request pool read — general threads for a client
  getGeneralThreadsForClient,
  // AC-MSG-001-03 / AC-MSG-002-03: ordered message history (request pool, verbatim body)
  listThreadMessages,
} from "./repositories/thread.js";

// Message repository (EPIC-017 / TASK-017-002 + TASK-017-003 — server-authoritative message append)
//
// appendMessage — ADMIN POOL write; inserts a Message row with verbatim body.
//   Returns { id, threadId } so the attachment task (TASK-017-004) can relate rows.
//   Body is stored VERBATIM — no server-side transform (AC-MSG-003-01/-02 / REQ-MSG-003).
//   CS-GEN-001: body must never be logged.
//   AC-MSG-002-01/-02: message appended with sender + plain-text body.
// TASK-017-003 additive: after INSERT, emits recipient-only new-message notifications:
//   AC-MSG-013-02: CLIENT sender → ACCOUNTANT notified; sender not notified.
//   AC-MSG-014-01: ACCOUNTANT sender → CLIENT(s) notified; sender not notified.
//   CS-GEN-002: additive post-write; appendMessage signature unchanged.
//
// CS-TS-002: admin pool via getAdminPool() inside packages/db only.
// CS-GEN-002: additive — new repository; no existing export removed or narrowed. // CS-GEN-002
// CS-GEN-003: governing keys cited in source and here. // CS-GEN-003
export type {
  AppendMessageInput,
  AppendMessageResult,
} from "./repositories/message.js";
export {
  // AC-MSG-002-01/-02 / AC-MSG-003-01/-02: append plain-text message (admin pool, verbatim body)
  // AC-MSG-013-02 / AC-MSG-014-01: recipient-only new-message notification emitted post-write
  appendMessage,
  // Security fix (EPIC-017 fixer / B2): request-pool existence check — messageId belongs to threadId
  // Must be called inside withRequestContext(); RLS FILTER is the enforcement gate (ADR-005).
  // Returns false for non-participants (fail-closed) and for a wrong messageId↔threadId binding.
  verifyMessageInThread,
} from "./repositories/message.js";

// ThreadReadState repository (EPIC-017 / TASK-017-003 + TASK-017-005 — per-viewer watermark + unread read-model)
//
// markThreadRead — REQUEST POOL upsert; sets lastReadAt = now for the current SESSION_CONTEXT viewer.
//   The BLOCK predicate on sec.pol_ThreadReadState enforces own-row-only writes.
//   A viewer can only upsert their own (threadId, userId) watermark row.
//   Must be called inside withRequestContext() / withClerkIdentity().
//   AC-MSG-005-04: viewer's unread indicator is cleared by setting lastReadAt = now.
//
// listThreadsWithUnread — REQUEST POOL read; returns all threads visible to the SESSION_CONTEXT viewer
//   (sec.pol_Thread FILTER is the gate; no extra WHERE added — DECISION-017-002-A), each decorated
//   with a derived `hasUnread` boolean (DECISION-017-005-A / DECISION-017-A).
//   hasUnread = EXISTS(message m WHERE m.createdAt > viewer.lastReadAt AND m.senderClerkId <> viewer)
//   A viewer with no ThreadReadState row yet and messages from others → hasUnread=true (initial state).
//   Per-viewer: each caller's SESSION_CONTEXT resolves their own read state independently.
//   Covers both 'engagement' and 'general' thread kinds uniformly (AC-MSG-005-02).
//   Must be called inside withRequestContext() / withClerkIdentity().
//   AC-MSG-005-01/-02/-03/-04.
//
// CS-TS-001: request pool via db wrapper (SESSION_CONTEXT set by middleware). // CS-TS-001
// ADR-003: SESSION_CONTEXT propagated via withRequestContext / withClerkIdentity. // ADR-003
// ADR-005: sec.pol_Thread / sec.pol_ThreadReadState are the enforcement boundaries. // ADR-005
// CS-GEN-001: message bodies never selected or returned — only createdAt/senderClerkId touched. // CS-GEN-001
// CS-GEN-002: additive — new types + function; no existing export removed or narrowed. // CS-GEN-002
// CS-GEN-003: governing keys cited in source and here. // CS-GEN-003
export type {
  MarkThreadReadResult,
  // EPIC-017 / TASK-017-005: per-viewer unread read-model type (AC-MSG-005-01/-02/-03/-04)
  ThreadWithUnread,
} from "./repositories/thread-read.js";
export {
  // AC-MSG-005-04: set per-viewer lastReadAt watermark (request pool, own-row RLS-governed)
  markThreadRead,
  // AC-MSG-005-01/-02/-03/-04: per-viewer unread read-model (request pool, RLS-governed)
  listThreadsWithUnread,
} from "./repositories/thread-read.js";

// MessageAttachment repository (EPIC-017 / TASK-017-004 — scan-before-available + participant-scoped signed-URL)
//
// storeAndScanAttachment — ADMIN POOL: put bytes → scan → promote active/infected/stay-pending.
//   Reuses EPIC-007 FileScanner + EPIC-013 validateUploadedBytes / MAX_FILE_SIZE_BYTES seams.
//   REQ-NFR-009: scan-before-available gate — only 'clean' verdict promotes to 'active'.
//   'indeterminate' → stays 'pending' (fail-closed; NOT a pass). 'infected' → terminal.
//
// authorizeThenSignAttachment — REQUEST POOL (RLS): resolve attachment + assert participant +
//   status='active', then sign the SERVER-RESOLVED storage key. Never signs a caller-supplied key.
//   IDOR defence (EPIC-013 lesson): attachmentId → RLS resolve → assert participant → mint.
//   ADR-008/-009: TTL-capped; authorize-before-mint; URL NEVER logged (CS-GEN-001).
//
// listMessageAttachments — REQUEST POOL: list attachments for a message (RLS sec.pol_MessageAttachment).
//
// AC-MSG-004-01/-02/-03/-04/-05. ADR-008/-009/-021. REQ-NFR-009. CS-GEN-001.
// CS-GEN-002: additive — new repository; no existing export removed or narrowed. // CS-GEN-002
// CS-GEN-003: governing keys cited in source and here. // CS-GEN-003
export type {
  MessageAttachmentItem,
  StoreAndScanAttachmentInput,
  StoreAndScanAttachmentResult,
  AuthorizeThenSignAttachmentInput,
  AuthorizeThenSignAttachmentResult,
} from "./repositories/message-attachment.js";
export {
  // AC-MSG-004-01 / AC-MSG-004-05: store bytes + scan-before-available gate (admin pool)
  storeAndScanAttachment,
  // AC-MSG-004-03: participant-scoped signed-URL retrieval (request pool, RLS IDOR-defended)
  authorizeThenSignAttachment,
  // AC-MSG-004-02: list attachments visible to the current participant (request pool)
  listMessageAttachments,
} from "./repositories/message-attachment.js";

// Client read model (EPIC-017 / TASK-017-010 — listClients for admin StartGeneralThread selector)
//
// listClients — admin pool, RLS-exempt: distinct CLIENT users (User.role='CLIENT') reachable
//   via Engagement.clientUserId, with display identity joined from EngagementRequest.
//   Mirrors listEngagementsForAdmin join shape (User → Engagement → EngagementRequest).
//   DECISION-E: names live on EngagementRequest, NOT on the User model.
//   ADMIN SURFACE ONLY — apps/portal has no client-listing path (ADR-006).
//   Returns empty array when no clients exist (or no non-null clientUserId Engagements).
//
// AC-MSG-002-01: populates the StartGeneralThread selector (accountant can pick a client).
// AC-MSG-002-02: the resulting thread is associated with the chosen client.
// ADR-003 §7: admin pool — RLS-exempt for accountant-surface reads.
// ADR-006: admin surface only.
// CS-GEN-001: names/emails NEVER logged.
// CS-GEN-002: additive — new export; no existing export removed or narrowed.
export type { ClientItem } from "./repositories/client.js";
export {
  // AC-MSG-002-01: admin pool read for the StartGeneralThread selector (accountant-only)
  listClients,
} from "./repositories/client.js";

// Email-digest repository (EPIC-018 / TASK-018-002 + TASK-018-003 — digest preference + dispatcher)
//
// getDigestRecipients      — ADMIN POOL: returns principals eligible for today's nudge.
//   Criteria: ≥1 unread Notification + emailNudgeEnabled=true + not yet nudged today (UTC cal-day).
//   SELECT-only on Notification — never writes the feed (AC-MSG-010-03). // AC-MSG-010-03
//   CS-TS-002: admin pool via getAdminPool() inside packages/db only. // CS-TS-002
//
// recordNudgeSent          — ADMIN POOL: watermarks lastNudgeSentAt after a successful send.
//   Idempotent for the day: re-running same-day sentAt keeps recipient out of next candidate set.
//   CS-TS-002: admin pool via getAdminPool() inside packages/db only. // CS-TS-002
//
// getEmailNudgePreferenceForCurrentUser — REQUEST POOL: reads caller's own emailNudgeEnabled.
//   AC-MSG-011-01: default-on (DB BIT DEFAULT 1); returns true if row absent. // AC-MSG-011-01
//   CS-TS-001: request pool via db wrapper (SESSION_CONTEXT set by middleware). // CS-TS-001
//
// setEmailNudgePreferenceForCurrentUser — REQUEST POOL: writes caller's own emailNudgeEnabled.
//   Own-row isolation via WHERE clerkId = caller's clerkId (no sec.pol_User BLOCK predicate).
//   Role guard (accountant-only) lives in the server action (TASK-018-004, CS-TS-004).
//   CS-TS-001: request pool via db wrapper (SESSION_CONTEXT set by middleware). // CS-TS-001
//   CS-TS-003: shared primitive for both portal + admin surfaces. // CS-TS-003
//
// dispatchDailyDigest      — ADMIN POOL batch dispatcher (TASK-018-003):
//   Composes getDigestRecipients + composeDigestNudge + getEmailProvider().send + recordNudgeSent.
//   At most one send per recipient per day (cap + suppression applied upstream in candidate query).
//   Returns { sentCount } — count only, no recipient identity (CS-GEN-001).
//   ADR-025: send only via the EmailProvider port — no ESP SDK at the call site.
//   DECISION-018-003-A: skip recordNudgeSent on send failure (recipient retries next run).
//   DECISION-018-003-B: ADR-006 sign-in URL by role.
//   AC-MSG-008-02: content-free body guaranteed by composeDigestNudge.
//   AC-MSG-009-01/-02/-03: one email per day; cap enforced by watermark.
//   AC-MSG-010-02/-03/-04: suppression and feed-intact guarantees.
//
// CS-GEN-001: no recipient email / identity in logs. // CS-GEN-001
// CS-GEN-002: additive — new exports; no existing export removed or narrowed. // CS-GEN-002
// CS-GEN-003: governing keys cited in source and here. // CS-GEN-003
// DECISION-018-002-A: calendar-day UTC boundary for the daily-cap predicate.
export type {
  DigestRecipient,
  // TASK-018-003: dispatcher result type
  DigestDispatchResult,
} from "./repositories/email-digest.js";
export {
  // AC-MSG-010-03: SELECT-only candidate query; AC-MSG-011-01: default-on included
  getDigestRecipients,
  // Watermarks lastNudgeSentAt after dispatch (CS-TS-002 admin pool)
  recordNudgeSent,
  // Request-pool own-preference reads (CS-TS-001, AC-MSG-011-01 default-on)
  getEmailNudgePreferenceForCurrentUser,
  // Request-pool own-preference write (CS-TS-001, CS-TS-003)
  setEmailNudgePreferenceForCurrentUser,
  // TASK-018-003: daily-digest dispatcher (admin pool, ADR-025 email port)
  // AC-MSG-008-02 / AC-MSG-009-01/-02/-03 / AC-MSG-010-02/-03/-04
  dispatchDailyDigest,
} from "./repositories/email-digest.js";

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
