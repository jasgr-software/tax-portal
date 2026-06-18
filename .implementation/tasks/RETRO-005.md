# RETRO-005 — BRIEF-005 / EPIC-005 (Client onboarding spine + engagement-letter e-sign gate)

**Slice:** the onboarding spine + its first hard gate — engagement created `New` on accept → 1:1 to the
accepted `EngagementRequest`, resolved to the client `User` (the **first client-owned rows**); a three-step
onboarding sequence in `apps/portal` with steps 2/3 server-side-locked until the engagement letter is e-signed
through a **mock `ESignatureProvider` seam** (ADR-023/024); on signature the letter is recorded + audited and
the later steps unlock; the accountant edits the letter template (from a system default) in `apps/admin`.
**10 in-scope AC.** Branch `brief-005-onboarding-spine-engagement-letter` → PR (pending — `## Awaiting PR
merge`). **Brief-type:** feature · **Brief-deploys:** no. **Opens Phase 2 (the onboarding gate).**

## 9-gate scorecard (pre-merge)

1. **Per-task submission gates** — 8/8 ✅ (every developer Work Log carries lint/type-check/build/test + e2e evidence where mandated).
2. **SDET Review** — 8/8 tasks approved (no rejections; TASK-005-005 carried one note-only comment-drift to Close-prep).
3. **Overwatch Audit** — ✅ **CLEAN, 0 blocking.** Zero scope violations, zero gate bypasses, zero required-gate-evidence gaps. Gate-authoring verified (-001 `yes` first client-owned-rows policy with all 3 evidence items + HARD isolation test real; -002/-007 advisory, not silently upgraded). 3 non-blocking observations (Obs 1–3, below).
4. **IO Design scan** — ✅ integrated diff (74 files, +11393/−308, scoped to EPIC-005) honors every cited ADR (003/005/006/019/023/024) + the DECISION-A–E contract; 0 violations → 0 fix-forward tasks.
5. **Container Smoke** — ✅ PASS. Non-destructive smoke vs. live docker stack; esign selector binds `mock`+`ALLOW_MOCK_ESIGN=true` in the prod-built container with no fail-closed throw (BUG-002-001-class check PASS); `--grep AC-ONBD-002-03` sign→unlock 33/33 live (400ms). `sqlserver` healthcheck `(unhealthy)` carried (SA-password/volume mismatch — DB operational via app principals).
6. **SDET Acceptance-validation** — ✅ APPROVED. All 10 in-scope AC independently validated under the bound gherkin prose-bind; each scenario text ↔ test assertion confirmed (not AC-tag-sharing). First ADR-005 client-isolation HARD three-item test verified vs. the real container. Out-of-scope fence honored.
7. **SDET CI gate** — ✅ PASS. 423 tests, 0 failures, 0 lint, 0 type errors (portal unit 90/90, admin unit 142/142, `@tax-portal/db` 92/92 incl. the real-container RLS/persistence suites, esign 24/24, portal e2e 33/33, admin e2e 32/32, cross-app 10/10). Quality audit CLEAN (5/5 blocking-gap checks pass).
8. **Post-merge CI** — pending (Close-finalize).
9. **Post-merge staging smoke** — N/A (`Brief-deploys: no`, ADR-007).

## What shipped (net-new platform capabilities)

- **First client-owned rows + first client-isolation security policy.** `Engagement` (+ discrete onboarding-state columns) and `LetterTemplate` entities (Prisma Track A migration `20260618124735`); `db/policies/0005-engagement-policy.sql` adds the live CLIENT-ownership branch the prior policies (`0001`/`0004`) only stubbed — `sec.fn_engagement_access` ITVF+SCHEMABINDING, FILTER + 4 BLOCK predicates, three-branch resolution (admin / ACCOUNTANT / CLIENT-ownership via `clerk_user_id`→`User`→`Engagement.clientUserId`), null SESSION_CONTEXT → ZERO. **HARD tier-3 three-item evidence** (`engagement.client-isolation.rls.test.ts`): CLIENT-A≠CLIENT-B, anon=ZERO, ACCOUNTANT=all + a cross-client BLOCK write proof (rowsAffected=0).
- **First e-sign provider seam — `packages/esign`.** Port + deterministic mock binding + deferred Docuseal stub (throws at call-time) + a **fail-closed, real-default selector** keyed on `ESIGN_PROVIDER`, mock selectable only via `ALLOW_MOCK_ESIGN` (NOT `NODE_ENV` — the BUG-002-001 generalization); contradiction + unknown-value throws. Onboarding depends only on the port.
- **Request-pool BLOCK-governed client write.** `recordLetterSignatureAsClient` sets `SESSION_CONTEXT` in-batch with the UPDATE so the `sec.pol_Engagement` BLOCK predicate evaluates at the write boundary; fail-closed audit — no audit row on `rowsAffected=0`.
- **Server-side onboarding gate** (`packages/db/src/onboarding.ts`): step accessibility derived from `letterSignedAt` + the fixed 3-step order; locked steps **refused** (`StepRefusal`), not merely hidden.
- **Editable default letter template** (`apps/admin`) + the cross-surface edit→sign loop (admin edit → portal render → client signs the snapshot).

## Retro finding classification (per ENGINE.md § Retro Finding Classification)

The promotion bar is a **concrete quality-gate failure**. **Zero findings cleared it** — there were no gate
failures this slice (no SDET rejections, no smoke fail, no CI red, audit CLEAN). Everything below is an
**observation** (no rule change, no promoted action item) except the two comment-drift carries, which are
recorded as an explicit `ungated-fix` because they are now being applied at this Close-prep.

**`ungated-fix` (folded at this Close-prep — comment-text-only in gated-path files):**
1. **[doc-drift — Audit Obs 3] `packages/db/src/repositories/engagement.ts` ~L473** — the comment "Use
   parameterised inputs for the data fields (prevents injection)" is misleading: the SQL string-interpolates
   the values (single-quote-escaped), it does **not** use mssql `.input()` parameterisation. Code is sound —
   the values are server-derived (clerkUserId/role from the verified session, engagementId resolved
   server-side) and single-quote-escaped, and the BLOCK/FILTER policy is the real authorization fence — but the
   comment misstates the mechanism. **Corrected** to describe the actual single-quote-escaped
   server-derived-values argument.
2. **[doc-drift — Audit Obs 2] `packages/db/src/service.rls.test.ts` ~L71/~L88** — the `@read_only = 1` /
   "ADR-003 §4 pool hygiene" comments are factually wrong since **BUG-002-003 / ADR-003 Amendment 1** dropped
   `@read_only`. This is the **4th carry** (RETRO-002 Obs 3 → RETRO-003 item 3 → carried at BRIEF-005 Plan →
   now). **Corrected** at this Close-prep. The aging carry is itself a process lesson: a comment-only doc-drift
   item that "rides the next `packages/db` task" will keep being deferred when the next task's developer is
   scoped to their own work — it needs an explicit owner, which Close-prep now is.

   **Disposition (SDET-reviews-all-IO-code rule):** both are **comment-text-only edits in gated-path files**,
   no code/behavior change, no test affected. Per PHASES.md / the prior RETRO-002-Obs-3 disposition, folding a
   full micro-dispatch (developer → submission gate → SDET review → re-archive) through the pipeline to fix
   three comment lines is **disproportionate**. I judged a micro-dispatch unwarranted and recorded that
   disposition explicitly. The actual edits are handed to the **main session** (git + gated-path edits are
   main-session-owned); they ride the slice PR and fall under the `/pr-review` panel's eyes at the reviewed
   lane — i.e. they still get an independent review pass before merge, satisfying the spirit of
   SDET-reviews-all-IO-code without a disproportionate in-pipeline round-trip.

**`acknowledged` / observations (no action item):**
3. **[metric-integrity — Audit Obs 1] Synthetic `Completed-at` timestamp inversion.** TASK-005-001/-002/-003/
   -004 carry `Completed-at` (08:15–09:16Z) **before** `Started-at` (12:45–14:00Z) — synthetic/sentinel
   `Completed-at` values; -005/-006/-007/-008 are forward-ordered. No gate failed (all metadata present + valid,
   `Complexity-actual` ∈ 1–5); cycle-time metrics for those 4 will show negative elapsed. **5th occurrence of
   the clock-source family** (RETRO-002 Obs 2, RETRO-003 item 2). Lesson unchanged: the Dispatch-Checkpoint
   `Started-at`/SDET `Completed-at` should capture a real, consistent clock value. Observation only — not
   promoted (no quality-gate failure).
4. **[doc-drift — Validate quality-audit observation] `inventory.md` Track-B drift.** The operations
   `inventory.md` Track-B table omits `db/policies/0004-notification-policy.sql` (EPIC-003) and
   `0005-engagement-policy.sql` (EPIC-005), and does not enumerate the `Engagement`/`LetterTemplate` entities.
   The DevOps CLAUDE.md trigger (Dockerfile/topology/secret/env/principal-split) was satisfied (TASK-005-002
   documented `ESIGN_PROVIDER`/`ALLOW_MOCK_ESIGN`); schema/policy listings are not strictly trigger-required,
   so this is drift from the "authoritative inventory" intent, not a gate failure. **Carry-forward:** extend the
   Track-B table to enumerate all policy files + the new entities at the next infra/`packages/db` task that
   touches `inventory.md`. Observation — not promoted.

## Rule sunset (ENGINE.md § Rule Sunset, CLAUDE.md § Platform-frontend scope)

- **Cross-surface-parity rule (CLAUDE.md § Platform-frontend scope) — SUNSET TRIGGER REACHED.** This is the
  **3rd consecutive zero-cross-surface-parity-finding Close-prep** (EPIC-003 found parity work and validated it;
  EPIC-004's cross-app suite passed clean; EPIC-005 genuinely exercised both surfaces — admin template-edit +
  portal sign→unlock + the cross-app edit→sign loop — with **zero parity findings**). Per the CLAUDE.md sunset
  trigger ("if 3 consecutive Close-prep retros pass with zero cross-surface-parity findings, Overwatch flags
  this rule for keep/remove review"), **the rule is surfaced for keep/remove review.** **IO recommendation:
  KEEP.** The rule has zero findings precisely *because* it forces both-surface validation up front (the
  cross-app edit→sign loop is a direct product of the rule) — removing it would remove the discipline that
  produces the zero findings; the cost (defaulting audits/e2e to both surfaces) is low and the platform is
  still actively growing two-surface features (EPIC-006/007/008 ahead). The user/Overwatch makes the final
  keep/remove call.
- **Autonomy Ceiling item 2 `--no-verify` clause — KEEP.** Not triggered again this slice (no commit bypass
  attempted), but it is a prophylactic guard against an irreversible bad-commit class; low cost to retain.
  Carried sunset candidate from EPIC-002/003 — **IO recommendation: KEEP** (prophylactic, cheap).
- **`PushNotification` spam-loop guard — KEEP.** Not triggered (no notification fired this slice). Prophylactic
  against alert-fatigue / notification-handler recursion; cheap to retain. Carried sunset candidate — **IO
  recommendation: KEEP.**

## Carry-forward to next slice (Phase 2 — EPIC-006 intake questionnaire)

- **Infra (root family, carried):** clean-volume DB bootstrap + `sqlserver` healthcheck SA-password-vs-volume
  mismatch + `migrate deploy` P3019 + the Prisma OpenSSL detection warning (BUG-002-002 family — containers
  function despite it). Non-blocking; resurfaces on a `down -v` rebuild.
- **`sp_set_session_context` CI grep-guard** (panel-dispositioned, carried).
- **[doc-drift — RESOLVED this slice]** `service.rls.test.ts` + `engagement.ts` comment-drift (folded at this
  Close-prep — see `ungated-fix` 1+2). No longer carried.
- **[doc-drift] `inventory.md` Track-B table** — enumerate all policy files + `Engagement`/`LetterTemplate`
  entities at the next infra/`packages/db` task (Obs 4).
- **[metric-integrity] Synthetic `Completed-at`/`Started-at` clock source** — 5th occurrence; capture real
  consistent clock values (Obs 3).
- **REQ-AUTH-003 feature AC (AC-AUTH-003-01..03)** — the isolation *mechanism* + its per-policy test landed
  here; the feature AC remain Phase-3-owned. Flagged for the next planning run.
- **Real Docuseal e-sign enablement slice** (ADR-024 §5) — real binding + verified/idempotent completion
  callback + reconciliation + encrypted signed-document storage; re-validate ONBD-002 against the live provider.
- EPIC-001 `fn_service_access` CLIENT read-branch tightening (carried); `personas/jane-accountant.md` v2
  "solo, no staff" update when multi-accountant is phased; AC-AUTH-010-02 demo `ADMIN_APP_URL` env mismatch.
