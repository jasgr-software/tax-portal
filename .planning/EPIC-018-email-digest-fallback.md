---
id: EPIC-018
title: Email digest fallback — content-free nudge, daily cap, accountant suppression
phase: 4
status: planned
slice: Users who are away from the portal get a content-free email nudge that there is new activity and a way to sign in — never any client/document/message detail — batched to at most one per recipient per day; the accountant can suppress her own email entirely, and clients have the nudge on by default.
requirements:
  - REQ-MSG-008: [AC-MSG-008-01, AC-MSG-008-02, AC-MSG-008-03]
  - REQ-MSG-009: [AC-MSG-009-01, AC-MSG-009-02, AC-MSG-009-03]
  - REQ-MSG-010: [AC-MSG-010-01, AC-MSG-010-02, AC-MSG-010-03, AC-MSG-010-04]
  - REQ-MSG-011: [AC-MSG-011-01, AC-MSG-011-02]
architecture:
  - ADR-025   # transactional email transport — the digest is sent through the email transport seam
  - ADR-023   # provider seam — email is mocked (Mailhog) in the POC; real transport → Phase 5
  - ADR-017   # telemetry/data-handling — the content-free constraint: no PII/activity detail leaves the portal
  - ADR-006   # monorepo — the digest serves recipients of both apps; suppression is an apps/admin setting
  - ADR-012   # testing pyramid — content-free + daily-cap are hard tier-3 gates
depends_on: [EPIC-016]
source:
  - .requirements/REQ-MSG-008.md
  - .requirements/REQ-MSG-009.md
  - .requirements/REQ-MSG-010.md
  - .requirements/REQ-MSG-011.md
  - .architecture/decisions/ADR-025-transactional-email-transport.md
  - .architecture/decisions/ADR-017-telemetry-data-handling-policy.md
open_questions: []
---

# EPIC-018 — Email digest fallback — content-free nudge, daily cap, accountant suppression

> A **preparation document**, not build instructions. It states what this slice delivers, which
> acceptance criteria it owns, which architecture it must adhere to, and the test contract sign-off
> requires — not how to build it.

## Vertical slice
This slice adds the **secondary email channel** whose only job is to draw a user back to the portal. When a
recipient has new in-portal activity, the system sends a **content-free** email nudge — it says only that
there is new activity and gives a way to sign in, and carries **no** client names, document or message
content, engagement detail, or description of the event. Emails are **batched into a daily digest**: at most
one email per recipient per day, never one per event. The **accountant can suppress her own** email entirely
(her in-portal feed is unaffected, and her setting does not change whether clients are emailed); for
**clients the nudge is on by default** with no opt-in step. The email content-free guarantee is the
security-sensitive property — it protects exactly the channel the portal exists to replace.

## Requirements delivered

- **REQ-MSG-008 — Content-free fallback nudge**
  - **AC-MSG-008-01** — a fallback email conveys only that there is new activity, plus a means to sign in.
  - **AC-MSG-008-02** — it contains no activity detail — no message content, document names/content, client/engagement identifying detail, or event description.
  - **AC-MSG-008-03** — acting on the email leads the recipient to sign in to see the actual activity.
- **REQ-MSG-009 — At most one email per day**
  - **AC-MSG-009-01** — a recipient receives at most one notification email per day.
  - **AC-MSG-009-02** — the system does not send a separate email per individual event.
  - **AC-MSG-009-03** — multiple events in a day yield no more than one nudge for that day.
- **REQ-MSG-010 — Accountant may suppress email**
  - **AC-MSG-010-01** — the accountant can turn off her own email notifications entirely.
  - **AC-MSG-010-02** — while suppressed, she receives no notification emails of any kind.
  - **AC-MSG-010-03** — suppression does not affect her in-portal feed, which still receives all her notifications.
  - **AC-MSG-010-04** — her suppression setting does not change whether clients receive their own emails.
- **REQ-MSG-011 — Client email on by default**
  - **AC-MSG-011-01** — a newly created client account has the email fallback nudge enabled by default.
  - **AC-MSG-011-02** — a client receives email nudges without any manual opt-in step.

## Architecture adherence
- **ADR-025 — Transactional email transport.** The digest is sent through the email transport seam; the
  POC realizes it against Mailhog.
- **ADR-023 — Provider seam, mock-first.** Email is consumed behind the mockable seam; this slice verifies
  the mock realization (real transport re-validation → Phase 5).
- **ADR-017 — Telemetry / data-handling policy.** The **content-free** constraint (AC-MSG-008-02) is the
  same "no PII in a channel that leaves the trusted boundary" discipline; the email body carries no client
  identifying detail. This is a **hard** tier-3 gate.
- **ADR-006 — Monorepo, two apps.** The digest serves recipients of both surfaces; the accountant
  suppression toggle is an `apps/admin` setting, the client default-on is set at client-account creation.
- **ADR-012 — Testing pyramid.** Content-free body and daily-cap batching are hard tier-3 gates; the
  suppression toggle and default-on are tier-6 e2e against the mail catcher.

## Acceptance scenarios

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

## Traceability & sign-off contract
- Each in-scope AC must be covered by **automated test(s) tagged with its AC id** (the test
  title/annotation contains the `AC-MSG-008-NN` / `-009-NN` / `-010-NN` / `-011-NN` id), at the prescribed tier(s).
- An AC is **implemented** only when its tagged test(s) **pass in CI**.
- This epic is **delivered** only when **all** its in-scope AC are `verified` in `COVERAGE.md`.
- Suggested tier mapping (per ADR-012):
  - **service integration / security (tier 3)** — AC-MSG-008-02 (content-free body, hard),
    AC-MSG-009-01/-02/-03 (daily-cap batching), AC-MSG-010-02/-03/-04, AC-MSG-011-01.
  - **e2e (tier 6)** — AC-MSG-008-01/-03 (nudge → sign-in, against the mail catcher), AC-MSG-010-01
    (suppression toggle), AC-MSG-011-02.

## Out of scope
- **The in-portal feed, real-time delivery, badge** → **EPIC-016**. This slice consumes the notifications
  the feed already records and batches them into email.
- **Whether a client can later turn their own email off** — REQ-MSG-011 Notes places that settings question
  in the Identity & Settings domain; this slice fixes only the **default-on** state. Any client email
  opt-out toggle is **unscheduled** (not a v1 orphan unless a requirement mints it).
- **Real email transport** → **Phase 5** (mock-first per ADR-023; Mailhog in the POC).

## Links
- Requirements: REQ-MSG-008, REQ-MSG-009, REQ-MSG-010, REQ-MSG-011
- Architecture: ADR-006, ADR-012, ADR-017, ADR-023, ADR-025
- Personas: `personas/jane-accountant.md` (lives in the portal → suppresses email), `personas/sarah-returning-client.md`, `personas/martha-and-james-married-couple.md` (drop-in clients → rely on the nudge)
- Flows: `flows/flow-notification-feed.md` (the email-fallback branch); extends `flows/flow-message-exchange.md`
- Epics: depends on EPIC-016 (notifications to digest)
- Open questions: none
