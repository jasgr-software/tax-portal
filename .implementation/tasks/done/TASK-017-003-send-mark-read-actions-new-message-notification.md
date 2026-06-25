---
brief: BRIEF-017
status: done
assigned_to: webapp-developer
updated_by: sdet
depends_on: TASK-017-002
impl: developer
e2e_required: "no"
started_at: 2026-06-25T13:37:57.581Z
completed_at: 2026-06-25T19:17:10.435Z
complexity_estimate: 4
complexity_actual: 4
brief_type: feature
brief_deploys: "no"
introduces_gate: "no"
acceptance_criteria: [AC-MSG-001-02, AC-MSG-001-04, AC-MSG-005-04, AC-MSG-013-02, AC-MSG-014-01]
upstream_refs: [REQ-MSG-001, REQ-MSG-005, REQ-MSG-013, REQ-MSG-014, ADR-003, ADR-005, ADR-006, ADR-023, EPIC-016]
code_standards: CS-TS-001 (required), CS-TS-002 (required), CS-TS-003 (recommended), CS-TS-004 (experimental), CS-GEN-001 (recommended), CS-GEN-002 (recommended), CS-GEN-003 (recommended)
reviewer: sdet
---

# TASK-017-003: Server actions — send-message (+ recipient-only new-message notification), mark-read, start-general-thread — BOTH surfaces

---

## Quality Gates

- [x] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [x] **Submission gate** — lint + type-check + build + brief-mandated tests pass (commands in CLAUDE.md)
- [N/A] **Targeted e2e** — _(N/A here — the notification + send/read journeys are exercised e2e in TASK-017-007/-008)_
- [x] **Security review** — injection / XSS / auth bypass / sensitive data exposure verified
- [ ] **SDET Review** — approved

## SDET Review focus areas

- **Recipient-only new-message notification onto the EPIC-016 spine (the EPIC-016-deferred source event).** Sending a message emits **exactly one** new-message notification to the **recipient(s)** through `emitAndPublishNotification` — the **accountant** when a client sends (AC-MSG-013-02), the **client** when the accountant sends (AC-MSG-014-01). Verify the **recipient-only entitlement holds**: no cross-participant leak; the sender is never self-notified; on a multi-participant engagement each non-sender participant is notified, the sender is not. Reuse the spine — do NOT rebuild feed/badge/real-time.
- **CS-TS-004 (experimental) — every server action resolves identity from the request cookie and guards role before any DB write.** `send-message`, `mark-read`, and especially `start-general-thread` (**accountant-only** — role-guarded; a CLIENT call is refused) must derive identity from the verified session only, never from args/form data. Mirror the `getClientIdentity()` pattern in the existing documents `actions.ts`.
- **Cross-surface parity (CS-TS-003 / ADR-006).** send + mark-read exist on **both** `apps/portal` and `apps/admin`; `start-general-thread` is `apps/admin` ONLY. Mirror discipline between surfaces.
- **Additive notification wiring (CS-GEN-002)** — emit rides post-write, fire-and-not-blocking, no change to the EPIC-016 emit seam.

## Context

Wires the write surface: send a plain-text message (both parties — AC-MSG-001-04), mark a thread read for the viewer (AC-MSG-005-04 clears that viewer's unread), and start a general thread (accountant-only). Sending raises the recipient-only new-message notification — the source event EPIC-016 explicitly deferred to this slice (AC-MSG-013-02 / -014-01).

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `packages/db/src/repositories/thread-read.ts` | Create | `markThreadRead(threadId)` — request-pool upsert of `ThreadReadState(threadId, viewer, lastReadAt=now)` (RLS-governed own-row write) |
| `packages/db/src/repositories/message.ts` | Modify | After `appendMessage`, resolve the **other** participant(s) and `emitAndPublishNotification` (recipient-only) — admin-pool, post-write, additive |
| `apps/portal/src/app/engagements/[engagementId]/messages/actions.ts` | Create | portal: `sendMessageAction`, `markThreadReadAction` (CLIENT identity guard) |
| `apps/admin/src/app/engagements/[engagementId]/messages/actions.ts` | Create | admin: `sendMessageAction`, `markThreadReadAction` (ACCOUNTANT identity guard) |
| `apps/admin/src/app/messages/actions.ts` | Create | admin-only `startGeneralThreadAction` (ACCOUNTANT-only role guard) + general-thread send/mark-read |
| `packages/db/src/index.ts` | Modify | Export `markThreadRead` + `MarkThreadReadResult` from new `thread-read.ts`; update message.ts barrel comment for notification emission |
| `apps/portal/src/app/engagements/[engagementId]/messages/actions.test.ts` | Create | unit/integration — identity guard, send→1-notification-to-accountant |
| `apps/admin/src/app/engagements/[engagementId]/messages/actions.test.ts` | Create | unit/integration — identity guard, send→1-notification-to-client, start-general-thread CLIENT-refused |

## Tests to Write First

- [x] client sends in engagement thread → exactly one `recipientType=ACCOUNTANT` notification emitted; client (sender) NOT notified (AC-MSG-013-02)
- [x] accountant sends in engagement thread → exactly one `recipientType=CLIENT` notification to that client (AC-MSG-014-01)
- [x] multi-participant: accountant sends → every non-sender CLIENT participant notified; sender not (recipient-only, no leak)
- [x] `startGeneralThreadAction` — ACCOUNTANT succeeds; CLIENT identity → refused (CS-TS-004)
- [x] `markThreadReadAction` — sets the viewer's lastReadAt; another participant's read-state untouched (AC-MSG-005-04 substrate)
- [x] both actions reject an unauthenticated/role-mismatched caller before any DB write

## Implementation Notes

- The new-message notification: `type: 'new_message'`, `linkedItemType: 'thread'`, `linkedItemId: threadId`, recipient resolved server-side from thread participation (the *non-sender* set). Reuse `emitAndPublishNotification` exactly as `transitionEngagementStatus` does — post-write, additive. Recipient resolution must be **server-authoritative** (admin-pool lookup of the thread's participants), never client-supplied.
- `markThreadRead` writes the per-viewer watermark via the **request pool** so `pol_ThreadReadState` BLOCK enforces own-row only (a viewer can only mark their own state).
- Identity: mirror `getClientIdentity()` (portal) / the admin equivalent — cookie-derived, role-checked, before any DB access (CS-TS-004 / ADR-003).
- Cite ADR-003/-005/-006/-023 + CS-TS-001/-002/-003/-004 + CS-GEN-001/-002/-003.

## Definition of Done

- [x] send / mark-read actions on both surfaces; start-general-thread admin-only
- [x] recipient-only new-message notification proven (sender-not-notified, no cross-participant leak)
- [x] role guards proven (CLIENT cannot start a general thread)
- [x] Lint + type-check + build + tests pass; no raw pool import outside `packages/db`

---

## Work Log

- 2026-06-25 [sdet] Marking done — Portal 16/16 + admin 23/23 tests pass. Recipient-only entitlement proven: sender-CLIENT emits exactly one ACCOUNTANT notification; sender-ACCOUNTANT emits per-non-sender-CLIENT; sender never self-notified. Multi-participant: each non-sender client notified individually (admin-pool participation resolution). startGeneralThreadAction refuses CLIENT identity (CS-TS-004 role guard). markThreadRead writes via request-pool so pol_ThreadReadState BLOCK enforces own-row only. emitAndPublishNotification reused from EPIC-016 spine (CS-GEN-002). Build clean, lint zero errors, type-check clean. CS-TS-001/-002/-003/-004 verified. | What's next: archive | Blockers: none
- 2026-06-25 [webapp-developer] Marking as review — All gates pass. Created: thread-read.ts (markThreadRead, request-pool MERGE via SESSION_CONTEXT), modified message.ts (post-write emitAndPublishNotification for recipient-only new-message notifications), created portal+admin engagement messages/actions.ts (sendMessageAction+markThreadReadAction, CLIENT/ACCOUNTANT guards), admin messages/actions.ts (startGeneralThreadAction ACCOUNTANT-only + sendGeneralMessageAction + markGeneralThreadReadAction). Test results: portal 16/16 pass, admin 23/23 pass. Lint zero errors, type-check clean, build clean. Pre-existing 2 failures in document.upload-pipeline.rls.test.ts confirmed present before this task. e2e N/A per task spec. | What's next: SDET review | Blockers: none
- 2026-06-25 [webapp-developer] Starting implementation — task TASK-017-003 | What's next: implement and run gates | Blockers: none
## Attempt Log

**Attempt count**: 0

## SDET Review

- [x] **SDET Review** — approved

**Decision**: approved — with advisory noted
**Notes**: Portal 16/16 + admin 23/23 tests pass. Recipient-only entitlement proven: CLIENT sender → exactly one ACCOUNTANT notification; ACCOUNTANT sender → per-non-sender-CLIENT notification; sender never self-notified. Multi-participant handled correctly (admin-pool UNION of clientUserId + EngagementParticipant set). startGeneralThreadAction refuses CLIENT identity (CS-TS-004). markThreadRead runs request-pool so pol_ThreadReadState BLOCK enforces own-row only. emitAndPublishNotification reused from EPIC-016 spine (CS-GEN-002). CS-TS-001/-002/-003/-004 verified.

Advisory (non-blocking — see BUG-017-002 raised against TASK-017-012 fix): appendMessage emits linkedItemType='thread'/linkedItemId=threadId. NotificationsIndicator.tsx (TASK-017-012 scope) renders the link only for linkedItemType='engagement'. This means the "View messages" link will NOT appear for real new_message notifications emitted by appendMessage. The feed item itself renders (new_message is in ACCOUNTANT_KNOWN_TYPES) but is unlinked. The e2e fixture masks this by seeding with linkedItemType='engagement'. This is a TASK-017-012 responsibility — tracked under BUG-017-002 (raised with TASK-017-012 rejection). The notification emission in THIS task (appendMessage) is correct for the thread-centric data model; the renderer must be updated to handle linkedItemType='thread'.
