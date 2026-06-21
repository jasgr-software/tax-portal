---
brief: BRIEF-002 (rides BRIEF-002's PR) — **defect is in EPIC-004-delivered code**; fixing it is required to deliver BRIEF-002's e2e gate (TASK-002-004).
status: done
assigned_to: webapp-developer (auth code) + devops (compose/.env/ops wiring)
updated_by: webapp-developer
impl: developer
started_at: 2026-06-16T14:17:04Z
completed_at: 2026-06-16T09:45:00Z
complexity_estimate: "2"
complexity_actual: "2"
brief_type: feature
brief_deploys: no
introduces_gate: no (modifies an existing guard's mechanism; the new `select.test.ts` case is its own evidence, not a new required gate).
acceptance_criteria: [AC-DOOR-002-01/-02/-03, AC-DASH-010-01/-02/-03, AC-DOOR-002-05 (UI surface) — indirect: this bug blocks every e2e AC in TASK-002-004; unblocking it is the gate to validate them. The bug's own correctness is verified by the regression tests below.]
upstream_refs: ADR-001 (auth-provider-selection seam), ADR-006 (two frontends), ADR-007 (long-lived Node container), ADR-010 (admin all-auth). The F1/F6 security finding (EPIC-004 PR-review) is the intent this fix preserves and strengthens.
severity: blocker (hard-blocks the TASK-002-004 e2e execution gate; both prod-built containers return HTTP 500 on every request)
---

# BUG-002-001 — Auth fail-closed guard blocks mock provider in any prod-built container (admin + portal 500)

---

## Reproduction

1. `docker compose build admin portal && docker compose up -d admin portal` (containers run `NODE_ENV=production`, Next standalone, with `AUTH_PROVIDER=mock` per the compose default `${AUTH_PROVIDER:-mock}` — the EPIC-004-sanctioned e2e/local practice).
2. `curl -i http://localhost:13001/healthz` (admin) and `curl -i http://localhost:3000/healthz` (portal).
3. **Observed:** HTTP 500 on every request; both containers `(unhealthy)`.
4. **Expected:** HTTP 200 — the prod-built container serving the mock provider for e2e/local is a sanctioned configuration.

## Root cause

`packages/auth/src/select.ts` (EPIC-004 PR-fix commit `c89689d`, the F1/F6 fail-closed guard):

```ts
if (process.env["NODE_ENV"] === "production") {
  if (!rawProvider || provider === "mock") throw …
}
```

The guard **conflates "Node build mode" (`NODE_ENV=production`, true for ANY built image — including the e2e/local prod-built container) with "is this a real deployment serving real users."** `NODE_ENV` cannot distinguish the two, so the e2e/local prod-built container with `AUTH_PROVIDER=mock` throws at provider construction on the first request → 500. Next Edge Runtime also **inlines `process.env["NODE_ENV"]` at build**, compounding the problem (the value is frozen into the bundle).

`packages/auth/src/bindings/mock.ts:82` (`getSecret()`) has the **same `NODE_ENV === "production"` belt-and-suspenders guard** — it must move in lockstep, or it becomes the new throw site the instant `select.ts` is fixed.

Why it shipped undetected: EPIC-004's container smoke was env-blocked (CI-substituted), so no one rebuilt + ran the prod container with the F1/F6 fix in place. The TASK-002-004 developer respected scope (left `select.ts` unchanged) and escalated — correct behavior.

## Fix (IO-confirmed; ADR-001 seam mechanism correction, NOT a new architectural decision)

**Decouple the guard from `NODE_ENV`. Fail closed by default; permit the mock/unset provider ONLY via an explicit, runtime-read opt-in.**

### `packages/auth/src/select.ts` (webapp-developer)
- Replace the `NODE_ENV === "production"` guard with an `ALLOW_MOCK_AUTH` opt-in:
  ```ts
  const allowMock = (process.env["ALLOW_MOCK_AUTH"] ?? "").toLowerCase() === "true";
  if (!allowMock && (!rawProvider || provider === "mock")) {
    throw new Error("[packages/auth] mock auth is forbidden unless ALLOW_MOCK_AUTH=true. " +
      "Set AUTH_PROVIDER=clerk for a real deployment, or ALLOW_MOCK_AUTH=true for e2e/local.");
  }
  ```
- `ALLOW_MOCK_AUTH` **must be read at runtime** (bracket-access at call time inside `createAuthProvider()` — same shape as the existing `AUTH_PROVIDER` read), NOT inlined like `NODE_ENV`. Do not gate it on `NODE_ENV`.
- Add a `// DECISION:` comment: the guard keys on explicit deployment intent (`ALLOW_MOCK_AUTH`), not build mode (`NODE_ENV`), because `NODE_ENV=production` is true for any built image and cannot distinguish an e2e/local prod-built container from a real deploy. A real deploy sets neither flag → mock/unset still throws (forge-resistant, F1/F6 intent preserved + strengthened).
- Update the file header comment that currently says "forbidden in NODE_ENV=production".

### `packages/auth/src/bindings/mock.ts` `getSecret()` (webapp-developer, same dispatch)
- Replace the `NODE_ENV === "production"` branch in `getSecret()` with the same `ALLOW_MOCK_AUTH`-keyed semantics: throw on the dev-fallback/missing secret only when mock is genuinely **not** opted in. Keep the non-prod dev-fallback warning path when `ALLOW_MOCK_AUTH=true`. Both guards must agree on the same predicate.

### Tests (webapp-developer, same dispatch)
- `packages/auth/src/select.test.ts`: add cases —
  - prod-shaped + `ALLOW_MOCK_AUTH=true` + `AUTH_PROVIDER=mock` → returns `MockAuthProvider` (no throw).
  - no `ALLOW_MOCK_AUTH` + `AUTH_PROVIDER=mock` → throws (fail-closed default).
  - no `ALLOW_MOCK_AUTH` + `AUTH_PROVIDER` unset → throws (fail-closed default).
  - `AUTH_PROVIDER=clerk` → returns `ClerkAuthProvider` regardless of `ALLOW_MOCK_AUTH` (real deploy path unaffected).
  - Ensure `afterEach` cleans up `ALLOW_MOCK_AUTH`.
- Keep `mock.test.ts` green (adjust any guard-shape assumptions to the new predicate).

### Compose + env + ops wiring (devops, same or follow-up dispatch)
- `docker-compose.yml` `admin` + `portal` services: add `ALLOW_MOCK_AUTH: "${ALLOW_MOCK_AUTH:-true}"` (default true for the local stack — these are e2e/local containers).
- `.env.example`: document `ALLOW_MOCK_AUTH` — mock-only opt-in; **NEVER set in a real production deploy** (a real deploy uses `AUTH_PROVIDER=clerk` and leaves `ALLOW_MOCK_AUTH` unset → fail-closed).
- Per CLAUDE.md § DevOps: this changes the container env contract → **update `.implementation/operations/inventory.md` and `.implementation/operations/runbook.md`** to document `ALLOW_MOCK_AUTH` (purpose, default, the "never in prod" rule).
- `.env.local` is user-walled, but the container reads compose env, so the `${ALLOW_MOCK_AUTH:-true}` compose default covers e2e/local without touching `.env.local`.

## Forge-resistance check (the F1/F6 intent must remain intact)

| Scenario | `AUTH_PROVIDER` | `ALLOW_MOCK_AUTH` | Result | Correct? |
| -------- | --------------- | ----------------- | ------ | -------- |
| Real prod deploy | `clerk` | unset | Clerk binding | yes |
| Real prod deploy, misconfigured | unset/`mock` | unset | **THROW** (fail closed) | yes — strengthened |
| e2e/local prod-built container | `mock` | `true` | Mock binding, serves 200 | yes — the bug fix |
| Attacker forces mock at runtime | `mock` | (not set by deploy) | **THROW** | yes |

## Regression test required (ENGINE § Bug Fixes)

The new `select.test.ts` cases above ARE the regression test (a test that would have caught this: prod-shaped + `ALLOW_MOCK_AUTH=true` must NOT throw). Plus the container 200-on-`/healthz` proof: after the fix, the **main session** rebuilds (`docker compose build admin portal && docker compose up -d admin portal`) and confirms both containers serve 200 before TASK-002-004 e2e resumes — that container-level proof is captured in the Smoke phase, not by the developer.

## Definition of Done

- [x] `select.ts` guard keys on `ALLOW_MOCK_AUTH` (runtime-read), not `NODE_ENV`; `// DECISION:` recorded; header comment updated.
- [x] `mock.ts` `getSecret()` guard uses the same `ALLOW_MOCK_AUTH` predicate (via `isMockAllowed()` shared helper — both guards agree).
- [x] `select.test.ts` regression cases added (prod-shaped + flag = no throw; no flag = throw; clerk unaffected); `afterEach` cleans `ALLOW_MOCK_AUTH`. Also fixed `session-expiry.test.ts` to set `ALLOW_MOCK_AUTH=true` in `beforeEach`.
- [x] `docker-compose.yml` admin + portal set `ALLOW_MOCK_AUTH: "${ALLOW_MOCK_AUTH:-true}"`.
- [x] `.env.example` documents `ALLOW_MOCK_AUTH` (mock-only; never in real prod).
- [x] `.implementation/operations/inventory.md` + `runbook.md` updated for the new container env contract.
- [x] Submission gate: `pnpm lint` + `pnpm type-check` + `pnpm build` clean; `pnpm --filter @tax-portal/auth test` green (incl. new cases); no regression in existing auth tests.
- [x] SDET Review (rigorous — see review focus below).

## SDET review focus (rigorous — this is a security-guard redesign of an EPIC-004 F1/F6 finding)

1. **Fail-closed default with NO flag** — prod-shaped env + `AUTH_PROVIDER=mock`/unset + no `ALLOW_MOCK_AUTH` → throws. Verify by re-exec.
2. **Mock works in the prod-built container WITH the flag** — the rebuilt admin/portal containers serve **200 on `/healthz`** with `ALLOW_MOCK_AUTH=true` + `AUTH_PROVIDER=mock` (the main session rebuilds; SDET verifies the 200s in Smoke).
3. **Auth unit tests green** — `pnpm --filter @tax-portal/auth test` re-exec, including the new `select.test.ts` cases and unchanged `mock.test.ts`.
4. **F1/F6 forge-resistance intact** — a real prod deploy (no `ALLOW_MOCK_AUTH`) still throws on mock/unset; `AUTH_PROVIDER=clerk` path unaffected by the flag.
5. **Both guards agree** — `select.ts` and `mock.ts` `getSecret()` use the same predicate; the prod-built container does not throw at `getSecret()` after `select.ts` is fixed.
6. **Runtime-read, not inlined** — `ALLOW_MOCK_AUTH` read at call time (bracket access), not gated on `NODE_ENV`, so the Edge bundle honors the container env.
7. **Ops docs consistent** — `inventory.md`/`runbook.md` reflect the new container env contract (CLAUDE.md § SDET infra rule: reject if stale).

## Work Log

2026-06-16 [webapp-developer] Starting implementation — auth guard decouple from NODE_ENV + ALLOW_MOCK_AUTH wiring | What's next: edit select.ts guard | Blockers: none

2026-06-16 [webapp-developer] Implementation complete. All 6 files changed (select.ts, mock.ts, select.test.ts, session-expiry.test.ts, docker-compose.yml, .env.example, inventory.md, runbook.md). Gate output:

  pnpm lint → PASS (zero errors)
  pnpm type-check → PASS (zero errors)
  pnpm build → PASS (portal + admin both compiled clean)
  pnpm --filter @tax-portal/auth test → 124 passed (7 test files: invitation-provenance 9, mock 21, redirect 44, role-model 21, select 12, session-expiry 7, rate-limiter 10)

  New regression cases in select.test.ts (12 total, 5 new):
    [BUG-002-001] prod-shaped env + ALLOW_MOCK_AUTH=true + AUTH_PROVIDER=mock → MockAuthProvider (no throw) ✓
    [BUG-002-001] no ALLOW_MOCK_AUTH + AUTH_PROVIDER=mock → throws (fail-closed default) ✓
    [BUG-002-001] no ALLOW_MOCK_AUTH + AUTH_PROVIDER unset → throws (fail-closed default) ✓
    [BUG-002-001] AUTH_PROVIDER=clerk → ClerkAuthProvider regardless of ALLOW_MOCK_AUTH ✓
    AUTH_PROVIDER=clerk + ALLOW_MOCK_AUTH=true → ClerkAuthProvider (real deploy unaffected) ✓

  session-expiry.test.ts: adjusted beforeEach/afterEach to set ALLOW_MOCK_AUTH=true (guards now agree on the same predicate). All 7 tests green.
  mock.test.ts: unchanged and green — getSecret() guard only enters the ALLOW_MOCK_AUTH branch when secret is missing/dev-fallback; the tests set MOCK_SESSION_SECRET to a real value so the branch is never reached.

SDET review focus:
  1. Forge-resistance: no ALLOW_MOCK_AUTH + AUTH_PROVIDER=mock → throws. Verified by select.test.ts [BUG-002-001] cases.
  2. Both guards agree: select.ts uses allowMock inline; mock.ts uses isMockAllowed() helper (same predicate — ALLOW_MOCK_AUTH). No split-brain possible.
  3. Runtime-read: ALLOW_MOCK_AUTH read via bracket-access at call time inside createAuthProvider() and isMockAllowed() — not inlined, not NODE_ENV-gated.
  4. Clerk path unaffected: AUTH_PROVIDER=clerk works with or without ALLOW_MOCK_AUTH. Verified by both select.test.ts cases for clerk.
  5. Ops docs: inventory.md documents ALLOW_MOCK_AUTH purpose, default, and "never in real prod" rule. runbook.md § Environment Setup has the ALLOW_MOCK_AUTH warning block.
  6. Container smoke (main session gate): after SDET approval, main session rebuilds admin+portal and verifies /healthz 200 with ALLOW_MOCK_AUTH=true + AUTH_PROVIDER=mock.

## SDET Review

**Decision:** approved

**Re-execution results (independent):**
- `pnpm --filter @tax-portal/auth test` → **124/124 PASS** (7 files: invitation-provenance 9, mock 21, redirect 44, role-model 21, select 12, session-expiry 7, rate-limiter 10). Matches developer-claimed counts exactly.
- `pnpm lint` → PASS (zero errors, both apps).
- `pnpm type-check` → PASS (zero errors, packages + both apps).
- `curl -si http://localhost:13001/healthz` → **HTTP 200** (admin container, `ALLOW_MOCK_AUTH=true` + `AUTH_PROVIDER=mock`).
- `curl -si http://localhost:3000/healthz` → **HTTP 200** (portal container, same env).

**7-focus verdicts:**

1. **Fail-closed default — PASS.** `select.test.ts` lines 100–112: `[BUG-002-001] no ALLOW_MOCK_AUTH + AUTH_PROVIDER=mock → throws` and `[BUG-002-001] no ALLOW_MOCK_AUTH + AUTH_PROVIDER unset → throws`. Both assert `.toThrow(/ALLOW_MOCK_AUTH/)`. The `afterEach` deletes `ALLOW_MOCK_AUTH` to ensure a clean slate between cases. These tests would fail if the guard were weakened or removed.

2. **Mock works in prod-built container WITH the flag — PASS.** `select.test.ts` lines 81–98: explicitly sets `NODE_ENV=production` + `ALLOW_MOCK_AUTH=true` + `AUTH_PROVIDER=mock`, calls `createAuthProvider()`, asserts `toBeInstanceOf(MockAuthProvider)` with no throw. Container-level proof: both `/healthz` endpoints return HTTP 200 (independently confirmed above).

3. **Both guards agree — PASS.** `select.ts` line 68: `const allowMock = (process.env["ALLOW_MOCK_AUTH"] ?? "").toLowerCase() === "true"`. `mock.ts` lines 84–86: `isMockAllowed()` returns the identical expression. `getSecret()` lines 94–101 call `isMockAllowed()` — NOT `process.env["NODE_ENV"]`. No split-brain. The `isMockAllowed()` helper DECISION comment explicitly calls out that both guards must agree and why (lines 77–82 of mock.ts).

4. **Runtime-read, not inlined — PASS.** `ALLOW_MOCK_AUTH` is read via `process.env["ALLOW_MOCK_AUTH"]` at call time inside `createAuthProvider()` and `isMockAllowed()`. No `NODE_ENV` gate wrapping it. No inlining. The prod-shaped regression test (NODE_ENV=production set in the test process) passes because the bundle does not freeze `ALLOW_MOCK_AUTH` at build.

5. **F1/F6 forge-resistance intact — PASS.** Truth table verified by test suite: (a) no-flag + mock → throw; (b) no-flag + unset → throw; (c) prod + flag + mock → MockAuthProvider; (d) clerk + flag → ClerkAuthProvider; (e) clerk + no-flag → ClerkAuthProvider (`select.test.ts` line 114). A real deployment omitting `ALLOW_MOCK_AUTH` still throws on mock/unset. The clerk switch-case branch at `select.ts` lines 76–80 is reached regardless of `allowMock` (the guard only fires when `!rawProvider || provider === "mock"`).

6. **Wiring complete + consistent — PASS.** `docker-compose.yml` portal service line 119: `ALLOW_MOCK_AUTH: "${ALLOW_MOCK_AUTH:-true}"`. Admin service line 182: identical. Both carry the BUG-002-001 comment and the "NEVER in real prod" warning. `.env.example` lines 109–118: documents the flag with the explicit "NEVER set to true in a real production deploy" warning. Default `true` is scoped to the compose/local case only.

7. **Ops docs consistent — PASS.** `inventory.md` line 96: full `ALLOW_MOCK_AUTH` row including purpose, default, and "never in real prod" rule; `Last updated: BUG-002-001`. `runbook.md` § Environment Setup, lines 56–65: `ALLOW_MOCK_AUTH` warning block with the fail-closed explanation and the "NEVER in prod" rule; `Last updated: BUG-002-001`. Both files updated in the same commit as the code change. Not stale.

**Mandatory rejection checks — all clear:**
- Dispatch Checkpoint "Starting implementation" Work Log entry present.
- `Started-at: 2026-06-16T14:17:04Z`, `Complexity-estimate: 2`, `Complexity-actual: 2` (integer, in 1–5 range).
- Required spec fields present: `**Acceptance criteria:**`, `**Upstream refs:**`, `**Introduces-gate: no**`.
- No tool-hygiene violations in the Work Log.
- Regression test exists and would fail if the guard regressed: the `[BUG-002-001]` cases prove prod-shape + flag + mock → no throw and no-flag + mock → throw.
- `Introduces-gate: no` — Gate Authoring 3-item evidence not required.

2026-06-16T09:45:00Z [sdet] BUG-002-001 APPROVED. Re-exec: `@tax-portal/auth` 124/124; lint 0; type-check 0; `/healthz` admin 200; portal 200. All 7 focus items pass. F1/F6 forge-resistance strengthened: fail-closed by default, explicit ALLOW_MOCK_AUTH=true required for mock. Status → done.

## Attempt Log

(stuck-loop counter: 0)
