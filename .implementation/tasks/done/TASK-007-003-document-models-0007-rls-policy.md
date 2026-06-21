---
brief: BRIEF-007
status: done
assigned_to: webapp-developer
updated_by: webapp-developer
depends_on: none
impl: developer
e2e_required: "no"
started_at: 2026-06-19T12:27:38Z
completed_at: 2026-06-19T08:10:00Z
complexity_estimate: 4
complexity_actual: 4
brief_type: feature
brief_deploys: "no"
introduces_gate: "yes"
acceptance_criteria: [AC-FILE-008-01 (each engagement has a checklist reflecting its document requests — the schema relationship), AC-FILE-001-05 (a file in engagement A is not exposed to other engagements — proven by the `0007` FILTER predicate), AC-FILE-003-02 (retrieval requires an authorization check — the FILTER predicate is that gate at the data layer).]
upstream_refs: ADR-005 (RLS via security policies; THIRD client-isolation policy after `0005`/`0006`; HARD §6 per-policy integration test; ITVF+SCHEMABINDING; shallow predicate), ADR-002 (UNIQUEIDENTIFIER PK NEWSEQUENTIALID(), DATETIMEOFFSET, two-track migrations), ADR-009 (storage-key columns + `pending｜active｜infected` state column), ADR-003 (null SESSION_CONTEXT → ZERO; Amendment 1 — no `@read_only`).
---





# TASK-007-003: DocumentRequest + Document Prisma models + `0007` RLS policy (third client-isolation policy) + cross-engagement isolation test

---

## Quality Gates

- [x] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [x] **Submission gate** — lint + type-check + build + brief-mandated tests pass (commands in CLAUDE.md)
- [N/A] **Targeted e2e** — policy is proven at tier-3 integration, not e2e
- [x] **Security review** — fail-closed null SESSION_CONTEXT; client cannot write document-requests; cross-engagement isolation holds
- [x] **SDET Review** — approved

## SDET Review focus areas

- **Gate-authoring (ENGINE.md § Gate Authoring Rules) — three items MANDATORY in the Work Log** for the new `0007` policy: (1) run/log path + the test name that ran the per-policy isolation test green against the **real SQL Server container**; (2) the named predicate code path (the CLIENT-ownership `EXISTS` branch); (3) the counterfactual (removing the FILTER predicate reds the isolation test; removing the CLIENT branch reds the positive read).
- **ADR-005 §6 HARD per-policy test** must assert ALL of: a Document in engagement A is **unreadable/unreachable** from engagement B (CLIENT-B reads ZERO); a CLIENT reading their **own** engagement's documents succeeds; an **anonymous / null-SESSION_CONTEXT** caller reads **ZERO**; **ACCOUNTANT/admin** can read.
- **DocumentRequest write boundary is accountant-only** — mirror `sec.fn_service_write_access` (BLOCK-only, no CLIENT branch); a request-pool CLIENT INSERT/UPDATE/DELETE fails closed. A CLIENT *reads* requests for their own engagement (FILTER via the owning Engagement).
- **Document state column** is `pending｜active｜infected` (default `pending`); verify the enum/CHECK + default. The ownership predicate joins Document → owning Engagement → User.clerkId (mirror `0005`/`0006`).
- Track-B drift: the inventory.md Track-B policy table gains the `0007` row(s).

## Context

The third client-isolation policy. Adds two Prisma models — `DocumentRequest` (accountant-authored, per engagement; free-text label) and `Document` (the stored-file metadata row; storage key + safety state) — and the raw-SQL `db/policies/0007-*` security policy that scopes both to their owning engagement. The Document/file rows are the **third client-owned-row family**. Reuse `0005-engagement-policy.sql` (ownership join) and the `0006` two-part-policy file structure (FILTER+BLOCK for the client-owned table; BLOCK-only accountant-write for the request table).

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `prisma/schema.prisma` | Modify | Add `DocumentRequest` + `Document` models (see § Data shape below); add reverse relations on `Engagement` |
| `prisma/migrations/*/migration.sql` | Create | `pnpm prisma migrate dev --name document-request-and-document` (Track A) |
| `db/policies/0007-document-policy.sql` | Create | Two-part policy: (1) `sec.fn_document_access(@engagementId)` FILTER+BLOCK on `Document` (client-owned, ownership join → Engagement → User.clerkId; mirror `0006` PART 1); (2) `sec.fn_document_request_*` for `DocumentRequest` — FILTER (client reads own engagement's requests) + BLOCK accountant-only write (mirror `0006` PART 2 / `fn_service_write_access`) |
| `packages/db/src/document.client-isolation.rls.test.ts` | Create | **The ADR-005 §6 HARD per-policy tier-3 test** (cross-engagement isolation; null-context ZERO; ACCOUNTANT/admin read) against the real container |
| `packages/db/src/document-request.rls.test.ts` | Create | DocumentRequest FILTER (client reads own) + BLOCK (client write denied) tier-3 test |
| `.implementation/operations/inventory.md` | Modify | Add `0007` to the Track-B policy table |

## Data shape (the IO-expanded Data & Interface Contract — binding)

**`DocumentRequest`** (accountant-authored checklist item):
- `id` UNIQUEIDENTIFIER PK `NEWSEQUENTIALID()`
- `engagementId` UNIQUEIDENTIFIER FK → `Engagement` (onDelete: NoAction)
- `label` NVARCHAR(...) — the free-text label (AC-FILE-007-01); reasonable length cap (e.g. 500)
- `createdBy` NVARCHAR(64)? — accountant clerkId (audit, mirror `LetterTemplate.updatedBy`)
- `createdAt` / `updatedAt` DATETIMEOFFSET
- reverse relation: `documents Document[]` (the documents uploaded in response)

**`Document`** (stored-file metadata row; the third client-owned-row family):
- `id` UNIQUEIDENTIFIER PK `NEWSEQUENTIALID()`  *(this is the ADR-009 `documentId`)*
- `engagementId` UNIQUEIDENTIFIER FK → `Engagement` (onDelete: NoAction) — **the isolation column** the FILTER predicate keys on
- `documentRequestId` UNIQUEIDENTIFIER? FK → `DocumentRequest` (onDelete: NoAction) — **fulfillment is a nullable FK** (DECISION below)
- `storageKey` NVARCHAR(1024) — the ADR-009 key `engagements/{engagementId}/documents/{id}/v1/{urlencoded-filename}`
- `originalFilename` NVARCHAR(...) — authoritative filename (ADR-009)
- `contentType` NVARCHAR(255) — declared content-type
- `sizeBytes` BIGINT (`@db.BigInt`) — claimed/verified size
- `status` NVARCHAR(16) default `'pending'` — `pending｜active｜infected` (CHECK constraint via raw-SQL migration if Prisma can't express it)
- `version` INT default 1 — v1 only this slice (no replace/history)
- `scanThreat` NVARCHAR(...)? — optional threat label when `infected`
- `uploadedBy` NVARCHAR(64)? — uploader clerkId (audit)
- `createdAt` / `updatedAt` DATETIMEOFFSET

`Engagement` gains reverse relations: `documentRequests DocumentRequest[]`, `documents Document[]`.

**// DECISION (TASK-007-003):** Fulfillment is a **nullable FK `Document.documentRequestId`** (not a join table). A `DocumentRequest` is *fulfilled* when ≥1 `active` Document references it; *outstanding* otherwise (the read model computes this — TASK-007-004). Rationale: v1 ships one-document-per-request semantics with no versioning/history (brief Out-of-scope); a FK is the simplest representation that supports the outstanding/fulfilled derivation and keeps the isolation predicate a single shallow join.

**// DECISION (TASK-007-003):** Required-vs-optional checklist items — in v1 **all of an engagement's document requests are required**; the step is satisfied when every request has ≥1 `active` Document (AC-ONBD-004-04). No optionality UI ships (brief: "do not invent an optionality UI not in the AC"). An engagement with **zero** requests has a vacuously-satisfied upload step (consistent with "required items provided").

## Tests to Write First

- [x] `[tier-3] Document in engagement A unreadable from engagement B (AC-FILE-001-05)` — expected: CLIENT-B reads ZERO
- [x] `[tier-3] CLIENT reads own engagement's Documents (AC-FILE-003-02 gate)` — expected: own rows visible
- [x] `[tier-3] null SESSION_CONTEXT reads ZERO Documents` — expected: fail-closed
- [x] `[tier-3] ACCOUNTANT/admin read all Documents` — expected: visible
- [x] `[tier-3] CLIENT cannot INSERT/UPDATE a DocumentRequest` — expected: BLOCK denies (rowsAffected 0 / error 33504)
- [x] `[tier-3] CLIENT reads own engagement's DocumentRequests` — expected: visible; engagement B's not visible

## Implementation Notes

- **Mirror `0006-questionnaire-policy.sql` structure** (two-part file: client-owned FILTER+BLOCK + accountant-owned BLOCK-only) and the `0005` ownership join (`User.clerkId` → `Engagement.clientUserId` → row's `engagementId`). Predicate stays shallow (one/two JOINs, ITVF+SCHEMABINDING).
- **Two migration tracks (ADR-002):** model → `prisma migrate dev` (Track A); the policy + any CHECK constraint Prisma can't express → `db/policies/0007-*` (Track B, applied by `scripts/db-migrate.ts`).
- The `status` CHECK and the FILTER/BLOCK live in Track B; the columns/FKs live in Track A.
- This task does **not** wire upload/scan logic — that is TASK-007-004. It delivers the data substrate + the proven isolation gate only.

## Definition of Done

- [x] `DocumentRequest` + `Document` models + migration applied; `Engagement` reverse relations added
- [x] `db/policies/0007-document-policy.sql` (FILTER+BLOCK on Document; FILTER + accountant-only BLOCK on DocumentRequest) applied idempotently
- [x] The ADR-005 §6 HARD per-policy isolation tier-3 test green against the real container, with the three Gate-Authoring evidence items in the Work Log
- [x] inventory.md Track-B table includes `0007`
- [x] Lint + type-check + build pass; `pnpm --filter @tax-portal/db test` green

---

## Work Log

### 2026-06-19 [webapp-developer] Starting implementation — DocumentRequest + Document Prisma models + 0007 RLS policy + tier-3 isolation tests | What's next: read existing schema + policy files, then Track A (Prisma migrate) then Track B (policy SQL) then tests | Blockers: none

### 2026-06-19 [webapp-developer] Implementation complete — STATUS: review

**What was done:**

**Track A (Prisma schema):**
- Added `DocumentRequest` model with FK → Engagement (NoAction), label NVARCHAR(500), createdBy NVARCHAR(64)
- Added `Document` model with FK → Engagement (NoAction/NoAction — cyclic cascade fix), nullable FK → DocumentRequest (NoAction/NoAction), ADR-009 storageKey/originalFilename/contentType/sizeBytes(@db.BigInt)/status(default 'pending')/version/scanThreat/uploadedBy
- Added `Engagement` reverse relations: `documentRequests DocumentRequest[]`, `documents Document[]`
- Note: `prisma migrate dev` and `prisma migrate deploy` both fail with P3019 (Prisma 5.22.x WASM infers `mssql` provider from the `sqlserver://` URL scheme, conflicting with `migration_lock.toml`). Same P3019 issue documented in TASK-006-001 (which noted `migrate dev` only; `migrate deploy` now fails too). Applied Track A migration SQL directly via mssql (same pattern as all prior migrations — no `_prisma_migrations` table exists in the DB). Migration created at `prisma/migrations/20260619123152_document-request-and-document/migration.sql`.
- `pnpm prisma generate` run successfully after migration.

**Track B (0007 policy):**
- Created `db/policies/0007-document-policy.sql` with:
  - PART 0: `Document_status_chk` CHECK constraint (`'pending'|'active'|'infected'`) — idempotent
  - PART 1: `sec.fn_document_access` (ITVF+SCHEMABINDING; 3 branches: admin/accountant/CLIENT EXISTS) + `sec.pol_Document` (FILTER+BLOCK)
  - PART 2: `sec.fn_document_request_access` (FILTER read predicate, 3 branches) + `sec.fn_document_request_write_access` (BLOCK write predicate, 2 branches — NO CLIENT) + `sec.pol_DocumentRequest` (FILTER via access fn + BLOCK via write fn)
- Applied via direct mssql execution (same as Track A migration); recorded in `__db_migrations`

**Tests (tier-3):**
- Created `packages/db/src/document.client-isolation.rls.test.ts` — 8 tests (5 isolation + 2 CHECK + 1 admin sanity)
- Created `packages/db/src/document-request.rls.test.ts` — 7 tests (FILTER reads + BLOCK writes + admin sanity)
- Full `pnpm --filter @tax-portal/db test`: **20 test files, 132 tests, ALL PASS**

**Inventory:**
- Updated `.implementation/operations/inventory.md` — added `0007-document-policy.sql` row to Track B table and `DocumentRequest`/`Document` to Track A entity table

---

**GATE AUTHORING EVIDENCE (ENGINE.md § Gate Authoring Rules — INTRODUCES-GATE: yes)**

**1. Run path + test names (green against real SQL Server container `tax-portal-sqlserver` at localhost:14330):**
   - Log file: `/tmp/db-final-test.log` — `pnpm --filter @tax-portal/db test` → 20 test files, 132 tests, ALL PASS
   - Specific test names for the `0007` isolation gate:
     - `src/document.client-isolation.rls.test.ts`:
       - `[AC-FILE-001-05] Document in engagement A unreadable from engagement B — CLIENT-B reads ZERO (ADR-005 HARD)`
       - `[AC-FILE-003-02] CLIENT reads own engagement's Documents — positive (authorization gate at data layer)`
       - `[ADR-005] anonymous / null SESSION_CONTEXT reads ZERO Documents — fail-closed`
       - `[ADR-005] ACCOUNTANT reads all Documents — both CLIENT-A and CLIENT-B rows`
       - `[ADR-005] CLIENT cannot UPDATE another client's Document — BLOCK predicate silent suppress`
     - `src/document-request.rls.test.ts`:
       - `[AC-FILE-007-02] CLIENT reads own engagement's DocumentRequests — visible via FILTER`
       - `[AC-FILE-007-02] CLIENT cannot see another engagement's DocumentRequests — ZERO rows`
       - `[ADR-005] CLIENT cannot INSERT a DocumentRequest — BLOCK predicate (no CLIENT branch)`
       - `[ADR-005] CLIENT cannot UPDATE a DocumentRequest — BLOCK predicate (no CLIENT branch)`

**2. Named predicate code path (CLIENT-ownership EXISTS branch in `db/policies/0007-document-policy.sql`):**
   ```sql
   OR EXISTS (
       SELECT 1 FROM [dbo].[User] u
       JOIN [dbo].[Engagement] e ON e.[clientUserId] = u.[id]
       WHERE u.[clerkId] = CAST(SESSION_CONTEXT(N'clerk_user_id') AS NVARCHAR(64))
         AND e.[id] = @documentEngagementId
   )
   ```
   This is in `sec.fn_document_access` — the FILTER PREDICATE on `dbo.Document` (STATE=ON, SCHEMABINDING=ON).

**3. Counterfactual (both directions verified by local temporary edit):**
   - **Removing the CLIENT EXISTS branch** (from `fn_document_access`): test `[AC-FILE-003-02] CLIENT reads own engagement's Documents — positive` FAILS (CLIENT-A returns 0 rows instead of 1). Verified: dropped `pol_Document`, altered function, recreated policy — test failed as expected. Restored.
   - **Removing the FILTER predicate** (recreated `pol_Document` with BLOCK predicates only, no FILTER): test `[AC-FILE-001-05] Document in engagement A unreadable from engagement B` FAILS (CLIENT-B returns 1 row — cross-engagement leak). Null-context test also fails. Verified. Restored. Full suite re-confirmed green (132/132) after restoration.

**Submission gate results:**
- `pnpm lint` — PASS (zero warnings)
- `pnpm type-check` — PASS (zero errors)
- `pnpm build` — PASS (clean build, all apps)
- `pnpm --filter @tax-portal/db test` — **132 passed, 0 failed, 20 test files**

**What's next:** SDET review | Blockers: none

### 2026-06-19 [sdet] APPROVED — independent gate re-run: 20 test files / 132 tests all PASS against live SQL Server container (`tax-portal-sqlserver`). Targeted isolation re-run: `src/document.client-isolation.rls.test.ts` (8/8) + `src/document-request.rls.test.ts` (7/7) all PASS. Lint PASS, type-check PASS. All five mandatory focus areas verified (gate-authoring three items present; ADR-005 §6 HARD isolation proof confirmed; two-part policy correctness verified; Data & Interface Contract compliant; inventory.md Track-B/Track-A consistent). Status: done.

## Attempt Log

**Attempt count**: 0

## SDET Review

**Decision**: approved
**Notes**: All mandatory rejection checks passed. Independent gate re-run (`pnpm --filter @tax-portal/db test`) confirmed 20 test files / 132 tests all PASS against live SQL Server container. Targeted re-run of both RLS test files confirmed 15/15 PASS. Lint PASS, type-check PASS.

FA-1 (Gate-Authoring — three items, ENGINE.md § Gate Authoring Rules): All three present. (1) Run marker: developer log `/tmp/db-final-test.log` + independently confirmed in `/tmp/task-007-003-db-test.log`; test names cited verbatim in Work Log. (2) Named code path: CLIENT-ownership EXISTS branch in `sec.fn_document_access` (lines 133–138 of `db/policies/0007-document-policy.sql`). (3) Counterfactual: removing CLIENT EXISTS branch reds positive test `[AC-FILE-003-02]`; removing FILTER predicate reds isolation test `[AC-FILE-001-05]`; both verified by developer via temporary local edit + restore and documented in Work Log. PASS.

FA-2 (ADR-005 §6 HARD per-policy isolation proof): Independently confirmed in targeted test re-run log. `[AC-FILE-001-05]` CLIENT-B reads ZERO of CLIENT-A's documents (cross-engagement FILTER blocks). `[AC-FILE-003-02]` CLIENT-A reads own documents, 1 row, correct ID and filename. Null SESSION_CONTEXT reads ZERO (both tables, fail-closed). ACCOUNTANT reads all rows (both CLIENT-A and CLIENT-B rows visible). CLIENT cannot UPDATE another client's Document (BLOCK BEFORE UPDATE: rowsAffected=0, admin read-back confirms data unchanged). DocumentRequest: CLIENT INSERT blocked (error 33504 or zero OUTPUT rows, admin count confirms only 1 row in engagement A). CLIENT UPDATE blocked (error thrown, admin label read-back unchanged). PASS.

FA-3 (Two-part policy correctness): `sec.pol_Document` — FILTER + BLOCK, same predicate `fn_document_access` (ITVF + SCHEMABINDING = ON, STATE = ON). Three branches: admin, ACCOUNTANT, CLIENT EXISTS. Ownership join `User.clerkId → Engagement.clientUserId → Engagement.id = @documentEngagementId` matches `0005`/`0006` precedent exactly. No `@read_only` in the test or policy (ADR-003 Amendment 1 compliant). `sec.pol_DocumentRequest` — FILTER via `fn_document_request_access` (3 branches incl. CLIENT EXISTS for reading own engagement's requests), BLOCK via `fn_document_request_write_access` (2 branches — admin + ACCOUNTANT, NO CLIENT branch, fail-closed). The explicit "NO CLIENT branch" comment is present and the code confirms absence. PASS.

FA-4 (Data & Interface Contract): `DocumentRequest` — UNIQUEIDENTIFIER PK NEWSEQUENTIALID(), engagementId FK NoAction, label NVARCHAR(500), createdBy NVARCHAR(64)?, DATETIMEOFFSET, documents reverse. `Document` — UNIQUEIDENTIFIER PK, engagementId FK NoAction/NoAction, documentRequestId nullable FK NoAction/NoAction, storageKey NVARCHAR(1024), originalFilename NVARCHAR(500), contentType NVARCHAR(255), sizeBytes BigInt @db.BigInt, status NVARCHAR(16) default 'pending', version INT default 1, scanThreat/uploadedBy optional, DATETIMEOFFSET. CHECK constraint `Document_status_chk ('pending'|'active'|'infected')` in Track B (PART 0). Engagement reverse relations present. Migration idiomatic (handcrafted, BEGIN TRY/CATCH pattern, no destructive ops). PASS.

FA-5 (Operations-doc): `inventory.md` Track-B table has `0007-document-policy.sql` row accurately described; Track-A entity table has `DocumentRequest` and `Document` with RLS coverage. Consistent. PASS.
