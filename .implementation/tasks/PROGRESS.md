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
notified) — DELIVERED · CLOSE-FINALIZE COMPLETE 2026-06-20.** Merged to `main` via squash commit **`7fe2872`**
(PR #55, `https://github.com/jasgr-software/tax-portal/pull/55`; branch deleted). **All 9 gates resolved:** 1–7
GREEN (Close-prep), **gate 8 post-merge CI GREEN** @ `7fe2872` (CI run `27870105845` + CodeQL `27870105586`
both `completed/success`; required `lint-and-typecheck` + `security-scan` green), **gate 9 N/A** (`Brief-deploys:
no`). 7 review threads dispositioned+resolved before merge (Lane B; no `--admin`/protection toggle). HANDOFF-008
+ RETRO-008 (incl. Post-Merge Addendum) written; all 5 tasks in `tasks/done/`; **BUG-008-001 stays OPEN** (tracked
non-blocking infra follow-up). **The Phase-2 capstone — Phase 2 (EPIC-005/006/007/008, the onboarding gate) is
complete at the engine level.**

> **Next (Conductor):** `/planning validate EPIC-008 with CI evidence 7fe2872` (flip 8 AC `planned → verified`,
> roll EPIC-008 → `delivered`) → **Phase-2 closeout** (DEMO-POLICY § Part B walkthrough video + `docs/demos/phase-2/`)
> → docs-lane sign-off PR → run report. **IO Close-finalize ends here.**

> **(Prior Plan→Validate phase-status notes swept to `PROGRESS-ARCHIVE.md` § Sweep pointers at the
> Validate→Close-prep transition. The detailed AC↔test traceability table is durable in `HANDOFF-008.md`; the
> gate scorecard in `RETRO-008.md`.)**

> **(Superseded BRIEF-008 phase/task-status checkpoint notes — Validate / Smoke / Audit / Review / Dispatch —
> collapsed at the Validate→Close-prep transition under the bounded-ledger rule. The full gate detail is durable
> in `RETRO-008.md` (9-gate scorecard + finding classification), the AC↔test traceability in `HANDOFF-008.md`,
> per-task records in `done/TASK-008-*.md`, and `BUG-008-001-*.md`. Recover the collapsed prose via
> `git log -p PROGRESS.md`.)**
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

**Cross-surface-parity sunset counter (CLAUDE.md § Platform-frontend scope):** **2 of 3** consecutive
zero-finding slices (BRIEF-007 first clean; **BRIEF-008 Audit CLEAN — both surfaces exercised** — advances to
2 of 3). One more zero-parity-finding Close-prep retro trips the keep/remove review.

## Awaiting PR merge

_Empty — no slice in PR limbo._

_Prior limbo cleared:_ **BRIEF-008 / EPIC-008** (Phase-2 capstone) merged **PR #55 → `main` @ `7fe2872`**
(Lane B; 7 review threads dispositioned+resolved; no `--admin`/protection toggle); **Close-finalize COMPLETE
2026-06-20** (gate 8 GREEN — CI `27870105845` + CodeQL `27870105586` both `completed/success` @ `7fe2872`,
required `lint-and-typecheck` + `security-scan` green; gate 9 N/A `Brief-deploys: no`; zero post-merge bugs;
BUG-008-001 stays OPEN). See `RETRO-008.md § Post-Merge Addendum`. **Remaining (Conductor-owned):**
`/planning validate EPIC-008 with CI evidence 7fe2872` + the Phase-2 closeout.

_Prior limbo cleared:_ **BRIEF-007 / EPIC-007** merged **PR #52 → `main` @ `eaa5875`** (Lane B, user-approved);
Close-finalize COMPLETE (gate 8 GREEN — CI `27844771147` + CodeQL `27844771086` both `completed/success` @
`eaa5875`; gate 9 N/A; zero post-merge bugs). See `RETRO-007.md § Post-Merge Addendum`.

Delivered (recent): **PR #55 `7fe2872`** (EPIC-008 — onboarding completion / New→In Progress transition,
Phase-2 capstone), **PR #52 `eaa5875`** (EPIC-007 — initial document upload, onboarding step 3),
**PR #50 `e55f8c5`** (EPIC-006 — intake questionnaire, onboarding step 2), PR #48 `f879da2`
(EPIC-005 — opens Phase 2), PR #42 `ec151cb` (EPIC-003), PR #40 `70ea10e` (EPIC-002), PR #38 `0444551`
(EPIC-004), PR #35 `f7f6c9d` (EPIC-001) — all merged. **Phase 1 (MVP) complete; Phase 2 (onboarding gate) —
EPIC-005 + EPIC-006 + EPIC-007 + EPIC-008 all delivered at the engine level (steps 1 + 2 + 3 + completion
capstone); Phase 2 complete at the engine level. Conductor-owned closeout remaining: `/planning validate
EPIC-008` write-back + Phase-2 walkthrough video.**

## Active bugs

**BUG-008-001 (BRIEF-008, surfaced at TASK-008-004 e2e gate) — Azurite SAS-URL PUT host-unreachable from the
Playwright browser process — OPEN, tracked follow-up (does NOT block this slice's merge).** File:
`.implementation/tasks/BUG-008-001-azurite-sas-url-host-unreachable-from-playwright-browser.md`.
**Classification: pre-existing INFRA defect, EPIC-007-originated (ADR-009 two-phase upload pipeline), NOT a
BRIEF-008 regression** — SDET-established three ways at the 004 gate (2026-06-20T01:15:00Z): (B) EPIC-007 upload
specs byte-identical to `main` via `git diff origin/main...HEAD` (empty), no BRIEF-008 code in the
upload-delivery path (`completeUploadAction` body unchanged), and the 4 EPIC-007 upload specs reproduce the
failure with the three 004 specs stashed out of the tree; (C) `docker compose logs azurite` shows ZERO
host-driven blob PUTs land — the SAS URL is signed against the container-internal Azurite address, unreachable
from the host Playwright Chromium under the `:10000`/port-remap topology. **Affected:** AC-ONBD-005-01 portal
positive path + the EPIC-008 cross-app spec + 4 committed EPIC-007 upload specs (`document-upload.spec.ts`
22–24, `document-upload-cross-app.spec.ts` 18). **Disposition:** tracked follow-up, NOT slice-blocking — e2e is
not a per-PR required CI check (CLAUDE.md; required = `lint-and-typecheck` + `security-scan`), and
**AC-ONBD-005-01 is carried for slice Validate by its tier-3 integration proof**
(`onboarding-completion.integration.test.ts:485`, real container, part of TASK-008-001's 14/14). **Do NOT fix
the upload pipeline in BRIEF-008** — out of slice scope; its own future infra slice (EPIC-007/ADR-009 concern).
Carried to RETRO-008 + Validate-disposition.

_BUG-007-001 (BRIEF-007) — admin e2e `document-requests.spec.ts` stale data-testid selectors —
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
- **[metric-integrity — RETRO-006 item 2 → ELEVATED at BRIEF-007 → 9th+ recurrence at BRIEF-008]
  Clock-source `Completed-at`/`Started-at` inversion → `ungated-fix`** — recurred again on **TASK-008-002**
  (`Completed-at 17:17` < `Started-at 22:09`) and **TASK-008-003** (`Completed-at 17:40` < `Started-at 22:27`);
  prior at TASK-007-001..004. Developer agents wrote `Completed-at` in a later clock session against an earlier
  `Started-at` instead of leaving it blank for the SDET's atomic close. This is the **9th+ occurrence**
  project-wide (RETRO-002/003/004/005/006 + BRIEF-007 + BRIEF-008). **Disposition: `ungated-fix`**
  (Overwatch-recommended; IO-classified). **Fix:** amend `.implementation/agents/developer.md` (and/or the
  Dispatch-Checkpoint guidance) to **prohibit developer writes to `Completed-at`** — per the Task Metadata
  Contract, `Completed-at` is SDET-authored (or IO-as-reviewer for `Impl: io`) inside the atomic close edit
  only. **This is an ungated-path doc edit (quad-review workflow-file change); it does NOT ride the BRIEF-008
  PR** — it rides a future docs/ungated change. Tracked here until that change lands. **Fold in the sister
  `Updated-by`-staleness finding (RETRO-008 item 1a):** all 5 BRIEF-008 tasks were left `Updated-by:
  webapp-developer`, not flipped to `sdet` on the atomic close — the same close-edit fix should set
  `Updated-by: sdet` alongside the `Completed-at` write.
- **[gated-path candidates — PR #55 panel minors, deferred 2026-06-20] 3 advisory `onboarding-completion.*`
  cleanups** — carried from the PR #55 review (panel APPROVE; fix-decision SKIP). Ride the next `packages/db`
  task that touches `onboarding-completion.*`: (1) **fire-once concurrency test gap**
  (`onboarding-completion.integration.test.ts:507` — the test covers the `status !== 'New'` short-circuit but
  not the `@@ROWCOUNT`-guard concurrent path; add a concurrent-completion test asserting exactly one transition
  + one notification); (2) **unused export `ENGAGEMENT_TRANSITION_ACTION`** (`onboarding-completion.ts:74` —
  drop the export/barrel re-export or wire its consumer); (3) **redundant `EngagementWithClient` interface +
  field-by-field copy** (`onboarding-completion.ts:79` + copy 172–180 — collapse to the shared type). Full
  detail + the 2 dispositioned-as-intended items in `RETRO-008.md § Post-Merge Addendum`. (Observation — no
  gate failure; not slice-blocking.)
- **[gate-design — RETRO-008 item 3, observation] `check_work_log_content` wording brittleness +
  late-firing-on-`done`** — `scripts/validate-gates.sh`'s literal `"Starting implementation"` substring grep
  rejected TASK-008-002's truthful synonym "Starting TDD" (fixed at gate-7 by the IO `Impl: io` mechanical
  Work-Log-wording alignment, commit `06119e2`, NOT fabrication). **Recommend:** broaden the grep to a synonym
  set (`Starting (implementation|work|TDD|coding)|Beginning implementation`) OR publish the exact required
  phrase to developers in the Dispatch-Checkpoint guidance. Secondary: the check fires only once a task flips to
  `done` (skipped at WIP/`review`), so the miss surfaced late at the de-WIP'd-PR CI rather than at the per-task
  submission gate — consider running it at submission time too. ENGINE/CI-tooling backlog; not slice-blocking.

---

### IO Close-prep — BRIEF-008 / EPIC-008 (onboarding completion — Phase-2 capstone) — 2026-06-20

**Start:** Validate EXIT met — gate-6 (SDET acceptance-validation, 8/8 in-scope AC, APPROVED 05:30:00Z) +
gate-7 (CI green on PR #55 @ head `06119e2` — run `27856606320` `completed/success`, both required checks green
after the `check_work_log_content` Work-Log-wording fix commit `06119e2`). Phase-transition reflex performed
(prior Plan→Validate session entries swept to `PROGRESS-ARCHIVE.md` § Sweep pointers; `## Current initiative` +
`## Awaiting PR merge` updated; this entry appended).

**Consistency gate — PASS:**
- All **5** tasks `done` (TASK-008-001/002/003/004/005) with valid `Complexity-actual` ∈ 1–5 and completed SDET
  review sections; archived to `tasks/done/`.
- BUG-008-001 is a **dispositioned, non-blocking, tracked follow-up** (pre-existing EPIC-007/ADR-009 infra
  defect; OPEN; stays in `tasks/` per the Post-Close Protocol — open bugs are not archived). Not slice-blocking.
- `## Awaiting PR merge` was empty at entry (BRIEF-007 cleared limbo 2026-06-19). Working tree clean intent;
  branch `brief-008-onboarding-completion-transition` @ `06119e2`.

**Artifacts written (working-tree only — main session commits):**
- `HANDOFF-008.md` — AC ledger (8/8 in-scope; 7 fully validated across tiers; AC-ONBD-005-01 tier-3 validated +
  browser-e2e tier deferred to BUG-008-001), what shipped (the zero-schema-migration completion engine), the
  COVERAGE write-back instruction (`/planning validate EPIC-008`), Phase-2-capstone note.
- `RETRO-008.md` — 9-gate scorecard (1–7 green; 8 pending Close-finalize; 9 N/A `Brief-deploys: no`); finding
  classification (item 1 gated-path-fix = the `check_work_log_content` gate-7 event + IO `06119e2` fix; item 2
  ungated-fix = clock-domain inversion **9th+ recurrence** on TASK-008-002/003, carried off-PR; item 1a sister
  `Updated-by`-staleness on all 5 tasks; item 3 gate-vs-wording brittleness; item 4 honest interrupted-resume
  process note; item 5 BUG-008-001); cross-surface parity CLEAN → **sunset 2 of 3, KEEP**.
- `tasks/done/TASK-008-001..005` — archived.
- `PROGRESS-ARCHIVE.md` — BRIEF-008 index row updated + sweep pointer added.

**Slice moved to `## Awaiting PR merge`** with PR #55 (`https://github.com/jasgr-software/tax-portal/pull/55`),
head `06119e2`, the gate scorecard, and gate-7 CI evidence (run `27856606320`).

**End / hand-off to main session:** de-WIP'd PR title + body composed (below, in the report) for the main session
to apply — PR #55 needs `gh pr ready 55` (un-draft) + the title/body update. **This is an application-code PR →
MERGE-POLICY Lane B (reviewed lane):** the Conductor runs `/pr-review 55` → `/pr-fix` if needed → merge on green
required CI (no `--admin`, no protection toggle). After merge, re-invoke the IO for **Close-finalize** (gate 8
post-merge CI; gate 9 N/A; archive BUG-008-001 if no POST bug; Post-Merge Addendum to RETRO-008). **Phase-2
capstone:** the Conductor's Report phase must run the Phase-2 closeout (walkthrough video per DEMO-POLICY § Part
B; `docs/demos/phase-2/`) + `/planning validate EPIC-008` to close Phase 2. **IO invocation ends here.**
