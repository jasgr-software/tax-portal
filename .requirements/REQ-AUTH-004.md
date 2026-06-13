---
id: REQ-AUTH-004
title: Mandatory two-factor for the accountant
domain: AUTH
type: feature
status: accepted
source:
  - seed/SRS-snapshot.md#REQ-AUTH-004
  - seed/intake.md
open_questions: []
---

# REQ-AUTH-004 — Mandatory two-factor for the accountant

## User need
The accountant's account can see and act on every client's sensitive financial data. If it were
compromised, the entire practice's information would be exposed. That account must therefore be
protected by more than a password — a stolen password alone must never be enough to get in.

## Proposed solution
Two-factor authentication is required for the ACCOUNTANT account. The accountant must present a second
authentication factor in addition to her password, and she cannot reach the accountant work surface
without it. This protection cannot be switched off.

## Acceptance criteria
- **AC-AUTH-004-01** — The ACCOUNTANT must present a second authentication factor, in addition to a
  password, to sign in.
- **AC-AUTH-004-02** — The ACCOUNTANT cannot reach the accountant (admin) work surface without having
  completed second-factor authentication.
- **AC-AUTH-004-03** — Second-factor authentication cannot be disabled or bypassed for the ACCOUNTANT
  account.

## Links
- Related: REQ-AUTH-005 (optional 2FA for clients)
- Open questions: none
