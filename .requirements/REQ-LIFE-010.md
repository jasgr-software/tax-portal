---
id: REQ-LIFE-010
title: Multiple concurrent engagements per client
domain: LIFE
type: feature
status: accepted
source:
  - seed/SRS-snapshot.md#REQ-LIFE-010
  - seed/intake.md
open_questions: []
---

# REQ-LIFE-010 — Multiple concurrent engagements per client

## User need
A single client may need several different tax services at the same time — for example, a personal
return and a small-business return. The accountant needs each of those tracked as its own engagement so
the work, documents, and messages for one service don't get tangled up with another.

## Proposed solution
A client may have more than one engagement active at the same time, as long as each is for a different
service type. Each engagement is tracked independently with its own status, documents, and messages.

## Acceptance criteria
- **AC-LIFE-010-01** — A single client can have multiple engagements active concurrently, each for a
  different service type.
- **AC-LIFE-010-02** — Each of a client's concurrent engagements is tracked independently of the
  others.

## Links
- Related: REQ-LIFE-011 (one engagement per service type per tax year), REQ-LIFE-001 (per-engagement
  status)
- Open questions: none
