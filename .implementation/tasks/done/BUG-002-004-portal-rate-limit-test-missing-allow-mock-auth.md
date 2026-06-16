# BUG-002-004 — Portal sign-in rate-limit integration test missing ALLOW_MOCK_AUTH=true (BUG-002-001 contract breakage)

**Status:** done
**Assigned to:** webapp-developer
**Impl:** developer
**Brief:** BRIEF-002 (rides BRIEF-002's PR)
**Brief-type:** feature · **Brief-deploys:** no
**Severity:** blocker (blocks the SDET CI gate — `pnpm -r test` exits non-zero; `test-portal` CI job shows 7 failures)
**Updated-by:** webapp-developer

**Started-at:** 2026-06-16T00:00:00Z
**Complexity-estimate:** 1
**Complexity-actual:** 1
**Completed-at:** 2026-06-16T00:10:00Z

**Acceptance criteria:** The `pnpm -r test` suite exits 0 on the BRIEF-002 branch; `apps/portal/src/app/(public)/sign-in/sign-in-rate-limit.integration.test.ts` 7/7 PASS in a clean Vitest run without an externally-set `ALLOW_MOCK_AUTH` env var.
**Upstream refs:** ADR-001 (auth-provider-selection seam); BUG-002-001 (the `ALLOW_MOCK_AUTH` guard that changed the contract); ENGINE.md § Bug Fixes.
**Introduces-gate:** no

---

## Reproduction

```bash
pnpm --filter portal test
```

**Observed:** 7 failures in `src/app/(public)/sign-in/sign-in-rate-limit.integration.test.ts`:
```
Error: [packages/auth] MOCK_SESSION_SECRET must not be set to the dev default unless ALLOW_MOCK_AUTH=true.
  The mock binding is forbidden in a real production deployment.
  at getSecret (../../packages/auth/src/bindings/mock.ts:97:13)
  at signMockSessionAsync (../../packages/auth/src/bindings/mock.ts:228:48)
  at createMockSessionCookie (../../packages/auth/src/mock-session-api.ts:71:43)
  at signInAsClient (src/app/(public)/sign-in/actions.ts:195:31)
```

**Expected:** 7/7 PASS (tests exercise real rate-limit + mock session behavior, so `ALLOW_MOCK_AUTH=true` is required and correct for a test context).

**Proof that the env fix works:**
```bash
ALLOW_MOCK_AUTH=true pnpm --filter portal test -- "src/app/(public)/sign-in/sign-in-rate-limit.integration.test.ts"
# → 7 passed
```

---

## Root cause

BUG-002-001 (`packages/auth/src/bindings/mock.ts`) changed the `getSecret()` guard from:
```ts
if (process.env["NODE_ENV"] === "production") { throw … }
```
to:
```ts
if (!isMockAllowed()) { throw … }  // isMockAllowed() = ALLOW_MOCK_AUTH === "true"
```

The `sign-in-rate-limit.integration.test.ts` test was authored under the old `NODE_ENV` guard. Its `beforeEach` sets `AUTH_PROVIDER=mock` (correct for the mock sign-in flow) but does **not** set `ALLOW_MOCK_AUTH=true`. Under the new guard, any call to `createMockSessionCookie` → `signMockSessionAsync` → `getSecret()` throws because `isMockAllowed()` returns false.

The same pattern was handled in `packages/auth/src/session-expiry.test.ts` when BUG-002-001 was fixed there: `beforeEach` sets `ALLOW_MOCK_AUTH=true`, `afterEach` deletes it. The portal test was not updated in that same dispatch.

**This is not a test that can be deleted** — it satisfies the ADR-022 mandate ("an integration test proving the throttle on the sign-in surface"). The fix is to add the missing env var to the test's lifecycle hooks.

---

## Fix

**File:** `apps/portal/src/app/(public)/sign-in/sign-in-rate-limit.integration.test.ts`

In the `beforeEach` block (currently lines 106–116), add:
```ts
process.env["ALLOW_MOCK_AUTH"] = "true";
```
alongside the existing `AUTH_PROVIDER=mock` line.

In the `afterEach` block (currently lines 118–123), add:
```ts
delete process.env["ALLOW_MOCK_AUTH"];
```

The full `beforeEach` + `afterEach` after the fix:
```ts
beforeEach(() => {
  process.env["RATE_LIMIT_MAX_ATTEMPTS"] = "3";
  process.env["RATE_LIMIT_WINDOW_MS"] = "60000";
  process.env["AUTH_PROVIDER"] = "mock";
  process.env["ALLOW_MOCK_AUTH"] = "true";  // ← ADD: BUG-002-004 — required by BUG-002-001 guard change
  process.env["TRUST_PROXY"] = "true";
  resetRateLimiterForTesting();
  cookieSetSpy.mockClear();
  mockState.sourceIp = "1.2.3.4";
});

afterEach(() => {
  resetRateLimiterForTesting();
  delete process.env["RATE_LIMIT_MAX_ATTEMPTS"];
  delete process.env["RATE_LIMIT_WINDOW_MS"];
  delete process.env["TRUST_PROXY"];
  delete process.env["ALLOW_MOCK_AUTH"];  // ← ADD: BUG-002-004 cleanup
});
```

Add a `// DECISION (BUG-002-004):` comment on the `ALLOW_MOCK_AUTH` line explaining this is required by BUG-002-001's guard change (`session-expiry.test.ts` has the same pattern).

---

## Regression test required?

The fix IS the regression evidence. After the fix:
- `pnpm --filter portal test` exits 0 (7/7 PASS).
- `pnpm -r test` exits 0.

No separate regression test needed — the existing 7 tests are the regression tests (they would have caught BUG-002-001's guard change if the portal test had been updated at the same time).

## Testability

Fix is a 2-line test change (add env var to lifecycle hooks). The existing 7 tests already assert the correct behavior — no new assertion logic needed.

---

## Definition of Done

- [x] `process.env["ALLOW_MOCK_AUTH"] = "true"` added to `beforeEach` in `sign-in-rate-limit.integration.test.ts`.
- [x] `delete process.env["ALLOW_MOCK_AUTH"]` added to `afterEach` in the same file.
- [x] `// DECISION (BUG-002-004):` comment on the added line referencing BUG-002-001 + `session-expiry.test.ts` pattern.
- [x] Submission gate: `pnpm --filter portal test` → 7/7 PASS (23 total, no failures); `pnpm -r test` exits 0.
- [x] No other test files touched — this is a minimal, targeted fix.

---

## Work Log

2026-06-16 [sdet] BUG-002-004 filed during SDET Validate gate. Root cause confirmed: `sign-in-rate-limit.integration.test.ts` missing `ALLOW_MOCK_AUTH=true` in `beforeEach`/`afterEach` after BUG-002-001 changed the `getSecret()` guard. `ALLOW_MOCK_AUTH=true pnpm --filter portal test -- sign-in-rate-limit...` → 7/7 PASS confirms fix path. Minimal: 2 env-var lines in existing lifecycle hooks.
2026-06-16 [webapp-developer] Starting implementation — adding `ALLOW_MOCK_AUTH=true` to `beforeEach` and cleanup in `afterEach` in `sign-in-rate-limit.integration.test.ts`. Single-file, 2-line fix per bug spec. No production code changes.
2026-06-16 [webapp-developer] Fix applied and all gates passed. Only `apps/portal/src/app/(public)/sign-in/sign-in-rate-limit.integration.test.ts` was modified. Submission gate output:
  - `pnpm --filter portal test`: Test Files 3 passed (3) | Tests 23 passed (23) — `sign-in-rate-limit.integration.test.ts` 7/7 PASS. No regressions.
  - `pnpm lint`: zero errors (apps/portal and apps/admin both clean).
  - `pnpm type-check`: zero errors (packages/ui, apps/portal, apps/admin all clean).
  Marking review.
2026-06-16T12:50:00Z [sdet] BUG-002-004 APPROVED. Guard-unchanged confirmed via git diff — `packages/auth/src/bindings/mock.ts` and `packages/auth/src/select.ts` show only the already-committed BUG-002-001 changes, nothing new from this fix. Fix is 2-line test-only change: `ALLOW_MOCK_AUTH=true` in `beforeEach` + `delete` in `afterEach`, with `// DECISION (BUG-002-004):` comment. No production code modified. Independent re-execution: `pnpm --filter portal test` 23/23 PASS, rate-limit file 7/7 PASS. ADR-022 throttle assertions intact and genuine. Status → done. Completed-at: 2026-06-16T12:50:00Z.

## SDET Review

**Decision: approved**

**Guard-unchanged:** `git diff main...brief-002-services-catalog-management -- packages/auth/src/bindings/mock.ts packages/auth/src/select.ts` returns only the already-committed BUG-002-001 changes. `git status --short` on both files is blank — working tree clean. The fail-closed guard (`isMockAllowed()` / `ALLOW_MOCK_AUTH`) was NOT weakened by this fix.

**Fix scope confirmed minimal:** diff on the test file shows exactly two additions — `process.env["ALLOW_MOCK_AUTH"] = "true"` in `beforeEach` with a `// DECISION (BUG-002-004):` comment citing BUG-002-001 guard change and the session-expiry.test.ts mirror pattern; and `delete process.env["ALLOW_MOCK_AUTH"]` in `afterEach`. No other file touched. No production code edited.

**Assertions genuine:** all 7 rate-limit tests continue to assert real ADR-022 throttle behavior — budget exhaustion, no session on throttled attempt, per-IP independence, generic error message, `retryAfterMs > 0`. The env var unblocks the mock-session path; it does not weaken or skip the throttle assertions. Tests would fail if the rate-limiter regressed.

**Independent re-execution:** `pnpm --filter portal test` → 23/23 PASS (3 files); `sign-in-rate-limit.integration.test.ts` 7/7 PASS. Exit code 0. Stderr `MOCK_SESSION_SECRET` dev-fallback warnings are expected and correct (dev fallback permitted when `ALLOW_MOCK_AUTH=true`; test context is the intended use case).

**AC coverage:** ADR-022 mandate ("an integration test proving the throttle on the sign-in surface") remains satisfied. No acceptance criterion added or removed.

## Attempt Log

(stuck-loop counter: 0)
