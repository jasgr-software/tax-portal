---
id: REQ-AUTH-011
title: Multiple accountant-side staff accounts within one firm
domain: AUTH
type: feature
status: accepted
source:
  - seed/vision-expansion.md#scope-decisions
  - seed/vision-expansion.md#potential-differentiator
open_questions: []
---

# REQ-AUTH-011 — Multiple accountant-side staff accounts within one firm

## User need
The product begins as a single-accountant tool (REQ-NFR-005), but a growing remote practice takes on staff —
an associate, an admin assistant, a second preparer. They need their own logins to the accountant-side
surface rather than sharing one set of credentials, so the firm can have more than one person working in the
portal while still being a single firm.

## Proposed solution
Beyond v1's single accountant account, the system supports multiple accountant-side staff accounts belonging
to the one firm. Each staff member signs in with their own individual account. All such accounts are users of
the accountant-side surface — the ACCOUNTANT role of REQ-AUTH-001 is retained, and staff are not clients —
and the firm remains a single tenant: this introduces additional staff accounts *within one firm*, not
multiple independent firms. What each staff account is permitted to do is governed by REQ-AUTH-012.

## Acceptance criteria
- **AC-AUTH-011-01** — The system supports more than one accountant-side staff account within a single firm,
  each with its own individual sign-in.
- **AC-AUTH-011-02** — Every staff account is an accountant-side user (the ACCOUNTANT role per REQ-AUTH-001),
  not a client account.
- **AC-AUTH-011-03** — All staff accounts belong to one firm; the capability does not introduce separate firm
  tenants or cross-firm isolation.
- **AC-AUTH-011-04** — The actions a staff account may perform are governed by its permissions
  (REQ-AUTH-012); this requirement establishes the existence of multiple staff accounts, not what each may
  do.

## Notes
- **v2 capability.** Supersedes the v1-only single-account constraint (REQ-NFR-005) for v2; v1 remains a
  single account.
- **Explicitly NOT multi-firm / multi-tenant SaaS** — that is out of scope per the vision-expansion scope
  decisions. This is multiple staff inside one firm only.
- Visibility model is uniform and full for all staff — see REQ-AUTH-012.

## Links
- Related: REQ-AUTH-001 (two top-level roles), REQ-AUTH-002 (accountant full visibility), REQ-AUTH-012 (staff
  permissions + full visibility), REQ-NFR-005 (single-account v1 constraint — superseded for v2)
- Open questions: none
