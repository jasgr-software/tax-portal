---
id: REQ-MSG-009
title: Email digest at most once per day
domain: MSG
type: constraint
status: accepted
source:
  - seed/SRS-snapshot.md#REQ-MSG-009
  - seed/intake.md
open_questions: []
---

# REQ-MSG-009 — Email digest at most once per day

## User need
Users should not be flooded with email. A separate email for every event would recreate the noisy inbox
the portal is meant to eliminate, and would train people to ignore the nudge. At most a single, batched
reminder per day is enough to draw someone back to the portal.

## Proposed solution
Email notifications are batched into a daily digest nudge. The system sends at most one notification
email per recipient per day; it never sends a separate email per event. Multiple notifications occurring
within a day are represented by no more than that single daily nudge.

## Acceptance criteria
- **AC-MSG-009-01** — A recipient receives at most one notification email per day.
- **AC-MSG-009-02** — The system does not send a separate email for each individual notification event.
- **AC-MSG-009-03** — When multiple notification-worthy events occur for a recipient within a day, they
  result in no more than one email nudge for that day (which, per REQ-MSG-008, still carries no activity
  detail).

## Links
- Related: REQ-MSG-008 (content-free fallback), REQ-MSG-010 (suppress email), REQ-MSG-011 (client email default)
- Open questions: none
