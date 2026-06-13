---
id: REQ-MSG-010
title: Accountant may suppress email notifications
domain: MSG
type: feature
status: accepted
source:
  - seed/SRS-snapshot.md#REQ-MSG-010
  - seed/intake.md
open_questions: []
---

# REQ-MSG-010 — Accountant may suppress email notifications

## User need
The accountant lives in the portal all day, so the email nudge is noise for her. She wants to be able to
turn off email notifications for herself entirely and rely solely on the in-portal feed, without that
affecting how clients are notified.

## Proposed solution
The accountant can suppress her own email notifications entirely. When suppressed, she receives no
notification emails; her in-portal notification feed continues to function unchanged. This setting
governs only the accountant's own email notifications.

## Acceptance criteria
- **AC-MSG-010-01** — The accountant can turn off her own email notifications entirely.
- **AC-MSG-010-02** — While suppressed, the accountant receives no notification emails of any kind.
- **AC-MSG-010-03** — Suppressing email does not affect the accountant's in-portal notification feed,
  which continues to receive all her notifications.
- **AC-MSG-010-04** — The accountant's email-suppression setting does not change whether clients receive
  their own email notifications.

## Links
- Related: REQ-MSG-008 (content-free fallback), REQ-MSG-009 (digest cap), REQ-MSG-011 (client email default)
- Open questions: none
