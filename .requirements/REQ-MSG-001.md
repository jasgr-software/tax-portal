---
id: REQ-MSG-001
title: Per-engagement message thread
domain: MSG
type: feature
status: accepted
source:
  - seed/SRS-snapshot.md#REQ-MSG-001
  - seed/intake.md
open_questions: []
---

# REQ-MSG-001 — Per-engagement message thread

## User need
The accountant and her clients need a single place to talk about the work on a specific engagement,
replacing scattered email. All correspondence about that engagement should live together so either
party can scroll back and see the full history of what was said, in order, at any time.

## Proposed solution
Every engagement has its own dedicated message thread. Messages sent within an engagement are recorded
in that engagement's thread and retained as a persistent, ordered conversation history. The history is
available to the engagement's participants whenever they view the thread.

## Acceptance criteria
- **AC-MSG-001-01** — Each engagement has exactly one dedicated message thread associated with it.
- **AC-MSG-001-02** — A message sent in an engagement's thread is recorded in that thread and visible to
  the engagement's participants.
- **AC-MSG-001-03** — The thread preserves the full conversation history in the order messages were
  sent, and the history persists across sessions.
- **AC-MSG-001-04** — Both the accountant and the client participant(s) of the engagement can read and
  contribute to the engagement's thread.

## Links
- Related: REQ-MSG-002 (general threads), REQ-MSG-006 (threads kept forever), REQ-AUTH-007 (engagement participants)
- Open questions: none
