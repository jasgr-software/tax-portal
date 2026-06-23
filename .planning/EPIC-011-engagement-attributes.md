---
id: EPIC-011
title: Engagement attributes — due date, internal notes, priority flag
phase: 3
status: delivered
slice: The accountant attaches working metadata to an engagement — a due date she can set and update, private internal notes only she can see, and a priority/flag marker she can set and clear — to plan and triage her workload.
requirements:
  - REQ-LIFE-007: [AC-LIFE-007-01, AC-LIFE-007-02, AC-LIFE-007-03]
  - REQ-LIFE-008: [AC-LIFE-008-01, AC-LIFE-008-02, AC-LIFE-008-03]
  - REQ-LIFE-009: [AC-LIFE-009-01, AC-LIFE-009-02, AC-LIFE-009-03]
architecture:
  - ADR-005   # RLS — internal notes are accountant-only; never readable by a client principal
  - ADR-003   # SESSION_CONTEXT — attribute writes/reads run under the accountant principal
  - ADR-006   # monorepo — attribute management lives in apps/admin
  - ADR-019   # audit trail — attribute changes are recorded events
  - ADR-012   # testing pyramid — tiers the AC tests must hit (notes-confidentiality is a hard tier-3 gate)
depends_on: [EPIC-010]
source:
  - .requirements/REQ-LIFE-007.md
  - .requirements/REQ-LIFE-008.md
  - .requirements/REQ-LIFE-009.md
  - .architecture/decisions/ADR-005-rls-via-security-policies.md
open_questions: []
---

# EPIC-011 — Engagement attributes — due date, internal notes, priority flag

> A **preparation document**, not build instructions. It states what this slice delivers, which
> acceptance criteria it owns, which architecture it must adhere to, and the test contract sign-off
> requires — not how to build it.

## Vertical slice
This slice gives the **accountant** the working metadata she needs to plan and triage her caseload, hung
off each engagement in the Tax Portal (`apps/admin`). She can set and later update a **due date** on an
engagement; record private **internal notes** that are visible to her alone and **never** exposed to the
client or any engagement participant; and **flag** an engagement as a priority and later remove that flag.
Each attribute belongs to the individual engagement. It builds on EPIC-010 (the engagement workspace where
these attributes are surfaced and managed). The confidentiality of internal notes is the security-sensitive
property of this slice: a client principal must never be able to read them through any path.

> **Attributes-only scope.** This epic owns the three accountant-managed engagement attributes. It does
> **not** surface them on a dashboard / needs-action feed or drive overdue reminders — those are **Phase 4**
> (DASH/MSG). The due date set here is the input a later dashboard/reminder slice consumes; this slice only
> establishes that the attribute exists and is accountant-managed.

## Requirements delivered

- **REQ-LIFE-007 — Per-engagement due date**
  - **AC-LIFE-007-01** — the accountant can set a due date on an engagement.
  - **AC-LIFE-007-02** — the accountant can update an engagement's due date after it has been set.
  - **AC-LIFE-007-03** — a due date is an attribute of the individual engagement.
- **REQ-LIFE-008 — Accountant-only internal notes per engagement**
  - **AC-LIFE-008-01** — the accountant can record internal notes on an engagement.
  - **AC-LIFE-008-02** — internal notes are visible only to the accountant.
  - **AC-LIFE-008-03** — internal notes are never shown to a client or any engagement participant.
- **REQ-LIFE-009 — Engagement flagging and prioritization**
  - **AC-LIFE-009-01** — the accountant can flag/mark an engagement as prioritized.
  - **AC-LIFE-009-02** — the accountant can remove the flag/priority marker.
  - **AC-LIFE-009-03** — the flag/priority marker is set per individual engagement.

## Architecture adherence
- **ADR-005 — RLS via security policies.** Internal notes are **accountant-only**: the security policy
  governing notes must block read for any client principal (a BLOCK/own-row family like the accountant-only
  `Notification` policy). The per-policy test — a client principal reads **zero** notes; null SESSION_CONTEXT
  reads zero; ACCOUNTANT reads — is a **hard** tier-3 requirement (AC-LIFE-008-02/-03).
- **ADR-003 — SESSION_CONTEXT.** Attribute writes and reads run under the accountant's propagated identity;
  the client principal can never satisfy the notes-read or attribute-write path.
- **ADR-006 — Monorepo, two apps.** Due-date, notes, and flag management live in `apps/admin`; nothing in
  `apps/portal` exposes internal notes.
- **ADR-019 — Audit trail.** Setting/updating a due date, recording notes, and flagging/unflagging are
  recorded audit events.
- **ADR-012 — Testing pyramid.** The notes-confidentiality boundary is a hard tier-3 integration/security
  obligation; the accountant set/update/flag journeys are tier-6 e2e; the per-engagement attribution is
  tier-2/3.

## Acceptance scenarios

### AC-LIFE-007-01 — The accountant sets a due date
```gherkin
Given the accountant viewing an engagement with no due date
When she sets a due date on it
Then the engagement carries that due date
```

### AC-LIFE-007-02 — The accountant updates a due date
```gherkin
Given an engagement that already has a due date
When the accountant changes it to a new date
Then the engagement's due date reflects the new value
```

### AC-LIFE-007-03 — A due date belongs to the individual engagement
```gherkin
Given two distinct engagements
When the accountant sets a due date on one
Then only that engagement carries the due date and the other is unaffected
```

### AC-LIFE-008-01 — The accountant records internal notes
```gherkin
Given the accountant viewing an engagement
When she records an internal note on it
Then the note is stored against that engagement
```

### AC-LIFE-008-02 — Internal notes are visible only to the accountant
```gherkin
Given an engagement with an internal note
When the note's visibility is examined
Then only the accountant can read it
```

### AC-LIFE-008-03 — Internal notes are never shown to a client or participant
```gherkin
Given an engagement with an internal note and a client participant on that engagement
When the client participant accesses the engagement through any portal path
Then the internal note is never shown to them
```

### AC-LIFE-009-01 — The accountant flags an engagement as priority
```gherkin
Given the accountant viewing an unflagged engagement
When she flags it as a priority
Then the engagement is marked as prioritized
```

### AC-LIFE-009-02 — The accountant removes the priority flag
```gherkin
Given a flagged engagement
When the accountant removes the flag
Then the engagement is no longer marked as prioritized
```

### AC-LIFE-009-03 — The priority flag is per individual engagement
```gherkin
Given two distinct engagements
When the accountant flags one as a priority
Then only that engagement is flagged and the other is unaffected
```

## Traceability & sign-off contract
- Each in-scope AC must be covered by **automated test(s) tagged with its AC id** (the test
  title/annotation contains the `AC-LIFE-007-NN` / `AC-LIFE-008-NN` / `AC-LIFE-009-NN` id), at the
  prescribed tier(s).
- An AC is **implemented** only when its tagged test(s) **pass in CI**.
- This epic is **delivered** only when **all** its in-scope AC are `verified` in `COVERAGE.md`.
- Suggested tier mapping (per ADR-012):
  - **service integration / security (tier 3)** — AC-LIFE-007-03, AC-LIFE-008-02/-03 (the hard
    notes-confidentiality per-policy test), AC-LIFE-009-03.
  - **e2e (tier 6)** — AC-LIFE-007-01/-02 (set/update due date), AC-LIFE-008-01 (record a note),
    AC-LIFE-009-01/-02 (flag / unflag).

## Out of scope
- **Dashboard surfacing of due dates, notes, and priority** (REQ-DASH-006 internal notes on the dashboard,
  REQ-DASH-007 priority markers) → **Phase 4** (the accountant dashboard).
- **Overdue-document-request reminders & reminder cadence** (REQ-FILE-012, REQ-DASH-008, REQ-MSG-018) →
  **Phase 4** (the reminder/notification engine). The due date here is an engagement attribute, not a
  reminder trigger.
- **Whether a due date is mandatory at engagement creation** — provisional v1 default is optional (set at
  creation or later, per REQ-LIFE-007 Notes); engagement creation itself is **EPIC-012**.

## Links
- Requirements: REQ-LIFE-007, REQ-LIFE-008, REQ-LIFE-009
- Architecture: ADR-003, ADR-005, ADR-006, ADR-012, ADR-019
- Personas: `personas/jane-accountant.md` (workload planning, private notes, triage)
- Flows: `flows/flow-engagement-lifecycle.md` (extended with the accountant's attribute-management branch)
- Epics: depends on EPIC-010 (engagement workspace); sibling of EPIC-012
- Open questions: none
