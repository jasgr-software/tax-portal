# Operations Runbook — tax-portal local dev stack

**Owner:** devops
**Last updated:** EPIC-018 close-out (corrected `ENABLE_DIGEST_TRIGGER` documented default `true → false` to match the PR #106 `/pr-fix` compose hardening `${ENABLE_DIGEST_TRIGGER:-false}`). Prior: TASK-018-007 (documented ENABLE_DIGEST_TRIGGER digest-trigger seam: purpose, local/e2e usage, and production-fail-closed requirement — TASK-018-003 / DECISION-018-003-C)
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
inside docker-compose (e.g. the portal and admin containers) use the internal service name `sqlserver` on port `1433`.

**Admin app container DB URLs (added TASK-004-001):** The admin container (`tax-portal-admin`, port 3001)
requires its own container-side DB URL vars, distinct from the host-side `DATABASE_URL` / `DATABASE_URL_ADMIN`:

```
# Admin container DB URLs (container-internal — use sqlserver:1433, not localhost:14330)
ADMIN_DATABASE_URL_ADMIN=sqlserver://sqlserver;port=1433;database=tax_portal;user=taxportal_admin;password=YOUR_ADMIN_PASSWORD;trustServerCertificate=true
ADMIN_DATABASE_URL=sqlserver://sqlserver;port=1433;database=tax_portal;user=taxportal_app;password=YOUR_APP_PASSWORD;trustServerCertificate=true
```

**Cross-app URL wiring (ADR-010):** The admin container accepts `PORTAL_APP_URL` and `ADMIN_APP_URL`
for cross-app redirect logic. These default to `http://localhost:3000` and `http://localhost:3001`
in the compose file. Override in `.env.local` if ports differ.

**Mock-auth opt-in (BUG-002-001 fix — `ALLOW_MOCK_AUTH`):** Both the `portal` and `admin` compose
services require `ALLOW_MOCK_AUTH=true` when `AUTH_PROVIDER=mock` (the local/e2e default). The
fail-closed guard in `packages/auth` keys on this flag (not `NODE_ENV`) because `NODE_ENV=production`
is always true for any prod-built container image, including the sanctioned e2e/local container.
The compose file defaults `ALLOW_MOCK_AUTH` to `true` via `${ALLOW_MOCK_AUTH:-true}` for both
services — no `.env.local` entry is needed for local dev.

**NEVER set `ALLOW_MOCK_AUTH=true` in a real production deployment.** A real deploy sets
`AUTH_PROVIDER=clerk` and leaves `ALLOW_MOCK_AUTH` unset. Without the flag, any request that
hits the mock/unset auth path throws at process startup → fail closed (F1/F6 intent preserved).

**Mock e-sign opt-in (TASK-005-002 — `ALLOW_MOCK_ESIGN`):** The `portal` compose service requires
`ALLOW_MOCK_ESIGN=true` when `ESIGN_PROVIDER=mock` (the local/e2e default). The fail-closed guard
in `packages/esign` (DECISION-E / ADR-023 §4) keys on this flag (not `NODE_ENV`) — same pattern
as `ALLOW_MOCK_AUTH`. The compose file defaults both to `mock`/`true` for the portal service.
**NEVER set `ALLOW_MOCK_ESIGN=true` in a real production deployment.** A real deploy sets
`ESIGN_PROVIDER=docuseal` and leaves `ALLOW_MOCK_ESIGN` unset → fail closed. Setting
`ESIGN_PROVIDER=docuseal` alongside `ALLOW_MOCK_ESIGN=true` is a contradiction → throws.

Note: `ESIGN_PROVIDER` and `ALLOW_MOCK_ESIGN` are wired only on the **portal** service (the
client-facing onboarding surface). The **admin** service does not invoke e-sign directly and does
not carry these vars yet. Add them to admin when admin-surface e-sign is introduced.

**Mock file scanner opt-in (TASK-013-003 — `ALLOW_MOCK_SCANNER`):** Both `portal` and `admin` compose services require `ALLOW_MOCK_SCANNER=true` when `FILE_SCANNER=mock` (the local/e2e default). The fail-closed guard in `packages/scanner` (ADR-021) keys on this flag — same pattern as `ALLOW_MOCK_AUTH`. The compose file defaults both to `mock`/`true` for both services. **NEVER set `ALLOW_MOCK_SCANNER=true` in a real production deployment.**

**Digest-trigger seam opt-in (TASK-018-003 / BRIEF-018 — `ENABLE_DIGEST_TRIGGER`):** The `apps/admin` route `POST /api/dev/dispatch-digest` is a dev/test-only seam that invokes `dispatchDailyDigest()` synchronously so e2e tests can drive the full digest-delivery flow without a real scheduler. The compose `admin` service defaults this to `"false"` via `${ENABLE_DIGEST_TRIGGER:-false}` (hardened from the original `:-true` in PR #106 `/pr-fix`); set `ENABLE_DIGEST_TRIGGER=true` explicitly (e.g. in `.env.local`) to enable the seam for an e2e run that exercises the digest trigger. **NEVER set `ENABLE_DIGEST_TRIGGER=true` in a real production deployment.** When the flag is absent (or `false`), the route returns 404 (fail-closed by guard). Even if accidentally set in production, the route additionally requires an authenticated accountant session (TASK-018-008) — two independent fail-closed layers (defense-in-depth). <!-- CS-GEN-003 // ADR-023 // ADR-025 // DECISION-018-003-C -->

Production digest scheduling is deferred (ADR-023 / ADR-025, deploy-time). When a real scheduler is wired, this seam will remain available as a test-only override behind both guards.

> **Note:** `ENABLE_DIGEST_TRIGGER` is scoped to the **admin service only** in `docker-compose.yml`. The portal service does not carry this variable — the digest-dispatch endpoint lives exclusively on the admin (accountant-facing) surface. This scoping was added by TASK-018-003 (webapp-developer) and is devops-owned in place per DECISION-018-003-C.

**`BLOB_PUBLIC_ENDPOINT` (TASK-013-003 — BUG-008-001 admin fix):** Both the `portal` and `admin` compose services set `BLOB_PUBLIC_ENDPOINT` to `http://localhost:10000` so the client browser can PUT bytes directly to Azurite using the host-accessible URL (the server generates SAS URLs with the Docker-internal `azurite:10000` hostname; the browser cannot resolve `azurite`). Leave unset in production.

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

Expected output (data-plane + portal + admin app services, post-TASK-004-001):
```
NAME                      IMAGE                                         STATUS          PORTS
tax-portal-admin          apps/admin/Dockerfile                         Up (healthy)    0.0.0.0:3001->3001/tcp
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

### Audit ledger migration (TASK-004-010 — ADR-019)

`db/migrations/0002-create-audit-ledger.sql` creates the `dbo.AuditEvent` append-only ledger table.
`db/policies/0003-audit-event-policy.sql` creates the `sec.pol_AuditEvent` RLS policy (accountant/admin only).

Both are applied automatically by `pnpm db:migrate`. No manual step required beyond running the standard migrate command.

**Tamper-evidence note:** The `AuditEvent` table uses `LEDGER = ON (APPEND_ONLY = ON)` (SQL Server 2022).
Rows are cryptographically verifiable via:
```sql
EXEC sys.sp_verify_database_ledger;
```
This procedure checks the Merkle-tree hash chain and reports any tampered rows.

**Retention note (ADR-019 §5 — DEFERRED):** The `AuditEvent` table must be retained ≥7 years.
When the purge job (ADR-018) is implemented, it must EXPLICITLY EXCLUDE `dbo.AuditEvent`.
Do not create any cleanup or sweep logic that touches this table until the purge-exclusion
gate is formally implemented. See inventory.md § Audit Ledger Table for details.

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

## Object Storage (FileStorage port — packages/storage — ADR-008)

Added in TASK-007-001. The `packages/storage` package ships the `FileStorage` port and two adapters:
- **`AzuriteAdapter`** — targets Azurite via `@azure/storage-blob` (the only module allowed to import that SDK).
- **`MemoryAdapter`** — in-process `Map<string,Buffer>`; unit tests only; NOT a runtime target.

### Env-driven selector (fail-closed boot)

`STORAGE_ADAPTER` is read at process startup by `getStorage()` in `packages/storage/src/select.ts`:

| Value | Behaviour |
|-------|-----------|
| `azurite` | `AzuriteAdapter` — local dev + CI default |
| `memory` | `MemoryAdapter` — test-only; runtime use is a misconfiguration |
| `cloud` | **THROWS at startup** — no production adapter in this build (Phase-5 slot, ADR-008) |
| unset / unknown | **THROWS at startup** — explicit value required |

There is no silent fallback. A misconfigured `STORAGE_ADAPTER` is caught at process start, not at first file operation.

### Local dev bring-up

Azurite is included in the compose stack and is available from day one:

```bash
docker compose up -d azurite   # Starts Azurite only
docker compose up -d           # Starts full stack (Azurite + sqlserver + mailhog + portal + admin)
```

The `AzuriteAdapter` calls `createIfNotExists()` before each operation — no manual bucket/container creation is needed. The default container is `tax-portal-documents`.

**Azurite API version note (TASK-007-001):** The Azurite compose command includes `--skipApiVersionCheck` to allow `@azure/storage-blob` v12.x SDK (which sends API version `2026-04-06`) to communicate with the `mcr.microsoft.com/azure-storage/azurite:latest` image. Without this flag, the SDK's API version is rejected. If you pull a new Azurite image that natively supports the required API version, the flag can be removed.

### Connection strings

The `AzuriteAdapter` uses the Azurite well-known dev account (public constants — not secrets):
- **Host-side** (dev server, scripts, Playwright): `BlobEndpoint=http://127.0.0.1:10000/devstoreaccount1`
- **Compose container-side** (portal, admin): `BlobEndpoint=http://azurite:10000/devstoreaccount1`

See `.env.example` for the full connection string formats (`STORAGE_CONNECTION_STRING`, `PORTAL_STORAGE_CONNECTION_STRING`, `ADMIN_STORAGE_CONNECTION_STRING`).

### Encryption at rest (AC-FILE-003-01 / ADR-008 / ADR-020)

Azurite simulates AES-256 SSE transparently — no per-object encryption config is needed. The adapter does NOT hand-roll crypto. The tier-3 integration test (`packages/storage/src/storage.integration.test.ts`) asserts `isServerEncrypted === true` on stored blobs via an out-of-band `getRawProperties()` call.

**ADR-013/020:** The `@azure/storage-blob` SDK is confined to `packages/storage/src/adapters/azurite.ts`. No app code in `apps/portal/**` or `apps/admin/**` may import it. The SDET checks this at review.

### ADR-009 storage-integrity hook stub

ADR-009 describes a two-step upload pattern (create `Document` row → signed-upload URL → client uploads → webhook/readiness check flips row state). The reconciliation sweep (for dangling storage objects from failed uploads) is a **DEFERRED** Phase-5+ feature. No sweep/cleanup logic should be added to this table until the reconciliation pattern is formally implemented. This stub documents the intent for the implementing task (TASK-007-004 and beyond).

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

### Admin app health probes (added TASK-004-001)

After `docker compose up -d`, the admin app can be probed independently:

```bash
# Shallow health check (admin container, port 3001)
curl http://localhost:3001/healthz    # Returns: {"status":"ok","app":"admin","ts":"..."}
curl http://localhost:3001/readyz     # Returns: {"status":"ready","app":"admin","ts":"..."}
```

The Playwright smoke spec (`apps/admin/e2e/specs/scaffold.smoke.spec.ts`, `@smoke` tagged) runs
these probes via the e2e runner against the compose stack:

```bash
pnpm --filter admin e2e:smoke   # Run @smoke specs against http://localhost:3001
```

### Cross-app redirect gate (TASK-004-008 — ADR-010 §8 required gate)

The `pnpm e2e:cross-app` script is the required gate for the ADR-010 §8 redirect matrix.
It runs the exhaustive cross-app specs against both app containers and exits non-zero on any failure:

```bash
pnpm e2e:cross-app   # Runs cross-app-redirect.spec.ts in both apps/portal and apps/admin
```

Both containers (portal on 3000, admin on ADMIN_PORT) must be healthy before running this gate.

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

### Prisma engine fails to load in container (`libssl.so.1.1` error)

**Symptom:** request-scoped Prisma pages (e.g. `/services` in admin) return "Application error"
in-container; container logs show:
```
Error [PrismaClientInitializationError]:
Unable to require(`libquery_engine-linux-musl.so.node`).
Details: Error loading shared library libssl.so.1.1: No such file or directory
```

**Cause:** The Alpine runner (`node:20-alpine`) ships only `libssl.so.3`. A Prisma engine compiled
against OpenSSL 1.1.x requires `libssl.so.1.1` (absent). The fix (BUG-002-002) generates the
`linux-musl-openssl-3.0.x` engine and includes it in the standalone image via `outputFileTracingIncludes`.

**Diagnosis:**
```bash
# Check which engines are in the container image
docker compose exec admin find /app -name 'libquery_engine*'
# Should include: libquery_engine-linux-musl-openssl-3.0.x.so.node
# If absent: the outputFileTracingIncludes glob did not match — see inventory.md § Prisma Engine
```

**Recovery (three-layer fix — all three must be present):**
1. Verify `prisma/schema.prisma` `generator client` includes `binaryTargets = ["native", "linux-musl-openssl-3.0.x"]`
2. Verify `apps/admin/next.config.mjs` and `apps/portal/next.config.mjs` include `outputFileTracingIncludes` with the musl engine glob
3. Verify both Dockerfiles (runner stage) include `ENV PRISMA_QUERY_ENGINE_LIBRARY` pointing at `/app/.prisma/client/libquery_engine-linux-musl-openssl-3.0.x.so.node` AND the `COPY --from=builder` that populates that path
4. Rebuild: `docker compose --env-file .env.local build admin portal`
5. Restart: `ADMIN_PORT=13001 docker compose --env-file .env.local up -d --no-deps admin portal`
6. Re-verify engine present: `docker exec tax-portal-admin find /app -name 'libquery_engine-linux-musl*'`
7. Re-verify env var: `docker exec tax-portal-admin sh -c 'echo $PRISMA_QUERY_ENGINE_LIBRARY'`

See `inventory.md` § Prisma Engine Binary Target Requirement for full details.

---

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

## Rate Limiter Scaling Trigger (ADR-022 §2 / ADR-007)

**Added:** TASK-004-009 (BRIEF-004)

The sign-in rate limiter (`packages/auth/src/rate-limiter/in-memory.ts`) stores counters
in the Node.js process heap — **one counter store per running process**.

### v1 single-process assumption (safe today)

While each app (`apps/portal`, `apps/admin`) runs as **one replica**, the in-memory limiter
is correct and sufficient: all requests hit the same process and share the same counter.

### >1-replica trigger (action required)

**If either app is scaled beyond ONE replica, this limiter MUST be replaced with a
shared-store adapter before the scale-out goes live.**

Why: with N replicas, each process holds its own counters. An attacker sending N×limit
requests (distributing across replicas) would not trigger the throttle in any single replica.
The effective limit multiplies by the replica count — a real credential-stuffing hole.

**Migration path (no call-site changes):**
1. Implement a `SharedStoreRateLimiter` class that satisfies the `RateLimiter` port
   (`packages/auth/src/rate-limiter/port.ts`) using SQL Server (ADR-007's named fallback)
   or an external store (Redis, Azure Cache for Redis, etc.).
2. Register it as the singleton in `packages/auth/src/rate-limiter/in-memory.ts`'s
   `getRateLimiter()` function (or add a new selector), gated by an env var.
3. No changes to `apps/portal/src/app/(public)/sign-in/actions.ts` — it calls
   `getRateLimiter()` and is agnostic to the impl.

### Environment variables (configurable defaults)

| Variable                  | Default | Description                                            |
| ------------------------- | ------- | ------------------------------------------------------ |
| `RATE_LIMIT_MAX_ATTEMPTS` | `10`    | Max sign-in attempts allowed per (IP, endpoint) window |
| `RATE_LIMIT_WINDOW_MS`    | `60000` | Window length in milliseconds (default: 1 minute)      |

Add these to `.env.local` to override defaults during local dev or testing.

---

## Adding a New Service

When adding a new compose service:

1. Add the service to `docker-compose.yml` with a healthcheck and named volume (if needed).
2. Update `inventory.md` — services table, ports table, env vars table, volumes table.
3. Update this runbook — bring-up/tear-down sections if the new service changes the sequence.
4. Update `.env.example` with any new required variables.
5. Update CLAUDE.md § Port assignments if a new port is introduced.
