---
id: BRIEF-019
title: Overdue detection & reminder engine — the system auto-detects overdue document requests behind a time-injectable seam, flags them, and raises reminders at an accountant-configurable cadence (global default + per-engagement override that takes precedence), emitting overdue / due-date-approaching / request-created notifications into the EPIC-016 feed (honoring the EPIC-018 email digest)
status: ready
acceptance_criteria:
  - id: AC-FILE-012-01
    text: "The system identifies document requests that are overdue (unfulfilled and past their due date)."
  - id: AC-FILE-012-02
    text: "An overdue document request is flagged/surfaced as overdue when the accountant views the request."
  - id: AC-FILE-012-03
    text: "Overdue detection happens without the accountant initiating the check — the system identifies overdue requests on its own."
  - id: AC-FILE-012-04
    text: "The overdue determination is based on the document request's due date — only a request past its due date is treated as overdue."
  - id: AC-MSG-018-01
    text: "The system automatically identifies overdue document requests without the accountant initiating the check."
  - id: AC-MSG-018-02
    text: "An overdue document request results in a reminder being raised about it."
  - id: AC-MSG-018-03
    text: "The accountant can configure the reminder frequency as a global default; overdue reminders are raised at that frequency by default across engagements."
  - id: AC-MSG-018-04
    text: "The accountant can override the reminder frequency per engagement, and that per-engagement frequency takes precedence over the global default for that engagement."
  - id: AC-DASH-008-01
    text: "The accountant can set a global default frequency for overdue document-request reminders; it is recorded and applies where no override exists."
  - id: AC-DASH-008-02
    text: "The accountant can set an overdue-reminder frequency for an individual engagement; that engagement carries its own reminder frequency."
  - id: AC-DASH-008-03
    text: "A per-engagement reminder frequency takes precedence over the global default for that engagement."
  - id: AC-MSG-013-05
    text: "The accountant is notified (in-portal) when a document request becomes overdue."
  - id: AC-MSG-013-06
    text: "The accountant is notified (in-portal) when an engagement is approaching its due date."
  - id: AC-MSG-014-02
    text: "A client is notified (in-portal) when a document request is created for them."
methodology:
  tdd: optional
  acceptance_format: gherkin
  e2e: required
  coverage_target: none
  extra_gates:
    - "HARD tier-3 automatic detection behind a time-injectable seam (AC-FILE-012-01/-03, AC-MSG-018-01; ADR-023): with the clock/scheduler injected (NOT wall-clock), advance time past an unfulfilled request's due date and assert the engine identifies it as overdue WITHOUT any accountant-initiated or manual trigger — the detection path is invoked by the (test-injectable) scheduler seam, not by a user action. Asserting overdue only after a manual call would NOT prove AC-FILE-012-03 and is a rejection."
    - "HARD tier-3 overdue is determined by the due date (AC-FILE-012-04): given two unfulfilled requests — one past its due date, one not — assert ONLY the past-due request is treated as overdue (both directions: the past-due one IS overdue AND the not-yet-due one is NOT). A fulfilled request past its due date is NOT overdue."
    - "HARD tier-3 overdue raises a reminder (AC-MSG-018-02): an overdue document request results in a reminder being raised, which emits the accountant's in-portal overdue notification (AC-MSG-013-05) into the EPIC-016 feed. Assert the reminder/notification is produced from the overdue state, not from a manual send."
    - "HARD tier-3 per-engagement cadence precedence, proven BOTH ways (AC-MSG-018-04, AC-DASH-008-03): with a global default frequency set AND one engagement carrying its own override, assert reminders for the overridden engagement use the per-engagement frequency (NOT the global default) AND reminders for an engagement with no override use the global default. The precedence resolution is the security-of-correctness property of the cadence engine."
    - "Tier-3 cadence interval is honored via the time-injectable seam (AC-MSG-018-03 mechanism): reminders for an overdue request are raised no more often than the resolved frequency — advance the injected clock by less than the interval and assert no duplicate reminder; advance past the interval and assert the next reminder. The cap is enforced on dispatch/last-sent state, not by hoping ticks coincide."
    - "Tier-3 RLS per-recipient isolation, proven BOTH ways (AC-MSG-014-02, AC-MSG-013-05; ADR-005, CS-SQL-001): a client is reminded/notified ONLY about their OWN overdue and document-request-created events — reusing the EPIC-016 client notification RLS branch. Assert CLIENT-B does NOT receive CLIENT-A's reminder or request-created notification (and the positive: CLIENT-A does). Null/zero SESSION_CONTEXT yields zero rows."
    - "Tier-3 cadence-config isolation for any net-new engagement-scoped table (CS-SQL-001/-003; ADR-005): the per-engagement reminder-frequency config is accountant-only — a client principal cannot read or write it. A negative isolation test per net-new scoped table is a hard requirement (an integration test proving a CLIENT cannot see/modify cadence config)."
    - "Tier-3 accountant due-date-approaching notification (AC-MSG-013-06): an engagement approaching its due date (derived from the EPIC-011 engagement due date via the injected clock) produces an in-portal due-date-approaching notification for the accountant — evaluated by the engine without a manual trigger."
    - "Tier-3 client request-created notification (AC-MSG-014-02): when the accountant creates a document request for a client, that client (and only that client) receives an in-portal notification that a document request was created for them."
    - "Tier-6 e2e overdue flagged/surfaced (AC-FILE-012-02): the accountant views a request that has become overdue and sees it flagged/surfaced as overdue (apps/admin)."
    - "Tier-6 e2e set global default cadence (AC-DASH-008-01, AC-MSG-018-03): the accountant sets a global default overdue-reminder frequency via the apps/admin settings surface and it is recorded/applies where no override exists."
    - "Tier-6 e2e set per-engagement cadence (AC-DASH-008-02): the accountant sets an overdue-reminder frequency for an individual engagement and that engagement carries its own frequency."
    - "Reminder notifications respect the EPIC-018 email digest (no new email path): reminder / overdue / due-date-approaching / request-created notifications flow into the EPIC-016 feed and are summarized by the EXISTING content-free daily digest (EPIC-018) — they do NOT introduce a per-event email or any new email content. Do not rebuild the feed or the email seam."
acceptance_scenarios: .planning/EPIC-019-overdue-reminder-engine.md   # Given/When/Then reproduced verbatim in § Acceptance scenarios below
demo:
  applicable: yes
  apps: [admin, portal]
  personas: [jane-accountant, sarah-returning-client, martha-and-james-married-couple]
  flows: [flow-notification-feed]
source:
  - planning: .planning/EPIC-019-overdue-reminder-engine.md
  - requirements: .requirements/REQ-FILE-012.md
  - requirements: .requirements/REQ-MSG-018.md
  - requirements: .requirements/REQ-DASH-008.md
  - requirements: .requirements/REQ-MSG-013.md
  - requirements: .requirements/REQ-MSG-014.md
  - architecture: .architecture/decisions/ADR-005-rls-via-security-policies.md
  - architecture: .architecture/decisions/ADR-003-identity-propagation-session-context.md
  - architecture: .architecture/decisions/ADR-018-data-retention-lifecycle.md
  - architecture: .architecture/decisions/ADR-023-provider-seam-mock-first-integration.md
  - architecture: .architecture/decisions/ADR-006-monorepo-layout.md
  - architecture: .architecture/decisions/ADR-012-testing-pyramid.md
code_standards:
  - "CS-TS-001 (required) — request-scoped DB access only through the packages/db wrapper (ADR-003 SESSION_CONTEXT): the cadence-config reads/writes (global default + per-engagement override) run through the wrapper under the accountant principal"
  - "CS-TS-002 (required) — never import the raw requestDb/adminDb pools outside packages/db"
  - "CS-TS-003 (recommended) — apply shared recipient/notification patterns consistently across both surfaces (config on apps/admin; resulting client nudges on apps/portal)"
  - "CS-TS-004 (experimental) — the cadence-config server actions resolve identity from the request cookie and guard role (accountant-only) before the config write"
  - "CS-SQL-001 (required) — an RLS policy AND a per-table isolation test for every net-new request-scoped table (any per-engagement cadence-config table; the reminder fan-out reuses the EPIC-016 Notification client branch)"
  - "CS-SQL-002 (required) — raw-SQL migration track only for what Prisma cannot express (the security policies / predicate functions)"
  - "CS-SQL-003 (required) — RLS predicate shape: reuse the established engagement-scoped inline-EXISTS / fn_*_access pattern (per the EPIC-017 CS-SQL-003 reconciliation)"
  - "CS-GEN-001 (recommended) — no secrets or PII in logs: the detection/reminder engine logs NO client identity, document/request detail, or engagement detail"
  - "CS-GEN-002 (recommended) — additive, non-destructive wiring: consume the EPIC-016 feed, the EPIC-018 digest, the EPIC-011 engagement due date, and the EPIC-013 document requests; do not rebuild any of them"
  - "CS-GEN-003 (recommended) — cite the governing ADR/REQ in code & test comments"
---

# BRIEF-019 — Overdue detection & reminder engine (auto-detect, configurable cadence)

> **Self-contained build brief for the EPIC-019 slice (Phase 4 — the engine that chases clients for the
> accountant).** The system **automatically detects** document requests that have passed their due date —
> **without the accountant initiating the check** — flags them as overdue, and **raises reminders**. The
> accountant controls the **cadence**: a **global default** frequency plus a **per-engagement override** that
> **takes precedence** for that engagement. The reminder trigger drives three reminder-/lifecycle-driven
> notification types — the accountant is notified when a request becomes **overdue** and when an engagement is
> **approaching its due date**, and the client is notified when a **document request is created** for them.
> All surface through the **EPIC-016 notification feed** and respect the **EPIC-018 email digest** (content-
> free, at-most-one-per-day). Any scheduler/timer is consumed behind a **time-injectable seam (ADR-023)** so
> "becomes overdue at the due date" and "cadence interval elapsed" are **deterministically testable** without
> wall-clock waits. `source:` refs are read-only context; the brief stands alone. Composed by the Conductor
> from `.planning/EPIC-019` + its cited `REQ-*`/ADRs.
> **This slice does NOT close a roadmap phase** (EPIC-020–023 remain `planned`; EPIC-023 is the Phase-4
> closer) — **no** phase-walkthrough video obligation rides this PR.

## Scope

Deliver the **detection + cadence + reminder-notification** capability, built **on top of** the already-
delivered EPIC-016 feed, EPIC-018 digest, EPIC-011 engagement due date, and EPIC-013 document requests:

1. **Automatic overdue detection (the engine, behind a time-injectable seam).** The system **identifies on
   its own** the document requests that are **unfulfilled and past their due date** — **without the accountant
   initiating the check**. Detection runs **server-side**, driven by a **scheduler/timer consumed behind a
   time-injectable seam** (ADR-023) so the engine can be invoked deterministically in tests. Overdue is
   **derived** from the document request's **due date** (ADR-018: no new clock — read the existing lifecycle
   attribute); a request past its due date is overdue, one not yet past is not, and a fulfilled request is not.

2. **Overdue flagging/surfacing.** A request the engine has identified as overdue is **flagged/surfaced as
   overdue** when the accountant views the request (`apps/admin`).

3. **Configurable reminder cadence (global default + per-engagement override).** The accountant configures
   how often overdue reminders are raised: a **global default frequency** that applies across engagements, and
   a **per-engagement override** that **takes precedence** over the global default for that engagement. The
   global default is an `apps/admin` setting; the per-engagement frequency is set on the individual
   engagement. The cadence engine **raises reminders at the resolved frequency** (override if present, else
   global default) and **not more often** than that interval.

4. **Reminder-/lifecycle-driven notifications (into the EPIC-016 feed, honoring the EPIC-018 digest).**
   - **Overdue → accountant** (AC-MSG-013-05): when a request becomes overdue, the accountant gets an
     in-portal overdue notification.
   - **Approaching due date → accountant** (AC-MSG-013-06): when an engagement is approaching its due date
     (derived from the EPIC-011 engagement due date via the injected clock), the accountant gets an in-portal
     due-date-approaching notification.
   - **Request created → client** (AC-MSG-014-02): when the accountant creates a document request for a
     client, that client (and only that client) gets an in-portal notification that a request was created.

   All of these are recorded as **EPIC-016 notifications** (RLS-scoped per recipient, reusing the existing
   client/accountant branches) and are **summarized by the EXISTING EPIC-018 content-free daily digest** —
   this slice introduces **no** new email path and **no** per-event email.

Built on **EPIC-016** (the `Notification` feed — where reminders/overdue/created events surface, per-recipient
RLS), **EPIC-018** (the content-free daily email digest these notifications ride), **EPIC-011** (the
engagement **due date** consumed for the approaching-deadline signal), and **EPIC-013** (document **requests**
whose due dates the overdue determination reads). This slice **consumes** all four; it does **not** rebuild
any of them. The same email seam is reused via EPIC-018 (no new transport).

## Out of scope

- **Lifecycle-wide proactive follow-up & the consolidated "what's needed from you" client view**
  (REQ-MSG-019) → **v2 / Deferred.** This engine is the **overdue-document subset** REQ-MSG-019 later
  generalizes into a lifecycle-wide accountability engine. Do **not** build the generalized engine.
- **Dashboard needs-action / activity-feed surfacing of overdue items** (REQ-DASH-002/-003) → **EPIC-020**,
  which **consumes** the overdue state this engine produces. This slice produces overdue state + the
  accountant-view flag (AC-FILE-012-02); it does **not** build the dashboard needs-action panel or activity
  feed.
- **The notification feed mechanism, real-time delivery, the unread badge, per-viewer read-tracking** →
  **EPIC-016** (already delivered). This slice **emits** notifications into the feed; it does **not** alter
  the feed mechanism.
- **The email transport + the digest batching/content-free composition + accountant suppression / client
  default-on** → **EPIC-018** (already delivered). Reminder notifications **ride** the existing digest; this
  slice adds **no** email content path, **no** per-event email, and **no** new email-preference surface.
- **The engagement due-date attribute itself** (REQ-LIFE-007) → already delivered in **EPIC-011**; **consumed**
  here for the approaching-deadline signal, not re-built.
- **The document-request entity / creation flow itself** → **EPIC-013** owns document requests; this slice
  reads their due dates and emits the request-created notification, it does not re-build request creation.
- **A real production scheduler / cron infrastructure** → mock-first per ADR-023: the periodic driver is
  consumed behind a **time-injectable seam** and **invoked under test**; the production schedule is a
  deploy-time concern (Phase 5). Do **not** wire a real cron/scheduler platform.

## Acceptance criteria

Each AC is covered by automated test(s) **tagged with its AC id** at the prescribed tier (§ Methodology). An
AC is implemented only when its tagged test(s) **pass in CI**; the epic is delivered only when all **14** are
`verified` in `COVERAGE.md`.

> **Note on AC scope.** The epic re-scopes the REQ-FILE-012 AC ids to the **detection** subset (identify /
> flag / no-manual-trigger / by-due-date), splitting the **cadence-configuration** ACs to REQ-DASH-008
> /-MSG-018. The AC text below is the **epic's** authoritative decomposition (the unit `COVERAGE.md` tracks),
> not the upstream REQ-FILE-012 wording.

### REQ-FILE-012 — Overdue document-request detection & flagging
- **AC-FILE-012-01** — The system identifies document requests that are overdue (unfulfilled and past their due date).
- **AC-FILE-012-02** — An overdue document request is flagged/surfaced as overdue when the accountant views the request.
- **AC-FILE-012-03** — Overdue detection happens without the accountant initiating the check — the system identifies overdue requests on its own.
- **AC-FILE-012-04** — The overdue determination is based on the document request's due date — only a request past its due date is treated as overdue.

### REQ-MSG-018 — Auto-reminders for overdue document requests
- **AC-MSG-018-01** — The system automatically identifies overdue document requests without the accountant initiating the check.
- **AC-MSG-018-02** — An overdue document request results in a reminder being raised about it.
- **AC-MSG-018-03** — The accountant can configure the reminder frequency as a global default; overdue reminders are raised at that frequency by default across engagements.
- **AC-MSG-018-04** — The accountant can override the reminder frequency per engagement, and that per-engagement frequency takes precedence over the global default for that engagement.

### REQ-DASH-008 — Configurable overdue-reminder frequency
- **AC-DASH-008-01** — The accountant can set a global default frequency for overdue document-request reminders; it is recorded and applies where no override exists.
- **AC-DASH-008-02** — The accountant can set an overdue-reminder frequency for an individual engagement; that engagement carries its own reminder frequency.
- **AC-DASH-008-03** — A per-engagement reminder frequency takes precedence over the global default for that engagement.

### REQ-MSG-013 — Accountant notification types (reminder-driven)
- **AC-MSG-013-05** — The accountant is notified (in-portal) when a document request becomes overdue.
- **AC-MSG-013-06** — The accountant is notified (in-portal) when an engagement is approaching its due date.

### REQ-MSG-014 — Client notification types (reminder-driven)
- **AC-MSG-014-02** — A client is notified (in-portal) when a document request is created for them.

## Methodology & quality requirements

- **Acceptance format: gherkin.** Bind the Given/When/Then scenarios in § Acceptance scenarios to executable
  tests (carried verbatim from the epic). Each test's title/annotation contains its **AC id** (the AC-id
  test-tag contract — what makes the Validate write-back possible).
- **Tier mapping (ADR-012 testing pyramid; per the epic's sign-off contract):**
  - **Service integration (tier 3)** — **AC-FILE-012-01 / -03 / -04**, **AC-MSG-018-01 / -02 / -04**,
    **AC-DASH-008-03** (precedence), **AC-MSG-013-05 / -06**, **AC-MSG-014-02** — all with the
    **time-injectable seam** for deterministic "becomes overdue" / "approaching due date" / cadence-interval
    assertions.
  - **e2e (tier 6)** — **AC-FILE-012-02** (overdue shown), **AC-MSG-018-03** + **AC-DASH-008-01** (global
    default cadence config), **AC-DASH-008-02** (per-engagement cadence config).
- **e2e required** (CLAUDE.md IO e2e defaults): this slice touches **SQL Server security policies /
  SESSION_CONTEXT propagation** (the client notification RLS branch + any cadence-config table) and
  **cross-module boundaries** (detection → feed → digest) — both default e2e triggers. E2E runs against the
  full docker-compose stack; the overdue-flag view and the cadence-config journeys are exercised end-to-end.
- **Hard extra gates** — see front-matter `extra_gates`: automatic detection **behind the time-injectable
  seam** (no manual trigger — the failure mode is "asserts overdue only after a manual call"), overdue
  **by-due-date** discrimination (both directions), overdue **raises a reminder**, **per-engagement
  precedence proven both ways**, cadence **interval honored** via the injected clock, **per-recipient RLS
  isolation proven both ways** (a client is reminded/notified only about their own events), **cadence-config
  isolation** (accountant-only — a client cannot read/write it), the **due-date-approaching** and
  **request-created** notifications, and the tier-6 overdue-flag + cadence-config journeys.
- **UI demo (`demo.applicable: yes`)** — a `@demo` Playwright walkthrough captures an AC-tagged screenshot
  gallery into `docs/demos/EPIC-019/` across **both surfaces**, walking the **jane-accountant** journey (set
  the **global default** cadence and a **per-engagement override** in `apps/admin`, view a request **flagged
  overdue**, see the **overdue** and **due-date-approaching** notifications in her feed — AC-DASH-008-01/-02,
  AC-FILE-012-02, AC-MSG-013-05/-06) and the **sarah-returning-client / martha-and-james** journey (a
  **document-request-created** nudge appears in the portal feed and is summarized by the content-free digest —
  AC-MSG-014-02) along the **reminder branch of `flow-notification-feed`**. **Non-gating** (the e2e gate is
  the gate); see `.orchestration/DEMO-POLICY.md`.

## Constraints

Non-negotiables (cite the originating ADR/REQ in code/test comments per CS-GEN-003):

- **ADR-023 — Provider seam, mock-first (THE defining constraint of this slice).** Any scheduler/timer that
  drives periodic detection is consumed **behind a time-injectable seam** — a clock/scheduler port the tests
  can drive — so "a request **becomes overdue at its due date**", "an engagement is **approaching its due
  date**", and "the **cadence interval** has elapsed" are **deterministically testable without wall-clock
  waits**. The detection path must be **invokable under test** with controllable time. The **real production
  scheduler is a deploy-time concern (Phase 5)** — do **not** wire a real cron/scheduler platform here.
- **ADR-018 — Data retention / lifecycle.** Overdue is **derived** from the document request's **due date**
  and the engagement due date set in EPIC-011 — **no new clock, no new lifecycle attribute** for the
  determination itself. The engine **reads** the existing lifecycle attributes. (A request's *due point*
  provisioning — see § Data & Interface Contract / REQ-FILE-012 Notes — is the one bounded shape question.)
- **ADR-005 — RLS via security policies.** A client is reminded/notified **only about their own** overdue and
  document-request-created events; the reminder fan-out **honors per-viewer isolation** by **reusing the
  EPIC-016 client notification branch**. Any **net-new request-scoped table** (e.g. a per-engagement
  cadence-config table) gets its **own** RLS policy **and** a per-table isolation test ("a client cannot
  read/modify cadence config"; CLIENT-A vs CLIENT-B for notifications). **Hard tier-3 obligation** (an
  integration test per policy per ADR-005). Reuse the established engagement-scoped predicate shape
  (CS-SQL-003, as reconciled in EPIC-017).
- **ADR-003 — SESSION_CONTEXT.** Detection runs **server-side**; cadence-config writes (global default +
  per-engagement) run **under the accountant principal** through the `packages/db` wrapper (CS-TS-001/-002).
  The system batch detection path sets context appropriately for the notifications it writes.
- **ADR-006 — Monorepo, two apps.** Cadence configuration is an **`apps/admin`** setting (global default) and
  an individual-engagement setting (`apps/admin`); the resulting client nudges surface on **`apps/portal`**.
  Apply recipient/notification patterns consistently across surfaces (CS-TS-003).
- **ADR-012 — Testing pyramid.** Honor the tier mapping above: auto-detection (no manual trigger) and
  per-engagement-precedence are **hard tier-3** service/integration gates; the cadence-configuration journeys
  are **tier-6** e2e.
- **EPIC-018 digest reuse (additive).** Reminder / overdue / due-date-approaching / request-created
  notifications ride the **existing** content-free daily digest (EPIC-018) — they introduce **no** new email
  content, **no** per-event email, and **no** new email-preference surface (CS-GEN-002).

## Code standards

- **CS-TS-001** (`required`) — request-scoped DB access only through the `packages/db` wrapper (ADR-003): the
  cadence-config reads/writes (global default + per-engagement override).
- **CS-TS-002** (`required`) — never import the raw `requestDb`/`adminDb` pools outside `packages/db`.
- **CS-TS-003** (`recommended`) — apply shared recipient/notification patterns consistently across both
  surfaces (config on `apps/admin`; resulting client nudges on `apps/portal`).
- **CS-TS-004** (`experimental`) — the **cadence-config** server actions resolve identity from the request
  cookie and guard role (**accountant-only**) before the config write.
- **CS-SQL-001** (`required`) — an RLS policy **and** a per-table isolation test for every net-new
  request-scoped table (any per-engagement cadence-config table); the reminder fan-out reuses the EPIC-016
  `Notification` client branch.
- **CS-SQL-002** (`required`) — raw-SQL migration track only for what Prisma cannot express (the security
  policies / predicate functions).
- **CS-SQL-003** (`required`) — RLS predicate shape: reuse the established engagement-scoped inline-`EXISTS` /
  `fn_*_access` pattern (per the EPIC-017 CS-SQL-003 reconciliation).
- **CS-GEN-001** (`recommended`) — no secrets or PII in logs: the detection/reminder engine logs **no** client
  identity, document/request detail, or engagement detail.
- **CS-GEN-002** (`recommended`) — additive, non-destructive wiring: **consume** the EPIC-016 feed, the
  EPIC-018 digest, the EPIC-011 engagement due date, and the EPIC-013 document requests; do **not** rebuild
  any of them.
- **CS-GEN-003** (`recommended`) — cite the governing ADR/REQ in code & test comments.

## Data & Interface Contract

> Altitude-bounded: only the shapes that **trace** to the epic's behavior + cited ADRs. The IO expands these
> into the full field-level contract at Design; genuinely upstream shape questions are escalated via
> `OPEN-QUESTIONS.md`, never invented. Field-level minutiae (frequency representation/units, the exact
> last-reminder-sent shape, the approaching-due-date threshold, the scheduler trigger mechanism, the
> overdue-flag UI copy) are **not** fixed here.

- **Reminder cadence configuration (net-new).**
  - **Global default frequency** — a single accountant-owned setting governing how often overdue reminders
    are raised where no per-engagement override exists. (admin setting) *(traces: AC-MSG-018-03,
    AC-DASH-008-01; ADR-006)*
  - **Per-engagement override frequency** — an **engagement-scoped**, accountant-only value that, **when
    present, takes precedence** over the global default for that engagement; when absent, the global default
    applies. The override storage shape (a column on the engagement vs a dedicated per-engagement
    cadence-config row/table) is an **IO Design decision**; **if it is a net-new request-scoped table it gets
    an RLS policy + isolation test** (CS-SQL-001/-003; accountant-only). State: a frequency value per scope;
    the only in-scope transition is the **accountant setting/clearing** it. *(traces: AC-MSG-018-04,
    AC-DASH-008-02/-03; ADR-005, ADR-006)*
- **Document-request due point (consumed; provisioning is the one bounded shape question).** Overdue is
  determined by the **document request's due date** (AC-FILE-012-04). Per **REQ-FILE-012 Notes**, the seed
  does not fix how a request's due point is set; the provisional model is a **due point the accountant can set
  on the request, falling back to a global default interval after creation when none is set**. Whether the
  request entity already carries a due-date attribute (EPIC-013) or this slice adds one — and the fallback
  interval — is an **IO Design decision** bounded by this behavior; a genuinely upstream product question is
  escalated via `OPEN-QUESTIONS.md`, not invented. *(traces: AC-FILE-012-04, REQ-FILE-012 Notes; ADR-018)*
- **Overdue state (derived, NOT a new stored clock).** A request is **overdue** iff it is **unfulfilled** and
  its **due date has passed** (per the injected clock). Derived from existing lifecycle attributes (ADR-018);
  not a persisted lifecycle flag of its own (whether a denormalized flag is materialized for the
  accountant-view query is an IO Design decision bounded by AC-FILE-012-01/-02). *(traces: AC-FILE-012-01/-04;
  ADR-018)*
- **Reminder dispatch state (net-new).** A per-scope (request and/or engagement) record of **when a reminder
  was last raised**, used to enforce the **resolved cadence**: a reminder is not re-raised before the resolved
  frequency interval has elapsed. The exact representation (a last-sent watermark vs a raised-reminder log) is
  an **IO Design decision** bounded by this behavior. *(traces: AC-MSG-018-02/-03/-04; ADR-023)*
- **Reminder/lifecycle notifications (reuse EPIC-016 shapes).** Three notification types are **emitted into
  the existing `Notification` feed**, RLS-scoped per recipient:
  **request-overdue → accountant** (AC-MSG-013-05), **engagement-approaching-due-date → accountant**
  (AC-MSG-013-06), **document-request-created → client** (AC-MSG-014-02). They reuse the EPIC-016 recipient
  branches and are summarized by the EPIC-018 digest. *(traces: AC-MSG-013-05/-06, AC-MSG-014-02; ADR-005,
  EPIC-016/-018)*
- **Interface contracts.**
  - *Detection / reminder engine (system / batch — not a request principal):* input = the unfulfilled
    document requests whose due date has passed + the engagements approaching their due date, evaluated under
    the **injected clock**; effect = overdue requests **identified**, reminders **raised** at the resolved
    cadence (per-engagement override else global default, not re-raised within the interval), and the overdue
    / approaching-due-date / created notifications written to the EPIC-016 feed. The engine is **invokable
    under test** (clock/window controllable) so detection, cadence, and notifications can be asserted
    deterministically; the production schedule is a deploy-time concern (ADR-023). *(traces: AC-FILE-012-01/
    -03/-04, AC-MSG-018-01/-02; ADR-023)*
  - *Set global default cadence (server action, `apps/admin` only):* input = the accountant + a frequency;
    effect = the global default recorded; **role-guarded** (accountant-only) through the `packages/db`
    wrapper. *(traces: AC-DASH-008-01, AC-MSG-018-03; ADR-006, CS-TS-001/-004)*
  - *Set per-engagement cadence (server action, `apps/admin` only):* input = the accountant + an engagement +
    a frequency; effect = that engagement carries its own frequency (precedence over the global default);
    **role-guarded** (accountant-only) through the wrapper. *(traces: AC-DASH-008-02/-03, AC-MSG-018-04;
    ADR-005, ADR-006, CS-TS-001/-004)*
- **Field-shape obligations (ADR-002 conventions).** Any net-new table follows the project's PK /
  `DATETIMEOFFSET` / identity conventions.

## Acceptance scenarios

> Reproduced verbatim from `.planning/EPIC-019-overdue-reminder-engine.md` (the canonical behavior contract).
> Bind each to an executable test tagged with its AC id.

### AC-FILE-012-01 — Overdue requests are identified
```gherkin
Given a document request whose due date has passed and that is unfulfilled
When the system evaluates document requests
Then that request is identified as overdue
```

### AC-FILE-012-02 — Overdue requests are flagged
```gherkin
Given a document request identified as overdue
When the accountant views the request
Then it is flagged/surfaced as overdue
```

### AC-FILE-012-03 — Detection needs no manual trigger
```gherkin
Given a document request becomes overdue
When no one has initiated an overdue check
Then the system still identifies it as overdue on its own
```

### AC-FILE-012-04 — Overdue is based on the due date
```gherkin
Given two document requests, one past its due date and one not
When overdue is evaluated
Then only the one past its due date is treated as overdue
```

### AC-MSG-018-01 — System auto-identifies overdue requests
```gherkin
Given unfulfilled document requests with elapsed due dates
When the reminder engine runs without the accountant initiating it
Then it identifies the overdue requests automatically
```

### AC-MSG-018-02 — Overdue request raises a reminder
```gherkin
Given a document request identified as overdue
When the engine processes it
Then a reminder is raised about it
```

### AC-MSG-018-03 — Global default reminder frequency
```gherkin
Given the accountant configuring reminders
When she sets a global default reminder frequency
Then overdue reminders are raised at that frequency by default across engagements
```

### AC-MSG-018-04 — Per-engagement override takes precedence
```gherkin
Given a global default reminder frequency and an engagement with its own override
When reminders are raised for that engagement
Then the per-engagement frequency is used in place of the global default
```

### AC-DASH-008-01 — Set the global default frequency
```gherkin
Given the accountant on her settings surface
When she sets a global default overdue-reminder frequency
Then that global default is recorded and applies where no override exists
```

### AC-DASH-008-02 — Set a per-engagement frequency
```gherkin
Given the accountant viewing an individual engagement
When she sets an overdue-reminder frequency for that engagement
Then that engagement carries its own reminder frequency
```

### AC-DASH-008-03 — Per-engagement frequency wins
```gherkin
Given an engagement with a reminder frequency that differs from the global default
When the precedence is evaluated for that engagement
Then the per-engagement frequency takes precedence over the global default
```

### AC-MSG-013-05 — Accountant notified of an overdue request
```gherkin
Given a document request that has become overdue
When the engine processes it
Then the accountant receives an in-portal overdue notification
```

### AC-MSG-013-06 — Accountant notified of an approaching due date
```gherkin
Given an engagement approaching its due date
When the engine evaluates upcoming deadlines
Then the accountant receives an in-portal due-date-approaching notification
```

### AC-MSG-014-02 — Client notified a document request was created
```gherkin
Given the accountant creates a document request for a client
When the request is created
Then that client receives an in-portal notification that a document request was created for them
```

## References

- Planning: `.planning/EPIC-019-overdue-reminder-engine.md` (the slice + behavior contract)
- Requirements: REQ-FILE-012 (overdue detection & flagging), REQ-MSG-018 (auto-reminders + configurable
  cadence), REQ-DASH-008 (configurable overdue-reminder frequency), REQ-MSG-013 (-05/-06 accountant overdue /
  approaching-due-date notifications), REQ-MSG-014 (-02 client request-created notification)
- Architecture: ADR-023 (provider seam, mock-first — the **time-injectable** scheduler/clock seam; real
  scheduler → Phase 5), ADR-018 (data retention / lifecycle — overdue **derived** from existing due dates, no
  new clock), ADR-005 (RLS — client reminded/notified only about own events; isolation test per policy),
  ADR-003 (SESSION_CONTEXT — detection server-side; cadence writes under the accountant principal), ADR-006
  (monorepo — config on `apps/admin`, nudges on `apps/portal`), ADR-012 (testing tiers — auto-detection +
  precedence are hard tier-3)
- Personas: `.planning/personas/jane-accountant.md` (stops chasing by hand),
  `.planning/personas/sarah-returning-client.md`, `.planning/personas/martha-and-james-married-couple.md`
  (nudged about what they owe)
- Flows: `.planning/flows/flow-notification-feed.md` (the **reminder branch**); relates
  `.planning/flows/flow-document-lifecycle.md`, `.planning/flows/flow-engagement-lifecycle.md`
- Prior art: EPIC-016 (the `Notification` feed spine these reminders surface in — per-recipient RLS),
  EPIC-018 (the content-free daily digest these notifications ride), EPIC-011 (the engagement **due date**
  consumed for the approaching-deadline signal), EPIC-013 (document **requests** whose due dates the overdue
  determination reads)

## Notes

- **Reuse, do not re-implement, the four upstream seams.** The **notification feed** (EPIC-016), the **email
  digest** (EPIC-018), the **engagement due date** (EPIC-011), and the **document requests** (EPIC-013)
  **already exist**. This slice **adds** the **detection engine** (behind the time-injectable seam), the
  **cadence configuration** (global default + per-engagement override + precedence), the **reminder dispatch**
  (cadence-honoring), and the three **reminder/lifecycle notification types**. Wiring into the feed, the
  digest, the due date, and the requests is **additive** (CS-GEN-002).
- **The time-injectable seam is this slice's defining test discipline** (ADR-023). "Becomes overdue at the due
  date", "approaching the due date", and "the cadence interval has elapsed" must be asserted by **advancing an
  injected clock**, never by a wall-clock wait. The **auto-detection** proof must show the engine identifies
  overdue **without an accountant-initiated call** (AC-FILE-012-03 / AC-MSG-018-01) — asserting overdue only
  after a manual trigger does not prove the requirement and is a rejection. This is the analog of EPIC-018's
  test-invokable daily-digest dispatch.
- **Per-engagement precedence is this slice's correctness trap** (mirroring prior slices' isolation traps).
  The proof must be **two-sided**: an engagement **with** an override uses the **override** frequency (not the
  global default) **and** an engagement **without** an override uses the **global default**. A test that only
  checks the override is applied does not prove precedence and is insufficient.
- **RLS holds for the reminder fan-out and any net-new cadence table** (ADR-005). A client is reminded/
  notified **only about their own** events — reuse the EPIC-016 client branch and prove it **both ways**
  (CLIENT-A receives, CLIENT-B does not). Any **net-new request-scoped cadence-config table** is
  **accountant-only** and gets its own RLS policy **and** an isolation test (a client cannot read/modify it) —
  the per-policy integration test is a hard ADR-005 requirement. Reuse the established engagement-scoped
  predicate shape (CS-SQL-003, EPIC-017 reconciliation); if Design instead puts the override as a column on
  an already-RLS'd engagement record, no new policy is needed — flag the chosen shape, do not silently widen.
- **No new email path.** Reminder / overdue / approaching-due-date / request-created notifications ride the
  **existing EPIC-018 content-free daily digest** — content-free, at-most-one-per-day, accountant-suppressible.
  This slice introduces **no** per-event email and **no** new email content; if Design finds it needs a new
  email shape, that is an OPEN-QUESTION, not a silent widening.
- **IO Design discretion (bounded):** the frequency representation/units, the per-engagement override storage
  shape (engagement column vs dedicated cadence table — the latter triggers CS-SQL-001/-003), the request
  due-point provisioning + fallback interval (REQ-FILE-012 Notes), the approaching-due-date threshold, the
  last-reminder-sent representation, the scheduler trigger mechanism (a test-invokable batch in the POC), and
  the overdue-flag / settings UI copy are **IO Design decisions** bounded by the contract above — do not
  over-build. The **automatic detection (no manual trigger, behind the injected clock)**, the **overdue
  by-due-date** determination, **a reminder raised on overdue**, the **per-engagement precedence (both ways)**,
  the **per-recipient RLS isolation (both ways)**, and the **three notification types** are **non-negotiable**.
- **Cross-surface scope (CLAUDE.md § Platform-frontend scope).** The cadence config + overdue flag are
  `apps/admin` affordances; the resulting client nudges surface on `apps/portal`. Audits/e2e default to both
  surfaces where a recipient path spans them.
- **Build order:** EPIC-019 is the **fourth** Phase-4 epic, built on the EPIC-016 spine, the EPIC-018 digest,
  the EPIC-011 due date, and the EPIC-013 requests. It **produces** the overdue state that **EPIC-020**
  (dashboard needs-action / activity) later consumes. This slice does **not** close Phase 4 (EPIC-023 is the
  closer) — **no** phase-walkthrough video rides this PR.
