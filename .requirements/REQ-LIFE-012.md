---
id: REQ-LIFE-012
title: Multiple participants per engagement
domain: LIFE
type: feature
status: accepted
source:
  - seed/SRS-snapshot.md#REQ-LIFE-012
  - seed/intake.md
open_questions: []
---

# REQ-LIFE-012 — Multiple participants per engagement

## User need
Some engagements naturally involve more than one person — for example, a married couple filing jointly.
Each person needs their own way into the portal and their own view of the shared engagement, rather
than sharing one login. The accountant needs to associate all the relevant people with the single
engagement that covers their joint work.

## Proposed solution
An engagement may have more than one participant. Each participant is a separate portal account linked
to the engagement, not a shared account. All participants linked to an engagement are associated with
that same engagement and its work.

## Acceptance criteria
- **AC-LIFE-012-01** — An engagement can have more than one participant linked to it.
- **AC-LIFE-012-02** — Each participant is a separate portal account, not a shared login.
- **AC-LIFE-012-03** — All participants linked to an engagement are associated with that same
  engagement.

## Links
- Related: REQ-AUTH-007 (engagement participants are separate accounts), REQ-LIFE-010 (a client's
  engagements)
- Open questions: none
