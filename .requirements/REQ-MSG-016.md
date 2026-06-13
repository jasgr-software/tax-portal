---
id: REQ-MSG-016
title: Notification history retained at least 90 days
domain: MSG
type: constraint
status: accepted
source:
  - seed/SRS-snapshot.md#REQ-MSG-016
  - seed/intake.md
open_questions: []
---

# REQ-MSG-016 — Notification history retained at least 90 days

## User need
A user may not act on a notification immediately, and may want to look back at what they were alerted to
over recent weeks. Notifications should stick around long enough to serve as a usable recent-activity
record, not vanish as soon as they are read.

## Proposed solution
Notification history is retained for at least 90 days. A user can see their notifications — read and
unread — for at least the most recent 90 days. Retention beyond 90 days is permitted but the minimum
guarantee is 90 days.

## Acceptance criteria
- **AC-MSG-016-01** — A user's notification history is retained and viewable for a minimum of 90 days
  from the time each notification was generated.
- **AC-MSG-016-02** — Both read and unread notifications are retained for at least this 90-day window.

## Notes
- This minimum-retention period is a data-retention policy and is flagged for product-owner confirmation
  (see NEW_OPEN_QUESTIONS). The provisional value follows the seed: a 90-day floor. Note this governs
  notification records specifically; message threads themselves are retained indefinitely (REQ-MSG-006).

## Links
- Related: REQ-MSG-006 (message threads kept forever), REQ-MSG-007 (in-portal feed)
- Open questions: none
