# Conductor run report — EPIC-019 — 2026-06-27

**Terminal status:** delivered
**Epic:** EPIC-019 — Overdue detection & reminder engine (auto-detect, configurable cadence) (phase 4)
**Brief:** BRIEF-019 — `.implementation/briefs/BRIEF-019-overdue-reminder-engine.md`

## Pipeline

| Phase | Result |
|---|---|
| Select | EPIC-019 (resumed mid-flight at Compose; Select + Gate already passed `ac_ok=yes`) |
| Gate | GO — status `planned`, `open_questions: []`, depends_on EPIC-016/-011/-013 all delivered, COVERAGE rows present, AC testable |
| Compose | BRIEF-019 written; AC: 14; scenarios: gherkin (14 Given/When/Then carried verbatim from the epic) |
| Implement | PR #108 opened — 5 feature tasks (001 schema+RLS, 002 cadence config, 003 detection engine, 004 overdue flag+notif, 005 e2e+demo) + 2 audit fix-forward (TASK-019-006 ops-doc sync, BUG-019-001 encrypt regression) |
| Standards-review | approve · required 0 · recommended 0 · experimental 0 · drafted 1 (CS-TS-005 experimental + SQ-001) |
| Review | request-changes (advisory) · blocker 0 · major 1 · minor 3 · nit 2 (6 after dedupe) |
| Fix | run /pr-fix (panel major>0): MAJOR encrypt-default TLS downgrade fixed + 2 gating minors; commit b2b55ce, required CI green; 2 non-gating threads dispositioned-resolved as retro-019 follow-ups |
| Merge/Finalize | merged b54a5936215c5f015dd0b938c0fbb9fd0251f060 (squash, reviewed lane — threads resolved, green required CI, no `--admin`/protection toggle); engine Close-finalize (post-merge gate 8 + clear awaitingMerge) |
| Validate | signed-off — AC verified: all 14 (FILE-012-01..04, MSG-018-01..04, DASH-008-01..03, MSG-013-05/-06, MSG-014-02); EPIC-019 rolled to `delivered` |
| Verdict log | 20 gate records snapshotted → `runs/gate-history.jsonl` (260 total) · drift: none |

## UI Demo

`docs/demos/EPIC-019/` — DEMO.md + AC-tagged `@demo` gallery (admin overdue/cadence screens 01–05; portal request-created nudge 06–07) · captured at TASK-019-005 across both surfaces · shipped in the docs-lane close-out PR.

## Phase closeout

n/a (phase in progress — 4/8 epics of Phase 4 delivered: EPIC-016, -017, -018, -019). EPIC-019 does **not** close Phase 4 — EPIC-023 (audit-trail read surface) is the Phase-4 closer; no phase-walkthrough video obligation rode this slice.

## Outcome

EPIC-019 shipped the overdue-detection & reminder engine: the system **auto-detects** overdue document requests behind a **time-injectable clock seam** (ADR-023, no wall-clock waits), flags them on the accountant view, and **raises reminders** at an accountant-configurable cadence (a global default + a per-engagement override that takes precedence). It emits three reminder/lifecycle notification types — request-overdue → accountant, engagement-approaching-due → accountant, document-request-created → client — into the **EPIC-016 feed**, summarized by the **existing EPIC-018 content-free daily digest** with **no new email path** and **no new notification policy**. A net-new accountant-only `ReminderSetting` carries its own RLS policy + an 8-test isolation suite; per-engagement precedence and per-recipient RLS isolation are each proven both ways. All 14 ACs are `verified` in COVERAGE.

The **3-lens panel earned its keep**: it caught a **MAJOR** the in-slice SDET + Overwatch gates had rationalized away — BUG-019-001's `encrypt=false` default was a silent in-transit-DB-TLS downgrade across three `mssql` pools. `/pr-fix` restored the secure default (encryption stays on; the local self-signed Docker cert is handled via `trustServerCertificate=true`), updated the regression test, and corrected the prod-TLS ops note. Two non-gating items were dispositioned as retro-019 follow-ups (dead `defaultRequestDueDays` fallback + dual SQL/TS predicate cleanup; duplicated cadence-default constants + `ReminderSetting` singleton uniqueness).

## Next

- **Next ready epic:** EPIC-020 — accountant dashboard home (consumes the overdue state this engine produces; depends_on EPIC-016 ✅, EPIC-017 ✅, EPIC-019 ✅ all satisfied). Run `/orchestrate EPIC-020`.
- Phase-4 remaining: EPIC-020 (dashboard home) → EPIC-021 (client/engagement nav) → EPIC-022 (admin settings & identity) → EPIC-023 (audit-trail read surface — Phase-4 closer).
