---
id: CS-SQL-001
title: Every client-scoped table ships a SECURITY POLICY and a CLIENT-A/CLIENT-B RLS test
language: sql
polarity: do
rating: required
status: active
verification: For each table holding client-scoped data, a `SECURITY POLICY` exists in `db/policies/` AND a dedicated `<policy>.rls.test.ts` integration test proves the matrix in ADR-005 §6 — at minimum CLIENT-A reads own row (pass), CLIENT-A reads CLIENT-B's row (zero rows), CLIENT-A mutates CLIENT-B's row (BLOCK error), and null-identity (zero rows). "RLS was enabled" is not acceptance; "RLS was tested to fail closed" is.
source:
  - ADR-005#6
related: [CS-SQL-002, CS-SQL-003, CS-TS-001]
rating_history:
  - { rating: required, date: 2026-06-20, by: agent, rationale: "born required — ADR-005 §6 declares this a hard SDET gate; per-policy RLS tests run on every PR touching scoped tables" }
open_questions: []
---

# CS-SQL-001 — Every client-scoped table ships a SECURITY POLICY and a CLIENT-A/CLIENT-B RLS test

## Rule
Every table containing client-scoped data is covered by a SQL Server `SECURITY POLICY` keyed off
`SESSION_CONTEXT(N'clerk_user_id')`, **and** ships a dedicated integration test proving it fails closed.
Per **ADR-005 §6**, the CLIENT-A-cannot-read-CLIENT-B negative case (plus the full matrix) is a hard
requirement — a policy without its test is incomplete.

## Rationale
RLS correctness exists only in the database; the unit layer cannot prove it. The `.rls.test.ts` suite is
the only place the trust boundary is actually verified. A policy that is enabled but untested can fail
open silently on the next schema change.

## Verification
The cited evidence hook is the per-policy `<policy>.rls.test.ts` suite (ADR-005 §6 matrix) plus the
`scripts/validate-policies.ts` drift check that fails a PR when a scoped table lacks policy coverage. SDET
treats these as a dedicated review focus whenever a scoped table ships or changes.

## Examples
- do: `it('CLIENT-A cannot read CLIENT-B rows', () => withClerkIdentity('user_b', 'CLIENT', async () => expect(await db.engagement.findMany()).toHaveLength(0)))`
- don't: shipping `db/policies/025-engagement-policy.sql` with no `engagement.rls.test.ts` covering the negative case

## Links
- Source: ADR-005 §6 (test obligation)
- Related: CS-SQL-002, CS-SQL-003, CS-TS-001
- Open questions: none
