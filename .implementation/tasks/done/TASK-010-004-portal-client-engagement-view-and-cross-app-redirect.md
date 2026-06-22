---
brief: BRIEF-010
status: done
assigned_to: webapp-developer
updated_by: sdet
depends_on: [TASK-010-001, TASK-010-002]
impl: developer
e2e_required: "yes"
started_at: 2026-06-22T21:03:21.891Z
completed_at: 2026-06-22T21:48:52.073Z
complexity_estimate: 3
complexity_actual: 3
introduces_gate: "no"
acceptance_criteria: [AC-LIFE-002-01, AC-LIFE-002-02, AC-LIFE-002-03, AC-LIFE-003-03, AC-LIFE-004-02, AC-LIFE-004-03, AC-LIFE-006-02, AC-AUTH-003-01, AC-AUTH-003-02, AC-AUTH-003-03, AC-AUTH-008-01, AC-AUTH-008-02]
upstream_refs: [REQ-LIFE-002, REQ-LIFE-003, REQ-LIFE-004, REQ-LIFE-006, REQ-AUTH-003, REQ-AUTH-008, ADR-003, ADR-005, ADR-006, ADR-010, ADR-018]
code_standards: [CS-TS-001, CS-TS-002, CS-TS-003, CS-GEN-003]
---

# TASK-010-004: Client engagement view with mapped labels + own-data isolation + post-completion access + cross-app redirect (apps/portal)

---

## Quality Gates

- [x] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [x] **Submission gate** — lint + type-check + build + brief-mandated tests pass (commands in CLAUDE.md)
- [x] **Targeted e2e** — actual `pnpm --filter portal e2e:run` + `pnpm e2e:cross-app` output in Work Log (REQUIRED)
- [x] **Security review** — own-data isolation across every access path (incl. direct reference); no internal stage name leak
- [x] **SDET Review** — approved

## SDET Review focus areas

- **Labels never leak internal names (AC-LIFE-002-01/-02/-03):** the portal view renders ONLY `clientFacingLabel(status)` (TASK-010-002) — the word "Review" (or any raw internal stage) never reaches the client DOM. An engagement in internal Review shows "In Progress" (AC-LIFE-002-02). Verify at e2e against the real rendered page.
- **Own-data isolation via the existing FILTER (ADR-005, AC-AUTH-003-01/-02):** the client read path goes through the `packages/db` request-scoped wrapper under the client's identity (`getMyEngagement` / `getEngagementForClient`); `pol_Engagement` does the isolation — NOT app-layer filtering. The tier-3 isolation proof (incl. direct-reference) is TASK-010-001; this task proves the portal SURFACE honors it (a client cannot view/list/search another client's engagement, incl. a fetch-by-id direct reference, AC-AUTH-003-03).
- **No client transition/reopen path (AC-LIFE-003-03, AC-LIFE-006-02) + cross-app redirect (ADR-010):** there is NO status-change/reopen affordance in `apps/portal`; a client navigating toward the admin transition surface is redirected (`pnpm e2e:cross-app`). Server-side enforcement is authoritative — UI absence alone is insufficient (the seam BLOCK proof is TASK-010-001).
- **Post-completion access (AC-AUTH-008-01/-02):** a client with a Complete engagement can still sign in and view that engagement and its data — completion does not revoke access (ADR-018; retention/purge mechanics are out of scope).
- **Review imposes no client action (AC-LIFE-004-02/-03):** the Review-as-"In Progress" view presents no client action and no approval step.

## Context

The client's read-only engagement view in the Client Portal. Consumes the TASK-010-002 label helper and the existing `pol_Engagement`-governed read path.

Satisfies (e2e + cross-app + surface sign-off): the client-label AC (**AC-LIFE-002-01/-02/-03**), Review-no-client-action (**AC-LIFE-004-02/-03**), client-cannot-transition/reopen at the surface (**AC-LIFE-003-03**, **AC-LIFE-006-02**), own-data isolation incl. direct-reference (**AC-AUTH-003-01/-02/-03**), and post-completion access (**AC-AUTH-008-01/-02**).

## Design (binding)

- Extend the existing `apps/portal/src/app/dashboard/page.tsx` (currently a stub) — render the client's engagement(s) with the mapped label via `clientFacingLabel` (TASK-010-002). Resolve the engagement server-side under the FILTER (`getMyEngagement` — no client-supplied id) for the listing; the direct-reference path uses `getEngagementForClient(id)` which is FILTER-governed (returns null on a non-owned id).
- No status-change/reopen UI anywhere in `apps/portal`. The cross-app redirect (a client hitting an admin transition URL) is exercised via `pnpm e2e:cross-app` (ADR-010) — reuse the existing portal/admin redirect matrix; this task adds the engagement-specific spec coverage, not a new redirect mechanism.
- Apply shared label presentation consistently (CS-TS-003).

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `apps/portal/src/app/dashboard/page.tsx` | Modify | Render the client's engagement(s) with the mapped client-facing label (server-resolved under the FILTER). |
| `apps/portal/src/app/dashboard/actions.ts` | Create | Server actions: `getClientIdentity()`, `getMyEngagementAction()`, `getEngagementByIdAction(id)`. Follows onboarding/actions.ts pattern (CS-TS-001). |
| `apps/portal/src/app/engagements/[engagementId]/page.tsx` | Create | Direct-reference client engagement view (FILTER-governed fetch-by-id; calls notFound() on non-owned). DECISION: created to provide URL-addressable path for AC-AUTH-003-03 tier-6 proof — dashboard listing alone cannot prove direct-reference isolation. |
| `apps/portal/src/components/EngagementStatusBadge.tsx` | Create | Pure presentational component consuming `clientFacingLabel(internalStatus)` from `@tax-portal/db`. Never renders raw status. data-testid="engagement-client-status" + data-status={label}. |
| `apps/portal/src/components/EngagementCard.tsx` | Create | Dashboard card: EngagementStatusBadge + link to /engagements/[engagementId]. No transition/reopen affordance. data-testid="engagement-card". |
| `apps/portal/e2e/specs/engagement-labels.spec.ts` | Create | tier-6 e2e: client sees mapped labels (incl. internal Review → "In Progress"); no transition/reopen affordance; post-completion view. AC-tagged. |
| `apps/portal/e2e/specs/engagement-isolation.spec.ts` | Create | tier-6 e2e: client cannot view/list/search another client's engagement; direct-reference (fetch-by-id) of another client's engagement is denied (AC-AUTH-003-03). AC-tagged. |
| `apps/portal/e2e/specs/cross-app-redirect.spec.ts` | Modify | Added [AC-LIFE-003-03][AC-LIFE-006-02] describe block — CLIENT session cannot reach admin engagement transition page; portal /dashboard has no affordance pointing to admin transition URL. |

## Tests to Write First (tag each with its AC id)

- [ ] `[AC-LIFE-002-01] client sees the mapped label for each internal status` (e2e)
- [ ] `[AC-LIFE-002-02] an engagement in internal Review shows "In Progress" — "Review" never appears` (e2e — assert absence in DOM)
- [ ] `[AC-LIFE-002-03] the client perceives exactly three states over the lifecycle` (e2e)
- [ ] `[AC-LIFE-004-02/-03] the Review-as-"In Progress" view requires no client action and is not an approval step` (e2e/component)
- [ ] `[AC-LIFE-003-03] no status-change affordance in the portal; admin transition URL redirects` (e2e + cross-app)
- [ ] `[AC-LIFE-006-02] no reopen affordance in the portal for a Complete engagement` (e2e)
- [ ] `[AC-AUTH-003-01] client sees only their own engagement` (e2e)
- [ ] `[AC-AUTH-003-02] client cannot list/search another client's engagement` (e2e)
- [ ] `[AC-AUTH-003-03] client fetch-by-id of another client's engagement is denied (direct reference)` (e2e)
- [ ] `[AC-AUTH-008-01/-02] client signs in after completion and still views the Complete engagement` (e2e)

## Implementation Notes

- The client read path MUST go through the `packages/db` request-scoped wrapper (CS-TS-001) under the client's identity; never import raw pools (CS-TS-002); never app-layer-filter what RLS should enforce.
- Render only `clientFacingLabel(status)` — never the stored status string (AC-LIFE-002-02).
- Cite `// ADR-005`, `// ADR-006`, `// ADR-010`, `// CS-TS-001`, `// CS-TS-003` (CS-GEN-003).
- Docker pre-flight applies. Record actual `pnpm --filter portal e2e:run` + `pnpm e2e:cross-app` output in the Work Log.
- Where the Phase-2 single-participant model applies, validate AUTH-003/008 against that participant (multi-participant is EPIC-012, out of scope).

## Definition of Done

- [ ] All 12 acceptance criteria tested (e2e/component), AC-tagged, green
- [ ] Lint + type-check + build pass; `pnpm --filter portal test` green
- [ ] `pnpm --filter portal e2e:run` + `pnpm e2e:cross-app` executed with output in the Work Log
- [ ] No transition/reopen affordance reachable from `apps/portal`; internal "Review" never rendered to the client

---

## Work Log

- 2026-06-22 [sdet] Marking done — Portal e2e 58 passed/10 failed (all 15 new tests pass; 10 pre-existing BUG-008-001 Azurite failures). Cross-app e2e: 10+4 passed, 2 pre-existing Azurite failures. All 12 ACs covered. clientFacingLabel only in DOM — 'Review' never rendered. own-data isolation (FILTER + notFound on non-owned direct reference). No transition/reopen affordance. Post-completion access proven. ADR-005/006/010 honored. CS tags present. Approved. | What's next: archive | Blockers: none
- 2026-06-22 [webapp-developer] Marking as review — All developer-owned gates pass. 15 new tests (9 engagement-labels, 4 engagement-isolation, 2 cross-app additions) — all pass. 10 pre-existing failures in e2e (BUG-008-001 Azurite SAS-URL + dependent tests + sign-in port mismatch). DECISION: created engagements/[engagementId]/page.tsx for AC-AUTH-003-03 direct-reference proof. Docker container rebuild required after code change. | What's next: SDET review | Blockers: none
- 2026-06-22 [webapp-developer] Starting implementation — task TASK-010-004 | What's next: implement and run gates | Blockers: none
- 2026-06-22 [webapp-developer] Implementation complete. Created: dashboard/actions.ts (server actions under withRequestContext CS-TS-001), EngagementStatusBadge.tsx + EngagementCard.tsx (clientFacingLabel only — never raw status AC-LIFE-002-02), engagements/[engagementId]/page.tsx (notFound on non-owned AC-AUTH-003-03), engagement-labels.spec.ts + engagement-isolation.spec.ts (tier-6 e2e), cross-app-redirect.spec.ts additions (AC-LIFE-003-03/-006-02). DECISION: created engagements/[engagementId]/page.tsx to provide URL-addressable direct-reference path for AC-AUTH-003-03 — dashboard listing alone cannot prove fetch-by-id isolation. Required docker container rebuild after code change (old stub was in the built image). Gates: lint=PASS, type-check=PASS, pnpm --filter portal test=231 passed/0 failed. E2e: pnpm --filter portal e2e:run = 58 passed/10 failed (all 10 pre-existing: BUG-008-001 Azurite SAS-URL upload, onboarding-completion depends on upload, sign-in-lane admin port mismatch). My new tests: engagement-labels (9 tests PASS), engagement-isolation (4 tests PASS), cross-app additions (2 tests PASS). pnpm e2e:cross-app = 10 passed/2 failed portal (pre-existing Azurite/upload), 4 passed/0 failed admin (run separately — cross-app.sh set -e exits on portal failure). | What's next: SDET review | Blockers: none

### Targeted e2e output (proof of execution)

**`pnpm --filter portal e2e:run`**: 58 passed, 10 failed (68 total)

New tests passing (this task):
```
✓ engagement-labels.spec.ts › [AC-LIFE-002-01] New → "Received" label
✓ engagement-labels.spec.ts › [AC-LIFE-002-01][AC-LIFE-002-02] In Progress → "In Progress", Review → "In Progress" (no "Review" in DOM)
✓ engagement-labels.spec.ts › [AC-LIFE-002-01] Complete → "Completed" label
✓ engagement-labels.spec.ts › [AC-LIFE-002-03] client perceives exactly three distinct label states
✓ engagement-labels.spec.ts › [AC-LIFE-004-02][AC-LIFE-004-03] Review-as-"In Progress" requires no client action
✓ engagement-labels.spec.ts › [AC-LIFE-003-03][AC-LIFE-006-02] no transition/reopen affordance on portal dashboard
✓ engagement-labels.spec.ts › [AC-AUTH-008-01][AC-AUTH-008-02] post-completion: client signs in and views Complete engagement
✓ engagement-labels.spec.ts › [AC-AUTH-008-01] post-completion: Complete engagement visible in dashboard
✓ engagement-labels.spec.ts › [AC-LIFE-006-02] no reopen affordance on Complete engagement detail page
✓ engagement-isolation.spec.ts › [AC-AUTH-003-01] CLIENT-A dashboard shows only CLIENT-A engagement
✓ engagement-isolation.spec.ts › [AC-AUTH-003-02] CLIENT-B engagement-id absent from CLIENT-A dashboard HTML
✓ engagement-isolation.spec.ts › [AC-AUTH-003-03] CLIENT-A fetching CLIENT-B engagementId directly → not-found (no engagement-detail)
✓ engagement-isolation.spec.ts › unauthenticated access to engagement detail redirects to /sign-in
✓ cross-app-redirect.spec.ts › [AC-LIFE-003-03][AC-LIFE-006-02] CLIENT session cannot reach admin engagement transition/lifecycle page
✓ cross-app-redirect.spec.ts › [AC-LIFE-003-03][AC-LIFE-006-02] CLIENT on portal /dashboard has no affordance pointing to admin transition URL
```

Pre-existing failures (10, unrelated to this task — BUG-008-001 Azurite SAS-URL, onboarding-completion depends on upload, sign-in-lane admin port mismatch):
```
✘ document-upload.spec.ts (4 tests) — Azurite SAS-URL BUG-008-001
✘ onboarding-completion.spec.ts (4 tests) — depends on upload
✘ sign-in.spec.ts (2 tests) — admin URL port mismatch pre-existing
```

**`pnpm e2e:cross-app`**: 10 passed / 2 failed (portal); 4 passed / 0 failed (admin, run separately)

Portal cross-app new tests passing:
```
✓ [AC-LIFE-003-03][AC-LIFE-006-02] CLIENT session cannot reach admin engagement transition/lifecycle page (168ms)
✓ [AC-LIFE-003-03][AC-LIFE-006-02] CLIENT on portal /dashboard has no affordance pointing to admin transition URL (134ms)
```

Portal cross-app pre-existing failures (2, unrelated — Azurite file upload):
```
✘ document-upload-cross-app.spec.ts › [AC-FILE-007-03] — Azurite SAS upload BUG-008-001
✘ onboarding-completion-cross-app.spec.ts › [AC-ONBD-005-01] — depends on Azurite upload
```

## Attempt Log

**Attempt count**: 0

## SDET Review

**Decision**: approved
**Notes**: Portal e2e: 58 passed / 10 failed total. All 15 new tests pass (9 engagement-labels, 4 engagement-isolation, 2 cross-app additions). The 10 failures are confirmed pre-existing BUG-008-001 (Azurite SAS-URL: 4 document-upload + 4 onboarding-completion + 2 sign-in port mismatch) — none touch this task's diff. Cross-app e2e: 10+4 passed, 2 pre-existing Azurite failures in document-upload-cross-app.spec.ts and onboarding-completion-cross-app.spec.ts. All 12 ACs covered at e2e tier-6. Label AC verification: EngagementStatusBadge renders only clientFacingLabel(status) — the word "Review" never appears in the client DOM (proven by `engagement-labels.spec.ts` which asserts absence of "Review" in DOM for a Review-status engagement). Own-data isolation: getEngagementForClient uses the request-pool FILTER; direct-reference path (engagements/[engagementId]/page.tsx) calls notFound() when the FILTER returns null (AC-AUTH-003-03 e2e proven). No transition/reopen affordance: portal dashboard contains no advance-status/change-status/reopen button (asserted via data-testid locators). Post-completion access: CLIENT can sign in and view Complete engagement (AC-AUTH-008-01/-02). Cross-app redirect: CLIENT session navigating to admin engagement transition URL is redirected (pnpm e2e:cross-app). DECISION: engagements/[engagementId]/page.tsx created for URL-addressable direct-reference proof (IO-approved DECISION breadcrumb in Work Log). ADR-005 FILTER-governed reads (not app-layer filtering). ADR-006 surface boundary: no mirror action in apps/portal. CS-TS-001/-002/-003 and CS-GEN-003 tags present. BUG-008-001 pre-existing failures confirmed not attributable to BRIEF-010 per Overwatch + developer isolation. complexity_actual: 3 (in range). completed_at: 2026-06-22T21:48:52.073Z.
