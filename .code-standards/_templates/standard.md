---
id: CS-<LANG>-NNN
title: <short imperative rule>
language: <typescript | sql | cross-cutting | infra>
polarity: do                  # do | dont  — the "dos and don'ts" framing
rating: recommended           # experimental | recommended | required | deprecated  (= enforcement weight)
status: active                # active | superseded
verification: <how a reviewer confirms compliance — the evidence hook>   # MANDATORY
source:                       # provenance: the authority that OWNS the rule (pointer, not copy)
  - ADR-NNN | CLAUDE.md#<section> | <path>
related: []                   # CS-... / ADR-... ids
rating_history:               # promote/demote audit trail; the initial entry records a REAL decision
  - { rating: recommended, date: <YYYY-MM-DD>, by: agent, rationale: <why this initial rating> }
open_questions: []            # SQ-NNN ids blocking adoption (empty when active)
---

# CS-<LANG>-NNN — <title>

## Rule
<The do/don't stated plainly. POINTER, NOT COPY: for an ADR-/CLAUDE.md-backed rule, state it in one
imperative sentence and cite `source:` — the authoritative text stays in the ADR. Author the full rule
text here ONLY for an uncodified convention that has no upstream home.>

## Rationale
<Why it exists — one short paragraph.>

## Verification
<How compliance is confirmed and cited as evidence (the evidence hook). MANDATORY on every standard.>

## Examples
<!-- OPTIONAL. Expected on pattern/syntax standards (TS, SQL); omit on conceptual ones (most GEN, some
     INFRA). Keep snippets minimal and behavior-focused so they resist rot as the codebase evolves.
     Delete this whole section when omitted. -->
- do: `<one-line compliant example>`
- don't: `<one-line violating example>`

## Links
- Source: <ADR-... / CLAUDE.md#... / path>
- Related: <CS-... , or "none">
- Open questions: <SQ-... , or "none">
