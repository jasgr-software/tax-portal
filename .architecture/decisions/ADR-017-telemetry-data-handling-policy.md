---
id: ADR-017
title: Telemetry data-handling policy — no PII, hashed correlation ids, redact-at-source
status: Accepted
date: 2026-06-14
deciders: [Architecture Agent, user]
related: [ADR-003, ADR-004, ADR-005, ADR-007, ADR-013, ADR-016, ADR-020]
source:
  - architecture-dispatch-2026-06-14#telemetry-data-handling-policy-resolves-od-003   # user decision resolving OD-003
  - decisions/ADR-016-observability-otel-compliant-backend-deferred.md   # the instrumentation standard this policy governs the data-handling of
  - OPEN-DECISIONS.md#OD-003   # the escalation carve-out this ADR resolves
  - decisions/ADR-004-orm-prisma-single-track.md   # raw Clerk-user-id log field + SQL query logs this policy now governs
  - decisions/ADR-003-identity-propagation-session-context.md   # AsyncLocalStorage request context — where the hashed correlation id is derived
  - decisions/ADR-005-rls-via-security-policies.md   # RLS / DB is the trust boundary
  - decisions/ADR-007-container-packaging-deploy-agnostic.md   # stdout structured-log contract
  - decisions/ADR-013-cloud-portability-azure-readiness.md   # cloud-neutral; deferred backend stays untrusted
---

# ADR-017: Telemetry data-handling policy — no PII, hashed correlation ids, redact-at-source

**Status:** Accepted
**Date:** 2026-06-14
**Deciders:** Architecture Agent (encoding the user's data-handling decision)
**Related:** ADR-016 (the OTel instrumentation/export standard this governs the data of), ADR-003 (request context where the correlation id is derived), ADR-004 (the raw Clerk-user-id log field + SQL query logs this now governs), ADR-005 (RLS / DB trust boundary), ADR-007 (stdout structured-log contract), ADR-013 (cloud-neutral, no proprietary lock-in — deferred backend stays untrusted), ADR-020 (encryption / security posture)

## Context

ADR-016 made the portal OpenTelemetry-compliant — both front ends and the cron workload emit traces, metrics, and logs through the OTel SDK and export via OTLP to a configurable endpoint, with the backend/vendor deferred. ADR-016's core instrumentation/export/deferral decision was Accepted, but **what that telemetry is permitted to capture** was carved out as **OD-003** — an escalation item (security posture, data retention, trust boundary) that AGENT.md §2 forbids the Architecture Agent from self-resolving, recorded with **no proposed default** and left blocking the telemetry-data-policy aspect of ADR-016.

This is a tax portal behind the RLS trust boundary (ADR-005, ADR-020), handling SSNs, tax documents, intake answers, message contents, and financial data. ADR-004 already records — but never turned into policy — that the Clerk-user-id-tagged query logs are "Sensitive — must not go to third-party log stores without redaction," and that Prisma surfaces every emitted SQL statement. ADR-016 ran on a **conservative holding posture** ("capture no PII in telemetry") explicitly marked as a holding pattern, not the decided policy.

**The user has now resolved OD-003.** This ADR encodes that decision as the ratified telemetry data-handling policy. It is a **how/policy** decision — data-handling for telemetry — not a product requirement; no monitoring or alerting *need* is asserted here (that would belong to the requirements layer). The constraints it must respect:

- **ADR-005 / ADR-020 — the DB (RLS) is the trust boundary; security is non-negotiable.** Telemetry is an egress channel out of the trusted process. For a tax portal, that channel must never carry the sensitive data the trust boundary exists to protect.
- **ADR-003 — identity is carried in the `AsyncLocalStorage` request context.** That context (the same seam that feeds `SESSION_CONTEXT` and ADR-004's Prisma log field) is where any correlation identifier is derived — and therefore the correct place to hash it before it enters telemetry.
- **ADR-004 — the Clerk user id currently lands raw as a log field, and SQL statements are logged.** Both are now governed by this policy; the raw id must become a hashed id, and bound parameter values must be excluded.
- **ADR-007 — logs are structured JSON to stdout/stderr.** This policy constrains the *contents* of those records; it does not change the stdout contract.
- **ADR-013 — the backend is deferred and cloud-neutral.** A deferred, not-yet-chosen backend (and any Collector in front of it) is **untrusted**. PII must not depend on a backend's access controls, because there is no backend to trust yet — and the design must not assume one later.
- **ADR-016 — the instrumentation standard.** This policy is the data-handling layer on top of it; it does not alter ADR-016's instrumentation, export, or deferral decisions.

## Decision

**We will permit telemetry to carry operational and structural data only. No personally-identifiable or sensitive client/financial data may appear in any signal. Correlation identifiers are one-way keyed-hashed (HMAC) before entering telemetry. Redaction and hashing happen in-process, at the source, before any data leaves the app via OTLP. Telemetry retention is configurable, defaulting to 7 days.**

### 1. No PII or sensitive data in any signal

No personally-identifiable, client, or financial data may appear in **any** OTel signal — not in:

- **trace attributes** or **span names**,
- **log fields, messages, or structured payloads**,
- **exception messages or stack-trace payloads**,
- **SQL parameter / bound values**,
- **request or response bodies**.

Telemetry carries **operational and structural data only**: durations/timings, HTTP status codes, route templates (e.g. `/engagements/[id]`, never a populated path that embeds an identifier), counts/cardinalities, queue depths, SSE connection counts, error *classes/types* (not the sensitive values that caused them), and OTel resource attributes (`service.name`, `service.version`, `deployment.environment` per ADR-016).

Specific carve-ins and carve-outs:

- **SQL statement text MAY be captured; bound parameter values MUST NOT.** The parameterized statement *shape* (e.g. `SELECT ... WHERE ssn = @p1`) is operational/structural and is allowed; the **bound parameter values are excluded/redacted** before export. This converts ADR-004's "every emitted SQL statement is surfaced" into "statement shapes only, never values."
- **Document contents and file payloads are never captured** in any form — not bodies, not previews, not derived excerpts.
- **Request/response bodies are never captured** — intake answers, message contents, and document metadata/contents do not enter telemetry.

### 2. Correlation identifiers are one-way keyed-hashed (HMAC)

Any identifier used to correlate signals across a request — **notably the Clerk user id** (which ADR-004 currently adds *raw* as a log field) — must be **one-way hashed before it enters telemetry and never emitted raw**.

- The hash is a **keyed hash — HMAC with a configured secret** (not a bare digest). HMAC is required so the emitted value is **stable across signals** (the same principal hashes to the same value in a trace, a log, and a metric exemplar — enabling correlation) while being **non-reversible and not rainbow-table-able** (a bare unsalted hash of a low-entropy id like a Clerk user id would be trivially re-identifiable).
- The **HMAC secret is a configured secret supplied via environment**, **distinct from all other application secrets** (not the DB password, not a Clerk key, not the session secret). Rotating it intentionally breaks cross-window correlation — an acceptable, deliberate trade.
- The hashed value is derived **in the `AsyncLocalStorage` request context** (ADR-003) — the same seam that carries identity for `SESSION_CONTEXT` and that ADR-004's Prisma middleware reads. The **raw** id is used inside the trust boundary (for `SESSION_CONTEXT`/RLS, exactly as today); only the **hashed** form crosses into telemetry.
- This **governs and reconciles ADR-004's raw-Clerk-user-id log field**: that field is now the HMAC-hashed correlation id in any telemetry context. The raw id remains in-process only.

### 3. Retention — configurable, default 7 days

Telemetry retention is **configurable via env/deploy config, defaulting to 1 week (7 days)**. Because the backend is deferred (ADR-016), this is stated two ways:

- As a **capability-contract requirement on the eventual backend/Collector**: whatever backend is chosen at the Phase-5-style host decision must support a configurable retention window and honor a 7-day default. This **extends ADR-016's capability contract** (which previously said only "an operationally-useful window … the exact retention is a deploy-time + data-policy concern (the OD-003 carve-out)" — now resolved here).
- As a **configurable default** at deploy time, set via env/deploy config, not hard-coded.

### 4. Redaction boundary — at the source, in-process, before OTLP export

Redaction and hashing happen **in-process, before any data leaves the app** over OTLP.

- PII **never reaches the Collector or backend, even in transit.** A signal is scrubbed and the correlation id is HMAC-hashed by an **in-app OTel span/log processor** in the shared `packages/observability` bootstrap (ADR-016), before the OTLP exporter sees it.
- This is the **strictest reading of "no PII"** and the **only one valid while the backend is deferred and untrusted** (ADR-013). It does not rely on any Collector- or backend-side access control, because there is no chosen, trusted backend to rely on — and it must remain true even once one is chosen.
- A Collector-side redaction processor (which ADR-016 floated as "the natural place to enforce egress-side redaction once OD-003 is resolved") is **superseded as the primary boundary**: it MAY exist as defense-in-depth, but it is **not** where the guarantee lives. The guarantee is at the source.

## Consequences

- **OD-003 is resolved and ADR-016's data-policy aspect is unblocked.** ADR-016 stays Accepted; its `open_decisions:` list drops OD-003, and its forward-references to "the deferred carve-out / holding posture" now point at this ADR as the ratified policy. ADR-016's *decision* is unchanged (ADRs are immutable) — this ADR carries all the data-policy content.
- **ADR-004's raw-user-id log field is now non-compliant as written.** Emitting the raw Clerk user id into any telemetry context is a **deviation finding** against this ADR; the compliant value is the HMAC-hashed correlation id. This is a code reconciliation flagged for `[webapp-developer]` (the raw id stays valid inside the trust boundary for `SESSION_CONTEXT`/RLS — only the telemetry-facing form changes).
- **New deviation findings are now citable.** Any of the following is a finding against ADR-017: a raw correlation id (or any raw principal identifier) in telemetry; bound SQL parameter values in any signal; request/response bodies, intake answers, message contents, or document contents/metadata in telemetry; a bare (non-HMAC) hash of an identifier; redaction relied upon at the Collector/backend rather than enforced at the source; or telemetry retention configured without a default ≤ the 7-day policy default.
- **A new app secret is owed.** The HMAC secret is a distinct configured env secret — added to `.env.example`, the operations inventory, and the secret inventory; absent in local dev, the processor still hashes (with a dev placeholder) and never emits the raw id.
- **The redaction implementation is now unblocked.** ADR-016 deferred the redaction/scrubbing implementation "until OD-003 resolved." OD-003 is resolved; the in-app processor is now a ready developer task (see below).
- **No new operational burden today** beyond ADR-016's — there is still nothing observability-specific to *run* until a backend is chosen (Phase 5). The retention requirement is a capability the eventual backend must satisfy, plus a config default; it adds no runtime today.
- **The trust boundary is preserved end-to-end.** Telemetry can no longer become a side channel that leaks across the RLS boundary (ADR-005/ADR-020) — the egress channel carries structural data and stable-but-opaque correlation ids only.

## Alternatives considered

- **Redact at the Collector (egress-side redaction in the OTel Collector).** Rejected. PII would leave the application process in cleartext and traverse the network to the Collector before being scrubbed; for a deferred, not-yet-chosen — therefore untrusted — backend (ADR-013), nothing the app can rely on sits between it and an unknown sink. ADR-016 floated the Collector as the "natural place" for redaction; with the backend deferred and the data this sensitive, the boundary must be at the source. (A Collector processor may still exist as defense-in-depth, but it is not where the guarantee lives.)
- **Allow PII in telemetry, protected by backend access controls.** Rejected. This is a trust-boundary violation for a tax portal (ADR-005, ADR-020): it makes the confidentiality of SSNs/financial data depend on a third-party observability backend's access model, exactly the proprietary-trust coupling ADR-013 keeps out — and there is no chosen backend to trust in the first place.
- **Correlate on the raw principal identifier (raw Clerk user id, as ADR-004 logs it today).** Rejected. A raw, low-entropy identifier in telemetry re-identifies the principal directly and lets anyone with telemetry access tie operational data back to a named client. Hashing is required; HMAC specifically (over a bare digest) so the value stays stable enough to correlate but is not reversible or rainbow-table-able.
- **Configurable retention with no policy default (defer entirely to deploy time).** Rejected. With the backend deferred, leaving retention undefined would let the eventual host default to an arbitrarily long window, accumulating telemetry indefinitely — at odds with data-minimization for a tax portal. A bounded default (7 days, configurable) is set as both a backend capability requirement and a deploy default.
- **Fold this policy into ADR-016 by editing it.** Rejected — ADRs are immutable in this layer, and ADR-016 itself anticipated this shape: "Once the user sets the policy, the right shape is a new ADR … that would `related:`-link this one and resolve OD-003." This ADR is that record.
