---
id: REQ-MSG-013
title: Notification types received by the accountant
domain: MSG
type: feature
status: accepted
source:
  - seed/SRS-snapshot.md#REQ-MSG-013
  - seed/intake.md
open_questions: []
---

# REQ-MSG-013 — Notification types received by the accountant

## User need
The accountant needs to be alerted to every kind of event that may require her attention across the
practice — a prospect reaching out, a client replying, documents arriving, onboarding finishing, work
falling overdue, or a deadline approaching — so nothing slips through and she always knows what needs
action.

## Proposed solution
The accountant receives an in-portal notification for each of the following event types: a new service
request is submitted; a new message is received; a document is uploaded; onboarding is completed for an
engagement; a document request becomes overdue; and an engagement is approaching its due date.

## Acceptance criteria
- **AC-MSG-013-01** — The accountant receives a notification when a new service request is submitted.
- **AC-MSG-013-02** — The accountant receives a notification when a new message is received.
- **AC-MSG-013-03** — The accountant receives a notification when a document is uploaded.
- **AC-MSG-013-04** — The accountant receives a notification when onboarding is completed for an
  engagement.
- **AC-MSG-013-05** — The accountant receives a notification when a document request becomes overdue.
- **AC-MSG-013-06** — The accountant receives a notification when an engagement is approaching its due
  date.

## Links
- Related: REQ-MSG-014 (client notification types), REQ-DOOR-005 (new request), REQ-ONBD-007 (onboarding complete), REQ-FILE-012 / REQ-MSG-018 (overdue reminders)
- Open questions: none
