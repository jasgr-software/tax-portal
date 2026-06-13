---
id: REQ-MSG-014
title: Notification types received by the client
domain: MSG
type: feature
status: accepted
source:
  - seed/SRS-snapshot.md#REQ-MSG-014
  - seed/intake.md
open_questions: []
---

# REQ-MSG-014 — Notification types received by the client

## User need
A client needs to know when there is something for them to see or do — a reply from the accountant, a
request for documents, a change in where their work stands, a finished deliverable, or the outcome of
their engagement request — so they can respond promptly without constantly checking the portal.

## Proposed solution
A client receives an in-portal notification for each of the following event types: a new message is
received; a document request is created for them; the status of their engagement changes; a deliverable
is ready; their engagement request is accepted; and their engagement request is declined.

## Acceptance criteria
- **AC-MSG-014-01** — A client receives a notification when a new message is received.
- **AC-MSG-014-02** — A client receives a notification when a document request is created for them.
- **AC-MSG-014-03** — A client receives a notification when the status of their engagement changes.
- **AC-MSG-014-04** — A client receives a notification when a deliverable is ready for them.
- **AC-MSG-014-05** — A client receives a notification when their engagement request is accepted.
- **AC-MSG-014-06** — A client receives a notification when their engagement request is declined.
- **AC-MSG-014-07** — A client receives notifications only for events concerning their own engagements
  and requests.

## Links
- Related: REQ-MSG-013 (accountant notification types), REQ-AUTH-003 (client data restriction)
- Open questions: none
