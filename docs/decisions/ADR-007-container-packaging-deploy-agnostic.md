# ADR-007: Container Packaging and Deploy-Agnostic Posture

**Status:** Accepted
**Date:** 2026-04-16
**Deciders:** SA (with user direction)
**Related:** ADR-002 (SQL Server), ADR-006 (Monorepo layout), ADR-008 (Object storage abstraction)

## Context

The original plan targeted Vercel for deployment. The user has since directed that **the deployment platform be deferred** and that the app be packaged in a way that keeps production options open. This is driven by:

- **DB choice.** SQL Server (ADR-002) is not Vercel-native. The DB is likely to live on Azure, a self-hosted VM, or an existing on-prem SQL instance. Co-locating the app near the DB matters for latency.
- **SSE realtime.** Notifications use Server-Sent Events for v1 (see Tier-2 realtime ADR, deferred). SSE is a long-lived HTTP connection; Vercel's serverless function model gives you 15 seconds (hobby) to 800 seconds (enterprise) and requires the stream to complete, which violates the SSE contract for anything but toy cases. Edge functions have better streaming but no persistent Node runtime and no DB driver support.
- **Storage adapter.** Object storage is also abstracted (ADR-008) with Azurite locally and the production adapter deferred. The host needs to reach whatever object store gets chosen.
- **Optionality.** The user explicitly asked the stack stay open to Azure Container Apps, Azure App Service, Fly.io, Render, Railway, self-hosted Docker/K3s, AWS App Runner, GCP Cloud Run — anything that runs OCI containers as long-lived processes.

The constraint set: **package the app as a portable OCI container, hold no assumptions about the host, and defer the deployment decision to Phase 5** when real deploy traffic shapes are in view.

## Decision

**The app ships as an OCI container image built from a multi-stage Dockerfile. No Vercel-specific APIs, no platform-specific filesystem assumptions, long-lived Node process, explicit health endpoints. The production deployment target is deferred to Phase 5 and constrained only by the host-capability list below.**

### Image shape

Multi-stage Dockerfile at the repo root:

- **Stage 1 — `deps`** — `node:20-alpine` base, `pnpm install --frozen-lockfile` with only production deps.
- **Stage 2 — `builder`** — `node:20-alpine`, full install, `pnpm build`. Produces `apps/web/.next/` standalone output (`output: 'standalone'` in `next.config.mjs`).
- **Stage 3 — `runner`** — `node:20-alpine`, non-root user (`node`), copies `standalone/`, `static/`, `public/`, and the Prisma client. `CMD ["node", "apps/web/server.js"]`.

Constraints:

- **Base:** `node:20-alpine` unless a dependency demands glibc (openssl-linked mssql variants sometimes do — if that happens, switch to `node:20-slim` and document in the Dockerfile). Both are deploy-agnostic.
- **Size target:** final runner stage < 300 MB. Achieved by `standalone` output + Alpine + aggressive multi-stage copy. Enforced via a CI size check.
- **Non-root:** `USER node` in the runner stage. Required by most container platforms' hardening defaults (Cloud Run, Container Apps).
- **Signals:** Node receives `SIGTERM` and shuts down cleanly via the Next.js standalone server's built-in handler. Any long-lived connections (SSE streams) are closed gracefully with a 30-second drain budget.
- **Reproducibility:** images are built from a known lockfile. Build args limited to `NODE_ENV`, `NEXT_PUBLIC_*` env vars that need to bake in. Secrets never baked into the image.

### Long-lived Node process — what this means in practice

The app assumes a long-lived Node runtime. This rules out serverless models that spin up per request:

- `export const runtime = 'edge'` is **not used anywhere.** App Router routes default to `'nodejs'`. Middleware runs on Node, not edge.
- `@vercel/edge`, `@vercel/kv`, `@vercel/blob`, `@vercel/cron`, `@vercel/postgres` — **not imported.** Nothing in the codebase should reach for Vercel-branded SDKs.
- **In-memory state** (rate-limiter counters, SSE subscriber lists) may live in the process for v1. If the app ever scales to >1 replica, state that can't tolerate a single-process invariant moves to SQL Server or an external store. A later ADR handles horizontal scaling explicitly; for v1 the single-process assumption is documented.
- **Scheduled jobs** (overdue reminders — REQ-MSG-018, REQ-FILE-012) run via a container host's cron mechanism (Azure Container Apps Jobs, K8s CronJob, Railway cron, a separate `cron` container on Fly.io, etc.) — **not** via an in-app `setInterval`. The job entry point is `scripts/run-cron.ts` and runs under the admin pool (ADR-003, ADR-005). The platform decision at Phase 5 picks how this is scheduled.

### Health endpoints

Two endpoints, both must exist in v1 Epic 001:

- **`GET /healthz`** — liveness. Returns 200 as long as the Node process is responsive. Does **not** check DB or storage — a DB outage should not restart the pod.
- **`GET /readyz`** — readiness. Returns 200 when (a) the app has completed startup, (b) the admin DB pool has verified connectivity (one successful `SELECT 1`), and (c) the storage adapter reports ready. Returns 503 otherwise.

Every candidate host supports this dual pattern. ACA, K8s, ECS, Cloud Run, Fly.io, Railway, Render all probe both.

### No platform-specific filesystem assumptions

The app is expected to run on an ephemeral filesystem. Specifically:

- **No local file writes beyond `/tmp`** (and even `/tmp` is per-instance and unreliable across restarts).
- **Uploaded documents go to the storage adapter** (ADR-008), never the local filesystem.
- **Logs go to stdout/stderr** — no log files. The platform captures logs.
- **Prisma's SQLite driver is not used in prod** — the SQL Server driver, only. (SQLite is sometimes pulled in accidentally via dev-dependency transitive closures; lockfile audits catch this.)
- **No reliance on a specific `/` filesystem shape** — no `/proc` scraping, no `/sys` inspection, no `cgroup` assumptions. The app treats the host as opaque.

### Host capability list — Phase 5 shortlist

When Phase 5 picks a host, the candidate must support **all** of:

1. **OCI container images.** Built from our Dockerfile, pulled from a registry.
2. **Long-lived Node process.** No per-request function lifecycle, no cold-start-per-hit pattern, no 30-second hard request timeout.
3. **Persistent outbound + inbound HTTPS.** Outbound for Clerk API, storage adapter, email provider, Docuseal. Inbound for user traffic + webhooks (Clerk, Docuseal, storage signed-URL callbacks where applicable).
4. **Persistent storage via an external adapter.** (The adapter lives in `packages/storage`; the host does not need its own blob store.)
5. **Custom-domain ingress + TLS.** The portal lives at `portal.herfirm.com` (REQ-IDNT-001). Host must support bringing the domain + terminating TLS.
6. **SSE-compatible ingress.** No 30-second idle timeout on HTTP/1.1 or HTTP/2 streams. No aggressive response buffering (e.g., Nginx with the wrong config). No forced connection close on idle.
7. **Secret management.** Ability to inject `DATABASE_URL_APP`, `DATABASE_URL_ADMIN`, Clerk keys, storage credentials, Docuseal token, and any other secret as env vars (or mounted files). No hard-coded secrets in the image.
8. **Health-probe integration.** Support for `/healthz` and `/readyz` probes with configurable thresholds.
9. **Scheduled jobs.** Either native (Cloud Run Jobs, ACA Jobs, K8s CronJob) or via a co-located scheduler pattern that the platform accepts.

### Eligible at Phase 5

Any host that satisfies items 1–9. Known-good candidates, unranked:

- **Azure Container Apps** — strong fit with SQL Server gravity, native ACA Jobs for cron, managed ingress with SSE support. Likely front-runner, but not locked in.
- **Azure App Service (Linux containers)** — works, SSE-compatible, slightly older model than ACA but well-understood.
- **Fly.io** — strong SSE support, per-machine model with long-lived processes, cron via Fly Machines. Good candidate if Azure-gravity weakens.
- **Render** — simple Docker deploy model, cron add-on, SSE supported.
- **Railway** — similar to Render, cron add-on, good developer UX.
- **Self-hosted Docker / K3s / single-VM Docker Compose** — viable if the accountant / her IT has existing infra. Trades managed-service cost for operational burden.
- **AWS App Runner** — works; ALB-style ingress supports SSE; AWS-gravity appears only if SQL Server lives on RDS SQL Server.
- **GCP Cloud Run** — **candidate with caveat.** Cloud Run supports HTTP streaming but has historically had quirks with SSE over HTTP/1.1 (keep-alive / ingress buffering) that require explicit config and verification. Must be validated at Phase 5 before selection.

### Ineligible at Phase 5

Hosts that **do not** satisfy the capability list without an architecture change:

- **Vercel serverless functions** — request timeouts and per-invocation model break long-lived SSE. (Vercel can host a separate static marketing site; the app itself cannot.)
- **Cloudflare Workers (Workers-only, no Durable Objects runtime)** — no persistent Node, SQL Server driver incompatibility. Pages + Workers for static assets is fine; the app runtime is not.
- **AWS Lambda-only** — same reason as Vercel serverless. Lambda + API Gateway does not support SSE well (15-minute max, forced buffering).

Eligibility is a snapshot. If a currently-ineligible host launches long-lived-process support that meets the list, it becomes eligible. No re-decision is required unless the SA is asked — this ADR's list is a Phase 5 starting point, not a moratorium.

### Preview-per-PR — nice-to-have

The original plan expected Vercel-style preview URLs on every PR. User has relaxed this to **nice-to-have, not a shortlist filter**:

- If the Phase 5 host offers it (some do: Render, Railway, Fly.io via manual config), great — enable it as a CI-driven deploy on PR open.
- If not, PR review relies on local runs + CI artifacts. Acceptable.
- **Epic 001 CI does not include preview-per-PR** — lean CI only: lint, type-check, build, test, security scan. Preview wiring is added during Phase 5 if the chosen host supports it.

### Dev vs prod container parity

Local dev uses `docker-compose.yml` at the repo root. It runs:

- **SQL Server 2022 Developer** (image `mcr.microsoft.com/mssql/server:2022-latest`) — ADR-002.
- **Azurite** (image `mcr.microsoft.com/azure-storage/azurite:latest`) — ADR-008.
- **Docuseal + its Postgres** (images TBD per Docuseal ADR, deferred) — added when Docuseal integration begins in Epic 003.
- **The app container** — `docker compose up web` runs the same Dockerfile as production would.

Developer mode (`pnpm dev:web` outside the container) is also supported for fast iteration. The container mode exists to validate the actual deployment artifact — same image, same entrypoint, same health probes.

## Alternatives considered

### Stay with Vercel, adapt to its constraints

Use Vercel with `runtime = 'nodejs'` for routes, handle SSE with polling or with Upstash + WebSocket. Rejected:

- SSE-as-polling is a material product regression (missed notifications, wasted battery on client devices).
- WebSocket on Vercel means Upstash or Pusher — another vendor, another bill, another failure mode.
- Cron on Vercel (Vercel Cron) is platform-locked — moving off Vercel later requires rewriting the cron entrypoints.
- Vercel's value is frictionless deploy for stateless Next.js. The portal is not stateless (SSE, long-running auth flows, DB-heavy writes); the value capture is weaker than for a content site.

### Build for Cloudflare (Workers + D1 + R2)

Cloudflare's full-stack story is compelling for ultra-low-cost stacks but incompatible with SQL Server (D1 is SQLite; no SQL Server driver in Workers runtime) and requires rewriting the app against the Workers runtime API. Fully rejected — not a portability trade, a rewrite.

### Target a single host platform (e.g., Azure Container Apps) now

Picking ACA in this ADR would let us bake in platform-specific assumptions (Managed Identity, Dapr, ACA Jobs specifically). Rejected because user explicitly asked for deferral. The cost of deferring is low — the Dockerfile, health endpoints, and adapter boundaries we're picking now are portable across every candidate host. Picking the host in Phase 5 loses nothing.

### Skip containerisation, deploy raw Node

Deploying `node server.js` to a VM is technically simpler than a container but less portable (drift between dev and prod environments, no dependency isolation, bespoke systemd / supervisor setup). Rejected — containerisation is universal enough that the tax is minimal.

### Per-PR preview as a hard requirement

Including preview-per-PR as a shortlist filter would have eliminated a few self-hosted options (it's hard to wire previews on a single-VM Docker host). The user has explicitly traded this for flexibility. ADR records the trade so later epics don't reintroduce the filter.

## Consequences

- **One artifact.** A container image. It is the deploy unit across local dev, CI smoke, staging, and prod. "Works in my Docker" is equivalent to "works on the host."
- **No Vercel gravity.** The repo has zero `@vercel/*` imports, no `vercel.json`, no `VERCEL_ENV` branches. Moving to Vercel later would require adding the gravity back — not the reverse direction.
- **SSE is viable everywhere.** The host capability list puts SSE on a firm footing. Realtime (the deferred Tier-2 ADR) can land without another platform conversation.
- **Phase 5 is a real decision point.** The deploy ADR (TBD number, future epic) picks a host from the eligible list based on: SQL Server gravity, cost, SSE performance, cron ergonomics, preview URL support (if prioritised by then), and operational burden. The decision is short because the capability list is already drawn.
- **Operational scripts are portable.** `scripts/smoke-test.sh` runs against `docker compose up` locally and against the same image in CI. No platform-specific "how do I run smoke on X" procedure exists.
- **CI cost stays low.** Without a Vercel integration baked in, CI in Epic 001 is: build + test + image-build + image-push-to-dev-registry. Deploy-to-staging wiring is a later epic's concern.
- **Health endpoints are required from day one.** Every platform needs them, so they ship in Epic 001 — not deferred.
- **Dev and prod share an image contract.** Developers can `docker run` the production image locally against their docker-compose DB to validate before pushing. Regressions that only show up under containerised runtime are catchable on a laptop.
- **Single-process assumption documented.** If growth demands >1 replica, a follow-up ADR handles it. Current scale (one accountant, low-dozens of clients) does not require horizontal scaling.

## Related

- **ADR-002** — SQL Server; co-location gravity shapes the eligible host list.
- **ADR-006** — Monorepo layout; `apps/web/` Dockerfile, reserved `infra/`, root `docker-compose.yml`.
- **ADR-008** — Object storage; adapter abstraction keeps host-specific storage decoupled.
- **SRS** — REQ-NFR-003, REQ-NFR-004 (tech stack, will be generalised by RA), REQ-IDNT-001 (custom domain), REQ-MSG-012 (real-time delivery — deferred Tier-2 ADR).
- **Tenet 1** — Security non-negotiable; containerised ingress + TLS + non-root runner supports this.
