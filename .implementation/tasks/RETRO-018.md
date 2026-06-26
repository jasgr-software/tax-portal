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

## Post-Merge Addendum (Close-finalize — 2026-06-26)

**PR #106 MERGED** to `main` via squash → merge SHA **`2f4b6d0b8932b96126f931800e05715b16134f92`**.

### Gate 8 — Post-merge CI: PASS
CI workflow run `28264466002` on `2f4b6d0` **success**: `lint-and-typecheck` ✅, `security-scan` ✅, `test-portal` ✅, `test-admin` ✅ (+ CodeQL ✅). Gate 9 (staging smoke) **N/A** — `brief_deploys: no`. Zero active `BUG-018-POST-*`.

### Reviewed-lane outcome (Conductor)
Standards-review APPROVE (0 required violations) → `/pr-review` panel **request-changes (1 major + 5 minor + 3 nit)** → `/pr-fix` addressed **all 9** (commit `ce16fa7`), all 7 panel threads resolved, CI green → merged on green required CI, plain `--squash`, no `--admin`, no protection toggle, no workflow-file LGTM hold.

### Fixer dispositions (folded into the merged squash)
- **Real watermark-after-send double-send bug fixed** (split try/catch so `recordNudgeSent` ordering cannot double-send; regression test added). **See gate-gap learning below.**
- Removed the `_userIdFilter` test seam + the `NODE_ENV` gate; promoted `_emailProvider` → a plain `emailProvider` DI param — supersedes TASK-018-008 #4's seam-gating with cleaner constructor-style DI (panel-preferred; same prod-safety outcome, less surface).
- Removed the unused `composeDigestNudge` `role` param (the dispatcher selects the sign-in URL before calling, so the param was dead).
- Hardened the dev trigger route: in-handler ACCOUNTANT check, `now` made test-only, generic 500 (no detail leakage).
- De-duplicated the page identity guard (consolidated defense-in-depth read).
- Consolidated 3 byte-identical demo PNGs into one combined evidence file.
- **Flipped `docker-compose.yml` `ENABLE_DIGEST_TRIGGER` default `true → false`** — now must be explicitly set for e2e runs that exercise the trigger (stronger fail-closed posture than the slice shipped).

### Gate-gap learning (honest retro)
The **daily-cap hard gate (GATE2)** proved N→1 same-day and →1 next-day, but **missed a double-send path** that the `/pr-review` panel caught (a watermark/`recordNudgeSent` ordering bug). The hard gate tested the *count across windows* but not *send↔watermark atomicity within a single dispatch run when send succeeds*. **Lesson for future digest/dispatch slices:** the daily-cap test matrix should assert send-and-watermark are atomic per recipient (no second send for the same recipient within one dispatch invocation under partial-failure/ordering perturbation), not only the cross-window count. Category: gate-design — observation; the independent panel was the backstop that caught it pre-merge (consistent with the `validation-oracle-independent-of-code` memory).

### Post-merge doc-drift (minor — for the Conductor docs-lane close-out PR)
The fixer flipped the `ENABLE_DIGEST_TRIGGER` compose default `true → false`; `.implementation/operations/inventory.md` + `runbook.md` (TASK-018-007) describe the default as `true` in local/e2e. One-line update to reflect the flipped default (unset/false; must be explicitly set for trigger-exercising e2e). Non-blocking; fold into the docs-lane close-out.

### Final ledger state
`pnpm task post-merge --pr 106 --sha 2f4b6d0b8932b96126f931800e05715b16134f92 --role io` clears `awaitingMerge`. Slice complete.
