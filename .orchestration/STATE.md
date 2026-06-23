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

- **No active run.** Last completed: **EPIC-012** ✅ DELIVERED 2026-06-23 (PR #93 → `5883fed`) — see `## Recent outcomes`.
- **Next ready slice:** **EPIC-013** (secure file exchange — accountant upload + both-party download + folders + top-level org by engagement & **tax year** (the attribute EPIC-012 introduced) + version history; 13 AC; `depends_on` EPIC-007 ✅ / EPIC-010 ✅ / EPIC-012 ✅ — all satisfied). Re-invoke `/orchestrate` (auto-selects EPIC-013) or `/orchestrate EPIC-013`. The FILE chain EPIC-013 → 014 → 015 finishes Phase 3.

## Recent outcomes

- EPIC-012 ✅ DELIVERED 2026-06-23 · PR #93 → `5883fed` · 20/20 AC verified · RETRO-012/HANDOFF-012 · panel request-changes (3 major) → `/pr-fix` green · the deterministic sequencer drove the full DAG end-to-end · **prereq fix:** Compose-validator `v_brief()` glob-collision (matched the already-delivered `BRIEF-LOE-012`) fixed + merged first (PR #92 → `4b3f3f0`).
- EPIC-011 ✅ DELIVERED 2026-06-23 · PR #89 → `9445e36` · 9/9 AC verified · accountant-only `pol_EngagementNote` RLS proven both ways.

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
- **[Cross-surface-parity sunset counter — KEEP reinforced by EPIC-012; ratification still due]** RETRO-009
  recorded a third consecutive clean cross-surface-parity pass (CLAUDE.md § Platform-frontend scope sunset
  trigger). **EPIC-012 was a genuine two-surface slice** (portal returning-client request + participant view;
  admin initiate + duplicate guard + invite) — the parity rule was **load-bearing, not a no-op**, so the 3-of-3
  clean-pass streak does **not** extend (RETRO-012 recommends **KEEP**). **Resume:** ratify keep-or-remove with
  the user/Overwatch; if KEEP, reset the counter annotation; if REMOVE, strike the rule. Non-gating.
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
updated=2026-06-23T19:05:08Z
-->
