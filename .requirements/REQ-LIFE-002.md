---
id: REQ-LIFE-002
title: Simplified client-facing status labels
domain: LIFE
type: feature
status: accepted
source:
  - seed/SRS-snapshot.md#REQ-LIFE-002
  - seed/intake.md
open_questions: []
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
- **AC-LIFE-002-01** — Each internal status maps to a client-facing label shown to clients instead of
  the internal name, per this mapping: New → "Received", In Progress → "In Progress",
  Review → "In Progress", Complete → "Completed".
- **AC-LIFE-002-02** — Clients never see the raw internal stage names; in particular, the internal
  "Review" stage is not surfaced to the client and appears to them as "In Progress".
- **AC-LIFE-002-03** — From the client's perspective the engagement presents three distinct states:
  "Received", "In Progress", and "Completed".

## Notes
- **OQ-002 resolved (2026-06-13):** simplified client-facing labels with the internal Review stage
  hidden (it surfaces to the client as "In Progress"), consistent with REQ-LIFE-004. Mapping fixed in
  v1 (not accountant-configurable).

## Links
- Related: REQ-LIFE-001 (status pipeline), REQ-LIFE-004 (Review is internal-only)
- Open questions: none
