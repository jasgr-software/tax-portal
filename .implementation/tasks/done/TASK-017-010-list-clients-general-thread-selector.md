---
brief: BRIEF-017
status: done
assigned_to: webapp-developer
updated_by: sdet
depends_on: TASK-017-006
impl: developer
e2e_required: "no"
started_at: 2026-06-25T14:53:28.473Z
completed_at: 2026-06-25T19:24:04.470Z
complexity_estimate: 2
complexity_actual: 2
brief_type: feature
brief_deploys: "no"
introduces_gate: "no"
acceptance_criteria: [AC-MSG-002-01, AC-MSG-002-02]
upstream_refs: [REQ-MSG-002, ADR-003, ADR-006, EPIC-012]
code_standards: CS-TS-001 (required), CS-TS-002 (required), CS-TS-004 (experimental), CS-GEN-001 (recommended), CS-GEN-003 (recommended)
reviewer: sdet
---

# TASK-017-010: `listClients` read model + wire the admin StartGeneralThread client selector (make AC-MSG-002-01 exercisable through the UI)

---

## Quality Gates

- [x] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [x] **Submission gate** — lint + type-check + build + brief-mandated tests pass (commands in CLAUDE.md)
- [N/A] **Targeted e2e** — _(N/A here — the general-thread-creation journey is exercised e2e in TASK-017-008)_
- [x] **Security review** — injection / XSS / auth bypass / sensitive data exposure verified
- [ ] **SDET Review** — approved

## SDET Review focus areas

- **AC-MSG-002-01 must be exercisable end-to-end through the delivered UI** (the brief's sign-off contract). The accountant can **pick a client** in the StartGeneralThread affordance and start a general thread — not a present-but-empty selector. Verify the selector is populated and the create flow reaches `startGeneralThreadAction` with a server-resolved clientUserId.
- **Accountant-only (CS-TS-004 / ADR-006).** `listClients` is an `apps/admin`-only, accountant-identity-guarded read; the selected clientUserId is **server-resolved** and validated against the listed set — never trusted raw from the form. `apps/portal` gets no client-listing path.
- **Admin-pool, RLS-exempt accountant read (ADR-003 §7 / CS-TS-001/-002).** Mirror `listEngagementsForAdmin` — admin pool via `getAdminPool()` inside `packages/db`; no raw pool import outside `packages/db`.
- **No PII leak in logs (CS-GEN-001)** — client names/emails are display data, never logged.

## Context

TASK-017-006 delivered the StartGeneralThread affordance but it renders with an **empty clients list** — there is no read model to populate the selector, so the accountant cannot actually start a general thread through the UI. This task closes that gap so **AC-MSG-002-01 / -002-02** are demonstrable end-to-end through the delivered build (and so the TASK-017-008 e2e general-thread journey can drive a real selection).

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `packages/db/src/repositories/client.ts` | Create | `listClients()` — admin-pool, RLS-exempt: distinct CLIENT users (`User.role='CLIENT'`, reachable via `Engagement.clientUserId`) with display name/email joined from `EngagementRequest` (OUTER APPLY join); returns `{ clientUserId, firstName, lastName, email }[]` |
| `packages/db/src/client.test.ts` | Create | Tier-3 integration test — seeds User+EngagementRequest+Engagement rows, asserts listClients returns them with correct display identity; distinct-by-clientUserId proven |
| `packages/db/src/index.ts` | Modify | barrel-export `listClients` + its item type `ClientItem` (additive) |
| `apps/admin/src/app/messages/actions.ts` | Modify | `listClientsAction` (ACCOUNTANT identity guard) + `createGeneralThreadForClientAction` (server-validates clientUserId against listed set before calling `startGeneralThreadAction`) |
| `apps/admin/src/app/messages/actions.test.ts` | Create | Unit tests for `listClientsAction` (identity guard, empty list, error path) + `createGeneralThreadForClientAction` (identity guard, server-validation gate, success path, whitespace trim) |
| `apps/admin/src/app/messages/_components/StartGeneralThread.tsx` | Modify | populate the selector via `listClientsAction` on mount (useEffect when expanded); submit via `createGeneralThreadForClientAction`; accepts optional `clients` prop for SSR/test override |
| `apps/admin/src/app/messages/messages.test.tsx` | Modify | updated mocks (listClientsAction + createGeneralThreadForClientAction); new tests: selector populated, chosen client reaches action, error surfaced, empty-list graceful |

## Tests to Write First

- [x] `listClients` returns the accountant's distinct clients with display identity (admin pool) — empty array when none
- [x] selector renders the returned clients; choosing one + submit reaches `createGeneralThreadForClientAction` with that clientUserId (AC-MSG-002-01)
- [x] a clientUserId not in the listed set is rejected (server-side validation — not trusted raw)
- [x] `listClientsAction` refuses a non-accountant identity (CS-TS-004)
- [x] resulting general thread is associated with the chosen client (AC-MSG-002-02) — verified via `createGeneralThreadForClientAction` returning the thread with `clientUserId` set

## Implementation Notes

- Reuse the `listEngagementsForAdmin` join shape (`User → Engagement → EngagementRequest` for names) — do **not** add firstName/lastName to the `User` model (DECISION-E precedent: names live on `EngagementRequest`). Distinct-by-`clientUserId`. Admin pool, RLS-exempt (ADR-003 §7), accountant-guarded at the action layer.
- Keep it minimal — a client picker, not a full client-management surface. No new policy (the read is admin-pool / accountant-only). Cite ADR-003/-006 + EPIC-012 + the CS keys (CS-GEN-003).

## Definition of Done

- [x] `listClients` read model + barrel export; `listClientsAction` accountant-guarded
- [x] StartGeneralThread selector populated; accountant can start a general thread end-to-end (AC-MSG-002-01)
- [x] chosen clientUserId server-validated; portal has no client-listing path
- [x] Lint + type-check + build + tests pass; no raw pool import outside `packages/db`

---

## Work Log

- 2026-06-25 [sdet] Marking done — listClients repo uses admin pool via getAdminPool() (CS-TS-001/-002 satisfied). Unit tests prove: CLIENT identity refused before DB access (CS-TS-004), unauthenticated refused, clientUserId not in listed set rejected (server-validation gate — never trusted raw from form), valid clientUserId reaches startGeneralThreadAction with correct clientUserId set (AC-MSG-002-02). StartGeneralThread selector wired to fetch on mount. Portal has no client-listing path (ADR-006). 557 admin + 4 db integration + 30 admin messages tests pass. Lint + type-check + build green. | What's next: archive | Blockers: none
- 2026-06-25 [webapp-developer] Marking as review — listClients repo + barrel export + listClientsAction + createGeneralThreadForClientAction (server-validated wrapper) + StartGeneralThread wired to fetch on mount. All tests pass: 557 admin (27 files) + 4 db integration + 30 admin messages tests. Lint + type-check + build green. | What's next: SDET review | Blockers: none
- 2026-06-25 [webapp-developer] Starting implementation — task TASK-017-010 | What's next: implement and run gates | Blockers: none
## Attempt Log

**Attempt count**: 0

## SDET Review

- [x] **SDET Review** — approved

**Decision**: approved
**Notes**: `listClients` uses admin pool via `getAdminPool()` inside `packages/db` (CS-TS-001/-002 satisfied, no raw pool import outside). Unit tests prove: CLIENT identity refused before any DB access (CS-TS-004), unauthenticated caller refused, `clientUserId` not in the listed set rejected by `createGeneralThreadForClientAction` (server-validation gate — never trusted raw from form), valid clientUserId threads correctly to `startGeneralThreadAction` with `clientUserId` set (AC-MSG-002-01/-02). `StartGeneralThread` selector wired to fetch on mount via `listClientsAction`. `apps/portal` has no client-listing path (ADR-006 accountant-only). 557 admin + 4 db integration + 30 admin messages tests pass. Lint + type-check + build green.
