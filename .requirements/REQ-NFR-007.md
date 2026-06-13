---
id: REQ-NFR-007
title: Verified electronic signature of the engagement letter
domain: NFR
type: constraint
status: accepted
source:
  - seed/SRS-snapshot.md#REQ-NFR-007
  - seed/intake.md
open_questions: []
---

# REQ-NFR-007 — Verified electronic signature of the engagement letter

## User need
Before any work begins, the client must electronically sign the engagement letter, and the practice
needs reliable confirmation that the signature actually completed. This signature is the legal basis for
the engagement, so the system must not merely send a document for signing — it must receive trustworthy
confirmation that the signing finished, so onboarding can proceed only once the letter is genuinely
signed.

## Normative criterion
- **AC-NFR-007-01** — The engagement letter is signed through an electronic-signature capability, and the
  system receives a reliable completion confirmation that it uses to recognize the letter as signed
  before allowing onboarding to advance.

## Notes
- This captures the property — verified e-signature with trustworthy completion confirmation. The
  specific e-signature service, and whether it is self-hosted or a cloud service, are implementation
  decisions recorded outside this spec (an ADR), not requirements.
- **OQ-005 resolved (2026-06-13):** the self-hosted-vs-cloud hosting model is a HOW and is out of scope
  for the requirements layer; this requirement stands as the e-sign capability only, and the hosting
  choice is deferred to an implementation ADR. If an underlying driver later emerges (e.g. cost control
  or that signed documents must stay under the firm's control), it should be captured as its own
  WHAT-level NFR.

## Links
- Related: REQ-ONBD-002 (engagement-letter e-sign hard gate — Onboarding), REQ-IDNT-007 (engagement
  letter default template), REQ-DASH-013 (engagement letter template management)
- Open questions: none
