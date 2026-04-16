# CLAUDE.md

This file provides project-specific guidance to Claude Code. For the reusable multi-agent workflow engine, see `.claude/agent-stack.md`. For individual agent instructions, see `agents/*.md`.

## Main Session Rules

Generic rules live in `.claude/agent-stack.md` § Main Session Rules. Project-specific additions:

- **"Application code" scope:** source files, Prisma schema, infrastructure config, Dockerfiles, GitHub workflows, and configuration. The main session may only modify: `CLAUDE.md`, `docs/tasks/`, `docs/architecture/`, `docs/decisions/`, `agents/*.md`, `.claude/`, and memory files.
- **Requirements exception:** the main session may append to `docs/requirements/observations.md` (user input capture, not requirements authoring). All other requirements changes go through the RA.
- **Initial intake:** `docs/requirements/intake.md` is the raw source document the user provided. The RA processes it into `docs/requirements/SRS.md` + epic files during its first invocation.

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

The workflow engine (`.claude/agent-stack.md`) defines generic roles. This section maps them to this project's tech stacks, directories, and role tags.

| Role Tag             | Agent Role           | Model      | Assigned Directories                                                          | Tech Stack                                                                 |
| -------------------- | -------------------- | ---------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `[sa]`               | System Architect     | Opus 4.6   | `CLAUDE.md`, `docs/tasks/`, `docs/architecture/`, `docs/decisions/`           | —                                                                          |
| `[ra]`               | Requirements Analyst | Sonnet 4.6 | `docs/requirements/`                                                          | —                                                                          |
| `[webapp-developer]` | Developer            | Sonnet 4.6 | `apps/web`, `packages/`, `prisma/`, `db/`                                     | Next.js 14 (App Router), TypeScript, Clerk, Prisma (sqlserver provider), SQL Server 2022, Tailwind, shadcn/ui, Playwright, Vitest |
| `[devops]`           | Developer            | Sonnet 4.6 | `infra/`, `.github/workflows/`, Dockerfiles, `docker-compose*.yml`            | OCI containers (multi-stage Dockerfile), GitHub Actions, Docker + Docker Compose (local dev). Production deploy platform deferred — see ADR-007. |
| `[sdet]`             | SDET / Validator     | Sonnet 4.6 | (reviews all directories)                                                     | —                                                                          |
| `[overwatch]`        | Overwatch            | Sonnet 4.6 | (reads all directories)                                                       | —                                                                          |

### Domain-specific notes

- **Web App Developer**: Two migration tracks per ADR-002 and ADR-006 — **Prisma track** (`prisma/schema.prisma` → `pnpm prisma migrate dev` locally, `pnpm prisma migrate deploy` in CI) for entity schema; **raw SQL track** (`db/migrations/NNNN-description.sql`) for things Prisma can't express (security policies, predicate functions, temporal tables, filtered indexes). Raw-SQL migrations are applied via `scripts/db-migrate.ts`. Security policies live in `db/policies/` as versioned raw SQL — per ADR-005. Every request-scoped DB query must go through the `packages/db` Prisma wrapper that sets `SESSION_CONTEXT` before the first real query (ADR-003). Direct Prisma access in route handlers outside that wrapper is a convention violation. E2E tests run against the full local stack (SQL Server container + Next.js + Azurite + Mailhog) and validate complete user workflows. Every UI app must include Playwright config, e2e test helpers, and an `e2e:run` script. The app is not considered scaffolded without e2e infrastructure.
- **DevOps**: When a task changes Dockerfile content, docker-compose service topology, secrets, environment variables, ingress wiring, or the admin/app DB principal split, **must update `docs/operations/inventory.md` and `docs/operations/runbook.md`**. Production platform is deferred (ADR-007) — but the capability contract the eventual host must satisfy is authoritative.
- **SDET**: For infrastructure tasks, **must verify `docs/operations/inventory.md` and `docs/operations/runbook.md` are consistent** with any environment, secret, or configuration changes — reject if stale. For RLS policy tasks, an integration test per policy ("CLIENT-A cannot read CLIENT-B's rows") is a hard requirement per ADR-005.

### SA-specific: E2e-required triggers

The SA sets `E2e-required: yes` on any task touching: auth flows (Clerk), SQL Server security policies or `SESSION_CONTEXT` propagation, file upload/download (signed URLs), Docuseal e-sign integration, email sending, SSE subscription streams, or cross-module boundaries (e.g. onboarding gate).

## Submission Gate Commands

These are the project-specific commands referenced by the generic submission gate in `.claude/agent-stack.md`.

> **Long-running command output capture:** When a developer or SDET agent runs a command that may produce several thousand lines of output (e.g. `pnpm ci:local`, `pnpm --filter web e2e:run`), **do not pipe through `| tail`** — pipe buffering can strand the final completion marker behind a blocked buffer. The correct pattern is: (1) run the command with `run_in_background: true` via the Bash tool, redirecting full output to a file (`>/tmp/<name>.log 2>&1`), and (2) use the **Monitor** tool to tail the file for specific completion markers. See § Tool Usage Notes below.

### Lint + type-check

```bash
pnpm lint
pnpm type-check
```

### Tests

```bash
pnpm --filter web test                               # Vitest unit/component tests
pnpm --filter web test -- src/path/to/file           # Single test file
```

### E2E

```bash
pnpm --filter web e2e:run                            # Full Playwright suite
pnpm --filter web e2e:run -- --grep '<feature>'      # Targeted e2e
```

### Full CI (epic completion)

```bash
pnpm ci:local      # lint → type-check → build → test
```

### Full E2E gate (RA epic validation)

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

When branch protection is enabled on `main`, the following should be required: `lint-and-typecheck`, `test-web`, `security-scan`. **E2E is NOT a per-PR required check** — e2e enforcement happens in the deploy-to-staging pipeline as a pre-deploy gate.

## Local Development Setup

```bash
cp .env.example .env.local            # Configure env vars (Clerk keys, SA_PASSWORD, AZURITE_CONN, Docuseal URL, etc.)
pnpm install                          # Install dependencies
pnpm prisma generate                  # Generate Prisma client
docker compose up -d                  # Start SQL Server, Azurite, Docuseal + its Postgres, mail catcher
pnpm db:migrate                       # Run Prisma migrations, then raw-SQL migrations (policies, predicates)
pnpm db:seed                          # Seed local dev data (optional)
pnpm dev:web                          # Next.js dev server (port 3000)
```

### Port assignments

| Service                        | Port  | Notes                                      |
| ------------------------------ | ----- | ------------------------------------------ |
| Web app (`apps/web`)           | 3000  | Next.js dev server                         |
| SQL Server 2022 (Developer)    | 1433  | `mcr.microsoft.com/mssql/server:2022-latest` |
| Azurite (Blob emulator)        | 10000 | Azure Blob API for local file storage      |
| Docuseal (self-hosted)         | 3005  | E-signature service — prototype-stage      |
| Docuseal's Postgres            | 5432  | Internal to Docuseal only; not our app DB  |
| Mail catcher (Mailhog/Inbucket)| 8025  | Web UI at http://localhost:8025            |

## Commands

### Development

```bash
pnpm dev:web                  # Next.js dev server
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

- `.claude/agent-stack.md` — multi-agent workflow engine (reusable rules all agents follow)
- `.claude/agent-phases.md` — SA-only phase lifecycle reference
- `agents/*.md` — individual agent role definitions (SA, RA, Developer, SDET, Overwatch, PD-*)
- `docs/architecture/C4.md` — living C4 architecture model; the SA updates this after each epic
- `docs/architecture/TENETS.md` — architectural tenets; read this before implementing anything
- `docs/requirements/intake.md` — raw requirements document (user-provided source material)
- `docs/requirements/SRS.md` — Software Requirements Specification (RA-owned, living document — produced from intake)
- `docs/requirements/ep-NNN-name.md` — epic-level requirements with acceptance criteria
- `docs/decisions/` — architecture decision records; consult before making structural choices

## Tool Usage Notes

- **Use `Monitor` for long-running tail/poll work** — CI run polling (`gh run watch` or a `gh run view --json conclusion` loop), Docker log tailing during e2e debugging (`docker compose logs -f | grep --line-buffered -E 'ERROR|FAIL'`), file-change watching (`inotifywait`), and Vercel deploy health polling. Do NOT use blocking foreground `Bash` calls or `sleep` loops for these — Monitor streams stdout lines as chat events so you keep working while notifications arrive. Use `Bash run_in_background` only for one-shot "wake me up when this one thing finishes" work. Always pipe through `grep --line-buffered` with a specific filter — raw tails will be auto-stopped for volume.
- **Use the `claude-code-guide` agent for authoritative Claude Code feature questions** — it has WebFetch against the official docs. Do not guess release dates or feature availability from memory.

### Agent status line file format (`.claude/agent-status.json`)

The 4th line of the Claude Code status bar is rendered by `~/.claude/statusline.sh`, which reads `.claude/agent-status.json` in the project root. **The file must be a multi-session dict keyed by session ID, with PID-based pruning.** Key rules:

- **Format is a dict, not a flat object.** Each top-level key is a session ID (the Claude Code process PID works as a session ID). Each value is a sub-dict with `pid`, `agent`, `model`, `goal`, `status`, `started` (ISO 8601). Writing the file as `{"agent": "...", "task": "..."}` (flat) makes the status line show `-- no agents active --` because the script iterates `sessions.items()` expecting sub-dicts and silently skips the flat format.
- **`status` must be the string `"active"`, not `"running"`.** The script filters on `info.get("status") != "active"`.
- **`pid` must point to a live process.** Use `$PPID` from a Bash subprocess to capture the `claude` process PID. Dead-PID entries are pruned automatically on every status-line refresh.
- **Always read-modify-write** to preserve other concurrent sessions' entries. Never overwrite the entire file with just your own session.
- **Update before AND after every Agent dispatch** — before to flip to `active` with the new agent/goal, after to flip back to `active` with `agent: "main"` and the main session's current goal, or to `idle` if the session is truly idle.

The file is gitignored — do not commit it.
