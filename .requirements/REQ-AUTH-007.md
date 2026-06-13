---
id: REQ-AUTH-007
title: Multiple participants per engagement
domain: AUTH
type: feature
status: accepted
source:
  - seed/SRS-snapshot.md#REQ-AUTH-007
  - seed/intake.md
open_questions: []
---

# REQ-AUTH-007 — Multiple participants per engagement

## User need
Some engagements naturally involve more than one person — most commonly a married couple filing jointly.
Each of them needs their own way into the portal, with their own identity and their own sign-in, rather
than passing a single shared login back and forth. Shared credentials are insecure and make it
impossible to tell who did what.

## Proposed solution
A single engagement may have more than one CLIENT participant. Each participant has their own distinct
portal account and accesses the shared engagement through it; participants are never represented as a
single shared account.

## Acceptance criteria
- **AC-AUTH-007-01** — A single engagement may have more than one CLIENT participant.
- **AC-AUTH-007-02** — Each participant in such an engagement has their own distinct portal account and
  credentials; participants do not share one account.
- **AC-AUTH-007-03** — Each participant reaches the shared engagement through their own account, and
  (per REQ-AUTH-003) sees that engagement but no unrelated client's data.

## Links
- Related: REQ-AUTH-003 (clients see only their own data), REQ-LIFE-012 (engagement participants —
  Engagement Lifecycle domain)
- Open questions: none
