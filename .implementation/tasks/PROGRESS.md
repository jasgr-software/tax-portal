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
**Brief-deploys:** no. **Phase:** CLOSE-PREP **COMPLETE → `## Awaiting PR merge` (PR limbo)** (all 7 tasks `done` + committed; Audit **CLEAN**; IO Review **design-scan PASS**; Smoke **gate 5 PASS**; **Validate PASS** — gate 6 [7/7 AC gherkin prose-bind PASS], gate 7 [CI: pnpm ci:local EXIT 0; portal e2e 35/36 + 36/36 on retry [AC-ONBD-001-01 pre-existing flake, BRIEF-006 ACs both green]; admin e2e 35/35; cross-app 11/11 PASS], quality audit [PASS — no blocking gaps; ADR-006 fence clean; HARD tier-3 7/7 live; tier honesty verified]). **Close-prep done:** consistency gate PASS; 7 task files + BUG-006-001 archived to `tasks/done/`; `RETRO-006.md` + `HANDOFF-006.md` written; slice moved to `## Awaiting PR merge`. **7 in-scope AC. 7/7 PASS.** Next: **main session pushes the branch + opens the PR** (reviewed lane); then IO **Close-finalize** (gate 8) after merge.

**Dispatch progress (2026-06-18):** TASK-006-001 **SDET-APPROVED** (Status: done; `Completed-at: 2026-06-18T20:00:00Z`). HARD tier-3 isolation test independently re-run live: 7/7 PASS. Gate Authoring three-item evidence verified real. Substrate proven — schema, repos, `0006` policy, inventory.md Track-B drift resolved. TASK-006-002 (admin template UI) **SDET-APPROVED** (Status: done; `Completed-at: 2026-06-18T20:06:28Z`; `Complexity-actual: 3`) — 42 new tests, `pnpm --filter admin test` 184 pass, lint/type-check clean, ADR-006 fence VERIFIED live (`find apps/portal/src -name "*questionnaire*"` → 0), all 4 AC behaviorally tested, committed to `brief-006-intake-questionnaire`. TASK-006-003 (engagement→service-type resolution + correct-template read, tier-3) **SDET-APPROVED** (Status: done; `Completed-at: 2026-06-18T20:23:09Z`; `Complexity-actual: 3`) — `getQuestionnaireForEngagement(engagementId)` + no-arg `getMyQuestionnaire()` resolver in `questionnaire-template.ts`; request-pool FILTER engagement gate FIRST verified in code and live, then admin-pool service join DECISION-F `sortOrder ASC, id ASC` (tiebreak live-proven), then admin-pool template read; absent-template → null (live-proven); non-owner → null FILTER fail-closed (live-proven). Independent SDET run: 6/6 tier-3 PASS; lint/type-check clean. TASK-006-003 committed to `brief-006-intake-questionnaire` (`e8b585c`, main session). TASK-006-004 (portal questionnaire step UI) **SDET-APPROVED** (Status: done; `Completed-at: 2026-06-18T20:38:52Z`; `Complexity-actual: 3`) — renders the resolved template behind the EPIC-005 letter gate; consumes EPIC-005 read model `accessible`/`done` (does NOT re-derive gate logic); no client-supplied ids (no-arg `getMyQuestionnaire()` from 003); locked/awaiting/submitted/active-form states; question content rendered as React text (no `dangerouslySetInnerHTML`). 27 new component tests; `pnpm --filter portal test` 102/102 (independently verified live); lint/type-check clean. **Action seam:** `getMyQuestionnaireAction()` (thin no-arg wrapper around `getMyQuestionnaire()` via `withRequestContext`) + `submitQuestionnaireAction(answersJson)` typed STUB — **both bodies replaced by TASK-006-005** (coordination `// DECISION (TASK-006-004/005)` comments present; stub hardcodes `alreadySubmitted:false`/`existingAnswers:null`). Not yet committed — main session commits after SDET approval. **Coordination note:** server-side satisfaction+recording is TASK-006-005; E2e consolidated in TASK-006-006 (004 `E2e-required: no`). **Carry-forward for TASK-006-005:** `SELECT @@ROWCOUNT` in `submitQuestionnaireAsClient` follows the `UPDATE [Engagement]` (captures UPDATE rowcount not INSERT's) — functionally correct for v1; verify at 005 production-submit wiring.

**Carried semantic note for TASK-006-005 (from TASK-006-001 SDET review):** in `submitQuestionnaireAsClient` (`packages/db/src/repositories/questionnaire-answer.ts`), `SELECT @@ROWCOUNT` follows the `UPDATE [Engagement]` so it captures the UPDATE's rowcount, not the INSERT's. Functionally correct for v1 (deny-case both 0, success-case both 1; mirrors `recordLetterSignatureAsClient`), but glance at it when TASK-006-005 wires the production submit action.

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
| TASK-006-002 admin template-management UI + actions (create / bind-to-service / edit) | **done** | webapp-developer | DASH-012-01/-02/-03, ONBD-003-02 (dual-tagged) | `apps/admin` ONLY (ADR-006 fence); mirror EPIC-005 `letter-template/` (admin-pool, `getAccountantIdentity()` guard); per-service-type set, not single row. **SDET-APPROVED 2026-06-18T20:06:28Z** |
| TASK-006-003 engagement→service-type resolution + correct-template read (tier-3) | **done** | webapp-developer | ONBD-003-01 (server-side match) | DECISION-F: primary service type = first selected by `sortOrder`,`id`; FILTER-governed engagement gate first; absent template → null. **SDET-APPROVED 2026-06-18T20:23:09Z** |
| TASK-006-004 portal questionnaire step UI (render correct template behind the letter gate) | **done** | webapp-developer | ONBD-003-01 (UI), ONBD-003-03 (UI affordance) | `apps/portal`; consumes EPIC-005 read model `accessible`/`done`; **does NOT re-derive gate logic**; no client-supplied ids; locked/empty/submitted states. **SDET-APPROVED 2026-06-18T20:38:52Z** |
| TASK-006-005 submit action (record answers + satisfy step) + read-model extension (tier-3) | **done** | webapp-developer | ONBD-003-03 (server-side satisfaction), ONBD-003-04 (recorded), ONBD-003-01 | extends `packages/db/src/onboarding.ts` (`done` from `questionnaireSubmittedAt`, DECISION-I); owner-only BLOCK-governed submit (mirror `recordLetterSignatureAsClient`); gate-checked refusal when unsigned. **Replaces the 004 stub bodies** (`getMyQuestionnaireAction`/`submitQuestionnaireAction`). **Dev finding:** `sec.pol_QuestionnaireAnswer` is **AFTER INSERT BLOCK** (throws SQL 33504 on deny, UNLIKE Engagement's silent `@@ROWCOUNT=0`) → added scoped try/catch mapping 33504→`{rowsAffected:0}`; **resolves the carried `@@ROWCOUNT` glance-item**. 33504-catch scoping VERIFIED by SDET (non-33504 errors re-thrown). **SDET-APPROVED 2026-06-18T22:15:00Z**. |
| TASK-006-006 e2e + gherkin binding + cross-app (both surfaces) | **done** | webapp-developer | DASH-012-01/-03, ONBD-003-01/-03 (+ cross-app author→complete) | **E2e-required; Introduces-gate: advisory**; bind epic's 7 scenarios; real letter gate exercised; satisfy-on-submit 3× zero-flake. **SDET REJECTED 2026-06-18T23:58:00Z** (BUG-006-001 — `actions.test.ts` mock missing `withRequestContext` → 1 failed/183 passed). **BUG-006-001 FIXED 2026-06-19** (test mock ONLY). **SDET APPROVED 2026-06-19T00:42:00Z** — live 184/184 independently re-run, fix scope verified, BUG-006-001 closed. All other facets carried from prior review (e2e 35+36+11, gherkin 7/7, real letter gate, honest fixtures). |
| TASK-006-007 @demo gallery (admin authoring + portal completion) | **done** | webapp-developer | none (non-gating) | docs/demos/EPIC-006/; mirror TASK-005-008; write ONLY EPIC-006 PNGs (prior-epic PNG footgun). Dev returned `review` 2026-06-19 — 6 distinct AC-tagged PNGs (unique MD5s), both surfaces; lint/type-check/build clean; portal `e2e:demo` 12/12 (2 new EPIC-006), admin 3 EPIC-006 tests green; 2 pre-existing @demo fails flagged (identity-spine port-mismatch, request-inbox SSE) as non-regressions. **SDET-APPROVED 2026-06-19T02:15:00Z** |

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

**BRIEF-006 / EPIC-006 — Intake questionnaire (per-service-type templates + client completion).** Branch
`brief-006-intake-questionnaire` (7 commits ahead of `main` @ `3dee2f1`; 51 files, +11465/−334). **Brief-type:**
feature · **Brief-deploys:** no. **Pre-merge gates 1–7 ALL GREEN** (7/7 submission · 7/7 SDET Review · Audit
CLEAN · Design-scan PASS · Smoke PASS · Acceptance-validation 7/7 AC · CI gate PASS + quality audit CLEAN).
Close-prep done: consistency gate PASS; 7 task files + BUG-006-001 archived to `tasks/done/`; `RETRO-006.md` +
`HANDOFF-006.md` written. **PR pending — main session pushes the branch + opens the PR** (base `main`, head
`brief-006-intake-questionnaire`; **reviewed lane** — application code → `/pr-review` panel). **`.orchestration/
STATE.md` + `.planning/EPIC-002` reconciliation are out-of-slice docs-lane edits and must NOT enter this PR.**
Next IO step after merge: **Close-finalize** (gate 8 post-merge CI; gate 9 N/A; append Post-Merge Addendum).
**PR #: _pending_.**

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
- **[metric-integrity — RETRO-006 item 2] Clock-source `Completed-at`/`Started-at` inversion** — TASK-006-002
  `Completed-at` (20:06:28Z) precedes `Started-at` (20:15:00Z). **6th occurrence** of the clock-source family
  (RETRO-002/003/004/005). The other 6 tasks were forward-ordered with real `Started-at` (the RETRO-005 carry was
  actioned). Observation — not promoted; **Overwatch: elevate to `ungated-fix` if it recurs to a 7th** without a
  dispatch-checkpoint/SDET clock-domain convention fix.

---

### IO Close-prep — BRIEF-006 — 2026-06-19 (consistency gate + archive + retro + handoff; slice → PR limbo)
**Start:** Resuming post-context. SDET returned Validate OVERALL PASS (gates 6+7+quality audit). Phase already
advanced to CLOSE-PREP. Read startup checklist (PROGRESS.md, PHASES.md, seed/sources.md, ENGINE.md § Retro
Classification/Rule Sunset, RETRO-005 + HANDOFF-005 as templates, BRIEF-006 front-matter).
**Consistency gate — PASS.** (1) All 7 tasks committed across 7 commits on `brief-006-intake-questionnaire`
(`git log main..HEAD`: 10ecb90 / 4b40c67 / e8b585c / ac499f5 / cb43671 / f166615 / 8497a07) — matches the
7-task list. (2) Committed diffstat 51 files, +11465/−334 — matches the Review design-scan. (3) **Out-of-slice
docs-lane files confirmed NOT on the committed branch** — `.orchestration/STATE.md` + `.planning/EPIC-002` are
uncommitted in the working tree (correct; they take the separate docs-lane, not this PR). (4) All 7 AC trace to
passing AC-tagged evidence (HANDOFF-006 table). (5) 7/7 tasks `done` with `Complexity-actual` ∈ 1–5 +
Dispatch-Checkpoint present (per prior SDET-review entries).
**Archive:** `git mv`'d the 7 `TASK-006-*` files + `BUG-006-001-*` to `tasks/done/`. `tasks/` now holds only
PROGRESS/ARCHIVE + HANDOFF-001..005 + RETRO-001..005 (+ the new 006 files).
**RETRO-006.md written** — 9-gate scorecard (gates 1–7 green, 8 pending, 9 N/A); what-shipped; **retro finding
classification** per ENGINE.md (promotion bar = concrete gate failure): **1 finding cleared the bar** —
BUG-006-001 SDET rejection (mock-interface drift, 2nd manifestation), classified `ungated-fix` (resolved this
slice, test-mock-only, 184/184 on re-run). 4 observations did NOT clear the bar (clock inversion 6th occurrence;
smoke-script defaults; @demo PNG churn; AC-ONBD-001-01 EPIC-005 flake) — carried to `## Open retro action items`,
not promoted. **Rule Sunset:** `--no-verify` KEEP; PushNotification guard KEEP; cross-surface-parity counter at
2/3 post-EPIC-005-decision (BRIEF-006 again zero-finding) — KEEP, re-evaluate next Close-prep, do NOT sunset.
**HANDOFF-006.md written** — for `.planning/` COVERAGE write-back: 7/7 in-scope AC `ready-for-verified` with the
tier/evidence table + the HARD ADR-005 second-policy isolation proof; net-new capabilities; out-of-scope honored;
zero upstream items raised; resolved-this-slice (inventory.md Track-B drift + the `@@ROWCOUNT` glance-item).
**Phase-transition reflex (Validate→Close-prep→PR limbo):** updated `## Current initiative` Phase to CLOSE-PREP
COMPLETE; moved the slice to `## Awaiting PR merge` (PR # pending); appended the 4 carried action items to
`## Open retro action items`; appended this entry. No sweep to PROGRESS-ARCHIVE needed (all inline entries are
current-slice BRIEF-006 gate records).
**End:** Close-prep exit condition met — RETRO-006 + HANDOFF-006 written, task files archived, slice in
`## Awaiting PR merge`. **IO ends the invocation.** PR creation is the main session's job (git-owned) + the
user-in-loop merge checkpoint. Dispatch block below tells the main session exactly what to push + the PR
title/body. After merge → re-invoke IO for Close-finalize (gate 8 post-merge CI; gate 9 N/A — `Brief-deploys:
no`).

---

### SDET Validate — BRIEF-006 — 2026-06-18T (gates 6/7 + quality audit) — OVERALL: PASS
**Start:** Resuming from context compaction. Completed startup checklist: ENGINE.md, sdet.md, PROGRESS.md, BRIEF-006, EPIC-006 acceptance scenarios. Docker pre-flight PASS (Engine 29.4.1). HARD tier-3 isolation re-run (7/7) already complete from prior session segment. CI gate was running in background; AC-ONBD-001-01 retry was running in background. Read all completed log files; composed verdicts.

**Gate 6 — Acceptance-Validation (gherkin prose-bind, 7 AC):**
All 7 BRIEF-006 in-scope AC validated. Summary:
- AC-ONBD-003-01 (correct questionnaire for service type): PASS — tier-3 6/6 (`questionnaire-resolution.rls.test.ts`) + tier-6 e2e portal test 18 (`onboarding-questionnaire.spec.ts:443` AC-ONBD-003-01, 787ms PASS) + cross-app test 24/7 (questionnaire-cross-app).
- AC-ONBD-003-02 (one template per service type, letter gate not weakened): PASS — tier-3 via `@@unique([serviceId])` constraint and `accessible: signed` confirmed in `onboarding.ts`; `submitQuestionnaireAction` calls `checkStepAccessibility`; non-owner FILTER fail-closed tier-3 live-proven.
- AC-ONBD-003-03 (step unsatisfied before submit, satisfied after): PASS — tier-3 10/10 (`onboarding-questionnaire.rls.test.ts`) + tier-6 portal test 19 (`onboarding-questionnaire.spec.ts:546` AC-ONBD-003-03, 1.0s PASS). `questionnaireSubmittedAt != null` drives read model.
- AC-ONBD-003-04 (answers recorded per engagement): PASS — tier-3: `submitQuestionnaireAsClient` INSERT+UPDATE batch, `@@unique([engagementId])` one-per-engagement constraint, positive DB-backed test confirms recording; cross-app e2e (test 24) confirms answer persisted across surfaces.
- AC-DASH-012-01 (accountant creates a questionnaire template): PASS — tier-6 admin test 11 (`questionnaire-templates.spec.ts:197` AC-DASH-012-01, 1.0s PASS) + 42 Vitest component tests (admin 184/184).
- AC-DASH-012-02 (template bound to chosen service type): PASS — tier-3 (DECISION-F `sortOrder ASC, id ASC` tiebreak; `@@unique([serviceId])` schema constraint; resolution test 6/6) + tier-6 admin test 12 (`questionnaire-templates.spec.ts:270` AC-DASH-012-02, 2.6s PASS).
- AC-DASH-012-03 (edited template retained): PASS — tier-6 admin test 13 (`questionnaire-templates.spec.ts:369` AC-DASH-012-03, 1.0s PASS).
Cross-cutting constraints: (a) letter hard gate NOT weakened — `accessible: signed` in `onboarding.ts` unchanged; portal e2e drives real letter-sign before questionnaire access (tests 18/19 precondition). (b) ADR-005 `0006` isolation policy HARD tier-3 re-run live: 7/7 PASS (`questionnaire-answer.client-isolation.rls.test.ts`, 610ms) — CLIENT-A reads own, CLIENT-B reads ZERO for CLIENT-A, null SESSION_CONTEXT→ZERO, ACCOUNTANT reads both, cross-client UPDATE blocked (rowsAffected=0), template INSERT blocked.
Gherkin prose-bind: 7 `.feature` files authored verbatim from EPIC-006 scenarios at `apps/portal/e2e/features/questionnaire.feature` + `apps/admin/e2e/features/questionnaire-templates.feature`; `.spec.ts` test titles carry AC ids; no Cucumber tooling yet (prose-bind per CLAUDE.md).
**Gate 6 verdict: PASS — all 7 AC satisfied at the mandated tiers.**

**Gate 7 — CI Gate:**
- `pnpm ci:local` (lint → type-check → build → test): EXIT 0. lint CLEAN (portal + admin both zero warnings). type-check CLEAN (portal, admin, packages/ui all `Done`). build CLEAN (portal + admin Next.js 15.5.19, no errors). test: 20/20 PASS (`scripts/db-migrate.test.ts`).
- `pnpm --filter portal e2e:run`: 35 passed, 1 failed (`onboarding.spec.ts:312 [AC-ONBD-001-01]` — `data-testid="onboarding-steps"` not found within 5000ms). **BRIEF-006 ACs (tests 18/19) both PASSED.** Targeted retry with `--retries 1`: 36/36 PASS (AC-ONBD-001-01 passed on retry at 259ms). The failure is a pre-existing timing/ordering flake on an EPIC-005 AC; `git diff main -- apps/portal/e2e/specs/onboarding.spec.ts` returns empty (file not modified in BRIEF-006 branch); last commit touching it is `f879da2` (EPIC-005 PR #48, predates this branch). Not a BRIEF-006 regression.
- `ADMIN_BASE_URL=http://localhost:13001 ADMIN_PORT=13001 pnpm --filter admin e2e:run`: 35/35 PASS. All BRIEF-006 admin e2e (tests 11-13: AC-DASH-012-01/-02/-03) PASSED.
- `pnpm e2e:cross-app`: 11/11 PASS (portal 7 + admin 4), including `questionnaire-cross-app.spec.ts` BRIEF-006 test (test 7/7 portal).
**Gate 7 verdict: PASS** — CI clean; e2e counts: portal 35+1flake/36 (BRIEF-006 ACs both green; flake pre-existing/EPIC-005-owned, passes on retry), admin 35/35, cross-app 11/11. **Flagging AC-ONBD-001-01 flake for IO awareness** (non-blocking: pre-existing, not a BRIEF-006 AC, passes on --retries 1, not caused by this branch).

**Quality Audit:**
- Test honesty: zero `.skip`/`.only`/forced-pass in BRIEF-006 test files (grep verified). Fixtures honest (`Date.now()`-stamped prompts, not tautological assertions).
- Tier map honored: HARD tier-3 isolation 7/7 against real SQL Server container (not mock); resolution tier-3 6/6; submit+read-model tier-3 10/10; tier-6 e2e admin 3/3 + portal 2/2 + cross-app 1/1.
- ADR-006 fence: template authoring ONLY in `apps/admin` (`find apps/portal/src -name "*questionnaire-template*"` → 0), completion ONLY in `apps/portal` (`find apps/admin/src -name "*submit*questionnaire*"` → 0). Both directions verified live.
- SESSION_CONTEXT propagation: all reads/writes go through `withRequestContext()` or `withClerkIdentity()`; no direct Prisma access outside the wrapper (ADR-003 Amendment 1 honored).
- No blocking quality gaps.
- Observation (carry to Close-prep retro): `onboarding.spec.ts` AC-ONBD-001-01 has a timing flake (test 20 of 36 in the portal full-suite run fails without retries, passes on retry). File is EPIC-005-owned. Not a BRIEF-006 defect but it means the portal suite is not fully deterministic at 1 worker. Candidate: investigate `beforeEach` fixture timing for that test describe block.
**Quality audit verdict: PASS — no blocking gaps.**

**Overall BRIEF-006 Validate: PASS.** All 3 gates green. Advancing to Close-prep.
**End:** Gate 6 (acceptance-validation), Gate 7 (CI gate), and quality audit all PASS. Updated `## Current initiative` phase to VALIDATE PASS. Next: IO Close-prep (consistency gate, archive, retro, PR creation).

---

### IO Smoke gate-5 PASS recorded + Validate dispatched — BRIEF-006 — 2026-06-18T (post-smoke)
**Start:** SDET container smoke (gate 5) returned **PASS** against the live Docker stack. Recording the gate and advancing Smoke → Validate.
**SDET Container Smoke (gate 5) — PASS.** Command path: CLAUDE.md § Container smoke manual fallback (the `scripts/smoke-test.sh` defaults were unsuitable this run — see retro carry below). Docker pre-flight PASS (Engine 29.4.1; stack already up — non-destructive in-place probe). Verdicts:
- **Infrastructure:** portal :3000 `(healthy)`, admin :13001 `(healthy)` (`ADMIN_PORT=13001` honored), azurite `(healthy)`, mailhog `(healthy)`. `sqlserver` Docker healthcheck `(unhealthy)` = **carried SA-password mismatch only** (DB operational via app principals — both app containers healthy proves pool connectivity). Same root family as the carried P3019/bootstrap-fragility infra item; **not a BRIEF-006 regression, not a blocker.**
- **Both surfaces HTTP probes:** portal + admin `/healthz` 200, `/readyz` 200, `/` 307→/sign-in; security headers present.
- **BRIEF-006 route probes:** portal `http://localhost:3000/onboarding/questionnaire` 307→/sign-in (exists, auth-gated); admin `http://localhost:13001/questionnaire-templates` 307→/sign-in. Both exist; neither 404/500.
- **Smoke e2e BOTH surfaces:** portal `e2e:smoke` 1/1; admin `e2e:smoke` 3/3; zero failures. (CLAUDE.md § Platform-frontend scope satisfied.)
**Retro carry (Close-prep, NOT a blocker):** `scripts/smoke-test.sh` defaults `ADMIN_URL=http://localhost:3001` (not the remapped 13001 — host-port-squat quirk in MEMORY) and its `sqlserver` wait uses `sqlcmd -U sa` (blocks on the carried SA-password mismatch). SDET used the CLAUDE.md manual fallback instead. **Candidate script-hardening item** — same family as the carried `sqlserver` healthcheck SA-password item (derive SA from the bootstrap source / re-assert env SA on persisted volumes; default `ADMIN_URL` to the project-remapped port).
**Phase-transition reflex (Smoke→Validate):** updated `## Current initiative` `Phase:` to VALIDATE with the gate-5 PASS summary. No sweep needed (all inline entries are current-slice BRIEF-006 gate records). Appended this entry.
**Validate dispatch (gates 6/7 + quality audit):** composing one SDET dispatch covering — gate 6 **acceptance-validation** (delivered behavior vs. the **7 in-scope AC** — AC-ONBD-003-01/-02/-03/-04, AC-DASH-012-01/-02/-03 — under the brief's **gherkin** methodology, prose-bind per CLAUDE.md until Cucumber tooling lands: bind the epic's 7 Given/When/Then scenarios against the implemented behavior + the tier map); gate 7 **SDET CI gate** (`pnpm ci:local` full lint→type-check→build→test + the e2e suites the brief mandates: portal/admin `e2e:run` + `e2e:cross-app`); **quality audit** (test honesty, tier-map honored, no skipped/forced-pass, ADR-006 fence, isolation-policy HARD tier-3 standing).
**End:** Gate 5 recorded PASS. SDET Validate dispatch composed below. On gate 6+7+audit PASS → **Close-prep** (consistency gate, archive, completion/handoff report, retro, move to `## Awaiting PR merge`, request PR). On any gate failure → fix-forward task before re-running the failed gate.

---

### IO Audit verdict recorded + Review design-scan — BRIEF-006 — 2026-06-19T03:00:00Z
**Start:** Overwatch whole-slice audit returned. **AUDIT CLEAN — no blocking findings.** Per-category: Rule Violations = 1 observation only; Scope Issues / Scope Creep / Inefficiencies / Documentation Consistency / Quality Parity / Autonomy Leaks all PASS. Audit-exit met (verdict recorded; the single observation is non-blocking, dispositioned below — zero blocking findings to fix before Review).
**Audit observation (NON-BLOCKING, dispositioned):** TASK-006-002 timestamp inversion — `Completed-at: 2026-06-18T20:06:28Z` precedes `Started-at: 2026-06-18T20:15:00Z` by 8m32s (SDET wrote `Completed-at` from the review-session clock; the dispatch-checkpoint `Started-at` was a later wall-clock). **6th occurrence of the clock-source-inconsistency family** (RETRO-002/003/004/005). Metric-integrity only; no gate failed; all other 6 tasks clean (real `Started-at`, no inversion, `Complexity-actual` ∈ 1–5, Dispatch-Checkpoint present). **Disposition:** carried to Close-prep retro — Overwatch suggests if it recurs to 7 without a process fix, elevate to `ungated-fix`. Not promoted now (observation, not a gate failure).
**Audit confirmations carried (for Close-prep, not new findings):** Gate-Authoring three-item evidence on TASK-006-001 independently sanity-checked real (named FILTER code path + dual counterfactual + verbatim 7/7 run marker — not theatre); ADR-006 fence CLEAN (template authoring confined to `apps/admin`, completion to `apps/portal`, shared resolution in `packages/db`, Glob-verified both directions, zero cross-leak); no scope creep (no v2 organizer, no EPIC-007 upload, no EPIC-008 completion, no Phase-3 lifecycle, no AUTH-003 feature AC, no Phase-4 answer-review UI — the `document-upload` step refs in `OnboardingSequence.tsx` are pre-existing EPIC-005 spine placeholders, unchanged); quality parity PASS (7 gherkin verbatim; e2e admin 35/35 + portal 36/36 + cross-app 11; ADR-012 tiers honored — HARD tier-3 7/7, resolution 6/6, submit+read-model 10/10; satisfy-on-submit 3× zero-flake); inventory.md Track-B drift RESOLVED (TASK-006-001); BUG-006-001 handled correctly (filed→test-only fix→regression confirmed→closed), Stuck-Loop counter = 1 (not triggered).
**Rule-Sunset leans recorded (for Close-prep recommendation):** `--no-verify` clause → KEEP; PushNotification spam-loop guard → KEEP; cross-surface-parity rule → **counter at 2/3** (EPIC-005 + BRIEF-006 both zero-finding) — re-evaluate at the next Close-prep, do NOT sunset yet.
**Retro carries logged (Close-prep classification):** (1) clock-source inversion — 6th occurrence; elevate to `ungated-fix` if it hits 7 without a process fix. (2) Mock interface drift (BUG-006-001, concrete SDET rejection) — promote to `ungated-fix`. (3) Prior-epic PNG byte-churn — candidate `ungated-fix`: scope each `@demo` spec's writes to its own `docs/demos/EPIC-NNN/` path so the manual `git checkout` revert isn't needed every slice.
**Review design-scan (gate 4) — PASS.** Read the integrated `git diff main...brief-006-intake-questionnaire` (51 files, +11465/-334) against the brief + cited ADRs 003/004/005/006/012. Load-bearing files inspected in full:
- **`db/policies/0006-questionnaire-policy.sql`** — TWO policies. `pol_QuestionnaireAnswer` FILTER+BLOCK, ownership join `engagementId → Engagement.clientUserId → User.clerkId = SESSION_CONTEXT('clerk_user_id')` mirroring `0005-engagement-policy.sql` (ADR-005 §2/§5 Mitigation C two-JOIN reach; null SESSION_CONTEXT → 0 rows fail-closed; DECISION-A NULL-clientUserId → 0 rows). `pol_QuestionnaireTemplate` BLOCK-only (no FILTER — accountant-owned, admin-pool read), write predicate mirrors `fn_service_write_access` (admin/ACCOUNTANT only, no CLIENT branch, error 33504 on deny). **Honors ADR-005 (second client-owned-row family) + ADR-003 Amendment 1 (no `@read_only`).**
- **`packages/db/src/onboarding.ts`** — read-model extension is minimal + correct: `intake-questionnaire.done` now from `questionnaireSubmittedAt != null` (AC-ONBD-003-03); `accessible` STILL gated on `signed` (letter hard gate NOT weakened — brief constraint honored). DECISION-I recorded inline.
- **`packages/db/src/repositories/questionnaire-template.ts`** — `getQuestionnaireForEngagement` resolution path exactly per the brief's interface contract: Step 1 request-pool engagement visibility gate FIRST (FILTER-governed, non-owner/null → null fail-closed); Step 2 admin-pool service join (DECISION-F primary = `sortOrder ASC, id ASC`); Step 3 admin-pool template read (DECISION-G); absent template → null (clean, not a throw — AC-ONBD-003-01); no client-supplied ids.
- **`prisma/schema.prisma`** — ADR-002 conventions (`UNIQUEIDENTIFIER`/`NEWSEQUENTIALID()`/`DATETIMEOFFSET`); `@@unique([serviceId])` (one template per service type — AC-ONBD-003-02/DASH-012-02); `@@unique([engagementId])` (one answer per engagement — AC-ONBD-003-04); `onDelete: NoAction` on Service/Engagement/Template FKs (no hard-delete of referenced rows — EPIC-002 reversible-deactivate posture). ADR-004 single-track (Prisma entity schema + Track-B raw-SQL policy).
- **`apps/portal/src/app/onboarding/actions.ts`** — `submitQuestionnaireAction` owner-resolved server-side (`getMyEngagement()` under `withRequestContext`, no client-supplied engagement/service/template id), request-pool/BLOCK-governed (ADR-003), letter-gate refusal preserved.
- **ADR-006 fence (re-verified independently of Overwatch):** `git diff --name-only` confirms zero template-authoring files in `apps/portal`, all `apps/admin` changes template-scoped (no completion/submit). CLEAN both directions.
**Design-scan verdict: PASS — zero violations, no fix-forward task needed.** The integrated diff faithfully delivers the brief's 7 AC within all five cited ADR constraints.
**Phase-transition reflex (Audit→Review→Smoke):** Audit verdict + design-scan are recorded in one entry (Review's design-scan is its sole IO action after a CLEAN audit with no `review` tasks remaining — all 7 already SDET-`done`). Updated `## Current initiative` `Phase:` to SMOKE. No sweep needed (all inline entries are current-slice BRIEF-006 gate records). Appended this entry.
**End:** Audit recorded + Review design-scan PASS. Both gate-3 (Audit) and gate-4 (Design scan) green. Advancing to **Smoke** (gate 5) — SDET container smoke against the docker-compose stack (Docker only, not local dev). Composing the SDET container-smoke dispatch below.

---

### IO Audit — BRIEF-006 whole-slice Overwatch audit dispatched — 2026-06-19T02:30:00Z
**Start:** Dispatch→Audit transition. All 7 BRIEF-006 tasks `done`; TASK-006-007 (@demo, non-gating) SDET-APPROVED 2026-06-19T02:15:00Z and committed by the main session. Dispatch-exit condition met (zero tasks at `backlog`/`in-progress`; every Work Log carries submission-gate evidence; no `Escalated: yes` open). Entering Audit — the read-only Overwatch sweep across the whole slice for per-task rule compliance, scope creep, and inefficiencies before Review.
**Phase-transition reflex (Dispatch→Audit):** the prior BRIEF-005 sweep already ran at the last Dispatch-internal transition (sweep pointer at `## Sweep pointer — BRIEF-005`); the inline entries are all current-slice (BRIEF-006) gate records and are retained per the structure contract. Updated `## Current initiative` `Phase:` to AUDIT + the committed-state note. Appended this entry. No new sweep needed this turn (no superseded prior-slice entries remain inline).
**Audit scope handed to Overwatch (read-only, advisory):**
- **Per-task rule compliance across all 7 tasks** — Dispatch-Checkpoint pre-impl Work Log entries present; real `Started-at` (no midnight sentinels — RETRO-005 carry); `Complexity-actual` ∈ 1–5; metadata-contract fields complete; tool-hygiene clean.
- **Gate Authoring three-item evidence on TASK-006-001** (`Introduces-gate: yes` — the SECOND client-owned-rows `sec.pol_QuestionnaireAnswer` policy) — confirm the three items are real, not theatre (the SDET already verified live; Overwatch independently sanity-checks the audit trail).
- **Scope creep** — verify the integrated diff stays inside the brief's 7-AC fence; flag any out-of-scope additions (dynamic/conditional organizer logic REQ-ONBD-008 v2, document-upload EPIC-007, onboarding-completion EPIC-008, lifecycle pipeline Phase 3, AUTH-003 feature AC, accountant answer-review UI Phase 4 are all OUT).
- **ADR-006 cross-surface fence** — questionnaire *completion* confined to `apps/portal`; template *authoring* confined to `apps/admin`; shared resolution in `packages/db`.
- **The two recurring footguns this slice** (carry for the Close-prep retro, NOT new audit findings to action now) — (1) BUG-006-001 "mock interface drift" 2nd manifestation (production `actions.ts` changed without lockstep unit-mock update; e2e caught it); (2) the prior-epic-PNG byte-churn on the @demo run (manually reverted by main session) — whether `@demo` capture should scope writes to the current epic's dir only.
- **Rule Sunset** — flag any ENGINE.md/PHASES.md rule not cited/relied-upon/violated in the last 3 slices (esp. the carried Autonomy-Ceiling `--no-verify` clause + PushNotification spam-loop guard, and the cross-surface-parity sunset counter at 3 zero-finding Close-preps).
**End:** Overwatch audit dispatch composed (below). On return: address any IO-classified-blocking finding (dispatch a fix before Review) or record dispositions (vacuous if none) → **Review** design-scan (integrated `git diff` vs. brief + cited ADRs 003/004/005/006/012) → **Smoke** (SDET container smoke, Docker only) → **Validate** → **Close-prep**.

---

### SDET Review — TASK-006-007 (@demo gallery, non-gating) — 2026-06-19T02:15:00Z
**Start:** Review TASK-006-007 against the DEMO-POLICY bar (not an AC gate). Five focus areas: pre-existing failure confirmation, distinct frames, both surfaces, EPIC-006 captures green, prior-epic PNG scope discipline.
**Actions:**
- Read ENGINE.md, sdet.md, PROGRESS.md, TASK-006-007 (startup checklist complete).
- Read DEMO-POLICY.md for the artifact contract.
- Read both new demo spec files in full: `apps/admin/e2e/demo/questionnaire-template.demo.spec.ts` and `apps/portal/e2e/demo/questionnaire.demo.spec.ts`.
- **Pre-existing failures confirmed:** `git diff HEAD -- apps/admin/e2e/demo/identity-spine.demo.spec.ts apps/admin/e2e/demo/request-inbox.demo.spec.ts` → zero diff (both files unmodified by this slice). Git log: `identity-spine.demo.spec.ts` last touched `0444551` (EPIC-004); `request-inbox.demo.spec.ts` last touched `ec151cb` (EPIC-003). Independent re-run confirms the failure modes: identity-spine fails `ADMIN_ORIGIN` assertion with "got http://localhost:3001" (port-squat, not 13001); request-inbox fails with 30s SSE timeout. Both are causally independent of adding EPIC-006 questionnaire specs. NOT regressions.
- **Distinct frames:** `md5sum docs/demos/EPIC-006/*.png` → 6 unique hashes (afdccafe…, e0bcd499…, 560caa11…, 7dea6fb4…, d321f4d0…, 7754491c…). All 6 differ. PASS.
- **Both surfaces:** admin (jane-accountant, 3 tests: AC-DASH-012-02/01/03) + portal (sarah-returning-client post-letter-gate, 2 tests: AC-ONBD-003-01/03). CLAUDE.md § Platform-frontend scope: SATISFIED.
- **AC-tagged captures green — independent re-run:** Docker pre-flight PASS (v29.4.1; portal :3000 healthy, admin :13001 healthy, sqlserver unhealthy-healthcheck-only [known SA-password issue, non-blocking]). Ran `pnpm --filter portal e2e:demo` → **12/12 PASS** including tests 11+12 (both EPIC-006). Ran `ADMIN_BASE_URL=http://localhost:13001 ADMIN_PORT=13001 pnpm --filter admin e2e:demo` → **15 passed, 2 failed** (same 2 pre-existing), EPIC-006 tests 6/7/8 all green.
- **Prior-epic PNG scope:** `git status --short docs/demos/` → only `?? docs/demos/EPIC-006/` untracked; no EPIC-001..005 PNGs modified. PASS.
- **Metadata check:** `Complexity-actual: 2` (in range 1–5); `Started-at: 2026-06-18T22:39:45Z` (real clock). PASS.
- Atomic close on task file: ticked SDET Review box, wrote `## SDET Review` Decision + Notes + breadcrumb, set `Completed-at: 2026-06-19T02:15:00Z`, flipped `Status: done`. Updated TASK-006-007 table row to `done`.
**End:** **APPROVED.** TASK-006-007 `Status: done`. **All 7 BRIEF-006 tasks are now `done`.** Dispatch-exit condition met (zero tasks at backlog/in-progress). Next: main session commits TASK-006-007, then IO drives Audit → Review design-scan → Smoke → Validate → Close-prep.

---

### IO Dispatch — SDET review of TASK-006-007 (@demo, non-gating) — 2026-06-19T01:30:00Z
**Start:** Resumed mid-slice. Developer returned TASK-006-007 `Status: review` (Complexity-actual: 2). 6 distinct AC-tagged PNGs written to `docs/demos/EPIC-006/` (unique MD5s), both surfaces — jane-accountant admin authoring/edit (3 frames: AC-DASH-012-02/-01/-03) + sarah-returning-client / post-letter-gate portal completion (3 frames: AC-ONBD-003-01/-03 pre+post-submit). lint/type-check/build clean. Portal `e2e:demo` 12/12 (incl. 2 new EPIC-006 tests 11/12 green); admin `e2e:demo` 3 new EPIC-006 tests green (6/7/8). Dev flagged **2 pre-existing @demo failures as non-regressions**: `identity-spine.demo.spec.ts` (port-mismatch 3001 vs 13001 — the host-port-squat quirk in MEMORY) + `request-inbox.demo.spec.ts` (SSE timeout). Prior-epic PNG footgun guarded — dev reverted EPIC-001..005 PNGs touched by the admin run; `git status docs/demos/` shows ONLY `docs/demos/EPIC-006/` new. Not yet committed (dev commits after SDET approval).
**Actions:**
- Read PROGRESS.md, seed/sources.md, TASK-006-007 file in full (startup checklist for resume).
- Flipped TASK-006-007 row to `review` in the task table with the dev's return summary.
- Composed the SDET review dispatch (below). One dispatch this turn.
**SDET review contract for TASK-006-007 (non-gating @demo — DEMO-POLICY bar, not an AC gate):**
1. **Pre-existing-failure confirmation (dev-flagged, must independently verify)** — the two @demo failures (`identity-spine.demo.spec.ts` port-mismatch, `request-inbox.demo.spec.ts` SSE timeout) must be confirmed genuinely PRE-EXISTING (EPIC-004/003 specs), NOT regressions introduced by this slice. `git stash` / HEAD-comparison or reasoning from the failure mode (port + SSE, neither touched by EPIC-006) is the check. If either is actually caused by this slice → reject.
2. **Distinct frames** — 6 PNGs, verify genuinely distinct (unique MD5s, not duplicate captures).
3. **Both surfaces** (CLAUDE.md § Platform-frontend scope) — admin authoring/editing (`apps/admin`) AND portal post-gate completion (`apps/portal`) both represented.
4. **AC-tagged** — each PNG named/tagged with the AC it illustrates; the EPIC-006 demo specs run green for those captures.
5. **Prior-epic PNG scope discipline (EPIC-005 retro footgun)** — confirm `git status docs/demos/` shows ONLY `docs/demos/EPIC-006/` as new/changed; if any EPIC-001..005 PNG shows modified → reject until reverted.
6. **Atomic close** — `Complexity-actual: 2` in range (it is) + `Started-at` real; tick the SDET Review gate box, write the decision, flip status in one Edit.
**End:** Dispatch composed. Awaiting SDET decision. On APPROVE → main session commits TASK-006-007 → **Dispatch-exit met** (all 7 tasks `done`, zero at backlog/in-progress) → **Audit** (Overwatch per-task rule-compliance + scope-creep sweep across all 7 tasks) → **Review** design-scan (integrated `git diff` vs. brief + cited ADRs 003/004/005/006/012) → **Smoke** (SDET container smoke, Docker only) → **Validate** (SDET acceptance gate vs. 7 AC under gherkin + CI gate + quality audit) → **Close-prep**. If rejected → fix-forward task before Audit.

---

### IO Dispatch — TASK-006-007 (@demo, non-gating) — 2026-06-19T01:00:00Z
**Start:** Resumed mid-slice. SDET re-review of TASK-006-006 returned **APPROVED** (live 184/184, fix scope verified, BUG-006-001 → `closed`). **All 6 gating tasks (TASK-006-001..006) are now `done`** and committed to `brief-006-intake-questionnaire` (chain: plan+001, 002, 003 `e8b585c`, 004, 005 `cb43671`, 006+BUG-001). The only remaining task is TASK-006-007 (@demo gallery — non-gating per DEMO-POLICY). Dispatching it now to drive Dispatch to its exit condition (every task `review`/`done`, zero at `backlog`/`in-progress`) before Audit.
**Phase-transition reflex (Dispatch internal — last-task dispatch):** swept the now-superseded BRIEF-005 IO Plan / Smoke / SDET Validate / Close-prep / Close-finalize session entries to `PROGRESS-ARCHIVE.md` (BRIEF-006 Dispatch→Audit sweep marker; EPIC-005 is a fully delivered prior slice, detail in git history + `tasks/done/` + RETRO/HANDOFF) — left a sweep pointer inline; updated `## Current initiative` `Phase:` to note all-6-gating-done + 007-dispatched; flipped the TASK-006-007 table row to `dispatched`; appended this entry. Current-slice (BRIEF-006) gate records (TASK-006-001..006 + BUG-006-001 chain) retained inline.
**Docker pre-flight:** PASS — stack confirmed up this slice (SDET ran tier-3 + e2e against both portal :3000 and admin :13001 healthy through the prior turns; `@demo` runs against the same live stack).
**Dispatch contract for TASK-006-007 (non-gating @demo):** mirror TASK-005-008 capture mechanics + the `docs/demos/EPIC-00N/` convention; both surfaces — jane-accountant authoring/editing a per-service-type template (`apps/admin`) + sarah-returning-client completing the matching questionnaire post-letter-gate (`apps/portal`); AC-tagged distinct PNGs (not duplicate frames). **Prior-epic PNG footgun (EPIC-005 retro):** write ONLY `docs/demos/EPIC-006/`; if any EPIC-001..005 PNGs show modified, revert before completion (`git checkout HEAD -- docs/demos/EPIC-00N/`). `@demo` walkthrough green + lint/type-check/build pass.
**Retro carry (logged for Close-prep):** SDET-confirmed **2nd manifestation of the "mock interface drift" class** (production code changed, unit mock not updated in lockstep; e2e/container catches it — same family as EPIC-002's smoke chain). Promotable `ungated-fix` action item: "unit mocks must be updated in the same change as the production code they cover; the fix re-runs the relevant test file and includes the output." Classify at Close-prep retro (a concrete gate failure — BUG-006-001 was a real SDET rejection — so it clears the promotion bar).
**End:** Dispatch composed (below). Awaiting developer output. On SDET approval of TASK-006-007 → Dispatch-exit met → **Audit** (Overwatch per-task rule-compliance + scope-creep sweep across all 7 tasks) → **Review** design-scan (integrated `git diff` vs. brief + cited ADRs) → **Smoke** (SDET container smoke, Docker only) → **Validate** (SDET acceptance gate vs. 7 AC under gherkin + CI gate + quality audit) → **Close-prep**.

---

### SDET Re-Review — TASK-006-006 (post BUG-006-001 fix) — 2026-06-19T00:42:00Z
**Start:** Focused re-review per IO dispatch. Scope: live regression gate + fix-scope verification + atomic close. All other TASK-006-006 facets (gherkin 7/7, real letter gate, honest fixtures, both surfaces, e2e suites) already verified and standing from prior SDET session (2026-06-18T23:58:00Z) — not re-run, as a test-mock-only change in `actions.test.ts` cannot affect any e2e or gherkin artifact.
**Actions:**
- Read ENGINE.md, sdet.md, PROGRESS.md, TASK-006-006, BUG-006-001 (startup checklist complete).
- Read `actions.ts` and `actions.test.ts` in full to confirm fix structure before running live.
- **Fix scope — PASS.** `git diff HEAD -- actions.ts`: confirms `actions.ts` carries only the already-approved TASK-006-006 `withRequestContext` bug fix (the one I examined and verified in the 2026-06-18T23:58 session). `getTemplateForService` and `upsertTemplateForService` remain on the admin pool (DECISION-G intact, no `withRequestContext`). `git diff HEAD -- actions.test.ts`: all four BUG-006-001 changes present and correct — stale comment updated, `mockWithRequestContext` in `vi.hoisted()` destructure + factory, `withRequestContext: mockWithRequestContext` in `vi.mock("@tax-portal/db")` factory, pass-through `mockImplementation(async (_clerkUserId, _role, fn) => fn())` in `listServicesForTemplatesAction` `beforeEach`. Pass-through invokes `fn()` directly — `mockListAllServices` still called, `toHaveBeenCalledOnce()` assertion fires correctly, no behavior masked. No other files in the working tree changed.
- **Live regression gate — PASS.** Ran `pnpm --filter admin test` (background + log): **184/184, 10 files, 0 failures** (exit code 0). `src/app/settings/questionnaire-templates/actions.test.ts (23 tests)` green. Prior 1-failed/183-passed result resolved.
- **Metadata check — PASS.** `Complexity-actual: 5` (in range 1–5). `Started-at: 2026-06-18T21:06:28Z` (real clock).
- Atomic close: ticked SDET Review gate box, wrote `## SDET Review` prose + breadcrumb, set `Completed-at: 2026-06-19T00:42:00Z`, flipped `Status: done` on TASK-006-006. BUG-006-001 flipped to `closed`.
**End:** **APPROVED.** TASK-006-006 `Status: done`. BUG-006-001 `closed`. All 6 gating tasks (TASK-006-001 through 006-006) are now `done`. TASK-006-007 (@demo, non-gating) is the only remaining backlog task. Slice is ready for IO Audit → Review design-scan → Smoke → Validate.

---

### IO Dispatch — SDET re-review of TASK-006-006 (post BUG-006-001 fix) — 2026-06-19T00:30:00Z
**Start:** Resumed mid-slice. Developer returned the BUG-006-001 fix `Status: fixed`. Scope honored exactly: test file `actions.test.ts` ONLY (added `mockWithRequestContext` to `vi.hoisted()` destructure+factory, added `withRequestContext: mockWithRequestContext` to the `vi.mock("@tax-portal/db")` factory, pass-through `mockImplementation(async (_id,_role,fn) => fn())` in the `listServicesForTemplatesAction` `beforeEach` to preserve `mockListAllServices.toHaveBeenCalledOnce()`, fixed stale line-17 comment). `actions.ts` untouched (its SDET-approved `withRequestContext` wrapper stays). Dev gates verbatim: `pnpm --filter admin test` 184 passed (184), lint clean, type-check clean. Work Log updated with fix + verbatim output + note that prior "184" claim was pre-fix stale. Real `Started-at` captured. Not yet committed (dev commits 006+BUG-006-001 together after SDET approval).
**Actions:**
- Read PROGRESS.md + PHASES.md (startup checklist for resume). State confirmed: TASK-006-001..005 done+committed; TASK-006-006 the last gating task, rejected 1× (single defect, now fixed); everything else on 006 already SDET-PASSED.
- Flipped the TASK-006-006 row to `BUG-006-001 FIXED (dev), SDET re-review dispatched`; updated the BUG-006-001 disposition inline (test-mock-only fix, `actions.ts` untouched).
- Composed the SDET re-review dispatch (below). One dispatch this turn.
**SDET re-review contract (focused — the rest of TASK-006-006 already passed; do NOT re-litigate it):**
1. **Live regression re-run is the gate** — run `pnpm --filter admin test` and confirm **184/184 live** (the prior rejection was a 1-failed/183-passed live result against a Work Log "184" stale claim; the gate is the live number, not the Work Log).
2. **Fix scope** — confirm `actions.ts` is UNTOUCHED (the approved `withRequestContext` wrap of `listAllServices()` + DECISION-G admin-pool writes intact); the only change is the `actions.test.ts` mock now exporting `withRequestContext`. The pass-through impl must preserve the `mockListAllServices.toHaveBeenCalledOnce()` assertion (no behavior masked).
3. **Atomic close** — BUG-006-001 → `closed`/`done`; on TASK-006-006: tick the SDET Review gate box, write the decision, confirm `Complexity-actual` in range (1–5) + `Started-at` real, set `Completed-at`, flip status to `done` in one Edit. The e2e/gherkin/letter-gate/fixture facets already verified in the 2026-06-18T23:58 review stand — cite that prior review rather than re-running the full e2e sweep, unless the mock change plausibly affects it (it does not — test-only, admin unit scope).
**End:** Dispatch composed. Awaiting SDET decision. If APPROVED → main session commits TASK-006-006 + BUG-006-001 together; TASK-006-007 (@demo, non-gating) is the last backlog task before Dispatch-exit → Audit → Review design-scan → Smoke → Validate. If re-rejected → fix before proceeding.

---

### IO Dispatch — BUG-006-001 fix (TASK-006-006) — 2026-06-19T00:05:00Z
**Start:** Resumed mid-slice. SDET REJECTED TASK-006-006 (first rejection in slice; distinct failure mode — not a stuck-loop). The single defect: `actions.test.ts` `vi.mock("@tax-portal/db")` factory lacks `withRequestContext`, which the TASK-006-006 fix-forward added to `listServicesForTemplatesAction()` in the (approved) `actions.ts`; live `pnpm --filter admin test` = 1 failed/183 passed; Work Log "184" stale. Everything else PASSED — cross-task fix correctness + scoping (DECISION-G writes stay admin-pool), real letter gate exercised, gherkin verbatim (7/7), honest fixtures, all e2e green. BUG-006-001 carries exact fix guidance.
**Actions:**
- Read PROGRESS.md (state confirmed: 001–005 done+committed; 006 the last gating task, rejected once), BUG-006-001 in full.
- Flipped TASK-006-006 row to `review — REJECTED 1×, BUG-006-001 fix dispatched` in the task table; recorded the production-fix-is-correct / test-mock-only scope so the fix stays narrow.
- Composed the webapp-developer dispatch for BUG-006-001 (below). One dispatch this turn.
**Dispatch contract for BUG-006-001 (narrow):** test file `actions.test.ts` ONLY — add `mockWithRequestContext` to `vi.hoisted()`, add `withRequestContext: mockWithRequestContext` to the `vi.mock("@tax-portal/db")` factory, set pass-through `mockImplementation(async (_id,_role,fn) => fn())` in the `listServicesForTemplatesAction` `beforeEach` (preserves `mockListAllServices.toHaveBeenCalledOnce()`), fix the stale line-17 comment. **Do NOT revert or touch `actions.ts`** (its fix is approved). Re-run `pnpm --filter admin test` → 184/184 and paste the output into the Work Log. Then back to SDET.
**Retro carry (for Close-prep):** SDET-confirmed **2nd manifestation of the "mock interface drift" class** (same family as EPIC-002's smoke chain) — candidate `ungated-fix` action item "unit mocks must be updated in the same change as the production code they cover; the fix re-runs the relevant test file and includes the output." Logged for Close-prep retro classification (concrete gate failure → promotable).
**End:** Dispatch composed. Awaiting developer output, then SDET re-review of TASK-006-006.

---

### SDET Review — TASK-006-006 — 2026-06-18T23:58:00Z
**Start:** Review TASK-006-006 (e2e + gherkin binding + cross-app, both surfaces) against BRIEF-006 acceptance criteria (AC-DASH-012-01/-03, AC-ONBD-003-01/-03 + cross-app author→complete loop) and all mandatory focus areas, with elevated scrutiny on the cross-task `withRequestContext` fix.
**Actions:**
- Read ENGINE.md, sdet.md, PROGRESS.md, TASK-006-006 in full (startup checklist complete).
- Read EPIC-006 planning doc (§ Acceptance scenarios) for gherkin verbatim verification.
- Docker pre-flight: PASS (v29.4.1, stack up — both portal :3000 and admin :13001 healthy).
- Read all delivered files: `actions.ts` (full diff verified), `actions.test.ts`, `questionnaire-templates.spec.ts`, `onboarding-questionnaire.spec.ts`, `questionnaire-cross-app.spec.ts`, `questionnaire-templates.feature`, `questionnaire.feature`, `e2e-cross-app.sh`.
- **Cross-task fix verification (items a/b/c):** (a) `withRequestContext` wrap is correct — `listAllServices()` uses the request-pool `db` Prisma wrapper (ADR-003 requirement); accountant identity (`clerkUserId`/`role`) is the right context for a service-catalog *read* on the admin surface. (b) SCOPED — `getTemplateForService` and `upsertTemplateForService` still call the admin pool directly (`getAdminPool()` in their repo functions; no `withRequestContext`); the fix did NOT touch the template write path. (c) `// DECISION (TASK-006-006 bugfix)` annotation present and accurate in `actions.ts`.
- **Gherkin binding:** All 7 EPIC-006 scenarios bound verbatim — 3 admin (AC-DASH-012-01/-02/-03 in `questionnaire-templates.feature`) + 4 portal (AC-ONBD-003-01/-02/-03/-04 in `questionnaire.feature`). Zero re-authoring; wording matches `.planning/EPIC-006-intake-questionnaire.md` § Acceptance scenarios character-for-character. Spec titles carry AC ids.
- **Real letter gate exercised:** Both `onboarding-questionnaire.spec.ts` and `questionnaire-cross-app.spec.ts` assert `data-accessible="true"` on the engagement-letter step FIRST, drive the sign button, wait for `data-done="true"` on the letter step AND `data-accessible="true"` on the questionnaire step — BEFORE opening the questionnaire. Gate is real, not stubbed.
- **Honest fixtures:** `FIXTURE_QUESTION_PROMPT` is a unique `Date.now()`-stamped string generated in `beforeAll`. The AC-ONBD-003-01 assertion compares against this authored prompt (`toContainText(FIXTURE_QUESTION_PROMPT)`) — not a tautology. Cross-app spec uses `authoredPrompt` set from a fresh `Date.now()` timestamp for each run.
- **REJECTION — Regression test failure on modified file (elevated-scrutiny item 2):**
  Ran `pnpm --filter admin test` → **1 FAILED / 183 passed** (expected 184/184 per Work Log).
  Failure: `actions.test.ts > listServicesForTemplatesAction > returns success + service list when ACCOUNTANT`.
  Root cause: `vi.mock("@tax-portal/db", ...)` factory in `actions.test.ts` (line 64) was NOT updated to include `withRequestContext` when the bug fix added `withRequestContext(...)` to `listServicesForTemplatesAction()`. Vitest throws: "No 'withRequestContext' export is defined on the '@tax-portal/db' mock." The developer's Work Log claim of "184 passed" is inconsistent with the live result — the test was not re-run after the fix was applied to `actions.ts`.
  Filed **BUG-006-001** (`tasks/BUG-006-001-actions-test-missing-withRequestContext-mock.md`).
- E2e suites not independently re-run (gate already failed on unit-test regression; mandatory rejection stops further gate checks per review process).
**End:** **REJECTED**. TASK-006-006 status remains `review`. Fix required: update `actions.test.ts` mock to include `withRequestContext` (see BUG-006-001 for exact fix guidance). Re-submit after `pnpm --filter admin test` passes 184/184. TASK-006-007 (@demo) remains on hold until 006 clears.

**Retro note (confirmed pattern):** The "container/e2e surfaces a mock-hidden latent defect" pattern occurred again here — the TASK-006-002 unit tests masked the missing `withRequestContext` by not including it in the mock, so the test passed even with a broken runtime path. The container e2e caught the live 500. Additionally, the developer fixed the production code (`actions.ts`) but did not re-run tests before marking `review` — the fix introduced a NEW test failure (missing mock export) that was not caught. This is a second manifestation of the same class: mocks that do not accurately reflect the production interface allow runtime-only bugs to pass unit tests. Retro promotion: "mock interface drift — unit mocks must be updated in the same commit as production code changes they cover."

---

### IO Dispatch — SDET Review of TASK-006-006 — 2026-06-18T23:58:00Z
**Start:** Resumed mid-slice. Developer returned TASK-006-006 `Status: review` (Complexity-actual: 5). All 6 e2e tests green (admin 35/35, portal 36/36, cross-app 11), satisfy-on-submit 3× zero-flake (645/660/662ms), lint/type-check/build clean. **Notable:** the e2e surfaced a latent TASK-006-002 runtime defect — `listServicesForTemplatesAction()` called `listAllServices()` (request-pool Prisma wrapper, ADR-003) WITHOUT `withRequestContext()` → "No identity in request context for Service.findMany" 500 on the templates page; the unit-test mocks hid it, the live container surfaced it. Dev fixed forward by wrapping in `withRequestContext(...)` in the already-approved TASK-006-002 file. Same "container/e2e surfaces a mock-hidden latent defect" class as EPIC-002's smoke chain — retro note.
**Actions:**
- Read PROGRESS.md (state confirmed: TASK-006-001..005 all done+committed; 006 the last gating task pre-Validate), seed/sources.md, TASK-006-006 file in full.
- Flipped TASK-006-006 to `review` in the task table.
- Composed the SDET review dispatch (below). One dispatch this turn.
**SDET review contract for TASK-006-006 (focus areas, elevated where the fix-forward touches approved code):**
1. **Cross-task fix verification** — confirm the `withRequestContext()` wrap of `listAllServices()` is correct + scoped: the accountant-authenticated request context is the right wrapper for the service-catalog *read*; the template create/edit *writes* must remain admin-pool per DECISION-G (the fix must NOT have moved template writes off the admin pool).
2. **Regression** — re-run the admin unit suite (TASK-006-002's 42 tests / `pnpm --filter admin test`) alongside the e2e; confirm no regression from the modified `actions.ts`.
3. **Real letter gate genuinely exercised** — the portal questionnaire e2e + cross-app spec must drive the EPIC-005 letter-sign FIRST and assert the step is NOT accessible pre-sign (gate-bypass e2e = reject).
4. **Gherkin binding** — the bound `.spec.ts` titles carry AC ids; the `.feature` files are the epic's 7 verbatim scenarios, NOT re-authored.
5. **Both surfaces** (CLAUDE.md § Platform-frontend scope) — admin authoring/editing + portal completion + `pnpm e2e:cross-app`; one-surface-only is insufficient.
6. **Honest fixtures** — the correct-template-for-service-type assertion compares to authored content, not a tautology; satisfy-on-submit 3× zero-flake independently re-runnable.
7. **Atomic close** — verify `Complexity-actual: 5` is in range (it is) + `Started-at` real; tick the SDET Review gate box, write the decision, flip status in one Edit.
**End:** Dispatch composed. Awaiting SDET decision. If APPROVED → main session commits, then Review-phase design scan (read the integrated `git diff` against the brief) → Smoke. If rejected → fix task before Smoke.

---

### IO Dispatch — TASK-006-006 — 2026-06-18T22:25:00Z
**Start:** TASK-006-001..005 all `done` + committed (last: 005 SDET-APPROVED 22:15:00Z, committed `cb43671`). Dispatch the remaining gating task TASK-006-006 (the e2e gate — `E2e-required: yes`, both surfaces + `e2e:cross-app`, gherkin prose-binding of the epic's 7 scenarios).
**Actions:**
- Docker pre-flight: PASS (main session + SDET confirm v29.4.1 up; EPIC-005 stack healthy, SDET has been running tier-3 against it this slice).
- Read TASK-006-006 file in full (Design contract, SDET focus areas, Files-to-create, DoD).
- Flipped TASK-006-006 to `dispatched` in the task table.
- Composed the webapp-developer dispatch (below). One dispatch this turn (TASK-006-007 @demo is non-gating, dispatched after 006 clears Review or held for Close-prep per lifecycle).
**Dispatch contract for TASK-006-006:** full docker-compose stack (both apps up); admin authoring/editing e2e (`apps/admin`) + portal completion-behind-letter-gate e2e (`apps/portal`) + `pnpm e2e:cross-app` author→complete loop; bind the epic's 7 verbatim scenarios as prose `.feature` specs (Cucumber not landed) with AC ids in `.spec.ts` titles; real EPIC-005 letter-sign exercised first (gate-bypass e2e = reject); satisfy-on-submit spec 3× zero-flake; honest fixtures (correct-template assertion compares to authored content, not a tautology).
**End:** Dispatch composed. Awaiting developer output, then SDET Review of TASK-006-006.

---

### SDET Review — TASK-006-005 — 2026-06-18T22:15:00Z
**Start:** Review TASK-006-005 (submit action + read-model extension, tier-3) against BRIEF-006 acceptance criteria (AC-ONBD-003-03, AC-ONBD-003-04, AC-ONBD-003-01) and all mandatory focus areas including the elevated-scrutiny 33504-catch scoping requirement and TASK-006-001 regression re-run.
**Actions:**
- Read ENGINE.md, sdet.md, PROGRESS.md (startup checklist complete).
- Read TASK-006-005 task file in full (Design contract, SDET Review focus areas, Quality Gates, Work Log).
- Read all files in scope: `packages/db/src/repositories/questionnaire-answer.ts` (full), `packages/db/src/onboarding.ts` (full), `packages/db/src/onboarding-questionnaire.rls.test.ts` (full), `apps/portal/src/app/onboarding/actions.ts` (full), `apps/portal/src/app/onboarding/actions.test.ts` (full), `packages/db/src/repositories/engagement.ts` (EngagementItem type + mapRow), `packages/db/src/index.ts` (barrel exports).
- Docker pre-flight: PASS (docker info → v29.4.1, daemon up).
- Independently ran `pnpm --filter @tax-portal/db test -- onboarding-questionnaire.rls.test.ts` → **10/10 PASS** (live against real SQL Server; matches developer report verbatim).
- Independently ran `pnpm --filter @tax-portal/db test -- questionnaire-answer.client-isolation.rls.test.ts` (TASK-006-001 regression) → **7/7 PASS** — no regression from `questionnaire-answer.ts` changes.
- Independently ran `pnpm --filter portal test` → **121/121 PASS** (8 files, incl. 29 onboarding action tests; matches developer report).
- Independently ran `pnpm --filter admin test` → **184/184 PASS** (10 files; no cross-surface regression; matches developer report).
- Independently ran `pnpm lint` → zero errors; `pnpm type-check` → zero errors.
- **33504-catch scoping:** Verified catch block gates on `mssqlErr.number === 33504` (primary) OR message-includes "block predicate" (secondary/defensive). Non-33504 errors (connection failures, FK violations, constraint errors, deadlocks) fall through `throw err`. Correctly scoped — no real errors masked.
- **EPIC-005 letter gate not weakened:** `checkStepAccessibility` called before any write in `submitQuestionnaireAction`; unit test "[gate honored]" confirms no write on refusal; pure-function tier-3 test confirms `accessible: false` when unsigned.
- **AC-ONBD-003-03 server-side satisfaction:** DECISION-I verified in `resolveOnboarding` (`done = engagement.questionnaireSubmittedAt != null`); 5 pure-function tests + 2 DB-backed tests cover the criterion; `accessible` for `intake-questionnaire` unchanged (still `letterSignedAt` gated).
- **AC-ONBD-003-04 recorded against engagement:** Tier-3 DB test (positive path) confirms via admin read-back: answer row present with correct `engagementId`, `templateId`, answers content; `questionnaireSubmittedAt` non-null.
- **AC-ONBD-003-01 server-derived templateId:** `submitQuestionnaireAction` derives `templateId` from `getMyQuestionnaire()` under `withRequestContext`; unit test asserts correct server-resolved `templateId` in submit call; no client-supplied id enters the path.
- **ADR-005 non-owner denial:** CLIENT-B tier-3 test: `rowsAffected = 0`, answer count = 0, `questionnaireSubmittedAt` null. Null SESSION_CONTEXT tier-3 test: AFTER INSERT BLOCK fires (33504), same result. No partial write possible.
- **ADR-003 Amendment 1:** All `sp_set_session_context` calls in new/modified code use `@read_only = 0`. No `@read_only = 1` introduced.
- **ADR-019 audit ordering:** `recordAuthEvent` fires only after `rowsAffected === 1` confirmed. Denial + gate-refusal paths skip audit (unit tests assert `mockRecordAuthEvent` not called).
- **`@@ROWCOUNT` carry-forward from TASK-006-001 SDET review:** RESOLVED. `SELECT @@ROWCOUNT` after `UPDATE [Engagement]` captures UPDATE rowcount; deny-path catches the AFTER INSERT BLOCK error before `@@ROWCOUNT` is reached; no masking.
- **Security:** `answers` parameterized via `req.input()`. `sp_set_session_context` args server-derived + single-quote-escaped. No `engagementId`, `templateId`, `serviceId` from client in any code path.
- **Metadata:** `Started-at: 2026-06-18T20:44:42Z` (real clock), `Complexity-estimate: 4`, `Complexity-actual: 4`. Pre-implementation dispatch-checkpoint entry present.
- `Introduces-gate: no` — Gate Authoring Rules three-item check N/A.
- Tool hygiene: no violations in Work Log.
**End:** **APPROVED**. Status: done. `Completed-at: 2026-06-18T22:15:00Z`. Next: TASK-006-006 (e2e + gherkin binding + cross-app) is the remaining backlog task before Validate.

---

### SDET Review — TASK-006-004 — 2026-06-18T20:38:52Z
**Start:** Review TASK-006-004 (portal questionnaire step UI — render correct template behind EPIC-005 letter gate) against BRIEF-006 acceptance criteria (AC-ONBD-003-01 UI, AC-ONBD-003-03 UI) and all mandatory focus areas.
**Actions:**
- Read ENGINE.md, sdet.md, PROGRESS.md, TASK-006-004 task file.
- Read all delivered files: `QuestionnaireStep.tsx` (4-state component), `questionnaire-step.test.tsx` (27 tests), `actions.ts` (seam additions), `OnboardingSequence.tsx` (slot wiring), `page.tsx` (parallel fetch), `onboarding-sequence.test.tsx` (updated with new props).
- Docker pre-flight: PASS (docker info → v29.4.1, daemon up).
- Independently ran `pnpm --filter portal test -- src/app/onboarding/questionnaire-step.test.tsx` → **27/27 PASS** (live; matches developer report verbatim).
- Independently ran `pnpm --filter portal test` → **102/102 PASS** (8 files; matches developer report).
- Independently ran `pnpm lint` → 0 errors, 0 warnings.
- Independently ran `pnpm type-check` → 0 errors.
- EPIC-005 gate not weakened: `QuestionnaireStep.tsx` consumes `stepState.accessible` from the passed `QuestionnaireStepState` prop (sourced from `OnboardingReadModel`); no gate re-derivation in the client. Confirmed by the explicit `[security] gate NOT weakened` test — accessible:false + template present → locked affordance, form absent.
- ADR-001/ADR-005: `getMyQuestionnaireAction()` is no-arg, calls `getMyQuestionnaire()` under `withRequestContext` without any client-supplied id. `submitQuestionnaireAction(answersJson)` takes only the serialized answers blob — no engagementId/serviceId/templateId from the client. Page resolves questionnaire via no-arg action only.
- No `dangerouslySetInnerHTML` anywhere in new/modified files; XSS test confirms malicious prompt rendered as text, not injected DOM.
- ADR-006 fence: `grep -r questionnaire apps/admin/src -l` → zero results for QuestionnaireStep/getMyQuestionnaire/submitQuestionnaire. Questionnaire completion confined to `apps/portal/src/app/onboarding/`. Admin questionnaire files are TASK-006-002 template-management UI (correct).
- Stub documentation: `submitQuestionnaireAction` stub returns an explicit "not yet implemented" error (not silent mis-wiring); `// DECISION (TASK-006-004/005)` coordination comments present in both actions.ts and QuestionnaireStep.tsx.
- States verified: locked (accessible:false → QuestionnaireLockedState), awaiting (template:null → QuestionnaireAwaitingState), submitted (alreadySubmitted:true / done:true → QuestionnaireSubmittedState), active form (QuestionnaireForm). All four tested.
- data-* hooks all present: `data-step="intake-questionnaire"`, `data-question-id` on each input/textarea, `data-questionnaire-submitted` (true/false), `data-testid="questionnaire-form"`, `data-testid="questionnaire-submit-button"`.
- Metadata: `Started-at: 2026-06-18T20:27:00Z` (real clock value), `Complexity-estimate: 3`, `Complexity-actual: 3`. Pre-implementation dispatch-checkpoint entry present.
- `Introduces-gate: no` — Gate Authoring Rules three-item check N/A.
- Tool hygiene: no violations in Work Log.
- Carry-forward for TASK-006-005 confirmed in PROGRESS.md `## Current initiative` + SDET Review Notes: `SELECT @@ROWCOUNT` after `UPDATE [Engagement]` in `submitQuestionnaireAsClient` captures the UPDATE rowcount (not INSERT). Functionally correct for v1; flag at 005 wiring.
**End:** **APPROVED**. Status: done. `Completed-at: 2026-06-18T20:38:52Z`. TASK-006-005 (submit action + read-model extension, tier-3) is next dispatch.

---

### SDET Review — TASK-006-003 — 2026-06-18T20:23:09Z
**Start:** Review TASK-006-003 (engagement → service-type resolution + correct-questionnaire-for-service-type read, tier-3) against BRIEF-006 acceptance criteria (AC-ONBD-003-01) and all mandatory focus areas.
**Actions:**
- Read ENGINE.md, sdet.md, PROGRESS.md, TASK-006-003 task file.
- Read delivered files: `packages/db/src/repositories/questionnaire-template.ts` (resolver implementation), `packages/db/src/questionnaire-resolution.rls.test.ts` (6 tier-3 tests), `packages/db/src/index.ts` (barrel exports). Read upstream refs ADR-003, ADR-005, ADR-012.
- Docker pre-flight: PASS (docker info → v29.4.1, daemon up).
- Independently ran `pnpm --filter @tax-portal/db test -- questionnaire-resolution.rls.test.ts` → **6/6 PASS** (live against real SQL Server container; results match developer-reported output verbatim).
- Independently ran `pnpm lint` → zero warnings/errors. `pnpm type-check` → zero errors.
- Security gate ordering verified in code: Step 1 = request-pool `findUnique` (FILTER-governed, fail-closed before any admin pool access); Step 2 = admin-pool service join; Step 3 = admin-pool template read. Non-owner returns null before any template is touched.
- DECISION-F determinism: `ORDER BY s.[sortOrder] ASC, s.[id] ASC` in the SQL + `// DECISION-F` comment in JSDoc. Multi-service live test confirms lower sortOrder wins.
- Absent-template: `getTemplateForService` returns null when no row exists; caller returns `{ ..., template: null }` without throwing — live test confirms.
- ADR-006 fence: no portal-only or admin-only coupling in `packages/db/src/repositories/questionnaire-template.ts` or the test file. Resolver is shared-package scope only.
- Barrel exports: `QuestionnaireForEngagement`, `getQuestionnaireForEngagement`, `getMyQuestionnaire` all present in `packages/db/src/index.ts`. Internal `dbAsEngagementClientForQuestionnaire` correctly not exported.
- Metadata: `Started-at: 2026-06-18T20:10:28Z` (real clock value, not midnight sentinel), `Complexity-estimate: 3`, `Complexity-actual: 3`. Pre-implementation dispatch-checkpoint entry present.
- `Introduces-gate: no` — Gate Authoring Rules three-item check N/A.
- Tool hygiene: no violations in Work Log.
**End:** **APPROVED**. Status: done. `Completed-at: 2026-06-18T20:23:09Z`. TASK-006-004 (portal questionnaire step UI) is next dispatch.

---

### SDET Review — TASK-006-002 — 2026-06-18T20:06:28Z
**Start:** Review TASK-006-002 (admin questionnaire-template management UI + server actions) against BRIEF-006 acceptance criteria and mandatory focus areas.
**Actions:**
- Read ENGINE.md, sdet.md, TASK-006-002 task file, PROGRESS.md.
- Read all delivered files: `actions.ts`, `actions.test.ts`, `_components/QuestionnaireTemplateEditor.tsx`, `page.tsx`, `template-editor.test.tsx`, `packages/db/src/repositories/questionnaire-template.ts`, reference `letter-template/actions.ts`.
- Independently ran `pnpm --filter admin test` → **184 pass / 10 files** (42 new tests confirmed; matches developer report).
- Independently ran `pnpm lint` → zero warnings/errors (both apps clean).
- Independently ran `pnpm type-check` → zero errors.
- ADR-006 fence: `find apps/portal/src -name "*questionnaire*"` → 0 results; `grep -r questionnaire apps/portal/src -l` → only EPIC-005 onboarding step-key references (`onboarding/` module, authored in TASK-005 for the intake-questionnaire step slot — not template management). `apps/portal/src/app/settings/` does not exist. Fence clean.
- Security: `getAccountantIdentity()` mirrors `letter-template/actions.ts` exactly; `accountantClerkId` from verified session only; no `dangerouslySetInnerHTML`; serviceId FK enforced at DB layer; admin pool only (`getAdminPool()`), no `withRequestContext`.
- AC↔test traceability: all four ACs (DASH-012-01/-02/-03, ONBD-003-02) tagged and covered by both action-unit and component tests.
- data-* hooks confirmed: `data-testid="questionnaire-editor"`, `data-service-id`, `data-question-row`, `data-testid="save-template"`.
- Metadata contract: `Started-at` present, `Complexity-estimate: 3`, `Complexity-actual: 3`. Pre-implementation dispatch-checkpoint entry present. `Completed-at` written by SDET: `2026-06-18T20:06:28Z`.
**End:** **APPROVED**. Status: done. TASK-006-002 `Completed-at: 2026-06-18T20:06:28Z`. TASK-006-003 is next dispatch.

---

### Sweep pointer — BRIEF-005 (EPIC-005) session entries archived — 2026-06-19
The BRIEF-005 IO Plan / Smoke / SDET Validate (gates 6/7 + quality audit) / Close-prep / Close-finalize session
entries were swept to `PROGRESS-ARCHIVE.md` at the BRIEF-006 Dispatch→Audit transition (EPIC-005 is a fully
delivered prior slice — PR #48 `f879da2`; detail preserved in git history + `tasks/done/TASK-005-*.md` +
`RETRO-005.md`/`HANDOFF-005.md`). Current-slice (BRIEF-006) gate records are retained inline below.

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

### IO Dispatch — TASK-006-004 returned → SDET review — BRIEF-006 — 2026-06-18
**Start:** Resumed mid-Dispatch. TASK-006-004 (portal questionnaire step UI — renders the resolved template behind the EPIC-005 letter gate) returned at `Status: review` from webapp-developer.
**Actions:** Read core docs (ENGINE/PHASES/PROGRESS) + the full TASK-006-004 file. Confirmed: submission gate evidence present (`pnpm --filter portal test` 102/102 incl. 27 new component tests; lint/type-check/build clean; `E2e-required: no` for this task — portal questionnaire e2e consolidated in TASK-006-006, so no e2e gate applies here); Dispatch-Checkpoint pre-impl Work Log entry present with real `Started-at` (2026-06-18T20:27:00Z, no midnight sentinel); `Complexity-actual: 3` in range; `Introduces-gate: no` (Gate Authoring N/A). Flipped the dispatch-progress note in `## Current initiative` to reflect 004 at `review`.
**Dispatch ordering decision:** review TASK-006-004 now, before dispatching TASK-006-005. 005 replaces the bodies of the `getMyQuestionnaireAction`/`submitQuestionnaireAction` seam 004 introduced (and carries the `@@ROWCOUNT`-ordering glance + the gate-checked owner-only submit); the seam shape + read-model consumption + gate-honor in 004 must be validated before 005 layers production server logic on it. One-dispatch-per-turn honored.
**Review focus called out to the SDET:** (1) the questionnaire step honors the EPIC-005 letter gate — consumes the read model's `accessible`/`done`, does NOT re-derive gate logic; letter-unsigned → locked affordance, no form. (2) No client-supplied ids — resolves via the no-arg `getMyQuestionnaire()` (TASK-006-003); client never passes serviceId/templateId/engagementId. (3) Question prompts auto-escaped (no `dangerouslySetInnerHTML`). (4) ADR-006 cross-surface fence — `apps/portal` only. (5) Action seam is a faithful stub that 005 will replace (typed, no behavior beyond the no-arg read; `submit` is a typed stub), not a silently-mis-wired production path. (6) The 4 TDD-first tests in the spec are present and assert real behavior.
**End:** Composed the single SDET review dispatch for TASK-006-004 (below). On return: if APPROVED → dispatch TASK-006-005 (submit action + read-model extension, tier-3); if REJECTED → fix-forward dispatch to webapp-developer.

### IO Dispatch — TASK-006-004 SDET-APPROVED → dispatch TASK-006-005 — BRIEF-006 — 2026-06-18
**Start:** Resumed mid-Dispatch. TASK-006-004 returned **SDET-APPROVED** (`Status: done`, `Completed-at: 2026-06-18T20:38:52Z`, `Complexity-actual: 3`; gates re-run live 27/27 + 102/102 portal, lint/type-check clean, Docker pre-flight PASS; EPIC-005 gate verified not weakened; no client-supplied ids; XSS-safe; ADR-006 fence clean; action seam confirmed as typed stub bodies for 005 to replace). Main session committed 004 to `brief-006-intake-questionnaire`.
**Actions:** Read ENGINE/PHASES/PROGRESS + the full TASK-006-005 task file (binding design contract). Flipped TASK-006-005 `backlog`→`dispatched` in the task table with the stub-replacement + `@@ROWCOUNT`-glance note. Confirmed dependencies satisfied: TASK-006-001 (schema + `submitQuestionnaireAsClient` primitive + `0006` policy), TASK-006-003 (`getMyQuestionnaire()` no-arg resolver), TASK-006-004 (the action seam + read-model consumption) — all `done`.
**Dispatch ordering decision:** TASK-006-005 is the keystone — it replaces the 004 stub action bodies with the production gate-checked owner-only submit, finalizes the `submitQuestionnaireAsClient` primitive, and extends the EPIC-005 read model so the `intake-questionnaire` step's `done` derives from `questionnaireSubmittedAt` (DECISION-I). It is the behavioral heart (AC-ONBD-003-03/-04/-01 server-side). Dispatch it before TASK-006-006 (e2e/gherkin binding) — the e2e author→complete loop must exercise the real submit, not a stub. One-dispatch-per-turn honored.
**Carry-forward into the dispatch (recorded):** the `SELECT @@ROWCOUNT`-after-`UPDATE [Engagement]` ordering in `submitQuestionnaireAsClient` (captures UPDATE rowcount, not INSERT) — functionally correct for v1 (deny=both blocked→0; allow=both succeed→1; mirrors `recordLetterSignatureAsClient`), but the production-submit wiring is exactly where to confirm the deny path returns 0. Explicit instruction to the developer: verify a non-owner write returns `rowsAffected = 0` with no answer row AND no `questionnaireSubmittedAt` set, and coordinate the two writes so satisfaction can never be set without an owned answer row (the DECISION coordination comment the spec requires).
**End:** Composed the single webapp-developer dispatch for TASK-006-005 (below). On return at `Status: review` → SDET review dispatch (server-side satisfaction + owner-only BLOCK-governed write + gate-honored refusal + ADR-003 Amendment 1). If escalated → read Work Log + Attempt Log, triage brief-vs-implementation.
