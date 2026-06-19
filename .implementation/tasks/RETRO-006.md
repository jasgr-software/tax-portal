# RETRO-006 — BRIEF-006 / EPIC-006 (Intake questionnaire — per-service-type templates + client completion)

**Slice:** step 2 of the onboarding sequence — the **intake questionnaire**, on top of the delivered EPIC-005
onboarding spine + letter gate. The accountant authors/maintains a **per-service-type** questionnaire template
in `apps/admin` (the **first per-service-type template** — contrast EPIC-005's single global `LetterTemplate`);
the client — having passed the EPIC-005 letter gate — reaches step 2 in `apps/portal`, is shown the
questionnaire **for their engagement's service type** (resolved server-side), completes + submits, and their
answers are **recorded against the engagement** (the **second client-owned-row family**, with its own ADR-005
isolation policy `db/policies/0006-*`). The step is satisfied **only on submit**, evaluated server-side in the
EPIC-005 read model — and stays behind the letter hard gate (not weakened). **7 in-scope AC.** Branch
`brief-006-intake-questionnaire` → PR (pending — `## Awaiting PR merge`). **Brief-type:** feature ·
**Brief-deploys:** no.

## 9-gate scorecard (pre-merge)

1. **Per-task submission gates** — ✅ 7/7 (every developer Work Log carries lint/type-check/build/test + e2e evidence where mandated).
2. **SDET Review** — ✅ 7/7 tasks approved. One concrete rejection during the slice (TASK-006-006 → BUG-006-001), fixed and re-approved (see Retro classification item 1).
3. **Overwatch Audit** — ✅ **CLEAN, 0 blocking.** Per-category: Rule Violations 1 observation only (the clock-source inversion below); Scope Issues / Scope Creep / Inefficiencies / Documentation Consistency / Quality Parity / Autonomy Leaks all PASS. Gate-Authoring three-item evidence on TASK-006-001 independently sanity-checked real (named FILTER code path + dual counterfactual + verbatim 7/7 run marker — not theatre). ADR-006 fence CLEAN both directions.
4. **IO Design scan** — ✅ integrated diff (51 files, +11465/−334, scoped to EPIC-006) honors every cited ADR (003/004/005/006/012) + the DECISION-F–I contract; 0 violations → 0 fix-forward tasks. Load-bearing files inspected in full: `db/policies/0006-questionnaire-policy.sql`, `packages/db/src/onboarding.ts`, `packages/db/src/repositories/questionnaire-template.ts`, `prisma/schema.prisma`, `apps/portal/src/app/onboarding/actions.ts`.
5. **Container Smoke** — ✅ PASS. Non-destructive smoke vs. the live docker stack (CLAUDE.md manual fallback — `scripts/smoke-test.sh` defaults unsuitable, see item 5). Both surfaces `/healthz`/`/readyz` 200; BRIEF-006 routes (portal `/onboarding/questionnaire`, admin `/questionnaire-templates`) exist + auth-gate (307→/sign-in); portal `e2e:smoke` 1/1 + admin `e2e:smoke` 3/3. `sqlserver` healthcheck `(unhealthy)` = carried SA-password/volume mismatch (DB operational via app principals — both app containers healthy).
6. **SDET Acceptance-validation** — ✅ APPROVED. All **7 in-scope AC** independently validated under the bound gherkin prose-bind (7 `.feature` files authored verbatim from EPIC-006 scenarios; `.spec.ts` titles carry AC ids); each scenario text ↔ test assertion confirmed (not AC-tag-sharing). The **second ADR-005 client-isolation HARD three-item test** verified live against the real container (7/7). Out-of-scope fence honored.
7. **SDET CI gate** — ✅ PASS. `pnpm ci:local` EXIT 0 (lint clean both surfaces, type-check clean portal/admin/packages, build clean Next.js 15.5.19, scripts test 20/20). e2e: portal 36/36 (one transient AC-ONBD-001-01 flake on first run — pre-existing/EPIC-005-owned, passed on `--retries 1`; BRIEF-006 tests 18/19 green both runs), admin 35/35, cross-app 11/11. Quality audit CLEAN — no `.skip`/`.only`/forced-pass; honest `Date.now()`-stamped fixtures; tier map honored; ADR-006 fence clean; SESSION_CONTEXT via the wrapper (ADR-003 Amendment 1, no `@read_only`).
8. **Post-merge CI** — pending (Close-finalize).
9. **Post-merge staging smoke** — N/A (`Brief-deploys: no`, ADR-007 — production platform deferred, no staging environment).

## What shipped (net-new platform capabilities)

- **Second client-owned-row family + second client-isolation security policy.** `QuestionnaireAnswer`
  (one-per-engagement, `@@unique([engagementId])`) + `QuestionnaireTemplate` (per-`Service`,
  `@@unique([serviceId])`, `questions` serialized JSON) + `Engagement.questionnaireSubmittedAt` (Prisma Track-A
  migration); `db/policies/0006-questionnaire-policy.sql` adds **two** policies — `pol_QuestionnaireAnswer`
  (FILTER + BLOCK, ownership join `engagementId → Engagement.clientUserId → User.clerkId =
  SESSION_CONTEXT('clerk_user_id')`, mirroring `0005`; null SESSION_CONTEXT → ZERO; NULL-clientUserId → ZERO)
  and `pol_QuestionnaireTemplate` (BLOCK-only, accountant-owned, write predicate mirrors
  `fn_service_write_access`, no CLIENT branch, error 33504 on deny). **HARD tier-3 three-item evidence**
  (`questionnaire-answer.client-isolation.rls.test.ts`, 7/7 live): CLIENT-A reads own / CLIENT-B reads ZERO of
  CLIENT-A / null SESSION_CONTEXT ZERO / ACCOUNTANT reads both / cross-client UPDATE blocked (rowsAffected=0) /
  template INSERT blocked.
- **First per-service-type template (vs. EPIC-005's single global template).** Accountant authors/edits a
  distinct questionnaire template per service type in `apps/admin` (mirrors the EPIC-005 `letter-template/`
  editor + actions, admin-pool, `getAccountantIdentity()` guard) — the catalog mechanism ADR-005 named as
  `IntakeTemplate`.
- **Server-side engagement→service-type→template resolution** (`getQuestionnaireForEngagement` +
  no-arg `getMyQuestionnaire()`): request-pool FILTER-governed engagement visibility gate FIRST (non-owner/null
  → null fail-closed), then admin-pool service join (DECISION-F primary service type = first selected by
  `sortOrder ASC, id ASC`), then admin-pool template read; absent template → null (not a throw). No
  client-supplied ids — the client cannot choose which questionnaire they see (AC-ONBD-003-01).
- **Owner-only BLOCK-governed client submit** (`submitQuestionnaireAsClient`, mirrors
  `recordLetterSignatureAsClient`): SESSION_CONTEXT set in-batch with the INSERT+UPDATE so the
  `pol_QuestionnaireAnswer` BLOCK predicate fences the write. Because the answer policy is **AFTER INSERT BLOCK**
  (throws SQL 33504 on deny, unlike Engagement's silent `@@ROWCOUNT=0`), a **scoped** try/catch maps 33504 →
  `{rowsAffected:0}` (non-33504 re-thrown, SDET-verified) — this **resolves the carried `@@ROWCOUNT` glance-item**
  from TASK-006-001.
- **Read-model extension** (`packages/db/src/onboarding.ts`, DECISION-I): `intake-questionnaire.done` now from
  `questionnaireSubmittedAt != null` (server-side satisfaction, AC-ONBD-003-03); `accessible` STILL gated on
  `signed` — **the letter hard gate is NOT weakened** (brief non-negotiable honored).
- **Portal questionnaire step UI** behind the EPIC-005 letter gate: consumes the EPIC-005 read model
  `accessible`/`done` (does NOT re-derive gate logic); locked/awaiting/submitted/active-form states; question
  content rendered as React text (no `dangerouslySetInnerHTML`).

## Retro finding classification (per ENGINE.md § Retro Finding Classification)

The promotion bar is a **concrete quality-gate failure**. **One finding cleared it** — the BUG-006-001 SDET
rejection (a concrete Review-gate failure). It is classified `ungated-fix` (already resolved this slice).
Everything else below is an **observation** (no rule change, no promoted action item).

**`ungated-fix` (resolved this slice / process item):**

1. **[test-mock drift — concrete SDET rejection, BUG-006-001] `apps/portal/src/app/onboarding/actions.test.ts`
   unit mock missing `withRequestContext`.** TASK-006-005 replaced the TASK-006-004 stub bodies of
   `getMyQuestionnaireAction`/`submitQuestionnaireAction` (now routed through `withRequestContext`), but the
   `actions.test.ts` mock was not updated in lockstep → 1 failed / 183 passed at TASK-006-006 submission. SDET
   **REJECTED** (2026-06-18T23:58:00Z); fix was **test-mock-only** (production code untouched), re-run live
   184/184, **SDET APPROVED** (2026-06-19T00:42:00Z), BUG-006-001 closed. **This is the 2nd manifestation of the
   "mock interface drift" family** (production code changed without lockstep unit-mock update; the e2e/unit
   gate caught it both times). **Classification `ungated-fix`** (it landed on the branch, rides the PR — it is a
   resolved gate failure, not a forward action item). **Lesson (carry):** when a task replaces another task's
   stub/action bodies, the replacing task must update the consuming unit mocks **in the same change** and re-run
   the affected test file before `review`. Candidate to encode as a developer-spec checklist line if it recurs a
   3rd time. Stuck-Loop counter = 1 (not triggered).

**`acknowledged` / observations (no action item — did not clear the promotion bar):**

2. **[metric-integrity — Audit Obs] Clock-source timestamp inversion.** TASK-006-002 carries
   `Completed-at: 2026-06-18T20:06:28Z` **before** `Started-at: 2026-06-18T20:15:00Z` (SDET wrote `Completed-at`
   from the review-session clock; the Dispatch-Checkpoint `Started-at` was a later wall-clock). No gate failed
   (all metadata present + valid, `Complexity-actual` ∈ 1–5); the other 6 tasks are forward-ordered with real
   `Started-at` (no midnight sentinels — the RETRO-005 carry was actioned). **6th occurrence of the clock-source
   family** (RETRO-002 Obs 2 → RETRO-003 item 2 → RETRO-004 → RETRO-005 Obs 1 → here). Observation only — not
   promoted (no quality-gate failure). **Overwatch suggests:** if it recurs to a **7th** occurrence without a
   process fix, elevate to `ungated-fix` (a one-line dispatch-checkpoint convention: capture a real wall-clock at
   `Started-at`; SDET writes `Completed-at` from the same clock domain).

3. **[infra — carried family, new manifestation] `scripts/smoke-test.sh` defaults unsuitable for this project's
   port remap + SA-password mismatch.** The script defaults `ADMIN_URL=http://localhost:3001` (not the
   project-remapped `:13001` — the neighbor-project host-port squat in MEMORY) and its `sqlserver` readiness wait
   uses `sqlcmd -U sa -P "$MSSQL_SA_PASSWORD"`, which blocks on the carried SA-password-vs-volume mismatch. The
   SDET used the CLAUDE.md § Container smoke **manual fallback** instead and smoke passed. Same root family as the
   carried `sqlserver` healthcheck SA-password item. **Candidate `ungated-fix` (script-hardening)** — default
   `ADMIN_URL` to the project-remapped port and derive/re-assert the SA password from the volume bootstrap source.
   Not promoted (no gate failure — the manual fallback is a valid path); carried to `## Open retro action items`.

4. **[demo — carried family] Prior-epic PNG byte-churn on `@demo` runs.** A 3rd-ish occurrence where an
   `@demo` run rewrote prior-epic PNGs (main session manually `git checkout`-reverted). TASK-006-007 itself was
   scope-disciplined (only EPIC-006 PNGs written — `git status` confirmed only `?? docs/demos/EPIC-006/`
   untracked, no EPIC-001..005 PNGs modified), so this is about the *other* `@demo` specs' default output paths,
   not this task's output. **Candidate `ungated-fix`:** scope each `@demo` spec's screenshot output to its own
   `docs/demos/EPIC-NNN/` path so the manual revert isn't needed each slice. Not promoted (no gate failure);
   carried to `## Open retro action items`.

5. **[e2e-determinism — Validate + Audit Obs] AC-ONBD-001-01 (EPIC-005-owned) portal e2e flake.**
   `apps/portal/e2e/specs/onboarding.spec.ts:312 [AC-ONBD-001-01]` failed once at single-run in the full portal
   suite (`data-testid="onboarding-steps"` not found within 5000ms), passed on `--retries 1` at 259ms.
   `git diff main -- apps/portal/e2e/specs/onboarding.spec.ts` is empty (file unmodified this branch; last
   touched `f879da2`/EPIC-005 PR #48). **Not a BRIEF-006 regression** and not a BRIEF-006 AC — but the portal
   suite is not fully deterministic at 1 worker. **Non-blocking follow-up:** investigate the `beforeEach` /
   onboarding-nav fixture timing for that describe block. Observation — not promoted; carried to
   `## Open retro action items`.

## Rule sunset (ENGINE.md § Rule Sunset, CLAUDE.md § Platform-frontend scope)

- **Cross-surface-parity rule (CLAUDE.md § Platform-frontend scope) — counter at 2/3, do NOT sunset.** EPIC-005
  reached the 3rd-consecutive-zero-finding trigger and was surfaced for keep/remove (IO recommended KEEP, final
  call deferred to user/Overwatch). The CLAUDE.md sunset trigger counts **consecutive zero-cross-surface-parity
  Close-preps**; BRIEF-006 is again zero-finding (admin template authoring + portal completion + the cross-app
  author→complete loop all validated, no parity defects), so the *post-EPIC-005-decision* counter stands at
  **2/3** (EPIC-005 + BRIEF-006). **IO recommendation: KEEP** (re-evaluate at the next Close-prep). The rule
  produces its own zero findings — the cross-app author→complete loop is a direct product of it; cost is low and
  the platform is still growing two-surface features (EPIC-007/008 ahead).
- **Autonomy Ceiling item 2 `--no-verify` clause — KEEP.** Not triggered this slice (no commit bypass
  attempted); prophylactic guard against an irreversible bad-commit class; cheap to retain.
- **`PushNotification` spam-loop guard — KEEP.** Not triggered (no notification fired this slice); prophylactic
  against alert-fatigue / handler recursion; cheap to retain.

## Carry-forward to next slice

- **[ungated-fix candidate] `scripts/smoke-test.sh` hardening** (item 3) — default `ADMIN_URL` to `:13001`;
  derive/re-assert SA password from the volume bootstrap source. In `## Open retro action items`.
- **[ungated-fix candidate] `@demo` screenshot output scoping** (item 4) — scope each `@demo` spec's writes to
  its own `docs/demos/EPIC-NNN/` path. In `## Open retro action items`.
- **[e2e-determinism] AC-ONBD-001-01 EPIC-005 portal flake** (item 5) — `beforeEach`/onboarding-nav fixture
  timing. In `## Open retro action items`.
- **[metric-integrity] Clock-source inversion** (item 2) — 6th occurrence; elevate to `ungated-fix` at the 7th
  without a process fix.
- **Infra (root family, carried):** `sqlserver` healthcheck SA-password-vs-volume mismatch + clean-volume DB
  bootstrap + `migrate deploy` P3019 + the Prisma OpenSSL detection warning (BUG-002-002 family — containers
  function despite it). Non-blocking; resurfaces on a `down -v` rebuild.
- **[security — defense-in-depth] SEC-3 per-connection `SESSION_CONTEXT` / `sp_reset_connection` hardening** —
  tracked, not a defect (every request-scoped query sets SESSION_CONTEXT in-batch per ADR-003 Amendment 1; the
  BLOCK/FILTER policy is the authorization fence).
- **REQ-AUTH-003 feature AC (AC-AUTH-003-01..03)** — the isolation *mechanism* for the answer rows + its
  per-policy test landed here (as for `Engagement` in EPIC-005); the **feature AC remain Phase-3-owned**
  (planning-flagged in the brief/epic, not an IO invention). No new `OPEN-QUESTIONS.md` entry raised — ADR-005
  already names the `IntakeTemplate` catalog mechanism.
- **Real Docuseal e-sign enablement slice** (ADR-024 §5, EPIC-005 carry) — still deferred.
- **CI carries (EPIC-004 follow-ups):** `test-portal` `packages/**` build step before graduating to required;
  ESLint `adminDb` import-boundary extension.

## Post-Merge Addendum (Close-finalize — 2026-06-19)

**PR #50 squash-merged to `main` @ `e55f8c5`** (`gh pr merge 50 --squash --delete-branch`; reviewed lane / Lane B
— application code → `/pr-review` panel; no `--admin`, no `enforce_admins` toggle; user-approved). Remote branch
`brief-006-intake-questionnaire` deleted; local `main` synced to `e55f8c5`. Reviewed lane outcome: 3-lens panel
(1 major + 5 minor + 3 nit) → `/pr-fix 50` (F1 major + F2/F3/F4/F6/F8 fixed with tests; F5/F7/security-nit
dispositioned on-thread; the real `validate-gates.sh` governance gaps on TASK-006-001/-007 fixed) → all 3
dispositioned threads resolved → CLEAN/MERGEABLE → merged. Fixer commit `a7ef3d6` was the PR head; the squash
folded it into `e55f8c5`.

**Gate 8 — Post-merge CI: ✅ PASS.** Both post-merge workflows on `main` @ `e55f8c5` GREEN (watched to completion
from `in_progress`):
- **CI** — run `27796565080` → `conclusion: success`.
  https://github.com/jasgr-software/tax-portal/actions/runs/27796565080 — all 4 jobs green:
  `lint-and-typecheck` ✅, `security-scan` ✅, `test-portal` ✅, `test-admin` ✅ (`report-failure` correctly
  `skipped`). These are the branch-protection required checks (`lint-and-typecheck` + `security-scan` enforced;
  `test-portal`/`test-admin` advisory-but-green).
- **CodeQL** (`Code Quality: Push on main`) — run `27796564765` → `conclusion: success`.
  https://github.com/jasgr-software/tax-portal/actions/runs/27796564765 (completed at dispatch time).

**Gate 9 — Post-merge staging smoke: N/A.** `Brief-deploys: no`; no staging environment exists (ADR-007 —
production platform deferred). Gate does not apply.

**Post-merge bugs:** none. Zero `BUG-006-POST-*` files created during PR limbo. `BUG-006-001` was a **pre-merge**
SDET rejection (resolved on-branch, test-mock-only, 184/184 re-run, archived to `tasks/done/`) — it rides the PR,
not a post-merge bug.

### Final post-merge 9-gate scorecard

1. Per-task submission gates — ✅ 7/7
2. SDET Review — ✅ 7/7 approved (1 in-slice rejection BUG-006-001, fixed + re-approved)
3. Overwatch Audit — ✅ CLEAN, 0 blocking
4. IO Design scan — ✅ PASS (0 violations)
5. Container Smoke — ✅ PASS
6. SDET Acceptance-validation — ✅ 7/7 in-scope AC
7. SDET CI gate — ✅ PASS (`pnpm ci:local` EXIT 0; e2e portal 36/36, admin 35/35, cross-app 11/11)
8. **Post-merge CI — ✅ PASS** (CI run `27796565080` + CodeQL run `27796564765`, both `success` @ `e55f8c5`)
9. Post-merge staging smoke — **N/A** (`Brief-deploys: no`, ADR-007)

**All applicable gates (1–8) GREEN; gate 9 N/A. BRIEF-006 / EPIC-006 — DELIVERED.** Slice removed from
`## Awaiting PR merge`. Next: Conductor runs `/planning validate EPIC-006` for the `COVERAGE.md` write-back of the
7 in-scope AC (HANDOFF-006 is the source); then the docs-lane close PR carries these `.implementation/tasks/**`
edits. EPIC-007 is now unblocked (depended on the EPIC-006 questionnaire substrate); EPIC-008 still depends on
EPIC-007.
