---
id: BRIEF-010
title: Engagement lifecycle pipeline & engagement visibility — full New→In Progress→Review→Complete, manual transitions, client labels, completion gate, reopen, accountant/client visibility
status: ready
acceptance_criteria:
  # REQ-LIFE-001 — four-stage engagement status pipeline
  - id: AC-LIFE-001-01
    text: "Every engagement has exactly one current status at all times, drawn from the set: New, In Progress, Review, Complete."
  - id: AC-LIFE-001-02
    text: "A newly created engagement begins in the New status."
  - id: AC-LIFE-001-03
    text: "The pipeline's intended forward order is New → In Progress → Review → Complete."
  # REQ-LIFE-002 — simplified client-facing status labels
  - id: AC-LIFE-002-01
    text: "Each internal status maps to a client-facing label shown to clients instead of the internal name, per this mapping: New → \"Received\", In Progress → \"In Progress\", Review → \"In Progress\", Complete → \"Completed\"."
  - id: AC-LIFE-002-02
    text: "Clients never see the raw internal stage names; in particular, the internal \"Review\" stage is not surfaced to the client and appears to them as \"In Progress\"."
  - id: AC-LIFE-002-03
    text: "From the client's perspective the engagement presents three distinct states: \"Received\", \"In Progress\", and \"Completed\"."
  # REQ-LIFE-003 — manual status transitions by the accountant
  - id: AC-LIFE-003-01
    text: "The accountant can change an engagement's status to move it through the pipeline."
  - id: AC-LIFE-003-02
    text: "The system does not automatically advance an engagement from one stage to the next, except for the onboarding-completion transition defined in REQ-ONBD-006."
  - id: AC-LIFE-003-03
    text: "A client cannot change an engagement's status."
  # REQ-LIFE-004 — Review is an internal accountant stage
  - id: AC-LIFE-004-01
    text: "The Review stage represents the accountant reviewing her own work prior to delivering the return to the client."
  - id: AC-LIFE-004-02
    text: "The Review stage imposes no required action on the client."
  - id: AC-LIFE-004-03
    text: "The Review stage is not presented to the client as a step where the client reviews or approves the work."
  # REQ-LIFE-005 — completion requires delivery and IRS-filing confirmation
  - id: AC-LIFE-005-01
    text: "Marking an engagement Complete requires an explicit accountant confirmation that the return has been delivered to the client."
  - id: AC-LIFE-005-02
    text: "Marking an engagement Complete requires an explicit accountant confirmation that the return has been filed with the tax authority."
  - id: AC-LIFE-005-03
    text: "An engagement cannot be moved to Complete unless both confirmations have been recorded."
  # REQ-LIFE-006 — only the accountant can reopen a completed engagement
  - id: AC-LIFE-006-01
    text: "The accountant can reopen an engagement that is in the Complete status, moving it back into active work."
  - id: AC-LIFE-006-02
    text: "A client cannot reopen a completed engagement."
  # REQ-AUTH-002 — accountant has full visibility
  - id: AC-AUTH-002-01
    text: "The ACCOUNTANT can view every client account in the system."
  - id: AC-AUTH-002-02
    text: "The ACCOUNTANT can view every engagement and its associated data, regardless of which client it belongs to."
  - id: AC-AUTH-002-03
    text: "No client or engagement is hidden from the ACCOUNTANT by any visibility or partitioning rule."
  # REQ-AUTH-003 — clients see only their own data (feature AC; isolation mechanism built Phase 2)
  - id: AC-AUTH-003-01
    text: "A CLIENT can access only the engagements in which they are a participant, and the data (documents, messages, engagement details) belonging to those engagements."
  - id: AC-AUTH-003-02
    text: "A CLIENT cannot view, list, search, or otherwise reach any other client's engagements or data through any portal function."
  - id: AC-AUTH-003-03
    text: "The restriction holds across every access path, including direct references to a specific record, not only the primary navigation."
  # REQ-AUTH-008 — indefinite client access after completion
  - id: AC-AUTH-008-01
    text: "After an engagement is marked complete, its CLIENT participant(s) retain the ability to sign in to the portal."
  - id: AC-AUTH-008-02
    text: "A CLIENT can view their historical (completed) engagements and their associated data indefinitely after completion."
methodology:
  tdd: optional
  acceptance_format: gherkin
  e2e: required
  coverage_target: none
  extra_gates:
    - "Pipeline-status invariant (HARD tier-3, ADR-012): an engagement always carries exactly one status from the closed set {New, In Progress, Review, Complete} (AC-LIFE-001-01); a newly created engagement is New (AC-LIFE-001-02 — reuse the EPIC-005 `@default(\"New\")`, do not fork). Prove the New→In Progress→Review→Complete forward order is the intended pipeline (AC-LIFE-001-03) at tier-3/e2e. The status set EXTENDS the EPIC-005/008 `New | In Progress` to add `Review` and `Complete`; do NOT introduce a parallel status column or enum."
    - "Manual-only transitions + the single automatic exception (HARD tier-3, ADR-003/ADR-019): the accountant advances status manually (AC-LIFE-003-01); the system does NOT auto-advance between stages EXCEPT the EPIC-008 onboarding-completion New→In Progress transition, which must be left intact (AC-LIFE-003-02). Every accountant-driven transition runs SERVER-SIDE under the accountant's propagated identity (ADR-003) and is a recorded audit event (ADR-019, who/what/when) — reuse the EPIC-003/004 audit seam (`packages/db/src/audit.ts`: `recordAuthEvent`/`withAuditTransaction`); do NOT invent a parallel audit path."
    - "Client cannot transition or reopen (HARD tier-3 access-control, ADR-003/ADR-005/ADR-010): a CLIENT principal can never change an engagement's status (AC-LIFE-003-03) nor reopen a Complete engagement (AC-LIFE-006-02) through ANY portal path — the transition/reopen controls live in apps/admin only (ADR-006) and a client navigating toward them is redirected (ADR-010). Prove the server rejects a client-attempted transition/reopen even on a direct call (not just UI absence)."
    - "Two-confirmation completion gate (HARD tier-3, AC-LIFE-005-01/-02/-03): an engagement cannot move to Complete unless BOTH the delivery-to-client confirmation AND the filed-with-tax-authority confirmation are recorded. Prove the negative (at most one confirmation ⇒ NOT Complete) at tier-3 against the real SQL Server container, and the positive (both recorded ⇒ Complete) at tier-3/e2e."
    - "Accountant full visibility + client own-data isolation — the HARD per-policy RLS test (ADR-005 §6, CS-SQL-001): against the engagement security policy (`pol_Engagement`/`0005`, built EPIC-005), a tier-3 integration test proves: CLIENT-A reads only their own engagement(s) (AC-AUTH-003-01); CLIENT-B reads ZERO of CLIENT-A's; a null/anonymous SESSION_CONTEXT reads ZERO; the ACCOUNTANT reads ALL (AC-AUTH-002-01/-02/-03). The isolation MUST additionally be proven on a DIRECT-REFERENCE path — CLIENT-B requesting CLIENT-A's engagement by its specific id is denied and returns no data (AC-AUTH-003-03) — not only on listings/search (AC-AUTH-003-02). This is the AUTH-003 feature sign-off over the Phase-2 mechanism; reuse the existing policy, do NOT add a parallel one."
    - "Indefinite post-completion access (tier-3, AC-AUTH-008-01/-02, ADR-018): marking Complete does NOT revoke a client participant's sign-in ability or read access; a client can still view a Complete engagement and its data. Marking Complete starts the engagement's retention clock (ADR-018) but the retention/purge mechanics themselves are OUT of scope (later FILE-governance epic); this slice proves only 'completion ≠ loss of access'."
    - "Client-facing label mapping (tier-2/5 + tier-6, AC-LIFE-002-01/-02/-03, AC-LIFE-004-02/-03): the four internal statuses map to exactly three client-facing labels — New→\"Received\", In Progress→\"In Progress\", Review→\"In Progress\", Complete→\"Completed\". Prove the pure mapping at tier-2/5 (incl. that Review never surfaces as a raw stage name and the Review stage requires no client action / is not a client approval step), and prove the client view shows the mapped label (never \"Review\") at tier-6 e2e in apps/portal."
    - "Cross-surface (CLAUDE.md § Platform-frontend scope, CS-TS-003): accountant transition/completion/reopen controls + full visibility surface in apps/admin; the read-only client labels + own-data isolation + post-completion access surface in apps/portal. Validate BOTH surfaces; the redirect of a client away from the admin transition surface crosses both (`pnpm e2e:cross-app`, ADR-010)."
    - "Container smoke (docker-compose stack) before Validate."
acceptance_scenarios: .planning/EPIC-010-engagement-lifecycle-pipeline.md#acceptance-scenarios
demo:
  applicable: yes
  apps: [portal, admin]
  personas: [jane-accountant, sarah-returning-client, martha-and-james-married-couple]
  flows: [flow-engagement-lifecycle]
code_standards:
  - CS-TS-001    # request-scoped DB access only through packages/db wrapper (required)
  - CS-TS-002    # never import raw requestDb/adminDb pools outside packages/db (required)
  - CS-TS-003    # apply shared patterns to both portal + admin surfaces (recommended)
  - CS-SQL-001   # client-scoped table ships a security policy + CLIENT-A/CLIENT-B RLS test (required)
  - CS-SQL-003   # RLS predicates inline TVFs, shallow, admin/accountant-first, fail-closed (required)
  - CS-GEN-001   # no secrets or PII in logs (recommended)
  - CS-GEN-002   # edits to keyed artifacts are additive and non-destructive (recommended)
  - CS-GEN-003   # cite the governing key in code/test comments (recommended)
source:
  - planning: .planning/EPIC-010-engagement-lifecycle-pipeline.md
  - requirements: .requirements/REQ-LIFE-001.md
  - requirements: .requirements/REQ-LIFE-002.md
  - requirements: .requirements/REQ-LIFE-003.md
  - requirements: .requirements/REQ-LIFE-004.md
  - requirements: .requirements/REQ-LIFE-005.md
  - requirements: .requirements/REQ-LIFE-006.md
  - requirements: .requirements/REQ-AUTH-002.md
  - requirements: .requirements/REQ-AUTH-003.md
  - requirements: .requirements/REQ-AUTH-008.md
  - architecture: .architecture/decisions/ADR-003-identity-propagation-session-context.md
  - architecture: .architecture/decisions/ADR-005-rls-via-security-policies.md
  - architecture: .architecture/decisions/ADR-006-monorepo-layout.md
  - architecture: .architecture/decisions/ADR-010-cross-app-navigation.md
  - architecture: .architecture/decisions/ADR-012-testing-pyramid.md
  - architecture: .architecture/decisions/ADR-018-data-retention-lifecycle.md
  - architecture: .architecture/decisions/ADR-019-audit-trail-logging.md
---

# BRIEF-010 — Engagement lifecycle pipeline & engagement visibility

> Self-contained build brief for the EPIC-010 slice. `source:` refs are read-only context; the brief stands
> alone. Composed by the Conductor from `.planning/EPIC-010` + its cited `REQ-*`/`ADR-*` sources and the live
> repo state. **25 in-scope AC.** This is the **first Phase-3 slice** — it makes the engagement a
> **first-class, lifecycle-managed object on both surfaces**, building on the *minimal* Engagement substrate
> (EPIC-005) and the single automatic New→In Progress transition (EPIC-008), which it leaves intact.

## Scope

Make the **engagement a first-class, lifecycle-managed object on both surfaces**:

1. **The full four-stage status pipeline (AC-LIFE-001-01/-02/-03).** Every engagement always carries exactly
   one status from the closed set **{New, In Progress, Review, Complete}**; a new engagement begins in **New**;
   the intended forward order is **New → In Progress → Review → Complete**. This **extends** the EPIC-005/008
   `New | In Progress` status (which reserved the rest for Phase 3) to add the **Review** and **Complete**
   stages — it does **not** introduce a parallel status field.

2. **Manual accountant-driven transitions (AC-LIFE-003-01/-02/-03).** In the **Tax Portal (`apps/admin`)** the
   **accountant** moves each engagement through the pipeline **manually**. The system does **not** auto-advance
   between stages — with the **single exception** of the EPIC-008 onboarding-completion New → In Progress
   transition, which is **left intact** as the one automatic move. A **client cannot change status** through
   any path.

3. **The Review stage is internal (AC-LIFE-004-01/-02/-03).** **Review** means the accountant is checking her
   own work before delivery; it imposes **no required client action** and is **not** a client review/approval
   step.

4. **Simplified client-facing labels (AC-LIFE-002-01/-02/-03).** In the **Client Portal (`apps/portal`)** the
   client sees their engagement under **friendly labels**, never the raw internal stage names: **New →
   "Received", In Progress → "In Progress", Review → "In Progress", Complete → "Completed"**. The internal
   **Review** stage is **hidden** (surfaces as "In Progress"), so the client perceives exactly **three** states:
   "Received", "In Progress", "Completed".

5. **The two-confirmation completion gate (AC-LIFE-005-01/-02/-03).** The accountant can move an engagement to
   **Complete** only after **two explicit confirmations**: (1) the return was **delivered to the client**, and
   (2) the return was **filed with the tax authority**. With **at most one** confirmation recorded, the
   engagement **cannot** move to Complete.

6. **Accountant-only reopen (AC-LIFE-006-01/-02).** The **accountant** — and only she — can **reopen** a
   **Complete** engagement back into active work. A **client cannot reopen** a completed engagement.

7. **Engagement visibility & isolation (the AUTH-002/003/008 feature AC).** The **accountant** has **full
   visibility** — every client account, every engagement and its data, nothing partitioned away
   (AC-AUTH-002-01/-02/-03). A **client** sees **only their own** engagements and data — across listings,
   search, **and direct references** (AC-AUTH-003-01/-02/-03). After completion, a client **retains sign-in and
   read access indefinitely** (AC-AUTH-008-01/-02). The isolation **mechanism** (`pol_Engagement`/`0005`) was
   built in Phase 2 (EPIC-005); this slice **signs off the feature AC** across every access path and proves the
   **direct-reference** boundary.

The accountant's transition/completion/reopen surface and full-visibility view live in **`apps/admin`**; the
client's read-only labels, own-data isolation, and post-completion access live in **`apps/portal`**.

## Out of scope

- **Engagement attributes** — due date (REQ-LIFE-007), accountant-only internal notes (REQ-LIFE-008),
  priority/flag marker (REQ-LIFE-009) → **EPIC-011**.
- **Engagement creation paths & multi-participant** — returning-client request (REQ-DOOR-009),
  accountant-initiated engagement (REQ-DOOR-010), multiple concurrent / one-per-type-per-year
  (REQ-LIFE-010/011), engagement participants & separate accounts (REQ-LIFE-012, REQ-AUTH-007) → **EPIC-012**.
  This slice operates on engagements as they already exist (created on acceptance per EPIC-005); it does not add
  creation paths or multi-participant modeling. *(Where an engagement already has a client participant — the
  Phase-2 single-participant model — the AUTH-003/008 client-access AC are validated against that participant.)*
- **File exchange, deletion, retention window, purge, legal hold** (REQ-FILE-001 remainder,
  REQ-FILE-004/005/006/009/010/011/012/013/014/015) → **a later Phase-3 planning pass**. In particular the
  **retention/purge mechanics** behind AUTH-008/ADR-018 are out of scope: this slice guarantees only that
  **completion does not revoke access**; it does not implement the retention window or purge.
- **Accountant dashboard / needs-action feed and client/accountant notifications of status change** (DASH, MSG)
  → **Phase 4**. This slice surfaces status **on the engagement itself**, not via a dashboard or a notification
  feed. (It does **not** emit a status-change notification.)
- **The EPIC-008 onboarding-completion transition's internals.** This slice **preserves** that single automatic
  New → In Progress transition; it does not rebuild or alter it.

## Acceptance criteria

Each AC must be covered by **automated test(s) tagged with its AC id** (the test title/annotation contains the
id), at the prescribed tier(s). An AC is implemented only when its tagged test(s) pass in CI. The slice is
deliverable only when **all 25** in-scope AC are independently validated.

**REQ-LIFE-001 — four-stage engagement status pipeline**
- **AC-LIFE-001-01** — Every engagement has exactly one current status at all times, drawn from the set: New, In Progress, Review, Complete.
- **AC-LIFE-001-02** — A newly created engagement begins in the New status.
- **AC-LIFE-001-03** — The pipeline's intended forward order is New → In Progress → Review → Complete.

**REQ-LIFE-002 — simplified client-facing status labels**
- **AC-LIFE-002-01** — Each internal status maps to a client-facing label per: New → "Received", In Progress → "In Progress", Review → "In Progress", Complete → "Completed".
- **AC-LIFE-002-02** — Clients never see the raw internal stage names; the internal "Review" stage appears to them as "In Progress".
- **AC-LIFE-002-03** — From the client's perspective the engagement presents three distinct states: "Received", "In Progress", "Completed".

**REQ-LIFE-003 — manual status transitions by the accountant**
- **AC-LIFE-003-01** — The accountant can change an engagement's status to move it through the pipeline.
- **AC-LIFE-003-02** — The system does not auto-advance between stages, except the REQ-ONBD-006 onboarding-completion transition.
- **AC-LIFE-003-03** — A client cannot change an engagement's status.

**REQ-LIFE-004 — Review is an internal accountant stage**
- **AC-LIFE-004-01** — Review represents the accountant reviewing her own work before delivering the return.
- **AC-LIFE-004-02** — The Review stage imposes no required action on the client.
- **AC-LIFE-004-03** — Review is not presented to the client as a step where the client reviews or approves the work.

**REQ-LIFE-005 — completion requires delivery and IRS-filing confirmation**
- **AC-LIFE-005-01** — Marking Complete requires an explicit accountant confirmation that the return was delivered to the client.
- **AC-LIFE-005-02** — Marking Complete requires an explicit accountant confirmation that the return was filed with the tax authority.
- **AC-LIFE-005-03** — An engagement cannot move to Complete unless both confirmations are recorded.

**REQ-LIFE-006 — only the accountant can reopen a completed engagement**
- **AC-LIFE-006-01** — The accountant can reopen a Complete engagement back into active work.
- **AC-LIFE-006-02** — A client cannot reopen a completed engagement.

**REQ-AUTH-002 — accountant has full visibility**
- **AC-AUTH-002-01** — The ACCOUNTANT can view every client account.
- **AC-AUTH-002-02** — The ACCOUNTANT can view every engagement and its data, regardless of owning client.
- **AC-AUTH-002-03** — No client or engagement is hidden from the ACCOUNTANT by any visibility/partitioning rule.

**REQ-AUTH-003 — clients see only their own data** *(feature AC; the isolation mechanism `pol_Engagement` was built in EPIC-005)*
- **AC-AUTH-003-01** — A CLIENT can access only the engagements they participate in, and that engagement's data.
- **AC-AUTH-003-02** — A CLIENT cannot view, list, search, or otherwise reach any other client's engagements or data through any portal function.
- **AC-AUTH-003-03** — The restriction holds across every access path, including a direct reference to a specific record, not only primary navigation.

**REQ-AUTH-008 — indefinite client access after completion**
- **AC-AUTH-008-01** — After an engagement is marked Complete, its CLIENT participant(s) retain the ability to sign in.
- **AC-AUTH-008-02** — A CLIENT can view their completed engagements and their data indefinitely after completion.

## Methodology & quality requirements

- **Acceptance format: gherkin.** The **25** Given/When/Then scenarios authored in the epic
  (`.planning/EPIC-010-engagement-lifecycle-pipeline.md` § Acceptance scenarios) are the behavior contract. The
  SDET binds them to executable Playwright/integration steps (or validates against them in prose until the
  Cucumber tooling lands — per CLAUDE.md § Executable gherkin tooling). Do **not** re-author scenarios; bind the
  epic's.
- **E2e required (`apps/portal` + `apps/admin`).** The accountant transition journey, the two-confirmation
  completion gate, and reopen run in `apps/admin`; the client label view and own-data isolation run in
  `apps/portal`; the client-redirected-away-from-the-transition-surface path crosses both (`pnpm e2e:cross-app`,
  ADR-010).
- **Tier mapping (from the epic's sign-off contract — ADR-012):**
  - **service integration / security (tier 3):** AC-LIFE-001-01/-02 (status invariant + New default),
    AC-LIFE-003-02/-03 (no auto-advance except onboarding; client cannot transition), AC-LIFE-005-03 (both
    confirmations required), AC-LIFE-006-02 (client cannot reopen), **AC-AUTH-002-01/-02/-03**,
    **AC-AUTH-003-01/-02/-03** (the **HARD** per-policy isolation test incl. the **direct-reference** path),
    AC-AUTH-008-01/-02.
  - **e2e (tier 6):** AC-LIFE-001-03 (advance through the pipeline), AC-LIFE-002-01/-02/-03 (client labels),
    AC-LIFE-003-01 (accountant advances), AC-LIFE-005-01/-02 (the two-confirmation completion gate),
    AC-LIFE-006-01 (reopen).
  - **unit/component (tier 2/5):** AC-LIFE-002-01 (the label mapping), AC-LIFE-004-01/-02/-03 (Review is
    internal, surfaced as "In Progress", no client action/approval).
- **Submission gate** (per CLAUDE.md): `pnpm lint` + `pnpm type-check`; `pnpm --filter portal test` +
  `pnpm --filter admin test`; `pnpm --filter portal e2e:run` + `pnpm --filter admin e2e:run` + `pnpm
  e2e:cross-app`; tier-3 integration against the real SQL Server container (incl. the HARD `pol_Engagement`
  CLIENT-A/CLIENT-B/null/ACCOUNTANT isolation test + the direct-reference path); container smoke before
  Validate.
- **UI demo (`demo.applicable: yes`).** A dedicated `@demo` Playwright walkthrough captures an AC-tagged
  screenshot gallery of: jane-accountant advancing an engagement New → In Progress → Review and completing it
  via the two-confirmation gate (and reopening it) in `apps/admin`; and sarah-returning-client (and the
  martha-and-james shared-engagement view) seeing the friendly labels — incl. that an engagement in internal
  Review shows "In Progress" — in `apps/portal`, into `docs/demos/EPIC-010/`. Non-gating; the e2e gate is the
  gate.

## Constraints

Non-negotiables (cite the originating upstream ref). Each is a hard adherence obligation for this slice:

- **ADR-005 — RLS via security policies (reuse, do not add).** Accountant full visibility (AUTH-002) and client
  own-data isolation (AUTH-003) are enforced by the **engagement security policy** (`pol_Engagement`,
  `db/policies/0005-*`, built EPIC-005), **not** application-layer filtering. **HARD requirement (ADR-005 §6,
  CS-SQL-001):** a tier-3 integration test proving CLIENT-A reads own, CLIENT-B reads ZERO of CLIENT-A's, a
  null/anonymous SESSION_CONTEXT reads ZERO, and the ACCOUNTANT reads ALL — and proving isolation **on a
  direct-reference path** (CLIENT-B requesting CLIENT-A's engagement by id is denied; AC-AUTH-003-03), not only
  on listings/search. Reuse the existing policy; do **not** author a parallel one. RLS predicate shape per
  **CS-SQL-003** (inline TVF, shallow, admin/accountant-first, fail-closed). If status/confirmation/reopen state
  lands on **new client-scoped tables**, each ships its own policy + CLIENT-A/CLIENT-B test (CS-SQL-001).
- **ADR-003 — SESSION_CONTEXT identity propagation.** Every status transition, completion confirmation, reopen,
  and read runs under the **caller's propagated identity** through the `packages/db` request-scoped wrapper
  (`withRequestContext` / the `$extends` SET hook); **no direct Prisma access** outside the wrapper (CS-TS-001),
  and the raw `requestDb`/`adminDb` pools are never imported outside `packages/db` (CS-TS-002). A **client
  principal can never** satisfy the transition/reopen path. Honor **ADR-003 Amendment 1** (no `@read_only` on
  the SET).
- **ADR-006 — Monorepo, two apps.** The transition / completion / reopen controls and the full-visibility view
  live in **`apps/admin`** (accountant-only); the client sees **read-only** labels in **`apps/portal`**. The
  accountant transition surface must not be reachable from `apps/portal`. Apply shared patterns to **both**
  surfaces (CS-TS-003).
- **ADR-010 — Cross-app navigation & session boundaries.** A client navigating toward the accountant transition
  surface is **redirected**; there is **no** client path to change or reopen status (AC-LIFE-003-03,
  AC-LIFE-006-02). Server-side enforcement is authoritative — UI absence alone is insufficient.
- **ADR-019 — Audit trail.** Each **status transition**, each **completion confirmation**, and each **reopen**
  is a **recorded audit event** (who, what, when) — reuse the EPIC-003/004 audit seam
  (`packages/db/src/audit.ts`: `recordAuthEvent` / `withAuditTransaction`); do **not** invent a parallel audit
  path. A transition and its audit record should be **atomic** (one transaction).
- **ADR-018 — Data-retention lifecycle.** Marking Complete **starts the engagement's retention clock** and does
  **not** revoke client access — AUTH-008 indefinite access holds. The retention-window/purge mechanics
  themselves are a **later Phase-3 epic**; this slice only honors "completion ≠ loss of access".
- **ADR-012 — Testing pyramid.** The isolation + access-control properties (AUTH-002/003, LIFE-003-03,
  LIFE-006-02) and the completion gate (LIFE-005-03) are **hard tier-3** integration/security against the real
  container; pipeline/transition invariants and the label mapping are tier-2/3; the accountant transition
  journey and the client label view are **tier-6 e2e**.
- **Build on the EPIC-005/008 Engagement substrate, do not fork it.** The `Engagement` entity, its `status`
  column (`@default("New")`), and the `pol_Engagement` isolation policy already exist; the single automatic
  New → In Progress transition (EPIC-008) must be **left intact**. This slice **extends** the status set and
  adds transitions/confirmations/reopen + the client label mapping — it does **not** rebuild the entity, fork
  the status field, or weaken the EPIC-005 onboarding/letter gate.
- **No branch protection / CI authority changes.** Required checks unchanged (`lint-and-typecheck`,
  `security-scan`; `test-portal`/`test-admin` advisory). Merge on green required CI, no `--admin`/`enforce_admins`
  toggle (MERGE-POLICY Lane B). This slice touches **application code only** (no engine/role/workflow files), so
  it takes the **reviewed lane**.

## Code standards

Applicable `.code-standards/` keys (the buckets this slice touches — TS request-DB + SQL RLS + cross-cutting).
The IO threads each into the `**Code standards:**` field of the tasks that touch its bucket; the developer tags
the honoring code/test `// CS-<LANG>-NNN` (CS-GEN-003); the SDET checks each key's `verification` hook. A
`required` key whose check fails (or whose tag is missing) is an SDET rejection.

- **CS-TS-001** (`required`) — request-scoped DB access only through the `packages/db` wrapper (status reads +
  transitions go through `withRequestContext`, never direct Prisma).
- **CS-TS-002** (`required`) — never import the raw `requestDb`/`adminDb` pools outside `packages/db`.
- **CS-SQL-001** (`required`) — every client-scoped table ships a SECURITY POLICY and a CLIENT-A/CLIENT-B RLS
  test (the engagement policy + its hard isolation test, incl. the direct-reference path; any net-new
  client-scoped table this slice adds ships its own).
- **CS-SQL-003** (`required`) — RLS predicates are inline TVFs, shallow, admin/accountant-first, fail-closed.
- **CS-GEN-003** (`recommended`) — cite the governing key (`// ADR-NNN` / `// CS-<LANG>-NNN`) in code/test
  comments so a reviewer can trace implementation to its authority.
- **CS-GEN-002** (`recommended`) — edits to the Engagement status set / policy are additive and non-destructive
  (extend, don't fork).
- **CS-GEN-001** (`recommended`) — no secrets or PII in logs (audit events record who/what/when — avoid client
  PII in log lines).
- **CS-TS-003** (`recommended`) — apply shared status/label patterns to both the portal and admin surfaces.

## Data & Interface Contract

> Source-traced to the epic's behavior + the cited ADRs (per the brief author's altitude rule). This slice
> **extends an existing entity** — it adds two **status** values, the **completion confirmation** facts, and a
> **reopen** transition. The **IO expands the field-level contract at Design** (the confirmation
> representation, the reopen target stage, the transition-guard mechanism); a genuinely-upstream shape question
> escalates via `OPEN-QUESTIONS.md` — it is **not** invented here. Field-shape conventions trace to **ADR-002**
> (`UNIQUEIDENTIFIER` PK `NEWSEQUENTIALID()`, `DATETIMEOFFSET` timestamps — as on every existing entity).

**Entities & relationships**
- **Engagement (EXISTING — EPIC-005; EXTENDED here).** Already carries `status` (`@default("New")`, currently
  `'New' | 'In Progress'` with the rest reserved for Phase 3) under the `pol_Engagement` isolation policy. This
  slice **extends the status set to add `Review` and `Complete`**, and records the **two completion
  confirmations** (delivery-to-client, filed-with-tax-authority) and the data needed to support **reopen**. The
  representation of the two confirmations — two boolean/timestamp columns on `Engagement`, a small related
  confirmations record, etc. — is an **IO Design call**; what is fixed is that **both** must be recorded before
  Complete (AC-LIFE-005-03) and that each transition/confirmation/reopen is auditable (ADR-019). No net-new
  *client-owned-row family* is required by the AUTH-003/008 AC (they sign off the existing `pol_Engagement`
  mechanism); **if** the IO introduces a net-new client-scoped table, it ships its own policy + test (CS-SQL-001).
- **Client account / participant (EXISTING).** AUTH-002 (accountant sees every client) and AUTH-003 (client sees
  only own) are evaluated over the existing account/engagement-participant model from Phase 1/2; this slice adds
  no new participant modeling (that is EPIC-012).

**Status enums & state transitions**
- **Engagement status set (extended):** `{ New, In Progress, Review, Complete }` — exactly one at all times
  (AC-LIFE-001-01), New on creation (AC-LIFE-001-02). Forward pipeline order **New → In Progress → Review →
  Complete** (AC-LIFE-001-03).
- **Transitions:**
  - **Manual (accountant, server-side, audited):** advancing through the pipeline (AC-LIFE-003-01). Whether
    backward/skip moves are permitted beyond the stated forward order is **not** fixed by the AC — an **IO
    Design call** traceable to "advance it stage by stage" / "move it through the pipeline"; the *forward
    intended order* and the *Complete preconditions* are the fixed constraints.
  - **Automatic (the one exception, EXISTING — EPIC-008):** `New → In Progress` on onboarding completion,
    **left intact** (AC-LIFE-003-02).
  - **→ Complete:** allowed **only** when **both** completion confirmations are recorded (AC-LIFE-005-03);
    requires the explicit delivery confirmation (AC-LIFE-005-01) and the explicit filing confirmation
    (AC-LIFE-005-02).
  - **Reopen:** `Complete → active work` — accountant-only (AC-LIFE-006-01); a client can never trigger it
    (AC-LIFE-006-02). The **exact target stage** of reopen (back to In Progress vs. Review vs. a prior stage) is
    not fixed by the AC ("back into active work") — an **IO Design call**.
  - **Forbidden to clients:** any status change (AC-LIFE-003-03) and reopen (AC-LIFE-006-02), enforced
    server-side under the caller's identity (ADR-003), surface-gated to `apps/admin` (ADR-006) with a client
    redirect (ADR-010).
- **Client-facing label mapping (presentation, not a stored status):** `New→"Received"`,
  `In Progress→"In Progress"`, `Review→"In Progress"`, `Complete→"Completed"` (AC-LIFE-002-01) — a pure mapping
  applied in `apps/portal`; the internal Review name never surfaces (AC-LIFE-002-02); three distinct client
  states (AC-LIFE-002-03). Fixed in v1, not accountant-configurable (REQ-LIFE-002 Notes / OQ-002 resolved).

**Interface contracts**
- **Transition seam (server-side, accountant-only, audited).** A server-side action that changes engagement
  status under the accountant's propagated identity (ADR-003), rejects a CLIENT caller (AC-LIFE-003-03), records
  an ADR-019 audit event atomically with the status write, and enforces the Complete precondition
  (both confirmations) (AC-LIFE-005-03). Lives in `apps/admin` (ADR-006).
- **Completion-confirmation seam.** Records the two distinct confirmations (delivery, filing) and gates the
  → Complete transition on both being present (AC-LIFE-005-01/-02/-03).
- **Reopen seam (server-side, accountant-only, audited).** Moves a Complete engagement back to active work
  (AC-LIFE-006-01), rejects a CLIENT caller (AC-LIFE-006-02), audited (ADR-019).
- **Visibility/read seams.** Accountant reads (every client + every engagement, AC-AUTH-002) and client reads
  (own engagements + their data, with the client-facing label mapping, AC-AUTH-003/002-of-labels) both run
  through the `packages/db` wrapper under the caller's identity, with `pol_Engagement` doing the isolation
  (ADR-005). The client read path includes the **direct-reference** access (fetch-by-id) that AC-AUTH-003-03
  governs. Post-completion, the client read path still returns Complete engagements (AC-AUTH-008-02).
- **Reused seams (do not reinvent):** the `Engagement` entity + `status` column (`prisma/schema.prisma`); the
  `pol_Engagement` isolation policy (`db/policies/0005-*`) + its EPIC-005 CLIENT-A/CLIENT-B integration test
  (extend for AUTH-002/003 feature + the direct-reference path); the EPIC-008 onboarding-completion automatic
  transition (leave intact); the EPIC-003/004 audit seam (`packages/db/src/audit.ts`); `packages/db`
  `withRequestContext` + the `$extends` SET hook (ADR-003); `packages/auth` for the accountant identity + role
  gate; the EPIC-007/008 admin-pool privileged-write pattern where a privileged write is needed.

**Deferred to IO Design (field-level minutiae, not carried here):** the storage representation of the two
completion confirmations (boolean+timestamp columns vs. a related record); the reopen target stage; the
transition-guard mechanism (status-precondition on the UPDATE, a state-machine helper, etc.); whether backward
moves within the pipeline are allowed; the exact label-mapping helper location (shared `packages/*` vs.
per-surface, subject to CS-TS-003); the audit event `type` strings for transition/confirm/reopen.

## References

- Planning: `.planning/EPIC-010-engagement-lifecycle-pipeline.md` (slice, 25 AC, the 25 gherkin scenarios, tier
  map, out-of-scope boundaries, the AUTH-003 "mechanism built Phase 2 / feature signed off here" note).
- Requirements: REQ-LIFE-001, REQ-LIFE-002 (incl. OQ-002-resolved label mapping), REQ-LIFE-003, REQ-LIFE-004,
  REQ-LIFE-005, REQ-LIFE-006, REQ-AUTH-002, REQ-AUTH-003, REQ-AUTH-008 (incl. OQ-004-resolved defer-of-hard-delete).
- Architecture: ADR-003 (+ Amendment 1), ADR-005, ADR-006, ADR-010, ADR-012, ADR-018, ADR-019.
- Personas: `.planning/personas/jane-accountant.md` (pipeline management, completion, reopen),
  `.planning/personas/sarah-returning-client.md` (own-data view, post-completion access),
  `.planning/personas/martha-and-james-married-couple.md` (each participant sees the shared engagement's label).
- Flows: `.planning/flows/flow-engagement-lifecycle.md` (the pipeline + labels + completion + reopen journey).
- Prior art in-repo: `prisma/schema.prisma` `model Engagement` (+ the `status` column comment reserving the
  pipeline for Phase 3); `db/policies/0005-*` (`pol_Engagement`) + its EPIC-005 isolation integration test;
  the EPIC-008 onboarding-completion transition (`packages/db/src/onboarding-completion*`); the audit seam
  (`packages/db/src/audit.ts`); `packages/db` `withRequestContext` (ADR-003); `packages/auth` role gate.

## Notes

- **First Phase-3 slice; the lifecycle core.** Unlike EPIC-008 (behavior over existing shapes), this slice
  **extends the Engagement status set** (adds Review/Complete) and adds the **completion-confirmation** and
  **reopen** surfaces — but it **reuses** the existing isolation policy and audit seam. The substantive risk
  surface is correctness of the **manual transition + completion-gate** logic, the **client-cannot-transition/
  reopen** access control (server-side, not just UI), and the **AUTH-003 direct-reference isolation** proof.
- **AUTH-002/003 feature sign-off over the Phase-2 mechanism.** The `pol_Engagement` isolation policy and its
  CLIENT-A/CLIENT-B test were built in EPIC-005/007; this slice **signs off the AUTH-002/003 feature AC** across
  every client access path and adds the **direct-reference** (fetch-by-id) proof (AC-AUTH-003-03). It reuses the
  policy — it must **not** add a parallel one.
- **Single automatic transition preserved.** The EPIC-008 onboarding-completion New → In Progress is the one
  exception to manual control (AC-LIFE-003-02) and must be left intact; everything else this slice adds is
  accountant-manual.
- **Not a phase-closeout slice.** EPIC-010 is the **first** of seven Phase-3 epics (EPIC-009 delivered;
  EPIC-011..015 still planned), so it does **not** close Phase 3 — **no `phase_walkthrough` / `@video` spec
  obligation** on this brief. The Phase-3 walkthrough video is EPIC-015's closeout concern. The per-epic
  `demo.applicable: yes` UI gallery (`docs/demos/EPIC-010/`) is still produced (non-gating).
- **Carried infra follow-ups (from prior retros / STATE — may resurface at Smoke, not slice-blocking):**
  **BUG-008-001** (Azurite SAS-URL e2e-tier upload defect) is unrelated to this slice's path (no uploads); the
  per-connection SESSION_CONTEXT hardening (EPIC-005 SEC-3) and the `sqlserver` healthcheck SA-password mismatch
  may surface at Smoke. This slice does **not** change docker-compose/env wiring, so the DevOps inventory/runbook
  update (CS-INFRA-001) is **not** expected to be triggered.
- **No third-party integration in this slice.** No e-sign, scanner, storage, or email — pure server-side status
  management + RLS-enforced reads over the existing SQL Server schema. All seven cited ADRs (003/005/006/010/012/
  018/019) are Accepted; none blocks dispatch.
