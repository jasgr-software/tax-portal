---
id: CS-GEN-003
title: Cite the governing key in code and test comments
language: cross-cutting
polarity: do
rating: recommended
status: active
verification: Code or a test that exists to honor a specific decision/standard cites its key in a comment (e.g. `// ADR-003 §3`, `// DECISION: ...`, and — once this layer is consumed — `// CS-<LANG>-NNN`), so a reviewer can trace the implementation to its authority. A reviewer confirms non-obvious, decision-driven code carries the citation.
source:
  - ADR-003
  - CLAUDE.md#Key-Documentation
related: [CS-GEN-002]
rating_history:
  - { rating: recommended, date: 2026-06-20, by: agent, rationale: "born recommended — the repo already cites ADR keys in code/test comments (e.g. the ADR-003 // DECISION: convention); citing CS keys is the consumption path for THIS layer, which is deferred" }
open_questions: []
---

# CS-GEN-003 — Cite the governing key in code and test comments

## Rule
When code or a test exists specifically to honor a decision or standard, cite its key in a comment so the
implementation traces back to its authority — `ADR-NNN` / `// DECISION:` today (the convention ADR-003's
implementation contract already prescribes), and `CS-<LANG>-NNN` once this layer is consumed. This is the
**evidence-hook** mechanism: a key in a comment is how a reviewer confirms a standard was honored.

## Rationale
A decision-driven line of code looks arbitrary without its citation, and gets "simplified" away by the
next editor. The key turns tacit intent into a traceable, greppable reference — and is the consumption
contract for the whole `.code-standards/` layer.

## Verification
Review non-obvious, decision-driven code and tests for the citation. The evidence hook is the key itself:
grep for `CS-<LANG>-NNN` / `ADR-NNN` to find everything claiming to honor a given standard. (Consumption
of `CS-*` keys is a deferred pass — see `.code-standards/README.md` § Consumption contract.)

## Links
- Source: ADR-003 (the `// DECISION:` citation convention), CLAUDE.md § Key Documentation
- Related: CS-GEN-002
- Open questions: none
