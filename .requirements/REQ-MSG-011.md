---
id: REQ-MSG-011
title: Client email fallback enabled by default
domain: MSG
type: feature
status: accepted
source:
  - seed/SRS-snapshot.md#REQ-MSG-011
  - seed/intake.md
open_questions: []
---

# REQ-MSG-011 — Client email fallback enabled by default

## User need
Clients do not live in the portal the way the accountant does — they drop in occasionally. So the email
nudge matters most for them, to make sure they actually notice when there is something waiting. Out of
the box, a client should get the email reminder without anyone having to switch it on.

## Proposed solution
For clients, the email fallback nudge is enabled by default. A newly created client receives email
notification nudges without any setup step. (The nudge itself remains content-free per REQ-MSG-008 and
capped to a daily digest per REQ-MSG-009.)

## Acceptance criteria
- **AC-MSG-011-01** — A newly created client account has the email fallback nudge enabled by default.
- **AC-MSG-011-02** — A client receives email notification nudges without any manual opt-in step.

## Notes
- Whether a client can later turn their own email nudge off is a settings question owned by the Identity
  & Settings domain, not specified in the MSG seed; this requirement fixes only the default-on state.

## Links
- Related: REQ-MSG-008 (content-free fallback), REQ-MSG-009 (digest cap), REQ-MSG-010 (accountant suppression)
- Open questions: none
