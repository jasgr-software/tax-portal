# Progress

> Single source of truth for current slice state, quality gates, active bugs, and retro action items. The IO
> and SDET update this file at the start and end of every invocation. Structure contract: see
> `.implementation/ENGINE.md` § PROGRESS.md structure contract.
>
> **Note (2026-06-14):** the implementation team was refactored into the standalone `.implementation/` layer
> (engine: `ENGINE.md` / `PHASES.md`; orchestrator: `AGENT.md` = the Implementation Orchestrator, `[io]`).
> The team consumes a self-contained build brief.

## Current initiative

**BRIEF-008 / EPIC-008 — Onboarding completion (gate close → automatic New→In Progress transition → accountant
notified) — Phase: DISPATCH.** Branch `brief-008-onboarding-completion-transition` (off `main` @ `d49c984`).

> **Task status (2026-06-19, Dispatch — 001/002/003 done+committed; dispatching 004 e2e):** TASK-008-001
> **`done`** (SDET-APPROVED 22:11:00Z; committed `bac39eb`, code `ae3b20c`). TASK-008-002 **`done`**
> (SDET-APPROVED 17:17:00Z; committed `f443307`; `Complexity-actual: 1`). TASK-008-003 **`done`**
> (SDET-APPROVED 17:40:00Z — additive no-schema admin-pool read + notification-feed extension + status
> observable; all 6 binding focus areas passed; lint/type-check clean, admin 246/246, portal 172/172;
> `Complexity-actual: 2`; main session committed code + close; branch now current with main via merge
> `921fd1a`). **TASK-008-004 → `in-progress`** (e2e + cross-app — the full completion path across both
> surfaces; binds the epic's 8 gherkin scenarios; depends on 002+003, both done). **Docker pre-flight (IO
> side): PASS** — `docker info` OK; full stack up & healthy (portal :3000, admin :13001 [neighbor-squat
> remap], azurite :10000, sqlserver :14330). E2e is runnable here — no defer. TASK-008-005 (@demo)
> **`backlog`** (gated behind 004). **Resume:** re-invoke `/io` with the SDET 004 result inline → on APPROVE,
> main session commits 004, IO dispatches 005 (@demo); on REJECT, IO routes the enumerated fixes back to the
> developer. Conductor STATE.md mirrors this.
>
> **TASK-008-004 ESCALATION (2026-06-19, Review-phase intake):** developer flipped 004 → `review`
> (`Complexity-actual: 4`) and escalated a **pre-existing blocking defect**: the ADR-009 two-phase upload
> pipeline (browser PUT to Azurite → `completeUploadAction`) does not complete in this environment — checklist
> items stay `data-status="outstanding"` — blocking the **AC-ONBD-005-01 portal positive path** + the **EPIC-008
> cross-app spec** + 4 committed **EPIC-007** upload specs (`document-upload.spec.ts` 22–24,
> `document-upload-cross-app.spec.ts` 18). What DID pass: admin EPIC-008 4/4 (In Progress badge + notification
> identifying engagement+client), portal negative path 1/1 (incomplete stays New / no notification), security
> fail-closed (completion notif NOT visible to CLIENT), lint+type-check. **IO disposition: PROCEED-WITH-DISPOSITION
> (not a STOP).** Rationale: (1) **structural pre-existing proof** — `git diff origin/main...HEAD` shows the
> EPIC-007 upload specs are committed on `main` @ `eaa5875` and **unmodified by this branch**, and NO BRIEF-008
> code is in the upload-delivery path (the only `actions.ts` change is the +37-line contained best-effort
> `processOnboardingCompletion` trigger, SDET-verified at 17:17:00Z to NOT alter the upload success branch; the
> `packages/db` engine is additive new files). (2) **AC-ONBD-005-01 has tier-3 proof** —
> `onboarding-completion.integration.test.ts:485` "fulfilled DocumentRequest → document-upload step done →
> transitions" PASSED on the real container (SDET re-ran 14/14 @ 22:11:00Z); only the **browser-e2e tier** is
> env-blocked, and the block is in the EPIC-007 upload-delivery mechanism, not BRIEF-008. (3) **e2e is NOT a
> per-PR required CI check** (CLAUDE.md — pre-deploy gate only; required checks are `lint-and-typecheck` +
> `security-scan`), so an env-blocked e2e path does not block this slice's merge. **The "pre-existing" claim is
> load-bearing and is NOT accepted on the developer's word** — an SDET verification+review dispatch is composed to
> independently confirm (a) pre-existing vs regression, (b) environment vs code, and (c) whether the passing e2e
> (admin + negative + security) plus AC-ONBD-005-01's tier-3 proof suffice to approve 004, with the upload block
> dispositioned as a separate pre-existing infra **BUG-008-001** carried to retro. **STOP conditions** (would flip
> to needs-user-direction): SDET finds the upload failure IS a BRIEF-008 regression, OR finds a code (not
> environment) defect introduced this slice, OR cannot reproduce the failure on the committed tree with 004 specs
> stashed.
**Phase-2 capstone; the smallest Phase-2 slice (8 AC).** Goal: when an engagement's three onboarding steps are
all satisfied (letter signed — EPIC-005; questionnaire submitted — EPIC-006; required documents uploaded —
EPIC-007), the **system** marks onboarding complete, **automatically transitions the engagement New → In
Progress** (the single automatic transition in the lifecycle), and emits an **accountant-only in-portal
notification** identifying the engagement + client. Gated. `Brief-type: feature` · `Brief-deploys: no`.
Methodology: gherkin (8 epic scenarios) · e2e required (portal + admin + cross-app).

**Key design property — ZERO schema migration.** This slice introduces **no net-new entity, no new column, no
new RLS policy, no new provider seam**. It is **behavior over existing shapes**:
- `Engagement.status` already exists (`@default("New")`, `'New' | 'In Progress'`; schema comment already
  reserves the transition for EPIC-008). The transition is `New → In Progress`, fired once.
- The onboarding read model (`packages/db/src/onboarding.ts` `resolveOnboarding`) already computes all three
  step `done` flags (letter `letterSignedAt`; questionnaire `questionnaireSubmittedAt`; document-upload
  `allRequiredProvided` from `resolveChecklist`). **Onboarding complete = all three `done` flags true.** No
  re-derivation, no fork.
- The EPIC-003 `Notification` entity + the accountant-only `db/policies/0004-notification-policy.sql` +
  the admin notification feed already exist. The completion notification is a **new `type` value**
  (`onboarding_completed`), inserted on the admin pool (mirror EPIC-003's inlined `createEngagementRequest`
  notification INSERT), reusing the existing nullable `engagementRequestId` FK (Engagement is 1:1 with
  EngagementRequest) + a denormalized client-name title/body to identify engagement + client (AC-ONBD-007-02).
- The audit seam (`packages/db/src/audit.ts` `recordAuthEvent` / `withAuditTransaction`) already anticipates
  an `'engagement.transition'` action; the transition is recorded there (ADR-019).

**Design DECISIONS (IO Plan — see the IO Plan session entry below):**
- **D1 — completion is derived, not a stored flag.** No `onboardingCompletedAt` column. "Complete" = the three
  existing `done` flags all true; the persistent fire-once record IS the `status='In Progress'` value.
- **D2 — fire-once guard via the status precondition.** The privileged write is `UPDATE Engagement SET
  status='In Progress' WHERE id=@id AND status='New'`; only when `@@ROWCOUNT=1` do the notification INSERT +
  audit fire — so a re-evaluation of an already-In-Progress engagement is a guaranteed no-op (AC-ONBD-006-03),
  even under concurrency. The whole privileged step is ONE `withAuditTransaction` (atomic: transition +
  notification + audit commit/rollback together).
- **D3 — server-authoritative re-evaluation.** The privileged seam `processOnboardingCompletion(engagementId)`
  re-evaluates completion itself under the admin pool (loads engagement + checklist by id) — it does NOT trust
  a caller-passed boolean (EPIC-007 M1 lesson: re-assert server-side).
- **D4 — notification identifies engagement + client via the EngagementRequest 1:1 link + denormalized name**
  (no `engagementId` FK migration; mirrors EPIC-003's proven pattern; the prospect→client name is always
  present from EPIC-001's `EngagementRequest`).
- **D5 — trigger points.** `processOnboardingCompletion(engagement.id)` is invoked from the two portal actions
  that can be the *completing* step (`submitQuestionnaireAction`, `completeUploadAction`) — never letter-sign
  (steps 2/3 are still pending after the letter). The D2 guard makes double-invocation safe/idempotent.
  Completion processing is attempted after the step's own commit and best-effort (errors logged, not
  rolling back the committed step; the D2 guard makes a later retry idempotent).
- **D6 — admin notification surface.** `apps/admin/.../NotificationsIndicator.tsx` currently HARD-FILTERS to
  `new_engagement_request`; it is extended to also render `onboarding_completed` (AC-ONBD-007-01/-02,
  AC-MSG-013-04). A minimal read-only engagement-status display ("In Progress") is added to the existing admin
  per-engagement surface (`engagements/[engagementId]/document-requests/page.tsx`) so AC-ONBD-006-01 has a UI
  observable for the e2e — admin-side only (client-facing lifecycle labels remain Phase-3 out-of-scope).

**Tasks (5; dependency chain 001 → {002, 003} → 004 → 005):**
- **TASK-008-001** `[webapp-developer]` `Impl: developer` — **the completion engine** (`packages/db`): new
  `onboarding-completion.ts` — `isOnboardingComplete(model)` pure predicate (tier-2 truth table) +
  `processOnboardingCompletion(engagementId)` privileged atomic fire-once seam (admin-pool re-evaluation →
  status UPDATE WHERE status='New' → notification INSERT → audit, all in one `withAuditTransaction`) + the
  `onboarding_completed` type constant; barrel export. Tier-3 integration vs. the real DB (truth table;
  transition+notification+audit on complete; no-op on incomplete; fire-once no duplicate; accountant-only read
  / client+anon ZERO). **AC: AC-ONBD-005-01/-02, -006-01/-02/-03, -007-01/-02, AC-MSG-013-04.** Depends: none.
- **TASK-008-002** `[webapp-developer]` `Impl: developer` — **portal triggers**: invoke
  `processOnboardingCompletion(engagement.id)` from `submitQuestionnaireAction` + `completeUploadAction` after
  their success (D5). Additive; preserves each step's existing behavior + the EPIC-005 letter gate. Integration
  test that completing the last step drives the transition. **AC: AC-ONBD-006-01/-02, -007-01 (path).**
  Depends: 001.
- **TASK-008-003** `[webapp-developer]` `Impl: developer` — **admin surface**: render `onboarding_completed` in
  the notification feed (D6) + minimal engagement-status display. Component tests. **AC: AC-ONBD-006-01 (UI
  observable), -007-01/-02, AC-MSG-013-04.** Depends: 001.
- **TASK-008-004** `[webapp-developer]` `Impl: developer` — **e2e + cross-app**: bind the epic's 8 gherkin
  scenarios; the full path complete-three-steps (portal) → In Progress + accountant notification (admin) →
  cross-app. `E2e-required: yes`. **AC: all 8 (tier-6 coverage).** Depends: 002, 003.
- **TASK-008-005** `[webapp-developer]` `Impl: developer` — **@demo gallery** `docs/demos/EPIC-008/`
  (non-gating, DEMO-POLICY). **AC: none (demo artifact; justification: non-gating UI walkthrough).** Depends: 004.

**Backlog-triage gate (slice-kickoff): PASS** — `## Awaiting PR merge` empty; `## Active bugs` none; `## Open
retro action items` all carried as observations with explicit reasons (none block this slice).

**Cross-surface-parity sunset counter (CLAUDE.md § Platform-frontend scope):** 1 of 3 consecutive zero-finding
Close-prep retros (BRIEF-007 was the first clean slice). BRIEF-008 touches BOTH surfaces (portal triggers +
admin feed/status) — audit both at Audit/Review; a clean parity result advances the counter to 2 of 3.

## Awaiting PR merge

_None._ **BRIEF-007 / EPIC-007 cleared PR limbo 2026-06-19** — merged **PR #52 → `main` @ `eaa5875`** (Lane B,
user-approved); Close-finalize COMPLETE (gate 8 GREEN — CI `27844771147` + CodeQL `27844771086` both
`completed/success` @ `eaa5875`; gate 9 N/A; zero post-merge bugs). See `## Current initiative` + `RETRO-007.md
§ Post-Merge Addendum`.

Delivered (recent): **PR #52 `eaa5875`** (EPIC-007 — initial document upload, onboarding step 3),
**PR #50 `e55f8c5`** (EPIC-006 — intake questionnaire, onboarding step 2), PR #48 `f879da2`
(EPIC-005 — opens Phase 2), PR #42 `ec151cb` (EPIC-003), PR #40 `70ea10e` (EPIC-002), PR #38 `0444551`
(EPIC-004), PR #35 `f7f6c9d` (EPIC-001) — all merged. **Phase 1 (MVP) complete; Phase 2 (onboarding gate) open —
EPIC-005 + EPIC-006 + EPIC-007 delivered (steps 1 + 2 + 3); EPIC-008 (capstone) now UNBLOCKED (next ready).**

## Active bugs

_None active._ **BUG-007-001 (BRIEF-007) — admin e2e `document-requests.spec.ts` stale data-testid selectors —
CLOSED** (SDET-approved 2026-06-19; fix committed `414890f`; re-smoke 3/3 green; no production code changed) and
**archived to `tasks/done/` at Close-prep**; its fix rides the BRIEF-007 PR (classified `gated-path-fix` in
RETRO-007 item 1). File: `tasks/done/BUG-007-001-admin-e2e-document-requests-stale-testids.md`. The SDET's
midnight-sentinel close stamp is carried as part of the clock-domain `ungated-fix` family (RETRO-007 item 2).

_No other bugs active._ All four BRIEF-002 bugs SDET-approved, `done`, and **archived to `tasks/done/` at Close-prep
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
- **[gated-path candidate — BRIEF-007 Audit Obs 6] `adminDb` type-cast in
  `apps/admin/src/app/requests/[id]/page.tsx`** — the orphan-route nav fix (TASK-007-006) casts the admin db
  client to reach the engagement-by-request lookup. SDET-approved; advisory. Add a typed accessor on the
  `packages/db` admin client so the cast is not needed; rides the next `packages/db` task that touches this
  surface. (Observation — not promoted; no gate failure.)
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
- **[ungated-fix candidate — RETRO-006 item 3] `scripts/smoke-test.sh` defaults unsuitable for this project** —
  the script defaults `ADMIN_URL=http://localhost:3001` (not the project-remapped `:13001`) and its `sqlserver`
  readiness wait uses `sqlcmd -U sa -P "$MSSQL_SA_PASSWORD"`, which blocks on the carried SA-password/volume
  mismatch. SDET used the CLAUDE.md manual fallback at BRIEF-006 Smoke. Harden: default `ADMIN_URL` to `:13001`;
  derive/re-assert the SA password from the volume bootstrap source. Same root family as the `sqlserver`
  healthcheck item above. (Observation — not promoted; no gate failure.)
- **[ungated-fix candidate — RETRO-006 item 4] `@demo` prior-epic PNG byte-churn** — `@demo` runs rewrite
  prior-epic PNGs (3rd-ish occurrence; main session manually `git checkout`-reverts each slice). TASK-006-007
  itself was scope-disciplined (only EPIC-006 PNGs written); this concerns the *other* `@demo` specs' default
  output paths. Scope each `@demo` spec's screenshot output to its own `docs/demos/EPIC-NNN/` path so the manual
  revert isn't needed. (Observation — not promoted.)
- **[e2e-determinism — RETRO-006 item 5] AC-ONBD-001-01 (EPIC-005-owned) portal e2e flake** —
  `apps/portal/e2e/specs/onboarding.spec.ts:312` failed once at single-run in the full portal suite
  (`data-testid="onboarding-steps"` not found within 5000ms), passed on `--retries 1` at 259ms. File unmodified
  this branch (last touched `f879da2`/EPIC-005). Not a BRIEF-006 regression, not a BRIEF-006 AC. Investigate the
  `beforeEach`/onboarding-nav fixture timing for that describe block. (Non-blocking follow-up.)
- **[metric-integrity — RETRO-006 item 2 → ELEVATED at BRIEF-007 Audit] Clock-source `Completed-at`/`Started-at`
  inversion → `ungated-fix`** — recurred on **TASK-007-001..004** (developer agents wrote `Completed-at` during
  their submission-gate Work Log entry instead of leaving it blank for the SDET's atomic close; tasks 005–007
  were correctly SDET-authored/forward-ordered). This is the **7th+ occurrence** project-wide
  (RETRO-002/003/004/005/006 + BRIEF-007), meeting the RETRO-006 item-2 elevation threshold. **Disposition
  (BRIEF-007 Audit): `ungated-fix`** (Overwatch-recommended; IO-classified). **Fix:** amend
  `.implementation/agents/developer.md` (and/or the Dispatch-Checkpoint guidance) to **prohibit developer writes
  to `Completed-at`** — per the Task Metadata Contract, `Completed-at` is SDET-authored (or IO-as-reviewer for
  `Impl: io`) inside the atomic close edit only. **This is an ungated-path doc edit (quad-review workflow-file
  change); it does NOT ride the BRIEF-007 PR** — it rides a future docs/ungated change. Tracked here until that
  change lands.

---

### Sweep pointer — BRIEF-007 session entries archived (BRIEF-008 Plan-start) — 2026-06-19
At the EPIC-007→EPIC-008 slice boundary, all trailing BRIEF-007 inline session history (the Audit sweep pointer,
the IO Audit entry, the Close-prep→Close-finalize sweep pointer, and the IO Close-finalize entry — gate-8 CI
green @ `eaa5875`, gate-9 N/A, zero post-merge bugs, EPIC-008 unblocked) was **swept to `PROGRESS-ARCHIVE.md`**
(see "Sweep marker — BRIEF-008 Plan-start (new slice) — 2026-06-19"). Full per-entry text preserved in git
history at the BRIEF-007 commits + `RETRO-007.md` (incl. its `## Post-Merge Addendum`) + `HANDOFF-007.md` + the
archived `tasks/done/TASK-007-*` / `BUG-007-001` files. Only the new IO Plan entry below is retained inline.

---

### IO Plan — BRIEF-008 / EPIC-008 (onboarding completion — gate close, auto New→In Progress, accountant notified) — 2026-06-19
**Start:** New slice. **Slice-start gate CLEAR** (`## Awaiting PR merge` empty; `## Active bugs` none;
EPIC-007 DELIVERED + out of limbo). Build brief supplied:
`.implementation/briefs/BRIEF-008-onboarding-completion-transition.md` (8 AC; gherkin; e2e-required;
`Brief-type: feature`, `Brief-deploys: no`). Ingested the brief + its cited refs (REQ-ONBD-005/006/007,
REQ-MSG-013; ADR-003/005/006/012/019) + the brief's `## Data & Interface Contract`. **Context note:** this run
is driven by the Conductor (`/orchestrate EPIC-008`); the main session is the dispatch executor.
**Actions:**
- **Clarify:** all 8 AC are observable/testable and trace to the cited REQ sources verbatim; methodology
  recorded (gherkin acceptance format bound to the epic's 8 scenarios; e2e required on portal + admin +
  cross-app; tier map per ADR-012). No untestable AC → no escalation to the brief author.
- **Design (the live-seam survey + the binding contract):** read `packages/db/src/onboarding.ts`
  (`resolveOnboarding` already computes all three step `done` flags), `checklist.ts` (`resolveChecklist` →
  `allRequiredProvided`, vacuously satisfied when empty), `repositories/notification.ts` +
  `repositories/engagement-request.ts` (the EPIC-003 admin-pool inlined-notification INSERT pattern; standalone
  `createNotification` was removed), `audit.ts` (`recordAuthEvent`/`withAuditTransaction`; already anticipates
  an `'engagement.transition'` action), `repositories/engagement.ts` (`EngagementItem` carries
  `letterSignedAt`/`questionnaireSubmittedAt`/`status`/`engagementRequestId`/`clientUserId`; `status` default
  `New`, comment reserves the transition for EPIC-008; `clientUserId` nullable per DECISION-A), the portal
  onboarding actions (`submitQuestionnaireAction`/`completeUploadAction` both server-resolve `engagement.id` —
  the trigger points), `db/policies/0004-notification-policy.sql` (accountant-only read; null/CLIENT → ZERO),
  and the admin `NotificationsIndicator.tsx` (HARD-filters to `new_engagement_request` — needs extension).
  **Conclusion: ZERO schema migration** — no net-new entity/column/policy/provider seam. Recorded design
  DECISIONS D1–D6 (see `## Current initiative`): completion is derived (no marker column); fire-once via
  `UPDATE … WHERE status='New'` + `@@ROWCOUNT` inside one `withAuditTransaction`; server-authoritative
  re-evaluation in the privileged seam (EPIC-007 M1 lesson); notification identifies engagement+client via the
  EngagementRequest 1:1 link + denormalized name (no FK migration); trigger from the two completing portal
  actions only; admin feed extended + a minimal admin-side status observable.
- **Design-coherence check (local) — PASS:** every AC maps to a task; the design honors all five cited ADRs
  (ADR-003 server-side/admin-pool writes; ADR-005 reuse the accountant-only `0004` policy + a per-policy read
  test; ADR-006 admin surface; ADR-012 tier map; ADR-019 reuse the audit seam for `engagement.transition`); no
  conflict with the brief's `## Data & Interface Contract`; no genuinely-upstream shape question → nothing
  raised to `OPEN-QUESTIONS.md`. The brief's "no new entity" intent is consistent with the live schema.
- **Branch:** created `brief-008-onboarding-completion-transition` off `main` @ `d49c984`.
- **Decompose:** created 5 task files (TASK-008-001..005) — dependency chain 001 → {002, 003} → 004 → 005;
  each carries `**Acceptance criteria:**`, `**Upstream refs:**`, `**Introduces-gate:**`, `Impl`, `E2e-required`,
  `Brief-type: feature`, `Brief-deploys: no`. All `Status: backlog`.
- **Docker pre-flight:** deferred to the first e2e dispatch wave (TASK-008-004) per the brief's e2e mandate —
  the db/portal/admin unit+integration tasks (001–003) run without the container e2e stack; 004 is the first
  e2e-gated task and will pre-flight Docker then.
- Ran the phase-transition reflex (swept BRIEF-007 trailing entries to the archive; rewrote
  `## Current initiative` to BRIEF-008 / Plan; appended this entry).
**End:** Plan COMPLETE (exit condition met: slice-start gate clear; brief ingested + every task traces to
testable AC; methodology recorded; branch created; 5 task files at `backlog` with all required fields;
design-coherence PASS; PROGRESS.md `## Current initiative` populated). → **Dispatch.** Composing ONE
`## Next Dispatch` for **TASK-008-001** (the completion engine in `packages/db`) — the dependency root of the
slice. Cross-surface default (CLAUDE.md § Platform-frontend scope) applies from TASK-008-002 onward.

---

### SDET Review — TASK-008-001 — 2026-06-19T22:11:00Z
**Start:** TASK-008-001 at `review`; SDET spawned to review the onboarding-completion engine.
**Actions:**
- Docker pre-flight: Docker 29.4.1 available; `tax-portal-sqlserver` healthy (Up 4 hours).
- Independently re-ran tier-2 predicate (10/10 PASS), tier-3 integration (14/14 PASS, real SQL Server), portal (168/168 PASS), admin (223/223 PASS), lint (clean), type-check (clean).
- Walked all mandatory focus areas: fire-once (two calls → 1 notification + 1 audit row — PASS), atomicity (ONE `withAuditTransaction` — PASS), accountant-only read (ACCOUNTANT reads ≥1; CLIENT reads 0; null-SESSION_CONTEXT reads 0 — PASS), server-authoritative re-evaluation (no caller boolean — PASS), no re-derivation (delegates to `resolveOnboarding` — PASS), no migration artifacts (git diff confirms — PASS).
- ADR-003 Amendment 1 honored (`@read_only = 0`). ADR-005 reuses `0004` policy (no new policy). ADR-019 uses `recordAuthEvent`/`withAuditTransaction`. ADR-012 tier map honored.
- Task spec required fields all present. Metadata contract: `Complexity-actual: 4` valid; `Completed-at` was correctly blank.
- Pre-existing 2 failures in `document.upload-pipeline.rls.test.ts` confirmed pre-existing on `origin/main`.
- Atomic close edit performed: SDET Review box ticked, Decision: approved, `Completed-at: 2026-06-19T22:11:00Z`, `Status: done`.
**End:** **TASK-008-001 APPROVED.** TASK-008-002 and TASK-008-003 are now UNBLOCKED for dispatch.

---

### IO Dispatch (checkpoint — user-requested pause) — BRIEF-008 / EPIC-008 — 2026-06-19
**Start:** Dispatch phase. TASK-008-001 (completion engine) dispatched to a `[webapp-developer]`.
**Actions:** TASK-008-001 is **implemented and at `review`** — `packages/db/src/onboarding-completion.ts`
(`isOnboardingComplete` predicate + `processOnboardingCompletion` privileged fire-once seam +
`NOTIFICATION_TYPE_ONBOARDING_COMPLETE`), `onboarding-completion.predicate.test.ts` (tier-2 truth table),
`onboarding-completion.integration.test.ts` (tier-3), and the `packages/db/src/index.ts` barrel export. The
developer ticked the submission-gate boxes (lint/type-check/build/tests + security review) and set
`Started-at` + `Complexity-actual: 4`. **NOT yet committed and NOT yet SDET-reviewed** — `Completed-at` is
correctly still blank. The user requested a **pause** before the SDET review dispatch.
**End:** **PAUSED at a clean Dispatch checkpoint.** No guardrail/inner-stop fired — this is a user-requested
pause, not an escalation. Slice state is durable: the task files carry the spec + the developer Work Log; the
implementation sits uncommitted on `brief-008-onboarding-completion-transition`. **Next on resume:** spawn the
**SDET** to review TASK-008-001 (verify the fire-once `@@ROWCOUNT` guard, the atomic `withAuditTransaction`,
the accountant-only-read tier-3 test, and no schema migration); on approval, the main session commits 001,
then Dispatch continues with TASK-008-002 + -003 (parallel; depend on 001), -004 (e2e), -005 (@demo).

---

### IO Dispatch (resume — TASK-008-001 approved; dispatching TASK-008-002) — BRIEF-008 / EPIC-008 — 2026-06-19
**Start:** Re-invoked with the SDET TASK-008-001 result inline: **APPROVED** (22:11:00Z). Independently-run
gate evidence verified — predicate 10/10, integration 14/14 (real container), fire-once (2 calls ⇒ 1
notification + 1 audit), atomicity (ONE `withAuditTransaction`), accountant-only read (ACCOUNTANT ≥1 / CLIENT
0 / null-SESSION_CONTEXT 0 — ADR-005 §6), server-authoritative re-eval, no re-derivation, zero schema
migration, portal 168/168, admin 223/223, lint+type-check clean. SDET atomic close done; main session committed
the close edit `bac39eb` (code in WIP `ae3b20c`). TASK-008-002 + -003 now UNBLOCKED.
**Actions:**
- Re-read both downstream task specs (002 portal triggers, 003 admin surface) + the brief. Confirmed
  **file-disjointness:** 002 touches only `apps/portal/src/app/onboarding/actions.ts` + `actions.test.ts`; 003
  touches `apps/admin/.../NotificationsIndicator.tsx`, the admin `document-requests/page.tsx`, an admin
  notifications test, and (only if needed) a NEW additive `packages/db` admin-pool engagement-status read. Zero
  shared mutable file. Both depend only on the now-committed 001. They are genuinely parallelizable; per the
  one-dispatch-per-invocation contract I emit them in sequence (002 now, 003 on re-invocation).
- Cross-surface obligation (CLAUDE.md § Platform-frontend scope): 002 = the portal half, 003 = the admin half;
  the cross-app path itself is exercised by 004. Each task is correctly single-surface-scoped by name in its
  spec, so the both-surfaces default is satisfied across the 002+003 pair (not within either task).
- Phase-transition reflex: updated `## Current initiative` task status (001 done/committed; 002 in-progress;
  003 unblocked-next); flipped TASK-008-002 → `in-progress`; appended this entry.
**End:** Dispatch continues. Composing ONE `## Next Dispatch` for **TASK-008-002** (`[webapp-developer]`,
`Impl: developer`). On its SDET approval, dispatch TASK-008-003, then 004 (e2e; Docker pre-flight), then 005
(@demo). E2e-required is `no` for both 002 and 003 (their behavior is covered by portal/admin
integration+component tests; the full e2e path is 004).

---

### SDET Review — TASK-008-002 — 2026-06-19T17:17:00Z
**Start:** TASK-008-002 at `review`; SDET spawned for gate-2 approval (portal completion triggers).
**Actions:**
- Startup checklist: ENGINE.md, sdet.md, PROGRESS.md, task file, brief AC binding (AC-ONBD-006-01/-02, AC-ONBD-007-01 path), upstream refs (ADR-003, ADR-006) all read.
- Scope discipline (diff): `git diff --name-only HEAD` returns exactly `apps/portal/src/app/onboarding/actions.ts`, `apps/portal/src/app/onboarding/actions.test.ts`, the two task/PROGRESS files. Zero `packages/` changes. `signEngagementLetterAction` code confirmed untouched. PASS.
- Focus area 1 (server-resolved id, ADR-003): both `submitQuestionnaireAction` (L614) and `completeUploadAction` (L1105) call `processOnboardingCompletion(engagement.id)` where `engagement` is the object resolved by `withRequestContext` + `getMyEngagement()` — never a client-supplied argument. PASS.
- Focus area 2 (best-effort containment, D5): each call is wrapped in `try { await processOnboardingCompletion(...) } catch (completionErr: unknown) { console.error(...) }` placed AFTER `revalidatePath` and AFTER the action's own success branch. The D5 containment test (line 1076) forces `mockProcessOnboardingCompletion.mockRejectedValue(new Error(...))` and asserts `result.success === true` AND that the mock was called — this is a real counterfactual that would fail if the catch were absent. `console.error` output visible in test run confirms the catch fired. PASS.
- Focus area 3 (scope — `signEngagementLetterAction` untouched): text confirmed at lines 245–341 in `actions.ts`; no call to `processOnboardingCompletion` anywhere in that function. Scope-discipline test (line 1094) asserts `mockProcessOnboardingCompletion` not called after a successful sign — PASS.
- Focus area 4 (AC-path test tags): all 4 required tests present in `describe("TASK-008-002 — completion trigger wiring")` (lines 1042–1112): questionnaire→completion with server-resolved id (L1044); upload→completion with server-resolved id (L1058); D5 error containment with forced throw (L1076); letter-sign scope discipline (L1094). Each `toHaveBeenCalledWith(ENGAGEMENT_ID)` asserts the specific server-resolved id constant, not merely that the mock was called. PASS.
- Metadata contract: `Complexity-actual: 1` (valid 1–5); `Complexity-estimate: 2` set; `Started-at: 2026-06-19T22:09:59Z` set; `Completed-at` correctly blank. PASS.
- Pre-impl Work Log entry present: `2026-06-19T22:09:59Z` entry documents status flip, TDD plan, complexity-estimate — satisfies Dispatch Checkpoint. PASS.
- Required spec fields: `**Acceptance criteria:**`, `**Upstream refs:**`, `**Introduces-gate:**` all present. PASS.
- Mandatory Quality Gate boxes: Work Log, Submission Gate, Targeted e2e [N/A], Security Review — all ticked. SDET Review unticked (pending this close). PASS on all mandatory ticked boxes.
- Gate re-runs (independent): `pnpm lint` — clean (portal + admin zero warnings). `pnpm type-check` — clean (all packages + apps). `pnpm --filter portal test -- src/app/onboarding/actions.test.ts` — **55/55 PASS**. `pnpm --filter portal test` — **172/172 PASS**, zero regressions.
- Introduces-gate: `no` — no Gate Authoring Rules evidence required.
- No upstream ADR violations: ADR-003 (server-authoritative id, no client trust) — PASS; ADR-006 (portal surface, additive only) — PASS.
**End:** **TASK-008-002 APPROVED.** Atomic close edit applied to task file.

---

### IO Dispatch (TASK-008-002 implemented → routed to SDET review) — BRIEF-008 / EPIC-008 — 2026-06-19
**Start:** Re-invoked with the TASK-008-002 implementer result inline: developer **completed**, status flipped
`in-progress → review`, all submission-gate boxes ticked. `apps/portal/src/app/onboarding/actions.ts` calls
`processOnboardingCompletion(engagement.id)` (server-resolved id) after commit+revalidate in both
`submitQuestionnaireAction` and `completeUploadAction` (best-effort try/catch + `// DECISION:` comments);
`signEngagementLetterAction` unchanged. `actions.test.ts` adds 4 tests (questionnaire→completion;
upload→completion; thrown-error containment; letter-sign no-call). Gates: lint clean, type-check clean,
portal 172/172. `Complexity-actual: 1`; `Completed-at` blank. Changes **uncommitted** in working tree (001
committed `bac39eb`).
**Actions:**
- Read the TASK-008-002 spec + its SDET Review focus areas + the brief AC binding (AC-ONBD-006-01/-02,
  AC-ONBD-007-01 path). Verified the task is at `review` with submission gate ticked, `Complexity-actual: 1`
  (valid 1–5), `Completed-at` correctly blank.
- Composed the **gate-2 SDET dispatch** (server-resolved id per ADR-003; best-effort containment D5;
  scope discipline — letter-sign + `packages/db`/letter-gate/questionnaire/upload internals untouched; no e2e
  for this task; AC-path tags present; independent re-run of lint/type-check/portal test on the working tree
  that holds 002's uncommitted changes; metadata-contract gate; atomic-close-on-approve / reject-with-reasons;
  **SDET does NOT commit** — main session commits after approval).
- Phase-transition reflex: updated `## Current initiative` task status (002 → review, SDET dispatch composed);
  appended this entry.
**End:** Dispatch continues — **TASK-008-002 routed to SDET review**. On APPROVE: main session commits 002
(code + close edit), IO dispatches TASK-008-003 (admin surface). On REJECT: IO routes the enumerated fixes back
to the `[webapp-developer]`. Composing ONE `## Next Dispatch` for the SDET review of TASK-008-002.

---

### IO Dispatch (TASK-008-002 approved + committed; dispatching TASK-008-003 — admin surface) — BRIEF-008 / EPIC-008 — 2026-06-19
**Start:** Re-invoked with the SDET TASK-008-002 result inline: **APPROVED** (17:17:00Z). Independently-run
gate evidence verified — `pnpm lint` clean, `pnpm type-check` clean, `actions.test.ts` 55/55, full portal
172/172, zero regressions; all four focus areas pass (server-resolved engagement id per ADR-003; real D5
error-containment counterfactual; scope discipline — only the two portal files changed, `packages/` untouched,
`signEngagementLetterAction` untouched; AC-path test tags assert the id argument); metadata gate clean
(`Complexity-actual: 1`). **Main session committed 002 (code + SDET close) as `f443307`.** Tasks 001 + 002 now
`done` and committed on `brief-008-onboarding-completion-transition`. One carried non-blocking observation: the
recurring clock-inversion (SDET `Completed-at` earlier than developer `Started-at`) — the existing PROGRESS.md
`ungated-fix` retro item (RETRO-006 item 2 → elevated at BRIEF-007), not a gate failure.
**Actions:**
- Re-read the TASK-008-003 spec + the brief (D6: admin `NotificationsIndicator.tsx` HARD-filters to
  `new_engagement_request` and must also render `onboarding_completed`; a minimal read-only "In Progress"
  engagement-status display on the existing admin per-engagement surface so AC-ONBD-006-01 has a UI observable).
- Confirmed the live anchor: `apps/admin/src/app/requests/_components/NotificationsIndicator.tsx` filters on
  `NOTIFICATION_TYPE_NEW_REQUEST` (L56) and keys list/empty rendering to `newRequestNotifs`;
  `NOTIFICATION_TYPE_ONBOARDING_COMPLETE` is exported from the `@tax-portal/db` barrel (`index.ts` L233, value
  `"onboarding_completed"`, added by TASK-008-001).
- **Dependency check:** 003 depends only on 001 (`done`, committed). File-disjoint from the now-committed 002
  (002 = portal `onboarding/actions.ts`; 003 = admin component + admin engagement page + admin test + optional
  additive `packages/db` admin-pool status read). Cross-surface (CLAUDE.md § Platform-frontend scope): 003 is
  the **admin half** of the slice; 002 was the portal half; the cross-app path is TASK-008-004 — so 003 itself
  carries **admin component/unit tests** (`E2e-required: no`), not e2e.
- Phase-transition reflex: updated `## Current initiative` task status (001+002 done/committed; 003
  in-progress; 004/005 backlog); flipped TASK-008-003 → `in-progress`; appended this entry.
**End:** Dispatch continues. Composing ONE `## Next Dispatch` for **TASK-008-003** (`[webapp-developer]`,
`Impl: developer`). On its SDET approval: main session commits 003, IO dispatches TASK-008-004 (e2e +
cross-app — **Docker pre-flight fires here**, the first e2e-gated task), then 005 (@demo).

---

### SDET Review — TASK-008-003 — 2026-06-19T17:40:00Z
**Start:** TASK-008-003 at `review`; SDET spawned for gate-2 review (admin surface — notification feed extension + engagement-status observable).
**Actions:**
- Startup checklist: ENGINE.md, sdet.md, PROGRESS.md, task file, brief AC binding (AC-ONBD-006-01, AC-ONBD-007-01/-02, AC-MSG-013-04), upstream refs (ADR-003, ADR-005, ADR-006) all read.
- Scope discipline (diff): `git diff --name-only HEAD` returns exactly the 7 files named in the Work Log + the two task/PROGRESS files. `apps/portal` diff is 0 lines. `prisma/schema.prisma`, `db/migrations/`, `db/policies/` show zero changes — no schema migration. PASS.
- Focus area 1 (additive no-schema DB read, ADR-003): `getEngagementStatusForAdmin` uses `getAdminPool()` + raw mssql `SELECT [id],[status] WHERE id=@engagementId` — no Prisma direct access, no SESSION_CONTEXT. Admin pool is correct for the admin surface (no CLIENT context). Reads `Engagement.status` — not the notification rows, no `0004` bypass. PASS.
- Focus area 2 (notification feed extension, XSS): Two-element `||` filter; unknown/future types filtered, not rendered implicitly. Tests confirm `some_future_type` absent from DOM. Unread badge counts both types. "Review request" link preserved. No `dangerouslySetInnerHTML` in component or page. PASS.
- Focus area 3 (AC coverage + dual-tags): `[AC-ONBD-007-01 / AC-MSG-013-04]` describe (3 tests, render + unread + read variants). `[AC-ONBD-007-02]` describe (3 tests, title/body content + XSS). `[AC-ONBD-006-01]` — 2 `it` entries assert both 'New' and 'In Progress' statuses with argument check. PASS.
- Focus area 4 (scope discipline): `apps/portal` zero diff, `apps/portal` test non-regression 172/172. No engagement list/pipeline/lifecycle UI, no client-facing labels, no changes to 001 engine or 002 portal wiring. PASS.
- Focus area 5 (independent gate re-runs on uncommitted working tree): `pnpm lint` PASS; `pnpm type-check` PASS; `pnpm --filter admin test` 246/246 PASS; `pnpm --filter portal test` 172/172 PASS.
- Metadata: `Complexity-actual: 2` (valid); `Completed-at` correctly blank at review. Pre-impl Work Log entry present. Required spec fields all present. `Introduces-gate: no` — no Gate Authoring Rules evidence required.
- Atomic close edit performed: SDET Review box ticked, Decision: approved, comprehensive notes, approval breadcrumb appended to Work Log, `Completed-at: 2026-06-19T17:40:00Z`, `Status: done`.
**End:** **TASK-008-003 APPROVED.** All 3 of tasks 001/002/003 now `done` and ready for commit. TASK-008-004 (e2e, Docker pre-flight) is unblocked.

---

### IO Dispatch (TASK-008-003 implemented → routed to SDET review — admin surface) — BRIEF-008 / EPIC-008 — 2026-06-19
**Start:** Re-invoked with the TASK-008-003 implementer result inline: developer **completed**, status flipped
`in-progress → review`, all submission-gate boxes ticked. `packages/db/src/repositories/engagement.ts` adds
`getEngagementStatusForAdmin(engagementId)` (admin-pool `SELECT [id],[status]` → `{id,status}|null`; NO new
entity/column/policy; DECISION recorded — admin pool, no CLIENT SESSION_CONTEXT at admin surface, ADR-003 §7
admin-read pattern); barrel-exported via `index.ts`. `NotificationsIndicator.tsx` extends the hard-filter from
`NEW_REQUEST`-only to the known set {`NEW_REQUEST`, `ONBOARDING_COMPLETE`} (imported from `@tax-portal/db`);
unread badge counts both; body rendered as default-escaped React text (XSS-safe); `data-notification-type` per
item; "Review request" link when `engagementRequestId` set (D4 FK reuse); unknown/future types NOT rendered.
`document-requests/actions.ts` adds `getEngagementStatusAction` (ACCOUNTANT identity guard →
`getEngagementStatusForAdmin`); `document-requests/page.tsx` renders `<span data-testid="engagement-status"
data-status={status}>` (AC-ONBD-006-01 UI observable). Tests: `NotificationsIndicator.test.tsx` (16) +
`engagement-status.test.ts` (7). Gates: lint clean, type-check clean, admin 246/246, portal 172/172 (ADR-006
non-regression). `Complexity-actual: 2`; `Completed-at` blank; changes uncommitted in working tree (001+002
committed `bac39eb`/`f443307`).
**Actions:**
- Read the TASK-008-003 spec + its SDET Review focus areas + the brief AC binding (AC-ONBD-006-01,
  AC-ONBD-007-01/-02, AC-MSG-013-04) + upstream refs (ADR-003, ADR-005, ADR-006). Verified the task is at
  `review` with the submission gate ticked, `Complexity-actual: 2` (valid 1–5), `Completed-at` correctly blank.
- Composed the **gate-2 SDET dispatch** with this-task-specific binding focus areas: (1) the new `packages/db`
  read is genuinely additive & no-schema — verify via `git diff` NO Prisma migration / `db/migrations/*` /
  `db/policies/*` / `prisma/schema.prisma`; admin-pool seam (ADR-003, no direct Prisma outside the wrapper);
  the admin-pool choice does NOT bypass the accountant-only `0004` notification boundary (reads
  `Engagement.status` on the already-accountant-gated admin page, not client-scoped notification rows). (2)
  Notification feed extension is minimal & non-regressing — only the two known types rendered (no implicit
  default for unknown/future), `new_engagement_request` + unread badge + "Review request" link preserved,
  default-escaped React text (no `dangerouslySetInnerHTML`). (3) AC coverage + dual-tags
  (AC-ONBD-007-01/AC-MSG-013-04 dual-tagged, AC-ONBD-007-02, AC-ONBD-006-01 New + In Progress). (4) Scope
  discipline — no engagement list/pipeline UI, no lifecycle controls, no client-facing labels (Phase-3 OOS),
  `apps/portal` untouched (ADR-006), no change to the 001 engine / 002 portal wiring. (5) Independent re-run of
  lint, type-check, `pnpm --filter admin test`, `pnpm --filter portal test` on the uncommitted working tree
  (note pre-existing failures as pre-existing). (6) Metadata gate — `Complexity-actual: 2` valid, `Completed-at`
  blank until close. Atomic-close-on-approve / enumerated-reject; **SDET does NOT commit** (main session commits
  003 after approval).
- Phase-transition reflex: updated `## Current initiative` task status (001+002 done/committed; 003 → review,
  SDET dispatch composed; 004/005 backlog); appended this entry.
**End:** Dispatch continues — **TASK-008-003 routed to SDET review**. On APPROVE: main session commits 003 (code
+ close edit), IO dispatches TASK-008-004 (e2e + cross-app — **Docker pre-flight fires here**, the first
e2e-gated task). On REJECT: IO routes the enumerated fixes back to the `[webapp-developer]`. Composing ONE
`## Next Dispatch` for the SDET review of TASK-008-003.

---

### IO Dispatch (TASK-008-003 approved + committed; dispatching TASK-008-004 — e2e + cross-app) — BRIEF-008 / EPIC-008 — 2026-06-19
**Start:** Re-invoked with the SDET TASK-008-003 result inline: **APPROVED** (17:40:00Z). All 6 binding focus
areas passed — additive no-schema admin-pool read (ADR-003; zero Prisma/migration/policy/schema change via
diff); notification-feed extension minimal + non-regressing + XSS-safe (two-known-type set, no implicit
default, React-escaped text); AC dual-tags assert real counterfactuals
(AC-ONBD-007-01/AC-MSG-013-04, -007-02, -006-01 New+In Progress); scope discipline (no Phase-3 UI,
`apps/portal` untouched, 001/002 untouched); gates re-run independently (lint/type-check clean, admin 246/246,
portal 172/172); metadata gate clean (`Complexity-actual: 2`). SDET atomic close done; **main session
committed 003 (code + close)**; branch now current with `main` via merge `921fd1a`. Tasks 001/002/003 are
all `done` and committed. **TASK-008-004 (the only e2e-gated task) is unblocked.**
**Actions:**
- Read the TASK-008-004 spec + the brief's methodology block (`acceptance_format: gherkin`, `e2e: required`,
  tier map per ADR-012) + the epic's **8 gherkin acceptance scenarios** (`.planning/EPIC-008…#acceptance-scenarios`).
  Per CLAUDE.md § Executable gherkin tooling the binder is not yet chosen → the task authors **`.spec.ts`**
  covering the 8 scenarios (each AC-tagged), and may add human-readable `.feature` files mirroring them; no
  Cucumber wiring is invented this slice.
- Surveyed the e2e surface: `scripts/e2e-cross-app.sh` runs an explicit spec list (portal cross-app specs +
  admin `cross-app-redirect`) and auto-detects the admin host port via `docker inspect tax-portal-admin`
  (handles the `:13001` neighbor-squat remap). The completion cross-app spec must be **added to that script's
  list** to run under `pnpm e2e:cross-app`. Reuse anchors confirmed: portal e2e fixtures
  (`apps/portal/e2e/fixtures/{auth,db}.ts`), the EPIC-005/006/007 post-letter-gate onboarding specs
  (`onboarding.spec.ts`, `onboarding-questionnaire.spec.ts`, `document-upload*.spec.ts`,
  `*-cross-app.spec.ts`), and the admin notification/status observables landed by TASK-008-003
  (`data-notification-type`, `data-testid="engagement-status"` / `data-status`).
- **Docker pre-flight (IO side): PASS.** `docker info` succeeds; full compose stack up & healthy
  (`tax-portal-portal` :3000, `tax-portal-admin` :13001, `tax-portal-azurite` :10000, `tax-portal-sqlserver`
  :14330). Docuseal/mailhog not load-bearing for this slice (no e-sign/email path — letter-sign is reached via
  the existing post-letter-gate fixture). **E2e is runnable in this environment — no defer.** The dispatch
  re-asserts the developer-side `docker info` pre-flight + STOP-and-escalate-on-failure per ENGINE § Docker
  Pre-Flight regardless (the agent must not fake/skip e2e).
- Phase-transition reflex: updated `## Current initiative` task status (001/002/003 done+committed; 004
  in-progress; Docker pre-flight PASS recorded); flipped TASK-008-004 → `in-progress`; appended this entry.
**End:** Dispatch continues. Composing ONE `## Next Dispatch` for **TASK-008-004** (`[webapp-developer]`,
`Impl: developer`, `E2e-required: yes`). On its SDET approval: main session commits 004, IO dispatches
TASK-008-005 (@demo gallery). On REJECT: IO routes the enumerated fixes back to the `[webapp-developer]`.
On a developer-side Docker-unavailable STOP: the IO defers the e2e and surfaces it (the Conductor handles).

---

### SDET Verification + Review — TASK-008-004 (e2e + cross-app, combined verification + gate-2) — 2026-06-20T01:15:00Z
**Start:** TASK-008-004 at `review` (`Complexity-actual: 4`). Combined dispatch: (A) Docker pre-flight, (B) independently establish pre-existing vs regression, (C) classify environment vs code, (D) gate-2 review and 3× flake check.
**Actions:**
- **A — Docker pre-flight: PASS.** Docker 29.4.1 available. Stack: portal :3000 (healthy), admin :13001 (healthy), azurite :10000 (healthy), sqlserver :14330 (healthy). E2e runnable.
- **B — Pre-existing vs regression: OBJECTIVELY PRE-EXISTING.** (1) `git diff origin/main...HEAD -- apps/portal/e2e/specs/document-upload.spec.ts apps/portal/e2e/specs/document-upload-cross-app.spec.ts` → empty output. EPIC-007 upload specs are byte-identical to main, untouched by this branch. (2) `git diff origin/main...HEAD -- apps/portal/src/app/onboarding/ packages/db/` → only 3 hunks in `actions.ts` (import + two best-effort try/catch appended AFTER `submitQuestionnaire`/`completeUpload` success branches; `completeUploadAction` body untouched) + additive `getEngagementStatusForAdmin` in `engagement.ts`. NO upload-PUT/completeUpload path code was modified. (3) Three uncommitted 004 specs temporarily moved to `/tmp/` (untracked files, not stash-compatible). Ran `pnpm --filter portal e2e:run -- --grep document-upload` on the committed-only tree. RESULT: **4 failures** — exactly EPIC-007 `document-upload.spec.ts` tests 22/23/24 + `document-upload-cross-app.spec.ts` test 18. Same `data-status="outstanding"` → `"fulfilled"` timeout failure mode. Upload specs fail WITH THE 004 SPECS ABSENT. PRE-EXISTING ESTABLISHED OBJECTIVELY. Specs restored after run.
- **C — Environment vs code: ENVIRONMENT (networking/Azurite).** `docker compose logs azurite` during upload-spec run: **zero blob-level PUT requests** (`PUT /devstoreaccount1/tax-portal-documents/<blob-key>`) in Azurite logs. Only CORS setup + idempotent container create (409) appear. The browser Playwright Chromium process on the host cannot reach Azurite at `127.0.0.1:10000` — the SAS PUT never lands. No production code was changed by this branch that touches the upload path. VERDICT: **ENVIRONMENT/NETWORKING defect** (Azurite SAS URL host unreachable from Playwright browser process).
- **D — Gate-2 review (3× flake check + scope + spec quality):**
  - Scope: `git status --short` confirms 3 untracked new specs + `scripts/e2e-cross-app.sh` + task/PROGRESS files. Zero production code in diff. PASS.
  - Admin EPIC-008 specs 3×: tests 14–17 (AC-ONBD-006-01/-02/-07-01/-02/-MSG-013-04 + security) PASS all 3 runs. Zero flakes. Pre-existing Mailhog/questionnaire failures unrelated.
  - Portal negative path (`[AC-ONBD-005-02][AC-ONBD-006-03]` test 27) PASS on targeted run. Zero flakes.
  - Spec authoring: Notification INSERT schema verified correct `([type],[title],[body],[engagementRequestId])`; title/body verbatim from `processOnboardingCompletion`. Gherkin scenarios verbatim from epic (8 scenarios, all AC-tagged).
  - AC-ONBD-005-01 tier-3 proof: `onboarding-completion.integration.test.ts:485` confirmed present + correct. SDET-verified 14/14 PASS at TASK-008-001 (22:11:00Z). Behavior proven at tier-3; only browser-e2e tier env-blocked.
  - Metadata: `Complexity-actual: 4` valid; `Completed-at` blank at review; `Started-at` + `Complexity-estimate` set; pre-impl Work Log entry present; required spec fields present; `Introduces-gate: no`.
  - Lint + type-check independently re-run: CLEAN (zero warnings/errors).
- **Atomic close edit: PERFORMED.** SDET Review box ticked, Decision: approved-with-disposition, comprehensive notes + B/C evidence, approval breadcrumb appended to Work Log, `Completed-at: 2026-06-20T01:15:00Z`, `Status: done`.
- **Upload-pipeline defect disposition:** classified as **BUG-008-001** (pre-existing EPIC-007-owned Azurite/browser-PUT environment defect; not a BRIEF-008 regression). IO to file. AC-ONBD-005-01 browser-e2e tier deferred to BUG-008-001; tier-3 proof carries it for Validate.
**End:** **TASK-008-004 APPROVED-WITH-DISPOSITION.** TASK-008-005 (@demo) is now unblocked (gated behind 004). Main session should commit 004 code + close edit; IO files BUG-008-001; IO dispatches TASK-008-005.

---

### IO Escalation triage — TASK-008-004 (e2e + cross-app) — 2026-06-19
**Start:** Re-invoked with the TASK-008-004 resume-developer result inline: 004 flipped `in-progress → review`
(`Complexity-actual: 4`); 4 admin-spec schema-authoring errors fixed (non-existent Notification columns
`relatedEntityId`/`userId`/`updatedAt` + wrong title/body → corrected to `processOnboardingCompletion`'s actual
output + columns `([type],[title],[body],[engagementRequestId])`); **escalation raised**: ADR-009 two-phase
upload pipeline (browser PUT → Azurite → `completeUploadAction`) does not complete here, blocking the
AC-ONBD-005-01 portal positive path + the EPIC-008 cross-app spec + 4 committed EPIC-007 upload specs;
developer claims pre-existing (not a BRIEF-008 regression, not a spec error), no production code patched.
**Actions (IO independent analysis — Read/Grep/Bash, did NOT accept the claim on the developer's word):**
- **Branch-vs-main diff (`git diff --name-only origin/main...HEAD` + `--stat`):** confirmed the EPIC-007 upload
  specs (`document-upload.spec.ts`, `document-upload-cross-app.spec.ts`) are NOT in the branch diff — committed
  on `main` @ `eaa5875` (PR #52), unmodified here. The branch's only `apps/portal` production change is
  `onboarding/actions.ts` (+37 lines = TASK-008-002's contained best-effort trigger, NOT upload-delivery code);
  the `packages/db` engine is additive new files. **No BRIEF-008 code sits in the upload-PUT/completeUpload path.**
- **AC-ONBD-005-01 tier-3 proof located:** `packages/db/src/onboarding-completion.integration.test.ts:485`
  ("fulfilled DocumentRequest → document-upload step done → transitions") PASSED on the real SQL Server container
  (SDET independently re-ran 14/14 @ 22:11:00Z). The AC's *behavior* is proven at integration tier with no
  dependency on the browser→Azurite PUT; only the browser-e2e tier is env-blocked.
- **CLAUDE.md check:** e2e is NOT a per-PR required CI check (pre-deploy gate); required checks are
  `lint-and-typecheck` + `security-scan`. An env-blocked e2e path does not block this slice's merge.
- **Read the two onboarding-completion specs + the failing upload assertion** (portal spec L703 — expects
  `data-status="fulfilled"`, gets `"outstanding"` after the PUT). Consistent with an upload-delivery
  (Azurite/CORS/container) failure, not a completion-engine failure.
- **Disposition: PROCEED-WITH-DISPOSITION (not a STOP)** — contingent on SDET independent verification of the
  pre-existing/regression and environment/code questions. Composed the SDET verification+review dispatch (below).
- Phase-transition reflex: recorded the escalation triage block in `## Current initiative`; appended this entry.
  (Phase is Review — the SDET gate-2 review of 004 is folded into the same dispatch as the pre-existing
  verification, since the verification finding determines the review verdict.)
**End:** Composing ONE `## Next Dispatch` — the **SDET TASK-008-004 verification + gate-2 review**. On SDET
APPROVE-with-disposition: main session commits 004, IO files **BUG-008-001** (pre-existing upload-pipeline
env defect, carried to retro / Validate-disposition), then dispatches TASK-008-005 (@demo). On SDET finding a
**regression or this-slice code defect**: this flips to a **STOP** (needs-user-direction) — the IO surfaces it
to the Conductor and halts. On SDET REJECT for a spec-quality reason: IO routes enumerated fixes back to the
`[webapp-developer]`.
