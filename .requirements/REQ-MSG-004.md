---
id: REQ-MSG-004
title: Messages may include file attachments
domain: MSG
type: feature
status: accepted
source:
  - seed/SRS-snapshot.md#REQ-MSG-004
  - seed/intake.md
open_questions: []
---

# REQ-MSG-004 — Messages may include file attachments

## User need
A conversation often needs a document to go with it — the accountant asks a question and wants to point
at a form, or a client replies and wants to send back a file. Because messaging replaces email, people
need to be able to attach files to a message rather than sending them through a separate channel.

## Proposed solution
A message may carry one or more file attachments. Attachments sent with a message are part of that
message and remain available to the thread's participants as long as the message is retained.

## Acceptance criteria
- **AC-MSG-004-01** — A sender can attach one or more files to a message.
- **AC-MSG-004-02** — A message's attachments are visible to the thread's participants alongside the
  message.
- **AC-MSG-004-03** — A thread participant can retrieve (open or download) a file attached to a message
  in a thread they participate in.
- **AC-MSG-004-04** — Attachments remain available for as long as the message that carries them is
  retained.
- **AC-MSG-004-05** — Message attachments are subject to the same file-type and size rules as engagement
  document upload, and to malware scanning before they are made available (see REQ-NFR-009).

## Notes
- **OQ-008 resolved (2026-06-13):** message attachments mirror engagement document-upload policy (no
  file-type restrictions per REQ-FILE-002, same size limits), AND all uploads are malware-scanned via the
  new cross-cutting security requirement REQ-NFR-009.

## Links
- Related: REQ-MSG-003 (plain text body), REQ-MSG-001 (engagement thread), REQ-FILE-002 (document upload
  constraints), REQ-NFR-009 (malware scanning of all uploads)
- Open questions: none
