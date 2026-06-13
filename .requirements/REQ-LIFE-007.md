---
id: REQ-LIFE-007
title: Per-engagement due date
domain: LIFE
type: feature
status: accepted
source:
  - seed/SRS-snapshot.md#REQ-LIFE-007
  - seed/intake.md
open_questions: []
---

# REQ-LIFE-007 — Per-engagement due date

## User need
Tax work is deadline-driven. The accountant needs to attach a target date to each engagement so she can
plan her workload, prioritize what's coming up, and avoid missing filing deadlines across many clients.

## Proposed solution
Each engagement can carry a due date that the accountant sets. The due date belongs to the engagement
and can be set and updated by the accountant.

## Acceptance criteria
- **AC-LIFE-007-01** — The accountant can set a due date on an engagement.
- **AC-LIFE-007-02** — The accountant can update an engagement's due date after it has been set.
- **AC-LIFE-007-03** — A due date is an attribute of the individual engagement.

## Notes
- Whether a due date is mandatory at engagement creation is treated as optional in v1 (provisional
  default): the accountant may set it at creation or later. This keeps engagement creation
  lightweight; revisit if deadline tracking needs a guaranteed date.

## Links
- Related: REQ-LIFE-009 (priority/flagging), REQ-DASH-007 (dashboard priority markers)
- Open questions: none
