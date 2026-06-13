---
id: REQ-NFR-007
title: Verified electronic signature of the engagement letter
domain: NFR
type: constraint
status: clarifying
source:
  - seed/SRS-snapshot.md#REQ-NFR-007
  - seed/intake.md
open_questions:
  - OQ-005
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
  specific e-signature service is an implementation decision recorded outside this spec.

## Open questions
- **OQ-005** — Is the e-signature capability self-hosted or provided as a cloud service? This affects
  environment configuration, how the completion confirmation reaches the system, and operational cost.
  Unresolved; this requirement stays `clarifying` until answered.

## Links
- Related: REQ-ONBD-002 (engagement-letter e-sign hard gate — Onboarding), REQ-IDNT-007 (engagement
  letter default template), REQ-DASH-013 (engagement letter template management)
- Open questions: OQ-005
