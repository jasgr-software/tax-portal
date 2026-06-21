---
id: CS-TS-001
title: Request-scoped DB access only through the packages/db wrapper
language: typescript
polarity: do
rating: required
status: active
verification: Route handlers / server code reach the DB only via the wrapped `db` client from `packages/db` (which sets SESSION_CONTEXT before the first query); no `new PrismaClient` or `requestDb`/`adminDb` use in request paths. Enforced by the ESLint import-boundary rule and the SESSION_CONTEXT propagation tests.
source:
  - ADR-003#2
  - CLAUDE.md#Domain-specific-notes
related: [CS-TS-002, CS-SQL-003, ADR-005]
rating_history:
  - { rating: required, date: 2026-06-20, by: agent, rationale: "born required — ADR-003 contract enforced by the ESLint import boundary + SESSION_CONTEXT propagation tests in CI" }
open_questions: []
---

# CS-TS-001 — Request-scoped DB access only through the packages/db wrapper

## Rule
Every request-scoped DB query goes through the `packages/db` Prisma wrapper (the `$extends` client that
sets `SESSION_CONTEXT` before the first real query). Per **ADR-003 §2**, direct Prisma access in route
handlers outside that wrapper is a convention violation.

## Rationale
RLS predicates (ADR-005) fail closed on a null `SESSION_CONTEXT`. A query that bypasses the wrapper runs
with no identity and either returns zero rows or — worse, if it reaches the admin pool — bypasses RLS
entirely. The wrapper is the single point that propagates the verified Clerk identity to the engine.

## Verification
The cited evidence hook: the ESLint import-boundary rule forbids the raw clients outside `packages/db`,
and the SESSION_CONTEXT propagation test asserts the verified identity reaches RLS. A reviewer confirms
no request-path module constructs its own Prisma client or imports `requestDb`/`adminDb`.

## Examples
- do: `import { db } from '@tax-portal/db'; await db.engagement.findMany()`
- don't: `const prisma = new PrismaClient(); await prisma.engagement.findMany()` // bypasses SESSION_CONTEXT

## Links
- Source: ADR-003 §2 (set-on-acquire wrapper), CLAUDE.md § Domain-specific notes
- Related: CS-TS-002, CS-SQL-003, ADR-005
- Open questions: none
