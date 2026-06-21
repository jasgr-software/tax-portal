---
brief: BRIEF-004
status: done
assigned_to: webapp-developer
updated_by: sdet
depends_on: TASK-004-002 (done — `packages/auth` port + mock binding deliver the server-side role read)
impl: developer
e2e_required: no
started_at: 2026-06-15T00:00:00Z
completed_at: 2026-06-15T08:00:00Z
complexity_estimate: "2"
complexity_actual: "2"
introduces_gate: no
acceptance_criteria: [AC-AUTH-001-01, AC-AUTH-001-02, AC-AUTH-001-03]
upstream_refs: ADR-001 (role lives in `publicMetadata.role`; one Clerk app / two surfaces), ADR-005 (role is the trust boundary — server-evaluated, never client-asserted)
---

# TASK-004-004: Role-model invariants + server-side role read

---

## Quality Gates

- [x] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [x] **Submission gate** — `pnpm lint` + `pnpm type-check` + `pnpm build` + the new `packages/auth` tests pass
- [N/A] **Targeted e2e** — this task is tier-2 unit + tier-3 integration only; the brief mandates no e2e for the role-model invariants (e2e lives in TASK-004-005/-008)
- [x] **Security review** — verified: (1) role enumeration uses single-source-of-truth ROLES const derived type — client cannot add a third role; (2) AC-AUTH-001-03 negative cases: X-Role header, query param, Authorization bearer, and forged base64 payload are ALL ignored — only the HMAC-signed cookie value is the role source; (3) missing role and invalid-enum role both resolve to null identity (no coercion); (4) `@clerk/nextjs` not imported anywhere in test file; AUTH_PROVIDER=clerk never set
- [x] **SDET Review** — approved

## SDET Review focus areas

- **Cites ADR-001 + ADR-005 in Upstream refs — verify the implementation honors them:** role enumeration is exactly `{ACCOUNTANT, CLIENT}`; the one-role invariant rejects both-roles and zero-roles; role is read **only** from the verified session (the mock binding's HMAC-signed cookie under test), **never** from a client-settable header/body/query.
- **AC-id test tagging:** every test names its AC id (`AC-AUTH-001-01/-02/-03`) so the Validate gate can trace coverage. Reject if a tagged test asserts behavior the AC does not state, or if an in-scope AC has no tagged test.
- **No real Clerk contacted:** tests run against the mock binding / the `Role` type only. Reject if any test requires `AUTH_PROVIDER=clerk` or a live Clerk instance (would calls `ClerkBindingNotAvailableError`).
- **No over-scoping:** these invariants live in `packages/auth` (app-agnostic). Do **not** add `apps/portal`/`apps/admin` UI or routes here — the multi-surface (both-apps) default does not apply to a package-level type/port invariant.

## Context

This task proves the **two-role model** is correct and that an account's role is **authoritatively determinable server-side after sign-in** — the foundation every downstream access decision (middleware redirect matrix, SESSION_CONTEXT wiring, audit predicate) relies on.

The brief's own tier mapping (BRIEF-004 § Methodology):

- **tier 2 (unit):** AC-AUTH-001-01 — role enumeration.
- **tier 3 (integration):** AC-AUTH-001-02 (one-role invariant) + AC-AUTH-001-03 (role readable server-side).

The seam this task tests already exists from TASK-004-002: `packages/auth` exports the `Role` type (`'ACCOUNTANT' | 'CLIENT'`), the `Identity` type (`{ clerkUserId, role }`), the `AuthProvider` port, and the `MockAuthProvider` binding whose `getSessionRole()` / `getIdentity()` read the role from an **HMAC-signed mock session cookie** (set server-side via `/api/mock-session`) — never from client-supplied input. This task **adds the invariant tests** against that seam; it does not re-build the binding.

**Re-scope context:** the Clerk binding is the production target but is **not contacted by any gate** (no real Clerk keys — BRIEF-004 re-scope 2026-06-15). All assertions here run against the mock binding or the static `Role` type. 2FA is deferred — assert nothing about a second factor.

### Acceptance scenarios (gherkin — bind as AC-id-tagged tests)

```gherkin
# AC-AUTH-001-01
Given the authentication model of the system
When the set of assignable authenticated roles is enumerated
Then it contains exactly ACCOUNTANT and CLIENT and no other authenticated role

# AC-AUTH-001-02
Given any authenticated account in the system
When its role assignment is inspected
Then it has exactly one role — never both ACCOUNTANT and CLIENT, and never none

# AC-AUTH-001-03
Given a signed-in account
When any access decision is evaluated for that account
Then the account's role is available and authoritative for that decision
```

> Gherkin format note (CLAUDE.md): until the Cucumber binder lands, author these as standard `*.test.ts`
> cases **tagged by AC id** (the AC id in the `describe`/`it` title and a `// AC-AUTH-001-0X` comment). No
> `.feature` mirror is required for tier-2/3 package-level tests (the `.feature` mirror convention applies to
> the app-level e2e suites in TASK-004-005/-008).

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `packages/auth/src/role-model.test.ts` | Create | Tier-2 unit (AC-AUTH-001-01) + tier-3 integration (AC-AUTH-001-02/-03) invariant tests against the `Role` type + `MockAuthProvider` |
| `packages/auth/src/port.ts` | Modify (only if needed) | If a single source-of-truth `ROLES` tuple/const is needed to make the enumeration test meaningful (see Implementation Notes), add `export const ROLES = ['ACCOUNTANT', 'CLIENT'] as const` and derive `Role` from it. Otherwise leave unchanged. |
| `packages/auth/src/index.ts` | Modify (only if `ROLES` added) | Re-export `ROLES` from the barrel |

## Tests to Write First

- [ ] `[AC-AUTH-001-01] enumerated assignable roles are exactly ACCOUNTANT + CLIENT, nothing else` — expected: the role enumeration set is `{ACCOUNTANT, CLIENT}` with length 2; no third value is assignable/accepted. (Tier 2 — assert against the single-source-of-truth `ROLES` enumeration, not a hand-copied literal in the test.)
- [ ] `[AC-AUTH-001-02] a verified identity carries exactly one role — never both, never none` — expected: `getIdentity()` against a valid mock session returns an `Identity` whose `role` is a single member of the enumeration; a session with **no** role claim resolves to `null` identity / `role-missing` (not a defaulted role); there is no representable "both roles" state (the type is a single `Role`, not a set) — assert the contract holds at the seam (e.g. a malformed session claiming two roles is rejected, not silently coerced). (Tier 3 — exercise `MockAuthProvider.getIdentity()` / `checkSession()`.)
- [ ] `[AC-AUTH-001-03] after sign-in the role is determinable + authoritative server-side` — expected: given a server-side-issued mock session (signed cookie), `getSessionRole(request)` returns the exact role the session was issued with, on every call; the role derives from the **verified** session signature, **not** from a client-settable header/body/query (assert that injecting a conflicting `x-role`-style header or query param does NOT change the resolved role — ADR-005). (Tier 3.)

## Implementation Notes

- **Single source of truth for the enumeration (AC-AUTH-001-01).** A test that hard-codes `['ACCOUNTANT','CLIENT']` and compares it to another hard-coded literal proves nothing. If `packages/auth` does not already expose a runtime enumeration of the roles (the `Role` type is compile-time only), add `export const ROLES = ['ACCOUNTANT', 'CLIENT'] as const` in `port.ts` and derive `type Role = typeof ROLES[number]`, then assert against `ROLES`. This makes the enumeration test catch a real regression (adding a third role to the source). Mirror this into `packages/db` only if trivially aligned — otherwise leave `packages/db` untouched (TASK-004-007 owns that wiring); a `// DECISION:` note suffices.
- **One-role invariant (AC-AUTH-001-02).** The type system already prevents "both roles" (a single `Role`, not `Role[]`). The meaningful integration assertion is at the **session-decode seam**: a session payload missing the role, or carrying a non-enumeration value, must resolve to no-identity / `role-missing` — never a defaulted or coerced role. Use `MockAuthProvider` + the mock-session signing helpers (`signMockSessionAsync` / `createMockSessionCookie`) to build valid and malformed sessions.
- **Server-side authoritative read (AC-AUTH-001-03 + ADR-005).** The discriminating test is the **negative** one: construct a request whose verified session says `CLIENT` but whose headers/query try to assert `ACCOUNTANT`, and assert the resolved role is `CLIENT` (the session wins; client input is ignored). This is the ADR-005 trust-boundary proof.
- **No real Clerk.** Do not import `@clerk/nextjs`. Do not set `AUTH_PROVIDER=clerk`. If you instantiate `ClerkAuthProvider` at all, only to assert it satisfies the port shape / throws `ClerkBindingNotAvailableError` when its methods are called — that is acceptable and reinforces the gate-safety contract, but is optional.
- **No 2FA.** Assert nothing about a second factor — that scope is deferred.
- **Test runner:** `packages/auth` already has `vitest.config.ts`; co-locate the test under `src/`. Run via `pnpm --filter @tax-portal/auth test` (or the workspace `pnpm -r test`); include the actual run output in the Work Log.

## Definition of Done

- [ ] AC-AUTH-001-01 proven by a tier-2 unit test against the single-source-of-truth role enumeration
- [ ] AC-AUTH-001-02 proven by a tier-3 integration test (exactly-one-role at the session-decode seam; no defaulted/coerced role)
- [ ] AC-AUTH-001-03 proven by a tier-3 integration test, including the ADR-005 negative case (client-supplied role input is ignored; the verified session is authoritative)
- [ ] Every test is tagged with its AC id
- [ ] No real Clerk instance contacted; no `@clerk/nextjs` import; tests run with the mock binding / `Role` type only
- [ ] `pnpm lint` + `pnpm type-check` + `pnpm build` + the new tests pass — execution output in the Work Log
- [ ] No `apps/*` UI/route added (package-level scope only)

---

## Work Log

- 2026-06-15 [webapp-developer] Starting implementation — role-model invariants test file + ROLES const in port.ts | What's next: add ROLES tuple to port.ts, create role-model.test.ts with AC-AUTH-001-01/-02/-03 tagged tests, run submission gate | Blockers: none
- 2026-06-15 [webapp-developer] Implementation complete. Changes: (1) Added `export const ROLES = ['ACCOUNTANT', 'CLIENT'] as const` to `packages/auth/src/port.ts` and derived `Role` type from it via `(typeof ROLES)[number]`. (2) Re-exported `ROLES` from `packages/auth/src/index.ts`. (3) Created `packages/auth/src/role-model.test.ts` with 21 tests across 3 describes, AC-id tagged per spec. Submission gate results below. | What's next: SDET review | Blockers: none
- 2026-06-15 [sdet] APPROVED. All mandatory rejection checks passed; AC-AUTH-001-01/-02/-03 proven at correct tier against the runtime ROLES const and MockAuthProvider seam; ADR-001 + ADR-005 trust-boundary verified including the forged-payload HMAC rejection; no real Clerk contacted; no 2FA assertions; package-level scope only. Status set to done.

  **Submission gate output — pnpm lint:** zero errors (packages/auth has no lint script; apps/portal + apps/admin both passed)

  **Submission gate output — pnpm type-check:** zero errors across all packages

  **Submission gate output — pnpm build:** packages/auth + portal + admin all built clean

  **Submission gate output — pnpm --filter @tax-portal/auth test:**
  ```
   RUN  v3.2.6 /home/ccox/repos/tax-portal/packages/auth
   ✓ src/redirect.test.ts (42 tests) 9ms
   ✓ src/select.test.ts (8 tests) 5ms
   ✓ src/mock.test.ts (21 tests) 28ms
   ✓ src/role-model.test.ts (21 tests) 25ms
   Test Files  4 passed (4)
        Tests  92 passed (92)
     Duration  308ms
  ```

  **Submission gate output — pnpm -r test (full workspace):**
  ```
  packages/auth: 4 test files, 92 tests — all passed
  packages/db:   3 test files, 12 tests — all passed
  apps/admin:    1 test file,   1 test  — all passed
  apps/portal:   2 test files, 16 tests — all passed
  Total: 10 test files, 121 tests, 0 failures
  ```

## Attempt Log

**Attempt count**: 0

## SDET Review

**Decision**: approved
**Notes**: All mandatory rejection checks passed (required spec fields present; Complexity-actual 2 in range; Started-at + Complexity-estimate populated; pre-implementation Work Log entry precedes all other edits; Quality-Gate boxes correctly ticked; no tool-hygiene violations; e2e correctly N/A for tier-2/3 task). Submission gate evidence (lint/type-check/build + 92 auth tests + 121 workspace tests) is consistent with the diff. AC-id test-tag contract: all 21 tests carry AC-id tags in describe/it title and inline comments; every in-scope AC has coverage; no test asserts out-of-scope behavior (no 2FA, no over-scoping). AC-AUTH-001-01: asserts against the live `ROLES` const imported from `port.ts` — adding a third role to `port.ts` would red the fourth test (`for (const r of ROLES) { expect(knownRoles).toContain(r); }`) — not two hand-copied literals. PASS. AC-AUTH-001-02: exercises `MockAuthProvider.getIdentity()` and `checkSession()` at the session-decode seam; missing role (payload omits field) and invalid-enum role ("ADMIN") both resolve to null via the HMAC-verified path in `verifyMockSessionAsync`; "both roles" unrepresentable confirmed at runtime (typeof scalar string + not array); missing-cookie → checkSession returns `valid: false, reason: "unauthenticated"`. PASS. AC-AUTH-001-03 + ADR-005 negative case: verified CLIENT session + `x-role: ACCOUNTANT` header resolves CLIENT (header is never read); symmetric ACCOUNTANT case passes; query param alone → null; `x-role` header alone → null; `Authorization: Bearer` alone → null; `getIdentity` ignores `x-user-role` + `x-clerk-user-id` headers; `checkSession` reads ACCOUNTANT from session ignoring `x-role: CLIENT`. Forged base64 payload reusing original signature is cryptographically rejected by `hmacVerify` (payload string differs → HMAC mismatch → null). All ADR-005 trust-boundary proofs present and correct. No `@clerk/nextjs` import; no `AUTH_PROVIDER=clerk`; no real Clerk contacted. No 2FA assertions. Package-level scope only — no `apps/*` changed. ADR-001 compliance: Role enumeration matches `publicMetadata.role: 'ACCOUNTANT' | 'CLIENT'` per ADR-001 § Role storage; ROLES const is the single source of truth from which `Role` type derives. ADR-005 compliance: all server-side role reads go through the HMAC-verified cookie; client-supplied inputs (headers, query params, bearer tokens, forged payloads) are ignored across all methods. Introduces-gate: no — no new CI step or blocking gate introduced.
