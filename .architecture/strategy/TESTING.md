# Testing Strategy

> **Living document.** The authoritative *current* testing posture. The rationale of record is
> **ADR-012 (Testing Pyramid for Lights-Out Development)** — read it for the full argument; this file is
> the at-a-glance contract and is updated in place as tiers promote. Update the amendment history below
> whenever a tier's required-on-PR status changes.

## Status / amendment history

- **2026-06-13** — Extracted into `.architecture/strategy/` from ADR-012 as the living strategy surface.
  No posture change; ADR-012 remains the decision of record.
- **2026-04-29** — Pyramid adopted (ADR-012).

## Summary

Testing is a **contract, not a convention**: a single pyramid every agent recognizes, with per-tier
**applicability / evidence / promotion** triggers the SA writes into task specs and the SDET verifies.
The single load-bearing principle: **the database is the trust boundary** (TENET-007, ADR-003, ADR-005),
so the integration tier that exercises row-level security through the real engine cannot be advisory.

## The pyramid

| Tier | Layer | Cadence | DB? | Required-on-PR? |
|---|---|---|---|---|
| 1 | Static analysis (`pnpm lint`, `pnpm type-check`, security-scan) | PR | — | **Yes (today)** |
| 2 | Pure-logic unit (Vitest — validators, parsers, formatters, pure rules) | PR | No | Yes (post Epic 001) |
| 3 | Service integration (Prisma + real SQL Server, **one test per RLS policy**) | PR | Yes | **Yes — security-critical** (ADR-003 + ADR-005) |
| 4 | Contract (OpenAPI → generated client) | — | — | **Dropped** — TS monorepo; the compiler is the contract |
| 5 | Frontend component (React Testing Library + Vitest) | PR | No | Yes (post Epic 001) |
| 6 | E2e happy-path (Playwright, full docker-compose stack, Chromium) | PR (smoke subset) + deploy gate (full) | Yes | Smoke subset yes; full suite gates deploy, not PR |
| 6b | E2e presentation matrix (Playwright × Chromium/Firefox/Webkit) | PR | Yes | Yes (from Epic 001) |
| 8 | Nightly cross-browser × full-stack matrix | Nightly | Yes | Deferred until a deploy pipeline lands (ADR-007) |
| 9 | Production observability (synthetic + error rates + alerts) | Continuous | — | Deferred until the production platform is decided |

Each active tier carries **Applicability / Evidence / Promotion-trigger** sub-fields — see ADR-012
§ Per-tier triggers for the full text. Promotion from advisory→required follows
`.claude/agent-stack.md` § Gate Authoring Rules (real-path green run + named code path + counterfactual).

## Codification (how the pyramid stays inseparable from the code)

ADR-012 § Codification mechanisms defines five mechanisms; the load-bearing ones in force today:
- **Task-spec `Tier coverage:` block** — `docs/tasks/_TEMPLATE.md` requires every task to declare which
  tiers it covers (authored / N/A-with-reason), sibling to `Affected flows` / `E2e-required`.
- **`scripts/validate-gates.sh`** — the independent backstop that checks task-file/PR gate completion.
- **CI job naming** — tier↔job mapping (see `strategy/CICD.md`): tiers 1 → `lint-and-typecheck` +
  `security-scan`; tiers 2/5 → `test-portal` / `test-admin`; tiers 3/6/6b → integration + e2e jobs
  (land as the apps and policies land).
- **SDET review** — verifies declared tier coverage against the diff and the gherkin/flow contract.

## Governing decisions

- **ADR-012** — the pyramid itself (this strategy's rationale of record).
- **ADR-003 / ADR-005 / TENET-007** — the trust boundary, which forces tier 3 to required-on-PR.
- **ADR-011** — repository interface as the test seam (enables tier-2 mocking; concrete repos exercised
  by tier 3).
- **ADR-006** — two front ends + per-app Playwright configs; coverage spans `apps/portal` **and**
  `apps/admin` (CLAUDE.md § Platform-frontend scope).
- **ADR-007** — deploy platform deferred, which defers tiers 8–9.

## Current vs. planned

- **Live today:** tier 1 required-on-PR; tiers 2/5/3/6/6b authored as code lands, advisory until their
  promotion triggers fire (apps scaffolded in Epic 001; first RLS policy for tier 3; first user flow +
  `@smoke` spec for tier 6).
- **Amends a current CLAUDE.md stance:** "E2E is NOT a per-PR required check" holds only until the first
  user flow lands; thereafter the `@smoke`-tagged subset becomes required-on-PR (the full suite remains a
  deploy gate). See ADR-012 § Decision item 4.
- **Deferred:** tier 8 (nightly) until a deploy pipeline exists; tier 9 (observability) until the
  production platform is decided (ADR-007 successor).
