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

### EPIC-008 — BRIEF-008 (onboarding completion — gate close, auto New→In Progress, accountant notified)

- **Status: ⏸ PAUSED (mid-Implement)** — paused 2026-06-19 by user direction to land **Increment 2** (durable
  bounded contracts; branch `orchestration-increment-2-durable-contracts`). Deliberate, not blocked.
- **Phase reached:** Select ✓ → Gate ✓ (GO 7/7) → Compose ✓ → **Implement (in progress).** IO Plan done + first
  task committed — `ae3b20c` (TASK-008-001, onboarding-completion engine WIP) on branch
  `brief-008-onboarding-completion-transition`, **draft PR** open.
- **Slice (Phase-2 capstone):** the completion predicate over the three existing onboarding step signals
  (letter ∧ questionnaire ∧ documents), the **single automatic** New→In Progress transition (fire-once, audited
  per ADR-019, atomic with the notification), and the reused EPIC-003 accountant `Notification` with a new `type`.
  **No net-new entity / policy / provider seam** — behavior over existing shapes. Smallest Phase-2 slice (8 AC).
- **In-scope AC (8):** AC-ONBD-005-01/-02, AC-ONBD-006-01/-02/-03, AC-ONBD-007-01/-02, AC-MSG-013-04.
- **Brief:** `.implementation/briefs/BRIEF-008-onboarding-completion-transition.md` (`status: ready`).
- **Gate evidence:** readiness run_id `EPIC-008-20260619T203553Z` (5/5 PASS) + engine-clear `run-20260619T203553Z`
  (both PASS) — all `source: code` in `runs/gate-log.jsonl`.
- **Parked-state note:** the EPIC-008 Compose/parked STATE narration was uncommitted at pause and is **stashed**
  (`git stash list` → "EPIC-008 parked STATE.md narration"); reconcile/drop it on resume (this bounded entry
  supersedes it).
- **Resume:** `/orchestrate EPIC-008` (or `/io` on the brief) on `brief-008-onboarding-completion-transition`
  → resumes at Implement (the IO reads `.implementation/tasks/PROGRESS.md` and continues). **Delivering it closes
  Phase 2** (44/44 AC) → the Report phase must run the phase-closeout (Phase-2 walkthrough video per
  `DEMO-POLICY.md` § Part B; ship `docs/demos/phase-2/`).

## Recent outcomes

> One line per delivered run, newest first. Full detail: `.planning/ROADMAP.md` + `COVERAGE.md` (per-AC), the
> merged PR, `.implementation/tasks/RETRO-NNN.md` + `HANDOFF-NNN.md`, and `tasks/done/` (per-task).

- **EPIC-007** ✅ DELIVERED 2026-06-19 · PR #52 → `eaa5875` (close-out #53 → `d49c984`) · 19/19 AC · initial
  document upload — first secure malware-scanned, non-public file-storage path; `FileStorage`+`FileScanner` ports;
  third client-isolation policy `0007`. Panel found+fixed 2 majors (headline: `completeUpload` cross-tenant gap).
- **EPIC-006** ✅ DELIVERED 2026-06-18 · PR #50 → `e55f8c5` · 7/7 AC · intake questionnaire — per-service-type
  templates; second client-isolation policy `0006`. Gate caught the EPIC-002 `status`-scalar drift (fixed upstream).
- **EPIC-005** ✅ DELIVERED 2026-06-18 · PR #48 → `f879da2` · 10/10 AC · onboarding spine + engagement-letter
  e-sign gate — first client-owned rows + first client-isolation policy `pol_Engagement`; `packages/esign` seam.
- **EPIC-003** ✅ DELIVERED 2026-06-17 · PR #42 → `ec151cb` · 20/20 AC · accountant request inbox — **🎉 Phase 1 /
  MVP complete (51/51 AC).** Notification spine + `0004` accountant-only read policy.
- **EPIC-002** ✅ DELIVERED 2026-06-16 · PR #40 → `70ea10e` · 7/7 AC · accountant services-catalog CRUD.
- **EPIC-004** ✅ DELIVERED 2026-06-16 · PR #38 → `0444551` · 11/15 in-scope AC (4 2FA deferred) · auth +
  two-role model (ACCOUNTANT/CLIENT), invitation-only clients, role-based cross-app redirect.
- **EPIC-001** ✅ DELIVERED 2026-06-15 · PR #35 → `f7f6c9d` · 13/13 AC · public front door (browse active
  services + submit an engagement request, anonymous).

---

*Prior verbose run-ledger prose (EPIC-001..007 full narratives) was collapsed into the one-liners above on
2026-06-19 under the Increment-2 bounded-ledger rule. Recover any of it via `git log -p .orchestration/STATE.md`.*
