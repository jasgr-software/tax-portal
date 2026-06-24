---
id: EPIC-015
title: Post-retention purge & legal hold
phase: 3
status: delivered
slice: After an engagement's 7-year retention window elapses, its data becomes purge-eligible; the accountant — and only the accountant, with an explicit confirmation, never automatically — may permanently purge it, unless a legal hold (on the engagement or the client) suspends eligibility indefinitely; the purge audit record survives the purge.
requirements:
  - REQ-FILE-013: [AC-FILE-013-01, AC-FILE-013-02, AC-FILE-013-03, AC-FILE-013-04, AC-FILE-013-05, AC-FILE-013-06]
  - REQ-FILE-014: [AC-FILE-014-01, AC-FILE-014-02, AC-FILE-014-03, AC-FILE-014-04, AC-FILE-014-05, AC-FILE-014-06, AC-FILE-014-07]
  - REQ-FILE-015: [AC-FILE-015-01, AC-FILE-015-02]
  - REQ-NFR-010: [AC-NFR-010-07]
architecture:
  - ADR-018   # data-retention lifecycle — purge admin-pool/accountant-confirmed/never-automatic; legal hold; precedence
  - ADR-005   # RLS — purge is an admin-pool path, never reachable from a client request handler
  - ADR-002   # SQL Server — temporal history is purged with the engagement; admin-pool destructive DDL on the raw-SQL track
  - ADR-019   # audit trail — purge + hold place/lift are recorded; the audit store is EXCLUDED from the purge job
  - ADR-009   # signed-URL access — storage-object purge coordinated with DB purge (two-track lifecycle)
  - ADR-003   # SESSION_CONTEXT — purge/hold run under the accountant/admin principal only
  - ADR-006   # monorepo — purge + legal-hold management live in apps/admin
  - ADR-012   # testing pyramid — tiers the AC tests must hit (eligibility gating, never-automatic, hold-blocks-purge, audit-survives are hard gates)
depends_on: [EPIC-014, EPIC-010]
source:
  - .requirements/REQ-FILE-013.md
  - .requirements/REQ-FILE-014.md
  - .requirements/REQ-FILE-015.md
  - .requirements/REQ-NFR-010.md
  - .architecture/decisions/ADR-018-data-retention-lifecycle.md
open_questions: []
---

# EPIC-015 — Post-retention purge & legal hold

> A **preparation document**, not build instructions. It states what this slice delivers, which
> acceptance criteria it owns, which architecture it must adhere to, and the test contract sign-off
> requires — not how to build it.

## Vertical slice
This slice delivers the **destructive end** of the document lifecycle — the only path by which retained
engagement data ever physically leaves the system — under tight, accountant-controlled governance. Once an
engagement's **7-year retention window has elapsed**, its data becomes **purge-eligible**; from the Tax
Portal (`apps/admin`) the **accountant** (admin role only) may **purge** it, but only after an **explicit
confirmation**, and the system **never** purges automatically on expiry — expiry creates *eligibility*, not
deletion. A **legal hold** placed on an engagement (or on a client, covering all their engagements)
**suspends** purge eligibility **indefinitely**, overriding the retention clock, until the accountant
explicitly **lifts** it. During the retention window a client erasure request is honored as
**access-revocation only**, never physical removal. The **precedence** is explicit: legal hold → retention
window → purge-eligible-and-no-hold. Each purge, and each hold placement/lift, is audit-logged, and the
**audit record survives the purge** ("engagement X was purged by Y at T" persists). It builds on EPIC-014
(the retention clock + soft-delete it stood up).

> **Governance scope.** This epic owns the post-retention destructive lifecycle (purge), the legal-hold
> blocker, the retention-vs-erasure precedence, and the audit-survives-purge guarantee. It is the last
> Phase-3 FILE epic. **Wholesale client-identity hard-delete (REQ-IDNT-005) remains deferred from v1.**

## Requirements delivered

- **REQ-FILE-013 — Post-retention purge is accountant-confirmed and never automatic**
  - **AC-FILE-013-01** — data becomes purge-eligible only after the 7-year window elapses; in-window data cannot be purged.
  - **AC-FILE-013-02** — purge is accountant/admin-only; no client-facing path initiates or requests it.
  - **AC-FILE-013-03** — an explicit confirmation is required before any data is permanently removed.
  - **AC-FILE-013-04** — the system never automatically purges on window expiry; expiry only creates eligibility.
  - **AC-FILE-013-05** — purge-eligible-but-not-yet-purged data remains accessible and retained until the accountant confirms removal.
  - **AC-FILE-013-06** — each purge is recorded in the audit trail and that record is not removed by the purge itself.
- **REQ-FILE-014 — Legal hold suspends purge indefinitely until lifted**
  - **AC-FILE-014-01** — the accountant can place a legal hold on an individual engagement.
  - **AC-FILE-014-02** — the accountant can place a legal hold on a client, applying it to all their engagements.
  - **AC-FILE-014-03** — an engagement under hold cannot be purged even if its window has elapsed.
  - **AC-FILE-014-04** — a hold remains in effect indefinitely until explicitly lifted; it does not auto-expire.
  - **AC-FILE-014-05** — the accountant can lift a hold; lifting restores normal eligibility if the window has elapsed.
  - **AC-FILE-014-06** — placing a hold is recorded in the audit trail (who, on what, when).
  - **AC-FILE-014-07** — lifting a hold is recorded in the audit trail (who, on what, when).
- **REQ-FILE-015 — Retention governs in-window; client erasure = access-revocation only**
  - **AC-FILE-015-01** — during the window, no client erasure request physically removes any document/engagement data; it is satisfied by access-revocation only.
  - **AC-FILE-015-02** — physical destruction is impossible until the window has elapsed and any legal hold is lifted, then requires explicit accountant-confirmed purge.
- **REQ-NFR-010 — Audit trail** *(the audit-survives-purge AC; the remaining NFR-010 feature AC are owned by the audit-trail slice)*
  - **AC-NFR-010-07** — when an engagement's data is purged, the audit records for that engagement — including the purge event itself — are not removed; they survive the purge.

## Architecture adherence
- **ADR-018 — Data-retention lifecycle.** Implements §5 (post-retention purge: admin-pool,
  accountant-confirmed, **never automatic**, audit-logged; eligibility gated on elapsed window **and** no
  active hold), §6 (legal hold suspends purge indefinitely; place/lift audited), and the §6 precedence order
  (hold → window → purge-eligible). The purge cron surfaces eligibility and executes a *confirmed* purge — it
  never autonomously destroys data.
- **ADR-005 — RLS via security policies.** Purge is an **admin-pool** operation, never reachable from a
  client request handler (AC-FILE-013-02). A hard tier-3 obligation.
- **ADR-002 — SQL Server.** A confirmed engagement purge takes its temporal **history side-rows** with it;
  destructive DDL is on the raw-SQL/admin-pool track.
- **ADR-019 — Audit trail.** Purge confirmations and legal-hold place/lift are recorded admin actions; the
  **audit store is EXCLUDED from the purge job** so the purge record survives (AC-FILE-013-06, AC-NFR-010-07).
- **ADR-009 — Signed-URL access.** Storage-object purge is coordinated with DB purge (the two-track
  lifecycle) — a tombstoned document's bytes survive until the confirmed purge fires.
- **ADR-003 — SESSION_CONTEXT.** Purge and hold place/lift run under the accountant/admin principal only.
- **ADR-006 — Monorepo, two apps.** Purge + legal-hold management live in `apps/admin`; nothing in
  `apps/portal` can purge, hold, or lift.
- **ADR-012 — Testing pyramid.** Eligibility gating, never-automatic, hold-blocks-purge-post-expiry,
  in-window-erasure-is-access-revocation, and audit-survives-purge are hard tier-3 integration/security; the
  accountant purge-confirm and place/lift-hold journeys are tier-6 e2e.

## Acceptance scenarios

### AC-FILE-013-01 — Purge-eligible only after the window elapses
```gherkin
Given an engagement whose 7-year retention window has not elapsed
When a purge is attempted
Then it is not purge-eligible and cannot be purged
```

### AC-FILE-013-02 — Purge is accountant/admin-only
```gherkin
Given the client surface
When it is examined for a purge capability
Then no client-facing path initiates or requests a purge; purge is accountant/admin-only
```

### AC-FILE-013-03 — Explicit confirmation is required
```gherkin
Given a purge-eligible engagement and the accountant initiating a purge
When she has not explicitly confirmed it
Then no data is permanently removed until she confirms
```

### AC-FILE-013-04 — Expiry never triggers an automatic purge
```gherkin
Given an engagement whose retention window has just elapsed
When no accountant action is taken
Then the system does not automatically purge it; expiry only creates eligibility
```

### AC-FILE-013-05 — Eligible-but-unpurged data stays accessible and retained
```gherkin
Given a purge-eligible engagement the accountant has not yet purged
When its data is accessed
Then it remains accessible and retained until she explicitly confirms removal
```

### AC-FILE-013-06 — The purge is audited and the record survives
```gherkin
Given a confirmed purge of an engagement's data
When the audit trail is examined afterward
Then the purge is recorded and that audit record is not removed by the purge
```

### AC-FILE-014-01 — Hold on an engagement
```gherkin
Given the accountant and an engagement
When she places a legal hold on it
Then the engagement is under legal hold
```

### AC-FILE-014-02 — Hold on a client applies to all their engagements
```gherkin
Given a client with multiple engagements
When the accountant places a legal hold on the client
Then the hold applies to all of that client's engagements
```

### AC-FILE-014-03 — A held engagement cannot be purged even post-expiry
```gherkin
Given an engagement under legal hold whose 7-year window has elapsed
When a purge is attempted
Then it cannot be purged while the hold is active
```

### AC-FILE-014-04 — A hold does not auto-expire
```gherkin
Given an active legal hold
When time passes with no explicit action
Then the hold remains in effect indefinitely until the accountant lifts it
```

### AC-FILE-014-05 — Lifting a hold restores eligibility if the window elapsed
```gherkin
Given an engagement under legal hold whose retention window has elapsed
When the accountant lifts the hold
Then normal purge eligibility is restored
```

### AC-FILE-014-06 — Placing a hold is audited
```gherkin
Given the accountant placing a legal hold
When the action completes
Then it is recorded in the audit trail (who, on what, when)
```

### AC-FILE-014-07 — Lifting a hold is audited
```gherkin
Given the accountant lifting a legal hold
When the action completes
Then it is recorded in the audit trail (who, on what, when)
```

### AC-FILE-015-01 — In-window client erasure is access-revocation only
```gherkin
Given a client erasure request during an engagement's retention window
When it is honored
Then no document or engagement data is physically removed; the request is satisfied by access-revocation only
```

### AC-FILE-015-02 — Physical destruction only post-window, no hold, confirmed
```gherkin
Given retained engagement data
When physical destruction is attempted
Then it is impossible until the window has elapsed and any legal hold is lifted, and then only via explicit accountant-confirmed purge
```

### AC-NFR-010-07 — Audit records survive the purge
```gherkin
Given an engagement whose data has been purged
When the audit trail for that engagement is examined
Then its audit records — including the purge event — are not removed; they survive the purge
```

## Traceability & sign-off contract
- Each in-scope AC must be covered by **automated test(s) tagged with its AC id** (the test
  title/annotation contains the `AC-FILE-013-NN` / `AC-FILE-014-NN` / `AC-FILE-015-NN` / `AC-NFR-010-07`
  id), at the prescribed tier(s).
- An AC is **implemented** only when its tagged test(s) **pass in CI**.
- This epic is **delivered** only when **all** its in-scope AC are `verified` in `COVERAGE.md`.
- Suggested tier mapping (per ADR-012):
  - **service integration / security (tier 3)** — AC-FILE-013-01/-02/-04/-05/-06, AC-FILE-014-02/-03/-04/-05,
    AC-FILE-015-01/-02, AC-NFR-010-07 (the eligibility gating, never-automatic, hold-blocks-purge,
    in-window-access-revocation, and audit-survives-purge invariants).
  - **e2e (tier 6)** — AC-FILE-013-03 (confirm-before-purge), AC-FILE-014-01/-06 (place hold + audit),
    AC-FILE-014-07 (lift hold + audit).

## Out of scope
- **The in-window lifecycle** — accountant-only delete, soft-delete, 7-year retention floor (REQ-FILE-004/
  006/005, REQ-NFR-006) → **EPIC-014** (predecessor). This epic governs only what happens *after* the window.
- **The file-exchange surface** (upload/download/folders/versioning) → **EPIC-013**.
- **Wholesale client-identity hard-delete** (REQ-IDNT-005) → **deferred from v1** (ADR-018; OQ-004).
- **The access-revocation mechanism** behind AC-FILE-015-01 (how a client's view is ended) → an **AUTH/IDNT**
  concern; this epic owns only the retention-side guarantee that in-window erasure does not physically remove
  data.
- **The rest of the audit-trail feature** (REQ-NFR-010-01..06 — document-access logging, transition logging,
  the accountant-only audit *read* surface, audit retention) → a dedicated **audit-trail slice** (Phase 4).
  This epic claims only **AC-NFR-010-07** (audit survives purge), which is exclusively demonstrable here.

## Links
- Requirements: REQ-FILE-013, REQ-FILE-014, REQ-FILE-015, REQ-NFR-010 (AC-07 only)
- Architecture: ADR-002, ADR-003, ADR-005, ADR-006, ADR-009, ADR-012, ADR-018, ADR-019
- Personas: `personas/jane-accountant.md` (records-retention obligation, legal hold during a dispute, post-retention cleanup)
- Flows: `flows/flow-document-lifecycle.md` (extended with the purge-eligible → confirmed-purge path and the legal-hold branch)
- Epics: depends on EPIC-014 (retention clock + soft-delete) and EPIC-010 (completion anchors the clock); last Phase-3 FILE epic
- Open questions: none
