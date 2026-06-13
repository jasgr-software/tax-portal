---
id: REQ-FILE-009
title: Files support version history
domain: FILE
type: feature
status: accepted
source:
  - seed/SRS-snapshot.md#REQ-FILE-009
  - seed/intake.md
open_questions: []
---

# REQ-FILE-009 — Files support version history

## User need
Documents get corrected and resubmitted — a client re-scans a clearer W-2, the accountant issues a
revised return. Both sides need the current version to be obvious, while older versions stay available
so nothing is lost and the history of a document is auditable.

## Proposed solution
A file can be replaced with a new version. When replaced, the file presents the new version as current
while every prior version is retained and remains accessible. No version is discarded when a file is
updated.

## Acceptance criteria
- **AC-FILE-009-01** — An existing file can be replaced with a new version.
- **AC-FILE-009-02** — After replacement, the newest version is presented as the current version of the
  file.
- **AC-FILE-009-03** — Every prior version of a file is retained and remains accessible after the file
  is replaced.

## Links
- Related: REQ-FILE-005 (retention), REQ-FILE-006 (soft-delete retention)
- Open questions: none
