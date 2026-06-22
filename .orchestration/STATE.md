# Conductor State — run ledger

> **Single source of truth for a Conductor run.** The Conductor reads this first on every `/orchestrate` and
> updates it at every phase transition. A fresh run with a mid-flight `## Current run` **resumes** at the
> recorded phase rather than re-selecting. See `ENGINE.md` § State-ledger contract.
>
> **Bounded-ledger rule (Increment 2 — NORTH-STAR conclusion #7).** This file holds **bounded hot-state only**:
> the active run in full, plus one line per prior run under `## Recent outcomes`. A run's full narrative is **not**
> retained here on close — it is durable in git history, the merged PR, `.planning/ROADMAP.md` + `COVERAGE.md`,
> and the per-epic `RETRO-NNN` / `HANDOFF-NNN` artifacts under `.implementation/tasks/`. Collapsing a closed run
> to a one-line pointer is **de-duplication, not loss** (`git log -p .orchestration/STATE.md` recovers any prior
> prose). A prose-accreting ledger is conclusion #7 failing — the engine hoarding conclusions instead of trusting
> sources. See `AGENT.md` § Bounded-ledger rule + § Phase-boundary cold-start.

## Current run

_No active run._ **EPIC-010 delivered + validated 2026-06-22** (run closed → collapsed to `## Recent outcomes`). Phase 3 progress: **EPIC-009 + EPIC-010 delivered; EPIC-011..015 `planned`**. Next ready: **EPIC-011** and **EPIC-012** (both `depends_on: EPIC-010` ✅; EPIC-012 also EPIC-002 ✅/EPIC-003 ✅). Re-invoke `/orchestrate EPIC-011` (or `/orchestrate` to auto-select). See `## Pending closeout follow-ups`.

## Pending closeout follow-ups

> Non-blocking; do not gate the next slice. Tracked here so they are not lost when the run collapsed.

- **[Phase-2 walkthrough video — DEFERRED, needs two follow-ups]** The Phase-2 closeout video
  (`DEMO-POLICY.md` § Part B; `docs/demos/phase-2/`) was **not produced** this run. Blockers: (1) the
  `apps/admin/e2e/demo/phase-2-walkthrough.demo.spec.ts` **`@video` spec was never authored** — it is
  application code that should have ridden the phase-completing slice's PR (#55) but did not; the Conductor
  cannot author application code (only an engine task can). (2) **BUG-008-001** (Azurite SAS-URL
  host-unreachable from the host Playwright browser) would break the document-upload scene of a full Phase-2
  walkthrough even once the spec exists. **The video is non-gating** (DEMO-POLICY: "Neither is ever a gate") —
  Phase 2 is delivered regardless. **Resume:** commission an engine slice to author the `@video` spec + fix/work
  around BUG-008-001, then run `pnpm --filter admin e2e:video` + `node scripts/make-phase-video.mjs 2`, eyeball,
  write `docs/demos/phase-2/README.md`, and ship it via a docs-lane PR.
- **[C4 drift triage — DEFERRED, user-directed 2026-06-19]** triage the four C4 backfill as-built-vs-ADR drifts
  (commit `9900d6a`) with `/planning` + `/architecture` — esp. the ADR-005/009/010 schema-lag (table-set ahead
  of `prisma/schema.prisma`). Not slice-blocking; a Phase-2-wrap-up task.
- **[Cross-surface-parity sunset counter TRIPPED 3-of-3 — needs user/Overwatch ratification]** RETRO-009 recorded
  the third consecutive clean cross-surface-parity pass (CLAUDE.md § Platform-frontend scope sunset trigger). The
  rule's keep/remove review is now due. RETRO-009 recommends **KEEP** (the admin-lane mirror in EPIC-009 was a real
  parity obligation, not a no-op). **Resume:** ratify keep-or-remove with the user/Overwatch; if KEEP, reset the
  counter annotation; if REMOVE, strike the rule from CLAUDE.md § Platform-frontend scope. Non-gating.
- **[Dev-lane shared-component / manifest single-source-of-truth — DEFERRED, tracked in RETRO-009]** the two dev-lane
  demo-account manifests + the two `DevBannerClient` components are duplicated byte-for-byte across `apps/portal` +
  `apps/admin` (two separate Next builds). Durable fix = one shared `packages/*` manifest + presentational component
  sourced from the demo seed (NOT a cross-app import). The `/pr-review` `DevBannerClient`-dup thread was resolved on
  PR #71 with this deferral documented. **Resume:** fold into a future seed/shared-`packages` task. Non-gating.

## Recent outcomes

> One line per delivered run, newest first. Full detail: `.planning/ROADMAP.md` + `COVERAGE.md` (per-AC), the
> merged PR, `.implementation/tasks/RETRO-NNN.md` + `HANDOFF-NNN.md`, and `tasks/done/` (per-task).

- **EPIC-010** ✅ DELIVERED 2026-06-22 · PR #87 → `7afd312` · 25/25 in-scope AC · engagement lifecycle pipeline & visibility — full New→In Progress→Review→Complete (manual, server-side, audited), two-confirmation completion gate, accountant-only reopen, client-facing labels (Review hidden), + AUTH-002/003/008 feature sign-off over the reused `pol_Engagement` (incl. direct-reference proof). EPIC-008 auto-transition left intact. Standards `approve` (0 viol; drafted experimental CS-TS-004, unratified) → panel APPROVE (0 blocker/major; 5 minor+2 nit, all 7 deferred as tracked follow-ups + threads resolved) → fix SKIP → merged on green required CI. First Phase-3 lifecycle-core slice; does NOT close Phase 3. RETRO-010/HANDOFF-010.
- **EPIC-009** ✅ DELIVERED 2026-06-21 · PR #71 → `169b09e` · 5/5 in-scope AC (vs **mock** provider) · PoC dev
  sign-in lane — REQ-AUTH-013 (sign-in/sign-out) + consolidated REQ-AUTH-010 (role-based landing); dev-only
  `(dev)/dev-sign-in/` on both surfaces + role/user switcher + global sign-out, **inert under `AUTH_PROVIDER=clerk`**
  (HARD gate, counterfactual-proven). Reviewed lane: standards `approve` → panel request-changes (1 major guard-
  predicate divergence + 5 minor + 2 nit) → `/pr-fix` `5551052` (fixed 5/6; shared fail-closed `isMockAuthSanctioned()`;
  1 minor `DevBannerClient`-dup deferred). Zero net-new schema/policy/provider seam. **Real-Clerk re-validation + 2FA
  deferred to Phase 5; does NOT advance Phase 3 proper.** RETRO-009/HANDOFF-009.
- **EPIC-008** ✅ DELIVERED 2026-06-20 · PR #55 → `7fe2872` · 8/8 AC · onboarding completion — gate close →
  automatic New→In Progress (the single automatic lifecycle transition) → accountant-only notification; **ZERO
  schema migration** (behavior over existing shapes). **🎉 Phase-2 capstone — closes Phase 2 (the onboarding
  gate: EPIC-005/006/007/008); 44/44 Phase-2 AC, 95/95 Phase-1+2 AC verified.** Panel APPROVE (0 blocker/major;
  7 threads dispositioned+resolved). BUG-008-001 (Azurite infra) stays OPEN. Phase-2 video deferred (see Pending).
  RETRO-008/HANDOFF-008.
- **EPIC-007** ✅ DELIVERED 2026-06-19 · PR #52 → `eaa5875` (close-out #53 → `d49c984`) · 19/19 AC · initial
  document upload — first secure malware-scanned, non-public file-storage path; `FileStorage`+`FileScanner` ports;
  third client-isolation policy `0007`. Panel found+fixed 2 majors (headline: `completeUpload` cross-tenant gap).
- **EPIC-006** ✅ DELIVERED 2026-06-18 · PR #50 → `e55f8c5` · 7/7 AC · intake questionnaire — per-service-type
  templates; second client-isolation policy `0006`. Gate caught the EPIC-002 `status`-scalar drift (fixed upstream).
- **EPIC-005** ✅ DELIVERED 2026-06-18 · PR #48 → `f879da2` · 10/10 AC · onboarding spine + engagement-letter
  e-sign gate — first client-owned rows + first client-isolation policy `pol_Engagement`; `packages/esign` seam.
- **EPIC-003** ✅ DELIVERED 2026-06-17 · PR #42 → `ec151cb` · 20/20 AC · accountant request inbox — **🎉 Phase 1 /
  MVP complete (51/51 AC).** Notification spine + `0004` accountant-only read policy.
- **EPIC-002** ✅ DELIVERED 2026-06-16 · PR #40 → `70ea10e` · 7/7 AC · accountant services-catalog CRUD.
- **EPIC-004** ✅ DELIVERED 2026-06-16 · PR #38 → `0444551` · 11/15 in-scope AC (4 2FA deferred) · auth +
  two-role model (ACCOUNTANT/CLIENT), invitation-only clients, role-based cross-app redirect.
- **EPIC-001** ✅ DELIVERED 2026-06-15 · PR #35 → `f7f6c9d` · 13/13 AC · public front door (browse active
  services + submit an engagement request, anonymous).

---

*Prior verbose run-ledger prose (EPIC-001..007 full narratives) was collapsed into the one-liners above on
2026-06-19 under the Increment-2 bounded-ledger rule. Recover any of it via `git log -p .orchestration/STATE.md`.*
