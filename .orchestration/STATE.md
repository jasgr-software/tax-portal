# Conductor State — run ledger

> **Single source of truth for a Conductor run** (the analog of the engine's
> `.implementation/tasks/PROGRESS.md`). The Conductor reads this first on every `/orchestrate` and updates it
> at every phase transition. A fresh run with a mid-flight `## Current run` **resumes** at the recorded
> phase rather than re-selecting. See `ENGINE.md` § State-ledger contract.

## Current run

### EPIC-004 — BRIEF-004 (re-scoped 2026-06-15 per user direction)
- **USER DIRECTION (2026-06-15):** _"Mock the auth provider for e2e instead. We need to defer this requirement
  since we're not ready to deploy 2FA."_ → Resolves the Clerk hard-gate by (1) **deferring the 2FA AC** out of
  EPIC-004's in-scope set and (2) **mocking the auth provider for e2e/local** (no real Clerk keys gate this
  slice). Pivot in progress: planning re-scope → brief re-compose → resume engine.
- **Deferred (4 AC → future "2FA enablement" slice):** AC-AUTH-004-01/-02/-03 (REQ-AUTH-004 mandatory accountant
  2FA) + AC-AUTH-005-01 (REQ-AUTH-005 client *may enroll* 2FA). **Still in scope (11 AC):** AC-AUTH-001-01/-02/-03,
  005-02 (client proceeds *without* 2FA), 006-01/-02/-03, 009-01, 010-01/-02/-03.
- **Methodology change (brief-level, user-approved deviation):** the brief's "never stub the auth provider" rule
  is relaxed for this slice — auth provider is **mocked/test-doubled for e2e + local dev**; real Clerk test-mode
  provisioning is **deferred** with the 2FA AC. Hardening follow-up: when the 2FA-enablement slice lands, swap
  the mock for real Clerk test-mode and re-validate the deferred AC + the now-mocked AUTH-006/009/010 against
  the live provider.
- **Phase:** Implement — re-entering after re-scope (was STOPPED at Clerk test-mode hard-gate; now resolved by
  the user direction above).
- **Re-scope steps DONE (2026-06-15):** (1) Planning agent re-scoped EPIC-004 → 11 in-scope AC; 4 2FA AC
  flipped `deferred` in COVERAGE (Summary EPIC-004 15→11, placed-total 55→51) + ROADMAP updated. (2) BRIEF-004
  re-composed: 11 AC, 11 gherkin scenarios, 2FA scope removed, methodology now "auth provider mocked for
  e2e + local; no real Clerk keys gate this slice; auth-abstraction seam keeps Clerk as the production drop-in
  target." extra_gates retained: cross-app redirect e2e, sign-in rate-limit, auth-event audit, SESSION_CONTEXT
  regression, container smoke. **Clerk env hard-gate is removed.**
- **Base branch:** main · **Feature branch:** `brief-004-auth-two-role-model` (engine-created)
- **PR:** **#38** — https://github.com/jasgr-software/tax-portal/pull/38 (OPEN, mergeable; 1 commit `1a83215`).
  ⚠️ **Opened prematurely by the TASK-004-002 developer** (boundary violation: developers must not commit/push/
  open PRs — git is the main session's job; also used a `git add -A`-style sweep that committed app code +
  `.orchestration/STATE.md` + `.planning/*` re-scope + `PROGRESS.md` in one commit; PR should open at
  Close-prep, not after task 2). **Decision:** adopt #38 as the slice PR (code passed gates; no value in
  tearing it down); **main session owns all further commits/pushes**; finalize PR title/body at Close-prep.
  Flag for SDET: duplicate middleware files — both `apps/<app>/middleware.ts` AND `apps/<app>/src/middleware.ts`
  exist per app (Next.js `src/` layout uses `src/middleware.ts`; the root one is a likely orphan).
- **Dispatch progress:** TASK-004-001 (apps/admin scaffold) **done**. TASK-004-002 (`packages/auth` port +
  ADR-010 middleware + mock binding) **done** — SDET rejected → BUG-004-001 (orphan root `middleware.ts` in both
  apps; live gate is `src/middleware.ts`) → IO self-implemented the 2-file deletion, gate re-ran green,
  TASK-004-002 closed. All re-scope guardrails passed (no 2FA; mock default + no real Clerk keys; Clerk binding
  throws if called; role server-evaluated via HMAC-signed cookie; both apps consume shared helper; db
  type-compatible). AC-AUTH-001-03 + AC-AUTH-010-* foundation covered (21+42 tagged unit tests + per-app e2e
  seam). TASK-004-003 (full Clerk binding) **trimmed/deferred** to the future 2FA-enablement slice (gate-invisible
  code — needs a live Clerk instance; the minimal compiling production-target seam already shipped in -002).
  TASK-004-004 (role-model invariants AC-AUTH-001-01/-02/-03) **done** — SDET approved (single-source-of-truth
  `ROLES` enum; ADR-005 trust-boundary proven cryptographically via HMAC forgery rejection; 92 packages/auth
  tests). Commits on PR #38: `1a83215` (001+002), `7705bf9` (BUG-004-001 fix). TASK-004-005 (portal client auth — AC-AUTH-005-02, 006-01/-02/-03) **done** — SDET approved (no 2FA anywhere;
  invitation-only with the AC-006-02 negative invariant proven from 4 angles; role server-set per ADR-005;
  portal e2e 23/23 incl. prior specs; 9 tier-3 provenance tests). Commits on PR #38: `1a83215`, `7705bf9`,
  `94908b4`. TASK-004-007 (SESSION_CONTEXT wiring + `$extends` regression + session expiry — AC-AUTH-001-03 + AC-AUTH-009-01)
  **done** — SDET approved; closes the carried EPIC-001 `$extends`-untested retro item (live-container read-back
  of both clerk_user_id + role; fail-closed; ADR-005 trust boundary; production wrappers untouched; 141 tests).
  Non-blocking follow-up (SDET): admin `page.tsx` stub queries the admin pool inside `withRequestContext` so the
  SET hook doesn't fire on that page path — switch to the request-pool `db` client when it gains real
  engagement-data queries in a later epic. Commits on PR #38: `1a83215`, `7705bf9`, `94908b4`, `1c73ebe`.
  TASK-004-008 (exhaustive cross-app redirect suite AC-AUTH-010-01/-02/-03 + session continuity + global
  sign-out; introduces `pnpm e2e:cross-app` required gate) **done** — SDET approved (all 3 Gate-Authoring
  evidence items verified vs live source; 9 tests both surfaces; redirect-not-403; gate `&&`-chained).
  **All 11 in-scope AC now have passing covering tasks.** Commits on PR #38: `1a83215`, `7705bf9`, `94908b4`,
  `1c73ebe`, `9b92d03`. TASK-004-009 (sign-in rate-limit, ADR-022) **done** — SDET approved (RateLimiter port in packages/auth + env
  defaults; integration test drives signInAsClient; source-IP keyed w/ trusted-proxy DECISION; single-process
  caveat + scaling trigger in runbook; reset hook; 158 tests). Commits on PR #38: …`ca32a5a`.
  **RESIDUAL (user action — `.env*` is permission-walled from agents AND the main session):** add to
  `.env.example`: `RATE_LIMIT_MAX_ATTEMPTS=10` + `RATE_LIMIT_WINDOW_MS=60000` (optional tuning vars, safe
  defaults, already documented in runbook). Apply with: `! printf '\nRATE_LIMIT_MAX_ATTEMPTS=10\nRATE_LIMIT_WINDOW_MS=60000\n' >> .env.example`
  TASK-004-010 (auth-event audit, ADR-019) **done** — SDET approved; real APPEND_ONLY_LEDGER_TABLE + RLS policy
  denying CLIENT (HARD-gate isolation test: CLIENT reads ZERO + null-context ZERO); fail-closed transactional
  audit on account creation; accountant-sign-in seam at mock-session w/ deferred-transactional-bind DECISION;
  9 live-container tests; 167 total. TASK-004-011 (@demo walkthrough) **done** — SDET approved + ran the
  DEMO-POLICY Smoke step: clean-rebuilt the admin image (dev's first run captured a stale pre-007 admin stub —
  byte-identical PNGs were the tell), re-captured shots 05/07/08 vs the real -007 authenticated surface, fixed a
  strict-mode locator, assembled `docs/demos/EPIC-004/DEMO.md` (8 AC-tagged screens); EPIC-001 demo flake
  confirmed transient. **ALL DISPATCH TASKS DONE.** Demo specs ride PR #38; the `docs/demos/EPIC-004/` gallery +
  README ship in the closing docs-lane PR (DEMO-POLICY). Commits on PR #38: …`9f85ced`.
- **Cascade status:** **Audit** done (Overwatch 0 blocking / 6 advisory). **Review (IO design-scan)** PASSED (all
  cited ADRs honored at the diff; re-scope guardrails confirmed; 0 violations). IO fixed 6 task-file metadata
  items directly (5× `Updated-by`→sdet; TASK-011 `Completed-at` inversion) — uncommitted, ride PR #38.
- **STOPPED-AT: Smoke — environment hard-gate (`.env.local` DB URLs incomplete).** Container layer is CLEAN
  (both images build; all 5 services `(healthy)`; portal :3000 + admin :13001 answer `/healthz` + `/readyz`).
  But on a clean `docker compose down -v` rebuild, `pnpm db:migrate` FAILS: the 6 DB connection URLs in
  `.env.local` are truncated stubs (`sqlserver://localhost`, no port/db/creds/`trustServerCertificate`) →
  TLS self-signed-cert error before reaching SQL Server. `.env.local` is **permission-walled from agents AND the
  main session** — I cannot fix it. This is an env hard-gate like Docker/Clerk → surface + stop, no workaround.
  **(Pre-existing local-env gap; not introduced by this slice — the slice never touches `.env.local`. Earlier
  dev/SDET DB tests passed because the volume was already migrated from a prior session / the rls tests build
  raw `mssql` config explicitly; the `down -v` clean rebuild is what exposes the truncated URLs.)**
- **RESUME (user):** complete the 6 DB URLs in `.env.local` per `.implementation/operations/runbook.md` §
  Database connection — host-side (scripts/dev/host Playwright): `port=14330`, `database=taxportal`, admin
  `user=taxportal_admin;password=TaxPortalAdmin2024`, request `user=taxportal_user;password=TaxPortalUser2024`,
  `trustServerCertificate=true`; container-side (`PORTAL_/ADMIN_*`): host `sqlserver`, `port=1433`. (Reconcile
  the runbook's own `taxportal_user`-vs-`taxportal_app` + `taxportal`-vs-`tax_portal` inconsistencies against
  your working BRIEF-001 `.env.local`.) Then re-invoke `/orchestrate 004` → resumes at **Smoke**.
- **Smoke deep-debug (2026-06-16) — local DB bootstrap chain (all PRE-EXISTING infra, NOT EPIC-004):**
  Container layer clean (5 services healthy; both apps serve health probes). DB-bootstrap blockers found + fixed
  in sequence: (1) clean `down -v` volume has NO db + NO app logins (only `sa`) → manually bootstrapped
  `tax_portal` DB + `taxportal_admin` login (db_owner) via `sqlcmd` as sa; (2) **Prisma ignores `;port=` param
  and defaults to 1433**, which collides with **`journey-for-jasmine-db-1`** (another project on host 1433) →
  fixed by putting port in the authority (`sqlserver://localhost:14330;…`); (3) Prisma 5.22 mis-parses `!` in
  passwords → use the `!`-free `taxportal_admin`/`taxportal_user` logins; (4) project `.nvmrc`=20 but shell on
  Node 24 → installed Node 20.20.2 + corepack pnpm. Corrected URLs written to `env.local.tmp` (repo root) for
  the user to merge into `.env.local`.
  **REMAINING HARD BLOCKER:** `prisma migrate deploy` (Track A) fails **P3019 — "schema provider `mssql` ≠
  migration_lock `sqlserver`"**, which contradicts the files (both say `sqlserver`; single schema; no `mssql`
  anywhere) and reproduces under BOTH Node 20 and 24. Prisma's only suggested fix is regenerating the migration
  history (`prisma migrate dev`) — a DESTRUCTIVE change to the committed BRIEF-001 migration; NOT done without
  explicit user authorization.
- **USER DECISION (2026-06-16): "Accept CI as the gate."** Local container-Smoke recorded `env-blocked
  (user-accepted CI substitution)` — surfaced, NOT silently skipped. Verification basis = CI (clean GitHub env) +
  the SDET's dev-time e2e/RLS runs (same basis EPIC-001 shipped on, COVERAGE [A]). **Infra follow-up filed:** fix
  clean-volume bootstrap (DB+login creation; Prisma port-in-authority; `!`-free Prisma logins) + the migrate-deploy
  P3019. Proceed: Validate → Close-prep → merge on green REQUIRED CI.
- **CI on PR #38 head `967b88c`:** REQUIRED green — `lint-and-typecheck` ✅ + `security-scan` ✅; `test-admin` ✅;
  CodeQL ✅. `test-portal` ❌ but **advisory** (`continue-on-error`, not required) — consistent with the documented
  EPIC-001 carried issue (CI provisions no portal DB schema/seed); local EPIC-004 portal tests passed; SDET
  Validate adjudicates advisory-vs-regression.
- **Next:** Validate (acceptance + CI gate + quality audit) → Close-prep (→ `## Awaiting PR merge`) → Conductor
  Review (/pr-review) → Fix → Merge/Finalize → Validate(write-back via /planning) → Report.
- **Close-prep DONE** — slice in `## Awaiting PR merge`; HANDOFF-004 + RETRO-004; tasks archived. Commit
  `b287e79` on PR #38.
- **Conductor Review (panel) DONE — advisory REQUEST-CHANGES.** `/pr-review 38` posted one consolidated review
  (https://github.com/jasgr-software/tax-portal/pull/38#pullrequestreview-4502742406): **1 blocker + 8 major +
  4 minor** (18 raw → 13 deduped). Headline findings: **BLOCKER** fail-open auth (AUTH_PROVIDER defaults to
  mock everywhere + committed fallback `MOCK_SESSION_SECRET` + no NODE_ENV=production guard + uncaught Clerk-
  binding throw in `require-role.ts`); **MAJOR** admin `page.tsx` never re-checks `role===ACCOUNTANT` (CLIENT
  with any identity reaches admin surface); **MAJOR** `getIdentity()` no try/catch → real-Clerk 500s every req;
  **MAJOR** `/api/*` blanket gate-exempt both apps; **MAJOR** spoofable leftmost-XFF rate-limit key; **MAJOR**
  session cookie missing `Secure`; over-eng majors (port width / dual-crypto / dead checkSession — these target
  the **intentional deferred-Clerk seam**, disposition-with-rationale candidates). **Next: Conductor Fix
  (`/pr-fix 38`)** — fix the genuine bugs + security findings; disposition the deferred-seam over-eng findings
  with rationale (intentional next-slice seam per the brief).
- **Conductor Fix DONE (2026-06-16) — `/pr-fix 38` green.** Pre-step: main session fixed a required-CI blocker
  unrelated to the panel — `check_task_file_completion` (inside `lint-and-typecheck`) was red because
  `TASK-004-011` used `**Field:**` (colon-inside-bold) for Started-at/Completed-at/Complexity-* vs the
  checker's `**Field**:` form; reformatted to match siblings (commit `950a13a`). Then pr-fixer addressed 13/13
  panel findings: **FIXED** F1/F6 fail-closed auth (throw on mock|unset AUTH_PROVIDER in prod; MOCK_SESSION_SECRET
  required, compose `:?`), C-middleware-throw (try/catch fail-closed), C-admin-page (role===ACCOUNTANT re-check),
  F2 (`/api/*`→`/api/mock-session` only, mock-gated), F3 (XFF behind `TRUST_PROXY`), F4 (`Secure` cookie when
  !development), F5 (sign-up rate-limit), F7 (`redirect_url`→pathname+search), OE4 (307), OE5 (new
  `@tax-portal/auth/testing` subpath; test-only resets off the barrel), OE8 (dead email default). Also fixed a
  real CI gap: added "Build workspace packages" step to `test-portal`/`test-admin` jobs (was failing to resolve
  workspace pkgs) → **both now PASS**. Commits `c89689d`, `01b4219`. **DISPOSITIONED-with-rationale (intentional
  deferred-Clerk seam, threads resolved by Conductor):** OE1 port width, OE2 `checkSession`/`role-missing` arm,
  OE3 dual HMAC paths. Gate was env-constrained (lint/type-check/build/auth+admin+portal unit tests only; CI is
  the accepted gate per user 2026-06-16). **All 4 CI checks green** (run 27614184609).
- **Conductor Merge/Finalize DONE (2026-06-16):** 3 dispositioned threads resolved → conversation-resolution
  gate cleared (0 unresolved; `CLEAN`/`MERGEABLE`). PR #38 title/body finalized to slice level (was the premature
  TASK-004-002 title) via REST (`gh pr edit` aborts on projects-classic deprecation). **PR #38 SQUASH-MERGED to
  `main` @ `0444551`** (`gh pr merge --squash --delete-branch`; no `--admin`/protection toggle — MERGE-POLICY
  Lane B; auto-merge cond. (d) Smoke = user-accepted CI substitution). Remote branch deleted; local branch
  pruned; new docs-lane branch `chore/epic-004-close` for the close-out.
- **IO Close-finalize DONE (2026-06-16):** **gate 8 post-merge CI PASS** — `main` @ `0444551`: `CI` ✅ +
  `Code Quality: Push on main` ✅. Gate 9 N/A (`Brief-deploys: no`). Final 9-gate scorecard recorded; slice swept
  from `## Awaiting PR merge` to `PROGRESS-ARCHIVE.md`; live PROGRESS.md `## Current initiative` = EPIC-004
  delivered + next-ready EPIC-002/003.
- **Conductor Validate (write-back) DONE (2026-06-16):** Planning agent flipped the 11 in-scope EPIC-004 AC
  `planned`→`verified` in COVERAGE (verified 13→24); rolled EPIC-004 `planned`→`delivered` in ROADMAP;
  EPIC-002/EPIC-003 deps satisfied (unblocked); 4 deferred 2FA AC unchanged. Evidence basis [A] = CI.
- **Remaining:** docs-lane PR (`chore/epic-004-close`: STATE/COVERAGE/ROADMAP/EPIC-004/PROGRESS write-backs +
  `docs/demos/EPIC-004/` gallery + `docs/demos/README.md`) on green required CI → Report.
- **RESIDUAL user env items still pending** (both `.env*` permission-walled): merge `env.local.tmp` DB URLs into
  `.env.local` (then DELETE `env.local.tmp` — untracked, has dev passwords); add `.env.example`
  `RATE_LIMIT_MAX_ATTEMPTS=10` + `RATE_LIMIT_WINDOW_MS=60000`. Infra follow-up filed: clean-volume DB bootstrap +
  Prisma P3019.
- **⏸ PAUSED (2026-06-16, user) — resume at Conductor Fix.** [SUPERSEDED — Fix done; see entries above.] On resume,
  run `/pr-fix 38` with this guidance:
  - **FIX now (contained, sensible, no real-Clerk needed):** F1/F6 fail-closed guards (throw on mock|unset
    `AUTH_PROVIDER` when `NODE_ENV=production`; require `MOCK_SESSION_SECRET` in prod; drop the compose
    `:-dev-only-…` default → make it required); C-middleware-throw (wrap `getIdentity()` in try/catch →
    fail-closed in `require-role.ts`); C-admin-page (re-check `role==='ACCOUNTANT'` in `apps/admin/src/app/
    page.tsx`, not just `!identity`); F2 (narrow `/api/*` exemption to `=== '/api/mock-session'` gated on mock);
    F3 (gate the leftmost-XFF rate-limit key behind a `TRUST_PROXY` config / trusted-position resolve); F4
    (set `Secure` on the session cookie when `NODE_ENV!=='development'`, incl. `buildMockSessionSetCookieHeader`);
    cheap minors OE4 (statusCode → 307), OE5 (drop test-only resets from the barrel), OE8 (drop dead email
    default), F5 (rate-limit sign-up), F7 (note/strip `redirect_url`).
  - **DISPOSITION-with-rationale (do NOT rip out — intentional deferred-Clerk seam per the brief):** OE1 port
    width, OE2 `checkSession`/`SessionValidity`, OE3 dual sync/async crypto — these support the deferred real-
    Clerk/2FA-enablement slice; reply on-thread that they're the documented seam, leave or resolve per fixer
    judgment.
  - **GATE is ENV-CONSTRAINED:** run **lint + type-check + build + `pnpm --filter @tax-portal/auth test` +
    `--filter admin test` + `--filter portal test` (non-DB)** only. **Do NOT** run `docker compose` /
    `pnpm db:migrate` / the db-integration (`*.rls.test.ts`, `session-context.propagation.test.ts`) / e2e
    suites — the local DB is half-bootstrapped + P3019-blocked (user accepted **CI as the gate**). Push and
    drive the **required** CI checks (`lint-and-typecheck` + `security-scan`) green; resolve addressed threads.
  - **After Fix green:** Conductor **Merge/Finalize** (resolve panel threads → `gh pr merge 38 --squash
    --delete-branch` on green required CI, **no `--admin`/protection toggle**; auto-merge cond. (d) Smoke =
    user-accepted CI substitution) → re-invoke IO **Close-finalize** (gate 8 post-merge CI; gate 9 N/A) →
    Conductor **Validate** (`/planning validate EPIC-004 with CI evidence <merge run/SHA>` → flip 11 COVERAGE
    rows verified + roll EPIC-004 delivered; mark the 4 deferred 2FA AC) → **docs-lane PR** for
    `docs/demos/EPIC-004/` + README → **Report**.
- **Local env state for resume:** Node 20.20.2 installed (project `.nvmrc`); docker stack may be up; `tax_portal`
  DB + `taxportal_admin` login manually bootstrapped but **schema NOT migrated** (P3019). `env.local.tmp` at
  repo root (untracked — has dev DB passwords; **do not commit**; user merges into `.env.local`). Pending USER
  items (both `.env*` permission-walled): merge `env.local.tmp` DB URLs into `.env.local`; add `.env.example`
  `RATE_LIMIT_MAX_ATTEMPTS=10` + `RATE_LIMIT_WINDOW_MS=60000`.
- **Base branch:** main
- **Feature branch:** `brief-004-auth-two-role-model` (engine-created; Plan recorded, Docker pre-flight passed)
- **PR:** _(none — engine blocked before Dispatch)_
- **Status:** Compose DONE (BRIEF-004 written). Implement entered: IO ran Plan (Ingest + Clarify + Design +
  coherence check + full task decomposition) and **halted at the Clerk test-mode environment hard-gate** before
  Dispatch. The slice's `e2e: required` AC (accountant 2FA, sign-in, invitation account-creation, cross-app
  redirect matrix) need **real Clerk test-mode users**; the brief directs treating missing Clerk creds like the
  Docker pre-flight gate (surface + stop, never stub the auth provider). Provisioning a Clerk app + test-mode
  keys is cost-bearing / external-SaaS / authorship-retained — an Autonomy-Ceiling user decision, not a
  Conductor workaround.
- **Resume:** user provisions ONE Clerk **test-mode** application and confirms: (1)
  `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` + `CLERK_SECRET_KEY` (shared by both apps) in `.env.local` **and** repo
  Actions secrets (CI e2e); (2) dev allowed-origins for `http://localhost:3000` + `http://localhost:3001`; (3)
  MFA mandatory on ACCOUNTANT / optional on CLIENT, self-registration disabled, backend-API invitation enabled;
  (4) session max-lifetime + idle timeout pinned to Clerk's documented defaults (AC-AUTH-009-01; values recorded
  in the runbook); (5) test-mode users provisionable with `publicMetadata.role` pre-set for Playwright fixtures.
  Then re-invoke `/orchestrate 004` → resumes at **Implement/Dispatch** (TASK-004-001 = `apps/admin` scaffold,
  the dependency-free root of the task graph).
- **Relayed by the engine (non-blocking):** (i) `/compact` was requested at Plan start — relay to the user;
  Plan did not block on it. (ii) Brief says "Next.js 14" but `apps/portal` is on **Next 15.5.19** — the admin
  scaffold mirrors the real Next-15 scaffold, not the stale label.
- **Compose inputs already gathered (this run):** 15 AC resolve verbatim to the 6 REQ-AUTH sources; epic has
  gherkin scenarios for all 15; methodology = gherkin + e2e-required (BOTH apps) + tier-3/unit; extra gates =
  cross-app redirect e2e (ADR-010), sign-in rate-limiting (ADR-022), auth-event audit (ADR-019), container
  smoke. **UI-demo applicable** → brief `demo:` block: apps [portal, admin], personas [jane-accountant,
  tom-prospective-client], flows [flow-first-sign-in, flow-role-redirect].
- **Compose must carry these (from prior runs + the epic):** (a) `apps/admin` (Tax Portal) does **not** exist
  yet — scaffolding it (mirror of `apps/portal`: Next.js + Playwright + Vitest + e2e) is in scope; (b) Clerk is
  an **external SaaS** (no local container) — the build needs Clerk **test-mode** keys/config for the 2FA +
  sign-in e2e (potential inner stop if unavailable, like the Docker/GHAS gates); (c) AC-AUTH-006
  (invitation-only) needs an accountant-issued **Clerk invitation** to exist — the *accept→invite action* is
  EPIC-003 (out of scope), so the slice simulates the invitation via Clerk's invitation mechanism / a fixture
  and verifies an account can be created from it and NOT via self-service; (d) **pin a concrete max session
  lifetime + idle timeout** for AC-AUTH-009-01 (do NOT inherit the Clerk SDK default) and confirm **global
  sign-out across both apps** (security-lens carry-forward); (e) add the `packages/db` `client.ts` `$extends`
  SESSION_CONTEXT **regression test** — EPIC-004 is the first request-scoped-auth slice (deferred from EPIC-001).
- **Out of scope:** REQ-AUTH-002/003/007/008 (deferred — need engagements/client data); the invite *issuance*
  action (EPIC-003).

## Phase log

### Select — 2026-06-15
**Start:** Pin `/orchestrate 004`.
**Actions:** Read ROADMAP + EPIC-004 + COVERAGE. EPIC-004 = Phase-1 auth/two-role spine, `status: planned`,
`depends_on: []`, 15 AC placed (all `planned`). Enables EPIC-002/003.
**End:** Candidate = EPIC-004 → Gate.

### Gate — 2026-06-15
**Start:** Apply the 7-criterion readiness predicate read-only.
**Actions:**
- (1) `planned` ✓ · (2) `open_questions: []` ✓ · (3) no `depends_on` ✓.
- (4) COVERAGE has 15 EPIC-004 rows, all `planned` ✓ · (5) all 15 AC resolve verbatim to
  REQ-AUTH-001/004/005/006/009/010 ✓.
- (6) engine idle — `## Awaiting PR merge` empty, bugs dispositioned, Docker pre-flight passed ✓.
- (7) tree clean on `main`; no epic-004/auth/brief-004 branch ✓.
**End:** GO on all 7 → Compose.

### Compose — 2026-06-15
**Start:** Map GO EPIC-004 → a build brief honoring the engine's contract.
**Actions:**
- Read EPIC-004 + the 6 REQ-AUTH sources (verbatim AC text) + ADR-001/ADR-010 (concrete redirect matrix,
  one-Clerk-app topology, session continuity) + build-brief template + BRIEF-001 exemplar + DEMO-POLICY.
- Wrote `.implementation/briefs/BRIEF-004-auth-two-role-model.md`: 15 AC (verbatim) + 15 gherkin scenarios;
  methodology gherkin/e2e-required (both apps); extra_gates = cross-app redirect e2e (ADR-010), sign-in
  rate-limit (ADR-022), auth-event audit (ADR-019), SESSION_CONTEXT regression (ADR-003), container smoke.
- Carried the 5 compose obligations: (a) scaffold `apps/admin`; (b) Clerk external SaaS test-mode keys —
  hard env gate if absent; (c) simulate accountant-issued invitation (issuance = EPIC-003, out of scope);
  (d) pin explicit Clerk session lifetime/idle timeout (no silent SDK default) + global sign-out; (e)
  `packages/db` SESSION_CONTEXT regression test (first request-scoped-auth slice).
- demo block: applicable yes · apps [portal, admin] · personas [jane-accountant, tom-prospective-client] ·
  flows [flow-first-sign-in, flow-role-redirect].
**End:** BRIEF-004 written with every required field from real epic/source content → Implement.

### Implement — 2026-06-15
**Start:** Invoke the engine (`/io .implementation/briefs/BRIEF-004-auth-two-role-model.md`); drive to the
completion signal (slice in `## Awaiting PR merge` with a PR URL).
**Actions:**
- Spawned the IO. Slice-start gate clear (engine idle, `## Awaiting PR merge` empty). Docker pre-flight passed.
- IO ran **Plan**: Ingested BRIEF-004 + cited REQ-AUTH/ADR refs; Clarified the 15 AC + gherkin methodology;
  created feature branch `brief-004-auth-two-role-model`; Designed the slice (incl. a `packages/auth`
  `requireRole()` placement DECISION); ran the design-coherence check; decomposed into tasks
  (root = TASK-004-001 `apps/admin` scaffold). All recorded in `.implementation/tasks/PROGRESS.md`.
- IO **halted before Dispatch at the Clerk test-mode hard environment gate** — the brief's `e2e: required` AC
  need real Clerk test-mode users; absence is treated like the Docker pre-flight gate (surface + stop). The IO
  composed **no** `## Next Dispatch` (correctly), returning a Plan-phase blocker.
**End:** **STOP — deferred to the engine's inner stop** (Clerk env hard-gate). No PR opened. Conductor records,
reports, and halts at Implement per ENGINE.md § Defer-to-inner-stops / PHASES.md Stop/defer matrix. Resume path
in `## Current run`. → Report (STOP).

## Outcome

### History
- **EPIC-001:** **DELIVERED** ✅ (PR #35 → `f7f6c9d`; 13/13 AC verified). Plus post-delivery records PR #36
  (`8ef3622`) and the per-epic UI-demo feature PR #37 (`b0b4b11`). Full lifecycle ledger archived in
  `.implementation/tasks/RETRO-001.md` + git history.
- **EPIC-004:** **DELIVERED** ✅ (PR #38 squash → `main` @ `0444551`, 2026-06-16; 11/15 in-scope AC verified, 4
  2FA AC deferred by design). Shipped with the auth provider **mocked** (user-approved brief deviation); real
  Clerk + 2FA are a future Phase-1 "2FA enablement" slice. 3-lens panel request-changes fully dispositioned
  (genuine findings fixed; deferred-Clerk-seam over-eng dispositioned-with-rationale). Verification basis = CI
  (user-accepted substitution for env-blocked container smoke). Ledger: `RETRO-004.md` / `HANDOFF-004.md` +
  `PROGRESS-ARCHIVE.md` Close-finalize entry. Unblocked next: EPIC-002, EPIC-003.

### EPIC-004 — first run (superseded)
**stopped-at-Implement** (2026-06-15) — deferred to the engine's **Clerk test-mode hard environment gate**; the
IO completed Plan and halted before Dispatch (e2e-required AC needed real Clerk test-mode creds). **Superseded
2026-06-15** by the user's "mock the auth provider + defer 2FA" direction → re-scoped to 11 AC, re-composed
BRIEF-004, and driven to delivery (see History entry above). Retained for run-history continuity.
