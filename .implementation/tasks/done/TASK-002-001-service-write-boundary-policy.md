---
brief: BRIEF-002
status: done
assigned_to: webapp-developer
updated_by: webapp-developer (2026-06-16T12:45:00Z)
depends_on: none
impl: developer
e2e_required: no
started_at: 2026-06-16T07:01:42Z
completed_at: 2026-06-16T07:51:00Z
complexity_estimate: "3"
complexity_actual: "3"
brief_type: feature
brief_deploys: no
introduces_gate: yes
acceptance_criteria: AC-DOOR-002-05 (the defining invariant — only the accountant may change the catalog; CLIENT + anonymous are rejected at the trust boundary)
upstream_refs: ADR-005 (security policies are the write boundary), ADR-003 (SESSION_CONTEXT identity), ADR-012 (testing pyramid — tier-3 obligation)
---

# TASK-002-001: Close the Service write-boundary gap — accountant-only write security policy + tier-3 RLS test

---

## Quality Gates

- [x] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [x] **Submission gate** — lint + type-check + build PASS; `pnpm --filter @tax-portal/db test -- src/service.rls.test.ts` 10/10 PASS; full `pnpm --filter @tax-portal/db test` 35/35 PASS (no regressions)
- [N/A] **Targeted e2e** — this is a tier-3 DB-policy integration test, not e2e (the e2e journeys live in TASK-002-004)
- [x] **Security review** — fail-closed on null SESSION_CONTEXT confirmed (test 8 passes: null-context INSERT rejected with block predicate error); CLIENT rejection confirmed on INSERT/UPDATE/DELETE (tests 4–6 all pass); ACCOUNTANT + admin writes confirmed allowed (tests 1–3 pass). Policy SQL unchanged — correct.
- [x] **SDET Review** — approved

## SDET Review focus areas

- **Security-policy task → per-policy integration test is a HARD requirement (CLAUDE.md § SDET, ADR-005 §6).** Verify the tier-3 test proves: (a) ACCOUNTANT INSERT/UPDATE/DELETE succeeds, (b) CLIENT INSERT/UPDATE/DELETE is rejected by the policy (not the app layer), (c) null/anonymous SESSION_CONTEXT write is rejected, (d) CLIENT SELECT of active rows still succeeds (read boundary unchanged — regression guard).
- **Gate Authoring Rules (ENGINE.md):** `Introduces-gate: yes` — the Work Log must contain the three evidence items (run marker + step name, named code path = the new write-predicate function, counterfactual that would red the gate).
- **Verify the latent gap is actually closed** — the BLOCK predicates must reference a write-specific predicate function that does NOT grant CLIENT, while the FILTER predicate keeps the read function that DOES grant CLIENT.
- **Idempotency** — the policy SQL must be re-runnable (DROP IF EXISTS + CREATE OR ALTER), applied via `scripts/db-migrate.ts` (GO-batch split).

## Context

EPIC-001 delivered `db/policies/0002-service-readable.sql` for the **read** side only. Its BLOCK predicates
(INSERT/UPDATE/DELETE) reuse `sec.fn_service_access`, whose **branch 3 returns `allowed = 1` for the CLIENT
role** — so a CLIENT principal currently **passes** the write block predicate even though the header comment
says "only ACCOUNTANT / admin can mutate." EPIC-001 never exercised the write path, so the gap is latent.

This task closes it: CLIENT keeps SELECT of active services (read boundary unchanged), but
INSERT/UPDATE/DELETE must pass for **ACCOUNTANT / admin only** and reject CLIENT + anonymous, enforced at the
SQL Server security-policy trust boundary. This is the defining invariant of **AC-DOOR-002-05** and the
slice's primary risk per the brief.

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `db/policies/0002-service-readable.sql` | Modify | Add a write-specific predicate function `sec.fn_service_write_access` (no CLIENT branch); rewire the four BLOCK predicates (AFTER INSERT / BEFORE UPDATE / AFTER UPDATE / BEFORE DELETE) to use it. Keep the FILTER PREDICATE on `fn_service_access` (read — CLIENT allowed). Update header comment to reflect the read/write split. |
| `packages/db/src/service.rls.test.ts` | Create | Tier-3 integration test (real SQL Server) proving the write boundary — model on `packages/db/src/engagement-request.rls.test.ts` (raw mssql, two pools, GO-batch helper). |

## Tests to Write First

- [ ] `[AC-DOOR-002-05] ACCOUNTANT INSERT/UPDATE/DELETE on Service succeeds` — expected: write commits
- [ ] `[AC-DOOR-002-05] CLIENT INSERT is rejected by sec.pol_Service block predicate` — expected: write fails at the DB boundary (error / 0 rows affected per block-predicate semantics)
- [ ] `[AC-DOOR-002-05] CLIENT UPDATE is rejected` — expected: rejected
- [ ] `[AC-DOOR-002-05] CLIENT DELETE is rejected` — expected: rejected
- [ ] `[AC-DOOR-002-05] null/anonymous SESSION_CONTEXT write is rejected (fail-closed)` — expected: rejected
- [ ] `[AC-DOOR-002-05] CLIENT SELECT of active services still returns rows (read boundary regression guard)` — expected: rows returned

## Implementation Notes

- The read predicate `sec.fn_service_access` (FILTER) stays as-is (CLIENT reads active services for the public page).
- Author a parallel `sec.fn_service_write_access(@id)` that passes only for `IS_MEMBER('app_admin_role') = 1`
  OR `SESSION_CONTEXT(N'role') = N'ACCOUNTANT'` — **no CLIENT branch**, null SESSION_CONTEXT fails closed.
- Both functions are `WITH SCHEMABINDING`, sole-statement-per-batch (GO-separated) per SQL Server + the
  existing file convention.
- Note SQL Server BLOCK predicate semantics: a violating INSERT/UPDATE/DELETE raises error 33504 — assert on
  the rejection, not on a silent 0-row outcome, where applicable.
- // DECISION: a separate write predicate function is required (not a flag on the shared one) because read and
  write authorization diverge for CLIENT — record this in the Work Log and as a SQL comment.

## Definition of Done

- [x] AC-DOOR-002-05 enforced at the security policy (CLIENT + anonymous write rejected; ACCOUNTANT/admin write allowed)
- [x] CLIENT read of active services unchanged (regression guard test green — test 9 confirms)
- [x] Tier-3 integration test green against the live SQL Server container; output in Work Log
- [x] Lint + type-check + build pass
- [x] Gate Authoring three-item evidence recorded in Work Log (file header + Work Log)

---

## Work Log

### 2026-06-16 [webapp-developer] Starting implementation — service write-boundary policy + tier-3 RLS test
**What was done:** Dispatch checkpoint recorded. Read ENGINE.md, developer.md, task spec, ADR-005, ADR-003, ADR-012, existing policy file (db/policies/0002-service-readable.sql), and the engagement-request RLS test pattern. Gap confirmed: all four BLOCK predicates reference fn_service_access which has a CLIENT branch (branch 3), so CLIENT currently passes write blocks. Fix: add sec.fn_service_write_access (no CLIENT branch, fail-closed) and rewire the four BLOCK predicates to it. FILTER PREDICATE stays on fn_service_access.
**What's next:** (1) Modify db/policies/0002-service-readable.sql; (2) Create packages/db/src/service.rls.test.ts; (3) Docker pre-flight; (4) pnpm db:policies:apply; (5) Run submission gate.
**Blockers:** None yet.

### 2026-06-16 [webapp-developer] Implementation complete — env blocker for test execution
**What was done:**
- Modified `db/policies/0002-service-readable.sql`: Added `sec.fn_service_write_access` (no CLIENT branch, fail-closed) and rewired all four BLOCK predicates (AFTER INSERT / BEFORE UPDATE / AFTER UPDATE / BEFORE DELETE) to use it. FILTER PREDICATE stays on `fn_service_access` (CLIENT allowed). DECISION comment and header documentation updated.
- Created `packages/db/src/service.rls.test.ts`: Tier-3 integration test with 9 tests covering AC-DOOR-002-05: ACCOUNTANT INSERT/UPDATE/DELETE succeeds; CLIENT INSERT/UPDATE/DELETE rejected (error 33504 assertion); null SESSION_CONTEXT rejected; CLIENT SELECT regression guard. Gate Authoring evidence embedded in file header.
- Submission gate: `pnpm lint` PASS, `pnpm type-check` PASS, `pnpm build` PASS.
- Docker pre-flight: SQL Server container healthy (tax-portal-sqlserver on port 14330).

**Env blocker hit:**
- `.env.local` contains stub URLs: `DATABASE_URL_ADMIN=sqlserver://localhost:14330` (27 chars, no credentials, no database, no trustServerCertificate). Same for `DATABASE_URL`.
- Existing tests confirmed broken identically: `engagement-request.rls.test.ts` and `audit-event.rls.test.ts` both fail with `ConnectionError: Login failed for user 'taxportal_user'`.
- SQL Server server-principal query confirms only `taxportal_admin` exists as a login; `taxportal_user` does not exist yet (migration `0001-create-principals-and-sec-schema.sql` not applied because admin URL is also a stub).
- `env.local.tmp` at repo root contains the correct corrected URLs (documented by a prior session fix for this exact environment) — but the permission system blocked editing `.env.local` to apply them, and the task spec's hard-stop instruction applies: "do NOT fabricate test execution output; escalate to IO."
- `pnpm db:policies:apply` also failed: `Failed to connect to localhost:14330 - self-signed certificate` (URL stub has no trustServerCertificate=true).

**What's next:** **Escalation to IO** — env fix needed before test gate can run.
**Blockers:** `.env.local` stub DATABASE_URLs; `taxportal_user` login absent from DB.

**Escalation: IO consultation requested**

The env is in the exact broken state described in the task spec's hard-stop caveat. `env.local.tmp` (at repo root) contains the correct replacement DATABASE_URL values. The fix is:
1. Replace the two stub lines in `.env.local` with the correct values from `env.local.tmp`.
2. Run `pnpm db:migrate` (with the corrected admin URL) to create `taxportal_user` login and apply the migrations.
3. Run `pnpm db:policies:apply` to apply the updated `0002-service-readable.sql` policy.
4. Run `pnpm --filter @tax-portal/db test -- src/service.rls.test.ts` to execute the tier-3 test.

The implementation files are complete and correct. The submission gate can proceed once the user/IO restores the env. All dev-owned quality gates except the tier-3 test run are passing.

### 2026-06-16 [webapp-developer] Detection helper fixed — submission gate green, status → review

**Root cause of 4 failures:** The `isBlockPredicateError` helper used a case-sensitive `errMsg.includes("BLOCK")` check. The actual SQL Server block-predicate error message is: _"The attempted operation failed because the target object 'tax_portal.dbo.Service' has a block predicate that conflicts with this operation."_ — lowercase "block predicate", no "BLOCK", no "33504" in the message string, no "security policy". None of the four original substrings matched.

**Fix applied (packages/db/src/service.rls.test.ts):** All four negative-test detection helpers (CLIENT INSERT, CLIENT UPDATE, CLIENT DELETE, null-context INSERT) updated to use `errMsgLower.includes("block predicate")` (case-insensitive via `.toLowerCase()`) alongside the existing alternatives (`"33504"`, `"blocked by"`, `"pol_Service"`, `"security policy"` — now also lowercased where appropriate). No logic weakening — the test still asserts the write was rejected; only the detection of the rejection message was corrected.

**Gate Authoring Evidence — Item 1, in-flight regression form (TASK-002-001, Introduces-gate: yes):**

This tier-3 write-boundary gate runs **locally against the SQL Server container** — CI does not provision the DB, so the gate has no GitHub Actions run URL by design; its Item-1 evidence is the local red-then-green sequence (ENGINE.md § Gate Authoring Rules § In-flight regression exception).

RED: First run of `pnpm --filter @tax-portal/db test -- src/service.rls.test.ts` — the four negative tests (CLIENT INSERT/UPDATE/DELETE, null-context INSERT) FAILED. The new gate's `isBlockPredicateError` detection helper used a case-sensitive `errMsg.includes("BLOCK")`, but SQL Server emits the rejection as lowercase "...has a block predicate that conflicts with this operation." — no uppercase "BLOCK", no "33504" in the string — so the rejection went undetected and the gate was RED on 4/10.

GREEN: After fixing all four detection helpers to match `errMsgLower.includes("block predicate")` (case-insensitive, assertion strength unchanged — `caughtError.not.toBeNull()` still asserts the write was actually rejected), the same targeted run went GREEN at 10/10 (output below), and the full `@tax-portal/db` suite passed 35/35 with no regressions.

**Run Marker (green run):**

```
> @tax-portal/db@0.0.1 test /home/ccox/repos/tax-portal/packages/db
> vitest run src/service.rls.test.ts

 RUN  v3.2.6 /home/ccox/repos/tax-portal/packages/db

 ✓ src/service.rls.test.ts (10 tests) 180ms

 Test Files  1 passed (1)
      Tests  10 passed (10)
   Start at  07:39:10
   Duration  498ms
```

**Full regression suite (pnpm --filter @tax-portal/db test):**

```
 ✓ src/engagement-request.rls.test.ts (4 tests) 115ms
 ✓ src/audit-event.rls.test.ts (9 tests) 222ms
 ✓ src/engagement-request.persistence.test.ts (5 tests) 220ms
 ✓ src/service.rls.test.ts (10 tests) 142ms
 ✓ src/session-context.propagation.test.ts (4 tests) 93ms
 ✓ src/services.query.test.ts (3 tests) 107ms

 Test Files  6 passed (6)
      Tests  35 passed (35)
```

**Named code path:** `sec.fn_service_write_access` in `db/policies/0002-service-readable.sql` — the four BLOCK PREDICATEs (AFTER INSERT / BEFORE UPDATE / AFTER UPDATE / BEFORE DELETE) on `dbo.Service` that reference this function (no CLIENT branch).

**Counterfactual:** Adding `OR CAST(SESSION_CONTEXT(N'role') AS NVARCHAR(16)) = N'CLIENT'` to `fn_service_write_access` would cause tests 4–6 + 8 to PASS (writes succeed instead of throwing), failing the gate.

**What's next:** SDET review.
**Blockers:** None.

### 2026-06-16 [sdet] SDET review complete — approved, Status → done
**Decision:** Approved. `service.rls.test.ts` 10/10 independently re-executed (PASS). Full `@tax-portal/db` suite 35/35 (PASS). Lint + type-check independently confirmed clean. All 10 review focus items verified: per-policy integration test covers all ADR-005 §6 cases; latent CLIENT-passes-BLOCK gap closed by distinct `fn_service_write_access` with no CLIENT branch; all 4 BLOCK predicates rewired; FILTER predicate unchanged; 3-item Gate Authoring evidence verified (run marker + named code path + counterfactual); detection-helper fix confirmed to not weaken assertions (double-assert pattern intact); idempotency confirmed; upstream refs ADR-005/ADR-003/ADR-012 all satisfied. `Complexity-actual: 3` in range. `Completed-at: 2026-06-16T07:51:00Z`.

## SDET Review

**Decision**: approved

**Reviewer**: sdet (2026-06-16T07:51:00Z)

**What was verified and how:**

1. **Mandatory rejection checks — all pass.** Pre-implementation Dispatch Checkpoint entry present ("Starting implementation" Work Log entry with status flip, `Started-at: 2026-06-16T12:01:42Z`, `Complexity-estimate: 3`). `Complexity-actual: 3` — integer in range 1–5. All required task-spec fields present (`**Acceptance criteria:**`, `**Upstream refs:**`, `**Introduces-gate:** yes`). No tool-hygiene violations in the Work Log. All dev-owned Quality Gate boxes ticked. No e2e requirement for this task (`E2e-required: no` — tier-3, not e2e).

2. **Independent re-execution of the tier-3 test suite.** Docker pre-flight: `tax-portal-sqlserver` healthy on port 14330. Re-ran `pnpm --filter @tax-portal/db test -- src/service.rls.test.ts` → **10/10 PASS** (165ms). Re-ran full `pnpm --filter @tax-portal/db test` → **35/35 PASS** (6 files, 1.22s). Confirmed the Work Log's claimed output is accurate.

3. **Lint and type-check independently re-executed.** `pnpm lint` — PASS (zero errors). `pnpm type-check` — PASS (zero errors). Consistent with the Work Log.

4. **Per-policy integration test — HARD requirement (ADR-005 §6, CLAUDE.md § SDET).**
   - (a) ACCOUNTANT INSERT/UPDATE/DELETE — tests 1–3: each asserts a valid id is returned or `rowsAffected = 1`. Positive path proven.
   - (b) CLIENT INSERT/UPDATE/DELETE rejected at the DB policy boundary — tests 4–6: double assertion — `caughtError` is NOT null (write was rejected) AND error message matches a block-predicate pattern. The write cannot silently succeed and pass.
   - (c) Null SESSION_CONTEXT write rejected (fail-closed) — test 7: same double-assertion pattern; no SESSION_CONTEXT set on the request pool.
   - (d) CLIENT SELECT of active rows returns rows — test 8 (read regression guard): asserts `count >= 1` after seeding a row via admin pool. Read boundary confirmed unchanged.
   - Additional: admin pool reads all rows (RLS-exempt, test 9); null SESSION_CONTEXT SELECT returns 0 rows (fail-closed, no error, test 10).

5. **Latent gap actually closed.** Read `db/policies/0002-service-readable.sql` directly. `fn_service_access` (FILTER predicate) retains the CLIENT branch — read boundary unchanged. `fn_service_write_access` (BLOCK predicate) has NO CLIENT branch and NO anonymous branch — explicitly documented with comments in the SQL. All four BLOCK predicates (AFTER INSERT / BEFORE UPDATE / AFTER UPDATE / BEFORE DELETE) reference `fn_service_write_access`. FILTER predicate references `fn_service_access`. The two functions are distinct; a CLIENT write hits the write function and is rejected; a CLIENT read hits the read function and is permitted. Gap is closed.

6. **Gate Authoring Rules — 3-item evidence (ENGINE.md § Gate Authoring Rules, `Introduces-gate: yes`).**
   - (i) Run marker + step name: Work Log contains the full Vitest output block showing `service.rls.test.ts (10 tests) PASS` at `07:39:10`, invoked as `pnpm --filter @tax-portal/db test -- src/service.rls.test.ts`. Step name is the specific targeted invocation naming the file.
   - (ii) Named code path: `sec.fn_service_write_access` in `db/policies/0002-service-readable.sql` — specifically the four BLOCK predicates on `dbo.Service`. Cited in both the Work Log and the test file header.
   - (iii) Counterfactual: "Adding `OR CAST(SESSION_CONTEXT(N'role') AS NVARCHAR(16)) = N'CLIENT'` to `fn_service_write_access` would cause tests 4–6 + 8 to PASS (writes succeed instead of throwing), failing the gate." Concrete, specific, and verifiable.

7. **Detection-helper fix did not weaken assertions.** Original failure: `errMsg.includes("BLOCK")` never matched the actual SQL Server message "block predicate" (lowercase). Fix: added `errMsgLower.includes("block predicate")` (and additional case-insensitive alternatives). Crucially: the negative tests still assert `caughtError.not.toBeNull()` first — if the write silently succeeded, this assertion would fail regardless of the detection helper. Policy SQL (`0002-service-readable.sql`) was not changed to make tests pass — confirmed by direct read. The fix addressed only the rejection-message detection, not the rejection requirement.

8. **Idempotency.** `CREATE OR ALTER FUNCTION` for both predicate functions; `DROP SECURITY POLICY IF EXISTS` + `CREATE SECURITY POLICY` for the policy; GO-batch splitting consistent with `scripts/db-migrate.ts` conventions. Fully re-runnable.

9. **Upstream ref compliance.** ADR-005 §6 per-policy integration test — satisfied (full coverage of positive/negative/accountant/admin/null-identity cases). ADR-003 SESSION_CONTEXT — correctly used (`@read_only=0` in tests for mutable test setup; production path uses `@read_only=1` as documented in the test helper comment). ADR-012 tier-3 obligation — satisfied; this is a tier-3 integration test against the real SQL Server container.

10. **Security.** Fail-closed on null SESSION_CONTEXT verified by test. Policy SQL uses the ITVF `@serviceId` parameter (no injection surface). Test helpers use string interpolation for SQL only in test bodies (not production code paths). No HTTP endpoints, auth flows, or OWASP-relevant surfaces introduced by this task. No new dependencies added.

**Notes:** `Complexity-actual: 3` confirmed in range. The env-blocker episode was resolved externally (main session bootstrapped the DB); the developer correctly escalated and did not fabricate test output. The detection-helper fix was the only test-code change after the initial implementation; it was the right fix and did not weaken the gate.

---

## Attempt Log
