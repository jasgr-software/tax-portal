# RETRO-012 — BRIEF-012 / EPIC-012 (Engagement creation paths & multi-participant engagements)

**Outcome:** all 6 tasks `done`; 20/20 AC validated (SDET acceptance APPROVE); the 4 slice gates PASS; PR raised
to `awaitingMerge`. **Brief-type:** feature · **deploys:** no. **Reviewed lane** (no engine/workflow files).

## Scorecard (the 9 quality gates)

| # | Gate | Result |
|---|---|---|
| 1 | Per-task submission gates | 6/6 PASS |
| 2 | SDET Review | 6/6 approved |
| 3 | Overwatch Audit | 0 blocking, 7 observations (all dispositioned) |
| 4 | IO Design scan | PASS (additive RLS predicate; two-surface split honors ADR-006) |
| 5 | Container Smoke | PASS (both apps healthy + load; 19 BRIEF-012 e2e green on container stack) |
| 6 | SDET Acceptance-validation | APPROVE (20/20 AC tagged + passing; 4 hard extra_gates proven) |
| 7 | SDET CI gate | PASS (lint/type-check/build; db 32/32, portal 231/231, admin 348/348) |
| 8 | Post-merge CI | pending (Close-finalize) |
| 9 | Post-merge staging smoke | N/A (brief_deploys: no) |

## Findings classification (concrete gate failures only — ENGINE § Retro Finding Classification)

**No finding cleared the retro promotion bar (no concrete quality-gate failure occurred this slice).** The
following are observations (no action items, no rule changes):

- **`acknowledged`** — DECISION-E multi-hop contact resolution: raised as **OQ-012-01** (`raised-upstream`); a
  durable user-profile-contact design is a Phase-5 product/architecture call. Not a gate failure.
- **observation** — `parseSqlServerUrl` helper duplicated across the 4 BRIEF-012 e2e specs (and prior specs).
  Candidate for an `apps/*/e2e/utils/` extraction on the next e2e-touching task. Cosmetic; no gate failure.
- **observation** — `getAccountantIdentity()` duplicated across admin server-action files (now 3+ copies).
  Candidate for a shared `apps/admin/src/lib` (or `packages/auth`) helper extraction. Pre-existing pattern; no
  gate failure.
- **observation** — TASK-012-004 left its "Tests to Write First" / "Definition of Done" checkboxes unticked at
  `review` (the **Quality Gates** mandatory checklist was correctly ticked). Cosmetic; SDET confirmed all items
  satisfied. No rejection warranted (the mandatory-box rule is the Quality Gates checklist).

## Rule Sunset (ENGINE § Rule Sunset — rules not triggered in the last 3 slices)

- **Cross-surface-parity sunset counter (CLAUDE.md § Platform-frontend scope):** this slice was a **genuine
  two-surface slice** (portal returning-client request + participant view; admin initiate + duplicate guard +
  invite) — the rule was **load-bearing**, not a no-op. The prior 3-of-3 clean-pass sunset trip (RETRO-009) does
  **not** extend; **recommend KEEP** and reset the counter. (Decision is the user's/Overwatch's per the prior
  carried item.)
- Autonomy Ceiling `--no-verify` clause + `PushNotification` spam-loop guard (carried sunset candidates,
  retro-012-009): again **not triggered** this slice. Carry the keep/remove recommendation forward; no new data.

## Notes

- **Highest-blast-radius change handled safely:** the live `sec.fn_engagement_access` CLIENT-branch extension
  (DECISION-D) kept the owner branch byte-identical and added participant access as a scoped `OR`; the HARD
  tier-3 RLS test proves both directions + the AC-AUTH-003 owner no-regression. The new `EngagementParticipant`
  scoped table got its own policy (CS-SQL-001).
- **DECISION-A (request-envelope reuse)** minimized new surface — no schema nullability change to
  `engagementRequestId`, no new `EngagementService` join; both creation paths ride tested machinery.
- **Demo `e2e:demo` prior-epic PNG churn (retro-012-012) recurred** — reverted manually at Close-prep (the
  standing pattern). The per-spec output-path scoping fix remains the open follow-up.
