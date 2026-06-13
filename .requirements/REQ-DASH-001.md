---
id: REQ-DASH-001
title: Dashboard summary metrics
domain: DASH
type: feature
status: accepted
source:
  - seed/SRS-snapshot.md#REQ-DASH-001
  - seed/intake.md
open_questions: []
---

# REQ-DASH-001 — Dashboard summary metrics

## User need
The accountant runs the whole practice herself and opens the dashboard as her first stop each day. She
needs an at-a-glance picture of where things stand — how much active work is in flight, what's slipping,
what's waiting on her, and what's coming due — without hunting through individual screens to assemble it.

## Proposed solution
The accountant dashboard presents a set of summary metrics prominently at the top of its home screen.
The metrics give a current count of active engagements, overdue engagements, pending engagement
requests, and upcoming deadlines. The figures reflect the live state of the practice each time the
dashboard is viewed.

## Acceptance criteria
- **AC-DASH-001-01** — The dashboard home screen displays a count of currently active engagements.
- **AC-DASH-001-02** — The dashboard home screen displays a count of overdue engagements.
- **AC-DASH-001-03** — The dashboard home screen displays a count of pending engagement requests.
- **AC-DASH-001-04** — The dashboard home screen displays the upcoming deadlines (or a count thereof).
- **AC-DASH-001-05** — The summary metrics reflect the current state of the practice at the time the
  dashboard is viewed.

## Links
- Related: REQ-DASH-002 (activity feed), REQ-DASH-003 (needs-action items)
- Open questions: none
