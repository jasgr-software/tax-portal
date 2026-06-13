---
id: REQ-LIFE-008
title: Accountant-only internal notes per engagement
domain: LIFE
type: feature
status: accepted
source:
  - seed/SRS-snapshot.md#REQ-LIFE-008
  - seed/intake.md
open_questions: []
---

# REQ-LIFE-008 — Accountant-only internal notes per engagement

## User need
While working an engagement the accountant needs a private scratchpad — reminders, observations, and
working notes that help her do the job but are never meant for the client's eyes. These notes are for
her own use and must stay confidential to her.

## Proposed solution
Each engagement can hold internal notes authored by the accountant. These notes are visible only to the
accountant and are never exposed to the client or any engagement participant.

## Acceptance criteria
- **AC-LIFE-008-01** — The accountant can record internal notes on an engagement.
- **AC-LIFE-008-02** — Internal notes are visible only to the accountant.
- **AC-LIFE-008-03** — Internal notes are never shown to a client or any engagement participant.

## Links
- Related: REQ-DASH-006 (internal notes surfaced on the accountant dashboard)
- Open questions: none
