---
id: EPIC-023
title: Accountant audit-trail read surface — the security record, complete & tamper-evident
phase: 4
status: planned
slice: The accountant has an accountant-only audit-trail surface recording document access, engagement status transitions, all admin actions, and authentication events — each capturing actor, action, time, and outcome — retained ≥7 years, readable only by her, with the trail exhibiting tamper-evidence and completeness; this closes the deferred REQ-NFR-010 read surface and completes the v1 POC.
requirements:
  - REQ-NFR-010: [AC-NFR-010-01, AC-NFR-010-02, AC-NFR-010-03, AC-NFR-010-04, AC-NFR-010-05, AC-NFR-010-06]
  - REQ-NFR-011: [AC-NFR-011-01, AC-NFR-011-02]
architecture:
  - ADR-019   # audit-trail logging — the mechanism this slice surfaces; defines what is recorded and how
  - ADR-005   # RLS — the audit trail is accountant-only; a client reads zero audit records on any path
  - ADR-003   # SESSION_CONTEXT — audit writes capture the propagated actor identity; reads run under the accountant principal
  - ADR-018   # data retention — audit records retained ≥7 years; survive engagement purge (per EPIC-015)
  - ADR-006   # monorepo — the audit read surface is an apps/admin-only screen
  - ADR-012   # testing pyramid — accountant-only access + completeness (audit-or-fail) are hard tier-3 gates
depends_on: [EPIC-015, EPIC-010, EPIC-013]
source:
  - .requirements/REQ-NFR-010.md
  - .requirements/REQ-NFR-011.md
  - .architecture/decisions/ADR-019-audit-trail-logging.md
  - .architecture/decisions/ADR-005-rls-via-security-policies.md
open_questions: []
---

# EPIC-023 — Accountant audit-trail read surface — the security record, complete & tamper-evident

> A **preparation document**, not build instructions. It states what this slice delivers, which
> acceptance criteria it owns, which architecture it must adhere to, and the test contract sign-off
> requires — not how to build it.

## Vertical slice
This slice delivers the **accountant-only audit-trail read surface** and closes the audit-trail **feature**
that earlier phases deferred. The audit *mechanism* (ADR-019) already exists and every relevant slice
(EPIC-013/014/015 and others) **emits** events into it; what is missing is the **read surface** and the
guarantee that the full minimum event set is captured. This epic surfaces, on the Tax Portal (`apps/admin`)
and **only** there, a continuous record of security-significant events: **document access/downloads**,
**engagement status transitions**, **all accountant/admin actions** (purge confirmations, legal-hold
place/lift, file deletions, invitation issuances, accept/decline decisions, …), and
**authentication-significant events** (login, logout, failed authentication) — each capturing the **actor,
the action, the time, and the outcome**. The trail is **readable only by the accountant** (a client cannot
read any part of it, even for their own engagements), records are **retained ≥7 years** (at least as long
as the document-retention window) and **survive a purge** (the AC-NFR-010-07 guarantee delivered by
EPIC-015), and the trail exhibits **tamper-evidence** and **completeness** (no security-significant action
succeeds silently without a record). **EPIC-023 is the last Phase-4 slice — delivering it completes the
functional v1 POC** (Phase 5 then makes the mocked seams real).

> **Read surface + completeness scope.** This epic owns AC-NFR-010-**01..06** (the recording obligations
> plus the accountant-only read surface and ≥7-year retention) and REQ-NFR-011 (integrity properties).
> AC-NFR-010-**07** (audit survives purge) was delivered by **EPIC-015** and is not re-owned here.

## Requirements delivered

- **REQ-NFR-010 — Audit trail of security-significant events** (the read surface + recording set, less -07)
  - **AC-NFR-010-01** — records each document access/download (actor, document, time, outcome).
  - **AC-NFR-010-02** — records each engagement status transition (who, prior state, new state, time).
  - **AC-NFR-010-03** — records all accountant/admin actions (purge confirmations, legal-hold place/lift, file deletions, invitation issuances, accept/decline) with actor, action, affected resource, time.
  - **AC-NFR-010-04** — records authentication-significant events (login, logout, failed auth) with actor/attempted identity, event type, time.
  - **AC-NFR-010-05** — the audit trail is accessible **only** to the accountant/admin role; a client cannot read any part, including for their own engagements.
  - **AC-NFR-010-06** — audit records for an engagement are retained ≥7 years after its completion — at least as long as the engagement's document-retention window.
- **REQ-NFR-011 — Tamper-evident and complete**
  - **AC-NFR-011-01** — unauthorized alteration of an audit record is detectable (the trail is tamper-evident).
  - **AC-NFR-011-02** — no security-significant state change occurs without a corresponding audit record; audit failure for such an action is treated as failure of the action itself, not silently ignored.

## Architecture adherence
- **ADR-019 — Audit-trail logging.** This slice surfaces the existing audit mechanism and verifies the
  **minimum recorded event set** (-01..-04). The set is a floor, not a ceiling — implementation may record
  more. Events emitted by EPIC-013/014/015 are read here, not re-emitted.
- **ADR-005 — RLS via security policies.** The audit trail is **accountant-only**: a client principal reads
  **zero** audit records on any path, including for their own engagements. This is a **hard** tier-3 gate
  (AC-NFR-010-05) — the strongest read-isolation assertion in the system.
- **ADR-003 — SESSION_CONTEXT.** Audit writes capture the **propagated actor identity** (the accountability
  purpose of the trail); the read surface runs under the accountant principal.
- **ADR-018 — Data retention.** Audit records carry a ≥7-year retention (AC-NFR-010-06) and **survive
  engagement purge** — the AC-NFR-010-07 guarantee proven by EPIC-015's all-or-nothing
  `withAuditTransaction` envelope.
- **ADR-006 — Monorepo, two apps.** The audit read surface is an `apps/admin`-only screen; nothing on
  `apps/portal` exposes any audit record.
- **ADR-012 — Testing pyramid.** Accountant-only access and **completeness** (audit-or-the-action-fails) are
  hard tier-3 gates; the read surface and the recorded-event coverage are tier-3/tier-6.

## Acceptance scenarios

### AC-NFR-010-01 — Document access is recorded
```gherkin
Given a user accesses or downloads a document
When the access completes
Then an audit record captures the actor, the document, the time, and the outcome
```

### AC-NFR-010-02 — Status transitions are recorded
```gherkin
Given an engagement changes status
When the transition occurs
Then an audit record captures who triggered it, the prior state, the new state, and the time
```

### AC-NFR-010-03 — Admin actions are recorded
```gherkin
Given the accountant performs an admin action (e.g. a purge confirmation, a legal-hold placement, a file deletion, an invitation, an accept/decline)
When the action is taken
Then an audit record captures the actor, the action, the affected resource, and the time
```

### AC-NFR-010-04 — Authentication events are recorded
```gherkin
Given a login, logout, or failed authentication attempt occurs
When the event happens
Then an audit record captures the actor or attempted identity, the event type, and the time
```

### AC-NFR-010-05 — Audit trail is accountant-only
```gherkin
Given audit records exist, including for a client's own engagement
When that client attempts to read the audit trail through any path
Then they can read no part of it
```

### AC-NFR-010-06 — Audit retained ≥7 years
```gherkin
Given an engagement completed and its audit records generated
When time within 7 years of completion elapses
Then the audit records for that engagement remain retained and readable by the accountant
```

### AC-NFR-011-01 — Tamper-evidence
```gherkin
Given an existing audit record
When an unauthorized alteration of that record is attempted
Then the alteration is detectable
```

### AC-NFR-011-02 — Completeness (audit-or-fail)
```gherkin
Given a security-significant action whose audit record cannot be written
When the action is attempted
Then the action does not silently succeed without a record — the audit failure is treated as failure of the action itself
```

## Traceability & sign-off contract
- Each in-scope AC must be covered by **automated test(s) tagged with its AC id** (the test
  title/annotation contains the `AC-NFR-010-0N` / `AC-NFR-011-0N` id), at the prescribed tier(s).
- An AC is **implemented** only when its tagged test(s) **pass in CI**.
- This epic is **delivered** only when **all** its in-scope AC are `verified` in `COVERAGE.md`.
- Suggested tier mapping (per ADR-012):
  - **service integration / security (tier 3)** — AC-NFR-010-01/-02/-03/-04 (each event kind recorded with
    its required fields), AC-NFR-010-05 (the hard accountant-only read-isolation gate, proven both ways),
    AC-NFR-010-06 (retention floor), AC-NFR-011-02 (completeness: an un-auditable action rolls back —
    extends the EPIC-015 `withAuditTransaction` regression to the general case).
  - **e2e (tier 6)** — the accountant audit read surface renders and filters the trail; a client has no
    audit affordance on `apps/portal`.
  - **AC-NFR-011-01 (tamper-evidence)** — the property is asserted at the tier the chosen mechanism (e.g.
    append-only / chained records) makes verifiable; the test confirms an unauthorized mutation is detected.

## Out of scope
- **AC-NFR-010-07 (audit survives purge)** — delivered in **EPIC-015**; consumed/referenced here, not re-owned.
- **The audit *emission* in each feature path** — already an adherence obligation of EPIC-013/014/015 (and
  others). This slice owns the **read surface**, the **minimum-set completeness**, and the **integrity
  properties**, not re-instrumenting each emitter.
- **The tamper-evidence/ completeness *mechanism*** (cryptographic chaining, append-only storage,
  transactional coupling) — a **HOW** owned by `.architecture/` (ADR-019); this slice asserts the property.

## Links
- Requirements: REQ-NFR-010 (-01..-06), REQ-NFR-011
- Architecture: ADR-003, ADR-005, ADR-006, ADR-012, ADR-018, ADR-019
- Personas: `personas/jane-accountant.md` (legal/professional accountability; demonstrating proper data handling)
- Flows: `flows/flow-accountant-dashboard.md` (the audit-trail read branch); relates `flows/flow-document-lifecycle.md`, `flows/flow-file-exchange.md`
- Epics: depends on EPIC-015 (audit-survives-purge + `withAuditTransaction`), EPIC-010 (status transitions), EPIC-013 (document-access events); **closes Phase 4 / the v1 POC**
- Open questions: none
