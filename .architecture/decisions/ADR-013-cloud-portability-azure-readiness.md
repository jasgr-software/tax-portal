---
id: ADR-013
title: Cloud-portability discipline + Azure-cheapest default (refines ADR-007)
status: Accepted
date: 2026-06-14
deciders: [Architecture Agent, user]
related: [ADR-001, ADR-002, ADR-003, ADR-005, ADR-006, ADR-007, ADR-008, ADR-009, ADR-020]
source:
  - seed/intake.md#delivery--operations-philosophy
  - decisions/ADR-007-container-packaging-deploy-agnostic.md
open_decisions: []   # OD-001 is a Phase-5 tuning disposition with a proposed default — it does not block this decision
---

# ADR-013: Cloud-portability discipline + Azure-cheapest default (refines ADR-007)

**Status:** Accepted
**Date:** 2026-06-14
**Deciders:** Architecture Agent (with user direction)
**Related:** ADR-007 (refines its host-capability list), ADR-001, ADR-002, ADR-003, ADR-005, ADR-006, ADR-008, ADR-009, ADR-020 (encryption / security posture)

## Context

ADR-007 packages each app as a portable OCI image, holds no assumptions about the host, defines a host-capability list, and **defers** the production-platform decision to Phase 5. This ADR is the **addendum the user asked for**: it does not pick a platform and does not reverse ADR-007's deferral. It refines and extends ADR-007's posture with an explicit **cloud-portability + Azure-readiness layer** that governs *implementation choices made now*, before the platform is chosen.

The directive: **stay deployment-platform-neutral now (no Azure lock-in yet), but deliberately bias every architecture choice so an eventual Azure deployment is the cheapest, best-performing, lowest-friction option.** This needs to be a written standard because the bias is decided per-concern, in code and config, long before Phase 5 — once a proprietary touchpoint leaks into a route handler, neutrality is already lost.

**The key insight that makes this cheap to honor:** for *this* workload the cheapest Azure options are also the least proprietary. A solo-accountant portal is tiny, bursty, and idle most of the day — it favors scale-to-zero / auto-pause services, and Azure's scale-to-zero offerings (Container Apps, SQL Database Serverless, Blob Storage) happen to be the container-native, standards-shaped ones rather than the proprietary always-on ones. So **"cheapest Azure" and "lowest lock-in" point at the same target.** We are not trading portability for cost; the same choices win both.

This must respect: the security posture (ADR-005 RLS trust boundary + ADR-020 encryption), the SQL Server trust boundary (ADR-002/003/005), the storage abstraction and signed-URL seam (ADR-008/009), and ADR-007's existing host-capability list (which this strengthens, not replaces).

## Decision

**We will target a capability contract, default every implementation to the Azure-cheapest option that satisfies it, and keep each cloud touchpoint behind a port (an interface) we can swap.** Concretely:

1. **The capability contract is authoritative; the Azure resolution is the default, not a commitment.** ADR-007's host-capability list defines *what the host must provide*. For each capability we record the **Azure-cheapest resolution** as the default target so design decisions have a concrete reference — but no code may depend on that resolution being Azure. The Phase-5 platform decision stays open.

2. **Every cloud touchpoint sits behind a port.** Storage, signed-URL minting, email send, and realtime transport are accessed through interfaces (existing or small new ones), never via a provider SDK called directly from a route handler, server action, or component. Swapping the Azure impl for another provider must be a single adapter change.

3. **No proprietary runtime or platform SDK in app code.** No `export const runtime = 'edge'`, no `@vercel/*`, no Azure Functions programming model, no Azure SignalR/Web PubSub client, no Azure Key Vault SDK, no Azure Communication Services SDK imported into either app (`apps/portal`, `apps/admin`) or shared `packages/*`. The platform is reached through env vars and portable interfaces only.

### Per-concern resolution

| Concern | Portability rule (binding now) | Azure-cheapest resolution (default target) | Governing ADR(s) |
|---|---|---|---|
| **Compute** | Container-first; long-lived Node process; no edge runtime, no `@vercel/*`, no Functions-specific programming model. | **Azure Container Apps** — container-native, scales to zero. | ADR-006, ADR-007 |
| **Database** | Write to the **intersection of box SQL Server 2022 ∩ Azure SQL Database** (see § Database intersection rule). | **Azure SQL Database Serverless (auto-pause)** — note ~30–60s cold-start on resume (see Consequences). | ADR-002, ADR-003, ADR-005 |
| **File storage** | Keep the `FileStorage` port (ADR-008). `signUrl()` stays behind the interface — never let SAS-vs-presigned URL shape leak into routes (ADR-009). | **Azure Blob Storage** — cool/archive tiers for the 7-year retention obligation. | ADR-008, ADR-009 |
| **Auth** | Clerk is third-party SaaS, already platform-neutral — a portability win. **Do not** consolidate onto an Azure-native identity service. | Clerk (unchanged). | ADR-001 |
| **Config & secrets** | 12-factor: read everything from env vars. **Do not** import a cloud secrets SDK (e.g. Azure Key Vault SDK); the platform injects secrets into env. | Azure injects secrets into the container env (Container Apps secrets / Key Vault reference at the platform layer, not in app code). | ADR-007 |
| **Realtime** | App-hosted SSE/WebSockets (already the ADR-007 posture). **Not** a proprietary service (Azure SignalR / Web PubSub). | Self-hosted SSE on the container; no managed realtime service. | ADR-007 |
| **Scheduled jobs** | External cron hitting an authenticated endpoint, or a container cron workload (ADR-007's separate cron image). **Not** Azure Functions Timer triggers baked into the app. | Container cron workload (the deferred third image, ADR-007) or platform scheduler hitting an authenticated endpoint. | ADR-007 |
| **Email** | SMTP, or a provider SDK (Resend / SendGrid) behind a small interface. **Not** Azure Communication Services called directly. | SMTP or provider SDK behind the email port. | — (digest-only email per REQ-MSG-007) |

### Database intersection rule

The SQL Server engine is portable (box / container / AWS RDS / GCP Cloud SQL / Azure SQL Database) — **the lock-in risk is *features*, not the engine.** Therefore the schema and raw-SQL tracks (ADR-002, ADR-004) must use only features in the **box SQL Server 2022 ∩ Azure SQL Database** intersection:

- **In the intersection — allowed, already in use:** RLS Security Policies (filter + block predicates, ADR-005), `SESSION_CONTEXT` (ADR-003), temporal tables, filtered indexes. Our existing identity-propagation and RLS design is already on the safe side of this line.
- **Box-only — avoid (Azure SQL Database lacks or restricts):** cross-database queries, SQL Agent jobs, CLR, FILESTREAM, linked servers. Scheduled work goes to the cron workload (above), not SQL Agent. Cross-database joins are out — single database. No CLR, no FILESTREAM, no linked servers.

This is a refinement of ADR-002/003/005, not a new database decision — it draws the portability boundary those ADRs implicitly already sit inside.

### What this does not do

- It does **not** pick a platform — Phase 5 still owns that (ADR-007).
- It does **not** add an Azure dependency to the build or to either app's runtime.
- It does **not** narrow ADR-007's eligible-host list — every host there still satisfies the capability contract; Azure Container Apps is simply named as the cheapest default to design toward.

## Consequences

- **Neutral-but-biased posture is now a written standard** reviewers can cite. Deviation reviews enforce **this ADR's cloud-portability discipline**: a route that imports a provider SDK directly, an edge-runtime export, a box-only SQL feature, or a managed-realtime/secrets/email-SDK dependency is a finding.
- **Cheap and portable are the same target here** — honoring the bias costs us nothing in lock-in. The discipline is "don't reach for the always-on proprietary option," which is also the more expensive option for a bursty idle workload.
- **Cold-start caveat is now on the record.** Azure SQL Database Serverless auto-pause adds ~30–60s on first query after idle. For a public, anonymous front-door page (the engagement-request form) this is a real UX risk. Disposition is logged as **OD-001** with a proposed default; it does not block this ADR.
- **The intersection rule constrains future DB work.** Anyone reaching for SQL Agent, cross-database queries, CLR, FILESTREAM, or linked servers must instead use the portable alternative (cron workload, single-DB design) or open a new ADR to accept the lock-in.
- **Every new cloud touchpoint must arrive behind a port.** Adding a new external dependency (e.g. a future analytics or search service) inherits this rule: interface first, provider SDK behind it.
- **No new operational burden from Azure today** — there is nothing Azure-specific to run. The bias lives entirely in what we *avoid*, so the deferral (ADR-007) is fully preserved.

## Alternatives considered

- **Pick Azure now (commit the platform).** Rejected — directly contradicts the user's directive and ADR-007's Phase-5 deferral. Premature for a v1 with no host pressure yet.
- **Stay purely neutral with no preferred default.** Rejected — leaves every per-concern choice un-anchored, so implementers pick arbitrarily and portability erodes by accident. Naming the Azure-cheapest resolution gives a concrete design target without taking on a dependency.
- **Bias toward a different cloud (AWS / GCP) or self-host.** Rejected as the *default* — the user's stated probable destination is Azure, and the workload's scale-to-zero shape maps cleanly onto Azure's cheapest tier. The portability discipline still keeps AWS/GCP/self-host fully open (every one remains on ADR-007's eligible list); we simply design toward the most likely target.
- **Capture this only as a durable principle, not a full ADR.** Rejected — the principle is durable, but the *specific, refutable* choices (ACA as compute default, the SQL intersection rule, the lock-in-trap list, the cold-start caveat) are decision-shaped and need a supersedable record. This ADR both states the durable cloud-portability discipline and records those refutable choices.
- **Edit ADR-007 in place to fold this in.** Rejected — ADRs are immutable in this layer. This is a separate, later refinement that `related:`-links ADR-007 rather than rewriting it.
