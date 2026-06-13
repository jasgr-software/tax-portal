---
id: REQ-DASH-006
title: Accountant-only internal notes
domain: DASH
type: feature
status: accepted
source:
  - seed/SRS-snapshot.md#REQ-DASH-006
  - seed/intake.md
open_questions: []
---

# REQ-DASH-006 — Accountant-only internal notes

## User need
While working an engagement the accountant needs a private place to record her own working notes —
reminders, observations, context — that are strictly for her and must never be seen by the client.

## Proposed solution
Each engagement supports internal notes that belong to the accountant. These notes are visible only on
the accountant surface and are never exposed to the client on any surface. The accountant can read and
maintain the internal notes for an engagement.

## Acceptance criteria
- **AC-DASH-006-01** — An engagement can carry internal notes authored and viewed by the accountant.
- **AC-DASH-006-02** — Internal notes are visible only to the accountant and are never shown to the
  client on any surface.

## Links
- Related: REQ-LIFE-008 (internal notes — engagement lifecycle)
- Open questions: none
