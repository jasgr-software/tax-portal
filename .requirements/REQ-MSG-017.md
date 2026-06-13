---
id: REQ-MSG-017
title: Persistent unread count badge in navigation
domain: MSG
type: feature
status: accepted
source:
  - seed/SRS-snapshot.md#REQ-MSG-017
  - seed/intake.md
open_questions: []
---

# REQ-MSG-017 — Persistent unread count badge in navigation

## User need
Whatever part of the portal a user is in, they want a constant, glanceable signal of how much is waiting
for their attention — without navigating to the notification feed to find out. A running unread count in
the navigation keeps that awareness present at all times.

## Proposed solution
An unread notification count badge is shown in the navigation and is visible at all times to
authenticated users, regardless of which area of the portal they are viewing. The badge reflects the
user's current number of unread notifications and updates as notifications are read or arrive.

## Acceptance criteria
- **AC-MSG-017-01** — An unread notification count badge is present in the navigation and visible to an
  authenticated user from any area of the portal.
- **AC-MSG-017-02** — The badge shows the count of the user's unread notifications.
- **AC-MSG-017-03** — The badge updates as notifications become read (per REQ-MSG-015) or as new
  notifications arrive (per REQ-MSG-012).

## Links
- Related: REQ-MSG-012 (real-time delivery), REQ-MSG-015 (mark read on view), REQ-MSG-007 (in-portal feed)
- Open questions: none
