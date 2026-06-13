---
id: REQ-LIFE-004
title: Review is an internal accountant stage
domain: LIFE
type: feature
status: accepted
source:
  - seed/SRS-snapshot.md#REQ-LIFE-004
  - seed/intake.md
open_questions: []
---

# REQ-LIFE-004 — Review is an internal accountant stage

## User need
"Review" in this practice means the accountant is checking over her own work before she hands the
return to the client — it is a quality step she performs privately. It is not a step where the client
reviews or approves anything. Surfacing "Review" to the client would wrongly imply the client has
something to do.

## Proposed solution
The Review stage is an internal accountant status signifying she is reviewing her own work before
delivery. It does not represent or require any client action, and it is not presented to the client as
a client-facing review or approval step.

## Acceptance criteria
- **AC-LIFE-004-01** — The Review stage represents the accountant reviewing her own work prior to
  delivering the return to the client.
- **AC-LIFE-004-02** — The Review stage imposes no required action on the client.
- **AC-LIFE-004-03** — The Review stage is not presented to the client as a step where the client
  reviews or approves the work.

## Links
- Related: REQ-LIFE-001 (pipeline), REQ-LIFE-002 (client-facing labels),
  REQ-LIFE-005 (Complete preconditions)
- Open questions: none
