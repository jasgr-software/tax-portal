---
id: REQ-AUTH-013
title: User sign-in and sign-out
domain: AUTH
type: feature
status: accepted
source:
  - seed/SRS-snapshot.md#REQ-AUTH-001
  - seed/intake.md
open_questions: []
---

# REQ-AUTH-013 — User sign-in and sign-out

## User need
Both kinds of user — the accountant and her clients — need a way to actually get into the portal and,
when they are done, to leave it. They start each visit unauthenticated and must be able to prove who
they are to reach their own workspace, then end that authenticated session when they step away so an
unattended browser is not left signed in. Until now the portal has assumed people are signed in without
ever stating, as a requirement, that signing in and signing out are themselves capabilities the product
must provide. The role model (who you are), the cross-surface redirect (where mis-navigation sends you),
and session duration (when an idle session expires) are all specified — but the deliberate **act** of
authenticating and of signing out is not.

## Proposed solution
The system provides a way for a person to authenticate (sign in). Once authenticated, the user reaches
the surface appropriate to their role without any further manual navigation. The system also provides a
way for a signed-in user to sign out, which ends their authenticated session; after signing out the user
is in an unauthenticated state and must sign in again before they can reach any protected surface.

This capability is **provider-agnostic** — it describes the sign-in/sign-out behavior the product must
exhibit regardless of which identity mechanism backs it. It says nothing about *how* authentication is
performed (credential type, identity provider, or session mechanics), which is a downstream concern.

## Acceptance criteria
- **AC-AUTH-013-01** — After a user successfully signs in, they reach the surface appropriate to their
  role (the accountant on the accountant surface, a client on the client surface) without further manual
  navigation.
- **AC-AUTH-013-02** — A signed-in user can sign out; signing out ends their authenticated session,
  leaving them in an unauthenticated state such that any subsequent access to a protected surface
  requires signing in again.

## Links
- Related: REQ-AUTH-001 (the two-role model — *who* the signed-in user is), REQ-AUTH-010 (role-based
  redirect — the *corrective* redirect when a signed-in user reaches a surface not meant for their role,
  complementing AC-AUTH-013-01's positive post-sign-in landing), REQ-AUTH-009 (default session
  duration — *when* an idle session expires), REQ-AUTH-004/REQ-AUTH-005 (second-factor authentication —
  an additional sign-in factor, deferred)
- Open questions: none
