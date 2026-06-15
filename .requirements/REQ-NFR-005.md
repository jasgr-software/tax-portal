---
id: REQ-NFR-005
title: Single accountant account in v1
domain: NFR
type: constraint
status: accepted
source:
  - seed/SRS-snapshot.md#REQ-NFR-005
  - seed/intake.md
open_questions: []
---

# REQ-NFR-005 — Single accountant account in v1

## User need
The product is built for a solo practitioner who runs the entire practice alone. Supporting multiple
staff or employee accounts — with the team management, delegation, and access-scoping that implies —
would be effort spent on a need that does not exist in v1. The first version should assume exactly one
accountant.

## Normative criterion
- **AC-NFR-005-01** — In v1, the system supports a single ACCOUNTANT account; multi-staff or employee
  accounts are out of scope for v1.

## Notes
- **v2 reconciliation:** This constraint is a v1 scoping statement, not a permanent prohibition.
  Multi-accountant support (multiple staff accounts within one firm, with full firm-wide visibility and
  permission-gated actions) is introduced in v2 by REQ-AUTH-011 and REQ-AUTH-012, per the user decision of
  2026-06-14. Multi-firm / multi-tenant SaaS remains out of scope.

## Links
- Related: REQ-AUTH-001 (two roles), REQ-AUTH-002 (accountant full visibility), REQ-AUTH-011 (multiple staff
  accounts — v2), REQ-AUTH-012 (staff permissions + full visibility — v2)
- Open questions: none
