---
id: REQ-MSG-019
title: Proactive lifecycle accountability and automated client follow-up
domain: MSG
type: feature
status: accepted
source:
  - seed/vision-expansion.md#biggest-opportunity
  - seed/vision-expansion.md#potential-differentiator
  - seed/vision-expansion.md#author-guidance-notes
open_questions: []
---

# REQ-MSG-019 — Proactive lifecycle accountability and automated client follow-up

## User need
The hardest part of a remote tax practice isn't storing documents — it's chasing clients to do their part.
Today the system only auto-reminds on overdue document requests (REQ-MSG-018); everything else — an unsigned
engagement letter, an incomplete onboarding step, an expected-but-missing document, an unanswered question —
the accountant chases by hand, and the client has no single place that tells them exactly what they still
owe. The accountant wants the system to proactively move each engagement forward: detect whatever is
outstanding from the client across the whole lifecycle, nudge the client automatically, and show the client
a clear consolidated list of what's needed — so she stops sending "are you done yet?" messages.

## Proposed solution
The system continuously identifies what is outstanding from the client across the engagement lifecycle —
including (but not limited to) an unsigned engagement letter, incomplete onboarding steps, overdue or
expected-but-missing documents, and unanswered tracked questions — and proactively follows up with the client
about them without the accountant initiating each nudge. It presents the client a consolidated,
always-current "what's needed from you" view for their engagement(s) so the client can see exactly what
remains. Follow-up cadence honors the accountant's reminder-frequency settings (REQ-DASH-008) and the
notification model (in-portal primary, email digest fallback — REQ-MSG-007/008/009). This generalizes the
overdue-document auto-reminder (REQ-MSG-018) into a lifecycle-wide accountability engine.

## Acceptance criteria
- **AC-MSG-019-01** — The system identifies outstanding client obligations across the engagement lifecycle,
  spanning more than one category (e.g. unsigned letter, incomplete onboarding, missing/overdue documents,
  unanswered questions).
- **AC-MSG-019-02** — The system proactively follows up with the client on outstanding obligations without
  the accountant initiating each follow-up.
- **AC-MSG-019-03** — The client is presented a consolidated, current view of everything needed from them for
  an engagement.
- **AC-MSG-019-04** — Automated follow-up respects the accountant's configured reminder frequency (global and
  per-engagement) and the email-digest fallback model, rather than emitting per-event emails.
- **AC-MSG-019-05** — When a client satisfies an outstanding item, it stops being followed up on and is
  removed from the "what's needed" view.
- **AC-MSG-019-06** — The accountant can see, per engagement, what is outstanding from the client and the
  follow-up activity that has occurred.

## Notes
- **v2 capability — the central thesis of the vision-expansion seed.** Generalizes REQ-MSG-018; overdue-
  document reminders remain a subset of this engine.
- Draws its outstanding-item sources from onboarding (REQ-ONBD-001/002), documents (REQ-FILE-008,
  REQ-FILE-016), and outstanding questions (REQ-LIFE-013).
- Honors the notification model (REQ-MSG-007/008/009) and reminder cadence (REQ-DASH-008) — it is a new
  detection/orchestration capability, not a new notification channel.
- "Showing clients exactly what is needed" (the consolidated client-facing view) is captured here as
  AC-MSG-019-03 rather than as a separate client-dashboard requirement.

## Links
- Related: REQ-MSG-018 (overdue-document auto-reminder — the subset this generalizes), REQ-MSG-007/008/009
  (notification model + email digest), REQ-DASH-008 (reminder cadence), REQ-FILE-008 (document checklist),
  REQ-FILE-016 (prior-year expected-document detection), REQ-LIFE-013 (outstanding-question tracking),
  REQ-ONBD-001 (onboarding steps)
- Open questions: none
