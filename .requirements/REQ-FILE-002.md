---
id: REQ-FILE-002
title: No file type restrictions
domain: FILE
type: feature
status: accepted
source:
  - seed/SRS-snapshot.md#REQ-FILE-002
  - seed/intake.md
open_questions: []
---

# REQ-FILE-002 — No file type restrictions

## User need
Clients send whatever they have — PDFs, scanned images, spreadsheets, photos of receipts, word
processing documents, ZIP archives. Forcing them to convert or rename files just to get them into the
portal creates friction and pushes people back to email. The accountant likewise needs to return files
in whatever format the work produces.

## Proposed solution
The system permits files of any type to be uploaded and exchanged within an engagement. There is no
allow-list or block-list of file extensions or formats that prevents an upload.

## Acceptance criteria
- **AC-FILE-002-01** — A file may be uploaded regardless of its file type or extension; no file type is
  rejected solely because of its format.

## Notes
- This requirement is about format permissiveness only. Any size limits, malware scanning, or abuse
  controls are separate concerns and not asserted here.

## Links
- Related: REQ-FILE-001 (upload/download)
- Open questions: none
