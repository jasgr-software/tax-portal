# Conductor run report — EPIC-014 — 2026-06-24

**Terminal status:** delivered
**Epic:** EPIC-014 — File deletion, soft-delete & 7-year retention (Phase 3)
**Brief:** BRIEF-014 — `.implementation/briefs/BRIEF-014-file-deletion-soft-delete-retention.md`

## Pipeline

| Phase | Result |
|---|---|
| Select | EPIC-014 (pinned; next-ready FILE-chain slice after EPIC-013) |
| Gate | GO — readiness + engine-clear PASS; AC-testability PASS (10/10 resolve verbatim to REQ-FILE-004/005/006 + REQ-NFR-006) |
| Compose | BRIEF-014 written; AC: 10; scenarios: gherkin |
| Implement | `/io` → PR #97 opened (3 tasks: schema+RLS, repo seams+retention, actions+UI+e2e). Blocked once at Docker pre-flight (engine off); resumed at Dispatch when Docker restarted |
| Standards-review | approve · required 0 · recommended 0 · experimental 0 · drafted 0 |
| Review | approve (advisory) · blocker 0 · major 0 · minor 6 · nit 4 (deduped to 10; 7 inline) |
| Fix | skipped (clean) — panel + standards both routed SKIP |
| Merge/Finalize | merged `37707ad` (squash, no protection toggle; 7 advisory threads dispositioned+resolved) + engine Close-finalize done (post-merge CI + CodeQL green; awaitingMerge cleared) |
| Validate | signed-off — AC verified: AC-FILE-004-01/-02/-03, AC-FILE-006-01/-02/-03, AC-FILE-005-01/-02/-03, AC-NFR-006-01 (all 10); EPIC-014 → delivered |
| Verdict log | run gate records snapshotted → `runs/gate-history.jsonl` (175 total) · drift: none |

## UI Demo

`docs/demos/EPIC-014/` — 6 screens (AC-tagged: 004-01, 006-01, 006-03) + DEMO.md · captured at Smoke/Validate · shipped in the application-code PR #97 (gallery rode the slice PR; index here).

## Phase closeout

n/a (phase in progress — 6/7 epics of Phase 3 delivered; EPIC-015 remains `planned`). No phase walkthrough video obligation on this slice (the Compose phase-completion check correctly omitted `demo.phase_walkthrough`).

## Outcome

EPIC-014 shipped accountant-only file deletion as a **soft**, recoverable action under the in-window 7-year
retention floor: a `Document.deletedAt` tombstone with a CLIENT-branch-only RLS filter (soft-deleted docs leave
the client/working view while the accountant retains archive/recover visibility), admin-pool `softDeleteDocument`/
`recoverDocument` seams that are **UPDATE-only** (no physical DELETE, no storage delete — purge is EPIC-015) and
ADR-019-audited, a system-enforced retention clock (`completedAt` anchor + configurable 7-year window + computed
deadline), and an admin delete/recover UI. The no-client-delete guarantee was proven **both ways** (server-side
accountant guard + portal-surface absence, including for a client-uploaded file). All 10 AC are `verified` in
COVERAGE; the panel found 0 blocker/0 major; CI + CodeQL green post-merge. The schema-wide temporal-history
mechanism (ADR-018 §2) was deliberately deferred via **OQ-014-01** as a cross-cutting concern — no AC required it.

## Next

- **Next ready epic:** **EPIC-015** — post-retention purge + legal hold + retention-vs-erasure precedence
  (REQ-FILE-013/014/015). `depends_on` EPIC-014 ✅ + EPIC-010 ✅ — both satisfied. **It closes Phase 3**, so its
  Compose phase-completion check should obligate the Phase-3 `@video` walkthrough spec. Run `/orchestrate EPIC-015`.
