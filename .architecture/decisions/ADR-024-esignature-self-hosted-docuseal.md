---
id: ADR-024
title: E-signature via self-hosted Docuseal behind an e-sign provider seam
status: Accepted
date: 2026-06-17
deciders: [SA, user]
related: [ADR-023, ADR-019, ADR-008, ADR-009, ADR-020, ADR-007, ADR-006, REQ-NFR-007, REQ-ONBD-002, REQ-IDNT-007, REQ-DASH-013]
source:
  - seed/tech-stack.md#decided-stack
  - .requirements/REQ-NFR-007.md
  - .requirements/REQ-ONBD-002.md
  - docker-compose.yml
open_decisions: []
---

# ADR-024: E-signature via self-hosted Docuseal behind an e-sign provider seam

**Status:** Accepted
**Date:** 2026-06-17
**Deciders:** SA (with user direction)
**Related:** ADR-023 (provider-seam & mock-first strategy), ADR-019 (audit trail), ADR-008 (object-storage abstraction), ADR-009 (signed-URL file access), ADR-020 (encryption / key custody), ADR-007 (deploy-agnostic container packaging), ADR-006 (monorepo); REQ-NFR-007 (verified e-signature + completion confirmation), REQ-ONBD-002 (engagement-letter e-sign hard gate), REQ-IDNT-007 (default letter template), REQ-DASH-013 (letter-template management)

## Context

Onboarding's hard gate (REQ-ONBD-002) requires the client to **e-sign the engagement letter** before any
other onboarding step opens, and REQ-NFR-007 requires that the signature is performed through an
electronic-signature capability that returns a **trustworthy completion confirmation** — onboarding may
advance only once the letter is *genuinely* signed. The letter's content is the accountant's edited
template (REQ-IDNT-007 / REQ-DASH-013). The signature is the **legal basis of the engagement**, so the
mechanism that recognizes "signed" must be reliable and tamper-resistant.

Constraints already in place:

- **REQ-NFR-007 / OQ-005 (resolved 2026-06-13)** scoped the requirement to the *capability* only and
  **deferred the self-hosted-vs-cloud hosting model to an implementation ADR** (this one). It also noted a
  latent driver: "signed documents must stay under the firm's control" would favor self-hosting.
- **`seed/tech-stack.md`** already names **Docuseal (self-hosted)** as the decided e-signature choice, and
  `docker-compose.yml` runs a Docuseal container plus its own Postgres locally (internal to Docuseal, not
  the app DB).
- **ADR-023** requires every external integration to sit behind a port + bindings + fail-closed selector,
  to be **mock-first** (built and shipped against a mock until a deferred enablement slice wires the real
  provider), confined to **non-production**, with the real binding **mandatory before production** — and
  **e-signature validity is named a security-critical, fail-closed pre-deploy gate.**

This ADR records the e-sign *mechanism*: the provider, the hosting model, how completion is trusted, and
how the seam follows ADR-023.

## Decision

**We will provide e-signature through an `ESignatureProvider` port (an ADR-023 seam instance) whose
production binding is self-hosted Docuseal; the engagement letter is recognized as signed only on a
provider-verified, idempotent completion signal (with a reconciliation fallback), and the signed-letter
evidence is recorded against the engagement and audited.**

### 1. The seam (ADR-023 instance)

E-signature lives in its own module/package shaped per ADR-023: a `port.ts` (`ESignatureProvider` — create
a signature request for a letter + signer, and verify/recognize completion), `bindings/docuseal.ts` (real),
`bindings/mock.ts` (deterministic fake), and a `select.ts` keyed on `ESIGN_PROVIDER`, **fail-closed** —
defaults to the real binding, with the mock selectable only via an explicit non-production
`ALLOW_MOCK_ESIGN` opt-in that cannot be true in a production configuration. The onboarding code depends on
the port, never on Docuseal directly.

### 2. Production binding — self-hosted Docuseal

The real binding is **Docuseal, self-hosted** (its own container + its own Postgres per ADR-007 packaging;
that Postgres is internal to Docuseal and is **not** the application SQL Server). Self-hosting is chosen
over a cloud e-sign SaaS because the **signed legal documents and signer PII stay inside the firm's trust
boundary** (the latent REQ-NFR-007/OQ-005 driver), there is **no per-signature SaaS cost**, and it fits the
deploy-portable posture (ADR-007/ADR-013). The port keeps a later swap to a hosted SaaS clean if a driver
emerges.

### 3. Trusted completion (REQ-NFR-007 — the load-bearing part)

The letter is recognized as signed **only** on a **provider-verified completion signal** from Docuseal — an
authenticated/verified callback (webhook) — never on a client-side "I signed" claim (the client is outside
the trust boundary, ADR-005). Completion handling is:

- **Verified:** the callback's authenticity is checked (signed/secret-bearing) before it is trusted.
- **Idempotent:** a replayed or duplicated callback applies the gate **exactly once**; re-delivery never
  double-applies or re-opens.
- **Backstopped by reconciliation:** because webhooks can be lost, a reconciliation path (poll/verify the
  signature status with Docuseal) backstops a missing callback so a genuinely-signed letter is eventually
  recognized without the gate hanging.

### 4. Evidence + audit + storage

On verified completion, the **signed document / signature evidence is recorded against the engagement**
(REQ-ONBD-002-04), and the signing is an **audited, security-significant event** (ADR-019, fail-closed
audit write). The signed document is stored under the same **encrypted-at-rest, non-public, signed-URL**
regime as other engagement files (ADR-008 / ADR-009 / ADR-020).

### 5. Mock-first sequencing + enablement gate (ADR-023)

The onboarding spine slice ships against the **mock e-sign binding** (a deterministic "signed" outcome):
REQ-ONBD-002 / REQ-NFR-007 AC are delivered and **verified against the mock**. The **real Docuseal
enablement** — the Docuseal binding, verified+idempotent callback handling, and the reconciliation fallback
— is a **deferred enablement slice** that re-validates those AC against the live, self-hosted provider.
Per ADR-023 §5, running a **mock e-sign in production is a fail-closed pre-deploy gate**: no onboarding that
e-signs via the mock ships to production.

### 6. Template boundary

The content presented for signature is the accountant's edited engagement-letter template (REQ-IDNT-007 /
REQ-DASH-013). Authoring/editing the template is **not** the e-sign provider's concern; the provider renders
and captures a signature over whatever letter content the app supplies.

## Consequences

- **EPIC-005 (onboarding spine + letter gate) is unblocked** behind the mock — no Docuseal wiring is
  required to build and verify the gate now.
- **Obligations taken on:** a callback endpoint that verifies authenticity, is idempotent, and has a
  reconciliation fallback; signed documents stored encrypted + non-public; the signing audited; the
  Docuseal container + its Postgres reflected in the DevOps inventory/runbook (CLAUDE.md § DevOps).
- **Self-hosting cost:** the firm runs and updates Docuseal (prototype-stage today — upgrade/operational
  risk). A move to a hosted e-sign SaaS is a clean binding swap behind the port if cost/control drivers
  change.
- **Real-Docuseal enablement is release-gating** for any onboarding exercised in production (ADR-023 §5).
- **Out-of-scope product question flagged:** the onboarding flow's lost-webhook branch (B3) imagines an
  accountant **manual "mark as signed" override** of the gate. Overriding a legal-signature gate is a
  product/WHAT decision REQ-ONBD-002 does not define — flagged for the requirements layer, **not**
  architected here. The reconciliation fallback (§3) is the architectural answer to a lost webhook;
  a human override is a separate policy call.

## Alternatives considered

- **A cloud e-sign SaaS (DocuSign / Dropbox Sign / HelloSign).** Rejected for v1: per-signature cost, and —
  decisively — the signed legal documents and signer PII would leave the firm's trust boundary. Self-hosted
  Docuseal keeps them in-boundary; the port preserves the option to swap later.
- **Trust a client-side completion callback (no provider verification).** Rejected: the signature is the
  legal basis of the engagement; only a provider-verified, idempotent signal may flip the gate
  (REQ-NFR-007, ADR-005 trust boundary).
- **No port — call the Docuseal API directly in onboarding code.** Rejected per ADR-023: it forecloses the
  mock-first sequencing and the clean provider swap, and scatters trust-boundary handling across call sites.
- **Recognize completion by polling only (no webhook).** Rejected as the primary path: polling alone is
  slow and wasteful; the verified webhook is primary, with polling as the reconciliation backstop.
