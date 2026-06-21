# RETRO-009 — BRIEF-009 / EPIC-009 (PoC dev sign-in lane — sign-in/sign-out capability + consolidated role-based landing)

**Slice:** a **dev-capacity slice (5 in-scope AC), no net-new infrastructure.** Realizes the
**sign-in/sign-out capability** (REQ-AUTH-013, new this slice, against the `AUTH_PROVIDER=mock` seam) via a usable
in-browser **dev sign-in lane** (seeded-account picker → one-click **server-set-role** sign-in → role-appropriate
landing) + an in-app **role/user switcher + global sign-out**, across both surfaces, **inert under the real
provider**; and **consolidates** the **role-based landing** (REQ-AUTH-010, whose redirect *mechanism* EPIC-004
already delivered + verified) under EPIC-009. **Key property: ZERO net-new infrastructure** — no entity, no
schema migration, no RLS policy, no provider seam, no docker-compose/env change; **UI + behavior over the existing
mock seam** (the substantive risk surface is the HARD inert-under-real-binding security guard + the server-set-role
property, not data infrastructure). Branch `brief-009-sign-in-lane` → **PR (pending)** (`## Awaiting PR merge`).
**Brief-type:** feature · **Brief-deploys:** no.

## AC satisfied (5/5) + proof tier

| AC | Proof tier | Verdict |
|---|---|---|
| **AC-AUTH-013-01** — sign-in → role-appropriate landing | tier-6 e2e (both apps) + tier-2/3 server-set-role | ✅ portal CLIENT→portal, admin ACCOUNTANT→admin; role server-resolved (ADR-005) |
| **AC-AUTH-013-02** — sign-out → unauthenticated, global | tier-6 e2e (both apps) + tier-2/3 | ✅ `__mock_session` cleared (max-age=0) → re-auth required on EITHER surface (GLOBAL, ADR-010) |
| **AC-AUTH-010-01** — CLIENT → admin ⇒ bounced to portal | tier-6 cross-app + tier-2/3 unit | ✅ kept + green under EPIC-009 ownership; mechanism NOT rebuilt (EPIC-004) |
| **AC-AUTH-010-02** — ACCOUNTANT → client-only ⇒ bounced to admin | tier-6 cross-app + tier-2/3 unit | ✅ kept + green; not rebuilt |
| **AC-AUTH-010-03** — public client routes reachable any role | tier-6 cross-app + tier-2/3 unit | ✅ kept + green; `/dev-sign-in` added to `PORTAL_PUBLIC_PATHS` does NOT trigger a role redirect |

**Dev-acceptance (NOT product AC):** role/user switcher re-lands correctly (both directions, both surfaces);
**inert-under-`AUTH_PROVIDER=clerk` guard** (the HARD security `extra_gate`) — lane 404s + no mock session
establishable under `clerk`, proven at the action layer with a demonstrated counterfactual.

## 9-gate scorecard (pre-merge)

1. **Per-task submission gates** — ✅ 5/5 (every developer Work Log carries lint/type-check/build/test evidence;
   targeted e2e where mandated). TASK-009-003 is `Introduces-gate: yes` (the HARD inert-under-`clerk` gate) and
   carries the **three-item Gate-Authoring evidence** — run/log marker + named code path (`actions.ts:112`
   `if (!isMockActive())`) + a **demonstrated** counterfactual (neutralize the guard → 3 inert-guard tests RED
   under `AUTH_PROVIDER=clerk` → restore → 219/219 green). Not asserted — demonstrated on the real action path.
2. **SDET Review** — ✅ 5/5 tasks approved. **Zero in-slice rejections.** One SDET advisory at TASK-009-001 (the
   accountant-seed precondition) was HOMED into TASK-009-004 as a DO-FIRST precondition, not a rejection.
3. **Overwatch / IO Audit** — ✅ **CLEAN, 0 blocking** → no fix task. **Cross-surface parity CLEAN** — both
   `apps/portal` and `apps/admin` dev lanes/switchers/sign-out exercised; the admin-local mirror RULED legitimate
   CS-TS-003 parity (App-Router two-apps constraint requires a per-app realization), NOT scope creep / a parallel
   mechanism (same shared `@tax-portal/auth` seam, same `__mock_session` cookie, same secret).
4. **IO Design scan / consistency gate** — ✅ PASS, **no drift.** The integrated `git diff main...HEAD` (committed
   TASK-009-004 e2e/seed + working-tree TASK-009-001/002/003/005 lane source) composes into ONE coherent working
   lane: shared seam (not forked), inert guard at page + action layer on both surfaces, server-set-role honored,
   `/dev-sign-in` additive to `PORTAL_PUBLIC_PATHS`, redirect specs additive (+58/-0), governing-key citations
   intact in every new file, no debug leftovers / `.only` / TODO/FIXME, no dead code. All 5 AC mapped. **0
   fix-forward tasks.**
5. **Container Smoke** — ✅ PASS (live docker-compose stack; in-scope auth e2e green on the real containers —
   confirmed at the TASK-009-004 gate's independent re-run).
6. **SDET Acceptance-validation** — ✅ all **5 in-scope AC** validated under the bound **gherkin** prose-bind at
   their ADR-012 tiers. Independent e2e re-run on the live stack: portal `sign-in-lane.spec.ts` 6/6, admin
   `sign-in-lane.spec.ts` 5/5, `cross-app-redirect.spec.ts` 5/5. The HARD inert guard + server-set-role property
   independently confirmed. 15 full-suite failures confirmed byte-identical to `main` (pre-existing BUG-008-001
   Azurite + Mailhog infra) — none auth/redirect/sign-in.
7. **SDET CI gate** — ✅ per-task gates green (lint/type-check/build/unit on both apps). Full PR CI runs on the
   Conductor's push (reviewed lane); required checks = `lint-and-typecheck` + `security-scan`.
8. **Post-merge CI** — pending (Close-finalize).
9. **Post-merge staging smoke** — **N/A** (`Brief-deploys: no`, ADR-007 — production platform deferred).

## What shipped

See **HANDOFF-009 § What shipped** for the full enumeration. Headline: an **end-to-end sign-in/sign-out
capability for the PoC, demoable as either role**, delivered as **UI + behavior over the existing
`AUTH_PROVIDER=mock` seam with ZERO net-new infrastructure** — the dev sign-in lane (server-set-role picker), the
role/user switcher + global sign-out (both surfaces, shared cookie/seam), the HARD inert-under-`clerk` guard
(page + action layer, both surfaces), the AC-AUTH-010 consolidation (matrix not rebuilt), the additive
`seedAccountant()` precondition row, and the non-gating `docs/demos/EPIC-009/` gallery.

## Retro finding classification (per ENGINE.md § Retro Finding Classification)

The promotion bar is a **concrete quality-gate failure**. **Zero findings cleared it this slice** — no SDET
rejection, no Smoke failure, no Validate-gate failure attributable to BRIEF-009 code. Everything below is an
**observation** (no rule change, no in-PR action item) or a previously-classified off-PR `ungated-fix` that
continues to ride a future ungated change. Honest, specific, and feeding the Conductor's Validate write-back:

### Carry-forward observations (none ride this PR)

1. **Demo-manifest single-source-of-truth follow-up (`acknowledged` observation).** The two lane manifests
   (`apps/portal/src/app/(dev)/dev-sign-in/demo-accounts.ts` + the admin mirror) carry **byte-identical** account
   records — verified at the TASK-009-002 Audit by diff: the same 5 `accountId`/`clerkUserId`/`role` triples; only
   the interface/const name + header comments differ. Both files already point at `db/seed/demo/clients.ts` as the
   canonical source and flag the drift risk in a comment. **Why not bounced:** the clean DRY fix is blocked by the
   App-Router two-apps constraint (a shared route-segment module can't span two Next builds), and a cross-app
   *import* (admin importing from `apps/portal`) is itself an anti-pattern the developer correctly avoided. The
   genuinely-correct home is a **shared `packages/*` manifest fed by the demo seed** (NOT a cross-app import) —
   ride a future seed/`packages/db` task. Drift risk is real but bounded (5 stable `demo_`-prefixed ids) and would
   surface at e2e if the lists diverged. **Does NOT ride this PR.**

2. **`@demo` prior-epic PNG byte-churn — RETRO-006 item 4 recurrence (`ungated-fix`, off-PR).** The TASK-009-005
   `@demo` run re-rendered 33 prior-epic PNGs (EPIC-001..008) as a side effect of sibling `@demo` specs running in
   the same `pnpm e2e:demo` invocation — NOT a TASK-009-005 change (its own spec writes only to
   `docs/demos/EPIC-009/`; verified: 0 pre-existing demo specs modified, the churn is 33 pure-modification / 0
   adds / 0 deletes / 0 DEMO.md changes, each prior-epic dir maps 1:1 to a pre-existing sibling spec). **Reverted
   before this PR** (`git checkout -- docs/demos/EPIC-001..008`; verified only `docs/demos/EPIC-009/` remains).
   This is the **third+ recurrence** of the carried observation — durable fix per the existing item: scope each
   `@demo` spec's output dir, or split the demo run so a single-epic regen doesn't re-render siblings. **Does NOT
   ride this PR.** Recommend the Conductor weigh promoting this to an actioned `ungated-fix` if it recurs again.

3. **Recurring developer `Completed-at` clock-inversion (`ungated-fix`, off-PR — 10th+ occurrence).**
   TASK-009-003 carries `Completed-at: 2026-06-21T09:48:00Z` < `Started-at: 2026-06-21T14:32:58Z` — the developer
   wrote `Completed-at` (the SDET's atomic-close field) and the SDET did not overwrite it on that task (it DID
   overwrite TASK-009-004's). Metadata gate still passes (all four fields present + in-range, ∈ 1–5); this is a
   metric-integrity blemish, not a gate failure. The pending fix (amend `developer.md` to prohibit developer
   writes to `Completed-at`, and reinforce the SDET overwrite-on-close discipline) still rides a future ungated
   `developer.md`/close-edit change, **not this PR**.

4. **Comment-precision nit (`acknowledged` observation).** Both admin `actions.ts` (lines ~18-20, ~84-86) and the
   portal mirror describe the cookie as "domain=localhost"; the actual behavior is **host-only / no explicit
   domain attribute** (which is why clearing from either port unauthenticates both — port is ignored in cookie
   domain matching). The behavior is correct and the GLOBAL sign-out works; only the comment wording is imprecise.
   Comment-text-only; non-blocking. Rides the next task touching these files.

## Cross-surface-parity sunset counter (CLAUDE.md § Platform-frontend scope)

**3 of 3 — TRIPS THE KEEP/REMOVE REVIEW.** BRIEF-007 (first clean) → BRIEF-008 (2 of 3, both surfaces exercised)
→ **BRIEF-009 (3 of 3): a clean cross-surface-parity pass** — the admin-lane mirror was correctly delivered (the
App-Router-legal realization of CS-TS-003), both surfaces' dev lane / switcher / global sign-out / inert guard
were exercised, and the IO Audit found **zero cross-surface-parity defects** (the admin-local mirror was RULED
legitimate parity, not a finding). Per the rule: **three consecutive Close-prep retros now pass with zero
cross-surface-parity findings → Overwatch flags the "default audits/sweeps to BOTH surfaces" rule for a
keep/remove review.** **Recommendation: KEEP** — the rule is *load-bearing precisely because* it keeps passing:
this slice's correctness depended on a both-surfaces realization (a single-surface lane would have failed
CS-TS-003 and left admin un-demoable as the accountant), and the upcoming Phase-3 lifecycle slices (EPIC-010..015)
continue to span portal + admin. A zero-finding streak here is the rule *working*, not the rule being unused.
**Surfaced for the Conductor / Overwatch to ratify** (the keep/remove decision is theirs per the rule).

## Rule Sunset (ENGINE.md § Rule Sunset — rules not triggered in the last 3 slices)

Carried candidates from prior retros, re-surfaced for a keep/remove recommendation:
- **Autonomy-Ceiling item 2 `--no-verify` clause** + the **`PushNotification` spam-loop guard** — neither
  triggered in BRIEF-007/008/009. **Recommendation: KEEP** (both are safety backstops whose value is in *not*
  firing; low maintenance cost, high blast radius if removed). Surfaced for ratification.

## Carry-forward (consolidated — none ride this PR)

The demo-manifest single-source-of-truth follow-up (item 1; future shared `packages/*` manifest fed by the seed);
the `@demo` prior-epic PNG byte-churn output-scoping (item 2; RETRO-006 item 4, reverted off-PR); the developer
`Completed-at` clock-inversion `ungated-fix` (item 3; off-PR `developer.md` amendment); the "domain=localhost"
comment-precision nit (item 4); plus the standing carried infra family (BUG-008-001 Azurite SAS-URL
host-unreachable — pre-existing EPIC-007/ADR-009, its own future infra slice, **do NOT fix in BRIEF-009**; the
`sqlserver` healthcheck SA-password/volume mismatch; `scripts/smoke-test.sh` `ADMIN_URL`/SA-password defaults). The
cross-surface-parity rule keep/remove review (3-of-3 tripped) and the two Rule-Sunset keep candidates are surfaced
for Conductor/Overwatch ratification. **None ride this PR.**

## Post-Merge Addendum

_(Appended at Close-finalize after PR merge — post-merge CI run URL + green conclusion (gate 8); gate 9 N/A
`Brief-deploys: no`.)_
