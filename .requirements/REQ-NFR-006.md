---
id: REQ-NFR-006
title: Seven-year document retention enforced by the system
domain: NFR
type: constraint
status: accepted
source:
  - seed/SRS-snapshot.md#REQ-NFR-006
  - seed/intake.md
open_questions: []
---

# REQ-NFR-006 — Seven-year document retention enforced by the system

## User need
Tax practice obligations require client documents to be retained for seven years after an engagement
completes. Retention this important cannot rely on the accountant remembering not to delete things — the
system itself must guarantee that documents survive for the full retention period. A document being lost
early would expose the practice to compliance risk.

## Normative criterion
- **AC-NFR-006-01** — Client documents are retained by the system and not permanently removed until at
  least seven years after the related engagement is completed; this retention is enforced by the system
  rather than left to manual discipline.

## Notes
- **Retention/deletion semantics — resolved (cross-cutting, OQ-004 deferred):** permanent hard-delete of
  a client/data is deferred from v1, so in v1 no path bypasses the 7-year retention guarantee. The
  later-version accountant-initiated hard-delete carve-out (REQ-IDNT-005) is the only mechanism that
  could ever override retention, and it is out of v1 scope.
- "Permanently removed" here means the document leaving the retention guarantee entirely; ordinary
  user-visible deletion is a reversible/soft action that keeps the document within the retention window
  (see REQ-FILE-006).

## Links
- Related: REQ-FILE-005 (7-year retention period — File Exchange), REQ-FILE-006 (soft-delete within
  retention), REQ-IDNT-005 (accountant hard-delete — deferred from v1), REQ-AUTH-008 (indefinite client
  access)
- Open questions: none
