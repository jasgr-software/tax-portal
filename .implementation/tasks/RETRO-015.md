# RETRO-015 — BRIEF-015 Post-retention purge & legal hold (EPIC-015, Phase 3 close)

**Date:** 2026-06-24 · **Branch:** `brief-015-post-retention-purge-legal-hold` · **Outcome:** Close-prep complete; PR raised.

## Scorecard

| Gate | Result |
| ---- | ------ |
| 1. Submission gates | 5/5 ✅ |
| 2. SDET Review | 5/5 approved (no reject cycles) ✅ |
| 3. Overwatch Audit | 1 blocking (dispositioned), 3 advisory ✅ |
| 4. IO Design scan | clean ✅ |
| 5. Container Smoke | PASS-with-env-caveat ✅ |
| 6. SDET Acceptance-validation | PASS (16/16 AC) ✅ |
| 7. SDET CI gate | PASS (`pnpm ci:local` exit 0) ✅ |
| 8. Post-merge CI | pending |
| 9. Post-merge staging smoke | N/A (`brief_deploys: no`) |

## What went well

- **Every identified trap was pre-solved by the developers**, not caught at review: the RLS policy has no CLIENT
  branch (fail-closed by omission); the AuditEvent purge-exclusion is an explicit `// DECISION:` not an implicit
  omission; the no-client proof is bidirectional (server admin-pool-only + portal absence e2e seeded with a
  purge-eligible engagement to defeat the conditionally-hidden loophole); precedence is tested as *ordering*
  (held-and-expired → `blocked-by-hold`, not `in-window`), not just endpoints.
- **OQ-014-01 continuity held.** The temporal-history deferral EPIC-014 raised was honored as a `// DECISION:` in
  the purge code rather than silently dropped or partially bolted on — the purge removes the real data graph and
  names the deferred history-side coordination. Clean cross-slice altitude.
- **The Phase-3 `@video` obligation was carried from Compose → brief Deliverable → TASK-015-005 → verified tag
  isolation** — the EPIC-008 silent-miss failure mode was structurally prevented (the Conductor's Report-time
  `e2e:video` will match a real spec).
- **First-pass SDET approval on all 5 tasks**; smoke + all three Validate gates green with no fix cycles.

## Findings classified (per ENGINE.md § Retro Finding Classification — concrete gate failures only)

- **[acknowledged] Overwatch blocking finding — 3 redundant untracked dev-scratch migration scripts.**
  `scripts/apply-legal-hold-migration.ts`, `apply-legal-hold-policy.ts`, `record-legal-hold-migration.ts` were
  one-shot local appliers redundant with the canonical `pnpm db:migrate` (Track A applies the GO-batched migration
  per the EPIC-014-on-main precedent; Track B applies `0013`); `record-*.ts` additionally wrote Prisma's internal
  `_prisma_migrations` (fragile). **IO Audit disposition: removed before Review** (they were untracked, never
  committed, no consumers). Resolved this slice — not promoted.
- **[observation] Migration-apply pattern needs a documented paved road.** Two consecutive slices (EPIC-014,
  EPIC-015) hand-authored GO-batched Prisma migrations as a P3019 workaround and reached for one-shot apply scripts
  during local dev. The canonical `pnpm db:migrate` *does* apply them, but the local P3019 `mssql://`-vs-`sqlserver://`
  `DATABASE_URL` scheme block (retro-012-002) tempts developers into scratch scripts. **Candidate:** document the
  GO-batched-migration + `pnpm db:migrate` paved road (and the local P3019 cause) in the operations runbook so the
  next slice doesn't re-invent scratch appliers. Observation — no gate failure; carried for the next infra touch.
- **[observation] `_prisma_migrations` absent on the local volume.** All Track A migrations on this dev volume were
  applied via scratch (the P3019 block prevented Prisma's own tracking table from ever being created). Harmless
  locally; a fresh CI/prod `prisma migrate deploy` creates the table and applies from scratch. Same root family as
  retro-012-002. Observation.
- **[observation] TASK-015-003 Work Log granularity.** Two entries (start + mark-review) vs the three-entry pattern
  of the other four tasks; no breadcrumb missing. Minor consistency note (Overwatch advisory).

## Carried forward

- **OQ-014-01** (schema-wide temporal history, ADR-018 §2) — still raised-upstream; EPIC-015's purge names the
  history-side-row coordination a future temporal slice will plug in.
- **retro-012-001** (`test-portal` packages build step) and **retro-012-002** (P3019 local block) unchanged — both
  pre-existing, both surfaced again here as non-regressions.

## Phase-3 close

EPIC-015 is the last `planned` Phase-3 epic; with it delivered, **Phase 3 (engagement lifecycle & secure file
exchange) closes.** The Conductor produces the Phase-3 walkthrough video at Report from TASK-015-005's `@video` spec.

## Post-Merge Addendum (Close-finalize — 2026-06-24)

- **Merged:** PR #99 squash-merged to `main` as `53b3444`. Remote branch deleted.
- **Gate 8 (post-merge CI):** PASS — `main@53b3444` green on `lint-and-typecheck` + `security-scan` + `test-admin` +
  `test-portal` + CodeQL (Analyze python/javascript-typescript), CI run `28114529547`.
- **Gate 9 (staging smoke):** N/A (`brief_deploys: no`).
- **Reviewed-lane finding (the panel earned its keep again):** the 3-lens `/pr-review` panel caught a **blocker the
  in-slice SDET + Overwatch + IO design-scan all missed** — `purgeEngagement` wrapped its body in
  `withAuditTransaction(txn)` but ran the physical DELETEs on the **shared admin pool** (`new MssqlRequest(pool)`),
  not the transaction connection, so the irreversible purge was **not atomic**: an audit-insert failure would have
  destroyed Document/DocumentVersion rows + storage bytes with **no `engagement.purged` audit row** — inverting the
  fail-closed audit-survives guarantee the file's own header promised (AC-FILE-013-06 / AC-NFR-010-07 / ADR-019 §3),
  plus a TOCTOU on the hold re-check. The panel also flagged that `purge.integration.test.ts` proved only the happy
  path (deleting the `txn` binding failed zero tests). **Fixed in-PR** (`34af53e` + `61aaa5e`, folded into the
  squash): all purge statements moved onto the transaction connection, storage-byte deletion deferred until **after**
  the row-delete + audit commit, and a `[fail-closed]` rollback regression test added (proven red→green: it fails
  against the pre-fix autocommit-bypass, passes against the fix). Mirrors the EPIC-013 version-download-IDOR pattern —
  a server-side correctness defect the unit/integration gates couldn't see, caught by the independent panel.
- **Dispositioned non-fix:** the `placeLegalHold` client-scope write path was **kept** (the panel's over-engineering
  lens flagged it as a possibly-unused branch) — AC-FILE-014-02 (place a hold on a client → all their engagements)
  requires it and `legal-hold.integration.test.ts` exercises it; thread resolved with that rationale.
- **Lesson (carried to RETRO observation):** the in-slice tier-3 integration tests asserted the happy-path purge
  outcome but not the **all-or-nothing rollback** invariant — the atomicity of a destructive transaction is exactly
  the property a fail-closed test must assert. The panel's "deleting the txn binding fails zero tests" heuristic is
  the durable catch. Future destructive-path slices should ship a fail-closed/rollback test as a first-class gate.
