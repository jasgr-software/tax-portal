---
id: REQ-MSG-012
title: Notifications delivered in real time
domain: MSG
type: feature
status: accepted
source:
  - seed/SRS-snapshot.md#REQ-MSG-012
  - seed/intake.md
open_questions: []
---

# REQ-MSG-012 — Notifications delivered in real time

## User need
Because the portal is the accountant's live work surface, she expects it to feel current — when
something happens, she wants to see it appear without having to reload or go looking. Clients likewise
benefit from seeing new activity surface promptly while they have the portal open.

## Proposed solution
Notifications are delivered to a user in real time. When a notification-worthy event occurs, it surfaces
in the recipient's in-portal notification feed promptly and without the user taking an action to refresh
or re-check. The user sees new notifications appear while the portal is open.

## Acceptance criteria
- **AC-MSG-012-01** — When a user is entitled to a notification, it surfaces in their in-portal feed
  promptly after the triggering event, without the user manually refreshing.
- **AC-MSG-012-02** — A user with the portal open sees new notifications appear in real time as events
  occur.
- **AC-MSG-012-03** — The unread count badge (REQ-MSG-017) reflects real-time arrival of new
  notifications.

## Links
- Related: REQ-MSG-007 (in-portal feed primary), REQ-MSG-017 (unread count badge), REQ-MSG-013/014 (notification types)
- Open questions: none
