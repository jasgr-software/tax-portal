---
id: REQ-AUTH-010
title: Role-based redirect between surfaces
domain: AUTH
type: feature
status: accepted
source:
  - seed/SRS-snapshot.md#REQ-AUTH-010
  - seed/intake.md
open_questions: []
---

# REQ-AUTH-010 — Role-based redirect between surfaces

## User need
The portal presents two surfaces: a client-facing one and an accountant-facing one. A person should
always end up on the surface meant for their role, even if they follow a stale link or type the wrong
address. A client should never land inside the accountant's workspace, and the accountant shouldn't get
stuck on a client-only page — each is simply guided back to where they belong.

## Proposed solution
When a signed-in user reaches a surface or route not meant for their role, the system redirects them to
their own surface. A signed-in CLIENT who navigates to the accountant surface is sent to the client
surface; a signed-in ACCOUNTANT who navigates to a CLIENT-only route on the client surface is sent to
the accountant surface. Public, non-client-only routes on the client surface remain reachable by the
accountant without redirect.

## Acceptance criteria
- **AC-AUTH-010-01** — A signed-in CLIENT who navigates to the accountant (admin) surface is redirected
  to the client surface.
- **AC-AUTH-010-02** — A signed-in ACCOUNTANT who navigates to a CLIENT-only route on the client surface
  is redirected to the accountant surface.
- **AC-AUTH-010-03** — Public (non-client-only) routes on the client surface remain reachable by a
  signed-in ACCOUNTANT without redirect; only CLIENT-only routes trigger the redirect.

## Links
- Related: REQ-AUTH-001 (two roles), REQ-AUTH-002 (accountant visibility), REQ-AUTH-003 (client data
  restriction)
- Open questions: none
