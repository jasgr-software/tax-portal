---
id: REQ-FILE-013
title: Post-retention purge is accountant-confirmed and never automatic
domain: FILE
type: feature
status: accepted
source:
  - design-session-2026-06-14#part-a-purge
  - seed/SRS-snapshot.md#REQ-FILE-005
open_questions: []
---

# REQ-FILE-013 — Post-retention purge is accountant-confirmed and never automatic

## User need
After a 7-year retention window expires, the accountant needs a way to permanently remove engagement
data she no longer needs to keep — freeing storage and reducing clutter in the historical record.
However, permanent destruction of professional records is a consequential, irreversible action. The
accountant must be the one to initiate and explicitly confirm each purge; the system must never purge
autonomously.

## Proposed solution
Once the 7-year retention window for an engagement has elapsed, the engagement's data becomes
purge-eligible. The accountant (admin role only) may then initiate a purge of that engagement's data;
purge requires an explicit confirmation step before the data is permanently removed. The system never
purges data automatically when a retention window expires — expiry only creates eligibility, not
automatic deletion. Until the accountant confirms a purge, data continues to be retained beyond the
7-year minimum. Each purge action is recorded in the audit trail (see REQ-NFR-010).

## Acceptance criteria
- **AC-FILE-013-01** — An engagement's data becomes purge-eligible only after its 7-year retention
  window has elapsed; data within the retention window cannot be purged.
- **AC-FILE-013-02** — Purge is an accountant/admin-only action; no client-facing path initiates or
  requests a purge.
- **AC-FILE-013-03** — The accountant is required to explicitly confirm a purge before any data is
  permanently removed; no purge proceeds without confirmation.
- **AC-FILE-013-04** — The system never automatically purges data when a retention window expires;
  expiry only makes the engagement eligible for an accountant-confirmed purge.
- **AC-FILE-013-05** — Data that is purge-eligible but not yet purged remains accessible and retained
  until the accountant explicitly confirms removal.
- **AC-FILE-013-06** — Each purge is recorded in the audit trail (who purged what and when) and that
  audit record is not removed by the purge itself (see REQ-NFR-010).

## Notes
- **Relationship to REQ-FILE-005:** REQ-FILE-005 establishes the 7-year floor. This requirement
  establishes what happens *after* that floor: data remains until the accountant explicitly purges it.
  The two requirements are complementary, not in conflict.
- **Relationship to REQ-IDNT-005:** This requirement governs purge of engagement/document data after
  retention. REQ-IDNT-005 (wholesale permanent deletion of a client identity and all associated
  history) remains deferred from v1. They are related but distinct capabilities.
- **Legal hold interplay:** if an engagement is under legal hold (REQ-FILE-014), it is not
  purge-eligible even if the retention window has elapsed. Legal hold suspends eligibility entirely.
- **Reconciliation note:** OQ-004 was resolved 2026-06-13 to defer purge from v1. That resolution is
  partially superseded by the user decision of 2026-06-14 — post-retention accountant-confirmed purge
  is brought into v1. OQ-004 has been updated to reflect this (see OQ-004 resolution addendum). The
  deferral of REQ-IDNT-005 (wholesale client erasure) is unaffected.

## Links
- Related: REQ-FILE-005 (7-year retention window), REQ-FILE-014 (legal hold suspends purge),
  REQ-FILE-015 (retention-vs-erasure precedence), REQ-FILE-004 (accountant-only deletion),
  REQ-NFR-010 (audit trail), REQ-IDNT-005 (wholesale client deletion — deferred)
- Open questions: none
