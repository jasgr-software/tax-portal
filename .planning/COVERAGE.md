# Coverage Ledger

> **Living document.** The acceptance mapping from the requirements source to the roadmap. **One row per
> acceptance criterion** — this is what lets a single requirement's AC fan out across multiple epics. The
> Planning Agent maintains it (see `AGENT.md`). The **validate** phase flips a row from `planned` to
> `verified` when a tagged automated test passes in CI; an AC is signed off **only** with passing-test
> evidence.

**Status legend** — per AC: `planned` (mapped to an epic, not yet built/verified) · `verified` (a test
tagged with the AC id passes in CI) · `deferred` (explicitly out of current scope, with rationale).
**Test tag** = the `AC-<DOMAIN>-NNN-NN` id the covering automated test(s) must carry; the roll-up reads
that tag. **Evidence** = the CI run / result the validate phase recorded.

## Summary

| Measure | Count |
|---|---|
| AC placed in an epic | 17 |
| — in an authored epic (EPIC-001) | 13 |
| — in a named-but-unauthored epic (EPIC-002) | 4 |
| AC `verified` (signed off) | 0 |
| AC `deferred` | see Deferred (IDNT hard-delete descoped per OQ-004) |
| AC orphaned (source AC not yet decomposed into any epic) | remainder of the corpus — see Orphans |

> Nothing is `verified` yet: no application code exists, so no tagged tests have passed. Every placed AC
> is `planned`. The roll-up reaches **full acceptance** when no source AC is orphaned and every non-
> deferred AC is `verified`.

## Coverage by acceptance criterion

| REQ | AC | Epic | Phase | Test tag(s) | Status | Evidence |
|---|---|---|---|---|---|---|
| REQ-DOOR-001 | AC-DOOR-001-01 | EPIC-001 | 1 | `AC-DOOR-001-01` | planned | — |
| REQ-DOOR-001 | AC-DOOR-001-02 | EPIC-001 | 1 | `AC-DOOR-001-02` | planned | — |
| REQ-DOOR-001 | AC-DOOR-001-03 | EPIC-001 | 1 | `AC-DOOR-001-03` | planned | — |
| REQ-DOOR-002 | AC-DOOR-002-04 | EPIC-001 | 1 | `AC-DOOR-002-04` | planned | — |
| REQ-DOOR-002 | AC-DOOR-002-01 | EPIC-002 | 1 | `AC-DOOR-002-01` | planned | — |
| REQ-DOOR-002 | AC-DOOR-002-02 | EPIC-002 | 1 | `AC-DOOR-002-02` | planned | — |
| REQ-DOOR-002 | AC-DOOR-002-03 | EPIC-002 | 1 | `AC-DOOR-002-03` | planned | — |
| REQ-DOOR-002 | AC-DOOR-002-05 | EPIC-002 | 1 | `AC-DOOR-002-05` | planned | — |
| REQ-DOOR-003 | AC-DOOR-003-01 | EPIC-001 | 1 | `AC-DOOR-003-01` | planned | — |
| REQ-DOOR-003 | AC-DOOR-003-02 | EPIC-001 | 1 | `AC-DOOR-003-02` | planned | — |
| REQ-DOOR-003 | AC-DOOR-003-03 | EPIC-001 | 1 | `AC-DOOR-003-03` | planned | — |
| REQ-DOOR-003 | AC-DOOR-003-04 | EPIC-001 | 1 | `AC-DOOR-003-04` | planned | — |
| REQ-DOOR-004 | AC-DOOR-004-01 | EPIC-001 | 1 | `AC-DOOR-004-01` | planned | — |
| REQ-DOOR-004 | AC-DOOR-004-02 | EPIC-001 | 1 | `AC-DOOR-004-02` | planned | — |
| REQ-DOOR-004 | AC-DOOR-004-03 | EPIC-001 | 1 | `AC-DOOR-004-03` | planned | — |
| REQ-DOOR-004 | AC-DOOR-004-04 | EPIC-001 | 1 | `AC-DOOR-004-04` | planned | — |
| REQ-DOOR-004 | AC-DOOR-004-05 | EPIC-001 | 1 | `AC-DOOR-004-05` | planned | — |

## Split requirements

Requirements whose AC span more than one epic — the fan-out, visible at a glance.

- **REQ-DOOR-002 (services catalog)** — split across two epics:
  - **EPIC-001** owns **AC-DOOR-002-04** (a deactivated service does not appear on the public services
    page or request form) — directly testable from the public front door.
  - **EPIC-002** owns **AC-DOOR-002-01, -02, -03, -05** (the accountant add/edit/deactivate CRUD and the
    "only the accountant may change the catalog" authorization) — these need the authenticated accountant
    admin surface, so they belong to the catalog-management epic, not the public front-door slice.

## Orphans

Source AC not yet decomposed into any epic. This is the work remaining — each becomes `planned` when a
Planning Agent run places it in an epic.

- **DOOR domain remainder (next to decompose):** REQ-DOOR-005 (accountant notified), REQ-DOOR-006
  (accept/decline), REQ-DOOR-007 (acceptance → invite), REQ-DOOR-008 (decline → reason message),
  REQ-DOOR-009, REQ-DOOR-010 — all AC. Targeted at EPIC-003 (accountant request inbox) + EPIC-004 (auth),
  to be authored.
- **All other domains pending decomposition:** AUTH, ONBD, LIFE, FILE, MSG, DASH, IDNT, and the NFR
  adherence criteria. Each `AC-*` in these domains is orphaned until a future Planning Agent run slices
  it into a phase (see `ROADMAP.md` Phases 1–4). The ledger is intentionally seeded with only EPIC-001's
  decomposition; subsequent runs extend it domain by domain.

## Deferred

AC explicitly out of current (v1) scope, with rationale. Distinct from orphaned — deferred AC are a
deliberate decision, not pending work.

- **REQ-IDNT-005 (permanent client hard-delete)** — descoped from v1 per requirements `OQ-004` (hard
  delete vs. 7-year retention precedence, resolved 2026-06-13 → defer). To be carried here as `deferred`
  when the IDNT domain is decomposed; recorded now so the decision is not lost.
