# Progress

> Single source of truth for current slice state, quality gates, active bugs, and retro action items. The IO
> and SDET update this file at the start and end of every invocation. Structure contract: see
> `.implementation/ENGINE.md` § PROGRESS.md structure contract.
>
> **Note (2026-06-14):** the implementation team was refactored into the standalone `.implementation/` layer
> (engine: `ENGINE.md` / `PHASES.md`; orchestrator: `AGENT.md` = the Implementation Orchestrator, `[io]`).
> The team consumes a self-contained build brief.

## Current initiative

_None active._ **BRIEF-002 / EPIC-002 DELIVERED** 2026-06-16 (PR #40 squash-merged to `main` @ `70ea10e`;
gate 8 post-merge CI green; gate 9 N/A — `Brief-deploys: no`). Close-finalize complete; slice swept to
delivered (see the Close-finalize archive entry in `PROGRESS-ARCHIVE.md` + the `## Post-Merge Addendum` in
`RETRO-002.md`).

**Phase-1 epic status:** EPIC-001 (public read catalog) ✅ · EPIC-004 (auth two-role model) ✅ · EPIC-002
(services-catalog write side) ✅ — **all delivered**. **Next-ready epic: EPIC-003** (the only remaining
Phase-1 epic). The IO is eligible to Plan EPIC-003 once a build brief is produced upstream (`.planning/` →
`.orchestration/` composes the brief). No brief is in hand yet — the IO does not author briefs.

**Carried-forward follow-ups (from BRIEF-002 Close-finalize — see `RETRO-002.md` § Post-Merge Addendum for
full detail):** (1) infra clean-volume DB bootstrap (single root family; new BRIEF-002 manifestation = the
`sqlserver` healthcheck SA-password-vs-volume mismatch); (2) CI/lint grep-guard for stray
`sp_set_session_context` outside `client.ts` (panel-dispositioned); (3) pre-existing EPIC-001 `fn_service_access`
CLIENT read-branch tightening (panel-dispositioned); (4) comment-only `service.rls.test.ts` `@read_only`/§4
drift (rides the next `packages/db` task); (5) EPIC-004 RATE_LIMIT `.env.example` vars — user-walled, user
applies. These also live in `## Open retro action items` below.

## Awaiting PR merge

_Empty._ BRIEF-002 / EPIC-002 finalized + delivered (PR #40 squash-merged @ `70ea10e`, gate 8 post-merge CI
green; gate 9 N/A) — cleared from this section at its Close-finalize (2026-06-16). BRIEF-004 delivered earlier
(PR #38 @ `0444551`, gate 8 green). The slice-start gate is clear for the next epic (EPIC-003) once its build
brief lands.

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

### IO Close-finalize — BRIEF-002 — 2026-06-16 — SLICE DELIVERED
**Start:** Re-invoked for Close-finalize. PR #40 squash-merged to `main` @ `70ea10e` (2026-06-16). Gate 8 (post-merge CI) confirmed GREEN by the main session — `CI` ✅ + `CodeQL` ✅ on `70ea10e` (`gh run list --branch main`). Gate 9 N/A (`Brief-deploys: no`, ADR-007). Driving the final close: record the final 9-gate scorecard, sweep the slice to delivered, write the Post-Merge Addendum, point `## Current initiative` at EPIC-003.
**Phase-transition reflex (Close-prep→Close-finalize):** swept the IO Close-prep session entry (incl. the PR-OPENED note) to `PROGRESS-ARCHIVE.md` under a "Swept at Close-prep→Close-finalize transition" marker; updated `## Current initiative` → _None active_ + EPIC-002 delivered + next-ready EPIC-003; emptied `## Awaiting PR merge`; appended this entry.
**Gate 8 — Post-merge CI: ✅ PASS.** `main` @ `70ea10e` — `CI` ✅ + `CodeQL` ✅ (both required checks `conclusion: SUCCESS` on the squash-merge commit). Evidence basis **[A] CI**.
**Gate 9 — Post-merge staging smoke: N/A.** `Brief-deploys: no` (ADR-007 — no production/staging platform).
**Final 9-gate scorecard (all closed):** (1) per-task submission 5/5 ✅ · (2) SDET Review 5/5 ✅ · (3) Overwatch Audit ✅ (0 blocking) · (4) IO Design scan ✅ · (5) Container Smoke ✅ conditional-pass (documented `sqlserver` healthcheck SA mismatch; clean-volume bootstrap env-blocked → CI-as-gate substitution, user-accepted) · (6) SDET Acceptance-validation ✅ · (7) SDET CI gate ✅ · (8) **Post-merge CI ✅** (`70ea10e`: `CI` + `CodeQL` green) · (9) staging smoke N/A.
**Delivery record:** **PR #40 → `70ea10e`.** **7/7 in-scope AC verified** — AC-DOOR-002-01/-02/-03 (add/edit/deactivate persist) · AC-DASH-010-01/-02/-03 (admin-UI CRUD) · AC-DOOR-002-05 (accountant-only write boundary). **4 bugs ridden:** BUG-002-001 (auth fail-closed guard blocked mock in prod build) · BUG-002-002 (Prisma musl/Alpine engine binary target) · BUG-002-003 (`@read_only` SESSION_CONTEXT incompatible with Prisma pooling → **ADR-003 Amendment 1**) · BUG-002-004 (stale portal rate-limit test, blast-radius miss). **ADR-003 Amendment 1** raised upstream. **Evidence basis: [A] CI.**
**Carried-forward follow-ups (preserved — full detail in RETRO-002 § Post-Merge Addendum + `## Open retro action items`):** (a) infra clean-volume DB bootstrap — `sa`-once login creation + Prisma port-in-authority + `!`-free logins + `migrate deploy` P3019; plus the new BRIEF-002 manifestation, the `sqlserver` healthcheck SA-password-vs-volume mismatch; (b) two panel-dispositioned follow-ups now tracked — a CI/lint grep-guard for stray `sp_set_session_context` outside `client.ts`, and the pre-existing EPIC-001 `fn_service_access` CLIENT read-branch tightening; (c) comment-only `service.rls.test.ts` `@read_only`/§4 drift (rides next `packages/db` task); (d) EPIC-004 RATE_LIMIT `.env.example` vars still pending (user-walled — user applies).
**Artifacts:** appended `## Post-Merge Addendum` + final gate detail to `RETRO-002.md`. Zero `BUG-002-POST-*` raised. Task/bug files already in `tasks/done/` (archived at Close-prep).
**End:** Close-finalize exit condition met. **BRIEF-002 / EPIC-002 DELIVERED 2026-06-16.** `## Awaiting PR merge` empty; `## Current initiative` empty → next-ready epic **EPIC-003** (only remaining Phase-1 epic; EPIC-001/004/002 all delivered). IO eligible to Plan EPIC-003 once its build brief lands upstream. **Note: `.implementation/**` ledger edits are NOT committed by the IO — the main session commits PROGRESS.md, PROGRESS-ARCHIVE.md, RETRO-002.md on the `chore/epic-002-close` docs-lane branch.** IO ends the invocation.
