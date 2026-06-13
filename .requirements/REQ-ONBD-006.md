---
id: REQ-ONBD-006
title: Onboarding completion moves engagement to In Progress
domain: ONBD
type: feature
status: accepted
source:
  - seed/SRS-snapshot.md#REQ-ONBD-006
  - seed/intake.md
open_questions: []
---

# REQ-ONBD-006 — Onboarding completion moves engagement to In Progress

## User need
Once a client has finished onboarding, the engagement is ready for the accountant to begin the actual
work. The accountant shouldn't have to manually notice that onboarding finished and then move the
engagement forward herself — that hand-off should happen on its own so the engagement reflects its true
state without a manual step.

## Proposed solution
When an engagement's onboarding becomes complete, the engagement's status automatically transitions from
"New" to "In Progress". This is the one automatic status transition in the engagement lifecycle; all
other status changes are made manually by the accountant.

## Acceptance criteria
- **AC-ONBD-006-01** — When an engagement's onboarding becomes complete, its status automatically changes
  from "New" to "In Progress".
- **AC-ONBD-006-02** — This transition occurs without any manual action by the accountant.
- **AC-ONBD-006-03** — The transition occurs only on onboarding completion; an engagement whose
  onboarding is not yet complete remains in "New".

## Links
- Related: REQ-ONBD-005 (onboarding complete), REQ-LIFE-003 (manual status transitions — the lone
  automatic exception)
- Open questions: none
