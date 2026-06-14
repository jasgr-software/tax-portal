# `.architecture/` — Standalone Architecture Standards

This folder is a **self-contained, portable description of *how* the system is built and why.** It is
the architecture counterpart to `.requirements/`: where that layer owns the **what** (requirements +
acceptance criteria), this layer owns the **how** — the architectural decisions, the C4 design, and
the testing and CI/CD strategies. It is readable and runnable by any executor
— this repo's agents, the main session, or an external tool.

Like `.requirements/`, this layer is **self-contained and workflow-agnostic.** Its agent both authors
the standards and offers a **deviation-review capability** — scanning a diff or design for drift from the
recorded ADRs, C4, or strategies — and **neither depends on any orchestration workflow.** A host
multi-agent workflow *may* invoke the agent (for example, to scan a change before merge or to refresh the
C4 model after one lands), but those dispatch points are defined by that workflow in its own adapter, not
here.

## What's here

```
.architecture/
├── README.md            # this file — lifecycle, schemas, conventions
├── AGENT.md             # the Architecture Agent — canonical role definition (source of truth)
├── OPEN-DECISIONS.md    # ledger of open decisions + logged deviations (OD-NNN), each with a proposed default
├── _templates/          # copy-to-create shapes
│   ├── adr.md
│   ├── c4-level.md
│   ├── strategy.md
│   └── open-decision.md
├── seed/                # ingestion surface — raw architecture intent (read-only to the agent)
│   ├── intake.md
│   └── tech-stack.md
├── decisions/           # one file per decision
│   └── ADR-NNN-<slug>.md
├── c4/                  # the C4 model
│   ├── README.md        # index
│   ├── L1-context.md
│   ├── L2-containers.md
│   ├── L3-components.md
│   └── L4-code.md
└── strategy/            # living strategy documents
    ├── TESTING.md
    └── CICD.md
```

## Lifecycle

```
seed/ + project state  ──►  Architecture Agent  ──►  ADRs · C4 · strategy  (+ OPEN-DECISIONS.md)
(intent + observed code)     ingest → reconcile          one ADR per decision; living C4 + strategy docs;
                             → author → review           deviation reports during design/code review
```

1. **Seed + project state.** Architecture intent lands in `seed/` — `intake.md` (raw forces, constraints,
   philosophy) and `tech-stack.md` (the current decided stack). The agent **also** reads observable
   project state (`CLAUDE.md`, `package.json`/workspace, `prisma/schema.prisma`, `.github/workflows/`,
   `db/policies/`) to detect decisions already made in code. New intent is added to `seed/`; the agent
   reads it, never the other way around.
2. **Agent run.** The Architecture Agent ingests, reconciles genuine ambiguities (asking you directly
   when interactive, or logging an `OD-NNN` with a proposed default otherwise), authors/updates the
   artifacts, and self-reviews. See `AGENT.md`.
3. **Standards.** Each artifact records a **decision and its rationale** (the *how*). ADRs are immutable
   decision records (superseded, never edited away); the C4 model and the strategy docs are **living**
   and updated in place as the system evolves.
4. **Deviations.** When the agent reviews a diff or design, each finding is either *code-violates-standard*
   (flagged for fix) or *standard-is-stale* (a proposed ADR update or a new `OD-NNN`). Unresolved items
   live in `OPEN-DECISIONS.md`.

**Incremental & additive.** Re-running the agent adds or updates only what changed; artifacts whose
`source:` did not change are left untouched. ADRs are never silently renumbered or deleted.

## How to run the agent

- **In Claude Code (interactive — recommended):** `/architecture [optional scope, e.g. "review the
  staged diff" or "author L2 container model"]`. Runs the agent inline so it can ask you clarifying
  questions and pause.
- **As a subagent (batch / non-interactive):** the `architecture` subagent type
  (`.claude/agents/architecture.md`). It cannot hold a live conversation, so it degrades to **ledger-only**
  clarification — every ambiguity becomes an `OD-NNN` with a proposed default instead of a question to you.
- **Invoked by a host workflow:** an orchestrator may dispatch this agent — for example, to scan a diff
  for deviations, or to refresh the C4 model and ADRs after a change lands. Those dispatch points belong
  to that workflow's own definition, not to this layer. See `AGENT.md` § Review.
- **Any other executor:** point it at `.architecture/AGENT.md` and have it follow that file.

## Artifact formats

### Decision record — `decisions/ADR-NNN-<slug>.md`

Front matter carries refinement state + provenance; the body is the standard ADR shape (see
`_templates/adr.md`):

```yaml
id: ADR-NNN
title: <short title>
status: Accepted          # Proposed → Accepted → Superseded by ADR-MMM
date: YYYY-MM-DD
deciders: [<decider>, user]
related: [ADR-..., REQ-...]
source:                   # seed / project provenance — drives incremental re-ingestion
  - seed/tech-stack.md#<anchor>
open_decisions: []        # OD-NNN ids currently blocking this ADR (empty when Accepted)
```

Body: **Context**, **Decision**, **Consequences**, **Alternatives considered**.

### C4 level — `c4/L{1..4}-*.md`

A living description at one of the four C4 levels (Context, Containers, Components, Code). See
`_templates/c4-level.md`. `c4/README.md` is the index.

### Strategy — `strategy/{TESTING,CICD}.md`

A **living** description of the current testing and CI/CD posture. Each is a singleton with an
amendment-history block. The strategy doc is the authoritative current state; the ADR that decided it
(e.g. ADR-012 for the testing pyramid) remains the rationale of record.

### Open decision / deviation — `OPEN-DECISIONS.md` entry

`OD-NNN` with `Status` (open → resolved), `Affects` (the artifacts/code it blocks or flags), the
`Question` or deviation, a `Proposed default` (so work is never blocked — except carve-out items), a
`Resolution`, and `Provenance`.

## Conventions

**IDs**
- `ADR-NNN` — decision record. Zero-padded, globally unique, **never reused or renumbered**.
- `OD-NNN` — open decision / logged deviation, globally unique.
- C4 levels are `L1`–`L4`.

**Status**
- ADR `status:` — `Proposed` → `Accepted` → `Superseded by ADR-MMM`. A superseded ADR is kept, not
  deleted; its reasoning history has value.
- An ADR is `Accepted` only when no open decision blocks it.

**How, not what.** This layer records mechanisms — tech stack, schema strategy, API shape, deployment
posture, test tiers. The product outcomes those mechanisms serve live in `.requirements/`. If you catch
yourself specifying a *user need*, that belongs to the requirements layer.

**ADRs are immutable; C4 and strategy are living.** Correcting a decision means a new ADR that supersedes
the old one. Correcting the system description means editing the C4/strategy doc in place (with an
amendment-history note).

## Escalation carve-out (always ask the user, never self-resolve)

Security posture, data retention/deletion, encryption, the auth/authorization model, the trust boundary,
and any regulatory constraint are **escalation carve-outs**. For these the agent records an `OD-NNN` with
**no** default and leaves the affected artifact `Proposed`/blocked — it never picks a default. Routine
architectural choices (naming, file layout, doc structure) are the agent's to resolve.

## Scope boundary

This folder owns **architectural decisions, the C4 model, and the testing + CI/CD strategy**,
plus the agent that produces them. It does **not** own product requirements (those live in
`.requirements/`), nor the **agent/model-behavior governance** of the multi-agent workflow itself —
`docs/architecture/model-behavior-notes.md` stays where it is, because it governs how the *agents* behave
for quad review, not how the *product* is built. It does not own application code; it describes and
audits it.

## Reusability

- **Generic / portable:** this folder structure, `AGENT.md`, these README conventions, `_templates/`,
  all ID schemes, and the four-phase methodology (ingest → reconcile → author → review).
- **Project-specific:** the `seed/` content, the actual ADRs, the C4 levels, and the two
  strategy docs. A new project keeps the structure and conventions, replaces the content.
