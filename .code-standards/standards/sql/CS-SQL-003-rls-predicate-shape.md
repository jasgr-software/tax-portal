---
id: CS-SQL-003
title: RLS predicates are inline TVFs, shallow, admin/accountant-first, fail-closed
language: sql
polarity: do
rating: required
status: active
verification: Each predicate in `db/policies/` uses `RETURNS TABLE` (inline TVF, not multi-statement), reaches the ownership boundary in at most one JOIN, places the `IS_MEMBER('app_admin_role')` and ACCOUNTANT-role branches first, and yields zero rows (read) / a BLOCK error (write) when `SESSION_CONTEXT` is null. A reviewer checks the predicate body against the ADR-005 §2 skeleton.
source:
  - ADR-005#2
  - ADR-005#5
  - ADR-003#5
related: [CS-SQL-001, CS-TS-001]
rating_history:
  - { rating: required, date: 2026-06-20, by: agent, rationale: "born required — ADR-005 §2/§5 fixes this skeleton; the inline-TVF rule is called 'non-negotiable' and fail-closed null handling is the core safety property" }
open_questions: []
---

# CS-SQL-003 — RLS predicates are inline TVFs, shallow, admin/accountant-first, fail-closed

## Rule
Per **ADR-005 §2/§5** and **ADR-003 §5**, every RLS predicate function: uses `RETURNS TABLE` (an inline
TVF, never a multi-statement TVF); is **shallow** (≤ one JOIN to the ownership boundary, deeper chains go
to access-set tables); lists the admin (`IS_MEMBER('app_admin_role')`) and ACCOUNTANT branches **first**;
and is **fail-closed** — a null `SESSION_CONTEXT` yields zero rows on reads and a BLOCK error on writes.

## Rationale
Inline TVFs are inlined by the optimiser; multi-statement TVFs kill cardinality estimation and run on
every scoped query. Admin/accountant-first short-circuits the common path without joining. Fail-closed
null handling is the property that turns a forgotten identity into "no rows," not "all rows."

## Verification
The cited evidence hook: the predicate body in `db/policies/` matches the ADR-005 §2 skeleton, and the
policy's `.rls.test.ts` (see [[CS-SQL-001]]) includes the null-identity case proving zero rows.

## Examples
- do: `CREATE FUNCTION sec.fn_engagement_access(@clientId ...) RETURNS TABLE WITH SCHEMABINDING AS RETURN (SELECT 1 WHERE IS_MEMBER('app_admin_role')=1 OR ... )`
- don't: `RETURNS @r TABLE (...) AS BEGIN ... END` // multi-statement TVF — opaque to the optimiser

## Links
- Source: ADR-005 §2 (predicate library), §5 (performance rules), ADR-003 §5 (fail-closed semantic)
- Related: CS-SQL-001, CS-TS-001
- Open questions: none
