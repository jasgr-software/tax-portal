---
brief: BRIEF-012
status: done
assigned_to: webapp-developer
updated_by: sdet
depends_on: none
impl: developer
e2e_required: "no"
started_at: 2026-06-23T16:10:39.430Z
completed_at: 2026-06-23T18:02:15.306Z
complexity_estimate: 4
complexity_actual: 4
introduces_gate: "no"
acceptance_criteria: [AC-AUTH-007-01, AC-AUTH-007-03, AC-LIFE-012-01, AC-LIFE-012-03, AC-LIFE-010-02]
upstream_refs: [ADR-005, ADR-003, ADR-002, ADR-012, REQ-AUTH-007, REQ-LIFE-012, REQ-LIFE-010]
code_standards: CS-SQL-001, CS-SQL-002, CS-SQL-003, CS-TS-001, CS-TS-002, CS-GEN-003
---

# TASK-012-001: Data model + RLS foundation — tax-year, EngagementParticipant, participant-aware engagement RLS

---

## Quality Gates

- [x] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [x] **Submission gate** — lint + type-check + build + brief-mandated tests pass (commands in CLAUDE.md)
- [N/A] **Targeted e2e** — this is a tier-3 data-layer/RLS task; no e2e (brief mandates e2e on the UI tasks)
- [x] **Security review** — RLS isolation proven both ways; predicate fail-closed on null SESSION_CONTEXT
- [x] **SDET Review** — approved

## SDET Review focus areas

- **Touches RLS security policies (ADR-005, CS-SQL-001/-003) — HARD tier-3 gate.** Verify the participant
  per-policy isolation test proves isolation **both ways**: a linked participant reaches the shared engagement;
  an **unrelated client sees ZERO**; null/anonymous SESSION_CONTEXT sees ZERO (fail-closed); ACCOUNTANT sees all.
  A one-directional assertion is a rejection.
- **Predicate change to a LIVE policy** (`sec.fn_engagement_access`) — verify the existing `clientUserId`-owner
  access (AC-AUTH-003, EPIC-010) is preserved AND the new participant-link branch is additive (no regression to
  the owner path; no widening that lets an unrelated client in).
- **New scoped table `EngagementParticipant`** — verify it has its own RLS policy (CS-SQL-001: a policy AND an
  isolation test per scoped table).
- **Raw-SQL track** (CS-SQL-002) — the policy/predicate is raw SQL under `db/policies/` (Prisma can't express it);
  the entity/columns are the Prisma track.

## Context

EPIC-012 makes **(client, service type, tax year)** the engagement identity tuple and introduces
**multi-participant** engagements. This task lays the data + security foundation the creation-path and
participant tasks build on. It satisfies the data-layer halves of AC-LIFE-012-01/-03 (an engagement can have
>1 participant linked; all participants associate to the same engagement), AC-AUTH-007-01/-03 (multiple CLIENT
participants; each reaches the shared engagement through their own account and sees no unrelated data), and
AC-LIFE-010-02 (concurrent engagements tracked independently).

**DECISION-B (tax-year):** `Engagement.taxYear Int?` — nullable year integer (e.g. `2025`). Set at engagement
creation by the creation-path tasks; existing engagements remain `null` (no back-fill). Third component of the
duplicate identity tuple; consumed downstream by EPIC-013. <!-- DECISION: BRIEF-012 / REQ-LIFE-010,011 -->

**DECISION-D (participants & RLS):** new `EngagementParticipant` join (a new RLS-scoped table). The primary
`clientUserId` stays as-is for back-compat; the engagement RLS CLIENT branch is **extended** to
`e.clientUserId = me OR EXISTS(EngagementParticipant ep WHERE ep.engagementId = e.id AND ep.userId = me)`.
This preserves AC-AUTH-003 (an unrelated client still sees ZERO) and adds participant access (AC-AUTH-007-03).
<!-- DECISION: BRIEF-012 / ADR-005, REQ-AUTH-007 -->

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `prisma/schema.prisma` | Modify | Add `Engagement.taxYear Int?`; add `EngagementParticipant` model (`id`, `engagementId` FK, `userId` FK, `role` default `CLIENT`, `createdAt`; `@@unique([engagementId, userId])`); reverse relation `Engagement.participants` + `User.engagementParticipations` |
| `prisma/migrations/20260623161354_engagement-participant-and-tax-year/migration.sql` | Create | Handcrafted Track A migration SQL (P3019 env quirk — `prisma migrate dev/deploy` fail in this environment; same workaround as TASK-010-001 / TASK-011-001 / TASK-007-003 / TASK-003-001). Applied directly via mssql driver against the local SQL Server container. |
| `db/policies/0009-engagement-participant-policy.sql` | Create | RLS policy + predicate `sec.fn_engagement_participant_access` for the new scoped table (a participant reads only their own participant rows; ACCOUNTANT/admin all; null → ZERO). Includes drop-before-alter pattern (SQL Server blocks `CREATE OR ALTER` of a function referenced by a live security policy). |
| `db/policies/0005-engagement-policy.sql` | Modify | Extend the CLIENT branch of `sec.fn_engagement_access` to owner-OR-participant-link (idempotent re-apply; versioned per ADR-005). Added drop-before-alter batch to handle idempotent re-apply. |
| `db/migrations/0005-engagement-participant-rls.sql` | Create | Marker/documentation file for the Track B policy dependency order. The actual DDL lives in db/policies/ (idempotent, re-applicable). |
| `packages/db/src/repositories/engagement.ts` | Modify | Added `taxYear?: number | null` to `EngagementItem` interface, `EngagementRow` internal type, and `mapRow` helper. Extended `getEngagementForAdmin` return type + SQL to include `taxYear`. |
| `packages/db/src/index.ts` | Modify | Added `EngagementParticipant` type re-export from `@prisma/client`. |
| `packages/db/src/engagement-participant.client-isolation.rls.test.ts` | Create | HARD tier-3 isolation test (mirrors `questionnaire-answer.client-isolation.rls.test.ts`). 15 tests, all passing. |

## Tests to Write First

- [x] `[AC-AUTH-007-03] a participant linked via EngagementParticipant reads the shared engagement — positive`
- [x] `[AC-AUTH-007-03] an unrelated CLIENT sees ZERO rows for that engagement — isolation (ADR-005 HARD)`
- [x] `[ADR-005] null/anonymous SESSION_CONTEXT reads ZERO — fail-closed`
- [x] `[ADR-005] ACCOUNTANT reads all engagements — full visibility preserved`
- [x] `[AC-AUTH-003-regression] the primary clientUserId owner still reads their engagement — no regression`
- [x] `[AC-AUTH-007-01] two CLIENT participants both reach the one shared engagement`
- [x] `[AC-LIFE-012-01][AC-LIFE-012-03] an engagement links >1 participant; all associate to the same engagement`
- [x] `[AC-LIFE-010-02] a second concurrent engagement for the same client (different service/tax-year) is isolated — a change to one is invisible to the other's scope`
- [x] `[CS-SQL-001] EngagementParticipant rows: a participant reads only their own link rows; an unrelated client sees ZERO`

## Implementation Notes

- Follow the existing isolation-test harness: raw `mssql` ConnectionPool, set SESSION_CONTEXT per query (Prisma's
  sqlserver connector can't parse dev ports — see the questionnaire-answer isolation test).
- The predicate change is the highest-blast-radius edit in the slice — keep the owner branch byte-identical and
  **add** the participant `EXISTS` as an `OR`. Re-apply must be idempotent (`db:policies:apply`).
- Tag each test with its AC id in the title (the AC-id test-tag contract). Cite `// ADR-005` / `// CS-SQL-003`
  at the predicate; `// CS-SQL-001` at the new policy.
- Do NOT add a UNIQUE DB constraint on `(client, service, taxYear)` — the duplicate guard is application-level
  (override must be possible — see TASK-012-002 DECISION-C).

## Definition of Done

- [x] `Engagement.taxYear` + `EngagementParticipant` in schema; Prisma migration generated + applied locally
- [x] New EngagementParticipant RLS policy + the engagement-predicate extension applied via the raw-SQL track
- [x] The HARD tier-3 isolation test passes (both directions) under the local SQL Server container
- [x] Lint + type-check + build pass; `pnpm --filter @tax-portal/db test` green for the new test
- [x] No regression to AC-AUTH-003 owner access

---

## Work Log

- 2026-06-23 [sdet] Marking done — RLS isolation test independently re-run: 15/15 PASSED. Both-ways isolation confirmed: participant access via 3b EXISTS branch; unrelated CLIENT sees ZERO; null SESSION_CONTEXT fail-closed; ACCOUNTANT full visibility; AC-AUTH-003 owner path preserved byte-identical. New EngagementParticipant table has own policy (CS-SQL-001). Predicate additive (CS-GEN-002). Raw-SQL track confirmed for policies (CS-SQL-002). CS-GEN-003 tags present throughout. No PII in audit rows. complexity_actual=4 valid. | What's next: archive | Blockers: none
- 2026-06-23 [webapp-developer] Marking as review — All gates passed: 15/15 RLS isolation tests, lint/type-check/build clean, portal 231/231, admin 348/348. Track A migration + Track B policies applied. DECISION-D participant-OR-owner extension proven both ways. | What's next: SDET review | Blockers: none
- 2026-06-23 [webapp-developer] Starting implementation — Starting data-model + RLS foundation for BRIEF-012 multi-participant engagements | What's next: implement and run gates | Blockers: none

- 2026-06-23 [webapp-developer] Implementation complete. Submission gate results:
  - (1) pnpm lint — PASSED (zero warnings/errors)
  - (2) pnpm type-check — PASSED (zero errors)
  - (3) pnpm build — PASSED (all packages + apps)
  - (4) pnpm --filter portal test — 231 tests PASSED
  - (5) pnpm --filter admin test — 348 tests PASSED
  - (6) pnpm --filter @tax-portal/db test (full suite) — 263 PASSED; 2 pre-existing failures in document.upload-pipeline.rls.test.ts (confirmed pre-existing per TASK-010-001 / TASK-011-001 work logs — not caused by this task)
  - (7) targeted: `pnpm --filter @tax-portal/db test -- src/engagement-participant.client-isolation.rls.test.ts` — **15/15 PASSED** (see below)

  **Targeted test output (HARD tier-3 gate):**
  ```
  ✓ src/engagement-participant.client-isolation.rls.test.ts (15 tests) 303ms
  Test Files: 1 passed (1)
  Tests: 15 passed (15)
  ```

  **Tests written and passing (15 total):**
  - `[AC-AUTH-007-03] a participant linked via EngagementParticipant reads the shared engagement — positive`
  - `[AC-AUTH-007-03] an unrelated CLIENT sees ZERO rows for that engagement — isolation (ADR-005 HARD)`
  - `[ADR-005] null/anonymous SESSION_CONTEXT reads ZERO — fail-closed`
  - `[ADR-005] ACCOUNTANT reads all engagements — full visibility preserved`
  - `[AC-AUTH-003-regression] the primary clientUserId owner still reads their engagement — no regression`
  - `[AC-AUTH-007-01] two CLIENT participants both reach the one shared engagement`
  - `[AC-LIFE-012-01][AC-LIFE-012-03] an engagement links >1 participant; all associate to the same engagement`
  - `[AC-LIFE-010-02] a second concurrent engagement for the same client (different tax-year) is isolated — participant cannot see it`
  - `[AC-LIFE-010-02] owner sees both their concurrent engagements via clientUserId — no narrowing`
  - `[CS-SQL-001] participant A reads only their own EngagementParticipant link row — positive`
  - `[CS-SQL-001] an unrelated CLIENT sees ZERO EngagementParticipant rows — isolation (ADR-005 HARD)`
  - `[ADR-005] null/anonymous SESSION_CONTEXT reads ZERO EngagementParticipant rows — fail-closed`
  - `[ADR-005] ACCOUNTANT reads all EngagementParticipant rows — full visibility preserved`
  - `[POSITIVE] Admin pool (app_admin_role) reads both seeded EngagementParticipant rows — RLS-exempt`
  - `[POSITIVE] Admin pool reads taxYear from both seeded engagements — data model verification (DECISION-B)`

  **Track A migration:** handcrafted SQL at `prisma/migrations/20260623161354_engagement-participant-and-tax-year/migration.sql` (P3019 env workaround — same pattern as TASK-010-001/TASK-011-001/TASK-007-003/TASK-003-001). Applied directly via mssql driver against local SQL Server container (port 14330). EngagementParticipant table + Engagement.taxYear column confirmed present in DB.

  **Track B policies:** `db/policies/0005-engagement-policy.sql` (extended CLIENT branch — owner-OR-participant, both EXISTS checks, 3b additive) and `db/policies/0009-engagement-participant-policy.sql` (new policy for scoped table). Applied directly via mssql driver. Both `pol_Engagement` and `pol_EngagementParticipant` confirmed enabled in sys.security_policies.

  **Key implementation notes:**
  - Added drop-before-alter batch to both policy files: SQL Server blocks `CREATE OR ALTER FUNCTION` when the function is referenced by a live SECURITY POLICY; the idempotent pattern is: drop policy → alter/create function → recreate policy.
  - `EngagementItem.taxYear` marked optional (`?`) for CS-GEN-002 backward-compat with existing test mock objects that pre-date this field; DB rows return null (correct — no back-fill per DECISION-B).
  - DECISION-D implemented exactly per task spec: 3a owner branch is byte-identical to EPIC-005 original; 3b participant EXISTS is purely additive.

  | What's next: SDET review | Blockers: none

## Attempt Log

**Attempt count**: 0

## SDET Review

**Decision**: approved
**Notes**: RLS test independently re-run 2026-06-23: 15/15 PASSED against real SQL Server container. Both-ways isolation confirmed per BRIEF-012 HARD gate: (1) participant A reads shared engagement via 3b EXISTS branch; (2) unrelated CLIENT sees ZERO; (3) null SESSION_CONTEXT fail-closed; (4) ACCOUNTANT full visibility; (5) AC-AUTH-003 owner path preserved byte-identical (3a). EngagementParticipant scoped table has its own policy (CS-SQL-001). Predicate extension is purely additive OR (CS-GEN-002). Raw-SQL track for policies (CS-SQL-002). CS-GEN-003 tags present throughout code and test. No PII in any audit row. introduces_gate: no — continues the existing CS-SQL-001 pattern.
