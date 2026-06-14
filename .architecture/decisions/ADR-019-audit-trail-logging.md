---
id: ADR-019
title: Audit trail — tamper-evident, identifiable who/what/when logging (inverse of telemetry)
status: Accepted   # The audit-trail PROPERTIES (existence, tamper-evidence, completeness, access, retention) now live in the requirements layer (REQ-NFR-010/011); OD-005 resolved 2026-06-14. This ADR keeps only the HOW (ledger tables, same-txn write, RLS read, purge-excluded retention).
date: 2026-06-14
deciders: [Architecture Agent, user]
related: [ADR-002, ADR-003, ADR-004, ADR-005, ADR-016, ADR-017, ADR-018, ADR-020]
source:
  - .requirements/REQ-NFR-010.md   # system maintains an audit trail of security-significant events (events / access / retention) — the WHAT
  - .requirements/REQ-NFR-011.md   # audit trail is tamper-evident and complete — the WHAT (the properties this ADR's mechanism satisfies)
  - architecture-dispatch-2026-06-14#adr-b-audit-trail-audit-logging   # dispatch: author the tamper-evident audit trail; capture the inverse-of-telemetry contrast
  - decisions/ADR-003-identity-propagation-session-context.md   # the principal identity available per request — the "who"
  - decisions/ADR-005-rls-via-security-policies.md   # who can read the audit log is an RLS/trust-boundary question
  - decisions/ADR-016-observability-otel-compliant-backend-deferred.md   # the system audit logging is explicitly NOT (telemetry)
  - decisions/ADR-017-telemetry-data-handling-policy.md   # the inverse data rule: telemetry forbids PII; audit REQUIRES identity
  - decisions/ADR-002-database-sql-server.md   # SQL Server 2022 append-only ledger tables; DATETIMEOFFSET storage of audit records
  - decisions/ADR-018-data-retention-lifecycle.md   # the audit store is EXCLUDED from the purge job; audit survives document purge
open_decisions: []   # OD-005 resolved; audit properties now owned by REQ-NFR-010/011, mechanism decided below
---

# ADR-019: Audit trail — tamper-evident, identifiable who/what/when logging (the inverse of telemetry)

**Status:** Accepted. The audit-trail **properties** — that it exists, records the security-significant event set, is readable by the accountant/admin only, is retained ≥7 years and survives purge (REQ-NFR-010), and is **tamper-evident and complete** (REQ-NFR-011) — are now owned by the requirements layer, resolved from the former OD-005 carve-out by the 2026-06-14 design session. This ADR keeps only the **HOW**: SQL Server 2022 append-only **ledger tables** for tamper-evidence, the audit write **in the same DB transaction as the mutation** (fail-closed) for completeness, **RLS** for accountant/admin-only read, and audit retention **excluded from the ADR-018 purge job**. OD-005 is resolved; no open decision blocks this ADR.
**Date:** 2026-06-14
**Deciders:** Architecture Agent (with user direction)
**Related:** ADR-003 (identity context — the "who"), ADR-004 (Prisma mutation seam), ADR-005 (RLS — who may read the audit log), ADR-016 / ADR-017 (telemetry — the deliberate *inverse* data rule), ADR-002 (append-only / temporal storage), ADR-018 (data lifecycle — temporal history is a *different* record than the audit log), ADR-020 (encryption / security posture)

## Context

A tax portal handling SSNs, tax documents, and financial data needs a **tamper-evident audit trail**: a durable, identifiable record of *who did what, when, and from where*. The audit-worthy events are at minimum:

- **Document access and downloads** — every signed-URL mint / download authorization (ADR-009 already logs issuance; this makes it a first-class audit record).
- **Engagement state transitions** — New → In Progress → Review → Complete (the human-driven lifecycle, REQ-LIFE-003).
- **Admin actions** — accountant accept/decline of requests, invitations, soft-deletes, purges (ADR-018), role-significant operations.
- **Auth-significant events** — sign-in, sign-out, role changes, invitation acceptance (the events Clerk + the app mediate, ADR-001/003).

Audit logging touches **every mutation** and is **hard to retrofit** — if the write-side hook isn't there from the first mutation, historical actions are unrecoverable. So the audit-trail architecture must be set before implementation.

### Critical contrast — the audit trail is the INVERSE of telemetry (the load-bearing point)

This project already decided its **telemetry** data rules: ADR-016 makes the app OTel-compliant, and **ADR-017 forbids PII/identity in any telemetry signal** — no raw principal id (only an HMAC-hashed correlation id), no bound SQL values, no request/response bodies, redact-at-source before OTLP export. Telemetry is an **untrusted egress channel** (the backend is deferred and not-yet-chosen, ADR-013), so it must carry **operational/structural data only**.

The **audit trail is the exact opposite**. Its entire *purpose* is to record **identifiable who/what/when** — the raw principal identity, the specific entity acted on, the specific action. An audit record that hashed the actor or dropped the target id would be useless. Therefore:

> **Audit logging is a separate system from OTel telemetry, with deliberately opposite data rules.**
> - **Telemetry (ADR-016/017):** no PII, hashed correlation ids, structural data only, untrusted egress, redact-at-source. Forbidden to identify.
> - **Audit trail (this ADR):** *requires* identity — raw actor principal, concrete target, concrete action. Its job is to identify. It is a **trusted, in-boundary record**, not an egress channel.

These two systems must never be conflated, share a pipe, or share a data rule. An audit event must **not** be emitted as an OTel signal (it would violate ADR-017's no-PII rule); and a telemetry signal must never be treated as an audit record (it lacks the identity an audit needs). They are built, stored, and governed separately.

### Relationship to temporal history (ADR-018)

The audit trail is also distinct from **temporal-table history** (ADR-018 §2). Temporal history answers "what did this *row* look like at time T" (data state over time, engine-maintained). The audit trail answers "which *principal* performed which *action* at time T, from where" (actor-and-action over time, app-emitted). A soft-delete leaves a temporal-history record of the row's prior state *and* an audit record of "ACCOUNTANT X deleted document Y at time T." Both exist; they answer different questions.

Per **AGENT.md §2**, the audit log's **retention, access control, and tamper-evidence/completeness guarantees** are security/data-retention decisions and were originally held as an **escalation carve-out (OD-005, no default)**. The 2026-06-14 design session has now **formalized those as requirements**: REQ-NFR-010 asserts that the audit trail exists, names the minimum security-significant event set, requires accountant/admin-only read access, and requires ≥7-year retention with survival-through-purge; REQ-NFR-011 asserts the trail is **tamper-evident** and **complete** (audit failure for a security-significant action is a failure of the action itself). Both explicitly state these as *properties* and leave the *mechanism* to the architecture layer. OD-005 is therefore **resolved**, and this ADR decides the mechanism that satisfies those properties.

Scope is **how, not what**: REQ-NFR-010/011 own *that* an audit must exist and the properties it must exhibit; this ADR decides the audit-trail *mechanism and data shape* that delivers them.

## Decision

**We will build a dedicated audit trail as a separate, in-boundary system that records identifiable actor + action + target + timestamp + source for every audit-worthy mutation and access event — deliberately governed by the INVERSE data rule from telemetry (ADR-016/017): the audit trail REQUIRES the identity that telemetry forbids. Tamper-evidence (REQ-NFR-011) is delivered by SQL Server 2022 append-only ledger tables; completeness (REQ-NFR-011) is delivered by writing the audit record in the same DB transaction as the mutation it records (fail-closed); read access (REQ-NFR-010) is restricted to accountant/admin via RLS; and the audit store is retained ≥7 years and excluded from the ADR-018 purge job.**

### 1. A dedicated audit store on SQL Server 2022 append-only ledger tables — tamper-evident, separate from telemetry and temporal history (decided)

Audit records live in a dedicated store in the **primary SQL Server database** (ADR-002), on the same trusted side of the trust boundary as the data it records (ADR-005 / ADR-003). It is **not** an OTel signal, **not** routed through the observability pipeline, and **not** the temporal-history side-table.

- **Tamper-evidence is delivered by SQL Server 2022 ledger tables** — specifically append-only ledger tables. Ledger is native to SQL Server 2022, cryptographically verifiable (rows are hashed into a Merkle tree whose digests can be verified against tampering), and prevents/derives evidence of UPDATE/DELETE on existing rows. This **satisfies REQ-NFR-011 tamper-evidence** without a hand-rolled hash-chain or an external WORM sink, and keeps the store inside the **box SQL Server 2022 ∩ Azure SQL Database intersection** (ADR-013) — ledger is available in both, so it adds no portability risk.
- **Append-only by design.** Audit rows are inserted, never updated or deleted by application code; the append-only ledger constraint makes any out-of-band alteration cryptographically detectable (the verifiable-database guarantee), not merely a convention.
- Storage uses `DATETIMEOFFSET` timestamps (ADR-002).

### 2. The audit record shape REQUIRES identity (decided — the inverse-of-telemetry rule)

Every audit record carries, at minimum:

- **Actor** — the **raw principal identity** (the Clerk user id / role from the ADR-003 request context). **This is the explicit inverse of ADR-017:** telemetry must HMAC-hash this id and never emit it raw; the audit trail records it **raw**, because identifying the actor is the audit's entire purpose. The raw id is allowed here precisely because the audit store is *inside* the trust boundary, not an egress channel.
- **Action** — the concrete operation (e.g. `document.download`, `engagement.transition`, `request.accept`, `document.delete`, `auth.signin`).
- **Target** — the concrete entity acted on (entity type + id), not a redacted shape. (Telemetry forbids the populated id; audit requires it.)
- **When** — `DATETIMEOFFSET` server timestamp.
- **From where** — source context (e.g. IP / user-agent / app surface portal-vs-admin), to the extent available at the mutation seam.
- **Outcome** — success/denied, and for state transitions the from→to states.

Audit records **may contain PII/identity by design**; they must **never** be exported into telemetry (doing so is a deviation finding against ADR-017).

### 3. Write seam — in the same DB transaction as the mutation, fail-closed (decided — satisfies REQ-NFR-011 completeness)

Audit writes hook the **mutation boundary** and are **atomic with the mutation** so completeness is structural, not best-effort:

- **The audit record is written in the same database transaction as the mutation it records.** If the audit write cannot happen, the transaction does not commit — the triggering action is rolled back. This is **"no security-significant state change without an audit record"** (REQ-NFR-011 AC-02), enforced transactionally rather than by middleware convention; audit failure is a failure *of the action*.
- For **read/access auditing** (document access/download — REQ-NFR-010 AC-01), where there is no DB mutation to bind to, the rule is **deny-the-action-if-the-audit-write-cannot-happen**: the authorize-then-sign gate (ADR-008/009) mints a signed URL only after the access-audit row is durably written; if the audit write fails, the download is denied. Fail-closed, same as the transactional path.
- The natural seam is the same Prisma layer ADR-004 already wraps (the `$extends` client) and/or the server-action/route-handler layer where authorization decisions are made (ADR-009's authorize-then-act paths).
- Admin-pool mutations (ADR-003 §7) — webhooks, cron, accountant-confirmed purges and legal-hold place/lift (ADR-018, REQ-FILE-013/014) — are **also** audited in the same transaction; the admin pool is the one place RLS does not protect, so its actions are exactly what an audit must capture.

### 4. Read access — accountant/admin only, enforced by RLS (decided — satisfies REQ-NFR-010 access)

Reading the audit log is a privileged operation restricted to the **accountant/admin role only** (REQ-NFR-010 AC-05); **a client cannot read any part of the audit trail, including the portion about their own engagements.** This is enforced by the same RLS trust boundary (ADR-005) as everything else — the audit tables carry an RLS predicate that admits only the ACCOUNTANT/admin principal and denies the CLIENT branch outright (no client-scoped row visibility at all, unlike client-data tables). The previously-open "who may read" question is closed by REQ-NFR-010: accountant/admin only.

### 5. Retention — ≥7 years, survives document purge, excluded from the ADR-018 purge job (decided — satisfies REQ-NFR-010 retention)

Audit records are retained for **at least as long as the underlying document retention period — ≥7 years after the related engagement completes** (REQ-NFR-010 AC-06), and **survive the purge of the data they describe** (REQ-NFR-010 AC-07, REQ-FILE-013 AC-06): the record that "engagement X was purged by accountant Y at time T" must outlive the purge.

- **The audit store is explicitly excluded from the ADR-018 accountant-confirmed purge job.** When a confirmed purge removes an engagement's documents and temporal history (ADR-018 §5), it does **not** touch the audit ledger tables. The audit trail may therefore retain a *longer* horizon than the data it describes — which is correct for a compliance record.
- Because the store is append-only ledger (§1), this is naturally a retain-don't-destroy posture; any future audit-record aging is itself an accountant-governed, audited action, never automatic.

### 6. Explicitly separate from telemetry and from temporal history (decided)

- **vs. Telemetry (ADR-016/017):** different system, different pipe, opposite data rule. Audit is trusted/in-boundary/identifying; telemetry is untrusted/egress/de-identified. Never share a sink. Never emit an audit event as an OTel signal.
- **vs. Temporal history (ADR-018):** different record. Temporal = row-state-over-time (engine-maintained); audit = actor-and-action-over-time (app-emitted). Both exist and answer different questions.

### What is decided

| Aspect | Status |
|---|---|
| The audit trail exists as a dedicated, separate system | **Decided** (REQ-NFR-010) |
| Records the minimum security-significant event set (doc access, state transitions, admin actions incl. purge/legal-hold, auth events) | **Decided** (REQ-NFR-010 AC-01..04) |
| Record shape REQUIRES raw identity (inverse of ADR-017 telemetry rule) | **Decided** |
| **Tamper-evidence** via SQL Server 2022 append-only **ledger tables** (cryptographically verifiable) | **Decided** (satisfies REQ-NFR-011) |
| **Completeness** via audit write **in the same DB transaction** as the mutation, fail-closed (read/access: deny-if-unauditable) | **Decided** (satisfies REQ-NFR-011) |
| **Read access** = accountant/admin only, enforced by **RLS** | **Decided** (satisfies REQ-NFR-010 AC-05) |
| **Retention** ≥7 years, survives purge, **excluded from the ADR-018 purge job** | **Decided** (satisfies REQ-NFR-010 AC-06/07) |

## Consequences

- **Every mutation gains an audit obligation, written in-transaction.** New audited actions are added at the mutation/authorization seam, not sprinkled ad hoc. **Code follow-up flagged for `[webapp-developer]`:** an audit-write hook at the Prisma `$extends` / server-action seam (reusing the ADR-003 request context for the actor) that writes the audit row **in the same transaction** as the mutation (fail-closed — abort the mutation if the audit write fails); SQL Server 2022 **append-only ledger** audit table(s) on the raw-SQL track (ledger DDL is not Prisma-expressible); an RLS predicate on the audit tables admitting accountant/admin only and denying CLIENT; audit emission at ADR-009's authorize-then-sign gate with **deny-if-unauditable** for access events; audit emission at engagement state transitions; admin-pool auditing for webhooks/cron/accountant-confirmed purge and legal-hold place/lift (ADR-018, REQ-FILE-013/014); **exclude the audit tables from the ADR-018 purge job.**
- **The inverse-of-telemetry rule is now a citable standard.** Emitting an audit event into an OTel signal, or hashing/dropping the actor identity in an audit record, is a **deviation finding** (against this ADR and ADR-017). Conversely, putting a raw principal id into telemetry remains a finding against ADR-017 — the two rules are mirror images and both are enforced.
- **The properties are now requirements; the mechanism is decided.** REQ-NFR-010/011 own that the trail exists, is tamper-evident, complete, accountant-only-readable, and ≥7-year-retained; this ADR's ledger-table + same-transaction-write + RLS + purge-exclusion mechanism is how those properties are met. There is no longer any blocked surface — OD-005 is resolved.
- **Storage/retention interplay with ADR-018.** Audit records are data too, but their retention (≥7 years, survives purge — REQ-NFR-010 AC-06/07) is *longer-or-equal* to the data they describe and the audit store is **excluded** from ADR-018's purge sweep. The "engagement X purged" record outlives the engagement.
- **No new egress dependency.** The audit trail lives in the primary DB, inside the trust boundary — it adds no third-party sink and no portability risk (ledger tables are in the box/Azure SQL intersection, ADR-013).

## Alternatives considered

- **Use OTel telemetry as the audit trail (one logging system).** Rejected — and this is the central decision. Telemetry (ADR-016/017) is an untrusted, de-identified egress channel that *forbids* the very identity an audit *requires*. Routing audit events through telemetry would either leak PII out of the trust boundary (violating ADR-017) or strip the identity that makes an audit useful. They are opposite systems with opposite data rules; conflating them breaks one or the other.
- **Use temporal-table history (ADR-018) as the audit trail.** Rejected — temporal history records *row state over time*, not *actor and action*. It cannot answer "who downloaded this document" or "who transitioned this engagement," because the engine-maintained period columns capture the changed row, not the principal or the intent. Temporal history complements, but does not replace, the audit trail.
- **Self-resolve the retention / access-control / tamper-evidence guarantees in the architecture layer.** Rejected — AGENT.md §2: audit-log retention, who may read it, and its integrity guarantees are security/data-retention matter the user must own. They were held as OD-005 (no default) and have now been ratified **in the requirements layer** (REQ-NFR-010/011), which state them as *properties* and leave the mechanism here. This ADR cites those requirements as `source:` and decides only the mechanism (ledger tables, same-transaction write, RLS read, purge-excluded retention).
- **Hand-roll tamper-evidence (an application hash-chain) or push to an external WORM sink instead of using SQL Server 2022 ledger.** Rejected as the baseline — ledger tables are native to SQL Server 2022, cryptographically verifiable, in the box/Azure SQL intersection (no portability cost), and require no app-side chaining logic or third-party sink to satisfy REQ-NFR-011 tamper-evidence. An external WORM sink remains a possible defense-in-depth layer later, not the v1 mechanism.
- **Best-effort / asynchronous audit writes (don't couple the audit write to the mutation transaction).** Rejected — REQ-NFR-011 completeness (AC-02) requires that no security-significant change succeeds without an audit record; a fire-and-forget write can silently drop and leave an unrecorded action. The same-transaction (and deny-if-unauditable for access) approach makes completeness structural.
- **Defer the entire audit trail to a later epic.** Rejected — audit logging touches every mutation and is unrecoverable if missing (an action that happened without an audit write cannot be reconstructed later). The write seam must exist from the first mutation.
- **Write audit records to an append-only file/stdout instead of the DB.** Rejected — stdout is ADR-007's *log* contract (and feeds telemetry), which conflates audit with the de-identified channel; and a file violates ADR-007's no-local-filesystem rule. An in-DB ledger store keeps the audit trusted, verifiable, and queryable.
