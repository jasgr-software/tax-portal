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
notified) — Phase: DISPATCH (paused at a clean checkpoint).** Branch `brief-008-onboarding-completion-transition`
(off `main` @ `d49c984`).

> **Task status (2026-06-19, Dispatch checkpoint):** TASK-008-001 **`review`** (developer-implemented +
> submission-gate boxes ticked by the developer; **SDET review pending** — NOT yet approved). TASK-008-002,
> -003, -004, -005 **`backlog`**. Working tree (uncommitted, on the feature branch): `onboarding-completion.ts`
> + its two test files (predicate tier-2 + integration tier-3) + `packages/db/src/index.ts` barrel edit. **No
> commits yet** (the main session commits per-task after SDET approval). **Resume:** re-invoke `/io` (or
> `/orchestrate EPIC-008`) → IO reads this file → Dispatch resumes by **spawning the SDET to review
> TASK-008-001** (the next pipeline step), then dispatches TASK-008-002 + -003 (both depend only on 001),
> then -004 (e2e; Docker pre-flight), then -005 (@demo). Conductor STATE.md mirrors this.
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
