---
id: REQ-NFR-011
title: Audit trail is tamper-evident and complete
domain: NFR
type: constraint
status: accepted
source:
  - design-session-2026-06-14#part-b-audit-integrity
open_questions: []
---

# REQ-NFR-011 — Audit trail is tamper-evident and complete

## User need
An audit trail that can be silently altered after the fact, or that can be bypassed so actions go
unrecorded, provides no real assurance. For the accountant's legal and professional protection, the
audit trail must be one where unauthorized alteration is detectable, and where no security-significant
action can silently succeed without leaving a record.

## Proposed solution
The system must exhibit two integrity properties for its audit trail:

1. **Tamper-evidence:** audit records are tamper-evident — unauthorized alteration of an existing audit
   record is detectable. (The mechanism that achieves this is an implementation decision for the
   architecture layer; this requirement states only the property the system must exhibit.)

2. **Completeness:** no security-significant state change goes unrecorded. An action that cannot be
   audited does not silently succeed without an audit record; audit failure is treated as a
   first-class concern that prevents or flags the triggering action rather than being silently swallowed.
   (The transactional or enforcement mechanism is an implementation decision for the architecture layer;
   this requirement states only the property the system must exhibit.)

## Normative criterion
- **AC-NFR-011-01** — Unauthorized alteration of an audit record is detectable; the system exhibits
  tamper-evidence as a property of its audit trail.
- **AC-NFR-011-02** — No security-significant state change occurs in the system without a corresponding
  audit record being produced; audit failure for a security-significant action is treated as a failure
  of the action itself, not silently ignored.

## Notes
- These are **properties** of the audit trail, not mechanisms. How tamper-evidence is achieved
  (cryptographic chaining, append-only storage, write-once records, etc.) and how completeness is
  enforced (transactional coupling, middleware interception, etc.) are HOW concerns for the
  architecture layer.
- These properties apply to the audit trail defined in REQ-NFR-010.

## Links
- Related: REQ-NFR-010 (the audit trail this applies to)
- Open questions: none
