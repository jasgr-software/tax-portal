# RETRO-011 — BRIEF-011 / EPIC-011 (Engagement attributes: due date, internal notes, priority flag)

**Slice:** the **second Phase-3 slice** — hangs accountant working metadata off each engagement: a per-engagement
**due date** (set + update), **accountant-only internal notes** (the security-sensitive shape), and a
**priority/flag** marker (set + clear), all surfaced/managed in `apps/admin` on the EPIC-010 workspace. **Reuses,
does not fork** the `Engagement` entity (extended additively), the accountant-only `pol_Notification`/`0004`
policy pattern (model for the new notes policy), the EPIC-003/004 audit seam, and the `packages/db`
`withRequestContext` wrapper. Branch `brief-011-engagement-attributes` → **PR (pending — `state.json`
`awaitingMerge`).** **Brief-type:** feature · **Brief-deploys:** no.

## Outcome

- **9/9 AC validated** (SDET acceptance-validation gate PASS), each AC-id-tagged at its ADR-012 tier with
  gherkin prose binding (the 9 epic scenarios + the human-readable `.feature`).
- **5/5 tasks** SDET-approved; **zero in-slice rejections.** Complexity actual 3/3/3/3/2.
- **Container smoke PASS** (docker-compose stack; portal `:3000` + admin `:13001` healthy; DB via app
  principals; SA-healthcheck cosmetic quirk `retro-012-010` non-blocking, unrelated).
- **SDET CI gate PASS** — lint + type-check + build clean; portal 231/231, admin 345/345, scripts 293/293; 14
  tier-3 integration + 5 RLS tests green against the real SQL Server.
- **SDET quality audit PASS** — no blocking findings; all `required` code standards + all cited ADR constraints
  PASS; scope discipline held (no dashboard/notification/reminder; no entity fork; no weakened upstream gate).
- **IO design scan PASS** — integrated diff honors the brief + every cited constraint; no fix-forward task.
- **IO consistency gate** (`pnpm task verify --brief 011` / `scripts/validate-gates.sh`) — **PASS, 5 files, 0
  violations** (clean on the first run — no Work-Log-wording remediation needed this slice; contrast RETRO-010
  GF-010-1).

## The load-bearing proof — notes confidentiality (proven both ways)

The security-sensitive property of the slice cleared its HARD gate exactly as the brief mandated:

- **tier-3 server-side (`engagement-note.rls.test.ts`)** — against the real SQL Server, `pol_EngagementNote`:
  ACCOUNTANT reads; **CLIENT reads ZERO** (even the owning client, via a direct-reference path); **null/anonymous
  SESSION_CONTEXT reads ZERO** (fail-closed). The policy is the accountant-only BLOCK/own-row family modeled on
  `pol_Notification`/`0004` — **not** the client-isolation `pol_Engagement` family; the predicate has **no CLIENT
  branch by design** (ADR-005 §6, CS-SQL-001, CS-SQL-003).
- **tier-6 portal negative (`engagement-note-confidentiality.spec.ts`)** — a client participant viewing the
  engagement in `apps/portal` never sees the note text. Confirmed there is **zero notes seam in `apps/portal`**
  (grep clean) — the negative is proven server-side AND at the UI, not by admin UI absence alone (AC-LIFE-008-03).

## Gate failures (concrete — the only findings that clear the retro promotion bar)

Per ENGINE.md § Retro Finding Classification, only a concrete quality-gate failure clears the bar.

**None.** Zero in-slice SDET rejections; zero gate failures across smoke / validation / CI / quality audit; the
IO consistency gate passed on the first run with no remediation. No `gated-path-fix` and no new `ungated-fix`
items are promoted from this slice.

## Advisory observations (do NOT clear the bar — observations only, no action items, no rule changes)

Carried from the SDET Validate report and the IO design scan. None is a concrete gate failure.

- **(a) `reviewer:` front-matter absent on the 5 task specs** — same IO Plan-authoring gap noted in RETRO-010
  (a). All 5 carry `impl: developer`; the SDET reviewed all 5 (developer-implemented → reviewer is SDET by
  default per PHASES.md), so no review was misrouted. **Process item:** IO should set `reviewer: sdet` at
  Decompose. *(Observation — recurrence of RETRO-010 (a); not promoted, no gate failure.)*

- **(b) `@engagementNoteId` predicate arg reserved/unused** in `sec.fn_engagement_note_access` — matches the
  ADR-005 ITVF skeleton signature; carried deliberately (documented in the policy SQL) for the shape contract,
  with an explicit in-code note that **no CLIENT branch will ever be added** (notes are permanently
  accountant-only). *(Observation — intentional design, documented; not a finding.)*

- **(c) Audit action-string namespace** — `engagement.due_date_set` / `engagement.priority_set` /
  `engagement.note_recorded` (DECISION-011-E) extend the existing `engagement.*` audit namespace consistently
  with EPIC-010's transition actions. No parallel audit path was introduced (reuses `recordAuthEvent` /
  `withAuditTransaction`). *(Observation — confirms scope discipline; not a finding.)*

## Rule Sunset (ENGINE.md § Rule Sunset — Overwatch surfaces rules not triggered in the last 3 slices)

- **Cross-surface-parity default (CLAUDE.md § Platform-frontend scope) — TRIGGERED this slice, counter resets.**
  The rule was load-bearing here: the cross-surface obligation was the **negative** (notes management lives in
  `apps/admin` only; the portal must never surface notes), and the SDET enforced it via the `apps/portal` grep +
  the tier-6 portal-negative e2e (AC-LIFE-008-03). The "3 consecutive zero-finding retros → flag for
  keep/remove" sunset counter does **not** advance — this slice produced a concrete cross-surface finding
  (the confidentiality negative). **Keep.**

- **Sunset candidates carried (`retro-012-009`)** — Autonomy Ceiling item 2 `--no-verify` clause + the
  `PushNotification` spam-loop guard: neither triggered this slice (no commit-bypass attempt, no notification
  fired). Carried; not yet at a keep/remove recommendation threshold on their own — left as the existing open
  item.

- **Removal Sweep (ENGINE.md § Removal Sweep, check 10)** — not exercised this slice (no file removals; the
  slice is purely additive). SKIP-not-FAIL behaved correctly (no diff base for removals). No action.

## Auto-merge / revert audit (ENGINE.md § Autonomy Ceiling item 3 periodic audit)

No auto-merge fired this slice (the PR is gated behind the Conductor's Standards-review → panel → fix →
resolve-threads sequence; the IO stops at PR-open + `awaitingMerge` record per the brief). **Zero post-merge
reverts** project-wide to date — the keep/demote review threshold (≥1 revert) is not met. **Keep auto-merge
checkpoint as-is.**

## Open retro items (state.json) — status this slice

No new items added. All carried `retro-012-*` / `retro-013-*` items remain as recorded; none was newly triggered
or resolved by BRIEF-011. The pending human-ratification items (`retro-012-018` CS-INFRA-005, `retro-013-003`
CS-INFRA-006) are unaffected — this slice introduced no new code-standard.

## Post-Merge Addendum (Close-finalize — 2026-06-23)

**PR #89 squash-merged to `main`** as commit `9445e36` (`9445e3645e825dfa90cd3b8b203f12a88852b189`), mergedAt
`2026-06-23T12:15:23Z`, via the reviewed lane (Lane B). Remote feature branch auto-deleted by the squash merge;
local stale branch `brief-011-engagement-attributes` force-deleted (squash merges leave the local ref unmerged
by commit identity).

### Gate 8 — post-merge CI: **PASS**
Verified on the merge commit `9445e36` (not the PR head):
- **CI** run `28025445472` — `conclusion: success`. Required checks all green: `lint-and-typecheck` ✓,
  `security-scan` ✓, `test-admin` ✓, `test-portal` ✓ (`report-failure` skipped as designed).
- **CodeQL** run `28025442436` — `success`; `Analyze (javascript-typescript)` ✓, `Analyze (python)` ✓.
- (For continuity: the cited PR-head run `28025196265` on `50116c2d` was also `success` pre-merge — the
  post-merge run on `9445e36` re-confirms green on the integrated `main`.)

### Gate 9 — staging smoke: **N/A**
`brief_deploys: no` — no staging deployment for this slice; gate 9 does not apply.

### Active post-merge bugs: **none**
Zero `BUG-011-POST-*` files created. No post-merge defects surfaced; nothing blocks finalize.

### Engine ledger reconciliation
The PR squash captured the `state.json` snapshot at `01:32Z` (`awaitingMerge: []`), which **pre-dated** the
Close-prep `merge-checkpoint` write at `01:36Z`. On the merged `main` this manifested as an empty `awaitingMerge`
with the merge-checkpoint already present in `events.jsonl`. Reconciled at Close-finalize by re-asserting the
`merge-checkpoint` (deriving the now-final squash SHA `9445e36`) and then clearing it via `post-merge --pr 89`
(PASS, no bug). `events.jsonl` now carries the full Close-prep → Close-finalize sequence:
`merge-checkpoint` → `post-merge` → `phase-transition (Close-finalize)`. **Lesson (observation, not a gate
failure):** when the Conductor commits `state.json` into the slice PR before the IO records the merge-checkpoint,
the merged snapshot lags the local hot-state; Close-finalize must re-assert+clear rather than expect a populated
`awaitingMerge`. Same one-fact-one-home discipline holds — `events.jsonl` is the durable record and was intact.

### Slice closed
`state.json`: `awaitingMerge` cleared; `currentBrief` / `currentPhase` / `currentSliceDescription` /
`currentBranch` reset to `null` (slice-level exit per PHASES.md). Task files already archived to `tasks/done/`
(committed in the PR). **EPIC-011 / BRIEF-011 is DONE** — all 9 AC delivered and merged; ready for the
Conductor's `/planning` Validate write-back into `COVERAGE.md`.
