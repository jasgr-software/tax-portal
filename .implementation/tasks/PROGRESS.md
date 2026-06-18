# Progress

> Single source of truth for current slice state, quality gates, active bugs, and retro action items. The IO
> and SDET update this file at the start and end of every invocation. Structure contract: see
> `.implementation/ENGINE.md` § PROGRESS.md structure contract.
>
> **Note (2026-06-14):** the implementation team was refactored into the standalone `.implementation/` layer
> (engine: `ENGINE.md` / `PHASES.md`; orchestrator: `AGENT.md` = the Implementation Orchestrator, `[io]`).
> The team consumes a self-contained build brief.

## Current initiative

**EPIC-006 — Intake questionnaire (per-service-type templates + client completion).** BRIEF-006 — **step 2 of
the onboarding sequence**, on top of the delivered EPIC-005 onboarding spine + letter gate. **Branch:**
`brief-006-intake-questionnaire` (from `main` @ `3dee2f1`). **Gated:** yes. **Brief-type:** feature ·
**Brief-deploys:** no. **Phase:** DISPATCH. **7 in-scope AC.**

**Dispatch progress (2026-06-18):** TASK-006-001 **SDET-APPROVED** (Status: done; `Completed-at: 2026-06-18T20:00:00Z`). HARD tier-3 isolation test independently re-run live: 7/7 PASS. Gate Authoring three-item evidence verified real. Substrate proven — schema, repos, `0006` policy, inventory.md Track-B drift resolved. **Next: dispatch TASK-006-002 (admin template UI) and TASK-006-003 (engagement→service-type resolution) on the proven substrate.** Nothing committed yet (main session owns git; changes in the working tree).

**Goal:** the accountant authors/maintains a **per-service-type** intake-questionnaire template in `apps/admin`
(the **first per-service-type template** — contrast EPIC-005's single global `LetterTemplate`); the client —
having passed the EPIC-005 letter gate — reaches step 2 in `apps/portal`, is shown the questionnaire **for their
engagement's service type** (resolved server-side), completes + submits, and their answers are **recorded against
the engagement** (the **second client-owned-row family**, with its own ADR-005 isolation policy
`db/policies/0006-*`). The questionnaire step is satisfied **only on submit**, evaluated server-side in the
EPIC-005 read model — and stays behind the letter hard gate (not weakened).

**Methodology:** gherkin (bind the epic's 7 scenarios; prose-bind until Cucumber tooling lands, per CLAUDE.md) ·
**e2e-required** both surfaces + `e2e:cross-app` (author→complete loop) · tier map per ADR-012 · **second
client-owned-rows ADR-005 isolation policy (HARD tier-3)** on the answer rows · correct-template-for-service-type
(tier-3) · step-satisfied-only-on-submit (tier-3, server-side) · SESSION_CONTEXT on all reads/writes
(ADR-003 Amendment 1) · cross-surface validate · container smoke before Validate.

**Tier map (from brief / epic sign-off contract):**
- **e2e (tier 6):** AC-DASH-012-01/-03 (admin authoring/editing), AC-ONBD-003-01 (correct questionnaire shown),
  AC-ONBD-003-03 (submit satisfies the step).
- **service integration (tier 3):** AC-ONBD-003-01 (service-type match server-side), AC-ONBD-003-04 (answers
  recorded), AC-DASH-012-02 (template↔service-type binding), + the **new client-isolation policy test** (ADR-005)
  on the answer rows.
- **unit/component (tier 2/5):** questionnaire rendering + the submit-state transition (not-satisfied→satisfied).

**Task list (7, dependency-ordered):**
| Task | Status | Impl | AC | Notes |
| ---- | ------ | ---- | -- | ----- |
| TASK-006-001 schema (QuestionnaireTemplate per-service + QuestionnaireAnswer + `Engagement.questionnaireSubmittedAt`) + SECOND client-isolation policy (`0006`) + tier-3 isolation tests | **done** | webapp-developer | ONBD-003-04 / DASH-012-02 / ONBD-003-02 (DB substrate) | **Introduces-gate: yes** (SECOND client-owned-rows `sec.pol_QuestionnaireAnswer` — three-item evidence + HARD tier-3 CLIENT-A≠CLIENT-B). Template write-predicate mirrors `fn_service_write_access` (accountant-only, no FILTER). SDET-APPROVED 2026-06-18T20:00:00Z |
| TASK-006-002 admin template-management UI + actions (create / bind-to-service / edit) | backlog | webapp-developer | DASH-012-01/-02/-03, ONBD-003-02 (dual-tagged) | `apps/admin` ONLY (ADR-006 fence); mirror EPIC-005 `letter-template/` (admin-pool, `getAccountantIdentity()` guard); per-service-type set, not single row |
| TASK-006-003 engagement→service-type resolution + correct-template read (tier-3) | backlog | webapp-developer | ONBD-003-01 (server-side match) | DECISION-F: primary service type = first selected by `sortOrder`,`id`; FILTER-governed engagement gate first; absent template → null |
| TASK-006-004 portal questionnaire step UI (render correct template behind the letter gate) | backlog | webapp-developer | ONBD-003-01 (UI), ONBD-003-03 (UI affordance) | `apps/portal`; consumes EPIC-005 read model `accessible`/`done`; **does NOT re-derive gate logic**; no client-supplied ids; locked/empty/submitted states |
| TASK-006-005 submit action (record answers + satisfy step) + read-model extension (tier-3) | backlog | webapp-developer | ONBD-003-03 (server-side satisfaction), ONBD-003-04 (recorded), ONBD-003-01 | extends `packages/db/src/onboarding.ts` (`done` from `questionnaireSubmittedAt`, DECISION-I); owner-only BLOCK-governed submit (mirror `recordLetterSignatureAsClient`); gate-checked refusal when unsigned |
| TASK-006-006 e2e + gherkin binding + cross-app (both surfaces) | backlog | webapp-developer | DASH-012-01/-03, ONBD-003-01/-03 (+ cross-app author→complete) | **E2e-required; Introduces-gate: advisory**; bind epic's 7 scenarios; real letter gate exercised; satisfy-on-submit 3× zero-flake |
| TASK-006-007 @demo gallery (admin authoring + portal completion) | backlog | webapp-developer | none (non-gating) | docs/demos/EPIC-006/; mirror TASK-005-008; write ONLY EPIC-006 PNGs (prior-epic PNG footgun) |

**Plan artifacts:** design-coherence check **PASS** (see Plan session entry below). Full field-level expansion of
the brief's `## Data & Interface Contract` recorded below + bound into TASK-006-001/-002/-003/-005. IO Design
DECISIONs: **F** (primary service-type resolution = first selected by `sortOrder`,`id`), **G** (template as
per-`Service` row, `questions` serialized JSON; accountant-owned, no FILTER), **H** (answers as second
client-owned-row family, one-per-engagement, `0006` isolation policy), **I** (`Engagement.questionnaireSubmittedAt`
column — onboarding state on `Engagement`, DECISION-B family). **No new OPEN-QUESTION raised** — ADR-005 already
names `IntakeTemplate` as a planned accountant-managed/client-readable catalog table; the isolation *mechanism*
+ its per-policy test land here, the AUTH-003 *feature* AC remain Phase-3-owned (planning-flagged in brief/epic,
not an IO invention). All five cited ADRs (003/004/005/006/012) are Accepted and govern the slice end-to-end.

**Reuse (surveyed live):** `db/policies/0005-engagement-policy.sql` (the ownership-join seam to mirror for the
answer-row policy); `db/policies/0002-service-readable.sql` `fn_service_write_access` (the accountant-only
write predicate to mirror for the template); `packages/db/src/repositories/engagement.ts`
`recordLetterSignatureAsClient` (request-pool, in-batch SESSION_CONTEXT, BLOCK-governed client write — the
submit primitive's template) + `getMyEngagement` (no-arg FILTER-governed read); `packages/db/src/onboarding.ts`
(the read model — `intake-questionnaire` step `done` is the documented EPIC-006 extension point); `letter-template.ts`
+ `apps/admin/.../settings/letter-template/` (the accountant template-editor + actions to mirror for
per-service-type templates); `apps/portal/.../onboarding/` `LetterSignStep.tsx`/`OnboardingSequence.tsx` (the
step-component + sequence-slot pattern); `packages/db` `withRequestContext` + `$extends` SET hook (ADR-003);
`engagement.client-isolation.rls.test.ts` (the HARD tier-3 isolation-test harness to mirror).

**Carried follow-ups (from EPIC-005 close / prior retros / STATE — may resurface, not slice-blocking):**
**`inventory.md` Track-B drift** (missing `0004`/`0005` policy rows + Engagement/LetterTemplate entities —
**enumerate at TASK-006-001**, which adds `0006` + new entities; natural carrier); **SEC-3** per-connection
SESSION_CONTEXT/`sp_reset_connection` hardening (tracked, not a defect); **synthetic `Completed-at` inversion**
(capture real clock values this slice); the `sqlserver` healthcheck SA-password mismatch + clean-volume
bootstrap/P3019 (infra, surfaces at Smoke). Cross-surface-parity sunset counter at 3 zero-finding Close-preps
(EPIC-005 IO recommendation KEEP — re-evaluate at this slice's Close-prep).

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

---

### IO Plan — BRIEF-006 / EPIC-006 — 2026-06-18
**Start:** New slice (EPIC-005 delivered + finalized; `## Awaiting PR merge` empty — slice-start gate clear; active bugs none; retro items all dispositioned observations). Conductor handed `.implementation/briefs/BRIEF-006-intake-questionnaire.md` (7 AC, gherkin, e2e-required both surfaces, carries a `## Data & Interface Contract`). Ran Plan: Ingest → Clarify → Design (full field-level contract expansion + DECISIONs F–I) → Docker pre-flight → branch → Decompose.
**Phase-transition reflex (slice-start):** appended a BRIEF-005-close→BRIEF-006-Plan sweep marker to `PROGRESS-ARCHIVE.md` (EPIC-005 delivery detail + all gate-records retained in git history + archived task files + RETRO-005/HANDOFF-005); rewrote `## Current initiative` for BRIEF-006 (7 tasks, tier map, DECISIONs, reuse survey); `## Awaiting PR merge` already empty; carried EPIC-005 follow-ups forward; appended this entry.
**Docker pre-flight:** PASS — `docker info` → daemon up (main session pre-verified; IO re-confirmed).
**Context pre-flight:** `/compact` — the Conductor handed this invocation fresh; the IO requests the user run `/compact` before the first Dispatch turn if context pressure appears.
**Branch:** `brief-006-intake-questionnaire` created from `main` @ `3dee2f1`. (The two uncommitted non-gated files — `.orchestration/STATE.md`, `.planning/EPIC-002-*.md` — are Conductor/planning artifacts; NOT part of this slice; will NOT be committed to the feature branch.)

**Ingest / Clarify — 7 AC all testable, traced to scenarios + tiers:**
- REQ-ONBD-003 (templated per service type): AC-ONBD-003-01 (tier-6 e2e + tier-3 server-side match), -02 (tier-3 distinct-per-service + dual-tagged admin), -03 (tier-6 e2e + tier-3 server-side satisfaction + tier-2 submit-state), -04 (tier-3 recorded against engagement).
- REQ-DASH-012 (admin template mgmt): AC-DASH-012-01 (tier-6 e2e create), -02 (tier-3 service-type binding), -03 (tier-6 e2e edit). Dual-tag note honored (AC-ONBD-003-02 ≡ DASH-012 admin capability — a single admin test may carry both tags).
- Methodology recorded: gherkin (bind epic's 7 scenarios, prose-bind) · e2e both surfaces + cross-app · extra gates: ADR-005 second client-isolation (HARD tier-3) on answer rows, correct-template-for-service-type (tier-3), step-satisfied-only-on-submit (tier-3 server-side), behind-the-letter-gate (not weakened), SESSION_CONTEXT both principals, cross-surface validate, container smoke.

**Design — full field-level expansion of the brief's `## Data & Interface Contract` (binding ref; bound into TASK-006-001/-002/-003/-005):**
- **`QuestionnaireTemplate` (NEW, dbo, accountant-owned, per `Service`) — DECISION-G:** `id UNIQUEIDENTIFIER PK NEWSEQUENTIALID()`; `serviceId UNIQUEIDENTIFIER NOT NULL UNIQUE` FK→`Service` (`NoAction`; at-most-one-template-per-service-type = AC-ONBD-003-02/DASH-012-02); `questions NVARCHAR(MAX) NOT NULL` = serialized JSON array `[{id,prompt,type:'text'|'textarea',required}]` (serialized over structured rows — v1 static, mirrors `LetterTemplate.content`); `updatedBy NVARCHAR(64) NULL` (accountant clerkId); `createdAt/updatedAt DATETIMEOFFSET`. **No seeded default** (brief: absent template is acceptable starting state — unlike EPIC-005 letter AC-IDNT-007-01). Write boundary: accountant-only `sec.fn_questionnaire_template_write_access` (mirror `fn_service_write_access`); **no client FILTER** (clients read template *content* at step 2 via admin pool, like `getCurrentLetterTemplate`).
- **`QuestionnaireAnswer` (NEW, dbo, SECOND client-owned-row family) — DECISION-H:** `id PK`; `engagementId UNIQUEIDENTIFIER NOT NULL UNIQUE` FK→`Engagement` (`NoAction`; one submission per engagement v1; AC-ONBD-003-04 "recorded against the engagement"); `templateId UNIQUEIDENTIFIER NOT NULL` FK→`QuestionnaireTemplate` (captures the answered template); `answers NVARCHAR(MAX) NOT NULL` = serialized JSON `{[questionId]:string}`; `submittedAt/createdAt/updatedAt`. Client-owned + isolated under `0006`.
- **`Engagement.questionnaireSubmittedAt DATETIMEOFFSET NULL` (NEW column) — DECISION-I:** NULL = step-2 unsatisfied; non-null = satisfied. Single source of truth for the read-model `intake-questionnaire` step `done`. Set in the same submit write as the answer row. DECISION-B family (onboarding state as columns on `Engagement`).
- **`db/policies/0006-questionnaire-policy.sql` (NEW — SECOND client-isolation policy):** mirror `0005`. `sec.fn_questionnaire_answer_access(@answerEngagementId)` ITVF+SCHEMABINDING, three branches (admin / ACCOUNTANT all / **CLIENT-ownership** via `clerk_user_id`→`User`→`Engagement.clientUserId`, keyed on the answer row's `engagementId`); null SESSION_CONTEXT / null clientUserId → ZERO (fail-closed). `sec.pol_QuestionnaireAnswer` = FILTER([engagementId]) + 4 BLOCK. `sec.pol_QuestionnaireTemplate` = 4 BLOCK only (no FILTER; accountant-managed) using `fn_questionnaire_template_write_access([serviceId])`. **HARD tier-3 three-item gate** on the answer rows: CLIENT-A≠CLIENT-B; anonymous=ZERO; ACCOUNTANT=all (+ CLIENT cannot write another's answers; CLIENT cannot write a template).
- **Service-type resolution — DECISION-F:** `Engagement → EngagementRequest → EngagementRequestService → Service` (request may select MULTIPLE services). v1 keys one questionnaire to one type → primary service type = **first selected ordered by `Service.sortOrder` ASC, then `id` ASC** (deterministic, documented as `// DECISION-F`). Resolution server-side; engagement-ownership FILTER runs FIRST (client must own the engagement before any template resolves); absent template → `template:null` (no throw). No client-supplied serviceId/templateId/engagementId.
- **Submit contract:** owner-only, request-pool, BLOCK-governed (mirror `recordLetterSignatureAsClient`): one logical op writes the `QuestionnaireAnswer` row + sets `Engagement.questionnaireSubmittedAt`; `rowsAffected=0` → refusal (no satisfaction, no audit for a non-event). Gate-checked: `checkStepAccessibility(engagement,'intake-questionnaire')` refuses when letter unsigned (EPIC-005 gate not weakened).
- **Read-model extension (`packages/db/src/onboarding.ts`):** `intake-questionnaire` step `done` ← `engagement.questionnaireSubmittedAt != null` (replaces the EPIC-005 `done:false` placeholder + comment "EPIC-006 owns the done flag"). `accessible` UNCHANGED (still `letterSignedAt`-gated). `document-upload` `done` stays false (EPIC-007 owns).
- **`// DECISION:`s for developers (recorded, to appear in code):** **F** primary service-type resolution; **G** per-service template + serialized-JSON questions, accountant-owned no-FILTER; **H** answers as second client-owned-row family, one-per-engagement, `0006` policy; **I** `Engagement.questionnaireSubmittedAt` onboarding-state column.

**Architecture posture:** **No new OPEN-QUESTION.** ADR-005 already enumerates `IntakeTemplate` (the questionnaire template) as a planned accountant-managed/client-readable catalog table and the answer rows as client-owned — the isolation *mechanism* (the `0006` policy + its per-policy test) lands here; the AUTH-003 *feature* AC remain Phase-3-owned (already planning-flagged in brief + epic, not an IO invention). The shape decisions (F–I) are slice-local implementation calls within the cited ADRs — recorded as `// DECISION:`s, not raised.

**Design-coherence check vs. brief: PASS.** All 7 in-scope AC map to a task + tier; the per-service-type template (first of its kind), the second client-isolation policy + its HARD three-item test on the answer rows, server-side correct-template-for-service-type resolution, server-side step-satisfied-only-on-submit, behind-the-letter-gate honor, SESSION_CONTEXT on both principals, and the two-surface split (admin authoring / portal completion) are all bound into task specs. Out-of-scope fenced (dynamic/conditional organizer logic REQ-ONBD-008 v2, the document-upload step EPIC-007, onboarding completion EPIC-008, lifecycle pipeline Phase 3, AUTH-003 feature AC, accountant answer-review UI Phase 4).

**Decompose:** 7 tasks, dependency-ordered (see task table above). 001 introduces the gate (`yes` — SECOND client-owned-rows policy, three-item evidence + HARD isolation test); 006 advisory (questionnaire e2e suite); 007 non-gating demo. All `Impl: developer` (each touches multiple files / real debugging / cross-pool writes — none qualifies for `Impl: io`). All carry `**Acceptance criteria:**`, `**Upstream refs:**`, `**Introduces-gate:**`, `E2e-required`, `Brief-deploys: no`.
**End:** Plan exit condition met — branch created, 7 task files at `backlog` with all required fields, methodology + tier map recorded, full Data-&-Interface-Contract expansion + DECISIONs F–I bound into specs, design-coherence PASS, PROGRESS.md `## Current initiative` populated. → **Dispatch** (TASK-006-001 first; dependency-free root: schema + second client-isolation policy + tier-3 isolation tests).


### SDET Review — TASK-006-001 — BRIEF-006 — 2026-06-18T20:00:00Z
**Start:** Review of TASK-006-001 (gate-introducing root: `QuestionnaireTemplate` per-service + SECOND client-owned-rows `QuestionnaireAnswer` + `Engagement.questionnaireSubmittedAt` + `db/policies/0006-*` + tier-3 isolation/persistence tests). `Introduces-gate: yes`.
**Actions:**
- Docker pre-flight: PASS — `docker info` → 29.4.1, `tax-portal-sqlserver` up (unhealthy SA-password carried per precedent; app principals operational via port 14330).
- Mandatory rejection checks: all PASS (pre-implementation Work Log entry present; `Started-at: 2026-06-18T19:22:11Z` real timestamp; `Complexity-estimate: 4` / `Complexity-actual: 4` both ∈ 1–5; all required task-spec fields present; no tool-hygiene violations; submission gate evidence recorded).
- Gate Authoring three-item evidence (ENGINE.md § Gate Authoring Rules — `Introduces-gate: yes`): VERIFIED. (1) Run marker + exact test names + "7 passed (7)" real output. (2) Named code path = CLIENT-ownership EXISTS branch in `sec.fn_questionnaire_answer_access` (`db/policies/0006-questionnaire-policy.sql` lines 105–110). (3) Dual counterfactual (removing EXISTS branch fails positive; removing FILTER fails isolation). All three real and specific.
- HARD tier-3 isolation test re-run independently against live `tax-portal-sqlserver`: `pnpm --filter @tax-portal/db test -- src/questionnaire-answer.client-isolation.rls.test.ts` → **7/7 PASS (226ms)**. All ADR-005 §6 required cases present and passing: CLIENT-A reads own (1 row); CLIENT-B sees ZERO for CLIENT-A; null SESSION_CONTEXT = ZERO; ACCOUNTANT reads both; CLIENT cannot UPDATE another client's answers (rowsAffected=0, admin read-back unchanged); CLIENT cannot INSERT QuestionnaireTemplate (no CLIENT branch → blocked); admin pool reads both (RLS-exempt).
- Ownership-join correctness: `fn_questionnaire_answer_access` joins `User.clerkId → Engagement.clientUserId → Engagement.id = @answerEngagementId`. NULL SESSION_CONTEXT → fail-closed (CAST(NULL) matches no clerkId). NULL clientUserId → fail-closed (DECISION-A — unassigned engagement invisible). Both confirmed by tests 2/3.
- Template write-boundary: `fn_questionnaire_template_write_access` mirrors `fn_service_write_access` (admin + ACCOUNTANT, NO CLIENT branch, fail-closed). `pol_QuestionnaireTemplate` BLOCK only, NO FILTER. Test 6 confirms CLIENT INSERT is blocked.
- ADR-003 Amendment 1: all `sp_set_session_context` calls use `@read_only = 0`. No `@read_only = 1` anywhere in new files.
- Schema conventions (ADR-002): `NEWSEQUENTIALID()` PKs; `DATETIMEOFFSET` timestamps; `@unique` on `QuestionnaireTemplate.serviceId` + `QuestionnaireAnswer.engagementId`; `onDelete: NoAction` on all FKs. All correct.
- Persistence tests re-run independently: `pnpm --filter @tax-portal/db test -- src/questionnaire.persistence.test.ts` → **6/6 PASS**. Template upsert create/update/distinct/null-missing verified; `submitQuestionnaireAnswer` records answer row + sets `questionnaireSubmittedAt`; uniqueness constraint enforced.
- Full suite: `pnpm --filter @tax-portal/db test` → **101/101 PASS (16 test files, 3.19s)**. All EPIC-005 tests regression-clean.
- `inventory.md` Track-B enumeration: `0004`/`0005`/`0006` all listed; Track-A entity table complete (`Engagement`, `LetterTemplate`, `QuestionnaireTemplate`, `QuestionnaireAnswer` + all prior). RETRO-005 carry actioned.
- AC coverage: AC-ONBD-003-04 (isolation + persistence), AC-DASH-012-02 (template upsert + serviceId binding), AC-ONBD-003-02 (one-per-service uniqueness), AC-ONBD-003-03 (questionnaireSubmittedAt = step satisfied) — all covered by tagged tests.
- Non-blocking semantic note: `submitQuestionnaireAsClient` `SELECT @@ROWCOUNT` captures UPDATE rowcount, not INSERT rowcount — functionally correct for v1 (deny case: both INSERT+UPDATE blocked → 0; success case: both succeed → 1). Consistent with `recordLetterSignatureAsClient` precedent. Not a defect.
- Atomic close: tick SDET Review box; SDET Review prose filled; approval breadcrumb appended to Work Log; `Status: review → done`; `Completed-at: 2026-06-18T20:00:00Z` (≥ `Started-at: 2026-06-18T19:22:11Z` — RETRO-005 carry honored).
**End:** TASK-006-001 **APPROVED**. The SECOND client-owned-rows isolation policy (`sec.pol_QuestionnaireAnswer`) is gate-introduced with full three-item evidence, independently HARD-tested live. Schema/repos/policy substrate proven. IO may dispatch TASK-006-002 (admin template UI) and TASK-006-003 (resolution) on this substrate.

### IO Dispatch — TASK-006-001 returned → SDET review — BRIEF-006 — 2026-06-18
**Start:** Resumed mid-Dispatch. TASK-006-001 (the gate-introducing root: `QuestionnaireTemplate` per-service + second client-owned-rows `QuestionnaireAnswer` + `Engagement.questionnaireSubmittedAt` + `db/policies/0006-*` + tier-3 isolation/persistence tests) returned at `Status: review` from webapp-developer.
**Actions:** Read core docs (ENGINE/PHASES/PROGRESS) + the full TASK-006-001 file. Confirmed: submission gate evidence present (lint/type-check/build PASS; 101/16 db tests incl. 7 HARD isolation + 6 persistence); Dispatch-Checkpoint pre-impl Work Log entry present with real `Started-at` (2026-06-18T19:22:11Z, no midnight sentinel — RETRO-005 carry actioned); `Complexity-actual: 4` in range; three-item Gate Authoring evidence present (run marker + named CLIENT-ownership EXISTS branch + dual counterfactual). Flipped TASK-006-001 `backlog`→`review` in the task table; recorded dispatch-progress note in `## Current initiative`.
**Dispatch ordering decision:** review TASK-006-001 **before** dispatching any of 002–005. It is the dependency-free root *and* the gate-introducer; tasks 002–005 all build on its schema/repos/policy. A policy or schema defect must be caught before three tasks layer on it. One-dispatch-per-turn honored.
**End:** Composed the single SDET review dispatch for TASK-006-001 (gate-intro focus: three-item evidence verification + HARD tier-3 isolation re-run against the real container + ownership-join fail-closed + template write-boundary + inventory.md Track-B enumeration). On return: if APPROVED → dispatch TASK-006-002 (admin template UI) and TASK-006-003 (resolution) can both follow on the now-proven substrate; if REJECTED → fix-forward dispatch to webapp-developer.
