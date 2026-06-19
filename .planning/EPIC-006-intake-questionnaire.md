---
id: EPIC-006
title: Intake questionnaire — per-service-type templates, client completion
phase: 2
status: delivered
slice: The accountant defines a per-service-type intake questionnaire template; the onboarding client completes the questionnaire matching their engagement's service type, and the answers are recorded.
requirements:
  - REQ-ONBD-003: [AC-ONBD-003-01, AC-ONBD-003-02, AC-ONBD-003-03, AC-ONBD-003-04]
  - REQ-DASH-012: [AC-DASH-012-01, AC-DASH-012-02, AC-DASH-012-03]
architecture:
  - ADR-006   # monorepo — template management in apps/admin; questionnaire completion in apps/portal
  - ADR-003   # SESSION_CONTEXT — answers written under the client principal; templates under the accountant
  - ADR-005   # security policy — a client's submitted answers are client-isolated; templates are accountant-managed
  - ADR-004   # Prisma single-track — the questionnaire template + answers are entity schema
  - ADR-012   # testing pyramid — tiers the AC tests must hit
depends_on: [EPIC-005, EPIC-002]
source:
  - .requirements/REQ-ONBD-003.md
  - .requirements/REQ-DASH-012.md
  - .architecture/decisions/ADR-006-monorepo-layout.md
  - .architecture/decisions/ADR-005-rls-via-security-policies.md
open_questions: []
---

# EPIC-006 — Intake questionnaire — per-service-type templates, client completion

> A **preparation document**, not build instructions. It states what this slice delivers, which
> acceptance criteria it owns, which architecture it must adhere to, and the test contract sign-off
> requires — not how to build it.

## Vertical slice
This slice delivers **step 2 of onboarding** end to end. In the Tax Portal (`apps/admin`) the
**accountant** authors and maintains an intake-questionnaire template **tied to a service type** — the
questions she needs for a personal return differ from those for a business return. In the Client Portal
(`apps/portal`) the **client**, having passed the engagement-letter gate (EPIC-005), is presented the
questionnaire **for their engagement's service type**, completes it, and submits; their answers are
recorded against the engagement and the step is marked satisfied. It builds on EPIC-005 (the onboarding
sequence and the gate that unlocks this step) and EPIC-002 (the services catalog whose service types the
templates are keyed to).

## Requirements delivered

- **REQ-ONBD-003 — Intake questionnaire is templated per service type**
  - **AC-ONBD-003-01** — the questionnaire a client completes corresponds to their engagement's service
    type.
  - **AC-ONBD-003-02** — the accountant can define and maintain a distinct questionnaire template per
    service type.
  - **AC-ONBD-003-03** — the questionnaire step is satisfied only when the client submits their completed
    questionnaire.
  - **AC-ONBD-003-04** — the client's submitted answers are recorded against the engagement.
- **REQ-DASH-012 — Intake questionnaire template management (admin UI)**
  - **AC-DASH-012-01** — the accountant can create an intake questionnaire template from the admin UI.
  - **AC-DASH-012-02** — a questionnaire template is associated with a specific service type.
  - **AC-DASH-012-03** — the accountant can edit an existing questionnaire template.

> **AC overlap note.** AC-ONBD-003-02 (accountant defines/maintains a per-service-type template) and the
> REQ-DASH-012 trio describe the same admin capability from the onboarding side and the dashboard side.
> Both are owned here and dual-tagged, mirroring how EPIC-002 dual-tagged the DOOR-002 / DASH-010 catalog
> capability.

## Architecture adherence
- **ADR-006 — Monorepo, two apps.** Template authoring/editing lives in `apps/admin`; the client fills the
  questionnaire in `apps/portal`.
- **ADR-003 — SESSION_CONTEXT.** Template writes run under the accountant principal; the client's answer
  submission runs under the client identity.
- **ADR-005 — Security policies.** A client may read/complete only **their own** engagement's
  questionnaire and may never read another client's answers; templates are accountant-managed. The
  per-policy isolation test applies to the new answer rows.
- **ADR-004 — Prisma single-track.** The questionnaire template (keyed to service type) and the client's
  answers are entity schema on the Prisma track.
- **ADR-012 — Testing pyramid.** "Correct template for the service type" and "answers recorded / step
  satisfied on submit" are tier-3 integration obligations; the author→complete→submit path is tier-6 e2e.

## Acceptance scenarios

### AC-ONBD-003-01 — Questionnaire matches the engagement's service type
```gherkin
Given an engagement for a given service type, with a questionnaire template defined for that service type
When the client reaches the questionnaire step
Then the questionnaire presented is the one for their engagement's service type
```

### AC-ONBD-003-02 — Accountant maintains a distinct template per service type
```gherkin
Given two different service types in the catalog
When the accountant defines a questionnaire template for each
Then each service type carries its own distinct questionnaire template
```

### AC-ONBD-003-03 — Step is satisfied only on submission
```gherkin
Given a client viewing the questionnaire who has not yet submitted it
When the questionnaire step's satisfaction is evaluated
Then the step is not satisfied until the client submits their completed questionnaire
```

### AC-ONBD-003-04 — Answers recorded against the engagement
```gherkin
Given a client submits their completed questionnaire
When the engagement is examined
Then the client's submitted answers are recorded against that engagement
```

### AC-DASH-012-01 — Accountant creates a template from the admin UI
```gherkin
Given the accountant in the Tax Portal questionnaire-template area
When she creates a new intake questionnaire template
Then the new template is saved and available
```

### AC-DASH-012-02 — Template is associated with a service type
```gherkin
Given the accountant creating or editing a questionnaire template
When she associates it with a service type
Then the template is bound to that specific service type
```

### AC-DASH-012-03 — Accountant edits an existing template
```gherkin
Given an existing questionnaire template
When the accountant edits and saves it
Then the edited template is retained as the current template for its service type
```

## Traceability & sign-off contract
- Each in-scope AC must be covered by **automated test(s) tagged with its AC id** (the test
  title/annotation contains the `AC-ONBD-003-NN` / `AC-DASH-012-NN` id), at the prescribed tier(s).
- An AC is **implemented** only when its tagged test(s) **pass in CI**.
- This epic is **delivered** only when **all** its in-scope AC are `verified` in `COVERAGE.md`.
- Suggested tier mapping:
  - **e2e (tier 6)** — AC-DASH-012-01/-03 (admin authoring/editing), AC-ONBD-003-01 (correct
    questionnaire shown), AC-ONBD-003-03 (submit satisfies the step).
  - **service integration (tier 3)** — AC-ONBD-003-01 (service-type match), AC-ONBD-003-04 (answers
    recorded), AC-DASH-012-02 (template↔service-type binding), client-isolation policy test (ADR-005).
  - **unit/component (tier 2/5)** — questionnaire rendering and submit-state transitions.

## Out of scope
- **Dynamic / conditional organizer logic** — REQ-ONBD-008 (v2) is **deferred**; v1 questionnaires are
  static per service type.
- The **letter gate** (EPIC-005) and the **document-upload step** (EPIC-007) — this epic assumes the gate
  is passed and does not build upload.
- **Onboarding completion** (REQ-ONBD-005/006/007) → **EPIC-008**: satisfying the questionnaire step is
  one input to completion, evaluated there.

## Links
- Requirements: REQ-ONBD-003, REQ-DASH-012
- Architecture: ADR-003, ADR-004, ADR-005, ADR-006, ADR-012
- Personas: `personas/jane-accountant.md` (template authoring), `personas/sarah-returning-client.md`, `personas/martha-and-james-married-couple.md` (questionnaire completion)
- Flows: `flows/flow-onboarding.md` (step 2)
- Epics: depends on EPIC-005 (onboarding sequence + gate) and EPIC-002 (service types); related EPIC-007, EPIC-008
- Open questions: none
