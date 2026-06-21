# Progress

> Single source of truth for current slice state, quality gates, active bugs, and retro action items. The IO
> and SDET update this file at the start and end of every invocation. Structure contract: see
> `.implementation/ENGINE.md` § PROGRESS.md structure contract.
>
> **Note (2026-06-14):** the implementation team was refactored into the standalone `.implementation/` layer
> (engine: `ENGINE.md` / `PHASES.md`; orchestrator: `AGENT.md` = the Implementation Orchestrator, `[io]`).
> The team consumes a self-contained build brief.

## Current initiative

_None active — BRIEF-009 in PR limbo (see `## Awaiting PR merge`)._ The IO is **between slices**: Close-prep
complete for BRIEF-009, awaiting the Conductor's PR push + reviewed-lane gates + merge → Close-finalize. No new
Plan may start while a slice sits in `## Awaiting PR merge` (ENGINE.md § Autonomy Ceiling item 5 / slice-start
gate).

> **BRIEF-009 / EPIC-009 collapsed per the bounded-ledger rule** (Close-prep transition). Durable detail:
> `HANDOFF-009.md` (5 AC ↔ test traceability), `RETRO-009.md` (9-gate scorecard + carry-forward + the 3-of-3
> cross-surface-parity sunset trip), `tasks/done/TASK-009-001..005`, the branch `brief-009-sign-in-lane` (1
> committed + working-tree slice source), and `git log -p PROGRESS.md` for the full Plan→Dispatch prose. Headline:
> the **PoC dev sign-in lane** — sign-in/sign-out capability (REQ-AUTH-013, mock realization) + consolidated
> role-based landing (REQ-AUTH-010), inert under `clerk`, zero net-new infrastructure; all 5 in-scope AC green;
> the HARD inert-under-`clerk` security gate proven with a demonstrated counterfactual.

## Awaiting PR merge

**BRIEF-009 / EPIC-009 — PoC dev sign-in lane (sign-in/sign-out capability + consolidated role-based landing).**
Branch `brief-009-sign-in-lane`. **Brief-type:** feature · **Brief-deploys:** no. **Status: Close-prep COMPLETE
2026-06-21 — awaiting the Conductor's PR push + reviewed-lane gates (application-code PR → Standards-review →
`/pr-review` panel → fix → resolve threads → merge on green required CI, Lane B, no `--admin`/protection toggle)
→ Close-finalize.** Pre-merge gates 1–7 GREEN (per RETRO-009 § 9-gate scorecard): 5/5 tasks SDET-approved, zero
rejections; IO consistency gate PASS (no drift, 0 fix-forward); SDET independent live-stack e2e green (portal 6/6,
admin 5/5, cross-app 5/5); HARD inert-under-`clerk` gate proven with demonstrated counterfactual; all 5 in-scope
AC validated under the bound gherkin prose-bind. Gate 8 (post-merge CI) pending; gate 9 N/A (`Brief-deploys: no`).
5 task files in `tasks/done/`; `HANDOFF-009.md` + `RETRO-009.md` written. **Conductor next:** push branch + open
PR (package handed off by the IO) → reviewed-lane gates → merge → re-invoke IO for Close-finalize →
`/planning validate EPIC-009`. **Do NOT stage `.orchestration/STATE.md` on this PR** (Conductor-owned docs-lane,
same convention as BRIEF-008).

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

_None active._ No undispositioned, slice-blocking bug is open. One open INFRA follow-up (**BUG-008-001**) is
dispositioned **non-blocking** (e2e is not a per-PR required check); every other bug is CLOSED and archived to
`tasks/done/`. Archived items are kept below for the record (full root-cause in their `tasks/done/` file + the
cited RETRO). *(Normalized 2026-06-21: leading clear-marker restored to the gate-recognized form; the verbose
closed-bug detail collapsed to pointers — it survives in `tasks/done/` + the RETROs.)*

**BUG-008-001 (BRIEF-008, surfaced at TASK-008-004 e2e gate) — Azurite SAS-URL PUT host-unreachable from the
Playwright browser process — OPEN, tracked follow-up (does NOT block any slice's merge).** File:
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

**Closed / archived (for the record — detail in `tasks/done/` + the cited RETRO):**
- BUG-007-001 (BRIEF-007) — admin e2e `document-requests.spec.ts` stale data-testid selectors — CLOSED
  2026-06-19 (`414890f`; re-smoke 3/3 green; no production code changed); archived `tasks/done/`; fix rode the
  BRIEF-007 PR (`gated-path-fix`, RETRO-007 item 1).
- BUG-002-001/-002/-003/-004 (BRIEF-002) — the 4-defect chain EPIC-002's first real-container e2e surfaced
  (latent in EPIC-001/004, hidden by the env-blocked container smoke) — all SDET-APPROVED, `done`, archived
  `tasks/done/` (2026-06-16); fixes rode BRIEF-002's PR. Full chain in `RETRO-002.md` (headline: BUG-002-003 →
  **ADR-003 Amendment 1**, drop `@read_only`).
- BUG-001-001/-002/-003 — CLOSED. BUG-004-001 (orphan root `middleware.ts`) — RESOLVED. No active
  `BUG-002-POST-*` / `BUG-004-POST-*`.

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

### IO Close-prep — BRIEF-009 / EPIC-009 (PoC dev sign-in lane) — 2026-06-21

**Start:** All 5 BRIEF-009 tasks `done` (001 lane core, 002 switcher+global-sign-out, 003 inert-under-`clerk`
HARD gate, 004 e2e both apps + cross-app, 005 @demo gallery). Dispatch exited. Entered Close-prep: consistency
gate → prior-epic PNG revert → archive → HANDOFF/RETRO → move to PR limbo → hand the Conductor a ready-to-run PR
package.

**Actions:**
- **Consistency gate / integrated design scan — PASS, no drift, 0 fix-forward.** Read the integrated diff
  (committed `1e930fd` TASK-009-004 e2e+seed + working-tree TASK-009-001/002/003/005 lane source). The 5 tasks
  compose into ONE coherent working lane: shared `@tax-portal/auth` mock-session seam (NOT forked — both apps
  import `createMockSessionCookie`/`MOCK_SESSION_COOKIE_NAME`); inert-under-`clerk` guard at page + action layer
  on BOTH surfaces; server-set-role honored (browser submits only `accountId`, role manifest-resolved server-side
  — ADR-005); `/dev-sign-in` additive to `PORTAL_PUBLIC_PATHS`; redirect specs additive (+58/-0); both demo-account
  manifests carry byte-identical records (the tracked single-source-of-truth observation); `seedAccountant()`
  MERGE-upsert keyed on `demo_usr_jane_accountant` matches both manifests; governing-key citations intact in every
  new file; **zero** debug leftovers / `console.log` / `debugger` / `.only` / TODO/FIXME / dead code (grep-clean).
- **CRITICAL — prior-epic PNG byte-churn reverted before PR.** `git checkout -- docs/demos/EPIC-001..008` restored
  the 33 sibling-`@demo`-rerendered PNGs (RETRO-006 item 4 recurrence; not a TASK-009-005 change). Verified:
  `git status --short -- 'docs/demos/**'` shows ONLY `?? docs/demos/EPIC-009/` (the new gallery this slice ships);
  zero `M` under prior epics.
- **Archived all 5 task files** to `tasks/done/TASK-009-001..005`. Metadata contract verified: all four fields
  (`Started-at`/`Completed-at`/`Complexity-estimate`/`Complexity-actual`) present + ∈ 1–5 on every task. Slice-close
  metadata gate PASS. (One blemish: TASK-009-003 `Completed-at` < `Started-at` — recurring developer
  clock-inversion; not gate-blocking; carried to RETRO-009 § item 3.)
- **Wrote `HANDOFF-009.md`** (5 AC ↔ test traceability, what shipped, out-of-scope honored, zero upstream raised,
  carry-forward, docs-lane closeout) **+ `RETRO-009.md`** (9-gate scorecard all pre-merge green; 4 carry-forward
  observations; the **3-of-3 cross-surface-parity sunset trip** with a KEEP recommendation surfaced for
  Conductor/Overwatch ratification; the two Rule-Sunset KEEP candidates; Post-Merge Addendum stub).
- **Collapsed `## Current initiative`** to a bounded-ledger pointer (BRIEF-009 + superseded BRIEF-008 inline prose
  + superseded dispatch notes); **moved the slice to `## Awaiting PR merge`**; swept BRIEF-009 Plan→Dispatch
  session entries to `PROGRESS-ARCHIVE.md` (per-slice index row + sweep pointer).

**End:** **Close-prep COMPLETE.** Slice in PR limbo. Handed the Conductor a ready-to-run PR package (branch,
conventional-commit title, PR body, file/path list excluding the reverted prior-epic PNGs and the Conductor-owned
`.orchestration/STATE.md`). **Application-code PR → reviewed lane** (Standards-review → `/pr-review` panel → fix →
resolve threads → merge on green required CI, Lane B). Most slice source is **uncommitted working-tree** (only
TASK-009-004's `1e930fd` is committed) — the Conductor stages + commits the rest, pushes, opens the PR. After
merge: re-invoke the IO for Close-finalize (gate 8 post-merge CI; gate 9 N/A) → `/planning validate EPIC-009`. IO
ends the invocation.
