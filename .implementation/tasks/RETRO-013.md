# RETRO-013 — BRIEF-013 Secure File Exchange

**Slice:** EPIC-013 secure file exchange (Phase 3).
**Branch:** `brief-013-secure-file-exchange`.
**Date:** 2026-06-24 (Close-prep).

---

## Outcome

All 13 AC delivered + verified; all four HARD extra_gates green; container smoke + acceptance-validation + CI
(modulo carried flakes) + quality audit all PASS. Slice in PR limbo at handoff.

## Concrete gate failures (the only findings that clear the retro promotion bar)

Per ENGINE.md § Retro Finding Classification, only concrete quality-gate failures are classified. Three
occurred this slice; all were caught by the pipeline and fixed-forward — they are recorded for the trend, not
as open action items (all resolved in-slice).

1. **[gated-path-fix — RESOLVED in-slice] DevOps docs-sync miss (TASK-013-003 → BUG-013-001).** An
   `apps/admin` feature task modified `docker-compose.yml` (admin storage env) without updating
   `.implementation/operations/inventory.md` + `runbook.md`. SDET rejected per CLAUDE.md § DevOps. Fixed
   docs-only; resolved. **Trend note:** when a non-DevOps task touches compose/env, the docs-sync obligation is
   easy to miss — the IO dispatch prompt now flags it preemptively on any task that *might* touch infra (done
   for tasks 004/005/007). Keep doing this.

2. **[gated-path-fix — RESOLVED in-slice] AC-FILE-009-03 "accessible" half unproven + cross-app spec not in the
   gate (TASK-013-005 → BUG-013-005-001).** The tier-3 test proved version *retained+listed* but not
   *downloadable*; and `both-party-download-cross-app.spec.ts` passed in isolation but wasn't wired into
   `pnpm e2e:cross-app` (silently omitted from the ADR-010 gate). Both fixed; resolved. **Trend note:** "a test
   that isn't in the gate isn't a gate" — good SDET catch; the brief's wording ("retained AND remains
   accessible") is a two-part obligation and a test must cover both halves.

3. **[gated-path-fix — RESOLVED in-slice] ADR-019 download-audit obligation unmet (Validate Gate A/C →
   TASK-013-007).** Upload/replace/folder paths emitted audit events; the download path did not. Caught at
   Validate (not at the TASK-013-005 task review). Fixed-forward; resolved. **Trend note:** adherence
   obligations stated in the brief Scope/Constraints (not as numbered AC) are review-blind-spots — the SDET
   acceptance-validation gate is the right backstop, and it worked. Consider a per-surface "all access paths
   emit audit events" checklist item for future file/messaging slices.

## Overwatch advisories (dispositioned — IO is the authority)

1. **[acknowledged] Backlog-triage evidence absent from the Plan event.** The Plan-phase event didn't record
   the `pnpm task report` triage of the 18 `openRetroItems`. Spirit was met (awaitingMerge empty at
   slice-start; no bare `deferred` items). Procedural-evidence improvement only — recorded here; no rule change.

2. **[acknowledged] Prior-epic PNG byte-churn (retro-012-012 recurrence).** The `@demo` run rewrote 56
   prior-epic PNGs as residual churn. Disposition: hard pre-staging requirement — `git checkout -- docs/demos/`
   before any `git add`, so only additive `docs/demos/EPIC-013/` rides the PR. Applied at Close-prep staging.
   This is the Nth recurrence of the same `@demo` default-output-path issue; the standing fix
   (retro-012-012: scope each `@demo` spec's output to its own EPIC dir) is honored by the NEW specs but the
   *pre-existing* specs still churn — carry retro-012-012 as the durable fix.

## Observations (no gate failure — not promoted)

- **(a)** Unused `originalV1StorageKey` const in `document-version.replace.integration.test.ts` — dead code;
  ride the next `packages/db` task touching that file.
- **(b)** Attempt-count convention divergence (TASK-013-002 `Attempt count: 0` vs -001's `1`) — cosmetic.
- **(c)** Uniform `complexity_actual: 4` across 5 of 6 feature tasks (007 was 2, 006 was 2) — signal only; the
  metric is honest (estimates varied), the cluster reflects genuinely similar-weight tasks.
- **(d)** First clean BRIEF-013 metric-integrity sweep — **no `completed_at` < `started_at` clock-inversion**
  (the recurring retro-012-014 / 9th-recurrence finding did NOT recur). Positive trend; worth noting the
  inversion has not recurred since the developer-spec guidance.

## Rule-sunset check (ENGINE.md § Rule Sunset)

- **Platform-frontend cross-surface-parity rule** (CLAUDE.md § Platform-frontend scope) — **triggered + relied
  upon** this slice (download mirrored admin↔portal; TASK-013-005 mirror discipline; TASK-013-004 portal-no-
  affordance negative; TASK-013-007 mirror audit). Keep — not a sunset candidate; this slice is a strong case for it.

## Carried bugs

- **BUG-007-001** (pre-existing mock-scanner env, low) — re-confirmed unchanged at Smoke; out of scope.
- **BUG-013-002** (YAML-oracle timeout under corpus growth, low) — carried; `scripts/` follow-up.

## Post-Merge Addendum

_(written at Close-finalize)_
