# Project Evaluation — Tax Accountant Client Portal (v1 POC)

> **Date:** 2026-07-01 · **Scope:** EPIC-001..019 delivered (260/309 placed AC verified); EPIC-020..023 remaining; Phase 5 (Production Readiness) placeholder.
> **Dimensions:** (1) code accuracy vs. original requirements, (2) test coverage, (3) human workflow usage, (4) the plan to finish the POC (no production environment exists).
> **Method:** four independent audit passes — a requirements-to-code spot-check (12 security/behavior-critical AC traced to implementation), a test-suite inventory + live run of every tier runnable without Docker, a persona/flow walkthrough against the implemented routes, and a plan/ADR/coverage-ledger review with a code-level mocked-seam inventory.

---

## Overall verdict

This is an unusually well-governed build. Spot-checking confirms the coverage ledger's claims are real — the code does what the requirements say, security behavior is enforced server-side and fail-closed, and every verified AC traces to a tagged test. The two material weaknesses are **enforcement** (the tests that prove the security model never run in CI) and **the human seams** (the accountant's daily-driver surface doesn't exist yet, and a newly invited client cannot find the onboarding gate). The plan to finish the POC is sound — all four remaining epics are ready today with no provider blockers — but the Phase-5 placeholder is lossier than what the code proves is mocked.

---

## 1. Code accuracy vs. original requirements — HIGH

Twelve security- and behavior-critical acceptance criteria were traced from requirement text to implementing code; **all twelve are accurate, none over-claimed**:

| Area | Finding | Evidence |
| --- | --- | --- |
| Client data isolation (AUTH-003) | Real SQL Server RLS, filter + block predicates via `sec.fn_engagement_access`; null SESSION_CONTEXT reads zero rows (fail-closed); direct-reference denial proven at DB tier and e2e | `db/policies/0005-engagement-policy.sql:73-138` |
| Onboarding letter hard gate (ONBD-001/002) | Accessibility derived server-side solely from `letterSignedAt`; questionnaire and upload actions each re-check the gate before doing work | `packages/db/src/onboarding.ts:109-131`; `apps/portal/src/app/onboarding/actions.ts:488,817,1029` |
| Scan-before-available (NFR-009) | Two-phase upload; only `clean + pass` promotes to `active`; indeterminate stays pending; infected never signable | `packages/db/src/repositories/document.ts:550-636` |
| 7-year retention / purge / legal hold (FILE-005/013/014) | Retention clock stamped in-transaction on completion; purge accountant-only, explicit-confirm, hold-precedence-checked, atomic inside the audit transaction; holds have no TTL column (cannot auto-expire) | `packages/db/src/repositories/retention.ts:52-104`; `purge.ts:166-300`; `legal-hold.ts:33-70` |
| Content-free nudge (MSG-008), daily cap (MSG-009) | Composer is a pure function that cannot interpolate event detail; per-recipient UTC calendar-day watermark | `packages/email/src/digest.ts:89-111`; `packages/db/src/repositories/email-digest.ts:85-151` |
| Manual-only transitions (LIFE-003), two-confirmation completion (LIFE-005) | Enforced at the SQL layer (`WHERE deliveryConfirmedAt IS NOT NULL AND filingConfirmedAt IS NOT NULL`), not just disabled buttons | `packages/db/src/repositories/engagement.ts:722-857` |

**Conventions hold:** zero direct Prisma usage in `apps/**`; the ADR-003 SESSION_CONTEXT wrapper is fenced by an ESLint `no-restricted-imports` rule; the few admin-pool exceptions each carry an explicit ADR-003 §7 justification.

**The honest asterisk:** everything is verified against **mock providers** — auth (Clerk binding is a throwing stub), Docuseal e-sign, malware scanner, email/ESP, real-time transport, and the scheduler (time-injectable seam fired via dev-only routes). COVERAGE.md discloses this accurately, and every mock requires an explicit `ALLOW_MOCK_*=true` opt-in, so a production deployment cannot silently run on mocks. One drift: COVERAGE.md's legend says verified means "a tagged test passes in CI" — that overstates reality (§2).

**Not yet implemented / deferred:** EPIC-020..023 hold the 49 planned AC (13 + 16 + 12 + 8). Explicitly deferred: 2FA (AC-AUTH-004/005, needs real Clerk → Phase 5), REQ-IDNT-001 custom domain (inseparable from ADR-007 hosting → Phase 5), REQ-IDNT-005 permanent hard-delete (retention precedence), REQ-MSG-019 and the v2 set.

## 2. Test coverage — strong design, weak enforcement

Everything runnable without Docker was run and **passes at exactly the claimed numbers**: lint clean, type-check clean across 11 projects, **337/337 portal + 613/613 admin** unit tests, 318 package-level unit tests green.

Inventory: ~950 app unit tests; ~548 integration tests in `packages/db` including **29 dedicated RLS-isolation files**; ~335 Playwright e2e specs across both apps plus 9 cross-app specs; 24 gherkin `.feature` files (prose contracts — Cucumber binding still an unchosen tool, per CLAUDE.md).

**Strengths**

- **AC traceability is exceptional:** all 260 verified AC have at least one `AC-XXX-NNN`-tagged test — zero gaps. The only untagged ledger entries are planned/deferred.
- **Adversarial testing is real:** boundaries proven both ways — CLIENT-B-reads-zero negatives, null-context fail-closed tests, cross-tenant write-block proofs, IDOR negatives at unit and e2e tiers, 31 files with explicit `[NEGATIVE]` tags. Only 8 skips (all environment guards); no `.todo`/`fixme`.

**Gaps**

1. **The security-proving tiers run nowhere in CI.** No CI job executes the `packages/db` RLS/integration suite, and no e2e job exists (its documented home — a deploy-to-staging gate — won't exist until Phase 5). An RLS regression would merge on green CI today.
2. **`test-portal`/`test-admin` are still `continue-on-error: true`.** The documented rationale ("until Epic 001 scaffolds the apps") is 19 epics stale; a unit-test regression is currently non-blocking.
3. **Thin unit tiers on API route handlers** (portal 0/5, admin 1/7 tested) and pages — those surfaces depend entirely on the un-CI'd e2e tier.

Cheap, high-value fix: flip the two app test jobs to required and add a `packages/db` job — the SQL Server service-container pattern is already proven in the existing workflow.

## 3. Human workflow usage — capabilities complete, connective tissue missing

Every individual operation works, and the mock sign-in lane (EPIC-009) makes the product demoable with seeded accounts. Walking the personas' journeys:

| Journey | Verdict |
| --- | --- |
| Prospect: browse → request (no account) | ✅ Works end-to-end — the most polished journey |
| Accountant: request inbox → accept/decline → invite | ⚠️ Works; admin cold-start while signed out 404s (no `/sign-in` page on :3001) |
| Client: sign-up → onboarding gate → in progress | ⚠️ Gate fully built, but **`/onboarding` has zero inbound links** (§5) |
| Lifecycle (accountant drives, client observes) | ✅ Works end-to-end |
| File exchange | ⚠️ Admin side rich; client side download-only post-onboarding — mid-engagement document requests have no client upload surface |
| Messaging / notifications | ⚠️ Fully built, but `/messages` is in neither app's global nav; admin has no notifications feed page |
| **Accountant daily driver** | ❌ Landing page is a stub; no client list; flat unsearchable engagement list; settings pages unreachable from nav |

**Ranked workflow gaps:**

1. No dashboard home → **EPIC-020 fixes**
2. No book-of-business navigation (client list, filterable pipeline) → **EPIC-021 fixes**
3. **Client can't find onboarding — no planned epic owns this** (§5)
4. Admin nav dead zones — Messages, Documents, Settings orphaned; `/settings/reminders` back-links to a nonexistent `/settings`; nav "Notifications" aliases `/requests` → partially EPIC-020/022, partially plain wiring
5. Engagement detail pages (both apps) don't link to their own documents/messages
6. No client mid-engagement upload — contradicts the persona's "version confusion" pain point
7. Admin cold-start 404 (`applyPortalAuth` redirects to a `/sign-in` page that doesn't exist on :3001)
8. Portal nav omits Dashboard/Messages; brand link sends a signed-in client to the public services page; `/engagements/new` (EPIC-012 re-engage) has no inbound link
9. `/dashboard` renders exactly one engagement (`getMyEngagement` is `findFirst` under a stale Phase-2 single-engagement assumption) — a returning client with a second engagement (which EPIC-012 enables) can't see both

Residual after EPIC-020..023: gaps 3, 5 (portal half), 6, 7, 8, 9 are client-portal holes no planned epic owns.

## 4. The plan to finish the POC — sound, with a lossy Phase-5 placeholder

**Remaining epics — all gate-ready today, none provider-blocked** (AC math exact: 13 + 16 + 12 + 8 = 49):

| Epic | Scope | AC | Notes |
| --- | --- | --- | --- |
| EPIC-020 dashboard home | Metrics, activity feed, needs-action | 13 | Average-or-lighter; read-only aggregation over existing events |
| EPIC-021 client/engagement navigation | Client list, pipeline view, notes/flags surfaced | 16 | Average; reuses EPIC-011 mechanisms; parallelizable with 020/022 |
| EPIC-022 settings & identity | Letter-template admin UI, portal names, v1 appearance | 12 | Light; 4 AC are deferral-assertions |
| EPIC-023 audit read surface | NFR-010-01..06 + NFR-011 | 8 | **The sleeper:** heaviest slice despite lowest AC count — ledger-table DDL on the raw-SQL track, audit-or-fail generalization, completeness sweep across ~19 epics of emitters. Budget as a full slice; keep last (its completeness AC must cover admin actions 020–022 add) |

At the demonstrated cadence (~1 epic/day recently): roughly **4–6 delivery cycles** to "v1 POC complete."

**Where the plan is weaker — Phase-5 under-enumeration.** The placeholder's bullets cover Clerk+2FA+invitations, Docuseal, scanner, email, host/domain/secrets/storage, hardening. The code proves four more mocked/missing items with no bullet:

1. **Real-time transport** — vision says Supabase Realtime, the binding is a provisional stub, ADR-007's host contract assumes SSE, and no transport ADR exists. Vision, architecture, and code currently disagree.
2. **Scheduler/cron** — reminder engine + digest fire only via dev-only trigger routes (`ENABLE_REMINDER_TRIGGER`/`ENABLE_DIGEST_TRIGGER`); ADR-007's third OCI image (`scripts/run-cron.ts`) doesn't exist.
3. **Key custody** — no `KeyProvider` code exists despite ADR-020/ADR-023 §5 naming it a fail-closed pre-deploy gate.
4. **Observability** — ADR-016's backend is deferred with no bullet.

Plus plan-hygiene items: **no backup/restore or DR story** anywhere in the operations docs (untenable as a permanent omission for a 7-year-retention product); **NFR-007/-008** (verified e-signature, reliable email delivery) have no coverage rows and are provider properties a mock cannot demonstrate — they belong in the Phase-5 re-validation ledger by ID, as does **NFR-010-04** (auth-event audit under real Clerk) once EPIC-023 delivers; the **chronic P3019 local `DATABASE_URL` caveat** (retro-012-002) has been normalized into every container smoke since EPIC-014 and should be fixed before Phase 5, whose CI-promotion path runs `prisma migrate deploy`; and **no accessibility requirement exists at all** — a requirements-layer gap for a client-facing tax portal.

Open-question ledgers: nothing blocks EPIC-020..023. OD-001 (Azure SQL Serverless cold-start) is a Phase-5 host-choice input; OQ-002 is effectively answered by ADR-025 (ledger status stale); the real-time transport ADR gap is worth minting as an OD so it isn't lost.

## 5. Detail: the onboarding discoverability dead-end (gap #3)

### The dead-end, step by step

1. **Sign-up lands on `/dashboard`** — `redirectTo: "/dashboard"` hardcoded (`apps/portal/src/app/(public)/sign-up/actions.ts:288`).
2. **The dashboard shows a card with no next action.** `dashboard/page.tsx` renders `EngagementCard`, whose single link goes to `/engagements/[id]` (`apps/portal/src/components/EngagementCard.tsx:82`). The empty-state fallback is a literal dead end: "Your engagement is being set up. Check back soon." with only a Sign-out link (`dashboard/page.tsx:79`).
3. **The engagement detail page loops back** — its two links both target `/dashboard` (`apps/portal/src/app/engagements/[engagementId]/page.tsx:123,177`).
4. **The global nav can't help** — brand → `/` (the public services page), Services, Notifications (`apps/portal/src/app/layout.tsx:46,64,76`).
5. **`/onboarding` is fully built and waiting** (three-step sequence, letter hard gate, questionnaire, checklist upload, EPIC-008 auto-transition) but has **zero inbound links** — the only reference outside the onboarding directory is a code comment (`dashboard/actions.ts:39`).

A newly invited client signs up, clicks around a dashboard ↔ engagement-detail loop, and never encounters the one mandatory task that unblocks their engagement. It sits in `New` forever unless someone tells them the URL.

### Why it's a contract violation, not polish

`.planning/flows/flow-onboarding.md:35` specifies the client "Logs in to `apps/portal`. **Navigates to engagement detail. Sees three-step onboarding indicator**…". The implementation drifted: the indicator was built as a standalone route and the flow's discovery step was never wired.

### How it survived 19 epics of validation

- The ONBD acceptance criteria only govern on-page behavior (AC-ONBD-001-01/-03 assert the page renders three ordered steps) — all honestly verifiable with no inbound link existing.
- Every e2e spec teleports via `page.goto('/onboarding')` (e.g. `apps/portal/e2e/specs/document-upload.spec.ts:442,465,486`) — no test walks the discovery path.
- No planned epic owns portal navigation (EPIC-020..023 are all admin-side).

### The fix

All required data is already in the dashboard's read model: `EngagementItem` carries `letterSignedAt`, `questionnaireSubmittedAt`, `status` (`packages/db/src/repositories/engagement.ts:146-161`), and `resolveOnboarding()` derives per-step state. Because EPIC-008's auto-transition moves the engagement out of `New` exactly when the gate completes, **`status === 'New'` is a correct and sufficient "onboarding incomplete" predicate** — no new query, schema, policy, or server action.

1. **Dashboard CTA (core fix).** When the visible engagement is `New`, render a prominent "Complete your onboarding" card on `/dashboard` linking `/onboarding`, ideally showing which steps remain (reuse `resolveOnboarding`). Add the same indicator to the portal engagement detail page — that is what `flow-onboarding` actually specifies.
2. **Post-sign-up redirect.** In `sign-up/actions.ts`, send a fresh client whose engagement is `New` to `/onboarding` instead of `/dashboard`.
3. **Skip the middleware-level funnel** (auto-redirecting `/dashboard` → `/onboarding` while incomplete): it fights the user, who may legitimately want messages/notifications mid-onboarding; the CTA + redirect close the funnel.

Edge cases: leave the zero-rows empty-state (rare — accept-time creation + sign-up back-fill normally make the row visible immediately); don't block on the multi-engagement fix (gap #9), but if done together the CTA becomes per-engagement-card; accountant-initiated engagements (EPIC-012) also start at `New` so the predicate covers them for free.

**Tests to land with it:**

- A tier-6 e2e walking the real discovery path: invitation ticket → sign-up → assert landing/CTA → click through → complete step 1 — bound to `flow-onboarding` steps 34–35 rather than `goto`. This is the regression test whose absence let the gap survive.
- A component test: `New` engagement → CTA rendered; `In Progress`/`Complete` → no CTA.

**Scope and routing:** small application-code slice — two page edits, one redirect-target change, one component, tests. Reviewed-lane under the merge policy. Since the flow contract already specifies the behavior, route it through `/planning` as a flow-gap so it doesn't ship as unplanned work, and fold the other portal nav orphans (Dashboard/Messages missing from nav, `/engagements/new` unlinked) into the same slice.

## 6. Recommended actions, in priority order

1. **Proceed with EPIC-020..023 as planned** — run 020/021/022 in parallel if desired; treat 023 as a full-weight slice, kept last.
2. **CI hardening (small, immediate):** make `test-portal`/`test-admin` required; add a `packages/db` RLS/integration job. Converts the ledger's "verified" from discipline-backed to machine-enforced.
3. **Fix the onboarding discoverability dead-end** (§5) — no epic owns it, and it's the demo-killer.
4. **Amend the ROADMAP Phase-5 bullets** with: real-time transport (+ mint its ADR/OD), scheduler/cron third image + removal of dev trigger routes, key custody (ADR-020), observability (ADR-016), backup/DR runbooks, and NFR-007/-008 + NFR-010-04 re-validation by ID — one docs-only PR before "placeholder" hardens into "plan."
5. **Sweep the nav dead-ends** (admin `/sign-in` 404, orphaned Messages/Documents/Settings links, client mid-engagement upload, single-engagement dashboard) — fold into EPIC-020/021/022 briefs or mint a small nav-wiring slice.
