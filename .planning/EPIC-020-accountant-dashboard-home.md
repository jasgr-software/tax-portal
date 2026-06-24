---
id: EPIC-020
title: Accountant dashboard home — summary metrics, activity feed, needs-action
phase: 4
status: planned
slice: The accountant opens the Tax Portal to a dashboard home that shows live summary metrics (active / overdue engagements, pending requests, upcoming deadlines), a single chronological activity feed across the whole practice, and a distinct needs-action grouping of what is waiting on her — so she can triage her day at a glance.
requirements:
  - REQ-DASH-001: [AC-DASH-001-01, AC-DASH-001-02, AC-DASH-001-03, AC-DASH-001-04, AC-DASH-001-05]
  - REQ-DASH-002: [AC-DASH-002-01, AC-DASH-002-02, AC-DASH-002-03, AC-DASH-002-04]
  - REQ-DASH-003: [AC-DASH-003-01, AC-DASH-003-02, AC-DASH-003-03, AC-DASH-003-04]
architecture:
  - ADR-002   # SQL Server — the aggregate counts/feed are queried from the relational store
  - ADR-003   # SESSION_CONTEXT — every dashboard query runs under the accountant principal
  - ADR-005   # RLS — the accountant's full-visibility read still flows through the policy layer (accountant principal)
  - ADR-006   # monorepo — the dashboard home is an apps/admin surface only
  - ADR-012   # testing pyramid — feed composition + needs-action grouping are tier-3; the home render is tier-6
depends_on: [EPIC-016, EPIC-017, EPIC-019, EPIC-010, EPIC-012]
source:
  - .requirements/REQ-DASH-001.md
  - .requirements/REQ-DASH-002.md
  - .requirements/REQ-DASH-003.md
  - .architecture/decisions/ADR-006-monorepo-layout.md
  - .architecture/decisions/ADR-005-rls-via-security-policies.md
open_questions: []
---

# EPIC-020 — Accountant dashboard home — summary metrics, activity feed, needs-action

> A **preparation document**, not build instructions. It states what this slice delivers, which
> acceptance criteria it owns, which architecture it must adhere to, and the test contract sign-off
> requires — not how to build it.

## Vertical slice
This slice delivers the accountant's **first stop each day**: the dashboard home of the Tax Portal
(`apps/admin`). At the top, **summary metrics** give a live count of active engagements, overdue
engagements, pending engagement requests, and upcoming deadlines, reflecting the practice's state at view
time. Below, a single **activity feed** combines recent activity from across **all** clients and engagements
— new messages, document uploads, new engagement requests, engagement status changes, and overdue items —
each entry naming what happened and which client/engagement it relates to, ordered so the most recent is
identifiable. Separately, a distinct **needs-action** grouping surfaces what is waiting on her — blocked
engagements, overdue document requests, and pending new-client requests — so nothing falls through. This is
the aggregation surface that consumes the events the messaging spine (EPIC-016/017) and the reminder engine
(EPIC-019) produce.

## Requirements delivered

- **REQ-DASH-001 — Summary metrics**
  - **AC-DASH-001-01** — the home displays a count of currently active engagements.
  - **AC-DASH-001-02** — it displays a count of overdue engagements.
  - **AC-DASH-001-03** — it displays a count of pending engagement requests.
  - **AC-DASH-001-04** — it displays upcoming deadlines (or a count thereof).
  - **AC-DASH-001-05** — the metrics reflect the current state of the practice at view time.
- **REQ-DASH-002 — Activity feed**
  - **AC-DASH-002-01** — the dashboard shows an activity feed combining recent activity across all clients/engagements in one view.
  - **AC-DASH-002-02** — the feed includes new messages, document uploads, new engagement requests, status changes, and overdue items.
  - **AC-DASH-002-03** — each entry indicates what occurred and the client/engagement it relates to.
  - **AC-DASH-002-04** — entries are ordered so the most recent activity is identifiable.
- **REQ-DASH-003 — Needs-action items**
  - **AC-DASH-003-01** — needs-action items are presented as a distinct grouping, visually separate from the activity feed.
  - **AC-DASH-003-02** — needs-action includes blocked engagements.
  - **AC-DASH-003-03** — needs-action includes overdue document requests.
  - **AC-DASH-003-04** — needs-action includes pending new-client (engagement) requests.

## Architecture adherence
- **ADR-002 — SQL Server.** Summary counts, the activity feed, and needs-action groupings are aggregate
  reads from the relational store.
- **ADR-003 — SESSION_CONTEXT.** Every dashboard query runs under the accountant's propagated identity via
  the `packages/db` wrapper — no direct Prisma access in the route handler.
- **ADR-005 — RLS via security policies.** The accountant's full-practice visibility is realized **through**
  the policy layer under the accountant principal (the same full-visibility property verified in EPIC-010),
  not by bypassing it.
- **ADR-006 — Monorepo, two apps.** The dashboard home is an `apps/admin` surface; nothing here renders on
  `apps/portal`.
- **ADR-012 — Testing pyramid.** Activity-feed composition (which event types appear, ordering) and the
  needs-action grouping are tier-3 integration assertions; the home render and at-a-glance triage are tier-6 e2e.

## Acceptance scenarios

### AC-DASH-001-01 — Active engagement count
```gherkin
Given a set of engagements in various states
When the accountant opens the dashboard home
Then it displays a count of currently active engagements
```

### AC-DASH-001-02 — Overdue engagement count
```gherkin
Given some engagements are overdue
When the accountant opens the dashboard home
Then it displays a count of overdue engagements
```

### AC-DASH-001-03 — Pending request count
```gherkin
Given some engagement requests are pending a decision
When the accountant opens the dashboard home
Then it displays a count of pending engagement requests
```

### AC-DASH-001-04 — Upcoming deadlines
```gherkin
Given engagements with approaching due dates
When the accountant opens the dashboard home
Then it displays the upcoming deadlines or a count of them
```

### AC-DASH-001-05 — Metrics reflect current state
```gherkin
Given the practice state changes (e.g. a request is accepted)
When the accountant next views the dashboard home
Then the summary metrics reflect the current state at view time
```

### AC-DASH-002-01 — Unified activity feed
```gherkin
Given recent activity across multiple clients and engagements
When the accountant views the dashboard
Then a single activity feed combines that activity in one view
```

### AC-DASH-002-02 — Feed includes all event kinds
```gherkin
Given new messages, document uploads, new requests, status changes, and overdue items have occurred
When the accountant views the activity feed
Then entries for each of those kinds appear in the feed
```

### AC-DASH-002-03 — Each entry names what and who
```gherkin
Given an activity-feed entry
When the accountant reads it
Then it indicates what occurred and the client or engagement it relates to
```

### AC-DASH-002-04 — Most recent is identifiable
```gherkin
Given multiple activity-feed entries over time
When the accountant views the feed
Then entries are ordered so the most recent activity is identifiable
```

### AC-DASH-003-01 — Distinct needs-action grouping
```gherkin
Given items requiring the accountant's attention
When she views the dashboard
Then needs-action items are presented as a distinct grouping, visually separate from the activity feed
```

### AC-DASH-003-02 — Blocked engagements in needs-action
```gherkin
Given a blocked engagement
When the accountant views needs-action
Then the blocked engagement appears there
```

### AC-DASH-003-03 — Overdue document requests in needs-action
```gherkin
Given an overdue document request
When the accountant views needs-action
Then the overdue document request appears there
```

### AC-DASH-003-04 — Pending new-client requests in needs-action
```gherkin
Given a pending new-client engagement request
When the accountant views needs-action
Then the pending request appears in needs-action
```

## Traceability & sign-off contract
- Each in-scope AC must be covered by **automated test(s) tagged with its AC id** (the test
  title/annotation contains the `AC-DASH-001-NN` / `-002-NN` / `-003-NN` id), at the prescribed tier(s).
- An AC is **implemented** only when its tagged test(s) **pass in CI**.
- This epic is **delivered** only when **all** its in-scope AC are `verified` in `COVERAGE.md`.
- Suggested tier mapping (per ADR-012):
  - **service integration (tier 3)** — AC-DASH-001-05 (live recompute), AC-DASH-002-01/-02/-04 (feed
    composition + ordering), AC-DASH-003-02/-03/-04 (grouping membership).
  - **e2e (tier 6)** — AC-DASH-001-01/-02/-03/-04 (metrics render), AC-DASH-002-03, AC-DASH-003-01
    (visually distinct grouping).

## Out of scope
- **The client list and the engagement pipeline list/management surfaces** (REQ-DASH-004/-005/-009) →
  **EPIC-021**. This slice is the *home* (metrics + feed + needs-action), not the navigation lists.
- **Source event production** — messages (EPIC-017), overdue detection (EPIC-019), notifications
  (EPIC-016), engagement/request data (EPIC-010/012/003) — already built; this slice **aggregates** them.
- **Configuring reminder cadence** (REQ-DASH-008) → **EPIC-019**.

## Links
- Requirements: REQ-DASH-001, REQ-DASH-002, REQ-DASH-003
- Architecture: ADR-002, ADR-003, ADR-005, ADR-006, ADR-012
- Personas: `personas/jane-accountant.md` (the dashboard is her daily first stop and triage surface)
- Flows: `flows/flow-accountant-dashboard.md` (this slice's primary flow)
- Epics: depends on EPIC-016 (notifications), EPIC-017 (messages in feed), EPIC-019 (overdue in needs-action), EPIC-010/012 (engagements + requests)
- Open questions: none
