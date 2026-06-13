---
id: REQ-ONBD-007
title: Accountant notified when onboarding completes
domain: ONBD
type: feature
status: accepted
source:
  - seed/SRS-snapshot.md#REQ-ONBD-007
  - seed/intake.md
open_questions: []
---

# REQ-ONBD-007 — Accountant notified when onboarding completes

## User need
The accountant manages many engagements at once and can't watch each one for the moment a client finishes
getting started. When a client completes onboarding, she needs to be told so she can pick up the
engagement and begin work promptly, without repeatedly checking each client's progress herself.

## Proposed solution
When an engagement's onboarding becomes complete, the accountant receives an in-portal notification that
onboarding for that engagement is done. The notification identifies which engagement and client it
concerns so the accountant can act on it directly.

## Acceptance criteria
- **AC-ONBD-007-01** — When an engagement's onboarding becomes complete, the accountant receives an
  in-portal notification of that completion.
- **AC-ONBD-007-02** — The notification identifies the engagement (and its client) whose onboarding
  completed.

## Links
- Related: REQ-ONBD-005 (onboarding complete), REQ-MSG-013 (notification types — Messaging)
- Open questions: none
