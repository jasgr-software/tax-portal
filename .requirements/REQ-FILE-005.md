---
id: REQ-FILE-005
title: Documents are retained for 7 years after engagement completion
domain: FILE
type: constraint
status: accepted
source:
  - seed/SRS-snapshot.md#REQ-FILE-005
  - seed/intake.md
  - design-session-2026-06-14#part-a-purge
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
retention is the governing rule during the window. After the window elapses, engagement data becomes
purge-eligible (see REQ-FILE-013) but is not automatically removed; it continues to be retained until
the accountant explicitly confirms a purge. A legal hold (REQ-FILE-014) suspends purge eligibility
regardless of how old the engagement is. The explicit precedence rule is stated in REQ-FILE-015.

## Acceptance criteria
- **AC-FILE-005-01** — A document belonging to a completed engagement is retained for at least 7 years
  measured from the engagement's completion.
- **AC-FILE-005-02** — Within the 7-year retention window, a document remains recoverable and is not
  permanently removed by any action, including an accountant deletion.
- **AC-FILE-005-03** — No action permanently removes a document during its 7-year retention window;
  within the window, retention is the governing rule.

## Notes
- This is the **governing** retention rule during the retention window. After the window elapses, data
  is purge-eligible but not auto-deleted — see REQ-FILE-013 (accountant-confirmed purge) and
  REQ-FILE-014 (legal hold).
- **Partial supersede of OQ-004 (2026-06-14):** The original OQ-004 resolution (2026-06-13) deferred
  all purge from v1. The user decision of 2026-06-14 partially reverses that: post-retention
  accountant-confirmed purge is now in v1. The statements "no v1 operation overrides the 7-year
  retention rule" and "nothing overrides this 7-year retention" were accurate under the prior deferral
  but are now refined — they remain true *during* the retention window; after the window, purge is
  available per REQ-FILE-013. This note records the history; do not read the old absolute language as
  still authoritative.
- Wholesale permanent deletion of a client identity and all data (REQ-IDNT-005) remains deferred from
  v1; the 2026-06-14 reversal is limited to post-retention document/engagement purge.

## Links
- Related: REQ-FILE-006 (soft-delete preserves retention), REQ-FILE-004 (accountant-only file delete),
  REQ-FILE-013 (post-retention purge), REQ-FILE-014 (legal hold), REQ-FILE-015 (precedence rule),
  REQ-AUTH-008 (indefinite client access), REQ-IDNT-005 (client hard delete — deferred),
  REQ-NFR-006 (system-enforced retention)
- Open questions: none
