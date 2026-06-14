# Open Decisions

Open architectural decisions the Architecture Agent could not resolve on its own, plus deviations logged
during design/code review. Each open decision carries a **proposed default** so downstream work is never
blocked — except **escalation carve-out** items (security posture, data retention/deletion, encryption,
the auth/authorization model, the trust boundary, regulatory constraints), which require a user decision
and carry no default.

An ADR blocked by an open decision lists its `OD-NNN` in `open_decisions:` and sits at `status: Proposed`
until the decision is resolved. A deviation finding may be tracked here when it is not resolved within a
single review (e.g. a standard-is-stale item awaiting a superseding ADR).

Status: `open` → `resolved`.

---

## OD-001 — Azure SQL Database Serverless auto-pause cold-start vs. public front-door latency
- **Status:** open
- **Class:** open-decision
- **Affects:** ADR-013 (Database resolution row); ADR-002; the public engagement-request page (anonymous front door)
- **Question / deviation:** ADR-013 names Azure SQL Database Serverless (auto-pause) as the Azure-cheapest DB default. Auto-pause adds ~30–60s cold-start on the first query after an idle window. The public, anonymous engagement-request form is exactly the page most likely to hit a cold DB (sporadic prospect traffic, no warm session), so a first-time prospect could see a 30–60s stall — a poor first impression on the conversion-critical front door. How do we reconcile the cheap auto-pause default with acceptable public-page latency? This is a default-target tension only; it does not bind until Phase 5 picks the platform.
- **Proposed default:** Keep Serverless auto-pause as the cost default, but treat front-door latency as a Phase-5 tuning knob rather than an architecture blocker: (a) set a generous auto-pause idle delay (e.g. ≥1h) so daytime traffic keeps the DB warm; (b) consider a lightweight keep-warm ping (the same authenticated cron/scheduler workload, ADR-007/ADR-013) during business hours; (c) if cold-start still degrades the public page unacceptably at Phase 5, fall back to the lowest fixed-vCore provisioned tier — still Azure SQL Database, still inside the box ∩ Azure SQL intersection, so portability is unaffected. None of these change app code today.
- **Resolution:** <open — revisit at Phase 5 platform decision>
- **Provenance:** Architecture run 2026-06-14 authoring ADR-013 (cloud-portability / Azure-readiness addendum to ADR-007).

---

## OD-002 — Formal design-token contract in `packages/ui` now, or firmed up during UX work?
- **Status:** open
- **Class:** open-decision
- **Affects:** ADR-015 (UI foundation / deferred design); `packages/ui` styling preset; ADR-006 (Tailwind shared preset + CSS-variable theming)
- **Question / deviation:** ADR-015 locks "design tokens are the canonical source for theme/visual decisions" but defers the actual visual design. Open question: should `packages/ui` ship a **formal, exported token contract** (a documented `tokens.ts` / CSS-variable manifest as a stable, named interface that a repo-reading design tool can inherit) **before** UX work begins, or should the token layer stay an informal Tailwind preset and be formalized **during** UX work? Formalizing too early over-specifies a deferred design; leaving it informal risks a design tool inheriting an under-documented system and a messier round-trip. Not a security/retention/auth carve-out — a structure/timing choice the agent may default.
- **Proposed default:** Ship a **lightweight token-manifest stub now** — the token *categories* and naming convention exist as a documented, exported layer (color/spacing/radius/type-scale CSS variables wired through the shared Tailwind preset), but the *values* stay provisional placeholders. This gives a repo-reading tool an accurate, named structure to inherit without committing the deferred visual decisions. **Formalize the values and freeze the contract when UX work starts.** No app code is blocked: components consume token names regardless of whether values are final.
- **Resolution:** <open — revisit when UX work begins>
- **Provenance:** Architecture run 2026-06-14 authoring ADR-015 (UI foundation locked, visual design deferred).

---

## OD-003 — Telemetry data-handling policy: what PII / sensitive data may observability capture? (escalation carve-out — NO default)
- **Status:** resolved
- **Class:** open-decision
- **Affects:** ADR-016 (telemetry-data-redaction-policy aspect — now unblocked, see resolution); ADR-004 (Clerk-user-id log field / SQL query logs); ADR-005 (RLS trust boundary); TENET-001 (security non-negotiable)
- **Question / deviation:** ADR-016 makes the app OTel-compliant and exports traces/metrics/logs via OTLP. **What that telemetry is permitted to capture** is a security-posture + data-handling decision for a tax portal behind the RLS trust boundary (ADR-005, TENET-001), handling SSNs, tax documents, and financial data. ADR-004 already warns that the Clerk-user-id-tagged query logs are "Sensitive — must not go to third-party log stores without redaction," but that warning was never turned into a policy. The unresolved, load-bearing questions:
  - May PII / sensitive values appear in **trace attributes, span names, log fields, exception/stack payloads**?
  - May **SQL parameter values** (ADR-004 query logs) be captured, or only parameterized statement shapes (no bound values)?
  - May **request/response bodies** (intake answers, message contents, document metadata/contents) be captured in telemetry?
  - May the **Clerk user id / principal identifier** (ADR-003/004) be exported as a correlation field, or must it be hashed / pseudonymized / dropped before egress?
  - Where is the **redaction/scrubbing boundary** enforced — in app code, at the OTel Collector, or both — and what is the **retention** of any sensitive telemetry permitted?
- **Proposed default:** **NONE — escalation carve-out.** Per AGENT.md §2 (security posture, data retention, trust boundary), this must be decided by the user and carries no proposed default. **This requires explicit user sign-off.** Interim holding posture only (not the decided policy): until resolved, the conservative implementation is to capture **no PII / sensitive values** in telemetry — structural/operational data only (durations, counts, status codes, statement shapes without bound values, request ids without principal identifiers). This holding pattern keeps the core ADR-016 decision (instrumentation standard + OTLP export + deferred backend) implementable; it does **not** substitute for the user's data-handling decision.
- **Resolution:** **Resolved 2026-06-14 by user decision, encoded in ADR-017 (telemetry data-handling policy — no PII, hashed correlation ids, redact-at-source).** The ratified policy: (1) **No PII/sensitive data in any signal** — trace attributes, span names, log fields/messages, exception/stack payloads, SQL bound-parameter values, or request/response bodies; SQL *statement shapes* may be captured but **bound values are redacted**; document contents and file payloads are never captured; operational/structural data only. (2) **Correlation identifiers are one-way keyed-hashed (HMAC with a configured, app-distinct env secret)** before entering telemetry — stable across signals for correlation, non-reversible; the **raw Clerk user id of ADR-004 must become the hashed id** in any telemetry context (raw stays in-process for `SESSION_CONTEXT`/RLS only). (3) **Retention configurable, default 7 days** — stated as both a backend/Collector capability-contract requirement and a deploy-time default. (4) **Redaction boundary is at the source, in-process, before OTLP export** — PII never reaches the Collector or backend even in transit; a Collector-side processor is at most defense-in-depth, not the guarantee. ADR-017 `related:`-links ADR-016 (and ADR-003/004/005/007/013, TENET-001/008). ADR-016 stays Accepted; its `open_decisions:` no longer lists OD-003 and its deferred-carve-out wording now forward-references ADR-017 as the ratified policy.
- **Provenance:** Architecture run 2026-06-14 authoring ADR-016 (observability — OTel-compliant, backend deferred). Mandatory carve-out per the dispatch and AGENT.md §2. **Resolved** by Architecture run 2026-06-14 (user decision) → ADR-017.

---

## OD-004 — Deletion / erasure semantics, retention-vs-erasure conflict, and post-retention purge policy (escalation carve-out — NO default)
- **Status:** resolved
- **Class:** open-decision
- **Affects:** ADR-018 (data retention & lifecycle — now Accepted, see resolution); ADR-009 (CLARIF-005 hard-delete slot — the same question at storage-object scope, now settled); ADR-005 (admin-pool purge path); TENET-001 / TENET-005 (security + never-lose-access)
- **Question / deviation:** The 7-year retention *period* is a given product requirement (decided in ADR-018), but the **deletion/erasure policy is escalation matter** (AGENT.md §2 — data retention/deletion). Unresolved, load-bearing:
  - **Deletion/erasure semantics:** what does "delete a client" / "delete an engagement" actually destroy vs. retain? Does it cascade-tombstone engagements, sever Clerk identity while retaining the `User` row, or something else? (ADR-018 §4.)
  - **Retention-vs-erasure conflict:** when a client requests deletion of their data but the firm has a regulatory duty to *retain* tax records for 7 years, which wins, and under what conditions can erasure override the hold? (ADR-018 §5/§6.)
  - **Post-retention purge policy:** at 7-year expiry, what action fires — physical purge, anonymize, archive-and-hold, or nothing-until-reviewed? Does it cover temporal-history side-tables too (history is data)? (ADR-018 §3/§5.)
  - **Legal-hold behavior:** precedence over the retention clock and over an erasure request; who may set/clear a hold. (ADR-018 §6.)
  - **Audit-write-on-delete:** every delete/purge must be audit-logged (ADR-019), but whether a purge can ever run is gated here.
- **Proposed default:** **NONE — escalation carve-out.** Per AGENT.md §2 (data retention/deletion), this was a user decision with no proposed default.
- **Resolution:** **Resolved 2026-06-14 by a design session that ratified the policy in the `.requirements/` layer** (where product policy belongs), then re-pointed ADR-018 at those requirements. The ratified policy: (1) **Deletion/erasure semantics** — soft-delete is accountant-only (REQ-FILE-004) and retains the row + bytes through the retention window (REQ-FILE-006); wholesale client-identity erasure (REQ-IDNT-005) remains deferred from v1. (2) **Retention-vs-erasure conflict** — during the 7-year window retention governs; a client erasure request is honored as **access-revocation only**, never physical removal (REQ-FILE-015). Precedence is explicit: **legal hold → retention window → purge-eligible+no-hold**. (3) **Post-retention purge policy** — purge is **in v1** as an admin-pool, **accountant-confirmed, never-automatic**, audit-logged action; window-expiry creates *eligibility only*, not deletion (REQ-FILE-013). The audit record of the purge survives the purge (REQ-NFR-010 AC-07); temporal history is purged with its engagement under the same confirmed action. (4) **Legal-hold behavior** — a hold (engagement- or client-scoped) suspends purge-eligibility indefinitely, overriding the retention clock, until the accountant explicitly lifts it; place and lift are audited (REQ-FILE-014). ADR-018 now cites REQ-FILE-005/006/013/014/015 (+REQ-FILE-004) as `source:`, keeps only the HOW (soft-delete tombstone, temporal tables, retention clock anchored at engagement completion, legal-hold flag, accountant-confirmed admin-pool purge), clears `open_decisions: []`, and is **Accepted**. ADR-009's CLARIF-005 slot is settled by the same requirements (ADR-009 unchanged/Accepted).
- **Provenance:** Architecture run 2026-06-14 authoring ADR-018 (data retention, deletion & lifecycle). Mandatory carve-out per the dispatch (ADR A) and AGENT.md §2. **Resolved** by the 2026-06-14 design session → REQ-FILE-013/014/015 (+ REQ-FILE-004/005/006) → ADR-018 finalized.

---

## OD-005 — Audit-log retention period, read-access control, and immutability/tamper-evidence guarantees (escalation carve-out — NO default)
- **Status:** resolved
- **Class:** open-decision
- **Affects:** ADR-019 (audit trail — now Accepted, see resolution); ADR-005 (RLS — who may read the audit log); ADR-018 / OD-004 (audit-record retention reconciled with the data lifecycle — audit excluded from purge); TENET-001 (security non-negotiable)
- **Question / deviation:** ADR-019 decides the audit trail *exists* and its *structure* (dedicated, append-only, in-boundary, identity-bearing — the inverse of telemetry). Its **guarantees are escalation matter** (AGENT.md §2 — security/data-retention). Unresolved, load-bearing:
  - **Retention period** of audit records — and how it reconciles with ADR-018/OD-004 (the audit log may need a *longer* retention than the data it describes; a compliance call).
  - **Read-access control** — who may read the audit log? Accountant-only, a separate auditor role, or admin-pool-only? (ADR-019 §4.)
  - **Immutability / tamper-evidence guarantee** — append-only constraint vs. a BLOCK predicate denying UPDATE/DELETE even to the admin pool vs. hash-chaining vs. an external WORM sink; and the **audit-write failure semantics** (must an audited action roll back if its audit write fails — "no action without an audit record" — or is best-effort acceptable?). (ADR-019 §1/§3.)
- **Proposed default:** **NONE — escalation carve-out.** Per AGENT.md §2 (security posture, data retention), this was a user decision with no proposed default.
- **Resolution:** **Resolved 2026-06-14 by a design session that formalized the audit-trail properties in the `.requirements/` layer** (REQ-NFR-010 + REQ-NFR-011), then finalized the ADR-019 mechanism that satisfies them. (1) **Retention period** — audit records are retained ≥7 years after engagement completion (at least as long as the documents they describe) and **survive document purge** (REQ-NFR-010 AC-06/07); the audit store is **excluded from the ADR-018 accountant-confirmed purge job**, reconciling with OD-004. (2) **Read-access control** — **accountant/admin only**, enforced by RLS; a client cannot read any part of the audit trail, including the portion about their own engagements (REQ-NFR-010 AC-05). (3) **Tamper-evidence + completeness** (REQ-NFR-011) — mechanism decided: tamper-evidence via **SQL Server 2022 append-only ledger tables** (native, cryptographically verifiable, box∩Azure intersection); completeness via writing the **audit record in the same DB transaction as the mutation** (fail-closed — the action aborts if the audit write fails), and for read/access auditing **deny the action if the audit write cannot happen**. ADR-019 now cites REQ-NFR-010 + REQ-NFR-011 as `source:`, keeps only the HOW, clears `open_decisions: []`, and is **Accepted**.
- **Provenance:** Architecture run 2026-06-14 authoring ADR-019 (audit trail / audit logging). Mandatory carve-out per the dispatch (ADR B) and AGENT.md §2. **Resolved** by the 2026-06-14 design session → REQ-NFR-010/011 → ADR-019 finalized.

---

## OD-006 — Encryption key custody/ownership (platform-managed vs. customer-managed/BYOK) and key-rotation policy (escalation carve-out — NO default)
- **Status:** resolved
- **Class:** open-decision
- **Affects:** ADR-020 (encryption posture & key management — now Accepted, see resolution); ADR-008 (blob at-rest / SSE keys); ADR-002 (DB TDE keys); ADR-017 (the distinct HMAC correlation-id secret — its rotation); TENET-001 (security non-negotiable)
- **Question / deviation:** ADR-020 decides the portable encryption *posture* (TLS everywhere, at-rest for DB + blob, KMS abstracted behind env/port). **Key custody and rotation are escalation matter** (AGENT.md §2 — encryption). Unresolved, load-bearing:
  - **Key custody/ownership:** **platform-managed keys (PMK)** vs. **customer-managed keys (CMK) / BYOK** for TDE (DB at-rest) and blob-SSE. Determines whether the firm controls the key lifecycle (compliance-relevant for a tax practice) or delegates it to the platform.
  - **Key-rotation policy:** rotation cadence and procedure for the application-managed secrets (DB secret, storage credential, and the **ADR-017 HMAC secret** — whose rotation deliberately breaks cross-window telemetry correlation) and for the infrastructure at-rest keys (TDE / blob-SSE).
- **Proposed default:** **NONE — escalation carve-out.** Per AGENT.md §2 (encryption), this was a user decision with no proposed default.
- **Resolution:** **Resolved 2026-06-14 by user decision in the design session: platform-managed keys (PMK) for v1, with platform-automatic rotation.** The user confirmed **no compliance or contractual driver mandates customer-managed keys (CMK) / BYOK** for the solo-accountant v1, so TDE (DB at-rest) and blob-SSE keys are platform-managed and platform-rotated; the application-managed secrets (DB secret, storage credential, ADR-017 HMAC secret) continue to arrive via env and are rotated at the platform/secret-store layer. The **`KeyProvider` abstraction is kept** so that a move to CMK/BYOK is a clean deploy-time/adapter swap behind the port should a driver later emerge — no app code depends on the custody choice. Unlike OD-004/005, key custody has **no governing requirement** (it is a pure HOW, by design); REQ-FILE-003 owns only the *that-encryption-at-rest-exists* WHAT. ADR-020 records the PMK decision, cites REQ-FILE-003 as `source:`, clears `open_decisions: []`, and is **Accepted**.
- **Provenance:** Architecture run 2026-06-14 authoring ADR-020 (encryption posture & key management). Mandatory carve-out per the dispatch (ADR C) and AGENT.md §2. **Resolved** by user decision in the 2026-06-14 design session → ADR-020 finalized.
