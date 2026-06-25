---
id: CS-SQL-003
title: RLS predicates are inline TVFs, shallow, admin/accountant-first, fail-closed
language: sql
polarity: do
rating: required
status: active
verification: Each predicate in `db/policies/` uses `RETURNS TABLE` (inline TVF, not multi-statement), reaches the ownership boundary by inline `EXISTS` over the established `fn_*_access` shape (reusing the ownership/participant logic — not re-deriving it), places the `IS_MEMBER('app_admin_role')` and ACCOUNTANT-role branches first, and yields zero rows (read) / a BLOCK error (write) when `SESSION_CONTEXT` is null. A reviewer checks the predicate body against the ADR-005 §2 skeleton. Access-set tables (ADR-005 §5 Mitigation A) are a **performance escalation path**, not a structural correctness gate — required only when a predicate's join cost is shown to regress scoped-query plans.
source:
  - ADR-005#2
  - ADR-005#5
  - ADR-003#5
related: [CS-SQL-001, CS-TS-001]
rating_history:
  - { rating: required, date: 2026-06-20, by: agent, rationale: "born required — ADR-005 §2/§5 fixes this skeleton; the inline-TVF rule is called 'non-negotiable' and fail-closed null handling is the core safety property" }
  - { rating: required, date: 2026-06-25, by: user, rationale: "reconciled the 'shallow' clause to the as-built RLS layer (ratified during EPIC-017 PR #104 standards review). The original '≤1 JOIN to the ownership boundary, deeper chains go to access-set tables' clause was stricter than every merged engagement-scoped policy (0005/0007/0009/0011) and not achievable at SECURITY POLICY predicate scope, where SQL Server cannot nest inline TVFs — so a participant/owner reach must inline the engagement→participant joins via EXISTS. Access-set tables remain the documented performance escalation (ADR-005 §5 Mitigation A), not a hard structural requirement. The non-negotiable core — inline TVF, admin/accountant-first, fail-closed null handling, reuse of fn_*_access — is unchanged. Rating stays `required` on that core." }
open_questions: []
---

# CS-SQL-003 — RLS predicates are inline TVFs, shallow, admin/accountant-first, fail-closed

## Rule
Per **ADR-005 §2/§5** and **ADR-003 §5**, every RLS predicate function: uses `RETURNS TABLE` (an inline
TVF, never a multi-statement TVF); reaches the ownership boundary by inline `EXISTS` **reusing the
established `fn_*_access` ownership/participant logic** (not a re-derived bespoke join), kept **as shallow as
the boundary allows** — note that SECURITY POLICY predicate scope cannot nest inline TVFs, so a
participant/owner reach inlines the engagement→participant `EXISTS` directly; lists the admin
(`IS_MEMBER('app_admin_role')`) and ACCOUNTANT branches **first**; and is **fail-closed** — a null
`SESSION_CONTEXT` yields zero rows on reads and a BLOCK error on writes. **Access-set tables** (ADR-005 §5
Mitigation A) are the **performance escalation** for a predicate whose join cost regresses scoped-query
plans — not a blanket structural requirement for every multi-join reach.

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
