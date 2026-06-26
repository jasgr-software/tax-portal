# RETRO-018 — Email digest fallback (EPIC-018)

**Brief:** BRIEF-018 · **Branch:** `brief-018-email-digest-fallback` · **Close-prep:** 2026-06-26

## Scorecard (9 gates)

| # | Gate | Result |
| - | ---- | ------ |
| 1 | Per-task submission gates | 8/8 |
| 2 | SDET Review | 8/8 approved |
| 3 | Overwatch Audit | 1 blocking + 4 advisory — all dispositioned (fix-forward 007/008) |
| 4 | IO Design scan | PASS (composer content-free by construction; both seams reused; scope clean) |
| 5 | Container Smoke | PASS (clean-volume AuditEvent + BRIEF-018 cols bootstrap from migrations alone; no BUG) |
| 6 | SDET Acceptance-validation | APPROVE (12/12 ACs; 3 HARD properties proven) |
| 7 | SDET CI gate | PASS (1 timeout = pre-existing BUG-013-002; 0 BRIEF-018 regressions) |
| 8 | Post-merge CI | pending Close-finalize |
| 9 | Post-merge staging smoke | N/A (brief does not deploy) |

## Concrete gate failures (the retro promotion bar)

**None.** No task was rejected at SDET Review; no gate went red requiring a code fix. The Overwatch findings were quality interventions dispositioned as fix-forward tasks (007 ops-docs, 008 hardening), not gate failures. Per ENGINE § Retro Finding Classification, nothing clears the promotion bar this slice.

## Findings & dispositions

### Overwatch Audit (dispositioned, all resolved pre-merge)
- **#1 ops-docs stale (BLOCKING)** — `gated-path-fix`-adjacent (ops docs are `.implementation/`); resolved by TASK-018-007 (devops). The recurring lesson: a docker-compose env-var change carries a mandatory ops-doc obligation (CLAUDE.md § DevOps / § SDET). A `[webapp-developer]` adding it without the ops-doc update tripped the SDET reject-if-stale criterion. Resolved in-slice.
- **#2 cross-role compose edit** — `acknowledged`. Bless-in-place via devops ownership (correct, additive change; revert would waste sound work). Process note: cross-domain edits should be a devops micro-dispatch or IO-authorized exception up front.
- **#5 PII in send-failure log (elevated to in-slice fix)** — `gated-path-fix`. The hard no-PII-logging constraint (ADR-025 §4 / ADR-017 / CS-GEN-001) was at risk from `err.message` (SMTP rejections embed recipient email). Fixed forward (TASK-018-008) with a regression test. **Lesson: error messages are a PII egress channel** — category-only logging on any outbound-transport catch.
- **#4 test seams on a production signature** — `gated-path-fix`. `_emailProvider`/`_userIdFilter` made provably inert outside `NODE_ENV==='test'`. Lesson: underscore convention is not an enforcement boundary on a security-sensitive path.
- **#3 inaccurate security comment** — `acknowledged`. Corrected to the actual defense-in-depth posture.

### Smoke / Validate (pre-existing env — observations, not BRIEF-018 defects)
- **Mailhog port vars absent from `.env.local`/`.env.example`** — `ungated-fix` (added to openRetroItems). Aligns with `local-stack-bringup-quirks`.
- **Host-side SQL Server TLS quirk** (tedious v18 self-signed-cert; affects `prisma migrate deploy`, `@smoke` subset, some host-side integration tests) — `acknowledged`. Container CI + prod unaffected; the authoritative CI is the PR's container run. DX debt.
- **BUG-013-002** (YAML-oracle WSL2 timeout) reconfirmed — `acknowledged`, already tracked.

### Observations (no action)
- TASK-018-003/-004 had `[ ]` Tests/DoD checkboxes ticked by the SDET on close; TASK-018-005 `Attempt count: 1` without a documented failed run. No gate impact.

## Rule sunset / tracker
- **Cross-surface-parity sunset (CLAUDE.md § Platform-frontend scope):** BRIEF-018 produced **zero** parity findings. Overwatch notes BRIEF-016 and BRIEF-017 were also clean → the **3-consecutive-clean keep/remove condition may now be met**. Recommendation: surface the cross-surface-parity default rule for a keep/remove decision. (Carried for the next Close-prep / user ratification — Overwatch-flagged, not auto-removed.)

## Post-Merge Addendum
_(to be appended at Close-finalize)_
