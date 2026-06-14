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
- **Retention/deletion semantics — updated (OQ-004 addendum 2026-06-14):** During the 7-year retention
  window, no path bypasses the retention guarantee; retention is the governing rule. After the window
  elapses, data is purge-eligible and may be permanently removed by an explicit accountant-confirmed
  purge (REQ-FILE-013) — this is the v1 mechanism that can remove data from the retention guarantee
  after the window expires. A legal hold (REQ-FILE-014) blocks purge eligibility even post-expiry.
  Wholesale permanent deletion of a client identity (REQ-IDNT-005) remains deferred from v1.
- "Permanently removed" here means the document leaving the retention guarantee entirely; ordinary
  user-visible deletion is a reversible/soft action that keeps the document within the retention window
  (see REQ-FILE-006).

## Links
- Related: REQ-FILE-005 (7-year retention period — File Exchange), REQ-FILE-006 (soft-delete within
  retention), REQ-FILE-013 (post-retention purge — how data leaves the retention guarantee post-expiry),
  REQ-FILE-014 (legal hold — blocks purge eligibility), REQ-IDNT-005 (wholesale client deletion —
  deferred from v1), REQ-AUTH-008 (indefinite client access)
- Open questions: none
