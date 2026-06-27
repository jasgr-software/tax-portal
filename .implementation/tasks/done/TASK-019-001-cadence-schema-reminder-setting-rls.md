---
brief: BRIEF-019
status: done
assigned_to: webapp-developer
updated_by: sdet
depends_on: none
impl: developer
e2e_required: "no"
started_at: 2026-06-27T15:32:23.349Z
completed_at: 2026-06-27T18:03:30.513Z
complexity_estimate: 3
complexity_actual: 3
introduces_gate: "no"
acceptance_criteria: ["none (justification: enabling schema + RLS foundation for the cadence engine; no user-facing behavior of its own. The net-new ReminderSetting accountant-only isolation test satisfies the CS-SQL-001 / ADR-005 HARD tier-3 cadence-config-isolation gate (extra_gate #7). User-facing ACs are proven by TASK-019-002/-003/-004.)"]
upstream_refs: [ADR-005, ADR-003, ADR-006, ADR-002, ADR-018, REQ-FILE-012, REQ-DASH-008]
code_standards: CS-SQL-001 (required), CS-SQL-002 (required), CS-SQL-003 (required), CS-GEN-002 (recommended), CS-GEN-003 (recommended)
---

# TASK-019-001: Cadence-config & due-point schema + ReminderSetting RLS policy + accountant-only isolation test

---

## Quality Gates

- [x] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [x] **Submission gate** — lint + type-check + build + brief-mandated tests pass (commands in CLAUDE.md)
- [N/A] **Targeted e2e** — _(N/A — this task is schema + RLS + integration test only; tier-6 e2e is TASK-019-005)_
- [x] **Security review** — RLS predicate correctness; null/zero SESSION_CONTEXT → zero rows; client cannot read/modify cadence config
- [x] **SDET Review** — approved

## SDET Review focus areas

- **Net-new request-scoped table → HARD ADR-005 obligation.** `ReminderSetting` is net-new; it MUST get its own RLS security policy (accountant-only) AND a per-table isolation test ("a CLIENT principal cannot read or write cadence config"). This is the CS-SQL-001 / extra_gate #7 hard requirement — reject if either is missing.
- **CS-SQL-003 predicate shape** — the new policy must reuse the established `sec.fn_*_access` ITVF / inline-`EXISTS` pattern (per the EPIC-017 reconciliation), not invent a new shape.
- **CS-SQL-002** — security policy lives in the raw-SQL track (`db/policies/`), not Prisma. The columns/table live in Prisma (Track A); the policy lives in Track B.
- **Additive only (CS-GEN-002)** — every column is nullable/defaulted; no existing column removed or narrowed. Existing rows must remain valid after migration.
- **Per-engagement override shape (DECISION-019-A)** — verify the override is a column on the already-RLS'd `Engagement` (reuses `sec.pol_Engagement`), NOT a net-new engagement-scoped table; confirm no second new policy was silently added.

## Context

Foundation slice for the EPIC-019 overdue-detection & reminder engine. This task lays down the schema the cadence engine, the cadence-config server actions, and the reminder/notification emitters consume in TASK-019-002/-003/-004. It owns the one net-new request-scoped table (`ReminderSetting`) and therefore the HARD ADR-005 cadence-config-isolation gate.

Builds on: EPIC-011 (`Engagement.dueDate` already exists — consumed, not rebuilt), EPIC-013 (`DocumentRequest` + `Document.documentRequestId` fulfillment link already exist), EPIC-016 (`Notification` + `sec.pol_Notification` reused later), EPIC-018 (`User.lastNudgeSentAt` watermark pattern this mirrors).

## IO Design — binding field-level contract (expanded from the brief's § Data & Interface Contract)

> Record these as `// DECISION-019-*` comments in the schema/migration/policy.

- **DECISION-019-A — Per-engagement override = column on `Engagement`.** Add `reminderFrequencyDaysOverride Int?` to `Engagement`. It reuses `sec.pol_Engagement` (already RLS'd, accountant-write via admin pool, client-read isolated) — **no net-new engagement-scoped table, no new policy** for the override. This is the brief-invited shape choice (§ Notes: "if Design instead puts the override as a column on an already-RLS'd engagement record, no new policy is needed — flag the chosen shape"). FLAGGED here; do not silently widen.
- **DECISION-019-B — Global default = net-new singleton `ReminderSetting` table (accountant-only).** Net-new request-scoped table → **its own RLS policy + isolation test** (CS-SQL-001). Fields:
  - `id` — PK, `NEWSEQUENTIALID()`, `@db.UniqueIdentifier` (ADR-002 convention).
  - `reminderFrequencyDays Int` — global default cadence interval in days (AC-MSG-018-03 / AC-DASH-008-01). Seed a sensible default row (e.g. 7).
  - `approachingDueWindowDays Int` — the approaching-due-date threshold in days (AC-MSG-013-06 mechanism; IO decision — default e.g. 7).
  - `defaultRequestDueDays Int?` — OPTIONAL fallback request-due interval (the bounded REQ-FILE-012 shape question; nullable — when null, a request with no explicit dueDate is never overdue).
  - `createdAt` / `updatedAt` — `@db.DateTimeOffset`, `SYSDATETIMEOFFSET()` / `@updatedAt` (ADR-002).
  - Singleton: exactly one logical row; the data layer (TASK-019-002) reads "the" row (or seeds one).
- **DECISION-019-C — Document-request due point = net-new `DocumentRequest.dueDate DateTime? @db.Date`** (accountant-settable; calendar date, mirroring `Engagement.dueDate`/DECISION-011-A). Effective due date (computed in TASK-019-003): explicit `dueDate` if set; else, when `ReminderSetting.defaultRequestDueDays` is present, `createdAt + defaultRequestDueDays`; else none → never overdue.
- **DECISION-019-E — Reminder dispatch watermark = net-new `DocumentRequest.lastReminderSentAt DateTime? @db.DateTimeOffset`** (mirrors `User.lastNudgeSentAt`, EPIC-018). Used by TASK-019-003 cadence cap.
- **DECISION-019-F — Approaching-due idempotency watermark = net-new `Engagement.lastApproachingDueNotifiedAt DateTime? @db.DateTimeOffset`** so the approaching-due signal fires once per engine pass within the window, not every tick.

All net-new columns are nullable/defaulted (CS-GEN-002 additive; existing rows stay valid).

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `prisma/schema.prisma` | Modify | Add `ReminderSetting` model; add `DocumentRequest.dueDate`, `DocumentRequest.lastReminderSentAt`; add `Engagement.reminderFrequencyDaysOverride`, `Engagement.lastApproachingDueNotifiedAt` |
| `prisma/migrations/20260627000000_brief_019_cadence_schema/migration.sql` | Create | Manual migration SQL (Track A) — `pnpm db:migrate` applied it via `prisma migrate deploy`; see Work Log for why `prisma migrate dev` shadow-DB was unavailable |
| `prisma/migrations/migration_lock.toml` | Modify | Updated `provider = "sqlserver"` → `provider = "mssql"` — Prisma 5.22.0 WASM engine normalizes the provider name; mismatched lock file caused P3019 on any migrate command |
| `db/policies/0018-reminder-setting-policy.sql` | Create | Raw-SQL Track B — `sec.fn_reminder_setting_access` ITVF + `sec.pol_ReminderSetting` (FILTER + BLOCK), accountant-only; reuses CS-SQL-003 shape from 0004/0005 |
| `packages/db/src/reminder-setting.rls.test.ts` | Create | Per-policy isolation test (HARD ADR-005): ACCOUNTANT can read; CLIENT cannot read or write; null SESSION_CONTEXT → zero rows; schema additive checks |
| `db/migrations/0008-seed-default-reminder-setting.sql` | Create | Idempotent seed: inserts exactly one `ReminderSetting` row (reminderFrequencyDays=7, approachingDueWindowDays=7, defaultRequestDueDays=NULL) if none exists |

## Tests to Write First (the test plan that proves the gate)

- [x] `ReminderSetting RLS — ACCOUNTANT principal can SELECT the config row` — expected: row visible
- [x] `ReminderSetting RLS — CLIENT principal SELECT → zero rows` — expected: `[]` (FILTER blocks)
- [x] `ReminderSetting RLS — CLIENT principal UPDATE/INSERT → blocked` — expected: BLOCK predicate denies (0 rows affected / error)
- [x] `ReminderSetting RLS — null/zero SESSION_CONTEXT → zero rows` — expected: `[]` (fail-closed, ADR-003 §5)
- [x] `Schema migration is additive` — expected: existing `DocumentRequest`/`Engagement` rows remain valid; new columns nullable

## Implementation Notes

- Mirror `db/policies/0004-notification-policy.sql` / `0005-engagement-policy.sql` for the ITVF + policy batch structure (DROP POLICY → CREATE OR ALTER FUNCTION in its own batch → CREATE POLICY), GO-separated (db-migrate.ts splits on GO).
- Accountant-only predicate: pass when `IS_MEMBER('app_admin_role') = 1` OR `SESSION_CONTEXT('role') = 'ACCOUNTANT'`; no CLIENT branch (cadence config is accountant-only). Null SESSION_CONTEXT → fail-closed.
- The isolation test should follow the established `*.rls.test.ts` harness in `packages/db/src` (see `notification.rls.test.ts`, `engagement.client-isolation.rls.test.ts`) for setting SESSION_CONTEXT per principal.
- Do NOT wire any reads/writes yet — that is TASK-019-002. This task is schema + policy + isolation proof.
- Cite the governing keys: `// ADR-005`, `// ADR-003`, `// CS-SQL-001`, `// CS-SQL-002`, `// CS-SQL-003`, `// CS-GEN-002`, `// DECISION-019-A..F`.

## Definition of Done

- [x] Prisma schema + migration applied; migration applied via `prisma migrate deploy` (shadow-DB workaround — see Work Log); `prisma generate` clean; client regenerates
- [x] `db/policies/0018-reminder-setting-policy.sql` applies idempotently via `pnpm db:policies:apply`
- [x] `ReminderSetting` isolation test passes BOTH ways (accountant sees; client cannot read or write) + null-context → zero rows (8/8 green)
- [x] Per-engagement override is a column on `Engagement` (no net-new engagement-scoped table) — shape FLAGGED in Work Log (DECISION-019-A)
- [x] Lint + type-check + build pass
- [x] `.implementation/operations/` docs — N/A (no Dockerfile/compose/secret/env change)

---

## Work Log

- 2026-06-27 [sdet] Marking done — Approved. RLS policy (CS-SQL-003 ITVF shape, accountant-only, no CLIENT branch), 8/8 isolation tests green (ACCOUNTANT reads, CLIENT reads 0, CLIENT INSERT/UPDATE blocked, null context 0, schema additive). DECISION-019-A shape flagged in Work Log. CS-SQL-001/-002/-003/-GEN-002/-GEN-003 all honored and tagged. | What's next: archive | Blockers: none
- 2026-06-27 [webapp-developer] Implemented TASK-019-001 (schema + RLS + isolation test). All submission gates pass. DECISION-019-A flagged: Engagement.reminderFrequencyDaysOverride is a column on the already-RLS-d Engagement model — no net-new engagement-scoped table, no new policy needed. Discovered and resolved Prisma 5.22.0 WASM engine normalization issue (P3019: migration_lock.toml said sqlserver but Prisma 5.22.0 internally uses mssql — updated lock file). Shadow-DB permission denied (P3014) for prisma migrate dev so migration was applied via pnpm db:migrate (prisma migrate deploy path) using a manually-authored migration.sql. pnpm db:policies:apply applies 0018-reminder-setting-policy.sql and 0008-seed-default-reminder-setting.sql idempotently (verified on re-run). reminder-setting.rls.test.ts: 8/8 PASS (ACCOUNTANT reads config row, null context=0 rows, CLIENT reads 0 rows, CLIENT INSERT blocked, CLIENT UPDATE blocked, DocumentRequest+Engagement schema additive checks). Full db suite: 510/512 (2 pre-existing failures in document.upload-pipeline.rls.test.ts — AV scanner timing, unrelated; file not modified by this task). pnpm lint clean. pnpm type-check clean. pnpm build clean. | What's next: SDET review of RLS predicate correctness and CS-SQL-001/-002/-003 compliance. TASK-019-002 (cadence-config server actions) unblocked. | Blockers: none
- 2026-06-27 [webapp-developer] Marking as review — All gates green. 8/8 reminder-setting.rls.test.ts pass. DECISION-019-A flagged: per-engagement override = nullable column on Engagement (reuses sec.pol_Engagement, no new policy). migration_lock.toml updated sqlserver→mssql (Prisma 5.22.0 WASM normalization). 2 pre-existing failures in document.upload-pipeline.rls.test.ts (unrelated AV scanner; not touched). | What's next: SDET review | Blockers: none
- 2026-06-27 [webapp-developer] Starting implementation — Schema + RLS + isolation test for ReminderSetting. Mirroring 0004/0005 policy pattern and existing RLS test harness. DB must be running for test gate. | What's next: implement and run gates | Blockers: none
## Attempt Log

**Attempt count**: 0

## SDET Review

**Decision**: approved — 2026-06-27T18:03:30.513Z
**Notes**: All mandatory gate checks passed. RLS policy (`sec.pol_ReminderSetting`) uses the CS-SQL-003 ITVF/inline-EXISTS predicate shape (RETURNS TABLE WITH SCHEMABINDING, GO-separated batches, admin-first then ACCOUNTANT branch, no CLIENT branch — correct for an accountant-only table). Policy is in the raw-SQL track (CS-SQL-002 compliant). `// CS-SQL-001`, `// CS-SQL-002`, `// CS-SQL-003`, `// DECISION-019-B` tags present in policy + test. Isolation test: 8/8 green — ACCOUNTANT reads seeded row, null SESSION_CONTEXT = 0 rows, CLIENT reads 0 rows, CLIENT INSERT blocked, CLIENT UPDATE blocked (row unchanged per admin read-back), schema additive checks for DocumentRequest and Engagement. DECISION-019-A shape (per-engagement override = column on Engagement, reuses `sec.pol_Engagement`, no new policy) is flagged in the Work Log as required. CS-GEN-002: all new columns nullable; CS-GEN-003: governing keys cited throughout. No security concerns. Work Log entries in reverse-chronological order (newest first) — minor style observation, not a gate failure; all required content is present including the "Starting implementation" entry.
