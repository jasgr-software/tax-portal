# ADR-012: Testing Pyramid for Lights-Out Development

**Status:** Accepted
**Date:** 2026-04-29
**Decision-makers:** chris.cox (project owner), SA
**Related:** ADR-002 (SQL Server), ADR-003 (Identity propagation via SESSION_CONTEXT), ADR-005 (RLS via Security Policies), ADR-006 (Monorepo layout — two front ends, packages, e2e split), ADR-007 (Container packaging — deploy platform deferred), ADR-011 (Repository interface as test seam)
**Living strategy:** This ADR is the rationale of record. The at-a-glance, continuously-updated posture lives in [`../strategy/TESTING.md`](../strategy/TESTING.md) (and [`../strategy/CICD.md`](../strategy/CICD.md) for the pipeline that realizes it).

## Context

This project runs lights-out: agents drive epics end-to-end with the user in the loop only for cost-bearing or rule-changing actions (`.claude/agent-stack.md` § Autonomy Ceiling). The promise the pipeline makes is **"if the gate is green, the code is safe to ship."** That promise rests on the gates being trustworthy without human verification — the SA cannot stand behind every test run, the SDET cannot manually re-execute every assertion, the user is not in the loop on routine PRs.

A trustworthy gate is a deterministic gate. That means the testing strategy itself has to be a contract: a single pyramid agents recognise, a single set of cadences, a single set of triggers that decide which tier applies to which task. Today there is no such contract — `CLAUDE.md § Submission Gate Commands` lists `pnpm lint`, `pnpm type-check`, per-app Vitest, and per-app Playwright as gate commands, and ADR-005 § 6 mandates a `.rls.test.ts` per security policy, but the layers are not consolidated. A developer agent reading the codebase cold sees test commands without a structure, and an SDET reviewing a task spec sees a `Definition of Done` checklist without a way to verify "did this task cover the right tiers?"

The sibling .NET project (journey-for-jasmine) hit the same shape and resolved it as a 9-tier pyramid:

1. Static analysis
2. Pure-logic unit
3. Service integration (real DB)
4. Contract (OpenAPI → generated client)
5. Frontend component
6. E2e happy-path (full stack)
7. Cross-browser presentation (mocked API, no Docker)
8. Nightly cross-browser × full stack matrix
9. Production observability

That pyramid is the right shape but two of its tiers do not port cleanly onto this stack:

- **Tier 4 (OpenAPI contract)** exists in the .NET project because the front end and the API are separate codebases on separate languages joined by an OpenAPI document. tax-portal is a TypeScript monorepo (ADR-006): server actions and route handlers in `apps/portal` and `apps/admin` consume Prisma-generated types and hand-typed function signatures across the workspace without a code-generation boundary. The compiler is the contract.
- **Tier 7 (cross-browser presentation, mocked API, no Docker)** exists in the .NET project because their stack startup is heavy enough that running every browser × full-stack combination on every PR is not feasible. Playwright with `--project=chromium,firefox,webkit` over a tagged `@presentation` spec set, run against the **same** docker-compose stack already up for tier 6, costs a few extra spec runs per PR — the heaviness that justified the .NET split is not present here.

Two related forces also shape the decision and must be encoded into the pyramid rather than left to convention:

- **The data layer is the trust boundary.** Tenet 7 (amended, 2026-04-16) and ADR-005 place row-level access at the database, not the app. The application's responsibility is `SESSION_CONTEXT` propagation (ADR-003 § 2). Any testing strategy that lets a tier 1 unit pass without exercising the propagation path through the real engine produces false confidence. ADR-005 § 6 already mandates a per-policy integration test suite; this ADR consolidates that into a tier and makes it required-on-PR.
- **Lights-out demands the pyramid grow with the code automatically.** A pyramid that exists as prose in this ADR but is not enforced at task spec, dispatch, review, and CI time will rot — agents will skip tiers when convenient and the SDET will not catch it because the SDET also reads prose. The five codification mechanisms in § Codification mechanisms exist to make the pyramid mechanically inseparable from the code.

This ADR is also a deliberate revision of one position currently in `CLAUDE.md`: that **"E2E is NOT a per-PR required check"**. That position is correct today (Epic 001 has not landed user flows; there is nothing meaningful to e2e on a PR), but it is not correct as a steady-state policy for lights-out. Once the first user flow lands, an e2e smoke subset on every PR is the cheapest way to prevent the worst class of regression — a cross-cutting flow break that lint + unit + integration cannot detect — from reaching `main`. The pyramid below distinguishes "smoke subset (PR)" from "full suite (deploy gate)" so the cost of running e2e on every PR is bounded.

## Decision

**Adopt the 9-tier testing pyramid below as the testing contract for the project.** Four deltas from the .NET source:

1. **Drop tier 4 (OpenAPI contract).** Not applicable to a TypeScript monorepo.
2. **Fold tier 7 (cross-browser presentation, mocked API) into tier 6b (cross-browser presentation, real stack).** The compose stack is already up for tier 6; running tagged `@presentation` specs across `--project=chromium,firefox,webkit` against the same stack is the lighter delivery vehicle on this stack.
3. **Promote tier 3 (service integration, real DB) to required-on-PR** as soon as one RLS policy exists. Per ADR-003 + ADR-005, the trust boundary is the database; integration is the only place row-level correctness is proved (see ADR-011 § 5 for the load-bearing safety claim that mocks do not exercise RLS). Tier 3 cannot be advisory in this codebase.
4. **Revise the current `CLAUDE.md` "E2E is NOT a per-PR required check" stance for the smoke subset.** Once the first user flow lands (post Epic 001 first feature epic), an e2e smoke subset (≤ ~5 minutes wall clock; tagged `@smoke` Playwright specs covering one happy path per app) becomes required-on-PR. The full suite remains a deploy gate, not a per-PR check.

The pyramid:

| Tier | Layer | Cadence | DB? | Required-on-PR? |
| --- | --- | --- | --- | --- |
| 1 | Static analysis (`pnpm lint`, `pnpm type-check`, security-scan) | PR | — | Yes (today) |
| 2 | Pure-logic unit (Vitest — validators, parsers, formatters, pure business rules) | PR | No | Yes (post Epic 001) |
| 3 | Service integration (Prisma + real SQL Server container, **including one test per RLS policy**) | PR | Yes | **Yes — security-critical** (per ADR-003 + ADR-005) |
| 4 | Contract (OpenAPI → generated TS) | — | — | **Dropped — not applicable.** TS end-to-end across the monorepo subsumes it |
| 5 | Frontend component (React Testing Library + Vitest, mocked server actions) | PR | No | Yes (post Epic 001) |
| 6 | E2e happy-path (Playwright, full docker-compose stack, Chromium) | PR (smoke subset) + deploy gate (full) | Yes | **Smoke subset yes**; full suite blocks deploy, not PR |
| 6b | E2e presentation matrix (Playwright, tagged specs × Chromium/Firefox/Webkit) | PR | Yes (same compose stack as tier 6) | Yes — folds the .NET project's tier 7 in |
| 8 | Nightly cross-browser × full stack matrix | Nightly | Yes | Defer until first deploy pipeline lands (post ADR-007) |
| 9 | Production observability (synthetic + error rates + alerts) | Continuous | — | Defer until staging/prod platform decided |

### Per-tier triggers

Each tier carries three sub-fields. The SA fills these into task specs (see § Codification mechanism 2); the SDET verifies them (§ Codification mechanisms 3 + 5). Promotion language follows `.claude/agent-stack.md` § Gate Authoring Rules — a tier moves from advisory to required only after a real-path green run with the three evidence items.

#### Tier 1 — Static analysis

- **Applicability:** every task that modifies any TypeScript, YAML, Bicep, Dockerfile, or shell script under a gated path.
- **Evidence:** `pnpm lint` + `pnpm type-check` green in the CI run linked in the task's Work Log; `lint-and-typecheck` job conclusion `SUCCESS` on the head commit. The `security-scan` job (npm audit / dependency review) is part of this tier today.
- **Promotion trigger:** already required-on-PR. No promotion needed.

#### Tier 2 — Pure-logic unit (Vitest)

- **Applicability:** every task that adds or modifies pure functions — validators, parsers, formatters, pure business-rule modules, repository-interface mocks per ADR-011 § 4. Excludes pure-Prisma reads inside route handlers per ADR-011 § 3 (concrete-only is legitimate).
- **Evidence:** Vitest run output in the Work Log naming the test file(s); CI job `test-portal` or `test-admin` green for the relevant app(s) per CLAUDE.md § Platform-frontend scope.
- **Promotion trigger:** advisory today (`continue-on-error: true` per CLAUDE.md). Promotes to required-on-PR when (a) Epic 001 scaffolds `apps/portal` and `apps/admin` with Vitest configs, **and** (b) at least one tier 2 test exists in each app. Branch protection's required checks gain `test-portal` + `test-admin` at that point.

#### Tier 3 — Service integration (Prisma + real SQL Server)

- **Applicability:** every task that (a) modifies anything under `db/policies/`, (b) modifies anything under `db/migrations/` that affects RLS-scoped tables, (c) modifies `prisma/schema.prisma` for an RLS-scoped table, (d) modifies the `packages/db` `$extends` wrapper or its `withClerkIdentity` helper, or (e) adds or modifies a service-layer module whose concrete `Prisma<Entity>Repository` implementation is exercised by integration tests per ADR-011 § 6.
- **Evidence:** integration test run output in the Work Log naming the spec file(s); for tasks that introduce a security policy, the `<policy>.policy.spec.ts` (or `.rls.test.ts` per ADR-005's existing naming — the file extension may converge during Epic 001) file path and a green run; for `SESSION_CONTEXT` propagation tasks, the regression test from ADR-003 § 4 (acquire connection, set spoof, release, reacquire, assert null).
- **Promotion trigger:** advisory until the first `db/policies/*.sql` lands (likely Epic 002 scaffolding policies established by ADR-005's "tables in scope for Epic 001" list). At the moment one policy exists with a passing `.policy.spec.ts`, tier 3 promotes to required-on-PR — branch protection's required checks gain the integration job(s). Per ADR-005 § 6, RLS correctness is **not** an advisory concern; the only reason this tier is not required-on-PR today is that there are no policies yet.

#### Tier 5 — Frontend component (React Testing Library + Vitest)

- **Applicability:** every task that adds or modifies a React component containing logic worth testing — conditional rendering driven by props, state-machine-shaped components, components that consume hooks with branching behaviour. Excludes pure-presentational primitives in `packages/ui` whose only logic is forwarding props.
- **Evidence:** Vitest run output in the Work Log naming the `*.test.tsx` file(s); same `test-portal` / `test-admin` job as tier 2.
- **Promotion trigger:** identical to tier 2. Once Epic 001 scaffolds the apps and at least one component test exists in each, tier 5 is required-on-PR via the same job.

#### Tier 6 — E2e happy-path (full stack, Chromium)

- **Applicability:** every task touching: auth flows (Clerk), `SESSION_CONTEXT` propagation, file upload/download (signed URLs per ADR-009), Docuseal e-sign integration, email sending, SSE subscription streams, or cross-module boundaries (e.g., onboarding gate). Mirrors CLAUDE.md § SA-specific E2e-required triggers — tier 6 applicability and `E2e-required: yes` are the same set.
- **Evidence (smoke subset, on PR):** Playwright run output in the Work Log naming the `@smoke`-tagged spec(s); CI job `e2e-smoke-portal` or `e2e-smoke-admin` green. Walltime budget for the smoke subset: ≤ 5 minutes wall clock.
- **Evidence (full suite, on deploy gate):** Playwright run output across both apps; the deploy pipeline's e2e job green. Today the deploy pipeline is deferred (ADR-007); the full-suite gate lands when the pipeline lands.
- **Promotion trigger:** smoke subset promotes to required-on-PR when (a) Epic 001 scaffolds Playwright configs for both apps per ADR-006, **and** (b) the first user flow exists with at least one `@smoke`-tagged spec in each app. The current `CLAUDE.md` "E2E is NOT a per-PR required check" line is amended at that point to read "the **full** e2e suite is not a per-PR required check; the `@smoke`-tagged subset is."

#### Tier 6b — E2e presentation matrix (Playwright × Chromium/Firefox/Webkit)

- **Applicability:** every task touching components that ship to the browser DOM — UI primitives in `packages/ui`, layout shells, components with browser-specific concerns (focus management, scroll containers, IME input, RTL, viewport-driven media queries). Tagged at the spec level with `@presentation`.
- **Evidence:** Playwright run output across `--project=chromium,firefox,webkit` for the tagged spec set; CI job `e2e-presentation` green.
- **Promotion trigger:** required-on-PR from the moment Epic 001 lands — it is cheap (specs are tagged from a subset of tier 6's spec inventory; the compose stack is already running for tier 6) and it is the most efficient way to keep cross-browser regressions out of `main` without a full nightly matrix. If `e2e-presentation` walltime ever exceeds 8 minutes wall clock on a typical PR, the tier moves to a deploy gate — the budget is the load-bearing constraint.

#### Tier 8 — Nightly cross-browser × full stack matrix

- **Applicability:** runs against the merged state of `main`, not against PRs. Exercises the full e2e suite across `chromium`, `firefox`, `webkit`, and (eventually) mobile viewports.
- **Evidence:** nightly workflow run output; failures open `BUG-XXX-NNN-nightly-<browser>.md` files automatically.
- **Promotion trigger:** **deferred until the first deploy pipeline lands.** ADR-007 defers the production platform; until a deploy pipeline exists, "nightly against `main`" is meaningful only as a regression catch — not enough on its own to justify the runner cost. Once the deploy pipeline lands and a staging environment exists, tier 8 wires up against the staging surface.

#### Tier 9 — Production observability

- **Applicability:** synthetic transactions hitting production endpoints, error-rate alerts, latency SLO tracking, RLS-policy-failure tracebacks. Continuous.
- **Evidence:** alerting dashboards, synthetic-run histories.
- **Promotion trigger:** **deferred until the production platform is decided** (post ADR-007 successor). The host-capability list in ADR-007 already requires per-app health probes; tier 9 is the layer above those, scoped to user-flow synthetic checks rather than process liveness.

## Codification mechanisms

A pyramid that lives only in this ADR file decays into prose nobody enforces. The five mechanisms below make the pyramid mechanically inseparable from the code agents write.

### Mechanism 1 — Per-tier triggers (specified above)

The Applicability / Evidence / Promotion-trigger sub-fields per tier in § Decision are the contract the SA writes into task specs and the SDET reads from them. Every active tier has all three filled in. Deferred tiers (8, 9) carry only a promotion trigger today; their Applicability and Evidence sub-fields land when the trigger fires.

### Mechanism 2 — Task spec template gains a `Tier coverage:` block

Extend `docs/tasks/_TEMPLATE.md` so every task spec the SA writes during Plan declares its tier coverage in a structured block, sibling to `Affected flows`, `Affected requirements`, and `E2e-required`. Format:

```
**Tier coverage:**
- Tier 2 (unit): authored — apps/portal/src/lib/foo.test.ts
- Tier 3 (integration): N/A — no DB surface
- Tier 5 (component): authored — apps/portal/src/components/Foo.test.tsx
- Tier 6 (e2e smoke): authored — apps/portal/e2e/foo-flow.spec.ts
```

Three values per tier are valid: **`authored`** (the named file path was created or modified by this task), **`N/A`** (this tier does not apply per its Applicability rule), or **`pending — backfill in TASK-XXX`** (deferred to a follow-up task; the SA must create the follow-up during Plan and reference it here, mirroring the hotfix-exception pattern in `.claude/agent-stack.md` § Task spec required fields).

The pattern mirrors existing `**Affected flows:**`, `**Affected requirements:**`, `**E2e-required:**`, and `**Introduces-gate:**` precedent. SDET treats a missing `**Tier coverage:**` block as a mandatory rejection — same treatment as a missing `**Affected flows:**` per agent-stack.md.

This ADR proposes the template change; the actual edit is a separate follow-up task.

### Mechanism 3 — Two new `scripts/validate-gates.sh` checks

`scripts/validate-gates.sh` is the project's independent backstop (`.claude/agent-stack.md` § Programmatic Gate Validation). Two new checks land:

- **`check_rls_policy_test_coverage`** — for every `db/policies/*.sql` file, assert that a matching `*.policy.spec.ts` (or `.rls.test.ts` per ADR-005's current naming) exists somewhere under `apps/*/test/integration/policies/` or `packages/db/test/integration/policies/`. Cross-surface scope per CLAUDE.md § Platform-frontend scope — the check looks under both `apps/portal/**` and `apps/admin/**` and accepts a match in either, plus the shared `packages/db/**` location. A policy file with no matching spec is a rejection.
- **`check_session_context_wrapper_usage`** — every `from '@prisma/client'` import or `prisma.` runtime reference outside `packages/db/**` is a violation per ADR-003 § 6 and ADR-004 § Client shape. The check is a grep — it is high-signal but imperfect (a legitimate string-literal containing `prisma.` in a comment or a test fixture would false-positive). The acceptance posture for this check is: prefer false positives the developer suppresses with a `// validate-gates: allow-prisma-grep — <reason>` comment over false negatives that let a wrapper bypass slip through. See § Consequences for the AST-promotion follow-up.

Both checks run in the pre-push hook (`scripts/hooks/install.sh`) and as a CI step. A failing check blocks the push and blocks the PR.

This ADR proposes the checks; the actual implementation is a separate follow-up task. Per `.claude/agent-stack.md` § Gate Authoring Rules, the task that adds either check is `**Introduces-gate:** yes` and must include run URL + named code path + counterfactual evidence. The counterfactuals are: for `check_rls_policy_test_coverage`, delete one `*.policy.spec.ts` and observe the check reds; for `check_session_context_wrapper_usage`, add `import { PrismaClient } from '@prisma/client'` to a route handler and observe the check reds.

### Mechanism 4 — CI job names mirror the pyramid 1:1

`.github/workflows/ci.yml` gains the following jobs, named to mirror the pyramid:

- `lint-and-typecheck` (tier 1) — exists today.
- `security-scan` (tier 1) — exists today.
- `test-portal` (tiers 2 + 5) — exists today, advisory.
- `test-admin` (tiers 2 + 5) — exists today, advisory.
- `integration-portal` (tier 3) — new.
- `integration-admin` (tier 3) — new.
- `e2e-smoke-portal` (tier 6 smoke subset) — new.
- `e2e-smoke-admin` (tier 6 smoke subset) — new.
- `e2e-presentation` (tier 6b) — new.

Branch protection's required-checks list grows with the promotion ladder (per `docs/operations/branch-protection.md`). Today: `lint-and-typecheck` + `security-scan`. Stage 2 adds `test-portal` + `test-admin` once Epic 001 scaffolds. Stage 3 adds `integration-portal` + `integration-admin` at the first RLS policy. Stage 4 adds `e2e-smoke-portal` + `e2e-smoke-admin` + `e2e-presentation` at the first user flow.

This ADR proposes the job split; the actual `ci.yml` change is a separate follow-up task. Each new required job is an `**Introduces-gate:** yes` task and triggers § Gate Authoring Rules evidence.

### Mechanism 5 — Generated coverage inventory

`scripts/build-coverage-inventory.ts` walks the codebase and emits `docs/operations/test-coverage-inventory.md` — a table mapping each surface to the tiers that cover it. Surfaces enumerated:

- Each `db/policies/*.sql` → tier 3 spec path.
- Each server action under `apps/*/src/app/**/*.action.ts` → tiers 2/3/6 covering it.
- Each user flow file under `docs/requirements/flows/flow-*.md` → tier 6 spec path(s) per ADR-006's two-config Playwright strategy.
- Each `Prisma<Entity>Repository` per ADR-011 § 2 → tier 2 mock test path + tier 3 integration test path.

The script runs in CI on `main` after every merge; the regenerated inventory is committed as part of the merge. SDET diff-checks this artifact during Validate — a surface that gained code but no tier coverage on the inventory is a Validate-gate failure.

This ADR proposes the script and artifact; the actual implementation lands at the third or fourth feature task per § Roll-out (early enough to be useful, late enough to walk a real codebase).

### The lights-out keystone — mechanism 2 + mechanism 3 together

Mechanisms 2 and 3 are individually useful and together are load-bearing. The task spec **declares** tier coverage (mechanism 2). `validate-gates.sh` **verifies** the declaration against the filesystem — every claimed file must exist; every RLS policy must have a matching spec; every Prisma reference must live in the wrapper (mechanism 3). The SDET review **rejects** on any drift between the two.

An agent cannot ship a task that lies about its own coverage because `validate-gates.sh` reads the same files the agent wrote. The declaration is truthful by construction or it is a hard rejection. This is the structural property that lets the pyramid grow with the code without human verification.

## Roll-out

The roll-out is tied to existing project milestones, not to abstract phase names. Each milestone fires a defined set of mechanism / tier transitions.

### Now (this ADR + immediate follow-up tasks)

- ADR drafted and accepted.
- `docs/tasks/_TEMPLATE.md` updated with the `Tier coverage:` block (mechanism 2). Separate small task; SA-implementable per `.claude/agent-stack.md` § SA Self-Implementation.
- `agents/sdet.md` updated to walk the `Tier coverage:` block during review and reject on missing/incorrect declarations. Separate small task; agents/sdet.md edits go through quad review per `.claude/agent-stack.md` § Main Session Rules.

### Epic 001 scaffolding scope

- Vitest configs per app — already in CLAUDE.md § Submission Gate Commands.
- Playwright configs per app — already in ADR-006 § Playwright strategy.
- Tier 3 integration harness: SQL Server container helper, `withClerkIdentity` helper per ADR-003 § Consequences (testing requires a seed helper), `<policy>.policy.spec.ts` template.
- `validate-gates.sh` checks 6 + 7 (`check_rls_policy_test_coverage`, `check_session_context_wrapper_usage`) — mechanism 3.
- `ci.yml` job split (mechanism 4): `integration-portal`, `integration-admin`, `e2e-smoke-portal`, `e2e-smoke-admin`, `e2e-presentation` jobs added (advisory or skipped until their content exists).
- Branch protection update: Stage 2 adds `test-portal` + `test-admin` to required checks per Mechanism 4's promotion ladder.

### First feature epic with RLS policies (likely Epic 002+)

- First real `*.policy.spec.ts` lands (likely the `User` policy per ADR-005's "tables in scope for Epic 001" list — that list may shift to Epic 002 once Epic 001 scope is finalised).
- Tier 3 promotes from advisory → required-on-PR. Promotion trigger from § Per-tier triggers fires: 1 policy exists with a passing spec.
- Branch protection update: Stage 3 adds `integration-portal` + `integration-admin` to required checks.
- The CLAUDE.md "E2E is NOT a per-PR required check" line is reviewed; if the first user flow lands in this epic, the line is amended per § Decision delta 4 and tiers 6 (smoke) + 6b promote.

### Third or fourth feature task

- `scripts/build-coverage-inventory.ts` lands (mechanism 5). The trigger is "we have walked the inventory by hand a couple of times, we know what shape it should take, the script writes itself." Earlier than this is speculative; later than this and the manual walks are wasted effort.
- `docs/operations/test-coverage-inventory.md` is regenerated on every merge to `main` thereafter.

### First deploy pipeline lands (post ADR-007 successor)

- Tier 6 full suite wires up as a pre-deploy gate (not a per-PR check; the smoke subset remains the per-PR gate).
- Tier 8 nightly matrix wires up against the staging surface.
- ADR-007's deferred decision is resolved in the successor ADR; this ADR's tier-8 promotion trigger fires.

### Production platform decided (post ADR-007 successor + production rollout)

- Tier 9 observability wires up. Synthetic transactions hit the production endpoints; error-rate and latency alerts route to the on-call channel; RLS-policy-failure tracebacks surface as their own signal.

## Consequences

### Positive

- **Deterministic gates.** Every tier has a defined Applicability rule and an Evidence requirement. The SA can mechanically determine which tiers a task touches; the SDET can mechanically verify the evidence; `validate-gates.sh` can mechanically verify the declaration matches the filesystem. The "if green, then safe to ship" promise becomes auditable.
- **No silent coverage drift.** Mechanism 2 + mechanism 3 together guarantee that an agent cannot ship code that adds a server action without tier 2/5/6 coverage, adds a security policy without tier 3 coverage, or imports `@prisma/client` outside the wrapper. The declaration is truthful by construction.
- **Cross-surface scoping is built in.** Tier coverage entries default to both `apps/portal/**` and `apps/admin/**` per CLAUDE.md § Platform-frontend scope. The `check_rls_policy_test_coverage` check accepts a match in either app or in `packages/db`, mirroring the existing scoping rule.
- **The pyramid is portable.** A new agent role (e.g., a future native-mobile developer) inherits the contract — tier coverage, applicability rules, and validation checks travel with the codebase rather than living in a role-specific document.
- **Lights-out actually works.** The user can leave the loop and trust the gate without re-reading prose. That is the property the project is built for.

### Negative

- **New `validate-gates.sh` checks add false-positive risk.** `check_rls_policy_test_coverage` is high-signal — a policy file naming convention plus a spec file naming convention is a deterministic 1:1 match — and is unlikely to false-positive. `check_session_context_wrapper_usage` is grep-based and is **deliberately imperfect**: a legitimate string-literal `prisma.` in a comment, a test fixture, or a doc-string can false-positive. The acceptance posture (§ Mechanism 3) is to suppress false positives via in-line annotation rather than weaken the check, but the friction is real. The follow-up that addresses this is an AST-based replacement for `check_session_context_wrapper_usage` once the friction is observable enough to justify the implementation cost — landed as a separate ADR amendment or its own ADR. Until then, the grep is the backstop.
- **Tier 6b on every PR adds e2e walltime.** Three browsers × the tagged spec set is meaningfully more than chromium-only. The 8-minute walltime budget in § Per-tier triggers for tier 6b is the constraint; if it is exceeded, the tier demotes to a deploy gate. The risk is that tier 6b silently grows over time as more specs get tagged `@presentation`; mechanism 5's coverage inventory surfaces the spec count per tier so the SDET can see the trend.
- **The SDET workload grows.** Reading `Tier coverage:` blocks, verifying file paths, checking declaration-vs-filesystem drift — all add to the per-task review effort. The mitigation is `validate-gates.sh` doing the mechanical work; SDET reads the script's output rather than walking the filesystem by hand. If validate-gates.sh is green, the SDET review of the tier coverage block is a quick read.
- **First-time setup cost on Epic 001.** The integration harness, the per-policy spec template, the CI job split, the validate-gates checks, the template change — all happen in roughly one window. That is a meaningful chunk of Epic 001 scaffolding work. The alternative is doing it incrementally, which spreads the cost but lets the pyramid be partially-applied for longer (riskier).

### Neutral

- **Forces an opinion on tier 8 / tier 9 deferral.** This ADR commits to "tier 8 lands when the deploy pipeline lands; tier 9 lands when the production platform is decided." Those triggers tie cleanly to ADR-007's deferred decisions. The team will revisit when the ADR-007 successor lands; either tier may also promote earlier if a specific incident makes the case (e.g., a cross-browser regression that nightly would have caught, before the first deploy pipeline exists).
- **The `CLAUDE.md` "E2E is NOT a per-PR required check" line is correct today and will be revised post Epic 001.** The revision is not a reversal — it is the promotion ladder firing at its trigger. The line is documented in § Decision delta 4 so future readers understand the planned amendment.

## Alternatives considered

### (a) Keep CLAUDE.md as the single source of truth for the testing strategy

Treat the `CLAUDE.md § Submission Gate Commands` section + the `agents/sdet.md` review focus as the only testing-strategy documents; do not author this ADR. **Rejected.** Three reasons:

- **Prose drifts.** CLAUDE.md is edited frequently; a testing strategy that lives in a section of CLAUDE.md decays with every unrelated edit. ADRs are the project's institutional memory by design — they are the right home for a strategic decision.
- **No enforcement layer.** CLAUDE.md describes commands; it does not describe **which** tier applies to **which** task. Without per-tier triggers and a validate-gates.sh backstop (mechanisms 1 + 3), agents do not have a mechanical way to know whether they have covered the right tiers. The pyramid is the structural decision; CLAUDE.md is the command reference.
- **The lights-out promise needs a decision document, not a how-to.** A new agent role joining the project should be able to read one document and understand the testing contract. CLAUDE.md is too long and too project-specific; an ADR is the right granularity.

### (b) Adopt the .NET sibling project's pyramid verbatim, including tier 4 (OpenAPI contract) and the tier 6 / tier 7 split

**Rejected.**

- **Tier 4 is not applicable.** TypeScript end-to-end across the monorepo subsumes contract testing (§ Decision delta 1). Adopting tier 4 verbatim would mean introducing an OpenAPI-generated boundary inside the monorepo solely to have something to contract-test, which inverts the design.
- **The tier 6 / tier 7 split is a .NET-specific cost optimisation.** Their stack startup is heavy enough that running `chromium × full stack + firefox × full stack + webkit × full stack` per PR is infeasible, so they isolate cross-browser checks to a mocked-API tier. tax-portal's compose stack is already up for tier 6; running tagged `@presentation` specs over `--project=chromium,firefox,webkit` against the same stack is cheap. Adopting their split would add a mocking layer that buys nothing on this stack.

The pyramid imported the **shape** (1, 2, 3, 4, 5, 6, 7, 8, 9 concept) and adapted the **content** to this stack. That is the correct port.

### (c) Defer the entire ADR until Epic 001's scaffolding task forces the issue

Wait until a developer agent first asks "where do my tests go?" during Epic 001 scaffolding; let the answer crystallise into an ADR at that point. **Rejected.**

- **Lights-out needs the contract before agents start generating tests.** The structural failure mode is: Epic 001's first task lands tests in some shape; subsequent tasks copy the shape; by the time the SA notices the shape is wrong, the codebase has drift. Authoring the pyramid before Epic 001 starts means the first test landed is on the right tier with the right naming and the right CI job.
- **The five codification mechanisms need to be in the task template before the first task uses the template.** Mechanism 2's `Tier coverage:` block has to exist before the SA writes the first task spec for Epic 001 scaffolding; otherwise the first task is itself non-conformant.
- **ADR-005 § 6 already mandates per-policy integration tests** — the absence of a consolidated pyramid was already creating ambiguity (where does that test live? what tier is it? when does it run? what gate catches a missing one?). Authoring the pyramid resolves the ambiguity rather than letting it accumulate.

### (d) Adopt a smaller pyramid (collapse tiers 6 + 6b; collapse tiers 2 + 5 by treating component tests as units)

Move to a 5-tier pyramid: static / unit (incl. component) / integration / e2e (one level) / observability. **Rejected.**

- **Tier 5 vs tier 2 distinction is load-bearing.** Component tests run the React tree and exercise hook-state interaction; pure-logic units do not. Conflating them would let a unit-test author pass a "component test" by exporting a pure function out of a `.tsx` file — losing the structural signal that the component layer is exercised.
- **Tier 6 vs tier 6b distinction is the cross-browser signal.** A single e2e tier would either always run all three browsers (expensive, walltime budget violations) or always run only chromium (cross-browser regressions slip through). The split is the right granularity.
- **Future tiers 8 + 9 attach cleanly to the bigger pyramid.** Collapsing now would mean re-expanding when the deploy pipeline lands, which is strictly worse than authoring the right shape up front.

### (e) Defer all gate codification (mechanisms 2–5) to Epic 001 scaffolding; ship this ADR with only the pyramid table

Author the strategic decision now, leave the enforcement mechanisms to be designed during Epic 001. **Rejected.**

- **The pyramid without enforcement is prose.** The lights-out promise rests on mechanical enforcement, not on agents reading and following an ADR. Splitting the strategic content from the enforcement content lets the strategic content land first and the enforcement slip — which is the failure mode this ADR exists to prevent.
- **The codification mechanisms are short and concrete.** The five mechanisms together are ~1.5 ADR sections; deferring them does not save meaningful authorship effort and does cost meaningful clarity.

The codification mechanisms are part of the decision, not an addendum.

## Related ADRs

- **ADR-002** — SQL Server as primary datastore. The integration tier (tier 3) runs against the same SQL Server 2022 Developer container that ADR-002 specifies for local dev. Track A (Prisma migrations) and Track B (raw SQL — `db/policies/`) both apply before integration tests run.
- **ADR-003** — Identity propagation via `SESSION_CONTEXT`. The `$extends` wrapper this ADR describes is exercised in tier 3, including the connection-pool reset regression test from ADR-003 § 4. Tier 3's Applicability rule names the wrapper as a covered surface.
- **ADR-005** — RLS via Security Policies. Tier 3's per-policy integration test obligation (`<policy>.policy.spec.ts` covering positive, negative, ACCOUNTANT, admin, and null-identity cases) is ADR-005 § 6's existing requirement, consolidated into the pyramid and enforced by `check_rls_policy_test_coverage`.
- **ADR-006** — Monorepo layout, two front ends. The pyramid scopes cross-surface per CLAUDE.md § Platform-frontend scope: tiers 2/3/5/6/6b coverage entries default to both `apps/portal/**` and `apps/admin/**`. ADR-006's two-Playwright-config strategy is the substrate for tiers 6 and 6b.
- **ADR-007** — Container packaging, deploy platform deferred. Tier 8 (nightly matrix) and tier 9 (production observability) are gated on ADR-007's successor — they cannot land before a staging surface and a production surface exist.
- **ADR-011** — Repository interface as test seam. Tier 2's Applicability rule for repository interfaces points at ADR-011 § 4's Vitest mocking discipline. Tier 3's Applicability rule for concrete `Prisma<Entity>Repository` modules points at ADR-011 § 6's two-tier pipeline relationship. ADR-011 § 5's load-bearing safety claim — that Tier 1 mocks do not exercise RLS — is the reason tier 3 is required-on-PR rather than substituted by tier 2.
