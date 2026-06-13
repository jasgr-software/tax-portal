---
id: REQ-FILE-012
title: Overdue document requests are flagged with configurable reminders
domain: FILE
type: feature
status: accepted
source:
  - seed/SRS-snapshot.md#REQ-FILE-012
  - seed/intake.md
open_questions: []
---

# REQ-FILE-012 — Overdue document requests are flagged with configurable reminders

## User need
Clients forget to send requested documents, and chasing them by hand is exactly the manual work the
portal is meant to remove. The accountant needs the system to notice when a document request has gone
unfulfilled too long and to nudge automatically — at a cadence she can tune, since some clients and some
engagements need gentler or firmer follow-up than others.

## Proposed solution
The system automatically flags document requests that have become overdue (requested but not fulfilled
within the expected window). The reminder cadence for overdue document requests is configurable by the
accountant, either globally as a default or per engagement to override the default.

## Acceptance criteria
- **AC-FILE-012-01** — A document request that remains unfulfilled past its expected window is flagged
  as overdue.
- **AC-FILE-012-02** — The system automatically surfaces overdue document requests without the
  accountant having to check each one manually.
- **AC-FILE-012-03** — The accountant can configure the reminder cadence for overdue document requests
  as a global default.
- **AC-FILE-012-04** — The accountant can configure the reminder cadence per engagement, overriding the
  global default for that engagement.

## Notes
- "Expected window" for a request: the seed does not define how a request's due point is set. Provisional
  default — a request becomes overdue relative to a due point the accountant can set on the request,
  falling back to a global default interval after creation when none is set. See NEW_OPEN_QUESTIONS.

## Links
- Related: REQ-FILE-007 (document requests), REQ-FILE-008 (checklist), REQ-MSG-018 (reminder engine),
  REQ-DASH-008 (accountant configures reminder frequency)
- Open questions: none
