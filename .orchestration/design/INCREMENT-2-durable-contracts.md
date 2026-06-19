# Increment 2 — Durable, bounded, cold-derivable contracts (sequencer foundations)

> **Status:** planned — branch `orchestration-increment-2-durable-contracts` (2026-06-19). Docs-lane (Lane A:
> every changed file is outside the "application code" scope — `.orchestration/**`, `.implementation/**` docs,
> `.architecture/**` docs).
> **Owner:** main session (`.orchestration/**` + `.implementation/**` docs) for tracks A & B; the **architecture
> agent** (`.architecture/c4/**` is read-only to the main session) for track C.
> **Re-sequences [`NORTH-STAR.md`](./NORTH-STAR.md):** the deterministic **sequencer moves ahead of the first
> gate-judge** (decision #1 below). This increment builds the **foundations** the sequencer needs — it does
> **not** build the sequencer itself.

## Why now

Post-Phase-2 evaluation (EPIC-005/006/007 — the **first three runs that exercised the Increment-1 gate rails**)
produced enough data to revise the strategy. The 44-record verdict log + the live ledger state surfaced:

1. **The rails earned their keep — as a cross-layer contract test.** The single highest-value event was the
   EPIC-006 `deps-delivered` FAIL on `EPIC-002(planned)`: a real contract bug in the **upstream `/planning`
   write-back** (the front-matter `status:` scalar was never rolled, though EPIC-002 was genuinely delivered).
   An LLM Conductor would have silently proceeded. The script could not absorb the variance, so it halted.
2. **The judge half is data-starved.** Through four epics, **every AC resolved verbatim** to its REQ text — the
   AC-testability gate-judge (planned Increment 2) has had **no validation case** and structurally may rarely
   get one, because planning authors verbatim AC by construction. Building it now would violate "never script an
   unexercised branch" (NORTH-STAR § Why #6).
3. **The happy path is heavily exercised** (8 epics, identical Select→…→Report), and two off-happy-path branches
   have now fired and been handled (EPIC-006's re-run-after-FAIL, EPIC-007's artifact cleanup). The sequencer
   operates on the *most*-exercised part of the system; the judge on the *least*. The original order was backwards
   relative to "advance on data."
4. **Two contracts have no durable representation at all** (raised in the Phase-2 review discussion):
   - the **orchestration's own working state** is never compacted — the Conductor carries a whole epic in one
     growing context and never cold-starts from the ledger, so the durability claim the whole layer rests on is
     never exercised on the happy path; and
   - the **architecture model (`.architecture/c4/`) is empty stubs** — agents invent high-level structure as
     they go, kept consistent only by "mirror the last slice."
   Both are the same disease as finding #1 at two more layer seams: a contract that should be durable +
   cold-derivable is instead living in volatile memory (orchestration context) or not captured (C4), so it gets
   silently invented or degraded.
5. **Long-running history documents accrete unbounded.** `STATE.md` (1111 lines, ~96% archived run-prose) and
   `.implementation/tasks/PROGRESS-ARCHIVE.md` (2678 lines) keep full historical prose inline "for the record" —
   prose that is already durable in git, the merged PRs, COVERAGE, and the per-epic RETRO/HANDOFF artifacts. The
   resume artifact (`STATE.md`) has accreted past the point of fitting in a single read.

## Decisions carried in (confirmed with the user, 2026-06-19)

- **#1 — Re-sequence the migration path.** Build the deterministic **sequencer (now Increment 3) ahead of the
  first gate-judge (now Increment 4, deferred until a non-verbatim AC appears).** The sequencer drives the
  mechanical spine and **halt-escalates to the agent** for the one semantic gate (AC-testability) — fully
  consistent with the NORTH-STAR target end-state, and it needs no judge to exist.
- **#3 — Reframe the "why" as cross-layer contract testing, not Conductor cost.** The realized value is that the
  gates police the contracts **between layers** (planning → orchestration → implementation). Control flow is
  untouched, so the token-cost thesis is still entirely ahead; the win is catching drift no LLM Conductor surfaces.
- **#7 (new load-bearing conclusion) — Every layer seam needs a durable, bounded, cold-derivable contract**, or
  the vacuum is filled by volatile memory and imitation. The gates can only police a seam that has a captured
  contract. This conclusion *generates* tracks B and C below.

## Scope — three tracks

### Track A — North Star edits (`.orchestration/design/NORTH-STAR.md`)
- Add **conclusion #7** (durable/bounded/cold-derivable contract per seam).
- Re-sequence the **Migration path** table: Increment 2 = *this* (foundations); Increment 3 = sequencer;
  Increment 4 = first judge (deferred, data-starved — note why).
- Reframe the **objective / Why** per #3 (cross-layer contract testing).
- **Refine conclusion #4** (conservative bias): a *predictably benign, recurrent* false-fail is a gate-spec bug
  to fix, not uncertainty to tolerate — it causes alarm fatigue (the git-clean gate failed on the Conductor's
  own expected writes 2 of 3 times).
- **Elevate verdict-log durability** to the target end-state: "advance on data" requires the data to survive
  (today the log is gitignored/ephemeral).
- Add the **Phase-2 row** to the Advancement log.

### Track B — Bounded-ledger house rule + restructure + cold-start protocol
- **The house rule (convention, in `.implementation/ENGINE.md` + `.orchestration/AGENT.md`):** a long-running
  ledger carries **bounded hot-state only**; a closed run/epic collapses to a **one-line outcome pointer**
  (`EPIC-NNN ✅ DELIVERED <date> · PR #N → <sha> · RETRO-NNN / HANDOFF-NNN`). History is **de-duplicated, not
  deleted** — it already lives in git, the PRs, COVERAGE, and the RETRO/HANDOFF artifacts. *Structured
  row-per-entity tables (COVERAGE, ROADMAP) are healthy and exempt; prose-blob-per-cycle archives are the target.*
- **Restructure `STATE.md`** → `## Current run` (full, bounded to the active epic; EPIC-008 represented as
  **PAUSED** with a pointer to the brief-008 draft PR) + `## Recent outcomes` (one-liner per delivered epic).
- **Restructure `.implementation/tasks/PROGRESS-ARCHIVE.md`** → a thin index (one line per swept task → its
  `tasks/done/TASK-*.md` + commit), trusting `done/` + git for the detail.
- **Phase-boundary cold-start protocol (`.orchestration/AGENT.md` + `PHASES.md`):** at each phase transition the
  Conductor compacts — it re-derives the next phase's inputs from `STATE.md` (current run) + primary sources, not
  from accumulated context. A phase that *can't* cold-start reveals a state-ledger contract gap (conclusion #1
  applied to the Conductor's own memory) — **and is the dress rehearsal for the sequencer (#1).**

### Track C — C4 backfill (architecture agent)
- Invoke the **architecture agent** to backfill `.architecture/c4/` L1–L4 from the now-rich four-phase codebase
  + the Accepted ADRs (the structure exists to reverse-engineer; the backfill is high-fidelity, not speculative).
- Establishes the architectural contract the IO Design phase anchors to — the prerequisite to *ever* policing
  the architecture seam the way the rails police planning. Runs independently of A/B.

## Out of scope (later increments / follow-ups)

- **The deterministic sequencer itself** — Increment 3. This increment only lays its foundations (bounded state,
  cold-start, durable contracts, C4).
- **The AC-testability gate-judge** — Increment 4, deferred: no non-verbatim AC has appeared in four epics, so
  there is no case to validate it against. Build it reactively when one appears, per NORTH-STAR § Why #6.
- **`inputs_digest` + a durable verdict-log snapshot** — execution follow-ups to the Increment-1 rails (the
  erosion-alarm digest is currently `null`; the log is gitignored). May ride Track B if cheap; otherwise a
  tracked follow-up.

## Lanes / ownership

- **Docs-lane (Lane A)** per `MERGE-POLICY.md`: every changed file is outside the application-code scope, so this
  branch **skips the `/pr-review` panel** and merges on green required CI (`lint-and-typecheck` + `security-scan`)
  with a plain squash — no `--admin`, no protection toggle.
- **EPIC-008 stays paused** on `brief-008-onboarding-completion-transition` (draft PR). Its parked STATE.md
  narration is stashed (`git stash`, "EPIC-008 parked STATE.md narration") to be reconciled when EPIC-008 resumes.
