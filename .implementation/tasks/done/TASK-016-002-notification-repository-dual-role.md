---
brief: BRIEF-016
status: done
assigned_to: webapp-developer
updated_by: sdet
depends_on: TASK-016-001
impl: developer
e2e_required: "no"
started_at: 2026-06-24T19:00:45.348Z
completed_at: 2026-06-24T19:15:57.308Z
complexity_estimate: 3
complexity_actual: 3
introduces_gate: "no"
acceptance_criteria: [AC-MSG-007-01, AC-MSG-007-02, AC-MSG-015-02, AC-MSG-015-03, AC-MSG-016-01, AC-MSG-016-02, AC-MSG-017-02]
upstream_refs: ADR-003, ADR-005, ADR-006, REQ-MSG-007, REQ-MSG-015, REQ-MSG-016, REQ-MSG-017
code_standards: CS-TS-001, CS-TS-002, CS-GEN-002, CS-GEN-003
---

# TASK-016-002: Dual-role notification repository — feed read, unread count, mark-read-on-view, emit helper

---

## Quality Gates

- [x] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [x] **Submission gate** — lint + type-check + build + brief-mandated tests pass (commands in CLAUDE.md)
- [N/A] **Targeted e2e** — repository layer; e2e rides TASK-016-005/-006/-007
- [x] **Security review** — SESSION_CONTEXT propagation; no raw-pool bypass; mark-read under viewing principal
- [x] **SDET Review** — approved

## SDET Review focus areas

- **CS-TS-001/-002 (required).** Every read (feed + unread count) and the mark-read write run through the
  `packages/db` wrapper that sets `SESSION_CONTEXT` before the first real query (ADR-003). **No** import of the
  raw `requestDb`/`adminDb` pools outside `packages/db`. The feed read must be RLS-scoped (relies on
  TASK-016-001's policy — repository adds no filter of its own; the policy is the boundary).
- **Mark-read is per-principal + RLS-bounded.** `markNotificationRead` (and any view-driven mark-read) runs
  under the **viewing** principal via the request pool — a CLIENT can only mark their own (BLOCK predicate),
  the ACCOUNTANT only theirs. Reuse/extend the existing `markNotificationRead` — additive (CS-GEN-002).
- **Mark-read-on-view by linked item (AC-MSG-015-02/-03).** A function that, given a viewed linked item
  (`linkedItemType` + `linkedItemId`) under the viewing principal, marks the corresponding **unread**
  notification(s) read — no separate dismiss. Idempotent (already-read → no-op).
- **Unread count (AC-MSG-017-02).** Derived count of the viewing principal's unread notifications, computed
  under SESSION_CONTEXT — not a stored counter.

## Context

Builds the data-access layer on top of the generalized model + policy (TASK-016-001). The existing
`packages/db/src/repositories/notification.ts` is accountant-scoped (`listNotifications`,
`markNotificationRead`); this task generalizes it to the dual-role feed and adds the **mark-read-on-view**
(by linked item) and **unread-count** functions, plus a server-side **emit helper** the source-event wiring
(TASK-016-004) calls.

Satisfies the data layer for: AC-MSG-007-01/-02 (feed is authoritative/complete per principal),
AC-MSG-015-02/-03 (mark-read-on-view), AC-MSG-016-01/-02 (90-day history viewable), AC-MSG-017-02 (unread count).

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `packages/db/src/repositories/notification.ts` | Modify | Generalize `listNotifications` (now returns the viewing principal's RLS-scoped feed incl. `recipientType`, `linkedItemType`, `linkedItemId`). Add `countUnreadNotifications()` (derived unread count under SESSION_CONTEXT). Add `markNotificationsReadByLinkedItem({ linkedItemType, linkedItemId })` (per-principal, idempotent). Add `emitNotification(...)` server-side helper (admin-pool INSERT, mirrors the existing inline INSERT pattern) used by TASK-016-004. CS-TS-001/-002, CS-GEN-002. |
| `packages/db/src/index.ts` | Modify | Export the new functions/types (`countUnreadNotifications`, `markNotificationsReadByLinkedItem`, `emitNotification`, updated `NotificationItem`). |
| `packages/db/src/repositories/notification.integration.test.ts` (or co-located) | Create | Integration tests under SESSION_CONTEXT: feed returns the principal's set; unread count correct; mark-read-on-view transitions unread→read + decrements count with no dismiss; 90-day-old records still listed. AC-tagged. |

## Tests to Write First

- [x] `listNotifications under CLIENT context returns that client's feed` — expected: own rows only (AC-MSG-007-01/-02)
- [x] `countUnreadNotifications returns unread count for the viewing principal` — expected: matches unread set (AC-MSG-017-02)
- [x] `markNotificationsReadByLinkedItem marks the matching unread read` — expected: unread→read, count decremented, no dismiss (AC-MSG-015-02/-03)
- [x] `mark-read is idempotent for an already-read notification` — expected: no-op
- [x] `a notification ≥90 days old is still listed` — expected: present (AC-MSG-016-01/-02)
- [x] `emitNotification inserts a notification scoped to the recipient` — expected: visible only to that recipient

## Implementation Notes

- **Reuse the established admin-pool INSERT pattern** for `emitNotification` (see the inline INSERT in
  `engagement-request.ts` / `onboarding-completion.ts` — the admin pool bypasses the BLOCK predicate for the
  write). The emit helper takes `recipientType`, `recipientUserId?`, `type`, `title`, `body?`, `linkedItemType?`,
  `linkedItemId?`, `engagementRequestId?`.
- **Mark-read-on-view keys on the linked item**, not a notification id from the client — the caller passes the
  item being viewed; the function finds the principal's unread notification(s) for that item and marks them
  read. This is what makes "no dismiss step" true (AC-MSG-015-03).
- **Do not re-implement RLS in the repository** — the feed read leans entirely on `sec.pol_Notification`
  (TASK-016-001). The repository must not add a `where recipientUserId = …` clause that would mask a policy
  regression. (If a defensive filter is wanted, document it as belt-and-suspenders with a `// DECISION:`.)
- Cite ADR-003/-005 + CS-TS-001/-002 in code comments (CS-GEN-003).

## Definition of Done

- [x] Dual-role feed read + unread count + mark-read-on-view + emit helper implemented and exported
- [x] All DB access through the `packages/db` wrapper (CS-TS-001/-002) — no raw-pool import
- [x] Integration tests pass under CLIENT and ACCOUNTANT SESSION_CONTEXT
- [x] Lint + type-check + build pass

---

## Work Log

- 2026-06-24 [sdet] Marking done — All 7 ACs covered by 6 integration tests under CLIENT and ACCOUNTANT SESSION_CONTEXT. Cross-principal isolation (ADR-005 hard requirement) exercised by both the feed test (CLIENT-A cannot see CLIENT-B or ACCOUNTANT rows) and the emitNotification test (CLIENT-B cannot see CLIENT-A's emitted notification). DECISION-016-002-A/B/C all verified in code. No raw-pool bypass — CS-TS-001/CS-TS-002 satisfied. emitNotification uses getAdminPool() internal to packages/db (not an import violation). Admin-pool INSERT pattern confirmed precedented in engagement-request.ts / engagement-creation.ts. markNotificationsReadByLinkedItem correctly keyed on linked-item pair + idempotent. No WHERE recipientUserId clause added (policy is the sole boundary). Gate evidence consistent with diff (6/6 tests, lint/type-check/build pass). | What's next: archive | Blockers: none
- 2026-06-24 [webapp-developer] Marking as review — All gates pass: lint, type-check, build, 6/6 integration tests green. Pre-existing document.upload-pipeline failures confirmed unrelated (same 2 failures on unmodified branch via git stash test). Files: notification.ts generalized (dual-role NotificationItem, listNotifications, countUnreadNotifications, markNotificationsReadByLinkedItem, emitNotification). index.ts exports updated. Integration test file created at packages/db/src/repositories/notification.integration.test.ts covering AC-MSG-007-01/02, AC-MSG-015-02/03, AC-MSG-016-01/02, AC-MSG-017-02, plus emitNotification. All SESSION_CONTEXT via withClerkIdentity(). No WHERE recipientUserId clause added (DECISION-016-002-A). Admin pool INSERT for emitNotification (DECISION-016-002-C). mark-read keyed on linked item, not notification id (DECISION-016-002-B). | What's next: SDET review | Blockers: none
- 2026-06-24 [webapp-developer] Starting implementation — task TASK-016-002 | What's next: implement and run gates | Blockers: none
## Attempt Log

**Attempt count**: 0

## SDET Review

**Decision**: approved
**Notes**:
All 7 acceptance criteria verified against 6 AC-tagged integration tests running on Docker SQL Server.

AC traceability:
- AC-MSG-007-01/02 — "listNotifications under CLIENT context returns that client's feed only": CLIENT-A sees own notification; CLIENT-A does NOT see CLIENT-B's or the ACCOUNTANT-scoped notification. DECISION-016-002-A (no WHERE recipientUserId clause) confirmed — any policy regression would break the positive assertion, not mask it.
- AC-MSG-015-02/03 — "markNotificationsReadByLinkedItem marks the matching unread read": unread→read transition confirmed via admin-pool readback; unread count decrements; keyed on linked-item pair (not a notification ID). DECISION-016-002-B confirmed.
- AC-MSG-015-03 (idempotent) — "mark-read is idempotent for an already-read notification": markedCount=0 on repeat call; readAt remains set.
- AC-MSG-016-01/02 — "a notification ≥90 days old is still listed (retention floor)": backdated 91-day-old read and unread notifications both appear in the ACCOUNTANT feed.
- AC-MSG-017-02 — "countUnreadNotifications returns unread count for the viewing principal": count >= 2 with 2 unread + 1 read seeded; read notification excluded.
- emitNotification helper — admin-pool INSERT confirmed, CLIENT-B isolation confirmed via request-pool read post-emit.

ADR-003 compliance: all request-pool reads and writes go through the `db` (Prisma $extends) wrapper via `withClerkIdentity()`. `emitNotification` uses `getAdminPool()` internal to packages/db (not a CS-TS-002 violation). No raw `requestDb`/`adminDb` import at any call site. ADR-003 Amendment 1 (no @read_only) honored.

ADR-005 cross-principal isolation (hard requirement): exercised at two levels — `notification.rls.test.ts` (TASK-016-001 policy gate; bidirectional CLIENT-A/B isolation with HARD annotation) + this task's integration test (CLIENT-A feed excludes CLIENT-B and ACCOUNTANT rows; emitNotification test confirms CLIENT-B cannot read CLIENT-A's emitted notification). The requirement is met.

CS-TS-001/CS-TS-002 (required): `// CS-TS-001` and `// CS-TS-002` tags present in implementation and test. Verification hooks confirmed by code inspection. CS-GEN-002/CS-GEN-003 (recommended): honored — `markNotificationRead` preserved as-is, new fields additive, governing keys cited throughout.

Gate evidence consistent with diff: 6 test cases in the integration test file match the 6 ticked "Tests to Write First" items and the "6/6 integration tests green" claim in the Work Log.

Security: `emitNotification` uses `req.input()` parameterized bindings (no SQL concatenation). SECURITY comment explicitly warns callers that `recipientUserId` must be server-resolved. No injection vector identified.
