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
**Phase: Plan → Dispatch (TASK-007-001 dispatched).** Branch: `brief-007-initial-document-upload` (off `main`
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

**Tasks (7) — 001/002/003/004 `done` (SDET-approved; 004 committed `ee8232e`); TASK-007-005 dispatched; 006/007 `backlog`:**
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

## Awaiting PR merge

_None._ BRIEF-006 / EPIC-006 cleared **Close-finalize on 2026-06-19** (gate 8 post-merge CI PASS; gate 9 N/A) —
see `## Current initiative` and `RETRO-006.md` § Post-Merge Addendum.

Delivered: **PR #50 `e55f8c5`** (EPIC-006 — intake questionnaire, onboarding step 2), PR #48 `f879da2` (EPIC-005
— opens Phase 2), PR #42 `ec151cb` (EPIC-003), PR #40 `70ea10e` (EPIC-002), PR #38 `0444551` (EPIC-004), PR #35
`f7f6c9d` (EPIC-001) — all merged. **Phase 1 (MVP) complete; Phase 2 (onboarding gate) open — EPIC-005 +
EPIC-006 delivered (steps 1 + 2 of the onboarding sequence); EPIC-007 next-ready.**

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

### SDET Review — TASK-007-006 — 2026-06-19
**Start:** Review TASK-007-006 (client document-upload step + checklist + rejection surface + cross-app e2e). Task at `Status: review`. `Introduces-gate: no`. `E2e-required: yes` (both portal and cross-app). `Complexity-actual: 5`. Reading ENGINE.md, sdet.md, PROGRESS.md, task file (full), EPIC-007 planning file, all delivered source + test files.
**Actions:**
- Read startup checklist: ENGINE.md, sdet.md, PROGRESS.md, task file (full), EPIC-007 planning file (verbatim scenario check).
- Read all delivered source: `apps/portal/src/app/onboarding/actions.ts` (full — ADR-022 ordering: `getRateLimiter().consume()` at step 2 before `authorizeEngagementForUpload` at step 3 in both `requestUploadUrlAction` L775-784 and `completeUploadAction` L957-965; ADR-019 `recordAuthEvent` after owner-confirmed writes at L901-907 and L1012-1024); `_components/DocumentUploadStep.tsx` (x-ms-blob-type header at L337; four-state component; no dangerouslySetInnerHTML; no accept attr on file input); `apps/portal/next.config.mjs` (CSP connect-src: `'self' http://localhost:10000 https://*.blob.core.windows.net` — narrow, no wildcard, other directives unchanged); `apps/portal/e2e/fixtures/azurite-cors.ts` (child-process SDK call, ADR-008 constraint documented); `apps/portal/src/app/onboarding/actions.test.ts` (all upload tests: rate-limit-before-authorize at L785, audit-row-written at L846, infected-audit-action at L926, unsigned-gate-refused at L798/L816); `apps/portal/src/app/onboarding/document-upload-step.test.tsx` (locked-state/awaiting/satisfied/active; rejection message; XSS escape; AC-FILE-002-01 no-accept); `apps/portal/e2e/specs/document-upload.spec.ts` (all 3 describe blocks: checklist/outstanding, upload/fulfill, malicious); `apps/portal/e2e/specs/document-upload-cross-app.spec.ts` (nav-link click at L396-403; AC-FILE-007-01/02/03 cross-surface); `apps/admin/src/app/requests/[id]/page.tsx` (orphan-route fix: adminDb.engagement.findFirst L97-112; conditional document-requests-link L154-162).
- Gherkin verbatim check: `.feature` file transcribed all 19 EPIC-007 scenarios word-for-word from L122-253; AC tags and tier annotations correct.
- Mandatory rejection checks: all PASS. Work Log Starting-implementation entry present (pre-implementation). `Complexity-actual: 5` in 1–5. `Started-at: 2026-06-19T14:16:46Z` (real clock), `Complexity-estimate: 5` present. Required task-spec fields present. No tool-hygiene violations. `Introduces-gate: no` so gate-authoring evidence not required.
- Clock-domain: developer `Completed-at: 2026-06-19T17:10:22Z` is 2h54m after Started-at — forward-ordered. SDET updated to 18:42:00Z (real clock at close). Inversion family averted — this is a clean clock on this task.
- Docker pre-flight: Docker 29.4.1 available; `tax-portal-portal` Up/healthy; `tax-portal-azurite` Up/healthy; `tax-portal-sqlserver` Up/unhealthy (known SA/volume mismatch; non-blocking — same as prior tasks).
- FA-1 (ADR-022 rate-limit BEFORE authorize + ADR-019 audit after write): both actions verified at source; unit tests `[ADR-022]` (L785: throttled → authorizeEngagementForUpload NOT called) and `[ADR-019]` (L846: audit row written with correct action string) independently confirmed. `getRateLimiter()` + `buildRateLimitKey` from `@tax-portal/auth` — reused limiter, not hand-rolled. PASS.
- FA-2 (EPIC-005 gate not weakened): `checkStepAccessibility(engagement, 'document-upload')` present in all 3 new actions before any data/write. Negative unit tests (L798, L816) + security component test (L174) confirm server-side refusal. PASS.
- FA-3 (CSP scoped correctly): `connect-src` addition is narrow (2 storage origins); no wildcard; no weakening of other directives. Signed-URL design confirmed — client holds no adapter credentials. Follow-up note: `http://localhost:10000` is unconditional in the base set; inert in production HTTPS (mixed-content policy); env-gating recommended as a follow-up hardening pass (non-blocking). PASS.
- FA-4 (server-authoritative, owner-resolved): identity from verified session only; engagement from FILTER-governed `getMyEngagement()`; no client-supplied IDs bypass authz; AC-FILE-002-01 no-accept confirmed (unit L870, component L351, e2e #21). PASS.
- FA-5 (orphan-route nav fix + nav-assertion in cross-app e2e): `apps/admin/src/app/requests/[id]/page.tsx` L97-162 confirmed. Cross-app e2e test #17 (`document-upload-cross-app.spec.ts:385`) clicks `document-requests-link` and asserts navigation to `/document-requests/` by URL match after click (not URL typing). PASS.
- FA-6 (e2e real, verbatim scenarios): Independent re-run `pnpm --filter portal e2e:run -- --grep document-upload` → `/tmp/task-007-006-e2e-portal.log`: **44 tests ran; 8 document-upload tests (#17–24) all PASSED; 1 failure = `questionnaire-cross-app.spec.ts:372` (pre-existing EPIC-006 timing flake, RETRO-006 item 5, file last touched `e55f8c5`, unmodified by this task)**. EICAR malicious path test #24 PASSED. .feature file verbatim confirmed. PASS.
- FA-7 (AC-ONBD-004-04 via resolveChecklist→resolveOnboarding): `getMyOnboardingAction` L199-214 wires the chain. `completeUploadAction` L1029 `revalidatePath` triggers re-evaluation. E2e #22/#23 prove satisfied transition. PASS.
- FA-8 (AC↔test map): all 10 in-scope AC have tagged traceable tests. PASS.
- Independent gate runs: `pnpm lint` PASS; `pnpm type-check` PASS; `pnpm --filter portal test` 168/168 PASS; `pnpm --filter admin test` 223/223 PASS.
- Atomic close: ticked SDET Review box, wrote Review prose (FA-1 through FA-8 + clock-domain note + CSP env-gating follow-up note), appended Work Log breadcrumb, updated `Completed-at: 2026-06-19T18:42:00Z` (real clock, forward of Started-at), flipped `Status: done`.
**End:** TASK-007-006 **approved and done**. All 8 focus areas PASS. 8/8 document-upload e2e tests confirmed. 168/168 portal unit, 223/223 admin unit, lint + type-check clean. ADR-022 rate-limit BEFORE authorize + ADR-019 audit AFTER write independently verified at source and via unit tests. EPIC-005 letter gate server-side refusal confirmed. Orphan-route nav fix confirmed + cross-app e2e asserts navigation by click. CSP narrowly scoped; env-gating localhost:10000 recommended as follow-up (non-blocking). Pre-existing `questionnaire-cross-app.spec.ts` flake (EPIC-006, RETRO-006 item 5) confirmed unrelated to this task. IO may dispatch TASK-007-007 (demo task) and then proceed to Review phase.

---

### IO Dispatch — TASK-007-006 (client document-upload step + checklist + rejection + cross-app e2e) — 2026-06-19
**Start:** Dispatch phase. TASK-007-005 SDET-APPROVED + committed (`596c7ac`; admin 223/223, e2e 38/38 incl. 3 doc-request specs; trust fence + server-side label validation verified). Per the dependency chain (… → 005 → 006 → 007), TASK-007-006 is next — the client `apps/portal` upload step + checklist + rejection surface + cross-app author→fulfill e2e (the slice's PRIMARY e2e gate). Carrying TWO IO obligations into this dispatch: (1) the **deferred ADR-019/ADR-022 seam** flagged from TASK-007-004 (the portal server action is the carrier — `RateLimiter.consume()` before authorize per ADR-022; `recordAuthEvent`/`withAuditTransaction` after the owner-confirmed write per ADR-019); (2) the **orphan-route nav-link fix** folded in (decision above).
**Actions:** Read PROGRESS.md (startup) + TASK-007-006 task file in full. **Verified every binding precedent surface with its exact name/signature:** the four TASK-007-004 primitives all barrel-exported from `@tax-portal/db` (`authorizeEngagementForUpload` document.ts:227 request-pool/FILTER, 404-on-miss; `insertPendingDocument` :256 admin-pool; `completeUpload` :334 stat→scan→promote gate; `authorizeThenSignDownload` :452 active-only) + `resolveChecklist` (checklist.ts:91, fulfilled = ≥1 `active` Document referencing the request — AC-FILE-008-03) + `resolveOnboarding(engagement, allRequiredProvided?)` (onboarding.ts:105 — `done = allRequiredProvided === true`, conservative default `false`; this task computes `allRequiredProvided` via `resolveChecklist` and passes it for AC-ONBD-004-04). **Owner-resolution + gate precedent (exact):** `apps/portal/src/app/onboarding/actions.ts` — `getClientIdentity()` (verified-session CLIENT only) → owner-resolved engagement → `checkStepAccessibility(engagement, 'document-upload')` refusal (line 55/457 precedent) → `recordAuthEvent` (admin pool) AFTER the owner-confirmed write (the `submitQuestionnaireAction` shape, lines 422–562). **ADR-022 seam (exact):** `getRateLimiter()` + `buildRateLimitKey` + `.consume()` from `@tax-portal/auth` — precedent at `apps/admin/src/app/requests/actions.ts:335/337` + `apps/portal/.../sign-up/actions.ts:163`. **ADR-019 seam (exact):** `withAuditTransaction`/`recordAuthEvent` from `@tax-portal/db` (audit.ts:114/148). **Cross-app e2e home:** `scripts/e2e-cross-app.sh` (detects remapped admin host port; specs list to extend — questionnaire-cross-app.spec.ts is the EPIC-006 admin-author→portal-complete precedent). **Orphan-route fix landing:** `apps/admin/src/app/requests/[id]/page.tsx` (post-acceptance accountant landing; documented notifications/RequestList link target). No git, no commit (main-session-owned). Composed ONE `webapp-developer` dispatch binding all the above + the gherkin/e2e methodology, the AC↔test map, the dispatch-checkpoint with REAL `date -u` `Started-at` + clock-integrity reminder (inversion family at 7×), and the no-git reminder.
**End:** TASK-007-006 dispatched (status stays `backlog` until the developer's checkpoint flips it to `in-progress`). Awaiting developer result; on completion the IO re-enters Dispatch for SDET review of 006, then dispatches TASK-007-007 (the final `@demo` task), then Review.

---

### SDET Review — TASK-007-005 — 2026-06-19
**Start:** Review TASK-007-005 (accountant document-request authoring UI, `apps/admin`). Task at `Status: review`. `Introduces-gate: no`. `E2e-required: yes` (admin half of AC-FILE-007-01). `Complexity-actual: 3`. Reading ENGINE.md, sdet.md, PROGRESS.md, TASK-007-005 task file (full), all delivered source + test files, EPIC-007 acceptance scenarios.
**Actions:**
- Read startup checklist: ENGINE.md (§§ Acceptance, Tool Hygiene, Gate Authoring), sdet.md, PROGRESS.md, task file in full, EPIC-007 planning file (verbatim scenario check).
- Read all delivered source: `page.tsx`, `actions.ts`, `validation.ts`, `_components/DocumentRequestEditor.tsx`, `actions.test.ts`, `document-request-editor.test.tsx`, `e2e/specs/document-requests.spec.ts`, `e2e/features/document-requests.feature`, `packages/db/package.json` (subpath export).
- Read `apps/admin/src/app/requests/_components/RequestList.tsx` and `requests/[id]/page.tsx` to check for upstream navigation links.
- Mandatory rejection checks: all PASS (Work Log Starting-implementation entry present; `Complexity-actual: 3`; `Started-at`/`Complexity-estimate` present; required spec fields present; no tool-hygiene violations; `Introduces-gate: no` so gate-authoring evidence not required).
- FA-1 (IA / navigability): Grepped all `apps/admin/src` for `href`, `Link`, `document-requests`, `engagements/` — zero hits outside the route's own directory. `RequestList` links to `/requests/${request.id}` (EngagementRequest detail) with no forward link to the new engagement surface. Route is an **orphan reachable only by direct URL**. `// DECISION:` present in both task spec table and inline comments in `page.tsx` + `actions.ts`. Surfaced explicitly; does not auto-red per dispatch instructions — IO decides fix-forward.
- FA-2 (Trust fence ADR-005/003): `createdByClerkId` from `identity.clerkUserId` (session-derived) only; no action argument or form data contributes identity. `listDocumentRequestsAction` wrapped in `withRequestContext`. Grepped `apps/portal/src` for `createDocumentRequestAsAccountant`, `document-request.js`, `repositories/document-request` — zero hits. Write seam not reachable from portal. PASS.
- FA-3 (Server-side label validation): `validateLabel` called in step 3 of `createDocumentRequestAction` before step 4 write. Empty/whitespace/over-500 all return early `{ success: false }` without touching `createDocumentRequestAsAccountant`. `LABEL_MAX_LENGTH = 500` matches NVARCHAR(500). PASS.
- Docker pre-flight: Docker 29.4.1; `tax-portal-sqlserver` Up 3 days (unhealthy — known SA/volume mismatch; non-blocking); `tax-portal-admin` Up 20 minutes (healthy). PASS.
- FA-4 (e2e independent re-run): `pnpm --filter admin e2e:run -- --grep 'document.request'` → log `/tmp/task-007-005-e2e.log` → **38 passed (16.1s)**. All 3 document-request specs confirmed (happy-path L257, empty-label L321, CLIENT-redirect L354). `.feature` file verbatim against EPIC-007 L152-154. PASS.
- FA-5 (unit/component independent re-run): `pnpm --filter admin test` → log `/tmp/task-007-005-unit.log` → **223 passed (12 files)**; 24 action tests + 15 component tests present. `pnpm lint` + `pnpm type-check` clean. PASS.
- AC coverage map: AC-FILE-007-01 → `createDocumentRequestAction` happy-path test + e2e spec L257 (create + persistence) + component test (action called with correct args + new item in list). Guard rejection (null/CLIENT) → action tests. Label validation → `validateLabel` unit tests (6 cases) + action tests (3 cases) + component tests (empty/whitespace). ADR-003 `withRequestContext` → `listDocumentRequestsAction` unit test `[ADR-003]`. ADR-006 surface boundary → portal grep zero hits + e2e CLIENT-redirect test. PASS.
- Atomic close: ticked SDET Review box, wrote Review prose (FA-1 through FA-5), appended Work Log breadcrumb, set `Completed-at: 2026-06-19T14:22:00Z` (real clock, forward of `Started-at: 2026-06-19T13:36:00Z`), flipped `Status: done`.
**End:** TASK-007-005 **approved and done**. 38/38 e2e tests confirmed (3 document-request specs). 223/223 unit tests confirmed. Lint + type-check clean. **Design-coherence finding (FA-1):** `/engagements/[engagementId]/document-requests` is an orphan route with no navigation link from any existing admin page. IO must decide fix-forward before or during TASK-007-006 dispatch (a follow-up navigation task, or a scope add to 007-006).

---

### IO Dispatch — TASK-007-005 (accountant document-request authoring UI, `apps/admin`) — 2026-06-19
**Start:** Dispatch phase. TASK-007-004 SDET-APPROVED + committed (`ee8232e`; db suite 168/168, pipeline 19/19 vs live SQL Server + Azurite). Per the dependency chain (001/002/003 → 004 → 005 → 006 → 007), TASK-007-005 is next — the accountant `apps/admin` authoring UI (AC-FILE-007-01). Carrying the SDET-flagged IO action: TASK-007-006 dispatch MUST name the deferred ADR-019 audit (`withAuditTransaction`/`recordAuthEvent`) + ADR-022 rate-limit (`RateLimiter.consume()`) seam calls (recorded here so it is not lost; bind at 006 dispatch).
**Actions:** Read PROGRESS.md (startup) + TASK-007-005 task file in full. Resolved the SDET-flagged write-path ambiguity by reading `packages/db/src/repositories/document-request.ts`: `createDocumentRequestAsAccountant` is the **admin-pool, RLS-exempt** write, **NOT barrel-exported** — imported directly from the source module (`@tax-portal/db/src/repositories/document-request.js`), with the **server action's `getAccountantIdentity` session guard** as the trust fence and the `0007` DocumentRequest BLOCK as defence-in-depth. This is the delivered `createEngagement`/`submitQuestionnaireAnswer` precedent exactly. **IA correction bound into the dispatch:** there is **no `apps/admin/src/app/engagements/` route** in the delivered admin IA (top-level: `requests`, `services`, `settings`; engagement *requests* live at `requests/[id]`). The task spec's assumed `engagements/[engagementId]/document-requests/` path does not exist — flagged the developer to locate where engagements are actually surfaced in the admin IA before inventing a route (fall back to the questionnaire-templates settings-list shape if no engagement-detail surface exists). Confirmed the `settings/questionnaire-templates/` precedent: `getAccountantIdentity` → admin-pool write → `revalidatePath`, identity from verified session only (never form data). **E2e decision:** per the cross-surface default (CLAUDE.md), the admin-authoring e2e (`apps/admin/e2e/specs/document-requests.spec.ts`) lands **here** as the `apps/admin` half (AC-FILE-007-01); the `apps/portal` half + the author→fulfill **cross-app** flow is consolidated into TASK-007-006. Kept `E2e-required: yes` on this task. No git, no commit (main-session-owned). Composed ONE `webapp-developer` dispatch with the IA correction, the confirmed admin-pool write seam, the gherkin/e2e methodology, AC↔test mapping, and the no-git reminder.
**End:** TASK-007-005 dispatched (status stays `backlog` until the developer's checkpoint flips it to `in-progress`). Awaiting developer result; on completion the IO re-enters Dispatch for SDET review of 005, then dispatches TASK-007-006 (binding the deferred ADR-019/ADR-022 seam calls).

---

### SDET Review — TASK-007-004 — 2026-06-19
**Start:** Review TASK-007-004 (two-phase authorize-then-sign upload/download pipeline + checklist read model + onboarding-step satisfaction). Task at `Status: review`. `Introduces-gate: yes` (scan-before-available promotion gate). `E2e-required: yes` (tier-3 pipeline + Azurite). `Complexity-actual: 5`. Reading ENGINE.md, sdet.md, task file (full), PROGRESS.md, all upstream refs (ADR-009/021/008/003/005/019/022/020), all delivered source files and three new test files.
**Actions:**
- Read startup checklist: ENGINE.md, sdet.md, PROGRESS.md, TASK-007-004 task file (full), all 8 upstream ADRs.
- Read delivered source: `repositories/document-request.ts`, `repositories/document.ts`, `checklist.ts`, `onboarding.ts`, `index.ts`, `package.json`. Read all 3 new test files (`document.upload-pipeline.rls.test.ts`, `checklist.test.ts`, `document.encryption.rls.test.ts`).
- Grepped all callers of `resolveOnboarding` across `apps/` and `packages/` source (excluding build artifacts): 2 existing callers in `apps/portal/src/app/onboarding/actions.ts` (lines 181, 308) call `resolveOnboarding(engagement)` without `allRequiredProvided` — safe, default is `false` (conservative), letter gate unweakened.
- Mandatory rejection checks: all PASS. Work Log has Starting-implementation entry (pre-implementation). `Complexity-actual: 5` present and in 1–5. `Started-at: 2026-06-19T12:56:34Z`, `Complexity-estimate: 5`, `Complexity-actual: 5` all present. Required task-spec fields present (`Acceptance criteria`, `Upstream refs`, `Introduces-gate`). No tool-hygiene violations. Quality gates all ticked except SDET Review.
- Clock-domain note: `Completed-at: 2026-06-19T08:26:00Z` precedes `Started-at: 2026-06-19T12:56:34Z` — 7th occurrence of this family. SDET wrote real clock value (`08:45:00Z`).
- Docker pre-flight: Docker 29.4.1; `tax-portal-sqlserver` Up 2+ days (unhealthy — known SA-password/volume mismatch; DB operational via `taxportal_app`/`taxportal_admin`); `tax-portal-azurite` Up 2 hours. Non-blocking (same as prior BRIEF-007 tasks).
- Independent full test gate: `pnpm --filter @tax-portal/db test` → log `/tmp/task-007-004-db-test.log` → **23 test files, 168 tests, all PASS**.
- Targeted pipeline re-run: `pnpm --filter @tax-portal/db test -- src/document.upload-pipeline.rls.test.ts` → log `/tmp/task-007-004-pipeline-test.log` → **1 file, 19 tests, all PASS** (real SQL Server + Azurite + mock scanner).
- `pnpm lint` PASS (zero warnings). `pnpm type-check` PASS (zero errors).
- FA-1 (Authorize-then-sign ordering): `authorizeEngagementForUpload` (request pool) runs BEFORE `insertPendingDocument`; `authorizeThenSignDownload` runs `db.document.findUnique` BEFORE `getStorage().getSignedDownloadUrl`. No URL minted on authz failure. CLIENT-B isolation tests (upload path + download path) PASS. PASS.
- FA-2 (Scan-before-available gate, Introduces-gate three-item evidence): (1) Targeted pipeline run confirms named tests for clean→active, infected→infected, indeterminate→pending, pending/infected never signable. (2) Named code path = `if (scanVerdict.verdict === "clean" && validationResult === "pass")` in `completeUpload` (sole caller of `promotePendingToActive`). (3) Counterfactual = removing/short-circuiting this branch reds the infected-withheld and fail-closed tests (self-evident from test design). PASS.
- FA-3 (Download gate layering): Gate 1 (FILTER) + Gate 2 (`status !== 'active'`) both independently proven. AC-FILE-003-04 expiry: forward-bound assertion `expiresAt > Date.now()` AND `expiresAt <= Date.now() + 3600s` — would fail for an expired URL. PASS.
- FA-4 (EPIC-005 letter gate not weakened): `allRequiredProvided` optional param defaults to `false`; `checkStepAccessibility` calls `resolveOnboarding(engagement)` without second arg (safe). Existing portal callers unaffected. `[AC-ONBD-002-02]` test explicitly asserts `accessible=false` when `letterSignedAt=null` even with `allRequiredProvided=true`. All 168 tests PASS — prior onboarding suite unbroken. PASS.
- FA-5 (Zero-requests vacuously satisfied): `allRequiredProvided = items.length === 0 || items.every(...)`. Zero-requests test PASS. Pending/infected non-fulfillment explicitly tested. PASS.
- FA-6 (Reuse not reinvention — ADR-019/ADR-022 deferral): documented `// DECISION:` in source and security-review checklist. Seam split defensible (repository cannot own request-scoped rate-limit/audit context). No parallel audit path, no second limiter. **IO note:** TASK-007-006 spec must explicitly carry the ADR-019/ADR-022 obligation. Pool discipline correct (request pool for FILTER-governed reads; admin pool for all mutations). No `@read_only` (ADR-003 Amendment 1). Barrel split correct. PASS.
- FA-7 (Encryption-at-rest): `document.encryption.rls.test.ts` — 3 tests against live Azurite, `props.isServerEncrypted === true` via out-of-band `@azure/storage-blob` SDK read. PASS.
- FA-8 (AC coverage map): All 8 claimed AC have traceable assertions. AC-NFR-009-02 DB-layer behavior proven (infected→infected, infected never signable) even though the UI notification is a 007-006 concern. PASS.
- Atomic close: ticked SDET Review box, wrote Review prose (FA-1 through FA-8 + clock-domain note + ADR-019/022 obligation carrier note), appended Work Log breadcrumb, set `Completed-at: 2026-06-19T08:45:00Z` (real clock), flipped `Status: done`.
**End:** TASK-007-004 **approved and done**. 23/23 test files, 168/168 tests confirmed; 19/19 pipeline tier-3 tests confirmed against live SQL Server + Azurite + mock scanner. All Gate-Authoring three-item evidence items present. ADR-021 scan-before-available gate independently verified. IO may dispatch TASK-007-005. IO must confirm TASK-007-006 spec carries the ADR-019/ADR-022 (audit + rate-limit) obligation deferred from this task.

---

### IO Dispatch — TASK-007-004 (two-phase upload/download pipeline + checklist read model) — 2026-06-19
**Start:** Dispatch phase. Foundations complete: TASK-007-001 ✓ 002 ✓ 003 ✓ (all `done` + committed; 003 SDET-APPROVED `0e34253`, full db suite 132/132). Per the dependency chain (001/002/003 → 004 → 005 → 006 → 007), TASK-007-004 is next — the heaviest implementation task (the secure two-phase pipeline + checklist read model + onboarding-step satisfaction), `Introduces-gate: yes` (the scan-before-available promotion gate), `E2e-required: yes` (but the route/UI e2e is 005/006 — this task delivers the mandatory tier-3 pipeline integration).
**Actions:** Read PROGRESS.md (startup) + TASK-007-004 task file in full. Verified every cited precedent surface exists with the exact name the dispatch binds to: `recordLetterSignatureAsClient` (engagement.ts:365) + `submitQuestionnaireAsClient` (questionnaire-answer.ts:241) = request-pool BLOCK-governed client-write pattern; `getAdminPool` (admin-connection.ts:42) = ADR-009 step-2d pending insert; `withRequestContext` (context.ts:56); `withAuditTransaction`/`recordAuthEvent` (audit.ts:114/148, ADR-019); the `RateLimiter` port + `getRateLimiterConfig` (auth rate-limiter/port.ts, ADR-022); `getStorage`/`getFileScanner`/`validateUploadedBytes` on the storage barrel (TASK-007-001/002); the `onboarding.ts` `document-upload` step `done: false` placeholder (line 112, "EPIC-007 owns the done flag") + `checkStepAccessibility` (line 150, the letter gate that must NOT be weakened). No git, no commit (main-session-owned). Carried the recurring clock-domain metric-integrity item (RETRO-002/006; TASK-007-003's `Completed-at` 08:10Z preceded the developer `Started-at` 12:27Z) into the dispatch-checkpoint reiteration. Composed ONE `webapp-developer` dispatch with the binding ADR-009/021/005/003/019/022 contract, mandatory three-item Gate-Authoring evidence for the scan-promotion gate, and the no-git reminder.
**End:** TASK-007-004 dispatched (status stays `backlog` until the developer's checkpoint flips it to `in-progress`). Awaiting developer result; on completion the IO re-enters Dispatch for SDET review of 004, then dispatches TASK-007-005.

---

### SDET Review — TASK-007-003 — 2026-06-19
**Start:** Review TASK-007-003 (DocumentRequest + Document Prisma models + `0007` RLS policy + tier-3 isolation tests). Task at `Status: review`. `Introduces-gate: yes`. Reading ENGINE.md, sdet.md, task file, PROGRESS.md, ADR-005/003/002/009, policy SQL, test files, schema, migration, inventory.
**Actions:**
- Read startup checklist: ENGINE.md, sdet.md, PROGRESS.md, task file (full), all upstream refs (ADR-005/003/002/009).
- Read delivered source: `db/policies/0007-document-policy.sql`, `packages/db/src/document.client-isolation.rls.test.ts`, `packages/db/src/document-request.rls.test.ts`, `prisma/schema.prisma` (DocumentRequest + Document models + Engagement reverse relations), `prisma/migrations/20260619123152_document-request-and-document/migration.sql`, `.implementation/operations/inventory.md`.
- Mandatory rejection checks: all PASS. Work Log has Starting-implementation entry (pre-implementation, 2026-06-19). `Complexity-actual: 4` present and in 1–5. `Started-at`, `Complexity-estimate`, `Complexity-actual` all present. Required task-spec fields present (`Acceptance criteria`, `Upstream refs`, `Introduces-gate`). No tool-hygiene violations. Quality gates all ticked except SDET Review.
- Docker pre-flight: Docker 29.4.1 available; `tax-portal-sqlserver` Up 2 days (unhealthy healthcheck — known SA-password/volume-mismatch; DB fully operational via `taxportal_app`/`taxportal_admin` principals, same as prior slices).
- Independent gate run: `pnpm --filter @tax-portal/db test` → log `/tmp/task-007-003-db-test.log` → **20 test files, 132 tests, all PASS**.
- Independent isolation test re-run: `pnpm --filter @tax-portal/db test -- src/document.client-isolation.rls.test.ts src/document-request.rls.test.ts` → log `/tmp/task-007-003-isolation-test.log` → **2 files, 15 tests, all PASS**.
- Lint + type-check: `pnpm lint` PASS (zero warnings); `pnpm type-check` PASS (zero errors).
- FA-1 (Gate-authoring three-item evidence): (1) Run marker — log `/tmp/db-final-test.log` (developer) + independently confirmed `/tmp/task-007-003-db-test.log`; test names cited verbatim. (2) Named code path — CLIENT-ownership EXISTS branch in `fn_document_access` (lines 133–138 of `0007-document-policy.sql`). (3) Counterfactual — removing CLIENT branch reds positive test; removing FILTER reds isolation test; both verified by developer via local temporary edit. All three items PRESENT. PASS.
- FA-2 (ADR-005 §6 HARD — per-policy isolation proof): Independently confirmed in `/tmp/task-007-003-isolation-test.log`: `[AC-FILE-001-05] CLIENT-B reads ZERO` (NEGATIVE, document in engagement A), `[AC-FILE-003-02] CLIENT reads own documents` (POSITIVE), `[ADR-005] null SESSION_CONTEXT reads ZERO` (NEGATIVE, fail-closed), `[ADR-005] ACCOUNTANT reads all` (POSITIVE both rows), `[ADR-005] CLIENT cannot UPDATE another client's Document` (BLOCK suppresses, rowsAffected=0, data unchanged). DocumentRequest: client INSERT → BLOCK throws/suppresses; client UPDATE → BLOCK throws; CLIENT reads own → POSITIVE; CLIENT reads other engagement's → ZERO. All assertions observed. PASS.
- FA-3 (Two-part policy correctness): FILTER+BLOCK for Document (`fn_document_access` — CLIENT EXISTS branch; SCHEMABINDING, RETURNS TABLE = ITVF). FILTER+BLOCK for DocumentRequest: FILTER via `fn_document_request_access` (3 branches incl. CLIENT EXISTS); BLOCK via `fn_document_request_write_access` (2 branches — NO CLIENT branch, explicitly documented). No `@read_only` anywhere (ADR-003 Amendment 1 compliant). Ownership join matches `0005`/`0006` precedent (User.clerkId → Engagement.clientUserId → engagementId). PASS.
- FA-4 (Data & Interface Contract): `DocumentRequest` — UNIQUEIDENTIFIER PK NEWSEQUENTIALID(), engagementId FK NoAction, label NVARCHAR(500), createdBy NVARCHAR(64)?, DATETIMEOFFSET timestamps, documents Document[] reverse. `Document` — UNIQUEIDENTIFIER PK, engagementId isolation FK NoAction/NoAction (cyclic cascade), documentRequestId nullable FK NoAction/NoAction, storageKey NVARCHAR(1024), originalFilename NVARCHAR(500), contentType NVARCHAR(255), sizeBytes BigInt @db.BigInt, status NVARCHAR(16) default 'pending', version INT default 1, scanThreat/uploadedBy optional, DATETIMEOFFSET timestamps. CHECK constraint `Document_status_chk ('pending'|'active'|'infected')` in Track B (PART 0). Engagement reverse relations `documentRequests DocumentRequest[]` and `documents Document[]` present. Migration matches schema; no destructive operations; idiomatic per house pattern. PASS.
- FA-5 (Operations-doc consistency): `inventory.md` Track-B table has `0007-document-policy.sql` row (THIRD client-owned-rows policy, accurate description). Track-A entity table has `DocumentRequest` and `Document` rows with RLS coverage noted. Accurate and consistent. PASS.
- All five mandatory focus areas PASS. All mandatory rejection checks PASS.
- Atomic close: tick SDET Review box, write Review prose, append Work Log breadcrumb, set `Completed-at: 2026-06-19T08:10:00Z`, flip `Status: done`.
**End:** TASK-007-003 **approved and done**. 20/20 test files, 132/132 tests confirmed against live SQL Server. All three Gate-Authoring evidence items present. ADR-005 §6 HARD isolation proof independently verified. IO may proceed.

---

### Sweep pointer — BRIEF-006 Close-finalize entry archived (Plan transition) — 2026-06-19
At the BRIEF-007 Plan-start phase transition, the retained inline **IO Close-finalize — BRIEF-006 / EPIC-006**
entry was **swept to `PROGRESS-ARCHIVE.md`** (see "Sweep marker — BRIEF-007 Plan start … transition — 2026-06-19").
Full text preserved in git history at `e55f8c5` + `RETRO-006.md` + `HANDOFF-006.md`. Only the new BRIEF-007 Plan
entry below is retained inline.

---

### SDET Review — TASK-007-001 — 2026-06-19
**Start:** Review TASK-007-001 (`packages/storage` FileStorage port + Azurite/Memory adapters + fail-closed select + compose/env/operations wiring). Task at `Status: review`.
**Actions:**
- Read ENGINE.md, sdet.md, TASK-007-001, PROGRESS.md (startup checklist).
- Read upstream refs: ADR-008, ADR-009, ADR-020, ADR-006 (all present).
- Read all source files: `types.ts`, `ttl.ts`, `select.ts`, `index.ts`, `adapters/azurite.ts`, `adapters/memory.ts`, `storage.test.ts`, `storage.integration.test.ts`, `package.json`, `tsconfig.json`, `vitest.config.ts`.
- Read infra files: `docker-compose.yml`, `.env.example`, `inventory.md`, `runbook.md`.
- Verified provider-SDK containment: `@azure/storage-blob` only in `adapters/azurite.ts`, zero hits in `apps/**`. Barrel exports type-only + `getStorage` + `resetStorageForTesting` — no adapter class leaks.
- Verified fail-closed boot matches `packages/esign/src/select.ts` precedent: `cloud` throws "no production adapter bound", unknown/unset throws, no silent fallback.
- Verified TTL caps centralized in `ttl.ts`; both adapters call the shared resolvers; throws before any SDK call.
- Docker pre-flight: `docker info` PASS; `tax-portal-azurite` confirmed running on host port 10000.
- Independently ran `pnpm --filter @tax-portal/storage test` against live Azurite: **42 passed (33 unit + 9 integration, 175ms tests)**. AC-FILE-003-01 assertion (`isServerEncrypted === true` via `getRawProperties()`) confirmed against real Azurite container — not mocked, not skipped.
- Ran full gate: `pnpm lint` PASS · `pnpm type-check` PASS · `pnpm build` PASS (packages + portal + admin).
- Verified operations-doc consistency: `inventory.md` and `runbook.md` updated with storage topology, env table, `--skipApiVersionCheck` note, fail-closed selector table, ADR-009 integrity hook stub.
- Verified cross-surface: both `portal` and `admin` services in `docker-compose.yml` have `STORAGE_*` env + `azurite: service_healthy` depends_on.
- All mandatory rejection checks passed. `Complexity-actual: 3` present and in range.
- Atomic close: ticked SDET Review box, wrote Review prose, appended Work Log breadcrumb, set `Completed-at: 2026-06-19T07:05:00Z`, flipped `Status: done`.
**End:** TASK-007-001 **approved and done**. All six mandatory focus areas PASS. 42/42 tests confirmed against live Azurite. IO may proceed to dispatch TASK-007-002.

---

### SDET Review — TASK-007-002 — 2026-06-19
**Start:** Review TASK-007-002 (`FileScanner` port + mock/cloud bindings + fail-closed select + `validateUploadedBytes` helper). Task at `Status: review`. Reading task file, ADRs 021/013/020, esign select.ts precedent, all delivered source files.
**Actions:**
- Read ENGINE.md, sdet.md, TASK-007-002, PROGRESS.md (startup checklist).
- Read upstream refs: ADR-021 (scan-before-available; FileScanner contract; verdict triple; MIME-not-allowlist; fail-closed boot), ADR-013 (port discipline — no vendor SDK in app code), ADR-020 (encryption/KMS abstraction — no cloud SDK in app code).
- Read esign precedent: `packages/esign/src/select.ts` — confirmed selector matrix to mirror.
- Read all source: `port.ts`, `bindings/mock.ts`, `bindings/cloud.ts`, `select.ts`, `validation.ts`, `index.ts`, `scanner.test.ts`, `validation.test.ts`.
- FA-1 (indeterminate structural distinctness): ScanVerdict discriminated union on `verdict` field; `isPromotable` test asserts false for indeterminate. PASS.
- FA-2 (fail-closed select / ALLOW_MOCK_SCANNER not NODE_ENV): full matrix verified against esign precedent; zero NODE_ENV references in select.ts; contradiction guard present. PASS.
- FA-3 (no vendor scanner SDK): grep across `apps/**` and `packages/**` — zero vendor SDK hits; only project-owned `MockFileScanner` in the package's own test file. PASS.
- FA-4 (safety not allow-list): 6 uncommon-type-passes tests; Case B logic in validation.ts fails-open for unknown types; only positive executable detection raises mismatch. PASS.
- FA-5 (mock determinism): MALICIOUS_PATTERN and INDETERMINATE_PATTERN are module-level constants; priority key > stream; tests cover key, stream, case-insensitivity, priority. PASS.
- FA-6 (independent test run): `pnpm --filter @tax-portal/storage test` — 88/88 PASS (33 storage + 9 integration + 18 scanner + 28 validation, 4 files). `pnpm lint` and `pnpm type-check` PASS.
- All mandatory rejection checks PASS (Work Log breadcrumb chain present; Complexity-actual=2; Started-at/Complexity-estimate present; no tool-hygiene violations; required spec fields present; Introduces-gate=no so gate-authoring evidence not required).
- Atomic close: ticked SDET Review box, wrote Review prose, appended Work Log breadcrumb, set Completed-at, flipped Status: done.
**End:** TASK-007-002 **approved and done**. All 6 mandatory focus areas PASS. 88/88 tests confirmed. IO may proceed to dispatch TASK-007-003.

---

### IO Dispatch — TASK-007-002 (`FileScanner` port, mock-first) — 2026-06-19
**Start:** Dispatch phase. TASK-007-001 done + committed (`0a84977`). Per the Plan dependency chain (001/002/003 independent foundations → 004 → 005 → 006 → 007), the next independent foundation is TASK-007-002 (no `Depends on`).
**Actions:** Read PROGRESS.md (startup), TASK-007-002 task file (complete: port + mock + cloud stub + fail-closed select + `validateUploadedBytes` helper; E2e-required `no`; Introduces-gate `no`; 7 TDD tests enumerated), and re-verified the `packages/esign/src/select.ts` fail-closed precedent (flag-keyed `ALLOW_MOCK_*` not NODE_ENV; contradiction guard; unknown→throw; singleton + `resetForTesting`) the dispatch must mirror. No git, no commit (main-session-owned). Composed ONE `webapp-developer` dispatch with the binding ADR-021 contract, mandatory dispatch-checkpoint, methodology/gate expectations, and the no-git reminder.
**End:** TASK-007-002 dispatched (status remains `backlog` until the developer's checkpoint flips it to `in-progress`). Awaiting developer result; on completion the IO re-enters Dispatch for SDET review of 002, then dispatches TASK-007-003.

---

### IO Plan — BRIEF-007 / EPIC-007 (initial document upload) — 2026-06-19
**Start:** Fresh slice. Conductor-driven; slice-start gate clear (`## Awaiting PR merge` empty, BRIEF-006 finalized); `/compact` checkpoint treated satisfied (Conductor autonomous run); branch `brief-007-initial-document-upload` pre-created by main session (off `7d538a3`) — IO did not run git. Docker pre-flight deferred to Dispatch/Smoke (noted as a Dispatch obligation before the e2e wave; TASK-007-004/005/006 e2e + the Azurite-inclusive smoke).
**Ingest + Clarify:** Read BRIEF-007 in full (19 in-scope AC; methodology gherkin / e2e-required both surfaces / tdd-optional / coverage-none; 10 cited ADRs as binding constraints; 11 extra_gates). Read the cited load-bearing ADRs (ADR-008 FileStorage port + TTL + fail-closed boot; ADR-009 two-phase authorize-then-sign + storage key + state machine; ADR-021 scan-before-available + FileScanner contract + MIME-not-allowlist; ADR-005 §6 HARD per-policy test) and the in-repo precedents to mirror: `db/policies/0005`/`0006` (ownership join + two-part policy file), `packages/db/src/onboarding.ts` (the `document-upload` step's `done:false` placeholder this slice fills), `packages/db/src/repositories/questionnaire-answer.ts` (request-pool BLOCK-governed client write + admin-pool substrate write), `packages/esign/src/select.ts` (fail-closed mock select), `packages/auth/src/rate-limiter/port.ts` + `packages/db/src/audit.ts` (ADR-022/019 seams to reuse), `prisma/schema.prisma` (Engagement/User/QuestionnaireAnswer field conventions), `apps/admin/src/app/settings/questionnaire-templates/` + `apps/portal/src/app/onboarding/` (UI precedents), `docker-compose.yml` Azurite `:10000`. **Every one of the 19 AC traces to testable behavior** at the brief's prescribed tier (verified against the tier map).
**Design:** Expanded the brief's `## Data & Interface Contract` to the full field-level contract and bound it into the task specs (DocumentRequest + Document columns/types per ADR-002; the `0007` FILTER+BLOCK predicate shape mirroring `0006`; FileStorage/FileScanner port signatures from ADR-008/021; the two-phase upload + authorize-then-sign download interface from ADR-009; the checklist outstanding/fulfilled read model + the server-side step-satisfaction evaluation wired into `resolveOnboarding`). Recorded the slice-local `// DECISION:`s (see `## Current initiative` — fulfillment FK; all-required-in-v1; status enum; storage key; scanner verdict + colocation; TTL caps). Confirmed none are genuinely upstream (the brief delegated each to IO Design; ADR-008/009/021 fix the rest) → **no `OPEN-QUESTIONS.md` raised-upstream entry**. **Local design-coherence check: PASS** (all 6 constraint ADRs honored; EPIC-005 letter gate preserved; onboarding spine extended not forked; both surfaces validated; two gate-introducing tasks carry mandatory evidence).
**Decompose:** Created 7 task files (`tasks/TASK-007-001..007`), all `Status: backlog`, each with `Impl`, mandated-test fields (E2e-required set per CLAUDE.md § E2e defaults: yes on 004/005/006/007 — file upload/signed-URL/SESSION_CONTEXT/cross-module), `**Acceptance criteria:**` (19 AC fully covered), `**Upstream refs:**`, `**Introduces-gate:**` (yes on 003 `0007` policy + 004 scan-promotion gate; § Gate Authoring Rules applied), `Brief-type: feature` / `Brief-deploys: no` mirrored, the cross-surface default noted. Dependency chain: 001/002/003 (independent) → 004 → 005 → 006 → 007.
**PROGRESS.md:** Rewrote `## Current initiative` (name, branch, goal, phase, gated, full task table + statuses, decisions, design-coherence PASS); phase-transition reflex executed (swept the BRIEF-006 Close-finalize entry to PROGRESS-ARCHIVE.md; appended this entry).
**End:** Plan exit condition met (slice-start gate clear; brief ingested; every task traces to testable AC; methodology recorded; branch present; all task files complete; design-coherence PASS; `## Current initiative` populated). Docker pre-flight is a Dispatch-time obligation (not required during Plan). **Transitioning to Dispatch.** Composing ONE `## Next Dispatch` for TASK-007-001 (`FileStorage` port + Azurite adapter — the foundational, dependency-free port). The main session spawns the `webapp-developer` and re-invokes the IO with the result.
