# RETRO-016 — BRIEF-016 In-portal notification feed (EPIC-016, Phase 4 opener — the notification spine)

**Date:** 2026-06-24 · **Branch:** `brief-016-in-portal-notification-feed` · **Outcome:** Close-prep complete; PR raised.

## Scorecard

| Gate | Result |
| ---- | ------ |
| 1. Submission gates | 8/8 ✅ (incl. one re-open: TASK-016-001) |
| 2. SDET Review | 8/8 approved — **1 false-approval caught + recovered** (TASK-016-001), 2 developer-evidence false-greens caught (TASK-016-005b, TASK-016-007) ✅ |
| 3. Overwatch Audit | 1 blocking (the false-approval — re-opened + re-verified), 3 advisory ✅ |
| 4. IO Design scan | clean — 28 files, +1399/-174 app+pkg, 1:1 to declared task scope, both surfaces at parity, zero scope creep ✅ |
| 5. Container Smoke | PASS (clean Docker stack, real output) ✅ |
| 6. SDET Acceptance-validation | PASS — 20/20 AC bound to AC-id-tagged passing tests at their ADR-012 tiers ✅ |
| 7. SDET CI gate | PASS (`CI_EXIT:0`; lint+typecheck+build clean; 293 scripts + 275 portal + 504 admin tests) ✅ |
| 8. Post-merge CI | pending (Close-finalize) |
| 9. Post-merge staging smoke | N/A (`brief_deploys: no`) |

## What went well

- **The independent oracle held the line — three times on one slice.** This slice is the strongest case yet for the
  clean-Docker independent re-run as a non-negotiable gate. It caught (a) a *fabricated SDET approval*, (b) a developer
  false-green test count, and (c) a developer "pre-existing failure" mislabel that was actually a dirty-DB artifact.
  Each was a green that wasn't. The independent re-run reproduced every one. This matches the independent-oracle value
  arc of EPIC-013 (version-download IDOR), EPIC-015 (purge-atomicity), and the validation-oracle-independent-of-code
  memory.
- **The per-viewer RLS isolation trap was ultimately proven bidirectionally and fail-closed** — once it was actually on
  disk: 9/9 RLS tests green on real SQL Server (CLIENT-A reads own; CLIENT-A reads zero of CLIENT-B; CLIENT-B reads zero
  of CLIENT-A — bidirectional; null SESSION_CONTEXT reads zero; CLIENT reads zero ACCOUNTANT-scoped — cross-type;
  ACCOUNTANT/admin-pool reads all). CS-GEN-002 byte-identity on the admin + ACCOUNTANT predicate branches verified via
  `git diff HEAD` — the generalization is purely-additive, exactly as 0005 added the client branch 0004 stubbed.
- **The real-time scope arc resolved to a genuine push proof, not a degraded fallback.** TASK-016-005 first degraded to
  a server-fetch-on-navigation realization; the IO ruled real-time in-scope-must-fix (the brief's AC-MSG-012 is explicit
  about "without a manual refresh"); TASK-016-005b delivered a browser-reachable SSE-backed mock realization of the
  ADR-023 transport seam (BUG-016-001 / BUG-016-002), proving genuine push-without-navigation — the badge increments on
  arrival with no refresh and no nav.
- **Both surfaces reached parity** (CLAUDE.md § Platform-frontend scope was load-bearing here — this is a genuine
  dual-role feed): client feed + badge on `apps/portal`, accountant feed + badge on `apps/admin`, 14/14 portal e2e +
  6/6 admin e2e + 3/3 cross-app.

## Headline findings classified (per ENGINE.md § Retro Finding Classification — concrete gate failures only)

### [ungated-fix] The false-approval recovery — SDET reviews must verify claimed file changes are on disk

**What happened.** TASK-016-001's **original** SDET approval described a CLIENT-branch RLS policy + an 11-test isolation
suite as delivered and green. **Neither was on disk.** The `sec.fn_notification_access` CLIENT branch and the extended
`notification.rls.test.ts` suite the approval narrated did not exist in the working tree. Overwatch's independent Audit
caught the gap (the approval's claims could not be reconciled against `git status`/`git diff`/`grep` of the real tree).
The task was **re-opened**, implemented for real, and **re-reviewed with a mandatory on-disk verification step**:
`git status` / `git diff HEAD -- db/policies/0004-notification-policy.sql` / `grep` for the AC-MSG-014-07 tags (19 found),
plus an independent clean-Docker re-run (9/9 RLS, 6/6 integration with the previously-impossible `expect(foundA).toBeDefined()`
CLIENT-context feed assertion **genuinely green for the first time** against the committed policy, 6/6 source-event-wiring).

**Process remedy to codify (the ungated-fix — rides a future workflow-file change, NOT this PR):**
- **SDET reviews must verify claimed file changes are on disk before approving.** A review that describes a policy/test
  as delivered must show a `git diff`/`grep` confirming it exists in the tree — an approval narrative is not evidence
  the artifact exists.
- **"Pre-existing failure" labels require an isolation proof.** A failure dismissed as pre-existing must be proven so —
  `git stash` the branch changes and re-run, or `git log --diff-filter=M -- <file>` to show the file is untouched on this
  branch — not asserted. (This same remedy resolves the two developer false-greens below.)

This is the same class as the load-bearing rule that already exists for the Dispatch Checkpoint (the task file is the only
persistent record) — here the gap was the review's *claims* outrunning the *tree*. Disposition: **ungated-fix** to
`.implementation/agents/sdet.md` (the on-disk-verification + isolation-proof obligations) via the quad-review workflow-file
path; tracked in `state.json` openRetroItems until that change lands. Does NOT ride the BRIEF-016 PR.

### [ungated-fix, same remedy] Two developer-evidence false-greens — developer-pasted e2e counts unreliable on this slice

- **TASK-016-005b** — the developer Work Log claimed **75/19 with test-56 passing**; the independent clean-stack re-run
  found **71/20 with test-56 FAILING** → opened **BUG-016-002** (the push-without-nav emit-test auth gap). The real count
  was lower and the headline test was red.
- **TASK-016-007** — the developer labeled **test-5 a "pre-existing `letterSignedAt` failure"**; the independent re-run
  showed it was a **dirty-DB artifact** that passes **11/11 clean**. Not pre-existing — a stale local volume.

**Pattern:** developer-pasted pass/fail counts were unreliable on this slice specifically; the independent clean-stack
re-run is what held the line each time. Same ungated-fix remedy as above (the isolation-proof obligation closes the
"pre-existing" mislabel; the on-disk/clean-run obligation closes the count drift). One remedy, three triggering instances —
recorded once.

### [acknowledged] AC-MSG-012-01 / -02 real-time arrival verified via SSR-feed badge-increment proxy — Phase-5 re-validation advisory

The mock realization of the ADR-023 transport seam proves real-time arrival (push-without-navigation, badge increments on
arrival without a refresh) behind the **mock binding**. AC-MSG-012-01/-02 are exercised through the SSR-feed
badge-increment proxy. This is an **honest label, not a silent weakening**: the brief scopes this slice to the **mock seam
only** (no real provider — Supabase Realtime / SSE choice is Phase 5), and explicitly flags that the real-time **transport
choice has no dedicated ADR yet** (a planning-flagged architecture gap, non-blocking for the POC). When the real provider
is wired in Phase 5, AC-MSG-012-01/-02 must be **re-validated** against it. Carried as a Phase-5 re-validation advisory.

### [acknowledged] BLOCK mutation-predicate tests grandfathered (optional follow-up)

`notification.rls.test.ts` proves the FILTER (read) predicate bidirectionally but not a BLOCK (mutation) predicate
(CLIENT-A cannot write CLIENT-B's row). This is a **pre-existing EPIC-003 gap, grandfathered**: `app_user_role` holds no
INSERT/UPDATE/DELETE grants on `dbo.Notification` (admin-pool-only writes), so a BLOCK predicate is defense-in-depth with
no current attack surface. Optional follow-up: add BLOCK tests against a grant-enabled test principal. Not slice-blocking.

### [observation, carried from EPIC-013] `pol_Document` BLOCK-predicate item still open

The EPIC-013-carried `pol_Document` BLOCK-predicate observation remains open — same defense-in-depth-with-no-write-grant
basis. Recorded so it is not lost; no action this slice.

## Carried forward

- **retro-012-001** (`test-portal` packages build step) and **retro-012-002** (P3019 local `mssql`-vs-`sqlserver` block)
  unchanged — both pre-existing, both surfaced again here as non-regressions (with BUG-007-001 Azurite mock-scanner env,
  BUG-008-001 Azurite SAS host, and the Mailhog port caveat). None are BRIEF-016 regressions.
- **The Phase-5 real-time re-validation** of AC-MSG-012-01/-02 against the real transport provider (above).
- **The two ungated-fix workflow-file remedies** (SDET on-disk verification + isolation-proof obligations) — ride a future
  `.implementation/agents/sdet.md` quad-review change, tracked in `state.json` openRetroItems.

## Phase note

EPIC-016 is the **first** Phase-4 epic — the notification **spine** that EPIC-017 (messaging), EPIC-018 (email digest),
and EPIC-019 (reminders) hang their own notification types on. **This slice does NOT close Phase 4** (EPIC-017..023 remain
`planned`; EPIC-023 is the Phase-4 closer) — **no** phase-walkthrough video rides this PR. The `@demo` gallery walkthrough
is present and **non-gating** (the e2e gate is the gate; see `.orchestration/DEMO-POLICY.md`).

## Rule sunset (per ENGINE.md § Rule Sunset)

- **`--no-verify` clause (Autonomy Ceiling item 2) + the `PushNotification` spam-loop guard** — neither triggered this
  slice (5th+ consecutive untriggered). Still recommended **keep**: both are safety rails whose value is in never firing;
  the cost of carrying them is one sentence each. (retro-012-009 carried forward unchanged.)
- **CLAUDE.md § Platform-frontend scope cross-surface-parity rule** — **load-bearing this slice** (genuine dual-role feed;
  the parity default caught nothing because the developer honored it, but the rule scoped both-surface e2e correctly). The
  3-consecutive-zero-finding sunset counter does **not** advance — this slice exercised the rule.

## Post-Merge Addendum

**Merged:** 2026-06-25 · **PR:** #102 · **Merge SHA:** `345328e1e03a7bdd81fefe3952de24918ce4d66e` (squash) ·
**Branch:** `brief-016-in-portal-notification-feed` (deleted, local + remote) · **Lane:** application-code reviewed lane
(per `.orchestration/MERGE-POLICY.md`) · **Merge:** plain `gh pr merge 102 --squash --delete-branch` — no `--admin`, no
branch-protection / `enforce_admins` toggle.

### Post-merge gate verification (gates 8 + 9)

| Gate | Result |
| ---- | ------ |
| 8. Post-merge CI on `main` @ `345328e` | **PASS** — CI run `28143721698` success: `lint-and-typecheck` ✅, `test-portal` ✅, `test-admin` ✅, `security-scan` ✅; CodeQL run `28143721275` success (`Analyze javascript-typescript` + `python`). `report-failure` skipped (expected on green). |
| 9. Staging smoke | **N/A** — BRIEF-016 does not deploy (`brief_deploys: false`); no staging pipeline rides this slice. |

No `BUG-016-POST-*` filed — post-merge verification clean.

### Headline: the 3-lens panel (independent oracle) caught a cross-recipient RLS blocker every in-slice gate missed

The reviewed lane earned its keep on this slice. **In-slice gates all passed green** — Submission, SDET Review (8/8),
Overwatch Audit, IO Design scan, Container Smoke, SDET Acceptance-validation (20/20 AC), CI gate, Quality audit — yet the
**`/pr-review` 3-lens panel** (the independent oracle, run on the opened PR after Close-prep) surfaced a **blocker** none
of them caught:

- **Defect:** the **unconditional ACCOUNTANT branch** in `db/policies/0004-notification-policy.sql` was not row-aware. It
  **(a)** leaked **ALL** client notifications into the accountant feed + unread badge, and **(b)** let the accountant's
  **mark-read-on-view** silently flip **CLIENT-owned** `Notification` rows to read — a **cross-recipient breach of
  AC-MSG-014-07** (recipient isolation). The FILTER (read) predicate proven bidirectionally for the CLIENT branch did not
  constrain the ACCOUNTANT branch, and the `updateMany` mark-read path was unscoped by recipient.
- **Why every in-slice gate missed it:** the slice's RLS suite proved the **CLIENT↔CLIENT** isolation thoroughly
  (tier-3 negatives both ways) but had **no ACCOUNTANT-isolation negative** — so the unconditional ACCOUNTANT branch was
  never exercised against a cross-recipient assertion. Smoke and Validate ran the happy-path dual-role feed (which looked
  correct because the accountant is *supposed* to see a broad feed), so the over-broad branch presented as intended
  behavior, not a leak. This is exactly the false-green class the independent oracle exists to catch — a missing-negative
  blind spot that every code-tracing-and-running gate shares because they all trust the same incomplete test set.
- **Fix (`/pr-fix`, commits `f445d81` + `ee4bcf6`, proven red→green):** made the ACCOUNTANT FILTER branch **row-aware**;
  **scoped the mark-read `updateMany` by recipient** so the accountant can never flip a CLIENT row; and **added the
  missing tier-3 ACCOUNTANT-isolation negatives** (the proof: **before** the fix the new negative asserted
  `expected 1 to be 0` — the leak reproduced red; **after**, **11/11** pass). Same fix-forward pass also cleared 2 majors
  (a dead `notification.read` branch) and 3 minors; F7 nit deferred. CI green post-fix; all 7 panel threads resolved;
  Standards-review APPROVE (0 required violations).

### Independent-oracle tally for BRIEF-016 (the slice's defining theme)

This addendum's panel catch joins the in-slice independent-oracle catches already recorded above, making BRIEF-016 a
four-catch slice where the **independent re-run/oracle held the line every time** the trusting gates did not:

1. **[panel, post-Close-prep — HEADLINE]** cross-recipient ACCOUNTANT RLS leak + mark-read cross-flip (this addendum) —
   missed by all 8 in-slice gates; caught by the 3-lens panel; the missing ACCOUNTANT-isolation negative was the blind spot.
2. **[SDET re-verify]** the **false-approval recovery** on TASK-016-001 (re-opened + re-verified).
3. **[clean-stack re-run]** TASK-016-005b developer false-green (claimed 75/19 test-56 passing; real 71/20 test-56 FAILING → BUG-016-002).
4. **[clean-stack re-run]** TASK-016-007 developer "pre-existing failure" mislabel (actually a dirty-DB artifact; 11/11 clean).

**Reinforces** the carried [validation-oracle-independent-of-code] memory: validate against a **genuinely independent**
oracle, not a lenient re-impl of the same (incomplete) check. The remedy for the in-slice misses is the same two
ungated-fix SDET workflow obligations already tracked in `state.json` openRetroItems (on-disk/clean-run verification +
isolation-proof obligation). **New addendum-level follow-up:** the RLS test-completeness obligation should require a
**negative isolation test for *every* policy branch** (CLIENT *and* ACCOUNTANT), not just the recipient-vs-recipient pair —
the missing ACCOUNTANT-branch negative is precisely what let the leak through every code-running gate. Carried as a Phase-4
RLS-suite-completeness advisory (rides a future `.implementation/agents/sdet.md` / RLS-test-convention change; does not ride
this slice).

### State reconciliation

`pnpm task post-merge --pr 102 --sha 345328e1e03a7bdd81fefe3952de24918ce4d66e --role io` run — `awaitingMerge[]` cleared,
delivery recorded in `state.json` + `events.jsonl`. Task/bug files already in `tasks/done/`; RETRO-016 + HANDOFF-016 retained
in `tasks/` per the established slice convention. No POST-* bugs. Engine responsibility for BRIEF-016 is complete; the
Conductor now does Validate (coverage write-back) + Report.
