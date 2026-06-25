# Conductor run report — EPIC-017 — 2026-06-25

**Terminal status:** delivered
**Epic:** EPIC-017 — Per-engagement & general messaging threads with attachments (phase 4)
**Brief:** BRIEF-017 — `.implementation/briefs/BRIEF-017-per-engagement-general-messaging.md`

## Pipeline

| Phase | Result |
|---|---|
| Select | EPIC-017 pinned (`$ARGUMENTS`); next ready Phase-4 slice (deps EPIC-016 ✅ / EPIC-013 ✅ / EPIC-010 ✅). |
| Gate | GO — mechanical readiness + engine-clear PASS; AC-testability PASS (24/24 AC resolve verbatim to REQ-MSG-001..006/-013/-014). |
| Compose | BRIEF-017 written; AC: 24; scenarios: gherkin (verbatim from EPIC-017). No `phase_walkthrough` (Phase-4 mid-slice, not closer). |
| Implement | PR #104 opened. 10 build tasks + 2 fix-forward bugs (BUG-017-001 pre-existing EPIC-016 `.js`-import build break; BUG-017-002 masked notification-link defect). Engine cascade: Plan → Dispatch → Audit (Overwatch: 1 blocking false-link finding, fixed) → Review (SDET: 12 approved, 1 rejection → BUG-017-002 caught a test-validity defect) → design-scan PASS → Smoke CONDITIONAL-PASS → Validate. |
| Standards-review | request-changes · required 1 (CS-SQL-003) · recommended 0 · experimental 0 · drafted 0 — **dispositioned by user ratification** (see Outcome). |
| Review | request-changes (advisory) · blocker 2 · major 2 · minor 3 · nit 1 (8 after dedupe). |
| Fix | `/pr-fix` addressed 7/8 (2 over-engineering cleanups deferred to follow-up); the 2 cross-tenant-write blockers fixed (request-pool participation gate) + red→green write-side negative test; CI green. Commit `f230e32`. |
| Merge/Finalize | merged SHA `69d2726f` (plain `--squash --delete-branch`, no protection toggle) + engine Close-finalize done; gate-8 post-merge CI on `main` green; `awaitingMerge[]` cleared. |
| Validate | signed-off — AC verified: all 24 (AC-MSG-001-01..04, -002-01..03, -003-01..03, -004-01..05, -005-01..04, -006-01..03, -013-02, -014-01). EPIC-017 rolled to `delivered`; COVERAGE 210→234 verified, 99→75 planned. |
| Verdict log | 13 gate records snapshotted → `runs/gate-history.jsonl` (224 total) · drift: none flagged. |

## UI Demo

`docs/demos/EPIC-017/` — **10 screens (AC-tagged), both surfaces** (portal 01–05 sarah-returning-client; admin 06–10 jane-accountant) along `flow-message-exchange`. Captured by TASK-017-009 `@demo`; shipped in the slice PR. Non-gating (the e2e gate is the gate).

## Phase closeout

n/a (phase in progress — 2/8 epics of Phase 4 delivered: EPIC-016 + EPIC-017; EPIC-023 is the Phase-4 closer). No phase-walkthrough video is due on this slice.

## Outcome

EPIC-017 — the **messaging conversation surface** (the email replacement) — shipped on both `apps/portal` and `apps/admin`: per-engagement threads (one per engagement) + accountant-initiated general threads, plain-text messages (rendered via React text nodes, never `dangerouslySetInnerHTML`), scanned signed-URL attachments (reusing the EPIC-007/-013 FileScanner + storage seam; infected/indeterminate never signable; cross-resource IDOR negative), per-viewer unread indicators, indefinite retention + archive-on-close (a state flip wired additively into the EPIC-010 Complete transition, never a delete — distinct from EPIC-016's 90-day notification floor), and recipient-only new-message notifications onto the EPIC-016 feed spine. Net-new: `Thread`/`Message`/`MessageAttachment`/`ThreadReadState` + `db/policies/0014..0017` participant-isolation RLS (proven both-ways across all four policies, incl. ≥2-participant + null-context-zero). PR #104 → `69d2726f`, all 24 AC `verified`, EPIC-017 `delivered`.

**The independent-verification layers earned their keep across the board this slice:**
- **The `/pr-review` panel caught 2 cross-tenant-write BLOCKERS that Overwatch + the SDET (×2) + the standards audit all missed** — `sendMessageAction`/`attachMessageAction` (+ general-thread twins) authorized only on role and wrote on the **RLS-exempt admin pool**, so any authenticated CLIENT could post a message or plant an attachment into another client's thread by supplying an arbitrary id. The whole slice's verification had focused on the read-side RLS (proven 30/30) and the signed-URL IDOR (correctly gated); the write-via-admin-pool path was the blind spot. Same pattern as EPIC-013 (version-download IDOR), EPIC-015 (purge-atomicity), EPIC-016 (ACCOUNTANT-isolation). Fixed in-PR via a request-pool participation gate + a **red→green write-side negative test** (the absence of which was itself a finding — the action tests returned a mock thread for any id, so the missing check broke no test).
- **The SDET caught a test-validity defect (BUG-017-002)** at Review: the admin notification feed didn't render `new_message` and the e2e had *hidden* it by seeding `linkedItemType='engagement'`, a value the real emission path never produces. Fixed by aligning emission + both renderers + driving the **real** emission path in e2e.
- **Overwatch caught a blocking false-link** at Audit (admin feed not rendering the notification) before the SDET.

**Governance decision (user-ratified):** the standards audit's one `required` violation (CS-SQL-003 — 3 of 4 new RLS predicates use >1 JOIN to the ownership boundary) was verified to be **established-precedent architecture drift** — every merged engagement-scoped policy (0005/0007/0009/0011) uses the same-or-deeper inline-JOIN shape, the new policies are *shallower* than precedent, and SQL Server cannot nest inline TVFs at SECURITY POLICY predicate scope (the reason the whole RLS layer inlines). Rather than force a disproportionate access-set-table refactor into a feature PR, the Conductor halted and surfaced it; the user ratified **reconciling CS-SQL-003** to the as-built reality (the "≤1 JOIN / access-set tables" clause amended; access-set tables demoted to a documented performance escalation; the non-negotiable core — inline TVF, admin/accountant-first, fail-closed, reuse `fn_*_access` — unchanged, rating stays `required`). Recorded in the standard's `rating_history` (`by: user`, 2026-06-25).

## Next

- **Next ready epic:** **EPIC-018** — email digest fallback (content-free nudge, ≤1/day, accountant-suppress, client default-on; depends on EPIC-016 ✅). Run `/orchestrate EPIC-018`.
- **Phase-4 remaining:** EPIC-018 (email digest) → EPIC-019 (overdue/reminder engine) → EPIC-020 (dashboard home) → EPIC-021 (client/engagement nav) → EPIC-022 (admin settings & identity) → EPIC-023 (audit-trail read surface — the Phase-4 closer).
- **Carried follow-ups (RETRO-017):** the 2 deferred over-engineering cleanups (GeneralMessageComposer parameterization + `*General*` attach/sign action dedup); the general-thread new-message-link e2e coverage-depth advisory; retro-012-002 (clean-volume Prisma bootstrap — should-fix before BRIEF-018 Smoke).
