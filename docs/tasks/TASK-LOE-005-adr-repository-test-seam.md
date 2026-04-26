# TASK-LOE-005: ADR — Repository interface as test seam (Prisma + SQL Server adaptation)

**Epic**: chore/lights-out-enablement
**Status**: backlog
**Assigned to**: sa (Impl: sa)
**Updated-by**: sa
**Depends on**: none
**E2e-required**: no
**Started-at**: —
**Completed-at**: —
**Complexity-estimate**: —
**Complexity-actual**: —
**Affected flows:** none (justification: ADR documents an architectural pattern, not user-facing behavior)
**Affected requirements:** none (justification: ADR codifies a test-seam convention; SRS requirements are unaffected)
**Introduces-gate:** no
**Relevant ADRs:** ADR-003 (identity propagation via SESSION_CONTEXT), ADR-004 (Prisma single-track ORM), ADR-005 (RLS via security policies), ADR-006 (monorepo layout)

---

## Quality Gates

- [ ] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [N/A] **Submission gate** — N/A (ADR-only task; markdown formatting only)
- [N/A] **Targeted e2e** — N/A
- [ ] **Security review** — verify the ADR does not advocate any pattern that bypasses ADR-003's `SESSION_CONTEXT` wrapper or ADR-005's RLS enforcement
- [ ] **SDET Review** — approved (SA-implemented; SDET still reviews per `.claude/agent-phases.md` § SA Self-Implementation)

## SDET Review focus areas

- The ADR must adapt the journey-for-jasmine ADR-026 concept (.NET + Dapper, `IUserRepository` mocked via Moq) to tax-portal's stack: **Prisma + SQL Server + RLS, with the `SESSION_CONTEXT` wrapper from ADR-003 already mediating data access.** A blind port of the .NET ADR is a reject — the test-seam shape is different when the data layer is already wrapped.
- The ADR must reconcile with the existing dead pointer in `agents/sdet.md:69-73` ("ADR-026 enforcement" + ".NET task that touches `apps/*-api/*/Data/`"). That SDET text is currently stale; **TASK-LOE-006 § (e) updates the SDET text to point at this new ADR with adapted criteria.** This task creates the ADR home; task 6 makes the SDET text reference it correctly.
- The ADR must take a clear position on **when** an interface is required vs. optional. The j4j ADR's stance ("interfaces are a test seam, not an architectural guarantee") should be preserved but adapted: with Prisma's `$extends` wrapper already in `packages/db`, the test seam is at the **service-layer boundary**, not at every Prisma call. Verify this distinction is explicit.
- The ADR must take a clear position on the **two-tier test pipeline** the chore brief mentions: Tier 1 (mocked, fast, runs in any environment) vs. Tier 2 (real Prisma + SQL Server service container, runs in CI). The relationship between this ADR and TASK-LOE-001's CI workflow must be explicit.
- The ADR must enumerate the **rejection criteria** that SDET enforces — phrased so they map cleanly into the SDET review-process bullet that TASK-LOE-006 § (e) will write.

## Context

Decision #5 from the planning entry queues this ADR as a chore task. The chore brief frames it as:

> Port concept from journey-for-jasmine ADR-026 but adapted for the tax-portal stack (Prisma + SQL Server + RLS, not .NET + Dapper). Establishes the contract: data-access in service-layer code goes through `IUserRepository` / `IEngagementRepository` / etc. interfaces, mocked in Tier 1 unit tests, real Prisma in Tier 2 integration tests. Enables the two-tier test pipeline that makes Claude Cloud sandbox testing meaningful (Tier 1 runs without Docker; Tier 2 defers to GitHub Actions with the SQL Server service container).

There's also a stale reference in `agents/sdet.md:69-73` that already enforces "ADR-026 enforcement" with .NET-specific criteria — this was imported from the journey-for-jasmine port (round 2) and is currently a dead pointer because tax-portal has no ADR-026. This task creates the ADR; TASK-LOE-006 § (e) updates the SDET text.

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `docs/decisions/ADR-011-repository-interface-test-seam.md` | Create | sa |

## Tests to Write First

ADR is a documentation artifact — no automated tests. Verification is via:

- [ ] SA + SDET both read the ADR and confirm: it is internally consistent, it does not contradict ADR-003 / ADR-004 / ADR-005, and it can be referenced by `agents/sdet.md` § Review Process for clear reject decisions.

## Implementation Notes

### ADR number

Next available: **ADR-011**. Existing ADRs are 001–010 (verified by `ls docs/decisions/`).

### ADR structure (minimum sections)

1. **Title:** Repository interface as test seam
2. **Status:** Accepted, 2026-04-26
3. **Context:** What problem this solves — Claude Cloud sandboxes can't run Docker, so a Tier 1 / Tier 2 split is needed. Service-layer code that talks to the DB through a thin interface can be mocked at the boundary in Tier 1; the same interface's concrete impl uses Prisma in Tier 2.
4. **Decision:**
   - **Where the seam lives:** at the service-layer boundary (e.g., `packages/<feature>/src/services/`), not at every Prisma call. The Prisma `$extends` wrapper from ADR-003 + `packages/db` is the lower-level seam already; the interface seam is one layer up.
   - **Naming convention:** `I<Entity>Repository` (e.g., `IUserRepository`, `IEngagementRepository`, `IThreadRepository`). Interface in `packages/<feature>/src/repositories/` (or `packages/db/src/repositories/` if shared); concrete impl in `packages/<feature>/src/repositories/PrismaUserRepository.ts` (or equivalent).
   - **When the interface is required:** any service-layer module that reads or writes via Prisma and has unit tests must use the interface seam. Pure UI code, route handlers that delegate to the service layer, and integration tests do not need the interface.
   - **When the interface is optional:** a repository whose only tests are integration tests (Tier 2) may stay concrete. Concrete-only is a legitimate steady state — do not require interfaces speculatively.
   - **Mocking:** Tier 1 tests use Vitest's mocking primitives (`vi.fn()`, `vi.mock()`) against the interface. **No DI containers** (`InversifyJS`, `tsyringe`, etc.) — TypeScript constructor injection is sufficient. The journey-for-jasmine ADR-026 rejection of `IServiceProvider` / `Func<T>` smuggling translates: do not wrap a Prisma client in `() => prisma` to "make it mockable" — extract the interface instead.
   - **RLS interaction:** the concrete Prisma impl runs through the `SESSION_CONTEXT` wrapper from ADR-003. The interface mock does not exercise RLS — that's Tier 2's job. **This is the load-bearing safety distinction**: Tier 1 unit tests do not validate row-level access; only Tier 2 integration tests do, against the real `db/policies/` layer (ADR-005). Document this explicitly so a developer doesn't think "all my mock tests pass, RLS is fine."
5. **Consequences:**
   - Tier 1 tests run in seconds without Docker.
   - Tier 2 tests run in CI against the SQL Server service container from TASK-LOE-001.
   - Service-layer code carries one extra constructor parameter (the interface) — small overhead.
   - **Trade-off:** the interface boundary doubles the count of files in service-heavy packages (interface + concrete + mock + tests). Accept this cost for testability and Claude Cloud sandbox compatibility.
6. **Alternatives considered:**
   - **Mock Prisma client directly** (e.g., `vitest-mock-extended` against the `PrismaClient` type). Rejected: the mock surface is enormous; tests become brittle to Prisma schema changes; the test does not exercise the service-layer logic in isolation.
   - **In-memory SQLite for Tier 1.** Rejected: SQL Server-specific features (RLS, `SESSION_CONTEXT`, temporal tables) don't translate; tests would be subtly different from production behavior.
   - **No tier split — always test against real DB.** Rejected: precludes Claude Cloud sandbox iteration; CI feedback loop becomes the only way to learn a test failed.
7. **Rejection criteria** (for SDET review — these become the bullets TASK-LOE-006 § (e) writes into `agents/sdet.md`):
   - Reject a new `IXxxRepository.ts` interface file if no test in the same commit (or already on the branch) mocks it.
   - Reject a service-layer unit test that uses a wrapped Prisma client (`() => prisma`, `Provider<PrismaClient>`, etc.) when a simple interface would suffice. Require interface extraction.
   - Accept an inline-to-separate-file interface extraction as part of a task that adds new mock tests for that repository — this is the test-seam rule in action, not scope creep.
   - Accept a repository that has no interface if its only tests are integration tests (Tier 2). Concrete-only is a legitimate steady state.
8. **Cross-references:** ADR-003 (the wrapper this seam sits above), ADR-004 (Prisma is the only ORM), ADR-005 (RLS is enforced by the DB; mocks do not exercise RLS — a Tier 2 concern), ADR-006 (where the interface lives in the monorepo layout).

### Why `Impl: sa`

This is a 1-file ADR. Mechanical, no debugging. Per `.claude/agent-phases.md` § SA Self-Implementation: touches 1 file, obvious modification, no TDD iteration, not E2e-required. Within criteria.

### Why `Introduces-gate: no`

The ADR codifies a convention; the SDET review bullets that **enforce** the convention land in TASK-LOE-006 § (e). The ADR itself is documentation — no new gate. (TASK-LOE-006's gate disposition is also `no` for this specific bullet because the SDET text being updated already exists at lines 69-73 of `agents/sdet.md` — this task and task 6 give an existing dead pointer a real target, they don't add a new blocking step.)

## Definition of Done

- [ ] `docs/decisions/ADR-011-repository-interface-test-seam.md` exists with all 8 sections in § Implementation Notes
- [ ] ADR cross-references to ADR-003, ADR-004, ADR-005, ADR-006 are accurate
- [ ] ADR's "rejection criteria" section is phrased so TASK-LOE-006 § (e) can quote it directly into `agents/sdet.md`
- [ ] No conflict with existing ADRs (verified by SA reading the cross-references)

---

## Work Log

<!-- Format: - YYYY-MM-DD [role] What was done | What's next | Blockers -->

## Attempt Log

**Attempt count**: 0

## SDET Review

**Decision**: pending
**Notes**:
