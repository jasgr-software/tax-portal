---
id: ADR-014
title: Application framework — Next.js 14 (App Router) + TypeScript, with the server-actions-vs-route-handlers convention
status: Accepted
date: 2026-06-14
deciders: [Architecture Agent, user]
related: [ADR-003, ADR-004, ADR-006, ADR-007, ADR-008, ADR-010, ADR-011, ADR-012, ADR-013, TENET-007, TENET-008]
source:
  - seed/tech-stack.md#decided-stack   # Framework row + Language row (both governing ADR "—")
  - seed/intake.md#delivery--operations-philosophy   # "Type safety end to end" bullet
  - decisions/ADR-003-identity-propagation-session-context.md   # assumes Next.js middleware
  - decisions/ADR-006-monorepo-layout.md   # "two Next.js 14 (App Router) front ends"
  - decisions/ADR-007-container-packaging-deploy-agnostic.md   # standalone output, long-lived Node process
  - decisions/ADR-008-object-storage-abstraction.md   # "Next.js route handler" upload/download path
  - decisions/ADR-012-testing-pyramid.md   # "the compiler is the contract"; "server actions and route handlers"
open_decisions: []
---

# ADR-014: Application framework — Next.js 14 (App Router) + TypeScript, with the server-actions-vs-route-handlers convention

**Status:** Accepted
**Date:** 2026-06-14
**Deciders:** Architecture Agent (with user direction)
**Related:** ADR-003 (identity propagation via middleware), ADR-004 (Prisma), ADR-006 (monorepo / two front ends), ADR-007 (container packaging / standalone output), ADR-008 (object storage route handlers), ADR-010 (cross-app navigation), ADR-011 (repository seam / constructor-injection typing), ADR-012 (testing pyramid — "the compiler is the contract"), ADR-013 (cloud portability); TENET-007 (identity propagation), TENET-008 (cloud-neutral)

## Context

The application framework and language are **load-bearing across the existing decision record but were never decided in their own right**. `seed/tech-stack.md` lists "Framework — Next.js 14 (App Router)" and "Language — TypeScript" with `—` in the Governing ADR column, yet several Accepted ADRs already *assume* both:

- **ADR-003** propagates identity through **Next.js middleware** populating `AsyncLocalStorage` before any request-scoped DB query; the trust chain explicitly "flows through the Next.js middleware (verifier)."
- **ADR-006** describes "**two Next.js 14 (App Router) front ends**" (`apps/portal`, `apps/admin`) over shared `packages/`, each with a `middleware.ts` and `next.config.mjs`.
- **ADR-007** packages each app via Next.js `output: 'standalone'` running as a **long-lived Node process** (`node apps/<app>/server.js`), and prohibits `runtime = 'edge'` / `@vercel/*`.
- **ADR-008** routes file upload/download through a "**Next.js route handler**" and the storage port.
- **ADR-012** drops the OpenAPI contract tier precisely because "tax-portal is a TypeScript monorepo … **server actions and route handlers** … consume Prisma-generated types … **the compiler is the contract**."
- **ADR-011** relies on **constructor-injection typing** for the repository seam.

So the framework and language are decided in fact but undocumented — an "undocumented-decision" gap. This ADR locks them in and, critically, **codifies the server-actions-vs-route-handlers convention** that the above ADRs lean on but never wrote down: reviewers today cannot cite a standard when a developer reaches for the wrong primitive.

This must respect the trust boundary (TENET-007 / ADR-003 — identity is set in middleware before any DB query, on *every* server entrypoint), cloud neutrality (TENET-008 / ADR-013 — no edge runtime, no `@vercel/*`, no provider SDK in a route handler or server action), and the two-frontend topology (ADR-006).

Scope is **how, not what**: this decides the build technology and the server-entrypoint convention, not any product behavior.

## Decision

**We will build both front ends (`apps/portal`, `apps/admin`) as Next.js 14 App Router applications written in TypeScript, and we adopt the server-actions-vs-route-handlers convention below as a citable standard.**

### 1. Framework — Next.js 14, App Router

- **App Router only.** No Pages Router. Routing, layouts, and server entrypoints follow the `app/` directory model already described in ADR-006.
- **Server-first.** Server Components by default; `'use client'` only where interactivity requires it. This keeps data access on the server, where the `SESSION_CONTEXT` identity contract (ADR-003) holds.
- **Standalone output** (`output: 'standalone'`, `outputFileTracingRoot` at the repo root) — already required by ADR-007 for the container image shape. No edge runtime, no `@vercel/*` (ADR-007, ADR-013, TENET-008).
- **Identity middleware is mandatory on both apps.** Each app's `middleware.ts` verifies the Clerk session and enters `withRequestContext()` before any handler runs (ADR-003). This ADR makes Next.js middleware the *named* mechanism for that obligation; it is not optional anywhere a request can reach the DB.

### 2. Language — TypeScript

TypeScript is the single application language across both apps and all shared `packages/*`. This is **folded into this ADR rather than given its own** because the seed treats "type safety end to end" as one delivery-philosophy commitment and the language is meaningless apart from the framework that hosts it.

- **`strict` mode on.** `strict: true` in the shared `tsconfig` base; both apps and all packages extend it. No `// @ts-nocheck` files, no implicit `any` in committed code.
- **The compiler is the cross-module contract.** Per ADR-012, there is no OpenAPI/codegen boundary inside the monorepo — server actions, route handlers, and the repository interfaces (ADR-011) are joined by hand-typed signatures and Prisma-generated types. The `type-check` gate (ADR-012 Tier 1) is therefore a hard contract gate, not a nicety: a type error is a broken cross-module contract.
- **Typed seams.** Repository constructor injection (ADR-011) and the storage port (ADR-008) are typed interfaces; the compiler enforces adapter conformance. This is the portability mechanism TENET-008 relies on — swapping an adapter is a typed, single-file change.

### 3. Server-actions-vs-route-handlers convention (the new citable standard)

Both primitives run server-side under the App Router and both sit *after* the identity middleware, so both inherit the `SESSION_CONTEXT` contract. They are **not interchangeable**. Use:

**Server Actions** (`'use server'` functions) for:
- First-party, same-app mutations triggered by the app's own UI — form submissions, status transitions, message sends, intake answers. The default for "the user clicked a thing in our app."
- Progressive-enhancement flows where the form must work and the action is invoked by React's action binding.
- Anything that benefits from typed arguments end-to-end (no manual request parsing) — the compiler-is-the-contract benefit (§2) is strongest here.

**Route Handlers** (`app/**/route.ts`) for:
- **Inbound webhooks** — Clerk (lands on `apps/portal` per ADR-001), Docuseal (future ADR). Third parties POST to a URL; there is no UI action to bind.
- **Machine/programmatic endpoints with a defined HTTP contract** — health probes (`/healthz`, `/readyz` per ADR-007), the signed-URL mint/redirect endpoints (ADR-008/009), SSE streams (long-lived `GET` per ADR-007), and any endpoint hit by a non-browser client or external scheduler (ADR-013 cron-hitting-an-authenticated-endpoint).
- **Streaming or non-HTML responses** — file streaming, `text/event-stream`, downloads.

**Decision rule, one line:** *if our own UI invokes it, prefer a Server Action; if something external addresses it by URL, or it needs an explicit HTTP/streaming contract, it is a Route Handler.*

**Invariants for both:**
- Neither may bypass the identity middleware. A server action or route handler that touches the DB must run inside the request context (ADR-003 / TENET-007); the anonymous paths (public services page, engagement-request submission) use the admin pool explicitly, never the request pool.
- Neither may import a cloud provider SDK directly — storage, signed-URL minting, email, realtime go through their ports (ADR-008/009, ADR-013, TENET-008).
- No business logic in `packages/ui` components reaching into either primitive (ADR-006 boundary).

### Enforcement is a developer task (flagged, not written here)

This convention is review-citable as prose today. To make it *machine-enforced*, a developer should add lint rules — candidates: an ESLint rule (or `eslint-plugin-boundaries` / a custom rule in `packages/eslint-config`) that flags (a) a provider SDK import inside a `route.ts` or `'use server'` module, (b) `runtime = 'edge'` exports, (c) `@vercel/*` imports, and (d) DB access outside the `packages/db` request-context wrapper. **The Architecture Agent does not write code** — this is flagged for `[webapp-developer]` to implement against `packages/eslint-config`. Until then, the convention is enforced by review against this ADR.

## Consequences

- **The framework and language are now citable standards.** ADR-003/004/006/007/008/011/012 no longer rest on an undocumented assumption; a deviation review can cite ADR-014 when a change adds the Pages Router, drops `strict`, introduces a codegen boundary, or uses the wrong server primitive.
- **A new review surface exists.** "Should this have been a server action or a route handler?" now has a written answer reviewers cite. Misuse (e.g. a webhook implemented as a server action, or a first-party mutation exposed as an unauthenticated route) is a finding.
- **A code task is owed.** The lint rules above are a developer deliverable; until they land, enforcement is manual review. Tracked as an out-of-scope code need, not an open decision.
- **`strict` TypeScript is a hard gate.** The Tier-1 `type-check` gate (ADR-012) is load-bearing — turning off `strict` or littering `@ts-nocheck` breaks the cross-module contract and is a blocking deviation.
- **App Router commitment.** We are tied to the App Router's server-component model and its evolution. A future move to a different framework or the Pages Router would require a superseding ADR — this is the cost of pinning, accepted because four ADRs already assume it.
- **Cloud neutrality preserved.** Naming Next.js does not add platform lock-in: the standalone-output / long-lived-Node-process / no-edge-runtime rules (ADR-007, ADR-013) keep the framework deploy-agnostic.
- **No version-pinning beyond major.** "Next.js 14" pins the major line and the App Router model. Minor/patch upgrades are routine; a Next.js 15+ major upgrade is a deliberate change but does not require a superseding ADR unless it alters the App Router contract this ADR relies on.

## Alternatives considered

- **Leave it undocumented (rely on the assuming ADRs).** Rejected — the gap is exactly what the undocumented-decision rule exists to close. Four Accepted ADRs depend on a framework choice no ADR makes; a reviewer has nothing to cite, and the server-action-vs-route-handler convention has no home.
- **A standalone TypeScript ADR separate from the framework ADR.** Rejected on granularity grounds (my conventions govern this). The seed states the language commitment as one bullet with the monorepo/compiler-as-contract idea; ADR-011/012 already exercise it; a separate ADR would be a thin record that only ever co-decides with the framework. Folded in here, with TypeScript's own Decision and Consequences sections so it is still first-class and supersedable.
- **Pages Router (or a hybrid).** Rejected — ADR-003's middleware-then-`AsyncLocalStorage` identity model, ADR-006's `app/` layout, and the server-first data-access posture are all App Router shaped. The Pages Router would fork the identity-propagation story.
- **A non-Next React framework (Remix / TanStack Start / plain React + a separate API).** Rejected — a separate API tier reintroduces the OpenAPI/codegen contract boundary ADR-012 deliberately dropped, and none of the existing ADRs are written for it. Re-platforming four ADRs to gain nothing the workload needs is not justified for a v1.
- **Loosen TypeScript (`strict: false` / allow `any`).** Rejected — directly undercuts ADR-012's "the compiler is the contract" and ADR-011's typed seams, which are the portability and test-seam mechanisms. The strictness *is* the contract.
- **No server-action-vs-route-handler convention (developer's choice case-by-case).** Rejected — that is the status quo that produced the gap. Without a written rule, webhooks-as-actions and first-party-mutations-as-open-routes both pass review, eroding both the identity contract and the security posture.
