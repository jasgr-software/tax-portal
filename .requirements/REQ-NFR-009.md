---
id: REQ-NFR-009
title: All uploaded files are scanned for malware
domain: NFR
type: constraint
status: accepted
source:
  - OPEN-QUESTIONS.md#OQ-008
  - seed/intake.md
open_questions: []
---

# REQ-NFR-009 — All uploaded files are scanned for malware

## User need
The portal accepts files from clients — people the accountant does not control — and those files are
later opened by the accountant and by other engagement participants. A malicious file slipping through
would put the practice and its clients at risk. Every file that enters the system must therefore be
checked for malware before anyone can open it, regardless of which feature it came in through.

## Normative criterion
- **AC-NFR-009-01** — Every file accepted through any upload path — engagement document uploads and
  message attachments alike — is scanned for malware before it is made available to download or view.
- **AC-NFR-009-02** — A file found to be malicious is withheld from recipients (not made available), and
  the uploader is informed that the file was rejected.

## Notes
- **Decision-derived (OQ-008 resolution, 2026-06-13):** this requirement was added when message
  attachments were decided to mirror document-upload policy *and* a cross-cutting malware scan was
  requested over all uploads. It governs both the File Exchange and Messaging ingress paths rather than
  special-casing either.
- Scanning is a security property; the specific scanning mechanism/service is an implementation decision
  recorded outside this spec.

## Links
- Related: REQ-FILE-001 (file exchange within an engagement), REQ-FILE-002 (no file-type restrictions),
  REQ-MSG-004 (message attachments), REQ-NFR-002 (files never publicly accessible)
- Open questions: none
