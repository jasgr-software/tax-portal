# Operations Inventory — tax-portal local dev stack

**Owner:** devops
**Last updated:** TASK-011-001 (EngagementNote Prisma model + dueDate/isPriority Engagement columns; 0008-engagement-note-policy.sql Track B — ACCOUNTANT-ONLY accountant-notes policy: sec.pol_EngagementNote FILTER+BLOCK, no CLIENT branch — AC-LIFE-008-02/-03)
**Source files:** `docker-compose.yml` at repo root

This document is the authoritative inventory of the local development compose stack. Any change to
`docker-compose.yml`, Dockerfiles, ports, env vars, volumes, or the DB principal split MUST update
this file in the same commit (CLAUDE.md § DevOps domain-specific notes).

---

## Services

| Service | Image | Container name | Status in TASK-002 |
|---------|-------|----------------|---------------------|
| `sqlserver` | `mcr.microsoft.com/mssql/server:2022-latest` | `tax-portal-sqlserver` | Active |
| `azurite` | `mcr.microsoft.com/azure-storage/azurite:latest` | `tax-portal-azurite` | Active |
| `mailhog` | `mailhog/mailhog:latest` | `tax-portal-mailhog` | Active |
| `portal` | `apps/portal/Dockerfile` (multi-stage) | `tax-portal-portal` | Active |
| `admin` | `apps/admin/Dockerfile` (multi-stage) | `tax-portal-admin` | Active (added TASK-004-001 / BRIEF-004) |
| `docuseal` | `docuseal/docuseal:latest` | `tax-portal-docuseal` | Deferred to Epic-003 |
| `docuseal-postgres` | `postgres:15-alpine` | `tax-portal-docuseal-postgres` | Deferred to Epic-003 |

### Compose split decision (TASK-002 Work Log)

TASK-002 stands up the **data-plane only** (SQL Server, Azurite, Mailhog). This allows TASK-003 to
run its tier-3 RLS integration test against a live SQL Server without needing the app containers to
exist. The `portal` and `admin` app services are added in TASK-004 when `apps/portal` and
`apps/admin` exist.

---

## Port Assignments

| Service | Default host port | Env override | Container port | Protocol | Notes |
|---------|------------------|--------------|----------------|----------|-------|
| SQL Server 2022 | **1433** | `SQLSERVER_PORT` | 1433 | TCP | SQL Server TDS protocol |
| Azurite blob | **10000** | `AZURITE_PORT` | 10000 | HTTP | Azure Blob Storage emulator API |
| Mailhog Web UI | **8025** | `MAILHOG_HTTP_PORT` | 8025 | HTTP | Mail catcher UI |
| Mailhog SMTP | **1025** | `MAILHOG_SMTP_PORT` | 1025 | SMTP | Outbound email catch |
| Client Portal (`portal`) | **3000** | `PORTAL_PORT` | 3000 | HTTP/HTTPS | Next.js app — active (added in TASK-004) |
| Tax Portal (`admin`) | **3001** | `ADMIN_PORT` | 3001 | HTTP/HTTPS | Next.js app — active (added TASK-004-001) |
| Docuseal | **3005** | — | 3000 | HTTP | E-sign service — Epic-003 |

**Canonical ports** match CLAUDE.md § Port assignments. The env-var overrides (`SQLSERVER_PORT`, etc.) allow
running the stack when another project occupies the canonical port — set them in `.env.local` if needed.

> **Note:** Env-var overrides are for local dev port-conflict resolution only. CI and the smoke gate always
> use the canonical ports (no override env vars set).

---

## Environment Variables

### SQL Server

| Variable | Required | Description | Default (local dev) |
|----------|----------|-------------|---------------------|
| `SA_PASSWORD` | **Required** | SA (sysadmin) password — must meet SQL Server complexity requirements | `DevPass1!` (local only) |

The compose file uses `${SA_PASSWORD:?...}` — the stack will refuse to start if `SA_PASSWORD` is not set.

### Migration runner (`scripts/db-migrate.ts`)

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL_ADMIN` | **Required** for Track A + B | Admin pool connection URL (`sqlserver://sa:PASSWORD@localhost:1433;database=taxportal;trustServerCertificate=true`) |
| `DATABASE_URL` | Required for app runtime | Request pool connection URL (low-privilege application role principal, set after TASK-003 creates the role) |

ADR-007: SQL authentication only. No Managed Identity, no Azure-only constructs.

### Azurite (storage adapter — `packages/storage` FileStorage port, ADR-008)

`packages/storage` ships the `FileStorage` port and two adapters: `AzuriteAdapter` (production path for local dev + CI) and `MemoryAdapter` (unit tests only). The env-driven selector (`getStorage()`) reads `STORAGE_ADAPTER` at startup. `STORAGE_ADAPTER=cloud` throws (fail-closed boot — no production adapter in this build, ADR-008). `STORAGE_ADAPTER` unset/unknown also throws.

The `AzuriteAdapter` is the **only** module that imports `@azure/storage-blob` — no app code in `apps/**` route handlers or server actions may import that SDK directly (ADR-008/ADR-020).

**Azurite compose note (TASK-007-001):** The Azurite container command now includes `--skipApiVersionCheck` to allow the `@azure/storage-blob` v12.x SDK (API version `2026-04-06`) to communicate with the `mcr.microsoft.com/azure-storage/azurite:latest` image. Without this flag, the SDK's API version is rejected by older Azurite images. **If you pull a new Azurite image and it supports the required API version natively, `--skipApiVersionCheck` can be removed.**

Both `portal` and `admin` compose services now depend on `azurite: service_healthy` so that the FileStorage port is available before the apps start.

| Variable | Required | Description | Default (local dev) |
|----------|----------|-------------|---------------------|
| `STORAGE_ADAPTER` | **Required** (app startup fails without it) | Adapter selector: `azurite \| memory \| cloud`. `cloud` throws (fail-closed). `memory` is test-only. | `azurite` (via compose) |
| `STORAGE_CONNECTION_STRING` | **Required** for `azurite` adapter | Azure Blob connection string pointing at the Azurite container. Host-side uses `127.0.0.1:10000`; compose containers use `azurite:10000`. | See `.env.example` |
| `STORAGE_CONTAINER` | Optional | Blob container name. The adapter calls `createIfNotExists()` — no manual creation needed. | `tax-portal-documents` |
| `PORTAL_STORAGE_CONNECTION_STRING` | host env → portal container | Container-side connection string for the portal service. Uses the compose service name `azurite` on port `10000`. Set in `.env.local` (added TASK-007-001). | falls back to compose inline default |
| `ADMIN_STORAGE_CONNECTION_STRING` | host env → admin container | Container-side connection string for the admin service. Uses the compose service name `azurite` on port `10000`. Set in `.env.local` (added TASK-007-001). | falls back to compose inline default |

### App services (portal + admin active as of TASK-004-001)

| Variable | App | Description |
|----------|-----|-------------|
| `DATABASE_URL_ADMIN` | portal | **Required** — admin pool connection URL used by `getActiveServices()` and `createEngagementRequest()` (ADR-003 §1/§6). The public front-door anonymous write path runs under the admin pool. Set in `docker-compose.yml` portal service environment. |
| `DATABASE_URL` | portal | **Required** (added TASK-006) — request pool connection URL for the lazy `db` Prisma client. Wired but unused in this slice (EPIC-004 will use it). Belt-and-suspenders fix for BUG-001-003: avoids `PrismaClientConstructorValidationError` if any code path materializes the lazy client. In `docker-compose.yml`, set from `PORTAL_DATABASE_URL` (container-internal `sqlserver:1433` hostname). Host-side uses `DATABASE_URL` (localhost:14330). |
| `PORTAL_DATABASE_URL_ADMIN` | host env → portal container | **Required** — Container-side admin pool URL. Uses the compose service name `sqlserver` on port `1433` (internal Docker DNS). Distinct from `DATABASE_URL_ADMIN` (host-side `localhost:14330`). Set in `.env.local` alongside `DATABASE_URL_ADMIN`. |
| `PORTAL_DATABASE_URL` | host env → portal container | **Required** — Container-side request pool URL. Uses the compose service name `sqlserver` on port `1433`. Distinct from `DATABASE_URL` (host-side `localhost:14330`). Set in `.env.local` alongside `DATABASE_URL`. |
| `DATABASE_URL_ADMIN` | admin | **Required** — admin pool connection URL for the admin container. Set in `docker-compose.yml` admin service environment from `ADMIN_DATABASE_URL_ADMIN` (container-internal `sqlserver:1433` hostname). |
| `DATABASE_URL` | admin | **Required** — request pool URL for the admin container lazy `db` Prisma client. Set from `ADMIN_DATABASE_URL` in `docker-compose.yml`. |
| `ADMIN_DATABASE_URL_ADMIN` | host env → admin container | **Required** — Container-side admin pool URL for the admin service. Uses the compose service name `sqlserver` on port `1433`. Set in `.env.local` (added TASK-004-001). |
| `ADMIN_DATABASE_URL` | host env → admin container | **Required** — Container-side request pool URL for the admin service. Uses the compose service name `sqlserver` on port `1433`. Set in `.env.local` (added TASK-004-001). |
| `PORTAL_APP_URL` | Both | Public URL of portal — e.g. `http://localhost:3000`. Used by cross-app redirect logic (ADR-010). |
| `ADMIN_APP_URL` | Both | Public URL of admin — e.g. `http://localhost:3001`. Used by cross-app redirect logic (ADR-010). |
| `AUTH_PROVIDER` | Both | Auth provider selector: `mock` (local/e2e default) or `clerk` (production). Defaults to `mock` via `${AUTH_PROVIDER:-mock}` in compose. |
| `ALLOW_MOCK_AUTH` | Both | **Mock-only opt-in** (BUG-002-001 fix). Must be `"true"` for the prod-built container to serve the mock provider. The fail-closed guard in `packages/auth/src/select.ts` keys on this flag (not `NODE_ENV`) — `NODE_ENV=production` is always true for any built image and cannot distinguish e2e/local from a real deploy. Defaults to `"true"` in compose (`${ALLOW_MOCK_AUTH:-true}`) for e2e/local containers. **NEVER set to `"true"` in a real production deploy** — a real deploy sets `AUTH_PROVIDER=clerk` and leaves `ALLOW_MOCK_AUTH` unset → fail closed (throws on mock/unset). Added BUG-002-001. |
| `MOCK_SESSION_SECRET` | Both | Signing secret for the mock session cookie. Required when `AUTH_PROVIDER=mock`. Must be a strong random secret. **Never used in a real production deployment.** |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | portal + admin | Clerk publishable key (TASK-004-002) |
| `CLERK_SECRET_KEY` | portal + admin | Clerk secret key (TASK-004-002) |
| `CLERK_WEBHOOK_SECRET` | portal | Clerk webhook signing secret (ADR-001, TASK-004-002) |
| `EMAIL_PROVIDER` | Both | Email provider selector: `smtp` (local/e2e default) or `resend` (production) or `mock` (unit tests). Defaults to `smtp` via `${EMAIL_PROVIDER:-smtp}` in compose. Added TASK-003-002. |
| `SMTP_HOST` | Both | SMTP server hostname. Hard-coded to `mailhog` (compose service name) in `docker-compose.yml` so the app containers reach the Mailhog container. On the host, defaults to `localhost` (`.env.example`). Added TASK-003-002. |
| `SMTP_PORT` | Both | SMTP server port. Hard-coded to `1025` (Mailhog SMTP) in `docker-compose.yml`. On the host, defaults to `1025`. Added TASK-003-002. |
| `EMAIL_FROM` | Both | Sender address for outbound email (`From:` header). Defaults to `noreply@tax-portal.dev` in compose. Set to a verified domain in production. Added TASK-003-002. |
| `RESEND_API_KEY` | Both | Resend API key (production only — `EMAIL_PROVIDER=resend`). Not required in local/e2e. `packages/email` `ResendEmailProvider` constructor throws `EmailBindingNotAvailableError` if `EMAIL_PROVIDER=resend` and this key is absent (fail-closed). Added TASK-003-002. |
| `RATE_LIMIT_MAX_ATTEMPTS` | Both | `InMemoryRateLimiter` max attempts per window per rate key. Production default: `10`. **docker-compose.yml defaults to `100`** via `${RATE_LIMIT_MAX_ATTEMPTS:-100}` for e2e/local dev — prevents `InMemoryRateLimiter` exhaustion across 3× sequential `pnpm e2e:run` invocations. Override in `.env.local` only if needed. Added BUG-003-001. |
| `RATE_LIMIT_WINDOW_MS` | Both | `InMemoryRateLimiter` sliding window duration in milliseconds. Default: `60000` (60 seconds). Set in docker-compose.yml for both portal and admin services. Added BUG-003-001. |
| `ESIGN_PROVIDER` | portal | E-sign provider selector: `mock` (local/e2e) or `docuseal` (production, deferred). **Default: `docuseal` (real — DECISION-E).** The mock requires `ALLOW_MOCK_ESIGN=true` (fail-closed guard). docker-compose.yml defaults to `mock` via `${ESIGN_PROVIDER:-mock}` for local/e2e containers. **NEVER set `mock` in a real production deploy** — a real deploy uses `docuseal` and leaves `ALLOW_MOCK_ESIGN` unset. Added TASK-005-002. |
| `ALLOW_MOCK_ESIGN` | portal | **Mock e-sign opt-in** (ADR-023 §4 / DECISION-E). Must be `"true"` for the portal container to serve the mock e-sign binding. Keys on this flag (not `NODE_ENV`) — same pattern as `ALLOW_MOCK_AUTH` (BUG-002-001). Defaults to `"true"` in compose (`${ALLOW_MOCK_ESIGN:-true}`) for e2e/local containers. **NEVER set to `"true"` in a real production deploy** — a real deploy sets `ESIGN_PROVIDER=docuseal` and leaves `ALLOW_MOCK_ESIGN` unset → fail closed. Setting `ESIGN_PROVIDER=docuseal` + `ALLOW_MOCK_ESIGN=true` is a contradiction → throws. Added TASK-005-002. |
| `STORAGE_ADAPTER` | Both | FileStorage adapter selector (ADR-008): `azurite` (local dev/CI default), `memory` (test-only), `cloud` (Phase-5 slot — throws at startup). Defaults to `azurite` via compose. Added TASK-007-001. |
| `STORAGE_CONNECTION_STRING` | Both | Azure Blob connection string for the AzuriteAdapter. In compose containers, resolves via `PORTAL_STORAGE_CONNECTION_STRING` / `ADMIN_STORAGE_CONNECTION_STRING` (compose internal `azurite:10000` hostname). Added TASK-007-001. |
| `STORAGE_CONTAINER` | Both | Blob container name for the FileStorage adapter. Default `tax-portal-documents`. Added TASK-007-001. |

---

## Named Volumes

| Volume name | Service | Mount point | Purpose |
|-------------|---------|-------------|---------|
| `tax-portal-sqlserver-data` | sqlserver | `/var/opt/mssql` | SQL Server data + log files |
| `tax-portal-azurite-data` | azurite | `/data` | Azurite blob storage data |

> `docker compose down -v` destroys all named volumes — this wipes the local database. A pre-command
> warning is documented in the runbook. The git hook (`scripts/hooks/install.sh`) fires a warning
> before destructive compose commands.

---

## Database Principal Split (ADR-002 / ADR-003)

Two separate database principals are used. This enforces the trust boundary between request-scoped
queries (RLS-filtered) and administrative operations.

| Principal | Pool name | Used by | Privilege level | SESSION_CONTEXT |
|-----------|-----------|---------|-----------------|-----------------|
| `taxportal_admin` (app_admin_role member) | Admin pool | `scripts/db-migrate.ts`, `pnpm db:seed`, cron, webhooks, anonymous write path | RLS-exempt — all rows visible; `sa` is NOT used for app operations (RLS BLOCK predicate blocks `sa` on Service inserts) | **NOT set** |
| `taxportal_app` (app_user_role member) | Request pool | All request-scoped queries in `packages/db` via the lazy `db` client | Low privilege — subject to RLS policies | **SET on every connection** (ADR-003) |

**IMPORTANT — seed/migrate principal:** `pnpm db:migrate` and `pnpm db:seed` MUST run as
`taxportal_admin` (not `sa`). The Service RLS BLOCK predicate is ON for `sa`, so seeding as `sa`
will be blocked. `DATABASE_URL_ADMIN` must point at `taxportal_admin` credentials for all local
dev operations. See `.env.example` for the full URL form.

**Connection URL conventions:**
- Admin pool: `DATABASE_URL_ADMIN` — used by `pnpm prisma migrate deploy` and `scripts/db-migrate.ts`
- Request pool: `DATABASE_URL` — used by `packages/db` lazy `db` client (not `adminDb`)
- Both require `trustServerCertificate=true` for local dev (SQL Server uses a self-signed cert)
- Host-side port: **14330** (`SQLSERVER_PORT` default). Container-side port: **1433** (internal)

---

## Health Checks

| Service | Health probe | Interval | Retries | Notes |
|---------|-------------|----------|---------|-------|
| `sqlserver` | `sqlcmd SELECT 1` via mssql-tools18 | 10s | 12 | 30s start_period to allow SQL Server startup |
| `azurite` | `nc -z localhost 10000` | 5s | 5 | Port check |
| `mailhog` | `nc -z localhost 8025` | 5s | 5 | Port check |
| `portal` | `GET /healthz` (HTTP 200) | 15s | 3 | Added in TASK-004 (BRIEF-001) |
| `admin` | `GET /healthz` (HTTP 200) | 15s | 3 | Added in TASK-004-001 (BRIEF-004) |

---

## Raw SQL Migration Track (Track B)

| Directory | Contents | Applied by |
|-----------|----------|------------|
| `db/migrations/` | Raw SQL extensions (grants, computed columns, temporal tables, filtered indexes) | `scripts/db-migrate.ts` Track B |
| `db/policies/` | SQL Server security policies + predicate functions (ADR-005 §7) | `scripts/db-migrate.ts` Track B |
| `db/seed/` | Dev-only seed scripts | `pnpm db:seed` (future task) |

Bookkeeping table: `dbo.__db_migrations` — stores applied filenames with timestamps. Created on first
run by the migration runner. Not managed by Prisma.

### Track B file inventory (post-TASK-006-001)

| File | Contents | Added by |
|------|----------|----------|
| `db/migrations/0001-create-principals-and-sec-schema.sql` | DB roles, logins, sec schema, grants | TASK-003 |
| `db/migrations/0002-create-audit-ledger.sql` | `dbo.AuditEvent` — **append-only ledger table** (LEDGER=ON APPEND_ONLY=ON), INSERT-only from app code; grants INSERT to app_user_role | TASK-004-010 |
| `db/policies/0001-engagement-request-policy.sql` | `sec.pol_EngagementRequest` — accountant/admin read, no CLIENT (early Epic-001 state) | TASK-003 |
| `db/policies/0002-service-readable.sql` | `sec.pol_Service` — accountant/admin/CLIENT read, admin/accountant mutate | TASK-003 |
| `db/policies/0003-audit-event-policy.sql` | `sec.pol_AuditEvent` — **accountant/admin read ONLY, CLIENT denied entirely** (ADR-019 §4) | TASK-004-010 |
| `db/policies/0004-notification-policy.sql` | `sec.pol_Notification` — accountant/admin read, no CLIENT branch (accountant-only inbox) | TASK-003 |
| `db/policies/0005-engagement-policy.sql` | `sec.pol_Engagement` — FIRST client-owned-rows policy; FILTER+BLOCK; CLIENT-ownership via User.clerkId → Engagement.clientUserId | TASK-005-001 |
| `db/policies/0006-questionnaire-policy.sql` | SECOND client-owned-rows policy; `sec.pol_QuestionnaireAnswer` (FILTER+BLOCK, CLIENT ownership via Engagement → User.clerkId) + `sec.pol_QuestionnaireTemplate` (BLOCK only, accountant-write, no CLIENT branch — mirrors fn_service_write_access) | TASK-006-001 |
| `db/policies/0007-document-policy.sql` | THIRD client-owned-rows policy; `sec.pol_Document` (FILTER+BLOCK, CLIENT ownership via Engagement.engagementId → User.clerkId; PART 0 adds ADR-009 status CHECK constraint `'pending'\|'active'\|'infected'`) + `sec.pol_DocumentRequest` (FILTER client-reads own + BLOCK accountant-only write, no CLIENT branch in fn_document_request_write_access — mirrors fn_service_write_access/fn_questionnaire_template_write_access) | TASK-007-003 |
| `db/policies/0008-engagement-note-policy.sql` | ACCOUNTANT-ONLY policy (NOT client-isolation family); `sec.pol_EngagementNote` (FILTER+BLOCK); `sec.fn_engagement_note_access` ITVF — admin/accountant pass, **NO CLIENT branch** (even owning-client reads ZERO); AC-LIFE-008-02/-03. Mirrors `0004-notification-policy.sql` (accountant-only family). | TASK-011-001 |

### Track A (Prisma) entity inventory (post-TASK-006-001)

| Entity | Table | RLS coverage | Added by |
|--------|-------|-------------|----------|
| `Service` | `dbo.Service` | `sec.pol_Service` (FILTER+BLOCK) | EPIC-002 |
| `EngagementRequest` | `dbo.EngagementRequest` | `sec.pol_EngagementRequest` (FILTER) | EPIC-001 |
| `EngagementRequestService` | `dbo.EngagementRequestService` | Via EngagementRequest policy | EPIC-001 |
| `User` | `dbo.User` | `sec.pol_User` (tracked in 0001) | EPIC-004 |
| `Engagement` | `dbo.Engagement` | `sec.pol_Engagement` (FIRST client-owned-rows — FILTER+BLOCK) | TASK-005-001 |
| `LetterTemplate` | `dbo.LetterTemplate` | None (accountant-managed; not client-readable) | TASK-005-001 |
| `Notification` | `dbo.Notification` | `sec.pol_Notification` (accountant-only read) | TASK-003 |
| `QuestionnaireTemplate` | `dbo.QuestionnaireTemplate` | `sec.pol_QuestionnaireTemplate` (BLOCK only, accountant-write, no CLIENT branch) | TASK-006-001 |
| `QuestionnaireAnswer` | `dbo.QuestionnaireAnswer` | `sec.pol_QuestionnaireAnswer` (SECOND client-owned-rows — FILTER+BLOCK) | TASK-006-001 |
| `DocumentRequest` | `dbo.DocumentRequest` | `sec.pol_DocumentRequest` (FILTER client-read + BLOCK accountant-only write, no CLIENT write branch) | TASK-007-003 |
| `Document` | `dbo.Document` | `sec.pol_Document` (THIRD client-owned-rows — FILTER+BLOCK via engagementId isolation column) | TASK-007-003 |
| `Engagement` (columns: `dueDate`, `isPriority`) | `dbo.Engagement` | `sec.pol_Engagement` (reused, no new policy — additive columns, no confidentiality AC) | TASK-011-001 |
| `EngagementNote` | `dbo.EngagementNote` | `sec.pol_EngagementNote` (ACCOUNTANT-ONLY FILTER+BLOCK — NOT client-isolation; CLIENT reads ZERO even as owner) | TASK-011-001 |

---

## Audit Ledger Table (TASK-004-010 — ADR-019)

**Table:** `dbo.AuditEvent`
**Track:** Raw-SQL Track B (`db/migrations/0002-create-audit-ledger.sql`)
**Applied by:** `pnpm db:migrate` (Track B after Prisma migration)

### Purpose

Tamper-evident audit trail (ADR-019) recording security-significant auth events:
- `auth.signin` — accountant (or test-harness client) session establishment
- `auth.account_created` — client account creation from invitation

### Tamper-evidence (ADR-019 §1)

The table is created with `LEDGER = ON (APPEND_ONLY = ON)` on SQL Server 2022 Developer Edition.
Rows are hashed into a Merkle tree; digests stored in `sys.database_ledger_transactions`.
Cryptographically verifiable via `EXEC sys.sp_verify_database_ledger`.
**If the engine edition does not support ledger**, the migration will fail — record the exact error
in the Work Log and consult the DECISION comment in `0002-create-audit-ledger.sql` for the fallback.
The append-only-by-app-convention fallback must be EXPLICITLY documented — not silent.

### Access control (ADR-019 §4)

- **app_user_role:** INSERT only (writes ride the request path). No SELECT, UPDATE, DELETE.
- **app_admin_role:** Full access via db_owner (RLS-exempt for admin operations).
- **RLS policy (`sec.pol_AuditEvent`):** ACCOUNTANT/admin read all rows; **CLIENT reads ZERO** (no client branch — denied entirely).
- Null SESSION_CONTEXT: zero rows (fail-closed, ADR-003 §5).

### Retention and purge exclusion (ADR-019 §5 — DEFERRED)

Audit records must be retained ≥7 years and EXCLUDED from the ADR-018 purge job.
**The purge job does not exist yet.** This table must be explicitly excluded when the purge
job is implemented. Do NOT create any sweep or cleanup logic that would touch `dbo.AuditEvent`.
Follow-up tracked: ADR-019 §5 retention/purge-exclusion (deferred — no purge job in this slice).

### Schema

| Column | Type | Notes |
|--------|------|-------|
| `id` | UNIQUEIDENTIFIER | PK, NEWSEQUENTIALID() |
| `clerkUserId` | NVARCHAR(128) NOT NULL | Raw actor Clerk id (ADR-019 §2 — inverse of telemetry) |
| `actorRole` | NVARCHAR(16) NOT NULL | 'ACCOUNTANT' \| 'CLIENT' |
| `action` | NVARCHAR(128) NOT NULL | e.g. 'auth.signin', 'auth.account_created' |
| `targetType` | NVARCHAR(64) NULL | Target entity type (null for sign-in) |
| `targetId` | NVARCHAR(256) NULL | Target entity id (null for sign-in) |
| `sourceSurface` | NVARCHAR(32) NOT NULL | 'portal' \| 'admin' |
| `outcome` | NVARCHAR(16) NOT NULL | 'success' \| 'denied' (default 'success') |
| `occurredAt` | DATETIMEOFFSET NOT NULL | Server timestamp, default SYSDATETIMEOFFSET() |

### How to apply

```bash
pnpm db:migrate           # Apply all pending Track A + Track B (migration + policy)
pnpm db:policies:apply    # Re-apply policies only (idempotent; use after policy edits)
```

### Wired seams

| Event | Seam | Binding |
|-------|------|---------|
| `auth.account_created` | `apps/portal/src/app/(public)/sign-up/actions.ts` (`signUpWithInvitation`) | Same mssql Transaction as account-creation mutation — fail-closed (ADR-019 §3) |
| `auth.signin` | `apps/admin/src/app/api/mock-session/route.ts` (POST handler) | Standalone insert — no admin-credential-login mutation yet; transactional bind deferred to real-Clerk/admin-login slice (DECISION in route.ts) |

---

## Image References

| Image | Registry | Version pinning policy |
|-------|----------|----------------------|
| `mcr.microsoft.com/mssql/server:2022-latest` | Microsoft MCR | `2022-latest` tracks latest 2022 CU — acceptable for dev. Production: pin to a specific CU tag. |
| `mcr.microsoft.com/azure-storage/azurite:latest` | Microsoft MCR | `latest` acceptable for dev emulator. |
| `mailhog/mailhog:latest` | Docker Hub | `latest` acceptable for mail catcher. |
| `node:20-alpine` | Docker Hub | Pinned at LTS major. App Dockerfiles (TASK-004) will use a specific patch tag. |

---

## Prisma Engine Binary Target Requirement (BUG-002-002)

**Added:** BUG-002-002

Both app container images (`portal`, `admin`) use the `node:20-alpine` runner. Alpine ships only
`libssl.so.3` (OpenSSL 3.x). Prisma 5.22.x's default query engine (`libquery_engine-linux-musl.so.node`)
requires `libssl.so.1.1` (OpenSSL 1.1.x), which is absent on Alpine — causing the request-scoped Prisma
path to fail with:

```
Error [PrismaClientInitializationError]:
Unable to require(`libquery_engine-linux-musl.so.node`).
Details: Error loading shared library libssl.so.1.1: No such file or directory
```

### Fix (BUG-002-002) — three-layer fix

1. **`prisma/schema.prisma` `generator client`** now declares:
   ```prisma
   binaryTargets = ["native", "linux-musl-openssl-3.0.x"]
   ```
   This causes `prisma generate` (whether run on the host or in the Docker builder) to produce the
   `libquery_engine-linux-musl-openssl-3.0.x.so.node` engine alongside the host-native engine.
   `native` is retained so local dev/test (the host) continues to work unchanged.

2. **`outputFileTracingIncludes` in both `apps/admin/next.config.mjs` and `apps/portal/next.config.mjs`**
   forces Next.js standalone file-tracing to include the musl engine `.node` file in the standalone
   output tree. Without this, the Alpine builder only traces the engine it loaded (which would be
   the older `linux-musl.so.node`); the 3.0.x engine would not be included in the standalone bundle.

3. **`PRISMA_QUERY_ENGINE_LIBRARY` env var + explicit `COPY --from=builder` in both Dockerfiles'
   runner stages** explicitly override Prisma's Alpine OpenSSL detection (which defaults to
   "openssl-1.1.x" when it cannot detect the OpenSSL version). Without this override, Prisma tries
   to load `linux-musl.so.node` even though `linux-musl-openssl-3.0.x.so.node` is present.
   The engine is COPY-d to a stable `/app/.prisma/client/` path (not a pnpm-hashed path) so the
   `PRISMA_QUERY_ENGINE_LIBRARY` env var points to a version-stable location.

   Both `apps/admin/Dockerfile` and `apps/portal/Dockerfile` (runner stages) include:
   ```dockerfile
   ENV PRISMA_QUERY_ENGINE_LIBRARY=/app/.prisma/client/libquery_engine-linux-musl-openssl-3.0.x.so.node
   RUN mkdir -p /app/.prisma/client && chown nextjs:nodejs /app/.prisma /app/.prisma/client
   COPY --from=builder --chown=nextjs:nodejs \
     /repo/node_modules/.pnpm/@prisma+client@5.22.0_prisma@5.22.0/node_modules/.prisma/client/libquery_engine-linux-musl-openssl-3.0.x.so.node \
     /app/.prisma/client/libquery_engine-linux-musl-openssl-3.0.x.so.node
   ```
   **If the Prisma version changes (ADR-004 § Prisma version lock):** update the `COPY --from=builder`
   source path in both Dockerfiles to match the new `@prisma+client` pnpm store path.

### Regression symptom

If any of the three fix layers regress, the Alpine runner cannot load the Prisma query engine:
- Missing `binaryTargets` entry → engine not generated → engine not in standalone tree
- Missing `outputFileTracingIncludes` → engine not in standalone tree (Alpine builder traces `linux-musl.so.node` not `linux-musl-openssl-3.0.x.so.node`)
- Missing `PRISMA_QUERY_ENGINE_LIBRARY` → Prisma defaults to 1.1.x detection on Alpine → tries to load `linux-musl.so.node` → fails

Every request-scoped Prisma page (i.e., any page using the `packages/db` lazy `db` client, e.g. `listAllServices()`) will 500 with:
```
PrismaClientInitializationError:
Unable to require(`libquery_engine-linux-musl.so.node`).
Details: Error loading shared library libssl.so.1.1: No such file or directory
```
The regression is only detectable in the container (not on the host, where `native` loads fine).

### Verification

After rebuilding images:
```bash
docker compose exec admin find /app -name 'libquery_engine-linux-musl*'
# Expected: /app/node_modules/.prisma/client/libquery_engine-linux-musl-openssl-3.0.x.so.node (or similar path)
```
If the engine is absent, the `outputFileTracingIncludes` glob did not match — check pnpm store paths
and update the glob in both `next.config.mjs` files accordingly.
