# Progress

> Single source of truth for current slice state, quality gates, active bugs, and retro action items. The IO
> and SDET update this file at the start and end of every invocation. Structure contract: see
> `.implementation/ENGINE.md` § PROGRESS.md structure contract.
>
> **Note (2026-06-14):** the implementation team was refactored into the standalone `.implementation/` layer
> (engine: `ENGINE.md` / `PHASES.md`; orchestrator: `AGENT.md` = the Implementation Orchestrator, `[io]`).
> The team consumes a self-contained build brief.

## Current initiative

**BRIEF-003 / EPIC-003 — Accountant request inbox.** Phase: **Plan → Dispatch** (Plan complete; entering
Dispatch). **Branch:** `brief-003-accountant-request-inbox` (from `main` @ `cf94c7e`). **Gated:** yes.
**Brief-type:** feature · **Brief-deploys:** no. **Goal:** close the front-door loop — notify the accountant
of a new engagement request, let her review it, and accept (→ invitation email tied to the request) or decline
(→ reason email + retention). 20 in-scope AC. **Methodology:** gherkin (epic's 20 scenarios) · e2e-required
(`apps/admin`) · tier-3 RLS/decision invariants · container smoke.

**Task list (7, dependency-ordered):**
| Task | Status | Impl | AC | Notes |
| ---- | ------ | ---- | -- | ----- |
| TASK-003-001 schema + RLS (Notification + decision fields + accountant-only notification policy) | done | developer | DOOR-005-03, DOOR-006-04 (DB), DOOR-008-04 (col) | Introduces-gate: yes (notification RLS) — SDET APPROVED 2026-06-17T06:15:00Z |
| TASK-003-002 `packages/email` seam (SMTP/Mailhog) | done | developer | none (infra) | Introduces-gate: advisory; OQ-002 raised — SDET APPROVED 2026-06-17T06:55:00Z |
| TASK-003-003 notification generation (cross-surface portal→admin) | done | developer | DOOR-005-01/-02, MSG-013-01 | touches both surfaces — SDET APPROVED 2026-06-17T06:58:00Z |
| TASK-003-004 request inbox UI (admin) | done | developer | DASH-011-01/-02/-03, DOOR-006-01 | mirror EPIC-002 `services` — SDET APPROVED 2026-06-17T06:50:00Z |
| TASK-003-005 decision actions (accept→invite+email, decline→reason+email) | done | developer | DOOR-006-02/-03/-04/-05, DOOR-007-01/-02/-03/-04, DOOR-008-01/-02/-03/-04 | decide-once + audit + rate-limit — SDET APPROVED 2026-06-17T11:09:00Z |
| TASK-003-006 e2e + gherkin + Mailhog | done | developer | DOOR-005-02, 006-01/-02/-03, 007-01, 008-01/-02/-04, DASH-011-* | E2e-required; Introduces-gate: advisory (email e2e) — SDET APPROVED 2026-06-17T14:05:00Z (BUG-003-001 fix verified: 3× 30/30 zero-flake) |
| TASK-003-007 @demo gallery | backlog | developer | none (non-gating) | docs/demos/EPIC-003/ |

**Plan artifacts:** design-coherence check PASS; OQ-002 (email-transport ADR) **raised-upstream** to
`.architecture/` (non-blocking — proceeding on the proposed `packages/email` seam default); reuse of the
existing `pol_EngagementRequest` read boundary (EPIC-001), the `createInvitation` seam + audit + RateLimiter
(EPIC-004), and the `packages/db` request-pool wrapper + `sec` predicate pattern (EPIC-001/002).

**Phase-1 epic status:** EPIC-001 ✅ · EPIC-004 ✅ · EPIC-002 ✅ — **all delivered**. EPIC-003 is the last
Phase-1 epic, now in build.

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
- **[env — RESOLVED BUG-003-001] `.env.example` RATE_LIMIT vars** (`RATE_LIMIT_MAX_ATTEMPTS=10`, `RATE_LIMIT_WINDOW_MS=60000`)
  — previously permission-walled; **resolved by BUG-003-001 fix**: both vars documented in `.env.example`; docker-compose.yml defaults to 100 for portal + admin (prevents e2e exhaustion without user action).
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

### SDET Re-Review — TASK-003-006 + BUG-003-001 — 2026-06-17
**Start:** Re-review TASK-003-006 and BUG-003-001 after BUG-003-001 fix (Option A + surface reduction). Prior rejection: run 3 of independent 3× e2e flaked on AC-DOOR-007-01 and AC-DOOR-008-02 (rate-limiter exhaustion). Fix: `RATE_LIMIT_MAX_ATTEMPTS=100` added to docker-compose.yml for both portal and admin; reset endpoint deleted; `/api/test/**` whitelist reverted.
**Actions:**
- Docker pre-flight: PASS (docker 29.4.1). Stack confirmed up: admin container (tax-portal-admin, healthy, port 13001), mailhog (healthy, port 18025), portal (healthy, port 3000), sqlserver (unhealthy healthcheck — carry-forward infra item, non-blocking), azurite (healthy).
- Container env verified: `docker exec tax-portal-admin printenv RATE_LIMIT_MAX_ATTEMPTS RATE_LIMIT_WINDOW_MS` → `100` / `60000` (from docker-compose.yml `:-100` default, NOT `.env.local`).
- Surface removal verified: `apps/admin/src/app/api/test/` directory ABSENT. No dangling references to `reset-rate-limiter` or `resetRateLimiter` in non-test, non-dist, non-doc application source.
- `redirect.ts` revert verified: only `/api/mock-session` whitelisted; `/api/test/**` is now auth-gated.
- `docker-compose.yml`: RATE_LIMIT vars on both portal (lines 140-141) and admin (lines 213-214) — confirmed by grep.
- `.env.example`: RATE_LIMIT vars documented with production defaults — confirmed by grep.
- `inventory.md` / `runbook.md`: both updated with RATE_LIMIT env vars and `Last updated: BUG-003-001`.
- `redirect.test.ts` 46/46 pass — 2 new BUG-003-001 tests verified: unauthenticated `/api/test/**` → redirect; ACCOUNTANT → serve.
- `pnpm -r test` → 358/358 (126 auth + 39 email + 50 db + 29 portal + 114 admin).
- SDET independent 3× e2e (`ADMIN_BASE_URL=http://localhost:13001 pnpm --filter admin e2e:run`): Run 1 30/30 (8.0s), Run 2 30/30 (7.8s), Run 3 30/30 (7.9s). Tests 9 (AC-DOOR-007-01) and 11 (AC-DOOR-008-02) PASS all three runs.
- BUG-003-001: `Complexity-actual: 2` valid; pre-implementation breadcrumb present. APPROVED → Status: done.
- TASK-003-006: `Complexity-actual: 5` valid; all Quality Gates ticked. APPROVED → Status: done.
- RETRO-002 RATE_LIMIT carried follow-up: RESOLVED (updated in Open retro action items above).
**End:** BUG-003-001 → done (Completed-at 2026-06-17T14:05:00Z). TASK-003-006 → done (Completed-at 2026-06-17T14:05:00Z). All 6 tasks in BRIEF-003 except TASK-003-007 (@demo) are now done. TASK-003-007 is the sole remaining backlog item.

### SDET Review — TASK-003-006 — 2026-06-17
**Start:** Review TASK-003-006 (e2e + gherkin + Mailhog). Status was `review`. E2e-required: yes. Independent re-run mandated — SDET cannot approve on developer evidence alone.
**Actions:**
- Docker pre-flight: PASS (docker 29.4.1). Built new admin image with Dockerfile changes, started on port 13001 (port 3001 occupied by another project on this host). Stack: sqlserver (unhealthy healthcheck but DB-operational, carry-forward infra item), azurite, mailhog, portal, admin — all services accessible.
- Read ENGINE.md, sdet.md, PROGRESS.md, TASK-003-006, BRIEF-003. All required spec fields present. `Complexity-actual: 5` (valid, in range). `Started-at: 2026-06-17T12:10:56Z` non-sentinel. Pre-implementation breadcrumb present.
- Mandatory rejection checks: all PASS on task spec fields. No tool-hygiene violations in Work Log. Required fields present. Quality Gates checklist: Work Log PASS, Submission gate PASS, Targeted e2e box TICKED but SDET independent re-run found a flake — see below.
- Security analysis — `/api/test/reset-rate-limiter` route + `/api/test/**` redirect whitelist:
  - Route guard: `isMockActive()` checks `AUTH_PROVIDER=mock` and returns 404 if not. This is CONSISTENT with the existing `/api/mock-session` route pattern (same guard). Real production deployment sets `AUTH_PROVIDER=clerk` → both endpoints return 404. The `select.ts` double guard (`ALLOW_MOCK_AUTH=true` is ALSO required for the mock auth provider to instantiate at all). In a real Clerk production deployment, `AUTH_PROVIDER=clerk` means `isMockActive()` returns false → 404. No auth bypass path.
  - Redirect whitelist: `adminRedirectDecision()` in `redirect.ts` — the `/api/test/**` exemption is conditional on `isMockAuth` (computed from `AUTH_PROVIDER`). On production, `AUTH_PROVIDER=clerk`, `isMockAuth=false`, so `/api/test/**` is NOT exempt from auth middleware and flows to the normal unauthenticated redirect path. No auth bypass in prod.
  - MISSING UNIT TEST: `redirect.test.ts` has no test covering `/api/test/**` in `adminRedirectDecision()` — neither the mock-active case (should serve) nor the mock-inactive case (should redirect). This is a coverage gap on a security-relevant path change. The existing test `"redirects /api/some-route to sign-in when unauthenticated"` does NOT cover `/api/test/` specifically and does not test the `isMockAuth=false` branch for the test namespace. This is an observation, not a hard rejection on its own.
- Code review:
  - `revalidatePath` reorder (actions.ts): CORRECT — `revalidatePath` now fires before the rate-limit check, so the UI always reflects the committed decision even when email is rate-limited. Email ordering unchanged (still after transaction commit). This addresses the prior design-scan observation correctly.
  - Dockerfile (admin + portal): `packages/email` copy + build step added. CONSISTENT with `packages/auth` and `packages/db` pattern. Infra-docs: `inventory.md` already documents `EMAIL_PROVIDER`/`SMTP_HOST`/`SMTP_PORT`/`EMAIL_FROM` (added at TASK-003-002). `runbook.md` last-updated header says TASK-003-002. Neither file was updated for this Dockerfile topology change. However, TASK-003-002 added the email seam and inventory/runbook were updated there; this task only adds the package to the build layer in the Dockerfile, not a new service or env var. The existing inventory entry for `packages/email` (added TASK-003-002) covers this change. Acceptable.
  - Feature file: 20 scenarios × 20 ACs — verified against `.planning/EPIC-003` scenarios. Verbatim transcription confirmed (side-by-side check of 14 scenarios). Not re-authored.
  - E2e specs: AC coverage per task `Acceptance criteria` field checked. All 13 new tests trace to their tagged ACs. Security tests 20+21 present.
  - Gate-authoring three-item evidence for advisory email-delivery gate: Item 1 (run/log) — Work Log mentions the runs are in the log itself (acceptable for local advisory gate). Items 2+3 (named code path + counterfactual) — present and specific. Adequate for `Introduces-gate: advisory`.
- **INDEPENDENT E2E RE-RUN:**
  - Run 1: 30/30 PASS (8.5s) — including test 9 (AC-DOOR-006-02/007-01 invitation email in Mailhog) and test 11 (AC-DOOR-006-03/008-01/008-02/008-04 decline email in Mailhog). Mailhog messages confirmed real via internal container curl.
  - Run 2: 30/30 PASS (7.8s) — all email assertions green.
  - Run 3: **28/30 FAIL** — tests 9 (AC-DOOR-007-01 invitation email) and 11 (AC-DOOR-008-02 decline email) both timed out at 15s (`waitForEmail` timeout). Both failures are on the Mailhog email-delivery assertion. Root cause: **rate-limiter exhaustion**. The developer's 3× runs used `RATE_LIMIT_MAX_ATTEMPTS=100` in their `.env.local` (carried-forward item from RETRO-002), which fed into the container env and prevented exhaustion. The freshly rebuilt admin container runs at the default 10 per 60s (not in docker-compose.yml). `resetRateLimiter()` in `test.beforeAll` may not be resetting the correct singleton in the compiled Next.js production build (module isolation risk between the API route chunk and the server action chunk). Run 4 (after explicit pre-run `curl -X POST reset-rate-limiter`): 30/30 PASS — confirming rate-limit reset works when called BEFORE the test run starts, but the in-test `test.beforeAll` reset may fire too late or target a different module instance.
- **VERDICT: REJECTION.** The Targeted e2e Quality Gate "3× sequential zero-flake runs" is NOT met under SDET independent conditions. Run 3 produced 2 failures on AC-DOOR-007-01 and AC-DOOR-008-02 — the two email-delivery ACs this task is specifically designed to prove. These are not environment noise; they are deterministic failures caused by a design gap in the rate-limiter reset mechanism that the developer's env (RATE_LIMIT_MAX_ATTEMPTS=100) masked. Reject and BUG filed.
**End:** TASK-003-006 → **REJECTED**. BUG-003-001 created. Task remains `review`. Developer must fix the e2e rate-limiter reset mechanism (add `RATE_LIMIT_MAX_ATTEMPTS` to docker-compose.yml or fix the `resetRateLimiter` module-isolation issue in prod builds) and re-run 3× zero-flake.

### SDET Review — TASK-003-005 — 2026-06-17
**Start:** Review TASK-003-005 (decision actions — accept→invite+email, decline→reason+email; decide-once, audit, rate-limit). Status was `review`.
**Actions:**
- Read ENGINE.md, sdet.md, PROGRESS.md, task file, BRIEF-003. All required spec fields present; `Introduces-gate: no` correct; `Complexity-actual: 4` valid; `Started-at: 2026-06-17T11:50:05Z` non-sentinel; pre-implementation breadcrumb present.
- Mandatory rejection checks: all PASS. No tool-hygiene violations in Work Log.
- Read all delivered files: `apps/admin/src/app/requests/actions.ts` (decision actions + identity helper), `packages/db/src/repositories/engagement-request.ts` (acceptEngagementRequest/declineEngagementRequest/AlreadyDecidedError), `packages/db/src/audit.ts` (withAuditTransaction/recordAuthEvent), `packages/db/src/index.ts` (exports), `apps/admin/src/app/requests/actions.test.ts` (32 tests), `apps/admin/src/app/requests/_components/DecisionActions.tsx`, `apps/admin/src/app/requests/[id]/page.tsx`, `packages/db/src/engagement-request.decide-boundary.rls.test.ts`.
- **Independently ran**: `pnpm --filter admin test -- src/app/requests/actions.test.ts` → **32/32 PASS**; `pnpm --filter admin test` → **114/114 PASS** (6 files); `pnpm --filter @tax-portal/db test` → **50/50 PASS** (10 files). `pnpm lint` → PASS. `pnpm type-check` → PASS.
- Decide-exactly-once (AC-DOOR-006-05): WHERE status IN ('pending','awaiting_review') + @@ROWCOUNT check; 0 rows → AlreadyDecidedError thrown; action catches and returns `{ success: false, error: 'already_decided' }`. Genuine rejection. DB-layer proven by 3-test tier-3 RLS suite against real SQL Server.
- Only-accountant-decides (AC-DOOR-006-04): dual guard — action layer `getAccountantIdentity()` checks role from verified session; DB-layer BLOCK predicate (TASK-003-001). Role never client-assertable.
- Invitation provenance + tie (AC-DOOR-007-01/-02/-03/-04): `createInvitation(email, 'CLIENT')` with role server-set; ticket persisted via `acceptEngagementRequest(id, ticket, txn)`; email body links to `PORTAL_APP_URL/sign-up?ticket=<encoded>`; no User row created (no user-creation call in acceptRequest).
- Decline (AC-DOOR-008-01/-02/-03/-04): reason validated (empty/whitespace rejected); trimmed before persistence; emailed to prospect contact email; `declineEngagementRequest` called with trimmed reason.
- Audit (ADR-019): `recordAuthEvent` inside `withAuditTransaction` callback (same transaction as status transition). Tests verify audit NOT written on unauthorized and NOT written on AlreadyDecidedError (thrown before recordAuthEvent in transaction callback).
- Rate-limit (ADR-022): per-`clerkUserId` key — design rationale sound for single trusted admin user. Email sent after commit; on rate-limit, partial-success returned with decision committed.
- Transaction discipline: email after `withAuditTransaction` resolves (after commit). `createInvitation` inside transaction — DECISION comment notes real-Clerk consideration.
- Security: no client-assertable role; ticket server-generated; parameterized queries; header-injection guard in email seam (TASK-003-002).
- Observation noted: `revalidatePath` skipped on partial-success paths (rate-limited or email failed) — decision committed but UI not auto-refreshed. Not a correctness defect; UI has manual refresh button. Passed to IO for design scan.
- TASK-003-005 → **APPROVED, Status: done, Completed-at: 2026-06-17T11:09:00Z**.
**End:** TASK-003-005 approved and marked done. Task list: TASK-003-001 through TASK-003-005 all done; TASK-003-006 (e2e+gherkin+Mailhog) and TASK-003-007 (demo) remain. Ready for IO to dispatch TASK-003-006.

### SDET Review — TASK-003-004 — 2026-06-17
**Start:** Review TASK-003-004 (request inbox UI — admin read side). Status was `review`.
**Actions:**
- Read ENGINE.md, sdet.md, PROGRESS.md, task file, BRIEF-003. All required spec fields present; `Introduces-gate: no`; `Complexity-actual: 3` valid; `Started-at: 2026-06-17T11:39:13Z` non-sentinel.
- Mandatory rejection checks: all PASS. Pre-implementation breadcrumb present ("Starting implementation" entry). No tool-hygiene violations. `Complexity-actual: 3` in range.
- Read all delivered files: `requests/page.tsx`, `requests/[id]/page.tsx`, `requests/_components/RequestList.tsx`, `requests/_components/RequestDetail.tsx`, `packages/db/src/repositories/engagement-request.ts` (new functions), `apps/admin/src/app/requests/inbox.test.tsx`.
- Route guard: PASS — both `requests/page.tsx` and `requests/[id]/page.tsx` independently guard on `identity.role !== "ACCOUNTANT"`. ADR-010 satisfied.
- Read path (ADR-003/ADR-005): PASS — `listEngagementRequests` and `getEngagementRequest` use `dbAsClient()` (request pool) inside `withRequestContext`. `adminDb`/`getAdminPool` absent from both read functions (only in `createEngagementRequest`, sanctioned). ADR-003 Amendment 1 honored.
- `notFound()` on null return from `getEngagementRequest` — RLS hide produces 404.
- ADR-006: PASS — no `/requests` directory under `apps/portal/src/app`. Portal's `/request` is the EPIC-001 submit form.
- Security: PASS — no `dangerouslySetInnerHTML`; all PII via JSX auto-escape; identity server-side only.
- `decisionSlot={null}` confirmed — TASK-003-005 scope not pre-built.
- Independently ran: `pnpm --filter admin test -- inbox.test.tsx` → 30/30. `pnpm --filter admin test` → 82/82 (5 files). `pnpm --filter @tax-portal/db test` → 50/50 (10 files). Consistent with Work Log.
- AC coverage: all 4 ACs (DASH-011-01/-02/-03, DOOR-006-01) covered by 30 tagged tests across 4 describe blocks.
- TASK-003-004 → **APPROVED, Status: done, Completed-at: 2026-06-17T06:50:00Z**.
**End:** TASK-003-004 approved and marked done. Task list: TASK-003-001/-002/-003/-004 done; TASK-003-005/-006/-007 backlog. Ready for IO to dispatch TASK-003-005 (decision actions).

### SDET Review — TASK-003-003 — 2026-06-17
**Start:** Review TASK-003-003 (notification generation — portal anonymous-submit path → admin accountant consumption). Status was `review`.
**Actions:**
- Docker pre-flight: PASS (docker 29.4.1).
- Read ENGINE.md, sdet.md, PROGRESS.md, task file, BRIEF-003. All required spec fields present; `Introduces-gate: no` correct; `Complexity-actual: 3` valid.
- Read all delivered files: `packages/db/src/repositories/engagement-request.ts`, `packages/db/src/repositories/notification.ts`, `packages/db/src/index.ts`, `apps/admin/src/app/requests/actions.ts`, `apps/admin/src/app/requests/_components/NotificationsIndicator.tsx`, `apps/portal/src/app/(public)/request/actions.ts`, and all three test files.
- Mandatory rejection checks: all PASS. Pre-implementation breadcrumb present; no tool-hygiene violations; `Complexity-actual: 3` in range; all required fields present.
- Cross-surface validation: portal generation inside atomic mssql Transaction (Request + EngagementRequestService + Notification, one commit). Admin consumption: `adminDb` absent from `apps/admin/.../requests/actions.ts` (grep confirmed); `withRequestContext` + `listNotifications`/`markNotificationRead` use `db` request pool → `sec.pol_Notification` FILTER active. Both surfaces verified.
- Security: dual-layer guard confirmed (identity: `role !== 'ACCOUNTANT' → null → unauthorized`; RLS: `sec.pol_Notification` proven by TASK-003-001). No SQL injection (parameterized queries). No XSS (JSX auto-escape; `engagementRequestId` is server-generated UUID).
- Atomicity probe: Notification INSERT inside `try` before `transaction.commit()`; failure throws → `catch` calls `transaction.rollback()`. Request cannot commit without notification.
- Independently ran all three suites: `pnpm --filter portal test` → 29/29; `pnpm --filter admin test` → 52/52; `pnpm --filter @tax-portal/db test` → 50/50. All green on real containers.
- Lint + type-check: PASS (workspace-wide).
- AC coverage: AC-DOOR-005-01 covered at tier-2 (portal unit, admin unit) and tier-3 (persistence integration); AC-DOOR-005-02 covered at tier-2 and tier-3; AC-MSG-013-01 covered at tier-2 and tier-3.
- TASK-003-003 → **APPROVED, Status: done, Completed-at: 2026-06-17T06:58:00Z**.
**End:** TASK-003-003 approved and marked done. Task list: TASK-003-001/-002/-003 done; TASK-003-004 through 007 backlog. Ready for IO to dispatch next task.

### SDET Review — TASK-003-002 — 2026-06-17
**Start:** Review TASK-003-002 (`packages/email` outbound transactional-email seam). Status was `review`.
**Actions:**
- Docker pre-flight: PASS (docker 29.4.1; Mailhog container `tax-portal-mailhog` up and healthy).
- Read ENGINE.md, PROGRESS.md, task file, BRIEF-003. Confirmed `Introduces-gate: advisory`, `Acceptance criteria: none (infra justification)`, all required spec fields present.
- Read all delivered files: `packages/email/src/{port.ts,select.ts,index.ts,bindings/{smtp,mock,resend}.ts,email.test.ts}`, `packages/email/package.json`, `docker-compose.yml` email vars, `.env.example` email section, `inventory.md`, `runbook.md`.
- Mandatory rejection checks: all PASS (Complexity-actual=3, pre-impl breadcrumb present, no tool-hygiene violations, all required spec fields present).
- Independently ran: `pnpm --filter @tax-portal/email test` → 39/39, 343 ms.
- Mailhog integration: confirmed NOT a vacuous skip — `curl http://localhost:8025/api/v2/messages` returned 3 matching `TASK-003-002-integration-*` subjects from the test runs.
- OE5 barrel compliance: confirmed 4 test-only resets absent from `index.ts`; 6 barrel regression tests verify this.
- Header injection: `stripHeaderInjection()` throws on CRLF; applied to `to`/`subject`/`from` in SMTP + mock; resend stub throws before any header used.
- Introduces-gate advisory: Work Log makes no required-gate claim. Correct.
- `pnpm audit`: 1 moderate (pre-existing PostCSS/next), 0 high/critical. 7 nodemailer CVEs cleared.
- Infra-docs: `inventory.md` EMAIL_PROVIDER/SMTP_HOST/SMTP_PORT/EMAIL_FROM/RESEND_API_KEY documented; `runbook.md` header updated; both `portal` + `admin` compose services wired.
- Lint + type-check: PASS (workspace-wide). Confirmed `packages/email` build (tsc) clean.
- TASK-003-002 → **APPROVED, Status: done, Completed-at: 2026-06-17T06:55:00Z**.
**End:** TASK-003-002 approved and marked done. Task list: TASK-003-001 + TASK-003-002 done; TASK-003-003 through 007 backlog. Ready for IO to dispatch next task.

### SDET Review — TASK-003-001 — 2026-06-17
**Start:** Review TASK-003-001 (schema + RLS + notification policy + tier-3 tests). Status was `review`.
**Actions:**
- Docker pre-flight: PASS (docker 29.4.1, containers up including sqlserver).
- Read ENGINE.md, sdet.md, PROGRESS.md, BRIEF-003, task spec, ADR-005, ADR-003.
- Read all delivered files: 0004-notification-policy.sql, notification.rls.test.ts, engagement-request.decide-boundary.rls.test.ts, repositories/notification.ts, prisma/schema.prisma, migration.sql, packages/db/src/index.ts, packages/db/src/client.ts.
- Mandatory rejection checks: all PASS (Complexity-actual=4, pre-impl breadcrumb present, no tool-hygiene violations, all required spec fields present).
- Independently ran targeted tests: `pnpm --filter @tax-portal/db test -- src/notification.rls.test.ts src/engagement-request.decide-boundary.rls.test.ts` → 2 files / 7 tests / 0 failures.
- Policy `0004-notification-policy.sql` verified to mirror `0001` (ITVF, SCHEMABINDING, GO-batched, FILTER+BLOCK predicates, STATE=ON). Fail-closed on null SESSION_CONTEXT confirmed by test.
- Decide-boundary: CLIENT UPDATE correctly asserts rowsAffected=0 + admin read-back confirms no mutation — correct SQL Server BLOCK silent-suppress behavior, not a false pass.
- ADR-003 Amendment 1: no @read_only in production code or new test files.
- Gate-Authoring three-item evidence: all three items present in Work Log and test file header.
- AC coverage: DOOR-005-03 (4 tests), DOOR-006-04 DB layer (3 tests), DOOR-008-04 schema column (migration + schema).
- Security: no client-assertable role, single sp_set_session_context writer, createNotification parameterized, markNotificationRead via Prisma.
- TASK-003-001 → **APPROVED, Status: done, Completed-at: 2026-06-17T06:15:00Z**.
**End:** TASK-003-001 approved and marked done. Task list: TASK-003-001 done; TASK-003-002 through 007 backlog. Ready for IO to dispatch next task.

### IO Plan — BRIEF-003 / EPIC-003 — 2026-06-17
**Start:** New slice. Conductor handed `.implementation/briefs/BRIEF-003-accountant-request-inbox.md` (20 AC,
gherkin, e2e-required). Slice-start gate clear (`## Awaiting PR merge` empty; no active bugs; retro items all
dispositioned observations). Ran Plan: Ingest → Clarify → Design → Decompose.
**Actions:**
- **Docker pre-flight PASS** — `docker info` → 29.4.1 / linux up.
- **Branch** `brief-003-accountant-request-inbox` created from `main` @ `cf94c7e`.
- **Ingest/Clarify** — 20 AC all testable; resolved verbatim to REQ-DOOR-005/-006/-007/-008 + REQ-DASH-011 +
  REQ-MSG-013 (AC-01). Methodology: gherkin (bind the epic's 20 scenarios) · e2e-required (`apps/admin`) ·
  tier-3 RLS/decision invariants · container smoke.
- **Design** (surveyed live repo): the `engagement_request` accountant-only **read** boundary already exists
  (`db/policies/0001-engagement-request-policy.sql`, EPIC-001) + its UPDATE BLOCK predicates → reuse, don't
  recreate. `createInvitation(email, role)` exists on the `AuthProvider` port (EPIC-004 mock seam). Audit
  (`recordAuthEvent`/`withAuditTransaction`) + `RateLimiter` (EPIC-004) reused. `packages/db` request-pool
  wrapper + `sec` ITVF pattern (EPIC-001/002) reused. **Net-new:** a `Notification` entity + accountant-only
  read policy (mirror `0001`), and the **first email-sending capability** → a provider-abstracted
  `packages/email` seam (SMTP→Mailhog local/e2e; Resend deferred drop-in). **Design-coherence check PASS.**
- **Architecture consult** — no ADR governs email transport; **raised OQ-002 `raised-upstream`** to
  `.architecture/` (non-blocking — proceeding on the proposed `packages/email` default per the brief intent).
- **Decompose** — 7 tasks (001 schema+RLS → 002 email seam → 003 notification gen → 004 inbox UI → 005 decision
  actions → 006 e2e+gherkin+Mailhog → 007 demo). All `Impl: developer`; each carries `**Acceptance criteria:**`,
  `**Upstream refs:**`, `**Introduces-gate:**`. 001 + 006 introduce gates (notification RLS / email e2e).
**End:** Plan exit condition met — branch created, 7 task files at `backlog` with all required fields,
methodology recorded, design-coherence PASS, PROGRESS.md `## Current initiative` populated. → **Dispatch**
(TASK-003-001 first; dependency-free root).
