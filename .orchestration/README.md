# `.orchestration/` — the delivery Conductor (roadmap-driven, one slice at a time)

This layer is the **project's lights-out delivery conductor.** It is deliberately coupled to the `.planning/`
roadmap and drives **one ready epic** all the way to delivered — selecting it, gating its readiness,
composing a build brief, handing it to an implementation engine, hardening the resulting PR (review → fix),
letting it merge and finalize, and writing acceptance back to the roadmap — then **stops and reports**. You
re-run it once per slice.

Unlike its siblings (`.implementation/`, `.pr-review/`, `.planning/` — all portable / workflow-agnostic by
design), **this layer is intentionally project-coupled.** Isolating the coupling here keeps the others
reusable. Its single configuration knob is `seed/sources.md`.

## What it is — and is not

- **Is:** a **thin conductor** that sequences and gates by *invoking existing capabilities*. It owns the
  seams nobody else owned: epic **selection**, the cross-layer **readiness gate**, **epic → brief
  generation**, the **review → fix** wiring on the opened PR, and **coverage write-back** to the roadmap.
- **Is not:** an implementation engine. It does not plan tasks, design, write code, run submission gates,
  create branches, or merge — all of that belongs to the engine and its own rules. A Conductor that
  re-implements the IO is a bug.

## The implementation engine is a backend

The Conductor depends on the implementation engine **only through the build-brief contract**, declared in
`seed/sources.md`. `.implementation/` (the in-repo IO, via `/io`) is the **default binding**; another engine
that consumes a build brief and produces a merged PR + completion report can be retargeted by editing
`seed/sources.md`. The brief is the interface.

## How to run

- **`/orchestrate`** — drive the **next ready** slice end-to-end, then stop.
- **`/orchestrate EPIC-NNN`** — pin a specific epic (still gated for readiness).
- The Conductor reads `STATE.md` first; a mid-flight run **resumes** at the recorded phase.

**No spawnable subagent (deliberate).** Claude Code can't nest-spawn agents, and the engine (`/io`), the
panel (`/pr-review`), and the fixer (`/pr-fix`) are themselves main-session-driven commands. So the Conductor
**is the main session** reading these docs and executing the phases — a composer/driver, exactly like the IO
and the PR-review panel. A subagent could not invoke `/io` or the panel anyway.

## The single-slice lifecycle

```
Select → Gate → Compose → Implement → Review → Fix → Merge/Finalize → Validate → Report (STOP)
```

It **defers to the engine's and fixer's own stops** (stuck-loop killswitch, Docker hard-gate, escalation
carve-outs, workflow-file LGTM, fixer attempt cap) — recording, reporting, and halting rather than working
around any guardrail. See `PHASES.md` § Stop/defer matrix.

## What's here

```
.orchestration/
├── README.md            # this file
├── AGENT.md             # the Conductor — canonical role + the 9-phase lifecycle + epic→brief mapping
├── ENGINE.md            # shared rules: autonomy boundary, engine interface, readiness gate, state contract
├── PHASES.md            # per-phase responsibilities + exit conditions + the Stop/defer matrix
├── STATE.md             # the run ledger — single source of truth for a run (resumable)
├── DEMO-POLICY.md       # visual evidence: per-epic UI demo galleries + per-phase walkthrough videos
├── MERGE-POLICY.md      # the two merge lanes (reviewed slice PR vs docs fast-lane)
├── seed/
│   └── sources.md       # THE coupling knob: roadmap source + engine binding + review/fix + validate
└── _templates/
    └── run-report.md    # the per-slice run-summary shape
```

At **phase closeout** (the slice that delivers a roadmap phase's last epic), the Conductor also produces a
**human-speed walkthrough video** of the whole phase under `docs/demos/phase-<N>/` — see `DEMO-POLICY.md`
§ Part B. Per-epic screenshot demos (Part A) ride each slice; the phase video is produced once per phase.

## Relationship to the other layers

| Layer | The Conductor's relationship |
|---|---|
| `.planning/` | **Reads** the roadmap (ROADMAP/EPIC/COVERAGE) to select + compose; **requests** the validate write-back (planning agent owns the `.planning/` edit). |
| `.implementation/` | The **default engine.** The Conductor composes a brief and invokes `/io`; the engine plans/builds/validates/merges/finalizes under its own rules. |
| `.pr-review/` | The **review + fix** stage. `/pr-review` posts the advisory panel; `/pr-fix` hardens to green when there are findings. |

## Scope boundary

This layer owns the **conductor role + its phase lifecycle + the run ledger + the engine/roadmap binding.**
It does **not** own product requirements, architecture, the roadmap content, the implementation engine, the
review panel, or application code. It **reads** the roadmap, **composes** a brief, and **invokes** the
engine / panel / fixer / validate capability; it writes only the composed brief and `STATE.md`.
