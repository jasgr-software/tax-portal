---
brief: BRIEF-012
status: done
assigned_to: webapp-developer
updated_by: sdet
depends_on: TASK-012-002
impl: developer
e2e_required: "yes"
started_at: 2026-06-23T16:41:33.466Z
completed_at: 2026-06-23T18:02:29.120Z
complexity_estimate: 4
complexity_actual: 4
introduces_gate: "no"
acceptance_criteria: [AC-DOOR-009-01, AC-DOOR-009-02, AC-DOOR-009-03, AC-DOOR-009-04]
upstream_refs: [ADR-006, ADR-003, ADR-022, ADR-010, REQ-DOOR-009]
code_standards: CS-TS-001, CS-TS-002, CS-TS-003, CS-TS-004, CS-GEN-001, CS-GEN-003
---

# TASK-012-003: Returning-client new-engagement request flow (apps/portal)

---

## Quality Gates

- [x] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [x] **Submission gate** — lint + type-check + build + brief-mandated tests pass (commands in CLAUDE.md)
- [x] **Targeted e2e** — actual execution output in Work Log (brief mandates e2e; incl. cross-app request→inbox)
- [x] **Security review** — signed-in CLIENT-only; identity resolved server-side (CS-TS-004); rate-limited (ADR-022); no PII leak
- [x] **SDET Review** — approved

## SDET Review focus areas

- **New server action with form input** — walk OWASP Top 10; verify identity is resolved from the request
  cookie and role-guarded to CLIENT before any write (CS-TS-004); the on-file contact is sourced server-side,
  never accepted from the form (AC-DOOR-009-03).
- **Rate limiting (ADR-022)** — the submission path is rate-limited like the front-door path.
- **Cross-surface parity (CS-TS-003)** — shared request-handling/DB-wrapper patterns consistent with the
  front-door path.

## Context

A signed-in existing client starts a new engagement request from inside the Client Portal through a simplified
flow that reuses on-file contact (no re-entry) and routes to the accountant's inbox like a front-door request
(REQ-DOOR-009). Calls `createReturningClientRequest` from TASK-012-002.

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `apps/portal/src/app/engagements/new/page.tsx` | Create | Returning-client request UI — active-services multi-select; no contact fields (on-file). Note: portal has no `(authed)` route group; authed routes live at root level. |
| `apps/portal/src/app/engagements/new/actions.ts` | Create | Server action: CLIENT identity guard → `createReturningClientRequest` → success; rate-limited |
| `apps/portal/src/app/engagements/new/_components/ReturningClientRequestForm.tsx` | Create | Client-side form component — ServiceChecklist (CS-TS-003), no contact inputs, submission state |
| `apps/portal/e2e/specs/returning-client-request.spec.ts` | Create | Tier-6 e2e for the four AC |
| `apps/portal/e2e/features/returning-client-request.feature` | Create | Gherkin scenarios (brief `acceptance_format: gherkin`) bound to the spec |
| `scripts/e2e-cross-app.sh` | Modify | Added `e2e/specs/returning-client-request.spec.ts` to portal cross-app spec list (AC-DOOR-009-04) |

## Tests to Write First

- [ ] `[AC-DOOR-009-01] a signed-in client opens the returning-client request flow without leaving the portal`
- [ ] `[AC-DOOR-009-02] the flow lets the client select one or more active services`
- [ ] `[AC-DOOR-009-03] the flow does not ask the client to re-enter on-file contact info`
- [ ] `[AC-DOOR-009-04] a submitted request appears in the accountant inbox like a front-door request (cross-app)`

## Implementation Notes

- Use the portal mock-session fixture (`setupClientSession`) for e2e; the cross-app inbox assertion uses the
  admin surface (`pnpm e2e:cross-app`, ADR-010).
- Bind the gherkin scenarios from the brief's § Acceptance scenarios verbatim.
- Cite `// ADR-022` at the rate-limit guard; `// CS-TS-004` at the identity guard.

## Definition of Done

- [x] Returning-client request UI + action shipped; CLIENT-guarded; rate-limited
- [x] Tier-6 e2e green (incl. cross-app inbox assertion) with execution output in the Work Log
- [x] Lint + type-check + build pass

---

## Work Log

- 2026-06-23 [sdet] Marking done — 6/6 e2e tests PASSED including cross-app AC-DOOR-009-04 inbox assertion. Identity guard CLIENT-only (CS-TS-004). Rate-limit guard before identity check (ADR-022). Contact fields absent from form (AC-DOOR-009-03 proven at UI level). Gherkin .feature file verbatim from brief. CS-TS-001/002 confirmed: DB write through @tax-portal/db barrel only. noContactOnFile error path unit-tested (engagement-creation.test.ts); not e2e-exercised — disposition: acceptable per Overwatch DECISION-E observation (the happy path e2e confirming on-file contact is sufficient for AC-DOOR-009-03; the error case is a code path that requires a user with no prior engagement, which contradicts the AC scope). complexity_actual=4 valid. | What's next: archive | Blockers: none
- 2026-06-23 [webapp-developer] Marking as review — 6/6 e2e tests pass (all 4 ACs: AC-DOOR-009-01..04 incl. cross-app inbox assertion). Lint/type-check/build green. Route at apps/portal/src/app/engagements/new/ (not (authed)/). Files table corrected. | What's next: SDET review | Blockers: none
- 2026-06-23 [webapp-developer] Starting implementation — Returning-client new-engagement request flow; 4 ACs covering a new portal route, server action, gherkin feature, and cross-app e2e | What's next: implement and run gates | Blockers: none
- 2026-06-23 [webapp-developer] Implementation complete — Created `/engagements/new` page (server component), `actions.ts` (rate-limited + CS-TS-004 CLIENT guard + `createReturningClientRequest`), `_components/ReturningClientRequestForm.tsx` (`"use client"`, ServiceChecklist, no contact fields), gherkin feature file, e2e spec (6 tests / 4 ACs). Updated `scripts/e2e-cross-app.sh` to include the new spec. DECISION: route at `apps/portal/src/app/engagements/new/` (not `(authed)/`) matching existing portal routing convention. Gates: lint ✓ type-check ✓ build ✓ docker-preflight ✓ e2e 6/6 passed. | What's next: submit for SDET review | Blockers: none
- 2026-06-23 [webapp-developer] E2E execution output (pnpm --filter portal exec playwright test e2e/specs/returning-client-request.spec.ts): Running 6 tests using 1 worker | ✓ 1 [AC-DOOR-009-01] signed-in CLIENT navigates to /engagements/new and the form loads in the portal (273ms) | ✓ 2 [AC-DOOR-009-01] unauthenticated visitor is redirected away from /engagements/new (not served the form) (173ms) | ✓ 3 [AC-DOOR-009-02] the form presents active services as a selectable checklist (322ms) | ✓ 4 [AC-DOOR-009-02] submitting zero services is blocked (no request created) (261ms) | ✓ 5 [AC-DOOR-009-03] the form has no contact fields (firstName, lastName, email) (211ms) | ✓ 6 [AC-DOOR-009-04] submitted request appears in the admin inbox and notification feed (553ms) | 6 passed (2.9s) | exit code 0

## Attempt Log

**Attempt count**: 0

## SDET Review

**Decision**: approved
**Notes**: 6/6 e2e PASSED including cross-app AC-DOOR-009-04. CLIENT identity guard (CS-TS-004) confirmed — unauthenticated visitor redirected to sign-in. Rate-limit guard (ADR-022) fires before identity check. No contact fields in form (AC-DOOR-009-03 proven at UI level). Gherkin .feature file verbatim from brief. CS-TS-001/002: write via @tax-portal/db only; no raw pool import. noContactOnFile error path is unit-tested in engagement-creation.test.ts; not e2e-exercised — acceptable: the case requires a user with zero prior engagements, which is outside the scope of AC-DOOR-009-03 (which concerns a returning client with contact on file). Advisory observation only.
