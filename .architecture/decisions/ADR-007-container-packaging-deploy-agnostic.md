# ADR-007: Container Packaging and Deploy-Agnostic Posture

**Status:** Accepted
**Date:** 2026-04-16 (revised 2026-04-16 — two-frontend split → two images)
**Deciders:** SA (with user direction)
**Related:** ADR-001 (Clerk authentication), ADR-002 (SQL Server), ADR-006 (Monorepo layout), ADR-008 (Object storage abstraction), ADR-010 (Cross-app navigation & session boundaries)

## Context

The original plan targeted Vercel for deployment. The user has since directed that **the deployment platform be deferred** and that the app be packaged in a way that keeps production options open. The stack is also now **two Next.js front ends** (ADR-006):

- **`apps/portal`** — Client Portal (port 3000 locally).
- **`apps/admin`** — Tax Portal (port 3001 locally).

Packaging concerns:

- **DB gravity.** SQL Server (ADR-002) is not Vercel-native. Co-location with whatever host we pick at Phase 5 matters for latency — for **both** apps equally.
- **SSE realtime.** Notifications use Server-Sent Events for v1 (Tier-2 realtime ADR, deferred). SSE is a long-lived HTTP connection; Vercel's serverless function model violates the SSE contract. Both apps need SSE-capable ingress.
- **Storage adapter.** Object storage is abstracted (ADR-008). Both apps bind the same adapter.
- **Optionality.** The user asked the stack stay open to Azure Container Apps, Azure App Service, Fly.io, Render, Railway, self-hosted Docker/K3s, AWS App Runner, GCP Cloud Run.
- **Two-app split.** Each app has its own audience, change velocity, attack surface, and operational profile (see ADR-006). Packaging must let them deploy, scale, and be monitored independently.

The constraint set: **package each app as its own portable OCI container image, hold no assumptions about the host, and defer the deployment decision to Phase 5.**

## Decision

**Two OCI container images — one per app — built from per-app Dockerfiles. No Vercel-specific APIs, no platform-specific filesystem assumptions, long-lived Node process, explicit health endpoints on each app independently. The production deployment target is deferred to Phase 5 and constrained by the host-capability list below.**

### Why two images, not one

- **Independent deploy cadence.** A client-side copy fix ships without touching admin. An admin-only dashboard change doesn't redeploy portal.
- **Independent blast radius.** An image-level vulnerability in one app's dependencies (e.g., a CVE in a dashboard-only chart library) doesn't force a redeploy of the other app's image.
- **Different scaling profiles.** Portal may face spiky public traffic; admin is single-user (the accountant). Scaling rules can differ. A single-image deploy would have to scale both together.
- **Different ingress policies.** Admin may sit behind a restricted allow-list or VPN in production; portal is public. Two images let the ingress layer treat them as distinct workloads.
- **Per-image size and dependency audit.** Admin doesn't need portal-only libraries and vice versa. Each Dockerfile installs only what its app needs. Tree-shaking at the image level.
- **Per-image health probe granularity.** Host can kill a crashed portal without touching admin.
- **Rebuilds on package changes.** When `packages/ui` or `packages/db` changes, both images rebuild — the build system treats them as two separate pipelines sharing upstream dependencies. The cost is two builds; the gain is everything above.

A single-image-with-two-entrypoints variant was considered and rejected (see Alternatives).

### Image shape (per app)

Two Dockerfiles, one per app: `apps/portal/Dockerfile` and `apps/admin/Dockerfile`. Each is multi-stage:

- **Stage 1 — `deps`** — `node:20-alpine` base, `pnpm install --frozen-lockfile` with workspace + only this app's runtime deps resolved.
- **Stage 2 — `builder`** — `node:20-alpine`, full install, `pnpm --filter <app> build`. Produces `apps/<app>/.next/` standalone output (`output: 'standalone'` in each app's `next.config.mjs`).
- **Stage 3 — `runner`** — `node:20-alpine`, non-root user (`node`), copies `standalone/`, `static/`, `public/`, and the Prisma client (from `packages/db`). `CMD ["node", "apps/<app>/server.js"]`.

Packages consumed by the app (`packages/db`, `packages/storage`, `packages/ui`, `packages/emails`) are included via pnpm's standalone output flattening — Next.js `output: 'standalone'` handles workspace resolution as long as `next.config.mjs` sets `outputFileTracingRoot` to the repo root. Each image embeds a snapshot of the packages it needs; changing `packages/ui` rebuilds both images (enforced by the CI dependency graph).

Constraints (per image):

- **Base:** `node:20-alpine` unless a dependency demands glibc. Both are deploy-agnostic.
- **Size target:** final runner stage < 300 MB per image. Enforced via a CI size check per image.
- **Non-root:** `USER node` in the runner stage.
- **Signals:** Node receives `SIGTERM` and shuts down cleanly via the Next.js standalone server's built-in handler. SSE streams drain with a 30-second budget.
- **Reproducibility:** images built from a known lockfile. Secrets never baked.
- **Image tags:** `portal:<sha>` and `admin:<sha>` — separate tags in the same registry. A release tag (`portal:v0.1.0`, `admin:v0.1.0`) is applied on tagged commits.

### Long-lived Node process — same rules, both apps

The rules from the prior ADR apply to each app:

- `export const runtime = 'edge'` not used in either app.
- No `@vercel/*` SDKs imported in either app.
- In-memory state (SSE subscriber lists, rate-limiter counters) lives in the process for v1. If either app ever scales to >1 replica, state moves to SQL Server or an external store. For v1, the single-process assumption is documented per-app.
- Scheduled jobs run via container-platform cron, not in-app `setInterval`. The cron entrypoint is `scripts/run-cron.ts` and runs as its own workload — it is **not** bundled into either app's image. A third OCI artifact — the cron image — may land as a dedicated `apps/cron` or a standalone `scripts/run-cron` image at the point Phase 5 picks a host. For Epic 001, the decision is simply "not baked into portal or admin image."

### Health endpoints — per app, independent

**Each app** hosts its own health endpoints. They are not shared, not proxied, and not fanned out:

- **`apps/portal` — `GET /healthz`** — liveness for the portal process. Returns 200 as long as the Node process is responsive.
- **`apps/portal` — `GET /readyz`** — readiness for the portal process. Returns 200 when startup complete, admin DB pool verified, storage adapter ready. 503 otherwise.
- **`apps/admin` — `GET /healthz`** — liveness for the admin process. Identical contract, scoped to the admin process.
- **`apps/admin` — `GET /readyz`** — readiness for the admin process. Identical contract, scoped to the admin process.

A failing `/readyz` on one app does **not** affect the other. This is the point of the two-image split — independent health.

Shared dependencies (DB, storage, Clerk API reachability) are checked independently per app; a DB outage presents as `/readyz` 503 on **both** apps simultaneously but each app reports its own state. Neither app aggregates the other's health — the orchestrator aggregates.

Smoke test (`scripts/smoke-test.sh`) probes both sets of endpoints. Container smoke passes only when both apps are healthy.

### No platform-specific filesystem assumptions (unchanged)

Same rules as prior ADR, applied to both apps:

- No local file writes beyond `/tmp`.
- Uploads go to the storage adapter (ADR-008), never the local filesystem.
- Logs to stdout/stderr.
- No SQLite driver in prod — SQL Server only.
- No `/proc`, `/sys`, or cgroup scraping.

### Host capability list — Phase 5 shortlist (revised for two apps)

The eligible host must support **all** of the following **for both apps as distinct workloads**:

1. **Two OCI container images, independently scheduled.** Either two workloads on the same platform (e.g., two Azure Container Apps in one environment) or two projects within the platform (e.g., two Render services). The platform must not require bundling into one artifact.
2. **Long-lived Node processes.** No per-request function lifecycle, no cold-start-per-hit pattern, no 30-second hard request timeout.
3. **Persistent outbound + inbound HTTPS, per app.** Outbound for Clerk API, storage adapter, email provider, Docuseal. Inbound for user traffic + webhooks (Clerk webhook lands on portal per ADR-001; Docuseal webhook per eventual ADR).
4. **Persistent storage via an external adapter.** Shared across both apps — both bind the same `FileStorage` implementation.
5. **Custom-domain ingress + TLS, per app.** The two apps need two ingress routes. Options:
   - Two subdomains of one apex (e.g., `portal.firmname.com` + `tax.firmname.com`). **Flagged to user** — see § Production domain question.
   - One apex with path-based split (e.g., `portal.firmname.com/` + `portal.firmname.com/admin/`). Requires an ingress proxy or load balancer that routes by path to the right workload. Has Clerk allowed-origins and cookie-scoping implications.
   - Two separate apexes. Possible but awkward for cookie-sharing with Clerk.
6. **SSE-compatible ingress on both routes.** No 30-second idle timeout, no forced response buffering.
7. **Secret management, injectable per workload.** Shared secrets (Clerk keys, DB URLs) appear in both apps' env; app-specific secrets (if any) appear only where needed.
8. **Health-probe integration, per workload.** Both apps probed independently via `/healthz` + `/readyz`.
9. **Scheduled jobs.** Separate cron workload, not bundled into either app image.

### Eligible at Phase 5 (unchanged list, constraint count ticked up)

All candidates from the prior ADR remain eligible — Azure Container Apps, Azure App Service (Linux containers), Fly.io, Render, Railway, self-hosted Docker/K3s, AWS App Runner, GCP Cloud Run (with SSE caveat). The two-image split slightly favors platforms with strong multi-workload ergonomics (ACA's "environment" abstraction with multiple apps per environment is a natural fit; Fly.io's multi-app-per-org model is similar).

Hosts that **cannot** schedule two independent long-lived workloads under one account / environment are deprioritized but not removed from consideration. In practice this is a non-issue — every candidate on the list handles multi-workload trivially.

### Ineligible at Phase 5 (unchanged)

Vercel serverless functions, Cloudflare Workers-only, AWS Lambda-only. Reasons unchanged from prior ADR. The two-image split does not rescue any of these — each would simply be ineligible twice.

### Preview-per-PR — nice-to-have (unchanged)

If the Phase 5 host offers per-PR previews, both apps get them. Epic 001 CI does not include preview-per-PR.

### Dev vs prod container parity

Local dev uses `docker-compose.yml` at the repo root. It now brings up **both** app services:

- **SQL Server 2022 Developer** — ADR-002.
- **Azurite** — ADR-008.
- **`portal` container** — built from `apps/portal/Dockerfile`, exposed on `localhost:3000`.
- **`admin` container** — built from `apps/admin/Dockerfile`, exposed on `localhost:3001`.
- **Docuseal + Postgres** — added at Epic 003.
- **Mail catcher** — Mailhog or Inbucket, added when email flows land.

Developer mode (`pnpm dev:portal` and `pnpm dev:admin` outside containers) is also supported for fast iteration. Container mode exists to validate the actual deployment artifact — same images, same entrypoints, same health probes, both apps together.

A composite dev command `pnpm dev` runs both apps' dev servers concurrently on ports 3000 and 3001.

## Alternatives considered

### Single image with two entrypoints

One Dockerfile produces one image; a launch-time env var (`APP_TARGET=portal` or `APP_TARGET=admin`) selects which entrypoint Node runs. Rejected:

- **Bundles both apps' dependencies into a single image.** Image size inflates (portal-only and admin-only dep sets sum). Attack surface includes both apps' transitive deps regardless of which entrypoint is active.
- **Couples deploy cadence.** A hotfix to portal rebuilds the same image admin will receive on next deploy. Image-level change detection loses its meaning.
- **Complicates health endpoints.** One image means either one process (running both apps — wrong, the whole point is separation) or two processes (running together — which then runs into port conflicts and defeats the health-probe granularity).
- **Environment-variable entrypoints are fragile.** A misconfig sends the wrong app to the wrong ingress. The blast radius is a whole deploy, not a misrouted request.
- **Cancels most of ADR-006's reasoning.** If the images are one, why are the apps two?

The only argument for it is "one less CI job." Not persuasive.

### One image with multi-process manager (supervisord, pm2)

Run both apps inside one container via a process manager. Rejected:

- Violates the "one process per container" Docker convention.
- Shared log stream conflates two apps' output.
- Scaling decisions apply to both apps as one unit, which is the opposite of what we want.
- Host health-probe semantics break — one `/healthz` for two processes can't report partial failure cleanly.
- No host on the shortlist requires this model; many disallow it implicitly by assuming one process per container.

### Stay with Vercel, one project per app

Two Vercel projects (`portal.firmname.com`, `tax.firmname.com`). Rejected for the same reason as the prior ADR — Vercel's serverless function timeouts break SSE regardless of how many projects we create. Two projects would just double the Vercel-gravity import we're avoiding.

### Different base images per app (e.g., Alpine for portal, Debian-slim for admin)

Possible if one app has a specific native-dep requirement. Rejected as default — both apps run the same JS stack and should share the base image for consistency. Will revisit per-app if a real dependency split forces it.

### Shared `builder` stage across the two Dockerfiles

Technically feasible via Docker BuildKit with a shared intermediate. Attractive for CI speed. Deferred — adds complexity not needed until build times prove painful. The naive two-Dockerfile approach runs in parallel in CI and is fast enough.

## Consequences

- **Two artifacts, two deploy units.** A portal deploy is a one-image push. An admin deploy is a one-image push. They are independent.
- **Smoke test exercises both.** `scripts/smoke-test.sh` starts the compose stack, waits for both apps' `/readyz` to go green, runs smoke specs against both. One app failing fails the gate.
- **CI builds both images per PR.** When only one app's code changes, CI still builds both (the shared `packages/*` makes the minimal-build detection complex for the payoff). If build times become painful, a later optimization detects which app is affected. For Epic 001, build both.
- **Image registry holds two image streams.** Registry naming convention: `<registry>/tax-portal-portal:<tag>` and `<registry>/tax-portal-admin:<tag>`. The Phase-5 host pulls both from the same registry.
- **Operational docs.** `docs/operations/inventory.md` lists two workloads, two health-probe URLs, two scaling configs. `docs/operations/runbook.md` covers deploying one, the other, or both.
- **SSE works on both.** The host capability list has SSE as a non-negotiable. Realtime lands per app without a platform conversation.
- **Phase 5 is still one decision point.** The deploy ADR (future) picks one host that can schedule both workloads. The capability list is drawn.
- **Health endpoints are required from day one on both apps.** Every platform needs them.
- **Single-process assumption per app.** Each app is one process in v1. If either scales to >1 replica, the state migration story applies to that app only — not both.
- **The cron workload is a third image (future).** When cron needs land (Epic 004 or 005), the entry point `scripts/run-cron.ts` ships as a separate image that the Phase-5 host schedules as a cron workload. Not Epic 001's problem.

## Related

- **ADR-001** — Clerk authentication; defines where the webhook endpoint lives (portal) and how sessions span the two apps.
- **ADR-002** — SQL Server; both apps connect to the same DB.
- **ADR-006** — Monorepo layout; defines the two-app structure that produces the two Dockerfiles.
- **ADR-008** — Object storage; both apps bind the same adapter.
- **ADR-010** — Cross-app navigation & session boundaries; how users flow between the two hosts.
- **SRS** — REQ-NFR-003, REQ-NFR-004 (tech stack, being generalised by RA), REQ-IDNT-001 (custom domain), REQ-MSG-012 (real-time delivery — deferred Tier-2 ADR).
- **ADR-005 / ADR-020** — security non-negotiable; two images + two ingress routes + non-root runner supports per-app hardening.
