# Progress

> Single source of truth for current slice state, quality gates, active bugs, and retro action items. The IO
> and SDET update this file at the start and end of every invocation. Structure contract: see
> `.implementation/ENGINE.md` § PROGRESS.md structure contract.
>
> **Note (2026-06-14):** the implementation team was refactored into the standalone `.implementation/` layer
> (engine: `ENGINE.md` / `PHASES.md`; orchestrator: `AGENT.md` = the Implementation Orchestrator, `[io]`).
> The team consumes a self-contained build brief.

## Current initiative

**EPIC-005 — DELIVERED.** BRIEF-005 (client onboarding spine + engagement-letter e-sign gate) is **complete and
merged**: **PR #48 → squash-merged to `main` @ `f879da2`** (Lane B reviewed lane, `--delete-branch`, no
protection toggle). **All 9 applicable gates satisfied:** gates 1–7 green pre-merge (submission 8/8, SDET Review
8/8, Overwatch Audit CLEAN, IO design-scan PASS, Container Smoke PASS, SDET Acceptance-validation APPROVED 10/10
AC, SDET CI gate PASS 423 tests + quality audit CLEAN); **gate 8 (post-merge CI) PASS** — `main` @ `f879da2`,
workflow `CI` = success AND `Code Quality: Push on main` (CodeQL) = success; **gate 9 N/A** (`Brief-deploys: no`,
no staging per ADR-007). Reviewed lane cleared two CI hurdles before merge: **nodemailer 9.0.1** security bump
(GHSA-p6gq-j5cr-w38f) + **3 github-code-quality bot-thread cleanups**. No `BUG-005-POST-*`. RETRO-005 Post-Merge
Addendum + final scorecard written. **No active slice** — IO eligible to Plan the next slice.

**Phase 2 status — onboarding gate now open.** EPIC-005 unblocks **EPIC-006 (intake questionnaire)** and
**EPIC-007 (initial document upload)** — both depend on the onboarding spine and are now next-ready for
`/orchestrate`. **EPIC-008 (onboarding completion + transition)** is the Phase-2 capstone and needs all three
(005/006/007). Phase 1 (EPIC-001/004/002/003) all delivered.

**Carried follow-ups (open at EPIC-005 close):** **SEC-3** (per-connection `SESSION_CONTEXT` /
`sp_reset_connection` defense-in-depth — tracked hardening, not a defect); **`inventory.md` Track-B drift**
(missing `0004`/`0005` policy rows + `Engagement`/`LetterTemplate` entities — enumerate at the next infra/
`packages/db` task); **synthetic `Completed-at` inversion** (Audit Obs 1 — 5th occurrence, capture real clock
values). **RESOLVED this slice:** the `service.rls.test.ts` + `engagement.ts` comment-drift (rode PR #48) and the
nodemailer advisory (9.0.1). **Rule sunset:** cross-surface-parity sunset counter reached **3 consecutive
zero-finding Close-preps** → surfaced for keep/remove; **IO recommendation KEEP**.

---

<details><summary><strong>EPIC-005 delivery detail (archived in place — collapse)</strong></summary>

**Branch:** `brief-005-onboarding-spine-engagement-letter` (created from `main` @ `97330ab`, deleted on merge).
**Gated:** yes. **Brief-type:** feature · **Brief-deploys:** no. **Opened Phase 2 (the onboarding gate).**

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
| TASK-005-002 `packages/esign` provider seam (port + mock binding + fail-closed selector) | done | developer | none (infra) | **Introduces-gate: advisory**; ADR-023/024 §1 — default real, `ALLOW_MOCK_ESIGN` non-prod opt-in; mirror auth `select.ts` (inverted default) — SDET APPROVED 2026-06-18T08:35:00Z |
| TASK-005-003 engagement creation on accept (extend EPIC-003 `acceptRequest`) + client-link resolution | done | developer | ONBD-001-01 (substrate) | additive to EPIC-003 accept; create Engagement(New) + onboarding-state in the existing audit transaction — SDET APPROVED 2026-06-18T08:52:00Z, committed `53f62a5` |
| TASK-005-004 letter-template setting UI + actions (admin) — default present, edit persists | done | developer | IDNT-007-01/-02 | `apps/admin` ONLY; consumes delivered -001 `getCurrentLetterTemplate`/`updateLetterTemplate` (admin pool — LetterTemplate has no RLS policy); ACCOUNTANT guard via `getAccountantIdentity()`; default seeded — SDET APPROVED 2026-06-18T09:16:00Z |
| TASK-005-005 onboarding read model + server-side step-accessibility gate + sign action (portal) | done | developer | ONBD-001-01/-02/-03, ONBD-002-01/-02/-03/-04, IDNT-007-03 | `apps/portal`; client-principal; sign via `ESignatureProvider` port; record evidence + audit; locked step **refused** not hidden — SDET APPROVED 2026-06-18T15:12:00Z, committed `d637418`. Open note-only carry: engagement.ts L433 misleading "parameterised inputs" comment — correct alongside next task touching that fn |
| TASK-005-006 onboarding sequence UI (portal) — three steps, locked affordances, position/remaining | done | developer | ONBD-001-01/-03 (+ IDNT-007-03 UI, ONBD-002-01/-02/-03 UI) | `apps/portal`; renders the delivered -005 `OnboardingReadModel` + invokes `signEngagementLetterAction`; presents edited template at letter step; **does NOT re-derive gate logic in the client**. Adds no-arg `getMyEngagement()` (FILTER-governed request-pool `findFirst`) + `getMyOnboardingAction()` — no client-supplied id. SDET APPROVED 2026-06-18T17:45:00Z; `data-*` hooks present for -007 |
| TASK-005-007 e2e + gherkin binding + cross-app (both surfaces) | done | developer | ONBD-001-01/-03, ONBD-002-03, IDNT-007-03 (+ cross-app edit→sign) | **E2e-required; Introduces-gate: advisory** (e-sign mock e2e); bind epic's 10 gherkin scenarios. SDET independently re-ran: portal 33/33, admin 32/32, cross-app 10/10; sign→unlock 3× zero-flake (397/403/409ms); gherkin verbatim, fixture honest, no bypass leak, cross-app loop genuine assertion — SDET APPROVED 2026-06-18T19:47:00Z |
| TASK-005-008 @demo gallery (admin edit + portal sign→unlock) | done | developer | none (non-gating) | docs/demos/EPIC-005/ — SDET APPROVED 2026-06-18T18:45:00Z. Independent re-run: admin 12/14 (2 new PASS, 2 pre-existing failures confirmed non-regression); portal 10/10 PASS (5 new PASS). 7 distinct PNGs independently verified. IO action required: revert EPIC-001..004 `M` PNGs before commit (`git checkout HEAD -- docs/demos/EPIC-001/ docs/demos/EPIC-002/ docs/demos/EPIC-003/ docs/demos/EPIC-004/`). |

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

</details>

## Awaiting PR merge

_None — no slice in PR limbo._

Prior delivered: PR #48 `f879da2` (EPIC-005 — opens Phase 2), PR #42 `ec151cb` (EPIC-003), PR #40 `70ea10e`
(EPIC-002), PR #38 `0444551` (EPIC-004), PR #35 `f7f6c9d` (EPIC-001) — all merged. **Phase 1 (MVP) complete;
Phase 2 (onboarding gate) open with EPIC-005 delivered.**

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


### IO Audit-verdict + Review (design-scan) → Smoke — BRIEF-005 — 2026-06-18
**Start:** Resumed with the Overwatch whole-slice audit returned. Recorded the audit verdict, ran the IO Review design-scan, and advanced to Smoke.

**Overwatch Audit verdict — CLEAN (0 blocking).** Zero scope violations, zero gate bypasses, zero required-gate-evidence gaps. Gate-authoring evidence verified: TASK-005-001 (`yes` — first client-owned-rows `sec.pol_Engagement`, all 3 evidence items + HARD isolation test real); -002 + -007 (advisory, did NOT silently upgrade to required). Out-of-scope fence held (no lifecycle pipeline beyond `New`, no questionnaire/upload internals, no real Docuseal, no multi-participant, no AUTH-003 feature AC). Slice diff scoped to EPIC-005 (prior-epic PNGs reverted). Cross-surface parity: both surfaces genuinely exercised, **zero parity findings** (third consecutive zero — sunset counter at 3). Methodology fully honored. **No IO-classified blocking finding → Audit exit condition vacuously met.**
- **Audit Obs 1 (retro carry):** `Completed-at` is 3–5h BEFORE `Started-at` on TASK-005-001/-002/-003/-004 — synthetic/sentinel `Completed-at` timestamps (same family as BRIEF-002 Audit Obs 2). No gate failed; metrics will show inverted elapsed time for those 4. → record in RETRO-005.
- **Audit Obs 2 (Close-prep action):** `packages/db/src/service.rls.test.ts` ~L71/~L88 stale `@read_only`/`ADR-003 §4` comments — wrong since BUG-002-003/ADR-003 Amendment 1; carry aging (≥5 `packages/db` tasks rode past it). → promote to a named `ungated-fix` at Close-prep with a planned cleanup slot.
- **Audit Obs 3 (Close-prep action):** `packages/db/src/repositories/engagement.ts` ~L433 misleading "parameterised inputs" comment — injection surface confirmed sound (all 3 interpolated values server-derived/guarded, single-quote-escaped); comment-text-only drift. → pair with Obs 2 as a single comment-cleanup at Close-prep.
- **Rule-sunset:** KEEP `--no-verify` clause; KEEP `PushNotification` spam-loop guard (both prophylactic). Cross-surface-parity sunset counter at 3 consecutive zero-finding phases — credit the third zero at the Close-prep retro, then surface the rule for keep/remove.

**Phase-transition reflex (Review → Smoke):** swept the IO Audit(entry) session entry to `PROGRESS-ARCHIVE.md` (Review→Smoke sweep marker; summarized — full text in git history; **IO Plan entry retained** as the canonical Design record); updated `## Current initiative` phase line to **SMOKE**; appended this entry.

**IO design-scan (gate 4) — PASS.** Read the integrated `git diff main...HEAD` (74 files, +11393/−308, scoped to EPIC-005). Verified honor of the brief + cited ADRs:
- **ADR-005 (first client-owned rows):** `db/policies/0005-engagement-policy.sql` adds the live CLIENT-ownership branch (admin / ACCOUNTANT / CLIENT-ownership via `clerk_user_id`→`User`→`Engagement.clientUserId`); ITVF+SCHEMABINDING; null SESSION_CONTEXT → ZERO (fail-closed); FILTER + 4 BLOCK predicates. HARD tier-3 three-item test present (`engagement.client-isolation.rls.test.ts`). ✓
- **ADR-023/024 (e-sign seam, fail-closed):** `packages/esign/src/select.ts` real-default; mock gated on `ALLOW_MOCK_ESIGN` (NOT NODE_ENV — BUG-002-001 generalization); contradiction + unknown-value throw; onboarding depends only on the port (no binding-class import in `apps/portal/.../onboarding/actions.ts`). ✓
- **ADR-003 (SESSION_CONTEXT):** client reads + signature write via `withRequestContext`; template edit via accountant principal; no `@read_only` (Amendment 1). ✓
- **Server-side gate (AC-ONBD-001-02/002-01/02):** `packages/db/src/onboarding.ts` derives step accessibility from `letterSignedAt` + fixed order; locked steps **refused** (`checkStepAccessibility` → `StepRefusal`), not hidden. ✓
- **ADR-019 (audit):** signature audited via `recordAuthEvent('engagement.letter_signed')` AFTER the request-pool BLOCK-governed write; `rowsAffected === 0` → refusal, **no audit row for a non-event**. ✓
- **DECISION-A (engagement↔client linkage):** Engagement created at accept-time (additive in EPIC-003 `acceptRequest`'s existing audit txn, status from DB default `New`, `clientUserId` NULL); back-fill rides the sign-up `withAuditTransaction`, guarded behind the real-binding seam (mock → undefined `engagementRequestId` → NULL → fail-closed). ✓
- **ADR-006 (two apps):** cross-surface fence verified — `apps/admin/src/app/onboarding` does not exist; `apps/portal/src/app/settings/letter-template` does not exist; the only portal reference to letter-template settings is the cross-app e2e spec (correct). ✓
- **Schema vs. Design contract:** `prisma/schema.prisma` Engagement + LetterTemplate match the full field-level expansion exactly (DECISIONs A–D realized). ✓
**Result: zero violations → zero fix-forward tasks.** Review exit condition met (all tasks `done` + SDET-reviewed; Audit recorded; design-scan recorded with no blocking findings).

**End:** Gates 1–4 cleared. Advancing to **Smoke (gate 5)** — composing the single SDET container-smoke dispatch (Docker stack, not local dev). One-dispatch-per-turn honored. On return: record the smoke verdict; if PASS → Validate (gates 6+7); if FAIL → fix task + re-smoke.


### SDET Container Smoke — BRIEF-005 — 2026-06-18T20:30:00Z

**Docker pre-flight:** PASS — `docker info` → server version 29.4.1. Docker daemon up.

**Stack status (non-destructive smoke — stack already up from TASK-005-007 e2e gate):** Chose non-destructive smoke over `docker compose down -v` per the dispatch instruction (the stack is healthy with EPIC-005 schema applied; a clean-volume rebuild risks the known P3019/bootstrap-fragility carried infra item). `docker compose --env-file .env.local ps` output:

```
NAME                   STATUS                    PORTS
tax-portal-admin       Up 2 hours (healthy)      0.0.0.0:13001->3001/tcp
tax-portal-azurite     Up 2 days  (healthy)      0.0.0.0:10000->10000/tcp
tax-portal-mailhog     Up 26 hours (healthy)     0.0.0.0:11025->1025, 0.0.0.0:18025->8025/tcp
tax-portal-portal      Up 2 hours (healthy)      0.0.0.0:3000->3000/tcp
tax-portal-sqlserver   Up 2 days  (unhealthy)    0.0.0.0:14330->1433/tcp
```

`sqlserver` status `(unhealthy)` = the SA-password healthcheck mismatch (carried infra item — volume bootstrapped with a different SA password; app principals fully operational — non-blocking per EPIC-002/004 precedent).

Both app containers built today 2026-06-18: portal @ 10:34 CDT, admin @ 10:45 CDT — post-EPIC-005 schema changes. Containers restarted during TASK-005-007 e2e gate (~2 hours ago).

---

**Infrastructure checks:**

| Check | Command / Evidence | Verdict |
|-------|-------------------|---------|
| Docker pre-flight | `docker info` → 29.4.1 | PASS |
| Stack up (all services) | `docker compose ps` — 5 services up, both apps `(healthy)` | PASS |
| sqlserver healthcheck | `(unhealthy)` — SA-password mismatch (carried infra item, DB operational via app principals) | CARRIED (non-blocking) |
| portal container healthy | `docker compose ps` → `(healthy)` | PASS |
| admin container healthy | `docker compose ps` → `(healthy)` | PASS |
| azurite healthy | `docker compose ps` → `(healthy)`; `nc -z localhost 10000` → reachable | PASS |
| mailhog web UI | `curl -sf http://localhost:18025` → HTTP 200 | PASS |
| portal image post-EPIC-005 | Built 2026-06-18T10:34 CDT (after EPIC-005 schema migration) | PASS |
| admin image post-EPIC-005 | Built 2026-06-18T10:45 CDT (after EPIC-005 schema migration) | PASS |
| Prisma migration present | `prisma/migrations/20260618124735_add_engagement_letter_template/` exists | PASS |
| Policy file present | `db/policies/0005-engagement-policy.sql` — `sec.fn_engagement_access` ITVF + `sec.pol_Engagement` FILTER+4×BLOCK | PASS |
| DB objects applied (indirect) | Portal e2e 33/33 PASS — onboarding tests exercise `Engagement` table, `letterSignedAt` column, `sec.pol_Engagement` FILTER via CLIENT session; direct sqlcmd access via app principal not possible without reading `.env.local` credential | PASS (behavioral) |
| Seeded LetterTemplate (indirect) | AC-IDNT-007-01 e2e `[letter template page shows a non-empty system default]` PASS in TASK-005-007 SDET re-run; portals onboarding cross-app spec asserts non-empty content at letter step | PASS (behavioral) |

**EPIC-005-specific infra summary:** `Engagement` + `LetterTemplate` schema applied in-container (Prisma migration `20260618124735`); `db/policies/0005-engagement-policy.sql` present (ITVF SCHEMABINDING + FILTER + 4 BLOCK predicates matching the ADR-005 three-branch design); seeded default `LetterTemplate` verified via e2e behavior.

---

**UI / seam checks:**

| Check | Command / Evidence | Verdict |
|-------|-------------------|---------|
| portal /healthz | `curl http://localhost:3000/healthz` → HTTP 200 | PASS |
| portal /readyz | `curl http://localhost:3000/readyz` → HTTP 200 | PASS |
| admin /healthz | `curl http://localhost:13001/healthz` → HTTP 200 | PASS |
| admin /readyz | `curl http://localhost:13001/readyz` → HTTP 200 | PASS |
| portal root → sign-in (unauthenticated redirect) | `curl -sL http://localhost:3000/` → HTTP 307 → 200 at `/sign-in` | PASS |
| portal /onboarding (unauthenticated redirect) | `curl -sL http://localhost:3000/onboarding` → HTTP 307 → 200 at `/sign-in?redirect_url=%2Fonboarding` | PASS |
| admin /settings/letter-template (redirect) | `curl http://localhost:13001/settings/letter-template` → HTTP 307 (redirects to `localhost:3001` on host — port-remap artifact; admin container itself healthy on 13001) | PASS (artifact) |
| Portal container boots without esign selector throw | `docker logs tax-portal-portal` → "Ready in 83ms", no esign throw; container env: `ESIGN_PROVIDER=mock`, `ALLOW_MOCK_ESIGN=true` (sanctioned combination per ADR-023 §4 / DECISION-E) | PASS |
| Esign selector fail-closed intact | `packages/esign/src/select.ts` read: mock gated on `ALLOW_MOCK_ESIGN=true`; `ESIGN_PROVIDER=mock` + `ALLOW_MOCK_ESIGN` unset → throws; `ESIGN_PROVIDER=docuseal` + `ALLOW_MOCK_ESIGN=true` → throws (contradiction); unknown → throws. Real-default (`docuseal`) preserved. | PASS |
| Sign→unlock smoke e2e (targeted) | `pnpm --filter portal e2e:run -- --grep AC-ONBD-002-03` → **33/33 PASS (13.8s)**; `[AC-ONBD-002-03] clicking 'Sign Engagement Letter' unlocks steps 2/3` → 400ms. Full onboarding suite (ONBD-001-01/-03, ONBD-002-01/-02/-03, IDNT-007-03 cross-app) exercised. | PASS |
| Admin letter-template surface reachable (container-internal) | Admin container healthy on 13001; e2e `[AC-IDNT-007-01/-02]` PASS in TASK-005-007 SDET re-run (32/32 admin); cross-app e2e confirmed | PASS |

**Targeted smoke e2e output (AC-ONBD-002-03):**
```
Running 33 tests using 1 worker
  ✓  21 [chromium] › onboarding.spec.ts:501:7 › [AC-ONBD-002-03] signing the engagement letter unlocks steps 2/3 › clicking 'Sign Engagement Letter' unlocks steps 2/3 (400ms)
  ... (32 other tests — all PASS)
  33 passed (13.8s)
```

---

**Carried infra items (non-blocking — recorded, not failing the gate):**
1. **`sqlserver` healthcheck `(unhealthy)`** — SA-password mismatch (volume bootstrapped with a different SA password than current env). DB fully operational via app principals. Same item as EPIC-002/004 retros.
2. **Clean-volume bootstrap / `migrate deploy` P3019** — not triggered (non-destructive smoke taken). Would resurface on a `down -v` rebuild.
3. **Prisma OpenSSL detection warning** — `prisma:warn Prisma failed to detect the libssl/openssl version...` in both container logs. BUG-002-002 family (Alpine/OpenSSL-3 binary target issue); containers function correctly despite it.
4. **`sp_set_session_context` CI grep-guard** — carried from prior retros, not affected by this smoke.

---

**Container Smoke PASS.** All infrastructure checks PASS (with `sqlserver` healthcheck carried per precedent). All UI/seam checks PASS. The esign selector binds correctly in the prod-built container (`ESIGN_PROVIDER=mock` + `ALLOW_MOCK_ESIGN=true` → `MockESignatureProvider`, no throw). The sign→unlock happy path confirmed live against the running stack: 33/33 portal e2e PASS including `[AC-ONBD-002-03]` at 400ms. IO may advance to **Validate (gates 6+7)**.


### SDET Validate — Gate 6 (Acceptance-validation) — BRIEF-005 — 2026-06-18T12:53:00Z

**Start:** Independent slice-level acceptance-validation of all 10 in-scope AC under the mandated gherkin methodology (prose-bind per CLAUDE.md § Executable gherkin tooling — Cucumber tooling not yet landed). Epic's 10 Given/When/Then scenarios in `.planning/EPIC-005-onboarding-spine-engagement-letter.md` § Acceptance scenarios used as the behavior contract without re-authoring.

**Docker pre-flight:** PASS — `docker info` → 29.4.1. Stack up: portal (healthy), admin (healthy), sqlserver (unhealthy SA-password carried), azurite (healthy), mailhog (healthy).

**Prose-bind: each AC ↔ its bound test(s)**

| AC | Tier | Scenario (epic verbatim) | Bound test(s) | Scenario→test alignment | PASS? |
|----|------|--------------------------|---------------|------------------------|-------|
| AC-ONBD-001-01 | tier-6 e2e + tier-2 unit | Given a client whose engagement is in onboarding / When opens onboarding / Then sees exactly three steps in order | `onboarding.spec.ts` `[AC-ONBD-001-01] onboarding page shows exactly 3 steps in the fixed order` — asserts `[data-step]` count=3, order `["engagement-letter","intake-questionnaire","document-upload"]`; `onboarding-gate.rls.test.ts` `[AC-ONBD-001-01] returns exactly three steps in fixed order`; `onboarding-sequence.test.tsx` (unit); `actions.test.ts` `[AC-ONBD-001-01]` | Steps are `evaluateAll` mapped by `data-step` attribute and equality-asserted on the exact 3-element array — scenario's "exactly three steps in order" contract fulfilled | PASS (33/33 portal e2e, 92/92 packages/db, 90/90 portal unit) |
| AC-ONBD-001-02 | tier-3 service-integration | Given letter not yet signed / When attempts questionnaire or upload / Then attempt is refused and step remains locked | `onboarding-gate.rls.test.ts` `[AC-ONBD-001-02] questionnaire refused … returns StepRefusal` + `[AC-ONBD-001-02] document-upload refused …`; `actions.test.ts` `[AC-ONBD-001-02] locked step refused by server`; `checkStepAccessibilityAction` returns `accessible:false` with reason `step-locked` | Refusal is at the `checkStepAccessibility` server-side gate (not hidden-only): `StepRefusal` shape with `refused:true`, `reason:'step-locked'`, `stepKey` — matches "refused and the step remains locked" | PASS |
| AC-ONBD-001-03 | tier-6 e2e + tier-2 unit | Given client partway through onboarding / When views sequence / Then sees which step they are on and which remain | `onboarding.spec.ts` `[AC-ONBD-001-03] position indicator shows current step and remaining count` — asserts `data-current-step="engagement-letter"`, `data-remaining>0`, text "Step 1 of 3", text "remaining"; `onboarding-gate.rls.test.ts` `[AC-ONBD-001-03] unsigned: currentStep=engagement-letter, remaining=2`; `actions.test.ts` `[AC-ONBD-001-03]` both signed/unsigned paths | `data-current-step` and `data-remaining` attributes map directly to "which step they are on and which steps still remain" — scenario fulfilled | PASS |
| AC-ONBD-002-01 | tier-3 service-integration | Given engagement letter not e-signed / When questionnaire accessibility evaluated / Then questionnaire not accessible | `onboarding-gate.rls.test.ts` `[AC-ONBD-002-01] questionnaire step is accessible:false when letterSignedAt is NULL`; `actions.test.ts` `[AC-ONBD-002-01] questionnaire step inaccessible when letterSignedAt is NULL`; `engagement.persistence.test.ts` `[persistence][AC-ONBD-002-01/-02] letterSignedAt is NULL before signing` | `accessible:false` when `letterSignedAt=NULL` — confirmed at both pure-function level (`resolveOnboarding`) and persistence level. Server-side (not just UI) — matches scenario | PASS |
| AC-ONBD-002-02 | tier-3 service-integration | Given letter not e-signed / When document-upload accessibility evaluated / Then document-upload not accessible | `onboarding-gate.rls.test.ts` `[AC-ONBD-002-02] document-upload step is accessible:false when letterSignedAt is NULL`; `actions.test.ts` `[AC-ONBD-002-02]`; parallel to -01 | Same pattern as -01: `accessible:false` server-side on `letterSignedAt=NULL` | PASS |
| AC-ONBD-002-03 | tier-6 e2e | Given letter just e-signed / When onboarding re-evaluated / Then questionnaire and document-upload become accessible | `onboarding.spec.ts` `[AC-ONBD-002-03] clicking 'Sign Engagement Letter' unlocks steps 2/3` (3× zero-flake from TASK-005-007: 397/403/409ms; this run: 399ms) — asserts `data-accessible="true"` on both steps + lock badges gone + `data-done="true"` on step 1; `onboarding-cross-app.spec.ts` (cross-app loop, AC-IDNT-007-03, also exercises ONBD-002-03 end-to-end) | Button click → `signEngagementLetterAction` → `recordLetterSignatureAsClient` (BLOCK-governed) → `revalidatePath('/onboarding')` → page re-renders → steps 2/3 `data-accessible="true"`. Full unlock observable in browser — matches "questionnaire and document-upload steps become accessible" | PASS (399ms, non-flaky) |
| AC-ONBD-002-04 | tier-3 service-integration | Given client e-signed / When engagement examined / Then signed letter recorded as evidence | `engagement.client-isolation.rls.test.ts` `[AC-ONBD-002-04] CLIENT-A reads only their own engagement — positive`; `onboarding-gate.rls.test.ts` `[AC-ONBD-002-04] CLIENT signs their OWN engagement — rowsAffected=1, letterSignedAt set`; `engagement.persistence.test.ts` `[persistence][AC-ONBD-002-04] recordLetterSignature sets letterSignedAt + evidence + snapshot`; `actions.test.ts` `[AC-ONBD-002-04] signature records evidence + writes audit row with action engagement.letter_signed` | DB-verified: `letterSignedAt` non-null, `letterSignatureEvidence` = JSON evidence blob, `letterTemplateSnapshot` = template content at sign-time. Audit row written AFTER `rowsAffected=1` (fail-closed: `rowsAffected=0` returns refused, no audit row). Matches "recorded against it as evidence the gate was satisfied" | PASS |
| AC-IDNT-007-01 | tier-2/5 unit + e2e | Given fresh portal with no accountant-authored letter / When accountant opens template setting / Then system-provided default already present | `letter-template.spec.ts` (admin e2e) `[AC-IDNT-007-01] letter template page shows a non-empty system default` — `inputValue().trim().length > 0`; `engagement.persistence.test.ts` `[persistence][AC-IDNT-007-01] system-default LetterTemplate exists without accountant authoring` — `COUNT(*) >= 1` DB-verified; admin unit `letter-template/actions.test.ts` | Seeded row (db/migrations/0003-seed-default-letter-template.sql) — non-empty content rendered in textarea on first open. Matches "already present" scenario | PASS (32/32 admin e2e) |
| AC-IDNT-007-02 | tier-2/5 unit + e2e | Given template setting / When accountant edits and saves / Then edited content retained | `letter-template.spec.ts` `[AC-IDNT-007-02] edited template content is retained after saving` — fills unique content, saves, navigates away, navigates back, asserts `inputValue()===newContent`; `engagement.persistence.test.ts` `[persistence][AC-IDNT-007-02]`; admin unit | Navigate-away-and-back round-trip confirms persistence, not just immediate DOM state. Matches "retained as the current template" | PASS |
| AC-IDNT-007-03 | tier-6 e2e (cross-app) | Given accountant edited the template / When client reaches letter step / Then letter presented for signature is the edited template | `onboarding-cross-app.spec.ts` `[AC-IDNT-007-03] client signs the accountant's edited template (cross-app edit→sign loop)` (696ms) — accountant fills unique timestamped content → saves → client opens onboarding → `letter-content` div contains `editedContent` exactly → client signs → steps unlock | `data-testid="letter-content"` asserted to contain the accountant's timestamped edited content verbatim. Cross-surface loop: admin edit → portal render is the full chain. Matches "letter presented for signature is the accountant's edited template" | PASS |
| **Client-isolation (ADR-005 HARD)** | tier-3 | Three-item gate: CLIENT-A≠CLIENT-B; anonymous=ZERO; ACCOUNTANT=all | `engagement.client-isolation.rls.test.ts` — 5 tests + admin sanity: CLIENT-A sees own (1 row); CLIENT-B sees CLIENT-A's = 0 (HARD isolation); null SESSION_CONTEXT = 0 (fail-closed); ACCOUNTANT = 2 rows; CLIENT-B UPDATE CLIENT-A = rowsAffected=0 (BLOCK, data unchanged). `onboarding-gate.rls.test.ts` adds `recordLetterSignatureAsClient` public-API BLOCK proofs | All three ADR-005 §6 evidence items present and verified against real SQL Server container. The BLOCK predicate denies cross-client writes (rowsAffected=0, admin read-back confirms) | PASS (6+19 tests in packages/db) |

**Out-of-scope fence verified:** No lifecycle pipeline beyond `New` (no transitions, no labels); no questionnaire/upload internals (EPIC-006/007 fenced); no real Docuseal (`bindings/docuseal.ts` throws `EsignBindingNotAvailableError` at call-time — verified by esign.test.ts); no multi-participant signing; AUTH-003 feature AC not claimed.

**E2e execution output (independent run):**
- `pnpm --filter portal e2e:run`: **33/33 PASS (15.4s)** — all EPIC-005 onboarding tests pass; AC-ONBD-002-03 sign→unlock at 399ms (non-flaky)
- `pnpm --filter admin e2e:run` (`ADMIN_BASE_URL=http://localhost:13001`): **32/32 PASS (10.5s)** — AC-IDNT-007-01/-02 letter template tests pass
- `pnpm e2e:cross-app` (`ADMIN_BASE_URL=http://localhost:13001`): **10/10 PASS (2.3s+1.2s)** — AC-IDNT-007-03 cross-app edit→sign loop at 696ms PASS

**Decision: APPROVED.** All 10 in-scope AC independently validated with passing tagged tests under the mandated gherkin prose-bind methodology. No AC misses its scenario. No test asserts nothing. The locked steps are refused server-side (not merely hidden). The signature evidence is DB-recorded and audited. The client-isolation three-item gate passes against the real container DB. The e-sign selector is fail-closed via `ALLOW_MOCK_ESIGN` (not `NODE_ENV`). IO may advance to CI gate.

**End:** Gate 6 APPROVED. Proceeding to Gate 7 (CI gate).

---

### SDET Validate — Gate 7 (CI Gate) — BRIEF-005 — 2026-06-18T12:53:00Z

**Start:** Independent full local CI gate run. Per the EPIC-002/003/004 precedent and the IO Smoke→Validate transition note, required CI checks (`lint-and-typecheck`, `security-scan`) are validated on the PR at Close-prep/merge (gate 8); this gate satisfies with independent local runs of the full gate suite.

**Execution output:**

| Command | Result |
|---------|--------|
| `pnpm lint` | **PASS** — zero warnings, zero errors. Both `apps/portal` and `apps/admin` ESLint clean at `--max-warnings 0`. |
| `pnpm type-check` | **PASS** — `packages/ui` + `apps/portal` + `apps/admin` tsc --noEmit clean. Zero type errors. |
| `pnpm --filter portal test` | **PASS — 90/90 tests, 7 test files, 1.28s.** Includes `onboarding/actions.test.ts` (23 tests: AC-ONBD-001/002/IDNT-007 unit coverage) and `onboarding/onboarding-sequence.test.tsx` (27 tests: tier-2 component rendering). |
| `pnpm --filter admin test` | **PASS — 142/142 tests, 8 test files, 1.64s.** Includes `settings/letter-template/actions.test.ts` (13 tests: AC-IDNT-007-01/-02 action coverage) and `settings/letter-template/template-editor.test.tsx` (10 tests). |
| `pnpm --filter @tax-portal/db test` (tier-3 vs real container DB) | **PASS — 92/92 tests, 14 test files, 2.96s.** Key EPIC-005 suites: `engagement.client-isolation.rls.test.ts` (6/6), `onboarding-gate.rls.test.ts` (19/19), `engagement.persistence.test.ts` (9/9), `engagement-on-accept.persistence.test.ts` (8/8). All run against the live SQL Server container (`tax-portal-sqlserver`). |
| `pnpm --filter @tax-portal/esign test` | **PASS — 24/24 tests, 1 test file, 241ms.** All fail-closed selector tests, contradiction guard, unknown-provider throw, barrel-leakage guard pass. |
| `pnpm --filter portal e2e:run` | **PASS — 33/33 tests, 15.4s** (cross-referenced from Gate 6 — same run). |
| `pnpm --filter admin e2e:run` | **PASS — 32/32 tests, 10.5s** (cross-referenced from Gate 6 — same run). |
| `pnpm e2e:cross-app` | **PASS — 10/10 tests, 3.5s** (cross-referenced from Gate 6 — same run). |

**Total tests passing (independent local runs):** lint: 0 errors; type-check: 0 errors; unit (portal+admin): 232/232; packages (db+esign+all): 116/116; e2e (portal+admin+cross-app): 75/75. Grand total: **423 tests passing, zero failures.**

**Gate 7 decision: PASS.** All mandatory tier checks green. The required-CI green on the PR head commit is confirmed at Close-prep/merge (gate 8) per the established EPIC-002/003/004 precedent.

**End:** Gate 7 PASS. Proceeding to Quality Audit.

---

### SDET Validate — Quality Audit — BRIEF-005 — 2026-06-18T12:53:00Z

**Start:** Independent quality sweep for blocking gaps per the dispatch checklist.

**Audit checks:**

1. **No direct Prisma outside `packages/db` request-scoped wrapper:** `grep -rn "requestDb|adminDb" apps/portal/src/app/onboarding/` → zero hits. `grep -rn "requestDb|adminDb" apps/admin/src/app/settings/` → zero hits. All onboarding reads route through `withRequestContext(clerkUserId, role, ...)` (confirmed in `actions.ts` lines 143/188/225/282/351). **PASS.**

2. **SESSION_CONTEXT on all onboarding reads/writes, no `@read_only` (ADR-003 Amendment 1):** `grep -rn "@read_only" apps/ packages/esign/` → zero hits in new code. `withRequestContext` called for every client read in `signEngagementLetterAction` and `getOnboardingAction`. Template write (`updateLetterTemplate`) runs under `adminDb` (accountant principal, no client SESSION_CONTEXT needed — correct per design). **PASS.**

3. **E-sign selector is genuinely fail-closed (real-default, `ALLOW_MOCK_ESIGN` not `NODE_ENV`):** `select.ts` L81: `const allowMock = (process.env["ALLOW_MOCK_ESIGN"] ?? "").toLowerCase() === "true"` — no `NODE_ENV` reference. L87: `if (provider === "mock" && !allowMock) throw`. L100: contradiction guard. L119: unknown-provider throw. All four branches covered by unit tests 24/24 passing. **PASS.**

4. **Audit write is fail-closed: `rowsAffected === 0` → refusal, no audit row:** `actions.ts` L326: `if (signResult.rowsAffected === 0) { return { refused: true }; }` — `recordAuthEvent` call is at L339, after the BLOCK-guard check. Unit test `[ADR-019] non-owner BLOCK denial does NOT write an audit event` (mocks `rowsAffected: 0`, asserts `mockRecordAuthEvent.not.toHaveBeenCalled()`). **PASS.**

5. **Cross-surface fence:** `ls apps/admin/src/app/onboarding` → DOES NOT EXIST. `ls apps/portal/src/app/settings` → DOES NOT EXIST. No onboarding route in admin; no letter-template setting in portal. ADR-006 fence intact. e2e cross-surface assertions PASS on both `data-accessible` affordances (portal-only) and template editor (admin-only). **PASS.**

6. **Operations docs consistency:** `inventory.md` last updated TASK-005-002; `ESIGN_PROVIDER`/`ALLOW_MOCK_ESIGN` env vars documented at lines 108–109. `runbook.md` updated TASK-005-002 with mock e-sign opt-in runbook. No Dockerfile, docker-compose topology, secret, or principal-split changes in EPIC-005 (schema/policy are Track A/B migrations, not compose-level changes) — the specific CLAUDE.md trigger (Dockerfile, topology, secrets, env vars, ingress, principal split) applies to TASK-005-002 only, which was documented. **PASS** (env-var trigger satisfied; schema/policy inventory gap is an observation below, not a blocking rejection).

**Non-blocking observations (retro carry):**

- **[doc-drift — inventory]** `inventory.md` Track B table is missing entries for `db/policies/0004-notification-policy.sql` (EPIC-003), `db/policies/0005-engagement-policy.sql` (EPIC-005), and does not enumerate the `Engagement`/`LetterTemplate` Prisma entities. The DevOps CLAUDE.md trigger is env/topology/secret/principal-split changes (satisfied); schema and policy file listings are not explicitly required by the trigger but their omission is a drift from "authoritative inventory" intent. Recommendation: extend the Track B table to include all policy files at the next `packages/db` or infra task that touches this file — pair with the existing `service.rls.test.ts` comment-cleanup retro item. Non-blocking observation only (no gate failure; behavior fully correct).

- **[metric-integrity — Audit Obs 1 carried from Overwatch]** `Completed-at` 3–5h BEFORE `Started-at` on TASK-005-001/-002/-003/-004 (synthetic timestamps). Carried per the Overwatch verdict. Non-blocking.

**Quality audit decision: CLEAN — no blocking gaps found.** All five blocking-gap checks pass. Two non-blocking observations carried to Close-prep retro.

**End:** Quality audit CLEAN. All three Validate gates cleared (Gate 6 APPROVED, Gate 7 PASS, Quality Audit CLEAN). IO may advance to Close-prep.

### IO Close-prep — BRIEF-005 / EPIC-005 — 2026-06-18
**Start:** Resumed with all three Validate gates returned (Gate 6 APPROVED 10/10 AC, Gate 7 PASS 423 tests, Quality Audit CLEAN — three gate-record entries retained inline above). Gates 1–7 all green. Ran Close-prep.
**Phase-transition reflex (Validate → Close-prep):** appended a Validate→Close-prep sweep marker to `PROGRESS-ARCHIVE.md` (swept the IO Smoke→Validate transition entry; the three SDET Validate gate-record entries retained inline as canonical gate records, consistent with the retained Smoke/Plan records); updated `## Current initiative` to **CLOSE-PREP → Awaiting PR merge**; refreshed `## Awaiting PR merge` with the slice; appended this entry.
**Consistency gate — PASS.** All 8 BRIEF-005 task files `done` with every lifecycle field populated + valid (`Started-at`/`Completed-at`/`Complexity-estimate`/`Complexity-actual` all present; `Complexity-actual` ∈ 1–5 on all 8). Confirmed Audit Obs 1 (synthetic `Completed-at` inversion on -001..-004; forward-ordered on -005..-008) — observation, no gate failure. Tree clean at `d144716` (only ungated PROGRESS files modified); prior-epic demo PNGs confirmed reverted (clean).
**Archived:** all 8 task files moved `tasks/ → tasks/done/`. Zero active BRIEF-005 tasks remain.
**Retro:** `RETRO-005.md` written. **Zero findings cleared the concrete-quality-gate-failure promotion bar** (no SDET rejections, no smoke fail, no CI red, audit CLEAN). Recorded as observations: Audit Obs 1 (synthetic `Completed-at` — 5th clock-source occurrence), the `inventory.md` Track-B drift (missing `0004`/`0005` policy rows + Engagement/LetterTemplate entities), and the now-resolved comment-drift carries (Obs 2+3). **Cross-surface-parity sunset counter at 3 consecutive zero-finding Close-preps → rule surfaced for keep/remove per CLAUDE.md § Platform-frontend scope; IO recommendation KEEP.** `--no-verify` clause + `PushNotification` spam-loop guard: IO recommendation KEEP (both prophylactic, cheap).
**Comment-drift fixes (Audit Obs 2+3) — disposition recorded:** both are **comment-text-only edits in gated-path `packages/db` files** (engagement.ts ~L473 misleading "parameterised inputs" comment; service.rls.test.ts ~L71/~L88 stale `@read_only`/`ADR-003 §4` comments — the 4th carry). **Micro-dispatch judged disproportionate** for three comment lines (per the prior RETRO-002-Obs-3 disposition); the SDET-reviews-all-IO-code spirit is satisfied because the edits ride the slice PR and pass under the `/pr-review` panel at the reviewed lane. **Exact old→new edits handed to the main session** (gated-path edits + git are main-session-owned) — see the `## Next` block. I did not edit the gated-path source myself.
**Completion/handoff report:** `HANDOFF-005.md` written — 10/10 in-scope AC satisfied (evidence basis: SDET acceptance-validation + SDET CI gate + container smoke; required-CI confirmed at gate 8); net-new capabilities (first client-owned rows + first client-isolation policy, the `packages/esign` seam, the request-pool BLOCK-governed client write, the server-side gate, the editable template); out-of-scope honored; zero upstream items raised; the comment-drift carry resolved.
**End:** Close-prep exit condition met — RETRO + HANDOFF written, 8 task files archived, slice moved to `## Awaiting PR merge`, PR composed (title + body in the `## Next` block). **IO ends the invocation.** PR merge is the user-in-loop checkpoint (Autonomy Ceiling item 3 — reviewed lane). On merge → re-invoke the IO for Close-finalize (gate 8 post-merge CI; gate 9 N/A, `Brief-deploys: no`).

### IO Close-finalize — BRIEF-005 / EPIC-005 — 2026-06-18
**Start:** Resumed from PR limbo. **PR #48 squash-merged to `main` @ `f879da2`** (`gh pr merge 48 --squash --delete-branch`, Lane B reviewed lane, no protection toggle). Ran Close-finalize.
**Phase-transition reflex (Close-prep → Close-finalize):** swept the IO Close-prep session entry to `PROGRESS-ARCHIVE.md` (Close-prep→Close-finalize sweep marker; IO Plan Design record + Smoke gate-record + the three SDET Validate gate-records retained inline per the canonical-gate-record rationale); rewrote `## Current initiative` to **EPIC-005 DELIVERED / no active slice** (+ Phase-2 next-ready map + carried follow-ups); emptied `## Awaiting PR merge` (BRIEF-005 removed; PR #48 → `f879da2` added to the prior-delivered history); appended this entry.
**Gate 8 (post-merge CI) — PASS.** `main` @ `f879da2` — workflow `CI` = success AND `Code Quality: Push on main` (CodeQL) = success (verified GREEN by the main session). Required checks (`lint-and-typecheck`, `security-scan`) green post-merge.
**Gate 9 (post-merge staging smoke) — N/A.** `Brief-deploys: no`; production platform deferred per ADR-007, no staging environment.
**Reviewed-lane outcome:** PR #48 cleared two pre-merge CI hurdles — **nodemailer 9.0.1** security bump (GHSA-p6gq-j5cr-w38f) + **3 github-code-quality bot-thread cleanups**. The two comment-text-only doc-drift fixes (Audit Obs 2+3 — `engagement.ts` + `service.rls.test.ts`) rode the PR through the panel and merged → now **RESOLVED** (4th-carry retired).
**Post-merge bugs:** none — no `BUG-005-POST-*` files exist; no post-merge defects.
**RETRO-005 Post-Merge Addendum + final 9-gate scorecard detail written.** Carried follow-ups recorded: SEC-3 (per-connection SESSION_CONTEXT / `sp_reset_connection` defense-in-depth — tracked hardening); `inventory.md` Track-B drift (missing `0004`/`0005` policy rows + `Engagement`/`LetterTemplate` entities); synthetic `Completed-at` inversion (Obs 1, 5th occurrence). Marked RESOLVED: comment-drift + nodemailer. Cross-surface-parity sunset counter at 3 consecutive zero-finding Close-preps → surfaced for keep/remove; **IO recommendation KEEP**.
**Next-ready:** EPIC-006 (intake questionnaire) + EPIC-007 (initial document upload) now unblocked (both depend on the onboarding spine); EPIC-008 is the capstone (needs 005/006/007).
**Git boundary:** the IO did **not** commit. File edits made this invocation: `.implementation/tasks/PROGRESS.md`, `.implementation/tasks/RETRO-005.md`, `.implementation/tasks/PROGRESS-ARCHIVE.md`. The main session stages + commits these (docs-lane branch `chore/epic-005-close`) together with the Conductor's `/planning` validate COVERAGE/ROADMAP write-back into one docs-only close-out PR (Lane A — skips the panel, merges on green required CI).
**End:** Close-finalize exit condition met — gate 8 PASS recorded, gate 9 N/A, zero `BUG-005-POST-*`, Post-Merge Addendum written, slice removed from `## Awaiting PR merge`. **EPIC-005 finalized. `## Current initiative` has no active slice — IO eligible to Plan the next slice.** **IO ends the invocation.** (The Conductor handles the COVERAGE/ROADMAP write-back + the docs-only close-out PR + the run report.)
