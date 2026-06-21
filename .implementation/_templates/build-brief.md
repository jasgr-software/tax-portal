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
demo:                            # OPTIONAL — per-epic UI demo (see .orchestration/DEMO-POLICY.md). NON-GATING.
  applicable: auto               #   yes | no | auto (auto = infer: UI surface + persona + flow + e2e/component AC)
  apps: []                       #   [portal] | [admin] | [portal, admin] — which surface(s) the demo covers
  personas: []                   #   persona slug(s) whose journey the demo walks (.planning/personas/)
  flows: []                      #   flow slug(s) the demo realizes (.planning/flows/)
  phase_walkthrough:             #   OMIT unless this slice closes a roadmap phase (Compose phase-completion check).
                                 #   When set, the developer MUST author/refresh the phase @video spec (Part B):
                                 #   { phase: <N>, spec: apps/<app>/e2e/demo/phase-<N>-walkthrough.demo.spec.ts }
source: []                       # OPTIONAL soft refs; read if present, ignored if absent. Graceful degradation.
                                 #   - planning:     .planning/EPIC-NNN-*.md
                                 #   - requirements: .requirements/REQ-<DOMAIN>-NNN.md
                                 #   - architecture: .architecture/decisions/ADR-NNN-*.md
code_standards: []               # OPTIONAL — applicable .code-standards/ keys (CS-<LANG>-NNN) the slice must honor.
                                 #   Selected by the buckets the slice actually touches (+ GEN); threaded into the
                                 #   task specs at IO Design. Each is tagged in code/tests via `// CS-<LANG>-NNN`
                                 #   (CS-GEN-003) and checked by the SDET against the standard's `verification` hook.
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

- **UI demo (when `demo.applicable` is `yes`/`auto`-inferred):** a dedicated `@demo` Playwright walkthrough
  spec captures an AC-tagged screenshot gallery of the persona/flow happy-path into `docs/demos/EPIC-NNN/`.
  **Non-gating** (the e2e gate is the gate). See `.orchestration/DEMO-POLICY.md` for the artifact shape,
  the `e2e:demo` isolation, and the produce/ship seam.

## Constraints

<Non-negotiables the build must honor — performance budgets, security/compliance rules, interfaces it must
not break, technology it must use or avoid. Cite upstream refs (`source:`) where a constraint originates
from an ADR or requirement.>

## Code standards

<OPTIONAL — the applicable `.code-standards/` keys (`CS-<LANG>-NNN`) this slice must honor, mirroring the
`code_standards:` front-matter. Selected by the buckets the slice actually touches (+ GEN); omit the section
when none apply. Each key points at its owning authority (an ADR / `CLAUDE.md` section) and carries an
enforcement `rating` — `required` (must), `recommended` (should), `experimental` (advisory). The IO threads
each into the `**Code standards:**` field of the tasks that touch its bucket; the developer tags the honoring
code/test `// CS-<LANG>-NNN` (CS-GEN-003); the SDET checks each key's `verification` hook. A `required` key
whose check fails (or whose tag is missing) is an SDET rejection.>

- **CS-<LANG>-NNN** (`<rating>`) — <one-line rule>

## Data & Interface Contract

<OPTIONAL — include only when the slice introduces or changes data shapes or interface contracts; omit
entirely for slices with no net-new shapes (degrades exactly like an absent `acceptance_scenarios`). When
absent, the team derives shapes from the acceptance criteria + cited ADRs as it does today.

When present, this is the binding reference for the slice's data and interface shape — captured to the
**altitude that traces to the epic + cited ADRs**, not invented here:

- **Entities & relationships** — the net-new/changed entities this slice persists and how they relate.
- **Status enums & state transitions** — the named states and the allowed transitions implied by the
  acceptance scenarios (e.g. e-sign: `unsigned → sent → signed`; engagement status set + legal moves).
- **Field-shape obligations from ADRs** — conventions the cited ADRs dictate (e.g. ADR-002 PK/timestamp
  conventions, identity columns), carried as concrete obligations.
- **Validation & error semantics** — required/optional fields, uniqueness/normalization rules, and the
  observable error behavior for invalid input, *to the extent the epic's behavior fixes them*.
- **Interface contracts** — the shape of any cross-module boundary the slice introduces (inputs the
  caller supplies, what comes back, status/error outcomes).

**Altitude rule (who pins what):** the brief author (Conductor) carries only what **traces** to the epic's
behavior + cited ADRs — it does **not** fabricate field-level minutiae (exact column types, regexes, error
codes). The implementation team (IO) **expands** this into the full field-level contract during **Design**;
a genuinely upstream shape question (a product or architecture decision, not an implementation detail) is
**escalated** via `OPEN-QUESTIONS.md`, never invented. Cite the originating `source:` ref for each obligation.>

## References

<Optional. Upstream IDs this brief leans on (REQ-/ADR-/EPIC- ids). The team reads them if the corresponding
layer is present; degrades gracefully if not. Listing a ref here is a pointer, not a hard dependency.>

## Notes

<Anything else the team should know — prior art, gotchas, sequencing relative to other briefs.>
