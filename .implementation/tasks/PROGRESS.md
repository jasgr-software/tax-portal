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

**Name:** _None — engine idle._ The previous slice (**BRIEF-001 — Public front door**) is **fully closed** (PR #35 merged to `main`@`f7f6c9d`; Close-finalize gates 8 + 9 cleared 2026-06-15). No slice active.
**Phase:** _Idle._ Eligible to **Plan** the next slice when a build brief is dispatched and the slice-start gate passes (`## Awaiting PR merge` empty ✓; `## Active bugs` dispositioned ✓; `## Open retro action items` dispositioned ✓).
**Last slice closed:** BRIEF-001 — branch `brief-001-public-front-door` (deleted, squash-merged). 9-gate scorecard all PASS/N-A: gates 1–7 PASS pre-merge; gate 8 (post-merge CI) PASS on `main`@`f7f6c9d` (run `27560948602` success — `lint-and-typecheck` ✅, `security-scan` ✅; `test-portal` advisory `continue-on-error` red, non-gating); gate 9 N/A (`Brief-deploys: no`, ADR-007). 13/13 ACs satisfied. Detail + Post-Merge Addendum: `RETRO-001.md`; handoff: `HANDOFF-001.md`.

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

_None._ BRIEF-001 (PR #35) merged to `main`@`f7f6c9d` and Close-finalize completed 2026-06-15 (gate 8 PASS, gate 9 N/A, zero POST bugs). Slice-start gate is clear for the next slice.

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

### IO Close-finalize (attempt 2 — COMPLETE) — 2026-06-15
**Start:** Resumed at PR limbo. **PR #35 MERGED** (squash) to `main`@`f7f6c9d` (`f7f6c9db543f98db228a08cbf44468014294fadf`). Branch `brief-001-public-front-door` deleted; local on `main`@`f7f6c9d`. The attempt-1 inner stop (required-approving-review + required-conversation-resolution under `enforce_admins: true`) was cleared by the user/main session: protection temporarily relaxed, merged `--admin --squash`, `enforce_admins: true` restored, all 10 open threads resolved with documented dispositions. Read ENGINE/PHASES/AGENT/CLAUDE + PROGRESS.
**Phase-transition reflex:** swept the IO Validate / IO Close-prep / IO Close-finalize-attempt-1 session entries to `PROGRESS-ARCHIVE.md`; updated `## Current initiative` (→ idle) and `## Awaiting PR merge` (→ `_None._`).
**Gate 8 — post-merge CI on `main`@`f7f6c9d`: PASS.** Push-triggered run **`27560948602`** (workflow `CI`, event `push`, headSha `f7f6c9d`) → overall conclusion **success**. URL https://github.com/jasgr-software/tax-portal/actions/runs/27560948602. Required checks green: `lint-and-typecheck` ✅, `security-scan` ✅. `test-admin` ✅. `test-portal` → `failure` but advisory `continue-on-error` (NOT required; run conclusion stayed `success` → non-gating; CI applies no portal DB schema/seed — carried follow-up). CodeQL post-merge runs `27560956112`/`27560946313` reported success but remain **advisory** (GHAS unlicensed on this private org repo; wired to re-arm).
**Gate 9 — N/A** (`Brief-deploys: no`, ADR-007 — no staging smoke).
**POST bugs:** zero `BUG-001-POST-*` (verified). **Archive:** TASK-001..006 + BUG-001-001/-002/-003 confirmed in `tasks/done/` (moved at Close-prep — no re-archive). RETRO-001 + HANDOFF-001 retained in `tasks/`.
**Ledger:** wrote `## Post-Merge Addendum` to `RETRO-001.md` (merge SHA, gate-8 evidence, CodeQL-advisory/GHAS note, carried follow-ups: lazy-init DONE; EPIC-004 `$extends` regression test; `adminDb` ESLint boundary; CI portal DB schema/seed → graduate `test-portal`; anon-write rate-limit/CAPTCHA + `serviceId` active-validation hardening; Next.js 15 upgrade landed). Removed BRIEF-001 from `## Awaiting PR merge`.
**End:** **Close-finalize COMPLETE — BRIEF-001 fully closed.** `## Current initiative` idle; engine eligible to Plan the next slice. No git/PR ops run by the IO (main session commits this ledger update to `main`). **Conductor Validate hand-off — green-CI evidence string:** pre-merge run `27560403275` (head `211175b`, `lint-and-typecheck` + `security-scan` success) + post-merge `main` run `27560948602` (head `f7f6c9d`, success). AC→test-tag→tier table: `.implementation/tasks/RETRO-001.md`.
