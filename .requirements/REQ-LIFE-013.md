---
id: REQ-LIFE-013
title: Outstanding-question tracking
domain: LIFE
type: feature
status: accepted
source:
  - seed/vision-expansion.md#biggest-opportunity
  - seed/vision-expansion.md#author-guidance-notes
open_questions: []
---

# REQ-LIFE-013 — Outstanding-question tracking

## User need
Beyond documents, the accountant routinely needs answers from a client — "did you sell any property this
year?", "confirm your dependents." Today those live buried in message threads, where they are easy to lose
track of and the client cannot tell at a glance what is still waiting on them. The accountant wants
outstanding questions tracked as first-class items, separate from chat, so both she and the client can see
which questions are still unanswered and which are resolved.

## Proposed solution
The system lets the accountant raise outstanding questions against an engagement as discrete, tracked items,
each with a state of unanswered or answered/resolved. The client can see the questions awaiting their
response and provide answers; answering moves a question to resolved. Outstanding questions are surfaced to
both parties as needs-action items, distinct from the free-form message thread (REQ-MSG-001). This gives the
practice a structured ledger of what is still owed *as answers* by the client, in the way document requests
(REQ-FILE-007) already do for files.

## Acceptance criteria
- **AC-LIFE-013-01** — The accountant can raise a question against an engagement as a discrete tracked item,
  separate from the message thread.
- **AC-LIFE-013-02** — Each tracked question has a clear state distinguishing unanswered from
  answered/resolved.
- **AC-LIFE-013-03** — The client can see the questions awaiting their response for their engagement.
- **AC-LIFE-013-04** — When the client provides an answer, the question's state reflects that it has been
  answered/resolved, and the answer is recorded against the engagement.
- **AC-LIFE-013-05** — Outstanding (unanswered) questions are surfaced as needs-action items to the
  accountant and as items needed from the client.

## Notes
- **v2 capability.** Parallels document requests (REQ-FILE-007/008) but for questions rather than files.
- Feeds the consolidated client-facing "what's needed from you" surface and the proactive follow-up engine
  (REQ-MSG-019). Distinct from plain messaging (REQ-MSG-001/003).

## Links
- Related: REQ-MSG-001 (per-engagement message thread), REQ-FILE-007 (document requests — the file analogue),
  REQ-MSG-019 (proactive follow-up engine), REQ-DASH-003 (needs-action items)
- Open questions: none
