---
id: REQ-FILE-015
title: Retention governs during the window — client erasure requests are honored as access-revocation only
domain: FILE
type: constraint
status: accepted
source:
  - design-session-2026-06-14#part-a-retention-precedence
  - seed/SRS-snapshot.md#REQ-FILE-005
  - seed/SRS-snapshot.md#REQ-IDNT-005
open_questions: []
---

# REQ-FILE-015 — Retention governs during the window — client erasure requests are honored as access-revocation only

## User need
A client may request that their data be erased. For a tax practice that is also a professional records
obligation, those two things — client erasure preferences and recordkeeping duties — can pull in
opposite directions. The accountant and any operator of the portal need clarity on which governs so the
system can be built consistently and the accountant is protected.

## Proposed solution
During the 7-year retention window, retention is the governing rule: a client request for erasure or
destruction of their data does not result in physical removal of any document or record. Instead, such a
request is honored as access-revocation — the client's ability to view their own engagement data may be
suspended or ended, but the underlying data remains retained in full as required by the retention rule.
Actual destruction of retained data happens only via the post-retention accountant-confirmed purge
(REQ-FILE-013), and only after the retention window has elapsed and no legal hold is active
(REQ-FILE-014).

## Normative criterion
- **AC-FILE-015-01** — During an engagement's 7-year retention window, no client-initiated erasure
  request results in physical removal of any document or engagement data; the retention rule governs and
  the request is satisfied by access-revocation only.
- **AC-FILE-015-02** — Physical destruction of retained engagement data is not possible until the
  retention window has elapsed and any legal hold has been lifted; it then requires explicit
  accountant-confirmed purge (REQ-FILE-013).

## Notes
- This requirement makes the precedence order explicit: **(1) legal hold** (if active, no purge ever)
  → **(2) retention window** (if in-window, no destruction, only access-revocation) →
  **(3) purge-eligible + no hold** (accountant may confirm purge).
- The mechanism by which access is revoked for a client who requests erasure is an access-control
  decision governed by the IDNT and AUTH domains; this requirement only states the retention-side
  constraint.
- **Relationship to REQ-IDNT-005:** wholesale permanent deletion of a client record (identity +
  all data) remains deferred from v1 (REQ-IDNT-005). This requirement covers the narrower question of
  what happens to retained engagement data when a client makes an erasure request — it does not bring
  REQ-IDNT-005 into scope.

## Links
- Related: REQ-FILE-005 (7-year retention window), REQ-FILE-013 (post-retention purge),
  REQ-FILE-014 (legal hold), REQ-FILE-006 (soft-delete within retention),
  REQ-IDNT-005 (wholesale client deletion — deferred), REQ-AUTH-008 (indefinite client access)
- Open questions: none
