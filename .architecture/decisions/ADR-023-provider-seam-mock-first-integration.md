---
id: ADR-023
title: Provider-seam & mock-first external-integration strategy
status: Accepted
date: 2026-06-17
deciders: [SA, user]
related: [ADR-001, ADR-007, ADR-008, ADR-009, ADR-011, ADR-012, ADR-020, ADR-021, ADR-022, ADR-024, ADR-025, REQ-NFR-009, REQ-ONBD-002]
source:
  - seed/intake.md
  - seed/tech-stack.md#decided-stack
  - packages/auth/src/port.ts
  - packages/auth/src/select.ts
  - packages/auth/src/bindings/mock.ts
  - packages/email/src/select.ts
open_decisions: []
---

# ADR-023: Provider-seam & mock-first external-integration strategy

**Status:** Accepted
**Date:** 2026-06-17
**Deciders:** SA (with user direction)
**Related:** ADR-001 (Clerk auth), ADR-007 (deploy-agnostic packaging), ADR-008 (object-storage abstraction), ADR-009 (signed-URL file access), ADR-011 (repository interface test seam), ADR-012 (testing pyramid), ADR-020 (KeyProvider / key custody), ADR-021 (file-upload safety / malware scan), ADR-022 (anti-abuse rate limiting); REQ-NFR-009 (malware scan), REQ-ONBD-002 (engagement-letter e-sign)

## Context

The portal depends on several **external integrations** — hosted auth (Clerk, ADR-001), object storage
(Azure Blob / Azurite, ADR-008), transactional email (Resend / SMTP), e-signature (Docuseal), malware
scanning (ADR-021 / REQ-NFR-009), and encryption-key custody (ADR-020). The production host is **deferred**
(ADR-007), so none of these is wired to a real cloud provider yet, and local dev runs against emulators
(Azurite, Mailhog) or in-process fakes.

Three forces converge:

1. **A convention already exists in code with no ADR governing it.** `packages/auth` and `packages/email`
   are both built as a **port + bindings + selector**: `src/port.ts` (a narrow interface), `src/bindings/`
   (a real adapter — `clerk.ts`, `resend.ts`/`smtp.ts` — plus a `mock.ts`), and `src/select.ts` (chooses
   the binding from environment configuration). ADR-008 (storage abstraction), ADR-020 (`KeyProvider`), and
   ADR-011 (repository interface seam) are the same shape applied to other boundaries. This is a real,
   load-bearing, cross-file convention that no decision record explains — exactly the kind of undocumented
   decision that drifts. It already drifted once: BUG-002-001 was an auth selector that **failed open**
   (mock auth reachable when it should not have been), fixed to fail closed on an explicit
   `ALLOW_MOCK_AUTH` opt-in.

2. **A standing user directive (2026-06-17): mock as long as possible.** The user directed that every
   third-party integration be built behind its seam and **kept mocked/stubbed as long as possible**, with
   real SaaS wiring deferred. The precedent is already set: EPIC-004 shipped against a **mocked Clerk**
   binding (real provider + 2FA deferred to a later "enablement" slice); `packages/email` runs SMTP→Mailhog
   with Resend deferred. Real wiring adds cost, secret-management burden, availability/flakiness, and
   prototype-stage instability (Docuseal) that stalls slices — and the portal's behavior can be proven
   end-to-end against the seam without any of it.

3. **The trust boundary constrains where a mock may run.** Several of these integrations are
   security-critical: a mocked auth provider does not authenticate, a mocked malware scanner does not scan,
   a mocked e-sign does not produce a legally meaningful signature, and a mocked `KeyProvider` does not
   protect keys. "Mock as long as possible" governs *development sequencing*; it must not become "ship a
   mock to production." Where a mock is **allowed to run** is a trust-boundary decision and an escalation
   carve-out — it was put to the user, who chose **non-production only, with the real binding mandatory
   before production and security-critical integrations as hard, fail-closed pre-deploy gates.**

This ADR generalizes the existing convention into a single cross-cutting strategy and records the
mock-first posture and its guardrail. It governs the **pattern**; it does not substitute for the
per-provider decision records (e-sign and email still lack their own ADRs — see Consequences).

## Decision

**We will express every external integration as a runtime-selected provider seam, default to its mock
binding for as long as a slice allows, and confine mock bindings to non-production — with the real binding
mandatory before that integration is exercised in production and security-critical integrations enforced
as fail-closed pre-deploy gates.**

Concretely, six parts:

### 1. The seam shape (codifies the existing convention)

Every external integration lives in its own `packages/<integration>` (or a clearly-bounded module) shaped
as:

- **`port.ts`** — a narrow TypeScript interface naming only the operations the app needs (not the
  provider's full surface). This is the seam.
- **`bindings/<real>.ts`** — the production adapter (`clerk.ts`, `resend.ts`, a Docuseal adapter, a
  scanner adapter, the storage adapter, `KeyProvider`'s real impl).
- **`bindings/mock.ts`** — a deterministic in-process fake (or, where one exists, a local emulator stands
  in: Azurite for Blob, Mailhog for SMTP).
- **`select.ts`** — chooses the binding from **explicit environment configuration**, fail-closed (§4).

No DI container — the selector and explicit construction are sufficient, consistent with ADR-011 §4 (DI
containers are rejected for the swap mechanism).

### 2. Mock-first sequencing

A slice **may ship against the mock binding**. The acceptance criteria whose behavior runs through the
integration are **delivered and verified against the mock** — the behavior contract is written
provider-agnostically (assert *that* the outcome happens at the port, not *how* the provider produces it).
The matching **real-provider wiring is a separately-tracked, deferred "enablement" slice** (the planning
layer owns that slice; coverage records the mock basis and the re-validation follow-up — the EPIC-004
mocked-auth → "2FA enablement" pattern, now the general rule).

### 3. Environment guardrail (trust boundary — user-decided)

Mock bindings run in **non-production only**: local development and the CI/test pipeline. The **real
binding must be wired and verified before the integration's capability is exercised in production (or any
production-like, internet-reachable deployment)**. "As long as possible" therefore means: through the
deploy-deferred period (ADR-007) and until each integration's first real-environment exercise — not into a
deployed environment that real users or real data touch.

### 4. Fail-closed selection

The selector **defaults to the real binding and fails closed.** A mock binding is selectable **only** when
an explicit, environment-scoped opt-in flag is set (`ALLOW_MOCK_<INTEGRATION>` — e.g. the existing
`ALLOW_MOCK_AUTH`). Absent the flag the selector binds the real adapter or throws; it **never silently
falls back to a mock.** The opt-in flag must be **impossible to set true in a production configuration**
(enforced at deploy-config validation, not by convention). This is the generalization of the BUG-002-001
fix.

### 5. Security-critical integrations are hard pre-deploy gates

For **auth (ADR-001), malware scanning (ADR-021 / REQ-NFR-009), e-signature validity (REQ-ONBD-002), and
encryption-key custody (ADR-020)**, running the mock binding in production is **rejected by a fail-closed
deploy gate** (implemented in the deploy pipeline once ADR-007's host is chosen; until then, enforced by
the §4 config-validation rule). A build that would authenticate, scan, e-sign, or hold keys via a mock in
production does not ship. The real binding for each is a **release-gating item**.

### 6. Mocks are behavior-faithful, not security-faithful

A mock must be **deterministic and faithful to the port's *behavior*** (same shapes, same success/failure
outcomes the real provider yields at the seam) so that mock-bound tests are meaningful. But a mock
**proves wiring, not the provider's security property** — a mock scanner returning "clean" shows the upload
path handles a clean verdict, not that any scanning occurred; a mock auth identity is not an authenticated
principal. This is the same load-bearing distinction ADR-011 §5 draws for the repository seam vs. RLS: the
mock tier proves logic on encoded assumptions; the real binding (re-validated in the enablement slice)
proves the security property. A green mock-bound suite must never be read as evidence the real integration
is safe.

## Consequences

- **Slices unblock without real SaaS.** Onboarding's e-sign (EPIC-005) and the malware scanner (EPIC-007)
  ship against mocks now; cost, secrets, availability, and Docuseal's prototype instability are deferred.
  No missing third-party ADR blocks a slice.
- **The "deferred real-provider enablement slice" is now a first-class, trackable unit** — one per
  integration (real auth + 2FA; real Docuseal; real scanner; real email transport; CMK if ever required).
  Each must precede that integration's production exercise. Planning tracks them; this ADR makes them
  obligatory, not optional.
- **Every integration carries two bindings + a fail-closed selector** — a real maintenance cost, and a
  drift risk (a mock can diverge from real provider behavior). Mitigation: a **port contract test** that
  both bindings satisfy, plus mandatory re-validation when the real binding is enabled.
- **The deploy pipeline owes a no-mock-in-production gate** for the security-critical set (§5), fail-closed,
  added when the ADR-007 host is chosen. Until then the §4 deploy-config validation is the enforcement.
- **Mock-delivered AC are legitimately `verified` for their slice** but carry a tracked real-provider
  re-validation follow-up; coverage notes the mock basis (parallels EPIC-004's deferred 2FA AC).
- **This ADR governs the pattern, not the provider choices.** The per-provider decision records live
  separately: **e-signature** is now **ADR-024** (self-hosted Docuseal) and **email transport** is now
  **ADR-025** (provider-agnostic seam + content minimization) — both authored 2026-06-17 as instances of
  this pattern. (When this ADR was first written those two were `—` in `seed/tech-stack.md`'s governing-ADR
  column and flagged as gaps; the gaps are now closed.) Auth (ADR-001), storage (ADR-008), and key custody
  (ADR-020) remain the authorities for their boundaries.
- **Existing ADRs are instances of this pattern, not superseded:** ADR-001, ADR-008, ADR-011, ADR-020 each
  remain the authority for their boundary; ADR-023 names the shared shape and the cross-cutting mock-first
  guardrail they all now follow.

## Alternatives considered

- **Wire real providers from the start.** Rejected: cost, secret-management, availability/flakiness, and
  Docuseal's prototype instability stall slices, with no value in proving the portal against real SaaS this
  early. The seam makes the real provider a clean later swap.
- **Allow mocks to persist in a deployed (non-prod) staging environment, per-integration allowlist.**
  Considered and **put to the user**; rejected in favor of non-prod-only. A deployed, reachable environment
  that authenticates, scans, or e-signs via mocks is a trust-boundary hazard even when labelled "staging."
- **No cross-cutting ADR — leave each provider to its own decision record.** Rejected: the
  port/bindings/select convention and the mock-first guardrail are genuinely cross-cutting, and leaving
  them implicit is what produced the BUG-002-001 fail-open selector. A single fail-closed rule prevents the
  next one.
- **A DI container to perform the swap.** Rejected, consistent with ADR-011 §4 — explicit selector +
  construction is sufficient and avoids smuggling the provider's full surface through an indirection.
