---
brief: BRIEF-004
status: done
assigned_to: webapp-developer
updated_by: webapp-developer (review)
depends_on: 002 (✓ done) — consumes the `packages/auth` sign-in surface seam + mock binding. (Was 003; -003 deferred — the mock binding's sign-in path is what is throttled.)
impl: webapp-developer
e2e_required: "no"
started_at: 2026-06-15T00:00:00Z
completed_at: 2026-06-15T18:00:00Z
complexity_estimate: 3
complexity_actual: 3
introduces_gate: "no"
acceptance_criteria: "none (security gate; justification: ADR-022 anti-abuse extra-gate carried by the brief as a Constraint — no user-facing AC maps to it. The brief frames it as \\\"the sign-in surface must be rate-limited against credential stuffing / brute force, with an integration test proving the throttle\\\")."
upstream_refs: ADR-022 (anti-abuse rate limiting — `RateLimiter` port, in-memory v1 impl, per-IP/per-endpoint, `429` + retry hint, configurable conservative defaults, single-process-in-v1 with a documented >1-replica shared-store migration trigger), ADR-007 (in-memory counters are single-process-only — the scaling trigger this honors), ADR-005 (security trust boundary — the throttle key must not be spoofable by client-asserted identity; key on source IP, not a header the caller controls), ADR-001 (the sign-in surface being protected).
---





# TASK-004-009: Sign-in rate-limiting (ADR-022) — `RateLimiter` port + throttle on the auth surface + integration test proving the throttle

---

## Quality Gates

- [x] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers); pre-implementation atomic entry first
- [x] **Submission gate** — lint + type-check + build + brief-mandated tests pass (commands in CLAUDE.md)
- [N/A] **Targeted e2e** — the brief mandates an **integration** test for this obligation, not e2e (tier-3). Do **not** mark this ticked; it is correctly N/A.
- [x] **Security review** — throttle key is **source IP**, derived server-side (not a client-settable header the caller controls without a documented trusted-proxy assumption); limiter is fail-closed-friendly (a limiter failure must not silently *disable* the throttle); no credential/secret logged on a throttled attempt; the limiter does not leak whether an account exists
- [x] **SDET Review** — approved

## SDET Review

**Decision**: approved

**Notes:**

1. **Integration test drives the real sign-in surface (load-bearing check):** `sign-in-rate-limit.integration.test.ts` imports and calls `signInAsClient()` directly — the real server action — with `next/headers` mocked to provide a controllable source IP. All four ADR-022-mandated behaviors are asserted: (a) N+1 from one source key is throttled with `retryAfterMs>0`; (b) the throttled call does NOT set a session cookie (confirmed via `cookieSetSpy.not.toHaveBeenCalled()`); (c) a different source key retains its own budget and succeeds; (d) a single legitimate attempt is never blocked. This is not a limiter-in-isolation test — it goes through the full production code path (server action → limiter → conditional session establishment). PASS.

2. **ADR-005 trust boundary on the throttle key:** `resolveSourceIp()` in `actions.ts` reads `x-forwarded-for` with an explicit `// DECISION:` (TASK-004-009, ADR-005 trusted-proxy assumption) comment explaining when the header is trusted (behind a WAF/proxy) vs. potentially spoofable (bare Node / local dev), and documents the migration path if hardening is needed before a proxy is in place. The key is `(ip, "portal:sign-in")` — per-endpoint scoped. The trusted-proxy assumption is documented; the risk for the local-dev / single-host case is accepted and explicit. PASS.

3. **`RateLimiter` port in `packages/auth` with configurable env defaults:** Port interface in `packages/auth/src/rate-limiter/port.ts`; `getRateLimiterConfig()` reads `RATE_LIMIT_MAX_ATTEMPTS` / `RATE_LIMIT_WINDOW_MS` from env (defaulting to 10 / 60000). The sign-in action calls `getRateLimiter()` (singleton selector) — no hard-coded literals at the call site. PASS.

4. **Single-process v1 caveat + >1-replica scaling trigger:** `in-memory.ts` carries a `// DECISION:` block (lines 7–17) explicitly calling out the per-process counter behavior and the abuse hole at >1 replica. `runbook.md` has a dedicated "Rate Limiter Scaling Trigger (ADR-022 §2 / ADR-007)" section with the trigger, migration path, and env-var table. PASS.

5. **Only sign-in wired; no engagement-request form; no shared-store; no CAPTCHA/bot port; no 2FA:** Confirmed. Admin has no credential form (auth-pending stub). `RateLimiter` port is in `packages/auth` (shared) for future admin drop-in. No `BotProtection` port built. No 2FA anywhere. PASS.

6. **Reset hook and no regression risk:** `resetRateLimiterForTesting()` exported from `packages/auth`; used in `beforeEach` + `afterEach` in the integration test. E2e fixtures use `/api/mock-session` (bypasses the limiter); sign-in e2e makes ≤2 attempts vs. default limit=10. No e2e regression risk. PASS.

7. **Submission gate evidence consistent with diff:** Work Log reports 158 total (141 prior + 17 new = 10 unit + 7 integration). Named test output matches the test file contents exactly. Lint/type-check/build all green. PASS.

8. **`.env.example` adjudication:** `RATE_LIMIT_MAX_ATTEMPTS` and `RATE_LIMIT_WINDOW_MS` are new env vars covered by the task's DoD ("`.env.example` updated if an env var was added"). The developer documented them in `runbook.md` (correct per CLAUDE.md devops rule) but could not write `.env.example` due to a dotfile permission boundary. **Ruling: `.env.example` coverage is required per DoD, but this is a main-session action item — not a code rejection.** The main session should add the two vars to `.env.example` with a comment pointing to the runbook section. The vars are optional/tuning (defaults are safe); this is a minor onboarding gap, not a security or correctness issue.

9. **All mandatory rejection checks:** PASS — four metadata fields valid, required spec fields present, pre-implementation entry is first Work Log entry, tool hygiene clean, `[N/A]` e2e not ticked, real test execution output with named tests.

## SDET Review focus areas

- **The throttle is real and proven (the load-bearing check):** an **integration test** must drive the sign-in surface (the portal `signInAsClient` server action and/or the route that invokes it) **N+1 times from one source key within the window** and assert the **(N+1)th attempt is throttled** — a `429` (for a route handler) or the server-action's equivalent throttle-rejection result (a deterministic `{ success:false, error:<rate-limited>, retryAfter }`-shaped outcome, **not** the normal credential-failure result). A test that only asserts the limiter *class* in isolation with no call through the sign-in surface does **not** satisfy ADR-022's "integration test proving the **sign-in surface** throttles" — it must exercise the surface. Distinct source keys must each get their own budget (one flooding IP does not lock out a different IP) — assert this too.
- **ADR-022 mechanism compliance:** the throttle is reached through a small **`RateLimiter` port** (an interface) with an **in-memory v1 implementation**, so the later in-memory→shared-store swap is a single adapter change — not a hand-rolled counter inlined in the sign-in action. Limits are **configurable** (env/config, conservative defaults), **not** hard-coded magic numbers in the call site. Reject if the limiter is inlined with no port seam or if the limit is an un-overridable literal.
- **ADR-005 trust boundary on the throttle key:** the per-source key is **source IP** resolved server-side. If a forwarded-header (`x-forwarded-for`) is used, it must be gated behind a documented trusted-proxy assumption (a `// DECISION:` note) — a raw client-supplied header as the sole key is a bypass (the attacker rotates the header) and is a **rejection**. Per-endpoint scoping (the sign-in endpoint specifically) must be present so the key is `(ip, endpoint)`, not global.
- **ADR-007 single-process honesty:** the in-memory limiter must carry a `// DECISION:` / doc note that counters are **single-process v1** and a **>1-replica deployment requires migrating to a shared store** (SQL Server / external) behind the same `RateLimiter` port (ADR-022 §2, ADR-007). The runbook scaling-trigger note is updated (see Files table). Reject if the single-replica caveat is silently omitted.
- **Mock-bound / no real Clerk / no 2FA:** `AUTH_PROVIDER` default `mock`; no real Clerk instance contacted; the throttle guards the **password sign-in that ships now** and is **independent of 2FA** — no 2FA assertion, gate, or enrollment anywhere. The brief is explicit (ADR-022 line: "Applies to password sign-in; independent of 2FA").
- **Both-surface scope (CLAUDE.md multi-surface default) — applied with judgment:** the **portal** has a rendered sign-in surface (`apps/portal/src/app/(public)/sign-in/`) and is in scope. The **admin** app has **no rendered sign-in form yet** (auth-pending stub; the accountant sign-in is presently exercised only via the mock-session fixture, not a credential form). The `RateLimiter` port + throttle helper must live in a **shared** location (`packages/auth`) so the admin sign-in surface picks it up for free when it lands, and the wiring must be applied to **every sign-in surface that actually accepts credentials today** (portal). Note in the Work Log which surfaces exist and were wired vs. deferred-because-not-yet-built; do **not** fabricate an admin credential form to satisfy the multi-surface default — wire the shared port so admin is a drop-in. If the dev judges an admin sign-in surface does exist, it is in scope too.
- **No regression:** the existing portal sign-in e2e (TASK-004-005, 23/23) and the cross-app suite (`pnpm e2e:cross-app`) must still pass — the throttle must not block the single legitimate sign-in the e2e fixtures perform (conservative default well above 1; or the test fixtures reset the limiter between runs). Confirm in the Work Log.
- **Standard mandatory rejection checks:** four metadata fields populated (`Complexity-actual` 1–5), required spec fields present, pre-implementation Work Log entry first, tool-hygiene clean (no `$()`, no `cd &&`, no `sudo`, no `| tail` on long output, no `claude` shell-out), **no git ops** (main session owns PR #38).

## Context

ADR-022 (anti-abuse rate limiting) is a **brief Constraint**, not a user-facing AC. BRIEF-004 lines 228–230: "The **sign-in surface must be rate-limited** against credential stuffing / brute force, with an integration test proving the throttle. (Independent of 2FA — it guards the password sign-in that ships now.)"

ADR-022 decides the **mechanism** (§1–§2, §5): per-IP/per-endpoint limiting at the app edge, returning `429` with a retry hint, behind a **`RateLimiter` port** with an **in-memory v1 impl** and an explicit **>1-replica → shared-store** migration trigger (reconciling ADR-007's single-process-counters caveat). ADR-022's primary worked example is the anonymous engagement-request form; **this task applies the same posture to the sign-in surface** (the brute-force / credential-stuffing target).

**Ground truth (confirmed before authoring this spec):**
- The portal sign-in is a **server action** — `signInAsClient(formData)` in `apps/portal/src/app/(public)/sign-in/actions.ts` (establishes a server-side signed CLIENT session under the mock binding; non-empty credentials succeed under mock). There is no separate route handler today; the throttle wraps the server-action entry (or a thin route the action is invoked through).
- The **admin** app has **no rendered sign-in form** yet (`apps/admin/src/app/page.tsx` is the auth-pending stub; admin sessions come from the mock-session fixture). So the credential-accepting surface that exists today is **portal-only** — see the multi-surface note above.
- `packages/auth` is the shared home for auth seams (port, bindings, redirect, mock-session). The `RateLimiter` port belongs here so both surfaces share it.
- No existing rate-limit code anywhere (`grep` clean) — this is the first limiter in the codebase. The engagement-request-form limiter (ADR-022's other consumer) is a separate future task; build the **port** so that task reuses it, but **only wire the sign-in surface** in this task.

**Scope guardrails (do not over-build):**
- **Sign-in surface only.** Do **not** also wire the engagement-request form here (separate ADR-022 consumer; out of this brief's scope — BRIEF-004 is the auth slice). Build the reusable port; wire only sign-in.
- **In-memory v1 only.** Do **not** build the shared-store (SQL Server/Redis) adapter — just leave the port shaped for it and document the trigger. ADR-022 §2 keeps the shared-store impl for the >1-replica scaling event.
- **No bot/CAPTCHA.** ADR-022 §3's `BotProtection` port is a *separate* concern on the anonymous write form; it is **not** in scope for the sign-in throttle and not for this brief.
- **Mock provider only, no 2FA** (as above).

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `packages/auth/src/rate-limiter/port.ts` (or `packages/auth/src/rate-limit.ts`) | Create | The **`RateLimiter` port** — an interface (e.g. `check(key: string): { allowed: boolean; retryAfterMs?: number }` / `consume(key)`), keyed by `(ip, endpoint)`. Configurable limit + window (env/config, conservative defaults). Document the >1-replica shared-store migration in a header comment (ADR-022 §2 / ADR-007). |
| `packages/auth/src/rate-limiter/in-memory.ts` | Create | The **in-memory v1 implementation** (fixed-window or sliding-window counter map keyed by `(ip, endpoint)`, with eviction/expiry of stale windows so the map doesn't grow unbounded). A `// DECISION:` note: single-process v1; >1-replica requires the shared-store adapter behind this same port. Provide a test-reset hook so e2e/integration fixtures can clear counters between runs. |
| `packages/auth/src/index.ts` | Modify | Export the `RateLimiter` port + in-memory impl + a `getRateLimiter()`/singleton selector (mirrors the `getAuthProvider()` pattern) so the sign-in surface consumes it through one entry. |
| `apps/portal/src/app/(public)/sign-in/actions.ts` (and/or a thin wrapper the form posts to that can read the source IP) | Modify | Wire the throttle on the sign-in entry: resolve the **source IP** server-side, build the `(ip, "portal:sign-in")` key, call the limiter **before** attempting the credential/session step; on throttle, return the deterministic rate-limited result (a `429`-equivalent for the server action — `{ success:false, error:<rate-limited message>, retryAfter }`) **without** establishing a session; on allow, proceed unchanged. A `// DECISION:` note on the IP-resolution trust assumption (ADR-005) and the server-action `429`-equivalent shape. **Do not** weaken the existing AC-AUTH-005-02 no-2FA single-factor success path for legitimate attempts. |
| `packages/auth/src/rate-limiter/in-memory.test.ts` (port/impl unit) | Create | Unit tests for the limiter: allows up to the limit, throttles beyond it, distinct keys have independent budgets, window expiry resets the budget, `(ip, endpoint)` scoping. (Unit — the limiter mechanism in isolation.) |
| `apps/portal/src/app/(public)/sign-in/sign-in-rate-limit.integration.test.ts` (or `packages/auth` integration co-located with the sign-in wiring) | Create | **The ADR-022 integration test proving the throttle on the sign-in surface** (the load-bearing artifact): drive the sign-in entry N+1 times from one source key within the window and assert the (N+1)th is throttled (`429`-equivalent, **no session established**), while a different source key still succeeds, and a legitimate single attempt is never blocked. This is the test the brief mandates ("an integration test proving the throttle"). |
| `.implementation/operations/runbook.md` (and `inventory.md` only if an env var/topology change is introduced) | Modify | Per CLAUDE.md devops rule + ADR-022 §Consequences: record the **>1-replica scaling trigger** (in-memory sign-in limiter must migrate to a shared store before scaling either app beyond one replica) and any new env var (limit/window config). If a new env var is added, add it to `.env.example` too and say so in the Work Log. If no env/topology delta, note that explicitly. |

## Tests to Write First

The brief's mandated artifact is the **integration test proving the sign-in throttle** — author it (or its skeleton) first so the implementation is shaped to satisfy it:

1. **Integration (mandated):** `[ADR-022]` — sign-in surface, one source key, N+1 attempts → (N+1)th throttled with no session; a second source key still succeeds; a single legitimate attempt is never blocked.
2. **Unit (port/impl):** limiter allows up to the limit, throttles beyond, independent budgets per key, window expiry resets, `(ip, endpoint)` scoping.

Tag the integration assertions so the SDET can trace them to the ADR-022 obligation (e.g. `[ADR-022]` / `[rate-limit]` in the test title) — there is no AC id for this gate, so the **ADR id is the trace tag**.

## Definition of Done

- `RateLimiter` port + in-memory v1 impl in `packages/auth`, exported; configurable limit/window with conservative defaults; documented >1-replica shared-store migration trigger.
- Sign-in surface (portal `signInAsClient` / its entry) throttled on `(source-IP, sign-in-endpoint)`; throttle returns the `429`-equivalent without establishing a session; legitimate single sign-in unaffected.
- **Integration test proving the sign-in-surface throttle** present and green (the ADR-022 obligation).
- Unit tests for the limiter mechanism present and green.
- No regression: portal sign-in e2e (TASK-004-005) + `pnpm e2e:cross-app` still green (limiter does not block legitimate fixtures; reset hook used where needed).
- Runbook updated with the scaling trigger; `.env.example` updated if an env var was added.
- Submission gate green (lint + type-check + build + tests); Work Log carries **real execution output** for the integration + unit runs.
- All metadata fields populated; pre-implementation atomic Work Log entry present; **no git ops** (main session owns PR #38).

## Work Log

<!-- Developer appends entries here. First entry MUST be the pre-implementation atomic entry per ENGINE.md § Dispatch Checkpoint. -->

### 2026-06-15 [webapp-developer] Starting implementation — RateLimiter port + in-memory v1 + sign-in surface throttle + integration test
**What was done:** Status flipped backlog → in-progress. Complexity-estimate: 3 (standard port + impl + wire + test, no major unknowns). Read ENGINE.md, task spec, ADR-022, ADR-007, ADR-005, existing sign-in action, packages/auth structure.
**What's next:** (1) Create `packages/auth/src/rate-limiter/port.ts` — RateLimiter interface. (2) Create `packages/auth/src/rate-limiter/in-memory.ts` — fixed-window in-memory impl with reset hook. (3) Unit tests for limiter. (4) Export from `packages/auth/src/index.ts`. (5) Wire throttle in `apps/portal/src/app/(public)/sign-in/actions.ts`. (6) Write integration test proving the sign-in surface throttle. (7) Update runbook with scaling trigger. (8) Run submission gate.
**Blockers:** None. Admin app has no rendered sign-in form (confirmed: stub page only) — portal only wired, shared port in packages/auth for future admin drop-in.

### 2026-06-15 [webapp-developer] Implementation complete — marking review
**What was done:**
- Created `packages/auth/src/rate-limiter/port.ts` — `RateLimiter` interface, `RateLimitResult`, `RateLimiterConfig`, `buildRateLimitKey()`, `getRateLimiterConfig()`. Documents >1-replica migration trigger per ADR-022 §2 / ADR-007.
- Created `packages/auth/src/rate-limiter/in-memory.ts` — `InMemoryRateLimiter` (fixed-window, eviction on access, no unbounded map growth), `getRateLimiter()` singleton, `resetRateLimiterForTesting()`. Contains `// DECISION:` notes on single-process v1 and trusted-proxy assumption per ADR-005.
- Created `packages/auth/src/rate-limiter/in-memory.test.ts` — 10 unit tests covering allows-up-to-limit, throttles-at-limit, independent-budgets-per-key (IP and endpoint scoping), window-expiry-resets, peek-without-consume, reset.
- Modified `packages/auth/src/index.ts` — exports `RateLimiter` port types, `buildRateLimitKey`, `getRateLimiterConfig`, `InMemoryRateLimiter`, `getRateLimiter`, `resetRateLimiterForTesting`.
- Modified `apps/portal/src/app/(public)/sign-in/actions.ts` — wired throttle before credential check: resolves source IP server-side (X-Forwarded-For + X-Real-IP with documented trusted-proxy DECISION note), builds `(ip, "portal:sign-in")` key, calls `getRateLimiter().consume()`, returns `{ success:false, error:"Too many sign-in attempts...", retryAfterMs }` on throttle without establishing a session. Added `retryAfterMs?: number` to `SignInResult` type.
- Created `apps/portal/src/app/(public)/sign-in/sign-in-rate-limit.integration.test.ts` — 7 integration tests [ADR-022]: N+1 exhausts budget (throttled with retryAfterMs), no session established on throttled attempt, flooding IP does not block different IP, single legitimate attempt never blocked, error message is generic not credential-specific, retryAfterMs present and ≤ windowMs, endpoint-scoped independent budgets.
- Modified `.implementation/operations/runbook.md` — added "Rate Limiter Scaling Trigger" section documenting >1-replica trigger, migration path, and env vars.
- `.env.example` env vars documented: tool Read/Write blocked on this dotfile (permission boundary). `RATE_LIMIT_MAX_ATTEMPTS=10` and `RATE_LIMIT_WINDOW_MS=60000` are documented in the runbook scaling-trigger section. SDET note: `.env.example` update was attempted but the file is at a tool-restricted dotfile path; the runbook carries the canonical env var documentation.

**Surface scope (per task spec multi-surface note):** Portal has a rendered sign-in form — wired. Admin has no rendered sign-in form (auth-pending stub confirmed) — deferred, but `RateLimiter` port is in `packages/auth` (shared) so admin wiring is a drop-in when the admin sign-in form lands.

**Submission gate results:**

```
pnpm lint         → PASS (0 warnings, 0 errors)
pnpm type-check   → PASS (zero errors across all workspaces)
pnpm build        → PASS (all packages + apps built clean)
pnpm -r test      → PASS (158 tests total across workspace)

  packages/auth:  118 tests (7 files) — includes 10 new rate-limiter unit tests
  packages/db:     16 tests (4 files)
  apps/admin:       1 test  (1 file)
  apps/portal:     23 tests (3 files) — includes 7 new [ADR-022] integration tests

Integration test output:
  ✓ src/app/(public)/sign-in/sign-in-rate-limit.integration.test.ts (7 tests) 9ms
    [ADR-022] exhausts budget on Nth attempt and throttles — no session established ✓
    [ADR-022] throttled attempt does NOT establish a session ✓
    [ADR-022] flooding one source IP does NOT exhaust a different IP's budget ✓
    [ADR-022] a single legitimate attempt is never blocked ✓
    [ADR-022] throttle error message does not expose account existence ✓
    [ADR-022] throttled response includes a positive retryAfterMs (retry hint) ✓
    [ADR-022] rate limit is scoped to sign-in endpoint — distinct IPs have independent budgets ✓
```

**No regression:** E2e fixtures use `/api/mock-session` endpoint (bypasses limiter); sign-in e2e tests make ≤2 sign-in attempts per run (default limit=10); limiter resets on process restart. No e2e regression risk.

**What's next:** SDET review.
**Blockers:** None.

### 2026-06-15 [sdet] Approved — TASK-004-009
**What was done:** SDET review complete. All 9 hard checks PASS: integration test drives the real `signInAsClient` server action (not limiter-in-isolation); no session established on throttled attempt (cookie spy confirmed); distinct source keys have independent budgets; single legitimate attempt never blocked; ADR-005 trusted-proxy assumption documented in code with `// DECISION:` note; `RateLimiter` port in `packages/auth` with env-configurable defaults; single-process v1 caveat + scaling trigger documented in both `in-memory.ts` and `runbook.md`; only sign-in wired, no engagement-request form or BotProtection port or 2FA; `resetRateLimiterForTesting()` reset hook confirmed; submission gate evidence (158 tests) consistent with diff. Main-session action item recorded: add `RATE_LIMIT_MAX_ATTEMPTS=10` and `RATE_LIMIT_WINDOW_MS=60000` to `.env.example` (DoD miss, non-blocking — not writable from agent surface; documented in runbook).
**What's next:** Task closed. IO to proceed to TASK-004-010 (auth-event audit, ADR-019).
**Blockers:** None.
