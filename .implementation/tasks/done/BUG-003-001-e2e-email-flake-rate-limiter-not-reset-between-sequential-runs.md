---
brief: BRIEF-003
status: done
started_at: 2026-06-17T13:30:33Z
completed_at: 2026-06-17T14:05:00Z
complexity_estimate: 2
complexity_actual: 2
severity: high — blocks 3× zero-flake requirement; masks AC-DOOR-007-01 and AC-DOOR-008-02 email-delivery proof
task: TASK-003-006
owner: webapp-developer
---





# BUG-003-001: E2e email-delivery assertions flake on run 3 — rate-limiter not reliably reset between sequential pnpm e2e:run invocations

---

## Summary

The Mailhog email-delivery assertions in `request-accept.spec.ts` and `request-decline.spec.ts` flake
on the 3rd sequential `pnpm --filter admin e2e:run` invocation. Tests 9 and 11 time out after 15s
waiting for the invitation/decline email to arrive in Mailhog.

The root cause is the InMemoryRateLimiter being exhausted across sequential runs. The `resetRateLimiter()`
call in `test.beforeAll` may not be resetting the correct singleton in the compiled Next.js production
build due to module isolation between the API route chunk (`reset-rate-limiter/route.ts`) and the
Server Action chunk (`actions.ts`). Additionally, `RATE_LIMIT_MAX_ATTEMPTS` is not set in
`docker-compose.yml`, so the container uses the default 10 per 60s window. The developer's 3× runs
passed because their `.env.local` set `RATE_LIMIT_MAX_ATTEMPTS=100`, feeding a higher limit into the
admin container — masking the exhaustion. A freshly composed container (without that env override)
hits the rate limit by run 3.

---

## Reproduction Steps

1. Start the admin container from a freshly built image WITHOUT `RATE_LIMIT_MAX_ATTEMPTS` set.
2. Run `pnpm --filter admin e2e:run` three times sequentially.
3. Observe: runs 1 and 2 pass 30/30; run 3 fails 28/30 — tests 9 and 11 time out at 15s.

**SDET independent verification:**

| Run | Result | Duration | Notes |
|-----|--------|----------|-------|
| Run 1 | 30/30 PASS | 8.5s | Email assertions green |
| Run 2 | 30/30 PASS | 7.8s | Email assertions green |
| Run 3 | **28/30 FAIL** | 38.5s | Tests 9 (AC-DOOR-007-01) and 11 (AC-DOOR-008-02) — `waitForEmail` 15s timeout |
| Run 4 (pre-reset) | 30/30 PASS | 8.1s | Pre-run explicit `curl -X POST .../reset-rate-limiter` confirmed working |

---

## Failing Tests

```
[chromium] › e2e/specs/request-accept.spec.ts:102:7
  [AC-DOOR-006-02][AC-DOOR-007-01] accept → status accepted + invitation email arrives in Mailhog
  Error: [mailhog fixture] Timed out after 15000ms waiting for email to "accept-prospect.*@..."
         with subject containing "invited"

[chromium] › e2e/specs/request-decline.spec.ts:108:9
  [AC-DOOR-006-03][AC-DOOR-008-01][AC-DOOR-008-02][AC-DOOR-008-04]
  decline with reason → status declined + reason email arrives + reason retained in portal
  Error: [mailhog fixture] Timed out after 15000ms waiting for email to "decline-prospect.*@..."
         with subject containing "engagement request" with body containing "We are at capacity..."
```

---

## Root Cause Analysis

**Primary cause — rate limiter not reset between sequential run invocations:**

The `InMemoryRateLimiter` is an in-process singleton in the running admin container. It persists
across sequential `pnpm e2e:run` invocations (the container does not restart). The default limit
is 10 attempts per 60-second window per rate key (`admin:decision-email:{clerkUserId}`).

`resetRateLimiterForTesting()` is called via `test.beforeAll` in both `request-accept.spec.ts` and
`request-decline.spec.ts`. However, this call fires WITHIN a Playwright run, not between runs. The
concern is whether Next.js production build module isolation means the `_limiter` singleton in the
`reset-rate-limiter/route.ts` handler module instance is the SAME object as the `_limiter` used by
the `actions.ts` Server Action module instance. In compiled Next.js standalone builds, module caching
behavior differs from dev mode and may produce separate module instances per chunk.

**Contributing cause — `RATE_LIMIT_MAX_ATTEMPTS` not in docker-compose.yml:**

The developer ran with `RATE_LIMIT_MAX_ATTEMPTS=100` in `.env.local`, which fed into the container
env and prevented exhaustion. The standard compose config does not include this variable (it is
listed as a user-applies carried-forward item from RETRO-002). A freshly composed container runs at
the default 10 per 60s.

---

## Expected vs Actual

**Expected:** `pnpm --filter admin e2e:run` passes 30/30 on three sequential runs with zero flakes,
including the email-delivery assertions for AC-DOOR-007-01 and AC-DOOR-008-02.

**Actual:** Run 3 fails 28/30. The `waitForEmail` assertions time out because the rate limiter was
exhausted and the emails were never sent (no SMTP traffic to Mailhog for those two tests).

---

## Fix Options (developer chooses one or both)

### Option A — Add `RATE_LIMIT_MAX_ATTEMPTS` to docker-compose.yml (recommended, simple)

Add to both `portal` and `admin` service environment sections in `docker-compose.yml`:

```yaml
RATE_LIMIT_MAX_ATTEMPTS: "100"
RATE_LIMIT_WINDOW_MS: "60000"
```

This resolves the exhaustion for e2e/local dev runs. Matches the developer's effective configuration
during testing. Does NOT require addressing the module-isolation question.

**Note:** This also resolves the carried-forward `.env.example` RATE_LIMIT vars item from RETRO-002
(or at minimum, makes e2e reliable without requiring the user to set those vars manually).

### Option B — Investigate and fix the module-isolation issue

Verify whether `resetRateLimiterForTesting()` called from the API route handler actually resets the
same `_limiter` instance that `actions.ts` uses in the compiled Next.js production build. If they
are separate module instances, the fix is to share the singleton via a different mechanism (e.g.
`globalThis`).

### Option C — Both (belt-and-suspenders)

Apply Option A to fix the immediate e2e reliability, and apply Option B to make the reset endpoint
actually work correctly in prod builds (defense in depth).

---

## After Fix

Re-run the full `pnpm --filter admin e2e:run` three times sequentially **without** pre-seeding
`RATE_LIMIT_MAX_ATTEMPTS` in `.env.local`, against a freshly built admin container. All three runs
must pass 30/30 with zero flakes. Record the three run outputs in the TASK-003-006 Work Log.

---

## Security Observation (non-blocking)

`redirect.test.ts` has no test covering the new `/api/test/**` whitelist in `adminRedirectDecision()`.
The security analysis confirms the whitelist is correctly guarded by `isMockAuth` (only active when
`AUTH_PROVIDER=mock`), but the unit test for the redirect helper does not exercise:
- Serving `/api/test/reset-rate-limiter` when `AUTH_PROVIDER=mock`
- Redirecting `/api/test/reset-rate-limiter` when `AUTH_PROVIDER=clerk`

This is a coverage gap on a security-sensitive code path. Recommend adding two tests to
`redirect.test.ts` as part of the fix commit.

---

## Testability

Per ENGINE.md § Bug Fixes: regression test is inherent — the fix must achieve 3× zero-flake
on the e2e suite under standard compose configuration (without `RATE_LIMIT_MAX_ATTEMPTS` in
`.env.local`). The failing tests (9 and 11) are the regression tests. No separate escape-hatch needed.

---

## Work Log

### 2026-06-17 [webapp-developer] Starting fix — Option A (docker-compose env vars) + surface reduction (remove reset endpoint)
**What was done**: Read ENGINE.md, developer.md, BUG file, TASK-003-006. Dispatched. Starting fix.
**What's next**: (1) Read all relevant source files (docker-compose.yml, .env.example, reset-rate-limiter/route.ts, redirect.ts, mailhog.ts, accept/decline specs). (2) Apply Option A — add RATE_LIMIT vars to docker-compose.yml both services. (3) Update .env.example with documented defaults. (4) Remove reset-rate-limiter/route.ts. (5) Revert /api/test/** whitelist from redirect.ts back to /api/mock-session only. (6) Update mailhog.ts and accept/decline specs to drop resetRateLimiter calls. (7) Add two redirect.test.ts tests for /api/test/** whitelist coverage gap. (8) Update operations docs (inventory.md + runbook.md). (9) Build freshly composed admin container WITHOUT RATE_LIMIT in .env.local. (10) Run e2e 3× zero-flake. (11) Record results.
**Blockers**: none

### 2026-06-17 [webapp-developer] Fix complete — Option A + surface reduction; 3× zero-flake confirmed

**Fix path taken: Option A + surface reduction (reset endpoint removed)**

**Root cause**: `RATE_LIMIT_MAX_ATTEMPTS` not set in docker-compose.yml → InMemoryRateLimiter defaults to 10/60s → exhausted by run 3 sequential e2e invocations → email send blocked → `waitForEmail` times out. Developer's local 3× runs passed because `.env.local` had `RATE_LIMIT_MAX_ATTEMPTS=100` feeding into the container, masking the exhaustion.

**Why Option A + removal (not Option B)**: With `RATE_LIMIT_MAX_ATTEMPTS=100` in docker-compose.yml, the limiter can absorb far more than 3 sequential runs (each run sends at most ~4 emails against a 100/60s budget). The reset endpoint was introduced purely to work around the exhaustion — with Option A in place, the endpoint is dead weight. Removing it also eliminates the PR-review over-engineering/security lens concerns about the `/api/test/**` whitelist scope.

**Files changed**:
1. `docker-compose.yml` — Added `RATE_LIMIT_MAX_ATTEMPTS: "${RATE_LIMIT_MAX_ATTEMPTS:-100}"` + `RATE_LIMIT_WINDOW_MS: "${RATE_LIMIT_WINDOW_MS:-60000}"` to BOTH `portal` and `admin` service environment sections. These are default overrides (100 vs 10 production default) for e2e/local containers only. A user can override in `.env.local` to increase/decrease.
2. `.env.example` — Added `RATE_LIMIT_MAX_ATTEMPTS=10` + `RATE_LIMIT_WINDOW_MS=60000` with documentation noting the production defaults and that docker-compose.yml already overrides to 100 for local/e2e. Resolves carried RETRO-002/004 follow-up for RATE_LIMIT `.env.example` vars.
3. `apps/admin/src/app/api/test/reset-rate-limiter/route.ts` — DELETED (with containing `api/test/` directory).
4. `packages/auth/src/redirect.ts` — Reverted `/api/test/**` whitelist in `adminRedirectDecision()` back to `/api/mock-session` only. The `/api/test/**` path is now auth-gated again.
5. `apps/admin/e2e/fixtures/mailhog.ts` — Removed `resetRateLimiter()` export, `ADMIN_PORT`/`ADMIN_BASE_URL` constants. Updated doc comment to explain BUG-003-001 fix.
6. `apps/admin/e2e/specs/request-accept.spec.ts` — Removed `resetRateLimiter` import and `test.beforeAll` call; updated ADR-022 comment.
7. `apps/admin/e2e/specs/request-decline.spec.ts` — Same as above.
8. `packages/auth/src/redirect.test.ts` — Added 2 new tests covering the reverted `/api/test/**` behavior: unauthenticated → redirect (whitelist removed); ACCOUNTANT → serve (normal auth path still works).
9. `.implementation/operations/inventory.md` — Added `RATE_LIMIT_MAX_ATTEMPTS` + `RATE_LIMIT_WINDOW_MS` rows to the app services env table; updated Last updated.
10. `.implementation/operations/runbook.md` — Updated Last updated.
11. `.implementation/tasks/TASK-003-006-e2e-gherkin-mailhog.md` — Updated Files table to reflect deleted endpoint and reverted whitelist.

**Verification — freshly built admin container, RATE_LIMIT_MAX_ATTEMPTS=100 from compose default (not .env.local):**

Container env confirmed: `RATE_LIMIT_WINDOW_MS=60000`, `RATE_LIMIT_MAX_ATTEMPTS=100` (from docker-compose.yml `:-100` default, NOT from .env.local).

Unit tests: `pnpm -r test` — 358 total passed (126 auth + 39 email + 50 db + 29 portal + 114 admin)
- `redirect.test.ts`: 46 tests passed (2 new BUG-003-001 tests included)
Lint: 0 errors. Type-check: 0 errors.

**3× sequential e2e runs (admin container, ADMIN_PORT=13001, ADMIN_BASE_URL=http://localhost:13001):**

| Run | Result | Duration | Test 9 (AC-DOOR-007-01) | Test 11 (AC-DOOR-008-02) |
|-----|--------|----------|-------------------------|--------------------------|
| Run 1 | 30/30 PASS | 8.6s | PASS (invite email in Mailhog) | PASS (decline email in Mailhog) |
| Run 2 | 30/30 PASS | 8.2s | PASS | PASS |
| Run 3 | 30/30 PASS | 8.0s | PASS | PASS |

Zero flakes. Tests 9 and 11 (the SDET-identified regression tests) pass on all three runs.

**Carried follow-up resolved**: The RETRO-002 "RATE_LIMIT `.env.example` vars user-walled" item is now resolved — `RATE_LIMIT_MAX_ATTEMPTS` and `RATE_LIMIT_WINDOW_MS` are documented in `.env.example` with production defaults, and the docker-compose.yml overrides ensure local/e2e runs automatically use 100/60s without user action.

**What's next**: SDET review.
**Blockers**: none

### 2026-06-17 [sdet] APPROVED — BUG-003-001 fix verified
**Decision**: approved. All fix artifacts verified. `apps/admin/src/app/api/test/` directory confirmed deleted. `/api/test/**` whitelist fully reverted in `redirect.ts` — only `/api/mock-session` remains. No dangling calls to the deleted endpoint in any non-test, non-dist, non-doc source file. `docker-compose.yml` carries `RATE_LIMIT_MAX_ATTEMPTS: "${RATE_LIMIT_MAX_ATTEMPTS:-100}"` and `RATE_LIMIT_WINDOW_MS: "${RATE_LIMIT_WINDOW_MS:-60000}"` on BOTH portal and admin services. `.env.example` carries the production defaults. `inventory.md` and `runbook.md` both updated. `redirect.test.ts` 46/46 pass — the 2 new BUG-003-001 tests assert the reverted behavior (unauthenticated → redirect; ACCOUNTANT → serve). SDET independent 3× e2e runs (admin container, `RATE_LIMIT_MAX_ATTEMPTS=100` confirmed from compose default via `docker exec`): Run 1 30/30 (8.0s), Run 2 30/30 (7.8s), Run 3 30/30 (7.9s) — tests 9 (AC-DOOR-007-01 invitation email) and 11 (AC-DOOR-008-02 decline email) PASS on all three runs including the formerly-flaking run 3. `pnpm -r test` 358/358. `Complexity-actual: 2` valid.
