---
brief: BRIEF-007
status: backlog
assigned_to: webapp-developer
updated_by: io
depends_on: none
impl: developer
e2e_required: "no"
started_at: —
completed_at: —
complexity_estimate: —
complexity_actual: —
introduces_gate: "no"
acceptance_criteria: "none (justification: pre-existing environmental test-infra defect; no new product behavior)"
upstream_refs: "ADR-021, EPIC-007"
code_standards: "none"
severity: low
---

# BUG-007-001: EPIC-007 mock AV scanner does not resolve pending→active / pending→infected in this environment

## Summary

Two EPIC-007 upload-pipeline scan-gate integration tests fail in the current local/CI container environment:

- `pending → active` (clean scan promotes)
- `pending → infected` (threat detected withholds)

in `packages/db/src/document.upload-pipeline.rls.test.ts`.

## Discovery

Surfaced during **BRIEF-013 / TASK-013-002** SDET review (2026-06-23). The webapp-developer flagged it; the
SDET **independently verified it is pre-existing, not a BRIEF-013 regression**:

- Stashed the BRIEF-013 working changes and ran the upload-pipeline suite on base commit `a1d62b8`:
  **2 failed | 18 passed** with the **identical failure mode**.
- Confirmed the TASK-013-002 diff to `packages/db/src/repositories/document.ts` is **additive only** — the
  scan-gate path (`completeUpload` / `validateUploadedBytes` / `getFileScanner` / promotion helpers) is
  byte-stable, zero overlap.

## Root cause (suspected)

The mock AV scanner seam does not deterministically resolve a `pending` document to `active`/`infected` in
this container environment — an environmental / test-infra timing or wiring issue in the EPIC-007 scanner mock
(`getFileScanner()` seam), NOT a defect in the document pipeline's promotion logic (which is byte-stable and
whose other 18 tests pass).

## Scope

- **Not a BRIEF-013 regression** — confirmed pre-existing on base `a1d62b8`.
- **Does not block** TASK-013-002 approval (it was approved).
- Belongs to the EPIC-007 scan-gate test infra (ADR-021). Tracked here so it is not silently lost across
  slices and surfaces at BRIEF-013 Smoke / Close-prep.

## Severity

**Low** — environmental test-infra defect; the production promotion logic is byte-stable and otherwise green.
The other 18 upload-pipeline tests pass. No user-facing behavior is implicated.

## Reproduction

```
git checkout a1d62b8
docker compose up -d        # SQL Server + Azurite
pnpm --filter @tax-portal/db test -- document.upload-pipeline.rls.test.ts
# → 2 failed (pending→active, pending→infected) | 18 passed
```

## Regression test

Already exists — the two failing tests ARE the regression coverage. A fix must turn them green without
weakening the scan-before-available gate (ADR-021 fail-closed invariant).

## Disposition

Recorded at BRIEF-013 Dispatch (2026-06-23) per SDET recommendation. Fix is **out of BRIEF-013 scope** (this
slice does not touch the scan gate). Carry to a follow-up; re-confirm at BRIEF-013 Smoke that it is the same
pre-existing 2-test environmental failure and not a new manifestation.

## Work Log

- 2026-06-23 [io] Created from the TASK-013-002 SDET review flag. Pre-existing on `a1d62b8` (SDET-verified);
  not a BRIEF-013 regression. Status `backlog`, severity low, owned by EPIC-007 scan-gate test infra (ADR-021).
  What's next: fix is out of BRIEF-013 scope; re-confirm at Smoke it's the same pre-existing failure. Blockers: none.
