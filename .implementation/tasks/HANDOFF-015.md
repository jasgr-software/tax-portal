# HANDOFF-015 — BRIEF-015 Post-retention purge & legal hold (EPIC-015, Phase 3 — closing slice)

**Slice:** The destructive end of the document lifecycle — once an engagement's 7-year retention window has
elapsed and no legal hold is active, the accountant (and only the accountant, with an explicit confirmation,
never automatically) may permanently purge its document data; a legal hold suspends purge eligibility
indefinitely until lifted; the purge audit record survives the purge. **Closes Phase 3.**
**Branch:** `brief-015-post-retention-purge-legal-hold`
**Status at handoff:** Close-prep complete; PR raised; slice in PR limbo (awaiting the reviewed-lane gates + merge).
**Date:** 2026-06-24

---

## What was delivered

Implemented the **post-retention destructive lifecycle** on top of the EPIC-014 soft-delete + retention clock. Five tasks:

| Task | Delivered |
| ---- | --------- |
| TASK-015-001 | Legal-hold foundation: `LegalHold` model (Prisma) — one table, `scope` discriminator ('engagement'\|'client'), `liftedAt IS NULL` = active (**no TTL — no auto-expire**); `prisma/migrations/20260624140000_legal_hold` (GO-batched, same pattern as the EPIC-014 migration on main); **`db/policies/0013`** — accountant-only `sec.fn_legal_hold_access` (admin OR ACCOUNTANT; **no CLIENT branch**, fail-closed) + `pol_LegalHold` FILTER+BLOCK + `CK_LegalHold_scope`/`CK_LegalHold_exclusivity`. `placeLegalHold`/`liftLegalHold`/`activeHoldsFor` (admin pool, `withAuditTransaction`, `legal_hold.placed`/`legal_hold.lifted`). HARD tier-3 RLS suite 7/7 + integration 9/9. |
| TASK-015-002 | Purge engine: `purgeEligibility` (pure — eligible iff `retentionDeadlineFor` non-null AND `now ≥ deadline` AND no active hold; precedence **hold → window → eligible**) + `purgeEngagement` (ADMIN POOL, `withAuditTransaction`, requires `confirmed: true`, re-resolves eligibility server-side, removes `DocumentVersion`+`Document` rows + storage bytes via `FileStorage.delete`, emits `engagement.purged`). **`AuditEvent` structurally excluded from the purge sweep** (audit-survives-purge). **OQ-014-01** temporal-history deferral documented as `// DECISION:`. **No cron/auto path** (never-automatic). 7 eligibility + 6 integration + 3 RLS tests (16/16). |
| TASK-015-003 | `apps/admin` surface: `purgeEngagementAction`/`placeLegalHoldAction`/`liftLegalHoldAction` (accountant-guarded, CS-TS-004) + `RetentionPanel` (eligibility/precedence-reason surfaced read-only; **confirm-before-purge** — submit disabled until typed input === engagementId; hold place/lift controls). Wired into `documents/page.tsx`. **`apps/portal` gains NO purge/hold capability.** 17 action + 18 component tests (481 admin tests green). |
| TASK-015-004 | Tier-6 e2e: admin `purge-legal-hold.spec.ts` (place+audit / lift+audit / confirm-before-purge) 3/3; portal `no-client-purge-hold.spec.ts` (absence on all 9 testids, both accountant- and client-uploaded paths) 2/2 — **no-client proven both ways**; both 3× flake-free. `@demo` gallery → `docs/demos/EPIC-015/` (6 AC-tagged PNGs + DEMO.md). |
| TASK-015-005 | **Phase-3 `@video` walkthrough spec** `apps/admin/e2e/demo/phase-3-walkthrough.demo.spec.ts` (`@demo @video`, one continuous take across EPIC-009..015 all surfaces; per-spec `test.use` recording; tag-isolated — discovered by `e2e:video` only). Closes the EPIC-008 silent-miss gap: the Conductor's Report-time `e2e:video` now matches a real spec. |

## Acceptance criteria — all 16 satisfied (AC → tier → status)

| AC | Behavior | Tier | Status |
| -- | -------- | ---- | ------ |
| AC-FILE-013-01 | Purge-eligible only after the window elapses | tier-3 | ✅ |
| AC-FILE-013-02 | Purge accountant/admin-only; no client path | tier-3 (server) + tier-6 (portal absence) | ✅ (both ways) |
| AC-FILE-013-03 | Explicit confirmation required | tier-6 + tier-2 | ✅ |
| AC-FILE-013-04 | Never automatic on expiry (eligibility only) | tier-3 | ✅ |
| AC-FILE-013-05 | Eligible-but-unpurged stays accessible + retained | tier-3 | ✅ |
| AC-FILE-013-06 | Purge audited + record survives | tier-3 | ✅ |
| AC-FILE-014-01 | Place hold on an engagement | tier-6 + tier-2 + tier-3 | ✅ |
| AC-FILE-014-02 | Hold on a client → all their engagements | tier-3 | ✅ |
| AC-FILE-014-03 | Held engagement can't be purged post-expiry | tier-3 | ✅ |
| AC-FILE-014-04 | Hold does not auto-expire | tier-3 | ✅ |
| AC-FILE-014-05 | Lift restores eligibility (window elapsed) | tier-3 | ✅ |
| AC-FILE-014-06 | Placing a hold is audited | tier-6 + tier-3 | ✅ |
| AC-FILE-014-07 | Lifting a hold is audited | tier-6 + tier-3 | ✅ |
| AC-FILE-015-01 | In-window erasure = access-revocation only (no physical removal) | tier-3 | ✅ |
| AC-FILE-015-02 | Destruction only post-window, no-hold, confirmed | tier-3 | ✅ |
| AC-NFR-010-07 | Audit survives the purge | tier-3 | ✅ |

**Hard extra_gates all PASS:** purge-eligibility gating (window-elapsed AND no-hold); admin-pool/accountant-only purge **both ways** (server admin-pool-only + portal absence); never-automatic (no cron; eligible-but-unconfirmed stays accessible); hold-blocks-purge + no-auto-expire + client-scope-covers-all; in-window erasure = access-revocation only; audit-survives-purge (AuditEvent excluded from the sweep).

## Quality gates (the 9-gate scorecard)

1. Per-task submission gates — 5/5 ✅
2. SDET Review — 5/5 approved ✅ (no reject cycles)
3. Overwatch Audit — 1 blocking (dispositioned: 3 redundant untracked dev-scratch scripts removed pre-Review), 3 advisory (2 moot after removal; 1 Work-Log-granularity observation) ✅
4. IO Design scan — clean ✅ (footprint = declared 5 task files + artifacts; no scope creep; no portal app-code)
5. Container Smoke — PASS-with-env-caveat ✅ (3 new DB objects confirmed in-container; tier-3 32/32; 3/3 BRIEF-015 e2e; P3019 `prisma migrate deploy` local block per retro-012-002, identical basis to EPIC-014)
6. SDET Acceptance-validation — PASS ✅ (all 16 ACs traced to AC-id-tagged tests at brief tiers)
7. SDET CI gate — PASS ✅ (`pnpm ci:local` exit 0; 293/293 scripts; lint/type-check/build clean)
8. Post-merge CI — pending (Close-finalize)
9. Post-merge staging smoke — N/A (`brief_deploys: no`)

## Carried items (for the upstream producer / next slice)

- **OQ-014-01 (still raised-upstream) — schema-wide temporal-history mechanism (ADR-018 §2).** EPIC-015's purge
  removes the real data graph (Document/DocumentVersion rows + storage bytes); the **history-side-row purge** this
  ADR-018 §2 mechanism would add remains deferred (no temporal tables exist; no AC requires them). When the
  cross-cutting temporal slice lands, its purge coordination plugs into `purgeEngagement`. Documented as `// DECISION:`.
- **Pre-existing infra (carried, non-regression):** P3019 `mssql`-vs-`sqlserver` local `DATABASE_URL` scheme block
  (retro-012-002) prevents `prisma migrate deploy` locally; `_prisma_migrations` is absent on this volume (all Track A
  migrations applied via scratch on prior slices). `migration_lock.toml` + schema both say `sqlserver`, so CI uses the
  canonical path. Same env-caveat sign-off basis as EPIC-014 (COVERAGE note [A]). The known Mailhog `:18025` +
  sign-in-lane `:13001` e2e port caveats account for the 11 pre-existing admin-suite e2e failures (predate BRIEF-015).
- **Phase-3 closeout (Conductor Report-time):** TASK-015-005 authored the `@video` spec; the Conductor produces the
  packaged `docs/demos/phase-3/` video + README at Report (`pnpm --filter admin e2e:video` + `node scripts/make-phase-video.mjs 3`).

## Notes for COVERAGE.md write-back (planning layer)

All 16 AC carry AC-id-tagged passing tests at their prescribed ADR-012 tiers — ready for the planning layer to mark
`verified` in `.planning/COVERAGE.md` and roll **EPIC-015 → delivered**. The ADR-019 purge/hold-audit adherence
obligation is met (the rest of REQ-NFR-010's audit-trail feature AC remain explicitly out of scope → Phase 4
audit-trail slice; only AC-NFR-010-07 is claimed here). **EPIC-015 CLOSES Phase 3** (EPIC-009..014 already delivered).
