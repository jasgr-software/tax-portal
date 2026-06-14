---
id: BRIEF-NNN                     # required, unique; never reused
title: <short title>             # required
status: draft                    # draft → ready → in-progress → delivered
acceptance_criteria:             # required — the validation contract; testable, the team's source of truth
  - id: AC-NNN-01
    text: <observable, testable behavior>
  - id: AC-NNN-02
    text: <observable, testable behavior>
methodology:                     # OPTIONAL — quality/test requirements produced upstream (canonically by
  tdd: optional                  #   .planning). The team EXECUTES these; the engine does not mandate them.
  acceptance_format: prose       #   gherkin | prose | none
  e2e: optional                  #   required | optional
  coverage_target: none          #   <n>% | none
  extra_gates: []                #   any additional named gates the build must pass (free-form)
acceptance_scenarios: []         # OPTIONAL — executable acceptance scenarios (e.g. gherkin) produced upstream;
                                 #   the team binds + runs them. Absent → team derives tests from
                                 #   acceptance_criteria + methodology. May be inline or file paths.
source: []                       # OPTIONAL soft refs; read if present, ignored if absent. Graceful degradation.
                                 #   - planning:     .planning/EPIC-NNN-*.md
                                 #   - requirements: .requirements/REQ-<DOMAIN>-NNN.md
                                 #   - architecture: .architecture/decisions/ADR-NNN-*.md
---

# BRIEF-NNN — <title>

> **The self-contained "what to build" that the implementation team consumes.** A brief is everything the
> team needs to plan, design, build, and validate one slice of work. It is produced by *some* orchestrator —
> the `.planning/` layer, a human ad-hoc, or an external tool — and the team does not care which. When the
> `source:` refs are present the team reads them as read-only constraints; when absent, the brief stands alone.

## Scope

<What to build. The slice. Concrete enough that a task plan can be derived from it.>

## Out of scope

<What this slice explicitly does NOT include — guards against scope creep.>

## Acceptance criteria

<Expanded form of the `acceptance_criteria:` front-matter. Each is observable and testable. The SDET
validation gate runs against these. If they are not testable, the team clarifies or escalates to the
brief author before building.>

- **AC-NNN-01** — <observable behavior>
- **AC-NNN-02** — <observable behavior>

## Methodology & quality requirements

<How this slice must be built and validated — TDD? acceptance scenarios in gherkin? e2e? coverage target?
Mirrors the `methodology:` front-matter. These are **honored, not invented**: the team executes whatever is
specified here and falls back to sensible defaults when this section is silent. The engine never forces
gherkin or TDD on its own.>

## Constraints

<Non-negotiables the build must honor — performance budgets, security/compliance rules, interfaces it must
not break, technology it must use or avoid. Cite upstream refs (`source:`) where a constraint originates
from an ADR or requirement.>

## References

<Optional. Upstream IDs this brief leans on (REQ-/ADR-/EPIC- ids). The team reads them if the corresponding
layer is present; degrades gracefully if not. Listing a ref here is a pointer, not a hard dependency.>

## Notes

<Anything else the team should know — prior art, gotchas, sequencing relative to other briefs.>
