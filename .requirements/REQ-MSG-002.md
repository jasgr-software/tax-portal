---
id: REQ-MSG-002
title: General message threads outside an engagement
domain: MSG
type: feature
status: accepted
source:
  - seed/SRS-snapshot.md#REQ-MSG-002
  - seed/intake.md
open_questions: []
---

# REQ-MSG-002 — General message threads outside an engagement

## User need
Not every conversation belongs to a specific engagement. The accountant sometimes needs to reach a
client about something general — a question, a heads-up, a relationship matter — without tying it to a
particular piece of work. She needs a way to start a conversation with a client that stands on its own.

## Proposed solution
The accountant can open a general message thread directed at a client that is not scoped to any
specific engagement. A general thread behaves like an engagement thread for the purpose of exchanging
and retaining messages, but it is associated with the client rather than with an engagement.

## Acceptance criteria
- **AC-MSG-002-01** — The accountant can start a general message thread with a client that is not
  associated with any engagement.
- **AC-MSG-002-02** — A general thread is associated with the client and is visible to the accountant
  and that client.
- **AC-MSG-002-03** — Messages in a general thread are recorded and retained as persistent, ordered
  conversation history, the same as engagement threads.

## Notes
- Thread creation for general threads is an accountant-initiated action; clients participate in but do
  not originate general threads (consistent with the accountant being the practice owner). Whether a
  client may also initiate a general thread is a routine product choice resolved here as
  accountant-initiated only.

## Links
- Related: REQ-MSG-001 (engagement thread), REQ-MSG-005 (unread indicators), REQ-MSG-006 (kept forever)
- Open questions: none
