# `.implementation/` — Standalone Implementation Engine

A self-contained, **process-decoupled** team that turns a *build brief* ("what to build") into delivered,
validated code. It runs its own internal mini-SDLC — **clarify → design → plan → build → validate** — for
one slice of work at a time. It does **not** own product requirements, system architecture, or the delivery
roadmap; those live in the upstream `.requirements/`, `.architecture/`, and `.planning/` layers. The team
reads those as read-only constraints *when a brief cites them*, and works from the brief alone when they're
absent. Any orchestrator (a `.planning/` epic, a human ad-hoc, or an external tool) can feed the same brief
contract — or this layer can be ignored entirely in favor of another implementation mechanism.

## What's here

```
.implementation/
├── README.md            # this file — lifecycle, conventions, the altitude split
├── AGENT.md             # the Implementation Orchestrator (IO) — canonical entry role (source of truth)
├── ENGINE.md            # the workflow engine — rules every roster agent reads on startup
├── PHASES.md            # IO-only phase lifecycle reference
├── OPEN-QUESTIONS.md    # ledger of OQ-NNN (each with a proposed default or raised upstream)
├── agents/              # the dispatched roster
│   ├── developer.md     # implements a task per the brief's mandated methodology
│   ├── sdet.md          # validates the slice against the brief's acceptance + test contract
│   └── overwatch.md     # read-only auditor (advisory)
├── _templates/          # copy-to-create shapes
│   ├── build-brief.md   # the INPUT contract — "what to build"
│   ├── task.md          # task spec shape
│   └── bug.md           # bug report shape
├── seed/
│   └── sources.md       # the ONLY coupling point — where the brief lives + optional upstream refs
├── tasks/               # live pipeline: PROGRESS.md, active task/bug files, done/
├── operations/          # operational docs the team owns (e.g. branch-protection)
└── model-behavior-notes.md  # known model failure modes the load-bearing rules mitigate
```

## The altitude split (core principle)

Requirements, design, and planning are **not removed** from the team — they are scoped down one **altitude**.

| Activity         | Upstream (owned outside the team)                                  | Inside the team (per brief)                                                          |
| ---------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| **Requirements** | Product SRS, personas, product-wide flows; the acceptance + methodology contract (gherkin, TDD, e2e/coverage) — canonically produced by `.planning/` | Clarify/understand the brief for this slice; honor the contract handed down         |
| **Design**       | System architecture, ADRs, C4, cross-cutting tech choices          | Implementation design of the slice, within cited constraints; record `// DECISION:` |
| **Planning**     | Roadmap, epic sequencing, cross-product coverage                   | Task decomposition + sequencing of the slice                                        |
| **Build**        | —                                                                  | Implement per the brief's mandated methodology; write the executable tests          |
| **Validation**   | —                                                                  | SDET gate vs. the brief's acceptance contract + its mandated test gates             |

**Boundary rules:** the team **consumes** upstream artifacts read-only when cited; **produces** only
slice-scoped artifacts; **never edits** upstream (it *raises* questions back via `OPEN-QUESTIONS.md`). With an
ad-hoc brief and no upstream refs, the team supplies its own slice-level clarification and design — it does
**not** author product-level requirements or system ADRs.

**Methodology is input, not engine policy.** *How* the slice is built and validated — TDD, gherkin/BDD
scenarios, e2e, coverage — is a requirement carried in the brief (canonically produced by `.planning/`). The
engine is methodology-agnostic: it *executes* what the brief mandates and falls back to sensible defaults
when the brief is silent. It never hard-codes gherkin or TDD as a gate.

## Lifecycle

```
build brief  ──►  Implementation Orchestrator (IO)  ──►  delivered + validated slice + handoff report
(+ optional       Ingest → Clarify → Design → Decompose → Dispatch
 upstream refs)    → Audit → Review → Smoke → Validate → Close
```

1. **Ingest** the brief (and any cited upstream refs).
2. **Clarify** the slice: confirm testable acceptance criteria + the mandated methodology/acceptance contract.
3. **Design** the implementation within cited constraints (or sensible defaults).
4. **Decompose** into tasks, each tracing to acceptance criteria.
5. **Dispatch → Audit → Review → Smoke → Validate**: build, audit, review, container-smoke, and validate the
   slice against the brief's contract.
6. **Close**: archive, retro, raise the PR, and write a completion/handoff report (which AC were satisfied)
   the upstream producer can absorb.

Full detail: `PHASES.md` (IO lifecycle) and `ENGINE.md` (shared rules).

## How to run the team

- **In Claude Code:** `/io [optional brief path or resume]` — invokes the Implementation Orchestrator.
- **As subagents (batch):** the IO composes one dispatch prompt per turn; the main session spawns the named
  roster agent (`developer` / `sdet` / `overwatch`) and re-invokes the IO with the result. (Claude Code does
  not support nested-agent spawning — see `ENGINE.md` § How to Invoke.)
- **Any other executor:** point it at `.implementation/AGENT.md` (the canonical role) + `ENGINE.md` + the
  build brief. Or skip this layer entirely and hand the same brief to a different implementation orchestrator.

## Conventions

**IDs** — `BRIEF-NNN` (a build brief), `AC-NNN-NN` (an acceptance criterion within a brief), `TASK-BBB-NNN`
/ `BUG-BBB-NNN` (a task/bug for brief `BBB`), `OQ-NNN` (an open question). Zero-padded, never reused.

**Task status** — `backlog → in-progress → review → done`, plus `needs-user-direction` (set by the Stuck-Loop
Killswitch). Canonical list in `ENGINE.md` § Task Status Lifecycle.

**The acceptance criterion is the unit of validation.** The SDET gate passes a slice only when its delivered
behavior satisfies the brief's acceptance criteria under whatever test methodology the brief mandates.

## Escalation carve-out (raise upstream, never decide locally)

Decisions that belong to an upstream layer are **raised**, not made: a genuinely architectural choice (→
`.architecture/`), a product-requirement ambiguity (→ `.requirements/`), or a sequencing/scope change (→
`.planning/`). The team records these in `OPEN-QUESTIONS.md` as `raised-upstream` and proceeds on the brief's
stated intent where it safely can.

## Scope boundary

This folder owns **the implementation team + the engine that runs it + its live pipeline**. It does **not**
own product requirements (`.requirements/`), system architecture (`.architecture/`), or delivery planning
(`.planning/`). Project-specific bindings (tech stacks, gate commands, directory assignments) live in the
project's `CLAUDE.md`, layered on top of this generic engine.

## Reusability

- **Generic / portable:** `AGENT.md`, `ENGINE.md`, `PHASES.md`, the roster, the build-brief contract,
  templates, ID schemes, the phase lifecycle, the gate machinery.
- **Project-specific:** `seed/sources.md` (where briefs live), the actual briefs/tasks, `operations/`, and
  everything in `CLAUDE.md`.
