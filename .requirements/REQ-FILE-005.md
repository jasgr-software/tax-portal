---
id: REQ-FILE-005
title: Documents are retained for 7 years after engagement completion
domain: FILE
type: constraint
status: accepted
source:
  - seed/SRS-snapshot.md#REQ-FILE-005
  - seed/intake.md
open_questions: []
---

# REQ-FILE-005 — Documents are retained for 7 years after engagement completion

## User need
Tax records must be kept for years to satisfy IRS standards and to let both the accountant and the
client retrieve prior-year documents long after the work is done. The accountant relies on the portal
as the system of record, so documents cannot be lost or aged out prematurely.

## Proposed solution
Documents are retained for at least 7 years after the engagement to which they belong is marked
complete. Within that retention window, no action removes a document from the retained record —
retention is the governing rule in v1 and overrides any deletion. Permanent erasure of a client's
entire history is deferred from v1 (see REQ-IDNT-005 / OQ-004), so in v1 nothing overrides this 7-year
retention.

## Acceptance criteria
- **AC-FILE-005-01** — A document belonging to a completed engagement is retained for at least 7 years
  measured from the engagement's completion.
- **AC-FILE-005-02** — Within the 7-year retention window, a document remains recoverable and is not
  permanently removed by any v1 action, including an accountant deletion.
- **AC-FILE-005-03** — No v1 operation overrides the 7-year retention rule.

## Notes
- This is the **governing** retention rule for v1. Per OQ-004 (resolved 2026-06-13 — defer), permanent
  hard-delete of a client and their entire data history is deferred from v1; therefore retention holds
  unconditionally and no deletion path supersedes it in v1.

## Links
- Related: REQ-FILE-006 (soft-delete preserves retention), REQ-FILE-004 (accountant-only file delete),
  REQ-AUTH-008 (indefinite client access), REQ-IDNT-005 (client hard delete — deferred)
- Open questions: none
