---
id: REQ-LIFE-001
title: Four-stage engagement status pipeline
domain: LIFE
type: feature
status: accepted
source:
  - seed/SRS-snapshot.md#REQ-LIFE-001
  - seed/intake.md
open_questions: []
---

# REQ-LIFE-001 — Four-stage engagement status pipeline

## User need
The accountant manages many engagements at once and needs a consistent way to know where each one
stands. A shared, well-defined set of stages lets her see at a glance which engagements are waiting to
start, which are being worked, which she is reviewing, and which are finished — so nothing falls
through the cracks.

## Proposed solution
Every engagement carries a status drawn from a fixed four-stage pipeline that advances in order: New →
In Progress → Review → Complete. These are the internal (accountant-facing) stages, and every
engagement is always in exactly one of them.

## Acceptance criteria
- **AC-LIFE-001-01** — Every engagement has exactly one current status at all times, drawn from the
  set: New, In Progress, Review, Complete.
- **AC-LIFE-001-02** — A newly created engagement begins in the New status.
- **AC-LIFE-001-03** — The pipeline's intended forward order is New → In Progress → Review → Complete.

## Links
- Related: REQ-LIFE-002 (client-facing labels), REQ-LIFE-003 (manual transitions),
  REQ-LIFE-004 (Review is internal), REQ-LIFE-005 (Complete preconditions),
  REQ-ONBD-006 (onboarding completion moves New → In Progress)
- Open questions: none
