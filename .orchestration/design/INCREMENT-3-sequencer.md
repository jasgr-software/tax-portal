# Increment 3 — Deterministic Sequencer

> **Status:** in progress — branch `orchestration-increment-3-sequencer` (2026-06-20). Docs-lane (every changed
> file is under `.orchestration/**`, main-session-owned tooling).
> **Owner:** main session (`.orchestration/**`).
> **Builds on:** Increment 1 (gate rails), Increment 2 (durable bounded contracts + cold-start protocol), and
> the verdict-log durability follow-up (`inputs_digest` + committed `gate-history.jsonl`, PR #60). Those are the
> foundations this increment was sequenced to wait for — see [`NORTH-STAR.md`](./NORTH-STAR.md) § Migration path.

## Objective

Take the **happy-path control flow** of the Conductor away from the LLM agent and give it to a **deterministic
state machine**, keeping the agent only for the irreducibly *semantic* nodes and for halt-and-escalate. This is
the North Star target made real: *intelligence in the nodes, dumb composition between them* (§ Why #2).

The agent stops *deciding what comes next and whether a gate passed*; it retains only the work that genuinely
needs judgment (mapping an epic to a brief, driving the engine, reviewing a PR, writing acceptance back).

## The constraint that shapes everything (and the chosen model)

Several pipeline nodes are **irreducibly agent-driven**: Compose (epic → brief), Implement (`/io`), Review
(`/pr-review`), Fix-exec (`/pr-fix`), Validate (`/planning validate`). And in this harness a script **cannot**
invoke those agents — the main session is the dispatch executor (no nested-agent spawn; see the project memory
`claude-code-no-nested-agent-spawn`). A single script therefore cannot run the pipeline end to end.

**Chosen model — yield-and-resume driver** (user-confirmed 2026-06-20):

```
sequence.sh runs the mechanical nodes itself and, at each agent node, EMITS a typed "next action"
and exits 10 ("agent action required"). The main session executes that one command, records the
result via `sequence.sh --set <key>=<val>`, which re-enters the machine — it validates the new
artifact against the primary source and advances. Every invocation cold-starts from STATE.md.
```

Determinism comes from the agent **losing discretion over control flow and gate verdicts**, not from removing it
from execution. The script can't absorb variance: a node whose exit artifact doesn't validate **halts** instead
of being smoothed over (§ Why #1 — scripting *is* the erosion detector — now applied at every node boundary).

This is also the cold-start dress rehearsal Increment 2 built: the sequencer holds **no context** between
invocations — it re-derives phase + inputs from `STATE.md` + primary sources every time. A phase that can't
cold-start is a state-ledger contract gap (§ conclusion #7), surfaced rather than papered over.

## Architecture

- **`.orchestration/bin/sequence.sh`** — the deterministic spine (state machine + yield protocol).
- **Machine state** lives in `STATE.md` `## Current run` as a managed, bash-parseable block (single source,
  cold-derivable, committed/durable — Increment 2 made `STATE.md` bounded enough for this):

  ```
  <!-- conductor-state/v1
  phase=gate
  epic=EPIC-009
  brief=
  pr=
  verdict_file=
  fix_route=
  merge_sha=
  ac_ok=
  ...
  -->
  ```

  The prose around the block stays the human ledger; the block is the machine's resume target.
- **Each phase is a node** `{id, kind: code|agent, validator, advance}`:
  - **code** nodes the sequencer executes itself (Select, Gate, Fix-route, Report-snapshot), advancing the
    state on success and **halting** on failure.
  - **agent** nodes the sequencer *validates and yields*: if the exit artifact is already present + valid
    (resume), it records and advances; otherwise it emits the typed action and exits 10.
- **The validator is the cross-layer contract test.** Before advancing past an agent node the sequencer
  re-derives its exit artifact from the **primary source** (the brief file exists in the briefs dir; the PR
  is recorded; the verdict file parses) — never from a "the agent said it's done" flag alone where a source
  check is available. This is conclusion #3 (re-derive from primary sources) enforced at every seam.

## Phase table (Increment-3 phase 1)

| # | Phase | Kind | Exit artifact / validation | On failure |
|---|---|---|---|---|
| 1 | **select** | code | next ready epic chosen from `ROADMAP.md` (earliest `planned`), or `--epic` pin → `epic` | halt: no candidate |
| 2 | **gate** | code | `orchestrate-gates.sh readiness` + `engine-clear` exit 0 | halt: blockers verbatim |
| 3 | **ac-check** | agent | the one semantic gate — agent confirms each AC resolves to testable REQ text → `ac_ok=yes` | agent halts |
| 4 | **compose** | agent | `BRIEF-<NNN>-*.md` exists in the briefs dir (auto-detected — the contract test) | yield until present |
| 5 | **implement** | agent | `/io <brief>` drives to its limbo-ledger signal; PR recorded → `pr` | yield / defer-to-inner-stop |
| 6 | **review** | agent | `/pr-review <pr>`; verdict payload saved + parses → `verdict_file` | yield until present |
| 7 | **fix-route** | code | `orchestrate-gates.sh fix-decision` → `run-fix` (→ fix-exec) or `skip-fix` (→ merge) | halt: inconsistent verdict |
| 8 | **fix-exec** | agent | only if `run-fix`: `/pr-fix <pr>` → CI green → `fix_done=yes` | yield / fixer-cap defer |
| 9 | **merge** | agent | engine merge + finalize per `MERGE-POLICY.md`; merged SHA → `merge_sha` | yield / LGTM·governance halt |
| 10 | **validate** | agent | `/planning validate <epic>` with CI evidence; rows flipped → `validated=yes` | yield / `incomplete` halt |
| 11 | **report** | code | snapshot the verdict log (`--gate snapshot`) + scaffold the run report; set outcome | — |
| — | **done** | — | run complete (exit 0) | — |

Consecutive **code** phases run in a single invocation; the sequencer only stops at an agent **yield** (exit 10),
a **halt** (exit 2), or **done** (exit 0). The preview the user approved: one invocation runs Select + Gate, then
yields at Compose.

## Strangler boundary — what is and isn't sequenced now

**Sequenced deterministically (this increment):** the mechanical spine — Select, Gate (mechanical criteria via
the rails), Fix-routing, Report-snapshot — plus the **state machine, cold-start/resume, and the yield protocol**
for every agent node. The most-exercised part of the system (8 epics, identical path) goes first, per
"advance on data."

**Still the agent's, invoked via yields:** Compose, `/io`, `/pr-review`, `/pr-fix`, the engine merge/finalize,
and `/planning validate`. These are the genuinely intelligent nodes — the sequencer **composes** them, it does
not absorb them. (Merge stays the engine's, never the Conductor's — `PHASES.md` § Notes.)

**Halt-and-escalate, never scripted yet** (§ Why #6 — never script an unexercised branch):
- **AC-testability** (Gate criterion 5) — the one semantic gate; yields to the agent (its judge is Increment 4,
  data-starved).
- **Every Stop/defer-matrix branch** (`PHASES.md`): engine killswitch, Docker pre-flight gate,
  `needs-user-direction` carve-out, workflow-file LGTM hold, fixer attempt cap, validate `incomplete`/`failing`,
  no-ready-epic. The agent hits one → it `--halt`s the run; the sequencer records and stops. Each is codified
  later only after it has fired and proven stable (Ongoing — Promotion).
- **Multi-candidate Select search** — Select picks the earliest `planned` epic and lets Gate decide GO/NO-GO; a
  NO-GO **halts with blockers** rather than auto-trying the next candidate (that search branch has barely fired).

## CLI

```
sequence.sh [--epic EPIC-NNN]      # run/resume the machine (cold-starts from STATE.md)
sequence.sh --set <key>=<val> ...  # the resume handshake: record an agent node's artifact, then continue
sequence.sh --halt "<reason>"      # mark the run halted (the agent's defer-to-inner-stop action)
sequence.sh --status               # print machine state; no advance
# test/fixture overrides: --state <file> --roadmap <file> --planning-dir <dir> --briefs-dir <dir>
#                         --progress-md <file> --no-git
```

Exit codes: **0** run complete / status; **10** agent action required (yield); **2** halted/blocked; **1** usage.

## Done = (acceptance for Increment 3, phase 1)

- The sequencer drives a full happy-path slice: it runs the code phases itself, emits a typed yield at each
  agent node, and on re-invocation cold-starts from `STATE.md`, validates the recorded artifact, and advances.
- It **halts-and-escalates** on every Stop/defer branch and on AC-testability — it never works around a guardrail.
- A fixtures-based test exercises the state-machine transitions deterministically (no agents): given a state at
  phase X with artifact Y present/absent, it asserts the next action + exit code.
- Run against a real ready epic (EPIC-009 today) it produces the same sequence the prose Conductor would, with
  the agent reduced to executing the yields.

## As built (phase 1 — 2026-06-20)

| Piece | Landed as |
| --- | --- |
| Sequencer spine | `.orchestration/bin/sequence.sh` — state machine + yield protocol + cold-start/resume; code phases `select`/`gate`/`fix-route`/`report`; agent phases `ac-check`/`compose`/`implement`/`review`/`fix-exec`/`merge`/`validate` via the `agent_node` validator-or-yield helper; `--set`/`--halt`/`--status`/`--reset`. Exit 0/10/2/1. |
| Machine state | managed `<!-- conductor-state/v1 … -->` block in `STATE.md` (loaded + rewritten in full each step; the cold-derivable resume target) |
| Contract-test validators | `compose` auto-detects the brief in the briefs dir; `fix-route` re-derives run/skip from the structured panel verdict; gate delegates to the rails — re-derive from primary sources, never a "done" flag where a source check exists |
| Test | `.orchestration/bin/sequence.test.sh` — drives the full happy path + run-fix routing + both halt paths deterministically (no agents). **34/34 pass** |
| Rider fix | `orchestrate-gates.sh` C7 now **allowlists the Conductor's own working files** (`STATE.md`, `runs/`) — the sequencer rewrites `STATE.md` every phase, and counting that as "dirty" is the benign-recurrent-fail trap (§ Why #4; was 2 of 3 Phase-2 git-clean FAILs). |

**Surfaced on first real run (the detector working).** Run against the live roadmap, `select` picked **EPIC-009**
(the only `planned` epic) and the readiness gate **halted** on `coverage-rows`: EPIC-009 "owns no product AC"
(a dev-capacity enabler) so it has **no `COVERAGE.md` rows**, which the readiness predicate requires. The
sequencer halted-and-escalated exactly as designed rather than proceeding. This is a genuine
**readiness-contract question** — should a no-AC enabler epic be exempt from `coverage-rows`? — for the
planning layer / user to resolve, **not** a gate to relax. Logged here; not fixed in this increment.

## Out of scope (Increment 4+ / Ongoing)

- **The AC-testability gate-judge** — Increment 4, deferred (data-starved; no non-verbatim AC has appeared).
- **Codifying the Stop/defer branches** — promote each from halt-escalate to scripted only as it fires and the
  verdict log proves it stable (code-first, judge-on-demand; Ongoing).
- **Replacing the agent execution of Compose / `/io` / `/pr-review` / `/planning`** — those are the irreducible
  intelligent nodes. The sequencer's job is dumb, auditable composition between them, not absorbing them.
- **Auto-merge / branch-protection authority** — unchanged; the sequencer observes existing gates (`seed/sources.md`).
