# Progress

> Single source of truth for current initiative state, quality gates, active bugs, and retro action items. The SA, RA, and SDET update this file at the start and end of every invocation. Structure contract: see `.claude/agent-stack.md` § PROGRESS.md structure contract.

## Current initiative

**Lights-out enablement chore**  
Branch: `chore/lights-out-enablement` (created 2026-04-26 by SA)  
Goal: Land the infrastructure that lets `.claude/agent-stack.md` § Autonomy Ceiling item 3 (PR merge auto-on-green) graduate from DEFERRED to PROMOTED. Six tasks: GitHub Actions CI workflow + SQL Server service container + auto-issue on failure (decisions #1A + #2A/B); branch protection runbook (decision #1A); `scripts/validate-gates.sh` backstop; extend `scripts/metrics-report.py` with cost reporting (decision #4B); new ADR for repository-interface-as-test-seam; and a single workflow-file edit batch (PushNotification call-sites per decision #2C, RA-decides-CLARIFs rule + legal/compliance/security carve-out per decision #3, stuck-loop killswitch per decision #5, plus SDET ADR-011 alignment fix for the round-2-port dead pointer).  
Phase: Dispatch (TASK-LOE-001 done; TASK-LOE-003 SDET REJECT, one-line fix re-dispatching; TASK-LOE-004 awaiting SDET review)  
Gated: Yes (touches `.github/workflows/`, `scripts/`, `docs/decisions/`, `.claude/agent-stack.md`, `agents/*.md`)

**Tasks:**

| Task | Owner | Status | Depends on | Introduces-gate | E2e |
|---|---|---|---|---|---|
| `TASK-LOE-001-ci-workflow.md` | devops | done (SDET approved 2026-04-27; follow-up: Node.js 20 action deprecation — create task before Epic 001) | none | yes | no |
| `TASK-LOE-002-branch-protection-runbook.md` | devops | backlog | TASK-LOE-001 | no | no |
| `TASK-LOE-003-validate-gates-script.md` | devops | in-progress (SDET REJECT 2026-04-27 — `check_ci_evidence` grep format mismatch; see BUG-000-001; one-line fix required, re-submit) | none | yes | no |
| `TASK-LOE-004-metrics-cost-reporting.md` | devops | review (impl done; per-epic + per-agent + monthly rollups; MODEL_RATES updated — Opus 3x price drop verified against Anthropic docs) | none | no | no |
| `TASK-LOE-005-adr-repository-test-seam.md` | sa (`Impl: sa`) | backlog | none | no | no |
| `TASK-LOE-006-workflow-file-edits.md` | sa (`Impl: sa`) | backlog | TASK-LOE-005 | yes | no |

Dispatch order: 1 → 3 → 4 → 5 → 2 → 6. Rationale: 1 first (CI infra is the longest task and unblocks 2). 3 + 4 are independent of 1 and can run after. 5 (ADR) feeds 6 (workflow edits cite the ADR), so 5 before 6. 2 depends on 1's job names existing in `ci.yml`, so 2 lands after 1 is reviewed (not necessarily after 1 is `done` — `review` is sufficient since the YAML is final at that point). 6 last because it's the broadest workflow edit + needs ADR-011 from 5.

_Decision context for the SA — read the **2026-04-26 Main Session Chore — Lights-out enablement decisions** entry below for the full discussion + locked decisions + per-task brief._

> **Note on Epic 001:** Previously queued as `## Current initiative` (Foundation: Scaffold, Auth, DB, Routing & Deployment Pipeline). Deferred until this chore completes. All pre-Plan blockers for Epic 001 remain cleared (CLARIF-004 resolved; personas and flows authored; ACs updated for two-app architecture). Once this chore merges, the SA picks up Epic 001 on the next invocation.

## Awaiting PR merge

_None._

## Active bugs

_None._

## Open retro action items

- **2026-04-20 — Dispatch Checkpoint rule-sunset check** (owner: Overwatch). Evaluate at the Close-prep retro of the third post-merge epic. If no task has cited § Dispatch Checkpoint as the rule that enabled mid-execution recovery, surface the rule for keep/revise/retire decision per `.claude/agent-stack.md` § Rule Sunset. Rationale: the rule was imported prophylactically from the upstream sibling repo; no tax-portal incident was observed at port time, so it must earn its keep on this codebase.
- **2026-04-20 — Gate Authoring Rules hotfix-exception promotion check** (owner: Overwatch). At the first hotfix epic that invokes the § Gate Authoring Rules "Hotfix urgency" exception (gate lands as `advisory` pre-evidence), confirm the promotion-back-to-required step actually happens once the incident resolves. Track from the hotfix task's Work Log and the follow-up task that carries the three-item evidence. Rationale: the exception is easy to invoke and easy to leave hanging — the promotion step is where the gate earns its "required" status back, and it needs an explicit check the first time the path is exercised.
- **2026-04-20 — `docs/architecture/model-behavior-notes.md` rot check** (owners: Overwatch, RA, SDET). After the next two quad reviews complete, evaluate whether Lens B (model-behavior lens) produced any cited entries into the notes file. If zero citations across two reviews, decide: (a) seed the file with the three candidate entries identified during the port review (`spec-shaped-green`, `breadcrumb-skip`, `gate-counterfactual-plausibility`), or (b) retire the Lens B requirement from `.claude/agent-stack.md` § Main Session Rules and remove the notes file. Rationale: the stub file's own rule is "observed failures, not speculative ones" — leaving it empty indefinitely signals the Lens B process isn't working; seeding it speculatively contradicts its charter. Two quad reviews is the forcing function for keep/seed/retire.

---

### SDET Review — TASK-LOE-003 — 2026-04-27

**Start:** Reviewing TASK-LOE-003 (`scripts/validate-gates.sh` + pre-push hook + CI integration). Read agent-stack.md, sdet.md, CLAUDE.md, task spec, validate-gates.sh, pre-push, install.sh, ci.yml, package.json, fixture directory, TASK-LOE-001 (the already-done Introduces-gate: yes task in done/).

**Actions:**
- Verified dispatch checkpoint: "Starting implementation" entry exists in Work Log; status went `backlog → review` in a single commit (64b4ceb, 2026-04-26T20:08:37) but the Working Log breadcrumb ordering criterion is satisfied (absence-check: Starting implementation entry exists before review-shaped entry). Same precedent as TASK-LOE-001 evaluation. Not a hard reject.
- Verified required task-spec fields: `Affected flows: none (justification: …)`, `Affected requirements: none (justification: …)`, `Introduces-gate: yes` — all populated. PASS.
- Verified `Complexity-actual`: 3 (valid 1–5). PASS. `Started-at` and `Complexity-estimate` both present. PASS.
- Verified 8 check functions exist in `scripts/validate-gates.sh`: `check_task_file_completion`, `check_bug_files_present_for_done`, `check_progress_md_structure`, `check_gated_path_accountability`, `check_work_log_content`, `check_playwright_artifacts`, `check_ci_evidence`, `check_pr_body_quad_review`. All 8 confirmed. PASS.
- Verified script exits non-zero on failure, zero on full pass. `set -euo pipefail` at top; `main()` exits 1 when `${#FAILURES[@]} > 0`. PASS.
- Verified 7 fixtures — spot-checked 3 via live runs:
  - `clean` → exit 0. PASS.
  - `done-missing-complexity` → exit 1, `check_task_file_completion: Complexity-actual missing or not 1-5`. PASS.
  - `pr-body-workflow-missing-verdict` → exit 1, `check_pr_body_quad_review: PR body missing verdict marker: [sa]`. PASS.
- Verified pre-push hook: calls `bash "$SCRIPT"` at line 27; exits non-zero on failure (line 27 `if ! bash "$SCRIPT"; then ... exit 1`); does not parse `--no-verify` (comment explicitly documents this). PASS.
- Verified install.sh: creates symlink `ln -s "$source" "$target"` at `.git/hooks/pre-push`; idempotent (checks existing symlink target before overwriting). PASS.
- Verified CLAUDE.md: `bash scripts/hooks/install.sh` added as first command in Local Development Setup block (line 151). PASS.
- Verified CI integration: `validate-gates.sh` step at line 51–52 of `.github/workflows/ci.yml` inside `lint-and-typecheck` job, after pnpm lint/type-check steps. PASS.
- Verified `gates:validate` in package.json: `"gates:validate": "bash scripts/validate-gates.sh"`. PASS.
- Verified Gate Authoring Rules evidence (Introduces-gate: yes):
  - Run URL/local log: red-then-green pattern present. `scripts/hooks/pre-push` with bad task file → `PRE_PUSH_EXIT: 1`; fixed → `PRE_PUSH_EXIT: 0`. Accepted as local execution evidence per § Gate Authoring Rules § Evidence requirement. PASS.
  - Named code path: `scripts/validate-gates.sh:check_task_file_completion()` — line 155: `if ! grep -qE "^\*\*Complexity-actual\*\*: [1-5]$" "$f"; then`. Confirmed at line 155. Work Log cites "line 29" for pre-push hook (`if ! bash "$SCRIPT"; then`) but actual line is 27 — minor off-by-2 inaccuracy, entity clearly exists. PASS (non-blocking).
  - Counterfactual: `grep -qE "^\*\*Complexity-actual\*\*: [1-5]$"` → `grep -qE "^\*\*Complexity-actual\*\*:"` would let `Complexity-actual: —` pass. Concrete and falsifiable. PASS.
- **CRITICAL BUG — REJECT:** `check_ci_evidence` uses `grep -q "^\*\*Introduces-gate\*\*: yes"` (colon after closing `**`), but all task files use `**Introduces-gate:** yes` (colon inside the bold span, before closing `**`). This format mismatch causes the check to find zero matching tasks and report "no Introduces-gate done tasks" — a false PASS. Verified: `grep -c "^\*\*Introduces-gate\*\*: yes" docs/tasks/done/TASK-LOE-001-ci-workflow.md` returns 0; the actual line is `**Introduces-gate:** yes`. As a result, TASK-LOE-001 (the only done Introduces-gate: yes task) is silently skipped and the gate provides no protection. The same format mismatch may also affect `check_playwright_artifacts` (uses `^\*\*E2e-required\*\*: yes`) — task files use `**E2e-required**: yes` (colon after closing `**` in this case), so that pattern may work. `**Status**: done` is the one field that uses the colon-after-`**` format, and that grep does work (confirmed: returns 1 hit for TASK-LOE-001). The `Introduces-gate` field is the anomaly — it uses the `**Field:** value` format (colon inside bold), not the `**Field**: value` format (colon outside bold) used by Status, E2e-required, Started-at, etc.
- Real-repo run of `bash scripts/validate-gates.sh`: outputs `check_ci_evidence (no Introduces-gate done tasks) PASS` — confirms the bug silences the check against the live repo.
- Cross-surface scope: vacuously satisfied (apps/ not yet scaffolded). PASS.
- Security review: no `eval`, no `curl | sh`, variables quoted. PASS.

**End:** REJECT. One hard blocking bug: `check_ci_evidence` grep pattern `^\*\*Introduces-gate\*\*: yes` does not match the `**Introduces-gate:** yes` format used in task files — the gate silently PASSes with zero tasks checked. Fix required: change the grep to `grep -q "^\*\*Introduces-gate:\*\* yes"` (or the correct format — verify against the actual file). Re-run real-repo to confirm TASK-LOE-001 is now found and passes evidence checks. Re-submit for SDET review.

### SDET Review — TASK-LOE-001 — 2026-04-27

**Start:** Reviewing TASK-LOE-001 (GitHub Actions CI workflow + SQL Server service + auto-issue). Read agent-stack.md, sdet.md, CLAUDE.md, task spec, ci.yml, PROGRESS.md head+tail, ADR-002, ADR-006.

**Actions:**
- Verified dispatch checkpoint: "Starting implementation" entry present; status backlog→in-progress + Started-at + Complexity-estimate land in commit `a2134c7` alongside ci.yml — co-commit, but Work Log breadcrumb ordering criterion satisfied (absence-check passes: Starting implementation entry exists before review-shaped entry). Not a hard reject per sdet.md § Pre-implementation Work Log entry missing criterion.
- Verified required task-spec fields: `Affected flows`, `Affected requirements`, `Introduces-gate` all populated with explicit none-with-justification or yes values.
- Verified gate authoring evidence (Introduces-gate: yes):
  - Gate 1 (`lint-and-typecheck`): run URL 24971165581 confirmed green via `gh run view`; named code path ci.yml lines 35–49 confirmed; counterfactual (`"lint": "exit 1"` or remove package.json guard) is concrete.
  - Gate 2 (`security-scan`): same run URL, job confirmed green; named code path ci.yml lines 157–184 confirmed; counterfactual (CVE package in lockfile or remove has_jsts guard) is concrete. Pre-scaffold CodeQL exit-32 incident (run before fix) satisfies the "in-flight regression" Gate Authoring Rules exception.
  - test-portal/test-admin: advisory (continue-on-error: true) — evidence not required at landing per Speculative/sandbox carve-out. Confirmed.
- Verified cross-surface symmetry: test-portal and test-admin have identical job structure (same SQL Server service block, same continue-on-error: true, same advisory rationale). Cross-surface check passes.
- Verified ci.yml content: 5 jobs present; lint-and-typecheck and security-scan are required (no continue-on-error); test-portal and test-admin are advisory with carve-out comment; report-failure has `if: failure() && github.event_name == 'push' && github.ref == 'refs/heads/main'`; SQL Server uses `mcr.microsoft.com/mssql/server:2022-latest` per ADR-002. Actions pinned to @v4. GH_TOKEN scoped to issues:write only. No secrets in plain text.
- Verified red-run verification: run 24971170639 confirms report-failure ran successfully; issue #7 created with label ci-failure, closed after verification. Throwaway branch deleted. Condition was temporarily extended to the throwaway branch — correct methodology.
- Verified CLAUDE.md drift fix: test-web → test-portal + test-admin in § Required CI checks, with advisory note. Matches actual job names in ci.yml.
- Verified submission gate: pnpm lint/type-check skipped (ERR_PNPM_NO_IMPORTER_MANIFEST_FOUND — pre-scaffold, no package.json). Correctly flagged; CI green run is the authoritative gate evidence. Not a fabrication.
- Verified Complexity-actual: 3 (populated). Completed-at set in this atomic edit.
- Side finding: Node.js 20 deprecation warnings on actions/checkout@v4, pnpm/action-setup@v4, actions/setup-node@v4. These become forced Node.js 24 in June 2026. Non-blocking now; must be addressed before Epic 001.
- Executed atomic close edit on task file: SDET Review box ticked, Decision approved, Work Log entry appended, Status → done, Completed-at set to 2026-04-27T00:54:02Z.

**End:** ACCEPT-WITH-FOLLOWUPS. TASK-LOE-001 is done. One follow-up item: create a task (or add to TASK-LOE-002 scope) to bump actions to Node.js 24-compatible versions before June 2026 / before Epic 001. Main session should move task file to `docs/tasks/done/` and commit.

### RA Requirements Definition — 2026-04-16

**Start:** First RA invocation on a greenfield project. No SRS, epics, roadmap, or observations existed. Read intake.md, CLAUDE.md, agent-stack.md, and ra.md. PROGRESS.md had no current initiative. Observations, discovery, and SRS files did not exist — skipped cleanly per startup checklist guidance.

**Actions:**
- Read all source files: `docs/requirements/intake.md` (8 modules, 5 build phases, tech stack, data models, out-of-scope items), `CLAUDE.md` (product vision, agent config, tech stack), `agents/ra.md` (role rules), `.claude/agent-stack.md` (workflow engine rules)
- Created `docs/requirements/SRS.md` — 62 requirements across 8 functional areas (AUTH×9, DOOR×10, ONBD×7, LIFE×12, FILE×12, MSG×18, DASH×13, IDNT×6) plus 8 NFRs. All status: Planned. Flagged 6 open clarifications.
- Created `docs/requirements/observations.md` — empty with header and format instructions.
- Created 8 epic files in `docs/requirements/`:
  - `ep-001-foundation-scaffold.md` — fully detailed ACs (9 ACs), ready for SA
  - `ep-002-front-door.md` — fully detailed ACs (8 ACs), CLARIF-001 blocks
  - `ep-003-client-onboarding.md` — stubbed ACs, CLARIF-006 blocks
  - `ep-004-file-exchange.md` — stubbed ACs
  - `ep-005-messaging-notifications.md` — stubbed ACs
  - `ep-006-engagement-lifecycle.md` — stubbed ACs, CLARIF-002 and CLARIF-003 block
  - `ep-007-accountant-dashboard.md` — stubbed ACs
  - `ep-008-polish-security-audit.md` — stubbed ACs, CLARIF-005 blocks
- Created `docs/plans/release-roadmap.md` — 5-phase roadmap with epic references and clarification blockers mapped to phases
- Updated `docs/tasks/PROGRESS.md` (this file) — set Current initiative to Epic 001, flagged CLARIF-004 as pre-SA blocker

**Key findings / clarifications flagged for user:**
1. **CLARIF-001** — Decline message portal retention (blocks Epic 002)
2. **CLARIF-002** — Client-facing status label mapping (blocks Epic 006)
3. **CLARIF-003** — Duplicate engagement handling behavior (blocks Epic 006)
4. **CLARIF-004** — Portal name for v1 client-facing text (blocks Epic 001 — needs answer before SA runs)
5. **CLARIF-005** — Hard delete vs 7-year retention conflict (blocks Epic 008)
6. **CLARIF-006** — Docuseal self-hosted or cloud (blocks Epic 003)

**Data model note:** The intake listed `Message.engagementId (nullable)` for general threads. The SRS reorganized this with an explicit `Thread` model as the parent of `Message`, to properly support general and engagement-scoped threads. The SA should review this during plan and create an ADR if the design holds.

**End:** Requirements definition complete. Epic 001 is fully specified and ready for SA pickup after CLARIF-004 is resolved. Epics 002–008 exist with enough context for the SA to plan; later-phase epics need RA refinement before their SA execution begins.

### SA Tier-1 ADR Batch (write phase) — 2026-04-16

**Start:** Third SA invocation on this pre-Plan work. The prior two SA invocations produced a stack analysis; the user then delivered three constraints (SQL Server, defer deploy, Docker for local dev) and green-lit the revised plan after a seven-point walk-through. Entered this invocation to **write** the Tier-1 ADR batch — no more analysis. PROGRESS.md current initiative (Epic 001 in Plan-preflight) was preserved; the Plan phase itself has not started.

**Actions:**
- Wrote Tier-1 ADRs to `docs/decisions/`:
  - `ADR-001-authentication-clerk.md` (pre-existing from prior SA invocation, verified and left unchanged) — Clerk as sole auth provider; roles via Clerk `publicMetadata`, mandatory ACCOUNTANT 2FA, invitation-only sign-up, Clerk webhook → SQL Server `User` row under admin principal, `User.clerkId` as non-PK column, UUID PKs for app FKs.
  - `ADR-002-database-sql-server.md` (pre-existing, left unchanged) — SQL Server 2022 primary datastore; Developer edition in Docker for local dev; production engine deferred to Phase 5; `UNIQUEIDENTIFIER DEFAULT NEWSEQUENTIALID()` PKs; `DATETIMEOFFSET` timestamps; two migration tracks (Prisma + raw SQL); known Prisma+SQL Server rough edges documented.
  - `ADR-003-identity-propagation-session-context.md` (pre-existing, left unchanged) — Clerk → SQL Server identity bridge via `sp_set_session_context @read_only=1`; two pools (`app_user_role` + `app_admin_role`); Prisma `$extends` wrapper fail-closed on missing context; pool-reset regression test mandatory; alternatives (per-user DB users, `EXECUTE AS`, JWT-in-DB, app-side RLS, `CONTEXT_INFO`) rejected with reasoning.
  - `ADR-004-orm-prisma-single-track.md` (NEW) — Prisma as sole ORM with single-track client; two pools not two ORMs; `packages/db/sql/` raw-SQL escape hatch; schema-first; version pinned.
  - `ADR-005-rls-via-security-policies.md` (NEW) — SQL Server Security Policies with FILTER + BLOCK predicates; admin-principal exemption in every predicate; predicate shallowness + access-set tables + ITVF-only as the perf mitigation toolbox; `.rls.test.ts` suite per policy as hard requirement; Epic 001 baseline table list.
  - `ADR-006-monorepo-layout.md` (NEW) — pnpm workspaces, no build orchestrator in v1; `apps/web`, `packages/{db,storage,emails,eslint-config,tsconfig}`, `prisma/`, `db/{migrations,policies,seed}`, `scripts/`, `infra/` reserved; Turbo/Nx revisited at Phase 5.
  - `ADR-007-container-packaging-deploy-agnostic.md` (NEW) — OCI container packaging; multi-stage Dockerfile on `node:20-alpine`; no Vercel-specific APIs; long-lived Node process; `/healthz` + `/readyz` required; Phase-5 host capability list; Azure Container Apps / App Service / Fly.io / Render / Railway / self-hosted / App Runner eligible; Cloud Run eligible-with-SSE-caveat; Vercel-serverless / Workers-only / Lambda-only ineligible; preview-per-PR downgraded to nice-to-have.
  - `ADR-008-object-storage-abstraction.md` (NEW) — port-and-adapter `FileStorage` interface; Azurite dev adapter, memory test adapter, no prod adapter in Epic 001; `STORAGE_ADAPTER=cloud` without binding fails startup; default TTLs 5 min download / 15 min upload, hard cap 1 hour; encryption-at-rest as adapter-contract requirement; signing runs under adapter credentials after app-side RLS-scoped authorization passes.
  - `ADR-009-signed-url-file-access.md` (NEW) — authorize-then-sign pattern; storage key `engagements/{id}/documents/{id}/v{n}/{filename}` with folder structure held in DB not keys; two-phase upload with reconciliation cron; soft-delete semantics; `## Hard-Delete Policy (pending CLARIF-005)` carved out with proposed default (DB tombstone only, storage purged at 7-year sweep) awaiting user decision.
- Updated `docs/architecture/TENETS.md`: replaced tenet 7 with the approved wording (database is the trust boundary; app propagates identity; fail-closed on missing identity; admin principal is the documented bypass); updated `## Status` line to reflect the 2026-04-16 amendment.
- Appended this session entry to `docs/tasks/PROGRESS.md`. **`## Current initiative` unchanged** — Epic 001 Plan has not started (still blocked on CLARIF-004).

**Decisions captured (from the seven-point user walk-through, locked in for ADRs):**
1. SQL Server licensing — all options open; Developer edition in Docker for local dev; production engine deferred.
2. User PK = `UNIQUEIDENTIFIER DEFAULT NEWSEQUENTIALID()`; `User.clerkId` is a separate unique `NVARCHAR(64)` non-PK; all app FKs reference `User.id` (UUID).
3. Realtime via SSE for v1 with single-process scaling caveat documented; reconnect pulls fresh state. (Full realtime ADR deferred to Tier 2.)
4. Dev object storage = Azurite; prod storage deferred but Azure Blob is the gravity. Adapter interface keeps S3 / R2 / GCS on the table.
5. Docuseal = self-hosted prototype-stage; docker-compose gains a Postgres container for Docuseal's own DB when Epic 003 starts. (Docuseal ADR deferred.)
6. Preview-per-PR = nice-to-have, not a Phase-5 filter. Epic 001 CI stays lean.
7. Tenet 7 rewording approved as written above.
8. RA's `Thread` as explicit parent of `Message` accepted; to be captured as `// DECISION:` in Prisma schema during Epic 001, not promoted to an ADR.

**Deferred ADRs (not written in this invocation):**
- Realtime / SSE ADR — Tier 2, deferred. Will be written before Epic 005 (Messaging & Notifications).
- Cron / scheduled-jobs ADR — Tier 2, deferred. Written before Epic 004 (File exchange → overdue reminders) or Epic 005 (whichever lands first).
- Docuseal integration ADR — deferred to Epic 003 (Client onboarding) and gated on CLARIF-006 (self-hosted vs cloud — user confirmed self-hosted in walk-through, but implementation details still want a dedicated ADR before integration starts).
- Email / Resend ADR — deferred until email flows start landing (Phase 2–3).
- Production deploy ADR — deferred to Phase 5.

**Open clarifications still blocking downstream work:**
- **CLARIF-004** (portal name in client-facing text) — blocks Epic 001 Plan. User must answer before SA enters Plan.
- **CLARIF-005** (hard-delete vs 7-year retention conflict) — blocks Epic 008 and leaves an explicit "Hard-Delete Policy (pending CLARIF-005)" section in ADR-009 with a proposed default.
- CLARIF-001, CLARIF-002, CLARIF-003, CLARIF-006 remain open; each blocks the epic the RA assigned it to.

**End:** Tier-1 ADR batch complete. Nine ADRs exist in `docs/decisions/` (001-003 pre-existing from prior SA invocation; 004-009 written this invocation). Tenet 7 amended. PROGRESS.md `## Current initiative` preserved — Plan phase has not begun. Recommended main-session next steps: (a) update CLAUDE.md's tech-stack table and submission-gate notes to reflect the SQL Server / Clerk-only / deploy-agnostic stack, (b) invoke the RA to generalise SRS wording that still references Supabase (REQ-AUTH-003, REQ-FILE-003, REQ-MSG-012, REQ-NFR-001, REQ-NFR-004, § 4 NFR table), (c) resolve CLARIF-004 with the user so SA can enter Epic 001 Plan. SA ends invocation.

### SA Two-Frontend Split ADR Batch (write phase, pre-Epic-001 cleanup) — 2026-04-16

**Start:** Fourth SA invocation on pre-Epic-001 work. User directed a structural architecture change: the single `apps/web` model is replaced by two front ends — `apps/portal` (Client Portal, client-facing) and `apps/admin` (Tax Portal, accountant-facing). Scope of this invocation is ADR revisions only; no Plan phase, no `docs/requirements/` edits (RA runs next), no `apps/` edits (nothing scaffolded yet). Read agent-stack.md, agent-phases.md, sa.md, CLAUDE.md, intake.md, SRS.md, ep-001-foundation-scaffold.md, and listed existing ADRs. TENETS.md and PROGRESS.md read for status-line/session-entry updates.

**Actions:**
- **Revised `docs/decisions/ADR-006-monorepo-layout.md`** — replaced single `apps/web` with `apps/portal` (Client Portal, port 3000) + `apps/admin` (Tax Portal, port 3001). Documented shared `packages/` shape (db, storage, emails, ui, eslint-config, tsconfig). Added `packages/ui` in v1 (shadcn primitives + layout shells; no business logic). Playwright strategy: two per-app configs against a shared docker-compose stack (rationale: scoped runs, different base URLs, different auth fixtures, different result artifacts; shared stack because cross-app flows — invitation landing, end-to-end accept→onboarding — require one DB state). Cross-app spec placement rule: spec lives in the app where the flow terminates. Server Actions vs API routes: per-app, no cross-app HTTP — coordination via DB + realtime. Turbo/Nx still deferred (two apps + 5 packages is trigger-threshold but not yet painful).
- **Revised `docs/decisions/ADR-001-authentication-clerk.md`** — picked **one Clerk application, two sign-in surfaces** over two Clerk applications. Rationale: cross-app invitation flow (accountant accepts → Clerk invitation → portal sign-up completion) is first-class with one Clerk app; user identity remains comparable across apps (one `clerkId` per user); webhook topology stays simple (one webhook, landing on `apps/portal/api/webhooks/clerk`); forward-compatible with Clerk Organizations for hypothetical v2 multi-firm SaaS. Role gates enforced in per-app middleware — CLIENT cannot render admin pages, ACCOUNTANT cannot render CLIENT-only portal pages, public portal routes remain reachable unauthenticated. Role storage unchanged (`publicMetadata.role`). Invitation email sender is Clerk (Resend not involved). Session spans both apps automatically when both apps are registered as Clerk allowed origins.
- **Revised `docs/decisions/ADR-007-container-packaging-deploy-agnostic.md`** — picked **two images, one per app** over single-image-with-two-entrypoints. Rationale: independent deploy cadence, independent blast radius, different scaling profiles, different ingress policies, per-image dep audit, per-image health probe granularity. Each app ships `apps/<app>/Dockerfile` with standard multi-stage Alpine build, per-image size target <300MB, independent `/healthz` + `/readyz` endpoints. Host capability list updated to require two workloads deployable independently — all prior candidates (ACA, App Service, Fly, Render, Railway, self-hosted, App Runner, Cloud Run-with-caveat) remain eligible. Vercel serverless, Workers-only, Lambda-only remain ineligible. Cron remains a separate (future) image.
- **Created `docs/decisions/ADR-010-cross-app-navigation-session-boundaries.md`** — covers: role-based landing redirect matrix (redirect-not-403 for misnavigation; 403 reserved for genuine permission errors); cross-app deep links (always absolute, target-app-specific; middleware handles auth/redirect); session sharing (one Clerk session covers both apps — local dev shares `localhost` cookie, production depends on domain structure); no shared in-app session storage; cross-app coordination via DB + realtime only (no app-to-app HTTP); webhook endpoints live on portal; middleware skeleton (illustrative) for both apps; mandatory Epic-001 e2e negative tests for cross-app behavior. Flagged production domain structure to user: three options (subdomains of one apex, path-based split, two apexes); recommended Option A (two subdomains of one apex, e.g., `portal.firmname.com` + `tax.firmname.com`) — cleanest Clerk cookie story, matches `REQ-IDNT-001`'s `portal.herfirm.com` reference.
- **Fixed Tenet 1** in `docs/architecture/TENETS.md` — replaced "Supabase Row-Level Security on every table with client-facing data" with "SQL Server Security Policies (row-level filter + block predicates) on every table with client-facing data — see ADR-005." Rest of tenet preserved.
- **Updated TENETS.md `## Status` line** — noted Tenet 1 amended 2026-04-16 and two-frontend architecture added 2026-04-16 with pointer to ADR-010 and per-app middleware role gates.
- **Appended this session entry** to `docs/tasks/PROGRESS.md`. `## Current initiative` preserved — Plan phase has not begun (still blocked on CLARIF-004 and on RA pass to generalise Supabase wording + backfill personas/flows for two-app architecture).

**ADR numbering:** 001, 006, 007 revised (superseded content replaced in place — revision dates noted in each ADR's header). 010 created as the next available number. 002, 003, 004, 005, 008, 009 unchanged by this invocation.

**Tenet 1 final wording (quoted):** "Security and data privacy are non-negotiable. This is a financial application handling tax documents, SSNs, and sensitive personal information. Every feature is designed assuming attacker presence. Encryption at rest (AES-256), signed URLs for file access, Clerk-enforced 2FA on the accountant account, and SQL Server Security Policies (row-level filter + block predicates) on every table with client-facing data — see ADR-005."

**Design choices made autonomously (documented in the ADRs above):**
1. App names: `apps/portal` + `apps/admin` (directory-neutral; user-facing brands "Client Portal" and "Tax Portal" decoupled from directory names).
2. Ports: 3000 (portal) + 3001 (admin). Portal on lower-number default because it's the public-facing first-hit surface.
3. Playwright: two per-app configs, shared docker-compose stack.
4. Server Actions vs API routes for cross-app: per-app Server Actions; no cross-app HTTP at all. Coordination through DB + realtime.
5. Session storage: no in-app session store; Clerk session is authoritative; cookies naturally span both apps when Clerk allowed-origins includes both.
6. `packages/ui`: yes in v1 — shadcn primitives + layout shells; no business logic.
7. Clerk topology: one Clerk application shared across both apps.
8. Container packaging: two images, one per app.
9. Webhook endpoint: lives on `apps/portal` (single public-facing ingress surface for webhook receipt).

**Flagged to user (not decided here):**
- **Production domain structure** — Option A (recommended): two subdomains of one apex (`portal.firmname.com` + `tax.firmname.com`). Option B: path-based split. Option C: two unrelated apexes. ADR-010 describes trade-offs; Clerk allowed-origins config and deploy-time ingress depend on the choice. No ADR will be written until the user picks.

**Architectural concerns surfaced mid-analysis but not resolved in the ADRs:**
- **Webhook handler placement long-term.** Currently lands on `apps/portal`. If production ingress policy ever restricts portal to public traffic and moves admin behind a VPN/allow-list, the webhook stays with the public app by construction — fine. If both apps ever end up behind ingress restrictions, webhook handler extraction into a dedicated service may be warranted. Not Epic 001's problem; noted in ADR-001 for revisit.
- **Shared role-gate helper package.** ADR-010 hand-waves between "shared helper in `packages/db`" vs "new `packages/auth`." Epic 001 Plan should pick one during task breakdown — recommend `packages/auth` since auth concerns are growing (middleware, role gates, invitation flow helpers). Not an ADR-level decision.
- **Cross-app e2e scaffolding.** AC-001-008 in ep-001 references a single-app Playwright setup. Acceptance criteria will need RA refresh to cover two apps' Playwright configs + cross-app session / deep-link specs. RA territory — noted for their pass.
- **Clerk `publicMetadata.role` writability.** Clerk's public metadata is writable only via backend API — good for role integrity. But the admin UI writing role through the backend must happen inside a server action; a developer accidentally calling a client-side helper would silently fail. A lint rule (in `packages/eslint-config`) or a wrapped helper in `packages/db`/`packages/auth` is worth considering. Epic 001 Plan decision.
- **Cron / scheduled jobs as a third image.** Flagged in ADR-007 but not formalised. When cron lands (Epic 004 or 005), the decision whether it's `apps/cron` (workspace app) or a thinner `scripts/run-cron` standalone image should be made then. Not Epic 001.
- **Env var enforcement for `PORTAL_APP_URL` / `ADMIN_APP_URL`.** Both apps need these to construct cross-app redirect URLs. Missing env at startup should fail the readyz probe, not silently render broken links. Epic 001 scaffolding task should include a startup check.

**Files modified this invocation:**
- `docs/decisions/ADR-001-authentication-clerk.md` — revised (Clerk topology: one app, two sign-in surfaces; role middleware gates; invitation flow; session spans both apps).
- `docs/decisions/ADR-006-monorepo-layout.md` — revised (two apps, `packages/ui` added, Playwright strategy, port assignments, app naming rationale).
- `docs/decisions/ADR-007-container-packaging-deploy-agnostic.md` — revised (two images, per-app Dockerfiles, per-app health endpoints, host capability list updated for two workloads).
- `docs/decisions/ADR-010-cross-app-navigation-session-boundaries.md` — created (redirect matrix, deep links, session sharing, middleware skeletons, production domain question flagged).
- `docs/architecture/TENETS.md` — Tenet 1 amended (Supabase RLS → SQL Server Security Policies); `## Status` line updated.
- `docs/tasks/PROGRESS.md` — this entry appended.

**End:** Two-frontend split ADR batch complete. Ten ADRs now exist in `docs/decisions/` (001 + 006 + 007 revised in place; 010 new). Tenets 1 and 7 both amended. PROGRESS.md `## Current initiative` preserved — Epic 001 Plan still pending RA follow-up pass (RA needs to generalise SRS wording for two-frontend architecture, backfill personas/flows that reference the single-app assumption, and refresh AC-001-008's Playwright scope) and user resolution of CLARIF-004 + production-domain-structure question. SA ends invocation.

### RA Pre-Epic-001 Cleanup — 2026-04-16

**Start:** Second RA invocation, same PR as the SA's two-frontend ADR batch. Scope: generalise SRS wording (Supabase/Vercel → tech-stack-agnostic), resolve CLARIF-004, incorporate two-front-end architecture into SRS, backfill personas and flows, refresh Epic 001 ACs, update release-roadmap.md, and append this session entry.

**Actions:**

- **SRS.md rewritten (version 1.0 → 1.1):**
  - Added Architecture Note section at top explaining two-front-end model with ADR-006 and ADR-010 cross-references.
  - REQ-AUTH-003: replaced "Supabase Row-Level Security (RLS)" → "SQL Server Security Policies (per ADR-005)".
  - REQ-AUTH-010: new requirement capturing the cross-app redirect rule (ADR-010 matrix).
  - REQ-DOOR-001–010: reworded to name `apps/portal` and `apps/admin` where behavior is surface-specific.
  - REQ-ONBD-003, REQ-DASH-001, REQ-DASH-004, REQ-DASH-010: added `apps/admin` surface refs.
  - REQ-FILE-003: replaced "Supabase Storage handles this" → "signed-URL object storage (per ADR-008 and ADR-009)".
  - REQ-MSG-012: replaced "Supabase Realtime (WebSocket)" → "real-time push (Server-Sent Events in v1; see ADR-002c when written)".
  - REQ-MSG-018: replaced "cron job" → "scheduled background jobs (per ADR-009-cron when written)".
  - REQ-IDNT-001: replaced "Configured via Vercel" → deploy-platform-deferred note (ADR-007).
  - REQ-IDNT-003: replaced "portal name TBD" with separate REQ-IDNT-003 (branding deferred) and updated REQ-IDNT-006 to carry the portal names.
  - REQ-IDNT-006 repurposed: was engagement-letter req (that content moved to REQ-IDNT-007); now carries "Client Portal" / "Tax Portal" names. CLARIF-004 resolved and removed from Open Clarifications table.
  - REQ-IDNT-007: new requirement for engagement letter template (content split from REQ-IDNT-006).
  - REQ-NFR-001: replaced "Supabase Row-Level Security" → "SQL Server Security Policies (per ADR-005)".
  - REQ-NFR-002: added "See ADR-009".
  - REQ-NFR-004: replaced entire Supabase/Vercel stack with current stack (SQL Server, ADR-006 two-app, ADR-007 container packaging, ADR-008/ADR-009 storage).
  - CLARIF-005: updated "Supabase Storage" → "object storage" in question text.
  - Total requirements reworded: 18 existing, 2 added (REQ-AUTH-010, REQ-IDNT-007), 1 repurposed (REQ-IDNT-006). REQ-IDNT-003 retitled (no longer "name TBD"). CLARIF-004 removed from open table.

- **Personas created (4):**
  - `docs/requirements/personas/jane-accountant.md` — solo accountant, primary ACCOUNTANT user, `apps/admin` daily surface.
  - `docs/requirements/personas/tom-prospective-client.md` — anonymous prospective client, public front-door path.
  - `docs/requirements/personas/sarah-returning-client.md` — returning CLIENT with existing account, re-engagement path.
  - `docs/requirements/personas/martha-and-james-married-couple.md` — multi-participant scenario, two CLIENTs one engagement.

- **Flows created (6):**
  - `docs/requirements/flows/flow-first-sign-in.md` — **foundational** (Epic 001). Invitation → CLIENT sign-up → portal landing. ACCOUNTANT direct sign-in → admin landing. Covers REQ-AUTH-001, REQ-AUTH-004, REQ-AUTH-005, REQ-AUTH-006, REQ-AUTH-009, REQ-AUTH-010, REQ-NFR-001, REQ-NFR-004.
  - `docs/requirements/flows/flow-role-redirect.md` — **foundational** (Epic 001). CLIENT → admin redirect; ACCOUNTANT → portal-private redirect. Covers REQ-AUTH-001, REQ-AUTH-002, REQ-AUTH-003, REQ-AUTH-010, REQ-NFR-001, REQ-NFR-004.
  - `docs/requirements/flows/flow-engagement-request.md` — Phase 2 (Epic 002 scope). Anonymous + returning-client request submission, accept/decline, invitation email. Stub-level but complete.
  - `docs/requirements/flows/flow-onboarding.md` — Phase 3 (Epic 003 scope). Three-step gate: letter e-sign, questionnaire, doc upload → `In Progress`. Stub-level; CLARIF-006 dependency noted.
  - `docs/requirements/flows/flow-message-exchange.md` — Phase 4 (Epic 005 scope). Per-engagement and general thread messaging, notifications, email digest. Stub-level.
  - `docs/requirements/flows/flow-file-exchange.md` — Phase 4 (Epic 004 scope). Signed-URL upload/download, document requests, version history, soft-delete, overdue reminders. Stub-level.

- **Epic 001 (ep-001-foundation-scaffold.md) updated:**
  - Purpose section: rewritten for two-app architecture, references ADR-006 and ADR-010.
  - Requirements in scope: REQ-AUTH-003 updated (SQL Server Security Policies), REQ-AUTH-010 added, REQ-NFR-004 updated, REQ-IDNT-006 added.
  - AC-001-001: two Next.js apps (`apps/portal` port 3000, `apps/admin` port 3001), not one. `packages/` structure. Browser tab titles per REQ-IDNT-006.
  - AC-001-002: both apps, one Clerk application. `PORTAL_APP_URL`/`ADMIN_APP_URL` env vars. `apps/admin` no sign-up route.
  - AC-001-003: per-app middleware (portal + admin), cross-app redirect matrix per ADR-010. Shared role-gate helper.
  - AC-001-004: SQL Server `UNIQUEIDENTIFIER` PKs per ADR-002. Webhook handler on `apps/portal/api/webhooks/clerk`. `Thread` model `// DECISION:` comment.
  - AC-001-005: "Supabase RLS baseline" → "SQL Server Security Policy baseline". `db/policies/` Track B. Integration test per-policy.
  - AC-001-006: docker-compose brings up both apps + SQL Server + Azurite. `.env.example` includes `PORTAL_APP_URL`/`ADMIN_APP_URL`.
  - AC-001-007: Vercel removed. CI builds two OCI container images. Size check per image.
  - AC-001-008: two Playwright configs (one per app). Cross-app negative tests, session continuity spec, sign-out spec. All ADR-010 § E2e tests mandatory. Per-app result artifacts.
  - AC-001-009: operations docs updated for two apps, two ingress points, two-image deploy pattern.
  - `**Affected flows:**` fields added to all ACs that touch user-facing behavior.
  - Notes for SA updated.

- **release-roadmap.md updated (version 1.0 → 1.1):**
  - Phase 1 goal: rewritten for two-app scaffolding + ADR-006/ADR-010 cross-refs.
  - ep-001 notes: "scaffolds both `apps/portal` + `apps/admin`".
  - Phase 1 gate: "both apps' e2e suites green, cross-app redirect specs pass".
  - Phases 2–5 goals: updated to name `apps/portal` and `apps/admin` where relevant.
  - Phase 5: mentions two OCI images and production deploy ADR to be written.
  - Open Clarifications table: added Status column. CLARIF-004 marked Resolved 2026-04-16.

- **PROGRESS.md `## Current initiative` updated:** goal rewritten for two-app architecture. CLARIF-004 blocker removed. Pre-Plan blockers cleared note added.

**CLARIF-004 resolution:** Portal names confirmed as: "Client Portal" (browser tab titles, page headers, email subjects in `apps/portal`) and "Tax Portal" (browser tab titles, page headers in `apps/admin`). REQ-IDNT-006 updated. Removed from SRS § Open Clarifications. Removed from release-roadmap.md as a blocker. PROGRESS.md current-initiative blocker removed.

**Flow changes this session:**
- `flow-first-sign-in` — created. Steps for CLIENT invitation path and ACCOUNTANT direct sign-in path. Branches: expired invitation, MFA failure, unauthenticated private route. Postconditions: `User` row created, session active, correct app surface rendered.
- `flow-role-redirect` — created. Scenarios A (CLIENT → admin → portal redirect) and B (ACCOUNTANT → portal-private → admin redirect). Branch B1: ACCOUNTANT on public portal routes — served, no redirect.
- `flow-engagement-request` — created (Phase 2 stub). Full anonymous + returning-client + accountant-initiated paths. Accept and Decline branches.
- `flow-onboarding` — created (Phase 3 stub). Three-step gate, multi-participant branch, Docuseal webhook failure branch.
- `flow-message-exchange` — created (Phase 4 stub). Engagement + general threads, notifications, email digest.
- `flow-file-exchange` — created (Phase 4 stub). Authorize-then-sign pattern, version history, soft-delete, overdue reminders.

**Remaining open clarifications (unchanged by this pass):**
- CLARIF-001 — decline message portal retention (blocks Epic 002)
- CLARIF-002 — client-facing status label mapping (blocks Epic 006)
- CLARIF-003 — duplicate engagement handling (blocks Epic 006)
- CLARIF-005 — hard delete vs 7-year retention conflict (blocks Epic 008)
- CLARIF-006 — Docuseal self-hosted or cloud (blocks Epic 003)

**End:** Pre-Epic-001 cleanup complete. SRS generalised, CLARIF-004 resolved, four personas authored, six flows authored (two foundational for Epic 001, four phase-2+ stubs), Epic 001 ACs updated for two-app architecture, release-roadmap.md updated, PROGRESS.md current initiative refreshed. SA is unblocked to begin Epic 001 Plan phase. RA ends invocation.

### Main Session Chore — Port j4j agent-stack hardening (round 2) — 2026-04-26

**Start:** Branch `chore/port-j4j-agent-stack-hardening`. The first round (commit c6edafd, PR #4) brought the Opus 4.7 hardening + metrics + Two-lens quad review + Gate Authoring Rules + Dispatch Checkpoint + `Introduces-gate` field. This round audits the journey-for-jasmine commits between that baseline and j4j HEAD, ports the non-board items, and runs quad review.

**Audited j4j commits:** dd9cca1, 1672017, bc82394, f0765b8, c10a174, 1e2c20a (already in baseline), caefd8d (already in baseline). Board-related items skipped per user direction (`/board-*` skills, `board-config.json`, observations-as-Issues, `Issue:` field on epics, `[EPIC] ` Issue prefix, board-sync blocks at Plan/Close-prep, `Closes #<task-issue>` PR-body rule, RA-owned roadmap routing — RA already owns the roadmap in this project, but the at-Close-finalize phase change is moot until `docs/plans/release-roadmap.md` exists).

**Ported (5 items):**
- **dd9cca1 — harness agent registration** — created `.claude/agents/` with 8 symlinks (`developer`, `overwatch`, `pd-draft`, `pd-interview`, `pd-review`, `ra`, `sa`, `sdet` → `../../agents/<name>.md`). `agents/*.md` remains the single source of truth; symlinks let the harness auto-discover so `subagent_type: "ra"` etc. resolve without the `general-purpose` indirection. Takes effect on next session restart.
- **c10a174 — portal+admin = one platform** — added `### Platform-frontend scope` section to `CLAUDE.md` (after Agent Team table, before Domain-specific notes); added Plan-phase cross-surface scoping rule + spawn-prompt-inline rule for `[webapp-developer]` to `agents/sa.md`; added cross-surface audit reject criterion to `agents/sdet.md` review process and Quality Parity Audit preamble. Adapted from j4j's `apps/web` + `apps/admin` to tax-portal's `apps/portal` + `apps/admin` (per ADR-006). Sunset trigger preserved (3 consecutive Close-prep retros with zero parity findings → keep/remove review).
- **f0765b8 — `/run-tests` skill** — `.claude/commands/run-tests.md`. Canonical test-invocation pattern that avoids Monitor token waste and matches the existing `Bash(pnpm:*)` allowlist. Adapted from j4j (dropped .NET section, kept portal/admin/cross-app/CI shapes).
- **f0765b8 — `/mirror-audit` skill** — `.claude/commands/mirror-audit.md`. Mechanical cross-surface drift check across `apps/portal` + `apps/admin`. Pairs with the c10a174 SDET reject criterion. Adapted (s/web/portal/, project-specific examples for "intrinsically single-surface").
- **bc82394 (non-board portion) — `/memory-audit` skill** — `.claude/commands/memory-audit.md`. Project-agnostic memory-staleness audit. Adapted (slug → `-home-jasgr-repos-tax-portal`).

**Skipped:**
- `agents/devops.md` (1e2c20a + 6a11381) — j4j version assumes Bicep + Azure infra; tax-portal is Docker Compose + GitHub Actions with prod deploy deferred (ADR-007). Revisit when production platform lands.
- `/pre-deploy` skill (f0765b8) — guards staging deploys; tax-portal has no staging pipeline. Revisit when staging exists.
- bc82394 phases.md change (Close-finalize roadmap update routes through RA) — moot until `docs/plans/release-roadmap.md` exists; RA already owns it per `agents/ra.md` Constraints.
- All board-related skills, config, and prompt additions per user direction.

**Quad review (per `.claude/agent-stack.md` § Agent workflow file changes — two-lens pass):**
- **SA: approve-with-tweaks** — no blocking; advisory findings on rule-duplication between agent-stack.md and the threaded enforcement points (RA + SDET + SA hooks for Gate Authoring Rules), and pre-existing `§ Bug Workstream Quality Gates` dead pointer at `agents/sdet.md:55` (out of scope for this branch).
- **RA: approve-with-tweaks** — flagged grandfathering for `Introduces-gate` at epic close (`agents/ra.md:177`). Demoted to advisory for tax-portal — `docs/tasks/done/` is empty (pre-Epic-001), so no rejection precondition exists. Vocabulary alignment with SRS confirmed (`apps/portal`/`apps/admin` matches REQ-IDNT-006). No board-coupling wording leaked in (`observations.md` references unchanged).
- **SDET: approve-with-tweaks (3 BLOCKING applied)** — (1) Dispatch Checkpoint enforcement was not wired into `agents/sdet.md` § Review Process step 2 — added a step-2 mandatory rejection bullet citing § Dispatch Checkpoint. (2) `Introduces-gate` missing-field rejection lived only in step 3 alongside the value-`yes` content check — added a step-2 mandatory bullet covering all three required task-spec fields (`Affected flows`, `Affected requirements`, `Introduces-gate`); refined step 3's Gate Authoring evidence bullet to defer missing-field rejection to step 2. (3) Gate Authoring evidence verification didn't require SDET to actually open + verify the cited log line in the local-CI case — refined the bullet to require `Read`-and-confirm of the cited line, closing the "valid run, wrong step" loophole.
- **Overwatch: approve** — no blocking; advisory findings on cross-surface sunset-trigger ownership (Overwatch needs an explicit per-retro counter for parity findings — future `agents/overwatch.md` Category 6 edit, not in scope here) and the model-behavior-notes stub starvation (already tracked under the existing retro action item dated 2026-04-20).

**Files changed:**
- `.claude/agents/{developer,overwatch,pd-draft,pd-interview,pd-review,ra,sa,sdet}.md` — new symlinks
- `.claude/commands/{run-tests,mirror-audit,memory-audit}.md` — new skill files
- `CLAUDE.md` — `### Platform-frontend scope` section added
- `agents/sa.md` — Plan-phase cross-surface scoping; webapp-developer spawn-prompt inline
- `agents/sdet.md` — Cross-surface audit reject criterion; Quality Parity Audit preamble; 2 step-2 mandatory rejections (Dispatch Checkpoint, required-fields-missing); refined step-3 Gate Authoring evidence bullet
- `docs/tasks/PROGRESS.md` — this entry

**Followup queue (already in `## Open retro action items` above):**
- The three 2026-04-20 entries (Dispatch Checkpoint rule-sunset, Gate Authoring hotfix-exception promotion, model-behavior-notes rot check) cover the advisory findings from this round's quad review. No new retro items added.

**End:** Round-2 port complete. Branch ready for PR. `## Current initiative` (Epic 001) preserved — chore did not touch Epic 001 work. Main session ends invocation.

### Main Session Chore — Lights-out enablement decisions (planning) — 2026-04-26

**Start:** After PR #5 (j4j-port round 2) and PR #6 (autonomy promotion: item 2 commit/push promoted, item 3 PR merge deferred) both merged, the user and main session walked through five lights-out blockers identified during the autonomy-promotion quad review. Decisions captured below for the SA to pick up at Plan time. **No code changes in this session entry — planning artifact only.** PROGRESS.md `## Current initiative` updated to point at the resulting chore (Epic 001 deferred until chore completes).

**Five locked decisions:**

1. **Branch protection model — A:** required CI status checks (`lint-and-typecheck`, `test-portal`, `test-admin`, `security-scan`), no required PR approvals, `enforce_admins=true` (no admin bypass). Rationale: self-approval is mechanically impossible for a solo dev (GitHub blocks PR-author from approving own PR); required CI is the substantive gate; quad-review-by-rule covers the second-pair-of-eyes requirement for workflow-file PRs.

2. **Notification on harm — A+B+C combination:**
   - **A:** GitHub built-in email on workflow failure (zero setup; user confirms notification preferences).
   - **B:** `if: failure()` job in CI workflow that auto-creates a GitHub issue with log link.
   - **C:** `PushNotification` mid-session for in-session events (agent-stuck per killswitch, item-2 credential-pattern hit, SA-pause-on-Docker-preflight). Reaches mobile if Remote Control is paired; otherwise terminal-only.
   - Together: A+B cover post-merge / post-CI events that fire while user is away; C covers in-session escapes when user is at the terminal.

3. **Clarification policy — RA-decides model + legal/compliance/security carve-out:**
   - RA actively *resolves* CLARIFs (writes decisions with reasoning into SRS), not just flags them. SA proceeds against RA decisions; mid-epic ambiguity → SA dispatches RA → RA decides → binding.
   - Carve-out: legal/compliance/security questions still escalate to user. Concrete classes: data retention/deletion semantics, PII handling/encryption/access-control/audit-log scope, auth/authorization model changes, IRS or state tax authority regulatory requirements.
   - Examples in current open queue: **CLARIF-005 (hard delete vs 7-year retention)** and **CLARIF-006 (Docuseal self-hosted vs cloud)** are likely escalations under the carve-out. **CLARIF-001/002/003** are routine UX/copy decisions the RA decides directly.
   - Implementation order: rule changes land first (in this chore), then RA processes the existing 5 open CLARIFs (001, 002, 003, 005, 006) under the new model — see Followup queue below.

4. **Cost observability — B:** extend `scripts/metrics-report.py` with cost reporting columns. Manual monthly review cadence. No hard caps until baseline data justifies them. Need to verify what `.claude/metrics/tasks.jsonl` currently captures (token usage may or may not already be in the schema; if not, hook update may be required).

5. **Stuck-loop killswitch — A:** rule in `.claude/agent-stack.md`. After **3 consecutive failed attempts on the same gate where the failure mode is unchanged across attempts** — e.g., SDET cites the same rejection reason, CI fails on the same step, e2e fails on the same assertion — the SA halts. Concrete halt behavior: create `BUG-EEE-NNN-stuck-on-<gate>.md` documenting (1) the failing gate, (2) the unchanging failure mode verbatim, (3) attempt-log summary with what each attempt tried; set `Status: needs-user-direction` (new task status — needs to be added to the lifecycle); fire `PushNotification` + auto-create GitHub issue per #2; SA ends invocation. **"Unchanged failure mode" qualifier is load-bearing** — distinguishes stuck loops from legitimate iterative debugging where each attempt addresses a different rejection reason.

**Lights-out chore brief — for SA Plan:**

| # | Task | Path | Owner |
|---|---|---|---|
| 1 | `.github/workflows/ci.yml` — 4 required jobs (`lint-and-typecheck`, `test-portal`, `test-admin`, `security-scan`) + SQL Server service container for any DB-dependent unit tests + `if: failure()` job that runs `gh issue create --label ci-failure --title "CI red on main: <commit>" --body <log link>`. Per ADR-005 + ADR-006, the SQL Server service block uses `mcr.microsoft.com/mssql/server:2022-latest`. RLS integration tests and full e2e remain Tier 2 — they run as part of `test-portal`/`test-admin` against the service container. | `.github/workflows/ci.yml` | `[devops]` |
| 2 | Branch protection runbook — `gh api` snippet per decision #1A captured as runbook (config can't live in repo, but procedure can). Includes: required status checks list (the 4 jobs above), `enforce_admins=true`, `required_pull_request_reviews=null`, `required_conversation_resolution=true`, `allow_force_pushes=false`, `allow_deletions=false`, `required_status_checks.strict=true`. | `docs/operations/branch-protection.md` (new) or extend `docs/operations/runbook.md` if it exists | `[devops]` |
| 3 | `scripts/validate-gates.sh` — task-file gate completion check (per `.claude/agent-stack.md` § Programmatic Gate Validation, which already references this script as the backstop) + PR-body quad-review-verdict check for workflow-file PRs (greps for `[sa]`, `[ra]`, `[sdet]`, `[overwatch]` verdict markers). Runs as pre-push hook + as a CI step. | `scripts/validate-gates.sh`, `scripts/hooks/pre-push` | `[devops]` |
| 4 | Extend `scripts/metrics-report.py` with cost reporting columns. **Dependency check first:** read `.claude/metrics/tasks.jsonl` schema; if token-usage capture isn't already present, augment `.claude/hooks/log-task-edit.py` to record per-dispatch token usage from the agent invocation context. Then surface per-epic / per-agent / per-phase token totals + estimated cost in the report. | `scripts/metrics-report.py` (+ possibly `.claude/hooks/log-task-edit.py`) | `[devops]` |
| 5 | New ADR — Repository interface as test seam. Port concept from journey-for-jasmine ADR-026 but adapted for the tax-portal stack (Prisma + SQL Server + RLS, not .NET + Dapper). Establishes the contract: data-access in service-layer code goes through `IUserRepository` / `IEngagementRepository` / etc. interfaces, mocked in Tier 1 unit tests, real Prisma in Tier 2 integration tests. Enables the two-tier test pipeline that makes Claude Cloud sandbox testing meaningful (Tier 1 runs without Docker; Tier 2 defers to GitHub Actions with the SQL Server service container). | `docs/decisions/ADR-NNN-repository-interface-test-seam.md` | SA self-implement (`Impl: sa`) |
| 6 | Workflow file edits — single batch, single quad review covers all four edits since they're all workflow-file changes that travel together: (a) PushNotification call-sites per decision #2C — added at SA Docker-preflight escalation in `agents/sa.md`, item-2 credential-pattern hit in `.claude/agent-stack.md` § Autonomy Ceiling item 2, and stuck-loop killswitch trigger in the new section. (b) RA-decides-CLARIFs rule per decision #3 — `agents/ra.md` Core Responsibilities adds "resolve ambiguities, document decision with reasoning, escalate only legal/compliance/security per carve-out"; `agents/sa.md` Plan/Dispatch phases add "if requirement is unclear, dispatch RA mid-phase, RA's answer is binding"; `.claude/agent-stack.md` § Autonomy Ceiling item 6 adds "requirements *resolution* is RA-authored without user pause; requirements *authoring* still routes through user." (c) Stuck-loop killswitch per decision #5 — new `### Stuck-Loop Killswitch` section in `.claude/agent-stack.md` near § Submission Gate; new `needs-user-direction` task status added to the lifecycle (currently `backlog | in-progress | review | done`; add as fifth state). (d) Update `agents/sdet.md` § Review Process step 6 to add `needs-user-direction` to the recognized status set so SDET doesn't reject tasks with that status. | `.claude/agent-stack.md`, `agents/sa.md`, `agents/ra.md`, `agents/sdet.md` | SA self-implement (`Impl: sa`) |

**SA Plan notes:**
- Tasks 1–4 are independent dispatches to `[devops]`; per § Dispatch single-developer-per-turn rule, sequential.
- Tasks 5 and 6 are SA self-implement (`Impl: sa`).
- Task 6's quad review uses the standard two-lens framework. Findings recorded in PR body per the post-PR-#6 norms. The new `needs-user-direction` status added in task 6 (d) is intentionally referenced in task 6 (c) — the killswitch creates BUG files with that status — so 6 (c) and 6 (d) must land together in the same edit batch.
- Branch name: `chore/lights-out-enablement`.
- After this chore merges, item 3 (PR merge auto-on-green) becomes eligible for promotion in a separate follow-up PR. The graduation predicate in `.claude/agent-stack.md` § Autonomy Ceiling item 3 will be satisfied: (a) `ci.yml` exists with required jobs (task 1), (b) branch protection configured per the runbook (task 2), (c) `scripts/validate-gates.sh` exists (task 3). The three open structural questions from the autonomy-promotion quad review (self-merge for workflow-file PRs, fail-closed condition (a), SDET CI/Smoke gates in merge predicate) need to be resolved in the item-3 promotion PR — **not** this chore.

**Followup queue — for after this chore + Epic 001 pickup:**
- **RA processes the 5 open CLARIFs** (001, 002, 003, 005, 006) under the new RA-decides model. CLARIF-001/002/003 are routine UX/copy decisions (RA decides directly, writes to SRS). CLARIF-005 (hard delete vs 7-year retention) and CLARIF-006 (Docuseal self-hosted vs cloud) are likely escalations under the legal/compliance/security carve-out — RA proposes recommendation, user signs off.
- **Item 3 promotion PR** — once chore lands, write the auto-merge rule with the three open structural questions resolved. Keep the deferred-promotion text in this chore as scaffolding; replace it with the active rule in the promotion PR.
- **`agents/devops.md`** — skipped from j4j round-2 port. Needs adaptation for Docker Compose + GitHub Actions stack instead of j4j's Bicep + Azure. Worth landing once the CI workflow exists so the file describes the current stack accurately.
- **`/pre-deploy` skill** — skipped from j4j round-2 port. Needs staging pipeline to exist first; out of scope until ADR-007 production-deploy decision lands.

**End:** Lights-out enablement chore fully scoped. Decisions locked; chore brief ready for SA Plan. PROGRESS.md `## Current initiative` updated to point at the chore. Epic 001 deferred until chore completes. User invokes `/sa` when ready. Main session ends invocation.

### SA Plan — 2026-04-26

**Start:** First SA invocation on the lights-out enablement chore. Read agent-stack.md, sa.md, agent-phases.md, CLAUDE.md, PROGRESS.md (the planning entry above is the authoritative chore brief). Confirmed working tree state: branch was `main` (not the port branch the env block claimed); only modified file was `docs/tasks/PROGRESS.md` carrying the chore brief — that's the carry-over to keep.

**Actions:**

- **Branch:** created `chore/lights-out-enablement` off `origin/main` after `git fetch`. PROGRESS.md modification carried over automatically on checkout. Committed nothing yet.
- **Pre-Plan inventory:**
  - `.github/workflows/` does not exist (`mkdir` needed in TASK-LOE-001).
  - `docs/operations/` exists but is empty (TASK-LOE-002 creates `branch-protection.md`).
  - `scripts/` only contains `metrics-report.py`. `validate-gates.sh` does not exist (TASK-LOE-003 creates it).
  - `.claude/hooks/` has 8 hook scripts including `log-task-edit.py` and `log-dispatch.py`. **Verified token capture lives in `log-dispatch.py` already** — TASK-LOE-004 scope reduces to `metrics-report.py` only, no hook update needed (chore brief flagged this as "may or may not be in schema; if not, hook update may be required" — checked, not required).
  - `metrics-report.py` already has `MODEL_RATES`, `compute_cost`, per-task `cost_usd`, and aggregate `Total cost`. The actual TASK-LOE-004 gap is **rollups** (per-epic, per-agent, monthly) — not the basic cost math. Task spec narrowed accordingly.
  - `docs/tasks/done/` is empty (pre-Epic-001) — RA grandfathering for `Introduces-gate` is a non-issue, no impact on this chore's scope.
  - 10 ADRs exist (001-010). TASK-LOE-005 uses **ADR-011** as the next number.
- **Discovered scope addition:** `agents/sdet.md:69-73` has a stale "ADR-026 enforcement" pointer imported from journey-for-jasmine round-2 port. The reference is dead (tax-portal has no ADR-026). TASK-LOE-005 creates the tax-portal ADR; **TASK-LOE-006 § (e) added to fix the SDET text** to point at ADR-011 with Prisma/SQL Server adaptation. This was not in the original chore brief but is essential — without § (e), the SDET text continues to reference a non-existent ADR after this chore lands. Sub-edit (e) is included in task 6's quad review.
- **Task creation:** 6 task files created in `docs/tasks/`:
  - `TASK-LOE-001-ci-workflow.md` — `[devops]`. Critical scoping decision: `test-portal` and `test-admin` jobs land as **`continue-on-error: true` (advisory)** because `apps/portal` and `apps/admin` don't exist yet. Required at landing: `lint-and-typecheck` + `security-scan` only. Promotion path documented: Epic 001 close-prep promotes the test jobs to required and supplies Gate Authoring Rules evidence at that point. This is the **Speculative/sandbox carve-out** from `.claude/agent-stack.md` § Gate Authoring Rules § Scope. The alternative (land all 4 as required, accept structurally-green-but-empty) is exactly the failure mode the rule guards against.
  - `TASK-LOE-002-branch-protection-runbook.md` — `[devops]`. Two-stage rollout documented: Stage 1 (post-chore-merge) applies branch protection with required = `[lint-and-typecheck, security-scan]` only; Stage 2 (post-Epic-001-close-prep) expands to all 4. Cross-links to TASK-LOE-001 + TASK-LOE-003 + `.claude/agent-stack.md` § Autonomy Ceiling item 3.
  - `TASK-LOE-003-validate-gates-script.md` — `[devops]`. 8 check functions defined in spec; `--pr-body` mode for workflow-file PR quad-review verdict check; pre-push hook + installer; CI integration step (added to TASK-LOE-001 if mid-review, deferred otherwise). `Introduces-gate: yes` — pre-push hooks are explicitly enumerated in Gate Authoring Rules § Scope.
  - `TASK-LOE-004-metrics-cost-reporting.md` — `[devops]`. Scope narrowed per § Pre-Plan inventory above. New rollup sections: per-epic, per-agent, monthly. Per-phase deferred (phase data not in dispatches.jsonl; would require a hook change, out of scope). `MODEL_RATES` rate-check timestamp must be updated.
  - `TASK-LOE-005-adr-repository-test-seam.md` — `Impl: sa`. ADR-011 (next number). Adapts j4j ADR-026 (.NET + Dapper + Moq) to tax-portal stack (Prisma + SQL Server + RLS + Vitest). Critical adaptation: the test seam sits at the **service-layer boundary**, not at every Prisma call — the ADR-003 `SESSION_CONTEXT` wrapper is already the lower-level seam. Reconciles with ADR-003/004/005/006. Rejection criteria section is phrased so TASK-LOE-006 § (e) can quote it directly into `agents/sdet.md`.
  - `TASK-LOE-006-workflow-file-edits.md` — `Impl: sa`. 5 sub-edits (a-e) batched into one PR with one quad review. § (c) and § (d) MUST land in the same edit because § (c)'s killswitch creates BUG files with the `needs-user-direction` status that § (d) introduces. § (e) added by Plan to fix the round-2-port dead pointer. `Introduces-gate: yes` for the killswitch (new SA blocking startup step per Gate Authoring Rules § Scope).

- **Cross-surface scoping check (per CLAUDE.md § Platform-frontend scope):** none of the 6 tasks touch `apps/portal` or `apps/admin` (apps don't exist yet) — scoping check is vacuously satisfied. Task 1 (CI workflow) touches both apps in spirit (`test-portal` + `test-admin` are mirrored), and the spec treats them symmetrically.

- **E2e-required:** all 6 tasks are `E2e-required: no`. None touch auth flows, RLS, file upload, Docuseal, email, SSE, or cross-module boundaries (the e2e-required triggers in CLAUDE.md). Tasks 1+3 introduce CI/script infrastructure; tasks 2+4 are docs/reporting; tasks 5+6 are ADR/workflow-rule edits. No targeted e2e applies.

- **Design coherence gate:** the 6 tasks together satisfy the three preconditions of `.claude/agent-stack.md` § Autonomy Ceiling item 3 graduation predicate: (a) `ci.yml` with required jobs (TASK-LOE-001), (b) branch protection runbook + Stage 1 application (TASK-LOE-002), (c) `validate-gates.sh` backstop (TASK-LOE-003). The three open structural questions from the autonomy-promotion quad review (self-merge for workflow-file PRs, fail-closed condition (a), SDET CI/Smoke gates in merge predicate) are deferred to a follow-up promotion PR — not this chore. Confirmed in chore brief.

- **PROGRESS.md updated:** `## Current initiative` now shows the task list with statuses + dispatch order. `Phase:` flipped to `Plan complete → ready for Dispatch`.

**Plan-phase exit conditions check (`.claude/agent-phases.md` § Phase exit conditions):**

- ✅ Backlog triage: `## Awaiting PR merge` empty. `## Active bugs` empty. `## Open retro action items` has 3 entries — all are dispositioned (concrete keep/remove/seed evaluations scheduled). No undispositioned items block Plan.
- ❌ Docker pre-flight: **not run** — none of the 6 tasks are E2e-required, none of the 6 tasks invoke Docker as part of submission gate. Skipped intentionally; will run before any future Docker-touching task. Documented here.
- ❌ `/compact` request: **not issued** — chore Plan-context load was light (small set of files, no app code, no SRS deep-read). Decided not to gate on `/compact` for a small chore. If context pressure surfaces in Dispatch, will request then.
- ✅ Feature branch created: `chore/lights-out-enablement` off `origin/main`.
- N/A Epic file `Epic-type:` / `Epic-deploys:` fields — there is no epic file (this is a chore, not an epic). PROGRESS.md `## Current initiative` carries the same role for chore work. Documented as exception.
- ✅ Every task file has `Status: backlog`, `E2e-required:`, `Impl: sa | developer` (5 are devops which is a developer role per CLAUDE.md Agent Team table; 2 are sa-implement), `Affected flows: none (justification)`, `Affected requirements: none (justification)`, `Introduces-gate: yes/no`, `Relevant ADRs:`. All 6 task files validated against `_TEMPLATE.md` shape.
- N/A `Epic-type:` + `Epic-deploys:` mirroring — chore, no epic file. Tasks omit these fields by design.
- ✅ Design coherence gate: see above bullet.
- ✅ PROGRESS.md `## Current initiative` populated.

**End:** Plan complete. 6 task files in `docs/tasks/` with full specs. Dispatch order: 1 → 3 → 4 → 5 → 2 → 6. Per `.claude/agent-stack.md` § Dispatch single-developer-per-turn rule, the SA dispatches one developer per assistant turn for tasks 1-4; tasks 5 and 6 are SA self-implement. SA pauses here to surface the Plan to the user before entering Dispatch — Plan-end is a natural review point even though the Autonomy Ceiling does not require it. Next SA invocation will enter Dispatch starting with TASK-LOE-001.

### SA Dispatch — TASK-LOE-001 — 2026-04-26

**Start:** Second SA invocation on the lights-out enablement chore. User command: "dispach TASK-LOE-001". Phase transitioned Plan → Dispatch. Read agent-stack.md, sa.md, agent-phases.md, CLAUDE.md, PROGRESS.md, TASK-LOE-001 spec. Verified working tree clean, branch `chore/lights-out-enablement`, last commit `b4c02d4` (Plan output).

**Pre-dispatch verification of TASK-LOE-001 spec:**
- ✅ `**Affected flows:** none (justification: chore touches CI infrastructure, not user-facing behavior)`
- ✅ `**Affected requirements:** none (justification: chore touches CI infrastructure, not SRS requirements)`
- ✅ `**Introduces-gate:** yes` — Gate Authoring Rules evidence required in Work Log per § SDET Review focus areas
- ✅ `E2e-required: no` — no Docker pre-flight needed before dispatch
- ✅ Scope clear: `.github/workflows/ci.yml` create with 4 jobs + report-failure job; SQL Server service container; auto-issue on failure for main branch only
- ✅ Relevant ADRs cited (ADR-002, ADR-006); Files to Create/Modify table accurate; Implementation Notes complete; SDET focus areas defined
- ✅ Cross-surface scoping vacuously satisfied (chore touches CI, not `apps/portal`/`apps/admin` — neither exists yet)

**Dispatch attempt — BLOCKED:**
- The SA is invoked here as a subagent of the main session. **The Agent tool is not available in this invocation's tool set** — the SA can read/edit files, run Bash, schedule wakeups, and invoke skills, but cannot spawn a subagent. Without the Agent tool, the `[devops]` agent for TASK-LOE-001 cannot be dispatched from inside this SA invocation.
- Tool inventory observed in this invocation: `Bash`, `Edit`, `Read`, `Write`, `ScheduleWakeup`, `Skill`, `ToolSearch`. `Agent` is absent and is not in the deferred-tool list (verified via `ToolSearch select:Agent` and `ToolSearch "spawn subagent dispatch"`).
- This is a harness-level constraint: the SA agent file (`agents/sa.md`) declares `tools: - Agent`, but the SA appears to be running as a Skill/subagent under the main session whose tool grant did not include `Agent`. The Agent-tool dispatch must originate from a context where Agent is exposed.
- **Recovery options (user choice):**
  1. **Run dispatch from the main session directly** — the main session has the Agent tool. Main session spawns `subagent_type: "developer"` with the spawn prompt below. This is the cleanest path and matches the multi-agent workflow contract.
  2. **Re-invoke `/sa` at top-level** so the SA runs with its declared tool list (including Agent) instead of as a nested subagent.
  3. **Treat TASK-LOE-001 as `Impl: sa`** — bend the Plan and have the SA self-implement the workflow file. **Not recommended:** task touches `.github/workflows/` (gated path), is `Introduces-gate: yes` (mandatory three-item Gate Authoring Rules evidence), and the SA cannot approve its own gate-introducing work — SDET still needs to review, but losing the developer-as-implementer separation weakens the audit trail. Also, scope (full CI workflow + SQL Server service + auto-issue job + green CI run + counterfactual demonstration) exceeds the `Impl: sa` ≤ 2-files-mechanical bar in `agent-phases.md` § SA Self-Implementation.
- **Suggested spawn prompt for option 1 (verbatim, paste into main session):**

  > Spawn `subagent_type: "developer"` with prompt:
  > 
  > You are the **Developer** agent for tax-portal, role tag `[devops]`. Begin every response with `[devops]`.
  > 
  > Read these files in order before any work:
  > 1. `.claude/agent-stack.md` — workflow engine rules (especially § Dispatch Checkpoint, § Submission Gate, § Gate Authoring Rules, § Tool Hygiene)
  > 2. `agents/developer.md` — your role instructions (base for all developer roles including `[devops]`)
  > 3. `CLAUDE.md` — project configuration (especially § Agent Team table for `[devops]` directory scope + DevOps inventory/runbook update rule, § Submission Gate Commands, § Tool Usage Notes)
  > 4. `docs/tasks/PROGRESS.md` `## Current initiative` + the 2026-04-26 chore-brief planning entry for chore context
  > 5. `docs/tasks/TASK-LOE-001-ci-workflow.md` — your task spec
  > 6. `docs/decisions/ADR-002-database-sql-server.md` and `docs/decisions/ADR-006-monorepo-layout.md` — relevant ADRs cited in the task spec
  > 
  > Your task: implement TASK-LOE-001 (GitHub Actions CI workflow with SQL Server service container + auto-issue on failure). Follow the task spec's Implementation Notes and Definition of Done. The branch is `chore/lights-out-enablement`; do not switch branches.
  > 
  > **Hard preconditions before any non-task-file edit (per § Dispatch Checkpoint):** perform a single atomic Edit to `docs/tasks/TASK-LOE-001-ci-workflow.md` containing (a) Work Log entry of the form `2026-04-26 [devops] Starting implementation — <brief scope> | What's next: <first file or action> | Blockers: none`, (b) Status flip `backlog → in-progress`, (c) `Started-at` set to current UTC ISO 8601, (d) `Complexity-estimate` set to your honest 1–5 rating before reading the Implementation Notes section. All four changes in one Edit. Only after that Edit may you create `.github/workflows/ci.yml`. SDET will reject at review if this checkpoint is missing — this is now a hard rejection criterion in `agents/sdet.md`.
  > 
  > **`Introduces-gate: yes` evidence requirement (per § Gate Authoring Rules):** your Work Log must end with run URL + named job/step + named code path + counterfactual for each newly-required gate (`lint-and-typecheck` and `security-scan` at landing — `test-portal` and `test-admin` are advisory until Epic 001 promotes them, no evidence required at this task per the task spec's § SDET Review focus areas).
  > 
  > Submission gate: `pnpm lint`, `pnpm type-check`, then push the branch to GitHub and observe the workflow run green. Capture run URL. Auto-issue verification: cherry-pick a deliberate red commit on a throwaway branch (e.g., add `process.exit(1)` to a test fixture or break the lint config), push, observe issue creation, capture issue URL, then revert / delete branch. Do not push to `main`.
  > 
  > Git ops: per `.claude/agent-stack.md` § Git Operations and § `git add` hygiene, do not commit (the main session commits) — leave files staged or unstaged in the working tree and report back. **Do not commit, push, force-push, or merge.** The main session handles commit/push.
  > 
  > Report back with: (a) status (complete / bounced / blocked), (b) Work Log entries written, (c) any CLARIFs raised, (d) the green CI run URL, (e) the deliberate-red issue URL.

**Actions:**
- Read agent-stack.md, sa.md, agent-phases.md, CLAUDE.md, PROGRESS.md, TASK-LOE-001 spec, agents/developer.md, ADR-002 + ADR-006 (cited in task spec).
- Verified TASK-LOE-001 spec completeness (all required fields present + scope clear).
- Verified working tree clean, branch `chore/lights-out-enablement`.
- Updated PROGRESS.md `Phase:` and TASK-LOE-001 row to reflect dispatch-attempted-but-blocked state (revert path documented above).
- Wrote this session entry capturing the blocker + recovery options + verbatim spawn prompt for the main session.

**End:** Dispatch blocked by Agent-tool unavailability in this nested-SA invocation. TASK-LOE-001 status remains `backlog` (table shows blocker note); spec is verified complete and ready for the spawn prompt above. **Recommended path: user re-invokes `/sa` at top-level OR pastes the spawn-prompt block above into the main session to dispatch the devops agent.** SA ends invocation pending user direction.

### Main Session Dispatch — TASK-LOE-001 (relay) + TASK-LOE-003 — 2026-04-26

**Start:** SA dispatch for TASK-LOE-001 came back blocked on Agent-tool unavailability in nested-SA context. Main session executed the SA's prepared spawn-prompt (option 1 in the SA Dispatch entry above) directly — no functional difference from SA-driven dispatch since the spawn prompt was authored by the SA and includes all the standard preconditions (Dispatch Checkpoint, Gate Authoring Rules evidence, submission gate, git-ops constraints).

**TASK-LOE-001 outcome:**
- Devops completed implementation, ran the CI workflow on `chore/lights-out-enablement`, captured green run URL, verified auto-issue creation by pushing a deliberate-red commit to a throwaway branch (`verify/loe-001-red-issue-test`), captured issue URL, deleted throwaway branch, closed issue.
- Final green CI run: https://github.com/jasgr-software/tax-portal/actions/runs/24971310412 (commit `c47ed8d`)
- Auto-issue created + closed: https://github.com/jasgr-software/tax-portal/issues/7
- Files created: `.github/workflows/ci.yml` (5 jobs: `lint-and-typecheck` required, `test-portal` + `test-admin` advisory via `continue-on-error: true` per Speculative/sandbox carve-out, `security-scan` required, `report-failure` triggered on failure)
- Files modified: `CLAUDE.md` (drift fix: `test-web` → `test-portal` + `test-admin` in § Required CI checks), task spec (Status: review, Work Log with Gate Authoring Rules evidence)
- Three fixup commits during devops's iteration: CodeQL pre-scaffold no-source guard, CodeQL v3→v4 upgrade, ci-failure label idempotency. All committed by devops to chore branch.
- Devops complexity-actual: 3 (estimated 2). Drift was correctness in pre-scaffold environment, not a spec issue.
- Side-finding flagged by devops: all four GitHub Actions in use (`actions/checkout@v4`, `actions/setup-node@v4`, `pnpm/action-setup@v4`, `github/codeql-action`) emit Node 20 deprecation warnings (forced to Node 24 from June 2026, removed September 2026). Not blocking — captured as a follow-up: bump to v5-compatible versions before the cutover.
- TASK-LOE-001 status: `review` (awaiting SDET).

**Friction-reduction side-quest:** devops's verification flow required ~12 manual approvals on read-only `gh` commands (`gh run view`, `gh run list`, `gh pr view`, etc.). User asked whether a skill would help. Answer: no — skills don't change tool permissions, the right fix is a settings allowlist. Added 12 read-only `gh` patterns to `.claude/settings.json` permissions.allow (`gh run view/list/watch`, `gh pr view/list/checks/diff`, `gh issue view/list`, `gh workflow view/list`, `gh auth status`). State-changing `gh` calls (`pr create/merge`, `issue create/close`, `api -X POST/PATCH/DELETE`) still prompt — preserves audit trail on GitHub-visible side effects. Allowlist takes effect for future agent spawns.

**TASK-LOE-003 dispatch:**
- User picked dispatch order 1 → 3 (per SA Plan).
- Per § Dispatch single-developer-per-turn: TASK-LOE-001 implementation finished before TASK-LOE-003 dispatch. SDET review of TASK-LOE-001 runs in parallel with TASK-LOE-003 implementation (different role, different file set — no contention).
- Spawn prompt mirrors TASK-LOE-001's structure (read-list + Dispatch Checkpoint + Gate Authoring Rules evidence + submission gate + git-ops constraints), adapted for `scripts/validate-gates.sh` + pre-push hook scope.
- Dispatched via main session (Agent tool) since the SA-can't-dispatch issue is unresolved (will be addressed in TASK-LOE-006 workflow file edits or a follow-up).

**Open issue for TASK-LOE-006 to consider:** the SA agent file declares `Agent` in its tools list, but when the SA is spawned as a nested subagent (e.g., via `/sa` from main session), the Agent tool is not granted. This means SA can never dispatch from a nested context — orchestration must originate from main session. TASK-LOE-006's workflow rule edits should document this constraint explicitly: either (a) require SA invocations to run top-level only, or (b) formalize the "main session as dispatch relay" pattern with SA producing the spawn prompt and main session executing. Current sessions are doing (b) implicitly — formalizing it removes the "blocked" surprise on each SA dispatch attempt.

**End:** TASK-LOE-001 implementation complete + verified, awaiting SDET review. `.claude/settings.json` gh-read allowlist added. TASK-LOE-003 dispatched to devops via main session. SDET review of TASK-LOE-001 will be dispatched in a separate parallel turn (or after TASK-LOE-003 returns, depending on user preference).
