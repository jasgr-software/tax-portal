---
brief: BRIEF-LOE-012
status: done
assigned_to: devops
updated_by: sdet
found_in: "TASK-LOE-012-002 SDET review"
category: code-quality
severity: major
started_at: 2026-06-22T14:04:56.000Z
completed_at: 2026-06-22T14:36:46.000Z
---

# BUG-LOE-012-001: Cyrillic homoglyph identifiers + 9 new tsc errors in TASK-LOE-012-002

## Description

Two hard-reject blockers found during SDET review of TASK-LOE-012-002.

### Blocker 1 — Cyrillic homoglyph identifiers in production code and schema (hard REJECT)

Three TypeScript identifier names contain **Cyrillic characters** rather than Latin ASCII:

| Identifier (as rendered) | Actual codepoints | Files affected |
| --- | --- | --- |
| `sdетValidation` | `sd` + U+0435 (CYRILLIC SMALL LETTER IE) + U+0442 (CYRILLIC SMALL LETTER TE) + `Validation` | `state-store.ts` L72, `task.ts` L111, `task.test.ts` L2720 |
| `sdетCiGate` | same Cyrillic `ет` | `state-store.ts` L73, `task.ts` L112, `task.test.ts` L2721 |
| `sdетQualityAudit` | same Cyrillic `ет` | `state-store.ts` L74, `task.ts` L113, `task.test.ts` L2722 |

**Evidence command:**
```
python3 -c "
with open('scripts/state-store.ts', 'rb') as f: content = f.read()
import re
for m in re.finditer(b'sd\xd0\xb5\xd1\x82', content):
    print(f'Position {m.start()}: {content[m.start()-2:m.end()+20]}')
"
```

**Severity:** The contamination is not superficial. The Cyrillic `ет` also appears in:
- The vendored JSON Schema property-name lists (`state-store.ts` ~L10796, L10816, L22557, L22577) — so schema validation will accept/require Cyrillic-keyed JSON.
- Runtime serialization paths (`renderReport`, `migrate` at L40409, L50123, L50216, L50311) — so live `state.json` files written to disk will carry Cyrillic-keyed fields.
- The test assertions at `task.test.ts` L2730-2732, 2816-2818 — the tests confirm Cyrillic keys round-trip, not that ASCII keys are used.

This is a **silent maintainability and data-integrity hazard**: the identifiers look correct in most editors and terminals but are not ASCII. Any downstream tool that processes `state.json` expecting `sdetValidation` (ASCII) will silently miss the field. The JSON Schema will reject a correctly-named field.

**Reproducible:** `grep -Pn "[^\x00-\x7F]" scripts/state-store.ts scripts/task.ts scripts/task.test.ts`

### Blocker 2 — 9 new TypeScript errors under tsconfig.scripts.json

**Baseline (origin/main, tracked files stashed):** 24 errors.
**Branch:** 33 errors. **Delta: +9 new errors.**

Developer claimed "+7 new exactOptionalPropertyTypes assignments" — the actual count is +9, and the new errors include types beyond exactOptionalPropertyTypes:

New errors introduced by this branch:
- `scripts/state-store.ts(38,1): TS6133 — 'crypto' declared but never read` (unused import)
- `scripts/task.test.ts(2377,52): TS2339 — Property 'fm' does not exist on discriminated union`
- `scripts/task.test.ts(2876,22): TS2339 — same`
- `scripts/task.test.ts(2877,22): TS2339 — same`
- `scripts/task.ts(1026,17): TS2532 — Object is possibly 'undefined'`
- `scripts/task.ts(2937,5) through (3035,...): TS2412 exactOptionalPropertyTypes` (multiple)

**Note on canonical gate scope:** `pnpm type-check` covers only `packages/**` and `apps/**` — `scripts/` is outside the canonical gate. The developer's gate evidence ("`pnpm type-check` passes") is accurate but does not catch `tsconfig.scripts.json` errors. The project runs `npx tsc --noEmit -p tsconfig.scripts.json` as a secondary check. Adding 9 new errors to this baseline is a regression.

## Steps to Reproduce

```bash
# Blocker 1
grep -Pn "[^\x00-\x7F]" scripts/state-store.ts scripts/task.ts scripts/task.test.ts

# Blocker 2
git stash -- scripts/task.ts scripts/task.test.ts
npx tsc --noEmit -p tsconfig.scripts.json 2>&1 | grep "error TS" | wc -l   # expect 24
git stash pop
npx tsc --noEmit -p tsconfig.scripts.json 2>&1 | grep "error TS" | wc -l   # actual 33
```

## Expected vs Actual

**Expected:** All identifiers are pure ASCII (`sdetValidation`, `sdetCiGate`, `sdetQualityAudit`). Serialized JSON keys on disk are ASCII. Zero new tsc errors under `tsconfig.scripts.json`.

**Actual:** Three field names contain Cyrillic characters throughout production code, schema, serialization paths, and tests. 9 new tsc errors added.

## Fix Guidance

### Fix 1 — Rename all `sdет*` to `sdet*` (pure ASCII)

In ALL three files, replace every occurrence of the Cyrillic `sdет` prefix with the ASCII `sdet`:
- `scripts/state-store.ts`: `sdетValidation` → `sdetValidation`, `sdетCiGate` → `sdetCiGate`, `sdетQualityAudit` → `sdetQualityAudit` (in the interface definition, JSON Schema property names, JSON Schema required arrays, `serializeState`, `renderReport`, and all other uses)
- `scripts/task.ts`: same renames in the `ParsedArgs` interface, `parseArgs` function, and the `merge-checkpoint` dispatch block
- `scripts/task.test.ts`: same renames in all test assertions and fixture objects

Use a byte-level search/replace tool — do NOT trust a text editor that renders the Cyrillic characters as Latin. Verify with `grep -Pn "[^\x00-\x7F]"` after the fix returns no hits on identifier names.

Also rename the `--sdet-validation`, `--sdet-ci-gate`, `--sdet-quality-audit` CLI flags from their current Cyrillic-seeded internal names to the ASCII equivalents.

### Fix 2 — Fix the 9 new tsc errors

1. `state-store.ts(38)`: Remove the unused `crypto` import.
2. `task.test.ts(2377, 2876, 2877)`: Add discriminant guard (`if (!extracted.found) return;` or similar) before accessing `extracted.fm`.
3. `task.ts(1026)`: Add a non-null assertion or null guard for the possibly-undefined value.
4. `task.ts(2937-3035)` exactOptionalPropertyTypes group: The developer's partial mitigation pattern (only spreading defined values) was applied to the new commands but not the old ones. The `parseArgs` return type `ParsedArgs` sets all optional fields as `T | undefined`. The called functions accept `{ field?: T }` with `exactOptionalPropertyTypes: true`. Fix: either spread only defined values (as the new dispatch cases do) or add `| undefined` to the target interface fields — be consistent. The new commands added for -002 do apply the spread-guard correctly; the remaining errors in the `task.ts` block are in the OLDER Phase-1 dispatch path that was not updated to match.

## Testability

These are compile-time and source-level defects — no separate testability section needed. The fix is verified by:
1. `grep -Pn "[^\x00-\x7F]" scripts/state-store.ts scripts/task.ts scripts/task.test.ts` returns no Cyrillic hits.
2. `npx tsc --noEmit -p tsconfig.scripts.json 2>&1 | grep "error TS" | wc -l` equals 24 (baseline, no regression).
3. `npx vitest run scripts/task.test.ts scripts/state-store.test.ts` still passes 179/179.

## Work Log

- 2026-06-22 [sdet] Filed during TASK-LOE-012-002 review | Fix: rename sdет* → sdet* in all 3 files + fix 9 new tsc errors | Blockers: none
- 2026-06-22 [devops] Fix applied. Blocker 1: python3 byte-replace of Cyrillic `sd\xd0\xb5\xd1\x82` → ASCII `sdet` across 4 files (state-store.ts 18, task.ts 21, task.test.ts 9, state-store.test.ts 6 — also had Cyrillic); confirmed zero occurrences via python3 re.finditer. Interface fields, JSON Schema property-name arrays, required arrays, serializeState, renderReport, migrate, test fixtures, and assertions all now use ASCII `sdetValidation`/`sdetCiGate`/`sdetQualityAudit`. Blocker 2: removed unused `crypto` import (state-store.ts:38); added `if (!extracted.found) return;` discriminant guards before `.fm` access (task.test.ts L2377, 2876); guarded `m[1]` (task.ts L1026); fixed Phase-2 parseArgs switch cases to only assign when `next !== undefined` (`--to`, `--container-smoke`, `--sdet-*`) and to not set `result.pr` when `isNaN(prNum)`. Evidence: tsc-scripts errors 33 → 22 (below 24 baseline); vitest 179/179; lint PASS; type-check PASS; zero new deps. Final disposition left to SDET. | What's next: SDET closes/accepts bug | Blockers: none
- 2026-06-22 [sdet] RESOLVED — both blockers independently verified in re-review. Blocker 1: python3 byte-pattern `sd\xd0\xb5\xd1\x82` returns ZERO hits across all 4 files; ASCII `sdetValidation`/`sdetCiGate`/`sdetQualityAudit` confirmed in schema property arrays, interface, serialization, and all test assertions. Blocker 2: tsc-scripts re-stash baseline = 24 errors confirmed; branch = 22 errors (delta -2, improvement); all 22 remaining errors are pre-existing pattern types (TS2412/TS2379), no new error types. TASK-LOE-012-002 approved and closed. | Blockers: none
