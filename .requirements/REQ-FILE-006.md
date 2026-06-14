---
id: REQ-FILE-006
title: Deletion is soft — files are retained through the retention period
domain: FILE
type: feature
status: accepted
source:
  - seed/SRS-snapshot.md#REQ-FILE-006
  - seed/intake.md
open_questions: []
---

# REQ-FILE-006 — Deletion is soft — files are retained through the retention period

## User need
The accountant needs to tidy an engagement — hide a wrong-version upload or a misfiled document — so the
working view stays clean. But because tax records must be kept (REQ-FILE-005), "deleting" a file for
clarity must never destroy it. Removing clutter and preserving the record are both required at once.

## Proposed solution
When the accountant deletes a file, the file is marked as deleted and removed from the normal working
view, but it is retained for the engagement's 7-year retention period rather than being permanently
destroyed. A deleted file remains part of the retained record and recoverable until the retention period
elapses.

## Acceptance criteria
- **AC-FILE-006-01** — Deleting a file marks it as deleted and removes it from the normal file view.
- **AC-FILE-006-02** — A file marked as deleted is retained for the engagement's 7-year retention period
  and is not permanently destroyed within that period.
- **AC-FILE-006-03** — A file marked as deleted remains recoverable until its retention period elapses.

## Notes
- Soft-delete (marking a file as deleted) is distinct from purge (REQ-FILE-013). Soft-delete is
  available at any time during or after the retention window, removes the file from the working view,
  but keeps the underlying data. Purge is a post-retention accountant-confirmed action that permanently
  removes data after the retention window has elapsed and any legal hold (REQ-FILE-014) is lifted.

## Links
- Related: REQ-FILE-004 (only accountant deletes), REQ-FILE-005 (7-year retention governs),
  REQ-FILE-013 (post-retention purge — distinct from soft-delete)
- Open questions: none
