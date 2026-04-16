# Epic 007 — Accountant Dashboard & Admin UI

**Epic-type:** feature  
**Epic-deploys:** yes  
**Phase:** 5  
**Status:** Pending (awaiting Epics 004, 005, 006 completion)  
**Priority:** P1

---

## Purpose

Deliver the complete accountant-facing work surface: the dashboard home with summary metrics and activity feed, client list, engagement pipeline list, "Needs action" panel, and all remaining admin UI surfaces not delivered in earlier epics. This is the accountant's daily driver.

---

## Requirements in scope

| Requirement ID | Summary |
|---|---|
| REQ-DASH-001 | Dashboard home: summary metrics (active, overdue, pending, upcoming) |
| REQ-DASH-002 | Activity feed: unified view of all recent activity |
| REQ-DASH-003 | "Needs action" panel: blocked engagements, overdue docs, pending requests |
| REQ-DASH-004 | Client list: searchable, filterable by service type and tax year |
| REQ-DASH-005 | Engagement list: pipeline view with status, filterable |
| REQ-DASH-006 | Internal notes per engagement (surfaced in engagement detail view) |
| REQ-DASH-007 | Priority/flag markers manageable from dashboard |
| REQ-DASH-008 | Auto-reminder frequency configuration (global + per engagement) |
| REQ-DASH-009 | Pipeline view of all engagements |

---

## Acceptance Criteria

_Placeholder — to be fully detailed by the RA before this epic is handed to the SA._

**Key acceptance criteria to define:**
- AC-007-001: Dashboard home displays correct metric counts (active, overdue, pending requests, upcoming deadlines within 7 days)
- AC-007-002: Activity feed shows real entries sorted by recency; empty state handled
- AC-007-003: Needs action items surface correctly; count matches actual unresolved items
- AC-007-004: Client list search works across name and email; filters apply correctly
- AC-007-005: Engagement list filters by status, service type, tax year
- AC-007-006: Pipeline view groups engagements by status column
- AC-007-007: Overdue reminder configuration UI (global days setting + per-engagement override)

---

## Dependencies

- Epics 004, 005, 006 completed (data exists to populate the dashboard)

---

## Notes for SA

- This is the integration epic — it wires together data produced by all prior epics into a unified view. The webapp developer should have full context of all prior task outputs before working this epic.
