# Conductor State — run ledger

> **Single source of truth for a Conductor run** (the analog of the engine's
> `.implementation/tasks/PROGRESS.md`). The Conductor reads this first on every `/orchestrate` and updates it
> at every phase transition. A fresh run with a mid-flight `## Current run` **resumes** at the recorded
> phase rather than re-selecting. See `ENGINE.md` § State-ledger contract.

## Current run

### EPIC-001 — BRIEF-001
- **Phase:** Report — **DONE (EPIC-001 delivered)**
- **Base branch:** main
- **Feature branch:** brief-001-public-front-door (commit `359e16a`)
- **PR:** [#35](https://github.com/jasgr-software/tax-portal/pull/35)
- **Status:** Fix phase, iteration 2. Next 15 + esbuild upgrade (`ac1f06a`) **cleared the audit CVEs** — `pnpm audit (high+critical)` now green. But CI's first full run exposed two more workflow-infra defects: **security-scan ❌ at `Initialize CodeQL`** (`Resource not accessible by integration` — missing job `permissions:` / possibly GHAS not enabled; required check → blocks merge) and **test-portal/test-admin ❌** (`sqlcmd` not on runner, exit 127; advisory). `lint-and-typecheck` ✅. Dispatching DevOps to fix `.github/workflows/ci.yml`. Run `27559044707`.

<!--
### EPIC-NNN — BRIEF-NNN
- **Phase:** Select | Gate | Compose | Implement | Review | Fix | Merge/Finalize | Validate | Report
- **Base branch:** main
- **Feature branch:** <engine-created branch>
- **PR:** #<N> — <url>
- **Status:** <one-line>
-->

## Phase log

### Select — 2026-06-15
**Start:** Pin the `/orchestrate 001` target and confirm it is a real candidate.
**Actions:**
- Read `ROADMAP.md`, `EPIC-001-public-front-door.md`, `COVERAGE.md`.
- EPIC-001 = Phase-1 public front-door slice, `status: planned`, `depends_on: []`, 13 AC placed in COVERAGE.
**End:** Candidate = EPIC-001 → Gate.

### Gate — 2026-06-15
**Start:** Apply the 7-criterion readiness predicate read-only.
**Actions:**
- (1) `status: planned` ✓ · (2) `open_questions: []` ✓ · (3) no `depends_on` ✓.
- (4) COVERAGE has 13 rows for EPIC-001 AC ✓ · (5) all 13 AC resolve verbatim to REQ-DOOR-001..004 ✓.
- (6) engine limbo ledger clear — `## Awaiting PR merge: None`, `## Active bugs: None` ✓.
- (7) tree clean on `main`; no existing epic-001/front-door branch ✓.
**End:** GO on all 7 → Compose.

### Compose — 2026-06-15
**Start:** Map GO epic EPIC-001 → a build brief honoring the engine's contract.
**Actions:**
- Pulled all 13 AC verbatim from REQ-DOOR-001..004; carried the epic's 13 gherkin scenarios.
- Set `acceptance_format: gherkin`, `e2e: required`; carried the tier-3 accountant-only-read RLS gate
  (ADR-005, non-advisory) + container smoke as extra gates.
- Constraints cite ADR-002/003/004/005/006/012/020; flagged the sanctioned anonymous-write exception.
- Wrote `.implementation/briefs/BRIEF-001-public-front-door.md` (all required fields populated; AC-id
  test-tag contract carried for write-back).
**End:** BRIEF-001 ready → Implement (handoff to `/io`).

### Implement — 2026-06-15
**Start:** Invoke the engine (`/io BRIEF-001`) and drive it to its completion signal (PR in limbo ledger).
**Actions:**
- Engine ingested the brief + load-bearing refs; confirmed greenfield (no `apps/`/`packages/`/`prisma/` yet).
- Engine **resolved the brief's flagged anonymous-write question with no upstream raise**: ADR-003 §6 +
  ADR-005 (anon `EngagementRequest` submit runs insert-only under the admin pool, no `SESSION_CONTEXT`,
  no read-back; entity stays accountant-only-readable via the security policy).
- Engine hit its **Docker pre-flight hard gate**: `docker info` fails in this WSL2 distro (only the Windows
  Docker Desktop binary via `/mnt/c` is on PATH; no `/var/run/docker.sock`; WSL integration not activated).
- Conductor independently confirmed: `docker info` → exit 1; no socket. Halt is real.
- Per BRIEF-001 the e2e suite, the tier-3 accountant-only-read RLS integration test (ADR-005, non-advisory),
  and the container smoke all require the docker-compose stack — Plan exit condition unmet, nothing to dispatch.
**End:** **STOP — deferred to engine inner stop (Docker pre-flight hard gate).** No branch, no PR, no CI.
Resume: user enables Docker, then re-`/orchestrate` (engine resumes from PROGRESS.md `## Current initiative`).

### Implement (resumed) — 2026-06-15
**Start:** Docker unblocked; re-engage `/io` to build BRIEF-001 through to a PR.
**Actions:**
- Engine drove Plan → Dispatch (TASK-001..005) → Audit → Review (SDET) → Smoke → Validate → Close-prep.
- Dispatch loop (main session executed each): TASK-001 scaffold, TASK-002 stack/runner, TASK-003 schema+RLS
  (tier-3 RLS hard gate green 4/4 vs real engine), TASK-004 portal app, TASK-005 e2e (12/12 vs containers).
- SDET batch review: approved 001/002/003; rejected 004 (BUG-001-001 ops docs) + 005 (BUG-001-002 feature
  scenario) → narrow rework → targeted re-review approved both.
- Container Smoke FAILED first run (BUG-001-003: eager Prisma init + missing container DATABASE_URL → /services 500).
  Fix-forward TASK-006 (lazy init + compose URL split + .env contract) → SDET independent clean-slate Smoke PASS.
- Validate: 13/13 AC traced to AC-id-tagged tests; all 9 gates green (CI pending PR); pnpm -r test 28/28.
- Close-prep: main session ran git (commit `359e16a`, 98 files; excluded `.orchestration/STATE.md`), pushed,
  opened **PR #35**; recorded in engine `## Awaiting PR merge`.
**End:** Engine completion signal met (PR #35 in limbo ledger) → Conductor Review.

### Review — 2026-06-15
**Start:** Run the 3-lens advisory panel (`/pr-review 35`).
**Actions:**
- Dispatched security + over-engineering lenses (parallel), then correctness (lead) to aggregate + post.
- Panel posted ONE advisory `COMMENT` review: **request-changes** · blocker 0 · major 5 · minor 11 · nit 1
  (review pullrequestreview-4498473212, 16 inline comments).
- **Real must-fix:** CI fully red — `package.json` `packageManager: pnpm@9.15.9` collides with `version: 9`
  in all four `pnpm/action-setup@v6` steps → `ERR_PNPM_BAD_PM_VERSION`; no CI job executes. Blocks auto-merge.
- Other majors: missing security headers; no rate-limit/abuse control on anon write; PII-in-error-logs;
  **plus two that are deliberate ADR decisions** (admin-pool anon write per ADR-003/005; request-pool +
  SESSION_CONTEXT foundation built ahead of EPIC-004's first caller) the project-agnostic panel can't see.
**End:** Actionable findings present (5 major) → Fix phase (`/pr-fix 35`).

### Fix — 2026-06-15
**Start:** Run the bounded fixer (`/pr-fix 35`) on the panel's findings; drive CI green.
**Actions:**
- Fixer resolved 6 threads (pushed `5b68a4a`, `133ca61`): **CI pnpm-version conflict fixed** (dropped `version: 9`
  from the 4 `pnpm/action-setup` steps; `packageManager` is now the single source) → `lint-and-typecheck` GREEN;
  added security headers to next.config; redacted PII from the error log; memoized the `getAdminPool()` connect
  promise (race fix); test nit. Added a CI workspace-package build step (`133ca61`).
- Dispositioned-as-intended (replied on threads, no code change): admin-pool anon write (ADR-003/005);
  request-pool + SESSION_CONTEXT foundation for EPIC-004; parseSqlServerUrl dup (circular-dep avoidance);
  `sh -c` wrappers (verified NOT no-op — pnpm v9 passes `--if-present` to the script, ESLint 9 rejects it).
- Logged as follow-ups (new scope beyond BRIEF-001 ACs): anon-write rate-limit/CAPTCHA; serviceId active-validation.
- **Could NOT reach green.** Fixing the pnpm break made CI run for the first time, surfacing pre-existing
  transitive CVEs: `next@14.2.29` (5 high → needs Next 15 major upgrade) + `esbuild@0.27.7` via vitest
  (needs >=0.28.1). `security-scan` (required check) RED on real CVEs, not in any review comment, out of fixer scope.
  `test-portal`/`test-admin` RED but `continue-on-error: true` (runner lacks `sqlcmd` — infra gap).
- Last CI: run `27555545293` — lint-and-typecheck GREEN, security-scan RED.
**End:** STOP — fixer couldn't reach green; required `security-scan` red on pre-existing CVEs. (Resolved in
iteration 2 below.)

### Fix (iteration 2) — 2026-06-15
**Start:** User authorized Next 15 + esbuild upgrade to clear the security-scan CVEs; drive PR green.
**Actions:**
- webapp-developer upgraded `next` 14.2.29 → 15.5.19 (one breaking rename:
  `serverComponentsExternalPackages` → `serverExternalPackages`) + `pnpm.overrides.esbuild ^0.28.1`; no React
  bump, no source-logic changes. `pnpm audit --audit-level high` → 0 high; lint/type-check/build/28 tests/e2e
  12×3 all green. Committed `ac1f06a`, pushed.
- CI run `27559044707`: **audit CVEs CLEARED** (security-scan `pnpm audit` step green) + `lint-and-typecheck`
  GREEN. But first full CI run exposed two workflow-infra defects: security-scan ❌ at `Initialize CodeQL`
  (`Resource not accessible by integration`); test-portal/test-admin ❌ exit 127 (host-side `sqlcmd` not on
  ubuntu runner).
- DevOps fixed `.github/workflows/ci.yml`: added `actions: read` to `permissions:` (CodeQL run/cache metadata);
  replaced host `sqlcmd` reachability step with a credential-free TCP probe on :1433 (both advisory test jobs).
  Committed `1ae1119`, pushed.
- DevOps diagnosis (conclusive): CodeQL needs repo-level **Code Security/GHAS**, which is **disabled** on this
  private repo (`gh api` → `code_security: disabled`; code-scanning API 403). Not workflow-fixable; correctly
  did NOT stub CodeQL (user wants real SAST).
- User chose to **enable Code Security/GHAS** themselves (repo-admin Settings action).
**End:** (iteration 2) PAUSED for GHAS — see iteration 3.

### Fix (iteration 3) — 2026-06-15
**Start:** User attempted GHAS enable; verify + drive security-scan green.
**Actions:**
- Verified via `gh api`: `code_security: disabled` still; code-scanning endpoints 403. Private **org** repo →
  CodeQL needs a GHAS **license** the org lacks; repo toggle won't stick. Not resolvable in-session.
- User chose to make CodeQL **advisory**. DevOps set `continue-on-error: true` on both CodeQL steps
  (`Initialize`/`Perform`); kept `pnpm audit --audit-level=high` as the HARD required gate; runbook note added.
  Committed `211175b`, pushed.
- CI run `27560403275` → **conclusion: success.** `lint-and-typecheck` ✅, `security-scan` ✅ (audit hard-gate
  green; CodeQL advisory), `test-admin` ✅ (TCP-probe fix), `test-portal` ❌ but `continue-on-error` (advisory,
  non-gating). Both required checks green → PR mergeable.
**End:** Fix complete (CI green on required checks) → Merge/Finalize (engine Close-finalize).

### Merge/Finalize — 2026-06-15
**Start:** Engine eligible to merge; resolve the branch-protection human gates (user-authorized) and merge.
**Actions:**
- IO Close-finalize attempt: refused to merge — `main` branch protection blocked it
  (`required_conversation_resolution: true` with 10 open threads; `enforce_admins: true` → `--admin` can't
  override). Correct inner stop — engine never bypasses governance.
- User authorized relaxing protection. Conductor (main session) executed the minimal reversible change:
  resolved all 10 review threads (dispositions recorded in fixer replies) → 0 open; `DELETE` enforce_admins
  → `gh pr merge 35 --squash --admin --delete-branch` → **MERGED, squash SHA `f7f6c9d`**; restored
  `enforce_admins: true`. Verified restore.
- Local sync: remote+local `brief-001-public-front-door` deleted; local fast-forwarded to `main`@`f7f6c9d`;
  PROGRESS/STATE ledgers preserved via stash/pop (clean).
**End:** PR #35 merged → engine Close-finalize (gate 8 post-merge CI) → Conductor Validate.

### Close-finalize + Validate — 2026-06-15
**Start:** Engine post-merge finalize, then planning COVERAGE write-back.
**Actions:**
- Engine Close-finalize: Gate 8 post-merge CI (`main`@`f7f6c9d`, run `27560948602`) = success (lint + audit
  green); gate 9 N/A (no deploy); zero POST bugs; slice archived; RETRO-001 Post-Merge Addendum written;
  BRIEF-001 removed from `## Awaiting PR merge`; engine idle.
- Conductor Validate: `/planning validate EPIC-001`. AC↔test traceability 13/13 complete. Surfaced that
  per-PR CI doesn't run the AC test tiers (component advisory/red; tier-3+e2e not per-PR by design) — the AC
  tests pass under the **SDET** independent gate, not CI. User set the sign-off precedent: accept SDET +
  required-CI evidence. Planning flipped 13 AC `planned → verified`, EPIC-001 `status → delivered`, ROADMAP +
  COVERAGE note [A] (caveat + follow-up: wire AC test tiers into required CI).
**End:** EPIC-001 DELIVERED. Single-slice lifecycle complete → Report + STOP.

<!--
### <Phase> — <YYYY-MM-DD>
**Start:** <what this phase is doing>
**Actions:**
- <bulleted>
**End:** <outcome → next phase, or STOP + reason>
-->

## Outcome

- **EPIC-001:** **DELIVERED** ✅ — full single-slice lifecycle complete (Select → Gate → Compose → Implement
  → Review → Fix → Merge/Finalize → Validate → Report).
  - **Shipped:** PR [#35](https://github.com/jasgr-software/tax-portal/pull/35), squash-merged to `main` as
    **`f7f6c9d`**. Public front door — anonymous browse active services + submit a pending engagement request,
    no account/sign-in; scaffolds `apps/portal`, the monorepo, `packages/db` (two-pool + RLS), the
    `service`/`engagement_request` schema, and the accountant-only-read security policy.
  - **AC verified:** **13/13** (`AC-DOOR-001-01..004-05`) → `verified` in `COVERAGE.md`; EPIC-001
    `status: delivered`. Evidence (user-set precedent): SDET independent acceptance-validation (tier-3 RLS 4/4,
    e2e 12/12 vs real containers, 28/28 unit/integration) + green required CI. Pre-merge run `27560403275`;
    post-merge `main` run `27560948602`.
  - **Forks resolved this run (user decisions):** (1) Docker enabled (first halt); (2) Next.js 15 + esbuild
    upgrade cleared real CVEs; (3) CodeQL made advisory (GHAS unlicensed on private org repo), `pnpm audit`
    kept as the hard gate; (4) branch protection temporarily relaxed to merge, then **restored**
    (`enforce_admins: true`); (5) sign-off bar = SDET + required CI.
  - **Carried follow-ups (tracked, non-blocking):** wire AC test tiers (component/tier-3/e2e) into required CI
    (graduate `test-portal`; future sign-offs rest on CI); EPIC-004 `$extends` SESSION_CONTEXT regression test;
    extend ESLint boundary to `adminDb`; anon-write rate-limit/CAPTCHA + serviceId active-validation; GHAS
    license → re-arm CodeQL; Track-A Prisma 5.22 sqlcmd bootstrap.
  - **Next ready epic:** **EPIC-004** (auth & two-role model) — the other dependency-free Phase-1 slice. Run
    `/orchestrate 004` (or `/orchestrate` to auto-select). EPIC-002/003 unblock once EPIC-004 delivers.
-->
