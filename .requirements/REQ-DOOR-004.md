---
id: REQ-DOOR-004
title: Prospective client submits an engagement request, no account
domain: DOOR
type: feature
status: accepted
source:
  - seed/SRS-snapshot.md#REQ-DOOR-004
  - seed/intake.md
open_questions: []
---

# REQ-DOOR-004 — Prospective client submits an engagement request, no account

## User need
A prospective client who has decided they want the accountant's help needs a low-friction way to raise
their hand. They should be able to say which services they need and how to reach them, and send that
request, without the burden of creating an account before they even know whether the accountant will
take them on.

## Proposed solution
From the public front door, a prospective client selects one or more services from the checklist and
submits basic contact information to create an engagement request. No account is created at this step;
the request is captured and routed to the accountant for review. Account creation, if any, happens only
later, after the accountant accepts.

## Acceptance criteria
- **AC-DOOR-004-01** — A prospective client can select one or more services on the request form.
- **AC-DOOR-004-02** — The prospective client provides basic contact information as part of the request.
- **AC-DOOR-004-03** — Submitting the form creates an engagement request in a pending (awaiting-review)
  state.
- **AC-DOOR-004-04** — No account is created for the prospective client at request-submission time.
- **AC-DOOR-004-05** — A request cannot be submitted with zero services selected.

## Links
- Related: REQ-DOOR-003 (checklist form), REQ-DOOR-005 (accountant notified), REQ-DOOR-006 (accept/decline)
- Open questions: none

## Notes
- "Basic contact information" is treated as the minimum needed for the accountant to identify and reach
  the requester (e.g. name and a contact method); the exact field set is a routine product detail and
  not constrained further here.
