---
id: REQ-FILE-001
title: Both parties exchange files within an engagement
domain: FILE
type: feature
status: accepted
source:
  - seed/SRS-snapshot.md#REQ-FILE-001
  - seed/intake.md
open_questions: []
---

# REQ-FILE-001 — Both parties exchange files within an engagement

## User need
Tax work revolves around documents flowing both ways: the client sends in source records (W-2s,
receipts, prior returns) and the accountant returns deliverables (organizers, completed returns,
letters). Today this happens over email, which is insecure and hard to track. Both sides need a single
place tied to the engagement where they can hand files back and forth.

## Proposed solution
Within an engagement, both the accountant and the engagement's client participant(s) can upload files
and download files that belong to that engagement. File exchange is scoped to the engagement: a file
uploaded for one engagement is part of that engagement's document set, available to its participants.

## Acceptance criteria
- **AC-FILE-001-01** — The accountant can upload a file to an engagement.
- **AC-FILE-001-02** — A client participant of an engagement can upload a file to that engagement.
- **AC-FILE-001-03** — The accountant can download any file belonging to an engagement.
- **AC-FILE-001-04** — A client participant of an engagement can download files belonging to that
  engagement.
- **AC-FILE-001-05** — A file uploaded to an engagement is part of that engagement's document set and
  is not exposed to other engagements.

## Links
- Related: REQ-FILE-010 (folders), REQ-FILE-003 (access is authorized, never public),
  REQ-AUTH-007 (engagement participants), REQ-NFR-009 (uploaded files are malware-scanned)
- Open questions: none
