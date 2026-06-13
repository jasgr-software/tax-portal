---
id: REQ-FILE-007
title: Accountant creates labeled document requests
domain: FILE
type: feature
status: accepted
source:
  - seed/SRS-snapshot.md#REQ-FILE-007
  - seed/intake.md
open_questions: []
---

# REQ-FILE-007 — Accountant creates labeled document requests

## User need
Clients often don't know exactly what to send. The accountant needs to ask for specific documents in
plain language — "Please upload your W-2", "Send last year's return" — so the client knows precisely
what's needed and can respond directly, rather than guessing or trading clarifying emails.

## Proposed solution
The accountant can create labeled document requests within an engagement, each carrying a
human-readable label describing the document being asked for. A client sees the requests addressed to
their engagement and can fulfill a request by uploading the corresponding file.

## Acceptance criteria
- **AC-FILE-007-01** — The accountant can create a document request within an engagement, with a
  free-text label naming the document being requested.
- **AC-FILE-007-02** — A client participant of the engagement can see the document requests for that
  engagement and the label of each.
- **AC-FILE-007-03** — A client can fulfill a document request by uploading a file in response to it.

## Links
- Related: REQ-FILE-008 (document checklist / outstanding items), REQ-FILE-012 (overdue request
  reminders), REQ-FILE-001 (upload)
- Open questions: none
