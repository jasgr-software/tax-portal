# BUG-002-003 — `sp_set_session_context @read_only = 1` is architecturally incompatible with Prisma connection pooling (reused pooled connection 500s on the 2nd request, error 15664)

**Status:** done
**Assigned to:** webapp-developer (`packages/db/src/client.ts` + a tier-3 pooled-reuse regression test) — **architecture consult complete; fix dispatched 2026-06-16**
**Impl:** developer
**Brief:** BRIEF-002 (rides BRIEF-002's PR) — **defect is latent from EPIC-004** (the `$extends` SESSION_CONTEXT path was delivered in EPIC-004/TASK-004-007; its 39/39 tier-3 tests masked this by forcing per-test connection isolation). Fixing it is required to deliver BRIEF-002's e2e gate (TASK-002-004 → 17/17).
**Brief-type:** feature · **Brief-deploys:** no
**Severity:** blocker (every reused pooled connection 500s on its 2nd SESSION_CONTEXT set; hard-blocks the 4 remaining TASK-002-004 write-journey e2e). **Security-sensitive: touches the identity trust boundary (ADR-003/ADR-005).**
**Updated-by:** webapp-developer

**Started-at:** 2026-06-16T20:00:00Z
**Complexity-estimate:** 2
**Complexity-actual:** 2
**Completed-at:** 2026-06-16T23:45:00Z

**Acceptance criteria:** AC-DOOR-002-01/-02/-03 — indirect: this bug blocks the in-container write journeys in TASK-002-004 (add/edit/deactivate). The write succeeds on connection A; the subsequent `revalidatePath('/services')` RSC re-render reuses pooled connection A and 500s on the 2nd SESSION_CONTEXT set → "Application error" → the 4 e2e fail. The bug's own correctness is verified by the pooled-reuse regression test (see § Regression test) + the 4 currently-failing e2e going green (17/17).
**Upstream refs:** ADR-003 §2 (set-on-acquire `$extends` middleware), **ADR-003 §3 (`@read_only = 1` — the clause this bug must change; explicit mandate → architecture consult required)**, ADR-003 §4 (reset-on-release; structurally depends on §3), ADR-003 §5 (fail-closed null-identity semantic), ADR-004 (Prisma sole ORM / connection pooling), ADR-005 (RLS reads SESSION_CONTEXT — the trust boundary identity reaches).
**Introduces-gate:** no (adds a regression test that reproduces the pooled-reuse path — the test is its own evidence; it does not introduce a new *required* CI/DoD gate). The pooled-reuse regression test is, however, a HARD DoD item — the gap it closes is the reason the defect shipped.

---

## Reproduction

1. Containers rebuilt with the BUG-002-002 Prisma-engine fix in place (the engine now loads). DB bootstrapped. Auth via mock provider (BUG-002-001).
2. As an authenticated accountant on admin `/services`, submit the **Add service** form (or Edit / Deactivate). The server action runs inside `withRequestContext(...)`:
   - `createServiceAction` → `requestDb()` → `$extends` `$allOperations` sets SESSION_CONTEXT on pooled connection **A** with `@read_only = 1` (succeeds — first set on A this request) → the INSERT commits. **The write SUCCEEDS.**
   - The action calls `revalidatePath('/services')`. Next.js re-renders the `/services` RSC tree. That re-render is a **new request context** (`sessionContextSet: false`) and issues `listAllServices()` → `$extends` → tries to set SESSION_CONTEXT again.
   - The pool hands back connection **A** (reuse). On A, the `clerk_user_id` / `role` keys are already set `@read_only = 1` from the prior request and were **not cleared** on release. The 2nd `sp_set_session_context` on the same locked key throws:
     ```
     Msg 15664: Cannot set key 'clerk_user_id' in the session context. The key has been set as read_only for this session.
     ```
   - The RSC re-render 500s → the page shows "Application error" → the TASK-002-004 add/edit/deactivate journeys + the cross-surface loop fail.
3. **Observed:** 13/17 e2e pass (all non-write paths); the 4 write-journey tests fail on the post-write re-render, not on the write itself.
4. **Expected:** the write commits AND the subsequent re-render on a reused pooled connection re-sets SESSION_CONTEXT cleanly; `/services` re-renders 200; the 4 e2e go green (17/17).

## Root cause

`packages/db/src/client.ts` (~lines 169–177) sets SESSION_CONTEXT with **`@read_only = 1`** on both keys (`clerk_user_id`, `role`). `@read_only = 1` locks the key for the **lifetime of the SQL Server connection**, not the lifetime of the request. Under Prisma connection pooling, a connection is reused across requests; the per-request guard `if (!ctx.sessionContextSet)` correctly prevents a *second set within the same request*, but it cannot help across requests — the **new** request gets a fresh `RequestContext` (`sessionContextSet: false`) and legitimately tries to set context on a connection whose keys are still locked from the **previous** request.

This is a direct collision between two ADR-003 sub-decisions:

- **ADR-003 §3** mandates `@read_only = 1` ("Downstream code executing on the same connection … cannot overwrite the identity mid-request. An attempted overwrite raises an error, which is preferred to silent spoof.").
- **ADR-003 §4** assumes the driver clears SESSION_CONTEXT on connection release (`sp_reset_connection`), which would make §3's lock irrelevant across requests. **In this Prisma 5.22 + sqlserver stack, the lock survives connection reuse** — so the very first cross-request reuse of a connection that previously set `@read_only=1` keys 500s. ADR-003 §4 itself flags this: "connection reset is **not a hard guarantee across all drivers and configurations** … older `mssql` driver versions had bugs where `SESSION_CONTEXT` could leak." The §4 regression test it prescribes (acquire → set spoof → release → re-acquire → read null) was **never implemented** — the carried EPIC-001 retro item "client.ts $extends SESSION_CONTEXT propagation untested" was closed by TASK-004-007 with a *propagation* test, not the *reset-on-release* test §4 demanded.

**`@read_only = 1` is essentially forced out, not a free design choice:** connection pooling is non-negotiable (ADR-004), and `@read_only = 1` + pooling = every reused connection 500s on its 2nd request. The only ways to keep `@read_only = 1` would be (a) disable pooling (rejected — pool-breaking, ADR-003 §Alternatives explicitly rejects per-connection-principal patterns for exactly this reason), or (b) guarantee SESSION_CONTEXT is cleared `@read_only`-and-all on every release (the §4 reset that this stack does not deliver for the locked keys). Removing `@read_only = 1` is the supported correction.

**Why the per-request guard still prevents within-request identity change after removal (the security property that must survive):**
- SESSION_CONTEXT is set **once per request** — the `if (!ctx.sessionContextSet)` guard flips `sessionContextSet = true` on the first set and is never re-entered within that request.
- The value set comes **only** from `currentRequestContext()`, populated by `withRequestContext(clerkUserId, role, …)` from the **verified** server-side identity (`getIdentity()`), never from client input (ADR-005 trust boundary; verified in `session-context.propagation.test.ts` trust-boundary case).
- No application code calls `sp_set_session_context` outside the `$extends` middleware (the ESLint `requestDb` import boundary + the barrel not exporting `requestDb` enforce this). So there is **no within-request second writer** for `@read_only` to defend against in the first place — the property §3 was protecting ("downstream raw SQL on the same connection overwrites identity mid-request") is already structurally prevented by the once-per-request guard + the no-raw-SQL-identity-writes convention. `@read_only = 1` was **defense-in-depth against a writer that does not exist in this codebase**, at the cost of being incompatible with pooling.

## Why latent since EPIC-004 — and why 39/39 + EPIC-004's tests missed it

The `$extends` SESSION_CONTEXT path was delivered in **EPIC-004 / TASK-004-007**, with `packages/db/src/session-context.propagation.test.ts` (4 tier-3 tests, part of the `@tax-portal/db` 39/39 green suite). **That test knew about error 15664 and engineered around it instead of recognizing it as a production defect.** Its `afterEach` (lines 100–119) reads, verbatim:

> "the $extends wrapper sets SESSION_CONTEXT with @read_only = 1 (ADR-003 §3). In production each HTTP request gets its own connection from the pool, which is reset on release … In tests, the Prisma pool holds onto connections between test runs within the same process — a connection that had @read_only=1 set would reject the next test's sp_set_session_context call with error 15664 … Disconnecting after each test forces the pool to release all connections."

So the test calls `db.$disconnect()` after **every** test — forcing a brand-new connection per test, exactly the isolation the **container's pooled-connection-reuse-across-requests does not provide**. The test's assumed premise ("in production each HTTP request gets its own connection … reset on release") is the ADR-003 §4 assumption that this stack violates for `@read_only` keys. Host vitest with `$disconnect` after each test = no cross-request connection reuse = 15664 never fires. The container = real pooling = 15664 fires on the first post-write re-render.

**This is the FOURTH container/concurrency defect EPIC-002's real e2e has surfaced that EPIC-001/004's env-blocked container smoke hid:**
1. BUG-002-001 — auth fail-closed guard 500s any prod-built container (NODE_ENV conflation).
2. BUG-002-002 — Prisma Alpine/OpenSSL-3 engine not generated/shipped (request-scoped Prisma 500s in-container).
3. (this) BUG-002-003 — `@read_only = 1` + pooling → reused-connection 500 on the 2nd request.
4. The fourth is *this same class*: the broader retro finding is that **no test ever exercised cross-request pooled-connection reuse** of the SESSION_CONTEXT path — the §4 reset-on-release regression test ADR-003 mandated was never written, and the propagation test masked the gap. Retro item (carried to Close-prep): "container smoke env-block + per-test `$disconnect` isolation hid the entire class of pooled-connection-reuse defects on the identity path."

## Architecture consult — REQUIRED (this is the explicit adjudication answer)

**ADR-003 §3 is a named, numbered clause of the Decision** ("The full contract has six parts: principal separation, set-on-acquire, **read-only flag**, reset-on-release, …") and §3 reads: *"Both `sp_set_session_context` calls pass `@read_only = 1`."* ADR-003 §2's conceptual code (lines 65–66) shows `@read_only = 1`, and §4 (line 99) structurally **depends** on it ("`@read_only=1` makes this impossible"). Removing `@read_only = 1` therefore **contradicts an Accepted ADR** — it is not a slice-local implementation detail the team may silently correct.

Per `AGENT.md` § Recording decisions & raising upstream and ENGINE.md § Gated Paths, the IO does **not** author ADRs. This change needs the `architecture` agent to:
1. Bless removing `@read_only = 1` as the supported reconciliation of §3 with connection pooling (ADR-004), or propose an alternative the IO hasn't foreseen (e.g. an explicit per-request reset-on-release of the keys that re-enables a `@read_only` scheme — though that re-introduces the §4 reset this stack doesn't deliver).
2. Update **ADR-003 §3** (and §4's dependency on it) with the corrected rationale: once-per-request set from verified identity + no in-codebase second writer makes `@read_only` defense-in-depth against a non-existent writer, while being incompatible with pooling; and **add the §4 reset-on-release regression test obligation that was never implemented** (or replace it with the pooled-reuse re-settability test below).
3. Record the compensating-control decision (see below).

The IO **raises** this upstream via `.implementation/OPEN-QUESTIONS.md` (`raised-upstream`). The main session / Conductor spawns the `architecture` agent (the IO cannot nest-spawn it). **The webapp-developer fix dispatch is HELD until the consult returns.** This BUG file's § Fix is the IO's recommended shape; the architecture agent confirms or amends it.

## Compensating control — recommendation (architecture to ratify)

**Recommendation: no new compensating control needed; the existing wrapper-only-sets-once-per-request-from-verified-context property is sufficient.** Rationale:
- The app `app_user_role` principal can already call `sp_set_session_context` (it must, to set its own identity) — `@read_only` never restricted *who* can call it, only whether a *second* call on the same connection is rejected. Removing `@read_only` does not grant a new capability to the principal.
- The real protection is structural, and it is unchanged by this fix: (a) SESSION_CONTEXT is set exactly once per request by the `$extends` middleware; (b) the value is the verified server-side identity only; (c) no other code path in the codebase issues `sp_set_session_context` (enforced by the ESLint `requestDb` boundary + barrel non-export + convention). An attacker would need to inject raw SQL into a request-pool query to overwrite identity mid-request — and that is an injection vulnerability that `@read_only` does not meaningfully mitigate (the same injection could read/exfiltrate cross-tenant rows directly).
- **Do NOT over-engineer** a per-request explicit `@read_only=0` reset-then-clear scheme unless the architecture agent finds a concrete second-writer threat. If a future hot-path stored proc or raw migration runs on the request pool and could overwrite identity, revisit — but that is not present today.
- One belt-and-braces option the architecture agent MAY prefer (its call, not forced): keep the keys writable but assert-on-mismatch — if `ctx.sessionContextSet` is false but SESSION_CONTEXT already holds a *different* `clerk_user_id` on this connection, that signals a reset-on-release failure and should be re-set (the new request's identity wins) rather than throw. This converts the 15664 hard-fail into a correct re-set, which is exactly the behavior the pooled-reuse path needs.

## Fix (IO-recommended shape — held for architecture ratification)

### `packages/db/src/client.ts` (webapp-developer)
- Remove `@read_only = 1` from **both** `sp_set_session_context` calls (lines ~171–172):
  ```sql
  EXEC sp_set_session_context @key = N'clerk_user_id', @value = @p1;
  EXEC sp_set_session_context @key = N'role',          @value = @p2;
  ```
- Update the inline comment (lines ~167–168) to explain: identity is set once per request from verified context; `@read_only` removed because it locks the key for the connection lifetime and is incompatible with pool reuse (15664 on reused connections); the once-per-request guard + verified-identity-only + no-second-writer convention preserves the within-request immutability the lock used to provide. Cite the ratified ADR-003 §3 revision and BUG-002-003. Record a `// DECISION:` comment.
- **Do NOT** change the `if (!ctx.sessionContextSet)` guard, the AsyncLocalStorage scope, the fail-closed `ctx === null` throw, or any identity-provenance path. The only change is dropping the two `@read_only = 1` flags.

### Regression test (webapp-developer — HARD DoD; this gap is why the defect shipped)
Add a tier-3 integration test (live SQL Server) in `packages/db/src/` that reproduces the **pooled-connection-reuse path** the propagation test deliberately avoided. It MUST fail against the old `@read_only = 1` code and pass after removal. Two acceptable shapes (do at least the first; the second is stronger):
1. **Re-settability after a prior set on the same pooled connection** — within one process, **without** `$disconnect` between, run two sequential `withClerkIdentity(...)` request scopes that each go through the `$extends` `db` path (forcing the pool to reuse the connection). The 2nd must NOT throw 15664 and must read back the 2nd request's identity. (The old code throws 15664 here — that is the red-then-green proof.)
2. **Cross-request reuse with identity change** — request 1 sets `user_A`/ACCOUNTANT; request 2 (reused connection, no disconnect) sets `user_B`/CLIENT; assert request 2 reads back `user_B`/CLIENT (the new identity wins, no 15664, no stale `user_A` leak). This doubles as a SESSION_CONTEXT-leak guard (the ADR-003 §4 obligation that was never implemented).
- Do **not** add a blanket `afterEach($disconnect)` that hides the reuse — the whole point is to exercise reuse. If a targeted disconnect is needed for *other* tests in the file, scope it so the new reuse test runs against a reused connection.
- Tag the AC ids and reference BUG-002-003 + the ratified ADR-003 §3/§4 in the test header.

### Do NOT (scope guards)
- Do NOT disable connection pooling or set pool size to 1 (defeats ADR-004; pool-breaking).
- Do NOT add an Alpine OpenSSL shim or touch the BUG-002-002 engine fix.
- Do NOT change `context.ts`, the server actions, the policies, or any UI.
- Do NOT fall back to `adminDb` for writes (that bypasses RLS — the TASK-002-001/002 trust boundary).

## Definition of Done
- [x] **Architecture consult complete** — ADR-003 §3/§4 amended by the `architecture` agent (Amendment 1, verdict B: set SESSION_CONTEXT WITHOUT `@read_only`; reset-on-release undeliverable on the Prisma 5.22 quaint sqlserver pool → `@read_only` incompatible with pooling). OPEN-QUESTIONS.md OQ-001 → `resolved`. The developer must NOT edit ADR-003 — architecture already amended it.
- [x] `@read_only = 1` removed from both `sp_set_session_context` calls in `client.ts`; comment + `// DECISION:` updated to cite the ratified ADR-003 revision + BUG-002-003.
- [x] Within-request identity immutability preserved (once-per-request guard untouched; verified-identity-only path untouched; fail-closed throw untouched).
- [x] Pooled-reuse regression test added (live SQL Server) — red against old code, green after; tagged + ADR-referenced.
- [x] `pnpm --filter @tax-portal/db test` green incl. the new test (no regression to `service.rls` 10/10, `service.persistence` 4/4, `session-context.propagation` — the propagation test's `afterEach($disconnect)` may stay for its own cases, but MUST NOT mask the new reuse test).
- [x] `pnpm lint` + `pnpm type-check` clean.
- [x] Compensating-control decision recorded (per architecture ratification): no new compensating control beyond the existing once-per-request-from-verified-context structural property (ADR-003 §3 Amendment 1 verdict B).
- [ ] (Main session, post-review) containers rebuilt + TASK-002-004 resumed → **4 previously-failing e2e green → 17/17** (the authoritative in-container proof).
- [x] Ops docs: N/A — `packages/db` code + test only; no env/secret/topology/Dockerfile change. No inventory/runbook update required.
- [x] SDET Review.

## Regression test
See § Fix → Regression test. **`## Testability` ruling (IO):** the defect is reproducible on the host *only* if the test exercises cross-request pooled-connection reuse without `$disconnect` (the propagation test's `$disconnect` is exactly what hid it). A host tier-3 test CAN reproduce it (it does not require the container — only real pooling against the live SQL Server). The container e2e (4 journeys → 17/17) is the end-to-end confirmation. Both are required.

## Work Log
- 2026-06-16 [io] BUG created during TASK-002-004 adjudication (escalation #3). Confirmed the defect + root cause against `client.ts` (lines 169–177), `context.ts`, and `session-context.propagation.test.ts` (the `afterEach($disconnect)` that masked it). Confirmed `@read_only = 1` removal is essentially forced by pooling. **Adjudication: ARCHITECTURE CONSULT REQUIRED — ADR-003 §3 explicitly mandates `@read_only = 1` and §4 depends on it; removing it contradicts an Accepted ADR.** Raised upstream via OPEN-QUESTIONS.md (`raised-upstream`). Fix dispatch HELD until the consult returns. Recommended compensating control: none beyond the existing once-per-request-from-verified-context property; do not over-engineer. | What's next: main session/Conductor spawns the `architecture` agent to ratify + update ADR-003 §3/§4; on return, IO composes the webapp-developer fix dispatch. | Blockers: architecture consult.
- 2026-06-16 [io] **OQ-001 RESOLVED → fix UNBLOCKED → webapp-developer dispatched.** Architecture agent verdict **(B): amend ADR-003 §3 to set SESSION_CONTEXT WITHOUT `@read_only` (keys writable)** — ADR-003 Amendment 1 already written by architecture (status stays Accepted). Option (A) "implement §4 reset-on-release, keep `@read_only=1`" rejected on a load-bearing finding: the request (`db`) path runs through Prisma 5.22's Rust query engine (quaint) sqlserver pool, which does NOT issue `sp_reset_connection` on checkout/checkin and exposes NO connection-release hook → reset-on-release in app code is undeliverable on this stack, and a `@read_only=1` key can't be cleared by `sp_set_session_context` at all → fundamentally incompatible with non-negotiable pooling (ADR-004). Within-request immutability preserved structurally (once-per-request guard + verified-identity-only value + single `$extends` writer via the ESLint `requestDb` boundary + barrel non-export). No new compensating control. The never-written §4 reset-on-release regression test is replaced by a MANDATORY tier-3 pooled-reuse re-settability test (red against old `@read_only=1` code with 15664, green after removal). Composed the webapp-developer fix dispatch per § Fix + the regression obligation. Architecture-consult DoD box ticked. | What's next: developer flips this BUG to `in-progress` (Dispatch Checkpoint), removes `@read_only` from both calls in `client.ts` + updates the comment/file-header + `// DECISION:` (cite ADR-003 §3 Amendment 1 + BUG-002-003), adds `packages/db/src/session-context.pooled-reuse.test.ts` (cross-request reuse without `$disconnect`; red-on-old/green-on-new), runs the submission gate, submits for SDET review. Main session commits + rebuilds containers + resumes TASK-002-004 (→17/17) after SDET approval. | Blockers: none.
- 2026-06-16 [webapp-developer] Starting implementation — drop @read_only from both sp_set_session_context calls + add pooled-reuse regression test | What's next: (1) edit client.ts to remove @read_only=1 + update comments + add DECISION citation, (2) write packages/db/src/session-context.pooled-reuse.test.ts, (3) Docker pre-flight, (4) run pnpm --filter @tax-portal/db test, (5) pnpm lint + type-check | Blockers: none. Ops docs: N/A — packages/db code + test only; no env/secret/topology/Dockerfile change. No inventory/runbook update required.
- 2026-06-16 [webapp-developer] Implementation complete. GATE OUTPUT:
  - `pnpm lint` — clean (0 errors, 0 warnings)
  - `pnpm type-check` — clean (0 errors)
  - `pnpm build` — clean (all routes generated successfully)
  - `pnpm --filter @tax-portal/db test` — 41/41 passed (8 test files):
      ✓ src/service.persistence.test.ts (4 tests) 254ms
      ✓ src/engagement-request.persistence.test.ts (5 tests) 208ms
      ✓ src/audit-event.rls.test.ts (9 tests) 191ms
      ✓ src/service.rls.test.ts (10 tests) 139ms
      ✓ src/session-context.pooled-reuse.test.ts (2 tests) 31ms  ← NEW REGRESSION TEST
      ✓ src/services.query.test.ts (3 tests) 82ms
      ✓ src/session-context.propagation.test.ts (4 tests) 83ms
      ✓ src/engagement-request.rls.test.ts (4 tests) 63ms
      Total: 8 files, 41 tests, all green (was 39/39 before this fix)
  COUNTERFACTUAL (red-on-old / green-on-new):
    The new pooled-reuse test (session-context.pooled-reuse.test.ts) runs two sequential
    withClerkIdentity() scopes WITHOUT $disconnect between them. Against the old @read_only=1
    code, the second sp_set_session_context call on the reused pooled connection throws Msg
    15664 ("Cannot set key 'clerk_user_id' ... read_only for this session") — the test goes
    RED. With @read_only removed (this fix), the second call re-sets SESSION_CONTEXT cleanly
    on the reused connection and the test goes GREEN. The test does NOT use afterEach($disconnect)
    (which was the masking mechanism in the propagation test) — it genuinely exercises cross-
    request pooled-connection reuse. afterAll($disconnect) is used only to clean up the pool
    after the entire suite. The test also verifies that the 2nd request's identity wins and no
    stale identity from request 1 leaks (ADR-003 §4 leak guard).
  DOCKER PRE-FLIGHT: docker info — Docker 29.4.1; SQL Server container tax-portal-sqlserver Up
    on port 14330. Connection verified via live tier-3 test execution (41/41).
  Files changed: packages/db/src/client.ts (drop @read_only, update comments/file-header),
    packages/db/src/session-context.pooled-reuse.test.ts (new regression test).
  E2E: N/A (packages/db code + test only; no e2e mandate on this task; in-container proof
    is TASK-002-004 → 17/17 post-review).
  | What's next: SDET review | Blockers: none.
- 2026-06-16 [sdet] **APPROVED.** Independent re-exec: `pnpm --filter @tax-portal/db test` 41/41 (8 files; session-context.pooled-reuse.test.ts 2/2 NEW; service.rls 10/10; service.persistence 4/4; propagation 4/4 — zero regression). `pnpm lint` clean. `pnpm type-check` clean. All 5 security-focused review items PASS — see `## SDET Review`. `Status: review → done`. `Completed-at: 2026-06-16T23:45:00Z`. | What's next: main session commits to feature branch + rebuilds containers + resumes TASK-002-004 (→17/17). | Blockers: none.

## SDET Review

**Decision:** approved

**Re-execution counts:**
- `pnpm --filter @tax-portal/db test`: **41/41** (8 files; was 39/39 before fix — 2 new pooled-reuse tests added)
  - `session-context.pooled-reuse.test.ts`: 2/2 GREEN (new)
  - `service.rls.test.ts`: 10/10 (no regression)
  - `service.persistence.test.ts`: 4/4 (no regression)
  - `session-context.propagation.test.ts`: 4/4 (no regression)
- `pnpm lint`: clean (0 errors, 0 warnings)
- `pnpm type-check`: clean (0 errors)

**Focus 1 — Surgical diff (only the two `@read_only` flags dropped):** PASS. The grep confirms `@read_only` is absent from all SQL in `client.ts` — present only in comments. Lines 198–199 are exactly the mandated form: `EXEC sp_set_session_context @key = N'clerk_user_id', @value = @p1;` and `EXEC sp_set_session_context @key = N'role', @value = @p2;` with no `@read_only = 1` suffix. The `ctx === null` fail-closed throw (line 166–172), the `if (!ctx.sessionContextSet)` once-per-request guard (line 196), and `ctx.sessionContextSet = true` (line 203) are byte-for-byte intact. Identity values `ctx.clerkUserId`/`ctx.role` come from `currentRequestContext()` (line 164) — verified server-side identity, never client input. No `adminDb` write fallback. File-header §4 claim corrected (line 23: "reset-on-release is NOT the mechanism"). `// DECISION:` comment present at line 193 citing ADR-003 §3 Amendment 1 + BUG-002-003. Architecture file check: `git diff --name-only HEAD` shows `.architecture/decisions/ADR-003-identity-propagation-session-context.md` as a working-tree modification only — not committed by the developer. Git log confirms it was last committed at `1510d82` (prior work, not this branch). The developer correctly left the architecture file untouched; the Amendment 1 is the architecture agent's pre-existing change.

**Focus 2 — Within-request immutability preserved structurally:** PASS. The `$extends $allOperations` middleware (the sole `sp_set_session_context` caller) sets context at most once per request via the `sessionContextSet` guard. Identity value is exclusively from `currentRequestContext()` which is populated by `withRequestContext()`/`withClerkIdentity()` from verified server-side Clerk identity. `requestDb` is not exported from the barrel (`index.ts` line 10: "Does NOT export: requestDb"). ESLint boundary confirmed by clean `pnpm lint`. Full grep of `sp_set_session_context` across `packages/db/src/` and `apps/` confirms no second caller exists in application source code (the `.next/standalone/` hits are pre-existing build artifacts, not source changes).

**Focus 3 — Regression test genuinely exercises pooled reuse:** PASS. `session-context.pooled-reuse.test.ts` has NO `afterEach` call (only in comments explaining its absence). It has `afterAll($disconnect)` for pool cleanup only. Both tests run two sequential `withClerkIdentity()` scopes on a reused connection without `$disconnect` between them. Test 1 ("core regression"): same-role identity change on reused connection — asserts 2nd call does not throw and reads back 2nd user's clerkUserId/role. Test 2 ("identity change / leak guard"): ACCOUNTANT→CLIENT identity change on reused connection — asserts 2nd identity wins, stale 1st-request identity does not appear, no 15664 thrown. The counterfactual is documented in the file header and in each test's JSDoc: restoring `@read_only=1` in `client.ts` causes the second `withClerkIdentity` scope to throw Msg 15664 → both tests go RED. SDET independent re-exec confirms both tests GREEN at 2/2.

**Focus 4 — ADR-005 trust boundary intact:** PASS. RLS predicates continue to key on `SESSION_CONTEXT` set by the verified server-side identity. The `service.rls.test.ts` suite (10/10 in independent re-exec) confirms the ACCOUNTANT write boundary and CLIENT read-only enforcement under the same `$extends` path. The identity trust boundary is unchanged — the only behavioral change is that a reused pooled connection no longer 500s on its second SESSION_CONTEXT set; the value set is still the verified identity from `withRequestContext()`.

**Focus 5 — Metadata/contract:** PASS. `Complexity-actual: 2` (integer, in range 1–5). `Started-at: 2026-06-16T20:00:00Z` present. `Complexity-estimate: 2` present. Dispatch Checkpoint entry ("Starting implementation") present as the third Work Log entry, preceding implementation entries. `Introduces-gate: no` correctly set — no 3-item gate-authoring evidence block required; the counterfactual is captured in the test file and Work Log. Ops docs N/A stated in Work Log breadcrumb (code + test only; no env/secret/topology/Dockerfile change). All dev-owned Quality Gate boxes ticked. No tool-hygiene violations detected in the Work Log.
