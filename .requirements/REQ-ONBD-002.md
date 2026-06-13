---
id: REQ-ONBD-002
title: Engagement letter e-sign is a hard gate
domain: ONBD
type: feature
status: accepted
source:
  - seed/SRS-snapshot.md#REQ-ONBD-002
  - seed/intake.md
open_questions: []
---

# REQ-ONBD-002 — Engagement letter e-sign is a hard gate

## User need
The engagement letter is the agreement that authorizes the accountant to do the work. Nothing else about
the engagement should proceed until the client has formally agreed to its terms. The accountant needs
certainty that no client shares information or documents, or otherwise advances onboarding, before the
letter is signed.

## Proposed solution
The engagement letter must be e-signed by the client before any other onboarding step becomes accessible.
This is a hard gate: until the letter is signed, the intake questionnaire and the initial document upload
step are unavailable to the client. Once the letter is e-signed, the remaining onboarding steps open.

## Acceptance criteria
- **AC-ONBD-002-01** — Until the engagement letter is e-signed, the intake questionnaire step is not
  accessible to the client.
- **AC-ONBD-002-02** — Until the engagement letter is e-signed, the initial document upload step is not
  accessible to the client.
- **AC-ONBD-002-03** — Once the engagement letter is e-signed, the subsequent onboarding steps become
  accessible to the client.
- **AC-ONBD-002-04** — The signed engagement letter is recorded against the engagement as evidence the
  gate was satisfied.

## Links
- Related: REQ-ONBD-001 (three sequential steps), REQ-IDNT-007 (default engagement-letter template)
- Open questions: none
