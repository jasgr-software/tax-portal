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

**Tasks (7) — TASK-007-001 `done` (SDET-approved, committed `0a84977`); TASK-007-002 dispatched; remainder `backlog`:**
| Task | Impl | E2e | Introduces-gate | AC covered |
| ---- | ---- | --- | --------------- | ---------- |
| TASK-007-001 `FileStorage` port + Azurite/Memory adapters + fail-closed select + compose/env | developer | no | no | AC-FILE-003-01 (adapter contract) |
| TASK-007-002 `FileScanner` port (mock-first) + select + MIME/size validation helper | developer | no | no | (seam for AC-NFR-009-*, AC-FILE-002-01) |
| TASK-007-003 DocumentRequest + Document models + `0007` RLS policy + isolation test | developer | no | **yes** | AC-FILE-008-01, AC-FILE-001-05, AC-FILE-003-02 |
| TASK-007-004 two-phase upload/download pipeline + checklist read model + step satisfaction | developer | **yes** | **yes** | AC-FILE-001-02, AC-ONBD-004-04, AC-FILE-008-01, AC-FILE-003-01/-02/-03/-04, AC-NFR-009-01 |
| TASK-007-005 accountant document-request authoring UI (`apps/admin`) | developer | yes | no | AC-FILE-007-01 |
| TASK-007-006 client document-upload step + checklist + rejection (`apps/portal`) + cross-app e2e | developer | yes | no | AC-ONBD-004-01/-02/-03, AC-FILE-007-02/-03, AC-FILE-008-02/-03, AC-FILE-001-02, AC-FILE-002-01, AC-NFR-009-02 |
| TASK-007-007 `@demo` walkthrough (authoring + upload + rejection gallery) | developer | yes | no | none (non-gating demo) |

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
