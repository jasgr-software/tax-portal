---
id: REQ-DOOR-010
title: Accountant initiates an engagement on a client's behalf
domain: DOOR
type: feature
status: accepted
source:
  - seed/SRS-snapshot.md#REQ-DOOR-010
  - seed/intake.md
open_questions: []
---

# REQ-DOOR-010 — Accountant initiates an engagement on a client's behalf

## User need
Often the accountant, not the client, is the one who knows new work is needed — a client mentions it in
passing, or a recurring annual return comes due. She needs to be able to start the engagement herself
for an existing client rather than waiting for the client to file a request through the front door.

## Proposed solution
From her accountant surface, the accountant can directly initiate a new engagement on behalf of an
existing client, selecting the services involved. Because she is starting it herself, the engagement
begins without the prospect-facing accept/decline step — she has already decided to do the work.

## Acceptance criteria
- **AC-DOOR-010-01** — The accountant can initiate a new engagement for an existing client from her
  accountant surface.
- **AC-DOOR-010-02** — The accountant selects one or more active services for the engagement she
  initiates.
- **AC-DOOR-010-03** — An accountant-initiated engagement does not require an accept/decline review
  step, since the accountant is the originator.
- **AC-DOOR-010-04** — The initiated engagement is associated with the chosen existing client.

## Links
- Related: REQ-DOOR-006 (accept/decline for prospect requests), REQ-DOOR-009 (client self-initiated), REQ-LIFE-001 (engagement lifecycle)
- Open questions: none
