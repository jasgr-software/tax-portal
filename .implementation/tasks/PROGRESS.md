# Progress

> Single source of truth for current slice state, quality gates, active bugs, and retro action items. The IO
> and SDET update this file at the start and end of every invocation. Structure contract: see
> `.implementation/ENGINE.md` § PROGRESS.md structure contract.
>
> **Note (2026-06-14):** the implementation team was refactored into the standalone `.implementation/` layer
> (engine: `ENGINE.md` / `PHASES.md`; orchestrator: `AGENT.md` = the Implementation Orchestrator, `[io]`).
> Prior-pipeline bookkeeping (the legacy SA/RA epic state and the long-merged chore PRs) is retired with that
> refactor; see `PROGRESS-ARCHIVE.md` and git history. The team now consumes a self-contained build brief.

## Current initiative

**Name:** BRIEF-001 — Public front door (browse active services & submit an engagement request, anonymous)
**Branch:** `brief-001-public-front-door` (cut from `main` this session)
**Goal:** Thinnest end-to-end anonymous thread — public services page + engagement-request form in `apps/portal`;
`service` + `engagement_request` Prisma schema; accountant-only-read SQL Server security policy on
`engagement_request`; full test pyramid (e2e + tier-3 RLS integration). First real build — scaffolds `apps/portal`.
**Phase:** Close-prep COMPLETE → **PR limbo**. Validate PASSED (13/13 ACs traced to AC-id-tagged tests at prescribed tiers; tier-3 RLS hard gate 4/4 green; e2e green vs containers; `validate-gates.sh` ALL CHECKS PASSED). RETRO-001 + HANDOFF-001 written; all 6 tasks + 3 bugs archived to `tasks/done/`. SDET CI gate deferred to the opened PR (gate 8, recorded at Close-finalize). Awaiting main-session `git` commit + `gh pr create`, then PR merge (Autonomy-Ceiling user-in-loop checkpoint), then IO Close-finalize.
**Brief-type:** feature · **Brief-deploys:** no (production platform deferred, ADR-007) · **Gated:** yes
**Methodology:** tdd optional · acceptance_format gherkin · e2e **required** · coverage none · extra gates: tier-3 accountant-only-read RLS policy test (ADR-005, hard, not advisory) + container smoke before Validate.

**Docker pre-flight:** PASSED this session — `docker info` succeeds (server 29.4.1), `/var/run/docker.sock` present, compose v5.1.3. The prior-session hard-gate halt is cleared.

**Plan resolution:**
- **Architecture flag resolved (no upstream raise):** the sanctioned anonymous write IS documented — ADR-003
  §1/§6 (anonymous paths use the admin pool, never the request pool) + ADR-005 §Tables-in-scope (EngagementRequest
  public/anon submits run under admin principal). Insert-only, no `SESSION_CONTEXT` identity, no read-back;
  `engagement_request` stays accountant-only-readable via `sec.pol_EngagementRequest`.
- All 13 AC trace to testable gherkin scenarios; methodology recorded. Design-coherence check PASSED (every AC →
  a task with an AC-id-tagged test at the prescribed tier; tier-3 RLS hard gate in TASK-003; tier-6 e2e in TASK-005).
- Greenfield confirmed (no `apps/`, `packages/`, `prisma/`, `db/`, `docker-compose.yml`, `.env.example`). CI
  workflow `.github/workflows/ci.yml` already degrades gracefully pre-scaffold and activates once `pnpm-lock.yaml`
  + root `lint`/`type-check` scripts land (TASK-001).

**Task list (decomposed; dependency-ordered):**
- **TASK-001** — Monorepo + tooling scaffold (devops) · `done` · AC: none (scaffold) · depends: none
- **TASK-002** — Local stack docker-compose + operations docs + db-migrate runner (devops) · `done` · AC: none (infra) · depends: 001
- **TASK-003** — Prisma schema + packages/db (two pools + SESSION_CONTEXT) + accountant-only-read RLS policy + tier-3 integration test (webapp-developer) · `done` · AC: 004-03/-04, 002-04/001-02/003-04 (data), + RLS hard gate · depends: 001,002
- **TASK-004** — apps/portal scaffold + services page + request form + anonymous submit (webapp-developer) · `done` · AC: 001-01/-02/-03, 002-04, 003-01..04, 004-01/-02/-05 · depends: 001,002,003
- **TASK-005** — Playwright e2e infra + gherkin binding (webapp-developer) · `done` · AC: e2e tier (001-01/-03, 003-01..04, 004-01/-02/-03/-05 e2e) · depends: 001,002,003,004
- **TASK-006** — Lazy Prisma init + complete `DATABASE_URL` contract + ops docs (Smoke-gate fix-forward) (webapp-developer) · `done` · Fixes BUG-001-003 · SDET approved 2026-06-15T09:26:00Z · AC: restores 001-01/-02/-03, 003-01, 004-01/-02/-03/-05 under the clean container env contract · touches `packages/db/src/client.ts` (a TASK-003 `done` file — fix-forward, not revert; IO-acknowledged) · depends: 003,004,005 · `Complexity-actual: 3`

## Awaiting PR merge

- **BRIEF-001 — Public front door** · branch `brief-001-public-front-door` · **PR:** _<pending — main session fills the number after `gh pr create`>_
  - **Pre-merge gates recorded (Autonomy-Ceiling item 3(d)):** Container Smoke PASS · SDET Acceptance-validation PASS · SDET CI gate → runs on the PR (gate 8 at Close-finalize) · SDET quality audit PASS (no blocking gaps) · `scripts/validate-gates.sh` ALL CHECKS PASSED.
  - **Deploys:** no (ADR-007) → gate 9 N/A. **Workflow-file LGTM gate:** does NOT apply (diff touches no `.implementation/ENGINE.md|PHASES.md|AGENT.md|agents/**`).
  - **Close-finalize blockers to clear:** PR merged + post-merge CI green (gate 8) + zero active `BUG-001-POST-*`.

## Active bugs

- **BUG-001-003** — `closed` — Eager Prisma init + incomplete DB URLs break clean-slate container smoke. Two defects: (1) gated-path — `packages/db/src/client.ts` eagerly constructs `requestDb`/`adminDb` at module load + `docker-compose.yml` portal service omits `DATABASE_URL` → barrel import throws `PrismaClientConstructorValidationError` → `/services`,`/request` HTTP 500; (2) config — `.env.local`/`.env.example` DB URLs incomplete (no port 14330/creds/trust) → host-side Playwright fixture fails to connect. Fixed by **TASK-006**.
- _BUG-001-001 and BUG-001-002 both `closed` at SDET re-review 2026-06-15._

## Open retro action items

> Close-prep dispositions (2026-06-15). The two TASK-006-folded items are RESOLVED. The remaining carried items
> stay as observations for downstream epics (below the retro promotion bar). Full classification: `RETRO-001.md`.

- **[RESOLVED in TASK-006] Lazy Prisma client init in `packages/db`** — fixed (memoized factories behind `Proxy`; barrel import constructs no client). The `next.config.mjs` build-time stub was intentionally NOT removed (scope narrow; stub-removal stays a future cleanup — non-load-bearing at runtime post-lazy-init).
- **[RESOLVED in TASK-006] Dangling `scripts/db-await-healthy.ts` reference** — `db:reset` script fixed.
- **[EPIC-004 — carried] `client.ts` `$extends` SESSION_CONTEXT propagation untested** — the RLS hard gate exercises raw `mssql`, not the Prisma `$extends` wrapper path (Prisma 5.22 workaround). Add a regression test in EPIC-004 (first request-scoped-auth slice).
- **[gated-path candidate — carried] ESLint import boundary covers only `requestDb`, not `adminDb`** — consider extending `packages/eslint-config` to also restrict `adminDb` imports outside sanctioned admin paths.
- **[infra — carried] Track-A Prisma 5.22 sqlcmd-bootstrap workaround** — Prisma `migrate deploy` can't honor the non-default SQL Server port locally; Track-A applied via `sqlcmd`. Revisit when Prisma resolves the port limitation.

---

### IO Validate — 2026-06-15
**Start:** Resumed at Validate (SDET combined pass: TASK-006 `done`, BUG-001-003 `closed`, Container Smoke PASS; all 6 tasks `done`, all 3 bugs `closed`, PR limbo empty). Read ENGINE/PHASES/AGENT/CLAUDE/sources + the brief in full. Ran the acceptance + quality audit read-only (Read/Glob/Grep/Bash).
**Acceptance-validation gate (delivered behavior vs the brief's 13 ACs under gherkin + e2e methodology):**
- **AC↔test-tag↔tier traceability — 13/13 PASS.** Grepped `AC-DOOR-NNN-NN` across `apps/portal/e2e/specs`, `apps/portal/src/components`, `packages/db/src`. Every AC has at least one AC-id-tagged test at its prescribed tier. Full table in `RETRO-001.md`. Highlights verified directly: e2e tier-6 `test()` titles carry the AC id (`services-page.spec.ts`, `request-form.spec.ts`, `submit.spec.ts`); tier-3 `engagement-request.persistence.test.ts` covers 004-03 (pending) + 004-04 (no User row); `services.query.test.ts` covers 002-04/001-02/003-04 (active-only); component tests cover 003-02/-03/004-05/004-02; gherkin mirror `public-front-door.feature` carries all 13 `@AC-DOOR-*` scenarios (004-04 mirror present, happy-path `@smoke`).
- **Tier-3 RLS hard gate (ADR-005):** VERIFIED GREEN — `engagement-request.rls.test.ts` 4/4 (ACCOUNTANT positive; null-context anonymous ZERO rows fail-closed; CLIENT ZERO rows; admin-pool RLS-exempt) against the real SQL Server container. Run marker `/tmp/sdet-pnpm-r-test.log` (09:25Z) — TASK-003 Work Log gate-authoring evidence updated with the local-CI log-path marker so the backstop is satisfied.
- **E2e gate vs containers:** VERIFIED GREEN (Smoke/SDET) — `=== smoke PASS ===`; full portal e2e green vs the docker-compose stack (SUT `tax-portal-portal`).
**9-gate scorecard:** gates 1 (6/6 submission), 2 (6/6 SDET review), 3 (audit), 4 (design scan), 5 (container smoke), 6 (acceptance-validation) all PASS; gate 7 (SDET CI) runs on the PR → recorded at Close-finalize (gate 8); gate 9 N/A (Brief-deploys: no, ADR-007). `scripts/validate-gates.sh` → ALL CHECKS PASSED (after the TASK-003 run-marker fix). Task metadata contract: all 6 tasks have populated `Started-at`/`Completed-at`/`Complexity-estimate`/`Complexity-actual` (all `Complexity-actual` in 1–5).
- **Active bugs:** zero open blocking bugs. **PR limbo:** ready to receive the slice.
**End:** Validate PASSED. Transitioning Validate → Close-prep.

### IO Close-prep — 2026-06-15
**Start:** Consistency gate + archive + retro + handoff + move to PR limbo.
**Actions (phase-transition reflex):**
- Swept the Smoke/Review/Validate-prep session entries (SDET combined pass, IO Smoke ×3, SDET smoke gate, IO Review design-scan, SDET re-review, IO Review rework ×2, SDET Review, IO Audit+Review) to `PROGRESS-ARCHIVE.md`.
- **Consistency gate PASS:** all 6 tasks `done` + metadata complete; 3 bugs `closed`; `validate-gates.sh` ALL CHECKS PASSED.
- Wrote `RETRO-001.md` (9-gate scorecard + AC→test-tag→tier table + classified findings + auto-merge/parity audits) and `HANDOFF-001.md` (13/13 ACs SATISFIED, implementation-level decisions, "no upstream raise", downstream follow-ups for EPIC-002/003/004).
- Archived TASK-001..006 + BUG-001-001/-002/-003 to `.implementation/tasks/done/` (plain `mv` — first build, files not yet tracked).
- Updated `## Current initiative` (phase → Close-prep COMPLETE / PR limbo), `## Awaiting PR merge` (BRIEF-001 entry with pre-merge gate verdicts + PR-number placeholder), `## Open retro action items` (Close-prep dispositions).
- **Working-tree credential scan (IO surface):** `git status --untracked-files=all` shows NO `.env.local`/secret/`node_modules`/`test-results`/`.next`/`/tmp` log files (`.gitignore` already excludes them). `.env.example` is the only `.env*` committed (template; allowlisted). NOTE: `.env.example` is permission-denied to the IO sandbox — the main session must run its own credential-pattern scan before `git add` (Autonomy-Ceiling item 2).
- **Flagged for the main session:** `.orchestration/STATE.md` is modified in the working tree — that is Conductor state (main-session-owned, `.orchestration/**`), NOT part of the BRIEF-001 slice diff. Do NOT stage it into the slice PR unless the Conductor intends it; named the explicit slice file set instead of `git add -A`.
**End:** Close-prep COMPLETE. Returning the exact `git add` / commit / `gh pr create` command block to the main session (git is main-session-owned; the IO does not run git). On merge → re-invoke IO for Close-finalize (post-merge CI gate 8; gate 9 N/A). No inner stop.
