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
- **AC-NFR-005-01** — The system supports a single ACCOUNTANT account; multi-staff or employee accounts
  are out of scope for v1.

## Links
- Related: REQ-AUTH-001 (two roles), REQ-AUTH-002 (accountant full visibility)
- Open questions: none
