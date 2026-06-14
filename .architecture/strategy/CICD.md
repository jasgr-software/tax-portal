# CI/CD Strategy

> **Living document.** The authoritative *current* CI/CD posture. The executable source of truth is
> `.github/workflows/ci.yml`; the branch-protection state lives in `.implementation/operations/branch-protection.md`
> (GitHub repo config cannot live in the repo). This file is the at-a-glance strategy that ties them to
> the testing pyramid (`strategy/TESTING.md`) and the merge-autonomy rules. Update the amendment history
> when jobs or required checks change.

## Status / amendment history

- **2026-06-13** — Extracted into `.architecture/strategy/` as the living CI/CD surface.
- **2026-04-28** — Stage 1 branch protection applied (`lint-and-typecheck` + `security-scan` required);
  PR-merge promoted to autonomous-on-green (`.implementation/ENGINE.md` § Autonomy Ceiling item 3).

## Summary

CI runs on every push and PR via GitHub Actions. A small, **staged** set of required status checks backs
the lights-out merge model: a PR auto-merges only when its required checks are green
(`.implementation/ENGINE.md` § Autonomy Ceiling item 3). Required checks grow in stages as the apps and
tests land — the pipeline is never allowed to mark advisory jobs as "required."

## Pipeline — `.github/workflows/ci.yml`

| Job | Tier(s) | What it gates | Status |
|---|---|---|---|
| `lint-and-typecheck` | 1 | `pnpm lint`, `pnpm type-check`, `scripts/validate-gates.sh` | **Required (Stage 1)** |
| `security-scan` | 1 | `pnpm audit --audit-level=high` + CodeQL (when JS/TS present) | **Required (Stage 1)** |
| `test-portal` | 2, 5 | `pnpm --filter portal test` against a SQL Server 2022 service container | Advisory (`continue-on-error: true`) until Epic 001 |
| `test-admin` | 2, 5 | `pnpm --filter admin test` against a SQL Server 2022 service container | Advisory (`continue-on-error: true`) until Epic 001 |
| `report-failure` | — | Auto-opens a `ci-failure` issue when `main` CI reds | Operational (push to `main` only) |

Jobs degrade gracefully pre-scaffold: install/lint/type-check/test steps skip when `pnpm-lock.yaml` or
the relevant `package.json` scripts are absent, so CI stays green on the pre-app repo.

Planned jobs (land with the code per `strategy/TESTING.md`): integration (tier 3, required-on-PR once the
first RLS policy exists), `e2e-smoke-portal` / `e2e-smoke-admin` (tier 6 smoke subset), `e2e-presentation`
(tier 6b), and a nightly matrix (tier 8) once a deploy pipeline exists.

## Branch protection (staged)

Authoritative operator runbook: `.implementation/operations/branch-protection.md`.

- **Stage 1 (active):** required checks = `lint-and-typecheck`, `security-scan`. `strict: true`,
  `enforce_admins: true`, `required_conversation_resolution: true`, no force-push, no deletion.
- **Stage 2 (post Epic 001 close-prep):** add `test-portal` + `test-admin` to required **after** their
  `continue-on-error: true` is removed and real tests pass — never before (a required-but-soft check
  enforces nothing).
- **Stages 3–4 (deferred):** integration and e2e gates promote to required as their tiers do.

## Merge autonomy

PR-merge is autonomous-on-green with conditions (`.implementation/ENGINE.md` § Autonomy Ceiling item 3):
(a) green required CI, (b) ≥1 required check reported (fail-closed), (c) workflow-file PRs —
`.implementation/ENGINE.md`, `.implementation/PHASES.md`, `.implementation/agents/*.md` — need an explicit user `LGTM`,
(d) epic-closing PRs need the pre-merge epic gates (5–8) recorded in PROGRESS.md. `scripts/validate-gates.sh`
is the independent backstop. Deploy pipeline is deferred (ADR-007).

## Governing decisions

- **ADR-012** — the testing pyramid the CI jobs realize; defines which tier is required-on-PR when.
- **ADR-007** — container packaging, deploy-platform-agnostic; the deploy half of CD is deferred to the
  eventual host (which must satisfy the ADR-007 capability contract).
- **ADR-006** — two front ends → per-app test/e2e jobs (`test-portal` / `test-admin`, and per-app
  Playwright).

## Current vs. planned

- **Live today:** push/PR CI with two required checks; staged branch protection; autonomous merge-on-green.
- **Deferred:** the deploy-to-staging pipeline (and its pre-deploy full-e2e gate), tier-8 nightly, and
  tier-9 production observability — all gated on the ADR-007 production-platform decision.
