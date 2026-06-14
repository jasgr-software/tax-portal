# CLAUDE.md

This file provides project-specific guidance to Claude Code. For the reusable multi-agent implementation engine, see `.implementation/ENGINE.md` (rules) and `.implementation/PHASES.md` (orchestrator phases). For individual agent instructions, see `.implementation/AGENT.md` (the Implementation Orchestrator) and `.implementation/agents/*.md`.

## Main Session Rules

Generic rules live in `.implementation/ENGINE.md` § Main Session Rules. Project-specific additions:

- **"Application code" scope:** source files, Prisma schema, infrastructure config, Dockerfiles, GitHub workflows, and configuration. The main session may only modify: `CLAUDE.md`, `.implementation/**` (engine, phases, agents, the task pipeline, operations), `.pr-review/**` (the standalone PR-review panel + fixer — main-session-owned tooling, not an upstream product layer), `.claude/`, and memory files.
- **Upstream layers are read-only here:** product requirements (`.requirements/`), system architecture (`.architecture/`), and delivery planning (`.planning/`) are owned by their own agents and are not edited as part of an implementation run. The implementation team reads them only when a build brief cites them.

## Product Vision

**Tax Accountant Client Portal.** A custom web portal for a solo tax accountant to engage clients for tax services, communicate throughout the process, and exchange files securely — replacing email as the primary client-facing channel. The accountant uses it as her daily work surface to track and manage all client engagements.

### Core features

- **Public front door**: Prospective clients browse services, submit engagement requests without creating an account
- **Accept/decline flow**: Accountant reviews requests and invites accepted clients
- **Onboarding gate**: Engagement letter (e-sign via Docuseal) → intake questionnaire → initial document upload
- **Engagement lifecycle**: New → In Progress → Review → Complete pipeline, manual transitions
- **Secure file exchange**: Folder-structured documents per engagement, 7-year retention, version history
- **Per-engagement messaging**: Plain-text threads with file attachments, unread indicators
- **Accountant dashboard**: Activity feed, needs-action items, client/engagement lists, admin UI
- **In-portal notifications**: Real-time (Supabase Realtime); email fallback is digest-only

### Users

- **Primary (one)**: The solo tax accountant — admin account, full visibility
- **Clients**: Invitation-only accounts, see only their own engagements
- **Prospective clients**: Anonymous public access to the services page and request form

### What this is not

Not a tax preparation, calculation, or filing tool. No IRS integrations, no payment processing, no scheduling/calendar.

### Platforms

- Web browser only (v1). No mobile app, no native clients.

## Agent Team — Project Configuration

The workflow engine (`.implementation/ENGINE.md`) defines generic roles. This section maps them to this project's tech stacks, directories, and role tags.

| Role Tag             | Agent Role           | Model      | Assigned Directories                                                          | Tech Stack                                                                 |
| -------------------- | -------------------- | ---------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `[io]`               | Implementation Orchestrator | Opus 4.6 | `.implementation/AGENT.md`, `.implementation/ENGINE.md`, `.implementation/PHASES.md`, `.implementation/tasks/` | —                                                  |
| `[webapp-developer]` | Developer            | Sonnet 4.6 | `apps/portal`, `apps/admin`, `packages/`, `prisma/`, `db/`                    | Next.js 14 (App Router), TypeScript, Clerk, Prisma (sqlserver provider), SQL Server 2022, Tailwind, shadcn/ui, Playwright, Vitest. Two front-ends: `apps/portal` (Client Portal — client-facing) and `apps/admin` (Tax Portal — accountant-facing). See ADR-006. |
| `[devops]`           | Developer            | Sonnet 4.6 | `infra/`, `.github/workflows/`, Dockerfiles, `docker-compose*.yml`            | OCI containers (multi-stage Dockerfile), GitHub Actions, Docker + Docker Compose (local dev). Production deploy platform deferred — see ADR-007. |
| `[sdet]`             | SDET / Validator     | Sonnet 4.6 | (reviews all directories)                                                     | —                                                                          |
| `[overwatch]`        | Overwatch            | Sonnet 4.6 | (reads all directories)                                                       | —                                                                          |

### Platform-frontend scope (portal + admin are two frontends of one platform)

`apps/portal` (Client Portal) and `apps/admin` (Tax Portal) are two frontends of one platform — see ADR-006. Audits, e2e sweeps, flake-isolation passes, mirror-file checks, and "does this pattern exist elsewhere" questions default to **both** `apps/portal/**` and `apps/admin/**`. Running a gate or audit against only one surface is insufficient unless the task spec scopes to a single surface by name. This applies to every role — webapp-developer implementation scope, SDET Validate + mirror-file audits, IO Plan briefs, and Overwatch reviews.

**Sunset trigger:** if 3 consecutive Close-prep retros pass with zero cross-surface-parity findings, Overwatch flags this rule for keep/remove review.

### Domain-specific notes

- **Web App Developer**: Two migration tracks per ADR-002 and ADR-006 — **Prisma track** (`prisma/schema.prisma` → `pnpm prisma migrate dev` locally, `pnpm prisma migrate deploy` in CI) for entity schema; **raw SQL track** (`db/migrations/NNNN-description.sql`) for things Prisma can't express (security policies, predicate functions, temporal tables, filtered indexes). Raw-SQL migrations are applied via `scripts/db-migrate.ts`. Security policies live in `db/policies/` as versioned raw SQL — per ADR-005. Every request-scoped DB query must go through the `packages/db` Prisma wrapper that sets `SESSION_CONTEXT` before the first real query (ADR-003). Direct Prisma access in route handlers outside that wrapper is a convention violation. E2E tests run against the full local stack (SQL Server container + Next.js + Azurite + Mailhog) and validate complete user workflows. Every UI app must include Playwright config, e2e test helpers, and an `e2e:run` script. The app is not considered scaffolded without e2e infrastructure.
- **DevOps**: When a task changes Dockerfile content, docker-compose service topology, secrets, environment variables, ingress wiring, or the admin/app DB principal split, **must update `.implementation/operations/inventory.md` and `.implementation/operations/runbook.md`**. Production platform is deferred (ADR-007) — but the capability contract the eventual host must satisfy is authoritative.
- **SDET**: For infrastructure tasks, **must verify `.implementation/operations/inventory.md` and `.implementation/operations/runbook.md` are consistent** with any environment, secret, or configuration changes — reject if stale. For RLS policy tasks, an integration test per policy ("CLIENT-A cannot read CLIENT-B's rows") is a hard requirement per ADR-005.

### IO-specific: E2e defaults (brief-overridable)

These are **project defaults** the IO applies when a build brief does not specify e2e expectations; a brief's `methodology.e2e` overrides them. By default the IO sets `E2e-required: yes` on any task touching: auth flows (Clerk), SQL Server security policies or `SESSION_CONTEXT` propagation, file upload/download (signed URLs), Docuseal e-sign integration, email sending, SSE subscription streams, or cross-module boundaries (e.g. onboarding gate).

## Submission Gate Commands

These are the project-specific commands referenced by the generic submission gate in `.implementation/ENGINE.md`.

> **Long-running command output capture:** When a developer or SDET agent runs a command that may produce several thousand lines of output (e.g. `pnpm ci:local`, `pnpm --filter web e2e:run`), **do not pipe through `| tail`** — pipe buffering can strand the final completion marker behind a blocked buffer. The correct pattern is: (1) run the command with `run_in_background: true` via the Bash tool, redirecting full output to a file (`>/tmp/<name>.log 2>&1`), and (2) use the **Monitor** tool to tail the file for specific completion markers. See § Tool Usage Notes below.

### Lint + type-check

```bash
pnpm lint
pnpm type-check
```

### Tests

```bash
pnpm --filter portal test                            # Client Portal Vitest unit/component tests
pnpm --filter admin test                             # Tax Portal Vitest unit/component tests
pnpm --filter portal test -- src/path/to/file        # Single test file (portal)
pnpm --filter admin test -- src/path/to/file         # Single test file (admin)
pnpm -r test                                         # All workspaces
```

### E2E

Per ADR-006, each app has its own Playwright config. E2E runs against the full docker-compose stack (both apps up).

```bash
pnpm --filter portal e2e:run                         # Portal Playwright suite
pnpm --filter admin e2e:run                          # Admin Playwright suite
pnpm --filter portal e2e:run -- --grep '<feature>'   # Targeted e2e (portal)
pnpm --filter admin e2e:run -- --grep '<feature>'    # Targeted e2e (admin)
pnpm e2e:cross-app                                   # Cross-app redirect + navigation specs (ADR-010)
```

### Executable gherkin tooling (brief-driven; tooling not yet chosen)

Gherkin is **not** an engine mandate — it applies only when a build brief sets `methodology.acceptance_format: gherkin` (canonically produced by `.planning/`). The Given/When/Then **acceptance scenarios themselves originate in `.planning/`** — authored inside the epic and surfaced into the brief's `acceptance_scenarios` (there is no `.feature` tree in `.planning/`). When a brief mandates the gherkin format, the SDET **binds** those scenarios into executable `.feature` files / step definitions as a validation artifact (see `.implementation/agents/sdet.md` § Acceptance Scenarios); when the brief does not, the scenarios remain the epic's prose behavior contract and the SDET validates against them directly. These are **intended to be executable** — bound to Playwright via Cucumber step definitions. The concrete tooling has not been chosen yet (candidates: `@cucumber/cucumber` with a Playwright fixture; `playwright-bdd`; or a custom binder) and is set up during the first slice that requires it.

**Current state — until the tooling lands:**

- `.feature` files are **human-readable specs**. SDET review compares implementation behavior against scenarios via prose — not machine-verified.
- Playwright e2e tests are written in standard `.spec.ts` form but must cover the behavior described by the brief's acceptance scenarios.
- When Cucumber tooling is integrated, this section will be updated with: the package choice, the step-definition directory convention, the dry-run command, and the CI run command.

**Provisional locations:** `.feature` files under `apps/<app>/e2e/features/`; step definitions under `apps/<app>/e2e/steps/<area>.steps.ts`.

### Full CI (epic completion)

```bash
pnpm ci:local      # lint → type-check → build → test
```

### Full E2E gate (SDET slice validation)

```bash
pnpm --filter web e2e:run
```

### Container smoke test (after Review phase)

Run by the SDET between Review and Validate. Must use Docker containers for the local stack — local dev is not valid.

```bash
scripts/smoke-test.sh                                # Automated smoke (if script exists)
# Manual fallback:
docker compose down -v && docker compose up -d
docker compose ps                                    # All services healthy, no Exit
curl -sf http://localhost:3000                       # Web app loads
pnpm --filter web e2e:run -- --grep 'smoke'          # Targeted smoke e2e (if smoke tests exist)
```

### Required CI checks (branch protection)

When branch protection is enabled on `main`, the following should be required: `lint-and-typecheck`, `test-portal`, `test-admin`, `security-scan`. **Note:** `test-portal` and `test-admin` are advisory (`continue-on-error: true`) until Epic 001 scaffolds `apps/portal` and `apps/admin`; branch protection day-one only enforces `lint-and-typecheck` and `security-scan` (see TASK-LOE-002 runbook). **E2E is NOT a per-PR required check** — e2e enforcement happens in the deploy-to-staging pipeline as a pre-deploy gate.

## Local Development Setup

```bash
cp .env.example .env.local            # Configure env vars (Clerk keys, SA_PASSWORD, AZURITE_CONN, Docuseal URL, PORTAL_APP_URL, ADMIN_APP_URL, etc.)
bash scripts/hooks/install.sh         # Install git hooks (pre-push gate check) — run once after cloning
pnpm install                          # Install dependencies
pnpm prisma generate                  # Generate Prisma client
docker compose up -d                  # Start SQL Server, Azurite, Docuseal + its Postgres, mail catcher
pnpm db:migrate                       # Run Prisma migrations, then raw-SQL migrations (policies, predicates)
pnpm db:seed                          # Seed local dev data (optional)
pnpm dev:portal                       # Client Portal dev server (port 3000)
pnpm dev:admin                        # Tax Portal dev server (port 3001) — run in separate terminal
```

### Port assignments

| Service                        | Port  | Notes                                      |
| ------------------------------ | ----- | ------------------------------------------ |
| Client Portal (`apps/portal`)  | 3000  | Next.js dev server — client-facing         |
| Tax Portal (`apps/admin`)      | 3001  | Next.js dev server — accountant-facing     |
| SQL Server 2022 (Developer)    | 1433  | `mcr.microsoft.com/mssql/server:2022-latest` |
| Azurite (Blob emulator)        | 10000 | Azure Blob API for local file storage      |
| Docuseal (self-hosted)         | 3005  | E-signature service — prototype-stage      |
| Docuseal's Postgres            | 5432  | Internal to Docuseal only; not our app DB  |
| Mail catcher (Mailhog/Inbucket)| 8025  | Web UI at http://localhost:8025            |

## Commands

### Development

```bash
pnpm dev:portal               # Client Portal dev server (port 3000)
pnpm dev:admin                # Tax Portal dev server (port 3001)
pnpm dev                      # Run both apps concurrently (pnpm-workspace concurrent)
pnpm prisma studio            # Prisma GUI (connects via admin principal — can see all rows, bypasses RLS)
docker compose up -d          # Local stack: SQL Server + Azurite + Docuseal + mail catcher
docker compose down           # Stop stack (keeps volumes)
docker compose down -v        # Stop + destroy volumes (wipes local DB — warn hook fires)
```

### Build / Lint / Test

See § Submission Gate Commands.

```bash
pnpm build                                   # Build all apps
pnpm test                                    # All tests across workspace
```

### Database

```bash
pnpm prisma migrate dev --name <name>        # Generate + apply Prisma migration (local) — entity schema only
pnpm prisma migrate deploy                   # Apply pending Prisma migrations (CI/prod)
pnpm prisma generate                         # Regenerate client
pnpm db:migrate                              # Apply Prisma migrations, then raw-SQL migrations (db/migrations/, db/policies/)
pnpm db:policies:apply                       # Re-apply security policies only (idempotent)
pnpm db:seed                                 # Seed local dev data
pnpm db:reset                                # Drop + recreate local DB, re-run all migrations + seed
```

## Key Documentation

- `.implementation/ENGINE.md` — multi-agent implementation engine (reusable rules all roster agents follow)
- `.implementation/PHASES.md` — IO-only phase lifecycle reference
- `.implementation/AGENT.md` — the Implementation Orchestrator (canonical entry role)
- `.implementation/agents/*.md` — roster role definitions (developer, SDET, Overwatch)
- `.implementation/README.md` — implementation layer overview + the build-brief input contract (`_templates/build-brief.md`)
- `.requirements/` — **standalone requirements layer** (the *what*): `REQ-*` with acceptance criteria; owned by `.requirements/AGENT.md`
- `.architecture/` — **standalone architecture layer** (the *how*): ADRs (`decisions/ADR-*`), the C4 model (`c4/`), and strategy docs; owned by `.architecture/AGENT.md`
- `.planning/` — **standalone, workflow-decoupled delivery-planning layer** (the "Product Owner"). Decomposes the requirement + architecture sources into a phased roadmap of vertically-sliced epics and tracks every acceptance criterion to sign-off. Owned by its own canonical agent, `.planning/AGENT.md` — read that to author/validate; it is self-contained and not wired into the implementation workflow. A `.planning/` epic is a canonical **producer of build briefs** for `.implementation/`. It also owns the **behavior contract**: user personas (`.planning/personas/`), targeted per-slice user flows (`.planning/flows/`, built out incrementally as epics are authored), and each epic's Given/When/Then **acceptance scenarios** (embedded in the epic — there is no standalone `.feature` tree). Key files: `.planning/ROADMAP.md` (phased plan), `.planning/COVERAGE.md` (per-AC acceptance ledger), `.planning/EPIC-NNN-*.md` (epics), `.planning/personas/` + `.planning/flows/` (behavior contract), `.planning/seed/sources.md` (declares the requirement/architecture sources — the only project-coupling point). Joins `.requirements/` (the *what*) and `.architecture/` (the *how*) as the third standalone layer (the *what-next-and-in-what-order*).
- `.pr-review/` — **standalone, workflow-decoupled PR-review layer**. A 3-lens advisory code-review panel — `reviewer-correctness` (LEAD), `reviewer-security`, `reviewer-over-engineering` — that independently reviews a GitHub PR's diff and posts **one consolidated advisory review** (`event=COMMENT`, so it never blocks merge or touches branch protection); plus a `pr-fixer` agent that reads the panel's comments and drives the PR to green in a bounded auto-loop. The PR is the artifact — it runs against any open PR by number and is not coupled to the `.implementation/` task pipeline. Main-session-owned tooling (it is the orchestrator — agents can't self-spawn). Key files: `.pr-review/AGENT.md` (panel orchestration), `.pr-review/ENGINE.md` (shared rules — finding schema, dedupe, advisory verdict, comment mechanics), `.pr-review/agents/*` (the 3 lenses + the fixer), `.pr-review/seed/sources.md` (the only project-coupling point). Run via `/pr-review <PR#>` and `/pr-fix <PR#>`. Models: reviewers Opus, fixer Sonnet. Complements (does not replace) the `/code-review` + `/security-review` skills and the `.implementation/` SDET review.

## Tool Usage Notes

- **Use `Monitor` for long-running tail/poll work** — CI run polling (`gh run watch` or a `gh run view --json conclusion` loop), Docker log tailing during e2e debugging (`docker compose logs -f | grep --line-buffered -E 'ERROR|FAIL'`), file-change watching (`inotifywait`), and Vercel deploy health polling. Do NOT use blocking foreground `Bash` calls or `sleep` loops for these — Monitor streams stdout lines as chat events so you keep working while notifications arrive. Use `Bash run_in_background` only for one-shot "wake me up when this one thing finishes" work. Always pipe through `grep --line-buffered` with a specific filter — raw tails will be auto-stopped for volume.
- **Use the `claude-code-guide` agent for authoritative Claude Code feature questions** — it has WebFetch against the official docs. Do not guess release dates or feature availability from memory.
- **Do not write to `.claude/agent-status.json`.** The file is not used by this project; no agent (main or sub) should create, update, or read it.
- **`/pr-review <PR#>` and `/pr-fix <PR#>`** invoke the standalone `.pr-review/` layer: `/pr-review` runs the 3-lens advisory panel and posts one consolidated PR review (`event=COMMENT`); `/pr-fix` runs the `pr-fixer` agent to address the panel's comments and drive the PR to green in a bounded auto-loop. Both are advisory — they never merge the PR or change branch protection. They complement, and do not replace, the `/code-review` + `/security-review` skills.
