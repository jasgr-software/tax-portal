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
- **Phase:** **Close-prep** — post-dispatch cascade COMPLETE through Validate. ALL dispatch nodes `done` & committed (9 commits `c500053`→`b87cd95`: 5 tasks + 3 blocking bugs + BUG-002-004). **Audit COMPLETE** (0 blocking, 1 advisory corrected, obs recorded). **Review = IO design scan PASS** vs. ADR-003/-005/-006. **Smoke gate 5 ✅** (UI PASS / Infra CONDITIONAL PASS — `sqlserver (unhealthy)` = carried healthcheck SA-password mismatch, DB operational, all EPIC-002 DB objects present). **Validate COMPLETE:** acceptance-validation (gate 6) + CI (gate 7) both adjudicated GREEN by SDET after BUG-002-004 fix (`b87cd95`); `pnpm -r test` 229/229; lint/type-check/audit clean. **Now: Close-prep** — gates 6+7 ticked, HANDOFF-002 + RETRO-002 written, task/bug files archived, slice → `## Awaiting PR merge`, PR title+body handed to main session.
- **Gate scorecard:** (1) per-task submission gates 5/5 ✅ · (2) SDET Review 5/5 ✅ · (3) Overwatch Audit ✅ · (4) IO Design scan ✅ · (5) **Container Smoke ✅** (UI PASS / Infra CONDITIONAL PASS) · (6) **SDET Acceptance-validation ✅** (all 7 in-scope AC covered + green at mandated tiers; AC-id tags present; gherkin binding confirmed; cross-surface loop scoped to AC-DOOR-002-03) · (7) **SDET CI gate ✅** (`pnpm -r test` 229/229; `pnpm lint`+`pnpm type-check` clean; `pnpm audit --audit-level=high` exit 0; GitHub required-CI green confirmed by Conductor post-Close-prep) · (8) Post-merge CI — Close-finalize · (9) staging smoke — **N/A** (`Brief-deploys: no`).
- **Gated:** yes (touches `apps/admin`, `packages/db`, `db/policies/`)
- **Methodology:** gherkin acceptance format (7 scenarios → `.feature` mirror) · e2e required (apps/admin,
  mocked auth provider) · tier-3 obligations on the write boundary + persistence · container smoke before
  Validate · AC-id test-tag contract for COVERAGE write-back.

**Tasks (5):**
| Task | Status | Impl | E2e | AC | Notes |
| ---- | ------ | ---- | --- | -- | ----- |
| TASK-002-001 service-write-boundary-policy | **done** | developer | no | AC-DOOR-002-05 | **Primary risk.** Separate write predicate (`fn_service_write_access`, no CLIENT) + tier-3 RLS test. `Introduces-gate: yes`. Dependency root. **service.rls 10/10 PASS; db suite 35/35; lint/type-check/build clean.** Complexity-actual 3. **SDET APPROVED** (independent re-exec: 10/10 + 35/35; gate-authoring evidence verified; latent write-gap closed). Committed `c500053`. |
| TASK-002-002 service-write-repository-and-actions | **done** | developer | no | -01/-02/-03 + -05 runtime | Write repo + server actions through the request-scoped `db` wrapper; tier-3 persistence. Depends on -001 (done). **SDET APPROVED** (independent re-exec: `@tax-portal/db` 39/39 incl. persistence 4/4 + rls 10/10; admin 16/16; `requestDb()` cast verified as genuine `$extends`-wrapped `db`; identity from `getIdentity()` only; deactivate UPDATE not DELETE; no schema changes). Complexity-actual 3. |
| TASK-002-003 admin-catalog-management-ui | **done** | developer | no | AC-DASH-010-01/-02/-03 | Admin list/add/edit/deactivate behind the role gate. Depends on -002 (done). Consumes the existing `createServiceAction`/`updateServiceAction`/`deactivateServiceAction`; page reads via `listAllServices` inside `withRequestContext` (mirror `apps/admin/src/app/page.tsx`). Dev gate green: `pnpm --filter admin test` 41/41 (25 new + 15 actions + 1 healthz), lint/type-check/build clean. Reactivation intentionally absent. **SDET APPROVED** (independent re-exec: 41/41; ADR-005 boundary clean; identity provenance verified; both union branches handled; all 3 ACs covered with happy-path + error-branch tests; no portal write path). Complexity-actual 3. |
| TASK-002-004 admin-e2e-catalog-journeys-and-cross-surface | **done** | developer | **yes** | 6 journeys + -05 UI surface + cross-loop | All 3 blocking bugs (001/002/003) `done`; developer re-ran the unchanged specs against the rebuilt container stack: **17/17 PASS, 3 sequential runs, zero flakes**. **SDET APPROVED 2026-06-16T16:42:00Z** (independent re-exec 3 × 17/17 = 51 total, zero flakes; full suite clean; all 7 focus items pass; AC-id test-tag contract verified for COVERAGE write-back). Complexity-actual 4. |
| TASK-002-005 demo-walkthrough-spec | **done** | developer | yes | none (non-gating demo) | @demo gallery → `docs/demos/EPIC-002/`. Depends on -004 (done). 4-test `@demo` spec (list/add/edit/deactivate), 4 AC-tagged PNGs (`01-AC-DASH-010-01` / `02-AC-DOOR-002-01` / `03-AC-DOOR-002-02` / `04-AC-DOOR-002-03`), gate green, `e2e:demo` 4/4, **4 distinct sha256 hashes** (no byte-identical dupes). `@demo` excluded from gating `e2e:run` (`--grep-invert @demo`). **SDET APPROVED 2026-06-16T17:30:00Z** (independent sha256 4-distinct + per-PNG visible-distinct-state spot-check; structural non-gating confirmed; convention mirror PASS). Complexity-actual 2. Committed `f8f5405`. |

**Env note (RESOLVED 2026-06-16, main session):** the EPIC-004-carried local-DB blocker is cleared. `tax_portal` DB fully bootstrapped — schema synced via `prisma db push` (sidesteps the `migrate deploy` P3019 block), all principals incl. `taxportal_user` created, all `sec` policies applied incl. the new `fn_service_write_access`. `.env.local` carries correct DB URLs. **Tier-3 RLS tests now run locally against the real SQL Server container; subsequent DB/e2e gates (TASK-002-002 persistence, TASK-002-004 e2e) can run locally.** **E2e host-port:** admin container maps **host 13001→3001** — host-run admin Playwright needs `ADMIN_BASE_URL=http://localhost:13001` (flag in the TASK-002-004 dispatch).

**AC → task map (7 ACs, all traced):** AC-DOOR-002-01/-02/-03 → -002 (persist) + -004 (e2e); AC-DASH-010-01/-02/-03 → -003 (UI) + -004 (e2e); AC-DOOR-002-05 → -001 (trust boundary, tier-3) + -002 (runtime) + -004 (UI surface). AC-DOOR-002-04 is **out of scope** (owned by EPIC-001; verified only as a loop).

**Design-coherence check:** PASS (recorded in the Plan session entry below). No upstream/architectural question raised — the write-predicate split realizes ADR-005's existing mandate, not a new architectural choice.

## Awaiting PR merge

**BRIEF-002 — Accountant manages the services catalog (admin CRUD + accountant-only write boundary)**
- **Branch:** `brief-002-services-catalog-management` (9 commits `c500053`→`b87cd95`; base `main`@`c87b5bd`).
- **Brief-type:** feature · **Brief-deploys:** no (gate 9 N/A).
- **AC summary (7 in-scope, all satisfied):** AC-DOOR-002-01/-02/-03 (add/edit/deactivate persist — tier-3
  persistence + tier-6 e2e) · AC-DASH-010-01/-02/-03 (add/edit/deactivate from admin UI — tier-6 e2e,
  dual-tagged with the DOOR journeys) · AC-DOOR-002-05 (accountant-only write boundary — tier-3 RLS
  `service.rls.test.ts` 10/10 + UI-surface e2e). AC-DOOR-002-04 verified only as a cross-surface loop
  (owned by EPIC-001, NOT claimed as a BRIEF-002 row).
- **Bugs ridden (3+1):** BUG-002-001 (auth guard), BUG-002-002 (Prisma musl engine), BUG-002-003
  (SESSION_CONTEXT `@read_only` vs pooling → ADR-003 Amendment 1), BUG-002-004 (stale portal rate-limit test).
- **Pre-merge gates (Autonomy Ceiling item 3d) recorded:** Container Smoke ✅ (cond-pass) · SDET
  Acceptance-validation ✅ · SDET CI gate ✅ (`pnpm -r test` 229/229) · quality audit ✅.
- **Reports:** `HANDOFF-002.md` (AC→tag→tier table for COVERAGE write-back) · `RETRO-002.md` (9-gate scorecard
  + classified findings).
- **Verification basis:** CI-as-gate substitution carried from EPIC-004 (user-accepted) for the env-blocked
  clean-volume container bootstrap; Smoke gate 5 = conditional-pass with the documented `sqlserver` healthcheck
  caveat. GitHub required-CI green confirmed by the Conductor post-Close-prep.
- **Awaiting:** main session opens the slice PR (title+body composed at Close-prep), then PR merge per
  Autonomy Ceiling item 3.

_BRIEF-004 finalized + delivered (PR #38 @ `0444551`, gate 8 green) — cleared from this section at its
Close-finalize._

## Active bugs

_None active._ All four BRIEF-002 bugs SDET-approved, `done`, and **archived to `tasks/done/` at Close-prep
(2026-06-16)**; their fixes ride BRIEF-002's PR. Full root-cause chain is in `RETRO-002.md` (the headline:
EPIC-002's first real-container e2e surfaced a 4-defect chain latent in EPIC-001/004, hidden by the previously
env-blocked container smoke):
- **BUG-002-001** — auth fail-closed guard blocked the mock provider in any prod-built container (SDET APPROVED
  2026-06-16T09:45:00Z; `@tax-portal/auth` 124/124). File: `tasks/done/BUG-002-001-auth-guard-blocks-mock-in-prod-build.md`.
- **BUG-002-002** — Prisma query-engine binary target missing for the Alpine/OpenSSL-3 runner; three-layer fix
  (`binaryTargets` + `outputFileTracingIncludes` + `PRISMA_QUERY_ENGINE_LIBRARY` override) (SDET APPROVED
  2026-06-16T15:55:00Z). File: `tasks/done/BUG-002-002-prisma-engine-binary-target-missing-alpine-openssl3.md`.
- **BUG-002-003** — `sp_set_session_context @read_only=1` incompatible with Prisma pooling (error 15664 on
  cross-request connection reuse) → **ADR-003 Amendment 1** (drop `@read_only`; reset-on-release retired as
  undeliverable on Prisma 5.22's quaint pool); new tier-3 pooled-reuse regression test (SDET APPROVED
  2026-06-16T23:45:00Z; `@tax-portal/db` 41/41). File: `tasks/done/BUG-002-003-session-context-readonly-incompatible-with-pooling.md`.
- **BUG-002-004** — stale portal rate-limit test broke by BUG-002-001's guard change (blast-radius miss);
  2-line test-lifecycle fix (SDET APPROVED 2026-06-16T12:50:00Z; `portal` 23/23, `pnpm -r test` 229/229).
  Committed `b87cd95`. File: `tasks/done/BUG-002-004-portal-rate-limit-test-missing-allow-mock-auth.md`.

Closed (prior slices): BUG-001-001/-002/-003 all `closed`; BUG-004-001 (orphan root `middleware.ts`) RESOLVED.
No active `BUG-002-POST-*` / `BUG-004-POST-*`.

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
- **[metric-integrity — BRIEF-002 Audit Obs 2] `Started-at` midnight-sentinel placeholder** — TASK-002-003 AND
  BUG-002-004 each carry `Started-at: 2026-06-16T00:00:00Z` (a placeholder, not a real start; same pattern seen
  on several EPIC-004 tasks). In range, metadata gate passed, no gate tripped. RETRO-002 item: the
  Dispatch-Checkpoint `Started-at` write should capture a real clock value, not a midnight sentinel.
  (Observation — no gate failure; not promoted.)
- **[doc-drift — BRIEF-002 Audit Obs 3] stale test-helper comments in `packages/db/src/service.rls.test.ts`
  (~L70–72, ~L88)** — comments say "real app uses `@read_only = 1`" and cite "ADR-003 §4 pool hygiene", both
  factually wrong after BUG-002-003 / ADR-003 Amendment 1 dropped `@read_only`. **Functional behavior is
  correct — comment text only.** Disposition: **defer to a non-blocking follow-up** (lighter path; this is a
  comment-only doc-drift in a gated path, not a behavior defect — folding a micro-dispatch through the full
  pipeline to fix two comment lines is disproportionate). RETRO-002 will carry it as an `ungated`/follow-up
  note; the comment correction rides the next `packages/db` task that touches this file, OR a dedicated
  doc-drift cleanup if none arises. Recorded in HANDOFF-002 as a known comment-drift follow-up.
- **[process — BRIEF-002 Audit Obs 4] Full CI (`pnpm ci:local`) not recorded in any BRIEF-002 task Work Log**
  — app-scoped gates were used throughout (correct for per-task submission). Whether Validate/slice-close should
  require a full `ci:local` run is ambiguous. RETRO-002 candidate (the SDET CI gate at Validate is the natural
  home for a full `ci:local` if we want one). (Observation — no gate failure.)
- **[rule-sunset — BRIEF-002 Audit Obs 5] Sunset candidates** — Autonomy Ceiling item 2 `--no-verify` clause
  + the `PushNotification` spam-loop guard, neither triggered in 3+ slices. Surface at Close-prep retro for a
  keep/remove recommendation per ENGINE.md § Rule Sunset.
- **[infra — BRIEF-002 Smoke, new manifestation of the carried infra item] `sqlserver` compose status
  `(unhealthy)`** — the compose healthcheck runs `sqlcmd -U sa -P "$MSSQL_SA_PASSWORD"`, which fails
  (Error 18456 State 8) because `MSSQL_SA_PASSWORD` only takes effect at volume-init and the persisted data
  volume was bootstrapped with a different SA password. **Not a BRIEF-002 regression; DB fully operational via
  app principals** (`taxportal_user`/`taxportal_admin` are SQL logins stored in the DB, not SA-gated) — all
  EPIC-002 DB objects verified present in-container (`sec.fn_service_write_access`; `pol_Service` 4 BLOCK→write
  predicate + 1 FILTER→read predicate; `taxportal_user` principal). **Non-blocking for Validate.** RETRO-002:
  the healthcheck should derive its SA password from the same source the volume was bootstrapped with (or the
  bootstrap should re-assert the env SA password on persisted volumes). Same root family as the carried
  P3019/bootstrap-fragility infra item — record as a new manifestation, not a new class.

---

### IO Close-prep — BRIEF-002 — 2026-06-16
**Start:** Post-dispatch cascade complete through Validate (SDET adjudicated gates 6 + 7 GREEN after the BUG-002-004 fix landed as `b87cd95`; `pnpm -r test` 229/229; lint/type-check/audit clean). Driving Close-prep: tick gates 6+7, run the hard-verification metadata gate, write HANDOFF-002 + RETRO-002, archive the 5 task + 4 bug files, move the slice to `## Awaiting PR merge`, and hand the PR title+body to the main session.
**Phase-transition reflex (Validate→Close-prep):** swept the Validate-phase session entries (IO Smoke-disposition+Validate-start, SDET Validate-start, SDET gate-6, SDET gate-7, SDET quality audit, SDET Validate-end, SDET BUG-002-004 re-review ×2) to `PROGRESS-ARCHIVE.md` under a "Swept at Validate→Close-prep transition" marker; updated `## Current initiative` (Phase→Close-prep; scorecard gates 6+7 ✅); replaced `## Awaiting PR merge` with the BRIEF-002 slice block; collapsed `## Active bugs` to the archived 4-bug summary; appended this entry.
**Gates 6 + 7 — TICKED ✅ on the SDET evidence:**
- **Gate 6 (Acceptance-validation):** all 7 in-scope AC have AC-id-tagged covering tests green at the mandated tiers — tier-3 RLS `service.rls.test.ts` 10/10 (AC-DOOR-002-05), tier-3 `service.persistence.test.ts` 4/4 (AC-DOOR-002-01/-02/-03), tier-6 admin e2e 17/17 (the add/edit/deactivate journeys dual-tagged DOOR+DASH; AC-DOOR-002-05 UI surface; cross-surface loop tagged AC-DOOR-002-03, correctly NOT AC-DOOR-002-04). Gherkin `.feature` mirror present, 7 scenarios, no drift. COVERAGE-write-back AC-id tag contract complete.
- **Gate 7 (CI / required-CI-equivalent):** `pnpm -r test` 229/229 PASS (auth 124, db 41, admin 41, portal 23 incl. rate-limit 7/7); `pnpm lint` exit 0; `pnpm type-check` exit 0; `pnpm audit --audit-level=high` exit 0 (1 moderate, below threshold). No PR open yet — GitHub required-CI green confirmed by the Conductor post-Close-prep.
**Hard-verification metadata gate — PASS.** All 9 in-scope files (TASK-002-001..005, BUG-002-001/-002/-003/-004) carry populated, in-range `Started-at`, `Completed-at`, `Complexity-estimate`, `Complexity-actual` (1–5), `Impl`, `**Acceptance criteria:**`, `**Upstream refs:**`, `**Introduces-gate:**`. TASK-002-001 timestamp inversion already corrected (07:01:42Z). BUG-002-004 fields complete (Cx-est 1 / Cx-act 1; the dev filled them at close). Two midnight-sentinel `Started-at` placeholders (TASK-002-003, BUG-002-004) are in-range and pass — recorded as a RETRO-002 metric-integrity observation, not a gate failure. No reject-and-fix needed.
**9-gate scorecard (final, this slice):** (1) per-task submission 5/5 ✅ · (2) SDET Review 5/5 ✅ · (3) Overwatch Audit ✅ (0 blocking) · (4) IO Design scan ✅ · (5) Container Smoke ✅ CONDITIONAL-PASS (UI PASS / Infra cond-pass; `sqlserver (unhealthy)` healthcheck SA mismatch documented; clean-volume bootstrap env-blocked → CI-as-gate substitution carried from EPIC-004, user-accepted) · (6) SDET Acceptance-validation ✅ · (7) SDET CI gate ✅ · (8) Post-merge CI — Close-finalize · (9) staging smoke — N/A (`Brief-deploys: no`).
**Artifacts written:** `HANDOFF-002.md` (AC→tag→tier table for COVERAGE write-back, the 3+1 bugs, the cross-surface loop evidence for AC-DOOR-002-03, carried follow-ups) · `RETRO-002.md` (9-gate scorecard + classified findings: the 4-defect container chain headline, the blast-radius lesson, the Audit observations, the carried infra item, the rule-sunset candidates, the cross-surface-parity sunset-counter status).
**Archive:** 5 task files + 4 bug files moved to `tasks/done/`. PROGRESS-ARCHIVE.md updated.
**End:** Close-prep complete. Slice in `## Awaiting PR merge`. PR title + body composed for the main session to open with `gh` against base `main` from `brief-002-services-catalog-management`. IO ends the invocation; PR open + merge is the main-session/user-in-loop step (Autonomy Ceiling item 3). On merge → re-invoke IO for Close-finalize (gate 8 post-merge CI; gate 9 N/A).
