---
id: REQ-AUTH-001
title: Two authenticated roles
domain: AUTH
type: feature
status: accepted
source:
  - seed/SRS-snapshot.md#REQ-AUTH-001
  - seed/intake.md
open_questions: []
---

# REQ-AUTH-001 — Two authenticated roles

## User need
The portal serves two fundamentally different people: the tax accountant, who runs her practice and
needs to see and manage everything, and her clients, who should only ever see their own engagement.
For the system to keep those worlds separate and predictable, every authenticated person must be
unambiguously one kind of user or the other — there is no in-between, and no account that is "a bit of
both."

## Proposed solution
The system recognizes exactly two authenticated roles — **ACCOUNTANT** and **CLIENT** — and assigns
every authenticated account to exactly one of them. No third role exists, and an account is never both.
A person's role is established when their account is created and is the basis every other access rule
builds on.

## Acceptance criteria
- **AC-AUTH-001-01** — The system defines exactly two authenticated roles: ACCOUNTANT and CLIENT. No
  other authenticated role can be assigned to an account.
- **AC-AUTH-001-02** — Every authenticated account has exactly one role; an account is never assigned
  both roles and is never assigned zero roles.
- **AC-AUTH-001-03** — An authenticated account's role is determinable at every point after sign-in, so
  that downstream access decisions can rely on it.

## Links
- Related: REQ-AUTH-002 (ACCOUNTANT full visibility), REQ-AUTH-003 (CLIENT data restriction),
  REQ-AUTH-006 (CLIENT created by invitation only)
- Open questions: none
