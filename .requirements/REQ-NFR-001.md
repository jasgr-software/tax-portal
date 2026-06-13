---
id: REQ-NFR-001
title: Tenant isolation between clients
domain: NFR
type: constraint
status: accepted
source:
  - seed/SRS-snapshot.md#REQ-NFR-001
  - seed/intake.md
open_questions: []
---

# REQ-NFR-001 — Tenant isolation between clients

## User need
Clients trust the practice with sensitive personal and financial information. A client must be confident
that no other client of the same practice can ever see, retrieve, or infer their data. This isolation is
the foundation of the portal's credibility — a single cross-client data leak would be unacceptable for a
financial-services product.

## Normative criterion
- **AC-NFR-001-01** — All authenticated access to client-owned data is constrained so that no CLIENT can
  read, list, or otherwise obtain any data belonging to another client; the isolation boundary is
  enforced by the system on every data access, not left to individual feature code to remember.

## Notes
- This is the non-functional, system-wide guarantee underlying the functional restriction in
  REQ-AUTH-003 (a CLIENT sees only their own data). The specific isolation mechanism is an
  implementation decision recorded outside this spec.

## Links
- Related: REQ-AUTH-003 (client data restriction), REQ-AUTH-002 (accountant full visibility — the one
  authorized exception)
- Open questions: none
