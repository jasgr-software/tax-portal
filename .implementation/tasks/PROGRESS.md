# Progress

> Single source of truth for current slice state, quality gates, active bugs, and retro action items. The IO
> and SDET update this file at the start and end of every invocation. Structure contract: see
> `.implementation/ENGINE.md` § PROGRESS.md structure contract.
>
> **Note (2026-06-14):** the implementation team was refactored into the standalone `.implementation/` layer
> (engine: `ENGINE.md` / `PHASES.md`; orchestrator: `AGENT.md` = the Implementation Orchestrator, `[io]`).
> The team consumes a self-contained build brief.

## Current initiative

**BRIEF-005 / EPIC-005 — Client onboarding spine + engagement-letter e-sign gate.** Phase: **Dispatch →
TASK-005-001 done (SDET approved 2026-06-18); next: TASK-005-002 (e-sign seam) + TASK-005-003 (engagement creation on accept)**. **Branch:** `brief-005-onboarding-spine-engagement-letter` (created from `main` @ `97330ab`).
**Gated:** yes. **Brief-type:** feature · **Brief-deploys:** no. **Opens Phase 2 (the onboarding gate).**

**Goal:** stand up the onboarding spine + its first hard gate. On request acceptance (EPIC-003), a minimal
**`Engagement`** is created in status `New`, linked 1:1 to the accepted `EngagementRequest` and resolved to the
client `User` (the **first client-owned rows**). The signed-up client opens their engagement in `apps/portal`,
sees a **three-step onboarding sequence** (letter e-sign → questionnaire → document upload) with steps 2+3
**server-side-locked** until the engagement letter is **e-signed** (through a **mock `ESignatureProvider`
seam**, ADR-023/024). On signature the letter is recorded against the engagement + audited and the later steps
unlock. The accountant edits the engagement-letter template (from a system default) in `apps/admin`; her edited
content is what the client signs. **10 in-scope AC.**

**Methodology:** gherkin (bind the epic's 10 scenarios) · **e2e-required** (`apps/portal` + `apps/admin`, +
`e2e:cross-app` for the edit→sign cross-surface path) · tier mapping per ADR-012 (tier-6 e2e / tier-3 service
integration / tier-2/5 unit-component) · **first client-owned-rows ADR-005 client-isolation policy (HARD
tier-3)** · container smoke before Validate.

**Tier map (from brief / epic sign-off contract):**
- **e2e (tier 6):** AC-ONBD-001-01/-03, AC-ONBD-002-03, AC-IDNT-007-03.
- **service integration (tier 3):** AC-ONBD-001-02, AC-ONBD-002-01/-02, AC-ONBD-002-04, + the new
  client-isolation policy test (ADR-005).
- **unit/component (tier 2/5):** AC-IDNT-007-01/-02, AC-ONBD-001-03 (progress rendering).

**Task list (8, dependency-ordered):**
| Task | Status | Impl | AC | Notes |
| ---- | ------ | ---- | -- | ----- |
| TASK-005-001 schema (Engagement + onboarding-state + LetterTemplate) + client-isolation RLS policy + tier-3 isolation tests | done | developer | ONBD-001-02/002-01/002-02/002-04 (DB layer) | **Introduces-gate: yes** (FIRST client-owned-rows `sec.pol_Engagement` — three-item evidence: CLIENT-A≠CLIENT-B, anon=ZERO, ACCOUNTANT=all) — SDET APPROVED 2026-06-18T08:15:00Z |
| TASK-005-002 `packages/esign` provider seam (port + mock binding + fail-closed selector) | backlog | developer | none (infra) | **Introduces-gate: advisory**; ADR-023/024 §1 — default real, `ALLOW_MOCK_ESIGN` non-prod opt-in; mirror auth `select.ts` (inverted default) |
| TASK-005-003 engagement creation on accept (extend EPIC-003 `acceptRequest`) + client-link resolution | backlog | developer | ONBD-001-01 (substrate) | additive to EPIC-003 accept; create Engagement(New) + onboarding-state in the existing audit transaction |
| TASK-005-004 letter-template setting UI + actions (admin) — default present, edit persists | backlog | developer | IDNT-007-01/-02 | `apps/admin`; accountant-principal write via `withRequestContext`; system default seeded |
| TASK-005-005 onboarding read model + server-side step-accessibility gate + sign action (portal) | backlog | developer | ONBD-001-01/-02/-03, ONBD-002-01/-02/-03/-04, IDNT-007-03 | `apps/portal`; client-principal; sign via `ESignatureProvider` port; record evidence + audit; locked step **refused** not hidden |
| TASK-005-006 onboarding sequence UI (portal) — three steps, locked affordances, position/remaining | backlog | developer | ONBD-001-01/-03 | `apps/portal`; renders read model from -005; presents edited template at letter step |
| TASK-005-007 e2e + gherkin binding + cross-app (both surfaces) | backlog | developer | ONBD-001-01/-03, ONBD-002-03, IDNT-007-03 (+ cross-app edit→sign) | **E2e-required; Introduces-gate: advisory** (e-sign mock e2e); bind epic's 10 gherkin scenarios |
| TASK-005-008 @demo gallery (admin edit + portal sign→unlock) | backlog | developer | none (non-gating) | docs/demos/EPIC-005/ |

**Plan artifacts:** design-coherence check **PASS**; full field-level expansion of the brief's `## Data &
Interface Contract` recorded in the Plan session entry below + bound into the task specs. **No new
OPEN-QUESTION raised** — the e-sign seam is fully governed by ADR-023 + ADR-024 (both **Accepted**); the
REQ-AUTH-003 *feature*-AC boundary is already a planning-flagged note in the brief/epic (Phase-3-owned), not an
IO decision. Reuse surveyed in-repo: `packages/db` `withRequestContext` + `$extends` SET hook + `sec`
predicate/FILTER-BLOCK policy pattern (`db/policies/0001`/`0004`); the audit seam
(`recordAuthEvent`/`withAuditTransaction`); the EPIC-003 `acceptRequest` action; `packages/auth` `select.ts`
fail-closed selector (the e-sign selector mirrors it with the **inverted** default — real-first); `packages/email`
seam shape; the portal `getAccountantIdentity()` pattern (new portal `getClientIdentity()` mirror).

**Phase-2 epic status:** EPIC-005 (this slice) opens Phase 2; EPIC-006/007/008 planned, decomposed. Phase 1
(EPIC-001/004/002/003) all delivered.

**Carried infra follow-ups (from prior retros / STATE — may resurface at Smoke, not slice-blocking):**
clean-volume DB bootstrap; the `sqlserver` healthcheck SA-password mismatch; the `sp_set_session_context` CI
grep-guard; comment-only `service.rls.test.ts` `@read_only`/§4 drift (rides the next `packages/db` task — and
TASK-005-001 touches `packages/db`, so it is the natural carrier). These also live in `## Open retro action
items` below.

## Awaiting PR merge

_Empty._ Slice-start gate **clear** for BRIEF-005 (verified at Plan-start 2026-06-18). Prior delivered: PR #42
`ec151cb` (EPIC-003), PR #40 `70ea10e` (EPIC-002), PR #38 `0444551` (EPIC-004), PR #35 `f7f6c9d` (EPIC-001) —
all merged. **Phase 1 (MVP) complete.** BRIEF-005 (Phase-2 onboarding spine) now in build on
`brief-005-onboarding-spine-engagement-letter`.

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

---

### IO Plan — BRIEF-005 / EPIC-005 — 2026-06-18
**Start:** New slice (Phase-2 opener). Conductor handed `.implementation/briefs/BRIEF-005-onboarding-spine-engagement-letter.md` (10 AC, gherkin, e2e-required both surfaces; the FIRST brief carrying a `## Data & Interface Contract`). Slice-start gate clear (`## Awaiting PR merge` empty; no active bugs; retro items all dispositioned observations). Ran Plan: Ingest → Clarify → Design (incl. full field-level contract expansion) → Decompose.
**Phase-transition reflex (slice-start):** swept the BRIEF-003 session entries to `PROGRESS-ARCHIVE.md` under a Plan-start marker; rewrote `## Current initiative` for BRIEF-005 (8 tasks, tier map, reuse survey); refreshed `## Awaiting PR merge`; pruned the resolved RATE_LIMIT/`$extends` retro items; appended this entry.
**Docker pre-flight:** PASS — `docker info` → 29.4.1 up (main session pre-verified; IO re-confirmed).
**Context pre-flight:** `/compact` — the Conductor handed this invocation fresh; the IO requests the user run `/compact` before the first Dispatch turn if context pressure appears.
**Branch:** `brief-005-onboarding-spine-engagement-letter` created from `main` @ `97330ab`.

**Ingest / Clarify — 10 AC all testable, traced to scenarios + tiers:**
- REQ-ONBD-001 (3 ordered steps): AC-ONBD-001-01 (e2e), -02 (tier-3 server-side sequencing), -03 (e2e + tier-2 progress).
- REQ-ONBD-002 (letter hard gate): AC-ONBD-002-01/-02 (tier-3 server-side lock), -03 (e2e sign→unlock), -04 (tier-3 evidence recorded).
- REQ-IDNT-007 (editable default template): AC-IDNT-007-01/-02 (tier-2/5 default present + edit persists), -03 (e2e edited template shown to client).
- Methodology recorded: gherkin (bind epic's 10 scenarios; prose-bind until Cucumber tooling lands, per CLAUDE.md) · e2e-required both surfaces + `e2e:cross-app` for edit→sign · extra gates: ADR-005 client-isolation (HARD tier-3), server-side gate enforcement (tier-3), signed-evidence+audit (tier-3), e-sign mock-first fail-closed seam, SESSION_CONTEXT on all reads/writes, cross-surface validate, container smoke.

**Design — full field-level expansion of the brief's `## Data & Interface Contract` (binding ref for developers; bound into TASK-005-001/-002/-003/-005 specs):**
- **`Engagement` (NEW, dbo, RLS-covered):** `id UNIQUEIDENTIFIER PK NEWSEQUENTIALID()`; `engagementRequestId UNIQUEIDENTIFIER NOT NULL UNIQUE` FK→`EngagementRequest` (1:1, `onDelete: NoAction`); `clientUserId UNIQUEIDENTIFIER NULL` FK→`User` (**nullable** — the engagement is created at accept-time *before* the prospect signs up; resolved/back-filled at sign-up — see DECISION-A); `status NVARCHAR(20) NOT NULL DEFAULT 'New'` (∈ {`New`,`In Progress`}; created `New`, never transitioned this slice); `createdAt/updatedAt DATETIMEOFFSET` (ADR-002 conventions). **Client-owner identity** for the isolation predicate resolves `SESSION_CONTEXT('clerk_user_id') → User.clerkId → User.id = Engagement.clientUserId`.
- **Onboarding state — DECISION-B: discrete columns on `Engagement`** (not a separate table; Phase-2 minimal, one letter gate + a 3-step sequence whose only dynamic state is letter-signed): `letterSignedAt DATETIMEOFFSET NULL` (NULL = unsigned; non-null = signed → the gate-open signal); `letterSignatureEvidence NVARCHAR(MAX) NULL` (the mock provider's deterministic signed-evidence JSON — AC-ONBD-002-04); `letterTemplateSnapshot NVARCHAR(MAX) NULL` (the template content captured at sign time, so later template edits never retro-change a signed letter — DECISION-C). Current step / "what remains" is **derived** server-side from `letterSignedAt` + the fixed 3-step order, not stored (no drift risk).
- **`LetterTemplate` (NEW, dbo, accountant-owned — NOT client-readable):** single-current-row model (**DECISION-D: single row, not versioned** — Phase 2 needs only "the current template"; versioning is a later concern). `id UNIQUEIDENTIFIER PK`; `content NVARCHAR(MAX) NOT NULL`; `isSystemDefault BIT NOT NULL DEFAULT 0` (the seeded default row flips to 0 semantics once edited — or simply: edit overwrites `content` and clears the default marker); `updatedBy NVARCHAR(64) NULL` (accountant clerkId); `createdAt/updatedAt DATETIMEOFFSET`. **System default seeded** via the raw-SQL/seed path so AC-IDNT-007-01 holds out-of-box. Editing = UPDATE the single row under the accountant principal (AC-IDNT-007-02). The client signs `LetterTemplate.content` as it stands at sign time (AC-IDNT-007-03) — snapshotted into `Engagement.letterTemplateSnapshot`.
- **`sec.fn_engagement_access(@engagementId)` + `sec.pol_Engagement` (NEW — FIRST client-owned-rows policy):** mirrors `0001`/`0004` ITVF+SCHEMABINDING+FILTER/BLOCK shape, but **adds the live CLIENT-ownership branch** the prior policies stubbed out: (1) `IS_MEMBER('app_admin_role')=1` → pass; (2) `SESSION_CONTEXT('role')='ACCOUNTANT'` → pass (all); (3) **CLIENT branch:** `EXISTS (SELECT 1 FROM dbo.[User] u WHERE u.clerkId = CAST(SESSION_CONTEXT('clerk_user_id') AS NVARCHAR(64)) AND u.id = <row>.clientUserId)` → pass only own rows; null SESSION_CONTEXT → all branches fail → ZERO (fail-closed). FILTER + BLOCK(AFTER INSERT/BEFORE+AFTER UPDATE/BEFORE DELETE). New policy file `db/policies/0005-engagement-policy.sql`. **HARD tier-3 evidence (three-item gate):** CLIENT-A-cannot-read-CLIENT-B; anonymous/null reads ZERO; ACCOUNTANT reads all.
- **`ESignatureProvider` port (NEW `packages/esign` — ADR-023/024 §1):** narrow surface — `createSignatureRequest({ engagementId, letterContent, signer: { clerkUserId, email } }): Promise<SignatureRequest>` and `verifyCompletion(ref): Promise<SignatureCompletion>` where `SignatureCompletion = { signed: true, signedAt, evidence } | { signed: false }`. `bindings/mock.ts` returns a deterministic `signed: true` + evidence blob (faithful-to-behavior, not security — ADR-023 §6). `select.ts` keyed on `ESIGN_PROVIDER`, **fail-closed, real-binding default** (inverts the auth selector's mock-default): the mock is selectable **only** with `ALLOW_MOCK_ESIGN=true` (non-prod opt-in; `ESIGN_PROVIDER=docuseal` + `ALLOW_MOCK_ESIGN=true` is a contradiction throw, same as auth). `bindings/docuseal.ts` is a deferred stub that throws if selected (real enablement is a later slice). Onboarding depends only on the port.
- **Onboarding read/accessibility contract:** a server-side `getOnboarding(engagementId)` (client principal, `withRequestContext`) returns the 3 steps + per-step `accessible: boolean` + current position, derived from `letterSignedAt`. A locked step's action is **refused server-side** (the sign action + any step-2/3 entry point check `letterSignedAt != null` before acting — not merely a hidden link), satisfying AC-ONBD-001-02 / -002-01/-02 at tier-3.
- **`// DECISION:`s for developers (recorded here, to appear in code):** **DECISION-A** Engagement created at accept-time with `clientUserId = NULL`, resolved at the EPIC-004 sign-up path by matching the invitation ticket → request → engagement and back-filling `clientUserId` (sign-up already runs the audit transaction; the back-fill rides it). **DECISION-B** onboarding-state as columns on `Engagement`. **DECISION-C** snapshot template content at sign time. **DECISION-D** single-row `LetterTemplate`. **DECISION-E** e-sign selector default = real / fail-closed via `ALLOW_MOCK_ESIGN` (NOT NODE_ENV — the BUG-002-001 generalization).
- **Reuse (surveyed live):** `packages/db` `withRequestContext`+`$extends` SET hook + barrel; `sec` ITVF FILTER/BLOCK pattern (`0001`/`0004`); `recordAuthEvent`/`withAuditTransaction` (audit); EPIC-003 `acceptRequest` (`apps/admin/.../requests/actions.ts`, extended additively); `packages/auth` `getAuthProvider`/`getIdentity` + the admin `getAccountantIdentity()` shape (new portal `getClientIdentity()` mirror); `packages/email`/`packages/auth` `select.ts` as the e-sign selector template (inverted default); Prisma Track-A + raw-SQL Track-B migration discipline (ADR-002).

**Architecture posture:** **No new OPEN-QUESTION.** ADR-023 (provider-seam/mock-first) + ADR-024 (Docuseal-behind-seam) are both **Accepted** and govern the e-sign seam end-to-end — the Conductor confirmed no consult needed. The REQ-AUTH-003 *feature*-AC boundary (client-data RLS AC owned in Phase 3) is already a planning-flagged note in the brief + epic; the isolation *mechanism* + its per-policy test land here — this is upstream's stated intent, not an IO invention, so nothing is raised.

**Design-coherence check vs. brief: PASS.** Every in-scope AC maps to a task + tier; the mock-first fail-closed e-sign seam, the first client-isolation policy + its HARD three-item test, server-side gate enforcement, signed-evidence+audit, SESSION_CONTEXT on both principals, and the two-surface split (portal onboarding / admin template) are all bound into task specs. Out-of-scope (lifecycle pipeline, questionnaire/upload internals, real Docuseal, multi-participant signing, AUTH-003 feature AC) explicitly fenced.

**Decompose:** 8 tasks, dependency-ordered (see task table above). 001 introduces the gate (`yes` — first client-owned-rows policy, three-item evidence); 002 + 007 advisory (e-sign seam / mock e2e). All `Impl: developer` (each touches multiple files / real debugging expected — none qualifies for `Impl: io`). All carry `**Acceptance criteria:**`, `**Upstream refs:**`, `**Introduces-gate:**`, `E2e-required`, `Brief-deploys: no`.
**End:** Plan exit condition met — branch created, 8 task files at `backlog` with all required fields, methodology + tier map recorded, full Data-&-Interface-Contract expansion bound into specs, design-coherence PASS, PROGRESS.md `## Current initiative` populated. → **Dispatch** (TASK-005-001 first; dependency-free root: schema + first client-isolation policy + tier-3 isolation tests).

### SDET Review — BRIEF-005 / TASK-005-001 — 2026-06-18
**Start:** Independent review of TASK-005-001 (Engagement schema + RLS policy + tier-3 isolation tests). Developer-implemented; `Introduces-gate: yes` (FIRST client-owned-rows policy). Three load-bearing review concerns per the dispatch: (1) Gate-Authoring three-item evidence, (2) independent re-run of the tier-3 isolation suite against the real SQL Server container, (3) Data-&-Interface-contract compliance.
**Actions:**
- Mandatory checklist: all boxes pass. `Complexity-actual=4` (integer 1–5). `Started-at`/`Complexity-estimate` populated. Dispatch-Checkpoint pre-impl entry present. Required task-spec fields (`**Acceptance criteria:**`, `**Upstream refs:**`, `**Introduces-gate:**`) all present.
- Docker pre-flight: PASS — Docker 29.4.1, `tax-portal-sqlserver` Up 47 hours (unhealthy SA healthcheck — carried retro item, non-blocking; DB fully operational via `taxportal_admin`/`taxportal_user` principals as confirmed by test runs).
- **Independent isolation suite re-run** (`pnpm --filter @tax-portal/db test -- src/engagement.client-isolation.rls.test.ts`): **6/6 PASS** against real container. All three ADR-005 §6 HARD tests pass: CLIENT-A positive, CLIENT-B ZERO, anon ZERO, ACCOUNTANT all, BLOCK write boundary (rowsAffected=0 + admin read-back unchanged). Admin-pool sanity check PASS.
- **Independent persistence suite re-run** (`pnpm --filter @tax-portal/db test -- src/engagement.persistence.test.ts`): **9/9 PASS**. Full suite: **12 files, 65 tests, 0 failures** (matches developer's reported run exactly).
- **Gate-Authoring three-item evidence:** (1) Run marker — test names in Work Log reproduced verbatim; independently confirmed. (2) Named code path — `sec.fn_engagement_access` CLIENT-ownership EXISTS branch + FILTER/BLOCK predicates in `db/policies/0005-engagement-policy.sql`; live container query confirms `SQL_INLINE_TABLE_VALUED_FUNCTION` (ITVF, correct) and 5 predicates deployed. (3) Counterfactual — three distinct regression paths named; specific and convincing.
- **Data-&-Interface-contract compliance:** Live schema queried via sqlcmd against `tax_portal` DB. All 9 `Engagement` columns present with correct types and nullability (contract match). All 6 `LetterTemplate` columns present (contract match). `sec.pol_Engagement` present, `is_enabled=1`, 5 predicates (FILTER + 4 BLOCK). UNIQUE constraint on `engagementRequestId`, both FKs confirmed. Default template seeded (1 row). Migration file is well-formed and matches live schema — no drift detected.
- **ADR-003 Amendment 1:** No `@read_only=1` in any live `sp_set_session_context` call in new code. Test helpers use `@read_only=0` throughout. Stale comments in `service.rls.test.ts`/`session-context.propagation.test.ts` are the pre-existing carried Obs 3 items — non-blocking.
- **ADR-006:** No app surface code leaked (`apps/portal`/`apps/admin` untouched).
- **Non-blocking observation recorded in task SDET Notes:** `recordLetterSignature` uses admin pool in this substrate slice; BLOCK predicate independently tested via raw request pool in isolation suite; TASK-005-005 owns the real signed request-pool path.
- **Atomic close-edit:** SDET Review box ticked; `## SDET Review` Decision=approved + Notes filled; approval breadcrumb appended to Work Log; `Status: review → done`; `Completed-at: 2026-06-18T08:15:00Z`.
**End:** TASK-005-001 **APPROVED**. TASK-005-001 status → `done` in task table below. → IO: next dependency-order dispatch (TASK-005-002 e-sign seam and/or TASK-005-003 engagement-creation-on-accept).

### IO Dispatch/Review — BRIEF-005 / TASK-005-001 returned → SDET review — 2026-06-18
**Start:** TASK-005-001 (developer-implemented, dependency-free root) returned from the webapp-developer at `Status: review`, Complexity-actual 4; lint/type-check/build green, `@tax-portal/db` 12 files / 65 tests pass. It **introduces the FIRST client-owned-rows gate** (`sec.pol_Engagement`) and is the first task to carry a `## Field-level contract`.
**Actions:**
- Verified the task file is well-formed at `review`: Dispatch-Checkpoint pre-impl Work Log entry present; `Started-at`/`Complexity-estimate`/`Complexity-actual` populated; three-item Gate-Authoring evidence recorded in the Work Log; field-level contract block present.
- Phase-transition reflex: `## Current initiative` phase → Review; TASK-005-001 status → `review` in the task table; this entry appended. (No prior-session entries to sweep — Plan entry is this slice's first and stays.)
- Composed the single Review dispatch: **SDET review of TASK-005-001** (developer-implemented → `Reviewer: sdet`). Loaded the SDET with the three review concerns flagged by this dispatch: (1) the three-item Gate-Authoring evidence for the new required gate; (2) independent re-run of the tier-3 isolation suite against the **real container** (Docker 29.4.1 up), not trusting the developer's reported run; (3) the new **Data-&-Interface-contract compliance** check — delivered `Engagement`/`LetterTemplate` schema + `sec.pol_Engagement` must match the binding field-level contract (entities, `New` status default, `unsigned→signed` letter transition via `letterSignedAt`, nullability of `clientUserId`, the isolation ownership join). Also flagged the **hand-crafted Track-A migration applied via sqlcmd workaround** (carried P3019/TLS `migrate deploy` env issue) — the SDET must confirm the migration file is well-formed and the live schema state matches it, not merely that tests pass.
**End:** SDET dispatch composed (`## Next Dispatch`). Awaiting SDET verdict; on APPROVE → next dependency-order dispatch (TASK-005-002 e-sign seam, the other dependency-free root); on REJECT → re-dispatch the developer with the SDET's rejection reasons.
