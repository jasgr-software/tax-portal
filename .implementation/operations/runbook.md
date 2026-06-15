# Operations Runbook — tax-portal local dev stack

**Owner:** devops
**Last updated:** TASK-006 (BRIEF-001)
**Companion:** `.implementation/operations/inventory.md`

This runbook covers the day-to-day operational procedures for the local development stack.
Any change to compose services, ports, env vars, volumes, or principal configuration MUST update
both this file and `inventory.md` in the same commit (CLAUDE.md § DevOps domain-specific notes).

---

## Prerequisites

1. Docker Desktop (or Docker Engine + Compose plugin) installed and running.
2. `pnpm` ≥ 9 installed (`npm install -g pnpm`).
3. `.env.local` created from `.env.example` with all required variables set (see § Environment Setup).
4. Git hooks installed: `bash scripts/hooks/install.sh` (run once after cloning).

## Environment Setup (TASK-006 — complete DB URL contract)

Copy `.env.example` to `.env.local` and fill in the values. The critical variables:

```
# Host-side SQL Server port (docker-compose maps this to container port 1433)
SQLSERVER_PORT=14330

# Request pool — taxportal_app login (app_user_role member), subject to RLS
DATABASE_URL=sqlserver://localhost;port=14330;database=taxportal;user=taxportal_app;password=YOUR_APP_PASSWORD;trustServerCertificate=true

# Admin pool — taxportal_admin login (app_admin_role member), RLS-exempt
DATABASE_URL_ADMIN=sqlserver://localhost;port=14330;database=taxportal;user=taxportal_admin;password=YOUR_ADMIN_PASSWORD;trustServerCertificate=true

SA_PASSWORD=YOUR_SA_PASSWORD
```

**URL form:** `sqlserver://HOST;port=PORT;database=DB;user=USER;password=PASS;trustServerCertificate=true`

**Port note:** The host-side port is `14330` (set by `SQLSERVER_PORT`). Scripts (`db:migrate`, `db:seed`),
the dev server, and the host-side Playwright fixture all connect via `localhost:14330`. Only services
inside docker-compose (e.g. the portal container) use the internal service name `sqlserver` on port `1433`.

**Seed/migrate principal:** `pnpm db:migrate` and `pnpm db:seed` run under `DATABASE_URL_ADMIN`
(`taxportal_admin` login, `app_admin_role` member). Do NOT use `sa` — the Service table has an RLS
BLOCK predicate that blocks `sa` (which is not a member of `app_admin_role`). Running `db:seed` as
`sa` will produce a blocked-by-security-policy error. The `taxportal_admin` login is created by
`pnpm db:migrate` on first run (Track B migration).

---

## Bring-up

### First time

```bash
cp .env.example .env.local          # Fill in SA_PASSWORD and Clerk keys
bash scripts/hooks/install.sh       # Install pre-push gate hook (once)
pnpm install                        # Install workspace dependencies
docker compose up -d                # Start SQL Server, Azurite, Mailhog
pnpm db:migrate                     # Run Track A (Prisma) + Track B (raw SQL)
pnpm db:seed                        # Optional: seed dev data
```

### Subsequent starts

```bash
docker compose up -d                # Start containers (volumes persist)
```

### Verify health

```bash
docker compose ps                   # All services should show "healthy" or "running"
```

Expected output (data-plane + portal app service, post-TASK-004):
```
NAME                      IMAGE                                         STATUS          PORTS
tax-portal-azurite        mcr.microsoft.com/azure-storage/azurite      Up (healthy)    0.0.0.0:10000->10000/tcp
tax-portal-mailhog        mailhog/mailhog                               Up (healthy)    0.0.0.0:1025->1025/tcp, 0.0.0.0:8025->8025/tcp
tax-portal-portal         apps/portal/Dockerfile                        Up (healthy)    0.0.0.0:3000->3000/tcp
tax-portal-sqlserver      mcr.microsoft.com/mssql/server:2022-latest    Up (healthy)    0.0.0.0:1433->1433/tcp
```

---

## Tear-down

### Stop (keep volumes — DB data preserved)

```bash
docker compose down                 # Stop containers, volumes intact
```

### Stop + destroy volumes (DESTRUCTIVE — wipes local DB)

> **WARNING: this wipes all local database data and blob storage.** Confirm before running.
> The pre-push git hook fires a warning on `docker compose down -v`.

```bash
docker compose down -v              # Stop + destroy all named volumes
```

After a volume wipe, re-run migrations and seed:
```bash
docker compose up -d
pnpm db:migrate
pnpm db:seed                        # if desired
```

---

## Database Migrations

Two migration tracks (ADR-002). Both run via `pnpm db:migrate`.

### Standard migrate (Track A → Track B)

```bash
pnpm db:migrate
```

This:
1. Runs `prisma migrate deploy` (Track A — Prisma schema migrations)
2. Runs raw SQL files in order: `db/migrations/NNNN-*.sql` then `db/policies/NNNN-*.sql` (Track B)
3. Records applied Track B filenames in `dbo.__db_migrations` (idempotent — already-applied files skipped)

### Re-apply policies only (idempotent)

```bash
pnpm db:policies:apply
```

This runs Track B only. Useful when iterating on a security policy without a full migration cycle.

### Reset (full wipe + remigrate)

```bash
pnpm db:reset
```

This:
1. Runs `docker compose down -v && docker compose up -d` (wipes volumes, restarts containers)
2. Waits for SQL Server to be healthy
3. Runs `pnpm db:migrate` (full Track A + B)

> **DESTRUCTIVE** — use only in local dev. Do not run against shared or staging environments.

### Seed dev data

```bash
pnpm db:seed
```

Runs the dev-only seed scripts in `db/seed/`. No-ops if the seed directory is empty.

---

## App Dev Servers (outside containers)

For fast iteration during development, run the apps directly with hot reload:

```bash
pnpm dev:portal                     # Client Portal on http://localhost:3000
pnpm dev:admin                      # Tax Portal on http://localhost:3001
pnpm dev                            # Both apps concurrently
```

The containers (SQL Server, Azurite, Mailhog) must be running for the app to connect.

---

## Prisma Studio

Prisma Studio connects via the **admin pool** (`DATABASE_URL_ADMIN`) and bypasses RLS — it shows all
rows for all tenants. Use only for local dev inspection.

```bash
pnpm prisma studio
```

---

## Mail Catcher

All outbound email from the local dev stack is caught by Mailhog.

- **Web UI:** http://localhost:8025
- **SMTP:** localhost:1025

No email actually reaches the internet in local dev.

---

## Smoke Test

The smoke harness (`scripts/smoke-test.sh`) brings up the full stack and probes health endpoints.

```bash
bash scripts/smoke-test.sh                    # Full smoke (data-plane + app health probes)
bash scripts/smoke-test.sh --data-plane-only  # Data-plane only (no app probes)
```

The smoke script is used by the SDET between Review and Validate phases. It runs in container mode
against the actual Docker images — not the dev servers.

---

## Database Principal Management

Two principals are used (ADR-002 / ADR-003). See `inventory.md` for the full split.

### Principal summary (post-TASK-003)

TASK-003's RLS migration creates two SQL logins:

- `taxportal_admin` — member of `app_admin_role`, RLS-exempt. Used by `DATABASE_URL_ADMIN`.
  All admin operations: `pnpm db:migrate`, `pnpm db:seed`, cron, webhooks, anonymous write path.
- `taxportal_app` — member of `app_user_role`, subject to RLS. Used by `DATABASE_URL`.
  All request-scoped Prisma queries via the lazy `db` client.

**Do NOT use `sa` for seeds or application operations.** The Service RLS BLOCK predicate is ON
for `sa`. Set `DATABASE_URL_ADMIN` to `taxportal_admin` credentials (not `sa`).

### TASK-002 interim state (historical — superseded)

Prior to TASK-003, both URL vars pointed at `sa`. That interim state is retired — TASK-003 delivered
the `taxportal_admin` / `taxportal_app` logins. Update `.env.local` if you still have `sa` credentials
in `DATABASE_URL_ADMIN`.

### Note on anonymous write (request-form insert)

The public engagement-request form (front door — TASK-004) is the one sanctioned anonymous-write
path. It inserts via the **admin pool** under a tightly-scoped stored procedure call, not the
request pool. The admin pool has an explicit RLS exemption (ADR-005). No other anonymous write paths
exist. TASK-005 adds e2e specs covering this path but does not deliver the Server Action itself.
This is documented here for ops awareness per the task spec's note.

---

## Troubleshooting

### SQL Server does not become healthy

1. Check the container logs: `docker compose logs sqlserver`
2. Verify `SA_PASSWORD` meets SQL Server complexity requirements (≥8 chars, upper + lower + digit + symbol).
3. Verify the image pulled correctly: `docker image ls | grep mssql`
4. Give it more time — SQL Server 2022 Developer can take 60–90 seconds on first start.

### Migration fails with "Login failed"

1. Ensure the container is healthy: `docker compose ps`
2. Check `DATABASE_URL_ADMIN` in `.env.local` — password must match `SA_PASSWORD`.
3. Ensure `trustServerCertificate=true` is in the connection string (required for local dev).

### Azurite connection string error

Azurite uses a well-known dev account. The default connection string in `.env.example` is correct
for Azurite started with `docker compose up -d`. Do not change the `AccountName` or `AccountKey`.

### Port already in use

If `docker compose up -d` fails with "port already in use":

```bash
docker compose ps        # Check if a stale container is running
docker compose down      # Stop all containers cleanly
lsof -i :1433            # Check what's using the SQL Server port
```

---

## CI Environment

In CI (GitHub Actions), the compose stack is spun up by the SDET's container-smoke gate. The
workflow uses the same `docker-compose.yml`. No separate CI-only compose file exists.

Required secrets in CI (set in GitHub → Settings → Secrets):
- `SA_PASSWORD` — SQL Server SA password (must match the compose value used in CI)
- `DATABASE_URL_ADMIN` — Admin pool connection string for migrations

See `.github/workflows/` for the CI job definitions (added in the CI workflow task).

**CodeQL advisory (no GHAS license):** The `security-scan` job's CodeQL steps carry `continue-on-error: true`
because GHAS is not licensed on this private org repo. The `pnpm audit --audit-level=high` step is the
enforced hard gate. Remove `continue-on-error` from both CodeQL steps once GHAS is enabled.

---

## Adding a New Service

When adding a new compose service:

1. Add the service to `docker-compose.yml` with a healthcheck and named volume (if needed).
2. Update `inventory.md` — services table, ports table, env vars table, volumes table.
3. Update this runbook — bring-up/tear-down sections if the new service changes the sequence.
4. Update `.env.example` with any new required variables.
5. Update CLAUDE.md § Port assignments if a new port is introduced.
