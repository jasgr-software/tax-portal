# Progress — Archive (index)

> **Bounded-ledger rule (Increment 2 — NORTH-STAR conclusion #7; see `.implementation/ENGINE.md` § State-ledger
> contract).** This file is a **thin index**, not a prose log. When the IO sweeps the active phase's session
> entries out of `PROGRESS.md` at a phase transition, it records a **one-line pointer** here — it does **not**
> append the full prose. The detail is already durable in:
>
> - **`.implementation/tasks/done/TASK-*.md`** — per-task implementation record (72+ files).
> - **`RETRO-NNN.md` / `HANDOFF-NNN.md`** (this dir) — the per-slice curated narrative + carried follow-ups.
> - **`.planning/ROADMAP.md` + `COVERAGE.md`** — delivery facts + per-AC sign-off.
> - the **merged PR** and **git history** (`git log -p .implementation/tasks/PROGRESS-ARCHIVE.md` recovers any
>   pre-collapse swept prose).
>
> Collapsing swept prose to a pointer is **de-duplication, not loss.** The live `PROGRESS.md` retains only the
> active phase's session entries below its `---` separator.

---

## Per-slice index (newest first)

| Slice | Delivered | PR → sha | Durable record |
| --- | --- | --- | --- |
| **BRIEF-LOE-011 / Phase 1** | ⏳ Close-prep → `## Awaiting PR merge` (2026-06-21) | PR pending, branch `brief-loe-011-task-cli` | `RETRO-LOE-011` · `HANDOFF-LOE-011` · `done/TASK-LOE-011-*` + `done/BUG-LOE-011-001` (`pnpm task` CLI — 7 write subcommands + 6 read projections over `task-frontmatter.ts`; 9/9 AC; 172/172 scripts vitest; BUG-LOE-011-001 = metrics-parity oracle fallback caught at SDET review + fixed; independent-oracle trap caught 3× this slice; 5 quad-review workflow-doc rewrites → user-LGTM merge gate; no new required gate, `validate-gates.sh` unchanged backstop; gates 1–7 PASS, 8 pending, 9 N/A) |
| **BRIEF-LOE-010 / Phase 0** | 2026-06-21 (Close-finalize complete) | #74 → `2b8944a` | `RETRO-LOE-010` · `HANDOFF-LOE-010` · `done/TASK-LOE-010-*` (task/bug lifecycle → YAML front matter; 6/6 AC; -004 fix-forward restoring AC-04/05; design-scan/Smoke backstop caught 2 defects per-task review missed; `/pr-review` panel caught the 43%-invalid-YAML blocker every internal gate missed → YAML-validity oracle test added; gates 1–9 final, zero post-merge bugs) |
| **BRIEF-009 / EPIC-009** | ⏳ Close-prep → `## Awaiting PR merge` (2026-06-21) | PR pending, branch `brief-009-sign-in-lane` | `RETRO-009` · `HANDOFF-009` · `done/TASK-009-*` (PoC dev sign-in lane; 5/5 AC; HARD inert-under-`clerk` gate; 3-of-3 cross-surface-parity sunset trip) |
| **BRIEF-008 / EPIC-008** | 2026-06-20 | #55 → `7fe2872` | `RETRO-008` · `HANDOFF-008` · `done/TASK-008-*`; BUG-008-001 (open, tracked) |
| **BRIEF-007 / EPIC-007** | 2026-06-19 | #52 → `eaa5875` | `RETRO-007` · `HANDOFF-007` · `done/TASK-007-*` |
| **BRIEF-006 / EPIC-006** | 2026-06-18 | #50 → `e55f8c5` | `RETRO-006` · `HANDOFF-006` · `done/TASK-006-*` |
| **BRIEF-005 / EPIC-005** | 2026-06-18 | #48 → `f879da2` | `RETRO-005` · `HANDOFF-005` · `done/TASK-005-*` |
| **BRIEF-004 / EPIC-004** | 2026-06-16 | #38 → `0444551` | `RETRO-004` · `HANDOFF-004` · `done/TASK-004-*` |
| **BRIEF-003 / EPIC-003** | 2026-06-17 | #42 → `ec151cb` | `RETRO-003` · `HANDOFF-003` · `done/TASK-003-*` |
| **BRIEF-002 / EPIC-002** | 2026-06-16 | #40 → `70ea10e` | `RETRO-002` · `HANDOFF-002` · `done/TASK-002-*` |
| **BRIEF-001 / EPIC-001** | 2026-06-15 | #35 → `f7f6c9d` | `RETRO-001` · `HANDOFF-001` · `done/TASK-001-*` |
| **Foundations (pre-Epic-001)** | 2026-04 | #13/#14 etc. | `done/TASK-LOE-*`, `done/BUG-000-*`; requirements/architecture batches in git history |

---

## Sweep pointers (one line per swept phase-block)

- **BRIEF-LOE-010 Review/Smoke→Close-prep session entries** (SDET Review TASK-LOE-010-002+003; IO Review batched;
  IO Review/Smoke design-scan→2-defects→fix-forward; SDET Review TASK-LOE-010-004) swept at the BRIEF-LOE-010
  Review→Close-prep transition (2026-06-21). Durable in `done/TASK-LOE-010-*` (Work Logs + SDET Review sections),
  `RETRO-LOE-010.md`, `HANDOFF-LOE-010.md`, and `git log -p PROGRESS.md`. Close-prep verdicts (design scan CLEAN;
  Smoke backstop exit 0; Validate 6/6 AC + 2 extra gates; consistency green) recorded in RETRO/HANDOFF + the
  `## Awaiting PR merge` gate scorecard.
- **BRIEF-LOE-010 Dispatch session entries** (SDET Review TASK-LOE-010-001; IO Dispatch ×2 — review-001-first
  routing + dispatch-003) swept at the BRIEF-LOE-010 Dispatch→Review transition (2026-06-21). Durable in
  `done/TASK-LOE-010-*` (after close), the task files' Work Logs/SDET Review sections, and `git log -p PROGRESS.md`.
- **BRIEF-LOE-010 Close-prep(BRIEF-009)+Plan session entries** (IO Close-prep BRIEF-009; IO Plan BRIEF-LOE-010)
  swept at the BRIEF-LOE-010 Plan→Dispatch transition (2026-06-21). Durable in `RETRO-009.md`/`HANDOFF-009.md`
  (BRIEF-009), the BRIEF-LOE-010 brief + `done/TASK-LOE-010-*` (after close), and `git log -p PROGRESS.md`.
- **BRIEF-009 Plan→Dispatch session entries** (IO Plan→Dispatch; 5× SDET Review TASK-009-001..005; IO
  Audit/Dispatch checkpoints across the 001→{003,002}→004→005 chain) swept at the Dispatch→Close-prep transition
  (2026-06-21). Durable in `done/TASK-009-*.md`, `HANDOFF-009.md`, `RETRO-009.md`, and `git log -p PROGRESS.md`.
- **BRIEF-008 Plan→Validate session entries** (IO Plan, 5× SDET Review, IO Dispatch/Audit/Review/Smoke/Validate
  checkpoints, SDET Smoke + Acceptance-Validation gates, the TASK-008-004 escalation triage) swept at the
  Validate→Close-prep transition (2026-06-20). Durable in `done/TASK-008-*.md`, `HANDOFF-008.md`, `RETRO-008.md`,
  `BUG-008-001-*.md`, and `git log -p PROGRESS.md`.

---

*The prior 2678-line chronological prose archive (BRIEF session-entry sweeps + the April foundation/LOE/BUG
records) was collapsed into this index on 2026-06-19 under the Increment-2 bounded-ledger rule. Recover any of it
via `git log -p .implementation/tasks/PROGRESS-ARCHIVE.md`.*
