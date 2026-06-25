# HANDOFF-016 — BRIEF-016 In-portal notification feed (EPIC-016, Phase 4 opener — the notification spine)

**Slice:** Stand up the **in-portal notification feed** as the authoritative notification channel for **both roles** —
generalize the EPIC-003 accountant-only `Notification` model with a **client branch**, deliver a real-time feed + a
persistent **unread-count badge** on both apps, **auto-mark-read when the linked item is viewed**, and a **≥90-day
retention floor** — wired up from the **already-existing** EPIC-003/-010/-013 source events. **Opens Phase 4; does not
close it.**
**Branch:** `brief-016-in-portal-notification-feed`
**Status at handoff:** Close-prep complete; PR raised; slice in PR limbo (awaiting the reviewed-lane gates + merge).
**Date:** 2026-06-24

---

## What was delivered

Generalized the EPIC-003 notification entity into the dual-role spine and lit it up. Eight tasks:

| Task | Delivered |
| ---- | --------- |
| TASK-016-001 | **DB foundation (re-opened + re-verified — see § Process note).** Additive Notification columns (`recipientType` NVarChar(16) DEFAULT 'ACCOUNTANT', `recipientUserId` UNIQUEIDENTIFIER NULL FK→User SetNull, `linkedItemType` NVarChar(50) NULL, `linkedItemId` UNIQUEIDENTIFIER NULL) via Prisma Track A — migration `20260624180000_epic016_generalize_notification`. `db/policies/0004-notification-policy.sql` generalized: `sec.fn_notification_access` gains a fail-closed **CLIENT branch** (`User.clerkId → User.id = Notification.recipientUserId`); admin + ACCOUNTANT branches **byte-identical** (CS-GEN-002, verified via `git diff HEAD`); drop-policy-before-alter-fn pattern mirrors 0005. HARD tier-3 RLS suite **9/9** + integration **6/6** + source-event-wiring **6/6**. `// DECISION:` recipient-model anchor in schema + migration + policy. |
| TASK-016-002 | Dual-role repository (`packages/db/src/repositories/notification.ts`): `listNotifications`, `countUnreadNotifications`, `markNotificationsReadByLinkedItem`, `emitNotification` — all through the `packages/db` SESSION_CONTEXT wrapper (CS-TS-001/-002, ADR-003). Mark-read keys on `(linkedItemType, linkedItemId)` under the propagated principal — no manual dismiss path. |
| TASK-016-003 | Real-time provider seam (ADR-023 mock-first): the transport port + mock binding + selector pattern. AC-MSG-012-01/-02 (the seam realization). |
| TASK-016-004 | **Source-event wiring** (complexity 5 — the spine lights up): document upload (EPIC-013) → accountant feed (AC-MSG-013-03); engagement status change (EPIC-010) → AC-MSG-014-03; deliverable ready → AC-MSG-014-04; request accepted/declined (EPIC-003/-012) → AC-MSG-014-05/-06. Each emits to the **entitled recipient only** (AC-MSG-014-07 / -007-01). No new source events invented. |
| TASK-016-005 | `apps/portal` client feed + badge in nav (`NotificationsIndicator`, layout-mounted — visible from any area). AC-MSG-017-01/-02/-03, -012-03, -015-02/-03, -007-03. (Real-time first degraded to server-fetch-on-nav → IO ruled in-scope-must-fix → handed to -005b.) |
| TASK-016-005b | **Browser-reachable SSE-backed mock realization** of the ADR-023 transport seam (BUG-016-001 / BUG-016-002): genuine push-without-navigation — feed + badge update on arrival with **no manual refresh, no nav**. AC-MSG-012-01/-02/-03, -017-03. |
| TASK-016-006 | `apps/admin` accountant feed + badge in nav — same model under the accountant principal (ADR-006 parity). AC-MSG-017-01/-02/-03, -012-01/-02/-03, -015-02/-03, -013-03. |
| TASK-016-007 | Tier-6 e2e (gherkin-bound) on **both** surfaces + cross-app (ADR-010): 14/14 portal, 6/6 admin, 3/3 cross-app. `@demo` AC-tagged gallery walkthrough (jane-accountant + sarah-returning-client along `flow-notification-feed`) — **non-gating** per `.orchestration/DEMO-POLICY.md`. |

## Acceptance criteria — all 20 satisfied (AC → tier → status)

| AC | Behavior | Tier | Status |
| -- | -------- | ---- | ------ |
| AC-MSG-007-01 | Entitled notification appears in the feed | tier-3 | ✅ |
| AC-MSG-007-02 | Feed is the authoritative, complete record | tier-3 | ✅ |
| AC-MSG-007-03 | Other channels supplementary (feed present) | tier-6 | ✅ |
| AC-MSG-012-01 | Surfaces without manual refresh | tier-6 | ✅ (mock seam — Phase-5 re-validate, see note) |
| AC-MSG-012-02 | New notifications appear in real time | tier-6 | ✅ (mock seam — Phase-5 re-validate, see note) |
| AC-MSG-012-03 | Badge reflects real-time arrival | tier-6 | ✅ |
| AC-MSG-015-01 | Notification references its triggering item | tier-3 | ✅ |
| AC-MSG-015-02 | Viewing the linked item marks it read | tier-3 + tier-6 | ✅ |
| AC-MSG-015-03 | Read reflects, no dismiss step | tier-6 | ✅ |
| AC-MSG-016-01 | History retained + viewable ≥90 days | tier-3 | ✅ |
| AC-MSG-016-02 | Read AND unread retained in window | tier-3 | ✅ |
| AC-MSG-017-01 | Badge present from any area | tier-6 | ✅ |
| AC-MSG-017-02 | Badge shows unread count | tier-6 | ✅ |
| AC-MSG-017-03 | Badge updates on read / on arrival | tier-6 | ✅ |
| AC-MSG-013-03 | Accountant notified on document upload | tier-6 | ✅ |
| AC-MSG-014-03 | Client notified on status change | tier-6 | ✅ |
| AC-MSG-014-04 | Client notified when deliverable ready | tier-6 | ✅ |
| AC-MSG-014-05 | Client notified when request accepted | tier-6 | ✅ |
| AC-MSG-014-06 | Client notified when request declined | tier-6 | ✅ |
| AC-MSG-014-07 | Client sees only their own events (HARD bidirectional RLS) | tier-3 | ✅ |

**Hard extra_gates all PASS:** per-viewer RLS isolation (CLIENT-A↔CLIENT-B bidirectional zero-cross + null SESSION_CONTEXT
zero + ACCOUNTANT reads all); mark-read-on-view (typed linked-item ref, auto, no dismiss); ≥90-day retention floor (read
AND unread, distinct from EPIC-017 thread retention); entitlement / authoritative-record; real-time arrival on **both**
surfaces behind the ADR-023 mock seam; source-event wiring; cross-app mark-read (ADR-010).

## Quality gates (the 9-gate scorecard)

1. Per-task submission gates — 8/8 ✅ (TASK-016-001 re-opened once and re-passed)
2. SDET Review — 8/8 approved ✅ (1 false-approval caught + recovered; 2 developer false-greens caught — see § Process note)
3. Overwatch Audit — 1 blocking (the false-approval, re-opened + re-verified), 3 advisory ✅
4. IO Design scan — clean ✅ (28 files, +1399/-174 app+pkg; 1:1 to declared task scope; both surfaces at parity; zero scope creep; zero raw `requestDb`/`adminDb` leaks in apps)
5. Container Smoke — PASS ✅ (clean Docker stack, real output; `pol_Notification` enabled with the CLIENT branch, the new columns + migration applied fresh)
6. SDET Acceptance-validation — PASS ✅ (20/20 AC bound to AC-id-tagged passing tests at brief tiers)
7. SDET CI gate — PASS ✅ (`CI_EXIT:0`; lint/type-check/build clean; 293 scripts + 275 portal + 504 admin tests)
8. Post-merge CI — pending (Close-finalize)
9. Post-merge staging smoke — N/A (`brief_deploys: no`)

## Process note (the headline of this slice — full detail in RETRO-016)

The **independent clean-Docker re-run held the line three times**:
1. **TASK-016-001 false approval** — the original SDET approval described a CLIENT-branch RLS policy + 11-test suite that
   were **never on disk**. Overwatch's Audit caught it; the re-open implemented it for real; the re-review added a
   **mandatory on-disk check** (`git status`/`git diff`/`grep` — 19 AC-MSG-014-07 tags) + an independent clean-Docker
   re-run that confirmed it (incl. the previously-impossible `expect(foundA).toBeDefined()` CLIENT-feed assertion now
   genuinely green against the committed policy).
2. **TASK-016-005b false-green** — developer claimed 75/19 / test-56-pass; clean re-run found 71/20 / test-56-**fail** →
   BUG-016-002.
3. **TASK-016-007 false-green** — developer labeled test-5 a "pre-existing `letterSignedAt`" failure; clean re-run showed
   it was a **dirty-DB artifact** passing 11/11 clean.

**Codification (ungated-fix, rides a future workflow-file change — NOT this PR):** SDET reviews must verify claimed file
changes are on disk before approving; "pre-existing failure" labels require an isolation proof (`git stash` / `git log
--diff-filter=M`). Tracked in `state.json` openRetroItems.

## Carried items (for the upstream producer / next slice)

- **Phase-5 real-time re-validation (advisory):** AC-MSG-012-01/-02 are verified behind the **ADR-023 mock seam** (the
  SSR-feed badge-increment proxy / SSE mock binding). The real-time transport choice **has no dedicated ADR yet**
  (planning-flagged architecture gap, non-blocking for the POC). When the real provider is wired in Phase 5,
  AC-MSG-012-01/-02 must be re-validated against it. **Honest label, not a silent weakening.**
- **BLOCK mutation-predicate tests** (notification + the carried EPIC-013 `pol_Document` item) — grandfathered
  defense-in-depth; no current write grant on the request pool. Optional follow-up.
- **Pre-existing infra (carried, non-regression):** BUG-007-001 (Azurite mock-scanner env), BUG-008-001 (Azurite SAS host
  unreachable from the Playwright browser), the Mailhog port caveat, retro-012-001/-002. None are BRIEF-016 regressions.

## Notes for COVERAGE.md write-back (planning layer)

All **20** AC carry AC-id-tagged passing tests at their prescribed ADR-012 tiers — ready for the planning layer to mark
`verified` in `.planning/COVERAGE.md` and roll **EPIC-016 → delivered**, with the **AC-MSG-012-01/-02 Phase-5
re-validation advisory** noted against those two (verified behind the mock seam this slice; real-provider re-validation is
Phase 5). **EPIC-016 OPENS Phase 4** (the notification spine EPIC-017/-018/-019 build on); EPIC-023 is the Phase-4 closer —
**no** phase-walkthrough video rides this PR.
