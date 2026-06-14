---
id: REQ-NFR-010
title: System maintains an audit trail of security-significant events
domain: NFR
type: feature
status: accepted
source:
  - design-session-2026-06-14#part-b-audit-trail
open_questions: []
---

# REQ-NFR-010 — System maintains an audit trail of security-significant events

## User need
The accountant runs a professional tax practice with legal and ethical obligations around who accessed
what, when, and what was done to client records. When questions arise — from a client, from an auditor,
or in a dispute — she needs a reliable record of what happened in the system. Without a trustworthy
audit trail, she has no way to demonstrate that client data was handled appropriately or to identify if
something went wrong.

## Proposed solution
The system maintains a continuous audit trail that records security-significant events. At minimum the
following are recorded: document access and downloads (which user, which document), engagement status
transitions (from what state, to what state, by whom), all accountant/admin actions (including purge
confirmations, legal hold placements and lifts, file deletions, invitation issuances, and
accept/decline decisions), and authentication-significant events (login, logout, failed authentication).
Each record captures: the identity of the actor, what action was performed, when it occurred, and the
outcome of the action.

The audit trail is readable by the accountant/admin only; clients have no access to it. Audit records
are retained for at least as long as the underlying document retention period (7 years after the related
engagement completes — see REQ-FILE-005), and are not removed when the related engagement data is
purged (REQ-FILE-013): the record that "engagement X was purged" must survive the purge.

## Acceptance criteria
- **AC-NFR-010-01** — The system records each document access or download event, capturing the actor's
  identity, the document affected, the time, and the outcome.
- **AC-NFR-010-02** — The system records each engagement status transition, capturing who triggered it,
  the prior state, the new state, and the time.
- **AC-NFR-010-03** — The system records all accountant/admin actions — including purge confirmations,
  legal hold placements and lifts, file deletions, invitation issuances, and accept/decline decisions —
  capturing the actor, the action, the affected resource, and the time.
- **AC-NFR-010-04** — The system records authentication-significant events (login, logout, failed
  authentication attempt), capturing the actor (or attempted identity), the event type, and the time.
- **AC-NFR-010-05** — The audit trail is accessible only to the accountant/admin role; a client cannot
  read any part of the audit trail, including the portion relating to their own engagements.
- **AC-NFR-010-06** — Audit records for an engagement are retained for at least 7 years after the
  engagement's completion date — at least as long as the retention window for the engagement's
  documents.
- **AC-NFR-010-07** — When an engagement's data is purged (REQ-FILE-013), the audit records for that
  engagement — including the purge event itself — are not removed; they survive the purge.

## Notes
- **Deliberate contrast with telemetry:** this audit trail intentionally records actor identity, because
  accountability is its purpose. This is the opposite of operational telemetry, which must not contain
  PII (telemetry is an architecture/infrastructure concern handled separately).
- Tamper-evidence and completeness are stated as system properties in REQ-NFR-011.
- The set of "security-significant events" in AC-NFR-010-01 through -04 is the minimum required set;
  the system may record additional events. The minimum set is not exhaustive — implementation may
  identify further events that belong in the audit trail.

## Links
- Related: REQ-NFR-011 (audit trail integrity properties), REQ-FILE-013 (post-retention purge —
  purge is audited), REQ-FILE-014 (legal hold — hold placement/lift is audited),
  REQ-FILE-005 (7-year retention), REQ-NFR-006 (system-enforced retention),
  REQ-AUTH-001 (authenticated roles — actor identity), REQ-DASH-001 (accountant's work surface)
- Open questions: none
