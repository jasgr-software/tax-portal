---
id: CS-GEN-002
title: Edits to keyed artifacts are additive and non-destructive
language: cross-cutting
polarity: do
rating: recommended
status: active
verification: A change to a keyed artifact corpus (REQ-*, ADR-*, EPIC-*, CS-*, the coverage/advancement ledgers) adds or updates only what changed; unchanged keyed items are left byte-for-byte intact, ids are never reused, and retirement is an explicit, summarized action (status flip, not deletion). A reviewer diffs the change for silent drops or renumbering.
source:
  - CLAUDE.md#Main-Session-Rules
related: [CS-GEN-003]
rating_history:
  - { rating: recommended, date: 2026-06-20, by: agent, rationale: "born recommended — the additive/non-destructive discipline is a consistent convention across .requirements/.architecture/.planning and the merge policy, but enforced by review, not CI" }
open_questions: []
---

# CS-GEN-002 — Edits to keyed artifacts are additive and non-destructive

## Rule
When re-ingesting or editing a keyed-artifact corpus (requirements, ADRs, epics, code standards, the
coverage and advancement ledgers), add or update only what changed; leave unchanged keyed items intact,
never reuse an id, and treat retirement as an explicit, summarized action (flip `status`, don't delete).
This mirrors the layer convention stated across the agent-service layers and **CLAUDE.md § Main Session
Rules** (append-only logs are never rewritten).

## Rationale
Keyed artifacts are cited as stable references from code, tests, and other layers. Silently dropping,
renumbering, or overwriting one breaks every citation that points at it — the exact drift this catalogue
exists to prevent.

## Verification
Diff the change: every removed or renumbered keyed line is either justified in the run summary as an
explicit retirement or is a defect. Append-only dated logs (e.g. progress/advancement archives) must not
be rewritten.

## Links
- Source: CLAUDE.md § Main Session Rules (append-only logs; additive edits)
- Related: CS-GEN-003
- Open questions: none
