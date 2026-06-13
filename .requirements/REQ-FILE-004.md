---
id: REQ-FILE-004
title: Only the accountant can delete files
domain: FILE
type: feature
status: accepted
source:
  - seed/SRS-snapshot.md#REQ-FILE-004
  - seed/intake.md
open_questions: []
---

# REQ-FILE-004 — Only the accountant can delete files

## User need
The accountant is professionally responsible for the documents in each engagement and must keep a
complete, defensible record. If clients could remove files, source records could vanish mid-engagement
or after the fact, undermining the accountant's work and her recordkeeping obligations. Deletion must
rest solely with the accountant.

## Proposed solution
Only the accountant may delete a file. Client participants have no ability to delete any file, including
files they uploaded themselves. Deletion is an accountant-only capability over individual files.

## Acceptance criteria
- **AC-FILE-004-01** — The accountant can delete a file within an engagement.
- **AC-FILE-004-02** — A client cannot delete any file, including a file the client uploaded.
- **AC-FILE-004-03** — No client-facing path exists to remove a file from an engagement.

## Notes
- Deleting an individual file is a v1 capability and is distinct from permanent erasure of a client's
  entire history, which is deferred (see REQ-IDNT-005 / OQ-004). Even an accountant deletion does not
  override the 7-year retention rule — see REQ-FILE-006 and REQ-FILE-005.

## Links
- Related: REQ-FILE-006 (deletion is soft-delete), REQ-FILE-005 (7-year retention governs),
  REQ-IDNT-005 (client hard delete — deferred)
- Open questions: none
