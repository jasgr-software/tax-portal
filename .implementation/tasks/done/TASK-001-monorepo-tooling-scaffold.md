---
brief: BRIEF-001
status: done
assigned_to: devops
updated_by: devops
depends_on: none
impl: developer
e2e_required: no
started_at: 2026-06-15T10:48:38Z
completed_at: 2026-06-15T16:00:00Z
complexity_estimate: "2"
complexity_actual: "2"
brief_type: feature
brief_deploys: no
introduces_gate: no
acceptance_criteria: none (justification: build-pipeline/scaffold-only task — establishes the pnpm workspace, shared TS/ESLint/Prettier config, and `.env.example` that later tasks build on. No user-facing behavior; AC coverage lands in TASK-003/004/005.)
upstream_refs: ADR-006 (monorepo layout — pnpm workspaces, `packages/tsconfig`, `packages/eslint-config`, Node 20 LTS, pnpm ≥9), ADR-002 (`.env.example` carries the two-pool `DATABASE_URL_APP` / `DATABASE_URL_ADMIN` per ADR-003), ADR-003 (two DB principals → two connection URLs in env)
---

# TASK-001: Monorepo + tooling scaffold (pnpm workspaces, shared config, env)

---

## Quality Gates

- [x] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [x] **Submission gate** — lint + type-check + build + brief-mandated tests pass (commands in CLAUDE.md)
- [N/A] **Targeted e2e** — N/A (scaffold-only; no e2e behavior; this task only stands up the workspace)
- [x] **Security review** — `.env.example` carries placeholders only (no real secrets); `.gitignore` excludes `.env.local` / `.env*`
- [x] **SDET Review** — approved

## SDET Review focus areas

- Verify `.env.example` contains placeholders only — no real credentials (scan for credential patterns per ENGINE.md § Autonomy Ceiling item 2).
- Verify `pnpm-workspace.yaml` globs match the ADR-006 layout (`apps/*`, `packages/*`).
- Verify Node version pin (`.nvmrc` = 20) and pnpm ≥9 align with ADR-006.
- Verify the root `package.json` keeps the existing `gates:validate` script and adds the ADR-006 root scripts (`lint`, `type-check`, `build`, `dev:portal`, `test`) wired to the workspace — the CI workflow (`.github/workflows/ci.yml`) "wakes up" once `pnpm-lock.yaml` and these root scripts exist, so they must be real.

## Context

This is the first real build in the repo — the workspace does not yet exist. Per ADR-006 the portal is a pnpm-workspace monorepo. This task stands up the **foundation** that every later task in BRIEF-001 depends on: the workspace manifest, shared tsconfig/eslint/prettier, the Node/pnpm pins, and the `.env.example` whose variables (`DATABASE_URL_APP`, `DATABASE_URL_ADMIN`, `SA_PASSWORD`, `PORTAL_APP_URL`, etc.) ADR-002/003 require.

The CI workflow (`.github/workflows/ci.yml`) is already written to degrade gracefully pre-scaffold and to activate its real steps once `pnpm-lock.yaml` and root `lint`/`type-check` scripts are present (CICD.md). Do not modify `ci.yml` in this task — just make the scripts real so it activates.

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `pnpm-workspace.yaml` | Create | `packages:` globs `apps/*`, `packages/*` |
| `package.json` (root) | Modify | Keep `gates:validate`; add `lint`, `type-check`, `build`, `dev:portal`, `test`, `prisma` scripts wired to the workspace; set `packageManager`, `engines` |
| `.nvmrc` | Create | `20` |
| `.env.example` | Create | Placeholders: `DATABASE_URL_APP`, `DATABASE_URL_ADMIN`, `SA_PASSWORD`, `AZURITE_CONN`, `PORTAL_APP_URL`, `ADMIN_APP_URL` (+ any Docuseal/mail placeholders noted as reserved) |
| `.gitignore` | Modify (or create section) | Ensure `.env.local`, `.env*` (except `.env.example`), `node_modules`, `.next`, `e2e-results`, `*.tsbuildinfo` ignored |
| `packages/tsconfig/base.json` | Create | Shared strict TS base (ADR-006) |
| `packages/tsconfig/nextjs.json` | Create | Next.js TS base |
| `packages/tsconfig/package.json` | Create | `@tax-portal/tsconfig` |
| `packages/eslint-config/index.js` | Create | Shared ESLint config; reserve the import-boundary rule slot for ADR-003/004 (the concrete `requestDb`-import-boundary rule may be a TODO with a comment — TASK-003 wires the real rule) |
| `packages/eslint-config/package.json` | Create | `@tax-portal/eslint-config` |
| `tsconfig.json` (root) | Create | Composite project references |
| `.prettierrc` / prettier config | Create | Shared formatting |

## Implementation Notes

- Node 20 LTS, pnpm ≥9 (ADR-006 § Tooling choices).
- Root `build` script per ADR-006: build packages then `apps/portal` (admin not scaffolded in this slice — scope it to portal; leave a comment that admin joins in a later epic).
- `.env.example` is a **placeholder file** — never a real secret. `DATABASE_URL_APP` = the low-privilege request pool principal; `DATABASE_URL_ADMIN` = the elevated admin pool principal (ADR-003 §1). Both `sqlserver://` scheme.
- Do not author `docker-compose.yml` here — that is TASK-002. Do not author the Prisma schema or `packages/db` — that is TASK-003.
- The shared ESLint config's `requestDb` import-boundary rule (ADR-003 §6) is **scaffolded** here as a placeholder; TASK-003 implements it for real once `packages/db` exists.

## Definition of Done

- [x] `pnpm install` succeeds and writes `pnpm-lock.yaml`
- [x] `pnpm lint` and `pnpm type-check` run clean on the (still nearly empty) workspace
- [x] `pnpm build` runs clean (no-op-ish until apps land, but the script resolves)
- [x] `.env.example` present with placeholders; `.env.local` git-ignored
- [x] Lint + type-check + build pass

---

## Work Log

### 2026-06-15 [devops] Starting implementation — pnpm workspace manifest, shared tsconfig/eslint/prettier, .env.example, .gitignore hygiene, root scripts | What's next: create pnpm-workspace.yaml, update package.json, create packages/tsconfig, packages/eslint-config, root tsconfig.json, .prettierrc, .nvmrc, .env.example, update .gitignore, then run submission gate | Blockers: none

### 2026-06-15 [devops] Implementation complete — submission gate passed

**What was done:**
- Created `pnpm-workspace.yaml` with `apps/*` and `packages/*` globs per ADR-006
- Updated `package.json` (root): kept `gates:validate`, added `lint`, `type-check`, `build`, `dev:portal`, `dev:admin`, `dev`, `test`, `prisma` scripts; set `packageManager: pnpm@9.15.9` and `engines: {node: ">=20", pnpm: ">=9"}` per ADR-006
- Created `.nvmrc` with value `20` (Node 20 LTS pin)
- Created `.env.example` with all required placeholders per ADR-002/003: `DATABASE_URL_APP` (low-privilege request pool, sqlserver:// scheme), `DATABASE_URL_ADMIN` (elevated admin pool, sqlserver:// scheme), `SA_PASSWORD`, `AZURITE_CONN`, `PORTAL_APP_URL`, `ADMIN_APP_URL`, plus Clerk, Docuseal, and mail catcher placeholders — all PLACEHOLDER values, zero real secrets
- Updated `.gitignore`: added `.env*` catch-all with `!.env.example` negation, added `*.tsbuildinfo`, `e2e-results/`
- Created `packages/tsconfig/` (`package.json` as `@tax-portal/tsconfig`, `base.json` strict TS config, `nextjs.json` Next.js TS config)
- Created `packages/eslint-config/` (`package.json` as `@tax-portal/eslint-config`, `index.js` ESLint flat-config with ADR-003 import-boundary rule as a documented TODO for TASK-003)
- Created root `tsconfig.json` (composite project references, empty until packages/apps are added in TASK-003/004)
- Created `.prettierrc` (shared formatting: 100-char width, 2-space indent, double quotes, LF endings)
- Activated pnpm 9 via corepack (corepack prepare pnpm@9 --activate) since only pnpm 8 was present; pnpm 9.15.9 is now active

**Submission gate output:**
```
$ pnpm install
Scope: all 3 workspace projects
Packages: +107
Progress: resolved 107, reused 65, downloaded 42, added 107, done
Done in 4.4s using pnpm v9.15.9

$ pnpm lint
> pnpm -r --filter './packages/**' lint --if-present && pnpm -r --filter './apps/**' lint --if-present
Scope: 2 of 3 workspace projects
None of the selected packages has a "lint" script
No projects matched the filters in "/home/ccox/repos/tax-portal"
[exit 0]

$ pnpm type-check
> pnpm -r --filter './packages/**' type-check --if-present && pnpm -r --filter './apps/**' type-check --if-present
Scope: 2 of 3 workspace projects
None of the selected packages has a "type-check" script
No projects matched the filters in "/home/ccox/repos/tax-portal"
[exit 0]

$ pnpm build
> pnpm -r --filter './packages/**' build --if-present && pnpm --filter portal build --if-present
Scope: 2 of 3 workspace projects
None of the selected packages has a "build" script
No projects matched the filters in "/home/ccox/repos/tax-portal"
[exit 0]

$ git check-ignore -v .env.local
.gitignore:26:.env*  .env.local   [confirmed ignored]

$ git check-ignore -v .env.example
.gitignore:27:!.env.example  .env.example   [confirmed NOT ignored]
```

**Security review:**
- `.env.example`: all values are literal PLACEHOLDER strings — no real credentials, no API keys, no passwords
- `.gitignore`: `.env*` catch-all excludes all env files; `!.env.example` negation keeps it tracked; `*.tsbuildinfo` added; `e2e-results/` added

**What's next:** TASK-002 (docker-compose), TASK-003 (packages/db + Prisma schema), TASK-004 (apps/portal scaffold)

**Blockers:** none

### 2026-06-15 [sdet] APPROVED — TASK-001 review complete
All mandatory rejection checks passed: pre-impl Work Log entry present; Complexity-actual 2 (valid); Started-at + Complexity-estimate populated; all required spec fields present (AC: none with justification; Upstream refs: ADR-006/002/003; Introduces-gate: no); no tool-hygiene violations; submission gate evidence clean. Security review: .env.example confirmed placeholders-only; .gitignore excludes .env* with !.env.example exception. Upstream-ref compliance: pnpm-workspace.yaml globs match ADR-006 (apps/*, packages/*); Node 20 pin (.nvmrc=20); pnpm 9.15.9 ≥9. No AC coverage required (scaffold-only).

## Attempt Log

**Attempt count**: 0

## SDET Review

**Decision**: approved
**Notes**: Scaffold-only task; no user-facing AC. All checklist items verified. Submission gate evidence present (lint/type-check/build all clean; .env.local confirmed gitignored). No security issues found — .env.example carries literal PLACEHOLDER strings only.
