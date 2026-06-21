---
id: CS-TS-002
title: Never import the raw requestDb/adminDb pools outside packages/db
language: typescript
polarity: dont
rating: required
status: active
verification: Only the wrapped `db` client is exported from the `packages/db` barrel; `requestDb` and `adminDb` are not. The custom ESLint rule fails any import of the raw pools outside `packages/db/src/` (admin-pool paths are the documented exception in ADR-003 §1/§6). A reviewer greps for raw-pool imports outside the package.
source:
  - ADR-003#6
  - ADR-003#1
related: [CS-TS-001, ADR-004]
rating_history:
  - { rating: required, date: 2026-06-20, by: agent, rationale: "born required — ADR-003 §6 names this as a custom ESLint rule; barrel deliberately does not export the raw pools" }
open_questions: []
---

# CS-TS-002 — Never import the raw requestDb/adminDb pools outside packages/db

## Rule
Do not import `requestDb` or `adminDb` directly. Per **ADR-003 §6**, the package barrel exports only the
wrapped `db` client; the raw pools stay internal, and the admin pool is reachable only from the
documented admin code paths (webhooks, scripts, jobs, seed — ADR-003 §1).

## Rationale
The two pools are the reified trust boundary. Importing `requestDb` directly bypasses the SESSION_CONTEXT
wrapper (see [[CS-TS-001]]); importing `adminDb` from a request path bypasses RLS altogether. Keeping the
raw pools un-exported makes the boundary mechanically enforceable rather than a matter of discipline.

## Verification
The ESLint rule in `packages/eslint-config` forbids raw-pool imports outside `packages/db/src/`; the
barrel exports only `db`. A reviewer confirms any `adminDb` use sits on an allowed admin path with a
logged justification.

## Examples
- do: `import { db } from '@tax-portal/db'`
- don't: `import { adminDb } from '@tax-portal/db/client'` // outside an admin code path

## Links
- Source: ADR-003 §6 (middleware / lint layer), §1 (principal separation)
- Related: CS-TS-001, ADR-004
- Open questions: none
