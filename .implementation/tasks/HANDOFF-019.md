# HANDOFF-019 — Overdue detection & reminder engine (BRIEF-019 / EPIC-019)

**Slice:** BRIEF-019 — Overdue detection & reminder engine (auto-detect, configurable cadence)
**Branch:** `brief-019-overdue-reminder-engine`
**Phase:** Phase 4 (does NOT close the phase — EPIC-023 is the Phase-4 closer; no phase-walkthrough video on this PR)
**Status at handoff:** Close-prep complete; PR pending (awaiting merge).

## What shipped

The detection + cadence + reminder-notification capability, built additively on the EPIC-016 feed, EPIC-018 digest, EPIC-011 engagement due date, and EPIC-013 document requests (all consumed, none rebuilt):

- **Detection + reminder engine behind a time-injectable seam** (`packages/db/src/repositories/reminder-engine.ts` — `runReminderEngine({ now })`, an admin-pool batch mirroring `dispatchDailyDigest`). Overdue is **derived** (ADR-018): unfulfilled (no non-soft-deleted *active* Document) AND effective due date `< now`. Cadence cap enforced on a `DocumentRequest.lastReminderSentAt` watermark; approaching-due idempotency on `Engagement.lastApproachingDueNotifiedAt`. Dev trigger route `apps/admin/.../api/dev/run-reminders` (env-guarded `ENABLE_REMINDER_TRIGGER`, fail-closed, accountant-checked, `{ now }` only in test/dev). Production scheduling deferred (ADR-023, Phase 5).
- **Configurable cadence** (`packages/db/src/repositories/reminder-cadence.ts`): global default in a net-new accountant-only `ReminderSetting` singleton; per-engagement override as a column on `Engagement` (reuses `sec.pol_Engagement` — DECISION-019-A). `resolveReminderCadence` is a pure `override ?? globalDefault` resolver. Role-guarded admin actions + UI: `apps/admin/.../settings/reminders` (global default) and `apps/admin/.../engagements/[id]` ReminderOverridePanel (per-engagement).
- **Overdue flag** on the accountant request view (`computeIsOverdue`, shared with the engine SQL so flag and engine cannot diverge) + accountant-settable request due-point (`DocumentRequest.dueDate`).
- **Three notification types** via the existing `emitNotification` / `sec.pol_Notification` (no new policy, no new email path — they ride the existing EPIC-018 content-free daily digest): `request_overdue` → accountant, `engagement_due_date_approaching` → accountant, `document_request_created` → client.
- **Schema:** net-new `ReminderSetting` table (+ RLS policy `db/policies/0018` + idempotent seed `db/migrations/0008`); additive nullable columns `DocumentRequest.dueDate`/`lastReminderSentAt`, `Engagement.reminderFrequencyDaysOverride`/`lastApproachingDueNotifiedAt`. `migration_lock.toml` provider corrected `sqlserver`→`mssql` (P3019, retro-012-002 family).

## Acceptance criteria — all 14 SATISFIED (verified at Validate, AC-id-tagged tests)

| AC | Behavior | Tier / proof |
| --- | --- | --- |
| AC-FILE-012-01 | Identifies overdue requests | tier-3 `reminder-engine.detection.test.ts` (injected clock) |
| AC-FILE-012-02 | Overdue flagged on accountant view | tier-6 admin e2e + `document-request.overdue-flag.test.ts` |
| AC-FILE-012-03 | Detection without manual trigger | tier-3 (engine pass is the only trigger — no manual mark-overdue path) |
| AC-FILE-012-04 | Overdue by due date (both ways, fulfilled-excluded) | tier-3 detection (3 directions) |
| AC-MSG-018-01 | Auto-identifies overdue | tier-3 engine |
| AC-MSG-018-02 | Overdue raises a reminder | tier-3 cadence (1 ACCOUNTANT request_overdue from overdue state) |
| AC-MSG-018-03 | Global default frequency | tier-3 cadence + tier-6 admin e2e |
| AC-MSG-018-04 | Per-engagement precedence | tier-3 `reminder-cadence.precedence.test.ts` (both ways) |
| AC-DASH-008-01 | Set global default | tier-6 admin e2e |
| AC-DASH-008-02 | Set per-engagement cadence | tier-6 admin e2e |
| AC-DASH-008-03 | Per-engagement precedence | tier-3 precedence (both ways) |
| AC-MSG-013-05 | Accountant overdue notification | tier-3 cadence |
| AC-MSG-013-06 | Accountant approaching-due notification | tier-3 `reminder-engine.approaching.test.ts` |
| AC-MSG-014-02 | Client request-created notification (RLS both ways) | tier-3 `document-request.request-created.rls.test.ts` + tier-6 portal e2e |

All 13 hard `extra_gates` satisfied (SDET acceptance-validation APPROVE). `@demo` gallery → `docs/demos/EPIC-019/` (non-gating).

## IO Design decisions (DECISION-019-A..J)

- **A** — per-engagement override = column on `Engagement` (no net-new engagement-scoped table; reuses `sec.pol_Engagement`).
- **B** — global default = net-new accountant-only `ReminderSetting` singleton (own RLS policy + isolation test).
- **C** — request due-point = `DocumentRequest.dueDate`; effective due date = explicit ?? (createdAt + `defaultRequestDueDays` when set) ?? none.
- **D** — unfulfilled = no non-soft-deleted **active** Document on the request (refined: pending/infected don't fulfill).
- **E/F** — last-reminder / approaching-due watermarks (mirror `User.lastNudgeSentAt`).
- **G** — `resolveReminderCadence` = `override ?? globalDefault` (pure).
- **H** — `runReminderEngine({ now })` admin-pool batch + env-guarded dev route.
- **I** — request-created CLIENT notification at creation time (skips if engagement unassigned).
- **J** — no new email path; notifications ride the existing EPIC-018 digest.

## Follow-ups for downstream / next slices (non-blocking)

1. **EPIC-020 consumes the overdue state** this engine produces (dashboard needs-action / activity feed). The overdue derivation lives in `computeIsOverdue` (packages/db) + the engine SQL — reuse it, don't re-derive.
2. **Production TLS posture (Phase 5 / ADR-007):** `parseSqlServerUrl` now defaults `encrypt=false` (BUG-019-001) — a prod `DATABASE_URL`/`DATABASE_URL_ADMIN` requiring encryption MUST set `;encrypt=true` explicitly. Recorded in `inventory.md` § Connection URL conventions.
3. **Production reminder scheduler (Phase 5 / ADR-023):** the engine is invoked under test via the dev route; a real scheduler is a deploy-time concern. `ENABLE_REMINDER_TRIGGER` must stay unset/false in production.
4. **`0008` seed vs get-or-create (carried, by design):** the seed is wired into `pnpm db:migrate` (directory-glob, idempotent `IF NOT EXISTS`); the e2e/first-use path relies on `getGlobalDefaultCadence` get-or-create (SELECT-first — no double-row). A fresh prod bring-up running `pnpm db:migrate` seeds the canonical row.
