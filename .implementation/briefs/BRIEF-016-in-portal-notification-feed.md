---
id: BRIEF-016
title: In-portal notification feed — the dual-role spine, real-time delivery, persistent unread badge, mark-read-on-view, ≥90-day retention
status: ready
acceptance_criteria:
  - id: AC-MSG-007-01
    text: "Every notification a user is entitled to receive appears in that user's in-portal feed."
  - id: AC-MSG-007-02
    text: "The in-portal feed is the authoritative, complete record of a user's notifications; no notification exists only outside the portal."
  - id: AC-MSG-007-03
    text: "Any other notification channel is supplementary to, and does not replace, the in-portal feed."
  - id: AC-MSG-012-01
    text: "When a user is entitled to a notification, it surfaces in their in-portal feed promptly after the triggering event, without a manual refresh."
  - id: AC-MSG-012-02
    text: "A user with the portal open sees new notifications appear in real time as events occur."
  - id: AC-MSG-012-03
    text: "The unread-count badge reflects real-time arrival of new notifications."
  - id: AC-MSG-015-01
    text: "A notification is associated with the specific item that triggered it."
  - id: AC-MSG-015-02
    text: "When the user views a notification's linked item, that notification is automatically marked read."
  - id: AC-MSG-015-03
    text: "A notification marked read in this way is reflected as read in the feed and the unread count, with no separate dismiss step."
  - id: AC-MSG-016-01
    text: "A user's notification history is retained and viewable for a minimum of 90 days from generation."
  - id: AC-MSG-016-02
    text: "Both read and unread notifications are retained for at least the 90-day window."
  - id: AC-MSG-017-01
    text: "An unread-notification count badge is present in the navigation and visible to an authenticated user from any area."
  - id: AC-MSG-017-02
    text: "The badge shows the count of the user's unread notifications."
  - id: AC-MSG-017-03
    text: "The badge updates as notifications become read (MSG-015) or as new notifications arrive (MSG-012)."
  - id: AC-MSG-013-03
    text: "The accountant receives an in-portal notification when a document is uploaded."
  - id: AC-MSG-014-03
    text: "A client receives an in-portal notification when the status of their engagement changes."
  - id: AC-MSG-014-04
    text: "A client receives an in-portal notification when a deliverable is ready for them."
  - id: AC-MSG-014-05
    text: "A client receives an in-portal notification when their engagement request is accepted."
  - id: AC-MSG-014-06
    text: "A client receives an in-portal notification when their engagement request is declined."
  - id: AC-MSG-014-07
    text: "A client receives notifications only for events concerning their own engagements and requests."
methodology:
  tdd: optional
  acceptance_format: gherkin
  e2e: required
  coverage_target: none
  extra_gates:
    - "HARD tier-3 per-viewer RLS isolation (ADR-005 / ADR-003 / CS-SQL-001): the accountant-only sec.pol_Notification is generalized with a CLIENT branch so a client principal reads ONLY their own notifications. The per-policy test is mandatory — CLIENT-A reads zero of CLIENT-B's notifications; a null SESSION_CONTEXT reads zero; ACCOUNTANT reads all (AC-MSG-014-07). A missing/failing isolation test is a rejection."
    - "HARD tier-3 mark-read-on-view (ADR-003 / REQ-MSG-015): a notification carries a typed reference to its triggering item; viewing that linked item auto-marks the notification read under the propagated principal, with no separate dismiss step, and the read state + unread count reflect it (AC-MSG-015-01/-02/-03)."
    - "HARD tier-3 retention floor (ADR-018 §retention / REQ-MSG-016): notification records — read AND unread — are retained and viewable for ≥90 days from generation (AC-MSG-016-01/-02). Distinct from EPIC-017's indefinite thread retention."
    - "HARD tier-3 entitlement / authoritative-record (REQ-MSG-007): every event a user is entitled to produces exactly one feed notification for that user and only that user; the feed is the complete record (AC-MSG-007-01/-02)."
    - "Tier-6 e2e real-time arrival, BOTH surfaces (ADR-023 mock seam / ADR-006 / ADR-012): with the portal open, an entitled event surfaces in the feed and increments the badge without a manual refresh (AC-MSG-012-01/-02/-03, AC-MSG-017-01/-02/-03). Delivered behind the mockable real-time transport seam (ADR-023); real provider → Phase 5."
    - "Tier-6 e2e source-event wiring: accountant notified on document upload (AC-MSG-013-03); client notified on engagement status change (AC-MSG-014-03), deliverable ready (AC-MSG-014-04), request accepted (AC-MSG-014-05), request declined (AC-MSG-014-06) — lit up from the already-existing EPIC-010/-013/-003 source events."
    - "Tier-6 e2e cross-app mark-read (ADR-010): a notification whose linked item lives on the other app marks read across the session boundary when the item is viewed (AC-MSG-015-02/-03)."
acceptance_scenarios: .planning/EPIC-016-in-portal-notification-feed.md   # Given/When/Then reproduced verbatim in § Acceptance scenarios below
demo:
  applicable: yes
  apps: [portal, admin]
  personas: [jane-accountant, sarah-returning-client]
  flows: [flow-notification-feed]
source:
  - planning: .planning/EPIC-016-in-portal-notification-feed.md
  - requirements: .requirements/REQ-MSG-007.md
  - requirements: .requirements/REQ-MSG-012.md
  - requirements: .requirements/REQ-MSG-015.md
  - requirements: .requirements/REQ-MSG-016.md
  - requirements: .requirements/REQ-MSG-017.md
  - requirements: .requirements/REQ-MSG-013.md
  - requirements: .requirements/REQ-MSG-014.md
  - architecture: .architecture/decisions/ADR-005-rls-via-security-policies.md
  - architecture: .architecture/decisions/ADR-003-session-context.md
  - architecture: .architecture/decisions/ADR-006-monorepo-two-apps.md
  - architecture: .architecture/decisions/ADR-010-cross-app-navigation.md
  - architecture: .architecture/decisions/ADR-018-data-retention-lifecycle.md
  - architecture: .architecture/decisions/ADR-023-provider-seam-mock-first-integration.md
  - architecture: .architecture/decisions/ADR-012-testing-pyramid.md
code_standards:
  - "CS-TS-001 (required) — request-scoped DB access only through the packages/db wrapper (ADR-003 SESSION_CONTEXT): feed reads, mark-read writes, and badge counts"
  - "CS-TS-002 (required) — never import the raw requestDb/adminDb pools outside packages/db"
  - "CS-TS-003 (recommended) — apply shared patterns to BOTH surfaces (the feed + badge render on apps/portal and apps/admin)"
  - "CS-TS-004 (experimental) — every server action resolves identity from the request cookie and guards role before any DB write (mark-read is a per-principal server action)"
  - "CS-SQL-001 (required) — every client-scoped table ships a SECURITY POLICY + a CLIENT-A/CLIENT-B RLS test (the generalized pol_Notification client branch)"
  - "CS-SQL-002 (required) — raw-SQL track only for what Prisma cannot express (the security-policy predicate change)"
  - "CS-SQL-003 (required) — RLS predicates are inline TVFs, shallow, admin/accountant-first, fail-closed (the notification client/accountant branches)"
  - "CS-GEN-001 (recommended) — no secrets or PII in logs (notification payloads, client identities, linked-item keys)"
  - "CS-GEN-002 (recommended) — additive, non-destructive edits to the existing EPIC-003 Notification model"
  - "CS-GEN-003 (recommended) — cite the governing authority (ADR / REQ) in code & test comments"
---

# BRIEF-016 — In-portal notification feed — the dual-role spine

> **Self-contained build brief for the EPIC-016 slice (Phase 4 — the opening slice, the notification spine).**
> Stands up the **in-portal notification feed** as the authoritative notification channel for **both roles**,
> generalizing the EPIC-003 accountant-only `Notification` model to a **client branch** and lighting it up
> with the events that **already exist** in the system. Delivers a real-time feed + a persistent **unread-count
> badge** on both apps, **auto-mark-read when the linked item is viewed**, and a **≥90-day retention floor**.
> `source:` refs are read-only context; the brief stands alone. Composed by the Conductor from `.planning/EPIC-016`
> + its cited `REQ-*`/ADRs. **This slice does NOT close a roadmap phase** (EPIC-017..023 remain `planned`;
> EPIC-023 is the Phase-4 closer) — no phase-walkthrough obligation rides this PR.

## Scope

Stand up the **in-portal notification feed** as the **authoritative** notification channel for **both** the
accountant (`apps/admin` — Tax Portal) and clients (`apps/portal` — Client Portal), and wire the
already-built source events into it. Four capabilities:

1. **Dual-role feed (generalize the EPIC-003 model).** EPIC-003 introduced a `Notification` entity guarded by
   an **accountant-only** `sec.pol_Notification`. This slice **generalizes** that model so a **client** also
   has a feed showing **only their own** notifications. The feed renders on **both** surfaces; the accountant
   feed (`apps/admin`) and the client feed (`apps/portal`) are the **same model under two principals** (ADR-006).
   The feed is the **authoritative, complete record** — every notification a user is entitled to appears there,
   and no notification exists only outside the portal (any other channel, e.g. the EPIC-018 email digest, is
   strictly **supplementary**).

2. **Persistent unread-count badge.** An unread-notification count badge is present in the **navigation** on
   both surfaces, visible to an authenticated user **from any area**. It shows the count of that user's unread
   notifications and updates as notifications are **read** (capability 3) or **arrive** (capability 4).

3. **Auto-mark-read when the linked item is viewed.** Each notification is associated with the **specific item
   that triggered it** (a typed reference). When the user **views that linked item**, the notification is
   **automatically marked read** — the read state reflects in the feed and the unread count **with no separate
   dismiss step**. When the linked item lives on the **other app** (ADR-010 cross-app navigation), following
   the link and the resulting auto-mark-read **honor the session boundary**.

4. **Real-time delivery + ≥90-day retention.** A new notification is delivered to an open portal **in real
   time** — it surfaces in the feed and increments the badge **without a manual refresh**. Real-time transport
   is consumed behind a **mockable provider seam** (ADR-023); the **mock realization** is what this slice
   verifies (real provider re-validation → Phase 5). Notification records — **read and unread** — are retained
   and viewable for **at least 90 days** from generation (ADR-018; distinct from EPIC-017's indefinite thread
   retention).

**Source-event wiring (lighting up the spine).** This slice wires the **already-existing** events into the
feed — it does **not** invent new source events:
- **Accountant feed:** a **document upload** (EPIC-013 source event) → AC-MSG-013-03.
- **Client feed:** an **engagement status change** (EPIC-010) → AC-MSG-014-03; a **deliverable ready**
  (EPIC-010/-013) → AC-MSG-014-04; an **engagement request accepted / declined** (EPIC-003/-012) →
  AC-MSG-014-05/-06.

This establishes the **spine** that EPIC-017 (messaging), EPIC-018 (email digest), and EPIC-019 (reminders)
hang their own notification types on. Built on EPIC-003 (the `Notification` entity + `pol_Notification`),
EPIC-010 (engagement status-change + deliverable source events), and EPIC-013 (document-upload source event).

## Out of scope

- **New-message notifications** — AC-MSG-013-02 (accountant) and AC-MSG-014-01 (client) → **EPIC-017** (the
  message is the source event; it does not exist until messaging is built).
- **Overdue / due-date / document-request-created notifications** — AC-MSG-013-05/-06, AC-MSG-014-02 →
  **EPIC-019** (the reminder engine detects them).
- **The email digest fallback** (REQ-MSG-008/009/010/011) → **EPIC-018**. This slice is the **in-portal feed
  only**; "supplementary channel" (AC-MSG-007-03) is verified against the **presence** of the feed, **not** the
  email channel's behavior.
- **Account-less prospects.** A declined prospect with **no account** receives the decline by **email** (built
  in EPIC-003); AC-MSG-014-05/-06 here cover the **in-portal feed** path for a client who **holds an account**
  at decision time (e.g. a returning client requesting from inside the portal, EPIC-012).
- **Real-time transport against a real provider** → **Phase 5** (mock-first per ADR-023). This slice verifies
  the **mock** realization of the transport seam only.
- **The accountant dashboard / activity feed aggregation** (REQ-DASH-*) → **EPIC-020/021**. This slice owns the
  per-user notification feed + badge, not the cross-practice dashboard.

## Acceptance criteria

Each AC is covered by automated test(s) **tagged with its AC id** at the prescribed tier (§ Methodology). An
AC is implemented only when its tagged test(s) **pass in CI**; the epic is delivered only when all **20** are
`verified` in `COVERAGE.md`.

### REQ-MSG-007 — In-portal feed is the primary, authoritative channel
- **AC-MSG-007-01** — Every notification a user is entitled to receive appears in that user's in-portal feed.
- **AC-MSG-007-02** — The in-portal feed is the authoritative, complete record of a user's notifications; no notification exists only outside the portal.
- **AC-MSG-007-03** — Any other notification channel is supplementary to, and does not replace, the in-portal feed.

### REQ-MSG-012 — Real-time delivery
- **AC-MSG-012-01** — When a user is entitled to a notification, it surfaces in their in-portal feed promptly after the triggering event, without a manual refresh.
- **AC-MSG-012-02** — A user with the portal open sees new notifications appear in real time as events occur.
- **AC-MSG-012-03** — The unread-count badge reflects real-time arrival of new notifications.

### REQ-MSG-015 — Marked read when the linked item is viewed
- **AC-MSG-015-01** — A notification is associated with the specific item that triggered it.
- **AC-MSG-015-02** — When the user views a notification's linked item, that notification is automatically marked read.
- **AC-MSG-015-03** — A notification marked read in this way is reflected as read in the feed and the unread count, with no separate dismiss step.

### REQ-MSG-016 — History retained ≥90 days
- **AC-MSG-016-01** — A user's notification history is retained and viewable for a minimum of 90 days from generation.
- **AC-MSG-016-02** — Both read and unread notifications are retained for at least the 90-day window.

### REQ-MSG-017 — Persistent unread-count badge
- **AC-MSG-017-01** — An unread-notification count badge is present in the navigation and visible to an authenticated user from any area.
- **AC-MSG-017-02** — The badge shows the count of the user's unread notifications.
- **AC-MSG-017-03** — The badge updates as notifications become read (MSG-015) or as new notifications arrive (MSG-012).

### REQ-MSG-013 — Accountant notification type (the already-sourced one)
- **AC-MSG-013-03** — The accountant receives an in-portal notification when a document is uploaded.

### REQ-MSG-014 — Client notification types (the already-sourced subset)
- **AC-MSG-014-03** — A client receives an in-portal notification when the status of their engagement changes.
- **AC-MSG-014-04** — A client receives an in-portal notification when a deliverable is ready for them.
- **AC-MSG-014-05** — A client receives an in-portal notification when their engagement request is accepted.
- **AC-MSG-014-06** — A client receives an in-portal notification when their engagement request is declined.
- **AC-MSG-014-07** — A client receives notifications only for events concerning their own engagements and requests.

## Methodology & quality requirements

- **Acceptance format: gherkin.** Bind the Given/When/Then scenarios in § Acceptance scenarios to executable
  tests (carried verbatim from the epic). Each test's title/annotation contains its **AC id** (the AC-id
  test-tag contract — what makes the Validate write-back possible).
- **Tier mapping (ADR-012 testing pyramid; per the epic's sign-off contract):**
  - **Service integration / security (tier 3)** — **AC-MSG-014-07** (the hard per-viewer RLS isolation test),
    AC-MSG-015-01/-02 (linked-item reference + auto-mark-read), AC-MSG-016-01/-02 (the ≥90-day retention
    floor), and the entitlement/authoritative-record guarantees AC-MSG-007-01/-02.
  - **e2e (tier 6)** — AC-MSG-007-03 (feed-is-present supplementary check), AC-MSG-012-01/-02/-03 (real-time
    arrival + badge, **both surfaces**), AC-MSG-015-03 (read reflects with no dismiss step),
    AC-MSG-017-01/-02/-03 (badge present/count/updates), AC-MSG-013-03 (document-upload → accountant feed),
    AC-MSG-014-03/-04/-05/-06 (status-change / deliverable / accept / decline → client feed).
- **e2e required** (CLAUDE.md IO e2e defaults): this slice touches SQL Server security policies +
  `SESSION_CONTEXT` propagation (feed reads / mark-read writes / badge counts under the propagated principal),
  a **real-time subscription stream** (SSE/Realtime behind the mock seam), and **cross-module boundaries**
  (the document-upload / status-change / accept-decline source events feed into notifications). E2E runs
  against the full docker-compose stack with **both apps up**; real-time arrival + the badge are exercised on
  **both** the portal and admin surfaces (cross-app per ADR-010).
- **Hard extra gates** — see front-matter `extra_gates`: per-viewer RLS isolation (CLIENT-A/CLIENT-B + null
  SESSION_CONTEXT + ACCOUNTANT-reads-all), mark-read-on-view, the ≥90-day retention floor, the
  entitlement/authoritative-record guarantee, real-time arrival on both surfaces behind the mock seam, the
  source-event wiring, and cross-app mark-read.
- **UI demo (`demo.applicable: yes`)** — a `@demo` Playwright walkthrough captures an AC-tagged screenshot
  gallery into `docs/demos/EPIC-016/` across **both surfaces**, walking the **jane-accountant** journey
  (document-upload notification + badge on `apps/admin`) and the **sarah-returning-client** journey
  (status-change / deliverable / accept notifications + badge + mark-read-on-view on `apps/portal`) along
  `flow-notification-feed`. **Non-gating** (the e2e gate is the gate); see `.orchestration/DEMO-POLICY.md`.

## Constraints

Non-negotiables (cite the originating ADR/REQ in code/test comments per CS-GEN-003):

- **ADR-005 — RLS via security policies.** Generalize the accountant-only `sec.pol_Notification` with a
  **CLIENT branch** so a client principal reads **only their own** notifications (AC-MSG-014-07). This is a
  **changed predicate on a client-scoped table** → it ships a **policy + isolation test** (CS-SQL-001): CLIENT-A
  reads zero of CLIENT-B's notifications, a null SESSION_CONTEXT reads zero, ACCOUNTANT reads all. A
  missing/failing isolation test is a **rejection**. Predicate shape follows CS-SQL-003 (inline TVF, shallow,
  admin/accountant-first, fail-closed). **Hard tier-3 obligation.**
- **ADR-003 — SESSION_CONTEXT.** Feed reads, **mark-read writes**, and **badge counts** run under the
  propagated principal via the `packages/db` wrapper that sets `SESSION_CONTEXT` before the first real query
  (CS-TS-001/-002). **No** route handler bypasses the wrapper.
- **ADR-006 — Monorepo, two apps.** The feed + badge render on **both** `apps/portal` and `apps/admin`; they
  are the **same model under two principals** (CS-TS-003 — shared patterns applied to both surfaces).
- **ADR-010 — Cross-app navigation.** A notification's linked item may live on the **other** app; following the
  link and the resulting **auto-mark-read** must honor the session boundary (the read write runs under the
  viewing principal on whichever app hosts the item).
- **ADR-018 — Data retention.** Notification records carry a **≥90-day retention floor** for both read and
  unread records — **distinct** from the indefinite message-thread retention of EPIC-017 (REQ-MSG-006). Do not
  conflate the two retention policies.
- **ADR-023 — Provider seam, mock-first.** Real-time transport is consumed behind a **mockable seam** (the
  established port + bindings + selector pattern); the **mock realization** is what this slice verifies. **No**
  real provider is wired (that re-validation is Phase 5). *(See § Notes — the transport choice itself has no
  dedicated ADR yet; this is a planning-flagged architecture gap, non-blocking for the POC.)*
- **ADR-012 — Testing pyramid.** Honor the tier mapping above; per-viewer notification isolation,
  mark-read-on-view, the retention floor, and the entitlement guarantee are **hard tier-3** integration/security;
  real-time arrival + the badge + the source-event wiring are **tier-6** e2e.

## Code standards

- **CS-TS-001** (`required`) — request-scoped DB access only through the `packages/db` wrapper (ADR-003): feed
  reads, mark-read writes, badge counts.
- **CS-TS-002** (`required`) — never import the raw `requestDb`/`adminDb` pools outside `packages/db`.
- **CS-TS-003** (`recommended`) — apply shared patterns to **both** surfaces (the feed + badge render on
  `apps/portal` and `apps/admin`).
- **CS-TS-004** (`experimental`) — every server action resolves identity from the request cookie and guards
  role before any DB write (**mark-read** is a per-principal server action).
- **CS-SQL-001** (`required`) — every client-scoped table ships a SECURITY POLICY **and** a CLIENT-A/CLIENT-B
  RLS test (the generalized `pol_Notification` client branch).
- **CS-SQL-002** (`required`) — raw-SQL track only for what Prisma cannot express (the security-policy predicate
  change lives in `db/policies/` per ADR-005).
- **CS-SQL-003** (`required`) — RLS predicates are inline TVFs, shallow, admin/accountant-first, fail-closed
  (the notification client/accountant branches).
- **CS-GEN-001** (`recommended`) — no secrets or PII in logs (notification payloads, client identities,
  linked-item keys).
- **CS-GEN-002** (`recommended`) — additive, non-destructive edits to the existing EPIC-003 `Notification`
  model (generalize, do not rewrite).
- **CS-GEN-003** (`recommended`) — cite the governing ADR/REQ in code & test comments.

## Data & Interface Contract

> Altitude-bounded: only the shapes that **trace** to the epic's behavior + cited ADRs. The IO expands these
> into the full field-level contract at Design; genuinely upstream shape questions are escalated via
> `OPEN-QUESTIONS.md`, never invented. Field-level minutiae (exact column types, the badge-count query shape,
> the real-time channel/topic naming, the linked-item URL builder) are **not** fixed here.

- **Notification entity (generalize the EPIC-003 model, net-changed).** EPIC-003's accountant-only
  `Notification` is generalized so a record is scoped to its **recipient principal** (an **accountant** or a
  **client**) and a **client recipient reads only their own**. State set: **unread** ↔ **read**; transition:
  **mark-read** (automatic, on viewing the linked item — never a manual dismiss). Carries a **typed reference
  to its triggering item** (the linked item — see below) and a **notification type** discriminator (document
  upload; status change; deliverable ready; request accepted; request declined — the already-sourced set this
  slice owns). Retention floor: **≥90 days** from generation, for both read and unread. This is an **additive**
  change to the existing entity (CS-GEN-002), not a rewrite. *(traces: REQ-MSG-007/014/016; ADR-005, ADR-018)*
- **Per-viewer access (RLS, net-changed predicate).** `sec.pol_Notification` gains a **CLIENT branch**: a
  client principal reads **only notifications whose recipient is that client**; the **accountant** reads the
  accountant-scoped set; a **null SESSION_CONTEXT** reads **nothing** (fail-closed). This is the hard
  per-viewer isolation gate (AC-MSG-014-07). *(traces: REQ-MSG-014-07; ADR-005, ADR-003)*
- **Linked-item reference (net-new on the entity).** Each notification references the **specific item that
  triggered it** (e.g. the uploaded document, the engagement whose status changed, the request that was
  decided) — enough to (a) render a navigable link and (b) drive **auto-mark-read when that item is viewed**.
  When the item lives on the **other app**, the reference resolves across the app boundary (ADR-010). *(traces:
  REQ-MSG-015-01/-02; ADR-010)*
- **Unread-count (derived).** The badge count is the count of the viewing principal's **unread** notifications,
  computed under SESSION_CONTEXT — not stored as a separate source of truth. It reflects **mark-read** and
  **real-time arrival**. *(traces: REQ-MSG-017; ADR-003)*
- **Real-time transport (mockable seam).** New notifications are pushed to an open portal via a **transport
  consumed behind the ADR-023 provider seam** (port + bindings + selector); the **mock binding** is the
  realization this slice verifies. The feed + badge update **without a manual refresh** on arrival. *(traces:
  REQ-MSG-012; ADR-023)*
- **Interface contracts.**
  - *Read the feed / badge (both apps):* input = the authenticated viewing principal; output = that principal's
    notifications (RLS-scoped) + the unread count; **runs through the `packages/db` wrapper**. *(traces:
    REQ-MSG-007/017; ADR-003/-005/-006)*
  - *Mark-read-on-view (server action, both apps):* input = the viewing principal + the linked item being
    viewed; effect = the corresponding notification(s) transition **unread → read** under that principal,
    reflected in the feed + count with **no dismiss step**; honors the cross-app boundary. **No manual dismiss
    endpoint is in scope.** *(traces: REQ-MSG-015; ADR-003/-010, CS-TS-004)*
  - *Emit a notification (from an existing source event):* the already-built document-upload (EPIC-013),
    status-change / deliverable (EPIC-010), and accept/decline (EPIC-003/-012) paths emit a feed notification to
    the **entitled** recipient only. *(traces: REQ-MSG-013-03, REQ-MSG-014-03/-04/-05/-06)*
- **Field-shape obligations (ADR-002 conventions, where net-new columns are added).** Any net-new
  columns/tables follow the project's PK / `DATETIMEOFFSET` / identity conventions; the security-policy
  predicate change rides the **raw-SQL track** (`db/policies/`, CS-SQL-002).

## Acceptance scenarios

> Reproduced verbatim from `.planning/EPIC-016-in-portal-notification-feed.md` (the canonical behavior
> contract). Bind each to an executable test tagged with its AC id.

### AC-MSG-007-01 — Entitled notification appears in the feed
```gherkin
Given a user entitled to a notification for an event
When that event occurs
Then a corresponding notification appears in that user's in-portal feed
```

### AC-MSG-007-02 — The feed is the authoritative record
```gherkin
Given a user has received several notifications over time
When they open their in-portal notification feed
Then every notification they are entitled to is present there as the complete record
```

### AC-MSG-007-03 — Other channels are supplementary
```gherkin
Given a notification also triggered an out-of-portal nudge
When the user consults the in-portal feed
Then the feed contains the notification and the other channel has not replaced it
```

### AC-MSG-012-01 — Notification surfaces without manual refresh
```gherkin
Given a user with the portal open
When a notification-worthy event occurs for them
Then the notification surfaces in their feed promptly without them refreshing
```

### AC-MSG-012-02 — New notifications appear in real time
```gherkin
Given a user is viewing the portal
When multiple events occur for them
Then each new notification appears in the feed in real time as it occurs
```

### AC-MSG-012-03 — Badge reflects real-time arrival
```gherkin
Given a user with the portal open and a known unread count
When a new notification arrives in real time
Then the unread-count badge increments without a manual refresh
```

### AC-MSG-015-01 — Notification references its triggering item
```gherkin
Given a notification generated by an event on a specific item
When the notification is inspected
Then it references the specific item that triggered it
```

### AC-MSG-015-02 — Viewing the linked item marks it read
```gherkin
Given an unread notification whose linked item the user has not yet viewed
When the user views that linked item
Then the notification is automatically marked read
```

### AC-MSG-015-03 — Read state reflects without a dismiss step
```gherkin
Given a notification auto-marked read by viewing its item
When the user looks at their feed and unread count
Then the notification shows read and the count has decreased, with no separate dismiss action
```

### AC-MSG-016-01 — History retained and viewable for 90 days
```gherkin
Given notifications generated within the last 90 days
When the user views their notification history
Then all of those notifications remain present and viewable
```

### AC-MSG-016-02 — Read and unread both retained in the window
```gherkin
Given both read and unread notifications generated within the 90-day window
When the user views their notification history
Then both read and unread notifications are retained and shown
```

### AC-MSG-017-01 — Badge present from any area
```gherkin
Given an authenticated user
When they navigate to any area of the portal
Then an unread-notification count badge is present in the navigation
```

### AC-MSG-017-02 — Badge shows unread count
```gherkin
Given a user with a known number of unread notifications
When they look at the navigation badge
Then the badge shows that number of unread notifications
```

### AC-MSG-017-03 — Badge updates on read and on arrival
```gherkin
Given a visible unread-count badge
When a notification is marked read or a new notification arrives
Then the badge updates to reflect the new unread count
```

### AC-MSG-013-03 — Accountant notified on document upload
```gherkin
Given a client uploads a document to an engagement
When the upload completes
Then the accountant receives an in-portal notification of the upload
```

### AC-MSG-014-03 — Client notified on engagement status change
```gherkin
Given a client with an active engagement
When the accountant changes that engagement's status
Then the client receives an in-portal notification of the status change
```

### AC-MSG-014-04 — Client notified when a deliverable is ready
```gherkin
Given a client with an engagement
When a deliverable is made ready for them
Then the client receives an in-portal notification that a deliverable is ready
```

### AC-MSG-014-05 — Client notified when request accepted
```gherkin
Given a prospective/returning client whose engagement request is pending
When the accountant accepts the request
Then the client is notified their request was accepted
```

### AC-MSG-014-06 — Client notified when request declined
```gherkin
Given a prospective/returning client whose engagement request is pending
When the accountant declines the request
Then the client is notified their request was declined
```

### AC-MSG-014-07 — Client sees only their own events
```gherkin
Given two clients with separate engagements
When events occur on each client's engagement
Then each client's feed contains only notifications for their own engagements and requests
```

## References

- Planning: `.planning/EPIC-016-in-portal-notification-feed.md` (the slice + behavior contract)
- Requirements: REQ-MSG-007, REQ-MSG-012, REQ-MSG-015, REQ-MSG-016, REQ-MSG-017, REQ-MSG-013 (-03 only),
  REQ-MSG-014 (-03..-07 only)
- Architecture: ADR-005 (generalize pol_Notification with a client branch — the per-viewer RLS isolation),
  ADR-003 (SESSION_CONTEXT — feed reads / mark-read writes / badge counts under the propagated principal),
  ADR-006 (monorepo — feed + badge on both apps), ADR-010 (cross-app navigation — view-the-item mark-read
  across the boundary), ADR-018 (data retention — ≥90-day notification floor), ADR-023 (provider seam —
  real-time transport behind a mockable seam), ADR-012 (testing tiers)
- Personas: `.planning/personas/jane-accountant.md` (single work surface — must notice activity),
  `.planning/personas/sarah-returning-client.md`, `.planning/personas/martha-and-james-married-couple.md`
  (clients who drop in and need to notice activity)
- Flows: `.planning/flows/flow-notification-feed.md` (this slice's primary flow); extends
  `.planning/flows/flow-message-exchange.md`
- Prior art: EPIC-003 (the `Notification` entity + accountant-only `pol_Notification` this slice generalizes),
  EPIC-010 (engagement status-change + deliverable source events), EPIC-013 (document-upload source event),
  EPIC-012 (returning-client request — the accept/decline-with-account path)

## Notes

- **Generalize, do not re-implement EPIC-003.** The `Notification` entity and `sec.pol_Notification` already
  exist (accountant-only). This slice **adds the client branch** to the RLS policy, the **client-side feed +
  badge** on `apps/portal`, the **linked-item reference + auto-mark-read**, the **real-time delivery** behind
  the ADR-023 mock seam, and the **≥90-day retention floor**. It wires the **already-existing** source events
  (document upload, status change, deliverable, accept/decline) into the feed — it does **not** create new
  source events. Edits to the existing model are **additive** (CS-GEN-002).
- **The per-viewer isolation proof is the panel/SDET trap** (per ADR-005 history, mirroring EPIC-013's
  both-party trap, EPIC-014's no-client-delete trap, and EPIC-015's no-client-purge trap): the generalized
  `pol_Notification` client branch must be proven with a **hard tier-3 isolation test** — CLIENT-A reads
  **zero** of CLIENT-B's notifications, a **null** SESSION_CONTEXT reads **zero**, and the **ACCOUNTANT** reads
  the accountant set. A one-directional assertion is insufficient (AC-MSG-014-07). The entitlement guarantee
  also runs the other way: an event for one client must **not** surface in another client's feed.
- **Mark-read is automatic, never a dismiss button** (REQ-MSG-015): the read transition fires from **viewing
  the linked item**, not from a separate dismiss action. The proof must show the feed + unread count reflect
  the read with **no** dismiss step, and — for a linked item on the **other** app — that the cross-app view
  marks read across the session boundary (ADR-010).
- **Real-time is verified against the mock seam** (ADR-023): the transport is consumed behind the established
  **port + bindings + selector** pattern; this slice verifies the **mock** binding (feed + badge update on
  arrival without a manual refresh). **No** real provider (Supabase Realtime / SSE choice) is wired — that is
  Phase 5. **Planning-flagged architecture gap (non-blocking):** the real-time transport choice **has no
  dedicated ADR** yet (`.planning/ROADMAP.md` § Phase 4 architecture note) — the architecture layer should own
  the HOW before the Phase-5 real-provider enablement. This slice does not resolve that; it scopes strictly to
  the mock seam. Do **not** invent a transport ADR in this slice.
- **Retention floor is distinct from thread retention** (ADR-018): notifications retain **≥90 days** (read and
  unread); EPIC-017 message threads retain **indefinitely**. Keep the two policies separate — do not apply the
  90-day floor to anything but notification records.
- **Authoritative-record guarantee** (REQ-MSG-007): every entitled event produces exactly one feed notification
  for the entitled user, the feed is the **complete** record, and any other channel (the future EPIC-018 email
  digest) is **supplementary**. AC-MSG-007-03 is verified against the **presence** of the feed notification,
  **not** the email channel's behavior (email is out of scope until EPIC-018).
- **IO Design discretion (bounded):** the badge-count query/cache shape, the real-time channel/topic naming and
  mock-binding internals, the linked-item URL-builder, and whether the notification-type discriminator is an
  enum or a lookup are **IO Design decisions** bounded by the contract above — do not over-build. The
  **client-branch RLS isolation**, **mark-read-on-view-only** (no dismiss endpoint), the **≥90-day floor**, and
  **mock-seam-only** (no real provider) are **non-negotiable**.
- **Cross-surface parity (CLAUDE.md § Platform-frontend scope).** The feed + badge render on **both**
  `apps/portal` and `apps/admin`; audits, e2e, and mirror-file checks default to **both** surfaces. This is a
  genuine two-surface slice (the dual-role feed) — the parity rule is load-bearing here.
- **Build order:** EPIC-016 is the **first** Phase-4 epic — the **notification spine**. EPIC-017 (messaging),
  EPIC-018 (email digest), and EPIC-019 (reminders) depend on it and hang their own notification types on this
  feed. This slice does **not** close Phase 4 (EPIC-023 is the closer) — **no** phase-walkthrough video rides
  this PR.
</content>
</invoke>
