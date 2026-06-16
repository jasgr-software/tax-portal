# Progress

> Single source of truth for current slice state, quality gates, active bugs, and retro action items. The IO
> and SDET update this file at the start and end of every invocation. Structure contract: see
> `.implementation/ENGINE.md` § PROGRESS.md structure contract.
>
> **Note (2026-06-14):** the implementation team was refactored into the standalone `.implementation/` layer
> (engine: `ENGINE.md` / `PHASES.md`; orchestrator: `AGENT.md` = the Implementation Orchestrator, `[io]`).
> The team consumes a self-contained build brief.

## Current initiative

**BRIEF-002 — Accountant manages the services catalog (admin CRUD + accountant-only write boundary)**
- **Branch:** `brief-002-services-catalog-management` (created from `main` this invocation)
- **Brief-type:** feature · **Brief-deploys:** no
- **Goal:** Deliver the *write* side behind EPIC-001's public read catalog — the signed-in accountant adds /
  edits / deactivates services from `apps/admin`, persisted under her authenticated identity (ADR-003) and
  authorized at the Service security-policy trust boundary (ADR-005). **Primary risk:** close EPIC-001's latent
  write-predicate gap (CLIENT currently passes the BLOCK predicate) — AC-DOOR-002-05.
- **Phase:** **Dispatch in progress** (TASK-002-001 implemented → `review`; SDET review dispatched). Env blocker that surfaced during -001 implementation is **RESOLVED** by the main session (see env note below).
- **Gated:** yes (touches `apps/admin`, `packages/db`, `db/policies/`)
- **Methodology:** gherkin acceptance format (7 scenarios → `.feature` mirror) · e2e required (apps/admin,
  mocked auth provider) · tier-3 obligations on the write boundary + persistence · container smoke before
  Validate · AC-id test-tag contract for COVERAGE write-back.

**Tasks (5):**
| Task | Status | Impl | E2e | AC | Notes |
| ---- | ------ | ---- | --- | -- | ----- |
| TASK-002-001 service-write-boundary-policy | **review** | developer | no | AC-DOOR-002-05 | **Primary risk.** Separate write predicate (`fn_service_write_access`, no CLIENT) + tier-3 RLS test. `Introduces-gate: yes`. Dependency root. **service.rls 10/10 PASS; db suite 35/35; lint/type-check/build clean.** Complexity-actual 3. → SDET review. |
| TASK-002-002 service-write-repository-and-actions | backlog | developer | no | -01/-02/-03 + -05 runtime | Write repo + server actions through the request wrapper; tier-3 persistence. Depends on -001. |
| TASK-002-003 admin-catalog-management-ui | backlog | developer | no | AC-DASH-010-01/-02/-03 | Admin list/add/edit/deactivate behind the role gate. Depends on -002. |
| TASK-002-004 admin-e2e-catalog-journeys-and-cross-surface | backlog | developer | **yes** | 6 journeys + -05 UI surface + cross-loop | 7 gherkin → specs + `.feature`; deactivate→public-door loop (evidence for -03, NOT -04). Depends on -003. |
| TASK-002-005 demo-walkthrough-spec | backlog | developer | yes | none (non-gating demo) | @demo gallery → `docs/demos/EPIC-002/`. Depends on -004. |

**Env note (RESOLVED 2026-06-16, main session):** the EPIC-004-carried local-DB blocker is cleared. `tax_portal` DB fully bootstrapped — schema synced via `prisma db push` (sidesteps the `migrate deploy` P3019 block), all principals incl. `taxportal_user` created, all `sec` policies applied incl. the new `fn_service_write_access`. `.env.local` carries correct DB URLs. **Tier-3 RLS tests now run locally against the real SQL Server container; subsequent DB/e2e gates (TASK-002-002 persistence, TASK-002-004 e2e) can run locally.** **E2e host-port:** admin container maps **host 13001→3001** — host-run admin Playwright needs `ADMIN_BASE_URL=http://localhost:13001` (flag in the TASK-002-004 dispatch).

**AC → task map (7 ACs, all traced):** AC-DOOR-002-01/-02/-03 → -002 (persist) + -004 (e2e); AC-DASH-010-01/-02/-03 → -003 (UI) + -004 (e2e); AC-DOOR-002-05 → -001 (trust boundary, tier-3) + -002 (runtime) + -004 (UI surface). AC-DOOR-002-04 is **out of scope** (owned by EPIC-001; verified only as a loop).

**Design-coherence check:** PASS (recorded in the Plan session entry below). No upstream/architectural question raised — the write-predicate split realizes ADR-005's existing mandate, not a new architectural choice.

## Awaiting PR merge

_None._ BRIEF-004 finalized + delivered (PR #38 @ `0444551`, gate 8 green). BRIEF-002 now active in Plan→Dispatch.

## Active bugs

_None active._ BUG-001-001/-002/-003 all `closed`; **BUG-004-001 (orphan root `middleware.ts`) RESOLVED**
(IO fix-forward; archived to `tasks/done/` at Close-prep). No active `BUG-004-POST-*`.

## Open retro action items

> The TASK-004-007 item below is now **resolved this slice** (the `$extends` regression test landed). The
> remaining items carry forward as observations. Three new carried follow-ups recorded in `HANDOFF-004.md`.

- **[RESOLVED — TASK-004-007, this slice] `client.ts` `$extends` SESSION_CONTEXT propagation untested** — the
  regression test (`packages/db/src/session-context.propagation.test.ts`, 4 live-container tests) now proves
  identity+role are set before the first real query on the authenticated accountant path. Closes the carried
  EPIC-001 retro item.
- **[CI — carried, now actionable] `test-portal` job lacks a `packages/**` build step** — graduate
  `test-portal` to required only after adding `pnpm -r --filter './packages/**' build --if-present` (HANDOFF-004
  follow-up #3; the `@tax-portal/ui` failures pre-date EPIC-004, run `27568768517`; EPIC-004 extends the pattern
  to `@tax-portal/auth`). Tests pass locally (`pnpm -r test` 158/158).
- **[infra — carried] Local DB-bootstrap + `migrate deploy` P3019** — clean-volume bootstrap, Prisma `;port=` /
  `!`-password parsing, P3019 `mssql`-vs-`sqlserver`; why local Smoke is env-blocked (HANDOFF-004 follow-up #2).
- **[gated-path candidate — carried] ESLint import boundary covers only `requestDb`, not `adminDb`** — consider
  extending `packages/eslint-config` to also restrict `adminDb` imports outside sanctioned admin paths.
  (Observation; moved with the deferred Clerk-binding scope to the 2FA-enablement slice.)
- **[env — carried] `.env.example` RATE_LIMIT vars** (`RATE_LIMIT_MAX_ATTEMPTS=10`, `RATE_LIMIT_WINDOW_MS=60000`)
  — permission-walled from agents AND main session; **user applies** (HANDOFF-004 follow-up #5).
- **[demo — carried] EPIC-001 engagement-demo `localhost:1433` flake** — pre-existing, transient/timing
  (HANDOFF-004 follow-up #6).

---

### IO Dispatch (Review of TASK-002-001) — BRIEF-002 — 2026-06-16
**Start:** Re-invoked mid-Dispatch with the TASK-002-001 result inline. Developer completed the dependency-root task: `sec.fn_service_write_access` added + wired to the 4 BLOCK predicates (FILTER unchanged), tier-3 `service.rls.test.ts` created. Final gate **service.rls 10/10 PASS**, full `@tax-portal/db` suite **35/35 PASS**, lint/type-check/build clean; AC-DOOR-002-05 verified; `Introduces-gate: yes` 3-item evidence in Work Log. Status `review`, Complexity-actual 3. Env blocker that surfaced during -001 was RESOLVED by the main session (DB bootstrapped via `prisma db push`; `taxportal_user` + all `sec` policies applied; `.env.local` correct).
**Phase-transition reflex (Plan→Dispatch, then mid-Dispatch resume):** swept the IO Plan session entry to `PROGRESS-ARCHIVE.md` under a "Swept at Dispatch→Review (TASK-002-001)" marker; updated `## Current initiative` Phase + TASK-002-001 status (`backlog`→`review`) + added the env-resolution note and the e2e host-port (13001) note; appended this entry.
**Actions:**
- **IO pre-review read of TASK-002-001 + Work Log.** Confirmed task-file/brief consistency: status `review`, `Complexity-actual: 3` (in range), Work Log carries a pre-implementation "Starting implementation" entry (Dispatch Checkpoint satisfied), the 3 Gate-Authoring evidence items (run marker w/ step name + 10/10 + 35/35 blocks; named code path = `fn_service_write_access` + the 4 BLOCK predicates; counterfactual = adding a CLIENT branch reds tests 4–6+8), and the documented detection-helper fix (case-sensitive `"BLOCK"` → `"block predicate"` lowercase; assertions NOT weakened; policy SQL unchanged). All dev-owned Quality Gate boxes ticked; `SDET Review` box open (correct).
- **Commit-cadence judgement:** holding the branch commit until SDET approval flips -001 to `done`. Rationale: pre-review code may need amending on rejection; committing the approved checkpoint avoids branch churn. Will recommend the main-session commit (to `brief-002-services-catalog-management`, never `main`, named files only) at that point.
- **Composed the SDET review dispatch** for TASK-002-001 (one dispatch this turn): per-policy integration-test HARD requirement (ADR-005 §6 / CLAUDE.md § SDET), accountant-only write boundary, gate-authoring 3-item evidence verification, latent-gap-actually-closed check, idempotency, and the atomic close-edit contract (tick box / prose / `Completed-at` / `Complexity-actual` in-range / status flip in one Edit).
**End:** Dispatch in progress — TASK-002-001 at `review`, SDET review dispatched. On SDET approval (→`done`): recommend main-session commit of -001 to the feature branch, then dispatch TASK-002-002 (write repo + server actions; tier-3 persistence; depends on -001). On rejection: route the reject reason back to the developer (watch the Stuck-Loop counter). Next dispatch returned in the `## Next Dispatch` block below.

---

### SDET Review — TASK-002-001 — BRIEF-002 — 2026-06-16
**Start:** SDET review of TASK-002-001 (service write-boundary policy + tier-3 RLS test). Task status `review`, `Complexity-actual: 3`. Env blocker previously RESOLVED by main session (DB bootstrapped, all principals and policies applied).
**Actions:**
- Read ENGINE.md, sdet.md, PROGRESS.md, TASK-002-001, `db/policies/0002-service-readable.sql`, `packages/db/src/service.rls.test.ts`, ADR-005, ADR-003, ADR-012 (all upstream refs cited by the task).
- Docker pre-flight: `tax-portal-sqlserver` container healthy on port 14330.
- Independently re-executed `pnpm --filter @tax-portal/db test -- src/service.rls.test.ts` → **10/10 PASS** (165ms). Confirms Work Log output.
- Independently re-executed full `pnpm --filter @tax-portal/db test` → **35/35 PASS** (6 files, 1.22s). No regressions.
- Independently re-executed `pnpm lint` → PASS (zero errors). `pnpm type-check` → PASS (zero errors).
- Verified all mandatory rejection checks: Dispatch Checkpoint present; `Started-at`/`Complexity-estimate`/`Complexity-actual` all set and in-range; all required spec fields present; no tool-hygiene violations; all dev-owned Quality Gate boxes ticked.
- Verified per-policy integration test per ADR-005 §6: positive (ACCOUNTANT INSERT/UPDATE/DELETE), negative (CLIENT INSERT/UPDATE/DELETE rejected at DB boundary, null SESSION_CONTEXT rejected), regression guard (CLIENT SELECT unchanged).
- Verified latent gap is actually closed: `fn_service_write_access` has no CLIENT branch; all 4 BLOCK predicates reference it; FILTER still references `fn_service_access` (CLIENT allowed).
- Verified 3-item Gate Authoring Evidence: run marker w/ step name ✓, named code path ✓, counterfactual ✓.
- Verified detection-helper fix: double-assertion pattern intact (`caughtError.not.toBeNull()` first); policy SQL unchanged.
- Verified idempotency (`CREATE OR ALTER FUNCTION`, `DROP IF EXISTS + CREATE SECURITY POLICY`, GO-batch split).
- Verified upstream ref compliance (ADR-005/ADR-003/ADR-012).
- Performed atomic close edit: ticked SDET Review Quality Gate box, wrote `## SDET Review` prose section, appended approval Work Log breadcrumb, set `Completed-at: 2026-06-16T07:51:00Z`, flipped `Status: review → done`.
**End:** TASK-002-001 **approved and marked `done`**. All 10 review focus items pass. Gate is live: `sec.fn_service_write_access` + 4 BLOCK predicates proven at the DB trust boundary; 35/35 regression suite clean. Ready for IO to: (1) recommend main-session commit of -001 to `brief-002-services-catalog-management`; (2) dispatch TASK-002-002 (write repo + server actions; depends on -001).
