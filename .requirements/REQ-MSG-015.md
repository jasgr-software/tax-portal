---
id: REQ-MSG-015
title: Notifications marked read when linked item is viewed
domain: MSG
type: feature
status: accepted
source:
  - seed/SRS-snapshot.md#REQ-MSG-015
  - seed/intake.md
open_questions: []
---

# REQ-MSG-015 — Notifications marked read when linked item is viewed

## User need
A notification exists to point a user at something. Once the user has gone and looked at that thing, the
notification has done its job and should not keep nagging. Users should not have to separately dismiss a
notification after they have already acted on it.

## Proposed solution
Each notification references the item that triggered it. When the user views that linked item, the
corresponding notification is automatically marked as read. The user does not need to take a separate
dismiss action for a notification whose item they have already viewed.

## Acceptance criteria
- **AC-MSG-015-01** — A notification is associated with the specific item that triggered it.
- **AC-MSG-015-02** — When the user views a notification's linked item, that notification is marked read
  automatically.
- **AC-MSG-015-03** — A notification marked read in this way is reflected as read in the user's feed and
  in the unread count (REQ-MSG-017) without a separate dismiss step.

## Links
- Related: REQ-MSG-007 (in-portal feed), REQ-MSG-017 (unread count badge), REQ-MSG-005 (thread unread indicators)
- Open questions: none
