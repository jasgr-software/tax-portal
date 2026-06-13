---
id: REQ-DOOR-001
title: Public services page, no login required
domain: DOOR
type: feature
status: accepted
source:
  - seed/SRS-snapshot.md#REQ-DOOR-001
  - seed/intake.md
open_questions: []
---

# REQ-DOOR-001 — Public services page, no login required

## User need
A prospective client looking for tax help wants to see what services the accountant offers before
committing to anything. They are not yet a client and have no account — forcing them to sign up just to
browse would turn them away. They need an open front door they can walk up to and read.

## Proposed solution
The product presents a public services page that anyone can view without signing in or creating an
account. The page lists the services the accountant currently offers so a prospective client can
understand what is available and decide whether to make a request.

## Acceptance criteria
- **AC-DOOR-001-01** — The services page is reachable by an anonymous visitor with no account and no
  sign-in.
- **AC-DOOR-001-02** — The services page displays the accountant's currently offered (active) services.
- **AC-DOOR-001-03** — Viewing the services page does not create an account or require any personal
  information from the visitor.

## Links
- Related: REQ-DOOR-002 (accountant manages catalog), REQ-DOOR-003 (request form), REQ-AUTH-001 (no anonymous account)
- Open questions: none
