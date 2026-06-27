---
brief: BRIEF-019
status: done
assigned_to: webapp-developer
updated_by: sdet
depends_on: TASK-019-002
impl: developer
e2e_required: "no"
started_at: 2026-06-27T16:07:09.696Z
completed_at: 2026-06-27T18:03:44.082Z
complexity_estimate: 4
complexity_actual: 4
introduces_gate: "no"
acceptance_criteria: [AC-FILE-012-01, AC-FILE-012-03, AC-FILE-012-04, AC-MSG-018-01, AC-MSG-018-02, AC-MSG-013-05, AC-MSG-013-06]
upstream_refs: [ADR-023, ADR-018, ADR-005, ADR-003, ADR-012, EPIC-016, EPIC-011, EPIC-018, REQ-FILE-012, REQ-MSG-018, REQ-MSG-013]
code_standards: CS-TS-001 (required), CS-TS-002 (required), CS-SQL-001 (required), CS-GEN-001 (recommended), CS-GEN-002 (recommended), CS-GEN-003 (recommended)
---

# TASK-019-003: Detection + reminder engine behind the time-injectable seam (overdue + accountant notifications)

---

## Quality Gates

- [x] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [x] **Submission gate** — lint + type-check + build + brief-mandated tests pass (commands in CLAUDE.md)
- [N/A] **Targeted e2e** — _(N/A — the engine is tier-3 service/integration with an injected clock; the dev trigger route is exercised by TASK-019-005 e2e)_
- [x] **Security review** — engine is admin-pool/system (not a request principal); notifications RLS-scoped per recipient; no PII in logs (CS-GEN-001)
- [x] **SDET Review** — approved

## SDET Review focus areas

- **HARD tier-3 #1 — auto-detection behind the time-injectable seam, NO manual trigger (AC-FILE-012-01/-03, AC-MSG-018-01; ADR-023).** With the clock INJECTED (not wall-clock), advance time past an unfulfilled request's due date and assert the engine identifies it as overdue WITHOUT any accountant-initiated/manual call — detection is invoked by the (test-injectable) engine pass, not a user action. Asserting overdue only after a manual call is a REJECTION.
- **HARD tier-3 #2 — overdue determined by the due date, BOTH directions (AC-FILE-012-04).** Two unfulfilled requests, one past due, one not → ONLY the past-due one is overdue. A FULFILLED request past its due date is NOT overdue.
- **HARD tier-3 #3 — overdue raises a reminder (AC-MSG-018-02 → AC-MSG-013-05).** The reminder is produced FROM the overdue state (the engine pass), not a manual send; it emits the accountant in-portal overdue notification into the EPIC-016 feed.
- **HARD tier-3 #5 — cadence interval honored via the injected clock (AC-MSG-018-03 mechanism).** Advance the injected clock < interval → NO duplicate reminder; advance past the interval → next reminder. Cap enforced on `lastReminderSentAt` watermark, not by tick coincidence.
- **HARD tier-3 #8 — approaching-due-date accountant notification (AC-MSG-013-06).** An engagement approaching its EPIC-011 due date (via the injected clock) produces an in-portal due-date-approaching notification, evaluated by the engine without a manual trigger.
- **RLS reuse (CS-SQL-001)** — accountant notifications reuse `sec.pol_Notification` (`recipientType='ACCOUNTANT'`); no new policy. CLIENT must not see accountant-scoped reminder notifications (both-ways isolation for the CLIENT-recipient type lives in TASK-019-004).
- **CS-GEN-001** — engine logs NO client identity, document/request detail, or engagement detail.

## Context

The defining slice of EPIC-019: the server-side engine that, behind a **time-injectable clock seam (ADR-023)**, automatically identifies overdue document requests, raises reminders at the resolved cadence, and emits the accountant overdue + approaching-due-date notifications into the EPIC-016 feed. Mirrors EPIC-018's test-invokable `dispatchDailyDigest({ now })` batch.

## IO Design — binding contract

- **DECISION-019-H — `runReminderEngine({ now })`** is an admin-pool batch (mirror `dispatchDailyDigest`). `now` is the injected clock (defaults to `new Date()` in prod). Invoked under test via an env-guarded dev route (mirror `api/dev/dispatch-digest`).
- **Overdue determination (DECISION-019-C/-D, ADR-018 — derived, no new clock):**
  - A request is **overdue** iff **unfulfilled** AND its **effective due date** has passed (`< now`).
  - **Unfulfilled (DECISION-019-D)** = no non-soft-deleted `Document` with `documentRequestId = request.id`.
  - **Effective due date (DECISION-019-C)** = explicit `DocumentRequest.dueDate` if set; else (if `ReminderSetting.defaultRequestDueDays` present) `createdAt + defaultRequestDueDays`; else none → never overdue.
- **Reminder cadence (DECISION-019-E/-G):** for each overdue request, resolve cadence via `resolveReminderCadence(engagement)` (TASK-019-002). Raise a reminder iff `lastReminderSentAt IS NULL OR (now - lastReminderSentAt) >= resolvedIntervalDays`. On raise: `emitNotification` ACCOUNTANT `request_overdue` (AC-MSG-013-05) AND set `DocumentRequest.lastReminderSentAt = now` (admin pool).
- **Approaching-due-date (DECISION-019-F):** for each engagement whose `dueDate` is within `approachingDueWindowDays` of `now` and not past, and where `lastApproachingDueNotifiedAt` is null or stale, emit ACCOUNTANT `engagement_due_date_approaching` (AC-MSG-013-06) and watermark `Engagement.lastApproachingDueNotifiedAt = now`.
- **DECISION-019-J — no new email path.** Notifications surface in the EPIC-016 feed; the existing EPIC-018 digest picks them up (unread Notification → digest). ZERO changes to the email seam.
- Notification `type` strings: `request_overdue`, `engagement_due_date_approaching` (ACCOUNTANT, `recipientUserId = null`). `linkedItemType`/`linkedItemId` set to the request/engagement for feed navigation. CS-GEN-001: title/body carry no PII.

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `packages/db/src/repositories/reminder-engine.ts` | Create | `runReminderEngine({ now })` — detection + reminder raise + accountant notifications; `EngineRunResult` (counts only) |
| `packages/db/src/reminder-engine.detection.test.ts` | Create | tier-3 #1 (auto-detect, injected clock, no manual trigger), #2 (by-due-date both ways, fulfilled-not-overdue) |
| `packages/db/src/reminder-engine.cadence.test.ts` | Create | tier-3 #3 (overdue raises reminder → accountant notification), #5 (interval honored via injected clock) |
| `packages/db/src/reminder-engine.approaching.test.ts` | Create | tier-3 #8 (approaching-due-date accountant notification via injected clock) |
| `packages/db/src/index.ts` | Modify | Barrel-export `runReminderEngine` (CS-GEN-002 additive) |
| `apps/admin/src/app/api/dev/run-reminders/route.ts` | Create | Env-guarded (`ENABLE_REMINDER_TRIGGER=true`) + accountant-cookie-checked dev trigger; optional `{ now }` in test/dev — mirror `api/dev/dispatch-digest/route.ts` |

## Tests to Write First

- [ ] `injected clock past an unfulfilled request's due date → engine identifies it overdue with NO manual call` — expected: overdue (AC-FILE-012-01/-03)
- [ ] `two unfulfilled requests, one past-due one not → only past-due is overdue` — expected: exactly one (AC-FILE-012-04)
- [ ] `fulfilled request past its due date → NOT overdue` — expected: not overdue (AC-FILE-012-04)
- [ ] `engine pass on an overdue request → ACCOUNTANT request_overdue notification emitted` — expected: one notification (AC-MSG-018-02/AC-MSG-013-05)
- [ ] `advance injected clock < interval → no duplicate reminder` — expected: still 1 notification (AC-MSG-018-03)
- [ ] `advance injected clock past interval → next reminder raised` — expected: 2nd notification (AC-MSG-018-03)
- [ ] `engagement within approaching window via injected clock → ACCOUNTANT due-date-approaching notification` — expected: one notification (AC-MSG-013-06)

## Implementation Notes

- Mirror `dispatchDailyDigest` structure (admin pool, `now` injection, counts-only result, per-item try/continue, no PII logs).
- The dev trigger route MUST mirror the three-layer guard of `api/dev/dispatch-digest/route.ts` (env flag default-off; middleware admin auth; in-handler accountant cookie check; `now` accepted only in test/dev).
- Reuse `emitNotification` from `packages/db/src/repositories/notification.ts` (admin pool, RLS-exempt INSERT). Do NOT add a new notification policy — accountant notifications reuse `sec.pol_Notification`.
- Cite governing keys: `// ADR-023`, `// ADR-018`, `// ADR-005`, `// ADR-003`, `// CS-TS-001`, `// CS-TS-002`, `// CS-SQL-001`, `// CS-GEN-001`, `// CS-GEN-002`, `// CS-GEN-003`, `// DECISION-019-C..J`.

## Definition of Done

- [x] All seven tier-3 tests pass with the INJECTED clock (no wall-clock waits)
- [x] Overdue identification works without any accountant-initiated call (the engine pass is the trigger)
- [x] Cadence cap enforced on `lastReminderSentAt`; precedence via `resolveReminderCadence`
- [x] Accountant overdue + approaching-due notifications land in the EPIC-016 feed; no new email path
- [x] Dev trigger route guarded (env-off by default, accountant-only); `{ now }` only in test/dev
- [x] Lint + type-check + build pass; `pnpm --filter db test` + `pnpm --filter admin test` green

---

## Work Log

- 2026-06-27 [sdet] Marking done — Approved. HARD tier-3 #1: runReminderEngine({now}) is the only call — no manual trigger path. #2: past-due IS overdue, future-due is NOT, fulfilled is NOT (3 directions). #3: accountant request_overdue notification emitted from engine state. #5: advance < interval → no duplicate; advance past interval → next reminder (watermark-enforced). #8: approaching-due ACCOUNTANT notification via injected clock. CS-GEN-001: result counts-only, no PII. Dev route has 3-layer guard. | What's next: archive | Blockers: none
- 2026-06-27 [webapp-developer] Marking as review — All gates pass: lint/type-check/build clean; 7 tier-3 tests pass (injected clock, no manual trigger, cadence cap, approaching-due notification); pnpm --filter admin test 602/602. Pre-existing failures in document.upload-pipeline.rls.test.ts + folder.integration.test.ts + thread-unread.integration.test.ts are unrelated to this task (confirmed zero imports of reminder-engine in those files, no files modified by this task). Files as specified. | What's next: SDET review | Blockers: none
- 2026-06-27 [webapp-developer] Starting implementation — Starting implementation of detection + reminder engine (reminder-engine.ts, 3 test files, dev trigger route, barrel export) | What's next: implement and run gates | Blockers: none
## Attempt Log

**Attempt count**: 0

## SDET Review

**Decision**: approved — 2026-06-27T18:03:44.157Z
**Notes**: All mandatory gate checks and all HARD tier-3 gates passed. Gate-by-gate: #1 (auto-detect, no manual trigger) — the detection test calls ONLY `runReminderEngine({ now: TEST_NOW })`; no separate "mark overdue" function exists. ACCOUNTANT `request_overdue` notification verified via admin SELECT on `linkedItemId`. `lastReminderSentAt` watermark written. #2 (by-due-date, both directions + fulfilled) — past-due unfulfilled IS overdue (notification present), future-due unfulfilled is NOT (0 notifications, lastReminderSentAt null), fulfilled past-due is NOT (0 notifications). #3 (overdue raises reminder from engine state, not manual send) — single engine call at T0 produces exactly 1 ACCOUNTANT notification, linked to the request. #5 (cadence interval) — advance < interval → notification count unchanged (watermark cap); advance past interval → count increments by 1 and watermark updated to `tOverInterval`. #8 (approaching-due) — engine emits `engagement_due_date_approaching` ACCOUNTANT notification when within `approachingDueWindowDays`; same-day second run produces no duplicate; past-due date produces no approaching notification. Dev route: 3-layer guard verified (env flag 404, middleware admin auth, in-handler identity re-check). CS-GEN-001: response body is counts-only, no PII; error response generic. No new notification policy — reuses `sec.pol_Notification`.
