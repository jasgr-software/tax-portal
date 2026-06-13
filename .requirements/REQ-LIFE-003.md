---
id: REQ-LIFE-003
title: Manual status transitions by the accountant
domain: LIFE
type: feature
status: accepted
source:
  - seed/SRS-snapshot.md#REQ-LIFE-003
  - seed/intake.md
open_questions: []
---

# REQ-LIFE-003 — Manual status transitions by the accountant

## User need
The accountant is the one who knows when an engagement has actually moved forward — when she has
started the work, finished her review, or delivered the return. She wants to stay in control of the
pipeline rather than have the system guess and advance engagements on its own, which could mislabel
work that isn't really done.

## Proposed solution
Status transitions through the pipeline are driven manually by the accountant; she advances each
engagement from one stage to the next herself. The system does not move engagements between stages
automatically, with the single exception of onboarding completion, which moves an engagement from New
to In Progress (REQ-ONBD-006).

## Acceptance criteria
- **AC-LIFE-003-01** — The accountant can change an engagement's status to move it through the pipeline.
- **AC-LIFE-003-02** — The system does not automatically advance an engagement from one stage to the
  next, except for the onboarding-completion transition defined in REQ-ONBD-006.
- **AC-LIFE-003-03** — A client cannot change an engagement's status.

## Links
- Related: REQ-LIFE-001 (pipeline), REQ-LIFE-006 (reopen — accountant-only),
  REQ-ONBD-006 (the one automated transition)
- Open questions: none
