---
id: REQ-NFR-004
title: Maintainable, conventional technology foundation
domain: NFR
type: constraint
status: accepted
source:
  - seed/SRS-snapshot.md#REQ-NFR-004
  - seed/intake.md
open_questions: []
---

# REQ-NFR-004 — Maintainable, conventional technology foundation

## User need
This is a custom-built product for a solo practitioner that must remain affordable to maintain and
straightforward to evolve over time. The system should be built on a coherent, widely-understood,
type-safe foundation so that future changes are predictable, defects are caught early, and the practice
is not locked into obscure or unsupportable choices. The user need here is durability and
maintainability of the product, not any particular technology.

## Normative criterion
- **AC-NFR-004-01** — The system is built on a single, internally consistent technology foundation that
  favors type safety and broadly-supported tooling, so the product remains maintainable and evolvable
  over its lifetime.

## Notes
- The seed row names a specific technology stack. Those are implementation decisions recorded outside
  this spec; only the intent — a maintainable, type-safe, conventional foundation — is captured as a
  requirement here.

## Links
- Related: REQ-NFR-003 (web-only delivery)
- Open questions: none
