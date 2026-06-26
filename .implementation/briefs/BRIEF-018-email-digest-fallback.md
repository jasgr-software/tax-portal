---
id: BRIEF-018
title: Email digest fallback — a content-free daily nudge that draws a recipient back to the portal, with accountant self-suppression and client default-on, digesting the EPIC-016 notification feed through the ADR-025 email seam
status: ready
acceptance_criteria:
  - id: AC-MSG-008-01
    text: "A fallback email notification conveys only that there is new activity in the recipient's portal, plus a means to sign in."
  - id: AC-MSG-008-02
    text: "A fallback email contains no activity detail — no message content, no document names or content, no client or engagement identifying detail, and no description of the specific event."
  - id: AC-MSG-008-03
    text: "Acting on the email leads the recipient to sign in to the portal to see the actual activity."
  - id: AC-MSG-009-01
    text: "A recipient receives at most one notification email per day."
  - id: AC-MSG-009-02
    text: "The system does not send a separate email for each individual notification event."
  - id: AC-MSG-009-03
    text: "When multiple notification-worthy events occur for a recipient within a day, they result in no more than one email nudge for that day (which, per REQ-MSG-008, still carries no activity detail)."
  - id: AC-MSG-010-01
    text: "The accountant can turn off her own email notifications entirely."
  - id: AC-MSG-010-02
    text: "While suppressed, the accountant receives no notification emails of any kind."
  - id: AC-MSG-010-03
    text: "Suppressing email does not affect the accountant's in-portal notification feed, which continues to receive all her notifications."
  - id: AC-MSG-010-04
    text: "The accountant's email-suppression setting does not change whether clients receive their own email notifications."
  - id: AC-MSG-011-01
    text: "A newly created client account has the email fallback nudge enabled by default."
  - id: AC-MSG-011-02
    text: "A client receives email notification nudges without any manual opt-in step."
methodology:
  tdd: optional
  acceptance_format: gherkin
  e2e: required
  coverage_target: none
  extra_gates:
    - "HARD tier-3 content-free email body (ADR-025 §3 / ADR-017 / REQ-MSG-008): a fallback email conveys ONLY that there is new activity + a means to sign in; it carries NO message content, document names/content, client or engagement identifying detail, or description of the specific event. Proven by seeding sensitive values (client name, document name, message body, engagement detail) into the recipient's activity and asserting NONE of them appears in the rendered email subject/body, AND that the body contains only the generic nudge + a sign-in link. This is the security-sensitive property of the slice (AC-MSG-008-01/-02). A one-sided assertion (only checking the nudge text is present, not that detail is absent) is a rejection."
    - "HARD tier-3 daily-cap batching (REQ-MSG-009): at most ONE email per recipient per day regardless of event count; the system never sends a separate email per event. Proven by generating N (>1) notification-worthy events for a recipient within a day and asserting EXACTLY one email is delivered for that recipient that day (mail-catcher count == 1), and that a subsequent day's events yield exactly one further email (AC-MSG-009-01/-02/-03)."
    - "HARD tier-3 accountant self-suppression, proven THREE ways (REQ-MSG-010): while suppressed the accountant receives ZERO notification emails of any kind (AC-MSG-010-02); suppression does NOT affect her in-portal feed — the feed still receives ALL her notifications (AC-MSG-010-03); and her suppression setting does NOT change whether clients are emailed — a client still receives their nudge while the accountant is suppressed (AC-MSG-010-04). Each of the three independent consequences is asserted."
    - "Tier-3 client default-on (REQ-MSG-011-01): a newly created client account has the email fallback nudge enabled by default — asserted on the as-created account state, with no opt-in step performed."
    - "Tier-6 e2e nudge → sign-in against the mail catcher (AC-MSG-008-01/-03): a client with new in-portal activity receives a content-free nudge (inspected in Mailhog) that conveys only 'new activity' + a sign-in affordance; acting on it leads the recipient to sign in to the portal (apps/portal) to see the actual activity."
    - "Tier-6 e2e accountant suppression toggle (AC-MSG-010-01): the accountant turns off her own email notifications entirely via the apps/admin setting, and thereafter receives no notification emails."
    - "Tier-6 e2e client emailed without opting in (AC-MSG-011-02): a newly created client with no setup performed receives an email nudge when a notification-worthy event occurs for them."
acceptance_scenarios: .planning/EPIC-018-email-digest-fallback.md   # Given/When/Then reproduced verbatim in § Acceptance scenarios below
demo:
  applicable: yes
  apps: [admin, portal]
  personas: [jane-accountant, sarah-returning-client]
  flows: [flow-notification-feed]
source:
  - planning: .planning/EPIC-018-email-digest-fallback.md
  - requirements: .requirements/REQ-MSG-008.md
  - requirements: .requirements/REQ-MSG-009.md
  - requirements: .requirements/REQ-MSG-010.md
  - requirements: .requirements/REQ-MSG-011.md
  - architecture: .architecture/decisions/ADR-025-transactional-email-transport.md
  - architecture: .architecture/decisions/ADR-023-provider-seam-mock-first-integration.md
  - architecture: .architecture/decisions/ADR-017-telemetry-data-handling-policy.md
  - architecture: .architecture/decisions/ADR-006-monorepo-layout.md
  - architecture: .architecture/decisions/ADR-012-testing-pyramid.md
code_standards:
  - "CS-TS-001 (required) — request-scoped DB access only through the packages/db wrapper (ADR-003 SESSION_CONTEXT): the accountant's suppression-toggle read/write and the client default-on read run through the wrapper"
  - "CS-TS-002 (required) — never import the raw requestDb/adminDb pools outside packages/db"
  - "CS-TS-003 (recommended) — apply shared recipient/email-preference patterns consistently across both surfaces (the digest serves recipients of apps/portal and apps/admin)"
  - "CS-TS-004 (experimental) — the suppress-own-email server action resolves identity from the request cookie and guards role (accountant-only) before the preference write"
  - "CS-GEN-001 (recommended) — no secrets or PII in logs: the digest composer/dispatcher logs NO recipient activity detail, client identity, message/document content, or email bodies (ADR-025 §4 no-body-logging; ADR-017)"
  - "CS-GEN-002 (recommended) — additive, non-destructive wiring: consume the existing EPIC-016 Notification feed and the ADR-025 packages/email seam; do not rebuild the feed or the email transport"
  - "CS-GEN-003 (recommended) — cite the governing ADR/REQ in code & test comments"
---

# BRIEF-018 — Email digest fallback (content-free daily nudge)

> **Self-contained build brief for the EPIC-018 slice (Phase 4 — the secondary, out-of-portal channel).**
> Delivers the **email fallback nudge**: a **content-free** email that tells a recipient only that there is
> **new activity** in their portal and gives them a **way to sign in** — never any client name, document or
> message content, engagement detail, or event description. Emails are **batched to a daily digest** (at most
> **one per recipient per day**, never one per event). The **accountant can suppress her own** email entirely
> (her in-portal feed is untouched and clients are unaffected); for **clients the nudge is on by default**
> with no opt-in step. It **digests the EPIC-016 notification feed** and sends through the **ADR-025
> `packages/email` seam** (SMTP → Mailhog in the POC). `source:` refs are read-only context; the brief stands
> alone. Composed by the Conductor from `.planning/EPIC-018` + its cited `REQ-*`/ADRs.
> **This slice does NOT close a roadmap phase** (EPIC-019..023 remain `planned`; EPIC-023 is the Phase-4
> closer) — **no** phase-walkthrough video obligation rides this PR.

## Scope

Add the **secondary email channel** whose only job is to draw a user back into the portal. Four capabilities,
built **on top of** the already-delivered EPIC-016 in-portal notification feed and the already-ratified
ADR-025 email transport seam:

1. **Content-free nudge (the security-sensitive property).** When a recipient has new in-portal activity, a
   fallback email is generated that conveys **only** that there is new activity in their portal **plus a means
   to sign in** — and **nothing more**. It carries **no** message content, document names/content, client or
   engagement identifying detail, or description of the specific event. Acting on the email **leads the
   recipient to sign in** to the portal to see the actual activity. The portal is the system of record; **email
   names that activity awaits, it never carries the content** (ADR-025 §3 / ADR-017).

2. **Daily digest cap (batching).** Email is **batched into a daily nudge**: the system sends **at most one**
   notification email per recipient per day and **never** a separate email per event. Multiple
   notification-worthy events for a recipient within a day are represented by **no more than that single**
   daily nudge.

3. **Accountant self-suppression.** The accountant — who lives in the portal all day — can **turn off her own**
   email notifications **entirely** via an `apps/admin` setting. While suppressed she receives **no**
   notification emails of any kind; her **in-portal feed is unaffected** (it still receives all her
   notifications); and her setting **does not change** whether **clients** receive their own emails.

4. **Client default-on.** For clients — who drop in occasionally and most need the nudge — the email fallback
   is **enabled by default**: a **newly created client account** has the nudge on with **no opt-in step**.

Built on **EPIC-016** (the `Notification` feed — the source of *what* awaits, RLS-scoped per recipient),
**ADR-025 / `packages/email`** (the `EmailProvider` port — SMTP → Mailhog locally/e2e, fail-closed,
header-injection-guarded, no-body-logging), and **EPIC-017** (whose new-message notifications are among the
events this digest summarizes). This slice **consumes** both seams; it does **not** rebuild the feed or the
email transport. Later Phase-4 slices (EPIC-019 reminders) reuse the same email seam.

## Out of scope

- **The in-portal feed, real-time delivery, the unread badge, per-viewer read-tracking** → **EPIC-016**
  (already delivered). This slice **consumes** the notifications the feed records and batches them into email;
  it does **not** re-build or alter the feed mechanism.
- **The email transport itself** — the `EmailProvider` port, its SMTP/Resend/mock bindings, the
  header-injection guard, the fail-closed selector → **already exist** (`packages/email`, ratified by ADR-025).
  This slice **calls** the port; it does **not** re-implement transport.
- **A client opt-out toggle** (whether a client can later turn their **own** email off) → **unscheduled**.
  REQ-MSG-011 Notes places that settings question in the **Identity & Settings** domain; this slice fixes
  **only** the **default-on** state. Do not build a client email-settings UI.
- **Real email transport / a production ESP** (Resend key, real SMTP credentials) → **Phase 5** (mock-first
  per ADR-023; the POC sends through **SMTP → Mailhog**). Do not wire a real ESP.
- **Per-event / immediate email** of any kind — email is **batched daily only** (REQ-MSG-009); there is no
  send-on-each-event path.
- **Richer email content** — embedding the message body, the document, intake answers, or any client/event
  detail in the email is **forbidden** by ADR-025 §3 / ADR-017, not merely out of scope.
- **Notification generation / new source events** (new-message, document-upload, status-change, etc.) →
  **EPIC-016/-017** own those; this slice only **digests** the notifications they already record.

## Acceptance criteria

Each AC is covered by automated test(s) **tagged with its AC id** at the prescribed tier (§ Methodology). An
AC is implemented only when its tagged test(s) **pass in CI**; the epic is delivered only when all **12** are
`verified` in `COVERAGE.md`.

### REQ-MSG-008 — Content-free fallback nudge
- **AC-MSG-008-01** — A fallback email notification conveys only that there is new activity in the recipient's portal, plus a means to sign in.
- **AC-MSG-008-02** — A fallback email contains no activity detail — no message content, no document names or content, no client or engagement identifying detail, and no description of the specific event.
- **AC-MSG-008-03** — Acting on the email leads the recipient to sign in to the portal to see the actual activity.

### REQ-MSG-009 — At most one email per day
- **AC-MSG-009-01** — A recipient receives at most one notification email per day.
- **AC-MSG-009-02** — The system does not send a separate email for each individual notification event.
- **AC-MSG-009-03** — When multiple notification-worthy events occur for a recipient within a day, they result in no more than one email nudge for that day (which, per REQ-MSG-008, still carries no activity detail).

### REQ-MSG-010 — Accountant may suppress email
- **AC-MSG-010-01** — The accountant can turn off her own email notifications entirely.
- **AC-MSG-010-02** — While suppressed, the accountant receives no notification emails of any kind.
- **AC-MSG-010-03** — Suppressing email does not affect the accountant's in-portal notification feed, which continues to receive all her notifications.
- **AC-MSG-010-04** — The accountant's email-suppression setting does not change whether clients receive their own email notifications.

### REQ-MSG-011 — Client email on by default
- **AC-MSG-011-01** — A newly created client account has the email fallback nudge enabled by default.
- **AC-MSG-011-02** — A client receives email notification nudges without any manual opt-in step.

## Methodology & quality requirements

- **Acceptance format: gherkin.** Bind the Given/When/Then scenarios in § Acceptance scenarios to executable
  tests (carried verbatim from the epic). Each test's title/annotation contains its **AC id** (the AC-id
  test-tag contract — what makes the Validate write-back possible).
- **Tier mapping (ADR-012 testing pyramid; per the epic's sign-off contract):**
  - **Service integration / security (tier 3)** — **AC-MSG-008-02** (content-free body, **hard**),
    **AC-MSG-009-01 / -02 / -03** (daily-cap batching), **AC-MSG-010-02 / -03 / -04** (suppression — three
    consequences), **AC-MSG-011-01** (default-on at account creation).
  - **e2e (tier 6)** — **AC-MSG-008-01 / -03** (nudge → sign-in, against the mail catcher), **AC-MSG-010-01**
    (suppression toggle), **AC-MSG-011-02** (client emailed without opt-in).
- **e2e required** (CLAUDE.md IO e2e defaults): this slice touches **email sending** — a default e2e trigger.
  E2E runs against the full docker-compose stack with the **mail catcher (Mailhog)** up; the nudge body,
  the daily cap, the suppression toggle, and client default-on are exercised against real delivered mail.
- **Hard extra gates** — see front-matter `extra_gates`: content-free body (**proven both ways** — the nudge
  text present **and** every seeded sensitive value absent), daily-cap batching (N events → exactly one mail),
  accountant suppression (**proven three ways** — no email / feed intact / clients unaffected), client
  default-on at creation, and the tier-6 nudge→sign-in / suppression-toggle / no-opt-in journeys against
  Mailhog.
- **UI demo (`demo.applicable: yes`)** — a `@demo` Playwright walkthrough captures an AC-tagged screenshot
  gallery into `docs/demos/EPIC-018/` across **both surfaces**, walking the **jane-accountant** journey (open
  her notification settings in `apps/admin`, **turn off her own email**, confirm the in-portal feed still
  shows her activity — AC-MSG-010-01/-03) and the **sarah-returning-client** journey (a content-free nudge
  arrives in the mail catcher, acting on it lands her at portal **sign-in** — AC-MSG-008-01/-03 — and the
  default-on, no-opt-in path — AC-MSG-011-02) along the **email-fallback branch of `flow-notification-feed`**.
  **Non-gating** (the e2e gate is the gate); see `.orchestration/DEMO-POLICY.md`.

## Constraints

Non-negotiables (cite the originating ADR/REQ in code/test comments per CS-GEN-003):

- **ADR-025 — Transactional email transport (content minimization).** Send **only** through the
  `EmailProvider` port (`packages/email`, via `getEmailProvider()`) — never an ESP SDK at the call site.
  Outbound email is **content-minimized to transactional + nudge content only**: the digest may name that
  **activity awaits** and link into the portal, but **must never** embed client tax data, document contents,
  intake answers, message-thread bodies, or any PII beyond the **recipient's own name + email**. The port's
  **header-injection guard** (throw on CR/LF in `to`/`subject`/`from`), **no-body-logging**, **fail-closed**,
  and **TLS-by-default** contracts hold. The POC binding is **SMTP → Mailhog** (`:1025`). **Hard tier-3
  content-free obligation; content-minimization is a sender obligation at the digest call site.**
- **ADR-023 — Provider seam, mock-first.** Email is consumed **behind the seam**; this slice verifies the
  **SMTP → Mailhog** realization (an emulator, satisfying the standing mock-first directive). The **real ESP
  binding is wired at deploy** (Phase 5) — **do not** wire Resend/real SMTP credentials here.
- **ADR-017 — Telemetry / data-handling (no-PII egress).** The **content-free** constraint is the same
  "no PII in a channel that leaves the trusted boundary" discipline as telemetry: the email body carries no
  client identifying detail; the digest composer/dispatcher **logs no** recipient activity detail, client
  identity, message/document content, or email bodies (CS-GEN-001). **Hard tier-3 obligation.**
- **ADR-006 — Monorepo, two apps.** The digest serves recipients of **both** surfaces (`apps/portal` clients
  and the `apps/admin` accountant). The **accountant suppression toggle is an `apps/admin` setting**; the
  **client default-on is set at client-account creation**. Apply recipient/email-preference patterns
  consistently (CS-TS-003).
- **ADR-012 — Testing pyramid.** Honor the tier mapping above; the **content-free body** and **daily-cap
  batching** are **hard tier-3** integration/security; the **suppression toggle** and **default-on** are
  **tier-6** e2e against the mail catcher.

## Code standards

- **CS-TS-001** (`required`) — request-scoped DB access only through the `packages/db` wrapper (ADR-003): the
  accountant suppression-toggle read/write and the client default-on read.
- **CS-TS-002** (`required`) — never import the raw `requestDb`/`adminDb` pools outside `packages/db`.
- **CS-TS-003** (`recommended`) — apply shared recipient/email-preference patterns consistently across both
  surfaces (the digest serves recipients of `apps/portal` and `apps/admin`).
- **CS-TS-004** (`experimental`) — the **suppress-own-email** server action resolves identity from the request
  cookie and guards role (**accountant-only**) before the preference write.
- **CS-GEN-001** (`recommended`) — no secrets or PII in logs: the digest composer/dispatcher logs **no**
  recipient activity detail, client identity, message/document content, or email bodies (ADR-025 §4; ADR-017).
- **CS-GEN-002** (`recommended`) — additive, non-destructive wiring: **consume** the existing EPIC-016
  `Notification` feed and the ADR-025 `packages/email` seam; do **not** rebuild the feed or the transport.
- **CS-GEN-003** (`recommended`) — cite the governing ADR/REQ in code & test comments.

## Data & Interface Contract

> Altitude-bounded: only the shapes that **trace** to the epic's behavior + cited ADRs. The IO expands these
> into the full field-level contract at Design; genuinely upstream shape questions are escalated via
> `OPEN-QUESTIONS.md`, never invented. Field-level minutiae (exact column types, the per-recipient last-sent
> representation, the digest window boundary [calendar day vs rolling 24h], the email subject/template copy,
> the dispatch trigger/scheduling mechanism) are **not** fixed here.

- **Email-preference (net-new, per recipient principal).** A per-recipient flag governing whether the
  **fallback email nudge** is sent to that principal. **Default: enabled for clients** (set at
  client-account creation; **no client opt-out path in scope**). The **accountant** can set hers to
  **suppressed**. State set: **enabled ↔ suppressed**; the only transition in scope is the **accountant's own
  toggle** (clients are default-on and not toggled here). This flag governs **only** email — it never affects
  the in-portal feed. *(traces: REQ-MSG-010, REQ-MSG-011; ADR-006)*
- **Daily-digest dispatch state (net-new).** A per-recipient record of **when a nudge was last sent**, used to
  enforce the **at-most-one-per-day** cap: once a recipient has been emailed for a day, no further email is
  sent that day regardless of additional events. The exact representation (a per-recipient **last-sent-date
  watermark** vs a per-(recipient, day) sent-row) is an **IO Design decision** bounded by this behavior.
  *(traces: REQ-MSG-009; ADR-025 §6)*
- **Content-free digest payload (the email body shape).** The generated email conveys **only**: that there is
  **new activity** in the recipient's portal **+ a sign-in link/affordance**. It carries **no** client or
  engagement identifying detail, message/document content, or per-event description. *(traces: REQ-MSG-008;
  ADR-025 §3, ADR-017)*
- **Interface contracts.**
  - *Daily digest dispatch (system / batch — not a request principal):* input = recipients who have
    **unread, emailable** in-portal activity in the window, are **email-enabled**, and have **not yet been
    emailed today**; effect = **at most one** content-free nudge per recipient, sent via the `EmailProvider`
    port; the daily cap and suppression are honored. The dispatch is **invokable under test** (time/window
    controllable) so the cap and content-free body can be asserted against the mail catcher; the production
    schedule is a deploy-time concern (ADR-023/ADR-025). *(traces: REQ-MSG-008 / -009; ADR-025)*
  - *Suppress own email (server action, `apps/admin` only):* input = the accountant; effect = her
    email-preference set to **suppressed** (or re-enabled); **role-guarded** (accountant-only) and run through
    the `packages/db` wrapper. Does **not** affect her feed or clients' email. *(traces: REQ-MSG-010;
    ADR-006, CS-TS-001/-004)*
  - *Client default-on (at client-account creation):* a **newly created client account** has the email nudge
    **enabled** with **no opt-in step**. *(traces: REQ-MSG-011; ADR-006)*
- **Field-shape obligations (ADR-002 conventions).** Any net-new table follows the project's PK /
  `DATETIMEOFFSET` / identity conventions.

## Acceptance scenarios

> Reproduced verbatim from `.planning/EPIC-018-email-digest-fallback.md` (the canonical behavior contract).
> Bind each to an executable test tagged with its AC id.

### AC-MSG-008-01 — Nudge conveys only "new activity" + sign-in
```gherkin
Given a recipient has new in-portal activity and email enabled
When a fallback email is generated for them
Then it conveys only that there is new activity and provides a means to sign in
```

### AC-MSG-008-02 — Nudge carries no activity detail
```gherkin
Given a fallback email is generated for a recipient
When its contents are inspected
Then it contains no message content, document names/content, client or engagement detail, or event description
```

### AC-MSG-008-03 — Acting on the email leads to sign-in
```gherkin
Given a recipient received a fallback email
When they act on it
Then they are led to sign in to the portal to see the actual activity
```

### AC-MSG-009-01 — At most one email per day
```gherkin
Given a recipient with email enabled
When the day's notifications are processed
Then they receive at most one notification email that day
```

### AC-MSG-009-02 — No per-event emails
```gherkin
Given several notification-worthy events occur for a recipient
When emails are sent
Then the system does not send a separate email for each event
```

### AC-MSG-009-03 — Multiple events yield one nudge
```gherkin
Given multiple notification-worthy events occur for a recipient within a day
When the daily digest is sent
Then no more than one email nudge results for that day
```

### AC-MSG-010-01 — Accountant turns off her own email
```gherkin
Given the accountant with email notifications enabled
When she turns off her own email notifications
Then her email notifications are disabled
```

### AC-MSG-010-02 — Suppressed accountant gets no email
```gherkin
Given the accountant has suppressed her email notifications
When notification-worthy events occur for her
Then she receives no notification emails of any kind
```

### AC-MSG-010-03 — Suppression leaves the feed intact
```gherkin
Given the accountant has suppressed her email notifications
When notification-worthy events occur for her
Then her in-portal notification feed still receives all her notifications
```

### AC-MSG-010-04 — Suppression does not affect clients
```gherkin
Given the accountant has suppressed her own email notifications
When client-affecting events occur
Then clients still receive their own email notifications per their settings
```

### AC-MSG-011-01 — New client account email-on by default
```gherkin
Given a newly created client account
When its email-nudge setting is examined
Then the email fallback nudge is enabled by default
```

### AC-MSG-011-02 — Client emailed without opting in
```gherkin
Given a newly created client with no setup performed
When a notification-worthy event occurs for them
Then they receive an email nudge without any manual opt-in step
```

## References

- Planning: `.planning/EPIC-018-email-digest-fallback.md` (the slice + behavior contract)
- Requirements: REQ-MSG-008 (content-free fallback nudge), REQ-MSG-009 (daily digest cap), REQ-MSG-010
  (accountant suppression), REQ-MSG-011 (client email default-on)
- Architecture: ADR-025 (transactional email transport + **content minimization** — the content-free gate;
  send through the `packages/email` port), ADR-023 (provider seam, mock-first — SMTP → Mailhog in the POC,
  real ESP → Phase 5), ADR-017 (telemetry/data-handling — the no-PII-egress discipline the content-free body
  mirrors; no PII in logs), ADR-006 (monorepo — digest serves both surfaces; suppression an admin setting,
  default-on at client creation), ADR-012 (testing tiers — content-free + daily-cap are hard tier-3)
- Personas: `.planning/personas/jane-accountant.md` (lives in the portal → suppresses her own email),
  `.planning/personas/sarah-returning-client.md`, `.planning/personas/martha-and-james-married-couple.md`
  (drop-in clients → rely on the nudge, default-on)
- Flows: `.planning/flows/flow-notification-feed.md` (the **email-fallback branch**); extends
  `.planning/flows/flow-message-exchange.md`
- Prior art: EPIC-016 (the `Notification` feed spine this slice **digests** — the source of *what* awaits,
  RLS-scoped per recipient), `packages/email` (the ADR-025 `EmailProvider` port + SMTP/Mailhog binding this
  slice **calls**), EPIC-017 (whose new-message notifications are among the digested events)

## Notes

- **Reuse, do not re-implement, the two seams.** The **notification feed** (EPIC-016 — records *what* awaits,
  per-recipient RLS, real-time, badge) and the **email transport** (`packages/email` — port + SMTP/Mailhog
  binding, header-injection guard, no-body-logging, fail-closed) **already exist**. This slice **consumes**
  both: it adds the **email-preference** (suppression / default-on), the **daily-digest dispatch** (the cap),
  and the **content-free digest composition** that maps unread notifications → a generic nudge. Wiring into
  the feed and the email seam is **additive** (CS-GEN-002).
- **The content-free guarantee is this slice's panel/SDET trap** (mirroring prior slices' isolation traps —
  EPIC-016's per-viewer-notification trap, EPIC-017's participant-isolation trap): the proof must be **two-
  sided** — assert the nudge text + sign-in affordance **are present** AND that **every** seeded sensitive
  value (client name, document name, message body, engagement detail, event description) is **absent** from
  the rendered subject and body. A test that only checks the nudge copy is present is **insufficient** and is
  a rejection. This is the security-sensitive property — it protects exactly the channel (email) the portal
  exists to replace.
- **The daily cap is the second hard gate.** Generate **multiple** events for a recipient in a day and assert
  **exactly one** email is delivered (mail-catcher count == 1) — never one per event — then show a second
  day's events yield exactly one further email. The cap is enforced on **dispatch state**, not by hoping
  events coincide.
- **Suppression is proven three ways** (REQ-MSG-010): a suppressed accountant gets **zero** emails
  (AC-MSG-010-02); her **in-portal feed is unchanged** — it still receives all her notifications
  (AC-MSG-010-03); and **clients are unaffected** — a client still receives their nudge while she is
  suppressed (AC-MSG-010-04). The three consequences are independent assertions.
- **Mock-first holds (ADR-023 / ADR-025).** The POC sends through **SMTP → Mailhog**; tests assert against the
  catcher. **Do not** wire a real ESP (Resend key / production SMTP) — that is the Phase-5 enablement step.
  Email is **not** in ADR-023's security-critical hard-gate set, but it is **real-before-prod**.
- **RLS is deliberately not in this slice's cited architecture.** Unlike the EPIC-016/-017 message/notification
  surfaces, EPIC-018 cites neither ADR-005 nor ADR-003 as a slice constraint: the suppression preference is
  the **accountant's own** single setting (admin) and the digest dispatch is a **system batch**, not a
  cross-principal request read. If **IO Design** introduces a request-principal-scoped preference table with a
  cross-principal read path (e.g. a future client-facing email-settings read), the project's standard RLS
  discipline (**CS-SQL-001 / CS-SQL-003**, ADR-005) applies to that table — but it is **not** imposed as a
  gate on this slice's contract. Flag any such shape as an OPEN-QUESTION rather than silently widening scope.
- **IO Design discretion (bounded):** the email-preference storage shape (a dedicated table vs a column on an
  existing user/account record), the per-recipient last-sent representation (watermark vs sent-row), the
  digest-window boundary (calendar day vs rolling 24h), the dispatch trigger/scheduling mechanism (a
  test-invokable batch in the POC), and the email subject/template copy are **IO Design decisions** bounded by
  the contract above — do not over-build. The **content-free body** (proven both ways), the **daily cap**, the
  **accountant suppression** (proven three ways), and the **client default-on** are **non-negotiable**.
- **Cross-surface scope (CLAUDE.md § Platform-frontend scope).** The digest serves recipients of **both**
  surfaces; the suppression toggle is an `apps/admin` affordance and the default-on is set at client creation
  (`apps/portal` accounts). Audits/e2e default to both surfaces where a recipient path spans them.
- **Build order:** EPIC-018 is the **third** Phase-4 epic, built on the EPIC-016 spine and the ADR-025 email
  seam, digesting the notifications EPIC-016/-017 emit. EPIC-019 (overdue detection & reminders) reuses the
  same email seam. This slice does **not** close Phase 4 (EPIC-023 is the closer) — **no** phase-walkthrough
  video rides this PR.
