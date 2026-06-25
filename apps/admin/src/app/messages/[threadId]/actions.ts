/**
 * apps/admin/src/app/messages/[threadId]/actions.ts
 *
 * Server actions for the admin (ACCOUNTANT) general-thread view — /messages/[threadId].
 *
 * TASK-017-011: Read + send + mark-read for the ACCOUNTANT general-thread view.
 *   The admin surface already has sendGeneralMessageAction, markGeneralThreadReadAction,
 *   attachGeneralMessageAction, and requestGeneralAttachmentUrlAction in
 *   apps/admin/src/app/messages/actions.ts. This file re-exports them for the route,
 *   keeping the import graph consistent with the portal mirror pattern.
 *
 * Re-exporting avoids duplicating action code and keeps the actions.ts file at the
 * messages level as the single source of truth for all admin general-thread mutations.
 *
 * Acceptance criteria:
 *   AC-MSG-002-02 — general thread visible to the accountant AND the associated client.
 *   AC-MSG-002-03 — ordered message history readable by both participants.
 *   AC-MSG-001-04 — both parties can read + contribute (ACCOUNTANT sends here).
 *   AC-MSG-005-04 — marking a thread read clears the viewer's unread indicator.
 *   AC-MSG-004-01 — sender attaches one+ files to a message.
 *   AC-MSG-004-03 — participants retrieve attachments via signed URL.
 *   AC-MSG-004-05 — attachments scanned before available; infected/indeterminate withheld.
 *
 * ADR-003: identity guard in each action (getAccountantIdentity before DB access). // ADR-003
 * ADR-005: RLS is the sole enforcement boundary (sec.pol_Thread / pol_ThreadReadState). // ADR-005
 * ADR-006: admin surface ONLY — re-exporting actions from the admin messages barrel. // ADR-006
 * CS-TS-001: request-pool operations via withRequestContext (in source module). // CS-TS-001
 * CS-TS-002: no raw adminDb/pool import in this file. // CS-TS-002
 * CS-TS-003: mirrors apps/portal/src/app/messages/[threadId]/actions.ts. // CS-TS-003
 * CS-GEN-003: governing keys cited throughout. // CS-GEN-003
 *
 * // AC-MSG-002-02 // AC-MSG-002-03 // AC-MSG-001-04 // AC-MSG-005-04
 * // AC-MSG-004-01 // AC-MSG-004-03 // AC-MSG-004-05
 * // ADR-003 // ADR-005 // ADR-006 // CS-TS-001 // CS-TS-002 // CS-TS-003 // CS-GEN-003
 */

// Re-export from the admin messages actions barrel (single source of truth for admin general-thread mutations).
// CS-TS-003: mirrors the portal general-thread actions pattern. // CS-TS-003
// ADR-006: admin surface only — ACCOUNTANT identity is enforced in each action. // ADR-006
export {
  sendGeneralMessageAction,
  markGeneralThreadReadAction,
  attachGeneralMessageAction,
  requestGeneralAttachmentUrlAction,
} from "../actions";

export type {
  SendGeneralMessageResult,
  MarkGeneralThreadReadResult,
  AttachGeneralMessageResult,
  RequestGeneralAttachmentUrlResult,
} from "../actions";
