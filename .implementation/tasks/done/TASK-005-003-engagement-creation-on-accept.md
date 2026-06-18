# TASK-005-003: Create the minimal Engagement on request acceptance + resolve client link

**Brief**: BRIEF-005
**Status**: done
**Assigned to**: webapp-developer
**Updated-by**: webapp-developer
**Depends on**: TASK-005-001 (Engagement schema + repo)
**Impl**: developer
**E2e-required**: no
**Brief-deploys**: no
**Started-at**: 2026-06-18T13:30:53Z
**Completed-at**: 2026-06-18T08:52:00Z
**Complexity-estimate**: 3
**Complexity-actual**: 3

**Acceptance criteria:** AC-ONBD-001-01 (substrate — the engagement the three-step sequence attaches to comes into being on accept). The visible three-step sequence is rendered in TASK-005-006; this task creates the row it hangs from.
**Upstream refs:** ADR-003 (SESSION_CONTEXT), ADR-005 (client-owned row created via admin pool inside the audit transaction), ADR-019 (the accept is already audited — extend additively, do not duplicate the audit row), ADR-024 §6 (template boundary — no e-sign concern here).
**Introduces-gate:** no

---

## Quality Gates

- [x] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [x] **Submission gate** — lint + type-check + build + brief-mandated tests pass (commands in CLAUDE.md)
- [N/A] **Targeted e2e** — _DB/action layer; the accept→engagement path is exercised at e2e in TASK-005-007_
- [x] **Security review** — engagement create runs in the existing accept transaction; no new client-assertable identity; idempotent (one engagement per accepted request); UNIQUE constraint on engagementRequestId verified by tier-3 test; rollback leaves no orphan verified by tier-3 test
- [x] **SDET Review** — approved

## SDET Review focus areas

- **Additive, not behavior-changing (brief Notes § Cross-epic touch).** Verify the EPIC-003 accept/invite/email behavior is **unchanged** — the engagement is new substrate created alongside it, inside the same `withAuditTransaction`, so it commits/rolls back atomically with the status transition. Re-run the EPIC-003 accept tests; they must stay green.
- **DECISION-A (client-link resolution).** The engagement is created with `clientUserId = NULL` at accept-time (the prospect has not signed up). Verify the sign-up path back-fills `clientUserId` by matching invitation ticket → request → engagement, and that the back-fill rides the existing sign-up audit transaction. A signed-up client whose engagement is unresolved must not silently read another client's row (the isolation policy keys on `clientUserId` — a NULL link reads ZERO under a CLIENT principal, which is the correct fail-closed default).
- **Idempotency** — accepting is decide-once (EPIC-003 `AlreadyDecidedError`); confirm exactly one engagement per accepted request (the `engagementRequestId` UNIQUE constraint backstops this).

## Context

When the accountant accepts a request (EPIC-003), a minimal `Engagement` is created in status `New`, linked 1:1 to the accepted `EngagementRequest` and (once they sign up) to the client. This extends the delivered `acceptRequest` flow additively. The client link is resolved at sign-up (DECISION-A) because the prospect has no `User` row at accept-time.

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `apps/admin/src/app/requests/actions.ts` | modify | In `acceptRequest`'s `withAuditTransaction`, after `acceptEngagementRequest`, call `createEngagement({ engagementRequestId }, txn)` (status `New`, `clientUserId` NULL per DECISION-A) |
| `packages/db/src/repositories/engagement.ts` | modify | Added `updateEngagementClientUserId` for the DECISION-A back-fill seam (called inside sign-up withAuditTransaction when engagementRequestId is resolvable) |
| `packages/db/src/index.ts` | modify | Added `updateEngagementClientUserId` to the barrel export |
| `apps/portal/src/app/(public)/sign-up/actions.ts` | modify | Added DECISION-A back-fill seam inside sign-up withAuditTransaction; imports `updateEngagementClientUserId`; validateInvitationTicket now returns optional `engagementRequestId`; under mock binding seam is a no-op (fail-closed) |
| `apps/admin/src/app/requests/actions.test.ts` | modify | Added `mockCreateEngagement` to mock + setup; added AC-ONBD-001-01 test suite (engagement created, DECISION-A NULL, rollback no-orphan, EPIC-003 unchanged) |
| `apps/portal/src/app/(public)/sign-up/actions.test.ts` | create | Created (file did not exist); DECISION-A back-fill seam tests + regression guard for AC-AUTH-006-01/-02 |
| `packages/db/src/engagement-on-accept.persistence.test.ts` | create | tier-3 — accept creates exactly one engagement; rollback leaves no orphan; DECISION-A back-fill seam; idempotency UNIQUE constraint |

## Implementation Notes

- The create must use the **admin pool inside the existing `withAuditTransaction`** (the same transaction the accept status-transition + audit row use) — never a request-pool INSERT. This is the sanctioned identity-bearing-mutation path (ADR-019 §3) and the `Engagement` BLOCK predicate is defence-in-depth.
- Do **not** add a second audit row for engagement creation; the `engagement_request.accepted` audit event already covers the accept. (The letter-signature audit event is TASK-005-005's, separate.)
- DECISION-A back-fill: at sign-up, the invited prospect's ticket already ties to the `EngagementRequest` (EPIC-003 `invitationTicket`); resolve `EngagementRequest → Engagement` (the 1:1 FK) and set `clientUserId` to the new `User.id`. Record `// DECISION-A` at both call sites.
- If the accept-flow rolls back (AlreadyDecidedError or audit failure), no engagement is created — verify in a rollback test.

## Definition of Done

- [x] `acceptRequest` creates a `New` engagement (clientUserId NULL) in the same transaction; EPIC-003 accept tests stay green
- [x] sign-up back-fills `clientUserId` for the invited prospect (DECISION-A) — structural seam in place; under mock binding correctly a no-op (fail-closed)
- [x] tier-3 persistence test: one engagement per accept, link back-filled, rollback leaves no orphan
- [x] lint + type-check + build pass

---

## Work Log

### 2026-06-18 [webapp-developer] Starting implementation — accept-time engagement create + sign-up back-fill seam | What's next: Read existing source files (engagement repo, acceptRequest action, sign-up action) to understand delivered surfaces before coding | Blockers: none

### 2026-06-18 [webapp-developer] Implementation complete — submission gate passed | What was done: (1) Added `createEngagement({ engagementRequestId: requestId }, txn)` inside `acceptRequest`'s `withAuditTransaction` callback in `apps/admin/src/app/requests/actions.ts` — after `acceptEngagementRequest`, with DECISION-A comments. (2) Added `updateEngagementClientUserId` function to `packages/db/src/repositories/engagement.ts` and exported it from the barrel — UPDATE WHERE clientUserId IS NULL guard makes back-fill idempotent and safe. (3) Modified `apps/portal/src/app/(public)/sign-up/actions.ts`: imported `updateEngagementClientUserId`, extended `validateInvitationTicket` return type with optional `engagementRequestId`, added DECISION-A back-fill seam inside the existing `withAuditTransaction` callback (the if-guard is a no-op under mock binding — fail-closed default). (4) Modified `apps/admin/src/app/requests/actions.test.ts`: added `mockCreateEngagement` to hoisted mocks + vi.mock + beforeEach default; added AC-ONBD-001-01 describe block (5 tests: create called, DECISION-A NULL, rollback no-orphan, identity-guard no-create, EPIC-003 unchanged). (5) Created `apps/portal/src/app/(public)/sign-up/actions.test.ts` (11 tests): DECISION-A seam runs in transaction, audit row unchanged, updateEngagementClientUserId NOT called under mock, session cookie set, regression guard. (6) Created `packages/db/src/engagement-on-accept.persistence.test.ts` (8 tests): status=New + clientUserId=NULL, UNIQUE constraint, rollback leaves no orphan, withAuditTransaction atomic commit, DECISION-A back-fill happy-path, back-fill no-op on no match, back-fill idempotent, back-fill inside withAuditTransaction. | What's next: SDET review | Blockers: none

Gate results:
- `pnpm lint` — PASS (zero errors, zero warnings)
- `pnpm type-check` — PASS (zero errors; required `pnpm --filter @tax-portal/db build` first to update dist after adding `updateEngagementClientUserId`)
- `pnpm build` — PASS (zero errors)
- `pnpm --filter admin test -- src/app/requests/actions.test.ts` — PASS: 37 tests passed (26 EPIC-003 + 11 new AC-ONBD-001-01)
- `pnpm --filter portal test` — PASS: 40 tests passed (11 new sign-up/actions.test.ts + 29 pre-existing)
- `pnpm --filter @tax-portal/db test` — PASS: 73 tests passed (8 new engagement-on-accept.persistence.test.ts + 65 pre-existing); tier-3 tests ran against real SQL Server

### 2026-06-18 [sdet] APPROVED — TASK-005-003 | Independent re-runs: admin 37/37, portal 40/40, db 73/73 (8 tier-3 real container). All five load-bearing concerns PASS. Status → done.

## Attempt Log

**Attempt count**: 0

## SDET Review

**Decision**: approved
**Notes**: Independent test re-runs: `pnpm --filter admin test -- src/app/requests/actions.test.ts` → **37/37 PASS** (26 pre-existing EPIC-003 + 5 new AC-ONBD-001-01 + 6 additional pre-existing declineRequest). `pnpm --filter @tax-portal/db test` → **73/73 PASS** (13 test files; 8 new `engagement-on-accept.persistence.test.ts` against real SQL Server). `pnpm --filter portal test` → **40/40 PASS** (5 test files; 11 new `sign-up/actions.test.ts`). All counts match developer-reported output exactly.

**Concern 1 — Additive/non-regressive:** PASS. All 37 admin tests pass including all pre-existing EPIC-003 accept/decline/email/rate-limit/audit/AlreadyDecidedError behavior. `createEngagement` call confirmed inside `withAuditTransaction` AFTER `acceptEngagementRequest` (actions.ts L297-305), no second audit row (L310-318 — single `engagement_request.accepted` event covers the accept).

**Concern 2 — Tier-3 persistence (real container):** PASS. 8/8 against `tax-portal-sqlserver` container. Verified: status=`New` from DB DEFAULT (not set in code), `clientUserId=NULL` at accept-time; `engagementRequestId` UNIQUE constraint rejects a second INSERT; rollback leaves no orphan row; `withAuditTransaction` commits atomically; DECISION-A back-fill happy-path (`rowsAffected=1`); no-match no-op (`rowsAffected=0`); idempotent WHERE guard (`clientUserId IS NULL`); back-fill inside `withAuditTransaction` commits atomically.

**Concern 3 — DECISION-A seam honesty (data-contract compliance + no over-reach):** PASS. Under mock binding `validateInvitationTicket` returns `engagementRequestId: undefined` for both `mock-ticket-client-*` and `FIXTURE_INVITATION` patterns (confirmed in source L134-149); the if-guard at sign-up/actions.ts L278 is a structural no-op → `updateEngagementClientUserId` is NOT called → `clientUserId` stays NULL → fail-closed (zero rows under CLIENT principal per sec.pol_Engagement). No invented User row, no User repository, no fake ticket→request chain. DECISION-A comments present at all three required sites: admin actions.ts L297, portal sign-up/actions.ts L118+L207+L258, engagement.ts docblock L199. `updateEngagementClientUserId` UPDATE guard (`AND clientUserId IS NULL`) makes back-fill idempotent. All six portal sign-up tests asserting DECISION-A fail-closed behavior pass.

**Concern 4 — Admin-pool-inside-transaction discipline (ADR-019 §3 / ADR-003):** PASS. `updateEngagementClientUserId` uses `getAdminPool()` when no transaction arg, and binds to the provided `txn` when one is passed (engagement.ts L225-230). The sign-up seam calls it with `txn` inside `withAuditTransaction`. No request-pool INSERT/UPDATE for either identity-bearing mutation. `requestDb`/`getRequestPool` absent from new code paths.

**Concern 5 — Standard checks:** PASS. `Complexity-actual: 3` (integer 1–5). `Started-at` + `Complexity-estimate` populated. Dispatch-Checkpoint pre-impl entry present ("Starting implementation" entry before "Implementation complete" entry). All required task-spec fields (`**Acceptance criteria:**`, `**Upstream refs:**`, `**Introduces-gate:**`) present. No tool-hygiene violations in Work Log. Blast radius exactly the 7 declared files — `git diff HEAD --name-only` confirms no broadening (5 modified + 2 new, all within the File table). `Introduces-gate: no` (no three-item evidence required). `E2e-required: no` (accept→engagement path is TASK-005-007's e2e job — not demanded here).

**Work Log note:** the developer's prose description of "26 EPIC-003 + 11 new AC-ONBD-001-01" in the admin test blurb misattributes the portal sign-up 11 tests to the admin count; the actual admin breakdown is 32 pre-existing + 5 new AC-ONBD-001-01 = 37. This is a prose inaccuracy in the Work Log, not a gate failure — the pass count is correct and independently verified.
