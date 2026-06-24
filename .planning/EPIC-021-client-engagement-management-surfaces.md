---
id: EPIC-021
title: Accountant navigation — client list, engagement pipeline, dashboard notes & flags
phase: 4
status: planned
slice: The accountant navigates her whole book of business — a searchable, filterable client list with per-client status, and an engagement pipeline view organized by status she can filter and act on (open any engagement, regardless of client) — and triages from these surfaces using internal notes and priority/flag markers surfaced on the dashboard.
requirements:
  - REQ-DASH-004: [AC-DASH-004-01, AC-DASH-004-02, AC-DASH-004-03, AC-DASH-004-04, AC-DASH-004-05]
  - REQ-DASH-005: [AC-DASH-005-01, AC-DASH-005-02, AC-DASH-005-03]
  - REQ-DASH-009: [AC-DASH-009-01, AC-DASH-009-02, AC-DASH-009-03]
  - REQ-DASH-006: [AC-DASH-006-01, AC-DASH-006-02]
  - REQ-DASH-007: [AC-DASH-007-01, AC-DASH-007-02, AC-DASH-007-03]
architecture:
  - ADR-005   # RLS — full-practice visibility under the accountant principal; internal notes never readable by a client
  - ADR-003   # SESSION_CONTEXT — list/search/filter queries and note/flag writes run under the accountant principal
  - ADR-006   # monorepo — these are apps/admin navigation surfaces
  - ADR-019   # audit trail — note edits and flag set/clear are recorded events
  - ADR-012   # testing pyramid — full-visibility + note-confidentiality are hard tier-3 gates
depends_on: [EPIC-010, EPIC-011, EPIC-012]
source:
  - .requirements/REQ-DASH-004.md
  - .requirements/REQ-DASH-005.md
  - .requirements/REQ-DASH-009.md
  - .requirements/REQ-DASH-006.md
  - .requirements/REQ-DASH-007.md
  - .architecture/decisions/ADR-005-rls-via-security-policies.md
open_questions: []
---

# EPIC-021 — Accountant navigation — client list, engagement pipeline, dashboard notes & flags

> A **preparation document**, not build instructions. It states what this slice delivers, which
> acceptance criteria it owns, which architecture it must adhere to, and the test contract sign-off
> requires — not how to build it.

## Vertical slice
This slice gives the accountant the **navigation surfaces** to work her whole practice from the Tax Portal
(`apps/admin`). A dedicated **client list** screen is searchable, shows a status indicator per client, and
filters by service type and tax year. A dedicated **engagement list** is presented as a **pipeline view**
organized by engagement status, filterable to a subset, and is a **working surface**: every engagement
appears regardless of which client it belongs to (full visibility), and she can act on any of them (open it
to manage). The slice also **surfaces on the dashboard** the two engagement-management aids whose data model
EPIC-011 already built: **accountant-only internal notes** (visible only to her, never to a client on any
surface) and **priority/flag markers** she can set and clear, reflected where she views her engagements.

> **Surfacing scope.** REQ-DASH-006 / REQ-DASH-007 are the **dashboard presentation** of the internal-notes
> and priority-flag capability whose underlying mechanism (the HARD `pol_EngagementNote` RLS + the priority
> attribute) was delivered in **EPIC-011** (LIFE-008 / LIFE-009). This epic owns the DASH-surface AC and
> reuses that mechanism; it does not re-build the policy or the column.

## Requirements delivered

- **REQ-DASH-004 — Client list screen**
  - **AC-DASH-004-01** — a dedicated client list screen is available on the accountant surface.
  - **AC-DASH-004-02** — the client list can be searched to locate a specific client.
  - **AC-DASH-004-03** — each client shows a status indicator.
  - **AC-DASH-004-04** — the list can be filtered by service type.
  - **AC-DASH-004-05** — the list can be filtered by tax year.
- **REQ-DASH-005 — Engagement list pipeline view**
  - **AC-DASH-005-01** — a dedicated engagement list screen is available on the accountant surface.
  - **AC-DASH-005-02** — it is presented as a pipeline view organized by engagement status.
  - **AC-DASH-005-03** — the engagement list can be filtered to narrow the set shown.
- **REQ-DASH-009 — Manage all engagements in pipeline view**
  - **AC-DASH-009-01** — the accountant can view all engagements across the practice in the pipeline.
  - **AC-DASH-009-02** — every engagement appears regardless of which client it belongs to.
  - **AC-DASH-009-03** — she can act on an engagement from the pipeline (e.g. open it to manage).
- **REQ-DASH-006 — Accountant-only internal notes (dashboard surfacing)**
  - **AC-DASH-006-01** — an engagement can carry internal notes authored and viewed by the accountant.
  - **AC-DASH-006-02** — internal notes are visible only to the accountant and never shown to the client on any surface.
- **REQ-DASH-007 — Engagement priority and flag markers (dashboard surfacing)**
  - **AC-DASH-007-01** — the accountant can apply a priority/flag marker to an engagement from the dashboard.
  - **AC-DASH-007-02** — she can remove a priority/flag marker.
  - **AC-DASH-007-03** — a marker is reflected where she views her engagements.

## Architecture adherence
- **ADR-005 — RLS via security policies.** The client list and the pipeline's **full-practice visibility**
  run under the accountant principal through the policy layer (AC-DASH-009-02). Internal notes remain
  **accountant-only** — a client principal reads **zero** notes on any path; this is the same **hard**
  tier-3 `pol_EngagementNote` gate proven in EPIC-011 (AC-DASH-006-02).
- **ADR-003 — SESSION_CONTEXT.** List/search/filter reads and note/flag writes run under the accountant's
  propagated identity via the `packages/db` wrapper.
- **ADR-006 — Monorepo, two apps.** These are `apps/admin` navigation surfaces; nothing exposes internal
  notes on `apps/portal`.
- **ADR-019 — Audit trail.** Internal-note edits and priority/flag set/clear are recorded audit events.
- **ADR-012 — Testing pyramid.** Full-visibility and note-confidentiality are hard tier-3 gates; the
  list/search/filter/manage and flag/note journeys are tier-6 e2e.

## Acceptance scenarios

### AC-DASH-004-01 — Client list screen exists
```gherkin
Given the accountant on the Tax Portal
When she navigates to the client list
Then a dedicated client list screen is shown
```

### AC-DASH-004-02 — Search the client list
```gherkin
Given a populated client list
When the accountant searches for a specific client
Then the list locates the matching client
```

### AC-DASH-004-03 — Status indicator per client
```gherkin
Given clients in various states
When the accountant views the client list
Then each client shows a status indicator
```

### AC-DASH-004-04 — Filter by service type
```gherkin
Given clients across different service types
When the accountant filters the client list by a service type
Then only clients of that service type are shown
```

### AC-DASH-004-05 — Filter by tax year
```gherkin
Given clients with engagements across tax years
When the accountant filters the client list by a tax year
Then only clients relevant to that tax year are shown
```

### AC-DASH-005-01 — Engagement list screen exists
```gherkin
Given the accountant on the Tax Portal
When she navigates to the engagement list
Then a dedicated engagement list screen is shown
```

### AC-DASH-005-02 — Pipeline organized by status
```gherkin
Given engagements at different lifecycle statuses
When the accountant views the engagement list
Then it is presented as a pipeline organized by engagement status
```

### AC-DASH-005-03 — Filter the engagement list
```gherkin
Given a populated engagement pipeline
When the accountant applies a filter
Then the set of engagements shown is narrowed accordingly
```

### AC-DASH-009-01 — View all engagements
```gherkin
Given engagements belonging to many clients
When the accountant views the pipeline
Then she sees all engagements across the practice
```

### AC-DASH-009-02 — Every engagement appears regardless of client
```gherkin
Given engagements owned by different clients
When the accountant views the pipeline
Then every engagement appears regardless of which client it belongs to
```

### AC-DASH-009-03 — Act on an engagement from the pipeline
```gherkin
Given the accountant viewing the pipeline
When she selects an engagement
Then she can open it to manage it from this surface
```

### AC-DASH-006-01 — Internal notes on an engagement
```gherkin
Given the accountant viewing an engagement on the dashboard
When she records an internal note
Then the note is stored against that engagement and visible to her
```

### AC-DASH-006-02 — Internal notes never shown to the client
```gherkin
Given an engagement with an internal note and a client participant
When the client accesses the engagement through any portal path
Then the internal note is never shown to them
```

### AC-DASH-007-01 — Apply a priority/flag marker
```gherkin
Given the accountant viewing an unflagged engagement on the dashboard
When she applies a priority/flag marker
Then the engagement is marked
```

### AC-DASH-007-02 — Remove a priority/flag marker
```gherkin
Given a flagged engagement
When the accountant removes the marker
Then the engagement is no longer marked
```

### AC-DASH-007-03 — Marker reflected where she views engagements
```gherkin
Given a flagged engagement
When the accountant views her engagements
Then the priority/flag marker is reflected there
```

## Traceability & sign-off contract
- Each in-scope AC must be covered by **automated test(s) tagged with its AC id** (the test
  title/annotation contains the `AC-DASH-004-NN` / `-005-NN` / `-009-NN` / `-006-NN` / `-007-NN` id), at the prescribed tier(s).
- An AC is **implemented** only when its tagged test(s) **pass in CI**.
- This epic is **delivered** only when **all** its in-scope AC are `verified` in `COVERAGE.md`.
- Suggested tier mapping (per ADR-012):
  - **service integration / security (tier 3)** — AC-DASH-009-02 (full visibility), AC-DASH-006-02 (the hard
    note-confidentiality gate, reused from EPIC-011), AC-DASH-004-04/-05 (filter correctness).
  - **e2e (tier 6)** — AC-DASH-004-01/-02/-03, AC-DASH-005-01/-02/-03, AC-DASH-009-01/-03, AC-DASH-006-01,
    AC-DASH-007-01/-02/-03.

## Out of scope
- **The dashboard home (metrics, activity feed, needs-action)** (REQ-DASH-001/-002/-003) → **EPIC-020**.
- **The internal-notes RLS policy and the priority attribute** — already delivered in **EPIC-011**
  (LIFE-008 / LIFE-009); reused, not re-built. DASH-006/-007 are the dashboard-surface AC over that mechanism.
- **Admin template management and portal identity/settings** (REQ-DASH-013, IDNT) → **EPIC-022**.

## Links
- Requirements: REQ-DASH-004, REQ-DASH-005, REQ-DASH-009, REQ-DASH-006, REQ-DASH-007
- Architecture: ADR-003, ADR-005, ADR-006, ADR-012, ADR-019
- Personas: `personas/jane-accountant.md` (navigates her book of business; private notes; triage)
- Flows: `flows/flow-accountant-dashboard.md` (extended with the list/pipeline/notes/flag branches); relates `flows/flow-engagement-lifecycle.md`
- Epics: depends on EPIC-010 (engagement workspace + full visibility), EPIC-011 (notes/flag mechanism), EPIC-012 (clients/participants)
- Open questions: none
