# Conductor State — run ledger

> **Single source of truth for a Conductor run.** The Conductor reads this first on every `/orchestrate` and
> updates it at every phase transition. A fresh run with a mid-flight `## Current run` **resumes** at the
> recorded phase rather than re-selecting. See `ENGINE.md` § State-ledger contract.
>
> **Bounded-ledger rule (Increment 2 — NORTH-STAR conclusion #7).** This file holds **bounded hot-state only**:
> the active run in full, plus one line per prior run under `## Recent outcomes`. A run's full narrative is **not**
> retained here on close — it is durable in git history, the merged PR, `.planning/ROADMAP.md` + `COVERAGE.md`,
> and the per-epic `RETRO-NNN` / `HANDOFF-NNN` artifacts under `.implementation/tasks/`. Collapsing a closed run
> to a one-line pointer is **de-duplication, not loss** (`git log -p .orchestration/STATE.md` recovers any prior
> prose). A prose-accreting ledger is conclusion #7 failing — the engine hoarding conclusions instead of trusting
> sources. See `AGENT.md` § Bounded-ledger rule + § Phase-boundary cold-start.

## Current run

- **No active run.** Last completed: **EPIC-011** ✅ DELIVERED 2026-06-23 (PR #89 → `9445e36`) — see `## Recent outcomes`.
- **A 2026-06-23 `/orchestrate EPIC-012` attempt halted at Compose** on a sequencer-validator defect (now **fixed** — see below); the machine block has been `--reset` and EPIC-012 is ready for a fresh run.
- **Next ready slice:** **EPIC-012** (engagement creation paths & multi-participant, 20 AC; `depends_on` EPIC-010 ✅ / EPIC-002 ✅ / EPIC-003 ✅ — all satisfied; readiness + engine-clear + AC-testability all passed on the halted attempt). Re-invoke `/orchestrate EPIC-012` — Compose will now correctly yield to author the real brief. The FILE chain EPIC-013 → 014 → 015 follows; Phase 3 is not yet closed (EPIC-012..015 remain `planned`).

### Resolved blocker — sequencer Compose-validator glob collision (fixed this PR)

The deterministic sequencer's Compose validator `v_brief()` globbed `BRIEF-*${epic#EPIC-}*.md` → for EPIC-012
that was `BRIEF-*012*.md`, which **matched the unrelated, already-delivered `BRIEF-LOE-012-state-store.md`**
(scripted-bookkeeping Phase 2 engine tooling — merged PRs #79/#80/#81) and falsely satisfied the Compose gate,
auto-advancing toward `implement` with the wrong brief. It was **systemic** — EPIC-013 would next collide with
`BRIEF-LOE-013-removal-sweep-gate.md`. **Fix:** anchored the glob to the epic-brief naming convention
`BRIEF-<NNN>-*.md` (`BRIEF-${epic#EPIC-}-*.md`) so the epic number must immediately follow `BRIEF-`, excluding
any `BRIEF-LOE-NNN-*` infix brief. All 42 `sequence.test.sh` cases pass. Shipped via the docs-lane.

## Pending closeout follow-ups

> Non-blocking; do not gate the next slice. Tracked here so they are not lost when the run collapsed.

- **[Phase-2 walkthrough video — DEFERRED, needs two follow-ups]** The Phase-2 closeout video
  (`DEMO-POLICY.md` § Part B; `docs/demos/phase-2/`) was **not produced** this run. Blockers: (1) the
  `apps/admin/e2e/demo/phase-2-walkthrough.demo.spec.ts` **`@video` spec was never authored** — it is
  application code that should have ridden the phase-completing slice's PR (#55) but did not; the Conductor
  cannot author application code (only an engine task can). (2) **BUG-008-001** (Azurite SAS-URL
  host-unreachable from the host Playwright browser) would break the document-upload scene of a full Phase-2
  walkthrough even once the spec exists. **The video is non-gating** (DEMO-POLICY: "Neither is ever a gate") —
  Phase 2 is delivered regardless. **Resume:** commission an engine slice to author the `@video` spec + fix/work
  around BUG-008-001, then run `pnpm --filter admin e2e:video` + `node scripts/make-phase-video.mjs 2`, eyeball,
  write `docs/demos/phase-2/README.md`, and ship it via a docs-lane PR.
- **[C4 drift triage — DEFERRED, user-directed 2026-06-19]** triage the four C4 backfill as-built-vs-ADR drifts
  (commit `9900d6a`) with `/planning` + `/architecture` — esp. the ADR-005/009/010 schema-lag (table-set ahead
  of `prisma/schema.prisma`). Not slice-blocking; a Phase-2-wrap-up task.
- **[Cross-surface-parity sunset counter TRIPPED 3-of-3 — needs user/Overwatch ratification]** RETRO-009 recorded
  the third consecutive clean cross-surface-parity pass (CLAUDE.md § Platform-frontend scope sunset trigger). The
  rule's keep/remove review is now due. RETRO-009 recommends **KEEP** (the admin-lane mirror in EPIC-009 was a real
  parity obligation, not a no-op). **Resume:** ratify keep-or-remove with the user/Overwatch; if KEEP, reset the
  counter annotation; if REMOVE, strike the rule from CLAUDE.md § Platform-frontend scope. Non-gating.
- **[Increment-3 sequencer adoption — RESOLVED 2026-06-23, score at Phase-3 close]** The adoption gap is closed:
  `/orchestrate` (`.claude/commands/orchestrate.md`) now **drives via `bin/sequence.sh`** (code nodes Select/Gate/
  Fix-route/Report run in-script; agent nodes via exit-10 yields + `--set` record-hints; cold-starts from the
<!-- conductor-state/v1
phase=select
epic=
brief=
pr=
std_verdict_file=
verdict_file=
lane=
fix_route=
merge_sha=
ac_ok=
fix_done=
validated=
halt_reason=
updated=2026-06-23T15:36:30Z
-->
