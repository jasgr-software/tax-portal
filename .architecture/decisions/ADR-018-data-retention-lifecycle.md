---
id: ADR-018
title: Data retention, deletion & lifecycle architecture (7-year hold)
status: Accepted   # The deletion/erasure/legal-hold/purge POLICY now lives in the requirements layer (REQ-FILE-005/006/013/014/015); OD-004 resolved 2026-06-14. This ADR keeps only the HOW.
date: 2026-06-14
deciders: [Architecture Agent, user]
related: [ADR-002, ADR-005, ADR-008, ADR-009, ADR-019, ADR-020]
source:
  - .requirements/REQ-FILE-005.md   # 7-year retention after engagement completion — the retention WINDOW (the WHAT)
  - .requirements/REQ-FILE-006.md   # deletion is soft; files retained through the retention period (the WHAT)
  - .requirements/REQ-FILE-013.md   # post-retention purge is accountant-confirmed, never automatic (the WHAT — purge is v1)
  - .requirements/REQ-FILE-014.md   # legal hold suspends purge indefinitely until lifted (the WHAT)
  - .requirements/REQ-FILE-015.md   # retention governs during the window; client erasure = access-revocation only (the WHAT)
  - .requirements/REQ-FILE-004.md   # accountant-only delete (the WHAT)
  - architecture-dispatch-2026-06-14#adr-a-data-retention-deletion-lifecycle   # dispatch: author the 7-year retention lifecycle architecture
  - seed/intake.md#architectural-forces   # force 6 — long retention, never lose access; documents retained 7 years (IRS), hard delete only on explicit accountant request
  - decisions/ADR-002-database-sql-server.md   # temporal tables, DATETIMEOFFSET, soft-delete columns, two migration tracks
  - decisions/ADR-009-signed-url-file-access.md   # soft-delete + version history + CLARIF-005 hard-delete slot (storage-object lifecycle)
  - decisions/ADR-008-object-storage-abstraction.md   # 7-year retention obligation on the storage adapter; tiering
  - decisions/ADR-005-rls-via-security-policies.md   # deletedAt filter in CLIENT branch; admin-pool purge path
open_decisions: []   # OD-004 resolved; policy now owned by REQ-FILE-005/006/013/014/015
---

# ADR-018: Data retention, deletion & lifecycle architecture (7-year hold)

**Status:** Accepted. The deletion/erasure/legal-hold/purge **policy** is now owned by the requirements layer — a 2026-06-14 design session resolved the former escalation carve-out (OD-004) into ratified requirements: REQ-FILE-005 (7-year window), REQ-FILE-006 (soft-delete within the window), REQ-FILE-013 (post-retention purge is accountant-confirmed, never automatic), REQ-FILE-014 (legal hold suspends purge indefinitely), REQ-FILE-015 (retention governs during the window; client erasure = access-revocation only). This ADR keeps only the **HOW** — the mechanism that makes those requirements expressible. OD-004 is resolved; no open decision blocks this ADR.
**Date:** 2026-06-14
**Deciders:** Architecture Agent (with user direction)
**Related:** ADR-002 (temporal tables, soft-delete columns, `DATETIMEOFFSET`, raw-SQL track), ADR-005 (RLS `deletedAt` filter, admin-pool purge), ADR-008 (storage retention obligation + tiering), ADR-009 (soft-delete + version history; the CLARIF-005 hard-delete slot), ADR-019 (every purge / soft-delete / legal-hold change is audit-logged), ADR-020 (encryption / security posture)

## Context

The product commits to **7-year document retention** (IRS records-retention norms) and to "clients never lose access" (intake force 6) — the never-lose-access principle this ADR realizes as a schema-wide invariant. This is a data-*lifecycle* commitment, and lifecycle decisions shape the schema from the very first migration: whether a row is ever physically removed, how its history is preserved, what "delete a client" or "delete an engagement" actually does, and what happens when the 7-year clock finally expires. Retrofitting soft-delete columns and temporal history onto a live schema is far more expensive than designing them in — so the lifecycle posture must be set **before implementation begins**, not discovered during Epic 008.

Several prior decisions already touch this area but none owns the lifecycle as a whole:

- **ADR-002** establishes temporal tables (`SYSTEM_VERSIONING = ON`) as "the preferred mechanism" for audit/retention-sensitive tables, `DATETIMEOFFSET` everywhere, and the raw-SQL migration track where temporal/system-versioning DDL lives. It names the lifecycle mechanism but does not decide the lifecycle.
- **ADR-009** decides document soft-delete (`Document.deletedAt`), version history (new row + new storage key per version, never overwrite), and explicitly **carves out** the hard-delete-vs-retention conflict as **CLARIF-005** (a requirements-side clarification), proposing — but not ratifying — a default. ADR-009 owns the *document storage-object* slice of this.
- **ADR-005** already filters `deletedAt IS NULL` in the CLIENT branch of the `Document` RLS predicate and routes purges through the admin pool, and notes cron "7-year retention purges" as an admin-pool workload.
- **The never-lose-access principle** (intake force 6): soft-delete only for documents (7-year IRS retention); hard delete only on explicit accountant request. This ADR is where that principle becomes a decided mechanism.

The forces in tension:

1. **7-year retention vs. data minimization / erasure.** A client may request deletion of their data; the firm may have a regulatory obligation to *retain* tax records for 7 years. These can directly conflict — the resolution is a legal/compliance call, not an architecture call.
2. **"Never lose access" vs. "delete."** The never-lose-access principle requires completed engagements to remain accessible indefinitely; "delete a client" cannot mean "destroy the engagement record" without a deliberate, governed decision.
3. **Soft-delete reversibility vs. true erasure.** Soft-delete (a tombstone flag) keeps the row and its bytes; true erasure (purge) destroys them. The retention obligation wants the former during the window; an erasure right may want the latter — and the two cannot both be the default.
4. **History preservation.** Even a soft-deleted/edited row should leave an immutable trail of what it was and when it changed (this is distinct from, and complementary to, the audit trail in ADR-019).

Per **AGENT.md §2**, data retention, deletion, and erasure are an **escalation carve-out** the Architecture Agent must not self-resolve. That carve-out was originally recorded as **OD-004 (no default)**. A 2026-06-14 design session has now resolved the policy questions **in the requirements layer**, where they belong: REQ-FILE-005/006/013/014/015 ratify the retention window, soft-delete-within-window, accountant-confirmed-and-never-automatic post-retention purge, indefinite legal-hold suspension, and the retention-over-erasure precedence (client erasure = access-revocation only during the window). OD-004 is therefore **resolved**, and this ADR decides only the *architecture that makes those requirements expressible*.

Scope is **how, not what**: the retention *duration*, the purge *policy* (accountant-confirmed, never automatic), the legal-hold *behavior*, and the retention-vs-erasure *precedence* are all product/requirements facts (REQ-FILE-005/006/013/014/015); this ADR decides the *mechanism* by which the system records, retains, ages, and (when the accountant confirms) removes data.

## Decision

**We will adopt a soft-delete-first lifecycle backed by temporal-table history, with an explicit retention clock per retainable entity anchored at engagement completion, and route every physical removal ("purge") through the admin pool. Purge is in v1: it is an admin-pool, accountant-confirmed, audit-logged action that never fires automatically on retention-window expiry (REQ-FILE-013); a legal-hold flag suspends purge indefinitely (REQ-FILE-014); and during the retention window a client erasure request is honored as access-revocation only, never physical removal (REQ-FILE-015). The policy these mechanisms implement is owned by the requirements layer; this ADR decides the mechanism.**

### 1. Soft-delete-first is the default lifecycle (decided)

Every client-scoped, retention-relevant entity — `User`, `Engagement`, `Document` (already, ADR-009), `Folder`, `Thread`, `Message`, `OnboardingState`, and their kin — carries a **tombstone column** (`deletedAt DATETIMEOFFSET NULL`, per ADR-002's timestamp convention) rather than being removed by `DELETE`. Application code never issues a physical `DELETE` on these tables on the request path; "delete" means "set `deletedAt`."

- Soft-deleted rows are filtered from CLIENT views by the RLS predicate's `deletedAt IS NULL` clause (ADR-005), and remain visible to ACCOUNTANT in an archive view (ADR-009 already establishes this for `Document` — this generalizes the pattern).
- This realizes the never-lose-access principle ("clients never lose access; soft-delete only") as a schema-wide invariant, not a per-table afterthought.

### 2. Temporal tables are the history mechanism (decided)

Retention-sensitive tables use SQL Server **system-versioned temporal tables** (`SYSTEM_VERSIONING = ON`, period columns `ValidFrom`/`ValidTo`), per ADR-002's named-but-undecided mechanism, defined on the **raw-SQL migration track** (`db/migrations/`, Track B — Prisma cannot express system-versioning).

- Temporal history gives every edit and soft-delete an immutable prior-state record in the `*_History` side table, surviving restores into a different server timezone (the `DATETIMEOFFSET` rationale, ADR-002).
- **This is data-state history, not the audit trail.** Temporal tables answer "what did this row look like at time T"; the audit trail (ADR-019) answers "who did what, when, and from where." They are complementary and separately governed — temporal history is in scope here; access/action logging is ADR-019's.
- Temporal tables stay inside the **box SQL Server 2022 ∩ Azure SQL Database intersection** (ADR-013) — system-versioning is in the intersection; this adds no portability risk.

### 3. A retention clock per retainable entity, anchored at engagement completion (decided)

Each retainable entity records the inputs needed to compute a retention deadline — most importantly the **engagement-completion timestamp** (the 7-year clock starts at engagement completion, per REQ-FILE-005 / ADR-009 / intake force 6) — so that a deadline is *computable*.

- The 7-year *duration* is the product requirement (REQ-FILE-005) and is encoded as a configurable retention-window value (defaulting to 7 years), not hard-coded magic.
- **What happens at expiry is now decided by requirements:** expiry creates *purge-eligibility only* — it never triggers automatic deletion (REQ-FILE-013 AC-04). A purge-eligible engagement remains retained and accessible until the accountant explicitly confirms a purge (REQ-FILE-013 AC-05). The clock produces eligibility; the accountant pulls the trigger (§5).

### 4. "Delete a client / delete an engagement" and client erasure are governed lifecycle operations, not a row DELETE (decided)

These are admin-pool, audit-logged (ADR-019), tombstone-setting operations that respect the retention clock and never physically remove data on the request path. The semantics are now governed by requirements:

- **Soft-delete (accountant-only) within the window** sets `deletedAt`; the bytes and row are retained through the retention period (REQ-FILE-004, REQ-FILE-006). No physical removal occurs until a confirmed post-retention purge (§5).
- **A client erasure request, during the retention window, is honored as access-revocation only** (REQ-FILE-015): the client's ability to view their engagement data may be ended, but no document or engagement row is physically removed. The access-revocation *mechanism* is an AUTH/IDNT concern; this ADR's lifecycle side simply guarantees retention is not violated by an erasure request mid-window.
- **Wholesale permanent deletion of a client identity + all history (REQ-IDNT-005) remains deferred from v1** — it is out of scope here and not enabled by these mechanisms.

This generalizes ADR-009's CLARIF-005 (document hard-delete) to the whole entity graph; the policy that CLARIF-005 left unratified is now settled by REQ-FILE-013/014/015.

### 5. Post-retention purge is an admin-pool, accountant-confirmed, audit-logged action — never automatic (decided; in v1)

Any physical removal of rows or storage objects is an **admin-pool** operation (ADR-003 §7, ADR-005 §4), audit-logged (ADR-019), and never reachable from a client request handler. Per REQ-FILE-013, the trigger semantics are now decided and purge is **in v1**:

- **Purge-eligibility is gated on the retention clock** (§3): an engagement becomes purge-eligible only after its 7-year window has elapsed (REQ-FILE-013 AC-01) and no legal hold is active (REQ-FILE-014, §6).
- **Purge is accountant/admin-only and requires explicit confirmation** (REQ-FILE-013 AC-02/03). The system **never purges automatically** on expiry (AC-04); the retention-purge cron's role is to surface *eligibility* and execute an accountant-confirmed purge — it does **not** autonomously destroy data. (Removes the prior "purge deferred to post-v1" hedging: the purge mechanism ships in v1.)
- **The purge audit record survives the purge** (REQ-FILE-013 AC-06, REQ-NFR-010 AC-07): "engagement X was purged by accountant Y at time T" persists in the audit store (ADR-019), which is **excluded from the purge job** — the audit trail is not subject to this lifecycle's destructive sweep.
- Storage-object purge is coordinated with DB purge per ADR-009's two-track lifecycle (a tombstoned `Document` row's bytes survive until the confirmed purge action fires).

### 6. Legal-hold is a first-class purge blocker (decided)

A **legal-hold** marker (a hold flag/record on an engagement, or on a client to cover all their engagements) is a first-class concept that, when set, **suspends purge-eligibility indefinitely** regardless of the retention clock (REQ-FILE-014). Mechanism, per the requirement:

- A hold can be placed on an engagement (AC-01) or a client (AC-02, extends to all their engagements). While active, the engagement **cannot be purged even if its 7-year window has elapsed** (AC-03).
- A hold persists **indefinitely until the accountant explicitly lifts it** — it does not auto-expire (AC-04); lifting restores normal purge-eligibility if the window has elapsed (AC-05).
- **Both placing and lifting a hold are audit-logged** (REQ-FILE-014 AC-06/07 → ADR-019).
- This makes the precedence order explicit (REQ-FILE-015): **(1) legal hold** → **(2) retention window** → **(3) purge-eligible + no hold → accountant-confirmed purge**.

### What is decided

| Aspect | Status |
|---|---|
| Soft-delete-first as the schema-wide default | **Decided** (REQ-FILE-006) |
| Temporal tables as the history mechanism (raw-SQL track) | **Decided** |
| Retention clock anchored at engagement completion (7-year configurable duration) | **Decided** (REQ-FILE-005) |
| Post-retention purge: admin-pool, **accountant-confirmed, never automatic**, audit-logged — **in v1** | **Decided** (REQ-FILE-013) |
| Legal-hold suspends purge indefinitely until lifted; place/lift audited | **Decided** (REQ-FILE-014) |
| Retention governs in-window; client erasure = access-revocation only | **Decided** (REQ-FILE-015) |
| "Delete client/engagement" = accountant-only governed tombstone op, never request-path DELETE | **Decided** (REQ-FILE-004/006) |
| Audit records survive purge (audit store excluded from the purge job) | **Decided** (REQ-NFR-010 AC-07) |
| Wholesale client-identity erasure (REQ-IDNT-005) | **Deferred from v1** (out of scope here) |

## Consequences

- **Schema is shaped from day one.** Tombstone columns, period columns for temporal tables, the engagement-completion timestamp that anchors the retention clock, **and a legal-hold marker** are part of the Epic 001 schema, not a later bolt-on. **Code follow-up flagged for `[webapp-developer]`:** soft-delete columns on all retainable entities; `SYSTEM_VERSIONING = ON` temporal-table DDL on the raw-SQL track (`db/migrations/`); a configurable retention-window value; the retention-clock anchor column; a legal-hold flag/record (engagement- and client-scoped); the accountant-confirmed purge admin-pool action (with an explicit confirmation step, eligibility gated on elapsed window AND no active hold) and its audit emission (ADR-019); the audit store **excluded** from the purge job.
- **The full lifecycle, including the destructive end, is buildable in v1.** Purge ships in v1 as an accountant-confirmed, never-automatic, audit-logged admin-pool action (REQ-FILE-013); legal hold (REQ-FILE-014) and the retention-over-erasure precedence (REQ-FILE-015) are decided. No part is blocked on an open decision.
- **CLARIF-005 (ADR-009) is settled by the same requirements.** ADR-009 carved out document-storage hard-delete (CLARIF-005, requirements-side); REQ-FILE-013/014/015 now ratify the policy for the whole entity graph, settling both scopes. ADR-009 stays Accepted (its mechanism is unchanged); this ADR provides the entity-graph lifecycle mechanism.
- **Temporal-table maintenance burden.** System-versioned tables grow a history side-table; **temporal-history retention is governed by the same accountant-confirmed purge** (history is engagement data too) — a confirmed engagement purge takes its history side-rows with it. For a solo-accountant-scale portal the near-term accumulation is acceptable.
- **Audit trail is a separate system (ADR-019).** Do not conflate temporal history (row state over time) with the audit log (who/what/when/where). They have different data rules — see ADR-019.
- **Portability preserved.** All mechanisms (soft-delete columns, temporal tables, `DATETIMEOFFSET`) are inside the ADR-013 box/Azure SQL intersection. No new lock-in.

## Alternatives considered

- **Hard-delete by default, no soft-delete.** Rejected outright — violates the never-lose-access principle this ADR enforces ("clients never lose access") and makes the 7-year retention obligation unenforceable (deleted rows cannot be retained). A non-starter for a records-retention-bound tax portal.
- **Application-maintained shadow history tables instead of temporal tables.** Rejected — re-implements in app code what SQL Server 2022 gives natively (and ADR-002 already named), is error-prone, and adds a second source of truth for row history. Temporal tables are in the box/Azure intersection, so there is no portability reason to hand-roll.
- **Resolve the deletion/erasure/purge policy inside this ADR (the architecture layer).** Rejected — AGENT.md §2: deletion, erasure, data retention, and the retention-vs-erasure conflict are escalation matter the user must own. They were originally held as OD-004 (no default) and have now been ratified **in the requirements layer** (REQ-FILE-013/014/015), where product policy belongs. This ADR cites those requirements as `source:` and decides only the mechanism — keeping the *what* in requirements and the *how* here.
- **Make purge automatic on retention-window expiry (a scheduled sweep that destroys data when the clock elapses).** Rejected — REQ-FILE-013 (AC-04) mandates that expiry creates *eligibility only*, never automatic deletion; permanent destruction of professional records must be accountant-initiated and explicitly confirmed. The retention-purge cron surfaces eligibility and executes confirmed purges; it never autonomously destroys data.
- **Fold the lifecycle into ADR-009 by amending it.** Rejected — ADRs are immutable, and ADR-009 is scoped to the *document/storage* slice. The lifecycle spans the whole entity graph and the DB-history mechanism, which is broader than ADR-009's remit; a new ADR that `related:`-links ADR-009 (and shares its carve-out) is the right shape.
- **Defer the whole lifecycle until Epic 008 (when hard-delete lands).** Rejected — the *schema-shaping* parts (soft-delete columns, temporal tables, retention-clock anchor) must exist from Epic 001 or they are an expensive retrofit. Deferring only the destructive *policy* (OD-004) is the correct seam.
