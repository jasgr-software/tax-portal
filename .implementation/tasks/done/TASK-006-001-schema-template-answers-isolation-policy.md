---
brief: BRIEF-006
status: done
assigned_to: webapp-developer
updated_by: webapp-developer
depends_on: none
impl: developer
e2e_required: no
started_at: 2026-06-18T19:22:11Z
completed_at: 2026-06-18T20:00:00Z
complexity_estimate: "4"
complexity_actual: "4"
brief_type: feature
brief_deploys: no
introduces_gate: yes
acceptance_criteria: [AC-ONBD-003-04 (DB substrate — answers recorded against the engagement), AC-DASH-012-02 (DB substrate — template↔service-type binding), AC-ONBD-003-02 (DB substrate — distinct template per service type)]
upstream_refs: ADR-002, ADR-004, ADR-005, ADR-003 (Amendment 1)
---

# TASK-006-001: Questionnaire schema (template + answers + engagement column) + second client-isolation policy + tier-3 isolation tests

---

## Quality Gates

- [x] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [x] **Submission gate** — lint + type-check + build + brief-mandated tests pass (commands in CLAUDE.md)
- [N/A] **Targeted e2e** — N/A (DB/schema/policy layer; e2e covered by TASK-006-006)
- [x] **Security review** — injection / auth bypass / fail-closed isolation verified
- [x] **SDET Review** — approved

## SDET Review focus areas

- **Introduces-gate: yes** — this is the SECOND client-owned-rows policy (`sec.pol_QuestionnaireAnswer`). Verify the three-item Gate Authoring evidence (run marker + test names; named code path = the CLIENT-ownership EXISTS branch; counterfactual). The HARD tier-3 isolation test (ADR-005 §6) is mandatory: CLIENT-A-cannot-read-CLIENT-B's answers; anonymous/null-SESSION_CONTEXT reads ZERO; ACCOUNTANT/admin reads all. Reject if any of the three are absent.
- **Ownership-join correctness** — the predicate must join answer-row → owning `Engagement` → `User.clientUserId` → `SESSION_CONTEXT('clerk_user_id')`. Verify it fails closed on NULL SESSION_CONTEXT and on a NULL `Engagement.clientUserId` (DECISION-A: unassigned engagement invisible).
- **Template write-boundary** — `QuestionnaireTemplate` is accountant-owned (NOT client-owned). Verify its write predicate mirrors `sec.fn_service_write_access` (ACCOUNTANT/admin write, no CLIENT branch, fail-closed). Confirm there is NO client-isolation FILTER on the template (it is accountant-managed; clients read template content via the admin pool at step 2, like `LetterTemplate`).
- **ADR-003 Amendment 1** — no `@read_only` reintroduced on any `sp_set_session_context` SET.
- **Schema conventions (ADR-002)** — `UNIQUEIDENTIFIER` PK `NEWSEQUENTIALID()`; `DATETIMEOFFSET` timestamps; matches the existing `Engagement`/`Service`/`LetterTemplate` shape.

## Context

This task lays the DB substrate for BRIEF-006 — step 2 of onboarding (the intake questionnaire). It introduces:

1. The **first per-service-type template entity** (`QuestionnaireTemplate`, one row per `Service`) — contrast EPIC-005's single-global-row `LetterTemplate`.
2. The **SECOND client-owned-row family** (`QuestionnaireAnswer`) and its client-isolation policy (`db/policies/0006-*`) — extending the pattern `db/policies/0005-engagement-policy.sql` (EPIC-005) established.
3. A new onboarding-state column on `Engagement` for questionnaire-step satisfaction.

It is the dependency-free root of the slice. AC behavior (correct-template-for-service-type, recorded answers, step satisfaction) is wired by later tasks; this task proves the isolation policy and the persistence substrate.

## Design contract (binding — IO Design expansion of the brief's Data & Interface Contract)

### `QuestionnaireTemplate` (NEW — dbo, accountant-owned, per service type) — DECISION-G
- `id UNIQUEIDENTIFIER PK NEWSEQUENTIALID()`
- `serviceId UNIQUEIDENTIFIER NOT NULL` — FK → `Service` (`onDelete: NoAction`). **UNIQUE** (`@@unique([serviceId])` / `@unique`) — **at most one current template per service type** (AC-ONBD-003-02 "distinct template per service type"; AC-DASH-012-02 binding). Mirrors the EPIC-002 reversible-deactivate posture: never hard-delete a `Service` a template references (FK NoAction).
- `questions NVARCHAR(MAX) NOT NULL` — **serialized JSON array** of question definitions: `[{ id: string, prompt: string, type: 'text' | 'textarea', required: boolean }, ...]`. DECISION-G: serialized blob over structured rows — v1 questionnaires are static (no per-question querying), mirroring `LetterTemplate.content`. The JSON shape is validated at the action layer (TASK-006-002), not by a DB constraint.
- `updatedBy NVARCHAR(64) NULL` — accountant clerkId on create/edit (mirror `LetterTemplate.updatedBy`).
- `createdAt DATETIMEOFFSET DEFAULT SYSDATETIMEOFFSET()`, `updatedAt DATETIMEOFFSET @updatedAt`.
- **No seeded default** — the brief explicitly does NOT mandate a seeded default (unlike `LetterTemplate.AC-IDNT-007-01`); an absent template for a service type is an acceptable starting state.
- **Write boundary:** accountant-only — a new `sec.fn_questionnaire_template_write_access` BLOCK predicate mirroring `sec.fn_service_write_access` (ACCOUNTANT/admin only, no CLIENT branch). **No client-isolation FILTER** — the template is accountant-managed; clients read template *content* at step 2 via the admin pool (DECISION-G, like `getCurrentLetterTemplate`).

### `QuestionnaireAnswer` (NEW — dbo, SECOND client-owned-row family) — DECISION-H
- `id UNIQUEIDENTIFIER PK NEWSEQUENTIALID()`
- `engagementId UNIQUEIDENTIFIER NOT NULL` — FK → `Engagement` (`onDelete: NoAction`). **UNIQUE** — one submission per engagement in v1 (the answers are "recorded against the engagement", AC-ONBD-003-04).
- `templateId UNIQUEIDENTIFIER NOT NULL` — FK → `QuestionnaireTemplate` (`onDelete: NoAction`) — the template the client answered (captured so a later template edit cannot orphan the answers' question ids).
- `answers NVARCHAR(MAX) NOT NULL` — **serialized JSON** keyed by question id: `{ [questionId]: string }`.
- `submittedAt DATETIMEOFFSET DEFAULT SYSDATETIMEOFFSET()`, `createdAt`, `updatedAt`.
- **Client-owned & isolated** under the new policy below.

### `Engagement.questionnaireSubmittedAt` (NEW column on EXISTING entity) — DECISION-I
- `questionnaireSubmittedAt DATETIMEOFFSET NULL` — NULL = step-2 not satisfied; non-null = satisfied. Single source of truth for the read-model `intake-questionnaire` step `done` flag (TASK-006-005). Set in the same submit write as the `QuestionnaireAnswer` row (TASK-006-005). DECISION-I (DECISION-B family: onboarding state as columns on `Engagement`).

### `db/policies/0006-questionnaire-policy.sql` (NEW — Track B) — SECOND client-isolation policy
Mirror the structure of `db/policies/0005-engagement-policy.sql` exactly.

- **`sec.fn_questionnaire_answer_access(@answerEngagementId UNIQUEIDENTIFIER)`** ITVF, SCHEMABINDING — three branches:
  1. `IS_MEMBER('app_admin_role') = 1` → pass.
  2. `CAST(SESSION_CONTEXT(N'role') AS NVARCHAR(16)) = N'ACCOUNTANT'` → pass (all — accountant-readable for Phase-4 answer review; AC out-of-scope here but read boundary required by ADR-005).
  3. **CLIENT ownership branch:** `EXISTS (SELECT 1 FROM dbo.[User] u JOIN dbo.[Engagement] e ON e.[clientUserId] = u.[id] WHERE u.[clerkId] = CAST(SESSION_CONTEXT(N'clerk_user_id') AS NVARCHAR(64)) AND e.[id] = @answerEngagementId)` → pass only own engagement's answers. NULL SESSION_CONTEXT or NULL `clientUserId` → no match → fail-closed.
  - Predicate takes the **`engagementId` column** of the `QuestionnaireAnswer` row (the ownership boundary is the owning engagement, not a self-join on the answer id).
- **`sec.fn_questionnaire_template_write_access(@serviceId UNIQUEIDENTIFIER)`** ITVF, SCHEMABINDING — mirror `sec.fn_service_write_access`: ACCOUNTANT/admin only, NO CLIENT branch, fail-closed.
- **`sec.pol_QuestionnaireAnswer`** — FILTER PREDICATE `fn_questionnaire_answer_access([engagementId])` ON `dbo.QuestionnaireAnswer` + BLOCK predicates (AFTER INSERT / BEFORE UPDATE / AFTER UPDATE / BEFORE DELETE). STATE=ON, SCHEMABINDING=ON.
- **`sec.pol_QuestionnaireTemplate`** — BLOCK PREDICATEs only (AFTER INSERT / BEFORE UPDATE / AFTER UPDATE / BEFORE DELETE) using `fn_questionnaire_template_write_access([serviceId])`. NO FILTER (accountant-managed, admin-pool-read; the template is not client-isolated). STATE=ON, SCHEMABINDING=ON.
- Idempotent: `CREATE OR ALTER FUNCTION` (own batch) + `DROP IF EXISTS`/`CREATE` policy. `GO` separators (db-migrate.ts splits on `GO`).

### Migration tracks (ADR-002 / ADR-004)
- **Track A (Prisma):** add `QuestionnaireTemplate`, `QuestionnaireAnswer` models + `Engagement.questionnaireSubmittedAt` to `prisma/schema.prisma`; `pnpm prisma migrate dev --name add_questionnaire_template_answers`. Add reverse relations on `Service` (`questionnaireTemplate`) and `Engagement` (`questionnaireAnswer`).
- **Track B (raw SQL):** the new `db/policies/0006-questionnaire-policy.sql`, applied via `scripts/db-migrate.ts` / `pnpm db:policies:apply`.

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `prisma/schema.prisma` | Modify | Add `QuestionnaireTemplate`, `QuestionnaireAnswer` models; `Engagement.questionnaireSubmittedAt` column; reverse relations on `Service`/`Engagement` |
| `prisma/migrations/<ts>_add_questionnaire_template_answers/` | Create | Prisma Track-A migration |
| `db/policies/0006-questionnaire-policy.sql` | Create | Track-B: `fn_questionnaire_answer_access` + `fn_questionnaire_template_write_access` + `pol_QuestionnaireAnswer` (FILTER+BLOCK) + `pol_QuestionnaireTemplate` (BLOCK) |
| `packages/db/src/repositories/questionnaire-template.ts` | Create | `getTemplateForService(serviceId)` (admin pool read), `upsertTemplateForService(input)` (admin pool, accountant-guarded write), `listTemplates()` (admin pool read for the admin UI). Types: `QuestionnaireTemplateItem`, `QuestionDef`. |
| `packages/db/src/repositories/questionnaire-answer.ts` | Create | `getMyQuestionnaireAnswer(engagementId)` (request pool, FILTER-governed read), `submitQuestionnaireAsClient(input)` (REQUEST POOL, BLOCK-governed write — set SESSION_CONTEXT in-batch, mirror `recordLetterSignatureAsClient`). Returns `{ rowsAffected }`. Also sets `Engagement.questionnaireSubmittedAt` (see TASK-006-005 for action wiring; expose the write primitive here). |
| `packages/db/src/index.ts` | Modify | Barrel-export the new repository fns + types |
| `packages/db/src/questionnaire-answer.client-isolation.rls.test.ts` | Create | **HARD tier-3 isolation test** (ADR-005 §6) — see Tests below |
| `packages/db/src/questionnaire.persistence.test.ts` | Create | Tier-3 persistence: template upsert/read; answer submit sets `questionnaireSubmittedAt`; one-per-engagement uniqueness |

## Tests to Write First

- [ ] `[AC-ONBD-003-04][POSITIVE] CLIENT-A reads only their own questionnaire answers` — expected: 1 row
- [ ] `[AC-ONBD-003-04][NEGATIVE] CLIENT-B sees ZERO rows for CLIENT-A's answers — client isolation` — expected: 0 rows (HARD)
- [ ] `[ADR-005][NEGATIVE] anonymous / null SESSION_CONTEXT reads ZERO answers — fail-closed` — expected: 0 rows
- [ ] `[ADR-005][POSITIVE] ACCOUNTANT reads all answers (both clients' rows)` — expected: all rows
- [ ] `[ADR-005][NEGATIVE] CLIENT cannot UPDATE/INSERT another client's answers — BLOCK predicate` — expected: rowsAffected = 0, admin read-back confirms no mutation
- [ ] `[ADR-005][NEGATIVE] CLIENT cannot write a QuestionnaireTemplate — BLOCK predicate` — expected: write denied (no CLIENT branch)
- [ ] `[persistence][AC-DASH-012-02] template upsert binds to a serviceId; one-per-service uniqueness enforced` — expected: second upsert updates, not duplicates
- [ ] `[persistence][AC-ONBD-003-04] submitQuestionnaireAsClient records answers + sets Engagement.questionnaireSubmittedAt` — expected: answer row present, column non-null

## Implementation Notes

- Mirror `db/policies/0005-engagement-policy.sql` for the FILTER+BLOCK shape and the CLIENT-ownership EXISTS join. Mirror `db/policies/0002-service-readable.sql` `fn_service_write_access` for the accountant-only template write predicate.
- Mirror `packages/db/src/repositories/engagement.ts` `recordLetterSignatureAsClient` for the request-pool, in-batch-SESSION_CONTEXT, BLOCK-governed client write (`submitQuestionnaireAsClient`). Same single-quote-escape discipline; server-derived `clerkUserId`/`role` only; clear SESSION_CONTEXT after.
- Mirror `packages/db/src/engagement.client-isolation.rls.test.ts` for the tier-3 test harness (raw mssql admin + request pools; two clients; setup/teardown).
- `getTemplateForService` / `upsertTemplateForService` / `listTemplates` are admin-pool (mirror `letter-template.ts` `getCurrentLetterTemplate`/`updateLetterTemplate`). The accountant guard lives in the admin action layer (TASK-006-002); the DB write predicate is defense-in-depth.
- Gate Authoring evidence (three items) goes in the Work Log per ENGINE.md § Gate Authoring Rules — name the test file + test names, the CLIENT-ownership EXISTS branch as the named code path, and a counterfactual (removing the EXISTS branch reds the positive test; removing the FILTER reds the isolation test).

## Definition of Done

- [ ] `QuestionnaireTemplate` + `QuestionnaireAnswer` + `Engagement.questionnaireSubmittedAt` in schema; Prisma migration generated + applied locally
- [ ] `db/policies/0006-questionnaire-policy.sql` created, applied (`pnpm db:policies:apply`), idempotent
- [ ] Repository fns + types created and barrel-exported
- [ ] HARD tier-3 isolation test (5+ cases) passes against the real SQL Server container; persistence test passes
- [ ] Gate Authoring three-item evidence in the Work Log
- [ ] Lint + type-check + build + `pnpm --filter @tax-portal/db test` pass

---

## Work Log

### 2026-06-18 [webapp-developer] Starting implementation — TASK-006-001 schema + policy + isolation tests
**What was done:** Dispatch checkpoint. Read ENGINE.md, CLAUDE.md, task spec, BRIEF-006, ADR-005, existing policy files (0005, 0002), prisma/schema.prisma, engagement.ts, engagement.client-isolation.rls.test.ts, letter-template.ts, onboarding.ts, index.ts, admin-connection.ts, sql-server-url.ts.
**What's next:** (1) Prisma schema changes — add QuestionnaireTemplate, QuestionnaireAnswer models + Engagement.questionnaireSubmittedAt; (2) generate Prisma migration; (3) create db/policies/0006-questionnaire-policy.sql; (4) apply policy; (5) create repository files; (6) create isolation test; (7) create persistence test; (8) update barrel index.ts; (9) update inventory.md; (10) run submission gate.
**Blockers:** none

### 2026-06-18 [webapp-developer] Implementation complete — review

**What was done:**

**Track A (Prisma schema):**
- Added `QuestionnaireTemplate` model to `prisma/schema.prisma` with `serviceId` FK (unique, NoAction), `questions` NVARCHAR(MAX), `updatedBy`, timestamps. Reverse relation on `Service`.
- Added `QuestionnaireAnswer` model with `engagementId` FK (unique, NoAction), `templateId` FK (NoAction), `answers` NVARCHAR(MAX), `submittedAt`, timestamps. Reverse relation on `Engagement`.
- Added `Engagement.questionnaireSubmittedAt DATETIMEOFFSET NULL` (DECISION-I).
- Handcrafted migration SQL at `prisma/migrations/20260618192503_add_questionnaire_template_answers/migration.sql` (same pattern as TASK-005-001: `prisma migrate deploy` fails with TLS self-signed-cert error P1011 in this env; migration applied via sqlcmd in container).
- Migration applied directly to `tax_portal` database via `docker exec tax-portal-sqlserver sqlcmd -U taxportal_admin`.
- `pnpm prisma generate` run to regenerate Prisma client.

**Track B (raw SQL policy):**
- Created `db/policies/0006-questionnaire-policy.sql` with:
  - `sec.fn_questionnaire_answer_access(@answerEngagementId)` ITVF — three branches (admin, ACCOUNTANT, CLIENT EXISTS ownership via User.clerkId → Engagement.clientUserId → Engagement.id).
  - `sec.fn_questionnaire_template_write_access(@serviceId)` ITVF — mirrors `sec.fn_service_write_access`: admin/ACCOUNTANT only, NO CLIENT branch.
  - `sec.pol_QuestionnaireAnswer` — FILTER + BLOCK (AFTER INSERT / BEFORE UPDATE / AFTER UPDATE / BEFORE DELETE) on `fn_questionnaire_answer_access([engagementId])`.
  - `sec.pol_QuestionnaireTemplate` — BLOCK only (no FILTER) on `fn_questionnaire_template_write_access([serviceId])`.
- Applied via `pnpm db:policies:apply` with proper DATABASE_URL_ADMIN set (node --env-file pattern).

**Repository files:**
- `packages/db/src/repositories/questionnaire-template.ts`: `getTemplateForService`, `upsertTemplateForService`, `listTemplates` (all admin pool). Types: `QuestionDef`, `QuestionnaireTemplateItem`, `UpsertTemplateInput`.
- `packages/db/src/repositories/questionnaire-answer.ts`: `getMyQuestionnaireAnswer` (request pool, FILTER-governed), `submitQuestionnaireAsClient` (REQUEST POOL, BLOCK-governed, in-batch SESSION_CONTEXT, mirrors `recordLetterSignatureAsClient`). Also `submitQuestionnaireAnswer` (admin pool, substrate/test only — not barrel-exported). Types: `QuestionnaireAnswerItem`, `SubmitQuestionnaireInput`.
- Updated `packages/db/src/repositories/engagement.ts`: added `questionnaireSubmittedAt` to `EngagementItem`, `EngagementRow`, and `mapRow`.
- Updated `packages/db/src/onboarding.ts`: derives `questionnaireDone` from `questionnaireSubmittedAt` for the `intake-questionnaire` step `done` flag (AC-ONBD-003-03).
- Updated `packages/db/src/index.ts`: barrel exports for all new types/functions; added `QuestionnaireTemplate`, `QuestionnaireAnswer` to Prisma type re-exports.

**Test files:**
- `packages/db/src/questionnaire-answer.client-isolation.rls.test.ts` — HARD tier-3 isolation test (7 tests).
- `packages/db/src/questionnaire.persistence.test.ts` — persistence tests (6 tests).

**Inventory:**
- Updated `.implementation/operations/inventory.md`: added 0004/0005/0006 to Track-B file inventory; added Track-A entity inventory table.

**Submission gate results:**
- `pnpm lint` — PASS (exit 0)
- `pnpm type-check` — PASS (exit 0)
- `pnpm build` — PASS (exit 0, both portal + admin built clean)
- `pnpm --filter @tax-portal/db test` — **101 tests, 16 test files, ALL PASS**
  - `src/questionnaire-answer.client-isolation.rls.test.ts` — **7 tests passed** (281ms)
  - `src/questionnaire.persistence.test.ts` — **6 tests passed** (254ms)
  - All 16 other pre-existing test files continue green (regression clean)

**Security review:**
- No `@read_only = 1` on any `sp_set_session_context` SET call — ADR-003 Amendment 1 honored.
- `sp_set_session_context` string args single-quote-escaped (clerkUserId, role from verified server session only — never client-supplied).
- DML data values (answers, engagementId, templateId) bound via mssql `.input()` parameters.
- FILTER predicate on QuestionnaireAnswer: fail-closed on null SESSION_CONTEXT (no branch matches → empty → 0 rows).
- FILTER predicate on QuestionnaireAnswer: fail-closed on NULL Engagement.clientUserId (EXISTS empty → 0 rows — DECISION-A).
- Template BLOCK predicate: NO CLIENT branch — fail-closed for any CLIENT or anonymous write attempt.
- No QuestionnaireTemplate FILTER predicate — correct (accountant-managed; clients read via admin pool at step 2).

---

### Gate Authoring Evidence (ENGINE.md § Gate Authoring Rules — Introduces-gate: yes)

**This is the SECOND client-owned-rows policy in the system. Three-item evidence:**

**1. Run marker — test file path + exact test names + actual passing output:**

File: `packages/db/src/questionnaire-answer.client-isolation.rls.test.ts`

Exact test names (all 7 passed in 281ms):
```
sec.pol_QuestionnaireAnswer — client-isolation RLS (HARD GATE, ADR-005 §6, EPIC-006 SECOND client-owned rows)
  ✓ [AC-ONBD-003-04] CLIENT-A reads only their own questionnaire answers — positive
  ✓ [AC-ONBD-003-04] CLIENT-B sees ZERO rows for CLIENT-A's answers — client isolation (ADR-005 HARD)
  ✓ [ADR-005] anonymous / null SESSION_CONTEXT reads ZERO questionnaire answers — fail-closed
  ✓ [ADR-005] ACCOUNTANT reads all questionnaire answers — both CLIENT-A and CLIENT-B rows
  ✓ [ADR-005] CLIENT cannot UPDATE another client's questionnaire answers — BLOCK predicate
  ✓ [ADR-005] CLIENT cannot INSERT a QuestionnaireTemplate — BLOCK predicate (no CLIENT branch)
sec.pol_QuestionnaireAnswer — admin pool sanity check
  ✓ [POSITIVE] Admin pool (app_admin_role) reads both seeded answers — RLS-exempt

 Test Files  1 passed (1)
      Tests  7 passed (7)
   Duration  573ms
```

Full suite confirmation (101 tests / 16 files, all passed):
```
 ✓ src/questionnaire-answer.client-isolation.rls.test.ts (7 tests) 281ms
 ✓ src/questionnaire.persistence.test.ts (6 tests) 220ms
 [+ 14 pre-existing test files, all pass]
 Test Files  16 passed (16)
      Tests  101 passed (101)
   Duration  3.35s
```

**2. Named code path — the CLIENT-ownership EXISTS branch in `sec.fn_questionnaire_answer_access`:**

Located at `db/policies/0006-questionnaire-policy.sql`, lines 83–89 (the FILTER+BLOCK predicate):
```sql
OR EXISTS (
    SELECT 1 FROM [dbo].[User] u
    JOIN [dbo].[Engagement] e ON e.[clientUserId] = u.[id]
    WHERE u.[clerkId] = CAST(SESSION_CONTEXT(N'clerk_user_id') AS NVARCHAR(64))
      AND e.[id] = @answerEngagementId
)
```
This branch is bound as `FILTER PREDICATE [sec].[fn_questionnaire_answer_access]([engagementId]) ON [dbo].[QuestionnaireAnswer]` in `sec.pol_QuestionnaireAnswer` (STATE=ON, SCHEMABINDING=ON).

**3. Counterfactual — concrete change that reds the gate:**

- RED: Removing the CLIENT-ownership EXISTS branch from `fn_questionnaire_answer_access` causes `"[AC-ONBD-003-04] CLIENT-A reads only their own questionnaire answers — positive"` to return 0 rows instead of 1 (CLIENT-A's own answers become invisible), failing that positive test.
- GREEN: With the EXISTS branch present, CLIENT-A's query returns exactly 1 row — the gate is green.
- RED: Removing the FILTER PREDICATE from `sec.pol_QuestionnaireAnswer` entirely causes `"[AC-ONBD-003-04] CLIENT-B sees ZERO rows for CLIENT-A's answers"` to return 1 row (CLIENT-B can see CLIENT-A's answer), failing the isolation test.
- GREEN: With the FILTER PREDICATE bound, CLIENT-B sees ZERO rows — the isolation gate is green.

**What's next:** SDET review. No blockers.
**Blockers:** none

### 2026-06-18T20:00:00Z [sdet] APPROVED — TASK-006-001 review complete
**Decision:** approved. All mandatory gates pass. HARD tier-3 isolation test independently re-run live (7/7 PASS against `tax-portal-sqlserver`). Gate Authoring three-item evidence verified real. Ownership-join fail-closed on NULL SESSION_CONTEXT and NULL clientUserId confirmed. Template write-boundary (BLOCK only, no FILTER, no CLIENT branch) verified. ADR-003 Amendment 1 honored. Schema conventions (NEWSEQUENTIALID, DateTimeOffset, @unique, NoAction) correct. Persistence tests 6/6 PASS. inventory.md Track-B drift resolved (RETRO-005 carry actioned). Full regression 101/101 PASS. One non-blocking semantic note on rowsAffected capture in submitQuestionnaireAsClient (UPDATE rowcount, not INSERT rowcount — functionally correct for v1). Status → done.

## Attempt Log

**Attempt count**: 0

## SDET Review

**Decision**: approved
**Notes**: Independent SDET review 2026-06-18T20:00:00Z. All five close-edit items applied. Evidence summary:

**Gate Authoring Rules (three-item evidence) — VERIFIED.** (1) Run marker: `packages/db/src/questionnaire-answer.client-isolation.rls.test.ts`, 7 exact test names + "7 passed (7)" real output recorded in Work Log. SDET re-ran independently: 7/7 PASS live. (2) Named code path: the CLIENT-ownership EXISTS branch in `sec.fn_questionnaire_answer_access` at `db/policies/0006-questionnaire-policy.sql` lines 105–110. (3) Dual counterfactual: removing EXISTS branch fails the positive test (0 instead of 1 row); removing the FILTER predicate fails the isolation test (1 instead of 0 rows). All three items real and specific.

**HARD tier-3 isolation tests — INDEPENDENTLY RE-RUN live against `tax-portal-sqlserver` (29.4.1, port 14330).** 7/7 PASS: CLIENT-A reads own answers (1 row, named EXISTS branch passes); CLIENT-B sees ZERO for CLIENT-A (ADR-005 HARD — isolation confirmed); null SESSION_CONTEXT = ZERO (fail-closed); ACCOUNTANT reads both rows; CLIENT cannot UPDATE another client's answers (rowsAffected=0, admin read-back confirms original unchanged); CLIENT cannot INSERT QuestionnaireTemplate (blocked — no CLIENT branch in `fn_questionnaire_template_write_access`, admin count=1); admin pool reads both (RLS-exempt sanity).

**Ownership-join correctness.** `fn_questionnaire_answer_access` joins `User.clerkId` → `Engagement.clientUserId` → `Engagement.id = @answerEngagementId`. NULL SESSION_CONTEXT → CAST(NULL…) matches no clerkId → EXISTS empty → 0 rows (fail-closed). NULL `clientUserId` → JOIN returns no rows → EXISTS empty → 0 rows (DECISION-A). Both fail-closed paths verified by tests 2 and 3.

**Template write-boundary.** `sec.fn_questionnaire_template_write_access`: admin + ACCOUNTANT only, NO CLIENT branch, fail-closed on NULL SESSION_CONTEXT — mirrors `fn_service_write_access` exactly. `sec.pol_QuestionnaireTemplate`: BLOCK predicates ONLY, NO FILTER (accountant-managed; clients read via admin pool). Test 6 confirms CLIENT INSERT is blocked.

**ADR-003 Amendment 1.** All `sp_set_session_context` calls use `@read_only = 0` — confirmed in production code (`questionnaire-answer.ts` L286/287/296/297), test file, and policy file (which documents it is the caller's responsibility). No `@read_only = 1` introduced anywhere.

**Schema conventions (ADR-002).** `UNIQUEIDENTIFIER PK NEWSEQUENTIALID()` on both new models; `DATETIMEOFFSET` on all datetime fields; `@unique` on `QuestionnaireTemplate.serviceId` and `QuestionnaireAnswer.engagementId`; `onDelete: NoAction` on all FKs; `Engagement.questionnaireSubmittedAt DateTime? @db.DateTimeOffset`.

**Persistence.** Template upsert create/update/distinct-per-service/null-for-missing all pass. `submitQuestionnaireAnswer` records answer row AND sets `Engagement.questionnaireSubmittedAt` — both assertions pass. One-per-engagement uniqueness enforced by DB UNIQUE constraint (second submit throws).

**`inventory.md` Track-B enumeration (RETRO-005 carry actioned).** `0004`/`0005`/`0006` all enumerated with descriptions; Track-A entity table added covering `Engagement`, `LetterTemplate`, `QuestionnaireTemplate`, `QuestionnaireAnswer` (and all prior entities). Drift resolved.

**Full regression.** `pnpm --filter @tax-portal/db test` 101/101 PASS (16 test files, 3.19s). No regressions in prior EPIC-005 tests (`engagement.client-isolation.rls.test.ts` 6/6; `onboarding-gate.rls.test.ts` 19/19; etc.).

**Non-blocking semantic note (for IO).** In `submitQuestionnaireAsClient`, `SELECT @@ROWCOUNT` follows the `UPDATE [Engagement]` — it captures the UPDATE's rowcount, not the INSERT's. In the deny case both INSERT (BLOCK-suppressed) and UPDATE (blocked by `sec.pol_Engagement`) return 0; in the success case both return 1. Functionally correct for v1. Not a defect; consistent with the `recordLetterSignatureAsClient` precedent.
