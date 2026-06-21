---
id: CS-TS-003
title: Apply shared patterns to both the portal and admin surfaces
language: typescript
polarity: do
rating: recommended
status: active
verification: A pattern, helper, or fix that belongs to the shared platform behavior is present in both `apps/portal` and `apps/admin` (or deliberately scoped to one with a stated reason). Confirmed by a mirror audit across both surfaces (`/mirror-audit`); audits/e2e sweeps default to both surfaces.
source:
  - CLAUDE.md#Platform-frontend-scope
  - ADR-006
related: [ADR-010]
rating_history:
  - { rating: recommended, date: 2026-06-20, by: agent, rationale: "born recommended — a real, repeatedly-applied CLAUDE.md convention with a mirror-audit tool, but advisory (not a hard CI gate); subject to the documented sunset trigger" }
open_questions: []
---

# CS-TS-003 — Apply shared patterns to both the portal and admin surfaces

## Rule
`apps/portal` (Client Portal) and `apps/admin` (Tax Portal) are two frontends of one platform
(**ADR-006**). Per **CLAUDE.md § Platform-frontend scope**, a shared pattern, helper, or fix lands in
**both** surfaces unless the task is explicitly scoped to one by name; cross-surface audits and e2e
sweeps default to both.

## Rationale
The two apps drift apart silently when a change is made to one and forgotten in the other — a recurring
class of defect this repo tracks with a dedicated mirror audit. Parity-by-default catches it before it
ships.

## Verification
Run the mirror audit across `apps/portal/**` and `apps/admin/**`; a shared pattern present in one but
missing in the other is a finding unless the divergence is stated and justified. (CLAUDE.md notes a
sunset trigger: 3 consecutive clean Close-prep retros flag this rule for keep/remove review.)

## Links
- Source: CLAUDE.md § Platform-frontend scope, ADR-006 (monorepo layout)
- Related: ADR-010 (cross-app navigation)
- Open questions: none
