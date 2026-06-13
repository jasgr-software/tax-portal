---
id: REQ-DOOR-005
title: Accountant notified of a new engagement request
domain: DOOR
type: feature
status: accepted
source:
  - seed/SRS-snapshot.md#REQ-DOOR-005
  - seed/intake.md
open_questions: []
---

# REQ-DOOR-005 — Accountant notified of a new engagement request

## User need
The accountant cannot watch the front door all day. When a prospective client submits a request, she
needs to be told about it promptly inside her work surface so it doesn't sit unseen and the prospect
isn't left waiting.

## Proposed solution
When a new engagement request is submitted, the accountant receives an in-portal notification surfacing
the new request so she can review it. The notification appears on her accountant surface as part of her
needs-action awareness.

## Acceptance criteria
- **AC-DOOR-005-01** — Submitting a new engagement request generates an in-portal notification for the
  accountant.
- **AC-DOOR-005-02** — The notification identifies that a new engagement request has arrived and leads
  the accountant to review it.
- **AC-DOOR-005-03** — The notification is delivered to the accountant only, not to clients or the
  anonymous requester.

## Links
- Related: REQ-DOOR-004 (request submitted), REQ-DOOR-006 (accept/decline), REQ-MSG-013 (notification delivery)
- Open questions: none
