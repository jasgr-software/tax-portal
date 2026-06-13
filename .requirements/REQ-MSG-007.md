---
id: REQ-MSG-007
title: In-portal notification feed is the primary channel
domain: MSG
type: feature
status: accepted
source:
  - seed/SRS-snapshot.md#REQ-MSG-007
  - seed/intake.md
open_questions: []
---

# REQ-MSG-007 — In-portal notification feed is the primary channel

## User need
The portal is the accountant's daily work surface. She wants to come into one place and see everything
that needs her attention, rather than chasing notifications across email and other channels. The portal
itself, not email, should be where notifications live and where work is picked up.

## Proposed solution
The in-portal notification feed is the primary notification channel for all users. Every notification a
user is entitled to receive appears in their in-portal feed. Other channels (such as email) are
secondary and serve only to draw the user back to the portal — the feed is the authoritative place to
see and act on notifications.

## Acceptance criteria
- **AC-MSG-007-01** — Every notification a user is entitled to receive appears in that user's in-portal
  notification feed.
- **AC-MSG-007-02** — The in-portal feed is the authoritative, complete record of a user's
  notifications; no notification exists only outside the portal.
- **AC-MSG-007-03** — Any other notification channel is supplementary to, and does not replace, the
  in-portal feed.

## Links
- Related: REQ-MSG-008 (email fallback nudge), REQ-MSG-012 (real-time delivery), REQ-MSG-017 (unread count badge)
- Open questions: none
