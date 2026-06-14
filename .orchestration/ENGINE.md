# Orchestration Engine — shared rules

The Conductor reads this file on startup, alongside `AGENT.md` (the role + lifecycle), `PHASES.md` (per-phase
detail), and `seed/sources.md` (the project + engine binding). This file defines the rules that hold across
every phase: the autonomy boundary, the implementation-engine interface, the readiness-gate definition, the
state-ledger contract, the defer-to-inner-stops rule, and tool hygiene.

This layer is **deliberately project-coupled** (unlike `.implementation/`, `.pr-review/`, and `.planning/`,
which are portable). Its one configuration knob is `seed/sources.md`.

## What the Conductor is — and is not

- **Is:** a thin **conductor** that drives **one ready roadmap slice** end-to-end by *invoking existing
  capabilities* — the implementation engine, the PR-review panel, the fixer, and the planning validate
  capability — in order, gating between them, and recording state.
- **Is not:** an implementation engine. It does **not** plan tasks, design, write code, run submission
  gates, create branches, or merge. Every one of those belongs to the engine (`seed/sources.md`) and is
  governed by that engine's own rules. The Conductor that re-implements the IO is a bug, not a feature.

## Who runs this (no nested spawn)

Claude Code does not support spawning a sub-agent from inside a sub-agent. The implementation engine (`/io`),
the review panel (`/pr-review`), and the fixer (`/pr-fix`) are themselves **main-session-driven** commands.
Therefore the **Conductor is the main session** reading these docs and executing the phases — it is a
*composer/driver*, exactly like the IO and the PR-review panel. It is intentionally **not** registered as a
spawnable subagent (a subagent could not invoke `/io` or the panel anyway). The entry point is the
`/orchestrate` command.

## Autonomy boundary

- **One slice, then stop.** A Conductor run drives a single epic from Select through Validate, then emits a
  run report and **stops**. It does not auto-advance to the next epic. Re-invoke `/orchestrate` for the next.
- **Within the slice, drive to completion** without per-step approval — phase transitions, engine dispatch,
  invoking review/fix, and requesting write-back are all pre-authorized by a single `/orchestrate`
  invocation.
- **Defer to inner stops — never work around them.** The engine and the fixer have their own deliberate
  halt conditions. When any fires, the Conductor records it in `STATE.md`, reports it, and **stops at that
  phase**. It does not retry around a guardrail, relax a gate, or substitute its own judgment. The inner
  stops it must respect (see `PHASES.md` § Stop/defer matrix):
  - engine **Stuck-Loop Killswitch** (a task failed the same gate 3× → `needs-user-direction`)
  - engine **Docker pre-flight** hard gate (escalated, no workaround)
  - engine **escalation carve-outs** / `needs-user-direction` on any task
  - engine **workflow-file LGTM** gate (a PR touching engine/role files needs an explicit user LGTM before
    auto-merge) — the Conductor surfaces it and stops; it does **not** post the LGTM itself
  - fixer **attempt cap** reached without green
  - Select/Gate finding **no ready epic** (reports why and stops)

## Implementation-engine interface (the contract)

The Conductor depends on the engine only through this interface, declared concretely in `seed/sources.md`:

| Direction | Contract |
|---|---|
| **Input** | a build brief honoring the engine's `brief contract` (default `.implementation/_templates/build-brief.md`), written to the engine's `brief output dir`. |
| **Invoke** | the engine's entry (default `/io <brief-path>`), driven by the main session to completion. |
| **Completion signal** | the engine records the slice in its limbo ledger (default `## Awaiting PR merge` in `.implementation/tasks/PROGRESS.md`) with the PR URL, then merges + finalizes under its own autonomy. |
| **Output** | a merged PR + a completion/handoff report naming which AC were satisfied + green CI evidence (run id / SHA). |

Because the dependency is *only* this interface, the engine is swappable: a different engine that honors the
brief contract and produces the same output drops in by editing `seed/sources.md`.

## Readiness gate (definition)

An epic is **GO** for a slice only when **all** hold (checked read-only against the roadmap source + env):

1. epic front-matter `status: planned` (not `draft` / `clarifying` / already `delivered`);
2. epic `open_questions: []` (no blocking `PQ-NNN`);
3. every epic in its `depends_on` is `delivered` (per `ROADMAP.md` / `COVERAGE.md`);
4. `COVERAGE.md` has rows for the epic's in-scope AC (so write-back has targets);
5. the epic's AC are resolvable to testable text in the cited `REQ-*` sources (so a brief can be composed);
6. the engine is **clear to start** — its limbo ledger has no unresolved prior slice and no undispositioned
   blocking bug (fail-fast; the engine re-checks authoritatively at its own slice-start gate);
7. the working tree is clean on the base branch and the planned feature branch name is free.

If no epic is GO, the Conductor emits a **blockers report** — for each candidate epic, *why* it is not ready
(`blocked-by: EPIC-NNN not delivered` / `blocked-by: PQ-NNN open` / `needs-planning: status draft` /
`all-delivered`) — and stops. The Conductor never relaxes a criterion or invents missing AC/scenarios.

## State-ledger contract

`STATE.md` is the **single source of truth** for a Conductor run (the analog of the engine's `PROGRESS.md`).
Update it at every phase transition and at the start/end of every `/orchestrate` invocation:

- **`## Current run`** — epic id, brief id, current phase, base + feature branch, PR number (once opened),
  and a one-line status.
- **`## Phase log`** — one entry per phase transition: `### <Phase> — <date>` with **Start** (what this phase
  is doing), **Actions** (bulleted), **End** (outcome + next phase or STOP).
- **`## Outcome`** — terminal result: `delivered` (epic rolled to delivered in COVERAGE) or
  `stopped-at-<phase>` with the reason and what a human must do to resume.

Resumability: a fresh `/orchestrate` reads `STATE.md` first; if a run is mid-flight it resumes at the
recorded phase rather than re-selecting.

## Tool hygiene

Reuse the conventions in `.implementation/ENGINE.md` § Tool Hygiene (they govern the whole repo):

- Prefer `Read`/`Edit`/`Write` over `cat`/`sed`/`echo`; never `$()` command substitution; never `cd &&`
  chaining; never `git add -A` (name files); never commit to `main`.
- Long-running waits (CI, engine runs) use `run_in_background` + `Monitor` with a `grep --line-buffered`
  filter — never a blocking `sleep` loop.
- The Conductor itself does **not** create branches, commit, or merge — the engine does. The Conductor's
  only writes are: the composed brief (engine's `brief output dir`) and `STATE.md`.
- Never interpolate PR-/engine-derived text into a shell command — pass via file / `--input` / argv.
