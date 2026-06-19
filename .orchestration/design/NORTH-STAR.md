# North Star — Scripted Orchestration

> **Purpose:** the long-term objective the `.orchestration/` work is moving toward, and the cadence for checking whether we're advancing. Re-read and score this **at the end of every delivery phase** (see § Per-phase evaluation). This doc is intentionally stable; the active plan lives in the per-increment design docs it links to.

## The objective

Replace the **LLM-conducted** orchestration Conductor with a **deterministic sequencer + pure-code gates + a small set of narrow, conservative, logged LLM gate-judges** for the residual *semantic* gates — migrated **strangler-style**, advancing on data, never trusting a path we haven't seen.

The Conductor today is an Opus-tier agent running a control flow that Phase 1 proved is a deterministic state machine. The objective is not "remove the LLM" — it is **put the intelligence inside the narrow gate nodes and make the composition between them dumb, explicit, and auditable.**

**What the rails are actually for (revised after Phase 2 — see § Advancement log).** The first three runs on the Increment-1 rails reframed the payoff. The control flow is untouched, so the token-cost argument is still entirely ahead of us — but the realized value showed up elsewhere: the gates are **integration tests of the contracts between layers** (planning → orchestration → implementation). The single highest-value event in the first three runs (EPIC-006 `deps-delivered` FAIL on `EPIC-002(planned)`) caught a contract bug in the **upstream `/planning` write-back**, not in the Conductor's own flow — drift no LLM Conductor would have surfaced. So the program's near-term value is *contract enforcement across seams*, and the cost win is a later dividend of the sequencer.

## Why (the load-bearing conclusions)

1. **Script-vs-agent and contract-erosion are one problem.** A script can't absorb variance; it *reveals* loose contracts instead of papering over them. Scripting **is** the erosion detector — an LLM Conductor hides drift by silently reinterpreting. *(Confirmed Phase 2: the detector fires on **upstream** contracts too, not just the Conductor's own — EPIC-006 caught a `/planning` write-back bug. The gates police every seam they can see.)*
2. **Intelligence in the nodes, dumb composition between them.** Sequencing is a DAG; judgment belongs inside narrow gate evaluators.
3. **Re-derive from primary sources, never from ledger verdicts.** A recorded "✓" is a conclusion, not evidence. Every evaluator reads the source the agent read.
4. **Conservative bias — but a *predictably benign* fail is a gate-spec bug, not caution.** False-pass lets bad work proceed (expensive, late); false-fail just halts (cheap, now). Evaluators default to FAIL/escalate when *uncertain*. The corollary learned in Phase 2: a gate that fails *predictably and benignly* — e.g. the git-clean gate firing on the Conductor's own expected docs-lane writes (2 of its 3 Phase-2 FAILs) — is not exercising caution, it is mis-specified, and recurrent benign halts train the operator to wave past halts (erosion-in-reverse). Fix the gate (allowlist the known-clean set / re-order the check), don't tolerate the noise.
5. **Promotion is data-driven.** A gate graduates from `judge` to pure `code` only when the verdict log shows it returning the same answer at high confidence across many runs on a mechanical input.
6. **Never script an unexercised branch.** Branches that haven't fired in real runs default to halt-and-escalate, matching the Conductor's existing stop/defer discipline. We do not bake 4 near-identical runs in as if they were the whole space. *(Cuts both ways: it also forbids building a gate-judge for a semantic case that hasn't appeared — see the AC-testability judge, data-starved across 4 verbatim-AC epics, now deferred to Increment 4.)*
7. **Every layer seam needs a durable, bounded, cold-derivable contract** — or the vacuum is filled by volatile memory and imitation. A gate can only police a seam whose contract is *captured*. Three corollaries this generates: **(a)** the ledger holds **bounded hot-state**; history collapses to a one-line pointer because it is already durable in git, the PRs, COVERAGE, and the RETRO/HANDOFF artifacts (a prose-accreting ledger is this conclusion failing — the engine hoarding conclusions instead of trusting sources, the very anti-pattern of #3). **(b)** The Conductor's own working state must be **cold-derivable** — compaction at every phase boundary is the standing test that the state-ledger contract actually holds (and the dress rehearsal for the sequencer). **(c)** The **architecture model (C4)** is the captured contract for the architecture seam; an empty C4 means structure gets invented slice-to-slice by imitation. *(Surfaced in the Phase-2 review: STATE.md and PROGRESS-ARCHIVE.md had accreted unbounded; C4 was empty stubs. Addressed in Increment 2.)*

## Target end-state

```
deterministic sequencer (the DAG: Select → Gate → Compose → Implement → Review → Fix → Merge → Validate → Report)
  ├── pure-code gates        (globs, git/CI state, structured verdicts, file-structure checks)
  ├── narrow gate-judges      (typed I/O, conservative, logged — only where judgment is genuinely first made)
  └── halt-and-escalate       (anything outside codified cases → the user)
verdict log (.orchestration/runs/gate-log.jsonl)
  └── contract-erosion alarm + the promotion ledger (code vs judge, per gate, per run)
contracts-as-code
  └── build-brief validator + versioned gate input contracts; drift fails loud
```

The verdict log is **load-bearing, so it must be durable**: "advance on data" is hollow if the data evaporates. Today it is gitignored/ephemeral and `inputs_digest` is unpopulated — the promotion ledger and the erosion alarm both lack memory. The end-state requires a committed per-run snapshot (into the run report) and a real `inputs_digest`, so a gate's verdict history survives across runs and machines (tracked as an Increment-1 follow-up; see [`INCREMENT-2-durable-contracts.md`](./INCREMENT-2-durable-contracts.md) § Out of scope).

The implementation engine stays a **swappable backend behind the build-brief contract** (`.orchestration/seed/sources.md`); none of this couples to `.implementation` internals.

## Migration path (strangler)

> **Re-sequenced after Phase 2 (2026-06-19):** the deterministic **sequencer moves ahead of the first
> gate-judge.** Rationale: the happy path is exercised across 8 epics, while the judge's validation case (a
> non-verbatim AC) has not appeared in 4 — building it now would violate conclusion #6. The sequencer operates on
> the most-exercised part of the system and needs no judge to exist (it halt-escalates the one semantic gate to
> the agent). Increment 2 is now the *foundations* the sequencer needs, not the judge.

| Stage | What | Status |
| --- | --- | --- |
| **Increment 1 — Rails** | Persist the panel's structured verdict; gate-evaluator harness over primary sources; verdict log; typed gate-judge slot (no judge built). Control flow unchanged. | **Implemented** (branch `feat/orchestration-gate-rails`, 2026-06-17; test 11/11) — see [`INCREMENT-1-gate-rails.md`](./INCREMENT-1-gate-rails.md) |
| **Increment 2 — Durable bounded contracts** *(sequencer foundations)* | Conclusion #7 made real: bounded-ledger house rule + STATE.md/PROGRESS-ARCHIVE restructure; phase-boundary cold-start protocol; C4 backfill. Plus the verdict-log durability follow-ups (`inputs_digest`, committed snapshot). Control flow unchanged. | **In progress** (branch `orchestration-increment-2-durable-contracts`, 2026-06-19) — see [`INCREMENT-2-durable-contracts.md`](./INCREMENT-2-durable-contracts.md) |
| **Increment 3 — Sequencer** | Deterministic sequencer takes the happy path from the agent; agent retained for halt-and-escalate cases *and* for the AC-testability gate until its judge exists. Cold-start (Inc 2) is its proving ground. | Not started |
| **Increment 4 — First judge** | Build the AC-testability gate-judge against the typed slot — **deferred until the first non-verbatim AC appears** (data-starved across 4 epics; do not build speculatively). | Deferred (blocked on data) |
| **Ongoing — Promotion** | As the log proves a gate mechanical, move it `judge → code`. As a deferred branch fires and proves stable, codify it. Default lifecycle is **code-first, judge-on-demand** (Phase 2: 0 judges, all-code gates). | Continuous |

## Per-phase evaluation

At each delivery-phase close-out (the same moment `.planning/COVERAGE.md` is signed off), score advancement against the objective and record one line in § Advancement log:

1. **Did any deferred branch fire this phase?** (open `PQ` at gate, unresolvable blocker, gate deviation, non-verbatim AC.) If so — was it handled by halt-and-escalate, and does it now have enough data to codify?
2. **What does the verdict log say?** Any gate now eligible for `judge → code` promotion? Any `inputs_digest` drift (erosion alarm) fired?
3. **Did the contracts hold?** Build-brief schema stable? Any handoff that dropped something the agent silently absorbed?
4. **Next increment still the right next step?** Re-confirm or re-sequence the migration path above.

> Until the rails (increment 1) ship, this evaluation is a manual read of `.orchestration/STATE.md` + the phase retro. After increment 1, items 1–2 are answerable from `gate-log.jsonl`.

## Advancement log

| Phase | Date | Deferred branches fired | Promotions | Erosion alarms | Next step confirmed |
| --- | --- | --- | --- | --- | --- |
| Phase 1 (MVP) | 2026-06-17 | none (all AC verbatim; all `OD` pre-resolved; zero open `PQ`; 1 gate deviation EPIC-004, human-resolved) | n/a (rails not built) | n/a | Increment 1 — Rails |
| Phase 2 (onboarding, EPIC-005/006/007) | 2026-06-19 | **2 fired, both halt-escalated as designed:** EPIC-006 `deps-delivered` FAIL (`EPIC-002(planned)` — upstream `/planning` write-back bug; fixed at source by the planning layer) and EPIC-007 stale-artifact git-clean FAIL (→ durable `runs/.gitignore` fix). AC-testability judge case still **not fired** (all AC verbatim, incl. EPIC-007's one scoping carry handled in agent prose). | none — all 44 gate records `source: code`, 0 judges; nothing eligible (mechanical gates were born as code). Default reframed to **code-first, judge-on-demand**. | none firing — but `inputs_digest` is `null` (alarm half-built) and the log is ephemeral. *Two real build gaps in INCREMENT-1 "as built."* | **Re-sequenced:** Increment 2 = durable bounded contracts (this); sequencer promoted to Inc 3; judge demoted to Inc 4 (data-starved). |

> **EPIC-008 (Phase-2 capstone) is paused mid-Implement** while Increment 2 lands — it will close Phase 2; this
> row is written from the first three Phase-2 slices and will be confirmed at the EPIC-008 close-out.
