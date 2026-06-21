---
brief: BRIEF-003
status: done
assigned_to: webapp-developer
updated_by: sdet
depends_on: none
impl: developer
e2e_required: "no"
started_at: 2026-06-17T10:45:39Z
completed_at: 2026-06-17T06:15:00Z
complexity_estimate: 4
complexity_actual: 4
introduces_gate: yes (new `sec.pol_Notification` accountant-only-read security policy + its tier-3 integration test — § Gate Authoring Rules three-item evidence required)
acceptance_criteria: [AC-DOOR-005-03 (notification delivered to the accountant only), "AC-DOOR-006-04 (DB-level: only ACCOUNTANT/admin can mutate a request — the decide write boundary)", AC-DOOR-008-04 (the `declineReason` column that retains the reason on the request)]
upstream_refs: ADR-005 (RLS via security policies), ADR-002 (SQL Server / sqlserver provider), ADR-004 (Prisma single-track), ADR-003 (SESSION_CONTEXT), ADR-012 (testing pyramid — tier-3), REQ-DOOR-005, REQ-DOOR-008
---





# TASK-003-001: Schema + RLS — Notification entity, EngagementRequest decision fields, accountant-only notification read policy

---

## Quality Gates

- [x] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [x] **Submission gate** — lint + type-check + build + `pnpm --filter @tax-portal/db test` pass (commands in CLAUDE.md)
- [N/A] **Targeted e2e** — no UI in this task (e2e lands in TASK-003-006)
- [x] **Security review** — RLS fail-closed (null SESSION_CONTEXT → zero rows); no client-assertable role; predicate SCHEMABINDING/ITVF per ADR-005 §5
- [x] **SDET Review** — approved

## SDET Review

**Decision**: approved

**Evidence:**
- Independent run `pnpm --filter @tax-portal/db test -- src/notification.rls.test.ts src/engagement-request.decide-boundary.rls.test.ts` → 2 files / 7 tests / 0 failures (495ms). Both SQL Server containers live, real predicate path verified.
- `sec.pol_Notification` predicate (`0004-notification-policy.sql`): ITVF + WITH SCHEMABINDING + GO-batched + DROP/CREATE policy — exact mirror of `0001`. STATE=ON, SCHEMABINDING=ON confirmed. FILTER + BLOCK (AFTER INSERT, BEFORE/AFTER UPDATE, BEFORE DELETE). Fail-closed on null SESSION_CONTEXT proven by test.
- Decide-write-boundary: CLIENT-context UPDATE correctly asserts `rowsAffected === 0` (SQL Server BLOCK silent-suppress, not error) AND admin read-back confirms `status` still `pending`. Not a false pass — SQL Server BEFORE/AFTER UPDATE BLOCK predicate behavior is silent suppression, correctly documented in test file.
- ADR-003 Amendment 1 clean: `client.ts` sets keys without `@read_only`; new files use `@read_only = 0`; repository comment explicitly notes no `@read_only`. No violation.
- Gate-Authoring three-item evidence: all three items present in Work Log and test file header (run log + step name, named code path with both predicate branches, three distinct counterfactuals). Satisfies ENGINE.md § Gate Authoring Rules.
- Migration discipline: Track A (`prisma/schema.prisma` + handcrafted `migration.sql`) vs Track B (`db/policies/0004-notification-policy.sql`) correctly separated. P3019 workaround carried per RETRO-002/004.
- Security: no client-assertable role; `sp_set_session_context` issued only from `client.ts:$allOperations` (single writer per ADR-003 §3); `createNotification` parameterized (`req.input()`); `markNotificationRead` via Prisma (no raw SQL injection).
- All three in-scope AC (DOOR-005-03, DOOR-006-04 DB layer, DOOR-008-04 schema column) have bound tests or schema evidence. `Complexity-actual: 4` in range.

## SDET Review focus areas

- New RLS policy (`db/policies/0004-notification-policy.sql`) — **HARD tier-3 obligation per ADR-005 + CLAUDE.md § SDET**: an integration test proving CLIENT-vs-ACCOUNTANT (and anonymous/null-context) read isolation on `Notification`. Mirror the `0001-engagement-request-policy.sql` predicate shape (ITVF, SCHEMABINDING, admin bypass, ACCOUNTANT pass, CLIENT/anon zero).
- Verify the decide-write-boundary regression: a CLIENT-context UPDATE of `EngagementRequest.status` is blocked by the existing `pol_EngagementRequest` BLOCK predicates (this task adds the **test**, the policy already exists from EPIC-001 — confirm it actually blocks, closing the AC-DOOR-006-04 DB layer).
- Migration discipline (ADR-002): Track A (Prisma) for columns/model; Track B (`db/policies/`) raw SQL for the policy. No `@read_only` on any SESSION_CONTEXT path (ADR-003 Amendment 1).
- Gate-authoring three-item evidence in the Work Log for the new policy gate.

## Context

EPIC-003 closes the front-door loop. This foundational task lays the schema + security boundary the rest of the slice builds on:
1. A new accountant-scoped **`Notification`** entity (generated on request submission in TASK-003-003; read on the admin surface).
2. **`EngagementRequest`** gains the decision fields: a `declineReason` (retains the decline message — AC-DOOR-008-04), an `invitationTicket` (ties the acceptance invitation back to the request — AC-DOOR-007-04, written in TASK-003-005), and a `decidedAt` timestamp.
3. The **accountant-only read policy** for `Notification` (AC-DOOR-005-03), mirroring the existing `pol_EngagementRequest` pattern.
4. The **tier-3 test** proving the existing `pol_EngagementRequest` BLOCK predicates stop a CLIENT from deciding a request (the DB layer of AC-DOOR-006-04; the action-layer guard is TASK-003-005).

The `engagement_request` accountant-only **read** boundary already exists (`db/policies/0001-engagement-request-policy.sql`, EPIC-001) — do not recreate it; AC-DOOR-005-03 for requests is already covered there. CLIENT stays at zero rows for requests (clients never read requests in the MVP).

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `prisma/schema.prisma` | Modify | Add `Notification` model (accountant-scoped; FK → EngagementRequest; type/title/body, `readAt` nullable, `createdAt`); add `declineReason String? @db.NVarChar(Max)`, `invitationTicket String? @db.NVarChar(200)`, `decidedAt DateTime? @db.DateTimeOffset` to `EngagementRequest`; reverse relation. |
| `prisma/migrations/<ts>_epic003_inbox_schema/migration.sql` | Create | Generated Track A migration (`prisma migrate dev --name epic003_inbox_schema`). |
| `db/policies/0004-notification-policy.sql` | Create | `sec.fn_notification_access` ITVF (admin bypass + ACCOUNTANT pass + CLIENT/anon zero) + `sec.pol_Notification` FILTER + BLOCK predicates. Mirror `0001`. |
| `packages/db/src/notification.rls.test.ts` | Create | Tier-3: ACCOUNTANT reads notifications, CLIENT reads zero, null-context reads zero, admin bypass. |
| `packages/db/src/engagement-request.decide-boundary.rls.test.ts` | Create | Tier-3: CLIENT-context UPDATE of `EngagementRequest.status` is blocked; ACCOUNTANT-context UPDATE passes. |
| `packages/db/src/repositories/notification.ts` | Create | `createNotification` (admin-pool insert, used by TASK-003-003) + `listNotifications`/`markNotificationRead` (request-pool reads). Types exported via barrel. |
| `packages/db/src/index.ts` | Modify | Export the notification repository + the `Notification` Prisma type. |

## Tests to Write First

- [x] `AC-DOOR-005-03 — CLIENT context reads zero notifications` — expected: empty result under CLIENT SESSION_CONTEXT
- [x] `AC-DOOR-005-03 — anonymous/null context reads zero notifications` — expected: empty (fail-closed)
- [x] `AC-DOOR-005-03 — ACCOUNTANT reads all notifications` — expected: rows returned
- [x] `AC-DOOR-006-04 — CLIENT cannot UPDATE a request's status (BLOCK predicate)` — expected: @@ROWCOUNT=0 (SQL Server BLOCK predicate silently suppresses — no error; data unchanged, verified via admin read-back)
- [x] `AC-DOOR-006-04 — ACCOUNTANT can UPDATE a request's status` — expected: succeeds (@@ROWCOUNT=1; data mutated)

## Implementation Notes

- Apply policies via `pnpm db:policies:apply` after `prisma migrate dev`. Tests run against the real SQL Server container (see CLAUDE.md § Local Development Setup; ADR-003 Amendment-1 pooling note — no `@read_only`).
- `Notification` is **accountant-only** in the MVP (no client notifications — Phase 4). Keep the predicate the same shape as `fn_engagement_request_access`; the `@notificationId` arg may be included to match the ADR-005 skeleton for future client-ownership extension, but the MVP branch is admin-bypass + ACCOUNTANT-only.
- Do NOT generate notifications here (that is TASK-003-003) and do NOT build the accept/decline actions (TASK-003-005). This task is schema + policy + repository surface + the tier-3 boundary tests only.

## Work Log

### 2026-06-17 [webapp-developer] Starting implementation — schema + RLS + notification repository + tier-3 tests
**What was done:** Dispatch checkpoint edit. Read ENGINE.md, developer.md, task spec, BRIEF-003, existing policy files (0001/0003), prisma/schema.prisma, packages/db structure (client.ts, index.ts, admin-connection.ts, engagement-request.rls.test.ts, repositories/engagement-request.ts), and runbook (port 14330).
**What's next:** (1) Edit prisma/schema.prisma — add Notification model + EngagementRequest decision fields; (2) Run `pnpm prisma migrate dev --name epic003_inbox_schema`; (3) Create db/policies/0004-notification-policy.sql; (4) Run `pnpm db:policies:apply`; (5) Create notification repository; (6) Create tier-3 RLS tests; (7) Update packages/db/src/index.ts barrel; (8) Run submission gate.
**Blockers:** none

### 2026-06-17 [webapp-developer] Implementation complete — marking review
**What was done:**

**Track A — Prisma schema + migration:**
- Updated `prisma/schema.prisma`: added `declineReason`, `invitationTicket`, `decidedAt` to `EngagementRequest`; added `Notification` model with FK → EngagementRequest (ON DELETE SET NULL), reverse relation on EngagementRequest.
- Created `prisma/migrations/20260617000000_epic003_inbox_schema/migration.sql` — handcrafted SQL (same pattern as the init migration, bypassing the pre-existing P3019 Prisma `mssql`-vs-`sqlserver` schema-engine mismatch for `prisma migrate dev/deploy`).
- Applied migration directly via raw mssql driver (workaround for known P3019 infra issue, user-accepted from RETRO-002/RETRO-004 — carried follow-up, not introduced by this task).
- Ran `pnpm prisma generate` — Prisma client updated with Notification model.

**Env quirk recorded:** `pnpm prisma migrate dev --name epic003_inbox_schema` fails with P3019 (`mssql` vs `sqlserver` provider name mismatch in schema-engine wasm). `pnpm prisma migrate deploy` has the same failure. The handcrafted-migration + direct-apply workaround (from TASK-003 EPIC-001 precedent) was reapplied.

**Track B — RLS security policy:**
- Created `db/policies/0004-notification-policy.sql` — `sec.fn_notification_access` ITVF (admin bypass + ACCOUNTANT pass + CLIENT/null zero rows) + `sec.pol_Notification` FILTER + BLOCK predicates, mirroring `0001-engagement-request-policy.sql` exactly (SCHEMABINDING, GO-batched, CREATE OR ALTER FUNCTION sole-statement-per-batch).
- Applied via `pnpm db:policies:apply` — confirmed: `+ 0004-notification-policy.sql` applied.
- Verified in DB: `fn_notification_access` = `SQL_INLINE_TABLE_VALUED_FUNCTION`; `pol_Notification` enabled=true.

**Repository:**
- Created `packages/db/src/repositories/notification.ts` — `createNotification` (admin pool), `listNotifications` (request pool via `db` Prisma client), `markNotificationRead` (request pool).
- Updated `packages/db/src/index.ts` barrel — added `Notification` Prisma type export + notification repository exports.

**Tier-3 tests:**
- Created `packages/db/src/notification.rls.test.ts` — 4 tests: [POSITIVE] ACCOUNTANT reads, [NEGATIVE] null context zero rows, [NEGATIVE] CLIENT zero rows, [POSITIVE] admin bypass.
- Created `packages/db/src/engagement-request.decide-boundary.rls.test.ts` — 3 tests: [NEGATIVE] CLIENT UPDATE returns 0 rows affected (BLOCK predicate — silent suppress, data unchanged), [NEGATIVE] null context UPDATE blocked, [POSITIVE] ACCOUNTANT UPDATE succeeds + data verified.

**DECISION (BLOCK predicate behavior):** SQL Server BLOCK predicate for BEFORE/AFTER UPDATE does NOT throw an error — it silently suppresses the write, returning @@ROWCOUNT = 0. The CLIENT test asserts rowsAffected === 0 (not an exception), plus admin-pool read-back confirms the data is unchanged. This is correct SQL Server behavior documented in the test file.

**Submission gate results:**
- `pnpm lint` — PASS (exit 0)
- `pnpm type-check` — PASS (exit 0)
- `pnpm build` — PASS (exit 0)
- `pnpm --filter @tax-portal/db test` — PASS: **10 files, 48 tests, 0 failures** (1.64s)
  ```
  ✓ src/service.persistence.test.ts (4 tests)
  ✓ src/engagement-request.persistence.test.ts (5 tests)
  ✓ src/audit-event.rls.test.ts (9 tests)
  ✓ src/service.rls.test.ts (10 tests)
  ✓ src/session-context.propagation.test.ts (4 tests)
  ✓ src/services.query.test.ts (3 tests)
  ✓ src/engagement-request.decide-boundary.rls.test.ts (3 tests)
  ✓ src/engagement-request.rls.test.ts (4 tests)
  ✓ src/notification.rls.test.ts (4 tests)
  ✓ src/session-context.pooled-reuse.test.ts (2 tests)
  Test Files  10 passed (10)
       Tests  48 passed (48)
  ```

**Gate-Authoring evidence (Introduces-gate: yes — sec.pol_Notification + tier-3 test):**
1. **Run URL + step name:** `/tmp/db-test-full.log` — `packages/db/src/notification.rls.test.ts (4 tests) 64ms`; test names: `[POSITIVE] ACCOUNTANT role reads all notifications`, `[NEGATIVE] Null SESSION_CONTEXT (anonymous) reads ZERO notifications — fail-closed, no error`, `[NEGATIVE] CLIENT role reads ZERO notifications (not delivered to clients)`, `[POSITIVE] Admin pool (app_admin_role) reads all notifications — RLS-exempt`. All 4 passed.
2. **Named code path:** `sec.fn_notification_access` in `db/policies/0004-notification-policy.sql` — specifically the FILTER PREDICATE on `dbo.Notification` (STATE = ON, SCHEMABINDING = ON). The predicate's two positive branches: `IS_MEMBER('app_admin_role') = 1` (admin bypass) and `CAST(SESSION_CONTEXT(N'role') AS NVARCHAR(16)) = N'ACCOUNTANT'` (accountant read access).
3. **Counterfactual:** removing the `OR CAST(SESSION_CONTEXT(N'role') AS NVARCHAR(16)) = N'ACCOUNTANT'` branch from `fn_notification_access` would cause the `[POSITIVE] ACCOUNTANT role reads all notifications` test to return 0 rows instead of 1+, failing that gate. Removing the `IS_MEMBER` branch would cause the admin bypass test to return 0 rows. Removing the FILTER predicate entirely would cause the `[NEGATIVE] CLIENT reads ZERO` tests to return rows, failing those gates.

**What's next:** None — all developer-owned gates pass. Submitting for SDET review.
**Blockers:** none

### 2026-06-17 [sdet] SDET review — APPROVED
**What was done:** Ran mandatory rejection checklist (all PASS). Read ENGINE.md, sdet.md, PROGRESS.md, BRIEF-003, task spec, ADR-005, ADR-003, all delivered files. Independently ran `pnpm --filter @tax-portal/db test -- src/notification.rls.test.ts src/engagement-request.decide-boundary.rls.test.ts` → 2 files / 7 tests / 0 failures. Verified: policy predicate mirrors 0001 (ITVF/SCHEMABINDING/GO-batched/FILTER+BLOCK), fail-closed on null context, CLIENT reads 0, ACCOUNTANT reads all, admin bypass. Decide-boundary test: CLIENT UPDATE rowsAffected=0 + status unchanged via admin read-back (correct SQL Server BLOCK silent-suppress assertion). No @read_only violations. Gate-Authoring three-item evidence present. Stale service.rls.test.ts comment is a carried RETRO-002 item — not this task's scope. All AC-covered.
**What's next:** Task archived. IO to dispatch TASK-003-002 (email seam).
**Blockers:** none
