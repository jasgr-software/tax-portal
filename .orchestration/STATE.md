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

### EPIC-004
**stopped-at-Implement** (2026-06-15) — deferred to the engine's **Clerk test-mode hard environment gate**.
Compose delivered BRIEF-004; the IO completed Plan (branch `brief-004-auth-two-role-model`, full task
decomposition) and halted before Dispatch because the slice's e2e-required AC need real Clerk test-mode
credentials the team cannot self-provision (cost-bearing / external-SaaS / Autonomy-Ceiling). **No PR opened;
epic NOT rolled to delivered.** Resume: provision Clerk test-mode (5-point checklist in `## Current run`), then
re-`/orchestrate 004` → resumes at Implement/Dispatch. This is the expected guardrail behavior, not a failure.
