# Progress

> Single source of truth for current slice state, quality gates, active bugs, and retro action items. The IO
> and SDET update this file at the start and end of every invocation. Structure contract: see
> `.implementation/ENGINE.md` § PROGRESS.md structure contract.
>
> **Note (2026-06-14):** the implementation team was refactored into the standalone `.implementation/` layer
> (engine: `ENGINE.md` / `PHASES.md`; orchestrator: `AGENT.md` = the Implementation Orchestrator, `[io]`).
> The team consumes a self-contained build brief.

## Current initiative

**BRIEF-002 — Accountant manages the services catalog (admin CRUD + accountant-only write boundary)**
- **Branch:** `brief-002-services-catalog-management` (created from `main` this invocation)
- **Brief-type:** feature · **Brief-deploys:** no
- **Goal:** Deliver the *write* side behind EPIC-001's public read catalog — the signed-in accountant adds /
  edits / deactivates services from `apps/admin`, persisted under her authenticated identity (ADR-003) and
  authorized at the Service security-policy trust boundary (ADR-005). **Primary risk:** close EPIC-001's latent
  write-predicate gap (CLIENT currently passes the BLOCK predicate) — AC-DOOR-002-05.
- **Phase:** **Dispatch in progress** (TASK-002-001 **done**, committed `c500053`; TASK-002-002 returned at `review`, SDET review dispatched this invocation). Env blocker resolved (see env note below).
- **Gated:** yes (touches `apps/admin`, `packages/db`, `db/policies/`)
- **Methodology:** gherkin acceptance format (7 scenarios → `.feature` mirror) · e2e required (apps/admin,
  mocked auth provider) · tier-3 obligations on the write boundary + persistence · container smoke before
  Validate · AC-id test-tag contract for COVERAGE write-back.

**Tasks (5):**
| Task | Status | Impl | E2e | AC | Notes |
| ---- | ------ | ---- | --- | -- | ----- |
| TASK-002-001 service-write-boundary-policy | **done** | developer | no | AC-DOOR-002-05 | **Primary risk.** Separate write predicate (`fn_service_write_access`, no CLIENT) + tier-3 RLS test. `Introduces-gate: yes`. Dependency root. **service.rls 10/10 PASS; db suite 35/35; lint/type-check/build clean.** Complexity-actual 3. **SDET APPROVED** (independent re-exec: 10/10 + 35/35; gate-authoring evidence verified; latent write-gap closed). Committed `c500053`. |
| TASK-002-002 service-write-repository-and-actions | **done** | developer | no | -01/-02/-03 + -05 runtime | Write repo + server actions through the request-scoped `db` wrapper; tier-3 persistence. Depends on -001 (done). **SDET APPROVED** (independent re-exec: `@tax-portal/db` 39/39 incl. persistence 4/4 + rls 10/10; admin 16/16; `requestDb()` cast verified as genuine `$extends`-wrapped `db`; identity from `getIdentity()` only; deactivate UPDATE not DELETE; no schema changes). Complexity-actual 3. |
| TASK-002-003 admin-catalog-management-ui | backlog | developer | no | AC-DASH-010-01/-02/-03 | Admin list/add/edit/deactivate behind the role gate. Depends on -002. |
| TASK-002-004 admin-e2e-catalog-journeys-and-cross-surface | backlog | developer | **yes** | 6 journeys + -05 UI surface + cross-loop | 7 gherkin → specs + `.feature`; deactivate→public-door loop (evidence for -03, NOT -04). Depends on -003. |
| TASK-002-005 demo-walkthrough-spec | backlog | developer | yes | none (non-gating demo) | @demo gallery → `docs/demos/EPIC-002/`. Depends on -004. |

**Env note (RESOLVED 2026-06-16, main session):** the EPIC-004-carried local-DB blocker is cleared. `tax_portal` DB fully bootstrapped — schema synced via `prisma db push` (sidesteps the `migrate deploy` P3019 block), all principals incl. `taxportal_user` created, all `sec` policies applied incl. the new `fn_service_write_access`. `.env.local` carries correct DB URLs. **Tier-3 RLS tests now run locally against the real SQL Server container; subsequent DB/e2e gates (TASK-002-002 persistence, TASK-002-004 e2e) can run locally.** **E2e host-port:** admin container maps **host 13001→3001** — host-run admin Playwright needs `ADMIN_BASE_URL=http://localhost:13001` (flag in the TASK-002-004 dispatch).

**AC → task map (7 ACs, all traced):** AC-DOOR-002-01/-02/-03 → -002 (persist) + -004 (e2e); AC-DASH-010-01/-02/-03 → -003 (UI) + -004 (e2e); AC-DOOR-002-05 → -001 (trust boundary, tier-3) + -002 (runtime) + -004 (UI surface). AC-DOOR-002-04 is **out of scope** (owned by EPIC-001; verified only as a loop).

**Design-coherence check:** PASS (recorded in the Plan session entry below). No upstream/architectural question raised — the write-predicate split realizes ADR-005's existing mandate, not a new architectural choice.

## Awaiting PR merge

_None._ BRIEF-004 finalized + delivered (PR #38 @ `0444551`, gate 8 green). BRIEF-002 now active in Plan→Dispatch.

## Active bugs

_None active._ BUG-001-001/-002/-003 all `closed`; **BUG-004-001 (orphan root `middleware.ts`) RESOLVED**
(IO fix-forward; archived to `tasks/done/` at Close-prep). No active `BUG-004-POST-*`.

## Open retro action items

> The TASK-004-007 item below is now **resolved this slice** (the `$extends` regression test landed). The
> remaining items carry forward as observations. Three new carried follow-ups recorded in `HANDOFF-004.md`.

- **[RESOLVED — TASK-004-007, this slice] `client.ts` `$extends` SESSION_CONTEXT propagation untested** — the
  regression test (`packages/db/src/session-context.propagation.test.ts`, 4 live-container tests) now proves
  identity+role are set before the first real query on the authenticated accountant path. Closes the carried
  EPIC-001 retro item.
- **[CI — carried, now actionable] `test-portal` job lacks a `packages/**` build step** — graduate
  `test-portal` to required only after adding `pnpm -r --filter './packages/**' build --if-present` (HANDOFF-004
  follow-up #3; the `@tax-portal/ui` failures pre-date EPIC-004, run `27568768517`; EPIC-004 extends the pattern
  to `@tax-portal/auth`). Tests pass locally (`pnpm -r test` 158/158).
- **[infra — carried] Local DB-bootstrap + `migrate deploy` P3019** — clean-volume bootstrap, Prisma `;port=` /
  `!`-password parsing, P3019 `mssql`-vs-`sqlserver`; why local Smoke is env-blocked (HANDOFF-004 follow-up #2).
- **[gated-path candidate — carried] ESLint import boundary covers only `requestDb`, not `adminDb`** — consider
  extending `packages/eslint-config` to also restrict `adminDb` imports outside sanctioned admin paths.
  (Observation; moved with the deferred Clerk-binding scope to the 2FA-enablement slice.)
- **[env — carried] `.env.example` RATE_LIMIT vars** (`RATE_LIMIT_MAX_ATTEMPTS=10`, `RATE_LIMIT_WINDOW_MS=60000`)
  — permission-walled from agents AND main session; **user applies** (HANDOFF-004 follow-up #5).
- **[demo — carried] EPIC-001 engagement-demo `localhost:1433` flake** — pre-existing, transient/timing
  (HANDOFF-004 follow-up #6).

---

### IO Dispatch (Review of TASK-002-001) — BRIEF-002 — 2026-06-16
**Start:** Re-invoked mid-Dispatch with the TASK-002-001 result inline. Developer completed the dependency-root task: `sec.fn_service_write_access` added + wired to the 4 BLOCK predicates (FILTER unchanged), tier-3 `service.rls.test.ts` created. Final gate **service.rls 10/10 PASS**, full `@tax-portal/db` suite **35/35 PASS**, lint/type-check/build clean; AC-DOOR-002-05 verified; `Introduces-gate: yes` 3-item evidence in Work Log. Status `review`, Complexity-actual 3. Env blocker that surfaced during -001 was RESOLVED by the main session (DB bootstrapped via `prisma db push`; `taxportal_user` + all `sec` policies applied; `.env.local` correct).
**Phase-transition reflex (Plan→Dispatch, then mid-Dispatch resume):** swept the IO Plan session entry to `PROGRESS-ARCHIVE.md` under a "Swept at Dispatch→Review (TASK-002-001)" marker; updated `## Current initiative` Phase + TASK-002-001 status (`backlog`→`review`) + added the env-resolution note and the e2e host-port (13001) note; appended this entry.
**Actions:**
- **IO pre-review read of TASK-002-001 + Work Log.** Confirmed task-file/brief consistency: status `review`, `Complexity-actual: 3` (in range), Work Log carries a pre-implementation "Starting implementation" entry (Dispatch Checkpoint satisfied), the 3 Gate-Authoring evidence items (run marker w/ step name + 10/10 + 35/35 blocks; named code path = `fn_service_write_access` + the 4 BLOCK predicates; counterfactual = adding a CLIENT branch reds tests 4–6+8), and the documented detection-helper fix (case-sensitive `"BLOCK"` → `"block predicate"` lowercase; assertions NOT weakened; policy SQL unchanged). All dev-owned Quality Gate boxes ticked; `SDET Review` box open (correct).
- **Commit-cadence judgement:** holding the branch commit until SDET approval flips -001 to `done`. Rationale: pre-review code may need amending on rejection; committing the approved checkpoint avoids branch churn. Will recommend the main-session commit (to `brief-002-services-catalog-management`, never `main`, named files only) at that point.
- **Composed the SDET review dispatch** for TASK-002-001 (one dispatch this turn): per-policy integration-test HARD requirement (ADR-005 §6 / CLAUDE.md § SDET), accountant-only write boundary, gate-authoring 3-item evidence verification, latent-gap-actually-closed check, idempotency, and the atomic close-edit contract (tick box / prose / `Completed-at` / `Complexity-actual` in-range / status flip in one Edit).
**End:** Dispatch in progress — TASK-002-001 at `review`, SDET review dispatched. On SDET approval (→`done`): recommend main-session commit of -001 to the feature branch, then dispatch TASK-002-002 (write repo + server actions; tier-3 persistence; depends on -001). On rejection: route the reject reason back to the developer (watch the Stuck-Loop counter). Next dispatch returned in the `## Next Dispatch` block below.

---

### SDET Review — TASK-002-001 — BRIEF-002 — 2026-06-16
**Start:** SDET review of TASK-002-001 (service write-boundary policy + tier-3 RLS test). Task status `review`, `Complexity-actual: 3`. Env blocker previously RESOLVED by main session (DB bootstrapped, all principals and policies applied).
**Actions:**
- Read ENGINE.md, sdet.md, PROGRESS.md, TASK-002-001, `db/policies/0002-service-readable.sql`, `packages/db/src/service.rls.test.ts`, ADR-005, ADR-003, ADR-012 (all upstream refs cited by the task).
- Docker pre-flight: `tax-portal-sqlserver` container healthy on port 14330.
- Independently re-executed `pnpm --filter @tax-portal/db test -- src/service.rls.test.ts` → **10/10 PASS** (165ms). Confirms Work Log output.
- Independently re-executed full `pnpm --filter @tax-portal/db test` → **35/35 PASS** (6 files, 1.22s). No regressions.
- Independently re-executed `pnpm lint` → PASS (zero errors). `pnpm type-check` → PASS (zero errors).
- Verified all mandatory rejection checks: Dispatch Checkpoint present; `Started-at`/`Complexity-estimate`/`Complexity-actual` all set and in-range; all required spec fields present; no tool-hygiene violations; all dev-owned Quality Gate boxes ticked.
- Verified per-policy integration test per ADR-005 §6: positive (ACCOUNTANT INSERT/UPDATE/DELETE), negative (CLIENT INSERT/UPDATE/DELETE rejected at DB boundary, null SESSION_CONTEXT rejected), regression guard (CLIENT SELECT unchanged).
- Verified latent gap is actually closed: `fn_service_write_access` has no CLIENT branch; all 4 BLOCK predicates reference it; FILTER still references `fn_service_access` (CLIENT allowed).
- Verified 3-item Gate Authoring Evidence: run marker w/ step name ✓, named code path ✓, counterfactual ✓.
- Verified detection-helper fix: double-assertion pattern intact (`caughtError.not.toBeNull()` first); policy SQL unchanged.
- Verified idempotency (`CREATE OR ALTER FUNCTION`, `DROP IF EXISTS + CREATE SECURITY POLICY`, GO-batch split).
- Verified upstream ref compliance (ADR-005/ADR-003/ADR-012).
- Performed atomic close edit: ticked SDET Review Quality Gate box, wrote `## SDET Review` prose section, appended approval Work Log breadcrumb, set `Completed-at: 2026-06-16T07:51:00Z`, flipped `Status: review → done`.
**End:** TASK-002-001 **approved and marked `done`**. All 10 review focus items pass. Gate is live: `sec.fn_service_write_access` + 4 BLOCK predicates proven at the DB trust boundary; 35/35 regression suite clean. Ready for IO to: (1) recommend main-session commit of -001 to `brief-002-services-catalog-management`; (2) dispatch TASK-002-002 (write repo + server actions; depends on -001).

---

### IO Dispatch (TASK-002-002) — BRIEF-002 — 2026-06-16
**Start:** Re-invoked after main session committed TASK-002-001 (`done`) to `brief-002-services-catalog-management` (`c500053`, named files only). Composing the next dispatch: TASK-002-002 (service write repository + admin server actions through the request-scoped wrapper + tier-3 persistence). -001 dependency satisfied. Env is up (real SQL Server on localhost:14330; `.env.local` correct; tier-3 runs locally).
**Phase-transition reflex:** stayed within Dispatch (no phase boundary). Updated `## Current initiative` Phase line + the task table (TASK-002-001 `review`→`done` w/ commit ref; TASK-002-002 `backlog`→`in-progress (dispatched)`); appended this entry. (Prior session entries roll to PROGRESS-ARCHIVE.md at the next phase boundary, not mid-phase.)
**Actions:**
- **Read TASK-002-002 spec + the surrounding code surface** to make the dispatch self-contained and to surface the one real implementation tension: `packages/db/src/repositories/service.ts` (read path uses the raw mssql **admin pool**), `apps/admin/src/app/page.tsx` (queries via `adminDb` — RLS-exempt — and routes only the SESSION_CONTEXT *wiring* through `withRequestContext`), `packages/db/src/index.ts` (barrel: exports `db`, `adminDb`, `withRequestContext`, `withClerkIdentity`; does NOT export `requestDb`), `packages/db/src/context.ts` (`withRequestContext`/`withClerkIdentity` contract), the TASK-002-001 `service.rls.test.ts` (the BLOCK predicate this task's writes must hit), and `engagement-request.persistence.test.ts` (the tier-3 model).
- **Identified the load-bearing constraint to flag in the dispatch:** AC-DOOR-002-05's *runtime* half means catalog writes MUST go through the request-scoped `db` wrapper so the accountant role reaches `sec.fn_service_write_access` (the TASK-002-001 BLOCK predicate). Using `adminDb` for writes would bypass RLS and silently defeat the prior task's trust boundary — explicitly prohibited by the task's SDET focus areas. The known Prisma 5.22.0 sqlserver dev/test port-parsing limitation is the reason prior paths reached for the admin pool; if writing through `db` genuinely cannot connect in dev/test, the developer must **surface to the IO** rather than fall back to `adminDb` (that would be an architectural retreat, not a slice-local choice).
- **Composed the webapp-developer dispatch** for TASK-002-002 with: ENGINE.md + developer.md reads, role tag, the full task spec ref + ACs + upstream refs, the request-scoped-wrapper HARD constraint, reversible-deactivate (no DELETE) rule, identity-from-`getIdentity()`-only rule, the tier-3 persistence-test model + the 4 mandated test cases, the submission gate (lint/type-check/build + `@tax-portal/db` test incl. the new persistence test + `admin` test), the env caveat (DB up — do NOT `docker compose down -v`; vitest globalSetup loads `.env.local`; re-apply policies via `pnpm db:policies:apply` if needed), the Dispatch Checkpoint atomic-edit rule, and the strict boundary (edit only code + this task file; NO git ops).
**End:** TASK-002-002 dispatched (one dispatch this turn). On developer `review`: dispatch the SDET review (ADR-003 no-direct-Prisma/no-adminDb-for-writes verification, reversible-deactivate, identity provenance, tier-3 persistence re-exec). On the request-wrapper-cannot-connect escalation: provide a resolution plan / raise upstream if it proves architectural. Dispatch prompt in the `## Next Dispatch` block.

---

### SDET Review — TASK-002-002 — BRIEF-002 — 2026-06-16
**Start:** SDET review of TASK-002-002 (service write repository + server actions + tier-3 persistence test). Task status `review`, `Complexity-actual: 3`, Dispatch Checkpoint present.
**Actions:**
- Docker pre-flight: `tax-portal-sqlserver` healthy on host:14330.
- Read ENGINE.md, sdet.md, PROGRESS.md, TASK-002-002 task file + Work Log. Read all implementation files: `packages/db/src/repositories/service.ts`, `packages/db/src/client.ts`, `packages/db/src/context.ts`, `packages/db/src/index.ts`, `packages/db/src/service.persistence.test.ts`, `apps/admin/src/app/services/actions.ts`, `apps/admin/src/app/services/actions.test.ts`.
- **HARD check — requestDb() cast path:** Traced `requestDb()` in `service.ts` → `db as unknown as PrismaClient` → `db` Proxy (client.ts) → `getDb()` → `getRequestDb().$extends($allOperations middleware)`. Middleware calls `sp_set_session_context(clerk_user_id, role)` before every real query. Confirmed `getAdminPool()` used only in `getActiveServices()` (anonymous read — sanctioned ADR-003 §1). All write functions exclusively use `requestDb()`. No `adminDb` on the write path. The local `requestDb()` function is an internal module cast, NOT the forbidden barrel import (barrel does not export `requestDb`).
- **Identity provenance:** `actions.ts` → `getAccountantIdentity()` → `getAuthProvider().getIdentity(syntheticRequest)` using verified cookie headers only. Role never client-asserted.
- **Reversible deactivation:** `deactivateService` does `service.update({ data: { active: false } })`. No delete operation anywhere in the file. Tier-3 test re-reads via admin pool and asserts row still exists.
- **Schema changes:** `git diff --name-only HEAD` confirms no `prisma/schema.prisma` or `prisma/migrations/` changes.
- **Independent re-execution — `pnpm --filter @tax-portal/db test`:** **39/39 PASS** (7 files). `service.persistence.test.ts` 4/4 all green; `service.rls.test.ts` 10/10 no regression.
- **Independent re-execution — `pnpm --filter admin test`:** **16/16 PASS** (2 files). Work Log count inconsistency resolved: actions.test.ts 15/15 + route.test.ts 1/1 = 16 total; developer prose said "15 tests" in one line but "16 passed" in the summary — the summary was correct, the prose was a typo.
- **All mandatory rejection checks clear:** Dispatch Checkpoint, metadata fields, required spec fields, quality gate boxes, no tool-hygiene violations.
- Performed atomic close edits to task file: ticked SDET Review box, wrote `## SDET Review` prose section, appended Work Log approval breadcrumb, set `Completed-at: 2026-06-16T13:15:00Z`, flipped `Status: review → done`.
**End:** TASK-002-002 **approved and marked `done`**. AC-DOOR-002-01/-02/-03 and the runtime half of AC-DOOR-002-05 all satisfied. Re-executed counts: `@tax-portal/db` 39/39; `admin` 16/16. Ready for IO to: (1) recommend main-session commit of -002 to `brief-002-services-catalog-management`; (2) dispatch TASK-002-003 (admin catalog management UI; depends on -002).

---

### IO Dispatch (SDET review of TASK-002-002) — BRIEF-002 — 2026-06-16
**Start:** Re-invoked with TASK-002-002 returned at `review`. Developer delivered the write repository (`createService`/`updateService`/`deactivateService`/`reactivateService`/`listAllServices` in `packages/db/src/repositories/service.ts`), barrel exports, tier-3 persistence test (`packages/db/src/service.persistence.test.ts`, 4 AC-tagged cases), admin server actions (`apps/admin/src/app/services/actions.ts`), and action unit tests. Reported gate green: `@tax-portal/db` 39/39 (incl. 4 new persistence + service.rls 10/10 no regression), `admin` 16/16, lint/type-check/build clean. Composing the SDET review dispatch.
**Phase-transition reflex:** stayed within Dispatch (no phase boundary). Updated `## Current initiative` Phase line + the task table (TASK-002-002 `in-progress (dispatched)` → `review (SDET dispatched)`); appended this entry. (Prior session entries roll to PROGRESS-ARCHIVE.md at the next phase boundary, not mid-phase.)
**Actions:**
- **IO pre-review read of TASK-002-002 + Work Log + spec.** Confirmed task-file/brief consistency: status `review`, `Complexity-actual: 3` (in range), `Started-at` set, Dispatch Checkpoint "Starting implementation" entry present, all required spec fields present (`**Acceptance criteria:**`, `**Upstream refs:**`, `**Introduces-gate: no**`), dev-owned Quality Gate boxes ticked, `SDET Review` box open (correct).
- **Surfaced the one load-bearing review hazard:** the developer's `requestDb()` "cast helper" — described as `db as unknown as PrismaClient`. This must be confirmed by inspection as the genuine `$extends`-wrapped request-scoped `db` (SESSION_CONTEXT fires via `$allOperations` before the first real query → carries the accountant role to `sec.fn_service_write_access` from TASK-002-001), and NOT the forbidden barrel `requestDb` import, NOT a disguised `adminDb`/raw-mssql admin-pool path. lint passed (the ESLint `requestDb` import boundary, ADR-003 §6) but the actual code path must be read.
- **Flagged a Work-Log count inconsistency for SDET resolution:** the Work Log says "16 unit tests" in one place and "15 tests" / "16 passed" elsewhere for `admin`. The SDET re-executes `pnpm --filter @tax-portal/db test` + `pnpm --filter admin test` to validate the claimed counts rather than trust them.
- **Composed the SDET review dispatch** for TASK-002-002 with: ENGINE.md + sdet.md reads, role tag, the full task spec ref + ACs + upstream refs, the request-scoped-wrapper HARD verification (real `db` path vs. forbidden `requestDb`/`adminDb`), identity-from-`getIdentity()`-only provenance, reversible-deactivate (UPDATE active=false, never DELETE), reuse-existing-Service-model (no parallel model / no unauthorized schema change), AC-id-tagged tier-3 coverage, mandatory metadata/Dispatch-Checkpoint/submission-gate-evidence checks, re-execution of both test suites against the live DB, the env caveat (DB up on localhost:14330; do NOT `docker compose down -v`; re-apply policies via `pnpm db:policies:apply` if needed), the atomic close-edit contract, and the on-rejection BUG-file path. NO git ops by the SDET — main session commits after approval.
**End:** SDET review of TASK-002-002 dispatched (one dispatch this turn). On approval (→`done`, `Completed-at` set, PROGRESS.md entry): recommend main-session commit of -002 to `brief-002-services-catalog-management` (named files only, never `main`), then dispatch TASK-002-003 (admin catalog management UI; depends on -002). On rejection: route the reject reason back to the webapp-developer (watch the Stuck-Loop counter — first rejection, count 1). Dispatch prompt in the `## Next Dispatch` block.
