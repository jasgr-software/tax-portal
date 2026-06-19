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
**Phase: Audit (COMPLETE — 0 blocking) → Review design scan (PASS) → Smoke (PASS; BUG-007-001 CLOSED — SDET re-smoke 3/3 green 2026-06-19) → Validate (next).** Branch:
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

**Tasks (7) — ALL `done` + SDET-approved + committed on `brief-007-initial-document-upload`:** 001 `0a84977` ·
002 `4a6b75a` · 003 `0e34253` · 004 `ee8232e` · 005 `596c7ac` · 006 `68ca721` · 007 `94f5e3f`. Prior-epic
demo-PNG churn reverted; `.orchestration/STATE.md` deliberately NOT on the branch (Conductor docs-lane).
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

_None._ BRIEF-006 / EPIC-006 cleared **Close-finalize on 2026-06-19** (gate 8 post-merge CI PASS; gate 9 N/A) —
see `## Current initiative` and `RETRO-006.md` § Post-Merge Addendum.

Delivered: **PR #50 `e55f8c5`** (EPIC-006 — intake questionnaire, onboarding step 2), PR #48 `f879da2` (EPIC-005
— opens Phase 2), PR #42 `ec151cb` (EPIC-003), PR #40 `70ea10e` (EPIC-002), PR #38 `0444551` (EPIC-004), PR #35
`f7f6c9d` (EPIC-001) — all merged. **Phase 1 (MVP) complete; Phase 2 (onboarding gate) open — EPIC-005 +
EPIC-006 delivered (steps 1 + 2 of the onboarding sequence); EPIC-007 next-ready.**

## Active bugs

**BUG-007-001 (blocking, BRIEF-007) — admin e2e `document-requests.spec.ts` stale data-testid selectors.**
**Status: CLOSED — SDET-approved 2026-06-19.** Re-smoke: 3/3 `document-requests.spec.ts` GREEN (tests 9/10/11 pass);
32/38 overall (6 mailhog-ECONNREFUSED are pre-existing EPIC-003, out of scope). All corrected selectors verified
against `DocumentRequestEditor.tsx` rendered testids. No production code changed. Fix committed with the spec;
main session stages `apps/admin/e2e/specs/document-requests.spec.ts` only (not `.orchestration/STATE.md`).
File: `tasks/BUG-007-001-admin-e2e-document-requests-stale-testids.md`.

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

### SDET Container Smoke gate — BRIEF-007 / EPIC-007 — 2026-06-19

**Phase: Smoke (gate 5). Result: CONDITIONAL PASS with 1 blocking defect filed (BUG-007-001).**

**Docker pre-flight:** PASS. Docker 29.4.1. `docker info` clean.

**Clean-slate bring-up (`docker compose --env-file .env.local down -v && up -d`):**
- All volumes destroyed; fresh bootstrap.
- `tax-portal-portal`: Up (healthy) — port `0.0.0.0:3000->3000/tcp`
- `tax-portal-admin`: Up (healthy) — port `0.0.0.0:13001->3001/tcp` (ADMIN_PORT=13001 confirmed from .env.local)
- `tax-portal-azurite`: Up (healthy) — port `0.0.0.0:10000->10000/tcp`
- `tax-portal-sqlserver`: Up (healthy) — port `0.0.0.0:14330->1433/tcp`
- `tax-portal-mailhog`: ABSENT — port 1025 conflict with neighbor project (squats host port 1025); known carried infra quirk. Non-blocking for BRIEF-007 (mailhog not on the upload/scan/download path).
- **`sqlserver (healthy)`** — clean-volume bootstrap means SA password matches the healthcheck's `$MSSQL_SA_PASSWORD`. The carried `(unhealthy)` issue only manifests on a persisted volume bootstrapped with a different SA password; clean slate clears it.

**Migrate job verification:**
- Track A (Prisma `migrate deploy`): applied via `sqlcmd` inside the container as SA — bypassing the known Prisma P1013 (`!`-password) / P3019 (`mssql`-vs-`sqlserver`) URL-parsing fragility (same workaround as TASK-005-001 / TASK-006-001 / RETRO-002 § d). All 5 Prisma migrations applied: `20260615000000_init_service_engagement_request_user`, `20260617000000_epic003_inbox_schema`, `20260618124735_add_engagement_letter_template`, `20260618192503_add_questionnaire_template_answers`, `20260619123152_document-request-and-document` (BRIEF-007) — all EXIT:0.
- Track B (raw SQL migrations + policies): applied via `sqlcmd` as SA (required for server-level login creation rights). All 10 files applied EXIT:0: `0001-create-principals-and-sec-schema.sql`, `0002-create-audit-ledger.sql`, `0003-seed-default-letter-template.sql`, `0001-engagement-request-policy.sql`, `0002-service-readable.sql`, `0003-audit-event-policy.sql`, `0004-notification-policy.sql`, `0005-engagement-policy.sql`, `0006-questionnaire-policy.sql`, `**0007-document-policy.sql**` (BRIEF-007).
- `pnpm db:seed`: 6 services seeded (1 inactive) — EXIT:0.

**BRIEF-007 DB object verification (in-container as `taxportal_admin`):**
All 6 required objects present — confirmed via `sys.security_policies` + `sys.objects` + `sys.check_constraints` query:
- `sec.pol_Document` (security policy — FILTER for clients, BLOCK for non-admin writes)
- `sec.pol_DocumentRequest` (security policy — accountant-only write boundary)
- `sec.fn_document_access` (predicate function)
- `sec.fn_document_request_access` (predicate function)
- `sec.fn_document_request_write_access` (predicate function)
- `Document_status_chk` (CHECK constraint — `pending|active|infected` status enum)
`Document` table: 13 columns confirmed (id, engagementId, documentRequestId FK-nullable, storageKey, originalFilename, contentType, sizeBytes, status, version, scanThreat, uploadedBy, createdAt, updatedAt).
`DocumentRequest` table: 6 columns confirmed (id, engagementId, label, createdBy, createdAt, updatedAt).
**Third client-isolation policy (0007): VERIFIED** — mirrors `0005`/`0006` precedent.

**Both apps load:** portal `/healthz` HTTP 200 + `/readyz` HTTP 200; admin `:13001/healthz` HTTP 200 + `/readyz` HTTP 200. Portal `/services` returns fully DB-backed HTML (5 seeded services rendered). PASS.

**Stored-bytes path (CRITICAL — first Azurite e2e):**
Ran `pnpm --filter portal e2e:run -- --grep "document"` against the live stack. **44/44 PASS (16.8s).** Key results for the stored-bytes path:

- Test 17: `[AC-FILE-007-01] accountant authors request via nav-link → client sees it` — PASS (953ms). Cross-app: accountant creates a DocumentRequest in admin, client sees it on portal checklist.
- Test 18: `[AC-FILE-007-03] client fulfills the request authored by the accountant` — PASS (700ms). Full cross-app upload-to-fulfill path.
- Test 19: `[AC-ONBD-004-01] client sees the document checklist with the accountant-authored label` — PASS (281ms). Azurite-backed, DB-backed checklist read model.
- Test 20: `[AC-ONBD-004-02] outstanding item shows Outstanding badge` — PASS (190ms).
- Test 21: `[AC-FILE-002-01] file input has no accept restriction` — PASS (177ms).
- **Test 22: `[AC-ONBD-004-03] upload accepted and item changes to fulfilled` — PASS (403ms).** Upload → scan → promote `pending`→`active` via Azurite emulator. This is the load-bearing clean-file path through the real Azurite container.
- **Test 23: `[AC-FILE-008-03] fulfilled item no longer shown as outstanding` — PASS (444ms).** Post-active checklist state correct.
- **Test 24: `[AC-NFR-009-02] EICAR test content shows rejection message` — PASS (432ms).** Infected file → `infected` status → rejection message displayed; request stays outstanding. Fail-closed path confirmed.

**Admin-side e2e (`pnpm --filter admin e2e:run -- --grep "document"`):** 30/38 passed (51.4s). 8 failures — two categories:

1. **BUG-007-001 (blocking — BRIEF-007) — `document-requests.spec.ts` tests 9+10 FAIL.** `[AC-FILE-007-01]` admin-surface dedicated e2e spec uses stale data-testid selectors: `label-input` (should be `document-request-label-input`), `add-request` (should be `add-document-request-button`), `request-item` (should be `document-request-item-{id}`). Screenshot confirms the page loaded correctly; only the selectors are wrong. The cross-app equivalent (portal spec test 17) passes using correct testids. Filed as `BUG-007-001-admin-e2e-document-requests-stale-testids.md`. Retro observation #2 incorrectly characterized this as comment-only drift; the functional tests in the spec use the wrong selectors.

2. **Pre-existing non-BRIEF-007 failures (6 tests):** `request-accept.spec.ts` (2) and `request-decline.spec.ts` (4) fail with `ECONNREFUSED 127.0.0.1:18025` — mailhog container absent (neighbor squats port 1025). These are EPIC-003 owned tests, not BRIEF-007 ACs. Same known local-stack quirk documented in project memory.

**Demo gallery:** `docs/demos/EPIC-007/` confirmed present — 4 AC-tagged PNGs (`01-AC-FILE-007-01`, `02-AC-ONBD-004-01-02-03`, `03-AC-ONBD-004-03-item-fulfilled`, `04-AC-NFR-009-02-malicious-rejected`) + `DEMO.md`. Stack is up; gallery pre-produced by TASK-007-007 — no re-run needed (re-running `@demo` would rewrite prior-epic PNGs per carried retro item #5). Demo gallery: CONFIRMED PRESENT.

**Cross-surface scope:** both `apps/portal` (client checklist + upload) and `apps/admin` (accountant document-request authoring) smoke-verified. The cross-app author→fulfill path was directly exercised by portal tests 17–18.

**Verdict:** CONDITIONAL PASS. Infrastructure checks PASS (compose topology, `0007` DB objects, both apps load, Azurite E2E). Stored-bytes path PASS (clean upload → Azurite → scan-promote to `active`; infected file → `infected` / withheld). One BRIEF-007 defect: `BUG-007-001` (admin e2e spec stale testids for AC-FILE-007-01 dedicated admin spec). The AC's behavior is delivered and proven via the cross-app spec. Recommending the IO dispatch a fix for BUG-007-001, run targeted re-smoke on the admin document-requests spec, then advance to Validate on PASS.

**End:** Smoke gate complete. PROGRESS.md updated. BUG-007-001 filed in `tasks/`. Returning report to IO.

---

### IO Audit-disposition + Review design scan + Smoke phase-start — BRIEF-007 / EPIC-007 — 2026-06-19
**Start:** Overwatch advisory audit returned. **Gate 3 (Overwatch Audit) = recorded; 0 blocking findings —
all gates green, nothing blocks Review.** Classify findings, run the IO Review-phase design scan, advance to
Smoke.

**Audit recorded (gate 3) + findings disposed:**
- **0 blocking findings.** Overwatch confirmed: gated-path accountability CLEAN (every changed gated path traces
  to a task; no `.orchestration/STATE.md` on the branch; prior-epic PNG churn reverted); EPIC-005 letter gate NOT
  weakened; ADR-022 (rate-limit before authorize) + ADR-019 (audit after write) ordering correct + shared seams
  reused; no vendor SDK in app production code; `0007` policy + both ports ADR-confined; cross-surface parity
  clean.
- **Non-blocking finding 1 — clock-domain inversion, 7th occurrence (TASK-007-001..004 `Completed-at` precedes
  `Started-at`).** Root cause: developer agents wrote `Completed-at` during their submission-gate Work Log entry
  instead of leaving it blank for the SDET's atomic close (005–007 correctly SDET-authored/forward-ordered). The
  RETRO-006 item-2 elevation threshold (7th occurrence) is now MET. **IO disposition: ELEVATE to `ungated-fix`**
  (recorded in `## Open retro action items`) — amend `.implementation/agents/developer.md` (and/or the
  Dispatch-Checkpoint guidance) to prohibit developer writes to `Completed-at`. **This is an ungated-path
  workflow-file doc edit (quad review); it does NOT ride the BRIEF-007 PR** — it rides a future docs/ungated
  change. Not a BRIEF-007 code change.
- **Observations 2–6 — retro carries** (recorded in `## Current initiative` carried-observations + the relevant
  ones in `## Open retro action items`): (2) `document-requests.spec.ts` header-comment stale-testid doc-drift
  (functional tests correct; rides next admin e2e pass); (3) CSP `http://localhost:10000` unconditional in the
  prod CSP header (inert in prod HTTPS; env-gate in a hardening pass); (4) pre-existing
  `questionnaire-cross-app.spec.ts:372` EPIC-006-owned flake (unmodified this branch); (5) `@demo` prior-epic PNG
  churn (per-epic demo-script scoping candidate); (6) `adminDb` type-cast in `requests/[id]/page.tsx` orphan-route
  fix (SDET-approved; typed-accessor next `packages/db` pass). None promoted — no gate failure.
- **Cross-surface-parity sunset counter incremented to 1 of 3** consecutive zero-finding Close-prep retros toward
  the keep/remove threshold (BRIEF-007 = first clean slice; resets on any future parity finding).

**Review-phase design scan (gate 4 — IO work, no dispatch) = PASS.** Read the integrated diff
`git --no-pager diff main...brief-007-initial-document-upload` (79 files, +15,788) against the brief's Scope +
Constraints + Data & Interface Contract, focusing the load-bearing source: `packages/db/src/repositories/document.ts`
(two-phase upload/download), `db/policies/0007-document-policy.sql` (the RLS policy), `packages/storage/src/scanner/select.ts`
(scanner selector), `packages/db/src/onboarding.ts` (read-model extension). Verified — all corroborated by Overwatch:
- **Two-phase authorize-then-sign (ADR-009):** `authorizeEngagementForUpload` runs on the REQUEST POOL (FILTER-governed,
  null SESSION_CONTEXT → null) BEFORE any URL is minted; `insertPendingDocument` runs on the ADMIN POOL (ADR-009 step 2d);
  download is authorize-then-sign, **active-only** (pending/infected never signable). Correct.
- **Scan-promotion fail-closed (ADR-021):** in `completeUpload`, ONLY `scanVerdict.verdict === 'clean' && validationResult === 'pass'`
  promotes pending→active; `infected` → terminal withheld + uploader informed (AC-NFR-009-02); indeterminate / validation-fail
  → STAYS pending (never silently active, AC-NFR-009-01). Named-code-path + fail-closed invariant documented for Gate-Authoring.
- **`0007` isolation (ADR-005):** Document FILTER+BLOCK (client-isolated via Engagement ownership join, null SESSION_CONTEXT
  → 0 rows fail-closed); DocumentRequest FILTER (client reads own engagement's requests) + accountant-only-write BLOCK (NO
  CLIENT write branch — mirrors `fn_service_write_access`/0002 + 0006); `Document_status_chk` CHECK constraint; mirrors 0005/0006.
- **Letter gate intact (EPIC-005):** `onboarding.ts` EXTENDS the read model (document-upload `done` = `allRequiredProvided`,
  AC-ONBD-004-04); steps 2/3 stay `accessible: signed` (refused, not hidden); `checkStepAccessibility` server-authoritative.
  Gate NOT weakened.
- **Audit/rate-limit reuse (ADR-019/022):** delegated to the portal server-action caller (TASK-007-006) via a documented
  `// DECISION:`; Overwatch confirmed the EPIC-003/004 audit seam + EPIC-004 `RateLimiter` seam are reused, not hand-rolled.
- **Scanner real-default fail-closed (ADR-021 §4):** keys on `ALLOW_MOCK_SCANNER` (not NODE_ENV — the BUG-002-001 lesson),
  default=cloud (real), contradiction guard, mirrors `packages/esign/src/select.ts`. No vendor SDK in app code.
- **No scope creep:** out-of-scope items (accountant upload, both-party download UX, folders/versioning/retention, real
  scanner/storage, onboarding completion) absent from the diff. **Design scan verdict: PASS — no blocking violation; no fix task.**

**Actions:** Recorded gate 3 (Audit) + gate 4 (design scan, PASS) above; disposed all findings (1 elevated to
`ungated-fix`; 2–6 retro carries); incremented the cross-surface-parity sunset counter (1/3). Ran the
phase-transition reflex to **Smoke** — swept the Audit phase-start entry, rewrote `## Current initiative`
(Phase → Smoke), appended this entry. **Docker pre-flight: PASS** (`docker info` clean — DOCKER_OK).

**End:** Audit + Review design scan complete (gates 3 + 4 recorded). Advancing to **Smoke** — composing ONE
`## Next Dispatch` for the SDET: the Container Smoke gate (gate 5) against the docker-compose stack incl.
**Azurite** — clean-slate bring-up, migrate-job verification (Prisma + raw-SQL `0007`), both apps load, and the
**first stored-bytes path end-to-end** (upload → scan → promote → authorize-then-sign download). On the smoke
report's return: pass → advance to Validate; any failure → fix task `done` + re-smoke before advancing.

---

### IO Smoke-disposition + BUG-007-001 fix (self-implemented) — BRIEF-007 / EPIC-007 — 2026-06-19
**Start:** SDET Container Smoke gate (gate 5) returned **CONDITIONAL PASS** — all load-bearing checks green
(clean-volume bring-up healthy; all 5 Track-A + 10 Track-B migrations incl. `0007`; `0007` DB objects +
`Document_status_chk` present; both apps `/healthz`+`/readyz` 200; **first stored-bytes path PASS end-to-end
through real Azurite** — clean upload→scan→promote `active` + authorize-then-sign download, portal e2e 44/44;
infected→withheld fail-closed holds) — with **one blocking BRIEF-007 defect: BUG-007-001** (admin e2e
`document-requests.spec.ts` stale data-testid selectors).
**Disposition decision:** self-implement (`Impl: io`). This meets the IO Self-Implementation criteria — an
**e2e-spec-only test-selector fix, 1 file, mechanical**, zero production-code change. Per ENGINE.md § Bug Fixes,
the fixed spec re-running green is the regression evidence (the spec IS the test); no separate regression test
warranted. The 6 mailhog-absent `request-accept`/`request-decline` failures are pre-existing EPIC-003
(non-BRIEF-007) — correctly dispositioned by the SDET; NOT fixed here.
**Actions:** Verified the actual component testids against
`apps/admin/src/app/engagements/[engagementId]/document-requests/_components/DocumentRequestEditor.tsx`
(doc-comment L16–21; rendered L112/159/165/197/203). Corrected `apps/admin/e2e/specs/document-requests.spec.ts`:
`label-input`→`document-request-label-input` (L273); `add-request`→`add-document-request-button` (L279, L334);
`request-item`→`document-request-item-` prefix-match `^=` (L286, L290, L313, L347 — mirrors the passing
cross-app portal spec); corrected the stale header-comment testid table (L20–25). `request-list` (L309) was
already correct — left unchanged. Recorded root-cause/scope/fix + `## Testability` in the BUG file (status →
`fixed — awaiting SDET re-smoke + review`); updated `## Active bugs` + the `## Current initiative` phase line.
**Root cause (confirmed):** TASK-007-006's testid rename in `DocumentRequestEditor.tsx` (in the `68ca721` diff)
not mirrored into the sibling TASK-007-005 spec — a blast-radius miss; this is the deeper truth behind
Overwatch's Audit Obs 2 ("comment-only doc-drift"), which under-classified the *functional-selector* staleness.
**End:** BUG-007-001 fixed (IO self-implemented). Composing ONE `## Next Dispatch` for the **SDET** — independent
re-smoke of the targeted admin document-requests spec against the live stack + close BUG-007-001 at review (IO
cannot approve its own code). On a green re-smoke: BUG closed → Smoke gate clears → advance to **Validate**. Main
session commits the fix after SDET approval (named-file staging; not `.orchestration/STATE.md`).

---

### SDET BUG-007-001 re-smoke + close — BRIEF-007 / EPIC-007 — 2026-06-19

**Phase: BUG-007-001 independent re-smoke + close review (IO self-implemented fix).**

**Diff review: PASS.** All 6 corrected selectors in `apps/admin/e2e/specs/document-requests.spec.ts` verified against
`DocumentRequestEditor.tsx` authoritative testids (rendered at L159/L165/L197/L203 — unchanged production code). Selector
corrections: `label-input` → `document-request-label-input` (L273); `add-request` → `add-document-request-button` (L279, L334);
`request-item` → prefix-match `^="document-request-item-"` (L286, L290, L313, L347). `request-list` (L309) correctly left
unchanged. Header-comment table (L20–25) corrected. No production file modified — single spec file change confirmed.

**Re-smoke: PASS. `pnpm --filter admin e2e:run -- --grep 'document-request'` against live docker stack (4/4 services healthy):**
- Test 9 `[AC-FILE-007-01] accountant creates a labeled document request and it appears in the list` — PASS (447ms). Previously FAILING.
- Test 10 `[AC-FILE-007-01] label validation: empty label rejected client-side without calling the server` — PASS (225ms). Previously FAILING.
- Test 11 `[security][ADR-006] page requires ACCOUNTANT auth — CLIENT session is redirected away` — PASS (197ms). Was already passing.
- **3/3 `document-requests.spec.ts` green.** 32/38 overall (14.6s). 6 failures = `request-accept` (2) + `request-decline` (4) all
  `ECONNREFUSED 127.0.0.1:18025` (mailhog absent — neighbor port-1025 squat, EPIC-003 owned, pre-existing, out of scope).

**BUG-007-001: CLOSED — SDET-approved.** Smoke gate cleared. `## Active bugs` updated; `## Current initiative` phase line updated.
Main session: commit fix (stage `apps/admin/e2e/specs/document-requests.spec.ts` only; not `.orchestration/STATE.md`) then advance to Validate.

---

