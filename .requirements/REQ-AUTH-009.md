---
id: REQ-AUTH-009
title: Default session duration in v1
domain: AUTH
type: constraint
status: accepted
source:
  - seed/SRS-snapshot.md#REQ-AUTH-009
  - seed/intake.md
open_questions: []
---

# REQ-AUTH-009 — Default session duration in v1

## User need
Signed-in sessions need to expire eventually so an unattended browser doesn't stay logged in forever,
but the practice has no special session-length requirement in its first version. Building configurable
or custom session timeouts now would be effort spent on a problem nobody has yet.

## Proposed solution
For v1, authenticated sessions follow the standard default session-timeout behavior. No custom or
configurable session duration is introduced.

## Acceptance criteria
- **AC-AUTH-009-01** — Authenticated sessions expire according to the standard default session timeout;
  v1 provides no custom or configurable session-duration setting.

## Links
- Related: REQ-AUTH-001 (two roles)
- Open questions: none
