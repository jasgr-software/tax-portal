---
id: REQ-ONBD-005
title: Onboarding complete requires all three steps
domain: ONBD
type: feature
status: accepted
source:
  - seed/SRS-snapshot.md#REQ-ONBD-005
  - seed/intake.md
open_questions: []
---

# REQ-ONBD-005 — Onboarding complete requires all three steps

## User need
The accountant needs an unambiguous signal that a client has finished getting started and that she has
everything she asked for up front. "Done with onboarding" should mean the same thing every time: the
agreement is signed, the background information is in, and the first documents are provided — not just
some of those.

## Proposed solution
An engagement's onboarding is "complete" only when all three onboarding steps are satisfied: the
engagement letter is e-signed, the intake questionnaire is submitted, and the initial documents are
uploaded. If any one of the three is unsatisfied, onboarding is not complete.

## Acceptance criteria
- **AC-ONBD-005-01** — Onboarding is marked complete only when the engagement letter is e-signed, the
  intake questionnaire is submitted, and the initial documents are uploaded.
- **AC-ONBD-005-02** — If any one of the three steps is not yet satisfied, onboarding is not complete.

## Links
- Related: REQ-ONBD-002 (letter gate), REQ-ONBD-003 (questionnaire), REQ-ONBD-004 (document upload),
  REQ-ONBD-006 (status transition on completion), REQ-ONBD-007 (accountant notified on completion)
- Open questions: none
