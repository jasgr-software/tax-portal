---
id: REQ-LIFE-006
title: Only the accountant can reopen a completed engagement
domain: LIFE
type: feature
status: accepted
source:
  - seed/SRS-snapshot.md#REQ-LIFE-006
  - seed/intake.md
open_questions: []
---

# REQ-LIFE-006 — Only the accountant can reopen a completed engagement

## User need
Sometimes work has to resume after an engagement is finished — for example, an amended return. The
accountant needs to be able to reopen a completed engagement so she can pick the work back up. Clients,
however, should not be able to reactivate finished work on their own; reopening is a professional
judgment the accountant makes.

## Proposed solution
A completed engagement can be reopened, returning it to active work, but only the accountant can
perform this action. Clients have no ability to reopen a completed engagement.

## Acceptance criteria
- **AC-LIFE-006-01** — The accountant can reopen an engagement that is in the Complete status, moving
  it back into active work.
- **AC-LIFE-006-02** — A client cannot reopen a completed engagement.

## Links
- Related: REQ-LIFE-005 (completion preconditions), REQ-LIFE-003 (manual transitions)
- Open questions: none
