# ADR-011: Repository Interface as Test Seam

**Status:** Accepted
**Date:** 2026-04-27
**Deciders:** SA (with user direction)
**Related:** ADR-003 (Identity propagation via SESSION_CONTEXT), ADR-004 (Prisma as sole ORM), ADR-005 (RLS via Security Policies), ADR-006 (Monorepo layout)

## Context

Two pressures shape this decision and they pull in opposite directions:

1. **The data layer is already wrapped.** Per ADR-003 §2 and ADR-004, every request-scoped DB query goes through the `$extends` middleware exported by `packages/db` as `db`. That wrapper sets `SESSION_CONTEXT(N'clerk_user_id', N'role')` before the first real query, throws if the request context is missing, and is the load-bearing identity-propagation enforcement point. There is no second ORM and no client that bypasses it (an integration test asserts a single `new PrismaClient(...)` per pool — ADR-004 § Client shape). For service-layer code, "talk to the DB" already means "go through `db`," not "construct your own Prisma instance."

2. **Tier 1 unit tests must run without Docker.** Claude Cloud sandboxes — and any future agent execution environment that lacks a SQL Server service container — cannot run the real DB. A test pipeline that requires Docker for every assertion against service-layer logic kills the inner loop. The two-tier split adopted in TASK-LOE-001 makes this explicit: **Tier 1** (unit) runs in any environment, fast, no Docker; **Tier 2** (integration) runs in CI with the SQL Server service container provisioned by `.github/workflows/ci.yml` jobs `test-portal` and `test-admin`. Today those jobs are `continue-on-error: true` (advisory) until Epic 001 scaffolds the apps; once apps exist they become the home for Tier 1 (the `pnpm --filter portal test` step) and a separate integration job is the home for Tier 2.

The standing tension: **what does service-layer code mock when it wants to test business logic in Tier 1?** The Prisma client surface is enormous and shaped by the schema — mocking it directly produces brittle tests that exercise Prisma's query DSL more than the service-layer logic. Wrapping the Prisma client in a `() => prisma` "provider" or a DI-container indirection nominally makes it injectable but smuggles the entire Prisma surface in through a different door. Neither approach gives a stable, narrow seam at the boundary where service-layer behavior is actually meaningful.

The journey-for-jasmine project (a sibling repo on .NET + Dapper) hit the same shape and resolved it in its ADR-026 with `IUserRepository`-style interfaces mocked via Moq. The concept ports — interfaces are a test seam, not an architectural guarantee — but the shape is different on this stack: the data layer is already wrapped (ADR-003), so the seam does not live at every Prisma call; it lives one layer up, at the service-layer boundary.

The stale pointer in `agents/sdet.md:69-73` ("ADR-026 enforcement" + ".NET task that touches `apps/*-api/*/Data/`") is a port artifact from that sibling repo. It currently points at an ADR that does not exist in this codebase. This ADR creates the home; TASK-LOE-006 § (e) updates the SDET text to reference it with the criteria adopted here.

## Decision

**Service-layer modules that read or write through Prisma and carry unit tests express their data-access dependency as a TypeScript interface (`I<Entity>Repository`). Tier 1 tests mock the interface with Vitest primitives. Tier 2 integration tests bind the concrete Prisma-backed implementation, which itself goes through `packages/db`'s `db` client and therefore through ADR-003's `SESSION_CONTEXT` wrapper.**

The full contract has six parts: where the seam lives, naming and location, when it's required vs. optional, mocking discipline, RLS interaction, and the two-tier pipeline relationship.

### 1. Where the seam lives

The seam is at the **service-layer boundary**, not at every Prisma call. Concretely: a service function (e.g., `createEngagement`, `markMessageRead`, `acceptEngagementRequest`) takes a repository interface as a constructor or function parameter and calls methods on it. The interface's concrete implementation calls `db.engagement.findUnique(...)`, `db.message.update(...)`, etc. — through the `db` client exported by `packages/db`, which is the `$extends`-wrapped pool from ADR-003 §2.

This means the seam **sits one layer above** the ADR-003 `$extends` wrapper. The wrapper is the lower-level seam already and is non-optional — it is how identity reaches `SESSION_CONTEXT`. The interface seam exists for testability of the service layer's logic; it does not replace, weaken, or duplicate the wrapper.

A service module that does not have unit tests does not need an interface. Route handlers that delegate to the service layer do not need an interface. UI components do not need an interface. The seam is for service-layer unit tests; speculative interfaces are not introduced.

### 2. Naming and location

**Interface naming:** `I<Entity>Repository` — for example, `IUserRepository`, `IEngagementRepository`, `IThreadRepository`, `IDocumentRepository`. The `I`-prefix is intentional: it makes the test-seam role visible at the import site and disambiguates from concrete classes that would otherwise share the entity name.

**Interface location:**

- Domain-scoped interface → `packages/<feature>/src/repositories/I<Entity>Repository.ts`.
- Cross-feature interface (used by more than one feature package) → `packages/db/src/repositories/I<Entity>Repository.ts`.

**Concrete implementation:** colocated with the interface, prefixed by adapter — `Prisma<Entity>Repository.ts` (e.g., `packages/<feature>/src/repositories/PrismaUserRepository.ts`). The concrete class imports `db` from `packages/db` and implements the interface on top of it.

**Mocks:** Vitest mocks are not separate files. They are constructed inline in the test file via `vi.fn()` / `vi.mock()` against the interface type. Test fixtures that build a fully-mocked repository for reuse may live in `packages/<feature>/src/repositories/__mocks__/<Entity>RepositoryMock.ts` when the same shape is reused across many tests; otherwise inline.

### 3. When the interface is required vs. optional

This position is explicit and falsifiable. SDET enforces it via the rejection criteria in § 6.

**Required (must extract an interface):**

- Any service-layer module that (a) calls a method on `db` (the `packages/db` request client), and (b) has at least one Vitest unit test in the same package that asserts behavior on that module's logic. Both conditions must hold. The interface is what the unit test mocks; without unit tests the interface has no caller.
- Any service-layer module that is added to a package whose existing modules already use the interface pattern for the same entity (consistency within a package).

**Optional (concrete-only is a legitimate steady state):**

- A repository whose only tests are Tier 2 integration tests. If service-layer logic for a feature is tested exclusively against the real DB (with `withClerkIdentity` from ADR-004 § Client shape), no interface is required. Concrete-only is allowed and shall not be rejected as "missing seam."
- A pure Prisma read used inside a route handler that contains no logic worth unit-testing (e.g., `db.service.findMany({ where: { active: true } })` for a public catalog list).
- An admin-pool migration, seed, or webhook handler. These run under `adminDb` (ADR-003 §7); their tests are integration-only by nature, so the interface gives no value.

**Forbidden (rejection criteria):**

- Wrapping the Prisma client in a `() => prisma` provider, a `Provider<PrismaClient>` factory, or any DI-container indirection (`InversifyJS`, `tsyringe`, `awilix`, etc.) for the purpose of "making it mockable." This is the journey-for-jasmine ADR-026 lesson translated to TypeScript: such wrappers smuggle the entire Prisma surface in through a different door, produce brittle tests, and do not establish a meaningful service-layer boundary. Extract an interface instead. TypeScript constructor injection is sufficient — no DI container.
- Speculative interfaces (an `I<Entity>Repository.ts` file added without a unit test in the same commit or already on the branch that mocks it). Interfaces that exist without callers rot.

### 4. Mocking discipline

Tier 1 tests mock the interface, not Prisma. Use Vitest primitives:

```ts
// apps/portal/src/lib/services/__tests__/engagement-service.test.ts
import { describe, it, expect, vi } from 'vitest';
import { createEngagement } from '../engagement-service';
import type { IEngagementRepository } from '@tax-portal/engagement/repositories/IEngagementRepository';

describe('createEngagement', () => {
  it('rejects an engagement when the client is on the declined list', async () => {
    const repo: IEngagementRepository = {
      findById: vi.fn(),
      findClientStatus: vi.fn().mockResolvedValue('DECLINED'),
      insert: vi.fn(),
      // ... other methods stubbed
    };

    await expect(createEngagement(repo, { clientId: 'abc' })).rejects.toThrow(/declined/);
    expect(repo.insert).not.toHaveBeenCalled();
  });
});
```

The mock surface is the interface — typically 4–10 methods per repository. When the interface changes (a method is added), every mock that references the interface fails to type-check until updated. This is a feature: the type system points at every test that needs to acknowledge the new behavior.

**Do not mock `PrismaClient` directly.** The schema-driven surface area is too large; the test ends up exercising Prisma's query DSL more than the service logic. Tools like `vitest-mock-extended` against `PrismaClient` are explicitly rejected for service-layer tests — see § Alternatives considered.

### 5. RLS interaction — the load-bearing safety distinction

**This is the safety claim of this ADR. Read it carefully.**

The interface mock does **not** exercise row-level security. It cannot. The mock is in-process TypeScript with no SQL Server engine behind it; there is no `SESSION_CONTEXT`, no `SECURITY POLICY`, no `FILTER PREDICATE`, no `BLOCK PREDICATE`. The mock returns whatever the test author told it to return.

This means: **a passing Tier 1 test suite tells you exactly nothing about whether RLS protects the data the service-layer code touches.** Row-level access is verified only by Tier 2 integration tests against a real SQL Server instance with the `db/policies/` layer applied (ADR-005 § 6 — every security policy carries a dedicated `<policy>.rls.test.ts` covering positive, negative, ACCOUNTANT, admin, and null-identity cases). Tier 2 is the only place RLS correctness is proved.

A developer reading their green Tier 1 dashboard must not conclude "all my mock tests pass, so RLS is fine." That inference is structurally incorrect. The correct inference is: "service-layer logic is correct on the assumptions encoded in the mock; RLS correctness for this code path lives in the corresponding `.rls.test.ts` and the real DB-backed integration tests." Both tiers are required for end-to-end confidence — neither is sufficient alone.

The ADR-003 `$extends` wrapper sits **below** this seam. The wrapper is not in the test path during Tier 1 — the mock substitutes for everything below the interface. The wrapper is in the test path during Tier 2 — the concrete `Prisma<Entity>Repository` calls `db`, which is wrapped, which sets `SESSION_CONTEXT`, which feeds the predicate functions. RLS only fires in Tier 2.

### 6. Two-tier pipeline relationship — anchored to TASK-LOE-001's CI workflow

The interface seam is the structural enabler of the two-tier split adopted in `chore/lights-out-enablement`:

| Tier | Where it runs | What it mocks | What it proves | What it does not prove |
|---|---|---|---|---|
| **Tier 1** (Vitest unit) | Any environment — Claude Cloud sandbox, local dev, the `lint-and-typecheck` job, the `test-portal` / `test-admin` jobs in `.github/workflows/ci.yml` (advisory until Epic 001 scaffolds apps; required afterwards) | The repository interface, with `vi.fn()` returns | Service-layer logic correctness on the assumptions encoded in mocks | RLS, `SESSION_CONTEXT` propagation, real Prisma query shapes, schema drift |
| **Tier 2** (Vitest integration) | CI only, in a job that depends on the SQL Server service container — today the same `test-portal` / `test-admin` jobs run integration tests when present; once Epic 001 scaffolds, this may split into a dedicated `integration-portal` / `integration-admin` job | Nothing — uses the real `db` client and real `db/policies/` | RLS enforcement, `SESSION_CONTEXT` round-trip, predicate behavior, real Prisma + SQL Server interaction | Cross-process behavior, browser-side flows (those are e2e via Playwright) |

The `test-portal` and `test-admin` jobs in `.github/workflows/ci.yml` (TASK-LOE-001) are the eventual home for Tier 1 once the apps are scaffolded. They are `continue-on-error: true` today because the apps don't exist yet; that flag flips off in Epic 001's CI hardening work. Tier 2 either runs in those same jobs (if integration tests live alongside unit tests in `apps/portal` / `apps/admin`) or splits to a dedicated job — the decision is deferred to Epic 001 based on actual run-time costs. **What does not change:** Tier 1 must not require the SQL Server service container; Tier 2 does. The interface seam is what makes that possible.

## Alternatives considered

### Mock the Prisma client directly (e.g., `vitest-mock-extended`)

Use `vitest-mock-extended`'s `mockDeep<PrismaClient>()` to produce a Prisma client mock and inject it into service code. The service code receives a mock that types-checks against `PrismaClient`. Rejected:

- **Surface area is the schema.** Every Prisma call (`db.engagement.findUnique`, `db.user.update`, `db.message.create`, ...) is part of the mock surface. Tests must stub the exact call shape (`mockReturnValueOnce` keyed by `findUnique` with `where: { id: 'x' }`) or rely on permissive defaults that mask bugs. A schema migration that renames a column or a relation breaks every test that touched it, even tests of unrelated logic.
- **Tests assert Prisma DSL, not service logic.** Common failure mode: a test passes because the mock returns the seed data the test author hand-stuffed, not because the service made the correct decision. The mock-shape is the test's actual subject, with service logic as a side effect.
- **Bypasses the seam this ADR establishes.** The whole point of the interface is to give the service layer a contract narrower than Prisma. Mocking Prisma reintroduces the wide surface and defeats the design.

### In-memory SQLite for Tier 1

Run a real Prisma client against an in-memory SQLite for unit tests, swapping `provider = "sqlserver"` for `provider = "sqlite"` in test mode. Rejected:

- **SQL Server-specific features don't translate.** RLS, `SESSION_CONTEXT`, `sp_set_session_context`, temporal tables, filtered indexes, `MERGE` — none have SQLite equivalents. Tests would be subtly different from production and would silently pass on different code paths.
- **`SCHEMABINDING = ON` security policies are non-portable.** ADR-005's enforcement hinges on SQL Server's policy engine. Replacing it with anything weaker for tests means Tier 1 lies about the security posture even when it's not trying to.
- **Schema-drift hazard.** Two providers means two `schema.prisma` builds; the maintenance cost compounds with every migration.

### No tier split — every test runs against the real DB

Skip Tier 1 entirely. Every test, including unit-shaped ones, runs against the SQL Server service container. Rejected:

- **Claude Cloud sandbox iteration breaks.** No Docker means no tests means no inner loop — agent feedback collapses to "wait for CI."
- **Test runtime balloons.** Unit-shaped assertions that should run in milliseconds run in seconds because of DB round-trips and per-test reset cost. Developer iteration degrades.
- **CI feedback loop is the only signal.** A regression in service logic surfaces minutes after push, not seconds after save.

### DI container with constructor-resolved Prisma

Adopt InversifyJS / tsyringe / awilix. Register the Prisma client in the container. Inject it into services. Test by registering a mock client. Rejected:

- **Hides the seam.** The container resolves dependencies at runtime; the call site stops naming what it depends on. The boundary the test mocks shifts from "this interface" to "whatever the container handed me," which is the same hidden-surface problem as mocking Prisma directly, with extra ceremony.
- **No upside on TypeScript.** Constructor injection is a language feature here, not a framework feature. Pass the interface, type-check it, done. A container is a tool for resolving dependency graphs across many modules; this codebase's repository graph is shallow.
- **Adds a non-trivial dependency.** DI containers carry their own learning curve, runtime cost, and bug surface. None of that earns a feature absent from plain TypeScript.

### Provider-function indirection (`() => prisma`, `Provider<PrismaClient>`)

Wrap the Prisma client in a function or factory and pass the factory into services so tests can substitute `() => mockPrisma`. Rejected for the same reasons as the DI container option, sharper: it is the explicit anti-pattern this ADR cites. The factory smuggles the full Prisma surface through a different door — the test still mocks Prisma, with extra plumbing. Extract an interface instead.

## Consequences

- **Tier 1 tests run in seconds without Docker.** Service-layer logic gets a fast inner loop on any host. Claude Cloud sandbox iteration is meaningful — agents can author and verify service logic without a SQL Server service container.
- **Tier 2 tests run in CI against the real DB.** RLS, `SESSION_CONTEXT`, predicate behavior, and policy enforcement are validated where they actually live (the engine), not approximated in process. The integration suite is the only place RLS correctness is proved — and ADR-005 § 6 already requires a `<policy>.rls.test.ts` per security policy, so Tier 2 is non-optional regardless of this ADR.
- **Service-layer code carries one extra constructor parameter** — the repository interface. The overhead is small (one parameter, one TypeScript type import) and pays for itself the first time the service is unit-tested.
- **File count in service-heavy packages roughly doubles.** Interface + concrete + mock fixture (where shared) + tests. Trade accepted: the testability and the Claude Cloud sandbox compatibility are worth the extra files. A package whose service modules are integration-tested only does not pay this cost.
- **Schema changes localize.** A column rename or relation reshape touches `Prisma<Entity>Repository.ts` (the concrete) and the integration tests. Service-layer code, unit tests, and downstream callers don't move unless the interface itself changes.
- **The seam is auditable in one place.** A search for `I[A-Z][a-zA-Z]*Repository` (the naming convention) returns the test-seam surface of the codebase. SDET review uses this to verify the rejection criteria below.
- **Mocks do not exercise RLS — and the documentation is explicit about that.** § 5 is the canonical reference. SDET enforces "Tier 1 mocks do not validate RLS" as a review-time reminder for any task that adds service-layer code touching RLS-scoped tables.
- **Concrete-only is a legitimate steady state for integration-tested code.** The ADR does not require interfaces speculatively. Repositories that are only integration-tested may stay concrete; the rejection criteria in the next section make this explicit.

## Rejection criteria — for SDET review

These bullets are phrased so TASK-LOE-006 § (e) can quote them directly into `agents/sdet.md` § Review Process. Each is in second-person imperative form and tied to a concrete observable in the diff.

- **Reject a new `I<Entity>Repository.ts` interface file if no test in the same commit (or already on the branch the task is built on) mocks it.** Speculative interfaces rot — require a caller in the same review.
- **Reject a service-layer unit test that uses a wrapped Prisma client (`() => prisma`, `Provider<PrismaClient>`, `mockDeep<PrismaClient>()`, a DI container resolving `PrismaClient`) when a simple interface would suffice.** Require interface extraction. The wrapper-style mock smuggles the whole Prisma surface; the interface is the seam this ADR establishes.
- **Reject a service-layer module that calls `db` directly and has unit tests asserting on its logic when no `I<Entity>Repository` interface separates the two.** The unit tests are mocking Prisma in some shape — make the seam explicit.
- **Accept an inline-to-separate-file interface extraction as part of a task that adds new mock tests for that repository.** This is the test-seam rule in action, not scope creep — do not bounce the task as "two changes in one commit."
- **Accept a repository that has no interface if its only tests are integration tests (Tier 2).** Concrete-only is a legitimate steady state. Do not require interfaces speculatively.
- **Reject any pull request whose service-layer change adds a Tier 1 test that asserts row-level access behavior.** RLS is a Tier 2 concern (ADR-005 § 6); a Tier 1 mock cannot validate it. Move the assertion to the corresponding `<policy>.rls.test.ts` or to an integration test that uses the real DB.

## Cross-references

- **ADR-003** — Identity propagation via `SESSION_CONTEXT`. The `$extends` wrapper this ADR sits **above** is defined there. The interface seam does not duplicate, replace, or weaken the wrapper; the wrapper remains the only path that sets `SESSION_CONTEXT` on a real connection. This ADR's load-bearing claim — that mocks do not exercise RLS — is a direct consequence of ADR-003 §5 (fail-closed null-identity semantics) and ADR-005 § 6 (integration tests are the only place RLS is proved).
- **ADR-004** — Prisma as sole ORM. The concrete `Prisma<Entity>Repository` calls the `db` client exported by `packages/db` (ADR-004 § Client shape). There is no second ORM and no client that bypasses the wrapper; the seam here lives one layer up from that.
- **ADR-005** — RLS via Security Policies. RLS is enforced at the engine, not the app, and is validated only by Tier 2 integration tests with the real `db/policies/` layer applied. Mocks do not — and cannot — exercise predicates. ADR-005 § 6's per-policy `.rls.test.ts` requirement is unaffected by this ADR; it remains the canonical RLS test obligation.
- **ADR-006** — Monorepo layout. Repository interfaces live under `packages/<feature>/src/repositories/` (domain-scoped) or `packages/db/src/repositories/` (cross-feature shared). The directory shape is consistent with the `packages/storage` port-and-adapter pattern (ADR-008) — one of several test-seam-style boundaries this codebase establishes for testability.
