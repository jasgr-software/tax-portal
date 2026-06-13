---
id: REQ-MSG-018
title: Auto-reminders for overdue document requests
domain: MSG
type: feature
status: accepted
source:
  - seed/SRS-snapshot.md#REQ-MSG-018
  - seed/intake.md
open_questions: []
---

# REQ-MSG-018 — Auto-reminders for overdue document requests

## User need
Clients sometimes let document requests slip past their due date, and the accountant does not want to
chase each one by hand. She needs the system to notice overdue document requests on its own and surface
reminders, and she needs control over how often those reminders go out so they nudge without nagging.

## Proposed solution
The system automatically detects document requests that have become overdue and raises reminders about
them, without the accountant manually checking. The frequency at which reminders are raised is
configurable by the accountant, both as a global default and overridden per individual engagement.

## Acceptance criteria
- **AC-MSG-018-01** — The system automatically identifies document requests that are overdue without the
  accountant initiating the check.
- **AC-MSG-018-02** — An overdue document request results in a reminder being raised.
- **AC-MSG-018-03** — The accountant can configure the reminder frequency as a global default.
- **AC-MSG-018-04** — The accountant can override the reminder frequency for an individual engagement,
  taking precedence over the global default for that engagement.

## Notes
- "Reminder" here is the trigger that drives the overdue notifications in REQ-MSG-013 (accountant) and
  the document-request notifications a client sees; this requirement covers the automatic detection and
  the configurable cadence, not a new channel.

## Links
- Related: REQ-FILE-012 (overdue document request flagging), REQ-DASH-008 (configure reminder frequency), REQ-MSG-013 (accountant overdue notification)
- Open questions: none
