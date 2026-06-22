---
id: CS-TS-004
title: Every server action resolves identity from the request cookie and guards role before any DB write
language: typescript
polarity: do
rating: experimental
status: active
verification: In any Next.js server action that performs a DB write or returns restricted data, an identity helper (e.g. getAccountantIdentity / getClientIdentity) reads the cookie header, constructs a synthetic Request, calls provider.getIdentity(), and checks the expected role — all before the first DB call. A reviewer confirms no server action skips the identity guard or derives the actor from action arguments or form data.
source:
  - ADR-003
  - ADR-006
  - CLAUDE.md#Domain-specific-notes
related: [CS-TS-001, CS-TS-002]
rating_history:
  - { rating: experimental, date: 2026-06-22, by: agent, rationale: "discovered in PR #87 audit — getAccountantIdentity() pattern appears in apps/admin actions.ts (TASK-010-003, mirroring document-requests/actions.ts from prior slices) and getClientIdentity() in apps/portal dashboard/actions.ts (TASK-010-004, mirroring onboarding/actions.ts); both follow the identical shape: read cookie, synthetic Request, provider.getIdentity(), role-check before any DB call, actor sourced from session only. The pattern is declared binding in ADR-003 and recurs across ≥3 distinct action files in two surfaces. Proposed experimental pending human ratification." }
open_questions: []
---

# CS-TS-004 — Every server action resolves identity from the request cookie and guards role before any DB write

## Rule

Per **ADR-003**, every Next.js `"use server"` action that performs a DB write or returns
restricted data must resolve the caller's identity from the incoming request's cookie header
(via `provider.getIdentity(syntheticRequest)`) and check the expected role **before** the
first DB call. The actor passed to the audit seam comes **only** from this verified session —
never from action arguments, form data, or any client-supplied value.

## Rationale

A server action that trusts a role passed in from the client (an action argument or a hidden
form field) has no trust fence at the HTTP layer. The pattern — reconstruct from the cookie,
verify the role, bail before touching the DB — makes the action file itself the trust fence
and is the only shape ADR-003 sanctions for request-scoped identity.

## Verification

Review every new or modified `"use server"` file for the identity guard pattern:
1. `const headerStore = await headers()` + `headerStore.get("cookie")`.
2. `new Request("http://localhost/", { headers: { cookie: … } })` (synthetic Request).
3. `provider.getIdentity(syntheticRequest)` → role check.
4. Early return (`null` / error result) if identity is absent or wrong role.
5. `actor` for the ADR-019 audit event derived from the verified session fields only.

Any server action that skips step 3-4, or that derives the actor from an argument, is a
finding. Admin-pool reads that use a page-level guard (middleware + defense-in-depth check)
rather than a standalone helper are a variation of the same pattern and count as compliant.

## Examples

- do: `const identity = await getAccountantIdentity(); if (!identity) return { success: false, error: "Unauthorized" };`
- don't: `export async function advanceStatusAction(engagementId: string, actorId: string)` — actor from caller

## Links

- Source: ADR-003 (set-on-acquire wrapper; trust-fence semantics), ADR-006 (surface boundary),
  CLAUDE.md § Domain-specific notes
- Observed in: `apps/admin/…/actions.ts` (TASK-010-003, TASK-007-003), `apps/portal/…/actions.ts`
  (TASK-010-004, TASK-005-005)
- Related: CS-TS-001 (DB wrapper), CS-TS-002 (no raw pool import)
- Open questions: none
