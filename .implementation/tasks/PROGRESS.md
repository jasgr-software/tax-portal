# Progress

> Single source of truth for current slice state, quality gates, active bugs, and retro action items. The IO
> and SDET update this file at the start and end of every invocation. Structure contract: see
> `.implementation/ENGINE.md` § PROGRESS.md structure contract.
>
> **Note (2026-06-14):** the implementation team was refactored into the standalone `.implementation/` layer
> (engine: `ENGINE.md` / `PHASES.md`; orchestrator: `AGENT.md` = the Implementation Orchestrator, `[io]`).
> The team consumes a self-contained build brief.

## Current initiative

_None active._ BRIEF-004 (EPIC-004) **DELIVERED** 2026-06-16 — PR #38 squash-merged to `main` @ `0444551`;
Close-finalize complete (gate 8 post-merge CI green). Slice ledger swept to `PROGRESS-ARCHIVE.md`. The next
ready Phase-1 slices are EPIC-002 and EPIC-003 (both unblocked now that EPIC-004 is delivered) — re-invoke
`/orchestrate` to select.

## Awaiting PR merge

_None._ BRIEF-004 finalized + delivered (see `## Current initiative`).

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

### IO Close-prep — BRIEF-004 — 2026-06-16
**Start:** Re-invoked with the SDET Validate result inline — all three gates PASS (gate 6 acceptance 11/11; gate 7 CI required-green on `967b88c` with `test-portal` adjudicated as a non-regression CI-job design gap; quality audit 0 blocking). Smoke (gate 5) = `env-blocked (user-accepted CI substitution)`. Ran Close-prep.
**Phase-transition reflex (Validate → Close-prep):** swept the IO Smoke-disposition + SDET Validate session entries to `PROGRESS-ARCHIVE.md` under a "Swept at Validate→Close-prep transition" marker; emptied `## Current initiative`; moved the slice to `## Awaiting PR merge` with the PR #38 URL + 9-gate scorecard; appended this entry.
**Actions:**
- **Consistency / Task-Metadata completeness gate — PASS.** Re-confirmed all 9 `done` tasks carry the four lifecycle fields (`Started-at`, `Complexity-estimate`, `Complexity-actual` 1–5, `Completed-at`); the 5× `Updated-by` + TASK-011 timestamp corrections from Audit-disposition are present. BUG-004-001 `Status: resolved`. No empty/out-of-range metadata.
- **Archived** the 9 BRIEF-004 task files + BUG-004-001 to `tasks/done/` (via `git mv`). TASK-004-003 was trimmed → no-op re-plan node (folded into -002 + deferred; no task file existed to archive — disposition recorded in HANDOFF-004 + RETRO-004). HANDOFF-004 + RETRO-004 kept in `tasks/`.
- **Wrote `HANDOFF-004.md`** — 11 AC satisfied; reproduced the AC→test-tag→tier→owning-task→evidence table (Conductor COVERAGE write-back source); listed deferred AC (AUTH-004-01/-02/-03, AUTH-005-01 → 2FA-enablement slice) + 6 carried follow-ups.
- **Wrote `RETRO-004.md`** — 9-gate scorecard (gate 5 env-blocked / user-accepted CI substitution, condition (d) explicitly substituted; gate 7 required-green, `test-portal` advisory non-regression); classified findings (BUG-004-001 = real in-slice fix-forward, `acknowledged`; `test-portal` CI-job gap = `acknowledged`; git-ops `git add -A` boundary violation by the TASK-004-002 dev = process observation/discipline note); rule-sunset sweep (cross-surface-parity rule relied upon → keep, counter does not advance).
- **Recorded the Conductor Validate hand-off evidence string** (green required-CI run `27586299720` / `967b88c`; AC table location).
**End:** Close-prep exit condition met (RETRO + HANDOFF written; task/bug files archived; slice in `## Awaiting PR merge` with PR #38 URL + scorecard). **IO ends the invocation.** Next: the main session (Conductor) runs the `/pr-review` panel (application-code lane per MERGE-POLICY) → `/pr-fix` if needed → resolve threads → merge on green required CI (no protection toggle), then re-invokes the IO for Close-finalize (gate 8 post-merge CI; gate 9 N/A). The docs-lane demo-gallery PR merges separately on green required CI. **IO does not merge.**
