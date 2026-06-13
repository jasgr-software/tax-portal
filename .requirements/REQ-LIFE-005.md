---
id: REQ-LIFE-005
title: Completion requires delivery and IRS-filing confirmation
domain: LIFE
type: feature
status: accepted
source:
  - seed/SRS-snapshot.md#REQ-LIFE-005
  - seed/intake.md
open_questions: []
---

# REQ-LIFE-005 — Completion requires delivery and IRS-filing confirmation

## User need
"Complete" should mean the engagement is genuinely finished — the return is in the client's hands and
it has been filed with the tax authority. The accountant doesn't want an engagement marked done
prematurely, because a half-finished engagement that looks complete could cause her to drop work that
still needs filing or delivery.

## Proposed solution
An engagement can only be marked Complete after the accountant has explicitly confirmed two distinct
facts: (1) the return has been delivered to the client, and (2) the return has been filed with the tax
authority. Both confirmations are required before the engagement may move to Complete.

## Acceptance criteria
- **AC-LIFE-005-01** — Marking an engagement Complete requires an explicit accountant confirmation that
  the return has been delivered to the client.
- **AC-LIFE-005-02** — Marking an engagement Complete requires an explicit accountant confirmation that
  the return has been filed with the tax authority.
- **AC-LIFE-005-03** — An engagement cannot be moved to Complete unless both confirmations have been
  recorded.

## Links
- Related: REQ-LIFE-001 (pipeline), REQ-LIFE-006 (reopen a completed engagement)
- Open questions: none
