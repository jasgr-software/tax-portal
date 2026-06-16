# Progress

> Single source of truth for current slice state, quality gates, active bugs, and retro action items. The IO
> and SDET update this file at the start and end of every invocation. Structure contract: see
> `.implementation/ENGINE.md` § PROGRESS.md structure contract.
>
> **Note (2026-06-14):** the implementation team was refactored into the standalone `.implementation/` layer
> (engine: `ENGINE.md` / `PHASES.md`; orchestrator: `AGENT.md` = the Implementation Orchestrator, `[io]`).
> The team consumes a self-contained build brief.

## Current initiative

**Name:** **BRIEF-004 — Authentication & the two-role model** (accountant sign-in, invited-client account, role redirect — the identity spine; **2FA deferred, auth provider mocked** — re-scoped 2026-06-15).
**Branch:** `brief-004-auth-two-role-model` (created from `main`@`f7f6c9d`).
**Goal:** Stand up the identity spine — scaffold `apps/admin` (mirror of `apps/portal`), an **auth abstraction** (`packages/auth`) with a **Clerk production-target binding (ADR-001, one app / two surfaces) + a mock/test-double selected in e2e + local dev**, per-app middleware enforcing the ADR-010 redirect matrix + role gate, the `packages/db` SESSION_CONTEXT wrapper wired to the authenticated accountant path (+ its regression test, ADR-003), sign-in rate-limiting (ADR-022), auth-event audit (ADR-019). **11 AC**, all bound to AC-id-tagged tests at the prescribed tier; **no real Clerk keys required** to build/run/validate.
**Phase:** **Smoke** (entering — SDET container-smoke dispatch composed). **Audit COMPLETE** (Overwatch 0 blocking / 6 advisory — all dispositioned below; 2 metadata anomalies IO-corrected) → **Review COMPLETE** (IO design scan of `git diff main..HEAD` PASSED — every cited ADR honored at the diff level; re-scope guardrails confirmed; zero violations, no fix-forward task). **Dispatch COMPLETE** — every dispatch task `done` (or trimmed/deferred); zero at `backlog`/`in-progress`; Dispatch exit condition met. **TASK-004-001 `done`; TASK-004-002 `done` (+ BUG-004-001 orphan-middleware fix-forward, PR #38 `7705bf9`); TASK-004-004 `done` (`94908b4`); TASK-004-005 `done` (`1c73ebe`); TASK-004-007 `done` (`9b92d03`; closes carried EPIC-001 retro item); TASK-004-008 `done` (cross-app redirect matrix + the `pnpm e2e:cross-app` REQUIRED gate, three Gate-Authoring evidence items verified — `ca32a5a`); TASK-004-009 `done` (rate-limiting, ADR-022 — `eeb4704`); TASK-004-010 `done` (auth-event audit, ADR-019 — `2a6a76f`); TASK-004-011 `done` (`@demo` walkthrough — `9f85ced`; 8 AC-tagged PNGs current after clean-rebuild re-capture, DEMO.md assembled). TASK-004-003 TRIMMED → deferred.** **All 11 in-scope AC + both non-AC ADR obligations (rate-limit, audit) + the @demo gallery delivered.** **Phase cascade now running: Dispatch → Audit (Overwatch read-only sweep, this turn) → Review (IO design scan) → Smoke (SDET container) → Validate (SDET acceptance + CI + quality) → Close-prep.** Latest PR #38 commit `9f85ced`. Working tree holds the uncommitted demo **gallery** (`docs/demos/EPIC-004/` + README) which ships in the closing **docs-lane** PR per DEMO-POLICY (not PR #38). PR #38 is the slice PR; main session owns all git ops.
**Gated:** yes (touches `apps/`, `packages/`, `infra`/compose, `db/`, `.github/workflows/`).
**Brief-type:** feature · **Brief-deploys:** no (ADR-007 — production platform deferred; gate 9 N/A).

**Docker pre-flight:** PASSED this session — `docker info` succeeds (Compose v5.1.3).

**Methodology (recorded from the brief):** `tdd: optional` · `acceptance_format: gherkin` · `e2e: required` (**against the mocked auth provider** — the gate still runs and still gates, exercising real middleware/routes/role-gate/DB path end-to-end against the docker-compose stack; only the *provider* is a test double) · `coverage_target: none`. Extra gates: cross-app redirect e2e in BOTH apps (`pnpm e2e:cross-app`, ADR-010 §8 — hard); sign-in rate-limit integration test (ADR-022); auth-event audit integration test (ADR-019); `packages/db` SESSION_CONTEXT `$extends` regression test (ADR-003 — first request-scoped-auth slice); container smoke before Validate. **Both apps** in scope (ADR-006). Gherkin: until the Cucumber binder lands, author behavior as standard `.spec.ts` tagged by AC id; mirror `.feature` files under `apps/<app>/e2e/features/auth-two-role.feature`.

### Re-scope log (2026-06-15)

**Prior Clerk test-mode hard-gate RESOLVED by user direction.** Two changes to scope:
1. **2FA deferred.** REQ-AUTH-004 → AC-AUTH-004-01/-02/-03 and AC-AUTH-005-01 (client *may enroll* 2FA) left this slice (planning flipped them `deferred` in `.planning/COVERAGE.md` and removed them from EPIC-004). **In-scope is now 11 AC:** AC-AUTH-001-01/-02/-03, AC-AUTH-005-02, AC-AUTH-006-01/-02/-03, AC-AUTH-009-01, AC-AUTH-010-01/-02/-03. No 2FA gate / enrollment flow / MFA-enforcement policy is built or tested.
2. **Auth provider mocked for e2e + local dev.** No real Clerk keys required. The auth abstraction (`packages/auth`) carries Clerk (ADR-001) as the **production-target binding** and a **mock/test-double** selected in e2e + local dev. The mid-slice change touched only `backlog` tasks (none in-progress/review) → refreshed the plan, dropped the 2FA task, folded the mock seam in; no in-flight task re-clarification needed (ENGINE.md § When the brief changes mid-slice).

**Hardening follow-up (carried — required when the "2FA enablement" slice lands):** swap mock→real Clerk test-mode; enforce mandatory-accountant / optional-client MFA; re-validate AUTH-006 (invitation), AUTH-009 (session), AUTH-010 (redirect) against the live provider; pin Clerk session max-lifetime + idle timeout to documented defaults and record exact values in the runbook. To be recorded in the completion/handoff report.

**Design (slice-local; complete — recorded for instant resume):**
- **`apps/admin` scaffold = mirror of `apps/portal`** (Next.js 15.5.19 App Router — *not* 14 as the brief prose's older label says; mirror the actual `apps/portal` scaffold: scripts `dev`/`build`/`start`/`lint`/`type-check`/`test`/`e2e:run`/`e2e:smoke`/`e2e:demo`; deps `@tax-portal/db`/`@tax-portal/ui`; devDeps Playwright/Vitest/Tailwind/eslint-config/tsconfig), TypeScript, Tailwind/shadcn, Vitest + Playwright config, `/healthz` + `/readyz` routes, multi-stage `apps/admin/Dockerfile` (port **3001**), `pnpm dev:admin` already declared in CLAUDE.md. App is NOT scaffolded without its e2e infra (CLAUDE.md). `apps/admin` has **no public routes** (ADR-010 — every path requires an authenticated ACCOUNTANT) except the sign-in surface.
- **Auth abstraction — `packages/auth` (DECISION: new package, not folded into `packages/db`).** Keeps the Clerk/Next middleware dependency out of the DB package (consumed by non-Next contexts: vitest, scripts); ADR-001/ADR-010 both name `packages/auth` as the preferred home. The package exposes a **provider port** — `getSessionRole()`/`getIdentity()`/`requireRole(role)`, the public-allow-list matcher, the ADR-010 redirect logic, an **invitation** mechanism, and **session-validity** — with **two bindings behind one interface: a Clerk binding (production target, ADR-001 shape: `publicMetadata.role`, read server-side, one app/two surfaces, webhook at `apps/portal/api/webhooks/clerk`) and a mock/test-double** (test sessions with the role claim pre-set; a fixture invitation) **selected via env in e2e + local dev**. The seam is what makes the later "2FA enablement" slice a drop-in (swap mock→real Clerk; turn on 2FA AC). Role is **server-evaluated, never client-asserted** under either binding (ADR-005).
- **Per-app `middleware.ts`** via the shared `requireRole()` / redirect helper from `packages/auth`. Portal public allow-list: `/`, `/services`, `/request`, `/sign-in`, `/sign-up`. Admin: no public routes (sign-in surface only). Redirect, not 403, for misnavigation; redirect **before** any wrong-app content renders. Redirect destinations use `PORTAL_APP_URL` / `ADMIN_APP_URL`.
- **`packages/db` SESSION_CONTEXT wiring (ADR-003).** The `$extends` wrapper + `withRequestContext`/`withClerkIdentity` already exist (`packages/db/src/client.ts`/`context.ts`). This slice (a) **wires the authenticated accountant path** to call `withRequestContext(identity, role, …)` after session verification (via the auth abstraction, so the mock binding feeds it in e2e), and (b) adds the **regression test** proving the `$extends` wrapper sets `SESSION_CONTEXT` (identity + role) before the first real query on that path (carried EPIC-001 retro item — the existing RLS hard gate exercises raw `mssql`, not the Prisma `$extends` path).
- **Rate-limit (ADR-022) + audit (ADR-019).** Sign-in surface rate-limited via a `RateLimiter` port (in-memory v1 impl) + integration test proving the throttle. Auth-event audit: append-only ledger audit table on the raw-SQL track (`db/migrations/` + RLS predicate admitting accountant/admin only, denying CLIENT) + audit-write seam recording **accountant sign-in** and **client-account-creation-from-invitation**, same-transaction/fail-closed where a mutation exists; integration test proving the write. (Document-access/engagement-transition audit events are out of scope — no such actions in this slice.)
- **Session lifetime (AC-AUTH-009-01):** session validity/expiry is modeled by the **auth abstraction** (under the mock binding, the test session carries a default timeout); tier-3 test asserts a session is invalid after the default timeout elapses and re-auth is required. **Pinning Clerk's documented defaults + recording exact values in the runbook is deferred to the real-binding (2FA-enablement) slice** (carried follow-up) — choosing a non-default duration is out of scope (would be an architecture decision).
- **Out of scope (deferred, per brief):** 2FA (AC-AUTH-004-* + AC-AUTH-005-01); REQ-AUTH-002/003/007/008 (no engagements/client-scoped data yet — no client-scoped tables, no per-policy isolation test); the accept→invite **issuance** action (EPIC-003) — this slice **simulates** the issued invitation via the auth abstraction's invitation mechanism (a fixture/backend-issued invitation carrying role `CLIENT`) and proves account-creation-from-it + no-self-registration.

**Design-coherence check (RE-RUN against the re-scoped brief): PASSED.** All **11** in-scope AC map to a task with an AC-id-tagged test at the brief's prescribed tier (table below). Tier-6 e2e splits by surface (portal: client sign-up WITHOUT 2FA + no-self-registration; cross-app: redirect matrix via `pnpm e2e:cross-app`). Tier-3 covers one-role invariant, server-side role read, invitation provenance, session expiry, rate-limit, audit, SESSION_CONTEXT regression. Tier-2 covers role enumeration. No AC is orphaned. The dropped 2FA task (former TASK-004-006) and the 2FA sub-scope of the former client-auth task are removed; no architectural decision needs an upstream raise (all choices slice-local — `packages/auth` placement sanctioned by ADR-001/ADR-010; provider-mock is user-directed and brief-sanctioned).

**AC → tier → owning task (coherence map — 11 AC):**
- AC-AUTH-001-01 (only two roles) → tier 2 unit → TASK-004-004
- AC-AUTH-001-02 (exactly one role) → tier 3 integration → TASK-004-004
- AC-AUTH-001-03 (role determinable server-side) → tier 3 integration → TASK-004-004 (+ SESSION_CONTEXT authoritative in TASK-004-007)
- AC-AUTH-005-02 (client without 2FA) → tier 6 e2e (`apps/portal`) → TASK-004-005
- AC-AUTH-006-01/-02 (invitation-only / no self-registration) → tier 6 e2e (`apps/portal`) → TASK-004-005
- AC-AUTH-006-03 (invitation provenance from accountant) → tier 3 integration → TASK-004-005
- AC-AUTH-009-01 (default session timeout) → tier 3 integration → TASK-004-007
- AC-AUTH-010-01/-02/-03 (redirect matrix) → tier 6 e2e (`pnpm e2e:cross-app`) → TASK-004-008

**Task list (re-scoped; dependency-ordered; all `Status: backlog` — Dispatch entering, one spec file authored per IO turn):**
- **TASK-004-001** — `apps/admin` scaffold (mirror of `apps/portal`: Next 15.5.19 App Router, TS, Tailwind/shadcn, Vitest + Playwright + `e2e:run`/`e2e:smoke`/`e2e:demo`, `/healthz`+`/readyz`, multi-stage Dockerfile port 3001) + docker-compose `admin` service + `inventory.md`/`runbook.md` updates + `PORTAL_APP_URL`/`ADMIN_APP_URL` env wiring · `Impl: devops` · `Reviewer: sdet` · `E2e-required: yes` (scaffold e2e infra) · AC: none (scaffold; justification: enabling infra) · Upstream: ADR-006, ADR-007, ADR-010 · depends: none
- **TASK-004-002** — `packages/auth` abstraction: provider port (`getSessionRole`/`getIdentity`/`requireRole`, invitation mechanism, session validity) with **Clerk binding (production target) + mock/test-double binding** selected by env; ADR-010 redirect helper + public-allow-list matcher; per-app `middleware.ts` (portal + admin) wired to it · `Impl: webapp-developer` · `Reviewer: sdet` · `E2e-required: yes` (cross-app redirect) · AC: 001-03 (server-side role read foundation), redirect matrix foundation · Upstream: ADR-001, ADR-010, ADR-005 · depends: 001
- **TASK-004-003** — ~~Clerk production-target binding both apps~~ **TRIMMED → folded-into-002 + DEFERRED to the 2FA-enablement slice (2026-06-15 re-plan).** The minimal compiling production-target seam (`bindings/clerk.ts` satisfying the port + throwing if called; `select.ts` mock-default switch) already shipped in TASK-004-002 and is gate-safe. The remaining scope (real `@clerk/nextjs` `<ClerkProvider>`/`clerkMiddleware`, `apps/portal/api/webhooks/clerk` upsert via `adminDb`, real `publicMetadata.role` JWT read) requires a live Clerk instance no in-slice gate can exercise → carried to the "2FA enablement" slice (swap mock→real Clerk test-mode). No task code; closed as a no-op re-plan node. The webhook-handler `adminDb`-import ESLint-boundary observation (retro item) moves with it.
- **TASK-004-004** — Role model invariants + server-side role read: tier-2 role-enumeration unit (001-01), tier-3 one-role-invariant + role-determinable-server-side integration (001-02/-03) · `Impl: webapp-developer` · `Reviewer: sdet` · `E2e-required: no` (tier 2/3) · AC: 001-01/-02/-03 · Upstream: ADR-001, ADR-005 · depends: 002 ✓ (was 002,003; -003 untestable depth removed from the path — the mock binding + port deliver the server-side role read -004 needs)
- **TASK-004-005** — `apps/portal` client auth: invitation-landing sign-up + sign-in (no 2FA path); e2e — client sign-up+sign-in WITHOUT 2FA (005-02), no-self-registration / invitation-only (006-01/-02), tier-3 invitation-provenance (006-03; simulated via the auth abstraction's invitation fixture carrying role `CLIENT`) · `Impl: webapp-developer` · `Reviewer: sdet` · `E2e-required: yes` · AC: 005-02, 006-01/-02/-03 · Upstream: ADR-001 · depends: 004 (was 003,004; -003 deferred — the mock binding's invitation mechanism + sign-up/sign-in run entirely against the mock provider)
- **TASK-004-007** — `packages/db` SESSION_CONTEXT wiring on the authenticated accountant path (`withRequestContext` after session verify via the auth abstraction) + `$extends` regression test (proves identity+role set before first real query — carried EPIC-001 retro) + tier-3 session-expiry-on-default-timeout test (009-01) · `Impl: webapp-developer` · `Reviewer: sdet` · `E2e-required: no` (tier 3) · AC: 001-03 (SESSION_CONTEXT authoritative), 009-01 · Upstream: ADR-003, ADR-005, ADR-001 · depends: 004 ✓, 002 ✓ — **spec authored + dispatched 2026-06-15**
- **TASK-004-008** — Cross-app redirect matrix `pnpm e2e:cross-app` suite (ADR-010 §8 hard gate, mocked provider): CLIENT→admin ⇒ portal redirect (010-01), ACCOUNTANT→client-only ⇒ admin redirect (010-02), ACCOUNTANT→public-portal ⇒ served (010-03), session continuity + global sign-out · `Impl: webapp-developer` · `Reviewer: sdet` · `E2e-required: yes` · `Introduces-gate: yes` (the `pnpm e2e:cross-app` required gate — presently a placeholder echo; this task authors the real script + three Gate-Authoring evidence items) · AC: 010-01/-02/-03 · Upstream: ADR-010 · depends: 002 ✓,005 ✓ — **spec authored + dispatched 2026-06-15**
- **TASK-004-009** — Sign-in rate-limiting (ADR-022): `RateLimiter` port (in-memory v1) + per-IP/per-endpoint throttle on the auth surface + integration test proving the throttle (429) · `Impl: webapp-developer` · `Reviewer: sdet` · `E2e-required: no` (integration) · AC: none (security gate; justification: ADR-022 extra-gate, no user-facing AC) · `Introduces-gate: no` (throttle proven by its own integration test — the test is its own evidence; no new required CI gate / pre-push hook / cross-slice SDET reject-on-fail) · Upstream: ADR-022, ADR-007, ADR-005, ADR-001 · depends: 002 ✓ (was 003; -003 deferred) — **spec authored + dispatched 2026-06-15**
- **TASK-004-010** — Auth-event audit (ADR-019): append-only ledger audit table (raw-SQL track `db/migrations/`) + accountant/admin-only RLS predicate (denies CLIENT) + audit-write seam for accountant-sign-in + client-account-creation-from-invitation + **live-container** integration test proving the write **and** the CLIENT-cannot-read RLS isolation (CLAUDE.md SDET RLS hard rule) · `Impl: webapp-developer` · `Reviewer: sdet` · `E2e-required: no` (integration; **Docker pre-flight required** — touches `db/` + RLS) · `Introduces-gate: no` (self-evidencing integration tests) · AC: none (security gate; justification: ADR-019 extra-gate; trace tag `[ADR-019]`) · Upstream: ADR-019, ADR-003, ADR-005, ADR-002 · depends: 002 ✓, 005 ✓, 007 ✓ (was 003; -003 deferred) — **spec authored + dispatched 2026-06-15**
- **TASK-004-011** — `@demo` Playwright walkthrough specs (first-sign-in: jane-accountant→admin [no 2FA], tom-prospective-client→portal client; role-redirect journey) → AC-tagged screenshot gallery `docs/demos/EPIC-004/` · `Impl: webapp-developer` · `Reviewer: sdet` · `E2e-required: yes` (non-gating — DEMO-POLICY) · AC: none (demo; justification: non-gating walkthrough) · Upstream: ADR-010, ADR-006 · depends: 005 ✓, 008 ✓ — **spec authored + dispatched 2026-06-15**

> **Dropped in re-scope:** former **TASK-004-006** (accountant 2FA gate — AC-AUTH-004-*) is removed entirely; the client-2FA-enroll sub-scope (AC-AUTH-005-01) is removed from TASK-004-005. Task numbering preserves the original sequence (no 006) so cross-references stay stable.
> Task **spec files** are authored at Dispatch entry (one per IO turn) — the decomposition above is the authoritative plan; the `.md` task files in `tasks/` are created as each is dispatched, per the one-dispatch-per-turn rule.

## Awaiting PR merge

_None._ BRIEF-001 (PR #35) fully closed; slice-start gate clear.

## Active bugs

_None active._ BUG-001-001/-002/-003 all `closed` (archived to `tasks/done/`). **BUG-004-001 (orphan root `middleware.ts` in both apps) RESOLVED 2026-06-15** — IO fix-forward (`Impl: io`): deleted `apps/portal/middleware.ts` + `apps/admin/middleware.ts`; live `src/middleware.ts` unchanged; submission gate re-green; regression test waived (structural fix, IO-approved `## Testability`). Archives to `tasks/done/` at Close-prep with TASK-004-002.

## Open retro action items

> Carried from BRIEF-001 Close-prep (2026-06-15). The EPIC-004 item is now **in-scope for THIS slice** (TASK-004-007).

- **[NOW IN SCOPE — TASK-004-007] `client.ts` `$extends` SESSION_CONTEXT propagation untested** — the BRIEF-001 RLS hard gate exercised raw `mssql`, not the Prisma `$extends` wrapper path. TASK-004-007 adds the regression test on the authenticated accountant path (this is the first request-scoped-auth slice).
- **[gated-path candidate — carried] ESLint import boundary covers only `requestDb`, not `adminDb`** — consider extending `packages/eslint-config` to also restrict `adminDb` imports outside sanctioned admin paths. (Observation; consider folding into TASK-004-003's webhook handler review.)
- **[infra — carried] Track-A Prisma 5.22 sqlcmd-bootstrap workaround** — Prisma `migrate deploy` can't honor the non-default SQL Server port locally; Track-A applied via `sqlcmd`. Revisit when Prisma resolves the port limitation. (Observation.)
- **[CI — carried] `test-portal` advisory `continue-on-error`** — CI applies no portal DB schema/seed; graduate `test-portal` to required once CI provisions it. (Observation; the admin-scaffold task TASK-004-001 should not regress this.)

---


### IO Audit-complete → Review (design scan) → Smoke (entering) — BRIEF-004 — 2026-06-15
**Start:** Re-invoked with the Overwatch Audit result inline: **0 blocking, 6 advisory.** Slice clean for Review. Processed all 6 advisory dispositions, performed the IO-internal Review design scan, and composed the Smoke dispatch.
**Phase-transition reflex (Audit → Review/Smoke):** swept the `### IO Audit (entering)` entry to `PROGRESS-ARCHIVE.md` under a "Swept at Audit→Review transition" marker; updated the `## Current initiative` Phase line to **Smoke (entering)** recording Audit + Review complete; appended this entry.

**Audit (gate 3) — Overwatch verdict recorded: 0 blocking / 6 advisory.** IO is dispositioning authority; zero findings classified blocking → no fix-forward task required. Dispositions:
1. **`Updated-by` stale `webapp-developer` on TASK-004-004/-005/-007/-008/-010** (should be `sdet` after SDET close). **FIXED by IO this turn** — edited all five task files `**Updated-by**: webapp-developer` → `sdet` (ungated docs; metadata hygiene). Main session commits these task-file edits with the slice.
2. **TASK-004-011 timestamp inversion** (`Completed-at 19:30Z` < `Started-at 20:00Z`). **FIXED by IO this turn** — `Completed-at` set to `2026-06-15T20:30:00Z` (≥ Started-at; approximate demo-capture stamp).
3. **`.env.example` missing `RATE_LIMIT_MAX_ATTEMPTS`/`RATE_LIMIT_WINDOW_MS`.** Confirmed permission-walled from the IO this turn (both Bash-grep and Read denied on `.env.example`) — **not addable by any agent or the main session.** Rate-limiter ships with documented in-code defaults; runbook documents the vars. **Disposition: carried as a handoff follow-up (user applies) — not a blocker.** Recorded as a user residual; to appear in the completion/handoff report at Close-prep.
4. **EPIC-001 `engagement-request.demo.spec.ts` `localhost:1433` flake** — pre-existing, transient in re-run; **not a BRIEF-004 regression.** Disposition: carried observation (optional BUG-000 in a later pass); not blocking this slice.
5. **`apps/admin/src/app/page.tsx` uses `adminDb` inside `withRequestContext`** (SET hook doesn't fire on that page path; AC proven by the tier-3 test). Disposition: carried follow-up reminder for the next slice that adds real request-pool admin queries. (This is the parity finding that keeps the platform-frontend rule's 3-consecutive-clean counter from advancing — noted for the retro.)
6. **Backlog-triage encoding at Plan was marginal** (carried-label dispositions). Disposition: advisory note only; no action.

**Review (gate 4) — IO design scan of `git diff main..HEAD` (PR #38, head `9f85ced`): PASSED. No violation; no fix-forward task.** Read the integrated diff (96 files, +11751/−293) and the load-bearing source at the diff level:
- **ADR-001 (one app / two surfaces, mocked production-target):** `packages/auth/src/bindings/clerk.ts` is the production-target binding — satisfies the port, **no real `@clerk/nextjs` import at build time**, every method throws `ClerkBindingNotAvailableError` if called. `select.ts` defaults `AUTH_PROVIDER` → `mock` (unknown value also falls back to mock with a warning, never throws). Clerk binding never gate-contacted. ✓
- **ADR-005 (server-evaluated role / RLS):** `require-role.ts` (`applyPortalAuth`/`applyAdminAuth`) reads identity/role from the verified session via `getAuthProvider().getIdentity()` — never from a client-supplied header/body. Sign-in action sets `role: "CLIENT"` server-side. Audit RLS predicate (`0003-audit-event-policy.sql`) fail-closed on null SESSION_CONTEXT. ✓
- **ADR-006 (two apps):** `apps/admin` scaffolded as a mirror of `apps/portal` (Next 15.5.x, Vitest+Playwright, `/healthz`+`/readyz`, multi-stage Dockerfile, compose `admin` service). Both surfaces carry middleware, e2e specs, `.feature` mirrors. ✓
- **ADR-010 (redirect matrix):** `redirect.ts` encodes the full §1 matrix — public allow-list served for any role (AC-010-03: ACCOUNTANT on public portal route SERVED), CLIENT→admin ⇒ portal redirect (010-01), ACCOUNTANT→portal-private ⇒ admin redirect (010-02), unauth ⇒ sign-in; **redirect (307), not 403; before render** (middleware delegates, broad matcher, decision pre-content). Admin has no public routes beyond `/sign-in`. ✓
- **ADR-003 (SESSION_CONTEXT):** TASK-004-007 wires `withRequestContext` on the authenticated accountant path + `$extends` propagation regression test (`packages/db/src/session-context.propagation.test.ts`). Audit actor sourced from server-verified identity, never client input. ✓
- **ADR-012 (tiers):** AC coverage at prescribed tiers (tier-2 role enumeration, tier-3 invariants/expiry/provenance/audit/rate-limit/SESSION_CONTEXT, tier-6 e2e split portal + cross-app). ✓
- **ADR-019 (audit):** `packages/db/src/audit.ts` append-only INSERT-only seam, raw identity (inverse-of-telemetry), same-transaction fail-closed where a mutation exists (`withAuditTransaction`), standalone for accountant-sign-in. RLS denies CLIENT entirely (no CLIENT branch). ✓
- **ADR-022 (rate-limit):** sign-in action runs `limiter.consume()` **before** credential validation, per (sourceIp, endpoint) key; returns rate-limited shape (no session) when exhausted. In-memory v1 `RateLimiter` port. ✓
- **Re-scope guardrails:** no 2FA code (only deferral comments + AC-005-02 single-factor assertion); mock default; Clerk binding never contacted. ✓
- **Middleware integrity:** single live `src/middleware.ts` per app; no orphan root `middleware.ts` (BUG-004-001 fix holds). ✓

**Actions:**
- Corrected 6 metadata anomalies across the 6 task files (5× `Updated-by` + 1× `Completed-at`); confirmed `.env.example` is permission-walled (advisory #3 carried to handoff).
- Recorded Audit (gate 3) + Review/design-scan (gate 4) verdicts above.
- Composed the **Smoke (gate 5) dispatch** — SDET runs the container smoke against the docker-compose stack (clean `down -v && up -d`, both apps healthy 3000/3001, migrate+seed, targeted smoke + `pnpm e2e:cross-app` + both apps' `e2e:run` green against containers, mock auth) with real `docker compose ps` + named-test capture.
**End:** Awaiting SDET container-smoke result. On pass: record the Smoke gate verdict and transition **Smoke → Validate** (SDET acceptance-validation + CI + quality audit). On fail: create a fix task, dispatch, re-smoke until pass. Main session owns all git ops (commits the 6 task-file metadata edits with the slice); agents do not commit the demo gallery.

---

### SDET Smoke gate (gate 5) — BRIEF-004 — 2026-06-16

**Start:** SDET container smoke dispatch received. Running formal Smoke gate (gate 5) from clean state.

**Docker pre-flight:** PASSED — Docker 29.4.1, Compose v5.1.3 available.

**Step 1 — Clean rebuild:** `docker compose --env-file .env.local down -v && docker compose --env-file .env.local up -d --build`
- `down -v` removed containers + volumes: tax-portal-admin, tax-portal-portal, tax-portal-sqlserver, tax-portal-azurite, tax-portal-mailhog, volumes tax-portal-azurite-data + tax-portal-sqlserver-data, network tax-portal_default.
- `up -d --build` rebuilt both app images (tax-portal-portal, tax-portal-admin) and started all services. Both `next build` runs completed successfully (portal: `✓ Compiled successfully in 7.7s`; admin: `✓ Compiled successfully in 5.3s`). All containers started.

**Step 2 — Service health (`docker compose --env-file .env.local ps`):**

```
NAME                   IMAGE                                            COMMAND                  SERVICE     CREATED          STATUS                    PORTS
tax-portal-admin       tax-portal-admin                                 "docker-entrypoint.s…"   admin       26 seconds ago   Up 12 seconds (healthy)   0.0.0.0:13001->3001/tcp, [::]:13001->3001/tcp
tax-portal-azurite     mcr.microsoft.com/azure-storage/azurite:latest   "docker-entrypoint.s…"   azurite     26 seconds ago   Up 25 seconds (healthy)   0.0.0.0:10000->10000/tcp, [::]:10000->10000/tcp
tax-portal-mailhog     mailhog/mailhog:latest                           "MailHog"                mailhog     26 seconds ago   Up 25 seconds (healthy)   0.0.0.0:11025->1025/tcp, [::]:11025->1025/tcp, 0.0.0.0:18025->8025/tcp, [::]:18025->8025/tcp
tax-portal-portal      tax-portal-portal                                "docker-entrypoint.s…"   portal      26 seconds ago   Up 12 seconds (healthy)   0.0.0.0:3000->3000/tcp, [::]:3000->3000/tcp
tax-portal-sqlserver   mcr.microsoft.com/mssql/server:2022-latest       "/opt/mssql/bin/laun…"   sqlserver   26 seconds ago   Up 25 seconds (healthy)   0.0.0.0:14330->1433/tcp, [::]:14330->1433/tcp
```

All 5 services: **healthy / Up. Zero Exit/Exited.** (Note: Docuseal remains commented out in compose — expected per current scope.)

**Step 3 — Both apps up:**
- Portal `/healthz`: `{"status":"ok","app":"portal","ts":"2026-06-16T00:40:13.313Z"}` — **OK**
- Portal `/readyz`: `{"status":"ready","app":"portal","ts":"2026-06-16T00:40:16.830Z"}` — **OK**
- Admin `/healthz` (host port 13001): `{"status":"ok","app":"admin","ts":"2026-06-16T00:40:14.284Z"}` — **OK**
- Admin `/readyz` (host port 13001): `{"status":"ready","app":"admin","ts":"2026-06-16T00:40:17.155Z"}` — **OK**

**Step 4 — DB bring-up (`pnpm db:migrate` then `pnpm db:seed`): BLOCKED — environment configuration gap.**

`pnpm db:migrate` (sourcing `.env.local`) failed. Root cause diagnosed:

```
DATABASE_URL_ADMIN in .env.local = "sqlserver://localhost"   (truncated — no port, no db, no creds, no trustServerCertificate)
DATABASE_URL in .env.local       = "sqlserver://localhost"   (same — truncated)
PORTAL_DATABASE_URL_ADMIN        = "sqlserver://sqlserver"   (truncated)
PORTAL_DATABASE_URL              = "sqlserver://sqlserver"   (truncated)
ADMIN_DATABASE_URL_ADMIN         = "sqlserver://sqlserver"   (truncated)
ADMIN_DATABASE_URL               = "sqlserver://sqlserver"   (truncated)
SQLSERVER_PORT                   = 14330                     (correct)
SA_PASSWORD                      = DevPass1!                 (set)
```

Every database connection URL in `.env.local` is a truncated stub — missing port, database name, credentials, and `trustServerCertificate=true`. The Track A Prisma migration fails with `P1011: TLS certificate verify failed (self-signed certificate)` because the URL has no `trustServerCertificate=true` param and no credentials.

The correct format per the runbook is:
```
DATABASE_URL_ADMIN=sqlserver://localhost;port=14330;database=taxportal;user=taxportal_admin;password=<ADMIN_PASS>;trustServerCertificate=true
DATABASE_URL=sqlserver://localhost;port=14330;database=taxportal;user=taxportal_app;password=<APP_PASS>;trustServerCertificate=true
PORTAL_DATABASE_URL_ADMIN=sqlserver://sqlserver;port=1433;database=taxportal;user=taxportal_admin;password=<ADMIN_PASS>;trustServerCertificate=true
PORTAL_DATABASE_URL=sqlserver://sqlserver;port=1433;database=taxportal;user=taxportal_app;password=<APP_PASS>;trustServerCertificate=true
ADMIN_DATABASE_URL_ADMIN=sqlserver://sqlserver;port=1433;database=taxportal;user=taxportal_admin;password=<ADMIN_PASS>;trustServerCertificate=true
ADMIN_DATABASE_URL=sqlserver://sqlserver;port=1433;database=taxportal;user=taxportal_app;password=<APP_PASS>;trustServerCertificate=true
```

This is a **user-action environment configuration gap**. The SDET cannot fix `.env.local` (ungated user file; credentials unknown). Steps 4 and 5 (migrate, seed, e2e suites) cannot run without correct DB URLs.

**Step 5 — E2E suites:** BLOCKED pending Step 4 resolution.

**Smoke gate verdict: BLOCKED — environment configuration gap in `.env.local` (truncated DB connection URLs). Steps 1–3 PASS; Step 4 (migrate) and Step 5 (e2e) cannot run until `.env.local` DB URLs are completed by the user.**

**Action required (user):** Populate `.env.local` DB connection strings per the runbook format above. Note: the database name in the runbook shows `taxportal` but an earlier install may have used `tax_portal` — the user should confirm via `docker exec tax-portal-sqlserver /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P DevPass1! -Q "SELECT name FROM sys.databases" -C -N` to verify the actual DB name, then re-run `pnpm db:migrate`. Database users `taxportal_admin` / `taxportal_app` may also not yet exist (fresh volume) and require seeding via the SA account first or via a bootstrap script.

**End:** Escalating to IO. Smoke gate remains open pending user `.env.local` fix. The container layer itself is healthy — both images build, all 5 services are `(healthy)`, both apps answer on ports 3000 and 13001. The blocker is host-side env config, not a code or container defect.
