---
id: REQ-NFR-008
title: Reliable transactional email delivery
domain: NFR
type: constraint
status: accepted
source:
  - seed/SRS-snapshot.md#REQ-NFR-008
  - seed/intake.md
open_questions: []
---

# REQ-NFR-008 — Reliable transactional email delivery

## User need
Email is the portal's fallback nudge channel — it tells clients and the accountant that something is
waiting for them in the portal, and it carries the invitation that lets an accepted prospect create an
account. For these messages to do their job they have to actually arrive in inboxes reliably and be
clearly presented. The need is dependable outbound email, not any particular sending provider.

## Normative criterion
- **AC-NFR-008-01** — The system sends its outbound notification and invitation emails through a
  dependable transactional email capability that delivers them reliably to recipients' inboxes.

## Notes
- The specific email-sending service and templating approach are implementation decisions recorded
  outside this spec; only the property — reliable transactional email delivery — is captured here.

## Links
- Related: REQ-MSG-008 (email fallback nudge — Messaging), REQ-MSG-009 (daily digest cap),
  REQ-DOOR-007 (invitation email on acceptance)
- Open questions: none
