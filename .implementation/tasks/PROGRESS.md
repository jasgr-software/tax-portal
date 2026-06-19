# Progress

> Single source of truth for current slice state, quality gates, active bugs, and retro action items. The IO
> and SDET update this file at the start and end of every invocation. Structure contract: see
> `.implementation/ENGINE.md` § PROGRESS.md structure contract.
>
> **Note (2026-06-14):** the implementation team was refactored into the standalone `.implementation/` layer
> (engine: `ENGINE.md` / `PHASES.md`; orchestrator: `AGENT.md` = the Implementation Orchestrator, `[io]`).
> The team consumes a self-contained build brief.

## Current initiative

_None active._ **BRIEF-006 / EPIC-006 — Intake questionnaire (per-service-type templates + client completion) —
DELIVERED 2026-06-19.** Merged via **PR #50 → `main` @ `e55f8c5`** (reviewed lane). Close-finalize complete:
**gate 8 (post-merge CI) PASS** — CI run `27796565080` `success` (jobs `lint-and-typecheck` / `security-scan` /
`test-portal` / `test-admin` all green) + CodeQL run `27796564765` `success`, both @ `e55f8c5`; **gate 9 N/A**
(`Brief-deploys: no`, ADR-007 — no staging environment). **All applicable gates 1–8 GREEN.** **7/7 in-scope AC
delivered.** Zero `BUG-006-POST-*`. Post-Merge Addendum + final 9-gate scorecard written to `RETRO-006.md`;
handoff in `HANDOFF-006.md`. Slice removed from `## Awaiting PR merge`.

**Delivery state (Phase 2 — onboarding gate):** EPIC-005 (onboarding spine + letter e-sign gate, step 1) +
**EPIC-006 (intake questionnaire, step 2) — DELIVERED.** **Next ready:** **EPIC-007 is now unblocked** (it
depended on the EPIC-006 questionnaire substrate). **EPIC-008 remains blocked on EPIC-007.** Next orchestration:
Conductor runs `/planning validate EPIC-006` for the `COVERAGE.md` write-back of the 7 in-scope AC (source:
`HANDOFF-006.md`), then the docs-lane close PR carries these `.implementation/tasks/**` Close-finalize edits.

The IO is now eligible to Plan the next slice (`## Awaiting PR merge` empty; slice-start gate passable) when a
build brief for the next ready epic (EPIC-007) is provided.

## Awaiting PR merge

_None._ BRIEF-006 / EPIC-006 cleared **Close-finalize on 2026-06-19** (gate 8 post-merge CI PASS; gate 9 N/A) —
see `## Current initiative` and `RETRO-006.md` § Post-Merge Addendum.

Delivered: **PR #50 `e55f8c5`** (EPIC-006 — intake questionnaire, onboarding step 2), PR #48 `f879da2` (EPIC-005
— opens Phase 2), PR #42 `ec151cb` (EPIC-003), PR #40 `70ea10e` (EPIC-002), PR #38 `0444551` (EPIC-004), PR #35
`f7f6c9d` (EPIC-001) — all merged. **Phase 1 (MVP) complete; Phase 2 (onboarding gate) open — EPIC-005 +
EPIC-006 delivered (steps 1 + 2 of the onboarding sequence); EPIC-007 next-ready.**

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

> Carried observations below (RESOLVED items pruned at BRIEF-005 Plan-start: TASK-004-007 `$extends`
> propagation test + BUG-003-001 RATE_LIMIT `.env.example` vars — both landed in delivered slices).
>
> **BRIEF-006 Plan-start triage (2026-06-18):** items below remain observation/`deferred` with explicit reasons
> (no bare `deferred`). **Actioned this slice:** the **`inventory.md` Track-B drift** (missing `0004`/`0005`
> policy rows + Engagement/LetterTemplate entities) is assigned to **TASK-006-001**, which adds
> `db/policies/0006-*` + new entities — the natural carrier; its SDET review enumerates the full Track-B table.
> **Carried forward (not slice-blocking):** SEC-3 per-connection SESSION_CONTEXT hardening (tracked, not a
> defect); synthetic `Completed-at` inversion (capture real clock values this slice); the `sqlserver`
> healthcheck SA-password mismatch + clean-volume bootstrap/P3019 (infra — surfaces at Smoke if a `down -v`
> rebuild is taken). **Backlog-triage gate: PASS** (`## Awaiting PR merge` empty; `## Active bugs` none).

- **[CI — carried, now actionable] `test-portal` job lacks a `packages/**` build step** — graduate
  `test-portal` to required only after adding `pnpm -r --filter './packages/**' build --if-present` (HANDOFF-004
  follow-up #3; the `@tax-portal/ui` failures pre-date EPIC-004, run `27568768517`; EPIC-004 extends the pattern
  to `@tax-portal/auth`). Tests pass locally (`pnpm -r test` 158/158).
- **[infra — carried] Local DB-bootstrap + `migrate deploy` P3019** — clean-volume bootstrap, Prisma `;port=` /
  `!`-password parsing, P3019 `mssql`-vs-`sqlserver`; why local Smoke is env-blocked (HANDOFF-004 follow-up #2).
- **[gated-path candidate — carried] ESLint import boundary covers only `requestDb`, not `adminDb`** — consider
  extending `packages/eslint-config` to also restrict `adminDb` imports outside sanctioned admin paths.
  (Observation; moved with the deferred Clerk-binding scope to the 2FA-enablement slice.)
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
- **[ungated-fix candidate — RETRO-006 item 3] `scripts/smoke-test.sh` defaults unsuitable for this project** —
  the script defaults `ADMIN_URL=http://localhost:3001` (not the project-remapped `:13001`) and its `sqlserver`
  readiness wait uses `sqlcmd -U sa -P "$MSSQL_SA_PASSWORD"`, which blocks on the carried SA-password/volume
  mismatch. SDET used the CLAUDE.md manual fallback at BRIEF-006 Smoke. Harden: default `ADMIN_URL` to `:13001`;
  derive/re-assert the SA password from the volume bootstrap source. Same root family as the `sqlserver`
  healthcheck item above. (Observation — not promoted; no gate failure.)
- **[ungated-fix candidate — RETRO-006 item 4] `@demo` prior-epic PNG byte-churn** — `@demo` runs rewrite
  prior-epic PNGs (3rd-ish occurrence; main session manually `git checkout`-reverts each slice). TASK-006-007
  itself was scope-disciplined (only EPIC-006 PNGs written); this concerns the *other* `@demo` specs' default
  output paths. Scope each `@demo` spec's screenshot output to its own `docs/demos/EPIC-NNN/` path so the manual
  revert isn't needed. (Observation — not promoted.)
- **[e2e-determinism — RETRO-006 item 5] AC-ONBD-001-01 (EPIC-005-owned) portal e2e flake** —
  `apps/portal/e2e/specs/onboarding.spec.ts:312` failed once at single-run in the full portal suite
  (`data-testid="onboarding-steps"` not found within 5000ms), passed on `--retries 1` at 259ms. File unmodified
  this branch (last touched `f879da2`/EPIC-005). Not a BRIEF-006 regression, not a BRIEF-006 AC. Investigate the
  `beforeEach`/onboarding-nav fixture timing for that describe block. (Non-blocking follow-up.)
- **[metric-integrity — RETRO-006 item 2] Clock-source `Completed-at`/`Started-at` inversion** — TASK-006-002
  `Completed-at` (20:06:28Z) precedes `Started-at` (20:15:00Z). **6th occurrence** of the clock-source family
  (RETRO-002/003/004/005). The other 6 tasks were forward-ordered with real `Started-at` (the RETRO-005 carry was
  actioned). Observation — not promoted; **Overwatch: elevate to `ungated-fix` if it recurs to a 7th** without a
  dispatch-checkpoint/SDET clock-domain convention fix.

---

### Sweep pointer — BRIEF-006 inline session entries archived (close transition) — 2026-06-19
At the Close-finalize (PR limbo → close) phase transition, the full BRIEF-006 inline session history (IO Plan/Design, the Dispatch chain, the SDET review gate-records for TASK-006-001..007, the BUG-006-001 reject→fix→re-approve chain, the Overwatch Audit + IO design-scan record, the Smoke gate-5 record, the SDET Validate gates 6/7 + quality-audit record, and the IO Close-prep record) was **swept to `PROGRESS-ARCHIVE.md`** (see "Sweep marker — BRIEF-006 close (PR limbo → Close-finalize) transition — 2026-06-19"). Full per-entry text is preserved in git history at the `brief-006-intake-questionnaire` build commits (squashed into `e55f8c5`) + `tasks/done/TASK-006-*.md` + `tasks/done/BUG-006-001-*.md` + `RETRO-006.md` + `HANDOFF-006.md`. Only the new Close-finalize entry below is retained inline.

---

### IO Close-finalize — BRIEF-006 / EPIC-006 — 2026-06-19 (gate 8 post-merge CI; gate 9 N/A; slice swept from limbo)
**Start:** Resumed with `## Awaiting PR merge` non-empty (BRIEF-006, PR #50) → resume logic → attempt Close-finalize. PR #50 squash-merged to `main` @ `e55f8c5` (reviewed lane / Lane B; `gh pr merge 50 --squash --delete-branch`; no `--admin`/protection toggle; user-approved). Local `main` synced to `e55f8c5`; remote branch deleted. Read startup checklist (ENGINE.md, PHASES.md § Close-finalize + Scorecard gates 8–9, seed/sources.md, PROGRESS.md, RETRO-006.md).
**Gate 8 — Post-merge CI: PASS.** Both post-merge workflows on `main` @ `e55f8c5` watched to completion (CI was `in_progress` at dispatch; CodeQL already complete). **CI** run `27796565080` → `conclusion: success` — jobs `lint-and-typecheck` ✅, `security-scan` ✅, `test-portal` ✅, `test-admin` ✅ (`report-failure` `skipped`). https://github.com/jasgr-software/tax-portal/actions/runs/27796565080. **CodeQL** (`Code Quality: Push on main`) run `27796564765` → `conclusion: success`. https://github.com/jasgr-software/tax-portal/actions/runs/27796564765. The branch-protection required checks (`lint-and-typecheck` + `security-scan`) are green; the advisory `test-portal`/`test-admin` also green.
**Gate 9 — N/A.** `Brief-deploys: no`; no staging environment (ADR-007 — production platform deferred). Recorded N/A.
**Post-merge bugs:** none. Zero `BUG-006-POST-*` created during PR limbo. `BUG-006-001` was a pre-merge rejection (resolved on-branch, archived to `tasks/done/`), rides the PR — not a post-merge bug.
**Artifacts written:** RETRO-006.md § Post-Merge Addendum (merge detail + gate 8 run URLs/conclusions + gate 9 N/A + final post-merge 9-gate scorecard [1–8 green, 9 N/A] + zero-POST-bugs + EPIC-007-unblocked note). PROGRESS.md: `## Current initiative` rewritten to EPIC-006-DELIVERED + next-ready (EPIC-007 unblocked; EPIC-008 still blocked on EPIC-007); slice removed from `## Awaiting PR merge` (now empty); the four BRIEF-006 carried follow-ups left in `## Open retro action items`.
**Phase-transition reflex (PR limbo → Close-finalize done):** swept the BRIEF-006 inline session entries to PROGRESS-ARCHIVE.md (sweep pointer above); updated `## Current initiative` + `## Awaiting PR merge`; appended this entry. These `.implementation/tasks/**` edits are made in the working tree only — the main session commits them into the docs-lane close PR (the IO does not commit). The out-of-slice Conductor files (`.orchestration/STATE.md`, `.planning/EPIC-002-*.md`, `.orchestration/runs/PR-50-verdict.json`) were NOT touched.
**End:** Close-finalize exit condition met — PR merged, gate 8 green (CI + CodeQL run URLs recorded), gate 9 N/A, zero `BUG-006-POST-*`, Post-Merge Addendum + final scorecard written, slice removed from `## Awaiting PR merge`. **BRIEF-006 / EPIC-006 DELIVERED.** `## Current initiative` is empty — IO eligible to Plan the next slice (EPIC-007) when its brief is provided. **IO ends the invocation.** Next (Conductor): `/planning validate EPIC-006` COVERAGE write-back (source HANDOFF-006) → docs-lane close PR carrying these edits.
