# HANDOFF-008 — BRIEF-008 / EPIC-008 completion report

**For the upstream producer (`.planning/` → COVERAGE write-back).** Slice: **onboarding completion** — when an
engagement's three onboarding steps are all satisfied (letter signed — EPIC-005; questionnaire submitted —
EPIC-006; required documents uploaded — EPIC-007), the **system** marks onboarding complete, **automatically
transitions the engagement New → In Progress** (the single automatic transition in the lifecycle), and emits an
**accountant-only in-portal notification** identifying the engagement + client. **The Phase-2 capstone — the
smallest Phase-2 slice (8 AC).** Branch `brief-008-onboarding-completion-transition` → **PR #55**. Status at
handoff: **in `## Awaiting PR merge`** (pre-merge gates 1–7 green; awaiting merge → Close-finalize gate 8).
**Brief-type:** feature · **Brief-deploys:** no.

## AC satisfied (8/8 in-scope — ready for COVERAGE `verified`)

**Evidence basis:** SDET acceptance-validation **Gate 6 APPROVED** (2026-06-20T05:30:00Z — all 8 in-scope AC
traced to passing AC-tagged tests at their prescribed ADR-012 tiers under the bound **gherkin** prose-bind; the
ADR-005 §6 read-boundary HARD tier-3 three-item check independently CONFIRMED; quality-parity PASS) **+** SDET
**Gate 7 CI** on PR #55 — run **`27856606320`** (pull_request) @ head **`06119e2`** — `completed/success`,
both **required** checks green (`lint-and-typecheck` ✅ + `security-scan` ✅; advisory `test-portal` ✅ +
`test-admin` ✅) **+** the load-bearing **tier-3** proofs (fire-once transition+notification+audit atomicity +
accountant-only read, confirmed real against the live SQL Server stack at TASK-008-001 review, 14/14) **+**
tier-6 e2e (admin 4/4 In-Progress + notification specs + portal negative path + cross-app + security
fail-closed, all PASS in Smoke).

| AC | Tier(s) validated | Covering evidence |
|---|---|---|
| AC-ONBD-005-01 | 2 + 3 | `onboarding-completion.predicate.test.ts:64` `[AC-ONBD-005-01] all three steps done → complete` (`isOnboardingComplete === true`); `onboarding-completion.integration.test.ts:485` `[AC-ONBD-005-01] fulfilled DocumentRequest → document-upload step done → transitions` (`transitioned === true` + status `In Progress`). **Browser-e2e tier deferred to BUG-008-001** (carried by the tier-3 proof — see below). |
| AC-ONBD-005-02 | 2 + 3 + 6 | predicate single-unsatisfied cases (`isOnboardingComplete === false`); `integration.test.ts:396/429/456` (`transitioned === false` + status `New` + zero notification); portal `onboarding-completion.spec.ts` negative describe `[AC-ONBD-005-02][AC-ONBD-006-03]` (two steps `data-done="false"` + DB `status === "New"` + zero notification row — PASS in Smoke) |
| AC-ONBD-006-01 | 2 + 3 + 6 | `integration.test.ts:374` (`transitioned === true`, status `In Progress`); admin `engagement-status.test.ts:100/114` (`status === "In Progress"`); admin `onboarding-completion.spec.ts:408` (`data-status="In Progress"` on the live page — PASS in Smoke) |
| AC-ONBD-006-02 | 3 + 6 | `integration.test.ts:374` dual-tagged `[AC-ONBD-006-02]` — `processOnboardingCompletion` transitions with **no accountant input**; admin e2e `:408` observes status without any admin POST ("the transition occurred WITHOUT any manual accountant action") — PASS in Smoke |
| AC-ONBD-006-03 | 3 + 6 | `integration.test.ts:507/542` fire-once: two calls ⇒ notif count `=== 1` + audit count `=== 1`; already-In-Progress ⇒ `transitioned === false` + notif count `=== 0`; portal negative e2e — PASS in Smoke |
| AC-ONBD-007-01 | 3 + 5 + 6 | `integration.test.ts:597/639/653/666` (notif count `=== 1`; ACCOUNTANT reads ≥1; CLIENT + null SESSION_CONTEXT read 0 — ADR-005 §6); admin `NotificationsIndicator.test.tsx:82/98/110` (item rendered with `data-notification-type="onboarding_completed"`); admin e2e `:429` (notification visible) — PASS in Smoke |
| AC-ONBD-007-02 | 3 + 5 + 6 | `integration.test.ts:615` (`notif.title`/`notif.body` contain client name + FK resolved); component `:126/137` (`getByText("Onboarding complete for Jane Prospect")` + body `/Jane Prospect/`); admin e2e `:453` (client first name in title AND body) — PASS in Smoke |
| AC-MSG-013-04 | 3 + 5 + 6 | dual-tagged with AC-ONBD-007-01 on all three surfaces (`integration.test.ts:597` `[AC-ONBD-007-01][AC-MSG-013-04]`; `NotificationsIndicator.test.tsx:76`; admin e2e describe `:391`) — single test surface satisfies both per brief; dual-tag honored at tier-3, tier-5, tier-6 |

**AC-ONBD-005-01 — BUG-008-001 carry (for the planning ledger):** the **browser-e2e tier** of AC-ONBD-005-01
(portal positive upload-completion path, e2e tests 25/26 in Smoke) is env-blocked by the **pre-existing**
BUG-008-001 (Azurite SAS URL host-unreachable from host Playwright Chromium — EPIC-007/ADR-009-originated,
established three ways at the TASK-008-004 gate: spec byte-identity to `main`, no BRIEF-008 code in the
upload-delivery path, reproduces with the 004 specs absent). **This is NOT a BRIEF-008 regression.**
**AC-ONBD-005-01 is validly carried for slice Validate by its tier-3 integration proof**
(`onboarding-completion.integration.test.ts:485`, real container, part of TASK-008-001's 14/14). e2e is **not**
a per-PR required CI check (CLAUDE.md; required = `lint-and-typecheck` + `security-scan`), so the env-blocked
browser tier does not block this slice's merge. **Recorded: AC-ONBD-005-01 validated at tier-3; browser-e2e
tier deferred to BUG-008-001.**

**Conductor → `/planning validate EPIC-008 with CI evidence <merge run/SHA>`** after merge: flip these 8
COVERAGE rows `planned → verified` and roll EPIC-008 `planned → delivered`. **EPIC-008 is the Phase-2
capstone — with it delivered, Phase 2 (the onboarding gate: EPIC-005 step 1 + EPIC-006 step 2 + EPIC-007 step 3
+ EPIC-008 completion/transition) is COMPLETE at the engine level.**

## What shipped (net-new platform capabilities)

**Headline: the single automatic transition in the engagement lifecycle — delivered as behavior over existing
shapes, with ZERO schema migration.** This slice introduced **no net-new entity, no new column, no new RLS
policy, no new provider seam.**

- **The completion engine** (`packages/db/src/onboarding-completion.ts`):
  - `isOnboardingComplete(model)` — a **pure predicate** (tier-2 truth table) over the three existing
    onboarding `done` flags from `resolveOnboarding` (letter `letterSignedAt`; questionnaire
    `questionnaireSubmittedAt`; document-upload `allRequiredProvided`). **Onboarding complete = all three flags
    true** — no re-derivation, no fork of the onboarding spine.
  - `processOnboardingCompletion(engagementId)` — the **privileged atomic fire-once seam** under the admin
    pool. **Server-authoritative re-evaluation** (loads engagement + checklist by id; does NOT trust a
    caller-passed boolean — the EPIC-007 M1 "re-assert server-side" lesson). The privileged write is
    `UPDATE Engagement SET status='In Progress' WHERE id=@id AND status='New'`; only when `@@ROWCOUNT === 1` do
    the notification INSERT + audit fire — so **re-evaluating an already-In-Progress engagement is a guaranteed
    no-op (AC-ONBD-006-03), even under concurrency.** The whole privileged step is **one
    `withAuditTransaction`** (transition + notification + audit commit/rollback together — ADR-019 atomicity).
  - The `onboarding_completed` notification **type constant** + barrel export.
- **Completion is derived, not a stored flag** (D1). No `onboardingCompletedAt` column — the persistent
  fire-once record IS the `status='In Progress'` value.
- **Portal triggers** (`apps/portal/.../onboarding/actions.ts`): `processOnboardingCompletion(engagement.id)`
  invoked from the two actions that can be the *completing* step — `submitQuestionnaireAction` +
  `completeUploadAction` — **never** letter-sign (steps 2/3 are still pending after the letter). Each call is
  **best-effort after the step's own commit** (inside `try/catch` placed strictly after the action's
  success/revalidate branch; errors logged, not rolling back the committed step). The D2 status guard makes
  double-invocation / a later retry idempotent. The engagement id is **server-resolved** (`getMyEngagement()`
  via `withRequestContext`), never client-supplied (ADR-003).
- **Notification identifies engagement + client** via the **EngagementRequest 1:1 link + denormalized client
  name** (D4) — reusing the existing nullable `engagementRequestId` FK (no `engagementId` FK migration;
  mirrors EPIC-003's proven `createEngagementRequest` notification INSERT pattern; the prospect→client name is
  always present from EPIC-001's `EngagementRequest`). The completion notification reuses the existing
  accountant-only `db/policies/0004-notification-policy.sql` — **no new policy** (ADR-005 §6 read-boundary
  re-confirmed REAL at tier-3: ACCOUNTANT reads ≥1; CLIENT + null SESSION_CONTEXT read 0).
- **Admin notification surface** (`apps/admin/.../NotificationsIndicator.tsx`): extended from a hard-filter on
  `new_engagement_request` to also render `onboarding_completed` (explicit two-element guard; unknown/future
  types dropped, not rendered) — AC-ONBD-007-01/-02, AC-MSG-013-04. A **minimal read-only engagement-status
  display** ("In Progress") added to the existing admin per-engagement surface
  (`engagements/[engagementId]/document-requests/page.tsx`) so AC-ONBD-006-01 has a UI observable for the
  e2e — **admin surface only** (client-facing lifecycle labels remain Phase-3 out-of-scope).
- **Audit recorded** through the existing seam (ADR-019 `recordAuthEvent`/`withAuditTransaction`, which already
  anticipated the `'engagement.transition'` action) — no new audit machinery.

## Out-of-scope honored (for the planning ledger)

No step-**internal** changes (letter-sign / questionnaire-submit / upload pipelines consumed, not modified —
the EPIC-005 letter hard gate is NOT weakened); no **manual** engagement-lifecycle transitions or
pipeline-stage controls beyond the single automatic `New → In Progress` (Phase 3); no other notification types;
no real-time (Supabase Realtime) or digest-email delivery for the completion notification (the existing feed
substrate carries it); no client-side completion notification (accountant-only); no client-facing lifecycle
labels (admin status observable only). **No schema migration** — no entity, no column, no policy, no provider
seam.

## Upstream items raised

- **None this slice.** No `OPEN-QUESTIONS.md` entry. Every shape this slice needed already exists and is
  governed by an Accepted ADR: `Engagement.status` (`@default("New")`, the schema comment already reserves the
  `New → In Progress` transition for EPIC-008); the `resolveOnboarding` three-flag read model; the EPIC-003
  `Notification` entity + the accountant-only `0004` policy + the admin feed; the ADR-019 audit seam (already
  anticipating `'engagement.transition'`); ADR-003 (admin-pool server-authoritative writes + Amendment 1
  no-`@read_only`); ADR-005 §6 (read boundary); ADR-006 (admin surface only); ADR-012 (tier map). The
  slice-local design choices (D1 derived completion / no marker column; D2 fire-once `@@ROWCOUNT` guard; D3
  server-authoritative re-eval; D4 EngagementRequest 1:1 denormalized name; D5 best-effort trigger from the two
  completing portal actions; D6 admin feed extension + minimal status observable) were brief-delegated to IO
  Design and recorded; none were genuinely upstream.

## Carry-forward (see RETRO-008 § Carry-forward)

Clock-domain `Completed-at`/`Started-at` inversion (**9th+ occurrence**; the pending `ungated-fix` —
amend `developer.md` to prohibit developer writes to `Completed-at` — still rides a future docs/ungated change,
**not this PR**) + its sister **`Updated-by`-staleness** finding (all 5 tasks left `Updated-by:
webapp-developer`, not flipped to `sdet` on the atomic close — fold into the same `developer.md`/close-edit
fix scope); the **gate-vs-wording brittleness** note (`check_work_log_content`'s literal `"Starting
implementation"` substring grep rejected the truthful synonym "Starting TDD" on TASK-008-002 — broaden the grep
to a synonym set OR tell developers the exact required phrase; plus the observation that the check fires only
once a task flips to `done`, so the failure surfaces late); **BUG-008-001** (Azurite SAS-URL host-unreachable —
pre-existing EPIC-007/ADR-009 infra defect, its own future infra slice; **do NOT fix in BRIEF-008**); plus the
carried infra family (`sqlserver` healthcheck SA-password/volume mismatch; `scripts/smoke-test.sh` defaults;
clean-volume bootstrap/P3019), the `@demo` prior-epic PNG byte-churn output-scoping, the `adminDb` typed
accessor, the CSP `connect-src localhost:10000` env-gating, and the pre-existing e2e flakes
(EPIC-005 `onboarding.spec.ts:312`, EPIC-006 `questionnaire-cross-app.spec.ts:372`) — none ride this PR.

## Docs-lane close-out (Conductor, post-merge)

- `docs/demos/EPIC-008/` gallery (`@demo` admin In-Progress + notification + portal pre-completion walkthrough;
  the portal positive-completion screen honestly noted as "KNOWN GAP — BUG-008-001", not faked) — rides the
  slice PR.
- COVERAGE/ROADMAP sign-off via `/planning validate EPIC-008` after merge (this HANDOFF is the source) —
  flips the 8 AC `planned → verified`, rolls EPIC-008 `planned → delivered`, and **closes Phase 2**.
- **Phase-2 closeout (Conductor Report phase):** EPIC-008 is the Phase-2 capstone — the Conductor's Report
  phase must run the Phase-2 closeout (walkthrough video per DEMO-POLICY § Part B; `docs/demos/phase-2/`).
- **NOT in the slice PR:** `.orchestration/STATE.md` is deliberately not on the branch — it takes the separate
  docs-lane, not this slice's branch.
