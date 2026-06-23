---
id: BRIEF-011
title: Engagement attributes — accountant-set due date, accountant-only internal notes, priority/flag marker
status: ready
acceptance_criteria:
  # REQ-LIFE-007 — per-engagement due date
  - id: AC-LIFE-007-01
    text: "The accountant can set a due date on an engagement."
  - id: AC-LIFE-007-02
    text: "The accountant can update an engagement's due date after it has been set."
  - id: AC-LIFE-007-03
    text: "A due date is an attribute of the individual engagement (setting it on one engagement does not affect another)."
  # REQ-LIFE-008 — accountant-only internal notes
  - id: AC-LIFE-008-01
    text: "The accountant can record internal notes on an engagement."
  - id: AC-LIFE-008-02
    text: "Internal notes are visible only to the accountant."
  - id: AC-LIFE-008-03
    text: "Internal notes are never shown to a client or any engagement participant, through any portal path."
  # REQ-LIFE-009 — engagement flagging / prioritization
  - id: AC-LIFE-009-01
    text: "The accountant can flag/mark an engagement as prioritized."
  - id: AC-LIFE-009-02
    text: "The accountant can remove the flag/priority marker from an engagement."
  - id: AC-LIFE-009-03
    text: "The flag/priority marker is set per individual engagement (flagging one does not affect another)."
methodology:
  tdd: optional
  acceptance_format: gherkin
  e2e: required
  coverage_target: none
  extra_gates:
    - "Notes confidentiality — the HARD per-policy RLS test (HARD tier-3, ADR-005 §6, CS-SQL-001): internal notes are accountant-only. The security policy governing notes must be a BLOCK/own-row family like the accountant-only `Notification` policy (`pol_Notification`/`0004`) — NOT the client-isolation `pol_Engagement` family. A tier-3 integration test against the real SQL Server container proves: a CLIENT principal reads ZERO notes (AC-LIFE-008-02/-03); a null/anonymous SESSION_CONTEXT reads ZERO; the ACCOUNTANT reads. This is a hard rejection if missing or failing."
    - "Notes never reach the client surface (HARD tier-3 + tier-6, AC-LIFE-008-03, ADR-006/ADR-010): internal notes management lives in apps/admin ONLY; nothing in apps/portal exposes internal notes. Prove the negative server-side (a client-principal read returns no note) AND at tier-6 e2e (a client participant viewing the engagement in apps/portal never sees the note text), not only by UI absence in admin."
    - "Accountant-only attribute writes (HARD tier-3 access-control, ADR-003/ADR-005): setting/updating the due date, recording notes, and flagging/unflagging run SERVER-SIDE under the accountant's propagated identity (ADR-003); a CLIENT principal can never satisfy the attribute-write or notes-read path even on a direct call (not just UI absence)."
    - "Per-engagement attribution (tier-2/3, AC-LIFE-007-03/-008/-009-03): each attribute belongs to the individual engagement — setting a due date / recording a note / flagging on engagement A leaves engagement B unaffected. Prove distinct-engagement isolation of each attribute."
    - "Audit events (tier-3, ADR-019): setting/updating a due date, recording a note, and flagging/unflagging are each recorded audit events (who/what/when) — reuse the EPIC-003/004 audit seam (`packages/db/src/audit.ts`: `withAuditTransaction`/`recordAuthEvent`); do NOT invent a parallel audit path. The attribute write and its audit record should be atomic (one transaction)."
    - "Accountant journeys (tier-6 e2e, apps/admin): the accountant sets and updates a due date (AC-LIFE-007-01/-02), records a note (AC-LIFE-008-01), and flags then unflags an engagement (AC-LIFE-009-01/-02)."
    - "Container smoke (docker-compose stack) before Validate."
acceptance_scenarios: .planning/EPIC-011-engagement-attributes.md#acceptance-scenarios
demo:
  applicable: yes
  apps: [admin]
  personas: [jane-accountant]
  flows: [flow-engagement-lifecycle]
code_standards:
  - CS-TS-001    # request-scoped DB access only through packages/db wrapper (required)
  - CS-TS-002    # never import raw requestDb/adminDb pools outside packages/db (required)
  - CS-TS-003    # cross-surface parity — notes management admin-only; never surfaced in portal (recommended)
  - CS-TS-004    # server-action accountant-identity guard on attribute writes (experimental)
  - CS-SQL-001   # the accountant-only notes table ships a security policy + a per-principal RLS test (required)
  - CS-SQL-003   # RLS predicate is an inline TVF, shallow, admin/accountant-first, fail-closed (required)
  - CS-GEN-001   # no secrets/PII in logs — never log internal-note bodies or client PII (recommended)
  - CS-GEN-002   # edits to the Engagement shape / policy set are additive, non-destructive (recommended)
  - CS-GEN-003   # cite the governing key (// ADR-NNN / // CS-<LANG>-NNN) in code/test comments (recommended)
source:
  - planning: .planning/EPIC-011-engagement-attributes.md
  - requirements: .requirements/REQ-LIFE-007.md
  - requirements: .requirements/REQ-LIFE-008.md
  - requirements: .requirements/REQ-LIFE-009.md
  - architecture: .architecture/decisions/ADR-003-identity-propagation-session-context.md
  - architecture: .architecture/decisions/ADR-005-rls-via-security-policies.md
  - architecture: .architecture/decisions/ADR-006-monorepo-layout.md
  - architecture: .architecture/decisions/ADR-012-testing-pyramid.md
  - architecture: .architecture/decisions/ADR-019-audit-trail-logging.md
---

# BRIEF-011 — Engagement attributes (due date, internal notes, priority flag)

> Self-contained build brief for the EPIC-011 slice. `source:` refs are read-only context; the brief stands
> alone. Composed by the Conductor from `.planning/EPIC-011` + its cited `REQ-*`/`ADR-*` sources and the live
> repo state. **9 in-scope AC.** This slice hangs the accountant's **working metadata** off each engagement —
> a **due date** she sets and updates, **private internal notes** only she can read, and a **priority/flag**
> marker she can set and clear — built on the EPIC-010 engagement workspace (`apps/admin`). The
> **confidentiality of internal notes** is the security-sensitive property of the slice.

## Scope

Give the **accountant** the per-engagement working metadata she needs to plan and triage her caseload, hung
off each engagement in the **Tax Portal (`apps/admin`)**, building on the EPIC-010 engagement workspace:

1. **Per-engagement due date (AC-LIFE-007-01/-02/-03).** The accountant can **set** a due date on an
   engagement and later **update** it. The due date is an attribute of the **individual** engagement (setting
   it on one engagement does not affect another). Whether a due date is mandatory at creation is **out of
   scope** — v1 default is optional (REQ-LIFE-007 Notes); engagement creation is EPIC-012.

2. **Accountant-only internal notes (AC-LIFE-008-01/-02/-03).** The accountant can **record** private internal
   notes on an engagement. The notes are **visible only to the accountant** and are **never** shown to a client
   or any engagement participant **through any portal path**. This is the security-sensitive property: a client
   principal must never be able to read internal notes through any access path (listing, direct reference, or
   the client engagement view in `apps/portal`).

3. **Priority/flag marker (AC-LIFE-009-01/-02/-03).** The accountant can **flag** an engagement as a priority
   and later **remove** that flag. The marker is set per **individual** engagement.

All three attributes are **accountant-managed** and surfaced/managed in **`apps/admin`** only. Each attribute
write runs server-side under the accountant's propagated identity (ADR-003) and is a recorded audit event
(ADR-019).

## Out of scope

- **Dashboard / needs-action surfacing of due dates, notes, and priority** (REQ-DASH-006 internal notes on the
  dashboard, REQ-DASH-007 priority markers on the dashboard) → **Phase 4** (the accountant dashboard). This
  slice establishes that the attributes **exist** and are **accountant-managed** on the engagement itself; it
  does **not** build a dashboard, an activity feed, or a needs-action view over them.
- **Overdue-document-request reminders & reminder cadence** (REQ-FILE-012, REQ-DASH-008, REQ-MSG-018) →
  **Phase 4** (the reminder/notification engine). The due date here is an engagement **attribute**, not a
  reminder trigger; this slice emits **no** notification or reminder when a due date is set, updated, or passes.
- **Whether a due date is mandatory at engagement creation** — v1 default is optional (REQ-LIFE-007 Notes);
  **engagement creation itself is EPIC-012.** This slice operates on engagements as they already exist.
- **Engagement lifecycle status / transitions / labels** (REQ-LIFE-001..006) — **delivered by EPIC-010**; this
  slice neither changes the status pipeline nor the client-facing labels.
- **Multi-participant modeling** (REQ-LIFE-012, REQ-AUTH-007) → **EPIC-012**. Notes-confidentiality is validated
  against the existing single-participant model (a client participant on the engagement must not see the note).

## Acceptance criteria

Each AC must be covered by **automated test(s) tagged with its AC id** (the test title/annotation contains the
id), at the prescribed tier(s). An AC is implemented only when its tagged test(s) pass in CI. The slice is
deliverable only when **all 9** in-scope AC are independently validated.

**REQ-LIFE-007 — per-engagement due date**
- **AC-LIFE-007-01** — The accountant can set a due date on an engagement.
- **AC-LIFE-007-02** — The accountant can update an engagement's due date after it has been set.
- **AC-LIFE-007-03** — A due date is an attribute of the individual engagement.

**REQ-LIFE-008 — accountant-only internal notes per engagement**
- **AC-LIFE-008-01** — The accountant can record internal notes on an engagement.
- **AC-LIFE-008-02** — Internal notes are visible only to the accountant.
- **AC-LIFE-008-03** — Internal notes are never shown to a client or any engagement participant.

**REQ-LIFE-009 — engagement flagging and prioritization**
- **AC-LIFE-009-01** — The accountant can flag/mark an engagement as prioritized.
- **AC-LIFE-009-02** — The accountant can remove the flag/priority marker.
- **AC-LIFE-009-03** — The flag/priority marker is set per individual engagement.

## Methodology & quality requirements

- **Acceptance format: gherkin.** The **9** Given/When/Then scenarios authored in the epic
  (`.planning/EPIC-011-engagement-attributes.md` § Acceptance scenarios) are the behavior contract. The SDET
  binds them to executable Playwright/integration steps (or validates against them in prose until the Cucumber
  tooling lands — per CLAUDE.md § Executable gherkin tooling). Do **not** re-author scenarios; bind the epic's.
- **E2e required (`apps/admin` primary; `apps/portal` for the notes-confidentiality negative).** The accountant
  set/update due date, record note, and flag/unflag journeys run in `apps/admin`; the client-never-sees-the-note
  proof runs in `apps/portal` (a client participant viewing the engagement never sees the note text).
- **Tier mapping (from the epic's sign-off contract — ADR-012):**
  - **service integration / security (tier 3):** AC-LIFE-007-03 (per-engagement due date), **AC-LIFE-008-02/-03
    (the HARD accountant-only notes per-policy RLS test — CLIENT reads ZERO, null reads ZERO, ACCOUNTANT
    reads)**, AC-LIFE-009-03 (per-engagement flag); the accountant-only attribute-write access control; the
    ADR-019 audit-event assertions.
  - **e2e (tier 6):** AC-LIFE-007-01/-02 (set / update due date), AC-LIFE-008-01 (record a note), AC-LIFE-009-01/-02
    (flag / unflag), and the `apps/portal` client-never-sees-the-note confidentiality check (AC-LIFE-008-03).
  - **unit/component (tier 2/5):** per-engagement attribution helpers and any pure attribute-formatting/validation
    logic the design introduces.
- **Submission gate** (per CLAUDE.md): `pnpm lint` + `pnpm type-check`; `pnpm --filter portal test` +
  `pnpm --filter admin test`; `pnpm --filter admin e2e:run` (+ `pnpm --filter portal e2e:run` for the notes
  confidentiality negative); tier-3 integration against the real SQL Server container (incl. the HARD
  accountant-only notes RLS test); container smoke before Validate.
- **UI demo (`demo.applicable: yes`).** A dedicated `@demo` Playwright walkthrough captures an AC-tagged
  screenshot gallery of jane-accountant setting and updating a due date, recording an internal note, and
  flagging then unflagging an engagement in `apps/admin`, into `docs/demos/EPIC-011/`. Non-gating; the e2e gate
  is the gate.

## Constraints

Non-negotiables (cite the originating upstream ref). Each is a hard adherence obligation for this slice:

- **ADR-005 — RLS via security policies (the notes confidentiality boundary).** Internal-note read access is
  enforced by a **security policy**, not application-layer filtering. The notes policy is an **accountant-only
  BLOCK/own-row family** — model it on the accountant-only `Notification` policy (`pol_Notification` / `0004`),
  **not** the client-isolation `pol_Engagement` family: a **client principal reads ZERO notes**, a
  null/anonymous SESSION_CONTEXT reads ZERO, the ACCOUNTANT reads. **HARD requirement (ADR-005 §6, CS-SQL-001):**
  a tier-3 integration test proving exactly that runs against the real SQL Server container. RLS predicate shape
  per **CS-SQL-003** (inline TVF, shallow, admin/accountant-first, fail-closed). Where the due date and flag land
  (see Data & Interface Contract) any net-new client-scoped table ships its own policy + test; but note the **due
  date and flag carry no confidentiality AC** — only the notes do.
- **ADR-003 — SESSION_CONTEXT identity propagation.** Every attribute **write** (set/update due date, record
  note, flag/unflag) and the notes **read** run under the **caller's propagated identity** through the
  `packages/db` request-scoped wrapper (`withRequestContext` / the `$extends` SET hook); **no direct Prisma
  access** outside the wrapper (CS-TS-001), and the raw `requestDb`/`adminDb` pools are never imported outside
  `packages/db` (CS-TS-002). A **client principal can never** satisfy the attribute-write or notes-read path.
  Honor **ADR-003 Amendment 1** (no `@read_only` on the SET).
- **ADR-006 — Monorepo, two apps.** Due-date, notes, and flag **management lives in `apps/admin`** (accountant
  only). **Nothing in `apps/portal` exposes internal notes** (AC-LIFE-008-03). Apply shared patterns across
  surfaces per CS-TS-003 — here the cross-surface obligation is the **negative**: the notes never appear on the
  portal surface.
- **ADR-019 — Audit trail.** Setting/updating a due date, recording a note, and flagging/unflagging are each a
  **recorded audit event** (who, what, when) — reuse the EPIC-003/004 audit seam (`packages/db/src/audit.ts`:
  `recordAuthEvent` / `withAuditTransaction`); do **not** invent a parallel audit path. The attribute write and
  its audit record should be **atomic** (one transaction). **Do not log note bodies or client PII** (CS-GEN-001).
- **ADR-012 — Testing pyramid.** The notes-confidentiality boundary is a **hard tier-3** integration/security
  obligation against the real container; the accountant set/update/flag journeys are **tier-6 e2e**; the
  per-engagement attribution is **tier-2/3**.
- **Build on the EPIC-005/008/010 Engagement substrate, do not fork it.** The `Engagement` entity and its
  isolation/lifecycle already exist; this slice **adds attributes** to it (or related accountant-only shapes) —
  it does **not** rebuild the entity, fork the status field, or weaken any EPIC-005/010 gate. Edits to the
  Engagement shape / policy set are **additive and non-destructive** (CS-GEN-002).
- **No branch protection / CI authority changes.** Required checks unchanged (`lint-and-typecheck`,
  `security-scan`; `test-portal`/`test-admin` advisory). Merge on green required CI, no `--admin`/`enforce_admins`
  toggle (MERGE-POLICY Lane B). This slice touches **application code only** (no engine/role/workflow files), so
  it takes the **reviewed lane**.

## Code standards

Applicable `.code-standards/` keys (the buckets this slice touches — TS request-DB + server-action guard, SQL
RLS, cross-cutting). The IO threads each into the `**Code standards:**` field of the tasks that touch its
bucket; the developer tags the honoring code/test `// CS-<LANG>-NNN` (CS-GEN-003); the SDET checks each key's
`verification` hook. A `required` key whose check fails (or whose tag is missing) is an SDET rejection.

- **CS-TS-001** (`required`) — request-scoped DB access only through the `packages/db` wrapper (attribute
  reads/writes go through `withRequestContext`, never direct Prisma).
- **CS-TS-002** (`required`) — never import the raw `requestDb`/`adminDb` pools outside `packages/db`.
- **CS-SQL-001** (`required`) — the **accountant-only internal-notes** table ships a SECURITY POLICY and a
  per-principal RLS test (CLIENT reads ZERO / null reads ZERO / ACCOUNTANT reads). Any net-new client-scoped
  table this slice adds ships its own policy + test.
- **CS-SQL-003** (`required`) — RLS predicates are inline TVFs, shallow, admin/accountant-first, fail-closed.
- **CS-TS-003** (`recommended`) — cross-surface parity: notes management is admin-only and is **never** surfaced
  in the portal; apply shared attribute patterns consistently.
- **CS-TS-004** (`experimental`) — server-action accountant-identity guard: the attribute-write server actions
  assert the accountant identity/role server-side (advisory; drafted experimental in EPIC-010, unratified).
- **CS-GEN-001** (`recommended`) — no secrets/PII in logs — never log internal-note bodies or client PII (audit
  events record who/what/when, not note content).
- **CS-GEN-002** (`recommended`) — edits to the Engagement shape / policy set are additive and non-destructive
  (extend, don't fork).
- **CS-GEN-003** (`recommended`) — cite the governing key (`// ADR-NNN` / `// CS-<LANG>-NNN`) in code/test
  comments so a reviewer can trace implementation to its authority.

## Data & Interface Contract

> Source-traced to the epic's behavior + the cited ADRs (per the brief author's altitude rule). This slice
> introduces **net-new attributes** on / alongside the existing `Engagement`. The **IO expands the field-level
> contract at Design** (column vs. related-table representation, the notes shape, the flag representation, the
> audit event `type` strings); a genuinely-upstream shape question escalates via `OPEN-QUESTIONS.md` — it is
> **not** invented here. Field-shape conventions trace to **ADR-002** (`UNIQUEIDENTIFIER` PK `NEWSEQUENTIALID()`,
> `DATETIMEOFFSET` timestamps — as on every existing entity).

**Entities & relationships**
- **Engagement (EXISTING — EPIC-005/010; EXTENDED here).** This slice attaches three accountant-managed
  attributes:
  - **Due date** — an optional date attribute of the individual engagement (AC-LIFE-007-03), accountant-settable
    and updatable (AC-LIFE-007-01/-02). Representation (a nullable column on `Engagement` vs. a related record) is
    an **IO Design call**. The due date carries **no confidentiality AC** — it need not be hidden from the client;
    its **write** path is accountant-only (ADR-003).
  - **Priority/flag marker** — a per-engagement marker the accountant sets and clears (AC-LIFE-009-01/-02/-03).
    Representation (a boolean column vs. an enum/level) is an **IO Design call**. Like the due date, it carries
    **no confidentiality AC**; its **write** path is accountant-only.
  - **Internal notes** — **accountant-only** content recorded against an engagement (AC-LIFE-008-01), readable
    **only** by the accountant (AC-LIFE-008-02/-03). This is the **security-sensitive** shape: it must be governed
    by an **accountant-only BLOCK/own-row RLS policy** (modeled on `pol_Notification`/`0004`), so a client
    principal reads ZERO through any path. Whether notes are one text field on `Engagement` or a related
    `EngagementNote` table (one-to-many, supporting multiple notes over time) is an **IO Design call** — but if
    notes land on a **client-readable** shape (e.g. a column on the client-readable `Engagement`), that is a
    confidentiality violation: notes MUST live behind the accountant-only policy, separated from any
    client-readable engagement fields.

**Validation & error semantics** (to the extent the epic's behavior fixes them)
- Setting a due date on an engagement with no due date, and updating an existing one, are both accountant
  operations (AC-LIFE-007-01/-02). Date format/range validation specifics are an **IO Design call**.
- Flagging an unflagged engagement and removing the flag from a flagged one are accountant operations
  (AC-LIFE-009-01/-02). The marker's representation is an **IO Design call**.
- A **client** principal attempting any attribute write, or any internal-note read, is **denied** server-side
  (ADR-003/ADR-005) — not merely hidden in the UI.

**Interface contracts**
- **Attribute-write seams (server-side, accountant-only, audited).** Server-side actions that (a) set/update the
  due date, (b) record an internal note, (c) flag/unflag the engagement — each under the accountant's propagated
  identity (ADR-003), each rejecting a CLIENT caller, each recording an ADR-019 audit event **atomically** with
  the write. Live in `apps/admin` (ADR-006).
- **Notes read seam (accountant-only).** Reads internal notes for an engagement under the caller's identity, with
  the **accountant-only notes policy** doing the access control (ADR-005) — a client principal reads nothing,
  including on a direct-reference path.
- **Reused seams (do not reinvent):** the `Engagement` entity (`prisma/schema.prisma`); the accountant-only
  policy pattern (`pol_Notification` / `db/policies/0004-*`) as the model for the notes policy; the EPIC-003/004
  audit seam (`packages/db/src/audit.ts`); `packages/db` `withRequestContext` + the `$extends` SET hook
  (ADR-003); `packages/auth` for the accountant identity + role gate; the EPIC-010 engagement workspace in
  `apps/admin` where these attributes are surfaced.

**Deferred to IO Design (field-level minutiae, not carried here):** the storage representation of each attribute
(column vs. related table; single note field vs. an `EngagementNote` one-to-many); the due-date column type /
validation; the flag representation (boolean vs. level); the exact accountant-only notes policy file number and
predicate TVF; the audit event `type` strings for due-date-set/updated, note-recorded, flag-set/cleared.

## References

- Planning: `.planning/EPIC-011-engagement-attributes.md` (slice, 9 AC, the 9 gherkin scenarios, tier map,
  out-of-scope boundaries, the accountant-only-notes confidentiality emphasis).
- Requirements: REQ-LIFE-007 (per-engagement due date, optional-at-creation note), REQ-LIFE-008
  (accountant-only internal notes), REQ-LIFE-009 (flagging / prioritization).
- Architecture: ADR-003 (+ Amendment 1), ADR-005, ADR-006, ADR-012, ADR-019.
- Personas: `.planning/personas/jane-accountant.md` (workload planning, private notes, triage).
- Flows: `.planning/flows/flow-engagement-lifecycle.md` (extended with the accountant's attribute-management
  branch).
- Prior art in-repo: `prisma/schema.prisma` `model Engagement`; `db/policies/0004-*` (`pol_Notification`,
  the accountant-only BLOCK policy to model the notes policy on) + its EPIC-003 accountant-only integration test;
  the audit seam (`packages/db/src/audit.ts`); `packages/db` `withRequestContext` (ADR-003); `packages/auth`
  role gate; the EPIC-010 engagement workspace in `apps/admin`.

## Notes

- **Attributes-only slice; confidentiality is the risk surface.** Unlike EPIC-010 (the lifecycle pipeline),
  this slice adds **accountant working metadata**. The substantive risk is the **internal-notes confidentiality**
  boundary: a client principal must never read notes through any path (listing, direct reference, or the portal
  engagement view). The hard tier-3 accountant-only RLS test + the tier-6 portal negative are the load-bearing
  proofs.
- **Notes are accountant-only, NOT client-isolated.** Do **not** reuse the client-isolation `pol_Engagement`
  family for notes — that family lets the *owning client* read their own rows, which is exactly wrong for
  internal notes. Model the notes policy on the **accountant-only** `Notification` policy
  (`pol_Notification`/`0004`): BLOCK for any non-accountant principal.
- **Due date and flag carry no confidentiality AC.** Their **write** path is accountant-only (ADR-003), but the
  epic does not require hiding the due date or flag value from the client. Whether they live on the
  client-readable `Engagement` or behind an accountant-only shape is an IO Design call — only the **notes** must
  be confidential.
- **No notifications / reminders.** This slice emits **no** notification when a due date is set/updated/passes or
  when an engagement is flagged — that is Phase 4 (DASH/MSG). The due date is an attribute, not a trigger.
- **Not a phase-closeout slice.** EPIC-011 is one of several still-planned Phase-3 epics (EPIC-012..015 remain
  `planned`), so it does **not** close Phase 3 — **no `phase_walkthrough` / `@video` spec obligation** on this
  brief. The per-epic `demo.applicable: yes` UI gallery (`docs/demos/EPIC-011/`) is still produced (non-gating).
- **Carried infra follow-up (not slice-blocking):** **BUG-008-001** (Azurite SAS-URL e2e-tier upload defect) is
  unrelated to this slice (no uploads). This slice does **not** change docker-compose/env wiring, so the DevOps
  inventory/runbook update (CS-INFRA-001) is **not** expected to be triggered.
- **No third-party integration in this slice.** No e-sign, scanner, storage, or email — pure server-side
  attribute management + RLS-enforced notes confidentiality over the existing SQL Server schema. All five cited
  ADRs (003/005/006/012/019) are Accepted; none blocks dispatch.
</content>
</invoke>
