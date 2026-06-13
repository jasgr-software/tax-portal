---
id: REQ-MSG-008
title: Email notification is a content-free fallback nudge
domain: MSG
type: feature
status: accepted
source:
  - seed/SRS-snapshot.md#REQ-MSG-008
  - seed/intake.md
open_questions: []
---

# REQ-MSG-008 — Email notification is a content-free fallback nudge

## User need
Some users will not be looking at the portal when something happens, so a quiet email is a useful nudge
to bring them back. But the accountant is firm that client activity — names, documents, message content
— must not travel through email, which is exactly the insecure channel the portal is replacing. The
email should say only that there is something to see, never what it is.

## Proposed solution
Email notifications act purely as a fallback nudge. An email notification tells the recipient that there
is new activity in their portal and gives them a way to sign in, and nothing more. It contains no
detail about the activity — no client names, no document or message content, no description of what
happened.

## Acceptance criteria
- **AC-MSG-008-01** — A fallback email notification conveys only that there is new activity in the
  recipient's portal, plus a means to sign in.
- **AC-MSG-008-02** — A fallback email contains no activity detail — no message content, no document
  names or content, no client or engagement identifying detail, and no description of the specific
  event.
- **AC-MSG-008-03** — Acting on the email leads the recipient to sign in to the portal to see the actual
  activity.

## Links
- Related: REQ-MSG-007 (in-portal feed primary), REQ-MSG-009 (digest frequency cap), REQ-MSG-010 (suppress email), REQ-MSG-011 (client email default)
- Open questions: none
