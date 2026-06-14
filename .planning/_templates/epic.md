---
id: EPIC-NNN
title: <short title>
phase: <N>                 # roadmap phase; Phase 1 = MVP
status: draft              # draft → clarifying → planned → delivered
slice: <one-line vertical capability — a user-visible thread through the stack>
requirements:              # the specific AC this epic delivers — a SUBSET of a REQ's AC is allowed
  - REQ-<DOMAIN>-NNN: [AC-<DOMAIN>-NNN-01, AC-<DOMAIN>-NNN-02]   # remaining AC of this REQ may belong to other epics
architecture:              # ADRs / requirements / strategy this slice must adhere to
  - ADR-NNN
  - REQ-NNN
depends_on: []             # EPIC ids that must precede this one
source:                    # provenance into the requirement/architecture sources + seed — drives re-ingestion
  - <requirements source anchor, e.g. .requirements/REQ-DOMAIN-NNN.md>
  - <architecture source anchor, e.g. .architecture/decisions/ADR-NNN-slug.md>
open_questions: []         # PQ-NNN ids currently blocking this epic (empty when planned)
---

# EPIC-NNN — <title>

> A **preparation document**, not build instructions. It says *what* this slice delivers, *which*
> acceptance criteria it owns, *which* architecture it must adhere to, and the *test contract* sign-off
> requires. It does not say *how* to build it — that is the architecture/developer layer's call.

## Vertical slice
<The end-to-end, user-visible capability this epic delivers, and why it is shippable on its own. Name
the actor and the thread through the stack they exercise. One short paragraph.>

## Requirements delivered
<The AC this epic owns. The acceptance criterion — not the requirement — is the unit of coverage: an
epic may deliver a subset of a requirement's AC and leave the rest to other epics.>

- **REQ-<DOMAIN>-NNN** — <one-line of what this requirement means in this slice>
  - **AC-<DOMAIN>-NNN-01** — <what "done" looks like here>
  - **AC-<DOMAIN>-NNN-02** — <…>

## Architecture adherence
<The ADRs / requirements / strategy this slice must honor, and the concrete obligation each imposes on the
implementer. Cite ids the architecture source owns.>

- **ADR-NNN — <title>** — <the obligation this slice must satisfy>
- **REQ-NNN — <title>** — <the invariant this slice must not violate>

## Traceability & sign-off contract
<The instructions to the implementing agents. Fixed contract — restate per epic so the epic is
self-contained:>

- Each in-scope AC above must be covered by **automated test(s) tagged with its AC id** (the test
  title/annotation contains the `AC-<DOMAIN>-NNN-NN` id), at the test tier(s) the architecture testing
  strategy prescribes for that kind of behavior.
- An AC is **implemented** only when its tagged test(s) **pass in CI** — CI is the independent gate.
- This epic is **delivered** only when **all** its in-scope AC are signed off (`verified`) in
  `COVERAGE.md`. Partial test coverage does not deliver the epic.
- Suggested tier mapping (per the architecture testing strategy): <e.g. AC-…-01 → e2e; AC-…-03 →
  service integration; AC-…-05 → unit/component>. The implementer may bind additional tests; the tag is
  what the coverage roll-up reads.

## Out of scope
<What this slice deliberately excludes, to keep it tight. CRUCIALLY: list any specific AC of an
otherwise in-scope requirement that are deferred to (or owned by) another epic — each with a pointer to
the epic that owns it, or "unscheduled" if not yet placed. This is how a requirement is split across
epics without losing the remainder.>

- <capability deliberately excluded from this slice>
- **AC-<DOMAIN>-NNN-03, AC-<DOMAIN>-NNN-04** (of REQ-<DOMAIN>-NNN, otherwise in scope) → deferred to
  **EPIC-MMM** / **unscheduled** — <why>

## Links
- Requirements: <REQ-… ids this epic touches>
- Architecture: <ADR-… / REQ-… ids>
- Epics: depends on <EPIC-…>; related <EPIC-…>
- Open questions: <PQ-… , or "none">
