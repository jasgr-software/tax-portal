---
id: REQ-ONBD-008
title: Dynamic, conditional intake organizer
domain: ONBD
type: feature
status: accepted
source:
  - seed/vision-expansion.md#dynamic-organizer
  - seed/vision-expansion.md#author-guidance-notes
open_questions: []
---

# REQ-ONBD-008 — Dynamic, conditional intake organizer

## User need
The v1 intake questionnaire (REQ-ONBD-003) asks every client of a given service the same fixed set of
questions — including ones that don't apply to them — and leaves it to the accountant to work out which
documents each client's situation calls for. A fully-remote practice that wants to minimize back-and-forth
needs the intake to adapt to each client's answers: skip irrelevant questions, and — based on what the
client reports — tell them exactly which documents they will need to provide. The client should be asked
only what matters, and the document checklist should reflect their actual situation without the accountant
assembling it by hand.

## Proposed solution
The intake organizer presented during onboarding adapts to the client's answers. Questions can be
conditional — shown or skipped based on earlier answers — so a client only answers what is relevant to
their situation. From the client's answers, the organizer derives the set of documents the client is
expected to provide and surfaces them as document requests on the engagement's checklist. The accountant
stays in control: she defines the conditional logic and the answer-to-document mapping when she authors the
organizer for a service type, and the derived document requests are available for her to review and adjust.
This is the v2 evolution of the static templated questionnaire in REQ-ONBD-003, which remains the v1
baseline.

## Acceptance criteria
- **AC-ONBD-008-01** — The organizer can present or omit questions based on the client's answers to earlier
  questions, so a client is not asked questions irrelevant to their reported situation.
- **AC-ONBD-008-02** — The accountant can define, per service type, the conditional logic governing which
  questions appear.
- **AC-ONBD-008-03** — From the client's submitted answers, the system derives a set of expected documents
  and adds them to the engagement's document checklist as document requests.
- **AC-ONBD-008-04** — The accountant can define, per service type, the mapping from client answers to the
  expected documents it produces.
- **AC-ONBD-008-05** — Document requests derived by the organizer are available for the accountant to review
  and adjust (add, remove, or modify) before they are relied upon.
- **AC-ONBD-008-06** — The client's answers continue to be recorded against the engagement (consistent with
  REQ-ONBD-003).

## Notes
- **v2 capability.** Builds on REQ-ONBD-003 (the v1 static questionnaire), which is unchanged.
- Derived document requests use the same document-request/checklist mechanism as REQ-FILE-007/008.
- **"Not a tax-prep tool" boundary respected:** the organizer maps answers to *document expectations*; it
  does not compute, project, or prepare tax.

## Links
- Related: REQ-ONBD-003 (static questionnaire — v1 baseline), REQ-ONBD-004 (initial document upload),
  REQ-FILE-007 (labeled document requests), REQ-FILE-008 (document checklist), REQ-FILE-016 (prior-year
  expected-document detection), REQ-DASH-012 (questionnaire template management)
- Open questions: none
