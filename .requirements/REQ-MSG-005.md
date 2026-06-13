---
id: REQ-MSG-005
title: Unread indicators on message threads
domain: MSG
type: feature
status: accepted
source:
  - seed/SRS-snapshot.md#REQ-MSG-005
  - seed/intake.md
open_questions: []
---

# REQ-MSG-005 — Unread indicators on message threads

## User need
The accountant juggles many client conversations at once and needs to see at a glance which threads
have something new in them since she last looked. Without an unread marker she would have to open every
thread to check — exactly the friction the portal is meant to remove.

## Proposed solution
Every message thread shows an unread indicator when it contains messages the viewer has not yet seen.
The indicator distinguishes threads with new activity from threads the viewer is already caught up on,
and it clears for a thread once the viewer has seen its new messages.

## Acceptance criteria
- **AC-MSG-005-01** — A thread that contains messages the current viewer has not yet read displays an
  unread indicator to that viewer.
- **AC-MSG-005-02** — The unread indicator is shown on all message threads, both engagement and general.
- **AC-MSG-005-03** — The unread state is per-viewer: a thread can be unread for one participant while
  read for another.
- **AC-MSG-005-04** — Once the viewer has seen a thread's new messages, the unread indicator clears for
  that viewer.

## Links
- Related: REQ-MSG-001 (engagement thread), REQ-MSG-002 (general threads), REQ-MSG-017 (unread count badge)
- Open questions: none
