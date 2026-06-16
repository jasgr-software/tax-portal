# RETRO-002 — BRIEF-002 Accountant manages the services catalog (admin CRUD + accountant-only write boundary)

> Slice retrospective + the 9-gate scorecard for BRIEF-002. Written at Close-prep; a `## Post-Merge Addendum`
> (gates 8/9) is appended at Close-finalize. Retro promotion bar per `ENGINE.md` § Retro Finding Classification:
> only a **concrete quality-gate failure** earns an action item; everything else stays an observation.

## Slice summary

- **Brief:** BRIEF-002 — Accountant manages the services catalog: admin CRUD (add / edit / deactivate) +
  accountant-only write boundary. Closes the *authoring* loop behind EPIC-001's public *read* catalog.
- **Branch:** `brief-002-services-catalog-management` (cut from `main`@`c87b5bd`; 9 commits
  `c500053`→`b87cd95`). **PR:** opened by the main session at Close-prep.
- **Type:** feature · **Deploys:** no (production platform deferred, ADR-007 → gate 9 N/A).
- **Tasks:** 5 done (TASK-002-001/-002/-003/-004/-005). **Bugs:** 4 done (BUG-002-001/-002/-003/-004) — all
  SDET-approved, all ride this slice's PR.
- **Outcome:** all 7 in-scope acceptance criteria satisfied with AC-id-tagged tests at the brief's prescribed
  tiers (tier-3 RLS write boundary + tier-3 persistence + tier-6 admin e2e + the cross-surface loop). Primary
  risk closed: EPIC-001's latent write-predicate gap (CLIENT passed the BLOCK predicate) is fixed via a
  separate `fn_service_write_access` predicate with a counterfactual-backed tier-3 RLS gate.

## 9-gate scorecard

| # | Gate | Status | Evidence |
| - | ---- | ------ | -------- |
| 1 | Per-task submission gates (5/5) | PASS | lint/type-check/build/test green per task Work Log; e2e green for the e2e-required tasks (-004, -005) against the mock-provider docker-compose stack. |
| 2 | SDET Review (5/5 approved) | PASS | TASK-002-001/-002/-003/-004/-005 each independently re-executed + approved by the SDET; every Mandatory Quality Gate box ticked; `Complexity-actual` + `Completed-at` populated on all. |
| 3 | Overwatch Audit | PASS | Read-only sweep 2026-06-16: 0 blocking / 1 advisory (TASK-002-001 timestamp inversion — IO-corrected to 07:01:42Z) / observations recorded (Obs 2–5 below). Primary-risk ADR-003/-005 path CLEAN. |
| 4 | IO Design scan | PASS | Integrated-diff scan of `git diff main..HEAD`: ADR-003 (request-scoped `$extends` SESSION_CONTEXT, post-Amendment-1), ADR-005 (Service policy is the write boundary; UI is not), ADR-006 (catalog management admin-only) all honored at the diff level; the write-predicate split realizes ADR-005's existing mandate (no new architectural choice); zero violations; no fix-forward task. |
| 5 | Container Smoke gate | **CONDITIONAL PASS (UI PASS / Infra cond-pass; CI-as-gate substitution carried)** | UI PASS: admin `:13001/healthz` + portal `:3000/healthz` 200; admin `/services` 200 under mock auth (`<title>Services Catalog \| Tax Portal</title>`); unauth `/services` → 307 sign-in; BUG-002-002 musl-engine fix confirmed in-container. Infra CONDITIONAL PASS: admin/portal/azurite/mailhog `(healthy)`; SQL reachable + all ADR-005 DB objects present (`sec.fn_service_write_access`; `pol_Service` 4 BLOCK→write + 1 FILTER→read; `taxportal_user`). **Caveats:** clean-volume `down -v` intentionally skipped (carried P3019/`prisma db push` bootstrap fragility); `sqlserver (unhealthy)` = healthcheck SA-password-vs-volume mismatch (DB operational via app principals, NOT a regression). The **user (governance authority) accepted CI as the gate** in place of the env-blocked clean-volume local Smoke — same basis EPIC-001/004 shipped on; **auto-merge condition (d) "Container Smoke pass" is satisfied by this conditional-pass + the CI-as-gate decision.** |
| 6 | SDET Acceptance-validation gate | PASS | 7/7 in-scope ACs traced to AC-id-tagged tests at prescribed tiers (HANDOFF-002 table); tier-3 16/16 + tier-6 17/17 re-executed against the running stack; gherkin `.feature` mirror present, 7 scenarios, no drift; dual-tagging (DOOR+DASH) consistent; cross-surface loop correctly tagged AC-DOOR-002-03 (not AC-DOOR-002-04); skeptical-lens counterfactuals verified (tests red if behavior regresses). |
| 7 | SDET CI gate | PASS (required-CI-equivalent green) | `pnpm -r test` 229/229 (auth 124, db 41, admin 41, portal 23 incl. rate-limit 7/7); `pnpm lint` exit 0; `pnpm type-check` exit 0; `pnpm audit --audit-level=high` exit 0 (1 moderate, below threshold). No PR open at Close-prep — GitHub required-CI green confirmed by the Conductor post-Close-prep. |
| 8 | Post-merge CI | PENDING | Verified at Close-finalize against the merged head commit. |
| 9 | Post-merge staging smoke | N/A | Brief-deploys: no (ADR-007). |

**Conductor Validate hand-off evidence string:** required-CI-equivalent green locally on
`brief-002-services-catalog-management` (`pnpm -r test` 229/229 + lint + type-check + `audit --audit-level=high`
exit 0); GitHub required-CI (`lint-and-typecheck` + `security-scan`) green confirmed by the Conductor at PR
open. AC→test-tag→tier table location: `HANDOFF-002.md` § AC → test-tag → tier → owning-task → evidence.

## AC → test-tag → tier traceability (7/7)

| AC | Prescribed tier(s) | Covering test (AC-id-tagged) | Owning task | Tier verified |
| -- | ------------------ | ---------------------------- | ----------- | ------------- |
| AC-DOOR-002-05 | int (3) write boundary | `packages/db/src/service.rls.test.ts` `[AC-DOOR-002-05]` (10/10; CLIENT + null-context rejected; counterfactual inline) | TASK-002-001 | 3 + 6 |
| AC-DOOR-002-01 | int (3) persistence | `packages/db/src/service.persistence.test.ts` `[AC-DOOR-002-01]` (4/4) | TASK-002-002 | 3 + 6 |
| AC-DOOR-002-02 | int (3) persistence | same file `[AC-DOOR-002-02]` | TASK-002-002 | 3 + 6 |
| AC-DOOR-002-03 | int (3) persistence | same file `[AC-DOOR-002-03]` (active=false, not DELETE) | TASK-002-002 | 3 + 6 + loop |
| AC-DASH-010-01 | e2e (6) | `apps/admin/e2e/specs/services-catalog.spec.ts` `[AC-DOOR-002-01][AC-DASH-010-01]` test 13 | TASK-002-004 | 6 |
| AC-DASH-010-02 | e2e (6) | same `[AC-DOOR-002-02][AC-DASH-010-02]` test 14 | TASK-002-004 | 6 |
| AC-DASH-010-03 | e2e (6) | same `[AC-DOOR-002-03][AC-DASH-010-03]` test 15 | TASK-002-004 | 6 |

**Cross-surface loop (evidence only, AC-DOOR-002-03):** `services-catalog-cross-surface.spec.ts` test 12 —
deactivated-in-admin service absent from the portal public page. Paired with EPIC-001's AC-DOOR-002-04 (NOT
claimed here).

## Retro findings (classified)

Promotion bar = concrete quality-gate failure only.

### (a) Headline — the 4-defect container chain (all `acknowledged`, resolved this slice)

EPIC-002 is the **first slice to run the request-scoped Prisma path in a real container**. Its first real
container e2e surfaced a chain of **4 latent EPIC-001/004 defects**, all previously hidden because the
container smoke in EPIC-001/004 was env-blocked (never actually ran a Prisma-backed container page or a
cross-request pooled connection):

1. **BUG-002-001** — auth fail-closed guard blocked the mock provider in any prod-built container (guard keyed
   on `NODE_ENV` instead of `ALLOW_MOCK_AUTH`). Latent from EPIC-004. Fix-forward, SDET APPROVED. `fc32fdd`.
2. **BUG-002-002** — Prisma query-engine musl/OpenSSL-3 binary target missing for the Alpine runner; the
   request-scoped Prisma page 500'd in-container (`libssl.so.1.1` not present). Latent from EPIC-001 (its pages
   read via the raw-`mssql` admin pool and never loaded the Prisma engine in-container). Three-layer fix, SDET
   APPROVED. `c83bd90`.
3. **BUG-002-003** — `sp_set_session_context @read_only=1` incompatible with Prisma connection pooling: once
   BUG-002-002 made the engine load, the now-working request-scoped path hit error 15664 on the first
   cross-request reuse of a pooled connection (the post-write `revalidatePath` RSC re-render 500'd). Latent from
   EPIC-004/TASK-004-007 — its 39/39 tier-3 suite masked it because `session-context.propagation.test.ts`'s
   `afterEach($disconnect)` forced a fresh connection per test, exactly the pooled-reuse path the container is
   the first to exercise. **Resolved upstream as ADR-003 Amendment 1** (drop `@read_only`; reset-on-release
   retired as undeliverable on Prisma 5.22's quaint sqlserver pool). HARD DoD: the never-implemented §4 leak
   guard now satisfied by a tier-3 pooled-reuse regression test (red-on-old-15664 / green-on-new). SDET
   APPROVED. `550a556`.
4. **BUG-002-004** — see (b) below (blast-radius miss off BUG-002-001). `b87cd95`.

**Lesson:** an env-blocked container smoke hid a *class* of container-runtime + concurrency defects across two
prior slices. The first slice to truly exercise the request-scoped Prisma path in a container paid the full
debt at once. The carried infra fix (#d) that unblocks clean-volume container smoke is the structural remedy —
until then, every new request-scoped-Prisma surface should expect to be the one that flushes a latent
container defect.

### (b) `acknowledged` — blast-radius lesson (BUG-002-004)

BUG-002-001 changed a **shared auth guard contract** (`getSecret()`: `NODE_ENV` → `ALLOW_MOCK_AUTH`). Its
submission gate was scoped to the `packages/auth` package and the admin surface; it **missed the `apps/portal`
consumer** (`sign-in-rate-limit.integration.test.ts`), which set `AUTH_PROVIDER=mock` without
`ALLOW_MOCK_AUTH=true` and was authored under the old contract. The break only surfaced at Validate when
`pnpm -r test` ran the full workspace. **Recommendation (process note, no rule change):** when a fix changes a
**shared guard or contract**, the dispatch should mandate a cross-package consumer sweep — grep for every
consumer of the changed symbol/env-var across `apps/**` + `packages/**` and run their suites before `review`,
not just the owning package's. This is the cross-surface-default rule applied to *contract* changes, not just
UI parity. Fix was minimal (2 test-lifecycle lines, all throttle assertions intact); cleared the bar as an
`acknowledged` finding.

### (c) Observations — Audit findings (below the bar; carried as observations only)

- **Obs 2 — `Started-at` midnight-sentinel placeholder.** TASK-002-003 and BUG-002-004 carry
  `2026-06-16T00:00:00Z` (a placeholder, not a real start; same pattern on several EPIC-004 tasks). In-range,
  metadata gate passed, no gate tripped. The Dispatch-Checkpoint `Started-at` write should capture a real clock
  value. (Observation — not promoted.)
- **Obs 3 — stale test-helper comments in `packages/db/src/service.rls.test.ts` (~L70–72, ~L88).** Comments say
  "real app uses `@read_only = 1`" and cite "ADR-003 §4 pool hygiene" — both factually wrong after BUG-002-003 /
  ADR-003 Amendment 1. **Comment text only; functional behavior correct.** Classified `ungated`/non-blocking
  follow-up (a comment-only doc-drift in a gated path; a full-pipeline micro-dispatch for two comment lines is
  disproportionate). Correction rides the next `packages/db` task that touches this file, or a dedicated
  doc-drift cleanup. Recorded in HANDOFF-002 follow-up #1.
- **Obs 4 — full CI (`pnpm ci:local`) not recorded in any BRIEF-002 task Work Log.** App-scoped gates were used
  throughout (correct for per-task submission). Whether Validate/slice-close should require a full `ci:local`
  run is ambiguous; the SDET CI gate at Validate is the natural home if we want one. (Observation — no gate
  failure; gate 7 ran the full `pnpm -r test` + lint + type-check + audit, which is the substantive equivalent.)

### (d) Carried infra item (single root family — bootstrap fragility)

Clean-volume DB bootstrap (carried from EPIC-004): `sa`-once login creation + Prisma port-in-authority +
`!`-free logins + the `migrate deploy` P3019 (`mssql`-vs-`sqlserver`) — why clean-volume local Smoke is
env-blocked and the CI-as-gate substitution is carried. **New manifestation this slice:** the `sqlserver`
compose healthcheck SA-password-vs-volume mismatch (`(unhealthy)` status; Error 18456 State 8; DB fully
operational via app principals, NOT a regression). Same root family — recorded as a new manifestation, not a
new class. Fix: derive the healthcheck SA password from the volume-bootstrap source (or re-assert the env SA
password on persisted volumes). HANDOFF-002 follow-ups #2 + #3.

### Rule-sunset sweep (Overwatch, per ENGINE.md § Rule Sunset)

- **Autonomy Ceiling item 2 `--no-verify` clause** — not triggered (cited, relied upon, or violated) in the
  last 3+ slices. **Sunset candidate — flagged for keep/remove review.** IO recommendation: **KEEP.** It is a
  cheap, load-bearing safety clause (a single git flag that would silently bypass the pre-push gate); its value
  is in *never* being exercised. Low maintenance cost, high blast-radius if removed. Re-evaluate only if it
  becomes an obstacle.
- **`PushNotification` spam-loop guard** — not triggered in the last 3+ slices. **Sunset candidate — flagged.**
  IO recommendation: **KEEP.** It guards a known model failure mode (notification-handler re-entry / alert
  fatigue); the cost of keeping it is one sentence in the contract, the cost of a regression is a notification
  storm. Re-evaluate if the notification surface is redesigned.
- **Platform-frontend cross-surface-parity rule (CLAUDE.md) — sunset-trigger counter.** Per CLAUDE.md: 3
  consecutive zero-cross-surface-parity-finding Close-prep retros → Overwatch flags the rule for keep/remove.
  **This slice's parity-finding status: a parity finding WAS present** — BUG-002-004 is precisely a
  cross-surface (cross-package) consumer that the single-package gate missed; the cross-surface-default
  discipline is exactly what would have caught it (see finding (b)). **The 3-consecutive-clean counter resets /
  does not advance.** Rule relied upon → **KEEP.** (Single-surface `apps/admin` *implementation* scope was the
  documented ADR-006 exception for catalog management; the parity finding is on the *contract* dimension, not
  the UI-mirror dimension.)
- No other rule flagged untriggered over the last 3 slices.

## Post-Merge Addendum

_Pending Close-finalize (gates 8 + 9)._
