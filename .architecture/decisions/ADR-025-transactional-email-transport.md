---
id: ADR-025
title: Transactional email via a provider seam with content minimization
status: Accepted
date: 2026-06-17
deciders: [SA, user]
related: [ADR-023, ADR-017, ADR-022, ADR-006, REQ-NFR-008, REQ-DOOR-007, REQ-DOOR-008, REQ-MSG-008, REQ-MSG-009]
source:
  - seed/tech-stack.md#decided-stack
  - .requirements/REQ-NFR-008.md
  - packages/email/src/port.ts
  - packages/email/src/select.ts
  - packages/email/src/bindings/smtp.ts
open_decisions: []
---

# ADR-025: Transactional email via a provider seam with content minimization

**Status:** Accepted
**Date:** 2026-06-17
**Deciders:** SA (with user direction)
**Related:** ADR-023 (provider-seam & mock-first strategy), ADR-017 (telemetry data-handling — no-PII egress posture), ADR-022 (anti-abuse rate limiting), ADR-006 (monorepo); REQ-NFR-008 (reliable transactional email), REQ-DOOR-007 (acceptance invitation email), REQ-DOOR-008 (decline-reason email), REQ-MSG-008 (email fallback nudge), REQ-MSG-009 (daily digest cap)

## Context

Email is the portal's **fallback nudge and invitation channel** (REQ-NFR-008): the acceptance invitation to
an account-less prospect (REQ-DOOR-007), the decline reason to an account-less prospect (REQ-DOOR-008), and
digest nudges that something awaits in the portal (REQ-MSG-008 / REQ-MSG-009). REQ-NFR-008 requires
**reliable transactional delivery** and is explicit that the property is "dependable outbound email, **not
any particular sending provider**."

Two things shape the decision:

- **The seam already exists in code, pending this ADR.** `packages/email` is built as an ADR-023 instance:
  `port.ts` (`EmailProvider.send` + `fromAddress`, a CRLF header-injection guard that **throws**, and a
  "MUST NOT log full bodies" contract), `bindings/{smtp,resend,mock}.ts`, and a `select.ts` keyed on
  `EMAIL_PROVIDER`, **fail-closed** (unknown value throws; `resend` without `RESEND_API_KEY` throws; no
  silent fallback). It was implemented under "OQ-002" with a note that the architecture agent ratifies the
  transport ADR — this is that ADR. `seed/tech-stack.md` records that **"Resend as primary email path" was
  superseded** by a digest-only, provider-agnostic intent.
- **Email egresses the RLS trust boundary.** This portal holds SSNs, tax documents, financial data, intake
  answers, and message bodies. ADR-017 already ratified a **no-PII egress** posture for telemetry; email is
  another egress channel and needs the same content discipline. **What email may carry is a data-handling
  matter** — put to the user this run, who ratified **transactional + nudge content only, no client tax
  data/PII.**

## Decision

**We will deliver outbound email through the `EmailProvider` port (an ADR-023 seam instance) — a
provider-agnostic transactional capability with SMTP and Resend bindings plus a mock, selected fail-closed
by `EMAIL_PROVIDER` — and outbound email is content-minimized to transactional + nudge content only, never
client tax data or PII.**

### 1. The seam (ratifies `packages/email`)

`EmailProvider` is the port; bindings are **smtp** (nodemailer; the local/e2e default, pointed at the
Mailhog catcher on `:1025`), **resend** (a deferred production drop-in that throws without `RESEND_API_KEY`),
and **mock** (in-memory, unit tests). `select.ts` picks exactly one via `EMAIL_PROVIDER`, **fail-closed** —
an unknown value or a `resend` selection without its key throws at startup/selection; it never silently
falls back. App code depends only on the port (via `getEmailProvider()`), never on a binding.

### 2. Production transport is provider-agnostic (REQ-NFR-008)

The production binding is **any reliable SMTP / transactional email provider**; **Resend is a pre-built
candidate drop-in, not a mandate.** The deploy chooses the binding. This supersedes the original "Resend as
primary" intent (already recorded as superseded in `seed/tech-stack.md`) in favor of the provider-agnostic
property REQ-NFR-008 actually requires.

### 3. Content policy (user-ratified data-handling — the trust-boundary rule)

Outbound email may carry **only**: the **acceptance invitation link** (REQ-DOOR-007), the **accountant-
authored decline reason** (REQ-DOOR-008), and **digest nudges that name *that* activity awaits** (the
engagement / notification type) and link into the portal (REQ-MSG-008/009). Outbound email **must never**
embed client tax data, document contents, intake/questionnaire answers, message-thread bodies, SSNs/
financial data, or any PII beyond the **recipient's own name + email address**. The portal is the system of
record; **email names what awaits, it does not carry the content.** This is the email analogue of ADR-017's
no-PII egress posture; content-minimization is a **sender obligation at every call site**.

### 4. Security contract (codifies the implemented port + ADR-023)

- **Header-injection guard:** `to`, `subject`, and `from` are checked for CR/LF and the send is **refused
  (throw, not strip)** on detection — a CRLF is an injection attempt (OWASP email header injection).
- **No body logging:** implementations must not log full message bodies (PII risk).
- **Fail-closed transport:** a misconfigured/failing transport throws rather than silently swallowing.
- **TLS by default:** the SMTP binding uses TLS to its host; insecure transport is allowed **only** via an
  explicit `ALLOW_INSECURE_SMTP` opt-in for the local Mailhog catcher (a non-production convenience).
- **Rate-limited:** outbound send is rate-limited against abuse (ADR-022), consistent with the invitation/
  decline send paths.

### 5. Mock-first + enablement (ADR-023)

Local dev and e2e use the **SMTP binding → Mailhog** (an emulator — satisfies "mock as long as possible"
without a real ESP); unit tests use the **mock** binding. The **real production ESP binding** (SMTP
credentials, or a Resend key) is wired at deploy time — the email **enablement** step. Email is **not** in
ADR-023's security-critical hard-gate set (a mocked/emulated email channel is not a trust hazard the way a
mocked auth or scanner is), but it remains **real-before-prod** per ADR-023 §3: Mailhog is non-production
only, and a deployed environment sends through a real ESP.

### 6. Reliability (REQ-NFR-008)

Delivery reliability is a property of the chosen ESP plus the **daily-digest cap** (REQ-MSG-009) that bounds
volume; the binding **surfaces** send failures (fail-closed) rather than hiding them. Retry/queue semantics
are a binding-level concern, not part of the port contract.

## Consequences

- **The OQ-002 email-transport seam is ratified** — `packages/email` is conformant as built; this ADR
  documents and blesses it (no code change required to comply).
- **Content-minimization is an ongoing sender obligation** on every email call site (invitation, decline,
  digest) and is reviewable: an email that would embed tax data, document contents, questionnaire answers,
  or message bodies is a **violation** of this ADR — reject it in review.
- **The real ESP binding is wired at deploy** (real-before-prod, ADR-023 §3); Mailhog is non-production
  only. Choosing the ESP is a deploy-time decision, not an app-code change.
- **The Phase-4 digest composer is constrained:** it must summarize *what* awaits (engagement / notification
  type + a portal link) **without** the underlying content — a design constraint on the notification feed
  (REQ-MSG-008/009).
- **Swapping ESPs is a binding change behind the port**, not a call-site change. The Resend stub stays as
  the candidate drop-in.
- **`seed/tech-stack.md` is now stale** in its governing-ADR column for the Email row (`—`); since `seed/`
  is read-only to this agent, the row should be updated to cite ADR-025 by its owner (flagged in the run
  summary).

## Alternatives considered

- **Mandate Resend as the provider.** Rejected: REQ-NFR-008 is explicitly provider-agnostic; the deploy may
  prefer plain SMTP or another ESP. The port keeps it open; Resend is a convenience drop-in, not the
  decision.
- **Allow richer email content** (embed the message body, the document, or intake answers in the email).
  Rejected — user-ratified: tax data / PII must not egress the trust boundary by email. The portal is the
  system of record; email is a nudge that links back in.
- **No port — send via an ESP SDK at each call site.** Rejected per ADR-023: forecloses mock-first/Mailhog
  sequencing and the clean ESP swap, and scatters the header-injection / no-log / fail-closed contract.
- **Strip (not throw) on header injection.** Rejected: a CR/LF in `to`/`subject` is an injection attempt;
  the correct response is to refuse the send, matching the implemented contract and caller expectations.
