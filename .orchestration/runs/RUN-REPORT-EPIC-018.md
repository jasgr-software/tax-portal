# Conductor run report — EPIC-018 — 2026-06-26

**Terminal status:** delivered
**Epic:** EPIC-018 — Email digest fallback (content-free nudge, daily cap, accountant self-suppression, client default-on) (phase 4)
**Brief:** BRIEF-018 — `.implementation/briefs/BRIEF-018-email-digest-fallback.md`

## Pipeline

| Phase | Result |
|---|---|
| Select | EPIC-018 (pinned; the next ready Phase-4 slice — `depends_on` EPIC-016 ✅) |
| Gate | GO — readiness + engine-clear PASS; AC-testability PASS (12 AC resolve to testable REQ-MSG-008/009/010/011 text) |
| Compose | BRIEF-018 written; AC: 12; scenarios: gherkin |
| Implement | PR #106 opened; 6 build tasks (001–006) + 1 devops ops-doc fix (007) + 1 gated-path hardening (008) |
| Standards-review | approve · required 0 · recommended 0 · experimental 0 · drafted 0 |
| Review | request-changes (advisory) · blocker 0 · major 1 · minor 5 · nit 3 |
| Fix | `/pr-fix` addressed all 9 findings (commit `ce16fa7`); 7 threads resolved; CI green |
| Merge/Finalize | merged `2f4b6d0b8932b96126f931800e05715b16134f92` (squash, reviewed lane, no `--admin`/toggle); engine Close-finalize done — gate 8 post-merge CI green, `awaitingMerge` cleared |
| Validate | signed-off — AC verified: AC-MSG-008-01/-02/-03, 009-01/-02/-03, 010-01/-02/-03/-04, 011-01/-02 (all 12) |
| Verdict log | 16 gate records snapshotted → `runs/gate-history.jsonl` (240 total) · drift: none |

## UI Demo

`docs/demos/EPIC-018/` — AC-tagged screenshots, both surfaces (jane-accountant suppression on `apps/admin`; sarah-returning-client nudge→sign-in + default-on on `apps/portal`), captured at the `@demo` walkthrough. The `/pr-fix` pass consolidated three byte-identical portal PNGs (04/05/06) into one combined-evidence file after the panel flagged the duplication. Non-gating (the tier-6 e2e is the gate).

## Phase closeout

n/a (phase in progress — 3/8 epics of Phase 4 delivered: EPIC-016, EPIC-017, EPIC-018). EPIC-023 is the Phase-4 closer; the `@video` walkthrough obligation rides that slice, not this one.

## Outcome

The secondary email channel shipped: a **content-free** daily email nudge that draws a recipient back to the portal (only "new activity" + a sign-in link — never client/document/message detail), **batched to at most one per recipient per day** (enforced on a `User.lastNudgeSentAt` watermark), with **accountant self-suppression** (an `apps/admin` setting; feed unaffected, clients unaffected) and **client default-on** (DB `emailNudgeEnabled BIT DEFAULT 1`, no opt-in). It digests the EPIC-016 `Notification` feed through the ADR-025 `packages/email` seam (SMTP → Mailhog in the POC; real ESP deferred to Phase 5 per ADR-023) — neither the feed nor the transport was rebuilt. RLS was deliberately out of scope (own-row isolation via the request-pool `WHERE clerkId = ctx.clerkUserId`; no new scoped table).

All three HARD tier-3 properties were proven two-sided / multi-way (content-free body, daily cap, suppression three-ways). The independent `/pr-review` panel earned its keep again: it caught a **real watermark-after-send double-send bug** that the daily-cap hard gate missed (GATE2 tested cross-window counts, not per-run send↔watermark atomicity) — fixed in-PR with a split try/catch + regression test. The panel's lone major (test-only seams on the production `dispatchDailyDigest` signature) was also resolved (`_userIdFilter` + the `NODE_ENV` gate removed; `_emailProvider` promoted to plain DI).

## Next

- **Next ready epic:** EPIC-019 — overdue detection & reminder engine (`depends_on` EPIC-016 ✅). Run `/orchestrate EPIC-019`.
- **Phase-4 tally:** EPIC-016/-017/-018 delivered = 3/8; EPIC-019..023 `planned`. Coverage totals: 246 verified / 63 planned (309 placed).
- **Carried follow-ups (non-blocking):** cross-surface-parity sunset rule now 3-consecutive-clean (BRIEF-016/-017/-018) — keep/remove ratification due at the next Close-prep retro; Mailhog `.env.local` port-var convenience follow-up + host-side Prisma/e2e TLS DX debt (RETRO-018); the digest/dispatch send↔watermark-atomicity test lesson logged for future dispatch slices.
