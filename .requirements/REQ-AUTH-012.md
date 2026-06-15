---
id: REQ-AUTH-012
title: Staff permissions gate actions; full firm-wide visibility for all staff
domain: AUTH
type: feature
status: accepted
source:
  - seed/vision-expansion.md#scope-decisions
open_questions: []
---

# REQ-AUTH-012 — Staff permissions gate actions; full firm-wide visibility for all staff

## User need
When a firm has several staff, the owner wants everyone to be able to see the whole practice — there is no
need to partition who sees which client — but she does not want every staff member able to do everything.
Consequential actions (signing off / completing an engagement, deleting files, managing the services catalog
or templates) should be limited to the staff who are supposed to perform them, while routine work stays open
to all. In short: everyone sees everything; roles decide what each person can do.

## Proposed solution
All accountant-side staff accounts have full visibility across every client and engagement in the firm —
there is no per-staff partitioning of which clients or engagements are visible. What differs between staff is
permission to *perform actions*: staff accounts carry a permission level (role) that gates specific
consequential actions while leaving general visibility and routine work available to all staff. The firm
owner can determine which staff hold the permissions for the gated actions. Which exact actions are gated is
a configuration detail; the requirement is that action permissions are separable from visibility, and that
visibility is uniform and full.

## Acceptance criteria
- **AC-AUTH-012-01** — Every accountant-side staff account has full visibility across all clients and
  engagements in the firm; no staff account is restricted to a subset.
- **AC-AUTH-012-02** — Staff accounts can hold different permission levels that gate the actions they are
  allowed to perform.
- **AC-AUTH-012-03** — At least one class of consequential action (e.g. completing/signing off an engagement,
  deleting files, or managing the services catalog/templates) can be restricted to staff with the
  appropriate permission and denied to staff without it.
- **AC-AUTH-012-04** — Action permissions are independent of visibility: restricting an action for a staff
  account does not reduce what that account can see.
- **AC-AUTH-012-05** — The firm owner can determine which staff hold the permission for a gated action.

## Notes
- **v2 capability.** Resolves the user's auth-model decision of 2026-06-14 — "roles, full visibility."
- **Keeps REQ-AUTH-001's two top-level roles intact:** staff differentiation is a permission layer *within*
  the ACCOUNTANT role, not a set of new top-level authenticated roles.
- **Does NOT introduce per-staff client assignment/scoping** (an explicitly rejected option). Visibility is
  uniform; only actions are gated.
- Pairs with REQ-AUTH-011 (the existence of multiple staff accounts).

## Links
- Related: REQ-AUTH-001 (two top-level roles), REQ-AUTH-002 (accountant full visibility), REQ-AUTH-011
  (multiple staff accounts), REQ-NFR-005 (single-account v1 constraint — superseded for v2), REQ-FILE-004
  (accountant-only file deletion — an example gated action)
- Open questions: none
