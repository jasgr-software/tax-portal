---
id: REQ-MSG-003
title: Messages are plain text only
domain: MSG
type: constraint
status: accepted
source:
  - seed/SRS-snapshot.md#REQ-MSG-003
  - seed/intake.md
open_questions: []
---

# REQ-MSG-003 — Messages are plain text only

## User need
The accountant wants messaging to stay simple and predictable. Rich formatting, embedded images, and
markup add complexity and ambiguity she does not want — a message should be exactly the words typed,
with nothing rendered, styled, or interpreted on her behalf.

## Proposed solution
Message bodies are plain text only. The system does not apply rich-text formatting, does not interpret
or render markup, and does not embed images inline in the message body. Content the sender types is
stored and displayed as plain text.

## Acceptance criteria
- **AC-MSG-003-01** — A message body is treated and displayed as plain text; no rich-text styling is
  applied to it.
- **AC-MSG-003-02** — Markup or formatting syntax entered in a message body is not interpreted or
  rendered — it is shown verbatim as plain text.
- **AC-MSG-003-03** — Images are not embedded inline within a message body.

## Links
- Related: REQ-MSG-004 (attachments — files travel as attachments, not inline)
- Open questions: none
