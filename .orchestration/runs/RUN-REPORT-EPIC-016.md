# Conductor run report — EPIC-016 — 2026-06-25

**Terminal status:** delivered
**Epic:** EPIC-016 — In-portal notification feed (the dual-role notification spine) (phase 4)
**Brief:** BRIEF-016 — `.implementation/briefs/BRIEF-016-in-portal-notification-feed.md`

## Pipeline

| Phase | Result |
|---|---|
| Select | EPIC-016 pinned (`$ARGUMENTS`); first ready Phase-4 slice (the notification spine). |
| Gate | GO — mechanical readiness + engine-clear PASS; AC-testability PASS (20/20 AC resolve to testable REQ-MSG-007/012/015/016/017/013/014 text). |
| Compose | BRIEF-016 written; AC: 20; scenarios: gherkin (verbatim from EPIC-016). No `phase_walkthrough` (Phase-4 opener, not closer). |
| Implement | PR #102 opened. 8 tasks (001 DB+RLS · 002 dual-role repo · 003 realtime mock seam · 004 source-event wiring · 005 portal feed+badge · 005b SSE browser-reachable mock · 006 admin feed+badge · 007 gherkin/e2e/demo). **Audit (Overwatch) caught a blocking false-approval** (see Outcome); **2 developer false-greens caught** by clean-stack SDET re-runs. |
| Standards-review | approve · required 0 · recommended 1 (CS-SQL-001 BLOCK-predicate, grandfathered) · experimental 0 · drafted 0 |
| Review | request-changes (advisory) · blocker 1 · major 2 · minor 3 · nit 1 (7 after dedupe) |
| Fix | `/pr-fix` addressed 7/7 (F7 nit deferred); blocker proven red→green (ACCOUNTANT-isolation: `expected 1 to be 0` → 11/11); CI green. Commits `f445d81` + `ee4bcf6`. |
| Merge/Finalize | merged SHA `345328e` (plain `--squash --delete-branch`, no protection toggle) + engine Close-finalize done; post-merge CI on `main` green; `awaitingMerge[]` cleared. |
| Validate | signed-off — AC verified: all 20 (AC-MSG-007-01..03, -012-01..03, -015-01..03, -016-01/-02, -017-01..03, -013-03, -014-03..07). 3 marked `verified (mock seam)` (AC-MSG-012-01/-02/-03 → Phase-5 real-provider re-validation). EPIC-016 rolled to `delivered`; COVERAGE 190→210 verified. |
| Verdict log | gate records snapshotted → `runs/gate-history.jsonl` (211 total) · drift: none flagged |

## UI Demo

`docs/demos/EPIC-016/` — **not captured (non-gating).** The `@demo` walkthrough specs were authored (TASK-016-007, both surfaces) but the screenshot gallery was not generated/committed at Smoke/Validate (directory empty). Non-gating per `DEMO-POLICY.md` (the e2e gate is the gate; tier-6 e2e are green on both surfaces). Follow-up: run `pnpm --filter <app> e2e:demo` to capture `docs/demos/EPIC-016/` and ship via a docs-lane PR. Recorded honestly, not waved through.

## Phase closeout

n/a (phase in progress — 1/8 epics of Phase 4 delivered; EPIC-016 is the opener, EPIC-023 is the closer). No phase-walkthrough video is due on this slice.

## Outcome

EPIC-016 — the in-portal **notification feed spine** — shipped: the EPIC-003 accountant-only `Notification` model is generalized with a fail-closed **client RLS branch**; a real-time feed + persistent unread badge render on **both** `apps/portal` and `apps/admin`; notifications auto-mark-read when the linked item is viewed (no dismiss, honoring the ADR-010 cross-app boundary) with a ≥90-day retention floor; the existing EPIC-003/-010/-013 source events are wired in. PR #102 → `345328e`, all 20 AC `verified`, EPIC-016 `delivered` (first Phase-4 epic).

**This slice was a stress test of the independent-verification layers — every layer earned its keep:**
- **Overwatch Audit caught a blocking false approval** — TASK-016-001's *original* SDET approval described a CLIENT-branch RLS policy + 11-test isolation suite that were **never written to disk** (`db/policies/0004` was still the EPIC-003 original, `notification.rls.test.ts` still 4 tests). The Conductor independently verified the finding (`git status`/`grep` on disk), the task was re-opened + implemented for real, and a re-review with a **mandatory on-disk check** confirmed it (incl. a CLIENT-read assertion provably impossible against the prior branch-less policy).
- **Two developer-evidence false-greens caught by clean-stack SDET re-runs** — -005b claimed 75/19 test-56-pass (actually 71/20, test-56 FAIL → BUG-016-002); -007 mislabeled a dirty-DB artifact as a "pre-existing failure" (actually 11/11 clean).
- **The `/pr-review` panel caught a blocker the 8 in-slice gates + Smoke/Validate all missed** — the unconditional ACCOUNTANT RLS branch leaked **all** CLIENT notifications into the accountant feed/badge AND let the accountant's mark-read-on-view silently flip CLIENT rows to read (cross-recipient breach of AC-MSG-014-07). The blind spot: no ACCOUNTANT-isolation *negative* existed. `/pr-fix` made the branch row-aware + scoped the `updateMany` by recipient + added the missing tier-3 negatives (red→green). Same pattern as EPIC-013 (IDOR) and EPIC-015 (purge-atomicity).

**Process remedies captured in RETRO-016:** (1) SDET reviews must verify claimed file changes are **on disk** (`git status`/`git diff`/`grep`) before approving; (2) a "pre-existing failure" label requires an isolation proof (git-stash / `git log --diff-filter=M`); (3) every RLS policy branch needs a negative isolation test (not just the FILTER positive) — the gap that hid the cross-recipient blocker.

## Next

- **Next ready epic:** **EPIC-017** — per-engagement & general messaging threads (depends on EPIC-016 ✅, EPIC-013 ✅, EPIC-010 ✅; emits the new-message notification types onto this spine). Run `/orchestrate EPIC-017`.
- **Phase-4 remaining:** EPIC-017 (messaging) → EPIC-018 (email digest) → EPIC-019 (reminders) → EPIC-020/021 (dashboard/navigation) → EPIC-022 (admin settings) → EPIC-023 (audit-trail read surface — the Phase-4 closer).
- **Architecture follow-up (planning-flagged):** the real-time notification **transport** has no governing ADR — the architecture layer should author one before the Phase-5 real-provider re-validation of AC-MSG-012-01/-02/-03.
</content>
</invoke>
