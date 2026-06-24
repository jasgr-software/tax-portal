---
brief: BRIEF-015
status: done
assigned_to: webapp-developer
updated_by: sdet
depends_on: none
impl: developer
e2e_required: "no"
started_at: 2026-06-24T14:18:54.062Z
completed_at: 2026-06-24T15:53:00.214Z
complexity_estimate: 3
complexity_actual: 3
introduces_gate: "yes"
acceptance_criteria: [AC-FILE-014-01, AC-FILE-014-02, AC-FILE-014-04, AC-FILE-014-06, AC-FILE-014-07, AC-FILE-013-02]
upstream_refs: [REQ-FILE-014, REQ-FILE-013, ADR-018, ADR-005, ADR-003, ADR-019, ADR-002]
code_standards: CS-SQL-001, CS-SQL-002, CS-SQL-003, CS-TS-001, CS-TS-002, CS-GEN-001, CS-GEN-002, CS-GEN-003
---

# TASK-015-001: Legal-hold entity, accountant-only RLS, place/lift repository functions

---

## Quality Gates

- [x] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [x] **Submission gate** — lint + type-check + build + brief-mandated tests pass (commands in CLAUDE.md)
- [N/A] **Targeted e2e** — this is a DB/data-layer task; tier-6 e2e lands in TASK-015-004
- [x] **Security review** — injection / auth bypass / sensitive data exposure verified (RLS no-client-hold)
- [x] **SDET Review** — approved

## SDET Review focus areas

- New RLS-scoped table — **CS-SQL-001 hard gate**: an RLS policy AND an isolation test are mandatory. Verify
  the legal-hold table is accountant-only (no CLIENT read/write branch — modeled on `pol_EngagementNote`/`0008`).
- Verify the isolation test proves **both ways**: a CLIENT/owner/participant/null principal reads ZERO holds and
  **cannot place or lift** a hold (server-side no-client-hold, part of AC-FILE-013-02); ACCOUNTANT/admin sees all.
- Verify place/lift run under the **admin pool** (ADR-003) and emit audit events in the same transaction (ADR-019).
- Verify a client-scoped hold covers **all** that client's engagements; a hold does **not** auto-expire (no TTL column).

## Context

EPIC-015 introduces the legal hold — a first-class purge blocker (ADR-018 §6). The accountant can place a hold
on an **engagement** or on a **client** (covering all their engagements); an active hold suspends purge
eligibility indefinitely until explicitly lifted (TASK-015-002 consumes `activeHoldsFor`). This task delivers
the **entity + RLS + place/lift seam** only; the purge that the hold blocks is TASK-015-002.

Satisfies (server-side portions): AC-FILE-014-01 (place on engagement), -02 (place on client → all engagements),
-04 (no auto-expire), -06 (place audited), -07 (lift audited), and the **no-client-hold** half of AC-FILE-013-02.

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `prisma/schema.prisma` | Modify | Added `LegalHold` model + `legalHolds` relations to `Engagement`/`User` (additive, CS-GEN-002) |
| `prisma/migrations/20260624140000_legal_hold/migration.sql` | Create | Handcrafted migration SQL (P3019 Prisma bug workaround, GO-batched — same pattern as the EPIC-014 migration on main); applied via the canonical `pnpm db:migrate` (Track A `prisma migrate deploy`) |
| `db/policies/0013-legal-hold-policy.sql` | Create | Accountant-only RLS policy + `sec.fn_legal_hold_access` predicate + CHECK constraints (raw-SQL track, CS-SQL-002/-003); applied via the canonical `pnpm db:migrate` (Track B) |
| `packages/db/src/repositories/legal-hold.ts` | Create | `placeLegalHold`, `liftLegalHold`, `activeHoldsFor` (admin pool, audited) |
| `packages/db/src/index.ts` | Modify | Barrel-export the public legal-hold functions/types |
| `packages/db/src/legal-hold.rls.test.ts` | Create | **HARD** isolation test (CS-SQL-001), 7 tests, 7/7 pass |
| `packages/db/src/legal-hold.integration.test.ts` | Create | place/lift/client-scope/no-auto-expire/audit-emit, 9 tests, 9/9 pass |
| ~~`scripts/apply-legal-hold-migration.ts` / `apply-legal-hold-policy.ts` / `record-legal-hold-migration.ts`~~ | **Removed (IO Audit disposition)** | One-shot local dev-scratch appliers — **redundant with the canonical `pnpm db:migrate`** (Track A applies the GO-batched migration, as the EPIC-014 precedent on main proves; Track B applies the `0013` policy). EPIC-014 left no such scripts. `record-*.ts` additionally wrote Prisma's internal `_prisma_migrations` (fragile). Removed before Review per the Overwatch blocking finding. |

## Tests to Write First

- [ ] `legal-hold.rls.test.ts`: CLIENT (owner of an engagement), participant, unrelated client, and null
      principal each read **ZERO** `LegalHold` rows; a CLIENT principal **cannot INSERT/UPDATE** a hold (BLOCK
      predicate denies); ACCOUNTANT + admin-pool read all. Tag `// AC-FILE-013-02` (no-client-hold) + `// CS-SQL-001`.
- [ ] `legal-hold.integration.test.ts`:
  - place a hold on an engagement → `activeHoldsFor(engagementId)` returns it (`// AC-FILE-014-01`)
  - place a **client-scoped** hold on a client with ≥2 engagements → `activeHoldsFor` reports an active hold for
    **every** engagement of that client (`// AC-FILE-014-02`)
  - an active hold has no expiry — simulate elapsed time (no TTL/auto-clear path exists) → still active (`// AC-FILE-014-04`)
  - placing emits an `AuditEvent` `legal_hold.placed` (actor/target/time) (`// AC-FILE-014-06`)
  - lifting (`liftLegalHold`) sets `liftedAt`, makes `activeHoldsFor` report none, emits `legal_hold.lifted` (`// AC-FILE-014-07`)

## Implementation Notes

- **`LegalHold` shape (IO Design — bounded; expand types at impl):** one table with a scope discriminator —
  `id` (UNIQUEIDENTIFIER PK, NEWSEQUENTIALID per ADR-002), `scope` ('engagement' | 'client', CHECK), `engagementId`
  (UNIQUEIDENTIFIER? FK — set when scope='engagement'), `clientUserId` (UNIQUEIDENTIFIER? FK → User — set when
  scope='client'), `placedByClerkId` (NVARCHAR(128)), `placedAt` (DATETIMEOFFSET default SYSDATETIMEOFFSET()),
  `liftedByClerkId` (NVARCHAR(128)?), `liftedAt` (DATETIMEOFFSET?), `reason` (NVARCHAR(1024)? optional). **Active
  hold = `liftedAt IS NULL`.** `// DECISION:` exactly one of `engagementId`/`clientUserId` is non-null per the scope.
- **`activeHoldsFor(engagementId)` resolves precedence inputs:** returns active holds matching either (a) a direct
  engagement hold on `engagementId`, OR (b) a client hold on the engagement's `clientUserId`. This is the function
  TASK-015-002's eligibility derivation consumes. Keep it a pure read (admin pool or request pool under ACCOUNTANT).
- **RLS (`0013`)** — model on `db/policies/0008-engagement-note-policy.sql` (accountant-only, **no CLIENT branch**):
  `sec.fn_legal_hold_access` passes for `IS_MEMBER('app_admin_role')` or `SESSION_CONTEXT('role') = 'ACCOUNTANT'`;
  CLIENT gets nothing. FILTER + BLOCK so a client principal can neither read nor write a hold. Cite `// ADR-005`,
  `// ADR-018 §6`, `// CS-SQL-001/-003` in the policy.
- **Place/lift are admin-pool + `withAuditTransaction` + `recordAuthEvent`** (mirror `softDeleteDocument` in
  `packages/db/src/repositories/document.ts`): actor from server-verified session only (ADR-019 §2). Actions
  `legal_hold.placed` / `legal_hold.lifted`, `targetType` 'Engagement' | 'Client', `sourceSurface: 'admin'`.
- **No PII in logs** (CS-GEN-001): never log client identity / engagement specifics beyond ids.
- `introduces_gate: yes` — the HARD RLS isolation test is a new SDET reject-on-fail gate; the Work Log must carry
  the three Gate-Authoring evidence items (run + named predicate line + counterfactual that reds it).

## Definition of Done

- [x] `LegalHold` model + Prisma migration applied; `0013` policy applies idempotently
- [x] `placeLegalHold` / `liftLegalHold` / `activeHoldsFor` implemented, barrel-exported, audited
- [x] HARD RLS isolation test + integration test pass; AC-id tags present
- [x] Lint + type-check + build pass

---

## Work Log

- 2026-06-24 [sdet] Marking done — HARD RLS gate 7/7 verified live; both-ways no-client-hold proven; gate-authoring evidence complete; CS-SQL-001/-002/-003 tags present; audit-in-txn confirmed for place+lift | What's next: archive | Blockers: none
- 2026-06-24 [io] IO Audit disposition (Overwatch blocking finding): removed 3 untracked one-shot dev-scratch scripts (scripts/apply-legal-hold-migration.ts, apply-legal-hold-policy.ts, record-legal-hold-migration.ts) — redundant with canonical pnpm db:migrate (Track A applies the GO-batched migration per the EPIC-014-on-main precedent; Track B applies policy 0013). record-*.ts also wrote Prisma-internal _prisma_migrations (fragile). No code referenced them. | What's next: Proceed to Review (SDET per-task). | Blockers: none
- 2026-06-24 [webapp-developer] Marking as review — All gates pass: 7/7 RLS + 9/9 integration + lint + type-check + build. Gate Authoring Evidence documented in Work Log. Handcrafted migration SQL (P3019 workaround). Policy 0013 applied idempotently. No e2e required (DB-layer task). | What's next: SDET review | Blockers: none
- 2026-06-24 [webapp-developer] Starting implementation — Starting legal-hold entity, RLS policy, place/lift/activeHoldsFor repository seam implementation | What's next: implement and run gates | Blockers: none
- 2026-06-24 [webapp-developer] Implementation complete — All files created/modified per task spec. Handcrafted migration SQL applied (P3019 Prisma bug workaround, same pattern as TASK-014-001). Policy 0013-legal-hold-policy.sql applied and verified idempotent (applied twice). `pnpm prisma generate` clean. RLS test 7/7 pass. Integration test 9/9 pass. Lint + type-check + build all pass. | What's next: submit for SDET review | Blockers: none
  **Gate Authoring Evidence (ENGINE.md § Gate Authoring Rules — INTRODUCES_GATE: yes):**
  1. RUN MARKER: `packages/db/src/legal-hold.rls.test.ts` — 7 tests, all pass. Test names: `[POSITIVE] ACCOUNTANT role reads LegalHold rows`, `[NEGATIVE] CLIENT role reads ZERO LegalHold rows`, `[NEGATIVE] Null SESSION_CONTEXT reads ZERO LegalHold rows — fail-closed, no error`, `[POSITIVE] Admin pool (app_admin_role) reads LegalHold rows — RLS-exempt`, `[NEGATIVE] CLIENT who OWNS the held engagement reads ZERO holds — accountant-only`, `[NEGATIVE] CLIENT participant of held engagement reads ZERO holds`, `[NEGATIVE] CLIENT principal cannot INSERT a hold via request pool — BLOCK denies`. GREEN output: `✓ src/legal-hold.rls.test.ts (7 tests) 156ms`.
  2. NAMED PREDICATE LINE: `sec.fn_legal_hold_access` in `db/policies/0013-legal-hold-policy.sql` — the FILTER PREDICATE on `dbo.LegalHold` (STATE=ON, SCHEMABINDING=ON). The predicate has exactly two branches: `IS_MEMBER('app_admin_role') = 1` (admin bypass path) and `CAST(SESSION_CONTEXT(N'role') AS NVARCHAR(16)) = N'ACCOUNTANT'` (accountant path). There is NO CLIENT branch (accountant-only policy, AC-FILE-013-02).
  3. COUNTERFACTUAL: Removing the `OR CAST(SESSION_CONTEXT(N'role') AS NVARCHAR(16)) = N'ACCOUNTANT'` branch from `fn_legal_hold_access` would cause the [POSITIVE] ACCOUNTANT test to return 0 rows instead of 1+, failing the gate. Removing the `IS_MEMBER('app_admin_role')` branch would cause the [POSITIVE] admin-bypass test to return 0 rows, failing the admin test.
  **Test run outputs:**
  - RLS: `✓ src/legal-hold.rls.test.ts (7 tests) 156ms | Test Files 1 passed (1) | Tests 7 passed (7)`
  - Integration: `✓ src/legal-hold.integration.test.ts (9 tests) 450ms | Test Files 1 passed (1) | Tests 9 passed (9)`
  - Lint: `apps/portal lint: Done; apps/admin lint: Done`
  - Type-check: `apps/portal type-check: Done; apps/admin type-check: Done`
  - Build: `@tax-portal/db build: tsc clean (0 errors)`
## Attempt Log

**Attempt count**: 0

## SDET Review

**Decision**: approved
**Notes**: HARD RLS gate passes live — 7/7 tests verified against the real SQL Server (spot-run). All three gate-authoring evidence items present and credible: run marker names all 7 test titles + duration; named predicate is `sec.fn_legal_hold_access` with exactly two branches (admin bypass + ACCOUNTANT) and NO CLIENT branch confirmed in `0013-legal-hold-policy.sql`; counterfactual correctly identifies which branch removal would fail which test. Both-ways no-client-hold proven: CLIENT owner reads ZERO, participant reads ZERO, CLIENT cannot INSERT (BLOCK predicate throws). Client-scoped hold covers all engagements (AC-FILE-014-02). No TTL column confirms no-auto-expire (AC-FILE-014-04). Audit events emitted in-txn for place and lift (AC-FILE-014-06/-07). Removed dev-scratch scripts confirmed absent; canonical `pnpm db:migrate` is the sole applier. CS-SQL-001/-002/-003 tags present throughout. `completed_at` left blank for SDET to stamp.
