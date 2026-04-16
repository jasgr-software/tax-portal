# Epic 006 — Engagement Lifecycle

**Epic-type:** feature  
**Epic-deploys:** yes  
**Phase:** 4  
**Status:** Pending (awaiting Epic 003 completion)  
**Priority:** P1

---

## Purpose

Deliver the full engagement lifecycle management: the four-status pipeline, manual status transitions by the accountant, due dates, internal notes, priority flags, the client-facing status labels, multi-participant support, and the completion gate (delivered + filed). This epic makes the engagement the central working object of the portal.

---

## Requirements in scope

| Requirement ID | Summary |
|---|---|
| REQ-LIFE-001 | Four-stage pipeline: New → In Progress → Review → Complete |
| REQ-LIFE-002 | Client-facing status labels (simplified/friendly) |
| REQ-LIFE-003 | Manual status transitions by accountant |
| REQ-LIFE-004 | "Review" is internal only |
| REQ-LIFE-005 | "Complete" requires confirmed delivery AND confirmed IRS filing |
| REQ-LIFE-006 | Only accountant can reopen a completed engagement |
| REQ-LIFE-007 | Due date per engagement |
| REQ-LIFE-008 | Internal notes per engagement (accountant-only) |
| REQ-LIFE-009 | Priority / flag markers per engagement |
| REQ-LIFE-010 | Client may have multiple concurrent engagements (different services) |
| REQ-LIFE-011 | One engagement per service per tax year per client (duplicate prevention) |
| REQ-LIFE-012 | Multiple participants per engagement |

> CLARIF-002 (client-facing status labels) must be resolved before this epic ships.  
> CLARIF-003 (duplicate engagement handling) must be resolved before this epic ships.

---

## Acceptance Criteria

_Placeholder — to be fully detailed by the RA before this epic is handed to the SA._

**Key acceptance criteria to define:**
- AC-006-001: Accountant can move engagement through New → In Progress → Review → Complete with manual transitions
- AC-006-002: Client sees friendly status labels (per CLARIF-002 resolution)
- AC-006-003: Completing an engagement requires both "delivered" and "filed" to be confirmed; partial completion blocked
- AC-006-004: Accountant can reopen a completed engagement; clients cannot
- AC-006-005: Due date field on engagement; dashboard surfaces overdue engagements
- AC-006-006: Internal notes visible only in accountant views
- AC-006-007: Priority/flag toggle per engagement visible in lists
- AC-006-008: Duplicate engagement prevention per CLARIF-003 resolution
- AC-006-009: Adding a participant to an engagement grants them CLIENT-level access to that engagement's data

---

## Dependencies

- Epic 003 completed (onboarding moves engagement to In Progress — lifecycle picks up from there)
- CLARIF-002 and CLARIF-003 must be resolved before implementation begins

---

## Notes for SA

- This epic may be schedulable in parallel with Epics 004 and 005 if those are on separate branches. SA should evaluate.
- The participant model (AC-006-009) has RLS implications — the SA should assess whether a new RLS policy is needed for engagement-scoped participant access.
