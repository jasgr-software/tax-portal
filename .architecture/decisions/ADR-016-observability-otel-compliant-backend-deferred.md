---
id: ADR-016
title: Observability — OpenTelemetry-compliant instrumentation, backend/vendor deferred
status: Accepted   # OTel-compliant, tool-deferred. The telemetry-data-redaction aspect was carved out as OD-003; OD-003 is now RESOLVED — the ratified data-handling policy is ADR-017.
date: 2026-06-14
deciders: [Architecture Agent, user]
related: [ADR-003, ADR-004, ADR-005, ADR-006, ADR-007, ADR-013, ADR-014, ADR-017, TENET-001, TENET-008]
source:
  - architecture-dispatch-2026-06-14#observability-otel-compliant-tool-deferred   # user directive: "should not decide the observability tool now but should be OTel compliant"
  - decisions/ADR-007-container-packaging-deploy-agnostic.md   # logs to stdout/stderr; long-lived Node process; SSE; defer-but-constrain shape; cron as own workload
  - decisions/ADR-013-cloud-portability-azure-readiness.md   # cloud-neutral, Azure-cheapest default; per-concern port discipline
  - decisions/ADR-006-monorepo-layout.md   # two front ends + future cron workload
  - decisions/ADR-003-identity-propagation-session-context.md   # request context / AsyncLocalStorage; identity correlation
  - decisions/ADR-004-orm-prisma-single-track.md   # Prisma middleware adds Clerk user id as a log field; "must not go to third-party log stores without redaction"
open_decisions: []   # OD-003 (telemetry data-redaction policy) was the escalation carve-out blocking the telemetry-data-policy aspect; RESOLVED 2026-06-14 — ratified as ADR-017. Nothing now blocks this ADR.
---

# ADR-016: Observability — OpenTelemetry-compliant instrumentation, backend/vendor deferred

**Status:** Accepted. The telemetry-data-redaction policy aspect was carved out as OD-003 (no default; user sign-off required); **OD-003 is now resolved and the ratified data-handling policy is ADR-017** — see § The telemetry-data policy is a carve-out.
**Date:** 2026-06-14
**Deciders:** Architecture Agent (with user direction)
**Related:** ADR-003 (request context / identity correlation), ADR-004 (Prisma log field, third-party-store caution), ADR-005 (RLS trust boundary), ADR-006 (two front ends + cron), ADR-007 (stdout logs / long-lived process / SSE / defer-but-constrain), ADR-013 (cloud-neutral, Azure-cheapest default), ADR-014 (Next.js/TypeScript host), ADR-017 (telemetry data-handling policy — resolves the OD-003 carve-out below); TENET-001 (security non-negotiable), TENET-008 (no proprietary lock-in)

## Context

The portal currently logs to stdout/stderr (ADR-007) and the Prisma middleware tags query logs with the Clerk user id (ADR-004), but there is **no recorded decision about observability as a whole** — no instrumentation standard, no telemetry-export contract, no statement of which backend (if any) receives traces/metrics/logs. The gap invites two failure modes: a developer reaching for a vendor agent (Datadog/New Relic/App Insights) and baking its SDK into app code, or ad-hoc `console.log` instrumentation that no later backend can ingest cleanly.

The user's directive: **"We should not decide on the observability tool now, but should be OTel compliant."** This is the same **defer-but-constrain** posture the project already uses twice — ADR-007 (deployment platform deferred, capability contract defined) and ADR-015 (visual design deferred, foundation locked). This ADR applies that shape to observability: **lock the instrumentation standard now, defer the backend/vendor, and write down the capability contract the eventual backend must satisfy.**

The constraints this must respect:

- **TENET-008 / ADR-013 — no proprietary lock-in, Azure-cheapest default.** Observability is the operability analog of the cloud-portability discipline: instrument through an open standard, keep the backend swappable, and pick the cheapest Azure-compatible default *only at deploy time*. Azure Monitor / Application Insights ingests OTLP, so OTel-compliance keeps it as a cheap default without coupling to it.
- **ADR-007 — logs to stdout/stderr; long-lived Node process; SSE; cron as its own workload.** Whatever we decide must not contradict the stdout log contract, must handle long-lived SSE connections, and must treat the future cron image as its own telemetry-emitting workload.
- **ADR-006 — two front ends (`apps/portal`, `apps/admin`) plus a future cron workload.** Each is an independent deploy unit and must be independently attributable in telemetry.
- **ADR-003 / ADR-004 — identity is propagated via request context and already lands as a log field.** Telemetry correlation should ride that same request context.
- **TENET-001 / ADR-005 — this is a tax portal behind an RLS trust boundary, handling SSNs, tax documents, and financial data.** *What* telemetry is permitted to capture is a security-posture and data-handling question. ADR-004 already records the warning: the Clerk-user-id-tagged query logs are "Sensitive — must not go to third-party log stores without redaction." That warning has never been turned into a policy. **This is an escalation carve-out — see § The telemetry-data policy is a carve-out.**

Scope is **how, not what**: this decides the instrumentation technology and the export contract, not any product behavior or any monitoring/alerting requirement (those, if they arise, belong to the requirements layer).

## Decision

**We will instrument both front ends and the cron workload via OpenTelemetry (the OTel SDK/APIs) for all three signals — traces, metrics, and logs — and export them via OTLP to a configurable endpoint. The observability backend/vendor is deferred (Phase-5-style, like the deployment host); the eventual backend is constrained by the capability contract below. No vendor-proprietary observability agent or SDK may be imported into app code.**

### 1. Decide now — OpenTelemetry is the instrumentation standard

- **OTel SDK/APIs are the only instrumentation API.** Application code (both apps, shared `packages/*`, and the cron workload) emits telemetry through the OpenTelemetry SDK/APIs — never through a vendor-proprietary client. This is the observability analog of ADR-013's "no `@vercel/*`, no provider SDK in a route handler": **no `dd-trace`, no `newrelic`, no `applicationinsights`/`@azure/monitor-opentelemetry`'s proprietary surface, no other vendor agent in app code.** A vendor SDK import in `apps/**` or `packages/**` is a deviation finding.
- **All three signals.** Traces, metrics, and logs are all OTel-modeled. Logs are emitted as OTel-log-compatible **structured (JSON) records** — see § Reconcile with the stdout log contract. We do not adopt distributed tracing while leaving logs as unstructured `console.log`; the three signals are one instrumentation surface.
- **Export via OTLP to a configurable endpoint.** The SDK exports over **OTLP** (gRPC or HTTP/protobuf) to an endpoint supplied entirely by environment variables (`OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_EXPORTER_OTLP_HEADERS`, `OTEL_SERVICE_NAME`, etc. — the standard OTel env contract). No endpoint, credential, or backend identity is hard-coded. When no endpoint is configured (e.g. local dev), the exporter is a no-op / console exporter; instrumentation never fails the app.
- **A single instrumentation bootstrap, shared.** The SDK setup (resource attributes, exporters, propagators, sampling config) lives in **one shared place** — a `packages/observability` (or equivalent) bootstrap that each app and the cron entrypoint initialize once at process start. This keeps the standard uniform and the surface a single swappable seam, exactly as ADR-013 keeps each cloud touchpoint behind one port. **(Code task — flagged for a developer, not written here.)**

### 2. Defer the backend/vendor — capability contract (Phase-5-style)

The observability **backend/vendor is not decided here**, exactly as ADR-007 defers the deployment host. The eventual backend must satisfy this **capability contract**:

1. **Ingest OTLP for all three signals** — traces, metrics, and logs over OTLP (gRPC and/or HTTP/protobuf). This is the non-negotiable: the app speaks OTLP and nothing else.
2. **Correlate the three signals** — trace ⇄ span ⇄ log linkage via the standard OTel trace/span IDs, so a log line can be tied to its trace and a trace to its metrics.
3. **Honor OTel resource attributes** — at minimum distinguish workloads by `service.name` (see § Two front ends + cron) and respect `service.version` / `deployment.environment`.
4. **Retain telemetry for an operationally-useful window** — long enough to debug an incident; the exact retention is a deploy-time + data-policy concern. **Now set by [ADR-017](./ADR-017-telemetry-data-handling-policy.md): configurable, default 7 days** — a capability the eventual backend/Collector must support, plus a deploy-time default. (The *sensitive-data* dimension was the OD-003 carve-out, now ratified in ADR-017.)
5. **Support sampling configured at the app/collector layer** — the backend must not require app code to know its sampling model; sampling is set via OTel config / the collector.

An **OTel Collector may sit between the app and the backend** as a deployment-time component (receive OTLP from the app, batch/filter/route to one or more backends). The app only ever needs to speak OTLP to a single configurable endpoint — whether that endpoint is a collector or the backend directly is a **deploy-time concern, deferred to the Phase-5 host decision** (ADR-007). The collector is *also* the natural place to enforce egress-side redaction once OD-003 is resolved (a redaction processor), which is why the app-side contract stays simple.

**Azure-cheapest default target (not a commitment):** Azure Monitor / Application Insights ingests OTLP and is the cheap default to design toward, consistent with ADR-013's per-concern resolution table — but no code depends on it; swapping to Grafana/Tempo/Loki, Honeycomb, Jaeger+Prometheus, or any OTLP backend is a config change, not a code change. This is a seed-owner follow-up: an **Observability row** citing this ADR is owed in `seed/tech-stack.md`.

### 3. Reconcile with existing decisions

- **stdout/stderr log contract (ADR-007) is preserved.** Logs stay **structured JSON to stdout/stderr** — no change to the stdout contract. The OTel log signal is satisfied either by the OTel log SDK emitting structured records, or by stdout JSON logs scraped/parsed at the collector/platform layer into OTLP. Either way the app still writes to stdout (ADR-007), the records are now structured and OTel-log-compatible, and no log file or proprietary log shipper is introduced into app code.
- **Two front ends + cron (ADR-006/007) each emit their own telemetry** distinguished by `service.name` — `tax-portal-portal`, `tax-portal-admin`, `tax-portal-cron`. Telemetry is independent per workload, matching the two-image / separate-cron-workload rationale: one app's telemetry volume or outage does not implicate the other's. Each sets its own OTel resource attributes in the shared bootstrap.
- **SSE long-lived connections (ADR-007).** Instrumentation must not break on long-lived `text/event-stream` connections: a long-lived SSE `GET` must **not** be modeled as one ever-open span that never closes (it would distort latency metrics and leak span memory). The convention is to span the *connection-establishment* and individual *event-emission* operations rather than wrapping the whole stream in a single span, and to keep SSE connection counts as a metric rather than a trace. **(Convention to be made concrete in the bootstrap — flagged for a developer.)**
- **Identity correlation (ADR-003/004) rides the request context.** Telemetry is correlated to the request and principal via the same `AsyncLocalStorage` request context that carries identity for `SESSION_CONTEXT` (ADR-003) and that ADR-004's Prisma middleware already reads to tag the Clerk user id. Trace/log correlation by request id + principal reuses that seam — **subject to the redaction policy now ratified in [ADR-017](./ADR-017-telemetry-data-handling-policy.md)** (originally the OD-003 carve-out), because the principal identifier is itself sensitive (ADR-004's "must not go to third-party log stores without redaction"). Per ADR-017, the principal identifier appears in exported telemetry only as an **HMAC-hashed correlation id**, never raw; the raw Clerk user id stays in-process for `SESSION_CONTEXT`/RLS.

### The telemetry-data policy is a carve-out (NOT decided here — OD-003, now resolved by ADR-017)

> **Update (2026-06-14): OD-003 is resolved. The ratified telemetry data-handling policy is [ADR-017](./ADR-017-telemetry-data-handling-policy.md).** This section records what was carved out at authoring time and remains accurate as history; the open questions below are now **answered by ADR-017** (no PII in any signal; SQL statement shapes only — bound values redacted; no request/response bodies or document contents; the principal identifier is HMAC-hashed, never raw; redaction enforced **at the source, in-process, before OTLP export**; retention configurable, default 7 days). The "conservative holding posture" referenced below is **superseded** by ADR-017 as the now-decided policy. ADR-016's own decision is unchanged.

**What telemetry is permitted to capture is a security-posture + data-handling decision and is escalated to the user with NO default.** Per AGENT.md §2, security posture, data retention, and the trust boundary are escalation carve-outs the Architecture Agent must not self-resolve. For a tax portal behind the RLS trust boundary (ADR-005, TENET-001), the load-bearing unresolved questions are:

- Whether PII / sensitive values may appear in **trace attributes, span names, log fields, exception/stack payloads**;
- Whether **SQL parameter values** (ADR-004's query logs) may be captured, or only parameterized statement shapes;
- Whether **request/response bodies** (intake answers, message contents, document metadata or contents) may be captured;
- Whether the **Clerk user id / principal identifier** may be exported as a correlation field, or must be hashed/pseudonymized/dropped before egress;
- The **redaction/scrubbing boundary** — enforced in app code, at the collector, or both — and the **retention** of whatever sensitive telemetry is permitted.

This was recorded as **OD-003 with no proposed default** and originally blocked the telemetry-data-redaction-policy aspect of this ADR. The carve-out was **isolated to the data-policy aspect**: the core decision — OTel-compliant instrumentation, three signals, OTLP export, deferred backend, no vendor SDK in app code — was always **Accepted** and unblocked, because it could be implemented without resolving what sensitive data may be captured. **OD-003 is now resolved: the decided policy is [ADR-017](./ADR-017-telemetry-data-handling-policy.md)** (no PII in any signal; HMAC-hashed correlation ids; redact-at-source before OTLP export; configurable retention, 7-day default). The earlier "capture no PII / structural data only" holding posture is now the floor of that ratified policy rather than an interim stopgap; ADR-017 carries the full data-handling content.

### Enforcement is a developer task (flagged, not written here)

The Architecture Agent does not write code. The following are flagged for `[webapp-developer]`:

- **Instrumentation bootstrap** — a shared `packages/observability` (or equivalent) OTel SDK setup: resource attributes per workload (`service.name` portal/admin/cron), OTLP exporter wired to the standard `OTEL_*` env vars, propagators, sampling config, and the SSE-aware span/metric conventions above. Initialized once per process at startup.
- **OTLP env-var config** — `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_EXPORTER_OTLP_HEADERS`, `OTEL_SERVICE_NAME`, `OTEL_RESOURCE_ATTRIBUTES`, etc., added to `.env.example` and the operations inventory; absent-endpoint = no-op exporter.
- **ESLint rule banning vendor observability SDK imports** — extend `packages/eslint-config` (alongside the ADR-013/ADR-014 provider-SDK and edge-runtime bans) to flag imports of `dd-trace`, `newrelic`, `applicationinsights`, and other vendor agents in `apps/**` and `packages/**`. Until it lands, the ban is enforced by review against this ADR.
- **Redaction implementation** — **OD-003 is now resolved (ADR-017); this is unblocked.** Per ADR-017 the boundary is an **in-app OTel span/log processor** in the shared bootstrap that drops PII attributes and HMAC-hashes the correlation id **before OTLP export** (redact-at-source), plus the distinct HMAC-secret env var and the configurable-retention default. A developer task.

## Consequences

- **Observability is now a citable standard.** A change that imports a vendor observability agent into app code, hard-codes a backend endpoint, instruments with raw `console.log` instead of the OTel log signal, or wraps an SSE stream in a single never-closing span is a **deviation finding** (against this ADR, and TENET-008 for the vendor-SDK case).
- **The backend stays genuinely deferred.** Like ADR-007's deployment host, the vendor decision is Phase-5-style. The app speaks OTLP to a configurable endpoint and is indifferent to whether that is a collector, Azure Monitor, Grafana/Tempo, Honeycomb, or Jaeger. No Azure dependency is added today.
- **Cheap and portable are the same target again.** OTLP-compliance keeps Azure Monitor as the cheap default (it ingests OTLP) without locking to it — the TENET-008 pattern repeats for observability.
- **The stdout contract and SSE posture are unchanged** — ADR-007's rules hold; this ADR layers structured/OTel-log-compatible records and an SSE-aware tracing convention on top.
- **A code task is owed** — the bootstrap, env config, ESLint rule, and (post-OD-003) redaction are developer deliverables. Until they land, the standard is enforced by review.
- **One aspect was carved out, not the whole ADR — now resolved.** OD-003 (telemetry data-redaction policy) was an escalation carve-out with **no default** requiring user sign-off. It is **resolved as of 2026-06-14: the ratified policy is ADR-017** (no PII in any signal, HMAC-hashed correlation ids, redact-at-source, 7-day default retention). The core instrumentation/export/deferral decision here was always Accepted; the data policy it deferred now lives in ADR-017.
- **A seed follow-up is owed** — `seed/tech-stack.md` has no Observability row; one citing this ADR is a seed-owner action (the seed is read-only to this agent).
- **No new operational burden today** — there is nothing observability-specific to *run* until a backend is chosen (Phase 5). The bias, as with ADR-013, lives in what app code is constrained to emit and avoid.

## Alternatives considered

- **Pick an observability vendor now (Datadog / New Relic / Application Insights) and use its SDK.** Rejected — directly contradicts the user's directive ("should not decide the tool now") and TENET-008 (a vendor agent in app code is exactly the proprietary coupling ADR-013 keeps out). Baking a vendor SDK in is the observability version of the `@vercel/*`/edge-runtime lock-in this project avoids elsewhere.
- **Stay purely open with no instrumentation standard (ad-hoc `console.log`).** Rejected — leaves every workload to instrument arbitrarily; no later backend can ingest the result cleanly, distributed correlation is impossible, and the choice erodes by accident. ADR-007/ADR-015 showed the answer: defer the decision (the backend), lock the constraints (OTel + OTLP).
- **Logs-only, no distributed tracing or metrics.** Considered and rejected as the standard — for two independently-deployed front ends plus a cron workload sharing a DB and storage, request flow and latency across the request-context/`SESSION_CONTEXT` seam are exactly what needs tracing; logs alone cannot tie a slow client request to its DB queries. OTel gives all three signals through one SDK at marginal extra cost, so adopting traces+metrics+logs together is cheaper than retrofitting tracing later. (A *reduced sampling rate* for traces is a fine deploy-time tuning knob — that is config, not a signal we drop.)
- **Self-resolve the telemetry-data policy with a sensible default (e.g. "scrub everything").** Rejected — AGENT.md §2 forbids it: telemetry capture of PII behind the RLS trust boundary is a security-posture + data-handling decision (TENET-001, ADR-005) reserved for the user. Recorded as OD-003 with **no** default; only the data-policy aspect is blocked, so the rest of the ADR can still be Accepted.
- **Edit ADR-007 in place to fold in the observability posture.** Rejected — ADRs are immutable in this layer. This is a separate, later refinement that `related:`-links ADR-007/ADR-013 rather than rewriting them.
- **Author a separate telemetry-data-policy ADR now (split the carve-out into its own ADR).** Considered — the concerns *do* separate cleanly (instrumentation standard vs. data-handling policy). Rejected for *now* on granularity grounds: at authoring time the data policy had no decided content yet (a no-default carve-out awaiting the user). This was the correct call: when the user set the policy, the right shape was a **new ADR** capturing it (`related:`-linking this one and resolving OD-003), not an edit to this immutable record — which is exactly [ADR-017](./ADR-017-telemetry-data-handling-policy.md).
