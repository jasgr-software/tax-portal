---
id: ADR-022
title: Anti-abuse & rate limiting on public endpoints — bot-protection vendor deferred
status: Accepted   # Posture decidable (rate limiting, bot/CAPTCHA gate, abuse handling on the public front door); the CAPTCHA/bot-protection vendor is deferred (defer-but-constrain). No carve-out blocks this ADR.
date: 2026-06-14
deciders: [Architecture Agent, user]
related: [ADR-001, ADR-003, ADR-007, ADR-013, TENET-001, TENET-002]
source:
  - architecture-dispatch-2026-06-14#adr-e-anti-abuse-rate-limiting   # dispatch: decide anti-abuse posture for the anonymous front door; defer CAPTCHA vendor
  - decisions/ADR-007-container-packaging-deploy-agnostic.md   # in-memory rate-limiter counters are single-process-only; >1-replica state-migration implication
  - decisions/ADR-003-identity-propagation-session-context.md   # anonymous paths run under the admin pool (no SESSION_CONTEXT)
  - decisions/ADR-001-authentication-clerk.md   # public allow-list routes (services page, engagement-request form) are the abuse target
  - decisions/ADR-013-cloud-portability-azure-readiness.md   # keep bot-protection behind a port; Azure-cheapest default; no proprietary SDK in routes
open_decisions: []   # CAPTCHA/bot-protection vendor is a defer-but-constrain tool deferral with a capability contract — it does not block this ADR (mirrors ADR-007/016/021)
---

# ADR-022: Anti-abuse & rate limiting on public endpoints — bot-protection vendor deferred

**Status:** Accepted. The anti-abuse *posture* is decided; the specific CAPTCHA/bot-protection vendor is deferred under the **defer-but-constrain** pattern (ADR-007/013/016/021) with a capability contract. No escalation carve-out blocks this ADR.
**Date:** 2026-06-14
**Deciders:** Architecture Agent (with user direction)
**Related:** ADR-001 (public allow-list routes — the abuse target), ADR-003 (anonymous paths use the admin pool), ADR-007 (in-memory rate-limiter counters are single-process-only — the >1-replica implication), ADR-013 (port discipline; Azure-cheapest default); TENET-001 (security non-negotiable), TENET-002 (self-serve front door — must stay accessible)

## Context

**Epic 001 is the anonymous public front door.** Prospective clients browse the services page and submit an **engagement-request form without an account** (TENET-002, ADR-001's public allow-list routes). An unauthenticated, internet-facing form that writes to the database is a classic **spam/abuse target**: bots flooding the request form, scripted submissions, content/contact-form spam, and resource-exhaustion attempts.

Two prior decisions bear directly on this:

- **ADR-001** establishes the public allow-list (services page, request form, sign-in, sign-up completion) — everything *not* on it requires a session. The allow-listed write endpoint (engagement-request submission) is exactly the exposed surface.
- **ADR-003 §6** specifies that **anonymous paths run under the admin pool** (no `SESSION_CONTEXT`, since there is no authenticated principal) — so the engagement-request insert is an *admin-pool* write with **no RLS protection**. That makes abuse-throttling at the application edge the primary defense for these endpoints; RLS is not a backstop here.
- **ADR-007** explicitly notes that **in-memory state — including "rate-limiter counters" — lives in the process for v1**, and that **if either app scales to >1 replica, that state must move to SQL Server or an external store.** A per-process in-memory limiter is correct only while each app is a single replica; it silently under-counts across replicas otherwise.

The gap: there is **no recorded anti-abuse posture** — no decision on rate limiting (per-IP / per-endpoint), bot/CAPTCHA protection, or abuse handling. This must be decided before the public front door ships in Epic 001. The forces:

1. **The front door must stay self-serve (TENET-002).** Anti-abuse must not reintroduce an "account required before request" gate, and must not make the form hostile to legitimate prospects.
2. **Security non-negotiable (TENET-001).** The exposed admin-pool write needs an edge defense.
3. **Single-process assumption is fragile (ADR-007).** The chosen rate-limit mechanism must have a clear migration path to shared state when replicas scale beyond one.
4. **Cloud portability (ADR-013).** Bot-protection must sit behind a port and be a deploy-time vendor choice — no CAPTCHA vendor SDK baked into a route handler.
5. **Defer the vendor, not the posture** — the defer-but-constrain pattern (ADR-007/016/021).

Scope is **how, not what**: this decides the anti-abuse *mechanism*, not a product requirement asserting the form must resist spam (TENET-001/002 / requirements own that).

## Decision

**We will protect the anonymous public endpoints with layered anti-abuse: per-IP and per-endpoint rate limiting at the application edge, a bot/CAPTCHA challenge on the engagement-request submission, and an abuse-handling path — with rate-limit state explicitly single-process in v1 and a defined migration to shared state at >1 replica. The specific CAPTCHA/bot-protection vendor is deferred behind a `BotProtection` port with a capability contract (defer-but-constrain).**

### 1. Rate limiting — per-IP and per-endpoint, at the application edge (decided)

- The public allow-list endpoints (engagement-request submission especially; the services page read is lower-risk) are rate-limited **per source IP and per endpoint** at the app edge (middleware / route handler), independent of authentication (these callers are anonymous).
- Limits are **configurable** (env/config, not hard-coded), with conservative defaults tuned so a legitimate prospect submitting one request is never blocked while a flood is throttled.
- Exceeding the limit returns a `429` with a retry hint; it does **not** reintroduce an account gate (TENET-002).

### 2. Rate-limit state is single-process in v1 — with an explicit >1-replica migration (decided; reconciles ADR-007)

This directly reconciles **ADR-007's in-memory-counters note**:

- **v1: in-process counters.** Each app is a single replica (ADR-007's documented single-process assumption), so an in-memory per-IP/per-endpoint counter is correct and sufficient. This is the cheapest, most portable starting point (no external dependency).
- **>1 replica: state must move to shared store.** The moment either app scales beyond one replica, **per-process counters under-count** (each replica sees only its own slice of traffic, so the effective limit multiplies by the replica count — a real abuse hole). At that point rate-limit state migrates to a shared store: **SQL Server** (ADR-007's named fallback, inside the box/Azure SQL intersection per ADR-013) or an external store (e.g. Redis) behind a port. This is called out as a **scaling trigger**, not left implicit — it is the same single-process caveat ADR-007 flagged, now with a concrete owner and migration path.
- The limiter is reached through a small **`RateLimiter` port** so the in-memory→shared-store swap is a single adapter change (ADR-013 port discipline), not a route-handler rewrite.

### 3. Bot / CAPTCHA protection on the request form (decided posture; vendor deferred)

- The engagement-request submission carries a **bot-protection challenge** (CAPTCHA / invisible challenge / proof-of-work — the *mechanism class* is decided: a bot gate exists on the public write).
- It sits behind a **`BotProtection` port**; the concrete vendor (hCaptcha, Cloudflare Turnstile, reCAPTCHA, etc.) is **deferred** (defer-but-constrain). No vendor SDK in a route handler (ADR-013/TENET-008); verification goes through the port's server-side check.
- The challenge must degrade gracefully for legitimate users (TENET-002 — the front door stays self-serve and usable); an invisible/low-friction challenge is preferred over a hard interactive puzzle where the vendor supports it.

### 4. Abuse handling (decided)

- Spam/abusive submissions that pass rate-limit + bot checks are handled downstream: the accountant's accept/decline flow (ADR-001) is the human gate, and abusive requests can be marked/declined without creating accounts. Repeat-offender IPs feed back into the rate-limit/block configuration.
- Abuse events are **audit-logged** (ADR-019) and observable as **operational metrics** (ADR-016 — counts/rates only, no PII per ADR-017).

### 5. `BotProtection` / `RateLimiter` capability contract (defer-but-constrain)

The deferred bot-protection vendor and the rate-limit store must satisfy:

1. **Server-side verifiable** — the bot challenge is verified server-side (a client-only check is worthless); reachable behind the `BotProtection` port, no vendor SDK in routes.
2. **No-op/dev binding** — local dev and tests run with a no-op/stub bot-protection and an in-memory limiter, so the public-form flow is testable without a live vendor (mirrors ADR-008/016/021 no-op bindings).
3. **Shared-store-capable rate limiter** — the `RateLimiter` port has an in-memory impl (v1) and a shared-store impl (SQL Server / external) for the >1-replica case.
4. **Portable / swappable** — vendor change is a single adapter change (ADR-013).

**Azure-cheapest default target (not a commitment):** Cloudflare Turnstile (free, low-friction) or an Azure-front-door/WAF-level rate-limit + bot rule are natural defaults to design toward (ADR-013); the port keeps the choice at deploy time.

### Why this is Accepted (no carve-out)

Anti-abuse is a **security posture** but not an AGENT.md §2 escalation item — it is a mechanism decision (rate limiting, bot gate, abuse handling), and the only deferred element is a **vendor**, the routine defer-but-constrain pattern. It contains no data-retention/encryption/trust-boundary *policy* sub-decision, so it is Accepted (unlike ADR-018/019/020).

## Consequences

- **The public front door has an edge defense from day one.** The anonymous admin-pool write (ADR-003) is no longer unthrottled. **Code follow-up flagged for `[webapp-developer]`:** a `RateLimiter` port (in-memory v1 impl + shared-store impl stub) and per-IP/per-endpoint limiting middleware on the public allow-list; a `BotProtection` port with a no-op dev binding and server-side verification on the engagement-request submission; `429` handling that preserves the self-serve flow; abuse-event audit logging (ADR-019) + operational metrics (ADR-016/017); extend the ESLint SDK-ban list to flag CAPTCHA-vendor SDK imports in routes. **DevOps follow-up:** vendor + shared-store wiring at Phase 5; the >1-replica scaling trigger documented in `docs/operations/runbook.md` (and the inventory if a store/WAF is added).
- **ADR-007's single-process caveat now has an owner and a trigger.** The "in-memory rate-limiter counters are single-process-only" note is reconciled into an explicit scaling trigger: scaling either app to >1 replica **requires** migrating rate-limit state to a shared store first, or the limit silently multiplies. A deviation review flags an unported in-memory limiter under multi-replica config.
- **The vendor stays deferred.** Like ADR-007/016/021, the bot-protection vendor is a Phase-5-style tool deferral behind a port; the app is indifferent to Turnstile vs. hCaptcha vs. WAF rules.
- **TENET-002 preserved.** No account gate is introduced; the bot challenge and rate limits are tuned to leave legitimate single submissions unobstructed.
- **No new always-on burden today.** v1 runs in-memory limiting + no-op/dev bot-protection; nothing anti-abuse-specific is operated until the vendor/store is bound at Phase 5.

## Alternatives considered

- **No anti-abuse controls (rely on the accept/decline human gate alone).** Rejected — the human gate handles *content* spam after the fact but does nothing against volumetric bot floods or resource exhaustion against an unauthenticated admin-pool write (ADR-003). An edge defense is required (TENET-001).
- **Require an account / login before submitting a request.** Rejected — directly violates TENET-002 (self-serve front door; "no account required before request"). Anti-abuse must protect the anonymous flow, not eliminate it.
- **In-memory rate limiting with no migration plan.** Rejected — ADR-007 already flagged that per-process counters break at >1 replica; leaving it implicit is an abuse hole waiting for the first horizontal scale-out. The decision names the scaling trigger and the shared-store migration explicitly.
- **Pick the CAPTCHA/bot-protection vendor now.** Rejected — contradicts the deferral directive and TENET-008/ADR-013 (a CAPTCHA vendor SDK in a route is proprietary coupling). Defer-but-constrain (ADR-007/016/021): the vendor stays open behind a `BotProtection` port with a capability contract.
- **Rely solely on a future platform WAF/front-door for rate limiting (no app-level limiter).** Rejected as the *baseline* — the platform is deferred (ADR-007), so no WAF is guaranteed in v1; an app-edge limiter works on every candidate host and on local dev. A platform WAF is a welcome *additional* layer at Phase 5 (and the Azure-cheapest default target), not a substitute for the app-level control.
- **Treat anti-abuse as a no-default escalation carve-out.** Rejected — no sub-decision here is data-retention/encryption/trust-boundary *policy*; it is a mechanism decision plus a vendor deferral. The §2 carve-out does not apply; Accepted.
- **Fold into ADR-001/ADR-007 by amending them.** Rejected — ADRs are immutable; this `related:`-links ADR-001 (the public surface) and ADR-007 (the single-process caveat) and lands a new decision rather than rewriting them.
