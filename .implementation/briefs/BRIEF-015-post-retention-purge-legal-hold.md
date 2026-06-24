---
id: BRIEF-015
title: Post-retention purge & legal hold — accountant-confirmed/never-automatic purge, legal hold, retention-vs-erasure precedence, audit-survives-purge
status: ready
acceptance_criteria:
  - id: AC-FILE-013-01
    text: "An engagement's data becomes purge-eligible only after its 7-year retention window has elapsed; data within the retention window cannot be purged."
  - id: AC-FILE-013-02
    text: "Purge is an accountant/admin-only action; no client-facing path initiates or requests a purge."
  - id: AC-FILE-013-03
    text: "The accountant is required to explicitly confirm a purge before any data is permanently removed; no purge proceeds without confirmation."
  - id: AC-FILE-013-04
    text: "The system never automatically purges data when a retention window expires; expiry only makes the engagement eligible for an accountant-confirmed purge."
  - id: AC-FILE-013-05
    text: "Data that is purge-eligible but not yet purged remains accessible and retained until the accountant explicitly confirms removal."
  - id: AC-FILE-013-06
    text: "Each purge is recorded in the audit trail (who purged what and when) and that audit record is not removed by the purge itself."
  - id: AC-FILE-014-01
    text: "The accountant can place a legal hold on an individual engagement."
  - id: AC-FILE-014-02
    text: "The accountant can place a legal hold on a client, which applies the hold to all of that client's engagements."
  - id: AC-FILE-014-03
    text: "An engagement under legal hold cannot be purged, even if its 7-year retention window has elapsed and it would otherwise be purge-eligible."
  - id: AC-FILE-014-04
    text: "A legal hold remains in effect indefinitely until the accountant explicitly lifts it; it does not expire automatically."
  - id: AC-FILE-014-05
    text: "The accountant can lift a legal hold on an engagement or client; lifting a hold restores normal purge eligibility if the retention window has elapsed."
  - id: AC-FILE-014-06
    text: "Placing a legal hold is recorded in the audit trail (who placed the hold, on what, and when)."
  - id: AC-FILE-014-07
    text: "Lifting a legal hold is recorded in the audit trail (who lifted the hold, on what, and when)."
  - id: AC-FILE-015-01
    text: "During an engagement's 7-year retention window, no client-initiated erasure request results in physical removal of any document or engagement data; the retention rule governs and the request is satisfied by access-revocation only."
  - id: AC-FILE-015-02
    text: "Physical destruction of retained engagement data is not possible until the retention window has elapsed and any legal hold has been lifted; it then requires explicit accountant-confirmed purge."
  - id: AC-NFR-010-07
    text: "When an engagement's data is purged, the audit records for that engagement — including the purge event itself — are not removed; they survive the purge."
methodology:
  tdd: optional
  acceptance_format: gherkin
  e2e: required
  coverage_target: none
  extra_gates:
    - "HARD tier-3 purge-eligibility gating (ADR-018 §3/§5 / ADR-005): an engagement is purge-eligible ONLY after its 7-year window has elapsed AND no active hold; in-window data and held data cannot be purged through any path (AC-FILE-013-01, AC-FILE-014-03, AC-FILE-015-02)."
    - "HARD tier-3 purge is admin-pool & accountant-only — never client-reachable (ADR-005 / ADR-003 / CS-SQL-001): purge runs under the accountant/admin principal only; no client principal and no client-facing path can initiate or request a purge. Proven both ways — server-side (no client principal can purge) AND the portal surface exposes NO purge/hold capability (AC-FILE-013-02)."
    - "HARD tier-3 never-automatic (ADR-018 §3/§5): window expiry creates eligibility ONLY; no scheduled/automatic path destroys data on expiry — a purge fires only on explicit accountant confirmation. Purge-eligible-but-unconfirmed data stays accessible and retained (AC-FILE-013-04, AC-FILE-013-05)."
    - "HARD tier-3 hold-blocks-purge & no-auto-expire (ADR-018 §6): an active legal hold suspends purge indefinitely overriding the retention clock; a held-and-expired engagement cannot be purged; a hold does not auto-expire; lifting restores eligibility iff the window has elapsed (AC-FILE-014-03/-04/-05). Client-scoped hold covers all the client's engagements (AC-FILE-014-02)."
    - "HARD tier-3 in-window erasure = access-revocation only (ADR-018 §4 / REQ-FILE-015): a client erasure request during the window physically removes nothing; it is satisfied by access-revocation only. The retention-side guarantee is the gate (the revocation mechanism itself is an AUTH/IDNT concern, out of scope) (AC-FILE-015-01)."
    - "HARD tier-3 audit-survives-purge (ADR-019 / REQ-NFR-010-07): the audit store is EXCLUDED from the purge job; after a confirmed purge destroys engagement rows + temporal history side-rows + storage bytes, the audit records for that engagement — including the purge event — remain (AC-FILE-013-06, AC-NFR-010-07)."
    - "Tier-6 e2e journeys: accountant confirm-before-purge (AC-FILE-013-03), place hold on an engagement + audit (AC-FILE-014-01/-06), lift hold + audit (AC-FILE-014-07)."
acceptance_scenarios: .planning/EPIC-015-post-retention-purge-legal-hold.md   # Given/When/Then reproduced verbatim in § Acceptance scenarios below
demo:
  applicable: yes
  apps: [admin]
  personas: [jane-accountant]
  flows: [flow-document-lifecycle]
  phase_walkthrough:
    phase: 3
    spec: apps/admin/e2e/demo/phase-3-walkthrough.demo.spec.ts
source:
  - planning: .planning/EPIC-015-post-retention-purge-legal-hold.md
  - requirements: .requirements/REQ-FILE-013.md
  - requirements: .requirements/REQ-FILE-014.md
  - requirements: .requirements/REQ-FILE-015.md
  - requirements: .requirements/REQ-NFR-010.md
  - architecture: .architecture/decisions/ADR-018-data-retention-lifecycle.md
  - architecture: .architecture/decisions/ADR-005-rls-via-security-policies.md
  - architecture: .architecture/decisions/ADR-002-database-sql-server.md
  - architecture: .architecture/decisions/ADR-019-audit-trail.md
  - architecture: .architecture/decisions/ADR-009-signed-url-file-access.md
  - architecture: .architecture/decisions/ADR-003-session-context.md
  - architecture: .architecture/decisions/ADR-006-monorepo-two-apps.md
  - architecture: .architecture/decisions/ADR-012-testing-pyramid.md
code_standards:
  - "CS-TS-001 (required) — request-scoped DB access only through the packages/db wrapper (ADR-003 SESSION_CONTEXT)"
  - "CS-TS-002 (required) — never import the raw requestDb/adminDb pools outside packages/db"
  - "CS-TS-003 (recommended) — apply shared patterns to both surfaces (the no-client-purge/hold absence is verified on the portal surface)"
  - "CS-TS-004 (experimental) — every server action resolves identity from the request cookie and guards role before any DB write (purge-confirm + hold place/lift are accountant-only server actions)"
  - "CS-SQL-001 (required) — an RLS policy AND an isolation test per newly scoped table / changed predicate (the legal-hold marker table + the no-client-purge authz)"
  - "CS-SQL-002 (required) — raw-SQL track only for what Prisma cannot express (temporal-history purge, destructive DDL, the admin-pool purge path)"
  - "CS-SQL-003 (required) — RLS predicate shape conventions (the legal-hold table's CLIENT/accountant branches)"
  - "CS-GEN-001 (recommended) — no secrets or PII in logs (file names, client identities, storage keys)"
  - "CS-GEN-002 (recommended) — additive, non-destructive edits to non-purge code paths"
  - "CS-GEN-003 (recommended) — cite the governing authority (ADR / REQ) in code & test comments"
---

# BRIEF-015 — Post-retention purge & legal hold

> **Self-contained build brief for the EPIC-015 slice (Phase 3 — the closing slice).** Delivers the
> **destructive end** of the document lifecycle on top of the in-window soft-delete + retention floor EPIC-014
> stood up: once an engagement's 7-year window has elapsed its data becomes **purge-eligible**, and the
> **accountant — and only the accountant, with an explicit confirmation, never automatically** — may
> permanently purge it, unless a **legal hold** suspends eligibility indefinitely; the **purge audit record
> survives the purge**. `source:` refs are read-only context; the brief stands alone. Composed by the
> Conductor from `.planning/EPIC-015` + its cited `REQ-*`/ADRs. **This slice closes Phase 3** — it carries the
> Phase-3 walkthrough-video obligation (see `## Deliverables`).

## Scope

Implement the **post-retention destructive lifecycle** under tight, accountant-controlled governance — the
only path by which retained engagement data ever physically leaves the system. Four capabilities:

1. **Accountant-confirmed, never-automatic purge (apps/admin — Tax Portal).** Once an engagement's **7-year
   retention window has elapsed** (the EPIC-014 retention clock, anchored at engagement completion) its data
   becomes **purge-eligible**. From the Tax Portal the **accountant** (admin role only) may **purge** it, but
   only after an **explicit confirmation** step. The system **never** purges automatically on expiry — expiry
   creates *eligibility*, not deletion. Until the accountant confirms, purge-eligible data **remains
   accessible and retained**. The purge is an **admin-pool** operation (ADR-005 §4) running under the
   **accountant principal** (ADR-003); it is **never reachable from a client request handler** and **no
   client-facing path** initiates or requests it (`apps/portal` exposes no purge capability).

2. **Legal hold suspends purge indefinitely.** The accountant can place a **legal hold** on an **individual
   engagement**, or on a **client** (covering all of that client's engagements). An active hold **suspends
   purge eligibility indefinitely**, overriding the retention clock — a held engagement **cannot be purged
   even if its window has elapsed**. A hold persists **indefinitely until the accountant explicitly lifts
   it** (it does not auto-expire); **lifting** restores normal eligibility **iff** the window has elapsed.
   Placing and lifting a hold are **accountant-only** admin actions.

3. **Retention-vs-erasure precedence.** During the retention window, a **client erasure request** is honored
   as **access-revocation only** — it physically removes **nothing**. Physical destruction is **impossible
   until** the window has elapsed **and** any legal hold has been lifted, and then **only** via an explicit
   accountant-confirmed purge. The precedence is explicit: **(1) legal hold → (2) retention window →
   (3) purge-eligible + no hold → accountant-confirmed purge**.

4. **Audit survives the purge.** Each purge, and each hold placement/lift, is an **audit-logged** admin
   action (ADR-019). The **audit store is EXCLUDED from the purge job** so the record — "engagement X was
   purged by accountant Y at time T" — **survives** the purge of the engagement's data (rows + temporal
   history side-rows + storage bytes).

A confirmed engagement purge takes its system-versioned **temporal history side-rows** with it (ADR-002 /
ADR-018 §2) and coordinates storage-object removal with the DB purge (ADR-009 two-track lifecycle). It builds
on EPIC-014 (the retention clock + soft-delete) and EPIC-010 (engagement completion — the clock anchor).

## Out of scope

- **The in-window lifecycle** — accountant-only delete, soft-delete, the 7-year retention floor
  (REQ-FILE-004/006/005, REQ-NFR-006) → **EPIC-014** (predecessor, delivered). This slice governs only what
  happens *after* the window elapses; it **inherits and reuses** the `Document.deletedAt` tombstone, the
  retention clock, and the temporal-history mechanism EPIC-014 built — it does not re-implement them.
- **The file-exchange surface** (upload / download / folders / tax-year organization / versioning) →
  **EPIC-013**.
- **Wholesale client-identity hard-delete** (REQ-IDNT-005) → **deferred from v1** (ADR-018 §4; OQ-004). This
  epic purges **engagement/document data after retention**, not a whole client identity + all history.
- **The access-revocation *mechanism* behind AC-FILE-015-01** (how a client's view is actually ended) → an
  **AUTH/IDNT** concern. This slice owns only the **retention-side guarantee** that an in-window erasure
  request does not physically remove data.
- **The rest of the audit-trail feature** (REQ-NFR-010-01..06 — document-access logging, transition logging,
  the accountant-only audit *read* surface, audit retention) → a dedicated **audit-trail slice (Phase 4)**.
  This slice **emits** purge + hold place/lift audit events per ADR-019 as an adherence obligation and claims
  only **AC-NFR-010-07** (audit survives purge), which is exclusively demonstrable here.

## Acceptance criteria

Each AC is covered by automated test(s) **tagged with its AC id** at the prescribed tier (§ Methodology). An
AC is implemented only when its tagged test(s) **pass in CI**; the epic is delivered only when all 16 are
`verified` in `COVERAGE.md`.

### REQ-FILE-013 — Post-retention purge is accountant-confirmed and never automatic
- **AC-FILE-013-01** — An engagement's data becomes purge-eligible only after its 7-year retention window has elapsed; data within the retention window cannot be purged.
- **AC-FILE-013-02** — Purge is an accountant/admin-only action; no client-facing path initiates or requests a purge.
- **AC-FILE-013-03** — The accountant is required to explicitly confirm a purge before any data is permanently removed; no purge proceeds without confirmation.
- **AC-FILE-013-04** — The system never automatically purges data when a retention window expires; expiry only makes the engagement eligible for an accountant-confirmed purge.
- **AC-FILE-013-05** — Data that is purge-eligible but not yet purged remains accessible and retained until the accountant explicitly confirms removal.
- **AC-FILE-013-06** — Each purge is recorded in the audit trail (who purged what and when) and that audit record is not removed by the purge itself.

### REQ-FILE-014 — Legal hold suspends purge indefinitely until explicitly lifted
- **AC-FILE-014-01** — The accountant can place a legal hold on an individual engagement.
- **AC-FILE-014-02** — The accountant can place a legal hold on a client, which applies the hold to all of that client's engagements.
- **AC-FILE-014-03** — An engagement under legal hold cannot be purged, even if its 7-year retention window has elapsed and it would otherwise be purge-eligible.
- **AC-FILE-014-04** — A legal hold remains in effect indefinitely until the accountant explicitly lifts it; it does not expire automatically.
- **AC-FILE-014-05** — The accountant can lift a legal hold on an engagement or client; lifting a hold restores normal purge eligibility if the retention window has elapsed.
- **AC-FILE-014-06** — Placing a legal hold is recorded in the audit trail (who placed the hold, on what, and when).
- **AC-FILE-014-07** — Lifting a legal hold is recorded in the audit trail (who lifted the hold, on what, and when).

### REQ-FILE-015 — Retention governs in-window; client erasure = access-revocation only
- **AC-FILE-015-01** — During an engagement's 7-year retention window, no client-initiated erasure request results in physical removal of any document or engagement data; the retention rule governs and the request is satisfied by access-revocation only.
- **AC-FILE-015-02** — Physical destruction of retained engagement data is not possible until the retention window has elapsed and any legal hold has been lifted; it then requires explicit accountant-confirmed purge.

### REQ-NFR-010 — Audit survives the purge
- **AC-NFR-010-07** — When an engagement's data is purged, the audit records for that engagement — including the purge event itself — are not removed; they survive the purge.

## Methodology & quality requirements

- **Acceptance format: gherkin.** Bind the Given/When/Then scenarios in § Acceptance scenarios to executable
  tests (carried verbatim from the epic). Each test's title/annotation contains its **AC id** (the AC-id
  test-tag contract — what makes the Validate write-back possible).
- **Tier mapping (ADR-012 testing pyramid; per the epic's sign-off contract):**
  - **Service integration / security (tier 3)** — AC-FILE-013-01/-02/-04/-05/-06, AC-FILE-014-02/-03/-04/-05,
    AC-FILE-015-01/-02, AC-NFR-010-07 (the eligibility gating, admin-only/never-client, never-automatic,
    hold-blocks-purge, in-window-access-revocation, and audit-survives-purge invariants).
  - **e2e (tier 6)** — AC-FILE-013-03 (confirm-before-purge), AC-FILE-014-01/-06 (place hold + audit),
    AC-FILE-014-07 (lift hold + audit).
- **e2e required** (CLAUDE.md IO e2e defaults): this slice touches SQL Server security policies + an
  admin-pool destructive path, `SESSION_CONTEXT` propagation (purge/hold under the accountant principal), the
  legal-hold marker, and the file-lifecycle cross-module boundary. E2E runs against the full docker-compose
  stack with both apps up; the **no-client-purge/hold absence** is exercised on the **portal** surface
  (cross-app per ADR-010).
- **Hard extra gates** — see front-matter `extra_gates`: purge-eligibility gating (elapsed window AND no
  hold), admin-pool/accountant-only purge **proven both ways** (server-side + portal absence), never-automatic
  (expiry = eligibility only; eligible-but-unconfirmed stays accessible), hold-blocks-purge + no-auto-expire +
  client-scoped hold, in-window erasure = access-revocation only, and audit-survives-purge (audit store
  excluded from the purge job).
- **UI demo (`demo.applicable: yes`)** — a `@demo` Playwright walkthrough captures an AC-tagged screenshot
  gallery into `docs/demos/EPIC-015/` on the **admin** surface, walking the **jane-accountant** journey along
  `flow-document-lifecycle` (place a legal hold → held engagement is not purge-eligible → lift the hold →
  confirm a purge of an expired engagement → the audit record survives). **Non-gating** (the e2e gate is the
  gate); see `.orchestration/DEMO-POLICY.md`.

## Deliverables

> **This slice closes Phase 3** (every other Phase-3 epic — EPIC-009/010/011/012/013/014 — is `delivered`;
> EPIC-015 is the last `planned` one). Per `DEMO-POLICY.md` § Part B, the phase-completing slice carries the
> **phase-walkthrough video** obligation.

- **Phase-3 walkthrough `@video` spec (application code — rides this slice's PR).** Author/refresh
  `apps/admin/e2e/demo/phase-3-walkthrough.demo.spec.ts`, tagged **`@demo @video`**, as a single continuous
  `test()` that drives the persona/flow happy-paths against the **live docker-compose stack** and demonstrates
  **every feature Phase 3 delivered, across all surfaces** — the sign-in lane (EPIC-009), the engagement
  lifecycle pipeline + visibility (EPIC-010), engagement attributes (EPIC-011), creation paths &
  multi-participant (EPIC-012), secure file exchange (EPIC-013), file deletion / soft-delete / retention
  (EPIC-014), and this slice's purge + legal hold (EPIC-015). Recording + human-speed pacing are set
  **per-spec** via `test.use({ video, viewport, launchOptions: { slowMo } })` (the shared `playwright.config.ts`
  stays untouched; `DEMO_SLOWMO` overrides the pace). Asserts each screen + real side-effects (e.g. audit
  records, emails via Mailhog) and narrates with on-screen caption banners. Kept out of CI and the e2e gate by
  the `e2e:video`-only tag isolation (`--grep @video`). **Without this spec, the Conductor's Report-time
  `e2e:video` matches nothing and the Phase-3 closeout video cannot be produced** — the generated video +
  README ride the docs lane at close, but the **spec itself is a hard deliverable of this PR**.

## Constraints

Non-negotiables (cite the originating ADR/REQ in code/test comments per CS-GEN-003):

- **ADR-018 — Data-retention lifecycle.** Implements **§5** (post-retention purge: admin-pool,
  accountant-confirmed, **never automatic**, audit-logged; eligibility gated on **elapsed window AND no active
  hold**), **§6** (legal hold suspends purge indefinitely; engagement- or client-scoped; place/lift audited;
  no auto-expire; lift restores eligibility iff window elapsed), the **§6 precedence order** (hold → window →
  purge-eligible), and **§4** (in-window client erasure = access-revocation only; wholesale client-identity
  erasure stays out of scope). The retention-purge path **surfaces eligibility and executes a *confirmed*
  purge — it never autonomously destroys data**. **Hard obligation.**
- **ADR-005 — RLS via security policies.** Purge is an **admin-pool** operation, **never reachable from a
  client request handler** (AC-FILE-013-02) — a hard tier-3 obligation. The legal-hold marker is a newly
  scoped table: it needs an **RLS policy + an isolation test** (CS-SQL-001). A missing/failing no-client-purge
  policy test is a **rejection**.
- **ADR-002 — SQL Server.** A confirmed engagement purge takes its system-versioned **temporal history
  side-rows** with it; destructive DDL (and the temporal-history purge) live on the **raw-SQL / admin-pool
  track** (`db/migrations/`, Track B — Prisma cannot express it). New columns/tables follow ADR-002
  PK / `DATETIMEOFFSET` / identity conventions.
- **ADR-019 — Audit trail.** Purge confirmations and legal-hold place/lift are recorded admin actions; the
  **audit store is EXCLUDED from the purge job** so the purge record survives (AC-FILE-013-06, AC-NFR-010-07).
  This slice **emits** these audit events as an adherence obligation; the NFR-010 *read*-surface feature AC are
  not claimed here.
- **ADR-009 — Signed-URL access.** Storage-object purge is **coordinated with DB purge** (the two-track
  lifecycle) — a tombstoned document's bytes survive until the confirmed purge fires, then are removed with the
  row. No new public path.
- **ADR-003 — SESSION_CONTEXT.** Purge and hold place/lift run under the **accountant/admin principal only**,
  through the `packages/db` wrapper that sets `SESSION_CONTEXT` before the first real query (CS-TS-001/-002).
  There is **no client purge/hold path**.
- **ADR-006 — Monorepo, two apps.** Purge + legal-hold management live in **`apps/admin`**; **nothing in
  `apps/portal`** can purge, hold, or lift (the no-client-path obligation is verified on the portal surface;
  CS-TS-003).
- **ADR-012 — Testing pyramid.** Honor the tier mapping above; eligibility gating, never-automatic,
  hold-blocks-purge-post-expiry, in-window-erasure-is-access-revocation, and audit-survives-purge are hard
  tier-3 integration/security; the accountant purge-confirm and place/lift-hold journeys are tier-6 e2e.

## Code standards

- **CS-TS-001** (`required`) — request-scoped DB access only through the `packages/db` wrapper (ADR-003).
- **CS-TS-002** (`required`) — never import the raw `requestDb`/`adminDb` pools outside `packages/db`.
- **CS-TS-003** (`recommended`) — apply shared patterns to both surfaces; the **no-client-purge/hold absence**
  is verified on the portal surface.
- **CS-TS-004** (`experimental`) — every server action resolves identity from the request cookie and guards
  role before any DB write (purge-confirm + hold place/lift are **accountant-only** server actions).
- **CS-SQL-001** (`required`) — an RLS policy **and** an isolation test per newly scoped table / changed
  predicate (the legal-hold marker table + the no-client-purge authz).
- **CS-SQL-002** (`required`) — raw-SQL track only for what Prisma cannot express (the temporal-history purge,
  destructive DDL, the admin-pool purge path).
- **CS-SQL-003** (`required`) — RLS predicate shape conventions (the legal-hold table's CLIENT/accountant
  branches).
- **CS-GEN-001** (`recommended`) — no secrets or PII in logs (file names, client identities, storage keys).
- **CS-GEN-002** (`recommended`) — additive, non-destructive edits to non-purge code paths.
- **CS-GEN-003** (`recommended`) — cite the governing ADR/REQ in code & test comments.

## Data & Interface Contract

> Altitude-bounded: only the shapes that **trace** to the epic's behavior + cited ADRs. The IO expands these
> into the full field-level contract at Design; genuinely upstream shape questions are escalated via
> `OPEN-QUESTIONS.md`, never invented. Field-level minutiae (exact column types, the purge-job batching, the
> confirmation-token shape) are NOT fixed here.

- **Legal-hold marker (net-new).** A first-class **legal-hold** record/flag scoped to an **engagement** and
  (separately) to a **client** (covering all that client's engagements). State set: **held** ↔ **not held**;
  transitions: **place** (accountant) and **lift** (accountant) — both audit-logged; a hold **does not
  auto-expire**. A client-scoped hold makes **every** engagement of that client unpurgeable while active. This
  is a newly scoped table → it carries an **RLS policy + isolation test** (CS-SQL-001); placing/lifting is
  **accountant-only** and has **no client path**. *(traces: REQ-FILE-014; ADR-018 §6, ADR-005)*
- **Purge-eligibility (derived, not stored as truth).** An engagement is **purge-eligible** iff its
  **retention window has elapsed** (the EPIC-014 completion-anchored clock) **AND** it has **no active legal
  hold**. Eligibility is **computed** from these inputs (the precedence: hold → window → eligible) — expiry
  alone never sets a "purge me" state. *(traces: REQ-FILE-013-01/-04, REQ-FILE-014-03, REQ-FILE-015;
  ADR-018 §3/§5/§6)*
- **Purge action (admin-pool, confirmed, destructive).** Input = a **purge-eligible** engagement + an
  **explicit accountant confirmation**; effect = **physical removal** of the engagement's data — rows, their
  **temporal-history side-rows** (ADR-002), and the coordinated **storage bytes** (ADR-009) — under the
  **accountant/admin principal** on the admin-pool track. **No client path; never automatic.** The **audit
  store is excluded** from this destructive sweep. There is **no** purge transition reachable in-window or
  while held. *(traces: REQ-FILE-013, REQ-NFR-010-07; ADR-018 §5, ADR-003, ADR-005, ADR-009, ADR-019)*
- **In-window erasure → access-revocation only (retention-side guarantee).** A client erasure request during
  the window **physically removes nothing** — the retention-side contract is that no document/engagement row
  or bytes are destroyed in-window. The *revocation mechanism* (ending the client's view) is an AUTH/IDNT
  concern, **out of scope**; this slice owns only the no-physical-removal guarantee. *(traces:
  REQ-FILE-015-01; ADR-018 §4)*
- **Interface contracts.**
  - *Confirm a purge (apps/admin):* input = a purge-eligible engagement the accountant owns + explicit
    confirmation; effect = admin-pool destructive purge (rows + temporal history + storage bytes), audit event
    emitted and **retained**; **accountant-only**, **no client path**, **never automatic**. *(traces:
    REQ-FILE-013; ADR-003/-005/-018/-019)*
  - *Place / lift a legal hold (apps/admin):* input = an engagement or a client; effect = set/clear the hold
    (audit-logged who/what/when); a placed hold blocks purge regardless of the clock; a lift restores
    eligibility **iff** the window has elapsed; **accountant-only**, **no client path**. *(traces:
    REQ-FILE-014; ADR-018 §6, ADR-019)*
  - *No client purge/hold (apps/portal):* the client surface exposes **no** purge, hold, or lift capability
    for any engagement; a client principal cannot purge/hold/lift server-side. *(traces: REQ-FILE-013-02;
    ADR-005/-006)*
- **Field-shape obligations (ADR-002).** New columns/tables follow ADR-002 PK / `DATETIMEOFFSET` / identity
  conventions. **Audit events** (ADR-019) are recorded for purge confirmation and hold place/lift, and are
  excluded from the purge job.

## Acceptance scenarios

> Reproduced verbatim from `.planning/EPIC-015-post-retention-purge-legal-hold.md` (the canonical behavior
> contract). Bind each to an executable test tagged with its AC id.

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

## References

- Planning: `.planning/EPIC-015-post-retention-purge-legal-hold.md` (the slice + behavior contract)
- Requirements: REQ-FILE-013, REQ-FILE-014, REQ-FILE-015, REQ-NFR-010 (AC-07 only)
- Architecture: ADR-018 (data-retention lifecycle — the governing HOW; §3 clock, §4 erasure, §5 purge,
  §6 legal hold + precedence), ADR-005 (admin-pool purge, no client path, legal-hold RLS), ADR-002 (temporal
  history purged with the engagement; destructive DDL on the raw-SQL track), ADR-019 (purge + hold audit
  events; audit store excluded from the purge job), ADR-009 (storage-object purge coordinated with DB purge),
  ADR-003 (SESSION_CONTEXT — accountant/admin principal only), ADR-006 (purge + hold are admin capabilities),
  ADR-012 (testing tiers)
- Personas: `.planning/personas/jane-accountant.md` (records-retention obligation; legal hold during a
  dispute; post-retention cleanup)
- Flows: `.planning/flows/flow-document-lifecycle.md` (extended with the purge-eligible → confirmed-purge path
  and the legal-hold branch)
- Prior art: EPIC-014 (the retention clock + soft-delete + temporal history this slice's purge consumes and
  destroys), EPIC-010 (engagement **completion** — the retention-clock anchor)

## Notes

- **Inherit, do not re-implement EPIC-014.** The `Document.deletedAt` tombstone, the completion-anchored
  retention clock, and the system-versioned temporal history already exist — this slice adds the **legal-hold
  marker**, the **purge-eligibility derivation** (window-elapsed AND no-hold), the **admin-pool
  accountant-confirmed purge** (rows + temporal history + storage bytes, audit excluded), and the
  **retention-vs-erasure precedence**. It does not touch the in-window delete/soft-delete/retention behavior.
- **The no-client-purge/hold proof is the panel/SDET trap** (per ADR-005 history, mirroring EPIC-013's
  both-party trap and EPIC-014's no-client-delete trap): assert it **both ways** — **server-side** (no client
  principal can purge, place, or lift; the legal-hold table's CLIENT branch holds and no client reaches a
  purge/hold path), **and** the **portal surface** exposes **no** purge/hold/lift capability. A
  one-directional assertion is insufficient.
- **Never-automatic is a hard invariant** (ADR-018 §5): window expiry produces **eligibility only**. The
  proof must show that an expired-but-unconfirmed engagement is **not** destroyed and **stays accessible and
  retained** until an explicit accountant confirmation fires the purge. There must be **no** scheduled/cron
  path that destroys data on expiry.
- **Audit-survives-purge is the headline guarantee** (REQ-NFR-010-07, ADR-019): the destructive purge sweep
  **excludes** the audit store. The proof must purge an engagement's data (rows + temporal history side-rows +
  storage bytes) and then show the audit records for that engagement — **including the purge event** — still
  present.
- **Precedence ordering** (REQ-FILE-015 / ADR-018 §6): **(1) legal hold** (active → never purge) →
  **(2) retention window** (in-window → no destruction, access-revocation only) → **(3) purge-eligible +
  no hold** (accountant may confirm). Test the ordering, not just the endpoints — a held-and-expired
  engagement must remain unpurgeable; lifting the hold restores eligibility because the window already
  elapsed.
- **Known infra caveat (carried, non-gating):** BUG-008-001 (Azurite SAS-URL host-unreachable from the host
  Playwright browser) affected file-byte e2e scenes earlier. This slice's hard gates are server-side
  (eligibility derivation, admin-pool purge, RLS no-client-purge, audit-survives) and do not depend on a byte
  round-trip; if a tier-6 scene trips it, carry the affected AC by its tier-3 integration proof and flag it —
  do not weaken the gate.
- **IO Design discretion (bounded):** whether the legal-hold marker is one table with an engagement/client
  scope discriminator or two; the purge-job batching/transaction shape; the confirmation-token mechanism; and
  the recovery/eligibility surfacing in admin are IO Design decisions bounded by the contract above — do not
  over-build. The **audit store EXCLUSION** from the purge and the **never-automatic** invariant are
  non-negotiable.
- **Phase-3 closeout (this slice).** Beyond the per-epic `docs/demos/EPIC-015/` gallery, this PR must carry
  the Phase-3 `@video` walkthrough spec (see `## Deliverables`) covering **every** Phase-3 feature across all
  surfaces. The Conductor produces the packaged video (`docs/demos/phase-3/`) at Report from that spec; the
  spec not existing is a **phase-closeout gap** (`DEMO-POLICY.md` § Part B — the EPIC-008 silent-miss failure
  mode).
- **Build order:** EPIC-015 is the **last Phase-3 epic** — it closes the engagement-lifecycle & secure
  file-exchange phase. After it, Phase 4 (messaging, notifications & the accountant dashboard) is the next to
  decompose.
