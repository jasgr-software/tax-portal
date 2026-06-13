---
id: REQ-DOOR-006
title: Accountant accepts or declines each request
domain: DOOR
type: feature
status: accepted
source:
  - seed/SRS-snapshot.md#REQ-DOOR-006
  - seed/intake.md
open_questions: []
---

# REQ-DOOR-006 — Accountant accepts or declines each request

## User need
The accountant chooses which prospective clients she takes on. For every incoming request she needs a
clear decision point — take this on, or turn it down — so her pipeline reflects only the work she has
agreed to do and nothing lingers in limbo.

## Proposed solution
From her accountant surface, the accountant reviews each pending engagement request and either accepts
or declines it. The request's state reflects her decision. Acceptance and decline each trigger their
own downstream follow-up (see REQ-DOOR-007 and REQ-DOOR-008).

## Acceptance criteria
- **AC-DOOR-006-01** — The accountant can view each pending engagement request and its submitted details.
- **AC-DOOR-006-02** — The accountant can accept a pending request, moving it to an accepted state.
- **AC-DOOR-006-03** — The accountant can decline a pending request, moving it to a declined state.
- **AC-DOOR-006-04** — Each request can be decided (accepted or declined) by the accountant only.
- **AC-DOOR-006-05** — Once decided, a request is no longer pending and is not awaiting a second
  accept/decline decision.

## Links
- Related: REQ-DOOR-005 (notification), REQ-DOOR-007 (on acceptance), REQ-DOOR-008 (on decline)
- Open questions: none
