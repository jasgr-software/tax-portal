---
id: REQ-DOOR-009
title: Returning client requests a new engagement from inside the portal
domain: DOOR
type: feature
status: accepted
source:
  - seed/SRS-snapshot.md#REQ-DOOR-009
  - seed/intake.md
open_questions: []
---

# REQ-DOOR-009 — Returning client requests a new engagement from inside the portal

## User need
An existing client who already has an account shouldn't have to go back out to the public front door and
re-enter contact details every year. When they need another service, they want to ask for it from inside
the portal where the accountant already knows who they are.

## Proposed solution
A signed-in existing client can submit a new engagement request from within the client surface through a
simplified flow. Because the accountant already has the client's identity and contact details, the flow
focuses on selecting the services needed and does not re-collect the basic contact information required
of an anonymous first-time requester.

## Acceptance criteria
- **AC-DOOR-009-01** — A signed-in existing client can start a new engagement request from inside the
  client surface.
- **AC-DOOR-009-02** — The returning-client flow lets the client select one or more active services.
- **AC-DOOR-009-03** — The returning-client flow does not require the client to re-enter the basic
  contact information already on file.
- **AC-DOOR-009-04** — A request submitted this way is routed to the accountant for review the same way
  a front-door request is.

## Links
- Related: REQ-DOOR-004 (anonymous request), REQ-DOOR-006 (accept/decline), REQ-DOOR-010 (accountant-initiated)
- Open questions: none
