---
id: REQ-LIFE-002
title: Simplified client-facing status labels
domain: LIFE
type: feature
status: clarifying
source:
  - seed/SRS-snapshot.md#REQ-LIFE-002
  - seed/intake.md
open_questions: [OQ-002]
---

# REQ-LIFE-002 — Simplified client-facing status labels

## User need
Clients are not tax professionals and don't need to see the accountant's internal workflow vocabulary.
A client wants a clear, friendly, reassuring sense of where their engagement stands without being
exposed to internal-process terms (for example, the internal "Review" stage means the accountant is
checking her own work, which would confuse a client if shown verbatim).

## Proposed solution
The status a client sees for their engagement is presented using simplified, friendly labels that are
distinct from the internal stage names. Each internal stage maps to a client-facing label, and clients
only ever see the client-facing label.

## Acceptance criteria
- **AC-LIFE-002-01** — Each internal status (New, In Progress, Review, Complete) maps to a
  client-facing label that is shown to clients instead of the internal name.
- **AC-LIFE-002-02** — Clients never see the raw internal stage names.
- **AC-LIFE-002-03** — The client-facing labels read as plain, friendly language appropriate for a
  non-specialist (the exact wording is pending OQ-002).

## Open questions
- **OQ-002** — The exact client-facing label for each internal status (New, In Progress, Review,
  Complete) is not yet defined and must be confirmed by the product owner before this requirement can
  be marked accepted.

## Links
- Related: REQ-LIFE-001 (status pipeline), REQ-LIFE-004 (Review is internal-only)
- Open questions: OQ-002
