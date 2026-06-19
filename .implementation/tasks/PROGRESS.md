# Progress

> Single source of truth for current slice state, quality gates, active bugs, and retro action items. The IO
> and SDET update this file at the start and end of every invocation. Structure contract: see
> `.implementation/ENGINE.md` § PROGRESS.md structure contract.
>
> **Note (2026-06-14):** the implementation team was refactored into the standalone `.implementation/` layer
> (engine: `ENGINE.md` / `PHASES.md`; orchestrator: `AGENT.md` = the Implementation Orchestrator, `[io]`).
> The team consumes a self-contained build brief.

## Current initiative

**BRIEF-007 / EPIC-007 — Initial document upload — checklist, secure malware-scanned file-storage path.**
**Phase: Close-prep (COMPLETE — consistency gate PASS; 7 tasks + BUG-007-001 archived to `tasks/done/`;
HANDOFF-007 + RETRO-007 written; slice moved to `## Awaiting PR merge`).** Prior gates: Audit (COMPLETE — 0
blocking) → Review design scan (PASS) → Smoke (PASS — gate 5 CLEARED; BUG-007-001 CLOSED, fix committed
`414890f`) → Validate (COMPLETE — gates 6/7/quality-audit ALL PASS 2026-06-19). **Gates 1–7 all green; gate 8
pending post-merge; gate 9 N/A (`Brief-deploys: no`).** Branch:
`brief-007-initial-document-upload` (off `main`
@ `7d538a3`, created by main session). **Gated: yes** (gated paths — `packages/`, `apps/`, `prisma/`,
`db/policies/`, `docker-compose.yml`). **Brief-type: feature · Brief-deploys: no.** **Methodology:**
`acceptance_format: gherkin` (bind the epic's 19 scenarios — do NOT re-author), **`e2e: required`** (both
`apps/portal` + `apps/admin` + `e2e:cross-app`), `tdd: optional`, `coverage_target: none`. **19 in-scope AC**
(REQ-ONBD-004, REQ-FILE-007/008/001-subset/002/003, REQ-NFR-009). Largest Phase-2 slice: two net-new ports
(`FileStorage`/ADR-008, `FileScanner`/ADR-021 mock-first) + the **third** client-isolation RLS policy
(`db/policies/0007-*`) + the first stored-bytes path. **Delivers onboarding step 3**, on the EPIC-005 spine.

**Goal:** accountant authors labeled document requests (`apps/admin`); post-letter-gate client sees the
checklist (outstanding vs provided), uploads any-type files to fulfill (two-phase authorize-then-sign, ADR-009),
malicious files withheld + uploader informed (scan-before-available, ADR-021); files encrypted-at-rest
(adapter contract, ADR-020), engagement-isolated (`0007`, ADR-005), audited (ADR-019), rate-limited (ADR-022);
the document-upload step's satisfaction wired into the EPIC-005 read model (AC-ONBD-004-04). EPIC-005 letter
hard gate must NOT be weakened.

**Tasks (7) — ALL `done` + SDET-approved + committed + ARCHIVED to `tasks/done/` at Close-prep:** 001 `0a84977` ·
002 `4a6b75a` · 003 `0e34253` · 004 `ee8232e` · 005 `596c7ac` · 006 `68ca721` · 007 `94f5e3f`. BUG-007-001
(`414890f`) also archived. Prior-epic demo-PNG churn reverted; `.orchestration/STATE.md` deliberately NOT on the
branch (Conductor docs-lane).
| Task | Impl | E2e | Introduces-gate | AC covered |
| ---- | ---- | --- | --------------- | ---------- |
| TASK-007-001 `FileStorage` port + Azurite/Memory adapters + fail-closed select + compose/env | developer | no | no | AC-FILE-003-01 (adapter contract) |
| TASK-007-002 `FileScanner` port (mock-first) + select + MIME/size validation helper | developer | no | no | (seam for AC-NFR-009-*, AC-FILE-002-01) |
| TASK-007-003 DocumentRequest + Document models + `0007` RLS policy + isolation test | developer | no | **yes** | AC-FILE-008-01, AC-FILE-001-05, AC-FILE-003-02 |
| TASK-007-004 two-phase upload/download pipeline + checklist read model + step satisfaction | developer | **yes** | **yes** | AC-FILE-001-02, AC-ONBD-004-04, AC-FILE-008-01, AC-FILE-003-01/-02/-03/-04, AC-NFR-009-01 |
| TASK-007-005 accountant document-request authoring UI (`apps/admin`) | developer | yes | no | AC-FILE-007-01 |
| TASK-007-006 client document-upload step + checklist + rejection (`apps/portal`) + cross-app e2e | developer | yes | no | AC-ONBD-004-01/-02/-03, AC-FILE-007-02/-03, AC-FILE-008-02/-03, AC-FILE-001-02, AC-FILE-002-01, AC-NFR-009-02 |
| TASK-007-007 `@demo` walkthrough (authoring + upload + rejection gallery) | developer | yes | no | none (non-gating demo) |

**Fix-forward decision (2026-06-19 — orphan-route IA gap, SDET FA-1 from TASK-007-005):** the new
`apps/admin/.../engagements/[engagementId]/document-requests` authoring surface is an **orphan** (no nav link
from any admin page — only reachable by typing the URL), an IA gap against the spirit of AC-FILE-007-01. **Chosen
remedy: FOLD the admin nav-link fix into TASK-007-006** (option a) rather than a dedicated fix task — 007-006 is
the cross-surface task and already touches both admin and the cross-app e2e, so the nav link is a natural added
deliverable AND the cross-app e2e can assert the accountant reaches the authoring surface by **navigation, not
URL**. Landing spot: `apps/admin/src/app/requests/[id]/page.tsx` (the accountant's post-acceptance landing
surface; the documented link target for notifications + RequestList "View") — surface a "Document checklist /
requests" link to the engagement's `document-requests` authoring page **once an engagement exists** for that
request. The route choice itself was sound (documented `// DECISION:`); only the nav link is missing. Not a
dedicated fix task (disproportionate); bound into 007-006 below.

**All 19 in-scope AC are covered across the tasks; tiers match the brief's tier map.** Dependency order:
001/002/003 are independent foundations → 004 (depends on 001+002+003) → 005 (depends on 004) → 006 (depends
on 004+005) → 007 (depends on 005+006). **Two gate-introducing tasks** (`0007` policy in 003; scan-promotion
gate in 004) carry mandatory three-item Gate-Authoring evidence (ENGINE.md § Gate Authoring Rules).

**Design decisions recorded (slice-local, not upstream — brief delegated these to IO Design):** fulfillment =
nullable FK `Document.documentRequestId` (not a join); all DocumentRequests required in v1 (zero-requests =
vacuously-satisfied upload step); `Document.status` enum `pending｜active｜infected`; storage key
`engagements/{engagementId}/documents/{documentId}/v1/{urlencoded-filename}` (ADR-009); `FileScanner` verdict
`clean｜infected｜indeterminate`; `FileScanner` co-located in `packages/storage`; TTL caps from ADR-008.
**No `OPEN-QUESTIONS.md` entry needed** — no genuinely-upstream/cross-cutting decision arose (ADR-008/009/021
already fix the port shapes, state machine, TTL caps, key pattern). **Local design-coherence check: PASS.**

**Delivery state (Phase 2 — onboarding gate):** EPIC-005 (step 1) + EPIC-006 (step 2) DELIVERED; **EPIC-007
(step 3) IN PROGRESS.** EPIC-008 (onboarding completion capstone) remains blocked on EPIC-007.

**Carried BRIEF-007 retro observations (Audit/Close-prep retro — do not lose):**
1. **Clock-domain inversion family** recurred multiple times this slice (now ~7-8× project-wide across
   RETRO-002/003/004/005/006). TASK-007-007's SDET wrote a clean forward-ordered `Completed-at`; several other
   tasks carried the SDET-vs-developer clock-domain offset. **Candidate to elevate per RETRO-006 item 2** (7th+
   occurrence threshold met).
2. **Doc-drift (header comment):** `apps/admin/e2e/specs/document-requests.spec.ts` header comment lists stale
   data-testids that diverge from the actual `DocumentRequestEditor.tsx` (`document-request-label-input`,
   `add-document-request-button`, `document-request-item-{id}`). Functional tests use correct selectors —
   comment-only drift (TASK-007-005). Non-blocking.
3. **CSP env-gating follow-up (TASK-007-006):** `apps/portal/next.config.mjs` `connect-src` includes the
   unconditional `http://localhost:10000` dev origin (inert in prod HTTPS via mixed-content blocking, but ships
   in the prod CSP header). Recommend env-gating it out of production in a follow-up hardening pass.
4. **Pre-existing flake:** `apps/portal/e2e/specs/questionnaire-cross-app.spec.ts:372` (EPIC-006-owned, file
   unmodified this branch — RETRO-006 item 5). NOT a BRIEF-007 regression.
5. **`@demo` re-run prior-epic PNG churn** (RETRO-006 item 4) recurred — the EPIC-007 specs are scoped
   correctly, but `pnpm e2e:demo` re-runs all `@demo` specs and rewrites prior galleries; main session reverted.
   Candidate to fix (scope each spec / a per-epic grep).
6. **`adminDb` type-cast in `apps/admin/src/app/requests/[id]/page.tsx`** (Overwatch Obs 6 — orphan-route nav fix,
   TASK-007-006). Advisory; SDET-approved. Recommend a typed accessor on the `packages/db` admin client next
   `packages/db` pass so the cast is not needed. Non-blocking.

**Cross-surface-parity sunset counter (CLAUDE.md § Platform-frontend scope):** Overwatch confirmed cross-surface
parity CLEAN this slice (both `apps/portal` + `apps/admin` audited; no parity findings). **Sunset counter: 1 of
3** consecutive zero-finding Close-prep retros toward the keep/remove review threshold (BRIEF-007 is the first
consecutive clean slice; reset to 0 on any future parity finding).

## Awaiting PR merge

**BRIEF-007 / EPIC-007 — Initial document upload (checklist + secure malware-scanned file storage).** Close-prep
**COMPLETE 2026-06-19**; slice in PR limbo awaiting the main session to open the PR → Conductor `/pr-review` →
`/pr-fix` → merge → IO Close-finalize (gate 8). **Branch:** `brief-007-initial-document-upload` (off `main`
@ `7d538a3`). **Brief-type: feature · Brief-deploys: no** (gate 9 N/A). **Lane:** reviewed / Lane B
(application code — `packages/`, `apps/`, `prisma/`, `db/policies/`, `docker-compose.yml`). **Required CI
checks:** `lint-and-typecheck` + `security-scan`.

**9 commits on the branch:** plan+001 `0a84977` · 002 `4a6b75a` · 003 `0e34253` · 004 `ee8232e` · 005 `596c7ac`
· 006 `68ca721` · 007-demo `94f5e3f` · BUG-007-001 `414890f` (the plan commit is folded with 001 per the brief's
commit history; the 9th is BUG-007-001's fix).

**Pre-merge gate verdicts (for `scripts/validate-gates.sh` before the auto-merge condition-d check):**
1. Per-task submission — ✅ 7/7
2. SDET Review — ✅ 7/7 (1 in-slice rejection BUG-007-001, fixed + re-approved)
3. Overwatch Audit — ✅ CLEAN, 0 blocking
4. IO Design scan — ✅ PASS (0 violations; orphan-route IA gap fix-forward folded into TASK-007-006)
5. Container Smoke — ✅ PASS (first stored-bytes path proven end-to-end through real Azurite)
6. SDET Acceptance-validation — ✅ APPROVED, 19/19 in-scope AC (gherkin prose-bind)
7. SDET CI gate — ✅ PASS (`pnpm ci:local` EXIT 0; **57 files / 836 tests** all green)
8. Post-merge CI — pending (Close-finalize)
9. Post-merge staging smoke — **N/A** (`Brief-deploys: no`, ADR-007)

HANDOFF-007 is the `/planning validate EPIC-007` source (19/19 AC); RETRO-007 carries the gate scorecard +
classification.

Delivered (prior): **PR #50 `e55f8c5`** (EPIC-006 — intake questionnaire, onboarding step 2), PR #48 `f879da2`
(EPIC-005 — opens Phase 2), PR #42 `ec151cb` (EPIC-003), PR #40 `70ea10e` (EPIC-002), PR #38 `0444551`
(EPIC-004), PR #35 `f7f6c9d` (EPIC-001) — all merged. **Phase 1 (MVP) complete; Phase 2 (onboarding gate) open —
EPIC-005 + EPIC-006 delivered (steps 1 + 2); EPIC-007 (step 3) in PR limbo; EPIC-008 (capstone) unblocked once
007 merges.**

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

### Sweep pointer — BRIEF-007 Dispatch session entries archived (Audit transition) — 2026-06-19
At the BRIEF-007 Dispatch→Audit phase transition, the full Dispatch-phase inline session history (IO Plan/Design
record; IO Dispatch chain for TASK-007-002/004/005/006; SDET review gate-records for TASK-007-001..007) was
**swept to `PROGRESS-ARCHIVE.md`** (see "Sweep marker — BRIEF-007 Dispatch → Audit transition — 2026-06-19").
Full per-entry text preserved in git history at the 7 build commits (`0a84977`, `4a6b75a`, `0e34253`,
`ee8232e`, `596c7ac`, `68ca721`, `94f5e3f`) + the live task files (`tasks/TASK-007-001..007.md`). Only the new
IO Audit phase-start entry below is retained inline.

---

### IO Audit — BRIEF-007 / EPIC-007 (initial document upload) — 2026-06-19
**Start:** Audit phase. **Dispatch is COMPLETE** — all 7 BRIEF-007 tasks are `done` + SDET-approved + committed
on `brief-007-initial-document-upload` (off `main` @ `7d538a3`): TASK-007-001 `0a84977` (FileStorage port +
Azurite adapter), 002 `4a6b75a` (FileScanner port mock-first + `validateUploadedBytes`), 003 `0e34253`
(Document/DocumentRequest models + `0007` RLS policy), 004 `ee8232e` (two-phase upload/scan/download pipeline +
checklist read model), 005 `596c7ac` (admin document-request authoring UI), 006 `68ca721` (portal upload step +
ADR-019/022 binding + orphan-route nav fix + cross-app e2e), 007 `94f5e3f` (`@demo` gallery). Prior-epic
demo-PNG churn reverted by main session; `.orchestration/STATE.md` deliberately NOT on the branch
(Conductor docs-lane). `## Awaiting PR merge` empty; `## Active bugs` none.
**Actions:** Ran the phase-transition reflex — swept the BRIEF-007 Dispatch-phase inline session history (IO
Plan + Dispatch chain + the seven SDET review gate-records) to `PROGRESS-ARCHIVE.md` (sweep marker +
above pointer); rewrote `## Current initiative` to **Phase: Audit** with all 7 tasks `done`/committed and the
five carried retro observations recorded inline (clock-domain inversion ~7-8×; `document-requests.spec.ts`
header-comment doc-drift; CSP `localhost:10000` env-gating follow-up; pre-existing
`questionnaire-cross-app.spec.ts:372` EPIC-006 flake; `@demo` prior-epic PNG churn); appended this Audit-start
entry. **Composing ONE `## Next Dispatch` for Overwatch** — a read-only advisory audit of the integrated
BRIEF-007 diff across all 7 tasks. Audit charter: scope discipline (did any task exceed its brief slice — e.g.
the new `engagements/` admin authoring route or the portal CSP change overreaching?); audit/rate-limit seam
reuse (ADR-019/ADR-022 — no parallel paths, the shared `getRateLimiter()`/`recordAuthEvent` seams reused, not
hand-rolled); the `0007` RLS policy + the two new ports (FileStorage/ADR-008, FileScanner/ADR-021) stayed within
the cited ADRs; gated-path accountability (every changed gated path traces to a task); and surface the five
carried retro observations for the Close-prep retro. Cross-surface default applies — audit BOTH `apps/portal`
AND `apps/admin`. Overwatch is advisory; the SDET remains the approval authority.
**End:** Audit phase opened; PROGRESS.md updated (sweep + `## Current initiative` rewrite + this entry).
Returning the single Overwatch dispatch block to the main session. On the audit's return, the IO classifies
each finding (blocking → dispatched fix or recorded disposition; non-blocking → retro carry) before advancing
to Review.

---

### Sweep pointer — BRIEF-007 Validate session entries archived (Close-prep transition) — 2026-06-19
At the BRIEF-007 Validate→Close-prep phase transition, the full Validate-phase inline session history (the
Smoke→Validate IO transition entry; SDET **Gate 6** acceptance-validation record with the 19-AC↔test
traceability matrix + gherkin binding + the three HARD-non-negotiable real-confirmations; SDET **Gate 7** CI
record — `pnpm ci:local` EXIT 0, 57 files / 836 tests all PASS; SDET **Quality Parity Audit** record) was
**swept to `PROGRESS-ARCHIVE.md`** (see "Sweep marker — BRIEF-007 Validate → Close-prep transition —
2026-06-19"). Headline: **all 3 Validate gates PASS** — Gate 6 APPROVED (19/19 in-scope AC tagged + passing at
prescribed tiers; gherkin `.feature` files bound verbatim from the epic; HARD per-policy client-isolation +
scan-before-available fail-closed confirmed real against the live stack); Gate 7 CI PASS (`pnpm ci:local`
EXIT 0; **836/836 tests**; lint/type-check/build clean both surfaces); Quality parity PASS (both surfaces at
parity; sunset 1/3). The full Gate-6 AC↔test matrix is preserved verbatim in `HANDOFF-007.md`; full per-entry
text in git history at the 8 BRIEF-007 commits + the `tasks/done/TASK-007-*` / `tasks/done/BUG-007-001-*` files.
Only the new IO Close-prep phase-start entry below is retained inline.

---

### IO Close-prep — BRIEF-007 / EPIC-007 (initial document upload) — 2026-06-19
**Start:** Validate phase **COMPLETE** — all 3 gates PASS (Gate 6 acceptance-validation APPROVED 19/19 AC under
gherkin; Gate 7 CI `pnpm ci:local` EXIT 0, 836/836; quality parity PASS, sunset 1/3). Gates 1–7 all green.
`## Awaiting PR merge` empty; `## Active bugs` none active (BUG-007-001 closed). Entering **Close-prep**.
**Actions:** Ran the phase-transition reflex — swept the Validate-phase inline session history (Smoke→Validate
IO transition + SDET Gate 6 / Gate 7 / Quality Parity records) to `PROGRESS-ARCHIVE.md` (sweep marker + pointer
above); rewrote `## Current initiative` to **Phase: Close-prep**. **Consistency gate: PASS** — all 7 TASK-007-*
files `done` with complete in-range metadata (`Complexity-estimate`/`-actual` all ∈ 1–5, both populated;
`Started-at`/`Completed-at` non-empty on all 7); BUG-007-001 `closed`; no task `in-progress`/`review`/`backlog`.
The clock-domain `Completed-at` inversions on tasks 001–004 + the BUG-007-001 midnight-sentinel close stamp are
dispositioned to the `ungated-fix` family (fields non-empty → do not block close). **Archived** all 7 TASK-007-*
+ BUG-007-001 to `tasks/done/`. **Wrote `HANDOFF-007.md`** (19/19 AC satisfied + evidence basis; net-new
capabilities — first FileStorage port + Azurite adapter, first FileScanner port mock-first, the THIRD
client-isolation policy `0007`, the two-phase authorize-then-sign + scan-before-available pipeline, the checklist
read model + document-step satisfaction, the ADR-019/022 caller-binding seam split; carried follow-ups) — the
source for `/planning validate EPIC-007`. **Wrote `RETRO-007.md`** (7-gate scorecard, gates 1–7 green / 8
pending / 9 N/A; classification: BUG-007-001 `gated-path-fix` resolved on-branch; clock-domain inversion
`ungated-fix` ELEVATED at 7th+ occurrence, off-PR amends `developer.md`; the rest observations; cross-surface
sunset KEEP at 1/3; Rule Sunset checked). **Moved the slice to `## Awaiting PR merge`** with the branch + 9
commits + pre-merge gate verdicts (gates 1–7 green) for `scripts/validate-gates.sh`. Added the clock-domain
`ungated-fix` to `## Open retro action items`. **Composed the PR title + body** for the main session (reviewed
lane / Lane B — application code). **End:** Close-prep complete; slice in PR limbo. Returning the PR title/body
for the main session to open the PR (the IO does not run git). Next: main session opens the PR → Conductor runs
`/pr-review` → `/pr-fix` (if needed) → resolve threads → merge on green required CI → IO Close-finalize (gate 8)
→ `/planning validate EPIC-007`. **This invocation ends here** (PR limbo).
