---
brief: BRIEF-003
status: done
assigned_to: webapp-developer
updated_by: webapp-developer
depends_on: TASK-003-001, TASK-003-002, TASK-003-004
impl: developer
e2e_required: no
started_at: 2026-06-17T11:50:05Z
completed_at: 2026-06-17T11:09:00Z
complexity_estimate: "4"
complexity_actual: "4"
introduces_gate: no (reuses the EPIC-004 audit + rate-limit gates; the email-send required gate is the e2e Mailhog assertion in TASK-003-006)
acceptance_criteria: [AC-DOOR-006-02 (accept → accepted), AC-DOOR-006-03 (decline → declined), AC-DOOR-006-04 (only the accountant decides), AC-DOOR-006-05 (decided ≠ pending; no second decision), AC-DOOR-007-01 (accept sends invitation to contact email), AC-DOOR-007-02 (invitation directs to client-surface account creation), AC-DOOR-007-03 (no account before sign-up), AC-DOOR-007-04 (invitation tied to the accepted request), AC-DOOR-008-01 (decline captures free-text reason), AC-DOOR-008-02 (reason emailed to contact email), AC-DOOR-008-03 (prospect needs no account to receive it), AC-DOOR-008-04 (reason retained on the declined request)]
upstream_refs: REQ-DOOR-006, REQ-DOOR-007, REQ-DOOR-008, ADR-001 (`createInvitation` seam — CLIENT role server-set), ADR-003 (SESSION_CONTEXT), ADR-005 (write boundary), ADR-019 (audit accept/decline), ADR-022 (rate-limit outbound email), ADR-010 (invitation links to the client surface)
---

# TASK-003-005: Decision actions (admin) — accept→invite+email, decline→reason+email; decide-once, audit, rate-limit

---

## Quality Gates

- [x] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [x] **Submission gate** — lint + type-check + build + `pnpm --filter admin test` + `pnpm --filter @tax-portal/db test`
- [N/A] **Targeted e2e** — happy-path e2e lands in TASK-003-006 (this task's tier-3/unit prove the invariants)
- [x] **Security review** — `requireRole(ACCOUNTANT)` on both actions; role server-evaluated (never client-asserted); decide-exactly-once is concurrency-safe (optimistic guard on status); invitation role CLIENT set server-side; outbound email rate-limited; audit row written transactionally
- [x] **SDET Review** — approved

## SDET Review focus areas

- **Decide-exactly-once (AC-DOOR-006-05)** — the status transition must be guarded so a second accept/decline on an already-decided request is rejected (optimistic `WHERE status IN ('pending','awaiting_review')` update, checking affected rows; a no-op → reject, not a silent success). Tier-3 test: concurrent/second decision rejected.
- **Only-accountant-decides (AC-DOOR-006-04)** — action-layer `requireRole(ACCOUNTANT)` AND the DB BLOCK predicate (TASK-003-001). Prove both.
- **Invitation provenance + tie (AC-DOOR-007-01/-04)** — `getAuthProvider().createInvitation(email, 'CLIENT')` (role server-set per ADR-005, reusing the EPIC-004 seam + its provenance test pattern); the returned `ticket` is persisted to `EngagementRequest.invitationTicket` so the resulting account links back (AC-DOOR-007-04). No account is created here (AC-DOOR-007-03 — pairs with EPIC-004 AC-AUTH-006-01).
- **Email sends (AC-DOOR-007-01, AC-DOOR-008-02/-03)** — both go through `packages/email` (TASK-003-002) to the prospect's contact email; the prospect has no account (AC-DOOR-008-03). Rate-limited (ADR-022, reuse `RateLimiter`).
- **Decline retention (AC-DOOR-008-04)** — `declineReason` persisted on the request and visible to the accountant.
- **Audit (ADR-019)** — accept and decline each write an append-only audit row via the EPIC-004 audit seam (`recordAuthEvent`/`withAuditTransaction`), actor = the verified accountant identity.

## Context

The decision is the heart of the slice: from the inbox the accountant accepts (→ invitation email to the prospect, tied to the request, no account yet) or declines (→ free-text reason emailed to the accountless prospect, retained on the request). Both are security-significant (audited) and rate-limited on outbound email. Both run under the accountant SESSION_CONTEXT and are guarded accountant-only. The account that may result from an accepted invitation is EPIC-004's (out of scope here).

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `apps/admin/src/app/requests/actions.ts` | Modify | `acceptRequest(id)` + `declineRequest(id, reason)` server actions: `requireRole(ACCOUNTANT)`; decide-once status transition; createInvitation + persist ticket (accept); persist declineReason (decline); send email (packages/email); rate-limit; audit. Added `DecisionResult` type. |
| `packages/db/src/repositories/engagement-request.ts` | Modify | `acceptEngagementRequest(id, ticket)` + `declineEngagementRequest(id, reason)` repo fns with the optimistic decide-once guard. `AlreadyDecidedError` class. |
| `packages/db/src/index.ts` | Modify | Export `acceptEngagementRequest`, `declineEngagementRequest`, `AlreadyDecidedError`. |
| `apps/admin/package.json` | Modify | Added `@tax-portal/email` dependency (needed for `getEmailProvider()` in actions). |
| `apps/admin/src/app/requests/_components/DecisionActions.tsx` | Create | Client component: Accept button + Decline form (reason textarea) wired to server actions. Rendered in the `decisionSlot` of `RequestDetail`. |
| `apps/admin/src/app/requests/[id]/page.tsx` | Modify | Import `DecisionActions` and wire it into `RequestDetail` via `decisionSlot` prop (replaces the null placeholder from TASK-003-004). |
| `apps/admin/src/app/requests/actions.test.ts` | Create | 32 unit tests: accept + decline transitions; invitation issued + ticket tied; no-account-before-signup; decline reason emailed + retained; decide-once rejection; non-accountant rejected; email rate-limited; audit written. All 12 AC tagged. |

## Tests to Write First

- [x] `AC-DOOR-006-02 — accept moves request to accepted` — expected: status accepted
- [x] `AC-DOOR-006-03 — decline moves request to declined` — expected: status declined
- [x] `AC-DOOR-006-04 — non-accountant cannot decide` — expected: rejected (action guard + DB block)
- [x] `AC-DOOR-006-05 — second decision on a decided request is rejected` — expected: error/no-op rejection, state unchanged
- [x] `AC-DOOR-007-01 — accept sends an invitation email to the contact email` — expected: email captured (mock), recipient = prospect email
- [x] `AC-DOOR-007-04 — invitation ticket persisted on the request` — expected: request.invitationTicket set
- [x] `AC-DOOR-007-03 — no account exists before sign-up` — expected: no User row created on accept
- [x] `AC-DOOR-008-01 — decline captures a free-text reason` — expected: reason accepted
- [x] `AC-DOOR-008-02/-03 — reason emailed to the accountless prospect` — expected: email captured, recipient = prospect email
- [x] `AC-DOOR-008-04 — reason retained on the request` — expected: request.declineReason persisted + readable

## Implementation Notes

- Reuse: `getAuthProvider().createInvitation` (`@tax-portal/auth`), `recordAuthEvent`/`withAuditTransaction` (`@tax-portal/db`), the EPIC-004 `RateLimiter` port, and `getEmailProvider().send` (`@tax-portal/email`, TASK-003-002).
- The invitation email body links to the **client surface** sign-up (ADR-010 cross-app URL, `PORTAL_APP_URL`) carrying the ticket (AC-DOOR-007-02).
- Wrap status-transition + audit (+ ticket persistence) in one transaction; send email after the transaction commits (don't email on a rolled-back decision). Rate-limit the send; on rate-limit, surface a retryable error without losing the recorded decision (DECISION: record the decision, queue/skip the email with an audited note — pick the simplest correct behavior and note it).

## Work Log

### 2026-06-17 [webapp-developer] Starting implementation — acceptRequest/declineRequest server actions + repo fns + UI wire + unit tests | What's next: read existing seams (auth, email, db, rate-limit, audit) then implement repo layer, then actions, then UI, then tests | Blockers: none

### 2026-06-17 [webapp-developer] Implementation complete — all gates passed

**What was done:**

1. **Repo layer** (`packages/db/src/repositories/engagement-request.ts`):
   - Added `acceptEngagementRequest(id, ticket, txn?)` — status→accepted + ticket persist, decide-once guard (`WHERE status IN ('pending','awaiting_review')`), throws `AlreadyDecidedError` on 0 rows.
   - Added `declineEngagementRequest(id, reason, txn?)` — status→declined + reason persist, same decide-once guard.
   - Added `AlreadyDecidedError` class.
   - Exported all three from `packages/db/src/index.ts`.

2. **Server actions** (`apps/admin/src/app/requests/actions.ts`):
   - Added `acceptRequest(requestId)`: ACCOUNTANT guard → fetch request (request pool) → withAuditTransaction { createInvitation('CLIENT') → acceptEngagementRequest(+ticket) → recordAuthEvent } → rate-limit → send invitation email (PORTAL_APP_URL/sign-up?ticket=…) → revalidatePath.
   - Added `declineRequest(requestId, reason)`: same ACCOUNTANT guard → fetch request → withAuditTransaction { declineEngagementRequest(+reason) → recordAuthEvent } → rate-limit → send decline reason email → revalidatePath.
   - Both return `DecisionResult` — full success, partial (email blocked), or failure with error code.
   - Transaction discipline: email sent AFTER transaction commits (never on rollback). On rate-limit, decision committed but email skipped (retryable partial-success).
   - Added `@tax-portal/email` dependency to `apps/admin/package.json`.

3. **UI** (`apps/admin/src/app/requests/_components/DecisionActions.tsx`):
   - New client component: Accept button + Decline form (textarea for reason). Only rendered for decidable statuses.
   - Wired into `RequestDetail` decisionSlot via `apps/admin/src/app/requests/[id]/page.tsx`.

4. **Tests** (`apps/admin/src/app/requests/actions.test.ts`):
   - 32 unit tests covering all 12 AC + ADR-019 audit + ADR-022 rate-limit.
   - All mocks hoisted (all `vi.fn()` from `vi.hoisted()`) to survive `vi.clearAllMocks()` in `beforeEach`.

**DECISION notes:**
- `// DECISION (TASK-003-005): createInvitation runs INSIDE the audit transaction` — so ticket is available to persist atomically; if Clerk call fails, transaction rolls back (no status=accepted without ticket).
- `// DECISION (TASK-003-005): email sent AFTER transaction commits` — decision committed before email; on rate-limit or email failure, decision stands and a retryable partial-success is returned.
- `// DECISION (TASK-003-005): Rate-limit key is 'admin:decision-email' keyed by accountant clerkUserId` — not source IP (admin action, not public endpoint); meaningful anti-abuse boundary is per-accountant.

**Submission gate output:**
- `pnpm lint` — PASS (0 warnings, 0 errors)
- `pnpm type-check` — PASS (0 errors, both portal and admin)
- `pnpm build` — PASS (admin + portal, both clean)
- `pnpm --filter admin test` — **114 tests PASS** (6 test files; 32 new tests in actions.test.ts)
- `pnpm --filter @tax-portal/db test` — **50 tests PASS** (10 test files, all existing tests green)

**What's next:** SDET review | Blockers: none

### 2026-06-17 [sdet] SDET Review — APPROVED

**Decision**: approved

**Mandatory rejection checks**: all PASS. Pre-implementation breadcrumb ("Starting implementation") present as the first Work Log entry. `Complexity-actual: 4` in 1–5 range. `Started-at: 2026-06-17T11:50:05Z` non-sentinel. Required spec fields (`**Acceptance criteria:**`, `**Upstream refs:**`, `**Introduces-gate:**`) all present. No tool-hygiene violations in Work Log. `Introduces-gate: no` correct (reuses EPIC-004 gates; email-send gate lands in TASK-003-006).

**Test evidence independently verified**:
- `pnpm --filter admin test -- src/app/requests/actions.test.ts` → **32/32 PASS**
- `pnpm --filter admin test` → **114/114 PASS** (6 files)
- `pnpm --filter @tax-portal/db test` → **50/50 PASS** (10 files)
- `pnpm lint` → **PASS** (0 warnings, 0 errors)
- `pnpm type-check` → **PASS** (0 errors, both apps + packages)

**AC coverage**: all 12 AC tagged and tested.

**Decide-exactly-once (AC-DOOR-006-05)**: `acceptEngagementRequest` and `declineEngagementRequest` use a `WHERE status IN ('pending','awaiting_review')` conditional UPDATE. The affected-rows count is checked (`SELECT @@ROWCOUNT AS rowsAffected`); 0 rows → `AlreadyDecidedError` thrown. The action layer catches `AlreadyDecidedError` and returns `{ success: false, error: 'already_decided' }`. Test [AC-DOOR-006-05] explicitly sets `mockAcceptEngagementRequest.mockRejectedValue(new MockAlreadyDecidedError(...))` and asserts `result.error === 'already_decided'` with `emailSend` not called. Genuine rejection, not a silent no-op. DB-layer proof: `engagement-request.decide-boundary.rls.test.ts` (3 tests against real SQL Server) covers CLIENT block + null block + ACCOUNTANT pass with admin-pool read-back confirming no mutation for blocked paths.

**Only-accountant-decides (AC-DOOR-006-04)**: dual guard verified — `getAccountantIdentity()` checks `identity.role !== 'ACCOUNTANT'` and returns null (→ `{ success: false, error: 'unauthorized' }`); role resolved from verified session cookie (never from client input, ADR-005). DB-layer defense-in-depth: `pol_EngagementRequest` BLOCK predicate proven by the tier-3 RLS test (TASK-003-001, approved). Unit tests cover null identity and CLIENT identity both returning unauthorized with zero side effects.

**Invitation provenance + tie (AC-DOOR-007-01/-02/-03/-04)**: `createInvitation(prospectEmail, 'CLIENT')` called with role server-set (line 288). `ticket` from the provider is persisted via `acceptEngagementRequest(requestId, ticket, txn)` (AC-DOOR-007-04). Email body contains `PORTAL_APP_URL/sign-up?ticket=<encoded-ticket>` (AC-DOOR-007-02, ADR-010). AC-DOOR-007-03: `createInvitation` issues an invitation token only — no User row INSERT exists in `acceptRequest`. Verified: `mockCreateInvitation` is the only auth-provider call; no user-creation mock call exists.

**Decline (AC-DOOR-008-01/-02/-03/-04)**: reason validated (empty/whitespace-only rejected before any DB write). `declineEngagementRequest` called with `reason.trim()` (ticket persisted via AC-DOOR-008-04). Email sent to `requestRecord.email` (prospect contact email, no account required — AC-DOOR-008-03). Tests assert exact reason text passed through and whitespace trimmed before persistence.

**Audit (ADR-019)**: `recordAuthEvent` called inside `withAuditTransaction` callback before commit. `action: 'engagement_request.accepted'` / `'engagement_request.declined'`; `actor.clerkUserId` and `actor.role` from the server-verified identity. Tests verify audit NOT written on unauthorized identity and NOT written when `AlreadyDecidedError` is thrown (because it is thrown before `recordAuthEvent` in the transaction callback).

**Rate-limit (ADR-022)**: rate-limit key is `admin:decision-email` per `accountant.clerkUserId`. Design rationale in the DECISION comment is sound: this is a single trusted admin user, not a public endpoint; per-user keying is the meaningful anti-abuse boundary. `consume()` called after transaction commits; on block, decision stands and partial-success returned. Tests verify `emailSend` not called on rate-limit exhaustion.

**Transaction discipline**: email sent AFTER `withAuditTransaction` resolves (i.e., after transaction commit). On rate-limit or email failure, partial-success is returned with the decision committed. `createInvitation` runs INSIDE the transaction — design is sound for the mock provider; DECISION comment notes the real-Clerk consideration (if Clerk fails, transaction rolls back — no status=accepted without ticket).

**Security**: no client-assertable role; role exclusively from `getAccountantIdentity()` which reads from verified session cookie. Invitation ticket generated server-side (`createInvitation`), not from client input. Email body built from server-fetched request data. No SQL injection (parameterized queries throughout). No XSS surface (plain-text email body). Header injection: `@tax-portal/email` seam has `stripHeaderInjection()` guard (proven in TASK-003-002).

**Observation for IO design scan**: `revalidatePath('/requests')` is called only on the full-success path (email sent). On partial-success (rate-limited or email failed), the decision is committed but `revalidatePath` is skipped — the accountant's UI will not auto-refresh to show the updated status. The `DecisionActions` component surfaces a "Refresh to see updated status" button for the success result view, so the accountant has a manual path. Not a correctness defect; behavior matches the DECISION comment intent. Worth noting for the IO.

**ADR-006 compliance**: `DecisionActions` and `actions.ts` additions are admin-only (`apps/admin`); no mirror in `apps/portal` confirmed by grep patterns in prior TASK reviews.

**ADR-003 compliance**: `getEngagementRequest` fetched via `withRequestContext` (request pool, RLS-active). Accept/decline writes use `withAuditTransaction` (admin pool — sanctioned pattern for identity-bearing mutations with co-committed audit). No direct Prisma access outside wrapper.

**Status**: TASK-003-005 → done. Completed-at: 2026-06-17T11:09:00Z.
