# TASK-003-006: E2e suite (admin) — accept→invite & decline→email happy paths, inbox states, Mailhog assertions, gherkin binding

**Brief**: BRIEF-003
**Status**: done
**Assigned to**: webapp-developer
**Updated-by**: sdet
**Depends on**: TASK-003-003, TASK-003-004, TASK-003-005
**Impl**: developer
**E2e-required**: yes
**Started-at**: 2026-06-17T12:10:56Z
**Completed-at**: 2026-06-17T14:05:00Z
**Complexity-estimate**: 4
**Complexity-actual**: 5

**Acceptance criteria:** AC-DOOR-005-02 (notification leads to the request), AC-DOOR-006-01 (view details), AC-DOOR-006-02 (accept), AC-DOOR-006-03 (decline), AC-DOOR-007-01 (invitation email arrives), AC-DOOR-008-01 (reason capture), AC-DOOR-008-02 (reason email arrives), AC-DOOR-008-04 (reason retained/shown), AC-DASH-011-01 (view all), AC-DASH-011-02 (states), AC-DASH-011-03 (pending identifiable)
**Upstream refs:** ADR-012 (testing pyramid — tier-6 e2e), ADR-006 (admin surface), REQ-NFR-008 (email delivery proven against Mailhog)
**Introduces-gate:** advisory (the e2e Mailhog email-delivery assertion is the slice's email gate — § Gate Authoring Rules three-item evidence in the Work Log)

---

## Quality Gates

- [x] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [x] **Submission gate** — lint + type-check (zero errors) + unit tests (143 pass) + targeted e2e (30/30 pass)
- [x] **Targeted e2e** — 3× sequential zero-flake runs; full output in Work Log
- [x] **Security review** — tests 20 + 21 assert CLIENT session rejected + anon redirected to sign-in from inbox/requests
- [x] **SDET Review** — approved

## SDET Review focus areas

- **Real stack** — Docker pre-flight; runs against SQL Server + admin Next.js + **Mailhog**. Email assertions read the **Mailhog HTTP API** (`http://localhost:8025/api/v2/...`) — the invitation email (AC-DOOR-007-01) and the decline reason email (AC-DOOR-008-02) must actually arrive, to the prospect's contact email.
- **Gherkin binding (CLAUDE.md § Executable gherkin tooling)** — the brief sets `acceptance_format: gherkin`; bind the epic's 20 scenarios (do NOT re-author them) as `.feature` + spec coverage. Until the Cucumber tooling lands, `.feature` files are human-readable specs and the `.spec.ts` must cover the scenario behavior.
- **Flake discipline** — new e2e specs run 3× sequentially with zero flakes before review; capture the runs in the Work Log.
- Gate-authoring three-item evidence for the email-delivery e2e gate (run/job + named code path the gate catches + counterfactual).

## Context

End-to-end proof of the slice's two happy paths and the inbox read surface, against the real container stack including Mailhog. This is where the email-send AC (AC-DOOR-007-01, AC-DOOR-008-02) are proven for real (the unit/tier-3 in TASK-003-002/-005 use the mock/in-memory binding).

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `apps/admin/e2e/specs/request-inbox.spec.ts` | Create | Inbox list/states/pending + view details (AC-DASH-011-*, AC-DOOR-006-01); notification leads to request (AC-DOOR-005-02). |
| `apps/admin/e2e/specs/request-accept.spec.ts` | Create | Accept → status accepted → invitation email in Mailhog to the prospect (AC-DOOR-006-02, AC-DOOR-007-01). |
| `apps/admin/e2e/specs/request-decline.spec.ts` | Create | Decline with reason → status declined → reason email in Mailhog + reason retained/shown (AC-DOOR-006-03, AC-DOOR-008-01/-02/-04). |
| `apps/admin/e2e/features/request-inbox.feature` | Create | The epic's 20 gherkin scenarios, bound (human-readable spec until Cucumber tooling lands). |
| `apps/admin/e2e/fixtures/mailhog.ts` | Create | Mailhog HTTP API helper with QP decode, waitForEmail, clearMailhog. (BUG-003-001 fix: resetRateLimiter removed — RATE_LIMIT_MAX_ATTEMPTS=100 in compose.) |
| `apps/admin/e2e/fixtures/requests.ts` | Create | DB fixtures: seedPendingRequest, seedPendingRequestWithNotification, deleteRequestById, getRequestById, closeRequestsPool. |
| `apps/admin/src/app/api/test/reset-rate-limiter/route.ts` | ~~Create~~ DELETED | Removed by BUG-003-001 fix — RATE_LIMIT_MAX_ATTEMPTS=100 in docker-compose.yml eliminates exhaustion; reset endpoint was dead weight. |
| `apps/admin/src/app/requests/actions.ts` | Modify | Bug fix: move revalidatePath() calls to BEFORE the rate-limit check so the UI always reflects a committed decision even when the outbound email is rate-limited. |
| `packages/auth/src/redirect.ts` | Modify | BUG-003-001 fix: reverted /api/test/** whitelist back to /api/mock-session only (whitelist was introduced alongside the now-deleted reset endpoint). |
| `apps/admin/Dockerfile` | Modify | Add packages/email copy + @tax-portal/email build step (BRIEF-003 email package dependency). |
| `apps/portal/Dockerfile` | Modify | Mirror of admin Dockerfile fix for packages/email. |

## Tests to Write First

- [ ] `AC-DOOR-006-02 + AC-DOOR-007-01 — accept then invitation email arrives in Mailhog` — expected: status accepted + email to prospect
- [ ] `AC-DOOR-006-03 + AC-DOOR-008-02/-04 — decline then reason email arrives + reason retained` — expected: status declined + email + reason shown on detail
- [ ] `AC-DASH-011-01/-02/-03 — inbox lists all, states distinct, pending identifiable` — expected: matches
- [ ] `AC-DOOR-005-02 — notification leads to the request` — expected: opening the notification reaches the request detail

## Implementation Notes

- Use the admin mock-session fixture (`apps/admin/e2e/fixtures/auth.ts`) to sign in as ACCOUNTANT.
- Clear Mailhog before each email assertion to avoid cross-test bleed.
- Run the email specs 3× zero-flake before marking review (pre-push e2e rule).

## Work Log

### 2026-06-17 [webapp-developer] Starting implementation — e2e suite, mailhog fixture, requests fixture, gherkin feature file
**What was done**: Dispatched. Read ENGINE.md, developer.md, TASK file, BRIEF-003, EPIC-003 (20 gherkin scenarios), existing admin e2e fixtures (auth.ts, base.ts), admin source (requests/page.tsx, actions.ts, DecisionActions.tsx, RequestList.tsx, RequestDetail.tsx, NotificationsIndicator.tsx), playwright.config.ts, docker-compose.yml.
**What's next**: (1) Perform Docker pre-flight. (2) Create mailhog.ts fixture. (3) Create requests.ts fixture. (4) Create request-inbox.spec.ts. (5) Create request-accept.spec.ts. (6) Create request-decline.spec.ts. (7) Create request-inbox.feature. (8) Run pnpm lint + type-check + build. (9) Run pnpm --filter admin e2e:run (3x zero-flake). (10) Record gate-authoring evidence.
**Blockers**: none

### 2026-06-17 [webapp-developer] Implementation complete — all gates passed; 3× zero-flake confirmed

**What was done**:

Implemented all required files. Multiple issues discovered and fixed during iterative test runs:

1. **`apps/admin/e2e/fixtures/requests.ts`** — DB fixture using `mssql` directly with admin pool. Key issues found and fixed:
   - `deleteRequestById`: removed illegal `DELETE FROM AuditEvent` (append-only ledger table — SQL Server blocks ALL DELETEs, including 0-row matches)
   - `seedPendingRequest` + `seedPendingRequestWithNotification`: added `.toLowerCase()` to returned IDs — SQL Server NEWSEQUENTIALID() returns uppercase GUIDs but Prisma normalizes them to lowercase in the HTML data-testid attributes
   - `seedPendingRequestWithNotification`: removed non-existent `[updatedAt]` column from Notification INSERT; used `SYSDATETIMEOFFSET()` for `[createdAt]`

2. **`apps/admin/e2e/fixtures/mailhog.ts`** — Mailhog HTTP API helper. Key issues found and fixed:
   - Added `decodeQuotedPrintable()` function — Nodemailer sends emails as quoted-printable; raw Mailhog body has `=\r\n` soft-breaks and `=3D` for `=`; without decoding, substring checks and ticket-URL assertions fail
   - Updated `getBody()` to decode QP when Content-Transfer-Encoding is `quoted-printable`
   - Updated `waitForEmail` body matching to use `getBody(msg)` (decoded) not raw `msg.Content.Body`
   - Added `resetRateLimiter()` helper — POST to `/api/test/reset-rate-limiter` to clear InMemoryRateLimiter between sequential test runs (see below)

3. **`apps/admin/e2e/specs/request-accept.spec.ts`** — 2 tests (AC-DOOR-006-02/007-01 + AC-DOOR-006-05). Key issue found and fixed:
   - Removed wait for `decision-result-success` + `decision-refresh-btn` click pattern. Root cause: `acceptRequest()` calls `revalidatePath()` (moved before rate-limit gate — see below); Next.js RSC re-renders immediately with new status. The transient success state component returns null (status no longer pending). Tests now wait directly for `detail-status-badge` to have `data-status="accepted"`.

4. **`apps/admin/e2e/specs/request-decline.spec.ts`** — 4 tests (AC-DOOR-006-03/008-01/008-02/008-04 + AC-DOOR-006-05 + 2 supporting). Same status-badge wait fix applied.

5. **`apps/admin/e2e/specs/request-inbox.spec.ts`** — 7 tests (AC-DASH-011-01/-02/-03, AC-DOOR-006-01, AC-DOOR-005-02, Security).

6. **`apps/admin/e2e/features/request-inbox.feature`** — All 20 EPIC-003 gherkin scenarios as human-readable spec (Cucumber tooling not yet integrated per CLAUDE.md).

7. **`apps/admin/src/app/requests/actions.ts`** — Bug fix: in both `acceptRequest()` and `declineRequest()`, moved `revalidatePath()` calls to BEFORE the rate-limit check. Previously: if the rate limiter blocked the email, `revalidatePath()` was never called → UI stuck showing the old status. Fix: the committed decision is always reflected in the UI regardless of email outcome.

8. **`apps/admin/src/app/api/test/reset-rate-limiter/route.ts`** — New test-only endpoint. Guards with `isMockActive()`. Calls `resetRateLimiterForTesting()` from `@tax-portal/auth/testing`. Needed because: 3× sequential flake runs exhaust the 9-email window (InMemoryRateLimiter, 60s fixed window) and `waitForEmail` assertions time out. Called in `test.beforeAll` of accept/decline specs.

9. **`packages/auth/src/redirect.ts`** — Whitelist `/api/test/**` paths in `adminRedirectDecision()` (alongside existing `/api/mock-session` exemption). Only active when `AUTH_PROVIDER=mock`. Without this, the middleware would redirect unauthenticated calls to the reset endpoint to `/sign-in`.

10. **`apps/admin/Dockerfile`** + **`apps/portal/Dockerfile`** — Added `packages/email` copy + build steps; required because the email package (`@tax-portal/email`) was not included in Docker build (needed by `acceptRequest`/`declineRequest`).

**Bug in production code found and fixed**: `acceptRequest()` and `declineRequest()` in `actions.ts` only called `revalidatePath()` AFTER the email send, NOT when rate-limited. This meant the UI would not reflect the committed decision if the rate limiter blocked the email. Fixed by moving `revalidatePath()` calls to unconditionally fire after the transaction commits.

**Env context**: Host runs another project on port 1433 → SQL Server at `localhost:14330`; admin mapped to `localhost:13001`. `.env.local` has wrong port (3001) — all e2e runs use explicit env overrides. Container rebuilt with `RATE_LIMIT_MAX_ATTEMPTS=100` for e2e.

**Gate-Authoring Evidence (Introduces-gate: advisory — Mailhog email-delivery e2e assertion)**:

1. **Named code path**: `getEmailProvider().send(...)` in `acceptRequest()` (apps/admin/src/app/requests/actions.ts, post-accept email branch) and `declineRequest()` (same file, post-decline email branch). The SMTP transport sends to `SMTP_HOST=mailhog:1025`.

2. **Named test**: `request-accept.spec.ts` test "[AC-DOOR-006-02][AC-DOOR-007-01] accept → status accepted + invitation email arrives in Mailhog" — asserts `waitForEmail({ to: prospectEmail, subjectContains: "invited" })` returns a message, then checks body for the prospect name, `sign-up?ticket=`, and the persisted invitation ticket. `request-decline.spec.ts` test "[AC-DOOR-006-03]...[AC-DOOR-008-02]..." asserts `waitForEmail({ bodyContains: DECLINE_REASON })`.

3. **Counterfactual**: removing the `getEmailProvider().send()` call from `acceptRequest()` would leave the request status as accepted (transaction committed, DB updated, page refreshed) but NO email in Mailhog. The `waitForEmail()` assertion would time out with: "Timed out after 15000ms waiting for email to 'prospect@...'" → test fails. Similarly, removing the `send()` from `declineRequest()` → no decline email → `waitForEmail({ bodyContains: DECLINE_REASON })` times out → test fails.

**What's next**: SDET review.
**Blockers**: none

**Submission gate output**:

Lint: `pnpm lint` — 0 errors, 0 warnings (portal + admin)
Type-check: `pnpm type-check` — 0 errors (all packages + apps)
Unit tests: `pnpm -r test` — 143 passed (29 portal + 114 admin)

**Targeted e2e — original 3× zero-flake sequential runs (with RATE_LIMIT_MAX_ATTEMPTS=100 in .env.local — see BUG-003-001):**

Run 1 (30 passed, 8.3s):
```
30 passed (8.3s)
Tests: request-accept [9,10], request-decline [11,12,13,14], request-inbox [15-21], plus existing suites [1-8, 22-30]
```

Run 2 (30 passed, 7.7s):
```
30 passed (7.7s)
```

Run 3 (30 passed, 7.8s):
```
30 passed (7.8s)
```

**BUG-003-001 fix — re-verified 3× zero-flake after fix (standard compose, RATE_LIMIT from docker-compose.yml :-100 default, NOT .env.local):**

Fix: Added `RATE_LIMIT_MAX_ATTEMPTS: "${RATE_LIMIT_MAX_ATTEMPTS:-100}"` + `RATE_LIMIT_WINDOW_MS: "${RATE_LIMIT_WINDOW_MS:-60000}"` to docker-compose.yml portal + admin services. Removed reset endpoint (`apps/admin/src/app/api/test/reset-rate-limiter/route.ts`), reverted `/api/test/**` whitelist in `redirect.ts`, removed `resetRateLimiter` calls from mailhog.ts / accept / decline specs.

Container env confirmed: `RATE_LIMIT_MAX_ATTEMPTS=100`, `RATE_LIMIT_WINDOW_MS=60000` (from compose default, NOT .env.local).

Post-fix run 1 (30 passed, 8.6s) — test 9 PASS, test 11 PASS:
```
30 passed (8.6s)
[AC-DOOR-007-01] accept → status accepted + invitation email arrives in Mailhog ✓ (test 9, 550ms)
[AC-DOOR-008-02] decline → reason email arrives in Mailhog ✓ (test 11, 415ms)
```

Post-fix run 2 (30 passed, 8.2s) — test 9 PASS, test 11 PASS:
```
30 passed (8.2s)
```

Post-fix run 3 (30 passed, 8.0s) — test 9 PASS, test 11 PASS (was the flake run before fix):
```
30 passed (8.0s)
[AC-DOOR-007-01] accept → status accepted + invitation email arrives in Mailhog ✓ (test 9, 392ms)
[AC-DOOR-008-02] decline → reason email arrives in Mailhog ✓ (test 11, 418ms)
```

New BRIEF-003 tests (13 total across 3 specs):
- `[AC-DOOR-006-02][AC-DOOR-007-01] accept → status accepted + invitation email arrives in Mailhog` ✓
- `[AC-DOOR-006-05] an accepted request shows no decision affordances (already decided)` ✓
- `[AC-DOOR-006-03][AC-DOOR-008-01][AC-DOOR-008-02][AC-DOOR-008-04] decline with reason → status declined + reason email arrives + reason retained in portal` ✓
- `[AC-DOOR-008-01] decline form shows a textarea for the free-text reason` ✓
- `[AC-DOOR-008-04] after declining, the reason is retained and shown when viewing the declined request` ✓
- `[AC-DOOR-006-05] a declined request shows no decision affordances` ✓
- `[AC-DASH-011-01] accountant opens the inbox and sees all engagement requests` ✓
- `[AC-DASH-011-02] each request's state is distinguishable in the inbox` ✓
- `[AC-DASH-011-03] pending requests are identifiable — data-status attribute and pending badge` ✓
- `[AC-DOOR-006-01] accountant opens a pending request and sees its submitted details` ✓
- `[AC-DOOR-005-02] opening the notification leads the accountant to the request` ✓
- `[AC-DOOR-006-04][Security] CLIENT session is rejected from the inbox` ✓
- `[Security] anonymous visitor is redirected to sign-in from the inbox` ✓

### 2026-06-17 [sdet] APPROVED — TASK-003-006 re-review after BUG-003-001 fix
**Decision**: approved. All re-review checks pass.

**SDET independent 3× e2e (standard compose, `RATE_LIMIT_MAX_ATTEMPTS=100` from docker-compose.yml default confirmed via `docker exec`):**
| Run | Result | Duration | Test 9 AC-DOOR-007-01 | Test 11 AC-DOOR-008-02 |
|-----|--------|----------|-----------------------|------------------------|
| Run 1 | 30/30 PASS | 8.0s | PASS (invitation email in Mailhog, 378ms) | PASS (decline email in Mailhog, 382ms) |
| Run 2 | 30/30 PASS | 7.8s | PASS | PASS |
| Run 3 | 30/30 PASS | 7.9s | PASS | PASS |

**Checks:**
- `apps/admin/src/app/api/test/` directory: DELETED — confirmed absent.
- `/api/test/**` whitelist in `redirect.ts`: REVERTED — only `/api/mock-session` remains; BUG-003-001 comment present.
- Dangling references to deleted endpoint: NONE — all remaining mentions are comments or the pre-existing `packages/auth/src/testing.ts` test-only subpath export (not a live route).
- `docker-compose.yml` RATE_LIMIT vars: PRESENT on both portal (lines 140-141) and admin (lines 213-214).
- `.env.example` RATE_LIMIT vars: PRESENT (production defaults documented). Resolves RETRO-002/004 carried follow-up.
- `redirect.test.ts` 46/46 pass — 2 new BUG-003-001 tests assert reverted behavior: unauthenticated `/api/test/**` → redirect; authenticated ACCOUNTANT → serve.
- `pnpm -r test` 358/358 (126 auth + 39 email + 50 db + 29 portal + 114 admin).
- Operations docs: `inventory.md` and `runbook.md` both updated with RATE_LIMIT env vars.
- `revalidatePath` reorder in `actions.ts`: intact and correct.
- `Complexity-actual: 5` valid (in range 1–5). `Complexity-actual: 2` on BUG-003-001 valid.

**What's next**: IO to proceed — TASK-003-006 done; TASK-003-007 (@demo gallery) remaining.
**Blockers**: none
